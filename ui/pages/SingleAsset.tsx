import React, { ReactElement } from "react"
import { useLocation } from "react-router-dom"
import {
  selectCurrentAccountActivitiesWithTimestamps,
  selectCurrentAccountBalances,
  selectCurrentAccountSigningMethod,
} from "@tallyho/tally-background/redux-slices/selectors"
import {
  HIDE_SEND_BUTTON,
  HIDE_SWAP,
} from "@tallyho/tally-background/features/features"
import {
  normalizeEVMAddress,
  sameEVMAddress,
} from "@tallyho/tally-background/lib/utils"
import { isSmartContractFungibleAsset } from "@tallyho/tally-background/assets"
import { useBackgroundSelector } from "../hooks"
import SharedAssetIcon from "../components/Shared/SharedAssetIcon"
import SharedButton from "../components/Shared/SharedButton"
import WalletActivityList from "../components/Wallet/WalletActivityList"
import SharedBackButton from "../components/Shared/SharedBackButton"

export default function SingleAsset(): ReactElement {
  const location = useLocation<{ symbol: string; contractAddress?: string }>()
  const { symbol, contractAddress } = location.state

  const currentAccountSigningMethod = useBackgroundSelector(
    selectCurrentAccountSigningMethod
  )

  const filteredActivities = useBackgroundSelector((state) =>
    (selectCurrentAccountActivitiesWithTimestamps(state) ?? []).filter(
      (activity) => {
        if (
          typeof contractAddress !== "undefined" &&
          sameEVMAddress(contractAddress, activity.to)
        ) {
          return true
        }
        switch (activity.annotation?.type) {
          case "asset-transfer":
          case "asset-approval":
            return activity.annotation.assetAmount.asset.symbol === symbol
          case "asset-swap":
            return (
              activity.annotation.fromAssetAmount.asset.symbol === symbol ||
              activity.annotation.toAssetAmount.asset.symbol === symbol
            )
          case "contract-interaction":
          case "contract-deployment":
          default:
            return false
        }
      }
    )
  )

  const { asset, localizedMainCurrencyAmount, localizedDecimalAmount } =
    useBackgroundSelector((state) => {
      const balances = selectCurrentAccountBalances(state)

      if (typeof balances === "undefined") {
        return undefined
      }

      return balances.assetAmounts.find(({ asset: candidateAsset }) => {
        if (typeof contractAddress !== "undefined") {
          return (
            isSmartContractFungibleAsset(candidateAsset) &&
            sameEVMAddress(candidateAsset.contractAddress, contractAddress)
          )
        }
        return candidateAsset.symbol === symbol
      })
    }) ?? {
      asset: undefined,
      localizedMainCurrencyAmount: undefined,
      localizedDecimalAmount: undefined,
    }

  return (
    <>
      <div className="back_button_wrap standard_width_padded">
        <SharedBackButton />
      </div>
      {typeof asset === "undefined" ? (
        <></>
      ) : (
        <div className="header standard_width_padded">
          <div className="left">
            <div className="asset_wrap">
              <SharedAssetIcon
                logoURL={asset?.metadata?.logoURL}
                symbol={asset?.symbol}
              />
              <span className="asset_name">{symbol}</span>
            </div>
            <div className="balance">{localizedDecimalAmount}</div>
            {typeof localizedMainCurrencyAmount !== "undefined" ? (
              <div className="usd_value">${localizedMainCurrencyAmount}</div>
            ) : (
              <></>
            )}
          </div>
          <div className="right">
            {currentAccountSigningMethod ? (
              <>
                {!HIDE_SEND_BUTTON && symbol === "ETH" && (
                  <SharedButton
                    type="primary"
                    size="medium"
                    icon="send"
                    linkTo={{
                      pathname: "/send",
                      state: {
                        symbol,
                        contractAddress:
                          "contractAddress" in asset
                            ? normalizeEVMAddress(asset.contractAddress)
                            : undefined,
                      },
                    }}
                  >
                    Send
                  </SharedButton>
                )}
                {!HIDE_SWAP && symbol !== "ETH" && (
                  <SharedButton
                    type="primary"
                    size="medium"
                    icon="swap"
                    linkTo={{
                      pathname: "/swap",
                      state: {
                        symbol,
                        contractAddress:
                          "contractAddress" in asset
                            ? normalizeEVMAddress(asset.contractAddress)
                            : undefined,
                      },
                    }}
                  >
                    Swap
                  </SharedButton>
                )}
              </>
            ) : (
              <></>
            )}
          </div>
        </div>
      )}
      <div className="sub_info_separator_wrap standard_width_padded">
        <div className="left">Asset is on: Arbitrum</div>
        <div className="right">Move to Ethereum</div>
      </div>
      <WalletActivityList activities={filteredActivities} />
      <style jsx>
        {`
          .back_button_wrap {
            margin-bottom: 4px;
          }
          .sub_info_separator_wrap {
            display: none; // TODO asset network location and transfer for later
            border: 1px solid var(--green-120);
            border-left: 0px;
            border-right: 0px;
            padding-top: 8px;
            padding-bottom: 8px;
            box-sizing: border-box;
            color: var(--green-60);
            font-size: 14px;
            line-height: 16px;
            justify-content: space-between;
            margin-top: 23px;
            margin-bottom: 16px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 24px;
          }
          .header .right {
            height: 95px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .asset_name {
            color: #fff;
            font-size: 22px;
            font-weight: 500;
            line-height: 32px;
            text-align: center;
            text-transform: uppercase;
            margin-left: 8px;
          }
          .asset_wrap {
            display: flex;
            align-items: center;
          }
          .balance {
            color: #fff;
            font-size: 36px;
            font-weight: 500;
            line-height: 48px;
          }
          .usd_value {
            width: 112px;
            color: var(--green-40);
            font-size: 16px;
            font-weight: 600;
            line-height: 24px;
          }
          .label_light {
            color: var(--green-40);
            font-size: 16px;
            font-weight: 500;
            line-height: 24px;
            margin-bottom: 8px;
          }
        `}
      </style>
    </>
  )
}
