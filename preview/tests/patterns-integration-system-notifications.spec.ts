import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"
import { hold, listReady, openApp, pi, release, requests, setConfig, sidebarGo, users } from "./patterns-integration-helpers"

// Patterns の横断の検証画面：接続の状態、結果が不明な保存、部分障害、通知の設定、通知センター（15 章の 27〜33）。
// オフラインは Playwright の context.setOffline で再現する（ブラウザの online / offline のイベント）。
collectPageErrors(test)

const banner = (page: Page) => page.getByTestId("pi-banner")
const center = (page: Page) => page.getByTestId("notifications-center")
const editForm = (page: Page) => page.getByTestId("edit-form")

async function openCenter(page: Page) {
  await page.getByTestId("notifications-trigger").click()
  await expect(center(page)).toBeVisible()
  await expect(center(page).locator("[data-row-focus]").first()).toBeVisible()
}

test.describe("Patterns integration: system states, settings and notifications", () => {
  test("S27 offline restricts updates: the save is blocked with the offline reason, sends nothing and keeps the input @webkit", async ({ page, context }) => {
    await openApp(page, { route: "page=customer-edit&id=c01&from=detail" })
    await editForm(page).getByLabel("社内のメモ").fill("オフラインの入力")
    await context.setOffline(true)
    await expect(banner(page)).toContainText("オフラインです")
    await expect(page.getByTestId("edit-blocked")).toHaveText("オフラインのため利用できません。接続が戻ると利用できます")
    const submit = page.getByTestId("edit-submit")
    await expect(submit).toHaveAttribute("aria-disabled", "true")
    await expect(submit).toHaveAccessibleDescription(/オフラインのため利用できません/)
    await submit.click({ force: true })
    await editForm(page).getByLabel("顧客の名前").press("Enter")
    // 入力は残す（オフラインは認可の失効ではない）
    await expect(editForm(page).getByLabel("社内のメモ")).toHaveValue("オフラインの入力")
    expect(await requests(page, "save")).toHaveLength(0)
    await context.setOffline(false)
    await expect(banner(page)).toBeHidden()
    await expect(submit).not.toHaveAttribute("aria-disabled", "true")
  })

  test("S28 after reconnecting, the list is fetched again but no update is re-run", async ({ page, context }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    const before = (await requests(page, "list")).length
    await context.setOffline(true)
    await expect(banner(page)).toContainText("オフラインです")
    await expect(page.getByTestId("customers-export")).toHaveAttribute("aria-disabled", "true")
    await context.setOffline(false)
    await expect.poll(async () => (await requests(page, "list")).length).toBe(before + 1)
    await expect(banner(page)).toBeHidden()
    await expect(page.getByTestId("customers-export")).not.toHaveAttribute("aria-disabled", "true")
    expect(await requests(page, "save")).toHaveLength(0)
    expect(await requests(page, "bulk")).toHaveLength(0)
  })

  test("S29 a save with an unknown result is not re-sent on reconnect and is resolved by 保存されたかを確認 @webkit", async ({ page, context }) => {
    await openApp(page, { route: "page=customer-edit&id=c01&from=detail" })
    await setConfig(page, { saveMode: "unknown" })
    await editForm(page).getByLabel("社内のメモ").fill("結果が不明の保存")
    await page.getByTestId("edit-submit").click()
    const error = page.getByTestId("edit-form-error")
    await expect(error).toContainText("保存されたかを確かめられていません")
    await expect(page.getByTestId("edit-submit")).toHaveAttribute("aria-disabled", "true")
    await context.setOffline(true)
    await expect(banner(page)).toContainText("オフラインです")
    await context.setOffline(false)
    await expect(banner(page)).toBeHidden()
    expect(await requests(page, "save")).toHaveLength(1)
    await error.getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "保存されていたことを確かめました" })).toBeVisible()
    await expect(editForm(page)).toHaveAttribute("data-status", "succeeded")
    await expect(editForm(page)).not.toHaveAttribute("data-dirty", "true")
    expect(await requests(page, "save")).toHaveLength(1)
    expect(await requests(page, "lookup")).toHaveLength(1)
  })

  test("S29 an unknown save that was not applied returns to an unsaved state without re-sending", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c01&from=detail" })
    await setConfig(page, { saveMode: "unknown", unknownApplied: false })
    await editForm(page).getByLabel("社内のメモ").fill("保存されていない入力")
    await page.getByTestId("edit-submit").click()
    await page.getByTestId("edit-form-error").getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(editForm(page)).toHaveAttribute("data-status", "idle")
    await expect(editForm(page)).toHaveAttribute("data-dirty", "true")
    await expect(editForm(page).getByLabel("社内のメモ")).toHaveValue("保存されていない入力")
    expect(await requests(page, "save")).toHaveLength(1)
  })

  test("S30 a partial outage of the analysis keeps the customer list and editing usable", async ({ page }) => {
    await openApp(page)
    await pi(page, "setService", "analysis", "outage")
    await page.getByTestId("analysis-region").click()
    await page.getByRole("option", { name: "大阪", exact: true }).click()
    await expect(page.getByTestId("analysis-metrics").getByRole("alert")).toContainText("主要な指標を取得できませんでした")
    await expect(banner(page)).toContainText("分析を表示できません")
    await sidebarGo(page, "顧客")
    await listReady(page)
    await page.getByRole("row").filter({ hasText: "株式会社アオバ商事" }).getByRole("button", { name: "株式会社アオバ商事", exact: true }).click()
    await page.getByTestId("customer-sheet").getByRole("button", { name: "編集" }).click()
    await editForm(page).getByLabel("社内のメモ").fill("障害中の保存")
    await page.getByTestId("edit-submit").click()
    await expect(page).toHaveURL(/page=customers&restore=1/)
    expect((await pi<{ note: string }>(page, "customer", "hq", "c01")).note).toBe("障害中の保存")
  })

  test("S31 a notification setting is saved per item; a failed save is reverted and an unknown result is locked until verified", async ({ page }) => {
    await openApp(page, { route: "page=settings" })
    const digest = page.getByTestId("setting-digest")
    await expect(digest).not.toBeChecked()
    await digest.click()
    const row = page.locator("[data-setting-id=digest]")
    await expect(row).toContainText("保存しました")
    expect(await page.evaluate(() => (window as unknown as { __fdPi: { config: { settings: Record<string, { digest: boolean }> } } }).__fdPi.config.settings["u-sato"].digest)).toBe(true)

    await setConfig(page, { settingsMode: "failed" })
    const email = page.getByTestId("setting-email")
    await expect(email).toBeChecked()
    await email.click()
    await expect(page.locator("[data-setting-id=email]")).toContainText("保存できなかったため、元の設定に戻しました。")
    await expect(email).toBeChecked()

    await setConfig(page, { settingsMode: "unknown" })
    const contract = page.getByTestId("setting-contract")
    await contract.click()
    const contractRow = page.locator("[data-setting-id=contract]")
    await expect(contractRow).toContainText("保存できたかを確認できませんでした。")
    await expect(contract).toHaveAttribute("aria-readonly", "true")
    await setConfig(page, { settingsMode: "success" })
    await contractRow.getByRole("button", { name: "確認する" }).click()
    await expect(contract).not.toBeChecked()
    await expect(contract).not.toHaveAttribute("aria-readonly", "true")
  })

  test("S32 new notifications arriving while the center is open are held without moving focus or scroll @webkit", async ({ page }) => {
    await openApp(page)
    await openCenter(page)
    const filterUnread = center(page).getByRole("button", { name: "未読", exact: true })
    await filterUnread.focus()
    const scroller = center(page).locator("[data-slot=sheet-body]")
    const scrollBefore = await scroller.evaluate((el) => el.scrollTop)
    const items = center(page).locator("[data-row-focus]")
    const countBefore = await items.count()
    await pi(page, "pushNotification", "hq", users.sato.id, "株式会社ウミネコ運輸から問い合わせがありました", "c03")
    const show = center(page).getByRole("button", { name: "新着 1 件を表示" })
    await expect(show).toBeVisible()
    await expect(items).toHaveCount(countBefore)
    await expect(filterUnread).toBeFocused()
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(scrollBefore)
    await show.click()
    await expect(items.filter({ hasText: "株式会社ウミネコ運輸から問い合わせがありました" })).toBeVisible()
  })

  test("S33 mark-all-read uses the range fixed at the start: a new arrival and an item set unread during the request stay unread", async ({ page }) => {
    await openApp(page)
    await openCenter(page)
    await hold(page, "read")
    await center(page).getByRole("button", { name: /既読にする$/ }).filter({ hasText: /すべて既読にする|件を既読にする/ }).click()
    await expect.poll(async () => (await requests(page, "read")).map((r) => r.payload)).toEqual([{ ids: ["n1", "n2"], read: true }])
    await pi(page, "pushNotification", "hq", users.sato.id, "一括既読の後に届いたお知らせ", "c03")
    // 既読だった n3 を、一括既読の実行中に未読に戻す
    await hold(page, "read", false)
    await center(page).getByRole("button", { name: "「株式会社エニシ建設から問い合わせがありました」を未読に戻す" }).click()
    await expect.poll(async () => (await requests(page, "read")).length).toBe(2)
    await release(page, { kind: "read" })
    await center(page).getByRole("button", { name: "新着 1 件を表示" }).click()
    const unread = () =>
      page.evaluate(() =>
        (window as unknown as { __fdPi: { config: { notifications: { id: string; title: string; read: boolean; userId: string; ws: string }[] } } }).__fdPi.config.notifications
          .filter((n) => n.userId === "u-sato" && n.ws === "hq" && !n.read)
          .map((n) => n.title)
          .sort()
      )
    await expect.poll(async () => (await requests(page, "read")).every((r) => r.settled)).toBe(true)
    await expect.poll(unread).toEqual(["一括既読の後に届いたお知らせ", "株式会社エニシ建設から問い合わせがありました"].sort())
    await page.keyboard.press("Escape")
    await expect(center(page)).toBeHidden()
    await expect(page.getByTestId("notifications-trigger")).toHaveAccessibleName("お知らせ、未読 2 件")
  })
})
