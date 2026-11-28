import { useEffect, useId, useRef, useState } from "react"

import { Sheet, SheetBody, SheetContent } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { useBrowseData } from "@/patterns/browse-data"
import { DataRegionError } from "@/patterns/data-states"
import { NotificationCenter } from "@/patterns/notification-center"
import { useNotificationFeed, type NotificationFeed } from "@/patterns/notification-feed"
import { NotificationButton } from "@/patterns/notification-indicator"
import { PageHeader, PageHeaderContent, PageHeaderTitle } from "@/patterns/page-header"
import { PageLayout } from "@/patterns/page-layout"
import { useScopeGuard } from "@/patterns/scope-guard"
import { useInstantSettings } from "@/patterns/setting-save"
import { SettingRow, SettingSaveStatus } from "@/patterns/setting-status"

import { workspaceName } from "../../data/patterns-integration/model"
import {
  fetchNotifications,
  fetchSettings,
  saveSetting,
  setNotificationsRead,
  subscribePi,
  type PiNotification,
  type PiSettings,
} from "../../data/patterns-integration/server"
import { usePi } from "./pi-context"
import { piHref } from "./pi-router"

// お知らせ（Notifications）と通知の設定（Settings）。製品側のコード。
// - 購読：useNotificationFeed の subscribe / receive。購読の世代が古い通知（前のスコープの購読）は受け付けない。
// - 通知センターを開いている間は、新着を保留する（holdIncoming）。開いただけでは既読にしない。
// - すべて既読：開始の時点の範囲（読み込んだ未読の ID）で固定する。実行中に届いた新着は対象にしない。
// - 通知から移動する前に、最新の権限とスコープを確かめる。移動は未保存の変更の確認を通す。
// - 通知の設定：useInstantSettings（項目ごとに即時保存。失敗は元に戻し、結果が不明なら確認するまで変更できない）。

export type FeedItem = { id: string; title: string; createdAt: number; read: boolean; customerId: string | null }
const toItem = (n: PiNotification): FeedItem => ({ id: n.id, title: n.title, createdAt: Date.parse(n.createdAt), read: n.read, customerId: n.customerId })

export const NOW = Date.parse("2026-11-28T09:00:00+09:00")

export function usePiFeed({ userId, ws, scope, holdIncoming, enabled }: { userId: string; ws: string; scope: string; holdIncoming: boolean; enabled: boolean }) {
  const feed = useNotificationFeed<FeedItem>({
    scopeKey: scope,
    enabled,
    holdIncoming,
    readAllBy: "ids",
    fetcher: async ({ signal }) => {
      const list = (await fetchNotifications(ws, signal)).map(toItem)
      return { items: list, unreadCount: list.filter((n) => !n.read).length }
    },
    updateRead: async (ids, read) => ({ updated: await setNotificationsRead(ws, ids, read) }),
    markAllRead: async (range) => ({ updated: await setNotificationsRead(ws, range.ids, true) }),
  })
  const { subscribe, unsubscribe, receive } = feed
  useEffect(() => {
    if (!enabled) return
    const subscription = subscribe()
    const stop = subscribePi((e) => {
      if (e.type !== "notification") return
      // サーバーの宛先（利用者とワークスペース）が、この購読と一致する通知だけを渡す。購読の世代は receive が確かめる
      if (e.notification.userId !== userId || e.notification.ws !== ws) return
      receive([toItem(e.notification)], subscription)
    })
    return () => {
      unsubscribe(subscription)
      stop()
    }
  }, [enabled, userId, ws, scope, subscribe, unsubscribe, receive])
  return feed
}

