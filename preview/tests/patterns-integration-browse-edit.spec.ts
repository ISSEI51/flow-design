import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"
import { hold, listReady, openApp, pi, release, requests, row, setConfig, sidebarGo } from "./patterns-integration-helpers"

// Patterns の横断の検証画面：一覧・検索・詳細・編集・復元・未保存の変更（Patterns Integration Review 15 章の 2〜10）。
// 各テストは新しいページで、ログインから始める（前のテストの状態に依存しない）。
collectPageErrors(test)

const editForm = (page: Page) => page.getByTestId("edit-form")
const unsavedDialog = (page: Page) => page.locator("[data-slot=unsaved-changes-dialog]")

/** 一覧の行から Sheet を開き、編集の画面へ移る */
async function editFromList(page: Page, name: string) {
  await row(page, name).getByRole("button", { name, exact: true }).click()
  const sheet = page.getByTestId("customer-sheet")
  await expect(sheet).toBeVisible()
  await sheet.getByRole("button", { name: "編集" }).click()
  await expect(editForm(page)).toBeVisible()
}

/** 編集の画面で、社内のメモに入力する（保存していない変更を作る） */
async function makeDirty(page: Page, text = "未保存のメモ") {
  await editForm(page).getByLabel("社内のメモ").fill(text)
  await expect(editForm(page)).toHaveAttribute("data-dirty", "true")
}

