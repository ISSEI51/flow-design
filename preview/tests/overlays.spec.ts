import { join } from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { buttonContrast, colorContrast, css, sameColor, token } from "./helpers"
import { collectPageErrors } from "./page-errors"

// Overlay（Dialog、Alert Dialog、Popover、Dropdown Menu、Sheet、Drawer）の検品。
collectPageErrors(test)
const pages = ["dialog", "alert-dialog", "popover", "dropdown-menu", "sheet", "drawer"]

async function open(page: Page, id: string) {
  await page.goto(`/#/${id}`)
  await page.getByRole("heading", { level: 1 }).waitFor()
}

const box = async (l: Locator) => (await l.boundingBox())!
const viewport = (page: Page) => page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
const isFocused = (l: Locator) => l.evaluate((el) => el === document.activeElement)
const containsFocus = (l: Locator) => l.evaluate((el) => el.contains(document.activeElement))

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 150; i++) {
    await page.keyboard.press("Tab")
    if (await isFocused(target)) return
  }
  throw new Error("target was not reached with Tab")
}

// キーボードで開く。Tab でトリガーへ移動し、Enter を押す。
async function openWithKeyboard(page: Page, trigger: Locator) {
  await tabTo(page, trigger)
  await page.keyboard.press("Enter")
}

async function expectFocusRing(page: Page, target: Locator) {
  expect(await css(target, "outline-style")).toBe("solid")
  expect(await css(target, "outline-width")).toBe("2px")
  expect(sameColor(await css(target, "outline-color"), await token(page, "--ring"))).toBe(true)
}

// 画面の点にある要素が、指定した要素の中にあるか。背景の操作が止まっているかの確認に使う。
async function hitInside(page: Page, x: number, y: number, target: Locator) {
  const handle = await target.elementHandle()
  return page.evaluate(([x, y, el]) => !!el && (el as Element).contains(document.elementFromPoint(x as number, y as number)), [x, y, handle] as const)
}

// 開く動きが終わるまで待つ。寸法は動きの途中（拡大やスライドの途中）で測らない。
async function settle(l: Locator) {
  await expect(l).toBeVisible()
  await expect(l).not.toHaveAttribute("data-starting-style")
  await l.evaluate(async (el) => {
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined)))
    }
  })
}

// 開いた直後の状態（data-starting-style）を一時的に付け、動きの指定を読む。
// transition を止めて、動きの途中ではなく指定された値を読む。
async function startingStyle(l: Locator, prop: string) {
  return l.evaluate((el, p) => {
    const e = el as HTMLElement
    e.style.transition = "none"
    e.setAttribute("data-starting-style", "")
    const v = getComputedStyle(e).getPropertyValue(p)
    e.removeAttribute("data-starting-style")
    // 元の値を確定させてから transition を戻す。戻した後に動きが始まらないようにする。
    void getComputedStyle(e).getPropertyValue(p)
    e.style.transition = ""
    return v
  }, prop)
}

// 計算後の色を、ブラウザの canvas で RGBA に変換する。oklab() などの表記の違いを吸収する。
async function rgba(page: Page, color: string) {
  return page.evaluate((c) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = Array.from(ctx.getImageData(0, 0, 1, 1).data)
    return [r, g, b, Math.round((a / 255) * 100) / 100]
  }, color)
}

// フォーカスが通った要素を記録する。Base UI のフォーカスガード（data-base-ui-focus-guard）は、
// Tab で一時的にフォーカスを受け、次のフレームでフォーカスを Overlay の中へ戻す。
async function recordFocus(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __fdFocus: Element[] }
    w.__fdFocus = []
    document.addEventListener("focusin", (e) => w.__fdFocus.push(e.target as Element), true)
  })
}

// フォーカスが通った要素のうち、container の外で、フォーカスガードでもない要素の説明。空なら漏れていない。
const focusLeaks = (container: Locator) =>
  container.evaluate((root) => {
    const w = window as unknown as { __fdFocus: Element[] }
    const leaks = w.__fdFocus.filter((el) => !root.contains(el) && !el.hasAttribute("data-base-ui-focus-guard"))
    w.__fdFocus = []
    return leaks.map((el) => `${el.tagName}${el.id ? "#" + el.id : ""} ${(el.textContent ?? "").trim().slice(0, 20)}`)
  })

// キーを押し、フォーカスが container の中のフォーカスガード以外の要素に着いたことを条件に次へ進む（固定時間で待たない）。
// その間にフォーカスが container の外の要素に移っていないことも確かめる。
async function tabInside(page: Page, container: Locator, times: number, key = "Tab") {
  await recordFocus(page)
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key)
    await expect
      .poll(() =>
        container.evaluate(
          (root) => root.contains(document.activeElement) && !document.activeElement!.hasAttribute("data-base-ui-focus-guard")
        )
      , { message: `${key} ${i + 1}` })
      .toBe(true)
    expect(await focusLeaks(container), `${key} ${i + 1}`).toEqual([])
  }
}

// 画面の左上の、Overlay の外側を押す。
const clickOutside = (page: Page) => page.mouse.click(4, 4)

async function expectOverlay(page: Page, slot: string) {
  const overlay = page.locator(`[data-slot=${slot}]`)
  await expect(overlay).toBeVisible()
  expect(await rgba(page, await css(overlay, "background-color"))).toEqual([0, 0, 0, 0.4])
  expect(await css(overlay, "backdrop-filter")).toBe("none")
}

test.describe("all overlay pages", { tag: "@webkit" }, () => {
  for (const id of pages) {
    test(`${id}: names, no horizontal scroll`, async ({ page }) => {
      await open(page, id)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const buttons = page.locator("main").getByRole("button")
      const n = await buttons.count()
      expect(n).toBeGreaterThan(0)
      for (let i = 0; i < n; i++) await expect(buttons.nth(i)).toHaveAccessibleName(/\S/)
    })
  }
})

