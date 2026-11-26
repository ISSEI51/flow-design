"use client"

import * as React from "react"
import { Check, ChevronDown, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { focusAfterRemoval, formatNotificationTime, type NotificationEntry, type NotificationLike } from "@/patterns/notification-state"

// Flow Design Notification List（Patterns / System & Account / Notifications）
// 通知の一覧。通知センター（Popover、Sheet）と専用のページで使う。定義は docs/web/patterns/notifications.md を参照。
//
// この部品が守ること
// - 1 件の基本の情報：タイトル（タイトルだけで何が起きたかがわかる）、対象、発生した時刻、既読・未読、必要な操作。
//   アイコンと Badge は足さない。操作は「既読にする／未読に戻す」だけにし、ほかの操作は製品が renderActions で足す。
// - 未読を色だけで示さない（Dot ＋ 太字 ＋ 読み上げの「未読、」）。
// - 相対時刻は <time dateTime> と title で正確な日時を確かめられるようにする。基準の時刻（now）は製品が渡す。
// - 集約した通知は、含まれる通知を展開して個別に開ける。
// - 既読にした通知が一覧から消えた（未読の絞り込み）ときは、次の通知（なければ前の通知、なければ fallbackFocus）へ
//   フォーカスを移す。利用者が一覧の外へフォーカスを移した後は、フォーカスを動かさない。
// - 新着が一覧に加わっても、フォーカスを動かさない。
//
// この部品が持たないもの（製品の責務）
// - 通知を開いたときの移動（onOpen）。移動の可否（権限、削除、未保存の変更）の判定。
// - 集約のタイトルの文（groupTitle）と、集約してよい通知の判断（groupNotifications の canGroup）。

type NotificationGroupEntry<T extends NotificationLike> = Extract<NotificationEntry<T>, { kind: "group" }>

type NotificationListProps<T extends NotificationLike> = {
  entries: NotificationEntry<T>[]
  /** 一覧のアクセシブルな名前 */
  label: string
  /** 相対時刻の基準の時刻。描画中に Date.now() を読まないよう、製品が渡す */
  now: number
  /** 正確な日時を示すタイムゾーン（利用者の設定） */
  timeZone: string
  /** 通知を開く（対象への移動）。hasTarget が false の通知は開けない */
  onOpen?: (item: T) => void
  hasTarget?: (item: T) => boolean
  /** 既読・未読の変更 */
  onReadChange?: (ids: string[], read: boolean) => void
  /** 対象の名前（顧客の名前など） */
  getTargetLabel?: (item: T) => string | null | undefined
  /** 時刻の後に置く補足（業務の対応の状態など）。文字で示す */
  renderMeta?: (item: T) => React.ReactNode
  /** 行の右に足す操作（専用のページの「削除」など）。必要な場合だけ */
  renderActions?: (item: T) => React.ReactNode
  /** 集約した通知のタイトル（「契約の更新日が近い顧客が 2 件あります」） */
  groupTitle?: (group: NotificationGroupEntry<T>) => string
  /** 既読の操作を受け付けない（再取得中など） */
  disabled?: boolean
  /** 正確な日時を画面にも表示する（専用のページ） */
  showAbsoluteTime?: boolean
  /** 項目が消えて残りがないときの、フォーカスの移動先（一覧の見出しなど） */
  fallbackFocus?: () => HTMLElement | null
  /** 最初に展開しておく集約（この ID の通知を含む集約）。対象から戻ったときの位置の復元に使う */
  initialExpandedFor?: string | null
  className?: string
}

const ROOT = "data-notification-key"

function NotificationList<T extends NotificationLike>({
  entries,
  label,
  now,
  timeZone,
  onOpen,
  hasTarget = () => Boolean(onOpen),
  onReadChange,
  getTargetLabel,
  renderMeta,
  renderActions,
  groupTitle = (g) => `${g.latest.title} ほか ${g.items.length - 1} 件`,
  disabled = false,
  showAbsoluteTime = false,
  fallbackFocus,
  initialExpandedFor = null,
  className,
}: NotificationListProps<T>) {
  const listRef = React.useRef<HTMLUListElement>(null)
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => {
    const group = entries.find((e) => e.kind === "group" && e.items.some((n) => n.id === initialExpandedFor))
    return new Set(group ? [group.key] : [])
  })
  const baseId = React.useId()

  // フォーカスの移動の対象になるキー（表示している順）
  const keys: string[] = []
  for (const entry of entries) {
    keys.push(entry.key)
    if (entry.kind === "group" && expanded.has(entry.key)) for (const item of entry.items) keys.push(item.id)
  }
  const keysSignature = keys.join("\n")

  // 一覧の中で最後にフォーカスしていた項目。利用者が一覧の外へ移したら消す（その後はフォーカスを動かさない）。
  const lastFocused = React.useRef<string | null>(null)
  const previousKeys = React.useRef<string[]>(keys)
  const fallbackRef = React.useRef(fallbackFocus)
  fallbackRef.current = fallbackFocus

  React.useLayoutEffect(() => {
    const before = previousKeys.current
    const after = keysSignature ? keysSignature.split("\n") : []
    previousKeys.current = after
    const last = lastFocused.current
    const list = listRef.current
    if (!last || after.includes(last) || !list) return
    const active = document.activeElement
    // 項目が消えて、フォーカスが body（または一覧を含む容器）に落ちた場合だけ移す。
    const lost = !active || active === document.body || !active.isConnected || active.contains(list)
    lastFocused.current = null
    if (!lost) return
    const next = focusAfterRemoval(before, after, last)
    const target = next ? focusableIn(list, next) : (fallbackRef.current?.() ?? null)
    if (target) {
      if (next) lastFocused.current = next
      target.focus({ preventScroll: false })
    }
  }, [keysSignature])

  const onFocus = (event: React.FocusEvent) => {
    const root = (event.target as HTMLElement).closest<HTMLElement>(`[${ROOT}]`)
    lastFocused.current = root?.getAttribute(ROOT) ?? null
  }
  const onBlur = (event: React.FocusEvent) => {
    const el = event.target as HTMLElement
    // 要素が残ったまま一覧の外へ移った（利用者の操作）なら、記録を消す。要素が消えた場合は残す。
    requestAnimationFrame(() => {
      if (el.isConnected && !listRef.current?.contains(document.activeElement)) lastFocused.current = null
    })
  }

  const toggleGroup = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const row = (item: T, nested: boolean) => (
    <NotificationRow
      key={item.id}
      item={item}
      nested={nested}
      now={now}
      timeZone={timeZone}
      openable={Boolean(onOpen) && hasTarget(item)}
      onOpen={onOpen}
      onReadChange={onReadChange}
      targetLabel={getTargetLabel?.(item) ?? null}
      meta={renderMeta?.(item)}
      actions={renderActions?.(item)}
      disabled={disabled}
      showAbsoluteTime={showAbsoluteTime}
    />
  )

  return (
    <ul
      ref={listRef}
      aria-label={label}
      data-slot="notification-list"
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn("flex flex-col", className)}
    >
      {entries.map((entry) => {
        if (entry.kind === "item") return row(entry.item, false)
        const open = expanded.has(entry.key)
        const subId = `${baseId}-${entry.groupKey}`
        const title = groupTitle(entry)
        const time = formatNotificationTime(entry.latest.createdAt, { now, timeZone })
        return (
          <li key={entry.key} {...{ [ROOT]: entry.key }} data-row-id={entry.key} data-group="" className="border-b border-border last:border-b-0">
            <div className="flex items-start gap-3 py-3">
              <UnreadMark unread={entry.unread > 0} />
              <button
                type="button"
                data-row-focus=""
                aria-expanded={open}
                aria-controls={open ? subId : undefined}
                onClick={() => toggleGroup(entry.key)}
                className="group/notification-group flex min-h-10 min-w-0 flex-1 items-start justify-between gap-2 rounded-xs text-left outline-none focus-visible:focus-ring"
              >
                <span className="min-w-0">
                  <span className={cn("block text-ui [word-break:auto-phrase]", entry.unread > 0 && "font-semibold")}>
                    {entry.unread > 0 && <span className="sr-only">未読 {entry.unread} 件、</span>}
                    {title}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-2 text-caption text-muted-foreground">
                    <span>{entry.items.length} 件</span>
                    <time dateTime={time.iso} title={time.absolute}>
                      {time.text}
                    </time>
                  </span>
                </span>
                <ChevronDown aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground group-aria-expanded/notification-group:rotate-180 motion-safe:transition-transform motion-safe:duration-(--duration-fast)" />
              </button>
              {onReadChange && entry.unread > 0 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  focusableWhenDisabled
                  aria-label={`「${title}」の ${entry.unread} 件を既読にする`}
                  title="まとめて既読にする"
                  className="pointer-coarse:size-12"
                  onClick={() => onReadChange(entry.items.filter((n) => !n.read).map((n) => n.id), true)}
                >
                  <Check />
                </Button>
              )}
            </div>
            {open && (
              <ul id={subId} aria-label={title} className="mb-3 ml-1 flex flex-col border-l border-border pl-4">
                {entry.items.map((item) => row(item, true))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function focusableIn(list: HTMLElement, key: string) {
  const root = Array.from(list.querySelectorAll<HTMLElement>(`[${ROOT}]`)).find((el) => el.getAttribute(ROOT) === key)
  return root?.querySelector<HTMLElement>("[data-row-focus]") ?? root?.querySelector<HTMLElement>("button:not([disabled])") ?? null
}

function UnreadMark({ unread }: { unread: boolean }) {
  // 色だけで示さないよう、タイトルの太さと読み上げの文（「未読、」）も合わせて変える。
  return <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")} />
}

function NotificationRow<T extends NotificationLike>({
  item,
  nested,
  now,
  timeZone,
  openable,
  onOpen,
  onReadChange,
  targetLabel,
  meta,
  actions,
  disabled,
  showAbsoluteTime,
}: {
  item: T
  nested: boolean
  now: number
  timeZone: string
  openable: boolean
  onOpen?: (item: T) => void
  onReadChange?: (ids: string[], read: boolean) => void
  targetLabel: string | null
  meta: React.ReactNode
  actions: React.ReactNode
  disabled: boolean
  showAbsoluteTime: boolean
}) {
  const time = formatNotificationTime(item.createdAt, { now, timeZone })
  const content = (
    <>
      <span className={cn("block text-ui [word-break:auto-phrase]", !item.read && "font-semibold")}>
        {!item.read && <span className="sr-only">未読、</span>}
        {item.title}
      </span>
      <span className="mt-1 flex flex-wrap gap-x-2 text-caption text-muted-foreground">
        {targetLabel && <span>{targetLabel}</span>}
        <time dateTime={time.iso} title={time.absolute}>
          {showAbsoluteTime && time.relative ? `${time.relative}（${time.absolute}）` : showAbsoluteTime ? time.absolute : time.text}
        </time>
        {meta}
      </span>
    </>
  )
  return (
    <li
      {...{ [ROOT]: item.id }}
      data-row-id={item.id}
      data-notification-id={item.id}
      data-read={item.read ? "" : undefined}
      className={cn("flex items-start gap-3 py-3", !nested && "border-b border-border last:border-b-0")}
    >
      <UnreadMark unread={!item.read} />
      {openable ? (
        <button
          type="button"
          data-row-focus=""
          onClick={() => onOpen?.(item)}
          className="block min-h-10 min-w-0 flex-1 rounded-xs text-left outline-none focus-visible:focus-ring"
        >
          {content}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{content}</div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {onReadChange && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            // 再取得中に無効になっても、フォーカスを失わせない。
            focusableWhenDisabled
            aria-label={`「${item.title}」を${item.read ? "未読に戻す" : "既読にする"}`}
            title={item.read ? "未読に戻す" : "既読にする"}
            data-slot="notification-read-toggle"
            className="pointer-coarse:size-12"
            onClick={() => onReadChange([item.id], !item.read)}
          >
            {item.read ? <Mail /> : <Check />}
          </Button>
        )}
      </div>
    </li>
  )
}

export { NotificationList }
export type { NotificationGroupEntry, NotificationListProps }
