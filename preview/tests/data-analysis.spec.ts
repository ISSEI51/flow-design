import { expect, test, type Locator, type Page } from "@playwright/test"

import { makeDate } from "../../registry/lib/date"
import { comparisonRange, fullPeriodOf, resolvePeriod } from "../../registry/patterns/analysis-period"
import { formatMetricValue } from "../../registry/patterns/metric-format"
import { churnedAccountList, overviewData, retentionSummary } from "../src/data/data-analysis/analysis-model"
import { ANALYSIS_TODAY, defaultAnalysisFilters, type AnalysisFilters } from "../src/data/data-analysis/subscriptions"
import { collectPageErrors } from "./page-errors"

// Patterns / Data Analysis（Metric Overview、Dashboard Layout、Analysis Filters、Period Comparison、Drill-down）の検品。
// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
// 模擬のサーバーは window.__fdAnalysisServer、運用の監視の更新は window.__fdOpsTicker で操作する。
// 期待する値は、画面と同じ集計の関数（data-analysis/analysis-model.ts）から Node.js で求め、固定の値を書かない。
collectPageErrors(test)

const docPages = ["metric-overview", "dashboard-layout", "analysis-filters", "period-comparison", "drill-down"]
const yen = (v: number | null) => formatMetricValue(v, { style: "currency", unit: "円" })!.text
const ctx = { today: ANALYSIS_TODAY, weekStartsOn: 1 as const, fiscalYearStartMonth: 4 }

type Server = NonNullable<Window["__fdAnalysisServer"]>
const server = <T,>(page: Page, fn: (s: Server) => T) =>
  page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdAnalysisServer), fn.toString()) as Promise<T>
const isDesktop = (page: Page) => page.viewportSize()!.width >= 768

async function openApp(page: Page, query: string) {
  await page.goto(`/#/analysis-app?${query}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await server(page, (s) => Object.assign(s.latency, { default: 60 }))
}

async function chooseOption(page: Page, trigger: Locator, name: string | RegExp) {
  await trigger.click()
  await page.getByRole("option", { name, exact: typeof name === "string" }).click()
  // 閉じる動きの間は一覧が残る。続けて別の Select を開くと、同じ名前の選択肢（期間の「前四半期」と比較の「前四半期」）が
  // 2 つになるため、一覧が閉じ終わるのを待つ
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

const main = (page: Page) => page.getByTestId("analysis-main")

// ------------------------------------------------------------------ 資料のページ
test.describe("Data Analysis pages", { tag: "@webkit" }, () => {
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
      for (const mock of await page.locator("figure [inert]").all()) expect(await mock.evaluate((el) => (el as HTMLElement).inert)).toBe(true)
      // 数値として表示してはいけない値（資料の本文の説明は対象にしない）
      for (const t of await page.locator("main").first().locator("[data-slot=metric-value], [data-slot=comparison-value], td").allTextContents()) expect(t).not.toMatch(/NaN|Infinity|undefined/)
    })
  }

  test("320px and 2560px: pages and the dashboards do not scroll horizontally", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    for (const width of [320, 2560]) {
      await page.setViewportSize({ width, height: 900 })
      for (const id of [...docPages, "analysis-app?page=business", "analysis-app?page=retention", "analysis-app?page=operations"]) {
        await page.goto(`/#/${id}`)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        await page.waitForTimeout(400)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${id} at ${width}`).toBe(true)
        // 表以外の領域が横にはみ出さない（表は表の領域の中だけで横にスクロールする）
        const overflow = await page.evaluate(() => {
          const m = document.querySelector<HTMLElement>("[data-testid=analysis-main]") ?? document.querySelector("main")
          return m ? m.scrollWidth - m.clientWidth : 0
        })
        expect(overflow, `${id} at ${width}`).toBeLessThanOrEqual(1)
      }
    }
  })
})

