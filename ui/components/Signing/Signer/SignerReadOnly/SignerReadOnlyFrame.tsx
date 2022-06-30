import { SignOperationType } from "@tallyho/tally-background/redux-slices/signing"
import React, { ReactElement } from "react"
import { SigningFrameProps } from "../.."
import { useBackgroundDispatch } from "../../../../hooks"
import SharedButton from "../../../Shared/SharedButton"

export default function SignerKeyringFrame<T extends SignOperationType>({
  children,
  rejectActionCreator,
}: SigningFrameProps<T>): ReactElement {
  const dispatch = useBackgroundDispatch()

  return (
    <>
      {children}
      <footer>
        <SharedButton
          size="large"
          type="secondary"
          onClick={() => dispatch(rejectActionCreator())}
        >
          Reject
        </SharedButton>

        <span className="no-signing">Read-only accounts cannot sign</span>
      </footer>
    </>
  )
}
