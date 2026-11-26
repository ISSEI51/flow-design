import { expect, test, type Locator, type Page } from "@playwright/test"

import { animationsDone, css, sameColor, settledBox, token } from "./helpers"
import { collectPageErrors } from "./page-errors"

// App Structure v0.1 の境界の条件の検品。検品用の画面（#/structure-checks?case=...）と、営業管理の検証画面を操作する。
// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

const box = async (l: Locator) => (await l.boundingBox())!
const tabKey = (page: Page) => (page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab")
const main = (page: Page) => page.locator("main").first()

async function openCheck(page: Page, query: string) {
  await page.goto(`/#/structure-checks?${query}`)
  await page.locator("main").first().waitFor()
}

async function setHash(page: Page, hash: string) {
  await page.evaluate((h) => (window.location.hash = h), hash)
}

// ------------------------------------------------------------------ Navigation の現在地

test.describe("Navigation: how a parent shows the current location", { tag: "@webkit" }, () => {
  test.skip(({ isMobile }) => isMobile, "展開した Sidebar（デスクトップ）")

  test("parent page / child open / child closed / not containing; aria-current=page only on the page itself", async ({ page }) => {
    await page.goto("/#/structure-app?page=home")
    await page.getByRole("heading", { level: 1 }).waitFor()
    const nav = page.getByRole("navigation", { name: "メインメニュー" })
    const parent = nav.getByRole("link", { name: "契約", exact: true })
    const toggle = nav.getByRole("button", { name: "契約の下の項目" })
    const accent = await token(page, "--sidebar-accent")
    const bg = () => css(parent, "background-color")
    // 面の色の比較。色の変化の途中は oklab() などで返る場合があり、比べられない値は「まだ一致しない」として待つ
    const bgIs = async (expected: string) => {
      try {
        return sameColor(await bg(), expected)
      } catch {
        return false
      }
    }
    await page.mouse.move(900, 600)

    // 現在地を含まない
    await expect(parent).not.toHaveAttribute("data-nav-current")
    await expect(parent).not.toHaveAttribute("aria-current")
    expect(await css(parent, "font-weight")).toBe("400")

    // 親のページ自体が現在地
    await setHash(page, "#/structure-app?page=contracts")
    await expect(parent).toHaveAttribute("data-nav-current", "page")
    await expect(parent).toHaveAttribute("aria-current", "page")
    await expect.poll(() => bgIs(accent)).toBe(true)
    expect(await css(parent, "font-weight")).toBe("600")

    // 子が現在地で、子を表示している：親は面なし、太さ 500。aria-current は子だけ
    await setHash(page, "#/structure-app?page=renewals")
    await expect(parent).toHaveAttribute("data-nav-current", "child-open")
    await expect(parent).not.toHaveAttribute("aria-current")
    await expect(nav.getByRole("link", { name: "更新が近い契約" })).toHaveAttribute("aria-current", "page")
    await expect.poll(() => bgIs("rgba(0, 0, 0, 0)")).toBe(true)
    expect(await css(parent, "font-weight")).toBe("500")
    expect(sameColor(await css(parent, "color"), await token(page, "--sidebar-accent-foreground"))).toBe(true)

    // 子が現在地で、子を閉じている：面なし、太さ 600、aria-current="true"（page ではない）。
    // 親のページ自体が現在地（面あり・600）とは面で、子を表示している状態（500）とは太さで区別する
    await toggle.click()
    await page.mouse.move(900, 600)
    await expect(parent).toHaveAttribute("data-nav-current", "child-closed")
    await expect(parent).toHaveAttribute("aria-current", "true")
    await expect.poll(() => bgIs("rgba(0, 0, 0, 0)")).toBe(true)
    expect(await css(parent, "font-weight")).toBe("600")
    expect(sameColor(await css(parent, "color"), await token(page, "--sidebar-accent-foreground"))).toBe(true)
    await expect(parent).toHaveAccessibleName("契約")

    // 開き直すと、子の表示に戻る。利用者が開閉した状態は保つ
    await toggle.click()
    await expect(parent).toHaveAttribute("data-nav-current", "child-open")
    await expect(toggle).toHaveAttribute("aria-expanded", "true")

    // 親が自身のページを持たない場合（レポート）も同じ
    await setHash(page, "#/structure-app?page=sales-report")
    const reports = nav.getByRole("button", { name: "レポート", exact: true })
    await expect(reports).toHaveAttribute("data-nav-current", "child-open")
    await expect(reports).not.toHaveAttribute("aria-current")
    await reports.click()
    await expect(reports).toHaveAttribute("data-nav-current", "child-closed")
    await expect(reports).toHaveAttribute("aria-current", "true")
    // 現在地がグループの外へ出ると、親の表示はなくなる
    await setHash(page, "#/structure-app?page=home")
    await expect(reports).not.toHaveAttribute("data-nav-current")
    await expect(reports).not.toHaveAttribute("aria-current")
    await expect(parent).not.toHaveAttribute("data-nav-current")
  })

  test("collapsed sidebar: the parent containing the location uses aria-current=true", async ({ page }) => {
    await page.goto("/#/structure-app?page=cancellations")
    await page.getByRole("heading", { level: 1 }).waitFor()
    const c = page.locator("[data-slot=sidebar-container]")
    await page.getByTestId("sidebar-collapse").click()
    await expect.poll(async () => (await box(c)).width).toBe(64)
    await animationsDone(c)
    const parent = page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name: "契約", exact: true })
    await expect(parent).toHaveAttribute("data-nav-current", "collapsed")
    await expect(parent).toHaveAttribute("aria-current", "true")
    await page.getByTestId("sidebar-collapse").click()
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:structure-sidebar-open"))
  })
})

