import { createSlice, createSelector } from "@reduxjs/toolkit"
import { fetchJson } from "@ethersproject/web"

import { createBackgroundAsyncThunk } from "./utils"
import { isSmartContractFungibleAsset, Asset } from "../assets"
import { AssetsState } from "./assets"
import logger from "../lib/logger"
import { UIState } from "./ui"
import { BaseLimitOrder } from "../lib/keeper-dao"

export interface LimitAsset extends Asset {
  contractAddress?: string
  price?: string
}

export interface LimitState {
  sellAsset?: LimitAsset
  buyAsset?: LimitAsset
  sellAmount: string
  buyAmount: string
  tokens: Asset[]
  expiration: "1h" | "2h" | "1d" | "1w"
}

interface RookToken {
  address: string
  chainId: number
  name: string
  symbol: string
  decimals: number
  logoURI: string
}

interface RookTokenListResponse {
  result: {
    name: string
    timestamp: string
    version: {
      major: number
      minor: number
      patch: number
    }
    keywords: string[]
    tokens: RookToken[]
    logoURI: string
  }
  message: string
}

interface SwapToken {
  sellAsset?: Asset
  buyAsset?: Asset
}

interface SwapAmount {
  sellAmount?: string
  buyAmount?: string
}

interface ZrxToken {
  symbol: string
  name: string
  decimals: number
  address: string
}

interface ZrxPrice {
  symbol: string
  price: string
}

const getValidAssets = async (getState: () => unknown) => {
  const state = getState() as { assets: AssetsState }
  const assets = state.assets as Asset[]
  const apiData = await fetchJson(`https://api.0x.org/swap/v1/tokens`)

  const filteredAssets = assets
    .filter(isSmartContractFungibleAsset)
    .filter((asset) => {
      const matchingTokens = apiData.records.filter((zrxToken: ZrxToken) => {
        // Only allow tokens to be swapped if the data from 0x matches our asset information
        if (
          asset.symbol.toLowerCase() === zrxToken.symbol.toLowerCase() &&
          asset.contractAddress.toLowerCase() === zrxToken.address.toLowerCase()
        ) {
          return true
        }

        if (
          asset.symbol.toLowerCase() === zrxToken.symbol.toLowerCase() &&
          asset.contractAddress.toLowerCase() !== zrxToken.address.toLowerCase()
        ) {
          logger.warn(
            "Swap Token Discrepancy: Symbol matches but contract address doesn't",
            asset,
            zrxToken
          )
        }

        if (
          asset.contractAddress.toLowerCase() ===
            zrxToken.address.toLowerCase() &&
          asset.symbol.toLowerCase() !== zrxToken.symbol.toLowerCase()
        ) {
          logger.warn(
            "Swap Token Discrepancy: Contract address matches but symbol doesn't",
            asset,
            zrxToken
          )
        }

        return false
      })

      // TODO: What if multiple assets match?
      if (matchingTokens.length) {
        return matchingTokens[0]
      }

      return false
    })

  return filteredAssets
}

export const fetchLimitTokens = createBackgroundAsyncThunk(
  "limit/fetchLimitTokens",
  async (_, { getState }) => {
    const validAssets = await getValidAssets(getState)
    const rookTokens = (await fetchJson(
      `https://hidingbook.keeperdao.com/api/v1/tokenList`
    )) as RookTokenListResponse
    return validAssets.filter((asset) => {
      return rookTokens.result.tokens.find(
        (rookToken) => rookToken.address === asset.contractAddress
      )
    })
  }
)

export const fetchLimitPrices = createBackgroundAsyncThunk(
  "limit/fetchLimitPrices",
  async (token: Asset) => {
    const apiData = await fetchJson(
      `https://api.0x.org/swap/v1/prices?sellAsset=${token.symbol}&perPage=1000`
    )

    return apiData.records
  }
)

export const initialState: LimitState = {
  sellAsset: undefined,
  buyAsset: undefined,
  sellAmount: "",
  buyAmount: "",
  tokens: [],
  expiration: "1h",
}

const swapSlice = createSlice({
  name: "limit",
  initialState,
  reducers: {
    setLimitAmount: (
      immerState,
      { payload: amount }: { payload: SwapAmount }
    ) => {
      return { ...immerState, ...amount }
    },
    resetLimitState: (immerState) => {
      return {
        ...immerState,
        sellAsset: undefined,
        buyAsset: undefined,
        sellAmount: "",
        buyAmount: "",
        expiration: "1h",
      }
    },
    setLimitTrade: (immerState, { payload: token }: { payload: SwapToken }) => {
      return { ...immerState, ...token }
    },
    setExpiration: (
      immerState,
      { payload: expiration }: { payload: "1h" | "2h" | "1d" | "1w" }
    ) => {
      return { ...immerState, expiration }
    },
    swapBuyAndSellSides: (immerState) => {
      return {
        ...immerState,
        buyAmount: immerState.sellAmount,
        buyAsset: immerState.sellAsset,
        sellAmount: immerState.buyAmount,
        sellAsset: immerState.buyAsset,
      }
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(
        fetchLimitPrices.fulfilled,
        (immerState, { payload: assetPrices }: { payload: ZrxPrice[] }) => {
          const tokensWithPrices = immerState.tokens.map((asset) => {
            const matchingAsset = assetPrices.filter((price) => {
              if (asset.symbol.toLowerCase() === price.symbol.toLowerCase()) {
                return true
              }

              return false
            })

            if (matchingAsset.length) {
              return { ...asset, price: matchingAsset[0].price }
            }

            return { ...asset, price: 0 }
          })

          return { ...immerState, tokens: tokensWithPrices }
        }
      )
      .addCase(
        fetchLimitTokens.fulfilled,
        (immerState, { payload: tokens }: { payload: Asset[] }) => {
          return { ...immerState, tokens }
        }
      )
  },
})

export const selectCurrentLimitOrder = createSelector(
  (state: { limit: LimitState; ui: UIState; assets: AssetsState }) => {
    return { limit: state.limit, ui: state.ui, assets: state.assets }
  },
  ({ limit, ui }): BaseLimitOrder => {
    return {
      maker: ui.currentAccount.addressNetwork.address,
      makerAmount: BigInt(
        Math.round(
          Number(limit.sellAmount) * 10 ** (limit.sellAsset as any)?.decimals
        ) || 0
      ),
      takerAmount: BigInt(
        Math.round(
          Number(limit.buyAmount) * 10 ** (limit.buyAsset as any)?.decimals
        ) || 0
      ),
      makerToken: (limit.sellAsset as any)?.contractAddress,
      takerToken: (limit.buyAsset as any)?.contractAddress,
      expiry: limit.expiration,
    }
  }
)

export const {
  setLimitAmount,
  setLimitTrade,
  resetLimitState,
  setExpiration,
  swapBuyAndSellSides,
} = swapSlice.actions
export default swapSlice.reducer
