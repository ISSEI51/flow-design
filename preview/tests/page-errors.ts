import type { Page, TestInfo, TestType } from "@playwright/test"

// ページで捕捉されなかった例外と、コンソールのエラーを記録する。
// 例外が起きた場合は、次を JSON で添付し（test-results/）、標準出力にも 1 行で出す。
//   テスト名、project、ブラウザとバージョン、URL、例外の文とスタック、
//   window の error イベントのファイル名と行、コンソールのログ、発生時に開いていた Overlay、
//   座標が有限でないポインターのイベント
// 捕捉されなかった例外は、classifyPageErrors が「確認済みの環境の事象」と判定したものを除き、テストを失敗にする。
// 判定したものも、記録と注記（annotation）には必ず残す。

export type NonFiniteEvent = {
  type: string
  constructorName: string
  isTrusted: boolean
  pointerType: string | null
  // JSON では NaN と Infinity を表せないため、文字列で持つ
  clientX: string
  clientY: string
  target: string
}

export type ErrorRecord = {
  kind: "pageerror" | "window-error" | "unhandledrejection" | "console" | "non-finite-event"
  message: string
  stack?: string
  filename?: string
  line?: number
  column?: number
  url?: string
  hash?: string
  overlays?: string[]
  event?: NonFiniteEvent
  time: number
}

declare global {
  interface Window {
    __fdErrors?: ErrorRecord[]
  }
}

// ---------------------------------------------------------------- 確認済みの環境の事象
// WebKit が、座標が NaN の信頼されたポインターのイベントを <html> に発生させ、Playwright がクリックの対象を
// 確かめる処理（注入スクリプトの expectHitTarget）の elementsFromPoint が TypeError を出す。
// 調査の記録は docs/web/components/overlays.md の「ページの例外の記録」。
// 条件を広げない。Playwright や WebKit の版を上げたときは、事象を確かめ直してから WEBKIT_VERSION を更新する。
export const WEBKIT_VERSION = /^27\./
const NON_FINITE_MESSAGE = /^(TypeError: )?The provided value is non-finite$/
const HIT_TARGET_EVENTS = new Set(["pointerdown", "pointerup", "click", "mousedown", "mouseup"])
// 例外は、記録したイベントと同じイベントの処理の中で起きる。window の error は 5ms 以内、
// pageerror（Playwright が Node 側で受け取る同じ例外）は 50ms 以内とする。
const WINDOW_ERROR_WINDOW_MS = 5
const PAGEERROR_WINDOW_MS = 50

