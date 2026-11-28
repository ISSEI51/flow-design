import { expect, test, type Locator, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"

// Patterns / System & Account / System States の検品。期待値は指示書 7 章と 13 章（System States）の規則から決める。
// 模擬のサーバーは window.__fdSaSystemServer で設定する。ページを読み込む前の設定は window.__fdSaSystemServerInit。
// ネットワークの状態は模擬の navigator.onLine（setBrowserOnline）で切り替える（実際のネットワークは切らない）。
collectPageErrors(test)

type Server = NonNullable<Window["__fdSaSystemServer"]>
type Init = NonNullable<Window["__fdSaSystemServerInit"]>

// 検品では応答と監視の間隔を短くする（指示書の規則の判定には影響しない値）
const fast: Init = {
  latency: { probe: 80, status: 80, list: 150, save: 200, memo: 100, "job-start": 80, "job-list": 60, "job-cancel": 80, register: 150, "register-check": 80 },
  statusPollInterval: 300,
}

async function open(page: Page, init: Init = {}, { waitRows = true }: { waitRows?: boolean } = {}) {
  const merged = { ...fast, ...init, latency: { ...fast.latency, ...init.latency } }
  await page.addInitScript((value) => {
    window.__fdSaSystemServerInit = value
  }, merged)
  await page.goto("/#/system-states")
  await expect(page.getByRole("heading", { level: 1, name: "System States" })).toBeVisible()
  if (waitRows) await expect(rows(page)).toHaveCount(5)
}

const call = <K extends keyof Server>(page: Page, method: K, ...args: Server[K] extends (...a: infer A) => unknown ? A : never) =>
  page.evaluate(([m, a]) => (window.__fdSaSystemServer as unknown as Record<string, (...x: unknown[]) => unknown>)[m as string](...(a as unknown[])), [method, args] as const)
const read = <T,>(page: Page, fn: string) => page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdSaSystemServer), fn) as Promise<T>
const requests = (page: Page, kind: string) => read<{ kind: string }[]>(page, "(s) => s.requests").then((r) => r.filter((x) => x.kind === kind).length)
/**
 * 保留している要求（応答の順序を検品で決める）。既定では、中止された要求（StrictMode の仮のアンマウント、新しい確認、
 * タイムアウト）を除く。ignoreAbort の場合、中止された要求も解放するまで応答しない。
 */
const heldRequests = (page: Page, kind: "probe" | "list" | "save" | "job-list" | "job-start" | "register", detail?: string, { includeAborted = false } = {}) =>
  read<{ id: number; kind: string; detail?: string; settled: boolean; aborted: boolean }[]>(page, "(s) => s.held()").then((list) =>
    list.filter((h) => h.kind === kind && !h.settled && (includeAborted || !h.aborted) && (detail === undefined || h.detail === detail))
  )
/**
 * 先に予約された React の描画の処理が終わるまで待つ（MessageChannel のタスクを 2 回往復する。React の Scheduler も
 * MessageChannel を使う）。page.clock で止めた時計に影響されない。時間の長さには頼らない。
 */
const flush = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const round = (n: number) => {
          if (n === 0) return resolve()
          const ch = new MessageChannel()
          ch.port1.onmessage = () => round(n - 1)
          ch.port2.postMessage(null)
        }
        round(2)
      })
  )

/**
 * 偽の時計（page.clock.install の後。止めるまでは実時間で進む）を止める。以後は advance で進める。
 * 読んだ時刻から pauseAt までの間に時計が進み、過去の時刻になった場合は、時刻を読み直す。
 */
async function pauseClock(page: Page) {
  for (let i = 0; ; i++) {
    const t = await page.evaluate(() => Date.now())
    try {
      await page.clock.pauseAt(t + 20)
      return
    } catch (error) {
      if (i >= 5 || !String(error).includes("past")) throw error
    }
  }
}
/** 止めた偽の時計を、step ごとに進めて描画を待つ（実時間の長さに頼らない） */
async function advance(page: Page, ms: number, step = 50) {
  for (let t = 0; t < ms; t += step) {
    await page.clock.runFor(Math.min(step, ms - t))
    await flush(page)
  }
}

const app = (page: Page) => page.getByTestId("sys-app")
const banner = (page: Page) => app(page).getByTestId("sys-banner")
const live = (l: Locator) => l.locator("[data-slot=system-banner-live]")
const rows = (page: Page) => app(page).getByTestId("sys-customers-list").locator("li")
const exportButton = (page: Page) => app(page).getByRole("button", { name: "顧客を書き出す" })
const jobsDemo = (page: Page) => page.getByTestId("sys-jobs")

// ------------------------------------------------------------------ 資料のページ
test.describe("System States page", { tag: "@webkit" }, () => {
  test("one h1, named controls, no horizontal page scroll, comparison mocks are inert", async ({ page }) => {
    await open(page)
    await expect(page.locator("h1")).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const controls = page.locator("main").first().getByRole("button").or(page.locator("main").first().getByRole("link"))
    const n = await controls.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const c = controls.nth(i)
      if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
    }
    const mocks = await page.locator("figure [inert]").all()
    expect(mocks.length).toBeGreaterThanOrEqual(5)
    for (const mock of mocks) expect(await mock.evaluate((el) => (el as HTMLElement).inert)).toBe(true)
    // 模擬の処理であることを例の操作に示す
    await expect(page.getByText("端末のネットワーク（模擬）").first()).toBeVisible()
    await expect(page.getByText("サービスの状態（模擬の障害の監視）").first()).toBeVisible()
  })

  test("320px: the page and the example do not scroll horizontally, also with problems shown", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    await page.setViewportSize({ width: 320, height: 800 })
    await open(page)
    await call(page, "applyScenario", "multiple")
    await call(page, "setBrowserOnline", false)
    await expect(banner(page)).toContainText("オフラインです")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    // Banner は内容に合わせた高さで、文が切れない
    const item = banner(page).locator("[data-slot=system-banner-item]")
    expect(await item.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })
})

