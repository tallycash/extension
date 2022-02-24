import browser from "webextension-polyfill"
import { alias, wrapStore } from "webext-redux"
import { configureStore, isPlain, Middleware } from "@reduxjs/toolkit"
import devToolsEnhancer from "remote-redux-devtools"
import { PermissionRequest } from "@tallyho/provider-bridge-shared"

import { decodeJSON, encodeJSON, normalizeEVMAddress } from "./lib/utils"

import {
  BaseService,
  ChainService,
  EnrichmentService,
  IndexingService,
  InternalEthereumProviderService,
  KeyringService,
  NameService,
  PreferenceService,
  ProviderBridgeService,
  TelemetryService,
  ServiceCreatorFunction,
  LedgerService,
  SigningService,
} from "./services"

import { EIP712TypedData, HexString, KeyringTypes } from "./types"
import { SignedEVMTransaction } from "./networks"
import { AddressOnNetwork, NameOnNetwork } from "./accounts"

import rootReducer from "./redux-slices"
import {
  loadAccount,
  blockSeen,
  updateAccountBalance,
  updateENSName,
  updateENSAvatar,
} from "./redux-slices/accounts"
import { activityEncountered } from "./redux-slices/activities"
import { assetsLoaded, newPricePoint } from "./redux-slices/assets"
import {
  emitter as keyringSliceEmitter,
  keyringLocked,
  keyringUnlocked,
  updateKeyrings,
  setKeyringToVerify,
} from "./redux-slices/keyrings"
import {
  initializationLoadingTimeHitLimit,
  emitter as uiSliceEmitter,
  setDefaultWallet,
  setSelectedAccount,
  setNewSelectedAccount,
} from "./redux-slices/ui"
import {
  estimatedFeesPerGas,
  emitter as transactionConstructionSliceEmitter,
  transactionRequest,
  signed,
  updateTransactionOptions,
  clearTransactionState,
  selectDefaultNetworkFeeSettings,
  TransactionConstructionStatus,
} from "./redux-slices/transaction-construction"
import { allAliases } from "./redux-slices/utils"
import {
  requestPermission,
  emitter as providerBridgeSliceEmitter,
  initializeAllowedPages,
} from "./redux-slices/dapp-permission"
import logger from "./lib/logger"
import {
  signedTypedData,
  signingSliceEmitter,
  SignTypedDataRequest,
  typedDataRequest,
} from "./redux-slices/signing"
import {
  resetLedgerState,
  setDeviceConnectionStatus,
} from "./redux-slices/ledger"
import { ETHEREUM } from "./constants"
import { HIDE_IMPORT_LEDGER } from "./features/features"
import { SignatureResponse } from "./services/signing"

// This sanitizer runs on store and action data before serializing for remote
// redux devtools. The goal is to end up with an object that is directly
// JSON-serializable and deserializable; the remote end will display the
// resulting objects without additional processing or decoding logic.
const devToolsSanitizer = (input: unknown) => {
  switch (typeof input) {
    // We can make use of encodeJSON instead of recursively looping through
    // the input
    case "bigint":
    case "object":
      return JSON.parse(encodeJSON(input))
    // We only need to sanitize bigints and objects that may or may not contain
    // them.
    default:
      return input
  }
}

// The version of persisted Redux state the extension is expecting. Any previous
// state without this version, or with a lower version, ought to be migrated.
const REDUX_STATE_VERSION = 3

type Migration = (prevState: Record<string, unknown>) => Record<string, unknown>

// An object mapping a version number to a state migration. Each migration for
// version n is expected to take a state consistent with version n-1, and return
// state consistent with version n.
const REDUX_MIGRATIONS: { [version: number]: Migration } = {
  2: (prevState: Record<string, unknown>) => {
    // Migrate the old currentAccount SelectedAccount type to a bare
    // selectedAccount AddressNetwork type. Note the avoidance of imported types
    // so this migration will work in the future, regardless of other code changes
    type BroadAddressNetwork = {
      address: string
      network: Record<string, unknown>
    }
    type OldState = {
      ui: {
        currentAccount?: {
          addressNetwork: BroadAddressNetwork
          truncatedAddress: string
        }
      }
    }
    const newState = { ...prevState }
    const addressNetwork = (prevState as OldState)?.ui?.currentAccount
      ?.addressNetwork
    delete (newState as OldState)?.ui?.currentAccount
    newState.selectedAccount = addressNetwork as BroadAddressNetwork
    return newState
  },
  3: (prevState: Record<string, unknown>) => {
    const { assets, ...newState } = prevState

    // Clear assets collection; these should be immediately repopulated by the
    // IndexingService in startService.
    newState.assets = []

    return newState
  },
}

