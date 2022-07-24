import { ESTIMATED_FEE_MULTIPLIERS_BY_TYPE } from "@tallyho/tally-background/constants/network-fees"
import {
  truncateDecimalAmount,
  weiToGwei,
} from "@tallyho/tally-background/lib/utils"
import { NetworkFeeSettings } from "@tallyho/tally-background/redux-slices/transaction-construction"
import {
  selectDefaultNetworkFeeSettings,
  selectEstimatedFeesPerGas,
  selectFeeType,
  selectTransactionMainCurrencyPricePoint,
} from "@tallyho/tally-background/redux-slices/selectors/transactionConstructionSelectors"
import { enrichAssetAmountWithMainCurrencyValues } from "@tallyho/tally-background/redux-slices/utils/asset-utils"
import { PricePoint } from "@tallyho/tally-background/assets"
import React, { ReactElement } from "react"
import { useBackgroundSelector } from "../../hooks"

const getFeeDollarValue = (
  currencyPrice: PricePoint | undefined,
  networkSettings: NetworkFeeSettings,
  estimatedSpendPerGas: bigint
): string | undefined => {
  const gasLimit = networkSettings.gasLimit ?? networkSettings.suggestedGasLimit

  if (!gasLimit || !currencyPrice) return undefined

  const [asset] = currencyPrice.pair
  const { localizedMainCurrencyAmount } =
    enrichAssetAmountWithMainCurrencyValues(
      {
        asset,
        amount: estimatedSpendPerGas * gasLimit,
      },
      currencyPrice,
      2
    )

  return localizedMainCurrencyAmount
}

export default function FeeSettingsTextDeprecated(): ReactElement {
  const estimatedFeesPerGas = useBackgroundSelector(selectEstimatedFeesPerGas)
  const selectedFeeType = useBackgroundSelector(selectFeeType)
  const networkSettings = useBackgroundSelector(selectDefaultNetworkFeeSettings)
  const mainCurrencyPricePoint = useBackgroundSelector(
    selectTransactionMainCurrencyPricePoint
  )
  const baseFeePerGas = estimatedFeesPerGas?.baseFeePerGas

  const estimatedSpendPerGas =
    (baseFeePerGas ?? 0n) + networkSettings.values.maxPriorityFeePerGas

  const estimatedGweiAmount =
    typeof estimatedFeesPerGas !== "undefined" &&
    typeof selectedFeeType !== "undefined"
      ? truncateDecimalAmount(
          weiToGwei(
            (estimatedSpendPerGas *
              ESTIMATED_FEE_MULTIPLIERS_BY_TYPE[selectedFeeType]) /
              10n
          ),
          0
        )
      : ""

  if (typeof estimatedFeesPerGas === "undefined") return <div>Unknown</div>

  const gweiValue = `${estimatedGweiAmount} Gwei`
  const dollarValue = getFeeDollarValue(
    mainCurrencyPricePoint,
    networkSettings,
    estimatedSpendPerGas
  )

  if (!dollarValue) return <div>~{gweiValue}</div>

  return (
    <div>
      ~${dollarValue}
      <span className="fee_gwei">({gweiValue})</span>
      <style jsx>{`
        .fee_gwei {
          color: var(--green-60);
          margin-left: 5px;
        }
      `}</style>
    </div>
  )
}
