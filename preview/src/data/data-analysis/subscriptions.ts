import { addDays, differenceInCalendarDays, endOfMonth, getDaysInMonth } from "date-fns"

import { fromDateString, isBeforeDate, makeDate, toDateString, type DateString } from "@/lib/date"
import type { DayRange } from "@/patterns/analysis-period"

// Data Analysis の検証のための、架空の契約の記録（BtoB の SaaS）。会社名、金額、件数はすべて架空である。
// 指標、比較値、グラフ、明細は、すべてこの記録から集計する。画面ごとに固定の値を持たない（矛盾した状態を作らない）。
// 記録は乱数の種（seed）から決まった手順で作る。毎回同じ結果になる。Registry には含めない。

export const ANALYSIS_TODAY = makeDate(2026, 11, 25)!
export const ANALYSIS_TIME_ZONE = "Asia/Tokyo"
/** 集計の対象の最初の日 */
export const DATA_START = makeDate(2023, 1, 1)!

export type Plan = "light" | "standard" | "enterprise"
export type Term = "monthly" | "annual" | "multi-year"
export type Region = "hokkaido-tohoku" | "kanto" | "chubu" | "kinki" | "chugoku-shikoku" | "kyushu-okinawa"

export const planLabels: Record<Plan, string> = { light: "ライト", standard: "スタンダード", enterprise: "エンタープライズ" }
export const termLabels: Record<Term, string> = { monthly: "月契約", annual: "1年契約", "multi-year": "3年契約" }
export const regionLabels: Record<Region, string> = {
  "hokkaido-tohoku": "北海道・東北",
  kanto: "関東",
  chubu: "中部",
  kinki: "近畿",
  "chugoku-shikoku": "中国・四国",
  "kyushu-okinawa": "九州・沖縄",
}
export const plans = Object.keys(planLabels) as Plan[]
export const terms = Object.keys(termLabels) as Term[]
export const regions = Object.keys(regionLabels) as Region[]

export type FeeSegment = { from: DateString; plan: Plan; fee: number }

export type Account = {
  id: string
  name: string
  region: Region
  term: Term
  owner: string
  /** 契約の開始日（この日から有効） */
  start: DateString
  /** 解約の発効日（この日から無効）。契約中は null */
  end: DateString | null
  /** 解約の理由（解約した場合） */
  churnReason: string | null
  /** 月額の変更の履歴。古い順 */
  segments: FeeSegment[]
  /** 閲覧の権限が限られた取引先（明細は管理者だけが見られる） */
  restricted: boolean
}

// ---------------------------------------------------------------- 決まった手順の乱数
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rand: () => number, weights: [T, number][]): T {
  const total = weights.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [v, w] of weights) {
    if ((r -= w) < 0) return v
  }
  return weights[weights.length - 1][0]
}

const NAME_A = ["青葉", "朝日", "北斗", "東邦", "みなと", "山中", "桜井", "大和", "丸善", "白石", "若葉", "光陽", "富士見", "瀬戸", "常盤", "日向", "千代田", "菱和", "高砂", "緑川", "三笠", "福栄", "平和", "新星", "秋津", "浜松", "立花", "旭東", "葵", "早瀬", "清水", "松風", "鳴海", "柏木", "芦田", "和泉", "笹川", "円山", "稲葉", "岬", "嵐山", "森野", "本庄", "大河"]
const NAME_B = ["商事", "物産", "工業", "システム", "運輸", "製作所", "食品", "建設", "電機", "印刷", "化成", "精機", "ホールディングス", "サービス", "メディカル", "不動産"]
const OWNERS = ["佐藤 花子", "鈴木 一郎", "高橋 健", "田中 美咲", "伊藤 大輔", "渡辺 さくら"]
const REASONS = ["利用頻度が低い", "予算の削減", "他社の製品に移行", "事業の縮小", "機能が不足している", "担当者の異動"]

const BASE_FEE: Record<Plan, number> = { light: 29_800, standard: 79_800, enterprise: 248_000 }
const SEAT_FEE: Record<Plan, [number, number]> = { light: [5_000, 3], standard: [8_000, 7], enterprise: [20_000, 11] }
const nextPlan: Record<Plan, Plan | null> = { light: "standard", standard: "enterprise", enterprise: null }

