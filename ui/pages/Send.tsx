import React, { ReactElement, useEffect, useState } from "react"
import {
  selectCurrentAccount,
  selectCurrentAccountBalances,
  selectMainCurrencySymbol,
} from "@tallyho/tally-background/redux-slices/selectors"
import {
  broadcastOnSign,
  NetworkFeeSettings,
  selectEstimatedFeesPerGas,
  setFeeType,
  updateTransactionOptions,
} from "@tallyho/tally-background/redux-slices/transaction-construction"
import { utils } from "ethers"
import { selectAccountNetwork } from "@tallyho/tally-background/redux-slices/ui"
import { isValidAddress } from "@tallyho/tally-background/lib/utils"
import {
  FungibleAsset,
  isFungibleAssetAmount,
} from "@tallyho/tally-background/assets"
import { ETH } from "@tallyho/tally-background/constants"
import {
  convertFixedPointNumber,
  parseToFixedPointNumber,
} from "@tallyho/tally-background/lib/fixed-point"
import { selectAssetPricePoint } from "@tallyho/tally-background/redux-slices/assets"
import { CompleteAssetAmount } from "@tallyho/tally-background/redux-slices/accounts"
import { enrichAssetAmountWithMainCurrencyValues } from "@tallyho/tally-background/redux-slices/utils/asset-utils"
import NetworkSettingsChooser from "../components/NetworkFees/NetworkSettingsChooser"
import SharedAssetInput from "../components/Shared/SharedAssetInput"
import SharedBackButton from "../components/Shared/SharedBackButton"
import SharedButton from "../components/Shared/SharedButton"
import { useBackgroundDispatch, useBackgroundSelector } from "../hooks"
import SharedSlideUpMenu from "../components/Shared/SharedSlideUpMenu"
import FeeSettingsButton from "../components/NetworkFees/FeeSettingsButton"

