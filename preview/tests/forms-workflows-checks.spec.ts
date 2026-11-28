import { expect, test, type Page } from "@playwright/test"

import { escapeCsvCell } from "../../registry/patterns/export"
import { importOutcome, reconcileImportResult, sanitizeMapping, createImportColumns } from "../../registry/patterns/import-mapping"
import type { HeldFilter } from "../src/data/forms-workflows/server"
import { collectPageErrors } from "./page-errors"

// Forms & Workflows v0.1 の境界の条件の検品（#/forms-checks）。
// 保留中の処理は window.__fdFormsChecks の resolve と reject で、検品から順序を決めて解決する（固定の時間に頼らない）。
collectPageErrors(test)

type Checks = NonNullable<Window["__fdFormsChecks"]>
const open = async (page: Page, kind: string) => {
  await page.goto(`/#/forms-checks?case=${kind}`)
  await expect(page.getByRole("heading", { level: 1 })).toContainText(kind)
}
const count = (page: Page, key: string) => page.evaluate((k) => window.__fdFormsChecks!.count(k), key)
const resolve = (page: Page, key: string, value: unknown, index = 0) =>
  page.evaluate(([k, v, i]) => window.__fdFormsChecks!.resolve(k as string, v, i as number), [key, value, index] as const)
const reject = (page: Page, key: string, kind: "plain" | "failed" | "unknown") =>
  page.evaluate(
    ([k, t]) => {
      const c = window.__fdFormsChecks as Checks
      c.reject(k, t === "plain" ? new TypeError("Failed to fetch") : new c.FormSaveError("x", t as "failed" | "unknown"))
    },
    [key, kind] as const
  )
const state = async <T,>(page: Page, testId: string) => JSON.parse((await page.getByTestId(testId).textContent()) ?? "null") as T
const waitCount = (page: Page, key: string, n: number) => expect.poll(() => count(page, key)).toBe(n)

type AsyncState = { status: string; message: string | null; canSubmit: boolean; blockers: string[] }
const asyncState = (page: Page) => state<AsyncState>(page, "async-state")

// ------------------------------------------------------------------ 非同期の検証
test.describe("async validation", { tag: "@webkit" }, () => {
  test.beforeEach(async ({ page }) => open(page, "async"))

  test("a dependency change invalidates the previous result even when the value stays the same", async ({ page }) => {
    await page.getByTestId("code").fill("C1")
    await waitCount(page, "check", 1)
    await resolve(page, "check", null)
    await expect.poll(async () => (await asyncState(page)).status).toBe("valid")
    await page.getByTestId("toggle-org").click()
    await expect.poll(async () => (await asyncState(page)).status).toMatch(/pending|validating/)
    expect((await asyncState(page)).canSubmit).toBe(false)
    await waitCount(page, "check", 1)
    await resolve(page, "check", "組織 B では使われています")
    await expect.poll(async () => (await asyncState(page)).status).toBe("invalid")
    expect((await asyncState(page)).canSubmit).toBe(false)
  })

  test("A → B → A: responses of earlier keys (validators ignoring AbortSignal) do not decide the current value", async ({ page }) => {
    const code = page.getByTestId("code")
    await code.fill("A1")
    await waitCount(page, "check", 1)
    await code.fill("B1")
    await waitCount(page, "check", 2)
    await code.fill("A1")
    await waitCount(page, "check", 3)
    // 古い A1、B1 の応答が先に届いても、現在の A1 の結果として使わない
    await resolve(page, "check", "古い A1 の結果")
    await resolve(page, "check", "B1 の結果")
    await page.waitForTimeout(100)
    expect((await asyncState(page)).status).toBe("validating")
    await resolve(page, "check", null)
    await expect.poll(async () => (await asyncState(page)).status).toBe("valid")
    expect((await asyncState(page)).message).toBeNull()
  })

  test("a field hidden during validation, and reset during validation, ignore the late response", async ({ page }) => {
    await page.getByTestId("code").fill("C1")
    await waitCount(page, "check", 1)
    await page.getByTestId("toggle-show").click()
    await resolve(page, "check", "重複")
    await page.waitForTimeout(100)
    expect(await asyncState(page)).toMatchObject({ status: "idle", canSubmit: true })
    await page.getByTestId("toggle-show").click()
    await waitCount(page, "check", 1)
    await page.getByTestId("reset").click()
    await resolve(page, "check", "重複")
    await page.waitForTimeout(100)
    const s = await asyncState(page)
    expect(s.status).toBe("idle")
    expect(s.blockers).toEqual(["missing"])
  })

  test("a synchronous exception is a failed check that blocks saving; revalidate retries", async ({ page }) => {
    await page.evaluate(() => (window.__fdFormsChecks!.throwSync = true))
    await page.getByTestId("code").fill("C1")
    await expect.poll(async () => (await asyncState(page)).status).toBe("error")
    expect(await asyncState(page)).toMatchObject({ canSubmit: false, blockers: ["check-failed"] })
    await page.evaluate(() => (window.__fdFormsChecks!.throwSync = false))
    await page.getByTestId("revalidate").click()
    await waitCount(page, "check", 1)
    await resolve(page, "check", null)
    await expect.poll(async () => (await asyncState(page)).status).toBe("valid")
  })

  test("asyncFailure allow: a failed check is unverified and does not block saving", async ({ page }) => {
    await page.getByTestId("toggle-allow").click()
    await page.getByTestId("code").fill("C-1")
    await waitCount(page, "check", 1)
    await reject(page, "check", "plain")
    await expect.poll(async () => (await asyncState(page)).status).toBe("unverified")
    expect(await asyncState(page)).toMatchObject({ canSubmit: true, blockers: [] })
  })

  test("a timeout is a failed check (late result ignored)", async ({ page }) => {
    await page.getByTestId("code").fill("C1")
    await waitCount(page, "check", 1)
    await expect.poll(async () => (await asyncState(page)).status, { timeout: 6000 }).toBe("error")
    expect((await asyncState(page)).message).toContain("時間内に終わりませんでした")
    await resolve(page, "check", null)
    await page.waitForTimeout(100)
    expect((await asyncState(page)).status).toBe("error")
  })

  test("a scope change with the same value checks again", async ({ page }) => {
    await page.getByTestId("code").fill("C1")
    await waitCount(page, "check", 1)
    await resolve(page, "check", null)
    await expect.poll(async () => (await asyncState(page)).status).toBe("valid")
    await page.getByTestId("toggle-scope").click()
    // スコープが変わったら、前のスコープの入力値を引き継がない（initialValues から始める。9.4）
    await expect(page.getByTestId("code")).toHaveValue("")
    expect((await asyncState(page)).canSubmit).toBe(false)
    // 同じ値を入れ直しても、前のスコープの検証の結果（valid）を使わず、新しいスコープで確かめ直す
    await page.getByTestId("code").fill("C1")
    await waitCount(page, "check", 1)
    expect((await asyncState(page)).canSubmit).toBe(false)
  })
})

