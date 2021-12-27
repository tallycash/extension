import React, { ReactElement, useState, useEffect, useCallback } from "react"

import SharedSlideUpMenu from "../Shared/SharedSlideUpMenu"
import SharedButton from "../Shared/SharedButton"
import SharedNetworkFeeGroup from "../Shared/SharedNetworkFeeGroup"
import { useBackgroundDispatch, useBackgroundSelector } from "../../hooks"
import { Asset } from "@tallyho/tally-background/assets"
import {
  fetchLimitPrices,
  setExpiration,
} from "@tallyho/tally-background/redux-slices/limit-orders"

interface LimitSettingsProps {
  fromAsset?: Asset
  toAsset?: Asset
}

export default function LimitSettings(props: LimitSettingsProps): ReactElement {
  const dispatch = useBackgroundDispatch()

  const [isSlideUpMenuOpen, setIsSlideUpMenuOpen] = useState(false)

  const limit = useBackgroundSelector((state) => {
    return state.limit
  })

  // Fetch tokens from the KeeperDAO API whenever the swap page is loaded
  useEffect(() => {
    if (props.fromAsset) {
      dispatch(fetchLimitPrices(props.fromAsset))
    }
  }, [dispatch])

  const changeExpiration = useCallback(
    (expiration: "1h" | "2h" | "1d" | "1w") => {
      dispatch(setExpiration(expiration))
    },

    [dispatch]
  )

  function handleClick() {
    setIsSlideUpMenuOpen(!isSlideUpMenuOpen)
  }

  return (
    <>
      <SharedSlideUpMenu
        isOpen={isSlideUpMenuOpen}
        title="Transaction Settings"
        size="custom"
        customSize="160px"
        close={() => {
          setIsSlideUpMenuOpen(false)
        }}
      >
        <div className="settings_wrap">
          <div className="settings_label">
            Transaction Expiry <span title="lorem ipsum lorem ipsum">ⓘ</span>
          </div>
          <div className="row">
            <SharedButton
              type={limit.expiration === "1h" ? "primary" : "secondary"}
              size="small"
              onClick={() => changeExpiration("1h")}
            >
              1 Hour
            </SharedButton>
            <SharedButton
              type={limit.expiration === "2h" ? "primary" : "secondary"}
              size="small"
              onClick={() => changeExpiration("2h")}
            >
              2 Hours
            </SharedButton>
            <SharedButton
              type={limit.expiration === "1d" ? "primary" : "secondary"}
              size="small"
              onClick={() => changeExpiration("1d")}
            >
              1 Day
            </SharedButton>
            <SharedButton
              type={limit.expiration === "1w" ? "primary" : "secondary"}
              size="small"
              onClick={() => changeExpiration("1w")}
            >
              1 Week
            </SharedButton>
          </div>
        </div>
      </SharedSlideUpMenu>
      <div className="top_label label">
        Transaction Settings
        <button type="button" onClick={handleClick}>
          <span className="icon_cog" />
        </button>
      </div>
      <div className="labels_wrap standard_width">
        <span className="label">
          {`Transaction Expiry`}
          <div className="info">{limit.expiration}</div>
        </span>
      </div>
      <style jsx>
        {`
          .labels_wrap {
            height: 50px;
            border-radius: 4px;
            background-color: var(--green-95);
            padding: 16px;
            box-sizing: border-box;
          }
          .row {
            padding: 15px 0px;
            display: flex;
            justify-content: space-around;
            align-items: center;
          }
          .top_label {
            margin-bottom: 7px;
          }
          .settings_label {
            height: 17px;
            color: var(--green-40);
            font-size: 14px;
            font-weight: 400;
            padding-top: 15px;
            letter-spacing: 0.42px;
            line-height: 16px;
          }
          .settings_label_fee {
            margin-bottom: 7px;
          }
          .icon_cog {
            display: block;
            mask-image: url("./images/cog@2x.png");
            mask-size: cover;
            width: 12px;
            height: 12px;
            background-color: var(--green-60);
          }
          .icon_cog:hover {
            background-color: #fff;
          }
          .settings_wrap {
            width: 384px;
            height: 208px;
            background-color: var(--hunter-green);
            margin-top: 5px;
            padding: 0px 17px;
            box-sizing: border-box;
          }
          .label:first-of-type {
            margin-bottom: 7px;
          }
          .info {
            color: var(--green-20);
            font-size: 14px;
            font-weight: 400;
            letter-spacing: 0.42px;
            line-height: 16px;
            text-align: right;
          }
          .label {
            margin-bottom: 5px;
          }
        `}
      </style>
    </>
  )
}
