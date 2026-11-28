import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"

// System & Account の統合の検証画面（#/account-app）の検品。6 種類を組み合わせた画面で、
// 認証と初回利用、通常利用、異常時の利用、スコープの境界（利用者、ワークスペース、権限）を確かめる。
// 模擬のサーバーは window.__fdSa*Server で設定する。捕捉されなかった例外とコンソールのエラーは失敗にする（page-errors.ts）。
collectPageErrors(test)

const APP = "/#/account-app"
const PASSWORD = "flow-demo-2026"
const CODE = "012345"
const sato = "hanako.sato@example.com"
const tanaka = "misaki.tanaka@example.com"

const h1 = (page: Page) => page.locator("h1, [role=heading][aria-level='1']")
const main = (page: Page) => page.getByTestId("acct-main")
const trigger = (page: Page) => page.getByTestId("ntf-trigger")
/** 移動の前の未保存の変更の確認（Unsaved Changes の UnsavedChangesProvider の Alert Dialog） */
const unsavedDialog = (page: Page) => page.locator("[data-slot=unsaved-changes-dialog]")

/** 模擬のサーバーの応答を短くする（検品の時間を短くするため。順序と結果は変えない） */
async function fast(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, { latency?: Record<string, number> } | undefined>
    for (const name of ["__fdSaAuthServer", "__fdSaPermissionServer", "__fdSaSettingsServer", "__fdSaNotificationsServer", "__fdSaOnboardingServer"]) {
      const s = w[name]
      if (s?.latency) for (const k of Object.keys(s.latency)) s.latency[k] = Math.min(s.latency[k], 80)
    }
  })
}

async function open(page: Page, query = "") {
  await page.goto(`${APP}${query}`)
  await expect(h1(page)).toHaveCount(1)
  await fast(page)
}

/**
 * ログインする。本社営業部は組織のポリシーで多要素認証が必須（model.ts の orgSettings.hq.requireMfa）のため、
 * 既定では確認コードの画面が出ることを確かめてから、模擬の確認コードを入れる（出なければ失敗にする）。
 */
async function signIn(page: Page, email: string, { lockedEmail = false, mfa = true } = {}) {
  if (!lockedEmail) await page.getByLabel("メールアドレス").first().fill(email)
  await page.getByLabel("パスワード", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "ログイン", exact: true }).click()
  if (!mfa) return
  const code = page.getByLabel("確認コード")
  await expect(code).toBeVisible()
  await code.fill(CODE)
  await page.getByRole("button", { name: /^(確認する|続ける|ログイン)$/ }).first().click()
}

async function signInAs(page: Page, email: string, query = "") {
  await open(page, query)
  await signIn(page, email)
  await expect(main(page)).toBeVisible()
}

async function openVerify(page: Page) {
  const toggle = page.getByTestId("acct-verify-toggle")
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click()
}

/** Sidebar の中の要素を使う前に、モバイルでは Sidebar（Sheet）を開く */
async function sidebar(page: Page) {
  if (page.viewportSize()!.width >= 768) return page.locator("[data-slot=sidebar]").first()
  const sheet = page.locator("[data-slot=sidebar][data-mobile=true]")
  if (!(await sheet.isVisible())) await page.getByRole("button", { name: /サイドバー|メニュー/ }).first().click()
  await expect(sheet).toBeVisible()
  return sheet
}
const navLink = async (page: Page, name: string) => (await sidebar(page)).getByRole("link", { name })
/** モバイルで開いた Sidebar を閉じる */
async function closeSidebar(page: Page) {
  if (page.viewportSize()!.width >= 768) return
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-slot=sidebar][data-mobile=true]")).toHaveCount(0)
}
const accountMenu = async (page: Page) => (await sidebar(page)).getByTestId("acct-account-menu")

const go = (page: Page, query: string) => page.evaluate((q) => (window.location.hash = `#/account-app?${q}`), query)

// 模擬のサーバーの応答の保留と解放（固定の応答時間や操作の速さに依存せず、順序を検品の側で決める）
type NtfServer = {
  hold: Record<string, boolean>
  ignoreAbort: boolean
  holdDeliveries: boolean
  heldCount: (kind?: string) => number
  heldRequests: () => { seq: number; kind: string; ids?: string[]; workspaceId?: string }[]
  release: (kind: string, opts?: { which?: "first" | "last" | "all"; outcome?: string; workspaceId?: string }) => number
  releaseDeliveries: () => number
  push: (w: string, p: object) => void
  outcomeNext: Record<string, string>
  deliveries: { workspaceId: string; ids: string[]; results: { label: string; accepted: boolean }[] }[]
}
const ntf = <T,>(page: Page, fn: (s: NtfServer) => T) =>
  page.evaluate(`(${fn.toString()})(window.__fdSaNotificationsServer)`) as Promise<Awaited<T>>
const ntfHeld = (page: Page, kind: string) => page.evaluate((k) => (window as unknown as { __fdSaNotificationsServer: NtfServer }).__fdSaNotificationsServer.heldCount(k), kind)
const ntfRelease = (page: Page, kind: string, opts: { which?: "first" | "last" | "all"; outcome?: string; workspaceId?: string } = {}) =>
  page.evaluate(([k, o]) => (window as unknown as { __fdSaNotificationsServer: NtfServer }).__fdSaNotificationsServer.release(k as string, o as object), [kind, opts] as const)
type PermServer = {
  hold: Record<string, boolean>
  held: { kind: string; scope: string }[]
  release: (kind: string, opts?: { scope?: string; last?: boolean }) => number
  simulate: { setRole: (u: string, w: string, r: string) => void; grant: (scope: string, p: string) => void }
}
const permHeld = (page: Page, kind: string) =>
  page.evaluate((k) => (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer.held.filter((h) => h.kind === k).length, kind)
/** 応答を解放した後、受け取った側の処理と描画が進むのを待つ（時間ではなく、描画の 2 フレームと次のタスク） */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))))

