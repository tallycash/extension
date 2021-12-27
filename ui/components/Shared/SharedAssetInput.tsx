import React, { ReactElement, useCallback, useEffect, useState } from "react"
import { Asset } from "@tallyho/tally-background/assets"
import classNames from "classnames"
import SharedButton from "./SharedButton"
import SharedSlideUpMenu from "./SharedSlideUpMenu"
import SharedAssetItem from "./SharedAssetItem"
import SharedAssetIcon from "./SharedAssetIcon"

interface SelectAssetMenuContentProps {
  assets: Asset[]
  setSelectedAssetAndClose: (asset: Asset) => void
  filterAssets?: (value: string) => void
}

function SelectAssetMenuContent(
  props: SelectAssetMenuContentProps
): ReactElement {
  const { setSelectedAssetAndClose, assets, filterAssets } = props

  return (
    <>
      <div className="standard_width_padded center_horizontal">
        <div className="search_label">Select token</div>
        <div className="search_wrap">
          <input
            type="text"
            className="search_input"
            placeholder="Search by name"
            onChange={(e) => {
              if (filterAssets) {
                filterAssets(e.target.value)
              }
            }}
          />
          <span className="icon_search" />
        </div>
      </div>
      <div className="divider" />
      <ul>
        {assets.map((asset, i) => {
          return (
            <SharedAssetItem
              key={i}
              asset={asset}
              onClick={setSelectedAssetAndClose}
            />
          )
        })}
      </ul>
      <style jsx>
        {`
          .search_label {
            height: 20px;
            color: var(--green-60);
            font-size: 16px;
            font-weight: 500;
            line-height: 24px;
            margin-bottom: 16px;
            margin-top: -5px;
          }
          .search_wrap {
            display: flex;
          }
          .search_input {
            width: 336px;
            height: 48px;
            border-radius: 4px;
            border: 1px solid var(--green-60);
            padding-left: 16px;
            box-sizing: border-box;
            color: var(--green-40);
          }
          .search_input::placeholder {
            color: var(--green-40);
          }
          .icon_search {
            background: url("./images/search_large@2x.png");
            background-size: 24px 24px;
            width: 24px;
            height: 24px;
            position: absolute;
            right: 42px;
            margin-top: 11px;
          }
          .divider {
            width: 384px;
            border-bottom: 1px solid var(--hunter-green);
            margin-top: 15px;
            margin-bottom: 8.5px;
          }
        `}
      </style>
    </>
  )
}

interface SelectedAssetButtonProps {
  asset: Asset
  toggleIsAssetMenuOpen?: () => void
}

function SelectedAssetButton(props: SelectedAssetButtonProps): ReactElement {
  const { asset, toggleIsAssetMenuOpen } = props

  return (
    <button type="button" onClick={toggleIsAssetMenuOpen}>
      <div className="asset_icon_wrap">
        <SharedAssetIcon
          logoURL={asset?.metadata?.logoURL}
          symbol={asset?.symbol}
        />
      </div>

      {asset?.symbol}

      <style jsx>{`
        button {
          display: flex;
          align-items: center;
          color: #fff;
          font-size: 16px;
          font-weight: 500;
          line-height: 24px;
          text-transform: uppercase;
        }
        .asset_icon_wrap {
          margin-right: 8px;
        }
      `}</style>
    </button>
  )
}

SelectedAssetButton.defaultProps = {
  toggleIsAssetMenuOpen: null,
}

interface SharedAssetInputProps {
  isTypeDestination: boolean
  assets: Asset[]
  label: string
  defaultAsset: Asset
  controlledAsset?: Asset
  amount: string
  footer?: string
  maxBalance: number
  isAssetOptionsLocked: boolean
  disableDropdown: boolean
  onAssetSelect: (token: Asset) => void
  onAmountChange: (value: string, errorMessage: string | undefined) => void
  onSendToAddressChange: (value: string) => void
}

