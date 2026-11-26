import { expect, test, type Locator, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"

// Patterns / System & Account / Onboarding の検品（資料のページ #/onboarding の例）。
// 模擬のサーバーは window.__fdSaOnboardingServer で設定する（応答の時間、結果、ignoreAbort、受け付けた要求、保存内容の写し）。
// 応答の順序に依存する検品は、固定の待ち時間ではなく、holdWhen（要求の保留）と releaseHeld（解放）で順序を決める。
// 期待値は資料（docs/web/patterns/onboarding.md）と model.ts の値から決める。画面の表示から期待値を作らない。
collectPageErrors(test)

type Server = NonNullable<Window["__fdSaOnboardingServer"]>
const server = <T,>(page: Page, fn: (s: Server) => T) =>
  page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdSaOnboardingServer), fn.toString()) as Promise<T>
const snapshot = (page: Page) => server(page, (s) => s.snapshot())

const checklistDemo = (page: Page) => page.getByTestId("onb-checklist-demo")
const setupDemo = (page: Page) => page.getByTestId("onb-setup-demo")
const invitedDemo = (page: Page) => page.getByTestId("onb-invited-demo")
const checklistIn = (root: Locator) => root.getByTestId("onb-checklist")
const item = (root: Locator, id: string) => checklistIn(root).locator(`[data-task-id="${id}"]`)
const viewer = (page: Page, name: string) => checklistDemo(page).getByRole("radio", { name, exact: true })
/** 保留している要求の数 */
const heldCount = (page: Page) => server(page, (s) => s.held.length)
const MUTATIONS = ["add-customer", "import", "invite", "billing", "avatar", "start-sample", "delete-sample"]

const SATO_NEW = "佐藤 花子・新しい組織（組織を作成した管理者）"
const SUZUKI_NEW = "鈴木 一郎・新しい組織（招待されたメンバー）"
const TANAKA_NEW = "田中 美咲・新しい組織（招待された閲覧者）"
const SATO_HQ = "佐藤 花子・本社営業部（利用中の組織）"

async function open(page: Page) {
  await page.goto("/#/onboarding")
  await expect(page.getByRole("heading", { level: 1, name: "Onboarding" })).toBeVisible()
  await server(page, (s) => {
    for (const k of Object.keys(s.latency) as (keyof typeof s.latency)[]) s.latency[k] = 40
  })
  // 最初の表示の取得（標準の 300ms）が終わるのを待つ
  await expect(checklistIn(checklistDemo(page))).toBeVisible()
}

const remount = (page: Page) => checklistDemo(page).getByTestId("onb-remount").click()

async function registerCustomer(root: Locator, name: string) {
  await root.getByTestId("onb-create").click()
  const sheet = root.page().getByTestId("onb-create-sheet")
  await sheet.getByTestId("onb-create-name").fill(name)
  await sheet.getByRole("button", { name: /^(登録する|サンプルに追加)$/ }).click()
  await expect(sheet).toBeHidden()
}