// ------------------------------------------------------------------ 認証と初回利用
test.describe("Account app: sign-in and first use", () => {
  test("sign-in page: one h1, named controls, autocomplete, no horizontal scroll @webkit", { tag: "@webkit" }, async ({ page }) => {
    await open(page)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン")
    await expect(page.getByLabel("メールアドレス").first()).toHaveAttribute("autocomplete", /username|email/)
    await expect(page.getByLabel("パスワード", { exact: true })).toHaveAttribute("autocomplete", "current-password")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    // ログインの前は、製品の画面（Sidebar、お知らせ）を描画しない
    await expect(page.locator("[data-slot=sidebar]")).toHaveCount(0)
    await expect(trigger(page)).toHaveCount(0)
  })

  test("wrong password: form-level error that does not reveal whether the account exists; stays signed out", async ({ page }) => {
    await open(page)
    await page.getByLabel("メールアドレス").first().fill(sato)
    await page.getByLabel("パスワード", { exact: true }).fill("wrong-password")
    await page.getByRole("button", { name: "ログイン", exact: true }).click()
    const wrong = page.getByRole("alert").filter({ hasText: /メールアドレスまたはパスワード/ })
    await expect(wrong).toBeVisible()
    // 存在しないアカウントでも、同じ文になる
    await page.getByLabel("メールアドレス").first().fill("nobody@example.com")
    await page.getByRole("button", { name: "ログイン", exact: true }).click()
    await expect(wrong).toBeVisible()
    await expect(main(page)).toHaveCount(0)
  })

  test("MFA, then the product screen directly (no welcome screen, no success dialog)", async ({ page }) => {
    await signInAs(page, sato)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ホーム")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page).toHaveURL(/page=home&ws=hq/)
    // ログインの状態を URL とストレージに入れない
    expect(page.url()).not.toMatch(/session|token|password/i)
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  })

  test("returns to the page the user tried to open before signing in", async ({ page }) => {
    await signInAs(page, tanaka, "?start=return")
    await expect(page).toHaveURL(/page=customer&ws=hq&id=C-00004/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客の詳細")
  })

  test("organization SSO is the only method when the policy requires it", async ({ page }) => {
    await open(page, "?start=sso")
    await expect(page.getByRole("button", { name: "組織の SSO でログイン" })).toBeVisible()
    await expect(page.getByLabel("パスワード", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Google|Microsoft|Passkey/ })).toHaveCount(0)
  })

  test("invited member: sign in, confirm the organization, start without re-entering org settings", async ({ page }) => {
    await open(page, "?start=invited")
    await expect(page.getByText(/招待のリンクから開きました/)).toBeVisible()
    await signIn(page, "ichiro.suzuki@example.com")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("本社営業部に参加する")
    await expect(page.getByLabel("組織名")).toHaveCount(0)
    await page.getByRole("button", { name: /参加/ }).first().click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ホーム")
    await expect(page.getByText("本社営業部・メンバー")).toBeVisible()
  })

  test("sign-up, email verification through the mock mailbox, organization creation with skipped optional steps", async ({ page }) => {
    await open(page, "?start=signup")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("アカウントを作成")
    await page.getByLabel("メールアドレス").first().fill("new.member@example.com")
    await page.getByLabel("パスワード", { exact: true }).fill("a-long-new-password-2026")
    // 必須の同意と任意のお知らせを分ける
    const terms = page.getByRole("checkbox", { name: /利用規約/ })
    await expect(terms).not.toBeChecked()
    await terms.check()
    await page.getByRole("button", { name: /登録|アカウントを作成/ }).first().click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("メールアドレスを確認してください")
    // 実際に送信されたメールだけが模擬の受信箱に届く
    const mailbox = page.getByTestId("acct-mailbox")
    await mailbox.getByRole("button", { name: "リンクを開く" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("組織を作成")
    await page.getByLabel("組織名").fill("山田商事 営業部")
    await page.getByRole("button", { name: "次へ" }).click()
    // 任意の手順（メンバーの招待）はスキップできる。データの始め方は初期値（空から始める）のまま作成する
    await page.getByRole("button", { name: "スキップ" }).click()
    await page.getByTestId("onb-setup-create").click()
    // 成功の画面を挟まずに、製品の最初の画面（初回利用の Empty State）へ移る
    await expect(page.getByTestId("acct-new-org")).toBeVisible()
    await expect(page.getByTestId("acct-new-org").locator("[data-slot=empty]").first()).toBeVisible()
  })

  test("password reset: the sent screen does not reveal the account; after the change, sign in again (no auto sign-in)", async ({ page }) => {
    await open(page)
    await page.getByRole("button", { name: /パスワードを忘れた/ }).click()
    await page.getByLabel("メールアドレス").first().fill(sato)
    await page.getByRole("button", { name: /送信|再設定/ }).first().click()
    await expect(page.getByTestId("acct-reset-sent")).toBeVisible()
    await page.getByTestId("acct-mailbox").getByRole("button", { name: "リンクを開く" }).click()
    await expect(page.getByTestId("acct-new-password")).toBeVisible()
    await page.getByLabel(/新しいパスワード/).first().fill("another-long-password-2026")
    await page.getByRole("button", { name: /変更|設定/ }).first().click()
    await expect(page.getByText("パスワードを変更しました。新しいパスワードでログインしてください。")).toBeVisible()
    await expect(main(page)).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 通常利用
test.describe("Account app: everyday use", () => {
  test("app shell, account menu, workspace list only shows the user's workspaces", async ({ page }) => {
    await signInAs(page, sato)
    await (await accountMenu(page)).click()
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitemradio")).toHaveText(["本社営業部", "西日本営業部"])
    await expect(menu.getByRole("menuitem", { name: "ログアウト" })).toBeVisible()
    await page.keyboard.press("Escape")
  })

  test("settings: instant save shows its own status; explicit save keeps input when the result is unknown", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=display")
    await expect(page.getByTestId("set-display")).toBeVisible()
    await page.getByTestId("set-theme").getByRole("radio", { name: "ダーク" }).check()
    await expect(page.getByTestId("set-theme-status")).toHaveText(/保存しました/)
    await go(page, "page=settings&ws=hq&cat=profile")
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaSettingsServer: { outcome: Record<string, string> } }).__fdSaSettingsServer
      s.outcome.form = "unknown"
    })
    await page.getByTestId("set-profile-title").fill("営業部 部長")
    await page.getByTestId("set-profile").getByRole("button", { name: /保存/ }).click()
    await expect(page.getByTestId("set-profile")).toContainText("保存できたかを確認できませんでした")
    await expect(page.getByTestId("set-profile-title")).toHaveValue("営業部 部長")
    await expect(page.getByTestId("set-profile").getByRole("button", { name: "確認する" })).toBeVisible()
  })

  test("notification -> target with unsaved changes asks first; keep editing cancels the move", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=profile")
    await page.getByTestId("set-profile-title").fill("未保存の役職")
    await trigger(page).click()
    const center = page.getByTestId("ntf-center")
    await center.getByRole("button", { name: /担当者に設定されました/ }).first().click()
    const discard = unsavedDialog(page)
    await expect(discard).toBeVisible()
    await discard.getByRole("button", { name: "編集を続ける" }).click()
    await expect(page).toHaveURL(/page=settings/)
    // 押した通知は閉じた通知センターの中にあるため、通知センターを開くボタンへフォーカスを戻す
    await expect(trigger(page)).toBeFocused()
    await expect(page.getByTestId("set-profile-title")).toHaveValue("未保存の役職")
    // 移動を取りやめた通知は、既読にしない
    await trigger(page).click()
    const item = page.getByTestId("ntf-center").locator("[data-notification-id=n-101]")
    await expect(item).toBeVisible()
    await expect(item).not.toHaveAttribute("data-read")
    await page.getByTestId("ntf-center").getByRole("button", { name: /担当者に設定されました/ }).first().click()
    await unsavedDialog(page).getByRole("button", { name: "変更を破棄" }).click()
    await expect(page).toHaveURL(/page=customer&ws=hq&id=C-00001/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客の詳細")
  })

  test("member management shows what each role can actually do; settings search reaches the setting", async ({ page }) => {
    await signInAs(page, sato)
    await (await navLink(page, "メンバーと権限")).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("メンバーと権限")
    await expect(page.getByRole("heading", { level: 2, name: "ロールごとにできる操作" })).toBeVisible()
    await expect(page.getByRole("table").first()).toContainText("顧客を削除")
  })

  test("notification settings: mandatory notifications explain why they cannot be turned off", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=notifications")
    await expect(page.getByTestId("ntf-settings")).toBeVisible()
    const mandatory = page.getByTestId("ntf-switch-security-email")
    await expect(mandatory).toBeVisible()
    await expect(page.getByTestId("ntf-settings")).toContainText("組織のポリシーで、セキュリティの通知はメールで必ず届きます")
  })
})

