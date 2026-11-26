import { addDays } from "date-fns"

import { fromDateString, toDateString, type DateString } from "@/lib/date"

// Flow Design Analysis Time（Patterns / Data Analysis / Analysis Filters）
// 集計のタイムゾーンでの、日の始まりの時刻と、時間別の区間を求める。定義は docs/web/patterns/analysis-filters.md を参照。
//
// - タイムゾーンは製品が IANA の名前（"Asia/Tokyo" など）で明示的に渡す。実行環境のタイムゾーン（process.env.TZ、
//   ブラウザの設定）には依存しない。不正なタイムゾーンは RangeError にする（誤った時刻に変換しない）。
// - 時刻はエポックからのミリ秒（UTC）で持ち、表示用のローカル時刻（年月日、時、分、UTC からの時差）と分ける。
// - 区間は半開区間 [start, end)。
// - 時間別の区間は、ローカル時刻の「時」が変わるところ（と、UTC からの時差が変わるところ）で区切る。
//   夏時間の開始日（23 時間）は存在しない時刻の区間を作らず、終了日（25 時間）は同じ「1 時」を時差で区別した 2 つの区間にする。
//   30 分の夏時間（Australia/Lord_Howe）では 30 分の区間ができる（duration で区別する）。
//   30 分・45 分の時差（Asia/Kolkata、Asia/Kathmandu）でも、ローカル時刻の 0 分で区切る。
//
// 対応する範囲：1970 年以降で、UTC からの時差と切り替えの時刻が 15 分の倍数のタイムゾーン（現在の IANA のタイムゾーンは
// すべて該当する）。1970 年より前の地方平均時（+9:18:59 など）は保証しない。日付そのものが存在しない日
// （Pacific/Apia の 2011/12/30）は RangeError にする。

const QUARTER = 15 * 60 * 1000
const HOUR = 60 * 60 * 1000

const formatters = new Map<string, Intl.DateTimeFormat>()

/** タイムゾーンが IANA の名前として有効か */
function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone === "") return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

function assertTimeZone(timeZone: unknown): asserts timeZone is string {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`不正なタイムゾーンです（${String(timeZone)}）`)
}

function formatterFor(timeZone: string) {
  let f = formatters.get(timeZone)
  if (!f) {
    assertTimeZone(timeZone)
    f = new Intl.DateTimeFormat("en-US", {
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
    })
    formatters.set(timeZone, f)
  }
  return f
}

type LocalTime = { date: DateString; year: number; month: number; day: number; hour: number; minute: number; offsetMinutes: number }

/** その時刻の、タイムゾーンでのローカル時刻と UTC からの時差（分） */
function localTimeAt(epoch: number, timeZone: string): LocalTime {
  const parts = formatterFor(timeZone).formatToParts(new Date(epoch))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const year = get("year")
  const month = get("month")
  const day = get("day")
  const hour = get("hour")
  const minute = get("minute")
  const second = get("second")
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const offsetMinutes = Math.round((asUtc - Math.floor(epoch / 1000) * 1000) / 60000)
  const pad = (n: number, l = 2) => String(n).padStart(l, "0")
  return { date: `${pad(year, 4)}-${pad(month)}-${pad(day)}`, year, month, day, hour, minute, offsetMinutes }
}

/**
 * そのタイムゾーンの、その日の最初の時刻（通常は 0 時）を、エポックからのミリ秒で返す。
 * 夏時間で 0 時が存在しない日は、その日の最初の時刻（1 時など）を返す。日付が存在しない日は RangeError。
 */
function zonedStartOfDay(date: DateString, timeZone: string): number {
  assertTimeZone(timeZone)
  const d = fromDateString(date)
  if (!d) throw new RangeError(`不正な日付です（${date}）`)
  const utcMidnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  // UTC からの時差は −12〜+14 時間。前後 15 時間を 15 分ずつ調べ、その日になる最初の時刻を探す。
  const guess = utcMidnight - localTimeAt(utcMidnight, timeZone).offsetMinutes * 60000
  for (let e = guess - 3 * HOUR; e <= guess + 27 * HOUR; e += QUARTER) {
    const t = localTimeAt(e, timeZone).date
    if (t === date) return e
    if (t > date) break
  }
  throw new RangeError(`${date} は ${timeZone} に存在しない日付です`)
}

