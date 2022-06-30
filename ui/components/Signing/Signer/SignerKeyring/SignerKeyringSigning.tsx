import { selectKeyringStatus } from "@tallyho/tally-background/redux-slices/selectors"
import React, { ReactElement, useEffect, useState } from "react"
import { AnyAction } from "redux"
import { useBackgroundDispatch, useBackgroundSelector } from "../../../../hooks"
import KeyringSetPassword from "../../../Keyring/KeyringSetPassword"
import KeyringUnlock from "../../../Keyring/KeyringUnlock"

type SignerKeyringSigningProps = {
  signActionCreator: () => AnyAction
}

export default function SignerKeyringSigning({
  signActionCreator,
}: SignerKeyringSigningProps): ReactElement {
  const dispatch = useBackgroundDispatch()
  const keyringStatus = useBackgroundSelector(selectKeyringStatus)
  const [signingInitiated, setSigningInitiated] = useState(false)

  // Initiate signing once keyring is ready.
  useEffect(() => {
    if (!signingInitiated && keyringStatus === "unlocked") {
      dispatch(signActionCreator())

      setSigningInitiated(true)
    }
  }, [
    keyringStatus,
    signingInitiated,
    setSigningInitiated,
    dispatch,
    signActionCreator,
  ])

  // In this construction, keyring unlocking isn't done as a route, but in line
  // in the signing frame.
  if (keyringStatus === "uninitialized") {
    return <KeyringSetPassword />
  }
  if (keyringStatus === "locked") {
    return <KeyringUnlock />
  }

  // If the keyring is ready, we don't render anything as signing should be
  // quick; we may want a brief spinner.
  return <></>
}

