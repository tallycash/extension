import {
  AlchemyProvider,
  AlchemyWebSocketProvider,
} from "@ethersproject/providers"
import { BigNumber } from "ethers"

import logger from "./logger"
import { HexString } from "../types"
import {
  AssetTransfer,
  FungibleAsset,
  SmartContractFungibleAsset,
} from "../assets"
import { ETH } from "../constants"
import { convertToHexAndNormalize, normalizeEVMAddress } from "./utils"
import { AnyEVMTransaction, EVMNetwork } from "../networks"
import {
  isValidAlchemyAssetTransferResponse,
  isValidAlchemyTokenBalanceResponse,
  isValidAlchemyTokenMetadataResponse,
} from "./validate"
import { AddressOnNetwork } from "../accounts"

/**
 * Use Alchemy's getAssetTransfers call to get historical transfers for an
 * account.
 *
 * Note that pagination isn't supported in this wrapper, so any responses after
 * 1k transfers will be dropped.
 *
 * More information https://docs.alchemy.com/alchemy/documentation/apis/enhanced-apis/transfers-api#alchemy_getassettransfers
 * @param provider an Alchemy ethers provider
 * @param addressOnNetwork the address whose transfer history we're fetching
 *        and the network it should happen on; note that if the network does
 *        not match the network the provider is set up for, this will likely
 *        fail.
 * @param fromBlock the block height specifying how far in the past we want
 *        to look.
 */
export async function getAssetTransfers(
  provider: AlchemyProvider | AlchemyWebSocketProvider,
  addressOnNetwork: AddressOnNetwork,
  fromBlock: number,
  toBlock?: number
): Promise<AssetTransfer[]> {
  const { address: account, network } = addressOnNetwork

  const params = {
    fromBlock: convertToHexAndNormalize(fromBlock),
    toBlock:
      toBlock === undefined ? "latest" : convertToHexAndNormalize(toBlock),
    // excludeZeroValue: false,
  }

  // TODO handle partial failure
  const rpcResponses = await Promise.all([
    provider.send("alchemy_getAssetTransfers", [
      {
        ...params,
        fromAddress: normalizeEVMAddress(account),
      },
    ]),
    provider.send("alchemy_getAssetTransfers", [
      {
        ...params,
        toAddress: normalizeEVMAddress(account),
      },
    ]),
  ])

  return rpcResponses
    .flatMap((jsonResponse: unknown) => {
      if (isValidAlchemyAssetTransferResponse(jsonResponse)) {
        return jsonResponse.transfers
      }

      logger.warn(
        "Alchemy asset transfer response didn't validate, did the API change?",
        jsonResponse,
        isValidAlchemyAssetTransferResponse.errors
      )
      return []
    })
    .map((transfer) => {
      // TODO handle NFT asset lookup properly
      if (transfer.erc721TokenId) {
        return null
      }

      // we don't care about 0-value transfers
      // TODO handle nonfungible assets properly
      // TODO handle assets with a contract address and no name
      if (
        !transfer.rawContract ||
        !transfer.rawContract.value ||
        !transfer.rawContract.decimal ||
        !transfer.asset
      ) {
        return null
      }

      const asset = !transfer.rawContract.address
        ? {
            contractAddress: transfer.rawContract.address,
            decimals: Number(BigInt(transfer.rawContract.decimal)),
            symbol: transfer.asset,
            homeNetwork: network,
          }
        : ETH
      return {
        network, // TODO make this friendly across other networks
        assetAmount: {
          asset,
          amount: BigInt(transfer.rawContract.value),
        },
        txHash: transfer.hash,
        to: transfer.to,
        from: transfer.from,
        dataSource: "alchemy",
      } as AssetTransfer
    })
    .filter((t): t is AssetTransfer => t !== null)
}

/**
 * Use Alchemy's getTokenBalances call to get balances for a particular address.
 *
 *
 * More information https://docs.alchemy.com/alchemy/documentation/enhanced-apis/token-api
 *
 * @param provider an Alchemy ethers provider
 * @param address the address whose balances we're fetching
 * @param tokens An optional list of hex-string contract addresses. If the list
 *        isn't provided, Alchemy will choose based on the top 100 high-volume
 *        tokens on its platform
 */
