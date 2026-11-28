import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"
import { hold, listReady, openApp, pi, release, requests, row, setConfig, signIn, users } from "./patterns-integration-helpers"

// Patterns の横断の検証画面：権限の再確認と権限の変更の間の、保護された内容、入力、実行中の処理（独立した Review A の指摘）。
// 各テストは、指摘の修正の前の画面で失敗することを確かめてある（報告を参照）。
collectPageErrors(test)

const all = ["view", "edit", "delete", "export"]
const editForm = (page: Page) => page.getByTestId("edit-form")
const memo = (page: Page) => editForm(page).getByLabel("社内のメモ")

/** 権限の再確認を始め、確認の応答を保留する（権限は変えない） */
async function holdRecheck(page: Page, permissions = all) {
  await hold(page, "access")
  await pi(page, "setPermissions", users.sato.id, "hq", permissions)
  await expect(page.getByTestId("access-pending").first()).toBeVisible()
}

async function finishRecheck(page: Page) {
  await hold(page, "access", false)
  await release(page, { kind: "access" })
  await expect(page.getByTestId("access-pending")).toHaveCount(0)
}

test.describe("Patterns integration: authorization re-check and permission changes", () => {
  test("S21 (A-1) during the re-check, the detail Sheet, the page heading and the breadcrumb show no customer data @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await row(page, "株式会社アオバ商事").getByRole("button", { name: "株式会社アオバ商事", exact: true }).click()
    const sheet = page.getByTestId("customer-sheet")
    await expect(sheet.getByText("contact-c01@hq.example.com")).toBeVisible()
    await holdRecheck(page, [])
    await expect(page.getByText("contact-c01@hq.example.com")).toHaveCount(0)
    await expect(page.getByTestId("sheet-mrr")).toHaveCount(0)
    await expect(page.locator("[data-slot=sheet-content]")).toHaveCount(0)
  })

  test("S21 (A-1) during the re-check, the detail page and the edit page headings do not show the customer's name", async ({ page }) => {
    await openApp(page, { route: "page=customer&id=c01" })
    await expect(page.getByRole("heading", { name: "株式会社アオバ商事", level: 1 })).toBeVisible()
    await holdRecheck(page)
    await expect(page.getByRole("heading", { name: "顧客", level: 1 })).toBeVisible()
    await expect(page.getByTestId("pi-main")).not.toContainText("株式会社アオバ商事")
    await expect(page.getByTestId("pi-main")).not.toContainText("スタンダード")
    await finishRecheck(page)
    await page.getByTestId("detail-edit").click()
    await expect(page.getByRole("heading", { name: "株式会社アオバ商事を編集", level: 1 })).toBeVisible()
    await holdRecheck(page)
    await expect(page.getByRole("heading", { name: "顧客を編集", level: 1 })).toBeVisible()
    await expect(page.getByTestId("pi-main")).not.toContainText("株式会社アオバ商事")
  })

  test("S21 (A-2) a re-check with unchanged permissions keeps the input in progress @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await memo(page).fill("再確認の前の入力")
    await holdRecheck(page)
    await expect(editForm(page)).toHaveCount(0)
    await finishRecheck(page)
    await expect(memo(page)).toHaveValue("再確認の前の入力")
    await expect(editForm(page)).toHaveAttribute("data-dirty", "true")
  })

  test("S22 (A-2) an unrelated permission change (export removed) keeps the input in progress", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await memo(page).fill("エクスポートの権限の変更の前の入力")
    await pi(page, "setPermissions", users.sato.id, "hq", ["view", "edit", "delete"])
    await expect(page.getByTestId("access-pending")).toHaveCount(0)
    await expect(memo(page)).toHaveValue("エクスポートの権限の変更の前の入力")
    await expect(editForm(page)).toHaveAttribute("data-dirty", "true")
  })

  test("S22 (A-3) a save in flight during a re-check completes in the same form and returns to the detail", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await memo(page).fill("再確認の間に保存したメモ")
    await hold(page, "save")
    await page.getByTestId("edit-submit").click()
    await expect.poll(async () => (await requests(page, "save")).length).toBe(1)
    await holdRecheck(page)
    await finishRecheck(page)
    await release(page, { kind: "save" })
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "株式会社イズミ製作所を保存しました" })).toBeVisible()
    await expect(page).toHaveURL(/page=customer&id=c02/)
    await expect(page.getByTestId("detail-note")).toHaveText("再確認の間に保存したメモ")
  })

  test("S22 (A-3) a form reopened after it was removed during a save requires a lookup before saving", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await memo(page).fill("外れたフォームの保存")
    await hold(page, "save")
    await page.getByTestId("edit-submit").click()
    await expect.poll(async () => (await requests(page, "save")).length).toBe(1)
    // 編集の権限を失って画面が外れ、権限が戻って開き直す
    await pi(page, "setPermissions", users.sato.id, "hq", ["view"])
    await expect(page.getByRole("heading", { name: "このページを表示する権限がありません" })).toBeVisible()
    await pi(page, "setPermissions", users.sato.id, "hq", all)
    const orphan = page.getByTestId("edit-orphan")
    await expect(orphan).toBeVisible()
    await expect(page.getByTestId("edit-submit")).toHaveAttribute("aria-disabled", "true")
    await release(page, { kind: "save" })
    await orphan.getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "保存されていたことを確かめました" })).toBeVisible()
    await expect(orphan).toHaveCount(0)
    await expect(memo(page)).toHaveValue("外れたフォームの保存")
    await expect(editForm(page)).not.toHaveAttribute("data-dirty", "true")
    expect(await requests(page, "save")).toHaveLength(1)
  })

  test("S11 (A-4) a bulk run in progress survives an unrelated permission change and shows its result @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await setConfig(page, { bulkOutcomes: { c02: "unknown" } })
    for (const n of ["株式会社アオバ商事", "株式会社イズミ製作所"]) await row(page, n).getByRole("checkbox").check()
    await page.getByTestId("customers-pause-selected").click()
    await hold(page, "bulk")
    await page.getByTestId("pause-confirm").getByRole("button", { name: "2件を停止にする" }).click()
    await expect(page.locator("[data-slot=bulk-run-status]")).toBeVisible()
    await pi(page, "setPermissions", users.sato.id, "hq", ["view", "edit", "delete"])
    await expect(page.getByTestId("customers-export")).toHaveAttribute("aria-disabled", "true")
    await expect(page.locator("[data-slot=bulk-run-status]")).toBeVisible()
    await release(page, { kind: "bulk" })
    const result = page.locator("[data-slot=bulk-result]")
    await expect(result).toContainText("結果が不明1件")
  })

  test("S10 (A-5) saving again after a save that kept changes made while saving is not a conflict", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c01&from=detail" })
    await memo(page).fill("1 回目")
    await hold(page, "save")
    await page.getByTestId("edit-submit").click()
    await expect.poll(async () => (await requests(page, "save")).length).toBe(1)
    await memo(page).fill("1 回目の保存中に変えた内容")
    await hold(page, "save", false)
    await release(page, { kind: "save" })
    await expect(editForm(page)).toHaveAttribute("data-status", "succeeded")
    await expect(editForm(page)).toHaveAttribute("data-dirty", "true")
    await page.getByTestId("edit-submit").click()
    await expect(page).toHaveURL(/page=customer&id=c01/)
    await expect(page.getByTestId("detail-note")).toHaveText("1 回目の保存中に変えた内容")
  })

  test("S29 (A-5) saving again after an unknown save was confirmed as saved is not a conflict", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c01&from=detail" })
    await setConfig(page, { saveMode: "unknown" })
    await memo(page).fill("結果が不明の保存")
    await page.getByTestId("edit-submit").click()
    await page.getByTestId("edit-form-error").getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(editForm(page)).toHaveAttribute("data-status", "succeeded")
    await setConfig(page, { saveMode: "success" })
    await memo(page).fill("確認の後に変えた内容")
    await page.getByTestId("edit-submit").click()
    await expect(page).toHaveURL(/page=customer&id=c01/)
    await expect(page.getByTestId("detail-note")).toHaveText("確認の後に変えた内容")
  })

  test("S25 (A-6) after reauthentication, the input made while a save was in flight is restored, not only the submitted values", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await memo(page).fill("送った値")
    await hold(page, "save")
    await page.getByTestId("edit-submit").click()
    await expect.poll(async () => (await requests(page, "save")).length).toBe(1)
    await memo(page).fill("送った値と、その後の入力")
    await pi(page, "expireSession")
    await signIn(page)
    await expect(memo(page)).toHaveValue("送った値と、その後の入力")
    await expect(page.getByTestId("draft-restored")).toBeVisible()
    expect(await requests(page, "save")).toHaveLength(1)
  })

  test("S22 (A-12) a delete refused by the server for missing permission is shown as a failure, not as an unknown result", async ({ page }) => {
    await openApp(page, { route: "page=customer&id=c01" })
    await page.getByTestId("detail-delete").click()
    const dialog = page.getByTestId("delete-confirm")
    await expect(dialog).toBeVisible()
    // 画面に知らせずに、サーバーの権限だけを変える（画面の権限の情報は古いまま）
    await page.evaluate(() => {
      const c = (window as unknown as { __fdPi: { config: { permissions: Record<string, Record<string, string[]>> } } }).__fdPi.config
      c.permissions["u-sato"].hq = ["view", "edit", "export"]
    })
    await dialog.getByRole("button", { name: "顧客を削除" }).click()
    await expect(dialog.getByRole("alert")).toContainText("顧客を削除する権限がありません")
    await expect(dialog.getByRole("button", { name: "顧客を削除" })).toBeVisible()
    expect((await pi<{ id: string } | null>(page, "customer", "hq", "c01"))?.id).toBe("c01")
  })

  test("S24 (re-review 1a) the Undo toast with the customer's name closes during the re-check and its Undo does nothing @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customer&id=c01" })
    await page.getByTestId("detail-pause").click()
    const toast = page.locator("[data-slot=toast]").filter({ hasText: "株式会社アオバ商事を停止中にしました" })
    await expect(toast.getByRole("button", { name: "元に戻す" })).toBeVisible()
    const before = (await requests(page, "status")).length
    await holdRecheck(page)
    await expect(toast).toHaveCount(0)
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "株式会社アオバ商事" })).toHaveCount(0)
    const undone = await page.evaluate(() => (window as unknown as { __fdPi: { lastUndo: { undo: () => Promise<boolean> } } }).__fdPi.lastUndo.undo())
    expect(undone).toBe(false)
    expect(await requests(page, "status")).toHaveLength(before)
  })

  test("S22 (re-review 1b) a save response during the re-check shows no customer name and navigates only after the re-check", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await memo(page).fill("確認中に保存の応答が届く")
    await hold(page, "save")
    await page.getByTestId("edit-submit").click()
    await expect.poll(async () => (await requests(page, "save")).length).toBe(1)
    await holdRecheck(page)
    await release(page, { kind: "save" })
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "顧客を保存しました" })).toBeVisible()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "株式会社イズミ製作所" })).toHaveCount(0)
    await expect(page).toHaveURL(/page=customer-edit/)
    await finishRecheck(page)
    await expect(page).toHaveURL(/page=customer&id=c02/)
  })

  test("S24 (re-review N-4) losing the edit permission closes the Undo toast and its Undo sends nothing", async ({ page }) => {
    await openApp(page, { route: "page=customer&id=c01" })
    await page.getByTestId("detail-pause").click()
    const toast = page.locator("[data-slot=toast]").filter({ hasText: "株式会社アオバ商事を停止中にしました" })
    await expect(toast).toBeVisible()
    const before = (await requests(page, "status")).length
    await pi(page, "setPermissions", users.sato.id, "hq", ["view"])
    await expect(page.getByTestId("detail-edit")).toHaveAttribute("aria-disabled", "true")
    await expect(toast).toHaveCount(0)
    const undone = await page.evaluate(() => (window as unknown as { __fdPi: { lastUndo: { undo: () => Promise<boolean> } } }).__fdPi.lastUndo.undo())
    expect(undone).toBe(false)
    expect(await requests(page, "status")).toHaveLength(before)
  })

  test("S29 (re-review N-1) after a lookup finds the unknown save was not applied, the next save does not overwrite another user's change", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c01&from=detail" })
    await setConfig(page, { saveMode: "unknown", unknownApplied: false })
    await memo(page).fill("保存されていなかったメモ")
    await page.getByTestId("edit-submit").click()
    await expect(page.getByTestId("edit-form-error")).toContainText("保存されたかを確かめられていません")
    // 結果が不明の間に、ほかの利用者が同じ顧客を変更する
    await pi(page, "updateCustomer", "hq", "c01", { phone: "099-9999-9999" })
    await page.getByTestId("edit-form-error").getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(editForm(page)).toHaveAttribute("data-status", "idle")
    await setConfig(page, { saveMode: "success" })
    await page.getByTestId("edit-submit").click()
    await expect(page.getByTestId("edit-form-error")).toContainText("ほかの利用者がこの顧客を変更しました")
    expect((await pi<{ phone: string }>(page, "customer", "hq", "c01")).phone).toBe("099-9999-9999")
  })

  test("S22 (re-review N-2) confirming a removed form's save keeps the input typed in the reopened form", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await memo(page).fill("外れたフォームで送った値")
    await hold(page, "save")
    await page.getByTestId("edit-submit").click()
    await expect.poll(async () => (await requests(page, "save")).length).toBe(1)
    await pi(page, "setPermissions", users.sato.id, "hq", ["view"])
    await expect(page.getByRole("heading", { name: "このページを表示する権限がありません" })).toBeVisible()
    await pi(page, "setPermissions", users.sato.id, "hq", all)
    const orphan = page.getByTestId("edit-orphan")
    await expect(orphan).toBeVisible()
    await release(page, { kind: "save" })
    await editForm(page).getByLabel("電話番号").fill("03-1111-2222")
    await orphan.getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(orphan).toHaveCount(0)
    await expect(memo(page)).toHaveValue("外れたフォームで送った値")
    await expect(editForm(page).getByLabel("電話番号")).toHaveValue("03-1111-2222")
    await expect(editForm(page)).toHaveAttribute("data-dirty", "true")
  })

  test("S21 (re-review A-2) after the re-check, focus returns to the input that had it", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await memo(page).fill("フォーカスを戻す")
    await expect(memo(page)).toBeFocused()
    await holdRecheck(page)
    await finishRecheck(page)
    await expect(memo(page)).toBeFocused()
  })

  test("S25 (re-review N-3) a save held across a new session is not applied by the server with the new session", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await memo(page).fill("前のセッションの保存")
    await hold(page, "save")
    await page.getByTestId("edit-submit").click()
    await expect.poll(async () => (await requests(page, "save")).length).toBe(1)
    await pi(page, "expireSession")
    await signIn(page)
    await expect(memo(page)).toHaveValue("前のセッションの保存")
    await release(page, { kind: "save" })
    expect((await pi<{ note: string }>(page, "customer", "hq", "c02")).note).toBe("")
  })
})
