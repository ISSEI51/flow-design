import { addDays } from "date-fns"
import { expect, test } from "@playwright/test"

import {
  dateFormatHint,
  dateRangePresets,
  formatDate,
  fromDateString,
  isSameDate,
  makeDate,
  MAX_YEAR,
  MIN_YEAR,
  parseDateInput,
  toDateString,
  todayIn,
} from "../../registry/lib/date"

// registry/lib/date.ts の単体の検品。ブラウザを使わず、Node.js で実行する。
// タイムゾーンは process.env.TZ を書き換えて切り替える（Node.js は実行中の変更を反映する）。
// 同じ処理を 2 つのブラウザの project で繰り返さないよう、desktop の project だけで実行する。

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "Node.js の単体の検品。desktop の project だけで実行する")
})

const ZONES = [
  "Asia/Tokyo",
  "UTC",
  "America/Los_Angeles", // 夏時間あり（UTC−8 / −7）
  "America/Sao_Paulo", // 2018 年までは 0 時に夏時間が始まり、0 時が存在しない日があった
  "Europe/London", // 夏時間あり（UTC±0 / +1）
  "Pacific/Kiritimati", // UTC+14
  "Pacific/Pago_Pago", // UTC−11
]

const originalTZ = process.env.TZ
test.afterEach(() => {
  process.env.TZ = originalTZ
})

const ymd = (d: Date | undefined) => (d ? toDateString(d) : undefined)

test.describe("makeDate", () => {
  test("leap years, century rules, month ends", () => {
    expect(ymd(makeDate(2024, 2, 29))).toBe("2024-02-29")
    expect(makeDate(2023, 2, 29)).toBeUndefined()
    expect(makeDate(1900, 2, 29)).toBeUndefined() // 100 で割り切れる年は平年
    expect(ymd(makeDate(2000, 2, 29))).toBe("2000-02-29") // 400 で割り切れる年はうるう年
    expect(makeDate(2100, 2, 29)).toBeUndefined()
    expect(ymd(makeDate(2400, 2, 29))).toBe("2400-02-29")
    for (const [m, last] of [[1, 31], [4, 30], [6, 30], [9, 30], [11, 30], [12, 31]] as const) {
      expect(ymd(makeDate(2026, m, last))).toBe(`2026-${String(m).padStart(2, "0")}-${last}`)
      expect(makeDate(2026, m, last + 1)).toBeUndefined()
    }
  })

  test("years 0001 to 0099 are not shifted to the 1900s", () => {
    // new Date(4, 1, 29) は 1904 年になる。makeDate は 4 年のまま扱う。
    const d = makeDate(4, 2, 29)!
    expect(d.getFullYear()).toBe(4)
    expect(ymd(d)).toBe("0004-02-29")
    // 0 年は扱わない（範囲の外）。1900 年に読み替えて 3 月に繰り越すこともしない。
    expect(makeDate(0, 2, 29)).toBeUndefined()
    expect(makeDate(0, 1, 1)).toBeUndefined()
    expect(makeDate(5, 2, 29)).toBeUndefined() // 5 年は平年
    expect(ymd(makeDate(1, 1, 1))).toBe("0001-01-01")
    expect(ymd(makeDate(99, 12, 31))).toBe("0099-12-31")
    expect(ymd(makeDate(100, 2, 28))).toBe("0100-02-28")
    expect(makeDate(100, 2, 29)).toBeUndefined()
    expect(ymd(makeDate(MAX_YEAR, 12, 31))).toBe("9999-12-31")
    expect(makeDate(MAX_YEAR + 1, 1, 1)).toBeUndefined()
    expect(makeDate(MIN_YEAR - 1, 12, 31)).toBeUndefined()
  })

  test("invalid parts", () => {
    for (const [y, m, d] of [
      [2026, 0, 1],
      [2026, 13, 1],
      [2026, 1, 0],
      [2026, 1, 32],
      [2026, 1.5, 1],
      [Number.NaN, 1, 1],
      [2026, 1, Number.POSITIVE_INFINITY],
      [-1, 1, 1],
    ]) {
      expect(makeDate(y, m, d), `${y}-${m}-${d}`).toBeUndefined()
    }
  })

  test("the date stays the same in every time zone, including days without a midnight", () => {
    for (const tz of ZONES) {
      process.env.TZ = tz
      for (const [y, m, d] of [
        [2026, 4, 1],
        [2026, 3, 8], // 米国の夏時間の開始
        [2026, 11, 1], // 米国の夏時間の終了
        [2026, 3, 29], // 英国の夏時間の開始
        [2018, 11, 4], // ブラジルで 0 時が存在しなかった日
        [2026, 12, 31],
        [4, 2, 29],
      ] as const) {
        const date = makeDate(y, m, d)!
        expect(date.getDate(), `${tz} ${y}-${m}-${d}`).toBe(d)
        expect(fromDateString(toDateString(date))!.getTime(), tz).toBe(date.getTime())
      }
    }
  })
})

