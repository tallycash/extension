import { createSelector } from "@reduxjs/toolkit"
import { selectHideDust } from "../ui"
import { RootState } from ".."
import { AccountType, CompleteAssetAmount } from "../accounts"
import { AssetsState, selectAssetPricePoint } from "../assets"
import {
  enrichAssetAmountWithDecimalValues,
  enrichAssetAmountWithMainCurrencyValues,
  formatCurrencyAmount,
  heuristicDesiredDecimalsForUnitPrice,
} from "../utils/asset-utils"
import {
  AnyAsset,
  AnyAssetAmount,
  assetAmountToDesiredDecimals,
  convertAssetAmountViaPricePoint,
} from "../../assets"
import {
  selectCurrentAccount,
  selectCurrentNetwork,
  selectMainCurrencySymbol,
} from "./uiSelectors"
import {
  normalizeEVMAddress,
  sameEVMAddress,
  truncateAddress,
} from "../../lib/utils"
import { selectAccountSignersByAddress } from "./signingSelectors"
import {
  selectKeyringsByAddresses,
  selectSourcesByAddress,
} from "./keyringsSelectors"
import { AddressOnNetwork } from "../../accounts"
import { EVMNetwork, sameNetwork } from "../../networks"
import { BASE_ASSETS_BY_SYMBOL } from "../../constants"
import { DOGGO } from "../../constants/assets"
import { HIDE_TOKEN_FEATURES } from "../../features"
import { AccountSigner, SignerType } from "../../services/signing"

// TODO What actual precision do we want here? Probably more than 2
// TODO decimals? Maybe it's configurable?
const desiredDecimals = 2
// TODO Make this a setting.
const userValueDustThreshold = 2

const computeCombinedAssetAmountsData = (
  assetAmounts: AnyAssetAmount<AnyAsset>[],
  assets: AssetsState,
  mainCurrencySymbol: string,
  currentNetwork: EVMNetwork,
  hideDust: boolean
): {
  combinedAssetAmounts: CompleteAssetAmount[]
  totalMainCurrencyAmount: number | undefined
} => {
  // Keep a tally of the total user value; undefined if no main currency data
  // is available.
  let totalMainCurrencyAmount: number | undefined

  // Derive account "assets"/assetAmount which include USD values using
  // data from the assets slice
  const combinedAssetAmounts = assetAmounts
    .map<CompleteAssetAmount>((assetAmount) => {
      const assetPricePoint = selectAssetPricePoint(
        assets,
        assetAmount.asset.symbol,
        mainCurrencySymbol
      )

      const mainCurrencyEnrichedAssetAmount =
        enrichAssetAmountWithMainCurrencyValues(
          assetAmount,
          assetPricePoint,
          desiredDecimals
        )

      const fullyEnrichedAssetAmount = enrichAssetAmountWithDecimalValues(
        mainCurrencyEnrichedAssetAmount,
        heuristicDesiredDecimalsForUnitPrice(
          desiredDecimals,
          mainCurrencyEnrichedAssetAmount.unitPrice
        )
      )

      if (typeof fullyEnrichedAssetAmount.mainCurrencyAmount !== "undefined") {
        totalMainCurrencyAmount ??= 0 // initialize if needed
        totalMainCurrencyAmount += fullyEnrichedAssetAmount.mainCurrencyAmount
      }

      return fullyEnrichedAssetAmount
    })
    .filter((assetAmount) => {
      const baseAsset = BASE_ASSETS_BY_SYMBOL[assetAmount.asset.symbol]
      const isForciblyDisplayed =
        (!HIDE_TOKEN_FEATURES && assetAmount.asset.symbol === DOGGO.symbol) ||
        (currentNetwork.baseAsset.name === baseAsset?.name &&
          currentNetwork.baseAsset.symbol === baseAsset?.symbol)
      const isNotDust =
        typeof assetAmount.mainCurrencyAmount === "undefined"
          ? true
          : assetAmount.mainCurrencyAmount > userValueDustThreshold
      const isPresent = assetAmount.decimalAmount > 0

      // Hide dust and missing amounts.
      return (
        isForciblyDisplayed || (hideDust ? isNotDust && isPresent : isPresent)
      )
    })
    .sort((asset1, asset2) => {
      // Always sort DOGGO above everything.
      if (asset1.asset.symbol === DOGGO.symbol) {
        return -1
      }
      if (asset2.asset.symbol === DOGGO.symbol) {
        return 1
      }

      const leftIsBaseAsset = asset1.asset.symbol in BASE_ASSETS_BY_SYMBOL
      const rightIsBaseAsset = asset2.asset.symbol in BASE_ASSETS_BY_SYMBOL

      // Always sort base assets above non-base assets.
      if (leftIsBaseAsset !== rightIsBaseAsset) {
        return leftIsBaseAsset ? -1 : 1
      }

      // If the assets are both base assets or neither is a base asset, compare
      // by main currency amount.
      if (
        asset1.mainCurrencyAmount !== undefined &&
        asset2.mainCurrencyAmount !== undefined
      ) {
        return asset2.mainCurrencyAmount - asset1.mainCurrencyAmount
      }

      if (asset1.mainCurrencyAmount === asset2.mainCurrencyAmount) {
        // If both assets are missing a main currency amount, compare symbols
        // lexicographically.
        return asset1.asset.symbol.localeCompare(asset2.asset.symbol)
      }

      // If only one asset has a main currency amount, it wins.
      return asset1.mainCurrencyAmount === undefined ? 1 : -1
    })

  return { combinedAssetAmounts, totalMainCurrencyAmount }
}

