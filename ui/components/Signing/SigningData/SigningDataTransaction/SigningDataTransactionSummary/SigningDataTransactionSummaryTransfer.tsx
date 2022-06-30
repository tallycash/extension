import { selectAssetPricePoint } from "@tallyho/tally-background/redux-slices/assets"
import {
  getAssetsState,
  selectMainCurrencySymbol,
} from "@tallyho/tally-background/redux-slices/selectors"
import { enrichAssetAmountWithMainCurrencyValues } from "@tallyho/tally-background/redux-slices/utils/asset-utils"
import { AssetTransfer } from "@tallyho/tally-background/services/enrichment"
import React, { ReactElement } from "react"
import {SigningDataTransactionSummaryBody} from "."
import { SigningDataTransactionSummaryProps } from ".."
import { useBackgroundSelector } from "../../../../../hooks"
import SharedAddress from "../../../../Shared/SharedAddress"

export default function SigningDataTransactionSummaryTransfer({
  annotation: { assetAmount, recipientAddress, recipientName },
}: SigningDataTransactionSummaryProps<AssetTransfer>): ReactElement {
  const assets = useBackgroundSelector(getAssetsState)
  const mainCurrencySymbol = useBackgroundSelector(selectMainCurrencySymbol)
  const assetPricePoint = selectAssetPricePoint(
    assets,
    assetAmount.asset.symbol,
    mainCurrencySymbol
  )
  const localizedMainCurrencyAmount =
    enrichAssetAmountWithMainCurrencyValues(assetAmount, assetPricePoint, 2)
      .localizedMainCurrencyAmount ?? "-"

  return (
    <>
      <h1 className="serif_header title">Sign transfer</h1>
      <SigningDataTransactionSummaryBody>
        <div className="container">
          <div className="label">Send to</div>
          <div className="send_to">
            <SharedAddress address={recipientAddress} name={recipientName} />
          </div>
        </div>
        <div className="divider" />
        <div className="container">
          <span className="label">Spend Amount</span>
          <span className="spend_amount">
            {assetAmount.localizedDecimalAmount} {assetAmount.asset.symbol}
          </span>
          <span className="label">${`${localizedMainCurrencyAmount}`}</span>
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
              text-align: right;
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
            .send_to {
              font-size: 16px;
            }
          `}
        </style>
      </SigningDataTransactionSummaryBody>
    </>
  )
}
