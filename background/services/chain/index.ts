import { getNetwork } from "@ethersproject/networks"
import {
  AlchemyProvider,
  AlchemyWebSocketProvider,
  TransactionReceipt,
} from "@ethersproject/providers"
import { utils } from "ethers"
import { Logger } from "ethers/lib/utils"

import { AssetTransfer } from "../../assets"
import { HOUR } from "../../constants"
import { ETH } from "../../constants/currencies"
import {
  getAssetTransfers,
  transactionFromAlchemyWebsocketTransaction,
} from "../../lib/alchemy"
import {
  getEthereumNetwork,
  normalizeEVMAddress,
  sameEVMAddress,
} from "../../lib/utils"
import logger from "../../lib/logger"
import getBlockPrices from "../../lib/gas"
import { AccountBalance, AddressOnNetwork } from "../../accounts"
import {
  AnyEVMBlock,
  AnyEVMTransaction,
  BlockPrices,
  EIP1559TransactionRequest,
  EVMNetwork,
  LegacyEVMTransactionRequest,
  Network,
  SignedEVMTransaction,
} from "../../networks"
import { HexString, UNIXTime } from "../../types"
import BaseService from "../base"
import type {
  EnrichedEIP1559TransactionRequest,
  EnrichedEVMTransactionSignatureRequest,
} from "../enrichment"
import PreferenceService from "../preferences"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import { ChainDatabase, getOrCreateDB } from "./db"
import {
  blockFromEthersBlock,
  blockFromWebsocketBlock,
  enrichTransactionWithReceipt,
  ethersTransactionFromSignedTransaction,
  ethersTransactionRequestFromEIP1559TransactionRequest,
  transactionFromEthersTransaction,
} from "./utils"

// We can't use destructuring because webpack has to replace all instances of
// `process.env` variables in the bundled output
const ALCHEMY_KEY = process.env.ALCHEMY_KEY // eslint-disable-line prefer-destructuring

// How many queued transactions should be retrieved on every tx alarm, per
// network. To get frequency, divide by the alarm period. 5 tx / 5 minutes →
// max 1 tx/min.
const TRANSACTIONS_RETRIEVED_PER_ALARM = 5

// The number of blocks to query at a time for historic asset transfers.
// Unfortunately there's no "right" answer here that works well across different
// people's account histories. If the number is too large relative to a
// frequently used account, the first call will time out and waste provider
// resources... resulting in an exponential backoff. If it's too small,
// transaction history will appear "slow" to show up for newly imported
// accounts.
const BLOCKS_FOR_TRANSACTION_HISTORY = 128000

// The number of blocks before the current block height to start looking for
// asset transfers. This is important to allow nodes like Erigon and
// OpenEthereum with tracing to catch up to where we are.
const BLOCKS_TO_SKIP_FOR_TRANSACTION_HISTORY = 20

// The number of asset transfer lookups that will be done per account to rebuild
// historic activity.
const HISTORIC_ASSET_TRANSFER_LOOKUPS_PER_ACCOUNT = 10

// The number of milliseconds after a request to look up a transaction was
// first seen to continue looking in case the transaction fails to be found
// for either internal (request failure) or external (transaction dropped from
// mempool) reasons.
const TRANSACTION_CHECK_LIFETIME_MS = 10 * HOUR

interface Events extends ServiceLifecycleEvents {
  newAccountToTrack: AddressOnNetwork
  accountBalance: AccountBalance
  assetTransfers: {
    addressNetwork: AddressOnNetwork
    assetTransfers: AssetTransfer[]
  }
  block: AnyEVMBlock
  transaction: { forAccounts: string[]; transaction: AnyEVMTransaction }
  blockPrices: BlockPrices
}

/**
 * ChainService is responsible for basic network monitoring and interaction.
 * Other services rely on the chain service rather than polling networks
 * themselves.
 *
 * The service should provide
 * * Basic cached network information, like the latest block hash and height
 * * Cached account balances, account history, and transaction data
 * * Gas estimation and transaction broadcasting
 * * Event subscriptions, including events whenever
 *   * A new transaction relevant to accounts tracked is found or first
 *     confirmed
 *   * A historic account transaction is pulled and cached
 *   * Any asset transfers found for newly tracked accounts
 *   * A relevant account balance changes
 *   * New blocks
 * * ... and finally, polling and websocket providers for supported networks, in
 *   case a service needs to interact with a network directly.
 */
export default class ChainService extends BaseService<Events> {
  pollingProviders: { [networkName: string]: AlchemyProvider }

