"use client"

import * as React from "react"

import { useBrowseData } from "./browse-data"
import {
  computeUnreadCount,
  countUnread,
  createReadAllRange,
  isInReadAllRange,
  mergeNotifications,
  sortNotifications,
  withoutKnown,
  type NotificationLike,
  type ReadAllRange,
} from "./notification-state"
import { useScopeGuard, type ScopeTicket } from "./scope-guard"

// Flow Design Notification Feed（Patterns / System & Account / Notifications）
// 通知の一覧の取得、新着、既読・未読の更新、一括既読の状態を持つ hook。定義は docs/web/patterns/notifications.md を参照。
// 取得は useBrowseData（Data States）、既読の更新は useScopeGuard（通知の ID ごと）の規則に従う。
// 通信の処理（取得、既読の更新、一括既読）は製品が渡す。特定の通信・状態管理のライブラリに依存しない。
//
// この部品が守ること
// - 取得の状態（初回、再取得中、取得失敗、再取得の失敗）を Data States と同じ規則で返す。
// - scopeKey（アカウント、ワークスペース、権限）が変わったら、同じ描画から前の通知、未読の件数、保留中の新着、
//   更新中の状態を返さない。前のスコープで始めた更新の応答は、A → B → A と戻っても反映しない。
// - 既読・未読の更新は、すぐに画面に反映し（更新中の値）、応答で確定する。通知の ID ごとに最後に始めた更新だけを反映する
//   （連続した操作で、古い応答が新しい状態を上書きしない）。
//   失敗（処理されなかったことが確か）なら元の状態に戻す。結果が不明なら元の状態に戻したうえで取得し直す。
// - 確定した既読の状態を、確定より前に始めた取得の応答で上書きしない（確定の順番と、取得を始めた時点の順番で比べる）。
// - 一括既読は、開始した時点の範囲に固定する（ids：読み込み済みの未読の ID、cursor：開始した時点の最も新しい通知まで）。
//   処理中に届いた新着を既読にしない。cursor では読み込んでいない通知も対象になるため、成功した後に取得し直して件数を確定する。
// - 新着は holdIncoming の間は保留する（一覧の位置とフォーカスを動かさない）。未読の件数には含める。
// - 重複は安定した ID とイベントの ID で除く（notification-state.ts）。
//
// この部品が持たないもの（製品の責務）
// - 通信、リアルタイムの受信（WebSocket、ポーリング）。製品が受け取った新着を receive に渡す。
// - サーバーでの既読の順序の保証（同じ通知への更新を受け付けた順に処理する、または版で古い要求を拒否する）。
// - 閲覧の権限の確認。権限が変わったら scopeKey を変え、サーバーは権限のない内容を返さない。

type NotificationPage<T> = {
  items: T[]
  /** サーバーが数えた未読の件数（取得した時点）。不明なら null */
  unreadCount: number | null
  /** 読み込んでいない古い通知がある */
  hasMore?: boolean
}

type RequestContext = { signal: AbortSignal }

type UpdateResult = {
  /** 実際に更新した ID。省略すると、要求したすべての ID（ids の範囲） */
  updated?: string[]
  /** 実際に既読にした件数（cursor の範囲で、ID を返さない場合） */
  count?: number
} | void

type NotificationUpdateError = {
  kind: "read" | "read-all"
  /** failed：処理されなかったことが確か。unknown：処理されたかがわからない（取得し直している） */
  outcome: "failed" | "unknown"
  ids: string[]
  read: boolean
}

type NotificationFeedOptions<T extends NotificationLike> = {
  /** アカウント、ワークスペース、権限など。変わったら前の通知と非同期の応答を破棄する */
  scopeKey: string | undefined
  fetcher: (context: RequestContext) => Promise<NotificationPage<T>>
  /** 既読・未読の更新。updated で、実際に更新した ID を返せる（省略すると ids すべて） */
  updateRead: (ids: string[], read: boolean, context: RequestContext) => Promise<UpdateResult>
  /** 一括既読。range の ids（または cursor）の通知だけを既読にする。省略すると updateRead を使う（ids の範囲だけ） */
  markAllRead?: (range: ReadAllRange, context: RequestContext) => Promise<UpdateResult>
  /**
   * 一括既読の範囲の決め方。
   * ids：読み込み済みの未読の通知だけ。cursor：開始した時点の最も新しい通知までのすべて（読み込んでいない通知を含む。markAllRead が必要）
   */
  readAllBy?: "ids" | "cursor"
  /** true の間、新着を保留する（pending）。false になったら一覧に加える */
  holdIncoming?: boolean
  enabled?: boolean
  /** 失敗の種類の判別。既定は error.outcome === "failed" だけを「処理されなかった」とし、それ以外は結果が不明とする */
  classifyError?: (error: unknown) => "failed" | "unknown" | "aborted"
}

