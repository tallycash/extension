import { createSelector, createSlice } from "@reduxjs/toolkit"
import Emittery from "emittery"
import {
  ExpectedSigningData,
  SignDataMessageType,
  SignDataRequest,
  SignTypedDataRequest,
} from "../utils/signing"
import { createBackgroundAsyncThunk } from "./utils"
import { EnrichedSignTypedDataRequest } from "../services/enrichment"
import { EIP712TypedData } from "../types"
import { AddressOnNetwork } from "../accounts"
import { AccountSigner } from "../services/signing"
import { EIP1559TransactionRequest } from "../networks"

export type SignOperationType =
  // FIXME Consider subtypes of SignOperation instead of SignOperation<T>.
  SignDataRequest | SignTypedDataRequest | EIP1559TransactionRequest

export type SignOperation<T extends SignOperationType> = {
  request: T
  accountSigner: AccountSigner
}

type Events = {
  requestSignTypedData: {
    typedData: EIP712TypedData
    account: AddressOnNetwork
    accountSigner: AccountSigner
  }
  requestSignData: {
    signingData: ExpectedSigningData
    messageType: SignDataMessageType
    rawSigningData: string
    account: AddressOnNetwork
    accountSigner: AccountSigner
  }
  signatureRejected: never
}

export const signingSliceEmitter = new Emittery<Events>()

type SigningState = {
  signedTypedData: string | undefined
  typedDataRequest: EnrichedSignTypedDataRequest | undefined

  signedData: string | undefined
  signDataRequest: SignDataRequest | undefined
}

export const initialState: SigningState = {
  typedDataRequest: undefined,
  signedTypedData: undefined,

  signedData: undefined,
  signDataRequest: undefined,
}

export const signTypedData = createBackgroundAsyncThunk(
  "signing/signTypedData",
  async (data: SignOperation<SignTypedDataRequest>) => {
    const {
      request: { account, typedData },
      accountSigner,
    } = data

    await signingSliceEmitter.emit("requestSignTypedData", {
      typedData,
      account,
      accountSigner,
    })
  }
)

export const signData = createBackgroundAsyncThunk(
  "signing/signData",
  async (data: SignOperation<SignDataRequest>) => {
    const {
      request: { account, signingData, rawSigningData, messageType },
      accountSigner,
    } = data
    await signingSliceEmitter.emit("requestSignData", {
      rawSigningData,
      signingData,
      account,
      messageType,
      accountSigner,
    })
  }
)

const signingSlice = createSlice({
  name: "signing",
  initialState,
  reducers: {
    signedTypedData: (state, { payload }: { payload: string }) => ({
      ...state,
      signedTypedData: payload,
      typedDataRequest: undefined,
    }),
    typedDataRequest: (
      state,
      { payload }: { payload: EnrichedSignTypedDataRequest }
    ) => ({
      ...state,
      typedDataRequest: payload,
    }),
    signDataRequest: (state, { payload }: { payload: SignDataRequest }) => {
      return {
        ...state,
        signDataRequest: payload,
      }
    },
    signedData: (state, { payload }: { payload: string }) => ({
      ...state,
      signedData: payload,
      signDataRequest: undefined,
    }),
    clearSigningState: (state) => ({
      ...state,
      typedDataRequest: undefined,
      signDataRequest: undefined,
    }),
  },
})

export const {
  signedTypedData,
  typedDataRequest,
  signedData,
  signDataRequest,
  clearSigningState,
} = signingSlice.actions

export default signingSlice.reducer

export const selectTypedData = createSelector(
  (state: { signing: SigningState }) => state.signing.typedDataRequest,
  (signTypes) => signTypes
)

export const selectSigningData = createSelector(
  (state: { signing: SigningState }) => state.signing.signDataRequest,
  (signTypes) => signTypes
)

export const rejectDataSignature = createBackgroundAsyncThunk(
  "signing/reject",
  async (_, { dispatch }) => {
    await signingSliceEmitter.emit("signatureRejected")
    // Provide a clean slate for future transactions.
    dispatch(signingSlice.actions.clearSigningState())
  }
)
