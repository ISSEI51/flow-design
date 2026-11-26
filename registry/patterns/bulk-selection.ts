"use client"

import * as React from "react"
import type { OnChangeFn, RowSelectionState, Updater } from "@tanstack/react-table"

// Flow Design Bulk Selection（Patterns / Data Browsing / Bulk Actions）
// 一括操作の選択と、一括操作の実行の状態。定義と判断基準は docs/web/patterns/bulk-actions.md を参照。
//
// 選択の 2 つの方式
//   ids … 行の ID で選ぶ。フィルター、ソート、ページを変えても残す（Data Table の rowSelection と同じ形）。
//   all … 検索結果の全件を、検索条件（queryKey）と除外した ID で選ぶ。読み込んでいない行も含む。
//         条件を変えたら解除し、notice で知らせる（選択の対象が暗黙に広がったり、変わったりしないようにする）。
// どちらも、詳細を表示している行（activeRowId）とは別に持つ。scopeKey（アカウント、ワークスペース）が変わったら解除する。
//
// 選択の対象の確定、権限の確認、件数の検証、実際の処理の対象の固定は、バックエンドの責務である。
// all の方式では、検索条件と除外した ID をバックエンドに渡し、バックエンドが対象を確定する。

type BulkSelectionState<Q> =
  | { mode: "ids"; ids: RowSelectionState; scope: string | undefined }
  | { mode: "all"; queryKey: string; query: Q; excluded: RowSelectionState; scope: string | undefined }

/** 一括操作の対象。実行を始めたときに固定し、実行中に選択や条件が変わっても変えない */
type BulkTarget<Q = unknown> = (
  | { kind: "ids"; ids: string[] }
  | {
      kind: "query"
      /** 選択したときの検索条件 */
      query: Q
      queryKey: string
      /** 全件の選択から外した ID */
      excludedIds: string[]
      /** 選択したときの件数。正確な件数がわからない場合は null（バックエンドが確定する） */
      expectedCount: number | null
    }
) & {
  /** 選択したときのスコープ（アカウント、ワークスペース）。結果を、別のスコープの選択に反映しない */
  scope?: string
}

type UseBulkSelectionOptions<Q> = {
  /** 現在の検索条件のキー（ページ番号を含めない）。全件の選択は、このキーが変わったら解除する */
  queryKey: string
  /** 現在の検索条件。全件を選んだときに、実行の対象として固定する */
  query: Q
  /** アカウント、ワークスペースなど。変わったら選択をすべて解除する */
  scopeKey?: string
  /** 表示中の行の ID（現在のページ） */
  visibleIds: readonly string[]
  /** 検索結果の正確な総件数。わからない場合は null */
  total: number | null
}

const onlyTrue = (s: RowSelectionState) => {
  const out: RowSelectionState = {}
  for (const [k, v] of Object.entries(s)) if (v) out[k] = true
  return out
}

function resolve<T>(updater: Updater<T>, old: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(old) : updater
}

