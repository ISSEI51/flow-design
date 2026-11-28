import { expect, test, type Page } from "@playwright/test"

import { customers } from "../src/data/data-display/customers"
import { permissionLabels, roles, type Permission, type RoleId } from "../src/data/system-account/model"
import { confidentialCustomerIds, editingCustomerId, seedPermissionCustomers } from "../src/data/system-account/permission-data"
import { collectPageErrors } from "./page-errors"

// Patterns / System & Account / Permission States の資料のページの検品。
// 模擬のサーバーは window.__fdSaPermissionServer で設定する（応答の時間、結果、ignoreAbort、受け付けた要求の記録）。
// 応答の順序は、固定の応答時間ではなく、要求の保留（hold）と解放（release）で制御する。
// 期待値は、指示書の判断基準（6 章、13 章）と model.ts のロール・契約プランから決める（画面の表示から作らない）。
collectPageErrors(test)

type Server = NonNullable<Window["__fdSaPermissionServer"]>
type Kind = Server["log"][number]["kind"]
const server = <T>(page: Page, fn: (s: Server) => T) =>
  page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdSaPermissionServer), fn.toString()) as Promise<T>
const serverWith = <A, T>(page: Page, fn: (s: Server, arg: A) => T, arg: A) =>
  page.evaluate(([src, a]) => new Function("s", "a", `return (${src})(s, a)`)(window.__fdSaPermissionServer, a), [fn.toString(), arg] as const) as Promise<Awaited<T>>
const logOf = (page: Page, kind: string) => server(page, (s) => s.log).then((l) => l.filter((x) => x.kind === kind))
/** 種類 kind の要求を保留する（release まで応答しない） */
const hold = (page: Page, kind: Kind, on = true) => serverWith(page, (s, [k, v]) => void (s.hold[k] = v), [kind, on] as const)
/** 保留中の要求の数 */
const heldOf = (page: Page, kind: Kind, scope?: string) =>
  serverWith(page, (s, [k, sc]) => s.held.filter((h) => h.kind === k && (sc === null || h.scope === sc)).length, [kind, scope ?? null] as const)
/** 保留中の要求を解放し、応答の処理と描画の予約が進むまで待つ */
const release = (page: Page, kind: Kind, options: { scope?: string; outcome?: "success" | "fail" | "unknown"; process?: boolean } = {}) =>
  serverWith(
    page,
    async (s, [k, o]) => {
      const n = s.release(k, o)
      await s.settle()
      return n
    },
    [kind, options] as const,
  )
/**
 * 要求が count 件以上保留されるまで待つ。同じスコープを表示しているほかの例も、変更の知らせで取得し直すため、
 * 種類だけで数える場合は「以上」で待つ（release は一致するものをすべて解放する）。
 */
const waitHeld = (page: Page, kind: Kind, count = 1, scope?: string) => expect.poll(() => heldOf(page, kind, scope)).toBeGreaterThanOrEqual(count)

const demo = (page: Page, id: string) => page.getByTestId(`perm-demo-${id}`)
const op = (page: Page, demoId: string, id: string) => demo(page, demoId).getByTestId(`perm-op-${id}`)
const opButton = (page: Page, demoId: string, id: string, name: string) => op(page, demoId, id).getByRole("button", { name, exact: true })
const roleSelect = (page: Page, userId: string) => demo(page, "roles").getByTestId(`perm-role-${userId}`)
const ready = (page: Page, demoId: string) => expect(demo(page, demoId).getByTestId("perm-ops")).toHaveAttribute("data-status", "ready")

const firstCustomer = customers.find((c) => c.id === editingCustomerId)!
const confidentialNames = seedPermissionCustomers()
  .filter((c) => confidentialCustomerIds.includes(c.id))
  .map((c) => c.company)

async function open(page: Page) {
  await page.goto("/#/permission-states")
  await expect(page.getByRole("heading", { level: 1, name: "Permission States" })).toBeVisible()
}

async function pickScope(page: Page, demoId: string, label: RegExp) {
  await demo(page, demoId).getByRole("radio", { name: label }).check()
}

// ------------------------------------------------------------------ 資料のページ
test.describe("Permission States page", { tag: "@webkit" }, () => {
  test("one h1, named controls, no horizontal page scroll, inert comparison mocks", async ({ page }) => {
    await open(page)
    await expect(page.locator("h1")).toHaveCount(1)
    await ready(page, "ops")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const controls = page.locator("main").first().getByRole("button").or(page.locator("main").first().getByRole("link"))
    const n = await controls.count()
    expect(n).toBeGreaterThan(10)
    for (let i = 0; i < n; i++) {
      const c = controls.nth(i)
      if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
    }
    const mocks = await page.locator("figure [inert]").all()
    expect(mocks.length).toBeGreaterThanOrEqual(5)
    for (const mock of mocks) expect(await mock.evaluate((el) => (el as HTMLElement).inert)).toBe(true)
    // 模擬の処理であることを画面に示す
    await expect(demo(page, "ops").getByText("利用者（模擬のログイン）")).toBeVisible()
    await expect(demo(page, "live").getByText(/管理者の操作（模擬/)).toBeVisible()
  })

  test("320px: no horizontal scroll; reasons and resolutions stay visible", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    await page.setViewportSize({ width: 320, height: 800 })
    await open(page)
    await pickScope(page, "ops", /田中 美咲/)
    await ready(page, "ops")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const reason = op(page, "ops", "edit").locator("[data-slot=restriction-reason]")
    await reason.scrollIntoViewIfNeeded()
    await expect(reason).toBeVisible()
    const box = (await reason.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    await expect(op(page, "ops", "edit").getByRole("button", { name: /権限を申請/ })).toBeVisible()
  })
})

// ------------------------------------------------------------------ 非表示と無効化、制限の理由
test.describe("hide vs disable, and the reason for each restriction", () => {
  test("per role: task operations are disabled with a reason; unrelated admin functions are hidden", async ({ page }) => {
    await open(page)
    await ready(page, "ops")
    // 佐藤 花子（本社・管理者・スタンダード）
    for (const id of ["edit", "delete", "export"]) await expect(op(page, "ops", id)).toHaveAttribute("data-mode", "enabled")
    await expect(op(page, "ops", "invite")).toHaveAttribute("data-restriction", "prerequisite")
    await expect(op(page, "ops", "audit")).toHaveAttribute("data-restriction", "entitlement")

    // 田中 美咲（閲覧者）：業務の操作は無効と理由、管理の機能は表示しない
    await pickScope(page, "ops", /田中 美咲/)
    await ready(page, "ops")
    for (const [id, p] of [
      ["edit", "customers.edit"],
      ["delete", "customers.delete"],
      ["export", "customers.export"],
    ] as const) {
      await expect(op(page, "ops", id)).toHaveAttribute("data-restriction", "authorization")
      await expect(op(page, "ops", id).locator("[data-slot=restriction-reason]")).toHaveText(`この操作には「${permissionLabels[p]}」の権限が必要です`)
    }
    await expect(op(page, "ops", "invite")).toHaveCount(0)
    await expect(op(page, "ops", "audit")).toHaveCount(0)

    // 佐藤 花子（西日本・メンバー・ビジネス）：削除だけ無効、監査ログは契約プランにあるが権限がないため表示しない
    await pickScope(page, "ops", /西日本営業部/)
    await ready(page, "ops")
    await expect(op(page, "ops", "edit")).toHaveAttribute("data-mode", "enabled")
    await expect(op(page, "ops", "export")).toHaveAttribute("data-mode", "enabled")
    await expect(op(page, "ops", "delete")).toHaveAttribute("data-restriction", "authorization")
    await expect(op(page, "ops", "invite")).toHaveCount(0)
    await expect(op(page, "ops", "audit")).toHaveCount(0)
  })

  test("distinct reasons: offline, outage, pending, prerequisite and plan are not shown as a missing permission", async ({ page }) => {
    await open(page)
    await ready(page, "ops")
    const controls = demo(page, "ops")
    const reasonText = (id: string) => op(page, "ops", id).locator("[data-slot=restriction-reason]")
    await controls.getByRole("checkbox", { name: "オフライン" }).check()
    for (const id of ["edit", "delete", "export"]) await expect(op(page, "ops", id)).toHaveAttribute("data-restriction", "connectivity")
    await expect(reasonText("edit")).toHaveText("オフラインのため利用できません。接続が戻ると利用できます")
    await controls.getByRole("checkbox", { name: "オフライン" }).uncheck()
    await controls.getByRole("checkbox", { name: "書き出しの障害" }).check()
    await expect(op(page, "ops", "export")).toHaveAttribute("data-restriction", "service")
    await expect(op(page, "ops", "edit")).toHaveAttribute("data-mode", "enabled")
    await controls.getByRole("checkbox", { name: "保存の処理中" }).check()
    await expect(op(page, "ops", "edit")).toHaveAttribute("data-restriction", "pending")
    const texts = new Set<string>()
    for (const id of ["edit", "export", "invite", "audit"]) texts.add((await reasonText(id).textContent())!)
    expect(texts.size).toBe(4)
    for (const t of texts) expect(t).not.toMatch(/権限がありません|権限が必要/)
    // 理由のない解決の方法（障害、接続、処理中）には、操作を置かない
    await expect(op(page, "ops", "export").getByRole("button")).toHaveCount(1)
  })

  test("a disabled operation stays focusable and its reason is its accessible description (keyboard and touch)", { tag: "@webkit" }, async ({ page }) => {
    await open(page)
    await pickScope(page, "ops", /田中 美咲/)
    await ready(page, "ops")
    const edit = opButton(page, "ops", "edit", "顧客を編集")
    await expect(edit).toHaveAttribute("aria-disabled", "true")
    await expect(edit).toHaveAccessibleDescription("この操作には「顧客を登録・編集」の権限が必要です")
    // 理由は常に表示する文（Tooltip ではない）
    await expect(op(page, "ops", "edit").locator("[data-slot=restriction-reason]")).toBeVisible()
    await edit.focus()
    await expect(edit).toBeFocused()
    await page.keyboard.press("Enter")
    expect(await logOf(page, "operation")).toHaveLength(0)
  })

  test("an allowed operation is sent to the server, which re-authorizes it", async ({ page }) => {
    await open(page)
    await ready(page, "ops")
    await opButton(page, "ops", "delete", "顧客を削除").click()
    await expect(demo(page, "ops").getByTestId("perm-ops-result")).toHaveText(/「顧客を削除」をサーバーが受け付けました/)
    expect((await logOf(page, "operation")).map((l) => l.scope)).toEqual(["u-sato:hq"])
  })

  test("a prerequisite the user can set: the settings form resolves it in place", async ({ page }) => {
    await open(page)
    await ready(page, "ops")
    const invite = op(page, "ops", "invite")
    await invite.getByRole("button", { name: /送信元のアドレスの設定を開く/ }).click()
    await invite.getByLabel("送信元のアドレス").fill("sales@example.com")
    await invite.getByRole("button", { name: "設定を保存" }).click()
    await expect(op(page, "ops", "invite")).toHaveAttribute("data-mode", "enabled")
  })
})