/** 確定した既読の状態と、その順番（取得を始めた時点の順番と比べる） */
type Confirmed = { read: boolean; order: number }

type LocalState<T> = {
  scope: string | undefined
  /** 更新中の既読の状態（サーバーの結果に未反映） */
  overrides: Map<string, boolean>
  /** 応答で確定した既読の状態。確定より前に始めた取得の結果より優先する */
  confirmed: Map<string, Confirmed>
  /** cursor の一括既読が確定した範囲。読み込んでいない通知も既読になった */
  confirmedRange: { range: ReadAllRange; order: number } | null
  /** 保留している新着 */
  pending: T[]
  /** 一括既読の実行中の範囲 */
  readAll: ReadAllRange | null
  error: NotificationUpdateError | null
  /** 読み上げる結果の文（「3 件を既読にしました」） */
  announcement: string
}

const emptyLocal = <T,>(scope: string | undefined): LocalState<T> => ({
  scope,
  overrides: new Map(),
  confirmed: new Map(),
  confirmedRange: null,
  pending: [],
  readAll: null,
  error: null,
  announcement: "",
})

const defaultClassify = (error: unknown): "failed" | "unknown" | "aborted" => {
  if (error instanceof DOMException && error.name === "AbortError") return "aborted"
  if (error && typeof error === "object" && "outcome" in error && (error as { outcome: unknown }).outcome === "failed") return "failed"
  return "unknown"
}

/** 取得した通知と、取得を始めた時点の順番 */
type Fetched<T> = { page: NotificationPage<T>; startedAt: number }

