import { SignOperationType } from "@tallyho/tally-background/redux-slices/signing"
import React, { ReactElement, useCallback, useState } from "react"
import { SigningFrameProps } from "../.."
import { useBackgroundDispatch } from "../../../../hooks"
import SignerBaseFrame from "../SignerBaseFrame"
import SignerKeyringSigning from "./SignerKeyringSigning"

export default function SignerKeyringFrame<T extends SignOperationType>({
  children,
  signActionCreator,
  rejectActionCreator,
  signingAction,
}: SigningFrameProps<T>): ReactElement {
  const [isSigning, setIsSigning] = useState(false)
  const dispatch = useBackgroundDispatch()

  const handleConfirm = useCallback(() => {
    setIsSigning(true)
  }, [setIsSigning])

  if (isSigning) {
    return <SignerKeyringSigning signActionCreator={signActionCreator} />
  }

  return (
    <>
      <SignerBaseFrame
        signingAction={signingAction}
        onReject={() => dispatch(rejectActionCreator())}
        onConfirm={handleConfirm}
      >
        {children}
      </SignerBaseFrame>
    </>
  )
}
