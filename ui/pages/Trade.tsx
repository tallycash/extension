import { Link } from "react-router-dom"
import { OffChainAsset } from "@tallyho/tally-background/assets"
import {
  offChainProviders,
  Wealthsimple,
} from "@tallyho/tally-background/constants/off-chain"
// import { selectCurrentAccountBalances } from "@tallyho/tally-background/redux-slices/selectors"
import React, { useCallback, useEffect, useState } from "react"
import transformOffChainAsset from "../services/utils"
import { useBackgroundSelector } from "../hooks"
import { OffChainService } from "../services/OffChainService"
import CorePage from "../components/Core/CorePage"
import SharedActivityHeader from "../components/Shared/SharedActivityHeader"
import SharedAssetInput from "../components/Shared/SharedAssetInput"
import SharedButton from "../components/Shared/SharedButton"

// eslint-disable-next-line import/prefer-default-export
export const Trade = () => {
  const [rawOffChainAssets, setRawOffChainAssets] = useState<OffChainAsset[]>(
    []
  )
  const [sellAsset, setSellAsset] = useState()
  const [buyAsset, setBuyAsset] = useState()
  const [sellAmount, setSellAmount] = useState("")
  const [buyAmount, setBuyAmount] = useState("")
  const [txHashUrl, setTxHashUrl] = useState("")

  // const accountBalances = useBackgroundSelector(selectCurrentAccountBalances)
  // const assetAmounts = accountBalances?.assetAmounts

  const providerName =
    localStorage.getItem("offChainProvider") || Wealthsimple.name

  const offChainProvider =
    offChainProviders.find((provider) => provider.name === providerName) ||
    Wealthsimple

  const offChainAssetAmounts = rawOffChainAssets.map((asset) =>
    transformOffChainAsset(asset, providerName)
  )

  const ownedSellAssetAmounts = offChainAssetAmounts

  const knownAssets = useBackgroundSelector((state) => state.assets)

  // TODO: filter out sell asset
  const buyAssets = knownAssets

  // TODO: filter out buy asset
  const sellAssetAmounts = ownedSellAssetAmounts

  useEffect(() => {
    const loadOffChainAssets = async () => {
      const response = await OffChainService.assets({
        provider: offChainProvider,
        userId: "foobar",
      })
      setRawOffChainAssets(response.assets)
    }
    loadOffChainAssets()
  }, [offChainProvider])

  const flipSwap = useCallback(() => {
    setSellAsset(buyAsset)
    setBuyAsset(sellAsset)

    setSellAmount(buyAmount)
  }, [buyAmount, buyAsset, sellAsset])

  const updateSellAsset = useCallback((asset) => {
    setSellAsset(asset)
  }, [])

  const updateBuyAsset = useCallback(
    (asset) => {
      setBuyAsset(asset)
      // temporary measure - mock CAD to MATIC
      if (sellAsset && sellAmount) {
        setBuyAmount((Number(sellAmount) / 1.15).toString())
      }
    },
    [sellAsset, sellAmount]
  )

  const confirmTrade = useCallback(async () => {
    const response = await OffChainService.transfer({
      provider: offChainProvider,
      transferRequest: {
        accountId: "123456",
        sourceCurrencySymbol: "CAD",
        destinationCurrencySymbol: "MATIC",
        // todo remove having both sourceAmount and destinationAmount redundant having both, just for demo purposes
        sourceAmount: sellAmount,
        destinationAmount: buyAmount,
        destinationAddress: "0x75bdb9da62acf5db996d36fb2322382aceffd9dd"
      }
    });

    console.log({response});

    setTxHashUrl(`https://polygonscan.com/tx/${response.transactionHash}`)
  }, [offChainProvider, buyAmount])

  return (
    <>
      <CorePage>
        <div className="standard_width swap_wrap">
          <div className="header">
            <SharedActivityHeader label="Trade Assets" activity="swap" />
          </div>

          <div className="form">
            <div className="form_input">
              <SharedAssetInput
                amount={sellAmount}
                assetsAndAmounts={sellAssetAmounts}
                selectedAsset={sellAsset}
                isDisabled={false}
                onAssetSelect={updateSellAsset}
                onAmountChange={(newAmount) => {
                  setSellAmount(newAmount)
                  // Temporary measure - mock buy amount
                  if (sellAsset && buyAsset)
                    setBuyAmount((Number(newAmount) * 1.5).toString())
                }}
                label="Source currency"
              />
            </div>
            <button className="icon_change" type="button" onClick={flipSwap}>
              Switch Assets
            </button>
            <div className="form_input">
              <SharedAssetInput
                amount={buyAmount}
                selectedAsset={buyAsset}
                assetsAndAmounts={buyAssets.map((asset) => ({ asset }))}
                isDisabled={false}
                showMaxButton={false}
                onAssetSelect={updateBuyAsset}
                onAmountChange={(newAmount) => {
                  setBuyAmount(newAmount)
                }}
                label="Destination token"
              />
            </div>
            <div className="footer standard_width_padded">
              <SharedButton
                type="primary"
                size="large"
                isDisabled={!sellAsset || !sellAmount || !buyAsset}
                onClick={confirmTrade}
              >
                Trade
              </SharedButton>
            </div>
          </div>

          {txHashUrl && (
            <a
              className="txhash_link"
              href={txHashUrl}
              target="_blank"
              rel="noreferrer"
            >
              View transaction on Polygonscan
            </a>
          )}
        </div>
      </CorePage>
      <style jsx>
        {`
          .swap_wrap {
            margin-top: -9px;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .network_fee_group {
            display: flex;
            margin-bottom: 29px;
          }
          .label {
            color: var(--green-40);
            font-size: 16px;
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
            z-index: 1;
            font-size: 0;
          }
          .settings_wrap {
            margin-top: 16px;
          }
          .txhash_link {
            color: var(--trophy-gold);
          }
        `}
      </style>
    </>
  )
}