export default function Send(): ReactElement {
  const [selectedAsset, setSelectedAsset] = useState<FungibleAsset>(ETH)
  const [destinationAddress, setDestinationAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [gasLimit, setGasLimit] = useState<bigint | undefined>(undefined)
  const [hasError, setHasError] = useState(false)
  const [addressWarning, setAddressWarning] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [networkSettingsModalOpen, setNetworkSettingsModalOpen] =
    useState(false)

  const estimatedFeesPerGas = useBackgroundSelector(selectEstimatedFeesPerGas)
  const selectedNetwork = useBackgroundSelector(selectAccountNetwork)

  const dispatch = useBackgroundDispatch()
  const currentAccount = useBackgroundSelector(selectCurrentAccount)
  const balanceData = useBackgroundSelector(selectCurrentAccountBalances)
  const mainCurrencySymbol = useBackgroundSelector(selectMainCurrencySymbol)

  const fungibleAssetAmounts =
    // Only look at fungible assets.
    balanceData?.assetAmounts?.filter(
      (assetAmount): assetAmount is CompleteAssetAmount<FungibleAsset> =>
        isFungibleAssetAmount(assetAmount)
    )
  const assetPricePoint = useBackgroundSelector((state) =>
    selectAssetPricePoint(
      state.assets,
      selectedAsset.symbol,
      mainCurrencySymbol
    )
  )

  const assetAmountFromForm = () => {
    const fixedPointAmount = parseToFixedPointNumber(amount.toString())
    if (typeof fixedPointAmount === "undefined") {
      return undefined
    }

    const decimalMatched = convertFixedPointNumber(
      fixedPointAmount,
      selectedAsset.decimals
    )

    return enrichAssetAmountWithMainCurrencyValues(
      {
        asset: selectedAsset,
        amount: decimalMatched.amount,
      },
      assetPricePoint,
      2
    )
  }

  const assetAmount = assetAmountFromForm()

  const sendTransactionRequest = async () => {
    let from = currentAccount.address
    let to = destinationAddress

    if (currentAccount.network.checksum === "EIP-1191") {
      from = currentAccount.address.toLowerCase()
      to = destinationAddress.toLowerCase()
    }

    dispatch(broadcastOnSign(true))
    const transaction = {
      from,
      to,
      // eslint-disable-next-line no-underscore-dangle
      value: BigInt(utils.parseEther(amount?.toString())._hex),
      gasLimit,
    }
    return dispatch(updateTransactionOptions(transaction))
  }

  useEffect(() => {
    if (
      destinationAddress.match(/^(0x)?[0-9A-F]{40}$/) ||
      destinationAddress.match(/^(0x)?[0-9a-f]{40}$/)
    ) {
      setAddressError(null)
      return setAddressWarning("Address is not mixed-case")
    }

    if (
      destinationAddress !== "" &&
      !isValidAddress(destinationAddress, selectedNetwork)
    ) {
      setAddressWarning(null)
      return setAddressError("Bad checksum address")
    }

    setAddressError(null)
    return setAddressWarning(null)
  }, [destinationAddress, selectedNetwork])

  const networkSettingsSaved = (networkSetting: NetworkFeeSettings) => {
    setGasLimit(networkSetting.gasLimit)
    dispatch(setFeeType(networkSetting.feeType))
    setNetworkSettingsModalOpen(false)
  }

  return (
    <>
      <div className="standard_width">
        <div className="back_button_wrap">
          <SharedBackButton />
        </div>
        <h1 className="header">
          <span className="icon_activity_send_medium" />
          <div className="title">Send Asset</div>
        </h1>
        <div className="form">
          <div className="form_input">
            <SharedAssetInput
              label="Asset / Amount"
              onAssetSelect={setSelectedAsset}
              assetsAndAmounts={fungibleAssetAmounts}
              onAmountChange={(value, errorMessage) => {
                setAmount(value)
                if (errorMessage) {
                  setHasError(true)
                } else {
                  setHasError(false)
                }
              }}
              selectedAsset={selectedAsset}
              amount={amount}
              disableDropdown
            />
            <div className="value">
              ${assetAmount?.localizedMainCurrencyAmount ?? "-"}
            </div>
          </div>
          <div className="form_input send_to_field">
            <label htmlFor="send_address">Send To:</label>
            <input
              id="send_address"
              type="text"
              placeholder="0x..."
              spellCheck={!addressError}
              onChange={(event) => setDestinationAddress(event.target.value)}
            />
            {addressError && (
              <div className="error_message">{addressError}</div>
            )}
            {addressWarning && (
              <div className="warning_message">{addressWarning}</div>
            )}
          </div>
          <SharedSlideUpMenu
            size="custom"
            isOpen={networkSettingsModalOpen}
            close={() => setNetworkSettingsModalOpen(false)}
            customSize="488px"
          >
            <NetworkSettingsChooser
              estimatedFeesPerGas={estimatedFeesPerGas}
              onNetworkSettingsSave={networkSettingsSaved}
            />
          </SharedSlideUpMenu>
          <div className="network_fee">
            <p>Estimated network fee</p>
            <FeeSettingsButton
              onClick={() => setNetworkSettingsModalOpen(true)}
            />
          </div>
          <div className="divider" />
          <div className="send_footer standard_width_padded">
            <SharedButton
              type="primary"
              size="large"
              isDisabled={Number(amount) === 0 || !!addressError || hasError}
              linkTo={{
                pathname: "/sign-transaction",
                state: {
                  redirectTo: {
                    path: "/singleAsset",
                    state: { symbol: selectedAsset.symbol },
                  },
                },
              }}
              onClick={sendTransactionRequest}
            >
              Send
            </SharedButton>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .icon_activity_send_medium {
            background: url("./images/activity_send_medium@2x.png");
            background-size: 24px 24px;
            width: 24px;
            height: 24px;
            margin-right: 8px;
          }
          .title {
            width: 113px;
            height: 32px;
            color: #ffffff;
            font-size: 22px;
            font-weight: 500;
            line-height: 32px;
          }
          .back_button_wrap {
            position: absolute;
            margin-left: -1px;
            margin-top: -4px;
            z-index: 10;
          }
          .header {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            margin-top: 30px;
          }
          .form_input {
            margin-bottom: 22px;
          }

          .label_right {
            margin-right: 6px;
          }
          .divider {
            width: 384px;
            border-bottom: 1px solid #000000;
            margin-left: -16px;
          }
          .label {
            margin-bottom: 6px;
          }
          .value {
            display: flex;
            justify-content: flex-end;
            position: relative;
            top: -24px;
            right: 16px;
            color: var(--green-60);
            font-size: 12px;
            line-height: 16px;
          }
          div.send_to_field {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: space-between;
            position: relative;
          }
          div.send_to_field label {
            color: var(--green-40);
            text-align: right;
            font-size: 14px;
          }
          input#send_address {
            box-sizing: border-box;
            height: 72px;
            width: 100%;

            font-size: 22px;
            font-weight: 500;
            line-height: 72px;
            color: #fff;

            border-radius: 4px;
            background-color: var(--green-95);
            padding: 0px 16px;
          }
          .error_message,
          .warning_message {
            font-weight: 500;
            position: absolute;
            left: 16px;
            bottom: 3px;
            font-size: 14px;
            line-height: 20px;
          }
          .error_message {
            color: var(--error);
          }
          .warning_message {
            color: var(--trophy-gold);
          }
          .send_footer {
            display: flex;
            justify-content: flex-end;
            margin-top: 21px;
            padding-bottom: 20px;
          }
          .network_fee {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
        `}
      </style>
    </>
  )
}
