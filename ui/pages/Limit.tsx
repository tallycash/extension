import React, { ReactElement, useEffect, useCallback, useState } from "react"
import logger from "@tallyho/tally-background/lib/logger"
import {
  selectAccountAndTimestampedActivities,
  selectCurrentAccountBalances,
} from "@tallyho/tally-background/redux-slices/selectors"
import CorePage from "../components/Core/CorePage"
import SharedAssetInput from "../components/Shared/SharedAssetInput"
import SharedButton from "../components/Shared/SharedButton"
import SharedSlideUpMenu from "../components/Shared/SharedSlideUpMenu"
import SwapQoute from "../components/Swap/SwapQuote"
import SharedActivityHeader from "../components/Shared/SharedActivityHeader"
import {
  useAreKeyringsUnlocked,
  useBackgroundDispatch,
  useBackgroundSelector,
} from "../hooks"
import SwapLimitSettings from "../components/Limit/LimitSettings"
import {
  fetchLimitPrices,
  fetchLimitTokens,
  LimitAsset,
  setLimitAmount,
  setLimitTrade,
  swapBuyAndSellSides,
} from "@tallyho/tally-background/redux-slices/limit-orders"
import LimitQuote from "../components/Limit/LimitQuote"
import { CompleteAssetAmount } from "@tallyho/tally-background/redux-slices/accounts"

const getFooter = (token?: LimitAsset) => {
  return token
    ? `1 ${token?.symbol} ≈ ${
        token.price
          ? `$${new Intl.NumberFormat("en-US", {
              maximumFractionDigits: 6,
            }).format(Number(token.price))}`
          : "unknown"
      }`
    : ""
}

const getMaxBalance = (
  token?: LimitAsset,
  assetAmounts?: CompleteAssetAmount[]
) => {
  if (!token || !assetAmounts) {
    return 0
  }

  const balance = assetAmounts.find(
    (amount) => amount.asset.symbol === token.symbol
  )

  return balance?.decimalAmount || 0
}

