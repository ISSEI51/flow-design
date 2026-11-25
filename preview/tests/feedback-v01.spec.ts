import { expect, test, type Locator, type Page } from "@playwright/test"

import { css, sameColor, token } from "./helpers"
import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// Feedback Components v0.1 の確定時に追加した回帰テスト

async function open(page: Page, id: string) {
  await page.goto(`/#/${id}`)
  await page.getByRole("heading", { level: 1 }).waitFor()
}

const box = async (l: Locator) => (await l.boundingBox())!
const visibleSvgs = (l: Locator) => l.locator(":scope > svg:visible, :scope > [data-slot=alert-icon]:visible")

test.describe("Alert icons", { tag: "@webkit" }, () => {
  test("variant, icon prop, child icon, icon=false never duplicate", async ({ page }) => {
    await open(page, "alert")
    const auto = page.getByTestId("alert-icon-auto")
    const prop = page.getByTestId("alert-icon-prop")
    const child = page.getByTestId("alert-icon-child")
    const none = page.getByTestId("alert-icon-none")
    await expect(visibleSvgs(auto)).toHaveCount(1)
    await expect(visibleSvgs(prop)).toHaveCount(1)
    await expect(visibleSvgs(child)).toHaveCount(1)
    await expect(none.locator("svg")).toHaveCount(0)
    // 子要素のアイコンは、自動のアイコンと同じ大きさ、色、位置
    const childIcon = child.locator(":scope > svg:not([data-slot=alert-icon])")
    expect((await box(childIcon)).width).toBe(20)
    expect(sameColor(await css(childIcon, "color"), await token(page, "--destructive"))).toBe(true)
    const titleX = async (a: Locator) => (await box(a.locator("[data-slot=alert-title]"))).x - (await box(a)).x
    expect(await titleX(child)).toBe(await titleX(auto))
    expect(await titleX(prop)).toBe(await titleX(auto))
    // アイコンなしは、タイトルが左端から始まる
    expect(await titleX(none)).toBe(17)
  })
})

test.describe("Avatar names", { tag: "@webkit" }, () => {
  test("label, alt, fallback, inside button and link", async ({ page }) => {
    await open(page, "avatar")
    // 名前と並べる、名前がない：装飾
    await expect(page.getByTestId("avatar-with-name").locator("[data-slot=avatar]")).toHaveAttribute("aria-hidden", "true")
    // label
    await expect(page.getByTestId("avatar-labelled")).toHaveAccessibleName("佐藤 健")
    // alt を名前にする
    const alt = page.getByTestId("avatar-alt")
    await expect(alt).toHaveAttribute("role", "img")
    await expect(alt).toHaveAccessibleName("佐藤 健")
    await expect(alt.locator("img")).toHaveAttribute("alt", "")
    // 画像の取得に失敗しても名前は残る
    const failed = page.getByTestId("avatar-alt-failed")
    await expect(failed.locator("[data-slot=avatar-fallback]")).toBeVisible()
    await expect(failed.locator("img")).toHaveCount(0)
    await expect(failed).toHaveAccessibleName("山田 花子")
    // ボタンの中：名前はボタン、Avatar は装飾
    const button = page.getByTestId("avatar-in-button")
    await expect(button).toHaveAccessibleName("佐藤 健のプロフィールを開く")
    await expect(button.locator("[data-slot=avatar]")).toHaveAttribute("aria-hidden", "true")
    // リンクの中：Avatar の label がリンクの名前になる
    await expect(page.getByTestId("avatar-in-link")).toHaveAccessibleName("山田 花子のプロフィール")
  })
})

