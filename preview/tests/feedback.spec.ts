import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { colorContrast, css, sameColor, token } from "./helpers"

const pages = ["badge", "avatar", "tooltip", "alert", "toast", "skeleton", "progress", "billing"]

async function open(page: Page, id: string) {
  await page.goto(`/#/${id}`)
  await page.getByRole("heading", { level: 1 }).waitFor()
}

const box = async (l: Locator) => (await l.boundingBox())!

test.describe("all feedback pages", { tag: "@webkit" }, () => {
  for (const id of pages) {
    test(`${id}: no horizontal scroll, buttons are named`, async ({ page }) => {
      await open(page, id)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const buttons = page.locator("main").getByRole("button")
      for (let i = 0; i < (await buttons.count()); i++) await expect(buttons.nth(i)).toHaveAccessibleName(/\S/)
    })
  }
})

test.describe("Badge", { tag: "@webkit" }, () => {
  test("tokens and colors", async ({ page }) => {
    await open(page, "badge")
    const colors = { neutral: "--muted-foreground", success: "--success", warning: "--warning", destructive: "--destructive", info: "--info" }
    for (const [v, t] of Object.entries(colors)) {
      const b = page.getByTestId(`badge-${v}`)
      expect((await box(b)).height, v).toBe(24)
      expect(await css(b, "font-size")).toBe("12px")
      expect(await css(b, "font-weight")).toBe("500")
      expect(await css(b, "border-top-width")).toBe("1px")
      expect(await css(b, "padding-left")).toBe("8px")
      expect(await css(b, "background-color")).toBe("rgba(0, 0, 0, 0)")
      expect(await css(b, "box-shadow")).toBe("none")
      expect(parseFloat(await css(b, "border-top-left-radius"))).toBeGreaterThanOrEqual(12)
      const color = await token(page, t)
      expect(sameColor(await css(b, "color"), color), `${v} text`).toBe(true)
      expect(sameColor(await css(b, "border-top-color"), color), `${v} border`).toBe(true)
      expect(await colorContrast(page, await css(b, "color"), await token(page, "--background"))).toBeGreaterThanOrEqual(4.5)
    }
  })

  test("long text wraps inside the container", async ({ page }) => {
    await open(page, "badge")
    const c = await box(page.getByTestId("badge-long-container"))
    const b = await box(page.getByTestId("badge-long"))
    expect(b.width).toBeLessThanOrEqual(c.width)
  })
})

test.describe("Avatar", { tag: "@webkit" }, () => {
  test("sizes, circle, image fit", async ({ page }) => {
    await open(page, "avatar")
    for (const [size, px] of [["xs", 24], ["sm", 32], ["default", 40], ["lg", 48], ["xl", 64]] as const) {
      const a = page.getByTestId(`avatar-${size}`)
      const b = await box(a)
      expect([b.width, b.height], size).toEqual([px, px])
      expect(parseFloat(await css(a, "border-top-left-radius"))).toBeGreaterThanOrEqual(px / 2)
      expect(await css(a, "box-shadow")).toBe("none")
    }
    for (const id of ["avatar-landscape", "avatar-portrait"]) {
      const img = page.getByTestId(id).locator("img")
      await expect(img).toBeVisible()
      expect(await css(img, "object-fit")).toBe("cover")
      const b = await box(img)
      expect([b.width, b.height]).toEqual([40, 40])
    }
    const f = page.getByTestId("avatar-initial-default").locator("[data-slot=avatar-fallback]")
    expect(sameColor(await css(f, "background-color"), await token(page, "--muted"))).toBe(true)
    expect(sameColor(await css(f, "color"), await token(page, "--muted-foreground"))).toBe(true)
  })

  test("falls back when the image fails, without layout change", async ({ page }) => {
    await open(page, "avatar")
    const a = page.getByTestId("avatar-switch")
    await expect(a.locator("img")).toBeVisible()
    const before = await box(a)
    await page.getByTestId("avatar-break").click()
    await expect(a.locator("img")).toHaveCount(0)
    await expect(a).toContainText("HY")
    const after = await box(a)
    expect([after.width, after.height]).toEqual([before.width, before.height])
  })

  test("layout is stable while the image loads", async ({ page }) => {
    await page.route("**/avatars/portrait.png", async (route) => {
      await new Promise((r) => setTimeout(r, 800))
      await route.continue()
    })
    await open(page, "avatar")
    const a = page.getByTestId("avatar-portrait")
    const loading = await box(a)
    await expect(a.locator("img")).toBeVisible({ timeout: 5000 })
    const loaded = await box(a)
    expect([loaded.x, loaded.y, loaded.width, loaded.height]).toEqual([loading.x, loading.y, loading.width, loading.height])
  })

  test("initials and accessible names", async ({ page }) => {
    await open(page, "avatar")
    for (const [name, initials] of [
      ["山田 花子", "山"],
      ["Hanako Yamada", "HY"],
      ["株式会社北斗システム", "北"],
      ["Taro", "TA"],
    ])
      await expect(page.getByTestId(`avatar-name-${name}`)).toHaveText(initials)
    // 名前と並べる場合は読み上げない
    await expect(page.getByTestId("avatar-with-name").locator("[data-slot=avatar]")).toHaveAttribute("aria-hidden", "true")
    // 単独の場合は名前を持つ
    const labelled = page.getByTestId("avatar-labelled")
    await expect(labelled).toHaveAttribute("role", "img")
    await expect(labelled).toHaveAccessibleName("佐藤 健")
    await expect(labelled).toBeVisible()
  })
})

