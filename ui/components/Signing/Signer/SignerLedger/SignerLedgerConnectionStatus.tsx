import { assertUnreachable } from "@tallyho/tally-background/lib/utils/type-guards"
import React, { ReactElement } from "react"
import { SigningLedgerState } from "../../../SignTransaction/useSigningLedgerState"

type SignerLedgerConnectionStatusProps = {
  ledgerState: SigningLedgerState
  mustEnableArbitraryDataSigning: boolean
}

export default function SignerLedgerConnectionStatus({
  ledgerState,
  mustEnableArbitraryDataSigning,
}: SignerLedgerConnectionStatusProps): ReactElement {
  switch (ledgerState.state) {
    case "available":
      if (mustEnableArbitraryDataSigning) {
        return <img src="" alt="Ledger is connected but cannot sign" />
      }
      return <img src="" alt="Ledger is ready to sign" />
    case "no-ledger-connected":
      return <img src="" alt="Ledger is disconnected" />
    case "wrong-ledger-connected":
      return <img src="" alt="Wrong Ledger connected" />
    case "multiple-ledgers-connected":
      return <img src="" alt="Multiple ledgers connected" />
    case "busy":
      return <img src="" alt="Ledger is busy" />
    default:
      return assertUnreachable(ledgerState)
  }
}