// ------------------------------------------------------------------ Navigation の再利用性

test.describe("Navigation: links, routers, IDs", { tag: "@webkit" }, () => {
  test.skip(({ isMobile }) => isMobile, "2 つの Sidebar を並べる（デスクトップ）")

  test("two SidebarNavs on one page: sub-menu IDs are unique and aria-controls points to the menu", async ({ page }) => {
    await openCheck(page, "case=nav")
    for (const testId of ["nav-a", "nav-b"]) {
      const frame = page.getByTestId(testId)
      const toggle = frame.getByRole("button", { name: "契約の下の項目" })
      await expect(toggle).toHaveAttribute("aria-expanded", "false")
      await expect(toggle).not.toHaveAttribute("aria-controls")
      await toggle.click()
      const id = (await toggle.getAttribute("aria-controls"))!
      // 対象は同じ Sidebar の中にあり、1 つだけ
      await expect(frame.locator(`[id="${id}"]`)).toHaveCount(1)
      await expect(frame.locator(`[id="${id}"]`)).toHaveAttribute("data-slot", "sidebar-menu-sub")
      const reports = frame.getByRole("button", { name: "レポート", exact: true })
      await reports.click()
      await expect(frame.locator(`[id="${await reports.getAttribute("aria-controls")}"]`)).toHaveCount(1)
    }
    const duplicates = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id)
      return ids.filter((id, i) => ids.indexOf(id) !== i)
    })
    expect(duplicates).toEqual([])
  })

  test("plain links: the URL decides the location; no onNavigate is needed", async ({ page }) => {
    await openCheck(page, "case=nav")
    const frame = page.getByTestId("nav-a")
    const link = frame.getByRole("link", { name: "顧客", exact: true })
    await expect(link).toHaveAttribute("href", "#/structure-checks?case=nav&a=customers")
    await link.click()
    await expect(page).toHaveURL(/a=customers/)
    await expect(page.getByTestId("nav-a-title")).toHaveText("customers")
    await expect(link).toHaveAttribute("aria-current", "page")
    // badge の意味は説明で伝える（名前は変えない）
    await expect(link).toHaveAccessibleDescription("未対応 3 件")
  })

  test("custom router: renderLink replaces the element; the product router handles the click", async ({ page }) => {
    await openCheck(page, "case=nav")
    const frame = page.getByTestId("nav-b")
    const link = frame.getByRole("link", { name: /^顧客/ })
    await expect(link).toHaveAttribute("data-router-link", "")
    await expect(link).toHaveAttribute("href", "/app/customers")
    const url = page.url()
    await link.click()
    await expect(page.getByTestId("router-log")).toHaveText("ルーターの移動：customers")
    expect(page.url()).toBe(url)
    await expect(link).toHaveAttribute("aria-current", "page")
    await expect(page.getByTestId("nav-b-title")).toHaveText("customers")
  })

  test("keyboard: Enter follows a link; Enter and Space toggle a group", async ({ page }) => {
    await openCheck(page, "case=nav")
    const frame = page.getByTestId("nav-b")
    await frame.getByRole("link", { name: "ホーム" }).focus()
    await page.keyboard.press(tabKey(page))
    await expect(frame.getByRole("link", { name: /^顧客/ })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("router-log")).toHaveText("ルーターの移動：customers")
    const toggle = frame.getByRole("button", { name: "契約の下の項目" })
    await toggle.focus()
    await page.keyboard.press("Enter")
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await page.keyboard.press("Space")
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  test("modifier click opens a new tab and does not navigate in place", async ({ page, context, browserName }) => {
    test.skip(browserName === "webkit", "Playwright の WebKit は修飾キー付きのクリックで新しいページを開かない環境がある")
    await page.goto("/#/structure-app?page=home")
    await page.getByRole("heading", { level: 1 }).waitFor()
    const link = page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: /^商談/ })
    const popup = context.waitForEvent("page")
    await link.click({ modifiers: ["ControlOrMeta"] })
    const opened = await popup
    await opened.waitForLoadState()
    expect(opened.url()).toContain("page=deals")
    await opened.close()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ホーム")
    expect(page.url()).toContain("page=home")
  })
})

