import { expect, test, type Locator, type Page } from "@playwright/test"

import { customers } from "../src/data/data-display/customers"
import { demoPassword, demoVerificationCode, users } from "../src/data/system-account/model"
import { collectPageErrors } from "./page-errors"

// Patterns / System & Account / Authentication の検品（資料のページ #/authentication の例）。
// 模擬のサーバーは window.__fdSaAuthServer で設定する（応答の時間、結果、ignoreAbort、受け付けた要求、送信したメール）。
// 応答の順序に依存する検品は、固定の応答時間や待ち時間ではなく、要求の保留（hold）と解放（release）で順序を決める。
// 期待値は仕様（docs/web/patterns/authentication.md）から決める。画面の表示を写して期待値にしない。
collectPageErrors(test)

type Server = NonNullable<Window["__fdSaAuthServer"]>
const server = <T,>(page: Page, fn: (s: Server) => T) =>
  page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdSaAuthServer), fn.toString()) as Promise<T>
const requests = (page: Page, kind: string) => server(page, (s) => s.requests).then((r) => r.filter((x) => x.kind === kind))
// 要求を保留する／保留した要求の数が n になるまで待つ／最も古い要求を解放する
const hold = (page: Page, kind: string, on = true) => page.evaluate(([k, v]) => (window.__fdSaAuthServer!.hold[k as "sign-in"] = v as boolean), [kind, on] as const)
const waitHeld = (page: Page, kind: string, n = 1) => expect.poll(() => page.evaluate((k) => window.__fdSaAuthServer!.heldCount(k as "sign-in"), kind)).toBe(n)
const release = async (page: Page, kind: string) => {
  expect(await page.evaluate((k) => window.__fdSaAuthServer!.release(k as "sign-in"), kind)).toBe(true)
  await settle(page)
}
// 解放した応答（latency 0 の setTimeout）と、それによる React の描画が終わるまで、タイマーと描画のフレームを順に待つ（固定の時間ではない）
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let n = 0
        const step = () => (++n > 4 ? requestAnimationFrame(() => resolve()) : setTimeout(step, 0))
        step()
      })
  )
const fast = (page: Page) =>
  server(page, (s) => {
    for (const k of Object.keys(s.latency) as (keyof typeof s.latency)[]) s.latency[k] = 60
  })

const sato = users["u-sato"]
const customerPath = `/w/hq/customers/${customers[11].id}?tab=activity`

async function open(page: Page) {
  await page.goto("/#/authentication")
  await expect(page.getByRole("heading", { level: 1, name: "Authentication" })).toBeVisible()
  await fast(page)
  // 多要素認証の例は、表示したときに 1 つ目の要素の確認を済ませる（模擬）。その要求を記録から除く
  await expect(page.getByTestId("auth-mfa-code")).toBeVisible()
  await expect(page.getByTestId("auth-session-note")).toHaveValue(/来月の更新/)
  await server(page, (s) => (s.requests = []))
}

const frame = (page: Page, id: string) => page.getByTestId(id)
const email = (root: Locator, prefix: string) => root.getByTestId(`${prefix}-email`)
const password = (root: Locator, prefix: string) => root.getByTestId(`${prefix}-password`)
const submit = (root: Locator, prefix: string) => root.getByTestId(`${prefix}-submit`)

async function signIn(root: Locator, prefix: string, mail: string, pass: string) {
  await email(root, prefix).fill(mail)
  await password(root, prefix).fill(pass)
  await submit(root, prefix).click()
}

async function enterCode(page: Page, prefix = "auth-mfa", code = demoVerificationCode) {
  const input = page.getByTestId(`${prefix}-code`)
  await expect(input).toBeVisible()
  await input.fill(code)
  await page.getByTestId(`${prefix}-submit`).click()
}