// ------------------------------------------------------------------ 資料のページ
test.describe("Onboarding page", { tag: "@webkit" }, () => {
  test("one h1, named controls, no horizontal page scroll, inert comparison mocks", async ({ page }) => {
    await page.goto("/#/onboarding")
    await expect(page.locator("h1")).toHaveCount(1)
    await expect(checklistIn(checklistDemo(page))).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const controls = page.locator("main").first().getByRole("button").or(page.locator("main").first().getByRole("link"))
    const n = await controls.count()
    expect(n).toBeGreaterThan(10)
    for (let i = 0; i < n; i++) {
      const c = controls.nth(i)
      if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
    }
    const mocks = await page.locator("figure [inert]").all()
    expect(mocks.length).toBeGreaterThanOrEqual(8)
    for (const mock of mocks) expect(await mock.evaluate((el) => (el as HTMLElement).inert)).toBe(true)
  })

  test("320px: no horizontal page scroll with the checklist, the wizard and the sample banner", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    await page.setViewportSize({ width: 320, height: 900 })
    await open(page)
    await checklistDemo(page).getByRole("button", { name: "サンプルデータで試す" }).click()
    await expect(checklistDemo(page).getByTestId("onb-sample-banner")).toBeVisible()
    await setupDemo(page).getByTestId("onb-setup-name").fill("とても長い名前の株式会社サンプル営業本部第一営業部")
    await setupDemo(page).getByRole("button", { name: "次へ" }).click()
    await expect(setupDemo(page).getByTestId("onb-setup")).toHaveAttribute("data-step", "invite")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

// ------------------------------------------------------------------ 最初の画面
test.describe("Onboarding: first screen", () => {
  test("a member goes straight to the product; only meaningful screens are inserted", async ({ page }) => {
    await page.goto("/#/onboarding")
    const demo = page.getByTestId("onb-first")
    const result = demo.getByTestId("onb-first-screen")
    await expect(result).toHaveAttribute("data-screen", "product")
    await demo.getByRole("radio", { name: "新規登録した（所属する組織がない）" }).check()
    await expect(result).toHaveAttribute("data-screen", "create-workspace")
    await demo.getByRole("radio", { name: "招待のリンクから来た" }).check()
    await expect(result).toHaveAttribute("data-screen", "accept-invitation")
    await demo.getByRole("radio", { name: "組織のポリシーで多要素認証が必須で、まだ設定していない" }).check()
    await expect(result).toHaveAttribute("data-screen", "required-setup")
  })
})

// ------------------------------------------------------------------ 組織の作成
test.describe("Onboarding: create organization", () => {
  test("required vs optional, validation, back keeps the input, focus moves to the step heading", async ({ page }) => {
    await open(page)
    const demo = setupDemo(page)
    const setup = demo.getByTestId("onb-setup")
    await expect(demo.getByTestId("onb-setup-position")).toHaveText("手順 1 / 3・必須")
    await expect(demo.getByTestId("onb-setup-status")).toHaveAttribute("data-status", "not-started")
    await demo.getByRole("button", { name: "次へ" }).click()
    await expect(demo.getByText("組織名を入力してください")).toBeVisible()
    await expect(setup).toHaveAttribute("data-step", "org")
    await demo.getByTestId("onb-setup-name").fill("株式会社テスト")
    await demo.getByRole("button", { name: "次へ" }).click()
    await expect(setup).toHaveAttribute("data-step", "invite")
    await expect(demo.getByTestId("onb-setup-position")).toHaveText("手順 2 / 3・任意")
    await expect(demo.getByRole("heading", { name: "メンバーを招待" })).toBeFocused()
    await expect(demo.getByTestId("onb-setup-status")).toHaveAttribute("data-status", "in-progress")
    await demo.getByTestId("onb-setup-invites").fill("a@example.com")
    await demo.getByRole("button", { name: "戻る" }).click()
    await expect(demo.getByRole("heading", { name: "組織を作成" })).toBeFocused()
    await expect(demo.getByTestId("onb-setup-name")).toHaveValue("株式会社テスト")
    await demo.getByRole("button", { name: "次へ" }).click()
    await expect(demo.getByTestId("onb-setup-invites")).toHaveValue("a@example.com")
    // 形式の誤り
    await demo.getByTestId("onb-setup-invites").fill("a@example.com, not-an-email")
    await demo.getByRole("button", { name: "次へ" }).click()
    await expect(demo.getByText("「not-an-email」はメールアドレスの形式ではありません")).toBeVisible()
    await expect(setup).toHaveAttribute("data-step", "invite")
  })

  test("skip an optional step: no invitation is sent and the task stays in the checklist; no success screen", async ({ page }) => {
    await open(page)
    const demo = setupDemo(page)
    await demo.getByTestId("onb-setup-name").fill("スキップの組織")
    await demo.getByRole("button", { name: "次へ" }).click()
    await demo.getByTestId("onb-setup-invites").fill("x@example.com")
    await demo.getByRole("button", { name: "スキップ" }).click()
    await expect(demo.getByTestId("onb-setup")).toHaveAttribute("data-step", "data")
    await demo.getByTestId("onb-setup-create").click()
    // 成功の画面を挟まずに、製品の利用画面（顧客の一覧）へ移る
    const product = demo.getByTestId("onb-product")
    await expect(product).toBeVisible()
    await expect(product.getByTestId("onb-customers")).toBeVisible()
    await expect(demo.getByText(/作成しました/)).toHaveCount(0)
    const snap = await snapshot(page)
    const id = Object.values(snap.created)[0]
    expect(snap.workspaces[id].name).toBe("スキップの組織")
    expect(snap.workspaces[id].invitations).toEqual([])
    // スキップした任意の手順と、変更しなかったデータの始め方は初期値（招待なし、サンプルなし）
    expect(snap.workspaces[id].sample).toBeNull()
    expect(snap.sent).toEqual([])
    await expect(item(product, "invite-members")).not.toHaveAttribute("data-done", "true")
    await expect(item(product, "invite-members")).toBeVisible()
  })

  test("branch: solo usage removes the invitation step and its input is not sent", async ({ page }) => {
    await open(page)
    const demo = setupDemo(page)
    await demo.getByTestId("onb-setup-name").fill("一人の組織")
    await demo.getByRole("button", { name: "次へ" }).click()
    await demo.getByTestId("onb-setup-invites").fill("y@example.com")
    await demo.getByRole("button", { name: "次へ" }).click()
    await demo.getByRole("button", { name: "戻る" }).click()
    await demo.getByRole("button", { name: "戻る" }).click()
    await demo.getByRole("radio", { name: "自分だけで使う" }).check()
    await expect(demo.getByTestId("onb-setup-position")).toHaveText("手順 1 / 2・必須")
    await demo.getByRole("button", { name: "次へ" }).click()
    await expect(demo.getByTestId("onb-setup")).toHaveAttribute("data-step", "data")
    await expect(demo.getByTestId("onb-setup-position")).toHaveText("手順 2 / 2・任意")
    await demo.getByTestId("onb-setup-create").click()
    await expect(demo.getByTestId("onb-product")).toBeVisible()
    const snap = await snapshot(page)
    expect(snap.workspaces[Object.values(snap.created)[0]].invitations).toEqual([])
    expect(snap.sent).toEqual([])
  })

  test("interrupt and resume: closing keeps the draft on the server; reopening resumes at the saved step", async ({ page }) => {
    await open(page)
    const demo = setupDemo(page)
    await demo.getByTestId("onb-setup-name").fill("再開の組織")
    await demo.getByRole("button", { name: "次へ" }).click()
    await expect(demo.getByTestId("onb-setup")).toHaveAttribute("data-step", "invite")
    await expect.poll(async () => (await snapshot(page)).drafts["u-sato"]?.step).toBe("invite")
    await demo.getByTestId("onb-setup-close").click()
    await expect(demo.getByTestId("onb-setup-status")).toHaveAttribute("data-status", "interrupted")
    await expect(demo.getByTestId("onb-setup")).toHaveCount(0)
    await demo.getByTestId("onb-setup-open").click()
    await expect(demo.getByTestId("onb-setup")).toHaveAttribute("data-step", "invite")
    await expect(demo.getByTestId("onb-setup-resumed")).toBeVisible()
    await expect(demo.getByTestId("onb-setup-status")).toHaveAttribute("data-status", "in-progress")
    await demo.getByRole("button", { name: "戻る" }).click()
    await expect(demo.getByTestId("onb-setup-name")).toHaveValue("再開の組織")
  })

  test("failure keeps the input; an unknown result is confirmed before retrying and never creates twice", async ({ page }) => {
    await open(page)
    const demo = setupDemo(page)
    await demo.getByTestId("onb-setup-name").fill("結果の組織")
    await demo.getByRole("button", { name: "次へ" }).click()
    await demo.getByRole("button", { name: "スキップ" }).click()
    await demo.getByRole("radio", { name: "失敗", exact: true }).check()
    await demo.getByTestId("onb-setup-create").click()
    await expect(demo.getByTestId("onb-setup-error")).toHaveAttribute("role", "alert")
    expect(Object.keys((await snapshot(page)).created)).toHaveLength(0)
    await demo.getByRole("radio", { name: "結果が不明（作成はされる）" }).check()
    // 応答を保留して、作成の要求が処理中の間に二重に押す。要求は 1 回だけ（失敗した 1 回目と合わせて 2 回）
    await server(page, (s) => (s.holdWhen = (r) => r.kind === "create-workspace"))
    await demo.getByTestId("onb-setup-create").dblclick()
    await expect.poll(() => heldCount(page)).toBe(1)
    expect((await server(page, (s) => s.requests)).filter((r) => r.kind === "create-workspace")).toHaveLength(2)
    await server(page, (s) => {
      s.holdWhen = null
      return s.releaseHeld()
    })
    await expect(demo.getByTestId("onb-setup-unknown")).toBeVisible()
    expect((await server(page, (s) => s.requests)).filter((r) => r.kind === "create-workspace")).toHaveLength(2)
    // 結果が不明な間は、もう一度作成するボタンを押せない（確かめてから）
    await expect(demo.getByTestId("onb-setup-create")).toBeDisabled()
    expect(Object.keys((await snapshot(page)).created)).toHaveLength(1)
    await demo.getByRole("button", { name: "作成されたかを確認する" }).click()
    await expect(demo.getByTestId("onb-product")).toBeVisible()
    expect(Object.keys((await snapshot(page)).created)).toHaveLength(1)
  })

  test("a response after unmount is not applied (AbortSignal ignored)", async ({ page }) => {
    await open(page)
    const demo = setupDemo(page)
    await server(page, (s) => {
      s.ignoreAbort = true
      s.holdWhen = (r) => r.kind === "create-workspace"
    })
    await demo.getByTestId("onb-setup-name").fill("閉じた後の組織")
    await demo.getByRole("button", { name: "次へ" }).click()
    await demo.getByRole("button", { name: "スキップ" }).click()
    await demo.getByTestId("onb-setup-create").click()
    await expect.poll(() => heldCount(page)).toBe(1)
    // 応答が届く前に画面を閉じる（アンマウント）。その後で応答を解放する
    await demo.getByTestId("onb-setup-close").click()
    await expect(demo.getByTestId("onb-setup")).toHaveCount(0)
    expect(await server(page, (s) => s.releaseHeld())).toBe(1)
    // サーバーでは作成された（応答は成功）が、閉じた画面の結果として利用画面へ移らない
    expect(Object.keys((await snapshot(page)).created)).toHaveLength(1)
    await expect(demo.getByTestId("onb-product")).toHaveCount(0)
    await expect(demo.getByTestId("onb-setup-open")).toBeVisible()
  })
})

// ------------------------------------------------------------------ Getting Started Checklist
test.describe("Onboarding: checklist", () => {
  test("completion comes from the actual result, not from pressing the task button", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    const list = checklistIn(demo)
    // 佐藤 花子のプロフィールの写真は設定済み（アカウント単位）。新しい組織の作業は未完了。
    await expect(list.getByText("5 件中 1 件完了")).toBeVisible()
    await expect(item(demo, "complete-profile")).toHaveAttribute("data-done", "true")
    // 作業のボタンを押して登録の Sheet を開き、登録せずに閉じる → 完了にならない
    await item(demo, "first-customer").getByRole("button", { name: "顧客を登録" }).click()
    const sheet = page.getByTestId("onb-create-sheet")
    await expect(sheet).toBeVisible()
    await sheet.getByRole("button", { name: "キャンセル" }).click()
    await expect(sheet).toBeHidden()
    await item(demo, "set-billing").getByRole("button", { name: "支払いの画面へ" }).click()
    await expect(demo.getByTestId("onb-billing")).toBeVisible()
    // 作業のボタンと Sheet の開閉では、変更の要求を送らない（完了の元になる作業結果は変わらない）
    expect((await server(page, (s) => s.requests)).filter((r) => MUTATIONS.includes(r.kind))).toEqual([])
    await expect(item(demo, "first-customer")).not.toHaveAttribute("data-done", "true")
    await expect(item(demo, "set-billing")).not.toHaveAttribute("data-done", "true")
    await expect(list.getByText("5 件中 1 件完了")).toBeVisible()
    // 実際に登録すると完了になり、読み上げの領域で伝える
    await demo.getByRole("button", { name: "顧客", exact: true }).click()
    await registerCustomer(demo, "青空商事株式会社")
    await expect(item(demo, "first-customer")).toHaveAttribute("data-done", "true")
    await expect(list.getByText("5 件中 2 件完了")).toBeVisible()
    await expect(list.getByRole("status")).toHaveText("「最初の顧客を登録する」が完了しました。5 件中 2 件が完了しています")
    expect((await snapshot(page)).workspaces.new.real.map((c) => c.company)).toEqual(["青空商事株式会社"])
  })

  test("collapse, hide and reopen are saved on the server and survive a remount; hidden is not completed", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    const list = checklistIn(demo)
    const collapse = list.getByRole("button", { name: "折りたたむ" })
    await expect(collapse).toHaveAttribute("aria-expanded", "true")
    await collapse.press("Enter")
    const expand = list.getByRole("button", { name: "作業を表示" })
    await expect(expand).toHaveAttribute("aria-expanded", "false")
    await expect(expand).toBeFocused()
    await expect(list.locator("[data-task-id]")).toHaveCount(0)
    await expect.poll(async () => (await snapshot(page)).visibility["u-sato:new"]).toBe("collapsed")
    await remount(page)
    await expect(checklistIn(demo).getByRole("button", { name: "作業を表示" })).toBeVisible()
    // 非表示：再表示の入口にフォーカスが移り、必須の作業の案内が残る
    await checklistIn(demo).getByRole("button", { name: "非表示にする" }).click()
    await expect(checklistIn(demo)).toHaveCount(0)
    const reopen = demo.getByTestId("onb-checklist-reopen")
    await expect(reopen).toBeFocused()
    await expect(demo.getByTestId("onb-required-notice")).toContainText("支払い方法を登録する")
    await expect(demo.getByTestId("onb-checklist-state")).toContainText("進捗：進行中（5 件中 1 件）")
    await expect(demo.getByTestId("onb-checklist-state")).toContainText("必須の作業：未完了")
    await expect.poll(async () => (await snapshot(page)).visibility["u-sato:new"]).toBe("hidden")
    await remount(page)
    await expect(demo.getByTestId("onb-checklist-reopen")).toBeVisible()
    await expect(checklistIn(demo)).toHaveCount(0)
    await demo.getByTestId("onb-checklist-reopen").click()
    await expect(checklistIn(demo)).toBeFocused()
    await expect(item(demo, "first-customer")).toBeVisible()
  })

  test("a failed save of the display state restores the saved state and says so", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await server(page, (s) => (s.outcomeNext["save-visibility"] = "fail"))
    await checklistIn(demo).getByRole("button", { name: "非表示にする" }).click()
    await expect(checklistIn(demo)).toBeVisible()
    await expect(demo.getByTestId("onb-checklist-notice")).toHaveText("表示の状態を保存できませんでした。もう一度お試しください。")
    expect((await snapshot(page)).visibility["u-sato:new"]).toBeUndefined()
  })

  test("after all tasks are done: a short completion, closable, not shown again", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await registerCustomer(demo, "株式会社みどり")
    await item(demo, "import-customers").getByRole("button", { name: "取り込みの画面へ" }).click()
    await demo.getByRole("button", { name: "模擬の CSV ファイルを取り込む" }).click()
    await expect(demo.getByTestId("onb-import-result")).toHaveText("3 件を取り込みました。")
    await item(demo, "invite-members").getByRole("button", { name: "メンバーの画面へ" }).click()
    await demo.getByTestId("onb-invite-email").fill("new.member@example.com")
    await demo.getByRole("button", { name: "招待を送る" }).click()
    await expect(item(demo, "invite-members")).toHaveAttribute("data-done", "true")
    await item(demo, "set-billing").getByRole("button", { name: "支払いの画面へ" }).click()
    await demo.getByRole("button", { name: "模擬の支払い方法を登録する" }).click()
    const list = checklistIn(demo)
    await expect(list).toHaveAttribute("data-presentation", "completed")
    await expect(list.getByRole("heading", { name: "利用開始の準備が完了しました" })).toBeVisible()
    await expect(list.getByRole("status")).toHaveText("すべての作業が完了しました（5 件）")
    await expect(demo.getByTestId("onb-checklist-state")).toContainText("必須の作業：完了")
    await list.getByRole("button", { name: "閉じる" }).click()
    await expect(checklistIn(demo)).toHaveCount(0)
    await expect(demo.getByTestId("onb-required-notice")).toHaveCount(0)
    await remount(page)
    await expect(demo.getByTestId("onb-checklist-reopen")).toBeVisible()
    await expect(checklistIn(demo)).toHaveCount(0)
  })

  test("admin vs invited member vs viewer: tasks without permission are excluded", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    const taskIds = () => checklistIn(demo).locator("[data-task-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-task-id")).sort())
    expect(await taskIds()).toEqual(["complete-profile", "first-customer", "import-customers", "invite-members", "set-billing"])
    await viewer(page, SUZUKI_NEW).check()
    await expect(checklistIn(demo).getByText("3 件中 0 件完了")).toBeVisible()
    expect(await taskIds()).toEqual(["complete-profile", "first-customer", "import-customers"])
    await expect(demo.getByRole("navigation").getByRole("button", { name: "支払い" })).toHaveCount(0)
    // 閲覧者：作業は 1 件だけなので Checklist を使わない。登録の操作も置かない
    await viewer(page, TANAKA_NEW).check()
    await expect(demo.getByTestId("onb-checklist-state")).toContainText("Checklist を使わない")
    await expect(checklistIn(demo)).toHaveCount(0)
    await expect(demo.getByTestId("onb-empty")).toBeVisible()
    await expect(demo.getByTestId("onb-create")).toHaveCount(0)
    await expect(demo.getByTestId("onb-empty").getByRole("button")).toHaveCount(0)
  })

  test("account and workspace progress are separate; invited members are not asked again for done workspace tasks", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await registerCustomer(demo, "株式会社あさひ")
    await expect(item(demo, "first-customer")).toHaveAttribute("data-done", "true")
    await viewer(page, SUZUKI_NEW).check()
    // 組織で完了した作業は示さず、鈴木 一郎のアカウント単位の作業（プロフィール）は未完了のまま
    await expect(checklistIn(demo).getByText("2 件中 0 件完了")).toBeVisible()
    await expect(item(demo, "first-customer")).toHaveCount(0)
    await expect(item(demo, "complete-profile")).not.toHaveAttribute("data-done", "true")
    await item(demo, "complete-profile").getByRole("button", { name: "プロフィールへ" }).click()
    await demo.getByRole("button", { name: "模擬の写真を設定する" }).click()
    await expect(item(demo, "complete-profile")).toHaveAttribute("data-done", "true")
    // 本社営業部の佐藤 花子の状態は変わらない（非表示のまま）
    await viewer(page, SATO_HQ).check()
    await expect(demo.getByTestId("onb-checklist-reopen")).toBeVisible()
    const snap = await snapshot(page)
    expect(snap.avatars).toEqual({ "u-sato": true, "u-suzuki": true, "u-tanaka": false })
    expect(snap.workspaces.hq.real).toHaveLength(580)
  })

  test("switching users A→B→A with slow responses shows only A, never B, and nothing of A while B loads", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    // B（鈴木 一郎）の要求を保留する。AbortSignal に従わない API の代わりに、中止された後も応答を返す
    await server(page, (s) => {
      s.ignoreAbort = true
      s.holdWhen = (r) => r.userId === "u-suzuki"
    })
    await viewer(page, SUZUKI_NEW).check()
    // B の取得中は、A の Checklist を表示しない
    await expect(checklistIn(demo)).toHaveCount(0)
    await expect(demo.getByTestId("onb-product")).toHaveAttribute("data-scope", /^u-suzuki:new:/)
    await expect.poll(() => heldCount(page)).toBeGreaterThanOrEqual(2)
    await viewer(page, SATO_NEW).check()
    await expect(checklistIn(demo).getByText("5 件中 1 件完了")).toBeVisible()
    // A に戻った後で、B の古い応答を解放する
    expect(await server(page, (s) => s.releaseHeld())).toBeGreaterThanOrEqual(2)
    await expect(demo.getByTestId("onb-product")).toHaveAttribute("data-scope", /^u-sato:new:/)
    await expect(checklistIn(demo).getByText("5 件中 1 件完了")).toBeVisible()
    expect(await checklistIn(demo).locator("[data-task-id]").count()).toBe(5)
    // 切り替えでは完了を読み上げない
    await expect(checklistIn(demo).getByRole("status")).toHaveText("")
  })

  test("excluding a required task for lack of permission does not meet the requirement", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    const others = demo.getByTestId("onb-required-others-notice")
    const state = demo.getByTestId("onb-checklist-state")
    // 管理者は Checklist の作業として示す（ほかの利用者が行う作業の案内はない）
    await expect(item(demo, "set-billing")).toBeVisible()
    await expect(others).toHaveCount(0)
    // メンバー：支払いの作業は表示しないが、必須の条件は未達成のまま
    await viewer(page, SUZUKI_NEW).check()
    await expect(checklistIn(demo).getByText("3 件中 0 件完了")).toBeVisible()
    await expect(item(demo, "set-billing")).toHaveCount(0)
    await expect(state).toContainText("必須の作業：未完了（権限のある管理者が行う）")
    await expect(others).toContainText("支払い方法を登録するが完了していません")
    await expect(others.getByRole("button")).toHaveCount(0)
    // 閲覧者：Checklist を使わない場合も、必須の条件は達成にならない
    await viewer(page, TANAKA_NEW).check()
    await expect(state).toContainText("Checklist を使わない")
    await expect(state).toContainText("必須の作業：未完了（権限のある管理者が行う）")
    await expect(others).toBeVisible()
    // 管理者が実際に登録すると、メンバーにも達成として示す
    await viewer(page, SATO_NEW).check()
    await item(demo, "set-billing").getByRole("button", { name: "支払いの画面へ" }).click()
    await demo.getByRole("button", { name: "模擬の支払い方法を登録する" }).click()
    await expect(item(demo, "set-billing")).toHaveAttribute("data-done", "true")
    await viewer(page, SUZUKI_NEW).check()
    await expect(checklistIn(demo).getByText("3 件中 0 件完了")).toBeVisible()
    await expect(state).toContainText("必須の作業：完了")
    await expect(others).toHaveCount(0)
  })

  test("a registration sheet opened for one viewer is not reused after switching viewers (A → B → A)", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    const sheet = page.getByTestId("onb-create-sheet")
    // Sheet はモーダルのため、利用者の切り替え（通知や別の画面からのスコープの変更の代わり）は DOM の操作で行う
    const switchTo = (name: string) =>
      checklistDemo(page).getByRole("radio", { name, exact: true, includeHidden: true }).evaluate((el) => (el as HTMLInputElement).click())
    await demo.getByTestId("onb-create").click()
    await sheet.getByTestId("onb-create-name").fill("前の利用者の入力")
    await switchTo(SUZUKI_NEW)
    await expect(demo.getByTestId("onb-product")).toHaveAttribute("data-scope", /^u-suzuki:new:/)
    await expect(sheet).toBeHidden()
    await switchTo(SATO_NEW)
    await expect(demo.getByTestId("onb-product")).toHaveAttribute("data-scope", /^u-sato:new:/)
    await expect(checklistIn(demo).getByText("5 件中 1 件完了")).toBeVisible()
    // 最初の A で開いた Sheet を、戻った A で開き直さない。開き直すと入力は空
    await expect(sheet).toBeHidden()
    await demo.getByTestId("onb-create").click()
    await expect(sheet.getByTestId("onb-create-name")).toHaveValue("")
    expect((await server(page, (s) => s.requests)).filter((r) => r.kind === "add-customer")).toEqual([])
  })

  // 実行中の状態は、操作を始めたスコープの世代（Ticket）と組で持つ。scopeKey の文字列だけで持つと、A → B → A の最初の A の操作が
  // 戻った A で「実行中」のまま残り（その応答は最初の A の世代のため反映せず、記録も消さない）、操作できなくなる。
  test("an action started in A, then A → B → A: the first A's action does not stay in progress in the current A", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await demo.getByRole("button", { name: "サンプルデータで試す" }).click()
    await expect(demo.getByTestId("onb-sample-banner")).toBeVisible()
    await server(page, (s) => (s.holdWhen = (r) => r.kind === "delete-sample"))
    const remove = demo.getByRole("button", { name: "サンプルを削除" })
    await remove.click()
    await expect.poll(() => heldCount(page)).toBe(1)
    await expect(remove).toHaveAttribute("data-loading", "true")
    await viewer(page, SUZUKI_NEW).check()
    await expect(demo.getByTestId("onb-product")).toHaveAttribute("data-scope", /^u-suzuki:new:/)
    await viewer(page, SATO_NEW).check()
    await expect(demo.getByTestId("onb-product")).toHaveAttribute("data-scope", /^u-sato:new:/)
    // 戻った A は、最初の A の操作を実行中として示さない
    await expect(demo.getByTestId("onb-sample-banner")).toBeVisible()
    await expect(remove).not.toHaveAttribute("data-loading")
    // 最初の A の応答を解放しても、実行中にならず、結果を示さない
    expect(await server(page, (s) => s.releaseHeld())).toBe(1)
    await expect(remove).not.toHaveAttribute("data-loading")
    await expect(demo.getByTestId("onb-customers-result")).toHaveText("")
    // もう一度操作できる
    await server(page, (s) => (s.holdWhen = null))
    await remove.click()
    await expect(demo.getByTestId("onb-customers")).toHaveAttribute("data-space", "real")
    expect((await server(page, (s) => s.requests)).filter((r) => r.kind === "delete-sample")).toHaveLength(2)
    expect((await snapshot(page)).workspaces.new.sample).toBeNull()
  })
})

