import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { animationsDone, colorContrast, css, sameColor, token } from "./helpers"
import { collectPageErrors } from "./page-errors"

// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
collectPageErrors(test)

const pages = ["sidebar", "tabs", "breadcrumb", "card", "accordion", "separator"]

async function open(page: Page, id: string) {
  await page.goto(`/#/${id}`)
  await page.getByRole("heading", { level: 1 }).first().waitFor()
}

const box = async (l: Locator) => (await l.boundingBox())!

// WebKit（Safari）は、既定の設定では Tab でリンクに移動しない。Option + Tab でリンクにも移動する。
const tabKey = (page: Page) => (page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab")

async function tabTo(page: Page, target: Locator) {
  const key = tabKey(page)
  for (let i = 0; i < 150; i++) {
    await page.keyboard.press(key)
    if (await target.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))) return
  }
  throw new Error("target was not reached with Tab")
}

// 「起きないこと」の確認に使う。固定の時間を待たず、イベントの処理と描画が終わった後の状態を見る。
// React の更新は、イベントの処理の後のマイクロタスクか、Scheduler の MessageChannel のタスクで反映される。
// MessageChannel のタスクを 1 回通し、さらに 2 フレームを待つ（page.clock で時計を止めている間は使わない）。
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const c = new MessageChannel()
        c.port1.onmessage = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        c.port2.postMessage(null)
      })
  )
}
// page.clock で時計を止めている間の描画の待機（requestAnimationFrame は時計に従うため、MessageChannel のタスクだけを通す）。
async function flushTasks(page: Page) {
  for (let i = 0; i < 2; i++)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const c = new MessageChannel()
          c.port1.onmessage = () => resolve()
          c.port2.postMessage(null)
        })
    )
}
// 時計を止める。止める前に進める時間（ms）の間に予定されたタイマーは実行される。
async function pauseClock(page: Page, ahead = 1000) {
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + ahead)
}
// 色の変化（transition）が終わった後の値。変化の途中の値（oklab の補間）を測らない。
async function settledCss(l: Locator, prop: string) {
  await animationsDone(l)
  return css(l, prop)
}
// Sidebar の開閉の状態（data-state）。幅の変化（transition）を待たずに、状態の変化の有無を確かめる。
const sidebarState = (container: Locator) => container.locator("xpath=..")

async function expectFocusRing(page: Page, target: Locator) {
  expect(await css(target, "outline-style")).toBe("solid")
  expect(await css(target, "outline-width")).toBe("2px")
  expect(sameColor(await css(target, "outline-color"), await token(page, "--ring"))).toBe(true)
}

const noOverflow = (l: Locator) => l.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)

// ------------------------------------------------------------------ 共通

test.describe("all navigation pages", { tag: "@webkit" }, () => {
  for (const id of pages) {
    test(`${id}: names, no horizontal scroll`, async ({ page }) => {
      await open(page, id)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const main = page.locator("main").first()
      const controls = main
        .getByRole("button")
        .or(main.getByRole("link"))
        .or(main.getByRole("tab"))
        .or(main.getByRole("textbox"))
      const n = await controls.count()
      expect(n).toBeGreaterThan(0)
      for (let i = 0; i < n; i++) {
        const c = controls.nth(i)
        if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
      }
    })
  }

  test("app: names, landmarks, no horizontal scroll", async ({ page }) => {
    for (const p of ["home", "customers", "customer&id=yamada", "settings", "renewals"]) {
      await page.goto(`/#/app?page=${p}`)
      await page.getByRole("heading", { level: 1 }).waitFor()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await expect(page.getByRole("main")).toHaveCount(1)
      const controls = page.getByRole("button").or(page.getByRole("link")).or(page.getByRole("tab"))
      for (let i = 0; i < (await controls.count()); i++) {
        const c = controls.nth(i)
        if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
      }
    }
  })
})

// ------------------------------------------------------------------ Sidebar

