import { expect, test, type Locator, type Page } from "@playwright/test"

import { customers } from "../src/data/data-display/customers"
import { settledBox } from "./helpers"
import { collectPageErrors } from "./page-errors"

// Patterns / Data Browsing（Search & Filter、List & Detail、Bulk Actions、View Switching、Data States）の検品。
// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
// 模擬のサーバーは window.__fdBrowseServer で設定する（応答の時間、失敗、件数の有無、一括操作の結果）。
collectPageErrors(test)

const fmt = (n: number) => n.toLocaleString("ja-JP")
const docPages = ["search-filter", "list-detail", "bulk-actions", "view-switching", "data-states"]
const box = async (l: Locator) => (await l.boundingBox())!
const tabKey = (page: Page) => (page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab")

type Server = NonNullable<Window["__fdBrowseServer"]>
const server = <T,>(page: Page, fn: (s: Server) => T) =>
  page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdBrowseServer), fn.toString()) as Promise<T>
const requests = (page: Page, kind: string) => server(page, (s) => s.requests).then((r) => r.filter((x) => x.kind === kind))

const list = (page: Page) => page.getByTestId("app-list")
const rows = (page: Page) => list(page).locator("tbody tr[data-row-id]")
const count = (page: Page) => page.getByTestId("app-list-count")
const search = (page: Page) => page.getByTestId("app-list-search")
const sheet = (page: Page) => page.getByTestId("company-detail")
const pager = (page: Page) => list(page).getByRole("navigation", { name: "ページ送り" })
const main = (page: Page) => page.getByTestId("browsing-main")

async function openApp(page: Page, query = "", { fast = true } = {}) {
  await page.goto(`/#/browsing-app?page=customers${query}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  if (fast) await server(page, (s) => Object.assign(s.latency, { list: 60, detail: 60, activity: 60, update: 60, bulk: 120 }))
  await expect(rows(page).first().or(list(page).locator("[data-slot=empty]"))).toBeVisible()
}

// 契約状況の条件を選ぶ。デスクトップは常に表示した Select（即時適用）、モバイルは Drawer の中（まとめて適用）。
async function selectStatus(page: Page, label: string) {
  if (page.viewportSize()!.width >= 768) {
    await page.getByTestId("app-list-status").click()
    await page.getByRole("option", { name: label, exact: true }).click()
    return
  }
  await page.getByTestId("app-list-more").click()
  const drawer = page.getByTestId("app-list-filters")
  await drawer.getByRole("combobox", { name: "契約状況" }).click()
  await page.getByRole("option", { name: label, exact: true }).click()
  await drawer.getByRole("button", { name: "適用する" }).click()
  await expect(drawer).toBeHidden()
}

const rowCheckbox = (page: Page, i: number) => rows(page).nth(i).getByRole("checkbox")

// ------------------------------------------------------------------ 資料のページ
test.describe("Data Browsing pages", { tag: "@webkit" }, () => {
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
      // 比較の見本は操作の対象にしない（inert）
      for (const mock of await page.locator("figure [inert]").all()) expect(await mock.evaluate((el) => (el as HTMLElement).inert)).toBe(true)
    })
  }

  test("320px and 2560px: pages and the app do not scroll horizontally", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    for (const width of [320, 2560]) {
      await page.setViewportSize({ width, height: 900 })
      for (const id of [...docPages, "browsing-app?page=customers"]) {
        await page.goto(`/#/${id}`)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${id} at ${width}`).toBe(true)
      }
    }
  })
})

// ------------------------------------------------------------------ Search & Filter
test.describe("Search & Filter", () => {
  test("debounce: a burst of typing sends one request with the final text", async ({ page }) => {
    await openApp(page)
    const before = (await requests(page, "list")).length
    await search(page).pressSequentially("Northwind", { delay: 40 })
    await expect(count(page)).toHaveText(/件$/)
    await expect.poll(async () => (await requests(page, "list")).length).toBe(before + 1)
    const last = (await requests(page, "list")).at(-1)!
    expect(JSON.parse(last.key).search).toBe("Northwind")
    await expect(rows(page).first()).toContainText("Northwind")
  })

  test("IME: no search while composing; the committed text is searched", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP（Chromium のみ）で IME を再現するため")
    await openApp(page)
    const before = (await requests(page, "list")).length
    await search(page).focus()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Input.imeSetComposition", { text: "あおば", selectionStart: 3, selectionEnd: 3 })
    await page.waitForTimeout(600)
    expect((await requests(page, "list")).length).toBe(before)
    await cdp.send("Input.insertText", { text: "青葉" })
    await expect.poll(async () => (await requests(page, "list")).map((r) => JSON.parse(r.key).search)).toContain("青葉")
    expect((await requests(page, "list")).map((r) => JSON.parse(r.key).search)).not.toContain("あおば")
  })

  test("input value vs applied search, and a stale response does not overwrite the newer result", async ({ page }) => {
    await page.goto("/#/search-filter")
    const demo = page.getByTestId("sf-search-state")
    const input = page.getByTestId("sf-search-input")
    // 「朝」（1 文字：応答 1500ms）を適用させてから、「朝日」（2 文字：応答 150ms）に変える。
    // 模擬の要求は中止に従わないため、古い「朝」の応答も後から届く。届いても表示しないこと（要求ごとの番号の判定）を確かめる。
    await page.evaluate(() => ((window as unknown as { __fdStaleResponses: string[] }).__fdStaleResponses = []))
    await input.fill("朝")
    await expect(demo.getByTestId("sf-input-value")).toHaveText("朝")
    await expect(demo.getByTestId("sf-applied-value")).toHaveText("（空）")
    await expect(demo.getByTestId("sf-applied-value")).toHaveText("朝")
    await input.fill("朝日")
    await expect(demo.getByTestId("sf-result")).toContainText("「朝日」の結果")
    await expect.poll(() => page.evaluate(() => (window as unknown as { __fdStaleResponses: string[] }).__fdStaleResponses)).toContain("朝")
    const responses = await page.evaluate(() => (window as unknown as { __fdStaleResponses: string[] }).__fdStaleResponses)
    expect(responses.indexOf("朝")).toBeGreaterThan(responses.indexOf("朝日"))
    await expect(demo.getByTestId("sf-result")).toContainText("「朝日」の結果")
    // クライアント側の軽い検索は待たない
    await demo.getByRole("radio", { name: /クライアント側/ }).check()
    await input.fill("青葉")
    await expect(demo.getByTestId("sf-applied-value")).toHaveText("青葉", { timeout: 250 })
  })

  test("immediate filters reset to page 1 and sync to the URL (without the search text)", async ({ page }) => {
    await openApp(page)
    await pager(page).getByRole("button", { name: "次へ" }).click()
    await expect(page).toHaveURL(/p=2/)
    await search(page).fill("株式会社")
    await selectStatus(page, "契約中")
    await expect(page).toHaveURL(/status=active/)
    await expect(page).not.toHaveURL(/p=2/)
    expect(page.url()).not.toContain(encodeURIComponent("株式会社"))
    await expect(pager(page).locator("[aria-current=page]")).toHaveText("1")
    await expect(rows(page).first().locator("td").nth(2)).toContainText("契約中")
  })

  test("batch filters: Escape discards the draft; apply reflects it; chips show only hidden conditions", async ({ page, isMobile }) => {
    test.skip(isMobile, "デスクトップの Sheet（モバイルは Drawer で別に確かめる）")
    await openApp(page)
    const more = page.getByTestId("app-list-more")
    await more.click()
    const filters = page.getByTestId("app-list-filters")
    await filters.getByRole("checkbox", { name: "関東" }).click()
    await page.keyboard.press("Escape")
    await expect(filters).toBeHidden()
    await expect(page.getByTestId("app-list-applied")).toHaveCount(0)
    await more.click()
    await expect(filters.getByRole("checkbox", { name: "関東" })).not.toBeChecked()
    await filters.getByRole("checkbox", { name: "関東" }).click()
    await filters.getByRole("checkbox", { name: "近畿" }).click()
    await page.getByTestId("app-list-apply").click()
    await expect(more).toHaveText(/その他の条件（2）/)
    const applied = page.getByTestId("app-list-applied")
    await expect(applied.getByRole("button", { name: "地域：関東の条件を解除" })).toBeVisible()
    // 常時表示している条件は Chip に重複させない
    await selectStatus(page, "契約中")
    await expect(applied.getByRole("button", { name: /契約状況/ })).toHaveCount(0)
    // 個別の解除
    await applied.getByRole("button", { name: "地域：関東の条件を解除" }).click()
    await expect(applied.getByRole("button", { name: "地域：近畿の条件を解除" })).toBeVisible()
    await expect(applied.getByRole("button", { name: /関東/ })).toHaveCount(0)
    await expect(page).toHaveURL(/regions=%E8%BF%91%E7%95%BF/)
  })

  test("clear all: the label tells whether the search text is included; focus moves to the search box", async ({ page }) => {
    await openApp(page)
    await search(page).fill("株式会社")
    const clear = page.getByTestId("app-list-clear")
    await expect(clear).toHaveText("検索語と条件をすべて解除")
    await clear.click()
    await expect(search(page)).toHaveValue("")
    await expect(search(page)).toBeFocused()
    await expect(page.getByTestId("app-list-applied")).toHaveCount(0)
    await expect(count(page)).toHaveText(`${fmt(customers.length)}件`)
  })

  test("count: exact total, unknown total (no invented number), and stale count while refreshing", async ({ page }) => {
    await openApp(page)
    await expect(count(page)).toHaveText(`${fmt(customers.length)}件`)
    await server(page, (s) => {
      s.countMode = "unknown"
      s.latency.list = 1200
    })
    await selectStatus(page, "契約中")
    // 再取得中の件数は、新しい条件の結果と区別する
    await expect(count(page)).toHaveAttribute("data-stale", "true")
    await expect(page.getByTestId("app-list-announce")).toHaveText("")
    await expect(count(page)).toHaveText("1〜20件目を表示中")
    await expect(count(page)).not.toHaveAttribute("data-stale")
    await expect(pager(page)).not.toContainText("/")
  })

  test("failure and retry", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.failNext.list = true))
    await selectStatus(page, "休止中")
    await expect(list(page).getByRole("alert")).toContainText("顧客の一覧を取得できませんでした")
    await expect(count(page)).toHaveText("件数を取得できませんでした")
    await list(page).getByRole("button", { name: "再試行" }).click()
    await expect(rows(page).first()).toContainText("休止中")
  })

  test("mobile: conditions are in a Drawer with apply", async ({ page, isMobile }) => {
    test.skip(!isMobile, "モバイルの表示")
    await openApp(page)
    await expect(page.getByTestId("app-list-status")).toHaveCount(0)
    await page.getByTestId("app-list-more").click()
    const drawer = page.getByTestId("app-list-filters")
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText("契約状況", { exact: true })).toBeVisible()
    await drawer.getByRole("checkbox", { name: "九州・沖縄" }).click()
    await drawer.getByRole("button", { name: "適用する" }).click()
    await expect(page.getByTestId("app-list-more")).toHaveText(/条件（1）/)
    await expect(page.getByRole("button", { name: "地域：九州・沖縄の条件を解除" })).toBeVisible()
  })
})

