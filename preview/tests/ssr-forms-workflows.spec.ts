import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import type { ViteDevServer } from "vite"
import { collectPageErrors } from "./page-errors"
import { createSsrServer } from "./ssr-server"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// Forms & Workflows の Patterns の SSR と Hydration の検品。仕組みは ssr-data-browsing.spec.ts と同じ。
// 1. Node.js（window と document がない環境）で preview/src/ssr/forms-workflows-fixture.tsx を HTML にする
// 2. ブラウザで、その HTML を preview/ssr.html の #root に入れて Hydration し、不一致のエラーがないことを確かめる
// あわせて、Forms & Workflows の hook のファイル（.ts）の "use client" の境界を確かめる（.tsx は ssr-app-structure.spec.ts）。

let vite: ViteDevServer
let html = ""

test.beforeAll(async ({}, workerInfo) => {
  vite = await createSsrServer("ssr-forms-workflows", workerInfo)
  const mod = (await vite.ssrLoadModule("/src/ssr/forms-workflows-fixture.tsx")) as typeof import("../src/ssr/forms-workflows-fixture")
  html = renderToString(createElement(mod.FormsWorkflowsSsrFixture))
})

test.afterAll(async () => {
  await vite?.close()
})

async function openSsr(page: Page) {
  await page.route("**/ssr.html", async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace("<!--ssr-outlet-->", html).replace("/src/ssr/client.tsx", "/src/ssr/forms-workflows-client.tsx")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr.html")
  await page.waitForFunction(() => window.__ssrHydrated === true)
}

const patternsDir = fileURLToPath(new URL("../../registry/patterns/", import.meta.url))

test.describe("SSR (Forms & Workflows)", { tag: "@webkit" }, () => {
  test("renders on the server without window or document, deterministically", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined")
    for (const slot of ["stepper", "form-row", "form-actions", "save-blocker-notice", "column-mapping", "import-validation-summary", "import-result"]) {
      expect(html, slot).toContain(`data-slot="${slot}"`)
    }
    // 最初の描画：未操作の項目にエラーを出さず、保存できない理由だけを示す
    expect(html).not.toContain('data-slot="field-error"')
    expect(html).toContain("あと 3 項目を入力すると保存できます")
    expect(html).toContain('aria-current="step"')
    // 自動の対応付け（TEL は別名で電話番号）。同じ項目に一致する列が複数ある場合は曖昧として対応付けない
    expect(html).toContain("見出しから自動で対応付けました")
    expect(html).toContain("候補が複数あります")
    const mod = (await vite.ssrLoadModule("/src/ssr/forms-workflows-fixture.tsx")) as typeof import("../src/ssr/forms-workflows-fixture")
    expect(renderToString(createElement(mod.FormsWorkflowsSsrFixture))).toBe(html)
  })

  test('Forms & Workflows hook files declare "use client"', () => {
    const files = readdirSync(patternsDir).filter((f) => ["form-state.ts", "save-modes.ts", "step-flow.ts", "import-mapping.ts"].includes(f))
    expect(files).toHaveLength(4)
    for (const file of files) expect(readFileSync(patternsDir + file, "utf8").startsWith('"use client"'), file).toBe(true)
    // React を使わない関数だけのファイルは "use client" を付けない（サーバーでも使える）
    expect(readFileSync(patternsDir + "export.ts", "utf8").startsWith('"use client"')).toBe(false)
  })

  test("hydrates without mismatches; validation, the stepper and the dialog work after hydration", async ({ page }) => {
    await openSsr(page)
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
    const next = page.getByTestId("ssr-next")
    await expect(next).toHaveAttribute("aria-disabled", "true")
    await page.locator("#ssr-last").fill("山田")
    await page.locator("#ssr-first").fill("太郎")
    await page.locator("#ssr-email").fill("yamada@example.com")
    await expect(next).not.toHaveAttribute("aria-disabled", "true")
    await next.click()
    await expect(page.getByTestId("ssr-step")).toHaveText("b")
    await page.getByRole("button", { name: "削除" }).click()
    await expect(page.getByRole("alertdialog")).toBeVisible()
    await expect(page.getByRole("button", { name: "キャンセル" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("alertdialog")).toBeHidden()
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
  })
})