// ------------------------------------------------------------------ 状態と表示位置
test.describe("System States: conditions and placement", () => {
  test("operational: nothing about the normal state is shown; the banner and its live region are present and empty", async ({ page }) => {
    await page.clock.install()
    await open(page, { maintenance: [] })
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "online")
    // 表示の遅延（1 秒）より長く、偽の時計を進める。その間に状態の取得（300ms ごと）が続いていることも確かめる
    await pauseClock(page)
    const polls = await requests(page, "status")
    await advance(page, 1500)
    expect(await requests(page, "status")).toBeGreaterThanOrEqual(polls + 4)
    await expect(banner(page)).toHaveAttribute("data-empty", "true")
    await expect(live(banner(page))).toHaveAttribute("role", "status")
    await expect(live(banner(page))).toHaveAttribute("aria-live", "polite")
    await expect(live(banner(page))).toHaveText("")
    await expect(app(page)).not.toContainText("正常")
  })

  test("connection indicator: unconfirmed until its probe succeeds; calls are not allowed before that", async ({ page }) => {
    await open(page, { maintenance: [], hold: { probe: true } })
    const indicator = page.getByTestId("sys-indicator")
    // 接続の常時表示：疎通を確認していない間は「正常」と示さず、通話を開始させない（v0.1 の最終調整 8 章：最初の状態は未確認）
    await expect(indicator).toHaveText("接続を確認しています")
    await expect(indicator).toHaveAttribute("data-condition", "unknown")
    await expect(indicator).toHaveAttribute("data-status", "unknown")
    await expect(page.getByTestId("sys-call-start")).toBeDisabled()
    await expect(page.getByTestId("sys-call-reason")).toHaveText("接続を確認できるまで、通話を開始できません。")
    expect(await heldRequests(page, "probe", "tokyo")).toHaveLength(1)
    await call(page, "releaseAll", "probe", "success")
    await expect(indicator).toContainText("東京の通話サーバーに接続しています")
    await expect(indicator).toHaveAttribute("data-confirmed-by", "probe")
    await expect(page.getByTestId("sys-call-start")).toBeEnabled()
  })

  test("offline: restrictions apply at once; the banner appears after it persists; existing data stays with its time; focus is kept", async ({ page }) => {
    await page.clock.install()
    await open(page)
    // 時計を止め、表示の遅延を偽の時計で確かめる（実時間の速さに頼らない）
    await pauseClock(page)
    const search = app(page).getByRole("textbox", { name: "会社名で検索" })
    await search.focus()
    const before = await requests(page, "job-start")
    await call(page, "setBrowserOnline", false)
    // 安全性に必要な制限は遅らせない（時計を進めずに反映される）
    await expect(exportButton(page)).toBeDisabled()
    await expect(app(page).getByRole("button", { name: "検索" })).toBeDisabled()
    // 表示は 1 秒続いてから
    await advance(page, 950)
    await expect(banner(page)).not.toContainText("オフラインです")
    await advance(page, 100)
    await expect(banner(page)).toContainText("オフラインです")
    await expect(banner(page)).toContainText("表示中の内容は、最後に取得した時点のものです。")
    await advance(page, 1000)
    await expect(live(banner(page))).toContainText("オフラインです")
    // 既存のデータを残し、取得した時刻を示す
    await expect(rows(page)).toHaveCount(5)
    await expect(app(page).getByTestId("sys-customers-time")).toHaveText(/^\d{1,2}:\d{2}の時点の内容$/)
    await expect(app(page).getByTestId("sys-jobs-reason")).toHaveText("オフラインのため、書き出しを開始できません。")
    await expect(exportButton(page)).toHaveAttribute("aria-describedby", /.+/)
    await expect(search).toBeFocused()
    // Banner は流れの中に置く（固定の Toast や Bottom Navigation に重ならない）
    expect(await banner(page).evaluate((el) => getComputedStyle(el).position)).toBe("static")
    await exportButton(page).click({ force: true })
    expect(await requests(page, "job-start")).toBe(before)
  })

  test("reconnecting: a browser online event is not trusted until the probe succeeds", async ({ page }) => {
    await open(page, { maintenance: [] })
    await call(page, "setBrowserOnline", false)
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "offline")
    await call(page, "setReachable", false)
    await call(page, "setBrowserOnline", true)
    // online の通知を受けても、疎通を確認できるまで接続とせず、保存を受け付けない
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "connecting")
    // 疎通の確認の失敗の応答が届いた後も（失敗の回数で確かめる。待つ時間の長さに頼らない）、接続としない
    await expect(page.getByTestId("sys-retry-attempt")).toHaveText(/^[1-9] 回/)
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "connecting")
    await expect(exportButton(page)).toBeDisabled()
    await expect(banner(page)).toContainText("再接続しています")
    await call(page, "setReachable", true)
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "online", { timeout: 6000 })
    await expect(exportButton(page)).toBeEnabled()
  })

  test("safe retry: probes back off and stop at the limit; attempts are not re-announced; manual retry recovers", async ({ page }) => {
    test.setTimeout(40_000)
    await page.clock.install()
    await open(page, { maintenance: [] })
    await call(page, "setReachable", false)
    const probesBefore = await requests(page, "probe")
    await page.getByTestId("sys-retry").getByRole("button", { name: "再接続を試す" }).click()
    await expect(banner(page)).toContainText("再接続しています")
    await expect(live(banner(page))).toContainText("再接続しています")
    const announced = await live(banner(page)).textContent()
    await expect(page.getByTestId("sys-retry-attempt")).toHaveText(/^2 回/, { timeout: 6000 })
    await expect(banner(page)).toContainText("2 回失敗しました")
    // 回数が変わっても、読み上げの内容は変えない
    expect(await live(banner(page)).textContent()).toBe(announced)
    // 上限（4 回）で自動の確認をやめ、利用者の操作を待つ
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "offline", { timeout: 15_000 })
    await expect(page.getByTestId("sys-retry-attempt")).toHaveText(/^4 回/)
    await expect(page.getByTestId("sys-retry-next")).toHaveText("予定していません")
    const probes = (await requests(page, "probe")) - probesBefore
    expect(probes).toBe(4)
    // 上限の後は確認を送らない。偽の時計を、間隔の上限（8 秒）の 3 倍を超えて進めて確かめる（実時間で待たない）
    await pauseClock(page)
    await advance(page, 30_000, 500)
    expect((await requests(page, "probe")) - probesBefore).toBe(4)
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "offline")
    await page.clock.resume()
    await expect(banner(page)).toContainText("サービスに接続できません")
    // 回復：利用者の操作で確認し、接続できたら知らせる（表示した問題が解消したため）
    await call(page, "setReachable", true)
    await banner(page).getByRole("button", { name: "再接続を試す" }).click()
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "online")
    await expect(banner(page).locator("[data-slot=system-banner-notice]")).toContainText("接続が回復しました", { timeout: 6000 })
  })

  test("degraded and partial outage: shown where the impact is; unaffected functions stay available", async ({ page }) => {
    await open(page, { maintenance: [] })
    await call(page, "applyScenario", "degraded")
    await expect(banner(page)).toContainText("顧客の閲覧と編集の動作が遅くなっています")
    await expect(rows(page)).toHaveCount(5)
    await expect(exportButton(page)).toBeEnabled()

    await call(page, "applyScenario", "partial-outage")
    const searchError = app(page).getByTestId("sys-search-error")
    await expect(searchError).toContainText("検索の一部が利用できません")
    await expect(searchError).toContainText("一覧の表示と編集は利用できます。")
    // 領域の問題は Banner に重ねて示さない
    await expect(banner(page)).toHaveAttribute("data-empty", "true", { timeout: 4000 })
    await expect(app(page).getByRole("textbox", { name: "会社名で検索" })).toBeDisabled()
    await expect(rows(page)).toHaveCount(5)
    await expect(exportButton(page)).toBeEnabled()
    await expect(app(page).getByTestId("sys-notifications")).toContainText("未読の通知が 3 件あります")
    // 部分的な障害の再試行のボタンは置かない（再取得で解決しない）
    await expect(searchError.getByRole("button")).toHaveCount(0)
  })

  test("multiple problems are aggregated in one banner; region and page problems stay in place", async ({ page }) => {
    await open(page)
    await call(page, "applyScenario", "multiple")
    // 状態を取得してから切断する（オフラインの間は状態を取得しない）
    await expect(banner(page)).toContainText("顧客の閲覧と編集の動作が遅くなっています")
    await call(page, "setBrowserOnline", false)
    const b = banner(page)
    await expect(b.locator("[data-slot=system-banner-item]")).toHaveCount(1)
    await expect(b.locator("[data-slot=system-banner-item]").locator("p").first()).toHaveText("オフラインです")
    const more = b.getByRole("button", { name: "ほか 2 件の問題" })
    await expect(more).toHaveAttribute("aria-expanded", "false")
    await expect(b.locator("[data-slot=system-banner-list]")).toBeHidden()
    await more.focus()
    await page.keyboard.press("Enter")
    await expect(more).toHaveAttribute("aria-expanded", "true")
    const list = b.locator("[data-slot=system-banner-list]")
    await expect(list).toBeVisible()
    // 現在の問題（性能の低下）を、予定（メンテナンス）より前に並べる
    await expect(list.locator("li").nth(0)).toContainText("顧客の閲覧と編集の動作が遅くなっています")
    await expect(list.locator("li").nth(1)).toContainText("メンテナンスを行います")
    await expect(live(b)).toContainText("ほかに 2 件の問題があります。")
    for (const text of ["検索の一部", "通知を利用できません", "契約と請求のページ"]) await expect(b).not.toContainText(text)
    await expect(app(page).getByTestId("sys-search-error")).toBeVisible()
    await expect(app(page).getByTestId("sys-notifications-error")).toContainText("通知を利用できません")
    await app(page).getByRole("button", { name: "契約と請求" }).click()
    await expect(app(page).getByTestId("sys-billing-error")).toContainText("契約と請求を利用できません")
  })

  test("product-wide outage and maintenance replace the screen without inventing a recovery time", async ({ page }) => {
    await open(page)
    await call(page, "applyScenario", "outage")
    const screen = app(page).getByTestId("sys-unavailable")
    await expect(screen.getByRole("heading", { name: "サービスを利用できません" })).toBeVisible()
    await expect(banner(page)).toHaveCount(0)
    await expect(app(page).getByTestId("sys-customers")).toHaveCount(0)
    // 判明していない復旧の予定時刻、存在しない問い合わせ先を示さない
    await expect(screen).not.toContainText(/\d{1,2}:\d{2}/)
    await expect(screen).not.toContainText("問い合わせ")
    await screen.getByRole("button", { name: "状態を再確認" }).click()
    await expect(screen.getByRole("status")).toHaveText(/^\d{1,2}:\d{2}に確認しました。まだ利用できません。$/)
    await call(page, "applyScenario", "maintenance")
    await expect(screen.getByRole("heading", { name: "メンテナンス中です" })).toBeVisible()
    await expect(screen).toContainText("終了の予定は、わかり次第お知らせします。")
    // 実在する稼働状況の例へ移動できる（フォーカスを移す）
    await screen.getByRole("button", { name: "稼働状況のページを見る" }).click()
    await expect(page.getByLabel("Status Page の例")).toBeFocused()
    await call(page, "applyScenario", "operational")
    await expect(rows(page)).toHaveCount(5)
    await expect(screen).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 回復と通知
test.describe("System States: recovery and notifications", () => {
  test("after reconnecting, data is fetched again and recovering is kept until the fetch ends; then a recovery notice", async ({ page }) => {
    await open(page, { maintenance: [] })
    await call(page, "setBrowserOnline", false)
    await expect(banner(page)).toContainText("オフラインです")
    const lists = await requests(page, "list")
    // 回復の後の取得し直しを保留する（取得が終わるまで「確認しています」を保つことを、応答の時間に頼らずに確かめる）
    await call(page, "set", { hold: { list: true } })
    await call(page, "setBrowserOnline", true)
    await expect.poll(async () => (await heldRequests(page, "list")).length).toBe(1)
    await expect(banner(page)).toContainText("接続が回復しました。最新の内容を確認しています")
    expect(await requests(page, "list")).toBe(lists + 1)
    await expect(banner(page).locator("[data-slot=system-banner-notice]")).toHaveCount(0)
    await call(page, "set", { hold: {} })
    await call(page, "releaseAll", "list", "success")
    await expect(app(page).getByTestId("sys-customers-time")).toHaveText("")
    await expect(banner(page).locator("[data-slot=system-banner-notice]")).toContainText("接続が回復しました", { timeout: 6000 })
    await expect(live(banner(page))).toContainText("接続が回復しました", { timeout: 3000 })
  })

  test("a short failure that resolves by itself shows nothing and no recovery notice", async ({ page }) => {
    await page.clock.install()
    await open(page, { maintenance: [] })
    await pauseClock(page)
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid=sys-app] [data-slot=system-banner]")!
      const seen: string[] = ((window as unknown as { __sysSeen: string[] }).__sysSeen = [])
      new MutationObserver(() => seen.push(el.textContent ?? "")).observe(el, { subtree: true, childList: true, characterData: true })
    })
    await call(page, "setBrowserOnline", false)
    await advance(page, 400)
    await call(page, "setBrowserOnline", true)
    await advance(page, 4000)
    const seen = await page.evaluate(() => (window as unknown as { __sysSeen: string[] }).__sysSeen)
    expect(seen.join("|")).not.toContain("オフライン")
    expect(seen.join("|")).not.toContain("回復")
    await expect(banner(page)).toHaveAttribute("data-empty", "true")
  })

  test("flapping: restrictions follow immediately; the banner is shown once and announcements are not repeated", async ({ page }) => {
    test.setTimeout(60_000)
    await page.clock.install()
    await open(page, { maintenance: [], latency: { probe: 50 } })
    await pauseClock(page)
    const demo = page.getByTestId("sys-flapping")
    await demo.getByRole("button", { name: "接続と切断を 5 回繰り返す" }).click()
    // 最初の切断（0ms）の制限は、表示の遅延を待たずに反映する
    await advance(page, 50)
    await expect(demo.getByTestId("sys-flapping-allowed")).toHaveAttribute("data-allowed", "false")
    // 400ms ごとに 10 回の切り替え（偽の時計）
    await advance(page, 4000)
    await expect(demo.getByRole("button", { name: "接続と切断を 5 回繰り返す" })).toBeEnabled()
    await advance(page, 4500)
    const n = async (id: string) => Number((await demo.getByTestId(id).textContent())!.replace(/\D/g, ""))
    expect(await n("sys-flapping-blocked")).toBeGreaterThanOrEqual(4)
    expect(await n("sys-flapping-shown")).toBe(1)
    // 切断のたびに読み上げない。繰り返しが終わった後の復旧の知らせだけ（1 回以下）
    expect(await n("sys-flapping-announced")).toBeLessThanOrEqual(1)
    await expect(demo.getByTestId("sys-flapping-allowed")).toHaveAttribute("data-allowed", "true")
  })

  test("dismissing the optional maintenance notice keeps the restriction near the action and on the status page; focus stays in the banner", async ({ page }) => {
    await open(page)
    const b = banner(page)
    await expect(b).toContainText("12月3日(木) 2:00〜4:00（日本時間）に、書き出しと契約の管理のメンテナンスを行います")
    await expect(b).toContainText("書き出しが必要な場合は、開始の前に済ませてください。")
    await b.getByRole("button", { name: "お知らせを閉じる" }).click()
    await expect(b).toHaveAttribute("data-empty", "true", { timeout: 4000 })
    await expect(b).toBeFocused()
    await expect(app(page).getByTestId("sys-export-maintenance")).toHaveText("12月3日(木) 2:00〜4:00（日本時間）は、メンテナンスのため書き出しを利用できません。")
    await expect(page.getByTestId("sys-status-maintenance")).toContainText("12月3日(木) 2:00〜4:00（日本時間）")
  })

  test("status fetch failure is never shown as operational; the last known problems stay with their time", async ({ page }) => {
    await open(page, { statusFails: true, maintenance: [] })
    const status = page.getByTestId("sys-status-page")
    await expect(status).toHaveAttribute("data-overall", "unknown")
    await expect(page.getByTestId("sys-status-overall")).toHaveText("状態を取得できません")
    await expect(status).not.toContainText("正常に動作")
    await call(page, "setStatusFails", false)
    await call(page, "applyScenario", "degraded")
    await expect(banner(page)).toContainText("顧客の閲覧と編集の動作が遅くなっています")
    await call(page, "setStatusFails", true)
    // 状態の取得に失敗した間は、問題が消えたように見せない（最後に取得した状態を時点つきで示す）
    await expect(banner(page)).toContainText(/\d{1,2}:\d{2}の時点の状態です。最新の状態を確認できません/)
    await expect(banner(page)).toContainText("顧客の閲覧と編集の動作が遅くなっています")
    // 実際には解消していても、確かめられないうちは解消したと示さない。
    // 解消した後に、状態の取得（失敗する）が 2 回以上行われたことを、要求の回数で確かめてから判定する
    await call(page, "applyScenario", "operational")
    const polls = await requests(page, "status")
    await expect.poll(() => requests(page, "status")).toBeGreaterThanOrEqual(polls + 2)
    await flush(page)
    await expect(banner(page)).toContainText("顧客の閲覧と編集の動作が遅くなっています")
    await expect(page.getByTestId("sys-status-page")).not.toHaveAttribute("data-overall", "operational")
  })

  test("status page: overall, components, current incidents with response status, maintenance, history, last update; no internal details", async ({ page }) => {
    await open(page)
    await call(page, "applyScenario", "multiple")
    const status = page.getByTestId("sys-status-page")
    await status.getByRole("button", { name: "最新の情報に更新" }).click()
    await expect(page.getByTestId("sys-status-overall")).toHaveText("一部の機能を利用できません")
    await expect(page.getByTestId("sys-status-components").locator("dt")).toHaveText(["ログイン", "顧客の閲覧と編集", "検索", "書き出し", "通知", "契約と請求"])
    await expect(page.getByTestId("sys-status-components")).toContainText("一部の障害")
    await expect(status.getByRole("heading", { name: "現在の障害" })).toBeVisible()
    await expect(status.locator("[data-incident=inc-1126c]")).toContainText("通知を受け取れません")
    await expect(status.locator("[data-incident=inc-1126c]")).toContainText("調査中")
    await expect(status.locator("[data-incident=inc-1126b]")).toContainText("原因を特定")
    await expect(status.locator("[data-incident=inc-1118]")).toContainText("解決済み")
    await expect(page.getByTestId("sys-status-updated")).toHaveText(/^最終更新：11月26日\(木\) 9:59$/)
    await expect(status).not.toContainText(/stack|Error:|at \w+ \(/i)
  })
})

