import { truncateAddress } from "@tallyho/tally-background/lib/utils"
import { AccountTotal } from "@tallyho/tally-background/redux-slices/selectors"
import React, { ReactElement } from "react"
import SharedButton from "../Shared/SharedButton"
import SignTransactionSlideUpContentLayout from "./SignTransactionSlideUpContentLayout"

export default function SignTransactionWrongLedgerConnected({
  signerAccountTotal,
}: {
  signerAccountTotal: AccountTotal
}): ReactElement {
  return (
    <SignTransactionSlideUpContentLayout
      title="Wrong Ledger"
      helpMessage="Looks like you are using the wrong Ledger."
      steps={[
        <div className="step_account">
          <div className="step_account_content">
            <div>Connect the Ledger containing this account:</div>
            <div>
              <SharedButton
                icon="external"
                size="small"
                iconSize="small"
                type="deemphasizedWhite"
                onClick={() => {
                  window
                    .open(
                      `https://etherscan.io/address/${signerAccountTotal.address}`,
                      "_blank"
                    )
                    ?.focus()
                }}
              >
                {`${truncateAddress(signerAccountTotal.address)}`}
              </SharedButton>
            </div>
          </div>

          <style jsx>{`
            .step_account {
              align-self: flex-start;
            }

            .step_account_content {
              display: flex;
              flex-flow: column;
              gap: 0.5rem;
            }
          `}</style>
        </div>,
        <>Refresh the page</>,
      ]}
    />
  )
}