// ------------------------------------------------------------------ 資料のページ
test.describe("Authentication page", { tag: "@webkit" }, () => {
  test("one h1, named controls, no horizontal page scroll, inert mocks", async ({ page }) => {
    await open(page)
    await expect(page.locator("h1")).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const controls = page.locator("main").first().getByRole("button").or(page.locator("main").first().getByRole("link"))
    const n = await controls.count()
    expect(n).toBeGreaterThan(10)
    for (let i = 0; i < n; i++) {
      const c = controls.nth(i)
      if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
    }
    const mocks = await page.locator("figure [inert]").all()
    expect(mocks.length).toBeGreaterThanOrEqual(4)
    for (const mock of mocks) expect(await mock.evaluate((el) => (el as HTMLElement).inert)).toBe(true)
    // 例の画面の見出しは h3（ページの h1 は 1 つ）
    await expect(frame(page, "auth-signin-frame").getByRole("heading", { level: 3, name: "ログイン" })).toBeVisible()
    // 模擬の処理であることを画面に示す
    await expect(page.getByText("すべて模擬の処理である")).toBeVisible()
  })

  test("320px: no horizontal scroll; the sign-in form fits", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    await page.setViewportSize({ width: 320, height: 640 })
    await open(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const f = frame(page, "auth-signin-frame")
    const box = (await submit(f, "auth-signin").boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  })
})

// ------------------------------------------------------------------ レイアウト
test.describe("Layout", () => {
  test("minimal: at most 400px, centered, full-width primary button", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-layout-frame")
    const column = f.locator("[data-slot=auth-layout-column]")
    const c = (await column.boundingBox())!
    const fr = (await f.locator("[data-slot=auth-layout]").boundingBox())!
    expect(c.width).toBeLessThanOrEqual(400)
    expect(Math.abs(c.x + c.width / 2 - (fr.x + fr.width / 2))).toBeLessThanOrEqual(1)
    const b = (await submit(f, "auth-layout").boundingBox())!
    expect(Math.abs(b.width - c.width)).toBeLessThanOrEqual(1)
    await expect(f.locator("[data-slot=auth-layout]")).toHaveAttribute("data-variant", "minimal")
    // 製品を識別できるロゴ
    await expect(f.locator("[data-slot=auth-layout-logo]")).toContainText("Flow 営業管理")
    // Minimal では境界を付けない
    expect(await f.locator("[data-slot=auth-layout-body]").evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px")
  })

  test("card: the form has a border; split: the aside shows only in a wide container", async ({ page, isMobile }) => {
    await open(page)
    const f = frame(page, "auth-layout-frame")
    await page.getByRole("radio", { name: "Card" }).check()
    expect(await f.locator("[data-slot=auth-layout-body]").evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px")
    await page.getByRole("radio", { name: "Split" }).check()
    const aside = f.locator("[data-slot=auth-layout-aside]")
    if (isMobile) {
      // モバイルでは Split を解除し、フォームだけを示す
      await expect(aside).toBeHidden()
    } else {
      await expect(aside).toBeVisible()
      const a = (await aside.boundingBox())!
      const col = (await f.locator("[data-slot=auth-layout-column]").boundingBox())!
      expect(a.x).toBeGreaterThan(col.x + col.width - 1)
      // 幅が狭い（600px）場合は解除する
      await page.setViewportSize({ width: 600, height: 900 })
      await expect(aside).toBeHidden()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    // Split でもフォームの幅は 400px 以下
    expect((await f.locator("[data-slot=auth-layout-column]").boundingBox())!.width).toBeLessThanOrEqual(400)
  })

  test("short height: the content scrolls naturally and every control is reachable", async ({ page }) => {
    await open(page)
    await page.getByTestId("auth-layout-short").check()
    const scroller = page.getByTestId("auth-layout-scroll")
    const { scrollHeight, clientHeight } = await scroller.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
    expect(clientHeight).toBe(360)
    expect(scrollHeight).toBeGreaterThan(clientHeight)
    // 先頭（ロゴ）から表示し、中央に寄せて上を切らない
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0)
    const logo = (await scroller.locator("[data-slot=auth-layout-logo]").boundingBox())!
    expect(logo.y).toBeGreaterThanOrEqual((await scroller.boundingBox())!.y)
    // 最後の操作までキーボードで移動でき、スクロールして表示される
    const last = scroller.getByRole("button", { name: "Microsoft でログイン" })
    await last.focus()
    await expect(last).toBeInViewport()
    const s = (await scroller.boundingBox())!
    const l = (await last.boundingBox())!
    expect(l.y + l.height).toBeLessThanOrEqual(s.y + s.height + 1)
  })

  test("a short viewport (320 × 480): the page scrolls and the submit button can be reached", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の大きさを変えて確かめる")
    await page.setViewportSize({ width: 320, height: 480 })
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await password(f, "auth-signin").focus()
    await page.keyboard.press("Tab") // 表示の切り替え
    await page.keyboard.press("Tab") // パスワードを忘れた場合
    await page.keyboard.press("Tab") // ログイン
    await expect(submit(f, "auth-signin")).toBeFocused()
    await expect(submit(f, "auth-signin")).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

// ------------------------------------------------------------------ 入力
test.describe("Credentials input", () => {
  test("autocomplete attributes and input types", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await expect(email(f, "auth-signin")).toHaveAttribute("autocomplete", "username")
    await expect(email(f, "auth-signin")).toHaveAttribute("type", "email")
    await expect(password(f, "auth-signin")).toHaveAttribute("autocomplete", "current-password")
    await expect(password(f, "auth-signin")).toHaveAttribute("type", "password")
    // 新規登録のパスワードは new-password
    const up = frame(page, "auth-signup-frame")
    await expect(up.getByTestId("auth-signup-password")).toHaveAttribute("autocomplete", "new-password")
    await expect(up.getByTestId("auth-signup-email")).toHaveAttribute("autocomplete", "username")
    // 再設定の申請は連絡先としてのメールアドレス
    await expect(frame(page, "auth-reset-frame").getByTestId("auth-reset-request-email")).toHaveAttribute("autocomplete", "email")
    // 確認コード
    const code = frame(page, "auth-mfa-frame").getByTestId("auth-mfa-code")
    await expect(code).toHaveAttribute("autocomplete", "one-time-code")
    await expect(code).toHaveAttribute("inputmode", "numeric")
    await expect(code).toHaveAttribute("type", "text")
    expect(await code.getAttribute("maxlength")).toBeNull()
    // 入力欄はコピー＆ペーストを止めない（paste の既定の動作を取り消さない）
    const prevented = await password(f, "auth-signin").evaluate((el) => {
      const e = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() })
      return !el.dispatchEvent(e)
    })
    expect(prevented).toBe(false)
  })

  test("empty submit: errors next to each field, focus on the first, no request", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await submit(f, "auth-signin").click()
    await expect(email(f, "auth-signin")).toBeFocused()
    await expect(email(f, "auth-signin")).toHaveAttribute("aria-invalid", "true")
    await expect(password(f, "auth-signin")).toHaveAttribute("aria-invalid", "true")
    // 入力欄の近く（同じ Field の中）に示す
    await expect(f.locator("[data-slot=field]").filter({ has: page.getByTestId("auth-signin-email") }).locator("[data-slot=field-error]")).toHaveText("メールアドレスを入力してください")
    await expect(f.locator("[data-slot=field]").filter({ has: page.getByTestId("auth-signin-password") }).locator("[data-slot=field-error]")).toHaveText("パスワードを入力してください")
    // 入力の形式の誤りはフォーム全体のエラーにしない
    await expect(f.getByTestId("auth-signin-error")).toBeEmpty()
    expect(await requests(page, "sign-in")).toHaveLength(0)
  })

  test("validation on leaving a field, not while typing; passing through without typing shows nothing", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await email(f, "auth-signin").focus()
    await page.keyboard.press("Tab")
    await expect(f.locator("[data-slot=field-error]")).toHaveCount(0)
    await email(f, "auth-signin").pressSequentially("hanako")
    await expect(f.locator("[data-slot=field-error]")).toHaveCount(0)
    await password(f, "auth-signin").focus()
    const error = f.locator("[data-slot=field]").filter({ has: page.getByTestId("auth-signin-email") }).locator("[data-slot=field-error]")
    await expect(error).toContainText("「@」を含めて")
    // フォーカスが外れたときの誤りは、フォームの aria-live="polite" の領域で知らせる
    await expect(f.locator("[aria-live=polite].sr-only")).toContainText("「@」を含めて")
    // 誤りの表示中は、入力ごとに確かめ直す
    await email(f, "auth-signin").pressSequentially("@example.com")
    await expect(error).toHaveCount(0)
  })

  test("valid but unusual addresses are not rejected on the client", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    for (const address of ["user+tag@localhost", "o'brien@example.ie"]) {
      await signIn(f, "auth-signin", address, "x")
      await expect(f.getByTestId("auth-signin-error")).toContainText("正しくありません")
      await expect(f.locator("[data-slot=field-error]")).toHaveCount(0)
    }
    expect((await requests(page, "sign-in")).map((r) => r.email)).toEqual(["user+tag@localhost", "o'brien@example.ie"])
  })

  test("sign-in does not apply new-password rules; sign-up does", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await signIn(f, "auth-signin", sato.email, "abc")
    await expect(f.getByTestId("auth-signin-error")).toContainText("メールアドレスまたはパスワードが正しくありません")
    await expect(f.locator("[data-slot=field-error]")).toHaveCount(0)
    expect(await requests(page, "sign-in")).toHaveLength(1)

    const up = frame(page, "auth-signup-frame")
    // 要件は入力の前から示す
    const reqs = up.getByTestId("auth-signup-password-requirements")
    await expect(reqs.locator("li")).toHaveCount(2)
    await expect(reqs.locator("li").first()).toContainText("12 文字以上")
    await expect(reqs.locator("li[data-met]")).toHaveCount(0)
    // 要件は入力欄の説明として関連付ける
    const descriptionId = await up.locator("[data-slot=field-description]").filter({ has: page.getByTestId("auth-signup-password-requirements") }).getAttribute("id")
    expect(descriptionId).toBeTruthy()
    expect((await up.getByTestId("auth-signup-password").getAttribute("aria-describedby")) ?? "").toContain(descriptionId!)
    await up.getByTestId("auth-signup-email").fill("new.user@example.com")
    await up.getByTestId("auth-signup-password").fill("abc")
    await up.getByTestId("auth-signup-terms").click()
    await up.getByTestId("auth-signup-submit").click()
    await expect(up.locator("[data-slot=field]").filter({ has: page.getByTestId("auth-signup-password") }).locator("[data-slot=field-error]")).toContainText("条件を満たしていません")
    await expect(up.getByTestId("auth-signup-password")).toBeFocused()
    expect(await requests(page, "sign-up")).toHaveLength(0)
    // 達成の状態は入力に応じて変わり、文字でも伝える
    await up.getByTestId("auth-signup-password").fill("long-enough-pass")
    await expect(reqs.locator("li[data-met]")).toHaveCount(2)
    await expect(reqs.locator("li").first()).toContainText("（達成）")
  })
})

// ------------------------------------------------------------------ パスワードの表示
test.describe("Password visibility", { tag: "@webkit" }, () => {
  test("hidden by default; toggling keeps the value, the focus and the selection, and never submits", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    const input = password(f, "auth-signin")
    const toggle = f.getByRole("button", { name: "パスワードを表示" })
    await expect(input).toHaveAttribute("type", "password")
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await expect(toggle).toHaveAttribute("type", "button")
    await input.fill("secret-value")
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(2, 6))
    await toggle.click()
    await expect(input).toHaveAttribute("type", "text")
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
    await expect(input).toHaveValue("secret-value")
    await expect(input).toBeFocused()
    expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([2, 6])
    // 続けて入力すると、選択の範囲が置き換わる（カーソルの位置を保っている）
    await page.keyboard.type("X")
    await expect(input).toHaveValue("seX-value")
    await toggle.click()
    await expect(input).toHaveAttribute("type", "password")
    await expect(input).toBeFocused()
    // 送信していない
    expect(await requests(page, "sign-in")).toHaveLength(0)
    await expect(f.getByTestId("auth-signin-error")).toBeEmpty()
  })

  test("keyboard: Space and Enter on the toggle switch it without submitting", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await email(f, "auth-signin").fill(sato.email)
    await password(f, "auth-signin").fill(demoPassword)
    const toggle = f.getByRole("button", { name: "パスワードを表示" })
    await toggle.focus()
    await page.keyboard.press("Enter")
    await expect(password(f, "auth-signin")).toHaveAttribute("type", "text")
    await page.keyboard.press("Space")
    await expect(password(f, "auth-signin")).toHaveAttribute("type", "password")
    await expect(toggle).toBeFocused()
    expect(await requests(page, "sign-in")).toHaveLength(0)
    // 入力欄の Enter は送信する
    await password(f, "auth-signin").press("Enter")
    await expect.poll(async () => (await requests(page, "sign-in")).length).toBe(1)
  })
})

