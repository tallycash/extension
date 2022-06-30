import React, { ReactElement, useState } from "react"
import {
  rejectTransactionSignature,
  signTransaction,
} from "@tallyho/tally-background/redux-slices/transaction-construction"
import {
  selectIsTransactionLoaded,
  selectTransactionData,
} from "@tallyho/tally-background/redux-slices/selectors/transactionConstructionSelectors"
import {
  getAccountTotal,
  selectCurrentNetwork,
} from "@tallyho/tally-background/redux-slices/selectors"
import {
  useBackgroundDispatch,
  useBackgroundSelector,
  useIsSignerLocked,
} from "../hooks"
import SignTransactionContainer from "../components/SignTransaction/SignTransactionContainer"
import SignTransactionInfoProvider from "../components/SignTransaction/SignTransactionInfoProvider"
import SignTransactionPanelSwitcher from "../components/SignTransaction/SignTransactionPanelSwitcher"
import SignTransactionPanelCombined from "../components/SignTransaction/SignTransactionPanelCombined"
import {USE_UPDATED_SIGNING_UI} from "@tallyho/tally-background/features"
import {Signing} from "../components/Signing"

export default function SignTransaction(): ReactElement {
  const dispatch = useBackgroundDispatch()
  const transactionDetails = useBackgroundSelector(selectTransactionData)
  const currentNetwork = useBackgroundSelector(selectCurrentNetwork)

  const isTransactionDataReady = useBackgroundSelector(
    selectIsTransactionLoaded
  )

  const signerAccountTotal = useBackgroundSelector((state) => {
    if (typeof transactionDetails !== "undefined") {
      return getAccountTotal(state, {
        address: transactionDetails.from,
        network: currentNetwork,
      })
    }
    return undefined
  })

  const [isTransactionSigning, setIsTransactionSigning] = useState(false)

  const accountSigner = signerAccountTotal?.accountSigner ?? null

  const isLocked = useIsSignerLocked(accountSigner)

  if (USE_UPDATED_SIGNING_UI) {
    return (
      <Signing accountSigner={accountSigner} request={transactionDetails} />
    )
  }

  if (isLocked) return <></>

  const handleReject = async () => {
    await dispatch(rejectTransactionSignature())
  }
  const handleConfirm = async () => {
    if (
      isTransactionDataReady &&
      transactionDetails &&
      accountSigner !== null
    ) {
      dispatch(
        signTransaction({
          request: transactionDetails,
          accountSigner,
        })
      )
      setIsTransactionSigning(true)
    }
  }

  return (
    <SignTransactionInfoProvider>
      {({ title, infoBlock, textualInfoBlock, confirmButtonLabel }) => (
        <SignTransactionContainer
          signerAccountTotal={signerAccountTotal}
          title={title}
          confirmButtonLabel={confirmButtonLabel}
          handleConfirm={handleConfirm}
          handleReject={handleReject}
          detailPanel={infoBlock}
          reviewPanel={textualInfoBlock}
          extraPanel={
            title === "Contract interaction" ? (
              <SignTransactionPanelCombined />
            ) : (
              <SignTransactionPanelSwitcher />
            )
          }
          isTransactionSigning={isTransactionSigning}
          isArbitraryDataSigningRequired={
            !!(transactionDetails?.input ?? false)
          }
        />
      )}
    </SignTransactionInfoProvider>
  )
}