  websocketProviders: { [networkName: string]: AlchemyWebSocketProvider }

  subscribedAccounts: {
    account: string
    provider: AlchemyWebSocketProvider
  }[]

  subscribedNetworks: {
    network: EVMNetwork
    provider: AlchemyWebSocketProvider
  }[]

  /**
   * For each chain id, track an address's last seen nonce. The tracked nonce
   * should generally not be allocated to a new transaction, nor should any
   * nonces that precede it, unless the intent is deliberately to replace an
   * unconfirmed transaction sharing the same nonce.
   */
  private evmChainLastSeenNoncesByNormalizedAddress: {
    [chainID: string]: { [normalizedAddress: string]: number }
  } = {}

  /**
   * FIFO queues of transaction hashes per network that should be retrieved and
   * cached, alongside information about when that hash request was first seen
   * for expiration purposes.
   */
  private transactionsToRetrieve: {
    [networkName: string]: { hash: HexString; firstSeen: UNIXTime }[]
  }

  static create: ServiceCreatorFunction<
    Events,
    ChainService,
    [Promise<PreferenceService>]
  > = async (preferenceService) => {
    return new this(await getOrCreateDB(), await preferenceService)
  }

  ethereumNetwork: EVMNetwork

  private constructor(
    private db: ChainDatabase,
    private preferenceService: PreferenceService
  ) {
    super({
      queuedTransactions: {
        schedule: {
          delayInMinutes: 1,
          periodInMinutes: 1,
        },
        handler: () => {
          this.handleQueuedTransactionAlarm()
        },
      },
      historicAssetTransfers: {
        schedule: {
          periodInMinutes: 1,
        },
        handler: () => {
          this.handleHistoricAssetTransferAlarm()
        },
        runAtStart: true,
      },
      blockPrices: {
        runAtStart: false,
        schedule: {
          periodInMinutes:
            Number(process.env.GAS_PRICE_POLLING_FREQUENCY ?? "120") / 60,
        },
        handler: () => {
          this.pollBlockPrices()
        },
      },
    })

    this.ethereumNetwork = getEthereumNetwork()

    // TODO set up for each relevant network
    this.pollingProviders = {
      ethereum: new AlchemyProvider(
        getNetwork(Number(this.ethereumNetwork.chainID)),
        ALCHEMY_KEY
      ),
    }
    this.websocketProviders = {
      ethereum: new AlchemyWebSocketProvider(
        getNetwork(Number(this.ethereumNetwork.chainID)),
        ALCHEMY_KEY
      ),
    }
    this.subscribedAccounts = []
    this.subscribedNetworks = []
    this.transactionsToRetrieve = { ethereum: [] }
  }

  async internalStartService(): Promise<void> {
    await super.internalStartService()

    const accounts = await this.getAccountsToTrack()
    const ethProvider = this.pollingProviders.ethereum
    const network = this.ethereumNetwork

    // FIXME Should we await or drop Promise.all on the below two?
    Promise.all([
      // TODO get the latest block for other networks
      ethProvider.getBlockNumber().then(async (n) => {
        const result = await ethProvider.getBlock(n)
        const block = blockFromEthersBlock(network, result)
        await this.db.addBlock(block)
      }),

      this.subscribeToNewHeads(network),
    ])

    Promise.all(
      accounts
        .flatMap((an) => [
          // subscribe to all account transactions
          this.subscribeToAccountTransactions(an),
          // do a base-asset balance check for every account
          this.getLatestBaseAccountBalance(an).then(() => {}),
        ])
        .concat(
          // Schedule any stored unconfirmed transactions for
          // retrieval---either to confirm they no longer exist, or to
          // read/monitor their status.
          this.db
            .getNetworkPendingTransactions(network)
            .then((pendingTransactions) => {
              pendingTransactions.forEach(({ hash, firstSeen }) => {
                const normalizedHash = normalizeEVMAddress(hash)
                logger.debug(
                  `Queuing pending transaction ${normalizedHash} for status lookup.`
                )
                this.queueTransactionHashToRetrieve(
                  network,
                  normalizedHash,
                  firstSeen
                )
              })
            })
        )
    )
  }