// ------------------------------------------------------------------ List & Detail
test.describe("List & Detail", () => {
  test("row click opens the detail; checkbox, phone link, row menu and text selection do not", async ({ page, isMobile }) => {
    await openApp(page)
    // tel: のリンクの移動だけを止める（DataTable の判定より後の、window のバブリングで止める）
    await page.evaluate(() =>
      window.addEventListener("click", (e) => {
        if ((e.target as Element).closest?.("a[href^='tel:']")) e.preventDefault()
      })
    )
    await rowCheckbox(page, 1).click()
    await expect(sheet(page)).toBeHidden()
    if (!isMobile) {
      await rows(page).nth(1).getByRole("link").click()
      await expect(sheet(page)).toBeHidden()
    }
    await rows(page).nth(1).getByRole("button", { name: /の操作$/ }).click()
    await expect(page.getByRole("menuitem", { name: "顧客IDをコピー" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(sheet(page)).toBeHidden()
    if (!isMobile) {
      // 文字の選択（同じセルの中でドラッグ）
      const cell = rows(page).nth(2).locator("td").nth(3)
      const b = await box(cell)
      await page.mouse.move(b.x + 4, b.y + b.height / 2)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width - 4, b.y + b.height / 2, { steps: 5 })
      await page.mouse.up()
      await expect(sheet(page)).toBeHidden()
    }
    await rows(page).nth(3).locator("td").nth(2).click()
    await expect(sheet(page)).toBeVisible()
    await expect(page.getByTestId("company-detail-title")).toHaveText(customers[3].company)
    await expect(rows(page).nth(3)).toHaveAttribute("aria-current", "true")
  })

  test("keyboard: open from the name button, close with Escape, focus returns", async ({ page, isMobile }) => {
    test.skip(isMobile, "ハードウェアキーボードの操作")
    await openApp(page)
    const trigger = rows(page).nth(0).getByRole("button", { name: customers[0].company, exact: true })
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(sheet(page)).toBeVisible()
    await expect(page.getByTestId("company-detail-body")).toHaveAttribute("data-detail-id", customers[0].id)
    await page.keyboard.press("Escape")
    await expect(sheet(page)).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("non-modal sheet: switch rows directly; a slow earlier detail never replaces the current one", async ({ page, isMobile }) => {
    test.skip(isMobile, "モバイルの Sheet は画面の幅で一覧を覆う")
    await openApp(page)
    await server(page, (s) => {
      s.detailLatency[`C-00001`] = 1500
      s.detailLatency[`C-00002`] = 80
    })
    await rows(page).nth(0).getByRole("button", { name: customers[0].company, exact: true }).click()
    await rows(page).nth(1).getByRole("button", { name: customers[1].company, exact: true }).click()
    await expect(page.getByTestId("company-detail-title")).toHaveText(customers[1].company)
    await expect(page.getByTestId("company-detail-body")).toHaveAttribute("data-detail-id", "C-00002")
    await page.waitForTimeout(1700)
    await expect(page.getByTestId("company-detail-body")).toHaveAttribute("data-detail-id", "C-00002")
    // 背景は暗くしない（非モーダル）
    await expect(page.locator("[data-slot=sheet-overlay]")).toHaveCount(0)
    // 前後の移動は一覧の順。表示中のページの外は無効
    await sheet(page).getByRole("button", { name: "次の顧客" }).click()
    await expect(page.getByTestId("company-detail-title")).toHaveText(customers[2].company)
    await rows(page).nth(19).getByRole("button", { name: customers[19].company, exact: true }).click()
    await expect(sheet(page).getByRole("button", { name: "次の顧客" })).toBeDisabled()
    await expect(sheet(page)).toContainText("580件中 20件目")
  })

  test("modal edit: unsaved changes ask to discard; save failure stays in the sheet; success updates", async ({ page }) => {
    await openApp(page)
    await rows(page).nth(0).getByRole("button", { name: customers[0].company, exact: true }).click()
    await expect(page.getByTestId("company-detail-body")).toHaveAttribute("data-detail-id", "C-00001")
    await sheet(page).getByRole("button", { name: "編集" }).click()
    const edit = page.getByTestId("company-edit")
    await expect(edit).toBeVisible()
    await expect(page.locator("[data-slot=sheet-overlay]")).toBeVisible()
    await edit.getByTestId("company-edit-note").fill("検品のメモ")
    await page.keyboard.press("Escape")
    const discard = page.getByTestId("company-edit-discard")
    await expect(discard).toBeVisible()
    await discard.getByRole("button", { name: "編集を続ける" }).click()
    await expect(edit).toBeVisible()
    await server(page, (s) => (s.failNext.update = true))
    await edit.getByRole("button", { name: "保存する" }).click()
    await expect(page.getByTestId("company-edit-error")).toContainText("保存できませんでした")
    await expect(edit.getByTestId("company-edit-note")).toHaveValue("検品のメモ")
    await edit.getByRole("button", { name: "保存する" }).click()
    await expect(edit).toBeHidden()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "保存しました" })).toBeVisible()
    await expect(sheet(page)).toContainText("検品のメモ")
  })

  test("detail page and back: conditions, page, scroll and focus are restored (link and browser back)", async ({ page, isMobile }) => {
    await openApp(page)
    await selectStatus(page, "契約中")
    await pager(page).getByRole("button", { name: "次へ" }).click()
    await expect(page).toHaveURL(/p=2/)
    await expect(pager(page).locator("[aria-current=page]")).toHaveText("2")
    await search(page).fill("")
    const target = rows(page).nth(8)
    const name = (await target.locator("[data-slot=data-table-row-trigger]").textContent())!.trim()
    await main(page).evaluate((el) => el.scrollTo({ top: 360 }))
    await expect.poll(() => main(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(300)
    const scrolled = await main(page).evaluate((el) => el.scrollTop)
    await target.getByRole("button", { name: /の操作$/ }).click()
    await page.getByRole("menuitem", { name: "詳細ページを開く" }).click()
    await expect(page.getByTestId("company-page")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)
    // Breadcrumb で戻る（一覧から開いたため、履歴を戻る）
    await page.getByTestId("company-page-back").click()
    await expect(pager(page).locator("[aria-current=page]")).toHaveText("2")
    await expect(page).toHaveURL(/status=active/)
    await expect(page.getByRole("button", { name, exact: true })).toBeFocused()
    expect(Math.abs((await main(page).evaluate((el) => el.scrollTop)) - scrolled)).toBeLessThan(80)
    // ブラウザの進む・戻る
    await page.goForward()
    await expect(page.getByTestId("company-page")).toBeVisible()
    await page.goBack()
    await expect(page.getByRole("button", { name, exact: true })).toBeFocused()
    void isMobile
  })

  test("when the row was deleted, focus moves to the row at the same position", async ({ page }) => {
    await openApp(page)
    const target = rows(page).nth(4)
    await target.getByRole("button", { name: /の操作$/ }).click()
    await page.getByRole("menuitem", { name: "詳細ページを開く" }).click()
    await expect(page.getByTestId("company-page")).toBeVisible()
    await server(page, (s) => s.remove("hq", "C-00005"))
    await page.goBack()
    await expect(page.getByRole("button", { name: customers[5].company, exact: true })).toBeFocused()
    await expect(rows(page).nth(4)).toHaveAttribute("data-row-id", "C-00006")
  })

  test("detail page: a partial failure shows the rest and retries only that section", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.activityAlwaysFails = true))
    await page.goto("/#/browsing-app?page=customer&id=C-00002")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(customers[1].company)
    const error = page.getByTestId("company-activity-error")
    await expect(error).toBeVisible()
    await expect(error).toHaveAttribute("role", "alert")
    await expect(page.getByRole("heading", { name: "契約" })).toBeVisible()
    await server(page, (s) => (s.activityAlwaysFails = false))
    await error.getByRole("button", { name: "再試行" }).click()
    await expect(error).toBeHidden()
    await expect(page.getByTestId("company-activity").locator("li").first()).toBeVisible()
  })

  test("horizontal scroll cues: only toward hidden content, gone at the edge, follow the width", async ({ page }) => {
    await page.goto("/#/list-detail")
    const demo = page.getByTestId("ld-scroll-demo")
    const area = demo.locator("[data-slot=table-scroll-area]")
    const container = demo.locator("[data-slot=table-container]")
    await expect(area).toHaveAttribute("data-scroll-end", "true")
    await expect(area).not.toHaveAttribute("data-scroll-start")
    const cues = area.locator("[data-slot=table-scroll-cue]")
    expect(await cues.first().evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none")
    // スクロールバーは隠さない
    expect(await container.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto")
    await container.evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
    await expect(area).toHaveAttribute("data-scroll-start", "true")
    await expect(area).not.toHaveAttribute("data-scroll-end")
    await page.getByRole("radio", { name: "640px" }).check()
    await page.getByRole("radio", { name: "幅いっぱい" }).check()
    // 手がかりの有無は、実際に横にスクロールできるかと一致する（幅いっぱいでは、デスクトップは収まり、モバイルは収まらない）
    await expect(demo).toHaveCSS("width", /px$/)
    const canScroll = await container.evaluate((el) => el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
    await expect.poll(async () => (await area.getAttribute("data-scroll-end")) === "true").toBe(canScroll)
  })

  test("pinned name column stays while scrolling; the start cue sits at its edge; follows the sidebar", async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 900, height: 900 })
    await openApp(page)
    const container = list(page).locator("[data-slot=table-container]")
    const area = list(page).locator("[data-slot=table-scroll-area]")
    await expect(list(page).locator("th[data-pinned=start]")).toHaveCount(2)
    const name = rows(page).nth(0).locator("td").nth(1)
    const before = await box(name)
    await container.evaluate((el) => el.scrollTo({ left: 200 }))
    await expect(area).toHaveAttribute("data-scroll-start", "true")
    expect(Math.abs((await box(name)).x - before.x)).toBeLessThan(1)
    const startCue = area.locator('[data-edge="start"]')
    expect(Math.abs((await box(startCue)).x - (before.x + before.width))).toBeLessThan(2)
    if (!isMobile) {
      const width = (await box(container)).width
      await page.getByTestId("sidebar-collapse").click()
      await expect.poll(async () => (await box(container)).width).toBeGreaterThan(width + 100)
      // 幅が変わった後も、手がかりは実際にスクロールできる方向と一致する
      await expect
        .poll(async () => (await area.getAttribute("data-scroll-end")) === "true")
        .toBe(await container.evaluate((el) => el.scrollLeft < el.scrollWidth - el.clientWidth - 1))
    }
  })
})