test.describe("Tooltip", () => {
  test("700ms delay, tokens, gap, Escape", async ({ page, isMobile }) => {
    test.skip(isMobile, "Base UI の Tooltip はタッチ操作では開かない")
    await open(page, "tooltip")
    const trigger = page.getByTestId("tooltip-trigger")
    const tip = page.getByTestId("tooltip-edit")
    await trigger.hover()
    await page.waitForTimeout(450)
    await expect(tip).toHaveCount(0)
    await expect(tip).toBeVisible({ timeout: 1000 })
    expect(sameColor(await css(tip, "background-color"), await token(page, "--foreground"))).toBe(true)
    expect(sameColor(await css(tip, "color"), "#ffffff")).toBe(true)
    expect(await css(tip, "font-size")).toBe("12px")
    expect(await css(tip, "border-top-left-radius")).toBe("8px")
    expect([await css(tip, "padding-top"), await css(tip, "padding-left")]).toEqual(["8px", "12px"])
    expect(await css(tip, "box-shadow")).toContain("0px 2px 8px")
    expect(await css(tip, "transition-duration")).toBe("0.12s")
    const t = await box(trigger)
    const p = await box(tip)
    expect(Math.round(t.y - (p.y + p.height))).toBe(8)
    // ツールチップの上にポインターを移しても消えない
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 4 })
    await page.waitForTimeout(300)
    await expect(tip).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(tip).toHaveCount(0)
  })

  test("keyboard focus shows the tooltip; it does not close by itself", async ({ page, isMobile }) => {
    test.skip(isMobile, "Base UI の Tooltip はタッチ操作では開かない")
    await open(page, "tooltip")
    const trigger = page.getByTestId("tooltip-trigger")
    await page.getByRole("heading", { level: 1 }).click()
    for (let i = 0; i < 40 && !(await trigger.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press("Tab")
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId("tooltip-edit")).toBeVisible({ timeout: 1500 })
    await page.waitForTimeout(3000)
    await expect(page.getByTestId("tooltip-edit")).toBeVisible()
  })

  test("stays inside the viewport at the edge; long text wraps; brand does not change it", async ({ page, isMobile }) => {
    test.skip(isMobile, "Base UI の Tooltip はタッチ操作では開かない")
    await open(page, "tooltip")
    await page.getByRole("radio", { name: "紫" }).check()
    await page.getByTestId("tooltip-edge-trigger").hover()
    const edge = page.getByTestId("tooltip-edge")
    await expect(edge).toBeVisible({ timeout: 1500 })
    const b = await box(edge)
    const vw = page.viewportSize()!.width
    expect(b.x + b.width).toBeLessThanOrEqual(vw)
    expect(sameColor(await css(edge, "background-color"), await token(page, "--foreground"))).toBe(true)
    await page.mouse.move(0, 0)
    await page.getByTestId("tooltip-long-trigger").hover()
    const long = page.getByTestId("tooltip-long")
    await expect(long).toBeVisible({ timeout: 1500 })
    expect((await box(long)).width).toBeLessThanOrEqual(320)
  })

  test("touch does not open the tooltip", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch only")
    await open(page, "tooltip")
    await page.getByTestId("tooltip-trigger").tap()
    await page.waitForTimeout(1000)
    await expect(page.getByTestId("tooltip-edit")).toHaveCount(0)
  })
})

