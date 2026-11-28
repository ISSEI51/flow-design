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

// System & Account の Patterns の SSR と Hydration の検品。仕組みは ssr-data-browsing.spec.ts と同じ。
// 1. Node.js（window、document、navigator がない環境）で preview/src/ssr/system-account-fixture.tsx を HTML にする
// 2. ブラウザで、その HTML を preview/ssr.html の #root に入れて Hydration し、不一致のエラーがないことを確かめる
// あわせて、System & Account の hook のファイル（.ts）の "use client" の境界を確かめる（.tsx は ssr-app-structure.spec.ts）。

let vite: ViteDevServer
let html = ""

test.beforeAll(async ({}, workerInfo) => {
  vite = await createSsrServer("ssr-system-account", workerInfo)
  const mod = (await vite.ssrLoadModule("/src/ssr/system-account-fixture.tsx")) as typeof import("../src/ssr/system-account-fixture")
  html = renderToString(createElement(mod.SystemAccountSsrFixture))
})

test.afterAll(async () => {
  await vite?.close()
})

async function openSsr(page: Page) {
  await page.route("**/ssr.html", async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace("<!--ssr-outlet-->", html).replace("/src/ssr/client.tsx", "/src/ssr/system-account-client.tsx")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr.html")
  await page.waitForFunction(() => window.__ssrHydrated === true)
}

const patternsDir = fileURLToPath(new URL("../../registry/patterns/", import.meta.url))

test.describe("SSR (System & Account)", { tag: "@webkit" }, () => {
  test("renders on the server without window or document, deterministically, with permissions unresolved", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined")
    expect(typeof (globalThis as { navigator?: { onLine?: unknown } }).navigator?.onLine).toBe("undefined")
    for (const slot of ["auth-layout", "auth-form-error", "settings-layout", "system-banner", "access-state"]) {
      expect(html, slot).toContain(`data-slot="${slot}"`)
    }
    // サーバーでは権限を取得しない。最初の描画は取得中で、編集の操作を許可しない
    expect(html).toContain(">loading<")
    expect(html).toMatch(/data-testid="ssr-edit"[^>]*(disabled|aria-disabled="true")/)
    // パスワードは非表示、確認コードは 1 つの入力欄で one-time-code
    expect(html).toMatch(/type="password"[^>]*data-testid="ssr-password"|data-testid="ssr-password"[^>]*type="password"/)
    expect(html.match(/autoComplete="one-time-code"|autocomplete="one-time-code"/gi)?.length).toBe(1)
    const mod = (await vite.ssrLoadModule("/src/ssr/system-account-fixture.tsx")) as typeof import("../src/ssr/system-account-fixture")
    expect(renderToString(createElement(mod.SystemAccountSsrFixture))).toBe(html)
  })

  test('System & Account hook files declare "use client"; pure modules do not', () => {
    const hooks = ["scope-guard.ts", "setting-save.ts", "notification-feed.ts", "access.ts", "system-status-hooks.ts"]
    for (const file of hooks) expect(readFileSync(patternsDir + file, "utf8").startsWith('"use client"'), file).toBe(true)
    // ブラウザを使わない単体の検品と、Server Components から読み込める純粋な関数のファイル
    const pure = ["auth-flow.ts", "onboarding.ts", "setting-resolve.ts", "system-status.ts", "notification-state.ts", "access-decision.ts"]
    for (const file of pure) {
      const src = readFileSync(patternsDir + file, "utf8")
      expect(src.startsWith('"use client"'), file).toBe(false)
      expect(/\buse[A-Z]\w*\s*\(/.test(src), `${file} uses no hooks`).toBe(false)
    }
  })

  test("hydrates without mismatches; the patterns work after hydration", async ({ page }) => {
    await openSsr(page)
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
    await expect(page.getByTestId("ssr-access")).toHaveText("ready")
    await expect(page.getByTestId("ssr-guard")).toHaveText("u-sato:hq")
    // パスワードの表示の切り替え（送信しない、値を失わない）
    const pw = page.getByTestId("ssr-password")
    await pw.fill("secret-value")
    await page.getByRole("button", { name: /パスワードを表示/ }).click()
    await expect(pw).toHaveAttribute("type", "text")
    await expect(pw).toHaveValue("secret-value")
    // 確認コードは先頭の 0 を残す
    await page.getByTestId("ssr-code").fill("012345")
    await expect(page.getByTestId("ssr-code")).toHaveValue("012345")
    // 即時保存
    await page.getByTestId("ssr-digest").click()
    await expect(page.getByTestId("ssr-digest-status")).toHaveText(/保存しました/)
    // 閉じた案内は描画しない
    await page.getByRole("button", { name: "この案内を閉じる" }).click()
    await expect(page.getByText("会社名の一部でも検索できます。")).toHaveCount(0)
    expect(await page.evaluate(() => window.__ssrErrors)).toEqual([])
  })
})
