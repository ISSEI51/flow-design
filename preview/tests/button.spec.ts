import { join } from "node:path"

import { expect, test } from "@playwright/test"

import { buttonContrast, css, sameColor, token } from "./helpers"

const variants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const

test.beforeEach(async ({ page }) => {
  await page.goto("/#/button")
  await page.getByRole("heading", { level: 1, name: "Button" }).waitFor()
})

test.describe("tokens", () => {
  test("variants use the theme tokens", async ({ page }) => {
    const expected: Record<(typeof variants)[number], { bg: string; fg: string }> = {
      default: { bg: "--primary", fg: "--primary-foreground" },
      secondary: { bg: "--secondary", fg: "--secondary-foreground" },
      outline: { bg: "--background", fg: "--foreground" },
      ghost: { bg: "transparent", fg: "--foreground" },
      destructive: { bg: "--destructive", fg: "--destructive-foreground" },
      link: { bg: "transparent", fg: "--primary" },
    }
    for (const v of variants) {
      const b = page.getByTestId(`variant-${v}`)
      const bg = expected[v].bg === "transparent" ? "rgba(0, 0, 0, 0)" : await token(page, expected[v].bg)
      expect(sameColor(await css(b, "background-color"), bg), `${v} background`).toBe(true)
      expect(sameColor(await css(b, "color"), await token(page, expected[v].fg)), `${v} color`).toBe(true)
      expect(await css(b, "font-size"), `${v} font-size`).toBe("14px")
      expect(await css(b, "font-weight"), `${v} font-weight`).toBe("500")
      expect(await css(b, "box-shadow"), `${v} shadow`).toBe("none")
      expect(await css(b, "transition-duration"), `${v} duration`).toBe("0.12s")
    }
    const outline = page.getByTestId("variant-outline")
    expect(sameColor(await css(outline, "border-top-color"), await token(page, "--input"))).toBe(true)
    expect(await css(page.getByTestId("variant-link"), "text-decoration-line")).toBe("underline")
  })

  test("sizes, radius, icons", async ({ page }) => {
    const sizes = [
      ["xs", 32, "8px", 16],
      ["sm", 40, "12px", 20],
      ["default", 48, "14px", 20],
      ["lg", 56, "14px", 20],
    ] as const
    const icon = { xs: "icon-xs", sm: "icon-sm", default: "icon", lg: "icon-lg" } as const
    for (const [size, px, radius, iconPx] of sizes) {
      const b = page.getByTestId(`size-${size}`)
      expect((await b.boundingBox())!.height, `${size} height`).toBe(px)
      expect(await css(b, "border-top-left-radius"), `${size} radius`).toBe(radius)
      const ib = page.getByTestId(`size-${icon[size]}`)
      const box = (await ib.boundingBox())!
      expect([box.width, box.height], `${icon[size]} square`).toEqual([px, px])
      const svg = ib.locator("svg")
      expect((await svg.boundingBox())!.width, `${icon[size]} icon`).toBe(iconPx)
      expect(await css(svg, "stroke-width")).toBe("1.75px")
    }
    const content = page.getByTestId("icon-start").locator("[data-slot=button-content]")
    expect(await css(content, "column-gap")).toBe("8px")
  })
})

