import { createContext, useContext, type ReactNode } from "react"

import { describeRange, granularityLabels, type DayRange, type Granularity } from "@/patterns/analysis-period"
import { useBrowseData } from "@/patterns/browse-data"

import { request, type AnalysisRequestKind } from "../../data/data-analysis/analysis-server"
import { regionLabels, planLabels, termLabels, type AnalysisFilters } from "../../data/data-analysis/subscriptions"

// 検証画面の、製品側の状態（ワークスペース、閲覧の権限、集計のタイムゾーン、明細の件数の公開、権限のない詳細の扱い）。
// 製品では、ログインの情報や設定から決まる値。検証画面では「検証用の操作」で切り替える。Registry には含めない。

export type AnalysisSession = {
  workspace: "hq" | "kyushu"
  role: "manager" | "staff"
  timeZone: string
  hiddenCountPolicy: "show" | "hide"
  /** 閲覧の権限がない企業の詳細。forbidden：権限不足として示す。not-found：存在しない場合と同じに示す（存在が機密の場合） */
  forbiddenDetail: "forbidden" | "not-found"
}

export const defaultSession: AnalysisSession = { workspace: "hq", role: "manager", timeZone: "Asia/Tokyo", hiddenCountPolicy: "show", forbiddenDetail: "forbidden" }

const SessionContext = createContext<{ session: AnalysisSession; setSession: (s: Partial<AnalysisSession>) => void }>({ session: defaultSession, setSession: () => undefined })

export function SessionProvider({ value, children }: { value: { session: AnalysisSession; setSession: (s: Partial<AnalysisSession>) => void }; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

/** データのスコープ（アカウント、ワークスペース、権限）。変わったら、前のデータを表示しない（useBrowseData の scopeKey） */
export const scopeOf = (s: AnalysisSession) => `${s.workspace}:${s.role}:${s.hiddenCountPolicy}:${s.forbiddenDetail}`

/**
 * 分析の領域のデータの取得。Data Browsing の useBrowseData を使い、別の取得の仕組みを作らない。
 * key が null（不正な条件）の間は取得しない。scope が変わったら、前のスコープのデータを返さない。
 */
export function useAnalysisData<T>(kind: AnalysisRequestKind, key: string | null, compute: () => T, scope: string) {
  return useBrowseData({
    query: key ?? "",
    enabled: key !== null,
    scopeKey: scope,
    fetcher: (k, { signal }) => request(kind, k, compute, { signal, scope }),
  })
}

/**
 * 取得の結果に含める、実際に集計に使った条件。取得を始めた時点の値で作り、結果と一緒に返す（useAnalysisData の compute の中で作る）。
 * 再取得の間に前の結果を残すとき、どの条件の結果かを、この値から示す（AnalysisRegion の staleLabel）。
 * 取得の条件のキーの文字列を読み直して条件を推測しない（キーの形と、実際に集計した条件が一致するとは限らない）。
 */
export type ShownConditions = {
  /** 集計した期間。ページの期間と別の期間を使う領域は null にして rangeLabel で示す */
  range: DayRange | null
  rangeLabel?: string
  /** 実際に集計に使った絞り込み（ワークスペースのスコープと、Cross-filtering などの個別条件を加えた後の値） */
  filters: AnalysisFilters
  /** 区間に分けて集計した領域の集計単位 */
  granularity?: Granularity
  /** 集計のタイムゾーン */
  timeZone: string
  /** この領域だけの条件（解約の理由など） */
  extra?: string[]
}

/**
 * 表示中の結果の条件の文（「2026/11/01〜2026/11/25・関東・月別の結果（前の条件）」）。
 * タイムゾーンは、現在のタイムゾーンと異なる場合だけ示す。
 */
export function describeConditions(shown: ShownConditions | null | undefined, current: { timeZone: string }): string | null {
  if (!shown) return null
  const parts: string[] = []
  if (shown.range) parts.push(describeRange(shown.range))
  else if (shown.rangeLabel) parts.push(shown.rangeLabel)
  const f = shown.filters
  if (f.regions.length) parts.push(f.regions.map((r) => regionLabels[r]).join("、"))
  if (f.plans.length) parts.push(f.plans.map((p) => planLabels[p]).join("、"))
  if (f.terms.length) parts.push(f.terms.map((t) => termLabels[t]).join("、"))
  if (!f.regions.length && !f.plans.length && !f.terms.length) parts.push("絞り込みなし")
  for (const e of shown.extra ?? []) parts.push(e)
  if (shown.granularity) parts.push(granularityLabels[shown.granularity])
  if (shown.timeZone !== current.timeZone) parts.push(shown.timeZone)
  return `${parts.join("・")}の結果（前の条件）`
}

/** 再取得中の領域の staleLabel。表示中の結果に含めた条件から作る */
export function staleLabelOf(d: { status: string; data?: { cond?: ShownConditions } | null }, current: { timeZone: string }) {
  return d.status === "refreshing" ? describeConditions(d.data?.cond, current) : null
}