test.describe("Sidebar (desktop)", { tag: "@webkit" }, () => {
  test.skip(({ isMobile }) => isMobile, "デスクトップの表示")

  const frame = (page: Page) => page.getByTestId("sidebar-basic")
  const container = (l: Locator) => l.locator("[data-slot=sidebar-container]")

  test("tokens: width, surface, items, current position", async ({ page }) => {
    await open(page, "sidebar")
    const f = frame(page)
    const c = container(f)
    expect((await box(c)).width).toBe(240)
    expect(sameColor(await css(c, "background-color"), await token(page, "--sidebar"))).toBe(true)
    // 背景で区別するため、メインとの境界線を引かない
    expect(await css(c, "border-right-width")).toBe("0px")
    const nav = f.getByRole("navigation", { name: "メインメニュー" })
    const current = nav.getByRole("link", { name: "顧客", exact: true })
    await expect(current).toHaveAttribute("aria-current", "page")
    expect((await box(current)).height).toBe(44)
    expect(await css(current, "border-top-left-radius")).toBe("8px")
    expect(await css(current, "font-size")).toBe("14px")
    expect(await css(current, "font-weight")).toBe("600")
    expect(await css(current, "padding-left")).toBe("12px")
    expect(await css(current, "column-gap")).toBe("12px")
    expect(await css(current, "box-shadow")).toBe("none")
    expect(await css(current, "border-left-width")).toBe("0px")
    expect((await box(current.locator("svg"))).width).toBe(20)
    expect(sameColor(await css(current, "background-color"), await token(page, "--sidebar-accent"))).toBe(true)
    expect(sameColor(await css(current, "color"), await token(page, "--sidebar-accent-foreground"))).toBe(true)
    // 現在位置以外：muted-foreground、太さ 400、面なし
    const other = nav.getByRole("link", { name: "ホーム" })
    await expect(other).not.toHaveAttribute("aria-current")
    expect(await css(other, "font-weight")).toBe("400")
    expect(sameColor(await css(other, "color"), await token(page, "--muted-foreground"))).toBe(true)
    expect(await css(other, "background-color")).toBe("rgba(0, 0, 0, 0)")
    expect(
      await colorContrast(page, await css(other, "color"), await token(page, "--sidebar"))
    ).toBeGreaterThanOrEqual(4.5)
    // 内側の余白 12px
    const group = f.locator("[data-slot=sidebar-group]").first()
    expect(await css(group, "padding-left")).toBe("12px")
  })

  test("hover, focus and current are distinguishable", async ({ page }) => {
    await open(page, "sidebar")
    const nav = frame(page).getByRole("navigation", { name: "メインメニュー" })
    const other = nav.getByRole("link", { name: "請求書" })
    await other.hover()
    // ホバーの面に変わり、色の変化（transition）が終わってから測る
    await expect.poll(async () => sameColor(await settledCss(other, "background-color"), await token(page, "--sidebar"))).toBe(false)
    const hover = await settledCss(other, "background-color")
    const current = await css(nav.getByRole("link", { name: "顧客", exact: true }), "background-color")
    expect(sameColor(hover, current)).toBe(false)
    expect(sameColor(hover, await token(page, "--sidebar"))).toBe(false)
    expect(sameColor(await css(other, "color"), await token(page, "--sidebar-accent-foreground"))).toBe(true)
    expect(await colorContrast(page, await css(other, "color"), hover)).toBeGreaterThanOrEqual(4.5)
    // 現在位置の項目は、ホバーしても現在位置の面のまま
    const currentLink = nav.getByRole("link", { name: "顧客", exact: true })
    await currentLink.hover()
    await settle(page)
    await animationsDone(currentLink)
    expect(sameColor(await css(currentLink, "background-color"), await token(page, "--sidebar-accent"))).toBe(true)
    await page.mouse.move(0, 0)
    await tabTo(page, other)
    await expectFocusRing(page, other)
  })

  test("page switching updates the current position", async ({ page }) => {
    await open(page, "sidebar")
    const f = frame(page)
    const nav = f.getByRole("navigation", { name: "メインメニュー" })
    await nav.getByRole("link", { name: "入金" }).click()
    await expect(nav.getByRole("link", { name: "入金" })).toHaveAttribute("aria-current", "page")
    await expect(nav.getByRole("link", { name: "顧客", exact: true })).not.toHaveAttribute("aria-current")
    await expect(f.getByTestId("frame-title")).toHaveText("入金")
    // ルーティングはプレビュー（製品）が持つ。ページの URL は変えていない
    expect(page.url()).toContain("#/sidebar")
  })

  test("collapse to 64px keeps every item reachable and named", async ({ page }) => {
    await open(page, "sidebar")
    const f = frame(page)
    const c = container(f)
    const inset = f.locator("[data-slot=sidebar-inset]")
    // 縦の位置は、例の枠（frame）の上端からの距離で比べる。ウィンドウからの位置で比べると、メニューのボタンを押すときの
    // ページのスクロール（プレビューの上部の一覧が長く、例が最初の表示の範囲の外にある場合）で値が変わる
    const titleTop = async () => (await box(f.getByTestId("frame-title"))).y - (await box(f)).y
    const headerBefore = await titleTop()
    expect(await css(c, "transition-duration")).toBe("0.32s")
    await f.getByRole("button", { name: "メニュー", exact: true }).click()
    await expect(f.getByTestId("frame-state")).toHaveText("折りたたみ（64px）")
    await expect.poll(async () => (await box(c)).width).toBe(64)
    // メインは Sidebar の右端から始まり、縦の位置は変わらない
    expect(Math.round((await box(inset)).x - (await box(f)).x)).toBe(64 + 1)
    expect(await titleTop()).toBe(headerBefore)
    const nav = f.getByRole("navigation", { name: "メインメニュー" })
    for (const name of ["ホーム", "顧客", "商談", "請求書", "入金"]) {
      const link = nav.getByRole("link", { name, exact: true })
      await expect(link).toBeVisible()
      const b = await box(link)
      expect(b.x + b.width).toBeLessThanOrEqual((await box(c)).x + 64)
      // 名前は視覚的に隠す
      expect((await box(link.locator("span"))).width).toBeLessThanOrEqual(1)
    }
    // 子を持つ項目は、メニューを開くボタンになる
    for (const name of ["契約", "レポート"]) {
      const parent = nav.getByRole("button", { name, exact: true })
      await expect(parent).toBeVisible()
      await expect(parent).toHaveAttribute("aria-haspopup", "menu")
    }
    await expect(f.getByRole("link", { name: "設定" })).toBeVisible()
    // 折りたたんだまま移動できる
    await nav.getByRole("link", { name: "入金" }).click()
    await expect(nav.getByRole("link", { name: "入金" })).toHaveAttribute("aria-current", "page")
    await expect.poll(async () => (await box(c)).width).toBe(64)
  })

  test("collapsed: parents open their children in a dropdown menu (mouse)", async ({ page }) => {
    // Tooltip の遅延（700ms）を、時計を止めて進めて確かめる（固定の時間を待たない）
    await page.clock.install()
    await open(page, "sidebar")
    const f = frame(page)
    await f.getByRole("button", { name: "メニュー", exact: true }).click()
    await expect.poll(async () => (await box(container(f))).width).toBe(64)
    const nav = f.getByRole("navigation", { name: "メインメニュー" })
    const parent = nav.getByRole("button", { name: "契約", exact: true })
    // 子を持つ項目には Tooltip を付けない（メニューの見出しで名前がわかる）
    await pauseClock(page)
    await parent.hover()
    await page.clock.runFor(900)
    await flushTasks(page)
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveCount(0)
    await page.clock.resume()
    await parent.click()
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    await expect(parent).toHaveAttribute("aria-expanded", "true")
    // 親のページと子のページの両方へ移動できる
    await expect(menu.getByRole("menuitem")).toHaveText(["契約の一覧", "更新が近い契約", "解約の申し込み"])
    await expect(menu.getByText("契約", { exact: true })).toBeVisible()
    // メニューは項目の右に表示する
    // 開く動き（拡大）が終わってから位置を測る
    await animationsDone(menu)
    expect((await box(menu)).x).toBeGreaterThanOrEqual((await box(container(f))).x + 64)
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveCount(0)
    await menu.getByRole("menuitem", { name: "更新が近い契約" }).click()
    await expect(menu).toBeHidden()
    await expect(f.getByTestId("frame-title")).toHaveText("更新が近い契約")
    // 子が現在位置のとき、折りたたみ時は親を現在位置の面で示す
    expect(sameColor(await css(parent, "background-color"), await token(page, "--sidebar-accent"))).toBe(true)
    await parent.click()
    await expect(page.getByRole("menu").getByRole("menuitem", { name: "更新が近い契約" })).toHaveAttribute("aria-current", "page")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toBeHidden()
    await expect(parent).toBeFocused()
    // 親が自身のページを持たない項目
    await nav.getByRole("button", { name: "レポート", exact: true }).click()
    await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["売上のレポート", "契約の推移"])
    await page.keyboard.press("Escape")
    // 子を持たない項目の Tooltip は、これまでどおり表示する
    await page.mouse.move(0, 0)
    await nav.getByRole("link", { name: "請求書" }).hover()
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveText("請求書", { timeout: 2000 })
  })

  test("collapsed: dropdown menu works with the keyboard and returns focus", async ({ page }) => {
    await open(page, "sidebar")
    const f = frame(page)
    await f.getByRole("button", { name: "メニュー", exact: true }).click()
    await expect.poll(async () => (await box(container(f))).width).toBe(64)
    const nav = f.getByRole("navigation", { name: "メインメニュー" })
    const parent = nav.getByRole("button", { name: "契約", exact: true })
    await tabTo(page, parent)
    await expectFocusRing(page, parent)
    await page.keyboard.press("Enter")
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    await expect(menu.getByRole("menuitem").first()).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(menu.getByRole("menuitem", { name: "更新が近い契約" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    await expect(parent).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menu").getByRole("menuitem").first()).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("menu").getByRole("menuitem", { name: "解約の申し込み" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menu")).toBeHidden()
    await expect(f.getByTestId("frame-title")).toHaveText("解約の申し込み")
    await expect(parent).toBeFocused()
    // 親のページ（契約の一覧）へも移動できる
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menu").getByRole("menuitem").first()).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(f.getByTestId("frame-title")).toHaveText("契約")
  })

  test("collapsed items show their name in a tooltip after 700ms", async ({ page }) => {
    // 表示しないこと・表示する時期を、時計を止めて進めて確かめる（固定の時間を待たない）
    await page.clock.install()
    await open(page, "sidebar")
    const f = frame(page)
    const nav = f.getByRole("navigation", { name: "メインメニュー" })
    const item = nav.getByRole("link", { name: "請求書" })
    // 展開時は名前が見えているため、Tooltip を表示しない
    await pauseClock(page)
    await item.hover()
    await page.clock.runFor(900)
    await flushTasks(page)
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveCount(0)
    await page.clock.resume()
    await f.getByRole("button", { name: "メニュー", exact: true }).click()
    await expect.poll(async () => (await box(container(f))).width).toBe(64)
    // 折りたたみの動き（項目の名前の非表示など）が終わってから、項目の上にポインターを置く
    await animationsDone(container(f))
    await page.mouse.move(0, 0)
    await pauseClock(page)
    await item.hover()
    // 700ms より前には表示しない。時計を 300ms だけ進めて確かめ、さらに 500ms 進めると表示する
    await page.clock.runFor(300)
    await flushTasks(page)
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveCount(0)
    await page.clock.runFor(500)
    const tip = page.locator("[data-slot=tooltip-content]")
    await expect(tip).toBeVisible({ timeout: 2000 })
    await page.clock.resume()
    await expect(tip).toHaveText("請求書")
    // 項目の右に表示し、名前は変わらない（Tooltip は視覚的な補助）
    expect((await box(tip)).x).toBeGreaterThan((await box(item)).x + (await box(item)).width)
    await expect(item).toHaveAccessibleName("請求書")
    await page.mouse.move(0, 0)
    await expect(tip).toBeHidden()
    // キーボードのフォーカスでも表示する
    await item.focus()
    await page.keyboard.press(tabKey(page))
    await expect(nav.getByRole("link", { name: "入金" })).toBeFocused()
    await expect(page.locator("[data-slot=tooltip-content]")).toHaveText("入金", { timeout: 2000 })
  })

  test("loading skeleton keeps the item height and is hidden from assistive technology", async ({ page }) => {
    await open(page, "sidebar")
    const loading = page.getByTestId("sidebar-loading")
    await expect(loading.locator("[aria-busy=true]")).toHaveCount(1)
    const items = loading.locator("[data-slot=sidebar-menu-skeleton]")
    expect(await items.count()).toBe(4)
    expect((await box(items.first())).height).toBe(44)
    for (const sk of await items.locator("[data-slot=skeleton]").all()) await expect(sk).toHaveAttribute("aria-hidden", "true")
  })

  test("two levels: parent link with a toggle, parent button, current position", async ({ page }) => {
    await open(page, "sidebar")
    const nav = frame(page).getByRole("navigation", { name: "メインメニュー" })
    // 親が自身のページを持つ場合：親はリンク、子の開閉は別のボタン
    const parentLink = nav.getByRole("link", { name: "契約", exact: true })
    const toggle = nav.getByRole("button", { name: "契約の下の項目" })
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    const subId = await toggle.getAttribute("aria-controls")
    await expect(nav.locator(`[id="${subId}"]`)).toBeVisible()
    const child = nav.getByRole("link", { name: "更新が近い契約" })
    await child.click()
    await expect(child).toHaveAttribute("aria-current", "page")
    expect(await css(child, "font-weight")).toBe("600")
    await expect(parentLink).not.toHaveAttribute("aria-current")
    await parentLink.click()
    await expect(parentLink).toHaveAttribute("aria-current", "page")
    // 子の文字は親の文字の位置にそろえる
    const parentText = await box(parentLink.locator("span"))
    expect(Math.round((await box(child)).x + 12)).toBe(Math.round(parentText.x))
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await expect(child).toBeHidden()
    // 親が自身のページを持たない場合：親はボタンで、子を開閉する
    const parentButton = nav.getByRole("button", { name: "レポート", exact: true })
    await expect(parentButton).toHaveAttribute("aria-expanded", "false")
    await parentButton.click()
    await expect(nav.getByRole("link", { name: "売上のレポート" })).toBeVisible()
    // 開閉のボタンは、タッチ操作でも押しやすい大きさ（24px 以上、項目と重ならない）
    const tb = await box(toggle)
    expect(tb.width).toBeGreaterThanOrEqual(32)
    expect(tb.x).toBeGreaterThanOrEqual((await box(parentLink)).x + 100)
  })

  test("keyboard shortcut toggles, except inside text fields", async ({ page }) => {
    await page.goto("/#/app?page=settings")
    await page.getByRole("heading", { level: 1 }).waitFor()
    const c = page.locator("[data-slot=sidebar-container]")
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:sidebar-open"))
    await page.getByRole("heading", { level: 1 }).click()
    const mod = process.platform === "darwin" ? "Meta" : "Control"
    await page.keyboard.press(`${mod}+b`)
    await expect.poll(async () => (await box(c)).width).toBe(64)
    await page.keyboard.press(`${mod}+b`)
    await expect.poll(async () => (await box(c)).width).toBe(240)
    await page.getByRole("textbox", { name: "会社名" }).focus()
    await page.keyboard.press(`${mod}+b`)
    await settle(page)
    await expect(sidebarState(c)).toHaveAttribute("data-state", "expanded")
    expect((await box(c)).width).toBe(240)
  })

  test("state is controlled and saved by the product", async ({ page }) => {
    await open(page, "sidebar")
    const f = page.getByTestId("sidebar-controlled")
    await page.getByTestId("controlled-collapse").click()
    await expect.poll(async () => (await box(container(f))).width).toBe(64)
    await expect(page.getByTestId("controlled-value")).toContainText("open = false")
    await f.getByRole("button", { name: "メニュー", exact: true }).click()
    await expect(page.getByTestId("controlled-value")).toContainText("open = true")
    // 業務アプリの例は、製品として localStorage に保存する
    await page.goto("/#/app?page=home")
    await page.getByRole("button", { name: "メニュー", exact: true }).click()
    await page.reload()
    await page.getByRole("heading", { level: 1 }).waitFor()
    await expect.poll(async () => (await box(page.locator("[data-slot=sidebar-container]"))).width).toBe(64)
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:sidebar-open"))
  })

  test("long labels wrap inside 240px", async ({ page }) => {
    await open(page, "sidebar")
    const f = page.getByTestId("sidebar-long")
    const link = f.getByRole("link", { name: "Contract renewals and cancellations" })
    expect((await box(link)).height).toBeGreaterThan(44)
    expect(await noOverflow(link)).toBe(true)
    expect((await box(link)).width).toBeLessThanOrEqual(240 - 24)
  })

  test("reduced motion stops the width animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "sidebar")
    expect(await css(container(frame(page)), "transition-duration")).toBe("0s")
  })

  test("brand color does not fill the current item", async ({ page }) => {
    await open(page, "sidebar")
    await page.getByRole("radio", { name: "青" }).check()
    const current = frame(page).getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "顧客", exact: true })
    expect(sameColor(await css(current, "background-color"), await token(page, "--sidebar-accent"))).toBe(true)
    // 同じページのまま業務アプリの例へ移動し、ブランドカラーを保つ
    await page.getByRole("link", { name: "業務アプリの例" }).first().click()
    await page.getByTestId("app-dashboard").waitFor()
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "顧客", exact: true }).click()
    const primary = page.getByRole("button", { name: "顧客を追加" })
    await expect(primary).toBeVisible()
    expect(sameColor(await css(primary, "background-color"), "#1e40af")).toBe(true)
    const appCurrent = page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "顧客", exact: true })
    await page.mouse.move(0, 0)
    // ホバーが外れ、色の変化（transition）が終わった後の面
    await expect.poll(async () => sameColor(await settledCss(appCurrent, "background-color"), await token(page, "--sidebar-accent"))).toBe(true)
    expect(sameColor(await css(appCurrent, "background-color"), await token(page, "--sidebar-accent"))).toBe(true)
  })
})

