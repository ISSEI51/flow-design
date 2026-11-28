"use client"

import * as React from "react"

import { useScopeGuard, type ScopeSnapshot } from "@/patterns/scope-guard"
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
//
// 不変のデータの契約：query（検索条件）と payload（操作の内容）は、作った後に書き換えない値として扱う。
// この部品は ID の配列を写して固定するが、query と payload は深く写さない（任意の型を写すと、Date や Map などの扱いが型ごとに異なるため）。
// useBrowseQuery は、条件を変えるたびに新しいオブジェクトを作る。製品が独自の値を使う場合は、書き換えずに新しい値を作るか、
// start に渡す前に製品がスナップショット（structuredClone など）を作る。

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
  /** 固定したときの選択の版。実行の間に利用者が選択を変えた場合、結果で新しい選択を変えない */
  selectionRevision?: number
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
  const [stored, setStoredState] = React.useState<BulkSelectionState<Q>>({ mode: "ids", ids: {}, scope: scopeKey })
  const [notice, setNotice] = React.useState<string | null>(null)
  // 選択の版。利用者の操作と、条件・スコープの変更による解除のたびに増やす（settle による反映では増やさない）。
  const revision = React.useRef(0)
  const setStored = React.useCallback((next: BulkSelectionState<Q>) => {
    revision.current++
    setStoredState(next)
  }, [])

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
  }, [scopeChanged, conditionChanged, scopeKey, setStored])

  // 操作の処理が読む、commit された選択と表示中の行。描画の中では書き換えない
  // （commit されていない描画（中断された transition）の選択で、snapshot や選択の変更を行わないため）。
  const stateRef = React.useRef(state)
  const visibleRef = React.useRef(visibleIds)
  React.useLayoutEffect(() => {
    stateRef.current = state
    visibleRef.current = visibleIds
  })

  // 表に渡す選択。all の方式では、表示中の行のうち除外していない行を選択済みにする。
  const rowSelection = React.useMemo<RowSelectionState>(() => {
    if (state.mode === "ids") return state.ids
    const out: RowSelectionState = {}
    for (const id of visibleIds) if (!state.excluded[id]) out[id] = true
    return out
  }, [state, visibleIds])

  const onRowSelectionChange: OnChangeFn<RowSelectionState> = React.useCallback(
    (updater) => {
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
    },
    [setStored]
  )

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
  }, [queryKey, query, scopeKey, setStored])

  const clear = React.useCallback(() => {
    setNotice(null)
    setStored({ mode: "ids", ids: {}, scope: scopeKey })
  }, [scopeKey, setStored])

  const selectedIds = state.mode === "ids" ? Object.keys(state.ids) : []
  const excludedIds = state.mode === "all" ? Object.keys(state.excluded) : []
  const visibleSelectedCount = visibleIds.filter((id) => rowSelection[id]).length
  const count = state.mode === "ids" ? selectedIds.length : total === null ? null : Math.max(0, total - excludedIds.length)
  const hiddenCount = count === null ? null : Math.max(0, count - visibleSelectedCount)

  /**
   * 実行の対象を固定する。返した値は、その後の選択や条件の変更の影響を受けない（ID の配列は写す）。
   * この値を返した描画の選択から作る（描画の中で呼ぶと、その描画の選択。commit された画面の操作から呼ぶと、
   * 表示中の選択。commit されていない描画の選択は使わない）
   */
  const snapshot = React.useCallback((): BulkTarget<Q> => {
    const s = state
    const selectionRevision = revision.current
    if (s.mode === "ids") return { kind: "ids", ids: Object.keys(s.ids), scope: s.scope, selectionRevision }
    return {
      kind: "query",
      scope: s.scope,
      selectionRevision,
      query: s.query,
      queryKey: s.queryKey,
      excludedIds: Object.keys(s.excluded),
      expectedCount: total === null ? null : Math.max(0, total - Object.keys(s.excluded).length),
    }
  }, [state, total])

  /**
   * 実行の結果を選択に反映する。完了した行と、結果が不明な行の選択を解除し、失敗した行の選択を残す。
   * 結果が不明な行の選択を残さないのは、同じ操作をもう一度押して重複して実行することを防ぐため（結果の表示に残す）。
   * 全件の選択を実行した場合は、失敗した行だけを ID で選んだ状態にする。
   * 次の場合は選択を変えない：
   * - 要求そのものが失敗した（requestError が failed。処理されていないため、同じ対象で再試行できる）
   * - 実行の間にスコープ（ワークスペース）が変わった
   * - 実行の間に利用者が選択を変えた（固定した版と現在の版が異なる）。以前の結果で、新しい選択を変えない
   */
  const settle = React.useCallback(
    (summary: BulkSummary<Q>) => {
      const s = stateRef.current
      const { target } = summary
      if (target.scope !== s.scope) return
      if (target.selectionRevision !== undefined && target.selectionRevision !== revision.current) return
      if (summary.requestError?.outcome === "failed") return
      const failed = summary.failed.map((i) => i.id)
      if (s.mode === "all") {
        if (target.kind === "query" && target.queryKey === s.queryKey) {
          // 処理されたかわからない全件の選択は、重複して実行しないよう解除する（結果の表示に残す）。
          setStoredState({ mode: "ids", ids: summary.requestError ? {} : Object.fromEntries(failed.map((id) => [id, true])), scope: s.scope })
        }
        return
      }
      const ids = { ...s.ids }
      for (const i of [...summary.succeeded, ...summary.unknown]) delete ids[i.id]
      if (target.kind === "query") for (const id of failed) ids[id] = true
      setStoredState({ ...s, ids })
    },
    []
  )

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

