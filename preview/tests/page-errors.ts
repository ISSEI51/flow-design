import type { Page, TestInfo, TestType } from "@playwright/test"

// ページの例外とコンソールのエラーの共通の検品基盤。ページを開くすべての spec で collectPageErrors(test) を呼ぶ。
//
// 記録するもの（JSON で test-results/ に添付し、標準出力にも 1 行で出す）
//   テスト名、project、ブラウザとバージョン、URL、例外の文とスタック、window の error のファイル名と行、
//   unhandled rejection、コンソールのエラー、発生時に開いていた Overlay、座標が有限でないポインターのイベント
//
// 判定
//   - 捕捉されなかった例外（pageerror、window の error、unhandled rejection）は、テストを失敗にする。
//     例外は classifyPageErrors が「確認済みの環境の事象」と判定したものだけで、判定したものも記録と注記に必ず残す。
//   - コンソールのエラーは classifyConsoleErrors で分ける。検品の環境（Vite の開発サーバーとの接続）から出たと
//     文言で確かめられるものだけを記録にとどめ、それ以外（React の警告、製品のコードの console.error など）は失敗にする。
//
// 時計
//   検品の時刻は、製品のコードが使う時計（Date。page.clock で固定する）と分ける。
//   - ページの中の前後関係（イベントの直後の例外）：リスナーが受け取った時点の performance.now()。文書ごとに起点が
//     変わるため、文書の ID（docId）と組で比べる。page.clock は window.performance と Event.prototype.timeStamp を
//     偽の時計に置き換える（Playwright 1.65 の clock の install）。setFixedTime では偽の時計も実時間で進むが、
//     pauseAt で止めると同じ値を返し続ける。初期化スクリプトの実行時に performance.now を保持するが、page.clock の
//     スクリプト（BrowserContext の初期化スクリプト）が先に実行された文書では、保持したものも偽の時計になる。
//   - そのため、ページの時刻の条件に加えて、Node で受け取った時刻（nodeTime）でもイベントの直後であることを確かめる。
//   - Node で受け取る記録（pageerror、コンソール）とページの記録の前後関係：記録を Node で受け取った時刻
//     （Node の performance.now()）。ページの記録は exposeBinding ですぐに Node へ送るため、
//     ページを移動しても前の文書の記録を失わない。

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
  /** ページの中の時刻（ms）。イベントの timeStamp で、page.clock の影響を受けない。Node で受け取った記録にはない */
  time?: number
  /** 記録した文書の ID。time は同じ文書の中でだけ比べる */
  docId?: string
  /** Node で記録を受け取った時刻（ms、Node の performance.now()） */
  nodeTime: number
}

// ---------------------------------------------------------------- 確認済みの環境の事象
// WebKit が、座標が NaN の信頼されたポインターのイベントを <html> に発生させ、Playwright がクリックの対象を
// 確かめる処理（注入スクリプトの expectHitTarget）の elementsFromPoint が TypeError を出す。
// 調査の記録は docs/web/components/overlays.md の「ページの例外の記録」。
// 条件を広げない。Playwright や WebKit の版を上げたときは、事象を確かめ直してから WEBKIT_VERSION を更新する。
export const WEBKIT_VERSION = /^27\./
const NON_FINITE_MESSAGE = /^(TypeError: )?The provided value is non-finite$/
const HIT_TARGET_EVENTS = new Set(["pointerdown", "pointerup", "click", "mousedown", "mouseup"])
// 例外は、記録したイベントと同じイベントの処理の中で起きる。window の error は 5ms 以内（ページの時刻）、
// pageerror（Playwright が Node 側で受け取る同じ例外）は 50ms 以内（Node の時刻）とする。
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
  // window の error：同じ文書で、座標が有限でないイベントの 0〜5ms 後（ページの時刻）、かつ Node の時刻で 50ms 以内
  const windowErrors = uncaught.filter(
    (r) =>
      r.kind === "window-error" &&
      NON_FINITE_MESSAGE.test(r.message) &&
      isHitTargetStack(r.stack) &&
      (r.filename === undefined || r.filename === "" || r.filename === "undefined") &&
      r.time !== undefined &&
      events.some(
        (e) =>
          e.docId === r.docId &&
          e.time !== undefined &&
          r.time! - e.time >= 0 &&
          r.time! - e.time <= WINDOW_ERROR_WINDOW_MS &&
          // ページの時計が止められていても、Node で受け取った時刻はイベントの直後でなければならない
          r.nodeTime - e.nodeTime >= 0 &&
          r.nodeTime - e.nodeTime <= PAGEERROR_WINDOW_MS
      )
  )
  environment.push(...windowErrors)
  // pageerror は、判定した window の error と同じ例外の重複に限る（Node の時刻で 50ms 以内、件数も超えない）
  const pageErrors = uncaught.filter(
    (r) =>
      r.kind === "pageerror" &&
      NON_FINITE_MESSAGE.test(r.message) &&
      isHitTargetStack(r.stack) &&
      windowErrors.some((w) => Math.abs(r.nodeTime - w.nodeTime) <= PAGEERROR_WINDOW_MS)
  )
  environment.push(...pageErrors.slice(0, windowErrors.length))
  return { environment, unexplained: uncaught.filter((r) => !environment.includes(r)) }
}