// ------------------------------------------------------------------ App Shell のフォーカス

test.describe("App Shell: focus after navigation", { tag: "@webkit" }, () => {
  const sidebarLink = (page: Page, name: string) => page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name })

  async function navigate(page: Page, isMobile: boolean, name: string) {
    if (isMobile) {
      await page.getByRole("button", { name: "メニュー", exact: true }).click()
      await page.getByRole("dialog", { name: "メニュー" }).getByRole("link", { name }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0)
    } else {
      await sidebarLink(page, name).click()
    }
  }

  test("first load does not take focus; h1 when present; main when there is no h1", async ({ page, isMobile }) => {
    await openCheck(page, "case=focus&p=heading")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
    await navigate(page, isMobile, "見出しなし")
    await expect(page.getByTestId("no-heading")).toBeVisible()
    await expect(main(page)).toBeFocused()
    await navigate(page, isMobile, "長いページ")
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
  })

  const finishLoading = (page: Page) => page.evaluate(() => (window as unknown as { __finishLoading: () => void }).__finishLoading())

  test("a heading shown later: focus goes to main, then the product calls focusHeading", async ({ page, isMobile }) => {
    await openCheck(page, "case=focus&p=heading")
    await navigate(page, isMobile, "遅れて表示")
    await expect(page.getByTestId("loading")).toBeVisible()
    await expect(main(page)).toBeFocused()
    await finishLoading(page)
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await expect(page.getByTestId("focused-later")).toHaveText("focusHeading の結果：true")
  })

  test("focusHeading does not take focus back from the user", async ({ page }) => {
    await openCheck(page, "case=focus&p=heading")
    await setHash(page, "#/structure-checks?case=focus&p=delayed")
    await expect(page.getByTestId("loading")).toBeVisible()
    await expect(main(page)).toBeFocused()
    // 読み込みの間に、利用者が Sidebar の項目へフォーカスを移した
    await page.locator("[data-slot=sidebar-nav] a, [data-slot=sidebar-trigger]").first().focus()
    await finishLoading(page)
    await expect(page.getByTestId("focused-later")).toHaveText("focusHeading の結果：false")
    await expect(page.getByRole("heading", { level: 1 })).not.toBeFocused()
  })

  test("focusHeading does nothing on the first load (no navigation)", async ({ page }) => {
    await openCheck(page, "case=focus&p=delayed")
    await expect(page.getByTestId("loading")).toBeVisible()
    await finishLoading(page)
    await expect(page.getByTestId("focused-later")).toHaveText("focusHeading の結果：false")
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  })

  test("navigating twice in a row: only the last page receives focus and the top position", async ({ page }) => {
    await openCheck(page, "case=focus&p=long")
    // フォーカスの移動を記録し、取り消した移動の処理がフォーカスを動かさないことを確かめる
    await page.evaluate(() => {
      const w = window as unknown as { __focusLog: string[] }
      w.__focusLog = []
      document.addEventListener("focusin", (e) => w.__focusLog.push((e.target as HTMLElement).tagName))
    })
    const log = () => page.evaluate(() => (window as unknown as { __focusLog: string[] }).__focusLog.splice(0))
    await main(page).evaluate((el) => el.scrollTo({ top: 600 }))
    await page.evaluate(() => {
      window.location.hash = "#/structure-checks?case=focus&p=no-heading"
      window.location.hash = "#/structure-checks?case=focus&p=heading"
    })
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("見出しあり")
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    expect(await main(page).evaluate((el) => el.scrollTop)).toBe(0)
    expect(await log()).toEqual(["H1"])
    await page.evaluate(() => {
      window.location.hash = "#/structure-checks?case=focus&p=long"
      window.location.hash = "#/structure-checks?case=focus&p=no-heading"
    })
    await expect(page.getByTestId("no-heading")).toBeVisible()
    await expect(main(page)).toBeFocused()
    expect(await log()).toEqual(["MAIN"])
  })

  test("focusOnNavigate=false keeps focus on the activated control", async ({ page, isMobile }) => {
    test.skip(isMobile, "Sidebar の項目にフォーカスを残す（デスクトップ）")
    await openCheck(page, "case=focus&p=heading&focus=off")
    // WebKit はクリックでリンクにフォーカスを移さないため、キーボードで押して確かめる
    const link = sidebarLink(page, "長いページ")
    await link.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("長いページ")
    await expect(link).toBeFocused()
    await expect(page.getByRole("heading", { level: 1 })).not.toBeFocused()
  })

  test("scrollOnNavigate=false with the product restoring the position; focus does not move the scroll", async ({ page, isMobile }) => {
    await openCheck(page, "case=focus&p=long&restore=on")
    await main(page).evaluate((el) => el.scrollTo({ top: 500 }))
    await expect.poll(() => main(page).evaluate((el) => el.scrollTop)).toBe(500)
    await navigate(page, isMobile, "見出しあり")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("見出しあり")
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await navigate(page, isMobile, "長いページ")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("長いページ")
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    // 製品が復元した位置を、フォーカスの移動（preventScroll）が変えない
    expect(await main(page).evaluate((el) => el.scrollTop)).toBe(500)
  })
})