test.describe("Dialog", { tag: "@webkit" }, () => {
  test("tokens", async ({ page }) => {
    await open(page, "dialog")
    await page.getByTestId("dialog-trigger-default").click()
    const popup = page.getByTestId("dialog-default")
    await settle(popup)
    await expect(popup).toHaveAttribute("role", "dialog")
    await expect(popup).toHaveAccessibleName("担当者を変更")
    await expect(popup).toHaveAccessibleDescription("Default の Dialog。最大幅は 480px。")
    await expectOverlay(page, "dialog-overlay")
    expect(await css(popup, "border-top-left-radius")).toBe("20px")
    expect(await css(popup, "padding-left")).toBe("24px")
    expect(await css(popup, "padding-top")).toBe("24px")
    expect(await css(popup, "box-shadow")).toContain("0px 12px 32px")
    expect(await css(popup, "transition-duration")).toBe("0.24s")
    expect(sameColor(await css(popup, "background-color"), await token(page, "--popover"))).toBe(true)
    const title = popup.locator("[data-slot=dialog-title]")
    expect(await css(title, "font-size")).toBe("20px")
    expect(await css(title, "font-weight")).toBe("600")
    expect(await css(popup.locator("[data-slot=dialog-description]"), "font-size")).toBe("14px")
    // 閉じるボタン：右上、Lucide の X
    const close = popup.getByRole("button", { name: "閉じる" })
    const pb = await box(popup)
    const cb = await box(close)
    expect(pb.x + pb.width - (cb.x + cb.width)).toBeLessThanOrEqual(24)
    expect(cb.y - pb.y).toBeLessThanOrEqual(24)
    await expect(close.locator("svg.lucide-x")).toBeVisible()
    // 操作ボタン：右寄せ、キャンセルが左、間隔 8px
    const footer = popup.locator("[data-slot=dialog-footer]")
    expect(await css(footer, "column-gap")).toBe("8px")
    const [cancel, primary] = [footer.getByRole("button", { name: "キャンセル" }), footer.getByRole("button", { name: "変更を保存" })]
    const [a, b] = [await box(cancel), await box(primary)]
    expect(a.x).toBeLessThan(b.x)
    expect(Math.round(b.x - (a.x + a.width))).toBe(8)
    expect(Math.round(pb.x + pb.width - 24 - (b.x + b.width))).toBe(0)
  })

  test("4 sizes and narrow screens", async ({ page }) => {
    await open(page, "dialog")
    const { w } = await viewport(page)
    for (const [size, max] of [["sm", 360], ["default", 480], ["lg", 640], ["xl", 800]] as const) {
      await page.getByTestId(`dialog-trigger-${size}`).click()
      const popup = page.getByTestId(`dialog-${size}`)
      await settle(popup)
      const pb = await box(popup)
      // 画面の端に 16px（640px 以上の幅では 24px）を残して縮む
      const gutter = w < 640 ? 16 : 24
      expect(Math.round(pb.width)).toBe(Math.min(max, w - gutter * 2))
      expect(pb.x).toBeGreaterThanOrEqual(gutter - 1)
      await page.keyboard.press("Escape")
      await expect(popup).toBeHidden()
    }
  })

  test("keyboard: initial focus, focus trap, Escape, focus returns", async ({ page }) => {
    await open(page, "dialog")
    const trigger = page.getByTestId("dialog-trigger-default")
    await openWithKeyboard(page, trigger)
    const popup = page.getByTestId("dialog-default")
    await settle(popup)
    // 最初の操作できる要素（入力欄）にフォーカスが移る
    await expect(popup.getByRole("textbox")).toBeFocused()
    // Tab で移動しても Dialog の外に出ない
    await tabInside(page, popup, 8)
    await tabInside(page, popup, 3, "Shift+Tab")
    // 閉じるボタンのフォーカス表示
    const close = popup.getByRole("button", { name: "閉じる" })
    await close.focus()
    await expectFocusRing(page, close)
    await page.keyboard.press("Escape")
    await expect(popup).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("modal: background is blocked and does not scroll; outside click closes", async ({ page, isMobile }) => {
    await open(page, "dialog")
    const behind = page.getByTestId("dialog-trigger-xl")
    const bb = await box(behind)
    await page.getByTestId("dialog-trigger-sm").click()
    const popup = page.getByTestId("dialog-sm")
    await settle(popup)
    // 背景のボタンの位置にあるのは、背景のボタンではない
    expect(await hitInside(page, bb.x + 4, bb.y + 4, behind)).toBe(false)
    if (!isMobile) {
      const before = await page.evaluate(() => window.scrollY)
      await page.mouse.move(8, 400)
      await page.mouse.wheel(0, 600)
      await page.waitForTimeout(200)
      expect(await page.evaluate(() => window.scrollY)).toBe(before)
    }
    await clickOutside(page)
    await expect(popup).toBeHidden()
  })

  test("touch opening focuses the dialog itself, not the text field", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch only")
    await open(page, "dialog")
    await page.getByTestId("dialog-trigger-default").tap()
    const popup = page.getByTestId("dialog-default")
    await settle(popup)
    await expect.poll(() => isFocused(popup)).toBe(true)
    await expect(popup.getByRole("textbox")).not.toBeFocused()
  })

  test("unsaved changes: outside click ignored, Escape / close / cancel ask before discarding", async ({ page }) => {
    await open(page, "dialog")
    const trigger = page.getByTestId("dialog-dirty-trigger")
    await trigger.click()
    const popup = page.getByTestId("dialog-dirty")
    const alert = page.getByTestId("dialog-discard")
    await settle(popup)
    // 変更がなければ外側のクリックで閉じる
    await clickOutside(page)
    await expect(popup).toBeHidden()

    await trigger.click()
    await page.getByTestId("dialog-dirty-name").fill("山田商事株式会社")
    await clickOutside(page)
    await page.waitForTimeout(300)
    await settle(popup)
    await expect(alert).toBeHidden()

    // Escape：破棄の確認。安全な選択肢に初期フォーカス。Escape は確認だけを閉じる
    await page.getByTestId("dialog-dirty-name").focus()
    await page.keyboard.press("Escape")
    await settle(alert)
    await expect(alert).toHaveAttribute("role", "alertdialog")
    await expect(alert.getByRole("button", { name: "編集を続ける" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(alert).toBeHidden()
    await settle(popup)
    await expect(page.getByTestId("dialog-dirty-name")).toHaveValue("山田商事株式会社")
    await expect(page.getByTestId("dialog-dirty-name")).toBeFocused()

    // 閉じるボタンとキャンセルも、確認を経る
    await popup.getByRole("button", { name: "閉じる" }).click()
    await settle(alert)
    await alert.getByRole("button", { name: "編集を続ける" }).click()
    await expect(alert).toBeHidden()
    await popup.getByRole("button", { name: "キャンセル" }).click()
    await settle(alert)
    // 背後の Dialog は少し暗くなる
    await expect
      .poll(async () => rgba(page, await popup.evaluate((el) => getComputedStyle(el, "::after").backgroundColor)))
      .toEqual([0, 0, 0, 0.1])
    await alert.getByRole("button", { name: "変更を破棄" }).click()
    await expect(alert).toBeHidden()
    await expect(popup).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId("dialog-dirty-status")).toHaveText("現在の会社名：山田商事")

    // 保存すると閉じ、結果を文字で知らせる
    await trigger.click()
    await page.getByTestId("dialog-dirty-name").fill("山田商事株式会社")
    await popup.getByRole("button", { name: "変更を保存" }).click()
    await expect(popup).toBeHidden()
    await expect(page.getByTestId("dialog-dirty-status")).toHaveText("会社情報を保存しました")
  })

  test("nested: Select in Dialog, Escape closes only the frontmost and focus returns", async ({ page }) => {
    await open(page, "dialog")
    const trigger = page.getByTestId("dialog-select-trigger")
    await openWithKeyboard(page, trigger)
    const popup = page.getByTestId("dialog-select")
    const select = page.getByTestId("dialog-select-field")
    await settle(popup)
    await select.focus()
    await page.keyboard.press("Enter")
    const listbox = page.getByRole("listbox")
    await expect(listbox).toBeVisible()
    // 重なり順：選択肢は Dialog より前面にある
    const ob = await box(page.getByRole("option").first())
    expect(await hitInside(page, ob.x + ob.width / 2, ob.y + ob.height / 2, listbox)).toBe(true)
    await page.keyboard.press("Escape")
    await expect(listbox).toBeHidden()
    await settle(popup)
    await expect(select).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(popup).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("long content scrolls inside, header and footer stay on screen", async ({ page }) => {
    await open(page, "dialog")
    await page.getByTestId("dialog-long-trigger").click()
    const popup = page.getByTestId("dialog-long")
    const body = page.getByTestId("dialog-long-body")
    await settle(popup)
    const { h } = await viewport(page)
    const pb = await box(popup)
    expect(pb.y).toBeGreaterThanOrEqual(15)
    expect(pb.y + pb.height).toBeLessThanOrEqual(h - 15)
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    const footer = popup.locator("[data-slot=dialog-footer]")
    const before = await box(footer)
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    expect((await box(footer)).y).toBe(before.y)
    await expect(footer.getByRole("button", { name: "変更に同意する" })).toBeInViewport()
    // 長いタイトルは閉じるボタンと重ならない
    const tb = await box(popup.locator("[data-slot=dialog-title]"))
    const cb = await box(popup.getByRole("button", { name: "閉じる" }))
    expect(tb.x + tb.width).toBeLessThanOrEqual(cb.x)
    await page.keyboard.press("Escape")
    // 英語
    await page.getByTestId("dialog-english-trigger").click()
    const en = page.getByTestId("dialog-english")
    await expect(en.getByRole("button", { name: "Close" })).toBeVisible()
    expect(await en.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })

  test("reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "dialog")
    await page.getByTestId("dialog-trigger-default").click()
    const popup = page.getByTestId("dialog-default")
    await settle(popup)
    expect(await css(popup, "transition-duration")).toBe("0s")
    expect(await startingStyle(popup, "scale")).toBe("none")
    await page.emulateMedia({ reducedMotion: "no-preference" })
    expect(await startingStyle(popup, "scale")).toBe("0.95")
  })
})

test.describe("Alert Dialog", { tag: "@webkit" }, () => {
  test("tokens, role, names, safe initial focus", async ({ page, isMobile }) => {
    await open(page, "alert-dialog")
    const trigger = page.getByTestId("alert-delete-trigger")
    await openWithKeyboard(page, trigger)
    const popup = page.getByTestId("alert-delete")
    await settle(popup)
    await expect(popup).toHaveAttribute("role", "alertdialog")
    await expect(popup).toHaveAccessibleName("山田商事を削除しますか？")
    await expect(popup).toHaveAccessibleDescription(/この操作は取り消せません/)
    await expectOverlay(page, "alert-dialog-overlay")
    expect(await css(popup, "border-top-left-radius")).toBe("20px")
    expect(await css(popup, "padding-left")).toBe("24px")
    const { w } = await viewport(page)
    expect(Math.round((await box(popup)).width)).toBe(Math.min(480, w - (isMobile ? 32 : 48)))
    // 大きなアイコンを持たない
    expect(await popup.locator("svg").count()).toBe(0)
    const cancel = popup.getByRole("button", { name: "キャンセル" })
    const action = popup.getByRole("button", { name: "削除する" })
    await expect(cancel).toBeFocused()
    await expectFocusRing(page, cancel)
    expect(sameColor(await css(cancel, "background-color"), await token(page, "--secondary"))).toBe(true)
    expect(sameColor(await css(action, "background-color"), await token(page, "--destructive"))).toBe(true)
    expect(await buttonContrast(action)).toBeGreaterThanOrEqual(4.5)
    expect((await box(cancel)).x).toBeLessThan((await box(action)).x)
  })

  test("outside click does not close; Escape cancels and focus returns", async ({ page }) => {
    await open(page, "alert-dialog")
    const trigger = page.getByTestId("alert-delete-trigger")
    await trigger.click()
    const popup = page.getByTestId("alert-delete")
    await settle(popup)
    await clickOutside(page)
    await page.waitForTimeout(300)
    await settle(popup)
    await page.keyboard.press("Escape")
    await expect(popup).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId("alert-delete-status")).toHaveText("")
  })

  test("pending: no double execution, cannot be cancelled midway", async ({ page }) => {
    await open(page, "alert-dialog")
    await page.getByTestId("alert-delete-trigger").click()
    const popup = page.getByTestId("alert-delete")
    const action = page.getByTestId("alert-delete-action")
    await action.click()
    await expect(action).toHaveAttribute("aria-busy", "true")
    await expect(page.getByTestId("alert-delete-status")).toHaveText("山田商事を削除しています")
    await action.click({ force: true })
    await page.keyboard.press("Escape")
    await settle(popup)
    await expect(popup.getByRole("button", { name: "キャンセル" })).toBeDisabled()
    await expect(popup).toBeHidden()
    await expect(page.getByTestId("alert-delete-status")).toHaveText("山田商事を削除しました")
  })

  test("additional confirmation for bulk deletion", async ({ page }) => {
    await open(page, "alert-dialog")
    await page.getByTestId("alert-bulk-trigger").click()
    const action = page.getByTestId("alert-bulk-action")
    await expect(action).toBeDisabled()
    await page.getByTestId("alert-bulk-input").fill("山田商事")
    await expect(action).toBeEnabled()
    await action.click()
    await expect(page.getByTestId("alert-bulk")).toBeHidden()
  })

  test("long English text wraps", async ({ page }) => {
    await open(page, "alert-dialog")
    await page.getByTestId("alert-english-trigger").click()
    const popup = page.getByTestId("alert-english")
    await settle(popup)
    expect(await popup.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(popup.getByRole("button", { name: "Cancel" })).toBeFocused()
  })
})

test.describe("Popover", { tag: "@webkit" }, () => {
  test("tokens and position", async ({ page }) => {
    await open(page, "popover")
    const trigger = page.getByTestId("popover-filter-trigger")
    await trigger.click()
    const popup = page.getByTestId("popover-filter")
    await settle(popup)
    expect(await css(popup, "border-top-left-radius")).toBe("12px")
    expect(await css(popup, "padding-left")).toBe("16px")
    expect(await css(popup, "border-top-width")).toBe("1px")
    expect(sameColor(await css(popup, "border-top-color"), await token(page, "--border"))).toBe(true)
    expect(sameColor(await css(popup, "background-color"), await token(page, "--popover"))).toBe(true)
    expect(await css(popup, "box-shadow")).toContain("0px 4px 16px")
    expect(await css(popup, "transition-duration")).toBe("0.18s")
    // 標準は下に開き、トリガーとの間隔は 4px
    await page.keyboard.press("Escape")
    const contactTrigger = page.getByTestId("popover-contact-trigger")
    await contactTrigger.click()
    const contact = page.getByTestId("popover-contact")
    await settle(contact)
    await expect(contact).toHaveAttribute("data-side", "bottom")
    const tb = await box(contactTrigger)
    const pb = await box(contact)
    expect(Math.round(pb.y - (tb.y + tb.height))).toBe(4)
    // 非モーダル：背景を暗くせず、背景の要素を押せる
    expect(await page.locator("[data-slot$=overlay]").count()).toBe(0)
  })

  test("keyboard, nested Select, outside click", async ({ page }) => {
    await open(page, "popover")
    const trigger = page.getByTestId("popover-filter-trigger")
    await openWithKeyboard(page, trigger)
    const popup = page.getByTestId("popover-filter")
    await settle(popup)
    await expect.poll(() => containsFocus(popup)).toBe(true)
    // Popover の中の Select。Escape は Select だけを閉じる
    const select = page.getByTestId("popover-filter-owner")
    await select.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("listbox")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toBeHidden()
    await settle(popup)
    await expect(select).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(popup).toBeHidden()
    await expect(trigger).toBeFocused()
    // 外側のクリックで閉じる
    await trigger.click()
    await settle(popup)
    await clickOutside(page)
    await expect(popup).toBeHidden()
  })

  test("filter applies the selected conditions", async ({ page }) => {
    await open(page, "popover")
    const trigger = page.getByTestId("popover-filter-trigger")
    await trigger.click()
    await page.getByTestId("popover-filter").getByRole("checkbox", { name: "休止中" }).click()
    await page.getByTestId("popover-filter-apply").click()
    await expect(page.getByTestId("popover-filter")).toBeHidden()
    await expect(trigger).toHaveText("絞り込み（1）")
    await expect(page.getByTestId("popover-filter-result").getByRole("listitem")).toHaveCount(1)
  })

  test("edges: stays inside the screen", async ({ page }) => {
    await open(page, "popover")
    const { w } = await viewport(page)
    for (const id of ["popover-edge-left", "popover-edge-right"]) {
      await page.getByTestId(`${id}-trigger`).click()
      const popup = page.getByTestId(id)
      await settle(popup)
      const pb = await box(popup)
      expect(pb.x).toBeGreaterThanOrEqual(8 - 1)
      expect(pb.x + pb.width).toBeLessThanOrEqual(w - 8 + 1)
      await page.keyboard.press("Escape")
      await expect(popup).toBeHidden()
    }
  })

  test("long content wraps at 360px", async ({ page }) => {
    await open(page, "popover")
    await page.getByTestId("popover-long-trigger").click()
    const popup = page.getByTestId("popover-long")
    await settle(popup)
    expect((await box(popup)).width).toBeLessThanOrEqual(360)
    expect(await popup.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })

  test("reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "popover")
    await page.getByTestId("popover-filter-trigger").click()
    const popup = page.getByTestId("popover-filter")
    await settle(popup)
    expect(await startingStyle(popup, "scale")).toBe("none")
  })
})

test.describe("Dropdown Menu", { tag: "@webkit" }, () => {
  test("tokens", async ({ page }) => {
    await open(page, "dropdown-menu")
    const trigger = page.getByTestId("menu-actions-trigger")
    await expect(trigger).toHaveAccessibleName("山田商事の操作")
    await trigger.click()
    const menu = page.getByTestId("menu-actions")
    await settle(menu)
    await expect(menu).toHaveAttribute("role", "menu")
    expect(await css(menu, "border-top-left-radius")).toBe("12px")
    expect(await css(menu, "padding-left")).toBe("8px")
    expect(await css(menu, "border-top-width")).toBe("1px")
    expect(sameColor(await css(menu, "background-color"), await token(page, "--popover"))).toBe(true)
    expect(await css(menu, "box-shadow")).toContain("0px 2px 8px")
    expect(await css(menu, "transition-duration")).toBe("0.18s")
    // トリガーとの間隔は 4px。下に空きがなければ上に開く
    const tb = await box(trigger)
    const mb = await box(menu)
    const side = await menu.getAttribute("data-side")
    expect(Math.round(side === "top" ? tb.y - (mb.y + mb.height) : mb.y - (tb.y + tb.height))).toBe(4)
    const item = menu.getByRole("menuitem", { name: "編集" })
    expect((await box(item)).height).toBeGreaterThanOrEqual(40)
    expect(await css(item, "border-top-left-radius")).toBe("8px")
    expect(await css(item, "font-size")).toBe("14px")
    expect(await css(item, "column-gap")).toBe("8px")
    expect((await box(item.locator("svg"))).width).toBe(20)
    // ホバー：accent
    await item.hover()
    await expect(item).toHaveAttribute("data-highlighted", "")
    expect(sameColor(await css(item, "background-color"), await token(page, "--accent"))).toBe(true)
    // 危険な操作：destructive の色。ハイライトしても 4.5:1 以上
    const del = menu.getByRole("menuitem", { name: "削除" })
    expect(sameColor(await css(del, "color"), await token(page, "--destructive"))).toBe(true)
    await del.hover()
    expect(await colorContrast(page, await css(del, "color"), await css(del, "background-color"))).toBeGreaterThanOrEqual(4.5)
    // 区切り線で分ける
    await expect(menu.getByRole("separator")).toHaveCount(1)
  })

  test("keyboard: arrows, typeahead, Enter, Space, Escape", async ({ page }) => {
    await open(page, "dropdown-menu")
    const trigger = page.getByTestId("menu-actions-trigger")
    await openWithKeyboard(page, trigger)
    const menu = page.getByTestId("menu-actions")
    await settle(menu)
    await expect(menu.getByRole("menuitem", { name: "編集" })).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(menu.getByRole("menuitem", { name: "複製" })).toBeFocused()
    await page.keyboard.press("End")
    await expect(menu.getByRole("menuitem", { name: "削除" })).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(menu.getByRole("menuitem", { name: "編集" })).toBeFocused()
    // 文字の入力で、先頭が一致する項目へ移る
    await page.keyboard.press("c")
    await expect(menu.getByRole("menuitem", { name: "CSV で書き出す" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId("menu-actions-status")).toHaveText("「CSV で書き出す」を選びました")
    // Space でも実行する
    await page.keyboard.press("Enter")
    await settle(menu)
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Space")
    await expect(menu).toBeHidden()
    await expect(page.getByTestId("menu-actions-status")).toHaveText("「複製」を選びました")
    // Escape で閉じる
    await page.keyboard.press("Enter")
    await settle(menu)
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
    // ↓ でも開く
    await page.keyboard.press("ArrowDown")
    await settle(menu)
    await expect(menu.getByRole("menuitem", { name: "編集" })).toBeFocused()
    await page.keyboard.press("Escape")
    // 外側のクリックで閉じる
    await trigger.click()
    await settle(menu)
    await clickOutside(page)
    await expect(menu).toBeHidden()
  })

  test("background does not scroll while open", async ({ page, isMobile }) => {
    test.skip(isMobile, "wheel only")
    await open(page, "dropdown-menu")
    await page.getByTestId("menu-actions-trigger").click()
    await settle(page.getByTestId("menu-actions"))
    const before = await page.evaluate(() => window.scrollY)
    await page.mouse.move(8, 600)
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.scrollY)).toBe(before)
  })

  test("inset aligns text with icon items; submenu; checkbox items stay open", async ({ page, isMobile }) => {
    await open(page, "dropdown-menu")
    await page.getByTestId("menu-inset-trigger").click()
    const menu = page.getByTestId("menu-inset")
    // 開く動き（大きさ 95% → 100%）の途中では、項目の位置が毎フレーム変わる。
    // 動きが終わるまで待ち、2 つの項目の文字の位置を同じフレームで測る。
    // 連続する 2 フレームで値が変わらなくなったこと（位置が安定したこと）を条件にする。
    await settle(menu)
    const [insetX, iconX] = await menu.evaluate(async (el) => {
      const textX = (item: Element) => {
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT)
        const r = document.createRange()
        r.selectNodeContents(walker.nextNode()!)
        return r.getBoundingClientRect().x
      }
      const measure = () => {
        const inset = el.querySelector("[data-testid=menu-inset-item]")!
        const icon = Array.from(el.querySelectorAll("[role=menuitem]")).find((i) => i.textContent?.includes("PDF で書き出す"))!
        return [textX(inset), textX(icon)]
      }
      let prev = measure()
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => requestAnimationFrame(r))
        const next = measure()
        if (next[0] === prev[0] && next[1] === prev[1]) return next
        prev = next
      }
      throw new Error(`menu items did not settle: ${prev}`)
    })
    expect(Math.round(insetX)).toBe(Math.round(iconX))
    if (!isMobile) {
      await page.getByTestId("menu-sub-trigger").focus()
      await page.keyboard.press("ArrowRight")
      await settle(page.getByTestId("menu-sub"))
      // サブメニューの先頭にフォーカスが移ってから ← を押す
      await expect(page.getByTestId("menu-sub").getByRole("menuitem").first()).toBeFocused()
      await page.keyboard.press("ArrowLeft")
      await expect(page.getByTestId("menu-sub")).toBeHidden()
    }
    await page.keyboard.press("Escape")
    await page.getByTestId("menu-view-trigger").click()
    const view = page.getByTestId("menu-view")
    const item = view.getByRole("menuitemcheckbox", { name: "最終更新" })
    await expect(item).toHaveAttribute("aria-checked", "false")
    await item.click()
    await settle(view)
    await expect(item).toHaveAttribute("aria-checked", "true")
  })

  test("edge: stays inside the screen, long items wrap", async ({ page }) => {
    await open(page, "dropdown-menu")
    await page.getByTestId("menu-edge-trigger").click()
    const menu = page.getByTestId("menu-edge")
    await settle(menu)
    const { w } = await viewport(page)
    const mb = await box(menu)
    expect(mb.x).toBeGreaterThanOrEqual(8 - 1)
    expect(mb.x + mb.width).toBeLessThanOrEqual(w - 8 + 1)
    expect(await menu.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })

  test("reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "dropdown-menu")
    await page.getByTestId("menu-actions-trigger").click()
    const menu = page.getByTestId("menu-actions")
    await settle(menu)
    expect(await startingStyle(menu, "scale")).toBe("none")
  })
})

test.describe("Sheet", { tag: "@webkit" }, () => {
  test("view mode: tokens, non-modal, switching customers keeps the sheet open", async ({ page, isMobile }) => {
    await open(page, "sheet")
    const row1 = page.getByTestId("sheet-row-C-0012")
    const row2 = page.getByTestId("sheet-row-C-0015")
    await row1.click()
    const sheet = page.getByTestId("sheet-customer")
    await settle(sheet)
    await expect(sheet).toHaveAttribute("data-mode", "view")
    await expect(sheet).toHaveAccessibleName("山田商事")
    const { w, h } = await viewport(page)
    const sb = await box(sheet)
    expect(Math.round(sb.x + sb.width)).toBe(w)
    expect(Math.round(sb.height)).toBe(h)
    expect(Math.round(sb.width)).toBe(Math.min(480, w))
    expect(await css(sheet, "border-left-width")).toBe("1px")
    expect(await css(sheet, "border-top-left-radius")).toBe("0px")
    expect(sameColor(await css(sheet, "background-color"), await token(page, "--background"))).toBe(true)
    expect(await css(sheet, "transition-duration")).toBe("0.24s")
    expect(await css(sheet.locator("[data-slot=sheet-header]"), "padding-left")).toBe("24px")
    expect(await css(sheet.locator("[data-slot=sheet-header]"), "padding-top")).toBe("24px")
    await expect(sheet.getByRole("button", { name: "閉じる" })).toBeVisible()
    // 背景を暗くしない
    await expect(page.locator("[data-slot=sheet-overlay]")).toHaveCount(0)
    if (isMobile) return
    // 背景の一覧を操作できる。開いたまま別の顧客を選ぶと、表示が切り替わる
    const rb = await box(row2)
    expect(await hitInside(page, rb.x + 4, rb.y + rb.height / 2, row2)).toBe(true)
    await row2.click()
    await settle(sheet)
    await expect(sheet).toHaveAccessibleName("佐藤製作所")
    await expect(row2.locator("xpath=ancestor::tr")).toHaveAttribute("aria-current", "true")
    // フォーカスを閉じ込めない
    await expect(row2).toBeFocused()
    // 背景のスクロールを止めない
    const before = await page.evaluate(() => window.scrollY)
    await page.mouse.move(100, 600)
    await page.mouse.wheel(0, 400)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before)
    // Escape で閉じる
    await sheet.getByRole("button", { name: "閉じる" }).focus()
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
  })

  test("edit mode: modal, focus trapped, unsaved changes ask before discarding", async ({ page, isMobile }) => {
    await open(page, "sheet")
    await page.getByTestId("sheet-row-C-0012").click()
    const sheet = page.getByTestId("sheet-customer")
    await page.getByTestId("sheet-edit").click()
    await expect(sheet).toHaveAttribute("data-mode", "edit")
    await expectOverlay(page, "sheet-overlay")
    const name = page.getByTestId("sheet-field-name")
    if (!isMobile) await expect(name).toBeFocused()
    // 背景の一覧は押せない
    const row2 = page.getByTestId("sheet-row-C-0015")
    const rb = await box(row2)
    expect(await hitInside(page, rb.x + 4, rb.y + rb.height / 2, row2)).toBe(false)
    // Tab で移動しても Sheet の外に出ない
    await name.focus()
    await tabInside(page, sheet, 12)
    // 変更がある状態での閉じる操作
    await name.fill("山田商事株式会社")
    await clickOutside(page)
    await page.waitForTimeout(300)
    await settle(sheet)
    const alert = page.getByTestId("sheet-discard")
    await sheet.getByRole("button", { name: "閉じる" }).click()
    await settle(alert)
    await expect(alert.getByRole("button", { name: "編集を続ける" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(alert).toBeHidden()
    await expect(sheet).toHaveAttribute("data-mode", "edit")
    // キャンセル → 破棄 → 閲覧に戻る
    await page.getByTestId("sheet-cancel").click()
    await settle(alert)
    await alert.getByRole("button", { name: "変更を破棄" }).click()
    await expect(sheet).toHaveAttribute("data-mode", "view")
    await expect(sheet).toHaveAccessibleName("山田商事")
    await expect(page.locator("[data-slot=sheet-overlay]")).toHaveCount(0)
    // 保存 → 閲覧に戻り、一覧に反映される
    await page.getByTestId("sheet-edit").click()
    await page.getByTestId("sheet-field-name").fill("山田商事株式会社")
    await page.getByTestId("sheet-save").click()
    await expect(sheet).toHaveAttribute("data-mode", "view")
    await expect(sheet).toHaveAccessibleName("山田商事株式会社")
    await expect(page.getByTestId("sheet-row-C-0012")).toHaveText("山田商事株式会社")
    await expect(page.getByTestId("sheet-status")).toHaveText("山田商事株式会社の変更を保存しました")
    // 変更のない編集は、閉じるボタンですぐに閉じる
    await page.getByTestId("sheet-edit").click()
    await sheet.getByRole("button", { name: "閉じる" }).click()
    await expect(sheet).toBeHidden()
  })

  test("Dropdown Menu in Sheet: Escape closes only the menu", async ({ page }) => {
    await open(page, "sheet")
    await page.getByTestId("sheet-row-C-0012").click()
    const sheet = page.getByTestId("sheet-customer")
    const trigger = page.getByTestId("sheet-actions-trigger")
    await trigger.click()
    const menu = page.getByTestId("sheet-actions")
    await settle(menu)
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    await settle(sheet)
    await expect(trigger).toBeFocused()
    await trigger.click()
    await menu.getByRole("menuitem", { name: "複製" }).click()
    await settle(sheet)
    await expect(page.getByTestId("sheet-status")).toHaveText("「複製」を選びました")
  })

  test("fixed header, scrolling body, sizes", async ({ page }) => {
    await open(page, "sheet")
    await page.getByTestId("sheet-row-C-0021").click()
    const sheet = page.getByTestId("sheet-customer")
    const header = sheet.locator("[data-slot=sheet-header]")
    const body = sheet.locator("[data-slot=sheet-body]")
    const before = await box(header)
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    expect((await box(header)).y).toBe(before.y)
    expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
    const { w } = await viewport(page)
    for (const [size, width] of [["sm", 360], ["default", 480], ["lg", 640]] as const) {
      await page.getByTestId(`sheet-trigger-${size}`).click()
      const s = page.getByTestId(`sheet-${size}`)
      await settle(s)
      expect(Math.round((await box(s)).width)).toBe(Math.min(width, w))
      await s.locator("[data-slot=sheet-close-button]").click()
      await expect(s).toBeHidden()
    }
  })

  test("reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "sheet")
    await page.getByTestId("sheet-row-C-0012").click()
    const sheet = page.getByTestId("sheet-customer")
    await settle(sheet)
    expect(await css(sheet, "transition-duration")).toBe("0s")
    expect(await startingStyle(sheet, "translate")).toBe("none")
  })
})

// Chromium の CDP でタッチの操作を送る。
async function touchDrag(page: Page, x: number, y: number, dy: number) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type: "touchStart" | "touchMove" | "touchEnd", ty: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: ty }] })
  await send("touchStart", y)
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", y + (dy * i) / steps)
    await page.waitForTimeout(16)
  }
  await send("touchEnd", y + dy)
  await cdp.detach()
}

