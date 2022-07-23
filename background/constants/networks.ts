import { EVMNetwork, Network } from "../networks"
import { BTC, ETH, MATIC } from "./currencies"

export const ETHEREUM: EVMNetwork = {
  name: "Ethereum",
  baseAsset: ETH,
  chainID: "1",
  family: "EVM",
}

export const TELOS: EVMNetwork = {
  name: "Telos",
  baseAsset: TLOS,
  chainID: "40",
  family: "EVM",
}

export const POLYGON: EVMNetwork = {
  name: "Polygon",
  baseAsset: MATIC,
  chainID: "137",
  family: "EVM",
}

export const ARBITRUM_ONE: EVMNetwork = {
  name: "Arbitrum",
  baseAsset: ETH,
  chainID: "42161",
  family: "EVM",
}

export const OPTIMISM: EVMNetwork = {
  name: "Optimism",
  baseAsset: ETH,
  chainID: "10",
  family: "EVM",
}

export const ROPSTEN: EVMNetwork = {
  name: "Ropsten",
  baseAsset: ETH,
  chainID: "3",
  family: "EVM",
}

export const RINKEBY: EVMNetwork = {
  name: "Rinkeby",
  baseAsset: ETH,
  chainID: "4",
  family: "EVM",
}

export const GOERLI: EVMNetwork = {
  name: "Goerli",
  baseAsset: ETH,
  chainID: "5",
  family: "EVM",
}

export const KOVAN: EVMNetwork = {
  name: "Kovan",
  baseAsset: ETH,
  chainID: "42",
  family: "EVM",
}

export const BITCOIN: Network = {
  name: "Bitcoin",
  baseAsset: BTC,
  family: "BTC",
}

export const FORK: EVMNetwork = {
  name: "Ethereum",
  baseAsset: ETH,
  chainID: process.env.MAINNET_FORK_CHAIN_ID ?? "1337",
  family: "EVM",
}