// Migrate a previous version of the Redux state to that expected by the current
// code base.
function migrateReduxState(
  previousState: Record<string, unknown>,
  previousVersion?: number
): Record<string, unknown> {
  const resolvedVersion = previousVersion ?? 1
  let migratedState: Record<string, unknown> = previousState

  if (resolvedVersion < REDUX_STATE_VERSION) {
    const outstandingMigrations = Object.entries(REDUX_MIGRATIONS)
      .sort()
      .filter(([version]) => parseInt(version, 10) > resolvedVersion)
      .map(([, migration]) => migration)
    migratedState = outstandingMigrations.reduce(
      (state: Record<string, unknown>, migration: Migration) => {
        return migration(state)
      },
      migratedState
    )
  }

  return migratedState
}

const reduxCache: Middleware = (store) => (next) => (action) => {
  const result = next(action)
  const state = store.getState()

  if (process.env.WRITE_REDUX_CACHE === "true") {
    // Browser extension storage supports JSON natively, despite that we have
    // to stringify to preserve BigInts
    browser.storage.local.set({
      state: encodeJSON(state),
      version: REDUX_STATE_VERSION,
    })
  }

  return result
}

// Declared out here so ReduxStoreType can be used in Main.store type
// declaration.
const initializeStore = (preloadedState = {}, main: Main) =>
  configureStore({
    preloadedState,
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => {
      const middleware = getDefaultMiddleware({
        serializableCheck: {
          isSerializable: (value: unknown) =>
            isPlain(value) || typeof value === "bigint",
        },
        thunk: { extraArgument: { main } },
      })

      // It might be tempting to use an array with `...` destructuring, but
      // unfortunately this fails to preserve important type information from
      // `getDefaultMiddleware`. `push` and `pull` preserve the type
      // information in `getDefaultMiddleware`, including adjustments to the
      // dispatch function type, but as a tradeoff nothing added this way can
      // further modify the type signature. For now, that's fine, as these
      // middlewares don't change acceptable dispatch types.
      //
      // Process aliases before all other middleware, and cache the redux store
      // after all middleware gets a chance to run.
      middleware.unshift(alias(allAliases))
      middleware.push(reduxCache)

      return middleware
    },
    devTools: false,
    enhancers:
      process.env.NODE_ENV === "development"
        ? [
            devToolsEnhancer({
              hostname: "localhost",
              port: 8000,
              realtime: true,
              actionSanitizer: devToolsSanitizer,
              stateSanitizer: devToolsSanitizer,
            }),
          ]
        : [],
  })

type ReduxStoreType = ReturnType<typeof initializeStore>

// TODO Rename ReduxService or CoordinationService, move to services/, etc.
export default class Main extends BaseService<never> {
  /**
   * The redux store for the wallet core. Note that the redux store is used to
   * render the UI (via webext-redux), but it is _not_ the source of truth.
   * Services interact with the various external and internal components and
   * create persisted state, and the redux store is simply a view onto those
   * pieces of canonical state.
   */
  store: ReduxStoreType