  /**
   * Populates the provided partial EIP1559 transaction request with all fields
   * except the nonce. This leaves the transaction ready for user review, and
   * the nonce ready to be filled in immediately prior to signing to minimize the
   * likelihood for nonce reuse.
   *
   * Note that if the partial request already has a defined nonce, it is not
   * cleared.
   */
  async populatePartialEVMTransactionRequest(
    network: EVMNetwork,
    partialRequest: EnrichedEVMTransactionSignatureRequest
  ): Promise<{
    transactionRequest: EnrichedEIP1559TransactionRequest
    gasEstimationError: string | undefined
  }> {
    // Basic transaction construction based on the provided options, with extra data from the chain service
    const transactionRequest: EnrichedEIP1559TransactionRequest = {
      from: normalizeEVMAddress(partialRequest.from),
      to:
        partialRequest.to != null
          ? normalizeEVMAddress(partialRequest.to)
          : partialRequest.to,
      value: partialRequest.value ?? 0n,
      gasLimit: partialRequest.gasLimit ?? 0n,
      maxFeePerGas: partialRequest.maxFeePerGas ?? 0n,
      maxPriorityFeePerGas: partialRequest.maxPriorityFeePerGas ?? 0n,
      input: partialRequest.input ?? null,
      type: 2 as const,
      chainID: network.chainID,
      nonce: partialRequest.nonce,
      annotation: partialRequest.annotation,
    }

    // Always estimate gas to decide whether the transaction will likely fail.
    let estimatedGasLimit: bigint | undefined
    let gasEstimationError: string | undefined
    try {
      estimatedGasLimit = await this.estimateGasLimit(
        network,
        transactionRequest
      )
    } catch (error) {
      // Try to identify unpredictable gas errors to bubble that information
      // out.
      if (error instanceof Error) {
        // Ethers does some heavily loose typing around errors to carry
        // arbitrary info without subclassing Error, so an any cast is needed.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyError: any = error

        if (
          "code" in anyError &&
          anyError.code === Logger.errors.UNPREDICTABLE_GAS_LIMIT
        ) {
          gasEstimationError = anyError.error ?? "unknown transaction error"
        }
      }
    }

    // We use the estimate as the actual limit only if user did not specify the
    // gas explicitly or if it was set below the minimum network-allowed value.
    if (
      typeof estimatedGasLimit !== "undefined" &&
      (typeof partialRequest.gasLimit === "undefined" ||
        partialRequest.gasLimit < 21000n)
    ) {
      transactionRequest.gasLimit = estimatedGasLimit
    }

    return { transactionRequest, gasEstimationError }
  }

  /**
   * Populates the nonce for the passed EIP1559TransactionRequest, provided
   * that it is not yet populated. This process generates a new nonce based on
   * the known on-chain nonce state of the service, attempting to ensure that
   * the nonce will be unique and an increase by 1 over any other confirmed or
   * pending nonces in the mempool.
   *
   * Returns the transaction request with a guaranteed-defined nonce, suitable
   * for signing by a signer.
   */
  async populateEVMTransactionNonce(
    transactionRequest: EIP1559TransactionRequest
  ): Promise<EIP1559TransactionRequest & { nonce: number }> {
    if (typeof transactionRequest.nonce !== "undefined") {
      // TS undefined checks don't narrow the containing object's type, so we
      // have to cast `as` here.
      return transactionRequest as EIP1559TransactionRequest & { nonce: number }
    }

    const { chainID } = transactionRequest
    const normalizedAddress = normalizeEVMAddress(transactionRequest.from)

    const chainNonce =
      (await this.pollingProviders.ethereum.getTransactionCount(
        normalizeEVMAddress(transactionRequest.from),
        "latest"
      )) - 1
    const existingNonce =
      this.evmChainLastSeenNoncesByNormalizedAddress[chainID]?.[
        normalizedAddress
      ] ?? chainNonce

    this.evmChainLastSeenNoncesByNormalizedAddress[chainID] ??= {}
    // Use the network count, if needed. Note that the assumption here is that
    // all nonces for this address are increasing linearly and continuously; if
    // the address has a pending transaction floating around with a nonce that
    // is not an increase by one over previous transactions, this approach will
    // allocate more nonces that won't mine.
    // TODO Deal with multi-network.
    this.evmChainLastSeenNoncesByNormalizedAddress[chainID][normalizedAddress] =
      Math.max(existingNonce, chainNonce)

    // Allocate a new nonce by incrementing the last seen one.
    this.evmChainLastSeenNoncesByNormalizedAddress[chainID][
      normalizedAddress
    ] += 1
    const knownNextNonce =
      this.evmChainLastSeenNoncesByNormalizedAddress[chainID][normalizedAddress]

    logger.debug(
      "Got chain nonce",
      chainNonce,
      "existing nonce",
      existingNonce,
      "using",
      knownNextNonce
    )

    return {
      ...transactionRequest,
      nonce: knownNextNonce,
    }
  }

