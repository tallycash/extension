import {
  fixedPointNumberToString,
  multiplyFixedPointNumbers,
} from "@tallyho/tally-background/lib/fixed-point"
import { SignOperationType } from "@tallyho/tally-background/redux-slices/signing"
import { ethers } from "ethers"
import { sha256, toUtf8Bytes, _TypedDataEncoder } from "ethers/lib/utils"
import React, { ReactElement } from "react"
import TransactionDetailContainer from "../../../../TransactionDetail/TransactionDetailContainer"
import TransactionDetailItem from "../../../../TransactionDetail/TransactionDetailItem"

type SignerKeyringSigningProps<T extends SignOperationType> = {
  request: T
  isArbitraryDataSigningRequired: boolean
}

export default function SignerLedgerSigning<T extends SignOperationType>({
  request,
  isArbitraryDataSigningRequired,
}: SignerKeyringSigningProps<T>): ReactElement {
  if ("signingData" in request) {
    return (
      <TransactionDetailContainer>
        <TransactionDetailItem name="Sign message" value="" />
        {/* FIXME Nano S shows "Message" up to ~96 chars */}
        {/* FIXME Nano X shows "Message" up to ~255 chars */}
        <TransactionDetailItem name="Message" value={request.rawSigningData} />
      </TransactionDetailContainer>
    )
  }

  if ("typedData" in request) {
    // FIXME TypeScript has a bug here that does not allow destructuring.
    // eslint-disable-next-line prefer-destructuring
    const typedData = request.typedData

    const { EIP712Domain, ...typesForSigning } = typedData.types
    const domainHash = _TypedDataEncoder
      .hashDomain(typedData.domain)
      .toUpperCase()
    const messageHash = _TypedDataEncoder
      .from(typesForSigning)
      .hash(typedData.message)
      .toUpperCase()

    return (
      <TransactionDetailContainer>
        <TransactionDetailItem name="Sign typed message" value="" />
        <TransactionDetailItem name="Domain hash" value={domainHash} />
        <TransactionDetailItem name="Message hash" value={messageHash} />
      </TransactionDetailContainer>
    )
  }

  const ethAmountString = fixedPointNumberToString({
    amount: request.value,
    decimals: request.network.baseAsset.decimals,
  })
  const maxFeeAmountString = fixedPointNumberToString(
    multiplyFixedPointNumbers(
      {
        amount: request.maxFeePerGas,
        decimals: request.network.baseAsset.decimals,
      },
      { amount: request.gasLimit, decimals: 0 }
    )
  )

  return (
    <>
      <TransactionDetailContainer>
        <TransactionDetailItem name="Review transaction" value="" />
        {isArbitraryDataSigningRequired ? (
          <TransactionDetailItem name="Blind signing" value="" />
        ) : (
          <></>
        )}
        <TransactionDetailItem name="Amount" value={`ETH ${ethAmountString}`} />
        <TransactionDetailItem
          name="Address"
          value={
            request.to !== undefined
              ? ethers.utils.getAddress(request.to)
              : "Contract"
          }
        />
        <TransactionDetailItem
          name="Max fees"
          value={`ETH ${maxFeeAmountString}`}
        />
      </TransactionDetailContainer>

      <footer className="cannot_reject_warning">
        <span className="block_icon" />
        Tx can only be Rejected from Ledger
      </footer>
      <style jsx>{`
        .cannot_reject_warning {
          position: fixed;
          display: flex;
          align-items: center;
          justify-content: center;
          bottom: 0;
          padding: 16px;
          color: var(--error);
          font-weight: 600;
          font-size: 18px;
        }
        .block_icon {
          width: 24px;
          height: 24px;
          margin: 8px;
          background: no-repeat center / cover url("./images/block_icon@2x.png");
        }
      `}</style>
    </>
  )
}
