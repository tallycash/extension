import React, {
  ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { AnyAsset, Asset } from "@tallyho/tally-background/assets"
import { normalizeEVMAddress } from "@tallyho/tally-background/lib/utils"
import {
  convertFixedPointNumber,
  fixedPointNumberToString,
  parseToFixedPointNumber,
} from "@tallyho/tally-background/lib/fixed-point"
import SharedButton from "./SharedButton"
import SharedSlideUpMenu from "./SharedSlideUpMenu"
import SharedAssetItem, {
  AnyAssetWithOptionalAmount,
  hasAmounts,
} from "./SharedAssetItem"
import SharedAssetIcon from "./SharedAssetIcon"

interface SelectAssetMenuContentProps<AssetType extends AnyAsset> {
  assets: AnyAssetWithOptionalAmount<AssetType>[]
  setSelectedAssetAndClose: (
    asset: AnyAssetWithOptionalAmount<AssetType>
  ) => void
}

// Sorts an AnyAssetWithOptionalAmount by symbol, alphabetically, according to
// the current locale.
function assetAlphabeticSorter<
  AssetType extends AnyAsset,
  T extends AnyAssetWithOptionalAmount<AssetType>
>({ asset: { symbol } }: T, { asset: { symbol: symbol2 } }: T) {
  return symbol.localeCompare(symbol2)
}

// Sorts an AnyAssetWithOptionalAmount by symbol, alphabetically, according to
// the current locale, but bubbles to the top any assets that match the passed
// `searchTerm` at the start of the symbol. Matches are case-insensitive for
// sorting purposes.
//
// For example, if a set of assets [DAAD, AD, AB, AC, AA] is passed, and the
// search term is empty, the list will be [DAAD, AA, AB, AC, AD]. If the search
// term is instead AA, the list will be [AA, DAAD, AB, AC, AD]. Note that this
// function performs no filtering against the search term, the search term is
// purely used to sort start-anchored symbol matches in front of all other
// assets.
function assetAlphabeticSorterWithFilter<
  AssetType extends AnyAsset,
  T extends AnyAssetWithOptionalAmount<AssetType>
>(searchTerm: string): (asset1: T, asset2: T) => number {
  const startingSearchTermRegExp = new RegExp(`^${searchTerm}.*$`, "i")

  return (
    { asset: { symbol: symbol1 } }: T,
    { asset: { symbol: symbol2 } }: T
  ) => {
    const searchTermStartMatch1 = startingSearchTermRegExp.test(symbol1)
    const searchTermStartMatch2 = startingSearchTermRegExp.test(symbol2)

    // If either search term matches at the start and the other doesn't, the
    // one that matches at the start is greater.
    if (searchTermStartMatch1 && !searchTermStartMatch2) {
      return -1
    }
    if (!searchTermStartMatch1 && searchTermStartMatch2) {
      return 1
    }

    return symbol1.localeCompare(symbol2)
  }
}

function SelectAssetMenuContent<T extends AnyAsset>(
  props: SelectAssetMenuContentProps<T>
): ReactElement {
  const { setSelectedAssetAndClose, assets } = props
  const [searchTerm, setSearchTerm] = useState("")
  const searchInput = useRef<HTMLInputElement | null>(null)

  const filteredAssets =
    searchTerm.trim() === ""
      ? assets
      : assets.filter(({ asset }) => {
          return (
            asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
            ("contractAddress" in asset &&
              searchTerm.startsWith("0x") &&
              normalizeEVMAddress(asset.contractAddress).includes(
                // The replace handles `normalizeEVMAddress`'s
                // octet alignment that prefixes a `0` to a partial address
                // if it has an uneven number of digits.
                normalizeEVMAddress(searchTerm).replace(/^0x0?/, "0x")
              ) &&
              asset.contractAddress.length >= searchTerm.length)
          )
        })

  const sortedFilteredAssets = filteredAssets.sort(
    searchTerm.trim() === ""
      ? assetAlphabeticSorter
      : assetAlphabeticSorterWithFilter(searchTerm.trim())
  )

  useEffect(() => {
    searchInput.current?.focus()
  }, [searchInput])

  return (
    <>
      <div className="standard_width_padded center_horizontal">
        <div className="search_label">Select token</div>
        <div className="search_wrap">
          <input
            type="text"
            ref={searchInput}
            className="search_input"
            placeholder="Search by name or address"
            spellCheck={false}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <span className="icon_search" />
        </div>
      </div>
      <div className="divider" />
      <ul>
        {sortedFilteredAssets.map((assetWithOptionalAmount) => {
          const { asset } = assetWithOptionalAmount
          return (
            <SharedAssetItem
              key={
                asset.metadata?.coinGeckoID ??
                asset.symbol +
                  ("contractAddress" in asset
                    ? normalizeEVMAddress(asset.contractAddress)
                    : "")
              }
              assetAndAmount={assetWithOptionalAmount}
              onClick={() => setSelectedAssetAndClose(assetWithOptionalAmount)}
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
  isDisabled: boolean
  toggleIsAssetMenuOpen?: () => void
}

function SelectedAssetButton(props: SelectedAssetButtonProps): ReactElement {
  const { asset, isDisabled, toggleIsAssetMenuOpen } = props

  return (
    <button type="button" disabled={isDisabled} onClick={toggleIsAssetMenuOpen}>
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
        button:disabled {
          cursor: default;
          color: var(--green-40);
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

interface SharedAssetInputProps<AssetType extends AnyAsset> {
  assetsAndAmounts: AnyAssetWithOptionalAmount<AssetType>[]
  label: string
  selectedAsset: AssetType | undefined
  amount: string
  isAssetOptionsLocked: boolean
  disableDropdown: boolean
  showMaxButton: boolean
  isDisabled?: boolean
  onAssetSelect?: (asset: AssetType) => void
  onAmountChange?: (value: string, errorMessage: string | undefined) => void
}

function isSameAsset(asset1: Asset, asset2: Asset) {
  return asset1.symbol === asset2.symbol // FIXME Once asset similarity logic is extracted, reuse.
}

function assetWithOptionalAmountFromAsset<T extends AnyAsset>(
  asset: T,
  assetsToSearch: AnyAssetWithOptionalAmount<T>[]
) {
  return assetsToSearch.find(({ asset: listAsset }) =>
    isSameAsset(asset, listAsset)
  )
}

export default function SharedAssetInput<T extends AnyAsset>(
  props: SharedAssetInputProps<T>
): ReactElement {
  const {
    assetsAndAmounts,
    label,
    selectedAsset,
    amount,
    isAssetOptionsLocked,
    disableDropdown,
    showMaxButton,
    isDisabled,
    onAssetSelect,
    onAmountChange,
  } = props

  const [openAssetMenu, setOpenAssetMenu] = useState(false)

  const toggleIsAssetMenuOpen = useCallback(() => {
    if (!isAssetOptionsLocked) {
      setOpenAssetMenu((currentlyOpen) => !currentlyOpen)
    }
  }, [isAssetOptionsLocked])

  const selectedAssetAndAmount =
    typeof selectedAsset !== "undefined"
      ? assetWithOptionalAmountFromAsset<T>(selectedAsset, assetsAndAmounts)
      : undefined

  const setSelectedAssetAndClose = useCallback(
    (assetWithOptionalAmount: AnyAssetWithOptionalAmount<T>) => {
      setOpenAssetMenu(false)
      onAssetSelect?.(assetWithOptionalAmount.asset)
    },

    [onAssetSelect]
  )

  const getErrorMessage = (givenAmount: string): string | undefined => {
    if (
      givenAmount.trim() === "" ||
      typeof selectedAssetAndAmount === "undefined" ||
      !hasAmounts(selectedAssetAndAmount) ||
      !("decimals" in selectedAssetAndAmount.asset)
    ) {
      return undefined
    }

    const parsedGivenAmount = parseToFixedPointNumber(givenAmount.trim())
    if (typeof parsedGivenAmount === "undefined") {
      return "Invalid amount"
    }

    const decimalMatched = convertFixedPointNumber(
      parsedGivenAmount,
      selectedAssetAndAmount.asset.decimals
    )
    if (decimalMatched.amount > selectedAssetAndAmount.amount) {
      return "Insufficient balance"
    }

    return undefined
  }

  const setMaxBalance = () => {
    if (
      typeof selectedAssetAndAmount === "undefined" ||
      !hasAmounts(selectedAssetAndAmount)
    ) {
      return
    }

    const fixedPointAmount = {
      amount: selectedAssetAndAmount.amount,
      decimals:
        "decimals" in selectedAssetAndAmount.asset
          ? selectedAssetAndAmount.asset.decimals
          : 0,
    }
    const fixedPointString = fixedPointNumberToString(fixedPointAmount)

    onAmountChange?.(fixedPointString, getErrorMessage(fixedPointString))
  }

  return (
    <>
      <label
        className="label"
        htmlFor={
          typeof selectedAsset === "undefined"
            ? "asset_selector"
            : "asset_amount_input"
        }
      >
        {label}
      </label>

      {typeof selectedAssetAndAmount !== "undefined" &&
      hasAmounts(selectedAssetAndAmount) ? (
        <div className="amount_controls">
          <span className="available">
            Balance: {selectedAssetAndAmount.localizedDecimalAmount}
          </span>
          {showMaxButton ? (
            <button type="button" className="max" onClick={setMaxBalance}>
              Max
            </button>
          ) : (
            <></>
          )}
        </div>
      ) : (
        <></>
      )}

      <SharedSlideUpMenu
        isOpen={openAssetMenu}
        close={() => {
          setOpenAssetMenu(false)
        }}
      >
        {assetsAndAmounts && (
          <SelectAssetMenuContent
            assets={assetsAndAmounts}
            setSelectedAssetAndClose={setSelectedAssetAndClose}
          />
        )}
      </SharedSlideUpMenu>
      <div className="asset_wrap standard_width">
        <div>
          {selectedAssetAndAmount?.asset.symbol ? (
            <SelectedAssetButton
              isDisabled={isDisabled || disableDropdown}
              asset={selectedAssetAndAmount.asset}
              toggleIsAssetMenuOpen={toggleIsAssetMenuOpen}
            />
          ) : (
            <SharedButton
              id="asset_selector"
              type="secondary"
              size="medium"
              isDisabled={isDisabled || disableDropdown}
              onClick={toggleIsAssetMenuOpen}
              icon="chevron"
            >
              Select token
            </SharedButton>
          )}
        </div>

        <input
          id="asset_amount_input"
          className="input_amount"
          type="number"
          step="any"
          placeholder="0.0"
          min="0"
          disabled={isDisabled}
          value={amount}
          spellCheck={false}
          onChange={(event) =>
            onAmountChange?.(
              event.target.value,
              getErrorMessage(event.target.value)
            )
          }
        />
        <div className="error_message">{getErrorMessage(amount)}</div>
      </div>
      <style jsx>
        {`
          label,
          .amount_controls {
            font-weight: 500;
          }
          .amount_controls {
            line-height: 27px;
            // align with label top + offset by border radius right
            margin: -27px 4px 0 0;

            color: var(--green-40);
            text-align: right;
            position: relative;
            font-size: 14px;
          }
          .max {
            margin-left: 8px; // space to balance
            color: #d08e39;
            cursor: pointer;
          }
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
          .input_amount::placeholder {
            color: var(--green-40);
            opacity: 1;
          }
          .input_amount {
            max-width: 125px;
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
          .input_amount:disabled {
            cursor: default;
            color: var(--green-40);
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
        `}
      </style>
    </>
  )
}

SharedAssetInput.defaultProps = {
  isAssetOptionsLocked: false,
  disableDropdown: false,
  isDisabled: false,
  showMaxButton: true,
  assetsAndAmounts: [],
  label: "",
  amount: "0.0",
}
