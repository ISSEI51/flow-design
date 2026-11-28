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
import { scopeFilters, useAnalysisQuery } from "../../registry/patterns/analysis-query"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { isValidTimeZone, localTimeAt } from "../../registry/patterns/analysis-time"
import { compareValues, describeComparison, evaluateChange, formatDifference, getTargetProgress } from "../../registry/patterns/comparison"
import { drillBucketPeriod, drillPeriodFor, drillRangeFor, groupOther } from "../../registry/patterns/drill-down"
import { formatMetricValue } from "../../registry/patterns/metric-format"
import { accountDetail, churnByPlan, churnByTerm, churnedAccountList, churnTrend, mrrTrend, overviewData, retentionSummary, withScope } from "../src/data/data-analysis/analysis-model"
import * as S from "../src/data/data-analysis/subscriptions"
import { paramsFromQuery, queryFromParams, singleRegionQuery } from "../src/pages/data-analysis/analysis-route"
import { describeConditions } from "../src/pages/data-analysis/analysis-session"

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
    // 目標値が 0 や負の場合は達成率を算出しない（達成の判定は別の検品）
    expect(getTargetProgress({ value: 3, target: 0 })).toMatchObject({ status: "ready", ratio: null, barValue: null })
    expect(getTargetProgress({ value: -1, target: -5 })).toMatchObject({ status: "ready", ratio: null })
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
    // 同じ経過日数（30 日）は 2 月にないため、2 月末で切り詰め、そのことを示す
    expect(r.status === "ready" && [describeRange(r.range), r.truncated, r.fair, r.basis]).toEqual(["2026/02/01〜2026/02/28", true, false, "elapsed-days"])
    expect(r.status === "ready" && r.note).toContain("28 日間")
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
    expect(defaultGranularity(day, { ...c, timeZone: "Asia/Tokyo" })).toBe("hour")
    // タイムゾーンがない場合、時間別は使えない
    expect(defaultGranularity(day, c)).toBe("day")
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

// ------------------------------------------------------------------ 時間別の区間とタイムゾーン
test.describe("Hourly buckets and time zones", () => {
  const hourly = (date: string, timeZone: string, extra: Partial<PeriodContext> = {}) => {
    const d = makeDate(...(date.split("-").map(Number) as [number, number, number]))!
    return buildBuckets({ from: d, to: d }, "hour", { today: makeDate(2030, 1, 1)!, timeZone, ...extra })
  }

  test("Asia/Tokyo and UTC: 24 one-hour buckets with real start and end times", () => {
    for (const [tz, offset] of [["Asia/Tokyo", "+09:00"], ["UTC", "+00:00"]] as const) {
      const b = hourly("2026-11-25", tz)
      expect(b).toHaveLength(24)
      expect(b[0].key).toBe(`2026-11-25T00:00:00${offset}`)
      expect(b.every((x) => x.end! - x.start! === 3_600_000 && !x.partial)).toBe(true)
      // 半開区間：前の区間の終わりと次の区間の始まりが同じ時刻（重なりも欠けもない）
      for (let i = 1; i < b.length; i++) expect(b[i].start).toBe(b[i - 1].end)
    }
  })

  test("America/New_York: 23 buckets on the spring change, 25 on the autumn change with repeated 1 a.m.", () => {
    const spring = hourly("2026-03-08", "America/New_York")
    expect(spring).toHaveLength(23)
    expect(spring.map((b) => b.hour)).not.toContain(2)
    const autumn = hourly("2026-11-01", "America/New_York")
    expect(autumn).toHaveLength(25)
    const ones = autumn.filter((b) => b.hour === 1)
    expect(ones.map((b) => b.offsetMinutes)).toEqual([-240, -300])
    expect(new Set(autumn.map((b) => b.key)).size).toBe(25)
    expect(ones.map((b) => b.label)).toEqual(["1時（GMT-4）", "1時（GMT-5）"])
    expect(autumn[autumn.length - 1].end! - autumn[0].start!).toBe(25 * 3_600_000)
  })

  test("Europe/Berlin: 23 and 25 buckets", () => {
    expect(hourly("2026-03-29", "Europe/Berlin")).toHaveLength(23)
    const autumn = hourly("2026-10-25", "Europe/Berlin")
    expect(autumn).toHaveLength(25)
    expect(autumn.filter((b) => b.hour === 2).map((b) => b.offsetMinutes)).toEqual([120, 60])
  })

  test("30- and 45-minute offsets: buckets start at local :00", () => {
    for (const [tz, offset] of [["Asia/Kolkata", "+05:30"], ["Asia/Kathmandu", "+05:45"], ["Australia/Eucla", "+08:45"]] as const) {
      const b = hourly("2026-11-25", tz)
      expect(b).toHaveLength(24)
      expect(b[3].key).toBe(`2026-11-25T03:00:00${offset}`)
    }
  })

  test("a 30-minute daylight saving change (Australia/Lord_Howe)", () => {
    // 2026/10/04 2:00 → 2:30（23.5 時間）。2 時の区間は 30 分
    const start = hourly("2026-10-04", "Australia/Lord_Howe")
    expect(hoursInDay("2026-10-04", "Australia/Lord_Howe")).toBe(23.5)
    const two = start.find((b) => b.hour === 2)!
    expect(two.durationMinutes).toBe(30)
    expect(two.partial).toBe(true)
    // 2026/04/05 2:00 → 1:30（24.5 時間）。1 時台が 2 回（60 分と 30 分）
    const end = hourly("2026-04-05", "Australia/Lord_Howe")
    expect(hoursInDay("2026-04-05", "Australia/Lord_Howe")).toBe(24.5)
    expect(end.filter((b) => b.hour === 1).map((b) => b.durationMinutes)).toEqual([60, 30])
  })

  test("year end and the status of today's hourly buckets without and with asOf", () => {
    const tz = "Asia/Tokyo"
    const b = buildBuckets({ from: makeDate(2026, 12, 31)!, to: makeDate(2027, 1, 1)! }, "hour", { today: makeDate(2027, 1, 1)!, timeZone: tz })
    expect(b).toHaveLength(48)
    expect(b[24].key).toBe("2027-01-01T00:00:00+09:00")
    expect(b[0].status).toBe("complete")
    // 集計済みの時刻がわからない今日の区間は「不明」。確定とみなさない
    expect(b[30].status).toBe("unknown")
    const asOf = Date.UTC(2027, 0, 1, 5, 30) // 14:30 JST
    const c = buildBuckets({ from: makeDate(2027, 1, 1)!, to: makeDate(2027, 1, 1)! }, "hour", { today: makeDate(2027, 1, 1)!, timeZone: tz, asOf })
    expect(c[13].status).toBe("complete")
    expect(c[14].status).toBe("in-progress")
    expect(c[15].status).toBe("future")
  })

  test("invalid time zones and nonexistent dates are rejected, not converted to wrong times", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false)
    expect(() => hourly("2026-11-25", "Mars/Olympus")).toThrow(RangeError)
    expect(() => toInstantRange({ from: makeDate(2026, 11, 1)!, to: makeDate(2026, 11, 1)! }, "Mars/Olympus")).toThrow(RangeError)
    // 時間別は、タイムゾーンがない場合は使えない
    expect(availableGranularities({ from: makeDate(2026, 11, 25)!, to: makeDate(2026, 11, 25)! }, { today: makeDate(2026, 11, 25)! })).not.toContain("hour")
    expect(availableGranularities({ from: makeDate(2026, 11, 25)!, to: makeDate(2026, 11, 25)! }, { today: makeDate(2026, 11, 25)!, timeZone: "Asia/Tokyo" })).toContain("hour")
    // Pacific/Apia は 2011/12/30 を飛ばした（日付変更線の移動）
    expect(() => zonedStartOfDay("2011-12-30", "Pacific/Apia")).toThrow(RangeError)
    expect(hoursInDay("2011-12-29", "Pacific/Apia")).toBe(24)
  })

  test("results do not depend on the time zone of the runtime", () => {
    const original = process.env.TZ
    const snapshot = () =>
      JSON.stringify([
        hourly("2026-11-01", "America/New_York").map((b) => [b.key, b.end]),
        toInstantRange({ from: makeDate(2026, 3, 29)!, to: makeDate(2026, 3, 29)! }, "Europe/Berlin"),
        localTimeAt(Date.UTC(2026, 10, 25, 0, 0), "Asia/Kathmandu"),
      ])
    process.env.TZ = "Asia/Tokyo"
    const base = snapshot()
    try {
      for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata"]) {
        process.env.TZ = tz
        expect(snapshot(), tz).toBe(base)
      }
    } finally {
      // undefined を代入すると "undefined" という文字列になるため、元がない場合は消す
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })
})

