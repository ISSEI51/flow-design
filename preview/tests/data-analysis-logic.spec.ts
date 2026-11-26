import { expect, test } from "@playwright/test"

import { makeDate, toDateString } from "../../registry/lib/date"
import {
  alignBuckets,
  availableGranularities,
  buildBuckets,
  comparisonRange,
  defaultGranularity,
  describeRange,
  fullPeriodOf,
  getPeriodElapsed,
  hoursInDay,
  reconcileGranularity,
  resolvePeriod,
  toHalfOpenRange,
  toInstantRange,
  zonedStartOfDay,
  type AnalysisPeriod,
  type PeriodContext,
} from "../../registry/patterns/analysis-period"
import { scopeFilters } from "../../registry/patterns/analysis-query"
import { compareValues, describeComparison, evaluateChange, formatDifference, getTargetProgress } from "../../registry/patterns/comparison"
import { drillPeriodFor, groupOther } from "../../registry/patterns/drill-down"
import { formatMetricValue } from "../../registry/patterns/metric-format"
import { churnByPlan, churnByTerm, churnedAccountList, churnTrend, mrrTrend, overviewData, retentionSummary } from "../src/data/data-analysis/analysis-model"
import * as S from "../src/data/data-analysis/subscriptions"

// Data Analysis の計算（registry/patterns の数値の表記、比較値、期間、条件の継承）と、模擬データの整合性の単体の検品。
// ブラウザを使わず Node.js で実行する。同じ処理を繰り返さないよう、desktop の project だけで実行する。

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "Node.js の単体の検品。desktop の project だけで実行する")
})

const ready = (value: number | null) => ({ status: "ready" as const, value })
const ctx = (y: number, m: number, d: number, extra: Partial<PeriodContext> = {}): PeriodContext => ({ today: makeDate(y, m, d)!, ...extra })
const resolved = (p: AnalysisPeriod, c: PeriodContext) => {
  const r = resolvePeriod(p, c)
  if (r.status !== "ready") throw new Error("invalid period")
  return r
}
const abs = (from: string, to: string): AnalysisPeriod => ({ kind: "absolute", from, to })

// ------------------------------------------------------------------ 数値の表記
test.describe("Metric Format", () => {
  test("Japanese compact notation, approximate marker and exact value", () => {
    const f = (v: number, unit: string) => formatMetricValue(v, { unit })!
    expect(f(36_800_000, "円")).toMatchObject({ text: "3,680万円", approximate: false })
    expect(f(441_600_000, "円")).toMatchObject({ text: "約4.42億円", exactText: "441,600,000円", approximate: true })
    expect(f(5_120_374, "件")).toMatchObject({ text: "約512万件", exactText: "5,120,374件" })
    expect(f(428, "社").text).toBe("428社")
    expect(f(0, "円").text).toBe("0円")
  })

  test("ratio values are 0-1; negative numbers use the minus sign; long units", () => {
    expect(formatMetricValue(0.032, { style: "ratio" })!.text).toBe("3.2%")
    expect(formatMetricValue(0.0325, { style: "ratio" })).toMatchObject({ text: "3.3%", exactText: "3.25%", approximate: true })
    expect(formatMetricValue(-1_200_000, { unit: "円" })!.text).toBe("−120万円")
    expect(formatMetricValue(12, { unit: " active companies", locale: "en-US" })!.text).toBe("12 active companies")
  })

  test("locale, currency and digits are set by the product", () => {
    expect(formatMetricValue(441_600_000, { style: "currency", currency: "USD", locale: "en-US" })).toMatchObject({ text: "~$442M", exactText: "$441,600,000" })
    expect(formatMetricValue(1234.5678, { maximumFractionDigits: 2 })!.text).toBe("1,234.57")
    expect(formatMetricValue(36_800_000, { unit: "円", notation: "standard" })!.text).toBe("36,800,000円")
  })

  test("tiny values are not shown as 0; floating point noise and unrounded values are not approximate", () => {
    expect(formatMetricValue(0.0004, { style: "ratio" })).toMatchObject({ text: "0.1%未満", approximate: true })
    expect(formatMetricValue(0.1 + 0.2, { style: "ratio" })).toMatchObject({ text: "30%", exactText: "30%", approximate: false })
    expect(formatMetricValue(12_345, { style: "currency", currency: "USD", locale: "en-US", notation: "standard" })).toMatchObject({ text: "$12,345", approximate: false })
  })

  test("NaN, Infinity, null and undefined are not formatted", () => {
    for (const v of [Number.NaN, Infinity, -Infinity, null, undefined]) expect(formatMetricValue(v as number)).toBeNull()
  })
})