// ------------------------------------------------------------------ Enter による送信
type SubmitState = { submits: number; shownErrors: string[]; canSubmit: boolean; unchanged: boolean }
const submitState = (page: Page) => state<SubmitState>(page, "submit-state")

test.describe("Enter submission", { tag: "@webkit" }, () => {
  test.beforeEach(async ({ page }) => open(page, "submit"))

  test("Enter in a single-line input: blocked form shows errors; valid form saves once", async ({ page }) => {
    await page.getByTestId("f-name").press("Enter")
    expect(await submitState(page)).toMatchObject({ submits: 0, shownErrors: ["name"] })
    await page.getByTestId("f-name").fill("山田")
    await page.getByTestId("f-name").press("Enter")
    await expect.poll(async () => (await submitState(page)).submits).toBe(1)
  })

  for (const id of ["f-memo", "f-kind", "f-account", "f-date", "f-other", "f-prevented"]) {
    test(`Enter in ${id} neither submits nor shows errors`, async ({ page, isMobile }) => {
      test.skip(isMobile && (id === "f-kind" || id === "f-account"), "ハードウェアキーボードの操作")
      await page.getByTestId(id).focus()
      await page.keyboard.press("Enter")
      await page.waitForTimeout(150)
      expect(await submitState(page)).toMatchObject({ submits: 0, shownErrors: [] })
    })
  }

  // 保存できる状態のフォームでも、送信の対象ではない入力欄の Enter で、ブラウザの暗黙の送信が起きない
  for (const id of ["f-memo", "f-date", "f-other", "f-prevented"]) {
    test(`Enter in ${id} does not submit a form that can be saved`, async ({ page }) => {
      await page.getByTestId("f-name").fill("山田")
      await expect.poll(async () => (await submitState(page)).canSubmit).toBe(true)
      await page.getByTestId(id).focus()
      await page.keyboard.press("Enter")
      await page.waitForTimeout(150)
      expect(await submitState(page)).toMatchObject({ submits: 0, shownErrors: [] })
    })
  }

  test("Enter inside a Combobox popup and inside another Dialog does not submit", async ({ page, isMobile }) => {
    test.skip(isMobile, "ハードウェアキーボードの操作")
    await page.getByTestId("f-account").click()
    await page.getByTestId("f-account-input").press("Enter")
    await page.keyboard.press("Escape")
    await page.getByTestId("open-dialog").click()
    await page.getByTestId("f-dialog-input").press("Enter")
    await page.waitForTimeout(150)
    expect(await submitState(page)).toMatchObject({ submits: 0, shownErrors: [] })
  })

  test("a repeated (held) Enter does not submit", async ({ page }) => {
    await page.getByTestId("f-name").fill("山田")
    await page.getByTestId("f-name").dispatchEvent("keydown", { key: "Enter", repeat: true, bubbles: true })
    await page.waitForTimeout(150)
    expect((await submitState(page)).submits).toBe(0)
  })

  test("IME composition Enter does not submit", async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== "chromium" || isMobile, "CDP（Chromium のみ）で IME を再現するため")
    await page.getByTestId("f-name").focus()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Input.imeSetComposition", { text: "やまだ", selectionStart: 3, selectionEnd: 3 })
    await page.keyboard.press("Enter")
    await page.waitForTimeout(150)
    expect((await submitState(page)).submits).toBe(0)
  })

  test("an unchanged edit form does nothing on Enter and requestSubmit; after a change it saves", async ({ page }) => {
    await page.getByTestId("mode-edit").click()
    await expect.poll(async () => (await submitState(page)).unchanged).toBe(true)
    await page.getByTestId("f-name").press("Enter")
    await page.evaluate(() => (document.querySelector("[data-testid=submit-form]") as HTMLFormElement).requestSubmit())
    await page.waitForTimeout(150)
    expect(await submitState(page)).toMatchObject({ submits: 0, shownErrors: [], canSubmit: false })
    await page.getByTestId("f-name").fill("山田太郎")
    await page.getByTestId("f-name").press("Enter")
    await expect.poll(async () => (await submitState(page)).submits).toBe(1)
  })

  test("the focusable disabled save button cannot be activated by click, Enter or Space", async ({ page, isMobile }) => {
    const submit = page.getByTestId("f-submit")
    await expect(submit).toHaveAttribute("aria-disabled", "true")
    await submit.click({ force: true })
    if (!isMobile) {
      await submit.focus()
      await expect(submit).toBeFocused()
      await page.keyboard.press("Enter")
      await page.keyboard.press("Space")
    }
    await page.waitForTimeout(150)
    // 押せない保存ボタンの操作では、保存も、エラーの表示も起きない
    expect(await submitState(page)).toMatchObject({ submits: 0, shownErrors: [] })
  })
})