test.describe("Drawer", { tag: "@webkit" }, () => {
  test("tokens", async ({ page }) => {
    await open(page, "drawer")
    await page.getByTestId("drawer-share-trigger").click()
    const popup = page.getByTestId("drawer-share")
    await settle(popup)
    await expect(popup).toHaveAttribute("role", "dialog")
    await expect(popup).toHaveAccessibleName("請求書を共有")
    await expectOverlay(page, "drawer-overlay")
    expect(await css(popup, "border-top-left-radius")).toBe("20px")
    expect(await css(popup, "border-bottom-left-radius")).toBe("0px")
    expect(sameColor(await css(popup, "background-color"), await token(page, "--background"))).toBe(true)
    expect(await css(popup, "transition-duration")).toBe("0.24s")
    const header = popup.locator("[data-slot=drawer-header]")
    expect(await css(header, "padding-left")).toBe("24px")
    expect(await css(header, "padding-top")).toBe("24px")
    const handle = popup.locator("[data-slot=drawer-handle]")
    const hb = await box(handle)
    expect([hb.width, hb.height]).toEqual([32, 4])
    expect(await css(handle, "border-top-left-radius")).not.toBe("0px")
    await expect(handle).toHaveAttribute("aria-hidden", "true")
    const { h } = await viewport(page)
    const pb = await box(popup)
    expect(Math.round(pb.y + pb.height)).toBe(h)
    await expect(popup.getByRole("button", { name: "閉じる" })).toBeVisible()
    // Safe Area：下端の余白に env(safe-area-inset-bottom) を足す
    expect(await popup.locator("[data-slot=drawer-body]").getAttribute("class")).toContain("env(safe-area-inset-bottom)")
  })

  test("long content: max height 90%, scrolls inside", async ({ page }) => {
    await open(page, "drawer")
    await page.getByTestId("drawer-long-trigger").click()
    const popup = page.getByTestId("drawer-long")
    await settle(popup)
    const { h } = await viewport(page)
    expect((await box(popup)).height).toBeLessThanOrEqual(h * 0.9 + 1)
    const body = page.getByTestId("drawer-long-body")
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await expect(popup.locator("[data-slot=drawer-footer]").getByRole("button", { name: "閉じる" })).toBeInViewport()
    expect(await css(popup.locator("[data-slot=drawer-footer]"), "padding-bottom")).toBe("24px")
  })

  test("keyboard: focus inside, Escape closes, focus returns; selecting an action closes", async ({ page }) => {
    await open(page, "drawer")
    const trigger = page.getByTestId("drawer-share-trigger")
    await openWithKeyboard(page, trigger)
    const popup = page.getByTestId("drawer-share")
    await settle(popup)
    await expect.poll(() => containsFocus(popup)).toBe(true)
    await tabInside(page, popup, 6)
    await page.keyboard.press("Escape")
    await expect(popup).toBeHidden()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await popup.getByRole("button", { name: "リンクをコピー" }).click()
    await expect(popup).toBeHidden()
    await expect(page.getByTestId("drawer-share-status")).toHaveText("リンクをコピーしました")
    await trigger.click()
    await clickOutside(page)
    await expect(popup).toBeHidden()
  })

  test("unsaved changes: outside click ignored, Escape asks before discarding", async ({ page }) => {
    await open(page, "drawer")
    await page.getByTestId("drawer-note-trigger").click()
    const popup = page.getByTestId("drawer-note")
    await page.getByTestId("drawer-note-field").fill("来週、請求書の宛名を確認する")
    await clickOutside(page)
    await page.waitForTimeout(300)
    await settle(popup)
    await page.getByTestId("drawer-note-field").focus()
    await page.keyboard.press("Escape")
    const alert = page.getByTestId("drawer-discard")
    await settle(alert)
    await expect(alert.getByRole("button", { name: "編集を続ける" })).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(alert).toBeHidden()
    await settle(popup)
    await popup.getByRole("button", { name: "閉じる" }).click()
    await settle(alert)
    await alert.getByRole("button", { name: "変更を破棄" }).click()
    await expect(popup).toBeHidden()
    await expect(page.getByTestId("drawer-note-status")).toHaveText("")
  })

  test("swipe: closes from the handle, not while the content can scroll, not with unsaved changes", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "touch events are sent with Chromium CDP")
    await open(page, "drawer")
    // 内容がスクロールできる間は、下へのスワイプでスクロールし、閉じない
    await page.getByTestId("drawer-long-trigger").click()
    const long = page.getByTestId("drawer-long")
    const body = page.getByTestId("drawer-long-body")
    await settle(long)
    await page.waitForTimeout(300)
    await body.evaluate((el) => el.scrollTo(0, 400))
    const bb = await box(body)
    await touchDrag(page, bb.x + bb.width / 2, bb.y + 40, 200)
    await page.waitForTimeout(500)
    await settle(long)
    expect(await body.evaluate((el) => el.scrollTop)).toBeLessThan(400)
    // 上端に達してから下へスワイプすると閉じる
    await body.evaluate((el) => el.scrollTo(0, 0))
    await touchDrag(page, bb.x + bb.width / 2, bb.y + 40, 400)
    await expect(long).toBeHidden()

    // 未保存の変更があるときは、スワイプでは閉じずに破棄を確かめる
    await page.getByTestId("drawer-note-trigger").click()
    const note = page.getByTestId("drawer-note")
    await settle(note)
    await page.getByTestId("drawer-note-field").fill("メモ")
    await page.getByTestId("drawer-note-field").blur()
    const nb = await box(note)
    await touchDrag(page, nb.x + nb.width / 2, nb.y + 12, 400)
    await expect(page.getByTestId("drawer-discard")).toBeVisible()
    await expect(note).toBeVisible()
    // スワイプした面は元の位置に戻る
    await expect.poll(async () => Math.round((await box(note)).y)).toBe(Math.round(nb.y))
  })

  test("reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await open(page, "drawer")
    await page.getByTestId("drawer-share-trigger").click()
    const popup = page.getByTestId("drawer-share")
    await settle(popup)
    expect(await css(popup, "transition-duration")).toBe("0s")
    // 開く直前の位置に移動しない（下へずらす指定が効かない）
    expect(await startingStyle(popup, "transform")).toBe(await css(popup, "transform"))
    await page.emulateMedia({ reducedMotion: "no-preference" })
    expect(await startingStyle(popup, "transform")).not.toBe(await css(popup, "transform"))
  })
})