test.describe("Sidebar (mobile)", { tag: "@webkit" }, () => {
  test.skip(({ isMobile }) => !isMobile, "モバイルの表示")

  test("menu opens as a sheet, traps focus, closes with Escape and after navigation", async ({ page }) => {
    await page.goto("/#/app?page=customers")
    await page.getByRole("heading", { level: 1 }).waitFor()
    // 常時表示しない
    await expect(page.getByRole("navigation", { name: "メインメニュー" })).toBeHidden()
    const trigger = page.getByRole("button", { name: "メニュー", exact: true })
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect((await box(trigger)).height).toBeGreaterThanOrEqual(48)
    await trigger.click()
    const dialog = page.getByRole("dialog", { name: "メニュー" })
    await expect(dialog).toBeVisible()
    // 開いている間、背景は支援技術から隠れるため、属性は要素を直接確認する
    await expect(page.locator("[data-slot=sidebar-trigger]")).toHaveAttribute("aria-expanded", "true")
    // タッチ操作では 48px 以上
    const item = dialog.getByRole("link", { name: "請求書" })
    expect((await box(item)).height).toBeGreaterThanOrEqual(48)
    await expect(dialog.getByRole("link", { name: "顧客", exact: true })).toHaveAttribute("aria-current", "page")
    // フォーカスは Sheet の中にとどまる
    // Base UI は、末尾に達したフォーカスを次の描画で先頭へ戻す。人の操作の間隔に近づけるため、少し待つ。
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press(tabKey(page))
      await page.waitForTimeout(50)
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    // 背景は操作できない
    expect(await page.evaluate(() => document.elementFromPoint(window.innerWidth - 8, 200)?.closest("[role=dialog]"))).toBeNull()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    // 移動したら閉じる
    await trigger.click()
    await page.getByRole("dialog", { name: "メニュー" }).getByRole("link", { name: "設定" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("設定")
  })

  test("sheet respects the safe area and the closing button has a name", async ({ page }) => {
    await page.goto("/#/app?page=home")
    await page.getByRole("button", { name: "メニュー", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "メニュー" })
    await expect(dialog.getByRole("button", { name: "メニューを閉じる" })).toBeVisible()
    const inner = dialog.locator("[data-slot=sidebar-header]").locator("..")
    expect(await css(inner, "padding-top")).toMatch(/px$/)
    expect((await box(dialog)).width).toBeLessThanOrEqual(page.viewportSize()!.width - 48)
  })
})

// ------------------------------------------------------------------ Tabs

test.describe("Tabs", { tag: "@webkit" }, () => {
  test("line: tokens and relationships", async ({ page }) => {
    await open(page, "tabs")
    const root = page.getByTestId("tabs-line")
    const list = root.getByRole("tablist")
    const tabs = list.getByRole("tab")
    const first = tabs.nth(0)
    expect((await box(first)).height).toBe(48)
    expect(await css(first, "font-size")).toBe("14px")
    expect(await css(first, "font-weight")).toBe("500")
    expect(await css(tabs.nth(1), "font-weight")).toBe("500")
    expect(await css(first, "box-shadow")).toBe("none")
    expect(await css(first, "transition-duration")).toBe("0.12s")
    // 下線 2px、選択中だけ表示
    const after = (l: Locator, p: string) => l.evaluate((el, q) => getComputedStyle(el, "::after").getPropertyValue(q), p)
    expect(await after(first, "height")).toBe("2px")
    expect(await after(first, "opacity")).toBe("1")
    expect(await after(tabs.nth(1), "opacity")).toBe("0")
    expect(sameColor(await css(first, "color"), await token(page, "--foreground"))).toBe(true)
    expect(sameColor(await css(tabs.nth(1), "color"), await token(page, "--muted-foreground"))).toBe(true)
    // タブの間 24px
    const a = await box(tabs.nth(0))
    const b = await box(tabs.nth(1))
    expect(Math.round(b.x - (a.x + a.width))).toBe(24)
    // 内容との間 24px（下線から内容まで）
    const panel = root.getByRole("tabpanel")
    expect(Math.round((await box(panel)).y - (a.y + a.height))).toBe(24)
    // 関連付け
    await expect(first).toHaveAttribute("aria-selected", "true")
    const panelId = await first.getAttribute("aria-controls")
    expect(panelId).toBeTruthy()
    await expect(page.locator(`[id="${panelId}"]`)).toHaveAttribute("role", "tabpanel")
    await expect(panel).toHaveAccessibleName("概要")
    await expect(list).toHaveAccessibleName("山田商事の情報")
  })

  test("arrow keys select automatically, disabled tabs are skipped", async ({ page }) => {
    await open(page, "tabs")
    const root = page.getByTestId("tabs-line")
    const tabs = root.getByRole("tab")
    const widths = await tabs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))
    await tabTo(page, tabs.nth(0))
    await expectFocusRing(page, tabs.nth(0))
    await page.keyboard.press("ArrowRight")
    await expect(tabs.nth(1)).toBeFocused()
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true")
    await expect(root.getByRole("tabpanel", { name: "契約" })).toContainText("スタンダードプラン")
    await page.keyboard.press("ArrowRight")
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true")
    // 無効なタブは選ばれない（フォーカスは移り、無効であることを支援技術に伝える）
    await page.keyboard.press("ArrowRight")
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true")
    await expect(tabs.nth(3)).toHaveAttribute("aria-selected", "false")
    await page.keyboard.press("Home")
    await expect(tabs.nth(0)).toBeFocused()
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true")
    // 選択の切り替えでタブの幅は変わらない
    expect(await tabs.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))).toEqual(widths)
    await expect(tabs.nth(3)).toHaveAttribute("aria-disabled", "true")
  })

  test("hidden panels are hidden from everyone and keep their input", async ({ page }) => {
    await open(page, "tabs")
    const root = page.getByTestId("tabs-line")
    await expect(root.getByRole("tabpanel")).toHaveCount(1)
    const hidden = root.locator("[data-slot=tabs-content][hidden]")
    expect(await hidden.count()).toBe(3)
    const keep = page.getByTestId("tabs-keep")
    await page.getByTestId("tabs-keep-input").fill("株式会社山田商事")
    await keep.getByRole("tab", { name: "請求先" }).click()
    await expect(page.getByTestId("tabs-keep-input")).toBeHidden()
    await keep.getByRole("tab", { name: "基本情報" }).click()
    await expect(page.getByTestId("tabs-keep-input")).toHaveValue("株式会社山田商事")
  })

  test("manual activation waits for Enter", async ({ page }) => {
    await open(page, "tabs")
    const root = page.getByTestId("tabs-manual")
    const tabs = root.getByRole("tab")
    await tabTo(page, tabs.nth(0))
    await page.keyboard.press("ArrowRight")
    await expect(tabs.nth(1)).toBeFocused()
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Enter")
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true")
    await expect(root.getByRole("tabpanel", { name: "担当者別の集計" }).getByRole("status")).toHaveText(
      "担当者別の集計を表示しました"
    )
  })

  test("many tabs scroll horizontally without shrinking text", async ({ page }) => {
    await open(page, "tabs")
    const list = page.getByTestId("tabs-many").getByRole("tablist")
    expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    expect(await css(list, "overflow-x")).toBe("auto")
    const tabs = list.getByRole("tab")
    expect(await css(tabs.last(), "font-size")).toBe("14px")
    expect(await css(tabs.last(), "white-space")).toBe("nowrap")
    // フォーカスの線が切れない余白（4px）
    expect(await css(list, "padding-top")).toBe("4px")
    expect(await css(list, "padding-left")).toBe("4px")
    await tabTo(page, tabs.first())
    await page.keyboard.press("End")
    await expect(tabs.last()).toBeFocused()
    const l = await box(list)
    const t = await box(tabs.last())
    expect(t.x + t.width).toBeLessThanOrEqual(l.x + l.width + 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test("filled: compatibility variant", async ({ page }) => {
    await open(page, "tabs")
    const list = page.getByTestId("tabs-filled").getByRole("tablist")
    expect(sameColor(await css(list, "background-color"), await token(page, "--muted"))).toBe(true)
    const active = list.getByRole("tab", { name: "月" })
    expect(sameColor(await css(active, "background-color"), await token(page, "--background"))).toBe(true)
    expect(sameColor(await css(active, "border-top-color"), await token(page, "--input"))).toBe(true)
    expect(await css(active, "box-shadow")).toBe("none")
    expect((await box(list)).height).toBe(48)
    const other = list.getByRole("tab", { name: "年" })
    expect(await colorContrast(page, await css(other, "color"), await token(page, "--muted"))).toBeGreaterThanOrEqual(4.5)
    await other.click()
    await expect(other).toHaveAttribute("aria-selected", "true")
  })

  test("reduced motion keeps color changes only", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "tabs")
    const first = page.getByTestId("tabs-line").getByRole("tab").first()
    expect(await css(first, "transition-property")).not.toContain("transform")
    expect(await css(first, "transition-property")).not.toContain("translate")
  })
})

