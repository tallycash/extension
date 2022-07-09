import browser, { runtime } from "webextension-polyfill"
import { alias, wrapStore } from "webext-redux"
import deepDiff from "webext-redux/lib/strategies/deepDiff/diff"
import { configureStore, isPlain, Middleware } from "@reduxjs/toolkit"
import { devToolsEnhancer } from "@redux-devtools/remote"
import { PermissionRequest } from "@tallyho/provider-bridge-shared"

import {
  decodeJSON,
  encodeJSON,
  getEthereumNetwork,
  isProbablyEVMAddress,
  normalizeEVMAddress,
} from "./lib/utils"

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
  DoggoService,
  LedgerService,
  SigningService,
} from "./services"

import { HexString, KeyringTypes } from "./types"
import { SignedEVMTransaction } from "./networks"
import { AccountBalance, AddressOnNetwork, NameOnNetwork } from "./accounts"
import { Eligible } from "./services/doggo/types"

import rootReducer from "./redux-slices"
import {
  loadAccount,
  updateAccountBalance,
  updateAccountName,
  updateENSAvatar,
} from "./redux-slices/accounts"
import { activityEncountered } from "./redux-slices/activities"
import { assetsLoaded, newPricePoint } from "./redux-slices/assets"
import {
  setEligibility,
  setEligibilityLoading,
  setReferrer,
  setReferrerStats,
} from "./redux-slices/claim"
import {
  emitter as keyringSliceEmitter,
  keyringLocked,
  keyringUnlocked,
  updateKeyrings,
  setKeyringToVerify,
} from "./redux-slices/keyrings"
import { blockSeen } from "./redux-slices/networks"
import {
  initializationLoadingTimeHitLimit,
  emitter as uiSliceEmitter,
  setDefaultWallet,
  setSelectedAccount,
  setNewSelectedAccount,
  setSnackbarMessage,
} from "./redux-slices/ui"
import {
  estimatedFeesPerGas,
  emitter as transactionConstructionSliceEmitter,
  transactionRequest,
  updateTransactionData,
  clearTransactionState,
  TransactionConstructionStatus,
  rejectTransactionSignature,
  transactionSigned,
  clearCustomGas,
} from "./redux-slices/transaction-construction"
import { selectDefaultNetworkFeeSettings } from "./redux-slices/selectors/transactionConstructionSelectors"
import { allAliases } from "./redux-slices/utils"
import {
  requestPermission,
  emitter as providerBridgeSliceEmitter,
  initializePermissions,
} from "./redux-slices/dapp"
import logger from "./lib/logger"
import {
  rejectDataSignature,
  clearSigningState,
  signedTypedData,
  signedData as signedDataAction,
  signingSliceEmitter,
  typedDataRequest,
  signDataRequest,
} from "./redux-slices/signing"

import { SignTypedDataRequest, SignDataRequest } from "./utils/signing"
import {
  emitter as earnSliceEmitter,
  setVaultsAsStale,
} from "./redux-slices/earn"
import {
  resetLedgerState,
  setDeviceConnectionStatus,
  setUsbDeviceCount,
} from "./redux-slices/ledger"
import { ETHEREUM, POLYGON } from "./constants"
import { clearApprovalInProgress, clearSwapQuote } from "./redux-slices/0x-swap"
import {
  SignatureResponse,
  SignerType,
  TXSignatureResponse,
} from "./services/signing"
import { ReferrerStats } from "./services/doggo/db"
import {
  migrateReduxState,
  REDUX_STATE_VERSION,
} from "./redux-slices/migrations"
import { PermissionMap } from "./services/provider-bridge/utils"
import { TALLY_INTERNAL_ORIGIN } from "./services/internal-ethereum-provider/constants"

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