test.describe("brand and portal", { tag: "@webkit" }, () => {
  test("overlays in portals follow --primary and keep contrast", async ({ page }) => {
    await open(page, "dialog")
    await page.getByRole("radio", { name: "青" }).check()
    await page.getByTestId("dialog-trigger-default").click()
    const primary = page.getByTestId("dialog-default").getByRole("button", { name: "変更を保存" })
    await expect.poll(() => css(primary, "background-color")).toBe("rgb(30, 64, 175)")
    expect(await buttonContrast(primary)).toBeGreaterThanOrEqual(4.5)
    // Portal は <body> の直下に置かれ、テーマの変数を継承する
    expect(await page.getByTestId("dialog-default").evaluate((el) => el.closest("main") === null)).toBe(true)
    expect(await css(page.getByTestId("dialog-default"), "font-family")).toBe(await css(page.locator("body"), "font-family"))
    await page.keyboard.press("Escape")
    await page.getByRole("radio", { name: "紫" }).check()
    await page.getByTestId("dialog-trigger-default").click()
    await expect.poll(() => css(primary, "background-color")).toBe("rgb(109, 40, 217)")
    expect(await buttonContrast(primary)).toBeGreaterThanOrEqual(4.5)
  })

  test("modal surfaces share z-40; stacking within the layer follows the order of opening", async ({ page }) => {
    await open(page, "dialog")
    await page.getByTestId("dialog-dirty-trigger").click()
    await page.getByTestId("dialog-dirty-name").fill("x")
    await page.keyboard.press("Escape")
    const alert = page.getByTestId("dialog-discard")
    await settle(alert)
    // 入れ子の Alert Dialog は背景を重ねて描かない
    await expect(page.locator("[data-slot=alert-dialog-overlay]")).toHaveCount(0)
    const z = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-slot$=overlay],[data-slot$=viewport]")).map((el) => getComputedStyle(el).zIndex)
    )
    expect(new Set(z)).toEqual(new Set(["40"]))
    const ab = await box(alert)
    expect(await hitInside(page, ab.x + ab.width / 2, ab.y + 12, alert)).toBe(true)
  })
})

