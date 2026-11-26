import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createServer, type ViteDevServer } from "vite"
import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// Data Browsing の Patterns の SSR と Hydration の検品。仕組みは ssr-app-structure.spec.ts と同じ。
// 1. Node.js（window と document がない環境）で preview/src/ssr/data-browsing-fixture.tsx を HTML にする
// 2. ブラウザで、その HTML を preview/ssr.html の #root に入れて Hydration し、不一致のエラーがないことを確かめる
// あわせて、Data Browsing の hook のファイル（.ts）の "use client" の境界を確かめる（.tsx は ssr-app-structure.spec.ts）。

let vite: ViteDevServer
let html = ""

test.beforeAll(async () => {
  vite = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
    // ほかの SSR の検品と、依存パッケージのキャッシュを共有しない（同時に書き込むと失敗するため）。
    cacheDir: fileURLToPath(new URL("../../node_modules/.vite-ssr-data-browsing-check", import.meta.url)),
  })
  const mod = (await vite.ssrLoadModule("/src/ssr/data-browsing-fixture.tsx")) as typeof import("../src/ssr/data-browsing-fixture")
  html = renderToString(createElement(mod.DataBrowsingSsrFixture))
})

test.afterAll(async () => {
  await vite?.close()
})

async function openSsr(page: Page) {
  await page.route("**/ssr.html", async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace("<!--ssr-outlet-->", html).replace("/src/ssr/client.tsx", "/src/ssr/data-browsing-client.tsx")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr.html")
  await page.waitForFunction(() => window.__ssrHydrated === true)
}

const patternsDir = fileURLToPath(new URL("../../registry/patterns/", import.meta.url))

test.describe("SSR (Data Browsing)", { tag: "@webkit" }, () => {
  test("renders on the server without window or document, deterministically, as the first load", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined")
    for (const slot of ["view-switcher", "table-scroll-area", "loading-reveal", "data-table-loading-row", "data-region-error", "bulk-result", "data-refresh-indicator"]) {
      expect(html, slot).toContain(`data-slot="${slot}"`)
    }
    // サーバーでは取得しない。最初の描画は初回の読み込み（Skeleton は 200ms までは見せない）
    expect(html).toContain(">loading<")
    expect(html).not.toContain('data-revealed="')
    expect(html).toContain('aria-busy="true"')
    // 0 は 0、未登録は「—」と支援技術向けの名前、取得できない値は文字で示す
    expect(html).toContain(">0円<")
    expect(html).toContain("未定")
    expect(html).toContain("取得できません")
    expect(html).toMatch(/role="radio"[^>]*aria-checked="true"/)
    const mod = (await vite.ssrLoadModule("/src/ssr/data-browsing-fixture.tsx")) as typeof import("../src/ssr/data-browsing-fixture")
    expect(renderToString(createElement(mod.DataBrowsingSsrFixture))).toBe(html)
  })

  test('Data Browsing hook files declare "use client"', () => {
    const files = readdirSync(patternsDir).filter((f) => ["browse-query.ts", "browse-data.ts", "bulk-selection.ts", "list-detail.ts"].includes(f))
    expect(files).toHaveLength(4)
    for (const file of files) expect(readFileSync(patternsDir + file, "utf8").startsWith('"use client"'), file).toBe(true)
  })

  test("hydrates without mismatches; data loads and the patterns work after hydration", async ({ page, isMobile }) => {
    await openSsr(page)
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
    await expect(page.getByTestId("ssr-status")).toHaveText("ready")
    await expect(page.locator("tbody tr[data-row-id]")).toHaveCount(5)
    await page.getByRole("checkbox", { name: /を選択$/ }).first().click()
    await expect(page.getByTestId("ssr-selected")).toHaveText("1件を選択中")
    await page.getByRole("radio", { name: "カンバン" }).click()
    await expect(page.getByRole("radio", { name: "カンバン" })).toHaveAttribute("aria-checked", "true")
    if (!isMobile) {
      await page.getByRole("radio", { name: "カンバン" }).focus()
      await page.keyboard.press("ArrowLeft")
      await expect(page.getByRole("radio", { name: "表" })).toBeChecked()
    }
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
  })
})