test.describe("Alert", { tag: "@webkit" }, () => {
  test("tokens and layout", async ({ page }) => {
    await open(page, "alert")
    const a = page.getByTestId("alert-warning")
    expect(await css(a, "border-top-width")).toBe("1px")
    expect(sameColor(await css(a, "border-top-color"), await token(page, "--border"))).toBe(true)
    expect(sameColor(await css(a, "background-color"), await token(page, "--background"))).toBe(true)
    expect(await css(a, "border-top-left-radius")).toBe("12px")
    expect(await css(a, "padding-top")).toBe("16px")
    expect(await css(a, "box-shadow")).toBe("none")
    const icon = a.locator("[data-slot=alert-icon]")
    expect((await box(icon)).width).toBe(20)
    const title = a.locator("[data-slot=alert-title]")
    const desc = a.locator("[data-slot=alert-description]")
    expect(Math.round((await box(title)).x - ((await box(icon)).x + 20))).toBe(12)
    expect(await css(title, "font-size")).toBe("14px")
    expect(await css(title, "font-weight")).toBe("500")
    expect(await css(desc, "font-size")).toBe("14px")
    expect(await css(desc, "font-weight")).toBe("400")
    const t = await box(title)
    expect(Math.round((await box(desc)).y - (t.y + t.height))).toBe(4)
    for (const [v, tok] of [["success", "--success"], ["warning", "--warning"], ["destructive", "--destructive"], ["info", "--info"], ["neutral", "--muted-foreground"]]) {
      const i = page.getByTestId(`alert-${v}`).locator("[data-slot=alert-icon]")
      expect(sameColor(await css(i, "color"), await token(page, tok)), v).toBe(true)
      expect(await colorContrast(page, await css(i, "color"), await token(page, "--background"))).toBeGreaterThanOrEqual(3)
    }
  })

  test("static alerts have no role; dynamic error uses role=alert", async ({ page }) => {
    await open(page, "alert")
    expect(await page.getByTestId("alert-destructive").getAttribute("role")).toBeNull()
    await page.getByTestId("alert-trigger").click()
    await expect(page.getByRole("alert")).toContainText("会計システムに接続できませんでした")
  })
})

