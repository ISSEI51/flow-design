import { addDays, addMonths, getDaysInMonth, startOfMonth } from "date-fns"

import { fromDateString, isBeforeDate, makeDate, toDateString } from "@/lib/date"
import { buildBuckets, type ComparisonRange, type DayRange, type Granularity, type ResolvedPeriod } from "@/patterns/analysis-period"

import {
  ANALYSIS_TODAY,
  CHURN_RATE_LIMIT,
  accountById,
  stateOn,
  DATA_START,
  activeOn,
  churnMrrIn,
  churnRateIn,
  churnedAccounts,
  inDataRange,
  churnedIn,
  endOfMonthDay,
  grossProfitIn,
  monthlyRevenueTarget,
  mrrBridge,
  mrrOn,
  newAccountsIn,
  operatingProfitIn,
  plans,
  regions,
  revenueIn,
  terms,
  type AnalysisFilters,
  type Plan,
  type Region,
  type Term,
} from "./subscriptions"
import { AnalysisRequestError } from "./analysis-server"

// 検証画面の各領域のデータ。subscriptions.ts の記録から集計する。画面の値を、ここ以外で作らない。
// 期間と比較期間は、Registry の analysis-period.ts で解決したものを受け取る。

export type ReadyPeriod = Extract<ResolvedPeriod, { status: "ready" }>
type Pair = { current: number | null; baseline: number | null }

const baselineRange = (c: ComparisonRange) => (c.status === "ready" ? c.range : null)
const or = <T,>(range: DayRange | null, f: (r: DayRange) => T) => (range ? f(range) : null)

/** 期間の全体（月、四半期、年度）の売上の目標。月ごとの目標を合計する。目標がない月を含む場合は null */
export function revenueTargetFor(full: DayRange): number | null {
  // 目標は月ごとに設定している。月の初日から月末までの期間（月、四半期、年度）でなければ、目標を示さない（週の目標はない）。
  if (full.from.getDate() !== 1 || toDateString(full.to) !== toDateString(endOfMonthDay(full.to))) return null
  let sum = 0
  for (let m = startOfMonth(full.from); !isBeforeDate(full.to, m); m = addMonths(m, 1)) {
    const t = monthlyRevenueTarget(m)
    if (t === null) return null
    sum += t
  }
  return sum
}

export function overviewData({ period, full, comparison, filters }: { period: ReadyPeriod; full: DayRange | null; comparison: ComparisonRange; filters: AnalysisFilters }) {
  const range = period.range
  const base = baselineRange(comparison)
  // 月の上限の目標は、期間が 1 か月（確定した月か、途中の月）の場合だけ比べる
  const singleMonth = full !== null && full.from.getDate() === 1 && toDateString(endOfMonthDay(full.from)) === toDateString(full.to)
  const revenue = revenueIn(range, filters)
  const gp = grossProfitIn(range, filters)
  const baseRevenue = or(base, (r) => revenueIn(r, filters))
  const baseGp = or(base, (r) => grossProfitIn(r, filters))
  // 12 か月の月末の MRR（今月は今日の時点）。Sparkline に使う
  const spark: (number | null)[] = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(startOfMonth(ANALYSIS_TODAY), i - 11)
    const end = i === 11 ? ANALYSIS_TODAY : endOfMonthDay(m)
    return mrrOn(end, filters)
  })
  return {
    asOf: range.to,
    baselineAsOf: base?.to ?? null,
    mrr: { current: mrrOn(range.to, filters), baseline: or(base, (r) => mrrOn(r.to, filters)) } as Pair,
    accounts: { current: activeOn(range.to, filters), baseline: or(base, (r) => activeOn(r.to, filters)) } as Pair,
    revenue: { current: revenue, baseline: baseRevenue } as Pair,
    revenueTarget: full === null || filters.regions.length || filters.plans.length || filters.terms.length ? null : revenueTargetFor(full),
    churnRate: { current: churnRateIn(range, filters), baseline: or(base, (r) => churnRateIn(r, filters)) } as Pair,
    churnLimit: singleMonth ? CHURN_RATE_LIMIT : null,
    newAccounts: { current: newAccountsIn(range, filters), baseline: or(base, (r) => newAccountsIn(r, filters)) } as Pair,
    grossMargin: {
      current: revenue && gp !== null ? gp / revenue : null,
      baseline: baseRevenue && baseGp !== null ? baseGp / baseRevenue : null,
    } as Pair,
    mrrSpark: spark,
  }
}
export type OverviewData = ReturnType<typeof overviewData>

