import React, { ReactElement, useState } from "react"
import {
  NetworkFeeSettings,
  updateTransactionData,
} from "@tallyho/tally-background/redux-slices/transaction-construction"
import { selectEstimatedFeesPerGas } from "@tallyho/tally-background/redux-slices/selectors/transactionConstructionSelectors"
import { useBackgroundDispatch, useBackgroundSelector } from "../../../../hooks"
import FeeSettingsButton from "../../../NetworkFees/FeeSettingsButton"
import NetworkSettingsChooser from "../../../NetworkFees/NetworkSettingsChooser"
import SharedSlideUpMenu from "../../../Shared/SharedSlideUpMenu"
import SharedBanner from "../../../Shared/SharedBanner"
import { SigningDataTransactionProps } from "."

export default function SigningDataTransactionDetailPanel({
  transactionRequest,
}: SigningDataTransactionProps): ReactElement {
  const dispatch = useBackgroundDispatch()
  const [networkSettingsModalOpen, setNetworkSettingsModalOpen] =
    useState(false)

  const estimatedFeesPerGas = useBackgroundSelector(selectEstimatedFeesPerGas)

  const networkSettingsSaved = async (networkSetting: NetworkFeeSettings) => {
    dispatch(
      updateTransactionData({
        ...transactionRequest,
        gasLimit: networkSetting.gasLimit ?? transactionRequest.gasLimit,
      })
    )

    setNetworkSettingsModalOpen(false)
  }

  return (
    <div className="detail_items_wrap standard_width_padded">
      <SharedSlideUpMenu
        size="custom"
        isOpen={networkSettingsModalOpen}
        close={() => setNetworkSettingsModalOpen(false)}
        customSize={`${3 * 56 + 320}px`}
      >
        <NetworkSettingsChooser
          estimatedFeesPerGas={estimatedFeesPerGas}
          onNetworkSettingsSave={networkSettingsSaved}
        />
      </SharedSlideUpMenu>
      {transactionRequest.annotation?.warnings?.includes(
        "insufficient-funds"
      ) && (
        <span className="detail_item">
          <SharedBanner icon="notif-attention" iconColor="var(--attention)">
            <span className="detail_warning">
              Not enough {transactionRequest.network.baseAsset.symbol} for
              network fees
            </span>
          </SharedBanner>
        </span>
      )}
      <span className="detail_item">
        Estimated network fee
        <FeeSettingsButton onClick={() => setNetworkSettingsModalOpen(true)} />
      </span>
      <style jsx>
        {`
          .detail_item {
            width: 100%;
            color: var(--green-40);
            font-size: 14px;
            line-height: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }
          .detail_items_wrap {
            display: flex;
            margin-top: 21px;
            flex-direction: column;
          }
          .detail_item_right {
            color: var(--green-20);
            font-size: 16px;
          }
          .detail_warning {
            font-size: 16px;
            line-height: 24px;
            font-weight: 500;
            color: var(--attention);
          }
        `}
      </style>
    </div>
  )
}
