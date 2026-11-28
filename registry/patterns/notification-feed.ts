"use client"

import * as React from "react"

import { useBrowseData } from "./browse-data"
import {
  computeUnreadCount,
  countUnread,
  createReadAllRange,
  dedupeNotifications,
  isInReadAllRange,
  isUnreadCountInconsistent,
  mergeNotifications,
  reconcilePending,
  sortNotifications,
  summarizeReadUpdate,
  withoutKnown,
  type NotificationLike,
  type PendingEntry,
  type ReadAllRange,
  type ReadUpdateReport,
  type ReadUpdateSummary,
} from "./notification-state"
import { useScopeGuard, type ScopeSnapshot, type ScopeTicket } from "./scope-guard"

// Flow Design Notification Feed（Patterns / System & Account / Notifications）
// 通知の一覧の取得、新着、既読・未読の更新、一括既読の状態を持つ hook。定義は docs/web/patterns/notifications.md を参照。
// 取得は useBrowseData（Data States）、既読の更新と購読は useScopeGuard（通知の ID ごと、購読ごと）の規則に従う。
// 通信の処理（取得、既読の更新、一括既読）は製品が渡す。特定の通信・状態管理のライブラリに依存しない。
//
// scopeKey の契約
// - scopeKey には、アカウント、ワークスペース、認可の範囲（権限の版、ロール、閲覧できる範囲）を含める。
//   同じワークスペースで認可の範囲が変わった場合も scopeKey を変える。変えない場合、この部品は認可の変更を検出できない。
//
// この部品が守ること
// - 取得の状態（初回、再取得中、取得失敗、再取得の失敗）を Data States と同じ規則で返す。
// - scopeKey が変わったら、同じ描画から前の通知、未読の件数、保留中の新着、更新中の状態を返さない。
//   前のスコープの世代で始めた更新と購読の結果は、A → B → A と戻っても反映しない（scopeKey と世代の両方で照合する）。
// - 新着の購読：subscribe() で購読ごとの Subscription を取り、receive(items, subscription) に渡す。
//   解除した購読、前の世代の購読（A → B → A の最初の A、権限の変更の前）、アンマウントの後、取得を停止している間（enabled: false）の
//   購読から届いた通知は受け付けない（receive は false を返す）。
// - 既読・未読の更新は、すぐに画面に反映し（更新中の値）、応答で確定する。通知の ID ごとに最後に始めた更新だけを反映する
//   （連続した操作で、古い応答が新しい状態を上書きしない）。これはクライアントの応答の順序の管理であり、
//   サーバーでの処理の順序を保証しない（製品のサーバーが、受け付けた順の処理か、版による古い要求の拒否を行う）。
// - 応答の結果は、確認できた結果（更新された ID、検証できる件数）から求める（summarizeReadUpdate）。要求した件数を成功の件数にしない。
//   更新されなかった ID（削除された、権限を失った、版で拒否された）は元に戻して取得し直す。
//   失敗（処理されなかったことが確か）なら元の状態に戻す。結果が不明（応答が届かない、件数を確認できない、
//   同じスコープの中での中止（AbortError））なら、「確認中」として扱い（未読の件数は不明）、取得し直した結果で確定する。
// - 前のスコープの描画で返した setRead、readAll（古い画面や Toast の closure）からの呼び出しは、要求を送らずに無視する
//   （readAll は null を返す）。
// - 確定した既読の状態を、確定より前に始めた取得の応答で上書きしない（確定の順番と、取得を始めた時点の順番で比べる）。
//   確定の記録は、確定の後に始めた取得の結果が届いたら消す（長時間の利用で増え続けない）。処理のキーの記録は release で消す。
// - 一括既読は、開始した時点の範囲に固定する（ids：読み込み済みの未読の ID、cursor：開始した時点の最も新しい通知まで）。
//   処理中に届いた新着を既読にしない。cursor では読み込んでいない通知も対象になるため、成功した後に取得し直して件数を確定する。
// - 新着は holdIncoming の間は保留する（一覧の位置とフォーカスを動かさない）。未読の件数には、サーバーの件数に
//   まだ含まれていない新着だけを加える（reconcilePending。取得した一覧と保留中の新着の両方にある通知を二重に数えない）。
// - 重複は安定した ID とイベントの ID で除く（取得した一覧の中の重複も除く）。
//
// この部品が持たないもの（製品の責務）
// - 通信、リアルタイムの受信（WebSocket、SSE、ポーリング）。製品が受け取った新着を receive に渡す。
// - サーバーでの既読の順序の保証（同じ通知への更新を受け付けた順に処理する、または版で古い要求を拒否して updated に含めない）。
// - 既読の更新の後に始めた取得が、その更新を反映すること（read-after-write の一貫性）。
// - cursor の一括既読で、範囲の時点（until）とスコープを、サーバーが要求の認可と照合すること。
// - 閲覧の権限の確認。権限が変わったら scopeKey を変え、サーバーは権限のない内容を返さない。

