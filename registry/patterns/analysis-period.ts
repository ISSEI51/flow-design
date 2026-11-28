import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"

import { formatDate, fromDateString, isBeforeDate, isValidDate, makeDate, toDateString, type DateRangePreset, type DateString } from "@/lib/date"
import { hourSlotsOf, hoursInDay, isValidTimeZone, isoWithOffset, nextDayStart, offsetLabel, zonedStartOfDay } from "@/patterns/analysis-time"

// Flow Design Analysis Period（Patterns / Data Analysis / Analysis Filters・Period Comparison）
// 分析対象の期間、集計単位、比較期間を決める。定義は docs/web/patterns/analysis-filters.md と period-comparison.md を参照。
//
// 時間の定義（Date Picker（registry/lib/date.ts）と同じ）
// - 画面の中の日付は「ローカル時刻の 0 時」の Date で持ち、年月日だけを使う。開始日と終了日は、どちらも期間に含む。
// - 「今日」は製品が todayIn(timeZone) で求めて渡す（context.today）。この部品は現在時刻を直接読まない。
//   当日のデータがどこまで集計済みかもわからないため、今日を含む区間は「途中」として扱う。集計済みの時刻を
//   知っている製品は context.asOf（エポックからのミリ秒）で渡し、区間の確定・途中・未来を時刻で判定させる。
// - 集計のタイムゾーン（context.timeZone）は製品が明示的に渡す。時間別の区間と、時刻での比較に必要。
//   実行環境のタイムゾーンには依存しない（analysis-time.ts）。
// - 週の始まり（weekStartsOn）と会計年度の開始月（fiscalYearStartMonth）は、製品が context で渡す。
// - バックエンドへ渡す期間は半開区間 [開始日の 0 時, 終了日の翌日の 0 時) を基本とする（toHalfOpenRange、toInstantRange）。
// - 長さは暦の日数（differenceInCalendarDays）で数え、ミリ秒の差（24 時間）で数えない。

type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6

type PeriodContext = {
  /** 製品が todayIn(timeZone) で求めた今日（ローカル時刻の 0 時） */
  today: Date
  /** 週の始まり。既定は 1（月曜日。Calendar、Date Picker の既定と同じ） */
  weekStartsOn?: WeekStartsOn
  /** 会計年度の開始月（1〜12）。既定は 1（暦年）。4 なら 4 月始まり */
  fiscalYearStartMonth?: number
  /** 集計のタイムゾーン（IANA の名前）。時間別の区間、時刻での比較、toInstantRange に使う */
  timeZone?: string
  /** 集計済みの時刻（エポックからのミリ秒）。この時刻より前のデータは確定している。わからない場合は渡さない */
  asOf?: number
}

/** 年月日だけの期間。from と to の両方を含む */
type DayRange = { from: Date; to: Date }

type RelativePeriodId =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "last-7-days"
  | "last-30-days"
  | "last-90-days"
  | "last-12-months"
  | "this-quarter"
  | "last-quarter"
  | "this-year"
  | "this-fiscal-year"
  | "last-fiscal-year"

/**
 * 分析対象の期間。
 * relative：保存した後も、使う時点の「今日」から解決する（「今月」を保存すると、翌月はその月になる）。
 * absolute：開始日と終了日を固定する。再現性が必要な共有の URL や、報告に使う。
 */
type AnalysisPeriod = { kind: "relative"; id: RelativePeriodId } | { kind: "absolute"; from: DateString; to: DateString }

/** 期間の単位。途中の期間の比較（同経過期間）と、期間の経過の計算に使う */
type PeriodUnit = "day" | "week" | "month" | "quarter" | "year" | "fiscal-year"

type RelativePeriodDefinition = {
  id: RelativePeriodId
  label: string
  /** 期間の単位。過去 N 日などの単位を持たない期間は null */
  unit: PeriodUnit | null
  /** 今日を含み、まだ終わっていない期間か */
  inProgress: boolean
  resolve: (context: Ctx) => DayRange
}

type Ctx = Omit<Required<PeriodContext>, "timeZone" | "asOf"> & Pick<PeriodContext, "timeZone" | "asOf">
const withDefaults = (c: PeriodContext): Ctx => ({ weekStartsOn: 1, fiscalYearStartMonth: 1, ...c })

function startOfQuarterFrom(date: Date, startMonth: number) {
  // 会計年度の開始月を起点にした四半期の始まり（startMonth = 1 なら暦の四半期）
  const offset = (date.getMonth() - (startMonth - 1) + 12) % 3
  return startOfMonth(subMonths(date, offset))
}

function startOfFiscalYear(date: Date, startMonth: number) {
  const offset = (date.getMonth() - (startMonth - 1) + 12) % 12
  return startOfMonth(subMonths(date, offset))
}

const relativePeriods: Record<RelativePeriodId, RelativePeriodDefinition> = {
  today: { id: "today", label: "今日", unit: "day", inProgress: true, resolve: ({ today }) => ({ from: today, to: today }) },
  yesterday: { id: "yesterday", label: "昨日", unit: "day", inProgress: false, resolve: ({ today }) => ({ from: addDays(today, -1), to: addDays(today, -1) }) },
  "this-week": {
    id: "this-week",
    label: "今週",
    unit: "week",
    inProgress: true,
    resolve: ({ today, weekStartsOn }) => ({ from: startOfWeek(today, { weekStartsOn }), to: today }),
  },
  "last-week": {
    id: "last-week",
    label: "先週",
    unit: "week",
    inProgress: false,
    resolve: ({ today, weekStartsOn }) => {
      const from = addDays(startOfWeek(today, { weekStartsOn }), -7)
      return { from, to: addDays(from, 6) }
    },
  },
  "this-month": { id: "this-month", label: "今月", unit: "month", inProgress: true, resolve: ({ today }) => ({ from: startOfMonth(today), to: today }) },
  "last-month": {
    id: "last-month",
    label: "先月",
    unit: "month",
    inProgress: false,
    resolve: ({ today }) => ({ from: startOfMonth(subMonths(today, 1)), to: startOfDay(endOfMonth(subMonths(today, 1))) }),
  },
  "last-7-days": { id: "last-7-days", label: "過去7日間", unit: null, inProgress: true, resolve: ({ today }) => ({ from: addDays(today, -6), to: today }) },
  "last-30-days": { id: "last-30-days", label: "過去30日間", unit: null, inProgress: true, resolve: ({ today }) => ({ from: addDays(today, -29), to: today }) },
  "last-90-days": { id: "last-90-days", label: "過去90日間", unit: null, inProgress: true, resolve: ({ today }) => ({ from: addDays(today, -89), to: today }) },
  "last-12-months": {
    id: "last-12-months",
    label: "過去12か月（先月まで）",
    unit: null,
    inProgress: false,
    // 確定した 12 か月。今月（途中の月）を含めない。
    resolve: ({ today }) => ({ from: startOfMonth(subMonths(today, 12)), to: startOfDay(endOfMonth(subMonths(today, 1))) }),
  },
  "this-quarter": {
    id: "this-quarter",
    label: "今四半期",
    unit: "quarter",
    inProgress: true,
    resolve: ({ today, fiscalYearStartMonth }) => ({ from: startOfQuarterFrom(today, fiscalYearStartMonth), to: today }),
  },
  "last-quarter": {
    id: "last-quarter",
    label: "前四半期",
    unit: "quarter",
    inProgress: false,
    resolve: ({ today, fiscalYearStartMonth }) => {
      const from = subMonths(startOfQuarterFrom(today, fiscalYearStartMonth), 3)
      return { from, to: startOfDay(endOfMonth(addMonths(from, 2))) }
    },
  },
  "this-year": {
    id: "this-year",
    label: "今年",
    unit: "year",
    inProgress: true,
    resolve: ({ today }) => ({ from: makeDate(today.getFullYear(), 1, 1)!, to: today }),
  },
  "this-fiscal-year": {
    id: "this-fiscal-year",
    label: "今年度",
    unit: "fiscal-year",
    inProgress: true,
    resolve: ({ today, fiscalYearStartMonth }) => ({ from: startOfFiscalYear(today, fiscalYearStartMonth), to: today }),
  },
  "last-fiscal-year": {
    id: "last-fiscal-year",
    label: "前年度",
    unit: "fiscal-year",
    inProgress: false,
    resolve: ({ today, fiscalYearStartMonth }) => {
      const from = subMonths(startOfFiscalYear(today, fiscalYearStartMonth), 12)
      return { from, to: addDays(addMonths(from, 12), -1) }
    },
  },
}

