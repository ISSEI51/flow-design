import { StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"

import { SsrFixture } from "./fixture"

// サーバーで描画した HTML を Hydration する。不一致などの回復可能なエラーを window.__ssrErrors に記録する。
declare global {
  interface Window {
    __ssrErrors: string[]
    __ssrHydrated: boolean
  }
}

window.__ssrErrors = []
hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <SsrFixture />
  </StrictMode>,
  {
    onRecoverableError: (error) => window.__ssrErrors.push(String(error)),
    onCaughtError: (error) => window.__ssrErrors.push(String(error)),
    onUncaughtError: (error) => window.__ssrErrors.push(String(error)),
  }
)
window.__ssrHydrated = true
