import { isAllowedQueryParamPage } from "@tallyho/provider-bridge-shared"
import { PERSIST_UI_LOCATION } from "@tallyho/tally-background/features/features"
import { popupMonitorPortName } from "@tallyho/tally-background/main"
import {
  Location,
  setRouteHistoryEntries,
} from "@tallyho/tally-background/redux-slices/ui"
import classNames from "classnames"
import React, { ReactElement, useEffect, useRef } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { Provider } from "react-redux"
import {
  matchPath,
  MemoryRouter as Router,
  useHistory,
  useLocation,
} from "react-router-dom"
import { CSSTransition, TransitionGroup } from "react-transition-group"
import { Store } from "webext-redux"
import { runtime } from "webextension-polyfill"
import Snackbar from "../components/Snackbar/Snackbar"
import TabBar from "../components/TabBar/TabBar"
import TopMenu from "../components/TopMenu/TopMenu"
import {
  useBackgroundDispatch,
  useBackgroundSelector,
  useIsDappPopup,
} from "../hooks"
import pageList from "../routes/routes"
import tabs from "../utils/tabs"
import ErrorFallback from "./ErrorFallback"

function transformLocation(inputLocation: Location): Location {
  // The inputLocation is not populated with the actual query string — even though it should be
  // so I need to grab it from the window
  const params = new URLSearchParams(window.location.search)
  const maybePage = params.get("page")

  let { pathname } = inputLocation
  if (
    isAllowedQueryParamPage(maybePage) &&
    !inputLocation.pathname.includes("/keyring/")
  ) {
    pathname = maybePage
  }

  return {
    ...inputLocation,
    pathname,
  }
}

function useConnectPopupMonitor() {
  useEffect(() => {
    const port = runtime.connect(undefined, { name: popupMonitorPortName })

    return () => {
      port.disconnect()
    }
  }, [])
}