/**
 * run が返す値。行ごとの結果の配列か、結果とバックエンドが確定した対象の件数。
 * 全件の選択（query）の実行では、confirmedCount を返す（API の契約）。返さない場合、結果の完全性を確かめられない。
 */
type BulkRunResponse = BulkItemResult[] | { items: BulkItemResult[]; confirmedCount?: number | null }

// 要求そのものが失敗した場合に、製品が投げる。outcome が unknown なら、処理されたかを確認できない（通信の切断、時間切れ）。
class BulkRequestError extends Error {
  outcome: "failed" | "unknown"
  constructor(message: string, outcome: "failed" | "unknown" = "unknown") {
    super(message)
    this.name = "BulkRequestError"
    this.outcome = outcome
  }
}

/** 結果の完全性。complete が false のときは、すべて完了として扱わず、最新の状態の確認を促す */
type BulkIntegrity = {
  /** ID の対象のうち、結果が返らなかった件数（結果が不明として扱う） */
  missing: number
  /** 同じ ID の結果が重ねて返った件数（件数に含めない。異なる結果が重なった ID は結果が不明として扱う） */
  duplicates: number
  /** 対象ではない ID の結果の件数（件数に含めない） */
  unexpected: number
  /** 形式が正しくない結果の件数（件数に含めない） */
  invalid: number
  /** 全件の選択で、バックエンドが確定した対象の件数。わからない場合は null */
  confirmedCount: number | null
  /** 全件の選択で、確定した件数に対して結果が返らなかった件数（ID を特定できない）。確定した件数がわからない場合は null */
  unreported: number | null
  /** 全件の選択で、確定した件数より多くの結果が返った件数 */
  overReported: number
  /** 対象ではない ID のうち、結果が返った ID（全件の選択から外した行が処理された可能性がある） */
  unexpectedIds: string[]
  /** 全件の選択で、選択したときの件数（確認で示した件数）。わからない場合は null */
  expectedCount: number | null
  /** 全件の選択で、確定した件数が、選択したときの件数と異なる（確認した範囲と、処理の範囲が異なる） */
  countChanged: boolean
  /** 応答を受け取り、対象と照合した。false は要求そのものが失敗した（照合する結果がない） */
  reconciled: boolean
  /** 結果が対象と一致し、矛盾がない */
  complete: boolean
}

const outcomes = new Set<BulkOutcome>(["succeeded", "failed", "unknown"])
const isItem = (v: unknown): v is BulkItemResult =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as BulkItemResult).id === "string" &&
  (v as BulkItemResult).id !== "" &&
  outcomes.has((v as BulkItemResult).outcome)
// 表示に使う値だけを、型を確かめて写す（文字列ではない message などを描画しない）。
const cleanItem = (v: BulkItemResult): BulkItemResult => ({
  id: v.id,
  outcome: v.outcome,
  ...(typeof v.message === "string" && { message: v.message }),
  ...(typeof v.retryable === "boolean" && { retryable: v.retryable }),
})

