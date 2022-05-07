import { createSlice } from "@reduxjs/toolkit"
import { createBackgroundAsyncThunk } from "./utils"
import { AccountBalance, AddressOnNetwork, NameOnNetwork } from "../accounts"
import { Network } from "../networks"
import { AnyAsset, AnyAssetAmount, SmartContractFungibleAsset } from "../assets"
import {
  AssetMainCurrencyAmount,
  AssetDecimalAmount,
} from "./utils/asset-utils"
import { DomainName, HexString, URI } from "../types"
import { normalizeEVMAddress } from "../lib/utils"

/**
 * The set of available UI account types. These may or may not map 1-to-1 to
 * internal account types, depending on how the UI chooses to display data.
 */
export const enum AccountType {
  ReadOnly = "read-only",
  Imported = "imported",
  Ledger = "ledger",
  Internal = "internal",
}

const availableDefaultNames = [
  "Phoenix",
  "Matilda",
  "Sirius",
  "Topa",
  "Atos",
  "Sport",
  "Lola",
  "Foz",
]

type AccountData = {
  address: HexString
  network: Network
  balances: {
    [assetSymbol: string]: AccountBalance
  }
  ens: {
    name?: DomainName
    avatarURL?: URI
  }
  defaultName: string
  defaultAvatar: string
}

export type AccountState = {
  account?: AddressOnNetwork
  accountLoading?: string
  hasAccountError?: boolean
  // TODO Adapt to use AccountNetwork, probably via a Map and custom serialization/deserialization.
  accountsData: { [address: string]: AccountData | "loading" }
  combinedData: CombinedAccountData
}

export type CombinedAccountData = {
  totalMainCurrencyValue?: string
  assets: AnyAssetAmount[]
}

// Utility type, wrapped in CompleteAssetAmount<T>.
type InternalCompleteAssetAmount<
  E extends AnyAsset = AnyAsset,
  T extends AnyAssetAmount<E> = AnyAssetAmount<E>
> = T & AssetMainCurrencyAmount & AssetDecimalAmount

/**
 * An asset amount including localized and numeric main currency and decimal
 * equivalents, where applicable.
 */
export type CompleteAssetAmount<T extends AnyAsset = AnyAsset> =
  InternalCompleteAssetAmount<T, AnyAssetAmount<T>>

export type CompleteSmartContractFungibleAssetAmount =
  CompleteAssetAmount<SmartContractFungibleAsset>

export const initialState = {
  accountsData: {},
  combinedData: {
    totalMainCurrencyValue: "",
    assets: [],
  },
} as AccountState

function newAccountData(
  address: HexString,
  network: Network,
  existingAccountsCount: number
): AccountData {
  const defaultNameIndex =
    // Skip potentially-used names at the beginning of the array if relevant,
    // see below.
    (existingAccountsCount % availableDefaultNames.length) +
    Number(
      // Treat the address as a number and mod it to get an index into
      // default names.
      BigInt(address) %
        BigInt(
          availableDefaultNames.length -
            (existingAccountsCount % availableDefaultNames.length)
        )
    )
  const defaultAccountName = availableDefaultNames[defaultNameIndex]

  // Move used default names to the start so they can be skipped above.
  availableDefaultNames.splice(defaultNameIndex, 1)
  availableDefaultNames.unshift(defaultAccountName)

  const defaultAccountAvatar = `./images/avatars/${defaultAccountName.toLowerCase()}@2x.png`

  return {
    address,
    network,
    balances: {},
    ens: {},
    defaultName: defaultAccountName,
    defaultAvatar: defaultAccountAvatar,
  }
}

function getOrCreateAccountData(
  data: AccountData | "loading",
  account: HexString,
  network: Network,
  existingAccountsCount: number
): AccountData {
  if (data === "loading" || !data) {
    return newAccountData(account, network, existingAccountsCount)
  }
  return data
}

