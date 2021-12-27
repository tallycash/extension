import browser from "webextension-polyfill"
import { alias, wrapStore } from "webext-redux"
import { configureStore, isPlain, Middleware } from "@reduxjs/toolkit"
import devToolsEnhancer from "remote-redux-devtools"
import { PermissionRequest } from "@tallyho/provider-bridge-shared"

import { decodeJSON, encodeJSON, getEthereumNetwork } from "./lib/utils"

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
  ServiceCreatorFunction,
} from "./services"

import { KeyringTypes } from "./types"
import { EIP1559TransactionRequest, SignedEVMTransaction } from "./networks"

import rootReducer from "./redux-slices"
import {
  loadAccount,
  blockSeen,
  updateAccountBalance,
  updateENSName,
  updateENSAvatar,
  emitter as accountSliceEmitter,
} from "./redux-slices/accounts"
import { activityEncountered } from "./redux-slices/activities"
import { assetsLoaded, newPricePoint } from "./redux-slices/assets"
import {
  emitter as keyringSliceEmitter,
  keyringLocked,
  keyringUnlocked,
  updateKeyrings,
} from "./redux-slices/keyrings"
import {
  initializationLoadingTimeHitLimit,
  emitter as uiSliceEmitter,
  setDefaultWallet,
  setCurrentAccount,
} from "./redux-slices/ui"
import {
  estimatedFeesPerGas,
  emitter as transactionConstructionSliceEmitter,
  transactionRequest,
  signed,
  updateTransactionOptions,
  broadcastOnSign,
} from "./redux-slices/transaction-construction"
import { allAliases } from "./redux-slices/utils"
import {
  requestPermission,
  emitter as providerBridgeSliceEmitter,
  initializeAllowedPages,
} from "./redux-slices/dapp-permission"
import logger from "./lib/logger"
import axios from "axios"
import { BaseLimitOrder, sendKeeperDaoLimitOrder } from "./lib/keeper-dao"

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
    browser.storage.local.set({ state: encodeJSON(state) })
  }

  return result
}