// ------------------------------------------------------------------ Breadcrumb

test.describe("Breadcrumb", { tag: "@webkit" }, () => {
  test("links, current position, home name, tokens", async ({ page }) => {
    await open(page, "breadcrumb")
    const nav = page.getByTestId("breadcrumb-basic")
    await expect(nav).toHaveAccessibleName("パンくずリスト")
    const home = nav.getByRole("link", { name: "ホーム" })
    await expect(home).toHaveAttribute("href", /#/)
    expect((await box(home.locator("svg"))).width).toBe(16)
    await expect(nav.getByRole("link", { name: "顧客", exact: true })).toHaveAttribute("href", /#/)
    const current = page.getByTestId("breadcrumb-current")
    await expect(current).toHaveAttribute("aria-current", "page")
    await expect(current).not.toHaveAttribute("role")
    expect(await current.evaluate((el) => el.closest("a"))).toBeNull()
    await expect(nav.getByRole("link")).toHaveCount(2)
    expect(await css(current, "font-weight")).toBe("500")
    expect(sameColor(await css(current, "color"), await token(page, "--foreground"))).toBe(true)
    const link = nav.getByRole("link", { name: "顧客", exact: true })
    expect(sameColor(await css(link, "color"), await token(page, "--muted-foreground"))).toBe(true)
    expect(await css(link, "font-size")).toBe("14px")
    expect(await css(nav.locator("ol"), "column-gap")).toBe("8px")
    const sep = nav.locator("[data-slot=breadcrumb-separator]").first()
    await expect(sep).toHaveAttribute("aria-hidden", "true")
    expect((await box(sep.locator("svg"))).width).toBe(16)
    for (const el of [nav, nav.locator("ol")]) {
      expect(await css(el, "background-color")).toBe("rgba(0, 0, 0, 0)")
      expect(await css(el, "box-shadow")).toBe("none")
      expect(await css(el, "border-top-width")).toBe("0px")
    }
    await tabTo(page, link)
    await expectFocusRing(page, link)
  })

  test("deep hierarchy: omitted levels can be shown", async ({ page }) => {
    await open(page, "breadcrumb")
    const nav = page.getByTestId("breadcrumb-deep")
    // ホーム、直近の 2 階層、現在位置
    await expect(nav.getByRole("link")).toHaveCount(3)
    await expect(nav.getByRole("link", { name: "請求書" })).toBeVisible()
    await expect(nav.locator("[aria-current=page]")).toHaveText("2026年11月分")
    const expand = page.getByTestId("breadcrumb-expand")
    await expect(expand).toHaveAccessibleName("省略した 3 つの階層を表示")
    await expand.click()
    await expect(nav.getByRole("link")).toHaveCount(6)
    await expect(nav.getByRole("link", { name: "顧客", exact: true })).toBeFocused()
  })

  test("mobile layout stays inside the width", async ({ page, isMobile }) => {
    await open(page, "breadcrumb")
    const nav = page.getByTestId("breadcrumb-responsive")
    const middle = nav.getByRole("link", { name: "株式会社山田商事" })
    if (isMobile) {
      await expect(middle).toBeHidden()
      await expect(nav.getByText("省略した階層")).toBeAttached()
    } else {
      await expect(middle).toBeVisible()
    }
    for (const id of ["breadcrumb-responsive", "breadcrumb-long"]) {
      const list = page.getByTestId(id).locator("ol")
      expect(await noOverflow(list)).toBe(true)
      const lb = await box(list)
      const items = list.locator("li")
      for (let i = 0; i < (await items.count()); i++) {
        if (!(await items.nth(i).isVisible())) continue
        const b = await box(items.nth(i))
        expect(b.x + b.width).toBeLessThanOrEqual(lb.x + lb.width + 1)
      }
    }
  })
})

// ------------------------------------------------------------------ Card

test.describe("Card", { tag: "@webkit" }, () => {
  test("tokens: radius, border, padding, title, no shadow", async ({ page }) => {
    await open(page, "card")
    const card = page.getByTestId("card-default")
    expect(await css(card, "border-top-left-radius")).toBe("20px")
    expect(await css(card, "border-top-width")).toBe("1px")
    expect(sameColor(await css(card, "border-top-color"), await token(page, "--border"))).toBe(true)
    expect(sameColor(await css(card, "background-color"), await token(page, "--card"))).toBe(true)
    expect(await css(card, "padding-left")).toBe("24px")
    expect(await css(card, "row-gap")).toBe("16px")
    expect(await css(card, "box-shadow")).toBe("none")
    const title = page.getByTestId("card-default-title")
    expect(await css(title, "font-size")).toBe("20px")
    expect(await css(title, "font-weight")).toBe("600")
    expect(await css(page.getByTestId("card-sm"), "padding-left")).toBe("16px")
    expect(await css(page.getByTestId("card-sm"), "border-top-left-radius")).toBe("20px")
    expect(await css(page.getByTestId("card-lg"), "padding-left")).toBe("32px")
    expect(await css(page.getByTestId("card-lg"), "border-top-left-radius")).toBe("24px")
    // 大きさを指定しても、className で余白を上書きできる
    expect(await css(page.getByTestId("card-sm-override"), "padding-left")).toBe("0px")
    for (const c of await page.locator("[data-slot=card]").all()) expect(await css(c, "box-shadow")).toBe("none")
  })

  test("long content and responsive grid", async ({ page, isMobile }) => {
    await open(page, "card")
    const long = page.getByTestId("card-long")
    expect(await noOverflow(long)).toBe(true)
    expect(await noOverflow(long.locator("[data-slot=card-title]"))).toBe(true)
    const cards = page.getByTestId("card-grid").locator("[data-slot=card]")
    const xs = new Set(await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x))))
    expect(xs.size).toBe(isMobile ? 1 : 2)
    for (const c of await cards.all()) expect(await noOverflow(c)).toBe(true)
  })

  test("interactive card: whole card is the link, with hover and focus", async ({ page, isMobile }) => {
    await open(page, "card")
    const card = page.getByTestId("card-link").first()
    await card.scrollIntoViewIfNeeded()
    const b = await box(card)
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.textContent, [
      b.x + b.width - 12,
      b.y + b.height - 8,
    ])
    expect(hit).toBe("株式会社山田商事")
    if (!isMobile) {
      await card.hover()
      await expect.poll(async () => sameColor(await settledCss(card, "background-color"), await token(page, "--accent"))).toBe(true)
    }
    await tabTo(page, card.getByRole("link"))
    await expectFocusRing(page, card)
  })
})

