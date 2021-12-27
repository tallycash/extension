import React, { ReactElement } from "react"
import SharedButton from "../Shared/SharedButton"
import SharedActivityHeader from "../Shared/SharedActivityHeader"
import LimitQuoteAssetCard from "./LimitQuoteAssetCard"
import { useBackgroundDispatch, useBackgroundSelector } from "../../hooks"
import { DAY, HOUR } from "@tallyho/tally-background/constants"

import { BaseLimitOrder } from "@tallyho/tally-background/lib/keeper-dao"

import {
  selectCurrentLimitOrder,
  resetLimitState,
} from "@tallyho/tally-background/redux-slices/limit-orders"
import { signAndSendLimitOrder } from "@tallyho/tally-background/redux-slices/transaction-construction"
import { useHistory } from "react-router-dom"
import LimitSettings from "./LimitSettings"

const verifyLimitOrder = (record: any): BaseLimitOrder => {
  if (!record.maker || typeof record.maker !== "string") {
    throw new Error(`Invalid 'maker' property on limit order.`)
  }
  if (!record.makerAmount || typeof record.makerAmount !== "bigint") {
    throw new Error(`Invalid 'makerAmount' property on limit order.`)
  }
  if (!record.takerAmount || typeof record.takerAmount !== "bigint") {
    throw new Error(`Invalid 'takerAmount' property on limit order.`)
  }
  if (!record.makerToken || typeof record.makerToken !== "string") {
    throw new Error(`Invalid 'makerToken' property on limit order.`)
  }
  if (!record.takerToken || typeof record.takerToken !== "string") {
    throw new Error(`Invalid 'takerToken' property on limit order.`)
  }

  // Expiration must be in seconds
  let expiration = ""

  switch (record.expiry) {
    case "1h":
      expiration = String(Math.round((Date.now() + HOUR) / 1000))
      break
    case "2h":
      expiration = String(Math.round((Date.now() + HOUR * 2) / 1000))
      break
    case "1d":
      expiration = String(Math.round((Date.now() + DAY) / 1000))
      break
    case "1w":
      expiration = String(Math.round(Date.now() + DAY * 7) / 1000)
      break
    default:
      throw new Error("Unrecognized Expiry")
  }

  return {
    maker: record.maker,
    makerAmount: record.makerAmount,
    takerAmount: record.takerAmount,
    makerToken: record.makerToken,
    takerToken: record.takerToken,
    expiry: expiration,
  }
}

export default function LimitQuote(): ReactElement {
  const history = useHistory()
  const dispatch = useBackgroundDispatch()

  const limit = useBackgroundSelector((state) => {
    return state.limit
  })

  const limitOrderState = useBackgroundSelector(selectCurrentLimitOrder)

  const handleConfirm = async () => {
    if (limitOrderState) {
      try {
        const verifiedLimitOrder = verifyLimitOrder(limitOrderState)
        dispatch(signAndSendLimitOrder(verifiedLimitOrder))
        dispatch(resetLimitState())
        history.push("/")
      } catch (e) {
        console.error(e)
      }
    }
  }

  const exchangeRateLabel = `1 ${
    limit.sellAsset?.symbol
  } = ${new Intl.NumberFormat("en-US").format(
    +limit.buyAmount / +limit.sellAmount
  )} ${limit.buyAsset?.symbol}`

  return (
    <section className="center_horizontal standard_width">
      <SharedActivityHeader label="Limit Order" activity="limit" />
      <div className="qoute_cards">
        <LimitQuoteAssetCard type="sell" test="enabled" />
        <span className="icon_switch" />
        <LimitQuoteAssetCard type="buy" />
      </div>
      <span className="label label_right">{exchangeRateLabel}</span>
      <div className="settings_wrap">
        <LimitSettings />
      </div>

      <>
        <div className="exchange_section_wrap">
          <div className="exchange_content standard_width">
            <div className="left">
              <div className="icon_rook" />
              <a
                className="keeper-link"
                href="https://www.keeperdao.com/"
                target="_blank"
              >
                Powered By KeeperDAO
              </a>
            </div>
          </div>
        </div>
        <div className="approve_button center_horizontal">
          <SharedButton type="primary" size="large" onClick={handleConfirm}>
            Sign Limit Order
          </SharedButton>
        </div>
      </>
      <style jsx>
        {`
          section {
            margin-top: -24px;
          }
          .icon_rook {
            background: url("./images/rook@2x.png");
            background-size: 24px 24px;
            width: 24px;
            height: 24px;
            margin-right: 8px;
          }
          .keeper-link,
          .keeper-link:visited,
          .keeper-link:hover,
          .keeper-link:active {
            color: var(--gold-80);
          }
          .approval_steps {
            height: 96px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            margin-top: 24px;
          }
          .icon_switch {
            background: url("./images/switch@2x.png") center no-repeat;
            background-size: 20px 20px;
            width: 40px;
            height: 32px;
            border-radius: 4px;
            border: 3px solid var(--hunter-green);
            background-color: var(--green-95);
            margin-left: -11px;
            margin-right: -11px;
            z-index: 5;
            flex-grow: 1;
            flex-shrink: 0;
          }
          .qoute_cards {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .label_right {
            float: right;
            margin-top: 16px;
          }
          .settings_wrap {
            margin-top: 44px;
          }
          .exchange_content {
            height: 40px;
            border-radius: 4px;
            background-color: var(--green-95);
            color: var(--green-20);
            font-size: 14px;
            font-weight: 400;
            letter-spacing: 0.42px;
            line-height: 16px;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 0px 16px;
            box-sizing: border-box;
          }
          .approve_button {
            width: fit-content;
            margin-top: 36px;
          }
          .exchange_section_wrap {
            margin-top: 16px;
          }
          .left {
            display: flex;
            align-items: center;
          }
        `}
      </style>
    </section>
  )
}