  static create: ServiceCreatorFunction<never, Main, []> = async () => {
    const preferenceService = PreferenceService.create()
    const chainService = ChainService.create(preferenceService)
    const indexingService = IndexingService.create(
      preferenceService,
      chainService
    )
    const enrichmentService = EnrichmentService.create(
      chainService,
      indexingService
    )
    const keyringService = KeyringService.create()
    const nameService = NameService.create(chainService)
    const internalEthereumProviderService =
      InternalEthereumProviderService.create(chainService, preferenceService)
    const providerBridgeService = ProviderBridgeService.create(
      internalEthereumProviderService,
      preferenceService
    )

    const telemetryService = TelemetryService.create()

    const ledgerService = HIDE_IMPORT_LEDGER
      ? (Promise.resolve(null) as unknown as Promise<LedgerService>)
      : LedgerService.create()

    const signingService = HIDE_IMPORT_LEDGER
      ? (Promise.resolve(null) as unknown as Promise<SigningService>)
      : SigningService.create(keyringService, ledgerService, chainService)

    let savedReduxState = {}
    // Setting READ_REDUX_CACHE to false will start the extension with an empty
    // initial state, which can be useful for development
    if (process.env.READ_REDUX_CACHE === "true") {
      const { state, version } = await browser.storage.local.get([
        "state",
        "version",
      ])

      if (state) {
        const restoredState = decodeJSON(state)
        if (typeof restoredState === "object" && restoredState !== null) {
          // If someone managed to sneak JSON that decodes to typeof "object"
          // but isn't a Record<string, unknown>, there is a very large
          // problem...
          savedReduxState = migrateReduxState(
            restoredState as Record<string, unknown>,
            version || undefined
          )
        } else {
          throw new Error(`Unexpected JSON persisted for state: ${state}`)
        }
      }
    }

    return new this(
      savedReduxState,
      await preferenceService,
      await chainService,
      await enrichmentService,
      await indexingService,
      await keyringService,
      await nameService,
      await internalEthereumProviderService,
      await providerBridgeService,
      await telemetryService,
      await ledgerService,
      await signingService
    )
  }

  private constructor(
    savedReduxState: Record<string, unknown>,
    /**
     * A promise to the preference service, a dependency for most other services.
     * The promise will be resolved when the service is initialized.
     */
    private preferenceService: PreferenceService,
    /**
     * A promise to the chain service, keeping track of base asset balances,
     * transactions, and network status. The promise will be resolved when the
     * service is initialized.
     */
    private chainService: ChainService,
    /**
     *
     */
    private enrichmentService: EnrichmentService,
    /**
     * A promise to the indexing service, keeping track of token balances and
     * prices. The promise will be resolved when the service is initialized.
     */
    private indexingService: IndexingService,
    /**
     * A promise to the keyring service, which stores key material, derives
     * accounts, and signs messagees and transactions. The promise will be
     * resolved when the service is initialized.
     */
    private keyringService: KeyringService,
    /**
     * A promise to the name service, responsible for resolving names to
     * addresses and content.
     */
    private nameService: NameService,
    /**
     * A promise to the internal ethereum provider service, which acts as
     * web3 / ethereum provider for the internal and external dApps to use.
     */
    private internalEthereumProviderService: InternalEthereumProviderService,
    /**
     * A promise to the provider bridge service, handling and validating
     * the communication coming from dApps according to EIP-1193 and some tribal
     * knowledge.
     */
    private providerBridgeService: ProviderBridgeService,
    /**
     * A promise to the telemetry service, which keeps track of extension
     * storage usage and (eventually) other statistics.
     */
    private telemetryService: TelemetryService,

    /**
     * A promise to the Ledger service, handling the communication
     * with attached Ledger device according to ledgerjs examples and some
     * tribal knowledge. ;)
     */
    private ledgerService: LedgerService,

    /**
     * A promise to the signing service which will route operations between the UI
     * and the exact signing services.
     */
    private signingService: SigningService
  ) {
    super({
      initialLoadWaitExpired: {
        schedule: { delayInMinutes: 2.5 },
        handler: () => this.store.dispatch(initializationLoadingTimeHitLimit()),
      },
    })

    // Start up the redux store and set it up for proxying.
    this.store = initializeStore(savedReduxState, this)

    wrapStore(this.store, {
      serializer: encodeJSON,
      deserializer: decodeJSON,
      dispatchResponder: async (
        dispatchResult: Promise<unknown>,
        send: (param: { error: string | null; value: unknown | null }) => void
      ) => {
        try {
          send({
            error: null,
            value: encodeJSON(await dispatchResult),
          })
        } catch (error) {
          logger.error(
            "Error awaiting and dispatching redux store result: ",
            error
          )
          send({
            error: encodeJSON(error),
            value: null,
          })
        }
      },
    })

    this.initializeRedux()
  }

  protected async internalStartService(): Promise<void> {
    await super.internalStartService()

    this.indexingService.started().then(async () => this.chainService.started())

    const servicesToBeStarted = [
      this.preferenceService.startService(),
      this.chainService.startService(),
      this.indexingService.startService(),
      this.enrichmentService.startService(),
      this.keyringService.startService(),
      this.nameService.startService(),
      this.internalEthereumProviderService.startService(),
      this.providerBridgeService.startService(),
      this.telemetryService.startService(),
    ]

    if (!HIDE_IMPORT_LEDGER) {
      servicesToBeStarted.push(this.ledgerService.startService())
      servicesToBeStarted.push(this.signingService.startService())
    }

    await Promise.all(servicesToBeStarted)
  }

