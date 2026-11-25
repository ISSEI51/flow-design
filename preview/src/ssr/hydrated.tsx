import { useEffect, type ReactNode } from "react"

// Hydration が終わったことを window.__ssrHydrated で知らせる。
// React 19 の Hydration は並行して進むため、hydrateRoot の呼び出しの直後ではなく、ルートの effect（コミットの後）で設定する。
export function Hydrated({ children }: { children: ReactNode }) {
  useEffect(() => {
    window.__ssrHydrated = true
  }, [])
  return children
}
