import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createServer, type ViteDevServer } from "vite"
import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// SSR と Hydration の検品。
// 1. Node.js（window と document がない環境）で、Vite の SSR の読み込みを使って preview/src/ssr/fixture.tsx を
//    react-dom/server で HTML にする。window や document を参照すると、ここで失敗する。
// 2. ブラウザで、その HTML を preview/ssr.html の #root に入れて Hydration し、不一致のエラーがないことを確かめる。
// Next.js などのフレームワークは使わない。全コンポーネントの Next.js での導入の検品は、Registry & Gallery の段階で行う。

let vite: ViteDevServer
let html = ""

test.beforeAll(async () => {
  vite = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
    // 検品の開発サーバー（webServer）と依存パッケージのキャッシュを共有しない。同時に書き込むと失敗するため。
    cacheDir: fileURLToPath(new URL("../../node_modules/.vite-ssr-check", import.meta.url)),
  })
  const mod = (await vite.ssrLoadModule("/src/ssr/fixture.tsx")) as typeof import("../src/ssr/fixture")
  html = renderToString(createElement(mod.SsrFixture))
})

test.afterAll(async () => {
  await vite?.close()
})

// サーバーの HTML を入れた検品用のページを開く。script=false のときは、Hydration の前の表示を確かめる。
async function openSsr(page: Page, { script = true } = {}) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`)
  })
  await page.route("**/ssr.html", async (route) => {
    const res = await route.fetch()
    let body = (await res.text()).replace("<!--ssr-outlet-->", html)
    if (!script) body = body.replace(/<script type="module" src="\/src\/ssr\/client\.tsx[^"]*"><\/script>/, "")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr.html")
  if (script) await page.waitForFunction(() => window.__ssrHydrated === true)
  return errors
}

test.describe("SSR", { tag: "@webkit" }, () => {
  test("renders on the server without window or document, deterministically", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined")
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined")
    expect(html).toContain('data-slot="sidebar-wrapper"')
    expect(html).toContain('data-slot="tabs-list"')
    expect(html).toContain('data-slot="breadcrumb-page"')
    expect(html).toContain('data-slot="accordion-trigger"')
    expect(html).toContain('data-slot="card"')
    expect(html).toContain('role="separator"')
    expect(html).toContain('data-slot="sidebar-menu-skeleton"')
    // サーバーでの useIsMobile は false（デスクトップの表示）
    expect(html).toContain('data-slot="sidebar-container"')
    // 同じ入力からは、毎回同じ HTML になる（Math.random() などを使っていない）
    const mod = (await vite.ssrLoadModule("/src/ssr/fixture.tsx")) as typeof import("../src/ssr/fixture")
    expect(renderToString(createElement(mod.SsrFixture))).toBe(html)
  })

  test("hydrates without mismatches", async ({ page, isMobile }) => {
    const errors = await openSsr(page)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
    expect(errors.filter((e) => /hydrat|did not match|mismatch/i.test(e))).toEqual([])
    const trigger = page.locator("[data-slot=sidebar-trigger]")
    if (isMobile) {
      // Hydration の後に、モバイルの表示（Sheet）に切り替わる
      await expect(trigger).toHaveAttribute("aria-haspopup", "dialog")
      await expect(page.locator("[data-slot=sidebar-container]")).toHaveCount(0)
      await trigger.click()
      await expect(page.getByRole("dialog", { name: "メニュー" })).toBeVisible()
    } else {
      await expect(trigger).toHaveAttribute("aria-expanded", "true")
      expect((await page.locator("[data-slot=sidebar-container]").boundingBox())!.width).toBe(240)
      // Hydration の後も、状態のある部品が操作できる
      await page.getByRole("tab", { name: "予定" }).click()
      await expect(page.getByRole("tab", { name: "予定" })).toHaveAttribute("aria-selected", "true")
    }
  })

  test("before hydration, the CSS shows the right navigation for the width", async ({ page, isMobile }) => {
    await openSsr(page, { script: false })
    const container = page.locator("[data-slot=sidebar-container]")
    // サーバーの HTML はデスクトップの表示。モバイルの幅では CSS（md 未満で非表示）で隠れ、内容に重ならない。
    if (isMobile) await expect(container).toBeHidden()
    else await expect(container).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const main = (await page.getByTestId("ssr-main").boundingBox())!
    expect(main.x).toBe(isMobile ? 0 : 240)
    // 非表示の領域（選んでいない Tabs のパネル、閉じた Accordion）は、Hydration の前から見えない
    await expect(page.getByText("北海物産株式会社")).toBeVisible()
    // 要素が存在すること（toHaveCount）を先に確かめ、存在しないことで見えない判定にならないようにする
    const hiddenPanel = page.getByRole("tabpanel", { includeHidden: true }).filter({ hasText: /^予定$/ })
    await expect(hiddenPanel).toHaveCount(1)
    await expect(hiddenPanel).toBeHidden()
    const closedContent = page.getByText("更新の前に担当者へ連絡する")
    await expect(closedContent).toHaveCount(1)
    await expect(closedContent).toBeHidden()
  })
})