function feeFor(plan: Plan, rand: () => number) {
  const [unit, max] = SEAT_FEE[plan]
  return BASE_FEE[plan] + Math.floor(rand() * max) * unit
}

function generate(): Account[] {
  const rand = mulberry32(20261125)
  const accounts: Account[] = []
  const used = new Set<string>()
  const nameFor = () => {
    // 名前の組み合わせ（768 通り）が尽きた場合は、地名を付けて区別する。
    for (let attempt = 0; ; attempt++) {
      const n = `${pick(rand, NAME_A.map((a) => [a, 1] as [string, number]))}${pick(rand, NAME_B.map((b) => [b, 1] as [string, number]))}`
      const place = attempt > 20 ? `${["北", "南", "東", "西", "中央"][attempt % 5]}${Math.floor(attempt / 5)}` : ""
      const name = rand() < 0.5 ? `株式会社${n}${place}` : `${n}${place}株式会社`
      if (!used.has(name)) {
        used.add(name)
        return name
      }
    }
  }
  const create = (start: Date) => {
    const kyushuOpen = !isBeforeDate(start, makeDate(2024, 4, 1)!)
    const region = pick<Region>(rand, [
      ["kanto", 38],
      ["kinki", 18],
      ["chubu", 15],
      ["hokkaido-tohoku", 9],
      ["chugoku-shikoku", 10],
      // 九州・沖縄は 2024 年 4 月に営業を始めた地域（それまでの契約はない）
      ["kyushu-okinawa", kyushuOpen ? 16 : 0],
    ])
    let plan = pick<Plan>(rand, [
      ["light", 45],
      ["standard", 40],
      ["enterprise", 15],
    ])
    const term = pick<Term>(rand, [
      ["monthly", 35],
      ["annual", 50],
      ["multi-year", 15],
    ])
    const segments: FeeSegment[] = [{ from: toDateString(start), plan, fee: feeFor(plan, rand) }]
    let end: Date | null = null
    // 月ごとに、解約と上位のプランへの変更を決める。
    for (let m = 1; ; m++) {
      const at = addDays(start, Math.round(m * 30.44))
      if (!isBeforeDate(at, addDays(ANALYSIS_TODAY, 1))) break
      const anniversary = term === "annual" ? m % 12 === 0 : term === "multi-year" ? m % 36 === 0 : true
      const base = term === "monthly" ? 0.026 : term === "annual" ? (anniversary ? 0.11 : 0.0015) : anniversary ? 0.09 : 0.0008
      // 年度末（3 月）は解約が増える。ライトは解約しやすい。
      const hazard = base * (at.getMonth() === 2 ? 1.6 : 1) * (plan === "light" ? 1.3 : plan === "enterprise" ? 0.6 : 1)
      if (rand() < hazard) {
        end = at
        break
      }
      const up = nextPlan[plan]
      if (up && rand() < 0.009) {
        plan = up
        segments.push({ from: toDateString(at), plan, fee: feeFor(plan, rand) })
      } else if (rand() < 0.012) {
        // 席数の増減（同じプランの月額の変更）
        const fee = Math.max(BASE_FEE[plan], segments[segments.length - 1].fee + (rand() < 0.6 ? 1 : -1) * SEAT_FEE[plan][0])
        segments.push({ from: toDateString(at), plan, fee })
      }
    }
    const id = `A-${String(accounts.length + 1).padStart(4, "0")}`
    accounts.push({
      id,
      name: nameFor(),
      region,
      term,
      owner: OWNERS[Math.floor(rand() * OWNERS.length)],
      start: toDateString(start),
      end: end ? toDateString(end) : null,
      churnReason: end ? REASONS[Math.floor(rand() * REASONS.length)] : null,
      segments,
      restricted: plan === "enterprise" && rand() < 0.25,
    })
  }
  // 2020〜2022 年に始まった契約（集計の開始の時点で契約中のもの）
  for (let i = 0; i < 330; i++) create(addDays(makeDate(2020, 1, 6)!, Math.floor(rand() * 1090)))
  // 2023 年 1 月から今日までの新しい契約。件数は少しずつ増える。
  for (let y = 2023, m = 1; !isBeforeDate(ANALYSIS_TODAY, makeDate(y, m, 1)!); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    const index = (y - 2023) * 12 + (m - 1)
    const n = Math.round(8 + index * 0.16 + rand() * 4)
    const days = y === ANALYSIS_TODAY.getFullYear() && m === ANALYSIS_TODAY.getMonth() + 1 ? ANALYSIS_TODAY.getDate() : getDaysInMonth(makeDate(y, m, 1)!)
    for (let i = 0; i < n; i++) create(makeDate(y, m, 1 + Math.floor(rand() * days))!)
  }
  return accounts
}