function useBulkSelection<Q>({ queryKey, query, scopeKey, visibleIds, total }: UseBulkSelectionOptions<Q>) {
  const [stored, setStored] = React.useState<BulkSelectionState<Q>>({ mode: "ids", ids: {}, scope: scopeKey })
  const [notice, setNotice] = React.useState<string | null>(null)

  // 描画の時点で、スコープと条件の変化を反映する（効果が走るまでの描画でも、別の条件の全件の選択を返さない）。
  const scopeChanged = stored.scope !== scopeKey
  const conditionChanged = stored.mode === "all" && stored.queryKey !== queryKey
  const state: BulkSelectionState<Q> = scopeChanged || conditionChanged ? { mode: "ids", ids: {}, scope: scopeKey } : stored

  React.useEffect(() => {
    if (scopeChanged) {
      setStored({ mode: "ids", ids: {}, scope: scopeKey })
      setNotice(null)
    } else if (conditionChanged) {
      setStored({ mode: "ids", ids: {}, scope: scopeKey })
      setNotice("検索条件を変更したため、検索結果全件の選択を解除しました")
    }
  }, [scopeChanged, conditionChanged, scopeKey])

  const stateRef = React.useRef(state)
  stateRef.current = state
  const visibleRef = React.useRef(visibleIds)
  visibleRef.current = visibleIds

  // 表に渡す選択。all の方式では、表示中の行のうち除外していない行を選択済みにする。
  const rowSelection = React.useMemo<RowSelectionState>(() => {
    if (state.mode === "ids") return state.ids
    const out: RowSelectionState = {}
    for (const id of visibleIds) if (!state.excluded[id]) out[id] = true
    return out
  }, [state, visibleIds])

  const onRowSelectionChange: OnChangeFn<RowSelectionState> = React.useCallback((updater) => {
    const s = stateRef.current
    setNotice(null)
    if (s.mode === "ids") {
      setStored({ ...s, ids: onlyTrue(resolve(updater, s.ids)) })
      return
    }
    const visible = visibleRef.current
    const before: RowSelectionState = {}
    for (const id of visible) if (!s.excluded[id]) before[id] = true
    const after = resolve(updater, before)
    const excluded = { ...s.excluded }
    for (const id of visible) {
      if (after[id]) delete excluded[id]
      else excluded[id] = true
    }
    setStored({ ...s, excluded })
  }, [])

  const setSelected = React.useCallback(
    (id: string, selected: boolean) =>
      onRowSelectionChange((old) => {
        const next = { ...old }
        if (selected) next[id] = true
        else delete next[id]
        return next
      }),
    [onRowSelectionChange]
  )

  /** 検索結果の全件を選ぶ（ページ内の選択とは別の、明示的な操作） */
  const selectAllMatching = React.useCallback(() => {
    setNotice(null)
    setStored({ mode: "all", queryKey, query, excluded: {}, scope: scopeKey })
  }, [queryKey, query, scopeKey])

  const clear = React.useCallback(() => {
    setNotice(null)
    setStored({ mode: "ids", ids: {}, scope: scopeKey })
  }, [scopeKey])

  const selectedIds = state.mode === "ids" ? Object.keys(state.ids) : []
  const excludedIds = state.mode === "all" ? Object.keys(state.excluded) : []
  const visibleSelectedCount = visibleIds.filter((id) => rowSelection[id]).length
  const count = state.mode === "ids" ? selectedIds.length : total === null ? null : Math.max(0, total - excludedIds.length)
  const hiddenCount = count === null ? null : Math.max(0, count - visibleSelectedCount)

  /** 実行の対象を固定する。返した値は、その後の選択や条件の変更の影響を受けない */
  const snapshot = React.useCallback((): BulkTarget<Q> => {
    const s = stateRef.current
    if (s.mode === "ids") return { kind: "ids", ids: Object.keys(s.ids), scope: s.scope }
    return {
      kind: "query",
      scope: s.scope,
      query: s.query,
      queryKey: s.queryKey,
      excludedIds: Object.keys(s.excluded),
      expectedCount: total === null ? null : Math.max(0, total - Object.keys(s.excluded).length),
    }
  }, [total])

  /**
   * 実行の結果を選択に反映する。完了した行と、結果が不明な行の選択を解除し、失敗した行の選択を残す。
   * 結果が不明な行の選択を残さないのは、同じ操作をもう一度押して重複して実行することを防ぐため（結果の表示に残す）。
   * 全件の選択を実行した場合は、失敗した行だけを ID で選んだ状態にする。
   * 要求そのものが失敗した場合（requestError が failed）は、選択を変えない。
   */
  const settle = React.useCallback((summary: BulkSummary<Q>) => {
    const s = stateRef.current
    const { target } = summary
    // 実行の間にスコープ（ワークスペース）が変わった場合は、新しいスコープの選択を変えない。
    if (target.scope !== s.scope) return
    // 要求そのものが失敗した（処理されていない）場合は、選択をそのまま残し、同じ対象で再試行できるようにする。
    if (summary.requestError?.outcome === "failed") return
    const result = {
      succeeded: summary.succeeded.map((i) => i.id),
      failed: summary.failed.map((i) => i.id),
      unknown: summary.unknown.map((i) => i.id),
    }
    if (summary.requestError?.outcome === "unknown" && s.mode === "all" && target.kind === "query" && target.queryKey === s.queryKey) {
      // 処理されたかわからない全件の選択は、重複して実行しないよう解除する（結果の表示に残す）。
      setStored({ mode: "ids", ids: {}, scope: s.scope })
      return
    }
    if (s.mode === "all") {
      if (target.kind === "query" && target.queryKey === s.queryKey) {
        setStored({ mode: "ids", ids: Object.fromEntries(result.failed.map((id) => [id, true])), scope: s.scope })
      }
      return
    }
    const ids = { ...s.ids }
    for (const id of [...result.succeeded, ...result.unknown]) delete ids[id]
    if (target.kind === "query") for (const id of result.failed) ids[id] = true
    setStored({ ...s, ids })
  }, [])

  return {
    mode: state.mode,
    /** useTable の state.rowSelection */
    rowSelection,
    /** useTable の onRowSelectionChange */
    onRowSelectionChange,
    isSelected: (id: string) => (state.mode === "ids" ? Boolean(state.ids[id]) : !state.excluded[id]),
    setSelected,
    selectAllMatching,
    clear,
    /** 検索結果の全件を選んでいる */
    allMatching: state.mode === "all",
    /** 選択中の件数。全件の選択で総件数がわからない場合は null */
    count,
    /** 選択中で、表示中のページにない件数。算出できない場合は null */
    hiddenCount,
    visibleSelectedCount,
    /** 表示中のページの行をすべて選んでいる */
    pageAllSelected: visibleIds.length > 0 && visibleSelectedCount === visibleIds.length,
    /** 1 件以上選んでいる（全件の選択を含む） */
    hasSelection: state.mode === "all" || selectedIds.length > 0,
    selectedIds,
    excludedIds,
    /** 条件の変更で全件の選択を解除したときの知らせ */
    notice,
    dismissNotice: () => setNotice(null),
    snapshot,
    settle,
  }
}

