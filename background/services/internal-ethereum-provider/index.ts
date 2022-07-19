import { TransactionRequest as EthersTransactionRequest } from "@ethersproject/abstract-provider"
import { serialize as serializeEthersTransaction } from "@ethersproject/transactions"

import {
  EIP1193Error,
  EIP1193_ERROR_CODES,
  RPCRequest,
} from "@tallyho/provider-bridge-shared"
import { hexlify, toUtf8Bytes } from "ethers/lib/utils"
import logger from "../../lib/logger"

import BaseService from "../base"
import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import ChainService from "../chain"
import {
  EIP1559TransactionRequest,
  EVMNetwork,
  SignedEVMTransaction,
  toHexChainID,
} from "../../networks"
import {
  eip1559TransactionRequestFromEthersTransactionRequest,
  ethersTransactionFromSignedTransaction,
} from "../chain/utils"
import PreferenceService from "../preferences"
import { internalProviderPort } from "../../redux-slices/utils/contract-utils"

import {
  SignTypedDataRequest,
  SignDataRequest,
  parseSigningData,
} from "../../utils/signing"
import { SUPPORT_POLYGON } from "../../features"
import {
  ActiveNetwork,
  getOrCreateDB,
  InternalEthereumProviderDatabase,
} from "./db"
import { TALLY_INTERNAL_ORIGIN } from "./constants"
import { ETHEREUM } from "../../constants"

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

// https://eips.ethereum.org/EIPS/eip-3326
export type SwitchEthereumChainParameter = {
  chainId: string
}

type DAppRequestEvent<T, E> = {
  payload: T
  resolver: (result: E | PromiseLike<E>) => void
  rejecter: () => void
}