/** Date Range Picker の presets に渡す形。「今月」などを押すと、その時点の具体的な期間が入る */
function toDateRangePreset(id: RelativePeriodId, context: Omit<PeriodContext, "today">): DateRangePreset {
  const def = relativePeriods[id]
  return { id: def.id, label: def.label, range: (today, { weekStartsOn }) => def.resolve(withDefaults({ ...context, today, weekStartsOn })) }
}

type ResolvedPeriod =
  | {
      status: "ready"
      range: DayRange
      /** 期間の日数（開始日と終了日を含む） */
      days: number
      /** 今日を含み、まだ終わっていない期間 */
      inProgress: boolean
      /** 期間の単位（同経過期間の比較に使う） */
      unit: PeriodUnit | null
      /** 期間の名前（「今月」）。absolute は null */
      label: string | null
      /**
       * 終了日が今日より後だったため、今日までに切り詰めた。requestedTo は指定された終了日。
       * 未来の日はデータがないため、0 や欠損として集計せず、期間に含めない。
       */
      truncated: boolean
      requestedTo: Date | null
    }
  | { status: "invalid"; reason: "missing" | "invalid-date" | "end-before-start" | "future" | "unknown-period" }

function periodDays(range: DayRange) {
  return differenceInCalendarDays(range.to, range.from) + 1
}

/** 期間を、その時点の具体的な開始日と終了日にする */
function resolvePeriod(period: AnalysisPeriod, context: PeriodContext): ResolvedPeriod {
  const ctx = withDefaults(context)
  if (period.kind === "relative") {
    // 型の上では RelativePeriodId でも、URL などから来た値は未知の id の場合がある。例外にせず不正な期間にする
    const def = Object.prototype.hasOwnProperty.call(relativePeriods, period.id) ? relativePeriods[period.id] : undefined
    if (!def) return { status: "invalid", reason: "unknown-period" }
    const range = def.resolve(ctx)
    return { status: "ready", range, days: periodDays(range), inProgress: def.inProgress, unit: def.unit, label: def.label, truncated: false, requestedTo: null }
  }
  if (!period.from || !period.to) return { status: "invalid", reason: "missing" }
  const from = fromDateString(period.from)
  const to = fromDateString(period.to)
  if (!from || !to) return { status: "invalid", reason: "invalid-date" }
  if (isBeforeDate(to, from)) return { status: "invalid", reason: "end-before-start" }
  // 開始日が未来の期間には、集計できるデータがない。
  if (isBeforeDate(ctx.today, from)) return { status: "invalid", reason: "future" }
  // 終了日が未来の場合は、今日までに切り詰める（未来の日を欠損や 0 として集計しない）。
  const truncated = isBeforeDate(ctx.today, to)
  const range = { from, to: truncated ? ctx.today : to }
  const inProgress = !isBeforeDate(ctx.today, from) && !isBeforeDate(range.to, ctx.today)
  return {
    status: "ready",
    range,
    days: periodDays(range),
    inProgress,
    // 単位は、指定された期間（切り詰める前）で判定する（11/1〜12/31 を、今日までの「今月」として扱わない）。
    unit: naturalUnit({ from, to }, ctx),
    label: null,
    truncated,
    requestedTo: truncated ? to : null,
  }
}

function unitBounds(date: Date, unit: Exclude<PeriodUnit, "day" | "week">, ctx: Ctx): DayRange {
  switch (unit) {
    case "month":
      return { from: startOfMonth(date), to: startOfDay(endOfMonth(date)) }
    case "quarter": {
      const from = startOfQuarterFrom(date, ctx.fiscalYearStartMonth)
      return { from, to: addDays(addMonths(from, 3), -1) }
    }
    case "year":
      return { from: makeDate(date.getFullYear(), 1, 1)!, to: makeDate(date.getFullYear(), 12, 31)! }
    case "fiscal-year": {
      const from = startOfFiscalYear(date, ctx.fiscalYearStartMonth)
      return { from, to: addDays(addMonths(from, 12), -1) }
    }
  }
}

/**
 * 固定の期間が、暦の単位（年、年度、四半期、月）の 1 つと一致するかを調べる。
 * 一致するのは、単位の初日から始まり、単位の最終日で終わる場合（確定した単位）と、
 * 単位の初日から始まり、今日で終わる場合（途中の単位）だけ。9/1〜11/25 や 11/5〜11/20 は単位を持たない（null）。
 * 単位は、同経過期間の比較、期間の全体（目標）、期間の経過に使う。
 */
function naturalUnit(range: DayRange, ctx: Ctx): PeriodUnit | null {
  const units: Exclude<PeriodUnit, "day" | "week">[] = ["year", "fiscal-year", "quarter", "month"]
  for (const unit of units) {
    if (unit === "fiscal-year" && ctx.fiscalYearStartMonth === 1) continue
    const b = unitBounds(range.from, unit, ctx)
    if (b.from.getTime() !== range.from.getTime()) continue
    const complete = toDateString(range.to) === toDateString(b.to)
    const partial = toDateString(range.to) === toDateString(ctx.today) && isBeforeDate(ctx.today, b.to)
    if (complete || partial) return unit
  }
  return null
}

