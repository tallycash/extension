import {
  AnyAssetAmount,
  SmartContractFungibleAsset,
  isSmartContractFungibleAsset,
} from "../../assets"
import {
  AnyEVMTransaction,
  EIP1559TransactionRequest,
  Network,
} from "../../networks"
import {
  AssetDecimalAmount,
  enrichAssetAmountWithDecimalValues,
} from "../../redux-slices/utils/asset-utils"

import { HexString, UNIXTime } from "../../types"
import { ETH } from "../../constants"
import { parseERC20Tx } from "../../lib/erc20"
import { sameEVMAddress } from "../../lib/utils"

import ChainService from "../chain"
import IndexingService from "../indexing"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import BaseService from "../base"
import { parseUniswapTx } from "../../lib/uniswap"

export type BaseTransactionAnnotation = {
  // a URL to an image representing the transaction interaction, if applicable.
  transactionLogoURL?: string | undefined
  // when the transaction was annotated. Including this means consumers can more
  // easily upsert annotations
  timestamp: UNIXTime
}

export type ContractDeployment = BaseTransactionAnnotation & {
  type: "contract-deployment"
}

export type ContractInteraction = BaseTransactionAnnotation & {
  type: "contract-interaction"
  assetAmount?: string // @TODO properly type
}

export type AssetApproval = BaseTransactionAnnotation & {
  type: "asset-approval"
  assetAmount: AnyAssetAmount & AssetDecimalAmount
  spenderAddress: HexString
}

export type AssetTransfer = BaseTransactionAnnotation & {
  type: "asset-transfer"
  assetAmount: AnyAssetAmount & AssetDecimalAmount
  recipientAddress: HexString
  senderAddress: HexString
}

export type AssetSwap = BaseTransactionAnnotation & {
  type: "asset-swap"
  fromAssetAmount: AnyAssetAmount & AssetDecimalAmount
  toAssetAmount: AnyAssetAmount & AssetDecimalAmount
}

export type TransactionAnnotation =
  | ContractDeployment
  | ContractInteraction
  | AssetApproval
  | AssetTransfer
  | AssetSwap
  | undefined

export type ResolvedTransactionAnnotation = {
  contractInfo: TransactionAnnotation
  address: HexString
  network: Network
  resolvedAt: UNIXTime
}

export type EnrichedEVMTransaction = AnyEVMTransaction & {
  annotation?: TransactionAnnotation
}

export type EnrichedEVMTransactionSignatureRequest =
  (Partial<EIP1559TransactionRequest> & { from: string }) & {
    annotation?: TransactionAnnotation
  }

export type EnrichedEIP1559TransactionRequest = EIP1559TransactionRequest & {
  annotation?: TransactionAnnotation
}

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
          forAccounts,
        })
      }
    )
  }

  async resolveTransactionAnnotation(
    transaction:
      | AnyEVMTransaction
      | (Partial<EIP1559TransactionRequest> & { from: string }),
    desiredDecimals: number
  ): Promise<TransactionAnnotation | undefined> {
    let txAnnotation: TransactionAnnotation | undefined

    if (typeof transaction.to === "undefined") {
      // A missing recipient means a contract deployment.
      txAnnotation = {
        timestamp: Date.now(),
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
      if (transaction.value) {
        txAnnotation = {
          timestamp: Date.now(),
          type: "asset-transfer",
          senderAddress: transaction.from,
          recipientAddress: transaction.to, // TODO ingest address
          assetAmount: enrichAssetAmountWithDecimalValues(
            {
              asset: ETH,
              amount: transaction.value,
            },
            desiredDecimals
          ),
        }
      } else {
        // Fall back on a standard contract interaction.
        txAnnotation = {
          timestamp: Date.now(),
          type: "contract-interaction",
        }
      }
    } else {
      const assets = await this.indexingService.getCachedAssets()

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
          timestamp: Date.now(),
          type: "asset-transfer",
          transactionLogoURL,
          senderAddress: erc20Tx.args.from ?? transaction.to,
          recipientAddress: erc20Tx.args.to, // TODO ingest address
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
          timestamp: Date.now(),
          type: "asset-approval",
          transactionLogoURL,
          spenderAddress: erc20Tx.args.spender, // TODO ingest address
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

        // If we are interacting with Uniswap
        if (transaction.to === "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45") {
          const uniswapTx = await parseUniswapTx(transaction.input)

          if (uniswapTx) {
            txAnnotation = {
              type: "contract-interaction",
              timestamp: Date.now(),
              transactionLogoURL,
              assetAmount: uniswapTx.amount,
            }
            return txAnnotation
          }
        }
        txAnnotation = {
          timestamp: Date.now(),
          type: "contract-interaction",
          // Include the logo URL if we resolve it even if the interaction is
          // non-specific; the UI can choose to use it or not, but if we know the
          // address has an associated logo it's worth passing on.
          transactionLogoURL,
        }
      }
    }

    return txAnnotation
  }

  async enrichTransactionSignature(
    transaction: Partial<EIP1559TransactionRequest> & { from: string },
    desiredDecimals: number
  ): Promise<EnrichedEVMTransactionSignatureRequest> {
    const enrichedTxSignatureRequest = {
      ...transaction,
      annotation: await this.resolveTransactionAnnotation(
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
        transaction,
        desiredDecimals
      ),
    }

    return enrichedTx
  }
}
