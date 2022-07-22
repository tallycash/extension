import React, { ReactElement } from "react"
import { useHistory } from "react-router-dom"
import { isLedgerSupported } from "@tallyho/tally-background/services/ledger"
import SharedButton from "../../components/Shared/SharedButton"
import SharedIcon from "../../components/Shared/SharedIcon"

const accountCreateButtonInfos = [
  {
    title: "Add existing accounts",
    items: [
      {
        label: "Import recovery phrase",
        icon: "./images/add_wallet/import.svg",
        url: "/onboarding/import-metamask",
        isAvailable: true,
      },
      {
        label: "Connect to Ledger",
        icon: "./images/add_wallet/ledger.svg",
        onClick: () => {
          window.open("/tab.html#/ledger", "_blank")?.focus()
          window.close()
        },
        isAvailable: isLedgerSupported,
      },
      {
        label: "Read-only address",
        icon: "./images/add_wallet/preview.svg",
        url: "/onboarding/view-only-wallet",
        isAvailable: true,
      },
      {
        label: "Off-chain Account",
        icon: "./images/add_wallet/bank.svg",
        url: "/onboarding/off-chain-account",
        isAvailable: true,
      },
    ],
  },
  {
    title: "Add new recovery phrase",
    items: [
      {
        label: "Create new wallet",
        icon: "./images/add_wallet/create_tally.svg",
        url: "/onboarding/onboarding-interstitial-create-phrase",
        isAvailable: true,
      },
    ],
  },
]

function AddWalletRow({
  icon,
  url,
  children,
  onClick,
}: {
  icon: string
  children: React.ReactNode
  url?: string
  onClick?: () => void
}) {
  return (
    <li>
      <SharedButton
        type="unstyled"
        size="medium"
        linkTo={url}
        onClick={onClick}
      >
        <div className="option standard_width">
          <div className="left">
            <img
              className="icon preview_icon"
              src={icon}
              alt={`${icon} icon`}
            />
            {children}
          </div>

          <div className="icon_chevron_right" />
          <SharedIcon
            icon="chevron_right.svg"
            width={16}
            color="var(--green-40)"
          />
        </div>
      </SharedButton>
      <style jsx>{`
        .left {
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
          color: var(--green-40);
          font-size: 18px;
          font-weight: 600;
          line-height: 24px;
          justify-content: space-between;
        }
        .option:hover {
          background-color: var(--green-80);
        }
        .icon {
          width: 32px;
          height: 32px;
          background-color: var(--gold-20);
          border-radius: 8px;
          margin-right: 10px;
        }
      `}</style>
    </li>
  )
}

export default function OnboardingStartTheHunt(): ReactElement {
  const history = useHistory()

  return (
    <section className="start_wrap">
      <div className="top standard_width">
        <h1>Add accounts</h1>
        <button
          type="button"
          aria-label="close"
          className="icon_close"
          onClick={() => {
            history.push("/")
          }}
        />
      </div>
      <div className="button_sections_wrap">
        {accountCreateButtonInfos.map((creationSection) => {
          return (
            <section>
              <h2>{creationSection.title}</h2>
              <ul>
                {creationSection.items.map(
                  ({ label, icon, url, isAvailable, onClick }) =>
                    isAvailable ? (
                      <AddWalletRow icon={icon} url={url} onClick={onClick}>
                        {label}
                      </AddWalletRow>
                    ) : (
                      <></>
                    )
                )}
              </ul>
            </section>
          )
        })}
      </div>

      <style jsx>
        {`
          section,
          ul {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          .start_wrap {
            padding-top: 15px;
            background-color: var(--hunter-green);
          }
          .button_sections_wrap {
            height: 500px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .top {
            display: flex;
            width: 100%;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 5px;
          }
          h1 {
            color: #fff;
            font-size: 22px;
            font-weight: 500;
            line-height: 32px;
          }
          h2 {
            width: 100%;
            margin-bottom: 16px;
            display: block;
            color: var(--green-40);
            font-size: 16px;
            line-height: 24px;
            display: flex;
            align-items: center;
          }
          .icon_close {
            mask-image: url("./images/close.svg");
            mask-size: cover;
            width: 11px;
            height: 11px;
            background-color: var(--green-40);
            margin-right: 10px;
            margin-top: 2px;
          }
          .icon_close:hover {
            background-color: var(--green-20);
          }
        `}
      </style>
    </section>
  )
}
