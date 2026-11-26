import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { colorContrast, css, sameColor, token } from "./helpers"
import { collectPageErrors } from "./page-errors"

// ページで捕捉されなかった例外があれば、テストを失敗にする。
collectPageErrors(test)

// Advanced Components（Combobox、Multi Select、Command、Calendar、Date Picker、File Upload、Empty）の検品。
// 日付に関わるテストは、時計を 2026-11-25 10:00（日本時間、水曜日）に固定する。

const pages = [
  "combobox",
  "multi-select",
  "command",
  "calendar",
  "date-picker",
  "file-upload",
  "empty",
  "report-filter",
  "csv-import",
]

const NOW = new Date("2026-11-25T10:00:00+09:00")

async function open(page: Page, id: string, { clock = true } = {}) {
  if (clock) await page.clock.setFixedTime(NOW)
  await page.goto(`/#/${id}`)
  await page.getByRole("heading", { level: 1 }).waitFor()
}

const box = async (l: Locator) => (await l.boundingBox())!

async function expectFocusRing(page: Page, target: Locator) {
  expect(await css(target, "outline-style")).toBe("solid")
  expect(await css(target, "outline-width")).toBe("2px")
  expect(sameColor(await css(target, "outline-color"), await token(page, "--ring"))).toBe(true)
}

// 色の transition（120ms）が終わるのを待ってから比べる。
async function expectColor(page: Page, target: Locator, prop: string, name: string) {
  const want = await token(page, name)
  // transition の途中の値は oklab() になることがあり、parseColor が扱えないため false として待つ。
  const matches = async () => {
    try {
      return sameColor(await css(target, prop), want)
    } catch {
      return false
    }
  }
  await expect.poll(matches, { message: `${prop} = ${name}` }).toBe(true)
}

// メニューを開き、検索欄にフォーカスが移るのを待つ。移る前に入力した文字は検索欄に入らない。
// 欄の右端（開閉のアイコンの位置）を押す。Multi Select の中央には解除ボタンがある場合がある。
async function openMenu(page: Page, trigger: Locator) {
  const b = (await trigger.boundingBox())!
  await trigger.click({ position: { x: b.width - 16, y: Math.min(24, b.height / 2) } })
  await expect(page.locator("[data-slot=combobox-input]")).toBeFocused()
}

// Command のショートカットの判定と同じ方法で、macOS かどうかを調べる。
const isMac = (page: Page) =>
  page.evaluate(() =>
    /mac|iphone|ipad/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform)
  )
// useIsMobile（registry/hooks/use-mobile.ts）と同じ判定
const narrow = (page: Page) => page.evaluate(() => window.matchMedia("not all and (min-width: 48rem)").matches)

// ---------------------------------------------------------------- 共通

test.describe("all advanced pages", { tag: "@webkit" }, () => {
  for (const id of pages) {
    test(`${id}: no horizontal scroll, buttons and form controls are named`, async ({ page }) => {
      await open(page, id)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const named = page.locator("main").locator("button, [role=combobox], input:not([type=hidden]):not([aria-hidden=true])")
      for (let i = 0; i < (await named.count()); i++) {
        const el = named.nth(i)
        if (!(await el.isVisible())) continue
        await expect(el).toHaveAccessibleName(/\S/)
      }
      // button の中に button を入れない
      expect(await page.locator("main button button").count()).toBe(0)
    })
  }
})

// ---------------------------------------------------------------- Combobox

const listbox = (page: Page) => page.getByRole("listbox")
const optionTexts = (page: Page) => listbox(page).getByRole("option").allTextContents()

