import { EVMNetwork, Network } from "../networks"
import { RBTC, BTC, ETH } from "./currencies"

// TODO integrate this with /api/networks

export const ETHEREUM: EVMNetwork = {
  name: "Ethereum",
  baseAsset: ETH,
  chainID: "1",
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

export const RSK: Network = {
  name: "RSK",
  baseAsset: RBTC,
  family: "EVM",
  checksum: "EIP-1191",
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

export const EVM_MAIN_NETWORKS = [ETHEREUM]

export const EVM_TEST_NETWORKS = [ROPSTEN, RINKEBY, GOERLI, KOVAN]

const EVM_NETWORKS: EVMNetwork[] = EVM_MAIN_NETWORKS.concat(EVM_TEST_NETWORKS)

// A lot of code currently relies on chain id uniqueness per EVM network;
// explode if that is not maintained.
if (
  new Set(EVM_NETWORKS.map(({ chainID }) => chainID)).size < EVM_NETWORKS.length
) {
  throw new Error("Duplicate chain ID in EVM networks.")
}

export const EVM_NETWORKS_BY_CHAIN_ID: { [chainID: string]: EVMNetwork } =
  EVM_NETWORKS.reduce(
    (agg, network) => ({
      ...agg,
      [network.chainID]: network,
    }),
    {}
  )

export const NETWORKS = [BITCOIN].concat(EVM_NETWORKS)

// A lot of code currently relies on network name uniqueness; explode if that
// is not maintained.
if (new Set(NETWORKS.map(({ name }) => name)).size < NETWORKS.length) {
  throw new Error("Duplicate chain name in networks.")
}