// ---------------------------------------------------------------- v0.1 の最終調整の回帰テスト

const outlineOf = (l: Locator) =>
  l.evaluate((el) => {
    const s = getComputedStyle(el)
    return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor }
  })

// キー操作のフォーカスの枠：2px、項目の内側（offset -2px）、色は ring。項目の面と 3:1 以上。
async function expectItemRing(page: Page, item: Locator) {
  await expect(item).toBeFocused()
  const o = await outlineOf(item)
  expect(o.style).toBe("solid")
  expect(o.width).toBe("2px")
  expect(o.offset).toBe("-2px")
  expect(sameColor(o.color, await token(page, "--ring"))).toBe(true)
  expect(await colorContrast(page, o.color, await css(item, "background-color"))).toBeGreaterThanOrEqual(3)
}
const expectNoRing = async (item: Locator) => expect((await outlineOf(item)).style).toBe("none")
const focused = (page: Page) => page.locator(":focus")

test.describe("keyboard highlight", { tag: "@webkit" }, () => {
  test("dropdown menu: pointer keeps the subtle background, keys show the ring", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer hover")
    await open(page, "dropdown-menu")
    await page.getByTestId("menu-actions-trigger").click()
    const menu = page.getByTestId("menu-actions")
    await settle(menu)
    const copy = menu.getByRole("menuitem", { name: "複製" })
    await copy.hover()
    await expect(copy).toHaveAttribute("data-highlighted", "")
    expect(sameColor(await css(copy, "background-color"), await token(page, "--accent"))).toBe(true)
    await expectNoRing(copy)
    // キー操作に切り替えると枠が出る
    await page.keyboard.press("ArrowDown")
    await expectItemRing(page, menu.getByRole("menuitem", { name: "CSV で書き出す" }))
    // ポインターを動かすと、枠を消して背景色だけに戻る
    const del = menu.getByRole("menuitem", { name: "削除" })
    await del.hover()
    await expect(del).toBeFocused()
    await expectNoRing(del)
    // 再びキーを押すと枠が出る。危険な操作でも枠は ring の色で、文字は 4.5:1 以上
    await page.keyboard.press("ArrowUp")
    await page.keyboard.press("ArrowDown")
    await expectItemRing(page, del)
    expect(await colorContrast(page, await css(del, "color"), await css(del, "background-color"))).toBeGreaterThanOrEqual(4.5)
  })

  test("dropdown menu: ring on every item kind, selection is shown separately", async ({ page, isMobile }) => {
    await open(page, "dropdown-menu")
    await openWithKeyboard(page, page.getByTestId("menu-view-trigger"))
    const view = page.getByTestId("menu-view")
    await settle(view)
    // RadioItem
    await expectItemRing(page, view.getByRole("menuitemradio", { name: "更新日の新しい順" }))
    await page.keyboard.press("ArrowDown")
    const byName = view.getByRole("menuitemradio", { name: "会社名の順" })
    await expectItemRing(page, byName)
    // 選択中（aria-checked と Check）の項目は、フォーカスがなければ枠を出さない
    const checkedRadio = view.getByRole("menuitemradio", { name: "更新日の新しい順" })
    await expect(checkedRadio).toHaveAttribute("aria-checked", "true")
    await expect(checkedRadio.locator("svg")).toBeVisible()
    await expectNoRing(checkedRadio)
    // CheckboxItem
    await page.keyboard.press("ArrowDown")
    const company = view.getByRole("menuitemcheckbox", { name: "会社名" })
    await expectItemRing(page, company)
    await expect(company).toHaveAttribute("aria-checked", "true")
    await page.keyboard.press("ArrowDown")
    await expectItemRing(page, view.getByRole("menuitemcheckbox", { name: "担当者" }))
    await expectNoRing(company)
    await page.keyboard.press("Escape")
    // SubmenuTrigger
    await openWithKeyboard(page, page.getByTestId("menu-inset-trigger"))
    const inset = page.getByTestId("menu-inset")
    await settle(inset)
    await page.keyboard.press("End")
    await expectItemRing(page, page.getByTestId("menu-sub-trigger"))
    if (!isMobile) {
      await page.keyboard.press("ArrowRight")
      await settle(page.getByTestId("menu-sub"))
      await expectItemRing(page, page.getByTestId("menu-sub").getByRole("menuitem").first())
      // サブメニューを開いたトリガーは accent の面で示し、枠は出さない
      await expectNoRing(page.getByTestId("menu-sub-trigger"))
    }
  })

  test("ring keeps contrast when a product sets --ring to the brand color", async ({ page }) => {
    await open(page, "dropdown-menu")
    for (const ring of ["#1e40af", "#6d28d9"]) {
      await page.evaluate((r) => document.documentElement.style.setProperty("--ring", r), ring)
      await openWithKeyboard(page, page.getByTestId("menu-actions-trigger"))
      const menu = page.getByTestId("menu-actions")
      await settle(menu)
      const item = menu.getByRole("menuitem", { name: "編集" })
      await expectItemRing(page, item)
      expect(await colorContrast(page, await css(item, "outline-color"), await token(page, "--popover"))).toBeGreaterThanOrEqual(3)
      await page.keyboard.press("Escape")
      await expect(menu).toBeHidden()
    }
  })

  test("select: ring stays visible at the scroll edges and differs from the selection", async ({ page }) => {
    await open(page, "select")
    const trigger = page.getByTestId("select-industry")
    await trigger.scrollIntoViewIfNeeded()
    await openWithKeyboard(page, trigger)
    const listbox = page.getByRole("listbox")
    await settle(page.locator("[data-slot=select-content]"))
    const count = await page.getByRole("option").count()
    // 先頭から末尾まで ↓ で移り、末尾から先頭まで ↑ で戻る。どの位置でも、フォーカスした選択肢の全体
    // （内側の枠を含む）がリストの表示範囲にあり、スクロールのボタンに隠れない。
    for (const key of ["ArrowDown", "ArrowUp"]) {
      for (let i = 0; i < count; i++) {
        if (i > 0) await page.keyboard.press(key)
        const item = focused(page)
        await expect(item).toHaveRole("option")
        await expect
          .poll(() =>
            item.evaluate((el) => {
              const list = el.closest("[role=listbox]")!.getBoundingClientRect()
              const r = el.getBoundingClientRect()
              const inside = r.top >= list.top - 0.5 && r.bottom <= list.bottom + 0.5
              const covered = Array.from(document.querySelectorAll("[data-slot^=select-scroll-]")).some((a) => {
                const b = a.getBoundingClientRect()
                return b.height > 0 && b.bottom > r.top + 0.5 && b.top < r.bottom - 0.5
              })
              return inside && !covered
            })
          , { message: `${key} ${i}` })
          .toBe(true)
        await expectItemRing(page, item)
      }
    }
    // 選択する。開き直すと、選択中の選択肢は Check で示し、フォーカスが移った別の選択肢にだけ枠を出す
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(listbox).toBeHidden()
    await page.keyboard.press("Enter")
    await settle(page.locator("[data-slot=select-content]"))
    const selected = page.getByRole("option", { selected: true })
    await expectItemRing(page, selected)
    await page.keyboard.press("ArrowDown")
    await expectNoRing(selected)
    await expect(selected.locator("[data-slot=select-item-indicator] svg")).toBeVisible()
    await expectItemRing(page, focused(page))
  })

  test("select: pointer hover shows no ring", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer hover")
    await open(page, "select")
    const trigger = page.getByTestId("select-industry")
    await trigger.click()
    await settle(page.locator("[data-slot=select-content]"))
    const option = page.getByRole("option", { name: "漁業" })
    await option.hover()
    await expect(option).toHaveAttribute("data-highlighted", "")
    await expectNoRing(option)
    await page.keyboard.press("ArrowDown")
    await expectItemRing(page, focused(page))
  })
})

