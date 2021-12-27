import React, { ReactElement, useEffect, useCallback, useState } from "react"
import {
  fetchSwapAssets,
  fetchSwapPrices,
  fetchSwapQuote,
  setSwapTrade,
  setSwapAmount,
  selectSwappableAssets,
  selectSwapPrice,
  clearSwapQuote,
} from "@tallyho/tally-background/redux-slices/0x-swap"
import { selectAccountAndTimestampedActivities } from "@tallyho/tally-background/redux-slices/selectors"
import CorePage from "../components/Core/CorePage"
import SharedAssetInput from "../components/Shared/SharedAssetInput"
import SharedButton from "../components/Shared/SharedButton"
import SharedSlideUpMenu from "../components/Shared/SharedSlideUpMenu"
import SwapQoute from "../components/Swap/SwapQuote"
import SharedActivityHeader from "../components/Shared/SharedActivityHeader"
import SwapTransactionSettings from "../components/Swap/SwapTransactionSettings"
import { useBackgroundDispatch, useBackgroundSelector } from "../hooks"
import Limit from "./Limit"

export default function Swap(): ReactElement {
  const dispatch = useBackgroundDispatch()
  const [confirmationMenu, setConfirmationMenu] = useState(false)
  const [openTokenMenu, setOpenTokenMenu] = useState(false)
  const [activeActivity, setActiveActivity] = useState<"swap" | "limit">(
    "limit"
  )

  const { sellAsset, buyAsset, sellAmount, buyAmount, quote } =
    useBackgroundSelector((state) => state.swap)

  // Fetch assets from the 0x API whenever the swap page is loaded
  useEffect(() => {
    dispatch(fetchSwapAssets())

    // Clear any saved quote data when the swap page is closed
    return () => {
      dispatch(clearSwapQuote())
    }
  }, [dispatch])

  const { combinedData } = useBackgroundSelector(
    selectAccountAndTimestampedActivities
  )

  const sellAssets = combinedData.assets.map(({ asset }) => asset)
  const buyAssets = useBackgroundSelector(selectSwappableAssets)
  const buyPrice = useBackgroundSelector(selectSwapPrice)

  const getQuote = useCallback(async () => {
    if (buyAsset && sellAsset) {
      const quoteOptions = {
        assets: { sellAsset, buyAsset },
        amount: { sellAmount, buyAmount },
      }

      // TODO: Display a loading indicator while fetching the quote
      dispatch(fetchSwapQuote(quoteOptions))
    }
  }, [dispatch, sellAsset, buyAsset, sellAmount, buyAmount])

  // We have to watch the state to determine when the quote is fetched
  useEffect(() => {
    if (quote) {
      // Now open the asset menu
      setConfirmationMenu(true)
    }
  }, [quote])

  const fromAssetSelected = useCallback(
    async (asset) => {
      dispatch(
        setSwapTrade({
          sellAsset: asset,
        })
      )

      await dispatch(fetchSwapPrices(asset))
    },

    [dispatch]
  )

  const toAssetSelected = useCallback(
    (asset) => {
      dispatch(
        setSwapTrade({
          buyAsset: asset,
        })
      )
    },

    [dispatch]
  )

  const fromAmountChanged = useCallback(
    (amount) => {
      const inputValue = amount.replace(/[^0-9.]/g, "") // Allow numbers and decimals only
      const floatValue = parseFloat(inputValue)

      if (Number.isNaN(floatValue)) {
        dispatch(
          setSwapAmount({
            sellAmount: inputValue,
            buyAmount: "0",
          })
        )
      } else {
        dispatch(
          setSwapAmount({
            sellAmount: inputValue,
            // TODO: Use a safe math library
            buyAmount: (floatValue / parseFloat(buyPrice)).toString(),
          })
        )
      }
    },

    [dispatch, buyPrice]
  )

  const toAmountChanged = useCallback(
    (amount) => {
      const inputValue = amount.replace(/[^0-9.]/g, "") // Allow numbers and decimals only
      const floatValue = parseFloat(inputValue)

      if (Number.isNaN(floatValue)) {
        dispatch(
          setSwapAmount({
            sellAmount: "0",
            buyAmount: inputValue,
          })
        )
      } else {
        dispatch(
          setSwapAmount({
            // TODO: Use a safe math library
            sellAmount: (floatValue * parseFloat(buyPrice)).toString(),
            buyAmount: inputValue,
          })
        )
      }
    },

    [dispatch, buyPrice]
  )

  return (
    <>
      <CorePage>
        <SharedSlideUpMenu
          isOpen={confirmationMenu}
          close={() => {
            setConfirmationMenu(false)
            dispatch(clearSwapQuote())
          }}
          size="large"
        >
          <SwapQoute />
        </SharedSlideUpMenu>
        <div className="standard_width">
          <div
            style={{
              marginBottom: "-23px",
              marginTop: "-20px",
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <span onClick={() => setActiveActivity("swap")}>
              <SharedActivityHeader
                inactive={activeActivity !== "swap"}
                label="Swap Assets"
                activity="swap"
              />
            </span>
            <span className="activity_separator"> - </span>
            <span onClick={() => setActiveActivity("limit")}>
              <SharedActivityHeader
                inactive={activeActivity !== "limit"}
                label="Limit Order"
                activity="limit"
              />
            </span>
          </div>
          {activeActivity === "swap" ? (
            <div className="form">
              <div className="form_input">
                <SharedAssetInput
                  assets={sellAssets}
                  defaultAsset={sellAsset}
                  onAssetSelect={fromAssetSelected}
                  onAmountChange={fromAmountChanged}
                  amount={sellAmount}
                  label="Swap from:"
                />
              </div>
              <div className="icon_change" />
              <div className="form_input">
                <SharedAssetInput
                  assets={buyAssets}
                  defaultAsset={buyAsset}
                  onAssetSelect={toAssetSelected}
                  onAmountChange={toAmountChanged}
                  amount={buyAmount}
                  label="Swap to:"
                />
              </div>
              <div className="settings_wrap">
                <SwapTransactionSettings />
              </div>
              <div className="footer standard_width_padded">
                <SharedButton
                  type="primary"
                  size="large"
                  isDisabled={!sellAsset || !buyAsset}
                  onClick={getQuote}
                >
                  Get final quote
                </SharedButton>
              </div>
            </div>
          ) : (
            <></>
          )}
          {activeActivity === "limit" ? <Limit /> : <></>}
        </div>
      </CorePage>
      <style jsx>
        {`
          .network_fee_group {
            display: flex;
            margin-bottom: 29px;
          }
          .network_fee_button {
            margin-right: 16px;
          }
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
        `}
      </style>
    </>
  )
}