function PopupPageSwitcher() {
  const location = useLocation()
  const history = useHistory()

  const dispatch = useBackgroundDispatch()

  const renderCount = useRef(0)

  const { entries } = history as unknown as {
    entries: {
      state: {
        isBack: boolean
      }
      pathname: string
    }[]
  }

  const transformedLocation = transformLocation(location)

  const locationName = location.pathname.split("/")[1]
  const prevLocationName =
    (entries &&
      entries[entries.length - 2] &&
      entries[entries.length - 2].pathname.split("/")[1]) ||
    ""

  const isGoingBetweenTabs =
    tabs.includes(locationName) && tabs.includes(prevLocationName)

  const isGoingToATabLeftOfTab =
    tabs.includes(locationName) &&
    tabs.indexOf(locationName) < tabs.indexOf(prevLocationName)

  const isGoingBack =
    entries &&
    entries[entries.length - 1] &&
    entries[entries.length - 1]?.state?.isBack === true

  const isDirectionRight =
    isGoingBack || (isGoingBetweenTabs && isGoingToATabLeftOfTab)

  const normalizedPathname =
    transformedLocation.pathname !== "/wallet"
      ? transformedLocation.pathname
      : "/"

  const currentPage = pageList.find(
    ({ path }) => matchPath(normalizedPathname, { path }) !== null
  )

  if (!currentPage) throw new Error(`no current page`)

  const { path, Component, hasTabBar, hasTopBar, persistOnClose } = currentPage

  useEffect(() => {
    if (PERSIST_UI_LOCATION && persistOnClose) {
      const isNotOnKeyringRelatedPage =
        entries[entries.length - 1].pathname !== "/sign-transaction" &&
        !entries[entries.length - 1].pathname.includes("/keyring/")

      // Initial extension load takes two renders because of setting
      // animation control states. `initialEntries` needs to be a reversed
      // version of route history entities. Without avoiding the initial load,
      // entries will keep reversing.
      if (renderCount.current > 1 && isNotOnKeyringRelatedPage) {
        dispatch(
          setRouteHistoryEntries(
            entries
              .reduce((agg: Partial<Location>[], entry) => {
                const { hash, key, ...entryCopy } = entry as Partial<Location>
                agg.push(entryCopy)
                return agg
              }, [])
              .reverse()
          )
        )
      }
    }

    renderCount.current += 1
  }, [dispatch, entries, persistOnClose])

  return (
    <>
      <TransitionGroup className="transition_group_container">
        {hasTopBar && (
          <CSSTransition timeout={3000} classNames="page-transition">
            <div className="top_menu_wrap">
              <TopMenu />
            </div>
          </CSSTransition>
        )}
      </TransitionGroup>
      <TransitionGroup className="transition_group_container">
        <CSSTransition key={path} timeout={3000} classNames="page-transition">
          <main className={classNames({ has_top_bar: hasTopBar })}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Component location={transformedLocation} />
            </ErrorBoundary>
            <Snackbar />
          </main>
        </CSSTransition>
      </TransitionGroup>
      <TransitionGroup className="transition_group_container">
        <CSSTransition key={path} timeout={3000} classNames="page-transition">
          <main className={classNames({ has_top_bar: hasTopBar })}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Component location={transformedLocation} />
            </ErrorBoundary>
            <Snackbar />
          </main>
        </CSSTransition>
      </TransitionGroup>
      {hasTabBar && (
        <div className="tab_bar_wrap">
          <TabBar />
        </div>
      )}
      {/* Global style is needed as TransitionGroup is not scoped. */}
      <style jsx global>{`
        .transition_group_container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
        }
      `}</style>
      <style jsx global>{`
        .page-transition-enter {
          opacity: 0.3;
          transform: ${isDirectionRight
            ? `translateX(-7px)`
            : `translateX(7px)`};
          z-index: 2;
        }
        .page-transition-enter-active {
          opacity: 1;
          transform: translateX(0px);
          transition: transform cubic-bezier(0.25, 0.4, 0.55, 1.4) 250ms,
            opacity 250ms;
        }
        .page-transition-enter-done {
          z-index: 2;
        }
        .page-transition-exit {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          opacity: 1;
          transform: translateX(0px);
          transition: transform cubic-bezier(0.25, 0.4, 0.55, 1.4) 250ms,
            opacity 250ms;
          z-index: 1;
        }
        .page-transition-exit-active {
          opacity: 0;
          transform: ${isDirectionRight
            ? `translateX(7px)`
            : `translateX(-7px)`};
        }
      `}</style>
      <style jsx>{`
        main {
          width: 100%;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          flex-grow: 1;
          margin: 0 auto;
          align-items: center;
          background-color: var(--hunter-green);
          height: 100vh;
          margin-top: 0px;
        }
        main.has_top_bar {
          height: 480px;
          margin-top: 64px;
        }
        .tab_bar_wrap {
          position: fixed;
          bottom: 0px;
          z-index: 10;
          width: 100%;
        }
        .top_menu_wrap {
          margin: 0 auto;
          width: max-content;
          display: block;
          justify-content: center;
          margin-top: 5px;
          background-color: var(--hunter-green);
        }
      `}</style>
    </>
  )
}

export function Main(): ReactElement {
  const isDappPopup = useIsDappPopup()

  const routeHistoryEntries = useBackgroundSelector(
    (state) => state.ui.routeHistoryEntries
  )

  useConnectPopupMonitor()

  useEffect(() => {
    document.body.classList.toggle("dapp", isDappPopup)
  }, [isDappPopup])

  return (
    <>
      <div className="community_edition_label">Community Edition</div>
      <Router initialEntries={routeHistoryEntries}>
        <PopupPageSwitcher />
      </Router>
      <style jsx>{`
        .community_edition_label {
          width: 140px;
          height: 20px;
          left: 24px;
          position: fixed;
          background-color: var(--gold-60);
          color: var(--hunter-green);
          font-weight: 500;
          text-align: center;
          border-bottom-left-radius: 4px;
          border-bottom-right-radius: 4px;
          font-size: 14px;
          z-index: 1000;
          top: 0px;
        }
      `}</style>
    </>
  )
}

export default function Popup({ store }: { store: Store }): ReactElement {
  return (
    <Provider store={store}>
      <Main />
    </Provider>
  )
}