/** ヘッダーのお知らせ（ボタンと、Sheet の通知センター） */
export function NotificationsSheet({ feed, open, onOpenChange }: { feed: NotificationFeed<FeedItem>; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { ws, scope, nav, viewAccess, permitLatest } = usePi()
  const headingId = useId()
  const popupRef = useRef<HTMLDivElement>(null)
  const guard = useScopeGuard(scope)
  const [notice, setNotice] = useState<string | null>(null)
  const w = ws === "hq" ? null : ws

  const onOpen = (item: FeedItem) => {
    setNotice(null)
    if (!item.customerId) return
    // 古い画面の関数（前のスコープ）からの移動を止める。移動の直前に、最新の権限で確かめる
    const ticket = guard.begin("navigate")
    if (!guard.isCurrent(ticket)) return
    if (!permitLatest("view")) {
      guard.release(ticket)
      setNotice("この顧客を表示する権限がないため、開けません。")
      return
    }
    guard.release(ticket)
    onOpenChange(false)
    // 実際に移動したときだけ既読にする（未保存の変更の確認で移動をやめた場合は、未読のまま残す）。
    // 移動の後に、このスコープの通知かを確かめ直す（移動の確認の間にスコープが変わった場合は既読にしない）
    const snapshot = guard.capture()
    nav.navigate(piHref("customer", { ws: w, id: item.customerId }), {
      onNavigated: () => {
        if (!item.read && guard.isCurrent(snapshot)) feed.setRead(item.id, true)
      },
    })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (setNotice(null), onOpenChange(o))} mode="view" modal>
      <NotificationButton
        count={feed.unreadCount}
        hasUnread={feed.hasUnread}
        display="count"
        onClick={() => onOpenChange(true)}
        data-testid="notifications-trigger"
      />
      <SheetContent ref={popupRef} side="right" aria-labelledby={headingId} initialFocus={() => popupRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(headingId)}"]`) ?? true} data-testid="notifications-center">
        <SheetBody className="pt-[max(1.5rem,env(safe-area-inset-top))] [&_[data-slot=notification-center-header]]:pr-12">
          <NotificationCenter
            feed={feed}
            headingId={headingId}
            scopeLabel={workspaceName(ws)}
            now={NOW}
            timeZone="Asia/Tokyo"
            onOpen={onOpen}
            hasTarget={(n) => n.customerId !== null}
            getTargetLabel={() => "顧客の詳細"}
            // 権限の確認中と閲覧の権限がない間は、通知の内容（顧客の名前を含む）を表示しない
            canViewContent={() => viewAccess === "allowed"}
            notice={
              notice ? (
                <p role="status" className="text-ui" data-testid="notifications-notice">
                  {notice}
                </p>
              ) : null
            }
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------- 通知の設定
const settingRows: { key: keyof PiSettings; label: string; description: string }[] = [
  { key: "email", label: "メールでも受け取る", description: "お知らせを、登録したメールアドレスにも送ります" },
  { key: "contract", label: "契約の更新", description: "担当する顧客の契約が更新されたときに知らせます" },
  { key: "digest", label: "毎朝のまとめ", description: "前日のお知らせを、毎朝 8 時にまとめて送ります" },
]

export function SettingsScreen() {
  const { user, connectivity } = usePi()
  const loaded = useBrowseData({ query: user.id, scopeKey: user.id, fetcher: (id) => fetchSettings(id) })
  return (
    <PageLayout width="standard" data-testid="pi-settings">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>通知の設定</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      {loaded.status === "error" && <DataRegionError title="設定を取得できませんでした" onRetry={loaded.reload} />}
      {/* 取得した値でフォームを作る（useInstantSettings は、スコープが変わったときの値だけを読む） */}
      {loaded.isCurrent && loaded.data && <InstantSettings key={user.id} initial={loaded.data} offline={connectivity !== "online"} />}
    </PageLayout>
  )
}

function InstantSettings({ initial, offline }: { initial: PiSettings; offline: boolean }) {
  const { user } = usePi()
  const s = useInstantSettings<PiSettings>({
    values: initial,
    scopeKey: user.id,
    // 変更の要求には AbortSignal を渡さない（クライアントの待機の中止で、サーバーの処理は取り消せない）
    save: (key, value) => saveSetting(user.id, key, value).then((r) => r[key]),
    verify: (key) => fetchSettings(user.id).then((r) => r[key]),
  })
  return (
    <div className="flex flex-col gap-6" data-testid="settings-list">
      {offline && (
        <p className="text-ui text-muted-foreground" role="status">
          オフラインのため、接続が戻るまで設定は変更できません
        </p>
      )}
      {settingRows.map((r) => (
        <SettingRow
          key={r.key}
          data-setting-id={r.key}
          label={r.label}
          description={r.description}
          status={<SettingSaveStatus status={s.statusOf(r.key)} onVerify={() => s.verify(r.key)} verifyLabel="保存されたかを確認" />}
        >
          <Switch
            aria-label={r.label}
            checked={s.values[r.key]}
            readOnly={offline || !s.canChange(r.key)}
            onCheckedChange={(v) => {
              if (offline) return
              s.change(r.key, v)
            }}
            data-testid={`setting-${r.key}`}
          />
        </SettingRow>
      ))}
    </div>
  )
}