test.describe("Sheet mode and modal", { tag: "@webkit" }, () => {
  async function choose(page: Page, testId: string, name: string) {
    await page.getByTestId(testId).click()
    await page.getByRole("option", { name, exact: true }).click()
    await expect(page.getByRole("listbox")).toBeHidden()
  }

  const combos = [
    { mode: "edit", modal: "指定しない", expected: "true" },
    { mode: "view", modal: "指定しない", expected: "false" },
    { mode: "view", modal: "true", expected: "true" },
    { mode: "edit", modal: "false", expected: "false" },
    { mode: "edit", modal: '"trap-focus"', expected: "trap-focus" },
  ] as const

  for (const c of combos) {
    test(`mode=${c.mode}, modal=${c.modal}: backdrop, background, scroll and focus follow modal=${c.expected}`, async ({ page, isMobile }) => {
      await open(page, "sheet")
      await choose(page, "sheet-matrix-mode", c.mode)
      await choose(page, "sheet-matrix-modal", c.modal)
      const behind = page.getByTestId("sheet-matrix-behind")
      await behind.scrollIntoViewIfNeeded()
      await page.getByTestId("sheet-matrix-trigger").click()
      const sheet = page.getByTestId("sheet-matrix")
      await settle(sheet)
      await expect(sheet).toHaveAttribute("data-mode", c.mode)
      await expect(sheet).toHaveAttribute("data-modal", c.expected)
      // 背景を暗くするのは、実際のモーダル性が true のときだけ
      await expect(page.locator("[data-slot=sheet-overlay]")).toHaveCount(c.expected === "true" ? 1 : 0)
      // 背景の操作：true のときだけ止める（モバイルは Sheet が画面全体を覆うため確かめない）
      if (!isMobile) {
        const bb = await box(behind)
        expect(await hitInside(page, bb.x + 4, bb.y + bb.height / 2, behind)).toBe(c.expected !== "true")
        // 背景のスクロール：true のときだけ止める
        const before = await page.evaluate(() => window.scrollY)
        await page.mouse.move(100, 400)
        await page.mouse.wheel(0, 300)
        await page.waitForTimeout(200)
        const after = await page.evaluate(() => window.scrollY)
        if (c.expected === "true") expect(after).toBe(before)
        else expect(after).not.toBe(before)
      }
      // フォーカス：false のときだけ Sheet の外に出られる
      await page.getByTestId("sheet-matrix-input").focus()
      if (c.expected === "false") {
        let left = false
        for (let i = 0; i < 8 && !left; i++) {
          await page.keyboard.press("Tab")
          await page.waitForTimeout(30)
          left = !(await containsFocus(sheet))
        }
        expect(left).toBe(true)
      } else {
        await tabInside(page, sheet, 6)
      }
      // 外側のクリック：true のときだけ閉じる（背景を操作できる間は、背景を押しても閉じない）
      await clickOutside(page)
      await page.waitForTimeout(300)
      if (c.expected === "true") await expect(sheet).toBeHidden()
      else await expect(sheet).toBeVisible()
    })
  }

  test("switching an open sheet between view and edit updates backdrop, background and focus", async ({ page, isMobile }) => {
    test.skip(isMobile, "the sheet covers the whole screen on mobile")
    await open(page, "sheet")
    await page.getByTestId("sheet-row-C-0012").click()
    const sheet = page.getByTestId("sheet-customer")
    await settle(sheet)
    const row2 = page.getByTestId("sheet-row-C-0015")
    for (const round of [1, 2]) {
      // 閲覧 → 編集
      await page.getByTestId("sheet-edit").click()
      await expect(sheet).toHaveAttribute("data-modal", "true")
      await expect(page.locator("[data-slot=sheet-overlay]")).toHaveCount(1)
      const rb = await box(row2)
      expect(await hitInside(page, rb.x + 4, rb.y + rb.height / 2, row2), `round ${round}`).toBe(false)
      await tabInside(page, sheet, 4)
      // 編集 → 閲覧（変更なしでキャンセル）
      await page.getByTestId("sheet-cancel").click()
      await expect(sheet).toHaveAttribute("data-modal", "false")
      await expect(page.locator("[data-slot=sheet-overlay]")).toHaveCount(0)
      const rb2 = await box(row2)
      expect(await hitInside(page, rb2.x + 4, rb2.y + rb2.height / 2, row2)).toBe(true)
      // 背景の要素への aria-hidden、スクロールの固定が外れている
      expect(await page.locator("#root").getAttribute("aria-hidden")).toBeNull()
      const before = await page.evaluate(() => window.scrollY)
      await page.mouse.move(100, 600)
      await page.mouse.wheel(0, 200)
      await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before)
      await page.evaluate(() => window.scrollTo(0, 0))
    }
    // 閲覧に戻った後は、別の行を選ぶと表示が切り替わる
    await row2.click()
    await expect(sheet).toHaveAccessibleName("佐藤製作所")
    await expect(row2).toBeFocused()
  })
})

