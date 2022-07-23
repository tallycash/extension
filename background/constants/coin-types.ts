// This file includes SLIP-0044 data used by the extension. Because this is raw
// data but is important, it SHOULD NOT be imported from an external package.

/**
 * Limited extension-specific list of coin types by asset symbol.
 */
export const coinTypesByAssetSymbol = {
  BTC: 0,
  "Testnet BTC": 1,
  ETH: 60,
  RBTC: 137,
  MATIC: 966,
  TLOS: 994, //Waiting for Slip.44 to review PR
} as const

/**
 * All coin types known to the extension.
 */
export type Slip44CoinType =
  typeof coinTypesByAssetSymbol[keyof typeof coinTypesByAssetSymbol]