// ------------------------------------------------------------------ 認証のエラー
test.describe("Authentication errors", () => {
  test("a wrong password and an unknown account show the same form-level message", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    const region = f.getByTestId("auth-signin-error")
    // 読み上げの領域は、誤りの前から置いている
    await expect(region).toHaveAttribute("role", "alert")
    await expect(region).toBeAttached()
    await signIn(f, "auth-signin", sato.email, "wrong-password")
    await expect(region).not.toBeEmpty()
    const wrong = await region.innerText()
    // 2 回目の応答で、新しい知らせに置き換わったことを確かめる（同じ文でも読み上げ直すため、要素を作り直す）
    await region.locator("[data-slot=alert]").evaluate((el) => el.setAttribute("data-previous", ""))
    await signIn(f, "auth-signin", "nobody@example.com", "wrong-password")
    await expect(region.locator("[data-slot=alert]:not([data-previous])")).toBeVisible()
    expect(await region.innerText()).toBe(wrong)
    expect(wrong).toContain("メールアドレスまたはパスワードが正しくありません")
    expect(wrong).not.toMatch(/登録されていません|存在しません/)
    await expect(region.locator("[data-slot=alert]")).toHaveAttribute("data-variant", "destructive")
    // 次に取る行動
    await expect(region.getByRole("button", { name: "パスワードを再設定する" })).toBeVisible()
    // フォーカスを移さない（送信したボタンに残る）
    await expect(submit(f, "auth-signin")).toBeFocused()
    // 認証情報の不一致は入力欄の誤りにしない
    await expect(f.locator("[data-slot=field-error]")).toHaveCount(0)
  })

  test("network failure, rate limit and service outage are distinguished", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    const region = f.getByTestId("auth-signin-error")
    const cases: [string, string, string][] = [
      ["通信の失敗", "サーバーに接続できませんでした", "destructive"],
      ["試行回数の制限", "ログインの試行回数が上限に達しました", "warning"],
      ["認証のサービスの障害", "ログインのサービスで障害が発生しています", "warning"],
    ]
    for (const [label, title, variant] of cases) {
      await page.getByRole("radio", { name: label, exact: true }).check()
      await signIn(f, "auth-signin", sato.email, demoPassword)
      await expect(region.locator("[data-slot=alert-title]")).toHaveText(title)
      await expect(region.locator("[data-slot=alert]")).toHaveAttribute("data-variant", variant)
    }
    await expect(page.getByTestId("auth-signin-state")).toHaveText("状態：未認証")
  })

  test("the forgot-password action opens the reset request with the entered address", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await signIn(f, "auth-signin", sato.email, "wrong-password")
    await f.getByTestId("auth-signin-error").getByRole("button", { name: "パスワードを再設定する" }).click()
    await expect(f.getByTestId("auth-signin-reset-email")).toHaveValue(sato.email)
  })
})