// TODO Much of the combinedData bits should probably be done in a Reselect
// TODO selector.
const accountSlice = createSlice({
  name: "account",
  initialState,
  reducers: {
    loadAccount: (state, { payload: accountToLoad }: { payload: string }) => {
      const accountKey = normalizeEVMAddress(accountToLoad)
      return state.accountsData[accountKey]
        ? state // If the account data already exists, the account is already loaded.
        : {
            ...state,
            accountsData: { ...state.accountsData, [accountKey]: "loading" },
          }
    },
    deleteAccount: (
      state,
      { payload: accountToRemove }: { payload: string }
    ) => {
      const keyToRemove = normalizeEVMAddress(accountToRemove)

      if (!state.accountsData[normalizeEVMAddress(keyToRemove)]) {
        return state
      }
      // Immutably remove the account passed in
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { [keyToRemove]: _, ...withoutAccountToRemove } = state.accountsData
      return {
        ...state,
        accountsData: withoutAccountToRemove,
      }
    },
    updateAccountBalance: (
      immerState,
      { payload: accountsWithBalances }: { payload: AccountBalance[] }
    ) => {
      accountsWithBalances.forEach((updatedAccountBalance) => {
        const {
          address: updatedAccount,
          assetAmount: {
            asset: { symbol: updatedAssetSymbol },
          },
        } = updatedAccountBalance

        const updatedAccountKey = normalizeEVMAddress(updatedAccount)

        const existingAccountData = immerState.accountsData[updatedAccountKey]
        if (existingAccountData) {
          if (existingAccountData !== "loading") {
            existingAccountData.balances[updatedAssetSymbol] =
              updatedAccountBalance
          } else {
            immerState.accountsData[updatedAccountKey] = {
              ...newAccountData(
                updatedAccountKey,
                updatedAccountBalance.network,
                Object.keys(immerState.accountsData).filter(
                  (key) => key !== updatedAccountKey
                ).length
              ),
              balances: {
                [updatedAssetSymbol]: updatedAccountBalance,
              },
            }
          }
        }
      })

      // A key assumption here is that the balances of two accounts in
      // accountsData are mutually exclusive; that is, that there are no two
      // accounts in accountsData all or part of whose balances are shared with
      // each other.
      const combinedAccountBalances = Object.values(immerState.accountsData)
        .flatMap((ad) =>
          ad === "loading"
            ? []
            : Object.values(ad.balances).map((ab) => ab.assetAmount)
        )
        .filter((b) => b)

      immerState.combinedData.assets = Object.values(
        combinedAccountBalances.reduce<{
          [symbol: string]: AnyAssetAmount
        }>((acc, combinedAssetAmount) => {
          const assetSymbol = combinedAssetAmount.asset.symbol
          acc[assetSymbol] = {
            ...combinedAssetAmount,
            amount:
              (acc[assetSymbol]?.amount || 0n) + combinedAssetAmount.amount,
          }
          return acc
        }, {})
      )
    },
    updateAccountName: (
      immerState,
      {
        payload: addressNetworkName,
      }: { payload: AddressOnNetwork & { name: DomainName } }
    ) => {
      // TODO Refactor when accounts are also keyed per network.
      const accountKey = normalizeEVMAddress(addressNetworkName.address)

      // No entry means this ENS name isn't being tracked here.
      if (immerState.accountsData[accountKey] === undefined) {
        return
      }

      const baseAccountData = getOrCreateAccountData(
        immerState.accountsData[accountKey],
        accountKey,
        addressNetworkName.network,
        Object.keys(immerState.accountsData).filter((key) => key !== accountKey)
          .length
      )
      immerState.accountsData[accountKey] = {
        ...baseAccountData,
        ens: { ...baseAccountData.ens, name: addressNetworkName.name },
      }
    },
    updateENSAvatar: (
      immerState,
      {
        payload: addressNetworkAvatar,
      }: { payload: AddressOnNetwork & { avatar: URI } }
    ) => {
      // TODO Refactor when accounts are also keyed per network.
      const accountKey = normalizeEVMAddress(addressNetworkAvatar.address)

      // No entry means this ENS name isn't being tracked here.
      if (immerState.accountsData[accountKey] === undefined) {
        return
      }

      const baseAccountData = getOrCreateAccountData(
        immerState.accountsData[accountKey],
        accountKey,
        addressNetworkAvatar.network,
        Object.keys(immerState.accountsData).filter((key) => key !== accountKey)
          .length
      )
      immerState.accountsData[accountKey] = {
        ...baseAccountData,
        ens: { ...baseAccountData.ens, avatarURL: addressNetworkAvatar.avatar },
      }
    },
  },
})

export const {
  loadAccount,
  updateAccountBalance,
  updateAccountName,
  updateENSAvatar,
} = accountSlice.actions

export default accountSlice.reducer

/**
 * Async thunk whose dispatch promise will return a resolved name or undefined
 * if the name cannot be resolved.
 */
export const resolveNameOnNetwork = createBackgroundAsyncThunk(
  "account/resolveNameOnNetwork",
  async (nameOnNetwork: NameOnNetwork, { extra: { main } }) => {
    return main.resolveNameOnNetwork(nameOnNetwork)
  }
)

/**
 * Async thunk whose dispatch promise will return when the account has been
 * added.
 *
 * Actual account data will flow into the redux store through other channels;
 * the promise returned from this action's dispatch will be fulfilled by a void
 * value.
 */
export const addAddressNetwork = createBackgroundAsyncThunk(
  "account/addAccount",
  async (addressNetwork: AddressOnNetwork, { dispatch, extra: { main } }) => {
    const normalizedAddressNetwork = {
      address: addressNetwork.address.toLowerCase(),
      network: addressNetwork.network,
    }

    dispatch(loadAccount(normalizedAddressNetwork.address))
    await main.addAccount(normalizedAddressNetwork)
  }
)

export const addOrEditAddressName = createBackgroundAsyncThunk(
  "account/addOrEditAddressName",
  async (
    payload: { name: string; address: HexString },
    { extra: { main } }
  ) => {
    await main.addOrEditAddressName(payload)
  }
)

export const removeAccount = createBackgroundAsyncThunk(
  "account/removeAccount",
  async (address: HexString, { dispatch, extra: { main } }) => {
    dispatch(accountSlice.actions.deleteAccount(address))
    main.removeAccount(address, { type: "keyring", keyringID: null })
  }
)