test.describe("Toast", () => {
  test("position, tokens, focus is not moved", async ({ page, isMobile }) => {
    await open(page, "toast")
    const trigger = page.getByTestId("toast-success")
    await trigger.click()
    const t = page.locator("[data-slot=toast]")
    await expect(t).toBeVisible()
    await expect(trigger).toBeFocused()
    const b = await box(t)
    const vp = page.viewportSize()!
    if (isMobile) {
      expect(Math.round(b.x)).toBe(16)
      expect(Math.round(vp.width - (b.x + b.width))).toBe(16)
      expect(Math.round(vp.height - (b.y + b.height))).toBe(16)
    } else {
      expect(Math.round(vp.width - (b.x + b.width))).toBe(24)
      expect(Math.round(vp.height - (b.y + b.height))).toBe(24)
      expect(b.width).toBe(360)
    }
    expect(sameColor(await css(t, "background-color"), await token(page, "--background"))).toBe(true)
    expect(sameColor(await css(t, "border-top-color"), await token(page, "--border"))).toBe(true)
    expect(await css(t, "border-top-left-radius")).toBe("12px")
    expect(await css(t, "box-shadow")).toContain("0px 4px 16px")
    expect(await css(t, "transition-duration")).toBe("0.18s")
    expect(await css(t.locator("[data-slot=toast-title]"), "font-size")).toBe("14px")
    expect((await box(t.locator("svg").first())).width).toBe(20)
    expect(await css(t.locator("> div").first(), "padding-top")).toBe("16px")
  })

  test("success disappears after 4s; hover pauses the timer", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer only")
    await open(page, "toast")
    await page.getByTestId("toast-success").click()
    const t = page.locator("[data-slot=toast]")
    await expect(t).toBeVisible()
    await page.waitForTimeout(3300)
    await expect(t).toBeVisible()
    await expect(t).toHaveCount(0, { timeout: 1500 })
    // ホバー中は消えない
    await page.getByTestId("toast-success").click()
    await expect(t).toBeVisible()
    await t.hover()
    await page.waitForTimeout(5000)
    await expect(t).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(t).toHaveCount(0, { timeout: 6000 })
  })

  test("focus in the toast region pauses the timer", async ({ page }) => {
    await open(page, "toast")
    await page.getByTestId("toast-success").click()
    const t = page.locator("[data-slot=toast]")
    await expect(t).toBeVisible()
    await page.keyboard.press("F6")
    await expect(page.getByRole("region", { name: "通知" })).toBeFocused()
    await page.waitForTimeout(5000)
    await expect(t).toBeVisible()
    // 通知の領域からフォーカスが外れると、タイマーが再開する
    await page.getByRole("heading", { level: 1 }).click()
    await expect(page.getByRole("region", { name: "通知" })).not.toBeFocused()
    await expect(t).toHaveCount(0, { timeout: 6000 })
  })

  test("destructive and action toasts stay until closed", async ({ page }) => {
    await open(page, "toast")
    await page.getByTestId("toast-destructive").click()
    const t = page.locator("[data-slot=toast]")
    await expect(t).toBeVisible()
    await page.waitForTimeout(7000)
    await expect(t).toBeVisible()
    // 失敗の通知は読み上げ用の領域で知らせ、F6 で通知の領域に移ると操作できる
    await page.keyboard.press("F6")
    await expect(page.getByRole("region", { name: "通知" })).toBeFocused()
    await t.getByRole("button", { name: "通知を閉じる" }).click()
    await expect(t).toHaveCount(0)
    await page.getByTestId("toast-action").click()
    await page.waitForTimeout(6000)
    await expect(t).toBeVisible()
    await t.getByRole("button", { name: "元に戻す" }).click()
    await expect(page.locator("[data-slot=toast]", { hasText: "アーカイブを取り消しました" })).toBeVisible()
  })

  test("duplicates are merged and failures are aggregated", async ({ page }) => {
    await open(page, "toast")
    for (let i = 0; i < 3; i++) await page.getByTestId("toast-duplicate").click()
    await expect(page.locator("[data-slot=toast]")).toHaveCount(1)
    for (let i = 0; i < 3; i++) await page.getByTestId("toast-aggregate").click()
    const failed = page.locator("[data-slot=toast][data-variant=destructive]")
    await expect(failed).toHaveCount(1)
    await expect(failed).toContainText("3 件の請求書を送信できませんでした")
  })

  test("stacked toasts do not overlap", async ({ page }) => {
    await open(page, "toast")
    await page.getByTestId("toast-destructive").click()
    await page.getByTestId("toast-info").click()
    const toasts = page.locator("[data-slot=toast]")
    await expect(toasts).toHaveCount(2)
    await page.waitForTimeout(300)
    const [a, b] = [await box(toasts.nth(0)), await box(toasts.nth(1))]
    const [top, bottom] = a.y < b.y ? [a, b] : [b, a]
    expect(bottom.y - (top.y + top.height)).toBeGreaterThanOrEqual(8)
  })

  test("offset for fixed bottom elements and reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "toast")
    await page.evaluate(() => document.documentElement.style.setProperty("--toast-offset-bottom", "72px"))
    await page.getByTestId("toast-destructive").click()
    const t = page.locator("[data-slot=toast]")
    await expect(t).toBeVisible()
    const b = await box(t)
    const vp = page.viewportSize()!
    const margin = vp.width < 640 ? 16 : 24
    expect(Math.round(vp.height - (b.y + b.height))).toBe(margin + 72)
    expect(await css(t, "transition-property")).toBe("opacity")
    // 読み上げ：Base UI が通知の領域（region）と読み上げ用の領域（aria-live）を用意する
    await expect(page.getByRole("region", { name: "通知" })).toHaveCount(1)
    await expect(page.locator("[aria-live]").filter({ hasText: "請求書を送信できませんでした" })).toHaveCount(1)
  })
})