// ------------------------------------------------------------------ 遷移
test.describe("Sign-in transitions", () => {
  test("double submission sends one request; the button shows loading and keeps focus", async ({ page }) => {
    await open(page)
    // 応答を保留している間に、Enter の連打とボタンの押下を行う（操作の速さに依存しない）
    await hold(page, "sign-in")
    const f = frame(page, "auth-signin-frame")
    await email(f, "auth-signin").fill(sato.email)
    await password(f, "auth-signin").fill(demoPassword)
    await password(f, "auth-signin").press("Enter")
    await password(f, "auth-signin").press("Enter")
    const button = submit(f, "auth-signin")
    await expect(button).toHaveAttribute("data-loading", "true")
    await expect(button).toHaveAttribute("aria-disabled", "true")
    await button.click({ force: true })
    await waitHeld(page, "sign-in", 1)
    expect(await requests(page, "sign-in")).toHaveLength(1)
    await release(page, "sign-in")
    await expect(frame(page, "auth-signin-frame").getByTestId("auth-signin-mfa-code")).toBeVisible()
    expect(await requests(page, "sign-in")).toHaveLength(1)
  })

  test("not authenticated until MFA completes; then back to the original target without a dialog", { tag: "@webkit" }, async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await signIn(f, "auth-signin", sato.email, demoPassword)
    await expect(f.getByTestId("auth-signin-mfa-code")).toBeVisible()
    await expect(page.getByTestId("auth-signin-state")).toHaveText("状態：追加の確認が必要（まだ認証済みではない）")
    // 追加の確認ではログインの情報を求めない
    await expect(f.locator("input[type=password]")).toHaveCount(0)
    await expect(f.getByTestId("auth-signin-email")).toHaveCount(0)
    await enterCode(page, "auth-signin-mfa")
    await expect(page.getByTestId("auth-signin-destination")).toHaveText(customerPath)
    await expect(page.getByTestId("auth-signin-destination")).toHaveAttribute("data-status", "accepted")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })

  const unsafe = ["//evil.example/login", "https://evil.example/", "javascript:alert(1)", "/%2F%2Fevil.example", "/\\evil.example"]
  for (const target of unsafe) {
    test(`an unsafe return target goes to the default screen: ${target}`, async ({ page }) => {
      await open(page)
      // 復帰先の選択肢の順：顧客の詳細、契約と請求、西日本営業部の顧客、続いて unsafe の順
      await page.locator("input[name=auth-return-to]").nth(3 + unsafe.indexOf(target)).check()
      await expect(page.getByTestId("auth-signin-frame").getByText(target, { exact: true })).toHaveCount(0)
      const f = frame(page, "auth-signin-frame")
      // Passkey は追加の確認を求めない（模擬）
      await f.getByTestId("auth-signin-passkey").click()
      await expect(page.getByTestId("auth-signin-destination")).toHaveText("/w/hq/home")
      await expect(page.getByTestId("auth-signin-destination")).toHaveAttribute("data-status", "fallback")
    })
  }

  test("a target the user cannot open (no permission) goes to the default screen", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: /契約と請求/ }).check()
    const f = frame(page, "auth-signin-frame")
    // 田中 美咲（閲覧者）は契約と請求を開けない
    await signIn(f, "auth-signin", users["u-tanaka"].email, demoPassword)
    await enterCode(page, "auth-signin-mfa")
    await expect(page.getByTestId("auth-signin-destination")).toHaveText("/w/hq/home")
    await expect(page.getByTestId("auth-signin-state")).toContainText("この利用者は復帰先の画面を開けない")
    // 佐藤 花子（管理者）は開ける
    await page.getByTestId("auth-signin-restart").click()
    await signIn(frame(page, "auth-signin-frame"), "auth-signin", sato.email, demoPassword)
    await enterCode(page, "auth-signin-mfa")
    await expect(page.getByTestId("auth-signin-destination")).toHaveText("/w/hq/settings/billing")
  })

  test("the return-to table follows the rules for each user", async ({ page }) => {
    await open(page)
    const rows = page.getByTestId("auth-return-to-table").locator("tbody tr")
    const cells = async (i: number) => (await rows.nth(i).locator("td").allInnerTexts()).slice(1)
    expect((await cells(0))[0]).toContain(`${customerPath}（元の目的の画面）`)
    expect((await cells(1))[0]).toContain("/w/hq/settings/billing（元の目的の画面）")
    expect((await cells(1))[1]).toContain("/w/hq/home（既定の画面")
    expect((await cells(2))[1]).toContain("/w/hq/home（既定の画面")
    for (let i = 3; i < 8; i++) for (const c of await cells(i)) expect(c).toContain("/w/hq/home（既定の画面。復帰先が同じオリジンの相対パスではない）")
    // 指定なし
    for (const c of await cells(8)) expect(c).toContain("（既定の画面。復帰先の指定がない）")
    // 不完全なエンコード、ドットのセグメント、二重のエンコード：安全性を確定できないため、既定の画面
    for (const i of [9, 10, 11]) for (const c of await cells(i)) expect(c).toContain("/w/hq/home（既定の画面。復帰先が同じオリジンの相対パスではない）")
    // エンコードした検索の条件は、入力した値のまま戻す
    for (const c of await cells(12)) expect(c).toContain("/w/hq/customers?q=%E9%9D%92%E5%B1%B1（元の目的の画面）")
  })

  test("organization policy: SSO only (no password, no external accounts) for 西日本営業部", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: /^西日本営業部（/ }).check()
    const f = frame(page, "auth-signin-frame")
    await expect(f.getByTestId("auth-signin-sso")).toBeVisible()
    await expect(f.locator("input[type=password]")).toHaveCount(0)
    await expect(f.getByRole("button", { name: /Google|Microsoft|Passkey/ })).toHaveCount(0)
    await f.getByTestId("auth-signin-sso").click()
    await expect(page.getByTestId("auth-signin-state")).toContainText("認証済み（佐藤 花子）")
    // 本社営業部は多要素認証が必須で、外部アカウントを許可する
    await page.getByRole("radio", { name: /^本社営業部（/ }).check()
    await expect(frame(page, "auth-signin-frame").getByRole("button", { name: "Google でログイン" })).toBeVisible()
  })

  test("magic link: the sent screen does not reveal the account; only sent mail arrives", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: /Magic Link/ }).check()
    const f = frame(page, "auth-signin-frame")
    await email(f, "auth-signin").fill("nobody@example.com")
    await submit(f, "auth-signin").click()
    await expect(f.getByTestId("auth-signin-magic-sent")).toContainText("がアカウントに登録されている場合は")
    await expect(page.getByTestId("auth-signin-mailbox-empty")).toBeVisible()
    await f.getByRole("button", { name: "別のメールアドレスを使う" }).click()
    await email(f, "auth-signin").fill(sato.email)
    await submit(f, "auth-signin").click()
    await page.getByTestId("auth-signin-mailbox").getByRole("button", { name: "リンクを開く" }).click()
    await expect(page.getByTestId("auth-signin-state")).toContainText("認証済み（佐藤 花子）")
  })

  test("a response after the screen is gone is ignored (AbortSignal ignored by the server)", async ({ page }) => {
    await open(page)
    await server(page, (s) => (s.ignoreAbort = true))
    await hold(page, "sign-in")
    const f = frame(page, "auth-signin-frame")
    await signIn(f, "auth-signin", sato.email, demoPassword)
    await waitHeld(page, "sign-in", 1)
    // 応答の前に画面を作り直し、その後に古い応答を届ける
    await page.getByTestId("auth-signin-restart").click()
    await release(page, "sign-in")
    await expect(page.getByTestId("auth-signin-state")).toHaveText("状態：未認証")
    await expect(frame(page, "auth-signin-frame").getByTestId("auth-signin-mfa-code")).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 多要素認証
test.describe("Verification code", () => {
  const mfa = (page: Page) => frame(page, "auth-mfa-frame")

  test("pasted code with spaces and hyphens, and full-width digits, are normalized; the leading 0 is kept", { tag: "@webkit" }, async ({ page }) => {
    await open(page)
    const code = mfa(page).getByTestId("auth-mfa-code")
    await expect(code).toBeVisible()
    await code.fill("012 345")
    await expect(code).toHaveValue("012345")
    await code.fill("０１２－３４５")
    await expect(code).toHaveValue("012345")
    await mfa(page).getByTestId("auth-mfa-submit").click()
    await expect(page.getByTestId("auth-mfa-result")).toHaveText("認証済み：佐藤 花子")
  })

  test("clipboard paste (Chromium)", async ({ page, browserName, context }) => {
    test.skip(browserName !== "chromium", "クリップボードの権限は Chromium で与える")
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await open(page)
    const code = mfa(page).getByTestId("auth-mfa-code")
    await code.focus()
    await page.evaluate(() => navigator.clipboard.writeText(" 012-345 "))
    await page.keyboard.press("ControlOrMeta+V")
    await expect(code).toHaveValue("012345")
  })

  test("IME: composing text is kept until committed; committed full-width digits are converted", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP（Chromium のみ）で IME を再現するため")
    await open(page)
    const code = mfa(page).getByTestId("auth-mfa-code")
    await code.focus()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Input.imeSetComposition", { text: "０１２", selectionStart: 3, selectionEnd: 3 })
    await expect(code).toHaveValue("０１２")
    await cdp.send("Input.insertText", { text: "０１２３４５" })
    await expect(code).toHaveValue("012345")
  })

  test("a wrong code is a form-level error with the remaining attempts; the limit ends the challenge", async ({ page }) => {
    await open(page)
    const m = mfa(page)
    for (let i = 1; i <= 5; i++) {
      await enterCode(page, "auth-mfa", "999999")
      await expect(m.getByTestId("auth-mfa-error")).toContainText(`あと ${5 - i} 回入力できます`)
    }
    await enterCode(page, "auth-mfa", demoVerificationCode)
    await expect(m.getByTestId("auth-mfa-error")).toContainText("確認コードの入力の上限に達しました")
    await expect(m.getByTestId("auth-mfa-error").locator("[data-slot=alert]")).toHaveAttribute("data-variant", "warning")
    await expect(m.getByTestId("auth-mfa-code")).toBeDisabled()
    await expect(m.getByTestId("auth-mfa-other")).toHaveCount(0)
    await expect(m.getByTestId("auth-mfa-error").getByRole("button", { name: "ログインに戻る" })).toBeVisible()
  })

  test("an expired code is explained with the next step", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: "切れている" }).check()
    await enterCode(page)
    const error = mfa(page).getByTestId("auth-mfa-error")
    await expect(error).toContainText("コードの有効期限が切れました")
    await expect(error).toContainText("認証アプリに表示されている、新しいコード")
    await expect(error.locator("[data-slot=alert]")).toHaveAttribute("data-variant", "warning")
  })

  test("alternatives and resend appear only for methods the user has", async ({ page }) => {
    await open(page)
    const m = mfa(page)
    // 佐藤 花子：認証アプリ（再送信なし）、SMS、リカバリーコード
    await expect(m.getByTestId("auth-mfa")).toHaveAttribute("data-method", "totp")
    await expect(m.getByTestId("auth-mfa-resend")).toHaveCount(0)
    await m.getByTestId("auth-mfa-other").click()
    await expect(m.getByTestId("auth-mfa-other")).toHaveAttribute("aria-expanded", "true")
    await expect(m.getByTestId("auth-mfa-methods").getByRole("button")).toHaveText(["SMS でコードを受け取る", "リカバリーコードを使う"])
    await m.getByRole("button", { name: "SMS でコードを受け取る" }).click()
    await expect(m.getByTestId("auth-mfa")).toHaveAttribute("data-method", "sms")
    await expect(m.getByTestId("auth-mfa-status")).toContainText("末尾 78の電話番号に、コードを送信しました")
    await expect(m.getByTestId("auth-mfa-resend")).toBeDisabled()
    await expect(m.getByTestId("auth-mfa-resend-wait")).toHaveText(/^\d+ 秒後に再送信できます$/)
    await expect(m.getByTestId("auth-mfa-code")).toBeFocused()
    // リカバリーコード（大文字・小文字、ハイフンの有無を問わない）
    await m.getByTestId("auth-mfa-other").click()
    await m.getByRole("button", { name: "リカバリーコードを使う" }).click()
    await expect(m.getByTestId("auth-mfa-code")).toHaveAttribute("inputmode", "text")
    await m.getByTestId("auth-mfa-code").fill("7kq2 m9xd")
    await expect(m.getByTestId("auth-mfa-code")).toHaveValue("7KQ2M9XD")
    await m.getByTestId("auth-mfa-submit").click()
    await expect(page.getByTestId("auth-mfa-result")).toHaveText("認証済み：佐藤 花子")

    // 鈴木 一郎：SMS だけ（再送信はあり、代替の方式はなし）
    await page.getByRole("radio", { name: /鈴木 一郎/ }).check()
    await expect(m.getByTestId("auth-mfa")).toHaveAttribute("data-method", "sms")
    await expect(m.getByTestId("auth-mfa-resend")).toBeVisible()
    await expect(m.getByTestId("auth-mfa-other")).toHaveCount(0)
    // 田中 美咲：認証アプリだけ（再送信も代替の方式もない。リカバリーコードを発行していない）
    await page.getByRole("radio", { name: /田中 美咲/ }).check()
    await expect(m.getByTestId("auth-mfa")).toHaveAttribute("data-method", "totp")
    await expect(m.getByTestId("auth-mfa-resend")).toHaveCount(0)
    await expect(m.getByTestId("auth-mfa-other")).toHaveCount(0)
    await expect(m.getByText("リカバリーコード")).toHaveCount(0)
  })

  test("resend is limited by the server; the wait is shown next to the button", async ({ page }) => {
    await open(page)
    await server(page, (s) => (s.resendCooldownMs = 2000))
    await page.getByRole("radio", { name: /鈴木 一郎/ }).check()
    const m = mfa(page)
    await expect(m.getByTestId("auth-mfa-resend")).toBeDisabled()
    await expect(m.getByTestId("auth-mfa-resend")).toBeEnabled({ timeout: 4000 })
    await expect(m.getByTestId("auth-mfa-resend-wait")).toHaveText("")
    await m.getByTestId("auth-mfa-resend").click()
    await expect(m.getByTestId("auth-mfa-status")).toContainText("新しいコードを送信しました")
    await expect(m.getByTestId("auth-mfa-resend")).toBeDisabled()
    expect(await requests(page, "mfa-send")).toHaveLength(1)
  })
})