test.describe("Combobox", { tag: "@webkit" }, () => {
  test("tokens: same closed look as Select, menu, items", async ({ page }) => {
    await open(page, "combobox")
    const t = page.getByTestId("combobox-basic")
    expect((await box(t)).height).toBe(48)
    expect(await css(t, "border-top-left-radius")).toBe("12px")
    expect(await css(t, "font-size")).toBe("16px")
    expect(await css(t, "padding-left")).toBe("16px")
    expect(await css(t, "border-top-width")).toBe("1px")
    expect(sameColor(await css(t, "border-top-color"), await token(page, "--input"))).toBe(true)
    // プレースホルダーの文字は muted-foreground
    expect(sameColor(await css(t, "color"), await token(page, "--muted-foreground"))).toBe(true)
    await t.click()
    const content = page.getByTestId("combobox-basic-content")
    await expect(content).toBeVisible()
    expect(await css(content, "border-top-left-radius")).toBe("20px")
    expect(await css(content, "box-shadow")).toContain("rgba(0, 0, 0, 0.06)")
    expect(parseFloat(await css(content, "max-height"))).toBeLessThanOrEqual(384)
    const opt = listbox(page).getByRole("option").first()
    expect((await box(opt)).height).toBeGreaterThanOrEqual(40)
    const search = page.getByRole("combobox", { name: "取引先を検索" })
    expect(await css(search, "font-size")).toBe("16px")
  })

  test("search in the menu; query and value are separate; Escape discards the query", async ({ page }) => {
    await open(page, "combobox")
    const t = page.getByTestId("combobox-keep")
    const state = page.getByTestId("combobox-keep-state")
    await expect(t).toHaveText(/北星物流株式会社/)
    await openMenu(page, t)
    const search = page.getByRole("combobox", { name: "取引先を検索" })
    await expect(search).toBeFocused()
    await page.keyboard.type("みなと")
    await expect(state).toHaveText("確定済みの値：北星物流株式会社 ／ 検索文字列：みなと")
    await expect(listbox(page).getByRole("option")).toHaveText(["株式会社みなと製作所"])
    // 文字を入力しただけでは値は変わらない
    await expect(t).toHaveText(/北星物流株式会社/)
    await page.keyboard.press("Escape")
    await expect(listbox(page)).toHaveCount(0)
    await expect(t).toBeFocused()
    await expect(t).toHaveText(/北星物流株式会社/)
    await expect(state).toHaveText(/検索文字列：なし/)
    // 開き直すと検索欄は空
    await openMenu(page, t)
    await expect(search).toHaveValue("")
    // 外側のクリックでも検索文字列を破棄する
    await page.keyboard.type("つばめ")
    await page.mouse.click(5, 5)
    await expect(listbox(page)).toHaveCount(0)
    await expect(state).toHaveText("確定済みの値：北星物流株式会社 ／ 検索文字列：なし")
    // 選ぶと閉じて、確定済みの値を表示する
    await openMenu(page, t)
    await page.keyboard.type("つばめ")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(listbox(page)).toHaveCount(0)
    await expect(t).toHaveText(/有限会社つばめ商店/)
    await expect(t).toBeFocused()
  })

  test("partial match: case, full width, kana, romaji, aliases", async ({ page }) => {
    await open(page, "combobox")
    await openMenu(page, page.getByTestId("combobox-pref"))
    const search = page.getByRole("combobox", { name: "都道府県を検索" })
    for (const q of ["TOKYO", "ｔｏｋｙｏ", "とうきょう", "トウキョウ", "東京"]) {
      await search.fill(q)
      await expect(listbox(page).getByRole("option"), q).toHaveText(["東京都"])
    }
    await search.fill("がわ")
    await expect(listbox(page).getByRole("option")).toHaveText(["神奈川県", "香川県"])
    await search.fill("存在しない県")
    await expect(page.getByTestId("combobox-pref-content")).toContainText("一致する都道府県がありません")
  })

  test("keyboard and ARIA", async ({ page }) => {
    await open(page, "combobox")
    const t = page.getByTestId("combobox-basic")
    await expect(t).toHaveAttribute("role", "combobox")
    await expect(t).toHaveAccessibleName("取引先")
    await expect(t).toHaveAttribute("aria-expanded", "false")
    await t.focus()
    await expectFocusRing(page, t)
    await page.keyboard.press("ArrowDown")
    await expect(t).toHaveAttribute("aria-expanded", "true")
    const search = page.getByRole("combobox", { name: "取引先を検索" })
    await expect(search).toBeFocused()
    await expect(search).toHaveAttribute("aria-controls", (await listbox(page).getAttribute("id"))!)
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    const active = await search.getAttribute("aria-activedescendant")
    expect(active).toBeTruthy()
    await page.keyboard.press("Enter")
    await expect(t).toHaveText(/北星物流株式会社/)
    await expect(listbox(page)).toHaveCount(0)
    await expect(t).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(search).toBeFocused()
    await expect(listbox(page).getByRole("option", { name: "北星物流株式会社" })).toHaveAttribute("aria-selected", "true")
  })

  test("key highlight: ring on keyboard, none while the pointer moves", async ({ page, isMobile }) => {
    test.skip(isMobile, "ポインターの移動はデスクトップで確認する")
    await open(page, "combobox")
    await openMenu(page, page.getByTestId("combobox-pref"))
    await page.keyboard.press("ArrowDown")
    const item = listbox(page).locator("[data-highlighted]")
    await expect(item).toHaveCount(1)
    expect(await css(item, "outline-style")).toBe("solid")
    expect(await css(item, "outline-width")).toBe("2px")
    expect(await css(item, "outline-offset")).toBe("-2px")
    expect(sameColor(await css(item, "outline-color"), await token(page, "--ring"))).toBe(true)
    // 枠は accent の面に対して 3:1 以上
    expect(await colorContrast(page, await css(item, "outline-color"), await token(page, "--accent"))).toBeGreaterThanOrEqual(3)
    const b = (await listbox(page).getByRole("option").nth(3).boundingBox())!
    await page.mouse.move(b.x + 20, b.y + b.height / 2)
    await page.mouse.move(b.x + 24, b.y + b.height / 2)
    await expect(listbox(page).getByRole("option").nth(3)).toHaveAttribute("data-highlighted", "")
    expect(await css(listbox(page).locator("[data-highlighted]"), "outline-style")).toBe("none")
    await page.keyboard.press("ArrowDown")
    expect(await css(listbox(page).locator("[data-highlighted]"), "outline-style")).toBe("solid")
  })

  test("IME composition does not filter until committed", async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== "chromium", "CDP（Chromium のみ）で IME を再現するため")
    // Base UI は Android では変換中も絞り込む（Android の IME は入力中の文字をすべて変換中として扱うため）。
    // mobile（Pixel 7）の project は Android の User-Agent なので対象外にする。
    test.skip(isMobile, "Android の User-Agent では Base UI が変換中も絞り込む")
    await open(page, "combobox")
    await openMenu(page, page.getByTestId("combobox-pref"))
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Input.imeSetComposition", { text: "とうきょう", selectionStart: 5, selectionEnd: 5 })
    await expect(page.getByRole("combobox", { name: "都道府県を検索" })).toHaveValue("とうきょう")
    expect((await optionTexts(page)).length).toBe(47)
    await cdp.send("Input.insertText", { text: "東京" })
    await expect.poll(() => optionTexts(page)).toEqual(["東京都"])
  })

  test("server search: debounce, loading, stale results, empty, error", async ({ page }) => {
    await open(page, "combobox", { clock: false })
    const t = page.getByTestId("combobox-async")
    const status = page.getByTestId("combobox-async-status")
    await openMenu(page, t)
    const content = page.getByTestId("combobox-async-content")
    await expect(content).toContainText("名前を入力すると候補を表示します")
    // 「田」の検索（1.2 秒）を始めた後に「田中」（0.4 秒）を検索する。後から返る「田」の結果で上書きしない。
    await page.keyboard.type("田")
    await expect(status).toContainText("読み込み中")
    await expect(content.locator("[data-slot=combobox-status]")).toContainText("検索しています")
    await page.waitForTimeout(450)
    await page.keyboard.type("中")
    await expect(status).toContainText("8 件", { timeout: 3000 })
    await page.waitForTimeout(1200)
    const names = await listbox(page).getByRole("option").allTextContents()
    expect(names.length).toBe(8)
    expect(names.every((n) => n.startsWith("田中"))).toBe(true)
    // 結果なし
    await page.keyboard.press("Backspace")
    await page.keyboard.press("Backspace")
    await page.keyboard.type("該当なし")
    await expect(content).toContainText("「該当なし」に一致する担当者がいません", { timeout: 3000 })
    // 取得失敗は、結果なしと区別して示す
    await page.getByRole("combobox", { name: "担当者を検索" }).fill("エラー")
    await expect(content).toContainText("検索結果を取得できませんでした。", { timeout: 3000 })
    await expect(content).not.toContainText("一致する担当者がいません")
    await expect(content.getByRole("button", { name: "再試行" })).toBeVisible()
    // 選んだ担当者は、検索結果が変わっても値として残る
    await page.getByRole("combobox", { name: "担当者を検索" }).fill("田中")
    await listbox(page).getByRole("option").first().click({ timeout: 3000 })
    await expect(t).toHaveText(/田中 健太/)
  })

  test("Enter selects nothing without a highlight, and nothing during IME composition", async ({ page, browserName }) => {
    await open(page, "combobox")
    const t = page.getByTestId("combobox-keep")
    await openMenu(page, t)
    // 文字を入力しただけでは、どの選択肢もハイライトされない。Enter では何も選ばずに閉じ、値は変わらない
    await page.keyboard.type("株式会社")
    await expect(listbox(page).locator("[data-highlighted]")).toHaveCount(0)
    await page.keyboard.press("Enter")
    await expect(listbox(page)).toHaveCount(0)
    await expect(t).toBeFocused()
    await expect(t).toHaveText(/北星物流株式会社/)
    await expect(page.getByTestId("combobox-keep-state")).toHaveText("確定済みの値：北星物流株式会社 ／ 検索文字列：なし")
    // ↓ でハイライトしてから IME で入力を続け、変換の確定の Enter（isComposing）を押しても、選ばない
    await openMenu(page, t)
    await page.keyboard.type("株式会社")
    await page.keyboard.press("ArrowDown")
    await expect(listbox(page).locator("[data-highlighted]")).toHaveCount(1)
    if (browserName === "chromium") {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send("Input.imeSetComposition", { text: "みな", selectionStart: 2, selectionEnd: 2 })
    }
    await page
      .getByRole("combobox", { name: "取引先を検索" })
      .evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true })))
    await expect(listbox(page)).toBeVisible()
    await expect(page.getByTestId("combobox-keep-state")).toContainText("確定済みの値：北星物流株式会社")
  })

  test("server search: debounce merges keystrokes; late responses after close or unmount are ignored", async ({ page }) => {
    await open(page, "combobox", { clock: false })
    const errors: string[] = []
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    const t = page.getByTestId("combobox-async")
    await openMenu(page, t)
    await page.evaluate(() => (window.__searchCalls = []))
    // 300ms 以内の入力はまとめて 1 回だけ検索する
    await page.keyboard.type("田")
    await page.waitForTimeout(100)
    await page.keyboard.type("中")
    await expect(page.getByTestId("combobox-async-status")).toContainText("8 件", { timeout: 3000 })
    expect(await page.evaluate(() => window.__searchCalls)).toEqual(["田中"])
    // 検索中にメニューを閉じる。遅れて返った結果は表示しない（検索文字列は破棄される）
    await page.getByRole("combobox", { name: "担当者を検索" }).fill("佐")
    await page.waitForTimeout(450) // 1.2 秒かかる検索が始まる
    await page.keyboard.press("Escape")
    await page.waitForTimeout(1200)
    await expect(page.getByTestId("combobox-async-status")).toContainText("未検索")
    await openMenu(page, t)
    await expect(page.getByTestId("combobox-async-content")).toContainText("名前を入力すると候補を表示します")
    await expect(listbox(page).getByRole("option")).toHaveCount(0)
    // 検索中に画面を離れる（アンマウント）。遅れて返った結果で、例外やエラーを出さない
    await page.getByRole("combobox", { name: "担当者を検索" }).fill("佐")
    await page.waitForTimeout(450)
    await page.goto("/#/button")
    await page.getByRole("heading", { level: 1 }).waitFor()
    await page.waitForTimeout(1200)
    expect(errors).toEqual([])
  })

  test("server search: retry after a failure succeeds; the selected value survives new results", async ({ page }) => {
    await open(page, "combobox", { clock: false })
    const t = page.getByTestId("combobox-async")
    await openMenu(page, t)
    const content = page.getByTestId("combobox-async-content")
    await page.keyboard.type("一時エラー田中")
    await expect(content).toContainText("検索結果を取得できませんでした。", { timeout: 3000 })
    await content.getByRole("button", { name: "再試行" }).click()
    await expect(content.locator("[data-slot=combobox-status]")).toContainText("検索しています")
    await expect(listbox(page).getByRole("option").first()).toContainText("田中", { timeout: 3000 })
    await listbox(page).getByRole("option", { name: /田中 美咲/ }).click()
    await expect(t).toHaveText(/田中 美咲/)
    // 別の検索結果に選んだ担当者が含まれなくても、値は残り、選択肢にも表示される
    await openMenu(page, t)
    await page.keyboard.type("佐藤")
    await expect(listbox(page).getByRole("option", { name: /佐藤 健太/ })).toBeVisible({ timeout: 3000 })
    await expect(listbox(page).getByRole("option", { name: /田中 美咲/ })).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Escape")
    await expect(t).toHaveText(/田中 美咲/)
  })

  test("loading state is announced as status", async ({ page }) => {
    await open(page, "combobox", { clock: false })
    await openMenu(page, page.getByTestId("combobox-loading"))
    await page.keyboard.type("a")
    const s = page.locator("[data-slot=combobox-status]")
    await expect(s).toContainText("検索しています")
    await expect(s).toHaveAttribute("role", "status")
  })

  test("explicit create only when nothing matches", async ({ page }) => {
    await open(page, "combobox")
    const t = page.getByTestId("combobox-creatable")
    await openMenu(page, t)
    await page.keyboard.type("新規")
    await expect(listbox(page).getByRole("option")).toHaveText(["新規"])
    await page.getByRole("combobox", { name: "分類を検索" }).fill("要フォロー")
    await expect(listbox(page).getByRole("option")).toHaveText(["「要フォロー」を新しい分類として追加"])
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(t).toHaveText(/要フォロー/)
    await t.click()
    await expect(listbox(page).getByRole("option", { name: "要フォロー" })).toHaveAttribute("aria-selected", "true")
  })

  test("required, error, form value, disabled, read-only", async ({ page }) => {
    await open(page, "combobox")
    const form = page.getByTestId("combobox-form")
    const t = page.getByTestId("combobox-required")
    await form.getByRole("button", { name: "送信" }).click()
    await expect(form).toContainText("都道府県を選んでください")
    await expect(t).toHaveAttribute("data-invalid", "")
    await expectColor(page, t, "border-top-color", "--destructive")
    await openMenu(page, t)
    await page.keyboard.type("おおさか")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(form).not.toContainText("都道府県を選んでください")
    await form.getByRole("button", { name: "送信" }).click()
    await expect(page.getByTestId("combobox-form-result")).toHaveText("送信される値：osaka")

    const d = page.getByTestId("combobox-disabled")
    await expect(d).toBeDisabled()
    expect(await css(d, "opacity")).toBe("0.5")
    const r = page.getByTestId("combobox-readonly")
    await r.click()
    await expect(listbox(page)).toHaveCount(0)
    await expect(r).toHaveText(/株式会社青葉システム/)
  })

  test("long option text wraps inside the field", async ({ page }) => {
    await open(page, "combobox")
    const field = await box(page.getByTestId("combobox-long-field"))
    const t = await box(page.getByTestId("combobox-long"))
    expect(t.width).toBeLessThanOrEqual(field.width + 0.5)
    expect(t.height).toBeGreaterThan(48)
  })

  test("reduced motion: no scale or rotation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "combobox")
    await page.getByTestId("combobox-basic").click()
    await expect(page.getByTestId("combobox-basic-content")).toBeVisible()
    expect(await css(page.getByTestId("combobox-basic").locator("[data-slot=combobox-icon]"), "transform")).toBe("none")
    expect(await css(page.getByTestId("combobox-basic-content"), "scale")).toBe("none")
  })
})

// ---------------------------------------------------------------- Select（既存の不具合の回帰の検品）

test.describe("Select selected weight (regression)", { tag: "@webkit" }, () => {
  test("only the selected option is weight 500; keyboard highlight does not change the weight", async ({ page }) => {
    await open(page, "select")
    await page.getByTestId("select-plan").click()
    const selected = page.getByRole("option", { selected: true })
    await expect(selected).toHaveCount(1)
    const before = await selected.textContent()
    expect(await css(selected, "font-weight")).toBe("500")
    const others = page.getByRole("option", { selected: false })
    for (const o of await others.all()) expect(await css(o, "font-weight")).toBe("400")
    // キーで別の項目に移っても、太さは選択中の項目だけ（ハイライトは面と枠で示す）。年額プラン（最後）から月額プランへ移る
    // 開いた直後、Base UI は選択中の項目へのフォーカスを次のフレームで移す。移る前（ポップアップの容器か trigger に
    // フォーカスがある間）の ArrowUp は最後の項目（= 選択中の年額プラン）に留まるため、フォーカスが移ってから押す。
    await expect(selected).toBeFocused()
    await page.keyboard.press("ArrowUp")
    const highlighted = page.locator("[data-slot=select-item][data-highlighted]")
    await expect(highlighted).toHaveAttribute("aria-selected", "false")
    expect(await css(highlighted, "font-weight")).toBe("400")
    expect(await css(selected, "font-weight")).toBe("500")
    // 選び直すと、太さも移る
    await page.keyboard.press("Enter")
    await page.getByTestId("select-plan").click()
    const next = page.getByRole("option", { selected: true })
    expect(await css(next, "font-weight")).toBe("500")
    expect(await next.textContent()).not.toBe(before)
    for (const o of await page.getByRole("option", { selected: false }).all()) expect(await css(o, "font-weight")).toBe("400")
  })
})

// ---------------------------------------------------------------- Multi Select

const control = (page: Page, id: string) => page.getByTestId(id).locator("[data-slot=multi-select-control]")
const chips = (page: Page, id: string) => page.getByTestId(id).locator("[data-slot=multi-select-chip]")
const msTrigger = (page: Page, id: string) => page.getByTestId(id).locator("[data-slot=multi-select-trigger]")