// ------------------------------------------------------------------ 権限の取得中・取得失敗
test.describe("unresolved permissions are never treated as allowed", () => {
  test("loading: task operations are disabled with 'checking'; admin functions are not shown until confirmed", async ({ page }) => {
    await open(page)
    await ready(page, "ops")
    await pickScope(page, "ops", /鈴木 一郎/)
    await ready(page, "ops")
    await hold(page, "access")
    await pickScope(page, "ops", /佐藤 花子（本社営業部/)
    await expect(demo(page, "ops").getByTestId("perm-ops")).toHaveAttribute("data-status", "loading")
    const edit = opButton(page, "ops", "edit", "顧客を編集")
    await expect(edit).toHaveAttribute("aria-disabled", "true")
    await expect(op(page, "ops", "edit")).toHaveAttribute("data-restriction", "unresolved")
    await expect(op(page, "ops", "edit").locator("[data-slot=restriction-reason]")).toHaveText("権限を確認しています")
    await expect(op(page, "ops", "invite")).toHaveCount(0)
    await expect(op(page, "ops", "audit")).toHaveCount(0)
    await waitHeld(page, "access", 1, "u-sato:hq")
    await release(page, "access")
    await ready(page, "ops")
    await expect(edit).toBeEnabled()
    await expect(op(page, "ops", "audit")).toHaveAttribute("data-restriction", "entitlement")
  })

  test("failure: operations stay disabled with a retry; a failed re-check also blocks operations", async ({ page }) => {
    await open(page)
    await ready(page, "ops")
    // 再確認の失敗（前の権限は表示に使うが、操作は許可しない）
    await demo(page, "ops").getByRole("radio", { name: "失敗する" }).check()
    await expect(demo(page, "ops").getByTestId("perm-ops")).toHaveAttribute("data-status", "stale")
    await expect(op(page, "ops", "edit").locator("[data-slot=restriction-reason]")).toHaveText(/最新の権限を確認できませんでした/)
    await expect(opButton(page, "ops", "edit", "顧客を編集")).toHaveAttribute("aria-disabled", "true")
    // 初回の取得の失敗
    await pickScope(page, "ops", /鈴木 一郎/)
    await expect(demo(page, "ops").getByTestId("perm-ops")).toHaveAttribute("data-status", "error")
    await expect(op(page, "ops", "edit").locator("[data-slot=restriction-reason]")).toHaveText(
      "権限を確認できませんでした。確認できるまで、この操作は行えません",
    )
    await expect(op(page, "ops", "invite")).toHaveCount(0)
    await server(page, (s) => (s.outcome.access = "success"))
    await op(page, "ops", "edit").getByRole("button", { name: "権限を再確認" }).click()
    await ready(page, "ops")
    await expect(opButton(page, "ops", "edit", "顧客を編集")).toBeEnabled()
    await expect(op(page, "ops", "delete")).toHaveAttribute("data-restriction", "authorization")
  })
})

// ------------------------------------------------------------------ 閲覧専用
test.describe("read only", () => {
  test("a viewer reads plain text, not disabled inputs; an editor gets a Read Only input only for the ID", async ({ page }) => {
    await open(page)
    const viewer = demo(page, "readonly").getByTestId("perm-editor")
    await expect(viewer).toHaveAttribute("data-mode", "read-only")
    await expect(viewer.locator("input, textarea, select")).toHaveCount(0)
    await expect(viewer.locator("[disabled], [aria-disabled=true]")).toHaveCount(0)
    const dl = viewer.getByTestId("perm-editor-readonly")
    await expect(dl).toContainText(firstCustomer.owner)
    await expect(dl).toContainText(firstCustomer.phone)
    await expect(dl).toContainText(firstCustomer.id)
    // 文字の色は通常の文字（薄くしない）
    const opacity = await dl
      .locator("dd")
      .first()
      .evaluate((el) => getComputedStyle(el).opacity)
    expect(opacity).toBe("1")

    const editor = demo(page, "edit").getByTestId("perm-editor")
    await expect(editor).toHaveAttribute("data-mode", "edit")
    await expect(editor.getByLabel("顧客 ID")).toHaveAttribute("readonly", "")
    await expect(editor.getByLabel("顧客 ID")).toHaveValue(firstCustomer.id)
    await expect(editor.getByLabel("担当者")).toBeEditable()
  })
})

// ------------------------------------------------------------------ ページへのアクセス
test.describe("page access: signed out, forbidden, not found", () => {
  const state = (page: Page) => demo(page, "page").getByTestId("perm-page-state")
  test("each state has its own heading, a safe destination and a real resolution; no bare status code", async ({ page }) => {
    await open(page)
    await expect(state(page)).toHaveAttribute("data-access", "unauthenticated")
    await expect(state(page).getByRole("heading", { name: "ログインが必要です" })).toBeVisible()
    await expect(state(page)).not.toContainText(/\b40[134]\b/)
    await state(page).getByRole("button", { name: "ログイン（模擬）" }).click()
    // ログインした後、同じページに戻る
    await expect(demo(page, "page").getByTestId("perm-page-content")).toContainText(firstCustomer.company)

    await demo(page, "page").getByRole("radio", { name: "契約と請求の設定" }).check()
    await expect(state(page)).toHaveAttribute("data-access", "forbidden")
    await expect(state(page).getByRole("heading", { name: "このページを表示する権限がありません" })).toBeVisible()
    await expect(state(page)).toContainText("佐藤 花子")
    await expect(state(page)).not.toContainText(/\b40[134]\b/)
    // 申請できない権限には、申請の操作を置かない（存在しない申請の機能を表示しない）
    await expect(state(page).getByRole("button", { name: /申請/ })).toHaveCount(0)
    await state(page).getByRole("button", { name: "顧客の一覧へ" }).click()
    await expect(demo(page, "page").getByTestId("perm-page-content")).toContainText(`閲覧できる顧客は ${8 - confidentialCustomerIds.length} 件です`)

    await demo(page, "page").getByRole("radio", { name: "存在しない顧客" }).check()
    await expect(state(page)).toHaveAttribute("data-access", "not-found")
    await expect(state(page).getByRole("heading", { name: "ページが見つかりません" })).toBeVisible()
  })

  test("a record whose existence cannot be disclosed looks exactly like a missing one", async ({ page }) => {
    await open(page)
    await demo(page, "page").getByRole("radio", { name: "田中 美咲（閲覧者）" }).check()
    await demo(page, "page").getByRole("radio", { name: "存在しない顧客" }).check()
    await expect(state(page)).toHaveAttribute("data-access", "not-found")
    const missing = await state(page).innerText()
    await demo(page, "page").getByRole("radio", { name: "担当者だけが閲覧できる顧客" }).check()
    await expect(demo(page, "page").getByText(`/customers/${confidentialCustomerIds[0]}`)).toBeVisible()
    await expect(state(page)).toHaveAttribute("data-access", "not-found")
    expect(await state(page).innerText()).toBe(missing)
    await expect(demo(page, "page")).not.toContainText(confidentialNames[0])
    // 閲覧できる利用者には表示する
    await demo(page, "page").getByRole("radio", { name: "佐藤 花子（管理者）" }).check()
    await expect(demo(page, "page").getByTestId("perm-page-content")).toContainText(confidentialNames[0])
  })
})