export async function getTokenBalances(
  provider: AlchemyProvider | AlchemyWebSocketProvider,
  address: HexString,
  tokens?: HexString[]
): Promise<{ contractAddress: string; amount: bigint }[]> {
  const json: unknown = await provider.send("alchemy_getTokenBalances", [
    address,
    tokens || "DEFAULT_TOKENS",
  ])
  if (!isValidAlchemyTokenBalanceResponse(json)) {
    logger.warn(
      "Alchemy token balance response didn't validate, did the API change?",
      json,
      isValidAlchemyTokenBalanceResponse.errors
    )
    return []
  }

  // TODO log balances with errors, consider returning an error type
  return (
    json.tokenBalances
      .filter(
        (
          b
        ): b is typeof json["tokenBalances"][0] & {
          tokenBalance: Exclude<
            typeof json["tokenBalances"][0]["tokenBalance"],
            null
          >
        } => b.error === null && b.tokenBalance !== null
      )
      // A hex value of 0x without any subsequent numbers generally means "no
      // value" (as opposed to 0) in Ethereum implementations, so filter it out
      // as effectively undefined.
      .filter(({ tokenBalance }) => tokenBalance !== "0x")
      .map((tokenBalance) => {
        let balance = tokenBalance.tokenBalance
        if (balance.length > 66) {
          balance = balance.substring(0, 66)
        }
        return {
          contractAddress: tokenBalance.contractAddress,
          amount: BigInt(balance),
        }
      })
  )
}

/**
 * Use Alchemy's getTokenMetadata call to get metadata for a token contract on
 * Ethereum.
 *
 * More information https://docs.alchemy.com/alchemy/documentation/enhanced-apis/token-api
 *
 * @param provider an Alchemy ethers provider
 * @param contractAddressOnNetwork the address of the token smart contract
 *        whose metadata should be returned, with network information; note
 *        that the passed provider should be for the same network, or results
 *        are unpredictable.
 */
export async function getTokenMetadata(
  // FIXME Track provider + network similarly to address + network.
  provider: AlchemyProvider | AlchemyWebSocketProvider,
  contractAddressOnNetwork: AddressOnNetwork
): Promise<SmartContractFungibleAsset | null> {
  const { address: contractAddress, network } = contractAddressOnNetwork

  const json: unknown = await provider.send("alchemy_getTokenMetadata", [
    contractAddress,
  ])
  if (!isValidAlchemyTokenMetadataResponse(json)) {
    logger.warn(
      "Alchemy token metadata response didn't validate, did the API change?",
      json
    )
    return null
  }
  return {
    decimals: json.decimals,
    name: json.name,
    symbol: json.symbol,
    metadata: {
      tokenLists: [],
      ...(json.logo ? { logoURL: json.logo } : {}),
    },
    homeNetwork: network, // TODO make multi-network friendly
    contractAddress,
  }
}

/**
 * Parse a transaction as returned by an Alchemy provider subscription.
 */
export function transactionFromAlchemyWebsocketTransaction(
  websocketTx: unknown,
  asset: FungibleAsset,
  network: EVMNetwork
): AnyEVMTransaction {
  // These are the props we expect here.
  const tx = websocketTx as {
    hash: string
    to: string
    from: string
    gas: string
    gasPrice: string
    maxFeePerGas: string | undefined | null
    maxPriorityFeePerGas: string | undefined | null
    input: string
    r: string
    s: string
    v: string
    nonce: string
    value: string
    blockHash: string | undefined | null
    blockHeight: string | undefined | null
    blockNumber: number | undefined | null
    type: string | undefined | null
  }

  return {
    hash: tx.hash,
    to: tx.to,
    from: tx.from,
    gasLimit: BigInt(tx.gas),
    gasPrice: BigInt(tx.gasPrice),
    maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : null,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas
      ? BigInt(tx.maxPriorityFeePerGas)
      : null,
    input: tx.input,
    r: tx.r || undefined,
    s: tx.s || undefined,
    v: BigNumber.from(tx.v).toNumber(),
    nonce: Number(tx.nonce),
    value: BigInt(tx.value),
    blockHash: tx.blockHash ?? null,
    blockHeight: tx.blockNumber ?? null,
    type:
      tx.type !== undefined
        ? (BigNumber.from(tx.type).toNumber() as AnyEVMTransaction["type"])
        : 0,
    asset,
    network,
  }
}
