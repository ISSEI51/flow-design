// 検品の 1 段階のログ（npm run の出力）を読み、件数と記録を JSON の 1 行で出す。full-pair.sh から呼ぶ。
//
// 使い方: node scripts/verify/summarize-log.mjs <ログのファイル>
//
// 出力の項目
//   counts      Playwright の最後の集計行（passed、failed、flaky、skipped、interrupted、didNotRun）。Playwright でない段階は空
//   pageErrors  preview/tests/page-errors.ts が出す "PAGE-ERRORS {...}" の行の合計
//               （unexplained、consoleProduct は検品の失敗になるもの。environment、consoleEnvironment は記録だけ）
//   vite        Vite の開発サーバーの出力（webServer.stdout: "pipe"）のうち、検品中に起きてはならない事象の件数
//               （hmrUpdate、pageReload、depsOptimized）
//   anomalies   環境の異常の件数（V8 の異常終了、SIGABRT、開発サーバーへの接続の失敗、ポートの使用中）
import { readFileSync } from "node:fs"

const file = process.argv[2]
if (!file) {
  console.error("usage: node summarize-log.mjs <log>")
  process.exit(2)
}
const text = readFileSync(file, "utf8")
const lines = text.split("\n")

const counts = {}
const names = { passed: "passed", failed: "failed", flaky: "flaky", skipped: "skipped", interrupted: "interrupted", "did not run": "didNotRun" }
for (const line of lines) {
  const m = /^\s+(\d+) (passed|failed|flaky|skipped|interrupted|did not run)\b/.exec(line)
  if (m) counts[names[m[2]]] = Number(m[1])
}

const pageErrors = { reports: 0, unexplained: 0, consoleProduct: 0, environment: 0, consoleEnvironment: 0 }
for (const line of lines) {
  const i = line.indexOf("PAGE-ERRORS {")
  if (i < 0) continue
  try {
    const r = JSON.parse(line.slice(i + "PAGE-ERRORS ".length))
    pageErrors.reports += 1
    for (const k of ["unexplained", "consoleProduct", "environment", "consoleEnvironment"]) pageErrors[k] += Number(r[k] ?? 0)
  } catch {
    pageErrors.reports += 1
    pageErrors.unparsed = (pageErrors.unparsed ?? 0) + 1
  }
}

const count = (re) => lines.filter((l) => re.test(l)).length
const vite = {
  hmrUpdate: count(/\bhmr update\b/i),
  pageReload: count(/\bpage reload\b/i),
  depsOptimized: count(/new dependencies optimized|optimized dependencies changed/i),
}
const anomalies = {
  v8Fatal: count(/Lazy deopt after a fast API call|Fatal error in|FATAL ERROR/),
  sigabrt: count(/SIGABRT/),
  connectionRefused: count(/ERR_CONNECTION_REFUSED|Could not connect to the server/),
  portInUse: count(/is already used|EADDRINUSE|Port \d+ is in use/),
}
process.stdout.write(JSON.stringify({ counts, pageErrors, vite, anomalies }))