// ------------------------------------------------------------------ 比較値
test.describe("Comparison", () => {
  test("difference, rate and percentage points are computed from unrounded values", () => {
    const r = compareValues({ current: ready(0.032), baseline: ready(0.04), kind: "ratio" })
    expect(r.status).toBe("ready")
    if (r.status !== "ready") return
    expect(r.points).toBeCloseTo(-0.8, 10)
    expect(r.rate).toBeCloseTo(-0.2, 10)
    expect(describeComparison(r, { kind: "ratio" }).text).toBe("−0.8pt")
    expect(describeComparison(r, { kind: "ratio", show: "rate" }).text).toBe("−20.0%")
    // 丸めると同じ表示の値（3.24% と 3.21%）でも、差は丸める前の値で求める
    const close = compareValues({ current: ready(0.0324), baseline: ready(0.0321), kind: "ratio" })
    expect(describeComparison(close, { kind: "ratio" }).text).toBe("+0.1pt未満")
  })

  test("boundary cases: zero, both zero, negative baseline, sign change, missing, failure, incomparable", () => {
    const d = (current: number | null, baseline: number | null, opts = {}) => describeComparison(compareValues({ current: ready(current), baseline: ready(baseline) }), { format: { unit: "件" }, ...opts })
    expect(d(428, 400).text).toBe("+7.0%")
    const zero = d(12, 0)
    expect(zero.text).toBe("+12件")
    expect(zero.detail).toContain("算出できません")
    expect(d(0, 0).text).toBe("変化なし")
    const neg = describeComparison(compareValues({ current: ready(-40_000), baseline: ready(-120_000) }), { format: { unit: "円" } })
    expect(neg.text).toBe("+80,000円")
    expect(neg.detail).toContain("マイナス")
    const flip = compareValues({ current: ready(800_000), baseline: ready(-1_200_000) })
    expect(flip.status === "ready" && flip.signChange).toBe("negative-to-positive")
    expect(describeComparison(flip, { format: { unit: "円" } }).detail).toBe("マイナスからプラスに転換")
    expect(d(18, null).text).toBe("比較データなし")
    expect(describeComparison(compareValues({ current: ready(18), baseline: { status: "unavailable" } })).text).toBe("比較データを取得できません")
    expect(describeComparison(compareValues({ current: ready(18), baseline: ready(15), incomparableReason: "定義が異なる" })).text).toBe("比較できません（定義が異なる）")
    expect(describeComparison(compareValues({ current: { status: "unavailable" }, baseline: ready(1) })).text).toBe("取得できません")
    expect(describeComparison(compareValues({ current: ready(Number.NaN), baseline: ready(1) })).available).toBe(false)
    // どの結果にも NaN と Infinity が含まれない
    for (const [c, b] of [[1, 0], [0, 0], [-1, -2], [5, Number.NaN], [Infinity, 1]] as const) {
      expect(describeComparison(compareValues({ current: ready(c), baseline: ready(b) })).text).not.toMatch(/NaN|Infinity|∞/)
    }
  })

  test("evaluation is defined by direction, not by the sign of the change", () => {
    expect(evaluateChange("increase", "increase")).toBe("improved")
    expect(evaluateChange("increase", "decrease")).toBe("worsened")
    expect(evaluateChange("decrease", "decrease")).toBe("improved")
    expect(evaluateChange("increase", "neutral")).toBe("neutral")
    expect(evaluateChange("unchanged", "decrease")).toBe("unchanged")
    expect(formatDifference(0, { unit: "件" })).toBe("±0件")
    expect(formatDifference(-951_200, { unit: "円", notation: "compact" })).toBe("約−95.1万円")
  })

  test("target progress keeps values over 100%, separates the bar range, and rejects invalid targets", () => {
    const over = getTargetProgress({ value: 112, target: 100 })
    expect(over).toMatchObject({ status: "ready", kind: "achievement", met: true, barValue: 100 })
    expect(over.status === "ready" && over.ratio).toBeCloseTo(1.12)
    const under = getTargetProgress({ value: 83, target: 97 })
    expect(under).toMatchObject({ status: "ready", met: false })
    expect(getTargetProgress({ value: 0.018, target: 0.015, direction: "decrease" })).toMatchObject({ status: "ready", kind: "limit", met: false })
    expect(getTargetProgress({ value: 3, target: 0 })).toEqual({ status: "invalid", reason: "target-zero" })
    expect(getTargetProgress({ value: -1, target: -5 })).toEqual({ status: "invalid", reason: "target-negative" })
    expect(getTargetProgress({ value: 5, target: null })).toEqual({ status: "invalid", reason: "target-missing" })
    expect(getTargetProgress({ value: null, target: 5 })).toEqual({ status: "invalid", reason: "value-missing" })
  })
})