  protected async internalStopService(): Promise<void> {
    const servicesToBeStopped = [
      this.preferenceService.stopService(),
      this.chainService.stopService(),
      this.indexingService.stopService(),
      this.enrichmentService.stopService(),
      this.keyringService.stopService(),
      this.nameService.stopService(),
      this.internalEthereumProviderService.stopService(),
      this.providerBridgeService.stopService(),
      this.telemetryService.stopService(),
    ]

    if (!HIDE_IMPORT_LEDGER) {
      servicesToBeStopped.push(this.ledgerService.stopService())
      servicesToBeStopped.push(this.signingService.stopService())
    }

    await Promise.all(servicesToBeStopped)
    await super.internalStopService()
  }

  async initializeRedux(): Promise<void> {
    this.connectIndexingService()
    this.connectKeyringService()
    this.connectNameService()
    this.connectInternalEthereumProviderService()
    this.connectProviderBridgeService()
    this.connectPreferenceService()
    this.connectEnrichmentService()
    this.connectTelemetryService()

    if (!HIDE_IMPORT_LEDGER) {
      this.connectLedgerService()
      this.connectSigningService()
    }

    await this.connectChainService()

    // FIXME Should no longer be necessary once transaction queueing enters the
    // FIXME picture.
    this.store.dispatch(
      clearTransactionState(TransactionConstructionStatus.Idle)
    )
  }

  async addAccount(addressNetwork: AddressOnNetwork): Promise<void> {
    await this.chainService.addAccountToTrack(addressNetwork)
  }

  async addAccountByName(nameNetwork: NameOnNetwork): Promise<void> {
    try {
      const address = await this.nameService.lookUpEthereumAddress(
        nameNetwork.name
      )

      if (address) {
        const addressNetwork = {
          address,
          network: nameNetwork.network,
        }
        await this.chainService.addAccountToTrack(addressNetwork)
        this.store.dispatch(loadAccount(address))
        this.store.dispatch(setNewSelectedAccount(addressNetwork))
      } else {
        throw new Error("Name not found")
      }
    } catch (error) {
      throw new Error(
        `Could not resolve name ${nameNetwork.name} for ${nameNetwork.network.name}`
      )
    }
  }

  async importLedgerAccounts(
    accounts: Array<{
      path: string
      address: string
    }>
  ): Promise<void> {
    for (let i = 0; i < accounts.length; i += 1) {
      const { path, address } = accounts[i]

      // eslint-disable-next-line no-await-in-loop
      await this.ledgerService.saveAddress(path, address)

      const addressNetwork = {
        address,
        network: ETHEREUM,
      }
      // eslint-disable-next-line no-await-in-loop
      await this.chainService.addAccountToTrack(addressNetwork)
      this.store.dispatch(loadAccount(address))
      this.store.dispatch(setNewSelectedAccount(addressNetwork))
    }
  }

  async deriveLedgerAddress(path: string): Promise<string> {
    return this.signingService.deriveAddress({
      type: "ledger",
      accountID: path,
    })
  }

  async connectLedger(): Promise<string | null> {
    return this.ledgerService.refreshConnectedLedger()
  }

  async getAccountEthBalanceUncached(address: string): Promise<bigint> {
    const amountBigNumber =
      await this.chainService.pollingProviders.ethereum.getBalance(address)
    return amountBigNumber.toBigInt()
  }