// ------------------------------------------------------------------ 認証フォーム（v0.1 の最終調整）
test.describe("Authentication forms: validation rules, code input and stale responses", () => {
  const mfa = (page: Page) => frame(page, "auth-mfa-frame")
  const code = (page: Page) => mfa(page).getByTestId("auth-mfa-code")
  const codeError = (page: Page) => mfa(page).locator("[data-slot=field]").filter({ has: page.getByTestId("auth-mfa-code") }).locator("[data-slot=field-error]")

  test("sign-in sends a password without trimming or strength rules; a whitespace-only password is not empty", async ({ page }) => {
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await signIn(f, "auth-signin", sato.email, "   ")
    await expect(f.getByTestId("auth-signin-error")).toContainText("メールアドレスまたはパスワードが正しくありません")
    await expect(f.locator("[data-slot=field-error]")).toHaveCount(0)
    // 前後に空白を付けたパスワードは、空白を取り除かずに送る（模擬のサーバーは一致しないと判断する）
    await signIn(f, "auth-signin", sato.email, ` ${demoPassword} `)
    await expect(f.getByTestId("auth-signin-error")).toContainText("メールアドレスまたはパスワードが正しくありません")
    expect(await requests(page, "sign-in")).toHaveLength(2)
    await expect(f.getByTestId("auth-signin-mfa-code")).toHaveCount(0)
  })

  test("too many digits: not truncated, explained next to the field, nothing is sent", async ({ page }) => {
    await open(page)
    await code(page).fill("0123456")
    await expect(code(page)).toHaveValue("0123456")
    await mfa(page).getByTestId("auth-mfa-submit").click()
    await expect(codeError(page)).toHaveText("確認コードは 6 桁で入力してください（入力：7 桁）")
    await expect(code(page)).toBeFocused()
    expect(await requests(page, "mfa")).toHaveLength(0)
  })

  test("unexpected characters are kept and reported instead of being removed", async ({ page }) => {
    await open(page)
    await code(page).fill("01a345")
    // 「a」を取り除いて「01345」として送らない
    await expect(code(page)).toHaveValue("01a345")
    await mfa(page).getByTestId("auth-mfa-submit").click()
    await expect(codeError(page)).toHaveText("確認コードは数字だけで入力してください")
    expect(await requests(page, "mfa")).toHaveLength(0)
    // 先頭の 0 を含む正しいコードは送る
    await code(page).fill(demoVerificationCode)
    await mfa(page).getByTestId("auth-mfa-submit").click()
    await expect(page.getByTestId("auth-mfa-result")).toHaveText("認証済み：佐藤 花子")
  })

  test("IME: no normalization and no automatic submission while composing; one submission after commit", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP（Chromium のみ）で IME を再現するため")
    await open(page)
    await page.getByTestId("auth-mfa-auto-submit").check()
    await code(page).focus()
    const cdp = await page.context().newCDPSession(page)
    // 6 文字の変換中の文字（未確定）：桁数が揃っても送信しない
    await cdp.send("Input.imeSetComposition", { text: "０１２３４５", selectionStart: 6, selectionEnd: 6 })
    await expect(code(page)).toHaveValue("０１２３４５")
    await expect(code(page)).toHaveAttribute("data-composing", "true")
    await settle(page)
    expect(await requests(page, "mfa")).toHaveLength(0)
    // 確定すると整え（全角の数字の変換は製品の指定）、1 回だけ送信する
    await cdp.send("Input.insertText", { text: "０１２３４５" })
    await expect(page.getByTestId("auth-mfa-result")).toHaveText("認証済み：佐藤 花子")
    expect(await requests(page, "mfa")).toHaveLength(1)
  })

  test("paste and one-time-code autofill: normalized and submitted once when automatic submission is enabled", async ({ page }) => {
    await open(page)
    await page.getByTestId("auth-mfa-auto-submit").check()
    await hold(page, "mfa")
    // 自動入力（autocomplete="one-time-code"）は、値の置き換えの input イベントとして届く
    await code(page).evaluate((el: HTMLInputElement, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v)
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: v }))
    }, " 012-345 ")
    await expect(code(page)).toHaveValue("012345")
    await waitHeld(page, "mfa", 1)
    // 同じ値のペーストと、送信中の Enter・ボタンの押下で、二重に送信しない
    await code(page).fill("012345")
    await code(page).press("Enter")
    await mfa(page).getByTestId("auth-mfa-submit").click({ force: true })
    await expect(mfa(page).getByTestId("auth-mfa-submit")).toHaveAttribute("data-loading", "true")
    await settle(page)
    expect(await requests(page, "mfa")).toHaveLength(1)
    await release(page, "mfa")
    await expect(page.getByTestId("auth-mfa-result")).toHaveText("認証済み：佐藤 花子")
    expect(await requests(page, "mfa")).toHaveLength(1)
  })

  test("case-sensitive recovery codes are not uppercased; the keyboard does not capitalize them", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: "区別する（入力のまま送る）" }).check()
    await mfa(page).getByTestId("auth-mfa-other").click()
    await mfa(page).getByRole("button", { name: "リカバリーコードを使う" }).click()
    await expect(code(page)).toHaveAttribute("autocapitalize", "none")
    await code(page).fill("7kq2-m9xd")
    await expect(code(page)).toHaveValue("7kq2m9xd")
    await mfa(page).getByTestId("auth-mfa-submit").click()
    // 入力のまま送り、サーバーが区別して比べる（大文字のコードとは一致しない）
    await expect(mfa(page).getByTestId("auth-mfa-error")).toContainText("リカバリーコードが正しくありません")
    await code(page).fill("7KQ2-M9XD")
    await expect(code(page)).toHaveValue("7KQ2M9XD")
    await mfa(page).getByTestId("auth-mfa-submit").click()
    await expect(page.getByTestId("auth-mfa-result")).toHaveText("認証済み：佐藤 花子")
    // 区別しない製品の設定では、大文字にそろえ、キーボードも大文字にする
    await page.getByTestId("auth-mfa-restart").click()
    await page.getByRole("radio", { name: "区別しない（大文字にそろえる）" }).check()
    await mfa(page).getByTestId("auth-mfa-other").click()
    await mfa(page).getByRole("button", { name: "リカバリーコードを使う" }).click()
    await expect(code(page)).toHaveAttribute("autocapitalize", "characters")
  })

  test("after resending the code, the result of verifying the previous code is not applied", async ({ page }) => {
    await open(page)
    await server(page, (s) => {
      s.resendCooldownMs = 0
      s.ignoreAbort = true
    })
    // 鈴木 一郎：SMS だけ
    await page.getByRole("radio", { name: /鈴木 一郎/ }).check()
    await expect(mfa(page).getByTestId("auth-mfa")).toHaveAttribute("data-method", "sms")
    await hold(page, "mfa")
    await code(page).fill("999999")
    await mfa(page).getByTestId("auth-mfa-submit").click()
    await waitHeld(page, "mfa", 1)
    // 確認の途中で再送信する（再送信は確認の結果を待たない）
    await mfa(page).getByTestId("auth-mfa-resend").click()
    await expect(mfa(page).getByTestId("auth-mfa-status")).toContainText("新しいコードを送信しました")
    // 新しいコードの入力を、前のコードの確認の Loading で止めない
    await expect(mfa(page).getByTestId("auth-mfa-submit")).not.toHaveAttribute("data-loading", "true")
    // 前のコードの確認の結果（不一致）を届ける：新しいコードの画面に反映しない
    await release(page, "mfa")
    await expect(mfa(page).getByTestId("auth-mfa-error")).toBeEmpty()
    await expect(mfa(page).getByTestId("auth-mfa-status")).toContainText("新しいコードを送信しました")
    // 新しい確認は通常どおり
    await hold(page, "mfa", false)
    await code(page).fill(demoVerificationCode)
    await mfa(page).getByTestId("auth-mfa-submit").click()
    await expect(page.getByTestId("auth-mfa-result")).toHaveText("認証済み：鈴木 一郎")
  })

  test("after changing the method, an older response (verification or code sending) is not applied", async ({ page }) => {
    await open(page)
    await server(page, (s) => (s.ignoreAbort = true))
    const m = mfa(page)
    // 1. 認証アプリのコードの確認を保留したまま、リカバリーコードに変える
    await hold(page, "mfa")
    await code(page).fill("999999")
    await m.getByTestId("auth-mfa-submit").click()
    await waitHeld(page, "mfa", 1)
    await m.getByTestId("auth-mfa-other").click()
    await m.getByRole("button", { name: "リカバリーコードを使う" }).click()
    await expect(m.getByTestId("auth-mfa")).toHaveAttribute("data-method", "recovery-code")
    await release(page, "mfa")
    await expect(m.getByTestId("auth-mfa-error")).toBeEmpty()
    await expect(m.getByTestId("auth-mfa")).toHaveAttribute("data-method", "recovery-code")
    await hold(page, "mfa", false)
    // 2. SMS の送信を保留したまま、認証アプリに戻す：送信の応答で SMS に切り替えない
    await hold(page, "mfa-send")
    await m.getByTestId("auth-mfa-other").click()
    await m.getByRole("button", { name: "SMS でコードを受け取る" }).click()
    await waitHeld(page, "mfa-send", 1)
    await m.getByRole("button", { name: "認証アプリのコードを使う" }).click()
    await expect(m.getByTestId("auth-mfa")).toHaveAttribute("data-method", "totp")
    await release(page, "mfa-send")
    await expect(m.getByTestId("auth-mfa")).toHaveAttribute("data-method", "totp")
    await expect(m.getByTestId("auth-mfa-status")).toBeEmpty()
    await code(page).fill(demoVerificationCode)
    await m.getByTestId("auth-mfa-submit").click()
    await expect(page.getByTestId("auth-mfa-result")).toHaveText("認証済み：佐藤 花子")
  })
})

