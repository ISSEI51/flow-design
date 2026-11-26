"use client"

import * as React from "react"

import type { DateString } from "@/lib/date"
import {
  availableGranularities,
  comparisonRange,
  granularityLabels,
  reconcileGranularity,
  resolvePeriod,
  type AnalysisPeriod,
  type ComparisonMode,
  type ComparisonRange,
  type Granularity,
  type PeriodContext,
  type ResolvedPeriod,
} from "@/patterns/analysis-period"
import { fromDateString } from "@/lib/date"

// Flow Design Analysis Query（Patterns / Data Analysis / Analysis Filters）
// 分析の全体条件（期間、集計単位、比較、絞り込み）を 1 つの値として持つ。定義は docs/web/patterns/analysis-filters.md を参照。
//
// この部品が持つもの
// - 適用済みの条件だけ。不完全な期間（終了日がない、開始日より前の終了日）は適用しない（setPeriod が false を返す）。
//   入力中の値は、期間の入力欄（AnalysisPeriodFilter）や、まとめて適用する Sheet（useFilterDraft）が持つ。
// - 期間と集計単位を別に持つ。手動で選んだ集計単位は、期間を変えても使える限り維持し、使えない場合だけ変えて notice で知らせる。
// - 絞り込み（filters）と、集計軸・表示の設定を分ける。Group by、Metric、View はこの値に入れず、領域ごとに製品が持つ。
//
// この部品が持たないもの（製品の責務）：データの取得、URL への同期と保存、会計期間の定義、権限。
//
// 個別条件（scopeFilters）：領域（Chart、Table）の条件は、全体条件を引き継いでさらに絞り込む。
// Cross-filtering（useCrossFilter）：同じ画面の Chart の要素の選択で、ほかの領域を絞り込む。選択元の領域には適用しない。

type AnalysisQuery<F> = {
  period: AnalysisPeriod
  granularity: Granularity
  /** auto：期間に合わせて決める。manual：利用者が選んだ（期間を変えても、使える限り維持する） */
  granularityMode: "auto" | "manual"
  comparison: ComparisonMode
  /** comparison が custom の場合の期間（開始日と終了日を含む） */
  comparisonCustom: { from: DateString; to: DateString } | null
  filters: F
}