test.describe("Multi Select", { tag: "@webkit" }, () => {
  test("tokens", async ({ page }) => {
    await open(page, "multi-select")
    const c = control(page, "multi-0")
    expect((await box(c)).height).toBe(48)
    expect(await css(c, "border-top-left-radius")).toBe("12px")
    expect(await css(c, "border-top-width")).toBe("1px")
    expect(sameColor(await css(c, "border-top-color"), await token(page, "--input"))).toBe(true)
    const chip = chips(page, "multi-3").first()
    expect((await box(chip)).height).toBe(32)
    expect(sameColor(await css(chip, "background-color"), await token(page, "--muted"))).toBe(true)
    expect(await colorContrast(page, await css(chip, "color"), await css(chip, "background-color"))).toBeGreaterThanOrEqual(4.5)
    const more = page.getByTestId("multi-many").locator("[data-slot=multi-select-more]")
    expect(await colorContrast(page, await css(more, "color"), await token(page, "--background"))).toBeGreaterThanOrEqual(4.5)
    await msTrigger(page, "multi-0").click()
    const item = page.locator("[data-slot=multi-select-item]").first()
    expect((await box(item)).height).toBeGreaterThanOrEqual(40)
  })

  test("selected display: individual items plus count", async ({ page }) => {
    await open(page, "multi-select")
    await expect(chips(page, "multi-0")).toHaveCount(0)
    await expect(page.getByTestId("multi-0")).toContainText("選択してください")
    await expect(chips(page, "multi-1")).toHaveText(["北海道"])
    await expect(chips(page, "multi-3")).toHaveText(["東京都", "神奈川県", "千葉県"])
    await expect(page.getByTestId("multi-3").locator("[data-slot=multi-select-more]")).toHaveCount(0)
    await expect(chips(page, "multi-many")).toHaveText(["東京都", "神奈川県", "千葉県"])
    await expect(page.getByTestId("multi-many").locator("[data-slot=multi-select-more]")).toHaveText("他5件")
    await expect(chips(page, "multi-limit1")).toHaveText(["東京都"])
    await expect(page.getByTestId("multi-limit1").locator("[data-slot=multi-select-more]")).toHaveText("他2件")
    // トリガーの名前はラベル、中身は選択中のすべての項目
    const t = msTrigger(page, "multi-many")
    await expect(t).toHaveAccessibleName("配送エリア")
    await expect(t).toContainText("東京都、神奈川県、千葉県、埼玉県、茨城県、栃木県、群馬県、山梨県")
    // 解除ボタンはトリガーの中に入れない
    expect(await t.locator("button").count()).toBe(0)
  })

  test("remove chips with pointer and keyboard; focus moves to the next chip", async ({ page, browserName }) => {
    await open(page, "multi-select")
    const value = page.getByTestId("multi-many-value")
    await page.getByTestId("multi-many").getByRole("button", { name: "東京都を解除" }).click()
    await expect(value).toHaveText(/^7 件：神奈川県、/)
    await expect(page.getByTestId("multi-many").getByRole("button", { name: "神奈川県を解除" })).toBeFocused()
    await expect(page.getByTestId("multi-many").locator("[data-slot=multi-select-more]")).toHaveText("他4件")
    const btn = page.getByTestId("multi-many").getByRole("button", { name: "神奈川県を解除" })
    await expect(btn).toBeFocused()
    // キーボードで移動したときにフォーカスの枠を表示する。
    // WebKit は既定の設定で Tab がボタンに移らないため、枠の確認は Chromium で行う。
    if (browserName === "chromium") {
      await page.keyboard.press("Shift+Tab")
      await page.keyboard.press("Tab")
      await expect(btn).toBeFocused()
      await expectFocusRing(page, btn)
    }
    await page.keyboard.press("Enter")
    await expect(value).toHaveText(/^6 件：千葉県、/)
    // 解除ボタンの押せる範囲は 32 × 32px
    const b = await box(page.getByTestId("multi-many").getByRole("button", { name: "千葉県を解除" }))
    expect(b.width).toBe(32)
    expect(b.height).toBe(32)
  })

  test("menu: search, immediate update, stays open, selected first, Escape keeps values, clear all", async ({ page }) => {
    await open(page, "multi-select")
    const value = page.getByTestId("multi-instant-value")
    await openMenu(page, msTrigger(page, "multi-instant"))
    const search = page.getByRole("combobox", { name: "検索" })
    await expect(search).toBeFocused()
    // 開いたときは、選択済みの項目が先頭
    expect((await optionTexts(page))[0]).toBe("大阪府")
    await expect(page.locator("[data-slot=multi-select-summary]")).toContainText("1件を選択中")
    await page.keyboard.type("ふく")
    await expect(listbox(page).getByRole("option")).toHaveText(["福島県", "福井県", "福岡県"])
    // キーボードで選ぶ
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    // 欄の表示と値がすぐに変わり、メニューと検索文字列は残る
    await expect(value).toHaveText("選択中：大阪府、福島県")
    await expect(chips(page, "multi-instant")).toHaveText(["大阪府", "福島県"])
    await expect(listbox(page)).toBeVisible()
    await expect(search).toHaveValue("ふく")
    await listbox(page).getByRole("option", { name: "福岡県" }).click()
    await expect(value).toHaveText("選択中：大阪府、福島県、福岡県")
    // 選び直すと解除する。同じ項目は重複しない
    await listbox(page).getByRole("option", { name: "福島県" }).click()
    await expect(value).toHaveText("選択中：大阪府、福岡県")
    await listbox(page).getByRole("option", { name: "福島県" }).click()
    await expect(value).toHaveText("選択中：大阪府、福岡県、福島県")
    await page.keyboard.press("Escape")
    await expect(listbox(page)).toHaveCount(0)
    await expect(value).toHaveText("選択中：大阪府、福岡県、福島県")
    await expect(msTrigger(page, "multi-instant")).toBeFocused()
    await openMenu(page, msTrigger(page, "multi-instant"))
    await expect(search).toHaveValue("")
    await page.getByRole("button", { name: "すべて解除" }).click()
    await expect(value).toHaveText("選択中：なし")
  })

  test("every selected item has a name and a way to remove it, including those behind 他N件", async ({ page }) => {
    await open(page, "multi-select")
    const value = page.getByTestId("multi-many-value")
    // 欄に表示していない 5 件も、トリガーの名前の後の内容として読み上げられる
    await expect(msTrigger(page, "multi-many")).toContainText("埼玉県、茨城県、栃木県、群馬県、山梨県")
    // メニューでは、すべての選択済みの項目が先頭に並び、選択中（aria-selected）で、キーボードで解除できる
    await openMenu(page, msTrigger(page, "multi-many"))
    const selected = listbox(page).getByRole("option", { selected: true })
    await expect(selected).toHaveText(["東京都", "神奈川県", "千葉県", "埼玉県", "茨城県", "栃木県", "群馬県", "山梨県"])
    // 開いたときのハイライトの位置はブラウザによって異なるため、群馬県に届くまで ↓ を押す
    const current = () => listbox(page).locator("[data-highlighted]").evaluateAll((els) => els[0]?.textContent ?? "")
    for (let i = 0; i < 60 && (await current()) !== "群馬県"; i++) await page.keyboard.press("ArrowDown")
    await expect(listbox(page).locator("[data-highlighted]")).toHaveText("群馬県")
    await page.keyboard.press("Enter")
    await expect(value).toHaveText("7 件：東京都、神奈川県、千葉県、埼玉県、茨城県、栃木県、山梨県")
  })

  test("touch: remove buttons do not overlap; a tap removes only that item", async ({ page, isMobile }) => {
    await open(page, "multi-select")
    const scope = page.getByTestId("multi-many")
    const buttons = await scope.getByRole("button", { name: /を解除/ }).all()
    const boxes = await Promise.all(buttons.map((b) => box(b)))
    for (const b of boxes) {
      expect(b.width).toBe(32)
      expect(b.height).toBe(32)
    }
    // 隣の解除ボタンとは 8px 以上離れ、重ならない
    for (let i = 1; i < boxes.length; i++) {
      const gap = boxes[i].y === boxes[i - 1].y ? boxes[i].x - (boxes[i - 1].x + boxes[i - 1].width) : Infinity
      expect(gap).toBeGreaterThanOrEqual(8)
    }
    // 開閉のアイコン（右端 48px）の領域とも重ならない
    const c = await box(control(page, "multi-many"))
    for (const b of boxes) expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width - 48)
    // 解除ボタンを押すと、その項目だけを解除し、メニューは開かない
    const target = scope.getByRole("button", { name: "神奈川県を解除" })
    if (isMobile) await target.tap()
    else await target.click()
    await expect(page.getByTestId("multi-many-value")).toHaveText("7 件：東京都、千葉県、埼玉県、茨城県、栃木県、群馬県、山梨県")
    await expect(listbox(page)).toHaveCount(0)
    // 項目の名前の部分を押すと、メニューが開く（解除はしない）
    const chip = scope.locator("[data-slot=multi-select-chip]").first()
    const cb = await box(chip)
    if (isMobile) await page.touchscreen.tap(cb.x + 16, cb.y + cb.height / 2)
    else await page.mouse.click(cb.x + 16, cb.y + cb.height / 2)
    await expect(listbox(page)).toBeVisible()
    await expect(page.getByTestId("multi-many-value")).toHaveText(/^7 件/)
  })

  test("maximum count disables other options and explains why", async ({ page }) => {
    await open(page, "multi-select")
    await openMenu(page, msTrigger(page, "multi-max"))
    await expect(page.locator("[data-slot=multi-select-summary]")).toContainText("2件を選択中（最大3件）")
    await listbox(page).getByRole("option", { name: "京都府" }).click()
    await expect(page.locator("[data-slot=multi-select-max]")).toContainText("最大3件まで選べます")
    await expect(listbox(page).getByRole("option", { name: "北海道" })).toHaveAttribute("aria-disabled", "true")
    await listbox(page).getByRole("option", { name: "北海道" }).click({ force: true })
    await expect(chips(page, "multi-max")).toHaveText(["東京都", "大阪府", "京都府"])
    // 選択中の項目は解除できる
    await listbox(page).getByRole("option", { name: "東京都" }).click()
    await expect(chips(page, "multi-max")).toHaveText(["大阪府", "京都府"])
    await expect(listbox(page).getByRole("option", { name: "北海道" })).not.toHaveAttribute("aria-disabled", "true")
  })

  test("server search keeps selected items that are not in the results", async ({ page }) => {
    await open(page, "multi-select", { clock: false })
    await openMenu(page, msTrigger(page, "multi-server"))
    await page.keyboard.type("田中")
    await listbox(page).getByRole("option", { name: "田中 健太" }).click({ timeout: 3000 })
    await page.getByRole("combobox", { name: "担当者を検索" }).fill("佐藤")
    await expect(listbox(page).getByRole("option", { name: "佐藤 健太" })).toBeVisible({ timeout: 3000 })
    await listbox(page).getByRole("option", { name: "佐藤 美咲" }).click()
    await page.keyboard.press("Escape")
    await expect(chips(page, "multi-server")).toHaveText(["田中 健太", "佐藤 美咲"])
    await expect(page.getByTestId("multi-server-value")).toHaveText("選択中の ID：u-25, u-2")
    // 開き直すと、検索の前でも選択済みの項目を確かめて解除できる
    await openMenu(page, msTrigger(page, "multi-server"))
    await expect(listbox(page).getByRole("option")).toHaveText(["田中 健太", "佐藤 美咲"])
  })

  test("form submission, required, disabled, read-only, long labels", async ({ page }) => {
    await open(page, "multi-select")
    const form = page.getByTestId("multi-form")
    await form.getByRole("button", { name: "送信" }).click()
    await expect(page.getByTestId("multi-form-result")).toHaveText("送信される値：tokyo, kanagawa")
    await form.getByRole("button", { name: "東京都を解除" }).click()
    await form.getByRole("button", { name: "神奈川県を解除" }).click()
    await form.getByRole("button", { name: "送信" }).click()
    await expect(form).toContainText("配送エリアを 1 つ以上選んでください")
    await expectColor(page, control(page, "multi-form"), "border-top-color", "--destructive")

    await expect(msTrigger(page, "multi-disabled")).toBeDisabled()
    await expect(page.getByTestId("multi-disabled").getByRole("button", { name: /を解除/ })).toHaveCount(0)
    await expect(page.getByTestId("multi-readonly").getByRole("button", { name: /を解除/ })).toHaveCount(0)
    await msTrigger(page, "multi-readonly").click({ position: { x: 300, y: 24 } })
    await expect(listbox(page)).toHaveCount(0)

    const field = await box(page.getByTestId("multi-long-field"))
    const c = await box(control(page, "multi-long"))
    expect(c.width).toBeLessThanOrEqual(field.width + 0.5)
    for (const chip of await chips(page, "multi-long").all()) expect((await box(chip)).width).toBeLessThanOrEqual(c.width)
  })
})

