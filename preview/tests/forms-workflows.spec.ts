import { expect, test, type Locator, type Page } from "@playwright/test"

import { escapeCsvCell, exportFileName, exportScopeLabel, defaultExportScope } from "../../registry/patterns/export"
import { autoMapColumns, createImportColumns, getMappingIssues, importOutcome } from "../../registry/patterns/import-mapping"
import type { HeldFilter, HoldKind } from "../src/data/forms-workflows/server"
import { collectPageErrors } from "./page-errors"

// Patterns / Forms & Workflows（Form Layout、Create & Edit、Unsaved Changes、Confirmation、Multi-step Workflow、Import & Export）の検品。
// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
// 模擬のサーバーは window.__fdFormsServer で設定する（応答の時間、保存の結果、取り込みの結果）。
collectPageErrors(test)

const docPages = ["form-layout", "create-edit", "unsaved-changes", "confirmation", "multi-step", "import-export"]
const box = async (l: Locator) => (await l.boundingBox())!

type Server = NonNullable<Window["__fdFormsServer"]>
const server = <T,>(page: Page, fn: (s: Server) => T) =>
  page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdFormsServer), fn.toString()) as Promise<T>
const requests = (page: Page, kind: string) => server(page, (s) => s.requests).then((r) => r.filter((x) => x.kind === kind))
const fast = (page: Page) => server(page, (s) => Object.assign(s.latency, { save: 150, check: 120, autofill: 150, action: 120, import: 240, draft: 60 }))
// 応答の保留と解放（Data Browsing の検品と同じ方式）。順序が結果を決める検品は、応答の時間や操作の速さを前提にせず、テストの側で順序を決める。
// hold の間に受け付けた要求は、release まで応答しない（AbortSignal も無視する）。release は、応答を受け取った処理と描画が終わってから戻る。
const hold = (page: Page, kind: HoldKind, on = true) => page.evaluate(([k, v]) => void (window.__fdFormsServer!.hold[k] = v), [kind, on] as const)
const heldCount = (page: Page, filter: HeldFilter = {}) =>
  page.evaluate((f) => window.__fdFormsServer!.held.filter((h) => (f.kind === undefined || h.kind === f.kind) && (f.key === undefined || h.key === f.key)).length, filter)
const release = (page: Page, filter: HeldFilter = {}) => page.evaluate((f) => window.__fdFormsServer!.release(f), filter)