export const popupMonitorPortName = "popup-monitor"

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
    const nameService = NameService.create(chainService, preferenceService)
    const enrichmentService = EnrichmentService.create(
      chainService,
      indexingService,
      nameService
    )
    const keyringService = KeyringService.create()
    const internalEthereumProviderService =
      InternalEthereumProviderService.create(chainService, preferenceService)
    const providerBridgeService = ProviderBridgeService.create(
      internalEthereumProviderService,
      preferenceService
    )
    const doggoService = DoggoService.create(chainService, indexingService)

    const telemetryService = TelemetryService.create()

    const ledgerService = LedgerService.create()

    const signingService = SigningService.create(
      keyringService,
      ledgerService,
      chainService
    )

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
      await doggoService,
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
     * A promise to the claim service, which saves the eligibility data
     * for efficient storage and retrieval.
     */
    private doggoService: DoggoService,
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
      diffStrategy: deepDiff,
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
      this.doggoService.startService(),
      this.telemetryService.startService(),
      this.ledgerService.startService(),
      this.signingService.startService(),
    ]

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
      this.doggoService.stopService(),
      this.telemetryService.stopService(),
      this.ledgerService.stopService(),
      this.signingService.stopService(),
    ]

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
    this.connectDoggoService()
    this.connectTelemetryService()
    this.connectLedgerService()
    this.connectSigningService()

    await this.connectChainService()

    // FIXME Should no longer be necessary once transaction queueing enters the
    // FIXME picture.
    this.store.dispatch(
      clearTransactionState(TransactionConstructionStatus.Idle)
    )

    this.store.dispatch(clearApprovalInProgress())

    this.connectPopupMonitor()
  }

  async addAccount(addressNetwork: AddressOnNetwork): Promise<void> {
    await this.chainService.addAccountToTrack(addressNetwork)
  }

  addOrEditAddressName({
    address,
    network,
    name,
  }: AddressOnNetwork & { name: string }): void {
    this.preferenceService.addOrEditNameInAddressBook({
      address,
      network,
      name,
    })
  }

  async removeAccount(
    address: HexString,
    signerType?: SignerType
  ): Promise<void> {
    // TODO Adjust to handle specific network.
    await this.signingService.removeAccount(address, signerType)
  }

  async importLedgerAccounts(
    accounts: Array<{
      path: string
      address: string
    }>
  ): Promise<void> {
    await Promise.all(
      accounts.map(async ({ path, address }) => {
        await this.ledgerService.saveAddress(path, address)

        await Promise.all(
          this.chainService.supportedNetworks.map(async (network) => {
            const addressNetwork = {
              address,
              network,
            }
            await this.chainService.addAccountToTrack(addressNetwork)
            this.store.dispatch(loadAccount(addressNetwork))
          })
        )
      })
    )
    this.store.dispatch(
      setNewSelectedAccount({
        address: accounts[0].address,
        network:
          await this.internalEthereumProviderService.getActiveOrDefaultNetwork(
            TALLY_INTERNAL_ORIGIN
          ),
      })
    )
  }

  async deriveLedgerAddress(
    deviceID: string,
    derivationPath: string
  ): Promise<string> {
    return this.signingService.deriveAddress({
      type: "ledger",
      deviceID,
      path: derivationPath,
    })
  }

  async connectLedger(): Promise<string | null> {
    return this.ledgerService.refreshConnectedLedger()
  }

  async getAccountEthBalanceUncached(
    addressNetwork: AddressOnNetwork
  ): Promise<bigint> {
    const accountBalance = await this.chainService.getLatestBaseAccountBalance(
      addressNetwork
    )

    return accountBalance.assetAmount.amount
  }

  async connectChainService(): Promise<void> {
    // Wire up chain service to account slice.
    this.chainService.emitter.on(
      "accountsWithBalances",
      (accountWithBalance) => {
        // The first account balance update will transition the account to loading.
        this.store.dispatch(updateAccountBalance(accountWithBalance))
      }
    )

    this.chainService.emitter.on("block", (block) => {
      this.store.dispatch(blockSeen(block))
    })

    this.chainService.emitter.on("transactionSend", () => {
      this.store.dispatch(
        setSnackbarMessage("Transaction signed, broadcasting...")
      )
    })

    earnSliceEmitter.on("earnDeposit", (message) => {
      this.store.dispatch(setSnackbarMessage(message))
    })

    this.chainService.emitter.on("transactionSendFailure", () => {
      this.store.dispatch(
        setSnackbarMessage("Transaction failed to broadcast.")
      )
    })

    transactionConstructionSliceEmitter.on(
      "updateTransaction",
      async (options) => {
        const { network } = options

        const {
          values: { maxFeePerGas, maxPriorityFeePerGas },
        } = selectDefaultNetworkFeeSettings(this.store.getState())

        const { transactionRequest: populatedRequest, gasEstimationError } =
          await this.chainService.populatePartialEVMTransactionRequest(
            network,
            {
              ...options,
              maxFeePerGas: options.maxFeePerGas ?? maxFeePerGas,
              maxPriorityFeePerGas:
                options.maxPriorityFeePerGas ?? maxPriorityFeePerGas,
            }
          )

        const { annotation } =
          await this.enrichmentService.enrichTransactionSignature(
            network,
            populatedRequest,
            2 /* TODO desiredDecimals should be configurable */
          )

        const enrichedPopulatedRequest = {
          ...populatedRequest,
          annotation,
        }

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
      }
    )

    transactionConstructionSliceEmitter.on(
      "broadcastSignedTransaction",
      async (transaction: SignedEVMTransaction) => {
        this.chainService.broadcastSignedTransaction(transaction)
      }
    )

    transactionConstructionSliceEmitter.on(
      "requestSignature",
      async ({ request, accountSigner }) => {
        try {
          const signedTransactionResult =
            await this.signingService.signTransaction(request, accountSigner)
          await this.store.dispatch(transactionSigned(signedTransactionResult))
        } catch (exception) {
          logger.error("Error signing transaction", exception)
          this.store.dispatch(
            clearTransactionState(TransactionConstructionStatus.Idle)
          )
        }
      }
    )
    signingSliceEmitter.on(
      "requestSignTypedData",
      async ({ typedData, account, accountSigner }) => {
        try {
          const signedData = await this.signingService.signTypedData({
            typedData,
            account,
            accountSigner,
          })
          this.store.dispatch(signedTypedData(signedData))
        } catch (err) {
          logger.error("Error signing typed data", typedData, "error: ", err)
          this.store.dispatch(clearSigningState)
        }
      }
    )
    signingSliceEmitter.on(
      "requestSignData",
      async ({ rawSigningData, account, accountSigner }) => {
        const signedData = await this.signingService.signData(
          account,
          rawSigningData,
          accountSigner
        )
        this.store.dispatch(signedDataAction(signedData))
      }
    )

    // Set up initial state.
    const existingAccounts = await this.chainService.getAccountsToTrack()
    existingAccounts.forEach((addressNetwork) => {
      // Mark as loading and wire things up.
      this.store.dispatch(loadAccount(addressNetwork))

      // Force a refresh of the account balance to populate the store.
      this.chainService.getLatestBaseAccountBalance(addressNetwork)
    })

    this.chainService.emitter.on("blockPrices", ({ blockPrices, network }) => {
      this.store.dispatch(
        estimatedFeesPerGas({ estimatedFeesPerGas: blockPrices, network })
      )
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
      async ({
        from: { addressOnNetwork },
        resolved: {
          nameOnNetwork: { name },
        },
      }) => {
        this.store.dispatch(updateAccountName({ ...addressOnNetwork, name }))
      }
    )
    this.nameService.emitter.on(
      "resolvedAvatar",
      async ({ from: { addressOnNetwork }, resolved: { avatar } }) => {
        this.store.dispatch(
          updateENSAvatar({ ...addressOnNetwork, avatar: avatar.toString() })
        )
      }
    )
  }

  async connectIndexingService(): Promise<void> {
    this.indexingService.emitter.on(
      "accountsWithBalances",
      async (accountsWithBalances) => {
        const assetsToTrack = await this.indexingService.getAssetsToTrack()

        const filteredBalancesToDispatch: AccountBalance[] = []

        accountsWithBalances.forEach((balance) => {
          // TODO support multi-network assets
          const doesThisBalanceHaveAnAlreadyTrackedAsset =
            !!assetsToTrack.filter(
              (t) => t.symbol === balance.assetAmount.asset.symbol
            )[0]

          if (
            balance.assetAmount.amount > 0 ||
            doesThisBalanceHaveAnAlreadyTrackedAsset
          ) {
            filteredBalancesToDispatch.push(balance)
          }
        })

        this.store.dispatch(updateAccountBalance(filteredBalancesToDispatch))
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
      (transactionData) => {
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

    this.ledgerService.emitter.on("connected", ({ id, metadata }) => {
      this.store.dispatch(
        setDeviceConnectionStatus({
          deviceID: id,
          status: "available",
          isArbitraryDataSigningEnabled: metadata.isArbitraryDataSigningEnabled,
        })
      )
    })

    this.ledgerService.emitter.on("disconnected", ({ id }) => {
      this.store.dispatch(
        setDeviceConnectionStatus({
          deviceID: id,
          status: "disconnected",
          isArbitraryDataSigningEnabled: false /* dummy */,
        })
      )
    })

    this.ledgerService.emitter.on("usbDeviceCount", (usbDeviceCount) => {
      this.store.dispatch(setUsbDeviceCount({ usbDeviceCount }))
    })
  }

  async connectKeyringService(): Promise<void> {
    this.keyringService.emitter.on("keyrings", (keyrings) => {
      this.store.dispatch(updateKeyrings(keyrings))
    })

    this.keyringService.emitter.on("address", (address) => {
      this.chainService.supportedNetworks.forEach((network) => {
        // Mark as loading and wire things up.
        this.store.dispatch(
          loadAccount({
            address,
            network,
          })
        )

        this.chainService.addAccountToTrack({
          address,
          network,
        })
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
      await this.signingService.deriveAddress({
        type: "keyring",
        keyringID,
      })
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

    keyringSliceEmitter.on(
      "importKeyring",
      async ({ mnemonic, path, source, passphrase }) => {
        await this.keyringService.importKeyring(
          mnemonic,
          source,
          path,
          passphrase
        )
      }
    )
  }

  async connectInternalEthereumProviderService(): Promise<void> {
    this.internalEthereumProviderService.emitter.on(
      "transactionSignatureRequest",
      async ({ payload, resolver, rejecter }) => {
        this.store.dispatch(
          clearTransactionState(TransactionConstructionStatus.Pending)
        )
        this.store.dispatch(updateTransactionData(payload))

        const clear = () => {
          // Mutual dependency to handleAndClear.
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          this.signingService.emitter.off("signingTxResponse", handleAndClear)

          transactionConstructionSliceEmitter.off(
            "signatureRejected",
            // Mutual dependency to rejectAndClear.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            rejectAndClear
          )
        }

        const handleAndClear = (response: TXSignatureResponse) => {
          clear()
          switch (response.type) {
            case "success-tx":
              resolver(response.signedTx)
              break
            default:
              rejecter()
              break
          }
        }

        const rejectAndClear = () => {
          clear()
          rejecter()
        }

        this.signingService.emitter.on("signingTxResponse", handleAndClear)

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
        const enrichedsignTypedDataRequest =
          await this.enrichmentService.enrichSignTypedDataRequest(payload)
        this.store.dispatch(typedDataRequest(enrichedsignTypedDataRequest))

        const clear = () => {
          this.signingService.emitter.off(
            "signingDataResponse",
            // Mutual dependency to handleAndClear.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            handleAndClear
          )

          signingSliceEmitter.off(
            "signatureRejected",
            // Mutual dependency to rejectAndClear.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            rejectAndClear
          )
        }

        const handleAndClear = (response: SignatureResponse) => {
          clear()
          switch (response.type) {
            case "success-data":
              resolver(response.signedData)
              break
            default:
              rejecter()
              break
          }
        }

        const rejectAndClear = () => {
          clear()
          rejecter()
        }

        this.signingService.emitter.on("signingDataResponse", handleAndClear)

        signingSliceEmitter.on("signatureRejected", rejectAndClear)
      }
    )
    this.internalEthereumProviderService.emitter.on(
      "signDataRequest",
      async ({
        payload,
        resolver,
        rejecter,
      }: {
        payload: SignDataRequest
        resolver: (result: string | PromiseLike<string>) => void
        rejecter: () => void
      }) => {
        this.store.dispatch(signDataRequest(payload))

        const clear = () => {
          this.signingService.emitter.off(
            "personalSigningResponse",
            // Mutual dependency to handleAndClear.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            handleAndClear
          )

          signingSliceEmitter.off(
            "signatureRejected",
            // Mutual dependency to rejectAndClear.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            rejectAndClear
          )
        }

        const handleAndClear = (response: SignatureResponse) => {
          clear()
          switch (response.type) {
            case "success-data":
              resolver(response.signedData)
              break
            default:
              rejecter()
              break
          }
        }

        const rejectAndClear = () => {
          clear()
          rejecter()
        }

        this.signingService.emitter.on(
          "personalSigningResponse",
          handleAndClear
        )

        signingSliceEmitter.on("signatureRejected", rejectAndClear)
      }
    )

    uiSliceEmitter.on("newSelectedNetwork", (network) => {
      this.internalEthereumProviderService.routeSafeRPCRequest(
        "wallet_switchEthereumChain",
        [{ chainId: network.chainID }],
        TALLY_INTERNAL_ORIGIN
      )
      this.store.dispatch(clearCustomGas())
    })
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
      async (allowedPages: PermissionMap) => {
        this.store.dispatch(initializePermissions(allowedPages))
      }
    )

    this.providerBridgeService.emitter.on(
      "setClaimReferrer",
      async (referral: string) => {
        const isAddress = isProbablyEVMAddress(referral)
        const network = getEthereumNetwork()
        const ensName = isAddress
          ? (
              await this.nameService.lookUpName({
                address: referral,
                network,
              })
            )?.name
          : referral
        const address = isAddress
          ? referral
          : (
              await this.nameService.lookUpEthereumAddress({
                name: referral,
                network,
              })
            )?.address

        if (typeof address !== "undefined") {
          this.store.dispatch(
            setReferrer({
              address,
              ensName,
            })
          )
        }
      }
    )

    providerBridgeSliceEmitter.on("grantPermission", async (permission) => {
      await Promise.all(
        [ETHEREUM, POLYGON].map(async (network) => {
          await this.providerBridgeService.grantPermission({
            ...permission,
            chainID: network.chainID,
          })
        })
      )
    })

    providerBridgeSliceEmitter.on(
      "denyOrRevokePermission",
      async (permission) => {
        await Promise.all(
          this.chainService.supportedNetworks.map(async (network) => {
            await this.providerBridgeService.denyOrRevokePermission({
              ...permission,
              chainID: network.chainID,
            })
          })
        )
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

      this.store.dispatch(clearSwapQuote())
      this.store.dispatch(setEligibilityLoading())
      this.doggoService.getEligibility(addressNetwork.address)

      this.store.dispatch(setVaultsAsStale())

      const referrerStats = await this.doggoService.getReferrerStats(
        addressNetwork
      )
      this.store.dispatch(setReferrerStats(referrerStats))

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

    uiSliceEmitter.on("refreshBackgroundPage", async () => {
      window.location.reload()
    })
  }

  async connectDoggoService(): Promise<void> {
    this.doggoService.emitter.on(
      "newEligibility",
      async (eligibility: Eligible) => {
        await this.store.dispatch(setEligibility(eligibility))
      }
    )

    this.doggoService.emitter.on(
      "newReferral",
      async (
        referral: {
          referrer: AddressOnNetwork
        } & ReferrerStats
      ) => {
        const { referrer, referredUsers, bonusTotal } = referral
        const { selectedAccount } = this.store.getState().ui

        if (
          normalizeEVMAddress(referrer.address) ===
          normalizeEVMAddress(selectedAccount.address)
        ) {
          this.store.dispatch(
            setReferrerStats({
              referredUsers,
              bonusTotal,
            })
          )
        }
      }
    )
  }

  connectTelemetryService(): void {
    // Pass the redux store to the telemetry service so we can analyze its size
    this.telemetryService.connectReduxStore(this.store)
  }

  async resolveNameOnNetwork(
    nameOnNetwork: NameOnNetwork
  ): Promise<AddressOnNetwork | undefined> {
    try {
      return await this.nameService.lookUpEthereumAddress(nameOnNetwork)
    } catch (error) {
      logger.info("Error looking up Ethereum address: ", error)
      return undefined
    }
  }

  private connectPopupMonitor() {
    runtime.onConnect.addListener((port) => {
      if (port.name !== popupMonitorPortName) return
      port.onDisconnect.addListener(() => {
        this.onPopupDisconnected()
      })
    })
  }

  private onPopupDisconnected() {
    this.store.dispatch(rejectTransactionSignature())
    this.store.dispatch(rejectDataSignature())
  }
}
