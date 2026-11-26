import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { customers } from "../src/data/data-display/customers"
import { animationsDone, css, sameColor, settledBox, token } from "./helpers"
import { collectPageErrors } from "./page-errors"

// Patterns / App Structure（App Shell、Navigation、Page Header、Page Layout、Section Layout）の検品。
// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

const docPages = ["app-shell", "navigation", "page-header", "page-layout", "section-layout"]
const screens = ["home", "customers", "customer&id=C-00002", "customer-new", "settings", "deals", "login"]

const box = async (l: Locator) => (await l.boundingBox())!
const tabKey = (page: Page) => (page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab")

async function openApp(page: Page, query: string) {
  await page.goto(`/#/structure-app?page=${query}`)
  await page.getByRole("heading", { level: 1 }).waitFor()
}

async function go(page: Page, query: string) {
  await page.evaluate((q) => (window.location.hash = `#/structure-app?page=${q}`), query)
}

const main = (page: Page) => page.locator("main").first()
const nav = (page: Page) => page.getByRole("navigation", { name: "メインメニュー" })

// 縦にスクロールしている領域（main と Sidebar のメニュー以外）。表などの横のスクロールは数えない。
async function extraVerticalScrollers(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => {
        const { overflowY } = getComputedStyle(el)
        return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1
      })
      .filter((el) => el.tagName !== "MAIN" && el.getAttribute("data-slot") !== "sidebar-content")
      .map((el) => `${el.tagName}[${el.getAttribute("data-slot") ?? el.className.slice(0, 40)}]`)
  )
}

async function noPageScroll(page: Page) {
  return page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth <= window.innerWidth,
    vertical: document.documentElement.scrollHeight <= window.innerHeight + 1,
  }))
}

// ------------------------------------------------------------------ 資料のページ

test.describe("App Structure pages", { tag: "@webkit" }, () => {
  for (const id of docPages) {
    test(`${id}: names, headings, no horizontal scroll`, async ({ page }) => {
      await page.goto(`/#/${id}`)
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
      // 資料の中の例は h1 を使わない（ページのタイトルだけが h1）
      await expect(page.locator("h1")).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const controls = page.locator("main").first().getByRole("button").or(page.locator("main").first().getByRole("link"))
      const n = await controls.count()
      expect(n).toBeGreaterThan(0)
      for (let i = 0; i < n; i++) {
        const c = controls.nth(i)
        if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
      }
    })
  }

  test("app shell page: the frame switches the shell and the width", async ({ page, isMobile }) => {
    await page.goto("/#/app-shell")
    const frame = page.getByTestId("shell-frame")
    const inner = frame.frameLocator("iframe")
    await expect(inner.getByRole("heading", { level: 1 })).toHaveText("顧客")
    await page.getByRole("radio", { name: "Header Shell" }).check()
    await expect(page.getByTestId("shell-frame").frameLocator("iframe").getByRole("heading", { level: 1 })).toHaveText("予約")
    if (!isMobile) {
      await page.getByTestId("shell-frame").getByRole("radio", { name: "モバイル（390px）" }).check()
      expect((await box(page.getByTestId("shell-frame").locator("iframe"))).width).toBeLessThanOrEqual(390)
    }
  })
})

// ------------------------------------------------------------------ App Shell：構造とスクロール