// ------------------------------------------------------------------ Accordion

test.describe("Accordion", { tag: "@webkit" }, () => {
  test("tokens and heading structure", async ({ page }) => {
    await open(page, "accordion")
    const root = page.getByTestId("accordion-multiple")
    const trigger = root.getByRole("button").first()
    expect((await box(trigger)).height).toBeGreaterThanOrEqual(48)
    expect(await css(trigger, "font-size")).toBe("16px")
    expect(await css(trigger, "font-weight")).toBe("500")
    expect((await box(trigger.locator("svg"))).width).toBe(20)
    await expect(root.getByRole("heading", { level: 3 })).toHaveCount(3)
    await expect(root.getByRole("heading", { level: 3 }).first().getByRole("button")).toHaveCount(1)
    const item = root.locator("[data-slot=accordion-item]").first()
    expect(await css(item, "border-bottom-width")).toBe("1px")
    expect(sameColor(await css(item, "border-bottom-color"), await token(page, "--border"))).toBe(true)
    expect(await css(item, "background-color")).toBe("rgba(0, 0, 0, 0)")
    expect(await css(item, "box-shadow")).toBe("none")
    expect(await css(root.locator("[data-slot=accordion-item]").last(), "border-bottom-width")).toBe("0px")
    const panel = root.locator("[data-slot=accordion-content]").first()
    expect(await css(panel, "transition-duration")).toBe("0.24s")
    expect(await css(panel.locator("[data-slot=accordion-content-inner]"), "padding-bottom")).toBe("16px")
  })

  test("multiple items open at the same time", async ({ page }) => {
    await open(page, "accordion")
    const root = page.getByTestId("accordion-multiple")
    const [a, b] = [root.getByRole("button").nth(0), root.getByRole("button").nth(1)]
    await a.click()
    await b.click()
    await expect(a).toHaveAttribute("aria-expanded", "true")
    await expect(b).toHaveAttribute("aria-expanded", "true")
    await expect(root.getByRole("region")).toHaveCount(2)
    // アイコンの向き
    expect(await css(a.locator("svg"), "rotate")).not.toBe("none")
  })

  test("single item mode closes the other item", async ({ page }) => {
    await open(page, "accordion")
    const root = page.getByTestId("accordion-single")
    const [a, b] = [root.getByRole("button").nth(0), root.getByRole("button").nth(1)]
    await expect(a).toHaveAttribute("aria-expanded", "true")
    await b.click()
    await expect(b).toHaveAttribute("aria-expanded", "true")
    await expect(a).toHaveAttribute("aria-expanded", "false")
  })

  test("keyboard: Enter and Space toggle, focus ring", async ({ page }) => {
    await open(page, "accordion")
    const trigger = page.getByTestId("accordion-multiple").getByRole("button").first()
    await tabTo(page, trigger)
    await expectFocusRing(page, trigger)
    await page.keyboard.press("Enter")
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    const panelId = await trigger.getAttribute("aria-controls")
    await expect(page.locator(`[id="${panelId}"]`)).toBeVisible()
    await page.keyboard.press("Space")
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(page.locator(`[id="${panelId}"]`)).toBeHidden()
  })

  test("dynamic height and kept input", async ({ page }) => {
    await open(page, "accordion")
    const root = page.getByTestId("accordion-dynamic")
    const panel = root.locator("[data-slot=accordion-content]")
    const before = (await box(panel)).height
    await root.getByRole("button", { name: "さらに表示" }).click()
    await root.getByRole("button", { name: "さらに表示" }).click()
    await expect(page.getByTestId("accordion-dynamic-list").locator("li")).toHaveCount(3)
    await expect.poll(async () => (await box(panel)).height).toBeGreaterThan(before)
    expect(await panel.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)

    const keep = page.getByTestId("accordion-keep")
    const trigger = keep.getByRole("button", { name: "社内メモ" })
    await trigger.click()
    // 中の入力欄のフォーカスの線（外側 4px）が、内容の領域で切れない
    const keepPanel = keep.locator("[data-slot=accordion-content]")
    expect(await css(keepPanel, "padding-left")).toBe("4px")
    expect(await css(keepPanel.locator("[data-slot=accordion-content-inner]"), "padding-top")).toBe("4px")
    await page.getByTestId("accordion-keep-input").fill("決裁は4月")
    await trigger.click()
    await expect(page.getByTestId("accordion-keep-input")).toBeHidden()
    await trigger.click()
    await expect(page.getByTestId("accordion-keep-input")).toHaveValue("決裁は4月")
  })

  test("reduced motion removes the height animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "accordion")
    const root = page.getByTestId("accordion-multiple")
    expect(await css(root.locator("[data-slot=accordion-content]").first(), "transition-duration")).toBe("0s")
    expect(await css(root.getByRole("button").first().locator("svg"), "transition-duration")).toBe("0s")
  })

  test("long labels wrap", async ({ page }) => {
    await open(page, "accordion")
    for (const t of await page.getByTestId("accordion-long").getByRole("button").all()) {
      expect(await noOverflow(t)).toBe(true)
    }
  })
})