/**
 * その日の次の日の始まりの時刻。次の日がタイムゾーンに存在しない場合（Pacific/Apia の 2011/12/29 の次）は、その次の日。
 */
function nextDayStart(date: DateString, timeZone: string): number {
  let d = fromDateString(date)!
  for (let i = 0; i < 3; i++) {
    d = addDays(d, 1)
    try {
      return zonedStartOfDay(toDateString(d), timeZone)
    } catch (e) {
      if (!(e instanceof RangeError) || i === 2) throw e
    }
  }
  throw new RangeError(`${date} の次の日を ${timeZone} で求められません`)
}

/** ISO 8601 の時刻（時差付き）。例：2026-11-01T00:00:00+09:00 */
function isoWithOffset(epoch: number, timeZone: string) {
  const t = localTimeAt(epoch, timeZone)
  const pad = (n: number, l = 2) => String(Math.abs(n)).padStart(l, "0")
  const sign = t.offsetMinutes >= 0 ? "+" : "-"
  const off = Math.abs(t.offsetMinutes)
  const sec = new Date(epoch).getUTCSeconds()
  return `${t.date}T${pad(t.hour)}:${pad(t.minute)}:${pad(sec)}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
}

/** UTC からの時差の表示（GMT+9、GMT-4、GMT+5:45） */
function offsetLabel(offsetMinutes: number) {
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const off = Math.abs(offsetMinutes)
  const h = Math.trunc(off / 60)
  const m = off % 60
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`
}

/** そのタイムゾーンでの 1 日の長さ（時間）。夏時間の切り替えの日は 23 や 25 になる（30 分の夏時間では 23.5 や 24.5） */
function hoursInDay(date: DateString, timeZone: string) {
  return (nextDayStart(date, timeZone) - zonedStartOfDay(date, timeZone)) / HOUR
}

type HourSlot = {
  /** 区間の開始の時刻（エポックからのミリ秒、含む） */
  start: number
  /** 区間の終了の時刻（含まない） */
  end: number
  /** 開始のローカル時刻 */
  local: LocalTime
  /** 区間の長さ（分）。夏時間の切り替えで 60 分でない区間がある */
  durationMinutes: number
  /** 同じ日に同じ「時」の区間が 2 つある（夏時間の終了日）。表示で時差を併記する */
  repeated: boolean
}

/**
 * その日の時間別の区間。ローカル時刻の「時」と UTC からの時差が変わるところで区切る。
 * 例：America/New_York の 2026/03/08 は 23 区間（2 時の区間はない）、2026/11/01 は 25 区間（1 時の区間が GMT-4 と GMT-5 の 2 つ）。
 */
function hourSlotsOf(date: DateString, timeZone: string): HourSlot[] {
  const start = zonedStartOfDay(date, timeZone)
  const end = nextDayStart(date, timeZone)
  const slots: HourSlot[] = []
  let cur: { start: number; local: LocalTime } | null = null
  for (let e = start; e < end; e += QUARTER) {
    const t = localTimeAt(e, timeZone)
    if (!cur || t.hour !== cur.local.hour || t.offsetMinutes !== cur.local.offsetMinutes) {
      if (cur) slots.push({ start: cur.start, end: e, local: cur.local, durationMinutes: (e - cur.start) / 60000, repeated: false })
      cur = { start: e, local: t }
    }
  }
  if (cur) slots.push({ start: cur.start, end, local: cur.local, durationMinutes: (end - cur.start) / 60000, repeated: false })
  for (const s of slots) s.repeated = slots.filter((x) => x.local.hour === s.local.hour).length > 1
  return slots
}

export { assertTimeZone, hourSlotsOf, hoursInDay, nextDayStart, isValidTimeZone, isoWithOffset, localTimeAt, offsetLabel, zonedStartOfDay }
export type { HourSlot, LocalTime }