test.describe("Tooltip delay precedence", () => {
  test("default 700ms, provider, trigger", async ({ page, isMobile }) => {
    test.skip(isMobile, "Base UI の Tooltip はタッチ操作では開かない")
    await open(page, "tooltip")
    const measure = async (trigger: string, tip: string) => {
      await page.mouse.move(0, 0)
      await page.waitForTimeout(500)
      const t = page.getByTestId(trigger)
      await t.scrollIntoViewIfNeeded()
      const start = Date.now()
      await t.hover()
      await page.getByTestId(tip).waitFor({ state: "visible", timeout: 4000 })
      const ms = Date.now() - start
      await page.mouse.move(0, 0)
      await expect(page.getByTestId(tip)).toHaveCount(0)
      return ms
    }
    const def = await measure("tooltip-default-trigger", "tooltip-default-delay")
    expect(def).toBeGreaterThanOrEqual(650)
    expect(def).toBeLessThan(1300)
    const provider = await measure("tooltip-provider-trigger", "tooltip-provider-delay")
    expect(provider).toBeGreaterThanOrEqual(150)
    expect(provider).toBeLessThan(650)
    const trigger = await measure("tooltip-trigger-delay-trigger", "tooltip-trigger-delay")
    expect(trigger).toBeGreaterThanOrEqual(1400)
  })
})

const visibleToasts = (page: Page) => page.locator("[data-slot=toast]:not([data-limited]):not([data-ending-style])")

test.describe("Toast limit", () => {
  test("a persistent error is not hidden by later successes", async ({ page }) => {
    await open(page, "toast")
    await page.getByTestId("toast-destructive").click()
    for (let i = 0; i < 3; i++) await page.getByTestId("toast-success").click()
    await page.waitForTimeout(300)
    await expect(visibleToasts(page)).toHaveCount(3)
    await expect(visibleToasts(page).and(page.locator("[data-variant=destructive]"))).toHaveCount(1)
    await expect(page.locator("[data-slot=toast][data-limited]")).toHaveCount(0)
  })

  test("an action toast stays usable when successes follow", async ({ page }) => {
    await open(page, "toast")
    await page.getByTestId("toast-action").click()
    for (let i = 0; i < 4; i++) await page.getByTestId("toast-success").click()
    await page.waitForTimeout(300)
    const action = visibleToasts(page).filter({ hasText: "請求書をアーカイブしました" })
    await expect(action).toHaveCount(1)
    await action.getByRole("button", { name: "元に戻す" }).click()
    // 操作をすると、その通知は閉じる
    await expect(page.locator("[data-slot=toast]", { hasText: "請求書をアーカイブしました" })).toHaveCount(0)
    await expect(page.locator("[data-slot=toast]", { hasText: "アーカイブを取り消しました" })).toBeVisible()
  })

  test("successes are not shown over three persistent toasts", async ({ page }) => {
    await open(page, "toast")
    for (let i = 0; i < 3; i++) await page.getByTestId("toast-destructive").click()
    await page.getByTestId("toast-success").click()
    await page.waitForTimeout(300)
    await expect(visibleToasts(page)).toHaveCount(3)
    await expect(page.locator("[data-slot=toast][data-variant=success]")).toHaveCount(0)
  })

  test("a fourth persistent toast hides the oldest until another closes", async ({ page }) => {
    await open(page, "toast")
    for (let i = 0; i < 3; i++) await page.getByTestId("toast-destructive").click()
    await page.getByTestId("toast-action").click()
    await page.waitForTimeout(300)
    const limited = page.locator("[data-slot=toast][data-limited]")
    await expect(limited).toHaveCount(1)
    await expect(limited).toHaveAttribute("inert", "")
    // 表示中の通知を 1 つ閉じると、隠れていた通知が再び表示される
    await visibleToasts(page).first().locator("[data-slot=toast-close]").click()
    await expect(limited).toHaveCount(0)
    await expect(visibleToasts(page)).toHaveCount(3)
  })
})

