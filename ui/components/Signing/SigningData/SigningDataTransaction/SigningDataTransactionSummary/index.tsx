import React, { ReactElement, ReactNode } from "react"
import { SigningDataTransactionSummaryProps } from ".."
import SigningDataTransactionSummaryTransfer from "./SigningDataTransactionSummaryTransfer"
import SigningDataTransactionSummarySpendApproval from "./SigningDataTransactionSummarySpendApproval"
import SigningDataTransactionSummarySwapAsset from "./SigningDataTransactionSummarySwapAsset"
import SigningDataTransactionSummaryDefault from "./SigningDataTransactionSummaryDefault"
import SigningDataTransactionSummaryContractInteraction from "./SigningDataTransactionSummaryContractInteraction"

export function SigningDataTransactionSummaryBody({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <div>
      {children}
      <style jsx>
        {`
          div {
            display: flex;
            height: fit-content;
            border-radius: 16px;
            background-color: var(--hunter-green);
            margin: 16px 0px;
            flex-direction: column;
            align-items: center;
          }
        `}
      </style>
    </div>
  )
}

/**
 * Creates transaction type-specific summary blocks for use in parent
 * components. Uses enriched transaction annotations for most rich summary
 * blocks.
 */
export default function SigningDataTransactionSummary({
  transactionRequest,
  annotation,
}: SigningDataTransactionSummaryProps): ReactElement {
  switch (annotation?.type) {
    case "asset-swap":
      return (
        <SigningDataTransactionSummarySwapAsset
          transactionRequest={transactionRequest}
          annotation={annotation}
        />
      )
    case "asset-approval":
      return (
        <SigningDataTransactionSummarySpendApproval
          transactionRequest={transactionRequest}
          annotation={annotation}
        />
      )
    case "asset-transfer":
      return (
        <SigningDataTransactionSummaryTransfer
          transactionRequest={transactionRequest}
          annotation={annotation}
        />
      )
    case "contract-interaction":
      return (
        <>
          {transactionRequest.value === BigInt(0) ? (
            <SigningDataTransactionSummaryContractInteraction
              transactionRequest={transactionRequest}
              annotation={annotation}
            />
          ) : (
            <SigningDataTransactionSummaryDefault
              transactionRequest={transactionRequest}
              annotation={annotation}
            />
          )}
        </>
      )
    default:
      return (
        <SigningDataTransactionSummaryDefault
          transactionRequest={transactionRequest}
          annotation={annotation}
        />
      )
  }
  ;<style jsx>
    {`
      .signing-data {
        display: block;
        height: fit-content;
        border-radius: 16px;
        background-color: var(--hunter-green);
        margin: 16px 0px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
    `}
  </style>
}
