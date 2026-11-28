import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"
import { hold, listReady, openApp, pi, release, requests, row, sidebarGo, signIn, users } from "./patterns-integration-helpers"

// Patterns の横断の検証画面：初回のセットアップ、認可の再確認、権限の喪失、スコープの切り替え、古い操作、再認証（15 章の 1、21〜26）。
collectPageErrors(test)

const all = ["view", "edit", "delete", "export"]
const heldRaw = (page: Page) => pi<{ seq: number; kind: string; ws: string | null; key: string }[]>(page, "heldList")

async function switchWorkspace(page: Page, name: string) {
  await page.getByTestId("workspace-switcher").click()
  await page.getByRole("option", { name }).click()
}

/** 編集の画面で入力し、保存していない変更を作る */
async function dirtyEdit(page: Page, note: string) {
  await expect(page.getByTestId("edit-form")).toBeVisible()
  await page.getByTestId("edit-form").getByLabel("社内のメモ").fill(note)
  await expect(page.getByTestId("edit-form")).toHaveAttribute("data-dirty", "true")
}

test.describe("Patterns integration: authentication, authorization and scope", () => {
  test("S01 login and first-time setup: the required name blocks the next step, the optional step can be passed, then the product opens @webkit", async ({ page }) => {
    await openApp(page, { setupDone: false })
    const setup = page.getByTestId("pi-setup")
    await expect(setup.getByRole("heading", { name: "利用を始める準備", level: 1 })).toBeVisible()
    await expect(setup.getByRole("navigation", { name: "準備の手順" })).toBeVisible()
    const next = setup.getByTestId("setup-next")
    await expect(next).toHaveAttribute("aria-disabled", "true")
    await expect(next).toHaveAccessibleDescription("表示名を入力すると次へ進めます")
    await expect(setup.getByRole("heading", { name: "表示名", level: 2 })).toBeVisible()
    await setup.getByTestId("setup-name").fill("佐藤")
    await next.click()
    await expect(setup.getByRole("heading", { name: "通知（任意）", level: 2 })).toBeFocused()
    await setup.getByRole("button", { name: "戻る" }).click()
    await expect(setup.getByTestId("setup-name")).toHaveValue("佐藤")
    await next.click()
    await next.click()
    await expect(setup.getByTestId("setup-summary")).toContainText("佐藤")
    await setup.getByTestId("setup-finish").click()
    await expect(page.getByRole("heading", { name: "分析", level: 1 })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __fdPi: { config: { setupDone: string[] } } }).__fdPi.config.setupDone)).toContain("u-sato")
  })

  test("S21 while authorization is re-checked, protected customer data is not rendered @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customer&id=c01" })
    await expect(page.getByTestId("detail-email")).toHaveText("contact-c01@hq.example.com")
    await hold(page, "access")
    await pi(page, "setPermissions", users.sato.id, "hq", all)
    await expect(page.getByTestId("access-pending")).toContainText("最新の権限を確認しています")
    await expect(page.getByText("contact-c01@hq.example.com")).toHaveCount(0)
    await expect(page.getByTestId("detail-mrr")).toHaveCount(0)
    await release(page, { kind: "access" })
    await expect(page.getByTestId("detail-email")).toHaveText("contact-c01@hq.example.com")
  })

  test("S21 when the re-check removes the view permission, the content stays hidden", async ({ page }) => {
    await openApp(page, { route: "page=customer&id=c01" })
    await expect(page.getByTestId("detail-email")).toBeVisible()
    await pi(page, "setPermissions", users.sato.id, "hq", [])
    await expect(page.getByRole("heading", { name: "このページを表示する権限がありません" })).toBeVisible()
    await expect(page.getByText("contact-c01@hq.example.com")).toHaveCount(0)
  })

  test("S22 after losing the edit, delete and export permissions, save, delete and export cannot run", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await row(page, "株式会社アオバ商事").getByRole("checkbox").check()
    await page.getByTestId("customers-pause-selected").click()
    await expect(page.getByTestId("pause-confirm")).toBeVisible()
    await pi(page, "setPermissions", users.sato.id, "hq", ["view"])
    // 開いていた確認は閉じ、古い権限では実行しない
    await expect(page.getByTestId("pause-confirm")).toBeHidden()
    await listReady(page)
    await expect(page.getByTestId("customers-export")).toHaveAttribute("aria-disabled", "true")
    await expect(page.getByTestId("customers-export")).toHaveAccessibleDescription("この操作には「顧客のエクスポート」の権限が必要です")
    // 理由は支援技術だけでなく、見える文でも示す。取り込みの入口（編集の権限が必要）は置かない
    await expect(page.getByTestId("list-restrictions")).toContainText("この操作には「顧客のエクスポート」の権限が必要です")
    await expect(page.getByRole("link", { name: "CSV から取り込む" })).toHaveCount(0)
    await page.getByTestId("customers-export").click({ force: true })
    await expect(page.getByTestId("export-dialog")).toHaveCount(0)

    await row(page, "株式会社アオバ商事").getByRole("button", { name: "株式会社アオバ商事", exact: true }).click()
    await page.getByTestId("customer-sheet").getByRole("button", { name: "詳細ページを開く" }).click()
    await expect(page.getByTestId("detail-delete")).toHaveAttribute("aria-disabled", "true")
    await expect(page.getByTestId("detail-edit")).toHaveAttribute("aria-disabled", "true")
    await page.getByTestId("detail-delete").click({ force: true })
    await expect(page.getByTestId("delete-confirm")).toHaveCount(0)
    expect(await requests(page, "bulk")).toHaveLength(0)
    expect(await requests(page, "delete")).toHaveLength(0)
  })

  test("S22 an edit form whose permission is lost cannot save: the save is disabled while re-checking and the form is removed after the loss", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02" })
    await dirtyEdit(page, "権限の喪失の前の入力")
    await hold(page, "access")
    await pi(page, "setPermissions", users.sato.id, "hq", ["view"])
    // 再確認の間は、保護された内容（フォーム）を描画しない。保存も送らない
    await expect(page.getByTestId("access-pending")).toBeVisible()
    await expect(page.getByTestId("edit-form")).toHaveCount(0)
    await release(page, { kind: "access" })
    // 編集の権限を失った後は、編集の画面を表示しない（前の権限で入力した内容を保存できる状態に戻さない）
    await expect(page.getByRole("heading", { name: "このページを表示する権限がありません" })).toBeVisible()
    await expect(page.locator("body")).not.toContainText("権限の喪失の前の入力")
    expect(await requests(page, "save")).toHaveLength(0)
  })

  test("S23 A→B→A: a stale response of the first A arriving last is not shown @webkit", async ({ page }) => {
    await openApp(page)
    await hold(page, "list")
    await sidebarGo(page, "顧客")
    // StrictMode の開発の描画では、最初の取得を中止してもう一度始めるため、保留中の最後の要求を使う
    const lastHeld = async (ws: string, after = 0) => (await heldRaw(page)).filter((h) => h.ws === ws && h.seq > after).at(-1)
    await expect.poll(async () => (await lastHeld("hq"))?.seq ?? 0).toBeGreaterThan(0)
    const a1 = (await lastHeld("hq"))!
    await switchWorkspace(page, "九州支店")
    await expect.poll(async () => (await lastHeld("kyushu", a1.seq))?.seq ?? 0).toBeGreaterThan(0)
    const b = (await lastHeld("kyushu", a1.seq))!
    await pi(page, "updateCustomer", "hq", "c01", { name: "株式会社アオバ商事（新）" })
    await switchWorkspace(page, "本社営業部")
    await expect.poll(async () => (await lastHeld("hq", b.seq))?.seq ?? 0).toBeGreaterThan(0)
    const a2 = (await lastHeld("hq", b.seq))!
    await release(page, { seq: a2.seq })
    await expect(page.getByRole("button", { name: "株式会社アオバ商事（新）", exact: true })).toBeVisible()
    // 古い応答（九州支店と、最初の本社営業部）を後から届ける
    await release(page, { seq: b.seq })
    await release(page, { seq: a1.seq })
    await release(page, { kind: "list" })
    await expect(page.getByRole("button", { name: "株式会社アオバ商事（新）", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "株式会社アオバ商事", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "アオバ商事九州", exact: true })).toHaveCount(0)
    await expect(page.getByTestId("pi-app")).toHaveAttribute("data-ws", "hq")
  })

  test("S24 the Undo of a previous workspace cannot operate after switching, and its Toast is closed", async ({ page }) => {
    await openApp(page, { route: "page=customer&id=c01" })
    await page.getByTestId("detail-pause").click()
    const toast = page.locator("[data-slot=toast]").filter({ hasText: "株式会社アオバ商事を停止中にしました" })
    await expect(toast.getByRole("button", { name: "元に戻す" })).toBeVisible()
    await switchWorkspace(page, "九州支店")
    await expect(page.getByRole("heading", { name: "顧客", level: 1 })).toBeVisible()
    await expect(toast).toHaveCount(0)
    const statusBefore = (await requests(page, "status")).length
    // 前のワークスペースで作った取り消しの関数（Toast の操作）を、切り替えの後に呼ぶ
    const undone = await page.evaluate(() => (window as unknown as { __fdPi: { lastUndo: { undo: () => Promise<boolean> } } }).__fdPi.lastUndo.undo())
    expect(undone).toBe(false)
    expect(await requests(page, "status")).toHaveLength(statusBefore)
    expect((await pi<{ status: string }>(page, "customer", "hq", "c01")).status).toBe("paused")
  })

  test("S24 a notification for the previous workspace is not received after switching", async ({ page }) => {
    await openApp(page)
    await expect(page.getByTestId("notifications-trigger")).toHaveAccessibleName("お知らせ、未読 2 件")
    await switchWorkspace(page, "九州支店")
    await expect(page.getByTestId("notifications-trigger")).toHaveAccessibleName("お知らせ、未読 1 件")
    await pi(page, "pushNotification", "hq", users.sato.id, "本社営業部の新しいお知らせ", "c02")
    await page.getByTestId("notifications-trigger").click()
    const center = page.getByTestId("notifications-center")
    await expect(center.getByText("アオバ商事九州の請求書を発行しました")).toBeVisible()
    await expect(center.getByText("本社営業部の新しいお知らせ")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(center).toBeHidden()
    await expect(page.getByTestId("notifications-trigger")).toHaveAccessibleName("お知らせ、未読 1 件")
  })

  test("S25 session expiry then the same user: the work is restored only after the current authorization is confirmed @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await dirtyEdit(page, "再認証の前の入力")
    await pi(page, "expireSession")
    const login = page.getByTestId("pi-login")
    await expect(login.getByRole("heading", { name: "もう一度ログインしてください" })).toBeVisible()
    await expect(login.getByLabel("メールアドレス")).toHaveValue(users.sato.email)
    await expect(page.getByTestId("edit-form")).toHaveCount(0)
    await expect(page.locator("body")).not.toContainText("再認証の前の入力")
    await hold(page, "access")
    await signIn(page)
    await expect(page.getByTestId("pi-verifying")).toBeVisible()
    await expect(page.locator("body")).not.toContainText("再認証の前の入力")
    await hold(page, "access", false)
    await release(page, { kind: "access" })
    await expect(page.getByTestId("edit-form").getByLabel("社内のメモ")).toHaveValue("再認証の前の入力")
    await expect(page.getByTestId("draft-restored")).toBeVisible()
    await expect(page.getByTestId("edit-form")).toHaveAttribute("data-dirty", "true")
    await expect(page).toHaveURL(/page=customer-edit&id=c02/)
    expect(await requests(page, "save")).toHaveLength(0)
  })

  test("S25 the same user without the edit permission returns to the read-only detail and the input is discarded", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await dirtyEdit(page, "編集の権限がない入力")
    await pi(page, "expireSession")
    await pi(page, "setPermissions", users.sato.id, "hq", ["view"])
    await signIn(page)
    await expect(page.getByRole("heading", { name: "株式会社イズミ製作所", level: 1 })).toBeVisible()
    await expect(page).toHaveURL(/page=customer&id=c02/)
    await expect(page.getByTestId("reauth-notice")).toHaveText("編集の権限がないため、ログインし直す前の入力を破棄しました")
    await expect(page.locator("body")).not.toContainText("編集の権限がない入力")
  })

  test("S26 another user: the previous work, notifications and cached list are not carried over @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customer-edit&id=c02&from=detail" })
    await dirtyEdit(page, "前の利用者の入力")
    const listBefore = (await requests(page, "list")).length
    await pi(page, "expireSession")
    await page.getByTestId("login-other").click()
    await page.evaluate(() => (window as unknown as { __fdPi: { config: { setupDone: string[] } } }).__fdPi.config.setupDone.push("u-tanaka"))
    await signIn(page, users.tanaka.email)
    await expect(page.getByTestId("pi-app")).toHaveAttribute("data-user", "u-tanaka")
    // 前の利用者の復帰先（編集の画面）ではなく、新しい利用者の既定の画面
    await expect(page.getByRole("heading", { name: "分析", level: 1 })).toBeVisible()
    await expect(page.locator("body")).not.toContainText("前の利用者の入力")
    await expect(page.locator("[data-slot=toast]")).toHaveCount(0)
    await page.getByTestId("notifications-trigger").click()
    const center = page.getByTestId("notifications-center")
    await expect(center.getByText("閲覧の権限が付与されました")).toBeVisible()
    await expect(center.getByText("株式会社アオバ商事の契約が更新されました")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(center).toBeHidden()
    // 一覧は新しい利用者のセッションで取得し直す（前の利用者の取得の結果を使わない）
    await sidebarGo(page, "顧客")
    await listReady(page)
    await expect.poll(async () => (await requests(page, "list")).length).toBeGreaterThan(listBefore)
  })
})