export type TrendRow = {
  key: string
  label: string
  fullLabel: string
  /** 確定した月の月末の MRR */
  confirmed: number | null
  /** 途中の月（今月）の線。直前の確定した月と今月の 2 点だけに値を持つ */
  partial: number | null
  /** 前年の同じ月の月末の MRR */
  previousYear: number | null
  previousYearLabel: string
  /** 予測（製品の算出）。今月と未来の月 */
  forecast: number | null
  forecastRange: [number, number] | null
  inProgress: boolean
  isFuture: boolean
}

/** 過去 24 か月の月末の MRR と、前年の同じ月、予測（3 か月） */
export function mrrTrend({ filters, withForecast }: { filters: AnalysisFilters; withForecast: boolean }) {
  const thisMonth = startOfMonth(ANALYSIS_TODAY)
  const rows: TrendRow[] = []
  for (let i = -23; i <= 3; i++) {
    const m = addMonths(thisMonth, i)
    const inProgress = i === 0
    const isFuture = i > 0
    const end = inProgress ? ANALYSIS_TODAY : endOfMonthDay(m)
    const value = isFuture ? null : mrrOn(end, filters)
    const py = addMonths(m, -12)
    const pyEnd = inProgress ? makeDate(ANALYSIS_TODAY.getFullYear() - 1, ANALYSIS_TODAY.getMonth() + 1, ANALYSIS_TODAY.getDate())! : endOfMonthDay(py)
    rows.push({
      key: toDateString(m).slice(0, 7),
      label: m.getMonth() === 0 || i === -23 ? `${m.getFullYear()}/${m.getMonth() + 1}` : `${m.getMonth() + 1}月`,
      fullLabel: `${m.getFullYear()}年${m.getMonth() + 1}月${inProgress ? `（${ANALYSIS_TODAY.getDate()}日時点）` : ""}`,
      confirmed: inProgress || isFuture ? null : value,
      partial: i === -1 || inProgress ? value : null,
      previousYear: isFuture || isBeforeDate(pyEnd, DATA_START) ? null : mrrOn(pyEnd, filters),
      previousYearLabel: `${py.getFullYear()}年${py.getMonth() + 1}月${inProgress ? `（${ANALYSIS_TODAY.getDate()}日時点）` : ""}`,
      forecast: null,
      forecastRange: null,
      inProgress,
      isFuture,
    })
  }
  if (withForecast) {
    // 予測（製品の責務の例）：直近 6 か月の月末の MRR の増加の平均を、今日の MRR に加える。範囲は月ごとに ±1.5% ずつ広げる。
    const confirmed = rows.filter((r) => r.confirmed !== null).slice(-7)
    const step = (confirmed[confirmed.length - 1].confirmed! - confirmed[0].confirmed!) / 6
    const now = rows.find((r) => r.inProgress)!
    const start = now.partial!
    rows.forEach((r, i) => {
      const k = i - rows.indexOf(now)
      if (k < 0) return
      // 今月の予測は月末の値。今日の値から残りの日数分を加える
      const remaining = (getDaysInMonth(ANALYSIS_TODAY) - ANALYSIS_TODAY.getDate()) / getDaysInMonth(ANALYSIS_TODAY)
      const v = start + step * (k + remaining)
      r.forecast = k === 0 ? start : v
      r.forecastRange = k === 0 ? null : [v * (1 - 0.015 * k), v * (1 + 0.015 * k)]
    })
  }
  return { rows, forecastBasis: withForecast ? ANALYSIS_TODAY : null }
}

export function bridgeData({ period, comparison, filters }: { period: ReadyPeriod; comparison: ComparisonRange; filters: AnalysisFilters }) {
  return { current: mrrBridge(period.range, filters), baseline: or(baselineRange(comparison), (r) => mrrBridge(r, filters)) }
}

export function profitByRegion({ period, comparison, filters }: { period: ReadyPeriod; comparison: ComparisonRange; filters: AnalysisFilters }) {
  const targets = filters.regions.length ? filters.regions : regions
  const base = baselineRange(comparison)
  return targets.map((region) => {
    const f = { ...filters, regions: [region] }
    return { region, current: operatingProfitIn(period.range, f), baseline: or(base, (r) => operatingProfitIn(r, f)) }
  })
}

// ---------------------------------------------------------------- 顧客維持
export function retentionSummary({ range, base, filters }: { range: DayRange; base: DayRange | null; filters: AnalysisFilters }) {
  return {
    churnRate: { current: churnRateIn(range, filters), baseline: or(base, (r) => churnRateIn(r, filters)) } as Pair,
    churned: { current: churnedIn(range, filters), baseline: or(base, (r) => churnedIn(r, filters)) } as Pair,
    churnMrr: { current: churnMrrIn(range, filters), baseline: or(base, (r) => churnMrrIn(r, filters)) } as Pair,
    activeAtStart: activeOn(addDays(range.from, -1), filters),
  }
}