// ------------------------------------------------------------------ Separator

test.describe("Separator", { tag: "@webkit" }, () => {
  test("orientation, thickness, color", async ({ page }) => {
    await open(page, "separator")
    const h = page.getByTestId("separator-horizontal")
    expect((await box(h)).height).toBe(1)
    expect(sameColor(await css(h, "background-color"), await token(page, "--border"))).toBe(true)
    expect(await css(h, "box-shadow")).toBe("none")
    expect(await css(h, "background-image")).toBe("none")
    const v = page.getByTestId("separator-vertical")
    expect((await box(v)).width).toBe(1)
    expect((await box(v)).height).toBe(24)
    await expect(v).toHaveAttribute("aria-orientation", "vertical")
  })

  test("semantic and decorative", async ({ page }) => {
    await open(page, "separator")
    await expect(page.getByTestId("separator-semantic")).toHaveAttribute("role", "separator")
    const d = page.getByTestId("separator-decorative")
    await expect(d).toHaveAttribute("role", "none")
    await expect(d).not.toHaveAttribute("aria-orientation")
    const roles = await page.locator("main").getByRole("separator").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))
    expect(roles).not.toContain("separator-decorative")
    expect(roles).toContain("separator-semantic")
  })
})

// ------------------------------------------------------------------ 業務アプリケーション

test.describe("Business app", { tag: "@webkit" }, () => {
  test("content width follows the purpose of the page", async ({ page, isMobile }) => {
    test.skip(isMobile, "幅の上限はデスクトップで確認する")
    await page.setViewportSize({ width: 1920, height: 1000 })
    const width = async (p: string) => {
      await page.goto(`/#/app?page=${p}`)
      await page.getByRole("heading", { level: 1 }).waitFor()
      return (await box(page.getByTestId("app-main").locator(":scope > div").last())).width
    }
    expect(await width("home")).toBe(1440)
    expect(await width("customer&id=yamada")).toBe(960)
    expect(await width("settings")).toBe(640)
    expect(await width("customers")).toBe(1920 - 240)
  })

  test("page padding and breadcrumb reflect the location", async ({ page, isMobile }) => {
    await page.goto("/#/app?page=customer&id=yamada")
    await page.getByRole("heading", { level: 1 }).waitFor()
    const content = page.getByTestId("app-main").locator(":scope > div").last()
    expect(await css(content, "padding-left")).toBe(isMobile ? "16px" : "24px")
    const crumbs = page.getByRole("navigation", { name: "パンくずリスト" })
    await expect(crumbs.locator("[aria-current=page]")).toHaveText("株式会社山田商事")
    if (!isMobile) {
      await crumbs.getByRole("link", { name: "顧客", exact: true }).click()
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客")
      await expect(page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "顧客", exact: true })).toHaveAttribute(
        "aria-current",
        "page"
      )
    }
  })
})


// ------------------------------------------------------------------ v0.1 の追加検品

const mod = () => (process.platform === "darwin" ? "Meta" : "Control")
const widthOf = async (l: Locator) => (await box(l)).width
const container = (l: Locator) => l.locator("[data-slot=sidebar-container]")
const frame = (page: Page) => page.getByTestId("sidebar-basic")
type KeyInit = { repeat?: boolean; isComposing?: boolean }

test.describe("Sidebar shortcut control", { tag: "@webkit" }, () => {
  test.skip(({ isMobile }) => isMobile, "デスクトップの表示")

  test("only the focused sidebar reacts; changed and disabled shortcuts", async ({ page }) => {
    await open(page, "sidebar")
    const basic = container(page.getByTestId("sidebar-basic"))
    const controlled = container(page.getByTestId("sidebar-controlled"))
    const long = container(page.getByTestId("sidebar-long"))
    const custom = container(page.getByTestId("sidebar-shortcut"))
    // フォーカスがどの Sidebar にもない：ショートカットが有効な最初の Sidebar だけ
    await page.getByRole("heading", { level: 1 }).click()
    await page.keyboard.press(`${mod()}+b`)
    await expect.poll(() => widthOf(basic)).toBe(64)
    for (const c of [controlled, long, custom]) expect(await widthOf(c)).toBe(240)
    await page.keyboard.press(`${mod()}+b`)
    await expect.poll(() => widthOf(basic)).toBe(240)
    // キーを変えた Sidebar：その中にフォーカスがあるときに Ctrl / ⌘ + M
    await page.getByTestId("sidebar-shortcut").getByRole("link", { name: "請求書" }).focus()
    await page.keyboard.press(`${mod()}+b`)
    await settle(page)
    for (const c of [custom, basic]) await expect(sidebarState(c)).toHaveAttribute("data-state", "expanded")
    expect(await widthOf(custom)).toBe(240)
    expect(await widthOf(basic)).toBe(240)
    await page.keyboard.press(`${mod()}+m`)
    await expect.poll(() => widthOf(custom)).toBe(64)
    expect(await widthOf(basic)).toBe(240)
    // 無効にした Sidebar の中では、どの Sidebar も開閉しない
    await page.getByTestId("sidebar-controlled").getByRole("link", { name: "請求書" }).focus()
    await page.keyboard.press(`${mod()}+b`)
    await settle(page)
    for (const c of [controlled, basic]) await expect(sidebarState(c)).toHaveAttribute("data-state", "expanded")
    for (const c of [controlled, basic]) expect(await widthOf(c)).toBe(240)
  })

  test("ignores key repeat, IME composition and events prevented by other handlers", async ({ page }) => {
    await open(page, "sidebar")
    const basic = container(page.getByTestId("sidebar-basic"))
    const fire = (init: KeyInit, prevent = false) =>
      page.evaluate(
        ([init, prevent]) => {
          const stop = (e: Event) => e.preventDefault()
          if (prevent) document.addEventListener("keydown", stop, { capture: true, once: true })
          document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true, ...init }))
        },
        [init, prevent] as const
      )
    // 1 回ずつ、イベントの処理と描画の後に、開閉の状態が変わっていないことを確かめる
    for (const [init, prevent] of [[{ repeat: true }, false], [{ isComposing: true }, false], [{}, true]] as const) {
      await fire(init, prevent)
      await settle(page)
      await expect(sidebarState(basic)).toHaveAttribute("data-state", "expanded")
    }
    expect(await widthOf(basic)).toBe(240)
    // 比較：通常のキー操作では開閉する
    await fire({})
    await expect.poll(() => widthOf(basic)).toBe(64)
  })

  test("does nothing while another overlay has focus", async ({ page }) => {
    await page.goto("/#/app?page=customers")
    await page.getByRole("heading", { level: 1 }).waitFor()
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:sidebar-open"))
    const c = page.locator("[data-slot=sidebar-container]")
    await page.getByRole("combobox", { name: "担当者" }).click()
    await expect(page.getByRole("listbox")).toBeVisible()
    await page.keyboard.press(`${mod()}+b`)
    await settle(page)
    await expect(sidebarState(c)).toHaveAttribute("data-state", "expanded")
    expect(await widthOf(c)).toBe(240)
    await page.keyboard.press("Escape")
  })
})