// ------------------------------------------------------------------ 部分的な閲覧権限
test.describe("partial view", () => {
  const partial = (page: Page) => demo(page, "partial")
  test("viewer: visible data stays; confidential records are excluded from count, results and search; billing is not rendered", async ({ page }) => {
    await open(page)
    const count = partial(page).getByTestId("perm-overview-count")
    await expect(count).toHaveText(`${8 - confidentialCustomerIds.length} 件`)
    for (const name of confidentialNames) await expect(partial(page).getByTestId("perm-overview-results")).not.toContainText(name)
    await partial(page).getByTestId("perm-overview-search").fill(confidentialNames[0])
    await expect(count).toHaveText("0 件")
    await expect(partial(page).getByTestId("perm-overview-billing")).toHaveCount(0)
    await expect(partial(page).getByText("契約と請求")).toHaveCount(0)
    // メンバーの一覧は存在を明かしてよいため、理由と申請を示す
    const members = partial(page).getByTestId("perm-overview-members")
    await expect(members.locator("[data-slot=restriction-notice]")).toContainText("メンバーの一覧を表示する権限がありません")
    await expect(members.getByRole("button", { name: "「メンバーを閲覧」の権限を申請" })).toBeVisible()
  })

  test("admin and member see what their role allows", async ({ page }) => {
    await open(page)
    await pickScope(page, "partial", /佐藤 花子（本社営業部/)
    await expect(partial(page).getByTestId("perm-overview-count")).toHaveText("8 件")
    for (const name of confidentialNames) await expect(partial(page).getByTestId("perm-overview-results")).toContainText(name)
    await expect(partial(page).getByTestId("perm-overview-billing")).toBeVisible()
    await pickScope(page, "partial", /鈴木 一郎/)
    await expect(partial(page).getByTestId("perm-overview-count")).toHaveText(`${8 - confidentialCustomerIds.length} 件`)
    await expect(partial(page).getByTestId("perm-overview-members").getByRole("listitem")).toHaveCount(3)
    await expect(partial(page).getByTestId("perm-overview-billing")).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 権限の申請
test.describe("permission request", () => {
  const req = (page: Page, p: Permission) => demo(page, "request").getByTestId(`perm-request-${p}`)
  test("request → pending (from the server) → approved: the operation is enabled without reload or sign-in", async ({ page }) => {
    await open(page)
    await page.evaluate(() => ((window as unknown as { __permMarker: number }).__permMarker = 1))
    const button = req(page, "customers.delete").getByRole("button", { name: "「顧客を削除」の権限を申請" })
    // 二重申請の防止：素早く 2 回押しても、送る要求は 1 つ（応答を保留して、送信中の 2 回目の押下を確かめる）
    await hold(page, "request")
    await button.dblclick()
    await waitHeld(page, "request")
    expect(await logOf(page, "request")).toHaveLength(1)
    await release(page, "request")
    await expect(req(page, "customers.delete")).toHaveAttribute("data-request-status", "pending")
    await expect(req(page, "customers.delete").getByRole("button")).toHaveCount(0)
    expect(await logOf(page, "request")).toHaveLength(1)
    expect((await server(page, (s) => s.inspect().requests)).length).toBe(1)
    await expect(req(page, "customers.delete").getByRole("status")).toHaveText(/申請しました/)
    // 必要な権限だけを申請する
    expect((await server(page, (s) => s.inspect().requests))[0].permission).toBe("customers.delete")
    // 管理者が承認する（模擬）
    await demo(page, "request").getByTestId("perm-admin-requests").getByRole("button", { name: "承認する" }).click()
    await expect(op(page, "request", "delete")).toHaveAttribute("data-mode", "enabled")
    await expect(op(page, "request", "edit")).toHaveAttribute("data-restriction", "authorization")
    expect(await page.evaluate(() => (window as unknown as { __permMarker?: number }).__permMarker)).toBe(1)
  })

  test("rejected and failed requests are shown as the server reports them", async ({ page }) => {
    await open(page)
    await server(page, (s) => (s.outcome.request = "fail"))
    await req(page, "customers.edit").getByRole("button", { name: "「顧客を登録・編集」の権限を申請" }).click()
    await expect(req(page, "customers.edit").getByRole("status")).toHaveText("申請を送れませんでした。もう一度お試しください。")
    await expect(req(page, "customers.edit")).toHaveAttribute("data-request-status", "none")
    expect((await server(page, (s) => s.inspect().requests)).length).toBe(0)
    // 結果が不明：サーバーでは申請が作られている。申請の記録を取得し直して、承認待ちと示す（再送しない）
    await server(page, (s) => (s.outcome.request = "unknown"))
    await req(page, "customers.edit").getByRole("button", { name: "「顧客を登録・編集」の権限を申請" }).click()
    await expect(req(page, "customers.edit")).toHaveAttribute("data-request-status", "pending")
    expect((await server(page, (s) => s.inspect().requests)).length).toBe(1)
    // 照会の結果を文で示す（申請されていた）
    await expect(req(page, "customers.edit").getByRole("status")).toHaveText("「顧客を登録・編集」の権限は申請されていました。承認を待っています。")
    expect(await logOf(page, "request")).toHaveLength(2)
    // 却下
    await demo(page, "request").getByTestId("perm-admin-requests").getByRole("button", { name: "却下する" }).click()
    await expect(req(page, "customers.edit")).toHaveAttribute("data-request-status", "rejected")
    await expect(req(page, "customers.edit")).toContainText("却下されました")
    await expect(req(page, "customers.edit").getByRole("button", { name: "もう一度申請する" })).toBeVisible()
    await expect(op(page, "request", "edit")).toHaveAttribute("data-restriction", "authorization")
  })
})

// ------------------------------------------------------------------ 契約プランと認可
test.describe("contract plan vs authorization", () => {
  const plan = (page: Page) => demo(page, "plan")
  test("plan restriction for an admin (can check the plan), for a member (contact), and authorization in a business plan", async ({ page }) => {
    await open(page)
    const sso = plan(page).getByTestId("perm-org-sso")
    await expect(sso).toHaveAttribute("data-restriction", "entitlement")
    await expect(sso).toContainText("組織の SSOは、現在の契約プランでは利用できません")
    // 利用できる既存の機能を示す（本社営業部は多要素認証が必須）
    await expect(sso).toContainText("多要素認証を必須にしてログインを保護しています")
    await sso.getByRole("button", { name: "契約プランを確認" }).click()
    await expect(sso.getByTestId("perm-plan-info")).toContainText("スタンダード")
    await expect(plan(page).getByTestId("perm-org-audit")).toHaveAttribute("data-restriction", "entitlement")
    await expect(plan(page).getByTestId("perm-org-readonly")).toHaveCount(0)

    await pickScope(page, "plan", /鈴木 一郎/)
    await expect(sso).toHaveAttribute("data-restriction", "entitlement")
    await expect(sso.getByRole("button")).toHaveCount(0)
    await expect(sso).toContainText("契約の変更は、管理者の佐藤 花子さん")
    await expect(plan(page).getByTestId("perm-org-audit")).toHaveCount(0)
    await expect(plan(page).getByTestId("perm-org-readonly")).toHaveAttribute("data-restriction", "authorization")

    await pickScope(page, "plan", /西日本営業部/)
    await expect(sso).not.toHaveAttribute("data-restriction", /./)
    await expect(sso).toContainText("必須")
    await expect(plan(page).getByTestId("perm-org-readonly")).toHaveAttribute("data-restriction", "authorization")
    await expect(plan(page).getByTestId("perm-org-audit")).toHaveCount(0)

    await pickScope(page, "plan", /田中 美咲/)
    await expect(plan(page).getByTestId("perm-org-hidden")).toBeVisible()
    await expect(plan(page).getByTestId("perm-org-settings")).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 利用中の権限変更
test.describe("permission change while in use", () => {
  test("a role change is reflected immediately; operations are blocked while re-checking; no reload or sign-in", async ({ page }) => {
    await open(page)
    await ready(page, "live")
    await page.evaluate(() => ((window as unknown as { __permMarker: number }).__permMarker = 1))
    const edit = opButton(page, "live", "edit", "顧客を編集")
    await expect(edit).toBeEnabled()
    await hold(page, "access")
    await demo(page, "live").getByRole("button", { name: "鈴木 一郎さんを閲覧者にする" }).click()
    // 再確認の間も、古い権限での操作を受け付けない（応答を保留している間）
    await expect(op(page, "live", "edit")).toHaveAttribute("data-restriction", "unresolved")
    await expect(op(page, "live", "edit").locator("[data-slot=restriction-reason]")).toHaveText("最新の権限を確認しています")
    await expect(edit).toHaveAttribute("aria-disabled", "true")
    await waitHeld(page, "access")
    await release(page, "access")
    await expect(op(page, "live", "edit")).toHaveAttribute("data-restriction", "authorization")
    await expect(demo(page, "live").getByTestId("perm-live-notice")).toHaveText("権限が変更されました。表示している操作を更新しました。")
    await expect(demo(page, "live").getByTestId("perm-live-notice")).toHaveAttribute("role", "status")
    await demo(page, "live").getByRole("button", { name: "鈴木 一郎さんをメンバーに戻す" }).click()
    // 前の権限（閲覧者）で許可されない操作も、再確認の間は「権限がない」と示さない（新しい権限で許可される可能性がある。PERM-6）。
    // 画面での扱い（無効にして示す）は変えない（表示を揺らさない）
    await waitHeld(page, "access")
    await expect(demo(page, "live").getByTestId("perm-ops")).toHaveAttribute("data-status", "refreshing")
    await expect(op(page, "live", "edit")).toHaveAttribute("data-restriction", "unresolved")
    await expect(op(page, "live", "edit")).toHaveAttribute("data-mode", "disabled")
    await expect(op(page, "live", "edit").locator("[data-slot=restriction-reason]")).toHaveText("最新の権限を確認しています")
    await release(page, "access")
    await expect(op(page, "live", "edit")).toHaveAttribute("data-mode", "enabled")
    expect(await page.evaluate(() => (window as unknown as { __permMarker?: number }).__permMarker)).toBe(1)
  })

  test("from the first commit after a change notice until the re-fetched response, no commit allows the operation", async ({ page }) => {
    await open(page)
    await ready(page, "live")
    const ops = demo(page, "live").getByTestId("perm-ops")
    const before = Number(await ops.getAttribute("data-request-id"))
    const revision = Number(await ops.getAttribute("data-revision"))
    // 画面に反映した（commit した）状態をすべて記録する（一時的な状態も検出する）
    await ops.evaluate((el) => {
      const seen: string[] = []
      ;(window as unknown as { __permLive: string[] }).__permLive = seen
      const edit = () => el.querySelector('[data-testid="perm-op-edit"]')?.getAttribute("data-mode") ?? "none"
      new MutationObserver(() =>
        seen.push([el.getAttribute("data-revision"), el.getAttribute("data-status"), el.getAttribute("data-verified"), el.getAttribute("data-request-id"), edit()].join("|")),
      ).observe(el, { attributes: true, subtree: true })
    })
    await hold(page, "access")
    await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "viewer"))
    await expect(ops).toHaveAttribute("data-status", "refreshing")
    await expect(ops).toHaveAttribute("data-verified", "false")
    await waitHeld(page, "access")
    await release(page, "access")
    await expect(op(page, "live", "edit")).toHaveAttribute("data-restriction", "authorization")
    const seen = await page.evaluate(() => (window as unknown as { __permLive: string[] }).__permLive)
    const after = seen.filter((x) => x.startsWith(`${revision + 1}|`))
    expect(after.length).toBeGreaterThan(0)
    for (const x of after) {
      const [, status, verified, requestId, mode] = x.split("|")
      // 新しい revision の commit で ready（確認済み）になるのは、変更の後に送った要求の応答だけ
      if (status === "ready") expect(Number(requestId)).toBeGreaterThan(before)
      else expect(verified).toBe("false")
      // 変更の後に、古い権限で「顧客を編集」を有効にした commit がない
      expect(mode === "enabled" && Number(requestId) <= before).toBe(false)
    }
  })

  test("an operation sent with permissions that were revoked meanwhile is rejected by the server and shown", async ({ page }) => {
    await open(page)
    await ready(page, "live")
    await hold(page, "operation")
    await opButton(page, "live", "edit", "顧客を編集").click()
    await waitHeld(page, "operation")
    await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "viewer"))
    // サーバーは、解放した時点（処理する時点）の権限で判断する
    await release(page, "operation")
    await expect(demo(page, "live").getByTestId("perm-ops-result")).toHaveText(/「顧客を編集」をサーバーが拒否しました/)
  })
})

// ------------------------------------------------------------------ 編集中の権限変更
test.describe("permission change while editing", () => {
  const editor = (page: Page) => demo(page, "edit").getByTestId("perm-editor")
  const note = (page: Page) => editor(page).getByLabel("備考")
  const notice = (page: Page) => editor(page).getByTestId("perm-editor-notice")

  test(
    "losing edit: saving stops, the draft is kept by policy, focus moves to the notice; regained after re-validation",
    { tag: "@webkit" },
    async ({ page }) => {
      await open(page)
      await expect(editor(page)).toHaveAttribute("data-mode", "edit")
      await note(page).fill("未保存の入力")
      await note(page).focus()
      await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "viewer"))
      await expect(editor(page)).toHaveAttribute("data-mode", "read-only")
      await expect(editor(page).locator("textarea, input")).toHaveCount(0)
      await expect(notice(page)).toHaveAttribute("role", "status")
      await expect(notice(page)).toContainText("保存は停止しました。入力中の内容は保持しています")
      // フォーカスしていた入力欄が消えたため、変更を知らせる見出しへ移す
      await expect(notice(page).getByText("編集の権限が変更されました")).toBeFocused()
      expect(await logOf(page, "save")).toHaveLength(0)
      await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "member"))
      await expect(editor(page)).toHaveAttribute("data-mode", "edit")
      await expect(notice(page)).toContainText("最新の内容と権限を確認しました")
      await expect(note(page)).toHaveValue("未保存の入力")
      // 権限と内容を取得し直してから再開した（再検証）
      expect((await logOf(page, "record")).length).toBeGreaterThanOrEqual(2)
    },
  )

  test("losing edit with the discard policy; a re-grant after someone else's update keeps the user's input on the changed field only", async ({ page }) => {
    await open(page)
    await demo(page, "edit").getByRole("radio", { name: "破棄する" }).check()
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await note(page).fill("破棄される入力")
    await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "viewer"))
    await expect(notice(page)).toContainText("入力中の内容は破棄しました")
    await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "member"))
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await expect(note(page)).toHaveValue(firstCustomer.note ?? "")

    await demo(page, "edit").getByRole("radio", { name: "編集の権限が戻るまで保持する" }).check()
    await editor(page).getByLabel("担当者").fill("鈴木 一郎")
    await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "viewer"))
    await expect(editor(page)).toHaveAttribute("data-mode", "read-only")
    await server(page, (s) => s.simulate.updateRecord("C-00001", { note: "ほかの利用者が更新した備考（模擬）" }))
    await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "member"))
    await expect(notice(page)).toContainText("ほかの人がこの顧客を更新していました")
    await expect(note(page)).toHaveValue("ほかの利用者が更新した備考（模擬）")
    await expect(editor(page).getByLabel("担当者")).toHaveValue("鈴木 一郎")
  })

  test("losing view: the record and the draft are removed; the message does not disclose the record", { tag: "@webkit" }, async ({ page }) => {
    await open(page)
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await note(page).fill("機密を含むかもしれない入力")
    await note(page).focus()
    await server(page, (s) => s.simulate.restrictRecord("C-00001", ["u-sato"]))
    await expect(editor(page)).toHaveAttribute("data-mode", "hidden")
    await expect(editor(page)).not.toContainText(firstCustomer.company)
    await expect(editor(page)).not.toContainText(firstCustomer.owner)
    await expect(editor(page).locator("textarea, input")).toHaveCount(0)
    await expect(notice(page)).toHaveText(/この顧客を表示できなくなりました.*入力中の内容は破棄しました/)
    await expect(notice(page).getByText("この顧客を表示できなくなりました")).toBeFocused()
    await server(page, (s) => s.simulate.restrictRecord("C-00001", null))
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await expect(note(page)).toHaveValue(firstCustomer.note ?? "")
  })

  test("permission revoked during save: the actual server result (rejected) is shown, and nothing is saved", async ({ page }) => {
    await open(page)
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await hold(page, "save")
    await note(page).fill("保存中に権限が変わる")
    await editor(page).getByRole("button", { name: "保存" }).click()
    await expect(editor(page).getByTestId("perm-editor-save-status")).toHaveText("保存しています")
    await waitHeld(page, "save")
    await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "viewer"))
    await release(page, "save")
    await expect(editor(page).getByTestId("perm-editor-save-status")).toHaveText(
      "保存されませんでした。権限が変更されたため、サーバーが保存を受け付けませんでした。",
    )
    expect((await server(page, (s) => s.inspect().customers.find((c) => c.id === "C-00001")!)).version).toBe(1)
  })

  test("unknown save result is confirmed by re-fetching; reduced motion stops the spinner", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page)
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await server(page, (s) => Object.assign(s, { outcome: { save: "unknown" } }))
    await hold(page, "save")
    await note(page).fill("結果が不明な保存")
    await editor(page).getByRole("button", { name: "保存" }).click()
    const spinner = editor(page).locator("[data-slot=button-spinner] svg")
    await expect(spinner).toBeVisible()
    expect(await spinner.evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
    await waitHeld(page, "save")
    await release(page, "save")
    await expect(editor(page).getByTestId("perm-editor-save-status")).toHaveText("保存されていたことを確認しました。")
    expect((await server(page, (s) => s.inspect().customers.find((c) => c.id === "C-00001")!)).note).toBe("結果が不明な保存")
  })
})

