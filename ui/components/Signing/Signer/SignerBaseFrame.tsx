import React, { ReactElement, useState } from "react"
import SharedButton from "../../Shared/SharedButton"

type SignerBaseFrameProps = {
  signingAction: string
  onConfirm: () => void
  onReject: () => void
  children: ReactElement
}

export default function SignerBaseFrame({
  children,
  signingAction,
  onConfirm,
  onReject,
}: SignerBaseFrameProps): ReactElement {
  const [isOnDelayToSign /* , setIsOnDelayToSign */] = useState(false)

  return (
    <>
      {children}
      <footer>
        <SharedButton size="large" type="secondary" onClick={onReject}>
          Reject
        </SharedButton>

        <SharedButton
          type="primaryGreen"
          size="large"
          onClick={onConfirm}
          showLoadingOnClick
          isDisabled={isOnDelayToSign}
        >
          {signingAction}
        </SharedButton>
      </footer>
    </>
  )
}
