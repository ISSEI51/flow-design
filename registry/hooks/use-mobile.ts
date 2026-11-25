import * as React from "react"

// shadcn/ui の use-mobile と同じ名前と役割。768px 未満をモバイルとみなす。
// 最初の描画から正しい値を返すため、useSyncExternalStore で matchMedia を読む。
const MOBILE_BREAKPOINT = 768
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(query)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}
