import { createSlice, createSelector } from "@reduxjs/toolkit"
import Emittery from "emittery"
import {
  EXPRESS,
  INSTANT,
  MAX_FEE_MULTIPLIER,
  REGULAR,
} from "../constants/networkFees"
import logger from "../lib/logger"

import {
  BlockEstimate,
  BlockPrices,
  EIP1559TransactionRequest,
  SignedEVMTransaction,
} from "../networks"
import { createBackgroundAsyncThunk } from "./utils"

import { BaseLimitOrder } from "../lib/keeper-dao"

const enum TransactionConstructionStatus {
  Idle = "idle",
  Pending = "pending",
  Loaded = "loaded",
  Signed = "signed",
}

export enum NetworkFeeTypeChosen {
  Regular = "regular",
  Express = "express",
  Instant = "instant",
}
export type TransactionConstruction = {
  status: TransactionConstructionStatus
  transactionRequest?: EIP1559TransactionRequest
  signedTransaction?: SignedEVMTransaction
  broadcastOnSign?: boolean
  transactionLikelyFails?: boolean
  estimatedFeesPerGas: EstimatedFeesPerGas | undefined
  lastGasEstimatesRefreshed: number
  feeTypeSelected: NetworkFeeTypeChosen
}

export type EstimatedFeesPerGas = {
  baseFeePerGas: bigint
  instant: BlockEstimate | undefined
  express: BlockEstimate | undefined
  regular: BlockEstimate | undefined
}

export const initialState: TransactionConstruction = {
  status: TransactionConstructionStatus.Idle,
  feeTypeSelected: NetworkFeeTypeChosen.Regular,
  estimatedFeesPerGas: undefined,
  lastGasEstimatesRefreshed: Date.now(),
}

export type Events = {
  updateOptions: Partial<EIP1559TransactionRequest> & {
    from: string
  }
  requestSignature: EIP1559TransactionRequest
  signatureRejected: never
  broadcastSignedTransaction: SignedEVMTransaction
  signAndSendLimitOrder: BaseLimitOrder
}

export const emitter = new Emittery<Events>()

// Async thunk to pass transaction options from the store to the background via an event
export const updateTransactionOptions = createBackgroundAsyncThunk(
  "transaction-construction/update-options",
  async (options: Partial<EIP1559TransactionRequest> & { from: string }) => {
    await emitter.emit("updateOptions", options)
  }
)

export const signTransaction = createBackgroundAsyncThunk(
  "transaction-construction/sign",
  async (transaction: EIP1559TransactionRequest) => {
    await emitter.emit("requestSignature", transaction)
  }
)

export const broadcastSignedTransaction = createBackgroundAsyncThunk(
  "transaction-construction/broadcast",
  async (transaction: SignedEVMTransaction) => {
    await emitter.emit("broadcastSignedTransaction", transaction)
  }
)

export const signAndSendLimitOrder = createBackgroundAsyncThunk(
  "transaction-construction/signLimitOrder",
  async (transaction: BaseLimitOrder) => {
    console.log("requesting limit order")
    logger.log("Requesting Limit Order")
    await emitter.emit("signAndSendLimitOrder", transaction)
  }
)

