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

async function open(page: Page, init: Init = {}) {
  const merged = { ...fast, ...init, latency: { ...fast.latency, ...init.latency } }
  await page.addInitScript((value) => {
    window.__fdSaSystemServerInit = value
  }, merged)
  await page.goto("/#/system-states")
  await expect(page.getByRole("heading", { level: 1, name: "System States" })).toBeVisible()
  await expect(rows(page)).toHaveCount(5)
}

const call = <K extends keyof Server>(page: Page, method: K, ...args: Server[K] extends (...a: infer A) => unknown ? A : never) =>
  page.evaluate(([m, a]) => (window.__fdSaSystemServer as unknown as Record<string, (...x: unknown[]) => unknown>)[m as string](...(a as unknown[])), [method, args] as const)
const read = <T,>(page: Page, fn: string) => page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdSaSystemServer), fn) as Promise<T>
const requests = (page: Page, kind: string) => read<{ kind: string }[]>(page, "(s) => s.requests").then((r) => r.filter((x) => x.kind === kind).length)

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
    await open(page, { maintenance: [] })
    await page.waitForTimeout(1500)
    await expect(banner(page)).toHaveAttribute("data-empty", "true")
    await expect(live(banner(page))).toHaveAttribute("role", "status")
    await expect(live(banner(page))).toHaveAttribute("aria-live", "polite")
    await expect(live(banner(page))).toHaveText("")
    await expect(app(page)).not.toContainText("正常")
    // 接続の常時表示：一度も疎通を確認していない間は「正常」と示さない
    await expect(page.getByTestId("sys-indicator")).toHaveText("接続を確認していません")
    await expect(page.getByTestId("sys-indicator")).toHaveAttribute("data-condition", "unknown")
    await page.getByTestId("sys-indicator-frame").getByRole("button", { name: "接続を確認" }).click()
    await expect(page.getByTestId("sys-indicator")).toContainText("通話のサーバーに接続しています")
  })

  test("offline: restrictions apply at once; the banner appears after it persists; existing data stays with its time; focus is kept", async ({ page }) => {
    await open(page)
    const search = app(page).getByRole("textbox", { name: "会社名で検索" })
    await search.focus()
    const before = await requests(page, "job-start")
    await call(page, "setBrowserOnline", false)
    // 安全性に必要な制限は遅らせない
    await expect(exportButton(page)).toBeDisabled({ timeout: 300 })
    await expect(app(page).getByRole("button", { name: "検索" })).toBeDisabled({ timeout: 300 })
    // 表示は 1 秒続いてから
    await page.waitForTimeout(400)
    await expect(banner(page)).not.toContainText("オフラインです")
    await expect(banner(page)).toContainText("オフラインです")
    await expect(banner(page)).toContainText("表示中の内容は、最後に取得した時点のものです。")
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
    await page.waitForTimeout(600)
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "connecting")
    await expect(exportButton(page)).toBeDisabled()
    await expect(banner(page)).toContainText("再接続しています")
    await call(page, "setReachable", true)
    await expect(page.getByTestId("sys-retry-status")).toHaveAttribute("data-status", "online", { timeout: 6000 })
    await expect(exportButton(page)).toBeEnabled()
  })

  test("safe retry: probes back off and stop at the limit; attempts are not re-announced; manual retry recovers", async ({ page }) => {
    test.setTimeout(40_000)
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
    await page.waitForTimeout(3000)
    expect((await requests(page, "probe")) - probesBefore).toBe(4)
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
    await open(page, { maintenance: [], latency: { list: 1800 } })
    await call(page, "setBrowserOnline", false)
    await expect(banner(page)).toContainText("オフラインです")
    const lists = await requests(page, "list")
    await call(page, "setBrowserOnline", true)
    await expect(banner(page)).toContainText("接続が回復しました。最新の内容を確認しています")
    expect(await requests(page, "list")).toBe(lists + 1)
    await expect(app(page).getByTestId("sys-customers-time")).toHaveText("", { timeout: 4000 })
    await expect(banner(page).locator("[data-slot=system-banner-notice]")).toContainText("接続が回復しました", { timeout: 6000 })
    await expect(live(banner(page))).toContainText("接続が回復しました", { timeout: 3000 })
  })

  test("a short failure that resolves by itself shows nothing and no recovery notice", async ({ page }) => {
    await open(page, { maintenance: [] })
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid=sys-app] [data-slot=system-banner]")!
      const seen: string[] = ((window as unknown as { __sysSeen: string[] }).__sysSeen = [])
      new MutationObserver(() => seen.push(el.textContent ?? "")).observe(el, { subtree: true, childList: true, characterData: true })
    })
    await call(page, "setBrowserOnline", false)
    await page.waitForTimeout(400)
    await call(page, "setBrowserOnline", true)
    await page.waitForTimeout(4000)
    const seen = await page.evaluate(() => (window as unknown as { __sysSeen: string[] }).__sysSeen)
    expect(seen.join("|")).not.toContain("オフライン")
    expect(seen.join("|")).not.toContain("回復")
    await expect(banner(page)).toHaveAttribute("data-empty", "true")
  })

  test("flapping: restrictions follow immediately; the banner is shown once and announcements are not repeated", async ({ page }) => {
    test.setTimeout(30_000)
    await open(page, { maintenance: [], latency: { probe: 50 } })
    const demo = page.getByTestId("sys-flapping")
    await demo.getByRole("button", { name: "接続と切断を 5 回繰り返す" }).click()
    await expect(demo.getByTestId("sys-flapping-allowed")).toHaveAttribute("data-allowed", "false", { timeout: 300 })
    await expect(demo.getByRole("button", { name: "接続と切断を 5 回繰り返す" })).toBeEnabled({ timeout: 6000 })
    await page.waitForTimeout(4500)
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
    // 実際には解消していても、確かめられないうちは解消したと示さない
    await page.waitForTimeout(400)
    await call(page, "applyScenario", "operational")
    await page.waitForTimeout(1200)
    await expect(banner(page)).toContainText("顧客の閲覧と編集の動作が遅くなっています")
    await expect(page.getByTestId("sys-status-page")).not.toHaveAttribute("data-overall", "operational")
  })

  test("status page: overall, components, current incidents with response status, maintenance, history, last update; no internal details", async ({ page }) => {
    await open(page)
    await call(page, "applyScenario", "multiple")
    const status = page.getByTestId("sys-status-page")
    await status.getByRole("button", { name: "最新の状態を取得" }).click()
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
    await expect(item).toContainText("端末に保存しました（まだ登録されていません）")
    await expect(item).not.toContainText("登録しました")
    expect(await read<number>(page, "(s) => s.registeredCount()")).toBe(0)
    await call(page, "setBrowserOnline", true)
    await expect(item).toHaveAttribute("data-sync", "synced")
    await expect(item).toContainText("登録しました")
    expect(await read<number>(page, "(s) => s.registeredCount()")).toBe(1)
    expect(await requests(page, "register")).toBe(1)
  })

  test("offline registration: an unknown sync result is checked before sending again; a conflict is shown", async ({ page }) => {
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
    await page.waitForTimeout(800)
    // 結果を確かめる前に、送り直さない
    expect(await requests(page, "register")).toBe(1)
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
    await open(page, { saveOutcome: "unknown" })
    await expect(memo(page)).toHaveValue("次回の訪問で、契約の更新を相談する。")
    await memo(page).fill("見積もりを送る")
    await save(page).getByRole("button", { name: "保存" }).click()
    const status = save(page).getByTestId("sys-save-status")
    await expect(status).toHaveAttribute("data-status", "unknown")
    await expect(status).toHaveText("保存できたかを確認できません。通信が切れたため、サーバーでは保存されている可能性があります。")
    await expect(status).toHaveAttribute("role", "status")
    // サーバーでは保存されている
    expect(await memoOnServer(page)).toBe("見積もりを送る")
    await expect(save(page).getByRole("button", { name: "保存", exact: true })).toBeDisabled()
    await expect(save(page).getByRole("button", { name: /再試行|もう一度/ })).toHaveCount(0)
    await page.waitForTimeout(800)
    expect(await requests(page, "save")).toBe(1)
    await save(page).getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(status).toHaveAttribute("data-status", "saved")
    await expect(status).toHaveText("保存しました。")
  })

  test("unknown save result is checked automatically after reconnecting", async ({ page }) => {
    await open(page, { saveOutcome: "unknown" })
    await memo(page).fill("訪問の日程を決める")
    await save(page).getByRole("button", { name: "保存" }).click()
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
    await open(page, { saveOutcome: "fail" })
    await memo(page).fill("契約書を送る")
    await save(page).getByRole("button", { name: "保存" }).click()
    const status = save(page).getByTestId("sys-save-status")
    await expect(status).toHaveAttribute("data-status", "failed")
    await expect(status).toHaveText("保存できませんでした。入力した内容は残っています。")
    await expect(memo(page)).toHaveValue("契約書を送る")
    await page.waitForTimeout(1200)
    expect(await requests(page, "save")).toBe(1)
    expect(await memoOnServer(page)).toBe("次回の訪問で、契約の更新を相談する。")

    await call(page, "setBrowserOnline", false)
    await expect(save(page).getByRole("button", { name: "保存" })).toBeDisabled({ timeout: 300 })
    await expect(status).toHaveText("オフラインのため、保存できません。入力した内容は、この画面に残ります。")
    await call(page, "set", { saveOutcome: "success" })
    await call(page, "setBrowserOnline", true)
    await expect(save(page).getByRole("button", { name: "保存" })).toBeEnabled()
    await expect(memo(page)).toHaveValue("契約書を送る")
    await save(page).getByRole("button", { name: "保存" }).click()
    await expect(status).toHaveAttribute("data-status", "saved")
  })

  test("workspace A → B → A: a late save result from the first A is not shown; the draft is not carried across workspaces", async ({ page }) => {
    await open(page, { ignoreAbort: true, latency: { save: 1500 } })
    await memo(page).fill("本社の下書き")
    await save(page).getByRole("button", { name: "保存" }).click()
    await expect(save(page).getByTestId("sys-save-status")).toHaveAttribute("data-status", "saving")
    await save(page).getByLabel("西日本営業部").check()
    // 別のワークスペースに、前の入力と状態を表示しない（同じ描画から）
    await expect(save(page)).toHaveAttribute("data-workspace", "west")
    await expect(memo(page)).not.toHaveValue("本社の下書き")
    await expect(save(page).getByTestId("sys-save-status")).toHaveAttribute("data-status", "idle")
    await save(page).getByLabel("本社営業部").check()
    await expect(save(page)).toHaveAttribute("data-workspace", "hq")
    await page.waitForTimeout(2000)
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
    await expect(item(page).getByRole("button", { name: "最新の状態を確認" })).toBeVisible()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)
  })

  test("jobs continue after leaving the page; old responses and other workspaces' results are not shown", async ({ page }) => {
    await open(page, { jobStep: 500, ignoreAbort: true })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toHaveAttribute("data-state", "running")
    // 別のワークスペース：前のワークスペースの処理を表示しない。完了の Toast も出さない
    await page.getByTestId("sys-jobs-demo").getByLabel("西日本営業部").check()
    await expect(jobsDemo(page)).toHaveAttribute("data-workspace", "west")
    await expect(jobsDemo(page).locator("[data-slot=job-status-item]")).toHaveCount(0)
    await expect.poll(() => read<string>(page, "(s) => s.jobsOf('hq')[0].state"), { timeout: 6000 }).toBe("succeeded")
    await page.waitForTimeout(500)
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)
    await page.getByTestId("sys-jobs-demo").getByLabel("本社営業部").check()
    await expect(item(page)).toHaveAttribute("data-state", "succeeded")
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)

    // ページを離れても処理は続き、戻ったときに状況を取得し直す
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toContainText("処理 2")
    await page.goto("/#/data-states")
    await expect(page.getByRole("heading", { level: 1, name: "Data States" })).toBeVisible()
    await page.waitForTimeout(800)
    await page.goto("/#/system-states")
    await expect(jobsDemo(page).locator("[data-job=job-export-2]")).toBeVisible()
    await expect(jobsDemo(page).locator("[data-job=job-export-2]")).toHaveAttribute("data-state", /running|succeeded/)
  })

  test("out-of-order job responses do not move progress backwards", async ({ page }) => {
    await open(page, { jobStep: 350, ignoreAbort: true, jobListLatencies: [] })
    await jobsDemo(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(item(page)).toHaveAttribute("data-state", "running")
    // 次の要求を遅く、その次を速くして、古い状態を後から届かせる
    await call(page, "set", { jobListLatencies: [1400, 40, 1400, 40, 1400, 40] })
    const values: number[] = []
    for (let i = 0; i < 14; i++) {
      if (i % 3 === 0) await jobsDemo(page).getByRole("button", { name: "状況を更新" }).click()
      const bar = item(page).getByRole("progressbar")
      if ((await bar.count()) > 0) values.push(Number(await bar.getAttribute("aria-valuenow")))
      await page.waitForTimeout(150)
    }
    expect(values.length).toBeGreaterThan(3)
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    await expect(item(page)).toHaveAttribute("data-state", "succeeded", { timeout: 6000 })
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
    await open(page, { latency: { "job-start": 1500 } })
    await startButton(page).click()
    await expect(startButton(page)).toHaveAttribute("aria-busy", "true")
    await jobsFrame(page).getByLabel("西日本営業部").check()
    await expect(jobsDemo(page)).toHaveAttribute("data-workspace", "west")
    // 別のワークスペースでは、開始の要求中として示さない
    await expect(startButton(page)).toBeEnabled()
    await expect(startButton(page)).not.toHaveAttribute("aria-busy", "true")
    await jobsFrame(page).getByLabel("本社営業部").check()
    // 応答が届いたら、どちらのワークスペースでも解除する。サーバーで始まった処理は、一覧の取得で示す
    await expect(startButton(page)).toBeEnabled({ timeout: 4000 })
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
    await call(page, "set", { latency: { "job-start": 1000 } })
    await startButton(page).click()
    await jobsFrame(page).getByLabel("西日本営業部").check()
    await page.waitForTimeout(1400)
    await expect(jobsDemo(page).getByTestId("sys-jobs-message")).toHaveCount(0)
    await expect(startButton(page)).toBeEnabled()
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
    await open(page, { latency: { register: 800 } })
    const form = page.getByTestId("sys-offline-register")
    const submit = form.getByRole("button", { name: "登録", exact: true })
    await form.getByLabel("会社名").fill("テスト商事")
    // 同じ描画の中の 2 回の押下
    await submit.evaluate((b) => {
      ;(b as HTMLButtonElement).click()
      ;(b as HTMLButtonElement).click()
    })
    await expect(submit).toBeDisabled()
    await submit.click({ force: true })
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
    await page.waitForTimeout(500)
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
    await save(page).getByRole("button", { name: "もう一度取得" }).click()
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