// ------------------------------------------------------------------ Bulk Actions
test.describe("Bulk Actions", () => {
  test("page selection, indeterminate, and selection across pages by ID", async ({ page }) => {
    await openApp(page)
    const header = list(page).getByRole("checkbox", { name: "このページの行をすべて選択" })
    await rowCheckbox(page, 0).click()
    await expect(header).toHaveAttribute("aria-checked", "mixed")
    await rowCheckbox(page, 1).click()
    await pager(page).getByRole("button", { name: "次へ" }).click()
    await expect(rows(page).first()).toHaveAttribute("data-row-id", "C-00021")
    await rowCheckbox(page, 0).click()
    const bar = list(page).locator("[data-slot=data-table-selection-bar]")
    await expect(bar).toContainText("3件を選択中")
    await expect(bar).toContainText("表示していない 2件を含む")
    // 条件を変えても、ID で選んだ行は残る
    await search(page).fill("株式会社")
    await expect(bar).toContainText("3件を選択中")
  })

  test("select all matching is a separate action, exclusions are counted, a condition change clears it with a notice", async ({ page }) => {
    await openApp(page)
    await list(page).getByRole("checkbox", { name: "このページの行をすべて選択" }).click()
    const bar = list(page).locator("[data-slot=data-table-selection-bar]")
    await expect(bar).toContainText("20件を選択中")
    await bar.getByRole("button", { name: `検索条件に一致する ${fmt(customers.length)}件をすべて選択` }).click()
    await expect(bar).toContainText(`検索条件に一致する ${fmt(customers.length)}件をすべて選択中`)
    await rowCheckbox(page, 0).click()
    await expect(bar).toContainText(`検索条件に一致する ${fmt(customers.length)}件のうち ${fmt(customers.length - 1)}件を選択中`)
    // 次のページの行も選ばれている
    await pager(page).getByRole("button", { name: "次へ" }).click()
    await expect(rowCheckbox(page, 0)).toBeChecked()
    await search(page).fill("株式会社")
    await expect(page.getByTestId("app-list-selection-notice")).toHaveText("検索条件を変更したため、検索結果全件の選択を解除しました")
    await expect(bar).toHaveCount(0)
  })

  test("detail viewing and bulk selection are independent", async ({ page, isMobile }) => {
    test.skip(isMobile, "モバイルの Sheet は一覧を覆う")
    await openApp(page)
    await rows(page).nth(0).getByRole("button", { name: customers[0].company, exact: true }).click()
    await rowCheckbox(page, 1).click()
    await expect(rows(page).nth(0)).toHaveAttribute("data-active", "true")
    await expect(rows(page).nth(0)).not.toHaveAttribute("data-state", "selected")
    await expect(rows(page).nth(1)).toHaveAttribute("data-state", "selected")
    await expect(rows(page).nth(1)).not.toHaveAttribute("data-active")
  })

  async function runOwnerChange(page: Page, owner = "田中 翔") {
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: owner }).click()
  }

  test("all succeeded: selection cleared, result kept, undo offered; no double execution", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.latency.bulk = 800))
    await rowCheckbox(page, 0).click()
    await rowCheckbox(page, 1).click()
    await runOwnerChange(page)
    // 実行中は操作のボタンを置かない（二重実行を防ぐ）
    await expect(list(page).locator("[data-slot=bulk-run-status]")).toBeVisible()
    await expect(page.getByTestId("app-list-bulk-owner")).toHaveCount(0)
    await expect(list(page).getByRole("progressbar")).toBeVisible()
    // すべて完了：選択を解除し、Toast で知らせる（結果の Alert は出さない）。押したボタンが消えても、フォーカスは <body> に落ちない
    const toast = page.locator("[data-slot=toast]").filter({ hasText: "2件の担当者の変更が完了しました" })
    await expect(toast).toBeVisible()
    await expect(list(page).locator("[data-slot=bulk-result]")).toHaveCount(0)
    await expect(list(page).locator("[data-slot=data-table-selection-bar]")).toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
    expect((await requests(page, "bulk")).length).toBe(1)
    expect(await server(page, (s) => s.processed)).toEqual(["C-00001", "C-00002"])
    await expect(rows(page).nth(0).locator("td").nth(3)).toHaveText("田中 翔")
    // 元に戻す（一括操作と同じ実行の仕組みで、結果を確かめる）
    await toast.getByRole("button", { name: "元に戻す" }).click()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "担当者の変更の取り消しが完了しました" })).toBeVisible()
    await expect(rows(page).nth(0).locator("td").nth(3)).toHaveText(customers[0].owner)
  })

  test("the target is fixed when the run starts, even if selection and conditions change", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.latency.bulk = 1200))
    for (const i of [0, 1, 2]) await rowCheckbox(page, i).click()
    await runOwnerChange(page)
    await list(page).getByRole("button", { name: "選択を解除" }).click()
    await search(page).fill("株式会社")
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "3件の担当者の変更が完了しました" })).toBeVisible()
    expect(await server(page, (s) => s.processed)).toEqual(["C-00001", "C-00002", "C-00003"])
  })

  test("partial failure: failed rows stay selected, retry only the retryable failures", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.bulkMode = "partial"))
    for (let i = 0; i < 9; i++) await rowCheckbox(page, i).click()
    await runOwnerChange(page)
    const result = list(page).locator("[data-slot=bulk-result]")
    await expect(result).toContainText("9件のうち、6件の担当者の変更が完了しました")
    await expect(result).toHaveAttribute("role", "alert")
    await expect(result.locator("[data-slot=bulk-result-failed] li")).toHaveCount(3)
    await expect(result).toContainText("権限がありません")
    const bar = list(page).locator("[data-slot=data-table-selection-bar]")
    await expect(bar).toContainText("3件を選択中")
    await result.getByRole("button", { name: "失敗した 2件を再試行" }).click()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "2件の担当者の変更が完了しました" })).toBeVisible()
    const last = JSON.parse((await requests(page, "bulk")).at(-1)!.key)
    expect(last).toMatchObject({ kind: "ids", ids: ["C-00003", "C-00006"] })
    // 成功した行は重複して実行しない
    const processed = await server(page, (s) => s.processed)
    expect(new Set(processed).size).toBe(processed.length)
    await expect(bar).toContainText("1件を選択中")
  })

  test("all failed keeps the selection; unknown results are not retried", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.bulkMode = "fail"))
    await rowCheckbox(page, 0).click()
    await rowCheckbox(page, 1).click()
    await runOwnerChange(page)
    const result = list(page).locator("[data-slot=bulk-result]")
    await expect(result).toContainText("2件の担当者の変更がすべて失敗しました")
    await expect(list(page).locator("[data-slot=data-table-selection-bar]")).toContainText("2件を選択中")
    await result.getByRole("button", { name: "結果を閉じる" }).click()
    await list(page).getByRole("button", { name: "選択を解除" }).click()

    await server(page, (s) => (s.bulkMode = "unknown"))
    for (const i of [4, 5, 6, 7]) await rowCheckbox(page, i).click()
    await runOwnerChange(page)
    await expect(result).toContainText("結果が不明")
    await expect(result.locator("[data-slot=bulk-result-unknown]")).toBeVisible()
    await expect(result.getByRole("button", { name: /再試行/ })).toHaveCount(0)
    await expect(result.getByRole("button", { name: "最新の状態を確認" })).toBeVisible()
    await expect(list(page).locator("[data-slot=data-table-selection-bar]")).toHaveCount(0)
  })

  test("delete: Alert Dialog shows the target, count and irreversibility", async ({ page }) => {
    await openApp(page)
    await rowCheckbox(page, 0).click()
    await rowCheckbox(page, 1).click()
    await page.getByTestId("app-list-bulk-more").click()
    await page.getByRole("menuitem", { name: "削除" }).click()
    const dialog = page.getByTestId("app-list-confirm-delete")
    await expect(dialog.getByRole("heading")).toHaveText("2件の顧客を削除しますか？")
    await expect(dialog).toContainText(customers[0].company)
    await expect(dialog).toContainText("元に戻せません")
    await dialog.getByRole("button", { name: "2件を削除する" }).click()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "2件の削除が完了しました" })).toBeVisible()
    await expect(rows(page).first()).toHaveAttribute("data-row-id", "C-00003")
    await expect(page.locator(":focus")).not.toHaveCount(0)
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
  })

  test("mobile: the bulk bar sits at the bottom with the safe area and hides neither rows nor pagination", async ({ page, isMobile }) => {
    test.skip(!isMobile, "モバイルの表示")
    await openApp(page)
    await rowCheckbox(page, 0).click()
    const bar = page.getByTestId("app-list-bottom-bar")
    await expect(bar).toBeVisible()
    const vh = page.viewportSize()!.height
    expect((await box(bar)).y + (await box(bar)).height).toBeLessThanOrEqual(vh + 1)
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--toast-offset-bottom"))).toMatch(/px$/)
    await main(page).evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await page.waitForTimeout(200)
    const p = await box(pager(page))
    expect(p.y + p.height).toBeLessThanOrEqual((await box(bar)).y + 1)
    // 状態の行には件数を残す
    await expect(count(page)).toBeVisible()
  })
})

