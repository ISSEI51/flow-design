import { expect, test, type Locator, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

// 部品の組み合わせの検品（Components v0.1 の全体統合検品）。部品ごとの検品で確かめていない組み合わせだけを扱う。
// 対象の一覧と結果は docs/web/components/integration-review.md を参照。

async function open(page: Page, id: string) {
  await page.goto(`/#/${id}`)
  await page.getByRole("heading", { level: 1 }).waitFor()
}

const narrow = (page: Page) => page.evaluate(() => window.matchMedia("not all and (min-width: 48rem)").matches)

// 要素の中央の点で、最前面にある要素がその要素（またはその子孫）であることを確かめる。重なりの順序の確認に使う。
// 開く動き（位置と拡大）の途中では判定しないよう、満たされるまで待つ。
async function expectFrontmost(l: Locator) {
  await expect
    .poll(() =>
      l.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return hit !== null && el.contains(hit)
      })
    )
    .toBe(true)
}

// フォーカスが <body> に落ちず、支援技術から隠れた要素にもないことを確かめる。
// フォーカスの復帰は次のフレームで行われることがあるため、満たされるまで待つ。
async function expectFocusNotLost(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = document.activeElement
        return a !== null && a !== document.body && !a.closest("[aria-hidden=true], [inert]")
      })
    )
    .toBe(true)
}

test.describe("integration: Data Table, Checkbox and the no-results state", { tag: "@webkit" }, () => {
  test("selected rows stay selected while a search shows no results, and come back when the conditions are cleared", async ({ page }) => {
    await open(page, "data-table")
    const client = page.getByTestId("client")
    const rows = client.locator("[data-slot=data-table] > tbody > tr[data-row-id]")
    await rows.nth(0).getByRole("checkbox").click()
    await rows.nth(1).getByRole("checkbox").click()
    const ids = [await rows.nth(0).getAttribute("data-row-id"), await rows.nth(1).getAttribute("data-row-id")]
    const bar = client.locator("[data-slot=data-table-selection-bar]")
    await expect(bar).toContainText("2件を選択中")
    // 一致しない検索語で 0 件にする。「データ未登録」ではなく「条件に一致しない」状態を示す
    await client.getByRole("searchbox", { name: "会社名で検索" }).fill("該当する会社のない検索語")
    await expect(client.getByText("条件に一致する顧客はいません")).toBeVisible()
    await expect(client.getByText("顧客はまだ登録されていません")).toHaveCount(0)
    // 選択は残り、表示していない件数として示す。一括操作は選択中の行に対して行える
    await expect(bar).toContainText("2件を選択中")
    await expect(bar).toContainText("表示していない 2件を含む")
    await expect(bar.getByRole("button", { name: "削除" })).toBeEnabled()
    // 表示中の行がないため、ページ内の全選択は押せない
    await expect(client.getByRole("checkbox", { name: "このページの行をすべて選択" })).toBeDisabled()
    // 条件を解除すると、同じ行が選ばれたまま表示される
    await client.getByRole("button", { name: "条件をすべて解除" }).click()
    await expect(client.locator("tr[data-state=selected]")).toHaveCount(2)
    for (const id of ids) await expect(client.locator(`tr[data-row-id="${id}"]`)).toHaveAttribute("data-state", "selected")
    await expect(bar).not.toContainText("表示していない")
    // 押したボタンは 0 件の表示とともに消える。フォーカスは <body> に落ちず、検索欄へ移る
    const search = client.getByRole("searchbox", { name: "会社名で検索" })
    await expect(search).toBeFocused()
    await expectFocusNotLost(page)
    // 適用中の条件の「すべて解除」も、押すと条件の一覧ごと消える。フォーカスは検索欄へ移る
    await search.fill("株式会社")
    const applied = client.locator("[data-slot=data-table-applied-filters]")
    await applied.getByRole("button", { name: "すべて解除" }).click()
    await expect(applied).toHaveCount(0)
    await expect(search).toHaveValue("")
    await expect(search).toBeFocused()
  })
})