// ------------------------------------------------------------------ 比較の方式と区間の位置合わせ
test.describe("Comparison bases and bucket alignment", () => {
  const c = ctx(2026, 11, 25)
  const tm = () => resolved({ kind: "relative", id: "this-month" }, c)

  test("calendar, elapsed-days, weekday, business-days and point-in-time are different contracts", () => {
    const cal = comparisonRange({ period: tm(), mode: "previous-month", basis: "calendar" })
    // 途中の期間を暦の期間で比べると、前月の全体と比べる（公平ではない）
    expect(cal.status === "ready" && [describeRange(cal.range), cal.fair, cal.reason]).toEqual(["2026/10/01〜2026/10/31", false, "途中の期間を、比較期間の全体と比べています"])
    // 今日（11/25）の終わりまで集計済みの文脈。これがないと、今日を含む期間の比較は公平としない（下の検品）
    const done = { ...c, timeZone: "Asia/Tokyo", asOf: zonedStartOfDay("2026-11-26", "Asia/Tokyo") }
    const el = comparisonRange({ period: tm(), mode: "previous-month", basis: "elapsed-days", context: done })
    expect(el.status === "ready" && [describeRange(el.range), el.fair, el.days]).toEqual(["2026/10/01〜2026/10/25", true, 25])
    // context を省略すると、今日が確定しているとはみなさない（期間の inProgress で判断する）
    const noCtx = comparisonRange({ period: tm(), mode: "previous-month", basis: "elapsed-days" })
    expect(noCtx.status === "ready" && [describeRange(noCtx.range), noCtx.fair]).toEqual(["2026/10/01〜2026/10/25", false])
    const wd = comparisonRange({ period: tm(), mode: "previous-year", basis: "weekday" })
    // 前年同期で曜日をそろえる：364 日前（2025/11/02 は 2026/11/01 と同じ日曜日）
    expect(wd.status === "ready" && describeRange(wd.range)).toBe("2025/11/02〜2025/11/26")
    expect(wd.status === "ready" && wd.range.from.getDay()).toBe(tm().range.from.getDay())
    const weekdays = { isBusinessDay: (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 }
    const bd = comparisonRange({ period: tm(), mode: "previous-month", basis: "business-days", businessCalendar: weekdays, context: done })
    // 11/1〜25 の平日は 18 日。10 月の 18 営業日目は 10/26
    expect(bd.status === "ready" && [describeRange(bd.range), bd.fair]).toEqual(["2026/10/01〜2026/10/26", true])
    // 分析の対象に営業日がない（土日だけ）場合は、営業日の 1 日と比べない
    const weekend = resolved(abs("2026-11-21", "2026-11-22"), c)
    expect(comparisonRange({ period: weekend, mode: "previous-month", basis: "business-days", businessCalendar: weekdays, context: done })).toEqual({ status: "invalid", reason: "no-business-days" })
    expect(comparisonRange({ period: tm(), mode: "previous-month", basis: "business-days" })).toEqual({ status: "invalid", reason: "business-calendar-required" })
    const pit = comparisonRange({ period: tm(), mode: "previous-month", basis: "point-in-time" })
    expect(pit.status === "ready" && describeRange(pit.range)).toBe("2026/10/25")
    // 2/28 までしかない比較先：営業日が足りない場合は切り詰め、公平ではないと示す
    const mar = resolved({ kind: "relative", id: "this-month" }, ctx(2026, 3, 31))
    const bdShort = comparisonRange({ period: mar, mode: "previous-month", basis: "business-days", businessCalendar: { isBusinessDay: () => true } })
    expect(bdShort.status === "ready" && [describeRange(bdShort.range), bdShort.truncated, bdShort.fair]).toEqual(["2026/02/01〜2026/02/28", true, false])
  })

  test("elapsed-time needs asOf and a time zone, and uses real instants", () => {
    expect(comparisonRange({ period: tm(), mode: "previous-month", basis: "elapsed-time", context: c })).toEqual({ status: "invalid", reason: "as-of-required" })
    const asOf = Date.UTC(2026, 10, 25, 5, 30) // 11/25 14:30 JST
    const et = comparisonRange({ period: tm(), mode: "previous-month", basis: "elapsed-time", context: { ...c, timeZone: "Asia/Tokyo", asOf } })
    expect(et.status === "ready" && et.note).toBe("2026-10-01T00:00:00+09:00 から 2026-10-25T14:30:00+09:00 まで（同じ経過時間）")
    expect(et.status === "ready" && describeRange(et.range)).toBe("2026/10/01〜2026/10/25")
    // 夏時間の切り替えをまたぐと、同じ経過時間の終わりは壁時計の時刻とずれる（New York：11/1 に 1 時間戻る）
    const ny = resolved({ kind: "relative", id: "this-month" }, ctx(2026, 12, 2))
    const nyAsOf = Date.parse("2026-12-02T12:00:00-05:00")
    const nyEt = comparisonRange({ period: ny, mode: "previous-month", basis: "elapsed-time", context: { ...ctx(2026, 12, 2), timeZone: "America/New_York", asOf: nyAsOf } })
    expect(nyEt.status === "ready" && nyEt.note).toBe("2026-11-01T00:00:00-04:00 から 2026-11-02T11:00:00-05:00 まで（同じ経過時間）")
  })

  test("fiscal years starting in April, week starts, today's partial data", () => {
    const fy = resolved({ kind: "relative", id: "this-fiscal-year" }, ctx(2026, 11, 25, { fiscalYearStartMonth: 4 }))
    const py = comparisonRange({ period: fy, mode: "previous-year" })
    expect(py.status === "ready" && [describeRange(py.range), py.basis]).toEqual(["2025/04/01〜2025/11/25", "elapsed-days"])
    const q = resolved({ kind: "relative", id: "this-quarter" }, ctx(2026, 11, 25, { fiscalYearStartMonth: 4 }))
    const pq = comparisonRange({ period: q, mode: "previous-quarter" })
    expect(pq.status === "ready" && describeRange(pq.range)).toBe("2026/07/01〜2026/08/25")
    // 会計年度の途中の期間の経過。今日のデータは確定していないため、確定した日数は 1 日少ない
    const e = getPeriodElapsed(fullPeriodOf(fy, ctx(2026, 11, 25, { fiscalYearStartMonth: 4 }))!, makeDate(2026, 11, 25)!)
    expect(e).toMatchObject({ elapsedDays: 239, completeDays: 238, totalDays: 365, todayInProgress: true })
    expect(getPeriodElapsed(fullPeriodOf(fy, ctx(2026, 11, 25, { fiscalYearStartMonth: 4 }))!, makeDate(2026, 11, 25)!, { todayComplete: true }).completeDays).toBe(239)
    for (const weekStartsOn of [0, 1, 6] as const) {
      const w = resolved({ kind: "relative", id: "this-week" }, ctx(2026, 11, 25, { weekStartsOn }))
      expect(w.range.from.getDay()).toBe(weekStartsOn)
    }
  })

  test("buckets: aligning by position is not the same as being comparable", () => {
    const cur = buildBuckets(tm().range, "week", c)
    const prev = buildBuckets({ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 25)! }, "week", c)
    const byPos = alignBuckets(cur, prev, { by: "position" })
    // 1 番目どうし：11/1（1 日）と 10/1〜10/4（4 日）。順番は同じでも長さが異なる
    expect(byPos[0]).toMatchObject({ comparable: false, reason: "区間の長さが異なります" })
    // 最後の区間は途中
    expect(byPos.find((r) => r.current?.inProgress)).toMatchObject({ comparable: false })
    // 対応する比較期間の区間がある途中の区間（日別の今日）は「途中」の理由で比べない
    const today = alignBuckets(buildBuckets(tm().range, "day", c), buildBuckets({ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 25)! }, "day", c), { by: "elapsed" })
    expect(today.at(-1)).toMatchObject({ comparable: false, reason: "集計の途中の区間です" })
    // 日別の同経過期間は、経過でも順番でも 1 日どうしで比べられる
    const d = alignBuckets(buildBuckets({ from: makeDate(2026, 11, 1)!, to: makeDate(2026, 11, 24)! }, "day", c), buildBuckets({ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 24)! }, "day", c), { by: "elapsed" })
    expect(d.every((r) => r.comparable)).toBe(true)
    // 暦の月の全体どうし（31 日と 30 日）は、長さの違いを許容して比べてよい
    const months = alignBuckets(
      buildBuckets({ from: makeDate(2025, 9, 1)!, to: makeDate(2025, 10, 31)! }, "month", c),
      buildBuckets({ from: makeDate(2024, 9, 1)!, to: makeDate(2024, 10, 31)! }, "month", c),
      { by: "calendar", allowDifferentLength: true }
    )
    // 暦の位置のキーは、最初の区間からの月の数（年をまたいでも重複しない）
    expect(months.map((r) => [r.key, r.comparable])).toEqual([["m0", true], ["m1", true]])
    // 比較期間の区間がない（Bucket の数が異なる）
    const short = alignBuckets(buildBuckets({ from: makeDate(2026, 3, 1)!, to: makeDate(2026, 3, 31)! }, "day", ctx(2026, 4, 30)), buildBuckets({ from: makeDate(2026, 2, 1)!, to: makeDate(2026, 2, 28)! }, "day", ctx(2026, 4, 30)), { by: "calendar" })
    expect(short.filter((r) => !r.comparable).map((r) => r.reason)).toEqual(["比較期間に対応する区間がありません", "比較期間に対応する区間がありません", "比較期間に対応する区間がありません"])
    // 夏時間の終了日の時間別：25 区間と 24 区間。暦の位置（時と時差）でそろえると、重複した 1 時は片方だけ対応する
    const nyc = { today: makeDate(2030, 1, 1)!, timeZone: "America/New_York" }
    const h = alignBuckets(buildBuckets({ from: makeDate(2026, 11, 1)!, to: makeDate(2026, 11, 1)! }, "hour", nyc), buildBuckets({ from: makeDate(2026, 10, 31)!, to: makeDate(2026, 10, 31)! }, "hour", nyc), { by: "calendar" })
    // 2 回目の 1 時（GMT-5）だけが、対応する区間のない区間になる
    expect(h).toHaveLength(25)
    expect(h.filter((r) => !r.comparable).map((r) => r.current?.label)).toEqual(["1時（GMT-5）"])
  })
})