const transactionSlice = createSlice({
  name: "transaction-construction",
  initialState,
  reducers: {
    transactionRequest: (
      state,
      {
        payload: { transactionRequest, transactionLikelyFails },
      }: {
        payload: {
          transactionRequest: EIP1559TransactionRequest
          transactionLikelyFails: boolean
        }
      }
    ) => ({
      ...state,
      status: TransactionConstructionStatus.Loaded,
      signedTransaction: undefined,
      transactionRequest: {
        ...transactionRequest,
        maxFeePerGas:
          state.estimatedFeesPerGas?.[state.feeTypeSelected]?.maxFeePerGas ??
          transactionRequest.maxFeePerGas,
        maxPriorityFeePerGas:
          state.estimatedFeesPerGas?.[state.feeTypeSelected]
            ?.maxPriorityFeePerGas ?? transactionRequest.maxPriorityFeePerGas,
      },
      transactionLikelyFails,
    }),
    clearTransactionState: (state) => ({
      estimatedFeesPerGas: state.estimatedFeesPerGas,
      lastGasEstimatesRefreshed: state.lastGasEstimatesRefreshed,
      status: TransactionConstructionStatus.Idle,
      feeTypeSelected: NetworkFeeTypeChosen.Regular,
    }),
    regularFeeType: (state): TransactionConstruction => ({
      ...state,
      feeTypeSelected: NetworkFeeTypeChosen.Regular,
    }),
    expressFeeType: (state): TransactionConstruction => ({
      ...state,
      feeTypeSelected: NetworkFeeTypeChosen.Express,
    }),
    instantFeeType: (state): TransactionConstruction => ({
      ...state,
      feeTypeSelected: NetworkFeeTypeChosen.Instant,
    }),
    signed: (state, { payload }: { payload: SignedEVMTransaction }) => ({
      ...state,
      status: TransactionConstructionStatus.Signed,
      signedTransaction: payload,
    }),
    broadcastOnSign: (state, { payload }: { payload: boolean }) => ({
      ...state,
      broadcastOnSign: payload,
    }),
    transactionLikelyFails: (state) => ({
      ...state,
      transactionLikelyFails: true,
    }),
    estimatedFeesPerGas: (
      immerState,
      { payload: estimatedFeesPerGas }: { payload: BlockPrices }
    ) => {
      return {
        ...immerState,
        estimatedFeesPerGas: {
          baseFeePerGas: estimatedFeesPerGas.baseFeePerGas,
          instant: {
            maxFeePerGas:
              (estimatedFeesPerGas.baseFeePerGas *
                MAX_FEE_MULTIPLIER[INSTANT]) /
              10n,
            confidence: INSTANT,
            maxPriorityFeePerGas:
              estimatedFeesPerGas.estimatedPrices.find(
                (el) => el.confidence === INSTANT
              )?.maxPriorityFeePerGas ?? 0n,
            price:
              estimatedFeesPerGas.estimatedPrices.find(
                (el) => el.confidence === INSTANT
              )?.price ?? 0n,
          },
          express: {
            maxFeePerGas:
              (estimatedFeesPerGas.baseFeePerGas *
                MAX_FEE_MULTIPLIER[EXPRESS]) /
              10n,
            confidence: EXPRESS,
            maxPriorityFeePerGas:
              estimatedFeesPerGas.estimatedPrices.find(
                (el) => el.confidence === EXPRESS
              )?.maxPriorityFeePerGas ?? 0n,
            price:
              estimatedFeesPerGas.estimatedPrices.find(
                (el) => el.confidence === EXPRESS
              )?.price ?? 0n,
          },
          regular: {
            maxFeePerGas:
              (estimatedFeesPerGas.baseFeePerGas *
                MAX_FEE_MULTIPLIER[REGULAR]) /
              10n,
            confidence: REGULAR,
            maxPriorityFeePerGas:
              estimatedFeesPerGas.estimatedPrices.find(
                (el) => el.confidence === REGULAR
              )?.maxPriorityFeePerGas ?? 0n,
            price:
              estimatedFeesPerGas.estimatedPrices.find(
                (el) => el.confidence === REGULAR
              )?.price ?? 0n,
          },
        },
        lastGasEstimatesRefreshed: Date.now(),
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(updateTransactionOptions.pending, (immerState) => {
      immerState.status = TransactionConstructionStatus.Pending
      immerState.signedTransaction = undefined
    })
  },
})

export const {
  transactionRequest,
  transactionLikelyFails,
  broadcastOnSign,
  signed,
  regularFeeType,
  expressFeeType,
  instantFeeType,
  estimatedFeesPerGas,
} = transactionSlice.actions

export default transactionSlice.reducer

export const rejectTransactionSignature = createBackgroundAsyncThunk(
  "transaction-construction/reject",
  async (_, { dispatch }) => {
    await emitter.emit("signatureRejected")
    // Provide a clean slate for future transactions.
    dispatch(transactionSlice.actions.clearTransactionState())
  }
)

export const selectEstimatedFeesPerGas = createSelector(
  (state: { transactionConstruction: TransactionConstruction }) =>
    state.transactionConstruction.estimatedFeesPerGas,
  (gasData) => gasData
)

export const selectFeeType = createSelector(
  (state: { transactionConstruction: TransactionConstruction }) =>
    state.transactionConstruction.feeTypeSelected,
  (feeTypeChosen) => feeTypeChosen
)

export const selectLastGasEstimatesRefreshTime = createSelector(
  (state: { transactionConstruction: TransactionConstruction }) =>
    state.transactionConstruction.lastGasEstimatesRefreshed,
  (updateTime) => updateTime
)

export const selectTransactionData = createSelector(
  (state: { transactionConstruction: TransactionConstruction }) =>
    state.transactionConstruction.transactionRequest,
  (transactionRequestData) => transactionRequestData
)

export const selectIsTransactionLoaded = createSelector(
  (state: { transactionConstruction: TransactionConstruction }) =>
    state.transactionConstruction.status,
  (status) => status === "loaded"
)

export const selectIsTransactionSigned = createSelector(
  (state: { transactionConstruction: TransactionConstruction }) =>
    state.transactionConstruction.status,
  (status) => status === "signed"
)
