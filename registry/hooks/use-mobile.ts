"use client"

import * as React from "react"

// shadcn/ui の use-mobile と同じ名前と役割。Tailwind CSS の md（48rem）未満をモバイルとみなす。
// - 判定は CSS の md と同じ単位（rem）と境界にする。px で判定すると、ブラウザの文字サイズの設定を
//   大きくしたときに CSS と判定がずれ、Sidebar がどちらの表示にもならない幅ができるため。
// - サーバーでの描画と Hydration の間は false（デスクトップ）を返す。Hydration の後に、ブラウザの値で描画し直す。
const MOBILE_QUERY = "not all and (min-width: 48rem)"

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  )
}
