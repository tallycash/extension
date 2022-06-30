import React from "react"
import { EIP1559TransactionRequest } from "@tallyho/tally-background/networks"
import {
  rejectDataSignature,
  signData,
  SignOperation,
  signTypedData,
} from "@tallyho/tally-background/redux-slices/signing"
import {
  rejectTransactionSignature,
  signTransaction,
} from "@tallyho/tally-background/redux-slices/transaction-construction"
import {
  SignDataRequest,
  SignTypedDataRequest,
} from "@tallyho/tally-background/utils/signing"
import { ResolvedSignatureDetails } from ".."
import SigningDataTransaction from "./SigningDataTransaction"

export function resolveTransactionSignatureDetails({
  request,
  accountSigner,
}: SignOperation<EIP1559TransactionRequest>): ResolvedSignatureDetails {
  // TODO Render signing data accordingly.

  return {
    signer: accountSigner,
    signingAddress: { address: request.from, network: request.network },
    signingAction: "Sign",
    renderedSigningData: (
      <SigningDataTransaction transactionRequest={request} />
    ),
    signActionCreator: () => signTransaction({ request, accountSigner }),
    rejectActionCreator: rejectTransactionSignature,
  }
}
export function resolveDataSignatureDetails({
  request,
  accountSigner,
}: SignOperation<SignDataRequest>): ResolvedSignatureDetails {
  // TODO Render signing data accordingly.

  return {
    signer: accountSigner,
    signingAddress: request.account,
    signingAction: "Sign Data",
    renderedSigningData: <></>,
    signActionCreator: () => signData({ request, accountSigner }),
    rejectActionCreator: rejectDataSignature,
  }
}

export function resolveTypedDataSignatureDetails({
  request,
  accountSigner,
}: SignOperation<SignTypedDataRequest>): ResolvedSignatureDetails {
  // TODO Render signing data accordingly.

  return {
    signer: accountSigner,
    signingAddress: request.account,
    signingAction: "Sign Data",
    renderedSigningData: <></>,
    signActionCreator: () => signTypedData({ request, accountSigner }),
    rejectActionCreator: rejectDataSignature,
  }
}
