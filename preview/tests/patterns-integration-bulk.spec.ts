import { readFile } from "node:fs/promises"

import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"
import { hold, listReady, openApp, pi, release, requests, row, setConfig } from "./patterns-integration-helpers"

// Patterns の横断の検証画面：一括操作・結果の照会・再試行・エクスポート・取り込み（15 章の 11〜16）。
collectPageErrors(test)

const select = (page: Page, name: string) => row(page, name).getByRole("checkbox", { name: `${name}を選択` }).check()
const bar = (page: Page) => page.getByTestId("customers-bar")
const result = (page: Page) => page.locator("[data-slot=bulk-result]")

async function pauseSelected(page: Page, names: string[]) {
  for (const n of names) await select(page, n)
  await bar(page).getByRole("button", { name: "停止にする" }).click()
  const dialog = page.getByTestId("pause-confirm")
  await expect(dialog.getByRole("heading", { name: `${names.length}件の顧客を停止にしますか？` })).toBeVisible()
  return dialog
}

test.describe("Patterns integration: bulk actions, export and import", () => {
  test("S11 the confirmation shows the fixed targets, closes when the run starts and the list shows the progress @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    const dialog = await pauseSelected(page, ["株式会社アオバ商事", "株式会社イズミ製作所"])
    await expect(dialog.getByTestId("pause-targets")).toHaveText(/株式会社アオバ商事.*株式会社イズミ製作所/)
    await expect(dialog.getByRole("button", { name: "キャンセル" })).toBeFocused()
    await hold(page, "bulk")
    await dialog.getByRole("button", { name: "2件を停止にする" }).click()
    await expect(dialog).toBeHidden()
    await expect(bar(page).locator("[data-slot=bulk-run-status]")).toBeVisible()
    await expect.poll(async () => (await requests(page, "bulk")).map((r) => r.payload)).toEqual([["c01", "c02"]])
    await release(page, { kind: "bulk" })
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "2件の顧客を停止にしました" })).toBeVisible()
    await expect(row(page, "株式会社アオバ商事")).toContainText("停止中")
    await expect(row(page, "株式会社イズミ製作所")).toContainText("停止中")
  })

  test("S11 a target change while confirming requires re-confirmation and runs the new target only", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    const dialog = await pauseSelected(page, ["株式会社アオバ商事", "株式会社イズミ製作所"])
    await pi(page, "setSelected", "c03", true)
    await expect(dialog.getByText("表示している間に、対象か内容が変わりました。変更後の内容を確かめてください。")).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "3件の顧客を停止にしますか？" })).toBeVisible()
    await dialog.getByRole("button", { name: "変更後の内容を確かめました" }).click()
    await dialog.getByRole("button", { name: "3件を停止にする" }).click()
    await expect.poll(async () => (await requests(page, "bulk")).map((r) => r.payload)).toEqual([["c01", "c02", "c03"]])
  })

  test("S12 a partially failed bulk action shows completed, failed and unknown counts instead of success", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await setConfig(page, { bulkOutcomes: { c02: "failed", c03: "unknown" } })
    const dialog = await pauseSelected(page, ["株式会社アオバ商事", "株式会社イズミ製作所", "株式会社ウミネコ運輸"])
    await dialog.getByRole("button", { name: "3件を停止にする" }).click()
    const alert = result(page)
    await expect(alert).toHaveAttribute("data-outcome", "warning")
    await expect(alert).toContainText("3件のうち、1件の停止が完了しました")
    await expect(alert.locator("dl")).toHaveText(/完了1件.*失敗1件.*結果が不明1件/)
    await expect(alert.locator("[data-slot=bulk-result-failed]")).toContainText("株式会社イズミ製作所：ほかの処理と重なったため、変更できませんでした")
    await expect(alert.locator("[data-slot=bulk-result-unknown]")).toBeVisible()
    await expect(page.locator("[data-slot=toast]").filter({ hasText: "停止にしました" })).toHaveCount(0)
  })

  test("S13 the unknown result is looked up with the current authorization instead of being run again", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await setConfig(page, { bulkOutcomes: { c03: "unknown" } })
    const dialog = await pauseSelected(page, ["株式会社アオバ商事", "株式会社ウミネコ運輸"])
    await dialog.getByRole("button", { name: "2件を停止にする" }).click()
    await expect(result(page)).toContainText("結果が不明1件")
    await result(page).getByRole("button", { name: "最新の状態を確認" }).click()
    await expect(page.getByTestId("bulk-checked")).toContainText("状態を確認しました：1件は停止になっていました")
    const lookups = await requests(page, "lookup")
    expect(lookups.map((r) => r.payload)).toEqual([["c03"]])
    // 照会の後も、一括操作を再実行していない
    expect(await requests(page, "bulk")).toHaveLength(1)
  })

  test("S13 an unknown result that was not applied can be retried only after the lookup", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await setConfig(page, { bulkOutcomes: { c03: "unknown" }, unknownApplied: false })
    const dialog = await pauseSelected(page, ["株式会社アオバ商事", "株式会社ウミネコ運輸"])
    await dialog.getByRole("button", { name: "2件を停止にする" }).click()
    await expect(result(page)).toContainText("結果が不明1件")
    // 照会の前には、結果が不明な行を再実行するボタンを示さない
    await expect(page.getByRole("button", { name: /再試行/ })).toHaveCount(0)
    await result(page).getByRole("button", { name: "最新の状態を確認" }).click()
    const checked = page.getByTestId("bulk-checked")
    await expect(checked).toContainText("株式会社ウミネコ運輸は変更されていませんでした")
    await checked.getByRole("button", { name: "変更されていなかった 1件を再試行" }).click()
    await expect.poll(async () => (await requests(page, "bulk")).map((r) => r.payload)).toEqual([["c01", "c03"], ["c03"]])
  })

  test("S14 retry sends only the confirmed failures, not the completed or unknown rows", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await setConfig(page, { bulkOutcomes: { c02: "failed", c03: "unknown" } })
    const dialog = await pauseSelected(page, ["株式会社アオバ商事", "株式会社イズミ製作所", "株式会社ウミネコ運輸"])
    await dialog.getByRole("button", { name: "3件を停止にする" }).click()
    await result(page).getByRole("button", { name: "失敗した 1件を再試行" }).click()
    await expect.poll(async () => (await requests(page, "bulk")).map((r) => r.payload)).toEqual([["c01", "c02", "c03"], ["c02"]])
    await expect(row(page, "株式会社イズミ製作所")).toContainText("停止中")
    // 一度実行した行は、サーバーで 1 回だけ処理している
    const processed = await page.evaluate(() => (window as unknown as { __fdPi: { config: { processed: string[] } } }).__fdPi.config.processed)
    expect(processed.filter((id) => id === "c01")).toHaveLength(1)
  })

  test("S15 export of the selected rows keeps the scope, defaults to the spreadsheet format and escapes formulas @webkit", async ({ page }) => {
    await openApp(page, { route: "page=customers", prepare: () => pi(page, "updateCustomer", "hq", "c02", { name: "=1+1 イズミ" }) })
    await listReady(page)
    await select(page, "株式会社アオバ商事")
    await select(page, "=1+1 イズミ")
    await bar(page).getByRole("button", { name: "エクスポート" }).click()
    const dialog = page.getByTestId("export-dialog")
    await expect(dialog.getByTestId("export-scope")).toHaveText("選んだ行（2件）")
    await expect(dialog.getByText("CSV（Excel で開く。BOM 付きの UTF-8）")).toBeVisible()
    const download = page.waitForEvent("download")
    await dialog.getByTestId("export-run").click()
    const file = await (await download).path()
    const text = await readFile(file, "utf8")
    expect(text.startsWith("﻿")).toBe(true)
    const lines = text.replace(/^﻿/, "").split("\r\n")
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain("株式会社アオバ商事")
    expect(lines[2].startsWith("'=1+1 イズミ")).toBe(true)
  })

  test("S15 when the selection becomes empty the export does not widen to the search results", async ({ page }) => {
    await openApp(page, { route: "page=customers" })
    await listReady(page)
    await select(page, "株式会社アオバ商事")
    await bar(page).getByRole("button", { name: "エクスポート" }).click()
    const dialog = page.getByTestId("export-dialog")
    await expect(dialog.getByTestId("export-scope")).toHaveText("選んだ行（1件）")
    await pi(page, "clearSelection")
    await expect(dialog.getByTestId("export-no-selection")).toBeVisible()
    await expect(dialog.getByTestId("export-scope")).toHaveText(/^選んだ行/)
    await expect(dialog.getByTestId("export-run")).toBeDisabled()
  })

  test("S16 an import whose response lacks some counts is not shown as success and is reconciled by 状態を確認", async ({ page }) => {
    await openApp(page, { route: "page=import" })
    await setConfig(page, { importMode: "incomplete" })
    await page.getByTestId("import-file").setInputFiles({
      name: "customers.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("名前,メールアドレス,プラン\n株式会社ヤマブキ,yamabuki@example.com,light\n株式会社ヨモギ,yomogi-example.com,standard\n株式会社ラベンダー,lavender@example.com,light\n"),
    })
    await expect(page.getByTestId("import-ready")).toContainText("3件")
    await page.getByTestId("import-run").click()
    const summary = page.getByTestId("import-result")
    await expect(summary).toContainText("結果を確かめられていない行があります")
    await expect(summary).not.toContainText("取り込みが終わりました")
    await expect(summary.getByRole("button", { name: /再処理/ })).toHaveCount(0)
    await summary.getByRole("button", { name: "状態を確認" }).click()
    await expect(summary).toContainText("一部の行を取り込めませんでした")
    await expect(summary).toContainText(/新規登録\s*2件/)
    await expect(summary).toContainText(/失敗\s*1件/)
  })

  test("S16 a complete partial response is shown as partial, not as success", async ({ page }) => {
    await openApp(page, { route: "page=import" })
    await page.getByTestId("import-file").setInputFiles({
      name: "customers.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("名前,メールアドレス,プラン\n株式会社ヤマブキ,yamabuki@example.com,light\n株式会社ヨモギ,yomogi-example.com,standard\n"),
    })
    await page.getByTestId("import-run").click()
    const summary = page.getByTestId("import-result")
    await expect(summary).toContainText("一部の行を取り込めませんでした")
    await expect(summary).toContainText(/失敗\s*1件/)
  })
})
