import { ethers } from "ethers"
import { ZEROEX_DOMAIN_DEFAULTS } from "../constants"
import { HexString } from "../types"

import HDKeyring from "@tallyho/hd-keyring"
import { fetchJson } from "@ethersproject/web"
import { KeyringService } from "../services"

interface KeeperDAOOrderDetails {
  verifyingContract: string
  chainId: string
  txOrigin: string
  taker: string
  pool: string
}

interface KeeperDAOInfoResponse {
  result: {
    orderDetails: KeeperDAOOrderDetails
  }
}

export interface BaseLimitOrder {
  makerToken: string
  takerToken: string
  makerAmount: BigInt
  takerAmount: BigInt
  maker: string
  expiry: string
}

export interface AugmentedLimitOrder {
  makerToken: string
  takerToken: string
  makerAmount: string
  takerAmount: string
  maker: string
  taker: string
  txOrigin: string
  pool: string
  expiry: string
  salt: string
}

export interface KeeperDAOLimitOrder {
  maker: HexString
  taker: HexString
  makerAmount: string
  takerAmount: string
  makerToken: HexString
  takerToken: HexString
  salt: string
  expiry: string
  chainId: number
  txOrigin: HexString
  pool: string
  verifyingContract: HexString
  signature?: {
    signatureType: number
    v: number
    r: string
    s: string
  }
}

export const augmentLimitOrder = async (
  unformattedLimitOrder: BaseLimitOrder,
  orderDetails: KeeperDAOOrderDetails
): Promise<AugmentedLimitOrder> => {
  return {
    makerToken: unformattedLimitOrder.makerToken.toLowerCase(),
    takerToken: unformattedLimitOrder.takerToken.toLowerCase(),
    makerAmount: unformattedLimitOrder.makerAmount.toString().toLowerCase(),
    takerAmount: unformattedLimitOrder.takerAmount.toString().toLowerCase(),
    maker: unformattedLimitOrder.maker.toLowerCase(),
    expiry: unformattedLimitOrder.expiry.toLowerCase(),
    taker: orderDetails.taker,
    txOrigin: orderDetails.txOrigin,
    pool: orderDetails.pool,
    salt: String(Date.now()).toLowerCase(),
  }
}

export const prepareLimitOrder = async (
  order: BaseLimitOrder
): Promise<[AugmentedLimitOrder, string]> => {
  const response = await fetch("https://hidingbook.keeperdao.com/api/v1/info")
  const keeperDAOInfo = (await response.json()) as KeeperDAOInfoResponse

  const { orderDetails } = keeperDAOInfo.result
  // The data to sign
  const augmentedLimitOrder = await augmentLimitOrder(order, orderDetails)
  return [augmentedLimitOrder, orderDetails.verifyingContract]
}

const signLimitOrder = async (
  order: AugmentedLimitOrder,
  verifyingContract: string,
  keyring: KeyringService
): Promise<KeeperDAOLimitOrder> => {
  // 0x Domain
  const domain = {
    ...ZEROEX_DOMAIN_DEFAULTS,
    verifyingContract,
  }

  // The named list of all type definitions
  const types = {
    RfqOrder: [
      { type: "address", name: "makerToken" },
      { type: "address", name: "takerToken" },
      { type: "uint128", name: "makerAmount" },
      { type: "uint128", name: "takerAmount" },
      { type: "address", name: "maker" },
      { type: "address", name: "taker" },
      { type: "address", name: "txOrigin" },
      { type: "bytes32", name: "pool" },
      { type: "uint64", name: "expiry" },
      { type: "uint256", name: "salt" },
    ],
  }

  const signedHexString = await keyring.signTypedData(
    order.maker,
    domain,
    types,
    order as unknown as Record<string, unknown>
  )

  const { r, s, v } = ethers.utils.splitSignature(signedHexString)

  const signature = {
    signatureType: 2,
    r,
    s,
    v,
  }

  return {
    ...order,
    chainId: 1,
    verifyingContract,
    signature: {
      ...signature,
    },
  }
}

export const sendKeeperDaoLimitOrder = async (
  order: BaseLimitOrder,
  keyring: KeyringService
): Promise<string> => {
  const [augmentedLimitOrder, verifyingContract] = await prepareLimitOrder(
    order
  )
  const signedLimitOrder = await signLimitOrder(
    augmentedLimitOrder,
    verifyingContract,
    keyring
  )
  return executeLimitOrder(signedLimitOrder)
}

export const executeLimitOrder = async (
  preparedLimitOrder: KeeperDAOLimitOrder
) => {
  const res = await fetch("https://hidingbook.keeperdao.com/api/v1/orders", {
    method: "POST",
    body: JSON.stringify([preparedLimitOrder]),
  })
  const jsonResponse = await res.json()
  console.dir({ jsonResponse })
  return jsonResponse?.message
}