type Events = ServiceLifecycleEvents & {
  transactionSignatureRequest: DAppRequestEvent<
    Partial<EIP1559TransactionRequest> & { from: string; network: EVMNetwork },
    SignedEVMTransaction
  >
  signTypedDataRequest: DAppRequestEvent<SignTypedDataRequest, string>
  signDataRequest: DAppRequestEvent<SignDataRequest, string>
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
    return new this(
      await getOrCreateDB(),
      await chainService,
      await preferenceService
    )
  }

  private constructor(
    private db: InternalEthereumProviderDatabase,
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
            event.request.params,
            TALLY_INTERNAL_ORIGIN
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

  // @TODO Persist this in db so we get correct network on app startup.
  private activeNetwork = ETHEREUM

  async routeSafeRPCRequest(
    method: string,
    params: RPCRequest["params"],
    origin: string
  ): Promise<unknown> {
    switch (method) {
      // supported alchemy methods: https://docs.alchemy.com/alchemy/apis/ethereum
      case "eth_signTypedData":
      case "eth_signTypedData_v1":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4":
        return this.signTypedData({
          account: {
            address: params[0] as string,
            network: await this.getActiveOrDefaultNetwork(origin),
          },
          typedData: JSON.parse(params[1] as string),
        })
      case "eth_chainId":
        // TODO Decide on a better way to track whether a particular chain is
        // allowed to have an RPC call made to it. Ideally this would be based
        // on a user's idea of a dApp connection rather than a network-specific
        // modality, requiring it to be constantly "switched"
        return toHexChainID(
          (await this.getActiveOrDefaultNetwork(origin)).chainID
        )
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
        return this.chainService.send(
          method,
          params,
          await this.getActiveOrDefaultNetwork(origin)
        )
      case "eth_accounts": {
        // This is a special method, because Alchemy provider DO support it, but always return null (because they do not store keys.)
        const { address } = await this.preferenceService.getSelectedAccount()
        return [address]
      }
      case "eth_sendTransaction":
        return this.signTransaction(
          params[0] as JsonRpcTransactionRequest,
          origin
        ).then(async (signed) => {
          await this.chainService.broadcastSignedTransaction(signed)
          return signed.hash
        })
      case "eth_signTransaction":
        return this.signTransaction(
          params[0] as JsonRpcTransactionRequest,
          origin
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
        return this.signData(
          {
            input: params[1] as string,
            account: params[0] as string,
          },
          origin
        )
      case "personal_sign":
        return this.signData(
          {
            input: params[0] as string,
            account: params[1] as string,
          },
          origin
        )
      // TODO - actually allow adding a new ethereum chain - for now wallet_addEthereumChain
      // will just switch to a chain if we already support it - but not add a new one
      case "wallet_addEthereumChain":
      case "wallet_switchEthereumChain": {
        if (SUPPORT_POLYGON) {
          const newChainId = (params[0] as SwitchEthereumChainParameter).chainId
          const supportedNetwork = this.getSupportedNetworkByChainId(newChainId)
          if (supportedNetwork) {
            await this.db.setActiveChainIdForOrigin(origin, supportedNetwork)
            return null
          }
          throw new EIP1193Error(EIP1193_ERROR_CODES.chainDisconnected)
        }
        throw new EIP1193Error(EIP1193_ERROR_CODES.unsupportedMethod)
      }
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
      case "eth_submitHashrate":
      case "eth_submitWork":
      case "metamask_accountsChanged":
      case "metamask_chainChanged":
      case "metamask_logWeb3ShimUsage":
      case "metamask_unlockStateChanged":
      case "metamask_watchAsset":
      case "net_peerCount":
      case "wallet_accountsChanged":
      case "wallet_registerOnboarding":
      default:
        throw new EIP1193Error(EIP1193_ERROR_CODES.unsupportedMethod)
    }
  }

  private async getInternalActiveChain(): Promise<ActiveNetwork> {
    return this.db.getActiveNetworkForOrigin(
      TALLY_INTERNAL_ORIGIN
    ) as Promise<ActiveNetwork>
  }

  async getActiveOrDefaultNetwork(origin: string): Promise<EVMNetwork> {
    if (SUPPORT_POLYGON) {
      const activeNetwork = await this.db.getActiveNetworkForOrigin(origin)
      if (!activeNetwork) {
        // If this is a new dapp or the dapp has not implemented wallet_switchEthereumChain
        // use the default network.
        const defaultNetwork = (await this.getInternalActiveChain()).network
        return defaultNetwork
      }
      return activeNetwork.network
    }
    return this.activeNetwork
  }

  private async signTransaction(
    transactionRequest: JsonRpcTransactionRequest,
    origin: string
  ) {
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

    const activeNetwork = await this.getActiveOrDefaultNetwork(origin)

    return new Promise<SignedEVMTransaction>((resolve, reject) => {
      this.emitter.emit("transactionSignatureRequest", {
        payload: {
          ...convertedRequest,
          from,
          network: activeNetwork,
        },
        resolver: resolve,
        rejecter: reject,
      })
    })
  }

  getSupportedNetworkByChainId(chainID: string): EVMNetwork | undefined {
    const network = this.chainService.supportedNetworks.find(
      (supportedNetwork) =>
        toHexChainID(supportedNetwork.chainID) === toHexChainID(chainID)
    )
    return network
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

  private async signData(
    {
      input,
      account,
    }: {
      input: string
      account: string
    },
    origin: string
  ) {
    const hexInput = input.match(/^0x[0-9A-Fa-f]*$/)
      ? input
      : hexlify(toUtf8Bytes(input))
    const { data, type } = parseSigningData(input)
    const activeNetwork = await this.getActiveOrDefaultNetwork(origin)

    return new Promise<string>((resolve, reject) => {
      this.emitter.emit("signDataRequest", {
        payload: {
          account: {
            address: account,
            network: activeNetwork,
          },
          signingData: data,
          messageType: type,
          rawSigningData: hexInput,
        },
        resolver: resolve,
        rejecter: reject,
      })
    })
  }
}
