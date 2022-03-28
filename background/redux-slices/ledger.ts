import Transport from "@ledgerhq/hw-transport"
import { createSlice } from "@reduxjs/toolkit"
import { ETH } from "../constants"
import { createBackgroundAsyncThunk } from "./utils"
import { enrichAssetAmountWithDecimalValues } from "./utils/asset-utils"

export interface LedgerAccountState {
  path: string
  address: string | null
  fetchingAddress: boolean
  balance: string | null
  fetchingBalance: boolean
}

export type LedgerConnectionStatus = "available" | "busy" | "disconnected"

export interface LedgerDeviceState {
  /** First address derived from standard ETH derivation path, used as ID */
  id: string
  /** Accounts by path */
  accounts: Record<string, LedgerAccountState>
  status: LedgerConnectionStatus // FIXME: this should not be persisted
  isArbitraryDataSigningEnabled?: boolean
}

export type LedgerState = {
  currentDeviceID: string | null
  /** Devices by ID */
  devices: Record<string, LedgerDeviceState>
  usbDeviceCount: number
}

export type Events = {
  fetchAddress: {
    path: string
    resolve: (address: string) => void
    reject: (error: Error) => void
  }
  fetchBalance: {
    address: string
    resolve: (balance: string) => void
    reject: (error: Error) => void
  }
  importLedgerAccounts: Array<{
    path: string
    address: string
  }>
  connectLedger: {
    resolve: (address: string) => void
    reject: (error: Error) => void
  }
}

export const initialState: LedgerState = {
  currentDeviceID: null,
  devices: {},
  usbDeviceCount: 0,
}

const ledgerSlice = createSlice({
  name: "ledger",
  initialState,
  reducers: {
    resetLedgerState: (immerState) => {
      immerState.currentDeviceID = null
      Object.values(immerState.devices).forEach((device) => {
        device.status = "disconnected" // eslint-disable-line no-param-reassign
        Object.values(device.accounts).forEach((account) => {
          account.fetchingAddress = false // eslint-disable-line no-param-reassign
          account.fetchingBalance = false // eslint-disable-line no-param-reassign
        })
      })
    },
    addLedgerDevice: (
      immerState,
      { payload: deviceID }: { payload: string }
    ) => {
      /* FIXME: devices/accounts are kept in the state even if not tracked  */
      if (deviceID in immerState.devices) return
      immerState.devices[deviceID] = {
        id: deviceID,
        accounts: {},
        status: "available",
        isArbitraryDataSigningEnabled: false,
      }
    },
    setCurrentDevice: (
      immerState,
      { payload: deviceID }: { payload: string }
    ) => {
      if (!(deviceID in immerState.devices)) return
      immerState.currentDeviceID = deviceID
    },
    setDeviceConnectionStatus: (
      immerState,
      {
        payload: { deviceID, status, isArbitraryDataSigningEnabled },
      }: {
        payload: {
          deviceID: string
          status: LedgerConnectionStatus
          isArbitraryDataSigningEnabled: boolean
        }
      }
    ) => {
      if (
        immerState.currentDeviceID === deviceID &&
        status === "disconnected"
      ) {
        immerState.currentDeviceID = null
      }
      const device = immerState.devices[deviceID]
      if (!device) return
      device.status = status

      device.isArbitraryDataSigningEnabled = isArbitraryDataSigningEnabled
    },
    addLedgerAccount: (
      immerState,
      {
        payload: { deviceID, path },
      }: { payload: { deviceID: string; path: string } }
    ) => {
      const device = immerState.devices[deviceID]
      if (!device) return
      if (path in device.accounts) return
      device.accounts[path] = {
        path,
        address: null,
        fetchingAddress: false,
        balance: null,
        fetchingBalance: false,
      }
    },
    setFetchingAddress: (
      immerState,
      {
        payload: { deviceID, path },
      }: {
        payload: { deviceID: string; path: string }
      }
    ) => {
      const device = immerState.devices[deviceID]
      if (!device) return
      const account = device.accounts[path]
      if (!account) return
      account.fetchingAddress = true
    },
    setFetchingBalance: (
      immerState,
      {
        payload: { deviceID, path },
      }: { payload: { deviceID: string; path: string } }
    ) => {
      const device = immerState.devices[deviceID]
      if (!device) return
      const account = device.accounts[path]
      if (!account) return
      account.fetchingBalance = true
    },
    resolveAddress: (
      immerState,
      {
        payload: { deviceID, path, address },
      }: {
        payload: { deviceID: string; path: string; address: string }
      }
    ) => {
      const device = immerState.devices[deviceID]
      if (!device) return
      const account = device.accounts[path]
      if (!account) return
      if (account.address === null) account.address = address
    },
    resolveBalance: (
      immerState,
      {
        payload: { deviceID, path, balance },
      }: { payload: { deviceID: string; path: string; balance: string } }
    ) => {
      const device = immerState.devices[deviceID]
      if (!device) return
      const account = device.accounts[path]
      if (!account) return
      if (account.balance === null) account.balance = balance
    },
    setUsbDeviceCount: (
      immerState,
      { payload: { usbDeviceCount } }: { payload: { usbDeviceCount: number } }
    ) => {
      immerState.usbDeviceCount = usbDeviceCount
    },
  },
})

export const {
  resetLedgerState,
  setDeviceConnectionStatus,
  addLedgerAccount,
  setUsbDeviceCount,
} = ledgerSlice.actions

export default ledgerSlice.reducer

export const connectLedger = createBackgroundAsyncThunk(
  "ledger/connectLedger",
  async (unused, { dispatch, extra: { main } }) => {
    const deviceID = await main.connectLedger()
    // console.log("deviceID")
    // console.log(deviceID)
    if (!deviceID) {
      return
    }

    dispatch(ledgerSlice.actions.addLedgerDevice(deviceID))
    dispatch(ledgerSlice.actions.setCurrentDevice(deviceID))
  }
)

export const fetchAddress = createBackgroundAsyncThunk(
  "ledger/fetchAddress",
  async (
    { deviceID, path }: { deviceID: string; path: string },
    { dispatch, extra: { main } }
  ) => {
    try {
      dispatch(ledgerSlice.actions.setFetchingAddress({ deviceID, path }))
      const address = await main.deriveLedgerAddress(path) // FIXME: deviceID is ignored
      dispatch(ledgerSlice.actions.resolveAddress({ deviceID, path, address }))
    } catch (err) {
      dispatch(ledgerSlice.actions.resetLedgerState())
    }
  }
)

export const fetchBalance = createBackgroundAsyncThunk(
  "ledger/fetchBalance",
  async (
    {
      deviceID,
      path,
      address,
    }: { deviceID: string; path: string; address: string },
    { dispatch, extra: { main } }
  ) => {
    dispatch(ledgerSlice.actions.setFetchingBalance({ deviceID, path }))
    const amount = await main.getAccountEthBalanceUncached(address)
    const decimalDigits = 3
    const balance = enrichAssetAmountWithDecimalValues(
      { amount, asset: ETH },
      decimalDigits
    ).localizedDecimalAmount
    dispatch(ledgerSlice.actions.resolveBalance({ deviceID, path, balance }))
  }
)

export const importLedgerAccounts = createBackgroundAsyncThunk(
  "ledger/importLedgerAccounts",
  async (
    {
      accounts,
    }: {
      accounts: Array<{ path: string; address: string }>
    },
    { extra: { main } }
  ) => {
    await main.importLedgerAccounts(accounts)
  }
)