export default function Limit(): ReactElement {
  useAreKeyringsUnlocked(true)
  const dispatch = useBackgroundDispatch()
  const [openTokenMenu, setOpenTokenMenu] = useState(false)

  const { limit, balances } = useBackgroundSelector((state) => {
    const balances = selectCurrentAccountBalances(state)
    return { limit: state.limit, balances }
  })

  // Fetch tokens from the KeeperDAO API whenever the swap page is loaded
  useEffect(() => {
    dispatch(fetchLimitTokens())
  }, [dispatch])

  const handleClick = useCallback(() => {
    setOpenTokenMenu((isCurrentlyOpen) => !isCurrentlyOpen)
  }, [])

  const fromAssetSelected = useCallback(
    async (token) => {
      dispatch(
        setLimitTrade({
          sellAsset: token,
        })
      )

      await dispatch(fetchLimitPrices(token))
    },

    [dispatch]
  )

  const toAssetSelected = useCallback(
    async (token) => {
      dispatch(
        setLimitTrade({
          buyAsset: token,
        })
      )
      await dispatch(fetchLimitPrices(token))
    },

    [dispatch]
  )

  const fromAmountChanged = useCallback(
    (type: "limit" | "swap") => (value: string) => {
      const inputValue = value.replace(/[^0-9.]/g, "") // Allow numbers and decimals only
      dispatch(
        setLimitAmount({
          sellAmount: inputValue,
        })
      )
    },

    [dispatch, limit]
  )

  const toAmountChanged = useCallback(
    (type: "swap" | "limit") => (value: string) => {
      const inputValue = value.replace(/[^0-9.]/g, "") // Allow numbers and decimals only
      dispatch(
        setLimitAmount({
          buyAmount: inputValue,
        })
      )
    },

    [dispatch, limit]
  )

  const swapBuyAndSell = useCallback(() => {
    dispatch(swapBuyAndSellSides())
  }, [dispatch])

  const displayLimitOrderSummary =
    limit.buyAsset && limit.sellAmount && limit.buyAmount

  return (
    <>
      <SharedSlideUpMenu
        isOpen={openTokenMenu}
        close={handleClick}
        size="medium"
      >
        <LimitQuote />
      </SharedSlideUpMenu>
      <div className="form">
        <div className="form_input">
          <SharedAssetInput
            assets={limit.tokens}
            defaultAsset={limit.sellAsset}
            controlledAsset={limit.sellAsset}
            maxBalance={getMaxBalance(limit.sellAsset, balances?.assetAmounts)}
            onAssetSelect={fromAssetSelected}
            onAmountChange={fromAmountChanged("limit")}
            amount={limit.sellAmount}
            footer={getFooter(limit.sellAsset)}
            label="You Pay:"
          />
        </div>
        <div
          className="icon_change"
          style={{
            cursor: "pointer",
          }}
          onClick={() => swapBuyAndSell()}
        />
        <div className="form_input">
          <SharedAssetInput
            assets={limit.tokens}
            defaultAsset={limit.buyAsset}
            controlledAsset={limit.buyAsset}
            onAssetSelect={toAssetSelected}
            // Users can buy as many tokens as they want.
            maxBalance={Infinity}
            onAmountChange={toAmountChanged("limit")}
            footer={getFooter(limit.buyAsset)}
            amount={limit.buyAmount}
            label="You Receive:"
          />
        </div>
        {limit.buyAsset && limit.sellAsset ? (
          <div className="form_input">
            <SharedAssetInput
              assets={limit.tokens}
              // Users can buy as many tokens as they want.
              maxBalance={Infinity}
              defaultAsset={limit.buyAsset}
              amount={String(+limit.buyAmount / +limit.sellAmount)}
              label={`${limit.buyAsset?.symbol} Price:`}
              controlledAsset={limit.buyAsset}
              isAssetOptionsLocked={true}
              footer={`Per ${limit.sellAsset?.symbol}`}
            />
          </div>
        ) : (
          <></>
        )}
        <div className="settings_wrap">
          {displayLimitOrderSummary && (
            <SwapLimitSettings
              toAsset={limit.sellAsset}
              fromAsset={limit.buyAsset}
            />
          )}
        </div>
        <div className="footer standard_width_padded">
          <SharedButton
            type="primary"
            size="large"
            isDisabled={
              !limit.sellAsset ||
              !limit.buyAsset ||
              !limit.buyAmount ||
              !limit.sellAmount
            }
            onClick={handleClick}
          >
            Review order
          </SharedButton>
        </div>
      </div>
      <style jsx>
        {`
          .label_right {
            margin-right: 6px;
          }
          .divider {
            width: 384px;
            border-bottom: 1px solid #000000;
            margin-left: -16px;
          }
          .total_amount_number {
            width: 150px;
            height: 32px;
            color: #e7296d;
            font-size: 22px;
            font-weight: 500;
            line-height: 32px;
          }
          .footer {
            display: flex;
            justify-content: center;
            margin-top: 24px;
            padding-bottom: 20px;
          }
          .total_label {
            width: 33px;
            height: 17px;
            color: var(--green-60);
            font-size: 14px;
            font-weight: 400;
            letter-spacing: 0.42px;
            line-height: 16px;
          }
          .icon_change {
            background: url("./images/change@2x.png") center no-repeat;
            background-size: 20px 20px;
            width: 20px;
            height: 20px;
            padding: 8px;
            border: 3px solid var(--hunter-green);
            background-color: var(--green-95);
            border-radius: 70%;
            margin: 0 auto;
            margin-top: -5px;
            margin-bottom: -32px;
            position: relative;
          }
          .settings_wrap {
            margin-top: 16px;
          }
          .activity_separator {
            font-size: 30px;
            margin-right: 4px;
            margin-left: 4px;
          }
        `}
      </style>
    </>
  )
}