function describeRange(range: DayRange, locale = "ja-JP") {
  return range.from.getTime() === range.to.getTime()
    ? formatDate(range.from, locale)
    : `${formatDate(range.from, locale)}〜${formatDate(range.to, locale)}`
}

// ---------------------------------------------------------------- バックエンドへ渡す期間

/** 半開区間の日付。開始日を含み、end（終了日の翌日）を含まない */
function toHalfOpenRange(range: DayRange): { start: DateString; end: DateString } {
  return { start: toDateString(range.from), end: toDateString(addDays(range.to, 1)) }
}


/**
 * 集計のタイムゾーンでの半開区間 [start, end) を、ISO 8601 の時刻（時差付き）で返す。
 * 例：2026/11/01〜2026/11/30、Asia/Tokyo → start "2026-11-01T00:00:00+09:00"、end "2026-12-01T00:00:00+09:00"
 * 不正なタイムゾーンと、タイムゾーンに存在しない日付は RangeError（誤った時刻に変換しない）。
 */
function toInstantRange(range: DayRange, timeZone: string) {
  const { start, end } = toHalfOpenRange(range)
  const s = zonedStartOfDay(start, timeZone)
  const e = zonedStartOfDay(end, timeZone)
  return { start: isoWithOffset(s, timeZone), end: isoWithOffset(e, timeZone), startEpoch: s, endEpoch: e, timeZone }
}

// ---------------------------------------------------------------- 集計単位

type Granularity = "hour" | "day" | "week" | "month" | "quarter" | "year"

const granularityLabels: Record<Granularity, string> = {
  hour: "時間別",
  day: "日別",
  week: "週別",
  month: "月別",
  quarter: "四半期別",
  year: "年別",
}

const granularityOrder: Granularity[] = ["hour", "day", "week", "month", "quarter", "year"]

/**
 * 区間の状態。
 * complete：確定した区間。in-progress：集計の途中の区間（今日を含む、または集計済みの時刻を含む）。
 * future：まだ始まっていない区間（データがない）。unknown：今日の時間別の区間で、集計済みの時刻（asOf）がわからないもの
 */
type BucketStatus = "complete" | "in-progress" | "future" | "unknown"

type Bucket = {
  /** 区間の識別子。日以上は開始日（"2026-11-01"）、時間別は開始の時刻（"2026-11-01T01:00:00-04:00"） */
  key: string
  /** 区間の開始日と終了日（両方を含む）。期間の境界で切られた場合は、期間の中の部分だけ */
  from: Date
  to: Date
  /** 時間別の区間のローカル時刻の時（0〜23）。それ以外は null */
  hour: number | null
  /** 区間の実際の開始と終了の時刻（エポックからのミリ秒、半開区間）。context.timeZone がある場合だけ */
  start: number | null
  end: number | null
  /** 区間の開始の UTC からの時差（分）。context.timeZone がある場合だけ */
  offsetMinutes: number | null
  /** 区間の長さ。日以上は日数、時間別は分（durationMinutes） */
  days: number
  durationMinutes: number | null
  /** 短い名前（「11/3」「11月」「Q3」「1時」） */
  label: string
  /** 長い名前（「2026/11/03の週」「2026年11月」「2026/11/01 1時（GMT-4）」） */
  fullLabel: string
  /** 期間の境界で区間が切られ、区間の全体を含まない（週の途中から始まる期間など）。時間別では、夏時間で 60 分でない区間 */
  partial: boolean
  status: BucketStatus
  /** status === "in-progress" */
  inProgress: boolean
  /** status === "future" */
  future: boolean
  /** 区間の集計単位 */
  granularity: Granularity
  /** 区間の単位の本来の開始日（期間の境界で切られる前。週の始まり、会計年度の四半期の始まりなど）。時間別はその日 */
  unitStart: Date
}

function startOfUnit(date: Date, g: Granularity, ctx: Ctx) {
  switch (g) {
    case "week":
      return startOfWeek(date, { weekStartsOn: ctx.weekStartsOn })
    case "month":
      return startOfMonth(date)
    case "quarter":
      return startOfQuarterFrom(date, ctx.fiscalYearStartMonth)
    case "year":
      return startOfFiscalYear(date, ctx.fiscalYearStartMonth)
    default:
      return startOfDay(date)
  }
}

function nextUnit(date: Date, g: Granularity) {
  switch (g) {
    case "week":
      return addDays(date, 7)
    case "month":
      return addMonths(date, 1)
    case "quarter":
      return addMonths(date, 3)
    case "year":
      return addMonths(date, 12)
    default:
      return addDays(date, 1)
  }
}

function bucketLabel(from: Date, g: Granularity, ctx: Ctx) {
  const y = from.getFullYear()
  const m = from.getMonth() + 1
  const d = from.getDate()
  switch (g) {
    case "day":
      return { label: `${m}/${d}`, fullLabel: formatDate(from) }
    case "week":
      return { label: `${m}/${d}〜`, fullLabel: `${formatDate(from)}の週` }
    case "month":
      return { label: `${m}月`, fullLabel: `${y}年${m}月` }
    case "quarter": {
      const fy = startOfFiscalYear(from, ctx.fiscalYearStartMonth)
      const q = Math.floor(((from.getMonth() - fy.getMonth() + 12) % 12) / 3) + 1
      const prefix = ctx.fiscalYearStartMonth === 1 ? `${fy.getFullYear()}年` : `${fy.getFullYear()}年度`
      return { label: `Q${q}`, fullLabel: `${prefix} Q${q}` }
    }
    case "year":
      return ctx.fiscalYearStartMonth === 1 ? { label: `${y}年`, fullLabel: `${y}年` } : { label: `${y}年度`, fullLabel: `${y}年度` }
    default:
      return { label: `${m}/${d}`, fullLabel: formatDate(from) }
  }
}

// 日以上の区間の状態。集計済みの時刻があれば時刻で、なければ今日との関係で判定する（今日を含む区間は途中）。
function dayBucketStatus(from: Date, to: Date, start: number | null, end: number | null, ctx: Ctx): BucketStatus {
  if (ctx.asOf !== undefined && start !== null && end !== null) return end <= ctx.asOf ? "complete" : start >= ctx.asOf ? "future" : "in-progress"
  if (isBeforeDate(ctx.today, from)) return "future"
  if (isBeforeDate(to, ctx.today)) return "complete"
  return "in-progress"
}

