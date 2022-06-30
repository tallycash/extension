import React, { ReactElement } from "react"
import {
  EnrichedEIP1559TransactionRequest,
  TransactionAnnotation,
} from "@tallyho/tally-background/services/enrichment"
import { EIP1559TransactionRequest } from "@tallyho/tally-background/networks"
import SigningDataTransactionPanelSwitcher from "./SigningDataTransactionPanelSwitcher"
import SigningDataTransactionPanelCombined from "./SigningDataTransactionPanelCombined"
import SigningDataTransactionSummary from "./SigningDataTransactionSummary"

export type SigningDataTransactionProps = {
  transactionRequest: EnrichedEIP1559TransactionRequest
}

export type SigningDataTransactionSummaryProps<
  T extends TransactionAnnotation | undefined =
    | TransactionAnnotation
    | undefined
> = {
  transactionRequest: EIP1559TransactionRequest
  annotation: T
}

export default function SigningDataTransaction({
  transactionRequest,
}: SigningDataTransactionProps): ReactElement {
  const { annotation } = transactionRequest
  const annotatedTransactionType = annotation?.type ?? "contract-interaction"

  return (
    <section>
      <SigningDataTransactionSummary
        transactionRequest={transactionRequest}
        annotation={annotation}
      />
      {annotatedTransactionType === "contract-interaction" ? (
        <SigningDataTransactionPanelCombined
          transactionRequest={transactionRequest}
        />
      ) : (
        <SigningDataTransactionPanelSwitcher
          transactionRequest={transactionRequest}
        />
      )}
    </section>
  )
}
