import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"
import { hold, openApp, pi, release, requests } from "./patterns-integration-helpers"

// Patterns の横断の検証画面：Dashboard、Drill-down、分析の条件の引き継ぎ、再取得中の表示（15 章の 17〜20）。
// 指標・明細・詳細は同じデータモデルから計算する。期待値は模擬のサーバーの summary（同じ計算）から得る。
collectPageErrors(test)

type Summary = { metrics: { revenue: number; active: number; paused: number } }
const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`
const metric = (page: Page, id: string) => page.getByTestId(`metric-${id}`)

async function chooseRegion(page: Page, region: string) {
  await page.getByTestId("analysis-region").click()
  await page.getByRole("option", { name: region, exact: true }).click()
}

test.describe("Patterns integration: analysis and drill-down", () => {
  test("S17 a KPI drills down to details that use the applied conditions and add up to the same value @webkit", async ({ page }) => {
    await openApp(page)
    const all = await pi<Summary>(page, "summary", "hq", { region: null, plan: null })
    await expect(metric(page, "revenue")).toContainText(all.metrics.revenue.toLocaleString("ja-JP"))
    await chooseRegion(page, "東京")
    const tokyo = await pi<Summary>(page, "summary", "hq", { region: "東京", plan: null })
    await expect(metric(page, "revenue")).toContainText(tokyo.metrics.revenue.toLocaleString("ja-JP"))
    await expect(page).toHaveURL(/region=%E6%9D%B1%E4%BA%AC/)
    await metric(page, "revenue").getByRole("link", { name: "明細を見る" }).click()
    await expect(page.getByRole("heading", { name: "月額の売上の明細", level: 1 })).toBeVisible()
    await expect(page.getByTestId("metric-conditions")).toHaveText("地域：東京、プラン：すべて、状態：契約中")
    await expect(page.getByTestId("metric-total")).toHaveText(yen(tokyo.metrics.revenue))
    await expect(page.getByTestId("metric-details").getByRole("row").filter({ has: page.getByRole("link") })).toHaveCount(tokyo.metrics.active)
  })

  test("S18 the record opened from the details shows the same value and keeps the analysis conditions in its breadcrumb", async ({ page }) => {
    await openApp(page, { route: "page=metric&metric=revenue&region=%E6%9D%B1%E4%BA%AC" })
    const link = page.getByTestId("metric-details").getByRole("link", { name: "株式会社アオバ商事" })
    const value = await page.getByTestId("metric-details").getByRole("row").filter({ has: page.getByRole("link", { name: "株式会社アオバ商事" }) }).getByRole("cell").last().textContent()
    await link.click()
    await expect(page.getByRole("heading", { name: "株式会社アオバ商事", level: 1 })).toBeVisible()
    await expect(page.getByTestId("detail-mrr")).toHaveText(value!)
    const crumbs = page.getByRole("navigation", { name: /パンくず|breadcrumb/i })
    await expect(crumbs.getByRole("link", { name: "分析" })).toHaveAttribute("href", /region=%E6%9D%B1%E4%BA%AC/)
    await expect(crumbs.getByRole("link", { name: "月額の売上の明細" })).toHaveAttribute("href", /metric=revenue.*region=%E6%9D%B1%E4%BA%AC/)
  })

  test("S19 editing the record from the details returns to the same details and then to the original analysis with its focus", async ({ page }) => {
    await openApp(page)
    await chooseRegion(page, "東京")
    const before = await pi<Summary>(page, "summary", "hq", { region: "東京", plan: null })
    await expect(metric(page, "revenue")).toContainText(before.metrics.revenue.toLocaleString("ja-JP"))
    await metric(page, "revenue").getByRole("link", { name: "明細を見る" }).click()
    await page.getByTestId("metric-details").getByRole("link", { name: "株式会社アオバ商事" }).click()
    await page.getByTestId("detail-edit").click()
    await page.getByTestId("edit-status").click()
    await page.getByRole("option", { name: "停止中" }).click()
    await page.getByTestId("edit-submit").click()

    await expect(page.getByRole("heading", { name: "月額の売上の明細", level: 1 })).toBeVisible()
    await expect(page.getByTestId("metric-conditions")).toContainText("地域：東京")
    await expect(page.getByTestId("metric-details").getByRole("link", { name: "株式会社アオバ商事" })).toHaveCount(0)
    await expect(page.getByTestId("metric-total")).toHaveText(yen(before.metrics.revenue - 29800))

    await page.getByRole("navigation", { name: /パンくず|breadcrumb/i }).getByRole("link", { name: "分析" }).click()
    await expect(page.getByTestId("analysis-region")).toHaveText("東京")
    await expect(metric(page, "revenue")).toContainText((before.metrics.revenue - 29800).toLocaleString("ja-JP"))
    await expect(metric(page, "revenue").getByRole("link", { name: "明細を見る" })).toBeFocused()
  })

  test("S20 while refetching, the region keeps the previous result and states the conditions it was computed with @webkit", async ({ page }) => {
    await openApp(page)
    const all = await pi<Summary>(page, "summary", "hq", { region: null, plan: null })
    await expect(metric(page, "revenue")).toContainText(all.metrics.revenue.toLocaleString("ja-JP"))
    await hold(page, "summary")
    await chooseRegion(page, "大阪")
    await expect.poll(async () => (await requests(page, "summary")).filter((r) => !r.settled).length).toBe(1)
    const region = page.getByTestId("analysis-metrics")
    await expect(region.getByText("表示中：地域：すべて、プラン：すべて")).toBeVisible()
    await expect(region.getByText("更新中")).toBeVisible()
    await expect(metric(page, "revenue")).toContainText(all.metrics.revenue.toLocaleString("ja-JP"))
    // 古い結果の明細へのリンクは、表示中の結果の条件（地域：すべて）を使う
    await expect(metric(page, "revenue").getByRole("link", { name: "明細を見る" })).not.toHaveAttribute("href", /region=/)
    await release(page, { kind: "summary" })
    const osaka = await pi<Summary>(page, "summary", "hq", { region: "大阪", plan: null })
    await expect(metric(page, "revenue")).toContainText(osaka.metrics.revenue.toLocaleString("ja-JP"))
    await expect(region.getByText(/^表示中：/)).toBeHidden()
  })
})