// ------------------------------------------------------------------ View Switching
test.describe("View Switching", () => {
  const views = (page: Page) => page.getByRole("radiogroup", { name: "表示形式" })

  test("switch between table, kanban and calendar; search and selection are kept", async ({ page }) => {
    await openApp(page)
    await search(page).fill("株式会社")
    await expect(count(page)).not.toHaveText(`${fmt(customers.length)}件`)
    await rowCheckbox(page, 0).click()
    await views(page).getByRole("radio", { name: "カンバン" }).click()
    await expect(page.getByTestId("app-list-board")).toBeVisible()
    await expect(page).toHaveURL(/view=board/)
    await expect(search(page)).toHaveValue("株式会社")
    await expect(page.getByTestId("app-list-selection-kept")).toContainText("1件を選択中。一括操作は表で行えます。")
    const boardReq = (await requests(page, "list")).at(-1)!
    expect(boardReq.key).toContain("株式会社")
    await views(page).getByRole("radio", { name: "カレンダー" }).click()
    await expect(page.getByTestId("app-list-calendar")).toBeVisible()
    await page.getByTestId("app-list-selection-kept").getByRole("button", { name: "表に切り替える" }).click()
    await expect(list(page).locator("[data-slot=data-table-selection-bar]")).toContainText("1件を選択中")
    // 表示形式の切り替えはデータを変更しない
    expect((await requests(page, "update")).length + (await requests(page, "bulk")).length).toBe(0)
  })

  test("placement: directly above the data area, aligned to its right edge", async ({ page }) => {
    await openApp(page)
    const sw = await box(views(page))
    const area = await box(list(page).locator("[data-slot=table-scroll-area]"))
    expect(sw.y + sw.height).toBeLessThanOrEqual(area.y)
    expect(area.y - (sw.y + sw.height)).toBeLessThan(40)
    expect(Math.abs(sw.x + sw.width - (area.x + area.width))).toBeLessThan(2)
    // Page Header の操作の領域には置かない
    await expect(page.locator("[data-slot=page-header] [data-slot=view-switcher]")).toHaveCount(0)
  })

  test("view-specific state: table page and calendar month come back", async ({ page }) => {
    await openApp(page)
    await pager(page).getByRole("button", { name: "次へ" }).click()
    await views(page).getByRole("radio", { name: "カレンダー" }).click()
    await page.getByRole("button", { name: "次の月" }).click()
    await expect(page.getByRole("heading", { name: "2027年1月" })).toBeVisible()
    await views(page).getByRole("radio", { name: "表" }).click()
    await expect(pager(page).locator("[aria-current=page]")).toHaveText("2")
    await views(page).getByRole("radio", { name: "カレンダー" }).click()
    await expect(page.getByRole("heading", { name: "2027年1月" })).toBeVisible()
    await expect(page.getByTestId("app-list-calendar-range")).toContainText("表示期間の中だけ")
  })

  test("keyboard and names: one Tab stop, arrow keys select, checked state, icon-only names", async ({ page, isMobile }) => {
    test.skip(isMobile, "ハードウェアキーボードの操作")
    await page.goto("/#/view-switching")
    const group = page.getByRole("radiogroup", { name: "表示形式（ラベルあり）" })
    const table = group.getByRole("radio", { name: "表" })
    await table.focus()
    await page.keyboard.press("ArrowRight")
    await expect(group.getByRole("radio", { name: "カンバン" })).toBeFocused()
    await expect(group.getByRole("radio", { name: "カンバン" })).toHaveAttribute("aria-checked", "true")
    await page.keyboard.press("End")
    await expect(group.getByRole("radio", { name: "カレンダー" })).toBeChecked()
    await page.keyboard.press(tabKey(page))
    // 次の Tab は、同じグループの別の選択肢ではなく、次のグループへ移る
    await expect(page.getByRole("radiogroup", { name: "表示形式（アイコンだけ）" }).getByRole("radio", { name: "カレンダー" })).toBeFocused()
    const iconOnly = page.getByRole("radiogroup", { name: "表示形式（アイコンだけ）" })
    for (const n of ["表", "カンバン", "カレンダー"]) await expect(iconOnly.getByRole("radio", { name: n })).toHaveCount(1)
    await iconOnly.getByRole("radio", { name: "表" }).hover()
    await expect(page.locator("[data-slot=tooltip-content][data-open]")).toHaveText("表")
  })

  test("five views: per-view state (page, group, month) and the active record are kept", async ({ page }) => {
    await page.goto("/#/view-switching")
    const demo = page.getByTestId("vs-five")
    await demo.locator("tbody tr").nth(1).locator("td").nth(2).click()
    await expect(page.getByTestId("vs-five-active")).toContainText("選択中のレコード")
    const active = await page.getByTestId("vs-five-active").textContent()
    for (const name of ["リスト", "カード", "カンバン", "カレンダー", "表"]) {
      await demo.getByRole("button", { name: /表示形式/ }).click()
      await page.getByRole("menuitemradio", { name }).click()
      await expect(page.getByTestId("vs-five-active")).toHaveText(active!)
    }
    await demo.getByRole("button", { name: /表示形式/ }).click()
    await page.getByRole("menuitemradio", { name: "カンバン" }).click()
    await page.getByTestId("vs-group").click()
    await page.getByRole("option", { name: "担当者" }).click()
    await demo.getByRole("button", { name: /表示形式/ }).click()
    await page.getByRole("menuitemradio", { name: "リスト" }).click()
    await demo.getByRole("button", { name: /表示形式/ }).click()
    await page.getByRole("menuitemradio", { name: "カンバン" }).click()
    await expect(page.getByTestId("vs-group")).toHaveText(/担当者/)
  })

  test("brand color does not paint the selected view; mobile uses icon-only and wraps", async ({ page, isMobile }) => {
    await page.goto("/#/view-switching")
    const selected = page.getByRole("radiogroup", { name: "表示形式（ラベルあり）" }).getByRole("radio", { checked: true })
    const before = await selected.evaluate((el) => getComputedStyle(el).backgroundColor)
    await page.getByRole("radio", { name: "紫" }).check()
    expect(await selected.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(before)
    if (isMobile) {
      await openApp(page)
      const radios = page.getByRole("radiogroup", { name: "表示形式" }).getByRole("radio")
      await expect(radios.first()).toHaveAccessibleName("表")
      await expect(radios.first().locator("span:not([aria-hidden])")).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  })
})

// ------------------------------------------------------------------ Data States
test.describe("Data States", () => {
  test("first load: skeleton rows match the page size, appear only after 200ms, aria-busy", async ({ page }) => {
    await page.goto("/#/browsing-app?page=customers")
    await server(page, (s) => (s.latency.list = 2000))
    await page.getByTestId("browsing-controls").getByRole("button", { name: "一覧を作り直す" }).click()
    const reveal = list(page).locator("[data-slot=loading-reveal]")
    await expect(reveal).toHaveAttribute("data-loading", "true")
    await expect(list(page).locator("[data-slot=data-table-loading-row]")).toHaveCount(20)
    await expect(list(page).locator("table")).toHaveAttribute("aria-busy", "true")
    await expect(reveal).toHaveAttribute("data-revealed", "true")
    expect(await list(page).locator("[data-slot=data-table-loading-row] [data-slot=skeleton]").first().evaluate((el) => getComputedStyle(el).visibility)).toBe("visible")
    const loadingHeight = (await box(reveal)).height
    await expect(rows(page).first()).toBeVisible({ timeout: 4000 })
    const loadedHeight = (await box(reveal)).height
    // レイアウトシフト：読み込みの前後で領域の高さを大きく変えない
    expect(Math.abs(loadedHeight - loadingHeight) / loadedHeight).toBeLessThan(0.25)
  })

  test("a load under 200ms never shows the skeleton", async ({ page }) => {
    await page.goto("/#/data-states")
    const demo = page.getByTestId("ds-states")
    await expect(demo.getByTestId("ds-state-name")).toContainText("取得成功")
    await page.evaluate(() => {
      ;(window as unknown as { __revealed: boolean }).__revealed = false
      const el = document.querySelector("[data-testid=ds-region]")!
      new MutationObserver(() => {
        if (el.hasAttribute("data-revealed")) (window as unknown as { __revealed: boolean }).__revealed = true
      }).observe(el, { attributes: true })
    })
    await demo.getByRole("radio", { name: "短い（100ms）" }).check()
    await expect(demo.getByTestId("ds-state-name")).toContainText("取得成功")
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => (window as unknown as { __revealed: boolean }).__revealed)).toBe(false)
  })

  test("refreshing keeps rows, locks dependent operations immediately; announce only the settled count", async ({ page }) => {
    await openApp(page)
    await rowCheckbox(page, 0).click()
    await server(page, (s) => (s.latency.list = 1500))
    await selectStatus(page, "契約中")
    await expect(rows(page).first()).toBeVisible()
    await expect(list(page).locator("table")).toHaveAttribute("aria-busy", "true")
    await expect(rowCheckbox(page, 1)).toBeDisabled()
    await expect(list(page).locator("[data-slot=data-table-selection-disabled]")).toBeVisible()
    await expect(list(page).locator("[data-slot=data-refresh-indicator]")).toHaveAttribute("data-visible", "true")
    await expect(page.getByTestId("app-list-announce")).toHaveText("")
    await expect(rowCheckbox(page, 1)).toBeEnabled({ timeout: 3000 })
    await expect(list(page).locator("[data-slot=data-refresh-indicator]")).not.toHaveAttribute("data-visible")
  })

  test("refresh failure keeps the previous data and is distinguished from success", async ({ page }) => {
    await page.goto("/#/data-states")
    const demo = page.getByTestId("ds-states")
    await demo.getByRole("radio", { name: "再取得に失敗" }).check()
    await expect(demo.getByTestId("ds-state-name")).toContainText("取得成功")
    await demo.getByRole("button", { name: "再取得する" }).click()
    await expect(demo.getByTestId("ds-refresh-error")).toBeVisible()
    await expect(demo.getByTestId("ds-state-name")).toContainText("再取得の失敗")
    await expect(demo.locator("tbody tr[data-row-id]")).toHaveCount(6)
  })

  test("empty vs no results vs error vs forbidden", async ({ page }) => {
    await openApp(page, "&ws=new")
    const empty = list(page).locator("[data-slot=empty]")
    await expect(empty).toHaveAttribute("data-status", "empty")
    await expect(empty).toContainText("顧客はまだ登録されていません")
    // Page Header の「顧客を登録」と重複させない
    await expect(empty.getByRole("button")).toHaveCount(0)
    await page.goto("/#/browsing-app?page=customers")
    await search(page).fill("存在しない会社")
    await expect(list(page).locator("[data-slot=empty]")).toHaveAttribute("data-status", "no-results")
    await expect(list(page).locator("[data-slot=empty]").getByRole("button", { name: "検索語と条件をすべて解除" })).toBeVisible()
    await page.goto("/#/data-states")
    const demo = page.getByTestId("ds-states")
    await demo.getByRole("radio", { name: "権限がない" }).check()
    await expect(demo.getByRole("alert")).toContainText("権限がありません")
    await expect(demo.getByRole("alert").getByRole("button")).toHaveCount(0)
    await demo.getByRole("radio", { name: "取得失敗" }).check()
    await expect(demo.getByRole("alert").getByRole("button", { name: "再試行" })).toBeVisible()
  })

  test("partial failure and missing values: 0 is 0, missing is not 0", async ({ page }) => {
    await page.goto("/#/data-states")
    const partial = page.getByTestId("ds-partial")
    await expect(page.getByTestId("ds-sales-error")).toBeVisible()
    await expect(page.getByTestId("ds-sales")).toContainText("取得できません")
    await expect(partial).toContainText("328件")
    await expect(partial).toContainText("0円")
    await page.getByTestId("ds-sales-error").getByRole("button", { name: "再試行" }).click()
    await expect(page.getByTestId("ds-sales")).toContainText("4,820万円")
    const missing = page.getByTestId("ds-missing")
    await expect(missing.locator("tr", { hasText: "実際の 0" }).locator("td").nth(1)).toHaveText("0円")
    await expect(missing.locator("tr", { hasText: "未登録" }).locator("td").nth(1)).toHaveText("—未登録")
    await expect(missing.locator("tr", { hasText: "取得できない" }).locator("td").nth(1)).toHaveText("取得できません")
    await expect(missing.locator("tr", { hasText: "取得中" }).locator("[data-state=loading]")).toBeVisible()
  })

  test("real progress and cancel", async ({ page }) => {
    await page.goto("/#/data-states")
    const demo = page.getByTestId("ds-long")
    await demo.getByRole("button", { name: "580件の CSV を作成する" }).click()
    const bar = demo.getByRole("progressbar")
    await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow"))).toBeGreaterThan(0)
    await demo.getByRole("button", { name: "作成を中止" }).click()
    await expect(demo.getByRole("status")).toContainText("中止しました")
  })

  test("account / workspace switch discards old data immediately", async ({ page }) => {
    await page.goto("/#/data-states")
    const list_ = page.getByTestId("ds-account-list")
    await expect(list_).toHaveAttribute("data-status", "ready")
    await page.getByTestId("ds-account-select").click()
    await page.getByRole("option", { name: "株式会社サンプル（九州支店）" }).click()
    await expect(list_).toHaveAttribute("data-status", "loading")
    await expect(list_).not.toContainText("（四国）")
    await expect(list_).toContainText("九州・沖縄")

    await openApp(page)
    await rowCheckbox(page, 0).click()
    await server(page, (s) => (s.latency.list = 1500))
    await page.getByTestId("browsing-workspace").click()
    await page.getByRole("option", { name: "九州支店" }).click()
    await expect(rows(page)).toHaveCount(0)
    await expect(list(page).locator("[data-slot=data-table-selection-bar]")).toHaveCount(0)
    await expect(rows(page).first()).toHaveAttribute("data-row-id", /^K-/, { timeout: 4000 })
  })

  test("reduced motion: skeleton and refresh spinner do not animate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/#/data-states")
    const missing = page.getByTestId("ds-missing")
    const sk = missing.locator("[data-slot=skeleton]")
    expect(await sk.evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
    await page.getByTestId("ds-states").getByRole("radio", { name: "長い（3 秒）" }).check()
    const loadingSkeleton = page.getByTestId("ds-states").locator("[data-slot=data-table-loading-row] [data-slot=skeleton]").first()
    expect(await loadingSkeleton.evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
    // 再取得中の Spinner（DataRefreshIndicator）も回転しない
    await openApp(page)
    await server(page, (s) => (s.latency.list = 1500))
    await search(page).fill("株式会社")
    const spinner = list(page).locator("[data-slot=data-refresh-indicator] svg")
    await expect(list(page).locator("[data-slot=data-refresh-indicator]")).toHaveAttribute("data-visible", "true")
    expect(await spinner.evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
  })
})

// ------------------------------------------------------------------ 独立したレビューの指摘の検品
test.describe("Review follow-ups", () => {
  test("switching the workspace during a run discards the run and its result; no selection is carried over", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => {
      s.latency.bulk = 1500
      s.bulkMode = "partial"
    })
    for (let i = 0; i < 6; i++) await rowCheckbox(page, i).click()
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    await expect(list(page).locator("[data-slot=bulk-run-status]")).toBeVisible()
    await page.getByTestId("browsing-workspace").click()
    await page.getByRole("option", { name: "九州支店" }).click()
    await expect(rows(page).first()).toHaveAttribute("data-row-id", /^K-/)
    await page.waitForTimeout(1800)
    await expect(list(page).locator("[data-slot=bulk-result]")).toHaveCount(0)
    await expect(list(page).locator("[data-slot=data-table-selection-bar]")).toHaveCount(0)
  })

  test("deleting every row of the last page moves back a page instead of showing an empty state", async ({ page }) => {
    await openApp(page, "&p=29")
    await expect(rows(page).first()).toHaveAttribute("data-row-id", "C-00561")
    await list(page).getByRole("checkbox", { name: "このページの行をすべて選択" }).click()
    await page.getByTestId("app-list-bulk-more").click()
    await page.getByRole("menuitem", { name: "削除" }).click()
    await page.getByTestId("app-list-confirm-delete").getByRole("button", { name: /を削除する$/ }).click()
    await expect(rows(page).first()).toHaveAttribute("data-row-id", "C-00541")
    await expect(page).toHaveURL(/p=28/)
    await expect(rows(page)).toHaveCount(20)
    await expect(list(page).locator("[data-slot=empty]")).toHaveCount(0)
  })

  test("a rejected request for all matching rows keeps the selection and can run again", async ({ page }) => {
    await openApp(page)
    await list(page).getByRole("checkbox", { name: "このページの行をすべて選択" }).click()
    const bar = list(page).locator("[data-slot=data-table-selection-bar]")
    await bar.getByRole("button", { name: /をすべて選択$/ }).click()
    await server(page, (s) => (s.bulkMode = "request-fail"))
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    const result = list(page).locator("[data-slot=bulk-result]")
    await expect(result).toContainText("担当者の変更を実行できませんでした")
    await expect(bar).toContainText(`検索条件に一致する ${fmt(customers.length)}件をすべて選択中`)
    await server(page, (s) => (s.bulkMode = "success"))
    await result.getByRole("button", { name: "もう一度実行" }).click()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: `${fmt(customers.length)}件の担当者の変更が完了しました` })).toBeVisible()
    expect(await server(page, (s) => s.processed.length)).toBe(customers.length)
  })

  test("all matching with an unknown total: no invented count; a lost connection is not retried", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.countMode = "unknown"))
    await selectStatus(page, "試用中")
    await expect(count(page)).toHaveText("1〜20件目を表示中")
    await list(page).getByRole("checkbox", { name: "このページの行をすべて選択" }).click()
    const bar = list(page).locator("[data-slot=data-table-selection-bar]")
    await bar.getByRole("button", { name: "検索条件に一致するすべてのデータを選択" }).click()
    await expect(bar).toContainText("検索条件に一致するすべてのデータを選択中")
    await expect(bar).not.toContainText(/\d+件をすべて選択中/)
    await server(page, (s) => (s.bulkMode = "request-unknown"))
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    const result = list(page).locator("[data-slot=bulk-result]")
    await expect(result).toContainText("担当者の変更の結果を確認できませんでした")
    await expect(result.getByRole("button", { name: /再試行|もう一度実行/ })).toHaveCount(0)
    await expect(result.getByRole("button", { name: "最新の状態を確認" })).toBeVisible()
    await expect(bar).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ v0.1 の最終調整の検品