const getAccountState = (state: RootState) => state.account
const getCurrentAccountState = (state: RootState) => {
  const { address, network } = state.ui.selectedAccount
  return state.account.accountsData.evm[network.chainID]?.[
    normalizeEVMAddress(address)
  ]
}
export const getAssetsState = (state: RootState): AssetsState => state.assets

export const selectAccountAndTimestampedActivities = createSelector(
  getAccountState,
  getAssetsState,
  selectCurrentNetwork,
  selectHideDust,
  selectMainCurrencySymbol,
  (account, assets, currentNetwork, hideDust, mainCurrencySymbol) => {
    const { combinedAssetAmounts, totalMainCurrencyAmount } =
      computeCombinedAssetAmountsData(
        account.combinedData.assets,
        assets,
        mainCurrencySymbol,
        currentNetwork,
        hideDust
      )

    return {
      combinedData: {
        assets: combinedAssetAmounts,
        totalMainCurrencyValue: totalMainCurrencyAmount
          ? formatCurrencyAmount(
              mainCurrencySymbol,
              totalMainCurrencyAmount,
              desiredDecimals
            )
          : undefined,
      },
      accountData: account.accountsData,
    }
  }
)

export const selectMainCurrencyPricePoint = createSelector(
  getAssetsState,
  (state) => selectMainCurrencySymbol(state),
  (assets, mainCurrencySymbol) => {
    // TODO Support multi-network base assets.
    return selectAssetPricePoint(assets, "ETH", mainCurrencySymbol)
  }
)

export const selectCurrentAccountBalances = createSelector(
  getCurrentAccountState,
  getAssetsState,
  selectCurrentNetwork,
  selectHideDust,
  selectMainCurrencySymbol,
  (currentAccount, assets, currentNetwork, hideDust, mainCurrencySymbol) => {
    if (typeof currentAccount === "undefined" || currentAccount === "loading") {
      return undefined
    }

    const assetAmounts = Object.values(currentAccount.balances).map(
      (balance) => balance.assetAmount
    )

    const { combinedAssetAmounts, totalMainCurrencyAmount } =
      computeCombinedAssetAmountsData(
        assetAmounts,
        assets,
        mainCurrencySymbol,
        currentNetwork,
        hideDust
      )

    return {
      assetAmounts: combinedAssetAmounts,
      totalMainCurrencyValue: totalMainCurrencyAmount
        ? formatCurrencyAmount(
            mainCurrencySymbol,
            totalMainCurrencyAmount,
            desiredDecimals
          )
        : undefined,
    }
  }
)

export const selectCurrentAccountAssetBalance = createSelector(
  selectCurrentAccountBalances,
  (_: RootState, assetSymbol: string) => assetSymbol,
  (assetsBalances, assetSymbol) => {
    return assetsBalances?.assetAmounts.find(
      (asset) => asset.asset.symbol === assetSymbol
    )
  }
)

export type AccountTotal = AddressOnNetwork & {
  shortenedAddress: string
  accountType: AccountType
  // FIXME This is solely used for categorization.
  // FIXME Add `categoryFor(accountSigner): string` utility function to
  // FIXME generalize beyond keyrings.
  keyringId: string | null
  accountSigner: AccountSigner | null
  name?: string
  avatarURL?: string
  localizedTotalMainCurrencyAmount?: string
}

export type CategorizedAccountTotals = { [key in AccountType]?: AccountTotal[] }

