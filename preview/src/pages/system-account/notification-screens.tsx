import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Trash2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetBody, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { useIsMobile } from "@/hooks/use-mobile"
import { useBrowseData } from "@/patterns/browse-data"
import { DataRegionError } from "@/patterns/data-states"
import { captureListPosition, useListPositionRestore, type ListPosition } from "@/patterns/list-detail"
import { NotificationCenter, type NotificationCenterProps } from "@/patterns/notification-center"
import { useNotificationFeed, type NotificationFeed } from "@/patterns/notification-feed"
import { NotificationButton } from "@/patterns/notification-indicator"
import { formatAbsoluteTime, isWithinQuietHours } from "@/patterns/notification-state"
import { useScopeGuard } from "@/patterns/scope-guard"
import { cn } from "@/lib/utils"

import {
  channelLabels,
  mandatoryNotifications,
  notificationTypeLabels,
  referenceNow,
  workspaces,
  type Channel,
  type NotificationType,
  type PersonalSettings,
  type UserId,
  type WorkspaceId,
} from "../../data/system-account/model"
import {
  notificationPolicies,
  notificationsApi,
  type AppNotification,
  type NotificationsApi,
  type SettingPatch,
} from "../../data/system-account/notifications-server"

// Notifications の画面の部品（プレビュー）。統合の検証画面でも使えるよう、スコープ（利用者、ワークスペース）、
// 模擬のサーバーの関数（api）、コールバック（onNavigate）を props で受け取る。Registry には含めない。
// 通知の配信、メール、プッシュ通知、ブラウザの通知の許可は、すべて模擬の処理である。

export type NotificationTarget = NonNullable<AppNotification["target"]>

/** 通知から対象への移動の結果。移動の可否の判定（権限、削除、未保存の変更）と移動は製品が行う */
export type NavigateOutcome =
  | { status: "navigated" }
  /** 利用者が移動を取りやめた（未保存の変更を破棄しなかった） */
  | { status: "cancelled" }
  /** 対象を開けない（削除された、権限がない）。message を通知センターに示す */
  | { status: "unavailable"; message: string; reason?: "deleted" | "forbidden" }

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
  const { receive } = feed
  useEffect(() => {
    if (!enabled) return
    // 購読を始めたときのスコープを渡す。切り替えの後に届いた古いスコープの通知は、receive が捨てる。
    return api.subscribe(scope, (items) => receive(items, { scopeKey }))
  }, [api, scope, scopeKey, receive, enabled])
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