// ------------------------------------------------------------------ 期間と比較期間
test.describe("Analysis Period", () => {
  test("relative periods resolve from the given today; absolute periods stay fixed", () => {
    const thisMonth: AnalysisPeriod = { kind: "relative", id: "this-month" }
    expect(describeRange(resolved(thisMonth, ctx(2026, 11, 25)).range)).toBe("2026/11/01〜2026/11/25")
    expect(describeRange(resolved(thisMonth, ctx(2026, 12, 3)).range)).toBe("2026/12/01〜2026/12/03")
    const fixed = abs("2026-11-01", "2026-11-25")
    expect(describeRange(resolved(fixed, ctx(2027, 1, 10)).range)).toBe("2026/11/01〜2026/11/25")
    expect(resolvePeriod(abs("2026-11-25", "2026-11-01"), ctx(2026, 11, 25))).toEqual({ status: "invalid", reason: "end-before-start" })
    expect(resolvePeriod(abs("2026-02-30", "2026-03-01"), ctx(2026, 11, 25))).toEqual({ status: "invalid", reason: "invalid-date" })
    expect(resolvePeriod(abs("", "2026-03-01"), ctx(2026, 11, 25))).toEqual({ status: "invalid", reason: "missing" })
  })

  test("units only for periods that match a calendar unit; future ends are cut back to today", () => {
    const c = ctx(2026, 11, 25, { fiscalYearStartMonth: 4 })
    const unitOf = (from: string, to: string) => resolved(abs(from, to), c).unit
    expect(unitOf("2026-10-01", "2026-10-31")).toBe("month")
    expect(unitOf("2026-11-01", "2026-11-25")).toBe("month")
    expect(unitOf("2026-10-01", "2026-11-25")).toBe("quarter")
    expect(unitOf("2026-09-01", "2026-11-25")).toBeNull()
    expect(unitOf("2026-11-05", "2026-11-20")).toBeNull()
    expect(unitOf("2026-04-01", "2026-11-25")).toBe("fiscal-year")
    expect(fullPeriodOf(resolved(abs("2026-09-01", "2026-11-25"), c), c)).toBeNull()
    expect(fullPeriodOf(resolved({ kind: "relative", id: "last-90-days" }, c), c)).toBeNull()
    const future = resolved(abs("2026-11-01", "2026-12-31"), c)
    expect(future).toMatchObject({ truncated: true, inProgress: true, unit: null })
    expect(describeRange(future.range)).toBe("2026/11/01〜2026/11/25")
    expect(toDateString(future.requestedTo!)).toBe("2026-12-31")
    // 切り詰めた期間の比較は、同じ日数をずらす（前年の 11/1〜12/31 の全体と比べない）
    const fy = comparisonRange({ period: future, mode: "previous-year" })
    expect(fy.status === "ready" && describeRange(fy.range)).toBe("2025/11/01〜2025/11/25")
    expect(resolvePeriod(abs("2026-12-01", "2026-12-31"), c)).toEqual({ status: "invalid", reason: "future" })
  })

  test("comparison periods that overlap the analysis period are rejected for every mode", () => {
    const c = ctx(2026, 11, 25)
    expect(comparisonRange({ period: resolved(abs("2026-09-01", "2026-11-25"), c), mode: "previous-month" })).toEqual({ status: "invalid", reason: "overlap" })
    expect(comparisonRange({ period: resolved({ kind: "relative", id: "this-year" }, c), mode: "previous-month" })).toEqual({ status: "invalid", reason: "overlap" })
    expect(comparisonRange({ period: resolved({ kind: "relative", id: "last-12-months" }, c), mode: "previous-quarter" })).toEqual({ status: "invalid", reason: "overlap" })
    expect(comparisonRange({ period: resolved({ kind: "relative", id: "last-12-months" }, c), mode: "previous-year" }).status).toBe("ready")
  })

  test("week start, fiscal year and quarters follow the context", () => {
    const monday = resolved({ kind: "relative", id: "this-week" }, ctx(2026, 11, 25, { weekStartsOn: 1 }))
    const sunday = resolved({ kind: "relative", id: "this-week" }, ctx(2026, 11, 25, { weekStartsOn: 0 }))
    expect(toDateString(monday.range.from)).toBe("2026-11-23")
    expect(toDateString(sunday.range.from)).toBe("2026-11-22")
    const fy = resolved({ kind: "relative", id: "this-fiscal-year" }, ctx(2026, 2, 10, { fiscalYearStartMonth: 4 }))
    expect(toDateString(fy.range.from)).toBe("2025-04-01")
    const q = resolved({ kind: "relative", id: "this-quarter" }, ctx(2026, 11, 25, { fiscalYearStartMonth: 4 }))
    expect(toDateString(q.range.from)).toBe("2026-10-01")
    expect(buildBuckets(resolved({ kind: "relative", id: "this-year" }, ctx(2026, 11, 25)).range, "quarter", ctx(2026, 11, 25, { fiscalYearStartMonth: 4 })).map((b) => b.fullLabel)).toEqual([
      "2025年度 Q4",
      "2026年度 Q1",
      "2026年度 Q2",
      "2026年度 Q3",
    ])
  })

  test("in-progress periods compare with the same elapsed part; whole months compare whole months", () => {
    const c = ctx(2026, 11, 25)
    const tm = resolved({ kind: "relative", id: "this-month" }, c)
    const pm = comparisonRange({ period: tm, mode: "previous-month" })
    expect(pm.status === "ready" && [describeRange(pm.range), pm.alignment]).toEqual(["2026/10/01〜2026/10/25", "same-elapsed"])
    const py = comparisonRange({ period: tm, mode: "previous-year" })
    expect(py.status === "ready" && describeRange(py.range)).toBe("2025/11/01〜2025/11/25")
    const oct = comparisonRange({ period: resolved(abs("2026-10-01", "2026-10-31"), c), mode: "previous-month" })
    expect(oct.status === "ready" && [describeRange(oct.range), oct.alignment, oct.days]).toEqual(["2026/09/01〜2026/09/30", "full", 30])
    expect(oct.status === "ready" && oct.note).toContain("31 日間と 30 日間")
    const prev = comparisonRange({ period: resolved(abs("2026-11-01", "2026-11-25"), c), mode: "previous-period" })
    expect(prev.status === "ready" && [describeRange(prev.range), prev.days]).toEqual(["2026/10/07〜2026/10/31", 25])
  })

  test("month ends, leap years and year boundaries", () => {
    const mar30 = resolved({ kind: "relative", id: "this-month" }, ctx(2026, 3, 30))
    const r = comparisonRange({ period: mar30, mode: "previous-month" })
    expect(r.status === "ready" && [describeRange(r.range), r.adjusted]).toEqual(["2026/02/01〜2026/02/28", true])
    const leapDay = comparisonRange({ period: resolved(abs("2024-02-29", "2024-02-29"), ctx(2024, 3, 1)), mode: "previous-year" })
    expect(leapDay.status === "ready" && [describeRange(leapDay.range), leapDay.adjusted]).toEqual(["2023/02/28", true])
    const febLeap = comparisonRange({ period: resolved(abs("2024-02-01", "2024-02-29"), ctx(2024, 3, 1)), mode: "previous-year" })
    expect(febLeap.status === "ready" && [describeRange(febLeap.range), febLeap.alignment]).toEqual(["2023/02/01〜2023/02/28", "full"])
    const cross = resolved(abs("2025-12-15", "2026-01-14"), ctx(2026, 11, 25))
    const cp = comparisonRange({ period: cross, mode: "previous-period" })
    expect(cp.status === "ready" && describeRange(cp.range)).toBe("2025/11/14〜2025/12/14")
    // 比較期間と分析の対象の日付が重ならず、欠けない（直前の期間の最終日は開始日の前日）
    expect(cp.status === "ready" && toDateString(cp.range.to)).toBe("2025-12-14")
    const overlap = comparisonRange({ period: cross, mode: "custom", custom: { from: makeDate(2026, 1, 1)!, to: makeDate(2026, 1, 31)! } })
    expect(overlap).toEqual({ status: "invalid", reason: "overlap" })
  })

  test("half-open ranges, time zones and daylight saving time", () => {
    const range = { from: makeDate(2026, 11, 1)!, to: makeDate(2026, 11, 30)! }
    expect(toHalfOpenRange(range)).toEqual({ start: "2026-11-01", end: "2026-12-01" })
    const tokyo = toInstantRange(range, "Asia/Tokyo")
    expect([tokyo.start, tokyo.end]).toEqual(["2026-11-01T00:00:00+09:00", "2026-12-01T00:00:00+09:00"])
    const la = toInstantRange(range, "America/Los_Angeles")
    // 11/1 は夏時間（−07:00）、12/1 は標準時（−08:00）
    expect([la.start, la.end]).toEqual(["2026-11-01T00:00:00-07:00", "2026-12-01T00:00:00-08:00"])
    expect(hoursInDay("2026-03-08", "America/Los_Angeles")).toBe(23)
    expect(hoursInDay("2026-11-01", "America/Los_Angeles")).toBe(25)
    expect(hoursInDay("2026-11-25", "Asia/Tokyo")).toBe(24)
    // 0 時が存在しない日（2018/11/4 のサンパウロ）は、その日の最初の時刻
    expect(toInstantRange({ from: makeDate(2018, 11, 4)!, to: makeDate(2018, 11, 4)! }, "America/Sao_Paulo").start).toBe("2018-11-04T01:00:00-02:00")
    // 連続した日の区間は重ならず、欠けない
    expect(zonedStartOfDay("2026-03-09", "America/Los_Angeles") - zonedStartOfDay("2026-03-08", "America/Los_Angeles")).toBe(23 * 3_600_000)
  })

  test("granularity: defaults by length, availability, manual choice kept or adjusted", () => {
    const c = ctx(2026, 11, 25)
    const day = { from: makeDate(2026, 11, 25)!, to: makeDate(2026, 11, 25)! }
    expect(defaultGranularity(day, c)).toBe("hour")
    expect(defaultGranularity(resolved({ kind: "relative", id: "this-month" }, c).range, c)).toBe("day")
    expect(defaultGranularity(resolved({ kind: "relative", id: "last-90-days" }, c).range, c)).toBe("week")
    expect(defaultGranularity(resolved({ kind: "relative", id: "last-12-months" }, c).range, c)).toBe("month")
    expect(availableGranularities(resolved({ kind: "relative", id: "this-month" }, c).range, c)).toEqual(["day", "week"])
    const year = resolved({ kind: "relative", id: "this-year" }, c).range
    expect(reconcileGranularity({ current: "week", manual: true, range: year, context: c })).toEqual({ granularity: "week", adjustment: null })
    expect(reconcileGranularity({ current: "month", manual: true, range: resolved({ kind: "relative", id: "this-week" }, c).range, context: c }).adjustment).toEqual({ from: "month", to: "day" })
    expect(reconcileGranularity({ current: "week", manual: false, range: year, context: c }).granularity).toBe("month")
  })

  test("buckets mark partial and in-progress intervals; elapsed time; alignment by position", () => {
    const c = ctx(2026, 11, 25)
    const tm = resolved({ kind: "relative", id: "this-month" }, c)
    const weeks = buildBuckets(tm.range, "week", c)
    expect(weeks[0]).toMatchObject({ partial: true, fullLabel: "2026/10/26の週" })
    expect(toDateString(weeks[0].from)).toBe("2026-11-01")
    expect(weeks.at(-1)).toMatchObject({ partial: true, inProgress: true })
    const full = fullPeriodOf(tm, c)!
    expect(getPeriodElapsed(full, c.today)).toMatchObject({ elapsedDays: 25, totalDays: 30 })
    const aligned = alignBuckets(buildBuckets(tm.range, "day", c), buildBuckets({ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 31)! }, "day", c))
    expect(aligned).toHaveLength(31)
    expect(aligned[24].current && toDateString(aligned[24].current.from)).toBe("2026-11-25")
    expect(aligned[30].current).toBeNull()
  })
})