async function openApp(page: Page, query: string) {
  await page.goto(`/#/forms-app?${query}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await fast(page)
}

// Select で選ぶ。前の Select の一覧が閉じ終わる（閉じる動きの間は DOM に残る）のを待ってから、次を開く。
async function choose(page: Page, trigger: Locator, label: string | RegExp) {
  await expect(page.getByRole("listbox")).toHaveCount(0)
  await trigger.click()
  await page.getByRole("listbox").getByRole("option", { name: label, exact: typeof label === "string" }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

// 顧客の登録のフォームを、保存できる状態まで入力する（最後の項目を除く）
async function fillCustomer(page: Page, prefix: string, { skip }: { skip?: string } = {}) {
  const f = (name: string) => page.locator(`#${prefix}-${name}`)
  if (skip !== "company") await f("company").fill("株式会社テスト")
  await f("lastName").fill("山田")
  await f("firstName").fill("太郎")
  if (skip !== "code") await f("code").fill("C-0900")
  if (skip !== "email") await f("email").fill("yamada@example.com")
  if (skip !== "plan") await choose(page, page.getByTestId(`${prefix}-plan`), /^ライト/)
  if (skip !== "start") await f("start").fill("2026-12-01")
}

const submitOf = (page: Page, prefix: string) => page.getByTestId(`${prefix}-submit`)
const disabled = (l: Locator) => expect(l).toHaveAttribute("aria-disabled", "true")
const enabled = (l: Locator) => expect(l).not.toHaveAttribute("aria-disabled", "true")

// ------------------------------------------------------------------ 資料のページ
test.describe("Forms & Workflows pages", { tag: "@webkit" }, () => {
  for (const id of docPages) {
    test(`${id}: one h1, named controls, no horizontal page scroll`, async ({ page }) => {
      await page.goto(`/#/${id}`)
      await expect(page.locator("h1")).toHaveCount(1)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const controls = page.locator("main").first().getByRole("button").or(page.locator("main").first().getByRole("link"))
      const n = await controls.count()
      expect(n).toBeGreaterThan(0)
      for (let i = 0; i < n; i++) {
        const c = controls.nth(i)
        if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
      }
      for (const mock of await page.locator("figure [inert]").all()) expect(await mock.evaluate((el) => (el as HTMLElement).inert)).toBe(true)
    })
  }

  test("320px and 2560px: pages and the app do not scroll horizontally", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    for (const width of [320, 2560]) {
      await page.setViewportSize({ width, height: 900 })
      for (const id of [...docPages, "forms-app?page=customer-new", "forms-app?page=settings", "forms-app?page=contract-new", "forms-app?page=import", "forms-app?page=customers"]) {
        await page.goto(`/#/${id}`)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${id} at ${width}`).toBe(true)
      }
    }
  })
})

// ------------------------------------------------------------------ Form Layout
test.describe("Form Layout", { tag: "@webkit" }, () => {
  test("one column; related fields share a row on wide areas and stack in DOM order on narrow ones", async ({ page, isMobile }) => {
    await page.goto("/#/form-layout")
    const last = page.locator("#fl-lastName")
    const first = page.locator("#fl-firstName")
    const email = page.locator("#fl-email")
    const [l, f, e] = [await box(last), await box(first), await box(email)]
    if (isMobile) {
      // 390px の画面では、資料の枠の中の領域が 28rem より狭く、1 列になる
      expect(f.y).toBeGreaterThan(l.y + l.height)
    } else {
      expect(Math.abs(l.y - f.y)).toBeLessThan(1)
      expect(f.x).toBeGreaterThan(l.x + l.width)
      // 関係のない項目は 1 列（幅いっぱい）
      expect(e.width).toBeGreaterThan(l.width * 1.8)
    }
    // DOM の順序とフォーカスの順序が、視覚の順序と同じ
    await last.focus()
    await page.keyboard.press("Tab")
    await expect(first).toBeFocused()
  })

  test("labels above inputs with 8px; 16px between fields; legend for required fields", async ({ page }) => {
    await page.goto("/#/form-layout")
    const form = page.getByTestId("fl-form")
    await expect(form.getByText("「任意」と書かれていない項目は必須です。")).toBeVisible()
    const label = form.locator("label", { hasText: /^送付先のメールアドレス$/ })
    const input = page.locator("#fl-email")
    const [lb, ib] = [await box(label), await box(input)]
    expect(Math.round(ib.y - (lb.y + lb.height))).toBe(8)
    // 必須の項目は required（支援技術に伝わる）、任意の項目は「任意」の文字
    await expect(input).toHaveAttribute("required", "")
    await expect(form.locator("label", { hasText: "終了日" })).toContainText("任意")
    const gap = await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=fl-form] [data-slot=field-group]")!).rowGap)
    expect(gap).toBe("16px")
  })

  test("conditional fields: hidden values are kept, not validated and not submitted", async ({ page }) => {
    await page.goto("/#/form-layout")
    await page.locator("#fl-lastName").fill("山田")
    await page.locator("#fl-firstName").fill("太郎")
    await page.locator("#fl-start").fill("2026-12-01")
    await page.locator("#fl-email").fill("keiri@example.com")
    // 郵送に切り替え、郵便番号に誤った値を入れる
    await choose(page, page.getByTestId("fl-delivery"), "郵送")
    await expect(page.locator("#fl-email")).toHaveCount(0)
    await page.locator("#fl-zip").fill("12")
    await page.locator("#fl-zip").blur()
    await expect(page.getByText("郵便番号は 7 桁の数字で入力してください")).toBeVisible()
    await disabled(page.getByTestId("fl-submit"))
    // メールに戻すと、入力したメールアドレスが残り、非表示の郵便番号のエラーで保存を妨げない
    await choose(page, page.getByTestId("fl-delivery"), "メール")
    await expect(page.locator("#fl-email")).toHaveValue("keiri@example.com")
    await enabled(page.getByTestId("fl-submit"))
    await page.getByTestId("fl-submit").click()
    const sent = page.getByTestId("fl-sent")
    await expect(sent.locator("[data-key=email]")).toHaveText("keiri@example.com")
    await expect(sent.locator("[data-key=zip]")).toHaveCount(0)
    await expect(sent.locator("[data-key=address]")).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ Create & Edit
test.describe("Create & Edit: validation and the save button", { tag: "@webkit" }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/create-edit")
    await fast(page)
  })

  test("untouched fields show no errors; the save button is disabled with the reason nearby", async ({ page }) => {
    const form = page.getByTestId("ce-form")
    await expect(form.locator("[data-slot=field-error]")).toHaveCount(0)
    const submit = submitOf(page, "ce")
    await disabled(submit)
    await expect(page.getByTestId("ce-save-notice")).toContainText("あと 7 項目を入力すると保存できます")
    // 理由は保存ボタンの説明（aria-describedby）になる
    await expect(submit).toHaveAttribute("aria-describedby", "ce-save-notice")
    // 押せない状態でもフォーカスでき、理由を読める
    await submit.focus()
    await expect(submit).toBeFocused()
    // フォーカスが通り過ぎただけでは、エラーを出さない
    await page.locator("#ce-company").focus()
    await page.keyboard.press("Tab")
    await expect(form.locator("[data-slot=field-error]")).toHaveCount(0)
  })

  test("an incomplete value is not an error while typing; blur shows it; fixing removes it while typing", async ({ page }) => {
    const email = page.locator("#ce-email")
    await email.pressSequentially("yamada@")
    await expect(page.getByTestId("ce-email-error")).toHaveCount(0)
    await email.blur()
    await expect(page.getByTestId("ce-email-error")).toContainText("「@」の後にドメイン名")
    await expect(email).toHaveAttribute("aria-invalid", "true")
    await email.focus()
    await email.pressSequentially("example.com")
    await expect(page.getByTestId("ce-email-error")).toHaveCount(0)
    // 必須の項目を空にして離れると、必須のエラー
    await page.locator("#ce-company").fill("仮")
    await page.locator("#ce-company").fill("")
    await page.locator("#ce-company").blur()
    await expect(page.getByTestId("ce-company-error")).toHaveText("会社名を入力してください")
  })

  test("becomes enabled when the last field becomes valid, without leaving it", async ({ page }) => {
    await fillCustomer(page, "ce", { skip: "email" })
    const submit = submitOf(page, "ce")
    await expect(page.getByTestId("ce-code-status")).toHaveText("このコードは使えます")
    await disabled(submit)
    const email = page.locator("#ce-email")
    await email.pressSequentially("yamada@example.com")
    await expect(email).toBeFocused()
    await enabled(submit)
    await expect(page.getByTestId("ce-save-notice")).toHaveText("")
  })

  test("async duplicate check: disabled while checking; stale responses are ignored", async ({ page }) => {
    await fillCustomer(page, "ce", { skip: "code" })
    await hold(page, "check")
    const code = page.locator("#ce-code")
    const submit = submitOf(page, "ce")
    await code.fill("C-0001")
    // 入力が止まってから（400ms）確かめ始める。結果が届くまで保存できない（応答を保留している間に確かめる）
    await expect.poll(() => heldCount(page, { kind: "check", key: "C-0001" })).toBe(1)
    await expect(page.getByTestId("ce-code-status")).toContainText("確かめています")
    await disabled(submit)
    // 確認の途中で値を変える。古い値（C-0001）の結果を使わない
    await code.fill("C-0098")
    await expect.poll(() => heldCount(page, { kind: "check", key: "C-0098" })).toBe(1)
    await hold(page, "check", false)
    expect(await release(page, { kind: "check", key: "C-0098" })).toBe(1)
    await expect(page.getByTestId("ce-code-status")).toHaveText("このコードは使えます")
    // 古い C-0001（登録済み）の応答が後から届いても、エラーにしない
    expect(await release(page, { kind: "check", key: "C-0001" })).toBe(1)
    await expect(page.getByTestId("ce-code-status")).toHaveText("このコードは使えます")
    await expect(page.getByTestId("ce-code-error")).toHaveCount(0)
    await enabled(submit)
    // 登録済みのコードは、入力を終えるとエラーになる
    await code.fill("C-0002")
    await code.blur()
    await expect(page.getByTestId("ce-code-error")).toContainText("登録済み", { timeout: 5000 })
    await disabled(submit)
    expect((await requests(page, "check-code")).map((r) => (r.payload as { code: string }).code)).toContain("C-0001")
  })

  test("IME composition is not validated and blocks saving until committed", async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== "chromium" || isMobile, "CDP（Chromium のみ）で IME を再現するため")
    await fillCustomer(page, "ce", { skip: "company" })
    await expect(page.getByTestId("ce-code-status")).toHaveText("このコードは使えます")
    const company = page.locator("#ce-company")
    await company.focus()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Input.imeSetComposition", { text: "やまだ", selectionStart: 3, selectionEnd: 3 })
    await expect(company).toHaveValue("やまだ")
    // 変換中は保存できず、理由も示さない（確定していないため）
    await disabled(submitOf(page, "ce"))
    await expect(page.getByTestId("ce-save-notice")).toHaveText("")
    await cdp.send("Input.insertText", { text: "山田商事" })
    await expect(company).toHaveValue("山田商事")
    await enabled(submitOf(page, "ce"))
    await expect(page.getByTestId("ce-company-error")).toHaveCount(0)
  })

  test("Enter on an invalid form does not save; errors appear and focus moves to the first problem", async ({ page }) => {
    await page.locator("#ce-lastName").fill("山田")
    await page.locator("#ce-lastName").press("Enter")
    await expect(page.getByTestId("ce-company-error")).toBeVisible()
    await expect(page.locator("#ce-company")).toBeFocused()
    expect(await requests(page, "create-customer")).toHaveLength(0)
  })

  test("requestSubmit on an invalid form does not save; errors appear", async ({ page }) => {
    await page.locator("#ce-lastName").fill("山田")
    await page.evaluate(() => (document.querySelector("[data-testid=ce-form]") as HTMLFormElement).requestSubmit())
    await expect(page.getByTestId("ce-company-error")).toBeVisible()
    await expect(page.locator("#ce-company")).toBeFocused()
    expect(await requests(page, "create-customer")).toHaveLength(0)
  })

  test("Enter on a valid form saves once; Enter during IME-free typing in the textarea does not submit", async ({ page }) => {
    await fillCustomer(page, "ce")
    await expect(page.getByTestId("ce-code-status")).toHaveText("このコードは使えます")
    await page.locator("#ce-note").press("Enter")
    await page.waitForTimeout(300)
    expect(await requests(page, "create-customer")).toHaveLength(0)
    await page.locator("#ce-email").press("Enter")
    await expect.poll(async () => (await requests(page, "create-customer")).length).toBe(1)
  })

  test("unknown result, then editing: checking uses the submitted values and keeps the later edit unsaved", async ({ page }) => {
    await fillCustomer(page, "ce")
    await server(page, (s) => (s.saveMode = "unknown"))
    await submitOf(page, "ce").click()
    const error = page.getByTestId("ce-form-error")
    await expect(error).toBeVisible()
    await page.locator("#ce-email").fill("edited@example.com")
    await error.getByRole("button", { name: "登録されているか確認" }).click()
    await expect(page.getByTestId("ce-form")).toHaveAttribute("data-dirty")
    await expect(page.locator("#ce-email")).toHaveValue("edited@example.com")
  })

  test("blocker buttons move focus to the field when few remain", async ({ page }) => {
    await fillCustomer(page, "ce", { skip: "plan" })
    const notice = page.getByTestId("ce-save-notice")
    await expect(notice).toContainText("あと 1 項目")
    await notice.getByRole("button", { name: /契約プラン/ }).click()
    await expect(page.getByTestId("ce-plan")).toBeFocused()
  })

  test("double submit sends one request; failure keeps the input; server-side errors show on the field", async ({ page }) => {
    await fillCustomer(page, "ce")
    const submit = submitOf(page, "ce")
    await enabled(submit)
    await server(page, (s) => (s.saveMode = "fail"))
    await submit.dblclick()
    await expect(submit).toHaveAttribute("data-loading")
    await expect(page.getByTestId("ce-form-error")).toContainText("入力した内容は残っています")
    expect(await requests(page, "create-customer")).toHaveLength(1)
    await expect(page.locator("#ce-company")).toHaveValue("株式会社テスト")
    // サーバー側の検証（同じメールアドレスの顧客）：該当する項目にすぐ示し、値を変えるまで保存できない
    await server(page, (s) => (s.saveMode = "invalid"))
    await submit.click()
    await expect(page.getByTestId("ce-email-error")).toContainText("ほかの顧客が使っています")
    await disabled(submit)
    await page.locator("#ce-email").fill("yamada2@example.com")
    await expect(page.getByTestId("ce-email-error")).toHaveCount(0)
    await enabled(submit)
  })

  test("unknown result: no blind retry; checking finds the saved record", async ({ page }) => {
    await fillCustomer(page, "ce")
    await server(page, (s) => (s.saveMode = "unknown"))
    await submitOf(page, "ce").click()
    const error = page.getByTestId("ce-form-error")
    await expect(error).toContainText("保存されたかを確かめられていません")
    await disabled(submitOf(page, "ce"))
    // Enter による送信でも、確かめる前に再実行しない
    await page.locator("#ce-company").press("Enter")
    await page.waitForTimeout(300)
    expect(await requests(page, "create-customer")).toHaveLength(1)
    await error.getByRole("button", { name: "登録されているか確認" }).click()
    await expect(page.getByRole("status").filter({ hasText: "株式会社テストを登録しました" }).or(page.locator("[data-slot=toast]", { hasText: "株式会社テストを登録しました" })).first()).toBeVisible()
  })

  test("instant save reverts on failure; autosave distinguishes unsaved, saving, saved and failed", async ({ page }) => {
    await server(page, (s) => (s.instantMode = "fail"))
    const sw = page.getByTestId("instant-ce-notify").getByRole("switch")
    await expect(sw).toBeChecked()
    await sw.click()
    await expect(page.getByTestId("instant-ce-notify")).toContainText("元の設定に戻しました")
    await expect(sw).toBeChecked()
    await server(page, (s) => (s.instantMode = "success"))
    await sw.click()
    await expect(page.getByTestId("instant-ce-notify")).toContainText("オフにしました")
    await expect(sw).not.toBeChecked()

    await hold(page, "save")
    const memo = page.getByTestId("autosave-memo")
    const status = page.getByTestId("autosave-status")
    await memo.fill("更新の確認は第 2 営業日")
    await expect(status).toHaveAttribute("data-status", "unsaved")
    // 保存の応答を保留している間は、保存中を示す
    await expect.poll(() => heldCount(page, { kind: "save", key: "setting-memo" })).toBe(1)
    await expect(status).toHaveAttribute("data-status", "saving")
    await hold(page, "save", false)
    expect(await release(page, { kind: "save", key: "setting-memo" })).toBe(1)
    await expect(status).toHaveAttribute("data-status", "saved")
    await server(page, (s) => (s.autosaveMode = "fail"))
    await memo.fill("失敗させる")
    await expect(status).toHaveAttribute("data-status", "failed", { timeout: 4000 })
    await server(page, (s) => (s.autosaveMode = "success"))
    await page.getByRole("button", { name: "もう一度保存" }).click()
    await expect(status).toHaveAttribute("data-status", "saved")
  })

  test("dialog create: discard confirmation on Escape, closes without confirmation after saving", async ({ page }) => {
    await page.getByTestId("member-open").click()
    const dialog = page.getByTestId("member-dialog")
    await page.locator("#member-name").fill("田中")
    await page.keyboard.press("Escape")
    const discard = page.getByTestId("member-discard")
    await expect(discard).toBeVisible()
    await expect(discard.getByRole("button", { name: "編集を続ける" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(discard).toBeHidden()
    await expect(page.locator("#member-name")).toHaveValue("田中")
    await page.locator("#member-email").fill("tanaka@example.com")
    await page.getByTestId("member-submit").click()
    await expect(dialog).toBeHidden()
    await expect(page.locator("[data-slot=toast]", { hasText: "田中さんを担当者に追加しました" })).toBeVisible()
  })
})

test.describe("Create & Edit in the app", () => {
  test("create: navigates to the created detail with focus on its heading", async ({ page }) => {
    await openApp(page, "page=customer-new")
    await fillCustomer(page, "new")
    await submitOf(page, "new").click()
    await expect(page.getByTestId("forms-customer")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("株式会社テスト")
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await expect(page.locator("[data-slot=toast]", { hasText: "株式会社テストを登録しました" })).toBeVisible()
    // 保存した後の移動では、未保存の確認を出さない
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })

  test("register and next: clears the form and focuses the first field", async ({ page }) => {
    await openApp(page, "page=customer-new")
    await fillCustomer(page, "new")
    await page.getByRole("button", { name: "登録して次へ" }).click()
    await expect(page.locator("#new-company")).toHaveValue("")
    await expect(page.getByTestId("new-kind")).toBeFocused()
    await expect(page.getByTestId("forms-customer-new")).toBeVisible()
  })

  test("edit from the list returns to the list; edits during saving stay unsaved", async ({ page }) => {
    await openApp(page, "page=customer-edit&id=cu-2&from=detail")
    await hold(page, "save")
    await page.locator("#edit-phone").fill("06-9999-0000")
    await submitOf(page, "edit").click()
    // 保存中（応答を保留している間）に別の項目を変える
    await expect.poll(() => heldCount(page, { kind: "save", key: "update-customer" })).toBe(1)
    await page.locator("#edit-note").fill("保存中の変更")
    await expect(page.locator("#edit-note")).toHaveValue("保存中の変更")
    await hold(page, "save", false)
    expect(await release(page, { kind: "save", key: "update-customer" })).toBe(1)
    // 詳細から開いた編集は、詳細に戻るが、保存中に変えた内容が残るため確認が出る
    // 保存中に変えた内容が残るため、保存の後に移動せず、未保存であることを示す（移動の確認で破棄させない）
    await expect(page.getByTestId("customer-edit-form")).toContainText("保存中に変えた内容は、まだ保存していません")
    await expect(page.getByTestId("forms-customer-edit")).toBeVisible()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(page.locator("#edit-note")).toHaveValue("保存中の変更")
    expect((await requests(page, "update-customer"))[0].payload).toMatchObject({ values: { phone: "06-9999-0000" } })
  })

  test("sticky actions do not hide the focused field", async ({ page }) => {
    await openApp(page, "page=customer-new")
    const actions = page.getByTestId("customer-new-form").locator("[data-slot=form-actions]")
    await expect(actions).toHaveAttribute("data-sticky")
    for (const id of ["#new-email", "#new-zip", "#new-address", "#new-note"]) {
      await page.locator(id).focus()
      await page.waitForTimeout(100)
      const [field, bar] = [await box(page.locator(id)), await box(actions)]
      const typing = await actions.getAttribute("data-typing")
      if (typing === null) expect(field.y + field.height, id).toBeLessThanOrEqual(bar.y + 1)
    }
  })

  test("mobile: sticky actions are not fixed on narrow screens; buttons wrap without breaking their labels", async ({ page, isMobile }) => {
    test.skip(!isMobile, "狭い画面（640px 未満）だけ")
    await openApp(page, "page=customer-new")
    const actions = page.getByTestId("customer-new-form").locator("[data-slot=form-actions]")
    expect(await actions.evaluate((el) => getComputedStyle(el).position)).toBe("static")
    for (const b of await actions.getByRole("button").all()) {
      const h = (await box(b)).height
      expect(h, await b.innerText()).toBeLessThan(56)
    }
  })

  test("touch devices at tablet width: fixed actions are released while typing", async ({ page, isMobile }) => {
    test.skip(!isMobile, "タッチ操作の端末（pointer: coarse）だけ")
    await page.setViewportSize({ width: 800, height: 1000 })
    await openApp(page, "page=customer-new")
    const actions = page.getByTestId("customer-new-form").locator("[data-slot=form-actions]")
    expect(await actions.evaluate((el) => getComputedStyle(el).position)).toBe("sticky")
    await page.locator("#new-company").focus()
    await expect(actions).toHaveAttribute("data-typing")
    expect(await actions.evaluate((el) => getComputedStyle(el).position)).toBe("static")
    await page.locator("#new-company").blur()
    await expect(actions).not.toHaveAttribute("data-typing")
    expect(await actions.evaluate((el) => getComputedStyle(el).position)).toBe("sticky")
  })

  test("detail: sheet edit uses the sheet's own discard confirmation; inline note saves near the field", async ({ page }) => {
    await openApp(page, "page=customer&id=cu-1")
    await page.getByTestId("contact-edit").click()
    const sheet = page.getByTestId("contact-sheet")
    await page.locator("#contact-email").fill("new@example.com")
    // 外側のクリックでは閉じない
    await page.mouse.click(10, 10)
    await expect(sheet).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("contact-discard")).toBeVisible()
    // 確認は 1 つだけ（ページの移動の確認と二重にならない）
    await expect(page.getByRole("alertdialog")).toHaveCount(1)
    await page.getByTestId("contact-discard").getByRole("button", { name: "編集を続ける" }).click()
    // 閉じるボタンでも、破棄を確かめる
    await sheet.getByRole("button", { name: "連絡先の変更を閉じる" }).click()
    await expect(page.getByTestId("contact-discard")).toBeVisible()
    await page.getByTestId("contact-discard").getByRole("button", { name: "編集を続ける" }).click()
    await sheet.getByRole("button", { name: "保存する" }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId("detail-email")).toHaveText("new@example.com")

    await page.getByTestId("inline-note-edit").click()
    await page.getByTestId("inline-note-input").fill("毎月の訪問")
    await page.getByRole("button", { name: "メモを保存" }).click()
    await expect(page.getByTestId("inline-note-value")).toHaveText("毎月の訪問")
    await expect(page.getByTestId("inline-note-edit")).toBeFocused()
  })
})

// ------------------------------------------------------------------ Unsaved Changes
test.describe("Unsaved Changes", { tag: "@webkit" }, () => {
  const sidebarLink = (page: Page, name: string) => page.locator("[data-slot=sidebar]").getByRole("link", { name, exact: true })

  async function goSidebar(page: Page, name: string, isMobile: boolean) {
    if (isMobile) await page.getByRole("button", { name: "メニュー" }).first().click()
    await sidebarLink(page, name).click()
  }

  test("focus only, or changing and reverting, does not ask", async ({ page, isMobile }) => {
    await openApp(page, "page=settings")
    const name = page.locator("#settings-company-name")
    await name.focus()
    await name.fill("株式会社フロー（仮）")
    await expect(page.getByTestId("settings-company")).toHaveAttribute("data-dirty")
    await name.fill("株式会社フロー")
    await expect(page.getByTestId("settings-company")).not.toHaveAttribute("data-dirty")
    await goSidebar(page, "顧客", isMobile)
    await expect(page.getByTestId("forms-customers")).toBeVisible()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })

  test("sidebar navigation asks; keep editing (initial focus and Escape) stays; discard moves without asking again", async ({ page, isMobile }) => {
    await openApp(page, "page=settings")
    await page.locator("#settings-billing-recipient").fill("経理部")
    await goSidebar(page, "顧客", isMobile)
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("「請求先」の変更は保存されていません")
    await expect(dialog.getByRole("button", { name: "編集を続ける" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId("forms-settings")).toBeVisible()
    await expect(page.locator("#settings-billing-recipient")).toHaveValue("経理部")
    await goSidebar(page, "顧客", isMobile)
    await dialog.getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.getByTestId("forms-customers")).toBeVisible()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    // 破棄したフォームの登録は残らない（次の移動で確かめない）
    await goSidebar(page, "設定", isMobile)
    await expect(page.getByTestId("forms-settings")).toBeVisible()
    await expect(page.locator("#settings-billing-recipient")).toHaveValue("株式会社フロー 経理部")
    await goSidebar(page, "顧客", isMobile)
    await expect(page.getByTestId("forms-customers")).toBeVisible()
  })

  test("multiple forms: saving one keeps the other unsaved; save and move saves all, failure stays", async ({ page, isMobile }) => {
    await openApp(page, "page=settings")
    await page.locator("#settings-company-name").fill("株式会社フロー2")
    await page.locator("#settings-billing-recipient").fill("経理部2")
    await page.getByTestId("settings-company-save").click()
    await expect(page.getByTestId("settings-company")).not.toHaveAttribute("data-dirty")
    await expect(page.getByTestId("settings-billing")).toHaveAttribute("data-dirty")
    await goSidebar(page, "顧客", isMobile)
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("「請求先」の変更")
    await expect(dialog).not.toContainText("会社の情報")
    // 保存に失敗したら移動しない
    await server(page, (s) => (s.saveMode = "fail"))
    await dialog.getByRole("button", { name: "保存して移動" }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId("forms-settings")).toBeVisible()
    await expect(page.locator("#settings-billing-recipient")).toHaveValue("経理部2")
    await server(page, (s) => (s.saveMode = "success"))
    await goSidebar(page, "顧客", isMobile)
    await dialog.getByRole("button", { name: "保存して移動" }).click()
    await expect(page.getByTestId("forms-customers")).toBeVisible()
    expect((await requests(page, "settings-billing")).length).toBe(2)
  })

  test("save and move can be stopped while saving; the form keeps its input", async ({ page, isMobile }) => {
    await openApp(page, "page=settings")
    await hold(page, "save")
    await page.locator("#settings-company-name").fill("移動をやめる")
    await goSidebar(page, "顧客", isMobile)
    const dialog = page.getByRole("alertdialog")
    await dialog.getByRole("button", { name: "保存して移動" }).click()
    // 保存中（応答を保留している間）に、移動をやめる
    await expect.poll(() => heldCount(page, { kind: "save", key: "settings-company" })).toBe(1)
    await dialog.getByRole("button", { name: "移動をやめる" }).click()
    await expect(dialog).toBeHidden()
    // 移動をやめた後で、保存の応答（成功）を返す
    await hold(page, "save", false)
    expect(await release(page, { kind: "save", key: "settings-company" })).toBe(1)
    expect(await server(page, (s) => s.settled.filter((k) => k === "settings-company").length)).toBe(1)
    await expect(page.getByTestId("forms-settings")).toBeVisible()
    await expect(page.getByTestId("settings-company")).not.toHaveAttribute("data-dirty")
  })

  test("edit with an unknown result: checking finds that the values were not saved and allows saving again", async ({ page }) => {
    await openApp(page, "page=customer-edit&id=cu-1&from=list")
    await page.locator("#edit-phone").fill("03-0000-9999")
    await server(page, (s) => (s.saveMode = "unknown"))
    await submitOf(page, "edit").click()
    const error = page.getByTestId("edit-form-error")
    await expect(error).toBeVisible()
    await error.getByRole("button", { name: "保存されているか確認" }).click()
    await expect(error).toBeHidden()
    await enabled(submitOf(page, "edit"))
    await expect(page.getByTestId("forms-customer-edit")).toBeVisible()
  })

  test("edit whose response was lost after the server saved: checking confirms every sent field and returns without a dialog", async ({ page }) => {
    await openApp(page, "page=customer-edit&id=cu-1&from=list")
    await page.locator("#edit-phone").fill("03-0000-9999")
    await page.locator("#edit-note").fill("保存の確認")
    await server(page, (s) => (s.saveMode = "throw"))
    await submitOf(page, "edit").click()
    const error = page.getByTestId("edit-form-error")
    await expect(error).toContainText("保存されたかを確かめられていません")
    await error.getByRole("button", { name: "保存されているか確認" }).click()
    await expect(page.getByTestId("forms-customers")).toBeVisible()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(page.locator("[data-slot=toast]", { hasText: "を保存しました" })).toBeVisible()
  })

  test("save and move is offered only when every unsaved form can be saved", async ({ page, isMobile }) => {
    await openApp(page, "page=settings")
    await page.locator("#settings-billing-email").fill("keiri@")
    await goSidebar(page, "顧客", isMobile)
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "保存して移動" })).toHaveCount(0)
    await dialog.getByRole("button", { name: "編集を続ける" }).click()
  })

  test("browser back and forward ask; cancel keeps the URL and page; discard completes the move", async ({ page }) => {
    await openApp(page, "page=customers")
    await page.getByTestId("customers-new").click()
    await expect(page.getByTestId("forms-customer-new")).toBeVisible()
    const url = page.url()
    await page.locator("#new-company").fill("戻る前の入力")
    await page.evaluate(() => history.back())
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible()
    await expect.poll(() => page.url()).toBe(url)
    await dialog.getByRole("button", { name: "編集を続ける" }).click()
    await page.waitForTimeout(200)
    expect(page.url()).toBe(url)
    await expect(page.locator("#new-company")).toHaveValue("戻る前の入力")
    await page.evaluate(() => history.back())
    await dialog.getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.getByTestId("forms-customers")).toBeVisible()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    // 進むは、未保存の変更がなければ確かめない
    await page.evaluate(() => history.forward())
    await expect(page.getByTestId("forms-customer-new")).toBeVisible()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })

  test("consecutive requests while confirming keep only the latest", async ({ page, isMobile }) => {
    await openApp(page, "page=customers")
    await page.getByTestId("customers-new").click()
    await page.locator("#new-company").fill("入力")
    await goSidebar(page, "設定", isMobile)
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible()
    // 確認中に、ブラウザの戻るで別の移動を求める
    await page.evaluate(() => history.back())
    await page.waitForTimeout(300)
    await expect(page.getByRole("alertdialog")).toHaveCount(1)
    await dialog.getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.getByTestId("forms-customers")).toBeVisible()
  })

  test("navigation during saving waits for the save, then moves", async ({ page, isMobile }) => {
    await openApp(page, "page=settings")
    await hold(page, "save")
    await page.locator("#settings-company-name").fill("保存中に移動")
    await page.getByTestId("settings-company-save").click()
    await expect.poll(() => heldCount(page, { kind: "save", key: "settings-company" })).toBe(1)
    // 保存中（応答を保留している間）に移動を求める
    await goSidebar(page, "顧客", isMobile)
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("保存しています")
    await expect(dialog.getByRole("button", { name: "移動をやめる" })).toBeVisible()
    await expect(page.getByTestId("forms-settings")).toBeVisible()
    // 保存が終わると移動する
    await hold(page, "save", false)
    expect(await release(page, { kind: "save", key: "settings-company" })).toBe(1)
    await expect(page.getByTestId("forms-customers")).toBeVisible()
  })

  test("beforeunload is registered only while there are unsaved changes", async ({ page }) => {
    await openApp(page, "page=settings")
    const prevented = () => page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })))
    expect(await prevented()).toBe(false)
    await page.locator("#settings-company-name").fill("変更")
    expect(await prevented()).toBe(true)
    await page.getByTestId("settings-company-save").click()
    await expect(page.getByTestId("settings-company")).not.toHaveAttribute("data-dirty")
    expect(await prevented()).toBe(false)
  })

  test("doc page: two independent forms, tabs inside the form do not ask, drawer asks on Escape", async ({ page }) => {
    await page.goto("/#/unsaved-changes")
    await fast(page)
    const app = page.getByTestId("uc-app")
    await page.locator("#uc-name-input").fill("佐藤")
    await app.getByRole("tab", { name: "補足" }).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await app.getByRole("button", { name: "一覧" }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("「表示名」の変更")
    await dialog.getByRole("button", { name: "編集を続ける" }).click()
    await expect(page.getByTestId("uc-log")).toContainText("「一覧」への移動を取りやめました")
    await page.getByTestId("uc-name-save").click()
    await expect(page.getByTestId("uc-name")).not.toHaveAttribute("data-dirty")
    await app.getByRole("button", { name: "一覧" }).click()
    await expect(app).toHaveAttribute("data-page", "list")

    await page.getByTestId("uc-drawer-open").click()
    await page.getByTestId("uc-drawer-note").fill("メモ")
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("uc-drawer-discard")).toBeVisible()
    await page.getByTestId("uc-drawer-discard").getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.getByTestId("uc-drawer")).toBeHidden()
  })

  // D2：確認の表示中にワークスペースが変わったら、確認を閉じる。「変更を破棄」で前のワークスペースの移動先へ移動させない
  test("a workspace change while the confirmation is shown closes it without moving to the old workspace", async ({ page, isMobile }) => {
    await openApp(page, "page=customer-edit&id=cu-1&from=list")
    await page.locator("#edit-phone").fill("03-0000-9999")
    await goSidebar(page, "契約", isMobile)
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible()
    // 別のタブでのワークスペースの切り替え（モーダルの背後のボタンのため、DOM から押す）
    await page.evaluate(() => (document.querySelector("[data-testid=external-ws-kyushu]") as HTMLButtonElement).click())
    await expect(page.getByTestId("forms-main")).toHaveAttribute("data-ws", "kyushu")
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId("forms-customers")).toBeVisible()
    expect(new URLSearchParams(page.url().split("?")[1]).get("ws")).toBe("kyushu")
    expect(new URLSearchParams(page.url().split("?")[1]).get("page")).toBe("customers")
  })

  // D3：認可の失効では、未保存の変更を確かめずに移動し、beforeunload も出さない。利用者の操作によるログアウトは確かめる
  test("authorization loss moves without asking and removes beforeunload; a normal sign-out still asks", async ({ page, isMobile }) => {
    await openApp(page, "page=customer-edit&id=cu-1&from=list")
    await page.locator("#edit-phone").click()
    await page.keyboard.type("1")
    if (isMobile) await page.getByRole("button", { name: "メニュー" }).first().click()
    await page.locator("[data-slot=sidebar]").getByRole("button", { name: /佐藤/ }).click()
    await page.getByRole("menuitem", { name: "ログアウト" }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "編集を続ける" }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId("forms-customer-edit")).toBeVisible()

    // サーバーが 401 を返した場合の処理を再現する（狭い画面では Sidebar の Sheet が残るため、DOM から押す）
    await page.evaluate(() => (document.querySelector("[data-testid=session-expired]") as HTMLButtonElement).click())
    await expect(page.getByTestId("forms-signed-out")).toBeVisible()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    const dialogs: string[] = []
    page.on("dialog", (d) => {
      dialogs.push(d.type())
      void d.dismiss()
    })
    await page.close({ runBeforeUnload: true })
    await expect.poll(() => page.isClosed()).toBe(true)
    expect(dialogs).toEqual([])
  })
})

// ------------------------------------------------------------------ Confirmation
test.describe("Confirmation", { tag: "@webkit" }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#/confirmation")
    await fast(page)
  })

  test("confirm dialog: safe initial focus, Enter cancels, Escape cancels, outside click does not close", async ({ page }) => {
    await page.getByTestId("confirm-send-open").click()
    const dialog = page.getByTestId("confirm-send")
    await expect(dialog).toContainText("3件の請求書を送信しますか？")
    await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(dialog).toBeHidden()
    await page.getByTestId("confirm-send-open").click()
    await page.mouse.click(5, 5)
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(page.locator("[data-slot=toast]", { hasText: "送信しました" })).toHaveCount(0)
  })

  test("normal and destructive variants; failure keeps the dialog and allows retry", async ({ page }) => {
    await page.getByTestId("confirm-delete-open").click()
    const del = page.getByTestId("confirm-delete")
    await expect(del).toHaveAttribute("data-variant", "destructive")
    await expect(del.getByRole("button", { name: "担当者を削除" })).toHaveAttribute("data-slot", "alert-dialog-action")
    await page.keyboard.press("Escape")
    await server(page, (s) => (s.actionMode = "fail"))
    await page.getByTestId("confirm-send-open").click()
    const send = page.getByTestId("confirm-send")
    await expect(send).toHaveAttribute("data-variant", "default")
    await send.getByRole("button", { name: "3件を送信" }).click()
    await expect(send.locator("[data-slot=confirm-action-error]")).toContainText("もう一度送信できます")
    await server(page, (s) => (s.actionMode = "success"))
    await send.getByRole("button", { name: "もう一度送信" }).click()
    await expect(send).toBeHidden()
    await expect(page.locator("[data-slot=toast]", { hasText: "3件の請求書を送信しました" })).toBeVisible()
  })

  test("type-to-confirm: disabled until the name matches; Enter in the field does nothing", async ({ page }) => {
    await page.getByTestId("confirm-workspace-open").click()
    const dialog = page.getByTestId("confirm-workspace")
    const input = dialog.getByRole("textbox")
    await expect(input).toBeFocused()
    const run = dialog.getByRole("button", { name: "ワークスペースを削除" })
    await expect(run).toBeDisabled()
    await input.fill("九州")
    await expect(dialog).toContainText("入力した文字が一致していません")
    await input.press("Enter")
    await expect(dialog).toBeVisible()
    await input.fill("九州支店")
    await expect(run).toBeEnabled()
    await input.press("Enter")
    await expect(dialog).toBeVisible()
    await run.click()
    await expect(dialog).toBeHidden()
  })

  test("undo: each toast undoes its own action; undo failure is reported; the archived list remains", async ({ page }) => {
    const ex = page.getByTestId("undo-example")
    const toasts = page.locator("[data-slot=toast]")
    await ex.getByRole("button", { name: "アーカイブ" }).nth(0).click()
    await expect(toasts.filter({ hasText: "「見積もりの送付」をアーカイブしました" })).toBeVisible()
    await ex.getByRole("button", { name: "アーカイブ" }).nth(0).click()
    await expect(toasts.filter({ hasText: "「見積もりの送付」をアーカイブしました" })).toBeVisible()
    await expect(toasts.filter({ hasText: "「契約書の確認」をアーカイブしました" })).toBeVisible()
    // 1 つ目の操作だけを取り消す
    await toasts.filter({ hasText: "「見積もりの送付」をアーカイブしました" }).getByRole("button", { name: "元に戻す" }).click()
    await expect(toasts.filter({ hasText: "「見積もりの送付」を元に戻しました" })).toBeVisible()
    await expect(ex.locator("li", { hasText: "見積もりの送付" }).first()).toBeVisible()
    await expect(ex).toContainText("アーカイブ済み")
    await server(page, (s) => (s.undoMode = "fail"))
    await toasts.filter({ hasText: "「契約書の確認」をアーカイブしました" }).getByRole("button", { name: "元に戻す" }).click()
    await expect(toasts.filter({ hasText: "元に戻せませんでした" })).toBeVisible()
    // Toast が消えても、アーカイブ済みの一覧から戻せる
    await ex.getByRole("button", { name: "元に戻す" }).click()
    await expect(ex).not.toContainText("アーカイブ済み")
  })

  test("undo expires with its window: the toast closes and undo is no longer offered", async ({ page }) => {
    await page.clock.install()
    await page.goto("/#/confirmation")
    await fast(page)
    const ex = page.getByTestId("undo-example")
    await ex.getByRole("button", { name: "アーカイブ" }).first().click()
    await page.clock.runFor(500)
    const toast = page.locator("[data-slot=toast]", { hasText: "アーカイブしました" })
    await expect(toast).toBeVisible()
    await page.clock.runFor(8600)
    await expect(toast).toHaveCount(0)
    await expect(ex).toContainText("アーカイブ済み")
  })

  test("bulk delete in the app (Data Table and the selection bar): a target change needs explicit re-confirmation; the dialog closes at start; one request", async ({ page }) => {
    await openApp(page, "page=customers")
    await page.evaluate(() => (window.__fdFormsChangeWhileConfirm = true))
    const rows = page.getByTestId("forms-customers").locator("tbody tr[data-row-id]")
    await expect(rows).toHaveCount(5)
    for (const i of [0, 1, 2]) await rows.nth(i).getByRole("checkbox").click()
    await page.getByTestId("customers-delete-selected").click()
    const dialog = page.getByTestId("customers-delete-dialog")
    await expect(dialog).toContainText("3件の顧客を削除しますか？")
    // 確認の表示中に、選んだ行の 1 件が選択から外れる：変わったことを示し、確かめるまで実行できない
    await expect(dialog.locator("[data-slot=confirm-action-changed]")).toBeVisible({ timeout: 4000 })
    await expect(dialog).toContainText("2件の顧客を削除しますか？")
    const run = dialog.getByRole("button", { name: "2件を削除" })
    await expect(run).toBeDisabled()
    await dialog.getByRole("button", { name: "変更後の内容を確かめました" }).click()
    await run.click()
    // 一括の操作は、実行を始めた時点で確認を閉じ、進捗と結果を一覧の上に示す
    await expect(dialog).toBeHidden()
    await expect(page.locator("[data-slot=toast]", { hasText: "2件の顧客を削除しました" })).toBeVisible()
    const reqs = await requests(page, "delete")
    expect(reqs).toHaveLength(1)
    expect(reqs[0].payload).toMatchObject({ ids: ["cu-2", "cu-3"], ws: "hq" })
  })

})

// ------------------------------------------------------------------ Multi-step Workflow
test.describe("Multi-step Workflow", { tag: "@webkit" }, () => {
  const next = (page: Page) => page.getByTestId("ms-next")
  const heading = (page: Page) => page.getByTestId("ms-heading")

  async function toTerms(page: Page) {
    await choose(page, page.locator("#ms-contractType"), "新規の契約")
    await next(page).click()
    await choose(page, page.locator("#ms-customerId"), /株式会社山田商事/)
    await next(page).click()
    await expect(heading(page)).toHaveText("契約の内容")
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/#/multi-step")
    await fast(page)
  })

  test("unknown total before the branch; next disabled until complete; heading focus after moving", async ({ page, isMobile }) => {
    const stepper = page.getByTestId("ms-stepper")
    if (isMobile) await expect(stepper.locator("[data-slot=stepper-narrow]")).toContainText("ステップ 1")
    await expect(stepper).toContainText("この後の手順は、選んだ内容で決まります")
    await expect(stepper).not.toContainText("/ ")
    await disabled(next(page))
    await expect(page.getByTestId("ms-notice")).toContainText("次へ進めます")
    await choose(page, page.locator("#ms-contractType"), "新規の契約")
    await enabled(next(page))
    if (isMobile) await expect(stepper.locator("[data-slot=stepper-narrow]")).toContainText("ステップ 1 / 5")
    await next(page).click()
    await expect(heading(page)).toHaveText("顧客")
    await expect(heading(page)).toBeFocused()
    if (isMobile) {
      // 狭い領域の簡易の表示は、番号と総数だけを示す（直後の見出しと同じ名前を重ねない。currentLabel="hidden"）
      const current = stepper.locator("[data-slot=stepper-narrow] [data-slot=stepper-current]")
      await expect(current).toHaveText("ステップ 2 / 5")
    } else await expect(stepper.locator("[data-slot=stepper-wide] li[aria-current=step]")).toContainText("顧客")
  })

  test("back keeps values; completed steps are direct links, unreached ones are not", async ({ page, isMobile }) => {
    test.skip(isMobile, "横型の Stepper で確かめる（モバイルは簡易の表示）")
    await toTerms(page)
    await page.locator("#ms-seats").fill("12")
    await page.getByTestId("ms-back").click()
    await expect(heading(page)).toHaveText("顧客")
    const stepper = page.getByTestId("ms-stepper")
    await stepper.getByRole("button", { name: /契約の種類/ }).click()
    await expect(heading(page)).toHaveText("契約の種類")
    // 未到達のステップ（支払い）はボタンではない
    await expect(stepper.getByRole("button", { name: /支払い/ })).toHaveCount(0)
    await stepper.getByRole("button", { name: /契約の内容/ }).click()
    await expect(heading(page)).toHaveText("契約の内容")
    await expect(page.locator("#ms-seats")).toHaveValue("12")
  })

  test("a change in an earlier step marks only the dependent step for review", async ({ page, isMobile }) => {
    test.skip(isMobile, "横型の Stepper で確かめる")
    await toTerms(page)
    await choose(page, page.locator("#ms-plan"), /^ライト/)
    await page.locator("#ms-seats").fill("5")
    await page.locator("#ms-start").fill("2026-12-01")
    await next(page).click()
    await choose(page, page.locator("#ms-payment"), "クレジットカード")
    await page.locator("#ms-cardHolder").fill("YAMADA TARO")
    await next(page).click()
    await expect(heading(page)).toHaveText("確認")
    await page.getByRole("button", { name: "契約の内容を変更" }).click()
    await choose(page, page.locator("#ms-plan"), /^エンタープライズ/)
    const stepper = page.getByTestId("ms-stepper").locator("[data-slot=stepper-wide]")
    await expect(stepper.locator("li[data-status=needs-review]")).toContainText("支払い")
    await expect(stepper.locator("li[data-status=needs-review]")).toContainText("要確認")
    // 無関係な入力は残る
    await expect(page.locator("#ms-seats")).toHaveValue("5")
    // 要確認のステップを飛ばして、確認へは移れない
    await expect(stepper.getByRole("button", { name: /^確認/ })).toHaveCount(0)
    await next(page).click()
    await expect(page.getByTestId("ms-payment-error")).toContainText("請求書での支払いだけです")
  })

  test("branching: renewal has no payment step; review edits return to the step; submit fails then succeeds once", async ({ page }) => {
    await choose(page, page.locator("#ms-contractType"), "契約の更新")
    await next(page).click()
    await expect(heading(page)).toHaveText("更新する契約")
    await choose(page, page.locator("#ms-renewalOf"), /K-1001/)
    await next(page).click()
    await choose(page, page.locator("#ms-plan"), /^スタンダード/)
    await page.locator("#ms-seats").fill("20")
    await page.locator("#ms-start").fill("2027-04-01")
    await next(page).click()
    await expect(heading(page)).toHaveText("確認")
    const review = page.getByTestId("ms-review")
    await expect(review).not.toContainText("支払い")
    await expect(review).toContainText("20 人")
    await server(page, (s) => (s.saveMode = "fail"))
    await page.getByTestId("ms-submit").click()
    await expect(page.getByRole("alert").filter({ hasText: "契約を登録できませんでした" })).toBeVisible()
    await expect(review).toContainText("20 人")
    await server(page, (s) => (s.saveMode = "success"))
    await page.getByTestId("ms-submit").dblclick()
    await expect(page.getByTestId("ms-done")).toBeVisible()
    expect(await requests(page, "submit-contract")).toHaveLength(2)
    const payload = (await requests(page, "submit-contract"))[1].payload as Record<string, unknown>
    expect(payload).not.toHaveProperty("payment")
    expect(payload).not.toHaveProperty("customerId")
  })

  test("leaving mid-way asks in the app; the draft can be saved first", async ({ page, isMobile }) => {
    await openApp(page, "page=contract-new")
    await choose(page, page.locator("#contract-contractType"), "新規の契約")
    if (isMobile) await page.getByRole("button", { name: "メニュー" }).first().click()
    await page.locator("[data-slot=sidebar]").getByRole("link", { name: "顧客", exact: true }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("「契約の登録」の変更は保存されていません")
    await dialog.getByRole("button", { name: "編集を続ける" }).click()
    await page.getByRole("button", { name: "下書きを保存" }).click()
    await expect(page.getByText(/に下書きを保存しました/)).toBeVisible()
    if (isMobile) await page.getByRole("button", { name: "メニュー" }).first().click()
    await page.locator("[data-slot=sidebar]").getByRole("link", { name: "顧客", exact: true }).click()
    await expect(page.getByTestId("forms-customers")).toBeVisible()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })

  test("a failed seats check blocks the step and can be checked again", async ({ page }) => {
    await toTerms(page)
    await server(page, (s) => (s.checkMode = "fail"))
    await choose(page, page.locator("#ms-plan"), /^ライト/)
    await page.locator("#ms-seats").fill("8")
    await expect(page.getByTestId("ms-seats-status")).toBeVisible()
    await expect(page.getByTestId("ms-notice")).toContainText("利用人数を確かめられませんでした")
    await expect(next(page)).toHaveAttribute("aria-disabled", "true")
    await server(page, (s) => (s.checkMode = "success"))
    await page.getByTestId("ms-seats-recheck").click()
    await expect(page.getByTestId("ms-seats-status")).toHaveCount(0)
    await expect(page.getByTestId("ms-notice")).not.toContainText("確かめられませんでした")
  })

  test("draft: resume restores values and steps and re-validates against current options", async ({ page }) => {
    await page.getByTestId("ms-seed-draft").click()
    const draft = page.getByTestId("ms-draft")
    await expect(draft).toContainText("保存した下書きがあります")
    await draft.getByRole("button", { name: "下書きから再開" }).click()
    await expect(heading(page)).toHaveText("契約の内容")
    await expect(page.locator("#ms-seats")).toHaveValue("12")
    await expect(page.getByTestId("ms-plan-error")).toContainText("提供を終了しました")
    await disabled(next(page))
    // ライトの上限（10 人）を超えるため、プランに依存する利用人数の確認がエラーになる
    await choose(page, page.locator("#ms-plan"), /^ライト/)
    await disabled(next(page))
    await choose(page, page.locator("#ms-plan"), /^スタンダード/)
    await enabled(next(page))
  })
})

// ------------------------------------------------------------------ Import & Export
test.describe("Import & Export", () => {
  const ie = (page: Page) => page.getByTestId("ie")

  async function loadSample(page: Page) {
    await page.getByTestId("ie-sample").click()
    await expect(ie(page)).toContainText("選択済み（まだ読み込んでいません）")
    await page.getByTestId("ie-load").click()
    await expect(page.getByTestId("ie-heading")).toHaveText("項目の対応付け", { timeout: 5000 })
  }

  async function resolveMapping(page: Page) {
    // 同じ見出しの 2 つの列（電話番号）は曖昧なため、利用者が選ぶ
    await choose(page, page.getByTestId("mapping-col-2"), "電話番号")
    await choose(page, page.getByTestId("mapping-col-3"), "取り込まない")
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/#/import-export")
    await fast(page)
  })

  test("file selection does not start the import; wrong type is rejected", async ({ page }) => {
    await page.locator("[data-testid=ie] input[type=file]").setInputFiles({ name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("a") })
    await expect(ie(page).getByRole("alert")).toContainText("このファイルは選べません")
    await page.getByTestId("ie-sample").click()
    await expect(page.getByTestId("ie-heading")).toHaveText("ファイルの選択")
  })

  test("mapping: auto by header and alias, ambiguous duplicates need a choice, duplicate mapping and missing required are detected", async ({ page }) => {
    await loadSample(page)
    await expect(page.getByTestId("mapping-col-0")).toHaveText("顧客コード（必須）")
    await expect(page.getByTestId("mapping-col-4")).toHaveText("担当者")
    await expect(page.getByTestId("mapping-col-5")).toHaveText("取り込まない")
    await expect(page.getByTestId("ie-ambiguous")).toContainText("2 つあります")
    await disabled(page.getByTestId("ie-next"))
    await choose(page, page.getByTestId("mapping-col-2"), "電話番号")
    await choose(page, page.getByTestId("mapping-col-3"), "電話番号")
    await expect(ie(page).locator("[data-column=col-3] [data-slot=field-error]")).toContainText("2 つの列を対応付けています")
    await disabled(page.getByTestId("ie-next"))
    await choose(page, page.getByTestId("mapping-col-3"), "取り込まない")
    await choose(page, page.getByTestId("mapping-col-1"), "取り込まない")
    await expect(page.getByTestId("ie-notice")).toContainText("必須の項目「会社名」に、列を対応付けてください")
    await choose(page, page.getByTestId("mapping-col-1"), "会社名（必須）")
    await enabled(page.getByTestId("ie-next"))
  })

  test("validation: row numbers, categories, filter and preview range; changing the file invalidates later steps", async ({ page, isMobile }) => {
    await loadSample(page)
    await resolveMapping(page)
    await page.getByTestId("ie-next").click()
    await page.getByTestId("ie-validate").click()
    const summary = ie(page).locator("[data-slot=import-validation-summary]")
    await expect(summary.locator("[data-state=valid] dd")).toHaveText("35件")
    await expect(summary.locator("[data-state=review] dd")).toHaveText("2件")
    await expect(summary.locator("[data-state=error] dd")).toHaveText("3件")
    const table = ie(page).locator("[data-slot=import-issue-table]")
    await expect(table.locator("tr[data-row='6'][data-state=error]")).toContainText("会社名が空です")
    await expect(table.locator("tr[data-state=review]")).toHaveCount(0)
    await summary.getByRole("button", { name: /すべて/ }).click()
    await expect(table.locator("tr[data-row='4'][data-state=review]")).toContainText("登録済みの顧客")
    await expect(page.getByTestId("ie-issue-range")).toContainText("5 件をすべて表示しています")
    // ファイルを選び直すと、対応付けと検証は使わない
    if (!isMobile) {
      await page.getByTestId("ie-stepper").locator("[data-slot=stepper-wide]").getByRole("button", { name: /ファイルの選択/ }).click()
      await page.getByTestId("ie-sample").click()
      await page.getByTestId("ie-load").click()
      await expect(page.getByTestId("ie-heading")).toHaveText("項目の対応付け", { timeout: 5000 })
      await expect(page.getByTestId("mapping-col-2")).toHaveText("取り込まない")
      // 新しいファイルの対応付けが終わるまで、検証のステップへは移れない（前のファイルの検証の結果は使わない）
      const wide = page.getByTestId("ie-stepper").locator("[data-slot=stepper-wide]")
      await expect(wide.getByRole("button", { name: /データの検証/ })).toHaveCount(0)
      await resolveMapping(page)
      await page.getByTestId("ie-next").click()
      await expect(page.getByTestId("ie-validate")).toBeVisible()
      await expect(ie(page)).toContainText("40 行のすべてを、登録できるかどうか確かめます")
      await expect(ie(page).locator("[data-slot=import-validation-summary]")).toHaveCount(0)
    }
  })

  test("counts before running, partial result totals, retry only failed rows; all-or-nothing blocks", async ({ page }) => {
    await loadSample(page)
    await resolveMapping(page)
    await page.getByTestId("ie-next").click()
    await page.getByTestId("ie-validate").click()
    await choose(page, page.getByTestId("ie-partial"), "すべての行が正常な場合だけ取り込む")
    await page.getByTestId("ie-next").click()
    await expect(page.getByTestId("ie-confirm")).toContainText("エラーの行があるため取り込めません")
    await expect(page.getByTestId("ie-run")).toBeDisabled()
    await page.getByRole("button", { name: "戻る" }).click()
    await choose(page, page.getByTestId("ie-partial"), "正常な行だけを取り込む")
    await choose(page, page.getByTestId("ie-policy"), "登録済みの顧客を更新する")
    await expect(ie(page).getByText("空欄の項目で、登録済みの値を消す")).toBeVisible()
    await page.getByTestId("ie-next").click()
    const confirm = page.getByTestId("ie-confirm")
    await expect(confirm).toContainText("新規に登録35件")
    await expect(confirm).toContainText("更新2件（空欄の項目は値を残す）")
    await expect(confirm).toContainText("取り込まない（エラー）3件")
    await expect(page.getByTestId("ie-run")).toHaveText("37件を取り込む（エラーの 3件を除く）")
    await page.getByTestId("ie-run").click()
    const result = ie(page).locator("[data-slot=import-result]")
    await expect(result).toHaveAttribute("data-outcome", "partial", { timeout: 5000 })
    await expect(result).toContainText("処理の対象37件")
    await expect(result).toContainText("失敗3件")
    await result.getByRole("button", { name: "失敗した 3件だけを再処理" }).click()
    await expect(result).toHaveAttribute("data-outcome", "success", { timeout: 5000 })
    await expect(result).toContainText("処理の対象37件")
  })

  for (const [mode, outcome] of [
    ["success", "success"],
    ["fail", "failed"],
  ] as const) {
    test(`import outcome: ${mode}`, async ({ page }) => {
      await page.evaluate((m) => (window.__fdFormsServer!.importMode = m), mode)
      await loadSample(page)
      await resolveMapping(page)
      await page.getByTestId("ie-next").click()
      await page.getByTestId("ie-validate").click()
      await page.getByTestId("ie-next").click()
      await page.getByTestId("ie-run").click()
      const result = ie(page).locator("[data-slot=import-result]")
      await expect(result).toHaveAttribute("data-outcome", outcome, { timeout: 5000 })
      await expect(result).toContainText("処理の対象37件")
      if (outcome === "failed") await expect(result).toContainText("失敗37件")
      else await expect(result).toContainText("新規登録35件")
    })
  }

  test("retry that ends unknown: the status check marks only the rows without a result", async ({ page }) => {
    await loadSample(page)
    await resolveMapping(page)
    await page.getByTestId("ie-next").click()
    await page.getByTestId("ie-validate").click()
    await page.getByTestId("ie-next").click()
    await page.getByTestId("ie-run").click()
    const result = ie(page).locator("[data-slot=import-result]")
    await expect(result).toHaveAttribute("data-outcome", "partial", { timeout: 5000 })
    await server(page, (s) => (s.importMode = "unknown"))
    await result.getByRole("button", { name: "失敗した 3件だけを再処理" }).click()
    await expect(result).toHaveAttribute("data-outcome", "unknown", { timeout: 5000 })
    await result.getByRole("button", { name: "状態を確認" }).click()
    await expect(result.getByRole("button", { name: /だけを再処理/ })).toBeVisible({ timeout: 5000 })
    // 結果が不明だった行（再処理の対象の 12、24、30 行目のうち、通信が切れた後の行）だけが失敗になる
    const failed = await ie(page).getByRole("list", { name: "失敗した行" }).locator("li").allInnerTexts()
    for (const line of failed) expect(line).toMatch(/^(12|24|30) 行目/)
  })

  test("unknown result offers a status check, not a retry", async ({ page }) => {
    await server(page, (s) => (s.importMode = "unknown"))
    await loadSample(page)
    await resolveMapping(page)
    await page.getByTestId("ie-next").click()
    await page.getByTestId("ie-validate").click()
    await page.getByTestId("ie-next").click()
    await page.getByTestId("ie-run").click()
    const result = ie(page).locator("[data-slot=import-result]")
    await expect(result).toHaveAttribute("data-outcome", "unknown", { timeout: 5000 })
    await expect(result.getByRole("button", { name: /再処理/ })).toHaveCount(0)
    await result.getByRole("button", { name: "状態を確認" }).click()
    await expect(result).toHaveAttribute("data-outcome", /partial|failed/, { timeout: 5000 })
    await expect(result.getByRole("button", { name: /だけを再処理/ })).toBeVisible()
  })

  test("an exception without a response: every row is unknown; the status check keeps registered rows out of the retry", async ({ page }) => {
    await server(page, (s) => (s.importMode = "throw"))
    await loadSample(page)
    await resolveMapping(page)
    await page.getByTestId("ie-next").click()
    await page.getByTestId("ie-validate").click()
    await page.getByTestId("ie-next").click()
    await page.getByTestId("ie-run").click()
    const result = ie(page).locator("[data-slot=import-result]")
    await expect(result).toHaveAttribute("data-outcome", "unknown", { timeout: 5000 })
    await expect(result.getByRole("button", { name: /再処理/ })).toHaveCount(0)
    await server(page, (s) => (s.importMode = "success"))
    await result.getByRole("button", { name: "状態を確認" }).click()
    // サーバーで登録されていた前半の行は成功、登録されていなかった行だけが再処理の対象になる
    await expect(result).toHaveAttribute("data-outcome", "partial", { timeout: 5000 })
    await expect(result).toContainText(/新規登録\d+件/)
    const retry = result.getByRole("button", { name: /だけを再処理/ })
    await expect(retry).toBeVisible()
    const label = (await retry.textContent()) ?? ""
    const failedCount = Number(label.match(/(\d+)件/)?.[1])
    expect(failedCount).toBeGreaterThan(0)
    expect(failedCount).toBeLessThan(37)
    await retry.click()
    await expect(result).toHaveAttribute("data-outcome", "success", { timeout: 5000 })
    // 再処理の要求には、登録済みの行を含めない
    const runs = await requests(page, "run-import")
    expect((runs.at(-1)!.payload as { rows: number[] }).rows).toHaveLength(failedCount)
  })

  test("export: defaults by origin, unknown counts, visible columns, file name and download", async ({ page, isMobile }) => {
    test.skip(isMobile, "ダウンロードはデスクトップで確かめる")
    await page.getByTestId("ie-export-selection").click()
    const dialog = page.getByTestId("export-dialog")
    await expect(page.getByTestId("export-scope")).toHaveText("選んだ行（2件）")
    await page.keyboard.press("Escape")
    await page.getByTestId("ie-export-settings").click()
    await expect(page.getByTestId("export-scope")).toHaveText(/^すべてのデータ/)
    await page.keyboard.press("Escape")
    await page.getByRole("radio", { name: "件数がわからない（大量のデータ）" }).check()
    await page.getByTestId("ie-export-table").click()
    await expect(page.getByTestId("export-scope")).toHaveText("検索結果のすべて")
    const columns = page.getByTestId("export-columns")
    await expect(columns.getByRole("checkbox", { name: "顧客コード" })).toBeChecked()
    await expect(columns.getByRole("checkbox", { name: "プラン" })).not.toBeChecked()
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-run").click()])
    expect(download.suggestedFilename()).toMatch(/^顧客_検索結果_\d{8}-\d{4}\.csv$/)
    const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"))
    expect(text.startsWith("﻿顧客コード,名前,メールアドレス")).toBe(true)
    await expect(dialog).toBeHidden()
  })
})

// ------------------------------------------------------------------ 関数（Node で確かめる）
test.describe("pure helpers", () => {
  test("escapeCsvCell, exportFileName, exportScopeLabel, defaultExportScope", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)")
    expect(escapeCsvCell("@cmd")).toBe("'@cmd")
    expect(escapeCsvCell(-120)).toBe("-120")
    expect(escapeCsvCell("-120")).toBe("'-120")
    expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""')
    expect(escapeCsvCell("03-1234-5678")).toBe("03-1234-5678")
    expect(escapeCsvCell(null)).toBe("")
    expect(exportFileName({ kind: "顧客", scope: "検索結果", date: new Date(2026, 10, 26, 15, 30), extension: ".csv" })).toBe("顧客_検索結果_20261126-1530.csv")
    expect(exportScopeLabel("results", 580)).toBe("検索結果のすべて（580件）")
    expect(exportScopeLabel("results", null)).toBe("検索結果のすべて")
    expect(defaultExportScope("selection-bar", { selectedCount: 3 })).toBe("selected")
    expect(defaultExportScope("table")).toBe("results")
    expect(defaultExportScope("settings")).toBe("all")
  })

  test("importOutcome: success, partial, failed, unknown and totals that do not add up", () => {
    const base = { created: 0, updated: 0, skipped: 0, failed: 0, unknown: 0, total: 10 }
    expect(importOutcome({ ...base, created: 8, skipped: 2 })).toBe("success")
    expect(importOutcome({ ...base, created: 7, failed: 3 })).toBe("partial")
    expect(importOutcome({ ...base, failed: 10 })).toBe("failed")
    expect(importOutcome({ ...base, created: 5, unknown: 5 })).toBe("unknown")
    expect(importOutcome({ ...base, created: 9 })).toBe("unknown")
  })

  test("autoMapColumns and getMappingIssues: stable keys, aliases, ambiguity, duplicates, missing required", () => {
    const fields = [
      { id: "code", label: "顧客コード", required: true },
      { id: "phone", label: "電話番号", aliases: ["TEL"] },
      { id: "company", label: "会社名", required: true },
    ]
    const cols = createImportColumns(["顧客 コード", "電話番号", "電話番号", "ＴＥＬ"], [["C-1", "03", "090", "080"]])
    expect(cols.map((c) => c.key)).toEqual(["col-0", "col-1", "col-2", "col-3"])
    const { mapping, ambiguous } = autoMapColumns(cols, fields)
    expect(mapping["col-0"]).toBe("code")
    expect(ambiguous).toEqual(["col-1", "col-2", "col-3"])
    const issues = getMappingIssues({ "col-0": "code", "col-1": "phone", "col-2": "phone" }, fields)
    expect(issues.missingRequired.map((f) => f.id)).toEqual(["company"])
    expect(issues.duplicates[0].columns).toEqual(["col-1", "col-2"])
  })
})

// ------------------------------------------------------------------ 共通
test.describe("Common", { tag: "@webkit" }, () => {
  test("brand color paints the stepper and primary buttons, not the status colors", async ({ page }) => {
    await page.goto("/#/multi-step")
    await page.getByRole("radio", { name: "青" }).check()
    const marker = page.locator("[data-slot=stepper]").nth(1).locator("li[data-status=complete] [data-slot=stepper-marker]").first()
    await expect.poll(() => marker.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(30, 64, 175)")
    const review = page.locator("[data-slot=stepper]").nth(1).locator("li[data-status=needs-review] [data-slot=stepper-marker]").first()
    expect(await review.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(30, 64, 175)")
  })

  test("reduced motion: the save flow still works", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/#/create-edit")
    await fast(page)
    await fillCustomer(page, "ce")
    await enabled(submitOf(page, "ce"))
  })

  test("keyboard: save button reachable by Tab even when disabled, and the reason is its description", async ({ page, isMobile, browserName }) => {
    test.skip(isMobile, "ハードウェアキーボードの操作")
    await page.goto("/#/form-layout")
    await page.locator("#fl-limit").focus()
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab"
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(tab)
      if (await page.getByTestId("fl-submit").evaluate((el) => el === document.activeElement)) break
    }
    await expect(page.getByTestId("fl-submit")).toBeFocused()
    await expect(page.getByTestId("fl-submit")).toHaveAccessibleDescription(/項目を入力すると保存できます/)
  })
})
