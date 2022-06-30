import React, { ReactElement } from "react"
import { SigningDataTransactionProps } from "."
import SigningDataTransactionDetailPanel from "./SigningDataTransactionDetailPanel"
import SigningDataTransactionRawDataPanel from "./SigningDataTransactionRawDataPanel"

export default function SigningDataTransactionPanelCombined({
  transactionRequest,
}: SigningDataTransactionProps): ReactElement {
  return (
    <>
      <SigningDataTransactionDetailPanel
        transactionRequest={transactionRequest}
      />
      <SigningDataTransactionRawDataPanel
        transactionRequest={transactionRequest}
      />
    </>
  )
}