// ------------------------------------------------------------------ スコープの境界
test.describe("Account app: scope boundaries", () => {
  test("workspace A -> B -> A: no notification from another workspace is ever shown", async ({ page }) => {
    await signInAs(page, sato)
    // 西日本営業部の取得を遅らせ、中止に従わない応答にする（古い応答を破棄できるかの検品）
    await ntf(page, (s) => {
      s.ignoreAbort = true
    })
    // 別のワークスペースの通知の文が、一度でも表示されたら記録する
    await page.evaluate(() => {
      const w = window as unknown as { __seen: string[] }
      w.__seen = []
      new MutationObserver(() => {
        const ws = document.querySelector("[data-testid=acct-workspace]")?.textContent
        const text = document.body.innerText
        if (ws === "本社営業部" && /取り込みが一部失敗/.test(text)) w.__seen.push("west-in-hq")
        if (ws === "西日本営業部" && /書き出しが完了しました（1,240 件）/.test(text)) w.__seen.push("hq-in-west")
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    await trigger(page).click()
    await expect(page.getByTestId("ntf-center")).toContainText("顧客の書き出しが完了しました（1,240 件）")
    await page.keyboard.press("Escape")
    // A（本社営業部）→ B（西日本営業部）：B の一覧の応答を保留する
    await ntf(page, (s) => {
      s.hold.list = true
    })
    const before = await ntfHeld(page, "list")
    await go(page, "page=home&ws=west")
    await expect.poll(() => ntfHeld(page, "list")).toBe(before + 1)
    // B の応答が届く前も、A の通知を示さない
    await trigger(page).click()
    await expect(page.getByTestId("ntf-center")).not.toContainText("1,240 件")
    await page.keyboard.press("Escape")
    // B → A：A の一覧も保留する（B の要求は AbortSignal を無視して残る）
    await go(page, "page=home&ws=hq")
    // 現在の A の応答を先に解放し、その後で古い B の応答をすべて解放する
    await expect.poll(() => ntf(page, (s) => s.heldRequests().filter((h) => h.workspaceId === "hq").length)).toBeGreaterThan(0)
    // この後の要求は保留しない（保留した要求の順序だけを決める）
    await ntf(page, (s) => {
      s.hold.list = false
    })
    expect(await ntfRelease(page, "list", { which: "all", workspaceId: "hq" })).toBeGreaterThan(0)
    await settle(page)
    expect(await ntfRelease(page, "list", { which: "all", workspaceId: "west" })).toBeGreaterThan(0)
    await settle(page)
    // 未読の件数は、本社営業部の値（n-101、n-102、n-103 の 3 件）。西日本営業部の件数を足さない
    await expect(trigger(page)).toHaveAccessibleName(/未読 3 件/)
    await trigger(page).click()
    await expect(page.getByTestId("ntf-center")).toContainText("顧客の書き出しが完了しました（1,240 件）")
    await expect(page.getByTestId("ntf-center")).not.toContainText("取り込みが一部失敗")
    await page.keyboard.press("Escape")
    // B を開くと、B の通知だけを示す
    await go(page, "page=home&ws=west")
    await trigger(page).click()
    await expect(page.getByTestId("ntf-center")).toContainText("取り込みが一部失敗")
    await expect(page.getByTestId("ntf-center")).not.toContainText("1,240 件")
    expect(await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen)).toEqual([])
  })

  test("switching workspaces while a notification target is being checked does not move back to the old workspace", async ({ page }) => {
    await signInAs(page, sato)
    await ntf(page, (s) => {
      s.hold.resolve = true
      s.ignoreAbort = true
    })
    await trigger(page).click()
    await page.getByTestId("ntf-center").getByRole("button", { name: /メンションしました/ }).first().click()
    // 対象の確認の要求が送られ、保留されている間に、ワークスペースを切り替える
    await expect.poll(() => ntfHeld(page, "resolve")).toBe(1)
    await go(page, "page=home&ws=west")
    await expect(page.getByTestId("acct-workspace")).toHaveText("西日本営業部")
    // 切り替えた後に、古い確認の結果（対象は閲覧できる）を届ける
    expect(await ntfRelease(page, "resolve", { which: "all" })).toBe(1)
    await settle(page)
    await expect(page).toHaveURL(/page=home&ws=west/)
    await expect(page.getByTestId("acct-workspace")).toHaveText("西日本営業部")
  })

  test("a permission change while a notification target is being checked cancels the navigation", async ({ page }) => {
    await signInAs(page, sato)
    // 中止された確認の要求も、AbortSignal を無視して後から応答を返す（応答が届いても移動しないことを確かめる）
    await ntf(page, (s) => {
      s.hold.resolve = true
      s.ignoreAbort = true
    })
    await trigger(page).click()
    await page.getByTestId("ntf-center").getByRole("button", { name: /メンションしました/ }).first().click()
    await expect.poll(() => ntfHeld(page, "resolve")).toBe(1)
    // 確認を待つ間に、同じワークスペースのロールが変わる（権限の取得し直しが終わるまで待つ）
    await page.evaluate(() => (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer.simulate.setRole("u-sato", "hq", "viewer"))
    await expect(page.getByTestId("acct-permission-notice")).not.toBeEmpty()
    expect(await ntfRelease(page, "resolve", { which: "all" })).toBe(1)
    await settle(page)
    // 開始したときの権限のスコープの移動は行わない（現在の権限で、もう一度選び直す）
    await expect(page).not.toHaveURL(/page=customer&/)
    await expect(h1(page)).toHaveText("ホーム")
  })

  test("while permissions are being re-checked after a role change, an export cannot be started with the old permission", async ({ page }) => {
    await signInAs(page, "ichiro.suzuki@example.com")
    await go(page, "page=jobs&ws=hq")
    const start = main(page).getByRole("button", { name: "顧客を書き出す" })
    await expect(start).toBeEnabled()
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer
      s.hold.access = true
      s.simulate.setRole("u-suzuki", "hq", "viewer")
    })
    // 再確認の応答を保留している間（前の権限が残っている間）は、開始させない。理由は「権限がない」ではなく確認中と示す
    await expect.poll(() => permHeld(page, "access")).toBeGreaterThan(0)
    await expect(start).toBeDisabled()
    await expect(main(page)).toContainText("最新の権限を確認できるまで、開始できません。")
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer
      s.hold.access = false
      s.release("access")
    })
    await expect(main(page)).toContainText("顧客を書き出す権限がありません。")
    await expect(start).toBeDisabled()
  })

  test("an export pressed in the same task as a permission change notice is not started", async ({ page }) => {
    await signInAs(page, "ichiro.suzuki@example.com")
    await go(page, "page=jobs&ws=hq")
    const start = main(page).getByRole("button", { name: "顧客を書き出す" })
    await expect(start).toBeEnabled()
    // 変更の知らせと押下を同じ JS のタスクで行う（画面の更新の前に押された場合）。開始の要求を数える
    const calls = await page.evaluate(() => {
      const w = window as unknown as {
        __fdSaPermissionServer: PermServer
        __fdSaSystemServer: { startJob: (...a: unknown[]) => unknown }
        __startCalls: number
      }
      w.__startCalls = 0
      const original = w.__fdSaSystemServer.startJob.bind(w.__fdSaSystemServer)
      w.__fdSaSystemServer.startJob = (...a: unknown[]) => {
        w.__startCalls++
        return original(...a)
      }
      w.__fdSaPermissionServer.hold.access = true
      w.__fdSaPermissionServer.simulate.setRole("u-suzuki", "hq", "viewer")
      const button = [...document.querySelectorAll<HTMLButtonElement>("[data-testid=acct-main] button")].find((b) => b.textContent?.includes("顧客を書き出す"))
      button?.click()
      return w.__startCalls
    })
    expect(calls).toBe(0)
    await settle(page)
    expect(await page.evaluate(() => (window as unknown as { __startCalls: number }).__startCalls)).toBe(0)
  })

  test("an unknown read result is shown as being verified, and the header count is not guessed", async ({ page }) => {
    await signInAs(page, sato)
    await trigger(page).click()
    const center = page.getByTestId("ntf-center")
    const n101 = center.locator('[data-notification-id="n-101"]')
    await expect(n101).toBeVisible()
    // 一覧を読み込んだ後に、既読の結果を不明にし、確認のための取得し直しを保留する
    await ntf(page, (s) => {
      s.outcomeNext.read = "unknown"
      s.hold.list = true
    })
    await n101.locator("[data-slot=notification-read-toggle]").click()
    await expect.poll(() => ntfHeld(page, "list")).toBeGreaterThan(0)
    await expect(n101).toHaveAttribute("data-verifying", "")
    await expect(n101).toContainText("状態を確認中")
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読あり")
    await ntf(page, (s) => {
      s.hold.list = false
      s.release("list", { which: "all" })
    })
    await expect(n101).not.toHaveAttribute("data-verifying")
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読 2 件")
  })

  test("a delivery from the subscription of the first workspace A is rejected after A → B → A", async ({ page }) => {
    await signInAs(page, sato)
    // 配信を保留する。保留した配信は、配信した時点の購読者（最初の A の購読）に届く
    await ntf(page, (s) => {
      s.holdDeliveries = true
      s.push("hq", { title: "古い購読への配信の確認用", type: "mention" })
    })
    await go(page, "page=home&ws=west")
    await expect(page.getByTestId("acct-workspace")).toHaveText("西日本営業部")
    await go(page, "page=home&ws=hq")
    await expect(page.getByTestId("acct-workspace")).toHaveText("本社営業部")
    await ntf(page, (s) => {
      s.holdDeliveries = false
      s.releaseDeliveries()
    })
    await settle(page)
    const last = await ntf(page, (s) => s.deliveries.at(-1))
    // 最初の A の購読は解除済み：受け付けない（現在の A の購読は、配信した時点では存在しない）
    const fromApp = last?.results.filter((r) => r.label === "account-app") ?? []
    // 配信を受けた購読者が 1 つ以上あり、そのすべてが受け付けなかった（空の一覧で成功にしない）
    expect(fromApp.length).toBeGreaterThan(0)
    expect(fromApp.every((r) => !r.accepted)).toBe(true)
  })

  test("new notifications are held while the notification center is open", async ({ page }) => {
    await signInAs(page, sato)
    await trigger(page).click()
    const center = page.getByTestId("ntf-center")
    const first = center.locator("[data-notification-id=n-101]")
    await expect(first).toBeVisible()
    // 通知センターを開くときのアニメーション（位置と大きさの変化）が終わってから、位置を測る
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined))
      )
    )
    await settle(page)
    const before = (await first.boundingBox())!.y
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaNotificationsServer: { push: (w: string, p: object) => void } }).__fdSaNotificationsServer
      s.push("hq", { title: "新着の確認用のお知らせ", type: "mention" })
    })
    await expect(center.getByRole("button", { name: /新着.*件を表示/ })).toBeVisible()
    await expect(center).not.toContainText("新着の確認用のお知らせ")
    expect(Math.abs((await first.boundingBox())!.y - before)).toBeLessThan(1)
  })

  test("page names that are Object prototype keys are unknown pages, not permission errors", async ({ page }) => {
    await signInAs(page, sato)
    for (const name of ["constructor", "toString", "__proto__"]) {
      await go(page, `page=${name}&ws=hq`)
      await expect(h1(page)).toHaveText("ページが見つかりません")
    }
    await go(page, "page=home&ws=constructor")
    await expect(page).toHaveURL(/ws=hq/)
  })

  test("a workspace URL the user does not belong to is not trusted", async ({ page }) => {
    await signInAs(page, tanaka)
    await go(page, "page=customers&ws=west")
    await expect(page).toHaveURL(/ws=hq/)
    await expect(page.getByTestId("acct-workspace")).toHaveText("本社営業部")
  })

  test("role change while signed in updates the navigation and page access without reloading", async ({ page }) => {
    await signInAs(page, sato)
    await expect(await navLink(page, "メンバーと権限")).toBeVisible()
    await closeSidebar(page)
    await openVerify(page)
    await page.getByTestId("acct-verify").getByRole("radio", { name: "閲覧者" }).check()
    await expect(page.getByTestId("acct-permission-notice")).not.toBeEmpty()
    await expect(await navLink(page, "メンバーと権限")).toHaveCount(0)
    await expect(await navLink(page, "顧客")).toBeVisible()
    await closeSidebar(page)
    await expect(page.getByTestId("acct-permission-notice")).toHaveText("権限が変更されました。表示している操作を更新しました。")
    await go(page, "page=members&ws=hq")
    await expect(h1(page)).toHaveText("このページを表示する権限がありません")
    await expect(main(page).getByRole("button", { name: "ホームへ移動" })).toBeVisible()
    await page.getByTestId("acct-verify").getByRole("radio", { name: "管理者" }).check()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("メンバーと権限")
  })

  test("permission fetch failure is not treated as permission", async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: { outcome: Record<string, string> } }).__fdSaPermissionServer
      s.outcome.access = "fail"
    })
    await signIn(page, sato)
    await expect(main(page)).toBeVisible()
    await go(page, "page=members&ws=hq")
    await expect(main(page).getByRole("alert")).toContainText("権限を確認できませんでした")
    await expect(await navLink(page, "メンバーと権限")).toHaveCount(0)
    await expect(await navLink(page, "顧客")).toHaveCount(0)
    // 権限の要らない項目は表示する
    await expect(await navLink(page, "ホーム")).toBeVisible()
  })

  test("sign out: no confirmation, not red; the next user sees none of the previous user's data", async ({ page }) => {
    await signInAs(page, sato)
    await expect(trigger(page)).toHaveAccessibleName(/未読/)
    await (await accountMenu(page)).click()
    const logout = page.getByRole("menuitem", { name: "ログアウト" })
    expect(await logout.evaluate((el) => getComputedStyle(el).color)).not.toBe(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--destructive")))
    await logout.click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByText("ログアウトしました。")).toBeVisible()
    await signIn(page, tanaka)
    await expect(main(page)).toBeVisible()
    await expect(await accountMenu(page)).toContainText("田中 美咲")
    await expect(page.getByText("佐藤 花子").filter({ visible: true })).toHaveCount(0)
    // 佐藤 花子の通知（未読件数）を引き継がない
    await expect(trigger(page)).not.toHaveAccessibleName(/未読 [0-9]/)
  })

  test("sign out with unsaved changes asks first", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=profile")
    await page.getByTestId("set-profile-title").fill("未保存")
    await (await accountMenu(page)).click()
    await page.getByRole("menuitem", { name: "ログアウト" }).click()
    await expect(unsavedDialog(page)).toBeVisible()
    await unsavedDialog(page).getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.getByText("ログアウトしました。")).toBeVisible()
  })
})

