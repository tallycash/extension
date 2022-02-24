import {
  isSmartContractFungibleAsset,
  SmartContractFungibleAsset,
} from "../../assets"
import {
  AnyEVMTransaction,
  EIP1559TransactionRequest,
  EVMNetwork,
} from "../../networks"
import { enrichAssetAmountWithDecimalValues } from "../../redux-slices/utils/asset-utils"

import { ETH } from "../../constants"
import { parseERC20Tx, parseLogsForERC20Transfers } from "../../lib/erc20"
import {
  normalizeEVMAddress,
  normalizeEVMAddressList,
  sameEVMAddress,
} from "../../lib/utils"
import BaseService from "../base"
import ChainService from "../chain"
import IndexingService from "../indexing"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import {
  EnrichedEVMTransaction,
  EnrichedEVMTransactionSignatureRequest,
  TransactionAnnotation,
} from "./types"

export * from "./types"

interface Events extends ServiceLifecycleEvents {
  enrichedEVMTransaction: {
    transaction: EnrichedEVMTransaction
    forAccounts: string[]
  }
  enrichedEVMTransactionSignatureRequest: EnrichedEVMTransactionSignatureRequest
}

/**
 * EnrichmentService is a coordinator service responsible for deciding when to
 * look up metadata about an application-level transaction, event, or address,
 * and annotating those entities for display UI.
 *
 * EnrichmentService acts primarily as a coordinator of ChainService,
 * IndexingService, and NameService to build annotations. It will need to
 * retrieve function selector and contract source code itself, but should
 * always prefer to delegate to a lower-lever service when possible.
 */
export default class EnrichmentService extends BaseService<Events> {
  /**
   * Create a new EnrichmentService. The service isn't initialized until
   * startService() is called and resolved.
   * @param indexingService - Required for token metadata and currency
   * @param chainService - Required for chain interactions.
   * @returns A new, initializing EnrichmentService
   */
  static create: ServiceCreatorFunction<
    Events,
    EnrichmentService,
    [Promise<ChainService>, Promise<IndexingService>]
  > = async (chainService, indexingService) => {
    return new this(await chainService, await indexingService)
  }

  private constructor(
    private chainService: ChainService,
    private indexingService: IndexingService
  ) {
    super({})
  }

  async internalStartService(): Promise<void> {
    await super.internalStartService()

    await this.connectChainServiceEvents()
  }

  private async connectChainServiceEvents(): Promise<void> {
    this.chainService.emitter.on(
      "transaction",
      async ({ transaction, forAccounts }) => {
        this.emitter.emit("enrichedEVMTransaction", {
          transaction: await this.enrichTransaction(
            transaction,
            2 /* TODO desiredDecimals should be configurable */
          ),
          forAccounts: normalizeEVMAddressList(forAccounts),
        })
      }
    )
  }