// ------------------------------------------------------------------ Empty State、Contextual Help、サンプルデータ
test.describe("Onboarding: empty state, help and sample data", () => {
  test("first-use empty state: what, first step and where; no duplicate of the header action; distinct from no results and error", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    const empty = demo.getByTestId("onb-empty")
    await expect(empty).toHaveAttribute("data-view", "empty")
    await expect(empty.getByText("顧客はまだ登録されていません")).toBeVisible()
    await expect(empty).toContainText("ページの上部の「顧客を登録」")
    await expect(empty.getByRole("button", { name: "顧客を登録" })).toHaveCount(0)
    await expect(empty.getByRole("button", { name: "CSV から取り込む" })).toBeVisible()
    await expect(demo.getByTestId("onb-search")).toHaveCount(0)
    // Empty State を表示している間は Contextual Help を出さない
    await expect(demo.getByTestId("onb-help-search")).toHaveCount(0)
    await registerCustomer(demo, "株式会社ひかり")
    await demo.getByTestId("onb-search").fill("存在しない会社")
    await expect(demo.getByTestId("onb-empty")).toHaveAttribute("data-view", "no-results")
    await expect(demo.getByText("条件に一致する顧客はいません")).toBeVisible()
    await demo.getByRole("button", { name: "検索をクリア" }).click()
    await expect(demo.getByTestId("onb-search")).toBeFocused()
    await expect(demo.getByTestId("onb-list")).toHaveAttribute("data-view", "ready")
    // 取得失敗は Empty にしない
    await server(page, (s) => (s.outcome.customers = "fail"))
    await remount(page)
    await expect(demo.getByTestId("onb-list-error")).toBeVisible()
    await expect(demo.getByTestId("onb-empty")).toHaveCount(0)
    await server(page, (s) => (s.outcome.customers = "success"))
    await demo.getByTestId("onb-list-error").getByRole("button", { name: "再試行" }).click()
    await expect(demo.getByTestId("onb-list")).toHaveAttribute("data-view", "ready")
  })

  test("contextual help can be dismissed, focus moves to the search field, and it stays dismissed after a remount", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await viewer(page, SATO_HQ).check()
    const help = demo.getByTestId("onb-help-search")
    await expect(help).toBeVisible()
    await expect(help).toHaveAttribute("role", "note")
    await help.getByRole("button", { name: "この案内を閉じる" }).focus()
    await page.keyboard.press("Enter")
    await expect(help).toHaveCount(0)
    await expect(demo.getByTestId("onb-search")).toBeFocused()
    await expect.poll(async () => (await snapshot(page)).dismissedHelp["u-sato"]).toEqual(["customers-search"])
    await remount(page)
    await expect(demo.getByTestId("onb-list")).toHaveAttribute("data-view", "ready")
    // 閉じた案内の取得が終わった後も表示しない
    await expect(demo.getByTestId("onb-product")).toHaveAttribute("data-help", "ready")
    await expect(demo.getByTestId("onb-help-search")).toHaveCount(0)
  })

  test("the dismissed state of contextual help belongs to the account: kept across workspaces, not shared with other accounts", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await viewer(page, SATO_HQ).check()
    const help = demo.getByTestId("onb-help-search")
    await help.getByRole("button", { name: "この案内を閉じる" }).click()
    await expect(help).toHaveCount(0)
    await expect.poll(async () => (await snapshot(page)).dismissedHelp["u-sato"]).toEqual(["customers-search"])
    // 同じ利用者で別の組織へ切り替え、案内の表示の条件（顧客が 1 件以上）を満たしても、表示しない
    await viewer(page, SATO_NEW).check()
    await registerCustomer(demo, "株式会社つぎ")
    await expect(demo.getByTestId("onb-list")).toHaveAttribute("data-view", "ready")
    await expect(demo.getByTestId("onb-product")).toHaveAttribute("data-help", "ready")
    await expect(demo.getByTestId("onb-help-search")).toHaveCount(0)
    // 別の利用者（同じ組織）は閉じていないため、表示する
    await viewer(page, SUZUKI_NEW).check()
    await expect(demo.getByTestId("onb-help-search")).toBeVisible()
    expect((await snapshot(page)).dismissedHelp["u-suzuki"]).toEqual([])
  })

  test("sample data: explicit, always identified, separate from real data, easy to leave and delete", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await demo.getByRole("button", { name: "サンプルデータで試す" }).click()
    await expect(demo.getByTestId("onb-sample-banner")).toBeVisible()
    await expect(demo.getByTestId("onb-customers")).toHaveAttribute("data-space", "sample")
    await expect(demo.getByTestId("onb-customers-count")).toHaveText("サンプル 4 件")
    await expect(demo.getByTestId("onb-list").getByText("サンプル", { exact: true })).toHaveCount(4)
    await registerCustomer(demo, "サンプルに追加した会社")
    await expect(demo.getByTestId("onb-customers-count")).toHaveText("サンプル 5 件")
    let snap = await snapshot(page)
    expect(snap.workspaces.new.real).toHaveLength(0)
    expect(snap.workspaces.new.sample).toHaveLength(5)
    expect(snap.sent).toEqual([])
    expect((await server(page, (s) => s.requests)).filter((r) => r.kind === "add-customer").map((r) => r.space)).toEqual(["sample"])
    // サンプルへの登録は、利用開始の準備を完了にしない
    await expect(item(demo, "first-customer")).not.toHaveAttribute("data-done", "true")
    await demo.getByRole("button", { name: "実際のデータに戻る" }).click()
    await expect(demo.getByTestId("onb-empty")).toHaveAttribute("data-view", "empty")
    await demo.getByRole("button", { name: "サンプルを表示" }).click()
    await demo.getByRole("button", { name: "サンプルを削除" }).click()
    await expect(demo.getByTestId("onb-customers")).toHaveAttribute("data-space", "real")
    await expect(demo.getByRole("button", { name: "サンプルを表示" })).toHaveCount(0)
    snap = await snapshot(page)
    expect(snap.workspaces.new.sample).toBeNull()
    expect(snap.workspaces.new.real).toHaveLength(0)
  })

  test("sample data is not counted for billing; other screens always work on real data", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    const nav = demo.getByRole("navigation", { name: "製品の画面（例）" })
    const usage = demo.getByTestId("onb-billing-usage")
    await demo.getByRole("button", { name: "サンプルデータで試す" }).click()
    await expect(demo.getByTestId("onb-sample-banner")).toContainText("請求")
    await registerCustomer(demo, "サンプルの会社")
    await nav.getByRole("button", { name: "支払い", exact: true }).click()
    await expect(usage).toHaveText("請求の対象の顧客（模擬）：0 件。サンプルの顧客は含めません。")
    // 作業の画面から顧客の画面へ戻ると、実際のデータを表示する（サンプルの表示を続けない）
    await nav.getByRole("button", { name: "顧客", exact: true }).click()
    await expect(demo.getByTestId("onb-customers")).toHaveAttribute("data-space", "real")
    await registerCustomer(demo, "株式会社ほんもの")
    await nav.getByRole("button", { name: "支払い", exact: true }).click()
    await expect(usage).toHaveText("請求の対象の顧客（模擬）：1 件。サンプルの顧客は含めません。")
    const snap = await snapshot(page)
    expect(snap.workspaces.new.real.map((c) => c.company)).toEqual(["株式会社ほんもの"])
    expect(snap.workspaces.new.sample?.map((c) => c.company)).toContain("サンプルの会社")
    expect(snap.sent).toEqual([])
  })
})