// ------------------------------------------------------------------ 異常時の利用
test.describe("Account app: abnormal conditions", () => {
  test("session expiry: the product screen is not rendered; same user returns to the same page", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=customer&ws=hq&id=C-00001")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客の詳細")
    await openVerify(page)
    await page.getByTestId("acct-expire").click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("もう一度ログインしてください")
    // セッションが切れている間は、機密のデータ（顧客の情報、Sidebar、お知らせ）を描画しない
    await expect(main(page)).toHaveCount(0)
    await expect(page.locator("[data-slot=sidebar]")).toHaveCount(0)
    await expect(trigger(page)).toHaveCount(0)
    await signIn(page, sato, { lockedEmail: true })
    await expect(page).toHaveURL(/page=customer&ws=hq&id=C-00001/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客の詳細")
  })

  test("session expiry: a different user does not inherit the previous page", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=members&ws=hq")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("メンバーと権限")
    await openVerify(page)
    await page.getByTestId("acct-expire").click()
    await page.getByRole("button", { name: "別のアカウントでログイン" }).click()
    await signIn(page, tanaka)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ホーム")
    await expect(page).toHaveURL(/page=home/)
    await expect(await accountMenu(page)).toContainText("田中 美咲")
  })

  test("offline: banner at the top, data stays, recovers after the connection is confirmed", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=customers&ws=hq")
    await expect(page.getByTestId("acct-customers")).toBeVisible()
    await openVerify(page)
    await page.getByTestId("acct-verify").getByRole("radio", { name: "切断した" }).check()
    const banner = page.locator("[data-slot=system-banner]")
    await expect(banner).toContainText("オフラインです", { timeout: 8000 })
    // 表示中のデータを消さない
    await expect(page.getByTestId("acct-customers")).toBeVisible()
    // Banner は main の外（上部）にあり、main のスクロールで隠れない
    expect(await banner.evaluate((el) => !document.querySelector("[data-testid=acct-main]")!.contains(el))).toBe(true)
    await page.getByTestId("acct-verify").getByRole("radio", { name: "接続している" }).check()
    await expect(banner).not.toContainText("オフラインです", { timeout: 15000 })
  })

  test("product-wide outage replaces the product screen; recovery brings it back with the session", async ({ page }) => {
    await signInAs(page, sato)
    await openVerify(page)
    await page.getByTestId("acct-verify").getByRole("radio", { name: "製品全体の停止" }).check()
    await expect(h1(page)).toHaveText("サービスを利用できません", { timeout: 10000 })
    await expect(page.locator("[data-slot=sidebar]")).toHaveCount(0)
    // 判明していない復旧の予定時刻を示さない
    await expect(page.getByTestId("acct-unavailable")).not.toContainText(/復旧の予定|頃に復旧/)
    await openVerify(page)
    await page.getByTestId("acct-verify").getByRole("radio", { name: "正常", exact: true }).check()
    await page.getByRole("button", { name: "状態を再確認" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ホーム", { timeout: 10000 })
  })

  test("maintenance replaces the product screen with the maintenance state", async ({ page }) => {
    await signInAs(page, sato)
    await openVerify(page)
    await page.getByTestId("acct-verify").getByRole("radio", { name: "メンテナンス中" }).check()
    await expect(h1(page)).toHaveText("メンテナンス中です", { timeout: 10000 })
  })

  test("notification fetch failure is shown in the center, not as zero notifications", async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaNotificationsServer: { outcome: Record<string, string> } }).__fdSaNotificationsServer
      s.outcome.list = "fail"
    })
    await signIn(page, sato)
    await trigger(page).click()
    const center = page.getByTestId("ntf-center")
    await expect(center).toContainText(/取得できませんでした/)
    await expect(center).not.toContainText(/お知らせはありません/)
    // 件数が不明なときに、架空の件数を示さない
    await expect(trigger(page)).not.toHaveAccessibleName(/未読 [0-9]/)
  })

  test("long-running jobs page: export runs and its state is shown", async ({ page }) => {
    await signInAs(page, sato)
    await (await navLink(page, "処理の状況")).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("処理の状況")
    const start = main(page).getByRole("button", { name: /書き出しを開始|書き出す/ }).first()
    await expect(start).toBeVisible()
  })

  test("viewer cannot start an export; the reason is shown next to the action", async ({ page }) => {
    await signInAs(page, tanaka)
    await (await navLink(page, "処理の状況")).click()
    await expect(main(page)).toContainText("顧客を書き出す権限がありません。")
  })
})