// ------------------------------------------------------------------ 新規登録とメールの確認
test.describe("Sign-up and email verification", () => {
  const up = (page: Page) => frame(page, "auth-signup-frame")

  async function fillSignUp(page: Page, address: string) {
    await up(page).getByTestId("auth-signup-email").fill(address)
    await up(page).getByTestId("auth-signup-password").fill("long-enough-pass")
    await up(page).getByTestId("auth-signup-terms").click()
    await up(page).getByTestId("auth-signup-submit").click()
  }

  test("required terms and optional marketing are separate; marketing is unchecked by default", async ({ page }) => {
    await open(page)
    const u = up(page)
    await expect(u.getByTestId("auth-signup-terms")).toHaveAttribute("aria-checked", "false")
    await expect(u.getByTestId("auth-signup-marketing")).toHaveAttribute("aria-checked", "false")
    await expect(u.getByText("任意", { exact: true })).toBeVisible()
    await u.getByTestId("auth-signup-email").fill("new.user@example.com")
    await u.getByTestId("auth-signup-password").fill("long-enough-pass")
    await u.getByTestId("auth-signup-submit").click()
    await expect(u.getByText("利用規約とプライバシーポリシーへの同意が必要です")).toBeVisible()
    expect(await requests(page, "sign-up")).toHaveLength(0)
    // 登録に必要な項目だけ（名前、会社、利用目的を尋ねない）
    expect(await u.locator("input:not([type=checkbox]):not([aria-hidden=true])").count()).toBe(2)
  })

  test("sent → resend (server limit) → change address → open the link", async ({ page }) => {
    await open(page)
    await fillSignUp(page, "new.user@example.com")
    const v = up(page).getByTestId("auth-verify")
    await expect(v).toHaveAttribute("data-sent", "true")
    await expect(v).toContainText("new.user@example.com にメールを送信しました")
    await expect(page.getByTestId("auth-signup-mailbox").locator("li[data-type=verify]")).toHaveCount(1)
    // 再送信の間隔はサーバーが制限する
    await up(page).getByTestId("auth-verify-resend").click()
    await expect(up(page).getByTestId("auth-verify-status")).toHaveText(/^再送信は \d+ 秒後にできます。$/)
    await expect(up(page).getByTestId("auth-verify-resend")).toBeDisabled()
    // アドレスの変更
    await up(page).getByTestId("auth-verify-change").click()
    await up(page).getByTestId("auth-verify-new-email").fill("other.user@example.com")
    await up(page).getByTestId("auth-verify-change-submit").click()
    await expect(up(page).getByTestId("auth-verify-status")).toHaveText("other.user@example.com にメールを送信しました。")
    await expect(page.getByTestId("auth-signup-mailbox")).toContainText("other.user@example.com")
    await page.getByTestId("auth-signup-mailbox").getByRole("button", { name: "リンクを開く" }).click()
    await expect(page.getByTestId("auth-signup-done")).toBeVisible()
  })

  test("a failed send is not shown as sent; nothing arrives", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: "送信に失敗" }).first().check()
    await fillSignUp(page, "new.user@example.com")
    const v = up(page).getByTestId("auth-verify")
    await expect(v).not.toHaveAttribute("data-sent", "true")
    await expect(v).not.toContainText("送信しました")
    await expect(up(page).getByTestId("auth-verify-error")).toContainText("確認のメールを送信できませんでした")
    await expect(up(page).getByTestId("auth-verify-resend")).toHaveText("確認のメールを送信")
    await expect(page.getByTestId("auth-signup-mailbox-empty")).toBeVisible()
    expect(await server(page, (s) => s.sentEmails.length)).toBe(0)
  })

  test("an existing address gets the same screen; the mail says it is registered and has no link", async ({ page }) => {
    await open(page)
    await fillSignUp(page, sato.email)
    // 未登録のアドレスと同じ文（アカウントの有無を区別しない）
    await expect(up(page).getByTestId("auth-verify")).toContainText(`${sato.email} にメールを送信しました。メールの案内に従って、登録を完了してください。`)
    const mailbox = page.getByTestId("auth-signup-mailbox")
    await expect(mailbox.locator("li[data-type=account-exists]")).toHaveCount(1)
    await expect(mailbox.getByRole("button", { name: "リンクを開く" })).toHaveCount(0)
  })

  test("invitation: the invited address is fixed and the user starts without a verification mail", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: /招待のリンク/ }).check()
    const u = up(page)
    await expect(u.getByTestId("auth-signup-email")).toHaveValue("kenta.yamada@example.com")
    await expect(u.getByTestId("auth-signup-email")).toHaveAttribute("readonly", "")
    await expect(u).toContainText("佐藤 花子さんから「本社営業部」に招待されています")
    await u.getByTestId("auth-signup-password").fill("long-enough-pass")
    await u.getByTestId("auth-signup-terms").click()
    await u.getByTestId("auth-signup-submit").click()
    await expect(page.getByTestId("auth-signup-done")).toBeVisible()
    expect(await server(page, (s) => s.sentEmails.length)).toBe(0)
  })
})

// ------------------------------------------------------------------ パスワードの再設定
test.describe("Password reset", () => {
  const r = (page: Page) => frame(page, "auth-reset-frame")

  async function request(page: Page, address: string) {
    await r(page).getByTestId("auth-reset-request-email").fill(address)
    await r(page).getByTestId("auth-reset-request-submit").click()
  }

  test("unknown and known addresses get the same message; only the registered one receives mail", async ({ page }) => {
    await open(page)
    await request(page, "nobody@example.com")
    const sent = r(page).getByTestId("auth-reset-sent")
    await expect(sent).toContainText("nobody@example.com がアカウントに登録されている場合は、パスワードを再設定するためのリンクを送信しました")
    const unknownText = (await sent.locator("[data-slot=auth-layout-description]").innerText()).replace("nobody@example.com", "<email>")
    await expect(page.getByTestId("auth-reset-mailbox-empty")).toBeVisible()
    await r(page).getByTestId("auth-reset-sent-change").click()
    await request(page, sato.email)
    const knownText = (await sent.locator("[data-slot=auth-layout-description]").innerText()).replace(sato.email, "<email>")
    expect(knownText).toBe(unknownText)
    await expect(page.getByTestId("auth-reset-mailbox").locator("li[data-type=reset]")).toHaveCount(1)
  })

  test("a failed send is shown as a failure, not as sent", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: "送信に失敗" }).nth(1).check()
    await request(page, sato.email)
    await expect(r(page).getByTestId("auth-reset-request-error")).toContainText("メールを送信できませんでした")
    await expect(r(page).getByTestId("auth-reset-sent")).toHaveCount(0)
    expect(await server(page, (s) => s.sentEmails.length)).toBe(0)
  })

  test("valid link → new password (rules, username field) → sign in again with a status, no dialog", async ({ page }) => {
    await open(page)
    await request(page, sato.email)
    await page.getByTestId("auth-reset-mailbox").getByRole("button", { name: "リンクを開く" }).click()
    const n = r(page).getByTestId("auth-new-password")
    await expect(n.getByTestId("auth-new-password-username")).toHaveValue(sato.email)
    await expect(n.getByTestId("auth-new-password-username")).toHaveAttribute("autocomplete", "username")
    await expect(n.getByTestId("auth-new-password-password")).toHaveAttribute("autocomplete", "new-password")
    // 再入力の欄を置かない
    await expect(n.locator("input[autocomplete=new-password]")).toHaveCount(1)
    await n.getByTestId("auth-new-password-password").fill("short")
    await n.getByTestId("auth-new-password-submit").click()
    await expect(n.locator("[data-slot=field-error]")).toContainText("条件を満たしていません")
    expect(await requests(page, "reset-password")).toHaveLength(0)
    await n.getByTestId("auth-new-password-password").fill("a-new-long-password")
    await n.getByTestId("auth-new-password-submit").click()
    const signin = r(page).getByTestId("auth-reset-signin")
    await expect(signin.getByTestId("auth-reset-signin-status")).toContainText("新しいパスワードでログインしてください")
    await expect(signin.getByTestId("auth-reset-signin-email")).toHaveValue(sato.email)
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("expired and used links explain what happened and offer to send again", async ({ page }) => {
    await open(page)
    for (const [label, title] of [
      ["期限切れ", "リンクの有効期限が切れています"],
      ["使用済み", "このリンクは使えません"],
    ] as const) {
      await page.getByRole("radio", { name: label, exact: true }).check()
      await request(page, sato.email)
      await page.getByTestId("auth-reset-mailbox").getByRole("button", { name: "リンクを開く" }).last().click()
      await expect(r(page).getByTestId("auth-reset-link")).toContainText(title)
      await r(page).getByTestId("auth-reset-link-again").click()
      await expect(r(page).getByTestId("auth-reset-request-email")).toBeVisible()
    }
  })
})

