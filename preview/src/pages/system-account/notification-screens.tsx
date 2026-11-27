import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Trash2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetBody, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { captureListPosition, useListPositionRestore, type ListPosition } from "@/patterns/list-detail"
import { NotificationCenter, type NotificationCenterProps } from "@/patterns/notification-center"
import { useNotificationFeed, type NotificationFeed } from "@/patterns/notification-feed"
import { NotificationButton } from "@/patterns/notification-indicator"
import { useScopeGuard, type ScopeSnapshot, type ScopeTicket } from "@/patterns/scope-guard"

import { referenceNow, workspaces, type UserId, type WorkspaceId } from "../../data/system-account/model"
import { notificationsApi, type AppNotification, type NotificationsApi } from "../../data/system-account/notifications-server"

// Notifications の画面の部品（プレビュー）。統合の検証画面でも使えるよう、スコープ（利用者、ワークスペース）、
// 模擬のサーバーの関数（api）、コールバック（onNavigate）を props で受け取る。Registry には含めない。
// 通知の配信、メール、プッシュ通知、ブラウザの通知の許可は、すべて模擬の処理である。

export type NotificationTarget = NonNullable<AppNotification["target"]>

/** 通知から対象への移動の結果。移動の可否の判定（権限、削除、未保存の変更）と移動は製品が行う */
export type NavigateOutcome =
  | { status: "navigated" }
  /** 利用者が移動を取りやめた（未保存の変更を破棄しなかった） */
  | { status: "cancelled" }
  /**
   * 対象を開けない。message を通知センターに示す。reason：deleted（削除された）、forbidden（権限がない）、
   * invalid（移動先の検証に失敗した。対象を確かめられていないため、通知を既読にしない）
   */
  | { status: "unavailable"; message: string; reason?: "deleted" | "forbidden" | "invalid" }

export type NavigateContext = {
  notification: AppNotification
  workspaceId: WorkspaceId
  /** 専用のページの一覧の位置（戻ったときの復元に使う）。通知センター（Popover）からの移動では null */
  position: ListPosition | null
}

export type OnNavigate = (target: NotificationTarget, context: NavigateContext) => Promise<NavigateOutcome> | NavigateOutcome

type ScopeProps = {
  userId: UserId
  workspaceId: WorkspaceId
  /** 権限の変更などでスコープを変えるための値（変わると前の通知を破棄して取得し直す） */
  scopeVersion?: string | number
  api?: NotificationsApi
  /** 相対時刻の基準の時刻。既定は model.ts の referenceNow（表示を実行した日時で変えない） */
  now?: number
  /** 取得と購読を止める（取得を停止している間のスコープの変更の検品）。feed を渡す場合は使わない */
  paused?: boolean
  /** 本文を表示してよいか（現在の閲覧の権限から製品が決める）。false の通知は本文を伏せ、開けない */
  canViewContent?: (item: AppNotification) => boolean
  /** 模擬のサーバーの配信の記録（deliveries）に残す購読者の名前（検品用） */
  subscriberLabel?: string
  /** 正確な日時のタイムゾーン（利用者の設定） */
  timeZone?: string
}

const DEFAULT_TZ = "Asia/Tokyo"

// ---------------------------------------------------------------- 通知の状態（模擬のサーバーとの接続）