test.describe("Sidebar accessibility", { tag: "@webkit" }, () => {
  test("trigger announces state and controls the sidebar", async ({ page, isMobile }) => {
    await page.goto("/#/app?page=customers")
    await page.getByRole("heading", { level: 1 }).waitFor()
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:sidebar-open"))
    const trigger = page.locator("[data-slot=sidebar-trigger]")
    await expect(trigger).toHaveAccessibleName("メニュー")
    if (isMobile) {
      await expect(trigger).toHaveAttribute("aria-expanded", "false")
      await expect(trigger).not.toHaveAttribute("aria-controls")
      await trigger.click()
      const id = await trigger.getAttribute("aria-controls")
      await expect(page.locator(`[id="${id}"]`)).toHaveAttribute("role", "dialog")
      return
    }
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    const id = await trigger.getAttribute("aria-controls")
    await expect(page.locator(`[id="${id}"]`)).toHaveAttribute("data-slot", "sidebar-container")
    await trigger.click()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await trigger.click()
  })

  test("collapsed: Tab reaches only visible, named controls inside 64px", async ({ page, isMobile }) => {
    test.skip(isMobile, "デスクトップの表示")
    await page.goto("/#/app?page=customers")
    await page.getByRole("heading", { level: 1 }).waitFor()
    await page.locator("[data-slot=sidebar-trigger]").click()
    const c = page.locator("[data-slot=sidebar-container]")
    await expect.poll(() => widthOf(c)).toBe(64)
    // Sidebar の最初の要素（製品名のリンク）から Tab で進む
    await page.locator("[data-slot=sidebar-header] a").first().focus()
    const seen: string[] = []
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press(tabKey(page))
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const r = el.getBoundingClientRect()
        const inSidebar = !!el.closest("[data-slot=sidebar-container]")
        return { inSidebar, w: r.width, h: r.height, right: r.right, visible: el.checkVisibility() }
      })
      if (!info.inSidebar) continue
      expect(info.visible).toBe(true)
      expect(info.w).toBeGreaterThan(1)
      expect(info.right).toBeLessThanOrEqual(64)
      seen.push(await page.evaluate(() => (document.activeElement as HTMLElement).getAttribute("aria-label") ?? (document.activeElement as HTMLElement).textContent ?? ""))
    }
    expect(seen.length).toBeGreaterThan(5)
    for (const name of seen) expect(name.trim()).not.toBe("")
    await page.locator("[data-slot=sidebar-trigger]").click()
  })

  test("buttons do not submit forms; aria-disabled items do not run", async ({ page }) => {
    await open(page, "sidebar")
    const log = page.getByTestId("sidebar-form-log")
    await page.getByTestId("sidebar-form-button").click()
    await expect(log).toHaveText("下書きを保存した")
    await expect(page.getByTestId("sidebar-form-button")).toHaveAttribute("type", "button")
    const disabled = page.getByTestId("sidebar-form-disabled")
    const url = page.url()
    // Playwright は aria-disabled の要素を押せないものとして待つため、force で押す
    await disabled.click({ force: true })
    await disabled.focus()
    await expect(disabled).toBeFocused()
    await page.keyboard.press("Enter")
    await settle(page)
    await expect(log).toHaveText("下書きを保存した")
    expect(page.url()).toBe(url)
    await expect(disabled).toHaveAttribute("aria-disabled", "true")
    expect(await css(disabled, "opacity")).toBe("0.5")
  })

  test("current position and focus are both visible; brand colors keep them distinguishable", async ({ page, isMobile }) => {
    test.skip(isMobile, "デスクトップの表示")
    await open(page, "sidebar")
    for (const brand of ["標準", "青", "紫"]) {
      await page.getByRole("radio", { name: brand }).check()
      const nav = frame(page).getByRole("navigation", { name: "メインメニュー" })
      const current = nav.getByRole("link", { name: "顧客", exact: true })
      await tabTo(page, current)
      await expectFocusRing(page, current)
      expect(sameColor(await css(current, "background-color"), await token(page, "--sidebar-accent"))).toBe(true)
      const sidebarBg = await token(page, "--sidebar")
      const accent = await token(page, "--sidebar-accent")
      const other = nav.getByRole("link", { name: "請求書" })
      expect(await colorContrast(page, await css(other, "color"), sidebarBg)).toBeGreaterThanOrEqual(4.5)
      expect(await colorContrast(page, await css(current, "outline-color"), accent)).toBeGreaterThanOrEqual(3)
      expect(await colorContrast(page, await css(current, "outline-color"), sidebarBg)).toBeGreaterThanOrEqual(3)
      // 製品がフォーカスの色をブランドカラーにした場合も、Sidebar の面の上で 3:1 以上
      const primary = await token(page, "--primary")
      expect(await colorContrast(page, primary, accent)).toBeGreaterThanOrEqual(3)
      expect(await colorContrast(page, primary, sidebarBg)).toBeGreaterThanOrEqual(3)
      await page.locator("body").click({ position: { x: 5, y: 5 } })
    }
  })

  test("after navigating on mobile, focus returns to the menu button", async ({ page, isMobile }) => {
    test.skip(!isMobile, "モバイルの表示")
    await page.goto("/#/app?page=customers")
    await page.getByRole("heading", { level: 1 }).waitFor()
    const trigger = page.locator("[data-slot=sidebar-trigger]")
    await trigger.click()
    const dialog = page.getByRole("dialog", { name: "メニュー" })
    // 2 階層目もモバイルで使える
    await dialog.getByRole("button", { name: "レポート", exact: true }).click()
    await dialog.getByRole("link", { name: "売上のレポート" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("売上のレポート")
    await expect(trigger).toBeFocused()
    expect((await box(trigger)).height).toBeGreaterThanOrEqual(48)
  })

  test("resizing keeps the navigation available", async ({ page, isMobile }) => {
    test.skip(isMobile, "幅を変えて確かめる")
    await page.goto("/#/app?page=customers")
    await page.getByRole("heading", { level: 1 }).waitFor()
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:sidebar-open"))
    const trigger = page.locator("[data-slot=sidebar-trigger]")
    // CSS の md（48rem = 768px）と同じ境界で切り替わる
    await page.setViewportSize({ width: 767, height: 900 })
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog")
    await trigger.click()
    await expect(page.getByRole("dialog", { name: "メニュー" })).toBeVisible()
    await page.setViewportSize({ width: 768, height: 900 })
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.locator("[data-slot=sidebar-container]")).toBeVisible()
    await expect(page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "顧客", exact: true })).toBeVisible()
    // もう一度狭くしても、操作していない Sheet は開かない
    await page.setViewportSize({ width: 600, height: 900 })
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await trigger.click()
    await expect(page.getByRole("dialog", { name: "メニュー" })).toBeVisible()
  })

  test("collapsed dropdown menu: long labels wrap inside the viewport", async ({ page, isMobile }) => {
    test.skip(isMobile, "デスクトップの表示")
    await page.goto("/#/app?page=customers")
    await page.getByRole("heading", { level: 1 }).waitFor()
    await page.locator("[data-slot=sidebar-trigger]").click()
    await expect.poll(() => widthOf(page.locator("[data-slot=sidebar-container]"))).toBe(64)
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name: "契約", exact: true }).click()
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    for (const item of await menu.getByRole("menuitem").all()) expect(await noOverflow(item)).toBe(true)
    expect((await box(menu)).width).toBeLessThanOrEqual(288)
    await page.keyboard.press("Escape")
    await page.locator("[data-slot=sidebar-trigger]").click()
  })
})