// ------------------------------------------------------------------ スコープと古い結果
type FormStateOut = { status: string; values: Record<string, unknown>; baseline: Record<string, unknown>; dirty: boolean; canSubmit: boolean; formError: string | null }
const formState = (page: Page) => state<FormStateOut>(page, "scope-form-state")
const log = (page: Page) => state<string[]>(page, "scope-log")

test.describe("scope boundaries and stale results", { tag: "@webkit" }, () => {
  test.beforeEach(async ({ page }) => open(page, "scope"))

  test("a save that finishes after a scope change does not change the new scope", async ({ page }) => {
    await page.getByTestId("s-value").fill("x")
    await page.getByTestId("s-save").click()
    await waitCount(page, "save", 1)
    await page.getByTestId("scope-toggle").click()
    await resolve(page, "save", { status: "success" })
    await page.waitForTimeout(100)
    expect(await formState(page)).toMatchObject({ status: "idle", baseline: { value: "" } })
    expect(await log(page)).toEqual(["saved:false"])
  })

  test("a save that finishes after reset to another record, or after unmount, is ignored", async ({ page }) => {
    await page.getByTestId("s-value").fill("x")
    await page.getByTestId("s-save").click()
    await waitCount(page, "save", 1)
    await page.getByTestId("s-reset").click()
    await resolve(page, "save", { status: "success" })
    await page.waitForTimeout(100)
    expect(await formState(page)).toMatchObject({ status: "idle", values: { value: "別のレコード" }, baseline: { value: "別のレコード" } })
    await page.getByTestId("s-value").fill("y")
    await page.getByTestId("s-save").click()
    await waitCount(page, "save", 1)
    await page.getByTestId("mount-toggle").click()
    await resolve(page, "save", { status: "success" })
    await page.waitForTimeout(100)
    expect(await log(page)).toEqual(["saved:false", "saved:false"])
  })

  test("an unexpected exception is an unknown result; clearing the message does not allow a resend", async ({ page }) => {
    await page.getByTestId("s-value").fill("x")
    await page.getByTestId("s-save").click()
    await waitCount(page, "save", 1)
    await reject(page, "save", "plain")
    await expect.poll(async () => (await formState(page)).status).toBe("unknown")
    expect((await formState(page)).canSubmit).toBe(false)
    await page.getByTestId("s-clear-error").click()
    expect(await formState(page)).toMatchObject({ status: "unknown", canSubmit: false })
    await page.getByTestId("s-save").click()
    await page.waitForTimeout(100)
    expect(await count(page, "save")).toBe(0)
    await page.getByTestId("s-not-saved").click()
    expect(await formState(page)).toMatchObject({ status: "idle", canSubmit: true })
  })

  test("hidden fields are not saved into the baseline; re-showing them keeps the change unsaved", async ({ page }) => {
    await page.getByTestId("s-toggle-hidden").click()
    await page.getByTestId("s-hidden").fill("新しい値")
    await page.getByTestId("s-toggle-hidden").click()
    await page.getByTestId("s-value").fill("x")
    await page.getByTestId("s-save").click()
    await waitCount(page, "save", 1)
    await resolve(page, "save", { status: "success" })
    await expect.poll(async () => (await formState(page)).status).toBe("succeeded")
    expect((await formState(page)).baseline).toMatchObject({ value: "x", hidden: "前の値" })
    expect((await formState(page)).dirty).toBe(false)
    await page.getByTestId("s-toggle-hidden").click()
    expect((await formState(page)).dirty).toBe(true)
  })

  test("resolveUnknown saved: only the submitted fields become the baseline; a hidden field keeps its old baseline", async ({ page }) => {
    await page.getByTestId("s-toggle-hidden").click()
    await page.getByTestId("s-hidden").fill("新しい値")
    await page.getByTestId("s-toggle-hidden").click()
    await page.getByTestId("s-value").fill("x")
    await page.getByTestId("s-save").click()
    await waitCount(page, "save", 1)
    await reject(page, "save", "plain")
    await expect.poll(async () => (await formState(page)).status).toBe("unknown")
    await page.getByTestId("s-was-saved").click()
    await expect.poll(async () => (await formState(page)).status).toBe("succeeded")
    expect((await formState(page)).baseline).toMatchObject({ value: "x", hidden: "前の値" })
    expect((await formState(page)).dirty).toBe(false)
    await page.getByTestId("s-toggle-hidden").click()
    expect((await formState(page)).dirty).toBe(true)
  })

  test("input during saving is reported (changedWhileSaving) and stays unsaved", async ({ page }) => {
    await page.getByTestId("s-value").fill("x")
    await page.getByTestId("s-save").click()
    await waitCount(page, "save", 1)
    await page.getByTestId("s-value").fill("xy")
    await resolve(page, "save", { status: "success" })
    await expect.poll(() => log(page)).toContain("success:true")
    expect(await formState(page)).toMatchObject({ dirty: true, baseline: { value: "x" } })
  })

  test("instant save: an unknown result keeps the value, blocks changes, and is resolved by checking the server", async ({ page }) => {
    await page.getByTestId("i-toggle").click()
    await waitCount(page, "instant", 1)
    await reject(page, "instant", "unknown")
    await expect.poll(async () => (await state<{ status: string }>(page, "instant-state")).status).toBe("unknown")
    expect(await state(page, "instant-state")).toMatchObject({ value: true })
    await page.getByTestId("i-toggle").click()
    expect(await count(page, "instant")).toBe(0)
    await page.getByTestId("i-check").click()
    await waitCount(page, "verify", 1)
    await resolve(page, "verify", false)
    await expect.poll(() => state(page, "instant-state")).toMatchObject({ value: false, status: "idle" })
  })

  test("instant save: a new server value (refetch) resolves the unknown state", async ({ page }) => {
    await page.getByTestId("i-toggle").click()
    await waitCount(page, "instant", 1)
    await reject(page, "instant", "unknown")
    await expect.poll(async () => (await state<{ status: string }>(page, "instant-state")).status).toBe("unknown")
    await page.getByTestId("i-server-change").click()
    await expect.poll(() => state(page, "instant-state")).toMatchObject({ value: true, status: "idle" })
    await page.getByTestId("i-toggle").click()
    await waitCount(page, "instant", 1)
  })

  test("instant save: a result after a scope change is ignored; a failure reverts", async ({ page }) => {
    await page.getByTestId("i-toggle").click()
    await waitCount(page, "instant", 1)
    await page.getByTestId("scope-toggle").click()
    await resolve(page, "instant", undefined)
    await page.waitForTimeout(100)
    expect(await state(page, "instant-state")).toMatchObject({ value: false, status: "idle" })
    await page.getByTestId("i-toggle").click()
    await waitCount(page, "instant", 1)
    await reject(page, "instant", "failed")
    await expect.poll(() => state(page, "instant-state")).toMatchObject({ value: false, status: "failed" })
  })

  test("autosave: an unknown result does not save again automatically; retry is explicit", async ({ page }) => {
    await page.getByTestId("a-text").fill("a")
    await waitCount(page, "autosave", 1)
    await reject(page, "autosave", "plain")
    await expect.poll(async () => (await state<{ status: string }>(page, "autosave-state")).status).toBe("unknown")
    await page.getByTestId("a-text").fill("ab")
    await page.waitForTimeout(300)
    expect(await count(page, "autosave")).toBe(0)
    await page.getByTestId("a-retry").click()
    await waitCount(page, "autosave", 1)
    await resolve(page, "autosave", undefined)
    await expect.poll(async () => (await state<{ status: string }>(page, "autosave-state")).status).toBe("saved")
  })

  test("autosave: a save finishing after a scope change does not change the new scope", async ({ page }) => {
    await page.getByTestId("a-text").fill("a")
    await waitCount(page, "autosave", 1)
    await page.getByTestId("scope-toggle").click()
    await reject(page, "autosave", "failed")
    await page.waitForTimeout(100)
    expect(await state(page, "autosave-state")).toMatchObject({ status: "saved" })
  })

  test("undo: two hook instances do not share toast ids; each undo uses its own fixed target", async ({ page }) => {
    await page.getByTestId("u-first").click()
    await page.getByTestId("u-second").click()
    const toasts = page.locator("[data-slot=toast]")
    await expect(toasts.filter({ hasText: "操作1を実行しました" })).toBeVisible()
    await expect(toasts.filter({ hasText: "操作2を実行しました" })).toBeVisible()
    await toasts.filter({ hasText: "操作1を実行しました" }).getByRole("button", { name: "元に戻す" }).click()
    await waitCount(page, "undo", 1)
    await resolve(page, "undo", undefined)
    await expect.poll(() => state(page, "undo-state")).toEqual(["操作1@A"])
    await expect(toasts.filter({ hasText: "操作2を実行しました" })).toBeVisible()
  })

  test("undo: after a scope change, the old toast is closed and its undo is not offered", async ({ page }) => {
    await page.getByTestId("u-first").click()
    const toast = page.locator("[data-slot=toast]", { hasText: "操作1を実行しました" })
    await expect(toast).toBeVisible()
    await page.getByTestId("scope-toggle").click()
    await expect(toast).toHaveCount(0)
    await expect(page.locator("[data-slot=toast]").getByRole("button", { name: "元に戻す" })).toHaveCount(0)
  })

  test("undo: a failed undo can be retried from the toast within the window; an unknown undo is not offered again", async ({ page }) => {
    const toasts = page.locator("[data-slot=toast]")
    await page.getByTestId("u-first").click()
    await toasts.filter({ hasText: "操作1を実行しました" }).getByRole("button", { name: "元に戻す" }).click()
    await waitCount(page, "undo", 1)
    await reject(page, "undo", "failed")
    const failed = toasts.filter({ hasText: "元に戻せませんでした" })
    await expect(failed).toBeVisible()
    // 重要度の高い通知（destructive）は、フォーカスするまで aria-hidden になる（Base UI。読み上げは別の alert で行う）。文字で探す
    await failed.locator("button", { hasText: "もう一度元に戻す" }).click()
    await waitCount(page, "undo", 1)
    await resolve(page, "undo", undefined)
    await expect.poll(() => state(page, "undo-state")).toEqual(["操作1@A"])

    await page.getByTestId("u-second").click()
    await toasts.filter({ hasText: "操作2を実行しました" }).getByRole("button", { name: "元に戻す" }).click()
    await waitCount(page, "undo", 1)
    await reject(page, "undo", "unknown")
    const unknown = toasts.filter({ hasText: "元に戻せたかを確かめられていません" })
    await expect(unknown).toBeVisible()
    await expect(unknown.getByRole("button", { name: /元に戻す/ })).toHaveCount(0)
    expect(await state(page, "undo-state")).toEqual(["操作1@A"])
  })

  test("confirm dialog: a result of the previous target does not close the dialog reopened for another target", async ({ page }) => {
    await page.getByTestId("c-open-x").click()
    await page.getByTestId("c-dialog").getByRole("button", { name: "Xを削除" }).click()
    await waitCount(page, "confirm", 1)
    // 製品が閉じて、別の対象で開き直す（モーダルの背後のボタンのため、DOM から押す）
    await page.evaluate(() => (document.querySelector("[data-testid=c-close]") as HTMLButtonElement).click())
    await page.evaluate(() => (document.querySelector("[data-testid=c-open-y]") as HTMLButtonElement).click())
    await expect(page.getByTestId("c-dialog")).toContainText("Yを削除しますか？")
    await resolve(page, "confirm", undefined)
    await page.waitForTimeout(150)
    await expect(page.getByTestId("c-dialog")).toBeVisible()
    await expect(page.getByTestId("c-dialog").getByRole("button", { name: "Yを削除" })).toBeEnabled()
  })
})