test.describe("unsaved changes", { tag: "@webkit" }, () => {
  test("without onDiscardRequest: outside click is ignored, explicit closes still close", async ({ page }) => {
    await open(page, "dialog")
    const trigger = page.getByTestId("dialog-noconfirm-trigger")
    const popup = page.getByTestId("dialog-noconfirm")
    for (const close of ["Escape", "button"] as const) {
      await trigger.click()
      await settle(popup)
      await page.getByTestId("dialog-noconfirm-field").fill("来週電話する")
      await clickOutside(page)
      await page.waitForTimeout(300)
      await expect(popup).toBeVisible()
      if (close === "Escape") await page.keyboard.press("Escape")
      else await popup.getByRole("button", { name: "閉じる" }).first().click()
      await expect(popup).toBeHidden()
      await expect(page.locator("[role=alertdialog]")).toHaveCount(0)
    }
  })

  test("while saving, close requests are ignored; the product closes it after saving", async ({ page }) => {
    await open(page, "dialog")
    await page.getByTestId("dialog-dirty-trigger").click()
    const popup = page.getByTestId("dialog-dirty")
    await settle(popup)
    await page.getByTestId("dialog-dirty-name").fill("山田商事株式会社")
    await page.getByTestId("dialog-dirty-save").click()
    await expect(page.getByTestId("dialog-dirty-save")).toHaveAttribute("aria-busy", "true")
    await page.keyboard.press("Escape")
    await popup.locator("[data-slot=dialog-close-button]").click()
    await expect(popup).toBeVisible()
    await expect(page.getByTestId("dialog-discard")).toHaveCount(0)
    await expect(popup.getByRole("button", { name: "キャンセル" })).toBeDisabled()
    // 保存が終わると、製品が open を false にして閉じる
    await expect(popup).toBeHidden()
    await expect(page.getByTestId("dialog-dirty-status")).toHaveText("会社情報を保存しました")
  })

  test("repeated close requests open a single confirmation", async ({ page }) => {
    await open(page, "dialog")
    await page.getByTestId("dialog-dirty-trigger").click()
    const popup = page.getByTestId("dialog-dirty")
    await settle(popup)
    await page.getByTestId("dialog-dirty-name").fill("x")
    const close = popup.locator("[data-slot=dialog-close-button]")
    // 閉じるボタンを続けて押しても、確認は 1 つだけ開く（2 回目は確認の背景に当たる）
    await close.click()
    await close.click({ force: true })
    await expect(page.locator("[role=alertdialog]")).toHaveCount(1)
    await page.waitForTimeout(300)
    await expect(page.locator("[role=alertdialog]")).toHaveCount(1)
    // Escape は確認だけを閉じる。もう一度 Escape を押すと、確認が 1 つだけ開く
    await page.keyboard.press("Escape")
    await expect(page.locator("[role=alertdialog]")).toHaveCount(0)
    await expect(popup).toBeVisible()
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await expect(popup).toBeVisible()
    await page.getByTestId("dialog-dirty-name").focus()
    await page.keyboard.press("Escape")
    await expect(page.locator("[role=alertdialog]")).toHaveCount(1)
  })
})

test.describe("focus guards", { tag: "@webkit" }, () => {
  test("a dialog with one control keeps focus on it with Tab and Shift+Tab", async ({ page }) => {
    await open(page, "dialog")
    const trigger = page.getByTestId("dialog-single-trigger")
    await openWithKeyboard(page, trigger)
    const popup = page.getByTestId("dialog-single")
    await settle(popup)
    const close = popup.getByRole("button", { name: "閉じる" })
    await expect(close).toBeFocused()
    await tabInside(page, popup, 4)
    await expect(close).toBeFocused()
    await tabInside(page, popup, 4, "Shift+Tab")
    await expect(close).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(popup).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("nested alert dialog traps focus; closing returns focus inside the dialog", async ({ page }) => {
    await open(page, "dialog")
    await page.getByTestId("dialog-dirty-trigger").click()
    const popup = page.getByTestId("dialog-dirty")
    await settle(popup)
    const name = page.getByTestId("dialog-dirty-name")
    await name.fill("x")
    await page.keyboard.press("Escape")
    const alert = page.getByTestId("dialog-discard")
    await settle(alert)
    await tabInside(page, alert, 5)
    await tabInside(page, alert, 5, "Shift+Tab")
    await page.keyboard.press("Escape")
    await expect(alert).toBeHidden()
    await expect(name).toBeFocused()
    await tabInside(page, popup, 6)
  })

  test("continuous Tab at key-repeat speed (30ms) does not reach the page behind", async ({ page }) => {
    await open(page, "drawer")
    await openWithKeyboard(page, page.getByTestId("drawer-share-trigger"))
    const popup = page.getByTestId("drawer-share")
    await settle(popup)
    await recordFocus(page)
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press("Tab")
      await page.waitForTimeout(30)
    }
    await expect.poll(() => containsFocus(popup)).toBe(true)
    expect(await focusLeaks(popup)).toEqual([])
  })
})

test.describe("stacking with feedback components", { tag: "@webkit" }, () => {
  async function expectToastUsable(page: Page, behind: Locator) {
    const toast = page.locator("[data-slot=toast]").first()
    await expect(toast).toBeVisible()
    const tb = await box(toast)
    // Toast は Overlay の上にあり、押せる。支援技術から隠れない（aria-live の領域）
    expect(await hitInside(page, tb.x + tb.width / 2, tb.y + 12, toast)).toBe(true)
    expect(await toast.evaluate((el) => el.closest("[aria-hidden=true]") === null)).toBe(true)
    await expect(toast.locator("xpath=ancestor-or-self::*[@aria-live]").first()).toHaveAttribute("aria-live", "polite")
    // 閉じるボタンは Base UI の Toast の設計で aria-hidden のため、data-slot で取得する（Feedback の仕様）
    await toast.locator("[data-slot=toast-close]").click()
    await expect(page.locator("[data-slot=toast]")).toHaveCount(0)
    await expect(behind).toBeVisible()
  }

  test("toast above a dialog: visible, clickable, announced; the dialog stays open", async ({ page }) => {
    await open(page, "dialog")
    await page.getByTestId("dialog-combo-trigger").click()
    const popup = page.getByTestId("dialog-combo")
    await settle(popup)
    await page.getByTestId("dialog-combo-copy").click()
    await expectToastUsable(page, popup)
  })

  test("toast above a sheet in view mode", async ({ page }) => {
    await open(page, "sheet")
    await page.getByTestId("sheet-row-C-0012").click()
    const sheet = page.getByTestId("sheet-customer")
    await settle(sheet)
    await page.getByTestId("sheet-actions-trigger").click()
    await page.getByTestId("sheet-actions").getByRole("menuitem", { name: "複製" }).click()
    await expectToastUsable(page, sheet)
  })

  test("tooltip and popover in a dialog: above it, Escape closes the frontmost first", async ({ page, isMobile }) => {
    test.skip(isMobile, "Base UI の Tooltip はタッチ操作では開かない")
    await open(page, "dialog")
    const trigger = page.getByTestId("dialog-combo-trigger")
    await openWithKeyboard(page, trigger)
    const popup = page.getByTestId("dialog-combo")
    await settle(popup)
    // Tooltip（キーボードのフォーカスで開く）
    const copy = page.getByTestId("dialog-combo-copy")
    await tabInside(page, popup, 1)
    while (!(await isFocused(copy))) await tabInside(page, popup, 1)
    const tip = page.getByTestId("dialog-combo-tooltip")
    await expect(tip).toBeVisible()
    const tb = await box(tip)
    expect(await hitInside(page, tb.x + tb.width / 2, tb.y + tb.height / 2, tip)).toBe(true)
    await page.keyboard.press("Escape")
    await expect(tip).toBeHidden()
    await expect(popup).toBeVisible()
    await expect(copy).toBeFocused()
    // Popover
    const pt = page.getByTestId("dialog-combo-popover-trigger")
    await pt.focus()
    await page.keyboard.press("Enter")
    const pop = page.getByTestId("dialog-combo-popover")
    await settle(pop)
    const pb = await box(pop)
    expect(await hitInside(page, pb.x + pb.width / 2, pb.y + 8, pop)).toBe(true)
    await page.keyboard.press("Escape")
    await expect(pop).toBeHidden()
    await expect(popup).toBeVisible()
    await expect(pt).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(popup).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("after opening and closing several overlays, nothing is left behind", async ({ page }) => {
    await open(page, "dialog")
    await page.getByTestId("dialog-select-trigger").click()
    await settle(page.getByTestId("dialog-select"))
    await page.getByTestId("dialog-select-field").click()
    await page.getByRole("option", { name: "請求管理" }).click()
    // 選択肢の一覧が閉じる動きの途中で Dialog を閉じると、Chromium が ResizeObserver の通知の持ち越しを
    // window の error として報告する（docs/web/components/overlays.md の「検品で記録している事象」）。
    // ここでは、一覧が閉じてから Escape を押す。
    await expect(page.getByRole("listbox")).toBeHidden()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("dialog-select")).toBeHidden()
    await page.getByTestId("dialog-dirty-trigger").click()
    await page.getByTestId("dialog-dirty-name").fill("x")
    await page.keyboard.press("Escape")
    await page.getByTestId("dialog-discard").getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.getByTestId("dialog-dirty")).toBeHidden()
    await open(page, "sheet")
    await page.getByTestId("sheet-row-C-0012").click()
    await settle(page.getByTestId("sheet-customer"))
    await page.getByTestId("sheet-actions-trigger").click()
    await settle(page.getByTestId("sheet-actions"))
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("sheet-actions")).toBeHidden()
    await page.getByTestId("sheet-customer").locator("[data-slot=sheet-close-button]").click()
    await expect(page.getByTestId("sheet-customer")).toBeHidden()
    await expect
      .poll(() =>
        page.evaluate(() => ({
          inert: document.querySelectorAll("[data-base-ui-inert]").length,
          hidden: document.querySelectorAll("#root[aria-hidden], body > [aria-hidden=true]").length,
          popups: document.querySelectorAll("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]").length,
          overflow: [getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow].join(","),
        }))
      )
      .toEqual({ inert: 0, hidden: 0, popups: 0, overflow: "visible,visible" })
    // 背景の要素を押せる
    const row = page.getByTestId("sheet-row-C-0015")
    const rb = await box(row)
    expect(await hitInside(page, rb.x + 4, rb.y + rb.height / 2, row)).toBe(true)
  })

  test("floating elements (z-50) stay above modal surfaces (z-40)", async ({ page }) => {
    await open(page, "dialog")
    await page.getByTestId("dialog-select-trigger").click()
    await settle(page.getByTestId("dialog-select"))
    await page.getByTestId("dialog-select-field").click()
    await expect(page.getByRole("listbox")).toBeVisible()
    const z = await page.evaluate(() => ({
      modal: Array.from(document.querySelectorAll("[data-slot=dialog-overlay],[data-slot=dialog-viewport]")).map((el) => getComputedStyle(el).zIndex),
      floating: getComputedStyle(document.querySelector("[role=listbox]")!.closest("[data-side]")!.parentElement!).zIndex,
    }))
    expect(new Set(z.modal)).toEqual(new Set(["40"]))
    expect(z.floating).toBe("50")
  })
})

