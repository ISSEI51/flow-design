import { expect, test, type Locator, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"

// Patterns / System & Account / Settings の検品（指示書 13 章 Settings と、横断的な統合検品のうち設定に関係するもの）。
// 模擬のサーバーは window.__fdSaSettingsServer で設定する（応答の時間、結果、ignoreAbort、受け付けた要求、サーバーのロール）。
// 期待値は指示書の規則とモックデータ（model.ts、settings-server.ts の初期値）から決める。
collectPageErrors(test)

type Server = NonNullable<Window["__fdSaSettingsServer"]>
const server = <T,>(page: Page, fn: (s: Server) => T) =>
  page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdSaSettingsServer), fn.toString()) as Promise<T>

const area = (page: Page) => page.getByTestId("set-demo-area")
const heading = (page: Page) => area(page).locator("[data-settings-heading]")
const backLink = (page: Page) => area(page).locator("[data-slot=settings-back-link]")
const navLink = (page: Page, id: string) => area(page).locator(`[data-setting-category="${id}"]`)
const statusText = (page: Page, testId: string) => area(page).getByTestId(testId).getByRole("status")

async function openPage(page: Page) {
  await page.goto("/#/settings")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings")
  await server(page, (s) => {
    s.reset()
    Object.assign(s.latency, { get: 30, instant: 80, form: 80, members: 30, invite: 80, action: 80 })
  })
}

async function openCategory(page: Page, id: string, label: string) {
  if (await backLink(page).isVisible()) await backLink(page).click()
  await navLink(page, id).click()
  await expect(heading(page)).toHaveText(label)
  await expect(area(page).getByTestId("set-category")).toBeVisible()
}

async function choose(page: Page, trigger: Locator, option: string) {
  await trigger.click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

// 結果が不明な保存の文（確認するまで同じ保存を送らないことを含む）
const UNKNOWN_INSTANT = "保存できたかを確認できませんでした。確認するまで、この設定は変更できません。"
const UNKNOWN_FORM = "保存できたかを確認できませんでした。確認するまで、もう一度保存できません。"

const heldCount = (page: Page, kind: string) => page.evaluate((k) => window.__fdSaSettingsServer!.heldRequests().filter((h) => h.kind === k).length, kind)
const release = (page: Page, kind: string, options: { which?: "first" | "last" | "all" | number; outcome?: string; respond?: boolean } = {}) =>
  page.evaluate(([k, o]) => window.__fdSaSettingsServer!.release(k as never, o as never), [kind, options] as const)
/**
 * 解放した応答の処理（Promise の継続と React の描画）を、次のタスクまで進める。時間の長さには依存しない
 * （応答の時間で順序を作らず、保留と解放で順序を決めた後に、結果が反映されたことを確かめるために使う）
 */
const flush = (page: Page) => page.evaluate(() => new Promise<void>((r) => setTimeout(() => setTimeout(r, 0), 0)))
const requestsOf = (page: Page, kind: string) => page.evaluate((k) => window.__fdSaSettingsServer!.requests.filter((r) => r.kind === k), kind)

async function chooseScope(page: Page, user: string, workspace?: string) {
  await choose(page, page.getByTestId("set-demo-user"), user)
  if (workspace) await choose(page, page.getByTestId("set-demo-workspace"), workspace)
}

// ------------------------------------------------------------------ 資料のページ
test.describe("Settings page", { tag: "@webkit" }, () => {
  test("one h1, named controls, no horizontal page scroll, inert mocks", async ({ page }) => {
    await page.goto("/#/settings")
    await expect(page.locator("h1")).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const controls = page.locator("main").first().getByRole("button").or(page.locator("main").first().getByRole("link"))
    const n = await controls.count()
    expect(n).toBeGreaterThan(5)
    for (let i = 0; i < n; i++) {
      const c = controls.nth(i)
      if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
    }
    const mocks = page.locator("figure [inert]")
    expect(await mocks.count()).toBeGreaterThanOrEqual(9)
    for (const mock of await mocks.all()) expect(await mock.evaluate((el) => (el as HTMLElement).inert)).toBe(true)
    // 模擬の処理であることを示す
    await expect(page.getByText("保存の結果（模擬のサーバー）").first()).toBeVisible()
  })

  test("320px: no horizontal scroll in the page and the settings area", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto("/#/settings")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    // 狭い領域はカテゴリの一覧から始まる
    await expect(navLink(page, "profile")).toBeVisible()
    await navLink(page, "organization").click()
    await expect(heading(page)).toHaveText("組織")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const box = (await area(page).boundingBox())!
    for (const el of await area(page).locator("input, button, [role=combobox]").all()) {
      if (!(await el.isVisible())) continue
      const b = (await el.boundingBox())!
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1)
    }
  })
})

// ------------------------------------------------------------------ レイアウト、適用範囲、入口、グループ化
test.describe("Settings: layout and scope", () => {
  test("Sidebar layout: categories are grouped by scope with the target named; current is aria-current", async ({ page, isMobile }) => {
    await openPage(page)
    const nav = area(page).getByRole("navigation", { name: "設定のカテゴリ" })
    await expect(nav).toBeVisible()
    await expect(nav).toContainText("個人の設定（佐藤 花子）")
    await expect(nav).toContainText("組織の設定（本社営業部）")
    if (!isMobile) {
      // 広い領域：一覧と内容を並べる。最初は最初のカテゴリ
      await expect(heading(page)).toHaveText("プロフィール")
      await expect(navLink(page, "profile")).toHaveAttribute("aria-current", "page")
      const navBox = (await nav.boundingBox())!
      const content = (await heading(page).boundingBox())!
      expect(content.x).toBeGreaterThan(navBox.x + navBox.width)
    }
    await openCategory(page, "display", "表示と言語")
    await expect(navLink(page, "display")).toHaveAttribute("aria-current", "page")
    await expect(area(page).getByTestId("set-category-scope")).toHaveText("対象：佐藤 花子さん（個人の設定。あなたのアカウントだけに適用されます）")
    await openCategory(page, "organization", "組織")
    await expect(area(page).getByTestId("set-category-scope")).toHaveText("対象：本社営業部（組織の設定。すべてのメンバーに適用されます）")
  })

  test("entries: every category has its own URL; the same name never leads to different settings", async ({ page }) => {
    await openPage(page)
    const hrefs = await area(page).locator("[data-setting-category]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-setting-category"), e.getAttribute("href")]))
    expect(hrefs).toEqual([
      ["profile", "#/settings?category=profile"],
      ["display", "#/settings?category=display"],
      ["notifications", "#/settings?category=notifications"],
      ["security", "#/settings?category=security"],
      ["organization", "#/settings?category=organization"],
      ["members", "#/settings?category=members"],
    ])
    // URL から開くと、そのカテゴリを示す（別のタブで開く場合）
    await page.goto("/#/settings?category=security")
    await expect(heading(page)).toHaveText("ログインとセキュリティ")
  })

  test("personal and org settings are separated by permission: member reads org settings, viewer sees none", async ({ page }) => {
    await openPage(page)
    await chooseScope(page, "鈴木 一郎")
    await expect(area(page).getByRole("navigation")).toContainText("組織の設定（本社営業部）")
    await openCategory(page, "organization", "組織")
    await expect(area(page).getByTestId("set-org-info-readonly")).toHaveText("組織の設定を変更する権限がありません。変更が必要な場合は、管理者に依頼してください。")
    await expect(area(page).getByTestId("set-org-name")).toHaveAttribute("readonly", "")
    await expect(area(page).getByTestId("set-org-info-save")).toHaveCount(0)
    // セキュリティのポリシーとワークスペースの削除は、変更の権限がある利用者だけ
    await expect(area(page).getByTestId("set-org-security")).toHaveCount(0)
    await expect(area(page).getByTestId("set-ws-delete")).toHaveCount(0)
    await openCategory(page, "members", "メンバー")
    await expect(area(page).getByTestId("set-invite-open")).toHaveCount(0)
    await expect(area(page).getByRole("row")).toHaveCount(4)

    await chooseScope(page, "田中 美咲")
    await expect(area(page).locator("[data-setting-category=organization]")).toHaveCount(0)
    await expect(area(page).locator("[data-setting-category=members]")).toHaveCount(0)
    await expect(area(page).getByRole("navigation")).not.toContainText("組織の設定")
  })

  test("grouping: no Card per setting; typography and spacing tokens", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await expect(area(page).getByTestId("set-display")).toBeVisible()
    await expect(area(page).locator("[data-slot=card]")).toHaveCount(0)
    const style = (l: Locator, props: string[]) => l.evaluate((el, p) => p.map((x) => getComputedStyle(el).getPropertyValue(x)), props)
    expect(await style(heading(page), ["font-size", "font-weight"])).toEqual(["24px", "600"])
    expect(await style(area(page).getByTestId("set-display").locator("[data-slot=section-title]").first(), ["font-size", "font-weight"])).toEqual(["20px", "600"])
    const label = area(page).locator("[data-setting-id=timezone] [data-slot=setting-row-label]")
    expect(await style(label, ["font-size", "font-weight"])).toEqual(["14px", "500"])
    expect(await style(area(page).locator("[data-setting-id=timezone] [data-slot=field-description]"), ["font-size"])).toEqual(["14px"])
    // 項目の間 24px、セクションの間 48px
    const rows = area(page).locator("[data-setting-id=timezone]").locator("xpath=..")
    expect(await style(rows, ["row-gap"])).toEqual(["24px"])
    expect(await style(area(page).getByTestId("set-display"), ["row-gap"])).toEqual(["48px"])
  })
})