// ほかのワークスペースの行（K- または C-）が、1 回の描画でも表示されたかを記録する。
async function watchRowPrefixes(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __fdSeenRows: string[] }
    w.__fdSeenRows = []
    const record = () => {
      for (const el of document.querySelectorAll<HTMLElement>("[data-testid=app-list] [data-row-id]")) w.__fdSeenRows.push(el.dataset.rowId!)
    }
    new MutationObserver(record).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-row-id"] })
  })
}
const seenRows = (page: Page) => page.evaluate(() => (window as unknown as { __fdSeenRows: string[] }).__fdSeenRows)

async function switchWorkspace(page: Page, name: string) {
  await page.getByTestId("browsing-workspace").click()
  await page.getByRole("option", { name }).click()
}

test.describe("v0.1: scope boundaries and races", () => {
  test("A → B → A quickly: rows of the other workspace never appear, and the latest scope wins", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.latency.list = 700))
    await switchWorkspace(page, "九州支店")
    await expect(rows(page)).toHaveCount(0)
    await watchRowPrefixes(page)
    await switchWorkspace(page, "本社営業部")
    await expect(rows(page).first()).toHaveAttribute("data-row-id", "C-00001", { timeout: 4000 })
    await page.waitForTimeout(900)
    // 九州支店の要求の応答が後から届いても、本社営業部の一覧を上書きしない
    expect((await seenRows(page)).filter((id) => id.startsWith("K-"))).toEqual([])
    await expect(rows(page).first()).toHaveAttribute("data-row-id", "C-00001")
  })

  test("switching the workspace while the table is not shown (enabled: false) does not show the old workspace's rows", async ({ page }) => {
    await openApp(page)
    await page.getByRole("radiogroup", { name: "表示形式" }).getByRole("radio", { name: "カンバン" }).click()
    await expect(page.getByTestId("app-list-board")).toBeVisible()
    await server(page, (s) => (s.latency.list = 600))
    await switchWorkspace(page, "九州支店")
    await watchRowPrefixes(page)
    await page.getByRole("radiogroup", { name: "表示形式" }).getByRole("radio", { name: "表" }).click()
    await expect(rows(page).first()).toHaveAttribute("data-row-id", /^K-/, { timeout: 4000 })
    expect((await seenRows(page)).filter((id) => id.startsWith("C-"))).toEqual([])
  })

  test("a run started in A and finished after A → B → A does not change state or show a toast", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.latency.bulk = 1600))
    await rowCheckbox(page, 0).click()
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    await expect(list(page).locator("[data-slot=bulk-run-status]")).toBeVisible()
    await switchWorkspace(page, "九州支店")
    await switchWorkspace(page, "本社営業部")
    await expect(rows(page).first()).toHaveAttribute("data-row-id", "C-00001")
    await page.waitForTimeout(2000)
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)
    await expect(list(page).locator("[data-slot=bulk-result]")).toHaveCount(0)
    await expect(list(page).locator("[data-slot=bulk-run-status]")).toHaveCount(0)
    await expect(list(page).locator("[data-slot=data-table-selection-bar]")).toHaveCount(0)
  })

  test("unmounting the list during a run: the late result does not show a toast or a result", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.latency.bulk = 1500))
    await rowCheckbox(page, 0).click()
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    await expect(list(page).locator("[data-slot=bulk-run-status]")).toBeVisible()
    await page.evaluate(() => (window.location.hash = "#/browsing-app?page=deals"))
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("商談")
    await page.waitForTimeout(1900)
    await expect(page.locator("[data-slot=toast]")).toHaveCount(0)
  })

  test("same-condition refresh failure: rows stay visible, but dependent operations are blocked with the reason; the page is kept", async ({ page }) => {
    await openApp(page)
    await pager(page).getByRole("button", { name: "次へ" }).click()
    await expect(page).toHaveURL(/p=2/)
    await rowCheckbox(page, 0).click()
    await server(page, (s) => (s.failNext.list = true))
    await page.getByTestId("browsing-refetch").click()
    await expect(page.getByTestId("app-list-refresh-error")).toBeVisible()
    // 同じ条件の再取得では、現在のページを維持する
    await expect(page).toHaveURL(/p=2/)
    await expect(rows(page).first()).toHaveAttribute("data-row-id", "C-00021")
    await expect(rowCheckbox(page, 1)).toBeDisabled()
    await expect(rows(page).nth(1).getByRole("button", { name: /の操作$/ })).toBeDisabled()
    await expect(list(page).locator("[data-slot=data-table-selection-disabled]")).toHaveText("再取得するまで操作できません")
    await expect(page.getByTestId("app-list-bulk-owner")).toBeDisabled()
    // 削除を含むその他の一括操作も無効
    await expect(page.getByTestId("app-list-bulk-more")).toBeDisabled()
    await page.getByTestId("app-list-refresh-error").getByRole("button", { name: "再試行" }).click()
    await expect(page.getByTestId("app-list-refresh-error")).toBeHidden()
    await expect(rowCheckbox(page, 1)).toBeEnabled()
    await expect(page).toHaveURL(/p=2/)
  })
})

