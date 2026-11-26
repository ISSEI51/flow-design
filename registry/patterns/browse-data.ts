"use client"

import * as React from "react"

// Flow Design Browse Data（Patterns / Data Browsing / Data States）
// 条件（query）に対応するデータを取得し、表示してよいデータと状態を返す。定義は docs/web/patterns/data-states.md を参照。
// 特定のデータ取得のライブラリに依存しない。取得の処理（fetcher）は製品が渡す。
// 製品がデータ取得のライブラリ（キャッシュを持つもの）を使う場合は、この hook を使わず、同じ規則で状態を対応させる。
//
// この部品が守ること
// - 最新の要求の応答だけを反映する。古い要求の成功・失敗で、現在の状態を上書きしない（要求ごとの番号と AbortController）。
// - 再取得の間は、前のデータを残す（refreshing）。ただし keepPreviousData が false の場合（詳細の別のレコードなど）は残さない。
// - 条件を変えた直後の描画から、前の条件のデータを「最新の結果」として返さない（status は同じ描画で refreshing か loading になる）。
//   前の条件の要求の成功・失敗・再取得中の状態も、新しい条件の状態として返さない（requestKey で区別する）。
// - scopeKey（アカウント、ワークスペース、権限）が変わったら、同じ描画から前のデータを返さず、初回の読み込みに戻す。
// - 同じ条件の再取得に失敗したときは、前のデータを残し、refreshFailed で区別する（取得成功と同じ扱いにしない）。
//   条件を変えた後の取得に失敗したときは、前の条件のデータを結果として表示しないよう、status を error にする。

type BrowseDataStatus = "idle" | "loading" | "refreshing" | "ready" | "error"

type BrowseDataOptions<Q, T> = {
  /** 取得の条件 */
  query: Q
  /** 取得の処理。signal で中止できるようにする */
  fetcher: (query: Q, context: { signal: AbortSignal }) => Promise<T>
  /** 条件を比べるキー。既定は JSON.stringify(query) */
  queryKey?: string
  /** アカウント、ワークスペース、権限など。変わったら、前のデータを破棄して初回の読み込みに戻す */
  scopeKey?: string
  /**
   * 条件が変わったときに、新しい結果が届くまで前のデータを表示し続けるか。既定は true（一覧の再取得）。
   * 詳細で別のレコードに切り替える場合は false にし、別のレコードの情報を現在のレコードとして表示しない。
   */
  keepPreviousData?: boolean | ((previousKey: string, nextKey: string) => boolean)
  /** false の間は取得しない（詳細を開いていないときなど）。status は idle */
  enabled?: boolean
  /** 取得済みのデータ（サーバーで描画したデータ、一覧に戻ったときに製品が保持していたデータ） */
  initialData?: { data: T; key: string; fetchedAt?: number | null }
  /** initialData があるときに、表示した後で取得し直す。既定は true */
  revalidateInitialData?: boolean
}

type State<T> = {
  data: T | undefined
  dataKey: string | null
  scope: string | undefined
  status: BrowseDataStatus
  error: unknown
  refreshFailed: boolean
  fetchedAt: number | null
  /** 最後に送った要求の条件のキー。status はこの要求の状態を表す */
  requestKey: string | null
}

const keyOf = (query: unknown) => JSON.stringify(query) ?? ""