type UseAnalysisQueryOptions<F> = {
  defaultQuery: Omit<AnalysisQuery<F>, "granularity" | "granularityMode" | "comparisonCustom"> &
    Partial<Pick<AnalysisQuery<F>, "granularity" | "granularityMode" | "comparisonCustom">>
  /** 最初の値（URL や保存した分析の条件から読み取った値）。制御しない場合に使う */
  initialQuery?: Partial<AnalysisQuery<F>>
  /** 制御する場合の値。製品が URL などと同期する */
  query?: AnalysisQuery<F>
  onQueryChange?: (query: AnalysisQuery<F>) => void
  /** 今日、週の始まり、会計年度の開始月 */
  context: PeriodContext
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function isActive(value: unknown, def: unknown) {
  return !sameValue(value, def)
}

function useAnalysisQuery<F extends object>({ defaultQuery, initialQuery, query: controlled, onQueryChange, context }: UseAnalysisQueryOptions<F>) {
  const init = (): AnalysisQuery<F> => {
    const base = { comparisonCustom: null, granularityMode: "auto" as const, ...defaultQuery, ...initialQuery }
    const resolved = resolvePeriod(base.period, context)
    const fallback = resolvePeriod(defaultQuery.period, context)
    const period = resolved.status === "ready" ? base.period : defaultQuery.period
    const range = (resolved.status === "ready" ? resolved : fallback) as Extract<ResolvedPeriod, { status: "ready" }>
    const g = reconcileGranularity({
      current: base.granularity ?? "day",
      manual: base.granularityMode === "manual" && Boolean(base.granularity),
      range: range.range,
      context,
    })
    return {
      ...base,
      period,
      granularity: g.granularity,
      granularityMode: base.granularityMode === "manual" && !g.adjustment && base.granularity ? "manual" : "auto",
    } as AnalysisQuery<F>
  }
  const [own, setOwn] = React.useState<AnalysisQuery<F>>(init)
  const query = controlled ?? own
  const [notice, setNotice] = React.useState<string | null>(null)
  const queryRef = React.useRef(query)
  queryRef.current = query
  const changeRef = React.useRef(onQueryChange)
  changeRef.current = onQueryChange
  const contextRef = React.useRef(context)
  contextRef.current = context

  const commit = React.useCallback(
    (next: AnalysisQuery<F>) => {
      if (sameValue(next, queryRef.current)) return
      queryRef.current = next
      if (!controlled) setOwn(next)
      changeRef.current?.(next)
    },
    [controlled]
  )

  // 描画のたびに、相対期間を「今日」で解決する（日付が変わったら、同じ「今月」が新しい月を指す）。
  const resolved = resolvePeriod(query.period, context) as Extract<ResolvedPeriod, { status: "ready" }>
  const custom =
    query.comparisonCustom && fromDateString(query.comparisonCustom.from) && fromDateString(query.comparisonCustom.to)
      ? { from: fromDateString(query.comparisonCustom.from)!, to: fromDateString(query.comparisonCustom.to)! }
      : null
  const comparison: ComparisonRange =
    resolved.status === "ready" ? comparisonRange({ period: resolved, mode: query.comparison, custom }) : { status: "none" }
  const granularities = resolved.status === "ready" ? availableGranularities(resolved.range, context) : (["day"] as Granularity[])

  /** 期間を適用する。不完全・不正な期間は適用せず false を返す */
  const setPeriod = React.useCallback(
    (period: AnalysisPeriod) => {
      const r = resolvePeriod(period, contextRef.current)
      if (r.status !== "ready") return false
      const q = queryRef.current
      const g = reconcileGranularity({ current: q.granularity, manual: q.granularityMode === "manual", range: r.range, context: contextRef.current })
      setNotice(
        g.adjustment
          ? `期間に合わせて、集計単位を「${granularityLabels[g.adjustment.from]}」から「${granularityLabels[g.adjustment.to]}」に変えました`
          : null
      )
      commit({ ...q, period, granularity: g.granularity, granularityMode: g.adjustment ? "auto" : q.granularityMode })
      return true
    },
    [commit]
  )

  const setGranularity = React.useCallback(
    (granularity: Granularity) => {
      setNotice(null)
      commit({ ...queryRef.current, granularity, granularityMode: "manual" })
    },
    [commit]
  )

  const setComparison = React.useCallback(
    (mode: ComparisonMode, customRange?: { from: DateString; to: DateString } | null) => {
      commit({ ...queryRef.current, comparison: mode, comparisonCustom: mode === "custom" ? (customRange ?? queryRef.current.comparisonCustom) : null })
    },
    [commit]
  )

  const setFilters = React.useCallback(
    (patch: Partial<F> | ((filters: F) => F)) => {
      const q = queryRef.current
      commit({ ...q, filters: typeof patch === "function" ? patch(q.filters) : { ...q.filters, ...patch } })
    },
    [commit]
  )

  const resetFilter = React.useCallback(
    (key: keyof F) => {
      const q = queryRef.current
      commit({ ...q, filters: { ...q.filters, [key]: defaultQuery.filters[key] } })
    },
    // defaultQuery は最初の描画の値を使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit]
  )

  const resetFilters = React.useCallback(() => {
    commit({ ...queryRef.current, filters: defaultQuery.filters })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit])

  const activeFilterKeys = (Object.keys(query.filters) as (keyof F)[]).filter((k) => isActive(query.filters[k], defaultQuery.filters[k]))

  return {
    query,
    /** 解決した分析対象の期間 */
    period: resolved,
    /** 解決した比較期間 */
    comparison,
    /** 現在の期間で使える集計単位 */
    granularities,
    /** 集計単位を自動で変えたことの知らせ（role="status" で示す） */
    notice,
    clearNotice: () => setNotice(null),
    setPeriod,
    setGranularity,
    setComparison,
    setFilters,
    resetFilter,
    resetFilters,
    /** 既定値から変わっている絞り込みの条件 */
    activeFilterKeys,
    /** 取得の条件のキー。期間は解決した日付で表す（相対期間でも、日付が変われば別のキーになる） */
    key: JSON.stringify({
      range: resolved.status === "ready" ? [resolved.range.from.getTime(), resolved.range.to.getTime()] : null,
      comparison: comparison.status === "ready" ? [comparison.range.from.getTime(), comparison.range.to.getTime()] : null,
      granularity: query.granularity,
      filters: query.filters,
    }),
  }
}

// ---------------------------------------------------------------- 個別条件

type ScopedFilters<F> =
  | {
      status: "ready"
      /** 全体条件に個別条件を加えた、領域に実際に適用する条件 */
      filters: F
      /** 個別条件で絞り込んだ項目 */
      narrowed: (keyof F)[]
    }
  | {
      status: "conflict"
      /** 全体条件と個別条件が重ならない項目。この領域に表示できる対象はない */
      conflicts: (keyof F)[]
      filters: F
    }

const isEmpty = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0) || v === ""

