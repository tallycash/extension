import { AssetSwap } from "@tallyho/tally-background/services/enrichment"
import React, { ReactElement } from "react"
import { SigningDataTransactionSummaryProps } from ".."
import SharedAssetIcon from "../../../../Shared/SharedAssetIcon"

export default function SigningDataTransactionSummarySwapAsset({
  annotation: { fromAssetAmount },
}: SigningDataTransactionSummaryProps<AssetSwap>): ReactElement {
  return (
    <>
      <h1 className="serif_header title">Swap assets</h1>
      <span className="site">Uniswap</span>
      <span className="pre_post_label">Spend amount</span>
      <span className="spend_amount">
        {fromAssetAmount.localizedDecimalAmount} {fromAssetAmount.asset.symbol}
      </span>
      <span className="pre_post_label">$1413.11</span>
      <div className="asset_items_wrap">
        <div className="asset_item">
          <SharedAssetIcon size="small" />
          <span className="asset_name">ETH</span>
        </div>
        <div className="icon_switch" />
        <div className="asset_item">
          <span className="asset_name">ETH</span>
          <SharedAssetIcon size="small" />
        </div>
      </div>
      <style jsx>{`
            .title {
              color: var(--trophy-gold);
              font-size: 36px;
              font-weight: 500;
              line-height: 42px;
              text-align: center;
            }
            .site {
              color: #fff;
              font-size: 16px;
              font-weight: 500;
              line-height: 24px;
              text-align: center;
              padding: 15px 0px;
              border-bottom: 1px solid var(--green-120);
              width: 272px;
              margin-bottom: 15px;
            }
            .pre_post_label {
              color: var(--green-40);
              font-size: 16px
              line-height: 24px;
              text-align: center;
            }
            .amount {
              color: #fff;
              font-size: 28px;
              font-weight: 500;
              line-height: 30px;
              text-align: center;
              text-transform: uppercase;
              margin-top: 3px;
            }
            .asset_name {
              color: var(--green-20);
              font-size: 14px;
              line-height: 16px;
              text-align: right;
              text-transform: uppercase;
              margin: 0px 8px;
            }
            .asset_items_wrap {
              display: flex;
              margin-top: 14px;
              margin-bottom: 16px;
            }
            .asset_item:nth-of-type(3) {
              justify-content: flex-end;
            }
            .icon_switch {
              background: url('./images/swap_asset.svg') center no-repeat;
              background-size: 12px 12px;
              width: 24px;
              height: 24px;
              border-radius: 6px;
              border: 3px solid var(--hunter-green);
              background-color: var(--green-95);
              margin-left: -11px;
              margin-right: -11px;
              z-index: 5;
              flex-grow: 1;
              flex-shrink: 0;
              margin-top: 9px;
            }
            .asset_item {
              width: 108px;
              height: 48px;
              border-radius: 4px;
              background-color: var(--green-95);
              padding: 8px;
              box-sizing: border-box;
              display: flex;
              align-items: center;
            }
          `}</style>
    </>
  )
}
