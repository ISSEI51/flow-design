import { fromDateString, type DateString } from "@/lib/date"
import { relativePeriods, type AnalysisPeriod, type ComparisonMode, type Granularity, type RelativePeriodId } from "@/patterns/analysis-period"
import type { AnalysisQuery } from "@/patterns/analysis-query"

import { plans, regionLabels, regions, terms, type AnalysisFilters, type Plan, type Region, type Term } from "../../data/data-analysis/subscriptions"

// 検証画面のルーティングと、URL と分析の条件の変換（製品側のコード）。
// - URL のハッシュ（#/analysis-app?page=...）で画面を切り替える。
// - 条件（期間、比較、集計単位、絞り込み）を URL に同期する（history.replaceState。条件の変更で履歴を増やさない）。
//   相対期間は id（period=this-month）、固定の期間は日付（from、to）で持つ。共有の URL で再現性が必要な場合は固定の期間を使う。
//   この画面の条件には個人情報を含まない。企業名などの検索語を条件に加える場合は、URL に入れない。

export const APP = "#/analysis-app"

export type Route = { page: string; params: URLSearchParams }

export function readRoute(): Route {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
  return { page: params.get("page") ?? "business", params }
}

export const appHref = (page: string, extra?: Record<string, string>) => `${APP}?${new URLSearchParams({ page, ...extra }).toString()}`

const isPlan = (v: string): v is Plan => (plans as string[]).includes(v)
const isRegion = (v: string): v is Region => (regions as string[]).includes(v)
const isTerm = (v: string): v is Term => (terms as string[]).includes(v)
const comparisonModes: ComparisonMode[] = ["none", "previous-period", "previous-month", "previous-quarter", "previous-year", "custom"]
const granularities: Granularity[] = ["hour", "day", "week", "month", "quarter", "year"]

export function periodFromParams(p: URLSearchParams): AnalysisPeriod | undefined {
  const id = p.get("period")
  if (id && id in relativePeriods) return { kind: "relative", id: id as RelativePeriodId }
  const from = p.get("from")
  const to = p.get("to")
  if (from && to && fromDateString(from) && fromDateString(to)) return { kind: "absolute", from, to }
  return undefined
}

export function queryFromParams(p: URLSearchParams): Partial<AnalysisQuery<AnalysisFilters>> {
  // 未知の値は使わない。同じ値の重複は 1 つにする
  const list = <T extends string>(key: string, ok: (v: string) => v is T) => [...new Set(p.get(key)?.split(",").filter(ok) ?? [])] as T[]
  const out: Partial<AnalysisQuery<AnalysisFilters>> = {}
  const period = periodFromParams(p)
  if (period) out.period = period
  const cmp = p.get("cmp")
  if (cmp && (comparisonModes as string[]).includes(cmp)) out.comparison = cmp as ComparisonMode
  // 任意の比較期間。値の検証（日付として正しいか、期間と重ならないか）は useAnalysisQuery が行う
  const cfrom = p.get("cfrom")
  const cto = p.get("cto")
  if (out.comparison === "custom" && cfrom && cto) out.comparisonCustom = { from: cfrom as DateString, to: cto as DateString }
  const g = p.get("g")
  if (g && (granularities as string[]).includes(g)) {
    out.granularity = g as Granularity
    out.granularityMode = "manual"
  }
  if (p.has("region") || p.has("plan") || p.has("term")) {
    out.filters = { regions: list("region", isRegion), plans: list("plan", isPlan), terms: list("term", isTerm) }
  }
  return out
}

/**
 * 地域を 1 つだけ選べる画面（事業の状況、顧客維持の分析）で、URL の地域が複数の場合は、最初の 1 つだけを使う。
 * 画面に示す条件と、集計に使う条件を同じにする（画面は 1 つの地域を示し、集計は全部の地域で行う、という状態を作らない）。
 * 外した地域は notice で知らせる。製品が URL から条件を読み取るときの検証の例（useAnalysisQuery は filters を検証しない）
 */
export function singleRegionQuery(q: Partial<AnalysisQuery<AnalysisFilters>>): { query: Partial<AnalysisQuery<AnalysisFilters>>; notice: string | null } {
  const list = q.filters?.regions ?? []
  if (!q.filters || list.length <= 1) return { query: q, notice: null }
  const [first, ...dropped] = list
  return {
    query: { ...q, filters: { ...q.filters, regions: [first] } },
    notice: `この画面で選べる地域は 1 つです。URL で指定された地域のうち、${regionLabels[first]}で集計しています（${dropped.map((r) => regionLabels[r]).join("、")}は使っていません）`,
  }
}

export function paramsFromQuery(page: string, q: AnalysisQuery<AnalysisFilters>, extra?: Record<string, string | null>) {
  const p = new URLSearchParams({ page })
  if (q.period.kind === "relative") p.set("period", q.period.id)
  else {
    p.set("from", q.period.from)
    p.set("to", q.period.to)
  }
  p.set("cmp", q.comparison)
  if (q.comparison === "custom" && q.comparisonCustom) {
    p.set("cfrom", q.comparisonCustom.from)
    p.set("cto", q.comparisonCustom.to)
  }
  if (q.granularityMode === "manual") p.set("g", q.granularity)
  if (q.filters.regions.length) p.set("region", q.filters.regions.join(","))
  if (q.filters.plans.length) p.set("plan", q.filters.plans.join(","))
  if (q.filters.terms.length) p.set("term", q.filters.terms.join(","))
  for (const [k, v] of Object.entries(extra ?? {})) if (v !== null && v !== "") p.set(k, v)
  return p
}

/** 条件の変更を、履歴を増やさずに URL に反映する */
export function replaceHash(hash: string) {
  if (window.location.hash !== hash) window.history.replaceState(window.history.state, "", hash)
}
