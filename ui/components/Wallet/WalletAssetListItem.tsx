import React, { ReactElement } from "react"
import { Link } from "react-router-dom"
import { CompleteAssetAmount } from "@tallyho/tally-background/redux-slices/accounts"

import { normalizeEVMAddress } from "@tallyho/tally-background/lib/utils"
import SharedLoadingSpinner from "../Shared/SharedLoadingSpinner"
import SharedAssetIcon from "../Shared/SharedAssetIcon"

interface Props {
  assetAmount: CompleteAssetAmount
  initializationLoadingTimeExpired: boolean
}

export default function WalletAssetListItem(props: Props): ReactElement {
  const { assetAmount, initializationLoadingTimeExpired } = props

  const isMissingLocalizedUserValue =
    typeof assetAmount.localizedMainCurrencyAmount === "undefined"

  return (
    <li>
      <Link
        to={{
          pathname: "/singleAsset",
          state: {
            symbol: assetAmount.asset.symbol,
            contractAddress:
              "contractAddress" in assetAmount.asset
                ? normalizeEVMAddress(assetAmount.asset.contractAddress)
                : undefined,
          },
        }}
      >
        <div className="list_item">
          <div className="left">
            <SharedAssetIcon
              logoURL={assetAmount?.asset?.metadata?.logoURL}
              symbol={assetAmount?.asset?.symbol}
            />
            <div className="left_content">
              <div className="amount">
                <span className="bold_amount_count">
                  {assetAmount.localizedDecimalAmount}
                </span>
                {assetAmount.asset.symbol}
              </div>
              {initializationLoadingTimeExpired &&
              isMissingLocalizedUserValue ? (
                <></>
              ) : (
                <div className="price">
                  {isMissingLocalizedUserValue ? (
                    <SharedLoadingSpinner size="small" />
                  ) : (
                    `$${assetAmount.localizedMainCurrencyAmount}`
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="right">
            <span className="icon_send_asset" />
          </div>
        </div>
      </Link>
      <style jsx>
        {`
          .list_item {
            height: 72px;
            width: 100%;
            border-radius: 16px;
            background-color: var(--green-95);
            display: flex;
            padding: 16px;
            box-sizing: border-box;
            margin-bottom: 16px;
            justify-content: space-between;
            align-items: center;
          }
          .list_item:hover {
            background-color: var(--green-80);
          }
          .left {
            display: flex;
          }
          .left_content {
            display: flex;
            flex-direction: column;
            justify-content: center;
            margin-left: 16px;
          }
          .amount {
            height: 17px;
            color: #fefefc;
            font-size: 14px;
            font-weight: 400;
            letter-spacing: 0.42px;
            line-height: 16px;
            text-transform: uppercase;
            margin-bottom: 8px;
            margin-top: -1px;
          }
          .bold_amount_count {
            width: 70px;
            height: 24px;
            color: #fefefc;
            font-size: 18px;
            font-weight: 600;
            line-height: 24px;
            margin-right: 4px;
          }
          .price {
            height: 17px;
            display: flex;
            color: var(--green-40);
            font-size: 14px;
            font-weight: 400;
            letter-spacing: 0.42px;
            line-height: 16px;
          }
          .icon_send_asset {
            background: url("./images/send_asset.svg");
            background-size: 12px 12px;
            width: 12px;
            height: 12px;
          }
          .icon_swap_asset {
            background: url("./images/swap_asset.svg");
            background-size: 12px 12px;
            width: 12px;
            height: 12px;
          }
          .right {
            display: flex;
            width: 48px;
            justify-content: flex-end;
            margin-right: 16px;
          }
        `}
      </style>
    </li>
  )
}