  async resolveTransactionAnnotation(
    network: EVMNetwork,
    transaction:
      | AnyEVMTransaction
      | (Partial<EIP1559TransactionRequest> & { from: string }),
    desiredDecimals: number
  ): Promise<TransactionAnnotation | undefined> {
    let txAnnotation: TransactionAnnotation | undefined

    const resolvedTime = Date.now()

    if (typeof transaction.to === "undefined") {
      // A missing recipient means a contract deployment.
      txAnnotation = {
        timestamp: resolvedTime,
        type: "contract-deployment",
      }
    } else if (
      transaction.input === null ||
      transaction.input === "0x" ||
      typeof transaction.input === "undefined"
    ) {
      // This is _almost certainly_ not a contract interaction, move on. Note that
      // a simple ETH send to a contract address can still effectively be a
      // contract interaction (because it calls the fallback function on the
      // contract), but for now we deliberately ignore that scenario when
      // categorizing activities.
      // TODO We can do more here by checking how much gas was spent. Anything
      // over the 21k required to send ETH is a more complex contract interaction
      if (typeof transaction.value !== "undefined") {
        txAnnotation = {
          timestamp: resolvedTime,
          type: "asset-transfer",
          senderAddress: normalizeEVMAddress(transaction.from),
          recipientAddress: normalizeEVMAddress(transaction.to), // TODO ingest address
          assetAmount: enrichAssetAmountWithDecimalValues(
            {
              asset: network.baseAsset,
              amount: transaction.value,
            },
            desiredDecimals
          ),
        }
      } else {
        // Fall back on a standard contract interaction.
        txAnnotation = {
          timestamp: resolvedTime,
          type: "contract-interaction",
        }
      }
    } else {
      const assets = await this.indexingService.getCachedAssets(network)

      // See if the address matches a fungible asset.
      const matchingFungibleAsset = assets.find(
        (asset): asset is SmartContractFungibleAsset =>
          isSmartContractFungibleAsset(asset) &&
          sameEVMAddress(asset.contractAddress, transaction.to)
      )

      const transactionLogoURL = matchingFungibleAsset?.metadata?.logoURL

      const erc20Tx = parseERC20Tx(transaction.input)

      // TODO handle the case where we don't have asset metadata already
      if (
        matchingFungibleAsset &&
        erc20Tx &&
        (erc20Tx.name === "transfer" || erc20Tx.name === "transferFrom")
      ) {
        // We have an ERC-20 transfer
        txAnnotation = {
          timestamp: resolvedTime,
          type: "asset-transfer",
          transactionLogoURL,
          senderAddress: normalizeEVMAddress(
            erc20Tx.args.from ?? transaction.to
          ),
          recipientAddress: normalizeEVMAddress(erc20Tx.args.to), // TODO ingest address
          assetAmount: enrichAssetAmountWithDecimalValues(
            {
              asset: matchingFungibleAsset,
              amount: BigInt(erc20Tx.args.amount),
            },
            desiredDecimals
          ),
        }
      } else if (
        matchingFungibleAsset &&
        erc20Tx &&
        erc20Tx.name === "approve"
      ) {
        txAnnotation = {
          timestamp: resolvedTime,
          type: "asset-approval",
          transactionLogoURL,
          spenderAddress: normalizeEVMAddress(erc20Tx.args.spender), // TODO ingest address
          assetAmount: enrichAssetAmountWithDecimalValues(
            {
              asset: matchingFungibleAsset,
              amount: BigInt(erc20Tx.args.value),
            },
            desiredDecimals
          ),
        }
      } else {
        // Fall back on a standard contract interaction.
        txAnnotation = {
          timestamp: resolvedTime,
          type: "contract-interaction",
          // Include the logo URL if we resolve it even if the interaction is
          // non-specific; the UI can choose to use it or not, but if we know the
          // address has an associated logo it's worth passing on.
          transactionLogoURL,
        }
      }
    }

    // Look up logs and resolve subannotations, if available.
    if ("logs" in transaction && typeof transaction.logs !== "undefined") {
      const assets = await this.indexingService.getCachedAssets(network)

      const subannotations = parseLogsForERC20Transfers(
        transaction.logs
      ).flatMap<TransactionAnnotation>(
        ({ contractAddress, amount, senderAddress, recipientAddress }) => {
          // See if the address matches a fungible asset.
          const matchingFungibleAsset = assets.find(
            (asset): asset is SmartContractFungibleAsset =>
              isSmartContractFungibleAsset(asset) &&
              sameEVMAddress(asset.contractAddress, contractAddress)
          )

          return typeof matchingFungibleAsset !== "undefined"
            ? [
                {
                  type: "asset-transfer",
                  assetAmount: enrichAssetAmountWithDecimalValues(
                    {
                      asset: matchingFungibleAsset,
                      amount,
                    },
                    desiredDecimals
                  ),
                  senderAddress,
                  recipientAddress,
                  timestamp: resolvedTime,
                },
              ]
            : []
        }
      )

      if (subannotations.length > 0) {
        txAnnotation.subannotations = subannotations
      }
    }

    return txAnnotation
  }

  async enrichTransactionSignature(
    network: EVMNetwork,
    transaction: Partial<EIP1559TransactionRequest> & { from: string },
    desiredDecimals: number
  ): Promise<EnrichedEVMTransactionSignatureRequest> {
    const enrichedTxSignatureRequest = {
      ...transaction,
      annotation: await this.resolveTransactionAnnotation(
        network,
        transaction,
        desiredDecimals
      ),
    }

    this.emitter.emit(
      "enrichedEVMTransactionSignatureRequest",
      enrichedTxSignatureRequest
    )

    return enrichedTxSignatureRequest
  }

  async enrichTransaction(
    transaction: AnyEVMTransaction,
    desiredDecimals: number
  ): Promise<EnrichedEVMTransaction> {
    const enrichedTx = {
      ...transaction,
      annotation: await this.resolveTransactionAnnotation(
        transaction.network,
        transaction,
        desiredDecimals
      ),
    }

    return enrichedTx
  }
}