test.describe("Skeleton", { tag: "@webkit" }, () => {
  test("pulse, reduced motion, hidden from assistive tech", async ({ page }) => {
    await open(page, "skeleton")
    const s = page.getByTestId("skeleton-sample")
    await expect(s).toHaveAttribute("aria-hidden", "true")
    expect(await css(s, "animation-name")).toBe("pulse")
    expect(await css(s, "animation-duration")).toBe("1.8s")
    expect(sameColor(await css(s, "background-color"), await token(page, "--border"))).toBe(true)
    await page.emulateMedia({ reducedMotion: "reduce" })
    expect(await css(s, "animation-name")).toBe("none")
  })

  test("switches to content without layout shift; error replaces it", async ({ page }) => {
    await open(page, "skeleton")
    const list = page.getByTestId("skeleton-list")
    const rows = page.getByTestId("skeleton-rows")
    const loadedHeight = (await box(rows)).height
    await page.getByTestId("skeleton-load").click()
    await expect(list).toHaveAttribute("aria-busy", "true")
    await expect(list.getByRole("status")).toHaveText("顧客一覧を読み込んでいます")
    await expect(rows.locator("[data-slot=skeleton]").first()).toBeVisible()
    expect((await box(rows)).height).toBe(loadedHeight)
    await expect(list).toHaveAttribute("aria-busy", "false", { timeout: 3000 })
    await expect(rows.locator("[data-slot=skeleton]")).toHaveCount(0)
    expect((await box(rows)).height).toBe(loadedHeight)
    await page.getByTestId("skeleton-fail").click()
    await expect(page.getByTestId("skeleton-error")).toBeVisible({ timeout: 3000 })
    await expect(list.locator("[data-slot=skeleton]")).toHaveCount(0)
    await expect(list).toHaveAttribute("aria-busy", "false")
  })
})

