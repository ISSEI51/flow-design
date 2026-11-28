"use client"

import * as React from "react"

import { fromDateString, toDateString, type DateString } from "@/lib/date"
import { isValidTimeZone } from "@/patterns/analysis-time"
import {
  availableGranularities,
  comparisonLabels,
  comparisonRange,
  defaultBasis,
  defaultGranularity,
  granularityLabels,
  granularityOrder,
  reconcileGranularity,
  resolvePeriod,
  type AnalysisPeriod,
  type ComparisonBasis,
  type ComparisonMode,
  type ComparisonRange,
  type Granularity,
  type PeriodContext,
  type ResolvedPeriod,
} from "@/patterns/analysis-period"

// Flow Design Analysis Query（Patterns / Data Analysis / Analysis Filters）
// 分析の全体条件（期間、集計単位、比較、絞り込み）を 1 つの値として持つ。定義は docs/web/patterns/analysis-filters.md を参照。
//
// この部品が持つもの
// - 適用済みの条件だけ。不完全な期間（終了日がない、開始日より前の終了日）は適用しない（setPeriod が false を返す）。
//   入力中の値は、期間の入力欄（AnalysisPeriodFilter）や、まとめて適用する Sheet（useFilterDraft）が持つ。
// - 期間と集計単位を別に持つ。手動で選んだ集計単位は、期間を変えても使える限り維持し、使えない場合だけ変えて notice で知らせる。
//   日付が変わって相対期間の範囲が変わった場合も、描画の時点で集計単位を確かめ直す（effective な集計単位を返す）。
// - 比較の対象（前月、前年同期）は、利用者の選択を維持する。期間の変更で使えなくなっても、黙って別の比較に変えない
//   （comparison が invalid になり、理由を示す）。
// - 絞り込み（filters）と、集計軸・表示の設定を分ける。Group by、Metric、View はこの値に入れず、領域ごとに製品が持つ。
// - 条件が不正な場合（不正な既定値、制御された不正な値）は status を invalid にし、key を null にする。
//   不正な条件で、意図せず全件を取得しない。
//
// 取得の条件のキー（key）：集計の結果の意味が変わる条件を含める。解決した期間（相対期間は日付）、比較期間と比較の方式、
// 集計単位、絞り込み、タイムゾーン、週の始まり、会計年度の開始月、集計済みの時刻（asOf）、製品の集計の方式（aggregationKey）。
// アカウント、ワークスペース、権限の境界は、Data Browsing の useBrowseData の scopeKey で扱う（この key に混ぜない）。
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
  /**
   * 最初の値（URL や保存した分析の条件から読み取った値）。不正な部分は既定値に戻し、notice で知らせる。
   * 対象は期間、比較、比較期間、集計単位。filters の値の検証（未知の値、画面で選べない組み合わせ、現在のスコープと権限に
   * 合わない値）はこの部品では行わない（filters の型と意味は製品が決める）。製品が URL などから読み取るときに検証し、
   * 外した値があれば製品が知らせてから渡す
   */
  initialQuery?: Partial<AnalysisQuery<F>>
  /** 制御する場合の値。製品が URL などと同期する。不正な値なら status が invalid になる */
  query?: AnalysisQuery<F>
  onQueryChange?: (query: AnalysisQuery<F>) => void
  /** 今日、週の始まり、会計年度の開始月、集計のタイムゾーン、集計済みの時刻 */
  context: PeriodContext
  /** 比較の方式。省略すると、途中の期間は同じ経過日数、それ以外は暦の期間（defaultBasis） */
  comparisonBasis?: ComparisonBasis
  /** 製品の集計の方式（売上の計上の規則の版など）。結果の意味が変わる場合に、取得の条件のキーに含める */
  aggregationKey?: string
  /** 製品が扱える集計単位（集計の基盤が時間別を扱えない場合など）。この中から、期間に対して使える単位を選ぶ */
  allowedGranularities?: readonly Granularity[]
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

const isGranularity = (g: unknown): g is Granularity => typeof g === "string" && (granularityOrder as string[]).includes(g)
const isComparisonMode = (m: unknown): m is ComparisonMode => typeof m === "string" && Object.prototype.hasOwnProperty.call(comparisonLabels, m)

