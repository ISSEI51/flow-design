import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createServer, type ViteDevServer } from "vite"
import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// Data Display（Table、Data Table、Pagination、Chart）の SSR と Hydration の検品。
// npm run test:ssr（ファイル名に ssr を含むテスト）と npm run test:components の両方で実行する。
// Node.js（window と document がない環境）で Table、Data Table、Pagination、Chart を HTML にし、
// ブラウザで Hydration して不一致がないことを確かめる。手順は ssr.spec.ts と同じ。
test.describe("Data Display SSR", { tag: "@webkit" }, () => {
  let vite: ViteDevServer
  let html = ""

  test.beforeAll(async () => {
    vite = await createServer({
      configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
      logLevel: "error",
      // 検品の開発サーバーと、ssr.spec.ts のキャッシュを共有しない。同時に書き込むと失敗するため。
      cacheDir: fileURLToPath(new URL("../../node_modules/.vite-ssr-check-data-display", import.meta.url)),
    })
    const mod = (await vite.ssrLoadModule("/src/ssr/data-display-fixture.tsx")) as typeof import("../src/ssr/data-display-fixture")
    html = renderToString(createElement(mod.DataDisplaySsrFixture))
  })

  test.afterAll(async () => {
    await vite?.close()
  })

  test("renders on the server and hydrates without mismatches", async ({ page }) => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined")
    expect(html).toContain('data-slot="table"')
    expect(html).toContain('data-slot="data-table"')
    expect(html).toContain('data-slot="pagination-controls"')
    expect(html).toContain('data-slot="cursor-pagination"')
    expect(html).toContain('data-slot="chart"')
    // サーバーでは広い画面の並び（前後 1 ページ）にする
    expect(html).toContain('aria-label="2ページ目"')
    const errors: string[] = []
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    await page.route("**/ssr.html", async (route) => {
      const res = await route.fetch()
      const body = (await res.text())
        .replace("<!--ssr-outlet-->", html)
        .replace("/src/ssr/client.tsx", "/src/ssr/data-display-client.tsx")
      await route.fulfill({ response: res, body })
    })
    await page.goto("/ssr.html")
    await page.waitForFunction(() => window.__ssrHydrated === true)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
    expect(errors.filter((e) => /hydrat|did not match|mismatch/i.test(e))).toEqual([])
    // Hydration の後に操作できる
    await page.getByRole("checkbox", { name: "青葉製作所を選択" }).click()
    await expect(page.getByRole("checkbox", { name: "このページの行をすべて選択" })).toHaveAttribute("aria-checked", "mixed")
    await page.getByRole("button", { name: "会社名" }).click()
    await expect(page.locator("th[aria-sort]")).toHaveAttribute("aria-sort", "ascending")
  })
})

