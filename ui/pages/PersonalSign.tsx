import React, { ReactElement, useState } from "react"
import {
  getAccountTotal,
  selectCurrentAccountSigner,
} from "@tallyho/tally-background/redux-slices/selectors"
import {
  rejectDataSignature,
  signData,
  selectSigningData,
} from "@tallyho/tally-background/redux-slices/signing"
import { SignDataMessageType } from "@tallyho/tally-background/utils/signing"
import { useHistory } from "react-router-dom"
import { USE_UPDATED_SIGNING_UI } from "@tallyho/tally-background/features"
import { ReadOnlyAccountSigner } from "@tallyho/tally-background/services/signing"
import {
  useBackgroundDispatch,
  useBackgroundSelector,
  useIsSignerLocked,
} from "../hooks"
import PersonalSignDetailPanel from "./PersonalSignDetailPanel"
import SignTransactionContainer from "../components/SignTransaction/SignTransactionContainer"
import Signing from "../components/Signing"

const TITLE: Record<SignDataMessageType, string> = {
  [SignDataMessageType.EIP4361]: "Sign in with Ethereum",
  [SignDataMessageType.EIP191]: "Sign Message",
}

export default function PersonalSignData(): ReactElement {
  const dispatch = useBackgroundDispatch()

  const signingDataRequest = useBackgroundSelector(selectSigningData)

  const history = useHistory()

  const signerAccountTotal = useBackgroundSelector((state) => {
    if (typeof signingDataRequest !== "undefined") {
      return getAccountTotal(state, signingDataRequest.account)
    }
    return undefined
  })

  const currentAccountSigner = useBackgroundSelector(selectCurrentAccountSigner)

  const [isTransactionSigning, setIsTransactionSigning] = useState(false)

  const isLocked = useIsSignerLocked(currentAccountSigner)
  if (isLocked) return <></>

  if (USE_UPDATED_SIGNING_UI) {
    if (currentAccountSigner === null || signingDataRequest === undefined) {
      return <></>
    }

    return (
      <Signing
        accountSigner={currentAccountSigner}
        request={signingDataRequest}
      />
    )
  }

  if (
    typeof signingDataRequest === "undefined" ||
    typeof signerAccountTotal === "undefined"
  ) {
    return <></>
  }

  const handleConfirm = () => {
    if (currentAccountSigner === ReadOnlyAccountSigner) return
    if (signingDataRequest === undefined) return

    dispatch(
      signData({
        request: signingDataRequest,
        accountSigner: currentAccountSigner,
      })
    )
    setIsTransactionSigning(true)
  }

  const handleReject = async () => {
    dispatch(rejectDataSignature())
    history.goBack()
  }

  return (
    <SignTransactionContainer
      signerAccountTotal={signerAccountTotal}
      confirmButtonLabel="Sign"
      handleConfirm={handleConfirm}
      handleReject={handleReject}
      title={TITLE[signingDataRequest.messageType]}
      detailPanel={<PersonalSignDetailPanel />}
      reviewPanel={<PersonalSignDetailPanel />}
      isTransactionSigning={isTransactionSigning}
      extraPanel={null}
      isArbitraryDataSigningRequired={!!signingDataRequest.signingData}
    />
  )
}