/**
 * 期間を集計単位の区間に分ける。
 * - 日以上：期間の境界で切られた区間は partial。context.timeZone があれば、実際の開始と終了の時刻（半開区間）も持つ。
 * - 時間別：context.timeZone が必要（ない場合と不正な場合は RangeError）。ローカル時刻の時で区切った実際の区間
 *   （夏時間の開始日は 23 区間、終了日は 25 区間）。今日の区間の状態は、asOf がなければ unknown。
 */
function buildBuckets(range: DayRange, granularity: Granularity, context: PeriodContext): Bucket[] {
  const ctx = withDefaults(context)
  const tz = ctx.timeZone
  const out: Bucket[] = []
  if (granularity === "hour") {
    if (!isValidTimeZone(tz)) throw new RangeError(`時間別の区間には、有効なタイムゾーンが必要です（${String(tz)}）`)
    for (let day = range.from; !isBeforeDate(range.to, day); day = addDays(day, 1)) {
      const date = toDateString(day)
      for (const s of hourSlotsOf(date, tz)) {
        const offset = offsetLabel(s.local.offsetMinutes)
        const hm = `${s.local.hour}時${s.local.minute ? `${s.local.minute}分` : ""}`
        let status: BucketStatus
        if (ctx.asOf !== undefined) status = s.end <= ctx.asOf ? "complete" : s.start >= ctx.asOf ? "future" : "in-progress"
        else if (isBeforeDate(day, ctx.today)) status = "complete"
        else if (isBeforeDate(ctx.today, day)) status = "future"
        else status = "unknown"
        out.push({
          key: isoWithOffset(s.start, tz),
          granularity: "hour",
          unitStart: day,
          from: day,
          to: day,
          hour: s.local.hour,
          start: s.start,
          end: s.end,
          offsetMinutes: s.local.offsetMinutes,
          days: 1,
          durationMinutes: s.durationMinutes,
          // 同じ時刻が 2 回ある日（夏時間の終了日）は、時差で区別する
          label: s.repeated ? `${hm}（${offset}）` : hm,
          fullLabel: `${formatDate(day)} ${hm}（${offset}）`,
          partial: s.durationMinutes !== 60,
          status,
          inProgress: status === "in-progress",
          future: status === "future",
        })
      }
    }
    return out
  }
  for (let start = startOfUnit(range.from, granularity, ctx); !isBeforeDate(range.to, start); start = nextUnit(start, granularity)) {
    const end = addDays(nextUnit(start, granularity), -1)
    const from = isBeforeDate(start, range.from) ? range.from : start
    const to = isBeforeDate(range.to, end) ? range.to : end
    const instant = isValidTimeZone(tz) ? toInstantRange({ from, to }, tz) : null
    const status = dayBucketStatus(from, to, instant?.startEpoch ?? null, instant?.endEpoch ?? null, ctx)
    out.push({
      key: toDateString(from),
      granularity,
      unitStart: start,
      from,
      to,
      hour: null,
      start: instant?.startEpoch ?? null,
      end: instant?.endEpoch ?? null,
      offsetMinutes: null,
      days: periodDays({ from, to }),
      durationMinutes: null,
      ...bucketLabel(start, granularity, ctx),
      partial: from.getTime() !== start.getTime() || to.getTime() !== end.getTime(),
      status,
      inProgress: status === "in-progress",
      future: status === "future",
    })
  }
  return out
}

/** 区間の数。時間別は、タイムゾーンでの実際の区間の数（夏時間の日は 23 や 25） */
function countBuckets(range: DayRange, granularity: Granularity, context: PeriodContext) {
  if (granularity === "hour") {
    const tz = context.timeZone
    if (!isValidTimeZone(tz)) return 0
    let n = 0
    for (let day = range.from; !isBeforeDate(range.to, day); day = addDays(day, 1)) n += hourSlotsOf(toDateString(day), tz).length
    return n
  }
  return buildBuckets(range, granularity, context).length
}

/**
 * 期間に対して使える集計単位。区間の数が 2 以上、maxBuckets（既定 400）以下のもの。
 * 時間別は、有効なタイムゾーンがあり、7 日以内の期間に限る（区間の数は実際の数で判定する）。1 日だけの期間では日別も使える。
 */
function availableGranularities(range: DayRange, context: PeriodContext, { maxBuckets = 400 } = {}): Granularity[] {
  const days = periodDays(range)
  const list = granularityOrder.filter((g) => {
    if (g === "hour") {
      if (days > 7 || !isValidTimeZone(context.timeZone)) return false
      const n = countBuckets(range, "hour", context)
      return n >= 2 && n <= maxBuckets
    }
    if (g === "day" && days === 1) return true
    const n = countBuckets(range, g, context)
    return n >= 2 && n <= maxBuckets
  })
  return list.length ? list : ["day"]
}

/**
 * 期間の長さから決める集計単位の初期値（目安）。
 * 1 日：時間別（タイムゾーンがない場合は日別）。2〜62 日：日別。63〜92 日：週別。それより長い：月別。
 */
function defaultGranularity(range: DayRange, context: PeriodContext): Granularity {
  const days = periodDays(range)
  const pick: Granularity = days <= 1 ? "hour" : days <= 62 ? "day" : days <= 92 ? "week" : "month"
  const available = availableGranularities(range, context)
  return available.includes(pick) ? pick : available.includes("day") ? "day" : available[0]
}

type GranularityAdjustment = { from: Granularity; to: Granularity } | null

/**
 * 期間を変えたときの集計単位。
 * - 自動（manual が false）：新しい期間の初期値にする
 * - 手動で選んだ単位：新しい期間でも使えるなら維持する。使えない場合だけ初期値に変え、adjustment で知らせる
 */
function reconcileGranularity({
  current,
  manual,
  range,
  context,
}: {
  current: Granularity
  manual: boolean
  range: DayRange
  context: PeriodContext
}): { granularity: Granularity; adjustment: GranularityAdjustment } {
  if (!manual) return { granularity: defaultGranularity(range, context), adjustment: null }
  const available = availableGranularities(range, context)
  if (available.includes(current)) return { granularity: current, adjustment: null }
  const next = defaultGranularity(range, context)
  return { granularity: next, adjustment: { from: current, to: next } }
}

// ---------------------------------------------------------------- 比較期間

type ComparisonMode = "none" | "previous-period" | "previous-month" | "previous-quarter" | "previous-year" | "custom"

const comparisonLabels: Record<ComparisonMode, string> = {
  none: "比較しない",
  "previous-period": "直前の同じ長さの期間",
  "previous-month": "前月",
  "previous-quarter": "前四半期",
  "previous-year": "前年同期",
  custom: "期間を指定",
}

