import { connectLedger } from "@tallyho/tally-background/redux-slices/ledger"
import TransportWebAuthn from "@ledgerhq/hw-transport-webauthn"
import React, { ReactElement, useState } from "react"
import { ledgerUSBVendorId } from "@ledgerhq/devices"
import { LedgerProductDatabase } from "@tallyho/tally-background/services/ledger"
import LedgerPanelContainer from "../../components/Ledger/LedgerPanelContainer"
import BrowserTabContainer from "../../components/BrowserTab/BrowserTabContainer"
import { useBackgroundDispatch, useBackgroundSelector } from "../../hooks"
import LedgerConnectPopup from "./LedgerConnectPopup"
import LedgerImportDone from "./LedgerImportDone"
import LedgerImportAccounts from "./LedgerImportAccounts"
import LedgerPrepare from "./LedgerPrepare"

const filters = Object.values(LedgerProductDatabase).map(
  ({ productId }): USBDeviceFilter => ({
    vendorId: ledgerUSBVendorId,
    productId,
  })
)

export default function Ledger(): ReactElement {
  const [phase, setPhase] = useState<
    "0-prepare" | "1-request" | "2-connect" | "3-done"
  >("0-prepare")
  const deviceID = useBackgroundSelector(
    (state) => state.ledger.currentDeviceID
  )
  const [connecting, setConnecting] = useState(false)

  const devices = useBackgroundSelector((state) => state.ledger.devices)
  const device = deviceID === null ? null : devices[deviceID] ?? null

  const usbDeviceCount = useBackgroundSelector(
    (state) => state.ledger.usbDeviceCount
  )

  const dispatch = useBackgroundDispatch()
  const connectionError = phase === "2-connect" && !device && !connecting
  return (
    <BrowserTabContainer>
      {(phase === "0-prepare" || connectionError) && (
        <LedgerPrepare
          initialScreen={phase === "0-prepare"}
          deviceCount={usbDeviceCount}
          onContinue={async () => {
            // setPhase("1-request")
            try {
              // wutwutwutf
              // Open popup for testing
              // TODO: use result (for multiple devices)?
              // const transport = await TransportWebAuthn.create()
              // transport.setScrambleKey("w0w")
              // const r = await transport.send(0xb0, 0x01, 0x00, 0x00)
              // console.log(r)
              // let i = 0
              // for (; i < r.length; ) {
              //   const format = r[i++]
              //   console.log("i: ", i)
              //   console.log("format: ", format)
              // }
              // console.log("t-pp")
              // await navigator.usb.requestDevice({
              //   filters,
              // })
              await new Promise((resolve) => setTimeout(resolve, 1000))
            } catch {
              // Timeout is needed to respond to clicks to,
              // e.g., "I don't see my device".
              // Without a timeout, the DOM is updated
              // before firing clicks outside the popup.
              await new Promise((resolve) => setTimeout(resolve, 100))

              // We don't handle the error here but let
              // connectLedger fail later.
            }

            // setPhase("2-connect")

            setConnecting(true)
            try {
              await dispatch(connectLedger())
            } finally {
              setConnecting(false)
            }
          }}
        />
      )}
      {phase === "1-request" && <LedgerConnectPopup />}
      {phase === "2-connect" && !device && connecting && (
        <LedgerPanelContainer
          indicatorImageSrc="/images/connect_ledger_indicator_disconnected.svg"
          heading="Connecting..."
        />
      )}
      {phase === "2-connect" && device && (
        <LedgerImportAccounts
          device={device}
          onConnect={() => {
            setPhase("3-done")
          }}
        />
      )}
      {phase === "3-done" && (
        <LedgerImportDone
          onClose={() => {
            window.close()
          }}
        />
      )}
    </BrowserTabContainer>
  )
}
