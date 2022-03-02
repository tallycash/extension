import React, { ReactElement, useEffect, useState } from "react"
import { selectAccountAndTimestampedActivities } from "@tallyho/tally-background/redux-slices/selectors"
import {
  approveApprovalTarget,
  checkApprovalTargetApproval,
  permitVaultDeposit,
  selectApprovalTargetApprovals,
} from "@tallyho/tally-background/redux-slices/earn"

import { AnyAsset } from "@tallyho/tally-background/assets"
import { HexString } from "@tallyho/tally-background/types"
import {
  sameEVMAddress,
  normalizeEVMAddress,
} from "@tallyho/tally-background/lib/utils"
import { useLocation } from "react-router-dom"
import BackButton from "../components/Shared/SharedBackButton"
import SharedAssetIcon from "../components/Shared/SharedAssetIcon"

import SharedButton from "../components/Shared/SharedButton"
import SharedPanelSwitcher from "../components/Shared/SharedPanelSwitcher"
import SharedAssetInput from "../components/Shared/SharedAssetInput"
import SharedSlideUpMenu from "../components/Shared/SharedSlideUpMenu"
import { useBackgroundDispatch, useBackgroundSelector } from "../hooks"

export default function EarnDeposit(): ReactElement {
  const [panelNumber, setPanelNumber] = useState(0)
  const [amount, setAmount] = useState("")
  const [hasError, setHasError] = useState(false)
  const [withdrawSlideupVisible, setWithdrawalSlideupVisible] = useState(false)
  const [isApproved, setIsApproved] = useState(false)
  const [deposited, setDeposited] = useState(false)
  const [availableRewards, setAvailableRewards] = useState("21,832")

  const dispatch = useBackgroundDispatch()

  const { asset } = useLocation().state as {
    asset: AnyAsset & { contractAddress: HexString }
  }

  const showWithdrawalModal = () => {
    setWithdrawalSlideupVisible(true)
  }

  const { combinedData } = useBackgroundSelector(
    selectAccountAndTimestampedActivities
  )

  // We currently assume that the approval held by ApprovalTarget is infinite and users wont decrease it themselves.
  const approvals = useBackgroundSelector(selectApprovalTargetApprovals)

  const isTokenApproved = () => {
    if (!isApproved) {
      const allowanceIndex = approvals?.findIndex((approval) =>
        sameEVMAddress(approval.contractAddress, asset.contractAddress)
      )
      if (allowanceIndex !== -1) {
        setIsApproved(true)
      }
    }
  }

  isTokenApproved()

  const approve = () => {
    dispatch(approveApprovalTarget(normalizeEVMAddress(asset.contractAddress)))
  }

  const enable = () => {
    dispatch(
      permitVaultDeposit({
        vaultContractAddress: normalizeEVMAddress(asset.contractAddress),
        amount: 2000n,
      })
    )
  }

  const deposit = () => {
    setDeposited(true)
  }

  const withdraw = () => {
    setDeposited(false)
    setWithdrawalSlideupVisible(false)
  }

  const claimRewards = () => {
    setAvailableRewards("0")
  }

  useEffect(() => {
    dispatch(
      checkApprovalTargetApproval(normalizeEVMAddress(asset.contractAddress))
    )
  }, [dispatch, asset.contractAddress])

  return (
    <>
      <section className="primary_info">
        <BackButton />
        <ul className="wrapper">
          <li className="row header">
            <div className="type">VAULT</div>
            <div className="center">
              <SharedAssetIcon size="large" symbol={asset.symbol} />
              <h1 className="asset_name">{asset.symbol}</h1>
            </div>
            <div>
              <a href="www.onet.pl" target="_blank">
                <div className="contract">
                  <div className="contract_link">Contract</div>
                  <span className="external" />
                </div>
              </a>
            </div>
          </li>
          <li className="row">
            <div className="label">Estimated APR</div>
            <div className="amount">250%</div>
          </li>
          <li className="row">
            <div className="label">Total value locked</div>
            <div className="amount">$20,283,219</div>
          </li>
          <li className="row">
            <div className="label">Rewards</div>
            <div className="rewards">
              <img className="lock" src="./images/lock@2.png" alt="Locked" />
              TALLY
            </div>
          </li>
        </ul>
        {deposited ? (
          <div className="wrapper">
            <li className="row">
              <div className="label">Deposited amount</div>
              <div className="amount">
                27,834 <span className="token">{asset.symbol}</span>
              </div>
            </li>
            <div className="divider" />
            <li className="row">
              <div className="label">Available rewards</div>
              <div className="amount">
                {availableRewards} <span className="token">TALLY</span>
              </div>
            </li>
            <li className="row claim">
              <button className="row" onClick={claimRewards} type="button">
                <div className="receive_icon" />
                Claim rewards
              </button>
            </li>
          </div>
        ) : (
          <></>
        )}
      </section>
      <SharedPanelSwitcher
        setPanelNumber={setPanelNumber}
        panelNumber={panelNumber}
        panelNames={["Deposit", "Withdraw", "Pool Info"]}
      />
      {panelNumber === 0 ? (
        <div className="deposit_wrap">
          <SharedAssetInput
            assetsAndAmounts={combinedData.assets}
            label="Deposit asset"
            onAmountChange={(value, errorMessage) => {
              setAmount(value)
              if (errorMessage) {
                setHasError(true)
              } else {
                setHasError(false)
              }
            }}
            selectedAsset={asset}
            amount={amount}
            disableDropdown
          />
          <div className="confirm">
            {!isApproved ? (
              <SharedButton
                type="primary"
                size="large"
                isDisabled={hasError}
                linkTo={!isApproved ? "/signTransaction" : "/signData"}
                onClick={!isApproved ? approve : enable}
              >
                {!isApproved ? "Approve" : "Enable"}
              </SharedButton>
            ) : (
              <SharedButton type="primary" size="large" onClick={deposit}>
                {!deposited ? "Deposit" : "Deposit more"}
              </SharedButton>
            )}
          </div>
        </div>
      ) : (
        <></>
      )}
      {panelNumber === 1 ? (
        <div className="standard_width">
          <ul className="list">
            <li className="list_item">
              Withdrawing your deposit will also automatically claim your
              rewards.
            </li>
            <li className="list_item">
              You can withdraw only the rewards by using the Claim rewards
              button.
            </li>
            <li className="list_item">
              Deposit can only be withdrawn in full.
            </li>
          </ul>
          <div className="withdraw_button">
            <SharedButton
              type="secondary"
              size="large"
              onClick={showWithdrawalModal}
            >
              Withdraw deposit + rewards
            </SharedButton>
          </div>
          <SharedSlideUpMenu
            isOpen={withdrawSlideupVisible}
            close={() => setWithdrawalSlideupVisible(false)}
            size="custom"
            customSize="400px"
          >
            <div className="container">
              <h2 className="withdrawal_title">Withdraw deposit & rewards</h2>
              <div className="withdrawal_info">
                Are you sure you want to withdraw deposited amount and rewards?
                <br /> If you only want to claim rewards you can do that by
                closing this and clicking claim rewards.
              </div>
              <div className="wrapper dark">
                <li className="row">
                  <div className="label">Deposited amount</div>
                  <div className="amount">
                    27,834 <span className="token">Curve ibGBP</span>
                  </div>
                </li>
                <div className="divider" />
                <li className="row">
                  <div className="label">Available rewards</div>
                  <div className="amount">
                    {availableRewards} <span className="token">TALLY</span>
                  </div>
                </li>
              </div>
              <li className="row">
                <SharedButton
                  size="large"
                  type="secondary"
                  onClick={() => setWithdrawalSlideupVisible(false)}
                >
                  Cancel
                </SharedButton>{" "}
                <SharedButton size="large" type="primary" onClick={withdraw}>
                  Confirm Withdraw
                </SharedButton>
              </li>
            </div>
          </SharedSlideUpMenu>
        </div>
      ) : (
        <></>
      )}
      {panelNumber === 2 ? (
        <div className="standard_width ">
          <p className="pool_info">
            This token represents a Curve liquidity pool. Holders earn fees from
            users trading in the pool, and can also deposit the LP to
            Curve&apos;s gauges to earn CRV emissions.
          </p>
          <p className="pool_info">
            This pool contains FEI, FRAX, and alUSD, three decentralized
            dollar-pegged stablecoins.
          </p>
        </div>
      ) : (
        <></>
      )}
      <style jsx>
        {`
          .primary_info {
            margin-top: 15px;
            width: 90%;
          }
          .withdrawal_title {
            font-size: 18px;
            margin: 0;
          }
          .withdrawal_info {
            padding: 24px 0;
            line-height: 24px;
          }
          .container {
            padding: 0 24px;
          }
          .row {
            position: relative;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
          }
          .header {
            padding-bottom: 48px;
          }
          .pool_info {
            padding: 0 12px;
          }
          .withdraw_button {
            display: flex;
            justify-content: flex-start;
            margin-bottom: 20px;
            margin-left: 24px;
          }
          .row.claim {
            justify-content: flex-end;
            color: var(--trophy-gold);
            font-weight: bold;
            cursor: pointer;
          }
          .receive_icon {
            mask-size: 12px 12px;
            height: 12px;
            width: 12px;
            mask-image: url("./images/receive@2x.png");
            margin-right: 8px;
            background-color: var(--trophy-gold);
          }
          .token {
            font-size: 14px;
          }
          .divider {
            height: 1px;
            background-color: #33514e;
          }
          .amount {
            font-size: 18px;
            font-weight: 500;
          }
          .list {
            display: flex;
            flex-flow: column;
            margin: 20px 0;
            padding-left: 40px;
          }
          .list_item {
            display: list-item;
            line-height: 24px;
            list-style-type: disc;
          }
          .label {
            color: var(--green-40);
            font-size: 14px;
          }
          .contract {
            display: flex;
            align-items: center;
            gap: 4px;
            justify-content: flex-end;
          }
          .contract_link {
            text-decoration: none;
            color: var(--green-40);
            font-size: 16px;
            font-weight: 400;
            height: 17px;
          }
          .external {
            mask-image: url("./images/external@2x.png");
            mask-size: 12px 12px;
            width: 12px;
            height: 12px;
            background-color: var(--green-40);
          }
          .wrapper {
            width: 100%;
            margin: 0 auto;
            display: flex;
            flex-flow: column;
            box-sizing: border-box;
            padding: 12px 16px;
            gap: 12px;
            border: 1px solid #33514e;
            margin-bottom: 16px;
          }
          .wrapper.dark {
            background-color: var(--hunter-green);
          }
          .asset_name {
            color: #fff;
            font-size: 22px;
            font-weight: 500;
            line-height: 32px;
            text-transform: uppercase;
            margin-top: 7px;
          }
          .center {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: absolute;
            top: -36px;
            left: 0px;
            right: 0px;
            pointer-events: none;
          }
          .type {
            height: 17px;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #a4cfff;
            background: #0b4789;
            font-size: 12px;
            padding: 0 4px;
            line-height: 17px;
            max-width: 40px;
          }
          .deposit_wrap {
            margin-top: 20px;
            height: 154px;
          }
          .confirm {
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .lock {
            height: 13px;
            padding-right: 4px;
            display: inline-block;
          }
          .rewards {
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            padding: 4px;
            background-color: var(--green-120);
          }
        `}
      </style>
    </>
  )
}