type BulkOutcome = "succeeded" | "failed" | "unknown"

type BulkItemResult = {
  id: string
  outcome: BulkOutcome
  /** 失敗の理由（「権限がありません」など） */
  message?: string
  /** false の失敗は、再試行しても解決しない（権限不足など）。再試行の対象から除く */
  retryable?: boolean
}

// 要求そのものが失敗した場合に、製品が投げる。outcome が unknown なら、処理されたかを確認できない（通信の切断、時間切れ）。
class BulkRequestError extends Error {
  outcome: "failed" | "unknown"
  constructor(message: string, outcome: "failed" | "unknown" = "unknown") {
    super(message)
    this.name = "BulkRequestError"
    this.outcome = outcome
  }
}

type BulkSummary<Q = unknown, P = unknown> = {
  /** 実行した操作の名前（製品が start に渡した値） */
  action: string
  target: BulkTarget<Q>
  /** 操作の内容（変更する値など）。再試行で同じ内容を使う */
  payload: P
  succeeded: BulkItemResult[]
  failed: BulkItemResult[]
  unknown: BulkItemResult[]
  /** 要求そのものが失敗した（行ごとの結果がない）。全件の選択の実行で起きる */
  requestError: { outcome: "failed" | "unknown"; message: string } | null
}

type BulkRunContext = {
  signal: AbortSignal
  /** 実際の進捗を取得できる場合だけ呼ぶ。呼ばない場合、進捗率は表示しない */
  reportProgress: (done: number, total: number) => void
}