// ------------------------------------------------------------------ Bottom Navigation と入力

test.describe("Bottom Navigation: hidden only while entering text", { tag: "@webkit" }, () => {
  test.skip(({ isMobile }) => !isMobile, "モバイルの表示")

  test("text fields hide it; read-only fields and selection controls do not", async ({ page }) => {
    await openCheck(page, "case=bottom")
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches)
    test.skip(!coarse, "タッチ操作の端末の判定（pointer: coarse）が有効な環境")
    const bottom = page.getByTestId("bottom-nav")
    const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const cases: [string, boolean][] = [
      ["in-text", true],
      ["in-readonly", false],
      ["in-date", false],
      ["in-textarea", true],
      ["in-editable", true],
      ["in-select", false],
      ["in-combobox", false],
      ["in-checkbox", false],
    ]
    for (const [id, hides] of cases) {
      await page.getByTestId(id).focus()
      if (hides) await expect(bottom, id).toBeHidden()
      else await expect(bottom, id).toBeVisible()
      await blur()
      await expect(bottom, `${id} blur`).toBeVisible()
    }
    // 入力できる Combobox：開くと検索欄（input）にフォーカスが移り、隠れる。閉じてトリガーに戻ると表示する
    await page.getByTestId("in-combobox").click()
    await expect(page.getByTestId("in-combobox-input")).toBeFocused()
    await expect(bottom).toBeHidden()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("in-combobox")).toBeFocused()
    await expect(bottom).toBeVisible()
    // ページを移動した後（フォーカスは h1）も表示する
    await page.getByTestId("in-text").focus()
    await expect(bottom).toBeHidden()
    await setHash(page, "#/structure-checks?case=bottom&p=bookings")
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await expect(bottom).toBeVisible()
  })

  test("hideWhileTyping=false keeps it visible", async ({ page }) => {
    await openCheck(page, "case=bottom&hide=off")
    await page.getByTestId("in-text").focus()
    await expect(page.getByTestId("bottom-nav")).toBeVisible()
  })

  test("320px with five items and long labels: no overflow, targets of 48px or more", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    for (const q of ["case=bottom", "case=bottom&long=1"]) {
      await openCheck(page, q)
      const bottom = page.getByTestId("bottom-nav")
      const items = bottom.getByRole("link")
      await expect(items).toHaveCount(5)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await bottom.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
      for (const item of await items.all()) {
        const b = await box(item)
        expect(b.width, q).toBeGreaterThanOrEqual(48)
        expect(b.height, q).toBeGreaterThanOrEqual(48)
        // 長いラベルは 2 行までで切り、項目の外にはみ出さない
        const label = item.locator("span").last()
        expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), q).toBe(true)
        expect((await box(label)).height, q).toBeLessThanOrEqual(2 * 18 + 1)
      }
      // 名前は省略しない（切った文字も読み上げる）
      if (q.endsWith("long=1")) await expect(items.nth(1)).toHaveAccessibleName("宿と体験をさがす")
    }
  })
})