const signerTypeToAccountType: Record<SignerType, AccountType> = {
  keyring: AccountType.Imported,
  ledger: AccountType.Ledger,
  "read-only": AccountType.ReadOnly,
}

const getAccountType = (
  address: string,
  signer: AccountSigner,
  addressSources: {
    [address: string]: "import" | "internal"
  }
): AccountType => {
  if (signer == null) {
    return AccountType.ReadOnly
  }
  if (signerTypeToAccountType[signer.type] === "ledger") {
    return AccountType.Ledger
  }
  if (addressSources[address] === "import") {
    return AccountType.Imported
  }
  return AccountType.Internal
}

export const selectCurrentNetworkAccountTotalsByCategory = createSelector(
  getAccountState,
  getAssetsState,
  selectCurrentNetwork,
  selectAccountSignersByAddress,
  selectKeyringsByAddresses,
  selectSourcesByAddress,
  selectMainCurrencySymbol,
  (
    accounts,
    assets,
    currentNetwork,
    accountSignersByAddress,
    keyringsByAddresses,
    sourcesByAddress,
    mainCurrencySymbol
  ): CategorizedAccountTotals => {
    return Object.entries(
      accounts.accountsData.evm[currentNetwork.chainID] ?? {}
    )
      .filter(([, accountData]) => typeof accountData !== "undefined")
      .map(([address, accountData]): AccountTotal => {
        const shortenedAddress = truncateAddress(address)

        const accountSigner = accountSignersByAddress[address] ?? null
        const keyringId = keyringsByAddresses[address]?.id

        const accountType = getAccountType(
          address,
          accountSigner,
          sourcesByAddress
        )

        if (accountData === "loading") {
          return {
            address,
            network: currentNetwork,
            shortenedAddress,
            accountType,
            keyringId,
            accountSigner,
          }
        }

        const totalMainCurrencyAmount = Object.values(accountData.balances)
          .map(({ assetAmount }) => {
            const assetPricePoint = selectAssetPricePoint(
              assets,
              assetAmount.asset.symbol,
              mainCurrencySymbol
            )

            if (typeof assetPricePoint === "undefined") {
              return 0
            }

            const convertedAmount = convertAssetAmountViaPricePoint(
              assetAmount,
              assetPricePoint
            )

            if (typeof convertedAmount === "undefined") {
              return 0
            }

            return assetAmountToDesiredDecimals(
              convertedAmount,
              desiredDecimals
            )
          })
          .reduce((total, assetBalance) => total + assetBalance, 0)

        return {
          address,
          network: currentNetwork,
          shortenedAddress,
          accountType,
          keyringId,
          accountSigner,
          name: accountData.ens.name ?? accountData.defaultName,
          avatarURL: accountData.ens.avatarURL ?? accountData.defaultAvatar,
          localizedTotalMainCurrencyAmount: formatCurrencyAmount(
            mainCurrencySymbol,
            totalMainCurrencyAmount,
            desiredDecimals
          ),
        }
      })
      .reduce<CategorizedAccountTotals>(
        (seenTotalsByType, accountTotal) => ({
          ...seenTotalsByType,
          [accountTotal.accountType]: [
            ...(seenTotalsByType[accountTotal.accountType] ?? []),
            accountTotal,
          ],
        }),
        {}
      )
  }
)

function findAccountTotal(
  categorizedAccountTotals: CategorizedAccountTotals,
  accountAddressOnNetwork: AddressOnNetwork
): AccountTotal | undefined {
  return Object.values(categorizedAccountTotals)
    .flat()
    .find(
      ({ address, network }) =>
        sameEVMAddress(address, accountAddressOnNetwork.address) &&
        sameNetwork(network, accountAddressOnNetwork.network)
    )
}

export const getAccountTotal = (
  state: RootState,
  accountAddressOnNetwork: AddressOnNetwork
): AccountTotal | undefined =>
  findAccountTotal(
    selectCurrentNetworkAccountTotalsByCategory(state),
    accountAddressOnNetwork
  )

export const selectCurrentAccountTotal = createSelector(
  selectCurrentNetworkAccountTotalsByCategory,
  selectCurrentAccount,
  (categorizedAccountTotals, currentAccount): AccountTotal | undefined =>
    findAccountTotal(categorizedAccountTotals, currentAccount)
)

export const getAddressCount = createSelector(
  (state: RootState) => state.account.accountsData,
  (accountsData) =>
    Object.values(accountsData.evm).flatMap((chainAddresses) =>
      Object.keys(chainAddresses)
    ).length
)