type NotificationPage<T> = {
  items: T[]
  /** サーバーが数えた未読の件数（取得した時点）。不明なら null */
  unreadCount: number | null
  /** 読み込んでいない古い通知がある */
  hasMore?: boolean
  /**
   * 一覧と未読の件数が反映している、受け付けた順の番号（sequence）の最大値。
   * 返すと、保留中の新着がサーバーの件数に含まれているかを、sequence で判定する（返さない場合は受け取った時点で判定する）
   */
  asOf?: number | null
}

type RequestContext = { signal: AbortSignal }

/**
 * 既読の更新の応答。updated（実際に更新した ID）か count（件数）を返す。
 * 何も返さない応答は、resultContract が "all-or-nothing" の場合だけ、要求したすべてを更新したものとする。
 * until と scope を返すと、要求と一致するかを確かめる（cursor の範囲）。
 */
type UpdateResult = ReadUpdateReport

type NotificationUpdateError = {
  kind: "read" | "read-all"
  /**
   * failed：処理されなかったことが確か。unknown：処理されたかがわからない（取得し直している）。
   * not-applied：応答は届いたが、一部の通知が更新されなかった（削除された、権限を失った、サーバーが拒否した。取得し直している）
   */
  outcome: "failed" | "unknown" | "not-applied"
  ids: string[]
  read: boolean
}

/** 購読ごとの記録。subscribe で取得し、receive に渡す。中身は参照しない */
type NotificationSubscription = { readonly snapshot: ScopeSnapshot; readonly scope: string | undefined }

type NotificationFeedOptions<T extends NotificationLike> = {
  /** アカウント、ワークスペース、認可の範囲（権限の版）など。変わったら前の通知と非同期の応答を破棄する */
  scopeKey: string | undefined
  fetcher: (context: RequestContext) => Promise<NotificationPage<T>>
  /** 既読・未読の更新。updated で、実際に更新した ID を返す */
  updateRead: (ids: string[], read: boolean, context: RequestContext) => Promise<UpdateResult>
  /** 一括既読。range の ids（または cursor）の通知だけを既読にする。省略すると updateRead を使う（ids の範囲だけ） */
  markAllRead?: (range: ReadAllRange, context: RequestContext) => Promise<UpdateResult>
  /**
   * 一括既読の範囲の決め方。
   * ids：読み込み済みの未読の通知だけ。cursor：開始した時点の最も新しい通知までのすべて（読み込んでいない通知を含む。markAllRead が必要）
   */
  readAllBy?: "ids" | "cursor"
  /**
   * 更新の API の結果の契約。reported（既定）：応答で updated か count を返す。何も返さない応答は結果が不明として取得し直す。
   * all-or-nothing：成功の応答は、要求したすべてを更新したことを API が保証する（部分的な成功がない）
   */
  resultContract?: "reported" | "all-or-nothing"
  /** true の間、新着を保留する（pending）。false になったら一覧に加える */
  holdIncoming?: boolean
  /** false の間は取得しない。購読から届いた通知も受け付けない */
  enabled?: boolean
  /**
   * 失敗の種類の判別。既定は error.outcome === "failed" だけを「処理されなかった」とし、AbortError を aborted、それ以外は結果が不明とする。
   * aborted は、スコープの変更とアンマウントの後なら何も反映しない。同じスコープの中止（製品の通信の層のタイムアウト、
   * 利用者の取り消し）は、サーバーで処理された可能性があるため、結果が不明（unknown）と同じに扱う（確認中にして取得し直す）
   */
  classifyError?: (error: unknown) => "failed" | "unknown" | "aborted"
}

/** 確定した既読の状態と、その順番（取得を始めた時点の順番と比べる） */
type Confirmed = { read: boolean; order: number }