// ---------------------------------------------------------------- Command

async function openCommand(page: Page) {
  await page.getByTestId("command-open").click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  // 開く動き（大きさ 95% → 100%）が終わるのを待つ
  await expect(page.locator("[data-slot=command-dialog]")).not.toHaveAttribute("data-starting-style")
  await page.waitForTimeout(300)
  return dialog
}

test.describe("Command", { tag: "@webkit" }, () => {
  test("tokens", async ({ page }) => {
    await open(page, "command")
    const dialog = await openCommand(page)
    const popup = page.locator("[data-slot=command-dialog]")
    expect(await css(popup, "max-width")).toBe("640px")
    expect(await css(popup, "border-top-left-radius")).toBe("20px")
    const input = dialog.getByRole("combobox")
    expect(await css(input, "font-size")).toBe("16px")
    const item = dialog.locator("[data-slot=command-item]").first()
    expect((await box(item)).height).toBeGreaterThanOrEqual(48)
    expect(await css(item, "font-size")).toBe("14px")
    expect((await box(item.locator("svg"))).width).toBe(20)
    expect(await css(dialog.locator("[data-slot=command-group-heading]").first(), "font-size")).toBe("12px")
    // 選んでいる候補の面は accent
    await expect(item).toHaveAttribute("data-highlighted", "")
    expect(sameColor(await css(item, "background-color"), await token(page, "--accent"))).toBe(true)
    expect(await colorContrast(page, await css(item, "color"), await css(item, "background-color"))).toBeGreaterThanOrEqual(4.5)
    // 背景は Dialog と同じ
    expect(await css(page.locator("[data-slot=dialog-overlay]"), "background-color")).toMatch(/^(rgba\(0, 0, 0, 0\.4\)|oklab\(0 0 0 \/ 0\.4\))$/)
  })

  test("button opens; focus goes to search; arrow keys, Enter runs; Escape closes and returns focus", async ({ page }) => {
    await open(page, "command")
    const dialog = await openCommand(page)
    const input = dialog.getByRole("combobox", { name: "ページ、操作、設定、担当者を検索" })
    await expect(input).toBeFocused()
    await expect(dialog.locator("[data-slot=command-group-heading]")).toHaveText(["ページ", "操作", "設定"])
    await page.keyboard.type("せいきゅう")
    await expect(dialog.getByRole("option")).toHaveText(["請求書"])
    await page.keyboard.press("Enter")
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId("command-page")).toHaveText("現在のページ：請求書")
    await expect(page.getByTestId("command-open")).toBeFocused()
    // 矢印キーで移動する
    await openCommand(page)
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("dialog").locator("[data-slot=command-item][data-highlighted]")).toHaveText("請求書")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByTestId("command-open")).toBeFocused()
    await expect(page.getByTestId("command-page")).toHaveText("現在のページ：請求書")
  })

  test("Cmd/Ctrl + K opens and closes; can be turned off; ignores IME and other modifiers", async ({ page }) => {
    await open(page, "command")
    const mod = (await isMac(page)) ? "Meta" : "Control"
    const other = mod === "Meta" ? "Control" : "Meta"
    await expect(page.getByTestId("command-shortcut-label")).toHaveText(mod === "Meta" ? "⌘K" : "Ctrl+K")
    await page.keyboard.press(`${mod}+k`)
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.getByRole("dialog").getByRole("combobox")).toBeFocused()
    await page.keyboard.press(`${mod}+k`)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.keyboard.press(`${other}+k`)
    await page.keyboard.press(`${mod}+Shift+k`)
    await page.keyboard.press(`${mod}+Alt+k`)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    const fire = (init: { isComposing?: boolean; repeat?: boolean }) =>
      page.evaluate(
        ([m, i]) => {
          const e = new KeyboardEvent("keydown", {
            key: "k",
            metaKey: m === "Meta",
            ctrlKey: m === "Control",
            bubbles: true,
            cancelable: true,
            isComposing: i.isComposing,
            repeat: i.repeat,
          })
          ;(document.activeElement ?? document.body).dispatchEvent(e)
        },
        [mod, init] as const
      )
    // IME の変換中、キーの長押しによる繰り返しには反応しない
    await page.getByTestId("command-other-input").focus()
    await fire({ isComposing: true })
    await fire({ repeat: true })
    await expect(page.getByRole("dialog")).toHaveCount(0)
    // ほかの処理がすでに preventDefault したキーには反応しない
    await page.evaluate(() => {
      const w = window as unknown as { __consume: (e: KeyboardEvent) => void }
      w.__consume = (e) => {
        if (e.key === "k") e.preventDefault()
      }
      window.addEventListener("keydown", w.__consume, { capture: true })
    })
    await page.keyboard.press(`${mod}+k`)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.evaluate(() => window.removeEventListener("keydown", (window as unknown as { __consume: EventListener }).__consume, { capture: true }))
    // input の中では反応する。閉じるとフォーカスは input に戻る
    await page.keyboard.press(`${mod}+k`)
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByTestId("command-other-input")).toBeFocused()
    // contenteditable の中では反応しない（リンクの挿入などに使われるため）
    await page.getByTestId("command-editable").focus()
    await page.keyboard.press(`${mod}+k`)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    // 製品がショートカットを解除できる。表示も消える
    await page.getByTestId("command-shortcut-toggle").click()
    await page.keyboard.press(`${mod}+k`)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByTestId("command-shortcut-label")).toHaveCount(0)
  })

  test("shortcut key can be changed; the last registered Command wins; other overlays block it", async ({ page, isMobile }) => {
    test.skip(isMobile, "物理キーボードのショートカットはデスクトップで確認する")
    await open(page, "command")
    const mod = (await isMac(page)) ? "Meta" : "Control"
    // キーを J に変える
    await page.getByTestId("command-key").click()
    await page.getByRole("option", { name: "J" }).click()
    await expect(page.getByTestId("command-shortcut-label")).toHaveText(mod === "Meta" ? "⌘J" : "Ctrl+J")
    await page.keyboard.press(`${mod}+k`)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.keyboard.press(`${mod}+j`)
    await expect(page.getByRole("dialog", { name: "コマンド" })).toBeVisible()
    await page.keyboard.press("Escape")
    // 2 つ目の Command を表示すると、後から登録されたそちらだけが開く
    await page.getByTestId("command-second-toggle").click()
    await page.keyboard.press(`${mod}+j`)
    await expect(page.getByRole("dialog")).toHaveCount(1)
    await expect(page.getByRole("dialog", { name: "ヘルプの検索" })).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByTestId("command-second-toggle").click()
    await page.keyboard.press(`${mod}+j`)
    await expect(page.getByRole("dialog", { name: "コマンド" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    // 別の Dialog が開いている間は開かない
    await page.getByTestId("command-other-dialog-open").click()
    await expect(page.getByTestId("command-other-dialog")).toBeVisible()
    await page.keyboard.press(`${mod}+j`)
    await expect(page.getByRole("dialog")).toHaveCount(1)
    await expect(page.getByRole("dialog", { name: "顧客の詳細" })).toBeVisible()
  })

  test("aliases, empty result, long list scrolls, dialog height stays", async ({ page }) => {
    await open(page, "command")
    const dialog = await openCommand(page)
    const list = dialog.locator("[data-slot=command-list]")
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    const h = (await box(page.locator("[data-slot=command-dialog]"))).height
    await page.keyboard.type("クレジットカード")
    await expect(dialog.getByRole("option")).toHaveText(["支払い方法の設定"])
    expect((await box(page.locator("[data-slot=command-dialog]"))).height).toBe(h)
    await dialog.getByRole("combobox").fill("存在しない機能")
    await expect(dialog.locator("[data-slot=command-empty]")).toHaveText("一致する項目がありません。別の言葉で検索してください。")
  })

  test("dangerous action asks for confirmation instead of running", async ({ page }) => {
    await open(page, "command")
    const dialog = await openCommand(page)
    await page.keyboard.type("削除")
    await expect(dialog.getByRole("option")).toHaveText(["選択中の顧客を削除"])
    await page.keyboard.press("Enter")
    const confirm = page.getByRole("alertdialog")
    await expect(confirm).toBeVisible()
    await expect(page.getByTestId("command-log")).toHaveText("最近の実行：なし")
    await confirm.getByRole("button", { name: "キャンセル" }).click()
    await expect(page.getByTestId("command-log")).toHaveText("最近の実行：なし")
    // 確認を取り消すと、Command を開く前の要素にフォーカスが戻る
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(page.getByTestId("command-open")).toBeFocused()
    // 確認して実行する
    await openCommand(page)
    await page.keyboard.type("削除")
    await page.keyboard.press("Enter")
    await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click()
    await expect(page.getByTestId("command-log")).toHaveText("最近の実行：選択中の顧客を削除")
  })

  test("server results: loading and error", async ({ page }) => {
    await open(page, "command", { clock: false })
    const dialog = await openCommand(page)
    await page.keyboard.type("田中")
    await expect(dialog.locator("[data-slot=combobox-status]")).toContainText("担当者を検索しています")
    await expect(dialog.locator("[data-slot=command-group-heading]", { hasText: "担当者" })).toBeVisible({ timeout: 3000 })
    await dialog.getByRole("combobox").fill("エラー")
    await expect(dialog.locator("[data-slot=combobox-status]")).toContainText("担当者を検索できませんでした。", { timeout: 3000 })
  })
})

// ---------------------------------------------------------------- Calendar

const day = (scope: Locator, iso: string) => scope.locator(`button[data-day="${iso}"]`)

test.describe("Calendar", { tag: "@webkit" }, () => {
  test("tokens", async ({ page }) => {
    await open(page, "calendar")
    const cal = page.getByTestId("calendar-monday")
    const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)
    const d = day(cal, "2026-11-10")
    const b = await box(d)
    expect(b.width).toBe(coarse ? 48 : 40)
    expect(b.height).toBe(coarse ? 48 : 40)
    expect(await css(d, "border-top-left-radius")).toBe("8px")
    expect(await css(d, "font-size")).toBe("14px")
    expect(await css(d, "font-variant-numeric")).toBe("tabular-nums")
    const root = cal.locator("[data-slot=calendar]")
    expect(await css(root, "background-color")).toBe("rgba(0, 0, 0, 0)")
    expect(await css(root, "box-shadow")).toBe("none")
    const caption = cal.locator("select[aria-label='年を選択'] + span")
    expect(await css(caption, "font-size")).toBe("16px")
    expect(await css(caption, "font-weight")).toBe("500")
    expect(await css(cal.locator("th").first(), "font-size")).toBe("12px")
    // 表示月以外の日は控えめな文字。4.5:1 を保つ
    const outside = day(cal, "2026-10-26")
    expect(await colorContrast(page, await css(outside, "color"), await token(page, "--background"))).toBeGreaterThanOrEqual(4.5)
  })

  test("week starts on Monday by default; Sunday when configured", async ({ page }) => {
    await open(page, "calendar")
    await expect(page.getByTestId("calendar-monday").locator("thead th").first()).toHaveText("月")
    await expect(page.getByTestId("calendar-sunday").locator("thead th").first()).toHaveText("日")
    await expect(page.getByTestId("calendar-monday").locator("thead th")).toHaveText(["月", "火", "水", "木", "金", "土", "日"])
  })

  test("today and selected are distinct; today can also be selected", async ({ page }) => {
    await open(page, "calendar")
    const states = page.getByTestId("calendar-states")
    const today = day(states, "2026-11-25")
    await expect(today).toHaveAttribute("data-today", "true")
    // 今日：境界線（3:1 以上）、塗りなし
    await expectColor(page, today, "border-top-color", "--border-strong")
    expect(await colorContrast(page, await css(today, "border-top-color"), await token(page, "--background"))).toBeGreaterThanOrEqual(3)
    expect(await css(today, "background-color")).toMatch(/^(rgba\(0, 0, 0, 0\)|oklab\(0 0 0 \/ 0\))$/)
    await expect(today).toHaveAttribute("aria-label", /今日/)
    // 選択中：primary の塗り
    await day(states, "2026-11-27").click()
    await page.mouse.move(0, 0)
    const sel = day(states, "2026-11-27")
    await expectColor(page, sel, "background-color", "--primary")
    await expect(states.locator('td[data-day="2026-11-27"]')).toHaveAttribute("aria-selected", "true")
    expect(await colorContrast(page, await css(sel, "color"), await css(sel, "background-color"))).toBeGreaterThanOrEqual(4.5)
    // 今日を選んだとき：塗りと内側の線の両方
    const mon = day(page.getByTestId("calendar-monday"), "2026-11-25")
    await expect(mon).toHaveAttribute("data-single", "true")
    expect(sameColor(await css(mon, "background-color"), await token(page, "--primary"))).toBe(true)
    expect(await css(mon, "box-shadow")).toContain("inset")
    await expect(mon).toHaveAttribute("aria-label", /今日.*選択済み/)
  })

  test("unavailable days cannot be selected", async ({ page }) => {
    await open(page, "calendar")
    const states = page.getByTestId("calendar-states")
    for (const iso of ["2026-11-24", "2026-12-15"]) {
      if (iso === "2026-12-15") await states.getByRole("button", { name: "次の月へ" }).click()
      const d = day(states, iso)
      await expect(d).toBeDisabled()
      expect(await css(d, "opacity")).toBe("0.5")
    }
    await expect(page.getByTestId("calendar-states-value")).toHaveText("選択中：なし")
  })

  test("multiple and range selection", async ({ page }) => {
    await open(page, "calendar")
    const m = page.getByTestId("calendar-multiple")
    await expect(m.locator("table").first()).toHaveAttribute("aria-multiselectable", "true")
    await day(m, "2026-11-10").click()
    await expect(page.getByTestId("calendar-multiple-value")).toHaveText("3 日：2026/11/27、2026/11/30、2026/11/10")
    await day(m, "2026-11-27").click()
    await expect(page.getByTestId("calendar-multiple-value")).toHaveText("2 日：2026/11/30、2026/11/10")

    const r = page.getByTestId("calendar-range")
    await expect(page.getByTestId("calendar-range-value")).toHaveText("開始日：2026/11/22 ／ 終了日：2026/11/28")
    // 範囲の内側は muted の帯、開始日と終了日は primary の塗り
    await expectColor(page, r.locator('td[data-day="2026-11-24"]'), "background-color", "--muted")
    await expectColor(page, day(r, "2026-11-22"), "background-color", "--primary")
    await expectColor(page, day(r, "2026-11-28"), "background-color", "--primary")
    await expect(r.locator('td[data-day="2026-11-24"]')).toHaveAttribute("aria-selected", "true")
    await day(r, "2026-11-23").click()
    await expect(page.getByTestId("calendar-range-value")).toHaveText("開始日：2026/11/22 ／ 終了日：2026/11/23")
  })

  test("year and month dropdowns; keyboard navigation; month and year ends; leap years", async ({ page }) => {
    await open(page, "calendar")
    const birth = page.getByTestId("calendar-birth")
    await expect(birth.getByRole("combobox", { name: "年を選択" })).toHaveValue("1990")
    await birth.getByRole("combobox", { name: "年を選択" }).selectOption("1985")
    await birth.getByRole("combobox", { name: "月を選択" }).selectOption("6")
    await expect(birth.locator("table")).toHaveAttribute("aria-label", /1985年7月/)
    await day(birth, "1985-07-31").click()
    await expect(page.getByTestId("calendar-birth-value")).toHaveText("選択中：1985/07/31")
    // 年の範囲の外（未来の年）は選べない
    expect(await birth.getByRole("combobox", { name: "年を選択" }).locator("option").last().textContent()).toBe("2026年")

    const single = page.getByTestId("calendar-single")
    await single.getByRole("combobox", { name: "年を選択" }).selectOption("2028")
    await single.getByRole("combobox", { name: "月を選択" }).selectOption("1")
    await expect(single.locator("button[data-day^='2028-02']:not([data-outside])")).toHaveCount(29)
    await single.getByRole("combobox", { name: "年を選択" }).selectOption("2027")
    await expect(single.locator("button[data-day^='2027-02']:not([data-outside])")).toHaveCount(28)
    // 12 月の次は翌年の 1 月
    await single.getByRole("combobox", { name: "月を選択" }).selectOption("11")
    await single.getByRole("button", { name: "次の月へ" }).click()
    await expect(single.getByRole("combobox", { name: "年を選択" })).toHaveValue("2028")
    await expect(single.getByRole("combobox", { name: "月を選択" })).toHaveValue("0")
    // キーボード：矢印で日、PageDown で月を移動する
    await day(single, "2028-01-30").focus()
    await page.keyboard.press("ArrowRight")
    await expect(day(single, "2028-01-31")).toBeFocused()
    await expectFocusRing(page, day(single, "2028-01-31"))
    await page.keyboard.press("ArrowRight")
    await expect(day(single, "2028-02-01")).toBeFocused()
    await page.keyboard.press("PageDown")
    await expect(day(single, "2028-03-01")).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("calendar-single-value")).toHaveText("選択中：2028/03/01")
  })

  test.describe("time zone", () => {
    test.use({ timezoneId: "America/Los_Angeles" })
    test("today follows the given time zone", async ({ page }) => {
      // 日本時間 11 月 25 日 10 時は、ロサンゼルスでは 11 月 24 日 17 時
      await open(page, "calendar")
      await expect(page.getByTestId("calendar-tokyo-value")).toHaveText("東京の今日：2026/11/25 ／ ブラウザの今日：2026/11/24")
      await expect(day(page.getByTestId("calendar-tokyo"), "2026-11-25")).toHaveAttribute("data-today", "true")
      await expect(day(page.getByTestId("calendar-states"), "2026-11-24")).toHaveAttribute("data-today", "true")
    })
  })
})

