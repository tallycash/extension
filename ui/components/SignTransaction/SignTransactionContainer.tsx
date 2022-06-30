import React, {
  ReactElement,
  ReactNode,
  useEffect,
  useState,
  useRef,
} from "react"
import { AccountTotal } from "@tallyho/tally-background/redux-slices/selectors"
import SharedButton from "../Shared/SharedButton"
import SharedSkeletonLoader from "../Shared/SharedSkeletonLoader"
import SharedSlideUpMenu from "../Shared/SharedSlideUpMenu"
import SignTransactionLedgerActivateBlindSigning from "./SignTransactionLedgerActivateBlindSigning"
import SignTransactionLedgerBusy from "./SignTransactionLedgerBusy"
import SignTransactionLedgerNotConnected from "./SignTransactionLedgerNotConnected"
import SignTransactionMultipleLedgersConnected from "./SignTransactionMultipleLedgersConnected"
import SignTransactionNetworkAccountInfoTopBar from "./SignTransactionNetworkAccountInfoTopBar"
import SignTransactionWrongLedgerConnected from "./SignTransactionWrongLedgerConnected"
import { useSigningLedgerState } from "./useSigningLedgerState"

export default function SignTransactionContainer({
  signerAccountTotal,
  title,
  detailPanel,
  reviewPanel,
  extraPanel,
  confirmButtonLabel,
  handleConfirm,
  handleReject,
  isTransactionSigning,
  isArbitraryDataSigningRequired,
}: {
  signerAccountTotal?: AccountTotal
  title: ReactNode
  detailPanel: ReactNode
  reviewPanel: ReactNode
  extraPanel: ReactNode
  confirmButtonLabel: ReactNode
  handleConfirm: () => void
  handleReject: () => void
  isTransactionSigning: boolean
  isArbitraryDataSigningRequired: boolean
}): ReactElement {
  const [isSlideUpOpen, setSlideUpOpen] = useState(false)
  const accountSigner = signerAccountTotal?.accountSigner
  const [isOnDelayToSign, setIsOnDelayToSign] = useState(true)
  const [focusChangeNonce, setFocusChangeNonce] = useState(0)

  const signingLedgerState = useSigningLedgerState(
    signerAccountTotal?.address,
    accountSigner ?? null
  )

  const isLedgerSigning = accountSigner?.type === "ledger"
  const isWaitingForHardware = isLedgerSigning && isTransactionSigning

  const isLedgerAvailable = signingLedgerState?.state === "available"

  const mustEnableArbitraryDataSigning =
    isLedgerAvailable &&
    isArbitraryDataSigningRequired &&
    !signingLedgerState.arbitraryDataEnabled

  const canLedgerSign = isLedgerAvailable && !mustEnableArbitraryDataSigning

  /*
    Prevent shenanigans by disabling the sign button for a bit
    when rendering new sign content or when changing window focus.
  */
  const delaySignButtonTimeout = useRef<number | undefined>()

  function clearDelaySignButtonTimeout() {
    if (typeof delaySignButtonTimeout.current !== "undefined") {
      clearTimeout(delaySignButtonTimeout.current)
      delaySignButtonTimeout.current = undefined
    }
  }

  useEffect(() => {
    const increaseFocusChangeNonce = () => {
      setFocusChangeNonce((x) => x + 1)
    }
    window.addEventListener("focus", increaseFocusChangeNonce)
    window.addEventListener("blur", increaseFocusChangeNonce)

    return () => {
      window.removeEventListener("focus", increaseFocusChangeNonce)
      window.removeEventListener("blur", increaseFocusChangeNonce)
    }
  }, [])

  // Runs on updates
  useEffect(() => {
    clearDelaySignButtonTimeout()

    if (document.hasFocus()) {
      delaySignButtonTimeout.current = window.setTimeout(() => {
        setIsOnDelayToSign(false)
        // Random delay between 0.5 and 2 seconds
      }, Math.floor(Math.random() * (5 - 1) + 1) * 500)
    } else {
      setIsOnDelayToSign(true)
    }
  }, [reviewPanel, focusChangeNonce])

  return (
    <section>
      <SharedSkeletonLoader
        isLoaded={!!signerAccountTotal}
        height={32}
        width={120}
        customStyles="margin: 15px 0 15px 220px;"
      >
        {!!signerAccountTotal && (
          <SignTransactionNetworkAccountInfoTopBar
            accountTotal={signerAccountTotal}
          />
        )}
      </SharedSkeletonLoader>
      <h1 className="serif_header title">
        {isWaitingForHardware ? "Awaiting hardware wallet signature" : title}
      </h1>
      <div className="primary_info_card standard_width">
        {isWaitingForHardware ? reviewPanel : detailPanel}
      </div>
      {isWaitingForHardware ? (
        <div className="cannot_reject_warning">
          <span className="block_icon" />
          Tx can only be Rejected from Ledger
        </div>
      ) : (
        <>
          {extraPanel}
          <div className="footer_actions">
            <SharedButton size="large" type="secondary" onClick={handleReject}>
              Reject
            </SharedButton>
            {/* TODO: split into different components depending on signing method, to avoid convoluted logic below */}
            {accountSigner &&
              (isLedgerSigning && !canLedgerSign ? (
                <SharedButton
                  type="primaryGreen"
                  size="large"
                  onClick={() => {
                    setSlideUpOpen(true)
                  }}
                >
                  Check Ledger
                </SharedButton>
              ) : (
                <SharedButton
                  type="primaryGreen"
                  size="large"
                  onClick={handleConfirm}
                  showLoadingOnClick
                  isDisabled={isOnDelayToSign}
                >
                  {confirmButtonLabel}
                </SharedButton>
              ))}
            {accountSigner === null && (
              <span className="no-signing">Read-only accounts cannot sign</span>
            )}
          </div>
        </>
      )}
      <SharedSlideUpMenu
        isOpen={isSlideUpOpen && !canLedgerSign}
        close={() => {
          setSlideUpOpen(false)
        }}
        alwaysRenderChildren
        size="auto"
      >
        {signingLedgerState?.state === "no-ledger-connected" && (
          <SignTransactionLedgerNotConnected />
        )}
        {signingLedgerState?.state === "wrong-ledger-connected" && (
          <SignTransactionWrongLedgerConnected
            requiredAddress={signingLedgerState.requiredAddress}
          />
        )}
        {signingLedgerState?.state === "multiple-ledgers-connected" && (
          <SignTransactionMultipleLedgersConnected />
        )}
        {mustEnableArbitraryDataSigning && (
          <SignTransactionLedgerActivateBlindSigning />
        )}
        {signingLedgerState?.state === "busy" && <SignTransactionLedgerBusy />}
      </SharedSlideUpMenu>
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
          .title {
            color: var(--trophy-gold);
            font-size: 36px;
            font-weight: 500;
            line-height: 42px;
            text-align: center;
          }
          .primary_info_card {
            display: block;
            height: fit-content;
            border-radius: 16px;
            background-color: var(--hunter-green);
            margin: 16px 0px;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .footer_actions {
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
            background: no-repeat center / cover
              url("./images/block_icon@2x.png");
          }
        `}
      </style>
    </section>
  )
}