// ---------------------------------------------------------------- コンソールのエラー
// 検品の環境（Vite の開発サーバーとの接続）から出るもの。製品のコードとは関係がないため、記録だけにする。
// SSR の検品は、検品用のサーバー（webServer）とは別の Vite をミドルウェアとして起動するため、ページの HMR の
// WebSocket が接続できない。文言が一致するものに限り、製品のエラーを取りこぼさないよう条件を広げない。
const CONSOLE_ENVIRONMENT: RegExp[] = [
  /^WebSocket connection to 'ws:\/\/localhost:\d+\/\?token=[\w-]+' failed: /,
  /^\[vite\] failed to connect to websocket\./,
  /^Failed to send error to Vite server: /,
]

export type ConsoleClassification = { environment: ErrorRecord[]; product: ErrorRecord[] }

export function classifyConsoleErrors(list: ErrorRecord[]): ConsoleClassification {
  const consoleErrors = list.filter((r) => r.kind === "console")
  const environment = consoleErrors.filter((r) => CONSOLE_ENVIRONMENT.some((re) => re.test(r.message)))
  return { environment, product: consoleErrors.filter((r) => !environment.includes(r)) }
}

// ---------------------------------------------------------------- 記録
// 開いている Overlay の data-slot（dialog-content、sheet-content など）
const OVERLAY_SELECTOR =
  "[data-open][data-slot$=content], [data-open][data-slot=drawer-popup], [data-slot=toast], [role=listbox], [role=tooltip]"

type PageRecord = Omit<ErrorRecord, "nodeTime">

