import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createServer, type ViteDevServer } from "vite"
import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// Forms、Feedback、Overlays の部品の SSR と Hydration の検品。仕組みは ssr.spec.ts と同じ。
// 1. Node.js（window と document がない環境）で preview/src/ssr/core-fixture.tsx を react-dom/server で HTML にする
// 2. ブラウザで、その HTML を preview/ssr.html の #root に入れて Hydration し、不一致のエラーがないことを確かめる
// あわせて、registry のすべての部品で "use client" の境界が規則どおりであることを確かめる。

let vite: ViteDevServer
let html = ""

test.beforeAll(async () => {
  vite = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
    // 検品の開発サーバーと、ほかの SSR の検品とは、依存パッケージのキャッシュを共有しない（同時に書き込むと失敗するため）。
    cacheDir: fileURLToPath(new URL("../../node_modules/.vite-ssr-core-check", import.meta.url)),
  })
  const mod = (await vite.ssrLoadModule("/src/ssr/core-fixture.tsx")) as typeof import("../src/ssr/core-fixture")
  html = renderToString(createElement(mod.CoreSsrFixture))
})

test.afterAll(async () => {
  await vite?.close()
})

async function openSsr(page: Page, { script = true } = {}) {
  await page.route("**/ssr.html", async (route) => {
    const res = await route.fetch()
    let body = (await res.text()).replace("<!--ssr-outlet-->", html).replace("/src/ssr/client.tsx", "/src/ssr/core-client.tsx")
    if (!script) body = body.replace(/<script type="module" src="\/src\/ssr\/core-client\.tsx[^"]*"><\/script>/, "")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr.html")
  if (script) await page.waitForFunction(() => window.__ssrHydrated === true)
}

const uiDir = fileURLToPath(new URL("../../registry/components/ui/", import.meta.url))

test.describe("SSR (Forms, Feedback, Overlays)", { tag: "@webkit" }, () => {
  test("renders on the server without window or document, deterministically", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined")
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined")
    for (const slot of [
      "input",
      "textarea",
      "select-trigger",
      "radio-group",
      "checkbox",
      "switch",
      "alert",
      "avatar",
      "badge",
      "skeleton",
      "progress",
      "button",
    ]) {
      expect(html, slot).toContain(`data-slot="${slot}"`)
    }
    // 値は、サーバーの HTML に含める（Hydration の前から見える）
    expect(html).toContain('value="北星物流株式会社"')
    expect(html).toContain("年払い")
    // 重なりの部品は、閉じている間は内容を描画しない（Portal を使わない）
    expect(html).not.toContain("新しい担当者を選んでください。")
    expect(html).not.toContain("解約すると、元に戻せません。")
    // 同じ入力からは、毎回同じ HTML になる
    const mod = (await vite.ssrLoadModule("/src/ssr/core-fixture.tsx")) as typeof import("../src/ssr/core-fixture")
    expect(renderToString(createElement(mod.CoreSsrFixture))).toBe(html)
  })

  test('every component that uses hooks, contexts or event handlers declares "use client"', () => {
    // Next.js の App Router などでは、hook、Context、関数の props を使う部品をクライアントの部品として読み込む必要がある。
    // 付けないと、サーバーの部品から読み込んだときにビルドで失敗する。
    const needsClient = /\b(?:React\.)?(?:use[A-Z]\w*|createContext)\s*[<(]|\son[A-Z]\w*=\{/
    const missing: string[] = []
    const unneeded: string[] = []
    for (const file of readdirSync(uiDir).filter((f) => f.endsWith(".tsx"))) {
      const src = readFileSync(uiDir + file, "utf8")
      const client = src.startsWith('"use client"')
      if (needsClient.test(src) && !client) missing.push(file)
      if (!needsClient.test(src) && client) unneeded.push(file)
    }
    expect(missing).toEqual([])
    // hook も関数の props も使わない部品は、サーバーの部品として使える（付けない）
    expect(unneeded).toEqual([])
  })

  test("hydrates without mismatches; the components work after hydration", async ({ page }) => {
    await openSsr(page)
    // __ssrHydrated は、ルートの effect（Hydration のコミットの後）で true になる（hydrated.tsx）
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
    // Select
    await page.getByTestId("ssr-core-plan").click()
    await expect(page.getByRole("option", { name: "月払い" })).toBeVisible()
    await page.getByRole("option", { name: "月払い" }).click()
    await expect(page.getByTestId("ssr-core-plan")).toHaveText(/月払い/)
    // Select が閉じ終わる（閉じる動きの後に一覧を外し、フォーカスを Select に戻す）まで待ってから、次の部品を操作する。
    // 閉じ終わる前に Dialog を開くと、Select がフォーカスを戻す処理が Dialog を開いた後に実行され、Dialog を閉じた後のフォーカスが
    // Select に移ることがある（実行の速さで順序が変わる。負荷をかけた WebKit で 160 回中 30 回）。
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await expect(page.getByTestId("ssr-core-plan")).toBeFocused()
    // Checkbox と Switch
    await page.getByTestId("ssr-core-terms").click()
    await expect(page.getByTestId("ssr-core-terms")).toHaveAttribute("aria-checked", "false")
    await page.getByTestId("ssr-core-notify").click()
    await expect(page.getByTestId("ssr-core-notify")).toHaveAttribute("aria-checked", "false")
    // Dialog と Alert Dialog は、Hydration の後に開き、閉じるとフォーカスが戻る
    await page.getByTestId("ssr-core-dialog-open").click()
    await expect(page.getByRole("dialog", { name: "担当者を変更" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByTestId("ssr-core-dialog-open")).toBeFocused()
    await page.getByRole("button", { name: "契約を解約" }).click()
    await expect(page.getByRole("alertdialog", { name: "契約を解約しますか？" })).toBeVisible()
    await page.getByRole("button", { name: "キャンセル" }).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    // Dropdown Menu
    await page.getByTestId("ssr-core-menu").click()
    await expect(page.getByRole("menuitem", { name: "複製" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    // 操作の後にも、Hydration の不一致などの報告が届いていない
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
  })

  test("before hydration, the server HTML shows the values and controls", async ({ page }) => {
    await openSsr(page, { script: false })
    await expect(page.getByTestId("ssr-core-company")).toHaveValue("北星物流株式会社")
    await expect(page.getByTestId("ssr-core-plan")).toHaveText(/年払い/)
    await expect(page.getByTestId("ssr-core-terms")).toHaveAttribute("aria-checked", "true")
    await expect(page.getByTestId("ssr-core-notify")).toHaveAttribute("aria-checked", "true")
    await expect(page.getByRole("alert").or(page.locator("[data-slot=alert]")).first()).toContainText("契約の更新日が近づいています")
    // Avatar は、画像の読み込みの前は頭文字を表示する
    await expect(page.locator("[data-slot=avatar-fallback]")).toHaveText("山")
    await expect(page.getByTestId("ssr-core-progress")).toHaveAttribute("aria-valuenow", "40")
  })
})