export const accounts: Account[] = generate()
export const accountById = new Map(accounts.map((a) => [a.id, a]))

// ---------------------------------------------------------------- 絞り込み
export type AnalysisFilters = { regions: Region[]; plans: Plan[]; terms: Term[] }
export const defaultAnalysisFilters: AnalysisFilters = { regions: [], plans: [], terms: [] }

/** その日の契約の状態（プラン、月額）。契約していなければ null */
export function stateOn(a: Account, day: DateString): FeeSegment | null {
  if (day < a.start || (a.end !== null && day >= a.end)) return null
  let seg = a.segments[0]
  for (const s of a.segments) if (s.from <= day) seg = s
  return seg
}

/** 絞り込みに一致するか。プランは、その日のプランで判定する（day がない場合は最後のプラン） */
export function matches(a: Account, f: AnalysisFilters, day?: DateString) {
  if (f.regions.length && !f.regions.includes(a.region)) return false
  if (f.terms.length && !f.terms.includes(a.term)) return false
  if (f.plans.length) {
    const seg = day ? stateOn(a, day) : a.segments[a.segments.length - 1]
    if (!seg || !f.plans.includes(seg.plan)) return false
  }
  return true
}

// ---------------------------------------------------------------- 日ごとの集計（差分の配列）
const DAYS = differenceInCalendarDays(ANALYSIS_TODAY, DATA_START) + 1
const dayIndex = (d: Date) => differenceInCalendarDays(d, DATA_START)
export const dayAt = (i: number) => addDays(DATA_START, i)

type DailySeries = { mrr: Float64Array; active: Int32Array; newCount: Int32Array; churnCount: Int32Array; churnMrr: Float64Array; cost: Float64Array }

// 原価率（売上に対する原価）。粗利の計算に使う。
export const COST_RATE: Record<Plan, number> = { light: 0.36, standard: 0.28, enterprise: 0.22 }

const cache = new Map<string, DailySeries>()

/** 絞り込みに一致する契約の、日ごとの MRR（その日に有効な月額の合計）、契約中の件数、新規と解約の件数 */
export function dailySeries(f: AnalysisFilters): DailySeries {
  const key = JSON.stringify(f)
  const hit = cache.get(key)
  if (hit) return hit
  const mrrDiff = new Float64Array(DAYS + 1)
  const costDiff = new Float64Array(DAYS + 1)
  const activeDiff = new Int32Array(DAYS + 1)
  const newCount = new Int32Array(DAYS)
  const churnCount = new Int32Array(DAYS)
  const churnMrr = new Float64Array(DAYS)
  for (const a of accounts) {
    if (f.regions.length && !f.regions.includes(a.region)) continue
    if (f.terms.length && !f.terms.includes(a.term)) continue
    const endIdx = a.end ? Math.min(DAYS, dayIndex(fromDateString(a.end)!)) : DAYS
    // 月額の区間ごとに加える。プランの絞り込みは、その区間のプランで判定する（上位のプランへの変更で対象が変わる）。
    for (let k = 0; k < a.segments.length; k++) {
      const s = a.segments[k]
      if (f.plans.length && !f.plans.includes(s.plan)) continue
      const from = Math.max(0, dayIndex(fromDateString(s.from)!))
      const to = k + 1 < a.segments.length ? Math.min(endIdx, dayIndex(fromDateString(a.segments[k + 1].from)!)) : endIdx
      if (to <= from) continue
      mrrDiff[from] += s.fee
      mrrDiff[to] -= s.fee
      costDiff[from] += s.fee * COST_RATE[s.plan]
      costDiff[to] -= s.fee * COST_RATE[s.plan]
      activeDiff[from] += 1
      activeDiff[to] -= 1
    }
    const startIdx = dayIndex(fromDateString(a.start)!)
    if (startIdx >= 0 && startIdx < DAYS && (!f.plans.length || f.plans.includes(a.segments[0].plan))) newCount[startIdx] += 1
    if (a.end) {
      const e = dayIndex(fromDateString(a.end)!)
      const last = stateOn(a, toDateString(addDays(fromDateString(a.end)!, -1)))
      if (e >= 0 && e < DAYS && last && (!f.plans.length || f.plans.includes(last.plan))) {
        churnCount[e] += 1
        churnMrr[e] += last.fee
      }
    }
  }
  const mrr = new Float64Array(DAYS)
  const cost = new Float64Array(DAYS)
  const active = new Int32Array(DAYS)
  let m = 0
  let c = 0
  let n = 0
  for (let i = 0; i < DAYS; i++) {
    m += mrrDiff[i]
    c += costDiff[i]
    n += activeDiff[i]
    mrr[i] = m
    cost[i] = c
    active[i] = n
  }
  const series = { mrr, active, newCount, churnCount, churnMrr, cost }
  cache.set(key, series)
  return series
}