// ------------------------------------------------------------------ 即時保存と明示的な保存
test.describe("Settings: saving", () => {
  test("instant save: changing the theme saves only that key and announces it in a persistent status region", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    const region = statusText(page, "set-theme-status")
    await expect(region).toHaveText("")
    const before = await region.elementHandle()
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(region).toHaveText("保存しました")
    // 読み上げの領域は作り直さず、中身だけを変える
    expect(await region.evaluate((el, b) => el === b, before)).toBe(true)
    const reqs = await server(page, (s) => s.requests.filter((r) => r.kind === "instant"))
    expect(reqs).toEqual([{ kind: "instant", scope: "u-sato", key: "theme", value: "dark" }])
    expect(await server(page, (s) => s.personalOf("u-sato").display.theme)).toBe("dark")
  })

  test("keyboard: arrow keys change the theme; Space toggles a Switch", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await area(page).getByRole("radio", { name: "端末に合わせる" }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(area(page).getByRole("radio", { name: "ライト" })).toBeChecked()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await openCategory(page, "notifications", "通知")
    const sw = area(page).getByTestId("set-quiet-switch")
    await sw.focus()
    await page.keyboard.press("Space")
    await expect(sw).toBeChecked()
    await expect(statusText(page, "set-quiet-status")).toHaveText("保存しました")
  })

  test("explicit save: nothing is sent until saved; unsaved changes are shown; saving applies the form", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "profile", "プロフィール")
    const name = area(page).getByTestId("set-profile-name")
    await name.fill("佐藤 花子（営業）")
    await expect(statusText(page, "set-profile-status")).toHaveText("保存していない変更があります")
    expect(await server(page, (s) => s.requests.filter((r) => r.kind === "form"))).toEqual([])
    await area(page).getByTestId("set-profile-save").click()
    await expect(statusText(page, "set-profile-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").profile)).toEqual({ name: "佐藤 花子（営業）", title: "営業部 マネージャー", bio: "" })
    await expect(area(page).getByTestId("set-profile-discard")).toBeDisabled()
  })

  test("independent units: saving the security policy keeps the unsaved org info", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "organization", "組織")
    await area(page).getByTestId("set-org-name").fill("本社営業部（東京）")
    await expect(statusText(page, "set-org-info-status")).toHaveText("保存していない変更があります")
    // 規制を緩める変更（確認なし）
    await area(page).getByTestId("set-policy-allowSocialLogin").click()
    await area(page).getByTestId("set-policy-save").click()
    await expect(statusText(page, "set-policy-status")).toHaveText("保存しました")
    await expect(area(page).getByTestId("set-org-name")).toHaveValue("本社営業部（東京）")
    await expect(statusText(page, "set-org-info-status")).toHaveText("保存していない変更があります")
    const org = await server(page, (s) => s.orgOf("hq"))
    expect(org.info.name).toBe("本社営業部")
    expect(org.security.allowSocialLogin).toBe(false)
  })

  test("instant save failure: the display returns to the value actually saved", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await server(page, (s) => (s.outcomeQueue.instant = ["fail"]))
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存できなかったため、元の設定に戻しました。")
    await expect(area(page).getByRole("radio", { name: "端末に合わせる" })).toBeChecked()
    expect(await server(page, (s) => s.personalOf("u-sato").display.theme)).toBe("system")
  })

  test("explicit save failure: the input is kept; retry saves it", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "profile", "プロフィール")
    await server(page, (s) => (s.outcomeQueue.form = ["fail"]))
    await area(page).getByTestId("set-profile-title").fill("営業部 部長")
    await area(page).getByTestId("set-profile-save").click()
    await expect(statusText(page, "set-profile-status")).toHaveText("保存できませんでした。入力した内容は残っています。もう一度保存してください。")
    await expect(area(page).getByTestId("set-profile-title")).toHaveValue("営業部 部長")
    expect(await server(page, (s) => s.personalOf("u-sato").profile.title)).toBe("営業部 マネージャー")
    await area(page).getByTestId("set-profile-save").click()
    await expect(statusText(page, "set-profile-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").profile.title)).toBe("営業部 部長")
  })

  test("unknown result (instant): not rolled back; 'confirm' re-reads the server", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await server(page, (s) => (s.outcomeQueue.instant = ["unknown"]))
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText(UNKNOWN_INSTANT)
    await expect(area(page).getByTestId("set-theme-status").getByRole("status")).toHaveClass(/text-warning/)
    // 戻さない
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
    const gets = (await server(page, (s) => s.requests.filter((r) => r.kind === "get").length)) as number
    await area(page).getByTestId("set-theme-status").getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.requests.filter((r) => r.kind === "get").length)).toBe(gets + 1)
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
  })

  test("unknown result (explicit): confirm shows that it was not saved and keeps the input", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "profile", "プロフィール")
    await server(page, (s) => (s.outcomeQueue.form = ["unknown"]))
    await area(page).getByTestId("set-profile-bio").fill("法人営業を担当しています。")
    await area(page).getByTestId("set-profile-save").click()
    await expect(statusText(page, "set-profile-status")).toHaveText(UNKNOWN_FORM)
    // この模擬のサーバーでは unknown でも処理される。確認の前に、ほかの端末で元の内容に戻された状態を作る
    await server(page, (s) => s.setProfileElsewhere("u-sato", { name: "佐藤 花子", title: "営業部 マネージャー", bio: "" }))
    await area(page).getByTestId("set-profile-status").getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(statusText(page, "set-profile-status")).toHaveText("保存されていませんでした。入力した内容は残っています。")
    await expect(area(page).getByTestId("set-profile-bio")).toHaveValue("法人営業を担当しています。")
    // もう一度保存できる
    await area(page).getByTestId("set-profile-save").click()
    await expect(statusText(page, "set-profile-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").profile.bio)).toBe("法人営業を担当しています。")
  })

  test("consecutive changes: the older response, answered last, does not overwrite the latest value", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    // 応答の順序は、応答の時間ではなく、保留と解放で決める
    await server(page, (s) => (s.hold.instant = true))
    await choose(page, area(page).getByTestId("set-timezone"), "イギリス（ロンドン）")
    await choose(page, area(page).getByTestId("set-timezone"), "シンガポール")
    await expect.poll(() => heldCount(page, "instant")).toBe(2)
    // 新しい要求を先に処理する
    await release(page, "instant", { which: "last" })
    await expect(statusText(page, "set-timezone-status")).toHaveText("保存しました")
    // 古い要求を後から処理する（サーバーは受け付けた順の番号で比べ、適用しない）
    await release(page, "instant")
    await flush(page)
    await expect(area(page).getByTestId("set-timezone")).toHaveText("シンガポール")
    await expect(statusText(page, "set-timezone-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").display.timezone)).toBe("Asia/Singapore")
    expect(await server(page, (s) => s.applied.filter((a) => a.key === "timezone").map((a) => a.value))).toEqual(["Asia/Singapore"])
  })

  // 仕様：スコープが変わった後に届いた保存の応答は、戻った A の画面に反映しない（保存を始めた画面ではないため、
  // 「保存しました」を示さない）。戻った A は、戻った時点でサーバーの値を取得して表示する。
  test("workspace A → B → A (save finishes during B): the returned A shows the latest server value, not the old save state", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "organization", "組織")
    await server(page, (s) => {
      s.ignoreAbort = true // 取得の要求も中止に従わない（B の取得の応答が遅れて届いても、A に表示しない）
      s.hold.form = true
    })
    await area(page).getByTestId("set-org-name").fill("本社営業部（旧）")
    await area(page).getByTestId("set-org-info-save").click()
    await expect(statusText(page, "set-org-info-status")).toHaveText("保存中…")
    await expect.poll(() => heldCount(page, "form")).toBe(1)
    await choose(page, page.getByTestId("set-demo-workspace"), "西日本営業部")
    await expect(area(page).getByTestId("set-category-scope")).toContainText("西日本営業部")
    // B の間に、A の保存をサーバーで処理して応答する
    await release(page, "form")
    expect(await server(page, (s) => s.orgOf("hq").info.name)).toBe("本社営業部（旧）")
    await flush(page)
    await choose(page, page.getByTestId("set-demo-workspace"), "本社営業部")
    await expect(area(page).getByTestId("set-org-name")).toHaveValue("本社営業部（旧）")
    await expect(statusText(page, "set-org-info-status")).toHaveText("")
    await flush(page)
    await expect(area(page).getByText("保存しました")).toHaveCount(0)
  })

  test("workspace A → B → A (return before the save finishes): no old result is shown; A shows the value fetched on return", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "organization", "組織")
    await server(page, (s) => {
      s.ignoreAbort = true
      s.hold.form = true
    })
    await area(page).getByTestId("set-org-name").fill("本社営業部（旧）")
    await area(page).getByTestId("set-org-info-save").click()
    await expect.poll(() => heldCount(page, "form")).toBe(1)
    await choose(page, page.getByTestId("set-demo-workspace"), "西日本営業部")
    await expect(area(page).getByTestId("set-category-scope")).toContainText("西日本営業部")
    await choose(page, page.getByTestId("set-demo-workspace"), "本社営業部")
    // 戻った時点のサーバーの値（保存はまだ処理されていない）
    await expect(area(page).getByTestId("set-org-name")).toHaveValue("本社営業部")
    expect(await server(page, (s) => s.orgOf("hq").info.name)).toBe("本社営業部")
    // 最初の A の保存を、戻った後に処理して応答する
    await release(page, "form")
    expect(await server(page, (s) => s.orgOf("hq").info.name)).toBe("本社営業部（旧）")
    await flush(page)
    // 前の A の保存の応答は、戻った A の状態の表示に反映しない
    await expect(statusText(page, "set-org-info-status")).toHaveText("")
    await expect(area(page).getByTestId("set-org-name")).toHaveValue("本社営業部")
    // 取得し直すと、最新のサーバーの値を表示する
    await openCategory(page, "members", "メンバー")
    await openCategory(page, "organization", "組織")
    await expect(area(page).getByTestId("set-org-name")).toHaveValue("本社営業部（旧）")
  })

  // 変更の要求には、画面の移動で中止される signal を渡さない（中止しても、実際のサーバーでは処理される場合があるため、
  // 画面を移っただけで変更を失わせない）。移った後の応答は画面に反映せず、戻ったときに取得し直した値を表示する。
  test("leaving the category during an instant save: the change is not lost and the late response throws nothing", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await server(page, (s) => (s.hold.instant = true))
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    await openCategory(page, "profile", "プロフィール")
    // 画面を移った後に、サーバーで処理して応答する（変更の要求には中止の signal を渡していない）
    await release(page, "instant")
    expect(await server(page, (s) => s.personalOf("u-sato").display.theme)).toBe("dark")
    await flush(page)
    await openCategory(page, "display", "表示と言語")
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
    // 別の画面のインスタンスの「保存しました」を引き継がない
    await expect(statusText(page, "set-theme-status")).toHaveText("")
  })

  test("unsaved changes: leaving a dirty form asks first; keep editing or discard", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "profile", "プロフィール")
    await area(page).getByTestId("set-profile-name").fill("佐藤 花子（下書き）")
    const leave = async () => {
      if (await backLink(page).isVisible()) await backLink(page).click()
      else await navLink(page, "display").click()
    }
    await leave()
    const dialog = page.locator("[data-slot=unsaved-changes-dialog]")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "編集を続ける" })).toBeFocused()
    await dialog.getByRole("button", { name: "編集を続ける" }).click()
    await expect(heading(page)).toHaveText("プロフィール")
    await expect(area(page).getByTestId("set-profile-name")).toHaveValue("佐藤 花子（下書き）")
    await leave()
    await page.locator("[data-slot=unsaved-changes-dialog]").getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.locator("[data-slot=unsaved-changes-dialog]")).toBeHidden()
    expect(await server(page, (s) => s.personalOf("u-sato").profile.name)).toBe("佐藤 花子")
    await openCategory(page, "profile", "プロフィール")
    await expect(area(page).getByTestId("set-profile-name")).toHaveValue("佐藤 花子")
  })
})