/** 通知を開く処理。移動が完了した、または対象を開けないと確かめた通知を既読にする（取りやめた場合は既読にしない） */
function useOpenNotification({
  feed,
  workspaceId,
  scopeKey,
  onNavigate,
}: {
  feed: NotificationFeed<AppNotification>
  workspaceId: WorkspaceId
  scopeKey: string
  onNavigate: OnNavigate
}) {
  const guard = useScopeGuard(scopeKey)
  const [notice, setNotice] = useState<{ scope: string; message: string } | null>(null)
  const open = useCallback(
    async (item: AppNotification, position: ListPosition | null, onNavigated?: () => void) => {
      if (!item.target) return
      const ticket = guard.begin("navigate")
      setNotice(null)
      let outcome: NavigateOutcome
      try {
        outcome = await onNavigate(item.target, { notification: item, workspaceId, position })
      } catch {
        outcome = { status: "unavailable", message: "対象を確認できませんでした。もう一度お試しください。" }
      }
      // スコープが変わった、別の通知を開いた、アンマウントした後の結果は反映しない。
      if (!guard.isLatest(ticket)) return
      if (outcome.status === "cancelled") return
      if (!item.read) feed.setRead([item.id], true)
      if (outcome.status === "unavailable") {
        setNotice({ scope: scopeKey, message: outcome.message })
        // 閲覧の権限を失った場合は、通知を取得し直す（権限のない内容を通知の本文に残さない）。
        if (outcome.reason === "forbidden") feed.reload()
        return
      }
      onNavigated?.()
    },
    [guard, onNavigate, workspaceId, feed, scopeKey]
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
}: NotificationHeaderCenterProps) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = openProp ?? ownOpen
  const setOpen = (next: boolean) => {
    setOwnOpen(next)
    onOpenChange?.(next)
  }
  const own = useMockNotificationFeed({ userId, workspaceId, scopeVersion, api, holdIncoming: open, enabled: !feedProp, readAllBy })
  const feed = feedProp ?? own
  const scopeKey = `${userId}:${workspaceId}:${scopeVersion}`
  const mobile = useIsMobile()
  const headingId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  // 通知を開いて移動したときの位置。もう一度開いたときに、その通知へフォーカスとスクロールを戻す。
  const returnTo = useRef<{ scope: string; id: string; scrollTop: number } | null>(null)
  const { open: openItem, notice, clearNotice } = useOpenNotification({ feed, workspaceId, scopeKey, onNavigate })

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
}: NotificationInboxProps) {
  const own = useMockNotificationFeed({ userId, workspaceId, scopeVersion, api, holdIncoming: true, enabled: !feedProp, readAllBy })
  const feed = feedProp ?? own
  const scopeKey = `${userId}:${workspaceId}:${scopeVersion}`
  const scrollRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const { open: openItem, notice } = useOpenNotification({ feed, workspaceId, scopeKey, onNavigate })
  const guard = useScopeGuard(scopeKey)
  // 削除の要求を送った通知。取得し直して一覧から消えるまで、もう一度送らない（二重の実行の防止）
  const [removing, setRemoving] = useState<{ scope: string; ids: ReadonlySet<string> }>({ scope: scopeKey, ids: new Set() })
  const removingIds = removing.scope === scopeKey ? removing.ids : new Set<string>()
  const [removeError, setRemoveError] = useState<{ scope: string; message: string; unknown: boolean } | null>(null)
  const pendingRemove = useRef(new Set<string>())
  // 一覧から消えた通知は、削除の要求の記録から外す
  useEffect(() => {
    if (removingIds.size === 0) return
    const present = new Set(feed.items.map((n) => n.id))
    if ([...removingIds].some((id) => !present.has(id) && !pendingRemove.current.has(id))) {
      setRemoving((r) => ({ scope: r.scope, ids: new Set([...r.ids].filter((id) => present.has(id) || pendingRemove.current.has(id))) }))
    }
  }, [feed.items, removingIds])

  useListPositionRestore({
    position: restorePosition,
    ready: feed.status === "ready",
    root: rootRef,
    scrollElement: scrollRef,
    fallbackFocus: () => rootRef.current?.querySelector<HTMLElement>("h1, h2") ?? null,
    onRestored,
  })

  const remove = async (item: AppNotification) => {
    if (removingIds.has(item.id) || pendingRemove.current.has(item.id)) return
    const ticket = guard.begin(`remove:${item.id}`)
    pendingRemove.current.add(item.id)
    setRemoveError(null)
    setRemoving((r) => ({ scope: scopeKey, ids: new Set([...(r.scope === scopeKey ? r.ids : []), item.id]) }))
    const release = () =>
      setRemoving((r) => (r.scope === ticket.scope ? { scope: r.scope, ids: new Set([...r.ids].filter((id) => id !== item.id)) } : r))
    try {
      await api.remove({ userId, workspaceId }, item.id, { signal: ticket.signal })
    } catch (error) {
      pendingRemove.current.delete(item.id)
      if (!guard.isSameScope(ticket) || (error instanceof DOMException && error.name === "AbortError")) return
      release()
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
    pendingRemove.current.delete(item.id)
    if (!guard.isSameScope(ticket)) return
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

export type BrowserPermission = "default" | "granted" | "denied"

export type NotificationSettingsMatrixProps = {
  userId: UserId
  workspaceId: WorkspaceId
  api?: NotificationsApi
  now?: number
  /** ブラウザ（OS）の通知の許可（模擬）。製品の配信の設定とは別に持つ */
  browserPermission: BrowserPermission
  /** ブラウザの通知の許可を求める（模擬）。製品は Notification.requestPermission() などを呼ぶ */
  onRequestBrowserPermission?: () => void
  headingLevel?: 2 | 3
}

const types = Object.keys(notificationTypeLabels) as NotificationType[]
const channels = Object.keys(channelLabels) as Channel[]
const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)

type CellStatus = { state: "failed" | "unknown"; message: string }

/** 保存の失敗（destructive）と、結果の不明（warning。取得し直している）を区別して示す */
function StatusText({ status }: { status: CellStatus }) {
  return (
    <p data-testid="ntf-setting-error" data-state={status.state} className={cn("mt-1 text-caption", status.state === "failed" ? "text-destructive" : "text-warning")}>
      {status.message}
    </p>
  )
}

/**
 * 通知の種類と配信チャネルの設定。Switch は即時に保存する。必須の通知は無効にできない理由を示す。
 * 組織のポリシーで使えないチャネルと、ブラウザの通知の許可（製品の設定とは別）を区別して示す。
 */
export function NotificationSettingsMatrix({
  userId,
  workspaceId,
  api = notificationsApi,
  now = referenceNow,
  browserPermission,
  onRequestBrowserPermission,
  headingLevel = 2,
}: NotificationSettingsMatrixProps) {
  const scopeKey = `${userId}:${workspaceId}`
  const data = useBrowseData({ query: userId, scopeKey, fetcher: (u, { signal }) => api.loadSettings(u, { signal }) })
  const guard = useScopeGuard(scopeKey)
  // 保存中の値（応答で確定する）と、項目ごとの失敗
  const [draft, setDraft] = useState<{ scope: string; values: Map<string, unknown>; status: Map<string, CellStatus>; announcement: string }>(() => ({
    scope: scopeKey,
    values: new Map(),
    status: new Map(),
    announcement: "",
  }))
  const local = draft.scope === scopeKey ? draft : { scope: scopeKey, values: new Map<string, unknown>(), status: new Map<string, CellStatus>(), announcement: "" }
  const baseId = useId()
  const H = headingLevel === 2 ? "h2" : "h3"
  const H2 = headingLevel === 2 ? "h3" : "h4"
  const policy = notificationPolicies[workspaceId]

  const save = (key: string, patch: SettingPatch, value: unknown, label: string) => {
    const ticket = guard.begin(key)
    setDraft((d) => {
      const base = d.scope === scopeKey ? d : { ...local }
      const values = new Map(base.values).set(key, value)
      const status = new Map(base.status)
      status.delete(key)
      return { ...base, scope: scopeKey, values, status, announcement: "" }
    })
    const settle = (next: { status?: CellStatus; announcement: string }) =>
      setDraft((d) => {
        if (d.scope !== ticket.scope) return d
        const values = new Map(d.values)
        values.delete(key)
        const status = new Map(d.status)
        if (next.status) status.set(key, next.status)
        return { ...d, values, status, announcement: next.announcement }
      })
    api.saveSetting(userId, workspaceId, patch, { signal: ticket.signal }).then(
      (settings) => {
        if (!guard.isLatest(ticket)) return
        data.setData(() => settings, { scopeKey: ticket.scope })
        settle({ announcement: `${label}を保存しました` })
      },
      (error: unknown) => {
        if (!guard.isLatest(ticket) || (error instanceof DOMException && error.name === "AbortError")) return
        const unknown = !(error && typeof error === "object" && "outcome" in error && error.outcome === "failed")
        const status: CellStatus = unknown
          ? { state: "unknown", message: `${label}を保存できたかを確認できませんでした。最新の設定を取得し直しています。` }
          : { state: "failed", message: `${label}を保存できませんでした。もう一度お試しください。` }
        // 失敗と結果の不明も、常に置いた読み上げの領域で伝える
        settle({ status, announcement: status.message })
        if (unknown) data.reload()
      }
    )
  }

  const settings = data.isCurrent ? (data.data as PersonalSettings) : null
  const valueOf = <V,>(key: string, fallback: V): V => (local.values.has(key) ? (local.values.get(key) as V) : fallback)

  if (data.status === "error") {
    return <DataRegionError title="通知の設定を取得できませんでした" description="通信の状態を確かめて、もう一度お試しください。" onRetry={data.reload} />
  }
  if (!settings) {
    return (
      <div aria-busy="true" className="py-8 text-ui text-muted-foreground">
        通知の設定を読み込んでいます
      </div>
    )
  }

  const quiet = valueOf("quiet", settings.quietHours)
  const digest = valueOf("digest", settings.digest)
  const crosses = quiet.start > quiet.end
  const inQuiet = isWithinQuietHours(now, { ...quiet, timeZone: settings.timezone })
  const pushPolicy = policy.disabledChannels.find((d) => d.channel === "push")

  return (
    <div className="flex min-w-0 flex-col gap-10" data-testid="ntf-settings">
      <p role="status" className="sr-only" data-testid="ntf-settings-live">
        {local.announcement}
      </p>
      <section aria-labelledby={`${baseId}-matrix`} className="@container/matrix min-w-0">
        <H id={`${baseId}-matrix`} className="text-heading">
          通知の種類と受け取り方
        </H>
        <p className="mt-2 text-ui text-muted-foreground">変更はすぐに保存されます。この設定は、すべてのワークスペースで共通です。</p>

        {/* ブラウザ（OS）の通知の許可。製品の設定（下の Switch）とは別のもの */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-ui" data-testid="ntf-browser-permission">
          <p className="text-muted-foreground">
            {browserPermission === "granted"
              ? "このブラウザで、プッシュ通知が許可されています（ブラウザの設定）。"
              : browserPermission === "denied"
                ? "このブラウザの設定で、通知がブロックされています。プッシュ通知を受け取るには、ブラウザの設定で許可してください。下の設定は、ブラウザの許可とは別に保存されます。"
                : "このブラウザでは、プッシュ通知がまだ許可されていません（ブラウザの設定）。"}
          </p>
          {browserPermission === "default" && onRequestBrowserPermission && (
            <Button variant="outline" size="sm" onClick={onRequestBrowserPermission}>
              ブラウザの通知を許可する
            </Button>
          )}
        </div>
        {pushPolicy && (
          <p id={`${baseId}-policy-push`} className="mt-2 text-ui text-muted-foreground" data-testid="ntf-policy">
            プッシュ通知：{pushPolicy.reason}。個人の設定は残り、このワークスペースでは届きません。
          </p>
        )}

        <div className="mt-6" role="group" aria-label="通知の種類と配信チャネル">
          {/* 列の見出し。各 Switch のアクセシブルな名前に種類とチャネルを含めるため、支援技術からは隠す */}
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)] gap-x-2 pb-2 text-caption text-muted-foreground @xl/matrix:grid">
            <span>種類</span>
            {channels.map((c) => (
              <span key={c} className="text-center">
                {channelLabels[c]}
              </span>
            ))}
          </div>
          {types.map((type) => {
            const mandatory = mandatoryNotifications.filter((m) => m.type === type)
            const rowErrors = channels.map((c) => local.status.get(`${type}:${c}`)).filter(Boolean) as CellStatus[]
            return (
              <div
                key={type}
                role="group"
                aria-labelledby={`${baseId}-${type}`}
                data-testid={`ntf-type-${type}`}
                className="grid gap-x-2 gap-y-1 border-t border-border py-4 @xl/matrix:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)] @xl/matrix:items-center"
              >
                <div className="min-w-0">
                  <p id={`${baseId}-${type}`} className="text-ui font-medium [word-break:auto-phrase]">
                    {notificationTypeLabels[type]}
                  </p>
                  {mandatory.map((m) => (
                    <p key={m.channel} id={`${baseId}-${type}-${m.channel}-reason`} className="mt-1 text-caption text-muted-foreground [word-break:auto-phrase]">
                      {channelLabels[m.channel]}は無効にできません：{m.reason}
                    </p>
                  ))}
                  {rowErrors.map((e, i) => (
                    <StatusText key={i} status={e} />
                  ))}
                </div>
                {channels.map((channel) => {
                  const key = `${type}:${channel}`
                  const locked = mandatory.find((m) => m.channel === channel)
                  const blocked = policy.disabledChannels.find((d) => d.channel === channel)
                  const stored = settings.notifications[type][channel]
                  const checked = locked ? true : blocked ? false : valueOf(key, stored)
                  const label = `${notificationTypeLabels[type]}：${channelLabels[channel]}`
                  return (
                    <div key={channel} className="flex min-h-12 items-center justify-between gap-3 @xl/matrix:justify-center">
                      <span aria-hidden="true" className="text-ui text-muted-foreground @xl/matrix:hidden">
                        {channelLabels[channel]}
                      </span>
                      <Switch
                        checked={checked}
                        readOnly={Boolean(locked || blocked)}
                        aria-label={label}
                        aria-describedby={locked ? `${baseId}-${type}-${channel}-reason` : blocked ? `${baseId}-policy-push` : undefined}
                        data-testid={`ntf-switch-${type}-${channel}`}
                        className="data-readonly:cursor-not-allowed data-readonly:opacity-50"
                        onCheckedChange={(value) => {
                          if (locked || blocked) return
                          save(key, { kind: "channel", type, channel, value }, value, `${label}の設定`)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </section>

      <section aria-labelledby={`${baseId}-fatigue`} className="min-w-0">
        <H2 id={`${baseId}-fatigue`} className="text-heading">
          受け取る量を減らす
        </H2>
        <div className="mt-4 flex flex-col">
          <div className="flex min-h-12 items-start justify-between gap-4 border-t border-border py-4">
            <div className="min-w-0">
              <p id={`${baseId}-digest`} className="text-ui font-medium">
                メールを 1 日 1 回まとめて受け取る
              </p>
              <p id={`${baseId}-digest-note`} className="mt-1 text-caption text-muted-foreground">
                セキュリティの通知と、すぐに対応が必要な通知は、まとめずにすぐ届きます。
              </p>
              {local.status.get("digest") && <StatusText status={local.status.get("digest")!} />}
            </div>
            <Switch
              checked={digest === "daily"}
              aria-labelledby={`${baseId}-digest`}
              aria-describedby={`${baseId}-digest-note`}
              data-testid="ntf-digest"
              onCheckedChange={(on) => save("digest", { kind: "digest", value: on ? "daily" : "off" }, on ? "daily" : "off", "まとめて受け取る設定")}
            />
          </div>
          <div className="flex flex-col gap-3 border-t border-border py-4">
            <div className="flex min-h-12 items-start justify-between gap-4">
              <div className="min-w-0">
                <p id={`${baseId}-quiet`} className="text-ui font-medium">
                  通知を控える時間
                </p>
                <p id={`${baseId}-quiet-note`} className="mt-1 text-caption text-muted-foreground [word-break:auto-phrase]" data-testid="ntf-quiet-summary">
                  {quiet.enabled
                    ? `${quiet.start}〜${crosses ? "翌 " : ""}${quiet.end}（${settings.timezone}）は、メールとプッシュ通知を控えます。基準の時刻（${formatAbsoluteTime(now, settings.timezone)}）は${inQuiet ? "控える時間の中" : "控える時間の外"}です。`
                    : "設定していません。"}
                  セキュリティの通知と、すぐに対応が必要な通知は、この時間も届きます。
                </p>
                {local.status.get("quiet") && <StatusText status={local.status.get("quiet")!} />}
              </div>
              <Switch
                checked={quiet.enabled}
                aria-labelledby={`${baseId}-quiet`}
                aria-describedby={`${baseId}-quiet-note`}
                data-testid="ntf-quiet"
                onCheckedChange={(on) => save("quiet", { kind: "quiet", value: { ...quiet, enabled: on } }, { ...quiet, enabled: on }, "通知を控える時間")}
              />
            </div>
            {quiet.enabled && (
              <div className="flex flex-wrap items-center gap-3 text-ui">
                {(["start", "end"] as const).map((edge) => (
                  <div key={edge} className="flex items-center gap-2">
                    <span id={`${baseId}-quiet-${edge}`}>{edge === "start" ? "開始" : "終了"}</span>
                    <Select
                      items={hours.map((h) => ({ value: h, label: h }))}
                      value={quiet[edge]}
                      onValueChange={(v) => {
                        const value = { ...quiet, [edge]: String(v) }
                        save("quiet", { kind: "quiet", value }, value, "通知を控える時間")
                      }}
                    >
                      <SelectTrigger aria-labelledby={`${baseId}-quiet-${edge}`} className="w-28" data-testid={`ntf-quiet-${edge}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {hours.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

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
