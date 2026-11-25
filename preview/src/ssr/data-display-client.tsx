import { StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"

import { DataDisplaySsrFixture } from "./data-display-fixture"

// Data Display の SSR の検品用。サーバーで描画した HTML を Hydration し、回復可能なエラーを window.__ssrErrors に記録する。
// window.__ssrErrors と window.__ssrHydrated の型は client.tsx で宣言している。
window.__ssrErrors = []
hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <DataDisplaySsrFixture />
  </StrictMode>,
  {
    onRecoverableError: (error) => window.__ssrErrors.push(String(error)),
    onCaughtError: (error) => window.__ssrErrors.push(String(error)),
    onUncaughtError: (error) => window.__ssrErrors.push(String(error)),
  }
)
window.__ssrHydrated = true