  /**
   * Releases the specified nonce for the given network and address. This
   * updates internal service state to allow that nonce to be reused. In cases
   * where multiple nonces were seen in a row, this will make internally
   * available for reuse all intervening nonces.
   */
  releaseEVMTransactionNonce(
    transactionRequest:
      | (EIP1559TransactionRequest & {
          nonce: number
        })
      | (LegacyEVMTransactionRequest & { nonce: number })
      | SignedEVMTransaction
  ): void {
    const { nonce } = transactionRequest
    const chainID =
      "chainID" in transactionRequest
        ? transactionRequest.chainID
        : transactionRequest.network.chainID

    const normalizedAddress = normalizeEVMAddress(transactionRequest.from)
    const lastSeenNonce =
      this.evmChainLastSeenNoncesByNormalizedAddress[chainID][normalizedAddress]

    // TODO Currently this assumes that the only place this nonce could have
    // TODO been used is this service; however, another wallet or service
    // TODO could have broadcast a transaction with this same nonce, in which
    // TODO case the nonce release shouldn't take effect! This should be a
    // TODO relatively rare edge case, but we should handle it at some point.
    if (nonce === lastSeenNonce) {
      this.evmChainLastSeenNoncesByNormalizedAddress[chainID][
        normalizedAddress
      ] -= 1
    } else if (nonce < lastSeenNonce) {
      // If the nonce we're releasing is below the latest allocated nonce,
      // release all intervening nonces. This risks transaction replacement
      // issues, but ensures that we don't start allocating nonces that will
      // never mine (because they will all be higher than the
      // now-released-and-therefore-never-broadcast nonce).
      this.evmChainLastSeenNoncesByNormalizedAddress[chainID][
        normalizedAddress
      ] = lastSeenNonce - 1
    }
  }

  async getAccountsToTrack(): Promise<AddressOnNetwork[]> {
    return this.db.getAccountsToTrack()
  }

  async getLatestBaseAccountBalance(
    addressNetwork: AddressOnNetwork
  ): Promise<AccountBalance> {
    this.checkNetwork(addressNetwork.network)

    // TODO look up provider network properly
    const balance = await this.pollingProviders.ethereum.getBalance(
      normalizeEVMAddress(addressNetwork.address)
    )
    const accountBalance: AccountBalance = {
      address: normalizeEVMAddress(addressNetwork.address),
      assetAmount: {
        asset: ETH,
        amount: balance.toBigInt(),
      },
      network: addressNetwork.network,
      dataSource: "alchemy", // TODO do this properly (eg provider isn't Alchemy)
      retrievedAt: Date.now(),
    }
    this.emitter.emit("accountBalance", accountBalance)
    await this.db.addBalance(accountBalance)
    return accountBalance
  }

  async addAccountToTrack(addressNetwork: AddressOnNetwork): Promise<void> {
    await this.db.addAccountToTrack(addressNetwork)
    this.emitter.emit("newAccountToTrack", addressNetwork)
    this.getLatestBaseAccountBalance(addressNetwork)
    this.subscribeToAccountTransactions(addressNetwork)
    this.loadRecentAssetTransfers(addressNetwork)
  }

  async getBlockHeight(network: Network): Promise<number> {
    const cachedBlock = await this.db.getLatestBlock(network)
    if (cachedBlock) {
      return cachedBlock.blockHeight
    }
    // TODO make proper use of the network
    return this.pollingProviders.ethereum.getBlockNumber()
  }

  /**
   * Return cached information on a block if it's in the local DB.
   *
   * Otherwise, retrieve the block from the specified network, caching and
   * returning the object.
   *
   * @param network the EVM network we're interested in
   * @param blockHash the hash of the block we're interested in
   */
  async getBlockData(
    network: EVMNetwork,
    blockHash: string
  ): Promise<AnyEVMBlock> {
    const normalizedHash = normalizeEVMAddress(blockHash)
    // TODO make this multi network
    const cachedBlock = await this.db.getBlock(network, normalizedHash)
    if (cachedBlock) {
      return cachedBlock
    }

    // Looking for new block
    const resultBlock = await this.pollingProviders.ethereum.getBlock(
      normalizedHash
    )

    const block = blockFromEthersBlock(network, resultBlock)

    await this.db.addBlock(block)
    this.emitter.emit("block", block)
    return block
  }

