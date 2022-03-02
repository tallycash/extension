import { BigNumber, ethers, utils } from "ethers"
import { normalizeHexAddress } from "@tallyho/hd-keyring"
import { HexString } from "../../types"
import { EVMNetwork } from "../../networks"
import { ETHEREUM, ROPSTEN, RINKEBY, GOERLI, KOVAN } from "../../constants"

export function normalizeEVMAddress(address: string | Buffer): HexString {
  return normalizeHexAddress(address)
}

export function truncateDecimalAmount(
  value: number | string,
  decimalLength: number
): string {
  const valueString = value.toString()
  if (decimalLength === 0) {
    return valueString.split(".")[0]
  }
  if (valueString.includes(".")) {
    const [integers, decimals] = valueString.split(".")
    return `${integers}.${decimals.substring(0, decimalLength)}`
  }
  return valueString
}

export function sameEVMAddress(
  address1: string | Buffer | undefined | null,
  address2: string | Buffer | undefined | null
): boolean {
  if (
    typeof address1 === "undefined" ||
    typeof address2 === "undefined" ||
    address1 === null ||
    address2 === null
  ) {
    return false
  }
  return normalizeHexAddress(address1) === normalizeHexAddress(address2)
}

export function gweiToWei(value: number | bigint): bigint {
  return BigInt(utils.parseUnits(value.toString(), "gwei").toString())
}

export function convertToEth(value: string | number | bigint): string {
  if (value && value >= 1) {
    return utils.formatUnits(BigInt(value))
  }
  return ""
}

export function weiToGwei(value: string | number | bigint): string {
  if (value && value >= 1) {
    return truncateDecimalAmount(utils.formatUnits(BigInt(value), "gwei"), 2)
  }
  return ""
}

/**
 * Encode an unknown input as JSON, special-casing bigints and undefined.
 *
 * @param input an object, array, or primitive to encode as JSON
 */
export function encodeJSON(input: unknown): string {
  return JSON.stringify(input, (_, value) => {
    if (typeof value === "bigint") {
      return { B_I_G_I_N_T: value.toString() }
    }
    return value
  })
}

/**
 * Decode a JSON string, as encoded by `encodeJSON`, including bigint support.
 * Note that the functions aren't invertible, as `encodeJSON` discards
 * `undefined`.
 *
 * @param input a string output from `encodeJSON`
 */
export function decodeJSON(input: string): unknown {
  return JSON.parse(input, (_, value) =>
    value !== null && typeof value === "object" && "B_I_G_I_N_T" in value
      ? BigInt(value.B_I_G_I_N_T)
      : value
  )
}

/**
 * Determine which Ethereum network should be used based on the .env file
 */
export function getEthereumNetwork(): EVMNetwork {
  const ethereumNetwork = process.env.ETHEREUM_NETWORK?.toUpperCase()

  if (ethereumNetwork === "ROPSTEN") {
    return ROPSTEN
  }

  if (ethereumNetwork === "RINKEBY") {
    return RINKEBY
  }

  if (ethereumNetwork === "GOERLI") {
    return GOERLI
  }

  if (ethereumNetwork === "KOVAN") {
    return KOVAN
  }

  // Default to mainnet
  return ETHEREUM
}

export function truncateAddress(address: string): string {
  const normalizedAddress = normalizeEVMAddress(address)
  return `${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-5)}`
}

export const getNumericStringValueFromBigNumber = (
  value: BigNumber,
  tokenDecimals: number
): string => {
  return Number(value.toBigInt() / 10n ** BigInt(tokenDecimals)).toString()
}

export const numberTo32BytesHex = (value: string, decimals: number): string => {
  const withDecimals = BigInt(value) * 10n ** BigInt(decimals)
  const hex = utils.hexlify(withDecimals)
  return hex
}

export const isMaxUint256 = (amount: BigNumber | bigint | string): boolean => {
  return ethers.BigNumber.from(amount).eq(ethers.constants.MaxUint256)
}
