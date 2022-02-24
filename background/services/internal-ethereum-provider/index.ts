import { TransactionRequest as EthersTransactionRequest } from "@ethersproject/abstract-provider"
import { serialize as serializeEthersTransaction } from "@ethersproject/transactions"

import {
  EIP1193Error,
  EIP1193_ERROR_CODES,
  RPCRequest,
} from "@tallyho/provider-bridge-shared"
import logger from "../../lib/logger"

import BaseService from "../base"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import ChainService from "../chain"
import { EIP1559TransactionRequest, SignedEVMTransaction } from "../../networks"
import {
  eip1559TransactionRequestFromEthersTransactionRequest,
  ethersTransactionFromSignedTransaction,
} from "../chain/utils"
import PreferenceService from "../preferences"
import { internalProviderPort } from "../../redux-slices/utils/contract-utils"
import { SignTypedDataRequest } from "../../redux-slices/signing"
import { normalizeEVMAddress } from "../../lib/utils"

// A type representing the transaction requests that come in over JSON-RPC
// requests like eth_sendTransaction and eth_signTransaction. These are very
// similar in structure to the Ethers internal TransactionRequest object, but
// have some subtle-yet-critical differences. Chief among these is the presence
// of `gas` instead of `gasLimit` and the _possibility_ of using `input` instead
// of `data`.
//
// Note that `input` is the newer and more correct field to expect contract call
// data in, but older clients may provide `data` instead. Ethers transmits `data`
// rather than `input` when used as a JSON-RPC client, and expects it as the
// `EthersTransactionRequest` field for that info.
type JsonRpcTransactionRequest = Omit<EthersTransactionRequest, "gasLimit"> & {
  gas?: string
  input?: string
}

type DAppRequestEvent<T, E> = {
  payload: T
  resolver: (result: E | PromiseLike<E>) => void
  rejecter: () => void
}

type Events = ServiceLifecycleEvents & {
  transactionSignatureRequest: DAppRequestEvent<
    Partial<EIP1559TransactionRequest> & { from: string },
    SignedEVMTransaction
  >
  signTypedDataRequest: DAppRequestEvent<SignTypedDataRequest, string>
  // connect
  // disconnet
  // account change
  // networkchange
}

export default class InternalEthereumProviderService extends BaseService<Events> {
  static create: ServiceCreatorFunction<
    Events,
    InternalEthereumProviderService,
    [Promise<ChainService>, Promise<PreferenceService>]
  > = async (chainService, preferenceService) => {
    return new this(await chainService, await preferenceService)
  }

  private constructor(
    private chainService: ChainService,
    private preferenceService: PreferenceService
  ) {
    super()

    internalProviderPort.emitter.on("message", async (event) => {
      logger.log(`internal: request payload: ${JSON.stringify(event)}`)
      try {
        const response = {
          id: event.id,
          result: await this.routeSafeRPCRequest(
            event.request.method,
            event.request.params
          ),
        }
        logger.log("internal response:", response)

        internalProviderPort.postResponse(response)
      } catch (error) {
        logger.log("error processing request", event.id, error)

        internalProviderPort.postResponse({
          id: event.id,
          result: new EIP1193Error(
            EIP1193_ERROR_CODES.userRejectedRequest
          ).toJSON(),
        })
      }
    })
  }