test.describe("confirm dialog unknown result", { tag: "@webkit" }, () => {
  test.beforeEach(async ({ page }) => open(page, "scope"))

  test("an unknown result shows only Close and stays unknown when reopened for the same target", async ({ page }) => {
    const dialog = page.getByTestId("c-dialog")
    await page.getByTestId("c-open-x").click()
    await dialog.getByRole("button", { name: "Xを削除" }).click()
    await waitCount(page, "confirm", 1)
    await resolve(page, "confirm", { unknown: "削除されたかを確かめられていません" })
    await expect(dialog).toContainText("削除されたかを確かめられていません")
    await expect(dialog.getByRole("button", { name: "Xを削除" })).toHaveCount(0)
    await dialog.getByRole("button", { name: "閉じる" }).click()
    await expect(dialog).toBeHidden()
    // 同じ対象で開き直しても、実行のボタンを示さない
    await page.getByTestId("c-open-x").click()
    await expect(dialog).toContainText("削除されたかを確かめられていません")
    await expect(dialog.getByRole("button", { name: "Xを削除" })).toHaveCount(0)
    await dialog.getByRole("button", { name: "閉じる" }).click()
    await expect(dialog).toBeHidden()
    // 別の対象では実行できる
    await page.getByTestId("c-open-y").click()
    await expect(dialog.getByRole("button", { name: "Yを削除" })).toBeEnabled()
    expect(await state(page, "confirm-state")).toEqual([])
  })
})