// ------------------------------------------------------------------ Metric Overview
test.describe("Metric Overview", () => {
  test("number notation follows the product's locale and keeps the exact value", async ({ page }) => {
    await page.goto("/#/metric-overview")
    const texts = page.getByTestId("mo-format").getByTestId("mo-format-text")
    await expect(texts.nth(0)).toHaveText("3,680万円")
    await expect(texts.nth(1)).toHaveText("約4.42億円")
    await expect(texts.nth(2)).toHaveText("約512万件")
    await expect(texts.nth(3)).toHaveText("3.2%")
    await expect(page.getByTestId("mo-format")).toContainText("441,600,000円")
    await page.getByTestId("mo-format").getByLabel("英語（en-US、USD）").check()
    await expect(texts.nth(1)).toHaveText("~$442M")
    await page.getByTestId("mo-format").getByLabel("省略しない").check()
    await expect(texts.nth(1)).toHaveText("$441,600,000")
  })

  test("direction and evaluation are separated and not shown by color alone", async ({ page }) => {
    await page.goto("/#/metric-overview")
    const metric = (name: string) => page.getByTestId("mo-evaluation").locator("[data-slot=metric]").filter({ hasText: name })
    const churn = metric("解約率").locator("[data-slot=comparison-value]")
    await expect(churn).toHaveAttribute("data-change", "decrease")
    await expect(churn).toHaveAttribute("data-evaluation", "improved")
    await expect(churn).toContainText("−0.8pt")
    await expect(churn).toContainText("改善")
    const errors = metric("エラー率").locator("[data-slot=comparison-value]")
    await expect(errors).toHaveAttribute("data-evaluation", "worsened")
    await expect(errors).toContainText("悪化")
    const neutral = metric("問い合わせ件数").locator("[data-slot=comparison-value]")
    await expect(neutral).toHaveAttribute("data-evaluation", "neutral")
    await expect(neutral).not.toContainText(/改善|悪化/)
    // 中立の指標に良否の色を使わない
    const color = await neutral.locator("span.font-medium").evaluate((el) => getComputedStyle(el).color)
    const muted = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--muted-foreground").trim())
    expect(color).toBe(await page.evaluate((c) => { const d = document.createElement("span"); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v }, muted))
    // 売上の増加は改善だが、増加が望ましい指標は評価の文字を付けない（読み上げには含める）
    const sales = metric("売上").locator("[data-slot=comparison-value]")
    await expect(sales).toHaveAttribute("data-evaluation", "improved")
    await expect(sales.locator(".sr-only")).toHaveText("（増加、改善）")
    await expect(metric("契約企業数").locator("[data-slot=comparison-value]")).toContainText("変化なし")
  })

  test("targets: over 100% keeps the value, limits, and invalid targets", async ({ page }) => {
    await page.goto("/#/metric-overview")
    const t = page.getByTestId("mo-target")
    const over = t.locator("[data-slot=metric]").filter({ hasText: "目標を超過" })
    await expect(over).toContainText("111.9%")
    await expect(over).toContainText("目標を超えています")
    await expect(over.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
    await expect(over.getByRole("progressbar")).toHaveAttribute("aria-valuetext", /111\.9%/)
    const under = t.locator("[data-slot=metric]").filter({ hasText: "目標に未達" })
    await expect(under).toContainText("期間の経過 25 / 30日")
    // 目標に届かないことだけを理由に Destructive にしない
    expect(await under.locator("[data-slot=progress-indicator]").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(211, 36, 36)")
    const limit = t.locator("[data-slot=metric]").filter({ hasText: "上限の目標" })
    await expect(limit).toContainText("月の上限を超えています")
    // 上限は、割合の割合（120.0%）ではなく、同じ単位の差で示す
    await expect(limit).toContainText("0.3pt 超過")
    await expect(limit).not.toContainText("120.0%")
    const within = t.locator("[data-slot=metric]").filter({ hasText: "上限の内" })
    await expect(within).toContainText("あと 0.9pt")
    await expect(within).toContainText("期間の経過 25 / 30日")
    // 目標値が 0 や負でも、達成率を作らずに達成・未達と実数の差を示す（バーは描かない）
    const zeroLimit = t.locator("[data-slot=metric]").filter({ hasText: "上限 0 件" })
    await expect(zeroLimit).toContainText("3件 超過")
    await expect(zeroLimit).toContainText("上限を超えています")
    await expect(zeroLimit.getByRole("progressbar")).toHaveCount(0)
    await expect(t.locator("[data-slot=metric]").filter({ hasText: "損益 0 円" })).toContainText("目標に達しました")
    const loss = t.locator("[data-slot=metric]").filter({ hasText: "赤字の削減" })
    await expect(loss).toContainText("あと 700,000円")
    await expect(loss).not.toContainText("%")
    await expect(t.locator("[data-slot=metric]").filter({ hasText: "目標が未設定" })).toContainText("目標が設定されていません")
  })

  test("data states: 0, missing, loading, failure, stale, provisional and NaN; the layout keeps its height", async ({ page }) => {
    await page.goto("/#/metric-overview")
    const demo = page.getByTestId("mo-states")
    const metric = page.getByTestId("mo-state-metric")
    const value = metric.locator("[data-slot=metric-value]")
    const h0 = (await value.boundingBox())!.height
    const cases: [string, string | null, string][] = [
      ["実際の 0", "0円", "ready"],
      ["欠損", "データなし", "empty"],
      ["取得失敗", "取得できません", "unavailable"],
      ["算出できない値（NaN）", "算出できません", "invalid"],
      ["初回の読み込み", null, "loading"],
    ]
    for (const [label, text, state] of cases) {
      await demo.getByLabel(label, { exact: true }).check()
      await expect(value).toHaveAttribute("data-state", state)
      if (text) await expect(value).toHaveText(text)
      expect(Math.abs((await value.boundingBox())!.height - h0), label).toBeLessThanOrEqual(2)
    }
    await expect(metric).toHaveAttribute("aria-busy", "true")
    await expect(value.locator("[data-slot=skeleton]")).toHaveAttribute("aria-hidden", "true")
    await demo.getByLabel("古いデータ").check()
    await expect(metric.locator("[data-slot=metric-status]")).toContainText("14:32 の時点")
    await demo.getByLabel("未確定").check()
    await expect(metric.locator("[data-slot=metric-status]")).toContainText("未確定")
  })

  test("sparkline: hidden with too few points; missing values are not drawn as 0", async ({ page }) => {
    await page.goto("/#/metric-overview")
    await expect(page.getByTestId("mo-sparkline-few").locator("[data-slot=sparkline]")).toHaveCount(0)
    const gap = page.getByTestId("mo-sparkline").locator("[data-slot=sparkline]").first()
    await expect(gap).toHaveCount(1)
    // 欠損で線が途切れる（パスが 2 つの区間に分かれる：M が 2 回以上）
    const d = await gap.locator("path.recharts-curve").first().getAttribute("d")
    expect((d ?? "").match(/M/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  test("definition opens on click (not hover only), closes with Escape and returns focus", async ({ page, isMobile }) => {
    await page.goto("/#/metric-overview")
    const trigger = page.getByRole("button", { name: "MRRの定義" }).first()
    await trigger.click()
    const pop = page.locator("[data-slot=metric-definition]")
    await expect(pop).toBeVisible()
    await expect(pop).toContainText("正確な値")
    if (!isMobile) {
      await page.keyboard.press("Escape")
      await expect(pop).toBeHidden()
      await expect(trigger).toBeFocused()
    }
  })

  test("reduced motion stops the skeleton pulse", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/#/metric-overview")
    await page.getByTestId("mo-states").getByLabel("初回の読み込み", { exact: true }).check()
    const skeleton = page.getByTestId("mo-state-metric").locator("[data-slot=skeleton]")
    expect(await skeleton.evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
  })

  test("brand color override is used by the target progress", async ({ page, isMobile }) => {
    test.skip(isMobile, "プレビューの上部の切り替えはデスクトップで確かめる")
    await page.goto("/#/metric-overview")
    await page.getByRole("radio", { name: "青" }).check()
    const bar = page.getByTestId("mo-target").locator("[data-slot=progress-indicator]").first()
    await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(30, 64, 175)")
  })
})

// ------------------------------------------------------------------ Dashboard Layout
test.describe("Dashboard Layout", () => {
  test("independent regions: one failure keeps the other region; only that region is retried", async ({ page }) => {
    await page.goto("/#/dashboard-layout")
    const a = page.getByTestId("dl-region-a")
    const b = page.getByTestId("dl-region-b")
    await expect(a.locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "ready")
    await page.getByTestId("dl-fail-a").check()
    await page.getByTestId("dl-reload").click()
    await expect(a.getByRole("alert")).toContainText("契約企業数を取得できませんでした")
    await expect(b.locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "ready")
    await a.getByRole("button", { name: "再試行" }).click()
    await expect(a.getByRole("alert")).toHaveCount(0)
    await expect(a.locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "ready")
  })
})

// ------------------------------------------------------------------ Analysis Filters
test.describe("Analysis Filters", () => {
  test("presets apply immediately; a custom period is applied only as a whole, with the apply button", async ({ page }) => {
    await page.goto("/#/analysis-filters")
    const demo = page.getByTestId("af-period")
    const applied = demo.locator("[data-slot=analysis-period-applied]")
    const apply = demo.locator("[data-slot=analysis-period-apply]")
    await expect(applied).toContainText("2026/11/01〜2026/11/25（途中の期間）")
    await chooseOption(page, demo.locator("[data-slot=analysis-period-select]"), "先月")
    await expect(applied).toHaveText("2026/10/01〜2026/10/31")
    await chooseOption(page, demo.locator("[data-slot=analysis-period-select]"), "期間を指定")
    const from = demo.getByLabel("開始日")
    const to = demo.getByLabel("終了日")
    // 終了日だけを変えた時点（開始日より前）：適用しない
    await to.fill("2026/09/01")
    await to.press("Enter")
    await expect(applied).toContainText("適用中の期間：2026/10/01〜2026/10/31")
    await expect(applied).toContainText("まだ適用していません")
    await expect(apply).toBeDisabled()
    // 開始日も変えて完全な期間になっても、押すまでは適用しない（片方だけを変えた途中の期間で集計しない）
    await from.fill("2026/08/01")
    await from.press("Enter")
    await expect(applied).toContainText("適用中の期間：2026/10/01〜2026/10/31")
    await apply.click()
    await expect(applied).toHaveText("2026/08/01〜2026/09/01")
    await expect(demo.getByTestId("af-resolved")).toContainText("固定の期間")
    // 今日より後の日は選べない
    await to.fill("2026/12/31")
    await to.press("Enter")
    await expect(apply).toBeDisabled()
  })

  test("granularity: manual choice is kept when possible and adjusted with a notice otherwise", async ({ page }) => {
    await page.goto("/#/analysis-filters")
    const demo = page.getByTestId("af-period")
    const g = demo.locator("[data-slot=granularity-select]").getByRole("combobox")
    await chooseOption(page, g, "週別")
    await expect(demo.getByTestId("af-granularity")).toContainText("週別（手動で選択）")
    const total = await demo.getByTestId("af-total").textContent()
    await chooseOption(page, g, "日別")
    // 集計単位を変えても合計は変わらない
    await expect(demo.getByTestId("af-total")).toHaveText(total!)
    await chooseOption(page, g, "週別")
    await chooseOption(page, demo.locator("[data-slot=analysis-period-select]"), "今年度")
    await expect(demo.getByTestId("af-granularity")).toContainText("週別（手動で選択）")
    await expect(demo.getByTestId("af-notice")).toHaveText("")
    await chooseOption(page, demo.locator("[data-slot=analysis-period-select]"), "今日")
    await expect(demo.getByTestId("af-notice")).toHaveText("期間に合わせて、集計単位を「週別」から「時間別」に変えました")
    await expect(demo.getByTestId("af-notice")).toHaveAttribute("role", "status")
  })

  test("week start, time zones and half-open ranges", async ({ page }) => {
    await page.goto("/#/analysis-filters")
    const demo = page.getByTestId("af-period")
    await chooseOption(page, demo.locator("[data-slot=analysis-period-select]"), "先月")
    await expect(demo.getByTestId("af-instant")).toContainText("[2026-10-01T00:00:00+09:00, 2026-11-01T00:00:00+09:00)")
    // 10/1 は夏時間（−07:00）、11/1 の 0 時も夏時間（2026 年は 11/1 の 2 時に標準時へ戻る）
    await expect(demo.getByTestId("af-instant")).toContainText("[2026-10-01T00:00:00-07:00, 2026-11-01T00:00:00-07:00)")
    await chooseOption(page, demo.locator("[data-slot=granularity-select]").getByRole("combobox"), "週別")
    await expect(demo.locator("table")).toContainText("2026/09/28の週")
    await demo.getByLabel("日曜日").check()
    await expect(demo.locator("table")).toContainText("2026/09/27の週")
  })

  test("global and local conditions: local narrows, conflicts are not overwritten", async ({ page }) => {
    await page.goto("/#/analysis-filters")
    const d = page.getByTestId("af-scope")
    await expect(d.getByTestId("af-scope-effective")).toContainText("地域：関東 ・ プラン：スタンダード（全体の条件を引き継ぎ、さらに絞り込み）")
    await chooseOption(page, d.getByTestId("af-global-plan"), "ライト")
    await expect(d.getByTestId("af-scope-effective")).toContainText("全体の条件と重ならない")
    await chooseOption(page, d.getByTestId("af-local-plan"), "絞り込まない")
    await expect(d.getByTestId("af-scope-effective")).toContainText("地域：関東 ・ プラン：ライト")
  })
})

// ------------------------------------------------------------------ Period Comparison
test.describe("Period Comparison", () => {
  test("comparison ranges at month ends, leap days and year boundaries", async ({ page }) => {
    await page.goto("/#/period-comparison")
    const d = page.getByTestId("pc-ranges")
    await expect(d.getByTestId("pc-range-previous-month").first()).toContainText("2026/10/01〜2026/10/25")
    await expect(d.getByTestId("pc-range-previous-month").first()).toContainText("同じ経過日数")
    await d.getByLabel("2026/03/30（前月に同じ日がない）").check()
    await expect(d.getByTestId("pc-range-previous-month").first()).toContainText("2026/02/01〜2026/02/28")
    await expect(d.getByTestId("pc-range-previous-month").first()).toContainText("比較先は 2026/02/28 までの 28 日間です（分析の対象は 30 日間）")
    await d.getByLabel("2024/02/29（うるう日）").check()
    await expect(d.getByTestId("pc-range-previous-year").first()).toContainText("2023/02/01〜2023/02/28")
    await d.getByLabel("2026/01/10（年をまたぐ）").check()
    await expect(d.getByTestId("pc-range-previous-month").first()).toContainText("2025/12/01〜2025/12/10")
  })

  test("comparison availability: zero baseline, both zero, negative baseline, sign change, missing, failure, incomparable", async ({ page }) => {
    await page.goto("/#/period-comparison")
    const row = (name: string) => page.getByTestId("pc-cases").locator(`tr[data-case="${name}"]`)
    await expect(row("通常")).toContainText("+7.0%")
    await expect(row("基準値が 0").locator("td").nth(2)).toHaveText("算出できない")
    await expect(row("ともに 0")).toContainText("変化なし")
    await expect(row("基準値がマイナス").locator("td").nth(2)).toHaveText("算出できない")
    await expect(row("赤字から黒字")).toContainText("マイナスからプラスに転換")
    await expect(row("割合（4.0% → 3.2%）")).toContainText("−0.8pt")
    await expect(row("割合（4.0% → 3.2%）")).toContainText("−20.0%")
    await expect(row("比較のデータがない")).toContainText("比較データなし")
    await expect(row("比較のデータの取得に失敗")).toContainText("比較データを取得できません")
    await expect(row("集計の条件が異なる")).toContainText("比較できません（前年は解約の定義が異なる）")
  })

  test("aligned overlay keeps the original dates; diff chart has negative values from zero; legend and line types", async ({ page }) => {
    await page.goto("/#/period-comparison")
    const overlay = page.getByTestId("pc-overlay")
    await overlay.getByText("数値を表で見る").click()
    await expect(overlay.locator("table tbody tr").nth(24)).toContainText("2026/11/25")
    await expect(overlay.locator("table tbody tr").nth(24)).toContainText("2026/10/25")
    // 未来の日（26 日目以降）の今月は 0 ではなく「—」
    await expect(overlay.locator("table tbody tr").nth(26).locator("td").nth(2)).toHaveText("—")
    await expect(overlay.locator("[data-slot=chart-legend]")).toContainText("前月（10/1〜10/31）")
    // 前月の系列は破線（凡例の印も破線）
    await expect(overlay.locator("[data-slot=chart-legend] [data-slot=chart-indicator][data-kind=dashed]")).toHaveCount(1)
    const bars = page.getByTestId("pc-bars")
    await expect(bars.locator("[data-slot=chart-legend]")).toContainText("前月の同じ 25 日間")
  })

  test("actual, in-progress and forecast are distinguished; no forecast means no extrapolation", async ({ page }) => {
    await page.goto("/#/period-comparison")
    const d = page.getByTestId("pc-forecast")
    await expect(d.locator("[data-slot=chart-legend]")).toContainText("予測")
    await expect(d.locator("[data-slot=chart-legend]")).toContainText("途中経過")
    await expect(d).toContainText("予測の基準日")
    await d.getByLabel("ない").check()
    await expect(d.locator("[data-slot=chart-legend]")).not.toContainText("予測")
    await d.getByText("数値を表で見る").click()
    await expect(d.locator("table")).not.toContainText("予測")
    await expect(d.locator("table tbody tr").last()).toContainText("途中経過")
  })
})

// ------------------------------------------------------------------ Drill-down の資料
test.describe("Drill-down page", () => {
  test("conditions are carried; conflicts, series period and Other members", async ({ page }) => {
    await page.goto("/#/drill-down")
    const h = page.getByTestId("dd-hierarchy")
    await expect(h.getByTestId("dd-conditions")).toContainText("地域 関東 ・ プラン スタンダード")
    await h.getByLabel("1年契約").check()
    await h.getByLabel("月契約").check()
    await expect(h.getByTestId("dd-conditions")).toContainText("全体の条件（契約期間：1年契約）に含まれません")
    const s = page.getByTestId("dd-series")
    await expect(s.getByTestId("dd-series-period")).toContainText("2026/11/01〜2026/11/25")
    await s.getByLabel("前年同期（破線）").check()
    await expect(s.getByTestId("dd-series-period")).toContainText("2025/11/01〜2025/11/25")
    await expect(page.getByTestId("dd-other-members")).toContainText("地域：")
    expect((await page.getByTestId("dd-other-members").textContent())!.split("、").length).toBeGreaterThanOrEqual(2)
  })
})

// ------------------------------------------------------------------ 検証画面：事業の状況（Strategic）
test.describe("Strategic dashboard", () => {
  const expected = (filters: AnalysisFilters = defaultAnalysisFilters, id: "this-month" | "last-month" = "this-month") => {
    const p = resolvePeriod({ kind: "relative", id }, ctx)
    if (p.status !== "ready") throw new Error()
    return overviewData({ period: p, full: fullPeriodOf(p, ctx), comparison: comparisonRange({ period: p, mode: "previous-month" }), filters })
  }

  test("metrics come from the shared data; comparison and baseline are explicit", async ({ page }) => {
    await openApp(page, "page=business")
    const o = expected()
    await expect(page.getByTestId("metric-mrr").locator("[data-slot=metric-value]")).toHaveText(yen(o.mrr.current))
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=metric-value]")).toHaveText(yen(o.revenue.current))
    await expect(page.getByTestId("metric-accounts").locator("[data-slot=metric-value]")).toHaveText(`${o.accounts.current}社`)
    await expect(page.getByTestId("business-mrr-comparison")).toContainText(`2026/10/25時点 ${yen(o.mrr.baseline)}`)
    await expect(page.getByTestId("metric-revenue")).toContainText("途中経過")
    await expect(page.getByTestId("metric-revenue")).toContainText("期間の経過 25 / 30日")
    await expect(page.getByTestId("metric-churn").locator("[data-slot=comparison-value]")).toHaveAttribute("data-evaluation", /improved|worsened|unchanged/)
    await expect(page.getByTestId("metric-churn")).toContainText("pt")
    await expect(page.getByTestId("analysis-global-filters").locator("[data-slot=comparison-range]")).toContainText("2026/10/01〜2026/10/25（同じ経過日数）")
    // 時点の指標は、比較の基準の時点を示す
    await expect(page.getByTestId("business-accounts-comparison")).toContainText(`2026/10/25時点 ${o.accounts.baseline}社`)
    // 上限の目標は同じ単位で示し、途中の期間では期間の経過を併記する
    await expect(page.getByTestId("metric-churn").locator("[data-slot=metric-target]")).toContainText(/あと \d+\.\dpt|超過/)
    await expect(page.getByTestId("metric-churn").locator("[data-slot=metric-target]")).toContainText("期間の経過 25 / 30日")
    // 省略した値の正確な値は、押して開く定義で確かめられる
    await page.getByRole("button", { name: "売上の定義" }).click()
    await expect(page.locator("[data-slot=metric-definition-exact]")).toContainText(formatMetricValue(o.revenue.current, { unit: "円", notation: "standard" })!.text)
  })

  test("periods that do not match a calendar unit show no target, limit or elapsed time", async ({ page }) => {
    await openApp(page, "page=business&from=2026-09-01&to=2026-11-25&cmp=previous-year")
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "ready")
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=metric-target]")).toHaveCount(0)
    await expect(page.getByTestId("metric-churn").locator("[data-slot=metric-target]")).toHaveCount(0)
    // 前月の比較は分析の対象と重なるため選べない
    await page.getByTestId("analysis-global-filters").locator("[data-slot=comparison-select]").getByRole("combobox").click()
    await expect(page.getByRole("option", { name: "前月", exact: true })).toHaveAttribute("aria-disabled", "true")
    await page.keyboard.press("Escape")
  })

  test("a future end date is cut back to today and compared with the same number of days", async ({ page }) => {
    await openApp(page, "page=business&from=2026-11-01&to=2026-12-31&cmp=previous-year")
    const filters = page.getByTestId("analysis-global-filters")
    await expect(filters.locator("[data-slot=analysis-period-applied]")).toContainText("2026/11/01〜2026/11/25")
    await expect(filters.locator("[data-slot=analysis-period-applied]")).toContainText("2026/12/31までの指定のうち、今日まで")
    await expect(filters.locator("[data-slot=comparison-range]")).toContainText("2025/11/01〜2025/11/25")
    await expect(page.getByTestId("metric-mrr").locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "ready")
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=metric-target]")).toHaveCount(0)
  })

  test("changing the period keeps the chosen comparison and explains why it cannot be used", async ({ page }) => {
    await openApp(page, "page=business")
    const filters = page.getByTestId("analysis-global-filters")
    await chooseOption(page, filters.locator("[data-slot=analysis-period-select]"), "今四半期")
    // 前月の比較は分析の対象（10/1〜11/25）と重なる。前年同期などに勝手に変えず、理由と変更の方法を示す
    await expect(filters.locator("[data-slot=comparison-select]").getByRole("combobox")).toHaveText(/前月/)
    await expect(filters.locator("[data-slot=comparison-unavailable]")).toHaveText("比較期間が分析の対象の期間と重なるため、比較できません。比較の対象か期間を変えてください")
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=comparison-value]")).toHaveCount(0)
    expect(page.url()).toContain("cmp=previous-month")
    await chooseOption(page, filters.locator("[data-slot=comparison-select]").getByRole("combobox"), "前四半期")
    await expect(filters.locator("[data-slot=comparison-range]")).toContainText("2026/07/01〜2026/08/25")
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=comparison-value]")).toHaveCount(1)
  })

  test("moving to the retention analysis keeps the period and the region", async ({ page }) => {
    await openApp(page, "page=business")
    await chooseOption(page, page.getByTestId("analysis-region-filter"), "関東")
    await page.getByRole("link", { name: "解約の内訳を見る" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客維持の分析")
    await expect(page.getByTestId("analysis-region-filter")).toHaveText(/関東/)
    await expect(page.getByTestId("analysis-global-filters").locator("[data-slot=analysis-period-applied]")).toContainText("2026/11/01〜2026/11/25")
  })

  test("global filter and period change the results everywhere; URL keeps the conditions", async ({ page }) => {
    await openApp(page, "page=business")
    await chooseOption(page, page.getByTestId("analysis-region-filter"), "関東")
    const kanto = expected({ ...defaultAnalysisFilters, regions: ["kanto"] })
    await expect(page.getByTestId("metric-mrr").locator("[data-slot=metric-value]")).toHaveText(yen(kanto.mrr.current))
    await expect(page.getByTestId("business-overview")).toContainText("関東の契約だけを集計しています")
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=metric-target]")).toHaveCount(0)
    await expect(page.getByTestId("business-profit-table").locator("tbody tr")).toHaveCount(1)
    await chooseOption(page, page.getByTestId("analysis-global-filters").locator("[data-slot=analysis-period-select]"), "先月")
    const last = expected({ ...defaultAnalysisFilters, regions: ["kanto"] }, "last-month")
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=metric-value]")).toHaveText(yen(last.revenue.current))
    await expect(page.getByTestId("metric-revenue")).not.toContainText("途中経過")
    expect(page.url()).toContain("period=last-month")
    expect(page.url()).toContain("region=kanto")
    await page.reload()
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=metric-value]")).toHaveText(yen(last.revenue.current))
  })

  test("partial failure: the failed region shows an error and is retried alone", async ({ page }) => {
    await openApp(page, "page=business")
    await server(page, (s) => (s.alwaysFail.trend = true))
    await page.getByTestId("analysis-rebuild").click()
    const trend = page.getByTestId("business-trend")
    await expect(trend.getByRole("alert")).toContainText("MRR の推移を取得できませんでした")
    await expect(page.getByTestId("metric-mrr").locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "ready")
    await expect(page.getByTestId("business-bridge-chart")).toBeVisible()
    const before = await server(page, (s) => s.requests.filter((r) => r.kind === "overview").length)
    await server(page, (s) => (s.alwaysFail.trend = false))
    await trend.getByRole("button", { name: "再試行" }).click()
    await expect(page.getByTestId("business-trend-chart")).toBeVisible()
    expect(await server(page, (s) => s.requests.filter((r) => r.kind === "overview").length)).toBe(before)
  })

  test("while refreshing, the previous result keeps its contrast and says which conditions it belongs to", async ({ page }) => {
    await openApp(page, "page=business")
    await expect(page.getByTestId("metric-mrr").locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "ready")
    const h = (await page.getByTestId("business-overview").boundingBox())!.height
    await server(page, (s) => (s.latency.default = 1500))
    await chooseOption(page, page.getByTestId("analysis-region-filter"), "近畿")
    const region = page.getByTestId("business-overview")
    await expect(region).toHaveAttribute("aria-busy", "true")
    await expect(region).toHaveAttribute("data-status", "refreshing")
    // 内容を薄くしない（数値と文字のコントラストを保つ）。更新中と、表示中の結果の条件を文字で示す
    expect(await region.locator("[data-region-content]").evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    await expect(region.locator("[data-slot=analysis-region-stale]")).toContainText("更新中")
    await expect(region.locator("[data-slot=analysis-region-stale]")).toContainText("表示中：2026/11/01〜2026/11/25・絞り込みなしの結果（前の条件）")
    expect(Math.abs((await region.boundingBox())!.height - h)).toBeLessThan(80)
    await expect(region).toHaveAttribute("data-status", "ready", { timeout: 5000 })
  })

  test("forecast off: the chart does not extend into the future", async ({ page }) => {
    await openApp(page, "page=business")
    await expect(page.getByTestId("business-trend-chart").locator("[data-slot=chart-legend]")).toContainText("予測")
    await page.getByLabel("返さない").check()
    await page.getByTestId("analysis-rebuild").click()
    const chart = page.getByTestId("business-trend-chart")
    await expect(chart.locator("[data-slot=chart-legend]")).not.toContainText("予測")
    await expect(chart).toContainText("予測のデータはありません")
  })

  test("an unfair comparison shows the reason instead of a change; point-in-time metrics keep their comparison", async ({ page }) => {
    // 今月（25 日間）と、10 日間の任意の比較期間。期間の合計の指標は比べず、時点の指標（MRR）は同じ時点で比べる
    await openApp(page, "page=business&period=this-month&cmp=custom&cfrom=2025-11-01&cto=2025-11-10")
    const cmp = page.getByTestId("analysis-global-filters").locator("[data-slot=comparison-select]")
    await expect(cmp.locator("[data-slot=comparison-range]")).toContainText("2025/11/01〜2025/11/10")
    // 指定した期間は「同じ経過日数」ではない。方式の名前を付けず、長さが異なる理由を示す
    await expect(cmp.locator("[data-slot=comparison-range]")).not.toContainText("同じ経過日数")
    await expect(cmp.locator("[data-slot=comparison-unfair]")).toBeVisible()
    await expect(page.getByTestId("metric-revenue").locator("[data-slot=comparison-value]")).toContainText("比較できません")
    await expect(page.getByTestId("business-churn-comparison")).toContainText("比較できません")
    await expect(page.getByTestId("business-mrr-comparison")).not.toContainText("比較できません")
    await expect(page.getByTestId("business-bridge-table").locator("tbody tr").first()).toContainText("比較できません")
    // 任意の比較期間は URL に残る（再読み込みで同じ比較になる）
    expect(page.url()).toContain("cfrom=2025-11-01")
    expect(page.url()).toContain("cto=2025-11-10")
  })

  test("while refreshing after a comparison change, the comparison label belongs to the shown result", async ({ page }) => {
    await openApp(page, "page=business")
    await expect(page.getByTestId("business-overview")).toHaveAttribute("data-status", "ready")
    await expect(page.getByTestId("business-churn-comparison")).toContainText("前月比")
    await server(page, (s) => (s.latency.default = 1500))
    await chooseOption(page, page.getByTestId("analysis-global-filters").locator("[data-slot=comparison-select]").getByRole("combobox"), "前年同期")
    const region = page.getByTestId("business-overview")
    await expect(region).toHaveAttribute("data-status", "refreshing")
    // 表示中の値は前月との比較の結果。見出しも前月比のまま（新しい比較の見出しを古い値に付けない）
    await expect(page.getByTestId("business-churn-comparison")).toContainText("前月比")
    await expect(region).toHaveAttribute("data-status", "ready", { timeout: 5000 })
    await expect(page.getByTestId("business-churn-comparison")).toContainText("前年同期比")
  })

  test("the comparison table has its own comparison condition near the table", async ({ page }) => {
    await openApp(page, "page=business")
    const section = page.getByTestId("business-comparison")
    await expect(section.getByTestId("business-comparison-table").locator("thead")).toContainText("2025/11/01〜2025/11/25")
    await expect(section).toContainText("この表だけの条件")
    // ページ全体の比較（前月）は変わらない
    await expect(page.getByTestId("analysis-global-filters").locator("[data-slot=comparison-range]")).toContainText("2026/10/01〜2026/10/25")
    // 地域別の営業利益：マイナスからプラスへの転換を示す（前年同期の比較）
    await chooseOption(page, page.getByTestId("analysis-global-filters").locator("[data-slot=comparison-select]").getByRole("combobox"), "前年同期")
    await expect(page.getByTestId("business-profit-table").locator("tr", { hasText: "九州・沖縄" })).toContainText("マイナスからプラスに転換")
  })

  test("while the comparison table refreshes, its heading keeps the comparison period of the shown values", async ({ page }) => {
    await openApp(page, "page=business")
    const section = page.getByTestId("business-comparison")
    await expect(section).toHaveAttribute("data-status", "ready")
    await expect(section.getByTestId("business-comparison-table").locator("thead")).toContainText("2025/11/01〜2025/11/25")
    await server(page, (s) => (s.latency.default = 1500))
    await chooseOption(page, section.locator("[data-slot=comparison-select]").getByRole("combobox"), "直前の同じ長さの期間")
    await expect(section).toHaveAttribute("data-status", "refreshing")
    // 表示中の値は前年同期の結果。見出しも前年同期の期間のまま
    await expect(section.getByTestId("business-comparison-table").locator("thead")).toContainText("2025/11/01〜2025/11/25")
    await expect(section.locator("[data-slot=analysis-region-stale]")).toContainText("比較期間 2025/11/01〜2025/11/25の結果（前の条件）")
    await expect(section).toHaveAttribute("data-status", "ready", { timeout: 5000 })
    await expect(section.getByTestId("business-comparison-table").locator("thead")).toContainText("2026/10/07〜2026/10/31")
  })
})

