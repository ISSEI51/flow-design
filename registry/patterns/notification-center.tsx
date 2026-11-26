"use client"

import * as React from "react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { DataRefreshIndicator, DataRegionError, LoadingReveal } from "@/patterns/data-states"
import type { NotificationFeed } from "@/patterns/notification-feed"
import { NotificationList, type NotificationListProps } from "@/patterns/notification-list"
import { groupNotifications, type NotificationLike } from "@/patterns/notification-state"

// Flow Design Notification Center（Patterns / System & Account / Notifications）
// 通知センターの中身（見出し、すべて・未読の切り替え、一括既読、状態、一覧）。容器（Popover、Sheet、専用のページ）は製品が選ぶ。
// 定義は docs/web/patterns/notifications.md の「通知センター」と「状態管理」を参照。
//
// この部品が守ること
// - 開いただけでは既読にしない。一括既読は明示的な操作で、対象の範囲（「本社営業部の未読 3 件」）をボタンの名前と文で示す。
// - 初回の読み込み、通知なし、未読なし、再取得中、取得失敗、再取得の失敗、既読の更新の失敗を区別して示す。
// - 新着は「新着 N 件を表示」で加える（一覧の位置とフォーカスを動かさない）。読み上げは件数だけにし、内容を強制的に読み上げない。
// - 既読の更新の失敗は Alert で画面に残す（Toast だけにしない）。結果が不明な場合は取得し直していることを示す。
// - 押したボタン（一括既読、新着の表示）が消えた場合は、見出し（または最初の新着）へフォーカスを移す。
//
// この部品が持たないもの（製品の責務）
// - 容器の選択と開閉、通知センターの配置（Header の右側、Header がなければ Sidebar の下部）。
// - 通知を開いたときの移動（onOpen）と、移動できなかった理由の文（notice に渡す）。

type NotificationFilter = "all" | "unread"

type NotificationCenterProps<T extends NotificationLike> = Pick<
  NotificationListProps<T>,
  "now" | "timeZone" | "onOpen" | "hasTarget" | "getTargetLabel" | "renderMeta" | "renderActions" | "groupTitle" | "showAbsoluteTime" | "initialExpandedFor"
> & {
  feed: NotificationFeed<T>
  title?: string
  /** 見出しの id。容器（Popover、Sheet）の aria-labelledby に使う */
  headingId?: string
  headingLevel?: 1 | 2
  /** 通知の範囲（ワークスペースの名前）。一括既読の対象の説明にも使う */
  scopeLabel?: string
  filter?: NotificationFilter
  defaultFilter?: NotificationFilter
  onFilterChange?: (filter: NotificationFilter) => void
  /** 集約してよい通知か。個別の対応が必要な通知と重要なセキュリティの通知は false を返す */
  canGroup?: (item: T) => boolean
  /** 通知を開いた結果など、一覧の上に示す文（移動できなかった理由など） */
  notice?: React.ReactNode
  /** 一覧の下に置く移動（専用のページ、通知の設定） */
  footer?: React.ReactNode
  /** 一覧のスクロールの領域。位置の復元に使う */
  scrollRef?: React.Ref<HTMLDivElement>
  /** 一覧のスクロールの領域の className（Popover では max-h-* と overflow-y-auto） */
  scrollClassName?: string
  /** 初回の読み込みの Skeleton の行の数 */
  loadingRows?: number
  className?: string
}