// ------------------------------------------------------------------ Section Layout

test.describe("Section Layout: headings, landmarks, IDs", { tag: "@webkit" }, () => {
  test("nesting, explicit levels, landmarks, custom title IDs, sections without a title", async ({ page }) => {
    await openCheck(page, "case=sections")
    const nest = page.getByTestId("nest")
    for (const [name, level] of [
      ["階層 2", 2],
      ["階層 3", 3],
      ["階層 4", 4],
      ["階層 5", 5],
      ["階層 6", 6],
      ["階層 7（h6 のまま）", 6],
    ] as const) {
      await expect(nest.getByRole("heading", { name, exact: true, level })).toHaveCount(1)
    }
    await expect(page.getByTestId("explicit").getByRole("heading", { level: 4, name: "明示した階層 4" })).toHaveCount(1)
    // landmark：見出しを名前にした region
    const regions = page.getByTestId("sections").getByRole("region")
    await expect(regions).toHaveCount(3)
    await expect(page.getByRole("region", { name: "請求の設定" })).toHaveAttribute("data-testid", "landmark")
    // 独自の id（Section の titleId）
    await expect(page.getByRole("heading", { name: "請求の履歴" })).toHaveAttribute("id", "billing-history")
    await expect(page.getByTestId("custom-id")).toHaveAttribute("aria-labelledby", "billing-history")
    await expect(page.getByRole("region", { name: "請求の履歴" })).toHaveCount(1)
    // 見出しを後から表示・削除する landmark：SectionTitle の登録で aria-labelledby が追従する
    const dynamic = page.getByTestId("dynamic")
    await expect(dynamic).not.toHaveAttribute("aria-labelledby")
    await dynamic.getByTestId("toggle-title").click()
    await expect(page.getByRole("region", { name: "後から表示した見出し" })).toHaveCount(1)
    await dynamic.getByTestId("toggle-title").click()
    await expect(dynamic).not.toHaveAttribute("aria-labelledby")
    // aria-label で名前を付けた Section
    await expect(page.getByRole("region", { name: "お知らせ" })).not.toHaveAttribute("aria-labelledby")
    // 見出しのない landmark は、存在しない id を参照しない（region にならない）
    await expect(page.getByTestId("no-title")).not.toHaveAttribute("aria-labelledby")
    // landmark を指定しない Section は region にしない
    await expect(page.getByTestId("plain")).not.toHaveAttribute("aria-labelledby")
    // 参照先がすべて存在し、id が重複しない
    const result = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id)
      const missing = Array.from(document.querySelectorAll("[aria-labelledby]"))
        .flatMap((e) => e.getAttribute("aria-labelledby")!.split(" "))
        .filter((id) => !document.getElementById(id))
      return { duplicates: ids.filter((id, i) => ids.indexOf(id) !== i), missing }
    })
    expect(result).toEqual({ duplicates: [], missing: [] })
  })

  test("long headings wrap; actions move below the heading on a narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await openCheck(page, "case=sections")
    const long = page.getByTestId("long")
    const heading = long.getByRole("heading", { level: 2 })
    expect(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    const h = await settledBox(heading)
    const actions = await box(long.locator("[data-slot=section-actions]"))
    expect(actions.y).toBeGreaterThanOrEqual(h.y + h.height)
    await expect(long.getByRole("button", { name: "既定に戻す" })).toBeVisible()
    await expect(long.getByRole("button", { name: "履歴を見る" })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

// ------------------------------------------------------------------ Page Header と Page Layout

test.describe("Page Header and Page Layout: sticky, text size", { tag: "@webkit" }, () => {
  test("sticky header: scroll-padding follows its height and is removed when it stops sticking", async ({ page }) => {
    await openCheck(page, "case=sticky")
    const m = page.getByTestId("sticky-main")
    const header = page.locator("[data-slot=page-header]")
    const padding = () => m.evaluate((el) => parseFloat(getComputedStyle(el).scrollPaddingTop))
    await m.evaluate((el) => el.scrollTo({ top: 400 }))
    await expect(header).toHaveAttribute("data-stuck", "true")
    const before = (await box(header)).height
    await expect.poll(padding).toBeCloseTo(before, 0)
    // 高さが変わる（補足を表示する）と、scroll-padding-top も変わる
    await page.getByTestId("toggle-more").click()
    await expect.poll(async () => (await box(header)).height).toBeGreaterThan(before)
    const after = (await box(header)).height
    await expect.poll(padding).toBeCloseTo(after, 0)
    // 隠れる位置のボタンにフォーカスしても、Page Header の下に入らない
    const target = page.getByRole("button", { name: "開く 12", exact: true })
    await target.focus()
    await expect.poll(async () => (await box(target)).y).toBeGreaterThanOrEqual((await box(header)).y + after - 1)
    // 固定をやめると、scroll-padding-top と CSS 変数を取り除く
    await page.getByTestId("toggle-sticky").click()
    await expect(header).not.toHaveAttribute("data-sticky")
    await expect.poll(padding).toBe(0)
    expect(await m.evaluate((el) => el.style.getPropertyValue("--app-shell-sticky-top"))).toBe("")
  })

  test("browser text size: rem widths and padding grow, the page never scrolls sideways", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    for (const [width, font] of [
      [1920, 20],
      [1280, 24],
      [1280, 32],
      [390, 24],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/#/structure-app?page=customer&id=C-00002")
      await page.getByRole("heading", { level: 1 }).waitFor()
      await page.evaluate((f) => (document.documentElement.style.fontSize = `${f}px`), font)
      const layout = page.locator("[data-slot=page-layout]")
      const content = page.locator("[data-slot=page-layout-content]")
      await settledBox(content)
      const pad = parseFloat(await css(layout, "padding-left"))
      // 文字の大きさの設定は、ルートの font-size で近似する。メディアクエリ（md）の rem はブラウザの初期値（16px）を基準にするため、
      // 余白の切り替えは 768px のまま。実際のブラウザの設定の変更とは、ブレークポイントの位置が異なる
      expect(pad, `${width}/${font}`).toBeCloseTo((width >= 768 ? 1.5 : 1) * font, 0)
      // 最大幅は 60rem。領域が広ければ 60rem、狭ければ領域の幅
      const avail = (await box(layout)).width - 2 * pad
      expect((await box(content)).width, `${width}/${font}`).toBeCloseTo(Math.min(60 * font, avail), 0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}/${font}`).toBe(true)
      await page.evaluate(() => (document.documentElement.style.fontSize = ""))
    }
  })

  test("long title with several actions at 320px: everything stays visible without page scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto("/#/structure-app?page=customer&id=C-00002&long=1")
    const h1 = page.getByRole("heading", { level: 1 })
    await h1.waitFor()
    expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await expect(page.getByRole("button", { name: "メールを作成" })).toBeVisible()
    await expect(page.getByRole("button", { name: "編集" })).toBeVisible()
    const a = await box(page.locator("[data-slot=page-header-actions]"))
    expect(a.x + a.width).toBeLessThanOrEqual(320)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