/** 模擬のサーバーに接続した useNotificationFeed。新着は購読で受け取る */
export function useMockNotificationFeed({
  userId,
  workspaceId,
  scopeVersion = "",
  api = notificationsApi,
  holdIncoming = false,
  enabled = true,
  readAllBy = "ids",
  subscriberLabel = "",
}: ScopeProps & {
  holdIncoming?: boolean
  enabled?: boolean
  /** 一括既読の範囲。ids：読み込んだ未読だけ。cursor：開始した時点の最も新しい通知までのすべて */
  readAllBy?: "ids" | "cursor"
}) {
  const scope = useMemo(() => ({ userId, workspaceId }), [userId, workspaceId])
  const scopeKey = `${userId}:${workspaceId}:${scopeVersion}`
  const feed = useNotificationFeed<AppNotification>({
    scopeKey,
    enabled,
    holdIncoming,
    readAllBy,
    fetcher: (context) => api.list(scope, context),
    updateRead: (ids, read, context) => api.updateRead(scope, ids, read, context),
    markAllRead: (range, context) => api.markAllRead(scope, range, context),
  })
  const { subscribe, unsubscribe, receive } = feed
  useEffect(() => {
    if (!enabled) return
    // 購読ごとに Subscription を取り、届いた通知と一緒に receive に渡す。解除した購読、前の世代の購読（A → B → A の最初の A、
    // 権限の変更の前）、アンマウントの後に届いた通知は、receive が受け付けない（false を返す。模擬のサーバーが記録する）。
    const subscription = subscribe()
    const stop = api.subscribe(scope, (items) => receive(items, subscription), subscriberLabel)
    return () => {
      unsubscribe(subscription)
      stop()
    }
    // scopeKey が変わったら（権限の変更を含む）、購読し直す
  }, [api, scope, scopeKey, subscribe, unsubscribe, receive, enabled, subscriberLabel])
  return feed
}

// 対象の名前と業務の対応の状態（文字で示す。Badge を足さない）
const targetLabel = (n: AppNotification) => n.target?.label ?? null
const taskMeta = (n: AppNotification) => (n.task === "open" ? <span>対応待ち</span> : n.task === "done" ? <span>対応済み</span> : null)
// セキュリティの通知と、個別の対応が必要な通知（task が open で、集約のキーがないもの）は集約しない。
// 契約の更新のリマインダーは、集約しても対象ごとに開けるため集約する。
const canGroup = (n: AppNotification) => n.type !== "security" && !n.restricted
const groupTitle: NotificationCenterProps<AppNotification>["groupTitle"] = (g) =>
  g.groupKey === "renewal-week" ? `契約の更新日まで 7 日の顧客が ${g.items.length} 件あります` : `${g.latest.title} ほか ${g.items.length - 1} 件`