// ---------------------------------------------------------------- Date Picker

// Calendar を開く。768px 未満は Drawer、それ以外は Popover。
async function openCalendar(page: Page, scope: Locator, name = "カレンダーから選ぶ") {
  await scope.getByRole("button", { name }).click()
  const overlay = (await narrow(page))
    ? page.locator("[data-slot=date-picker-drawer][data-open]")
    : page.locator("[data-slot=date-picker-content][data-open]")
  await expect(overlay).toBeVisible()
  return overlay
}

test.describe("Date Picker", { tag: "@webkit" }, () => {
  test("tokens", async ({ page }) => {
    await open(page, "date-picker")
    const input = page.getByTestId("date-basic").getByRole("textbox", { name: "契約日" })
    expect((await box(input)).height).toBe(48)
    expect(await css(input, "border-top-left-radius")).toBe("12px")
    expect(await css(input, "font-size")).toBe("16px")
    expect(sameColor(await css(input, "border-top-color"), await token(page, "--input"))).toBe(true)
    await expect(input).toHaveAttribute("placeholder", "YYYY/MM/DD")
    const icon = page.getByTestId("date-basic").getByRole("button", { name: "カレンダーから選ぶ" }).locator("svg")
    expect((await box(icon)).width).toBe(20)
    await expect(icon).toHaveClass(/lucide-calendar-days/)
  })

  test("direct input and calendar stay in sync; draft vs committed", async ({ page }) => {
    await open(page, "date-picker")
    const scope = page.getByTestId("date-basic")
    const input = scope.getByRole("textbox", { name: "契約日" })
    const value = page.getByTestId("date-basic-value")
    await input.fill("2026/12")
    // 入力途中は確定しない
    await expect(value).toHaveText("確定した値：なし")
    await expect(scope.locator("[data-slot=field-error]")).toHaveCount(0)
    await input.fill("２０２６１２０３")
    await input.press("Tab")
    await expect(input).toHaveValue("2026/12/03")
    await expect(value).toHaveText("確定した値：2026-12-03")
    const overlay = await openCalendar(page, scope)
    await expect(overlay.locator('td[data-day="2026-12-03"]')).toHaveAttribute("aria-selected", "true")
    await expect(overlay.locator('button[data-day="2026-12-03"]')).toBeFocused()
    await overlay.locator('button[data-day="2026-12-18"]').click()
    await expect(overlay).toHaveCount(0)
    await expect(input).toHaveValue("2026/12/18")
    await expect(value).toHaveText("確定した値：2026-12-18")
    await expect(scope.getByRole("button", { name: "カレンダーから選ぶ" })).toBeFocused()
    await scope.getByRole("button", { name: "日付を消去" }).click()
    await expect(input).toHaveValue("")
    await expect(value).toHaveText("確定した値：なし")
  })

  test("invalid and nonexistent dates are rejected without conversion", async ({ page }) => {
    await open(page, "date-picker")
    const scope = page.getByTestId("date-invalid")
    const input = scope.getByRole("textbox", { name: "納品日" })
    const error = scope.locator("[data-slot=field-error]")
    for (const [text, message] of [
      ["2026/02/30", "存在しない日付です"],
      ["2026/13/01", "存在しない日付です"],
      ["2026/1", "日付を YYYY/MM/DD の形式で入力してください"],
      ["26/11/25", "日付を YYYY/MM/DD の形式で入力してください"],
    ]) {
      await input.fill(text)
      await input.press("Enter")
      await expect(error, text).toContainText(message)
      await expect(input).toHaveValue(text)
      await expect(input).toHaveAttribute("aria-invalid", "true")
      await expect(page.getByTestId("date-invalid-value")).toHaveText("確定した値：なし")
    }
    await expect(input).toHaveAccessibleDescription(/形式で入力してください/)
    await input.fill("2026/2/3")
    await input.press("Enter")
    await expect(error).toHaveCount(0)
    await expect(input).toHaveValue("2026/02/03")
  })

  test("leap years and allowed ranges", async ({ page }) => {
    await open(page, "date-picker")
    const leap = page.getByTestId("date-leap")
    await expect(leap.getByRole("textbox")).toHaveValue("2028/02/29")
    await leap.getByRole("textbox").fill("2027/02/29")
    await leap.getByRole("textbox").press("Tab")
    await expect(leap.locator("[data-slot=field-error]")).toContainText("存在しない日付です")

    const lim = page.getByTestId("date-range-limit")
    const input = lim.getByRole("textbox", { name: "訪問の希望日" })
    await input.fill("2026/11/24")
    await input.press("Tab")
    await expect(lim.locator("[data-slot=field-error]")).toHaveText(/2026\/11\/25〜2027\/02\/23 の日付を入力してください/)
    await input.fill("2026/11/28")
    await input.press("Tab")
    await expect(lim.locator("[data-slot=field-error]")).toContainText("この日付は選べません")
    await input.fill("2026/11/27")
    await input.press("Tab")
    await expect(lim.locator("[data-slot=field-error]")).toHaveCount(0)
    const overlay = await openCalendar(page, lim)
    await expect(overlay.locator('button[data-day="2026-11-24"]')).toBeDisabled()
    await expect(overlay.locator('button[data-day="2026-11-29"]')).toBeDisabled()
    await expect(overlay.getByRole("button", { name: "前の月へ" })).toHaveAttribute("aria-disabled", "true")
  })

  test("range: start and end separately; end before start is an error and is not swapped", async ({ page }) => {
    await open(page, "date-picker")
    const scope = page.getByTestId("date-period")
    const from = scope.getByRole("textbox", { name: "開始日" })
    const to = scope.getByRole("textbox", { name: "終了日" })
    await from.fill("2026/05/10")
    await from.press("Tab")
    await expect(page.getByTestId("date-period-value")).toHaveText("送信される値：2026-05-10 〜 （なし）")
    await to.fill("2026/05/01")
    await to.press("Tab")
    await expect(scope.locator("[data-slot=range-error]")).toHaveText("終了日は開始日と同じか、それより後の日付にしてください")
    await expect(to).toHaveAttribute("aria-invalid", "true")
    await expect(to).toHaveAccessibleDescription(/終了日は開始日/)
    await expect(from).toHaveValue("2026/05/10")
    await expect(to).toHaveValue("2026/05/01")
    await to.fill("2026/05/31")
    await to.press("Tab")
    await expect(scope.locator("[data-slot=range-error]")).toHaveCount(0)
    // カレンダーで期間を選ぶ。1 回目は開始日、2 回目は終了日
    const overlay = await openCalendar(page, scope, "カレンダーから期間を選ぶ")
    await expect(overlay.locator("table")).toHaveCount((await narrow(page)) ? 1 : 2)
    await overlay.locator('button[data-day="2026-05-12"]').click()
    await expect(overlay).toBeVisible()
    await expect(page.getByTestId("date-period-value")).toHaveText("送信される値：2026-05-12 〜 （なし）")
    await overlay.locator('button[data-day="2026-05-20"]').click()
    await expect(overlay).toHaveCount(0)
    await expect(from).toHaveValue("2026/05/12")
    await expect(to).toHaveValue("2026/05/20")
  })

  // 時計を固定すると、page-errors.ts が WebKit の環境の事象（座標が NaN のイベント）を判定するための時刻
  // （Node.js の時刻とページの時刻）がずれるため、この検品は実際の時刻で行う。固定の日付での計算は date.spec.ts で確かめる。
  test("presets are calculated from today", async ({ page }) => {
    await open(page, "date-picker", { clock: false })
    const today = await page.evaluate(() => {
      const d = new Date()
      return [d.getFullYear(), d.getMonth(), d.getDate()] as const
    })
    const t = new Date(today[0], today[1], today[2])
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const monday = new Date(t)
    monday.setDate(t.getDate() - ((t.getDay() + 6) % 7))
    const minus = (n: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - n)
    const scope = page.getByTestId("date-presets")
    const value = page.getByTestId("date-presets-value")
    for (const [label, from, to] of [
      ["今日", t, t],
      ["今週", monday, t],
      ["今月", new Date(t.getFullYear(), t.getMonth(), 1), t],
      ["先月", new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)],
      ["過去7日間", minus(6), t],
      ["過去30日間", minus(29), t],
      ["今年", new Date(t.getFullYear(), 0, 1), t],
    ] as const) {
      const overlay = await openCalendar(page, scope, "カレンダーから期間を選ぶ")
      await overlay.getByRole("button", { name: label, exact: true }).click()
      await expect(value, label).toHaveText(`送信される値：${iso(from)} 〜 ${iso(to)}`)
      // 閉じる動きが終わってから、次に開く
      await expect(page.locator("[data-slot=date-picker-content], [data-slot=date-picker-drawer]")).toHaveCount(0)
    }
    const overlay = await openCalendar(page, scope, "カレンダーから期間を選ぶ")
    await expect(overlay.getByRole("button", { name: "今年", exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(overlay.getByRole("button", { name: "今月", exact: true })).toHaveAttribute("aria-pressed", "false")
  })

  test("mobile uses a drawer with one month; desktop a popover", async ({ page }) => {
    await open(page, "date-picker")
    const scope = page.getByTestId("date-presets")
    const overlay = await openCalendar(page, scope, "カレンダーから期間を選ぶ")
    if (await narrow(page)) {
      await expect(page.getByRole("dialog", { name: "期間を選択" })).toBeVisible()
      await expect(overlay.locator("table")).toHaveCount(1)
      const b = await box(overlay)
      expect(b.width).toBeLessThanOrEqual(page.viewportSize()!.width)
      await page.keyboard.press("Escape")
      await expect(overlay).toHaveCount(0)
      await expect(scope.getByRole("button", { name: "カレンダーから期間を選ぶ" })).toBeFocused()
    } else {
      await expect(overlay.locator("table")).toHaveCount(2)
      const b = await box(overlay)
      expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    }
  })

  test("form: sends YYYY-MM-DD; invalid input never sends the previous value", async ({ page }) => {
    await open(page, "date-picker")
    const form = page.getByTestId("date-form")
    const result = page.getByTestId("date-form-result")
    const contract = form.getByRole("textbox", { name: "契約日" })
    const hidden = form.locator("input[name=contract_date]")
    const submit = form.getByRole("button", { name: "送信" })
    await submit.click()
    await expect(result).toHaveText("contract_date=2026-04-01, from=2026-04-01, to=2026-04-30")
    // 不正な日付を入力したまま、フォーカスを外さずに Enter で送信する。以前の 2026-04-01 は送信されない
    await contract.fill("2026/02/30")
    await expect(hidden).toHaveValue("")
    // 日付の妥当性は、値を持つ見えない入力欄に設定される（見える入力欄の id を data-for に持つ）
    expect(await hidden.evaluate((el: HTMLInputElement) => el.validity.customError)).toBe(true)
    expect(await hidden.getAttribute("data-for")).toBe(await contract.getAttribute("id"))
    await expect(hidden).toHaveAttribute("aria-hidden", "true")
    await expect(hidden).toHaveAttribute("tabindex", "-1")
    await contract.press("Enter")
    await expect(result).toHaveText("")
    await expect(form.locator("[data-slot=range-error]")).toContainText("契約日：存在しない日付です")
    await expect(form.locator("[data-slot=field-error]")).toHaveCount(0) // この例は FieldError を使わず、概要で示す
    await expect(contract).toHaveAttribute("aria-invalid", "true")
    await expect(contract).toBeFocused()
    // 形式の誤り
    await contract.fill("2026//04/01")
    await contract.press("Enter")
    await expect(form.locator("[data-slot=range-error]")).toContainText("形式で入力してください")
    // 確定の前（フォーカスがある状態）の正しい日付は、そのまま送信される
    await contract.fill("2026/06/02")
    await contract.press("Enter")
    await expect(result).toHaveText("contract_date=2026-06-02, from=2026-04-01, to=2026-04-30")
    await expect(contract).toHaveValue("2026/06/02")
    // ボタンで送信する（フォーカスが外れて確定する）
    await contract.fill("20260603")
    await submit.click()
    await expect(result).toHaveText("contract_date=2026-06-03, from=2026-04-01, to=2026-04-30")
    await expect(contract).toHaveValue("2026/06/03")
    // required：空のままでは送信しない
    await contract.fill("")
    await submit.click()
    await expect(result).toHaveText("")
    await expect(form.locator("[data-slot=range-error]")).toContainText("契約日")
  })

  test("form: range order, one-sided range, external value, reset", async ({ page }) => {
    await open(page, "date-picker")
    const form = page.getByTestId("date-form")
    const result = page.getByTestId("date-form-result")
    const from = form.getByRole("textbox", { name: "開始日" })
    const to = form.getByRole("textbox", { name: "終了日" })
    const submit = form.getByRole("button", { name: "送信" })
    // 終了日が開始日より前：送信しない。入れ替えない
    await to.fill("2026/03/31")
    await submit.click()
    await expect(result).toHaveText("")
    await expect(form.locator("[data-slot=range-error]")).toContainText("終了日：終了日は開始日と同じか、それより後の日付にしてください")
    await expect(from).toHaveValue("2026/04/01")
    await expect(to).toHaveValue("2026/03/31")
    // 片側だけの期間は送信できる
    await to.fill("")
    await submit.click()
    await expect(result).toHaveText("contract_date=2026-04-01, from=2026-04-01, to=")
    // 外から値を変える
    await form.getByTestId("date-form-external").click()
    await expect(form.getByRole("textbox", { name: "契約日" })).toHaveValue("2026/05/15")
    await expect(form.locator("input[name=contract_date]")).toHaveValue("2026-05-15")
    // reset：初期値に戻り、エラーも消える
    await form.getByRole("textbox", { name: "契約日" }).fill("2026/02/30")
    await form.getByRole("textbox", { name: "契約日" }).press("Tab")
    await form.getByRole("button", { name: "初期値に戻す" }).click()
    await expect(form.getByRole("textbox", { name: "契約日" })).toHaveValue("2026/04/01")
    await expect(from).toHaveValue("2026/04/01")
    await expect(to).toHaveValue("2026/04/30")
    await expect(form.getByRole("textbox", { name: "契約日" })).not.toHaveAttribute("aria-invalid", "true")
    await submit.click()
    await expect(result).toHaveText("contract_date=2026-04-01, from=2026-04-01, to=2026-04-30")
  })

  test("constraints: validity, presets that do not fit, disabled and read-only", async ({ page }) => {
    await open(page, "date-picker")
    const lim = page.getByTestId("date-range-limit").getByRole("textbox", { name: "訪問の希望日" })
    const limValue = page.getByTestId("date-range-limit").locator("[data-slot=date-picker-value]")
    for (const [text, valid] of [["2026/11/24", false], ["2026/11/28", false], ["2027/03/01", false], ["2026/11/27", true]] as const) {
      await lim.fill(text)
      await expect.poll(() => limValue.evaluate((el: HTMLInputElement) => el.validity.valid), { message: text }).toBe(valid)
    }
    // min（今月の 1 日）と max（今日）に合わないプリセットは押せない
    const scope = page.getByTestId("date-presets-min")
    const overlay = await openCalendar(page, scope, "カレンダーから期間を選ぶ")
    for (const label of ["先月", "過去30日間", "今年"]) await expect(overlay.getByRole("button", { name: label, exact: true })).toBeDisabled()
    for (const label of ["今日", "今週", "今月", "過去7日間"]) await expect(overlay.getByRole("button", { name: label, exact: true })).toBeEnabled()
    await page.keyboard.press("Escape")
    // 無効：送信しない（隠れた入力欄も無効）。読み取り専用：Calendar のボタンを出さず、値は送信する
    await expect(page.getByTestId("date-disabled").getByRole("textbox")).toBeDisabled()
    await expect(page.getByTestId("date-disabled").locator("[data-slot=date-picker-value]")).toBeDisabled()
    await expect(page.getByTestId("date-disabled").getByRole("button", { name: "カレンダーから選ぶ" })).toBeDisabled()
    await expect(page.getByTestId("date-readonly").getByRole("textbox")).toHaveAttribute("readonly", "")
    await expect(page.getByTestId("date-readonly").locator("[data-slot=date-picker-value]")).toHaveValue("2026-04-01")
    await expect(page.getByTestId("date-readonly").locator("[data-slot=date-picker-value]")).toBeEnabled()
    await expect(page.getByTestId("date-readonly").getByRole("button", { name: "カレンダーから選ぶ" })).toHaveCount(0)
  })

  test("Enter during IME composition does not commit", async ({ page }) => {
    await open(page, "date-picker")
    const scope = page.getByTestId("date-invalid")
    const input = scope.getByRole("textbox", { name: "納品日" })
    await input.fill("2026/02/30")
    // 変換の確定の Enter（isComposing）では確定しない
    await input.evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })))
    await expect(scope.locator("[data-slot=field-error]")).toHaveCount(0)
    await input.press("Enter")
    await expect(scope.locator("[data-slot=field-error]")).toContainText("存在しない日付です")
  })

  test.describe("time zone", () => {
    test.use({ timezoneId: "Pacific/Honolulu" })
    test("dates do not shift in a negative UTC offset", async ({ page }) => {
      await open(page, "date-picker")
      const form = page.getByTestId("date-form")
      await form.getByRole("button", { name: "送信" }).click()
      await expect(page.getByTestId("date-form-result")).toHaveText("contract_date=2026-04-01, from=2026-04-01, to=2026-04-30")
      const scope = page.getByTestId("date-basic")
      await scope.getByRole("textbox").fill("2026/03/01")
      await scope.getByRole("textbox").press("Tab")
      await expect(page.getByTestId("date-basic-value")).toHaveText("確定した値：2026-03-01")
    })
  })
})