test.describe("Progress", { tag: "@webkit" }, () => {
  test("values, tokens, contrast", async ({ page }) => {
    await open(page, "progress")
    for (const v of [0, 45, 100]) {
      const p = page.getByTestId(`progress-${v}`)
      await expect(p).toHaveAttribute("role", "progressbar")
      await expect(p).toHaveAttribute("aria-valuenow", String(v))
      const track = p.locator("[data-slot=progress-track]")
      const ind = p.locator("[data-slot=progress-indicator]")
      expect((await box(track)).height).toBe(8)
      expect(parseFloat(await css(track, "border-top-left-radius"))).toBeGreaterThanOrEqual(4)
      expect(Math.round(((await box(ind)).width / (await box(track)).width) * 100)).toBe(v)
      const value = p.locator("[data-slot=progress-value]")
      expect(await css(value, "font-size")).toBe("14px")
      expect(await css(value, "font-variant-numeric")).toBe("tabular-nums")
      expect(await css(p.locator("[data-slot=progress-label]"), "font-size")).toBe("14px")
    }
    const p = page.getByTestId("progress-45")
    const ind = await css(p.locator("[data-slot=progress-indicator]"), "background-color")
    expect(sameColor(ind, await token(page, "--primary"))).toBe(true)
    expect(await colorContrast(page, ind, await css(p.locator("[data-slot=progress-track]"), "background-color"))).toBeGreaterThanOrEqual(3)
    expect(await colorContrast(page, ind, await token(page, "--background"))).toBeGreaterThanOrEqual(3)
    await expect(p).toHaveAccessibleName("請求書を送信しています")
  })

  test("indeterminate has no aria-valuenow and stops under reduced motion", async ({ page }) => {
    await open(page, "progress")
    const p = page.getByTestId("progress-indeterminate")
    expect(await p.getAttribute("aria-valuenow")).toBeNull()
    await expect(p).toHaveAttribute("data-indeterminate", "")
    const ind = p.locator("[data-slot=progress-indicator]")
    expect(await ind.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.reload()
    await page.getByTestId("progress-indeterminate").waitFor()
    expect(await page.getByTestId("progress-indeterminate").locator("[data-slot=progress-indicator]").evaluate((el) => el.getAnimations().length)).toBe(0)
  })

  test("real progress reaches 100 only when complete; failure and pause are distinct", async ({ page }) => {
    await open(page, "progress")
    const p = page.getByTestId("progress-live")
    await page.getByTestId("progress-start").click()
    await expect.poll(async () => Number(await p.getAttribute("aria-valuenow"))).toBeGreaterThan(0)
    await expect(page.getByTestId("progress-count")).toHaveText("40 / 40 件", { timeout: 6000 })
    await expect(p).toHaveAttribute("aria-valuenow", "100")
    await expect(p).toContainText("送信が完了しました")
    await page.getByTestId("progress-start-fail").click()
    await expect(page.getByTestId("progress-count")).toHaveText("25 / 40 件", { timeout: 6000 })
    await expect(p).toHaveAttribute("data-status", "error")
    await expect(p).toHaveAttribute("aria-valuenow", "62")
    expect(sameColor(await css(p.locator("[data-slot=progress-indicator]"), "background-color"), await token(page, "--destructive"))).toBe(true)
    await page.getByTestId("progress-start").click()
    await page.waitForTimeout(300)
    await page.getByTestId("progress-pause").click()
    await expect(p).toHaveAttribute("data-status", "paused")
    expect(Number(await p.getAttribute("aria-valuenow"))).toBeLessThan(100)
  })

  test("circle sizes and accessibility", async ({ page }) => {
    await open(page, "progress")
    for (const [id, px, v] of [["circle-sm", 48, 25], ["circle-default", 64, 60], ["circle-lg", 96, 100]] as const) {
      const c = page.getByTestId(id)
      const b = await box(c)
      expect([b.width, b.height]).toEqual([px, px])
      await expect(c).toHaveAttribute("role", "progressbar")
      await expect(c).toHaveAttribute("aria-valuenow", String(v))
      await expect(c).toHaveAccessibleName("送信の進み具合")
      await expect(c.locator("[data-slot=progress-circle-value]")).toHaveText(`${v}%`)
    }
    const ind = page.getByTestId("circle-indeterminate")
    expect(await ind.getAttribute("aria-valuenow")).toBeNull()
    await expect(ind.locator("[data-slot=progress-circle-value]")).toHaveCount(0)
  })

  test("brand color changes the indicator", async ({ page }) => {
    await open(page, "progress")
    await page.getByRole("radio", { name: "青" }).check()
    const ind = page.getByTestId("progress-45").locator("[data-slot=progress-indicator]")
    await expect.poll(() => css(ind, "background-color")).toBe("rgb(30, 64, 175)")
  })
})

test.describe("billing example", () => {
  test("skeleton → list → progress → toasts; failures stay in the list", async ({ page }) => {
    await open(page, "billing")
    const list = page.getByTestId("billing-list")
    await expect(list).toHaveAttribute("aria-busy", "true")
    await expect(list).toHaveAttribute("aria-busy", "false", { timeout: 3000 })
    await expect(page.getByTestId("billing-alert")).toContainText("送付先が未設定の顧客が 2 件あります")
    await page.getByTestId("billing-send").click()
    await expect(page.getByTestId("billing-progress")).toBeVisible()
    await expect(page.locator("[data-slot=toast][data-variant=success]")).toContainText("2 件の請求書を送信しました", { timeout: 6000 })
    const failed = page.locator("[data-slot=toast][data-variant=destructive]")
    await expect(failed).toContainText("2 件の請求書を送信できませんでした")
    await expect(page.getByTestId("billing-badge-INV-1102")).toHaveText("送信失敗")
    // ポインターでは操作できる（支援技術には F6 で通知の領域に移ったときに公開される）
    await failed.locator("button", { hasText: "失敗した請求書を表示" }).click()
    await expect(list.getByRole("listitem")).toHaveCount(2)
  })
})

test.describe("screenshots", () => {
  test("capture", async ({ page }, info) => {
    test.setTimeout(60000)
    const dir = join(info.project.testDir, "..", "screenshots", info.project.name)
    for (const id of pages) {
      await open(page, id)
      if (id === "billing") await page.getByTestId("billing-list").and(page.locator("[aria-busy=false]")).waitFor()
      await page.screenshot({ path: `${dir}/${id}.png`, fullPage: true })
    }
    if (info.project.name !== "desktop") return
    await open(page, "tooltip")
    await page.getByTestId("tooltip-trigger").hover()
    await page.getByTestId("tooltip-edit").waitFor()
    await page.screenshot({ path: `${dir}/tooltip-open.png`, clip: { x: 0, y: 200, width: 1280, height: 500 } })
    await open(page, "toast")
    await page.getByTestId("toast-destructive").click()
    await page.getByTestId("toast-action").click()
    await page.getByTestId("toast-success").click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/toast-open.png` })
    await open(page, "billing")
    await page.getByTestId("billing-list").and(page.locator("[aria-busy=false]")).waitFor()
    await page.getByTestId("billing-send").click()
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${dir}/billing-sending.png`, fullPage: true })
    await page.locator("[data-slot=toast][data-variant=destructive]").waitFor({ timeout: 6000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/billing-done.png` })
  })
})