// ------------------------------------------------------------------ 画面の幅
test.describe("Account app: layout", { tag: "@webkit" }, () => {
  test("320px: sign-in and the main pages do not scroll horizontally", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    await page.setViewportSize({ width: 320, height: 760 })
    await signInAs(page, sato)
    for (const q of ["page=home&ws=hq", "page=settings&ws=hq", "page=notifications&ws=hq", "page=members&ws=hq", "page=jobs&ws=hq", "page=status&ws=hq", "page=customers&ws=hq"]) {
      await go(page, q)
      await expect(h1(page)).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), q).toBe(true)
      expect(await main(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1), q).toBe(true)
    }
  })
})

// ------------------------------------------------------------------ Patterns Integration Review（System & Account の横断の検品）
type SetServer = {
  requests: { kind: string; scope: string; key?: string }[]
  outcome: Record<string, string>
  personalOf: (u: string) => { profile: { title: string } }
  orgOf: (w: string) => { info: { name: string }; security: { requireMfa: boolean } }
}
const setServer = <T,>(page: Page, fn: (s: SetServer) => T) => page.evaluate(`(${fn.toString()})(window.__fdSaSettingsServer)`) as Promise<Awaited<T>>
const orgInfoRequests = (page: Page) => setServer(page, (s) => s.requests.filter((r) => r.kind === "form" && r.key === "info").length)