// ------------------------------------------------------------------ 保存の結果の分類とサーバーでの順序（v0.1 の最終調整）
// 応答の順序は、応答の時間ではなく、模擬のサーバーの保留（hold）と解放（release）で決める。
const contractRadio = (page: Page, label: string) => page.getByTestId("set-demo").getByText(label, { exact: true })

test.describe("Settings: save results and server ordering", () => {
  test("ON → OFF → ON answered in reverse order (server applies in received order): display and server end with ON", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "notifications", "通知")
    await server(page, (s) => (s.hold.instant = true))
    const sw = area(page).getByTestId("set-quiet-switch")
    await sw.click()
    await sw.click()
    await sw.click()
    await expect(sw).toBeChecked()
    await expect.poll(() => heldCount(page, "instant")).toBe(3)
    await release(page, "instant", { which: "last" }) // 3 回目（ON）
    await release(page, "instant", { which: "last" }) // 2 回目（OFF）
    await release(page, "instant") // 1 回目（ON）
    await flush(page)
    await expect(sw).toBeChecked()
    await expect(statusText(page, "set-quiet-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").display.quietEnabled)).toBe(true)
    // 受け付けた順の番号で比べ、後から処理した古い要求は適用していない
    expect(await server(page, (s) => s.applied.filter((a) => a.key === "quietEnabled").map((a) => a.value))).toEqual([true])
  })

  test("without a server ordering guarantee, showing only the latest response does not prove the server value", async ({ page }) => {
    await openPage(page)
    await contractRadio(page, "処理した順に適用する（順序の保証なし）").click()
    await openCategory(page, "notifications", "通知")
    await server(page, (s) => (s.hold.instant = true))
    const sw = area(page).getByTestId("set-quiet-switch")
    await sw.click()
    await sw.click()
    await sw.click()
    await expect.poll(() => heldCount(page, "instant")).toBe(3)
    await release(page, "instant") // 1 回目（ON）
    await release(page, "instant", { which: "last" }) // 3 回目（ON）：最新の要求の応答
    await release(page, "instant") // 2 回目（OFF）：古い要求が最後に処理される
    await flush(page)
    // 画面は最新の要求の応答（ON）を示すが、サーバーには古い要求の値（OFF）が残る。
    // これは Registry では防げない（製品の API が直列化か版の照合を保証する。docs の「サーバーでの保存の順序」）
    await expect(sw).toBeChecked()
    await expect(statusText(page, "set-quiet-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").display.quietEnabled)).toBe(false)
    // 取得し直すと、サーバーの値を示す
    await openCategory(page, "display", "表示と言語")
    await openCategory(page, "notifications", "通知")
    await expect(area(page).getByTestId("set-quiet-switch")).not.toBeChecked()
  })

  test("versioned saves are serialized per item: ON → OFF → ON sends one request; later changes wait and carry the new version", async ({ page }) => {
    await openPage(page)
    await contractRadio(page, "版の番号で競合を検出する（即時保存を項目ごとに直列にする）").click()
    await openCategory(page, "notifications", "通知")
    await server(page, (s) => (s.hold.instant = true))
    const sw = area(page).getByTestId("set-quiet-switch")
    await sw.click()
    await sw.click()
    await sw.click()
    await expect(sw).toBeChecked()
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    await release(page, "instant")
    await flush(page)
    await expect(statusText(page, "set-quiet-status")).toHaveText("保存しました")
    // 待っていた最後の変更（ON）はサーバーで確認できた値と同じため、送らない
    expect((await requestsOf(page, "instant")).length).toBe(1)
    // OFF → ON：OFF の応答を待ってから、ON を新しい版で送る（競合にならない）
    await sw.click()
    await sw.click()
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    await release(page, "instant")
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    await release(page, "instant")
    await expect(statusText(page, "set-quiet-status")).toHaveText("保存しました")
    expect((await requestsOf(page, "instant")).map((r) => r.value)).toEqual([true, false, true])
    expect(await server(page, (s) => s.personalOf("u-sato").display.quietEnabled)).toBe(true)
    expect(await server(page, (s) => s.versionOf("u-sato:quietEnabled"))).toBe(3)
  })

  test("versioned conflict: a change made elsewhere is detected; the display is kept until confirmed, then shows the server value", async ({ page }) => {
    await openPage(page)
    await contractRadio(page, "版の番号で競合を検出する（即時保存を項目ごとに直列にする）").click()
    await openCategory(page, "display", "表示と言語")
    // 画面が設定と版を取得し終えてから、ほかの場所で変更する（取得の応答に、ほかの場所の変更を含めない）
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeVisible()
    await expect(area(page).getByTestId("set-display-loading")).toHaveCount(0)
    await server(page, (s) => s.setDisplayElsewhere("u-sato", "theme", "light"))
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    const status = area(page).getByTestId("set-theme-status")
    await expect(status.getByRole("status")).toHaveText("ほかの場所で変更されていたため、保存しませんでした。確認すると、現在保存されている設定を表示します。")
    await expect(status).toHaveAttribute("data-state", "conflict")
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
    // 確認するまで、同じ項目を送らない（古い版で送っても、また競合になる）
    await area(page).getByRole("radio", { name: "端末に合わせる" }).click({ force: true })
    expect((await requestsOf(page, "instant")).length).toBe(1)
    await status.getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(status.getByRole("status")).toHaveText("保存されていませんでした。現在保存されている設定を表示しています。")
    await expect(area(page).getByRole("radio", { name: "ライト" })).toBeChecked()
    // 確認した版で、もう一度変更できる
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(status.getByRole("status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").display.theme)).toBe("dark")
  })

  // H2：結果が不明な項目の、最後に確認できた値は「未確認」。等しいことを理由に送らないことと、確定した失敗で「元に戻した」と示すことをしない
  test("versioned: a change waiting behind an unknown result is sent even if it equals the last confirmed value", async ({ page }) => {
    await openPage(page)
    await contractRadio(page, "版の番号で競合を検出する（即時保存を項目ごとに直列にする）").click()
    await openCategory(page, "notifications", "通知")
    await server(page, (s) => (s.hold.instant = true))
    const sw = area(page).getByTestId("set-quiet-switch")
    const status = area(page).getByTestId("set-quiet-status")
    await sw.click() // OFF（確認済み）→ ON：送る
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    await sw.click() // ON → OFF：前の要求の結果を待つ
    await expect(sw).not.toBeChecked()
    // サーバーは ON を保存し、クライアントには結果の不明を返す
    await release(page, "instant", { outcome: "unknown" })
    // 待っていた OFF は確認済みの OFF と等しいが、確認済みの値は未確認になったため、送る（最後に確認できた版 0 で）
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    expect((await requestsOf(page, "instant")).map((r) => r.value)).toEqual([true, false])
    await expect(status).toHaveAttribute("data-state", "saving")
    await release(page, "instant")
    // サーバーの版は 1（ON）。版 0 の要求は拒否され、「保存しました」とは示さない
    await expect(status).toHaveAttribute("data-state", "conflict")
    expect(await server(page, (s) => s.personalOf("u-sato").display.quietEnabled)).toBe(true)
    await status.getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(status.getByRole("status")).toHaveText("保存されていませんでした。現在保存されている設定を表示しています。")
    await expect(sw).toBeChecked()
  })

  test("versioned (whileUnknown: allow): changing back to the confirmed value after an unknown result is sent, not reported as saved", async ({ page }) => {
    await openPage(page)
    await contractRadio(page, "版の番号で競合を検出する（即時保存を項目ごとに直列にする）").click()
    await openCategory(page, "notifications", "通知")
    await server(page, (s) => (s.hold.instant = true))
    const sw = area(page).getByTestId("set-quiet-switch")
    const status = area(page).getByTestId("set-quiet-status")
    await sw.click()
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    await release(page, "instant", { outcome: "unknown" })
    await expect(status).toHaveAttribute("data-state", "unknown")
    await expect(sw).toBeChecked()
    // 版の照合では、結果が不明な間も変更できる。確認済みの値（OFF）に戻す変更を送る
    await sw.click()
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    expect((await requestsOf(page, "instant")).map((r) => r.value)).toEqual([true, false])
    await release(page, "instant")
    await expect(status).toHaveAttribute("data-state", "conflict")
    expect(await server(page, (s) => s.personalOf("u-sato").display.quietEnabled)).toBe(true)
  })

  test("a definite failure after an older unknown result is not shown as 'returned to the original setting'", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "notifications", "通知")
    await server(page, (s) => (s.hold.instant = true))
    const sw = area(page).getByTestId("set-quiet-switch")
    const status = area(page).getByTestId("set-quiet-status")
    await sw.click() // ON（1 回目）
    await sw.click() // OFF（2 回目）
    await expect.poll(() => heldCount(page, "instant")).toBe(2)
    // 1 回目：サーバーは ON を保存し、結果の不明を返す（最新の要求ではないため、表示は保存中のまま）
    await release(page, "instant", { outcome: "unknown" })
    await flush(page)
    await expect(status).toHaveAttribute("data-state", "saving")
    // 2 回目：処理されなかった（確定した失敗）。サーバーは ON。確認済みの OFF へ戻したとは示さない
    await release(page, "instant", { outcome: "fail" })
    await expect(status).toHaveAttribute("data-state", "unknown")
    await expect(status).toHaveAttribute("data-reason", "unconfirmed")
    await expect(status.getByRole("status")).toHaveText(
      "保存できませんでした。前の保存の結果を確認できていないため、現在保存されている設定を確認してください。確認するまで、この設定は変更できません。"
    )
    expect(await server(page, (s) => s.personalOf("u-sato").display.quietEnabled)).toBe(true)
    // 確認するまで送らない
    await sw.click({ force: true })
    expect((await requestsOf(page, "instant")).length).toBe(2)
    await status.getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(status.getByRole("status")).toHaveText("保存されていませんでした。現在保存されている設定を表示しています。")
    await expect(sw).toBeChecked()
  })

  // M2：replace の後に届いた、replace の前に送った要求の成功は、最後に確認できた値と版を変えない
  test("versioned: a success that arrives after replace (re-fetch) does not restore the older value and version", async ({ page }) => {
    await openPage(page)
    await contractRadio(page, "版の番号で競合を検出する（即時保存を項目ごとに直列にする）").click()
    await openCategory(page, "display", "表示と言語")
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeVisible()
    await expect(area(page).getByTestId("set-display-loading")).toHaveCount(0)
    await server(page, (s) => (s.hold.instant = true))
    await area(page).getByRole("radio", { name: "ダーク" }).click() // 版 0 で送る
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    // サーバーで処理し（ダーク、版 1）、応答だけを保留する
    await release(page, "instant", { respond: false })
    expect(await server(page, (s) => s.versionOf("u-sato:theme"))).toBe(1)
    // 応答が届く前に、ほかの場所でライトに変え（版 2）、画面が取得し直す（replace）
    await server(page, (s) => s.setDisplayElsewhere("u-sato", "theme", "light"))
    await area(page).getByTestId("set-display-reload-button").click()
    await expect(area(page).getByTestId("set-display-reload-status")).toHaveText("サーバーに保存されている設定を表示しています。")
    await expect(area(page).getByRole("radio", { name: "ライト" })).toBeChecked()
    // replace の前に送った要求の成功（ダーク、版 1）が届く。表示と、確認できた値と版を変えない
    await release(page, "instant")
    await flush(page)
    await expect(area(page).getByRole("radio", { name: "ライト" })).toBeChecked()
    // ダークを選ぶ：確認できた値（ライト）と異なるため送り、版 2 で受け付けられる
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    expect((await requestsOf(page, "instant")).map((r) => r.value)).toEqual(["dark", "dark"])
    await release(page, "instant")
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").display.theme)).toBe("dark")
    expect(await server(page, (s) => s.versionOf("u-sato:theme"))).toBe(3)
  })

  // 修正の確認の指摘：取得し直しを続けて押し、応答の順が入れ替わった場合、古い取得の値で上書きしない
  test("re-fetch pressed twice: only the last re-fetch is applied even if the first one answers later", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await expect(area(page).getByTestId("set-display-loading")).toHaveCount(0)
    await server(page, (s) => (s.hold.get = true))
    // 1 回目の取得：サーバーで読み（ライト）、応答だけを保留する
    await server(page, (s) => s.setDisplayElsewhere("u-sato", "theme", "light"))
    await area(page).getByTestId("set-display-reload-button").click()
    await expect.poll(() => heldCount(page, "get")).toBe(1)
    await release(page, "get", { respond: false })
    // ほかの場所でダークに変え、2 回目の取得（ダーク）を先に届ける
    await server(page, (s) => s.setDisplayElsewhere("u-sato", "theme", "dark"))
    await area(page).getByTestId("set-display-reload-button").click()
    await expect.poll(() => heldCount(page, "get")).toBe(2)
    await release(page, "get", { which: "last" })
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
    await expect(area(page).getByTestId("set-display-reload-status")).toHaveText("サーバーに保存されている設定を表示しています。")
    // 古い 1 回目の応答（ライト）が後から届いても、表示を変えない
    await server(page, (s) => (s.hold.get = false))
    await release(page, "get", { which: "all" })
    await flush(page)
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
  })

  test("unknown result: the same item is not sent again until confirmed; other items stay independent; a change during confirmation is not sent", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await server(page, (s) => (s.outcomeQueue.instant = ["unknown"]))
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText(UNKNOWN_INSTANT)
    await area(page).getByRole("radio", { name: "ライト" }).click({ force: true })
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
    expect((await requestsOf(page, "instant")).length).toBe(1)
    // 標準に戻す操作も、確認するまで送らない
    await expect(area(page).getByTestId("set-display-reset-button")).toBeDisabled()
    await expect(area(page).getByTestId("set-display-reset")).toContainText("テーマの保存の結果を確認するまで、標準に戻せません。")
    // ほかの項目は変更できる
    await choose(page, area(page).getByTestId("set-timezone"), "イギリス（ロンドン）")
    await expect(statusText(page, "set-timezone-status")).toHaveText("保存しました")
    // 確認の取得を保留する。確認中の変更も送らない
    await server(page, (s) => (s.hold.get = true))
    await area(page).getByTestId("set-theme-status").getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存されたかを確認しています…")
    await area(page).getByRole("radio", { name: "ライト" }).click({ force: true })
    expect((await requestsOf(page, "instant")).length).toBe(2)
    await expect.poll(() => heldCount(page, "get")).toBe(1)
    await release(page, "get")
    // 模擬のサーバーは unknown でも処理している
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
    await area(page).getByRole("radio", { name: "ライト" }).click()
    await expect(area(page).getByRole("radio", { name: "ライト" })).toBeChecked()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
  })

  test("the client stopping its wait (AbortError) is not treated as 'not saved': the save is shown as unknown and confirmed", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await server(page, (s) => (s.hold.instant = true))
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    // サーバーは処理し、クライアントには AbortError を返す（製品の待機の打ち切りなど）
    await release(page, "instant", { outcome: "client-abort" })
    const status = area(page).getByTestId("set-theme-status")
    await expect(status.getByRole("status")).toHaveText("応答を待つのを中止しました。保存されたかは確認が必要です。確認するまで、この設定は変更できません。")
    await expect(status).toHaveAttribute("data-state", "unknown")
    await expect(status).toHaveAttribute("data-reason", "aborted")
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
    expect(await server(page, (s) => s.personalOf("u-sato").display.theme)).toBe("dark")
    await status.getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(status.getByRole("status")).toHaveText("保存しました")
  })

  test("a response without the saved item is not treated as success", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await server(page, (s) => (s.omitResponseKeys = ["theme"]))
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    const status = area(page).getByTestId("set-theme-status")
    await expect(status.getByRole("status")).toHaveText(
      "保存の応答にこの設定の値が含まれていなかったため、保存できたかを確認できませんでした。確認するまで、この設定は変更できません。"
    )
    await expect(status).toHaveAttribute("data-reason", "missing")
    await status.getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(status.getByRole("status")).toHaveText("保存しました")
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
  })

  test("server-side normalization: the saved (trimmed) value is shown and the form is not dirty", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "profile", "プロフィール")
    await area(page).getByTestId("set-profile-name").fill("  佐藤 花子（営業）  ")
    await area(page).getByTestId("set-profile-save").click()
    await expect(statusText(page, "set-profile-status")).toHaveText("保存しました")
    await expect(area(page).getByTestId("set-profile-name")).toHaveValue("佐藤 花子（営業）")
    await expect(area(page).getByTestId("set-profile-discard")).toBeDisabled()
    expect(await server(page, (s) => s.personalOf("u-sato").profile.name)).toBe("佐藤 花子（営業）")
  })

  test("reset with a partial result: saved items show the server value, the rejected item returns to its saved value", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await choose(page, area(page).getByTestId("set-timezone"), "イギリス（ロンドン）")
    await expect(statusText(page, "set-timezone-status")).toHaveText("保存しました")
    await server(page, (s) => (s.batchReject = ["timezone"]))
    await area(page).getByTestId("set-display-reset-button").click()
    await expect(area(page).getByTestId("set-display-reset-status")).toHaveText("一部の項目だけを標準に戻しました。項目ごとの状態を確かめてください。")
    await expect(area(page).getByRole("radio", { name: "端末に合わせる" })).toBeChecked()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await expect(statusText(page, "set-timezone-status")).toHaveText("この値は保存できなかったため、元の設定に戻しました。")
    await expect(area(page).getByTestId("set-timezone")).toHaveText("イギリス（ロンドン）")
    const d = await server(page, (s) => s.personalOf("u-sato").display)
    expect([d.theme, d.timezone]).toEqual(["system", "Europe/London"])
  })

  test("explicit save: no request without changes; no second save while the result is unknown", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "profile", "プロフィール")
    await area(page).getByTestId("set-profile-save").click()
    await expect(area(page).getByTestId("set-profile-blocked")).toHaveText("変更がないため、保存していません。")
    expect(await requestsOf(page, "form")).toEqual([])
    await server(page, (s) => (s.outcomeQueue.form = ["unknown"]))
    await area(page).getByTestId("set-profile-bio").fill("確認の前の文")
    await expect(area(page).getByTestId("set-profile-blocked")).toHaveText("")
    await area(page).getByTestId("set-profile-save").click()
    await expect(statusText(page, "set-profile-status")).toHaveText(UNKNOWN_FORM)
    await area(page).getByTestId("set-profile-save").click()
    await expect(area(page).getByTestId("set-profile-blocked")).toHaveText("前の保存の結果を確認するまで、もう一度保存できません。「保存されたかを確認」で確かめてください。")
    expect((await requestsOf(page, "form")).length).toBe(1)
    await area(page).getByTestId("set-profile-status").getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(statusText(page, "set-profile-status")).toHaveText("保存しました")
    await expect(area(page).getByTestId("set-profile-blocked")).toHaveText("")
  })
})