  /**
   * Return cached information on a transaction, if it's both confirmed and
   * in the local DB.
   *
   * Otherwise, retrieve the transaction from the specified network, caching and
   * returning the object.
   *
   * @param network the EVM network we're interested in
   * @param txHash the hash of the unconfirmed transaction we're interested in
   */
  async getTransaction(
    network: EVMNetwork,
    txHash: HexString
  ): Promise<AnyEVMTransaction> {
    const cachedTx = await this.db.getTransaction(network, txHash)
    if (cachedTx) {
      return cachedTx
    }
    // TODO make proper use of the network
    const gethResult = await this.pollingProviders.ethereum.getTransaction(
      txHash
    )
    const newTransaction = transactionFromEthersTransaction(
      gethResult,
      ETH,
      network
    )

    if (!newTransaction.blockHash && !newTransaction.blockHeight) {
      this.subscribeToTransactionConfirmation(network, newTransaction)
    }

    // TODO proper provider string
    this.saveTransaction(newTransaction, "alchemy")
    return newTransaction
  }

  /**
   * Queues up a particular transaction hash for later retrieval.
   *
   * Using this method means the service can decide when to retrieve a
   * particular transaction. Queued transactions are generally retrieved on a
   * periodic basis.
   *
   * @param network The network on which the transaction has been broadcast.
   * @param txHash The tx hash identifier of the transaction we want to retrieve.
   * @param firstSeen The timestamp at which the queued transaction was first
   *        seen; used to treat transactions as dropped after a certain amount
   *        of time.
   */
  async queueTransactionHashToRetrieve(
    network: EVMNetwork,
    txHash: HexString,
    firstSeen: UNIXTime
  ): Promise<void> {
    // TODO make proper use of the network
    const seen = new Set(
      this.transactionsToRetrieve.ethereum.map(({ hash }) => hash)
    )
    if (!seen.has(txHash)) {
      this.transactionsToRetrieve.ethereum.push({ hash: txHash, firstSeen })
    }
  }

  /**
   * Estimate the gas needed to make a transaction. Adds 10% as a safety net to
   * the base estimate returned by the provider.
   */
  async estimateGasLimit(
    network: EVMNetwork,
    transactionRequest: EIP1559TransactionRequest
  ): Promise<bigint> {
    const estimate = await this.pollingProviders.ethereum.estimateGas(
      ethersTransactionRequestFromEIP1559TransactionRequest(transactionRequest)
    )
    // Add 10% more gas as a safety net
    const uppedEstimate = estimate.add(estimate.div(10))
    return BigInt(uppedEstimate.toString())
  }

  /**
   * Broadcast a signed EVM transaction.
   *
   * @param transaction A signed EVM transaction to broadcast. Since the tx is signed,
   *        it needs to include all gas limit and price params.
   */
  async broadcastSignedTransaction(
    transaction: SignedEVMTransaction
  ): Promise<void> {
    // TODO make proper use of tx.network to choose provider
    const serialized = utils.serializeTransaction(
      ethersTransactionFromSignedTransaction(transaction),
      { r: transaction.r, s: transaction.s, v: transaction.v }
    )
    try {
      await Promise.all([
        this.pollingProviders.ethereum
          .sendTransaction(serialized)
          .catch((error) => {
            logger.debug(
              "Broadcast error caught, saving failed status and releasing nonce...",
              transaction,
              error
            )
            // Failure to broadcast needs to be registered.
            this.saveTransaction(
              { ...transaction, status: 0, error: error.toString() },
              "alchemy"
            )
            this.releaseEVMTransactionNonce(transaction)

            return Promise.reject(error)
          }),
        this.subscribeToTransactionConfirmation(
          transaction.network,
          transaction
        ),
        this.saveTransaction(transaction, "local"),
      ])
    } catch (error) {
      logger.error("Error broadcasting transaction", transaction, error)

      throw error
    }
  }

  /*
   * Periodically fetch block prices and emit an event whenever new data is received
   * Write block prices to IndexedDB so we have them for later
   */
  async pollBlockPrices(): Promise<void> {
    await Promise.allSettled(
      this.subscribedNetworks.map(async ({ network, provider }) => {
        const blockPrices = await getBlockPrices(network, provider)
        this.emitter.emit("blockPrices", blockPrices)
      })
    )
  }

  async send(method: string, params: unknown[]): Promise<unknown> {
    return this.websocketProviders.ethereum.send(method, params)
  }

  /* *****************
   * PRIVATE METHODS *
   * **************** */

