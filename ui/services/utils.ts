/* eslint-disable import/prefer-default-export */
import { CompleteAssetAmount } from "@tallyho/tally-background/redux-slices/accounts"
import {
  offChainProviders,
  Wealthsimple,
} from "@tallyho/tally-background/constants/off-chain"
import { Asset, OffChainAsset } from "@tallyho/tally-background/assets"

export default function transformOffChainAsset(
  asset: OffChainAsset,
  providerName: string
): CompleteAssetAmount<Asset & { decimals: number }> {
  const { amount } = asset
  const offChainProvider =
    offChainProviders.find((provider) => provider.name === providerName) ||
    Wealthsimple

  return {
    // @ts-expect-error bigint type
    amount,
    decimalAmount: amount,
    localizedDecimalAmount: new Intl.NumberFormat().format(amount),
    localizedMainCurrencyAmount: new Intl.NumberFormat().format(amount),
    localizedUnitPrice: "1",
    mainCurrencyAmount: amount,
    unitPrice: 1,
    asset: {
      decimals: 2,
      name: asset.label,
      symbol: asset.currencySymbol,
      metadata: {
        tokenLists: [],
        logoURL: offChainProvider.logoUrl,
      },
    },
  }
}