test.describe("App Shell", { tag: "@webkit" }, () => {
  test("every screen: one main, the main area is the only vertical scroll region", async ({ page, isMobile }) => {
    for (const s of screens) {
      await openApp(page, s)
      await expect(page.getByRole("main")).toHaveCount(1)
      expect(await noPageScroll(page), s).toEqual({ horizontal: true, vertical: true })
      // main と Sidebar のメニュー以外に、縦にスクロールする領域がない
      expect(await extraVerticalScrollers(page), s).toEqual([])
      if (s === "login") {
        await expect(page.getByRole("navigation")).toHaveCount(0)
      } else if (isMobile) {
        await expect(page.getByRole("button", { name: "メニュー", exact: true })).toBeVisible()
      } else {
        await expect(nav(page)).toBeVisible()
      }
    }
  })

  test("from 320px to 2560px: no page scroll, padding 16px / 24px", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    for (const width of [320, 390, 768, 1024, 1280, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 })
      for (const s of screens) {
        await openApp(page, s)
        expect(await noPageScroll(page), `${s} at ${width}`).toEqual({ horizontal: true, vertical: true })
        const layout = page.locator("[data-slot=page-layout]").first()
        expect(await css(layout, "padding-left"), `${s} at ${width}`).toBe(width >= 768 ? "24px" : "16px")
      }
    }
  })

  test("the main area scrolls independently; the sidebar and the header stay", async ({ page, isMobile }) => {
    await openApp(page, "customers")
    const m = main(page)
    expect(await m.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    expect(await css(m, "overflow-y")).toBe("auto")
    const fixed = isMobile ? page.getByTestId("structure-mobile-header") : page.locator("[data-slot=sidebar-container]")
    const before = await box(fixed)
    await m.evaluate((el) => el.scrollTo({ top: 600 }))
    await expect.poll(() => m.evaluate((el) => el.scrollTop)).toBeGreaterThan(500)
    expect((await box(fixed)).y).toBe(before.y)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    // Sidebar のメニューは、Sidebar の中で独立してスクロールできる（内容が収まらない場合）
    if (!isMobile) expect(await css(page.locator("[data-slot=sidebar-content]"), "overflow-y")).toBe("auto")
  })

  test("skip link: first Tab shows it, Enter moves focus to main", async ({ page, isMobile }) => {
    test.skip(isMobile, "ハードウェアキーボードの操作")
    await openApp(page, "customers")
    await page.keyboard.press(tabKey(page))
    const skip = page.getByRole("link", { name: "メインコンテンツへ移動" })
    await expect(skip).toBeFocused()
    const b = await box(skip)
    expect(b.width).toBeGreaterThan(100)
    expect(b.height).toBeGreaterThanOrEqual(48)
    // 左上から 8px（Safe Area が 0 の環境）
    expect(b.y).toBeCloseTo(8, 0)
    expect(b.x).toBeCloseTo(8, 0)
    const hash = await page.evaluate(() => location.hash)
    await page.keyboard.press("Enter")
    await expect(main(page)).toBeFocused()
    // URL（ハッシュのルーティング）は変えない
    expect(await page.evaluate(() => location.hash)).toBe(hash)
    // 次の Tab は、メインの内容の最初の操作
    await page.keyboard.press(tabKey(page))
    expect(await page.evaluate(() => document.querySelector("main")!.contains(document.activeElement))).toBe(true)
    await expect(page.getByRole("button", { name: "書き出す" })).toBeFocused()
  })

  test("reduced motion stops the sidebar width animation", async ({ page, isMobile }) => {
    test.skip(isMobile, "デスクトップの Sidebar")
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openApp(page, "home")
    expect(await css(page.locator("[data-slot=sidebar-container]"), "transition-duration")).toBe("0s")
  })
})

// ------------------------------------------------------------------ Navigation

