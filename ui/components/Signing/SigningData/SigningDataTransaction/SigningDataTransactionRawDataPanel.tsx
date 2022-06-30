import React, { ReactElement } from "react"
import { useDispatch } from "react-redux"
import { setSnackbarMessage } from "@tallyho/tally-background/redux-slices/ui"
import SharedButton from "../../../Shared/SharedButton"
import { SigningDataTransactionProps } from "."

export default function SignTransactionRawDataPanel({
  transactionRequest,
}: SigningDataTransactionProps): ReactElement {
  const dispatch = useDispatch()

  const { input } = transactionRequest

  const copyData = () => {
    navigator.clipboard.writeText(input ?? "")
    dispatch(setSnackbarMessage("Raw data copied to clipboard"))
  }

  return (
    <div className="raw_data_wrap standard_width_padded">
      <SharedButton
        type="tertiary"
        iconMedium="copy"
        size="medium"
        iconPosition="left"
        onClick={copyData}
      >
        Copy hex
      </SharedButton>
      <div className="raw_data_text">{input} </div>
      <style jsx>{`
        .raw_data_wrap {
          margin-top: 15px;
        }
        .raw_data_text {
          margin: 5px 0;
          padding: 24px;
          border-radius: 4px;
          background-color: var(--hunter-green);
          color: var(--green-40);
          overflow-wrap: break-word;
        }
      `}</style>
    </div>
  )
}