/**
 * 比較の方式。指標に合う方式を製品が選ぶ（すべての指標に同じ方式を強制しない）。
 * - calendar：暦の期間どうし（10 月の全体と 9 月の全体）。途中の期間に使うと、途中の実績を比較期間の全体と比べる（fair: false）
 * - elapsed-days：同じ経過日数（11/1〜25 の 25 日間と、前月の初日から 25 日間）。期間の途中の累積（売上、新規の契約）の既定
 * - elapsed-time：同じ経過時間。context.asOf と timeZone が必要（11/25 14:30 までと、前月の同じ経過の時刻まで）
 * - weekday：曜日をそろえる（7 日の倍数だけずらす）。曜日で変動する指標
 * - business-days：同じ営業日数。営業日の判定（businessCalendar）は製品が渡す
 * - point-in-time：時点の値（MRR、契約企業数）。期間の最終日（またはその比較の日）の 1 日だけを返す
 */
type ComparisonBasis = "calendar" | "elapsed-days" | "elapsed-time" | "weekday" | "business-days" | "point-in-time"

const comparisonBasisLabels: Record<ComparisonBasis, string> = {
  calendar: "暦の期間",
  "elapsed-days": "同じ経過日数",
  "elapsed-time": "同じ経過時間",
  weekday: "同じ曜日",
  "business-days": "同じ営業日数",
  "point-in-time": "同じ時点",
}

/** 営業日の判定（製品の営業日のカレンダー） */
type BusinessCalendar = { isBusinessDay: (date: Date) => boolean }

type ComparisonRange =
  | {
      status: "ready"
      mode: Exclude<ComparisonMode, "none">
      basis: ComparisonBasis
      range: DayRange
      days: number
      /** 互換のための分類。same-elapsed（同じ経過）、full（暦の期間の全体）、shifted（日付をずらした期間） */
      alignment: "same-elapsed" | "full" | "shifted"
      /** 存在しない日付（31 日、2/29）を月末に合わせた */
      adjusted: boolean
      /** 比較期間が、求めた長さより短い（比較先の月が短い、営業日が足りない） */
      truncated: boolean
      /**
       * 公平な比較か。false の場合は reason に理由（途中の期間を比較期間の全体と比べている など）。
       * 製品は、増減を評価として示す前に確かめる
       */
      fair: boolean
      reason: string | null
      /** 比較期間の説明（調整や切り詰めの理由）。ない場合は null */
      note: string | null
      /** elapsed-time の場合の、実際の時刻の半開区間 */
      instant: { start: number; end: number } | null
    }
  | { status: "none" }
  | { status: "invalid"; reason: "missing" | "end-before-start" | "overlap" | "future" | "unknown-mode" | "no-business-days" | "as-of-required" | "invalid-time-zone" | "business-calendar-required" }

// 月をずらし、存在しない日（31 日、2/29）は月末に合わせる。
function shiftMonthsClamped(date: Date, months: number) {
  const target = addMonths(startOfMonth(date), months)
  const last = endOfMonth(target).getDate()
  const day = Math.min(date.getDate(), last)
  return { date: makeDate(target.getFullYear(), target.getMonth() + 1, day)!, clamped: day !== date.getDate() }
}

function isMonthEnd(date: Date) {
  return date.getDate() === endOfMonth(date).getDate()
}

// 比較期間が分析の対象の期間と重なる場合（9/1〜11/25 の前月 8/1〜10/25 など）は、同じ日を両方で数えるため比較できない。
function rejectOverlap(result: ComparisonRange, range: DayRange): ComparisonRange {
  if (result.status !== "ready") return result
  const overlaps = !isBeforeDate(result.range.to, range.from) && !isBeforeDate(range.to, result.range.from)
  return overlaps ? { status: "invalid", reason: "overlap" } : result
}

type ComparisonArgs = {
  period: Extract<ResolvedPeriod, { status: "ready" }>
  mode: ComparisonMode
  /** mode が custom の場合の期間 */
  custom?: DayRange | null
  /** 比較の方式。省略すると、途中の単位の期間は elapsed-days、それ以外は calendar */
  basis?: ComparisonBasis
  /** elapsed-time、business-days に必要な値（timeZone、asOf） */
  context?: PeriodContext
  businessCalendar?: BusinessCalendar
}

/**
 * 比較期間を決める。どの方式でも、比較期間が分析の対象と重なる場合は invalid（overlap）。
 * 比較先が短く、求めた長さに届かない場合は truncated と note で示す（月をずらすだけで同じ経過日数になるとは判断しない）。
 */
function comparisonRange(args: ComparisonArgs): ComparisonRange {
  return markTodayIncomplete(rejectOverlap(comparisonRangeRaw(args), args.period.range), args)
}

/**
 * 分析の対象に今日を含み、今日のデータが確定しているとわからない場合（集計済みの時刻 asOf がない、または今日の終わりより前）、
 * 今日の途中までの値と、比較期間の確定した値を比べることになる。公平な比較としない（fair: false と理由）。
 * elapsed-time（同じ経過時間）は、集計済みの時刻までを比べるため対象外。
 */
function markTodayIncomplete(result: ComparisonRange, { period, basis, context }: ComparisonArgs): ComparisonRange {
  if (result.status !== "ready" || result.basis === "elapsed-time" || basis === "elapsed-time") return result
  const tz = context?.timeZone
  const asOf = context?.asOf
  const today = context?.today
  const includesToday = today ? !isBeforeDate(period.range.to, today) && !isBeforeDate(today, period.range.from) : period.inProgress
  let incomplete: boolean
  if (asOf !== undefined && isValidTimeZone(tz)) {
    // 集計済みの時刻が、分析の対象の終わり（終了日の翌日の 0 時）より前なら、対象の一部が未集計（昨日を含む期間でも同じ）
    incomplete = nextDayStart(toDateString(period.range.to), tz) > asOf
  } else {
    // 集計済みの時刻がわからない場合は、今日を含む期間を未確定とする。context.today がない場合は、期間の inProgress で判断する
    incomplete = includesToday
  }
  if (!incomplete) return result
  return {
    ...result,
    fair: false,
    reason:
      result.reason ??
      (includesToday
        ? "今日のデータは集計の途中のため、比較期間の確定した値と公平に比べられません（集計済みの時刻を渡すと、同じ経過時間で比べられます）"
        : "分析の対象の終わりまで集計が済んでいないため、比較期間の確定した値と公平に比べられません"),
  }
}

// 途中の期間（今日を含む期間、未来の終了日を今日までに切り詰めた期間）は、同じ経過日数で比べる。確定した期間は暦の期間で比べる。
function defaultBasis(period: Extract<ResolvedPeriod, { status: "ready" }>): ComparisonBasis {
  return period.inProgress ? "elapsed-days" : "calendar"
}