function useBulkAction<Q = unknown, P = unknown>({
  run,
  onSettled,
  scopeKey,
}: {
  /** 一括操作の実行。行ごとの結果を返す。冪等性の保証と、実際の API の呼び出しは製品の責務 */
  run: (target: BulkTarget<Q>, context: BulkRunContext & { action: string; payload: P }) => Promise<BulkItemResult[]>
  onSettled?: (summary: BulkSummary<Q, P>) => void
  /** アカウント、ワークスペースなど。変わったら、実行の待機を中止し、結果の表示を消す（別のスコープに結果を残さない） */
  scopeKey?: string
}) {
  const [running, setRunning] = React.useState<{ action: string; target: BulkTarget<Q> } | null>(null)
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const [summary, setSummary] = React.useState<BulkSummary<Q, P> | null>(null)
  const busy = React.useRef(false)
  const controller = React.useRef<AbortController | null>(null)
  const generation = React.useRef(0)
  const runRef = React.useRef(run)
  runRef.current = run
  const settledRef = React.useRef(onSettled)
  settledRef.current = onSettled

  // スコープが変わったら、実行中の待機を中止し、結果を表示しない。サーバーでの処理の扱いは製品の run が決める。
  const scopeRef = React.useRef(scopeKey)
  React.useEffect(() => {
    if (scopeRef.current === scopeKey) return
    scopeRef.current = scopeKey
    generation.current++
    controller.current?.abort()
    controller.current = null
    busy.current = false
    setRunning(null)
    setProgress(null)
    setSummary(null)
  }, [scopeKey])

  // アンマウントしたら、実行の待機を中止する。
  React.useEffect(() => () => controller.current?.abort(), [])

  /**
   * 実行する。実行中は何もしない（二重実行の防止。ボタンの無効化より前に、同じ描画の中の 2 回目の押下も止める）。
   * target と payload は呼び出した時点の値で固定する。
   * keepSummary：再試行のときは、結果が出るまで前の結果の表示を残す（押したボタンを消さない）。
   */
  const start = React.useCallback(async (action: string, target: BulkTarget<Q>, payload: P, { keepSummary = false } = {}) => {
    if (busy.current) return undefined
    busy.current = true
    const gen = generation.current
    const ac = new AbortController()
    controller.current = ac
    const fixed: BulkTarget<Q> =
      target.kind === "ids" ? { ...target, ids: [...target.ids] } : { ...target, excludedIds: [...target.excludedIds] }
    setRunning({ action, target: fixed })
    setProgress(null)
    if (!keepSummary) setSummary(null)
    let result: BulkSummary<Q, P>
    try {
      const items = await runRef.current(fixed, {
        action,
        payload,
        signal: ac.signal,
        reportProgress: (done, total) => {
          if (gen === generation.current) setProgress({ done, total })
        },
      })
      result = {
        action,
        target: fixed,
        payload,
        succeeded: items.filter((i) => i.outcome === "succeeded"),
        failed: items.filter((i) => i.outcome === "failed"),
        unknown: items.filter((i) => i.outcome === "unknown"),
        requestError: null,
      }
    } catch (error) {
      const outcome = error instanceof BulkRequestError ? error.outcome : "unknown"
      const message = error instanceof Error ? error.message : String(error)
      // ID で選んだ対象は、行ごとの結果として扱う。全件の選択では、対象の ID がわからないため要求の失敗として扱う。
      const items = fixed.kind === "ids" ? fixed.ids.map((id) => ({ id, outcome, message })) : []
      result = {
        action,
        target: fixed,
        payload,
        succeeded: [],
        failed: outcome === "failed" ? items : [],
        unknown: outcome === "unknown" ? items : [],
        requestError: fixed.kind === "query" ? { outcome, message } : null,
      }
    }
    // スコープが変わった後に届いた結果は反映しない。
    if (gen !== generation.current) return undefined
    busy.current = false
    controller.current = null
    setRunning(null)
    setProgress(null)
    setSummary(result)
    settledRef.current?.(result)
    return result
  }, [])

  /**
   * 失敗した行（再試行できるもの）だけを、同じ操作の内容で再試行する。完了した行と、結果が不明な行は含めない。
   * 全件の選択の要求そのものが失敗した場合（処理されていない）は、同じ対象で再試行する。
   */
  const retryFailed = React.useCallback(() => {
    if (!summary) return undefined
    if (summary.requestError?.outcome === "failed") return start(summary.action, summary.target, summary.payload, { keepSummary: true })
    const ids = summary.failed.filter((i) => i.retryable !== false).map((i) => i.id)
    if (ids.length === 0) return undefined
    return start(summary.action, { kind: "ids", ids, scope: summary.target.scope }, summary.payload, { keepSummary: true })
  }, [summary, start])

  return {
    /** 実行中の操作と対象 */
    running,
    /** 実際の進捗。製品が reportProgress を呼んだ場合だけ値がある */
    progress,
    /** 最後の実行の結果 */
    summary,
    start,
    retryFailed,
    /** 結果の表示を閉じる */
    dismiss: () => setSummary(null),
    /** 実行の中止を要求する（signal を中止する）。処理済みの行の扱いは製品の run が結果として返す */
    cancel: () => controller.current?.abort(),
  }
}

export { BulkRequestError, useBulkAction, useBulkSelection }
export type { BulkItemResult, BulkOutcome, BulkRunContext, BulkSummary, BulkTarget, UseBulkSelectionOptions }