  /**
   * Ensure the given network is supported; otherwise, log and throw.
   */
  private checkNetwork(network: EVMNetwork): void {
    if (network.name !== this.ethereumNetwork.name) {
      logger.error(
        "Request received for operation on unsupported network",
        network,
        "expected",
        this.ethereumNetwork
      )
    }
  }

  /**
   * Load recent asset transfers from an account on a particular network. Backs
   * off exponentially (in block range, not in time) on failure.
   *
   * @param addressNetwork the address and network whose asset transfers we need
   */
  private async loadRecentAssetTransfers(
    addressNetwork: AddressOnNetwork
  ): Promise<void> {
    const blockHeight =
      (await this.getBlockHeight(addressNetwork.network)) -
      BLOCKS_TO_SKIP_FOR_TRANSACTION_HISTORY
    let fromBlock = blockHeight - BLOCKS_FOR_TRANSACTION_HISTORY
    try {
      return await this.loadAssetTransfers(
        addressNetwork,
        BigInt(fromBlock),
        BigInt(blockHeight)
      )
    } catch (err) {
      logger.error(
        "Failed loaded recent assets, retrying with shorter block range",
        addressNetwork,
        err
      )
    }

    // TODO replace the home-spun backoff with a util function
    fromBlock = blockHeight - Math.floor(BLOCKS_FOR_TRANSACTION_HISTORY / 2)
    try {
      return await this.loadAssetTransfers(
        addressNetwork,
        BigInt(fromBlock),
        BigInt(blockHeight)
      )
    } catch (err) {
      logger.error(
        "Second failure loading recent assets, retrying with shorter block range",
        addressNetwork,
        err
      )
    }

    fromBlock = blockHeight - Math.floor(BLOCKS_FOR_TRANSACTION_HISTORY / 4)
    try {
      return await this.loadAssetTransfers(
        addressNetwork,
        BigInt(fromBlock),
        BigInt(blockHeight)
      )
    } catch (err) {
      logger.error(
        "Final failure loading recent assets for account",
        addressNetwork,
        err
      )
    }
    return Promise.resolve()
  }

  /**
   * Continue to load historic asset transfers, finding the oldest lookup and
   * searching for asset transfers before that block.
   *
   * @param addressNetwork The account whose asset transfers are being loaded.
   */
  private async loadHistoricAssetTransfers(
    addressNetwork: AddressOnNetwork
  ): Promise<void> {
    const oldest = await this.db.getOldestAccountAssetTransferLookup(
      addressNetwork
    )
    const newest = await this.db.getNewestAccountAssetTransferLookup(
      addressNetwork
    )

    if (newest !== null && oldest !== null) {
      const range = newest - oldest
      if (
        range <
        BLOCKS_FOR_TRANSACTION_HISTORY *
          HISTORIC_ASSET_TRANSFER_LOOKUPS_PER_ACCOUNT
      ) {
        // if we haven't hit 10x the single-call limit, pull another.
        await this.loadAssetTransfers(
          addressNetwork,
          oldest - BigInt(BLOCKS_FOR_TRANSACTION_HISTORY),
          oldest
        )
      }
    }
  }

  /**
   * Load asset transfers from an account on a particular network within a
   * particular block range. Emit events for any transfers found, and look up
   * any related transactions and blocks.
   *
   * @param addressOnNetwork the address and network whose asset transfers we need
   */
  private async loadAssetTransfers(
    addressOnNetwork: AddressOnNetwork,
    startBlock: bigint,
    endBlock: bigint
  ): Promise<void> {
    this.checkNetwork(addressOnNetwork.network)

    // TODO only works on Ethereum today
    const assetTransfers = await getAssetTransfers(
      this.pollingProviders.ethereum,
      addressOnNetwork,
      Number(startBlock),
      Number(endBlock)
    )

    await this.db.recordAccountAssetTransferLookup(
      addressOnNetwork,
      startBlock,
      endBlock
    )

    this.emitter.emit("assetTransfers", {
      addressNetwork: addressOnNetwork,
      assetTransfers,
    })

    const firstSeen = Date.now()
    /// send all found tx hashes into a queue to retrieve + cache
    assetTransfers.forEach((a) =>
      this.queueTransactionHashToRetrieve(
        addressOnNetwork.network,
        normalizeEVMAddress(a.txHash),
        firstSeen
      )
    )
  }

  private async handleHistoricAssetTransferAlarm(): Promise<void> {
    const accountsToTrack = await this.db.getAccountsToTrack()

    await Promise.allSettled(
      accountsToTrack.map((an) => this.loadHistoricAssetTransfers(an))
    )
  }