test.describe("integration: Date Picker inside a form", { tag: "@webkit" }, () => {
  test("a date picked in the calendar is sent; Enter in the calendar picks the date and does not submit the form", async ({ page }) => {
    await open(page, "date-picker")
    const form = page.getByTestId("date-form")
    const result = page.getByTestId("date-form-result")
    const contract = form.getByRole("textbox", { name: "契約日" })
    const calendarButton = form.getByRole("button", { name: "カレンダーから選ぶ" }).first()
    await calendarButton.click()
    const overlay = (await narrow(page))
      ? page.locator("[data-slot=date-picker-drawer][data-open]")
      : page.locator("[data-slot=date-picker-content][data-open]")
    await expect(overlay).toBeVisible()
    // 選択済みの日にフォーカスがあり、→ で翌日へ移り、Enter で選ぶ
    await expect(overlay.locator('button[data-day="2026-04-01"]')).toBeFocused()
    await page.keyboard.press("ArrowRight")
    await expect(overlay.locator('button[data-day="2026-04-02"]')).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(overlay).toHaveCount(0)
    await expect(contract).toHaveValue("2026/04/02")
    // Enter はフォームを送信しない。フォーカスは開いたボタンへ戻る
    await expect(result).toHaveText("")
    await expect(calendarButton).toBeFocused()
    await form.getByRole("button", { name: "送信" }).click()
    await expect(result).toHaveText("contract_date=2026-04-02, from=2026-04-01, to=2026-04-30")
  })
})

test.describe("integration: Combobox and Multi Select inside a Dialog", { tag: "@webkit" }, () => {
  test("menus are in front of the dialog, Escape closes only the frontmost layer, values are saved", async ({ page }) => {
    await open(page, "combobox")
    const trigger = page.getByTestId("combobox-dialog-trigger")
    await trigger.click()
    const dialog = page.getByRole("dialog", { name: "配送の条件を編集" })
    await expect(dialog).toBeVisible()

    // Combobox：開くと検索欄にフォーカスが移り、メニューは Dialog より前面にある
    const account = page.getByTestId("combobox-dialog-account")
    await account.click()
    const input = page.locator("[data-slot=combobox-input]")
    await expect(input).toBeFocused()
    await input.fill("ほくせい")
    const option = page.getByRole("option", { name: "北星物流株式会社" })
    await expect(option).toBeVisible()
    await expectFrontmost(option)
    await expectFrontmost(page.locator("[data-slot=combobox-content][data-open]"))
    // Esc は前面のメニューだけを閉じる。Dialog は開いたまま、フォーカスはトリガーへ戻る
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await expect(account).toBeFocused()
    // 選ぶ
    await account.click()
    await input.fill("ほくせい")
    await page.getByRole("option", { name: "北星物流株式会社" }).click()
    await expect(account).toHaveText(/北星物流株式会社/)
    await expect(dialog).toBeVisible()

    // Multi Select：2 件を選び、Esc でメニューだけを閉じる
    const regions = page.getByTestId("combobox-dialog-regions")
    await regions.locator("[data-slot=multi-select-trigger]").click()
    const tokyo = page.getByRole("option", { name: "東京都" })
    await expect(tokyo).toBeVisible()
    // 選択肢は一覧の中でスクロールの範囲の外にあることがあるため、メニュー（Popup）の中央の点で確かめる
    await expectFrontmost(page.locator("[data-slot=combobox-content][data-open]"))
    await tokyo.click()
    await page.getByRole("option", { name: "神奈川県" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await expect(regions.locator("[data-slot=multi-select-chip]")).toHaveCount(2)

    // もう一度の Esc は Dialog を閉じる（保存しない）。フォーカスは Dialog を開いたボタンへ戻る
    await expectFocusNotLost(page)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId("combobox-dialog-state")).toHaveText("保存した条件：なし")

    // 開き直すと、選んだ値は残っている（この例は値を Dialog の外で持つ）。保存すると反映する
    await trigger.click()
    await expect(page.getByTestId("combobox-dialog-account")).toHaveText(/北星物流株式会社/)
    await page.getByTestId("combobox-dialog-save").click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId("combobox-dialog-state")).toHaveText("保存した条件：北星物流株式会社 ／ 2件")
  })
})