// ------------------------------------------------------------------ 権限の管理
test.describe("role management", () => {
  const roleDemo = (page: Page) => demo(page, "roles")
  test("Permission Matrix shows the actual operations of each role (from the product data)", async ({ page }) => {
    await open(page)
    const matrix = roleDemo(page).getByTestId("perm-matrix")
    const perms = Object.keys(permissionLabels) as Permission[]
    await expect(matrix.locator("tbody tr")).toHaveCount(perms.length)
    for (const p of perms) {
      const row = matrix.locator(`tr[data-permission="${p}"]`)
      await expect(row.getByRole("rowheader")).toHaveText(permissionLabels[p])
      for (const r of Object.keys(roles) as RoleId[]) {
        const cell = row.locator(`td[data-role="${r}"]`)
        const allowed = roles[r].permissions.includes(p)
        await expect(cell).toHaveAttribute("data-allowed", String(allowed))
        await expect(cell).toHaveText(allowed ? "できる" : "できない")
      }
    }
    for (const r of Object.values(roles)) await expect(matrix.getByRole("columnheader", { name: r.name })).toBeVisible()
  })

  test("high-impact change is confirmed with the operations gained; low-impact change applies directly", async ({ page }) => {
    await open(page)
    await roleDemo(page).getByTestId("perm-role-u-suzuki").click()
    await page.getByRole("option", { name: "管理者" }).click()
    const dialog = page.getByTestId("perm-role-confirm")
    await expect(dialog.getByRole("heading", { name: "鈴木 一郎さんを管理者に変更しますか？" })).toBeVisible()
    const added = roles.admin.permissions.filter((p) => !roles.member.permissions.includes(p)).map((p) => permissionLabels[p])
    await expect(dialog.getByTestId("perm-role-added").getByRole("listitem")).toHaveText(added)
    await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused()
    // Escape はキャンセル。サーバーに送らない
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    expect(await logOf(page, "role")).toHaveLength(0)
    await roleDemo(page).getByTestId("perm-role-u-suzuki").click()
    await page.getByRole("option", { name: "管理者" }).click()
    await dialog.getByRole("button", { name: "管理者に変更" }).click()
    await expect(roleDemo(page).getByTestId("perm-roles-result")).toHaveText("鈴木 一郎さんのロールを管理者に変更しました。")
    expect((await server(page, (s) => s.inspect().memberships)).find((m) => m.userId === "u-suzuki" && m.workspaceId === "hq")!.role).toBe("admin")

    // 閲覧者 → メンバーは、影響の大きい権限を含まないため、確認せずに変更する
    await roleDemo(page).getByTestId("perm-role-u-tanaka").click()
    await page.getByRole("option", { name: "メンバー" }).click()
    await expect(roleDemo(page).getByTestId("perm-roles-result")).toHaveText("田中 美咲さんのロールをメンバーに変更しました。")
    await expect(dialog).toHaveCount(0)
  })

  test("self row has no role control; members without the permission see roles read-only; viewers do not see members", async ({ page }) => {
    await open(page)
    const self = roleDemo(page).locator('[data-user="u-sato"]')
    await expect(self).toContainText("管理者（自分）")
    await expect(self.getByRole("combobox")).toHaveCount(0)
    await pickScope(page, "roles", /鈴木 一郎/)
    await expect(roleDemo(page).getByTestId("perm-members")).toBeVisible()
    await expect(roleDemo(page).getByRole("combobox")).toHaveCount(0)
    await expect(roleDemo(page).locator("[data-slot=restriction-notice]")).toContainText("ロールの変更には「メンバーを招待・変更」の権限が必要です")
    await pickScope(page, "roles", /田中 美咲/)
    await expect(roleDemo(page).getByTestId("perm-matrix")).toBeVisible()
    await expect(roleDemo(page).getByTestId("perm-members")).toHaveCount(0)
    await expect(roleDemo(page).getByRole("heading", { name: "メンバー" })).toHaveCount(0)
  })

  test("requests that bypass the UI are rejected by the server: escalation, last admin, self change", async ({ page }) => {
    await open(page)
    const direct = demo(page, "direct")
    await direct.getByRole("button", { name: "田中 美咲（閲覧者）として、自分を管理者にする" }).click()
    await expect(direct.getByTestId("perm-direct-result")).toHaveText(/サーバーが拒否しました（forbidden）/)
    await direct.getByRole("button", { name: "佐藤 花子（管理者）として、自分を閲覧者にする" }).click()
    await expect(direct.getByTestId("perm-direct-result")).toHaveText(/サーバーが拒否しました（last-admin）：ワークスペースの最後の管理者/)
    await server(page, (s) => s.api.changeRole("u-sato:hq", "u-suzuki", "admin"))
    await direct.getByRole("button", { name: "佐藤 花子（管理者）として、自分を閲覧者にする" }).click()
    await expect(direct.getByTestId("perm-direct-result")).toHaveText(/サーバーが拒否しました（self）/)
    expect((await server(page, (s) => s.inspect().memberships)).filter((m) => m.workspaceId === "hq").map((m) => m.role)).toEqual(["admin", "admin", "viewer"])
  })

  test("a role change rejected by the server is shown in the role management screen", async ({ page }) => {
    await open(page)
    // 変更の知らせが届く前に、佐藤さんの管理の権限がサーバーで外された（画面はまだ管理者の表示）
    await server(page, (s) => s.api.changeRole("u-sato:hq", "u-suzuki", "admin"))
    await server(page, (s) => s.simulate.setRole("u-sato", "hq", "member", { silent: true }))
    await roleDemo(page).getByTestId("perm-role-u-tanaka").click()
    await page.getByRole("option", { name: "メンバー" }).click()
    await expect(roleDemo(page).getByTestId("perm-roles-result")).toHaveText("ロールを変更できませんでした。メンバーのロールを変更する権限がありません。")
    expect((await server(page, (s) => s.inspect().memberships)).find((m) => m.userId === "u-tanaka")!.role).toBe("viewer")
    // 通信の失敗も、成功として表示しない
    await server(page, (s) => s.simulate.setRole("u-sato", "hq", "admin", { silent: true }))
    await server(page, (s) => (s.outcome.role = "fail"))
    await roleDemo(page).getByTestId("perm-role-u-tanaka").click()
    await page.getByRole("option", { name: "メンバー" }).click()
    await expect(roleDemo(page).getByTestId("perm-roles-result")).toHaveText("ロールを変更できませんでした。サーバーに接続できませんでした。")
  })
})

