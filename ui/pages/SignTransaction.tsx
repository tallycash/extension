import React, { ReactElement, useEffect, useState } from "react"
import { useHistory } from "react-router-dom"
import {
  broadcastSignedTransaction,
  rejectTransactionSignature,
  selectIsTransactionLoaded,
  selectIsTransactionSigned,
  selectTransactionData,
  signTransaction,
  TransactionConstructionStatus,
} from "@tallyho/tally-background/redux-slices/transaction-construction"
import { getAccountTotal } from "@tallyho/tally-background/redux-slices/selectors"
import { normalizeEVMAddress } from "@tallyho/tally-background/lib/utils"
import {
  useBackgroundDispatch,
  useBackgroundSelector,
  useAreKeyringsUnlocked,
} from "../hooks"
import SignTransactionContainer from "../components/SignTransaction/SignTransactionContainer"
import SignTransactionInfoProvider from "../components/SignTransaction/SignTransactionInfoProvider"
import { useSigningLedgerState } from "../components/SignTransaction/useSigningLedgerState"

export default function SignTransaction({
  location,
}: {
  location: {
    key?: string
    pathname: string
    state?: { redirectTo: { path: string; state: unknown } }
  }
}): ReactElement {
  const history = useHistory()
  const dispatch = useBackgroundDispatch()
  const transactionDetails = useBackgroundSelector(selectTransactionData)

  const isTransactionDataReady = useBackgroundSelector(
    selectIsTransactionLoaded
  )
  const signedTransaction = useBackgroundSelector(
    ({ transactionConstruction }) => transactionConstruction.signedTransaction
  )

  const isTransactionSigned = useBackgroundSelector(selectIsTransactionSigned)

  const shouldBroadcastOnSign = useBackgroundSelector(
    ({ transactionConstruction }) =>
      transactionConstruction.broadcastOnSign ?? false
  )

  const isTransactionMissingOrRejected = useBackgroundSelector(
    ({ transactionConstruction }) =>
      transactionConstruction.status === TransactionConstructionStatus.Idle
  )

  const signerAccountTotal = useBackgroundSelector((state) => {
    if (typeof transactionDetails !== "undefined") {
      return getAccountTotal(
        state,
        normalizeEVMAddress(transactionDetails.from)
      )
    }
    return undefined
  })

  const needsKeyrings = signerAccountTotal?.signingMethod?.type === "keyring"
  const areKeyringsUnlocked = useAreKeyringsUnlocked(needsKeyrings)
  const isWaitingForKeyrings = needsKeyrings && !areKeyringsUnlocked

  const [isTransactionSigning, setIsTransactionSigning] = useState(false)

  useEffect(() => {
    if (!isWaitingForKeyrings && isTransactionSigned && isTransactionSigning) {
      if (shouldBroadcastOnSign && typeof signedTransaction !== "undefined") {
        dispatch(broadcastSignedTransaction(signedTransaction))
      }

      // Request broadcast if not dApp...
      if (typeof location.state !== "undefined") {
        history.push(
          location.state.redirectTo.path,
          location.state.redirectTo.state
        )
      } else {
        history.goBack()
      }
    }
  }, [
    dispatch,
    history,
    isTransactionSigned,
    isTransactionSigning,
    isWaitingForKeyrings,
    location.state,
    shouldBroadcastOnSign,
    signedTransaction,
  ])

  useEffect(() => {
    if (isTransactionMissingOrRejected) {
      history.goBack()
    }
  }, [history, isTransactionMissingOrRejected])

  const isLedgerSigning = signerAccountTotal?.signingMethod?.type === "ledger"

  const signingLedgerState = useSigningLedgerState(
    signerAccountTotal?.signingMethod ?? null
  )

  if (isWaitingForKeyrings) {
    return <></>
  }

  const signingMethod = signerAccountTotal?.signingMethod ?? null
  if (
    typeof transactionDetails === "undefined" ||
    typeof signerAccountTotal === "undefined"
  ) {
    // TODO Some sort of unexpected state error if we end up here... Or do we
    // go back in history? That won't work for dApp popovers though.
    return <></>
  }

  const handleReject = async () => {
    await dispatch(rejectTransactionSignature())
  }
  const handleConfirm = async () => {
    if (
      isTransactionDataReady &&
      transactionDetails &&
      signingMethod !== null
    ) {
      dispatch(
        signTransaction({
          transaction: transactionDetails,
          method: signingMethod,
        })
      )
      setIsTransactionSigning(true)
    }
  }

  const isWaitingForHardware = isLedgerSigning && isTransactionSigning

  return (
    <SignTransactionInfoProvider>
      {({ title, infoBlock, textualInfoBlock, confirmButtonLabel }) => (
        <SignTransactionContainer
          signerAccountTotal={signerAccountTotal}
          signingLedgerState={signingLedgerState}
          title={title}
          isWaitingForHardware={isWaitingForHardware}
          confirmButtonLabel={confirmButtonLabel}
          handleConfirm={handleConfirm}
          handleReject={handleReject}
        >
          {isWaitingForHardware ? textualInfoBlock : infoBlock}
        </SignTransactionContainer>
      )}
    </SignTransactionInfoProvider>
  )
}