function NavigateNotice({ message }: { message: string }) {
  return (
    <Alert variant="warning" data-slot="notification-navigate-notice">
      <AlertTitle>対象を開けません</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/**
 * 通知を開く処理。
 * - 開始の防止：画面を表示したときのスコープと世代（Snapshot）が現在と一致しない場合は始めない（古い画面からの操作）。
 *   通知が現在の一覧にない場合、本文を表示できない場合も始めない。
 * - 古い結果の無効化：確認の応答を待つ間にスコープ（ワークスペース、権限）が変わった、別の通知を開いた、アンマウントした場合は、
 *   結果を反映しない（既読にしない、理由を示さない）。
 * - 既読にするのは、移動が完了したとき、または対象を開けないと確かめたとき（削除、権限なし）だけ。
 *   取りやめた場合（未保存の変更を破棄しなかった）と、移動先の検証に失敗した場合は既読にしない。
 */
function useOpenNotification({
  feed,
  workspaceId,
  scopeKey,
  onNavigate,
  canViewContent,
}: {
  feed: NotificationFeed<AppNotification>
  workspaceId: WorkspaceId
  scopeKey: string
  onNavigate: OnNavigate
  canViewContent?: (item: AppNotification) => boolean
}) {
  const guard = useScopeGuard(scopeKey)
  // 画面を表示したときのスコープと世代。描画の中では取得しない（commit の後に取得する）
  const screen = useRef<ScopeSnapshot | null>(null)
  useEffect(() => {
    screen.current = guard.capture()
  }, [guard, scopeKey])
  const latest = useRef({ feed, canViewContent })
  latest.current = { feed, canViewContent }
  const [notice, setNotice] = useState<{ scope: string; message: string } | null>(null)
  const open = useCallback(
    async (item: AppNotification, position: ListPosition | null, onNavigated?: () => void) => {
      const snapshot = screen.current
      const ticket = snapshot ? guard.beginIfCurrent(snapshot, "navigate") : null
      if (!ticket) return
      const { feed: f, canViewContent: canView } = latest.current
      // 現在の一覧の通知を使う（古い参照の通知を開かない）。本文を表示できない通知は開かない
      const current = f.items.find((n) => n.id === item.id)
      if (!current || !current.target || (canView && !canView(current))) {
        guard.release(ticket)
        setNotice({ scope: scopeKey, message: "このお知らせは開けません。一覧を確かめてください。" })
        return
      }
      setNotice(null)
      let outcome: NavigateOutcome
      try {
        outcome = await onNavigate(current.target, { notification: current, workspaceId, position })
      } catch {
        outcome = { status: "unavailable", reason: "invalid", message: "対象を確認できませんでした。もう一度お試しください。" }
      }
      // スコープが変わった、別の通知を開いた、アンマウントした後の結果は反映しない。
      const valid = guard.isLatest(ticket)
      guard.release(ticket)
      if (!valid) return
      if (outcome.status === "cancelled") return
      const confirmed = outcome.status === "navigated" || outcome.reason === "deleted" || outcome.reason === "forbidden"
      if (confirmed && !current.read) latest.current.feed.setRead([current.id], true)
      if (outcome.status === "unavailable") {
        setNotice({ scope: scopeKey, message: outcome.message })
        // 閲覧の権限を失った場合は、通知を取得し直す（権限のない内容を通知の本文に残さない）。
        if (outcome.reason === "forbidden") latest.current.feed.reload()
        return
      }
      onNavigated?.()
    },
    [guard, onNavigate, workspaceId, scopeKey]
  )
  return { open, notice: notice && notice.scope === scopeKey ? notice.message : null, clearNotice: () => setNotice(null) }
}

// ---------------------------------------------------------------- Header に置く通知センター

export type NotificationHeaderCenterProps = ScopeProps & {
  onNavigate: OnNavigate
  /** dot：未読があることだけを示す。count：件数を示す */
  display?: "dot" | "count"
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** 専用のページ（すべてのお知らせ）へ移動する */
  onOpenAll?: () => void
  /** 通知の設定へ移動する */
  onOpenSettings?: () => void
  /** 製品が持つ通知の状態（専用のページと共有する場合）。省略すると、この部品が取得する */
  feed?: NotificationFeed<AppNotification>
  /** 一括既読の範囲（feed を渡さない場合だけ使う） */
  readAllBy?: "ids" | "cursor"
}

/**
 * Header の右側に置く通知センター。デスクトップは Popover、モバイル（md 未満）は全画面の Sheet。
 * 開いただけでは既読にしない。通知を開いて移動した後に、もう一度開くと、開いた通知へフォーカスとスクロールを戻す。
 */
export function NotificationHeaderCenter({
  userId,
  workspaceId,
  scopeVersion = "",
  api = notificationsApi,
  now = referenceNow,
  timeZone = DEFAULT_TZ,
  onNavigate,
  display = "count",
  open: openProp,
  onOpenChange,
  onOpenAll,
  onOpenSettings,
  feed: feedProp,
  readAllBy,
  paused = false,
  canViewContent,
  subscriberLabel,
}: NotificationHeaderCenterProps) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = openProp ?? ownOpen
  const setOpen = (next: boolean) => {
    setOwnOpen(next)
    onOpenChange?.(next)
  }
  const own = useMockNotificationFeed({ userId, workspaceId, scopeVersion, api, holdIncoming: open, enabled: !feedProp && !paused, readAllBy, subscriberLabel })
  const feed = feedProp ?? own
  const scopeKey = `${userId}:${workspaceId}:${scopeVersion}`
  const mobile = useIsMobile()
  const headingId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  // 通知を開いて移動したときの位置。もう一度開いたときに、その通知へフォーカスとスクロールを戻す。
  const returnTo = useRef<{ scope: string; id: string; scrollTop: number } | null>(null)
  const { open: openItem, notice, clearNotice } = useOpenNotification({ feed, workspaceId, scopeKey, onNavigate, canViewContent })

  useLayoutEffect(() => {
    if (!open) return
    const r = returnTo.current
    if (r && r.scope === scopeKey && scrollRef.current) scrollRef.current.scrollTop = r.scrollTop
  }, [open, scopeKey])

  const initialFocus = () => {
    const r = returnTo.current
    returnTo.current = null
    const root = popupRef.current
    if (r && r.scope === scopeKey && root) {
      const row = Array.from(root.querySelectorAll<HTMLElement>("[data-row-id]")).find((el) => el.dataset.rowId === r.id)
      const target = row?.querySelector<HTMLElement>("[data-row-focus]")
      if (target) return target
    }
    // 開いたときは見出しへ移す（Tab で、すべて・未読の切り替え、すべて既読、一覧の順に進む）。
    return root?.querySelector<HTMLElement>(`[id="${CSS.escape(headingId)}"]`) ?? true
  }

  const onOpen = (item: AppNotification) =>
    openItem(item, null, () => {
      returnTo.current = { scope: scopeKey, id: item.id, scrollTop: scrollRef.current?.scrollTop ?? 0 }
      setOpen(false)
    })

  const center = (
    <NotificationCenter
      feed={feed}
      headingId={headingId}
      scopeLabel={workspaces[workspaceId].name}
      now={now}
      timeZone={timeZone}
      onOpen={onOpen}
      hasTarget={(n) => n.target !== null}
      getTargetLabel={targetLabel}
      renderMeta={taskMeta}
      canGroup={canGroup}
      groupTitle={groupTitle}
      canViewContent={canViewContent}
      notice={notice ? <NavigateNotice message={notice} /> : null}
      scrollRef={scrollRef}
      scrollClassName={mobile ? undefined : "overflow-y-auto -mx-4 px-4"}
      footer={
        (onOpenAll || onOpenSettings) && (
          <div className="mt-3 flex flex-wrap gap-x-4 border-t border-border pt-3">
            {onOpenAll && (
              <Button variant="link" size="sm" onClick={() => (setOpen(false), onOpenAll())}>
                すべてのお知らせ
              </Button>
            )}
            {onOpenSettings && (
              <Button variant="link" size="sm" onClick={() => (setOpen(false), onOpenSettings())}>
                通知の設定
              </Button>
            )}
          </div>
        )
      }
    />
  )

  const trigger = <NotificationButton count={feed.unreadCount} hasUnread={feed.hasUnread} display={display} data-testid="ntf-trigger" />
  const onChange = (next: boolean) => {
    if (!next) clearNotice()
    setOpen(next)
  }

  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onChange} mode="view" modal>
        <SheetTrigger render={trigger} />
        <SheetContent
          ref={popupRef}
          side="right"
          className="max-w-none"
          aria-labelledby={headingId}
          initialFocus={initialFocus}
          data-testid="ntf-center"
        >
          {/* 見出しは NotificationCenter の中にある（aria-labelledby で Sheet の名前にする） */}
          <SheetBody className="pt-[max(1.5rem,env(safe-area-inset-top))] [&_[data-slot=notification-center-header]]:pr-12">{center}</SheetBody>
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Popover open={open} onOpenChange={onChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        ref={popupRef}
        align="end"
        aria-labelledby={headingId}
        initialFocus={initialFocus}
        // 高さを位置（--available-height）から決めない。位置の再計算で高さが変わり、ResizeObserver の通知が続くため。
        className="max-h-[min(36rem,calc(100dvh-6rem))] w-[22.5rem] gap-0 overflow-hidden"
        data-testid="ntf-center"
      >
        {center}
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------- 専用のページ（大量の通知の履歴）

export type NotificationInboxProps = ScopeProps & {
  onNavigate: OnNavigate
  /** 対象から戻ったときに復元する位置（onNavigate の context.position を製品が保持して渡す） */
  restorePosition?: ListPosition | null
  onRestored?: () => void
  headingLevel?: 1 | 2
  feed?: NotificationFeed<AppNotification>
  /** 一覧のスクロールの領域の className。製品の画面では AppShellMain がスクロールの領域になる */
  scrollClassName?: string
  /** 通知を削除したとき（業務のデータは変えない） */
  onRemoved?: (id: string) => void
  /** 一括既読の範囲（feed を渡さない場合だけ使う） */
  readAllBy?: "ids" | "cursor"
}

/** 専用のページの通知の一覧。正確な日時を表示し、通知の削除を置く。新着は「新着 N 件を表示」で加える */
export function NotificationInbox({
  userId,
  workspaceId,
  scopeVersion = "",
  api = notificationsApi,
  now = referenceNow,
  timeZone = DEFAULT_TZ,
  onNavigate,
  restorePosition = null,
  onRestored,
  headingLevel = 2,
  feed: feedProp,
  scrollClassName,
  onRemoved,
  readAllBy,
  paused = false,
  canViewContent,
  subscriberLabel,
}: NotificationInboxProps) {
  const own = useMockNotificationFeed({ userId, workspaceId, scopeVersion, api, holdIncoming: true, enabled: !feedProp && !paused, readAllBy, subscriberLabel })
  const feed = feedProp ?? own
  const scopeKey = `${userId}:${workspaceId}:${scopeVersion}`
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const { open: openItem, notice } = useOpenNotification({ feed, workspaceId, scopeKey, onNavigate, canViewContent })
  const guard = useScopeGuard(scopeKey)
  // 削除の要求を送った通知。取得し直して一覧から消えるまで、もう一度送らない（二重の実行の防止）。
  // 要求を始めたときのスコープと世代（Ticket）と組で持ち、現在のスコープと世代のものだけを「削除中」とする
  // （scopeKey の文字列だけで持つと、A → B → A の最初の A の要求が、戻った A で「削除中」のまま残り、もう一度削除できない）。
  const [removing, setRemoving] = useState<readonly { ticket: ScopeTicket; id: string }[]>([])
  const removingIds = new Set(removing.filter((r) => guard.isSameScope(r.ticket)).map((r) => r.id))
  const removingKey = [...removingIds].sort().join(",")
  const [removeError, setRemoveError] = useState<{ scope: string; message: string; unknown: boolean } | null>(null)
  // 応答を待っている削除の要求（通知の ID → Ticket）。現在のスコープと世代のものだけを照合に使う
  const pendingRemove = useRef(new Map<string, ScopeTicket>())
  const awaiting = (id: string) => {
    const t = pendingRemove.current.get(id)
    return t !== undefined && guard.isSameScope(t)
  }
  // 一覧から消えた通知は、削除の要求の記録から外す
  useEffect(() => {
    if (removingIds.size === 0) return
    const present = new Set(feed.items.map((n) => n.id))
    if ([...removingIds].some((id) => !present.has(id) && !awaiting(id))) {
      setRemoving((r) => r.filter((x) => guard.isSameScope(x.ticket) && (present.has(x.id) || awaiting(x.id))))
    }
  }, [feed.items, removingKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useListPositionRestore({
    position: restorePosition,
    ready: feed.status === "ready",
    root: rootRef,
    scrollElement: scrollRef,
    fallbackFocus: () => rootRef.current?.querySelector<HTMLElement>("h1, h2") ?? null,
    onRestored,
  })

  const remove = async (item: AppNotification) => {
    if (removingIds.has(item.id) || awaiting(item.id)) return
    const ticket = guard.begin(`remove:${item.id}`)
    // 前のスコープの描画の関数から呼ばれた場合（無効な Ticket）は、要求を送らない
    if (!guard.isCurrent(ticket)) return
    pendingRemove.current.set(item.id, ticket)
    setRemoveError(null)
    setRemoving((r) => [...r.filter((x) => x.id !== item.id && guard.isSameScope(x.ticket)), { ticket, id: item.id }])
    // この要求の記録だけを外す（スコープにかかわらず。後から始めた要求の記録は消さない）
    const release = () => setRemoving((r) => r.filter((x) => x.ticket !== ticket))
    const settled = () => {
      if (pendingRemove.current.get(item.id) === ticket) pendingRemove.current.delete(item.id)
    }
    try {
      await api.remove({ userId, workspaceId }, item.id, { signal: ticket.signal })
    } catch (error) {
      settled()
      const same = guard.isSameScope(ticket)
      guard.release(ticket)
      release()
      // スコープの変更とアンマウントの後は、結果を示さない（この部品の中止もここに含まれる）
      if (!same) return
      // 同じスコープの中止（製品の通信の層のタイムアウトなど）は、削除されなかったことを意味しないため、結果が不明として扱う
      const unknown = !(error && typeof error === "object" && "outcome" in error && error.outcome === "failed")
      setRemoveError({
        scope: scopeKey,
        unknown,
        message: unknown
          ? `「${item.title}」を削除できたかを確認できませんでした。最新の状態を取得し直しています。`
          : `「${item.title}」を削除できませんでした。もう一度お試しください。`,
      })
      if (unknown) feed.reload()
      return
    }
    settled()
    const same = guard.isSameScope(ticket)
    guard.release(ticket)
    if (!same) {
      release()
      return
    }
    onRemoved?.(item.id)
    // 一覧から消えるまで（取得し直すまで）、削除のボタンは処理中のまま（もう一度送らない）
    feed.reload()
  }
  const removeMessage = removeError && removeError.scope === scopeKey ? removeError.message : null

  return (
    <div ref={rootRef} className="min-w-0">
      <NotificationCenter
        feed={feed}
        headingLevel={headingLevel}
        scopeLabel={workspaces[workspaceId].name}
        now={now}
        timeZone={timeZone}
        showAbsoluteTime
        loadingRows={6}
        initialExpandedFor={restorePosition?.rowId ?? null}
        onOpen={(item) => openItem(item, captureListPosition({ scrollElement: scrollRef.current, root: rootRef.current, rowId: item.id }))}
        hasTarget={(n) => n.target !== null}
        getTargetLabel={targetLabel}
        renderMeta={taskMeta}
        canGroup={canGroup}
        groupTitle={groupTitle}
        canViewContent={canViewContent}
        notice={
          notice || removeMessage ? (
            <>
              {notice && <NavigateNotice message={notice} />}
              {removeMessage && (
                <Alert variant="warning" data-slot="notification-remove-error">
                  <AlertTitle>{removeError!.unknown ? "削除の結果を確認しています" : "削除できませんでした"}</AlertTitle>
                  <AlertDescription>{removeMessage}</AlertDescription>
                </Alert>
              )}
            </>
          ) : null
        }
        scrollRef={scrollRef}
        scrollClassName={scrollClassName}
        renderActions={(item) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`「${item.title}」のお知らせを削除`}
            title="お知らせを削除"
            className="pointer-coarse:size-12"
            loading={removingIds.has(item.id)}
            onClick={() => remove(item)}
          >
            <Trash2 />
          </Button>
        )}
      />
    </div>
  )
}

// ---------------------------------------------------------------- 通知の設定（種類 × 配信チャネルの Matrix）
// Settings の即時保存（useInstantSettings）と共通の保存の規則にするため、settings-notifications.tsx に移した（Settings の担当）。
export { NotificationSettingsMatrix, type BrowserPermission, type NotificationSettingsMatrixProps } from "./settings-notifications"

// ---------------------------------------------------------------- 対象の画面（例）

/** 通知から移動した先の画面の例。業務の対応の状態はここで変える（通知の既読とは別） */
export function TargetScreen({
  title,
  children,
  onBack,
  backLabel = "お知らせに戻る",
}: {
  title: string
  children?: ReactNode
  onBack?: () => void
  backLabel?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="ntf-target">
      {onBack && (
        <Button variant="link" size="sm" className="self-start" onClick={onBack} data-testid="ntf-back">
          {backLabel}
        </Button>
      )}
      <h3 className="text-heading" tabIndex={-1} data-testid="ntf-target-title">
        {title}
      </h3>
      {children}
    </div>
  )
}

export type { ListPosition }