// ------------------------------------------------------------------ 未保存の変更と移動
type UnsavedOut = { log: string[]; page: string; hasUnsaved: boolean }
const unsaved = (page: Page) => state<UnsavedOut>(page, "unsaved-log")

test.describe("unsaved changes and navigation", { tag: "@webkit" }, () => {
  test.beforeEach(async ({ page }) => open(page, "unsaved"))

  test("save and move: a failure in the second unit stays and keeps the input", async ({ page }) => {
    await page.getByTestId("u-one").fill("1")
    await page.getByTestId("u-two").fill("2")
    await page.getByTestId("go").click()
    const dialog = page.getByRole("alertdialog")
    await dialog.getByRole("button", { name: "保存して移動" }).click()
    await waitCount(page, "save-one", 1)
    await resolve(page, "save-one", null)
    await waitCount(page, "save-two", 1)
    await resolve(page, "save-two", { status: "failed", formError: "保存できませんでした" })
    await expect(dialog).toBeHidden()
    expect(await unsaved(page)).toMatchObject({ page: "a", log: ["cancelled"], hasUnsaved: true })
    await expect(page.getByTestId("u-two")).toHaveValue("2")
  })

  test("save and move: new input during the save asks again instead of moving", async ({ page }) => {
    await page.getByTestId("u-one").fill("1")
    await page.getByTestId("go").click()
    const dialog = page.getByRole("alertdialog")
    await dialog.getByRole("button", { name: "保存して移動" }).click()
    await waitCount(page, "save-one", 1)
    await page.getByTestId("u-one").fill("12", { force: true })
    await resolve(page, "save-one", null)
    await expect(dialog.getByRole("button", { name: "変更を破棄" })).toBeEnabled()
    expect((await unsaved(page)).page).toBe("a")
  })

  test("save and move: a new navigation request during the save replaces the destination", async ({ page }) => {
    await page.getByTestId("u-one").fill("1")
    await page.getByTestId("go").click()
    const dialog = page.getByRole("alertdialog")
    await dialog.getByRole("button", { name: "保存して移動" }).click()
    await waitCount(page, "save-one", 1)
    // 保存の間に、別の場所への移動を求める（モーダルの背後のボタンのため、DOM から押す）
    await page.evaluate(() => (document.querySelector("[data-testid=go-c]") as HTMLButtonElement).click())
    await resolve(page, "save-one", null)
    await expect.poll(async () => (await unsaved(page)).page).toBe("c")
    expect((await unsaved(page)).log).toEqual(["cancelled", "moved-c"])
  })

  test("after an allowed navigation fails, later changes are protected again", async ({ page }) => {
    await page.getByTestId("fail-navigation").click()
    await page.getByTestId("u-one").fill("1")
    await page.getByTestId("go").click()
    await page.getByRole("alertdialog").getByRole("button", { name: "変更を破棄" }).click()
    await expect.poll(async () => (await unsaved(page)).log).toEqual(["navigation-failed"])
    await page.getByTestId("u-one").fill("また入力")
    await page.getByTestId("go").click()
    await expect(page.getByRole("alertdialog")).toBeVisible()
  })
})

