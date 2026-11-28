import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { customers, queryCustomers, type CustomerQuery } from "../src/data/data-display/customers"
import { colorContrast, css, sameColor, settledBox, token } from "./helpers"
import { collectPageErrors } from "./page-errors"

// ページで捕捉されなかった例外とコンソールのエラーがあれば、テストを失敗にする（page-errors.ts）。
collectPageErrors(test)

const pages = ["table", "data-table", "pagination", "chart", "dashboard"]

async function open(page: Page, id: string) {
  await page.goto(`/#/${id}`)
  await page.getByRole("heading", { level: 1 }).waitFor()
}

const box = async (l: Locator) => (await l.boundingBox())!

// Pagination の狭い並べ方（番号の代わりに「3 / 29」）になるべきかを、置かれた領域の幅と、番号の並びに必要な幅
// （ボタンの数 × 48px + 間 4px）から求め、実際の表示が一致することを確かめてから返す。
// ボタンの数：広い画面で最初・最後を含む並びは 11、狭い画面（640px 未満）の並びは 7。
async function expectPaginationMode(scope: Locator, isMobile: boolean) {
  const buttons = isMobile ? 7 : 11
  const width = (await box(scope.locator("[data-slot=pagination-controls]").first())).width
  const compact = width < buttons * 52 - 4
  const position = scope.locator("[data-slot=pagination-compact-position]").first()
  if (compact) await expect(position).toBeVisible()
  else await expect(position).toBeHidden()
  return compact
}

const baseQuery: CustomerQuery = { search: "", status: null, owner: null, regions: [], sort: null, pageIndex: 0, pageSize: 50 }
const total = (q: Partial<CustomerQuery>) => queryCustomers({ ...baseQuery, ...q }).total
const fmt = (n: number) => n.toLocaleString("ja-JP")

// ブランドカラーは App の要素に設定されるため、main から計算後の値を読む。
const tokenIn = (page: Page, name: string) =>
  page.locator("main").evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name)

// CSS の色（oklab()、color-mix() の結果を含む）を、canvas で塗って 0〜255 の RGB にする。
const rgbOf = (page: Page, color: string) =>
  page.evaluate((c) => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, 1, 1)
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
  }, color)
// 2 つの色が、各チャンネル 1 以内で一致する
async function sameRgb(page: Page, a: string, b: string) {
  const [x, y] = [await rgbOf(page, a), await rgbOf(page, b)]
  return x.every((v, i) => Math.abs(v - y[i]) <= 1)
}

// 文字色と、行（セル）の面の色のコントラスト比
async function textContrast(page: Page, text: Locator, surface: Locator) {
  return colorContrast(page, await css(text, "color"), await css(surface, "background-color"))
}

// ---------------------------------------------------------------- 共通
test.describe("all data display pages", { tag: "@webkit" }, () => {
  for (const id of pages) {
    test(`${id}: names, no horizontal page scroll`, async ({ page }) => {
      await open(page, id)
      const main = page.locator("main")
      // 模擬のサーバーから受け取る表（data-table の「server」）は、読み込みが終わってから確かめる。読み込みの後に行と操作が増えるため、
      // 固定の待機の後に数えると、実行の速さによって数える途中で操作の数が変わる。状態の見本（読み込み中・再取得中）の表は、常に aria-busy のまま。
      for (const t of await main.getByTestId("server").locator("table").all()) await expect(t).not.toHaveAttribute("aria-busy", "true")
      await page.waitForTimeout(300)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const roles = ["button", "checkbox", "combobox", "searchbox", "link", "separator", "radio"] as const
      const byRoles = (name?: RegExp) => roles.map((r) => main.getByRole(r, name ? { name } : {})).reduce((a, b) => a.or(b))
      // 表示していない操作（狭い画面で隠した列など）は除く。表示している操作の数と、そのうち名前（空白以外の文字）がある操作の数が
      // 一致することを確かめる（名前の判定は toHaveAccessibleName と同じ、Playwright の accessible name の計算）。
      // 操作を 1 つずつ確かめると、操作の数（data-table では 370 を超える）だけページ全体を探し直し、実行の速さによって制限時間を超える。
      const controls = byRoles().filter({ visible: true })
      const named = byRoles(/\S/).filter({ visible: true })
      const n = await controls.count()
      expect(n).toBeGreaterThan(0)
      if ((await named.count()) !== n) {
        // 名前のない操作を特定して、失敗の理由に示す
        for (let i = 0; i < n; i++) await expect(controls.nth(i)).toHaveAccessibleName(/\S/)
      }
      expect(await named.count()).toBe(n)
      // 表は横にスクロールしても、ページ全体は横にスクロールしない
      for (const t of await main.locator("[data-slot=table-container]").all()) {
        expect(await t.evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth + 1)).toBe(true)
      }
    })
  }
})