test.describe("Patterns integration: browse and edit", () => {
  test("S02 App Shell: the Sidebar opens the customer list, marks the current page and moves focus to the heading @webkit", async ({ page }) => {
    await openApp(page)
    await sidebarGo(page, "顧客")
    await expect(page).toHaveURL(/page=customers/)
    const heading = page.getByRole("heading", { name: "顧客", level: 1 })
    await expect(heading).toBeFocused()
    await listReady(page)
    // モバイルの Sidebar（Sheet）は移動の後に閉じる。開き直して現在地を確かめる
    const mobile = await page.evaluate(() => window.innerWidth < 768)
    if (mobile) await page.getByRole("banner").getByRole("button", { name: "メニュー" }).click()
    await expect(page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "顧客", exact: true })).toHaveAttribute("aria-current", "page")
    if (mobile) await page.keyboard.press("Escape")
    await expect(page.getByTestId("customers-count")).toHaveText("24件")
  })

  test("S03 search, filter and sort: each change returns to the first page and the request uses the applied conditions", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await page.getByRole("button", { name: "次へ" }).click()
    await expect(page.getByText("11–20 / 24件")).toBeVisible()

    await page.getByTestId("filter-status").click()
    await page.getByRole("option", { name: "状態：停止中" }).click()
    await expect(page.getByTestId("customers-count")).toHaveText("4件")
    await expect(page.getByText("1–4 / 4件")).toBeVisible()
    for (const cell of await page.getByRole("row").filter({ has: page.getByRole("checkbox") }).locator("td:nth-child(5)").allTextContents()) expect(cell).toBe("停止中")

    await page.getByTestId("filter-status").click()
    await page.getByRole("option", { name: "状態：すべて" }).click()
    await page.getByTestId("sort-select").click()
    await page.getByRole("option", { name: "月額の高い順" }).click()
    await expect(page.getByRole("row").nth(1)).toContainText("98,000円")

    await page.getByTestId("customers-search").fill("イズミ")
    await expect(page.getByTestId("customers-count")).toHaveText("1件")
    await expect(row(page, "株式会社イズミ製作所")).toBeVisible()
    const last = (await requests(page, "list")).at(-1)!.payload as { search: string; sorting: { id: string; desc: boolean }[]; pagination: { pageIndex: number } }
    expect(last.search).toBe("イズミ")
    expect(last.sorting).toEqual([{ id: "mrr", desc: true }])
    expect(last.pagination.pageIndex).toBe(0)
  })

  test("S04 the Sheet shows the same customer as the row, and closing it returns focus to the row @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    const target = row(page, "株式会社ウミネコ運輸")
    await expect(target).toContainText("98,000円")
    const trigger = target.getByRole("button", { name: "株式会社ウミネコ運輸", exact: true })
    await trigger.click()
    const sheet = page.getByTestId("customer-sheet")
    await expect(sheet.getByRole("heading", { name: "株式会社ウミネコ運輸" })).toBeVisible()
    await expect(sheet.getByTestId("sheet-mrr")).toHaveText("98,000円")
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await sheet.getByRole("button", { name: "詳細を閉じる" }).click()
    await expect(sheet).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("S05 the dedicated detail page opened from the Sheet shows the same values and a breadcrumb back to the list", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await row(page, "株式会社ウミネコ運輸").getByRole("button", { name: "株式会社ウミネコ運輸", exact: true }).click()
    await page.getByTestId("customer-sheet").getByRole("button", { name: "詳細ページを開く" }).click()
    await expect(page).toHaveURL(/page=customer&id=c03/)
    await expect(page.getByRole("heading", { name: "株式会社ウミネコ運輸", level: 1 })).toBeFocused()
    await expect(page.getByTestId("detail-mrr")).toHaveText("98,000円")
    await expect(page.getByTestId("detail-status")).toHaveText("契約中")
    await expect(page.getByRole("navigation", { name: /パンくず|breadcrumb/i }).getByRole("link", { name: "顧客" })).toHaveAttribute("href", /restore=1/)
  })

  test("S06 editing and saving returns to the list, which shows the saved value", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await editFromList(page, "株式会社オオトリ食品")
    await editForm(page).getByTestId("edit-status").click()
    await page.getByRole("option", { name: "契約中" }).click()
    await editForm(page).getByRole("button", { name: "保存する" }).click()
    await expect(page).toHaveURL(/page=customers&restore=1/)
    await expect(row(page, "株式会社オオトリ食品")).toContainText("契約中")
    expect((await pi<{ status: string }>(page, "customer", "hq", "c05")).status).toBe("active")
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "株式会社オオトリ食品を保存しました" })).toBeVisible()
  })

  test("S07 returning to the list restores the conditions, the page and the focus on the opened row @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await page.getByTestId("sort-select").click()
    await page.getByRole("option", { name: "月額の低い順" }).click()
    await expect(page.getByRole("row").nth(1)).toContainText("9,800円")
    await page.getByRole("button", { name: "次へ" }).click()
    await expect(page.getByText("11–20 / 24件")).toBeVisible()
    const name = (await page.getByRole("row").nth(3).getByRole("button").first().textContent())!.trim()
    await row(page, name).getByRole("button", { name, exact: true }).click()
    await page.getByTestId("customer-sheet").getByRole("button", { name: "詳細ページを開く" }).click()
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible()

    await page.goBack()
    await expect(page.getByTestId("sort-select")).toHaveText("月額の低い順")
    await expect(page.getByText("11–20 / 24件")).toBeVisible()
    await expect(row(page, name).getByRole("button", { name, exact: true })).toBeFocused()
  })

  test("S07 opening the list again from the Sidebar does not restore the previous conditions", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await page.getByRole("button", { name: "次へ" }).click()
    await expect(page.getByText("11–20 / 24件")).toBeVisible()
    await row(page, "株式会社サクラ通信").getByRole("button", { name: "株式会社サクラ通信", exact: true }).click()
    await page.getByTestId("customer-sheet").getByRole("button", { name: "詳細ページを開く" }).click()
    await expect(page.getByRole("heading", { name: "株式会社サクラ通信", level: 1 })).toBeVisible()
    await sidebarGo(page, "顧客")
    await expect(page.getByText("1–10 / 24件")).toBeVisible()
    await expect(page.getByRole("heading", { name: "顧客", level: 1 })).toBeFocused()
  })

  test("S08 Sidebar navigation with unsaved changes asks to discard, keeps the input on 編集を続ける and leaves on 変更を破棄 @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await editFromList(page, "株式会社アオバ商事")
    await makeDirty(page, "破棄するメモ")
    await sidebarGo(page, "分析")
    const dialog = unsavedDialog(page)
    await expect(dialog.getByRole("heading", { name: "変更を破棄しますか？" })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "編集を続ける" })).toBeFocused()
    await expect(dialog.getByRole("button", { name: "保存して移動" })).toBeVisible()
    await dialog.getByRole("button", { name: "編集を続ける" }).click()
    await expect(dialog).toBeHidden()
    await expect(editForm(page).getByLabel("社内のメモ")).toHaveValue("破棄するメモ")
    await expect(page).toHaveURL(/page=customer-edit/)

    await sidebarGo(page, "分析")
    await unsavedDialog(page).getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.getByRole("heading", { name: "分析", level: 1 })).toBeVisible()
    expect(await requests(page, "save")).toHaveLength(0)
    expect((await pi<{ note: string }>(page, "customer", "hq", "c01")).note).toBe("")
  })

  test("S09 opening a notification with unsaved changes asks first, then opens the notified customer", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await editFromList(page, "株式会社イズミ製作所")
    await makeDirty(page)
    await page.getByTestId("notifications-trigger").click()
    const center = page.getByTestId("notifications-center")
    await center.locator("[data-row-focus]").filter({ hasText: "株式会社アオバ商事の契約が更新されました" }).click()
    await expect(center).toBeHidden()
    const dialog = unsavedDialog(page)
    await expect(dialog.getByRole("heading", { name: "変更を破棄しますか？" })).toBeVisible()
    await dialog.getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.getByRole("heading", { name: "株式会社アオバ商事", level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/page=customer&id=c01/)
    expect(await requests(page, "save")).toHaveLength(0)
  })

  test("S10 保存して移動 saves first and then navigates", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await editFromList(page, "株式会社エニシ建設")
    await makeDirty(page, "保存して移動するメモ")
    await hold(page, "save")
    await sidebarGo(page, "分析")
    await unsavedDialog(page).getByRole("button", { name: "保存して移動" }).click()
    await expect.poll(async () => (await requests(page, "save")).length).toBe(1)
    // 保存の応答の前には移動しない
    await expect(page).toHaveURL(/page=customer-edit/)
    await release(page, { kind: "save" })
    await expect(page.getByRole("heading", { name: "分析", level: 1 })).toBeVisible()
    expect((await pi<{ note: string }>(page, "customer", "hq", "c04")).note).toBe("保存して移動するメモ")
  })

  test("S10 保存して移動 stays on the form when the save fails", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await editFromList(page, "株式会社エニシ建設")
    await makeDirty(page, "失敗するメモ")
    await setConfig(page, { saveMode: "failed" })
    await sidebarGo(page, "分析")
    await unsavedDialog(page).getByRole("button", { name: "保存して移動" }).click()
    await expect(page.getByTestId("edit-form-error")).toContainText("保存できませんでした")
    await expect(page).toHaveURL(/page=customer-edit/)
    await expect(editForm(page).getByLabel("社内のメモ")).toHaveValue("失敗するメモ")
    expect(await requests(page, "save")).toHaveLength(1)
  })

  test("S09 choosing 編集を続ける when opening a notification keeps it unread", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await makeDirty(page, "通知を開く前の入力")
    await expect(page.getByTestId("notifications-trigger")).toHaveAccessibleName("お知らせ、未読 2 件")
    await page.getByTestId("notifications-trigger").click()
    await page.getByTestId("notifications-center").locator("[data-row-focus]").filter({ hasText: "株式会社アオバ商事の契約が更新されました" }).click()
    await unsavedDialog(page).getByRole("button", { name: "編集を続ける" }).click()
    await expect(unsavedDialog(page)).toBeHidden()
    await expect(page).toHaveURL(/page=customer-edit/)
    await expect(page.getByTestId("notifications-trigger")).toHaveAccessibleName("お知らせ、未読 2 件")
    expect(await requests(page, "read")).toHaveLength(0)
  })
})