const clampIndex = (d: Date) => Math.max(0, Math.min(DAYS - 1, dayIndex(d)))
const inData = (d: Date) => dayIndex(d) >= 0 && dayIndex(d) < DAYS

/** その日の終わりの MRR。データの範囲の外（未来、集計の開始の前）は null（0 にしない） */
export function mrrOn(day: Date, f: AnalysisFilters) {
  return inData(day) ? dailySeries(f).mrr[dayIndex(day)] : null
}

export function activeOn(day: Date, f: AnalysisFilters) {
  return inData(day) ? dailySeries(f).active[dayIndex(day)] : null
}

// 期間の一部でもデータの範囲（集計の開始日〜今日）の外にある場合は null（算出できない）。
// 範囲の外の日を 0 として合計すると、データのない期間を「0 件」「0 円」と誤認させるため。
function sumRange(arr: ArrayLike<number>, range: DayRange, perDay?: (i: number, v: number) => number) {
  if (!inData(range.from) || !inData(range.to)) return null
  let s = 0
  for (let i = clampIndex(range.from); i <= clampIndex(range.to); i++) s += perDay ? perDay(i, arr[i]) : arr[i]
  return s
}

/**
 * 1 日あたりの売上の比率。月額 × 12 ÷ 365（架空の計上の規則）。
 * 月の日数で割ると、同じ 25 日間でも 30 日の月と 31 日の月で 1 日の売上が変わり、同経過期間の比較が暦の日数の差で偏るため、
 * 月によって変わらない値にしている。
 */
export const DAILY_RATE = 12 / 365

/** 期間の売上。月額を日割り（DAILY_RATE）にして合計する。期間がデータの範囲の外を含む場合は null */
export function revenueIn(range: DayRange, f: AnalysisFilters) {
  const s = dailySeries(f)
  return sumRange(s.mrr, range, (_, v) => v * DAILY_RATE)
}

export function grossProfitIn(range: DayRange, f: AnalysisFilters) {
  const s = dailySeries(f)
  const revenue = revenueIn(range, f)
  const cost = sumRange(s.cost, range, (_, v) => v * DAILY_RATE)
  return revenue === null || cost === null ? null : revenue - cost
}

export function newAccountsIn(range: DayRange, f: AnalysisFilters) {
  return sumRange(dailySeries(f).newCount, range)
}

export function churnedIn(range: DayRange, f: AnalysisFilters) {
  return sumRange(dailySeries(f).churnCount, range)
}

/** 期間に解約した契約の、解約時の月額の合計 */
export function churnMrrIn(range: DayRange, f: AnalysisFilters) {
  return sumRange(dailySeries(f).churnMrr, range)
}

/** 期間がデータの範囲（集計の開始日〜今日）に収まるか */
export function inDataRange(range: DayRange) {
  return inData(range.from) && inData(range.to)
}

/**
 * 解約率：期間に解約した件数 ÷ 期間の初日の前日の契約中の件数（0〜1）。
 * 初日の前日の件数が 0 の場合は null（算出できない）。
 */
export function churnRateIn(range: DayRange, f: AnalysisFilters) {
  const base = activeOn(addDays(range.from, -1), f)
  const churned = churnedIn(range, f)
  if (base === null || churned === null || base === 0) return null
  return churned / base
}

