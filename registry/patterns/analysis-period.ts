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

// Flow Design Analysis Period（Patterns / Data Analysis / Analysis Filters・Period Comparison）
// 分析対象の期間、集計単位、比較期間を決める。定義は docs/web/patterns/analysis-filters.md と period-comparison.md を参照。
//
// 時間の定義（Date Picker（registry/lib/date.ts）と同じ）
// - 画面の中の日付は「ローカル時刻の 0 時」の Date で持ち、年月日だけを使う。開始日と終了日は、どちらも期間に含む。
// - 「今日」は製品が todayIn(timeZone) で求めて渡す（context.today）。この部品は現在時刻を直接読まない。
// - 週の始まり（weekStartsOn）と会計年度の開始月（fiscalYearStartMonth）は、製品が context で渡す。
// - バックエンドへ渡す期間は半開区間 [開始日の 0 時, 終了日の翌日の 0 時) を基本とする（toHalfOpenRange）。
//   0 時の時刻は、集計のタイムゾーンで求める（toInstantRange）。夏時間のある地域では、1 日が 23 時間や 25 時間になる。
// - 長さは暦の日数（differenceInCalendarDays）で数え、ミリ秒の差（24 時間）で数えない。

type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6

type PeriodContext = {
  /** 製品が todayIn(timeZone) で求めた今日（ローカル時刻の 0 時） */
  today: Date
  /** 週の始まり。既定は 1（月曜日。Calendar、Date Picker の既定と同じ） */
  weekStartsOn?: WeekStartsOn
  /** 会計年度の開始月（1〜12）。既定は 1（暦年）。4 なら 4 月始まり */
  fiscalYearStartMonth?: number
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
  resolve: (context: Required<PeriodContext>) => DayRange
}

const withDefaults = (c: PeriodContext): Required<PeriodContext> => ({ weekStartsOn: 1, fiscalYearStartMonth: 1, ...c })

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
  | { status: "invalid"; reason: "missing" | "invalid-date" | "end-before-start" | "future" }

function periodDays(range: DayRange) {
  return differenceInCalendarDays(range.to, range.from) + 1
}