test.describe("Navigation (desktop)", { tag: "@webkit" }, () => {
  test.skip(({ isMobile }) => isMobile, "デスクトップの表示")
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:structure-sidebar-open")).catch(() => undefined)
  })

  test("sidebar: 240px / 64px, neutral surface without a border, state saved by the product", async ({ page }) => {
    await openApp(page, "home")
    const c = page.locator("[data-slot=sidebar-container]")
    expect((await box(c)).width).toBe(240)
    expect(sameColor(await css(c, "background-color"), await token(page, "--sidebar"))).toBe(true)
    expect(await css(c, "border-right-width")).toBe("0px")
    await page.getByTestId("sidebar-collapse").click()
    await expect.poll(async () => (await box(c)).width).toBe(64)
    // 折りたたんでも、主要な内容の開始位置は Sidebar の右端から 24px
    await animationsDone(c)
    expect((await box(page.locator("[data-slot=page-layout-content]"))).x).toBe(64 + 24)
    await page.reload()
    await page.getByRole("heading", { level: 1 }).waitFor()
    await expect.poll(async () => (await box(c)).width).toBe(64)
    await page.getByTestId("sidebar-collapse").click()
    await expect.poll(async () => (await box(c)).width).toBe(240)
  })

  test("settings and the account are at the bottom of the sidebar", async ({ page }) => {
    await openApp(page, "home")
    const c = await box(page.locator("[data-slot=sidebar-container]"))
    const footer = await box(page.locator("[data-slot=sidebar-footer]"))
    expect(footer.y + footer.height).toBeGreaterThan(c.y + c.height - 2)
    await expect(page.locator("[data-slot=sidebar-footer]").getByRole("link", { name: "設定" })).toBeVisible()
    await page.locator("[data-slot=sidebar-footer]").getByRole("button", { name: /佐藤 花子/ }).click()
    await page.getByRole("menuitem", { name: "ログアウト" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン")
  })

  test("after navigating, focus moves to the page title and the main area returns to the top", async ({ page }) => {
    await openApp(page, "customers")
    await main(page).evaluate((el) => el.scrollTo({ top: 800 }))
    await nav(page).getByRole("link", { name: "商談" }).click()
    const h1 = page.getByRole("heading", { level: 1 })
    await expect(h1).toHaveText("商談")
    await expect(h1).toBeFocused()
    expect(await main(page).evaluate((el) => el.scrollTop)).toBe(0)
    await expect(nav(page).getByRole("link", { name: "商談" })).toHaveAttribute("aria-current", "page")
    await expect(nav(page).getByRole("link", { name: "顧客", exact: true })).not.toHaveAttribute("aria-current")
    // 詳細と登録の画面では、親の一覧（顧客）を現在地にする
    await go(page, "customer-new")
    await expect(h1).toHaveText("顧客を登録")
    await expect(h1).toBeFocused()
    await expect(nav(page).getByRole("link", { name: "顧客", exact: true })).toHaveAttribute("aria-current", "page")
    // 現在地はニュートラルの面と太さ 600
    const current = nav(page).getByRole("link", { name: "顧客", exact: true })
    await page.mouse.move(800, 600)
    // 現在地が変わった直後は、色の変化（--duration-fast）の途中のため、変化が終わるまで待つ
    const accent = await token(page, "--sidebar-accent")
    // 変化の途中は oklab() などで返り比べられないため、その間は「まだ一致しない」として待つ
    await expect
      .poll(async () => {
        try {
          return sameColor(await css(current, "background-color"), accent)
        } catch {
          return false
        }
      })
      .toBe(true)
    expect(await css(current, "font-weight")).toBe("600")
  })

  test("a group opens when the location enters it; the user can still close and open groups", async ({ page }) => {
    await openApp(page, "home")
    const toggle = nav(page).getByRole("button", { name: "契約の下の項目" })
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await go(page, "renewals")
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await expect(nav(page).getByRole("link", { name: "更新が近い契約" })).toHaveAttribute("aria-current", "page")
    // 利用者が閉じた状態は、グループの中で移動しても変えない
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await go(page, "cancellations")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("解約の申し込み")
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    // 一度グループの外へ出て、また入ると開く
    await go(page, "home")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ホーム")
    await go(page, "renewals")
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    // ほかのグループも任意に開閉できる。親が自身のページを持たない場合は、親が開閉のボタン
    const reports = nav(page).getByRole("button", { name: "レポート", exact: true })
    await expect(reports).toHaveAttribute("aria-expanded", "false")
    await reports.click()
    await expect(reports).toHaveAttribute("aria-expanded", "true")
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    // 親が自身のページを持つ場合は、親を押すと移動する（開閉しない）
    await nav(page).getByRole("link", { name: "契約", exact: true }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("契約")
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  test("collapsed: the parent opens a dropdown menu that works with the keyboard", async ({ page }) => {
    await openApp(page, "home")
    const c = page.locator("[data-slot=sidebar-container]")
    await page.getByTestId("sidebar-collapse").click()
    await expect.poll(async () => (await box(c)).width).toBe(64)
    await animationsDone(c)
    const parent = nav(page).getByRole("button", { name: "契約", exact: true })
    await parent.focus()
    await page.keyboard.press("Enter")
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    await expect(menu.getByRole("menuitem").first()).toBeFocused()
    await expect(menu.getByRole("menuitem").first()).toHaveText("契約の一覧")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("更新が近い契約")
    // 折りたたみ時は、子が現在地のとき親を現在地の面で示す
    const accent = await token(page, "--sidebar-accent")
    // 色の変化（--duration-fast）が終わるまで待つ
    await expect.poll(async () => sameColor(await css(parent, "background-color"), accent)).toBe(true)
    // 面の色だけでなく、aria-current="true"（集合の中の現在の項目）でも伝える。名前は変えない
    await expect(parent).toHaveAttribute("aria-current", "true")
    await expect(parent).toHaveAccessibleName("契約")
  })

  test("badge: the meaning of the number is announced as the item description", async ({ page }) => {
    await openApp(page, "home")
    // 名前は変えず、説明（aria-describedby）で数字の意味を伝える
    const deals = nav(page).getByRole("link", { name: "商談", exact: true })
    await expect(deals).toBeVisible()
    await expect(deals).toHaveAccessibleDescription("進行中 18 件")
  })

  test("without a sidebar, Ctrl / ⌘ + B is left to the browser", async ({ page }) => {
    await page.goto("/#/shell-examples?type=header")
    await page.getByRole("heading", { level: 1 }).click()
    await page.evaluate(() => {
      ;(window as unknown as { __prevented: boolean[] }).__prevented = []
      window.addEventListener("keydown", (e) => (window as unknown as { __prevented: boolean[] }).__prevented.push(e.defaultPrevented))
    })
    await page.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+b`)
    expect(await page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented)).toContain(false)
    expect(await page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented)).not.toContain(true)
  })

  test("long menu names and long titles wrap without page scroll", async ({ page }) => {
    await openApp(page, "customer&id=C-00002&long=1")
    expect(await noPageScroll(page)).toEqual({ horizontal: true, vertical: true })
    const item = nav(page).getByRole("link", { name: "Deals and opportunities in progress" })
    expect((await box(item)).height).toBeGreaterThan(44)
    expect(await item.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    const h1 = page.getByRole("heading", { level: 1 })
    expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  })

  test("brand color: primary actions follow it, the current item stays neutral", async ({ page }) => {
    await openApp(page, "customers")
    await page.evaluate(() => document.documentElement.style.setProperty("--primary", "#1e40af"))
    const primary = page.getByRole("link", { name: "顧客を登録" })
    await expect.poll(async () => sameColor(await css(primary, "background-color"), "#1e40af")).toBe(true)
    await page.mouse.move(800, 600)
    const current = nav(page).getByRole("link", { name: "顧客", exact: true })
    const accent = await token(page, "--sidebar-accent")
    await expect.poll(async () => sameColor(await css(current, "background-color"), accent)).toBe(true)
    await page.evaluate(() => document.documentElement.style.removeProperty("--primary"))
  })
})

test.describe("Navigation (mobile)", { tag: "@webkit" }, () => {
  test.skip(({ isMobile }) => !isMobile, "モバイルの表示")

  test("the menu opens from the left, closes after navigation, and focus moves to the page title", async ({ page }) => {
    await openApp(page, "customers")
    await expect(nav(page)).toBeHidden()
    const trigger = page.getByRole("button", { name: "メニュー", exact: true })
    expect((await box(trigger)).height).toBeGreaterThanOrEqual(48)
    await trigger.click()
    const dialog = page.getByRole("dialog", { name: "メニュー" })
    await expect(dialog).toBeVisible()
    // 左から開く。開く動きが終わってから位置を測る
    await animationsDone(dialog)
    expect((await box(dialog)).x).toBeCloseTo(0, 1)
    await expect(dialog.getByRole("link", { name: "顧客", exact: true })).toHaveAttribute("aria-current", "page")
    // 下部の設定とアカウントも、モバイルのメニューから使える
    await expect(dialog.getByRole("link", { name: "設定" })).toBeVisible()
    await dialog.getByRole("link", { name: "請求書" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    const h1 = page.getByRole("heading", { level: 1 })
    await expect(h1).toHaveText("請求書")
    await expect(h1).toBeFocused()
  })

  test("the mobile header respects the safe area", async ({ page }) => {
    await openApp(page, "home")
    await page.locator("[data-app-shell]").evaluate((el) => (el as HTMLElement).style.setProperty("--app-safe-top", "44px"))
    expect(await css(page.getByTestId("structure-mobile-header"), "padding-top")).toBe("44px")
  })
})

// ------------------------------------------------------------------ 検証画面の内容

test.describe("Verification screens", { tag: "@webkit" }, () => {
  test("dashboard: counts come from all matching rows; the period changes the sales metric", async ({ page }) => {
    const expected = customers.filter(
      (c) => c.status === "active" && c.renewalDate !== null && c.renewalDate >= "2026-11-25" && c.renewalDate <= "2026-12-25"
    ).length
    expect(expected).toBeGreaterThan(6)
    await openApp(page, "home")
    await expect(page.getByTestId("metric-30 日以内に更新")).toContainText(`${expected}件`)
    await expect(page.getByText(`ほか ${expected - 6}件。`)).toBeVisible()
    await page.getByRole("link", { name: "更新が近い契約をすべて見る" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("更新が近い契約")
    await go(page, "home")
    await expect(page.getByTestId("metric-今月の売上")).toBeVisible()
    await page.getByRole("combobox", { name: "期間" }).click()
    await page.getByRole("option", { name: "今四半期" }).click()
    await expect(page.getByTestId("metric-今四半期の売上")).toContainText("前四半期比")
  })

  test("customer detail: next action follows the status; unknown ids show a not-found page", async ({ page }) => {
    const paused = customers.find((c) => c.status === "paused")!
    await openApp(page, `customer&id=${paused.id}`)
    await expect(page.getByTestId("next-action")).toHaveText(/^休止中。/)
    await go(page, "customer&id=C-99999")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客が見つからない")
    await page.getByRole("link", { name: "顧客の一覧に戻る" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客")
  })

  test("actions that the preview does not run say so", async ({ page }) => {
    await openApp(page, "customers")
    await page.getByRole("button", { name: "書き出す" }).click()
    await expect(page.getByText("書き出しは、この検証用の画面では実行しない")).toBeVisible()
  })

  test("page width example: the current option is neutral, not filled with the brand color", async ({ page, isMobile }) => {
    test.skip(isMobile, "デスクトップの表示")
    await page.goto("/#/shell-examples?type=layout&width=standard")
    const current = page.getByRole("navigation", { name: "幅と配置" }).getByRole("link", { name: "Standard" })
    await expect(current).toHaveAttribute("aria-current", "page")
    const accent = await token(page, "--sidebar-accent")
    await expect.poll(async () => sameColor(await css(current, "background-color"), accent)).toBe(true)
    expect(sameColor(await css(current, "background-color"), await token(page, "--primary"))).toBe(false)
  })
})

// ------------------------------------------------------------------ Page Header

test.describe("Page Header", { tag: "@webkit" }, () => {
  test("tokens: title, description, actions and the space before the content", async ({ page, isMobile }) => {
    await openApp(page, "home")
    const h1 = page.getByRole("heading", { level: 1 })
    expect(await css(h1, "font-size")).toBe("28px")
    expect(await css(h1, "font-weight")).toBe("600")
    const desc = page.locator("[data-slot=page-header-description]")
    expect(await css(desc, "font-size")).toBe("14px")
    const t = await box(h1)
    expect(Math.round((await box(desc)).y - (t.y + t.height))).toBe(8)
    const header = page.locator("[data-slot=page-header]")
    expect(await css(header, "border-bottom-width")).toBe("0px")
    // 背景はメインの内容と同じ（background）
    expect(sameColor(await css(header, "background-color"), await token(page, "--background"))).toBe(true)
    // 内容との間は 32px
    const h = await box(header)
    const next = await box(page.locator("[data-slot=section-stack]").first())
    expect(Math.round(next.y - (h.y + h.height))).toBe(32)

    await go(page, "customers")
    await expect(h1).toHaveText("顧客")
    const actions = page.locator("[data-slot=page-header-actions]")
    expect(await css(actions, "column-gap")).toBe("8px")
    const a = await box(actions)
    const title = await box(h1)
    if (isMobile) expect(a.y).toBeGreaterThanOrEqual(title.y + title.height)
    else {
      expect(a.x).toBeGreaterThan(title.x + title.width)
      expect(a.y).toBeLessThan(title.y + title.height)
    }
    // 主要な操作は 1 つ
    const primary = await token(page, "--primary")
    let primaries = 0
    for (const el of await actions.locator("a, button").all()) if (sameColor(await css(el, "background-color"), primary)) primaries++
    expect(primaries).toBe(1)
  })

  test("actions move below the title when they do not fit; nothing is hidden", async ({ page, isMobile }) => {
    test.skip(isMobile, "領域の幅を切り替えて確かめる")
    await page.goto("/#/page-header")
    const demo = page.getByTestId("ph-responsive")
    const title = demo.getByRole("heading", { level: 3 })
    const actions = demo.locator("[data-slot=page-header-actions]")
    await page.getByRole("radio", { name: "320px" }).check()
    let t = await settledBox(title)
    let a = await box(actions)
    expect(a.y).toBeGreaterThanOrEqual(t.y + t.height)
    expect(await demo.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await expect(actions.getByRole("button", { name: "顧客を登録" })).toBeVisible()
    await expect(actions.getByRole("button", { name: "書き出す" })).toBeVisible()
    await page.getByRole("radio", { name: "幅いっぱい" }).check()
    await page.getByRole("checkbox", { name: "長いタイトル" }).uncheck()
    t = await settledBox(title)
    a = await box(actions)
    expect(a.x).toBeGreaterThan(t.x + t.width)
  })

  test("sticky: the border appears only while stuck; focused elements are not hidden under it", async ({ page }) => {
    await page.goto("/#/page-header")
    const scroller = page.getByTestId("ph-sticky")
    const header = scroller.locator("[data-slot=page-header]")
    await scroller.scrollIntoViewIfNeeded()
    await expect(header).not.toHaveAttribute("data-stuck")
    await scroller.evaluate((el) => el.scrollTo({ top: 400 }))
    await expect(header).toHaveAttribute("data-stuck", "true")
    const s = await box(scroller)
    const h = await settledBox(header)
    expect(Math.abs(h.y - (s.y + 1))).toBeLessThanOrEqual(1)
    const border = await token(page, "--border")
    await expect.poll(async () => sameColor(await css(header, "border-bottom-color"), border)).toBe(true)
    // スクロールの領域に、固定した高さの scroll-padding-top を設定している
    expect(parseFloat(await css(scroller, "scroll-padding-top"))).toBeCloseTo(h.height, 0)
    // Page Header の下に隠れた位置のボタンにフォーカスすると、見える位置までスクロールする
    const buttons = scroller.getByRole("button", { name: "開く" })
    const n = await buttons.count()
    let hidden = -1
    for (let i = 0; i < n; i++) {
      const b = await box(buttons.nth(i))
      if (b.y + b.height > h.y && b.y < h.y + h.height) {
        hidden = i
        break
      }
    }
    expect(hidden).toBeGreaterThanOrEqual(0)
    await buttons.nth(hidden).focus()
    const after = await settledBox(buttons.nth(hidden))
    expect(after.y).toBeGreaterThanOrEqual(h.y + h.height - 1)
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }))
    await expect(header).not.toHaveAttribute("data-stuck")
  })
})

// ------------------------------------------------------------------ Page Layout

test.describe("Page Layout", { tag: "@webkit" }, () => {
  test("max width per page purpose, left aligned in the sidebar shell", async ({ page, isMobile }) => {
    test.skip(isMobile, "広い画面の幅で確かめる")
    await page.setViewportSize({ width: 1920, height: 1000 })
    const expected: [string, number | "full"][] = [
      ["customers", "full"],
      ["home", 1440],
      ["customer&id=C-00002", 960],
      ["settings", 960],
      ["customer-new", 640],
    ]
    for (const [s, w] of expected) {
      await openApp(page, s)
      const m = await box(main(page))
      const content = await box(page.locator("[data-slot=page-layout-content]").first())
      expect(content.width, s).toBe(w === "full" ? m.width - 48 : w)
      // 左寄せ：ページの間で内容の開始位置がそろう
      expect(content.x, s).toBe(m.x + 24)
    }
    // ログイン（Minimal Shell）は Compact（400px）を中央に置く
    await openApp(page, "login")
    const content = await box(page.locator("[data-slot=page-layout-content]"))
    expect(content.width).toBe(400)
    expect(Math.abs(content.x + content.width / 2 - 960)).toBeLessThanOrEqual(1)
  })

  test("width switching example shows the content width and the padding", async ({ page, isMobile }) => {
    test.skip(isMobile, "広い画面の幅で確かめる")
    await page.setViewportSize({ width: 1920, height: 1000 })
    await page.goto("/#/shell-examples?type=layout&width=standard")
    const measure = page.getByTestId("layout-measure")
    await expect(measure).toHaveText("内容の幅 960px・ページの余白 24px")
    await page.getByRole("navigation", { name: "幅と配置" }).getByRole("link", { name: "Wide" }).click()
    await expect(measure).toHaveText("内容の幅 1440px・ページの余白 24px")
    await page.getByRole("navigation", { name: "幅と配置" }).getByRole("link", { name: "Compact" }).click()
    await expect(measure).toHaveText("内容の幅 400px・ページの余白 24px")
    await page.getByRole("navigation", { name: "幅と配置" }).getByRole("link", { name: "中央寄せ" }).click()
    await expect(page.getByRole("link", { name: "中央寄せ" })).toHaveAttribute("aria-current", "page")
    const m = await box(page.getByTestId("layout-main"))
    const c = await box(page.locator("[data-slot=page-layout-content]"))
    expect(Math.abs(c.x + c.width / 2 - (m.x + m.width / 2))).toBeLessThanOrEqual(1)
  })

  test("columns follow the width of the content area, not the screen; DOM order is kept", async ({ page, isMobile }) => {
    test.skip(isMobile, "領域の幅を切り替えて確かめる")
    await page.goto("/#/page-layout")
    const mainCol = page.getByTestId("columns-main")
    const aside = page.getByTestId("columns-aside")
    await page.getByRole("radio", { name: "幅いっぱい" }).check()
    let m = await settledBox(mainCol)
    let a = await box(aside)
    expect(a.x).toBeGreaterThan(m.x + m.width)
    expect(Math.abs(a.y - m.y)).toBeLessThanOrEqual(1)
    await page.getByRole("radio", { name: "420px" }).check()
    m = await settledBox(mainCol)
    a = await box(aside)
    expect(a.y).toBeGreaterThanOrEqual(m.y + m.height)
    // 同じ画面の幅でも、Sidebar を開閉すると内容の幅が変わり、列が切り替わる
    await page.setViewportSize({ width: 1180, height: 900 })
    await openApp(page, "customer&id=C-00002")
    const asideApp = page.getByTestId("customer-aside")
    const section = page.locator("[data-slot=page-columns] [data-slot=section]").first()
    // 展開時：内容の幅 1180 − 240 − 48 = 892px（56rem 未満）→ 1 列
    expect((await box(asideApp)).y).toBeGreaterThan((await box(section)).y + 100)
    await page.getByTestId("sidebar-collapse").click()
    await expect.poll(async () => (await box(page.locator("[data-slot=sidebar-container]"))).width).toBe(64)
    await animationsDone(page.locator("[data-slot=sidebar-container]"))
    // 折りたたみ時：960px → メインと補足を横に並べる
    await expect.poll(async () => Math.abs((await box(asideApp)).y - (await box(section)).y)).toBeLessThanOrEqual(1)
    await page.getByTestId("sidebar-collapse").click()
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:structure-sidebar-open"))
  })

  test("a wide table scrolls inside its own area only", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await openApp(page, "customers")
    const container = page.getByTestId("customers-table").locator("xpath=..")
    expect(await css(container, "overflow-x")).toBe("auto")
    expect(await container.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    expect(await noPageScroll(page)).toEqual({ horizontal: true, vertical: true })
  })
})

// ------------------------------------------------------------------ Section Layout

test.describe("Section Layout", { tag: "@webkit" }, () => {
  test("heading levels come from nesting; sizes follow the levels", async ({ page }) => {
    await page.goto("/#/section-layout")
    const outline = page.getByTestId("heading-outline")
    await expect(outline.locator("li").nth(0)).toHaveText(/h2 請求の設定\s*24px/)
    await expect(outline.locator("li").nth(1)).toHaveText(/h3 差出人\s*20px/)
    const demo = page.getByTestId("heading-demo")
    // 既定の Section は region のランドマークにしない（aria-labelledby を付けない）
    await expect(demo.locator("[data-slot=section]").first()).not.toHaveAttribute("aria-labelledby")
    expect(await css(demo.locator("[data-slot=section-description]"), "font-size")).toBe("14px")
  })

  test("spacing: heading to content 24px / 16px; SectionStack 48px / 32px; lighter headings in the aside", async ({ page }) => {
    await openApp(page, "customer-new")
    const first = page.locator("form [data-slot=section]").first()
    const h = await box(first.locator("[data-slot=section-header]"))
    const content = await box(first.locator("[data-slot=field-group], [data-slot=field]").first())
    expect(Math.round(content.y - (h.y + h.height))).toBe(24)
    expect(await css(first.getByRole("heading", { level: 2 }), "font-size")).toBe("24px")
    // 顧客の詳細：メインの SectionStack（セクションの間 48px）、補足の列の SectionStack（グループの間 32px）
    await go(page, "customer&id=C-00002")
    await expect(page.getByTestId("screen-customer")).toBeVisible()
    const mainStack = page.locator("[data-slot=page-columns] [data-slot=section-stack]").first()
    expect(await css(mainStack, "row-gap")).toBe("48px")
    const sections = mainStack.locator(":scope > [data-slot=section]")
    const a = await box(sections.nth(0))
    expect(Math.round((await box(sections.nth(1))).y - (a.y + a.height))).toBe(48)
    // セクションの間は余白で区切り、線を引かない
    expect(await css(sections.nth(1), "border-top-width")).toBe("0px")
    const aside = page.getByRole("complementary", { name: "補足の情報" })
    const asideStack = aside.locator("[data-slot=section-stack]")
    expect(await css(asideStack, "row-gap")).toBe("32px")
    // 補足の列の見出しは h3・20px（メインの h2・24px より弱い）
    const asideHeading = aside.getByRole("heading", { level: 3, name: "次にすること" })
    expect(await css(asideHeading, "font-size")).toBe("20px")
    const sub = await box(aside.locator("[data-slot=section]").nth(1).locator("[data-slot=section-header]"))
    const subContent = await box(page.getByTestId("next-action"))
    expect(Math.round(subContent.y - (sub.y + sub.height))).toBe(16)
  })

  test("collapsed details keep the values; errors are shown and focused", async ({ page }) => {
    await openApp(page, "customer-new")
    const trigger = page.getByRole("button", { name: "請求の設定" })
    await trigger.click()
    await page.getByTestId("billing-email").fill("keiri@example.com")
    await trigger.click()
    await expect(page.getByTestId("billing-email")).toBeHidden()
    await trigger.click()
    await expect(page.getByTestId("billing-email")).toHaveValue("keiri@example.com")
    await page.getByRole("button", { name: "登録する" }).click()
    await expect(page.getByText("会社名を入力してください")).toBeVisible()
    await expect(page.getByRole("textbox", { name: /会社名/ })).toBeFocused()
    await page.getByRole("textbox", { name: /会社名/ }).fill("株式会社テスト商事")
    await page.getByRole("button", { name: "登録する" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客")
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    await expect(page.getByText("株式会社テスト商事を登録しました")).toBeVisible()
  })
})

// ------------------------------------------------------------------ Bottom Navigation と Shell の例

test.describe("Bottom Navigation", { tag: "@webkit" }, () => {
  test("mobile: current item, targets, safe area, nothing hidden behind it", async ({ page, isMobile }) => {
    test.skip(!isMobile, "モバイルの表示")
    await page.goto("/#/shell-examples?type=bottom")
    const bottom = page.getByTestId("bottom-nav")
    await expect(bottom).toBeVisible()
    await expect(bottom.getByRole("link")).toHaveCount(4)
    await expect(bottom.getByRole("link", { name: "ホーム" })).toHaveAttribute("aria-current", "page")
    for (const l of await bottom.getByRole("link").all()) expect((await box(l)).height).toBeGreaterThanOrEqual(48)
    // ブランドカラーで塗らない
    expect(await css(bottom.getByRole("link", { name: "ホーム" }), "background-color")).toBe("rgba(0, 0, 0, 0)")
    await bottom.getByRole("link", { name: "予約" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("予約")
    await expect(bottom.getByRole("link", { name: "予約" })).toHaveAttribute("aria-current", "page")
    // 最後の内容までスクロールしても、Bottom Navigation に隠れない
    const m = page.getByTestId("bottom-main")
    await m.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    const last = await settledBox(page.getByTestId("last-content"))
    const nb = await box(bottom)
    expect(last.y + last.height).toBeLessThanOrEqual(nb.y)
    expect(Math.round(nb.y + nb.height)).toBe(page.viewportSize()!.height)
    // Safe Area：下端の余白（擬似的な値で確かめる。実機の値は未検証）
    await page.locator("[data-app-shell]").evaluate((el) => (el as HTMLElement).style.setProperty("--app-safe-bottom", "34px"))
    expect(await css(bottom, "padding-bottom")).toBe("34px")
    expect(Math.round((await box(bottom)).y + (await box(bottom)).height)).toBe(page.viewportSize()!.height)
  })

  test("mobile: hidden while typing on a touch device", async ({ page, isMobile }) => {
    test.skip(!isMobile, "モバイルの表示")
    await page.goto("/#/shell-examples?type=bottom")
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches)
    test.skip(!coarse, "タッチ操作の端末の判定（pointer: coarse）が有効な環境")
    const bottom = page.getByTestId("bottom-nav")
    await expect(bottom).toBeVisible()
    await page.getByTestId("bottom-search").focus()
    await expect(bottom).toBeHidden()
    await page.evaluate(() => (document.activeElement as HTMLElement).blur())
    await expect(bottom).toBeVisible()
  })

  test("desktop: the bottom navigation is not shown; the header navigation is used", async ({ page, isMobile }) => {
    test.skip(isMobile, "デスクトップの表示")
    await page.goto("/#/shell-examples?type=bottom")
    await expect(page.getByTestId("bottom-nav")).toBeHidden()
    await expect(nav(page).getByRole("link", { name: "ホーム" })).toHaveAttribute("aria-current", "page")
  })
})

test.describe("Shell examples", { tag: "@webkit" }, () => {
  test("header shell: top navigation on desktop, left sheet on mobile", async ({ page, isMobile }) => {
    await page.goto("/#/shell-examples?type=header")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("予約")
    if (isMobile) {
      await page.getByRole("button", { name: "メニュー", exact: true }).click()
      const dialog = page.getByRole("dialog", { name: "メニュー" })
      // 左から開く。開く動きが終わってから位置を測る
    await animationsDone(dialog)
    expect((await box(dialog)).x).toBeCloseTo(0, 1)
      await dialog.getByRole("link", { name: "顧客" }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0)
    } else {
      await expect(page.getByRole("button", { name: "メニュー", exact: true })).toBeHidden()
      await nav(page).getByRole("link", { name: "顧客" }).click()
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客")
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused()
    expect(await noPageScroll(page)).toEqual({ horizontal: true, vertical: true })
  })

  test("hybrid shell: the header switches the group, the sidebar shows its features", async ({ page, isMobile }) => {
    test.skip(isMobile, "デスクトップの表示")
    await page.goto("/#/shell-examples?type=hybrid&page=customers")
    const groups = page.getByRole("navigation", { name: "機能群" })
    // 機能群のリンクは、その機能群が現在地であることを aria-current="true" で示す（リンク先のページそのものではないため）
    await expect(groups.getByRole("link", { name: "営業" })).toHaveAttribute("aria-current", "true")
    await expect(nav(page).getByRole("link", { name: "顧客", exact: true })).toBeVisible()
    await groups.getByRole("link", { name: "請求" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("請求書")
    await expect(nav(page).getByRole("link", { name: "入金" })).toBeVisible()
    await expect(nav(page).getByRole("link", { name: "顧客", exact: true })).toHaveCount(0)
    // Sidebar はヘッダーの下から画面の下端まで
    const header = await box(page.getByTestId("hybrid-shell-header"))
    const c = await box(page.locator("[data-slot=sidebar-container]"))
    expect(Math.round(c.y)).toBe(Math.round(header.y + header.height))
    expect(Math.round(c.y + c.height)).toBe(page.viewportSize()!.height)
    expect(await noPageScroll(page)).toEqual({ horizontal: true, vertical: true })
  })

  test("minimal shell: no navigation, centered focused content", async ({ page, isMobile }) => {
    await page.goto("/#/shell-examples?type=minimal")
    await expect(page.getByRole("navigation")).toHaveCount(0)
    await expect(page.getByRole("main")).toHaveCount(1)
    const c = await box(page.locator("[data-slot=page-layout-content]"))
    const vw = page.viewportSize()!.width
    if (!isMobile) expect(c.width).toBe(640)
    expect(Math.abs(c.x + c.width / 2 - vw / 2)).toBeLessThanOrEqual(1)
  })
})

// ------------------------------------------------------------------ スクリーンショット

test.describe("screenshots", () => {
  test("capture", async ({ page, isMobile }, info) => {
    const dir = join(info.project.testDir, "..", "screenshots", info.project.name)
    // Recharts の動き（JavaScript）は animationsDone で待てないため、動きを減らす設定で最後の状態を撮る（Chart は設定に従って動かない）
    await page.emulateMedia({ reducedMotion: "reduce" })
    for (const s of ["home", "customers", "customer&id=C-00002", "customer-new", "settings", "login"]) {
      await openApp(page, s)
      await animationsDone(page.locator("body"))
      await page.screenshot({ path: `${dir}/structure-${s.split("&")[0]}.png` })
    }
    for (const t of ["header", "hybrid", "minimal", "bottom", "layout"]) {
      await page.goto(`/#/shell-examples?type=${t}`)
      await page.getByRole("heading", { level: 1 }).waitFor()
      await animationsDone(page.locator("body"))
      await page.screenshot({ path: `${dir}/shell-${t}.png` })
    }
    for (const id of docPages) {
      await page.goto(`/#/${id}`)
      await page.getByRole("heading", { level: 1 }).first().waitFor()
      await animationsDone(page.locator("body"))
      await page.screenshot({ path: `${dir}/pattern-${id}.png`, fullPage: true })
    }
    if (isMobile) {
      await openApp(page, "customers")
      await page.getByRole("button", { name: "メニュー", exact: true }).click()
      await page.getByRole("dialog").waitFor()
      await animationsDone(page.getByRole("dialog"))
      await page.screenshot({ path: `${dir}/structure-menu-open.png` })
      return
    }
    await openApp(page, "customer&id=C-00002")
    await page.getByTestId("sidebar-collapse").click()
    await expect.poll(async () => (await box(page.locator("[data-slot=sidebar-container]"))).width).toBe(64)
    await animationsDone(page.locator("body"))
    await page.screenshot({ path: `${dir}/structure-collapsed.png` })
    await page.getByTestId("sidebar-collapse").click()
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:structure-sidebar-open"))
  })
})
