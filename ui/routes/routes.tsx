import React, { ReactElement } from "react"
import Wallet from "../pages/Wallet"
import SignTransaction from "../pages/SignTransaction"
import SignData from "../pages/SignData"
import PersonalSign from "../pages/PersonalSign"
import OnboardingSaveSeed from "../pages/Onboarding/OnboardingSaveSeed"
import OnboardingVerifySeed from "../pages/Onboarding/OnboardingVerifySeed"
import OnboardingImportMetamask from "../pages/Onboarding/OnboardingImportMetamask"
import OnboardingViewOnlyWallet from "../pages/Onboarding/OnboardingViewOnlyWallet"
import OnboardingInfoIntro from "../pages/Onboarding/OnboardingInfoIntro"
import OnboardingAddWallet from "../pages/Onboarding/OnboardingAddWallet"
import OnboardingInterstitialCreatePhrase from "../pages/Onboarding/OnboardingInterstitialCreatePhrase"
import Overview from "../pages/Overview"
import SingleAsset from "../pages/SingleAsset"
import Earn from "../pages/Earn"
import EarnDeposit from "../pages/EarnDeposit"
import Menu from "../pages/Settings"
import Send from "../pages/Send"
import Swap from "../pages/Swap"
import { Trade } from "../pages/Trade"
import DAppPermissionRequest from "../pages/DAppConnectRequest"
import KeyringUnlock from "../components/Keyring/KeyringUnlock"
import KeyringSetPassword from "../components/Keyring/KeyringSetPassword"
import Eligible from "../pages/Claiming/Eligible"
import SettingsExportLogs from "../pages/Settings/SettingsExportLogs"
import OnboardingOffChainAccount from "../pages/Onboarding/OnboardingOffChainAccount"

interface PageList {
  path: string
  // Tricky to handle all props components are
  // accepting here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: (...args: any[]) => ReactElement
  hasTabBar: boolean
  hasTopBar: boolean
  persistOnClose: boolean
}

const pageList: PageList[] = [
  {
    path: "/keyring/set-password",
    Component: KeyringSetPassword,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/keyring/unlock",
    Component: KeyringUnlock,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/singleAsset",
    Component: SingleAsset,
    hasTabBar: true,
    hasTopBar: true,
    persistOnClose: true,
  },
  {
    path: "/onboarding/import-metamask",
    Component: (): ReactElement => <OnboardingImportMetamask nextPage="/" />,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/onboarding/view-only-wallet",
    Component: OnboardingViewOnlyWallet,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/onboarding/off-chain-account",
    Component: OnboardingOffChainAccount,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/onboarding/info-intro",
    Component: OnboardingInfoIntro,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/onboarding/add-wallet",
    Component: OnboardingAddWallet,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/sign-transaction",
    Component: SignTransaction,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/sign-data",
    Component: SignData,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/personal-sign",
    Component: PersonalSign,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: true,
  },
  {
    path: "/overview",
    Component: Overview,
    hasTabBar: true,
    hasTopBar: false,
    persistOnClose: true,
  },
  {
    path: "/earn/deposit",
    Component: EarnDeposit,
    hasTabBar: true,
    hasTopBar: true,
    persistOnClose: true,
  },
  {
    path: "/earn",
    Component: Earn,
    hasTabBar: true,
    hasTopBar: true,
    persistOnClose: true,
  },
  {
    path: "/settings/export-logs",
    Component: SettingsExportLogs,
    hasTabBar: true,
    hasTopBar: false,
    persistOnClose: true,
  },
  {
    path: "/settings",
    Component: Menu,
    hasTabBar: true,
    hasTopBar: false,
    persistOnClose: true,
  },
  {
    path: "/send",
    Component: Send,
    hasTabBar: true,
    hasTopBar: true,
    persistOnClose: true,
  },
  {
    path: "/swap",
    Component: Swap,
    hasTabBar: true,
    hasTopBar: true,
    persistOnClose: true,
  },
  {
    path: "/trade",
    Component: Trade,
    hasTabBar: true,
    hasTopBar: true,
    persistOnClose: true,
  },
  {
    path: "/dapp-permission",
    Component: DAppPermissionRequest,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/onboarding/save-seed",
    Component: OnboardingSaveSeed,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/onboarding/verify-seed",
    Component: OnboardingVerifySeed,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/onboarding/onboarding-interstitial-create-phrase",
    Component: OnboardingInterstitialCreatePhrase,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: false,
  },
  {
    path: "/eligible",
    Component: Eligible,
    hasTabBar: false,
    hasTopBar: false,
    persistOnClose: true,
  },
  {
    path: "/",
    Component: Wallet,
    hasTabBar: true,
    hasTopBar: true,
    persistOnClose: true,
  },
]

export default pageList