// ------------------------------------------------------------------ オフラインの登録、保存の結果
test.describe("System States: offline input and unknown results", () => {
  const register = (page: Page) => page.getByTestId("sys-offline-register")

  test("input only: the input stays while offline and can be registered by the user after reconnecting", async ({ page }) => {
    await open(page)
    const form = register(page)
    await form.getByLabel("会社名").fill("テスト商事")
    await call(page, "setBrowserOnline", false)
    await expect(form.getByRole("button", { name: "登録" })).toBeDisabled({ timeout: 300 })
    await expect(form.getByLabel("会社名")).toBeEnabled()
    await expect(form.getByTestId("sys-offline-reason")).toHaveText("接続が回復したら「登録」を押してください。入力した内容は、この画面に残ります。")
    expect(await requests(page, "register")).toBe(0)
    await call(page, "setBrowserOnline", true)
    await expect(form.getByRole("button", { name: "登録" })).toBeEnabled()
    await expect(form.getByLabel("会社名")).toHaveValue("テスト商事")
    await form.getByRole("button", { name: "登録" }).click()
    await expect.poll(() => read<number>(page, "(s) => s.registeredCount()")).toBe(1)
  })

  test("online only: input is not accepted while offline", async ({ page }) => {
    await open(page)
    const form = register(page)
    await form.getByLabel("登録不可（オンラインが必要）").check()
    await call(page, "setBrowserOnline", false)
    await expect(form.getByLabel("会社名")).toBeDisabled()
    await expect(form.getByTestId("sys-offline-reason")).toHaveText("オンラインのときだけ登録できます。")
  })

  test("offline registration: saved on the device is not shown as registered; it syncs once after reconnecting", async ({ page }) => {
    await open(page)
    const form = register(page)
    await form.getByLabel("オフライン登録（端末に保存し、後で同期）").check()
    await call(page, "setBrowserOnline", false)
    await form.getByLabel("会社名").fill("みらい物産")
    await form.getByRole("button", { name: "端末に保存" }).click()
    const item = form.getByTestId("sys-offline-queue").locator("li")
    await expect(item).toHaveAttribute("data-sync", "saved-locally")
    // 端末に保存した状態は、サーバーで登録された状態として扱わない（isRegisteredOnServer）
    await expect(item).toHaveAttribute("data-registered", "false")
    await expect(item).toContainText("端末に保存しました（まだ登録されていません）")
    await expect(item).not.toContainText("登録しました")
    expect(await read<number>(page, "(s) => s.registeredCount()")).toBe(0)
    await call(page, "setBrowserOnline", true)
    await expect(item).toHaveAttribute("data-sync", "synced")
    await expect(item).toHaveAttribute("data-registered", "true")
    await expect(item).toContainText("登録しました")
    expect(await read<number>(page, "(s) => s.registeredCount()")).toBe(1)
    expect(await requests(page, "register")).toBe(1)
  })

  test("offline registration: an unknown sync result is checked before sending again; a conflict is shown", async ({ page }) => {
    await page.clock.install()
    await open(page, { syncOutcome: "unknown" })
    const form = register(page)
    await form.getByLabel("オフライン登録（端末に保存し、後で同期）").check()
    await call(page, "setBrowserOnline", false)
    await form.getByLabel("会社名").fill("みらい物産")
    await form.getByRole("button", { name: "端末に保存" }).click()
    await call(page, "setBrowserOnline", true)
    const item = form.getByTestId("sys-offline-queue").locator("li").first()
    await expect(item).toHaveAttribute("data-sync", "unknown")
    await expect(item).toContainText("登録されたかを確認できません")
    // 結果を確かめる前に、送り直さない。送る前の待機（300ms）と自動の再送の間隔の上限（4 秒）を超えて、偽の時計を進める
    await pauseClock(page)
    await advance(page, 5000, 250)
    expect(await requests(page, "register")).toBe(1)
    await expect(item).toHaveAttribute("data-sync", "unknown")
    await page.clock.resume()
    await item.getByRole("button", { name: "登録されたかを確認" }).click()
    await expect(item).toHaveAttribute("data-sync", "synced")
    expect(await requests(page, "register")).toBe(1)
    expect(await read<number>(page, "(s) => s.registeredCount()")).toBe(1)

    await call(page, "set", { syncOutcome: "conflict" })
    await call(page, "setBrowserOnline", false)
    await form.getByLabel("会社名").fill("青葉メディカル")
    await form.getByRole("button", { name: "端末に保存" }).click()
    await call(page, "setBrowserOnline", true)
    await expect(form.getByTestId("sys-offline-queue").locator("li").nth(1)).toHaveAttribute("data-sync", "conflict")
  })

  const save = (page: Page) => page.getByTestId("sys-save")
  const memo = (page: Page) => save(page).getByRole("textbox")
  const memoOnServer = (page: Page) => read<string>(page, "(s) => s.memoOf('hq', s.customersOf('hq')[0].id).text")

  test("unknown save result: not shown as saved, no retry button, checking confirms against the server", async ({ page }) => {
    await page.clock.install()
    await open(page, { saveOutcome: "unknown" })
    await expect(memo(page)).toHaveValue("次回の訪問で、契約の更新を相談する。")
    await memo(page).fill("見積もりを送る")
    await save(page).getByRole("button", { name: "保存する" }).click()
    const status = save(page).getByTestId("sys-save-status")
    await expect(status).toHaveAttribute("data-status", "unknown")
    await expect(status).toHaveText("保存できたかを確認できません。通信が切れたため、サーバーでは保存されている可能性があります。")
    await expect(status).toHaveAttribute("role", "status")
    // サーバーでは保存されている
    expect(await memoOnServer(page)).toBe("見積もりを送る")
    await expect(save(page).getByRole("button", { name: "保存する", exact: true })).toBeDisabled()
    await expect(save(page).getByRole("button", { name: /再試行|もう一度/ })).toHaveCount(0)
    // 結果が不明な保存を、自動で送り直さない。状態の取得（300ms ごと）が続く間、偽の時計を進めて確かめる
    await pauseClock(page)
    const polls = await requests(page, "status")
    await advance(page, 5000, 250)
    expect(await requests(page, "status")).toBeGreaterThan(polls)
    expect(await requests(page, "save")).toBe(1)
    await expect(status).toHaveAttribute("data-status", "unknown")
    await page.clock.resume()
    await save(page).getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(status).toHaveAttribute("data-status", "saved")
    await expect(status).toHaveText("保存しました。")
  })

  test("unknown save result is checked automatically after reconnecting", async ({ page }) => {
    await open(page, { saveOutcome: "unknown" })
    await memo(page).fill("訪問の日程を決める")
    await save(page).getByRole("button", { name: "保存する" }).click()
    const status = save(page).getByTestId("sys-save-status")
    await expect(status).toHaveAttribute("data-status", "unknown")
    await call(page, "setBrowserOnline", false)
    await expect(save(page).getByRole("button", { name: "保存されたかを確認" })).toBeDisabled()
    const checks = await requests(page, "memo")
    await call(page, "setBrowserOnline", true)
    await expect(status).toHaveAttribute("data-status", "saved")
    expect(await requests(page, "memo")).toBeGreaterThan(checks)
  })

  test("failed save keeps the input and is not retried automatically; offline blocks saving at once", async ({ page }) => {
    await page.clock.install()
    await open(page, { saveOutcome: "fail" })
    await memo(page).fill("契約書を送る")
    await save(page).getByRole("button", { name: "保存する" }).click()
    const status = save(page).getByTestId("sys-save-status")
    await expect(status).toHaveAttribute("data-status", "failed")
    await expect(status).toHaveText("保存できませんでした。入力した内容は残っています。")
    await expect(memo(page)).toHaveValue("契約書を送る")
    // 失敗した保存を、自動で送り直さない。状態の取得（300ms ごと）が続く間、偽の時計を進めて確かめる
    await pauseClock(page)
    const polls = await requests(page, "status")
    await advance(page, 5000, 250)
    expect(await requests(page, "status")).toBeGreaterThan(polls)
    expect(await requests(page, "save")).toBe(1)
    expect(await memoOnServer(page)).toBe("次回の訪問で、契約の更新を相談する。")
    await page.clock.resume()

    await call(page, "setBrowserOnline", false)
    await expect(save(page).getByRole("button", { name: "保存する" })).toBeDisabled({ timeout: 300 })
    await expect(status).toHaveText("オフラインのため、保存できません。入力した内容は、この画面に残ります。")
    await call(page, "set", { saveOutcome: "success" })
    await call(page, "setBrowserOnline", true)
    await expect(save(page).getByRole("button", { name: "保存する" })).toBeEnabled()
    await expect(memo(page)).toHaveValue("契約書を送る")
    await save(page).getByRole("button", { name: "保存する" }).click()
    await expect(status).toHaveAttribute("data-status", "saved")
  })

  test("workspace A → B → A: a late save result from the first A is not shown; the draft is not carried across workspaces", async ({ page }) => {
    // 保存の応答を保留し、A → B → A の後に解放する（応答の時間に頼らない）
    await open(page, { ignoreAbort: true, hold: { save: true } })
    await memo(page).fill("本社の下書き")
    await save(page).getByRole("button", { name: "保存する" }).click()
    await expect(save(page).getByTestId("sys-save-status")).toHaveAttribute("data-status", "saving")
    await expect.poll(async () => (await heldRequests(page, "save")).length).toBe(1)
    const [pending] = await heldRequests(page, "save")
    await save(page).getByLabel("西日本営業部").check()
    // 別のワークスペースに、前の入力と状態を表示しない（同じ描画から）
    await expect(save(page)).toHaveAttribute("data-workspace", "west")
    await expect(memo(page)).not.toHaveValue("本社の下書き")
    await expect(save(page).getByTestId("sys-save-status")).toHaveAttribute("data-status", "idle")
    await save(page).getByLabel("本社営業部").check()
    await expect(save(page)).toHaveAttribute("data-workspace", "hq")
    await expect(save(page).getByTestId("sys-save-status")).toHaveAttribute("data-loaded", "true")
    // 最初の A の保存を、サーバーで処理して応答する（AbortSignal に従わない）
    await call(page, "release", pending.id, "success")
    await expect.poll(() => memoOnServer(page)).toBe("本社の下書き")
    await flush(page)
    // サーバーでは処理されたが、最初の A の結果（保存しました）は反映しない
    await expect(save(page).getByTestId("sys-save-status")).toHaveAttribute("data-status", "idle")
    await expect(save(page).getByTestId("sys-save-status")).toHaveText("")
    expect(await memoOnServer(page)).toBe("本社の下書き")
  })
})