// スタックが、Playwright の注入スクリプトの expectHitTarget の中の elementsFromPoint で起きたことを示すか。
// 製品やライブラリのコード（http(s):// の URL を持つフレーム）を含む場合は該当しない。
function isHitTargetStack(stack: string | undefined) {
  if (!stack) return false
  if (/https?:\/\//.test(stack)) return false
  const frames = stack
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !NON_FINITE_MESSAGE.test(l))
  const names = frames.map((f) => f.replace(/^at /, "").split(/[@ (]/)[0])
  return names[0] === "elementsFromPoint" && names[1] === "expectHitTarget"
}

function isNonFinitePointerEvent(r: ErrorRecord) {
  const e = r.event
  if (r.kind !== "non-finite-event" || !e) return false
  const finite = (v: string) => Number.isFinite(Number(v))
  return (
    e.isTrusted &&
    HIT_TARGET_EVENTS.has(e.type) &&
    (e.constructorName === "PointerEvent" || e.constructorName === "MouseEvent") &&
    (!finite(e.clientX) || !finite(e.clientY))
  )
}

export type Classification = {
  environment: ErrorRecord[]
  unexplained: ErrorRecord[]
}

// 捕捉されなかった例外を、確認済みの環境の事象（environment）と、それ以外（unexplained）に分ける。
export function classifyPageErrors(list: ErrorRecord[], browserName: string, browserVersion: string): Classification {
  const uncaught = list.filter((r) => r.kind === "pageerror" || r.kind === "window-error" || r.kind === "unhandledrejection")
  if (browserName !== "webkit" || !WEBKIT_VERSION.test(browserVersion)) return { environment: [], unexplained: uncaught }
  const events = list.filter(isNonFinitePointerEvent)
  const environment: ErrorRecord[] = []
  const windowErrors = uncaught.filter(
    (r) =>
      r.kind === "window-error" &&
      NON_FINITE_MESSAGE.test(r.message) &&
      isHitTargetStack(r.stack) &&
      (r.filename === undefined || r.filename === "" || r.filename === "undefined") &&
      events.some((e) => r.time - e.time >= 0 && r.time - e.time <= WINDOW_ERROR_WINDOW_MS)
  )
  environment.push(...windowErrors)
  // pageerror は、判定した window の error と同じ例外の重複に限る（件数も超えない）
  const pageErrors = uncaught.filter(
    (r) =>
      r.kind === "pageerror" &&
      NON_FINITE_MESSAGE.test(r.message) &&
      isHitTargetStack(r.stack) &&
      windowErrors.some((w) => Math.abs(r.time - w.time) <= PAGEERROR_WINDOW_MS)
  )
  environment.push(...pageErrors.slice(0, windowErrors.length))
  return { environment, unexplained: uncaught.filter((r) => !environment.includes(r)) }
}

// 開いている Overlay の data-slot（dialog-content、sheet-content など）
const OVERLAY_SELECTOR =
  "[data-open][data-slot$=content], [data-open][data-slot=drawer-popup], [data-slot=toast], [role=listbox], [role=tooltip]"

export function collectPageErrors(test: TestType<any, any>) {
  const records = new WeakMap<TestInfo, ErrorRecord[]>()

  test.beforeEach(async ({ page }: { page: Page }, info: TestInfo) => {
    const list: ErrorRecord[] = []
    records.set(info, list)
    await page.addInitScript((selector) => {
      window.__fdErrors = []
      const overlaysNow = () =>
        Array.from(document.querySelectorAll(selector)).map(
          (el) => el.getAttribute("data-slot") ?? el.getAttribute("role") ?? el.tagName
        )
      // window の error イベントは、発生したファイルと行を持つ。pageerror と重ねて記録する。
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
      // 座標が有限でないポインターのイベント。初期化スクリプトのリスナーは Playwright のリスナーより先に呼ばれる。
      for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "auxclick", "dblclick", "contextmenu", "mousemove", "touchstart", "touchend", "touchcancel"]) {
        window.addEventListener(
          type,
          (e) => {
            const p = "touches" in e ? (e as TouchEvent).touches[0] : (e as MouseEvent)
            if (!p || (Number.isFinite(p.clientX) && Number.isFinite(p.clientY))) return
            const t = e.target as Element | null
            const event = {
              type,
              constructorName: e.constructor.name,
              isTrusted: e.isTrusted,
              pointerType: (e as PointerEvent).pointerType ?? null,
              clientX: String(p.clientX),
              clientY: String(p.clientY),
              target: `${t?.tagName ?? "-"}[${t?.getAttribute?.("data-slot") ?? t?.getAttribute?.("data-testid") ?? ""}]`,
            }
            window.__fdErrors!.push({
              kind: "non-finite-event",
              message: `${type} ${event.constructorName} trusted=${event.isTrusted} pointerType=${event.pointerType} client=(${event.clientX}, ${event.clientY}) target=${event.target}`,
              event,
              time: Date.now(),
              hash: location.hash,
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
    }, OVERLAY_SELECTOR)
    page.on("pageerror", async (e) => {
      const record: ErrorRecord = { kind: "pageerror", message: String(e), stack: e.stack, url: page.url(), time: Date.now() }
      list.push(record)
      record.overlays = await page
        .evaluate((selector) => Array.from(document.querySelectorAll(selector)).map((el) => el.getAttribute("data-slot") ?? el.tagName), OVERLAY_SELECTOR)
        .catch(() => ["(取得できない)"])
    })
    page.on("console", (m) => {
      if (m.type() !== "error") return
      list.push({ kind: "console", message: m.text(), url: page.url(), time: Date.now() })
    })
  })

  test.afterEach(async ({ page, browser, browserName }: { page: Page; browser: { version(): string }; browserName: string }, info: TestInfo) => {
    const list = records.get(info) ?? []
    const fromWindow = await page.evaluate(() => window.__fdErrors ?? []).catch(() => [] as ErrorRecord[])
    for (const r of fromWindow) list.push({ ...r, url: page.url() })
    if (list.length === 0) return
    const version = browser.version()
    const { environment, unexplained } = classifyPageErrors(list, browserName, version)
    const report = {
      test: info.titlePath.join(" › "),
      project: info.project.name,
      browser: `${browserName} ${version}`,
      retry: info.retry,
      environment: environment.length,
      unexplained: unexplained.length,
      errors: list,
    }
    await info.attach("page-errors.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" })
    console.log(`PAGE-ERRORS ${JSON.stringify(report)}`)
    const events = list.filter((r) => r.kind === "non-finite-event").length
    if (events > 0 || environment.length > 0) {
      info.annotations.push({
        type: "webkit-non-finite-pointer-event",
        description: `座標が有限でないイベント ${events} 件、そのうえで Playwright の expectHitTarget で起きた例外 ${environment.length} 件（${browserName} ${version}）`,
      })
    }
    // コンソールのエラーは記録だけにする。説明できない例外はテストを失敗にする。
    if (unexplained.length > 0) {
      throw new Error(`ページで捕捉されなかった例外：${unexplained.map((r) => r.message).join(" / ")}`)
    }
  })
}
