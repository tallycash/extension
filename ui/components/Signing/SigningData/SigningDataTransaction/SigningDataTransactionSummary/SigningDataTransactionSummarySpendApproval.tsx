import {
  ERC20_FUNCTIONS,
  ERC20_INTERFACE,
} from "@tallyho/tally-background/lib/erc20"
import {
  convertFixedPointNumber,
  fixedPointNumberToString,
  parseToFixedPointNumber,
} from "@tallyho/tally-background/lib/fixed-point"
import { isMaxUint256 } from "@tallyho/tally-background/lib/utils"
import { updateTransactionData } from "@tallyho/tally-background/redux-slices/transaction-construction"
import { AssetApproval } from "@tallyho/tally-background/services/enrichment"
import { ethers } from "ethers"
import { hexlify } from "ethers/lib/utils"
import React, { ReactElement, useState } from "react"
import { useDispatch } from "react-redux"
import classNames from "classnames"
import SharedAssetIcon from "../../../../Shared/SharedAssetIcon"
import SharedButton from "../../../../Shared/SharedButton"
import SharedInput from "../../../../Shared/SharedInput"
import SharedSkeletonLoader from "../../../../Shared/SharedSkeletonLoader"
import SharedTooltip from "../../../../Shared/SharedTooltip"
import SharedAddress from "../../../../Shared/SharedAddress"
import { SigningDataTransactionSummaryProps } from ".."

export default function SigningDataTransactionSummarySpendApproval({
  transactionRequest,
  annotation,
}: SigningDataTransactionSummaryProps<AssetApproval>): ReactElement {
  const dispatch = useDispatch()
  const {
    assetAmount: { asset, amount: approvalLimit },
    spenderAddress,
  } = annotation
  // `null` means no limit
  const approvalLimitString = isMaxUint256(approvalLimit)
    ? null
    : fixedPointNumberToString({
        amount: approvalLimit,
        decimals: asset.decimals,
      })

  const approvalLimitDisplayValue = `${
    approvalLimitString ?? "Infinite"
  } ${asset.symbol.toUpperCase()}`

  const [approvalLimitInput, setApprovalLimitInput] = useState<string | null>(
    null
  )

  const [hasError, setHasError] = useState(false)

  const changing = approvalLimitInput !== null

  const handleChangeClick = () => {
    setApprovalLimitInput(approvalLimitString ?? "")
  }

  const handleCancelClick = () => {
    setApprovalLimitInput(null)
  }

  const handleSaveClick = () => {
    if (!changing) return

    if (
      approvalLimitInput === "" ||
      approvalLimitInput === approvalLimitString
    ) {
      return
    }

    const decimalAmount = parseToFixedPointNumber(approvalLimitInput)

    if (
      decimalAmount === undefined ||
      (decimalAmount !== null && decimalAmount.amount < 0n)
    ) {
      setHasError(true)
      return
    }

    const bigintAmount =
      decimalAmount === null
        ? ethers.constants.MaxUint256.toBigInt()
        : convertFixedPointNumber(decimalAmount, asset.decimals).amount

    setApprovalLimitInput(null)

    const updatedInput = ERC20_INTERFACE.encodeFunctionData(
      ERC20_FUNCTIONS.approve,
      [spenderAddress, hexlify(bigintAmount)]
    )
    dispatch(
      updateTransactionData({
        ...transactionRequest,
        input: updatedInput,
      })
    )
  }

  return (
    <>
      <h1 className="serif_header title">Approve asset spend</h1>
      <div className="spend_destination_icons">
        <div className="site_icon" />
        <div className="asset_icon_wrap">
          <SharedAssetIcon
            size="large"
            symbol={asset.symbol}
            logoURL={asset.metadata?.logoURL}
          />
        </div>
      </div>
      <span className="site">
        Approve{" "}
        <SharedAddress address={spenderAddress} name={annotation.spenderName} />
      </span>
      <span className="spending_label">
        <SharedSkeletonLoader
          isLoaded={!!asset.symbol}
          customStyles="margin: 10px 0 0;"
          height={32}
        >
          Spend{" "}
          {asset.symbol ?? (
            <SharedAddress address={transactionRequest.to ?? ""} />
          )}{" "}
          tokens
        </SharedSkeletonLoader>
      </span>
      <form onSubmit={(event) => event.preventDefault()}>
        <div className="spend_limit_header">
          <span className="spend_limit_label">Spend limit</span>
          <SharedTooltip width={250}>
            <p className="spend_limit_tooltip">
              Spend limit is the amount of funds from a particular asset, that
              you allow a contract to spend.
            </p>
            <p className="spend_limit_tooltip">
              Infinite tx has the drawback that if the contract is mailicous, it
              can steal all your funds.
            </p>
          </SharedTooltip>
        </div>
        {changing ? (
          <div>
            <SharedInput
              label=""
              value={approvalLimitInput}
              placeholder={approvalLimitString ?? ""}
              onChange={(value) => {
                setApprovalLimitInput(value)
                setHasError(false)
              }}
              errorMessage={hasError ? `Invalid amount` : undefined}
              autoSelect
            />
            <div
              className={classNames("change_limit_actions", {
                has_error: hasError,
              })}
            >
              <SharedButton
                size="small"
                type="tertiary"
                onClick={handleCancelClick}
              >
                Cancel
              </SharedButton>
              <SharedButton
                size="small"
                isFormSubmit
                type="tertiary"
                onClick={handleSaveClick}
                isDisabled={
                  approvalLimitInput === "" ||
                  approvalLimitInput === approvalLimitString
                }
              >
                Save
              </SharedButton>
            </div>
          </div>
        ) : (
          <>
            <span
              className={classNames("spend_amount", {
                has_error: approvalLimitString === null,
              })}
            >
              {approvalLimitDisplayValue}
            </span>
            <SharedButton
              size="small"
              isFormSubmit
              type="tertiary"
              onClick={handleChangeClick}
            >
              Change limit
            </SharedButton>
          </>
        )}
      </form>
      <div className="spacer" />
      <style jsx>
        {`
          .site_icon {
            background: url("./images/dapp_favicon_default@2x.png");
            background-size: cover;
            width: 48px;
            height: 48px;
            margin-right: -16px;
          }
          .spend_destination_icons {
            display: flex;
            margin-top: 22px;
            margin-bottom: 16px;
          }
          .asset_icon_wrap {
            z-index: 1;
          }
          .site {
            color: #fff;
            font-size: 16px;
            font-weight: 500;
            line-height: 24px;
            text-align: center;
          }
          .spending_label {
            width: 272px;
            color: var(--green-40);
            font-size: 16px;
            line-height: 24px;
            text-align: center;
            border-bottom: 1px solid var(--green-120);
            padding-bottom: 16px;
            margin-bottom: 16px;
            text-align: center;
          }
          .spend_limit_header {
            display: flex;
            justify-content: center;
          }
          .spend_limit_label {
            color: var(--green-40);
            font-size: 14px;
            line-height: 16px;
            margin-bottom: 4px;
          }
          .spend_limit_tooltip {
            margin: 0 0 5px;
          }
          .spend_limit_tooltip:last-child {
            margin-bottom: 0;
          }
          .change_limit_actions {
            display: flex;
            justify-content: space-between;
          }
          .change_limit_actions.has_error {
            margin-top: 24px;
          }
          .spend_amount {
            color: #fff;
            font-size: 16px;
            line-height: 24px;
          }
          .spend_amount.has_error {
            color: var(--error);
          }
          .spacer {
            margin-bottom: 18px;
          }
        `}
      </style>
    </>
  )
}