// ------------------------------------------------------------------ 長時間の処理
test.describe("System States: background jobs", () => {
  const item = (page: Page, n = 0) => jobsDemo(page).locator("[data-slot=job-status-item]").nth(n)

  test("real progress only; finished job announced once with a toast per job", async ({ page }) => {
    await open(page, { jobStep: 300 })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page).getByRole("progressbar")).toBeVisible()
    await expect(item(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", /\d/)
    await expect(item(page)).toContainText("/ 1,240件")
    await expect(item(page)).toHaveAttribute("data-state", "succeeded", { timeout: 6000 })
    await expect(item(page).getByRole("progressbar")).toHaveCount(0)
    await expect(item(page)).toContainText("1,240件を処理しました。")
    const toast = page.locator("[data-slot=toast]").filter({ hasText: "顧客の書き出しが完了しました" })
    await expect(toast).toHaveCount(1)

    await call(page, "set", { jobReportsProgress: false })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toHaveAttribute("data-state", "running")
    await expect(item(page).getByRole("progressbar")).toHaveCount(0)
    await expect(item(page)).toContainText("進み具合は表示できません。")
    await expect(item(page)).not.toContainText("%")
  })

  test("a cancel request is not shown as cancelled until the server stops; the job may also finish first", async ({ page }) => {
    await open(page, { jobStep: 1200 })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toHaveAttribute("data-state", /queued|running/)
    await item(page).getByRole("button", { name: "キャンセル" }).click()
    await expect(item(page)).toHaveAttribute("data-state", "cancel-requested", { timeout: 300 })
    await expect(item(page)).toContainText("キャンセルを要求しました")
    await expect(item(page)).not.toContainText("キャンセルしました")
    await expect(item(page).getByRole("button", { name: "キャンセル" })).toHaveCount(0)
    await expect(item(page)).toHaveAttribute("data-state", "cancelled", { timeout: 5000 })
    await expect(item(page)).toContainText("キャンセルしました")

    await call(page, "set", { jobCancelOutcome: "completed", jobStep: 400 })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toContainText("処理 2")
    await expect(item(page)).toHaveAttribute("data-state", "running")
    await item(page).getByRole("button", { name: "キャンセル" }).click()
    await expect(item(page)).toHaveAttribute("data-state", "cancel-requested")
    await expect(item(page)).toHaveAttribute("data-state", "succeeded", { timeout: 6000 })
  })

  test("partial failure and unknown results stay in the list without a success toast", async ({ page }) => {
    await open(page, { jobStep: 250, jobOutcome: "partial" })
    await jobsDemo(page).getByRole("button", { name: "顧客を取り込む" }).click()
    await expect(item(page)).toHaveAttribute("data-state", "partial", { timeout: 6000 })
    await expect(item(page)).toContainText("成功 1,228件、失敗 12件。")
    await call(page, "set", { jobOutcome: "unknown" })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toHaveAttribute("data-state", "unknown", { timeout: 6000 })
    await expect(item(page)).toContainText("結果を確認できません")
    await expect(item(page).getByRole("button", { name: "状態を確認" })).toBeVisible()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)
  })

  test("jobs continue after leaving the page; old responses and other workspaces' results are not shown", async ({ page }) => {
    await page.clock.install()
    await open(page, { jobStep: 500, ignoreAbort: true })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toHaveAttribute("data-state", "running")
    // 別のワークスペース：前のワークスペースの処理を表示しない。完了の Toast も出さない
    await page.getByTestId("sys-jobs-demo").getByLabel("西日本営業部").check()
    await expect(jobsDemo(page)).toHaveAttribute("data-workspace", "west")
    await expect(jobsDemo(page).locator("[data-slot=job-status-item]")).toHaveCount(0)
    await expect.poll(() => read<string>(page, "(s) => s.jobsOf('hq')[0].state"), { timeout: 6000 }).toBe("succeeded")
    // 切り替える前に送った本社の状況の取得（AbortSignal に従わない）の応答が、すべて届くまで偽の時計を進めてから確かめる
    await pauseClock(page)
    await advance(page, 1000, 100)
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)
    await page.clock.resume()
    await page.getByTestId("sys-jobs-demo").getByLabel("本社営業部").check()
    await expect(item(page)).toHaveAttribute("data-state", "succeeded")
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)

    // ページを離れても処理は続き、戻ったときに状況を取得し直す
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toContainText("処理 2")
    const revisionOf2 = () => read<number>(page, "(s) => s.jobsOf('hq').find((j) => j.id === 'job-export-2').revision")
    const rev = await revisionOf2()
    await page.goto("/#/data-states")
    await expect(page.getByRole("heading", { level: 1, name: "Data States" })).toBeVisible()
    // 画面を離れている間に、サーバーで処理が進んだこと（版が増えたこと）を確かめてから戻る
    await expect.poll(revisionOf2, { timeout: 6000 }).toBeGreaterThan(rev)
    await page.goto("/#/system-states")
    await expect(jobsDemo(page).locator("[data-job=job-export-2]")).toBeVisible()
    await expect(jobsDemo(page).locator("[data-job=job-export-2]")).toHaveAttribute("data-state", /running|succeeded/)
  })

  test("out-of-order job responses do not move progress backwards", async ({ page }) => {
    // 状況の取得の応答を保留し、新しい応答の後に古い応答を届ける（応答の時間に頼らない）
    await open(page, { jobStep: 1000, ignoreAbort: true })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toHaveAttribute("data-state", "running")
    await call(page, "set", { hold: { "job-list": true } })
    const newHeld = async (known: number[]) => {
      await expect.poll(async () => (await heldRequests(page, "job-list", "hq", { includeAborted: true })).some((h) => !known.includes(h.id))).toBe(true)
      return (await heldRequests(page, "job-list", "hq", { includeAborted: true })).find((h) => !known.includes(h.id))!.id
    }
    const ids = async () => (await heldRequests(page, "job-list", "hq", { includeAborted: true })).map((h) => h.id)
    const revision = () => read<number>(page, "(s) => s.jobsOf('hq')[0].revision")
    const before = await ids()
    await jobsDemo(page).getByRole("button", { name: "状況を更新" }).click()
    const older = await newHeld(before)
    // サーバーで処理が進む（版が増える）のを待ってから、新しい要求を送る
    const rev = await revision()
    await expect.poll(revision, { timeout: 5000 }).toBeGreaterThan(rev)
    const known = await ids()
    await jobsDemo(page).getByRole("button", { name: "状況を更新" }).click()
    const newer = await newHeld(known)
    await call(page, "release", newer, "success")
    const bar = item(page).getByRole("progressbar")
    await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow"))).toBeGreaterThan(0)
    const latest = Number(await bar.getAttribute("aria-valuenow"))
    await call(page, "release", older, "success")
    await flush(page)
    // 古い応答（前の版）で進捗を戻さない
    expect(Number(await bar.getAttribute("aria-valuenow"))).toBe(latest)
    await call(page, "set", { hold: {} })
    await call(page, "releaseAll", "job-list", "success")
    await expect(item(page)).toHaveAttribute("data-state", "succeeded", { timeout: 10_000 })
  })
})