function useBrowseData<Q, T>({
  query,
  fetcher,
  queryKey,
  scopeKey,
  keepPreviousData = true,
  enabled = true,
  initialData,
  revalidateInitialData = true,
}: BrowseDataOptions<Q, T>) {
  const key = queryKey ?? keyOf(query)
  const [state, setState] = React.useState<State<T>>(() =>
    initialData
      ? {
          data: initialData.data,
          dataKey: initialData.key,
          scope: scopeKey,
          status: "ready",
          error: null,
          refreshFailed: false,
          fetchedAt: initialData.fetchedAt ?? null,
          requestKey: initialData.key,
        }
      : {
          data: undefined,
          dataKey: null,
          scope: scopeKey,
          status: enabled ? "loading" : "idle",
          error: null,
          refreshFailed: false,
          fetchedAt: null,
          requestKey: enabled ? key : null,
        }
  )
  const [reloadToken, setReloadToken] = React.useState(0)
  const seq = React.useRef(0)
  const fetcherRef = React.useRef(fetcher)
  fetcherRef.current = fetcher
  const queryRef = React.useRef(query)
  queryRef.current = query
  const keepRef = React.useRef(keepPreviousData)
  keepRef.current = keepPreviousData
  const skipFirst = React.useRef(Boolean(initialData && !revalidateInitialData && initialData.key === key))

  const shouldKeep = (previousKey: string | null, nextKey: string) => {
    if (previousKey === null) return false
    if (previousKey === nextKey) return true
    const keep = keepRef.current
    return typeof keep === "function" ? keep(previousKey, nextKey) : keep
  }

  React.useEffect(() => {
    if (!enabled) {
      seq.current++
      setState((s) =>
        // 取得しない間にスコープが変わった場合も、前のスコープのデータを残さない。
        s.scope !== scopeKey
          ? { data: undefined, dataKey: null, scope: scopeKey, status: "idle", error: null, refreshFailed: false, fetchedAt: null, requestKey: null }
          : s.status === "idle"
            ? s
            : { ...s, status: "idle", error: null, refreshFailed: false, requestKey: null }
      )
      return
    }
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    const id = ++seq.current
    const controller = new AbortController()
    setState((s) => {
      if (s.scope !== scopeKey) {
        return { data: undefined, dataKey: null, scope: scopeKey, status: "loading", error: null, refreshFailed: false, fetchedAt: null, requestKey: key }
      }
      if (s.data !== undefined && shouldKeep(s.dataKey, key)) return { ...s, status: "refreshing", error: null, requestKey: key }
      return { ...s, data: undefined, dataKey: null, status: "loading", error: null, refreshFailed: false, fetchedAt: null, requestKey: key }
    })
    let request: Promise<T>
    try {
      request = fetcherRef.current(queryRef.current, { signal: controller.signal })
    } catch (error) {
      request = Promise.reject(error)
    }
    request.then(
      (data) => {
        if (id !== seq.current) return
        setState({ data, dataKey: key, scope: scopeKey, status: "ready", error: null, refreshFailed: false, fetchedAt: Date.now(), requestKey: key })
      },
      (error: unknown) => {
        if (id !== seq.current || controller.signal.aborted) return
        setState((s) =>
          // 同じ条件の再取得の失敗：前のデータは、この条件の最後の結果として残す。
          s.data !== undefined && s.dataKey === key
            ? { ...s, status: "ready", error, refreshFailed: true }
            : { ...s, status: "error", error, refreshFailed: false }
        )
      }
    )
    return () => controller.abort()
    // shouldKeep は ref を読むため、依存に含めない。
  }, [key, scopeKey, enabled, reloadToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // アンマウントしたら、送った要求の応答を無効にする（AbortSignal を無視する fetcher の応答も反映しない）。
  React.useEffect(
    () => () => {
      seq.current++
    },
    []
  )

  // 描画の時点で、条件やスコープが変わったことを反映する（効果が走るまでの 1 回の描画でも、古いデータを最新として返さない）。
  let { data, status } = state
  let dataKey = state.dataKey
  const sameScope = state.scope === scopeKey
  if (!sameScope) {
    // 別のスコープのデータは、取得しない間（enabled: false）も含めて、1 回の描画でも返さない。
    data = undefined
    dataKey = null
    status = enabled ? "loading" : "idle"
  } else if (enabled && state.requestKey !== key) {
    // 現在の条件の要求をまだ送っていない（効果が走る前の描画）。前の要求の状態（成功、失敗、再取得中）を返さない。
    if (data !== undefined && shouldKeep(state.dataKey, key)) status = "refreshing"
    else {
      data = undefined
      dataKey = null
      status = "loading"
    }
  } else if (!enabled) {
    status = "idle"
  }

  const reload = React.useCallback(() => setReloadToken((t) => t + 1), [])
  /**
   * 保存した結果などを、取得し直さずに反映する。
   * 遅れて届いた保存の応答を、別のスコープや別の条件のデータに反映しないよう、保存を始めたときの scopeKey と dataKey を渡せる。
   */
  const setData = React.useCallback((updater: (data: T) => T, guard?: { scopeKey?: string; dataKey?: string | null }) => {
    setState((s) => {
      if (s.data === undefined) return s
      if (guard && "scopeKey" in guard && guard.scopeKey !== s.scope) return s
      if (guard && guard.dataKey !== undefined && guard.dataKey !== s.dataKey) return s
      return { ...s, data: updater(s.data) }
    })
  }, [])

  const isCurrent = status === "ready" && dataKey === key
  const refreshFailed = isCurrent && state.refreshFailed
  return {
    /**
     * 表示できるデータ。現在の条件の結果とは限らない（再取得中は前の条件のデータ）。
     * status が error のときは、結果として表示しない（前の条件のデータが残っている場合がある）
     */
    data,
    /** data が対応する条件のキー */
    dataKey,
    status,
    /** 最新の要求の失敗（現在のスコープのもの） */
    error: sameScope && (status === "error" || refreshFailed) ? state.error : null,
    /** 同じ条件の再取得に失敗し、前のデータ（この条件の最後に確定した結果）を表示している */
    refreshFailed,
    /** data が現在の条件の結果として表示できる（同じ条件の再取得に失敗した場合も true） */
    isCurrent,
    /**
     * data に依存する変更の操作（一括操作、行の削除、編集の開始など）を受け付けてよい。
     * 現在の条件の結果で、かつ最新の取得に成功している（再取得中、取得失敗、同じ条件の再取得の失敗では false）。
     * isCurrent や status === "ready" だけで操作の可否を判断しない。
     */
    canOperate: isCurrent && !state.refreshFailed,
    /** data を取得した時刻（Date.now()）。サーバーで描画した値には含まれない */
    fetchedAt: sameScope && dataKey === key ? state.fetchedAt : null,
    /** 同じ条件で取得し直す */
    reload,
    /** 保存した結果などを、取得し直さずに反映する */
    setData,
  }
}

// 状態そのもの（active）と、視覚的な読み込みの表示の開始を分ける。
// active が delay（既定 200ms）続いたときだけ true を返す。短い読み込みで Skeleton や Spinner がちらつかない。
// 操作の制限など安全性に必要な処理には、この値ではなく active を使う（遅らせない）。
// 最低表示時間は設けない。active が false になったら、すぐに false を返す。
function useDelayedFlag(active: boolean, delay = 200) {
  const [elapsed, setElapsed] = React.useState(false)
  React.useEffect(() => {
    if (!active) {
      setElapsed(false)
      return
    }
    const timer = setTimeout(() => setElapsed(true), delay)
    return () => clearTimeout(timer)
  }, [active, delay])
  return active && elapsed
}

type BrowseViewState = "loading" | "refreshing" | "ready" | "empty" | "no-results" | "error" | "idle"

// 表示する内容（Skeleton、データ、Empty、Error）を、取得の状態と件数から決める。Table 以外の表示形式でも使う。
// 未登録（empty）と検索結果 0 件（no-results）を、条件が適用されているか（filtered）で分ける。
function getBrowseViewState({ status, count, filtered }: { status: BrowseDataStatus; count: number; filtered: boolean }): BrowseViewState {
  if (status === "ready" && count === 0) return filtered ? "no-results" : "empty"
  return status
}

export { getBrowseViewState, useBrowseData, useDelayedFlag }
export type { BrowseDataOptions, BrowseDataStatus, BrowseViewState }
