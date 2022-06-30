import React, { ReactElement } from "react"
import { SigningDataTransactionSummaryBody } from "."
import { SigningDataTransactionSummaryProps } from ".."
import SharedAddress from "../../../../Shared/SharedAddress"

export default function SigningDataTransactionSummaryContractInteraction({
  transactionRequest,
  annotation,
}: SigningDataTransactionSummaryProps): ReactElement {
  return (
    <>
      <h1 className="serif_header title">Contract interaction</h1>
      <SigningDataTransactionSummaryBody>
        <div className="container">
          {typeof transactionRequest.to === "undefined" ? (
            <>
              <div className="label">Send to</div>
              <div className="send_to">Contract creation</div>
            </>
          ) : (
            <>
              <div className="label">Interacting with</div>
              <SharedAddress
                address={transactionRequest.to}
                name={
                  annotation !== undefined && "contractName" in annotation
                    ? annotation.contractName
                    : undefined
                }
              />
            </>
          )}
        </div>
        <style jsx>
          {`
            .label {
              color: var(--green-40);
              font-size: 16px;
              line-height: 24px;
              margin-bottom: 4px;
            }
            .container {
              display: flex;
              margin: 20px 0;
              flex-direction: column;
              align-items: center;
            }
          `}
        </style>
      </SigningDataTransactionSummaryBody>
    </>
  )
}