/**
 * run の結果を、固定した対象と照合する。結果が足りない場合に、すべて完了として扱わない。
 * - ID の対象：対象のすべての ID について、結果を 1 つずつ求める。返らなかった ID は結果が不明。
 * - 同じ ID の結果が重なった場合は 1 つとして数える。異なる結果が重なった場合は結果が不明。
 * - 対象ではない ID（全件の選択では、外した ID）と、形式が正しくない結果は、件数に含めない。
 * - 全件の選択：対象の ID をクライアントでは確定できないため、バックエンドが返す confirmedCount と照合する。
 */
function reconcileBulkResults<Q>(target: BulkTarget<Q>, response: unknown) {
  const raw: unknown[] | null = Array.isArray(response)
    ? response
    : response && typeof response === "object" && Array.isArray((response as { items?: unknown }).items)
      ? (response as { items: unknown[] }).items
      : null
  if (raw === null) throw new BulkRequestError("サーバーの応答の形式が正しくありません", "unknown")
  const confirmedRaw = Array.isArray(response) ? undefined : (response as { confirmedCount?: unknown }).confirmedCount
  const confirmedCount =
    typeof confirmedRaw === "number" && Number.isInteger(confirmedRaw) && confirmedRaw >= 0 ? confirmedRaw : null

  const allowed = target.kind === "ids" ? new Set(target.ids) : null
  const excluded = target.kind === "query" ? new Set(target.excludedIds) : null
  const byId = new Map<string, BulkItemResult>()
  const conflicted = new Set<string>()
  let duplicates = 0
  let invalid = 0
  let unexpected = 0
  const unexpectedIds = new Set<string>()
  for (const v of raw) {
    if (!isItem(v)) {
      invalid++
      continue
    }
    if ((allowed && !allowed.has(v.id)) || excluded?.has(v.id)) {
      unexpected++
      unexpectedIds.add(v.id)
      continue
    }
    const seen = byId.get(v.id)
    if (seen) {
      duplicates++
      if (seen.outcome !== v.outcome) conflicted.add(v.id)
      continue
    }
    byId.set(v.id, cleanItem(v))
  }
  for (const id of conflicted) {
    byId.set(id, { id, outcome: "unknown", message: "サーバーから、同じ行について異なる結果を受け取りました" })
  }
  let missing = 0
  if (target.kind === "ids") {
    for (const id of target.ids) {
      if (!byId.has(id)) {
        missing++
        byId.set(id, { id, outcome: "unknown", message: "結果が返されませんでした" })
      }
    }
  }
  const items = [...byId.values()]
  let unreported: number | null = null
  let overReported = 0
  if (target.kind === "query" && confirmedCount !== null) {
    unreported = Math.max(0, confirmedCount - items.length)
    overReported = Math.max(0, items.length - confirmedCount)
  }
  const expectedCount = target.kind === "query" ? target.expectedCount : target.ids.length
  // 確認で示した件数と、バックエンドが確定した件数が異なる（選択の後にデータが増減した）。すべて完了として扱わない。
  const countChanged = target.kind === "query" && expectedCount !== null && confirmedCount !== null && expectedCount !== confirmedCount
  const integrity: BulkIntegrity = {
    missing,
    duplicates,
    unexpected,
    invalid,
    confirmedCount: target.kind === "ids" ? target.ids.length : confirmedCount,
    unreported,
    overReported,
    unexpectedIds: [...unexpectedIds],
    expectedCount,
    countChanged,
    reconciled: true,
    complete:
      missing === 0 &&
      duplicates === 0 &&
      unexpected === 0 &&
      invalid === 0 &&
      conflicted.size === 0 &&
      !countChanged &&
      (target.kind === "ids" || (confirmedCount !== null && unreported === 0 && overReported === 0)),
  }
  return {
    succeeded: items.filter((i) => i.outcome === "succeeded"),
    failed: items.filter((i) => i.outcome === "failed"),
    unknown: items.filter((i) => i.outcome === "unknown"),
    integrity,
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
  /** 結果と対象の照合の結果 */
  integrity: BulkIntegrity
}

/** すべての行が完了し、結果に不足も矛盾もない（Toast だけで知らせてよい） */
function isBulkFullySucceeded(summary: Pick<BulkSummary, "failed" | "unknown" | "requestError" | "integrity">) {
  return !summary.requestError && summary.failed.length === 0 && summary.unknown.length === 0 && summary.integrity.complete
}

type BulkRunContext = {
  signal: AbortSignal
  /** 実際の進捗を取得できる場合だけ呼ぶ。呼ばない場合、進捗率は表示しない */
  reportProgress: (done: number, total: number) => void
}

// 要求そのものが失敗した場合の値。照合する結果がないため reconciled は false（結果の不足や矛盾としては示さない）。
const failedIntegrity = (target: BulkTarget<unknown>): BulkIntegrity => ({
  missing: 0,
  duplicates: 0,
  unexpected: 0,
  invalid: 0,
  confirmedCount: target.kind === "ids" ? target.ids.length : null,
  unreported: null,
  overReported: 0,
  unexpectedIds: [],
  expectedCount: target.kind === "query" ? target.expectedCount : target.ids.length,
  countChanged: false,
  reconciled: false,
  complete: false,
})

function useBulkAction<Q = unknown, P = unknown>({
  run,
  onSettled,
  scopeKey,
}: {
  /**
   * 一括操作の実行。行ごとの結果（と、全件の選択では確定した対象の件数）を返す。
   * 要求の宛先（ワークスペースなど）は、描画の時点の値ではなく target.scope から決める。
   * signal はクライアントの待機の中止であり、サーバーでの処理の取り消しを保証しない。冪等性と実際の API の呼び出しは製品の責務
   */
  run: (target: BulkTarget<Q>, context: BulkRunContext & { action: string; payload: P }) => Promise<BulkRunResponse>
  onSettled?: (summary: BulkSummary<Q, P>) => void
  /** アカウント、ワークスペースなど。変わったら、実行の待機を中止し、結果の表示を消す（別のスコープに結果を残さない） */
  scopeKey?: string
}) {
  type Scoped<T> = { scope: string | undefined; value: T }
  const [runningState, setRunning] = React.useState<Scoped<{ action: string; target: BulkTarget<Q> }> | null>(null)
  const [progressState, setProgress] = React.useState<Scoped<{ done: number; total: number }> | null>(null)
  const [summaryState, setSummary] = React.useState<Scoped<BulkSummary<Q, P>> | null>(null)
  const busy = React.useRef(false)
  const controller = React.useRef<AbortController | null>(null)
  // 世代。スコープの変更とアンマウントで増やし、それより前に始めた実行の結果、進捗、onSettled を無効にする。
  // AbortSignal を無視する run でも、古い結果が新しい状態を書き換えない。
  const generation = React.useRef(0)
  const runSeq = React.useRef(0)
  // 古い描画の start（A → B → A の最初の A の画面や Toast の closure）と、古い Snapshot からの開始を拒否する
  const guard = useScopeGuard(scopeKey)
  // 関数と commit されたスコープは、commit の時点で更新する（描画の中で書き換えない。commit されていない描画の
  // スコープで、表示中のスコープの実行を拒否したり、結果を捨てたりしないため）
  const runRef = React.useRef(run)
  const settledRef = React.useRef(onSettled)
  const scopeNow = React.useRef(scopeKey)
  React.useLayoutEffect(() => {
    runRef.current = run
    settledRef.current = onSettled
  })

  const invalidate = () => {
    generation.current++
    controller.current?.abort()
    controller.current = null
    busy.current = false
  }

  // スコープが変わったら、実行中の待機を中止し、結果を表示しない。サーバーでの処理の扱いは製品の run が決める。
  React.useLayoutEffect(() => {
    if (scopeNow.current === scopeKey) return
    scopeNow.current = scopeKey
    invalidate()
    setRunning(null)
    setProgress(null)
    setSummary(null)
  }, [scopeKey])

  // アンマウントしたら、実行の待機を中止し、届いた結果を無効にする。
  React.useLayoutEffect(() => () => invalidate(), [])

  /**
   * 実行する。実行中は何もしない（二重実行の防止。ボタンの無効化より前に、同じ描画の中の 2 回目の押下も止める）。
   * target の ID の配列は写して固定する。query と payload は、書き換えない値として扱う（不変のデータの契約）。
   * keepSummary：再試行のときは、結果が出るまで前の結果の表示を残す（押したボタンを消さない）。
   * from：操作の入口（Toast の「元に戻す」、確認の Dialog）を作ったときに capture() で取った Snapshot。
   *   スコープか世代が現在と異なる場合は実行しない（A → B → A の最初の A で作った入口からの実行を止める）。
   * 戻り値：結果。実行しなかった場合と、実行したがスコープの変更やアンマウントで結果を捨てた場合は undefined
   *   （後者はサーバーで処理された可能性がある。製品はスコープに戻ったときに取得し直して確かめる）。
   */
  const start = React.useCallback(async (action: string, target: BulkTarget<Q>, payload: P, { keepSummary = false, from }: { keepSummary?: boolean; from?: ScopeSnapshot } = {}) => {
    if (busy.current) return undefined
    // 前のスコープの描画の start、commit の前、アンマウントの後、古い Snapshot からは実行しない
    if (!guard.isCurrent(from ?? guard.capture())) return undefined
    // 別のスコープで固定した対象（スコープを変えた後に押された「元に戻す」など）は実行しない。
    if (target.scope !== undefined && target.scope !== scopeNow.current) return undefined
    // 対象が 0 件の ID の実行はしない（「0件が完了しました」と知らせない）。
    if (target.kind === "ids" && target.ids.length === 0) return undefined
    busy.current = true
    const gen = generation.current
    const runId = ++runSeq.current
    const scope = scopeNow.current
    const ac = new AbortController()
    controller.current = ac
    const fixed: BulkTarget<Q> =
      target.kind === "ids" ? { ...target, ids: [...target.ids] } : { ...target, excludedIds: [...target.excludedIds] }
    setRunning({ scope, value: { action, target: fixed } })
    setProgress(null)
    if (!keepSummary) setSummary(null)
    let result: BulkSummary<Q, P>
    try {
      const response = await runRef.current(fixed, {
        action,
        payload,
        signal: ac.signal,
        reportProgress: (done, total) => {
          // 前の実行から遅れて届いた進捗を、次の実行の進捗として示さない。
          if (gen === generation.current && runId === runSeq.current && busy.current) setProgress({ scope, value: { done, total } })
        },
      })
      result = { action, target: fixed, payload, requestError: null, ...reconcileBulkResults(fixed, response) }
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
        integrity: failedIntegrity(fixed),
      }
    }
    // スコープが変わった後（効果が走る前の描画を含む）、またはアンマウントの後に届いた結果は反映しない（onSettled も呼ばない）。
    if (gen !== generation.current || scope !== scopeNow.current) {
      if (gen === generation.current) busy.current = false
      return undefined
    }
    busy.current = false
    controller.current = null
    setRunning(null)
    setProgress(null)
    setSummary({ scope, value: result })
    settledRef.current?.(result)
    return result
  }, [guard])

  // 描画の時点で、現在のスコープの値だけを返す（効果が走るまでの描画でも、別のスコープの実行と結果を返さない）。
  const pick = <T,>(v: Scoped<T> | null) => (v && v.scope === scopeKey ? v.value : null)
  const running = pick(runningState)
  const progress = pick(progressState)
  const summary = pick(summaryState)

  /**
   * 失敗した行（再試行できるもの）だけを、同じ操作の内容で再試行する。完了した行と、結果が不明な行は含めない。
   * 全件の選択の要求そのものが失敗した場合（処理されていない）は、同じ対象で再試行する。
   */
  const retryFailed = React.useCallback(() => {
    if (!summary) return undefined
    if (summary.requestError?.outcome === "failed") return start(summary.action, summary.target, summary.payload, { keepSummary: true })
    const ids = summary.failed.filter((i) => i.retryable !== false).map((i) => i.id)
    if (ids.length === 0) return undefined
    return start(
      summary.action,
      { kind: "ids", ids, scope: summary.target.scope, selectionRevision: summary.target.selectionRevision },
      summary.payload,
      { keepSummary: true }
    )
  }, [summary, start])

  return {
    /** 実行中の操作と対象 */
    running,
    /** 実際の進捗。製品が reportProgress を呼んだ場合だけ値がある */
    progress,
    /** 最後の実行の結果 */
    summary,
    start,
    /** 操作の入口（Toast、確認の Dialog）を作るときのスコープと世代。start の from に渡す */
    capture: guard.capture,
    retryFailed,
    /** 結果の表示を閉じる */
    dismiss: () => setSummary(null),
    /** 実行の待機の中止を要求する（signal を中止する）。サーバーでの処理の取り消しは保証しない。処理済みの行の扱いは製品の run が返す */
    cancel: () => controller.current?.abort(),
  }
}

export { BulkRequestError, isBulkFullySucceeded, reconcileBulkResults, useBulkAction, useBulkSelection }
export type {
  BulkIntegrity,
  BulkItemResult,
  BulkOutcome,
  BulkRunContext,
  BulkRunResponse,
  BulkSummary,
  BulkTarget,
  UseBulkSelectionOptions,
}