function ready(
  r: Omit<Extract<ComparisonRange, { status: "ready" }>, "status" | "days" | "instant" | "fair" | "reason" | "truncated" | "adjusted" | "note"> &
    Partial<Pick<Extract<ComparisonRange, { status: "ready" }>, "instant" | "fair" | "reason" | "truncated" | "adjusted" | "note">>
): ComparisonRange {
  return {
    status: "ready",
    days: periodDays(r.range),
    instant: null,
    fair: true,
    reason: null,
    truncated: false,
    adjusted: false,
    note: null,
    ...r,
  }
}

function comparisonRangeRaw({ period, mode, custom, basis: basisArg, context, businessCalendar }: ComparisonArgs): ComparisonRange {
  const { range, days, inProgress } = period
  if (mode === "none") return { status: "none" }
  // 型の上では ComparisonMode でも、URL などから来た値は未知の場合がある。直前の期間などとして扱わない
  if (!Object.prototype.hasOwnProperty.call(comparisonLabels, mode)) return { status: "invalid", reason: "unknown-mode" }
  const basis = basisArg ?? defaultBasis(period)
  if (mode === "custom") {
    if (!custom || !isValidDate(custom.from) || !isValidDate(custom.to)) return { status: "invalid", reason: "missing" }
    if (isBeforeDate(custom.to, custom.from)) return { status: "invalid", reason: "end-before-start" }
    // 今日より後の日を含む比較期間には、集計できるデータがない
    if (context?.today && isBeforeDate(context.today, custom.to)) return { status: "invalid", reason: "future" }
    const d = periodDays(custom)
    return ready({
      mode,
      basis,
      range: custom,
      alignment: "shifted",
      fair: d === days || basis === "point-in-time",
      reason: d !== days ? "比較期間と分析の対象の日数が異なります" : null,
      note: d !== days ? `比較期間は ${d} 日間（分析の対象は ${days} 日間）` : null,
    })
  }

  // 比較先の開始日（暦でずらす）と、比較先の単位の終わり（同じ経過で切り詰めるときの上限）
  const months = mode === "previous-month" ? 1 : mode === "previous-quarter" ? 3 : mode === "previous-year" ? 12 : 0
  const shiftDate = (d: Date) => (months ? shiftMonthsClamped(d, -months) : { date: addDays(d, -days), clamped: false })
  const from = shiftDate(range.from)
  const unitEnd = (() => {
    if (!months) return null
    const u = period.unit
    if (u === "month" || u === "quarter" || u === "year" || u === "fiscal-year") {
      const span = u === "month" ? 1 : u === "quarter" ? 3 : 12
      return addDays(addMonths(startOfMonth(from.date), span), -1)
    }
    return null
  })()
  const capTo = (to: Date) => (unitEnd && isBeforeDate(unitEnd, to) ? { to: unitEnd, capped: true } : { to, capped: false })

  switch (basis) {
    case "point-in-time": {
      // 時点の指標：期間の最終日と、比較の日（暦でずらした最終日）
      const point = months ? shiftMonthsClamped(range.to, -months) : { date: addDays(range.from, -1), clamped: false }
      return ready({
        mode,
        basis,
        range: { from: point.date, to: point.date },
        alignment: "shifted",
        adjusted: point.clamped,
        note: point.clamped ? `${formatDate(range.to)} に対応する日がないため、${formatDate(point.date)} の時点と比べます` : null,
      })
    }
    case "weekday": {
      // 曜日をそろえる：暦でずらした日数に最も近い 7 の倍数だけずらす（前年同期は 364 日）。
      const calendarShift = differenceInCalendarDays(from.date, range.from)
      let shift = months ? Math.round(calendarShift / 7) * 7 : -Math.ceil(days / 7) * 7
      // 分析の対象と重なる場合（31 日間の前月など）は、重ならなくなるまでさらに 7 日ずつ前にずらす
      while (addDays(range.to, shift).getTime() >= range.from.getTime()) shift -= 7
      // 暦でずらした日数より 7 日を超えて前にずらす場合（85 日間の期間の前月を 91 日前にする、など）は、
      // 前月・前四半期・前年同期の比較ではなくなる。比較の意味を変えず、重なりとして比較できないことにする
      if (months && -shift > -calendarShift + 7) return { status: "invalid", reason: "overlap" }
      const r = { from: addDays(range.from, shift), to: addDays(range.to, shift) }
      return ready({ mode, basis, range: r, alignment: "shifted", note: `曜日をそろえるため、${-shift} 日前の期間と比べます` })
    }
    case "business-days": {
      if (!businessCalendar) return { status: "invalid", reason: "business-calendar-required" }
      let target = 0
      for (let d = range.from; !isBeforeDate(range.to, d); d = addDays(d, 1)) if (businessCalendar.isBusinessDay(d)) target++
      // 分析の対象に営業日がない場合は、同じ営業日数の比較期間を決められない（営業日の 1 日と比べない）
      if (target === 0) return { status: "invalid", reason: "no-business-days" }
      let n = 0
      let end = addDays(from.date, -1)
      const limit = unitEnd ?? addDays(from.date, days * 3 + 31)
      for (let d = from.date; n < target && !isBeforeDate(limit, d); d = addDays(d, 1)) {
        if (businessCalendar.isBusinessDay(d)) n++
        end = d
      }
      const truncated = n < target
      return ready({
        mode,
        basis,
        range: { from: from.date, to: isBeforeDate(end, from.date) ? from.date : end },
        alignment: inProgress ? "same-elapsed" : "shifted",
        truncated,
        fair: !truncated,
        reason: truncated ? `比較先の営業日が ${n} 日しかありません（分析の対象は ${target} 日）` : null,
        note: truncated ? `比較先の営業日が ${n} 日のため、${n} 日分と比べます` : `同じ営業日数（${target} 日）で比べます`,
      })
    }
    case "elapsed-time": {
      const tz = context?.timeZone
      if (tz !== undefined && !isValidTimeZone(tz)) return { status: "invalid", reason: "invalid-time-zone" }
      if (context?.asOf === undefined || !isValidTimeZone(tz)) return { status: "invalid", reason: "as-of-required" }
      const start = zonedStartOfDay(toDateString(range.from), tz)
      const elapsed = Math.max(0, Math.min(context.asOf, zonedStartOfDay(toDateString(addDays(range.to, 1)), tz)) - start)
      const bStart = zonedStartOfDay(toDateString(from.date), tz)
      const cap = unitEnd ? zonedStartOfDay(toDateString(addDays(unitEnd, 1)), tz) : Infinity
      const bEnd = Math.min(bStart + elapsed, cap)
      const truncated = bEnd < bStart + elapsed
      // 集計済みの時刻が分析の対象の始まり以前（経過時間が 0）の場合は、比べる時間がない。長さ 0 の区間どうしを公平な比較としない
      if (elapsed === 0) {
        return ready({
          mode,
          basis,
          range: { from: from.date, to: from.date },
          alignment: "same-elapsed",
          fair: false,
          reason: "集計済みの時刻が分析の対象の始まり以前のため、比べる経過時間がありません",
          instant: { start: bStart, end: bStart },
          note: `${isoWithOffset(bStart, tz)} から ${isoWithOffset(bStart, tz)} まで（経過時間 0）`,
        })
      }
      // 終了の時刻を含む日（半開区間の終わりが 0 時ちょうどなら、その前日）
      const lastDay = (() => {
        const iso = isoWithOffset(bEnd - 1, tz).slice(0, 10)
        return fromDateString(iso)!
      })()
      return ready({
        mode,
        basis,
        range: { from: from.date, to: isBeforeDate(lastDay, from.date) ? from.date : lastDay },
        alignment: "same-elapsed",
        truncated,
        fair: !truncated,
        reason: truncated ? "比較先の期間が、同じ経過時間より短くなります" : null,
        instant: { start: bStart, end: bEnd },
        note: `${isoWithOffset(bStart, tz)} から ${isoWithOffset(bEnd, tz)} まで（同じ経過時間）`,
      })
    }
    case "elapsed-days": {
      // 同じ経過日数：比較先の開始日から、同じ日数。比較先の単位が短い場合は単位の終わりで切り詰める。
      const want = addDays(from.date, days - 1)
      const { to, capped } = capTo(want)
      const d = periodDays({ from: from.date, to })
      return ready({
        mode,
        basis,
        range: { from: from.date, to },
        alignment: inProgress ? "same-elapsed" : "shifted",
        adjusted: from.clamped,
        truncated: capped,
        fair: !capped,
        reason: capped ? `比較先は ${d} 日間しかありません（分析の対象は ${days} 日間）` : null,
        note: capped ? `比較先は ${formatDate(to)} までの ${d} 日間です（分析の対象は ${days} 日間）` : null,
      })
    }
    case "calendar":
    default: {
      if (!months) {
        // 直前の同じ長さの期間（開始日の前日で終わる）
        return ready({ mode, basis, range: { from: from.date, to: addDays(range.from, -1) }, alignment: "shifted" })
      }
      const wholeMonths = range.from.getDate() === 1 && isMonthEnd(range.to) && !inProgress
      // 途中の期間を暦の期間で比べるのは、期間が暦の単位（今月など）の場合だけ。比較期間の全体と比べる（fair: false）
      if (wholeMonths || (inProgress && unitEnd)) {
        // 暦の期間どうし。途中の期間では、比較期間の全体と比べることになる（fair: false）
        const lastMonth = inProgress ? (unitEnd ?? startOfDay(endOfMonth(shiftMonthsClamped(range.to, -months).date))) : startOfDay(endOfMonth(shiftMonthsClamped(range.to, -months).date))
        const r = { from: from.date, to: lastMonth }
        const d = periodDays(r)
        return ready({
          mode,
          basis,
          range: r,
          alignment: "full",
          fair: !inProgress,
          reason: inProgress ? "途中の期間を、比較期間の全体と比べています" : null,
          note: d !== days && !inProgress ? `暦の月の日数が異なります（${days} 日間と ${d} 日間）` : inProgress ? `比較期間は ${d} 日間の全体です（分析の対象は ${days} 日間の途中）` : null,
        })
      }
      const to = shiftMonthsClamped(range.to, -months)
      const adjusted = from.clamped || to.clamped
      // 月をずらした期間は、月末に合わせた場合や月末をまたぐ場合に日数が変わる（3/1〜3/30 の前月は 2/1〜2/28）。
      // 期間の合計の指標を日数の異なる期間と比べると、日数の差が増減に含まれるため、公平な比較としない。
      // 時点の指標（point-in-time）は上の分岐で扱い、この判定の対象にしない。
      const r = { from: from.date, to: to.date }
      const d = periodDays(r)
      const sameLength = d === days
      const adjustNote = adjusted ? `${formatDate(range.to)} に対応する日がないため、${formatDate(to.date)} までと比べます` : null
      return ready({
        mode,
        basis,
        range: r,
        alignment: "shifted",
        adjusted,
        truncated: d < days,
        fair: sameLength,
        reason: sameLength ? null : `比較期間と分析の対象の日数が異なります（分析の対象は ${days} 日間、比較期間は ${d} 日間）`,
        note: sameLength ? adjustNote : [adjustNote, `比較期間は ${d} 日間です（分析の対象は ${days} 日間）`].filter(Boolean).join("。"),
      })
    }
  }
}

