import { OffChainProvider } from "../accounts"

/**
 * The following exchanges were picked as default, based on the following criteria:
 * 1. Wealthsimple: I work for them and they are allowing me to work on this as
 * part during company time as part of of our company's 20% time (thank you!)
 * 2. Binance, FTX, Coinbase: The 3 largest exchanges based on volume.
 * See:
 * - https://coinmarketcap.com/rankings/exchanges/
 * - https://www.coingecko.com/en/exchanges
 *
 */
export const Wealthsimple: OffChainProvider = {
  apiUrl: "https://api.off-chain.wealthsimple.com",
  logoUrl:
    "https://images.ctfassets.net/v44fuld738we/3p54yem0uWnzJSPyCLdQgN/10e0569c130b369cf6b33e2f1a88acc7/_2019_Wealthsimple_Favicon_Black.png",
  name: "Wealthsimple",
}
export const Binance: OffChainProvider = {
  apiUrl: "https://api.tally.binance.com",
  logoUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png",
  name: "Binance",
}
export const FTX: OffChainProvider = {
  apiUrl: "https://api-tally.ftx.com",
  logoUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/524.png",
  name: "FTX",
}
export const Coinbase: OffChainProvider = {
  apiUrl: "https://api.tally.coinbase.com",
  logoUrl: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/89.png",
  name: "Coinbase",
}

export const offChainProviders = [Wealthsimple, Binance, FTX, Coinbase]
