import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { colorContrast, css, sameColor, token } from "./helpers"

const pages = ["input", "textarea", "label", "select", "checkbox", "radio-group", "switch", "field", "customer-form"]

async function open(page: Page, id: string) {
  await page.goto(`/#/${id}`)
  await page.getByRole("heading", { level: 1 }).waitFor()
}

const box = async (l: Locator) => (await l.boundingBox())!

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press("Tab")
    if (await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))) return
  }
  throw new Error("target was not reached with Tab")
}

async function expectFocusRing(page: Page, target: Locator) {
  expect(await css(target, "outline-style")).toBe("solid")
  expect(await css(target, "outline-width")).toBe("2px")
  expect(sameColor(await css(target, "outline-color"), await token(page, "--ring"))).toBe(true)
}

test.describe("all form pages", () => {
  for (const id of pages) {
    test(`${id}: names, no horizontal scroll`, async ({ page }) => {
      await open(page, id)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const controls = page.locator("main").getByRole("textbox")
        .or(page.locator("main").getByRole("combobox"))
        .or(page.locator("main").getByRole("checkbox"))
        .or(page.locator("main").getByRole("radio"))
        .or(page.locator("main").getByRole("switch"))
        .or(page.locator("main").getByRole("spinbutton"))
      const n = await controls.count()
      expect(n).toBeGreaterThan(0)
      for (let i = 0; i < n; i++) await expect(controls.nth(i)).toHaveAccessibleName(/\S/)
      // 長いラベル：ラベルが入力欄の幅からはみ出さない
      const labels = page.locator("main [data-slot=label]")
      for (let i = 0; i < (await labels.count()); i++) {
        expect(await labels.nth(i).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
      }
    })
  }
})

test.describe("Input", () => {
  test("tokens, label spacing, focus", async ({ page }) => {
    await open(page, "input")
    const input = page.getByTestId("input-default")
    expect((await box(input)).height).toBe(48)
    expect(await css(input, "border-top-left-radius")).toBe("12px")
    expect(await css(input, "padding-left")).toBe("16px")
    expect(await css(input, "font-size")).toBe("16px")
    expect(await css(input, "font-weight")).toBe("400")
    expect(await css(input, "border-top-width")).toBe("1px")
    expect(await css(input, "box-shadow")).toBe("none")
    expect(await css(input, "transition-duration")).toBe("0.12s")
    expect(sameColor(await css(input, "background-color"), await token(page, "--background"))).toBe(true)
    expect(sameColor(await css(input, "border-top-color"), await token(page, "--input"))).toBe(true)
    expect(await input.evaluate((el) => getComputedStyle(el, "::placeholder").fontSize)).toBe("16px")
    // ラベル：14px、500、入力欄との間隔 8px
    const label = page.getByText("会社名", { exact: true }).nth(1)
    expect(await css(label, "font-size")).toBe("14px")
    expect(await css(label, "font-weight")).toBe("500")
    const lb = await box(label)
    expect(Math.round((await box(input)).y - (lb.y + lb.height))).toBe(8)
    // コントラスト
    const bg = await css(input, "background-color")
    expect(await colorContrast(page, await css(input, "color"), bg)).toBeGreaterThanOrEqual(4.5)
    expect(
      await colorContrast(page, await input.evaluate((el) => getComputedStyle(el, "::placeholder").color), bg)
    ).toBeGreaterThanOrEqual(4.5)
    expect(await colorContrast(page, await css(input, "border-top-color"), bg)).toBeGreaterThanOrEqual(3)
    await tabTo(page, input)
    await expectFocusRing(page, input)
  })

  test("types keep browser features", async ({ page }) => {
    await open(page, "input")
    await expect(page.getByTestId("input-email")).toHaveAttribute("type", "email")
    await expect(page.getByTestId("input-email")).toHaveAttribute("autocomplete", "email")
    await expect(page.getByRole("spinbutton", { name: "従業員数" })).toHaveAttribute("inputmode", "numeric")
  })

  test("disabled, readonly, error", async ({ page }) => {
    await open(page, "input")
    await expect(page.getByTestId("input-disabled")).toBeDisabled()
    const ro = page.getByTestId("input-readonly")
    await expect(ro).not.toBeEditable()
    await ro.focus()
    await expect(ro).toBeFocused()
    expect(sameColor(await css(ro, "background-color"), await token(page, "--muted"))).toBe(true)
    const err = page.getByTestId("input-error")
    await expect(err).toHaveAttribute("aria-invalid", "true")
    expect(sameColor(await css(err, "border-top-color"), await token(page, "--destructive"))).toBe(true)
    await expect(err).toHaveAccessibleDescription(/ドメイン名を入力してください/)
    const msg = page.getByTestId("input-error-message")
    expect(await css(msg, "font-size")).toBe("14px")
    await expect(msg.locator("svg")).toBeVisible()
    expect(
      await colorContrast(page, await css(msg, "color"), await token(page, "--background"))
    ).toBeGreaterThanOrEqual(4.5)
  })
})

test.describe("Textarea", () => {
  test("tokens, resize, counter", async ({ page }) => {
    await open(page, "textarea")
    const ta = page.getByTestId("textarea-default")
    expect((await box(ta)).height).toBeGreaterThanOrEqual(96)
    expect(await css(ta, "border-top-left-radius")).toBe("12px")
    expect(await css(ta, "padding-left")).toBe("16px")
    expect(await css(ta, "padding-top")).toBe("12px")
    expect(await css(ta, "font-size")).toBe("16px")
    expect(await css(ta, "resize")).toBe("vertical")
    await expect(page.getByRole("textbox", { name: "備考" }).first()).toBeVisible()
    // 文字数の上限は入力中に知らせる
    const counter = page.getByTestId("textarea-counter")
    await counter.fill("あ".repeat(201))
    await expect(page.getByTestId("textarea-counter-error")).toContainText("現在 201 文字")
    await expect(counter).toHaveAttribute("aria-invalid", "true")
    await counter.fill("あ".repeat(10))
    await expect(page.getByTestId("textarea-counter-count")).toHaveText("10 / 200 文字")
    await expect(page.getByTestId("textarea-disabled")).toBeDisabled()
  })
})

test.describe("Label", () => {
  test("association and required mark", async ({ page }) => {
    await open(page, "label")
    await page.getByTestId("label-field").click()
    await expect(page.getByTestId("label-field-input")).toBeFocused()
    await page.getByTestId("label-standalone").click()
    await expect(page.locator("#label-standalone")).toBeFocused()
    const required = page.getByTestId("label-required-input")
    await expect(required).toHaveAttribute("required", "")
    // 記号は読み上げず、名前は「メールアドレス」のまま
    await expect(required).toHaveAccessibleName("メールアドレス")
    await expect(page.getByRole("textbox", { name: "電話番号 任意" }).first()).toBeVisible()
  })
})

test.describe("Select", () => {
  test("tokens", async ({ page }) => {
    await open(page, "select")
    const t = page.getByTestId("select-industry")
    expect((await box(t)).height).toBe(48)
    expect(await css(t, "border-top-left-radius")).toBe("12px")
    expect(await css(t, "padding-left")).toBe("16px")
    expect(await css(t, "font-size")).toBe("16px")
    expect((await box(t.locator("svg"))).width).toBe(20)
    await expect(t).toHaveAccessibleName("業種")
    await t.click()
    const popup = page.locator("[data-slot=select-content]")
    await expect(popup).toBeVisible()
    expect(await css(popup, "box-shadow")).toContain("0px 2px 8px")
    expect(await css(popup, "transition-duration")).toBe("0.18s")
  })

  test("keyboard: open, move, select, focus returns, value shown", async ({ page }) => {
    await open(page, "select")
    const t = page.getByTestId("select-industry")
    await tabTo(page, t)
    await expectFocusRing(page, t)
    await page.keyboard.press("Enter")
    await expect(page.getByRole("listbox")).toBeVisible()
    await expect(page.getByRole("option").first()).toBeFocused()
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(page.getByRole("listbox")).toBeHidden()
    await expect(t).toBeFocused()
    await expect(t).toContainText("製造業")
    await expect(page.getByTestId("select-industry-result")).toHaveText("選択中：製造業")
    // 選択中の項目は、チェックのアイコンと aria-selected で識別できる
    await page.keyboard.press("ArrowDown")
    const selected = page.getByRole("option", { name: "製造業" })
    await expect(selected).toHaveAttribute("aria-selected", "true")
    await expect(selected.locator("[data-slot=select-item-indicator] svg")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toBeHidden()
    await expect(t).toBeFocused()
    await expect(t).toContainText("製造業")
  })

  test("typeahead and scroll", async ({ page }) => {
    await open(page, "select")
    const long = page.getByTestId("select-long")
    await long.click()
    await page.getByRole("listbox").waitFor()
    await page.keyboard.press("s")
    await expect(page.getByRole("option", { name: /^Send invoices/ })).toHaveAttribute("data-highlighted", "")
    await page.keyboard.press("Escape")
    // 選択肢が多い場合はスクロールする
    await page.getByTestId("select-industry").click()
    const list = page.getByRole("listbox")
    await expect(list).toBeVisible()
    // 開く動き（180ms）が終わり、高さが決まるまで待つ
    await expect.poll(() => list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await page.keyboard.press("End")
    await expect(page.getByRole("option", { name: /^公務/ })).toBeInViewport()
  })

  test("long values wrap without truncation", async ({ page }) => {
    await open(page, "select")
    const long = page.getByTestId("select-long")
    expect((await box(long)).height).toBeGreaterThan(48)
    await expect(long).toContainText("電子版も同時にメールで送る")
    const value = long.locator("[data-slot=select-value]")
    expect(await value.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  })

  test("disabled and error", async ({ page }) => {
    await open(page, "select")
    const d = page.getByTestId("select-disabled")
    await d.click({ force: true })
    await expect(page.getByRole("listbox")).toBeHidden()
    const e = page.getByTestId("select-error")
    await expect(e).toHaveAttribute("aria-invalid", "true")
    await expect(e).toHaveAccessibleDescription(/業種を選んでください/)
    expect(sameColor(await css(e, "border-top-color"), await token(page, "--destructive"))).toBe(true)
  })
})

test.describe("Checkbox", () => {
  test("tokens, states, hit area", async ({ page, isMobile }) => {
    await open(page, "checkbox")
    const c = page.getByTestId("checkbox-basic")
    const b = await box(c)
    expect([b.width, b.height]).toEqual([20, 20])
    expect(await css(c, "border-top-left-radius")).toBe("4px")
    expect(sameColor(await css(c, "border-top-color"), await token(page, "--input"))).toBe(true)
    // ラベルを含む行の高さは 48px 以上
    expect((await box(page.getByTestId("checkbox-basic-label"))).height).toBeGreaterThanOrEqual(48)
    // 本体の外側 12px を押しても切り替わる（押せる範囲 48×48px）
    if (!isMobile) await page.mouse.click(b.x - 12, b.y + b.height / 2)
    else await c.tap({ position: { x: -12, y: 10 }, force: true })
    await expect(c).toHaveAttribute("aria-checked", "true")
    const primary = await token(page, "--primary")
    // 色の変化には 120ms の transition があるため、終わるまで待つ。
    await expect.poll(async () => sameColor(await css(c, "background-color"), primary)).toBe(true)
    await expect(c.locator("svg").first()).toBeVisible()
    // ラベルで切り替える
    await page.getByTestId("checkbox-basic-label").click()
    await expect(c).toHaveAttribute("aria-checked", "false")
    // キーボード
    await tabTo(page, c)
    await expectFocusRing(page, c)
    await page.keyboard.press("Space")
    await expect(c).toHaveAttribute("aria-checked", "true")
  })

  test("indeterminate, disabled, error", async ({ page }) => {
    await open(page, "checkbox")
    const parent = page.getByTestId("checkbox-parent")
    await expect(parent).toHaveAttribute("aria-checked", "mixed")
    await parent.click()
    await expect(parent).toHaveAttribute("aria-checked", "true")
    await expect(page.getByTestId("checkbox-post")).toHaveAttribute("aria-checked", "true")
    const d = page.getByTestId("checkbox-disabled")
    await d.click({ force: true })
    await expect(d).toHaveAttribute("aria-checked", "false")
    await expect(d).toHaveAttribute("aria-disabled", "true")
    const e = page.getByTestId("checkbox-error")
    await expect(e).toHaveAttribute("aria-invalid", "true")
    await expect(e).toHaveAccessibleDescription(/同意が必要です/)
    expect(sameColor(await css(e, "border-top-color"), await token(page, "--destructive"))).toBe(true)
  })
})

test.describe("Radio Group", () => {
  test("tokens and arrow keys", async ({ page }) => {
    await open(page, "radio-group")
    const group = page.getByTestId("radio-basic")
    const radios = group.getByRole("radio")
    const b = await box(radios.first())
    expect([b.width, b.height]).toEqual([20, 20])
    expect(parseFloat(await css(radios.first(), "border-top-left-radius"))).toBeGreaterThanOrEqual(10)
    await expect(group).toHaveAccessibleName("従業員の規模")
    const checked = group.getByRole("radio", { checked: true })
    await tabTo(page, checked)
    await expect(checked).toHaveAccessibleName("50〜299 人")
    await expectFocusRing(page, checked)
    await page.keyboard.press("ArrowDown")
    await expect(group.getByRole("radio", { name: "300 人以上" })).toBeChecked()
    await page.keyboard.press("ArrowUp")
    await page.keyboard.press("ArrowUp")
    await expect(group.getByRole("radio", { name: "1〜49 人" })).toBeChecked()
    const dot = group.getByRole("radio", { checked: true }).locator("[data-slot=radio-group-indicator]")
    expect(sameColor(await css(dot, "background-color"), await token(page, "--primary"))).toBe(true)
    // 行の高さ 48px 以上
    expect((await box(group.locator("[data-slot=field-item]").first())).height).toBeGreaterThanOrEqual(48)
    await expect(page.getByTestId("radio-disabled").getByRole("radio").first()).toBeDisabled()
  })
})

test.describe("Switch", () => {
  test("tokens, position, colors, hit area", async ({ page, isMobile }) => {
    await open(page, "switch")
    const s = page.getByTestId("switch-basic")
    const b = await box(s)
    expect([b.width, b.height]).toEqual([44, 28])
    expect(await css(s, "transition-duration")).toBe("0.12s")
    const thumb = s.locator("[data-slot=switch-thumb]")
    expect((await box(thumb)).width).toBe(20)
    const offX = (await box(thumb)).x
    const off = await css(s, "background-color")
    expect(sameColor(off, await token(page, "--input"))).toBe(true)
    // OFF のトラックは背景と 3:1、円はトラックと 3:1 以上
    expect(await colorContrast(page, off, await token(page, "--background"))).toBeGreaterThanOrEqual(3)
    expect(await colorContrast(page, await css(thumb, "background-color"), off)).toBeGreaterThanOrEqual(3)
    // 本体の上 8px を押しても切り替わる
    if (!isMobile) await page.mouse.click(b.x + b.width / 2, b.y - 8)
    else await s.tap({ position: { x: 22, y: -8 }, force: true })
    await expect(s).toHaveAttribute("aria-checked", "true")
    await page.waitForTimeout(200)
    expect((await box(thumb)).x - offX).toBe(16)
    const primary = await token(page, "--primary")
    await expect.poll(async () => sameColor(await css(s, "background-color"), primary)).toBe(true)
    const on = await css(s, "background-color")
    expect(await colorContrast(page, await css(thumb, "background-color"), on)).toBeGreaterThanOrEqual(3)
    await tabTo(page, s)
    await expectFocusRing(page, s)
    await page.keyboard.press("Space")
    await expect(s).toHaveAttribute("aria-checked", "false")
  })

  test("instant save failure reverts and announces", async ({ page }) => {
    await open(page, "switch")
    const s = page.getByTestId("switch-ng")
    await s.click()
    await expect(page.getByTestId("switch-ng-status")).toHaveText("保存しています")
    await expect(page.getByTestId("switch-ng-status")).toContainText("保存できませんでした")
    await expect(s).toHaveAttribute("aria-checked", "false")
    await expect(page.getByTestId("switch-ng-status")).toHaveAttribute("role", "status")
    await page.getByTestId("switch-ok").click()
    await expect(page.getByTestId("switch-ok-status")).toHaveText("オフにしました")
    await expect(page.getByTestId("switch-disabled")).toHaveAttribute("aria-disabled", "true")
  })

  test("reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "switch")
    const thumb = page.getByTestId("switch-basic").locator("[data-slot=switch-thumb]")
    expect(await css(thumb, "transition-property")).toBe("none")
    // 円の位置は変わる
    const x = (await box(thumb)).x
    await page.getByTestId("switch-basic").click()
    expect((await box(thumb)).x - x).toBe(16)
  })
})

test.describe("Field", () => {
  test("structure and wiring", async ({ page }) => {
    await open(page, "field")
    const input = page.getByTestId("field-anatomy-input")
    await expect(input).toHaveAccessibleName("メールアドレス")
    await expect(input).toHaveAccessibleDescription(/請求書の送付先になる.*ドメイン名を入力してください/)
    await expect(input).toHaveAttribute("aria-invalid", "true")
    const ids = (await input.getAttribute("aria-describedby"))!.split(" ")
    expect(ids).toContain(await page.getByTestId("field-anatomy-description").getAttribute("id"))
    expect(ids).toContain(await page.getByTestId("field-anatomy-error").getAttribute("id"))
    // 項目の間 16px、まとまりの間 32px
    expect(await css(page.getByTestId("field-group"), "row-gap")).toBe("16px")
    expect(await css(page.getByTestId("field-sets"), "row-gap")).toBe("32px")
  })
})

test.describe("brand", () => {
  test("checked controls follow --primary and keep contrast", async ({ page }) => {
    await open(page, "checkbox")
    await page.getByRole("radio", { name: "紫" }).check()
    const c = page.getByTestId("checkbox-basic")
    await c.click()
    await expect.poll(() => css(c, "background-color")).toBe("rgb(109, 40, 217)")
    expect(
      await colorContrast(page, await css(c.locator("svg").first(), "color"), await css(c, "background-color"))
    ).toBeGreaterThanOrEqual(3)
    await page.goto("/#/switch")
    await page.getByRole("radio", { name: "青" }).check()
    const s = page.getByTestId("switch-ok")
    await expect.poll(() => css(s, "background-color")).toBe("rgb(30, 64, 175)")
  })
})

test.describe("customer form", () => {
  test("no errors while passing through or typing; blur validates; fixes revalidate", async ({ page }) => {
    await open(page, "customer-form")
    const company = page.getByRole("textbox", { name: "会社名", exact: true })
    const email = page.getByRole("textbox", { name: "メールアドレス" })
    await company.focus()
    await page.keyboard.press("Tab")
    await expect(page.locator("[data-slot=field-error]")).toHaveCount(0)
    await email.fill("yamada@")
    await expect(page.getByTestId("email-error")).toHaveCount(0)
    await email.blur()
    await expect(page.getByTestId("email-error")).toContainText("ドメイン名を入力してください")
    await expect(email).toHaveAttribute("aria-invalid", "true")
    await email.pressSequentially("example.com")
    await expect(page.getByTestId("email-error")).toHaveCount(0)
  })

  test("submit with errors shows a summary that moves focus to each field", async ({ page }) => {
    await open(page, "customer-form")
    await page.getByTestId("customer-submit").click()
    const summary = page.getByTestId("error-summary")
    await expect(summary).toBeFocused()
    await expect(summary).toContainText("入力内容を確認してください（8 件）")
    await summary.getByRole("link", { name: /^業種/ }).click()
    await expect(page.getByRole("combobox", { name: "業種" })).toBeFocused()
    await summary.getByRole("link", { name: /^利用規約/ }).click()
    await expect(page.getByRole("checkbox", { name: "利用規約に同意する" })).toBeFocused()
    await summary.getByRole("link", { name: "会社名を入力してください" }).click()
    await expect(page.getByRole("textbox", { name: "会社名", exact: true })).toBeFocused()
    // 選び直すと再検証される
    await page.getByRole("combobox", { name: "契約プラン" }).click()
    await page.getByRole("option", { name: /^月額/ }).click()
    await expect(summary).toContainText("（7 件）")
  })

  test("valid submission sends the values", async ({ page }) => {
    await open(page, "customer-form")
    await page.getByRole("textbox", { name: "会社名", exact: true }).fill("山田商事株式会社")
    await page.getByRole("textbox", { name: "会社名（フリガナ）" }).fill("ヤマダショウジ")
    await page.getByRole("combobox", { name: "業種" }).click()
    await page.getByRole("option", { name: "製造業" }).click()
    await page.getByRole("spinbutton", { name: /従業員数/ }).fill("120")
    await page.getByRole("textbox", { name: "担当者名" }).fill("山田 花子")
    await page.getByRole("textbox", { name: "メールアドレス" }).fill("hanako@example.com")
    await page.getByRole("combobox", { name: "契約プラン" }).click()
    await page.getByRole("option", { name: /^年額/ }).click()
    await page.getByRole("checkbox", { name: "メール" }).click()
    await page.getByRole("checkbox", { name: "郵送" }).click()
    await page.getByTestId("note").fill("請求書は経理部宛て")
    await page.getByRole("checkbox", { name: "利用規約に同意する" }).click()
    await page.getByTestId("customer-submit").click()
    await expect(page.getByTestId("customer-status")).toHaveText("登録しています")
    await expect(page.getByTestId("customer-status")).toHaveText("顧客を登録しました")
    const r = page.getByTestId("customer-result")
    const v = (k: string) => r.locator(`dd[data-key="${k}"]`)
    await expect(v("companyName")).toHaveText("山田商事株式会社")
    await expect(v("industry")).toHaveText("manufacturing")
    await expect(v("employees")).toHaveText("120")
    await expect(v("plan")).toHaveText("yearly")
    await expect(v("delivery")).toHaveText("email, post")
    await expect(v("agree")).toHaveText("on")
    await expect(page.locator("[data-slot=field-error]")).toHaveCount(0)
  })

  test("note length is reported while typing", async ({ page }) => {
    await open(page, "customer-form")
    await page.getByTestId("note").fill("あ".repeat(205))
    await expect(page.getByText("備考は 200 文字以内で入力してください（現在 205 文字）")).toBeVisible()
  })

  test("IME composition is not validated until committed", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP only")
    await open(page, "customer-form")
    const kana = page.getByRole("textbox", { name: "会社名（フリガナ）" })
    // 一度エラーを表示させる
    await kana.fill("やまだ")
    await kana.blur()
    await expect(page.getByTestId("kana-error")).toContainText("全角カタカナ")
    await kana.fill("")
    await kana.blur()
    await expect(page.getByTestId("kana-error")).toHaveText("会社名のフリガナを入力してください")
    await kana.focus()
    const cdp = await page.context().newCDPSession(page)
    // 変換中（未確定）の「やまだ」は検証しない
    await cdp.send("Input.imeSetComposition", { text: "やまだ", selectionStart: 3, selectionEnd: 3 })
    await expect(kana).toHaveValue("やまだ")
    await expect(page.getByTestId("kana-error")).toHaveText("会社名のフリガナを入力してください")
    // 確定した時点で検証する
    await cdp.send("Input.insertText", { text: "ヤマダ" })
    await expect(kana).toHaveValue("ヤマダ")
    await expect(page.getByTestId("kana-error")).toHaveCount(0)
  })

})

test.describe("screenshots", () => {
  test("capture", async ({ page }, info) => {
    const dir = join(info.project.testDir, "..", "screenshots", info.project.name)
    for (const id of pages) {
      await open(page, id)
      await page.screenshot({ path: `${dir}/${id}.png`, fullPage: true })
    }
    if (info.project.name !== "desktop") return
    await open(page, "select")
    await page.getByTestId("select-plan").click()
    await page.getByRole("listbox").waitFor()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/select-open.png` })
    await open(page, "customer-form")
    await page.getByTestId("customer-submit").click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${dir}/customer-form-errors.png`, fullPage: true })
  })
})