test.describe("unsaved changes: a unit without onDiscard", { tag: "@webkit" }, () => {
  test.beforeEach(async ({ page }) => open(page, "unsaved"))

  // 破棄の処理がない単位は、破棄の後も dirty のまま残る。移動が起きなかった場合に、確認を省く印（released）が残らないこと
  test("after discard and a failed navigation, the unchanged input is protected again", async ({ page }) => {
    await page.getByTestId("fail-navigation").click()
    await page.getByTestId("u-three").fill("3")
    await page.getByTestId("go").click()
    await page.getByRole("alertdialog").getByRole("button", { name: "変更を破棄" }).click()
    await expect.poll(async () => (await unsaved(page)).log).toEqual(["navigation-failed"])
    await expect(page.getByTestId("u-three")).toHaveValue("3")
    await page.getByTestId("go").click()
    await expect(page.getByRole("alertdialog")).toBeVisible()
  })
})

// ------------------------------------------------------------------ 関数（Node で確かめる）
test.describe("pure helpers v0.1", () => {
  test("escapeCsvCell: leading spaces and control characters, full-width formula characters, raw mode", () => {
    expect(escapeCsvCell(" =1+1")).toBe("' =1+1")
    expect(escapeCsvCell("\u0001@cmd")).toBe("'\u0001@cmd")
    expect(escapeCsvCell("＝SUM(A1)")).toBe("'＝SUM(A1)")
    expect(escapeCsvCell("＋81")).toBe("'＋81")
    expect(escapeCsvCell("\n=x")).toBe("\"'\n=x\"")
    expect(escapeCsvCell("a=b")).toBe("a=b")
    expect(escapeCsvCell(-5)).toBe("-5")
    expect(escapeCsvCell("=SUM(A1)", { mode: "raw" })).toBe("=SUM(A1)")
    expect(escapeCsvCell('x,"y"', { mode: "raw" })).toBe('"x,""y"""')
  })

  test("reconcileImportResult: invalid counts, mismatched totals, duplicate, unexpected and missing rows", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "3"]) {
      const r = reconcileImportResult({ total: 3 }, { created: bad, updated: 0, skipped: 0, failed: 0 })
      expect(r.integrity.invalidCounts).toContain("created")
      expect(r.integrity.complete).toBe(false)
      expect(importOutcome(r.result)).toBe("unknown")
    }
    const short = reconcileImportResult({ total: 5 }, { created: 2, updated: 0, skipped: 0, failed: 1 })
    expect(short.result.unknown).toBe(2)
    const over = reconcileImportResult({ total: 2 }, { created: 3, updated: 0, skipped: 0, failed: 0 })
    expect(over.integrity.totalMismatch).toBe(true)
    const rows = reconcileImportResult(
      { total: 3, rows: [2, 3, 4] },
      { created: 3, rows: [{ row: 2, outcome: "created" }, { row: 2, outcome: "failed" }, { row: 3, outcome: "created" }, { row: 99, outcome: "created" }] }
    )
    expect(rows.integrity).toMatchObject({ duplicateRows: [2], unexpectedRows: [99], missingRows: [4], countsDisagree: true, complete: false })
    expect(rows.result).toEqual({ created: 1, updated: 0, skipped: 0, failed: 0, unknown: 2, total: 3 })
    expect(importOutcome({ created: 1, updated: 0, skipped: 0, failed: 0, unknown: 0, total: Number.NaN })).toBe("unknown")
  })

  test("sanitizeMapping: unknown columns are dropped, unknown field ids become skip", () => {
    const columns = createImportColumns(["会社名", "電話"], [["a", "b"]])
    const r = sanitizeMapping({ "col-0": "company", "col-1": "nope", "col-9": "phone" }, columns, [{ id: "company", label: "会社名" }])
    expect(r.mapping).toEqual({ "col-0": "company", "col-1": null })
    expect(r.unknownColumns).toEqual(["col-9"])
    expect(r.unknownFields).toEqual(["nope"])
  })
})

// ------------------------------------------------------------------ Data Browsing との組み合わせ（検証画面）
type Server = NonNullable<Window["__fdFormsServer"]>
const server = <T,>(page: Page, fn: (s: Server) => T) =>
  page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdFormsServer), fn.toString()) as Promise<T>
