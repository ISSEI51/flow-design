import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PREVIEW_TEST_PORT ?? 5174)

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  // registry/ のファイル（"@/..." の別名で読み込み合う）を Node.js の単体の検品で読み込めるよう、
  // すべてのファイルに preview/tsconfig.json の paths を適用する（既定ではファイルごとに最も近い tsconfig を探す）。
  tsconfig: "./tsconfig.json",
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    // WebKit の基本的な互換性の検品。@webkit を付けたテストだけを実行する。
    // Playwright の WebKit であり、実機の iOS Safari による確認ではない。
    { name: "webkit", grep: /@webkit/, use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 900 } } },
    { name: "webkit-mobile", grep: /@webkit/, use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: "npx vite --config vite.config.ts",
    env: { PREVIEW_PORT: String(port) },
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    // Vite の標準出力（依存の最適化 "new dependencies optimized"、再読み込み "page reload"、"hmr update"）も記録に残す。
    // 既定（"ignore"）では標準エラー出力だけが残り、検品中の再読み込みや再最適化の有無を後から確かめられない。
    stdout: "pipe",
  },
})
