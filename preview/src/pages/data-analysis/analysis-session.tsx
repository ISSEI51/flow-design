import { createContext, useContext, type ReactNode } from "react"

import { useBrowseData } from "@/patterns/browse-data"

import { request, type AnalysisRequestKind } from "../../data/data-analysis/analysis-server"
import { regionLabels, planLabels, termLabels, type Plan, type Region, type Term } from "../../data/data-analysis/subscriptions"

// 検証画面の、製品側の状態（ワークスペース、閲覧の権限、集計のタイムゾーン、明細の件数の公開）。
// 製品では、ログインの情報や設定から決まる値。検証画面では「検証用の操作」で切り替える。Registry には含めない。

export type AnalysisSession = {
  workspace: "hq" | "kyushu"
  role: "manager" | "staff"
  timeZone: string
  hiddenCountPolicy: "show" | "hide"
}

export const defaultSession: AnalysisSession = { workspace: "hq", role: "manager", timeZone: "Asia/Tokyo", hiddenCountPolicy: "show" }

const SessionContext = createContext<{ session: AnalysisSession; setSession: (s: Partial<AnalysisSession>) => void }>({ session: defaultSession, setSession: () => undefined })

export function SessionProvider({ value, children }: { value: { session: AnalysisSession; setSession: (s: Partial<AnalysisSession>) => void }; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

/** データのスコープ（アカウント、ワークスペース、権限）。変わったら、前のデータを表示しない（useBrowseData の scopeKey） */
export const scopeOf = (s: AnalysisSession) => `${s.workspace}:${s.role}:${s.hiddenCountPolicy}`

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
 * 表示中のデータの条件の説明。再取得の間に前の結果を残すとき、どの条件の結果かを示す（AnalysisRegion の staleLabel）。
 * dataKey は useBrowseData の dataKey（useAnalysisQuery の key を JSON にした文字列）。
 */
export function describeDataKey(dataKey: string | null, currentKey: string | null): string | null {
  if (!dataKey || !currentKey) return null
  try {
    const k = JSON.parse(JSON.parse(dataKey)) as { range?: [string, string]; filters?: { regions?: Region[]; plans?: Plan[]; terms?: Term[] }; granularity?: string; timeZone?: string }
    const c = JSON.parse(currentKey) as typeof k
    const parts: string[] = []
    if (k.range) parts.push(`${k.range[0].replaceAll("-", "/")}〜${k.range[1].replaceAll("-", "/")}`)
    const f = k.filters
    if (f?.regions?.length) parts.push(f.regions.map((r) => regionLabels[r]).join("、"))
    if (f?.plans?.length) parts.push(f.plans.map((p) => planLabels[p]).join("、"))
    if (f?.terms?.length) parts.push(f.terms.map((t) => termLabels[t]).join("、"))
    if (!f?.regions?.length && !f?.plans?.length && !f?.terms?.length) parts.push("絞り込みなし")
    if (k.timeZone && k.timeZone !== c.timeZone) parts.push(k.timeZone)
    return `${parts.join("・")}の結果（前の条件）`
  } catch {
    return "前の条件の結果"
  }
}