/** MRR の増減の内訳。期間の初日の前日と最終日の MRR の差を、新規、増額、減額、解約に分ける（合計は差と一致する） */
export function mrrBridge(range: DayRange, f: AnalysisFilters) {
  const startDay = toDateString(addDays(range.from, -1))
  const endDay = toDateString(range.to)
  let added = 0
  let expansion = 0
  let contraction = 0
  let churn = 0
  for (const a of accounts) {
    const s0 = stateOn(a, startDay)
    const s1 = stateOn(a, endDay)
    const f0 = s0 && matches(a, f, startDay) ? s0.fee : 0
    const f1 = s1 && matches(a, f, endDay) ? s1.fee : 0
    if (f0 === 0 && f1 > 0) added += f1
    else if (f0 > 0 && f1 === 0) churn += f0
    else if (f1 > f0) expansion += f1 - f0
    else if (f1 < f0) contraction += f0 - f1
  }
  return { start: mrrOn(addDays(range.from, -1), f), end: mrrOn(range.to, f), added, expansion, contraction, churn }
}

// ---------------------------------------------------------------- 地域の固定費（営業利益の計算）
/** 地域ごとの月の固定費（営業の人件費、拠点の費用）。九州・沖縄は 2024 年 4 月に拠点を開いた */
export function regionFixedCost(region: Region, month: Date) {
  const base: Record<Region, number> = {
    "hokkaido-tohoku": 650_000,
    kanto: 2_600_000,
    chubu: 1_000_000,
    kinki: 1_150_000,
    "chugoku-shikoku": 700_000,
    "kyushu-okinawa": 5_000_000,
  }
  if (region === "kyushu-okinawa" && isBeforeDate(month, makeDate(2024, 4, 1)!)) return 0
  return base[region]
}

/** 期間の営業利益（粗利 − 地域の固定費の日割り） */
export function operatingProfitIn(range: DayRange, f: AnalysisFilters) {
  const gp = grossProfitIn(range, f)
  if (gp === null) return null
  const targets = f.regions.length ? f.regions : regions
  let fixed = 0
  for (let d = range.from; !isBeforeDate(range.to, d) && !isBeforeDate(ANALYSIS_TODAY, d); d = addDays(d, 1)) {
    for (const r of targets) fixed += regionFixedCost(r, d) * DAILY_RATE
  }
  return gp - fixed
}

// ---------------------------------------------------------------- 目標（製品が設定する値）
/** 月の売上の目標。前年の同じ月の売上の 1.27 倍を 10 万円単位で切り上げた値（架空の設定） */
export function monthlyRevenueTarget(month: Date): number | null {
  const prev = makeDate(month.getFullYear() - 1, month.getMonth() + 1, 1)!
  const prevRevenue = revenueIn({ from: prev, to: endOfMonthDay(prev) }, defaultAnalysisFilters)
  if (prevRevenue === null || isBeforeDate(prev, DATA_START)) return null
  return Math.ceil((prevRevenue * 1.27) / 100_000) * 100_000
}

/** 月の解約率の上限の目標（架空の設定） */
export const CHURN_RATE_LIMIT = 0.015

export function endOfMonthDay(d: Date) {
  return makeDate(d.getFullYear(), d.getMonth() + 1, endOfMonth(d).getDate())!
}

// ---------------------------------------------------------------- 明細
export type ChurnedRow = {
  id: string
  name: string
  region: Region
  plan: Plan
  term: Term
  /** 解約時の月額 */
  fee: number
  end: DateString
  reason: string
  owner: string
  restricted: boolean
}

/** 期間に解約した契約。プランは解約の直前のプラン */
export function churnedAccounts(range: DayRange, f: AnalysisFilters): ChurnedRow[] {
  const from = toDateString(range.from)
  const to = toDateString(addDays(range.to, 1))
  const out: ChurnedRow[] = []
  for (const a of accounts) {
    if (!a.end || a.end < from || a.end >= to) continue
    const lastDay = toDateString(addDays(fromDateString(a.end)!, -1))
    const last = stateOn(a, lastDay)
    if (!last || !matches(a, f, lastDay)) continue
    out.push({ id: a.id, name: a.name, region: a.region, plan: last.plan, term: a.term, fee: last.fee, end: a.end, reason: a.churnReason ?? "—", owner: a.owner, restricted: a.restricted })
  }
  return out.sort((x, y) => (x.end === y.end ? x.id.localeCompare(y.id) : y.end.localeCompare(x.end)))
}

export const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`