test.describe("AlertDialogMedia (compatibility)", { tag: "@webkit" }, () => {
  test("renders a 40px media above the title without changing the name or the safe focus", async ({ page }) => {
    await open(page, "alert-dialog")
    await openWithKeyboard(page, page.getByTestId("alert-media-trigger"))
    const popup = page.getByTestId("alert-media")
    await settle(popup)
    const media = page.getByTestId("alert-media-icon")
    const mb = await box(media)
    expect([mb.width, mb.height]).toEqual([40, 40])
    expect(mb.y).toBeLessThan((await box(popup.locator("[data-slot=alert-dialog-title]"))).y)
    await expect(popup).toHaveAccessibleName("山田商事を削除しますか？")
    await expect(popup.getByRole("button", { name: "キャンセル" })).toBeFocused()
  })

  test("a ref passed to AlertDialogContent does not disable the safe initial focus", async ({ page }) => {
    // プレビューの削除の確認は、AlertDialogContent に ref を渡している。開き終わった後、その ref が指す要素の
    // data-slot を画面に書き出す。製品の ref に要素が入り、かつキャンセルに初期フォーカスが当たることを確かめる。
    await open(page, "alert-dialog")
    await openWithKeyboard(page, page.getByTestId("alert-delete-trigger"))
    await expect(page.getByTestId("alert-delete").getByRole("button", { name: "キャンセル" })).toBeFocused()
    await expect(page.getByTestId("alert-delete-ref")).toHaveText("alert-dialog-content")
  })
})

test.describe("screenshots", () => {
  test("capture", async ({ page }, info) => {
    test.setTimeout(180_000)
    const dir = join(info.project.testDir, "..", "screenshots", info.project.name)
    const shot = async (name: string) => {
      await page.waitForTimeout(350)
      await page.screenshot({ path: `${dir}/${name}.png` })
    }
    for (const id of pages) {
      await open(page, id)
      await page.screenshot({ path: `${dir}/${id}-page.png`, fullPage: true })
    }
    await open(page, "dialog")
    for (const size of ["sm", "default", "lg", "xl"]) {
      await page.getByTestId(`dialog-trigger-${size}`).click()
      await shot(`dialog-${size}`)
      await page.keyboard.press("Escape")
      await expect(page.getByTestId(`dialog-${size}`)).toBeHidden()
    }
    await page.getByTestId("dialog-long-trigger").click()
    await shot("dialog-long")
    await page.keyboard.press("Escape")
    await page.getByTestId("dialog-dirty-trigger").click()
    await page.getByTestId("dialog-dirty-name").fill("山田商事株式会社")
    await page.keyboard.press("Escape")
    await shot("dialog-discard")
    await page.getByTestId("dialog-discard").getByRole("button", { name: "変更を破棄" }).click()
    await expect(page.getByTestId("dialog-dirty")).toBeHidden()
    await page.getByTestId("dialog-select-trigger").click()
    await page.getByTestId("dialog-select-field").click()
    await shot("dialog-select")
    await open(page, "alert-dialog")
    await openWithKeyboard(page, page.getByTestId("alert-delete-trigger"))
    await shot("alert-dialog-delete")
    await open(page, "popover")
    await page.getByTestId("popover-filter-trigger").click()
    await shot("popover-filter")
    await page.keyboard.press("Escape")
    await page.getByTestId("popover-edge-right-trigger").click()
    await shot("popover-edge")
    await open(page, "dropdown-menu")
    await openWithKeyboard(page, page.getByTestId("menu-actions-trigger"))
    await page.keyboard.press("ArrowDown")
    await shot("dropdown-menu-actions")
    await page.keyboard.press("Escape")
    await page.getByTestId("menu-view-trigger").click()
    await shot("dropdown-menu-view")
    await open(page, "sheet")
    await page.getByTestId("sheet-row-C-0012").click()
    await shot("sheet-view")
    // モバイルでは Sheet が画面全体を覆うため、閉じてから別の顧客を選ぶ
    if (info.project.name.includes("mobile")) {
      await page.getByTestId("sheet-customer").locator("[data-slot=sheet-close-button]").click()
      await expect(page.getByTestId("sheet-customer")).toBeHidden()
    }
    await page.getByTestId("sheet-row-C-0021").click()
    await shot("sheet-view-switched")
    await page.getByTestId("sheet-edit").click()
    await page.getByTestId("sheet-field-name").fill("北海道グリーンファーム株式会社")
    await shot("sheet-edit")
    await page.getByTestId("sheet-cancel").click()
    await shot("sheet-edit-discard")
    // v0.1：キー操作のハイライト、Select の端、Dialog の上の Toast
    await open(page, "dropdown-menu")
    await openWithKeyboard(page, page.getByTestId("menu-view-trigger"))
    await settle(page.getByTestId("menu-view"))
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown")
    await shot("dropdown-menu-keyboard")
    await page.keyboard.press("Escape")
    await open(page, "select")
    await page.getByTestId("select-industry").scrollIntoViewIfNeeded()
    await openWithKeyboard(page, page.getByTestId("select-industry"))
    await settle(page.locator("[data-slot=select-content]"))
    for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowDown")
    await shot("select-keyboard-end")
    await page.keyboard.press("Escape")
    await open(page, "dialog")
    await page.getByTestId("dialog-combo-trigger").click()
    await settle(page.getByTestId("dialog-combo"))
    await page.getByTestId("dialog-combo-copy").click()
    await shot("dialog-toast")
    await open(page, "drawer")
    await page.getByTestId("drawer-share-trigger").click()
    await shot("drawer-share")
    await page.keyboard.press("Escape")
    await page.getByTestId("drawer-long-trigger").click()
    await shot("drawer-long")
    await page.keyboard.press("Escape")
    await page.getByTestId("drawer-note-trigger").click()
    await shot("drawer-note")
  })
})