test.describe("Toast keyboard", () => {
  test("F6 enters the region; Tab reaches the action; Esc closes and returns focus", async ({ page }) => {
    await open(page, "toast")
    const trigger = page.getByTestId("toast-action")
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(page.locator("[data-slot=toast]")).toBeVisible()
    await expect(trigger).toBeFocused()
    await page.keyboard.press("F6")
    await expect(page.getByRole("region", { name: "通知" })).toBeFocused()
    // Base UI 1.9 では、もう一度 F6 を押しても元の位置には戻らない（資料に記載）
    await page.keyboard.press("F6")
    await expect(page.getByRole("region", { name: "通知" })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(page.locator("[data-slot=toast]")).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: "元に戻す" })).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-slot=toast]", { hasText: "請求書をアーカイブしました" })).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("high priority toast announces title and description", async ({ page }) => {
    await open(page, "toast")
    await page.getByTestId("toast-destructive").click()
    const live = page.locator("[aria-live]").filter({ hasText: "請求書を送信できませんでした" })
    await expect(live).toHaveCount(1)
    await expect(live).toContainText("メールサーバーに接続できません")
  })
})

test.describe("Progress values", { tag: "@webkit" }, () => {
  test("min/max, out of range, NaN, circle 0%", async ({ page }) => {
    await open(page, "progress")
    const range = page.getByTestId("progress-range")
    await expect(range).toHaveAttribute("aria-valuenow", "10")
    await expect(range).toHaveAttribute("aria-valuemax", "40")
    const track = await box(range.locator("[data-slot=progress-track]"))
    expect(Math.round(((await box(range.locator("[data-slot=progress-indicator]"))).width / track.width) * 100)).toBe(25)
    await expect(range.locator("[data-slot=progress-value]")).toHaveText("25%")
    await expect(page.getByTestId("progress-under")).toHaveAttribute("aria-valuenow", "0")
    const nan = page.getByTestId("progress-nan")
    expect(await nan.getAttribute("aria-valuenow")).toBeNull()
    await expect(nan).toHaveAttribute("data-indeterminate", "")
    const zero = page.getByTestId("circle-zero").locator("[data-slot=progress-circle-indicator]")
    await expect(zero).toHaveAttribute("stroke-linecap", "butt")
    await expect(zero).toHaveAttribute("opacity", "0")
    await expect(page.getByTestId("circle-range").locator("[data-slot=progress-circle-value]")).toHaveText("75%")
  })

  test("indeterminate animation follows reduced motion changes; failure does not animate", async ({ page }) => {
    await open(page, "progress")
    const animations = (id: string) =>
      page.getByTestId(id).locator("[data-slot=progress-indicator]").evaluate((el) => el.getAnimations().length)
    expect(await animations("progress-indeterminate")).toBe(1)
    expect(await animations("progress-error-indeterminate")).toBe(0)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await expect.poll(() => animations("progress-indeterminate")).toBe(0)
    await page.emulateMedia({ reducedMotion: "no-preference" })
    await expect.poll(() => animations("progress-indeterminate")).toBe(1)
    const circle = () => page.getByTestId("circle-indeterminate").locator("svg").evaluate((el) => el.getAnimations().length)
    expect(await circle()).toBe(1)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await expect.poll(circle).toBe(0)
  })

  test("reduced motion from the start", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "progress")
    expect(
      await page.getByTestId("progress-indeterminate").locator("[data-slot=progress-indicator]").evaluate((el) => el.getAnimations().length)
    ).toBe(0)
  })
})

test.describe("billing layout", () => {
  test("the toolbar does not move when loading finishes and the alert appears", async ({ page }) => {
    await open(page, "billing")
    const toolbar = page.getByTestId("billing-toolbar")
    const before = await box(toolbar)
    await expect(page.getByTestId("billing-list")).toHaveAttribute("aria-busy", "false", { timeout: 3000 })
    await expect(page.getByTestId("billing-alert")).toBeVisible()
    const after = await box(toolbar)
    expect(after.y).toBe(before.y)
    // Alert は一覧の中で、操作の欄より下にある
    expect((await box(page.getByTestId("billing-alert"))).y).toBeGreaterThan(after.y + after.height)
  })
})