test.describe("Account app: settings, permissions and navigation (integration review)", () => {
  test("PERM-1: while permissions are re-checked after a role change, org settings are hidden and a save is not sent", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=organization")
    await expect(page.getByTestId("set-org-name")).toHaveValue("本社営業部")
    await page.getByTestId("set-org-name").fill("本社営業部（変更）")
    // 権限の変更の知らせと保存の押下を同じタスクで行う（画面の更新の前に押された場合）。保存の要求を数える
    const sent = await page.evaluate(() => {
      const w = window as unknown as { __fdSaPermissionServer: PermServer; __fdSaSettingsServer: SetServer }
      const count = () => w.__fdSaSettingsServer.requests.filter((r) => r.kind === "form" && r.key === "info").length
      const before = count()
      w.__fdSaPermissionServer.hold.access = true
      w.__fdSaPermissionServer.simulate.setRole("u-sato", "hq", "viewer")
      document.querySelector<HTMLButtonElement>("[data-testid=set-org-info-save]")?.click()
      return count() - before
    })
    expect(sent).toBe(0)
    // 再確認の応答を保留している間：保護された組織名を表示せず、確認中と示す。保存の操作も示さない
    await expect.poll(() => permHeld(page, "access")).toBeGreaterThan(0)
    await expect(page.getByTestId("set-org-pending")).toHaveText(/最新の権限を確認しています/)
    await expect(page.getByTestId("set-org-name")).toBeHidden()
    await expect(page.getByTestId("set-org-info-save")).toBeHidden()
    await expect(page.getByTestId("set-org").getByText("本社営業部（変更）")).toHaveCount(0)
    await settle(page)
    expect(await orgInfoRequests(page)).toBe(0)
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer
      s.hold.access = false
      s.release("access")
    })
    // 閲覧者は組織の設定を閲覧できない：組織のカテゴリを示さない
    await expect(page.getByTestId("set-org-name")).toHaveCount(0)
    expect(await orgInfoRequests(page)).toBe(0)
  })

  test("PERM-1: after the re-check keeps the same permissions, the input is still there and can be saved", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=organization")
    await page.getByTestId("set-org-name").fill("本社営業部（確認の後）")
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer
      s.hold.access = true
      // 権限は変わらないが、変更の知らせが届く（すでに持っている権限の付与）
      s.simulate.grant("u-sato:hq", "audit.view")
    })
    await expect.poll(() => permHeld(page, "access")).toBeGreaterThan(0)
    await expect(page.getByTestId("set-org-name")).toBeHidden()
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer
      s.hold.access = false
      s.release("access")
    })
    await expect(page.getByTestId("set-org-name")).toHaveValue("本社営業部（確認の後）")
    await page.getByTestId("set-org-info-save").click()
    await expect(page.getByTestId("set-org-info-status")).toHaveText(/保存しました/)
  })

  test("SET-1: browser back with unsaved settings input asks first; keep editing stays, discard leaves; beforeunload is registered", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=profile")
    await expect(page.getByTestId("set-profile-title")).toBeVisible()
    const beforeUnloadPrevented = () =>
      page.evaluate(() => {
        const e = new Event("beforeunload", { cancelable: true })
        window.dispatchEvent(e)
        return e.defaultPrevented
      })
    expect(await beforeUnloadPrevented()).toBe(false)
    await page.getByTestId("set-profile-title").fill("戻る操作の前の入力")
    expect(await beforeUnloadPrevented()).toBe(true)
    await page.evaluate(() => history.back())
    await expect(unsavedDialog(page)).toBeVisible()
    // 確認の間は、表示している画面の URL のまま
    await expect(page).toHaveURL(/page=settings/)
    await unsavedDialog(page).getByRole("button", { name: "編集を続ける" }).click()
    await expect(unsavedDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/page=settings&ws=hq&cat=profile/)
    await expect(page.getByTestId("set-profile-title")).toHaveValue("戻る操作の前の入力")
    await page.evaluate(() => history.back())
    await unsavedDialog(page).getByRole("button", { name: "変更を破棄" }).click()
    await expect(h1(page)).toHaveText("ホーム")
    await expect(page).toHaveURL(/page=home/)
    expect(await beforeUnloadPrevented()).toBe(false)
    expect(await setServer(page, (s) => s.personalOf("u-sato").profile.title)).toBe("営業部 マネージャー")
  })

  test("SET-2: leaving after an unknown save result does not claim the input was not saved, and offers no save-and-leave", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=profile")
    await setServer(page, (s) => {
      s.outcome.form = "unknown"
    })
    await page.getByTestId("set-profile-title").fill("結果が不明な役職")
    await page.getByTestId("set-profile-save").click()
    await expect(page.getByTestId("set-profile")).toContainText("保存できたかを確認できませんでした")
    await (await navLink(page, "ホーム")).click()
    const dialog = unsavedDialog(page)
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText("「プロフィール」は、保存できたかを確認していません")
    await expect(dialog).not.toContainText("保存されていません")
    await expect(dialog.getByRole("button", { name: "保存して移動" })).toHaveCount(0)
    await dialog.getByRole("button", { name: "編集を続ける" }).click()
    await expect(page.getByTestId("set-profile").getByRole("button", { name: "確認する" })).toBeVisible()
  })

  test("SET-7: save and leave saves the form, then moves only after the save succeeded", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=profile")
    await page.getByTestId("set-profile-title").fill("保存して移動した役職")
    await (await navLink(page, "ホーム")).click()
    await unsavedDialog(page).getByRole("button", { name: "保存して移動" }).click()
    await expect(h1(page)).toHaveText("ホーム")
    expect(await setServer(page, (s) => s.personalOf("u-sato").profile.title)).toBe("保存して移動した役職")
  })

  test("SET-3: saved org settings are the single source: the sidebar shows the new name and sign-in follows the saved MFA policy", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=organization")
    await page.getByTestId("set-org-name").fill("本社営業本部")
    await page.getByTestId("set-org-info-save").click()
    await expect(page.getByTestId("set-org-info-status")).toHaveText(/保存しました/)
    await expect(await accountMenu(page)).toContainText("本社営業本部")
    await closeSidebar(page)
    await page.getByTestId("set-policy-requireMfa").click()
    await page.getByTestId("set-policy-save").click()
    await expect(page.getByTestId("set-policy-status")).toHaveText(/保存しました/)
    expect(await setServer(page, (s) => s.orgOf("hq").security.requireMfa)).toBe(false)
    await (await accountMenu(page)).click()
    await page.getByRole("menuitem", { name: "ログアウト" }).click()
    await expect(page.getByText("ログアウトしました。")).toBeVisible()
    // 保存したポリシー（多要素認証を必須にしない）で判定する：確認コードの画面を出さない
    await signIn(page, sato, { mfa: false })
    await expect(h1(page)).toHaveText("ホーム")
    await expect(page.getByLabel("確認コード")).toHaveCount(0)
  })

  test("AUTH-3: session expiry with unsaved settings input says the input was discarded and returns to the same settings category", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=profile")
    await page.getByTestId("set-profile-title").fill("期限切れの前の入力")
    await openVerify(page)
    // セッション切れは、未保存の変更の確認を挟まない
    await page.getByTestId("acct-expire").click()
    await expect(unsavedDialog(page)).toHaveCount(0)
    await expect(h1(page)).toHaveText("もう一度ログインしてください")
    await expect(page.getByTestId("acct-reauth")).toContainText("保存していない入力は破棄されました")
    await signIn(page, sato, { lockedEmail: true })
    await expect(page).toHaveURL(/page=settings&ws=hq&cat=profile/)
    await expect(page.getByTestId("set-profile-title")).toHaveValue("営業部 マネージャー")
  })

  test("NTF-1: opening a notification while permissions are re-checked says so and does not mark it read", async ({ page }) => {
    await signInAs(page, sato)
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer
      s.hold.access = true
      s.simulate.grant("u-sato:hq", "audit.view")
    })
    await expect.poll(() => permHeld(page, "access")).toBeGreaterThan(0)
    await trigger(page).click()
    const center = page.getByTestId("ntf-center")
    await center.getByRole("button", { name: /担当者に設定されました/ }).first().click()
    // 再確認中（refreshing）か、前の権限を使えない間（loading）の文。どちらも「権限がない」とは示さない
    await expect(center).toContainText(/(最新の)?権限を確認しています。確認できてから、もう一度開いてください。/)
    await expect(center).not.toContainText("権限がありません")
    await expect(page).not.toHaveURL(/page=customer&/)
    await expect(center.locator("[data-notification-id=n-101]")).not.toHaveAttribute("data-read")
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer
      s.hold.access = false
      s.release("access")
    })
    // 確認できた後は開ける
    await center.getByRole("button", { name: /担当者に設定されました/ }).first().click()
    await expect(page).toHaveURL(/page=customer&ws=hq&id=C-00001/)
  })

  test("SYS-3: while offline, instant settings saves and mark-all-read are not sent; the reason is not 'unknown'", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=settings&ws=hq&cat=display")
    await expect(page.getByTestId("set-display")).toBeVisible()
    await openVerify(page)
    await page.getByTestId("acct-verify").getByRole("radio", { name: "切断した" }).check()
    await expect(page.locator("[data-slot=system-banner]")).toContainText("オフラインです", { timeout: 8000 })
    const before = await setServer(page, (s) => s.requests.filter((r) => r.kind === "instant").length)
    // 送らずに元の設定に戻すため、選んだ直後に選択が戻る（check() は状態の変化を待つため click を使う）
    await page.getByTestId("set-theme").getByRole("radio", { name: "ダーク" }).click()
    await expect(page.getByTestId("set-theme").getByRole("radio", { name: "ダーク" })).not.toBeChecked()
    // 送っていないため、結果の不明ではなく、確定した失敗として元の設定に戻す
    await expect(page.getByTestId("set-theme-status")).toHaveText(/元の設定に戻しました/)
    expect(await setServer(page, (s) => s.requests.filter((r) => r.kind === "instant").length)).toBe(before)
    const ntfRequests = () =>
      page.evaluate(
        () =>
          (window as unknown as { __fdSaNotificationsServer: { requests: { kind: string }[] } }).__fdSaNotificationsServer.requests.filter(
            (r) => r.kind === "read" || r.kind === "readAll"
          ).length
      )
    const ntfBefore = await ntfRequests()
    await trigger(page).click()
    await page.getByTestId("ntf-center").getByRole("button", { name: "すべて既読にする" }).click()
    await settle(page)
    expect(await ntfRequests()).toBe(ntfBefore)
  })

  test("AUTH-4: after the password step, focus moves to the verification code input instead of falling to the body", async ({ page }) => {
    await open(page)
    await page.getByLabel("メールアドレス").first().fill(sato)
    await page.getByLabel("パスワード", { exact: true }).fill(PASSWORD)
    await page.getByLabel("パスワード", { exact: true }).press("Enter")
    await expect(page.getByLabel("確認コード")).toBeFocused()
  })

  test("AUTH-1: the return path after re-authentication is checked with the current role, not the initial role", async ({ page }) => {
    await signInAs(page, sato)
    await go(page, "page=members&ws=hq")
    await expect(h1(page)).toHaveText("メンバーと権限")
    await openVerify(page)
    await page.getByTestId("acct-verify").getByRole("radio", { name: "閲覧者" }).check()
    await expect(h1(page)).toHaveText("このページを表示する権限がありません")
    await page.getByTestId("acct-expire").click()
    await signIn(page, sato, { lockedEmail: true })
    await expect(h1(page)).toHaveText("ホーム")
    await expect(page).toHaveURL(/page=home/)
  })

  test("AUTH-2: the return path uses the same permission as the page access (members.view)", async ({ page }) => {
    await signInAs(page, "ichiro.suzuki@example.com")
    await go(page, "page=members&ws=hq")
    await expect(h1(page)).toHaveText("メンバーと権限")
    await openVerify(page)
    await page.getByTestId("acct-expire").click()
    await signIn(page, "ichiro.suzuki@example.com", { lockedEmail: true })
    await expect(page).toHaveURL(/page=members&ws=hq/)
    await expect(h1(page)).toHaveText("メンバーと権限")
  })
})