  async connectChainService(): Promise<void> {
    // Wire up chain service to account slice.
    this.chainService.emitter.on("accountBalance", (accountWithBalance) => {
      // The first account balance update will transition the account to loading.
      this.store.dispatch(updateAccountBalance(accountWithBalance))
    })

    this.chainService.emitter.on("block", (block) => {
      this.store.dispatch(blockSeen(block))
    })

    transactionConstructionSliceEmitter.on("updateOptions", async (options) => {
      const {
        values: { maxFeePerGas, maxPriorityFeePerGas },
      } = selectDefaultNetworkFeeSettings(this.store.getState())

      const { transactionRequest: populatedRequest, gasEstimationError } =
        await this.chainService.populatePartialEVMTransactionRequest(
          this.chainService.ethereumNetwork,
          {
            ...options,
            maxFeePerGas: options.maxFeePerGas ?? maxFeePerGas,
            maxPriorityFeePerGas:
              options.maxPriorityFeePerGas ?? maxPriorityFeePerGas,
          }
        )

      const { annotation } =
        await this.enrichmentService.enrichTransactionSignature(
          this.chainService.ethereumNetwork,
          populatedRequest,
          2 /* TODO desiredDecimals should be configurable */
        )
      const enrichedPopulatedRequest = { ...populatedRequest, annotation }

      if (typeof gasEstimationError === "undefined") {
        this.store.dispatch(
          transactionRequest({
            transactionRequest: enrichedPopulatedRequest,
            transactionLikelyFails: false,
          })
        )
      } else {
        this.store.dispatch(
          transactionRequest({
            transactionRequest: enrichedPopulatedRequest,
            transactionLikelyFails: true,
          })
        )
      }
    })

    transactionConstructionSliceEmitter.on(
      "broadcastSignedTransaction",
      async (transaction: SignedEVMTransaction) => {
        this.chainService.broadcastSignedTransaction(transaction)
      }
    )

    transactionConstructionSliceEmitter.on(
      "requestSignature",
      async ({ transaction, method }) => {
        if (HIDE_IMPORT_LEDGER) {
          const transactionWithNonce =
            await this.chainService.populateEVMTransactionNonce(transaction)

          try {
            const signedTx = await this.keyringService.signTransaction(
              {
                address: normalizeEVMAddress(transaction.from),
                network: this.chainService.ethereumNetwork,
              },
              transactionWithNonce
            )
            this.store.dispatch(signed(signedTx))
          } catch (exception) {
            logger.error(
              "Error signing transaction; releasing nonce",
              exception
            )
            this.chainService.releaseEVMTransactionNonce(transactionWithNonce)
          }
        } else {
          try {
            const signedTx = await this.signingService.signTransaction(
              this.chainService.ethereumNetwork,
              transaction,
              method
            )
            this.store.dispatch(signed(signedTx))
          } catch (exception) {
            logger.error("Error signing transaction", exception)
            this.store.dispatch(
              clearTransactionState(TransactionConstructionStatus.Idle)
            )
          }
        }
      }
    )
    signingSliceEmitter.on(
      "requestSignTypedData",
      async ({
        typedData,
        account,
      }: {
        typedData: EIP712TypedData
        account: HexString
      }) => {
        const signedData = await this.keyringService.signTypedData({
          typedData,
          account: normalizeEVMAddress(account),
        })
        this.store.dispatch(signedTypedData(signedData))
      }
    )

    // Set up initial state.
    const existingAccounts = await this.chainService.getAccountsToTrack()
    existingAccounts.forEach((addressNetwork) => {
      // Mark as loading and wire things up.
      this.store.dispatch(loadAccount(addressNetwork.address))

      // Force a refresh of the account balance to populate the store.
      this.chainService.getLatestBaseAccountBalance(addressNetwork)
    })

    this.chainService.emitter.on("blockPrices", (blockPrices) => {
      this.store.dispatch(estimatedFeesPerGas(blockPrices))
    })

    // Report on transactions for basic activity. Fancier stuff is handled via
    // connectEnrichmentService
    this.chainService.emitter.on("transaction", async (transactionInfo) => {
      this.store.dispatch(activityEncountered(transactionInfo))
    })
  }

  async connectNameService(): Promise<void> {
    this.nameService.emitter.on(
      "resolvedName",
      async ({ from: { addressNetwork }, resolved: { name } }) => {
        this.store.dispatch(updateENSName({ ...addressNetwork, name }))
      }
    )
    this.nameService.emitter.on(
      "resolvedAvatar",
      async ({ from: { addressNetwork }, resolved: { avatar } }) => {
        this.store.dispatch(
          updateENSAvatar({ ...addressNetwork, avatar: avatar.toString() })
        )
      }
    )
  }