/**
 * 期間の経過。期間の全体（今月なら 11/1〜11/30）と今日から、経過した日数と割合を求める。
 * 目標の達成率と区別して示すために使う。elapsedDays は今日を含む。今日のデータが確定しているかはわからないため、
 * 確定した日数（completeDays）は、todayComplete が true の場合だけ今日を含める。
 */
function getPeriodElapsed(full: DayRange, today: Date, { todayComplete = false }: { todayComplete?: boolean } = {}) {
  const total = periodDays(full)
  const elapsed = isBeforeDate(today, full.from) ? 0 : isBeforeDate(full.to, today) ? total : periodDays({ from: full.from, to: today })
  const todayInside = !isBeforeDate(today, full.from) && !isBeforeDate(full.to, today)
  const completeDays = todayInside && !todayComplete ? elapsed - 1 : elapsed
  return { elapsedDays: elapsed, completeDays, totalDays: total, ratio: elapsed / total, todayInProgress: todayInside && !todayComplete }
}

/**
 * 期間の単位の全体（「今月」の 11/1〜11/25 に対する 11/1〜11/30）。
 * 期間が暦の単位と一致しない場合（9/1〜11/25、過去 90 日間など）は null。目標と期間の経過は、この値がある場合だけ示す。
 */
function fullPeriodOf(period: Extract<ResolvedPeriod, { status: "ready" }>, context: PeriodContext): DayRange | null {
  const ctx = withDefaults(context)
  const { range, unit } = period
  if (unit === null) return null
  if (unit === "day") return range
  if (unit === "week") {
    const from = startOfWeek(range.from, { weekStartsOn: ctx.weekStartsOn })
    return { from, to: addDays(from, 6) }
  }
  return unitBounds(range.from, unit, ctx)
}

// ---------------------------------------------------------------- 区間の位置合わせ