function useNotificationFeed<T extends NotificationLike>({
  scopeKey,
  fetcher,
  updateRead,
  markAllRead,
  readAllBy = "ids",
  holdIncoming = false,
  enabled = true,
  classifyError = defaultClassify,
}: NotificationFeedOptions<T>) {
  // 確定と取得の開始の順番。確定より前に始めた取得の応答で、確定した状態を上書きしないために使う。
  const clock = React.useRef(0)
  const data = useBrowseData<string, Fetched<T>>({
    query: "notifications",
    queryKey: "notifications",
    fetcher: (_q, context) => {
      const startedAt = clock.current
      return fetcher(context).then((page) => ({ page, startedAt }))
    },
    scopeKey,
    enabled,
  })
  const guard = useScopeGuard(scopeKey)
  const [stored, setLocal] = React.useState<LocalState<T>>(() => emptyLocal(scopeKey))
  // 別のスコープの保留中の新着と更新中の状態は、1 回の描画でも返さない。
  const local = stored.scope === scopeKey ? stored : emptyLocal<T>(scopeKey)
  if (stored.scope !== scopeKey) setLocal(local)

  const fetched = data.data
  const page = fetched?.page
  // サーバーの結果としての通知：取得した通知に、取得を始めた後で確定した既読の状態を重ねる
  const view = React.useMemo(() => {
    if (!fetched) return null
    const startedAt = fetched.startedAt
    const range = local.confirmedRange && local.confirmedRange.order > startedAt ? local.confirmedRange : null
    let delta = 0
    const base = sortNotifications(fetched.page.items).map((n) => {
      let read = n.read
      let order = -1
      if (range && isInReadAllRange(n, range.range)) {
        read = true
        order = range.order
      }
      const c = local.confirmed.get(n.id)
      if (c && c.order > startedAt && c.order > order) read = c.read
      if (read === n.read) return n
      delta += read ? -1 : 1
      return { ...n, read }
    })
    const reported = fetched.page.unreadCount
    // cursor の一括既読が確定した後は、読み込んでいない通知もすべて範囲の中（既読）。未読は読み込み済みの通知だけになる
    const unreadReported = range ? countUnread(base) : reported === null ? null : Math.max(0, reported + delta)
    return { base, reported: unreadReported, complete: Boolean(range) || fetched.page.hasMore === false }
  }, [fetched, local.confirmed, local.confirmedRange])

  const base = React.useMemo(() => view?.base ?? [], [view])
  const items = React.useMemo(
    () => (local.overrides.size === 0 ? base : base.map((n) => (local.overrides.has(n.id) ? { ...n, read: local.overrides.get(n.id)! } : n))),
    [base, local.overrides]
  )
  const pending = React.useMemo(() => withoutKnown(base, local.pending), [base, local.pending])
  const unreadCount = view ? computeUnreadCount({ reported: view.reported, base, shown: items, pending, complete: view.complete }) : null
  const hasUnread = unreadCount !== null ? unreadCount > 0 : items.some((n) => !n.read) || pending.some((n) => !n.read) ? true : null

  const unreadRef = React.useRef(unreadCount)
  unreadRef.current = unreadCount
  const refs = React.useRef({ updateRead, markAllRead, classifyError, data, local, items, readAllBy })
  refs.current = { updateRead, markAllRead, classifyError, data, local, items, readAllBy }

  /** 応答で確定した既読の状態を記録し、更新中の値を消す（同じ描画で行い、表示をちらつかせない） */
  const settle = React.useCallback(
    (scope: string | undefined, { confirm, clear, range }: { confirm?: Map<string, boolean>; clear: readonly string[]; range?: ReadAllRange }) =>
      setLocal((s) => {
        if (s.scope !== scope) return s
        const overrides = new Map(s.overrides)
        for (const id of clear) overrides.delete(id)
        let confirmed = s.confirmed
        if (confirm && confirm.size > 0) {
          confirmed = new Map(s.confirmed)
          for (const [id, read] of confirm) confirmed.set(id, { read, order: ++clock.current })
        }
        const confirmedRange = range ? { range, order: ++clock.current } : s.confirmedRange
        return { ...s, overrides, confirmed, confirmedRange }
      }),
    []
  )

  /**
   * 更新を実行する。通知の ID ごとに ticket を取り、応答の時点でその ID の最新の更新だけを反映する。
   * 一括既読も同じ処理で、開始した時点の範囲に固定する。
   */
  const run = React.useCallback(
    (kind: "read" | "read-all", ids: string[], read: boolean, call: (signal: AbortSignal) => Promise<UpdateResult>, range: ReadAllRange | null) => {
      const op = guard.begin(kind === "read-all" ? "read-all" : `read:${ids.join(",")}`)
      const tickets = new Map<string, ScopeTicket>(ids.map((id) => [id, guard.begin(id)]))
      const scope = op.scope
      setLocal((s) => {
        if (s.scope !== scope) return s
        const overrides = new Map(s.overrides)
        for (const id of ids) overrides.set(id, read)
        return { ...s, overrides, readAll: range ?? s.readAll, error: null, announcement: "" }
      })
      let request: Promise<UpdateResult>
      try {
        request = call(op.signal)
      } catch (error) {
        request = Promise.reject(error)
      }
      const latestIds = () => ids.filter((id) => guard.isLatest(tickets.get(id)!))
      const finishReadAll = () => {
        if (!range || !guard.isSameScope(op)) return
        setLocal((s) => (s.scope === scope && s.readAll === range ? { ...s, readAll: null } : s))
      }
      request.then(
        (result) => {
          if (!guard.isSameScope(op)) return
          const current = latestIds()
          finishReadAll()
          const cursor = range?.kind === "cursor"
          const updated = result && result.updated ? new Set(result.updated) : new Set(ids)
          const confirmedIds = current.filter((id) => updated.has(id))
          settle(scope, { confirm: new Map(confirmedIds.map((id) => [id, read])), clear: current, range: cursor ? range! : undefined })
          // cursor：読み込んでいない通知の件数はサーバーの結果で確かめる。ids：更新されなかった ID（削除されたなど）を確かめる。
          if (cursor || confirmedIds.length < current.length) refs.current.data.reload()
          if (kind === "read-all") {
            const n = result && typeof result.count === "number" ? result.count : result && result.updated ? result.updated.length : ids.length
            setLocal((s) => (s.scope === scope ? { ...s, announcement: `${n} 件を既読にしました` } : s))
          }
        },
        (error: unknown) => {
          const outcome = refs.current.classifyError(error)
          if (outcome === "aborted" || !guard.isSameScope(op)) return
          const current = latestIds()
          finishReadAll()
          if (current.length === 0 && kind === "read") return
          settle(scope, { clear: current })
          setLocal((s) => (s.scope === scope ? { ...s, error: { kind, outcome, ids: current, read } } : s))
          // 結果が不明：サーバーで処理された可能性があるため、実際の状態を取得し直す。
          if (outcome === "unknown") refs.current.data.reload()
        }
      )
    },
    [guard, settle]
  )

  const setRead = React.useCallback(
    (ids: string | readonly string[], read: boolean) => {
      const list = typeof ids === "string" ? [ids] : [...ids]
      if (list.length === 0) return
      run("read", list, read, (signal) => refs.current.updateRead(list, read, { signal }), null)
    },
    [run]
  )

  /**
   * 一括既読。開始した時点の範囲を固定する（保留中の新着を含めない）。
   * ids：読み込み済みの未読の通知だけ。cursor：開始した時点の最も新しい通知までのすべて（読み込んでいない通知を含む）。
   */
  const readAll = React.useCallback(() => {
    const { local: l, items: shown, readAllBy: by, markAllRead: call } = refs.current
    if (!refs.current.data.data || l.readAll) return null
    const cursor = by === "cursor" && Boolean(call)
    const range = createReadAllRange(shown, { scope: guard.scope, by: cursor ? "cursor" : "ids" })
    if (range.ids.length === 0 && !(cursor && unreadRef.current !== 0)) return null
    run(
      "read-all",
      range.ids,
      true,
      (signal) => (call ? call(range, { signal }) : refs.current.updateRead(range.ids, true, { signal })),
      range
    )
    return range
  }, [guard, run])

  /**
   * 新着を受け取る。scopeKey は受け取った通知のスコープ（購読を始めたときの値）。
   * 現在のスコープと異なる場合（切り替えの前に届いた古い通知）は捨てる。
   */
  const receive = React.useCallback(
    (incoming: readonly T[], source: { scopeKey: string | undefined }) => {
      if (source.scopeKey !== guard.scope || incoming.length === 0) return
      setLocal((s) => {
        if (s.scope !== source.scopeKey) return s
        const added = withoutKnown(s.pending, incoming)
        return added.length === 0 ? s : { ...s, pending: [...s.pending, ...added] }
      })
    },
    [guard]
  )

  /** 保留している新着を一覧に加える */
  const showPending = React.useCallback(() => {
    const { local: l } = refs.current
    if (l.pending.length === 0) return
    const scope = l.scope
    const arrived = l.pending
    refs.current.data.setData(
      (f) => {
        const { items: merged, added } = mergeNotifications(f.page.items, arrived)
        const unread = added.filter((n) => !n.read).length
        return { ...f, page: { ...f.page, items: merged, unreadCount: f.page.unreadCount === null ? null : f.page.unreadCount + unread } }
      },
      { scopeKey: scope }
    )
    setLocal((s) => (s.scope === scope ? { ...s, pending: [] } : s))
  }, [])

  // 保留しない間は、届いた新着をすぐに一覧に加える。
  React.useEffect(() => {
    if (!holdIncoming && local.pending.length > 0 && data.data) showPending()
  }, [holdIncoming, local.pending, data.data, showPending])

  const dismissError = React.useCallback(() => setLocal((s) => (s.error ? { ...s, error: null } : s)), [])

  return {
    /** 取得の状態（useBrowseData と同じ） */
    status: data.status,
    /** 表示する通知（新しい順、更新中の既読の状態を反映）。取得の状態が error のときは表示しない */
    items,
    /** 未読の件数。不明なら null（架空の件数を作らない） */
    unreadCount,
    /** 未読があるか。不明なら null */
    hasUnread,
    /** 読み込んでいない古い通知がある */
    hasMore: page?.hasMore ?? false,
    /** 一括既読の範囲の決め方（実際に使う方式。markAllRead がない場合は ids） */
    readAllBy: (readAllBy === "cursor" && markAllRead ? "cursor" : "ids") as "ids" | "cursor",
    /** 保留している新着（一覧と重複しないもの） */
    pending,
    showPending,
    receive,
    /** 既読・未読の更新（1 件または複数） */
    setRead,
    /** 一括既読。開始した範囲を返す（対象がなければ null） */
    readAll,
    /** 一括既読の実行中の範囲 */
    readAllRange: local.readAll,
    /** 更新中の通知の ID */
    updatingIds: local.overrides as ReadonlyMap<string, boolean>,
    /** 最後の更新の失敗 */
    error: local.error,
    dismissError,
    /** 読み上げる結果の文 */
    announcement: local.announcement,
    /** 表示中の通知が現在のスコープの結果（再取得の失敗を含む） */
    isCurrent: data.isCurrent,
    /** 既読の操作を受け付けてよい（現在のスコープの通知を表示している） */
    canOperate: data.isCurrent,
    refreshFailed: data.refreshFailed,
    fetchError: data.error,
    fetchedAt: data.fetchedAt,
    reload: data.reload,
  }
}

type NotificationFeed<T extends NotificationLike> = ReturnType<typeof useNotificationFeed<T>>

export { useNotificationFeed }
export type { NotificationFeed, NotificationFeedOptions, NotificationPage, NotificationUpdateError, UpdateResult }
