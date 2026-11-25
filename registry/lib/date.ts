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

/**
 * 扱う年の範囲。西暦 1 年 1 月 1 日〜9999 年 12 月 31 日（先発グレゴリオ暦）。
 * - 0 年は Intl.DateTimeFormat が「紀元前 1 年」として表示し、"YYYY-MM-DD" と往復できないため扱わない
 * - 10000 年以降は "YYYY" の 4 桁に収まらないため扱わない
 */
export const MIN_YEAR = 1
export const MAX_YEAR = 9999

const pad = (n: number, len = 2) => String(n).padStart(len, "0")

/** Date として有効か（new Date("x") などの Invalid Date でないか）。 */
export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime())
}

/** ローカル時刻の年月日を "YYYY-MM-DD" にする。Invalid Date と扱う範囲の外の年は ""。 */
export function toDateString(date: Date): DateString {
  if (!isValidDate(date) || date.getFullYear() < MIN_YEAR || date.getFullYear() > MAX_YEAR) return ""
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "YYYY-MM-DD" をローカル時刻の 0 時の Date にする。形式が違う場合と存在しない日付は undefined。 */
export function fromDateString(value: DateString | null | undefined): Date | undefined {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  return makeDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

/**
 * 年月日から、ローカル時刻の 0 時の Date を作る。存在しない日付（2 月 30 日など）は、別の日付に繰り越さずに undefined を返す。
 * new Date(year, month, day) は 0〜99 年を 1900 年代として扱う（new Date(4, 1, 29) は 1904 年）。
 * さらに 1900 年はうるう年ではないため、0 年 2 月 29 日などが 3 月に繰り越される。
 * そのため、年月日を setFullYear で同時に設定し、設定した値がそのまま残っているかで存在を確かめる。
 * 夏時間で 0 時が存在しない日（一部の地域）は 1 時になるが、年月日は変わらない。
 */
export function makeDate(year: number, month: number, day: number): Date | undefined {
  if (![year, month, day].every(Number.isInteger)) return undefined
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const d = new Date(2000, 0, 1)
  d.setFullYear(year, month - 1, day)
  d.setHours(0, 0, 0, 0)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : undefined
}

/** 年月日だけを比べる。Invalid Date は一致しない。 */
export function isSameDate(a: Date | undefined, b: Date | undefined) {
  return (
    isValidDate(a) &&
    isValidDate(b) &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** a が b より前の日付か。時刻は無視する。 */
export function isBeforeDate(a: Date, b: Date) {
  return toDateString(a) < toDateString(b)
}

/**
 * 指定したタイムゾーンでの「今日」。返す値はローカル時刻の 0 時の Date。
 * 例：ブラウザが UTC で、timeZone が "Asia/Tokyo" の場合、UTC の 11 月 24 日 20 時には 11 月 25 日を返す。
 * timeZone は IANA の名前（"Asia/Tokyo" など）。不正な timeZone と Invalid Date の now は、誤った日付を返さずに
 * RangeError を投げる（設定の誤りを、日付がずれた状態で見逃さないため）。
 */
export function todayIn(timeZone?: string, now: Date = new Date()): Date {
  if (!isValidDate(now)) throw new RangeError("todayIn: now が Invalid Date です")
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(now)
  } catch {
    throw new RangeError(`todayIn: 不正なタイムゾーンです（${timeZone}）`)
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  const date = makeDate(get("year"), get("month"), get("day"))
  if (!date) throw new RangeError(`todayIn: 扱う範囲（${MIN_YEAR}〜${MAX_YEAR} 年）の外の日付です`)
  return date
}

// ---- 表示と入力

type Part = { type: "year" | "month" | "day" | "literal"; value: string }

/** ロケールの年月日の表示の部品。ja-JP は [年, "/", 月, "/", 日]。 */
function localeParts(locale: string): Part[] {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", calendar: "gregory", numberingSystem: "latn" })
    .formatToParts(new Date(2026, 10, 25))
    .filter((p) => p.type === "year" || p.type === "month" || p.type === "day" || p.type === "literal") as Part[]
}

/**
 * 日付を表示用の文字列にする。ja-JP は "YYYY/MM/DD"。年は 4 桁にそろえる（0005/01/03）。
 * Invalid Date、undefined、扱う範囲の外の年は ""。
 */
export function formatDate(date: Date | undefined, locale = "ja-JP") {
  if (!isValidDate(date) || date.getFullYear() < MIN_YEAR || date.getFullYear() > MAX_YEAR) return ""
  const values = { year: pad(date.getFullYear(), 4), month: pad(date.getMonth() + 1), day: pad(date.getDate()) }
  return localeParts(locale)
    .map((p) => (p.type === "literal" ? p.value : values[p.type]))
    .join("")
}

/** 入力欄の形式の説明。ja-JP は "YYYY/MM/DD"、en-US は "MM/DD/YYYY"。 */
export function dateFormatHint(locale = "ja-JP") {
  const names = { year: "YYYY", month: "MM", day: "DD" }
  return localeParts(locale)
    .map((p) => (p.type === "literal" ? p.value : names[p.type]))
    .join("")
}

export type DateInputResult =
  | { status: "empty" }
  | { status: "valid"; date: Date }
  /** 形式が違う。年月日の 3 つがそろっていない、区切りが違う、余分な区切りがある場合を含む。 */
  | { status: "invalid"; reason: "format" }
  /** 形式は正しいが、存在しない日付（2026/02/30、2026/13/01、0000/01/01 など）。 */
  | { status: "invalid"; reason: "nonexistent" }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * ロケールの表示形式から、入力を読み取る正規表現を作る。区切りの前後の空白は省略してよい。月と日は 1〜2 桁。
 * 区切りは表示形式と同じ記号に限る。先頭と末尾の記号だけは省略してよい。
 */
function localePattern(locale: string) {
  const order: ("year" | "month" | "day")[] = []
  const parts = localeParts(locale)
  const source = parts
    .map((p, i) => {
      if (p.type === "literal") {
        const lit = p.value.trim()
        const re = lit === "" ? "\\s+" : `\\s*${escapeRe(lit)}\\s*`
        // 先頭と末尾の記号（ko-KR の末尾の「.」など）は省略してよい
        return i === 0 || i === parts.length - 1 ? `(?:${re})?` : re
      }
      order.push(p.type)
      return p.type === "year" ? "(\\d{4})" : "(\\d{1,2})"
    })
    .join("")
  return { re: new RegExp(`^${source}$`), order }
}

/**
 * 入力欄の文字列を日付にする。形式の妥当性（format）と、日付として存在するか（nonexistent）を分けて判定する。
 * 別の日付へ黙って変換しない。全角の数字と記号は半角にそろえてから判定する（NFKC）。前後の空白は無視する。
 *
 * 受け付ける形式（これ以外は format）
 * 1. ロケールの表示形式。月と日は 1〜2 桁でよい。ja-JP は 2026/11/25、2026/1/5。en-US は 11/25/2026。
 *    de-DE は 25.11.2026。ko-KR は 2026. 11. 25.
 * 2. ISO 8601 の YYYY-MM-DD（2026-11-25）。どのロケールでも受け付ける
 * 3. 年が先のロケール（ja-JP、zh-CN、ko-KR など）では、区切りのない 8 桁（20261125）
 * 4. ja-JP では、2026年11月25日（「日」は省略できない）
 * 年は 4 桁（0001〜9999）。区切りの混在（2026/11-25）、空の区切り（2026//11/25）、先頭と末尾の余分な区切り
 * （/2026/11/25、2026/11/25/）は format とする。
 */
export function parseDateInput(text: string, locale = "ja-JP"): DateInputResult {
  const v = text.normalize("NFKC").trim()
  if (v === "") return { status: "empty" }
  let ymd: [number, number, number] | undefined
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const { re, order } = localePattern(locale)
  const local = v.match(re)
  const compact = order[0] === "year" ? v.match(/^(\d{4})(\d{2})(\d{2})$/) : null
  const kanji = locale.startsWith("ja") ? v.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/) : null
  if (iso) ymd = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (local) {
    const at = (t: "year" | "month" | "day") => Number(local[order.indexOf(t) + 1])
    ymd = [at("year"), at("month"), at("day")]
  } else if (compact) ymd = [Number(compact[1]), Number(compact[2]), Number(compact[3])]
  else if (kanji) ymd = [Number(kanji[1]), Number(kanji[2]), Number(kanji[3])]
  if (!ymd) return { status: "invalid", reason: "format" }
  const date = makeDate(...ymd)
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
