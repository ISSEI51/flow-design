import { addDays, endOfMonth, startOfDay, startOfMonth, startOfWeek, startOfYear, subMonths } from "date-fns"

// Flow Design の日付の共通処理。Calendar と Date Picker が使う。
//
// 日付だけの値（「2026 年 11 月 25 日」）と日時（「2026-11-25T00:00:00Z」）を混同しないため、次のように扱う。
// - 画面の中では、日付を「ブラウザのローカル時刻の 0 時」の Date で持つ。年月日だけを使い、時刻は使わない。
// - バックエンドとの受け渡しは、"YYYY-MM-DD" の文字列（toDateString / fromDateString）で行う。
//   Date を toISOString() で送ると、UTC に変換されて前日になることがある（日本時間の 0 時は UTC の前日 15 時）。
// - 「今日」は、指定したタイムゾーン（省略時はブラウザのタイムゾーン）の年月日から作る（todayIn）。

/** "YYYY-MM-DD"。日付だけの値をバックエンドに渡す形式。 */
export type DateString = string

/** 開始日と終了日。どちらも日付を含む（終了日の 23:59:59 までを含む）。片側だけの指定も表せる。 */
export type DateRange = { from: Date | undefined; to?: Date | undefined }

const pad = (n: number, len = 2) => String(n).padStart(len, "0")

/** ローカル時刻の年月日を "YYYY-MM-DD" にする。 */
export function toDateString(date: Date): DateString {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "YYYY-MM-DD" をローカル時刻の 0 時の Date にする。存在しない日付は undefined。 */
export function fromDateString(value: DateString | null | undefined): Date | undefined {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  return makeDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

/** 年月日から Date を作る。存在しない日付（2 月 30 日など）は、別の日付に繰り越さずに undefined を返す。 */
export function makeDate(year: number, month: number, day: number): Date | undefined {
  if (month < 1 || month > 12 || day < 1) return undefined
  const d = new Date(year, month - 1, day)
  // 0〜99 年は new Date が 1900 年代として扱うため、年を設定し直す。
  d.setFullYear(year)
  return d.getMonth() === month - 1 && d.getDate() === day ? d : undefined
}

/** 年月日だけを比べる。 */
export function isSameDate(a: Date | undefined, b: Date | undefined) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** a が b より前の日付か。時刻は無視する。 */
export function isBeforeDate(a: Date, b: Date) {
  return toDateString(a) < toDateString(b)
}

/**
 * 指定したタイムゾーンでの「今日」。返す値はローカル時刻の 0 時の Date。
 * 例：ブラウザが UTC で、timeZone が "Asia/Tokyo" の場合、UTC の 11 月 24 日 20 時には 11 月 25 日を返す。
 */
export function todayIn(timeZone?: string, now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return makeDate(get("year"), get("month"), get("day"))!
}

// ---- 表示と入力

/** ロケールの年月日の並び。ja-JP は年、月、日。en-US は月、日、年。 */
function partOrder(locale: string) {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(2026, 10, 25))
    .filter((p) => p.type === "year" || p.type === "month" || p.type === "day")
    .map((p) => p.type as "year" | "month" | "day")
}

/** 日付を表示用の文字列にする。ja-JP は "YYYY/MM/DD"。 */
export function formatDate(date: Date | undefined, locale = "ja-JP") {
  if (!date) return ""
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

/** 入力欄の形式の説明。ja-JP は "YYYY/MM/DD"。 */
export function dateFormatHint(locale = "ja-JP") {
  const sample = formatDate(new Date(2026, 10, 25), locale)
  return sample.replace("2026", "YYYY").replace("11", "MM").replace("25", "DD")
}

export type DateInputResult =
  | { status: "empty" }
  | { status: "valid"; date: Date }
  /** 形式が違う。年月日の 3 つがそろっていない場合も含む。 */
  | { status: "invalid"; reason: "format" }
  /** 形式は正しいが、存在しない日付（2026/02/30 など）。 */
  | { status: "invalid"; reason: "nonexistent" }

/**
 * 入力欄の文字列を日付にする。別の日付へ黙って変換しない。
 * 受け付ける形式：ロケールの並びの年月日（ja-JP は 2026/11/25、2026/1/5）、区切りは「/」「-」「.」、
 * 区切りのない 8 桁（20261125）、ISO の 2026-11-25。全角の数字も受け付ける。年は 4 桁。
 */
export function parseDateInput(text: string, locale = "ja-JP"): DateInputResult {
  const v = text.normalize("NFKC").trim()
  if (v === "") return { status: "empty" }
  const order = partOrder(locale)
  let y: number, m: number, d: number
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const compact = v.match(/^(\d{4})(\d{2})(\d{2})$/)
  const parts = v.split(/\s*[/.\-年月日]\s*/).filter(Boolean)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (compact && order[0] === "year") [y, m, d] = [Number(compact[1]), Number(compact[2]), Number(compact[3])]
  else if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const at = (t: "year" | "month" | "day") => parts[order.indexOf(t)]
    if (at("year").length !== 4 || at("month").length > 2 || at("day").length > 2) return { status: "invalid", reason: "format" }
    ;[y, m, d] = [Number(at("year")), Number(at("month")), Number(at("day"))]
  } else return { status: "invalid", reason: "format" }
  const date = makeDate(y, m, d)
  return date ? { status: "valid", date } : { status: "invalid", reason: "nonexistent" }
}

// ---- 期間のプリセット

export type DateRangePreset = {
  id: string
  label: string
  /** today は todayIn() の値。週の始まりは Calendar と同じ値を渡す。 */
  range: (today: Date, options: { weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 }) => { from: Date; to: Date }
}

/**
 * よく使う期間の定義。どれを表示するかは製品が選ぶ。
 * すべて「今日」を基準に計算し、固定の日付を使わない。開始日と終了日は、どちらも期間に含む。
 * 今週、今月、今年は、期間の始まりから今日まで（未来の日を含めない）。
 */
export const dateRangePresets: Record<
  "today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth" | "last7Days" | "last30Days" | "thisYear",
  DateRangePreset
> = {
  today: { id: "today", label: "今日", range: (t) => ({ from: t, to: t }) },
  yesterday: { id: "yesterday", label: "昨日", range: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }) },
  thisWeek: { id: "this-week", label: "今週", range: (t, o) => ({ from: startOfWeek(t, o), to: t }) },
  thisMonth: { id: "this-month", label: "今月", range: (t) => ({ from: startOfMonth(t), to: t }) },
  lastMonth: {
    id: "last-month",
    label: "先月",
    range: (t) => ({ from: startOfMonth(subMonths(t, 1)), to: startOfDay(endOfMonth(subMonths(t, 1))) }),
  },
  last7Days: { id: "last-7-days", label: "過去7日間", range: (t) => ({ from: addDays(t, -6), to: t }) },
  last30Days: { id: "last-30-days", label: "過去30日間", range: (t) => ({ from: addDays(t, -29), to: t }) },
  thisYear: { id: "this-year", label: "今年", range: (t) => ({ from: startOfYear(t), to: t }) },
}