test.describe("keepMounted", { tag: "@webkit" }, () => {
  test("Tabs: hidden panels are skipped by Tab, values are submitted, errors lead to the hidden field", async ({ page }) => {
    await open(page, "tabs")
    const form = page.getByTestId("tabs-keep-form")
    await expect(form.getByRole("textbox")).toHaveCount(1)
    await form.getByRole("textbox", { name: "会社名" }).fill("株式会社山田商事")
    // 会社名から Tab で進むと、非表示の請求先の入力欄を飛ばして保存のボタンへ移る
    await form.getByRole("textbox", { name: "会社名" }).focus()
    await page.keyboard.press("Tab")
    await expect(page.getByTestId("tabs-keep-to-billing")).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(page.getByTestId("tabs-keep-submit")).toBeFocused()
    // 非表示のタブに必須の値がない：エラーの概要から、そのタブの入力欄へ移る
    await page.getByTestId("tabs-keep-submit").click()
    const summary = page.getByTestId("tabs-keep-summary")
    await expect(summary).toBeVisible()
    await summary.getByRole("button").click()
    await expect(form.getByRole("tab", { name: "請求先" })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByTestId("tabs-keep-email")).toBeFocused()
    await expect(page.getByTestId("tabs-keep-email")).toHaveAttribute("aria-invalid", "true")
    await page.getByTestId("tabs-keep-email").fill("keiri@example.com")
    await form.getByRole("tab", { name: "基本情報" }).click()
    await page.getByTestId("tabs-keep-submit").click()
    // 非表示のタブの値も送信される
    await expect(page.getByTestId("tabs-keep-result")).toHaveText("送信した値：株式会社山田商事、keiri@example.com")
  })

  test("Tabs: focus inside a panel moves to the selected tab when the product switches tabs", async ({ page }) => {
    await open(page, "tabs")
    const form = page.getByTestId("tabs-keep-form")
    await page.getByTestId("tabs-keep-to-billing").click()
    await expect(form.getByRole("tab", { name: "請求先" })).toHaveAttribute("aria-selected", "true")
    await expect(form.getByRole("tab", { name: "請求先" })).toBeFocused()
  })

  test("Tabs: keepMounted={false} removes inactive panels", async ({ page }) => {
    await open(page, "tabs")
    await expect(page.getByTestId("tabs-manual").locator("[data-slot=tabs-content]")).toHaveCount(1)
    await expect(page.getByTestId("tabs-keep").locator("[data-slot=tabs-content]")).toHaveCount(2)
  })

  test("Accordion: closing from inside moves focus to the header; closed content is not focusable", async ({ page }) => {
    await open(page, "accordion")
    const keep = page.getByTestId("accordion-keep")
    const trigger = keep.getByRole("button", { name: "社内メモ" })
    await expect(keep.getByRole("textbox")).toHaveCount(0)
    await trigger.click()
    await expect(trigger).toHaveAttribute("aria-expanded", "true")
    await expect(page.getByTestId("accordion-keep-close")).toBeVisible()
    await page.getByTestId("accordion-keep-input").fill("決裁は4月")
    await page.getByTestId("accordion-keep-close").click()
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId("accordion-keep-input")).toBeHidden()
    // 閉じた内容には Tab で移らない
    await page.keyboard.press("Tab")
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=accordion-keep] [data-slot=accordion-content]"))).toBe(false)
    await trigger.click()
    await expect(page.getByTestId("accordion-keep-input")).toHaveValue("決裁は4月")
  })
})

test.describe("Tabs selection v0.1", { tag: "@webkit" }, () => {
  test("focus and selection look different; focus ring is not clipped; no layout shift", async ({ page }) => {
    await open(page, "tabs")
    const root = page.getByTestId("tabs-manual")
    const list = root.getByRole("tablist")
    const tabs = root.getByRole("tab")
    await tabTo(page, tabs.nth(0))
    const before = await box(list)
    await page.keyboard.press("ArrowRight")
    const after = (l: Locator, p: string) => l.evaluate((el, q) => getComputedStyle(el, "::after").getPropertyValue(q), p)
    // フォーカス：線だけ。選択：下線だけ
    await expectFocusRing(page, tabs.nth(1))
    expect(await after(tabs.nth(1), "opacity")).toBe("0")
    expect(await css(tabs.nth(0), "outline-style")).toBe("none")
    expect(await after(tabs.nth(0), "opacity")).toBe("1")
    // フォーカスの線（外側 4px）が、スクロールの領域の内側に収まる
    for (const t of [tabs.nth(1)]) {
      const tb = await box(t)
      const lb = await box(list)
      expect(tb.x - 4).toBeGreaterThanOrEqual(lb.x - 0.5)
      expect(tb.y - 4).toBeGreaterThanOrEqual(lb.y - 0.5)
      expect(tb.y + tb.height + 4).toBeLessThanOrEqual(lb.y + lb.height + 0.5)
    }
    await page.keyboard.press("Enter")
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true")
    expect(await box(list)).toEqual(before)
  })
})

test.describe("Breadcrumb and Card v0.1", { tag: "@webkit" }, () => {
  test("breadcrumb: the ellipsis works with the keyboard; targets are at least 24px", async ({ page }) => {
    await open(page, "breadcrumb")
    const nav = page.getByTestId("breadcrumb-deep")
    const expand = page.getByTestId("breadcrumb-expand")
    await tabTo(page, expand)
    await expectFocusRing(page, expand)
    await page.keyboard.press("Enter")
    await expect(nav.getByRole("link")).toHaveCount(6)
    await expect(nav.getByRole("link", { name: "顧客", exact: true })).toBeFocused()
    for (const l of await nav.getByRole("link").all()) expect((await box(l)).height).toBeGreaterThanOrEqual(24)
  })

  test("card: a long title wraps beside CardAction without overlapping", async ({ page }) => {
    await open(page, "card")
    const card = page.getByTestId("card-long")
    const title = card.locator("[data-slot=card-title]")
    const action = page.getByTestId("card-long-action")
    const t = await box(title)
    const a = await box(action)
    expect(t.x + t.width).toBeLessThanOrEqual(a.x)
    await expect(card.getByRole("heading", { level: 3 })).toHaveText("北日本精密機械工業株式会社 札幌第二工場 生産管理部")
    expect(await css(card.getByRole("heading", { level: 3 }), "font-size")).toBe("20px")
    expect(await noOverflow(card)).toBe(true)
  })
})

// ------------------------------------------------------------------ スクリーンショット

test.describe("screenshots", () => {
  test("capture", async ({ page, isMobile }, info) => {
    const dir = join(info.project.testDir, "..", "screenshots", info.project.name)
    for (const id of pages) {
      await open(page, id)
      await page.screenshot({ path: `${dir}/nav-${id}.png`, fullPage: true })
    }
    for (const p of ["home", "customers", "customer&id=yamada", "settings"]) {
      await page.goto(`/#/app?page=${p}`)
      await page.getByRole("heading", { level: 1 }).waitFor()
      await page.screenshot({ path: `${dir}/app-${p.split("&")[0]}.png`, fullPage: true })
    }
    if (isMobile) {
      await page.goto("/#/app?page=customers")
      await page.getByRole("button", { name: "メニュー", exact: true }).click()
      await page.getByRole("dialog").waitFor()
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${dir}/app-sidebar-mobile-open.png` })
      return
    }
    await page.goto("/#/app?page=customer&id=yamada")
    await page.getByRole("heading", { level: 1 }).waitFor()
    await page.mouse.move(700, 450)
    await page.screenshot({ path: `${dir}/app-sidebar-expanded.png` })
    await page.getByRole("button", { name: "メニュー", exact: true }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${dir}/app-sidebar-collapsed.png` })
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name: "契約", exact: true }).click()
    await page.getByRole("menu").waitFor()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/app-sidebar-collapsed-submenu.png` })
    await page.keyboard.press("Escape")
    await page.evaluate(() => localStorage.removeItem("flow-design-preview:sidebar-open"))
    await open(page, "sidebar")
    const nav = page.getByTestId("sidebar-basic")
    await nav.getByRole("link", { name: "請求書" }).hover()
    await page.waitForTimeout(200)
    await nav.screenshot({ path: `${dir}/sidebar-hover.png` })
    await page.mouse.move(0, 0)
  })
})
