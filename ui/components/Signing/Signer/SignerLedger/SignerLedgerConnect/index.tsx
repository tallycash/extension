import { assertUnreachable } from "@tallyho/tally-background/lib/utils/type-guards"
import React, { ReactElement } from "react"
import SignTransactionLedgerActivateBlindSigning from "../../../../SignTransaction/SignTransactionLedgerActivateBlindSigning"
import SignTransactionLedgerBusy from "../../../../SignTransaction/SignTransactionLedgerBusy"
import SignTransactionLedgerNotConnected from "../../../../SignTransaction/SignTransactionLedgerNotConnected"
import SignTransactionMultipleLedgersConnected from "../../../../SignTransaction/SignTransactionMultipleLedgersConnected"
import SignTransactionWrongLedgerConnected from "../../../../SignTransaction/SignTransactionWrongLedgerConnected"
import { SigningLedgerState } from "../../../../SignTransaction/useSigningLedgerState"

type SignerLedgerConnectProps = {
  signingLedgerState: SigningLedgerState
}

export default function SignerLedgerConnect({
  signingLedgerState,
}: SignerLedgerConnectProps): ReactElement {
  switch (signingLedgerState.state) {
    case "no-ledger-connected":
      return <SignTransactionLedgerNotConnected />
    case "wrong-ledger-connected":
      return (
        <SignTransactionWrongLedgerConnected
          requiredAddress={signingLedgerState.requiredAddress}
        />
      )
    case "multiple-ledgers-connected":
      return <SignTransactionMultipleLedgersConnected />
    case "busy":
      return <SignTransactionLedgerBusy />
    case "available":
      // Note that if the ledger is available, this component expects to only
      // be rendered if arbitrary data signing is required AND disabled. We
      // don't guard with an additional check here, as the parent is expected
      // to verify for us.
      return <SignTransactionLedgerActivateBlindSigning />
    default:
      return assertUnreachable(signingLedgerState)
  }
}