// ------------------------------------------------------------------ 依存関係と継承
test.describe("Settings: inheritance and restrictions", () => {
  test("language: the org default is used until the user overrides it", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    const row = area(page).locator("[data-setting-id=language]")
    await expect(area(page).getByTestId("set-language")).toHaveText("組織の標準（日本語）")
    await expect(row).toContainText("組織（本社営業部）の標準の言語を使っています。")
    await choose(page, area(page).getByTestId("set-language"), "English")
    await expect(statusText(page, "set-language-status")).toHaveText("保存しました")
    await expect(row).toContainText("あなたが選んだ言語を使っています。組織の標準は日本語です。")
    expect(await server(page, (s) => s.personalOf("u-sato").display.language)).toBe("en")
    await choose(page, area(page).getByTestId("set-language"), "組織の標準（日本語）")
    await expect(statusText(page, "set-language-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").display.language)).toBe(null)
  })

  test("parent off keeps the child value; the effective behavior is shown separately", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "notifications", "通知")
    await area(page).getByTestId("set-quiet-switch").click()
    await expect(area(page).getByTestId("set-quiet-effective")).toHaveText("現在の動作：22:00〜07:00 の通知を止めています。")
    await choose(page, area(page).getByTestId("set-quiet-start"), "23:00")
    await expect(statusText(page, "set-quiet-start-status")).toHaveText("保存しました")
    await area(page).getByTestId("set-quiet-switch").click()
    await expect(statusText(page, "set-quiet-status")).toHaveText("保存しました")
    await expect(area(page).getByTestId("set-quiet-start")).toHaveText("23:00")
    await expect(area(page).getByTestId("set-quiet-children")).toContainText("「通知を止める時間帯」がオフのため、この時刻は使われていません。値は保持しています。")
    await expect(area(page).getByTestId("set-quiet-effective")).toHaveText("現在の動作：通知を止めていません。")
    const d = await server(page, (s) => s.personalOf("u-sato").display)
    expect([d.quietEnabled, d.quietStart, d.quietEnd]).toEqual([false, "23:00", "07:00"])
  })

  test("org policy: MFA cannot be disabled where required; the personal value is kept and shown", async ({ page }) => {
    await openPage(page)
    // 西日本営業部（MFA は必須ではない）で、個人の 2 段階認証を無効にする（確認の後に保存）
    await chooseScope(page, "佐藤 花子", "西日本営業部")
    await openCategory(page, "security", "ログインとセキュリティ")
    const mfa = area(page).getByTestId("set-mfa")
    await expect(mfa).toBeEnabled()
    await mfa.click()
    const confirm = page.getByTestId("set-mfa-confirm")
    await expect(confirm).toBeVisible()
    expect(await server(page, (s) => s.requests.filter((r) => r.kind === "instant").length)).toBe(0)
    // 取り消せる設定の変更のため、確定のボタンは Destructive にしない
    const destructive = await page.evaluate(() => {
      const el = document.createElement("div")
      el.style.color = "var(--destructive)"
      document.body.append(el)
      const c = getComputedStyle(el).color
      el.remove()
      return c
    })
    expect(await confirm.getByRole("button", { name: "無効にする" }).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(destructive)
    await confirm.getByRole("button", { name: "無効にする" }).click()
    await expect(statusText(page, "set-mfa-status")).toHaveText("保存しました")
    await expect(mfa).not.toBeChecked()
    // SSO が必須の組織では、外部アカウントを接続できない（理由を示す）
    await expect(area(page).locator("[data-setting-id=google]")).toContainText("接続中：hanako.sato@example.com")
    // 本社営業部（MFA が必須）：有効で固定し、理由と保持している個人の値を示す
    await choose(page, page.getByTestId("set-demo-workspace"), "本社営業部")
    await expect(area(page).getByTestId("set-mfa")).toBeDisabled()
    await expect(area(page).getByTestId("set-mfa")).toBeChecked()
    await expect(area(page).getByTestId("set-mfa")).toHaveAccessibleDescription(
      "組織（本社営業部）のポリシーで必須のため、無効にできません。あなたの設定（オフ）は保持しており、ポリシーが変わると使われます。"
    )
    expect(await server(page, (s) => s.personalOf("u-sato").display.mfa)).toBe(false)
  })

  test("a personal save that arrives while the org policy changes: the personal value is saved; the policy decides the effective value", async ({ page }) => {
    await openPage(page)
    await chooseScope(page, "佐藤 花子", "西日本営業部")
    await openCategory(page, "security", "ログインとセキュリティ")
    await server(page, (s) => (s.hold.instant = true))
    await area(page).getByTestId("set-mfa").click()
    await page.getByTestId("set-mfa-confirm").getByRole("button", { name: "無効にする" }).click()
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    // 保存の応答が届く前に、ほかの管理者が多要素認証を必須にした
    await server(page, (s) => s.setSecurityElsewhere("west", { requireMfa: true }))
    await release(page, "instant")
    // 保存したのは個人の値（オフ）。保存の結果だけで、実際に適用される値が変わったと示さない
    await expect(statusText(page, "set-mfa-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").display.mfa)).toBe(false)
    // ポリシーを取得し直すと、必須のため有効に固定し、保持している個人の値を示す
    await openCategory(page, "profile", "プロフィール")
    await openCategory(page, "security", "ログインとセキュリティ")
    await expect(area(page).getByTestId("set-mfa")).toBeDisabled()
    await expect(area(page).getByTestId("set-mfa")).toBeChecked()
    await expect(area(page).getByTestId("set-mfa")).toHaveAccessibleDescription(
      "組織（西日本営業部）のポリシーで必須のため、無効にできません。あなたの設定（オフ）は保持しており、ポリシーが変わると使われます。"
    )
  })

  test("plan and dependency in the org policy: SSO needs the business plan; SSO required makes social login unused", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "organization", "組織")
    await expect(area(page).getByTestId("set-policy-requireSso")).toBeDisabled()
    await expect(area(page).locator("[data-setting-id=require-sso]")).toContainText("スタンダードプランでは使えません。ビジネスプランで使えます。")
    await expect(area(page).locator("[data-setting-id=allow-social]")).toContainText("メンバーが個人の設定で Google アカウントを接続できます。")
  })

  test("a member without edit permission cannot change org settings; the server rejects a stale-permission save", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "organization", "組織")
    await area(page).getByTestId("set-org-name").fill("本社営業部（変更）")
    // サーバーでロールが変わったが、画面にはまだ反映していない（古い権限の画面）
    await page.getByTestId("set-demo-demote-server").click()
    await expect(page.getByTestId("set-demo-roles")).toHaveText("画面の権限：管理者　サーバーのロール：メンバー")
    await area(page).getByTestId("set-org-info-save").click()
    // 権限不足で拒否され、権限を取り直して閲覧だけの表示に変わる。保存されていないことを示す
    await expect(area(page).getByTestId("set-org-permission-notice")).toContainText("あなたのロールが変更されたため、組織の設定を変更できなくなりました。保存していない変更は反映されていません。")
    await expect(area(page).getByTestId("set-org-info-readonly")).toBeVisible()
    await expect(area(page).getByTestId("set-org-info-save")).toHaveCount(0)
    await expect(area(page).getByTestId("set-org-security")).toHaveCount(0)
    await expect(page.getByTestId("set-demo-roles")).toHaveText("画面の権限：メンバー　サーバーのロール：メンバー")
    expect(await server(page, (s) => s.orgOf("hq").info.name)).toBe("本社営業部")
  })

  test("permission change during a save: the operation is locked at once and its result is not shown", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "organization", "組織")
    await server(page, (s) => (s.hold.form = true))
    await area(page).getByTestId("set-org-name").fill("本社営業部（変更）")
    await area(page).getByTestId("set-org-info-save").click()
    await expect(statusText(page, "set-org-info-status")).toHaveText("保存中…")
    await expect.poll(() => heldCount(page, "form")).toBe(1)
    await page.getByTestId("set-demo-demote-both").click()
    await expect(area(page).getByTestId("set-org-info-save")).toHaveCount(0)
    await expect(area(page).getByTestId("set-org-name")).toHaveAttribute("readonly", "")
    // 権限が変わった後に、サーバーが処理する（処理の時点のロールで判断し、拒否する）
    await release(page, "form")
    await flush(page)
    await expect(area(page).getByText("保存しました")).toHaveCount(0)
    expect(await server(page, (s) => s.orgOf("hq").info.name)).toBe("本社営業部")
  })
})