type LocalState<T extends NotificationLike> = {
  scope: string | undefined
  /** 更新中の既読の状態（サーバーの結果に未反映） */
  overrides: Map<string, boolean>
  /** 応答で確定した既読の状態。確定より前に始めた取得の結果より優先する */
  confirmed: Map<string, Confirmed>
  /** 結果が不明な更新。order より後に始めた取得の結果が届くまで「確認中」。read は要求した値 */
  verifying: Map<string, Confirmed>
  /** cursor の一括既読が確定した範囲。読み込んでいない通知も既読になった。excluded は同じ通知の新しい操作があった ID */
  confirmedRange: { range: ReadAllRange; order: number; excluded: ReadonlySet<string> } | null
  /** この順番より前に始めた取得のサーバーの未読の件数は使わない（cursor の結果を確認できなかった） */
  staleTotalBefore: number | null
  /** 保留している新着 */
  pending: PendingEntry<T>[]
  /** 一括既読の実行中の範囲 */
  readAll: ReadAllRange | null
  error: NotificationUpdateError | null
  /** 読み上げる結果の文（「3 件を既読にしました」） */
  announcement: string
}

const emptyLocal = <T extends NotificationLike>(scope: string | undefined): LocalState<T> => ({
  scope,
  overrides: new Map(),
  confirmed: new Map(),
  verifying: new Map(),
  confirmedRange: null,
  staleTotalBefore: null,
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

const without = <V,>(map: Map<string, V>, ids: Iterable<string>) => {
  let next: Map<string, V> | null = null
  for (const id of ids) {
    if (!map.has(id)) continue
    next ??= new Map(map)
    next.delete(id)
  }
  return next ?? map
}

function readAllAnnouncement(summary: ReadUpdateSummary) {
  if (summary.status === "unknown") {
    return summary.count !== null ? `${summary.count} 件を既読にしました。結果を確認しています` : "既読にした件数を確認しています"
  }
  const n = summary.count ?? summary.updatedIds.length
  const missing = summary.missingIds.length
  if (summary.status === "partial" && missing > 0) return `${n} 件を既読にしました。${missing} 件は既読にできませんでした`
  if (summary.status === "partial") return `${n} 件を既読にしました。一部は既読にできませんでした`
  return `${n} 件を既読にしました`
}

function useNotificationFeed<T extends NotificationLike>({
  scopeKey,
  fetcher,
  updateRead,
  markAllRead,
  readAllBy = "ids",
  resultContract = "reported",
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
  // 別のスコープの保留中の新着と更新中の状態は、1 回の描画でも返さない（描画の中で照合する）。
  const local = stored.scope === scopeKey ? stored : emptyLocal<T>(scopeKey)
  // 保持している状態のスコープは、commit の時点（layout effect）で新しいスコープに置き換える。描画の中では setState しない
  // （commit されなかった描画（中断された transition）の更新で、表示中のスコープの状態を初期化しないため）。
  // 新しいスコープの更新（イベント、購読、応答）は commit の後に始まるため、この置き換えより前には届かない。
  React.useLayoutEffect(() => {
    if (stored.scope !== scopeKey) setLocal((s) => (s.scope === scopeKey ? s : emptyLocal<T>(scopeKey)))
  }, [stored.scope, scopeKey])

  const fetched = data.data
  const page = fetched?.page
  // サーバーの結果としての通知：取得した通知（重複を除く）に、取得を始めた後で確定した既読の状態を重ねる
  const view = React.useMemo(() => {
    if (!fetched) return null
    const startedAt = fetched.startedAt
    const range = local.confirmedRange && local.confirmedRange.order > startedAt ? local.confirmedRange : null
    const unique = dedupeNotifications(fetched.page.items).items
    const base = sortNotifications(unique).map((n) => {
      let read = n.read
      let order = -1
      if (range && !range.excluded.has(n.id) && isInReadAllRange(n, range.range)) {
        read = true
        order = range.order
      }
      const c = local.confirmed.get(n.id)
      if (c && c.order > startedAt && c.order > order) read = c.read
      if (read === n.read) return n
      return { ...n, read }
    })
    const reported = fetched.page.unreadCount
    const delta = countUnread(base) - countUnread(unique)
    const complete = fetched.page.hasMore === false
    const stale = local.staleTotalBefore !== null && startedAt < local.staleTotalBefore
    // cursor の一括既読が確定した後は、読み込んでいない通知もすべて範囲の中（既読）。未読は読み込み済みの通知だけになる
    const unreadReported = range ? countUnread(base) : stale || reported === null ? null : Math.max(0, reported + delta)
    return {
      base,
      reported: unreadReported,
      complete: Boolean(range) || complete,
      startedAt,
      mismatch: isUnreadCountInconsistent({ reported, base: unique, complete }),
      duplicates: fetched.page.items.length - unique.length,
    }
  }, [fetched, local.confirmed, local.confirmedRange, local.staleTotalBefore])

  const base = React.useMemo(() => view?.base ?? [], [view])
  // 表示する既読の状態：更新中の値、確認中の値（要求した値）、サーバーの結果の順に使う
  const items = React.useMemo(
    () =>
      local.overrides.size === 0 && local.verifying.size === 0
        ? base
        : base.map((n) => {
            const read = local.overrides.has(n.id) ? local.overrides.get(n.id)! : local.verifying.has(n.id) ? local.verifying.get(n.id)!.read : n.read
            return read === n.read ? n : { ...n, read }
          }),
    [base, local.overrides, local.verifying]
  )
  const verifyingIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const n of base) if (local.verifying.has(n.id) && !local.overrides.has(n.id)) ids.add(n.id)
    return ids as ReadonlySet<string>
  }, [base, local.verifying, local.overrides])
  const reconciled = React.useMemo(
    () => reconcilePending({ base, pending: local.pending, scope: scopeKey, asOf: page?.asOf ?? null, startedAt: view ? view.startedAt : null }),
    [base, local.pending, scopeKey, page?.asOf, view]
  )
  const pending = reconciled.shown
  // 結果が不明な通知がある間は、件数を確定しない（不明）
  const unreadCount =
    view && verifyingIds.size === 0
      ? computeUnreadCount({ reported: view.reported, base, shown: items, pending: view.complete ? pending : reconciled.counted, complete: view.complete })
      : null
  const knownUnread = items.some((n) => !n.read && !verifyingIds.has(n.id)) || pending.some((n) => !n.read)
  const hasUnread = unreadCount !== null ? unreadCount > 0 : knownUnread ? true : null
  const loadedUnread = countUnread(items)

  // 操作の処理（既読の更新、一括既読、受信）が読む値。commit の時点で更新する（描画の中で書き換えない）。
  // 新しいスコープへの transition が commit されずに保留している間に、表示中のスコープの操作が、
  // commit されていない描画の関数（別のスコープの updateRead）と値を使わないため。
  const unreadRef = React.useRef(unreadCount)
  const refs = React.useRef({ updateRead, markAllRead, classifyError, data, local, items, pending, readAllBy, resultContract, enabled, verifyingIds })
  React.useLayoutEffect(() => {
    unreadRef.current = unreadCount
    refs.current = { updateRead, markAllRead, classifyError, data, local, items, pending, readAllBy, resultContract, enabled, verifyingIds }
  })

  // 確定の後に始めた取得の結果が届いたら、確定と確認中の記録を消す（取得の結果が反映している。記録を増やし続けない）
  React.useEffect(() => {
    if (!fetched) return
    const at = fetched.startedAt
    setLocal((s) => {
      if (s.scope !== scopeKey) return s
      const prune = <V extends { order: number }>(map: Map<string, V>) => {
        let next: Map<string, V> | null = null
        for (const [id, v] of map) {
          if (v.order > at) continue
          next ??= new Map(map)
          next.delete(id)
        }
        return next ?? map
      }
      const confirmed = prune(s.confirmed)
      const verifying = prune(s.verifying)
      const confirmedRange = s.confirmedRange && s.confirmedRange.order <= at ? null : s.confirmedRange
      const staleTotalBefore = s.staleTotalBefore !== null && s.staleTotalBefore <= at ? null : s.staleTotalBefore
      if (confirmed === s.confirmed && verifying === s.verifying && confirmedRange === s.confirmedRange && staleTotalBefore === s.staleTotalBefore) return s
      return { ...s, confirmed, verifying, confirmedRange, staleTotalBefore }
    })
  }, [fetched, scopeKey])

  /**
   * 更新を実行する。通知の ID ごとに ticket を取り、応答の時点でその ID の最新の更新だけを反映する。
   * 一括既読も同じ処理で、開始した時点の範囲に固定する。
   */
  const run = React.useCallback(
    (kind: "read" | "read-all", ids: string[], read: boolean, call: (signal: AbortSignal) => Promise<UpdateResult>, range: ReadAllRange | null, expected: number | null): boolean => {
      const op = guard.begin(kind === "read-all" ? "read-all" : "read")
      // 前のスコープの描画で返した関数（古い画面や Toast の closure、A → B → A の最初の A）から呼ばれた場合は、始めない
      // （要求を送らない。更新中の状態を作らない。始めた場合、無効な Ticket の結果は反映されず、更新中の状態が残るため）
      if (!guard.isCurrent(op)) return false
      const tickets = new Map<string, ScopeTicket>(ids.map((id) => [id, guard.begin(`id:${id}`)]))
      const scope = op.scope
      setLocal((s) => {
        if (s.scope !== scope) return s
        const overrides = new Map(s.overrides)
        for (const id of ids) overrides.set(id, read)
        // 新しい操作の結果で確かめるため、確認中の記録を外す
        return { ...s, overrides, verifying: without(s.verifying, ids), readAll: range ?? s.readAll, error: null, announcement: "" }
      })
      let request: Promise<UpdateResult>
      try {
        request = call(op.signal)
      } catch (error) {
        request = Promise.reject(error)
      }
      // 最後の照合の後に、キーの記録を消す（release の後は isLatest が false になる）
      const releaseAll = () => {
        guard.release(op)
        for (const t of tickets.values()) guard.release(t)
      }
      const latestIds = () => ids.filter((id) => guard.isLatest(tickets.get(id)!))
      const finishReadAll = () => {
        if (!range) return
        setLocal((s) => (s.scope === scope && s.readAll === range ? { ...s, readAll: null } : s))
      }
      request.then(
        (result) => {
          if (!guard.isSameScope(op)) return releaseAll()
          const current = latestIds()
          const currentSet = new Set(current)
          releaseAll()
          finishReadAll()
          const fixed: ReadAllRange = range ?? { kind: "ids", scope, ids }
          const summary = summarizeReadUpdate(fixed, result, {
            contract: refs.current.resultContract,
            known: [...refs.current.items, ...refs.current.pending],
            expected,
          })
          const updated = new Set(summary.updatedIds)
          const cursor = fixed.kind === "cursor"
          const confirmedRange = cursor && summary.status === "confirmed" && (expected === null || summary.count === expected)
          const confirmIds = current.filter((id) => updated.has(id))
          const missing = summary.identified ? current.filter((id) => !updated.has(id)) : []
          const unknownIds = summary.identified ? [] : current.filter((id) => !updated.has(id))
          setLocal((s) => {
            if (s.scope !== scope) return s
            const overrides = without(s.overrides, current)
            let confirmed = s.confirmed
            if (confirmIds.length > 0) {
              confirmed = new Map(s.confirmed)
              for (const id of confirmIds) confirmed.set(id, { read, order: ++clock.current })
            }
            let verifying = s.verifying
            if (unknownIds.length > 0) {
              verifying = new Map(s.verifying)
              for (const id of unknownIds) verifying.set(id, { read, order: ++clock.current })
            }
            const nextRange = confirmedRange
              ? { range: fixed, order: ++clock.current, excluded: new Set(fixed.ids.filter((id) => !currentSet.has(id))) as ReadonlySet<string> }
              : s.confirmedRange
            // cursor の結果を確認できない：読み込んでいない通知の件数がわからないため、取得し直すまでサーバーの件数を使わない
            const staleTotalBefore = cursor && !confirmedRange ? ++clock.current : s.staleTotalBefore
            const error: NotificationUpdateError | null =
              missing.length > 0 ? { kind, outcome: "not-applied", ids: missing, read } : summary.status === "unknown" && kind === "read" && unknownIds.length > 0 ? { kind, outcome: "unknown", ids: unknownIds, read } : s.error
            const announcement = kind === "read-all" ? readAllAnnouncement(summary) : s.announcement
            return { ...s, overrides, confirmed, verifying, confirmedRange: nextRange, staleTotalBefore, error, announcement }
          })
          // cursor：読み込んでいない通知の件数はサーバーの結果で確かめる。確認できなかった結果、更新されなかった ID も確かめる。
          if (cursor || summary.status !== "confirmed" || summary.unexpectedIds.length > 0) refs.current.data.reload()
        },
        (error: unknown) => {
          // スコープの変更とアンマウントの後は、何も反映しない（この部品の中止もここに含まれる。前のスコープの状態は破棄している）
          if (!guard.isSameScope(op)) return releaseAll()
          // 同じスコープの中止（製品の通信の層のタイムアウト、利用者の取り消しなど）は、サーバーで処理されなかったことを意味しない。
          // 結果が不明（unknown）と同じに扱う：更新中の状態を外し、確認中にして取得し直し、一括既読の範囲を解除する。
          const classified = refs.current.classifyError(error)
          const outcome = classified === "aborted" ? "unknown" : classified
          const current = latestIds()
          releaseAll()
          finishReadAll()
          if (current.length === 0 && kind === "read") return
          setLocal((s) => {
            if (s.scope !== scope) return s
            const overrides = without(s.overrides, current)
            let verifying = s.verifying
            // 結果が不明：要求した値を「確認中」として示し、取得し直した結果で確定する（元の状態として確定しない）
            if (outcome === "unknown" && current.length > 0) {
              verifying = new Map(s.verifying)
              for (const id of current) verifying.set(id, { read, order: ++clock.current })
            }
            const staleTotalBefore = outcome === "unknown" && range?.kind === "cursor" ? ++clock.current : s.staleTotalBefore
            return { ...s, overrides, verifying, staleTotalBefore, error: { kind, outcome, ids: current, read } }
          })
          if (outcome === "unknown") refs.current.data.reload()
        }
      )
      return true
    },
    [guard]
  )

  const setRead = React.useCallback(
    (ids: string | readonly string[], read: boolean) => {
      // 重複した ID は 1 つにする。確認中の通知は、取得し直して確定するまで操作しない
      const verifying = refs.current.verifyingIds
      const list = [...new Set(typeof ids === "string" ? [ids] : ids)].filter((id) => !verifying.has(id))
      if (list.length === 0 || !refs.current.enabled) return
      run("read", list, read, (signal) => refs.current.updateRead(list, read, { signal }), null, null)
    },
    [run]
  )

  /**
   * 一括既読。開始した時点の範囲を固定する（保留中の新着と、確認中の通知を含めない）。
   * ids：読み込み済みの未読の通知だけ。cursor：開始した時点の最も新しい通知までのすべて（読み込んでいない通知を含む）。
   */
  const readAll = React.useCallback(() => {
    const { local: l, items: shown, readAllBy: by, markAllRead: call, verifyingIds: verifying } = refs.current
    if (!refs.current.data.data || l.readAll || !refs.current.enabled) return null
    const cursor = by === "cursor" && Boolean(call)
    const range = createReadAllRange(
      shown.filter((n) => !verifying.has(n.id)),
      { scope: guard.scope, by: cursor ? "cursor" : "ids" }
    )
    if (range.ids.length === 0 && !(cursor && unreadRef.current !== 0)) return null
    const started = run(
      "read-all",
      range.ids,
      true,
      (signal) => (call ? call(range, { signal }) : refs.current.updateRead(range.ids, true, { signal })),
      range,
      // cursor の件数の確認に使う、開始した時点の範囲の中の未読の件数（保留中の新着は範囲の外）。不明なら null
      cursor && unreadRef.current !== null ? Math.max(0, unreadRef.current - countUnread(refs.current.pending)) : null
    )
    return started ? range : null
  }, [guard, run])

  // 開いている購読。スコープが変わったら前の購読をすべて外す（前の世代の購読は、受け付けない）
  const subscriptions = React.useRef(new Set<NotificationSubscription>())
  React.useLayoutEffect(() => {
    subscriptions.current = new Set()
  }, [scopeKey])

  /**
   * 購読を始める。WebSocket や SSE の接続（購読）を始めるときに、useEffect の中で呼ぶ（描画の中で呼ばない）。
   * 返した Subscription を、その購読から届いた通知と一緒に receive に渡す。解除するときは unsubscribe を呼ぶ。
   */
  const subscribe = React.useCallback((): NotificationSubscription => {
    const subscription: NotificationSubscription = { snapshot: guard.capture(), scope: guard.scope }
    if (guard.isCurrent(subscription.snapshot)) subscriptions.current.add(subscription)
    return subscription
  }, [guard])

  /** 購読を解除する。解除した後に届いた通知は受け付けない */
  const unsubscribe = React.useCallback((subscription: NotificationSubscription) => {
    subscriptions.current.delete(subscription)
  }, [])

  /**
   * 新着を受け取る。subscription は、その通知が届いた購読（subscribe の戻り値）。
   * 解除した購読、前の世代の購読、アンマウントの後、取得を停止している間は受け付けず、false を返す。
   */
  const receive = React.useCallback(
    (incoming: readonly T[], subscription: NotificationSubscription) => {
      if (!subscriptions.current.has(subscription) || !guard.isCurrent(subscription.snapshot) || !refs.current.enabled) return false
      if (incoming.length === 0) return true
      const scope = subscription.scope
      setLocal((s) => {
        if (s.scope !== scope) return s
        const added = withoutKnown(
          s.pending.map((p) => p.item),
          dedupeNotifications(incoming).items
        )
        if (added.length === 0) return s
        const entries = added.map((item) => ({ scope, item, order: ++clock.current }))
        return { ...s, pending: [...s.pending, ...entries] }
      })
      return true
    },
    [guard]
  )

  /** 保留している新着を一覧に加える */
  const showPending = React.useCallback(() => {
    const { local: l } = refs.current
    if (l.pending.length === 0) return
    const scope = l.scope
    const arrived = l.pending.filter((p) => p.scope === scope).map((p) => p.item)
    refs.current.data.setData(
      (f) => {
        const { items: merged, added } = mergeNotifications(dedupeNotifications(f.page.items).items, arrived)
        // サーバーの件数にまだ含まれていない新着だけを加える（取得を始める前に届いた新着は、件数に含まれている）
        const counted = new Set(
          reconcilePending({ base: [], pending: l.pending, scope, asOf: f.page.asOf ?? null, startedAt: f.startedAt }).counted.map((n) => n.id)
        )
        const unread = added.filter((n) => !n.read && counted.has(n.id)).length
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
    /** 表示する通知（新しい順、重複を除く、更新中の既読の状態を反映）。取得の状態が error のときは表示しない */
    items,
    /** 未読の件数。不明なら null（架空の件数を作らない）。結果が不明な更新がある間も null */
    unreadCount,
    /** 未読があるか。不明なら null */
    hasUnread,
    /**
     * 件数の区別。shown：表示中の通知、loadedUnread：表示中の未読、pending：保留中の新着（一覧と重複しないもの）、
     * pendingUnread：保留中の新着の未読、total：サーバーの全未読（unreadCount と同じ。不明なら null）、
     * mismatch：サーバーの件数と読み込み済みの一覧が一致しない、duplicates：取得した一覧の中の重複の件数
     */
    counts: {
      shown: items.length,
      loadedUnread,
      pending: pending.length,
      pendingUnread: countUnread(pending),
      total: unreadCount,
      mismatch: view?.mismatch ?? false,
      duplicates: view?.duplicates ?? 0,
    },
    /** 読み込んでいない古い通知がある */
    hasMore: page?.hasMore ?? false,
    /** 一括既読の範囲の決め方（実際に使う方式。markAllRead がない場合は ids） */
    readAllBy: (readAllBy === "cursor" && markAllRead ? "cursor" : "ids") as "ids" | "cursor",
    /** 保留している新着（一覧と重複しないもの） */
    pending,
    showPending,
    /** 購読を始める（useEffect の中で呼ぶ）。戻り値を receive に渡す */
    subscribe,
    unsubscribe,
    receive,
    /** 既読・未読の更新（1 件または複数） */
    setRead,
    /** 一括既読。開始した範囲を返す（対象がなければ null） */
    readAll,
    /** 一括既読の実行中の範囲 */
    readAllRange: local.readAll,
    /** 更新中の通知の ID */
    updatingIds: local.overrides as ReadonlyMap<string, boolean>,
    /** 結果が不明で、取得し直した結果を待っている通知の ID（操作を受け付けない） */
    verifyingIds,
    /** 最後の更新の失敗 */
    error: local.error,
    dismissError,
    /** 読み上げる結果の文 */
    announcement: local.announcement,
    /** 表示中の通知が現在のスコープの結果（再取得の失敗を含む） */
    isCurrent: data.isCurrent,
    /** 既読の操作を受け付けてよい（現在のスコープの通知を表示している） */
    canOperate: data.isCurrent && enabled,
    refreshFailed: data.refreshFailed,
    fetchError: data.error,
    fetchedAt: data.fetchedAt,
    reload: data.reload,
  }
}

type NotificationFeed<T extends NotificationLike> = ReturnType<typeof useNotificationFeed<T>>

export { useNotificationFeed }
export type { NotificationFeed, NotificationFeedOptions, NotificationPage, NotificationSubscription, NotificationUpdateError, UpdateResult }
