import { TokenList } from "@uniswap/token-lists"

import { normalizeEVMAddress } from "./utils"
import {
  FungibleAsset,
  isSmartContractFungibleAsset,
  SmartContractFungibleAsset,
  TokenListAndReference,
} from "../assets"
import { isValidUniswapTokenListResponse } from "./validate"
import { EVMNetwork } from "../networks"

export async function fetchAndValidateTokenList(
  url: string
): Promise<TokenListAndReference> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Error resolving token list at ${url}`)
  }
  const json = await response.json()

  if (!isValidUniswapTokenListResponse(json)) {
    throw new Error(`Invalid token list at ${url}`)
  }
  return {
    tokenList: json as TokenList,
    url,
  }
}

export async function fetchAndValidateTokenLists(
  urls: string[]
): Promise<TokenListAndReference[]> {
  return (await Promise.allSettled(urls.map(fetchAndValidateTokenList)))
    .filter((l) => l.status === "fulfilled")
    .map((l) => (l as PromiseFulfilledResult<TokenListAndReference>).value)
}

function tokenListToFungibleAssetsForNetwork(
  network: EVMNetwork,
  { url: tokenListURL, tokenList }: TokenListAndReference
): SmartContractFungibleAsset[] {
  const networkChainID = Number(network.chainID)
  const tokenListCitation = {
    url: tokenListURL,
    name: tokenList.name,
    logoURL: tokenList.logoURI,
  }

  return tokenList.tokens
    .filter(({ chainId }) => chainId === networkChainID)
    .map((tokenMetadata) => {
      return {
        metadata: {
          logoURL: tokenMetadata.logoURI,
          tokenLists: [tokenListCitation],
        },
        name: tokenMetadata.name,
        symbol: tokenMetadata.symbol,
        decimals: tokenMetadata.decimals,
        homeNetwork: network,
        contractAddress: normalizeEVMAddress(tokenMetadata.address),
      }
    })
}

/**
 * Merges the given asset lists into a single deduplicated array.
 */
export function mergeAssets<T extends FungibleAsset>(
  ...assetLists: T[][]
): T[] {
  function tokenReducer(
    seenAssetsBy: {
      contractAddressAndNetwork: {
        [contractAddressAndNetwork: string]: SmartContractFungibleAsset
      }
      symbol: { [symbol: string]: T }
    },
    asset: T
  ) {
    const updatedAssetsBy = {
      contractAddressAndNetwork: { ...seenAssetsBy.contractAddressAndNetwork },
      symbol: { ...seenAssetsBy.symbol },
    }

    if (isSmartContractFungibleAsset(asset)) {
      const normalizedContractAddressAndNetwork =
        `${normalizeEVMAddress(asset.contractAddress)}-${
          asset.homeNetwork.chainID
        }` ?? asset.homeNetwork.name
      const existingAsset =
        updatedAssetsBy.contractAddressAndNetwork[
          normalizedContractAddressAndNetwork
        ]

      if (typeof existingAsset !== "undefined") {
        updatedAssetsBy.contractAddressAndNetwork[
          normalizedContractAddressAndNetwork
        ] = {
          ...existingAsset,
          metadata: {
            ...existingAsset.metadata,
            ...asset.metadata,
            tokenLists:
              existingAsset.metadata?.tokenLists?.concat(
                asset.metadata?.tokenLists ?? []
              ) ?? [],
          },
        }
      } else {
        updatedAssetsBy.contractAddressAndNetwork[
          normalizedContractAddressAndNetwork
        ] = asset
      }
    } else if (asset.symbol in updatedAssetsBy.symbol) {
      const original = updatedAssetsBy.symbol[asset.symbol]
      updatedAssetsBy.symbol[asset.symbol] = {
        ...original,
        metadata: {
          ...original.metadata,
          ...asset.metadata,
          tokenLists:
            original.metadata?.tokenLists?.concat(
              asset.metadata?.tokenLists ?? []
            ) ?? [],
        },
      }
    } else {
      updatedAssetsBy.symbol[asset.symbol] = asset
    }

    return updatedAssetsBy
  }

  const mergedAssetsBy = assetLists.flat().reduce(tokenReducer, {
    contractAddressAndNetwork: {},
    symbol: {},
  })
  const mergedAssets = Object.values(mergedAssetsBy.symbol).concat(
    // Because the inputs to the function conform to T[], if T is not a subtype
    // of SmartContractFungibleAsset, this will be an empty array. As such, we
    // can safely do this cast.
    Object.values(mergedAssetsBy.contractAddressAndNetwork) as unknown as T[]
  )

  return mergedAssets.sort((a, b) =>
    (a.metadata?.tokenLists?.length || 0) >
    (b.metadata?.tokenLists?.length || 0)
      ? 1
      : -1
  )
}

/*
 * Return all tokens in the provided lists, de-duplicated and structured in our
 * types for easy manipulation, and sorted by the number of lists each appears
 * in.
 */
export function networkAssetsFromLists(
  network: EVMNetwork,
  tokenLists: TokenListAndReference[]
): SmartContractFungibleAsset[] {
  const fungibleAssets = tokenLists.map((tokenListAndReference) =>
    tokenListToFungibleAssetsForNetwork(network, tokenListAndReference)
  )

  return mergeAssets(...fungibleAssets)
}