// ------------------------------------------------------------------ 古い認可の結果の無効化
test.describe("stale authorization results", () => {
  const stale = (page: Page) => demo(page, "stale")
  const ops = (page: Page) => stale(page).getByTestId("perm-ops")
  const appliedLog = (page: Page) => stale(page).getByTestId("perm-stale-log").getByRole("listitem")

  test("A → B → A with a server that ignores AbortSignal: only the last A response is applied; B never appears", async ({ page }) => {
    await open(page)
    await expect(ops(page)).toHaveAttribute("data-status", "ready")
    const before = await appliedLog(page).count()
    await server(page, (s) => Object.assign(s, { ignoreAbort: true }))
    await hold(page, "access")
    // 表示した scope の値をすべて記録する（一時的な表示も検出する）
    await ops(page).evaluate((el) => {
      const seen: string[] = []
      ;(window as unknown as { __permSeen: string[] }).__permSeen = seen
      new MutationObserver(() => seen.push(`${el.getAttribute("data-scope")}|${el.getAttribute("data-status")}`)).observe(el, { attributes: true })
    })
    await stale(page)
      .getByRole("radio", { name: /田中 美咲/ })
      .check()
    await stale(page)
      .getByRole("radio", { name: /佐藤 花子/ })
      .check()
    await waitHeld(page, "access", 1, "u-tanaka:hq")
    await waitHeld(page, "access", 1, "u-sato:hq")
    // 古い応答（B。中止の合図に従わない）を先に届ける：反映しない
    await release(page, "access", { scope: "u-tanaka:hq" })
    await expect(ops(page)).toHaveAttribute("data-status", "loading")
    await release(page, "access", { scope: "u-sato:hq" })
    await expect(ops(page)).toHaveAttribute("data-status", "ready")
    expect(await ops(page).getAttribute("data-scope")).toBe("u-sato:hq")
    const seen = await page.evaluate(() => (window as unknown as { __permSeen: string[] }).__permSeen)
    expect(seen.some((s) => s.startsWith("u-tanaka"))).toBe(false)
    // 切り替えた直後の描画から、前のスコープの権限を表示しない
    expect(seen.filter((s) => s.endsWith("|ready")).every((s) => s.startsWith("u-sato:hq"))).toBe(true)
    expect(seen.some((s) => s === "|loading")).toBe(true)
    // 反映した応答は、最後の A の要求だけ
    const accessLog = await server(page, (s) => s.log.map((l, i) => ({ ...l, i })).filter((l) => l.kind === "access"))
    const lastSato = accessLog.filter((l) => l.scope === "u-sato:hq").at(-1)!.i
    await expect(appliedLog(page)).toHaveCount(before + 1)
    await expect(appliedLog(page).last()).toHaveText(`佐藤 花子（要求 ${lastSato}）`)
    expect(await ops(page).getAttribute("data-request-id")).toBe(String(lastSato))
    // 招待（管理の機能）は、佐藤さんの管理者の権限でだけ表示される
    await expect(op(page, "stale", "invite")).toHaveAttribute("data-mode", "enabled")
  })

  test("a response that arrives after unmount is not applied", async ({ page }) => {
    await open(page)
    await expect(ops(page)).toHaveAttribute("data-status", "ready")
    const before = await appliedLog(page).count()
    await server(page, (s) => Object.assign(s, { ignoreAbort: true }))
    await hold(page, "access")
    await stale(page)
      .getByRole("radio", { name: /田中 美咲/ })
      .check()
    await waitHeld(page, "access", 1, "u-tanaka:hq")
    await stale(page)
      .getByRole("checkbox", { name: /例を表示する/ })
      .uncheck()
    await expect(ops(page)).toHaveCount(0)
    // アンマウントの後に応答を届ける（中止の合図に従わない処理）
    expect(await release(page, "access")).toBe(1)
    await expect(appliedLog(page)).toHaveCount(before)
    await hold(page, "access", false)
    await stale(page)
      .getByRole("checkbox", { name: /例を表示する/ })
      .check()
    await expect(ops(page)).toHaveAttribute("data-status", "ready")
    await expect(ops(page)).toHaveAttribute("data-scope", "u-tanaka:hq")
    await expect(appliedLog(page)).toHaveCount(before + 1)
    await expect(op(page, "stale", "invite")).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 処理中のスコープの切り替え
test.describe("in-flight work does not block another scope", () => {
  test("operation: switching user while an operation is pending leaves no busy state in the new (or returned) scope", async ({ page }) => {
    await open(page)
    await ready(page, "ops")
    // 中止の合図に従わない処理：スコープを切り替えた後も、元のスコープの応答が届く
    await server(page, (s) => Object.assign(s, { ignoreAbort: true }))
    await hold(page, "operation")
    await opButton(page, "ops", "edit", "顧客を編集").click()
    await expect(opButton(page, "ops", "edit", "顧客を編集")).toHaveAttribute("aria-busy", "true")
    await waitHeld(page, "operation")
    await pickScope(page, "ops", /鈴木 一郎/)
    await ready(page, "ops")
    const edit = opButton(page, "ops", "edit", "顧客を編集")
    await expect(op(page, "ops", "edit")).toHaveAttribute("data-mode", "enabled")
    await expect(edit).not.toHaveAttribute("aria-busy", "true")
    await expect(edit).toBeEnabled()
    await pickScope(page, "ops", /佐藤 花子（本社営業部/)
    await ready(page, "ops")
    await expect(op(page, "ops", "edit")).toHaveAttribute("data-mode", "enabled")
    await expect(opButton(page, "ops", "edit", "顧客を編集")).not.toHaveAttribute("aria-busy", "true")
    // 元のスコープ（世代 1）の応答が届いても、結果の文を示さない
    expect(await release(page, "operation")).toBe(1)
    await expect(demo(page, "ops").getByTestId("perm-ops-result")).toHaveText("")
    await expect(opButton(page, "ops", "edit", "顧客を編集")).toBeEnabled()
    expect(await logOf(page, "operation")).toHaveLength(1)
  })

  test("permission request: a pending request in one scope does not leave the request button busy in another", async ({ page }) => {
    await open(page)
    await pickScope(page, "ops", /田中 美咲/)
    await ready(page, "ops")
    await server(page, (s) => Object.assign(s, { ignoreAbort: true }))
    await hold(page, "request")
    const button = op(page, "ops", "delete").getByRole("button", { name: "「顧客を削除」の権限を申請" })
    await button.click()
    await expect(button).toHaveAttribute("aria-busy", "true")
    await pickScope(page, "ops", /鈴木 一郎/)
    await ready(page, "ops")
    const other = op(page, "ops", "delete").getByRole("button", { name: "「顧客を削除」の権限を申請" })
    await expect(other).toBeVisible()
    await expect(other).not.toHaveAttribute("aria-busy", "true")
    await expect(other).toBeEnabled()
    // 申請の対象は、送信を始めた時点のスコープと権限に固定されている
    expect(await release(page, "request")).toBe(1)
    expect((await server(page, (s) => s.inspect().requests)).map((r) => `${r.scope}:${r.permission}`)).toEqual(["u-tanaka:hq:customers.delete"])
    await expect(op(page, "ops", "delete").locator('[data-testid="perm-request-customers.delete"]').getByRole("status")).toHaveText("")
    await expect(op(page, "ops", "delete").locator('[data-testid="perm-request-customers.delete"]')).toHaveAttribute("data-request-status", "none")
    // 元のスコープに戻ると、サーバーの記録から承認待ちと示す（古い応答の文ではなく、取得し直した記録）
    await pickScope(page, "ops", /田中 美咲/)
    await ready(page, "ops")
    await expect(op(page, "ops", "delete").locator('[data-testid="perm-request-customers.delete"]')).toHaveAttribute("data-request-status", "pending")
    await expect(op(page, "ops", "delete").getByRole("button", { name: "「顧客を削除」の権限を申請" })).toHaveCount(0)
  })

  test("role change: switching user while a change is pending does not leave the role selects disabled", async ({ page }) => {
    await open(page)
    await server(page, (s) => Object.assign(s, { ignoreAbort: true }))
    await hold(page, "role")
    await roleSelect(page, "u-tanaka").click()
    await page.getByRole("option", { name: "メンバー" }).click()
    await expect(roleSelect(page, "u-suzuki")).toBeDisabled()
    await pickScope(page, "roles", /鈴木 一郎/)
    await expect(demo(page, "roles").getByTestId("perm-members")).toBeVisible()
    await pickScope(page, "roles", /佐藤 花子（本社営業部/)
    await expect(roleSelect(page, "u-suzuki")).toBeEnabled()
    await expect(roleSelect(page, "u-tanaka")).toBeEnabled()
    // 前の世代の応答の結果の文を示さない
    expect(await release(page, "role")).toBe(1)
    await expect(demo(page, "roles").getByTestId("perm-roles-result")).toHaveText("")
    await expect(roleSelect(page, "u-tanaka")).toBeEnabled()
  })
})

// ------------------------------------------------------------------ 権限の変更の知らせの後の取得の失敗
test.describe("re-fetch failure after a permission change notice", () => {
  test("keeps the previous permissions for display (stale), blocks operations, and does not replace the screen", async ({ page }) => {
    await open(page)
    await ready(page, "live")
    const editor = demo(page, "edit").getByTestId("perm-editor")
    // 製品が「前の権限で表示を続ける」を選んだ場合（既定は表示しない。下の検品）
    await demo(page, "edit").getByRole("radio", { name: "前の権限で表示を続ける" }).check()
    await expect(editor).toHaveAttribute("data-mode", "edit")
    await server(page, (s) => (s.outcome.access = "fail"))
    await server(page, (s) => s.simulate.setRole("u-suzuki", "hq", "viewer"))
    await expect(demo(page, "live").getByTestId("perm-ops")).toHaveAttribute("data-status", "stale")
    await expect(op(page, "live", "edit")).toHaveAttribute("data-restriction", "unresolved")
    await expect(op(page, "live", "edit").locator("[data-slot=restriction-reason]")).toHaveText(/最新の権限を確認できませんでした/)
    await expect(opButton(page, "live", "edit", "顧客を編集")).toHaveAttribute("aria-disabled", "true")
    // 編集の画面も置き換えない（前の権限で表示し、保存は許可しない）
    await expect(editor).toHaveAttribute("data-mode", "edit")
    await expect(editor).not.toContainText("この顧客を表示できませんでした")
    await expect(editor).toContainText(firstCustomer.company)
    await expect(editor.locator("[data-slot=restriction-reason]")).toHaveText(/最新の権限を確認できませんでした/)
    await expect(editor.getByRole("button", { name: "保存" })).toHaveAttribute("aria-disabled", "true")
    await server(page, (s) => (s.outcome.access = "success"))
    await op(page, "live", "edit").getByRole("button", { name: "権限を再確認" }).click()
    await ready(page, "live")
    await expect(op(page, "live", "edit")).toHaveAttribute("data-restriction", "authorization")
  })
})

// ------------------------------------------------------------------ 古い認可の結果：最初の A の応答
test.describe("stale authorization results: the first A of A → B → A", () => {
  test("the first A response (pending, ignoring AbortSignal) is not applied to the returned A", async ({ page }) => {
    await open(page)
    const ops = demo(page, "stale").getByTestId("perm-ops")
    await expect(ops).toHaveAttribute("data-status", "ready")
    await server(page, (s) => Object.assign(s, { ignoreAbort: true }))
    await hold(page, "access")
    const radio = (name: RegExp) => demo(page, "stale").getByRole("radio", { name })
    await radio(/田中 美咲/).check() // B1
    await radio(/佐藤 花子/).check() // A1（応答を保留）
    await radio(/田中 美咲/).check() // B2
    await radio(/佐藤 花子/).check() // A2
    await waitHeld(page, "access", 2, "u-sato:hq")
    const accessLog = await server(page, (s) => s.log.map((l, i) => ({ ...l, i })).filter((l) => l.kind === "access" && l.scope === "u-sato:hq"))
    const [a1, a2] = accessLog.slice(-2).map((l) => l.i)
    // 最初の A の応答を先に届ける：同じスコープの値でも、前の世代の要求のため反映しない
    await serverWith(page, (s, index) => s.held.find((h) => h.logIndex === index)!.release(), a1)
    await server(page, (s) => s.settle())
    await expect(ops).toHaveAttribute("data-status", "loading")
    await expect(ops).toHaveAttribute("data-request-id", "")
    await release(page, "access", { scope: "u-tanaka:hq" })
    await expect(ops).toHaveAttribute("data-status", "loading")
    await release(page, "access", { scope: "u-sato:hq" })
    await expect(ops).toHaveAttribute("data-status", "ready")
    await expect(ops).toHaveAttribute("data-request-id", String(a2))
  })
})

// ------------------------------------------------------------------ useAccess の状態の表（検品用の部品を別の root に描画する）
// 取得の処理は Deferred Promise。commit ごとの状態を記録し、操作を許可した commit を確かめる。
test.describe("useAccess: state table", () => {
  type ProbeRecord = import("../src/data/system-account/permission-access-probe").ProbeRecord
  type Probe = import("../src/data/system-account/permission-access-probe").AccessProbe
  const probeUrl = "/src/data/system-account/permission-access-probe.tsx"
  const mount = (page: Page, initial: { scopeKey: string; revision?: number; enabled?: boolean }) =>
    page.evaluate(
      async ([url, init]) => {
        const m = (await import(/* @vite-ignore */ url)) as typeof import("../src/data/system-account/permission-access-probe")
        window.__fdSaAccessProbe = m.mountAccessProbe(init)
      },
      [probeUrl, initial] as const,
    )
  /** 検品用の部品を操作する。fn はブラウザで実行する（外の変数を参照しない） */
  const probe = <A, T>(page: Page, fn: (p: Probe, arg: A) => T, arg?: A) =>
    page.evaluate(([src, a]) => new Function("p", "a", `return (${src})(p, a)`)(window.__fdSaAccessProbe, a), [fn.toString(), arg] as const) as Promise<Awaited<T>>
  const records = (page: Page) => probe(page, (p) => p.records.slice())
  /** 最新の、中止されていない要求に応答する（ok：権限、scope：応答のスコープ） */
  const respond = (page: Page, arg: { scope?: string; permissions?: string[]; fail?: boolean; id?: number }) =>
    probe(
      page,
      async (p, a) => {
        const r = a.id !== undefined ? p.requests[a.id] : p.requests.filter((x) => !x.aborted).at(-1)!
        if (a.fail) r.reject(new Error("network"))
        else r.resolve({ scope: a.scope ?? r.scopeKey, permissions: a.permissions ?? ["x"], features: [] })
        await p.settle()
      },
      arg,
    )
  const since = (all: ProbeRecord[], from: number) => all.slice(from)
  const last = (all: ProbeRecord[]) => all.at(-1)!

  test.beforeEach(async ({ page }) => {
    await open(page)
  })
  test.afterEach(async ({ page }) => {
    await probe(page, (p) => p.unmount())
  })

  // [説明, 手順, 確かめること]
  const cases: [string, (page: Page) => Promise<void>][] = [
    [
      "initial fetch: loading never allows; ready after the response",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        expect((await records(page)).every((r) => r.status === "loading" && !r.allowed && !r.verified)).toBe(true)
        await respond(page, {})
        expect(last(await records(page))).toMatchObject({ status: "ready", verified: true, allowed: true, grantsScope: "A" })
      },
    ],
    [
      "initial fetch failure: error, no grants, not allowed",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        await respond(page, { fail: true })
        expect(last(await records(page))).toMatchObject({ status: "error", grantsScope: null, allowed: false })
      },
    ],
    [
      "revision change: the very first commit is refreshing (before the re-fetch effect runs)",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        await respond(page, {})
        const n = (await records(page)).length
        await probe(page, (p) => p.set({ revision: 1 }))
        const after = since(await records(page), n)
        expect(after[0]).toMatchObject({ revision: 1, status: "refreshing", verified: false, allowed: false, permissions: "x" })
        expect(after.every((r) => !r.allowed)).toBe(true)
        await respond(page, {})
        expect(last(await records(page))).toMatchObject({ revision: 1, status: "ready", allowed: true })
      },
    ],
    [
      "re-fetch failure: stale keeps the grants for display and never allows",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        await respond(page, {})
        await probe(page, (p) => p.set({ revision: 1 }))
        await respond(page, { fail: true })
        expect(last(await records(page))).toMatchObject({ status: "stale", verified: false, allowed: false, permissions: "x" })
      },
    ],
    [
      "same scope, only the permissions change: no commit of the new revision allows",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        await respond(page, { permissions: ["x"] })
        const n = (await records(page)).length
        await probe(page, (p) => p.set({ revision: 1 }))
        await respond(page, { permissions: [] })
        const after = since(await records(page), n)
        expect(after.every((r) => !r.allowed)).toBe(true)
        expect(last(after)).toMatchObject({ status: "ready", permissions: "", allowed: false })
      },
    ],
    [
      "response scope mismatch: initial error, and stale after a re-fetch",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        await respond(page, { scope: "B" })
        expect(last(await records(page))).toMatchObject({ status: "error", grantsScope: null, allowed: false })
        await probe(page, (p) => p.reload())
        await respond(page, {})
        await probe(page, (p) => p.set({ revision: 1 }))
        await respond(page, { scope: "B" })
        expect(last(await records(page))).toMatchObject({ status: "stale", grantsScope: "A", allowed: false })
        expect((await records(page)).some((r) => r.grantsScope === "B")).toBe(false)
      },
    ],
    [
      "A → B → A, responses ignore AbortSignal: the first A and B are not applied",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        const firstA = await probe(page, (p) => p.requests.filter((r) => !r.aborted).at(-1)!.id)
        await probe(page, (p) => p.set({ scopeKey: "B" }))
        const b = await probe(page, (p) => p.requests.filter((r) => !r.aborted).at(-1)!.id)
        await probe(page, (p) => p.set({ scopeKey: "A" }))
        expect(await probe(page, (p, ids) => ids.map((i) => p.requests[i].aborted), [firstA, b])).toEqual([true, true])
        await respond(page, { id: firstA })
        await respond(page, { id: b })
        const all = await records(page)
        expect(all.every((r) => !r.allowed && r.grantsScope === null)).toBe(true)
        expect(last(all)).toMatchObject({ scopeKey: "A", status: "loading" })
        await respond(page, {})
        expect(last(await records(page))).toMatchObject({ scopeKey: "A", status: "ready", grantsScope: "A", allowed: true })
        expect((await records(page)).some((r) => r.grantsScope !== null && r.grantsScope !== r.scopeKey)).toBe(false)
      },
    ],
    [
      "scope change: the first commit of the new scope has no grants of the previous scope",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        await respond(page, {})
        const n = (await records(page)).length
        await probe(page, (p) => p.set({ scopeKey: "B" }))
        expect(since(await records(page), n)[0]).toMatchObject({ scopeKey: "B", status: "loading", grantsScope: null, allowed: false })
      },
    ],
    [
      "enabled = false: no request, no grants, not allowed (also right after ready)",
      async (page) => {
        await mount(page, { scopeKey: "A", enabled: false })
        expect(await probe(page, (p) => p.requests.length)).toBe(0)
        expect((await records(page)).every((r) => r.status === "loading" && !r.allowed)).toBe(true)
        await probe(page, (p) => p.set({ enabled: true }))
        await respond(page, {})
        const n = (await records(page)).length
        const requests = await probe(page, (p) => p.requests.length)
        await probe(page, (p) => p.set({ enabled: false }))
        expect(since(await records(page), n)[0]).toMatchObject({ enabled: false, status: "loading", grantsScope: null, allowed: false })
        expect(await probe(page, (p) => p.requests.length)).toBe(requests)
      },
    ],
    [
      "reload: the first commit is refreshing; latest() refuses right after reload(), before any commit",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        await respond(page, {})
        expect(await probe(page, (p) => p.decideLatest())).toBe(true)
        const n = (await records(page)).length
        await probe(page, (p) => p.reload())
        expect(since(await records(page), n)[0]).toMatchObject({ status: "refreshing", allowed: false })
        await respond(page, {})
        expect(await probe(page, (p) => p.decideLatest())).toBe(true)
        // reload() を呼んだ同じ処理の中（描画の前）から、latest() は確認済みの権限を返さない
        expect(await probe(page, (p) => p.reloadAndDecideLatest())).toBe(false)
        await respond(page, {})
        expect(await probe(page, (p) => p.decideLatest())).toBe(true)
      },
    ],
    [
      "unmount: a response after unmount is not applied",
      async (page) => {
        await mount(page, { scopeKey: "A" })
        const n = (await records(page)).length
        const id = await probe(page, (p) => {
          const r = p.requests.filter((x) => !x.aborted).at(-1)!.id
          p.unmount()
          return r
        })
        await respond(page, { id })
        expect((await records(page)).length).toBe(n)
        // afterEach の unmount のために、もう一度描画する
        await mount(page, { scopeKey: "A" })
      },
    ],
  ]
  for (const [name, run] of cases) test(name, async ({ page }) => run(page))
})

