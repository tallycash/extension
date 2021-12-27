import React, { ReactElement } from "react"
import { useBackgroundSelector } from "../../hooks"
import SharedAssetIcon from "../Shared/SharedAssetIcon"

interface SwapQuoteAssetCardProps {
  type: "buy" | "sell"
  test?: "enabled"
}

export default function SwapQuoteAssetCard(
  props: SwapQuoteAssetCardProps
): ReactElement {
  const { type } = props

  const limit = useBackgroundSelector((state) => {
    return state.limit
  })

  const label = type === "sell" ? "You Pay" : "You Receive"
  const amount = type === "sell" ? limit.sellAmount : limit.buyAmount
  const symbol =
    type === "sell" ? limit.sellAsset?.symbol : limit.buyAsset?.symbol
  const logoUrl =
    type === "sell"
      ? limit.sellAsset?.metadata?.logoURL
      : limit.buyAsset?.metadata?.logoURL
  return (
    <div className="card_wrap">
      <div className="top_label">{label}</div>
      <SharedAssetIcon logoURL={logoUrl} symbol={symbol} />
      <div className="amount">{amount}</div>
      <div className="asset_name">{symbol}</div>
      <style jsx>
        {`
          .card_wrap {
            width: 164px;
            height: 152px;
            border-radius: 4px;
            background-color: var(--green-95);
            display: flex;
            flex-direction: column;
            align-items: center;
            flex-shrink: 0;
            flex-grow: 1;
          }
          .top_label {
            height: 17px;
            color: var(--green-60);
            font-size: 14px;
            font-weight: 400;
            letter-spacing: 0.42px;
            line-height: 16px;
            margin-top: 8px;
            margin-bottom: 15px;
          }
          .asset_name {
            height: 24px;
            color: var(--green-60);
            font-size: 16px;
            font-weight: 500;
            line-height: 24px;
            text-align: right;
            text-transform: uppercase;
          }
          .amount {
            height: 32px;
            color: #ffffff;
            font-size: 22px;
            font-weight: 500;
            line-height: 32px;
            text-align: center;
            margin-top: 4px;
          }
        `}
      </style>
    </div>
  )
}