function NotificationCenter<T extends NotificationLike>({
  feed,
  title = "お知らせ",
  headingId,
  headingLevel = 2,
  scopeLabel,
  filter: filterProp,
  defaultFilter = "all",
  onFilterChange,
  canGroup,
  notice,
  footer,
  scrollRef,
  scrollClassName,
  loadingRows = 3,
  className,
  now,
  timeZone,
  ...listProps
}: NotificationCenterProps<T>) {
  const [ownFilter, setOwnFilter] = React.useState<NotificationFilter>(defaultFilter)
  const filter = filterProp ?? ownFilter
  const setFilter = (next: NotificationFilter) => {
    setOwnFilter(next)
    onFilterChange?.(next)
  }
  const generatedId = React.useId()
  const titleId = headingId ?? `${generatedId}-title`
  const rangeId = `${generatedId}-range`
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const Heading = headingLevel === 1 ? "h1" : "h2"

  const showList = feed.status === "ready" || feed.status === "refreshing"
  const visible = React.useMemo(() => (filter === "unread" ? feed.items.filter((n) => !n.read) : feed.items), [feed.items, filter])
  const entries = React.useMemo(() => groupNotifications(visible, { canGroup }), [visible, canGroup])
  const unreadLoaded = feed.items.filter((n) => !n.read).length
  const running = feed.readAllRange !== null
  // 一括既読の範囲の名前と文を、実際の範囲に合わせる。
  // cursor：開始した時点までのすべて（読み込んでいない通知を含む）。ids：読み込み済みの未読だけ。
  // ids で、読み込んでいない通知があるか、サーバーの未読の件数が読み込み済みより多い場合は「すべて」と呼ばない。
  const cursor = feed.readAllBy === "cursor"
  const total = feed.unreadCount
  const coversAll = cursor || (!feed.hasMore && (total === null || total <= unreadLoaded + feed.pending.filter((n) => !n.read).length))
  const showReadAll = showList && feed.canOperate && (unreadLoaded > 0 || (cursor && total !== 0 && feed.hasUnread !== false) || running)
  const readAllLabel = coversAll ? "すべて既読にする" : `読み込んだ ${unreadLoaded} 件を既読にする`
  const where = scopeLabel ? `${scopeLabel}の` : ""
  const rangeText = running
    ? cursor
      ? "既読にしています"
      : `${feed.readAllRange!.ids.length} 件を既読にしています`
    : cursor
      ? `対象：${where}未読${total !== null ? ` ${total} 件` : "すべて"}（いま表示している最新のお知らせまで。この後に届くものは含めない）`
      : coversAll
        ? `対象：${where}未読 ${unreadLoaded} 件`
        : `対象：読み込んだ未読 ${unreadLoaded} 件${total !== null && total > unreadLoaded ? `（ほかの未読 ${total - unreadLoaded} 件は対象外）` : "（読み込んでいないお知らせは対象外）"}`

  // 押したボタンが消えたとき、最後の通知が一覧から消えたときに、フォーカスを <body> に落とさない。
  const transient = React.useRef<"read-all" | "pending" | null>(null)
  // 「新着 N 件を表示」で加えた通知の ID。加えた後、最も新しい通知へフォーカスを移す（利用者が押した操作の結果）
  const focusNew = React.useRef<string[] | null>(null)
  // 一覧の中にフォーカスがあった（一覧が空になったときに見出しへ移すため）
  const listFocused = React.useRef(false)
  const isEmpty = showList && entries.length === 0
  React.useLayoutEffect(() => {
    const active = document.activeElement
    const lost = !active || active === document.body || !active.isConnected
    const root = rootRef.current
    if (focusNew.current) {
      const ids = new Set(focusNew.current)
      focusNew.current = null
      transient.current = null
      const row = Array.from(root?.querySelectorAll<HTMLElement>("[data-notification-id]") ?? []).find((el) => ids.has(el.dataset.notificationId!))
      const target = row?.querySelector<HTMLElement>("[data-row-focus]") ?? row?.querySelector<HTMLElement>("button:not([disabled])")
      ;(target ?? headingRef.current)?.focus()
      return
    }
    if (lost && ((transient.current === "read-all" && !showReadAll) || (transient.current === "pending" && feed.pending.length === 0))) {
      headingRef.current?.focus()
    }
    if ((transient.current === "read-all" && !showReadAll) || (transient.current === "pending" && feed.pending.length === 0)) transient.current = null
    if (isEmpty && listFocused.current) {
      listFocused.current = false
      if (lost) headingRef.current?.focus()
    }
  }, [showReadAll, feed.pending.length, isEmpty])

  const live = feed.pending.length > 0 ? `新着のお知らせが ${feed.pending.length} 件あります` : feed.announcement

  const error = feed.error
  const errorText = error
    ? error.outcome === "unknown"
      ? "更新できたかを確認できませんでした。最新の状態を取得し直しています。"
      : error.kind === "read-all"
        ? "すべて既読にできませんでした。もう一度お試しください。"
        : `${error.ids.length} 件を${error.read ? "既読" : "未読"}にできませんでした。もう一度お試しください。`
    : null

  return (
    <div ref={rootRef} data-slot="notification-center" className={cn("flex min-h-0 min-w-0 flex-col", className)}>
      {/* 見出しの行の高さは、新着のボタンの有無で変えない（右の場所を最初から確保する）。
          新着を保留したときに、表示中の通知の位置を動かさないため */}
      <div data-slot="notification-center-header" className="flex min-h-12 items-start justify-between gap-4">
        <div className="min-w-0">
          <Heading id={titleId} ref={headingRef} tabIndex={-1} className={cn(headingLevel === 1 ? "text-page-title" : "text-heading", "outline-none")}>
            {title}
          </Heading>
          {scopeLabel && <p className="mt-1 text-caption text-muted-foreground">{scopeLabel}</p>}
        </div>
        <div className="flex h-10 shrink-0 items-center pointer-coarse:h-12">
          {feed.pending.length > 0 && showList ? (
            <Button
              variant="secondary"
              size="sm"
              className="pointer-coarse:min-h-12"
              data-slot="notification-show-new"
              onFocus={() => (transient.current = "pending")}
              onClick={() => {
                focusNew.current = feed.pending.map((n) => n.id)
                feed.showPending()
              }}
            >
              新着 {feed.pending.length} 件を表示
            </Button>
          ) : (
            // 新着のボタンを表示している間は、更新中の表示を同じ場所に出さない（取得の状態は aria-busy で伝える）
            <DataRefreshIndicator active={feed.status === "refreshing"} />
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label="表示するお知らせ" className="flex gap-1">
          {(
            [
              ["all", "すべて"],
              ["unread", "未読"],
            ] as const
          ).map(([value, text]) => (
            <Button
              key={value}
              variant={filter === value ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={filter === value}
              className="pointer-coarse:min-h-12"
              onClick={() => setFilter(value)}
            >
              {text}
            </Button>
          ))}
        </div>
        {showReadAll && (
          <Button
            variant="outline"
            size="sm"
            loading={running}
            aria-describedby={rangeId}
            data-slot="notification-read-all"
            className="pointer-coarse:min-h-12"
            onFocus={() => (transient.current = "read-all")}
            onClick={() => feed.readAll()}
          >
            {readAllLabel}
          </Button>
        )}
      </div>
      {/* 一括既読の範囲。開始した時点の件数を示し、処理中に届いた新着を含めない */}
      {showReadAll && (
        <p id={rangeId} className="mt-2 text-right text-caption text-muted-foreground">
          {rangeText}
        </p>
      )}

      {/* 常に置く読み上げの領域。新着は件数だけを伝える（内容を強制的に読み上げない） */}
      <p role="status" className="sr-only" data-slot="notification-live">
        {live}
      </p>

      {/* 常に置く読み上げの領域（空の間も display:none にしない）。中身を入れたときに読み上げる */}
      <div aria-live="polite" data-slot="notification-notice" className="flex flex-col gap-3 not-empty:mt-4">
        {notice}
        {errorText && (
          <Alert variant="warning" data-slot="notification-update-error">
            <AlertTitle>{error!.outcome === "unknown" ? "既読の状態を確認しています" : "更新できませんでした"}</AlertTitle>
            <AlertDescription>{errorText}</AlertDescription>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={feed.dismissError}>
                閉じる
              </Button>
            </AlertAction>
          </Alert>
        )}
      </div>
      {feed.refreshFailed && (
        <DataRegionError
          variant="warning"
          className="mt-4"
          title="最新のお知らせを取得できませんでした"
          description="前に取得した時点の内容を表示しています。"
          onRetry={feed.reload}
        />
      )}

      <div
        ref={scrollRef}
        data-slot="notification-scroll"
        aria-busy={feed.status === "loading" || feed.status === "refreshing" || undefined}
        className={cn("mt-2 min-h-0 min-w-0", scrollClassName)}
        onFocus={() => (listFocused.current = true)}
        onBlur={(event) => {
          const el = event.target
          const container = event.currentTarget
          // 要素が残ったまま一覧の外へ移った（利用者の操作）なら、記録を消す。
          requestAnimationFrame(() => {
            if (el.isConnected && !container.contains(document.activeElement)) listFocused.current = false
          })
        }}
      >
        {feed.status === "loading" || feed.status === "idle" ? (
          <LoadingReveal loading>
            <ul aria-label={`${title}を読み込み中`} className="flex flex-col">
              {Array.from({ length: loadingRows }, (_, i) => (
                <li key={i} className="flex gap-3 border-b border-border py-4 last:border-b-0">
                  <Skeleton className="mt-1 size-2 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-4/5 rounded-sm" />
                    <Skeleton className="h-3 w-2/5 rounded-sm" />
                  </div>
                </li>
              ))}
            </ul>
            <span className="sr-only">読み込み中</span>
          </LoadingReveal>
        ) : feed.status === "error" ? (
          <DataRegionError
            className="mt-2"
            title="お知らせを取得できませんでした"
            description="通信の状態を確かめて、もう一度お試しください。"
            onRetry={feed.reload}
          />
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-ui text-muted-foreground" data-slot="notification-empty">
            {filter === "unread" && feed.items.length > 0 ? "未読のお知らせはありません" : "お知らせはありません"}
          </p>
        ) : (
          <NotificationList
            {...listProps}
            entries={entries}
            now={now}
            timeZone={timeZone}
            label={filter === "unread" ? `未読の${title}` : title}
            disabled={!feed.canOperate}
            onReadChange={(ids, read) => feed.setRead(ids, read)}
            fallbackFocus={() => headingRef.current}
          />
        )}
      </div>
      {footer}
    </div>
  )
}

export { NotificationCenter }
export type { NotificationCenterProps, NotificationFilter }
