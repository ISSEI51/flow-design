import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import type { ViteDevServer } from "vite"
import { collectPageErrors } from "./page-errors"
import { createSsrServer } from "./ssr-server"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// Data Analysis の Patterns の SSR と Hydration の検品。仕組みは ssr-data-browsing.spec.ts と同じ。
// 1. Node.js（window と document がない環境）で preview/src/ssr/data-analysis-fixture.tsx を HTML にする
// 2. ブラウザで、その HTML を preview/ssr.html の #root に入れて Hydration し、不一致のエラーがないことを確かめる
// .tsx の "use client" の境界は ssr-app-structure.spec.ts が registry/patterns のすべてのファイルで確かめる。ここでは .ts を確かめる。

let vite: ViteDevServer
let html = ""

test.beforeAll(async ({}, workerInfo) => {
  vite = await createSsrServer("ssr-data-analysis", workerInfo)
  const mod = (await vite.ssrLoadModule("/src/ssr/data-analysis-fixture.tsx")) as typeof import("../src/ssr/data-analysis-fixture")
  html = renderToString(createElement(mod.DataAnalysisSsrFixture))
})

test.afterAll(async () => {
  await vite?.close()
})

async function openSsr(page: Page) {
  await page.route("**/ssr.html", async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace("<!--ssr-outlet-->", html).replace("/src/ssr/client.tsx", "/src/ssr/data-analysis-client.tsx")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr.html")
  await page.waitForFunction(() => window.__ssrHydrated === true)
}

const patternsDir = fileURLToPath(new URL("../../registry/patterns/", import.meta.url))

test.describe("SSR (Data Analysis)", { tag: "@webkit" }, () => {
  test("renders on the server without window or document, deterministically", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined")
    for (const slot of ["metric-group", "metric", "metric-value", "comparison-value", "metric-target", "sparkline", "analysis-region", "analysis-scope-note", "analysis-period-filter", "comparison-select", "granularity-select", "drill-down-link"]) {
      expect(html, slot).toContain(`data-slot="${slot}"`)
    }
    // サーバーでは取得しない。最初の描画は読み込み中
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('data-state="loading"')
    // 省略表記、実際の 0、取得できない値、算出できない値
    expect(html).toContain("約")
    expect(html).toContain("4.42")
    expect(html).toContain(">0<")
    expect(html).toContain("取得できません")
    expect(html).toContain("算出できません")
    expect(html).not.toMatch(/NaN|Infinity/)
    expect(html).toContain("25日間")
    expect(html).toContain("2026/10/01〜2026/10/25")
    const mod = (await vite.ssrLoadModule("/src/ssr/data-analysis-fixture.tsx")) as typeof import("../src/ssr/data-analysis-fixture")
    expect(renderToString(createElement(mod.DataAnalysisSsrFixture))).toBe(html)
  })

  test('Data Analysis files declare "use client" only where needed', () => {
    expect(readFileSync(patternsDir + "analysis-query.ts", "utf8").startsWith('"use client"')).toBe(true)
    // 純粋な計算のファイルは、サーバーでもクライアントでも使える（"use client" を付けない）
    for (const f of ["analysis-period.ts", "comparison.ts", "metric-format.ts"]) expect(readFileSync(patternsDir + f, "utf8").startsWith('"use client"'), f).toBe(false)
  })

  test("hydrates without mismatches; data loads and the patterns work after hydration", async ({ page }) => {
    await openSsr(page)
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
    await expect(page.getByTestId("ssr-accounts").locator("[data-slot=metric-value]")).toHaveText("428社")
    await page.getByTestId("ssr-cross").click()
    await expect(page.getByTestId("ssr-cross")).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("ssr-cross-state")).toHaveText("スタンダード")
    await page.locator("[data-slot=analysis-period-select]").click()
    await page.getByRole("option", { name: "先月", exact: true }).click()
    await expect(page.getByTestId("ssr-period")).toHaveText("31日間")
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
  })
})