  async connectIndexingService(): Promise<void> {
    this.indexingService.emitter.on(
      "accountBalance",
      async (accountWithBalance) => {
        const assetsToTrack = await this.indexingService.getAssetsToTrack()

        // TODO support multi-network assets
        const doesThisBalanceHaveAnAlreadyTrackedAsset = !!assetsToTrack.filter(
          (t) => t.symbol === accountWithBalance.assetAmount.asset.symbol
        )[0]

        if (
          accountWithBalance.assetAmount.amount > 0 ||
          doesThisBalanceHaveAnAlreadyTrackedAsset
        ) {
          this.store.dispatch(updateAccountBalance(accountWithBalance))
        }
      }
    )

    this.indexingService.emitter.on("assets", (assets) => {
      this.store.dispatch(assetsLoaded(assets))
    })

    this.indexingService.emitter.on("price", (pricePoint) => {
      this.store.dispatch(newPricePoint(pricePoint))
    })
  }

  async connectEnrichmentService(): Promise<void> {
    this.enrichmentService.emitter.on(
      "enrichedEVMTransaction",
      async (transactionData) => {
        this.indexingService.notifyEnrichedTransaction(
          transactionData.transaction
        )
        this.store.dispatch(activityEncountered(transactionData))
      }
    )
  }

  async connectSigningService(): Promise<void> {
    this.keyringService.emitter.on("address", (address) =>
      this.signingService.addTrackedAddress(address, "keyring")
    )

    this.ledgerService.emitter.on("address", ({ address }) =>
      this.signingService.addTrackedAddress(address, "ledger")
    )
  }

  async connectLedgerService(): Promise<void> {
    this.store.dispatch(resetLedgerState())

    this.ledgerService.emitter.on("connected", ({ id }) => {
      this.store.dispatch(
        setDeviceConnectionStatus({ deviceID: id, status: "available" })
      )
    })

    this.ledgerService.emitter.on("disconnected", ({ id }) => {
      this.store.dispatch(
        setDeviceConnectionStatus({ deviceID: id, status: "disconnected" })
      )
    })
  }

  async connectKeyringService(): Promise<void> {
    this.keyringService.emitter.on("keyrings", (keyrings) => {
      this.store.dispatch(updateKeyrings(keyrings))
    })

    this.keyringService.emitter.on("address", (address) => {
      const normalizedAddress = normalizeEVMAddress(address)
      // Mark as loading and wire things up.
      this.store.dispatch(loadAccount(normalizedAddress))

      this.chainService.addAccountToTrack({
        address: normalizedAddress,
        // TODO support other networks
        network: this.chainService.ethereumNetwork,
      })
    })

    this.keyringService.emitter.on("locked", async (isLocked) => {
      if (isLocked) {
        this.store.dispatch(keyringLocked())
      } else {
        this.store.dispatch(keyringUnlocked())
      }
    })

    keyringSliceEmitter.on("createPassword", async (password) => {
      await this.keyringService.unlock(password, true)
    })

    keyringSliceEmitter.on("unlockKeyrings", async (password) => {
      await this.keyringService.unlock(password)
    })

    keyringSliceEmitter.on("deriveAddress", async (keyringID) => {
      if (HIDE_IMPORT_LEDGER) {
        await this.keyringService.deriveAddress(keyringID)
      } else {
        await this.signingService.deriveAddress({
          type: "keyring",
          accountID: keyringID,
        })
      }
    })

    keyringSliceEmitter.on("generateNewKeyring", async () => {
      // TODO move unlocking to a reasonable place in the initialization flow
      const generated: {
        id: string
        mnemonic: string[]
      } = await this.keyringService.generateNewKeyring(
        KeyringTypes.mnemonicBIP39S256
      )

      this.store.dispatch(setKeyringToVerify(generated))
    })

    keyringSliceEmitter.on("importKeyring", async ({ mnemonic, path }) => {
      await this.keyringService.importKeyring(mnemonic, path)
    })
  }