// ------------------------------------------------------------------ セッション切れと再認証
test.describe("Session expiry", () => {
  const s = (page: Page) => frame(page, "auth-session-frame")
  const company = customers[0].company

  async function reauth(page: Page, address?: string) {
    const f = s(page)
    if (address) {
      await f.getByTestId("auth-reauth-switch-account").click()
      await f.getByTestId("auth-reauth-email").fill(address)
    }
    await f.getByTestId("auth-reauth-password").fill(demoPassword)
    await f.getByTestId("auth-reauth-submit").click()
    await enterCode(page, "auth-reauth-mfa")
  }

  test("expired: sensitive data is removed from the page and re-authentication is explained", { tag: "@webkit" }, async ({ page }) => {
    await open(page)
    await expect(s(page).getByText(company)).toBeVisible()
    await page.getByTestId("auth-session-expire").click()
    await expect(s(page).getByRole("heading", { name: "もう一度ログインしてください" })).toBeVisible()
    await expect(s(page).getByText(company)).toHaveCount(0)
    await expect(page.getByTestId("auth-session-content")).toHaveCount(0)
    await expect(page.getByTestId("auth-session-note")).toHaveCount(0)
    await expect(s(page).getByTestId("auth-reauth-email")).toHaveValue(sato.email)
    await expect(s(page).getByTestId("auth-reauth-email")).toHaveAttribute("readonly", "")
  })

  test("a safe automatic refresh is not shown to the user", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: "安全に自動で更新できる" }).check()
    await page.getByTestId("auth-session-note").fill("下書き")
    await page.getByTestId("auth-session-expire").click()
    await expect(page.getByTestId("auth-session-log")).toContainText("自動で更新しました")
    await expect(s(page).getByTestId("auth-reauth")).toHaveCount(0)
    await expect(page.getByTestId("auth-session-note")).toHaveValue("下書き")
    await expect(page.getByTestId("auth-session-message")).toBeEmpty()
  })

  test("same user: permissions are checked again, then the unsaved draft is restored", async ({ page }) => {
    await open(page)
    await page.getByTestId("auth-session-note").fill("未保存の下書き")
    await page.getByTestId("auth-session-expire").click()
    await reauth(page)
    await expect(page.getByTestId("auth-session-note")).toHaveValue("未保存の下書き")
    await expect(page.getByTestId("auth-session-message")).toHaveText("保存していない入力内容を復元しました。")
    expect(await requests(page, "permissions")).toHaveLength(1)
    expect(await requests(page, "save")).toHaveLength(0)
  })

  test("same user without the edit permission: the draft is not restored and editing is not offered", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: "編集の権限がなくなる" }).check()
    await page.getByTestId("auth-session-note").fill("未保存の下書き")
    await page.getByTestId("auth-session-expire").click()
    await reauth(page)
    await expect(page.getByTestId("auth-session-note")).not.toHaveValue("未保存の下書き")
    await expect(page.getByTestId("auth-session-note")).toHaveAttribute("readonly", "")
    await expect(page.getByTestId("auth-session-save")).toHaveCount(0)
    await expect(page.getByTestId("auth-session-message")).toContainText("編集の権限がなくなったため")
  })

  test("expired during a save: the save is not resent; its result is checked after re-authentication", async ({ page }) => {
    await open(page)
    await page.getByTestId("auth-session-expire-on-save").check()
    await page.getByTestId("auth-session-note").fill("保存の途中で切れたメモ")
    await page.getByTestId("auth-session-save").click()
    await expect(s(page).getByTestId("auth-reauth")).toBeVisible()
    await expect(s(page).getByText(company)).toHaveCount(0)
    await expect(page.getByTestId("auth-session-content")).toHaveCount(0)
    await reauth(page)
    await expect(page.getByTestId("auth-session-message")).toHaveText("保存されていたことを確かめました（再送信していません）。")
    await expect(page.getByTestId("auth-session-note")).toHaveValue("保存の途中で切れたメモ")
    expect(await requests(page, "save")).toHaveLength(1)
    // 結果の確認の取得（1 回）だけ。再送信していない
    expect(await requests(page, "load")).toHaveLength(1)
  })

  test("a failed check after re-authentication shows no content and can be retried; no unhandled rejection", async ({ page }) => {
    await open(page)
    await page.getByTestId("auth-session-expire-on-save").check()
    await page.getByTestId("auth-session-note").fill("確認に失敗するメモ")
    await page.getByTestId("auth-session-save").click()
    await expect(s(page).getByTestId("auth-reauth")).toBeVisible()
    // 権限の取得は成功し、保存の結果の取得（loadNote）が失敗する
    await server(page, (x) => (x.mode.load = "network"))
    await reauth(page)
    const verifying = page.getByTestId("auth-session-verifying")
    await expect(verifying).toContainText("確かめられませんでした")
    await expect(page.getByTestId("auth-session-content")).toHaveCount(0)
    await expect(s(page).getByText(company)).toHaveCount(0)
    // 権限の取得も失敗する場合
    await server(page, (x) => (x.mode.permissions = "network"))
    await page.getByTestId("auth-session-verify-retry").click()
    await expect(verifying).toContainText("確かめられませんでした")
    await expect(page.getByTestId("auth-session-content")).toHaveCount(0)
    await server(page, (x) => {
      x.mode.permissions = "success"
      x.mode.load = "success"
    })
    await page.getByTestId("auth-session-verify-retry").click()
    await expect(page.getByTestId("auth-session-message")).toHaveText("保存されていたことを確かめました（再送信していません）。")
    expect(await requests(page, "save")).toHaveLength(1)
  })

  test("while checking, the retry is not offered twice; a response after leaving the page is ignored", async ({ page }) => {
    await open(page)
    await page.getByTestId("auth-session-note").fill("未保存の下書き")
    await page.getByTestId("auth-session-expire").click()
    await server(page, (x) => (x.ignoreAbort = true))
    await hold(page, "permissions")
    await reauth(page)
    await waitHeld(page, "permissions", 1)
    const verifying = page.getByTestId("auth-session-verifying")
    await expect(verifying).toContainText("権限を確かめています")
    // 確認の途中は内容を表示せず、再試行の操作もない（二重に確かめない）
    await expect(page.getByTestId("auth-session-verify-retry")).toHaveCount(0)
    await expect(page.getByTestId("auth-session-content")).toHaveCount(0)
    // 応答の前にページを離れる。AbortSignal に従わない応答が後から届いても、例外やエラーにしない（collectPageErrors）
    await page.goto("/#/data-states")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await release(page, "permissions")
    expect(await requests(page, "permissions")).toHaveLength(1)
    // 古い応答の後に、照会（load）を続けない
    expect(await requests(page, "load")).toHaveLength(0)
  })

  test("same user without the view permission: neither the customer nor the draft is shown; the save result is not queried", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: "閲覧の権限がなくなる" }).check()
    await page.getByTestId("auth-session-expire-on-save").check()
    await page.getByTestId("auth-session-note").fill("閲覧できなくなる下書き")
    await page.getByTestId("auth-session-save").click()
    await expect(s(page).getByTestId("auth-reauth")).toBeVisible()
    await reauth(page)
    const blocked = s(page).getByTestId("auth-session-no-access")
    await expect(blocked).toBeVisible()
    await expect(blocked.getByTestId("auth-session-message")).toContainText("閲覧の権限がなくなったため")
    await expect(page.getByTestId("auth-session-content")).toHaveCount(0)
    await expect(s(page).getByText(company)).toHaveCount(0)
    await expect(page.getByText("閲覧できなくなる下書き")).toHaveCount(0)
    await expect(page.getByText("来月の更新の前に")).toHaveCount(0)
    // 閲覧できない利用者の認可では、保存の結果を照会しない。保存を再送信しない
    expect(await requests(page, "load")).toHaveLength(0)
    expect(await requests(page, "save")).toHaveLength(1)
  })

  test("same user in another workspace: the previous work is not restored and the previous workspace's data is not shown", async ({ page }) => {
    await open(page)
    await page.getByRole("radio", { name: "別のワークスペース（西日本営業部）" }).check()
    await page.getByTestId("auth-session-note").fill("本社営業部の下書き")
    await page.getByTestId("auth-session-expire").click()
    await reauth(page)
    const other = s(page).getByTestId("auth-session-other-workspace")
    await expect(other).toContainText("西日本営業部のホーム")
    await expect(page.getByTestId("auth-session-content")).toHaveCount(0)
    await expect(s(page).getByText(company)).toHaveCount(0)
    await expect(page.getByText("本社営業部の下書き")).toHaveCount(0)
    await expect(page.getByTestId("auth-session-log")).toContainText("別のワークスペースでログインしました")
    await expect(page.getByTestId("auth-session-log")).toContainText("入力、通知、キャッシュ、非同期の結果、結果が不明な保存")
    // 前のワークスペースのデータを照会しない
    expect(await requests(page, "load")).toHaveLength(0)
  })

  test("a different user: the previous user's draft and data are discarded", async ({ page }) => {
    await open(page)
    await page.getByTestId("auth-session-note").fill("佐藤の未保存の下書き")
    await page.getByTestId("auth-session-expire").click()
    await reauth(page, users["u-suzuki"].email)
    await expect(s(page).getByTestId("auth-session-content")).toContainText("鈴木 一郎（メンバー）")
    await expect(page.getByTestId("auth-session-note")).toHaveValue("")
    await expect(page.getByText("佐藤の未保存の下書き")).toHaveCount(0)
    await expect(page.getByText("来月の更新の前に")).toHaveCount(0)
    await expect(page.getByTestId("auth-session-message")).toBeEmpty()
    // 破棄の対象：入力、認証情報、通知、キャッシュ、非同期の結果、結果が不明な保存
    await expect(page.getByTestId("auth-session-log")).toContainText("入力、認証情報、通知、キャッシュ、非同期の結果、結果が不明な保存")
  })
})

