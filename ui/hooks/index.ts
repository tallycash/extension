import { isAllowedQueryParamPage } from "@tallyho/provider-bridge-shared"

import { useState, useEffect, useRef } from "react"

export * from "./redux-hooks"
export * from "./signing-hooks"
export * from "./dom-hooks"
export * from "./validation-hooks"

export function useIsDappPopup(): boolean {
  const [isDappPopup, setIsDappPopup] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const maybePage = params.get("page")

    if (isAllowedQueryParamPage(maybePage)) {
      setIsDappPopup(true)
    } else {
      setIsDappPopup(false)
    }
  }, [])

  return isDappPopup
}

export function useRunOnFirstRender(func: () => void): void {
  const isFirst = useRef(true)

  if (isFirst.current) {
    isFirst.current = false
    func()
  }
}

export function useSkipFirstRenderEffect(
  func: () => void,
  deps: unknown[] = []
): void {
  const didMount = useRef(false)

  useEffect(() => {
    if (didMount.current) func()
    else didMount.current = true
    // We are passing in the dependencies when we initialize this hook, so we can not know what it will be exactly and it's ok.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