// ------------------------------------------------------------------ useAccess：破棄された描画（review-v01 L4）
// Transition で始めた新しいスコープの描画が Suspend して commit されず、スコープを元に戻して破棄された後も、
// 表示中のスコープの latest() が確認済みの権限を返す（描画の中で書き換えた値で照合しない。commit の時点の値で照合する）。
test.describe("useAccess: a discarded render", () => {
  type Probe = import("../src/data/system-account/permission-access-probe").AccessTransitionProbe
  const probeUrl = "/src/data/system-account/permission-access-probe.tsx"
  const probe = <A, T>(page: Page, fn: (p: Probe, arg: A) => T, arg?: A) =>
    page.evaluate(([src, a]) => new Function("p", "a", `return (${src})(p, a)`)(window.__fdSaAccessTransitionProbe, a), [fn.toString(), arg] as const) as Promise<Awaited<T>>

  test("a suspended scope change that is abandoned does not keep blocking operations in the shown scope", async ({ page }) => {
    await open(page)
    await page.evaluate(async (url) => {
      const m = (await import(/* @vite-ignore */ url)) as typeof import("../src/data/system-account/permission-access-probe")
      window.__fdSaAccessTransitionProbe = m.mountAccessTransitionProbe({ scopeKey: "A", suspendScope: "B" })
    }, probeUrl)
    // A の権限の取得に応答する
    await probe(page, async (p) => {
      p.requests.filter((r) => !r.aborted).at(-1)!.resolve({ scope: "A", permissions: ["x"], features: [] })
      await p.settle()
    })
    expect(await probe(page, (p) => p.decideLatest())).toEqual({ allowed: true, status: "ready" })
    // B への切り替えを Transition で始める（B の描画は Suspend して commit されない）。表示は A のまま
    await probe(page, async (p) => {
      p.startScopeTransition("B")
      await p.settle()
    })
    expect(await probe(page, (p) => p.shownScope())).toBe("A")
    // A に戻す：B の描画は破棄される。useAccess の部品は props が commit 済みの値と同じため、描画されない
    await probe(page, async (p) => {
      p.setScope("A")
      await p.settle()
    })
    expect(await probe(page, (p) => p.shownScope())).toBe("A")
    // 表示中の A の確認済みの権限で、操作を始められる（破棄された B の描画で止めたままにしない）
    expect(await probe(page, (p) => p.decideLatest())).toEqual({ allowed: true, status: "ready" })
    // B の権限の要求は送られていない（効果は commit の後に走る）
    expect(await probe(page, (p) => [...new Set(p.requests.map((r) => r.scopeKey))])).toEqual(["A"])
    await probe(page, (p) => p.unmount())
  })
})