// ページの記録を始める。collectPageErrors はこれを使う。判定の検品（page-errors.spec.ts）は、直接使って記録を確かめる。
export async function startPageErrorRecording(page: Page) {
  const list: ErrorRecord[] = []
  const now = () => performance.now()
  await page.exposeBinding("__fdRecordError", (source, record: PageRecord) => {
    list.push({ ...record, nodeTime: now(), url: source.frame.url() })
  })
  await page.addInitScript((selector) => {
    // ページの移動やページを閉じる途中で送信が失敗しても、未処理の拒否にしない（記録の処理が自分の記録を増やさない）
    const send = (r: unknown) => {
      void (window as unknown as { __fdRecordError: (r: unknown) => Promise<void> }).__fdRecordError(r).catch(() => undefined)
    }
    // page.clock が置き換える前の時計。リスナーが受け取った時点の時刻を記録する
    const realNow = performance.now.bind(performance)
    // 文書ごとの ID。イベントの timeStamp は文書ごとに起点が変わるため、同じ文書の記録だけを比べる
    const docId = `${performance.timeOrigin}-${Math.random().toString(36).slice(2)}`
    const overlaysNow = () =>
      Array.from(document.querySelectorAll(selector)).map((el) => el.getAttribute("data-slot") ?? el.getAttribute("role") ?? el.tagName)
    window.addEventListener("error", (e) => {
      send({
        kind: "window-error",
        message: String(e.message),
        stack: e.error?.stack,
        filename: e.filename,
        line: e.lineno,
        column: e.colno,
        time: realNow(),
        docId,
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
          send({
            kind: "non-finite-event",
            message: `${type} ${event.constructorName} trusted=${event.isTrusted} pointerType=${event.pointerType} client=(${event.clientX}, ${event.clientY}) target=${event.target}`,
            event,
            time: realNow(),
            docId,
            hash: location.hash,
          })
        },
        true
      )
    }
    window.addEventListener("unhandledrejection", (e) => {
      send({
        kind: "unhandledrejection",
        message: String(e.reason?.message ?? e.reason),
        stack: e.reason?.stack,
        time: realNow(),
        docId,
        hash: location.hash,
      })
    })
  }, OVERLAY_SELECTOR)
  page.on("pageerror", async (e) => {
    const record: ErrorRecord = { kind: "pageerror", message: String(e), stack: e.stack, url: page.url(), nodeTime: now() }
    list.push(record)
    record.overlays = await page
      .evaluate((selector) => Array.from(document.querySelectorAll(selector)).map((el) => el.getAttribute("data-slot") ?? el.tagName), OVERLAY_SELECTOR)
      .catch(() => ["(取得できない)"])
  })
  page.on("console", (m) => {
    if (m.type() !== "error") return
    const loc = m.location()
    list.push({ kind: "console", message: m.text(), url: page.url(), filename: loc.url, line: loc.lineNumber, nodeTime: now() })
  })
  return list
}

// 記録の判定と報告。失敗にする記録があれば Error を返す。
export function judgePageErrors(list: ErrorRecord[], browserName: string, browserVersion: string) {
  const { environment, unexplained } = classifyPageErrors(list, browserName, browserVersion)
  const consoleErrors = classifyConsoleErrors(list)
  const failures = [
    ...unexplained.map((r) => `例外（${r.kind}）：${r.message}`),
    ...consoleErrors.product.map((r) => `コンソールのエラー：${r.message}`),
  ]
  return { environment, unexplained, consoleErrors, failures }
}

export function collectPageErrors(test: TestType<any, any>) {
  const records = new WeakMap<TestInfo, ErrorRecord[]>()

  test.beforeEach(async ({ page }: { page: Page }, info: TestInfo) => {
    records.set(info, await startPageErrorRecording(page))
  })

  test.afterEach(async ({ page, browser, browserName }: { page: Page; browser: { version(): string }; browserName: string }, info: TestInfo) => {
    const list = records.get(info) ?? []
    // ページの記録の送信（exposeBinding）が残っていれば受け取ってから判定する。binding の呼び出しと evaluate の応答は
    // 同じ接続で順に届くため、往復を 1 回待つ。page.clock が setTimeout を止めている場合があるため、タイマーは使わない
    await page.evaluate(() => undefined).catch(() => undefined)
    if (list.length === 0) return
    const version = browser.version()
    const { environment, unexplained, consoleErrors, failures } = judgePageErrors(list, browserName, version)
    const report = {
      test: info.titlePath.join(" › "),
      project: info.project.name,
      browser: `${browserName} ${version}`,
      retry: info.retry,
      environment: environment.length,
      unexplained: unexplained.length,
      consoleEnvironment: consoleErrors.environment.length,
      consoleProduct: consoleErrors.product.length,
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
    if (consoleErrors.environment.length > 0) {
      info.annotations.push({
        type: "console-environment",
        description: `検品の環境から出たコンソールのエラー ${consoleErrors.environment.length} 件（記録だけ）`,
      })
    }
    if (failures.length > 0) throw new Error(`ページで次のエラーが起きた：${failures.join(" / ")}`)
  })
}