// ---------------------------------------------------------------- Table
test.describe("Table", { tag: "@webkit" }, () => {
  test("tokens: header, body, borders, background", async ({ page }) => {
    await open(page, "table")
    const t = page.getByTestId("table-lines")
    const th = t.locator("th").first()
    expect((await box(th)).height).toBe(40)
    expect(await css(th, "font-size")).toBe("12px")
    expect(await css(th, "font-weight")).toBe("500")
    expect(await css(th, "padding-left")).toBe("16px")
    expect(await css(th, "border-bottom-width")).toBe("1px")
    expect(sameColor(await css(th, "border-bottom-color"), await token(page, "--border"))).toBe(true)
    const td = t.locator("tbody td").first()
    expect(await css(td, "font-size")).toBe("14px")
    expect(await css(td, "padding-left")).toBe("16px")
    expect(await css(td, "padding-right")).toBe("16px")
    expect(sameColor(await css(td, "background-color"), await token(page, "--background"))).toBe(true)
    // 横線だけ：本文の下に 1px、縦の線はない
    expect(await css(td, "border-bottom-width")).toBe("1px")
    expect(sameColor(await css(td, "border-bottom-color"), await token(page, "--border"))).toBe(true)
    expect(await css(td, "border-left-width")).toBe("0px")
    expect(await css(td, "border-right-width")).toBe("0px")
    // 影なし、外枠なし
    const container = t.locator("xpath=..")
    expect(await css(container, "box-shadow")).toBe("none")
    expect(await css(container, "border-top-width")).toBe("0px")
  })

  test("striped: even rows muted, no body lines, header line kept", async ({ page }) => {
    await open(page, "table")
    const t = page.getByTestId("table-striped")
    const rows = t.locator("tbody tr")
    const odd = rows.nth(0).locator("td").first()
    const even = rows.nth(1).locator("td").first()
    expect(sameColor(await css(odd, "background-color"), await token(page, "--background"))).toBe(true)
    expect(sameColor(await css(even, "background-color"), await token(page, "--muted"))).toBe(true)
    expect(await css(odd, "border-bottom-width")).toBe("0px")
    expect(await css(t.locator("th").first(), "border-bottom-width")).toBe("1px")
    // 文字のコントラストは交互の背景色でも 4.5:1 以上
    expect(await textContrast(page, even, even)).toBeGreaterThanOrEqual(4.5)
    const id = rows.nth(1).locator("td").first()
    expect(await textContrast(page, id, id)).toBeGreaterThanOrEqual(4.5)
  })

  test("density: 36 / 48 / 64px minimum row heights", async ({ page }) => {
    await open(page, "table")
    for (const [d, h] of [
      ["compact", 36],
      ["default", 48],
      ["comfortable", 64],
    ] as const) {
      const row = page.getByTestId(`table-density-${d}`).locator("tbody tr").first()
      expect(Math.round((await box(row)).height)).toBe(h)
      // 文字の大きさは変えない
      expect(await css(row.locator("td").first(), "font-size")).toBe("14px")
    }
  })

  test("multi-line text grows the row, long text does not overflow", async ({ page }) => {
    await open(page, "table")
    const t = page.getByTestId("table-long")
    const row = t.locator("tbody tr").first()
    expect((await box(row)).height).toBeGreaterThan(48)
    for (const cell of await t.locator("td").all()) {
      expect(await cell.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    }
    // 省略した文字は title で完全な内容を示す
    const trunc = page.getByTestId("table-truncate").locator("[data-slot=table-truncate]").first()
    expect(await trunc.getAttribute("title")).toBe("医療法人社団 こもれび会 地域連携在宅医療推進センター")
    expect(await trunc.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  })

  test("bordered: 12px radius and 1px border", async ({ page }) => {
    await open(page, "table")
    const container = page.getByTestId("table-bordered").locator("xpath=..")
    expect(await css(container, "border-top-left-radius")).toBe("12px")
    expect(await css(container, "border-top-width")).toBe("1px")
    expect(sameColor(await css(container, "border-top-color"), await token(page, "--border"))).toBe(true)
    // 最後の行の線は外枠と重ねない
    const last = page.getByTestId("table-bordered").locator("tbody tr").last().locator("td").first()
    expect(await css(last, "border-bottom-width")).toBe("0px")
  })

  test("values: right aligned tabular numbers, missing differs from zero", async ({ page }) => {
    await open(page, "table")
    const amounts = page.getByTestId("table-amount")
    expect(await css(amounts.first(), "text-align")).toBe("right")
    expect(await css(amounts.first(), "font-variant-numeric")).toBe("tabular-nums")
    await expect(amounts.nth(2)).toHaveText("0円")
    await expect(amounts.nth(3)).toHaveText("−15,000円")
    // 欠損：画面は「—」、支援技術には「未定」
    await expect(amounts.nth(4).locator("[aria-hidden=true]")).toHaveText("—")
    await expect(amounts.nth(4).locator(".sr-only")).toHaveText("未定")
    // 右端がそろう
    const rights = await Promise.all((await amounts.all()).map(async (a) => Math.round((await box(a)).x + (await box(a)).width)))
    expect(new Set(rights).size).toBe(1)
  })

  test("row states: neutral ladder, selected over striped, active line, contrast", async ({ page, isMobile, browserName }) => {
    await open(page, "table")
    // 2 番目のセル（状態の名前）の面で比べる。1 番目は Checkbox のセル
    const cellOf = (r: Locator) => r.locator("td").nth(1)
    const bg = (r: Locator) => css(cellOf(r), "background-color")
    const settle = async () => {
      await page.mouse.move(0, 0)
      await page.waitForTimeout(250) // 背景色のトランジション（120ms）が終わるまで待つ
    }
    // 押せない行はホバーで変わらない
    const plain = page.getByTestId("table-lines").locator("tbody tr").first()
    const before = await css(plain.locator("td").first(), "background-color")
    if (!isMobile) {
      await plain.hover()
      expect(await css(plain.locator("td").first(), "background-color")).toBe(before)
    }
    const [normal, even, selected, active, selectedEven, selectedActive] = [0, 1, 2, 3, 4, 5].map((i) => page.getByTestId(`table-state-${i}`))
    await page.getByTestId("table-states").scrollIntoViewIfNeeded()
    await settle()
    const mix = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, var(--background))`
    const resolve = (value: string) =>
      page.evaluate((v) => {
        const el = document.createElement("div")
        el.style.background = v
        document.body.append(el)
        const c = getComputedStyle(el).backgroundColor
        el.remove()
        return c
      }, value)
    // 通常 < 交互の背景色 < ホバー < 選択中 < 選択中のホバー（すべてニュートラル）
    expect(await sameRgb(page, await bg(normal), await token(page, "--background"))).toBe(true)
    expect(await sameRgb(page, await bg(even), await token(page, "--muted"))).toBe(true)
    expect(await sameRgb(page, await bg(selected), await resolve(mix(12)))).toBe(true)
    // 選択中は交互の背景色より優先する。選択中と詳細を表示中を混同しない
    expect(await sameRgb(page, await bg(selectedEven), await bg(selected))).toBe(true)
    expect(await sameRgb(page, await bg(selectedActive), await bg(selected))).toBe(true)
    expect(await sameRgb(page, await bg(active), await bg(selected))).toBe(false)
    expect(await sameRgb(page, await bg(active), await resolve(mix(6)))).toBe(true)
    expect(await css(active.locator("td").first(), "box-shadow")).toContain("inset")
    expect(await css(selectedActive.locator("td").first(), "box-shadow")).toContain("inset")
    expect(await css(selected.locator("td").first(), "box-shadow")).toBe("none")
    if (!isMobile) {
      const hovered = async (row: Locator, pct: number) => {
        await row.hover()
        await expect.poll(async () => sameRgb(page, await bg(row), await resolve(mix(pct)))).toBe(true)
      }
      await hovered(normal, 6)
      await hovered(even, 6)
      await hovered(selected, 16)
      await settle()
    }
    // 文字と補足の文字は 4.5:1 以上（ホバー中も）
    const rows = [normal, even, selected, active, selectedEven, selectedActive]
    const checkText = async () => {
      for (const row of rows) for (const cell of (await row.locator("td").all()).slice(1)) expect(await textContrast(page, cell, cell)).toBeGreaterThanOrEqual(4.5)
    }
    await checkText()
    if (!isMobile) {
      for (const row of rows) {
        await row.hover()
        await page.waitForTimeout(200)
        for (const cell of (await row.locator("td").all()).slice(1)) expect(await textContrast(page, cell, cell)).toBeGreaterThanOrEqual(4.5)
        // 未選択の Checkbox の枠は、ホバー中の面でも 3:1 以上
        const box_ = row.getByRole("checkbox")
        if ((await box_.getAttribute("aria-checked")) === "false") {
          expect(await colorContrast(page, await css(box_, "border-top-color"), await css(row.locator("td").first(), "background-color"))).toBeGreaterThanOrEqual(3)
        }
      }
      await settle()
    }
    // 選択中の Checkbox の面は primary。キーボードのフォーカスは focus-ring で、選択中の面でも 3:1 以上
    expect(await sameRgb(page, await css(selected.getByRole("checkbox"), "background-color"), await token(page, "--primary"))).toBe(true)
    const link = selectedActive.getByRole("link")
    // WebKit は既定で Tab でリンクに移らないため、Option + Tab を使う
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab"
    await selectedActive.getByRole("checkbox").focus()
    await page.keyboard.press(tab)
    await expect(link).toBeFocused()
    expect(await css(link, "outline-style")).toBe("solid")
    expect(await css(link, "outline-width")).toBe("2px")
    expect(await colorContrast(page, await css(link, "outline-color"), await bg(selectedActive))).toBeGreaterThanOrEqual(3)
    // Checkbox で選択を切り替えると、面が変わる
    await normal.getByRole("checkbox").click()
    await settle()
    await expect(normal).toHaveAttribute("data-state", "selected")
    expect(await sameRgb(page, await bg(normal), await bg(selected))).toBe(true)
  })

  test("brand color: selected rows stay neutral; checkbox and active line follow --primary", async ({ page }) => {
    await open(page, "table")
    const row = page.getByTestId("table-state-5")
    const cell = row.locator("td").nth(1)
    const neutral = await css(cell, "background-color")
    for (const brand of ["青", "紫"]) {
      await page.getByRole("radio", { name: brand }).check()
      await page.waitForTimeout(200)
      expect(await sameRgb(page, await css(cell, "background-color"), neutral)).toBe(true)
      const primary = await tokenIn(page, "--primary")
      expect(await sameRgb(page, await css(row.getByRole("checkbox"), "background-color"), primary)).toBe(true)
      expect(await css(row.locator("td").first(), "box-shadow")).toContain("inset")
      for (const c of (await row.locator("td").all()).slice(1)) expect(await textContrast(page, c, c)).toBeGreaterThanOrEqual(4.5)
      // 選択中の Checkbox（primary の面）は、行の面に対して 3:1 以上
      expect(await colorContrast(page, primary, neutral)).toBeGreaterThanOrEqual(3)
    }
  })

  test("truncated text: only truncated cells get a toggle; full text by keyboard and touch", async ({ page, isMobile }) => {
    await open(page, "table")
    const t = page.getByTestId("table-truncate")
    const toggles = t.locator("[data-slot=table-truncate-toggle]")
    // 省略されたセルにだけボタンを置く（すべてのセルをフォーカスできるようにはしない）
    const truncated = await t.locator("[data-slot=table-truncate]").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)
    expect(truncated).toBeGreaterThan(0)
    await expect(toggles).toHaveCount(truncated)
    const first = toggles.first()
    await expect(first).toHaveAttribute("aria-expanded", "false")
    await expect(first).toHaveAccessibleName("全文を表示")
    if (isMobile) await first.tap()
    else {
      await first.focus()
      await page.keyboard.press("Enter")
    }
    await expect(first).toHaveAttribute("aria-expanded", "true")
    const text = t.locator("[data-slot=table-truncate]").first()
    await expect(text).toHaveAttribute("data-expanded", "true")
    expect(await text.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
    await expect(text).toHaveText("医療法人社団 こもれび会 地域連携在宅医療推進センター")
    await first.click()
    await expect(first).toHaveAttribute("aria-expanded", "false")
  })
})

// ---------------------------------------------------------------- Data Table
const client = (page: Page) => page.getByTestId("client")
const bodyRows = (scope: Locator) => scope.locator("[data-slot=data-table] > tbody > tr[data-row-id]")
const count = (scope: Locator, id: string) => scope.getByTestId(`${id}-count`)

async function chooseFilter(page: Page, scope: Locator, testId: string, option: string) {
  await scope.getByTestId(testId).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

test.describe("Data Table: client", { tag: "@webkit" }, () => {
  test("search and filters combine", async ({ page }) => {
    await open(page, "data-table")
    const c = client(page)
    await expect(count(c, "client")).toHaveText(`${fmt(customers.length)}件`)
    await c.getByRole("searchbox", { name: "会社名で検索" }).fill("青葉")
    await expect(count(c, "client")).toHaveText(`${fmt(total({ search: "青葉" }))}件`)
    for (const row of (await bodyRows(c).all()).slice(0, 10)) await expect(row.locator("td").nth(1)).toContainText("青葉")
    await chooseFilter(page, c, "client-status", "契約中")
    await chooseFilter(page, c, "client-owner", "佐藤 美咲")
    await expect(count(c, "client")).toHaveText(`${fmt(total({ search: "青葉", status: "active", owner: "佐藤 美咲" }))}件`)
    // 個別に表示している Select の値は、適用中の条件として重複して並べない
    await expect(c.getByRole("group", { name: "適用中の条件" }).getByRole("button", { name: /契約状況/ })).toHaveCount(0)
    // その他の条件（地域）は解除できる形で示す
    // その他の条件は Popover の中に置く
    await c.getByRole("button", { name: /その他の条件/ }).click()
    const popover = page.locator("[data-slot=popover-content]")
    await expect(popover.getByRole("heading", { name: "その他の条件" })).toBeVisible()
    await popover.getByRole("checkbox", { name: "関東" }).click()
    await page.keyboard.press("Escape")
    await expect(popover).toHaveCount(0)
    await expect(c.getByRole("button", { name: /その他の条件/ })).toBeFocused()
    await expect(c.getByRole("button", { name: /その他の条件/ })).toContainText("（1）")
    const chip = c.getByRole("button", { name: "地域：関東の条件を解除" })
    await expect(chip).toBeVisible()
    await expect(count(c, "client")).toHaveText(`${fmt(total({ search: "青葉", status: "active", owner: "佐藤 美咲", regions: ["関東"] }))}件`)
    await chip.click()
    await expect(chip).toHaveCount(0)
    // 解除したボタンが消えた後、フォーカスは「すべて解除」に移る
    await expect(c.getByRole("button", { name: "すべて解除" })).toBeFocused()
    await c.getByRole("button", { name: "すべて解除" }).click()
    await expect(count(c, "client")).toHaveText(`${fmt(customers.length)}件`)
    await expect(c.getByRole("searchbox", { name: "会社名で検索" })).toHaveValue("")
    await expect(c.getByTestId("client-status")).toContainText("契約状況：すべて")
  })

  test("no results is distinct from empty data", async ({ page }) => {
    await open(page, "data-table")
    const c = client(page)
    await c.getByRole("searchbox", { name: "会社名で検索" }).fill("該当しない会社名")
    await expect(c.locator("[data-slot=data-table-message][data-kind=no-results]")).toContainText("条件に一致する顧客はいません")
    await expect(count(c, "client")).toHaveText("0件")
    await c.getByRole("button", { name: "条件をすべて解除" }).click()
    await expect(count(c, "client")).toHaveText(`${fmt(customers.length)}件`)
  })

  test("IME composition does not search until committed", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP（Chromium のみ）で IME を再現するため")
    await open(page, "data-table")
    const c = client(page)
    const search = c.getByRole("searchbox", { name: "会社名で検索" })
    await search.focus()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Input.imeSetComposition", { text: "あおば", selectionStart: 3, selectionEnd: 3 })
    await expect(search).toHaveValue("あおば")
    await page.waitForTimeout(200)
    await expect(count(c, "client")).toHaveText(`${fmt(customers.length)}件`)
    await cdp.send("Input.insertText", { text: "青葉" })
    await expect(search).toHaveValue("青葉")
    await expect(count(c, "client")).toHaveText(`${fmt(total({ search: "青葉" }))}件`)
  })

  test("sort: desc first for amounts, then asc, then none; numbers not strings", async ({ page }) => {
    await open(page, "data-table")
    const c = client(page)
    const head = c.locator("th", { hasText: "月額" })
    const button = head.getByRole("button", { name: "月額" })
    const fees = async () =>
      (await bodyRows(c).locator("td:nth-child(6)").allTextContents()).map((t) => (t.includes("—") ? null : Number(t.replace(/[^\d-]/g, ""))))
    await expect(head).not.toHaveAttribute("aria-sort")
    await button.click()
    await expect(head).toHaveAttribute("aria-sort", "descending")
    const desc = (await fees()).filter((v): v is number => v !== null)
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
    expect(desc[0]).toBe(Math.max(...customers.map((x) => x.monthlyFee ?? 0)))
    await expect(c.locator("[data-slot=data-table-announcement]").first()).toHaveText("月額で降順に並べ替えました")
    await button.click()
    await expect(head).toHaveAttribute("aria-sort", "ascending")
    const asc = (await fees()).filter((v): v is number => v !== null)
    expect(asc).toEqual([...asc].sort((a, b) => a - b))
    // キーボードでも操作できる
    await button.focus()
    await page.keyboard.press("Enter")
    await expect(head).not.toHaveAttribute("aria-sort")
    // 単一列のソート：Shift を押しても複数の列にならない
    await button.click()
    await c.locator("th", { hasText: "会社名" }).getByRole("button").click({ modifiers: ["Shift"] })
    await expect(c.locator("th[aria-sort]")).toHaveCount(1)
  })

  test("dates sort by date and missing values stay last", async ({ page, isMobile }) => {
    test.skip(isMobile, "狭い画面では更新日の列を初めから隠しているため")
    await open(page, "data-table")
    const c = client(page)
    await c.locator("th", { hasText: "更新日" }).getByRole("button").click()
    await c.getByRole("combobox", { name: "表示件数" }).click()
    await page.getByRole("option", { name: "100件" }).click()
    const dates = (await bodyRows(c).locator("td:nth-child(8)").allTextContents()).filter((t) => !t.includes("—"))
    expect(dates).toEqual([...dates].sort())
    // 最後のページの末尾が欠損（未定）。100 件ずつでは 6 ページのため、最初と最後への移動は表示しない
    await expect(c.getByRole("button", { name: "最後のページ" })).toHaveCount(0)
    await c.getByRole("button", { name: "6ページ目", exact: true }).click()
    await expect(bodyRows(c).last().locator("td:nth-child(8)")).toContainText("未定")
  })

  test("selection by row id survives sorting; indeterminate; page select all", async ({ page }) => {
    await open(page, "data-table")
    const c = client(page)
    const first = bodyRows(c).first()
    const id = await first.getAttribute("data-row-id")
    await first.getByRole("checkbox").click()
    const header = c.getByRole("checkbox", { name: "このページの行をすべて選択" })
    await expect(header).toHaveAttribute("aria-checked", "mixed")
    await expect(c.getByText("1件を選択中")).toBeVisible()
    // 並べ替えても、同じ ID の行が選択されたまま
    await c.locator("th", { hasText: "会社名" }).getByRole("button").click()
    await expect(c.locator("tr[data-state=selected]")).toHaveCount((await c.locator(`tr[data-row-id="${id}"]`).count()) ? 1 : 0)
    await c.locator("th", { hasText: "会社名" }).getByRole("button").click()
    await c.locator("th", { hasText: "会社名" }).getByRole("button").click()
    await expect(c.locator(`tr[data-row-id="${id}"]`)).toHaveAttribute("data-state", "selected")
    await expect(c.locator("tr[data-state=selected]")).toHaveCount(1)
    // ページ内の全選択は 50 件。全データの選択は別の操作
    await c.getByRole("button", { name: "選択を解除" }).click()
    await header.click()
    await expect(header).toHaveAttribute("aria-checked", "true")
    await expect(c.getByText("50件を選択中")).toBeVisible()
    await c.getByRole("button", { name: `検索条件に一致する ${fmt(customers.length)}件をすべて選択` }).click()
    await expect(c.getByText(`${fmt(customers.length)}件を選択中`)).toBeVisible()
    // 次のページへ移ると、表示していない件数を示す
    await c.getByRole("button", { name: "選択を解除" }).click()
    await bodyRows(c).first().getByRole("checkbox").click()
    await c.getByRole("button", { name: "次へ" }).click()
    await expect(c.getByText("（表示していない 1件を含む）")).toBeVisible()
  })

  test("selection bar does not move the table", async ({ page }) => {
    await open(page, "data-table")
    const c = client(page)
    const table = c.locator("[data-slot=data-table]")
    // ページの先頭からの位置で比べる（操作でスクロールしても値が変わらない）
    const top = () => table.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY))
    const y = await top()
    await bodyRows(c).first().getByRole("checkbox").click()
    await expect(c.getByText("1件を選択中")).toBeVisible()
    expect(await top()).toBe(y)
  })

  test("bulk delete asks for confirmation; async; focus moves to the row now in that place", async ({ page }) => {
    await open(page, "data-table")
    const c = client(page)
    await page.evaluate(() => (window.__fdMockServer!.deleteLatency = 600))
    const next = (await bodyRows(c).nth(3).locator("td").nth(1).textContent())!.trim()
    await bodyRows(c).nth(1).getByRole("checkbox").click()
    await bodyRows(c).nth(2).getByRole("checkbox").click()
    // 一括操作は 1 件以上選んだときだけ表示する
    await expect(c.getByRole("region", { name: "選択した行の操作" })).toBeVisible()
    // 危険な一括操作は Alert Dialog で確かめる。キャンセルするとフォーカスは削除のボタンに戻る
    const del = c.getByRole("button", { name: "削除" })
    await del.click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toHaveAccessibleName("2件の顧客を削除しますか？")
    await dialog.getByRole("button", { name: "キャンセル" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(del).toBeFocused()
    await expect(c.getByText("2件を選択中")).toBeVisible()
    // 実行：処理中はボタンを処理中にし、キャンセルを無効にする
    await del.click()
    const action = page.getByRole("alertdialog").getByRole("button", { name: "2件を削除する" })
    await action.click()
    await expect(action).toHaveAttribute("aria-busy", "true")
    await expect(page.getByRole("alertdialog").getByRole("button", { name: "キャンセル" })).toBeDisabled()
    await expect(page.getByRole("alertdialog")).toHaveCount(0, { timeout: 3000 })
    await expect(count(c, "client")).toHaveText(`${fmt(customers.length - 2)}件`)
    await expect(page.locator("[data-slot=toast-title]", { hasText: "2件の顧客を削除しました" })).toBeVisible()
    await expect(c.getByRole("region", { name: "選択した行の操作" })).toHaveCount(0)
    // 削除した先頭の行の位置にある行（元の 4 行目）の会社名のボタンにフォーカスを移す
    const focused = c.locator("[data-slot=data-table-row-trigger]:focus")
    await expect(focused).toHaveText(next)
    await expect(bodyRows(c).nth(1).locator("[data-slot=data-table-row-trigger]")).toBeFocused()
  })

  test("bulk delete failure keeps the selection and returns focus to the delete button", async ({ page }) => {
    await open(page, "data-table")
    const c = client(page)
    await page.evaluate(() => {
      window.__fdMockServer!.deleteLatency = 100
      window.__fdMockServer!.failNextDelete = true
    })
    await bodyRows(c).nth(0).getByRole("checkbox").click()
    const del = c.getByRole("button", { name: "削除" })
    await del.click()
    await page.getByRole("alertdialog").getByRole("button", { name: "1件を削除する" }).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
    await expect(page.locator("[data-slot=toast-title]", { hasText: "顧客を削除できませんでした" })).toBeVisible()
    await expect(c.getByText("1件を選択中")).toBeVisible()
    await expect(count(c, "client")).toHaveCount(0)
    await expect(del).toBeFocused()
  })

  test("bulk delete with the keyboard; deleting the last page and all data moves focus to what remains", async ({ page, isMobile }) => {
    await open(page, "data-table")
    const c = client(page)
    await page.evaluate(() => (window.__fdMockServer!.deleteLatency = 50))
    // 最後のページ（551〜580 件目）の行をすべて削除すると、存在する最後のページへ移る
    // ページ番号の並びが収まらない領域（Pagination の Container Query）では、「最後のページ」で移る。
    if (await expectPaginationMode(c, isMobile)) await c.getByRole("button", { name: "最後のページ" }).click()
    else await c.getByRole("button", { name: "12ページ目", exact: true }).click()
    await expect(c.locator("[data-slot=pagination-range]")).toContainText(`551–580 / ${fmt(customers.length)}件`)
    await c.getByRole("checkbox", { name: "このページの行をすべて選択" }).click()
    const del = c.getByRole("button", { name: "削除" })
    await del.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("alertdialog")
    await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(dialog.getByRole("button", { name: "30件を削除する" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(dialog).toHaveCount(0)
    await expect(c.locator("[data-slot=pagination-range]")).toContainText("501–550 / 550件")
    await expect(bodyRows(c).first().locator("[data-slot=data-table-row-trigger]")).toBeFocused()
    // 検索条件に一致する全データを削除すると、空の状態の主要な操作にフォーカスを移す
    await c.getByRole("checkbox", { name: "このページの行をすべて選択" }).click()
    await c.getByRole("button", { name: "検索条件に一致する 550件をすべて選択" }).click()
    await del.click()
    await page.getByRole("alertdialog").getByRole("button", { name: "550件を削除する" }).click()
    await expect(c.locator("[data-slot=data-table-message][data-kind=empty]")).toBeVisible()
    await expect(c.getByRole("button", { name: "顧客を登録する" })).toBeFocused()
  })

  test("mobile: bulk actions keep accessible names; delete keeps its text", async ({ page, isMobile }) => {
    test.skip(!isMobile, "モバイルだけ")
    await open(page, "data-table")
    const c = client(page)
    await bodyRows(c).first().getByRole("checkbox").click()
    const bar = c.getByRole("region", { name: "選択した行の操作" })
    await expect(bar.getByRole("button", { name: "選択を解除" })).toBeVisible()
    await expect(bar.getByRole("button", { name: "メールを送信" })).toBeVisible()
    await expect(bar.getByRole("button", { name: "削除" })).toHaveText("削除")
    // 1 行に収まる
    const h = (await box(bar)).height
    expect(h).toBeLessThanOrEqual(56)
  })

  test("checkbox hit area stays inside its cell", async ({ page, isMobile }) => {
    await open(page, "data-table")
    const c = client(page)
    const cell = bodyRows(c).nth(1).locator("td").first()
    const b = await box(cell)
    // セルの端を押しても、その行だけが切り替わる。座標は操作の時点で求める（position）
    const at = (x: number, y: number) => (isMobile ? cell.tap({ position: { x, y } }) : cell.click({ position: { x, y } }))
    await at(3, 3)
    await expect(bodyRows(c).nth(1)).toHaveAttribute("data-state", "selected")
    await expect(c.locator("tr[data-state=selected]")).toHaveCount(1)
    await at(b.width - 3, b.height - 3)
    await expect(c.locator("tr[data-state=selected]")).toHaveCount(0)
    // 詳細は開かない
    await expect(page.getByTestId("customer-detail")).toHaveCount(0)
  })

  test("row click opens details; inner controls and text selection do not", async ({ page, isMobile }) => {
    await open(page, "data-table")
    const c = client(page)
    const row = bodyRows(c).nth(2)
    const company = (await row.locator("td").nth(1).textContent())!.trim()
    // 行の中の操作（Dropdown Menu）。メニューの項目は Portal に描かれる
    await row.getByRole("button", { name: `${company}の操作` }).click()
    await page.getByRole("menuitem", { name: "メールを作成" }).click()
    await expect(page.getByText(`${company}宛てのメールを作成します`)).toBeVisible()
    await expect(page.getByTestId("customer-detail")).toHaveCount(0)
    // メニューが閉じ、フォーカスが操作のボタンに戻ってから次へ進む
    await expect(page.getByRole("menu")).toHaveCount(0)
    await expect(row.getByRole("button", { name: `${company}の操作` })).toBeFocused()
    // 文字の選択
    if (!isMobile) {
      const cell = row.locator("td").nth(3)
      await cell.evaluate((el) => {
        const r = document.createRange()
        r.selectNodeContents(el)
        getSelection()!.removeAllRanges()
        getSelection()!.addRange(r)
      })
      await cell.dispatchEvent("click", { button: 0 })
      await expect(page.getByTestId("customer-detail")).toHaveCount(0)
      await page.evaluate(() => getSelection()!.removeAllRanges())
    }
    // 行の空いている所を押すと開く
    await row.locator("td").nth(4).click()
    const detail = page.getByTestId("customer-detail")
    await expect(detail).toBeVisible()
    await expect(page.getByRole("dialog", { name: company, exact: true })).toBeVisible()
    // 開くとフォーカスを Sheet に移す
    await expect.poll(() => detail.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    // 非モーダル：背景を暗くしない
    await expect(page.locator("[data-slot=sheet-overlay]")).toHaveCount(0)
    await expect(row).toHaveAttribute("data-active", "true")
    await expect(row).toHaveAttribute("aria-current", "true")
    // 非モーダル：開いたまま別の行を選べる。狭い画面では Sheet が画面の幅になるため、閉じてから選ぶ
    const other = bodyRows(c).nth(4)
    if (isMobile) {
      await detail.getByRole("button", { name: "詳細を閉じる" }).click()
      await expect(detail).toHaveCount(0)
    }
    // Sheet に重ならない左側の列を押す
    await other.locator("td").nth(2).click()
    await expect(other).toHaveAttribute("data-active", "true")
    await expect(row).not.toHaveAttribute("data-active")
    // 閉じると、開いた行のボタンにフォーカスが戻る
    await detail.getByRole("button", { name: "詳細を閉じる" }).click()
    await expect(detail).toHaveCount(0)
    await expect(other.locator("[data-slot=data-table-row-trigger]")).toBeFocused()
  })

  test("keyboard opens details with the row trigger; Escape closes", async ({ page }) => {
    await open(page, "data-table")
    const c = client(page)
    const trigger = bodyRows(c).first().locator("[data-slot=data-table-row-trigger]")
    await trigger.focus()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("customer-detail")).toBeVisible()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await expect.poll(() => page.getByTestId("customer-detail").evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("customer-detail")).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("column visibility, order, width and pinning", async ({ page, isMobile }) => {
    await open(page, "data-table")
    const c = client(page)
    const headers = () => c.locator("[data-slot=data-table] thead th").allTextContents()
    await c.getByRole("button", { name: /列の表示/ }).click()
    const options = page.getByRole("list", { name: "列の設定" })
    // 識別に必要な列は隠せない
    await expect(options.getByRole("checkbox", { name: /会社名/ })).toBeDisabled()
    await options.getByRole("checkbox", { name: "地域" }).click()
    expect(await headers()).not.toContain("地域")
    await options.getByRole("checkbox", { name: "地域" }).click()
    expect(await headers()).toContain("地域")
    // 並び替え（ボタン）。フォーカスは同じボタンに残る
    const before = await headers()
    const move = options.getByRole("button", { name: "担当者を右へ移動" })
    await move.click()
    const after = await headers()
    expect(after.indexOf("担当者")).toBe(before.indexOf("担当者") + 1)
    await expect(move).toBeFocused()
    // 列幅：キーボードで 16px ずつ（Popover を閉じてから操作する）
    await page.keyboard.press("Escape")
    const sep = c.getByRole("separator", { name: "会社名の列幅" })
    const th = c.locator("th", { hasText: "会社名" })
    const w = (await box(th)).width
    await sep.focus()
    await page.keyboard.press("ArrowRight")
    await expect.poll(async () => Math.round((await box(th)).width)).toBe(Math.round(w + 16))
    // Enter で列の定義の幅（260px）に戻す。狭い画面では初めの幅を 168px にしているため、戻すと 260px になる
    await page.keyboard.press("Enter")
    await expect.poll(async () => Math.round((await box(th)).width)).toBe(260)
    // 列幅：ドラッグ（マウス）
    if (!isMobile) {
      const s = await box(sep)
      await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
      await page.mouse.down()
      await page.mouse.move(s.x + s.width / 2 + 40, s.y + s.height / 2, { steps: 4 })
      await page.mouse.up()
      expect(Math.round((await box(th)).width)).toBeGreaterThan(Math.round(w + 20))
    }
    // 固定した列は横にスクロールしても位置が変わらない
    const scroller = c.locator("[data-slot=table-container]").first()
    const x0 = (await box(th)).x
    await scroller.evaluate((el) => (el.scrollLeft = 400))
    await page.waitForTimeout(100)
    expect(Math.round((await box(th)).x)).toBe(Math.round(x0))
    const firstName = bodyRows(c).first().locator("td").nth(1)
    expect(await css(firstName, "position")).toBe("sticky")
    // 固定を外す
    await c.getByRole("button", { name: /列の表示/ }).click()
    await options.getByRole("button", { name: "会社名を左端に固定" }).click()
    await expect(options.getByRole("button", { name: "会社名を左端に固定" })).toHaveAttribute("aria-pressed", "false")
    expect(await css(firstName, "position")).not.toBe("sticky")
  })

  test("pagination: range, page size, next", async ({ page, isMobile }) => {
    await open(page, "data-table")
    const c = client(page)
    const range = c.locator("[data-slot=pagination-range]")
    await expect(range).toContainText(`1–50 / ${fmt(customers.length)}件`)
    await c.getByRole("button", { name: "次へ" }).click()
    await expect(range).toContainText(`51–100 / ${fmt(customers.length)}件`)
    await expect(bodyRows(c)).toHaveCount(50)
    // ページ番号の並びが収まらない領域では、番号の代わりに現在の位置（2 / 12）を示す
    if (await expectPaginationMode(c, isMobile)) {
      await expect(c.locator("[data-slot=pagination-compact-position]")).toContainText("12ページ中 2ページ目")
    } else {
      await expect(c.getByRole("button", { name: "2ページ目", exact: true })).toHaveAttribute("aria-current", "page")
    }
    // 表示件数を 100 件にすると、51 件目を含む 1 ページ目に移る
    await c.getByRole("combobox", { name: "表示件数" }).click()
    await page.getByRole("option", { name: "100件" }).click()
    await expect(range).toContainText(`1–100 / ${fmt(customers.length)}件`)
    // 絞り込むと最初のページに戻る
    await c.getByRole("button", { name: "次へ" }).click()
    await chooseFilter(page, c, "client-status", "休止中")
    await expect(range).toContainText(`1–${Math.min(100, total({ status: "paused" }))} / ${fmt(total({ status: "paused" }))}件`)
  })

  test("mobile: low priority columns hidden, operable rows >= 48px, table scrolls inside", async ({ page, isMobile }) => {
    test.skip(!isMobile, "モバイルだけ")
    await open(page, "data-table")
    const c = client(page)
    const headers = await c.locator("[data-slot=data-table] thead th").allTextContents()
    expect(headers).not.toContain("電話番号")
    expect(headers).not.toContain("利用者数")
    for (const r of (await bodyRows(c).all()).slice(0, 5)) expect((await box(r)).height).toBeGreaterThanOrEqual(48)
    const scroller = c.locator("[data-slot=table-container]").first()
    expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    // 幅を固定した列でも、文字がセルからはみ出さない
    for (const cell of await bodyRows(c).locator("td:nth-child(2)").all())
      expect(await cell.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    // 隠した列の情報は詳細で確認できる
    await bodyRows(c).first().locator("[data-slot=data-table-row-trigger]").click()
    await expect(page.getByTestId("customer-detail")).toContainText("電話番号")
    await expect(page.getByTestId("customer-detail")).toContainText("利用者数")
  })
})

// ---------------------------------------------------------------- Data Table: server
const server = (page: Page) => page.getByTestId("server")

test.describe("Data Table: server", { tag: "@webkit" }, () => {
  test("loading, then rows; stale responses do not overwrite", async ({ page }) => {
    await open(page, "data-table")
    const s = server(page)
    await expect(s.locator("[data-slot=data-table-loading-row]").first()).toBeVisible()
    await expect(count(s, "server")).toHaveText(`${fmt(customers.length)}件`)
    // 「青」の応答を遅く、「青葉」の応答を早くする
    await page.evaluate(() => {
      window.__fdMockServer!.latency = (q) => (q.search === "青" ? 1500 : 60)
      window.__fdMockServer!.requests.length = 0
    })
    const search = s.getByRole("searchbox", { name: "会社名で検索" })
    await search.fill("青")
    await page.waitForTimeout(450)
    await search.fill("青葉")
    await expect(count(s, "server")).toHaveText(`${fmt(total({ search: "青葉" }))}件`)
    await page.waitForTimeout(1600)
    // 遅れて届いた「青」の応答で上書きされない
    await expect(count(s, "server")).toHaveText(`${fmt(total({ search: "青葉" }))}件`)
    const searches = await page.evaluate(() => window.__fdMockServer!.requests.map((q) => q.search))
    expect(searches).toContain("青")
    expect(searches[searches.length - 1]).toBe("青葉")
  })

  test("search is debounced", async ({ page }) => {
    await open(page, "data-table")
    const s = server(page)
    await expect(count(s, "server")).toHaveText(`${fmt(customers.length)}件`)
    await page.evaluate(() => {
      window.__fdMockServer!.latency = () => 30
      window.__fdMockServer!.requests.length = 0
    })
    await s.getByRole("searchbox", { name: "会社名で検索" }).pressSequentially("Lumen", { delay: 40 })
    await expect(count(s, "server")).toHaveText(`${fmt(total({ search: "Lumen" }))}件`)
    const searches = await page.evaluate(() => window.__fdMockServer!.requests.map((q) => q.search))
    expect(searches.filter((q) => q.length > 0 && q !== "Lumen")).toHaveLength(0)
  })

  test("error is not shown as zero; retry; refreshing keeps rows", async ({ page }) => {
    await open(page, "data-table")
    const s = server(page)
    await expect(count(s, "server")).toHaveText(`${fmt(customers.length)}件`)
    await page.evaluate(() => (window.__fdMockServer!.latency = () => 60))
    await s.getByTestId("server-fail").click()
    await expect(s.getByRole("alert")).toContainText("顧客の一覧を取得できませんでした")
    await expect(count(s, "server")).toHaveText("件数を取得できませんでした")
    await expect(s.locator("[data-slot=data-table-message][data-kind=no-results], [data-slot=data-table-message][data-kind=empty]")).toHaveCount(0)
    await s.getByRole("button", { name: "再試行" }).click()
    await expect(count(s, "server")).toHaveText(`${fmt(customers.length)}件`)
    // 再取得中は表示中のデータを残す
    await page.evaluate(() => (window.__fdMockServer!.latency = () => 1200))
    await s.getByTestId("server-reload").click()
    await expect(s.locator("[data-slot=data-table-refreshing]")).toBeVisible()
    await expect(bodyRows(s)).toHaveCount(50)
    await expect(s.locator("[data-slot=data-table]")).toHaveAttribute("aria-busy", "true")
    await expect(s.locator("[data-slot=data-table-refreshing]")).toHaveCount(0, { timeout: 3000 })
  })

  test("server sort and page; all-matching selection does not select unloaded rows", async ({ page }) => {
    await open(page, "data-table")
    const s = server(page)
    await expect(count(s, "server")).toHaveText(`${fmt(customers.length)}件`)
    await page.evaluate(() => (window.__fdMockServer!.latency = () => 40))
    await s.locator("th", { hasText: "月額" }).getByRole("button").click()
    await expect(s.locator("th", { hasText: "月額" })).toHaveAttribute("aria-sort", "descending")
    await expect(s.locator("[data-slot=data-table-refreshing]")).toHaveCount(0)
    const expected = queryCustomers({ ...baseQuery, sort: { id: "monthlyFee", desc: true } }).rows[0].company
    await expect(bodyRows(s).first().locator("td").nth(1)).toHaveText(expected)
    await s.getByRole("button", { name: "次へ" }).click()
    await expect(s.locator("[data-slot=pagination-range]")).toContainText(`51–100 / ${fmt(customers.length)}件`)
    // 再取得中は前のページの行が残るため、取得の完了を待ってから選ぶ
    await expect(s.locator("[data-slot=data-table-refreshing]")).toHaveCount(0)
    await expect(bodyRows(s).first().locator("td").nth(1)).toHaveText(
      queryCustomers({ ...baseQuery, sort: { id: "monthlyFee", desc: true }, pageIndex: 1 }).rows[0].company
    )
    // ページ内の全選択は表示中の 50 件だけ
    await s.getByRole("checkbox", { name: "このページの行をすべて選択" }).click()
    await expect(s.getByText("50件を選択中")).toBeVisible()
    await s.getByRole("button", { name: `検索条件に一致する ${fmt(customers.length)}件をすべて選択` }).click()
    await expect(s.getByText(`検索条件に一致する ${fmt(customers.length)}件をすべて選択中`)).toBeVisible()
    // 条件を変えると、「全データを選択中」は解除される
    await chooseFilter(page, s, "server-status", "試用中")
    await expect(s.getByText(/すべて選択中/)).toHaveCount(0)
  })
})

test.describe("Data Table: states", { tag: "@webkit" }, () => {
  test("each state has its own message and next action", async ({ page }) => {
    await open(page, "data-table")
    await expect(page.getByTestId("state-loading").locator("[data-slot=data-table-loading-row]")).toHaveCount(3)
    await expect(page.getByTestId("state-loading").locator("[data-slot=data-table]")).toHaveAttribute("aria-busy", "true")
    await expect(page.getByTestId("state-empty")).toContainText("顧客はまだ登録されていません")
    await expect(page.getByTestId("state-empty").getByRole("button", { name: "顧客を登録する" })).toBeVisible()
    await expect(page.getByTestId("state-no-results").getByRole("button", { name: "条件をすべて解除" })).toBeVisible()
    await expect(page.getByTestId("state-error").getByRole("alert")).toContainText("取得できませんでした")
    await expect(page.getByTestId("state-error").getByRole("button", { name: "再試行" })).toBeVisible()
    await expect(page.getByTestId("state-refreshing").locator("tbody tr[data-row-id]")).toHaveCount(3)
    await expect(page.getByTestId("state-refreshing").getByText("更新中").first()).toBeVisible()
    // 状態の表示は Advanced の Empty。取得失敗だけを role="alert" で知らせる
    for (const [id, status] of [["empty", "empty"], ["no-results", "no-results"], ["error", "error"]] as const) {
      const empty = page.getByTestId(`state-${id}`).locator("[data-slot=empty]")
      await expect(empty).toHaveAttribute("data-status", status)
      if (status === "error") await expect(empty).toHaveAttribute("role", "alert")
      else expect(await empty.getAttribute("role")).toBeNull()
      // 表を横にスクロールしても、表示中の幅の中央に置く
      const table = page.getByTestId(`state-${id}`).locator("[data-slot=table-container]")
      const [eb, tb] = [await box(empty), await box(table)]
      expect(Math.abs(eb.x + eb.width / 2 - (tb.x + tb.width / 2))).toBeLessThan(2)
    }
    // 取得失敗と再取得中は、0 件の表示にしない
    await expect(page.getByTestId("state-error").locator("[data-slot=data-table-message][data-kind=error]")).toHaveCount(1)
    await expect(page.getByTestId("state-error").locator("[data-kind=empty], [data-kind=no-results]")).toHaveCount(0)
    await expect(page.getByTestId("state-refreshing").locator("[data-slot=data-table-message]")).toHaveCount(0)
    // 初回の読み込みと再取得中は、選択の操作を受け付けない（表の locked）
    await expect(page.getByTestId("state-refreshing").locator("[data-slot=data-table]")).toHaveAttribute("aria-busy", "true")
  })
})

// ---------------------------------------------------------------- Data Table: selection and density
test.describe("Data Table: checkbox hit areas by density", { tag: "@webkit" }, () => {
  for (const [density, min] of [
    ["compact", 36],
    ["default", 48],
    ["comfortable", 64],
  ] as const) {
    test(`${density}: cell-wide target, no overlap, header, indeterminate, disabled, row click`, async ({ page, isMobile }) => {
      await open(page, "data-table")
      // 上にある「サーバー側の処理を模擬」の表は、0.4〜0.8 秒後に初回の取得を終え、読み込み中の行（ページサイズの 50 行）が取得した行に変わる。
      // 押している間にその表の高さが変わると、スクロールの位置の補正が起き、WebKit は mouseup と click を <html> へ送る。
      // ページの初回の読み込みが終わってから操作する
      const server = page.getByTestId("server").locator("[data-slot=data-table]")
      await expect(server.locator("[data-slot=data-table-loading-row]")).toHaveCount(0)
      await expect(server).not.toHaveAttribute("aria-busy", "true")
      const t = page.getByTestId(`density-${density}`)
      await t.scrollIntoViewIfNeeded()
      // スクロールが終わり、位置が定まってから座標を測る
      await settledBox(t)
      const rows = bodyRows(t)
      const state = page.getByTestId(`density-${density}-state`)
      // 行の最小の高さ。指で操作する端末では、選択できる行を 48px 以上にする
      const h0 = (await box(rows.first())).height
      expect(Math.round(h0)).toBe(isMobile ? Math.max(min, 48) : min)
      const header = t.getByRole("checkbox", { name: "このページの行をすべて選択" })
      if (isMobile) expect((await box(header.locator("xpath=.."))).height).toBeGreaterThanOrEqual(48)
      const cell = rows.nth(1).locator("td").first()
      const b = await box(cell)
      const press = (target: Locator, x: number, y: number) => (isMobile ? target.tap({ position: { x, y } }) : target.click({ position: { x, y } }))
      // セルの四隅を押しても、その行だけが切り替わる（隣の行と重ならない）
      await press(cell, 2, 2)
      await expect(rows.nth(1)).toHaveAttribute("data-state", "selected")
      await expect(t.locator("tr[data-state=selected]")).toHaveCount(1)
      await expect(header).toHaveAttribute("aria-checked", "mixed")
      await press(cell, b.width - 2, b.height - 2)
      await expect(t.locator("tr[data-state=selected]")).toHaveCount(0)
      await press(rows.nth(2).locator("td").first(), 2, 2)
      await expect(rows.nth(2)).toHaveAttribute("data-state", "selected")
      await expect(rows.nth(1)).not.toHaveAttribute("data-state", "selected")
      await expect(state).toContainText("詳細：なし")
      // 隣の列（会社名のセル）を押すと、選択ではなく詳細を開く。
      // マウスでは境界のすぐ右（3px）で確かめる。タッチでは、ブラウザが押した位置を近くの操作要素へ補正するため、セルの中央で確かめる
      const company = (await rows.nth(1).locator("td").nth(1).textContent())!.trim()
      const companyCell = rows.nth(1).locator("td").nth(1)
      const cb = await box(companyCell)
      await press(companyCell, isMobile ? cb.width - 8 : 3, isMobile ? cb.height / 2 : 3)
      await expect(state).toContainText(`詳細：${company}`)
      await expect(t.locator("tr[data-state=selected]")).toHaveCount(1)
      // 選択できない行（4 行目）：押しても切り替わらず、詳細も開かない
      const disabled = rows.nth(3)
      await expect(disabled.getByRole("checkbox")).toBeDisabled()
      await press(disabled.locator("td").first(), b.width / 2, 4)
      await expect(disabled).not.toHaveAttribute("data-state", "selected")
      await expect(state).toContainText(`詳細：${company}`)
      // ヘッダーの全選択：選択できる行だけを選び、すべて選ぶと checked
      await header.click()
      await expect(t.locator("tr[data-state=selected]")).toHaveCount(5)
      await expect(header).toHaveAttribute("aria-checked", "true")
      await header.click()
      await expect(t.locator("tr[data-state=selected]")).toHaveCount(0)
      // 固定した列：横にスクロールしても、押したセルの行が切り替わる
      await t.locator("[data-slot=table-container]").evaluate((el) => (el.scrollLeft = 200))
      await settledBox(rows.nth(4).locator("td").first())
      await press(rows.nth(4).locator("td").first(), 2, b.height / 2)
      await expect(rows.nth(4)).toHaveAttribute("data-state", "selected")
      await expect(t.locator("tr[data-state=selected]")).toHaveCount(1)
    })
  }
})

// ---------------------------------------------------------------- Data Table: server refreshing locks
test.describe("Data Table: server refreshing locks the actions", { tag: "@webkit" }, () => {
  const ready = async (s: Locator) => expect(s.locator("[data-slot=data-table-refreshing]")).toHaveCount(0, { timeout: 5000 })
  const expectLocked = async (s: Locator, locked: boolean) => {
    const check = (l: Locator) => (locked ? expect(l).toBeDisabled() : expect(l).toBeEnabled())
    await check(s.getByRole("checkbox", { name: "このページの行をすべて選択" }))
    await check(bodyRows(s).first().getByRole("checkbox"))
    await check(bodyRows(s).first().getByRole("button", { name: /の操作$/ }))
    // 閲覧は残す：会社名のボタンで詳細を開ける
    await expect(bodyRows(s).first().locator("[data-slot=data-table-row-trigger]")).toBeEnabled()
  }

  test("page, sort, filter and search changes; reversed responses; selection kept by id", async ({ page }) => {
    await open(page, "data-table")
    const s = server(page)
    await expect(count(s, "server")).toHaveText(`${fmt(customers.length)}件`)
    await page.evaluate(() => (window.__fdMockServer!.latency = () => 50))
    await bodyRows(s).nth(0).getByRole("checkbox").click()
    await bodyRows(s).nth(1).getByRole("checkbox").click()
    const bar = s.getByRole("region", { name: "選択した行の操作" })
    await expect(bar).toContainText("2件を選択中")
    // ページの移動：再取得の間は、表示中の古い行に対する操作を受け付けない
    await page.evaluate(() => (window.__fdMockServer!.latency = () => 1200))
    await s.getByRole("button", { name: "次へ" }).click()
    await expect(s.locator("[data-slot=data-table-refreshing]")).toBeVisible()
    await expectLocked(s, true)
    await expect(bar.getByRole("button", { name: "削除" })).toBeDisabled()
    await expect(bar).toContainText("更新が終わるまで操作できません")
    // 選択の解除は、表示中の行に依存しないため押せる
    await expect(bar.getByRole("button", { name: "選択を解除" })).toBeEnabled()
    await ready(s)
    await expectLocked(s, false)
    await expect(bar.getByRole("button", { name: "削除" })).toBeEnabled()
    // 選択済みの ID は残る（表示していないページの 2 件）
    await expect(bar).toContainText("2件を選択中（表示していない 2件を含む）")
    // 並べ替え：応答の順序が逆転しても、最新の条件の応答で操作を戻す
    // 1 回目の要求（降順）を 1.5 秒、2 回目（昇順）を 0.2 秒で返す
    await page.evaluate(() => {
      let i = 0
      window.__fdMockServer!.latency = () => (i++ === 0 ? 1500 : 200)
    })
    await s.locator("th", { hasText: "月額" }).getByRole("button").click()
    await page.waitForTimeout(50)
    await s.locator("th", { hasText: "月額" }).getByRole("button").click()
    await expectLocked(s, true)
    await ready(s)
    await expect(s.locator("th", { hasText: "月額" })).toHaveAttribute("aria-sort", "ascending")
    await expectLocked(s, false)
    const ascFirst = queryCustomers({ ...baseQuery, sort: { id: "monthlyFee", desc: false } }).rows[0].company
    await expect(bodyRows(s).first().locator("td").nth(1)).toHaveText(ascFirst)
    await page.waitForTimeout(1500)
    // 遅れて届いた降順の応答で上書きしない
    await expect(bodyRows(s).first().locator("td").nth(1)).toHaveText(ascFirst)
    await expectLocked(s, false)
    // 絞り込みと検索：条件が変わっても、選択済みの ID は残る
    await page.evaluate(() => (window.__fdMockServer!.latency = () => 400))
    await chooseFilter(page, s, "server-status", "契約中")
    await expectLocked(s, true)
    await ready(s)
    await s.getByRole("searchbox", { name: "会社名で検索" }).fill("株式会社")
    await expect(s.locator("[data-slot=data-table-refreshing]")).toBeVisible({ timeout: 2000 })
    await expectLocked(s, true)
    await ready(s)
    await expectLocked(s, false)
    await expect(bar).toContainText("2件を選択中")
    await expect(count(s, "server")).toHaveCount(0)
  })

  test("failure keeps the selection; select-all-matching is not offered while refreshing", async ({ page }) => {
    await open(page, "data-table")
    const s = server(page)
    await expect(count(s, "server")).toHaveText(`${fmt(customers.length)}件`)
    await page.evaluate(() => (window.__fdMockServer!.latency = () => 50))
    await s.getByRole("checkbox", { name: "このページの行をすべて選択" }).click()
    const bar = s.getByRole("region", { name: "選択した行の操作" })
    const selectAll = bar.getByRole("button", { name: `検索条件に一致する ${fmt(customers.length)}件をすべて選択` })
    await expect(selectAll).toBeEnabled()
    // 再取得中：全データの選択と一括操作を無効にする
    await page.evaluate(() => (window.__fdMockServer!.latency = () => 1000))
    await s.getByTestId("server-reload").click()
    await expect(s.locator("[data-slot=data-table-refreshing]")).toBeVisible()
    await expect(selectAll).toBeDisabled()
    await expect(s.getByRole("checkbox", { name: "このページの行をすべて選択" })).toBeDisabled()
    await ready(s)
    await expect(selectAll).toBeEnabled()
    // 取得失敗：表を 0 件にせず、一括操作を無効にし、選択を残す
    await page.evaluate(() => (window.__fdMockServer!.latency = () => 50))
    await s.getByTestId("server-fail").click()
    await expect(s.locator("[data-slot=data-table-message][data-kind=error]")).toBeVisible()
    await expect(bar).toContainText("50件を選択中")
    await expect(bar.getByRole("button", { name: "削除" })).toBeDisabled()
    await s.getByRole("button", { name: "再試行" }).click()
    await ready(s)
    await expect(bar.getByRole("button", { name: "削除" })).toBeEnabled()
    await expect(bar).toContainText("50件を選択中")
    await expect(s.getByRole("checkbox", { name: "このページの行をすべて選択" })).toHaveAttribute("aria-checked", "true")
  })
})

// ---------------------------------------------------------------- Pagination
test.describe("Pagination", { tag: "@webkit" }, () => {
  const nav = (page: Page, id: string) => page.getByTestId(id).getByRole("navigation", { name: "ページ送り" })

  test("tokens: 40px controls (48px on touch), current page is primary", async ({ page, isMobile }) => {
    await open(page, "pagination")
    const n = nav(page, "pagination-few")
    const current = n.getByRole("button", { name: "1ページ目", exact: true })
    await expect(current).toHaveAttribute("aria-current", "page")
    const size = isMobile ? 48 : 40
    expect((await box(current)).height).toBe(size)
    expect((await box(n.getByRole("button", { name: "2ページ目", exact: true }))).width).toBeGreaterThanOrEqual(size)
    expect(sameColor(await css(current, "background-color"), await token(page, "--primary"))).toBe(true)
    // 最初のページでは前へが無効
    await expect(n.getByRole("button", { name: "前へ" })).toBeDisabled()
    await n.getByRole("button", { name: "3ページ目", exact: true }).click()
    await expect(page.getByTestId("pagination-few-state")).toHaveText("page=3 pageSize=50")
    await expect(n.getByRole("button", { name: "3ページ目", exact: true })).toHaveAttribute("aria-current", "page")
  })

  test("many pages: ellipsis and a constant number of items", async ({ page, isMobile }) => {
    await open(page, "pagination")
    const n = nav(page, "pagination-many")
    const compact = n.locator("[data-slot=pagination-compact-position]")
    if (await expectPaginationMode(page.getByTestId("pagination-many"), isMobile)) {
      // 移動しても、表示する項目の数は変わらない（ボタンの位置が動かない）
      const visibleItems = n.locator("li:visible")
      const compactLen = await visibleItems.count()
      // ページ番号の並び（7 項目、48px）が置かれた領域に収まらない：番号の代わりに位置を示し、最初・最後と前後の移動を置く
      await expect(compact).toContainText("116ページ中")
      for (const name of ["最初のページ", "前へ", "次へ", "最後のページ"]) {
        const b = n.getByRole("button", { name })
        await expect(b).toBeVisible()
        expect((await box(b)).height).toBeGreaterThanOrEqual(48)
      }
      // 並びは領域の中に収まる
      const area = await box(page.getByTestId("pagination-many"))
      const navBox = await box(n)
      expect(navBox.x + navBox.width).toBeLessThanOrEqual(area.x + area.width + 1)
      await n.getByRole("button", { name: "次へ" }).click()
      expect(await visibleItems.count()).toBe(compactLen)
      // キーボードで「最後のページ」を押す（押したボタンが無効になった後のフォーカスを確かめる）
      await n.getByRole("button", { name: "最後のページ" }).focus()
      await page.keyboard.press("Enter")
      await expect(page.getByTestId("pagination-many-state")).toHaveText("page=116 pageSize=50")
      await expect(compact).toContainText("116ページ中 116ページ目")
      expect(await visibleItems.count()).toBe(compactLen)
      // 最後のページに着いて押したボタンが無効になったら、フォーカスは位置の表示へ移る（「最初のページ」へは移さない）
      await expect(n.locator("[data-slot=pagination-compact-current]")).toBeFocused()
      await expect(n.getByRole("button", { name: "次へ" })).toBeDisabled()
      await expect(n.getByRole("button", { name: "最後のページ" })).toBeDisabled()
      return
    }
    const items = n.locator("li:visible")
    const len = await items.count()
    await expect(n.locator("[data-slot=pagination-ellipsis]")).toHaveCount(2)
    // 狭い画面では前後のページを省く（並びは 5 項目）
    for (const target of isMobile ? ["1ページ目", "2ページ目", "3ページ目"] : ["19ページ目", "18ページ目", "1ページ目"]) {
      await n.getByRole("button", { name: target, exact: true }).click()
      expect(await items.count()).toBe(len)
    }
    if (!isMobile) {
      await n.getByRole("button", { name: "最後のページ" }).click()
      await expect(page.getByTestId("pagination-many-state")).toHaveText("page=116 pageSize=50")
      await expect(n.getByRole("button", { name: "次へ" })).toBeDisabled()
      await expect(n.getByRole("button", { name: "最後のページ" })).toBeDisabled()
    }
  })

  test("last page and page size change keep the first item", async ({ page }) => {
    await open(page, "pagination")
    const last = page.getByTestId("pagination-last")
    await expect(last.locator("[data-slot=pagination-range]")).toContainText("551–580 / 580件")
    await expect(last.getByRole("button", { name: "次へ" })).toBeDisabled()
    await last.getByRole("combobox", { name: "表示件数" }).click()
    await page.getByRole("option", { name: "25件" }).click()
    await expect(page.getByTestId("pagination-last-state")).toHaveText("page=23 pageSize=25")
    await expect(last.locator("[data-slot=pagination-range]")).toContainText("551–575 / 580件")
  })

  test("total shrinks to an existing page; zero", async ({ page }) => {
    await open(page, "pagination")
    const s = page.getByTestId("pagination-shrink")
    await s.getByTestId("pagination-shrink-130").click()
    await expect(page.getByTestId("pagination-shrink-state")).toHaveText("page=3")
    await expect(s.locator("[data-slot=pagination-range]")).toContainText("101–130 / 130件")
    await s.getByTestId("pagination-shrink-0").click()
    await expect(s.locator("[data-slot=pagination-range]")).toContainText("0件")
    await expect(s.getByRole("button", { name: "前へ" })).toBeDisabled()
    await expect(s.getByRole("button", { name: "次へ" })).toBeDisabled()
    await expect(s.getByRole("button", { name: /ページ目/ })).toHaveCount(0)
    const zero = page.getByTestId("pagination-zero")
    await expect(zero.locator("[data-slot=pagination-range]")).toContainText("0件")
  })

  test("unknown total and cursor do not show guessed values", async ({ page }) => {
    await open(page, "pagination")
    const u = page.getByTestId("pagination-unknown")
    await expect(u.locator("[data-slot=pagination-range]")).toContainText("1–50件目")
    await expect(u.locator("[data-slot=pagination-range]")).not.toContainText("/")
    await expect(u.getByRole("button", { name: /ページ目/ })).toHaveCount(0)
    await expect(u.getByRole("button", { name: "最後のページ" })).toHaveCount(0)
    await u.getByRole("button", { name: "次へ" }).click()
    await expect(u.locator("[data-slot=pagination-range]")).toContainText("51–100件目")
    const c = page.getByTestId("pagination-cursor")
    await expect(c.getByRole("button", { name: "前へ" })).toBeDisabled()
    await expect(c.locator("[data-slot=pagination-range]")).toHaveText("25件を表示中")
    await c.getByRole("button", { name: "次へ" }).click()
    await expect(page.getByTestId("pagination-cursor-state")).toHaveText(`先頭：${customers[25].id}`)
    await c.getByRole("button", { name: "前へ" }).click()
    await expect(page.getByTestId("pagination-cursor-state")).toHaveText(`先頭：${customers[0].id}`)
  })

  test("one page, disabled, and focus kept after moving", async ({ page, isMobile }) => {
    await open(page, "pagination")
    // 1 ページだけ
    const single = page.getByTestId("pagination-single")
    await expect(single.locator("[data-slot=pagination-range]")).toContainText("1–30 / 30件")
    await expect(single.getByRole("button", { name: /ページ目/ })).toHaveCount(1)
    await expect(single.getByRole("button", { name: "前へ" })).toBeDisabled()
    await expect(single.getByRole("button", { name: "次へ" })).toBeDisabled()
    // 処理中：移動と表示件数を受け付けない。現在のページは示したまま
    const busy = page.getByTestId("pagination-disabled")
    // ページ番号の並びが収まらない領域では、番号の代わりに現在の位置を示す
    if (await expectPaginationMode(busy, isMobile)) {
      await expect(busy.locator("[data-slot=pagination-compact-position]")).toContainText("ページ中 3ページ目")
    } else {
      await expect(busy.getByRole("button", { name: "3ページ目", exact: true })).toHaveAttribute("aria-current", "page")
    }
    for (const b of await busy.getByRole("button").all()) {
      if ((await b.getAttribute("aria-current")) !== "page") await expect(b).toBeDisabled()
    }
    await expect(busy.getByRole("combobox", { name: "表示件数" })).toBeDisabled()
    // 最後のページに着いて「次へ」が無効になっても、フォーカスは現在のページのボタンに残る
    const few = nav(page, "pagination-few")
    const next = few.getByRole("button", { name: "次へ" })
    await next.focus()
    for (let i = 0; i < 3; i++) await page.keyboard.press("Enter")
    await expect(page.getByTestId("pagination-few-state")).toHaveText("page=4 pageSize=50")
    await expect(next).toBeDisabled()
    await expect(few.getByRole("button", { name: "4ページ目", exact: true })).toBeFocused()
    // ページ番号で移動した後も、押したボタンにフォーカスが残る
    await few.getByRole("button", { name: "2ページ目", exact: true }).click()
    await expect(few.getByRole("button", { name: "2ページ目", exact: true })).toBeFocused()
    // カーソル：最初に戻って「前へ」が無効になったら、「次へ」へ移す
    const cursor = page.getByTestId("pagination-cursor")
    await cursor.getByRole("button", { name: "次へ" }).click()
    const prev = cursor.getByRole("button", { name: "前へ" })
    await prev.focus()
    await page.keyboard.press("Enter")
    await expect(prev).toBeDisabled()
    await expect(cursor.getByRole("button", { name: "次へ" })).toBeFocused()
    if (isMobile) for (const b of await few.getByRole("button").all()) expect((await box(b)).height).toBeGreaterThanOrEqual(48)
  })

  test("links render <a> with aria-current", async ({ page }) => {
    await open(page, "pagination")
    const n = page.getByTestId("pagination-links")
    await expect(n.getByRole("link", { name: "2ページ目", exact: true })).toHaveAttribute("aria-current", "page")
    await expect(n.getByRole("link", { name: "1ページ目", exact: true })).toHaveAttribute("href", "?page=1")
    await expect(n.getByRole("link", { name: "前へ" })).toBeVisible()
  })

  test("brand color: current page keeps contrast", async ({ page }) => {
    await open(page, "pagination")
    for (const brand of ["青", "紫"]) {
      await page.getByRole("radio", { name: brand }).check()
      const current = nav(page, "pagination-few").getByRole("button", { name: "1ページ目", exact: true })
      const primary = await tokenIn(page, "--primary")
      await expect.poll(async () => sameColor(await css(current, "background-color"), primary)).toBe(true)
      expect(await textContrast(page, current, current)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

// ---------------------------------------------------------------- Chart
const bars = (l: Locator) => l.locator(".recharts-bar-rectangle path")

async function zeroY(chart: Locator) {
  // 縦軸の 0 の目盛りの位置。Recharts 3.10 は目盛りの文字を .recharts-yAxis-tick-labels に描く
  return chart.locator(".recharts-yAxis-tick-labels text").evaluateAll((texts) => {
    for (const t of texts) if (t.textContent?.trim() === "0") return Number(t.getAttribute("y"))
    return null
  })
}

test.describe("Chart", { tag: "@webkit" }, () => {
  test("six chart types render with accessible names", async ({ page }) => {
    await open(page, "chart")
    for (const id of ["chart-line", "chart-bar", "chart-area", "chart-donut", "chart-stacked", "chart-scatter"]) {
      const fig = page.getByTestId(id).getByRole("figure")
      await expect(fig).toHaveAccessibleName(/\S/)
      await expect(fig.locator("svg.recharts-surface").first()).toBeVisible()
      // フォーカスを受け取る svg にも名前がある
      const svg = fig.locator("svg[role=application]").first()
      await expect(svg).toHaveAccessibleName(/\S/)
    }
  })

  test("tokens: transparent, 12px axis, 2px line, horizontal grid only, no shadow", async ({ page }) => {
    await open(page, "chart")
    const fig = page.getByTestId("chart-line").locator("[data-slot=chart]")
    expect(await css(fig, "background-color")).toBe("rgba(0, 0, 0, 0)")
    expect(await css(fig, "box-shadow")).toBe("none")
    expect(await css(fig, "border-top-width")).toBe("0px")
    const tick = fig.locator(".recharts-cartesian-axis-tick-value").first()
    expect(await css(tick, "font-size")).toBe("12px")
    expect(sameColor(await css(tick, "fill"), await token(page, "--muted-foreground"))).toBe(true)
    expect(await fig.locator(".recharts-line-curve").first().getAttribute("stroke-width")).toBe("2")
    await expect(fig.locator(".recharts-cartesian-grid-vertical line")).toHaveCount(0)
    expect(await fig.locator(".recharts-cartesian-grid-horizontal line").count()).toBeGreaterThan(0)
    const grid = fig.locator(".recharts-cartesian-grid-horizontal line").first()
    expect(sameColor(await css(grid, "stroke"), await token(page, "--border"))).toBe(true)
  })

  test("bars: zero baseline, heights match data, 4px radius", async ({ page, isMobile }) => {
    test.skip(isMobile, "狭い画面では横向きの棒グラフにするため、別のテストで確認する")
    await open(page, "chart")
    const chart = page.getByTestId("chart-bar")
    await page.waitForTimeout(600)
    const rects = bars(chart)
    await expect(rects).toHaveCount(8)
    const z = await zeroY(chart)
    expect(z).not.toBeNull()
    const geo = await rects.evaluateAll((els) => els.map((e) => ({ y: Number(e.getAttribute("y")), h: Number(e.getAttribute("height")) })))
    for (const g of geo) expect(Math.abs(g.y + g.h - z!)).toBeLessThan(1.5)
    // 関東（96）と北海道（18）の高さの比が値の比と一致する
    expect(geo[2].h / geo[0].h).toBeCloseTo(96 / 18, 1)
    expect(await rects.first().getAttribute("d")).toContain("A 4,4")
  })

  test("negative values extend below zero, zero values have no bar", async ({ page, isMobile }) => {
    test.skip(isMobile, "狭い画面では横向きの棒グラフにするため、別のテストで確認する")
    await open(page, "chart")
    const chart = page.getByTestId("chart-bar-negative")
    await page.waitForTimeout(600)
    const z = (await zeroY(chart))!
    // 負の値の棒は高さが負の値で描かれるため、上端と下端に直して比べる
    const geo = await bars(chart).evaluateAll((els) =>
      els.map((e) => {
        const y = Number(e.getAttribute("y"))
        const h = Number(e.getAttribute("height"))
        return { top: Math.min(y, y + h), bottom: Math.max(y, y + h) }
      })
    )
    // 0 の値（中国）は棒を描かない。それ以外の棒は、どれも 0 の線から伸びる
    expect(geo).toHaveLength(7)
    for (const g of geo) expect(Math.min(Math.abs(g.top - z), Math.abs(g.bottom - z))).toBeLessThan(1.5)
    // 北海道 -4：0 の線より下。関東 +21：0 の線より上
    expect(geo[0].top).toBeGreaterThanOrEqual(z - 1)
    expect(geo[2].bottom).toBeLessThanOrEqual(z + 1)
    // 値の比と長さの比が一致する（関東 21 / 近畿 -9）
    expect((geo[2].bottom - geo[2].top) / (geo[4].bottom - geo[4].top)).toBeCloseTo(21 / 9, 1)
    // 増減の向きで色を変えない
    const fills = await bars(chart).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("fill")))])
    expect(fills).toHaveLength(1)
  })

  test("narrow screens: horizontal bars, labels do not overlap, bars start at zero", async ({ page, isMobile }) => {
    test.skip(!isMobile, "狭い画面だけ")
    await open(page, "chart")
    await page.waitForTimeout(600)
    for (const id of ["chart-bar", "chart-bar-negative"]) {
      const chart = page.getByTestId(id)
      const labels = chart.locator(".recharts-yAxis-tick-labels text")
      await expect(labels).toHaveCount(8)
      const boxes = await labels.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ top: b.top, bottom: b.bottom })))
      boxes.sort((a, b) => a.top - b.top)
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 0.5)
      // 棒は 0 の位置から横に伸びる
      const zero = await chart.locator(".recharts-xAxis-tick-labels text").evaluateAll((els) => {
        for (const t of els) if (t.textContent?.trim() === "0") return Number(t.getAttribute("x"))
        return null
      })
      expect(zero).not.toBeNull()
      const geo = await bars(chart).evaluateAll((els) =>
        els.map((e) => {
          const x = Number(e.getAttribute("x"))
          const w = Number(e.getAttribute("width"))
          return { left: Math.min(x, x + w), right: Math.max(x, x + w) }
        })
      )
      for (const g of geo) expect(Math.min(Math.abs(g.left - zero!), Math.abs(g.right - zero!))).toBeLessThan(1.5)
    }
  })

  test("missing values break the line; forecast is dashed", async ({ page }) => {
    await open(page, "chart")
    const chart = page.getByTestId("chart-line")
    await page.waitForTimeout(600)
    const curves = chart.locator(".recharts-line-curve")
    const actual = await curves.nth(0).getAttribute("d")
    // 2026 年 6 月で途切れる：パスが 2 つの線分（M が 2 回）
    expect(actual!.match(/M/g)).toHaveLength(2)
    expect(await curves.nth(1).getAttribute("stroke-dasharray")).toBe("6 4")
    // 数値の表では欠損を 0 にしない
    await chart.getByText("数値を表で見る").click()
    const row = chart.locator("[data-slot=chart-data-table] tbody tr", { hasText: "2026/06" })
    await expect(row.locator("td").nth(1)).toContainText("データなし")
  })

  test("highlight uses primary and neutral; brand palette override", async ({ page }) => {
    await open(page, "chart")
    const chart = page.getByTestId("chart-bar-highlight")
    await page.waitForTimeout(400)
    const fills = await bars(chart).evaluateAll((els) => els.map((e) => e.getAttribute("fill")))
    expect(fills.filter((f) => f === "var(--primary)")).toHaveLength(1)
    expect(fills.filter((f) => f === "var(--border-strong)")).toHaveLength(7)
    // ブランドカラーの変更が強調の色に反映される
    await page.getByRole("radio", { name: "紫" }).check()
    const kanto = bars(chart).nth(2)
    expect(sameColor(await css(kanto, "fill"), await tokenIn(page, "--primary"))).toBe(true)
    // グラフの色の上書き
    const single = bars(page.getByTestId("chart-bar")).first()
    const before = await css(single, "fill")
    await page.getByTestId("chart-palette-brand").check()
    await expect.poll(() => css(single, "fill")).not.toBe(before)
    expect(sameColor(await css(single, "fill"), await tokenIn(page, "--primary"))).toBe(true)
  })

  test("donut: proportions, legend values, total", async ({ page }) => {
    await open(page, "chart")
    const chart = page.getByTestId("chart-donut")
    await page.waitForTimeout(600)
    await expect(chart.locator(".recharts-pie-sector")).toHaveCount(3)
    await expect(chart.getByRole("list", { name: "凡例" })).toContainText("スタンダード268件46.2%")
    await expect(chart.locator("text tspan").first()).toHaveText("580")
  })

  test("zero vs missing, empty data, invalid composition", async ({ page }) => {
    await open(page, "chart")
    const zm = page.getByTestId("chart-zero-missing")
    const cats = zm.locator("[data-slot=chart-category]")
    await expect(cats).toHaveCount(5)
    await expect(zm.locator('[data-slot=chart-category][data-value="0"]')).toContainText("0件")
    await expect(zm.locator('[data-slot=chart-category][data-value="missing"]')).toContainText("データなし")
    // 0 と欠損は棒を描かない。表では 0 と「データなし」を区別する
    await page.waitForTimeout(500)
    await expect(bars(zm)).toHaveCount(3)
    await zm.getByText("数値を表で見る").click()
    const table = zm.locator("[data-slot=chart-data-table] tbody")
    await expect(table.locator("tr", { hasText: "東北" }).locator("td").nth(1)).toHaveText("0")
    await expect(table.locator("tr", { hasText: "中部" }).locator("td").nth(1)).toContainText("データなし")
    // 空のデータ：軸だけのグラフを描かず、Empty で示す
    const empty = page.getByTestId("chart-empty")
    await expect(empty.locator("[data-slot=empty]")).toHaveAttribute("data-status", "empty")
    await expect(empty.locator("svg.recharts-surface")).toHaveCount(0)
    // 構成比に使えない値：Donut を描かず、理由を示す
    const invalid = page.getByTestId("chart-invalid-composition")
    await expect(invalid.locator("[data-slot=empty]")).toHaveAttribute("data-status", "error")
    await expect(invalid).toContainText("負の値があります")
    await expect(invalid.locator(".recharts-pie-sector")).toHaveCount(0)
  })

  test("legend follows series order; tooltip indicators match series colors", async ({ page, isMobile }) => {
    await open(page, "chart")
    const multi = page.getByTestId("chart-line-multi")
    await expect(multi.locator("[data-slot=chart-legend] li")).toHaveText(["ベーシック", "スタンダード", "エンタープライズ"])
    await expect(page.getByTestId("chart-stacked").locator("[data-slot=chart-legend] li")).toHaveText(["契約中", "試用中", "休止中"])
    test.skip(isMobile, "ホバーはデスクトップで確かめる（タッチは別のテスト）")
    await multi.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    const svg = multi.locator("svg[role=application]")
    const b = await box(svg)
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2)
    const tip = multi.locator("[data-slot=chart-tooltip]")
    await expect(tip).toBeVisible()
    const indicators = await tip.locator("[data-slot=chart-indicator]").evaluateAll((els) => els.map((e) => getComputedStyle(e).borderTopColor))
    const strokes = await multi.locator(".recharts-line-curve").evaluateAll((els) => els.map((e) => getComputedStyle(e).stroke))
    expect(indicators).toHaveLength(3)
    for (let i = 0; i < 3; i++) expect(await sameRgb(page, indicators[i], strokes[i])).toBe(true)
  })

  test("hidden area and width changes: the chart follows its container", async ({ page, isMobile }) => {
    await open(page, "chart")
    const hidden = page.getByTestId("chart-hidden")
    await hidden.locator("summary").first().click()
    const fig = page.getByTestId("chart-hidden-line").locator("[data-slot=chart]")
    await expect(fig.locator("svg.recharts-surface")).toBeVisible()
    await expect.poll(async () => Math.round((await box(fig.locator("svg.recharts-surface").first())).width)).toBe(Math.round((await box(fig)).width))
    test.skip(isMobile, "幅の変更はデスクトップの表示で確かめる")
    const line = page.getByTestId("chart-line").locator("[data-slot=chart]")
    const wide = (await box(line)).width
    await page.setViewportSize({ width: 700, height: 900 })
    await expect.poll(async () => Math.round((await box(line.locator("svg.recharts-surface").first())).width)).toBe(Math.round((await box(line)).width))
    expect((await box(line)).width).toBeLessThan(wide)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test("tooltip: hover, keyboard, touch", async ({ page, isMobile }) => {
    await open(page, "chart")
    const chart = page.getByTestId("chart-bar")
    const svg = chart.locator("svg[role=application]")
    const tooltip = chart.locator("[data-slot=chart-tooltip]")
    await page.waitForTimeout(600)
    await bars(chart).nth(2).scrollIntoViewIfNeeded()
    const b = await box(bars(chart).nth(2))
    if (isMobile) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
    else await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await expect(tooltip).toContainText("関東")
    await expect(tooltip).toContainText("96件")
    // Tooltip の面は Popover と同じ
    expect(await css(tooltip, "box-shadow")).not.toBe("none")
    expect(await css(tooltip, "border-top-left-radius")).toBe("12px")
    if (!isMobile) {
      await page.mouse.move(0, 0)
      await svg.focus()
      await page.keyboard.press("ArrowRight")
      await expect(tooltip).toBeVisible()
      const first = await tooltip.textContent()
      await page.keyboard.press("ArrowRight")
      await expect.poll(() => tooltip.textContent()).not.toBe(first)
      // フォーカスの表示
      expect(await css(svg, "outline-style")).toBe("solid")
    }
  })

  test("responsive: charts fit their container, axis labels are not clipped", async ({ page }) => {
    await open(page, "chart")
    await page.waitForTimeout(500)
    for (const fig of await page.locator("[data-testid=chart-gallery] [data-slot=chart]").all()) {
      const container = await box(fig)
      const svg = await box(fig.locator("svg.recharts-surface").first())
      expect(svg.width).toBeLessThanOrEqual(container.width + 1)
      for (const t of await fig.locator(".recharts-yAxis .recharts-cartesian-axis-tick-value").all()) {
        const tb = await box(t)
        expect(tb.x).toBeGreaterThanOrEqual(container.x - 1)
      }
    }
  })

  test("reduced motion: bars are drawn without animation", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" })
    const page = await context.newPage()
    await page.goto("/#/chart")
    const chart = page.getByTestId("chart-bar")
    await bars(chart).first().waitFor()
    const h1 = await bars(chart).nth(2).getAttribute("height")
    await page.waitForTimeout(400)
    expect(await bars(chart).nth(2).getAttribute("height")).toBe(h1)
    await context.close()
  })
})

// ---------------------------------------------------------------- Dashboard
test.describe("Dashboard", { tag: "@webkit" }, () => {
  test("metrics, charts and table compose without cards", async ({ page }) => {
    await open(page, "dashboard")
    const d = page.getByTestId("dashboard")
    await expect(d.getByRole("figure")).toHaveCount(2)
    await expect(d.locator("[data-slot=data-table]")).toBeVisible()
    // カード（影や角丸の枠）で囲まない
    for (const el of await d.locator("section, dl").all()) {
      expect(await css(el, "box-shadow")).toBe("none")
      expect(await css(el, "border-top-left-radius")).toBe("0px")
    }
    // 更新日の昇順
    const dates = await d.locator("tbody tr td:nth-child(5)").allTextContents()
    expect(dates).toEqual([...dates].sort())
  })
})

// ---------------------------------------------------------------- screenshots
test.describe("screenshots", () => {
  test("pages", async ({ page }, info) => {
    const dir = join(info.project.testDir, "..", "screenshots", info.project.name)
    for (const id of pages) {
      await open(page, id)
      await page.waitForTimeout(id === "data-table" ? 1500 : 800)
      await page.screenshot({ path: `${dir}/${id}.png`, fullPage: true })
    }
    await open(page, "table")
    await page.locator("section", { hasText: "横線と交互の背景色" }).first().screenshot({ path: `${dir}/table-lines-vs-striped.png` })
    await page.locator("section", { hasText: "列と行の数" }).first().screenshot({ path: `${dir}/table-compare.png` })
    await page.locator("section", { hasText: "情報密度" }).first().screenshot({ path: `${dir}/table-density.png` })
    await page.locator("section", { hasText: "行の状態" }).first().screenshot({ path: `${dir}/table-states.png` })
    // Data Table の操作中の画面
    await open(page, "data-table")
    const c = client(page)
    await c.getByRole("button", { name: /その他の条件/ }).click()
    await page.locator("[data-slot=popover-content]").getByRole("checkbox", { name: "関東" }).click()
    await page.keyboard.press("Escape")
    await c.locator("th", { hasText: "月額" }).getByRole("button").click()
    await bodyRows(c).nth(1).getByRole("checkbox").click()
    await bodyRows(c).nth(2).getByRole("checkbox").click()
    await page.mouse.move(0, 0)
    await c.screenshot({ path: `${dir}/data-table-operation.png` })
    await bodyRows(c).nth(4).locator("td").nth(3).click()
    await page.getByTestId("customer-detail").waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/data-table-sheet.png` })
    await page.keyboard.press("Escape")
    await c.getByRole("button", { name: /列の表示/ }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/data-table-columns.png` })
    await page.keyboard.press("Escape")
    await page.getByTestId("state-loading").locator("xpath=..").screenshot({ path: `${dir}/data-table-states.png` })
    await open(page, "chart")
    await page.waitForTimeout(800)
    await page.getByTestId("chart-gallery").screenshot({ path: `${dir}/chart-gallery.png` })
    await page.locator("section", { hasText: "誤解を生まない表現" }).first().screenshot({ path: `${dir}/chart-good-bad.png` })
    await open(page, "pagination")
    await page.locator("article").screenshot({ path: `${dir}/pagination.png` })
  })
})
