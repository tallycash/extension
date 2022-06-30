import { unitPricePointForPricePoint } from "@tallyho/tally-background/assets"
import { selectAssetPricePoint } from "@tallyho/tally-background/redux-slices/assets"
import { selectMainCurrencySymbol } from "@tallyho/tally-background/redux-slices/selectors"
import {
  enrichAssetAmountWithDecimalValues,
  enrichAssetAmountWithMainCurrencyValues,
  heuristicDesiredDecimalsForUnitPrice,
} from "@tallyho/tally-background/redux-slices/utils/asset-utils"
import React, { ReactElement } from "react"
import {SigningDataTransactionSummaryBody} from "."
import { SigningDataTransactionSummaryProps } from ".."
import { useBackgroundSelector } from "../../../../../hooks"
import SharedAddress from "../../../../Shared/SharedAddress"

export default function SigningDataTransactionSummaryDefault({
  transactionRequest,
  annotation,
}: SigningDataTransactionSummaryProps): ReactElement {
  const { network } = transactionRequest
  const mainCurrencySymbol = useBackgroundSelector(selectMainCurrencySymbol)
  const baseAssetPricePoint = useBackgroundSelector((state) =>
    selectAssetPricePoint(
      state.assets,
      network.baseAsset.symbol,
      mainCurrencySymbol
    )
  )
  const transactionAssetAmount = enrichAssetAmountWithDecimalValues(
    {
      asset: network.baseAsset,
      amount: transactionRequest.value,
    },
    heuristicDesiredDecimalsForUnitPrice(
      2,
      typeof baseAssetPricePoint !== "undefined"
        ? unitPricePointForPricePoint(baseAssetPricePoint)
        : undefined
    )
  )

  const {
    localizedDecimalAmount: baseAssetValue,
    localizedMainCurrencyAmount: mainCurrencyValue,
  } = enrichAssetAmountWithMainCurrencyValues(
    transactionAssetAmount,
    baseAssetPricePoint,
    2
  )

  return (
    <>
      <h1 className="serif_header title">Sign transaction</h1>
      <SigningDataTransactionSummaryBody>
        <div className="container">
          <div className="label">Send to</div>
          <SharedAddress
            address={transactionRequest.to ?? ""}
            name={
              annotation !== undefined && "contractName" in annotation
                ? annotation.contractName
                : undefined
            }
          />
        </div>
        <div className="divider" />
        <div className="container">
          <div className="spend_amount_label">Spend Amount</div>
          <div className="spend_amount">
            <div className="eth_value">
              {baseAssetValue} {network.baseAsset.symbol}
            </div>
            <div className="main_currency_value">
              {mainCurrencyValue ? `$${mainCurrencyValue}` : "-"}
            </div>
          </div>
        </div>

        <style jsx>
          {`
            .label {
              color: var(--green-40);
              font-size: 16px;
              line-height: 24px;
              margin-bottom: 4px;
            }
            .spend_amount {
              color: #fff;
              font-size: 28px;
              text-align: center;
              text-transform: uppercase;
            }
            .divider {
              width: 80%;
              height: 2px;
              opacity: 60%;
              background-color: var(--green-120);
            }
            .container {
              display: flex;
              margin: 20px 0;
              flex-direction: column;
              align-items: center;
            }
            .main_currency_value {
              color: var(--green-40);
              font-size: 16px;
              line-height: 24px;
            }
          `}
        </style>
      </SigningDataTransactionSummaryBody>
    </>
  )
}