// ------------------------------------------------------------------ 検証画面：顧客維持（Analytical）
test.describe("Analytical dashboard", () => {
  const year = { from: makeDate(2025, 11, 1)!, to: makeDate(2026, 10, 31)! }

  test("a fixed expected value: 104 companies churned in the last 12 months", async ({ page }) => {
    await openApp(page, "page=retention")
    await expect(page.getByTestId("retention-churned").locator("[data-slot=metric-value]")).toHaveText("104社")
    await expect(page.getByTestId("retention-list-count")).toHaveText("104社")
  })

  test("periods outside the data range are shown as no data, not 0", async ({ page }) => {
    await openApp(page, "page=retention&from=2022-06-01&to=2023-05-31&cmp=none")
    await expect(page.getByTestId("retention-out-of-range")).toBeVisible()
    await expect(page.getByTestId("retention-churned").locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "empty")
    await expect(page.getByTestId("retention-accounts").getByTestId("out-of-range")).toBeVisible()
    await expect(page.getByTestId("analysis-retention")).not.toContainText(/^0円$/)
  })

  test("an unfair comparison on the retention screen shows the reason instead of a change", async ({ page }) => {
    // 過去 12 か月（365 日）と、31 日間の任意の比較期間
    await openApp(page, "page=retention&cmp=custom&cfrom=2025-01-01&cto=2025-01-31")
    await expect(page.getByTestId("retention-summary")).toHaveAttribute("data-status", "ready")
    await expect(page.getByTestId("retention-rate-comparison")).toContainText("比較できません")
    await expect(page.getByTestId("retention-rate-comparison")).not.toContainText("%悪化")
    await expect(page.getByTestId("retention-churned").locator("[data-slot=comparison-value]")).toContainText("比較できません")
  })

  test("cross-filter targets: the list is filtered through its own target (accounts)", async ({ page }) => {
    await openApp(page, "page=retention")
    await page.getByTestId("by-plan").getByRole("button", { name: /^ライトで絞り込む/ }).click()
    const light = churnedAccountList({ range: year, filters: { ...defaultAnalysisFilters, plans: ["light"] }, role: "manager" }).total
    await expect(page.getByTestId("retention-list-count")).toHaveText(`${light}社`)
  })

  test("an hourly granularity in the URL is not used where the product does not offer it", async ({ page }) => {
    await openApp(page, "page=retention&from=2026-11-24&to=2026-11-25&cmp=none&g=hour")
    await expect(page.getByTestId("granularity-notice")).toContainText("指定された集計単位「時間別」は使えないため、「日別」で表示しています")
    await expect(page.getByTestId("retention-trend")).toHaveAttribute("data-status", "ready")
    const keys = await page.evaluate(() => window.__fdAnalysisServer!.requests.filter((r) => r.kind === "trend").map((r) => r.key))
    expect(keys.every((k) => !k.includes('"granularity":"hour"') && !k.endsWith(":hour"))).toBe(true)
  })

  test("comparison: overlapping options are disabled; a custom comparison period can be entered", async ({ page }) => {
    await openApp(page, "page=retention")
    const cmp = page.getByTestId("analysis-global-filters").locator("[data-slot=comparison-select]")
    await cmp.getByRole("combobox").click()
    await expect(page.getByRole("option", { name: "前月", exact: true })).toHaveAttribute("aria-disabled", "true")
    await page.getByRole("option", { name: "期間を指定", exact: true }).click()
    await expect(cmp.locator("[data-slot=comparison-range]")).toHaveText("比較期間を指定してください")
    await cmp.getByLabel("比較の開始日").fill("2024/05/01")
    await cmp.getByLabel("比較の開始日").press("Enter")
    await cmp.getByLabel("比較の終了日").fill("2025/04/30")
    await cmp.getByLabel("比較の終了日").press("Enter")
    await cmp.getByRole("button", { name: "この期間と比較" }).click()
    await expect(cmp.locator("[data-slot=comparison-range]")).toContainText("2024/05/01〜2025/04/30")
    await expect(page.getByTestId("retention-rate-comparison")).toContainText("比較期間比")
    // 先月なら前月と比べられる
    await chooseOption(page, page.getByTestId("analysis-global-filters").locator("[data-slot=analysis-period-select]"), "先月")
    await chooseOption(page, cmp.getByRole("combobox"), "前月")
    await expect(cmp.locator("[data-slot=comparison-range]")).toContainText("2026/09/01〜2026/09/30")
  })

  test("trend chart: ticks are exact steps and the in-progress bucket is a separate series", async ({ page }) => {
    await openApp(page, "page=retention&period=this-fiscal-year&cmp=previous-year")
    const chart = page.getByTestId("retention-trend-chart")
    await expect(chart.locator("[data-slot=chart-legend]")).toContainText("途中の区間")
    const tickLocator = chart.locator(".recharts-yAxis-tick-labels text")
    await expect.poll(() => tickLocator.count()).toBeGreaterThan(2)
    const ticks = await tickLocator.allTextContents()
    for (const t of ticks) expect(t).toMatch(/^\d+\.(0|5)%$/)
    await chart.getByText("数値を表で見る（区間ごとの企業へ進む）").click()
    await expect(chart.getByTestId("retention-trend-table").locator("tbody tr").last()).toContainText("途中の区間")
  })

  test("summary, list and breakdown agree; local reason filter does not change the summary", async ({ page }) => {
    await openApp(page, "page=retention")
    const s = retentionSummary({ range: year, base: null, filters: defaultAnalysisFilters })
    await expect(page.getByTestId("retention-churned").locator("[data-slot=metric-value]")).toHaveText(`${s.churned.current}社`)
    await expect(page.getByTestId("retention-list-count")).toHaveText(`${s.churned.current}社`)
    await expect(page.getByTestId("retention-rate").locator("[data-slot=comparison-value]")).toContainText("pt")
    await chooseOption(page, page.getByTestId("retention-reason"), "予算の削減")
    const n = churnedAccountList({ range: year, filters: defaultAnalysisFilters, role: "manager", reason: "予算の削減" }).total
    await expect(page.getByTestId("retention-list-count")).toHaveText(`${n}社`)
    await expect(page.getByTestId("retention-accounts")).toContainText("この一覧だけの条件")
    await expect(page.getByTestId("retention-churned").locator("[data-slot=metric-value]")).toHaveText(`${s.churned.current}社`)
  })

  test("cross-filtering: the source stays, affected regions say so, and the chip clears it", async ({ page }) => {
    await openApp(page, "page=retention")
    const plan = page.getByTestId("by-plan")
    const btn = plan.getByRole("button", { name: /^スタンダードで絞り込む/ })
    await btn.click()
    await expect(btn).toHaveAttribute("aria-pressed", "true")
    // 選択元の内訳は、自身の選択で消えない
    await expect(plan.getByRole("button")).toHaveCount(3)
    await expect(page.getByTestId("retention-by-term")).toContainText("プラン：スタンダード（プラン別の内訳で選択）")
    await expect(page.getByTestId("cross-filter-state")).toContainText("契約期間別の内訳と、解約した企業の一覧に適用")
    const n = churnedAccountList({ range: year, filters: { ...defaultAnalysisFilters, plans: ["standard"] }, role: "manager" }).total
    await expect(page.getByTestId("retention-list-count")).toHaveText(`${n}社`)
    // 指標は全体の値のまま
    const s = retentionSummary({ range: year, base: null, filters: defaultAnalysisFilters })
    await expect(page.getByTestId("retention-churned").locator("[data-slot=metric-value]")).toHaveText(`${s.churned.current}社`)
    await page.getByRole("button", { name: "選択中のプラン：スタンダードの条件を解除" }).click()
    await expect(btn).toHaveAttribute("aria-pressed", "false")
    await expect(page.getByTestId("retention-list-count")).toHaveText(`${s.churned.current}社`)
  })

  test("cross-filtering by keyboard", async ({ page, isMobile }) => {
    test.skip(isMobile, "ハードウェアキーボードの操作")
    await openApp(page, "page=retention")
    const btn = page.getByTestId("by-plan").getByRole("button", { name: /^ライトで絞り込む/ })
    await btn.focus()
    await page.keyboard.press("Enter")
    await expect(btn).toHaveAttribute("aria-pressed", "true")
    await page.keyboard.press("Space")
    await expect(btn).toHaveAttribute("aria-pressed", "false")
  })

  test("hidden conditions are applied together, cancel discards, and chips show only hidden conditions", async ({ page }) => {
    await openApp(page, "page=retention")
    await page.getByTestId("retention-more").click()
    const pop = page.getByTestId("retention-more-popover")
    await pop.getByRole("checkbox", { name: "月契約", exact: true }).click()
    await pop.getByRole("button", { name: "キャンセル" }).click()
    await expect(page.locator("[data-slot=data-table-applied-filters]")).toHaveCount(0)
    await page.getByTestId("retention-more").click()
    await expect(pop.getByRole("checkbox", { name: "月契約", exact: true })).not.toBeChecked()
    await pop.getByRole("checkbox", { name: "月契約", exact: true }).click()
    await pop.getByRole("button", { name: "適用する" }).click()
    await expect(page.getByRole("button", { name: "契約期間：月契約の条件を解除" })).toBeVisible()
    await expect(page.getByTestId("retention-more")).toHaveText("その他の条件（1）")
    // 期間と地域は見えているため、Chip で重ねて示さない
    await expect(page.locator("[data-slot=data-table-applied-filters]").first()).not.toContainText("地域")
    const n = churnedAccountList({ range: year, filters: { ...defaultAnalysisFilters, terms: ["monthly"] }, role: "manager" }).total
    await expect(page.getByTestId("retention-list-count")).toHaveText(`${n}社`)
  })

  test("granularity change is local to the chart and the period change adjusts it with a notice", async ({ page }) => {
    await openApp(page, "page=retention")
    await chooseOption(page, page.getByTestId("retention-trend").locator("[data-slot=granularity-select]").getByRole("combobox"), "四半期別")
    await expect(page.getByTestId("retention-trend-chart").locator("[data-slot=chart]")).toContainText("Q3")
    await chooseOption(page, page.getByTestId("analysis-global-filters").locator("[data-slot=analysis-period-select]"), "先月")
    await expect(page.getByTestId("granularity-notice")).toContainText("「四半期別」から「日別」に変えました")
  })

  test("drill-down from a breakdown and back restores conditions, selection, scroll and focus", async ({ page }) => {
    await openApp(page, "page=retention")
    await page.getByTestId("by-plan").getByRole("button", { name: /^ライトで絞り込む/ }).click()
    await expect(page.getByTestId("retention-list-count")).not.toBeEmpty()
    const link = page.getByTestId("by-plan").getByRole("link", { name: "スタンダードの内訳を見る" })
    await link.scrollIntoViewIfNeeded()
    const top = await main(page).evaluate((el) => el.scrollTop)
    await link.click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("スタンダードの解約")
    await expect(page.locator("[data-slot=breadcrumb-list]")).toContainText("顧客維持の分析")
    await expect(page.getByTestId("drill-conditions")).toContainText("期間：2025/11/01〜2026/10/31")
    await expect(page.getByTestId("drill-by-term")).toBeVisible()
    const n = churnedAccountList({ range: year, filters: { ...defaultAnalysisFilters, plans: ["standard"] }, role: "manager" }).total
    await expect(page.getByTestId("drill-count")).toHaveText(`${n}社`)
    await page.goBack()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客維持の分析")
    await expect(link).toBeFocused()
    expect(Math.abs((await main(page).evaluate((el) => el.scrollTop)) - top)).toBeLessThan(40)
    await expect(page.getByTestId("by-plan").getByRole("button", { name: /^ライトで絞り込む/ })).toHaveAttribute("aria-pressed", "true")
  })

  test("returning restores the list's sort, page and reason filter (also under StrictMode effects)", async ({ page }) => {
    await openApp(page, "page=retention")
    await chooseOption(page, page.getByTestId("retention-sort"), "月額の大きい順")
    await chooseOption(page, page.getByTestId("retention-reason"), "予算の削減")
    const count = page.getByTestId("retention-list-count")
    await expect(count).toHaveText(`${churnedAccountList({ range: year, filters: defaultAnalysisFilters, role: "manager", reason: "予算の削減" }).total}社`)
    // 予算の削減で解約した企業は 10 社（1 ページ）より多く、2 ページ目がある
    const pager = page.getByTestId("retention-page")
    await expect(pager).toHaveText(/^1 \/ [2-9] ページ$/)
    await page.getByRole("button", { name: /^次の 10 社$/ }).click()
    await expect(pager).toHaveText(/^2 \/ [2-9] ページ$/)
    const pageText = await pager.textContent()
    const link = page.getByTestId("by-plan").getByRole("link", { name: "スタンダードの内訳を見る" })
    await link.click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("スタンダードの解約")
    await page.goBack()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客維持の分析")
    await expect(page.getByTestId("retention-sort")).toContainText("月額の大きい順")
    await expect(page.getByTestId("retention-reason")).toContainText("予算の削減")
    await expect(pager).toHaveText(pageText!)
    await expect(link).toBeFocused()
  })

  test("drill-down hierarchy: plan → term → account; Breadcrumb goes back one level with the previous state", async ({ page }) => {
    await openApp(page, "page=retention")
    await page.getByTestId("by-plan").getByRole("link", { name: "ライトの内訳を見る" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ライトの解約")
    const termLink = page.getByTestId("drill-term").getByRole("link", { name: "月契約の企業を見る" })
    await termLink.click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ライト・月契約の解約")
    const first = page.getByTestId("drill-accounts").locator("tbody tr").first().getByRole("link")
    const name = (await first.textContent())!
    await first.click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name)
    await expect(page.locator("[data-slot=breadcrumb-list]")).toContainText("顧客維持の分析")
    await expect(page.locator("[data-slot=breadcrumb-list]")).toContainText("月契約")
    await page.locator("[data-slot=breadcrumb-list]").getByRole("link", { name: "月契約" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ライト・月契約の解約")
    await expect(page.getByTestId("drill-accounts").locator("tbody tr").first().getByRole("link")).toBeFocused()
  })

  test("drill-down from the comparison series carries the previous-year period", async ({ page }) => {
    await openApp(page, "page=retention")
    const t = page.getByTestId("retention-trend-chart")
    await t.getByText("数値を表で見る（区間ごとの企業へ進む）").click()
    await t.getByTestId("retention-trend-table").getByRole("link", { name: /^前年（2024年11月）/ }).click()
    await expect(page.getByTestId("drill-conditions")).toContainText("期間：2024/11/01〜2024/11/30")
  })

  test("detail sheet: neighbors follow the list order and fast switching never shows the previous company", async ({ page }) => {
    await openApp(page, "page=retention")
    const rows = page.getByTestId("retention-table").locator("tbody tr")
    await expect(rows.first()).toBeVisible()
    const names = await rows.locator("button[data-drill-origin]").allTextContents()
    await rows.first().getByRole("button").click()
    const sheet = page.getByTestId("account-sheet")
    await expect(sheet.locator("[data-slot=sheet-title]")).toHaveText(names[0])
    await expect(sheet).toContainText("1 / ")
    await server(page, (s) => (s.latency.account = 700))
    await sheet.getByRole("button", { name: "次の企業" }).click()
    // 取得中は前の企業の名前を表示しない
    await expect(sheet.locator("[data-slot=sheet-title]")).toHaveText("読み込み中")
    await sheet.getByRole("button", { name: "次の企業" }).click()
    await expect(sheet.locator("[data-slot=sheet-title]")).toHaveText(names[2], { timeout: 5000 })
    await expect(sheet).toContainText("3 / ")
  })

  test("detail permission: hidden rows are counted, not sent; forbidden detail has no retry", async ({ page }) => {
    await openApp(page, "page=retention")
    await page.getByLabel("担当者（一部の取引先を除く）").check()
    const list = churnedAccountList({ range: year, filters: defaultAnalysisFilters, role: "staff" })
    await expect(page.getByTestId("retention-hidden")).toContainText(`表示できるのは ${list.rows.length}社。${list.hidden}社は閲覧の権限がない取引先です`)
    await expect(page.getByTestId("retention-table").locator("tbody tr")).toHaveCount(Math.min(10, list.rows.length))
    // 件数を公開しない設定：件数を示さず、表示できる明細だけであることを示す
    await page.getByLabel("一覧では件数を示さない").check()
    await expect(page.getByTestId("retention-concealed")).toBeVisible()
    await expect(page.getByTestId("retention-list-count")).not.toContainText("閲覧の権限がない取引先です")
    await expect(page.getByTestId("retention-list-count")).toContainText(`表示できる ${list.rows.length}社`)
  })

  test("forbidden and missing account detail", async ({ page }) => {
    const manager = churnedAccountList({ range: year, filters: defaultAnalysisFilters, role: "manager" }).rows
    const staff = churnedAccountList({ range: year, filters: defaultAnalysisFilters, role: "staff" }).rows
    const restricted = manager.find((r) => !staff.some((x) => x.id === r.id))!
    await openApp(page, "page=business")
    await page.getByLabel("担当者（一部の取引先を除く）").check()
    await page.evaluate((id) => (window.location.hash = `#/analysis-app?page=account&id=${id}`), restricted.id)
    const detail = page.getByTestId("account-detail")
    await expect(detail.getByRole("alert")).toContainText("この企業の詳細を表示する権限がありません")
    await expect(detail.getByRole("button", { name: "再試行" })).toHaveCount(0)
    await page.evaluate(() => (window.location.hash = "#/analysis-app?page=account&id=A-9999"))
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("企業が見つかりません")
  })

  test("drill-down conditions that conflict with the global conditions are not overwritten", async ({ page }) => {
    await openApp(page, "page=retention-accounts&from=2025-11-01&to=2026-10-31&term=annual&dterm=monthly")
    await expect(page.getByTestId("drill-conflict")).toContainText("ページ全体の条件と重なる企業がありません")
    await expect(page.getByTestId("drill-accounts")).toHaveCount(0)
  })

  test("the business screen receives the analysis conditions", async ({ page }) => {
    await openApp(page, "page=retention")
    await page.getByTestId("by-plan").getByRole("button", { name: /^ライトで絞り込む/ }).click()
    await page.getByRole("link", { name: "この条件の解約した企業を、顧客の業務画面で開く" }).click()
    await expect(page.getByTestId("work-conditions")).toContainText("2025/11/01〜2026/10/31")
    await expect(page.getByTestId("work-conditions")).toContainText("ライト")
  })

  test("the business screen also receives the hidden conditions (contract term)", async ({ page }) => {
    await openApp(page, "page=retention&term=monthly")
    await page.getByRole("link", { name: "この条件の解約した企業を、顧客の業務画面で開く" }).click()
    expect(page.url()).toContain("term=monthly")
  })
})

// ------------------------------------------------------------------ スコープの境界と古い応答
test.describe("Scope boundaries and stale responses", () => {
  const mrrText = (ws: "hq" | "kyushu") => {
    const p = resolvePeriod({ kind: "relative", id: "this-month" }, ctx)
    if (p.status !== "ready") throw new Error()
    const f = ws === "kyushu" ? { ...defaultAnalysisFilters, regions: ["kyushu-okinawa" as const] } : defaultAnalysisFilters
    return yen(overviewData({ period: p, full: fullPeriodOf(p, ctx), comparison: comparisonRange({ period: p, mode: "previous-month" }), filters: f }).mrr.current)
  }

  test("workspace A→B→A with slow responses that ignore abort: only the latest scope's data is shown", async ({ page }) => {
    await openApp(page, "page=business")
    const mrr = page.getByTestId("metric-mrr").locator("[data-slot=metric-value]")
    await expect(mrr).toHaveText(mrrText("hq"))
    await server(page, (s) => Object.assign(s, { ignoreAbort: true, latency: { default: 300, overview: 900 } }))
    await page.getByLabel("九州支店").check()
    // スコープが変わった直後から、前のスコープの値を表示しない（再取得中として残さない）
    await expect(page.getByTestId("business-overview")).toHaveAttribute("data-status", "loading")
    await expect(mrr).toHaveAttribute("data-state", "loading")
    await page.getByLabel("本社（すべての地域）").check()
    await expect(mrr).toHaveText(mrrText("hq"), { timeout: 5000 })
    // 九州支店の要求の応答が後から届いても、表示は本社のまま
    await expect.poll(() => server(page, (s) => s.responses.filter((r) => r.kind === "overview" && r.scope.startsWith("kyushu")).length), { timeout: 5000 }).toBeGreaterThan(0)
    await page.waitForTimeout(300)
    await expect(mrr).toHaveText(mrrText("hq"))
    await page.getByLabel("九州支店").check()
    await expect(mrr).toHaveText(mrrText("kyushu"), { timeout: 5000 })
    await expect(page.getByTestId("analysis-region-filter")).toBeDisabled()
  })

  test("permission change discards the previous detail; outside-scope detail is not found", async ({ page }) => {
    const kanto = churnedAccountList({ range: { from: makeDate(2025, 11, 1)!, to: makeDate(2026, 10, 31)! }, filters: { ...defaultAnalysisFilters, regions: ["kanto"] }, role: "manager" }).rows[0]
    await openApp(page, `page=account&id=${kanto.id}`)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(kanto.name)
    // 取得していない間にスコープが変わった場合も、前のスコープの詳細を表示しない
    await page.getByLabel("九州支店").check()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("企業が見つかりません")
  })

  test("granularity changes with slow responses: an old response does not overwrite the latest", async ({ page }) => {
    await openApp(page, "page=retention")
    await server(page, (s) => Object.assign(s, { ignoreAbort: true, latency: { default: 100, trend: 900 } }))
    const g = page.getByTestId("retention-trend").locator("[data-slot=granularity-select]").getByRole("combobox")
    await chooseOption(page, g, "四半期別")
    await chooseOption(page, g, "月別")
    await expect(page.getByTestId("retention-trend")).toHaveAttribute("data-status", "ready", { timeout: 5000 })
    await expect.poll(() => server(page, (s) => s.responses.filter((r) => r.kind === "trend").length), { timeout: 5000 }).toBeGreaterThanOrEqual(3)
    await page.waitForTimeout(400)
    await expect(page.getByTestId("retention-trend-chart").locator("[data-slot=chart]")).not.toContainText("Q3")
    await expect(page.getByTestId("retention-trend-chart").locator("[data-slot=chart]")).toContainText("10月")
  })

  test("time zone change: the shown result says it belongs to the previous time zone while refreshing", async ({ page }) => {
    await openApp(page, "page=business")
    await expect(page.getByTestId("metric-mrr").locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "ready")
    await server(page, (s) => Object.assign(s, { latency: { default: 1200 } }))
    await page.getByLabel("America/New_York").check()
    const stale = page.getByTestId("business-overview").locator("[data-slot=analysis-region-stale]")
    await expect(stale).toContainText("Asia/Tokyo")
    const keys = await server(page, (s) => s.requests.filter((r) => r.kind === "overview").map((r) => r.key))
    expect(JSON.parse(keys.at(-1)!).timeZone).toBe("America/New_York")
    await expect(page.getByTestId("business-overview")).toHaveAttribute("data-status", "ready", { timeout: 5000 })
  })

  test("cross-filter changes with slow responses: the list matches the latest selection; clearing restores all", async ({ page }) => {
    const year = { from: makeDate(2025, 11, 1)!, to: makeDate(2026, 10, 31)! }
    await openApp(page, "page=retention")
    await server(page, (s) => Object.assign(s, { ignoreAbort: true, latency: { default: 100, accounts: 800 } }))
    const plan = page.getByTestId("by-plan")
    await plan.getByRole("button", { name: /^ライトで絞り込む/ }).click()
    await plan.getByRole("button", { name: /^エンタープライズで絞り込む/ }).click()
    const n = churnedAccountList({ range: year, filters: { ...defaultAnalysisFilters, plans: ["enterprise"] }, role: "manager" }).total
    await expect(page.getByTestId("retention-list-count")).toHaveText(`${n}社`, { timeout: 5000 })
    await page.waitForTimeout(900)
    await expect(page.getByTestId("retention-list-count")).toHaveText(`${n}社`)
    await page.getByRole("button", { name: "選択中のプラン：エンタープライズの条件を解除" }).click()
    await expect(page.getByTestId("retention-list-count")).toHaveText("104社", { timeout: 5000 })
  })

  test("returning restores the horizontal scroll of the table and falls back to a focusable element", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    await page.setViewportSize({ width: 480, height: 900 })
    await openApp(page, "page=retention")
    const container = page.getByTestId("retention-table").locator("[data-slot=table-container]")
    await container.scrollIntoViewIfNeeded()
    await container.evaluate((el) => (el.scrollLeft = 150))
    const left = await container.evaluate((el) => el.scrollLeft)
    expect(left).toBeGreaterThan(0)
    // 推移の数値の表（details の中）から進む。戻ると details は閉じているため、操作元のリンクは見えない
    const t = page.getByTestId("retention-trend-chart")
    await t.getByText("数値を表で見る（区間ごとの企業へ進む）").click()
    await t.getByTestId("retention-trend-table").getByRole("link").first().click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("解約した企業")
    await page.goBack()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客維持の分析")
    await expect.poll(() => container.evaluate((el) => el.scrollLeft)).toBe(left)
    // 見えない操作元ではなく、その領域の見出しにフォーカスが移る
    await expect(page.getByTestId("retention-trend").getByRole("heading", { name: "解約率の推移" })).toBeFocused()
  })
})

// ------------------------------------------------------------------ 時間別の区間と比較の方式（資料のページ）
test.describe("Hourly buckets and comparison bases on the documentation pages", () => {
  test("daylight saving time days show 23 and 25 real hourly buckets", async ({ page }) => {
    await page.goto("/#/analysis-filters")
    const d = page.getByTestId("af-timezone")
    await expect(d.getByTestId("af-tz-summary")).toContainText("25 時間、時間別の区間は 25 個")
    await expect(d.getByTestId("af-tz-table")).toContainText("1時（GMT-4）")
    await expect(d.getByTestId("af-tz-table")).toContainText("1時（GMT-5）")
    await d.getByLabel("ニューヨーク：夏時間の開始（23 時間）").check()
    await expect(d.getByTestId("af-tz-summary")).toContainText("23 時間、時間別の区間は 23 個")
    await expect(d.getByTestId("af-tz-table")).not.toContainText(/^2時$/)
    await d.getByLabel("ロード・ハウ島：30 分の夏時間（23.5 時間）").check()
    await expect(d.getByTestId("af-tz-table")).toContainText("30分")
  })

  test("comparison bases and bucket alignment show fairness and comparability", async ({ page }) => {
    await page.goto("/#/period-comparison")
    const b = page.getByTestId("pc-basis")
    await expect(b.locator("tr[data-basis=calendar]")).toContainText("公平ではない：途中の期間を、比較期間の全体と比べています")
    await expect(b.locator("tr[data-basis=elapsed-days]")).toContainText("2026/10/01〜2026/10/25")
    await b.getByLabel("2026/03/30（前月に同じ日がない）").check()
    await expect(b.locator("tr[data-basis=elapsed-days]")).toContainText("公平ではない：比較先は 28 日間しかありません")
    const a = page.getByTestId("pc-align")
    await a.getByLabel("順番").check()
    await expect(a.locator("tr[data-comparable=false]").first()).toContainText("区間の長さが異なります")
  })
})

// ------------------------------------------------------------------ 検証画面：処理の監視（Operational）
test.describe("Operational dashboard", () => {
  const tick = (page: Page, n = 1) => page.evaluate((k) => {
    for (let i = 0; i < k; i++) window.__fdOpsTicker!.advance()
  }, n)

  test("realtime updates keep focus and scroll; new alerts wait until shown", async ({ page }) => {
    await page.addInitScript(() => {
      const t = setInterval(() => {
        if (window.__fdAnalysisServer) {
          window.__fdAnalysisServer.realtime.paused = true
          clearInterval(t)
        }
      }, 0)
    })
    await page.goto("/#/analysis-app?page=operations")
    await page.evaluate(() => window.__fdOpsTicker!.reset())
    const alerts = page.getByTestId("ops-alerts")
    await expect(alerts.locator("li")).toHaveCount(2)
    const ack = alerts.locator("li").first().getByRole("button", { name: "対応済みにする" })
    await ack.focus()
    await main(page).evaluate((el) => (el.scrollTop = 120))
    const top = await main(page).evaluate((el) => el.scrollTop)
    await tick(page, 3)
    await expect(page.getByTestId("ops-updated")).toHaveText("14:30:15 時点")
    await expect(ack).toBeFocused()
    expect(await main(page).evaluate((el) => el.scrollTop)).toBe(top)
    await expect(page.getByTestId("ops-over-limit").locator("[data-slot=metric-value]")).toHaveText("1件")
    await expect(page.getByTestId("ops-over-limit")).toContainText("Webhook の通知")
    // Webhook の異常は文字でも示す
    await expect(page.getByTestId("ops-services").locator("tr[data-row-id=webhook]")).toContainText(/上限を超過|停止のおそれ/)
    await expect(alerts.locator("li")).toHaveCount(2)
    await expect(page.getByTestId("ops-show-new")).toHaveText("新しいアラートを表示（1件）")
    await page.getByTestId("ops-show-new").click()
    await expect(alerts.locator("li")).toHaveCount(3)
    await alerts.locator("li").first().getByRole("button", { name: "対応済みにする" }).click()
    await expect(alerts.locator("li")).toHaveCount(2)
    await expect(alerts.locator("li").first().getByRole("button", { name: "対応済みにする" })).toBeFocused()
  })

  test("a failed region is shown and retried alone; the rest keeps updating", async ({ page }) => {
    await page.goto("/#/analysis-app?page=operations")
    await server(page, (s) => Object.assign(s, { latency: { default: 40 } }))
    await page.getByTestId("fail-ops-transfers").check()
    await page.getByTestId("ops-refresh").click()
    const tr = page.getByTestId("ops-transfers")
    await expect(tr.getByRole("alert")).toContainText("口座振替の処理状況を取得できませんでした")
    await expect(page.getByTestId("ops-services").locator("tbody tr")).toHaveCount(4)
    await page.getByTestId("fail-ops-transfers").uncheck()
    await tr.getByRole("button", { name: "再試行" }).click()
    await expect(tr.getByRole("progressbar")).toBeVisible()
  })

  test("automatic updates can be stopped", async ({ page }) => {
    await page.goto("/#/analysis-app?page=operations")
    await server(page, (s) => (s.realtime.intervalMs = 200))
    await page.getByTestId("analysis-rebuild").click()
    const updated = page.getByTestId("ops-updated")
    const t0 = await updated.textContent()
    await expect.poll(() => updated.textContent(), { timeout: 3000 }).not.toBe(t0)
    await page.getByTestId("ops-auto").click()
    const t1 = await updated.textContent()
    await page.waitForTimeout(700)
    expect(await updated.textContent()).toBe(t1)
  })
})

// ------------------------------------------------------------------ モバイル
test.describe("Mobile", () => {
  test("dashboards stack in one column without horizontal page scroll; tables scroll inside their region", async ({ page, isMobile }) => {
    test.skip(!isMobile, "モバイルだけ")
    for (const p of ["business", "retention", "operations"]) {
      await openApp(page, `page=${p}`)
      await page.waitForTimeout(300)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await main(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    }
    await openApp(page, "page=business")
    const metrics = page.getByTestId("business-overview").locator("[data-slot=metric]")
    const a = (await metrics.nth(1).boundingBox())!
    const b = (await metrics.nth(2).boundingBox())!
    expect(b.y).toBeGreaterThan(a.y + a.height - 1)
  })

  test("the detail opens as a full-width sheet on mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "モバイルだけ")
    await openApp(page, "page=retention")
    await page.getByTestId("retention-table").locator("tbody tr").first().getByRole("button").click()
    const sheet = page.getByTestId("account-sheet")
    await expect(sheet).toBeVisible()
    const box = (await sheet.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1)
  })
})

// ------------------------------------------------------------------ WebKit
test.describe("WebKit basics", { tag: "@webkit" }, () => {
  test("dashboards render and cross-filtering works", async ({ page }) => {
    await openApp(page, "page=retention")
    const btn = page.getByTestId("by-plan").getByRole("button", { name: /^スタンダードで絞り込む/ })
    await btn.click()
    await expect(btn).toHaveAttribute("aria-pressed", "true")
    await openApp(page, "page=business")
    await expect(page.getByTestId("metric-mrr").locator("[data-slot=metric-value]")).toHaveAttribute("data-state", "ready")
    await expect(isDesktop(page) ? page.getByTestId("business-trend-chart") : page.getByTestId("business-trend")).toBeVisible()
  })
})