/**
 * 個別条件を全体条件に加える。個別条件は全体条件を引き継ぎ、さらに対象を絞り込む。
 * - 配列（複数選択）：全体条件が空なら個別条件、両方あれば共通の部分。共通の部分がなければ conflict
 * - 1 つの値：全体条件がなければ個別条件。同じなら同じ値。異なれば conflict
 * conflict の場合に、全体条件を黙って上書きしたり、条件を外して全件を表示したりしない。
 * Drill-down で選んだ対象の条件を加えるときも、同じ規則を使う。
 */
function scopeFilters<F extends object>(global: F, local: Partial<F>): ScopedFilters<F> {
  const filters = { ...global }
  const narrowed: (keyof F)[] = []
  const conflicts: (keyof F)[] = []
  for (const key of Object.keys(local) as (keyof F)[]) {
    const l = local[key]
    const g = global[key]
    if (isEmpty(l)) continue
    if (isEmpty(g)) {
      filters[key] = l as F[keyof F]
      narrowed.push(key)
      continue
    }
    if (Array.isArray(g) && Array.isArray(l)) {
      const both = g.filter((v) => (l as unknown[]).includes(v))
      if (both.length === 0) conflicts.push(key)
      else {
        filters[key] = both as F[keyof F]
        if (both.length < g.length) narrowed.push(key)
      }
      continue
    }
    if (Array.isArray(g)) {
      if (g.includes(l)) {
        filters[key] = [l] as F[keyof F]
        if (g.length > 1) narrowed.push(key)
      } else conflicts.push(key)
      continue
    }
    if (!sameValue(g, l)) conflicts.push(key)
  }
  return conflicts.length ? { status: "conflict", conflicts, filters } : { status: "ready", filters, narrowed }
}

// ---------------------------------------------------------------- Cross-filtering

type CrossFilterSelection = {
  /** 選択元の領域の ID */
  source: string
  /** 絞り込む項目（"plan" など） */
  field: string
  /** 選んだ値（"standard" など） */
  value: string
  /** 選んだ値の名前（「スタンダード」）。条件の表示と読み上げに使う */
  label: string
}

/**
 * Cross-filtering の選択。1 つの要素だけを選ぶ（同じ要素をもう一度選ぶと解除する）。
 * - forRegion(id)：その領域に適用する選択。選択元の領域には適用しない（選択元の Chart が自身の絞り込みで消えないように）
 * - resetKey が変わったら（ワークスペース、全体条件の変更など）、選択を解除する
 */
function useCrossFilter({
  resetKey,
  initialSelection = null,
}: {
  resetKey?: string
  /** 最初の選択（分析の画面に戻ったときの復元） */
  initialSelection?: CrossFilterSelection | null
} = {}) {
  const [state, setState] = React.useState<{ key: string | undefined; selection: CrossFilterSelection | null }>({ key: resetKey, selection: initialSelection })
  // 描画の時点で、resetKey の変化を反映する（変わった後の最初の描画から、古い選択を返さない）。
  const selection = state.key === resetKey ? state.selection : null
  if (state.key !== resetKey) setState({ key: resetKey, selection: null })

  const toggle = React.useCallback(
    (next: CrossFilterSelection) =>
      setState((s) => ({
        key: s.key,
        selection: s.selection && s.selection.source === next.source && s.selection.value === next.value ? null : next,
      })),
    []
  )
  const clear = React.useCallback(() => setState((s) => ({ key: s.key, selection: null })), [])
  return {
    selection,
    toggle,
    clear,
    /** 領域に適用する選択。選択元の領域と、選択がない場合は null */
    forRegion: (regionId: string) => (selection && selection.source !== regionId ? selection : null),
    /** その要素が選ばれているか */
    isSelected: (source: string, value: string) => selection?.source === source && selection.value === value,
  }
}

export { scopeFilters, useAnalysisQuery, useCrossFilter }
export type { AnalysisQuery, CrossFilterSelection, ScopedFilters, UseAnalysisQueryOptions }