  private async handleQueuedTransactionAlarm(): Promise<void> {
    // TODO make this multi network
    const toHandle = this.transactionsToRetrieve.ethereum.slice(
      0,
      TRANSACTIONS_RETRIEVED_PER_ALARM
    )
    this.transactionsToRetrieve.ethereum =
      this.transactionsToRetrieve.ethereum.slice(
        TRANSACTIONS_RETRIEVED_PER_ALARM
      )

    const network = this.ethereumNetwork

    toHandle.forEach(async ({ hash, firstSeen }) => {
      const normalizedHash = normalizeEVMAddress(hash)
      try {
        // TODO make this multi network
        const result = await this.pollingProviders.ethereum.getTransaction(
          normalizedHash
        )

        const transaction = transactionFromEthersTransaction(
          result,
          ETH,
          network
        )

        // TODO make this provider specific
        await this.saveTransaction(transaction, "alchemy")

        if (!transaction.blockHash && !transaction.blockHeight) {
          this.subscribeToTransactionConfirmation(
            transaction.network,
            transaction
          )
        } else if (transaction.blockHash) {
          // Get relevant block data.
          await this.getBlockData(
            transaction.network,
            normalizeEVMAddress(transaction.blockHash)
          )
          // Retrieve gas used, status, etc
          this.retrieveTransactionReceipt(transaction.network, transaction)
        }
      } catch (error) {
        logger.error(`Error retrieving transaction ${hash}`, error)
        if (Date.now() <= firstSeen + TRANSACTION_CHECK_LIFETIME_MS) {
          this.queueTransactionHashToRetrieve(
            network,
            normalizeEVMAddress(hash),
            firstSeen
          )
        } else {
          logger.warn(
            `Transaction ${normalizedHash} is too old to keep looking for it; treating ` +
              "it as expired."
          )

          this.db
            .getTransaction(network, normalizeEVMAddress(hash))
            .then((existingTransaction) => {
              if (existingTransaction !== null) {
                logger.debug(
                  "Found existing transaction for expired lookup; marking as " +
                    "failed if no other status exists."
                )
                this.saveTransaction(
                  // Don't override an already-persisted successful status with
                  // an expiration-based failed status, but do set status to
                  // failure if no transaction was seen.
                  { status: 0, ...existingTransaction },
                  "local"
                )
              }
            })
        }
      }
    })
  }

  /**
   * Save a transaction to the database and emit an event.
   *
   * @param transaction The transaction to save and emit. Uniqueness and
   *        ordering will be handled by the database.
   * @param dataSource Where the transaction was seen.
   */
  private async saveTransaction(
    transaction: AnyEVMTransaction,
    dataSource: "local" | "alchemy"
  ): Promise<void> {
    // Merge existing data into the updated transaction data. This handles
    // cases where an existing transaction has been enriched by e.g. a receipt,
    // and new data comes in.
    const existing = await this.db.getTransaction(
      transaction.network,
      transaction.hash
    )
    const finalTransaction = {
      ...existing,
      ...transaction,
    }

    let error: unknown = null
    try {
      await this.db.addOrUpdateTransaction(
        {
          // Don't lose fields the existing transaction has pulled, e.g. from a
          // transaction receipt.
          ...existing,
          ...finalTransaction,
        },
        dataSource
      )
    } catch (err) {
      error = err
      logger.error(`Error saving tx ${finalTransaction}`, error)
    }
    try {
      const accounts = await this.getAccountsToTrack()

      const forAccounts = accounts
        .filter(
          ({ address }) =>
            sameEVMAddress(finalTransaction.from, address) ||
            sameEVMAddress(finalTransaction.to, address)
        )
        .map(({ address }) => {
          return normalizeEVMAddress(address)
        })

      // emit in a separate try so outside services still get the tx
      this.emitter.emit("transaction", {
        transaction: finalTransaction,
        forAccounts,
      })
    } catch (err) {
      error = err
      logger.error(`Error emitting tx ${finalTransaction}`, error)
    }
    if (error) {
      throw error
    }
  }

  /**
   * Looks up whether any of the passed address/network pairs are being tracked.
   */
  async isTrackingAddressesOnNetworks(
    ...addressesOnNetworks: AddressOnNetwork[]
  ): Promise<boolean> {
    const accounts = await this.getAccountsToTrack()

    return addressesOnNetworks.some(({ address, network }) =>
      accounts.some(
        ({ address: trackedAddress, network: trackedNetwork }) =>
          sameEVMAddress(trackedAddress, address) &&
          network.name === trackedNetwork.name
      )
    )
  }

