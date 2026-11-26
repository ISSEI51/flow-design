import { join } from "node:path"

import { expect, test } from "@playwright/test"

import { buttonContrast, css, sameColor, token } from "./helpers"
import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

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
    for (const [size, font] of [["xs", "14px"], ["sm", "14px"], ["default", "14px"], ["lg", "16px"]] as const) {
      const b = page.getByTestId(`size-${size}`)
      expect(await css(b, "font-size"), `${size} font-size`).toBe(font)
      expect(await css(b, "font-weight"), `${size} font-weight`).toBe("500")
    }
    // アイコンだけの Large は、文字の大きさを変えない
    expect(await css(page.getByTestId("size-icon-lg"), "font-size")).toBe("14px")
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
    // Tab を押す回数の上限は、ページのフォーカスできる要素の数にする（プレビューの上部の一覧の項目が増えても届く）
    const stops = await page.locator("a[href], button, input, select, textarea, [tabindex]").count()
    for (let i = 0; i < stops + 1; i++) {
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

  test("keys do not re-run while loading, state returns after completion", async ({ page }) => {
    const b = page.getByTestId("state-loading")
    await b.focus()
    await page.keyboard.press("Enter")
    await expect(b).toHaveAttribute("aria-busy", "true")
    // 処理中であることが見てわかる：ラベルは透明、スピナーが表示される
    await expect(b.locator("[data-slot=button-spinner] svg")).toBeVisible()
    expect(await css(b.locator("[data-slot=button-content]"), "opacity")).toBe("0")
    await page.keyboard.press("Space")
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("submit-count")).toHaveText("送信した回数：1")
    await expect(b).toBeFocused()
    await expect(b).toHaveAccessibleName("請求書を送信")
    // 完了後：通常の状態に戻り、もう一度実行できる
    await expect(b).not.toHaveAttribute("aria-busy", "true", { timeout: 4000 })
    await expect(b.locator("[data-slot=button-spinner]")).toHaveCount(0)
    await expect(b).toBeEnabled()
    await expect(b).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("submit-count")).toHaveText("送信した回数：2")
  })

  test("form submission is not repeated while loading", async ({ page }) => {
    const input = page.getByTestId("form-input")
    const submit = page.getByTestId("form-submit")
    const status = page.getByTestId("form-status")
    await input.focus()
    await page.keyboard.press("Enter")
    await expect(submit).toHaveAttribute("aria-busy", "true")
    await expect(status).toHaveText("招待を送信しています")
    await expect(input).toBeFocused()
    await page.keyboard.press("Enter")
    await submit.click({ force: true })
    await submit.focus()
    await page.keyboard.press("Enter")
    await page.keyboard.press("Space")
    await expect(submit).not.toHaveAttribute("aria-busy", "true", { timeout: 4000 })
    await expect(status).toHaveText("招待を送信しました（1 回）")
    await submit.click()
    await expect(status).toHaveText("招待を送信しています")
    await expect(submit).toBeFocused()
    await expect(status).toHaveText("招待を送信しました（2 回）", { timeout: 4000 })
  })

  test("spinner stops under reduced motion", async ({ page }) => {
    const spinner = page.getByTestId("state-loading-fixed").locator("[data-slot=button-spinner] svg")
    expect(await css(spinner, "animation-name")).toBe("spin")
    await page.emulateMedia({ reducedMotion: "reduce" })
    expect(await css(spinner, "animation-name")).toBe("none")
    // 回転しなくても、スピナーは表示され、処理中であることがわかる
    await expect(spinner).toBeVisible()
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

test.describe("buttonVariants on <a>", () => {
  test("keeps link semantics and the button styles", async ({ page, isMobile }) => {
    const outline = page.getByTestId("link-outline")
    await expect(outline).toHaveRole("link")
    await expect(page.getByRole("link", { name: "顧客一覧へ" })).toHaveAttribute("href", "#/button?from=link")
    expect(sameColor(await css(outline, "border-top-color"), await token(page, "--input"))).toBe(true)
    expect(await css(outline, "border-top-width")).toBe("1px")
    expect((await outline.boundingBox())!.height).toBe(48)
    if (!isMobile) {
      const ghost = page.getByTestId("link-ghost")
      await ghost.hover()
      await page.waitForTimeout(250)
      expect(sameColor(await css(ghost, "background-color"), await token(page, "--accent"))).toBe(true)
      expect(await buttonContrast(ghost)).toBeGreaterThanOrEqual(4.5)
    }
  })

  // WebKit は Safari の既定の設定と同じく、Tab でリンクに移動しない（Option+Tab で移動する）。
  // 実機の Safari の「Tab キーで Web ページ上の各項目を強調表示」を有効にした状態に当たる Option+Tab で確かめる。
  test("keyboard focus and navigation", { tag: "@webkit" }, async ({ page, browserName }) => {
    const outline = page.getByTestId("link-outline")
    const key = browserName === "webkit" ? "Alt+Tab" : "Tab"
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press(key)
      if (await outline.evaluate((el) => el === document.activeElement)) break
    }
    await expect(outline).toBeFocused()
    expect(await css(outline, "outline-width")).toBe("2px")
    expect(sameColor(await css(outline, "outline-color"), await token(page, "--ring"))).toBe(true)
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/#\/button\?from=link$/)
  })

  test("long link label wraps inside the container", async ({ page }) => {
    const container = (await page.getByTestId("link-long-container").boundingBox())!
    const a = page.getByTestId("link-long")
    const box = (await a.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(container.width)
    expect(box.height).toBeGreaterThan(48)
    expect(await a.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })
})

test.describe("outline on a muted surface", () => {
  test("border is distinguishable from the surface (3:1)", async ({ page }) => {
    const b = page.getByTestId("outline-on-muted")
    const ratio = await b.evaluate((el) => {
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      const paint = (c: string) => {
        ctx.fillStyle = c
        ctx.fillRect(0, 0, 1, 1)
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
      }
      const lum = (rgb: number[]) => {
        const [r, g, b] = rgb.map((v) => {
          const s = v / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const border = lum(paint(getComputedStyle(el).borderTopColor))
      const surface = lum(paint(getComputedStyle(el.parentElement!).backgroundColor))
      const [hi, lo] = [border, surface].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    })
    expect(ratio).toBeGreaterThanOrEqual(3)
  })
})

test.describe("brand", () => {
  for (const [name, hex, rgb] of [
    ["青", "#1e40af", "rgb(30, 64, 175)"],
    ["紫", "#6d28d9", "rgb(109, 40, 217)"],
  ] as const) {
    test(`${name} (${hex}): Primary only changes, contrast in default, hover and active`, async ({ page, isMobile }) => {
      const secondaryBefore = await css(page.getByTestId("variant-secondary"), "background-color")
      await page.getByRole("radio", { name }).check()
      const b = page.getByTestId("variant-default")
      // 色の変化には 120ms の transition があるため、終わるまで待つ。
      await expect.poll(() => css(b, "background-color")).toBe(rgb)
      expect(await buttonContrast(b), "default").toBeGreaterThanOrEqual(4.5)
      expect(await css(page.getByTestId("variant-secondary"), "background-color")).toBe(secondaryBefore)
      if (isMobile) return
      await b.hover()
      await page.waitForTimeout(250)
      expect(await buttonContrast(b), "hover").toBeGreaterThanOrEqual(4.5)
      await page.mouse.down()
      await page.waitForTimeout(250)
      expect(await buttonContrast(b), "active").toBeGreaterThanOrEqual(4.5)
      await page.mouse.up()
    })
  }
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
      await page.mouse.move(0, 0)
      for (const [title, file] of [["大きさ", "sizes"], ["使用例", "usage"], ["良い例と悪い例", "good-bad"]] as const)
        await page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: title }) })
          .screenshot({ path: `${dir}/button-${file}.png` })
    }
  })
})