test.describe("contrast", () => {
  test("text contrast is 4.5:1 or more in default and hover", async ({ page, isMobile }) => {
    for (const v of variants) {
      const b = page.getByTestId(`variant-${v}`)
      expect(await buttonContrast(b), `${v} default`).toBeGreaterThanOrEqual(4.5)
      if (!isMobile) {
        await b.hover()
        await page.waitForTimeout(250)
        expect(await buttonContrast(b), `${v} hover`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  test("active state changes the surface and keeps contrast", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer only")
    const b = page.getByTestId("variant-default")
    const before = await css(b, "background-color")
    const box = (await b.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(250)
    expect(await css(b, "background-color")).not.toBe(before)
    expect(await buttonContrast(b)).toBeGreaterThanOrEqual(4.5)
    await page.mouse.up()
  })
})

test.describe("keyboard and focus", () => {
  test("Tab reaches the button, focus-ring is shown, Enter and Space activate", async ({ page }) => {
    const target = page.getByTestId("state-default")
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab")
      if (await target.evaluate((el) => el === document.activeElement)) break
    }
    await expect(target).toBeFocused()
    expect(await css(target, "outline-style")).toBe("solid")
    expect(await css(target, "outline-width")).toBe("2px")
    expect(await css(target, "outline-offset")).toBe("2px")
    expect(sameColor(await css(target, "outline-color"), await token(page, "--ring"))).toBe(true)
    await page.keyboard.press("Enter")
    await page.keyboard.press("Space")
    await expect(page.getByTestId("click-count")).toHaveText("押した回数：2")
  })

  test("disabled button cannot be clicked or focused", async ({ page }) => {
    const b = page.getByTestId("state-disabled")
    await b.click({ force: true })
    await expect(page.getByTestId("click-count")).toHaveText("押した回数：0")
    await b.evaluate((el) => (el as HTMLElement).focus())
    await expect(b).not.toBeFocused()
    expect(await css(b, "opacity")).toBe("0.5")
  })
})

test.describe("loading", () => {
  test("prevents repeated submission and keeps the layout", async ({ page }) => {
    const b = page.getByTestId("state-loading")
    await b.scrollIntoViewIfNeeded()
    const before = (await b.boundingBox())!
    await b.click()
    await expect(b).toHaveAttribute("aria-busy", "true")
    const during = (await b.boundingBox())!
    expect([during.width, during.height, during.x, during.y]).toEqual([before.width, before.height, before.x, before.y])
    await b.click({ force: true })
    await b.click({ force: true })
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("submit-count")).toHaveText("送信した回数：1")
    await expect(b).toBeFocused()
    await expect(b).toHaveAccessibleName("請求書を送信")
    await expect(b).not.toHaveAttribute("aria-busy", "true", { timeout: 4000 })
    const after = (await b.boundingBox())!
    expect([after.width, after.height]).toEqual([before.width, before.height])
    expect(await css(b, "opacity")).toBe("1")
  })

  test("spinner stops under reduced motion", async ({ page }) => {
    const spinner = page.getByTestId("state-loading-fixed").locator("[data-slot=button-spinner] svg")
    expect(await css(spinner, "animation-name")).toBe("spin")
    await page.emulateMedia({ reducedMotion: "reduce" })
    expect(await css(spinner, "animation-name")).toBe("none")
  })
})

test.describe("content", () => {
  test("every button has an accessible name", async ({ page }) => {
    const buttons = page.getByRole("button")
    const count = await buttons.count()
    expect(count).toBeGreaterThan(30)
    for (let i = 0; i < count; i++) await expect(buttons.nth(i)).toHaveAccessibleName(/\S/)
    for (const name of ["検索", "絞り込み", "その他の操作"])
      await expect(page.getByRole("button", { name }).first()).toBeVisible()
  })

  test("long labels wrap inside the container", async ({ page }) => {
    const container = (await page.getByTestId("long-container").boundingBox())!
    const b = page.getByTestId("long-label")
    const box = (await b.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(container.width)
    expect(box.height).toBeGreaterThan(48)
    expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })

  test("page has no horizontal scroll", async ({ page }) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test.describe("brand", () => {
  test("changing --primary changes Primary only and keeps contrast", async ({ page }) => {
    const secondaryBefore = await css(page.getByTestId("variant-secondary"), "background-color")
    await page.getByRole("radio", { name: "青" }).check()
    const b = page.getByTestId("variant-default")
    // 色の変化には 120ms の transition があるため、終わるまで待つ。
    await expect.poll(() => css(b, "background-color")).toBe("rgb(29, 78, 216)")
    expect(await buttonContrast(b)).toBeGreaterThanOrEqual(4.5)
    expect(await css(page.getByTestId("variant-secondary"), "background-color")).toBe(secondaryBefore)
  })
})

test.describe("screenshots", () => {
  test("capture", async ({ page }, info) => {
    const dir = join(info.project.testDir, "..", "screenshots", info.project.name)
    await page.screenshot({ path: `${dir}/button-page.png`, fullPage: true })
    if (info.project.name === "desktop") {
      const target = page.getByTestId("state-default")
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press("Tab")
        if (await target.evaluate((el) => el === document.activeElement)) break
      }
      await page.locator("section", { hasText: "状態" }).first().screenshot({ path: `${dir}/button-states-focus.png` })
      await page.getByTestId("variant-default").hover()
      await page.waitForTimeout(250)
      await page.locator("section", { hasText: "種類" }).first().screenshot({ path: `${dir}/button-variants-hover.png` })
    }
  })
})