test.describe("toDateString, fromDateString, formatDate", () => {
  test("round trip and invalid values", () => {
    expect(toDateString(new Date(Number.NaN))).toBe("")
    expect(formatDate(new Date(Number.NaN))).toBe("")
    expect(formatDate(undefined)).toBe("")
    expect(fromDateString("2026-02-30")).toBeUndefined()
    expect(fromDateString("2026-2-3")).toBeUndefined()
    expect(fromDateString("0000-01-01")).toBeUndefined()
    expect(fromDateString(null)).toBeUndefined()
    expect(formatDate(makeDate(5, 1, 3))).toBe("0005/01/03")
    expect(formatDate(makeDate(2026, 11, 25), "en-US")).toBe("11/25/2026")
    expect(formatDate(makeDate(2026, 11, 25), "de-DE")).toBe("25.11.2026")
    expect(dateFormatHint()).toBe("YYYY/MM/DD")
    expect(dateFormatHint("en-US")).toBe("MM/DD/YYYY")
    expect(dateFormatHint("de-DE")).toBe("DD.MM.YYYY")
  })

  test("December to January and month ends with addDays", () => {
    for (const tz of ZONES) {
      process.env.TZ = tz
      expect(ymd(addDays(makeDate(2026, 12, 31)!, 1)), tz).toBe("2027-01-01")
      expect(ymd(addDays(makeDate(2027, 1, 1)!, -1)), tz).toBe("2026-12-31")
      expect(ymd(addDays(makeDate(2028, 2, 28)!, 1)), tz).toBe("2028-02-29")
      expect(ymd(addDays(makeDate(2026, 3, 7)!, 2)), tz).toBe("2026-03-09") // 夏時間の開始をまたぐ
    }
  })
})

test.describe("parseDateInput", () => {
  const ok = (text: string, expected: string, locale?: string) => {
    const r = parseDateInput(text, locale)
    expect(r.status, `${locale ?? "ja-JP"} ${text}`).toBe("valid")
    if (r.status === "valid") expect(toDateString(r.date)).toBe(expected)
  }
  const bad = (text: string, reason: "format" | "nonexistent", locale?: string) =>
    expect(parseDateInput(text, locale), `${locale ?? "ja-JP"} ${text}`).toEqual({ status: "invalid", reason })

  test("ja-JP accepted formats", () => {
    ok("2026/11/25", "2026-11-25")
    ok("2026/1/5", "2026-01-05")
    ok(" 2026 / 11 / 25 ", "2026-11-25")
    ok("2026-11-25", "2026-11-25")
    ok("20261125", "2026-11-25")
    ok("２０２６／１１／２５", "2026-11-25")
    ok("２０２６１１２５", "2026-11-25")
    ok("2026年11月25日", "2026-11-25")
    ok("0004/02/29", "0004-02-29")
    expect(parseDateInput("")).toEqual({ status: "empty" })
    expect(parseDateInput("   ")).toEqual({ status: "empty" })
  })

  test("ja-JP rejects malformed input as format errors", () => {
    for (const text of [
      "2026//11/25",
      "/2026/11/25",
      "2026/11/25/",
      "2026/11-25",
      "2026-11/25",
      "2026.11.25",
      "2026/11",
      "2026/1125",
      "26/11/25",
      "20261/1/25",
      "2026/011/25",
      "2026/11/025",
      "2026年11月25",
      "2026年11月25日/",
      "2026 11 25",
      "2026/11/25 10:00",
      "2026-11-25T00:00:00Z",
      "abc",
      "11/25/2026",
      "2026115",
      "+2026/11/25",
      "2026/-1/25",
    ]) {
      bad(text, "format")
    }
  })

  test("nonexistent dates are not rolled over", () => {
    for (const text of ["2026/02/30", "2026/13/01", "2026/00/10", "2026/04/31", "2027/02/29", "0000/01/01", "2026/1/0", "20260230"]) {
      bad(text, "nonexistent")
    }
  })

  test("other locales follow their display format", () => {
    ok("11/25/2026", "2026-11-25", "en-US")
    ok("1/5/2026", "2026-01-05", "en-US")
    ok("2026-11-25", "2026-11-25", "en-US") // ISO はどのロケールでも受け付ける
    bad("2026/11/25", "format", "en-US")
    bad("20261125", "format", "en-US") // 月が先のロケールでは区切りのない 8 桁を受け付けない
    bad("2/30/2026", "nonexistent", "en-US")
    ok("25/11/2026", "2026-11-25", "en-GB")
    ok("25.11.2026", "2026-11-25", "de-DE")
    bad("25/11/2026", "format", "de-DE")
    ok("2026. 11. 25.", "2026-11-25", "ko-KR")
    ok("2026.11.25", "2026-11-25", "ko-KR")
    ok("20261125", "2026-11-25", "ko-KR")
    ok("2026/11/25", "2026-11-25", "zh-CN")
    bad("2026年11月25日", "format", "en-US")
  })
})