// Declared out here so ReduxStoreType can be used in Main.store type
// declaration.
const initializeStore = (startupState = {}) =>
  configureStore({
    preloadedState: startupState,
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => {
      const middleware = getDefaultMiddleware({
        serializableCheck: {
          isSerializable: (value: unknown) =>
            isPlain(value) || typeof value === "bigint",
        },
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

    let savedReduxState = {}
    // Setting READ_REDUX_CACHE to false will start the extension with an empty
    // initial state, which can be useful for development
    if (process.env.READ_REDUX_CACHE === "true") {
      const { state } = await browser.storage.local.get("state")

      if (state) {
        const restoredState = decodeJSON(state)
        if (typeof restoredState === "object" && restoredState !== null) {
          // If someone managed to sneak JSON that decodes to typeof "object"
          // but isn't a Record<string, unknown>, there is a very large
          // problem...
          savedReduxState = restoredState as Record<string, unknown>
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
      await providerBridgeService
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
    private providerBridgeService: ProviderBridgeService
  ) {
    super({
      initialLoadWaitExpired: {
        schedule: { delayInMinutes: 2.5 },
        handler: () => this.store.dispatch(initializationLoadingTimeHitLimit()),
      },
    })

    // Start up the redux store and set it up for proxying.
    this.store = initializeStore(savedReduxState)
    wrapStore(this.store, {
      serializer: encodeJSON,
      deserializer: decodeJSON,
    })

    this.initializeRedux()
  }

  protected async internalStartService(): Promise<void> {
    await super.internalStartService()

    this.indexingService.started().then(async () => this.chainService.started())

    await Promise.all([
      this.preferenceService.startService(),
      this.chainService.startService(),
      this.indexingService.startService(),
      this.enrichmentService.startService(),
      this.keyringService.startService(),
      this.nameService.startService(),
      this.internalEthereumProviderService.startService(),
      this.providerBridgeService.startService(),
    ])
  }

  protected async internalStopService(): Promise<void> {
    await Promise.all([
      this.preferenceService.stopService(),
      this.chainService.stopService(),
      this.indexingService.stopService(),
      this.enrichmentService.stopService(),
      this.keyringService.stopService(),
      this.nameService.stopService(),
      this.internalEthereumProviderService.stopService(),
      this.providerBridgeService.stopService(),
    ])

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
    await this.connectChainService()
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
    accountSliceEmitter.on("addAccount", async (addressNetwork) => {
      await this.chainService.addAccountToTrack(addressNetwork)
    })

    transactionConstructionSliceEmitter.on("updateOptions", async (options) => {
      // TODO Deal with pending transactions.
      const resolvedNonce =
        await this.chainService.pollingProviders.ethereum.getTransactionCount(
          options.from,
          "latest"
        )

      // Basic transaction construction based on the provided options, with extra data from the chain service
      const transaction: EIP1559TransactionRequest = {
        from: options.from,
        to: options.to,
        value: options.value ?? 0n,
        gasLimit: options.gasLimit ?? 0n,
        maxFeePerGas: options.maxFeePerGas ?? 0n,
        maxPriorityFeePerGas: options.maxPriorityFeePerGas ?? 0n,
        input: options.input ?? null,
        type: 2 as const,
        chainID: "1",
        nonce: resolvedNonce,
      }

      try {
        // We use estimateGasLimit only if user did not specify the gas explicitly or it was set below minimum
        if (
          typeof options.gasLimit === "undefined" ||
          options.gasLimit < 21000n
        ) {
          transaction.gasLimit = await this.chainService.estimateGasLimit(
            getEthereumNetwork(),
            transaction
          )
        }
        // TODO If the user does specify gas explicitly, test for success.

        this.store.dispatch(
          transactionRequest({
            transactionRequest: transaction,
            transactionLikelyFails: false,
          })
        )
      } catch (error) {
        this.store.dispatch(
          transactionRequest({
            transactionRequest: transaction,
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
      async (transaction: EIP1559TransactionRequest) => {
        const signedTx = await this.keyringService.signTransaction(
          transaction.from,
          transaction
        )
        this.store.dispatch(signed(signedTx))
      }
    )

    transactionConstructionSliceEmitter.on(
      "signAndSendLimitOrder",
      async (transaction: BaseLimitOrder) => {
        logger.log("Got Limit Order Request!")
        try {
          const keeperDaoResponse = await sendKeeperDaoLimitOrder(
            transaction,
            this.keyringService
          )
          logger.log("Limit Order Posted Successfully!", keeperDaoResponse)
        } catch (e) {
          logger.error(e)
          throw e
        }
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
    this.chainService.emitter.on("transaction", async ({ transaction }) => {
      const forAccounts: string[] = [transaction.to, transaction.from].filter(
        Boolean
      ) as string[]
      this.store.dispatch(
        activityEncountered({
          forAccounts,
          transaction,
        })
      )
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
    this.indexingService.emitter.on("accountBalance", (accountWithBalance) => {
      this.store.dispatch(updateAccountBalance(accountWithBalance))
    })

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
      async (transaction) => {
        const forAccounts: string[] = [transaction.to, transaction.from].filter(
          Boolean
        ) as string[]
        this.store.dispatch(
          activityEncountered({
            forAccounts,
            transaction,
          })
        )
      }
    )
  }

  async connectKeyringService(): Promise<void> {
    this.keyringService.emitter.on("keyrings", (keyrings) => {
      this.store.dispatch(updateKeyrings(keyrings))
    })

    this.keyringService.emitter.on("address", (address) => {
      // Mark as loading and wire things up.
      this.store.dispatch(loadAccount(address))

      this.chainService.addAccountToTrack({
        address,
        // TODO support other networks
        network: getEthereumNetwork(),
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

    keyringSliceEmitter.on("generateNewKeyring", async () => {
      // TODO move unlocking to a reasonable place in the initialization flow
      await this.keyringService.generateNewKeyring(
        KeyringTypes.mnemonicBIP39S256
      )
    })

    keyringSliceEmitter.on(
      "importLegacyKeyring",
      async ({ mnemonic, path }) => {
        await this.keyringService.importLegacyKeyring(mnemonic, path)
      }
    )
  }

  async connectInternalEthereumProviderService(): Promise<void> {
    this.internalEthereumProviderService.emitter.on(
      "transactionSignatureRequest",
      async ({ payload, resolver, rejecter }) => {
        this.store.dispatch(updateTransactionOptions(payload))
        // TODO force route?

        this.store.dispatch(broadcastOnSign(false))

        const resolveAndClear = (signedTransaction: SignedEVMTransaction) => {
          this.keyringService.emitter.off("signedTx", resolveAndClear)
          transactionConstructionSliceEmitter.off(
            "signatureRejected",
            // Ye olde mutual dependency.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            rejectAndClear
          )
          resolver(signedTransaction)
        }

        const rejectAndClear = () => {
          this.keyringService.emitter.off("signedTx", resolveAndClear)
          transactionConstructionSliceEmitter.off(
            "signatureRejected",
            rejectAndClear
          )
          rejecter()
        }

        this.keyringService.emitter.on("signedTx", resolveAndClear)
        transactionConstructionSliceEmitter.on(
          "signatureRejected",
          rejectAndClear
        )
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
      "initializeCurrentAddress",
      async (dbCurrentAddress: string) => {
        if (dbCurrentAddress) {
          // TBD: naming the normal reducer and async thunks
          // Initialize redux from the db
          // !!! Important: this action belongs to a regular reducer.
          // NOT to be confused with the setNewCurrentAddress asyncThunk
          this.store.dispatch(setCurrentAccount(dbCurrentAddress))
        } else {
          // Update currentAddress in db if it's not set but it is in the store
          // should run only one time
          const { address } =
            this.store.getState().ui.currentAccount.addressNetwork

          if (address) {
            await this.preferenceService.setCurrentAddress(address)
          }
        }
      }
    )

    uiSliceEmitter.on("newCurrentAddress", async (newCurrentAddress) => {
      await this.preferenceService.setCurrentAddress(newCurrentAddress)

      this.providerBridgeService.notifyContentScriptsAboutAddressChange(
        newCurrentAddress
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
}