async function openApp(page: Page, query: string) {
  await page.goto(`/#/forms-app?${query}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await server(page, (s) => Object.assign(s.latency, { save: 150, check: 120, autofill: 150, action: 120, import: 240, draft: 60, list: 60 }))
}
/** サーバーが応答を返し、画面がその応答を処理した後まで待つ（固定の時間に頼らない） */
// 模擬のサーバー（window.__fdFormsServer）の保存の応答の保留と解放。release は、応答を受け取った処理と描画が終わってから戻る
const holdSave = (page: Page, on = true) => page.evaluate((v) => void (window.__fdFormsServer!.hold.save = v), on)
const heldSaves = (page: Page, key: string) => page.evaluate((k) => window.__fdFormsServer!.held.filter((h) => h.kind === "save" && h.key === k).length, key)
const releaseHeld = (page: Page, filter: HeldFilter) => page.evaluate((f) => window.__fdFormsServer!.release(f), filter)
async function waitSettled(page: Page, kind: string) {
  await expect.poll(() => page.evaluate((k) => window.__fdFormsServer!.settled.filter((x) => x === k).length, kind)).toBeGreaterThan(0)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}
const listRows = (page: Page) => page.getByTestId("forms-customers").locator("tbody tr[data-row-id]")

test.describe("Data Browsing integration", { tag: "@webkit" }, () => {
  test("edit from page 2 and cancel: the list restores the page and the focus on the row", async ({ page }) => {
    await openApp(page, "page=customers")
    await expect(listRows(page)).toHaveCount(5)
    await page.getByRole("navigation", { name: "ページ送り" }).getByRole("button", { name: "2ページ目" }).click()
    await expect(listRows(page)).toHaveCount(3)
    await page.getByTestId("row-actions-cu-7").click()
    await page.getByRole("menuitem", { name: "編集" }).click()
    await expect(page.getByTestId("forms-customer-edit")).toBeVisible()
    await page.locator("#edit-phone").fill("022-000-0000")
    await page.getByRole("button", { name: "キャンセル" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "変更を破棄" }).click()
    await expect(listRows(page)).toHaveCount(3)
    await expect(listRows(page).filter({ hasText: "C-0007" }).locator("[data-row-focus]")).toBeFocused()
  })

  test("opening the list again from the sidebar does not restore the previous page", async ({ page, isMobile }) => {
    await openApp(page, "page=customers")
    await page.getByRole("navigation", { name: "ページ送り" }).getByRole("button", { name: "2ページ目" }).click()
    await expect(listRows(page)).toHaveCount(3)
    await page.getByTestId("row-actions-cu-7").click()
    await page.getByRole("menuitem", { name: "編集" }).click()
    await expect(page.getByTestId("forms-customer-edit")).toBeVisible()
    if (isMobile) await page.getByRole("button", { name: "メニュー" }).first().click()
    await page.locator("[data-slot=sidebar]").getByRole("link", { name: "顧客", exact: true }).click()
    await expect(page.getByTestId("forms-customers")).toBeVisible()
    await expect(listRows(page)).toHaveCount(5)
  })

  test("detail opened from a search result and browser back: the search is restored", async ({ page }) => {
    await openApp(page, "page=customers")
    await page.getByTestId("customers-search").fill("中村")
    await expect(listRows(page)).toHaveCount(1)
    await listRows(page).first().locator("[data-row-focus]").click()
    await expect(page.getByTestId("forms-customer")).toBeVisible()
    await page.evaluate(() => history.back())
    await expect(page.getByTestId("customers-search")).toHaveValue("中村")
    await expect(listRows(page)).toHaveCount(1)
  })

  test("export from the selection bar: an emptied selection is not widened to the search results", async ({ page }) => {
    await openApp(page, "page=customers")
    await listRows(page).first().getByRole("checkbox").click()
    await page.getByTestId("customers-export-selected").click()
    await expect(page.getByTestId("export-scope")).toHaveText("選んだ行（1件）")
    await page.evaluate(() => window.__fdFormsClearSelection?.())
    await expect(page.getByTestId("export-no-selection")).toBeVisible()
    await expect(page.getByTestId("export-run")).toHaveAttribute("disabled", "")
  })

  test("direct download for a clear, low-risk export; sensitive columns ask first", async ({ page, isMobile }) => {
    test.skip(isMobile, "ダウンロードはデスクトップで確かめる")
    await openApp(page, "page=customers")
    await page.getByTestId("customers-export").click()
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("customers-export-direct").click()])
    expect(download.suggestedFilename()).toMatch(/^顧客_検索結果_\d{8}-\d{4}\.csv$/)
    await page.getByTestId("customers-export").click()
    await page.getByRole("menuitem", { name: "項目を選んでエクスポート…" }).click()
    await page.getByTestId("export-columns").getByRole("checkbox", { name: "電話番号" }).click()
    await page.getByTestId("export-run").click()
    const confirm = page.getByTestId("export-sensitive-confirm")
    await expect(confirm).toContainText("個人情報を含む")
    const [download2] = await Promise.all([page.waitForEvent("download"), confirm.getByRole("button", { name: "ダウンロード" }).click()])
    const text = await (await download2.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"))
    expect(text.split("\r\n")[0]).toContain("電話番号")
  })

  test("canOperate false (refresh failed): row operations and export are disabled", async ({ page }) => {
    await openApp(page, "page=customers")
    await server(page, (s) => (s.listMode = "fail"))
    await page.getByTestId("row-actions-cu-1").click()
    await page.getByRole("menuitem", { name: "アーカイブ" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "再取得するまで、変更の操作はできません" })).toBeVisible()
    await expect(page.getByTestId("row-actions-cu-2")).toBeDisabled()
    await expect(page.getByTestId("customers-export")).toBeDisabled()
  })

  test("workspace scope: the duplicate check of the same code is repeated in the new workspace", async ({ page }) => {
    await openApp(page, "page=customer-new")
    await page.locator("#new-code").fill("C-0001")
    await page.locator("#new-code").blur()
    await expect(page.getByTestId("new-code-error")).toContainText("登録済み")
    await page.locator("[data-testid=forms-verify] summary").click()
    await page.getByTestId("external-ws-kyushu").click()
    await expect(page.getByTestId("forms-main")).toHaveAttribute("data-ws", "kyushu")
    // 前のワークスペースで入力した値を、新しいワークスペースのフォームに引き継がない（9.4）。前の検証の結果も示さない
    await expect(page.locator("#new-code")).toHaveValue("")
    await expect(page.getByTestId("new-code-error")).toHaveCount(0)
    // 同じコードを入れ直すと、新しいワークスペースで重複を確かめ直す
    await page.locator("#new-code").fill("C-0001")
    await page.locator("#new-code").blur()
    await expect(page.getByTestId("new-code-status")).toHaveText("このコードは使えます")
  })

  test("an old save does not navigate or notify after the workspace changed", async ({ page }) => {
    await openApp(page, "page=customer-new")
    const f = (n: string) => page.locator(`#new-${n}`)
    await f("company").fill("株式会社テスト")
    await f("lastName").fill("山田")
    await f("firstName").fill("太郎")
    await f("code").fill("C-0900")
    await f("email").fill("yamada@example.com")
    await page.getByTestId("new-plan").click()
    await page.getByRole("listbox").getByRole("option", { name: /^ライト/ }).click()
    await f("start").fill("2026-12-01")
    await expect(page.getByTestId("new-code-status")).toHaveText("このコードは使えます")
    await holdSave(page)
    await page.getByTestId("new-submit").click()
    // 保存中（応答を保留している間）に、ワークスペースを切り替える
    await expect.poll(() => heldSaves(page, "create-customer")).toBe(1)
    await page.locator("[data-testid=forms-verify] summary").click()
    await page.getByTestId("external-ws-kyushu").click()
    await expect(page.getByTestId("forms-main")).toHaveAttribute("data-ws", "kyushu")
    // 切り替えの後で、本社への登録の応答（成功）を返す
    await holdSave(page, false)
    expect(await releaseHeld(page, { kind: "save", key: "create-customer" })).toBe(1)
    await waitSettled(page, "create-customer")
    await expect(page.getByTestId("forms-customer-new")).toBeVisible()
    await expect(page.locator("[data-slot=toast]", { hasText: "を登録しました" })).toHaveCount(0)
  })

  test("settings: a save finishing after the workspace changed does not notify or change the new workspace's form", async ({ page }) => {
    await openApp(page, "page=settings")
    await holdSave(page)
    await page.locator("#settings-company-name").fill("保存中に切り替え")
    await page.getByTestId("settings-company-save").click()
    // 保存中（応答を保留している間）に、ワークスペースを切り替える
    await expect.poll(() => heldSaves(page, "settings-company")).toBe(1)
    await page.locator("[data-testid=forms-verify] summary").click()
    await page.getByTestId("external-ws-kyushu").click()
    await expect(page.getByTestId("forms-main")).toHaveAttribute("data-ws", "kyushu")
    // 切り替えの後で、本社の設定の保存の応答（成功）を返す
    await holdSave(page, false)
    expect(await releaseHeld(page, { kind: "save", key: "settings-company" })).toBe(1)
    await waitSettled(page, "settings-company")
    await expect(page.locator("[data-slot=toast]", { hasText: "会社の情報を保存しました" })).toHaveCount(0)
    await expect(page.locator("#settings-company-name")).toHaveValue("株式会社フロー")
    // 保存は元のワークスペース（本社）に反映され、戻るとその値から始まる
    await page.getByTestId("external-ws-hq").click()
    await expect(page.locator("#settings-company-name")).toHaveValue("保存中に切り替え")
    await expect(page.getByTestId("settings-company")).not.toHaveAttribute("data-dirty")
  })
})