// ------------------------------------------------------------------ 結果が不明な操作
test.describe("Onboarding: an unknown result is confirmed, not repeated", () => {
  const UNKNOWN = "結果を確認できませんでした。もう一度行う前に、処理されたかを確認してください。"

  test("import: processed on the server; the same import cannot be pressed again; confirming shows it once", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await item(demo, "import-customers").getByRole("button", { name: "取り込みの画面へ" }).click()
    await server(page, (s) => (s.outcomeNext.import = "unknown"))
    await demo.getByTestId("onb-import-run").click()
    await expect(demo.getByTestId("onb-import-result")).toHaveText(UNKNOWN)
    await expect(demo.getByTestId("onb-import-result")).toHaveAttribute("data-kind", "unknown")
    // 同じ取り込みのボタンを置かず、確認の操作だけを置く
    await expect(demo.getByTestId("onb-import-run")).toHaveCount(0)
    await demo.getByTestId("onb-import-run-confirm").dblclick()
    await expect(demo.getByTestId("onb-import-result")).toHaveText("処理されていました。3 件を取り込みました。")
    await expect(item(demo, "import-customers")).toHaveAttribute("data-done", "true")
    const snap = await snapshot(page)
    expect(snap.workspaces.new.real).toHaveLength(3)
    expect(snap.workspaces.new.imports).toBe(1)
    const requests = await server(page, (s) => s.requests)
    expect(requests.filter((r) => r.kind === "import")).toHaveLength(1)
    expect(requests.filter((r) => r.kind === "find-request")).toHaveLength(1)
    await expect(demo.getByTestId("onb-import-run")).toBeVisible()
  })

  test("invitation: not processed; confirming (also with Enter) allows sending again, and it is sent once", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await item(demo, "invite-members").getByRole("button", { name: "メンバーの画面へ" }).click()
    await demo.getByTestId("onb-invite-email").fill("once@example.com")
    await server(page, (s) => (s.dropNext.invite = true))
    await demo.getByTestId("onb-invite-submit").click()
    await expect(demo.getByTestId("onb-invite-result")).toHaveText(UNKNOWN)
    await expect(demo.getByTestId("onb-invite-submit")).toHaveCount(0)
    // Enter で送信しても、もう一度送らずに確認する
    await demo.getByTestId("onb-invite-email").press("Enter")
    await expect(demo.getByTestId("onb-invite-result")).toHaveText("処理されていませんでした。もう一度行えます。")
    expect((await snapshot(page)).workspaces.new.invitations).toEqual([])
    expect((await server(page, (s) => s.requests)).filter((r) => r.kind === "invite")).toHaveLength(1)
    await demo.getByTestId("onb-invite-submit").click()
    await expect(demo.getByTestId("onb-invite-result")).toHaveText("once@example.com に招待を送りました（模擬。メールは送信しません）。")
    const snap = await snapshot(page)
    expect(snap.workspaces.new.invitations).toEqual(["once@example.com"])
    expect(snap.sent).toEqual([{ kind: "invitation", workspaceId: "new", to: "once@example.com" }])
  })

  test("customer registration: the sheet stays open with a confirmation instead of a second registration", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await server(page, (s) => (s.outcomeNext["add-customer"] = "unknown"))
    await demo.getByTestId("onb-create").click()
    const sheet = page.getByTestId("onb-create-sheet")
    await sheet.getByTestId("onb-create-name").fill("株式会社かくにん")
    await sheet.getByTestId("onb-create-submit").click()
    await expect(sheet.getByTestId("onb-create-result")).toHaveText(UNKNOWN)
    await expect(sheet.getByTestId("onb-create-submit")).toHaveCount(0)
    await sheet.getByTestId("onb-create-submit-confirm").click()
    await expect(sheet).toBeHidden()
    await expect(demo.getByTestId("onb-customers-result")).toHaveText("処理されていました。「株式会社かくにん」を登録しました。")
    await expect(item(demo, "first-customer")).toHaveAttribute("data-done", "true")
    expect((await snapshot(page)).workspaces.new.real.map((c) => c.company)).toEqual(["株式会社かくにん"])
    expect((await server(page, (s) => s.requests)).filter((r) => r.kind === "add-customer")).toHaveLength(1)
  })
})