// ---------------------------------------------------------------- File Upload

const file = (name: string, size: number, mimeType: string) => ({ name, mimeType, buffer: Buffer.alloc(size) })
const MB = 1024 * 1024

test.describe("File Upload", { tag: "@webkit" }, () => {
  test("dropzone tokens", async ({ page }) => {
    await open(page, "file-upload")
    const z = page.getByTestId("upload-single").locator("[data-slot=file-upload-dropzone]")
    expect(await css(z, "border-top-style")).toBe("dashed")
    expect(await css(z, "border-top-width")).toBe("1px")
    expect(await css(z, "border-top-left-radius")).toBe("12px")
    expect(sameColor(await css(z, "background-color"), await token(page, "--background"))).toBe(true)
    expect(await css(z, "padding-top")).toBe("24px")
    expect(await css(z, "box-shadow")).toBe("none")
    expect((await box(z.locator("svg").first())).width).toBe(32)
    expect(await css(z.locator("p").first(), "font-size")).toBe("16px")
    expect(await css(z.locator("p").nth(1), "font-size")).toBe("14px")
    // 制限は選ぶ前に示す
    await expect(z).toContainText("形式：.csv ／ 1 ファイル 5 MB まで")
    await expect(z.getByRole("button", { name: "ファイルを選択" })).toHaveAccessibleDescription("形式：.csv ／ 1 ファイル 5 MB まで")
  })

  test("click and keyboard open the file chooser", async ({ page }) => {
    await open(page, "file-upload")
    const z = page.getByTestId("upload-single").locator("[data-slot=file-upload-dropzone]")
    let chooser = page.waitForEvent("filechooser")
    await z.click({ position: { x: 20, y: 20 } })
    expect((await chooser).isMultiple()).toBe(false)
    chooser = page.waitForEvent("filechooser")
    const btn = z.getByRole("button", { name: "ファイルを選択" })
    await btn.focus()
    await expectFocusRing(page, btn)
    await page.keyboard.press("Enter")
    const c = await chooser
    await c.setFiles(file("売上.csv", 2000, "text/csv"))
    await expect(page.getByTestId("upload-single").locator("[data-slot=file-upload-item]")).toContainText("売上.csv")
  })

  test("drag and drop", async ({ page }) => {
    await open(page, "file-upload")
    const z = page.getByTestId("upload-multiple").locator("[data-slot=file-upload-dropzone]")
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer()
      d.items.add(new File(["a,b"], "dropped.csv", { type: "text/csv" }))
      return d
    })
    await z.dispatchEvent("dragenter", { dataTransfer: dt })
    await expect(z).toHaveAttribute("data-dragging", "true")
    await z.dispatchEvent("drop", { dataTransfer: dt })
    await expect(z).not.toHaveAttribute("data-dragging", "true")
    await expect(page.getByTestId("upload-multiple-list")).toContainText("dropped.csv")
  })

  test("type, size and count limits", async ({ page }) => {
    await open(page, "file-upload")
    const scope = page.getByTestId("upload-multiple")
    const input = scope.locator("input[type=file]")
    await input.setInputFiles([
      file("a.pdf", 1000, "application/pdf"),
      file("big.png", 11 * MB, "image/png"),
      file("tool.exe", 10, "application/octet-stream"),
    ])
    const rejected = page.getByTestId("upload-multiple-rejected")
    await expect(rejected).toHaveAttribute("role", "alert")
    await expect(rejected).toContainText("2 件のファイルを追加できませんでした")
    await expect(rejected).toContainText("big.png：10 MB 以下のファイルを選んでください（このファイルは 11 MB）")
    await expect(rejected).toContainText("tool.exe：.pdf、.png、.jpg、.jpeg、.csv のファイルを選んでください")
    await input.setInputFiles([1, 2, 3, 4, 5].map((n) => file(`b${n}.pdf`, 10, "application/pdf")))
    await expect(rejected).toContainText("b5.pdf：選べるのは 5 件までです")
    await expect(scope.locator("[data-slot=file-upload-item]")).toHaveCount(5)
    await expect(scope.locator("[data-slot=file-upload-dropzone]")).toHaveAttribute("data-disabled", "true")
    await expect(scope.getByRole("button", { name: "ファイルを選択" })).toBeDisabled()
  })

  test("explicit start; upload, processing and done are distinct; remove before upload", async ({ page }) => {
    await open(page, "file-upload", { clock: false })
    const scope = page.getByTestId("upload-single")
    await scope.locator("input[type=file]").setInputFiles(file("顧客.csv", 120_000, "text/csv"))
    const item = scope.locator("[data-slot=file-upload-item]")
    const status = item.locator("[data-slot=file-upload-status]")
    await expect(status).toHaveText("アップロード前")
    await expect(status).toHaveAttribute("role", "status")
    await expect(item).toContainText("CSV")
    await expect(item).toContainText("117 KB")
    await expect(item.getByRole("progressbar")).toHaveCount(0)
    // 選んだだけでは送信しない
    await page.waitForTimeout(500)
    await expect(status).toHaveText("アップロード前")
    // 送信前の解除
    await item.getByRole("button", { name: "顧客.csvを一覧から外す" }).click()
    await expect(item).toHaveCount(0)
    await scope.locator("input[type=file]").setInputFiles(file("顧客.csv", 120_000, "text/csv"))
    // 状態の文と進捗バーの名前と値の移り変わりを、ページの中で記録する
    await page.evaluate(() => {
      const w = window as unknown as { __log: string[] }
      w.__log = []
      const root = document.querySelector("[data-testid=upload-single]")!
      const record = () => {
        const s = root.querySelector("[data-slot=file-upload-status]")?.textContent ?? ""
        const bar = root.querySelector("[role=progressbar]")
        const entry = `${s}|${bar ? `${bar.getAttribute("aria-label")}:${bar.getAttribute("aria-valuenow") ?? "不明"}` : "なし"}`
        if (w.__log[w.__log.length - 1] !== entry) w.__log.push(entry)
      }
      new MutationObserver(record).observe(root, { subtree: true, childList: true, characterData: true, attributes: true })
    })
    await scope.getByRole("button", { name: "アップロード" }).click()
    await expect(status).toHaveText("完了", { timeout: 4000 })
    const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log)
    const statuses = log.map((l) => l.split("|")[0]).filter((v, i, a) => a.indexOf(v) === i)
    expect(statuses).toEqual(["アップロードしています", "アップロード完了。処理を待っています", "データを処理しています", "完了"])
    // 送信中は進捗率、送信の完了の直後は進捗バーなし、処理中は処理の進捗
    expect(log.some((l) => /^アップロードしています\|顧客\.csvのアップロードの進捗:(20|40|60|80)$/.test(l))).toBe(true)
    expect(log).toContain("アップロード完了。処理を待っています|なし")
    expect(log.some((l) => l.startsWith("データを処理しています|顧客.csvの処理の進捗:"))).toBe(true)
    await expect(item.getByRole("button")).toHaveCount(0)
  })

  test("selection: duplicates, remove and reselect, repeated drops, count limit", async ({ page }) => {
    await open(page, "file-upload", { clock: false })
    const scope = page.getByTestId("upload-multiple")
    const items = scope.locator("[data-slot=file-upload-item]")
    const rejected = page.getByTestId("upload-multiple-rejected")
    const z = scope.locator("[data-slot=file-upload-dropzone]")
    // OS で同じファイルを選び直したときと同じく、名前、大きさ、更新日時が同じファイルを作ってドロップする
    const drop = async (names: string[]) => {
      const dt = await page.evaluateHandle((ns) => {
        const d = new DataTransfer()
        for (const n of ns) d.items.add(new File(["x"], n, { type: "application/pdf", lastModified: 1_700_000_000_000 }))
        return d
      }, names)
      await z.dispatchEvent("drop", { dataTransfer: dt })
    }
    await drop(["a.pdf"])
    await expect(items).toHaveCount(1)
    // 同じファイルを重ねて選ぶと、重複として選べない。同じ選択の中の重複も選べない
    await drop(["a.pdf", "b.pdf", "b.pdf"])
    await expect(rejected).toContainText("a.pdf：同じファイルがすでに選ばれています")
    await expect(rejected).toContainText("2 件のファイルを追加できませんでした")
    await expect(items).toHaveCount(2)
    // 外した後は、同じファイルを選び直せる
    await scope.getByRole("button", { name: "a.pdfを一覧から外す" }).click()
    await expect(items).toHaveCount(1)
    await drop(["a.pdf"])
    await expect(items).toHaveCount(2)
    // input からも、同じ名前のファイルを続けて選べる（input の値を毎回空にしている）
    await scope.locator("input[type=file]").setInputFiles([file("c.pdf", 10, "application/pdf")])
    await scope.locator("input[type=file]").setInputFiles([file("d.pdf", 10, "application/pdf")])
    await expect(items).toHaveCount(4)
    // 複数回のドロップ。件数の上限（5 件）は、すでに選んだ件数を含めて数える
    await drop(["e.pdf", "f.pdf"])
    await expect(items).toHaveCount(5)
    await expect(rejected).toContainText("f.pdf：選べるのは 5 件までです")
  })

  test("start once on repeated clicks; a late completion after cancel is ignored", async ({ page }) => {
    await open(page, "file-upload", { clock: false })
    const scope = page.getByTestId("upload-multiple")
    await scope.locator("input[type=file]").setInputFiles([file("一.pdf", 10, "application/pdf"), file("遅延.pdf", 10, "application/pdf")])
    // 連続して押しても、送信は 1 回だけ始まる
    await scope.getByRole("button", { name: "2 件をアップロード" }).dblclick()
    await expect(scope.getByRole("button", { name: "アップロード", exact: true })).toBeDisabled()
    expect(await page.evaluate(() => window.__uploadStarts)).toEqual({ "一.pdf": 1, "遅延.pdf": 1 })
    // 中止の後に、サーバーの完了の通知が遅れて届いても、完了にしない
    const late = scope.locator("[data-slot=file-upload-item]", { hasText: "遅延.pdf" })
    await late.getByRole("button", { name: "遅延.pdfの中止" }).click()
    await expect(late.locator("[data-slot=file-upload-status]")).toHaveText("中止しました")
    await page.waitForTimeout(900)
    await expect(late.locator("[data-slot=file-upload-status]")).toHaveText("中止しました")
    // 中止の後は再試行できる。もう一度始める
    await late.getByRole("button", { name: "遅延.pdfを再試行" }).click()
    await expect(late.locator("[data-slot=file-upload-status]")).toHaveText("アップロードしています")
    await expect(scope.locator("[data-slot=file-upload-item]", { hasText: "一.pdf" }).locator("[data-slot=file-upload-status]")).toHaveText("完了", { timeout: 4000 })
  })

  test("failure, retry and cancel", async ({ page }) => {
    await open(page, "file-upload", { clock: false })
    const scope = page.getByTestId("upload-multiple")
    await scope.locator("input[type=file]").setInputFiles([file("失敗する.csv", 10, "text/csv"), file("中止する.pdf", 10, "application/pdf")])
    await scope.getByRole("button", { name: "2 件をアップロード" }).click()
    const failed = scope.locator("[data-slot=file-upload-item]", { hasText: "失敗する.csv" })
    const canceled = scope.locator("[data-slot=file-upload-item]", { hasText: "中止する.pdf" })
    await canceled.getByRole("button", { name: "中止する.pdfの中止" }).click()
    await expect(canceled.locator("[data-slot=file-upload-status]")).toHaveText("中止しました")
    await expect(failed.locator("[data-slot=file-upload-status]")).toHaveText("失敗しました")
    await expect(failed.locator("[data-slot=file-upload-error]")).toHaveText(/通信が切断されました/)
    await expectColor(page, failed.locator("[data-slot=file-upload-status]"), "color", "--destructive")
    await failed.getByRole("button", { name: "失敗する.csvを再試行" }).click()
    await expect(failed.locator("[data-slot=file-upload-status]")).toHaveText("アップロードしています")
  })

  test("states list: unknown progress has no number; cancel only where possible; long names wrap", async ({ page }) => {
    await open(page, "file-upload")
    const list = page.getByTestId("upload-states")
    const processing = list.locator('[data-status="processing"]')
    const bar = processing.getByRole("progressbar")
    await expect(bar).not.toHaveAttribute("aria-valuenow")
    await expect(processing).not.toContainText("%")
    await expect(list.locator('[data-status="uploading"]')).toContainText("45%")
    await expect(list.locator('[data-status="uploading"]').getByRole("button", { name: /の中止/ })).toHaveCount(1)
    await expect(processing.getByRole("button", { name: /の中止/ })).toHaveCount(0)
    await expect(list.locator('[data-status="uploaded"]').getByRole("button")).toHaveCount(0)
    await expect(list.locator('[data-status="done"]')).toContainText("1,248 行を取り込みました")
    const long = page.getByTestId("upload-long")
    const c = await box(long)
    for (const name of await long.locator("[data-slot=file-upload-name]").all()) {
      const b = await box(name)
      expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 0.5)
      expect(b.height).toBeGreaterThan(24)
    }
    await expect(long).toContainText("2026年度_上期_全国営業所別_売上実績と前年同期比較_最終確定版_経営会議提出用_v12.csv")
  })
})