// ------------------------------------------------------------------ 検索、リセット、取り消せない操作
test.describe("Settings: search, reset, destructive actions", () => {
  test.use({ reducedMotion: "reduce" })

  test("search by alias moves to the setting and focuses it", async ({ page }) => {
    await openPage(page)
    await area(page).getByTestId("set-search-open").click()
    const input = page.getByTestId("set-search-input")
    await expect(input).toBeFocused()
    await input.fill("ダークモード")
    await expect(page.getByRole("option")).toHaveCount(1)
    await expect(page.getByRole("option")).toContainText("テーマ")
    await page.keyboard.press("Enter")
    await expect(heading(page)).toHaveText("表示と言語")
    await expect.poll(() => page.evaluate(() => (document.activeElement?.closest("[data-setting-id]") as HTMLElement | null)?.dataset.settingId)).toBe("theme")
    // 移動先の項目は画面の中に表示されている
    await expect(area(page).locator("[data-setting-id=theme]")).toBeInViewport()
  })

  test("search by category name, and a setting on another page (organization)", async ({ page }) => {
    await openPage(page)
    await area(page).getByTestId("set-search-open").click()
    await page.getByTestId("set-search-input").fill("組織名")
    await page.getByRole("option", { name: /組織名/ }).click()
    await expect(heading(page)).toHaveText("組織")
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid)).toBe("set-org-name")
  })

  test("search excludes sensitive settings the user cannot access", async ({ page }) => {
    await openPage(page)
    await area(page).getByTestId("set-search-open").click()
    await page.getByTestId("set-search-input").fill("SSO")
    await expect(page.getByRole("option", { name: /組織の SSO を必須にする/ })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(area(page).getByTestId("set-search-open")).toBeFocused()
    // メンバー：組織の情報は閲覧できるが、セキュリティのポリシーは候補にない
    await chooseScope(page, "鈴木 一郎")
    await area(page).getByTestId("set-search-open").click()
    await page.getByTestId("set-search-input").fill("SSO")
    await expect(page.getByRole("option")).toHaveCount(0)
    await expect(page.getByText("一致する設定がありません")).toBeVisible()
    await page.getByTestId("set-search-input").fill("組織名")
    await expect(page.getByRole("option")).toHaveCount(1)
    await page.keyboard.press("Escape")
    // 閲覧者：組織の設定は候補にない
    await chooseScope(page, "田中 美咲")
    await area(page).getByTestId("set-search-open").click()
    await page.getByTestId("set-search-input").fill("組織")
    await expect(page.getByRole("option")).toHaveCount(0)
  })

  test("reset display settings: only theme, language and timezone change; other settings stay", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await expect(area(page).getByTestId("set-display-reset-button")).toBeDisabled()
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await choose(page, area(page).getByTestId("set-timezone"), "イギリス（ロンドン）")
    await expect(statusText(page, "set-timezone-status")).toHaveText("保存しました")
    await expect(area(page).getByTestId("set-display-reset")).toContainText("テーマ、タイムゾーンを標準に戻します。プロフィール、通知、セキュリティの設定は変わりません。")
    await area(page).getByTestId("set-display-reset-button").click()
    await expect(area(page).getByTestId("set-display-reset-status")).toHaveText("テーマ、タイムゾーンを標準に戻しました。")
    await expect(area(page).getByRole("radio", { name: "端末に合わせる" })).toBeChecked()
    await expect(area(page).getByTestId("set-timezone")).toHaveText("日本（東京）")
    const p = await server(page, (s) => s.personalOf("u-sato"))
    expect(p.display).toEqual({ theme: "system", language: null, timezone: "Asia/Tokyo", quietEnabled: false, quietStart: "22:00", quietEnd: "07:00", mfa: true })
    expect(p.profile.title).toBe("営業部 マネージャー")
    // 変わる項目だけを送った
    expect(await server(page, (s) => s.requests.filter((r) => r.key === "display-reset").map((r) => r.value))).toEqual([{ theme: "system", timezone: "Asia/Tokyo" }])
  })

  test("reset in progress: a value changed during the reset is not overwritten by the reset response", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await server(page, (s) => {
      s.hold.form = true
      s.hold.instant = true
    })
    await area(page).getByTestId("set-display-reset-button").click()
    await expect.poll(() => heldCount(page, "form")).toBe(1)
    // 戻している間に、同じ項目を変える（changeMany と change の重なり）
    await area(page).getByRole("radio", { name: "ライト" }).click()
    await expect.poll(() => heldCount(page, "instant")).toBe(1)
    // 戻す要求の応答の後も、利用者が最後に選んだ「ライト」を表示する
    await release(page, "form")
    await expect(area(page).getByTestId("set-display-reset-status")).toHaveText("テーマを標準に戻しました。戻している間に変えた項目は、変えた値を保存しています。")
    await expect(area(page).getByRole("radio", { name: "ライト" })).toBeChecked()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存中…")
    await release(page, "instant")
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await expect(area(page).getByRole("radio", { name: "ライト" })).toBeChecked()
    expect(await server(page, (s) => s.personalOf("u-sato").display.theme)).toBe("light")
  })

  test("reset with an unknown result: not reported as unchanged; each item offers 'confirm'", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await server(page, (s) => (s.outcomeQueue.form = ["unknown"]))
    await area(page).getByTestId("set-display-reset-button").click()
    await expect(area(page).getByTestId("set-display-reset-status")).toHaveText("標準の設定に戻せたかを確認できませんでした。各項目の「保存されたかを確認」で確かめてください。")
    await expect(area(page).getByTestId("set-display-reset-status")).not.toContainText("変わっていません")
    await expect(statusText(page, "set-theme-status")).toHaveText(UNKNOWN_INSTANT)
    // 模擬のサーバーは unknown でも処理する
    expect(await server(page, (s) => s.personalOf("u-sato").display.theme)).toBe("system")
    await area(page).getByTestId("set-theme-status").getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await expect(area(page).getByRole("radio", { name: "端末に合わせる" })).toBeChecked()
  })

  test("reset with a definite failure: the display returns to the saved values and says nothing changed", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "display", "表示と言語")
    await area(page).getByRole("radio", { name: "ダーク" }).click()
    await expect(statusText(page, "set-theme-status")).toHaveText("保存しました")
    await server(page, (s) => (s.outcomeQueue.form = ["fail"]))
    await area(page).getByTestId("set-display-reset-button").click()
    await expect(area(page).getByTestId("set-display-reset-status")).toHaveText("標準の設定に戻せませんでした。設定は変わっていません。")
    await expect(area(page).getByRole("radio", { name: "ダーク" })).toBeChecked()
    expect(await server(page, (s) => s.personalOf("u-sato").display.theme)).toBe("dark")
  })

  test("explicit save with an unknown result: discarding is not allowed until confirmed", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "profile", "プロフィール")
    await server(page, (s) => (s.outcomeQueue.form = ["unknown"]))
    await area(page).getByTestId("set-profile-bio").fill("確認前の文")
    await area(page).getByTestId("set-profile-save").click()
    await expect(statusText(page, "set-profile-status")).toHaveText(UNKNOWN_FORM)
    await expect(area(page).getByTestId("set-profile-discard")).toBeDisabled()
    await area(page).getByTestId("set-profile-discard").click({ force: true })
    await expect(statusText(page, "set-profile-status")).toHaveText(UNKNOWN_FORM)
    await expect(area(page).getByTestId("set-profile-status").getByRole("button", { name: "保存されたかを確認" })).toBeVisible()
    await expect(area(page).getByTestId("set-profile-bio")).toHaveValue("確認前の文")
    await area(page).getByTestId("set-profile-status").getByRole("button", { name: "保存されたかを確認" }).click()
    await expect(statusText(page, "set-profile-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.personalOf("u-sato").profile.bio)).toBe("確認前の文")
  })

  test("one-off actions with an unknown result are confirmed, not reported as failed: Google, password, account and workspace deletion", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "security", "ログインとセキュリティ")
    // Google の接続の解除
    await server(page, (s) => (s.outcomeQueue.action = ["unknown"]))
    await area(page).getByTestId("set-google").click()
    await expect(statusText(page, "set-google-status")).toHaveText("接続の解除できたかを確認できませんでした。")
    await expect(area(page).getByTestId("set-google")).toHaveCount(0)
    await area(page).getByTestId("set-google-status").getByRole("button", { name: "状態を確認" }).click()
    await expect(statusText(page, "set-google-status")).toHaveText("接続していません（確認しました）")
    // パスワードの変更
    await server(page, (s) => (s.outcomeQueue.action = ["unknown"]))
    await area(page).getByTestId("set-password-open").click()
    await page.getByTestId("set-password-current").fill("flow-demo-2026")
    await page.getByTestId("set-password-new").fill("new-demo-password-2026")
    await page.getByTestId("set-password-submit").click()
    await expect(page.getByTestId("set-password-dialog")).toBeHidden()
    await expect(statusText(page, "set-password-status")).toHaveText("パスワードを変更できたかを確認できませんでした。")
    await area(page).getByTestId("set-password-status").getByRole("button", { name: "状態を確認" }).click()
    await expect(statusText(page, "set-password-status")).toHaveText("パスワードは変更されていました。")
    // アカウントの削除の予約
    await openCategory(page, "profile", "プロフィール")
    await server(page, (s) => (s.outcomeQueue.action = ["unknown"]))
    await area(page).getByTestId("set-account-delete-open").click()
    await page.getByTestId("set-account-delete-password").fill("flow-demo-2026")
    await page.getByTestId("set-account-delete-confirm").click()
    await expect(statusText(page, "set-account-delete-result")).toHaveText("削除を予約できたかを確認できませんでした。")
    await expect(area(page).getByTestId("set-account-delete-open")).toHaveCount(0)
    await area(page).getByTestId("set-account-delete-result").getByRole("button", { name: "状態を確認" }).click()
    await expect(statusText(page, "set-account-delete-result")).toHaveText("削除は予約されています。")
    await expect(area(page).getByTestId("set-account-delete-status")).toHaveText("2026/12/26 に削除されます。それまでは取り消せます。")
    // ワークスペースの削除の予約
    await openCategory(page, "organization", "組織")
    await server(page, (s) => (s.outcomeQueue.action = ["unknown"]))
    await area(page).getByTestId("set-ws-delete-open").click()
    await page.getByTestId("set-ws-delete-input").fill("本社営業部")
    await page.getByTestId("set-ws-delete-confirm").click()
    await expect(statusText(page, "set-ws-delete-result")).toHaveText("削除を予約できたかを確認できませんでした。")
    await area(page).getByTestId("set-ws-delete-result").getByRole("button", { name: "状態を確認" }).click()
    await expect(statusText(page, "set-ws-delete-result")).toHaveText("削除は予約されています。")
  })

  test("reset the security policy: an Alert Dialog lists the changes; tightening asks for confirmation", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "organization", "組織")
    await area(page).getByTestId("set-org-name").fill("本社営業部（未保存）")
    await area(page).getByTestId("set-policy-reset").click()
    const dialog = page.getByTestId("set-policy-confirm")
    await expect(dialog).toContainText("多要素認証を必須にする：オン → オフ")
    await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused()
    await dialog.getByRole("button", { name: "標準に戻す" }).click()
    await expect(statusText(page, "set-policy-status")).toHaveText("保存しました")
    const org = await server(page, (s) => s.orgOf("hq"))
    expect(org.security).toEqual({ requireMfa: false, allowSocialLogin: true, requireSso: false })
    // 無関係な設定（組織の情報の未保存の変更）を変えない
    expect(org.info.name).toBe("本社営業部")
    await expect(area(page).getByTestId("set-org-name")).toHaveValue("本社営業部（未保存）")
    // 規制を強める変更は、確認の後に保存する
    await area(page).getByTestId("set-policy-requireMfa").click()
    await area(page).getByTestId("set-policy-save").click()
    await expect(page.getByTestId("set-policy-confirm")).toContainText("多要素認証を必須にする")
    expect(await server(page, (s) => s.orgOf("hq").security.requireMfa)).toBe(false)
    await page.getByTestId("set-policy-confirm").getByRole("button", { name: "保存する" }).click()
    await expect(statusText(page, "set-policy-status")).toHaveText("保存しました")
    expect(await server(page, (s) => s.orgOf("hq").security.requireMfa)).toBe(true)
    await expect(area(page).getByTestId("set-policy-history")).toContainText("佐藤 花子：セキュリティのポリシーを変更しました")
  })

  test("workspace deletion: a descriptive heading, no red frame, destructive button, typed name to confirm", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "organization", "組織")
    const section = area(page).getByTestId("set-ws-delete")
    await expect(section.getByRole("heading", { name: "ワークスペースの削除" })).toBeVisible()
    await expect(area(page).getByText(/Danger Zone/i)).toHaveCount(0)
    // 枠は細い区切り線だけ（大きな赤い枠を使わない）
    const border = await section.evaluate((el) => {
      const s = getComputedStyle(el)
      return { top: s.borderTopWidth, left: s.borderLeftWidth, color: s.borderTopColor }
    })
    expect(border.top).toBe("1px")
    expect(border.left).toBe("0px")
    const destructive = await page.evaluate(() => {
      const el = document.createElement("div")
      el.style.color = "var(--destructive)"
      document.body.append(el)
      const c = getComputedStyle(el).color
      el.remove()
      return c
    })
    expect(border.color).not.toBe(destructive)
    const open = section.getByTestId("set-ws-delete-open")
    expect(await open.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(destructive)
    await open.click()
    const dialog = page.getByTestId("set-ws-delete-dialog")
    const confirm = dialog.getByTestId("set-ws-delete-confirm")
    await expect(confirm).toBeDisabled()
    await dialog.getByTestId("set-ws-delete-input").fill("本社営業")
    await expect(confirm).toBeDisabled()
    await dialog.getByTestId("set-ws-delete-input").fill("本社営業部")
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(section.getByTestId("set-ws-delete-status")).toHaveText("2026/12/26 に削除されます。それまでは取り消せます。")
    expect(await server(page, (s) => s.orgOf("hq").deletion)).toEqual({ scheduledOn: "2026-12-26" })
    await section.getByTestId("set-ws-delete-cancel").click()
    await expect(section.getByTestId("set-ws-delete-open")).toBeVisible()
    expect(await server(page, (s) => s.orgOf("hq").deletion)).toBe(null)
  })

  test("account deletion requires re-authentication; the password is not recorded", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "profile", "プロフィール")
    await area(page).getByTestId("set-account-delete-open").click()
    const dialog = page.getByTestId("set-account-delete-dialog")
    await expect(dialog.getByTestId("set-account-delete-confirm")).toBeDisabled()
    await dialog.getByTestId("set-account-delete-password").fill("wrong-password")
    await dialog.getByTestId("set-account-delete-confirm").click()
    await expect(dialog).toContainText("パスワードが正しくありません")
    await dialog.getByTestId("set-account-delete-password").fill("flow-demo-2026")
    await dialog.getByTestId("set-account-delete-confirm").click()
    await expect(area(page).getByTestId("set-account-delete-status")).toHaveText("2026/12/26 に削除されます。それまでは取り消せます。")
    const logged = await server(page, (s) => JSON.stringify(s.requests))
    expect(logged).not.toContain("flow-demo-2026")
    expect(logged).not.toContain("wrong-password")
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + location.href)).not.toContain("flow-demo-2026")
  })

  test("members: Data Table and an invite that respects the scope", async ({ page }) => {
    await openPage(page)
    await openCategory(page, "members", "メンバー")
    await expect(area(page).getByRole("table")).toBeVisible()
    await expect(area(page).getByRole("row")).toHaveCount(4)
    await area(page).getByTestId("set-invite-open").click()
    const dialog = page.getByTestId("set-invite-dialog")
    await dialog.getByTestId("set-invite-email").fill("taro.yamada@example.com")
    await dialog.getByTestId("set-invite-submit").click()
    await expect(dialog).toBeHidden()
    await expect(area(page).getByTestId("set-members-status")).toHaveText("taro.yamada@example.com をメンバーとして招待しました（模擬：メールは送信していません）。")
    await expect(area(page).getByRole("row")).toHaveCount(5)
    await expect(area(page).getByRole("row").last()).toContainText("招待中")
  })
})

