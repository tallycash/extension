import React, { ReactElement } from "react"
import { getAccountTotal } from "@tallyho/tally-background/redux-slices/selectors"
import { AccountSigner, ReadOnlyAccountSigner } from "@tallyho/tally-background/services/signing"
import { AddressOnNetwork } from "@tallyho/tally-background/accounts"
import {
  SignOperation,
  SignOperationType,
} from "@tallyho/tally-background/redux-slices/signing"
import { AnyAction } from "redux"
import { useBackgroundSelector } from "../../hooks"
import SignTransactionNetworkAccountInfoTopBar from "../SignTransaction/SignTransactionNetworkAccountInfoTopBar"
import { frameComponentForSigner } from "./Signer"
import {
  resolveDataSignatureDetails,
  resolveTransactionSignatureDetails,
  resolveTypedDataSignatureDetails,
} from "./SigningData"
import SharedSkeletonLoader from "../Shared/SharedSkeletonLoader"
import SignTransactionLoader from "../SignTransaction/SignTransactionLoader"

/**
 * Details regarding a signature request, resolved for a signer ahead of time
 * based on the type of signature, the account whose signature is being
 * requested, and the network on which that signature is taking place; see
 * `resolveSignatureDetails`.
 */
export type ResolvedSignatureDetails = {
  signer: AccountSigner
  signingAddress: AddressOnNetwork
  renderedSigningData: ReactElement
  signingAction: string
  signActionCreator: () => AnyAction
  rejectActionCreator: () => AnyAction
}

/**
 * The props passed to a signing frame.
 */
export type SigningFrameProps<T extends SignOperationType> =
  ResolvedSignatureDetails & {
    request: T
    signer: AccountSigner
    /**
     * A string that represents what signing this data will achieve. Some
     * signers may ignore this string, others may use it for their confirmation
     * button.
     */
    signingAction: string
    children: ReactElement
  }

/**
 * The React component type of a signing frame; all *Frame components in
 * subdirectories should conform to this signature, enforced by the
 * frameComponentForSigner lookup.
 */
export type SigningFrame<T extends SignOperationType> = (
  props: SigningFrameProps<T>
) => ReactElement

// Takes a signing request and resolves the signer that should be used to sign
// it and the details of signing data for user presentation.
function resolveSignatureDetails<T extends SignOperationType>({
  request,
  accountSigner,
}: SignOperation<T>): ResolvedSignatureDetails {
  if ("signingData" in request) {
    return resolveDataSignatureDetails({ request, accountSigner })
  }
  if ("typedData" in request) {
    return resolveTypedDataSignatureDetails({ request, accountSigner })
  }
  return resolveTransactionSignatureDetails({ request, accountSigner })
}

// Signing acts as a dispatcher, so prop spreading is a good tradeoff.
// The explicit prop and component types ease the linter rule's concern around
// forwarding unintended props. Disable the rule for the rest of the file
// accordingly.
/* eslint-disable react/jsx-props-no-spreading */

type SigningProps<T extends SignOperationType> = {
  request: T | undefined
  accountSigner: AccountSigner | null
}

/**
 * The Signing component is an umbrella component that renders all
 * signing-related UI. It handles choosing the correct UI to present the data
 * being signed to the user, as well as the correct UI for the signer executing
 * the actual signature, and delegates control of the UI to the signer.
 */
export function Signing<T extends SignOperationType>(
  props: SigningProps<T>
): ReactElement {
  const { request } = props
  // FIXME Move defaulting to selectCurrentAccountSigner when removing feature
  // FIXME flag.
  // eslint-disable-next-line react/destructuring-assignment
  const accountSigner = props.accountSigner ?? ReadOnlyAccountSigner
  const isLoaded = request !== undefined && accountSigner !== null

  // FIXME Accept undefined/null for request and render loader?
  const signatureDetails = isLoaded
    ? resolveSignatureDetails(props as SignOperation<T>)
    : undefined
  const { signer, renderedSigningData } = signatureDetails ?? {
    signer: undefined,
    renderedSigningData: undefined,
  }
  const signerAccountTotal = useBackgroundSelector((state) => {
    if (signatureDetails !== undefined) {
      return getAccountTotal(state, signatureDetails.signingAddress)
    }
    return undefined
  })

  if (
    !isLoaded ||
    signer === undefined ||
    signatureDetails === undefined ||
    renderedSigningData === undefined
  ) {
    return <SignTransactionLoader />
  }

  const SigningFrameComponent = frameComponentForSigner[signer.type]
  const signingFrameProps = {
    ...(props as SignOperation<T>),
    ...signatureDetails,
  }

  return (
    <section>
      <SharedSkeletonLoader
        isLoaded={signerAccountTotal !== undefined}
        height={32}
        width={120}
        customStyles="margin: 15px 0 15px 220px;"
      >
        {signerAccountTotal !== undefined && (
          <SignTransactionNetworkAccountInfoTopBar
            accountTotal={signerAccountTotal}
          />
        )}
      </SharedSkeletonLoader>
      <SigningFrameComponent {...signingFrameProps}>
        {renderedSigningData}
      </SigningFrameComponent>
      <style jsx>
        {`
          section {
            width: 100%;
            height: calc(100% - 80px);
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            background-color: var(--green-95);
            z-index: 5;
          }
          section :global(.title) {
            color: var(--trophy-gold);
            font-size: 36px;
            font-weight: 500;
            line-height: 42px;
            text-align: center;
          }
          section :global(footer) {
            position: fixed;
            bottom: 0px;
            display: flex;
            width: 100%;
            padding: 0px 16px;
            box-sizing: border-box;
            align-items: center;
            height: 80px;
            justify-content: space-between;
            box-shadow: 0 0 5px rgba(0, 20, 19, 0.5);
            background-color: var(--green-95);
          }
        `}
      </style>
    </section>
  )
}