/**
 * 区間の対応付けの方法。
 * - position：区間の順番（1 番目どうし）。同じ長さの区間が並ぶ場合（日別の同経過期間）に使う
 * - elapsed：期間の開始からの経過。日別は暦の日の差、週別は何週目、月以上は何番目、時間別は実際の経過時間（分）。
 *   長さの異なる区間（週の途中から始まる最初の週）は対応付けても comparable にしない
 * - calendar：暦の位置（日別は日、月別は月、四半期別は Q、時間別はローカル時刻の時とその日の何回目か）。暦の月の全体どうしの比較など
 */
type AlignBy = "position" | "elapsed" | "calendar"

type AlignedRow = {
  /** 対応付けのキー（position は番号、elapsed は経過、calendar は暦の位置） */
  key: string
  current: Bucket | null
  baseline: Bucket | null
  /** 数値として比べてよいか。対応付けられたことと、比べてよいことは別 */
  comparable: boolean
  /** 比べられない理由 */
  reason: string | null
}

// 暦の位置のキー。期間の最初の区間からの、暦の単位の番号を含める（2 か月以上の日別、2 年の月別でもキーが重複しない）。
// 暦の位置のキー。区間の単位の本来の開始日（unitStart）が、最初の区間の単位の開始日から何単位目かで表す。
// 週の始まり（weekStartsOn）、会計年度の始まりの月、期間の途中から始まる最初の区間に関係なく、区間ごとに一意になる。
function calendarKey(b: Bucket, first: Bucket, occurrence: number) {
  const months = (b.unitStart.getFullYear() - first.unitStart.getFullYear()) * 12 + (b.unitStart.getMonth() - first.unitStart.getMonth())
  switch (b.granularity) {
    case "hour":
      return `h${differenceInCalendarDays(b.from, first.from)}:${b.hour}#${occurrence}`
    case "week":
      return `w${Math.round(differenceInCalendarDays(b.unitStart, first.unitStart) / 7)}`
    case "month":
      return `m${months}`
    case "quarter":
      return `q${Math.round(months / 3)}`
    case "year":
      return `y${Math.round(months / 12)}`
    default:
      return `d${months}:${b.unitStart.getDate()}`
  }
}

// 区間の長さ。実際の時刻（start、end）がある場合はその差（夏時間で 23 時間の日を区別する）、なければ日数か分
function bucketLength(b: Bucket) {
  if (b.start !== null && b.end !== null) return b.end - b.start
  return b.durationMinutes !== null ? b.durationMinutes : b.days
}

/**
 * 現在の期間と比較期間の区間を対応付ける。対応付けた行ごとに、数値として比べてよいか（comparable）を示す。
 * 比べられないのは、片方の区間がない、区間の長さが異なる（期間の一部、夏時間、月の日数）、現在の区間が途中・未来・不明の場合。
 * 欠損の値を 0 で埋めず、比べられない行に増減率を求めない（値の欠損は製品が判定する）。
 * 長さの異なる区間の比較に意味がある場合（暦の月の全体どうし）は、allowDifferentLength を true にする。
 */
function alignBuckets(
  current: Bucket[],
  baseline: Bucket[],
  { by = "position", allowDifferentLength = false }: { by?: AlignBy; allowDifferentLength?: boolean } = {}
): AlignedRow[] {
  const seen = new Map<string, number>()
  const keyOf = (list: Bucket[], b: Bucket, i: number) => {
    if (by === "position") return String(i)
    const first = list[0]
    if (by === "calendar") {
      const id = `${list === current ? "c" : "b"}:${toDateString(b.from)}:${b.hour}`
      const n = (seen.get(id) ?? 0) + 1
      seen.set(id, n)
      return calendarKey(b, first, n)
    }
    // 経過：時間別は期間の始まりからの実際の時間（分）、週は何週目、月以上は何番目、日は暦の日の差。
    // 単位は区間の granularity で判定する（表示の名前 fullLabel から推測しない。名前はロケールや製品で変わりうる）
    if (b.granularity === "hour" && b.start !== null && first.start !== null) return `t${Math.round((b.start - first.start) / 60000)}`
    if (b.granularity === "week") return `w${i}`
    if (b.granularity === "month" || b.granularity === "quarter" || b.granularity === "year") return `u${i}`
    return `d${differenceInCalendarDays(b.from, first.from)}`
  }
  const rows = new Map<string, AlignedRow>()
  const order: string[] = []
  const add = (list: Bucket[], side: "current" | "baseline") =>
    list.forEach((b, i) => {
      const key = keyOf(list, b, i)
      // 同じ側でキーが重複する場合は、行を上書きせずに RangeError にする（対応付けの誤り）
      if (rows.get(key)?.[side]) throw new RangeError(`alignBuckets: 区間のキーが重複しています（${key}）`)
      if (!rows.has(key)) {
        rows.set(key, { key, current: null, baseline: null, comparable: false, reason: null })
        order.push(key)
      }
      rows.get(key)![side] = b
    })
  add(current, "current")
  add(baseline, "baseline")
  return order.map((k) => {
    const r = rows.get(k)!
    let reason: string | null = null
    if (!r.current) reason = "現在の期間に対応する区間がありません"
    else if (!r.baseline) reason = "比較期間に対応する区間がありません"
    else if (r.current.status === "future") reason = "まだ始まっていない区間です"
    else if (r.current.status === "unknown") reason = "集計済みの時刻がわからない区間です"
    else if (r.current.status === "in-progress") reason = "集計の途中の区間です"
    else if (r.baseline.status !== "complete") reason = "比較期間の区間が確定していません"
    else if (!allowDifferentLength && bucketLength(r.current) !== bucketLength(r.baseline)) reason = "区間の長さが異なります"
    return { ...r, comparable: reason === null, reason }
  })
}

export {
  alignBuckets,
  availableGranularities,
  buildBuckets,
  comparisonBasisLabels,
  comparisonLabels,
  comparisonRange,
  countBuckets,
  defaultBasis,
  defaultGranularity,
  describeRange,
  fullPeriodOf,
  getPeriodElapsed,
  granularityLabels,
  granularityOrder,
  hoursInDay,
  periodDays,
  reconcileGranularity,
  relativePeriods,
  resolvePeriod,
  toDateRangePreset,
  toHalfOpenRange,
  toInstantRange,
  zonedStartOfDay,
}
export type {
  AlignBy,
  AlignedRow,
  AnalysisPeriod,
  Bucket,
  BucketStatus,
  BusinessCalendar,
  ComparisonBasis,
  ComparisonMode,
  ComparisonRange,
  DayRange,
  Granularity,
  GranularityAdjustment,
  PeriodContext,
  PeriodUnit,
  RelativePeriodId,
  ResolvedPeriod,
  WeekStartsOn,
}