  async connectInternalEthereumProviderService(): Promise<void> {
    this.internalEthereumProviderService.emitter.on(
      "transactionSignatureRequest",
      async ({ payload, resolver, rejecter }) => {
        this.store.dispatch(
          clearTransactionState(TransactionConstructionStatus.Pending)
        )
        this.store.dispatch(updateTransactionOptions(payload))

        const clear = () => {
          if (HIDE_IMPORT_LEDGER) {
            // Ye olde mutual dependency.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            this.keyringService.emitter.off("signedTx", resolveAndClear)
          } else {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            this.signingService.emitter.off("signingResponse", handleAndClear)
          }
          transactionConstructionSliceEmitter.off(
            "signatureRejected",
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            rejectAndClear
          )
        }

        const handleAndClear = (response: SignatureResponse) => {
          clear()
          switch (response.type) {
            case "success":
              resolver(response.signedTx)
              break
            default:
              rejecter()
              break
          }
        }

        const resolveAndClear = (signedTransaction: SignedEVMTransaction) => {
          clear()
          resolver(signedTransaction)
        }

        const rejectAndClear = () => {
          clear()
          rejecter()
        }

        if (HIDE_IMPORT_LEDGER) {
          this.keyringService.emitter.on("signedTx", resolveAndClear)
        } else {
          this.signingService.emitter.on("signingResponse", handleAndClear)
        }
        transactionConstructionSliceEmitter.on(
          "signatureRejected",
          rejectAndClear
        )
      }
    )
    this.internalEthereumProviderService.emitter.on(
      "signTypedDataRequest",
      async ({
        payload,
        resolver,
        rejecter,
      }: {
        payload: SignTypedDataRequest
        resolver: (result: string | PromiseLike<string>) => void
        rejecter: () => void
      }) => {
        this.store.dispatch(typedDataRequest(payload))

        const resolveAndClear = (signature: string) => {
          this.keyringService.emitter.off("signedData", resolveAndClear)
          signingSliceEmitter.off(
            "signatureRejected",
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            rejectAndClear
          )
          resolver(signature)
        }

        const rejectAndClear = () => {
          this.keyringService.emitter.off("signedData", resolveAndClear)
          signingSliceEmitter.off("signatureRejected", rejectAndClear)
          rejecter()
        }

        this.keyringService.emitter.on("signedData", resolveAndClear)
        signingSliceEmitter.on("signatureRejected", rejectAndClear)
      }
    )
  }

  async connectProviderBridgeService(): Promise<void> {
    this.providerBridgeService.emitter.on(
      "requestPermission",
      (permissionRequest: PermissionRequest) => {
        this.store.dispatch(requestPermission(permissionRequest))
      }
    )

    this.providerBridgeService.emitter.on(
      "initializeAllowedPages",
      async (allowedPages: Record<string, PermissionRequest>) => {
        this.store.dispatch(initializeAllowedPages(allowedPages))
      }
    )

    providerBridgeSliceEmitter.on("grantPermission", async (permission) => {
      await this.providerBridgeService.grantPermission(permission)
    })

    providerBridgeSliceEmitter.on(
      "denyOrRevokePermission",
      async (permission) => {
        await this.providerBridgeService.denyOrRevokePermission(permission)
      }
    )
  }

  async connectPreferenceService(): Promise<void> {
    this.preferenceService.emitter.on(
      "initializeDefaultWallet",
      async (isDefaultWallet: boolean) => {
        await this.store.dispatch(setDefaultWallet(isDefaultWallet))
      }
    )

    this.preferenceService.emitter.on(
      "initializeSelectedAccount",
      async (dbAddressNetwork: AddressOnNetwork) => {
        if (dbAddressNetwork) {
          // TBD: naming the normal reducer and async thunks
          // Initialize redux from the db
          // !!! Important: this action belongs to a regular reducer.
          // NOT to be confused with the setNewCurrentAddress asyncThunk
          this.store.dispatch(setSelectedAccount(dbAddressNetwork))
        } else {
          // Update currentAddress in db if it's not set but it is in the store
          // should run only one time
          const addressNetwork = this.store.getState().ui.selectedAccount

          if (addressNetwork) {
            await this.preferenceService.setSelectedAccount(addressNetwork)
          }
        }
      }
    )

    uiSliceEmitter.on("newSelectedAccount", async (addressNetwork) => {
      await this.preferenceService.setSelectedAccount(addressNetwork)

      this.providerBridgeService.notifyContentScriptsAboutAddressChange(
        addressNetwork.address
      )
    })

    uiSliceEmitter.on(
      "newDefaultWalletValue",
      async (newDefaultWalletValue) => {
        await this.preferenceService.setDefaultWalletValue(
          newDefaultWalletValue
        )

        this.providerBridgeService.notifyContentScriptAboutConfigChange(
          newDefaultWalletValue
        )
      }
    )
  }

  connectTelemetryService(): void {
    // Pass the redux store to the telemetry service so we can analyze its size
    this.telemetryService.connectReduxStore(this.store)
  }
}