  async routeSafeRPCRequest(
    method: string,
    params: RPCRequest["params"]
  ): Promise<unknown> {
    switch (method) {
      // supported alchemy methods: https://docs.alchemy.com/alchemy/apis/ethereum
      case "eth_signTypedData":
      case "eth_signTypedData_v1":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4":
        return this.signTypedData({
          account: params[0],
          typedData: JSON.parse(params[1] as string),
        } as SignTypedDataRequest)
      case "eth_chainId":
        return this.chainService.ethereumNetwork.chainID

      case "eth_blockNumber":
      case "eth_call":
      case "eth_estimateGas":
      case "eth_feeHistory":
      case "eth_gasPrice":
      case "eth_getBalance":
      case "eth_getBlockByHash":
      case "eth_getBlockByNumber":
      case "eth_getBlockTransactionCountByHash":
      case "eth_getBlockTransactionCountByNumber":
      case "eth_getCode":
      case "eth_getFilterChanges":
      case "eth_getFilterLogs":
      case "eth_getLogs":
      case "eth_getProof":
      case "eth_getStorageAt":
      case "eth_getTransactionByBlockHashAndIndex":
      case "eth_getTransactionByBlockNumberAndIndex":
      case "eth_getTransactionByHash":
      case "eth_getTransactionCount":
      case "eth_getTransactionReceipt":
      case "eth_getUncleByBlockHashAndIndex":
      case "eth_getUncleByBlockNumberAndIndex":
      case "eth_getUncleCountByBlockHash":
      case "eth_getUncleCountByBlockNumber":
      case "eth_maxPriorityFeePerGas":
      case "eth_newBlockFilter":
      case "eth_newFilter":
      case "eth_newPendingTransactionFilter":
      case "eth_protocolVersion":
      case "eth_sendRawTransaction":
      case "eth_subscribe":
      case "eth_syncing":
      case "eth_uninstallFilter":
      case "eth_unsubscribe":
      case "net_listening":
      case "net_version":
      case "web3_clientVersion":
      case "web3_sha3":
        return this.chainService.send(method, params)
      case "eth_accounts": {
        // This is a special method, because Alchemy provider DO support it, but always return null (because they do not store keys.)
        const { address } = await this.preferenceService.getSelectedAccount()
        return [normalizeEVMAddress(address)]
      }
      case "eth_sendTransaction":
        return this.signTransaction(
          params[0] as JsonRpcTransactionRequest
        ).then(async (signed) => {
          await this.chainService.broadcastSignedTransaction(signed)
          return signed.hash
        })
      case "eth_signTransaction":
        return this.signTransaction(
          params[0] as JsonRpcTransactionRequest
        ).then((signedTransaction) =>
          serializeEthersTransaction(
            ethersTransactionFromSignedTransaction(signedTransaction),
            {
              r: signedTransaction.r,
              s: signedTransaction.s,
              v: signedTransaction.v,
            }
          )
        )
      case "eth_sign": // --- important wallet methods ---
      case "metamask_getProviderState": // --- important MM only methods ---
      case "metamask_sendDomainMetadata":
      case "wallet_requestPermissions":
      case "wallet_watchAsset":
      case "estimateGas": // --- eip1193-bridge only method --
      case "eth_coinbase": // --- MM only methods ---
      case "eth_decrypt":
      case "eth_getEncryptionPublicKey":
      case "eth_getWork":
      case "eth_hashrate":
      case "eth_mining":
      case "eth_personalSign":
      case "eth_submitHashrate":
      case "eth_submitWork":
      case "metamask_accountsChanged":
      case "metamask_chainChanged":
      case "metamask_logWeb3ShimUsage":
      case "metamask_unlockStateChanged":
      case "metamask_watchAsset":
      case "net_peerCount":
      case "wallet_accountsChanged":
      case "wallet_addEthereumChain":
      case "wallet_registerOnboarding":
      case "wallet_switchEthereumChain":
      default:
        throw new EIP1193Error(EIP1193_ERROR_CODES.unsupportedMethod)
    }
  }

  private async signTransaction(transactionRequest: JsonRpcTransactionRequest) {
    const { from, ...convertedRequest } =
      eip1559TransactionRequestFromEthersTransactionRequest({
        // Convert input -> data if necessary; if transactionRequest uses data
        // directly, it will be overwritten below. If someone sends both and
        // they differ, may devops199 have mercy on their soul (but we will
        // prefer the explicit `data` rather than the copied `input`).
        data: transactionRequest.input,
        ...transactionRequest,
        gasLimit: transactionRequest.gas, // convert gas -> gasLimit
      })

    if (typeof from === "undefined") {
      throw new Error("Transactions must have a from address for signing.")
    }

    return new Promise<SignedEVMTransaction>((resolve, reject) => {
      this.emitter.emit("transactionSignatureRequest", {
        payload: {
          ...convertedRequest,
          from,
        },
        resolver: resolve,
        rejecter: reject,
      })
    })
  }

  private async signTypedData(params: SignTypedDataRequest) {
    return new Promise<string>((resolve, reject) => {
      this.emitter.emit("signTypedDataRequest", {
        payload: params,
        resolver: resolve,
        rejecter: reject,
      })
    })
  }
}
