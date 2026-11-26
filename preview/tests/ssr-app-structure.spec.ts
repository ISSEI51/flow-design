import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createServer, type ViteDevServer } from "vite"
import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// App Structure の Patterns（App Shell、Navigation、Page Header、Page Layout、Section Layout）の SSR と Hydration の検品。
// 仕組みは ssr.spec.ts と同じ。
// 1. Node.js（window と document がない環境）で preview/src/ssr/app-structure-fixture.tsx を react-dom/server で HTML にする
// 2. ブラウザで、その HTML を preview/ssr.html の #root に入れて Hydration し、不一致のエラーがないことを確かめる
// あわせて、registry/patterns のすべてのファイルで "use client" の境界が規則どおりであることを確かめる。

let vite: ViteDevServer
let html = ""

test.beforeAll(async () => {
  vite = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
    // ほかの SSR の検品と、依存パッケージのキャッシュを共有しない（同時に書き込むと失敗するため）。
    cacheDir: fileURLToPath(new URL("../../node_modules/.vite-ssr-app-structure-check", import.meta.url)),
  })
  const mod = (await vite.ssrLoadModule("/src/ssr/app-structure-fixture.tsx")) as typeof import("../src/ssr/app-structure-fixture")
  html = renderToString(createElement(mod.AppStructureSsrFixture))
})

test.afterAll(async () => {
  await vite?.close()
})

async function openSsr(page: Page, { script = true } = {}) {
  await page.route("**/ssr.html", async (route) => {
    const res = await route.fetch()
    let body = (await res.text()).replace("<!--ssr-outlet-->", html).replace("/src/ssr/client.tsx", "/src/ssr/app-structure-client.tsx")
    if (!script) body = body.replace(/<script type="module" src="\/src\/ssr\/app-structure-client\.tsx[^"]*"><\/script>/, "")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr.html")
  if (script) await page.waitForFunction(() => window.__ssrHydrated === true)
}

const patternsDir = fileURLToPath(new URL("../../registry/patterns/", import.meta.url))

test.describe("SSR (App Structure)", { tag: "@webkit" }, () => {
  test("renders on the server without window or document, deterministically", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined")
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined")
    for (const slot of [
      "app-shell-skip-link",
      "app-shell-main",
      "sidebar-nav",
      "page-layout",
      "page-layout-content",
      "page-header",
      "page-header-title",
      "page-columns",
      "section",
      "section-title",
      "bottom-nav",
    ]) {
      expect(html, slot).toContain(`data-slot="${slot}"`)
    }
    // 見出しの階層：ページは h1、Section は h2、入れ子の Section は h3
    expect(html).toMatch(/<h1[^>]*data-slot="page-header-title"/)
    expect(html).toMatch(/<h2[^>]*data-slot="section-title"[^>]*>北海物産株式会社<\/h2>/)
    expect(html).toMatch(/<h3[^>]*data-slot="section-title"[^>]*>契約の内容<\/h3>/)
    // 現在地を含むグループ（契約）は、サーバーの HTML でも開いている
    expect(html).toContain('aria-current="page"')
    expect(html).toContain("更新が近い契約")
    // サーバーでの useIsMobile は false（デスクトップの表示）
    expect(html).toContain('data-slot="sidebar-container"')
    const mod = (await vite.ssrLoadModule("/src/ssr/app-structure-fixture.tsx")) as typeof import("../src/ssr/app-structure-fixture")
    expect(renderToString(createElement(mod.AppStructureSsrFixture))).toBe(html)
  })

  test('every pattern that uses hooks, contexts or event handlers declares "use client"', () => {
    const needsClient = /\b(?:React\.)?(?:use[A-Z]\w*|createContext)\s*[<(]|\son[A-Z]\w*=\{/
    const missing: string[] = []
    const unneeded: string[] = []
    const files = readdirSync(patternsDir).filter((f) => f.endsWith(".tsx"))
    expect(files.length).toBeGreaterThanOrEqual(6)
    for (const file of files) {
      const src = readFileSync(patternsDir + file, "utf8")
      const client = src.startsWith('"use client"')
      if (needsClient.test(src) && !client) missing.push(file)
      if (!needsClient.test(src) && client) unneeded.push(file)
    }
    expect(missing).toEqual([])
    expect(unneeded).toEqual([])
  })

  test("hydrates without mismatches; navigation and the shell work after hydration", async ({ page, isMobile }) => {
    await openSsr(page)
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
    // ページ全体はスクロールせず、main がスクロールの領域になる
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
    // Sticky の Page Header と AppShellMain の組み合わせ：固定した高さを main の scroll-padding-top に設定し、
    // 固定している間だけ境界線を示す
    const main = page.getByTestId("ssr-main")
    const header = page.locator("[data-slot=page-header]")
    await expect(header).not.toHaveAttribute("data-stuck")
    await main.evaluate((el) => el.scrollTo({ top: 300 }))
    await expect(header).toHaveAttribute("data-stuck", "true")
    const height = (await header.boundingBox())!.height
    await expect.poll(() => main.evaluate((el) => parseFloat(getComputedStyle(el).scrollPaddingTop))).toBeCloseTo(height, 0)
    expect(await main.evaluate((el) => el.style.getPropertyValue("--app-shell-sticky-top"))).toBe(`${Math.round(height)}px`)
    // Page Header の下に隠れる位置のリンクにフォーカスすると、隠れない位置までスクロールする
    const link = page.getByRole("link", { name: "契約 1", exact: true })
    await link.focus()
    await expect.poll(async () => (await link.boundingBox())!.y).toBeGreaterThanOrEqual((await header.boundingBox())!.y + height - 1)
    await main.evaluate((el) => el.scrollTo({ top: 0 }))
    if (isMobile) {
      await expect(page.locator("[data-slot=sidebar-container]")).toHaveCount(0)
      await expect(page.locator("[data-slot=bottom-nav]")).toBeVisible()
      await page.locator("[data-slot=sidebar-trigger]").click()
      const dialog = page.getByRole("dialog", { name: "メニュー" })
      await expect(dialog).toBeVisible()
      await dialog.getByRole("link", { name: "請求書" }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0)
    } else {
      await expect(page.locator("[data-slot=bottom-nav]")).toBeHidden()
      const nav = page.getByRole("navigation", { name: "メインメニュー" })
      await nav.getByRole("link", { name: "請求書" }).click()
      await expect(nav.getByRole("link", { name: "請求書" })).toHaveAttribute("aria-current", "page")
    }
    // 移動の後は、ページの見出しにフォーカスが移る
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
  })

  test("before hydration, the CSS shows the right navigation and layout for the width", async ({ page, isMobile }) => {
    await openSsr(page, { script: false })
    const container = page.locator("[data-slot=sidebar-container]")
    if (isMobile) await expect(container).toBeHidden()
    else await expect(container).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const main = (await page.getByTestId("ssr-main").boundingBox())!
    expect(main.x).toBe(isMobile ? 0 : 240)
    // 最大幅（Standard 960px）と余白は、Hydration の前から適用される
    const content = (await page.locator("[data-slot=page-layout-content]").boundingBox())!
    expect(content.width).toBeLessThanOrEqual(960)
    expect(content.x - main.x).toBe(isMobile ? 16 : 24)
    // Bottom Navigation はモバイルの幅でだけ表示する
    if (isMobile) await expect(page.locator("[data-slot=bottom-nav]")).toBeVisible()
    else await expect(page.locator("[data-slot=bottom-nav]")).toBeHidden()
  })
})