// ------------------------------------------------------------------ 招待されたメンバー
test.describe("Onboarding: invited members", () => {
  test("an invited member joins and goes straight to the product without re-doing the organization setup", async ({ page }) => {
    await open(page)
    const demo = invitedDemo(page)
    await expect(demo.getByRole("heading", { name: "本社営業部に参加する" })).toBeVisible()
    await expect(demo).toContainText("佐藤 花子さんから、メンバーとして招待されています")
    await demo.getByTestId("onb-join").click()
    const product = demo.getByTestId("onb-product")
    await expect(product.getByTestId("onb-customers-count")).toHaveText("580 件")
    // 組織で完了済みの作業を示さない。アカウント単位の作業が 1 件だけなので Checklist も使わない
    await expect(product.getByTestId("onb-checklist")).toHaveCount(0)
    await expect(product.getByTestId("onb-setup")).toHaveCount(0)
    expect((await snapshot(page)).joined).toEqual(["u-suzuki:hq"])
    await demo.getByRole("radio", { name: "田中 美咲（閲覧者として招待）" }).check()
    await expect(demo).toContainText("閲覧者として招待されています")
  })
})

// ------------------------------------------------------------------ 動きを減らす設定
test.describe("Onboarding: reduced motion", () => {
  test.use({ reducedMotion: "reduce" })
  test("the registration sheet and the checklist work without forced animation", async ({ page }) => {
    await open(page)
    const demo = checklistDemo(page)
    await registerCustomer(demo, "株式会社しずか")
    await expect(item(demo, "first-customer")).toHaveAttribute("data-done", "true")
  })
})