// ------------------------------------------------------------------ ログアウトとアカウントの切り替え
test.describe("Sign-out and account switching", () => {
  const a = (page: Page) => frame(page, "auth-account-frame")

  test("sign-out has no confirmation and is not shown as destructive", async ({ page }) => {
    await open(page)
    await a(page).getByTestId("auth-account-menu").click()
    const item = page.getByTestId("auth-account-logout")
    await expect(item).toHaveAttribute("data-variant", "default")
    const color = await item.evaluate((el) => getComputedStyle(el).color)
    const destructive = await page.evaluate(() => {
      const probe = document.createElement("span")
      probe.className = "text-destructive"
      document.body.append(probe)
      const c = getComputedStyle(probe).color
      probe.remove()
      return c
    })
    expect(color).not.toBe(destructive)
    await item.click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(a(page).getByTestId("auth-account-signed-out")).toBeVisible()
    await expect(a(page).getByTestId("auth-account-status")).toHaveText("ログアウトしました。")
    await expect(a(page).getByTestId("auth-account-status")).toHaveAttribute("role", "status")
  })

  test("unsaved changes: only then confirm; keep editing keeps the input, discard signs out", async ({ page }) => {
    await open(page)
    await a(page).getByTestId("auth-account-memo").fill("書きかけ")
    await a(page).getByTestId("auth-account-menu").click()
    await page.getByTestId("auth-account-logout").click()
    const dialog = page.getByTestId("auth-account-discard")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "編集を続ける" })).toBeFocused()
    await dialog.getByRole("button", { name: "編集を続ける" }).click()
    await expect(a(page).getByTestId("auth-account-memo")).toHaveValue("書きかけ")
    await a(page).getByTestId("auth-account-menu").click()
    await page.getByTestId("auth-account-logout").click()
    await page.getByTestId("auth-account-discard").getByRole("button", { name: "変更を破棄" }).click()
    await expect(a(page).getByTestId("auth-account-signed-out")).toBeVisible()
  })

  test("switching the account discards search, selection and input; notifications and role follow the new account", async ({ page }) => {
    await open(page)
    const f = a(page)
    await f.getByTestId("auth-account-search").fill("有限会社")
    await f.getByTestId("auth-account-list").getByRole("checkbox").first().click()
    await expect(f.getByTestId("auth-account-selected")).toHaveText("選択：1 件")
    await expect(f.getByTestId("auth-account-summary")).toContainText("佐藤 花子・本社営業部・管理者・未読の通知 3 件")
    await f.getByTestId("auth-account-menu").click()
    await page.getByRole("menuitem", { name: "鈴木 一郎に切り替える" }).click()
    await expect(f.getByTestId("auth-account-summary")).toContainText("鈴木 一郎・本社営業部・メンバー")
    await expect(f.getByTestId("auth-account-search")).toHaveValue("")
    await expect(f.getByTestId("auth-account-selected")).toHaveText("選択：0 件")
    await expect(f.getByTestId("auth-account-memo")).toHaveValue("")
  })

  test("an async result from the previous scope is not shown (A → B → A), and its toast is closed on switch", async ({ page }) => {
    await open(page)
    const f = a(page)
    const toastText = /顧客の書き出しが完了しました/
    // A（本社営業部）で開始 → 応答を保留 → B（西日本営業部）→ A に戻る → 最初の A の応答を解放する。最初の A の結果は反映しない。
    // サーバーは AbortSignal に従わない（中止しても応答が届く）
    await server(page, (s) => (s.ignoreAbort = true))
    await hold(page, "export")
    await f.getByTestId("auth-account-export").click()
    await waitHeld(page, "export", 1)
    const select = async (name: string) => {
      await f.getByTestId("auth-account-workspace").click()
      await page.getByRole("option", { name }).click()
    }
    await select("西日本営業部")
    await expect(f.getByTestId("auth-account-summary")).toContainText("西日本営業部")
    await select("本社営業部")
    await expect(f.getByTestId("auth-account-summary")).toContainText("本社営業部")
    await release(page, "export")
    await expect(page.getByText(toastText)).toHaveCount(0)
    // 同じスコープで完了した結果は知らせ、スコープが変わったら閉じる
    await hold(page, "export", false)
    await f.getByTestId("auth-account-export").click()
    await expect(page.getByText("顧客の書き出しが完了しました（本社営業部）")).toBeVisible()
    await select("西日本営業部")
    await expect(page.getByText(toastText)).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 認証情報の保存
test.describe("Credentials are not persisted", () => {
  test("password and code stay out of storage, URL, cookies, console and the request log", async ({ page }) => {
    const logs: string[] = []
    page.on("console", (m) => logs.push(m.text()))
    await open(page)
    const f = frame(page, "auth-signin-frame")
    await signIn(f, "auth-signin", sato.email, demoPassword)
    await enterCode(page, "auth-signin-mfa")
    await expect(page.getByTestId("auth-signin-destination")).toBeVisible()
    await page.getByTestId("auth-session-note").fill("x")
    const dump = await page.evaluate(async () => {
      const store = (s: Storage) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`).join("\n")
      const dbs = "databases" in indexedDB ? (await indexedDB.databases()).map((d) => d.name).join(",") : ""
      return [store(localStorage), store(sessionStorage), document.cookie, location.href, dbs, JSON.stringify(window.__fdSaAuthServer?.requests)].join("\n")
    })
    for (const secret of [demoPassword, demoVerificationCode]) {
      expect(dump).not.toContain(secret)
      expect(logs.join("\n")).not.toContain(secret)
    }
    // パスワードの欄の値は、最初の要素の確認の後に残さない（追加の確認の画面に戻っても空）
    expect(await page.locator("input[type=password]").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).filter((v) => v !== ""))).toEqual([])
  })

  test("recovery codes, new passwords and re-authentication also stay out of the URL, storage, history state and console", async ({ page }) => {
    const logs: string[] = []
    page.on("console", (m) => logs.push(m.text()))
    await open(page)
    const newPassword = "a-new-long-password-42"
    const signUpPassword = "sign-up-long-pass-77"
    // リカバリーコード
    const m = frame(page, "auth-mfa-frame")
    await m.getByTestId("auth-mfa-other").click()
    await m.getByRole("button", { name: "リカバリーコードを使う" }).click()
    await m.getByTestId("auth-mfa-code").fill("7KQ2-M9XD")
    await m.getByTestId("auth-mfa-submit").click()
    await expect(page.getByTestId("auth-mfa-result")).toBeVisible()
    // 新規登録のパスワード
    const up = frame(page, "auth-signup-frame")
    await up.getByTestId("auth-signup-email").fill("new.user@example.com")
    await up.getByTestId("auth-signup-password").fill(signUpPassword)
    await up.getByTestId("auth-signup-terms").click()
    await up.getByTestId("auth-signup-submit").click()
    await expect(up.getByTestId("auth-verify")).toBeVisible()
    // パスワードの再設定
    const r = frame(page, "auth-reset-frame")
    await r.getByTestId("auth-reset-request-email").fill(sato.email)
    await r.getByTestId("auth-reset-request-submit").click()
    await page.getByTestId("auth-reset-mailbox").getByRole("button", { name: "リンクを開く" }).click()
    await r.getByTestId("auth-new-password-password").fill(newPassword)
    await r.getByTestId("auth-new-password-submit").click()
    await expect(r.getByTestId("auth-reset-signin")).toBeVisible()
    // セッション切れの再認証（パスワードと確認コード）
    const sf = frame(page, "auth-session-frame")
    await page.getByTestId("auth-session-expire").click()
    await sf.getByTestId("auth-reauth-password").fill(demoPassword)
    await sf.getByTestId("auth-reauth-submit").click()
    await enterCode(page, "auth-reauth-mfa")
    await expect(sf.getByTestId("auth-session-content")).toBeVisible()
    const dump = await page.evaluate(() => {
      const store = (s: Storage) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i)!)}`).join("\n")
      return [store(localStorage), store(sessionStorage), document.cookie, location.href, JSON.stringify(history.state), JSON.stringify(window.__fdSaAuthServer?.requests)].join("\n")
    })
    for (const secret of [demoPassword, demoVerificationCode, "7KQ2M9XD", "7KQ2-M9XD", newPassword, signUpPassword]) {
      expect(dump, secret).not.toContain(secret)
      expect(logs.join("\n"), secret).not.toContain(secret)
    }
  })
})

// ------------------------------------------------------------------ 動きを減らす設定
test.describe("Reduced motion", () => {
  test.use({ reducedMotion: "reduce" })
  test("the loading spinner does not rotate", async ({ page }) => {
    await open(page)
    // 応答を保留して、Loading の状態を保つ
    await hold(page, "sign-in")
    const f = frame(page, "auth-signin-frame")
    await signIn(f, "auth-signin", sato.email, demoPassword)
    const spinner = submit(f, "auth-signin").locator("[data-slot=button-spinner] svg")
    await expect(spinner).toBeVisible()
    expect(await spinner.evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
  })
})