// ------------------------------------------------------------------ モバイル
test.describe("Settings: mobile category navigation", () => {
  test("narrow: category list → detail page with a back link; focus follows; save state and reasons stay", async ({ page, isMobile }) => {
    await openPage(page)
    if (!isMobile) await page.getByText("狭い（360px").click()
    // 一覧だけを示す。内容は示さない
    await expect(area(page).getByTestId("set-category")).toBeHidden()
    const link = navLink(page, "security")
    await expect(link).toBeVisible()
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    await expect(link).toContainText("パスワード、2 段階認証、外部アカウント")
    await link.click()
    await expect(heading(page)).toBeFocused()
    await expect(heading(page)).toHaveText("ログインとセキュリティ")
    await expect(area(page).getByRole("navigation", { name: "設定のカテゴリ" })).toBeHidden()
    await expect(backLink(page)).toBeVisible()
    expect((await backLink(page).boundingBox())!.height).toBeGreaterThanOrEqual(48)
    // 変更できない理由を省略しない
    await expect(area(page).locator("[data-setting-id=mfa]")).toContainText("組織（本社営業部）のポリシーで必須のため、無効にできません。")
    // 名前と操作が収まらない場合は縦に並べる（Select）、Switch は横のまま
    await openCategory(page, "display", "表示と言語")
    const label = (await area(page).locator("[data-setting-id=timezone] [data-slot=setting-row-label]").boundingBox())!
    const control = (await area(page).getByTestId("set-timezone").boundingBox())!
    expect(control.y).toBeGreaterThan(label.y + label.height - 1)
    await choose(page, area(page).getByTestId("set-timezone"), "シンガポール")
    await expect(statusText(page, "set-timezone-status")).toHaveText("保存しました")
    await backLink(page).click()
    await expect(navLink(page, "display")).toBeFocused()
    await expect(area(page).getByTestId("set-category")).toBeHidden()
  })
})