// ---------------------------------------------------------------- Empty

test.describe("Empty", { tag: "@webkit" }, () => {
  test("tokens", async ({ page }) => {
    await open(page, "empty")
    const e = page.getByTestId("empty-none")
    expect(await css(e, "border-top-width")).toBe("0px")
    expect(await css(e, "box-shadow")).toBe("none")
    expect(await css(e, "text-align")).toBe("center")
    const media = e.locator("[data-slot=empty-icon]")
    const mb = await box(media)
    expect([mb.width, mb.height]).toEqual([64, 64])
    expect(await css(media, "border-top-left-radius")).toBe("20px")
    expect(sameColor(await css(media, "background-color"), await token(page, "--muted"))).toBe(true)
    await expect(media).toHaveAttribute("aria-hidden", "true")
    expect((await box(media.locator("svg"))).width).toBe(32)
    const title = e.locator("[data-slot=empty-title]")
    expect(await css(title, "font-size")).toBe("20px")
    expect(await css(title, "font-weight")).toBe("600")
    const desc = e.locator("[data-slot=empty-description]")
    expect(await css(desc, "font-size")).toBe("14px")
    expect(await colorContrast(page, await css(desc, "color"), await token(page, "--background"))).toBeGreaterThanOrEqual(4.5)
    // 中央にそろえる
    const eb = await box(e)
    const tb = await box(title)
    expect(Math.abs(tb.x + tb.width / 2 - (eb.x + eb.width / 2))).toBeLessThanOrEqual(1)
  })

  test("states and next actions", async ({ page }) => {
    await open(page, "empty")
    await expect(page.getByTestId("empty-none").getByRole("button")).toHaveText(["顧客を登録", "CSV から取り込む"])
    await expect(page.getByTestId("empty-no-results").getByRole("button")).toHaveText(["条件をリセット"])
    await expect(page.getByTestId("empty-complete").getByRole("button")).toHaveCount(0)
    const err = page.getByTestId("empty-error")
    await expect(err).toHaveAttribute("data-status", "error")
    // 最初から表示されている空の状態には role="alert" を付けない
    await expect(err).not.toHaveAttribute("role", "alert")
    expect(sameColor(await css(err.locator("[data-slot=empty-icon]"), "color"), await token(page, "--destructive"))).toBe(true)
    await err.getByRole("button", { name: "再試行" }).click()
    await expect(err).toContainText("再試行 1 回目")
    // 0 件とは別の表現
    await expect(page.getByTestId("empty-none")).toHaveAttribute("data-status", "empty")
  })

  test("title only, narrow area, long text", async ({ page }) => {
    await open(page, "empty")
    await expect(page.getByTestId("empty-title-only").locator("[data-slot=empty-icon], [data-slot=empty-description]")).toHaveCount(0)
    const narrowBox = await box(page.getByTestId("empty-narrow"))
    expect(narrowBox.width).toBe(240)
    await expect(page.getByTestId("empty-narrow").locator("[data-slot=empty-icon]")).toHaveCount(0)
    const header = await box(page.getByTestId("empty-long").locator("[data-slot=empty-header]"))
    expect(header.width).toBeLessThanOrEqual(480)
  })
})