// ------------------------------------------------------------------ 権限を失った直後の操作
test.describe("right after losing a permission: delete, export, save and moving from a notification", () => {
  const revoked = (page: Page) => demo(page, "revoked")
  const result = (page: Page) => revoked(page).getByTestId("perm-revoked-result")
  const dialog = (page: Page) => page.getByTestId("perm-revoked-confirm")
  const confirmButton = (page: Page) => dialog(page).getByRole("button", { name: "削除する" })
  const toViewer = (page: Page) => server(page, (s) => s.simulate.setRole("u-sato", "hq", "viewer"))
  const readyRevoked = (page: Page) => expect(revoked(page).getByTestId("perm-revoked")).toHaveAttribute("data-status", "ready")

  test("delete: a confirmation opened with the old permission cannot start the delete while re-checking or after the loss", async ({ page }) => {
    await open(page)
    await readyRevoked(page)
    await revoked(page).getByRole("button", { name: "顧客を削除" }).click()
    await expect(confirmButton(page)).toBeEnabled()
    await hold(page, "access")
    await toViewer(page)
    // 確認の Dialog の中でも、最新の権限を確認するまで確定できない
    await expect(confirmButton(page)).toBeDisabled()
    await expect(dialog(page).getByTestId("perm-revoked-confirm-reason")).toHaveText("最新の権限を確認しています")
    await waitHeld(page, "access")
    await release(page, "access")
    await expect(dialog(page).getByTestId("perm-revoked-confirm-reason")).toHaveText("この操作には「顧客を削除」の権限が必要です")
    await expect(confirmButton(page)).toBeDisabled()
    expect(await logOf(page, "operation")).toHaveLength(0)
  })

  test("delete: pressed in the same task as the change notice (before the screen updates) does not start", async ({ page }) => {
    await open(page)
    await readyRevoked(page)
    await revoked(page).getByRole("button", { name: "顧客を削除" }).click()
    await expect(confirmButton(page)).toBeEnabled()
    // 変更の知らせと押下を同じ処理の中で行う（画面はまだ前の権限で、ボタンは有効）
    const enabledWhenPressed = await server(page, (s) => {
      s.simulate.setRole("u-sato", "hq", "viewer")
      const button = document.querySelector<HTMLButtonElement>('[data-testid="perm-revoked-confirm"] [data-slot="alert-dialog-action"]')!
      const enabled = !button.disabled && button.getAttribute("aria-disabled") !== "true"
      button.click()
      return enabled
    })
    expect(enabledWhenPressed).toBe(true)
    await expect(result(page)).toHaveText("最新の権限を確認できるまで、削除を始めません。")
    await expect(result(page)).toHaveAttribute("data-kind", "blocked")
    await server(page, (s) => s.settle())
    expect(await logOf(page, "operation")).toHaveLength(0)
  })

  test("export: losing the permission while the preparation is pending does not start the export", async ({ page }) => {
    await open(page)
    await readyRevoked(page)
    await hold(page, "overview")
    await revoked(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await waitHeld(page, "overview")
    await hold(page, "access")
    await toViewer(page)
    await waitHeld(page, "access")
    // 準備の応答が届いた時点で、最新の権限で判断し直す（準備を始めた時点の認可で続けない）
    await release(page, "overview")
    await expect(result(page)).toHaveText("最新の権限を確認できるまで、書き出しを始めません。")
    expect(await logOf(page, "operation")).toHaveLength(0)
    await release(page, "access")
    await expect(revoked(page).getByTestId("perm-revoked-export")).toHaveAttribute("data-restriction", "authorization")
    // 権限が確定した後も、押しても始めない（無効の操作）
    await revoked(page).getByRole("button", { name: "顧客を書き出す" }).click({ force: true })
    expect(await logOf(page, "operation")).toHaveLength(0)
  })

  test("export: with the permission kept, the export starts after the preparation (control)", async ({ page }) => {
    await open(page)
    await readyRevoked(page)
    await revoked(page).getByRole("button", { name: "顧客を書き出す" }).click()
    await expect(result(page)).toHaveText("8 件の書き出しをサーバーが受け付けました（模擬。ファイルは作りません）。")
    expect((await logOf(page, "operation")).map((l) => l.detail)).toEqual(["customers.export"])
  })

  test("notification: moving is refused while re-checking and after the loss; the server decides during the move", async ({ page }) => {
    await open(page)
    await readyRevoked(page)
    const openLink = revoked(page).getByTestId("perm-revoked-notification").getByRole("button", { name: "メンバーの一覧を開く" })
    await hold(page, "access")
    await toViewer(page)
    await openLink.click()
    await expect(result(page)).toHaveText("最新の権限を確認できるまで、移動しません。")
    expect((await logOf(page, "members")).filter((l) => l.detail === "navigate")).toHaveLength(0)
    await waitHeld(page, "access")
    await release(page, "access")
    await openLink.click()
    await expect(result(page)).toHaveText("この対象を閲覧する権限がありません。移動しませんでした。")
    expect((await logOf(page, "members")).filter((l) => l.detail === "navigate")).toHaveLength(0)
    await expect(revoked(page).getByTestId("perm-revoked-opened")).toHaveCount(0)

    // 権限を戻して移動を始め、移動先の確認の応答を待つ間に権限を失う：サーバーが処理する時点の権限で拒否する
    // 権限を戻す。取得し直しの要求を保留して、確認中になったことを確かめてから解放する
    // （前の閲覧者の権限の「確認済み」を、戻した後の確認済みと取り違えない）
    await server(page, (s) => s.simulate.setRole("u-sato", "hq", "admin"))
    await waitHeld(page, "access")
    await expect(revoked(page).getByTestId("perm-revoked")).toHaveAttribute("data-verified", "false")
    await hold(page, "access", false)
    await release(page, "access")
    await expect(revoked(page).getByTestId("perm-revoked")).toHaveAttribute("data-verified", "true")
    await expect(result(page)).toHaveText("この対象を閲覧する権限がありません。移動しませんでした。")
    await hold(page, "members")
    await openLink.click()
    await waitHeld(page, "members")
    await toViewer(page)
    await release(page, "members")
    await expect(result(page)).toHaveText("この対象を閲覧する権限がありません。移動しませんでした。")
    await expect(result(page)).toHaveAttribute("data-kind", "rejected")
    await expect(revoked(page).getByTestId("perm-revoked-opened")).toHaveCount(0)
  })

  test("notification: with the permission kept, the list opens; it is hidden while the permission is re-checked", async ({ page }) => {
    await open(page)
    await readyRevoked(page)
    await revoked(page).getByTestId("perm-revoked-notification").getByRole("button", { name: "メンバーの一覧を開く" }).click()
    await expect(revoked(page).getByTestId("perm-revoked-opened")).toHaveText("メンバーの一覧（3 人）を表示しています（模擬）。")
    // 開いた一覧（保護された情報）は、最新の権限を確認している間は表示しない
    await hold(page, "access")
    await server(page, (s) => s.simulate.grant("u-sato:hq", "members.view"))
    await expect(revoked(page).getByTestId("perm-revoked")).toHaveAttribute("data-status", "refreshing")
    await expect(revoked(page).getByTestId("perm-revoked-opened")).toHaveCount(0)
    await waitHeld(page, "access")
    await release(page, "access")
    await expect(revoked(page).getByTestId("perm-revoked-opened")).toBeVisible()
  })

  test("save: pressed in the same task as the change notice does not send a save", async ({ page }) => {
    await open(page)
    const editor = demo(page, "edit").getByTestId("perm-editor")
    await expect(editor).toHaveAttribute("data-mode", "edit")
    await editor.getByLabel("備考").fill("権限を失う直前の入力")
    await expect(editor.getByRole("button", { name: "保存" })).toBeEnabled()
    const enabledWhenPressed = await server(page, (s) => {
      s.simulate.setRole("u-suzuki", "hq", "viewer")
      const button = document.querySelector<HTMLButtonElement>('[data-testid="perm-demo-edit"] [data-testid="perm-editor-save"]')!
      const enabled = !button.disabled && button.getAttribute("aria-disabled") !== "true"
      button.click()
      return enabled
    })
    expect(enabledWhenPressed).toBe(true)
    await expect(editor).toHaveAttribute("data-mode", "read-only")
    expect(await logOf(page, "save")).toHaveLength(0)
    await expect(editor.getByTestId("perm-editor-save-status")).toHaveAttribute("data-status", "idle")
  })
})

// ------------------------------------------------------------------ 権限を確認している間の保護された情報
test.describe("protected content while the latest authorization is unverified", () => {
  const editor = (page: Page) => demo(page, "edit").getByTestId("perm-editor")
  const note = (page: Page) => editor(page).getByLabel("備考")

  test("default (hide): the record is not shown while re-checking; the draft and the focus are kept", { tag: "@webkit" }, async ({ page }) => {
    await open(page)
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await note(page).fill("確認中も保持する入力")
    await note(page).focus()
    await hold(page, "access")
    // 権限の内容は変わらないが、変更の知らせが届いた（取得し直す）
    await server(page, (s) => s.simulate.grant("u-suzuki:hq", "customers.view"))
    await expect(editor(page)).toHaveAttribute("data-mode", "verifying")
    await expect(editor(page)).not.toContainText(firstCustomer.company)
    await expect(editor(page)).not.toContainText(firstCustomer.phone)
    await expect(editor(page).locator("textarea, input")).toHaveCount(0)
    await expect(editor(page).getByTestId("perm-editor-verifying")).toHaveText(
      "最新の権限を確認しています。確認できるまで、この顧客の内容を表示しません。入力中の内容は保持しています。",
    )
    // フォーカスしていた入力欄が消えたため、確認中の文へ移す
    await expect(editor(page).getByTestId("perm-editor-verifying").locator("p")).toBeFocused()
    await waitHeld(page, "access")
    await release(page, "access")
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await expect(note(page)).toHaveValue("確認中も保持する入力")
    await expect(note(page)).toBeFocused()
    await expect(editor(page).getByTestId("perm-editor-notice")).toHaveAttribute("data-notice", "none")
  })

  test("default (hide): a re-check that fails keeps hiding the record and offers a re-check", async ({ page }) => {
    await open(page)
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await server(page, (s) => (s.outcome.access = "fail"))
    await server(page, (s) => s.simulate.grant("u-suzuki:hq", "customers.view"))
    await expect(editor(page).getByTestId("perm-editor-verifying")).toContainText("最新の権限を確認できませんでした。確認できるまで、この顧客の内容を表示しません。")
    await expect(editor(page)).not.toContainText(firstCustomer.company)
    await server(page, (s) => (s.outcome.access = "success"))
    await editor(page).getByRole("button", { name: "権限を再確認" }).click()
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await expect(editor(page)).toContainText(firstCustomer.company)
  })

  test("keep (product policy): the record stays visible while re-checking, but saving is not allowed", async ({ page }) => {
    await open(page)
    await demo(page, "edit").getByRole("radio", { name: "前の権限で表示を続ける" }).check()
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await note(page).fill("表示を続ける")
    await hold(page, "access")
    await server(page, (s) => s.simulate.grant("u-suzuki:hq", "customers.view"))
    await expect(editor(page).locator("[data-slot=restriction-reason]")).toHaveText("最新の権限を確認しています")
    await expect(editor(page)).toHaveAttribute("data-mode", "edit")
    await expect(editor(page)).toContainText(firstCustomer.company)
    await expect(editor(page).getByRole("button", { name: "保存" })).toHaveAttribute("aria-disabled", "true")
    await waitHeld(page, "access")
    await release(page, "access")
    await expect(editor(page).getByRole("button", { name: "保存" })).toBeEnabled()
  })

  test("members in the overview are not shown while re-checking (protected); the customers section structure stays", async ({ page }) => {
    await open(page)
    const partial = demo(page, "partial")
    await partial.getByRole("radio", { name: /鈴木 一郎/ }).check()
    await expect(partial.getByTestId("perm-overview-members").getByRole("listitem")).toHaveCount(3)
    await hold(page, "access")
    await server(page, (s) => s.simulate.grant("u-suzuki:hq", "customers.view"))
    await expect(partial.getByTestId("perm-overview-members-pending")).toHaveAttribute("data-status", "refreshing")
    await expect(partial.getByTestId("perm-overview-members").getByRole("listitem")).toHaveCount(0)
    await expect(partial.getByRole("heading", { name: "顧客" })).toBeVisible()
    await waitHeld(page, "access")
    await release(page, "access")
    await expect(partial.getByTestId("perm-overview-members").getByRole("listitem")).toHaveCount(3)
  })
})

// ------------------------------------------------------------------ 権限の申請：最新の権限、照会
test.describe("permission request: latest authorization and inquiry", () => {
  const req = (page: Page, p: Permission) => demo(page, "request").getByTestId(`perm-request-${p}`)

  test("while the permissions are re-checked, a request cannot be sent (a granted permission is not requested again)", async ({ page }) => {
    await open(page)
    const button = req(page, "customers.delete").getByRole("button", { name: "「顧客を削除」の権限を申請" })
    await expect(button).toBeEnabled()
    await hold(page, "access")
    await hold(page, "requests")
    // 管理者が「顧客を削除」を付与した（知らせの後の権限の取得を保留している）
    await server(page, (s) => s.simulate.grant("u-tanaka:hq", "customers.delete"))
    // 申請の記録の取得し直しが終わった後も、権限を確認するまで申請を始めない
    await waitHeld(page, "requests")
    await release(page, "requests")
    await expect(button).toBeDisabled()
    await button.click({ force: true })
    expect(await logOf(page, "request")).toHaveLength(0)
    await waitHeld(page, "access")
    await release(page, "access")
    await expect(op(page, "request", "delete")).toHaveAttribute("data-mode", "enabled")
    await expect(req(page, "customers.delete")).toHaveCount(0)
    expect(await logOf(page, "request")).toHaveLength(0)
  })

  test("unknown result that was not created: the inquiry says so and the request can be sent again", async ({ page }) => {
    await open(page)
    await hold(page, "request")
    await req(page, "customers.edit").getByRole("button", { name: "「顧客を登録・編集」の権限を申請" }).click()
    await waitHeld(page, "request")
    await hold(page, "requests")
    // サーバーに届かなかったが、届いたかを確かめられない（結果が不明）
    await release(page, "request", { process: false })
    await expect(req(page, "customers.edit").getByTestId("perm-request-checking")).toHaveText("申請の状態を確認しています")
    await expect(req(page, "customers.edit").getByRole("button", { name: /申請/ })).toHaveCount(0)
    await waitHeld(page, "requests")
    await release(page, "requests")
    await expect(req(page, "customers.edit").getByRole("status")).toHaveText(
      "「顧客を登録・編集」の権限は申請されていませんでした。必要な場合は、もう一度申請してください。",
    )
    await expect(req(page, "customers.edit")).toHaveAttribute("data-request-status", "none")
    expect((await server(page, (s) => s.inspect().requests)).length).toBe(0)
    await hold(page, "request", false)
    await req(page, "customers.edit").getByRole("button", { name: "「顧客を登録・編集」の権限を申請" }).click()
    await expect(req(page, "customers.edit")).toHaveAttribute("data-request-status", "pending")
    expect((await server(page, (s) => s.inspect().requests)).length).toBe(1)
  })
})