test.describe("todayIn", () => {
  test("today in the given time zone, around midnight", () => {
    for (const tz of ZONES) {
      process.env.TZ = tz
      // 日本時間 2026-11-25 00:00 は UTC の 11-24 15:00
      expect(ymd(todayIn("Asia/Tokyo", new Date("2026-11-24T14:59:59.999Z"))), tz).toBe("2026-11-24")
      expect(ymd(todayIn("Asia/Tokyo", new Date("2026-11-24T15:00:00.000Z"))), tz).toBe("2026-11-25")
      expect(ymd(todayIn("America/Los_Angeles", new Date("2026-11-25T07:59:59Z"))), tz).toBe("2026-11-24")
      expect(ymd(todayIn("America/Los_Angeles", new Date("2026-11-25T08:00:00Z"))), tz).toBe("2026-11-25")
      expect(ymd(todayIn("Pacific/Kiritimati", new Date("2026-11-24T10:00:00Z"))), tz).toBe("2026-11-25")
      expect(ymd(todayIn("Pacific/Pago_Pago", new Date("2026-11-25T10:00:00Z"))), tz).toBe("2026-11-24")
      // 夏時間の切り替えの前後（ロサンゼルス、2026-03-08 02:00 に 1 時間進む）
      expect(ymd(todayIn("America/Los_Angeles", new Date("2026-03-08T09:59:59Z"))), tz).toBe("2026-03-08")
      expect(ymd(todayIn("America/Los_Angeles", new Date("2026-03-09T06:59:59Z"))), tz).toBe("2026-03-08")
      expect(ymd(todayIn("America/Los_Angeles", new Date("2026-03-09T07:00:00Z"))), tz).toBe("2026-03-09")
      // 年末
      expect(ymd(todayIn("Asia/Tokyo", new Date("2026-12-31T15:00:00Z"))), tz).toBe("2027-01-01")
      // 省略時はプロセス（ブラウザ）のタイムゾーン
      expect(isSameDate(todayIn(undefined, new Date("2026-06-15T12:00:00Z")), todayIn(tz, new Date("2026-06-15T12:00:00Z")))).toBe(true)
    }
  })

  test("invalid time zone and invalid now throw instead of returning a wrong date", () => {
    expect(() => todayIn("Mars/Base")).toThrow(RangeError)
    expect(() => todayIn("Mars/Base")).toThrow(/不正なタイムゾーン/)
    expect(() => todayIn("Asia/Tokyo", new Date(Number.NaN))).toThrow(RangeError)
  })
})

test.describe("dateRangePresets", () => {
  test("relative to today, inclusive, across months and years", () => {
    const range = (id: keyof typeof dateRangePresets, today: Date, weekStartsOn: 0 | 1 = 1) => {
      const r = dateRangePresets[id].range(today, { weekStartsOn })
      return `${toDateString(r.from)}..${toDateString(r.to)}`
    }
    for (const tz of ZONES) {
      process.env.TZ = tz
      const t = makeDate(2026, 11, 25)!
      expect(range("today", t), tz).toBe("2026-11-25..2026-11-25")
      expect(range("thisWeek", t), tz).toBe("2026-11-23..2026-11-25")
      expect(range("thisWeek", t, 0), tz).toBe("2026-11-22..2026-11-25")
      expect(range("thisMonth", t), tz).toBe("2026-11-01..2026-11-25")
      expect(range("lastMonth", t), tz).toBe("2026-10-01..2026-10-31")
      expect(range("last7Days", t), tz).toBe("2026-11-19..2026-11-25")
      expect(range("last30Days", t), tz).toBe("2026-10-27..2026-11-25")
      expect(range("thisYear", t), tz).toBe("2026-01-01..2026-11-25")
      // 年をまたぐ
      const jan = makeDate(2027, 1, 1)!
      expect(range("lastMonth", jan), tz).toBe("2026-12-01..2026-12-31")
      expect(range("thisWeek", jan), tz).toBe("2026-12-28..2027-01-01")
      expect(range("last7Days", jan), tz).toBe("2026-12-26..2027-01-01")
      // 3 月の先月はうるう年の 2 月
      expect(range("lastMonth", makeDate(2028, 3, 10)!), tz).toBe("2028-02-01..2028-02-29")
      // 範囲の終わりは 0 時（日時を含まない）
      expect(dateRangePresets.lastMonth.range(t, { weekStartsOn: 1 }).to.getHours(), tz).toBe(0)
    }
  })
})
