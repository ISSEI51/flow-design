import type { Page, TestInfo, TestType } from "@playwright/test"

// ページで捕捉されなかった例外と、コンソールのエラーを記録する。
// 例外が起きた場合は、次を JSON で添付し（test-results/）、標準出力にも 1 行で出し、テストを失敗にする。
//   テスト名、project、ブラウザとバージョン、URL、例外の文とスタック、
//   window の error イベントのファイル名と行、コンソールのログ、開いている Overlay
// 例外を除外して成功にはしない。

type ErrorRecord = {
  hash?: string
  kind: "pageerror" | "window-error" | "unhandledrejection" | "console" | "non-finite-event"
  message: string
  stack?: string
  filename?: string
  line?: number
  column?: number
  url: string
  overlays?: string[]
  time: number
}

declare global {
  interface Window {
    __fdErrors?: (Omit<ErrorRecord, "url" | "overlays"> & { overlays?: string[] })[]
  }
}

// 開いている Overlay の data-slot（dialog-content、sheet-content など）
const openOverlays = (page: Page) =>
  page
    .evaluate(() =>
      Array.from(
        document.querySelectorAll(
          "[data-open][data-slot$=content], [data-open][data-slot=drawer-popup], [data-open][data-slot=toast], [role=listbox], [role=tooltip]"
        )
      ).map((el) => el.getAttribute("data-slot") ?? el.getAttribute("role") ?? el.tagName)
    )
    .catch(() => ["(取得できない)"])

export function collectPageErrors(test: TestType<any, any>) {
  const records = new WeakMap<TestInfo, ErrorRecord[]>()

  test.beforeEach(async ({ page }: { page: Page }, info: TestInfo) => {
    const list: ErrorRecord[] = []
    records.set(info, list)
    // window の error イベントは、発生したファイルと行を持つ。pageerror と重ねて記録する。
    await page.addInitScript(() => {
      window.__fdErrors = []
      // 発生した時点で開いている Overlay（data-slot）を記録する
      const overlaysNow = () =>
        Array.from(
          document.querySelectorAll(
            "[data-open][data-slot$=content], [data-open][data-slot=drawer-popup], [data-slot=toast], [role=listbox], [role=tooltip]"
          )
        ).map((el) => el.getAttribute("data-slot") ?? el.getAttribute("role") ?? el.tagName)
      window.addEventListener("error", (e) => {
        window.__fdErrors!.push({
          kind: "window-error",
          message: String(e.message),
          stack: e.error?.stack,
          filename: e.filename,
          line: e.lineno,
          column: e.colno,
          time: Date.now(),
          overlays: overlaysNow(),
          hash: location.hash,
        })
      })
      // 座標が有限でないポインターのイベント。Playwright は操作中、イベントの座標で押した先を確かめる
      // （elementsFromPoint）。その前に記録する（初期化スクリプトのリスナーが先に呼ばれる）。
      for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "auxclick", "dblclick", "contextmenu", "mousemove", "touchstart", "touchend", "touchcancel"]) {
        window.addEventListener(
          type,
          (e) => {
            const p = "touches" in e ? (e as TouchEvent).touches[0] : (e as MouseEvent)
            if (!p || (Number.isFinite(p.clientX) && Number.isFinite(p.clientY))) return
            const t = e.target as Element | null
            window.__fdErrors!.push({
              kind: "non-finite-event",
              message: `${type} ${e.constructor.name} trusted=${e.isTrusted} pointerType=${(e as PointerEvent).pointerType ?? "-"} client=(${p.clientX}, ${p.clientY}) screen=(${(p as MouseEvent).screenX}, ${(p as MouseEvent).screenY}) target=${t?.tagName ?? "-"}[${t?.getAttribute?.("data-slot") ?? t?.getAttribute?.("data-testid") ?? ""}]`,
              time: Date.now(),
            })
          },
          true
        )
      }
      window.addEventListener("unhandledrejection", (e) => {
        window.__fdErrors!.push({
          kind: "unhandledrejection",
          message: String(e.reason?.message ?? e.reason),
          stack: e.reason?.stack,
          time: Date.now(),
        })
      })
    })
    page.on("pageerror", async (e) => {
      const record: ErrorRecord = { kind: "pageerror", message: String(e), stack: e.stack, url: page.url(), time: Date.now() }
      list.push(record)
      record.overlays = await openOverlays(page)
    })
    page.on("console", (m) => {
      if (m.type() !== "error") return
      list.push({ kind: "console", message: m.text(), url: page.url(), time: Date.now() })
    })
  })

  test.afterEach(async ({ page, browser, browserName }: { page: Page; browser: { version(): string }; browserName: string }, info: TestInfo) => {
    const list = records.get(info) ?? []
    const fromWindow = await page.evaluate(() => window.__fdErrors ?? []).catch(() => [])
    for (const r of fromWindow) list.push({ ...r, url: page.url() })
    if (list.length === 0) return
    const report = {
      test: info.titlePath.join(" › "),
      project: info.project.name,
      browser: `${browserName} ${browser.version()}`,
      retry: info.retry,
      errors: list,
    }
    await info.attach("page-errors.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" })
    console.log(`PAGE-ERRORS ${JSON.stringify(report)}`)
    // コンソールのエラーは記録だけにし、捕捉されなかった例外はテストを失敗にする。
    // 例外：WebKit が座標を持たない（NaN）信頼されたポインターのイベントを発生させ、Playwright の
    // 注入スクリプト（クリックの対象を確かめる expectHitTarget）が elementsFromPoint で例外を出したもの。
    // 製品のコードの例外ではないため、記録と注記を残して失敗にはしない（docs/web/components/overlays.md）。
    const nonFinite = list.filter((r) => r.kind === "non-finite-event")
    const isEnvironment = (r: ErrorRecord) =>
      /non-finite/.test(r.message) &&
      /expectHitTarget/.test(r.stack ?? "") &&
      nonFinite.some((e) => r.time - e.time >= 0 && r.time - e.time <= 50)
    const uncaught = list.filter((r) => r.kind !== "console" && r.kind !== "non-finite-event")
    const environment = uncaught.filter(isEnvironment)
    const unexplained = uncaught.filter((r) => !isEnvironment(r))
    if (environment.length > 0) {
      info.annotations.push({
        type: "webkit-non-finite-pointer-event",
        description: `${environment.length} 件。座標が NaN の信頼されたイベント ${nonFinite.length} 件の後に、Playwright の expectHitTarget で発生`,
      })
    }
    if (unexplained.length > 0) {
      throw new Error(`ページで捕捉されなかった例外：${unexplained.map((r) => r.message).join(" / ")}`)
    }
  })
}
