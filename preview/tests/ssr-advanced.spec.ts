import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createServer, type ViteDevServer } from "vite"
import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// Advanced Components の SSR と Hydration の検品。仕組みは ssr.spec.ts と同じ。
// 1. Node.js（window と document がない環境）で preview/src/ssr/advanced-fixture.tsx を react-dom/server で HTML にする
// 2. ブラウザで、その HTML を preview/ssr-advanced.html の #root に入れて Hydration し、不一致のエラーがないことを確かめる
// 確かめる範囲：サーバーでの描画（window、document を参照しない）、use client の境界、日付とロケールとタイムゾーン、
// プラットフォーム別のショートカットの表示、モバイルでの Calendar の切り替え、ファイル入力の初期描画。
// Next.js などのフレームワークでの検品は、Registry & Gallery の段階で行う。

let vite: ViteDevServer
let html = ""

test.beforeAll(async () => {
  vite = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
    // ssr.spec.ts と検品の開発サーバーとは、依存パッケージのキャッシュを共有しない（同時に書き込むと失敗するため）。
    cacheDir: fileURLToPath(new URL("../../node_modules/.vite-ssr-advanced-check", import.meta.url)),
  })
  const mod = (await vite.ssrLoadModule("/src/ssr/advanced-fixture.tsx")) as typeof import("../src/ssr/advanced-fixture")
  html = renderToString(createElement(mod.AdvancedSsrFixture))
})

test.afterAll(async () => {
  await vite?.close()
})

async function openSsr(page: Page, { script = true } = {}) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`)
  })
  await page.route("**/ssr-advanced.html", async (route) => {
    const res = await route.fetch()
    let body = (await res.text()).replace("<!--ssr-outlet-->", html)
    if (!script) body = body.replace(/<script type="module" src="\/src\/ssr\/advanced-client\.tsx[^"]*"><\/script>/, "")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr-advanced.html")
  if (script) await page.waitForFunction(() => window.__ssrHydrated === true)
  return errors
}

const isMac = (page: Page) =>
  page.evaluate(() =>
    /mac|iphone|ipad/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform)
  )

test.describe("SSR (Advanced Components)", { tag: "@webkit" }, () => {
  test("renders on the server without window or document, deterministically", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined")
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined")
    for (const slot of [
      "combobox-trigger",
      "multi-select-control",
      "multi-select-chip",
      "command",
      "command-input",
      "calendar-day",
      "date-picker-input",
      "date-picker-value",
      "date-range-picker",
      "file-upload-dropzone",
      "file-upload-item",
      "empty",
    ]) {
      expect(html, slot).toContain(`data-slot="${slot}"`)
    }
    // 日付は固定した値で描画する
    expect(html).toContain('value="2026/04/01"')
    expect(html).toContain('value="2026-04-01"')
    expect(html).toContain('data-day="2026-11-25" data-today="true"')
    // ファイル入力は、サーバーでも描画する（Hydration の前から存在する）
    expect(html).toMatch(/<input[^>]*type="file"/)
    // ショートカットの表示は、サーバーでは出さない（OS がわからないため）
    expect(html).not.toContain('data-testid="ssr-shortcut-label"')
    // サーバーでの useIsMobile は false（Popover の表示）。Drawer は描画しない
    expect(html).not.toContain('data-slot="date-picker-drawer"')
    // 同じ入力からは、毎回同じ HTML になる
    const mod = (await vite.ssrLoadModule("/src/ssr/advanced-fixture.tsx")) as typeof import("../src/ssr/advanced-fixture")
    expect(renderToString(createElement(mod.AdvancedSsrFixture))).toBe(html)
  })

  test("interactive components declare the client boundary", () => {
    // Next.js の App Router などでは、hook とイベントを使う部品をクライアントの部品として読み込む必要がある。
    for (const name of ["combobox", "multi-select", "command", "calendar", "date-picker", "file-upload"]) {
      const src = readFileSync(fileURLToPath(new URL(`../../registry/components/ui/${name}.tsx`, import.meta.url)), "utf8")
      expect(src.startsWith('"use client"'), name).toBe(true)
    }
    // Empty は hook もイベントも使わないため、サーバーの部品として使える
    const empty = readFileSync(fileURLToPath(new URL("../../registry/components/ui/empty.tsx", import.meta.url)), "utf8")
    expect(empty).not.toMatch(/use(State|Effect|Ref|Id|Context|SyncExternalStore)\(/)
  })

  test("hydrates without mismatches; platform label and mobile calendar update after hydration", async ({ page, isMobile }) => {
    const errors = await openSsr(page)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
    expect(errors.filter((e) => /hydrat|did not match|mismatch/i.test(e))).toEqual([])
    // Hydration の後に、OS に合わせたショートカットの表示になる
    await expect(page.getByTestId("ssr-shortcut-label")).toHaveText((await isMac(page)) ? "⌘K" : "Ctrl+K")
    // 状態のある部品が操作できる
    await page.getByTestId("ssr-combobox").click()
    await expect(page.locator("[data-slot=combobox-list]")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-slot=multi-select-chip]")).toHaveCount(3)
    await expect(page.locator("[data-slot=multi-select-more]")).toHaveText("他1件")
    // Calendar は、Hydration の後の画面の幅で、Popover（デスクトップ）か Drawer（モバイル）で開く
    await page.getByRole("button", { name: "カレンダーから選ぶ" }).click()
    if (isMobile) await expect(page.locator("[data-slot=date-picker-drawer][data-open]")).toBeVisible()
    else await expect(page.locator("[data-slot=date-picker-content][data-open]")).toBeVisible()
  })

  test("before hydration, the server HTML shows the values and controls", async ({ page }) => {
    await openSsr(page, { script: false })
    await expect(page.getByRole("textbox", { name: "契約日" })).toHaveValue("2026/04/01")
    await expect(page.getByTestId("ssr-combobox")).toHaveText(/北星物流株式会社/)
    await expect(page.locator("input[type=file]").first()).toBeAttached()
    await expect(page.getByRole("button", { name: "ファイルを選択" })).toBeVisible()
    await expect(page.getByTestId("ssr-calendar").locator('button[data-day="2026-11-25"]')).toHaveAttribute("data-today", "true")
  })

  for (const timezoneId of ["America/Los_Angeles", "Pacific/Kiritimati"]) {
    test.describe(`browser time zone ${timezoneId}`, () => {
      test.use({ timezoneId })
      test("hydrates the server HTML (rendered in another time zone) without mismatches", async ({ page }) => {
        // サーバー（Node.js）とブラウザのタイムゾーンが違っても、日付だけの値はずれない
        const errors = await openSsr(page)
        await page.waitForTimeout(300)
        expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
        expect(errors.filter((e) => /hydrat|did not match|mismatch/i.test(e))).toEqual([])
        await expect(page.getByRole("textbox", { name: "契約日" })).toHaveValue("2026/04/01")
        await expect(page.locator("input[name=contract_date]")).toHaveValue("2026-04-01")
        await expect(page.locator("input[name=from]")).toHaveValue("2026-11-01")
        await expect(page.locator("input[name=to]")).toHaveValue("2026-11-25")
      })
    })
  }
})