// ------------------------------------------------------------------ 数値の境界と目標
test.describe("Numeric boundaries and targets", () => {
  test("multi-month alignment across a year end and a leap February", () => {
    const c = ctx(2026, 11, 25)
    // 2024/12〜2025/03 と、前年の 2023/12〜2024/03。2024 年 2 月は 29 日、2025 年 2 月は 28 日
    const cur = buildBuckets({ from: makeDate(2024, 12, 1)!, to: makeDate(2025, 3, 31)! }, "month", c)
    const prev = buildBuckets({ from: makeDate(2023, 12, 1)!, to: makeDate(2024, 3, 31)! }, "month", c)
    const strict = alignBuckets(cur, prev, { by: "calendar" })
    expect(strict.map((r) => [r.key, r.current?.from.getMonth(), r.baseline?.from.getMonth()])).toEqual([
      ["m0", 11, 11],
      ["m1", 0, 0],
      ["m2", 1, 1],
      ["m3", 2, 2],
    ])
    // 長さの違いを許容しない場合は、2 月だけが比べられない（0 で埋めない、率を出さない）
    expect(strict.filter((r) => !r.comparable).map((r) => [r.key, r.reason])).toEqual([["m2", "区間の長さが異なります"]])
    expect(alignBuckets(cur, prev, { by: "calendar", allowDifferentLength: true }).every((r) => r.comparable)).toBe(true)
    // 経過でそろえる場合も、月の全体どうしを順番に対応させる
    expect(alignBuckets(cur, prev, { by: "elapsed", allowDifferentLength: true }).map((r) => r.key)).toEqual(["u0", "u1", "u2", "u3"])
    // 週の始まり（日曜・土曜）、期の途中から始まる四半期と会計年度でも、暦の位置のキーは重複しない
    for (const weekStartsOn of [0, 1, 6] as const) {
      const wc = ctx(2026, 11, 25, { weekStartsOn })
      const w = alignBuckets(buildBuckets({ from: makeDate(2026, 11, 4)!, to: makeDate(2026, 11, 25)! }, "week", wc), buildBuckets({ from: makeDate(2026, 10, 4)!, to: makeDate(2026, 10, 25)! }, "week", wc), { by: "calendar" })
      expect(new Set(w.map((r) => r.key)).size).toBe(w.length)
    }
    const q = buildBuckets({ from: makeDate(2025, 2, 15)!, to: makeDate(2025, 12, 31)! }, "quarter", c)
    expect(alignBuckets(q, q, { by: "calendar" }).map((r) => r.key)).toEqual(["q0", "q1", "q2", "q3"])
    const fyc = ctx(2026, 11, 25, { fiscalYearStartMonth: 4 })
    const fy = buildBuckets({ from: makeDate(2024, 2, 15)!, to: makeDate(2026, 3, 31)! }, "year", fyc)
    expect(alignBuckets(fy, fy, { by: "calendar" }).map((r) => r.key)).toEqual(["y0", "y1", "y2"])
    const fq = buildBuckets({ from: makeDate(2025, 5, 15)!, to: makeDate(2025, 12, 31)! }, "quarter", fyc)
    expect(alignBuckets(fq, fq, { by: "calendar" }).map((r) => r.key)).toEqual(["q0", "q1", "q2"])
    // 13 か月の期間でも、同じ月（1 月）が 2 回あるキーは重複しない
    const long = buildBuckets({ from: makeDate(2024, 1, 1)!, to: makeDate(2025, 1, 31)! }, "month", c)
    expect(new Set(alignBuckets(long, long, { by: "calendar" }).map((r) => r.key)).size).toBe(13)
  })

  test("today's incomplete data makes a comparison unfair unless the product passes asOf", () => {
    const c = ctx(2026, 11, 25)
    const tm = () => resolved({ kind: "relative", id: "this-month" }, c)
    const tokyo = { ...c, timeZone: "Asia/Tokyo" }
    const without = comparisonRange({ period: tm(), mode: "previous-month", basis: "elapsed-days", context: tokyo })
    expect(without.status === "ready" && [without.fair, without.reason?.startsWith("今日のデータは集計の途中")]).toEqual([false, true])
    // 集計済みの時刻が今日の終わり（翌日 0 時）以降なら、今日も確定している
    const done = comparisonRange({ period: tm(), mode: "previous-month", basis: "elapsed-days", context: { ...tokyo, asOf: zonedStartOfDay("2026-11-26", "Asia/Tokyo") } })
    expect(done.status === "ready" && [done.fair, done.reason]).toEqual([true, null])
    // 今日の途中（14:30）までの集計
    const partial = comparisonRange({ period: tm(), mode: "previous-month", basis: "elapsed-days", context: { ...tokyo, asOf: Date.UTC(2026, 10, 25, 5, 30) } })
    expect(partial.status === "ready" && partial.fair).toBe(false)
    // 今日を含まない期間は影響を受けない
    const past = comparisonRange({ period: resolved(abs("2026-10-01", "2026-10-31"), c), mode: "previous-month", context: tokyo })
    expect(past.status === "ready" && past.fair).toBe(true)
    // 昨日（11/24）だけの期間で、集計済みの時刻が 11/24 の 12:00：今日を含まなくても、対象の終わりまで集計していない
    const yesterday = resolved(abs("2026-11-24", "2026-11-24"), c)
    const midYesterday = comparisonRange({ period: yesterday, mode: "previous-period", context: { ...tokyo, asOf: Date.parse("2026-11-24T12:00:00+09:00") } })
    expect(midYesterday.status === "ready" && [midYesterday.fair, midYesterday.reason]).toEqual([false, "分析の対象の終わりまで集計が済んでいないため、比較期間の確定した値と公平に比べられません"])
    // 時間別の区間の判定と一致する
    expect(buildBuckets(yesterday.range, "day", { ...tokyo, asOf: Date.parse("2026-11-24T12:00:00+09:00") })[0].status).toBe("in-progress")
    // 今日より後の日を含む任意の比較期間
    const lm = resolved({ kind: "relative", id: "last-month" }, c)
    expect(comparisonRange({ period: lm, mode: "custom", custom: { from: makeDate(2026, 12, 1)!, to: makeDate(2026, 12, 31)! }, context: c })).toEqual({ status: "invalid", reason: "future" })
    // 未知の比較の種類（型の外から来た値）
    expect(comparisonRange({ period: lm, mode: "bogus" as never, context: c })).toEqual({ status: "invalid", reason: "unknown-mode" })
    // 任意の期間との比較で、指定したタイムゾーンが不正
    expect(comparisonRange({ period: tm(), mode: "previous-month", basis: "elapsed-time", context: { ...c, timeZone: "Mars/Base", asOf: 1 } })).toEqual({ status: "invalid", reason: "invalid-time-zone" })
  })

  test("results of finite inputs are checked for finiteness; tolerance; meaningful small changes are kept", () => {
    expect(compareValues({ current: ready(Number.MAX_VALUE), baseline: ready(-Number.MAX_VALUE) })).toMatchObject({ status: "incomparable" })
    const tiny = compareValues({ current: ready(1e308), baseline: ready(1e-10) })
    expect(tiny).toMatchObject({ status: "ready", rate: null, rateUnavailable: "not-finite" })
    expect(describeComparison(tiny, { format: { unit: "円" } }).detail).toBe("値の大きさのため増減率は算出できません")
    // 浮動小数点の誤差は変化なし、意味のある小さな差は変化として残す
    expect(compareValues({ current: ready(0.1 + 0.2), baseline: ready(0.3) })).toMatchObject({ change: "unchanged" })
    expect(compareValues({ current: ready(0.300001), baseline: ready(0.3) })).toMatchObject({ change: "increase" })
    // 製品が指標の精度を指定する
    expect(compareValues({ current: ready(100.4), baseline: ready(100), tolerance: 0.5 })).toMatchObject({ change: "unchanged" })
    expect(compareValues({ current: ready(-50), baseline: ready(100) })).toMatchObject({ signChange: "positive-to-negative", rate: -1.5 })
    // 指標の種類と表示形式の不一致
    expect(describeComparison(compareValues({ current: ready(0.03), baseline: ready(0.04), kind: "ratio" }), { kind: "ratio", format: { unit: "円" } }).available).toBe(false)
  })

  test("targets of 0 or below are judged without a ratio", () => {
    // エラー 0 件の上限
    expect(getTargetProgress({ value: 3, target: 0, direction: "decrease" })).toMatchObject({ status: "ready", kind: "limit", ratio: null, barValue: null, met: false, remaining: -3 })
    expect(getTargetProgress({ value: 0, target: 0, direction: "decrease" })).toMatchObject({ met: true })
    // 損益 0 円の目標
    expect(getTargetProgress({ value: 120_000, target: 0 })).toMatchObject({ ratio: null, met: true })
    // 赤字を −50 万円まで減らす
    expect(getTargetProgress({ value: -1_200_000, target: -500_000 })).toMatchObject({ ratio: null, met: false, remaining: 700_000 })
    expect(getTargetProgress({ value: -300_000, target: -500_000 })).toMatchObject({ met: true })
    expect(getTargetProgress({ value: 5, target: Number.NaN })).toEqual({ status: "invalid", reason: "target-missing" })
  })

  test("number formats: sign positions, rounding of negatives, compact rounding, precision, invalid settings", () => {
    expect(formatMetricValue(-1_234_567, { style: "currency", currency: "USD", locale: "en-US" })).toMatchObject({ text: "~−$1.23M", exactText: "−$1,234,567" })
    expect(formatMetricValue(-1_234_567, { style: "currency", currency: "EUR", locale: "de-DE" })!.text).toMatch(/^~−1,23\sMio\.\s€$/)
    // 丸めると 0 になる負の値は「−0.1%未満」（−0.1% より小さい意味になる）ではなく範囲で示す
    expect(formatMetricValue(-0.00004, { style: "ratio" })!.text).toBe("−0.1〜0%")
    expect(formatMetricValue(0.00004, { style: "ratio" })!.text).toBe("0.1%未満")
    expect(formatDifference(-0.00004, { style: "ratio" })).toBe("−0.1〜0%")
    expect(formatDifference(0.00004, { style: "ratio" })).toBe("+0.1%未満")
    // 割合の差（pt）
    const down = describeComparison(compareValues({ current: ready(0.1), baseline: ready(0.10004), kind: "ratio" }), { kind: "ratio", format: { style: "ratio" } })
    expect(down.text).toContain("−0.1〜0pt")
    const up = describeComparison(compareValues({ current: ready(0.10004), baseline: ready(0.1), kind: "ratio" }), { kind: "ratio", format: { style: "ratio" } })
    expect(up.text).toContain("+0.1pt未満")
    expect(formatMetricValue(-0, { unit: "円" })!.text).toBe("0円")
    expect(formatMetricValue(-12.345, { maximumFractionDigits: 1 })).toMatchObject({ text: "−12.3", exactText: "−12.345" })
    expect(formatMetricValue(1_234_567.891, { unit: "円" })).toMatchObject({ text: "約123万円", exactText: "1,234,567.891円" })
    expect(formatMetricValue(1e21, { unit: "円" })!.text).toBe("100,000京円")
    expect(() => formatMetricValue(1, { maximumFractionDigits: 30 })).toThrow(RangeError)
    expect(() => formatMetricValue(1, { locale: "xx-invalid-@@" })).toThrow(RangeError)
    expect(() => formatMetricValue(1, { compactFrom: -1 })).toThrow(RangeError)
    expect(() => formatMetricValue(1, { minimumFractionDigits: 3, maximumFractionDigits: 1 })).toThrow(RangeError)
    // 通貨の種類も単位もない通貨の表記
    expect(() => formatMetricValue(1, { style: "currency" })).toThrow(RangeError)
    // 不正な許容誤差
    expect(() => compareValues({ current: ready(1), baseline: ready(2), tolerance: -1 })).toThrow(RangeError)
    expect(() => compareValues({ current: ready(1), baseline: ready(2), tolerance: Number.NaN })).toThrow(RangeError)
  })
})

