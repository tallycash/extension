import { SignOperationType } from "@tallyho/tally-background/redux-slices/signing"
import React, { ReactElement, useCallback, useState } from "react"
import { SigningFrameProps } from "../.."
import { useBackgroundDispatch } from "../../../../hooks"
import SharedButton from "../../../Shared/SharedButton"
import SharedSlideUpMenu from "../../../Shared/SharedSlideUpMenu"
import { useSigningLedgerState } from "../../../SignTransaction/useSigningLedgerState"
import SignerLedgerConnect from "./SignerLedgerConnect"
import SignerLedgerConnectionStatus from "./SignerLedgerConnectionStatus"
import SignerLedgerSigning from "./SignerLedgerSigning"

export default function SignerLedgerFrame<T extends SignOperationType>({
  children,
  request,
  signer,
  signingAddress,
  signingAction,
  signActionCreator,
  rejectActionCreator,
}: SigningFrameProps<T>): ReactElement {
  const [isSigning, setIsSigning] = useState(false)
  const dispatch = useBackgroundDispatch()

  const handleConfirm = useCallback(() => {
    dispatch(signActionCreator())
    setIsSigning(true)
  }, [dispatch, signActionCreator])

  const handleReject = useCallback(() => {
    dispatch(rejectActionCreator())
  }, [dispatch, rejectActionCreator])

  const [isSlideUpOpen, setIsSlideUpOpen] = useState(false)
  const ledgerState = useSigningLedgerState(signingAddress.address, signer)
  const isArbitraryDataSigningRequired =
    ("input" in request &&
      request.input !== null &&
      request.input.length > 0) ||
    ("signingData" in request &&
      (typeof request.signingData !== "string" ||
        request.signingData.length > 0))

  if (ledgerState === null) {
    throw new Error(
      `Could not look up Ledger state for signer: ${JSON.stringify(signer)}`
    )
  }

  const mustEnableArbitraryDataSigning =
    ledgerState.state === "available" &&
    isArbitraryDataSigningRequired &&
    !ledgerState.arbitraryDataEnabled

  const ledgerCannotSign =
    ledgerState.state !== "available" || mustEnableArbitraryDataSigning

  return (
    <>
      <SignerLedgerConnectionStatus
        ledgerState={ledgerState}
        mustEnableArbitraryDataSigning={mustEnableArbitraryDataSigning}
      />
      {isSigning ? (
        <>
        <SignerLedgerSigning
          request={request}
          isArbitraryDataSigningRequired={isArbitraryDataSigningRequired}
        />
        </>
      ) : (
        <>
          {children}
          <footer>
            <SharedButton size="large" type="secondary" onClick={handleReject}>
              Reject
            </SharedButton>

            {ledgerCannotSign ? (
              <SharedButton
                type="primary"
                size="large"
                onClick={() => {
                  setIsSlideUpOpen(true)
                }}
              >
                Check Ledger
              </SharedButton>
            ) : (
              <SharedButton
                type="primary"
                size="large"
                onClick={handleConfirm}
                showLoadingOnClick
              >
                {signingAction}
              </SharedButton>
            )}
          </footer>
          <SharedSlideUpMenu
            isOpen={isSlideUpOpen}
            close={() => setIsSlideUpOpen(false)}
          >
            <SignerLedgerConnect signingLedgerState={ledgerState} />
          </SharedSlideUpMenu>
        </>
      )}
    </>
  )
}
