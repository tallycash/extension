import { AnyAssetAmount, OffChainAsset } from "./assets"
import { EVMNetwork } from "./networks"
import { HexString } from "./types"

/**
 * An account balance at a particular time and block height, on a particular
 * network. Flexible enough to represent base assets like ETH and BTC as well
 * application-layer tokens like ERC-20s.
 */
export type AccountBalance = {
  /**
   * The address whose balance was measured.
   */
  address: HexString
  /**
   * The measured balance and the asset in which it's denominated.
   */
  assetAmount: AnyAssetAmount
  /**
   * The network on which the account balance was measured.
   */
  network: EVMNetwork
  /**
   * The block height at while the balance measurement is valid.
   */
  blockHeight?: bigint
  /**
   * When the account balance was measured, using Unix epoch timestamps.
   */
  retrievedAt: number
  /**
   * A loose attempt at tracking balance data provenance, in case providers
   * disagree and need to be disambiguated.
   */
  dataSource: "alchemy" | "local"
}

/**
 * An address on a particular network. That's it. That's the comment.
 */
export type AddressOnNetwork = {
  address: HexString
  network: EVMNetwork
}

/**
 * A domain name, with a particular network.
 */
export type NameOnNetwork = {
  name: string
  network: EVMNetwork
}

/**
 * Credentials needed to authenticate with an off-chain provider.
 */
export type OffChainAccountCredentials = {
  username: string
  password: string
  challengeResponse?: string
}

/**
 * An off-chain provider represents a service that stores fiat and crypto assets
 * off chain. Examples include centralized exchanges and banks.
 */
export type OffChainProvider = {
  apiUrl: string
  logoUrl: string
  name: string
}
/**
 * An account on an off-chain provider.
 */
export type OffChainAccount = {
  userId: string
  token: string
}

/**
 * An account on an off-chain provider.
 */
export type OffChainChallenge = {
  requestId: string
  challengeMessage: string
}