export default function SharedAssetInput(
  props: SharedAssetInputProps
): ReactElement {
  const {
    isTypeDestination,
    assets,
    label,
    defaultAsset,
    amount,
    maxBalance,
    isAssetOptionsLocked,
    disableDropdown,
    onAssetSelect,
    onAmountChange,
    onSendToAddressChange,
    controlledAsset,
  } = props

  const [openAssetMenu, setOpenAssetMenu] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState(defaultAsset)
  const [filteredAssets, setFilteredAssets] = useState(assets)

  React.useEffect(() => {
    setFilteredAssets(assets)
  }, [assets])

  useEffect(() => {
    if (controlledAsset) {
      setSelectedAsset(controlledAsset)
    }
  }, [controlledAsset])

  // TODO: Refactor this to track state in a more reasonable way
  useEffect(() => {
    setSelectedAsset(defaultAsset)
  }, [defaultAsset])

  const toggleIsAssetMenuOpen = useCallback(() => {
    if (!isAssetOptionsLocked) {
      setOpenAssetMenu((currentlyOpen) => !currentlyOpen)
    }
  }, [isAssetOptionsLocked])

  const setSelectedAssetAndClose = useCallback(
    (asset) => {
      setSelectedAsset(asset)
      setOpenAssetMenu(false)
      onAssetSelect?.(asset)
    },

    [onAssetSelect]
  )

  const getErrorMessage = (givenAmount: string): string | undefined => {
    return (!isTypeDestination && maxBalance >= Number(givenAmount)) ||
      Number(givenAmount) === 0
      ? undefined
      : "Insufficient balance"
  }

  return (
    <label className="label">
      {label}
      <SharedSlideUpMenu
        isOpen={openAssetMenu}
        close={() => {
          setOpenAssetMenu(false)
        }}
      >
        {assets ? (
          <SelectAssetMenuContent
            assets={filteredAssets}
            filterAssets={(value) => {
              setFilteredAssets(
                assets.filter((asset) =>
                  asset.symbol.toUpperCase().includes(value.toUpperCase())
                )
              )
            }}
            setSelectedAssetAndClose={setSelectedAssetAndClose}
          />
        ) : (
          <></>
        )}
      </SharedSlideUpMenu>
      <div className="asset_wrap standard_width">
        {isTypeDestination ? (
          <>
            <input
              className="asset_input"
              type="text"
              placeholder="0x..."
              onChange={(event) => {
                onSendToAddressChange(event.target.value)
              }}
            />
          </>
        ) : (
          <>
            <div className={classNames({ disable_click: disableDropdown })}>
              {selectedAsset?.symbol ? (
                <SelectedAssetButton
                  asset={selectedAsset}
                  toggleIsAssetMenuOpen={toggleIsAssetMenuOpen}
                />
              ) : (
                <SharedButton
                  type="secondary"
                  size="medium"
                  onClick={toggleIsAssetMenuOpen}
                  icon="chevron"
                >
                  Select token
                </SharedButton>
              )}
            </div>

            <input
              className="input_amount"
              type="number"
              step="any"
              placeholder="0.0"
              min="0"
              value={amount}
              onChange={(event) =>
                onAmountChange(
                  event.target.value,
                  getErrorMessage(event.target.value)
                )
              }
            />
          </>
        )}

        <div className={getErrorMessage(amount) ? "error_message" : "footer"}>
          {getErrorMessage(amount) || props.footer}
        </div>
      </div>
      <style jsx>
        {`
          .asset_wrap {
            height: 72px;
            border-radius: 4px;
            background-color: var(--green-95);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0px 16px;
            box-sizing: border-box;
          }
          .asset_input {
            height: 62px;
            border-radius: 4px;
            background-color: var(--green-95);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0px 16px;
            box-sizing: border-box;
          }
          .asset_input {
            width: 100%;
            height: 34px;
            font-size: 28px;
            font-weight: 500;
            line-height: 32px;
            color: #fff;
          }
          .asset_input::placeholder {
            color: var(--green-40);
            opacity: 1;
          }
          .paste_button {
            height: 24px;
            color: var(--trophy-gold);
            font-size: 18px;
            font-weight: 600;
            line-height: 24px;
            text-align: center;
            display: flex;
          }
          .icon_paste {
            background: url("./images/paste@2x.png");
            background-size: 24px 24px;
            width: 24px;
            height: 24px;
            margin-left: 8px;
          }
          .input_amount::placeholder {
            color: var(--green-40);
            opacity: 1;
          }
          .input_amount {
            width: 98px;
            height: 32px;
            color: #ffffff;
            font-size: 22px;
            font-weight: 500;
            line-height: 32px;
            text-align: right;
          }
          input::-webkit-outer-spin-button,
          input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          input[type="number"] {
            -moz-appearance: textfield;
          }
          .error_message {
            color: var(--error);
            position: absolute;
            font-weight: 500;
            font-size: 14px;
            line-height: 20px;
            transform: translateY(-3px);
            align-self: flex-end;
            text-align: end;
            width: 150px;
            background-color: var(--green-95);
            margin-left: 172px;
            z-index: 1;
          }
          .disable_click {
            pointer-events: none;
          }
          .footer {
            color: var(--green-40);
            position: fixed;
            font-weight: 500;
            font-size: 14px;
            line-height: 20px;
            transform: translateY(-3px);
            align-self: flex-end;
            text-align: end;
            width: 150px;
            background-color: var(--green-95);
            margin-left: 172px;
            z-index: 1;
          }
        `}
      </style>
    </label>
  )
}

SharedAssetInput.defaultProps = {
  isTypeDestination: false,
  isAssetOptionsLocked: false,
  disableDropdown: false,
  assets: [{ symbol: "ETH", name: "Example Asset" }],
  defaultAsset: { symbol: "", name: "" },
  label: "",
  amount: "0.0",
  footer: "",
  maxBalance: 0,
  onAssetSelect: () => {
    // do nothing by default
    // TODO replace this with support for undefined onClick
  },
  onAmountChange: () => {},
  onSendToAddressChange: () => {},
}