// ------------------------------------------------------------------ 条件の継承と Drill-down
test.describe("Conditions and drill-down", () => {
  type F = { regions: string[]; plan: string | null }
  test("local conditions narrow the global conditions and conflicts are reported", () => {
    expect(scopeFilters<F>({ regions: [], plan: null }, { regions: ["kanto"] })).toEqual({ status: "ready", filters: { regions: ["kanto"], plan: null }, narrowed: ["regions"] })
    expect(scopeFilters<F>({ regions: ["kanto", "kinki"], plan: null }, { regions: ["kanto"] })).toMatchObject({ status: "ready", filters: { regions: ["kanto"] } })
    expect(scopeFilters<F>({ regions: ["kanto"], plan: null }, { regions: ["kinki"] })).toMatchObject({ status: "conflict", conflicts: ["regions"] })
    expect(scopeFilters<F>({ regions: [], plan: "light" }, { plan: "standard" })).toMatchObject({ status: "conflict", conflicts: ["plan"] })
    expect(scopeFilters<F>({ regions: [], plan: "light" }, { plan: "light" })).toMatchObject({ status: "ready", narrowed: [] })
  })

  test("drill-down from the comparison series carries that series' fixed period", () => {
    const c = ctx(2026, 11, 25)
    const period: AnalysisPeriod = { kind: "relative", id: "this-month" }
    const current = resolvePeriod(period, c)
    const comparison = current.status === "ready" ? comparisonRange({ period: current, mode: "previous-year" }) : ({ status: "none" } as const)
    expect(drillPeriodFor("current", { period, comparison, current })).toEqual(abs("2026-11-01", "2026-11-25"))
    expect(drillPeriodFor("baseline", { period, comparison, current })).toEqual(abs("2025-11-01", "2025-11-25"))
  })

  test('"Other" keeps the actual members and missing values are not summed as 0', () => {
    const items = [
      { k: "a", v: 10 },
      { k: "b", v: 8 },
      { k: "c", v: 3 },
      { k: "d", v: 2 },
      { k: "e", v: null },
    ]
    const { groups, skipped } = groupOther(items, { limit: 2, key: (i) => i.k, label: (i) => i.k, value: (i) => i.v })
    expect(groups.map((g) => g.key)).toEqual(["a", "b", "__other"])
    expect(groups[2]).toMatchObject({ kind: "other", value: 5, members: ["c", "d"] })
    expect(skipped.map((s) => s.k)).toEqual(["e"])
    // 1 件だけなら「その他」にしない
    expect(groupOther(items.slice(0, 3), { limit: 2, key: (i) => i.k, label: (i) => i.k, value: (i) => i.v }).groups.map((g) => g.kind)).toEqual(["item", "item", "item"])
  })
})