// ---------------------------------------------------------------- 組み合わせの例

test.describe("combined screens", { tag: "@webkit" }, () => {
  test("report filter: presets, conditions, empty result and reset", async ({ page }) => {
    await open(page, "report-filter")
    const result = page.getByTestId("report-result")
    await expect(result).toContainText("2026/11/01 〜 2026/11/25")
    await expect(page.getByTestId("report-total")).toBeVisible()
    await openMenu(page, page.locator("[data-slot=multi-select-trigger]"))
    await page.keyboard.type("おきなわ")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "この条件で集計" }).click()
    await expect(page.getByTestId("report-empty")).toContainText("条件に一致する売上がありません")
    await page.getByTestId("report-empty").getByRole("button", { name: "条件をリセット" }).click()
    await expect(page.getByTestId("report-total")).toBeVisible()
    // 期間の誤りがあると集計できない
    await page.getByRole("textbox", { name: "終了日" }).fill("2026/10/01")
    await page.getByRole("textbox", { name: "終了日" }).press("Tab")
    await expect(page.getByRole("button", { name: "この条件で集計" })).toBeDisabled()
    await expect(page.locator("[data-slot=range-error]")).toContainText("終了日は開始日")
  })

  test("CSV import: select, confirm, upload, processing, result", async ({ page }) => {
    await open(page, "csv-import", { clock: false })
    await expect(page.getByTestId("import-history-empty")).toContainText("取り込みの履歴はまだありません")
    await page.locator("input[type=file]").setInputFiles(file("顧客一覧.csv", 50_000, "text/csv"))
    await expect(page.getByRole("button", { name: "取り込みを開始" })).toBeVisible()
    await page.getByRole("button", { name: "取り込みを開始" }).click()
    await expect(page.locator("[data-slot=file-upload-status]")).toContainText("データを取り込んでいます", { timeout: 3000 })
    await expect(page.getByTestId("import-done")).toContainText("2,380 件の顧客を取り込みました", { timeout: 4000 })
    await expect(page.getByTestId("import-history-list")).toContainText("顧客一覧.csv")
  })
})

// ---------------------------------------------------------------- ブランドの変更

test.describe("brand", () => {
  test("selected states follow --primary and keep contrast", async ({ page }) => {
    await open(page, "calendar")
    await page.getByRole("radio", { name: "紫" }).check()
    const d = day(page.getByTestId("calendar-monday"), "2026-11-25")
    await expect.poll(() => css(d, "background-color")).toBe("rgb(109, 40, 217)")
    expect(await colorContrast(page, await css(d, "color"), await css(d, "background-color"))).toBeGreaterThanOrEqual(4.5)
    await page.goto("/#/multi-select")
    await page.getByRole("radio", { name: "青" }).check()
    await msTrigger(page, "multi-1").click()
    const box_ = page.locator("[data-slot=multi-select-item][aria-selected=true] > span").first()
    await expect.poll(() => css(box_, "background-color")).toBe("rgb(30, 64, 175)")
  })
})

// ---------------------------------------------------------------- スクリーンショット

test.describe("screenshots", () => {
  test("pages and open states", async ({ page }, info) => {
    test.setTimeout(120_000)
    const dir = join(info.project.testDir, "..", "screenshots", info.project.name)
    for (const id of pages) {
      await open(page, id)
      await page.screenshot({ path: `${dir}/${id}.png`, fullPage: true })
    }
    await open(page, "combobox")
    await openMenu(page, page.getByTestId("combobox-pref"))
    await page.keyboard.type("か")
    await page.waitForTimeout(400) // 開く動きが終わるのを待つ
    await page.screenshot({ path: `${dir}/combobox-open.png` })
    await open(page, "multi-select")
    await openMenu(page, msTrigger(page, "multi-many"))
    await page.waitForTimeout(400) // 開く動きが終わるのを待つ
    await page.screenshot({ path: `${dir}/multi-select-open.png` })
    await open(page, "command")
    await openCommand(page)
    await page.waitForTimeout(400) // 開く動きが終わるのを待つ
    await page.screenshot({ path: `${dir}/command-open.png` })
    await open(page, "date-picker")
    await openCalendar(page, page.getByTestId("date-presets"), "カレンダーから期間を選ぶ")
    await page.waitForTimeout(400) // 開く動きが終わるのを待つ
    await page.screenshot({ path: `${dir}/date-picker-range-open.png` })
    await page.keyboard.press("Escape")
    await openCalendar(page, page.getByTestId("date-basic"))
    await page.waitForTimeout(400) // 開く動きが終わるのを待つ
    await page.screenshot({ path: `${dir}/date-picker-open.png` })
  })
})
