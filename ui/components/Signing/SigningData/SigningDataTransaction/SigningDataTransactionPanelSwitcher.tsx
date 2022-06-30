import React, { ReactElement } from "react"
import { SigningDataTransactionProps } from "."
import { useSwitchablePanels } from "../../../../hooks"
import SigningDataTransactionDetailPanel from "./SigningDataTransactionDetailPanel"
import SigningDataTransactionRawDataPanel from "./SigningDataTransactionRawDataPanel"

export default function SigningDataTransactionPanelSwitcher({
  transactionRequest,
}: SigningDataTransactionProps): ReactElement {
  const switchablePanels = useSwitchablePanels([
    {
      name: "Details",
      panelElement: (
        <SigningDataTransactionDetailPanel
          transactionRequest={transactionRequest}
        />
      ),
    },
    {
      name: "Raw data",
      panelElement: (
        <SigningDataTransactionRawDataPanel
          transactionRequest={transactionRequest}
        />
      ),
    },
  ])

  return <>{switchablePanels}</>
}