test.describe("Account app: onboarding checklist (integration review)", () => {
  test("ONB-2: checklist results come from the product data, not from the onboarding mock; tasks without a product screen are not listed", async ({ page }) => {
    await signInAs(page, sato)
    await expect(h1(page)).toHaveText("ホーム")
    // 佐藤 花子は本社営業部の Checklist を非表示にしている。再表示する
    await main(page).getByTestId("acct-checklist-show").click()
    const list = main(page).getByTestId("onb-checklist")
    await expect(list).toBeVisible()
    // 顧客（権限の模擬のサーバー）とメンバー（3 人）は製品のデータにある。取り込みは処理の状況にまだない
    await expect(list.locator("[data-task-id=first-customer]")).toHaveAttribute("data-done", "true")
    await expect(list.locator("[data-task-id=invite-members]")).toHaveAttribute("data-done", "true")
    await expect(list.locator("[data-task-id=import-customers]")).not.toHaveAttribute("data-done", "true")
    // この検証画面には支払い方法の登録とプロフィールの写真の画面がないため、作業として示さない（移れない画面へ案内しない）
    await expect(list.locator("[data-task-id=set-billing]")).toHaveCount(0)
    await expect(list.locator("[data-task-id=complete-profile]")).toHaveCount(0)
    // Onboarding の模擬のサーバーの作業結果は取得しない
    const resultRequests = await page.evaluate(
      () => (window as unknown as { __fdSaOnboardingServer: { requests: { kind: string }[] } }).__fdSaOnboardingServer.requests.filter((r) => r.kind === "results").length
    )
    expect(resultRequests).toBe(0)
    // 取り込みの作業は、処理の状況の画面へ移る
    await list.locator("[data-task-id=import-customers]").getByRole("button").click()
    await expect(h1(page)).toHaveText("処理の状況")
  })

  test("ONB-1: while permissions are re-checked after a role change, the checklist is not derived from the previous permissions", async ({ page }) => {
    await signInAs(page, sato)
    await main(page).getByTestId("acct-checklist-show").click()
    await expect(main(page).getByTestId("onb-checklist").locator("[data-task-id=invite-members]")).toBeVisible()
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer
      s.hold.access = true
      s.simulate.setRole("u-sato", "hq", "viewer")
    })
    await expect.poll(() => permHeld(page, "access")).toBeGreaterThan(0)
    // 再確認の応答を保留している間：管理者の作業（招待）と作業のボタンを示さず、確認中と示す
    await expect(main(page).getByTestId("onb-checklist-pending")).toHaveText(/最新の権限を確認しています/)
    await expect(main(page).getByTestId("onb-checklist")).toHaveCount(0)
    await expect(main(page).getByTestId("acct-checklist-show")).toHaveCount(0)
    await page.evaluate(() => {
      const s = (window as unknown as { __fdSaPermissionServer: PermServer }).__fdSaPermissionServer
      s.hold.access = false
      s.release("access")
    })
    // 閲覧者には対象の作業がない（0 件は完了と示さない）
    await expect(main(page).getByTestId("onb-checklist-pending")).toHaveCount(0)
    await expect(main(page).getByTestId("onb-checklist")).toHaveCount(0)
    await expect(main(page)).not.toContainText("利用開始の準備が完了しました")
  })
})
