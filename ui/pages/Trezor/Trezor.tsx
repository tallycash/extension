import TrezorConnect from "trezor-connect"
import React, { ReactElement, useState } from "react"
import LedgerPanelContainer from "../../components/Ledger/LedgerPanelContainer"
import BrowserTabContainer from "../../components/BrowserTab/BrowserTabContainer"
import { useBackgroundDispatch, useBackgroundSelector } from "../../hooks"
import LedgerConnectPopup from "../Ledger/LedgerConnectPopup"
import LedgerImportDone from "../Ledger/LedgerImportDone"
import LedgerImportAccounts from "../Ledger/LedgerImportAccounts"
import TrezorPrepare from "./TrezorPrepare"

export default function Trezor(): ReactElement {
  const [phase, setPhase] = useState<
    "0-prepare" | "1-request" | "2-connect" | "3-done"
  >("0-prepare")

  const idDerivationPath = "m/44'/60'/0'/0/0"
  const [connecting, setConnecting] = useState(false)
  const device = true
  const dispatch = useBackgroundDispatch()
  const connectionError = phase === "2-connect" && !device && !connecting
  return (
    <BrowserTabContainer>
      {(phase === "0-prepare" || connectionError) && (
        <TrezorPrepare
          onContinue={async () => {
            setPhase("1-request")

            // I'm doing something wrong here. Calling TrezorConnect.init() and then TrezorConnect.manifest()
            // does not seem to work: "no manifest specified"
            // Calling TrezorConnect.manifest() only is fine, but the popup is closed :-/
            /* 
              console.log("trezor: init");
              TrezorConnect.init({
                //connectSrc: "https://localhost:8088/",
                lazyLoad: false, // this param will prevent iframe injection until TrezorConnect.method will be called
                manifest: {
                  email: "pablo@anche.no",
                  appUrl: "https://tally.cash",
                },
                popup: false,
              })
            */

            console.log("trezor: manifest")
            TrezorConnect.manifest({
              email: "pablo@anche.no",
              appUrl: "https://tally.cash",
            })

            // This opens https://connect.trezor.io/8/popup.html
            // however the popup is closed after some seconds without leaving the possibility to enter your pin.
            //
            // The javascript console logs the following lines:
            //
            // 127.0.0.1:21325/acquire/1/null:1 "Failed to load resource: the server responded with a status of 400 (Bad Request)"
            // 127.0.0.1:21325/release/4:1 "Failed to load resource: the server responded with a status of 400 (Bad Request)"
            // 127.0.0.1:21325/listen:1 "Failed to load resource: net::ERR_CONNECTION_REFUSED"
            //
            // So it might be related to some problem with the trezor bridge?
            const result2 = await TrezorConnect.ethereumGetAddress({
              path: idDerivationPath,
            })

            console.log(result2)
            if (!result2.success) {
              throw new Error(result2.payload.error)
            }

            /*
            setPhase("2-connect")
            setConnecting(true)
            try {
              await dispatch(connectTrezor())
            } finally {
              setConnecting(false)
            }
            */
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
      {
        phase === "2-connect" && device && console.log(phase)
        /*
          <LedgerImportAccounts
            device={device}
            onConnect={() => {
              setPhase("3-done")
            }}
          />
        */
      }
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
