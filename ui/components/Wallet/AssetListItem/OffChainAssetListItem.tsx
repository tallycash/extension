import React, { ReactElement } from "react"
import { Link } from "react-router-dom"
import { CompleteAssetAmount } from "@tallyho/tally-background/redux-slices/accounts"
import { Wealthsimple } from "@tallyho/tally-background/constants/off-chain"

import SharedAssetIcon from "../../Shared/SharedAssetIcon"
import styles from "./styles"

export default function OffChainAssetListItem({
  assetAmount,
}: {
  assetAmount: CompleteAssetAmount
}): ReactElement {
  const contractAddress =
    "contractAddress" in assetAmount.asset
      ? assetAmount.asset.contractAddress
      : undefined

  return (
    <>
      <div className="asset_list_item">
        <div className="asset_left">
          <SharedAssetIcon symbol="CAD" logoURL={Wealthsimple.logoUrl} />
          <div className="asset_left_content">
            <div className="asset_amount">
              <span className="bold_amount_count">
                {assetAmount.localizedDecimalAmount}
              </span>
              {assetAmount.asset.symbol}
            </div>
          </div>
        </div>
        <div className="asset_right">
          <Link
            to={{
              pathname: "/trade",
              state: {
                symbol: assetAmount.asset.symbol,
                contractAddress,
              },
            }}
            className="asset_icon asset_icon_swap"
          />
        </div>
        <style jsx>{`
          ${styles}
          .locked {
            display: flex;
            align-items: center;
            gap: 5px;
            color: var(--green-20);
            font-size: 14px;
            font-weight: 500;
            padding: 4px;
            width: 70px;
            border-radius: 4px;
            margin-bottom: -5px;
            margin-left: -13px;
            cursor: pointer;
          }
          .locked:hover,
          .locked.hover {
            background: var(--green-120);
          }
        `}</style>
      </div>
    </>
  )
}