function validCustom(c: AnalysisQuery<unknown>["comparisonCustom"]) {
  if (c === null) return true
  const from = fromDateString(c.from)
  const to = fromDateString(c.to)
  return Boolean(from && to && from.getTime() <= to.getTime())
}

type Validity = { ok: true } | { ok: false; reason: string }

function validate<F>(q: AnalysisQuery<F>, context: PeriodContext): Validity {
  if (context.timeZone !== undefined && !isValidTimeZone(context.timeZone)) return { ok: false, reason: `集計のタイムゾーンが不正です（${context.timeZone}）` }
  const r = resolvePeriod(q.period, context)
  if (r.status !== "ready") return { ok: false, reason: `期間が不正です（${r.reason}）` }
  if (!isGranularity(q.granularity)) return { ok: false, reason: `集計単位が不正です（${String(q.granularity)}）` }
  if (!isComparisonMode(q.comparison)) return { ok: false, reason: `比較の対象が不正です（${String(q.comparison)}）` }
  if (q.comparison === "custom" && q.comparisonCustom !== null && !validCustom(q.comparisonCustom)) return { ok: false, reason: "比較期間が不正です" }
  return { ok: true }
}

function useAnalysisQuery<F extends object>({
  defaultQuery,
  initialQuery,
  query: controlled,
  onQueryChange,
  context,
  comparisonBasis,
  aggregationKey,
  allowedGranularities,
}: UseAnalysisQueryOptions<F>) {
  // 製品が扱える単位だけを使う。使える単位の初期値が扱えない単位なら、扱える単位の最初のものにする
  const allowed = allowedGranularities ?? granularityOrder
  const availableFor = (range: Parameters<typeof availableGranularities>[0]) => {
    const list = availableGranularities(range, context).filter((g) => allowed.includes(g))
    return list.length ? list : [allowed[0]]
  }
  const defaultFor = (range: Parameters<typeof availableGranularities>[0]) => {
    const d = defaultGranularity(range, context)
    return availableFor(range).includes(d) ? d : availableFor(range)[0]
  }
  const init = (): { query: AnalysisQuery<F>; notice: string | null } => {
    const periodNotice =
      initialQuery?.period && resolvePeriod(initialQuery.period, context).status !== "ready" ? "指定された期間が不正なため、既定の期間で表示しています" : null
    const comparisonNotice =
      initialQuery?.comparison !== undefined && !isComparisonMode(initialQuery.comparison) ? "指定された比較の対象が不正なため、既定の比較で表示しています" : null
    const q = initQuery()
    // 復元した集計単位（URL の g=hour など）を使えない場合は、変えたことを示す（黙って変えない）
    const requested = initialQuery?.granularityMode === "manual" ? initialQuery.granularity : undefined
    const granularityNotice =
      requested !== undefined && isGranularity(requested) && requested !== q.granularity
        ? `指定された集計単位「${granularityLabels[requested]}」は使えないため、「${granularityLabels[q.granularity]}」で表示しています`
        : null
    return { query: q, notice: [periodNotice, comparisonNotice, granularityNotice].filter(Boolean).join("。") || null }
  }
  const initQuery = (): AnalysisQuery<F> => {
    const merged = { comparisonCustom: null, granularityMode: "auto" as const, ...defaultQuery, ...initialQuery }
    // 復元した比較の対象が不正なら、既定の比較に戻す（既定も不正なら、そのまま。status が invalid になり、取得しない）
    const base = isComparisonMode(merged.comparison) ? merged : { ...merged, comparison: defaultQuery.comparison }
    const resolved = resolvePeriod(base.period, context)
    // 復元した期間が不正なら既定の期間に戻す。既定の期間も不正なら、そのまま（status が invalid になり、取得しない）
    const period = resolved.status === "ready" ? base.period : defaultQuery.period
    const r = resolvePeriod(period, context)
    if (r.status !== "ready") return { ...base, period, granularity: "day", granularityMode: "auto" } as AnalysisQuery<F>
    const manual = base.granularityMode === "manual" && isGranularity(base.granularity)
    const g = reconcileGranularity({ current: isGranularity(base.granularity) ? base.granularity : "day", manual, range: r.range, context })
    if (!allowed.includes(g.granularity)) g.granularity = defaultFor(r.range)
    const custom = base.comparisonCustom && validCustom(base.comparisonCustom) ? base.comparisonCustom : null
    return {
      ...base,
      period,
      comparisonCustom: custom,
      granularity: g.granularity,
      granularityMode: manual && !g.adjustment ? "manual" : "auto",
    } as AnalysisQuery<F>
  }
  const [initial] = React.useState(init)
  const [own, setOwn] = React.useState<AnalysisQuery<F>>(initial.query)
  const query = controlled ?? own
  const [notice, setNotice] = React.useState<string | null>(initial.notice)
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

  const validity = validate(query, context)
  // 描画のたびに、相対期間を「今日」で解決する（日付が変わったら、同じ「今月」が新しい月を指す）。
  const period: ResolvedPeriod = validity.ok ? resolvePeriod(query.period, context) : { status: "invalid", reason: "missing" }
  const ready = period.status === "ready" ? period : null
  const granularities = ready ? availableFor(ready.range) : (["day"] as Granularity[])
  // 日付の変化やタイムゾーンの変更で、選んだ集計単位が使えなくなった場合は、描画の時点で初期値を使う（保存した値は変えない）。
  const effectiveGranularity: Granularity = ready && !granularities.includes(query.granularity) ? defaultFor(ready.range) : query.granularity
  const granularityNotice =
    effectiveGranularity !== query.granularity ? `期間に合わせて、集計単位を「${granularityLabels[query.granularity] ?? query.granularity}」から「${granularityLabels[effectiveGranularity]}」に変えています` : null
  const custom =
    query.comparisonCustom && validCustom(query.comparisonCustom)
      ? { from: fromDateString(query.comparisonCustom.from)!, to: fromDateString(query.comparisonCustom.to)! }
      : null
  const basis = ready ? (comparisonBasis ?? defaultBasis(ready)) : null
  const comparison: ComparisonRange = ready ? comparisonRange({ period: ready, mode: query.comparison, custom, basis: basis ?? undefined, context }) : { status: "none" }

  /** 期間を適用する。不完全・不正な期間は適用せず false を返す */
  const setPeriod = React.useCallback(
    (next: AnalysisPeriod) => {
      const r = resolvePeriod(next, contextRef.current)
      if (r.status !== "ready") return false
      const q = queryRef.current
      const g = reconcileGranularity({ current: q.granularity, manual: q.granularityMode === "manual", range: r.range, context: contextRef.current })
      // 製品が扱えない単位になる場合は、扱える単位の初期値にする
      if (!allowed.includes(g.granularity)) {
        const next = defaultFor(r.range)
        g.adjustment = q.granularityMode === "manual" && next !== q.granularity ? { from: q.granularity, to: next } : g.adjustment
        g.granularity = next
      }
      setNotice(
        g.adjustment
          ? `期間に合わせて、集計単位を「${granularityLabels[g.adjustment.from]}」から「${granularityLabels[g.adjustment.to]}」に変えました`
          : null
      )
      commit({ ...q, period: next, granularity: g.granularity, granularityMode: g.adjustment ? "auto" : q.granularityMode })
      return true
    },
    [commit]
  )

  const setGranularity = React.useCallback(
    (granularity: Granularity) => {
      if (!isGranularity(granularity)) return
      setNotice(null)
      commit({ ...queryRef.current, granularity, granularityMode: "manual" })
    },
    [commit]
  )

  /** 比較の対象を変える。利用者の操作だけで呼ぶ（期間の変更に合わせて自動で呼ばない） */
  const setComparison = React.useCallback(
    (mode: ComparisonMode, customRange?: { from: DateString; to: DateString } | null) => {
      const nextCustom = mode === "custom" ? (customRange ?? queryRef.current.comparisonCustom) : null
      if (nextCustom && !validCustom(nextCustom)) return false
      commit({ ...queryRef.current, comparison: mode, comparisonCustom: nextCustom })
      return true
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

  const activeFilterKeys = (Object.keys(query.filters) as (keyof F)[]).filter((k) => !sameValue(query.filters[k], defaultQuery.filters[k]))
  const day = (d: Date) => toDateString(d)

  return {
    query,
    /** ready：取得してよい条件。invalid：不正な条件（key は null。取得しない） */
    status: validity.ok ? ("ready" as const) : ("invalid" as const),
    invalidReason: validity.ok ? null : validity.reason,
    /** 解決した分析対象の期間 */
    period,
    /** 解決した比較期間。期間の変更で使えなくなった場合は invalid（比較の対象は変えない） */
    comparison,
    /** 比較の方式 */
    comparisonBasis: basis,
    /** 現在の期間で使える集計単位 */
    granularities,
    /** 実際に使う集計単位。query.granularity が現在の期間で使えない場合は初期値 */
    granularity: effectiveGranularity,
    /** 集計単位や期間を自動で変えたことの知らせ（role="status" で示す） */
    notice: granularityNotice ?? notice,
    clearNotice: () => setNotice(null),
    setPeriod,
    setGranularity,
    setComparison,
    setFilters,
    resetFilter,
    resetFilters,
    /** 既定値から変わっている絞り込みの条件 */
    activeFilterKeys,
    /**
     * 取得の条件のキー。条件が不正な場合は null（取得しない）。
     * 期間は解決した日付で表す（相対期間でも、日付が変われば別のキーになる）。
     */
    key:
      validity.ok && ready
        ? JSON.stringify({
            range: [day(ready.range.from), day(ready.range.to)],
            comparison: comparison.status === "ready" ? [day(comparison.range.from), day(comparison.range.to), comparison.basis, comparison.instant] : comparison.status,
            granularity: effectiveGranularity,
            filters: query.filters,
            timeZone: context.timeZone ?? null,
            weekStartsOn: context.weekStartsOn ?? 1,
            fiscalYearStartMonth: context.fiscalYearStartMonth ?? 1,
            asOf: context.asOf ?? null,
            aggregation: aggregationKey ?? null,
          })
        : null,
  }
}

// ---------------------------------------------------------------- 個別条件

/**
 * 個別条件を加えた結果。
 * - ready：領域に適用する条件（filters）
 * - conflict：全体条件と個別条件が重ならない。対象がない（filters を返さない。製品は取得せず、対象がないことを示す）
 * - invalid：全体条件にない項目（未知の条件）が含まれる
 */
type ScopedFilters<F> =
  | { status: "ready"; filters: F; narrowed: (keyof F)[] }
  | { status: "conflict"; conflicts: (keyof F)[] }
  | { status: "invalid"; unknown: string[] }

/**
 * 絞り込みの値の契約
 * - 配列（複数選択）：空の配列は「制限なし（すべて）」。1 つ以上の値は「そのいずれか」
 * - 1 つの値：null、undefined、"" は「制限なし」。それ以外は「その値だけ」
 * - 「対象なし」は値で表さず、scopeFilters の conflict で表す（空の配列を「対象なし」の意味に使わない）
 * - 値の比較は equals（既定は JSON の文字列の一致）。日付などは製品が比較の方法を渡す
 */
const isUnrestricted = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)

/**
 * 個別条件を全体条件に加える。個別条件は全体条件を引き継ぎ、さらに対象を絞り込む。
 * - 配列と配列：共通の部分。共通の部分がなければ conflict
 * - 配列と 1 つの値：値が配列に含まれれば、その値だけの配列。含まれなければ conflict
 * - 1 つの値と配列：全体の値が配列に含まれれば全体の値。含まれなければ conflict
 * - 1 つの値と 1 つの値：同じなら同じ値。異なれば conflict
 * conflict の場合に、全体条件を黙って上書きしたり、条件を外して全件を表示したりしない。
 * Drill-down で選んだ対象の条件を加えるときも、同じ規則を使う。
 */
function scopeFilters<F extends object>(
  global: F,
  local: Partial<F>,
  { equals = sameValue }: { equals?: (a: unknown, b: unknown) => boolean } = {}
): ScopedFilters<F> {
  // 全体条件の自身の項目だけを既知とする（in 演算子は toString などの継承した名前も既知としてしまう）
  const unknown = Object.keys(local).filter((k) => !Object.prototype.hasOwnProperty.call(global, k))
  if (unknown.length) return { status: "invalid", unknown }
  const filters = { ...global }
  const narrowed: (keyof F)[] = []
  const conflicts: (keyof F)[] = []
  const includes = (list: unknown[], v: unknown) => list.some((x) => equals(x, v))
  for (const key of Object.keys(local) as (keyof F)[]) {
    const l = local[key] as unknown
    const g = global[key] as unknown
    if (isUnrestricted(l)) continue
    if (isUnrestricted(g)) {
      filters[key] = l as F[keyof F]
      narrowed.push(key)
      continue
    }
    if (Array.isArray(g) && Array.isArray(l)) {
      const both = g.filter((v) => includes(l, v))
      if (both.length === 0) conflicts.push(key)
      else {
        filters[key] = both as F[keyof F]
        if (both.length < g.length) narrowed.push(key)
      }
    } else if (Array.isArray(g)) {
      if (includes(g, l)) {
        filters[key] = [l] as F[keyof F]
        if (g.length > 1) narrowed.push(key)
      } else conflicts.push(key)
    } else if (Array.isArray(l)) {
      if (!includes(l, g)) conflicts.push(key)
    } else if (!equals(g, l)) conflicts.push(key)
  }
  return conflicts.length ? { status: "conflict", conflicts } : { status: "ready", filters, narrowed }
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
  /**
   * 適用する領域の ID。省略すると、選択元以外のすべての領域に適用する。
   * 主要な指標にも適用する場合は、指標に「絞り込んだ値」であることを示す（製品の責務）
   */
  targets?: string[]
}

const sameSelection = (a: CrossFilterSelection | null, b: CrossFilterSelection | null) =>
  Boolean(a && b && a.source === b.source && a.field === b.field && a.value === b.value)

/**
 * Cross-filtering の選択。1 つの要素だけを選ぶ（同じ要素をもう一度選ぶと解除する）。要素は source、field、value の組で区別する。
 * - forRegion(id)：その領域に適用する選択。選択元の領域と、targets に含まれない領域には適用しない
 * - resetKey が変わったら（ワークスペース、全体条件の変更など）、選択を解除する
 * - initialSelection（戻ったときの復元）は、記録した resetKey が現在の resetKey と同じ場合だけ使う
 *   （全体条件やスコープが変わった後に、前の選択を復元しない）
 */
function useCrossFilter({
  resetKey,
  initialSelection = null,
}: {
  resetKey?: string
  initialSelection?: { selection: CrossFilterSelection | null; resetKey?: string } | null
} = {}) {
  const [state, setState] = React.useState<{ key: string | undefined; selection: CrossFilterSelection | null }>(() => ({
    key: resetKey,
    selection: initialSelection && initialSelection.resetKey === resetKey ? initialSelection.selection : null,
  }))
  // 描画の時点で、resetKey の変化を反映する（変わった後の最初の描画から、古い選択を返さない）。
  const selection = state.key === resetKey ? state.selection : null
  if (state.key !== resetKey) setState({ key: resetKey, selection: null })

  const toggle = React.useCallback(
    (next: CrossFilterSelection) => setState((s) => ({ key: s.key, selection: sameSelection(s.selection, next) ? null : next })),
    []
  )
  const clear = React.useCallback(() => setState((s) => ({ key: s.key, selection: null })), [])
  return {
    selection,
    /** 記録用の値（戻ったときの復元に使う） */
    snapshot: { selection, resetKey },
    toggle,
    clear,
    /** 領域に適用する選択。選択元の領域、targets に含まれない領域、選択がない場合は null */
    forRegion: (regionId: string) => (selection && selection.source !== regionId && (!selection.targets || selection.targets.includes(regionId)) ? selection : null),
    /** その要素が選ばれているか（source、field、value の組で判定する） */
    isSelected: (source: string, field: string, value: string) => Boolean(selection && selection.source === source && selection.field === field && selection.value === value),
  }
}

export { isUnrestricted, scopeFilters, useAnalysisQuery, useCrossFilter }
export type { AnalysisQuery, CrossFilterSelection, ScopedFilters, UseAnalysisQueryOptions }