/** 期間を、その時点の具体的な開始日と終了日にする */
function resolvePeriod(period: AnalysisPeriod, context: PeriodContext): ResolvedPeriod {
  const ctx = withDefaults(context)
  if (period.kind === "relative") {
    const def = relativePeriods[period.id]
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

function unitBounds(date: Date, unit: Exclude<PeriodUnit, "day" | "week">, ctx: Required<PeriodContext>): DayRange {
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
function naturalUnit(range: DayRange, ctx: Required<PeriodContext>): PeriodUnit | null {
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

/** そのタイムゾーンの、指定した時刻の UTC からの差（ミリ秒） */
function zoneOffset(epoch: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(epoch))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asUtc - Math.floor(epoch / 1000) * 1000
}

/**
 * そのタイムゾーンの、その日の最初の時刻（通常は 0 時）を、エポックからのミリ秒で返す。
 * 夏時間の切り替えで 0 時が存在しない日は、その日の最初の時刻（1 時など）を返す。
 */
function zonedStartOfDay(date: DateString, timeZone: string): number {
  const d = fromDateString(date)
  if (!d) throw new RangeError(`zonedStartOfDay: 不正な日付です（${date}）`)
  const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  // 差を求め直して収束させる（夏時間の前後で差が変わるため）。
  let epoch = local - zoneOffset(local, timeZone)
  for (let i = 0; i < 3; i++) {
    const next = local - zoneOffset(epoch, timeZone)
    if (next === epoch) break
    epoch = next
  }
  // 0 時が存在しない（epoch がその日の 0 時より後の時刻を指す、または前日になる）場合、その日の最初の時刻に合わせる。
  const dayOf = (e: number) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(e))
  if (dayOf(epoch) !== date) {
    // 前日の時刻になった場合は、その日になるまで 15 分ずつ進める（夏時間の差は 15 分の倍数）。
    let e = epoch
    for (let i = 0; i < 4 * 4 && dayOf(e) !== date; i++) e += 15 * 60 * 1000
    epoch = e
  }
  return epoch
}

function isoWithOffset(epoch: number, timeZone: string) {
  const offset = zoneOffset(epoch, timeZone) / 60000
  const local = new Date(epoch + offset * 60000)
  const pad = (n: number, l = 2) => String(Math.abs(n)).padStart(l, "0")
  const sign = offset >= 0 ? "+" : "-"
  return (
    `${pad(local.getUTCFullYear(), 4)}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  )
}

/**
 * 集計のタイムゾーンでの半開区間 [start, end) を、ISO 8601 の時刻（時差付き）で返す。
 * 例：2026/11/01〜2026/11/30、Asia/Tokyo → start "2026-11-01T00:00:00+09:00"、end "2026-12-01T00:00:00+09:00"
 */
function toInstantRange(range: DayRange, timeZone: string) {
  const { start, end } = toHalfOpenRange(range)
  const s = zonedStartOfDay(start, timeZone)
  const e = zonedStartOfDay(end, timeZone)
  return { start: isoWithOffset(s, timeZone), end: isoWithOffset(e, timeZone), startEpoch: s, endEpoch: e, timeZone }
}

/** そのタイムゾーンでの 1 日の長さ（時間）。夏時間の切り替えの日は 23 や 25 になる */
function hoursInDay(date: DateString, timeZone: string) {
  const next = toDateString(addDays(fromDateString(date)!, 1))
  return (zonedStartOfDay(next, timeZone) - zonedStartOfDay(date, timeZone)) / 3_600_000
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

type Bucket = {
  /** 区間の識別子（日付の文字列など）。グラフと表の行のキーに使う */
  key: string
  /** 区間の開始日と終了日（両方を含む）。期間の境界で切られた場合は、期間の中の部分だけ */
  from: Date
  to: Date
  /** hour の場合の時（0〜23）。それ以外は null */
  hour: number | null
  /** 短い名前（「11/3」「11月」「Q3」） */
  label: string
  /** 長い名前（「2026/11/03の週」「2026年11月」） */
  fullLabel: string
  /** 期間の境界で区間が切られ、区間の全体を含まない（週の途中から始まる期間など） */
  partial: boolean
  /** 今日を含む、まだ終わっていない区間 */
  inProgress: boolean
  /** 今日より後の区間（データがない）。時間別では時刻を扱わないため、今日の区間はすべて inProgress */
  future: boolean
}

function startOfUnit(date: Date, g: Granularity, ctx: Required<PeriodContext>) {
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

function bucketLabel(from: Date, g: Granularity, ctx: Required<PeriodContext>) {
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
      const q = Math.floor((from.getMonth() - fy.getMonth() + 12) % 12 / 3) + 1
      const prefix = ctx.fiscalYearStartMonth === 1 ? `${fy.getFullYear()}年` : `${fy.getFullYear()}年度`
      return { label: `Q${q}`, fullLabel: `${prefix} Q${q}` }
    }
    case "year":
      return ctx.fiscalYearStartMonth === 1 ? { label: `${y}年`, fullLabel: `${y}年` } : { label: `${y}年度`, fullLabel: `${y}年度` }
    default:
      return { label: `${m}/${d}`, fullLabel: formatDate(from) }
  }
}

/** 期間を集計単位の区間に分ける。期間の境界で切られた区間は partial、今日を含む区間は inProgress */
function buildBuckets(range: DayRange, granularity: Granularity, context: PeriodContext): Bucket[] {
  const ctx = withDefaults(context)
  const out: Bucket[] = []
  if (granularity === "hour") {
    for (let day = range.from; !isBeforeDate(range.to, day); day = addDays(day, 1)) {
      for (let h = 0; h < 24; h++) {
        const key = `${toDateString(day)}T${String(h).padStart(2, "0")}`
        out.push({
          key,
          from: day,
          to: day,
          hour: h,
          label: `${h}時`,
          fullLabel: `${formatDate(day)} ${h}時`,
          partial: false,
          inProgress: toDateString(day) === toDateString(ctx.today),
          future: isBeforeDate(ctx.today, day),
        })
      }
    }
    return out
  }
  for (let start = startOfUnit(range.from, granularity, ctx); !isBeforeDate(range.to, start); start = nextUnit(start, granularity)) {
    const end = addDays(nextUnit(start, granularity), -1)
    const from = isBeforeDate(start, range.from) ? range.from : start
    const to = isBeforeDate(range.to, end) ? range.to : end
    out.push({
      key: toDateString(from),
      from,
      to,
      hour: null,
      ...bucketLabel(start, granularity, ctx),
      partial: from.getTime() !== start.getTime() || to.getTime() !== end.getTime(),
      inProgress: !isBeforeDate(ctx.today, from) && !isBeforeDate(end, ctx.today),
      future: isBeforeDate(ctx.today, from),
    })
  }
  return out
}

function countBuckets(range: DayRange, granularity: Granularity, context: PeriodContext) {
  if (granularity === "hour") return periodDays(range) * 24
  return buildBuckets(range, granularity, context).length
}

/**
 * 期間に対して使える集計単位。区間の数が 2 以上、maxBuckets（既定 400）以下のもの。
 * 時間別は 7 日以内の期間に限る。1 日だけの期間では、時間別と日別を使える。
 */
function availableGranularities(range: DayRange, context: PeriodContext, { maxBuckets = 400 } = {}): Granularity[] {
  const days = periodDays(range)
  const list = granularityOrder.filter((g) => {
    if (g === "hour") return days <= 7
    if (g === "day" && days === 1) return true
    const n = countBuckets(range, g, context)
    return n >= 2 && n <= maxBuckets
  })
  return list.length ? list : ["day"]
}

/**
 * 期間の長さから決める集計単位の初期値（目安）。
 * 1 日：時間別。2〜62 日：日別。63〜366 日：月別（3 か月以内は週別）。それより長い：月別。
 */
function defaultGranularity(range: DayRange, context: PeriodContext): Granularity {
  const days = periodDays(range)
  const pick: Granularity = days <= 1 ? "hour" : days <= 62 ? "day" : days <= 92 ? "week" : "month"
  const available = availableGranularities(range, context)
  return available.includes(pick) ? pick : available[0]
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

type ComparisonRange =
  | {
      status: "ready"
      mode: Exclude<ComparisonMode, "none">
      range: DayRange
      days: number
      /**
       * same-elapsed：途中の期間を、比較期間の同じ経過の部分と比べる（11/1〜11/25 と 10/1〜10/25）。
       * full：期間の全体どうしを比べる（暦月の日数の違いは許容する）。
       * shifted：日付をずらした期間（前年同期の 11/3〜11/9 と 2025/11/3〜11/9 など）
       */
      alignment: "same-elapsed" | "full" | "shifted"
      /** 存在しない日付（2/29、31 日）を調整した */
      adjusted: boolean
      /** 比較期間の説明（調整した理由など）。ない場合は null */
      note: string | null
    }
  | { status: "none" }
  | { status: "invalid"; reason: "missing" | "end-before-start" | "overlap" }

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

/**
 * 比較期間を決める。
 * - 途中の期間（今月の 1〜25 日など）を前月・前四半期・前年と比べる場合は、同じ経過の部分（前月の 1〜25 日）と比べる。
 *   比較先の月が短く、同じ日がない場合は月末までにし（3/1〜3/30 と 2/1〜2/28）、adjusted と note で示す。
 * - 月の初日から月末までの期間は、比較先も月の初日から月末まで（10 月の 31 日間と 9 月の 30 日間）。
 * - 直前の同じ長さの期間は、日数をそろえる（開始日の前日から同じ日数）。
 */
// 比較期間が分析の対象の期間と重なる場合（9/1〜11/25 の前月 8/1〜10/25 など）は、同じ日を両方で数えるため比較できない。
function rejectOverlap(result: ComparisonRange, range: DayRange): ComparisonRange {
  if (result.status !== "ready") return result
  const overlaps = !isBeforeDate(result.range.to, range.from) && !isBeforeDate(range.to, result.range.from)
  return overlaps ? { status: "invalid", reason: "overlap" } : result
}

function comparisonRange(args: {
  period: Extract<ResolvedPeriod, { status: "ready" }>
  mode: ComparisonMode
  custom?: DayRange | null
}): ComparisonRange {
  return rejectOverlap(comparisonRangeRaw(args), args.period.range)
}

function comparisonRangeRaw({
  period,
  mode,
  custom,
}: {
  period: Extract<ResolvedPeriod, { status: "ready" }>
  mode: ComparisonMode
  /** mode が custom の場合の期間 */
  custom?: DayRange | null
}): ComparisonRange {
  const { range, days, inProgress, unit } = period
  if (mode === "none") return { status: "none" }
  if (mode === "custom") {
    if (!custom || !isValidDate(custom.from) || !isValidDate(custom.to)) return { status: "invalid", reason: "missing" }
    if (isBeforeDate(custom.to, custom.from)) return { status: "invalid", reason: "end-before-start" }
    if (!isBeforeDate(custom.to, range.from) && !isBeforeDate(range.to, custom.from)) return { status: "invalid", reason: "overlap" }
    const d = periodDays(custom)
    return {
      status: "ready",
      mode,
      range: custom,
      days: d,
      alignment: "shifted",
      adjusted: false,
      note: d !== days ? `比較期間は ${d} 日間（分析対象は ${days} 日間）` : null,
    }
  }
  if (mode === "previous-period") {
    const to = addDays(range.from, -1)
    const from = addDays(range.from, -days)
    return { status: "ready", mode, range: { from, to }, days, alignment: "shifted", adjusted: false, note: null }
  }
  const months = mode === "previous-month" ? 1 : mode === "previous-quarter" ? 3 : 12
  const from = shiftMonthsClamped(range.from, -months)
  // 期間の単位が比較の単位以上で、途中の期間なら、同経過期間で比べる。
  const unitMonths = unit === "month" ? 1 : unit === "quarter" ? 3 : unit === "year" || unit === "fiscal-year" ? 12 : 0
  const sameElapsed = inProgress && unitMonths > 0 && range.from.getDate() === 1
  const wholeMonths = range.from.getDate() === 1 && isMonthEnd(range.to) && !inProgress
  if (wholeMonths) {
    const end = startOfDay(endOfMonth(shiftMonthsClamped(range.to, -months).date))
    const d = periodDays({ from: from.date, to: end })
    return {
      status: "ready",
      mode,
      range: { from: from.date, to: end },
      days: d,
      alignment: "full",
      adjusted: false,
      note: d !== days ? `暦の月の日数が異なります（${days} 日間と ${d} 日間）` : null,
    }
  }
  const to = shiftMonthsClamped(range.to, -months)
  // 同経過期間で、比較先の月が短い場合（3/30 → 2/28）は月末までにする。
  const adjusted = from.clamped || to.clamped
  let note: string | null = null
  if (adjusted) note = `${formatDate(range.to)} に対応する日がないため、${formatDate(to.date)} までと比べます`
  const d = periodDays({ from: from.date, to: to.date })
  return {
    status: "ready",
    mode,
    range: { from: from.date, to: to.date },
    days: d,
    alignment: sameElapsed ? "same-elapsed" : "shifted",
    adjusted,
    note,
  }
}

/**
 * 期間の経過。期間の全体（今月なら 11/1〜11/30）と今日から、経過した日数と割合を求める。
 * 目標の達成率と区別して示すために使う。今日を含めて数える。
 */
function getPeriodElapsed(full: DayRange, today: Date) {
  const total = periodDays(full)
  const elapsed = isBeforeDate(today, full.from) ? 0 : isBeforeDate(full.to, today) ? total : periodDays({ from: full.from, to: today })
  return { elapsedDays: elapsed, totalDays: total, ratio: elapsed / total }
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

/**
 * 現在の期間と比較期間の区間を、期間の中の位置（1 番目、2 番目…）でそろえる。
 * 比較の折れ線で、経過日や週を横軸にして重ねるときに使う。元の日付は各区間の from、to、fullLabel で確かめられる。
 */
function alignBuckets(current: Bucket[], baseline: Bucket[]) {
  const n = Math.max(current.length, baseline.length)
  return Array.from({ length: n }, (_, i) => ({ index: i, current: current[i] ?? null, baseline: baseline[i] ?? null }))
}

export {
  alignBuckets,
  availableGranularities,
  buildBuckets,
  comparisonLabels,
  comparisonRange,
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
  AnalysisPeriod,
  Bucket,
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
