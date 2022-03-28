import { BigNumber, ethers, utils } from "ethers"
import { normalizeHexAddress } from "@tallyho/hd-keyring"
import keccak from "keccak"
import { HexString } from "../../types"
import { EVMNetwork, Network } from "../../networks"
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

export function isProbablyEVMAddress(str: string): str is HexString {
  if (str.endsWith(".eth")) {
    return true
  }

  if (normalizeHexAddress(str).startsWith("0x") && str.length === 42) {
    return true
  }
  return false
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-5)}`
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

export function toEIP1191ChecksumAddress(
  address: string,
  chainId: string
): string {
  const account =
    address.substring(0, 2) === "0x" ? address.substring(2) : address

  const chain = chainId && parseInt(chainId, 10)
  const prefix = !Number.isNaN(chain) ? `${chain?.toString()}0x` : ""
  const hash = keccak("keccak256").update(`${prefix}${account}`).digest("hex")

  return `0x${account
    .split("")
    .map((char: string, index: number) =>
      parseInt(hash[index], 16) >= 8 ? char.toUpperCase() : char
    )
    .join("")}`
}

export function isEIP1191Address(address: string, chainId: string): boolean {
  return (
    utils.isHexString(address) &&
    toEIP1191ChecksumAddress(address, chainId) === address
  )
}

export function isValidAddress(address: string, network: Network): boolean {
  if (network.checksum === "EIP-1191") {
    return isEIP1191Address(address, network.chainID || "30")
  }

  // TODO Add bitcoin address checksum
  return utils.isAddress(address)
}

/**
 * Converts a string of hexidecimals bytes to ascii text
 */
export const hexToAscii = (hex_: string): string => {
  const hex = hex_.toString() // force conversion
  let str = ""
  for (let i = 0; i < hex.length; i += 2)
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16))
  return str.replace("\x00", "")
}
