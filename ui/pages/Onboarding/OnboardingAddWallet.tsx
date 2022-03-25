import React, { ReactElement } from "react"
import {
  HIDE_ADD_SEED,
  HIDE_CREATE_PHRASE,
  HIDE_IMPORT_TREZOR,
} from "@tallyho/tally-background/features/features"
import { isLedgerSupported } from "@tallyho/tally-background/services/ledger"
import SharedBackButton from "../../components/Shared/SharedBackButton"
import SharedButton from "../../components/Shared/SharedButton"

export default function OnboardingStartTheHunt(): ReactElement {
  return (
    <section className="start_wrap">
      <div className="top">
        <SharedBackButton />
        <div className="wordmark" />
      </div>
      <h1 className="serif_header">Add Wallet</h1>
      <div className="subtitle subtitle_hunt">
        Let&apos;s set Tally Ho up with a wallet. Select with what wallet you
        would like to continue.
      </div>
      <ul>
        <li className="label_small">Use an existing wallet</li>
        <li className="option standard_width">
          <div className="icon preview_icon" />
          <SharedButton
            type="tertiary"
            size="medium"
            linkTo="/onboarding/view-only-wallet"
          >
            Preview an address
          </SharedButton>
        </li>
        {HIDE_ADD_SEED ? (
          <></>
        ) : (
          <li className="option standard_width">
            <div className="icon metamask_icon" />
            <SharedButton
              type="tertiary"
              size="medium"
              linkTo="/onboarding/import-metamask"
            >
              Import recovery phrase
            </SharedButton>
          </li>
        )}
        {isLedgerSupported && (
          <li className="option standard_width">
            <div className="icon ledger_icon" />
            <SharedButton
              type="tertiary"
              size="medium"
              onClick={() => {
                window.open("/tab.html#/ledger", "_blank")?.focus()
                window.close()
              }}
            >
              Connect to a Ledger
            </SharedButton>
          </li>
        )}
        {HIDE_IMPORT_TREZOR ? (
          <></>
        ) : (
          <li className="option standard_width">
            <div className="icon ledger_icon" />
            <SharedButton
              type="tertiary"
              size="medium"
              onClick={() => {
                window.open("/tab.html#/trezor", "_blank")?.focus()
                window.close()
              }}
            >
              Connect to a Trezor
            </SharedButton>
          </li>
        )}
        {HIDE_CREATE_PHRASE ? (
          <></>
        ) : (
          <>
            <li className="label_small">Start Fresh</li>
            <li className="option standard_width">
              <div className="icon tally_icon" />
              <SharedButton
                type="secondary"
                size="medium"
                linkTo="/onboarding/onboarding-interstitial-create-phrase"
              >
                Create new wallet
              </SharedButton>
            </li>
          </>
        )}
      </ul>
      <style jsx>
        {`
          section {
            padding-top: 25px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background-color: var(--hunter-green);
          }
          .top {
            display: flex;
            width: 100%;
          }
          .wordmark {
            background: url("./images/wordmark@2x.png");
            background-size: cover;
            width: 95px;
            height: 25px;
            position: absolute;
            left: 0px;
            right: 0px;
            margin: 0 auto;
          }
          h1 {
            margin-top: 26px;
          }
          .subtitle {
            color: var(--green-60);
            margin-bottom: 32px;
          }
          .subtitle_hunt {
            width: 307px;
            text-align: center;
            line-height: 24px;
          }
          .label_small {
            margin-bottom: 16px;
            display: block;
            color: var(--green-40);
            font-size: 16px;
            font-weight: 400;
            line-height: 24px;
            display: flex;
            align-items: center;
          }
          .option {
            display: flex;
            height: 64px;
            border-radius: 16px;
            background-color: var(--green-95);
            align-items: center;
            padding: 16px;
            box-sizing: border-box;
            margin-bottom: 24px;
            justify-content: space-between;
          }
          .icon {
            width: 36px;
            height: 36px;
            background-color: var(--gold-20);
            border-radius: 50%;
          }
          .tally_icon {
            background: url("./images/tally_circle_icon@2x.png");
            background-size: cover;
          }
          .metamask_icon {
            background: url("./images/metamask_icon@2x.png");
            background-size: cover;
          }
          .ledger_icon {
            background: url("./images/ledger_icon@2x.png");
            background-size: cover;
          }
          .preview_icon {
            background: url("./images/preview_icon@2x.png");
            background-size: cover;
          }
        `}
      </style>
    </section>
  )
}