// ------------------------------------------------------------------ スクリーンショット（目視の自己レビュー用。preview/screenshots は Git の管理外）
// ------------------------------------------------------------------ 通知の設定（Settings の即時保存を共通に使う）
test.describe("Notification settings: delivery is separate from the personal setting and from reading", () => {
  test("browser permission: push stays on in the personal setting, but this browser does not receive it; delivery is not reading", async ({ page }) => {
    await page.goto("/#/notifications")
    const settings = page.getByTestId("ntf-settings-demo")
    await expect(settings.getByTestId("ntf-delivery-note")).toHaveText(
      "ここでは、通知を届けるかどうかを決めます。メールやプッシュ通知で届いても、通知は既読になりません。既読になるのは、アプリ内で通知を開いたときです。"
    )
    const permission = settings.getByTestId("ntf-browser-permission")
    // 初期値でプッシュ通知がオンの種類は「コメントでのメンション」だけ（model.ts）
    await expect(permission).toContainText("プッシュ通知をオンにしている 1 種類の通知は、許可されるまでこのブラウザには届きません（設定はオンのまま保存されています）。")
    await expect(settings.getByRole("switch", { name: "コメントでのメンション：プッシュ通知" })).toHaveAttribute("aria-checked", "true")
    await permission.getByRole("button", { name: "ブラウザの通知を許可する" }).click()
    await expect(permission).not.toContainText("許可されるまでこのブラウザには届きません")
  })
})

test.describe("Settings screenshots", () => {
  test.use({ reducedMotion: "reduce" })
  test("desktop, mobile and 320px", async ({ page, isMobile }, info) => {
    await openPage(page)
    const dir = `preview/screenshots/${info.project.name}`
    await openCategory(page, "organization", "組織")
    await expect(area(page).getByTestId("set-ws-delete")).toBeVisible()
    await area(page).screenshot({ path: `${dir}/settings-organization.png` })
    await openCategory(page, "display", "表示と言語")
    await expect(area(page).getByTestId("set-display")).toBeVisible()
    await area(page).screenshot({ path: `${dir}/settings-display.png` })
    await page.screenshot({ path: `${dir}/settings-page.png`, fullPage: true })
    if (!isMobile) {
      await page.setViewportSize({ width: 320, height: 800 })
      await page.reload()
      await expect(navLink(page, "profile")).toBeVisible()
      await page.screenshot({ path: `${dir}/settings-320-list.png`, fullPage: false })
      await navLink(page, "security").click()
      await expect(area(page).getByTestId("set-security")).toBeVisible()
      await area(page).screenshot({ path: `${dir}/settings-320-security.png` })
    }
  })
})
