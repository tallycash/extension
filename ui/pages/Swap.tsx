import React, {
  ReactElement,
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react"
import {
  fetchSwapPrice,
  clearSwapQuote,
  approveTransfer,
  selectLatestQuoteRequest,
  selectInProgressApprovalContract,
  SwapQuoteRequest,
  fetchSwapQuote,
} from "@tallyho/tally-background/redux-slices/0x-swap"
import { selectCurrentAccountBalances } from "@tallyho/tally-background/redux-slices/selectors"
import {
  AnyAsset,
  isSmartContractFungibleAsset,
  SmartContractFungibleAsset,
} from "@tallyho/tally-background/assets"
import { fixedPointNumberToString } from "@tallyho/tally-background/lib/fixed-point"
import { AsyncThunkFulfillmentType } from "@tallyho/tally-background/redux-slices/utils"
import logger from "@tallyho/tally-background/lib/logger"
import { useHistory, useLocation } from "react-router-dom"
import {
  normalizeEVMAddress,
  sameEVMAddress,
} from "@tallyho/tally-background/lib/utils"
import { CompleteSmartContractFungibleAssetAmount } from "@tallyho/tally-background/redux-slices/accounts"
import {
  clearTransactionState,
  selectDefaultNetworkFeeSettings,
  TransactionConstructionStatus,
} from "@tallyho/tally-background/redux-slices/transaction-construction"
import CorePage from "../components/Core/CorePage"
import SharedAssetInput from "../components/Shared/SharedAssetInput"
import SharedButton from "../components/Shared/SharedButton"
import SharedSlideUpMenu from "../components/Shared/SharedSlideUpMenu"
import SwapQuote from "../components/Swap/SwapQuote"
import SharedActivityHeader from "../components/Shared/SharedActivityHeader"
import SwapTransactionSettingsChooser from "../components/Swap/SwapTransactionSettingsChooser"
import { useBackgroundDispatch, useBackgroundSelector } from "../hooks"

// FIXME Unify once asset similarity code is unified.
function isSameAsset(asset1: AnyAsset, asset2: AnyAsset) {
  if (typeof asset1 === "undefined" || typeof asset2 === "undefined") {
    return false
  }

  if (
    isSmartContractFungibleAsset(asset1) &&
    isSmartContractFungibleAsset(asset2)
  ) {
    return sameEVMAddress(asset1.contractAddress, asset2.contractAddress)
  }

  if (
    isSmartContractFungibleAsset(asset1) ||
    isSmartContractFungibleAsset(asset2)
  ) {
    return false
  }

  return asset1.symbol === asset2.symbol
}

export default function Swap(): ReactElement {
  const dispatch = useBackgroundDispatch()
  const history = useHistory()
  const location = useLocation<
    { symbol: string; contractAddress?: string } | undefined
  >()

  const accountBalances = useBackgroundSelector(selectCurrentAccountBalances)

  // TODO Expand these to fungible assets by supporting direct ETH swaps,
  // TODO then filter by the current chain.

  const ownedSellAssetAmounts =
    accountBalances?.assetAmounts.filter(
      (assetAmount): assetAmount is CompleteSmartContractFungibleAssetAmount =>
        isSmartContractFungibleAsset(assetAmount.asset)
    ) ?? []

  const buyAssets = useBackgroundSelector((state) => {
    // Some type massaging needed to remind TypeScript how these types fit
    // together.
    const knownAssets: AnyAsset[] = state.assets
    return knownAssets.filter(isSmartContractFungibleAsset)
  })

  const {
    symbol: locationAssetSymbol,
    contractAddress: locationAssetContractAddress,
  } = location.state ?? {}
  const locationAsset = ownedSellAssetAmounts.find(
    ({ asset: candidateAsset }) => {
      if (typeof locationAssetContractAddress !== "undefined") {
        return (
          isSmartContractFungibleAsset(candidateAsset) &&
          sameEVMAddress(
            candidateAsset.contractAddress,
            locationAssetContractAddress
          )
        )
      }
      return candidateAsset.symbol === locationAssetSymbol
    }
  )?.asset

  const [confirmationMenu, setConfirmationMenu] = useState(false)

  const savedQuoteRequest = useBackgroundSelector(selectLatestQuoteRequest)
  const {
    assets: { sellAsset: savedSellAsset, buyAsset: savedBuyAsset },
    amount: savedSwapAmount,
  } = savedQuoteRequest ?? {
    assets: { sellAsset: locationAsset },
  }

  const [sellAsset, setSellAsset] = useState(savedSellAsset)
  const [buyAsset, setBuyAsset] = useState(savedBuyAsset)
  const [sellAmount, setSellAmount] = useState(
    typeof savedSwapAmount !== "undefined" && "sellAmount" in savedSwapAmount
      ? savedSwapAmount.sellAmount
      : ""
  )
  const [buyAmount, setBuyAmount] = useState(
    typeof savedSwapAmount !== "undefined" && "buyAmount" in savedSwapAmount
      ? savedSwapAmount.buyAmount
      : ""
  )
  const [needsApproval, setNeedsApproval] = useState(false)
  const [approvalTarget, setApprovalTarget] = useState<string | undefined>(
    undefined
  )

  const sellAssetAmounts = ownedSellAssetAmounts.some(
    ({ asset }) =>
      typeof sellAsset !== "undefined" && isSameAsset(asset, sellAsset)
  )
    ? ownedSellAssetAmounts
    : ownedSellAssetAmounts.concat(
        typeof sellAsset === "undefined"
          ? []
          : [
              {
                asset: sellAsset,
                amount: 0n,
                decimalAmount: 0,
                localizedDecimalAmount: "0",
              },
            ]
      )

  useEffect(() => {
    if (typeof sellAsset !== "undefined") {
      const isSelectedSellAssetInSellAssets = sellAssetAmounts.some(
        ({ asset }) => isSameAsset(asset, sellAsset)
      )

      if (!isSelectedSellAssetInSellAssets) {
        sellAssetAmounts.push({
          asset: sellAsset,
          amount: 0n,
          decimalAmount: 0,
          localizedDecimalAmount: "0",
        })
      }
    }
  }, [sellAsset, sellAssetAmounts])

  const inProgressApprovalContract = useBackgroundSelector(
    selectInProgressApprovalContract
  )
  const isApprovalInProgress = sameEVMAddress(
    inProgressApprovalContract || "0x",
    sellAsset?.contractAddress || "0x"
  )

  const [sellAmountLoading, setSellAmountLoading] = useState(false)
  const [buyAmountLoading, setBuyAmountLoading] = useState(false)

  const [swapTransactionSettings, setSwapTransactionSettings] = useState({
    slippageTolerance: 0.01,
    networkSettings: useBackgroundSelector(selectDefaultNetworkFeeSettings),
  })

  const latestQuoteRequest = useRef<SwapQuoteRequest | undefined>(
    savedQuoteRequest
  )

  const finalQuote = useBackgroundSelector((state) => state.swap.finalQuote)

  /* We have to watch the state to determine when the quote is fetched */
  useEffect(() => {
    if (typeof finalQuote !== "undefined") {
      // Now open the asset menu
      setConfirmationMenu(true)
    }
  }, [finalQuote])

  const getFinalQuote = async () => {
    // The final quote requires a previous non-final quote having been
    // requested; this is also guarded at the button (by disabling the button).
    if (typeof latestQuoteRequest.current === "undefined") {
      return false
    }

    dispatch(fetchSwapQuote(latestQuoteRequest.current))

    return true
  }

  const approveAsset = async () => {
    if (typeof sellAsset === "undefined") {
      logger.error("Attempting to approve transfer without a sell asset.")
      return
    }
    if (typeof approvalTarget === "undefined") {
      logger.error("Attempting to approve transfer without an approval target.")
      return
    }
    if (!isSmartContractFungibleAsset(sellAsset)) {
      logger.error(
        "Attempting to approve transfer of a non-contract asset.",
        sellAsset
      )
      return
    }

    // FIXME Set state to pending so SignTransaction doesn't redirect back; drop after
    // FIXME proper transaction queueing is in effect.
    await dispatch(clearTransactionState(TransactionConstructionStatus.Pending))

    dispatch(
      approveTransfer({
        assetContractAddress: normalizeEVMAddress(sellAsset.contractAddress),
        approvalTarget,
      })
    )

    history.push("/signTransaction")
  }

  const updateSwapData = useCallback(
    async (
      requestedQuote: "buy" | "sell",
      amount: string,
      // Fixed asset in the swap.
      fixedAsset?: SmartContractFungibleAsset | undefined,
      quoteAsset?: SmartContractFungibleAsset | undefined
    ): Promise<void> => {
      if (requestedQuote === "sell") {
        setBuyAmount("")
      } else {
        setSellAmount("")
      }

      const quoteSellAsset =
        requestedQuote === "buy"
          ? fixedAsset ?? sellAsset
          : quoteAsset ?? sellAsset
      const quoteBuyAsset =
        requestedQuote === "sell" && typeof fixedAsset !== "undefined"
          ? fixedAsset ?? buyAsset
          : quoteAsset ?? buyAsset

      // Swap amounts can't update unless both sell and buy assets are specified.
      if (
        typeof quoteSellAsset === "undefined" ||
        typeof quoteBuyAsset === "undefined" ||
        amount.trim() === ""
      ) {
        return
      }

      const quoteRequest: SwapQuoteRequest = {
        assets: {
          sellAsset: quoteSellAsset,
          buyAsset: quoteBuyAsset,
        },
        amount:
          requestedQuote === "sell"
            ? { sellAmount: amount }
            : { buyAmount: amount },
        slippageTolerance: swapTransactionSettings.slippageTolerance,
        gasPrice: swapTransactionSettings.networkSettings.values.maxFeePerGas,
      }

      // If there's a different quote in progress, reset all loading states as
      // we're about to replace it.
      if (latestQuoteRequest.current !== quoteRequest) {
        setBuyAmountLoading(false)
        setSellAmountLoading(false)
      }

      if (requestedQuote === "sell") {
        setBuyAmountLoading(true)
      } else {
        setSellAmountLoading(true)
      }

      latestQuoteRequest.current = quoteRequest
      const { quote, needsApproval: quoteNeedsApproval } = ((await dispatch(
        fetchSwapPrice(quoteRequest)
      )) as unknown as AsyncThunkFulfillmentType<typeof fetchSwapPrice>) ?? {
        quote: undefined,
        needsApproval: false,
      }

      // Only proceed if the quote we just got is the same one we were looking for.
      if (latestQuoteRequest.current === quoteRequest) {
        if (typeof quote === "undefined") {
          // If there's no quote, clear states and abort.
          setBuyAmountLoading(false)
          setSellAmountLoading(false)
          setNeedsApproval(false)
          setApprovalTarget(undefined)
          latestQuoteRequest.current = undefined

          // TODO set an error on the buy or sell state.

          return
        }

        setNeedsApproval(quoteNeedsApproval)
        setApprovalTarget(quote.allowanceTarget)

        if (requestedQuote === "sell") {
          setBuyAmount(
            fixedPointNumberToString({
              amount: BigInt(quote.buyAmount),
              decimals: quoteBuyAsset.decimals,
            })
          )
          setBuyAmountLoading(false)
        } else {
          setSellAmount(
            fixedPointNumberToString({
              amount: BigInt(quote.sellAmount),
              decimals: quoteSellAsset.decimals,
            })
          )
          setSellAmountLoading(false)
        }
      }
    },
    [
      buyAsset,
      dispatch,
      sellAsset,
      swapTransactionSettings.networkSettings.values.maxFeePerGas,
      swapTransactionSettings.slippageTolerance,
    ]
  )

  const updateSellAsset = useCallback(
    (asset: SmartContractFungibleAsset) => {
      setSellAsset(asset)
      // Updating the sell asset quotes the new sell asset against the existing
      // buy amount.
      updateSwapData("buy", buyAmount, asset)
    },
    [buyAmount, updateSwapData]
  )
  const updateBuyAsset = useCallback(
    (asset: SmartContractFungibleAsset) => {
      setBuyAsset(asset)
      // Updating the buy asset quotes the new buy asset against the existing
      // sell amount.
      updateSwapData("sell", sellAmount, asset)
    },
    [sellAmount, updateSwapData]
  )

  const flipSwap = useCallback(() => {
    setSellAsset(buyAsset)
    setBuyAsset(sellAsset)
    setSellAmount(buyAmount)

    updateSwapData("sell", buyAmount, sellAsset, buyAsset)
  }, [buyAmount, buyAsset, sellAsset, updateSwapData])

  useEffect(() => {
    if (
      typeof savedSwapAmount !== "undefined" &&
      typeof savedBuyAsset !== "undefined" &&
      typeof savedSellAsset !== "undefined"
    ) {
      updateSwapData(
        "sellAmount" in savedSwapAmount ? "sell" : "buy",
        "sellAmount" in savedSwapAmount
          ? savedSwapAmount.sellAmount
          : savedSwapAmount.buyAmount,
        "sellAmount" in savedSwapAmount ? savedBuyAsset : savedSellAsset
      )
    } else {
      dispatch(clearSwapQuote())
    }
    // We want to run this in three cases:
    // - Once at component load, to make sure the flip of the quote is set
    //   correctly.
    // - When swap transaction settings change, to update non-swap details.
    // - When approval-in-progress status changes, to update the approval
    //   status in the UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapTransactionSettings, isApprovalInProgress])

  return (
    <>
      <CorePage>
        <SharedSlideUpMenu
          isOpen={typeof finalQuote !== "undefined"}
          close={() => {
            dispatch(clearSwapQuote())
          }}
          size="large"
        >
          {typeof sellAsset !== "undefined" &&
          typeof buyAsset !== "undefined" &&
          typeof finalQuote !== "undefined" ? (
            <SwapQuote
              sellAsset={sellAsset}
              buyAsset={buyAsset}
              finalQuote={finalQuote}
              swapTransactionSettings={swapTransactionSettings}
            />
          ) : (
            <></>
          )}
        </SharedSlideUpMenu>
        <div className="standard_width">
          <SharedActivityHeader label="Swap Assets" activity="swap" />
          <div className="form">
            <div className="form_input">
              <SharedAssetInput
                amount={sellAmount}
                assetsAndAmounts={sellAssetAmounts}
                selectedAsset={sellAsset}
                disableDropdown={typeof locationAsset !== "undefined"}
                isDisabled={sellAmountLoading}
                onAssetSelect={updateSellAsset}
                onAmountChange={(newAmount, error) => {
                  setSellAmount(newAmount)
                  if (typeof error === "undefined") {
                    updateSwapData("sell", newAmount)
                  }
                }}
                label="Swap from:"
              />
            </div>
            <button className="icon_change" type="button" onClick={flipSwap}>
              Switch Assets
            </button>
            <div className="form_input">
              <SharedAssetInput
                amount={buyAmount}
                // FIXME Merge master asset list with account balances.
                assetsAndAmounts={buyAssets.map((asset) => ({ asset }))}
                selectedAsset={buyAsset}
                isDisabled={buyAmountLoading}
                showMaxButton={false}
                onAssetSelect={updateBuyAsset}
                onAmountChange={(newAmount, error) => {
                  setBuyAmount(buyAmount)
                  if (typeof error === "undefined") {
                    updateSwapData("buy", newAmount)
                  }
                }}
                label="Swap to:"
              />
            </div>
            <div className="settings_wrap">
              <SwapTransactionSettingsChooser
                swapTransactionSettings={swapTransactionSettings}
                onSwapTransactionSettingsSave={setSwapTransactionSettings}
              />
            </div>
            <div className="footer standard_width_padded">
              {
                // Would welcome an alternative here---this is pretty gnarly.
                // eslint-disable-next-line no-nested-ternary
                needsApproval ? (
                  isApprovalInProgress ? (
                    <SharedButton type="primary" size="large" isDisabled>
                      Waiting for approval transaction...
                    </SharedButton>
                  ) : (
                    <SharedButton
                      type="primary"
                      size="large"
                      isDisabled={
                        typeof latestQuoteRequest.current === "undefined" ||
                        sellAmountLoading ||
                        buyAmountLoading
                      }
                      onClick={approveAsset}
                      showLoadingOnClick={!confirmationMenu}
                    >
                      Approve asset
                    </SharedButton>
                  )
                ) : (
                  <SharedButton
                    type="primary"
                    size="large"
                    isDisabled={
                      typeof latestQuoteRequest.current === "undefined" ||
                      sellAmountLoading ||
                      buyAmountLoading
                    }
                    onClick={getFinalQuote}
                    showLoadingOnClick={!confirmationMenu}
                  >
                    Get final quote
                  </SharedButton>
                )
              }
            </div>
          </div>
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
            display: block;
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

            font-size: 0;
          }
          .settings_wrap {
            margin-top: 16px;
          }
        `}
      </style>
    </>
  )
}
