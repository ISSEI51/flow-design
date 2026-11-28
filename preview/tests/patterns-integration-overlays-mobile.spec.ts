import { expect, test, type Locator, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"
import { listReady, noHorizontalScroll, openApp, pi, requests, row, setConfig, sidebarGo } from "./patterns-integration-helpers"

// Patterns の横断の検証画面：Drawer と Toast、Select と Dialog のフォーカス、320px での主要な操作（15 章の 34〜36）。
collectPageErrors(test)

/** 要素の中央の点で、その要素（か子孫）が最前面にある（ほかの要素に覆われず、押せる）。覆っている場合は、その要素の説明を返す */
const hitTestable = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (hit !== null && (el === hit || el.contains(hit))) return true
    return `covered by ${hit?.tagName ?? "nothing"}[${hit?.closest("[data-slot]")?.getAttribute("data-slot") ?? ""}] at ${Math.round(r.top)}/${window.innerHeight}`
  })

const overlaps = async (a: Locator, b: Locator) => {
  const [ra, rb] = [await a.boundingBox(), await b.boundingBox()]
  if (!ra || !rb) return false
  return ra.x < rb.x + rb.width && rb.x < ra.x + ra.width && ra.y < rb.y + rb.height && rb.y < ra.y + ra.height
}

const toast = (page: Page, text: string) => page.locator("[data-slot=toast]").filter({ hasText: text })

for (const width of [390, 320]) {
  test(`S34 Drawer form and Toast at ${width}px: the Drawer actions stay operable, its result is shown inside it, and the success Toast comes after it closes @webkit`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await openApp(page, { route: "page=customer&id=c01" })
    // 自動で消えない通知（失敗）を先に出しておく
    await setConfig(page, { statusMode: "failed" })
    await page.getByTestId("detail-pause").click()
    const failed = toast(page, "実行できませんでした")
    await expect(failed).toBeVisible()

    await page.getByTestId("contact-add").click()
    const drawer = page.locator("[data-slot=drawer-popup]")
    await expect(drawer.getByRole("heading", { name: "連絡の記録を追加" })).toBeVisible()
    // 開く動き（transform の transition）が終わってから、位置を確かめる
    await expect.poll(() => drawer.evaluate((el) => el.getAnimations().length)).toBe(0)
    const save = drawer.getByTestId("contact-save")
    const cancel = drawer.getByRole("button", { name: "キャンセル" })
    // 表示中の Toast は Drawer の上へずらす（Drawer の操作と重ねない）。Toast の移動の動き（transform の transition）が終わってから確かめる
    await expect.poll(() => failed.evaluate((el) => el.getAnimations().length)).toBe(0)
    await expect.poll(() => overlaps(failed, drawer)).toBe(false)
    expect(await hitTestable(cancel)).toBe(true)

    await drawer.getByTestId("contact-text").fill("電話で更新の意向を確認した")
    expect(await hitTestable(save)).toBe(true)
    await setConfig(page, { contactMode: "failed" })
    await save.click()
    // Drawer の中の操作の結果は、Drawer の中に示す（Toast を出さない）
    await expect(drawer.getByTestId("contact-error")).toContainText("記録を保存できませんでした")
    await expect(page.locator("[data-slot=toast]")).toHaveCount(1)
    expect(await hitTestable(save)).toBe(true)

    await setConfig(page, { contactMode: "success" })
    // 成功の Toast が、Drawer の面が残っている間に出ないことを記録する
    await page.evaluate(() => {
      const w = window as unknown as { __toastWithDrawer?: boolean }
      w.__toastWithDrawer = false
      new MutationObserver(() => {
        const t = Array.from(document.querySelectorAll("[data-slot=toast]")).some((el) => el.textContent?.includes("連絡の記録を保存しました"))
        if (t && document.querySelector("[data-slot=drawer-popup]")) w.__toastWithDrawer = true
      }).observe(document.body, { childList: true, subtree: true })
    })
    await save.click()
    await expect(drawer).toHaveCount(0)
    await expect(toast(page, "連絡の記録を保存しました")).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __toastWithDrawer: boolean }).__toastWithDrawer)).toBe(false)
    await expect(page.getByTestId("contact-list")).toContainText("電話で更新の意向を確認した")
    expect(await requests(page, "contact")).toHaveLength(2)
  })
}

test("S35 closing a Select and opening a Dialog right away: focus moves into the Dialog and returns to its trigger after closing @webkit", async ({ page }) => {
  await openApp(page, { route: "page=customers" })
  await listReady(page)
  const exportButton = page.getByTestId("customers-export")
  await page.getByTestId("sort-select").click()
  // 利用者の速さで続けて操作する（Select の閉じる動きの完了を待たない）
  await page.getByRole("option", { name: "月額の高い順" }).click()
  await exportButton.click()
  const dialog = page.getByTestId("export-dialog")
  await expect(dialog.getByRole("heading", { name: "顧客をエクスポート" })).toBeVisible()
  // Select の閉じる動きが終わった後も、フォーカスを Select に戻さない
  await expect(page.getByRole("listbox")).toHaveCount(0)
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  await dialog.getByRole("checkbox", { name: "メールアドレス" }).check()
  await dialog.getByRole("button", { name: "キャンセル" }).click()
  await expect(dialog).toBeHidden()
  await expect(exportButton).toBeFocused()
  await expect(page.getByTestId("sort-select")).toHaveText("月額の高い順")
})

test("S36 at 320px the main flow (navigate, search, check the detail, edit, save, return) completes without horizontal scrolling @webkit", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openApp(page)
  expect(await noHorizontalScroll(page)).toBe(true)
  await sidebarGo(page, "顧客")
  await listReady(page)
  expect(await noHorizontalScroll(page)).toBe(true)
  await page.getByTestId("customers-search").fill("ケヤキ")
  await expect(page.getByTestId("customers-count")).toHaveText("1件")
  await row(page, "株式会社ケヤキ不動産").getByRole("button", { name: "株式会社ケヤキ不動産", exact: true }).click()
  const sheet = page.getByTestId("customer-sheet")
  await expect(sheet.getByTestId("sheet-mrr")).toHaveText("29,800円")
  expect(await noHorizontalScroll(page)).toBe(true)
  await sheet.getByRole("button", { name: "編集" }).click()
  const form = page.getByTestId("edit-form")
  await form.getByLabel("社内のメモ").fill("320px での編集")
  expect(await noHorizontalScroll(page)).toBe(true)
  const submit = page.getByTestId("edit-submit")
  const box = (await submit.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(320)
  await submit.click()
  await expect(page).toHaveURL(/page=customers&restore=1/)
  await expect(page.getByTestId("customers-search")).toHaveValue("ケヤキ")
  await expect(row(page, "株式会社ケヤキ不動産").getByRole("button", { name: "株式会社ケヤキ不動産", exact: true })).toBeFocused()
  expect((await pi<{ note: string }>(page, "customer", "hq", "c09")).note).toBe("320px での編集")
  expect(await noHorizontalScroll(page)).toBe(true)
})