// ------------------------------------------------------------------ 模擬データの整合性
test.describe("Mock data consistency", () => {
  const f = S.defaultAnalysisFilters
  const year = { from: makeDate(2025, 11, 1)!, to: makeDate(2026, 10, 31)! }

  test("the MRR bridge adds up to the difference between the start and the end", () => {
    for (const range of [{ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 31)! }, year]) {
      const b = S.mrrBridge(range, f)
      expect(b.start! + b.added + b.expansion - b.contraction - b.churn).toBeCloseTo(b.end!, 6)
    }
  })

  test("breakdowns, lists and summaries agree with each other", () => {
    const s = retentionSummary({ range: year, base: null, filters: f })
    const list = churnedAccountList({ range: year, filters: f, role: "manager" })
    expect(list.total).toBe(s.churned.current)
    expect(churnByPlan({ range: year, base: null, filters: f }).reduce((n, r) => n + (r.churned ?? 0), 0)).toBe(s.churned.current)
    expect(churnByTerm({ range: year, base: null, filters: f }).reduce((n, r) => n + (r.churned ?? 0), 0)).toBe(s.churned.current)
    expect(churnTrend({ range: year, granularity: "month", filters: f }).reduce((n, r) => n + (r.churned ?? 0), 0)).toBe(s.churned.current)
    // 権限のない取引先はサーバーで除き、件数だけを返す
    const staff = churnedAccountList({ range: year, filters: f, role: "staff" })
    expect(staff.total).toBe(list.total)
    expect(staff.rows.length + staff.hidden).toBe(list.total)
    expect(staff.hidden).toBeGreaterThan(0)
  })

  test("periods outside the data range are null, not 0", () => {
    const before = { from: makeDate(2022, 6, 1)!, to: makeDate(2023, 5, 31)! }
    expect(S.revenueIn(before, f)).toBeNull()
    expect(S.churnedIn(before, f)).toBeNull()
    expect(S.churnMrrIn(before, f)).toBeNull()
    expect(S.churnRateIn(before, f)).toBeNull()
    expect(S.churnRateIn({ from: S.DATA_START, to: makeDate(2023, 1, 31)! }, f)).toBeNull()
    expect(churnedAccountList({ range: before, filters: f, role: "manager" })).toMatchObject({ outOfRange: true, total: null })
    expect(S.revenueIn({ from: makeDate(2026, 11, 1)!, to: makeDate(2026, 11, 30)! }, f)).toBeNull()
  })

  test("daily revenue does not depend on the number of days in the month", () => {
    // 契約が変わらなければ、30 日の月と 31 日の月の同じ 25 日間の売上は同じ（日割りは月額 × 12 ÷ 365）
    const a = S.accounts.find((x) => x.end === null && x.segments.length === 1 && x.start < "2025-01-01")!
    const one = { ...f, regions: [a.region] }
    const nov = S.revenueIn({ from: makeDate(2026, 11, 1)!, to: makeDate(2026, 11, 25)! }, one)!
    const oct = S.revenueIn({ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 25)! }, one)!
    const novMrr = S.mrrOn(makeDate(2026, 11, 25)!, one)!
    expect(nov).toBeGreaterThan(0)
    // 1 日の売上は MRR × 12 ÷ 365（月の日数で変わらない）
    expect(S.revenueIn({ from: makeDate(2026, 11, 25)!, to: makeDate(2026, 11, 25)! }, one)!).toBeCloseTo((novMrr * 12) / 365, 6)
    expect(oct).toBeGreaterThan(0)
  })

  test("a fixed expected value (computed once by hand from the generated records)", () => {
    // 過去12か月（2025/11/01〜2026/10/31）に解約した企業。生成の手順を変えた場合は、この値を確かめ直す
    expect(S.churnedIn(year, f)).toBe(104)
    expect(S.accounts.length).toBe(986)
  })

  test("granularity changes do not change totals; filters change the result", () => {
    const tm = { from: makeDate(2026, 11, 1)!, to: S.ANALYSIS_TODAY }
    const ctx2 = { today: S.ANALYSIS_TODAY }
    const sum = (g: "day" | "week") => buildBuckets(tm, g, ctx2).reduce((n, b) => n + (S.newAccountsIn(b, f) ?? 0), 0)
    expect(sum("day")).toBe(sum("week"))
    expect(sum("day")).toBe(S.newAccountsIn(tm, f))
    const kanto = S.revenueIn(tm, { ...f, regions: ["kanto"] })!
    const all = S.revenueIn(tm, f)!
    expect(kanto).toBeLessThan(all)
    expect(S.regions.reduce((n, r) => n + S.revenueIn(tm, { ...f, regions: [r] })!, 0)).toBeCloseTo(all, 4)
  })

  test("the overview, trend and comparison use the same values", () => {
    const c = { today: S.ANALYSIS_TODAY, fiscalYearStartMonth: 4 }
    const tm = resolved({ kind: "relative", id: "this-month" }, c)
    const o = overviewData({ period: tm, full: fullPeriodOf(tm, c), comparison: comparisonRange({ period: tm, mode: "previous-month" }), filters: f })
    const t = mrrTrend({ filters: f, withForecast: true })
    expect(t.rows.find((r) => r.inProgress)!.partial).toBe(o.mrr.current)
    expect(o.mrrSpark[11]).toBe(o.mrr.current)
    expect(o.mrr.baseline).toBe(S.mrrOn(makeDate(2026, 10, 25)!, f))
    // 未来とデータの範囲の外は 0 ではなく null
    expect(S.mrrOn(makeDate(2027, 1, 1)!, f)).toBeNull()
    expect(t.rows.filter((r) => r.isFuture).every((r) => r.confirmed === null && r.partial === null)).toBe(true)
    expect(mrrTrend({ filters: f, withForecast: false }).rows.every((r) => r.forecast === null)).toBe(true)
  })

  test("a region turns from loss to profit year over year (sign change case)", () => {
    const k = { ...f, regions: ["kyushu-okinawa" as const] }
    const now = S.operatingProfitIn({ from: makeDate(2026, 11, 1)!, to: S.ANALYSIS_TODAY }, k)!
    const before = S.operatingProfitIn({ from: makeDate(2025, 11, 1)!, to: makeDate(2025, 11, 25)! }, k)!
    expect(before).toBeLessThan(0)
    expect(now).toBeGreaterThan(0)
  })
})