test.describe("v0.1: bulk result integrity and fixed targets", () => {
  test("missing, duplicated and unexpected results: not reported as all succeeded; the user is asked to check", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.bulkMode = "incomplete"))
    for (const i of [0, 1, 2]) await rowCheckbox(page, i).click()
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    const result = list(page).locator("[data-slot=bulk-result]")
    await expect(result).toBeVisible()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "完了しました" })).toHaveCount(0)
    const integrity = result.locator("[data-slot=bulk-result-integrity]")
    await expect(integrity).toContainText("重ねて 1件")
    // 対象ではない行は、名前（ID）を示し、変更された可能性を伝える
    await expect(integrity).toContainText("対象ではない行の結果を 1件受け取りました（X-99999）")
    await expect(integrity).toContainText("変更された可能性があります")
    // 結果が返らなかった行は、結果が不明な行の説明の中で 1 回だけ示す
    await expect(result.locator("[data-slot=bulk-result-unknown]")).toContainText("うち 1件は、結果が返されませんでした")
    await expect(result.getByText("最新の状態を確認してから、必要な行だけをもう一度操作してください。")).toHaveCount(1)
    // 完了は 2 件（重複と対象外を数えない）、返らなかった 1 件は結果が不明
    await expect(result).toContainText("完了2件")
    await expect(result).toContainText("結果が不明1件")
    await expect(result.getByRole("button", { name: "最新の状態を確認" })).toBeVisible()
    await expect(result.getByRole("button", { name: /再試行/ })).toHaveCount(0)
  })

  test("a result does not change a selection the user changed during the run", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => {
      s.bulkMode = "partial"
      s.latency.bulk = 1200
    })
    for (const i of [2, 3]) await rowCheckbox(page, i).click()
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    await expect(list(page).locator("[data-slot=bulk-run-status]")).toBeVisible()
    // 実行中に選択を変える
    await list(page).getByRole("button", { name: "選択を解除" }).click()
    await rowCheckbox(page, 7).click()
    await expect(list(page).locator("[data-slot=bulk-result]")).toContainText("2件のうち、1件の担当者の変更が完了しました")
    // 失敗した C-00003 を新しい選択に戻さない。利用者が選んだ C-00008 だけが選択中
    await expect(rowCheckbox(page, 2)).not.toBeChecked()
    await expect(rowCheckbox(page, 7)).toBeChecked()
    await expect(list(page).locator("[data-slot=data-table-selection-bar]")).toContainText("1件を選択中")
    // 再試行は、実行したときの対象と操作の内容（担当者：田中 翔）で行う
    await list(page).locator("[data-slot=bulk-result]").getByRole("button", { name: "失敗した 1件を再試行" }).click()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "1件の担当者の変更が完了しました" })).toBeVisible()
    const last = JSON.parse((await requests(page, "bulk")).at(-1)!.key)
    expect(last).toMatchObject({ kind: "ids", ids: ["C-00003"] })
    await expect(rows(page).nth(2).locator("td").nth(3)).toHaveText("田中 翔")
  })

  test("the query of an all-matching run is fixed when it starts", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.latency.bulk = 1200))
    await selectStatus(page, "休止中")
    await list(page).getByRole("checkbox", { name: "このページの行をすべて選択" }).click()
    await list(page).locator("[data-slot=data-table-selection-bar]").getByRole("button", { name: /をすべて選択$/ }).click()
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    await selectStatus(page, "契約中")
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "の担当者の変更が完了しました" })).toBeVisible()
    const target = JSON.parse((await requests(page, "bulk")).at(-1)!.key)
    expect(target.kind).toBe("query")
    expect(target.query.filters.status).toBe("paused")
    const paused = customers.filter((c) => c.status === "paused").map((c) => c.id)
    expect((await server(page, (s) => s.processed)).sort()).toEqual(paused.sort())
  })
})