  /**
   * Watch a network for new blocks, saving each to the database and emitting an
   * event. Re-orgs are currently ignored.
   *
   * @param network The EVM network to watch.
   */
  private async subscribeToNewHeads(network: EVMNetwork): Promise<void> {
    // TODO look up provider network properly
    const provider = this.websocketProviders.ethereum
    // eslint-disable-next-line no-underscore-dangle
    await provider._subscribe(
      "newHeadsSubscriptionID",
      ["newHeads"],
      async (result: unknown) => {
        // add new head to database
        const block = blockFromWebsocketBlock(network, result)
        await this.db.addBlock(block)
        // emit the new block, don't wait to settle
        this.emitter.emit("block", block)
        // TODO if it matches a known blockheight and the difficulty is higher,
        // emit a reorg event
      }
    )
    this.subscribedNetworks.push({
      network,
      provider,
    })

    this.pollBlockPrices()
  }

  /**
   * Watch logs for an account's transactions on a particular network.
   *
   * @param addressOnNetwork The network and address to watch.
   */
  private async subscribeToAccountTransactions({
    address,
    network,
  }: AddressOnNetwork): Promise<void> {
    this.checkNetwork(network)

    // TODO look up provider network properly
    const provider = this.websocketProviders.ethereum
    // eslint-disable-next-line no-underscore-dangle
    await provider._subscribe(
      "filteredNewFullPendingTransactionsSubscriptionID",
      ["alchemy_filteredNewFullPendingTransactions", { address }],
      async (result: unknown) => {
        // TODO use proper provider string
        // handle incoming transactions for an account
        try {
          const transaction = transactionFromAlchemyWebsocketTransaction(
            result,
            ETH,
            network
          )

          const normalizedFromAddress = normalizeEVMAddress(transaction.from)

          // If this is an EVM chain, we're tracking the from address's
          // nonce, and the pending transaction has a higher nonce, update our
          // view of it. This helps reduce the number of times when a
          // transaction submitted outside of this wallet causes this wallet to
          // produce bad transactions with reused nonces.
          if (
            typeof network.chainID !== "undefined" &&
            typeof this.evmChainLastSeenNoncesByNormalizedAddress[
              network.chainID
            ]?.[normalizedFromAddress] !== "undefined" &&
            this.evmChainLastSeenNoncesByNormalizedAddress[network.chainID]?.[
              normalizedFromAddress
            ] <= transaction.nonce
          ) {
            this.evmChainLastSeenNoncesByNormalizedAddress[network.chainID][
              normalizedFromAddress
            ] = transaction.nonce
          }
          await this.saveTransaction(transaction, "alchemy")

          // Wait for confirmation/receipt information.
          this.subscribeToTransactionConfirmation(network, transaction)
        } catch (error) {
          logger.error(`Error saving tx: ${result}`, error)
        }
      }
    )
    this.subscribedAccounts.push({
      account: normalizeEVMAddress(address),
      provider,
    })
  }

  /**
   * Track an pending transaction's confirmation status, saving any updates to
   * the database and informing subscribers via the emitter.
   *
   * @param network the EVM network we're interested in
   * @param transaction the unconfirmed transaction we're interested in
   */
  private async subscribeToTransactionConfirmation(
    network: EVMNetwork,
    transaction: AnyEVMTransaction
  ): Promise<void> {
    this.checkNetwork(network)

    // TODO make proper use of the network
    this.websocketProviders.ethereum.once(
      normalizeEVMAddress(transaction.hash),
      (confirmedReceipt: TransactionReceipt) => {
        this.saveTransaction(
          enrichTransactionWithReceipt(transaction, confirmedReceipt),
          "alchemy"
        )
      }
    )
  }

  /**
   * Retrieve a confirmed transaction's transaction receipt, saving the results.
   *
   * @param network the EVM network we're interested in
   * @param transaction the confirmed transaction we're interested in
   */
  private async retrieveTransactionReceipt(
    network: EVMNetwork,
    transaction: AnyEVMTransaction
  ): Promise<void> {
    this.checkNetwork(network)

    // TODO make proper use of the network
    const receipt = await this.pollingProviders.ethereum.getTransactionReceipt(
      normalizeEVMAddress(transaction.hash)
    )
    await this.saveTransaction(
      enrichTransactionWithReceipt(transaction, receipt),
      "alchemy"
    )
  }

  // TODO removing an account to track
}