// ------------------------------------------------------------------ 動きを減らす設定
test.describe("System States: reduced motion", () => {
  test.use({ reducedMotion: "reduce" })
  test("the reconnecting icon does not spin", async ({ page }) => {
    await open(page, { maintenance: [] })
    await call(page, "setReachable", false)
    await page.getByTestId("sys-retry").getByRole("button", { name: "再接続を試す" }).click()
    const icon = banner(page).locator("[data-slot=condition-icon][data-condition=connecting]")
    await expect(icon).toBeVisible()
    expect(await icon.evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
  })
})

// ------------------------------------------------------------------ 独立レビューの指摘の検品
test.describe("System States: review fixes", () => {
  const jobsFrame = (page: Page) => page.getByTestId("sys-jobs-demo")
  const startButton = (page: Page) => jobsDemo(page).getByRole("button", { name: "顧客を書き出す" })

  test("switching workspaces while a job start is pending: the busy state belongs to its workspace and is released by the response", async ({ page }) => {
    await open(page, { hold: { "job-start": true } })
    await startButton(page).click()
    await expect(startButton(page)).toHaveAttribute("aria-busy", "true")
    // 開始の要求を保留している間に、ワークスペースを切り替える
    await expect.poll(async () => (await heldRequests(page, "job-start")).length).toBe(1)
    await jobsFrame(page).getByLabel("西日本営業部").check()
    await expect(jobsDemo(page)).toHaveAttribute("data-workspace", "west")
    // 別のワークスペースでは、開始の要求中として示さない
    await expect(startButton(page)).toBeEnabled()
    await expect(startButton(page)).not.toHaveAttribute("aria-busy", "true")
    await jobsFrame(page).getByLabel("本社営業部").check()
    // A → B → A と戻った後も、最初の A の要求が終わるまでは開始を受け付けない（サーバーで処理されている可能性があるため）
    await expect(startButton(page)).toHaveAttribute("aria-busy", "true")
    // 応答が届いたら、どちらのワークスペースでも解除する。サーバーで始まった処理は、一覧の取得で示す
    await call(page, "set", { hold: {} })
    await call(page, "releaseAll", "job-start", "success")
    await expect(startButton(page)).toBeEnabled()
    await expect(startButton(page)).not.toHaveAttribute("aria-busy", "true")
    await expect(jobsDemo(page).locator("[data-job=job-export-1]")).toBeVisible()
    await jobsFrame(page).getByLabel("西日本営業部").check()
    await expect(startButton(page)).toBeEnabled()
    await expect(startButton(page)).not.toHaveAttribute("aria-busy", "true")
  })

  test("a job start error is shown only in its workspace and not after switching", async ({ page }) => {
    await open(page, { jobStartOutcome: "fail" })
    await startButton(page).click()
    await expect(jobsDemo(page).getByTestId("sys-jobs-message")).toHaveText("開始できませんでした。")
    await jobsFrame(page).getByLabel("西日本営業部").check()
    await expect(jobsDemo(page).getByTestId("sys-jobs-message")).toHaveCount(0)
    await jobsFrame(page).getByLabel("本社営業部").check()
    await expect(jobsDemo(page).getByTestId("sys-jobs-message")).toHaveCount(0)

    // 応答の前に切り替えた場合、届いた失敗をどちらのワークスペースにも示さない
    await call(page, "set", { hold: { "job-start": true } })
    await startButton(page).click()
    await expect.poll(async () => (await heldRequests(page, "job-start")).length).toBe(1)
    await jobsFrame(page).getByLabel("西日本営業部").check()
    await expect(jobsDemo(page)).toHaveAttribute("data-workspace", "west")
    expect(await call(page, "releaseAll", "job-start", "fail")).toBe(1)
    await flush(page)
    await expect(jobsDemo(page).getByTestId("sys-jobs-message")).toHaveCount(0)
    await expect(startButton(page)).toBeEnabled()
    await jobsFrame(page).getByLabel("本社営業部").check()
    await expect(jobsDemo(page).getByTestId("sys-jobs-message")).toHaveCount(0)
  })

  test("with toast notifications, failed, partial and unknown results are still announced by the list; success goes to the toast only", async ({ page }) => {
    await open(page, { jobStep: 250, jobOutcome: "failed" })
    const liveRegion = jobsDemo(page).locator("[data-slot=job-status-live]")
    await expect(liveRegion).toHaveAttribute("role", "status")
    await startButton(page).click()
    await expect(jobsDemo(page).locator("[data-job=job-export-1]")).toHaveAttribute("data-state", "failed", { timeout: 6000 })
    await expect(liveRegion).toHaveText("顧客の書き出し（処理 1）が失敗しました")
    await expect(page.locator("[data-slot=toast]")).toHaveCount(0)

    await call(page, "set", { jobOutcome: "partial" })
    await jobsDemo(page).getByRole("button", { name: "顧客を取り込む" }).click()
    await expect(jobsDemo(page).locator("[data-job=job-import-2]")).toHaveAttribute("data-state", "partial", { timeout: 6000 })
    await expect(liveRegion).toHaveText("顧客の取り込み（処理 2）が一部失敗しました")

    await call(page, "set", { jobOutcome: "unknown" })
    await startButton(page).click()
    await expect(jobsDemo(page).locator("[data-job=job-export-3]")).toHaveAttribute("data-state", "unknown", { timeout: 6000 })
    await expect(liveRegion).toHaveText("顧客の書き出し（処理 3）の結果を確認できません")

    await call(page, "set", { jobOutcome: "succeeded" })
    await startButton(page).click()
    await expect(jobsDemo(page).locator("[data-job=job-export-4]")).toHaveAttribute("data-state", "succeeded", { timeout: 6000 })
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "顧客の書き出しが完了しました" })).toHaveCount(1)
    // 成功は Toast で伝えるため、一覧の読み上げに重ねない
    await expect(liveRegion).not.toContainText("完了しました")
  })

  test("direct registration cannot be sent twice, also with an unknown result before it is checked", async ({ page }) => {
    await open(page, { hold: { register: true } })
    const form = page.getByTestId("sys-offline-register")
    const submit = form.getByRole("button", { name: "登録", exact: true })
    await form.getByLabel("会社名").fill("テスト商事")
    // 同じ描画の中の 2 回の押下
    await submit.evaluate((b) => {
      ;(b as HTMLButtonElement).click()
      ;(b as HTMLButtonElement).click()
    })
    // 応答を保留している間（送信中）は、押せない。強制した押下も送らない
    await expect.poll(async () => (await heldRequests(page, "register")).length).toBe(1)
    await expect(submit).toBeDisabled()
    await submit.click({ force: true })
    expect(await requests(page, "register")).toBe(1)
    await call(page, "set", { hold: {} })
    await call(page, "releaseAll", "register", "success")
    await expect(form.getByTestId("sys-offline-message")).toHaveText("テスト商事を登録しました。")
    expect(await requests(page, "register")).toBe(1)
    expect(await read<number>(page, "(s) => s.registeredCount()")).toBe(1)

    await call(page, "set", { syncOutcome: "unknown" })
    await form.getByLabel("会社名").fill("みらい物産")
    await submit.click()
    const message = form.getByTestId("sys-offline-message")
    await expect(message).toHaveAttribute("data-direct", "unknown")
    await expect(message).toHaveText("登録できたかを確認できません。入力した内容は残っています。登録されたかを確かめてください。")
    await expect(submit).toBeDisabled()
    await submit.click({ force: true })
    await flush(page)
    expect(await requests(page, "register")).toBe(2)
    await form.getByRole("button", { name: "登録されたかを確認" }).click()
    await expect(message).toHaveText("みらい物産は登録されていました。")
    expect(await requests(page, "register")).toBe(2)
    expect(await read<number>(page, "(s) => s.registeredCount()")).toBe(2)
    await expect(form.getByLabel("会社名")).toHaveValue("")
  })

  test("offline registration: two presses in one frame save one item on the device", async ({ page }) => {
    await open(page)
    const form = page.getByTestId("sys-offline-register")
    await form.getByLabel("オフライン登録（端末に保存し、後で同期）").check()
    await call(page, "setBrowserOnline", false)
    await form.getByLabel("会社名").fill("みらい物産")
    await form.getByRole("button", { name: "端末に保存" }).evaluate((b) => {
      ;(b as HTMLButtonElement).click()
      ;(b as HTMLButtonElement).click()
    })
    await expect(form.getByTestId("sys-offline-queue").locator("li")).toHaveCount(1)
    await call(page, "setBrowserOnline", true)
    await expect(form.getByTestId("sys-offline-queue").locator("li")).toHaveAttribute("data-sync", "synced")
    expect(await read<number>(page, "(s) => s.registeredCount()")).toBe(1)
  })

  const save = (page: Page) => page.getByTestId("sys-save")

  test("memo fetch failure: the reason and a retry are shown; while offline the input is not promised; it is fetched again after reconnecting", async ({ page }) => {
    await open(page)
    const status = save(page).getByTestId("sys-save-status")
    await call(page, "set", { memoFailures: 1 })
    await save(page).getByLabel("西日本営業部").check()
    await expect(status).toHaveText("メモを取得できませんでした。")
    await expect(save(page).getByRole("textbox")).toBeDisabled()
    await save(page).getByRole("button", { name: "再試行" }).click()
    await expect(status).toHaveAttribute("data-loaded", "true")
    await expect(save(page).getByRole("textbox")).toBeEnabled()

    await call(page, "setBrowserOnline", false)
    await save(page).getByLabel("本社営業部").check()
    await expect(status).toHaveText("オフラインのため、メモを取得できません。接続が回復すると取得します。")
    await expect(status).not.toContainText("入力した内容は、この画面に残ります")
    await expect(save(page).getByRole("textbox")).toBeDisabled()
    await call(page, "setBrowserOnline", true)
    await expect(status).toHaveAttribute("data-loaded", "true")
    await expect(save(page).getByRole("textbox")).toHaveValue("次回の訪問で、契約の更新を相談する。")
  })

  test("a failed refetch after reconnecting is not reported as the latest content", async ({ page }) => {
    await open(page, { maintenance: [], latency: { list: 600 } })
    await call(page, "setBrowserOnline", false)
    await expect(banner(page)).toContainText("オフラインです")
    await call(page, "set", { listFailures: 1 })
    await call(page, "setBrowserOnline", true)
    const notice = banner(page).locator("[data-slot=system-banner-notice]")
    await expect(notice).toContainText("接続が回復しました", { timeout: 8000 })
    await expect(notice).toContainText("最新の内容を取得できなかった領域があります。")
    await expect(notice).not.toContainText("最新の内容を表示しています。")
    const warning = app(page).getByTestId("sys-customers-refresh-error")
    await expect(warning).toContainText("最新の内容を取得できませんでした")
    await expect(rows(page)).toHaveCount(5)
    await warning.getByRole("button", { name: "再試行" }).click()
    await expect(warning).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 接続の確認（v0.1 の最終調整 8 章）
// 応答の順序は、模擬のサーバーの保留と解放（hold、release）で決める。時間に依存する箇所は page.clock で進める。
test.describe("System States: connectivity confirmation", () => {
  const indicator = (page: Page) => page.getByTestId("sys-indicator")
  const callFrame = (page: Page) => page.getByTestId("sys-indicator-frame")

  test("first load while the browser is offline: offline at once, no probe, nothing allowed; recovers after the probe", async ({ page }) => {
    await open(page, { browserOnline: false, maintenance: [] }, { waitRows: false })
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "offline")
    await expect(page.getByTestId("sys-retry-status")).toHaveText("オフライン（端末）")
    await expect(exportButton(page)).toBeDisabled()
    await expect(app(page).getByTestId("sys-jobs-reason")).toHaveText("オフラインのため、書き出しを開始できません。")
    await expect(indicator(page)).toHaveText("接続していません")
    await expect(banner(page)).toContainText("オフラインです")
    // ブラウザが offline の間は疎通を確認しない
    expect(await requests(page, "probe")).toBe(0)
    await call(page, "setBrowserOnline", true)
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "online")
    // 最初の取得は失敗しているため、接続を確認できたら取得し直す
    await expect(rows(page)).toHaveCount(5)
    await expect(exportButton(page)).toBeEnabled()
  })

  test("first load while the service is unreachable: never allowed before a confirmation; data is fetched after it", async ({ page }) => {
    // 書き出しのボタンが一度でも有効になったかを、最初の描画から記録する
    await page.addInitScript(() => {
      const w = window as unknown as { __exportEverEnabled: boolean }
      w.__exportEverEnabled = false
      new MutationObserver(() => {
        const buttons = document.querySelectorAll<HTMLButtonElement>("[data-testid=sys-app] [data-testid=sys-export-jobs] button")
        for (const b of buttons) if (!b.disabled && b.getAttribute("aria-disabled") !== "true") w.__exportEverEnabled = true
      }).observe(document, { subtree: true, childList: true, attributes: true })
    })
    await open(page, { reachable: false, maintenance: [] }, { waitRows: false })
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "connecting")
    // 一度も接続を確認していないため「再接続」としない
    await expect(banner(page)).toContainText("サービスに接続しています")
    await expect(exportButton(page)).toBeDisabled()
    await expect(page.getByTestId("sys-retry-attempt")).toHaveText(/^[1-9] 回/)
    expect(await page.evaluate(() => (window as unknown as { __exportEverEnabled: boolean }).__exportEverEnabled)).toBe(false)
    await call(page, "setReachable", true)
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "online", { timeout: 10_000 })
    await expect(rows(page)).toHaveCount(5)
    await expect(exportButton(page)).toBeEnabled()
  })

  test("probe timeout: a probe that ignores AbortSignal and answers after the timeout is not applied", async ({ page }) => {
    await page.clock.install()
    await open(page, { maintenance: [], hold: { probe: true }, ignoreAbort: true })
    await expect(indicator(page)).toHaveAttribute("data-status", "unknown")
    const [first] = await heldRequests(page, "probe", "tokyo")
    expect(first).toBeTruthy()
    // 通話の例の待ち時間の上限は 3 秒
    await page.clock.fastForward(3000)
    await expect(indicator(page)).toHaveAttribute("data-status", "connecting")
    await expect(callFrame(page)).toHaveAttribute("data-attempt", "1")
    // タイムアウトの後に届いた成功は反映しない
    await call(page, "release", first.id, "success")
    await flush(page)
    await expect(indicator(page)).toHaveAttribute("data-status", "connecting")
    // 自動の確認（1 秒後）：失敗すると 2 回目になる（後から届いた成功を反映していれば、回数は 0 に戻る）
    await page.clock.fastForward(1000)
    await expect.poll(async () => (await heldRequests(page, "probe", "tokyo")).length).toBe(1)
    await call(page, "releaseAll", "probe", "fail")
    await expect(callFrame(page)).toHaveAttribute("data-attempt", "2")
    await expect(indicator(page)).toHaveAttribute("data-status", "connecting")
    await page.clock.fastForward(2000)
    await expect.poll(async () => (await heldRequests(page, "probe", "tokyo")).length).toBe(1)
    await call(page, "releaseAll", "probe", "success")
    await expect(indicator(page)).toHaveAttribute("data-status", "online")
  })

  test("an older probe response does not overwrite the result of the user's newer check", async ({ page }) => {
    await open(page, { maintenance: [], hold: { probe: true }, ignoreAbort: true })
    const [first] = await heldRequests(page, "probe", "tokyo")
    await callFrame(page).getByRole("button", { name: "接続を確認" }).click()
    await expect.poll(async () => (await heldRequests(page, "probe", "tokyo")).length).toBe(2)
    const second = (await heldRequests(page, "probe", "tokyo")).find((h) => h.id !== first.id)!
    // 古い確認の成功を先に、新しい確認の失敗を後に届ける。古い応答を反映していれば online のまま
    await call(page, "release", first.id, "success")
    await call(page, "release", second.id, "fail")
    await expect(indicator(page)).toHaveAttribute("data-status", "connecting")
    await expect(callFrame(page)).toHaveAttribute("data-attempt", "1")
    await expect(page.getByTestId("sys-call-start")).toBeDisabled()
  })

  test("target A → B → A: responses for the first A and for B are not applied to the current A", async ({ page }) => {
    await open(page, { maintenance: [], hold: { probe: true }, ignoreAbort: true })
    const call_ = page.getByTestId("sys-call")
    const [tokyo1] = await heldRequests(page, "probe", "tokyo")
    await call_.getByLabel("大阪の通話サーバー").check()
    await expect(callFrame(page)).toHaveAttribute("data-target", "osaka")
    await expect(indicator(page)).toHaveAttribute("data-status", "unknown")
    await expect.poll(async () => (await heldRequests(page, "probe", "osaka")).length).toBe(1)
    const [osaka1] = await heldRequests(page, "probe", "osaka")
    await call_.getByLabel("東京の通話サーバー").check()
    await expect.poll(async () => (await heldRequests(page, "probe", "tokyo")).length).toBe(2)
    const tokyo2 = (await heldRequests(page, "probe", "tokyo")).find((h) => h.id !== tokyo1.id)!
    // 最初の A と B の成功を先に、現在の A の失敗を後に届ける
    await call(page, "release", tokyo1.id, "success")
    await call(page, "release", osaka1.id, "success")
    await call(page, "release", tokyo2.id, "fail")
    await expect(indicator(page)).toHaveAttribute("data-status", "connecting")
    await expect(page.getByTestId("sys-call-start")).toBeDisabled()
    // 確認できた後に接続先を変えたら、同じ描画から前の接続先の確認を使わない
    await callFrame(page).getByRole("button", { name: "接続を確認" }).click()
    await expect.poll(async () => (await heldRequests(page, "probe", "tokyo")).length).toBe(1)
    await call(page, "releaseAll", "probe", "success")
    await expect(indicator(page)).toContainText("東京の通話サーバーに接続しています")
    await call_.getByLabel("大阪の通話サーバー").check()
    await expect(indicator(page)).toHaveAttribute("data-status", "unknown")
    await expect(indicator(page)).not.toContainText("接続しています")
    await expect(page.getByTestId("sys-call-start")).toBeDisabled()
  })

  // 独立レビュー H1：最初の描画の関数を購読（browserOnline.subscribe）に保持したまま接続先を変えると、online の通知の後の確認が
  // 無効な Ticket で始まり、connecting のまま止まっていた。接続先を変えた後（A → B、A → B → A）の offline → online を確かめる。
  test("after changing the target (A → B and A → B → A), a browser offline → online is confirmed again and is not stuck in connecting", async ({ page }) => {
    await open(page, { maintenance: [], hold: { probe: true } })
    const call_ = page.getByTestId("sys-call")
    const start = page.getByTestId("sys-call-start")
    const check = callFrame(page).getByRole("button", { name: "接続を確認" })
    /** その接続先の、保留している疎通の確認を 1 件待って解放する */
    const answer = async (target: string, outcome: "success" | "fail") => {
      await expect.poll(async () => (await heldRequests(page, "probe", target)).length).toBe(1)
      const [h] = await heldRequests(page, "probe", target)
      expect(await call(page, "release", h.id, outcome)).toBe(1)
    }
    const offlineOnline = async () => {
      await call(page, "setBrowserOnline", false)
      await expect(indicator(page)).toHaveAttribute("data-status", "offline")
      await expect(start).toBeDisabled()
      await call(page, "setBrowserOnline", true)
      // online の通知だけでは接続としない
      await expect(indicator(page)).toHaveAttribute("data-status", "connecting")
    }
    await answer("tokyo", "success")
    await expect(indicator(page)).toContainText("東京の通話サーバーに接続しています")

    // A → B：大阪で確認できた後に offline → online
    await call_.getByLabel("大阪の通話サーバー").check()
    await answer("osaka", "success")
    await expect(indicator(page)).toContainText("大阪の通話サーバーに接続しています")
    await offlineOnline()
    await expect(check).toHaveAttribute("aria-disabled", "true")
    await answer("osaka", "success")
    await expect(indicator(page)).toHaveAttribute("data-status", "online")
    await expect(indicator(page)).toContainText("大阪の通話サーバーに接続しています")
    await expect(start).toBeEnabled()
    await expect(check).not.toHaveAttribute("aria-disabled", "true")

    // 失敗した確認の後の自動の確認（タイマー）も、変更の後の接続先で始まり、結果が反映される
    await offlineOnline()
    await answer("osaka", "fail")
    await expect(callFrame(page)).toHaveAttribute("data-attempt", "1")
    await answer("osaka", "success")
    await expect(indicator(page)).toHaveAttribute("data-status", "online")
    await expect(callFrame(page)).toHaveAttribute("data-attempt", "0")

    // A → B → A：最初の A と同じ接続先に戻った後の offline → online
    await call_.getByLabel("東京の通話サーバー").check()
    await answer("tokyo", "success")
    await expect(indicator(page)).toContainText("東京の通話サーバーに接続しています")
    await offlineOnline()
    await answer("tokyo", "success")
    await expect(indicator(page)).toHaveAttribute("data-status", "online")
    await expect(start).toBeEnabled()
    await expect(check).not.toHaveAttribute("aria-disabled", "true")
    // 前の接続先への確認を送っていない
    expect(await heldRequests(page, "probe", "osaka")).toHaveLength(0)
  })

  test("without a probe API: only a business response confirms; a network failure returns to unconfirmed; responses for an old target are ignored", async ({ page }) => {
    await open(page, { maintenance: [] })
    const call_ = page.getByTestId("sys-call")
    await call_.getByLabel("業務の要求の応答（疎通の確認の API なし）").check()
    await expect(callFrame(page)).toHaveAttribute("data-mode", "request")
    await expect(indicator(page)).toHaveText("接続を確認していません")
    await expect(page.getByTestId("sys-call-start")).toBeDisabled()
    const probes = await read<{ kind: string; detail?: string }[]>(page, "(s) => s.requests").then((r) => r.filter((x) => x.kind === "probe" && x.detail).length)
    const fetchHistory = callFrame(page).getByRole("button", { name: "通話の履歴を取得" })
    await fetchHistory.click()
    await expect(indicator(page)).toHaveAttribute("data-status", "online")
    await expect(indicator(page)).toHaveAttribute("data-confirmed-by", "request")
    await expect(page.getByTestId("sys-call-start")).toBeEnabled()
    await call(page, "setReachable", false)
    await fetchHistory.click()
    await expect(indicator(page)).toHaveAttribute("data-status", "unknown")
    await expect(page.getByTestId("sys-call-start")).toBeDisabled()
    await call(page, "setReachable", true)
    // 東京で始めた要求の応答を、大阪に切り替えた後に届ける
    await call(page, "set", { hold: { list: true } })
    await fetchHistory.click()
    await expect.poll(async () => (await heldRequests(page, "list")).length).toBe(1)
    await call_.getByLabel("大阪の通話サーバー").check()
    await expect(callFrame(page)).toHaveAttribute("data-target", "osaka")
    await call(page, "releaseAll", "list", "success")
    await flush(page)
    await expect(indicator(page)).toHaveAttribute("data-status", "unknown")
    await expect(page.getByTestId("sys-call-start")).toBeDisabled()
    // 疎通の確認の API を呼ばない
    expect(await read<{ kind: string; detail?: string }[]>(page, "(s) => s.requests").then((r) => r.filter((x) => x.kind === "probe" && x.detail).length)).toBe(probes)
  })

  test("after unmount, pending probes, timers and late responses do nothing", async ({ page }) => {
    await page.clock.install()
    await open(page, { maintenance: [] })
    // 状態の取得の応答（reportReachable）が確認を止めても、応答を保留したままにする（ignoreAbort）
    await call(page, "set", { hold: { probe: true }, ignoreAbort: true })
    await page.getByTestId("sys-retry").getByRole("button", { name: "再接続を試す" }).click()
    await expect.poll(async () => (await heldRequests(page, "probe", undefined, { includeAborted: true })).length).toBeGreaterThan(0)
    await page.goto("/#/data-states")
    await expect(page.getByRole("heading", { level: 1, name: "Data States" })).toBeVisible()
    await call(page, "set", { hold: {}, reachable: false })
    await call(page, "releaseAll", "probe", "fail")
    const before = await requests(page, "probe")
    // 再試行の間隔の上限（8 秒）を超えて進めても、アンマウントした画面から確認を送らない
    await page.clock.fastForward(60_000)
    await flush(page)
    expect(await requests(page, "probe")).toBe(before)
  })

  test("a component outage that stops operations is shown and announced at once; a slowdown waits for the display delay", async ({ page }) => {
    await page.clock.install()
    await open(page, { maintenance: [] })
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "online")
    const t = await page.evaluate(() => Date.now())
    await page.clock.pauseAt(t + 100)
    await call(page, "setService", "customers", "outage")
    // 状態の取得（300ms ごと、応答 80ms）が届くまで進める。表示の遅延（1 秒）は待たない
    await page.clock.runFor(400)
    await expect(banner(page)).toContainText("顧客の閲覧と編集を利用できません")
    await expect(banner(page)).toContainText("保存はできません。")
    await page.clock.runFor(1)
    await expect(live(banner(page))).toContainText("顧客の閲覧と編集を利用できません")
    await expect(exportButton(page)).toBeEnabled()

    await call(page, "setService", "sign-in", "degraded")
    await page.clock.runFor(400)
    await flush(page)
    await expect(banner(page)).not.toContainText("ログインの動作が遅くなっています")
    await page.clock.runFor(1000)
    await expect(banner(page)).toContainText("ほか 1 件の問題")
  })

  test("invalid job progress and counts are not shown as success", async ({ page }) => {
    await open(page, { jobStep: 300, jobInvalidReport: "progress" })
    const item = jobsDemo(page).locator("[data-slot=job-status-item]").first()
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item).toHaveAttribute("data-progress", "invalid", { timeout: 4000 })
    await expect(item).toContainText("進み具合を確認できません")
    await expect(item.getByRole("progressbar")).toHaveCount(0)
    await expect(item).toHaveAttribute("data-state", "unknown", { timeout: 6000 })
    await expect(item).toContainText("結果を確認できません")
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)

    await call(page, "set", { jobInvalidReport: "counts" })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item).toContainText("処理 2")
    await expect(item).toHaveAttribute("data-state", "unknown", { timeout: 6000 })
    await expect(jobsDemo(page).locator("[data-slot=job-status-live]")).toHaveText("顧客の書き出し（処理 2）の結果を確認できません")
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)
  })
})