// ------------------------------------------------------------------ 分析の条件（useAnalysisQuery）
test.describe("Analysis query validity and keys", () => {
  type F = { regions: string[] }
  const run = (opts: Parameters<typeof useAnalysisQuery<F>>[0]) => {
    let out: ReturnType<typeof useAnalysisQuery<F>> | null = null
    const Probe = () => {
      out = useAnalysisQuery<F>(opts)
      return null
    }
    renderToString(createElement(Probe))
    return out!
  }
  const base = { defaultQuery: { period: { kind: "relative", id: "this-month" } as AnalysisPeriod, comparison: "previous-month" as const, filters: { regions: [] } }, context: ctx(2026, 11, 25) }

  test("an invalid restored period falls back to the default with a notice; an invalid default does not fetch", () => {
    const restored = run({ ...base, initialQuery: { period: abs("2026-11-30", "2026-11-01") } })
    expect(restored.status).toBe("ready")
    expect(restored.notice).toBe("指定された期間が不正なため、既定の期間で表示しています")
    expect(restored.period.status === "ready" && describeRange(restored.period.range)).toBe("2026/11/01〜2026/11/25")
    const broken = run({ ...base, defaultQuery: { ...base.defaultQuery, period: abs("2026-13-01", "2026-13-31") } })
    expect(broken.status).toBe("invalid")
    expect(broken.key).toBeNull()
    const controlled = run({ ...base, query: { period: abs("2026-11-25", "2026-11-01"), granularity: "day", granularityMode: "auto", comparison: "none", comparisonCustom: null, filters: { regions: [] } } })
    expect(controlled.status).toBe("invalid")
    expect(controlled.key).toBeNull()
    const badGranularity = run({ ...base, query: { period: { kind: "relative", id: "this-month" }, granularity: "decade" as never, granularityMode: "manual", comparison: "none", comparisonCustom: null, filters: { regions: [] } } })
    expect(badGranularity.status).toBe("invalid")
  })

  test("an unavailable granularity is replaced at render time with a notice", () => {
    const q = run({ ...base, query: { period: { kind: "relative", id: "last-12-months" }, granularity: "hour", granularityMode: "manual", comparison: "none", comparisonCustom: null, filters: { regions: [] } } })
    expect(q.granularity).toBe("month")
    expect(q.notice).toContain("「時間別」から「月別」")
    expect(JSON.parse(q.key!).granularity).toBe("month")
  })

  test("the key changes with the time zone, week start, fiscal year, asOf, comparison and aggregation, not with display settings", () => {
    const k = (extra: Partial<Parameters<typeof useAnalysisQuery<F>>[0]>) => run({ ...base, ...extra }).key
    const k0 = k({})
    expect(k({ context: { ...base.context, timeZone: "America/New_York" } })).not.toBe(k0)
    expect(k({ context: { ...base.context, weekStartsOn: 0 } })).not.toBe(k0)
    expect(k({ context: { ...base.context, fiscalYearStartMonth: 4 } })).not.toBe(k0)
    expect(k({ context: { ...base.context, asOf: 1 } })).not.toBe(k0)
    expect(k({ comparisonBasis: "calendar" })).not.toBe(k0)
    expect(k({ aggregationKey: "v2" })).not.toBe(k0)
    expect(k({ initialQuery: { comparison: "previous-year" } })).not.toBe(k0)
    expect(k({})).toBe(k0)
    // 日付が変わると、同じ「今月」でも別のキー
    expect(k({ context: ctx(2026, 12, 1) })).not.toBe(k0)
  })

  test("a custom comparison range is kept in the URL; an invalid one is not used", () => {
    const p = new URLSearchParams("page=business&period=this-month&cmp=custom&cfrom=2025-11-01&cto=2025-11-25")
    const restored = queryFromParams(p)
    expect(restored).toMatchObject({ comparison: "custom", comparisonCustom: { from: "2025-11-01", to: "2025-11-25" } })
    const q = run({ ...base, initialQuery: restored as never })
    expect(q.comparison.status === "ready" && describeRange(q.comparison.range)).toBe("2025/11/01〜2025/11/25")
    expect(paramsFromQuery("business", { ...q.query, filters: S.defaultAnalysisFilters } as never).get("cfrom")).toBe("2025-11-01")
    // 不正な比較期間（存在しない日付）は使わず、比較できない理由を示す状態にする（期間全体を取得しない）
    const bad = run({ ...base, initialQuery: queryFromParams(new URLSearchParams("cmp=custom&cfrom=2025-13-01&cto=2025-11-25")) as never })
    expect(bad.query.comparisonCustom).toBeNull()
    expect(bad.comparison.status).toBe("invalid")
  })

  test("unknown relative period ids and comparison modes are not treated as ready", () => {
    expect(resolvePeriod({ kind: "relative", id: "bogus" as never }, ctx(2026, 11, 25))).toEqual({ status: "invalid", reason: "unknown-period" })
    const restored = run({ ...base, initialQuery: { period: { kind: "relative", id: "bogus" as never }, comparison: "bogus" as never } })
    expect([restored.status, restored.query.comparison]).toEqual(["ready", "previous-month"])
    expect(restored.notice).toBe("指定された期間が不正なため、既定の期間で表示しています。指定された比較の対象が不正なため、既定の比較で表示しています")
    const controlled = run({ ...base, query: { period: { kind: "relative", id: "this-month" }, granularity: "day", granularityMode: "auto", comparison: "bogus" as never, comparisonCustom: null, filters: { regions: [] } } })
    expect([controlled.status, controlled.key]).toEqual(["invalid", null])
  })

  test("allowedGranularities: a product can leave out units it cannot aggregate", () => {
    const q = run({ ...base, initialQuery: { period: abs("2026-11-24", "2026-11-25") }, context: { ...ctx(2026, 11, 25), timeZone: "Asia/Tokyo" }, allowedGranularities: ["day", "week", "month"] })
    expect(q.granularities).not.toContain("hour")
    expect(q.granularity).toBe("day")
    const all = run({ ...base, initialQuery: { period: abs("2026-11-24", "2026-11-25") }, context: { ...ctx(2026, 11, 25), timeZone: "Asia/Tokyo" } })
    expect(all.granularities).toContain("hour")
    // 復元した単位（URL の g=hour）を使えない場合は、黙って変えずに知らせる
    const restored = run({
      ...base,
      initialQuery: { period: abs("2026-11-24", "2026-11-25"), granularity: "hour", granularityMode: "manual" },
      context: { ...ctx(2026, 11, 25), timeZone: "Asia/Tokyo" },
      allowedGranularities: ["day", "week", "month"],
    })
    expect([restored.granularity, restored.notice]).toEqual(["day", "指定された集計単位「時間別」は使えないため、「日別」で表示しています"])
  })

  test("the comparison stays as chosen when it becomes unavailable", () => {
    const q = run({ ...base, initialQuery: { period: abs("2026-09-01", "2026-11-25") } })
    expect(q.query.comparison).toBe("previous-month")
    expect(q.comparison).toEqual({ status: "invalid", reason: "overlap" })
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
    // 1 つの値と配列：全体の値が配列に含まれれば全体の値のまま
    expect(scopeFilters<{ plan: string | null }>({ plan: "light" }, { plan: ["light", "standard"] as never })).toMatchObject({ status: "ready", filters: { plan: "light" } })
    expect(scopeFilters<{ plan: string | null }>({ plan: "light" }, { plan: ["standard"] as never })).toMatchObject({ status: "conflict" })
    // 未知の条件
    expect(scopeFilters<F>({ regions: [], plan: null }, { owner: "a" } as never)).toEqual({ status: "invalid", unknown: ["owner"] })
    // 衝突の結果は filters を持たない（通常の条件として使えない）
    expect("filters" in scopeFilters<F>({ regions: ["kanto"], plan: null }, { regions: ["kinki"] })).toBe(false)
    // 比較の方法を製品が渡す（大文字と小文字を区別しない例）
    expect(scopeFilters<F>({ regions: ["KANTO"], plan: null }, { regions: ["kanto"] }, { equals: (a, b) => String(a).toLowerCase() === String(b).toLowerCase() })).toMatchObject({ status: "ready" })
  })

  test("drill-down carries the period actually aggregated, and a bucket's real start and end", () => {
    const c = ctx(2026, 11, 25)
    const truncated = resolvePeriod(abs("2026-11-01", "2026-12-31"), c)
    expect(drillPeriodFor("current", { comparison: { status: "none" }, current: truncated })).toEqual(abs("2026-11-01", "2026-11-25"))
    const b = buildBuckets({ from: makeDate(2026, 11, 1)!, to: makeDate(2026, 11, 1)! }, "hour", { today: makeDate(2030, 1, 1)!, timeZone: "America/New_York" })[2]
    const d = drillBucketPeriod(b)
    expect(d.period).toEqual(abs("2026-11-01", "2026-11-01"))
    expect(d.instant).toEqual({ start: Date.parse("2026-11-01T01:00:00-05:00"), end: Date.parse("2026-11-01T02:00:00-05:00") })
    const week = buildBuckets(resolved({ kind: "relative", id: "this-month" }, c).range, "week", c)[0]
    expect(drillBucketPeriod(week).period).toEqual(abs("2026-11-01", "2026-11-01"))
  })

  test("drill-down from the comparison series carries that series' fixed period", () => {
    const c = ctx(2026, 11, 25)
    const period: AnalysisPeriod = { kind: "relative", id: "this-month" }
    const current = resolvePeriod(period, c)
    const comparison = current.status === "ready" ? comparisonRange({ period: current, mode: "previous-year" }) : ({ status: "none" } as const)
    expect(drillPeriodFor("current", { period, comparison, current })).toEqual(abs("2026-11-01", "2026-11-25"))
    expect(drillPeriodFor("baseline", { period, comparison, current })).toEqual(abs("2025-11-01", "2025-11-25"))
    // 同じ経過時間の比較：比較の系列は、集計した時刻までの半開区間も引き継ぐ
    const asOf = Date.UTC(2026, 10, 25, 5, 30)
    const et = current.status === "ready" ? comparisonRange({ period: current, mode: "previous-month", basis: "elapsed-time", context: { ...c, timeZone: "Asia/Tokyo", asOf } }) : ({ status: "none" } as const)
    expect(drillRangeFor("baseline", { comparison: et, current })).toEqual({
      period: abs("2026-10-01", "2026-10-25"),
      instant: { start: Date.parse("2026-10-01T00:00:00+09:00"), end: Date.parse("2026-10-25T14:30:00+09:00") },
    })
    // 現在の系列は、期間の始まりから集計済みの時刻まで（文脈が必要。ない場合は時刻を引き継がない）
    expect(drillRangeFor("current", { comparison: et, current, context: { ...c, timeZone: "Asia/Tokyo", asOf } })).toEqual({
      period: abs("2026-11-01", "2026-11-25"),
      instant: { start: Date.parse("2026-11-01T00:00:00+09:00"), end: asOf },
    })
    expect(drillRangeFor("current", { comparison: et, current })).toEqual({ period: abs("2026-11-01", "2026-11-25"), instant: null })
  })

  test('"Other" keeps the actual members and missing values are not summed as 0', () => {
    const items = [
      { k: "a", v: 10 },
      { k: "b", v: 8 },
      { k: "c", v: 3 },
      { k: "d", v: 2 },
      { k: "e", v: null },
    ]
    const { groups, skipped } = groupOther(items, { limit: 2, key: (i) => i.k, label: (i) => i.k, value: (i) => i.v, aggregate: "sum" })
    expect(groups.map((g) => g.key)).toEqual(["a", "b", "__other"])
    expect(groups[2]).toMatchObject({ kind: "other", value: 5, members: ["c", "d"] })
    expect(skipped.map((s) => s.k)).toEqual(["e"])
    // 1 件だけなら「その他」にしない
    expect(groupOther(items.slice(0, 3), { limit: 2, key: (i) => i.k, label: (i) => i.k, value: (i) => i.v, aggregate: "sum" }).groups.map((g) => g.kind)).toEqual(["item", "item", "item"])
    const opts = { key: (i: { k: string; v: number | null }) => i.k, label: (i: { k: string }) => i.k, value: (i: { v: number | null }) => i.v }
    // 加算できない指標：再集計の結果が取得できなければ null（0 にしない）
    expect(groupOther(items, { ...opts, limit: 2, aggregate: () => null }).groups[2]).toMatchObject({ kind: "other", value: null })
    // 合計が有限にならない
    expect(groupOther([{ k: "a", v: 1 }, { k: "b", v: Number.MAX_VALUE }, { k: "c", v: Number.MAX_VALUE }], { ...opts, limit: 0, aggregate: "sum" }).groups[0]).toMatchObject({ value: null })
    // 不正な数値（NaN、Infinity）は除く
    expect(groupOther([{ k: "a", v: Number.NaN }, { k: "b", v: Infinity }, { k: "c", v: 2 }], { ...opts, limit: 1, aggregate: "sum" }).skipped.map((i) => i.k)).toEqual(["a", "b"])
    // limit の境界
    expect(groupOther(items, { ...opts, limit: 0, aggregate: "sum" }).groups.map((g) => g.kind)).toEqual(["other"])
    expect(groupOther(items, { ...opts, limit: 10, aggregate: "sum" }).groups.every((g) => g.kind === "item")).toBe(true)
    // 重複した分類と、「その他」の key との衝突は製品のデータの誤り
    expect(() => groupOther([{ k: "a", v: 1 }, { k: "a", v: 2 }], { ...opts, limit: 1, aggregate: "sum" })).toThrow(RangeError)
    expect(() => groupOther([{ k: "__other", v: 1 }], { ...opts, limit: 1, aggregate: "sum" })).toThrow(RangeError)
    // 欠損した分類を「その他」の明細の対象に含める（値の計算には含めない）
    expect(groupOther(items, { ...opts, limit: 2, aggregate: "sum", includeSkippedInOther: true }).groups[2]).toMatchObject({ value: 5, members: ["c", "d", "e"] })
    // 集計の方法の指定がない（JavaScript からの呼び出しなど）
    expect(() => groupOther(items, { ...opts, limit: 2, aggregate: "avg" as never })).toThrow(RangeError)
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
    expect(staff.rows.length + staff.hidden!).toBe(list.total)
    expect(staff.hidden).toBeGreaterThan(0)
    // 件数を公開しない設定では、閲覧できない明細の件数も返さない
    const concealed = churnedAccountList({ range: year, filters: f, role: "staff", hiddenCountPolicy: "hide" })
    expect(concealed).toMatchObject({ total: null, hidden: null, concealed: true })
    expect(concealed.rows.length).toBe(staff.rows.length)
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

  test("comparison periods partly outside the data range give null, not 0", () => {
    const p = resolved(abs("2023-06-01", "2023-08-31"), ctx(2026, 11, 25))
    const py = comparisonRange({ period: p, mode: "previous-year" })
    expect(py.status === "ready" && describeRange(py.range)).toBe("2022/06/01〜2022/08/31")
    const s = retentionSummary({ range: p.range, base: py.status === "ready" ? py.range : null, filters: f })
    expect(s.churned.current).not.toBeNull()
    expect(s.churned.baseline).toBeNull()
    expect(s.churnMrr.baseline).toBeNull()
  })

  test("companies and contracts: the mock data has one contract per company, so the counts agree", () => {
    const list = churnedAccountList({ range: year, filters: f, role: "manager" })
    expect(new Set(list.rows.map((r) => r.id)).size).toBe(list.rows.length)
    expect(new Set(S.accounts.map((a) => a.name)).size).toBe(S.accounts.length)
  })

  test("ratios are recomputed for groups, not summed", () => {
    const members = ["chubu", "hokkaido-tohoku", "chugoku-shikoku"] as const
    const recomputed = S.churnRateIn(year, { ...f, regions: [...members] })!
    const summed = members.reduce((n, r) => n + S.churnRateIn(year, { ...f, regions: [r] })!, 0)
    expect(recomputed).toBeLessThan(summed)
    const churned = members.reduce((n, r) => n + S.churnedIn(year, { ...f, regions: [r] })!, 0)
    expect(S.churnedIn(year, { ...f, regions: [...members] })).toBe(churned)
  })

  test("the workspace scope restricts the data on the server side", () => {
    // ワークスペースの条件と画面の条件は積集合。画面の条件（関東）をスコープの条件（九州・沖縄）で上書きしない（重ならないため conflict）
    expect(withScope("kyushu", { ...f, regions: ["kanto"] })).toEqual({ status: "conflict", conflicts: ["regions"] })
    expect(withScope("kyushu", f)).toMatchObject({ status: "ready", filters: { regions: ["kyushu-okinawa"] } })
    expect(withScope("kyushu", { ...f, regions: ["kyushu-okinawa"] })).toMatchObject({ status: "ready", filters: { regions: ["kyushu-okinawa"] } })
    expect(withScope("kyushu", { ...f, regions: ["kanto", "kyushu-okinawa"] })).toMatchObject({ status: "ready", filters: { regions: ["kyushu-okinawa"] } })
    expect(withScope("hq", { ...f, regions: ["kanto"] })).toMatchObject({ status: "ready", filters: { regions: ["kanto"] } })
    expect(accountDetail(S.accounts.find((a) => a.region === "kanto")!.id, "manager", "kyushu")).toBeNull()
  })

  test("hiding the counts gives the same response shape whether or not hidden rows exist", () => {
    // 閲覧できない明細がない一覧（管理者）と、ある一覧（担当者）で、件数を示さない設定の応答の形が同じ
    const manager = churnedAccountList({ range: year, filters: f, role: "manager", hiddenCountPolicy: "hide" })
    const staff = churnedAccountList({ range: year, filters: f, role: "staff", hiddenCountPolicy: "hide" })
    for (const r of [manager, staff]) expect(r).toMatchObject({ total: null, hidden: null, concealed: true, outOfRange: false })
    expect(Object.keys(manager).sort()).toEqual(Object.keys(staff).sort())
    // 担当者でも、閲覧できない明細がない条件（理由で絞り込んだ結果に制限のある取引先がない場合）でも同じ形
    const reasons = [...new Set(churnedAccountList({ range: year, filters: f, role: "manager" }).rows.map((r) => r.reason))]
    for (const reason of reasons) {
      const r = churnedAccountList({ range: year, filters: f, role: "staff", reason, hiddenCountPolicy: "hide" })
      expect(r).toMatchObject({ total: null, hidden: null, concealed: true })
    }
  })

  test("a restricted account detail is forbidden, or not found when the product conceals its existence", () => {
    const restricted = S.accounts.find((a) => a.restricted)!
    expect(() => accountDetail(restricted.id, "staff", "hq")).toThrow("この企業の詳細を表示する権限がありません")
    // 存在を明かさない方針：本当に存在しない ID と同じ結果（null）
    expect(accountDetail(restricted.id, "staff", "hq", "not-found")).toBeNull()
    expect(accountDetail("A-9999", "staff", "hq", "not-found")).toBeNull()
    expect(accountDetail(restricted.id, "manager", "hq", "not-found")).not.toBeNull()
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
    // 過去の期間（先月）でも、Sparkline の最後の点は期間の最終日の MRR
    const lm = resolved({ kind: "relative", id: "last-month" }, c)
    const ol = overviewData({ period: lm, full: fullPeriodOf(lm, c), comparison: comparisonRange({ period: lm, mode: "previous-month" }), filters: f })
    expect(ol.mrrSpark[11]).toBe(ol.mrr.current)
    expect(ol.mrrSpark[11]).toBe(S.mrrOn(makeDate(2026, 10, 31)!, f))
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

// ------------------------------------------------------------------ Patterns Integration Review の指摘への対処
test.describe("Integration review: comparison fairness and alignment", () => {
  const c = ctx(2026, 11, 25)
  const cmp = (from: string, to: string, mode: "previous-month" | "previous-year", extra: Partial<Parameters<typeof comparisonRange>[0]> = {}) =>
    comparisonRange({ period: resolved(abs(from, to), c), mode, ...extra })

  test("a calendar comparison whose period has a different number of days is not fair (period totals)", () => {
    // 月末に合わせたため短くなる：3/1〜3/30（30 日）の前月は 2/1〜2/28（28 日）
    const a = cmp("2025-03-01", "2025-03-30", "previous-month")
    expect(a.status === "ready" && [describeRange(a.range), a.basis, a.adjusted, a.truncated, a.fair]).toEqual(["2025/02/01〜2025/02/28", "calendar", true, true, false])
    expect(a.status === "ready" && a.reason).toBe("比較期間と分析の対象の日数が異なります（分析の対象は 30 日間、比較期間は 28 日間）")
    expect(a.status === "ready" && a.note).toContain("2025/03/30 に対応する日がないため")
    // 2 日間の期間が 1 日の比較期間になる（検証画面で +101.9% と示していた例）
    const b = cmp("2025-03-30", "2025-03-31", "previous-month")
    expect(b.status === "ready" && [describeRange(b.range), b.days, b.fair]).toEqual(["2025/02/28", 1, false])
    const leap = cmp("2024-02-28", "2024-02-29", "previous-year")
    expect(leap.status === "ready" && [describeRange(leap.range), leap.fair]).toEqual(["2023/02/28", false])
    // 月末に合わせなくても、月末をまたぐと日数が変わる（3/15〜4/14 の 31 日と、2/15〜3/14 の 28 日）
    const cross = cmp("2025-03-15", "2025-04-14", "previous-month")
    expect(cross.status === "ready" && [describeRange(cross.range), cross.adjusted, cross.fair]).toEqual(["2025/02/15〜2025/03/14", false, false])
    // 日数が同じなら公平（月末に合わせた 1 日どうし、月の途中の同じ日付）
    const leapDay = cmp("2024-02-29", "2024-02-29", "previous-year")
    expect(leapDay.status === "ready" && [leapDay.adjusted, leapDay.fair, leapDay.reason]).toEqual([true, true, null])
    const mid = cmp("2026-10-05", "2026-10-20", "previous-month")
    expect(mid.status === "ready" && [describeRange(mid.range), mid.fair]).toEqual(["2026/09/05〜2026/09/20", true])
    // 時点の指標は期間の日数に関係しない（同じ時点の値と比べる）
    const point = cmp("2025-03-30", "2025-03-31", "previous-month", { basis: "point-in-time" })
    expect(point.status === "ready" && [describeRange(point.range), point.fair]).toEqual(["2025/02/28", true])
  })

  test("weekday alignment does not move a previous-month comparison far beyond the previous month", () => {
    // 31 日間の月は、前月の 28 日前と重なるため 35 日前と比べる（暦でずらした 28 日 + 7 日以内）
    const march = cmp("2025-03-01", "2025-03-31", "previous-month", { basis: "weekday" })
    expect(march.status === "ready" && [describeRange(march.range), march.note]).toEqual(["2025/01/25〜2025/02/24", "曜日をそろえるため、35 日前の期間と比べます"])
    // 85 日間の期間の前月は、91 日前（前月ではなく 3 か月前）になるため比較できない
    expect(cmp("2025-01-05", "2025-03-30", "previous-month", { basis: "weekday" })).toEqual({ status: "invalid", reason: "overlap" })
    // 前年同期は 364 日前のまま
    const py = cmp("2025-01-05", "2025-03-30", "previous-year", { basis: "weekday" })
    expect(py.status === "ready" && py.note).toBe("曜日をそろえるため、364 日前の期間と比べます")
  })

  test("elapsed time with asOf at or before the start has nothing to compare and is not fair", () => {
    const tm = resolved({ kind: "relative", id: "this-month" }, c)
    for (const asOf of [zonedStartOfDay("2026-11-01", "Asia/Tokyo"), Date.UTC(2026, 9, 31)]) {
      const r = comparisonRange({ period: tm, mode: "previous-month", basis: "elapsed-time", context: { ...c, timeZone: "Asia/Tokyo", asOf } })
      expect(r.status === "ready" && [r.fair, r.reason, r.instant && r.instant.end - r.instant.start]).toEqual([false, "集計済みの時刻が分析の対象の始まり以前のため、比べる経過時間がありません", 0])
    }
  })

  test("elapsed alignment uses the bucket granularity, not the display label", () => {
    const relabel = (list: ReturnType<typeof buildBuckets>) => list.map((b) => ({ ...b, fullLabel: `bucket ${b.key}` }))
    const cur = relabel(buildBuckets({ from: makeDate(2026, 9, 1)!, to: makeDate(2026, 10, 31)! }, "month", c))
    const base = relabel(buildBuckets({ from: makeDate(2026, 7, 1)!, to: makeDate(2026, 8, 31)! }, "month", c))
    const rows = alignBuckets(cur, base, { by: "elapsed", allowDifferentLength: true })
    expect(rows.map((r) => [r.key, toDateString(r.current!.from), toDateString(r.baseline!.from)])).toEqual([
      ["u0", "2026-09-01", "2026-07-01"],
      ["u1", "2026-10-01", "2026-08-01"],
    ])
    const weeks = alignBuckets(relabel(buildBuckets(resolved({ kind: "relative", id: "this-month" }, c).range, "week", c)), relabel(buildBuckets({ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 25)! }, "week", c)), { by: "elapsed" })
    expect(weeks[0].key).toBe("w0")
  })

  test("a sign change from positive to negative shows the difference first", () => {
    const flip = compareValues({ current: ready(-50), baseline: ready(100) })
    expect(flip.status === "ready" && [flip.signChange, flip.rate]).toEqual(["positive-to-negative", -1.5])
    expect(describeComparison(flip, { format: { unit: "円" } })).toMatchObject({ text: "−150円", detail: "プラスからマイナスに転換" })
    // 製品が増減率を指定した場合は、増減率を示す
    expect(describeComparison(flip, { format: { unit: "円" }, show: "rate" }).text).toBe("−150.0%")
  })

  test('"Other" is created for skipped members even when no value is grouped', () => {
    const opts = { key: (i: { k: string }) => i.k, label: (i: { k: string }) => i.k, value: (i: { v: number | null }) => i.v, aggregate: "sum" as const, includeSkippedInOther: true }
    // まとめる値のある項目が 0 件：値は null（0 にしない）、members は欠損した分類
    const none = groupOther([{ k: "a", v: 10 }, { k: "b", v: 8 }, { k: "e", v: null }], { ...opts, limit: 2 })
    expect(none.groups.map((g) => g.key)).toEqual(["a", "b", "__other"])
    expect(none.groups[2]).toMatchObject({ kind: "other", value: null, members: ["e"] })
    // まとめる値のある項目が 1 件：欠損した分類と一緒に「その他」にする
    const one = groupOther([{ k: "a", v: 10 }, { k: "b", v: 8 }, { k: "c", v: 3 }, { k: "e", v: null }], { ...opts, limit: 2 })
    expect(one.groups[2]).toMatchObject({ kind: "other", value: 3, members: ["c", "e"] })
    // 指定しない場合は従来どおり（欠損した分類は skipped だけ、1 件は「その他」にしない）
    expect(groupOther([{ k: "a", v: 10 }, { k: "b", v: 8 }, { k: "e", v: null }], { ...opts, includeSkippedInOther: false, limit: 2 }).groups.map((g) => g.kind)).toEqual(["item", "item"])
  })

  test("scopeFilters treats only own keys of the global conditions as known", () => {
    expect(scopeFilters({ regions: [] as string[] }, { toString: "x" } as never)).toEqual({ status: "invalid", unknown: ["toString"] })
    expect(scopeFilters({ regions: [] as string[] }, { constructor: "x" } as never)).toEqual({ status: "invalid", unknown: ["constructor"] })
  })
})

test.describe("Integration review: shown conditions", () => {
  test("a single-region screen keeps only the first region from the URL and says so", () => {
    const r = singleRegionQuery(queryFromParams(new URLSearchParams("region=kanto,kinki")))
    expect(r.query.filters?.regions).toEqual(["kanto"])
    expect(r.notice).toBe("この画面で選べる地域は 1 つです。URL で指定された地域のうち、関東で集計しています（近畿は使っていません）")
    // 重複した値は 1 つにする。1 つなら知らせない
    const same = singleRegionQuery(queryFromParams(new URLSearchParams("region=kanto,kanto")))
    expect([same.query.filters?.regions, same.notice]).toEqual([["kanto"], null])
  })

  test("the stale label is built from the conditions actually used, including granularity and time zone", () => {
    const range = { from: makeDate(2026, 11, 1)!, to: makeDate(2026, 11, 25)! }
    const shown = { range, filters: { ...S.defaultAnalysisFilters, regions: ["kanto" as const] }, granularity: "month" as const, timeZone: "Asia/Tokyo" }
    expect(describeConditions(shown, { timeZone: "Asia/Tokyo" })).toBe("2026/11/01〜2026/11/25・関東・月別の結果（前の条件）")
    expect(describeConditions(shown, { timeZone: "America/New_York" })).toBe("2026/11/01〜2026/11/25・関東・月別・Asia/Tokyoの結果（前の条件）")
    expect(describeConditions({ range: null, rangeLabel: "過去 24 か月と今後 3 か月", filters: S.defaultAnalysisFilters, timeZone: "Asia/Tokyo" }, { timeZone: "Asia/Tokyo" })).toBe(
      "過去 24 か月と今後 3 か月・絞り込みなしの結果（前の条件）"
    )
    // ワークスペースで決まった地域も、集計に使った条件として示す
    const ws = withScope("kyushu", S.defaultAnalysisFilters)
    expect(ws.status === "ready" && describeConditions({ range, filters: ws.filters, timeZone: "Asia/Tokyo" }, { timeZone: "Asia/Tokyo" })).toBe("2026/11/01〜2026/11/25・九州・沖縄の結果（前の条件）")
  })
})
