import { StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"

import { AdvancedSsrFixture } from "./advanced-fixture"
import { Hydrated } from "./hydrated"

// サーバーで描画した Advanced Components の HTML を Hydration する。
// 不一致などの回復可能なエラーを window.__ssrErrors に記録する（型は client.tsx で宣言している）。
window.__ssrErrors = []
hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <Hydrated>
      <AdvancedSsrFixture />
    </Hydrated>
  </StrictMode>,
  {
    onRecoverableError: (error) => window.__ssrErrors.push(String(error)),
    onCaughtError: (error) => window.__ssrErrors.push(String(error)),
    onUncaughtError: (error) => window.__ssrErrors.push(String(error)),
  }
)