// ------------------------------------------------------------------ beforeunload（ブラウザの実際の確認）
test.describe("beforeunload dialog", { tag: "@webkit" }, () => {
  test("closing the page with unsaved changes shows the browser's own confirmation; without changes it does not", async ({ page, browserName }) => {
    await openApp(page, "page=settings")
    const dialogs: string[] = []
    page.on("dialog", (d) => {
      dialogs.push(d.type())
      void d.dismiss()
    })
    // 利用者の操作（入力）で変更を作る。ブラウザは、ページを操作していない場合に確認を出さないことがある
    await page.locator("#settings-company-name").click()
    await page.keyboard.type("（変更）")
    await page.close({ runBeforeUnload: true })
    await expect.poll(() => dialogs, { timeout: 5000 }).toContain("beforeunload")
    // dismiss したため、ページは閉じていない
    expect(page.isClosed(), browserName).toBe(false)
  })

  test("without unsaved changes, closing the page shows no confirmation", async ({ context }) => {
    const other = await context.newPage()
    await openApp(other, "page=settings")
    await other.locator("#settings-company-name").click()
    const dialogs: string[] = []
    other.on("dialog", (d) => {
      dialogs.push(d.type())
      void d.dismiss()
    })
    await other.close({ runBeforeUnload: true })
    await expect.poll(() => other.isClosed()).toBe(true)
    expect(dialogs).toEqual([])
  })
})