/** 集計単位ごとの解約率と、前年の同じ区間の解約率 */
export function churnTrend({ range, granularity, filters }: { range: DayRange; granularity: Granularity; filters: AnalysisFilters }) {
  return buildBuckets(range, granularity, { today: ANALYSIS_TODAY }).map((b) => {
    const py = { from: addMonths(b.from, -12), to: addMonths(b.to, -12) }
    return {
      key: b.key,
      label: b.label,
      fullLabel: b.fullLabel,
      /** 区間の開始日と終了日。Drill-down で、この区間の期間を引き継ぐ */
      from: toDateString(b.from),
      to: toDateString(b.to),
      /** 前年の同じ区間。前年の系列から Drill-down するときは、この期間を引き継ぐ */
      pyFrom: toDateString(py.from),
      pyTo: toDateString(py.to),
      partial: b.partial,
      inProgress: b.inProgress,
      rate: churnRateIn(b, filters),
      churned: churnedIn(b, filters),
      previousYear: isBeforeDate(py.from, addDays(DATA_START, 1)) ? null : churnRateIn(py, filters),
      previousYearLabel: `${py.from.getFullYear()}年${py.from.getMonth() + 1}月`,
    }
  })
}

export type BreakdownRow<K extends string> = { key: K; churned: number | null; base: number | null; rate: number | null; baselineRate: number | null }

function breakdown<K extends string>(keys: K[], narrow: (k: K) => AnalysisFilters, range: DayRange, base: DayRange | null): BreakdownRow<K>[] {
  return keys.map((k) => {
    const f = narrow(k)
    return { key: k, churned: churnedIn(range, f), base: activeOn(addDays(range.from, -1), f), rate: churnRateIn(range, f), baselineRate: or(base, (r) => churnRateIn(r, f)) }
  })
}

export function churnByPlan({ range, base, filters }: { range: DayRange; base: DayRange | null; filters: AnalysisFilters }) {
  const keys = filters.plans.length ? filters.plans : plans
  return breakdown<Plan>(keys, (p) => ({ ...filters, plans: [p] }), range, base)
}

export function churnByTerm({ range, base, filters }: { range: DayRange; base: DayRange | null; filters: AnalysisFilters }) {
  const keys = filters.terms.length ? filters.terms : terms
  return breakdown<Term>(keys, (t) => ({ ...filters, terms: [t] }), range, base)
}

export function churnByRegion({ range, filters }: { range: DayRange; filters: AnalysisFilters }) {
  const keys: Region[] = filters.regions.length ? filters.regions : regions
  return breakdown<Region>(keys, (r) => ({ ...filters, regions: [r] }), range, null)
}

/** 解約した企業の一覧。権限のない取引先の明細は、サーバーで除き、件数だけを返す（クライアントで隠さない） */
export function churnedAccountList({ range, filters, role, reason }: { range: DayRange; filters: AnalysisFilters; role: "manager" | "staff"; reason?: string | null }) {
  // 集計の範囲の外を含む期間は、集計の値と同じ条件で数えられないため、明細も返さない
  if (!inDataRange(range)) return { rows: [] as ReturnType<typeof churnedAccounts>, total: null, hidden: 0, outOfRange: true as const }
  const all = churnedAccounts(range, filters).filter((r) => !reason || r.reason === reason)
  const visible = role === "manager" ? all : all.filter((r) => !r.restricted)
  return { rows: visible.map(({ restricted: _restricted, ...r }) => r), total: all.length as number | null, hidden: all.length - visible.length, outOfRange: false as const }
}
export type ChurnedListRow = Omit<ReturnType<typeof churnedAccounts>[number], "restricted">

// ---------------------------------------------------------------- 企業の詳細
/** 企業の詳細。閲覧の権限が限られた取引先は、staff には返さない（forbidden）。存在しない ID は null */
export function accountDetail(id: string, role: "manager" | "staff") {
  const a = accountById.get(id)
  if (!a) return null
  if (role === "staff" && a.restricted) throw new AnalysisRequestError("この企業の詳細を表示する権限がありません", "forbidden")
  const last = a.end ? addDays(fromDateString(a.end)!, -1) : ANALYSIS_TODAY
  // 最後の 12 か月の月末の月額（契約していない月は null。0 にしない）
  const history = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(startOfMonth(last), i - 11)
    const day = i === 11 ? last : endOfMonthDay(m)
    return stateOn(a, toDateString(day))?.fee ?? null
  })
  return { ...a, restricted: undefined, history }
}
export type AccountDetail = NonNullable<ReturnType<typeof accountDetail>>