test.describe("v0.1: layout", () => {
  test("kanban: horizontal cues only toward hidden columns, gone at the edge; cards stay clickable", async ({ page, isMobile }) => {
    if (!isMobile) await page.setViewportSize({ width: 900, height: 900 })
    await openApp(page)
    await page.getByRole("radiogroup", { name: "表示形式" }).getByRole("radio", { name: "カンバン" }).click()
    const area = page.getByTestId("app-list-board-scroll")
    const scroller = area.locator("[data-slot=horizontal-scroll-container]")
    await expect(page.getByTestId("app-list-board-trial").locator("[data-row-id]").first()).toBeVisible()
    await expect(area).toHaveAttribute("data-scroll-end", "true")
    await expect(area).not.toHaveAttribute("data-scroll-start")
    expect(await area.locator("[data-slot=table-scroll-cue]").first().evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none")
    expect(await scroller.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto")
    await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
    await expect(area).toHaveAttribute("data-scroll-start", "true")
    await expect(area).not.toHaveAttribute("data-scroll-end")
    // 影の下のカードも押せる（右端の列の最初のカード）
    await page.getByTestId("app-list-board-cancelled").locator("[data-row-id] button").first().click()
    await expect(page.getByTestId("company-detail")).toBeVisible()
  })

  test("date range in the filter sheet: start and end inputs have the same width; wide areas keep one row", async ({ page, isMobile }) => {
    test.skip(isMobile, "デスクトップの Sheet（狭い領域）と、資料のページ（広い領域）を比べる")
    await openApp(page)
    await page.getByTestId("app-list-more").click()
    const sheet = page.getByTestId("app-list-filters")
    await expect(sheet.locator("[data-slot=date-range-from]")).toBeVisible()
    // Sheet の開く動きが終わってから測る
    await settledBox(sheet)
    const from = await box(sheet.locator("[data-slot=date-range-from]"))
    const to = await box(sheet.locator("[data-slot=date-range-to]"))
    expect(Math.abs(from.width - to.width)).toBeLessThan(1)
    expect(Math.abs(from.x - to.x)).toBeLessThan(1)
    await page.goto("/#/date-picker")
    const picker = page.locator("[data-slot=date-range-picker]").first()
    const a = await box(picker.locator("[data-slot=date-range-from]"))
    const b = await box(picker.locator("[data-slot=date-range-to]"))
    expect(Math.abs(a.y - b.y)).toBeLessThan(1)
    expect(Math.abs(a.width - b.width)).toBeLessThan(1)
    await expect(picker.getByText("〜")).toBeVisible()
  })

  test("320px product screen: pagination fits inside the content, keeps every operation and 48px targets", async ({ page, isMobile }) => {
    test.skip(!isMobile, "指で操作する端末の 48px で確かめる")
    await page.setViewportSize({ width: 320, height: 800 })
    await openApp(page)
    const content = await box(page.locator("[data-slot=page-layout-content]"))
    const nav = pager(page)
    const n = await box(nav)
    expect(n.x + n.width).toBeLessThanOrEqual(content.x + content.width + 1)
    for (const name of ["最初のページ", "前へ", "次へ", "最後のページ"]) {
      const b = nav.getByRole("button", { name })
      await expect(b).toBeVisible()
      expect((await box(b)).height).toBeGreaterThanOrEqual(48)
    }
    await expect(nav.locator("[data-slot=pagination-compact-position]")).toContainText("29ページ中 1ページ目")
    await nav.getByRole("button", { name: "最後のページ" }).click()
    await expect(nav.locator("[data-slot=pagination-compact-position]")).toContainText("29ページ中 29ページ目")
    await expect(nav.getByRole("button", { name: "次へ" })).toBeDisabled()
    // 一覧の表示範囲の文字と表示件数も、領域の中に収まる
    const controls = await box(list(page).locator("[data-slot=pagination-controls]"))
    expect(controls.x + controls.width).toBeLessThanOrEqual(content.x + content.width + 1)
  })
})

test.describe("v0.1: re-review follow-ups", () => {
  test("undo after switching the workspace does not run against the new workspace", async ({ page }) => {
    await openApp(page)
    await rowCheckbox(page, 0).click()
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    const toast = page.locator("[data-slot=toast]").filter({ hasText: "1件の担当者の変更が完了しました" })
    await expect(toast).toBeVisible()
    const before = (await requests(page, "bulk")).length
    await switchWorkspace(page, "九州支店")
    await expect(rows(page).first()).toHaveAttribute("data-row-id", /^K-/)
    await toast.getByRole("button", { name: "元に戻す" }).click()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "別のワークスペースに切り替えたため、元に戻せません" })).toBeVisible()
    expect((await requests(page, "bulk")).length).toBe(before)
  })

  test("a rejected request for selected IDs: all failed, no integrity warning and no status check prompt", async ({ page }) => {
    await openApp(page)
    await server(page, (s) => (s.bulkMode = "request-fail"))
    await rowCheckbox(page, 0).click()
    await rowCheckbox(page, 1).click()
    await page.getByTestId("app-list-bulk-owner").click()
    await page.getByRole("menuitem", { name: "田中 翔" }).click()
    const result = list(page).locator("[data-slot=bulk-result]")
    await expect(result).toContainText("2件の担当者の変更がすべて失敗しました")
    await expect(result.locator("[data-slot=bulk-result-integrity]")).toHaveCount(0)
    await expect(result.getByRole("button", { name: "最新の状態を確認" })).toHaveCount(0)
    await expect(result.getByRole("button", { name: "失敗した 2件を再試行" })).toBeVisible()
    await expect(list(page).locator("[data-slot=data-table-selection-bar]")).toContainText("2件を選択中")
  })
})
