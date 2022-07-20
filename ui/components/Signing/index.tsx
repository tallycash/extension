import { SignOperationType } from "@tallyho/tally-background/redux-slices/signing"
import { AccountSigner } from "@tallyho/tally-background/services/signing"
import React, { ReactElement } from "react"

// FIXME Temporarily disable eslint while the rest of the component gets filled in.
/* eslint-disable */

type SigningProps<T extends SignOperationType> = {
  request: T | undefined
  accountSigner: AccountSigner
}

/**
 * The Signing component is an umbrella component that renders all
 * signing-related UI. It handles choosing the correct UI to present the data
 * being signed to the user, as well as the correct UI for the signer executing
 * the actual signature, and delegates control of the UI to the signer.
 */
export default function Signing<T extends SignOperationType>(
  props: SigningProps<T>
): ReactElement {
	return <></>
}
