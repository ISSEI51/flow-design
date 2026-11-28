import { fileURLToPath } from "node:url"

import type { WorkerInfo } from "@playwright/test"
import { createServer, type ViteDevServer } from "vite"

// SSR の検品で使う Vite のサーバー（middlewareMode）を作る。すべての SSR の spec で共通にする。
//
// - ws: false：WebSocket のサーバーを起動しない。hmr: false だけでは、middlewareMode の Vite は
//   HMR の WebSocket のサーバーを既定のポート 24678 で起動する（Vite 8.3.8 で確認。lsof で *:24678 を listen する）。
//   同時に動く複数の SSR の spec、複数の worktree が同じポートを取り合わないようにする。SSR の検品は
//   ssrLoadModule と renderToString だけを使い、HMR を使わないため、検品の対象は変わらない。
// - cacheDir：spec の名前と project ごとに分ける。同じ spec は desktop と mobile などの project で別のワーカーが
//   同時に実行するため、spec ごとのキャッシュだけでは同時に書き込む。検品の開発サーバー（webServer）の
//   キャッシュ（node_modules/.vite-test）とも分ける。名前は固定で、実行のたびに増えない。
export function createSsrServer(name: string, workerInfo: WorkerInfo): Promise<ViteDevServer> {
  const project = workerInfo.project.name.replace(/[^a-z0-9-]/gi, "_")
  return createServer({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    cacheDir: fileURLToPath(new URL(`../../node_modules/.vite-ssr/${name}-${project}`, import.meta.url)),
  })
}
