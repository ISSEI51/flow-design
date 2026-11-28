import { useRef, useState, type ReactNode } from "react"
import { Bell } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useBrowseData } from "@/patterns/browse-data"
import { NotificationIndicator } from "@/patterns/notification-indicator"
import { describeDelivery, formatAbsoluteTime, getUnreadIndicator, notificationTriggerLabel } from "@/patterns/notification-state"
import { useScopeGuard } from "@/patterns/scope-guard"
import { DiscardChangesAlert } from "@/patterns/unsaved-changes"

import { channelLabels, referenceNow, seedNotifications, users, workspaces, type Channel, type UserId, type WorkspaceId } from "../../data/system-account/model"
import { notificationsApi, notificationsServer, type AppNotification } from "../../data/system-account/notifications-server"
import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import {
  NotificationHeaderCenter,
  NotificationInbox,
  NotificationSettingsMatrix,
  TargetScreen,
  type BrowserPermission,
  type ListPosition,
  type NavigateOutcome,
  type NotificationTarget,
} from "./notification-screens"

// Notifications の資料のページ。例はすべて模擬の通知サーバー（notifications-server.ts）を使う。
// 実際の通知の配信、メール、プッシュ通知、ブラウザの通知の許可は行わない。

const USER = "u-sato" as const
const workspaceOptions: [WorkspaceId, string][] = [
  ["hq", workspaces.hq.name],
  ["west", workspaces.west.name],
]

/** 対象を確かめてから移動する（通知のリンクを認可済みとして信頼しない）。確認に失敗した場合は例外を投げる（移動先の検証の失敗） */
async function checkTarget(workspaceId: WorkspaceId, target: NotificationTarget, signal?: AbortSignal): Promise<NavigateOutcome | null> {
  const check = await notificationsApi.resolveTarget({ userId: USER, workspaceId }, target, { signal })
  if (check.status === "deleted") return { status: "unavailable", reason: "deleted", message: `${target.label}は削除されています。お知らせは残しています。` }
  if (check.status === "forbidden") return { status: "unavailable", reason: "forbidden", message: "この対象を閲覧する権限がありません。管理者に権限を依頼してください。" }
  return null
}

function WorkspaceRadios({ name, value, onChange }: { name: string; value: WorkspaceId; onChange: (v: WorkspaceId) => void }) {
  return (
    <DemoControls legend="ワークスペース">
      {workspaceOptions.map(([id, label]) => (
        <Radio key={id} name={name} checked={value === id} onChange={() => onChange(id)}>
          {label}
        </Radio>
      ))}
    </DemoControls>
  )
}

/** 例の中の製品の画面の枠（Header と本文） */
function AppFrame({ header, children, testId }: { header: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border" data-testid={testId}>
      <header className="flex min-h-16 items-center justify-between gap-2 border-b border-border px-4">
        <span className="text-ui font-semibold">営業管理</span>
        {header}
      </header>
      <div className="min-h-48 p-4 sm:p-6">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------- 通知センター（Header の右側）

function CenterDemo() {
  const [user, setUser] = useState<UserId>(USER)
  const [workspace, setWorkspace] = useState<WorkspaceId>("hq")
  const [display, setDisplay] = useState<"count" | "dot">("count")
  const [listResult, setListResult] = useState<"success" | "fail" | "slow">("success")
  const [mounted, setMounted] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [open, setOpen] = useState(false)
  const [screen, setScreen] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  // 製品の移動の処理：確認の応答を待つ間にアカウントやワークスペースが変わったら、移動しない（製品の責務の例）
  const navGuard = useScopeGuard(`${user}:${workspace}`)

  const applyList = (v: typeof listResult) => {
    setListResult(v)
    notificationsServer.outcome.list = v === "fail" ? "fail" : "success"
    notificationsServer.latency.list = v === "slow" ? 3000 : 500
    // 画面を開き直した場合と同じく、取得し直す
    setReloadKey((k) => k + 1)
  }

  return (
    <DemoFrame testId="ntf-center-demo">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <DemoControls legend="アカウント">
            {(["u-sato", "u-suzuki"] as const).map((u) => (
              <Radio
                key={u}
                name="ntf-center-user"
                checked={user === u}
                onChange={() => {
                  setUser(u)
                  setScreen(null)
                  // 鈴木 一郎は本社営業部だけに所属する（model.ts）。模擬のデータでは通知を持たない
                  if (u === "u-suzuki") setWorkspace("hq")
                }}
              >
                {users[u].name}
              </Radio>
            ))}
          </DemoControls>
          {user === USER && <WorkspaceRadios name="ntf-center-ws" value={workspace} onChange={(v) => (setWorkspace(v), setScreen(null))} />}
          <DemoControls legend="未読の表示">
            <Radio name="ntf-center-display" checked={display === "count"} onChange={() => setDisplay("count")}>
              件数（Count）
            </Radio>
            <Radio name="ntf-center-display" checked={display === "dot"} onChange={() => setDisplay("dot")}>
              未読があることだけ（Dot）
            </Radio>
          </DemoControls>
          <DemoControls legend="お知らせの取得（模擬の通知サーバー）">
            <Radio name="ntf-center-list" checked={listResult === "success"} onChange={() => applyList("success")}>
              成功
            </Radio>
            <Radio name="ntf-center-list" checked={listResult === "slow"} onChange={() => applyList("slow")}>
              遅い（3 秒）
            </Radio>
            <Radio name="ntf-center-list" checked={listResult === "fail"} onChange={() => applyList("fail")}>
              失敗
            </Radio>
          </DemoControls>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" data-testid="ntf-center-push" onClick={() => notificationsServer.push(workspace)}>
              新着を 1 件届ける（模擬）
            </Button>
            <Button variant="ghost" size="sm" data-testid="ntf-center-mount" onClick={() => setMounted((m) => !m)}>
              {mounted ? "通知センターを取り除く" : "通知センターを戻す"}
            </Button>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-ui">
              <input
                type="checkbox"
                checked={paused}
                data-testid="ntf-center-pause"
                onChange={(e) => setPaused(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              取得と購読を止める
            </label>
          </div>
        </div>
        <AppFrame
          testId="ntf-center-app"
          header={
            mounted && (
              <NotificationHeaderCenter
                key={reloadKey}
                userId={user}
                workspaceId={workspace}
                display={display}
                paused={paused}
                subscriberLabel="center"
                open={open}
                onOpenChange={setOpen}
                onNavigate={async (target, { workspaceId }) => {
                  const ticket = navGuard.begin("navigate")
                  try {
                    const blocked = await checkTarget(workspaceId, target, ticket.signal)
                    if (!navGuard.isLatest(ticket)) return { status: "cancelled" }
                    if (blocked) return blocked
                    setScreen(target.label)
                    return { status: "navigated" }
                  } finally {
                    navGuard.release(ticket)
                  }
                }}
              />
            )
          }
        >
          {screen ? (
            <TargetScreen title={screen} onBack={() => (setScreen(null), setOpen(true))}>
              <p className="text-ui text-muted-foreground">通知の対象の画面（例）。「お知らせに戻る」で、開いた通知の位置に戻ります。</p>
            </TargetScreen>
          ) : (
            <p className="text-ui text-muted-foreground">{workspaces[workspace].name}の顧客の一覧（例）</p>
          )}
        </AppFrame>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 専用のページ（一覧、既読、重複、業務の対応）

function TaskSummary({ workspace, tick }: { workspace: WorkspaceId; tick: number }) {
  void tick // 例の操作のたびに読み直す
  const tasks = notificationsServer.tasksOf(workspace)
  const open = tasks.filter((t) => t.status === "open")
  return (
    <div className="text-ui" data-testid="ntf-tasks">
      <p className="font-medium">業務の対応待ち（顧客と処理の画面で管理する業務のデータ）：{open.length} 件</p>
      <p className="mt-1 text-muted-foreground">
        {tasks.map((t) => `${t.label}（${t.status === "open" ? "対応待ち" : "対応済み"}）`).join("、") || "なし"}
      </p>
    </div>
  )
}

function InboxDemo() {
  const [workspace, setWorkspace] = useState<WorkspaceId>("hq")
  const [readResult, setReadResult] = useState<"success" | "fail" | "unknown">("success")
  const [slow, setSlow] = useState(false)
  const [tick, setTick] = useState(0)
  const [target, setTarget] = useState<{ target: NotificationTarget; notification: AppNotification } | null>(null)
  const [restore, setRestore] = useState<ListPosition | null>(null)
  const [readAllBy, setReadAllBy] = useState<"ids" | "cursor">("ids")
  const [paged, setPaged] = useState(false)
  const [inboxKey, setInboxKey] = useState(0)
  const position = useRef<ListPosition | null>(null)
  const enablePaging = () => {
    // 古い未読の通知を 9 件加え、新しい 5 件だけを読み込む（サーバーの未読の件数と、読み込んだ未読の件数が異なる状態）
    if (!paged) {
      notificationsServer.addOlderUnread("hq", 9)
      notificationsServer.addOlderUnread("west", 9)
    }
    notificationsServer.pageSize = 5
    setPaged(true)
    setInboxKey((k) => k + 1)
  }

  const setResult = (v: typeof readResult) => {
    setReadResult(v)
    notificationsServer.outcome.read = v
    notificationsServer.outcome.readAll = v
  }
  const setLatency = (on: boolean) => {
    setSlow(on)
    notificationsServer.latency.read = on ? 2000 : 400
    notificationsServer.latency.readAll = on ? 3000 : 900
  }
  const first = (ws: WorkspaceId) => notificationsServer.stored(ws)[0]?.id

  return (
    <DemoFrame testId="ntf-inbox-demo">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <WorkspaceRadios name="ntf-inbox-ws" value={workspace} onChange={(v) => (setWorkspace(v), setTarget(null), setRestore(null))} />
          <DemoControls legend="既読の更新（模擬の通知サーバー）">
            <Radio name="ntf-inbox-read" checked={readResult === "success"} onChange={() => setResult("success")}>
              成功
            </Radio>
            <Radio name="ntf-inbox-read" checked={readResult === "fail"} onChange={() => setResult("fail")}>
              失敗
            </Radio>
            <Radio name="ntf-inbox-read" checked={readResult === "unknown"} onChange={() => setResult("unknown")}>
              結果が不明
            </Radio>
            <label className="flex min-h-10 cursor-pointer items-center gap-2">
              <input type="checkbox" checked={slow} onChange={(e) => setLatency(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              応答を遅くする（2〜3 秒）
            </label>
          </DemoControls>
          <DemoControls legend="一括既読の範囲">
            <Radio name="ntf-inbox-range" checked={readAllBy === "ids"} onChange={() => (setReadAllBy("ids"), setInboxKey((k) => k + 1))}>
              読み込んだ未読だけ（ID）
            </Radio>
            <Radio name="ntf-inbox-range" checked={readAllBy === "cursor"} onChange={() => (setReadAllBy("cursor"), setInboxKey((k) => k + 1))}>
              開始した時点までのすべて（カーソル）
            </Radio>
            <Button variant="ghost" size="sm" disabled={paged} data-testid="ntf-inbox-paging" onClick={enablePaging}>
              古い未読を 9 件加え、5 件だけ読み込む
            </Button>
          </DemoControls>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" data-testid="ntf-inbox-push" onClick={() => notificationsServer.push(workspace)}>
              新着を 1 件届ける
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="ntf-inbox-redeliver"
              onClick={() => {
                const id = first(workspace)
                if (id) notificationsServer.redeliver(workspace, id)
              }}
            >
              同じ通知をもう一度配信する
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="ntf-inbox-same-title"
              onClick={() => {
                const id = first(workspace)
                if (id) notificationsServer.pushSameTitle(workspace, id)
              }}
            >
              同じ文の別のイベントを届ける
            </Button>
          </div>
        </div>
        <TaskSummary workspace={workspace} tick={tick} />
        <div className="min-w-0" data-testid="ntf-inbox">
          {target ? (
            <TargetScreen
              title={target.target.label}
              onBack={() => {
                setTarget(null)
                setRestore(position.current)
              }}
            >
              <p className="text-ui text-muted-foreground">
                {target.notification.task === "open"
                  ? "この作業は対応待ちです。対応を完了しても、お知らせの既読・未読は変わりません。"
                  : "業務の対応が必要な作業はありません。"}
              </p>
              {target.notification.task === "open" && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  data-testid="ntf-complete-task"
                  onClick={() => {
                    notificationsServer.completeTask(workspace, `${target.target.kind}:${target.target.id}`)
                    setTarget({ ...target, notification: { ...target.notification, task: "done" } })
                    setTick((t) => t + 1)
                  }}
                >
                  対応を完了する
                </Button>
              )}
            </TargetScreen>
          ) : (
            <NotificationInbox
              key={inboxKey}
              readAllBy={readAllBy}
              subscriberLabel="inbox"
              userId={USER}
              workspaceId={workspace}
              scrollClassName="max-h-[30rem] overflow-y-auto"
              restorePosition={restore}
              onRestored={() => setRestore(null)}
              onRemoved={() => setTick((t) => t + 1)}
              onNavigate={async (t, { workspaceId, notification, position: p }) => {
                const blocked = await checkTarget(workspaceId, t)
                if (blocked) return blocked
                position.current = p
                setTarget({ target: t, notification })
                return { status: "navigated" }
              }}
            />
          )}
        </div>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 通知から対象への移動（削除、権限、未保存の変更）

function NavigationDemo() {
  const [open, setOpen] = useState(false)
  const [screen, setScreen] = useState<{ title: string; editable: boolean }>({ title: "株式会社サンプルの詳細（編集中）", editable: true })
  const [memo, setMemo] = useState("")
  const [discard, setDiscard] = useState(false)
  const [scopeVersion, setScopeVersion] = useState(0)
  const [revoked, setRevoked] = useState(false)
  const [deleted, setDeleted] = useState(false)
  // 画面の閲覧の権限（模擬）。顧客の内容を閲覧できない間は、取得し直す前でも、顧客に関する通知の本文を表示しない
  const [canViewCustomers, setCanViewCustomers] = useState(true)
  const decide = useRef<((discard: boolean) => void) | null>(null)
  // 製品の移動の処理：確認の応答を待つ間に権限が変わったら、移動しない（製品の責務の例）
  const navGuard = useScopeGuard(`${USER}:hq:${scopeVersion}`)
  const dirty = screen.editable && memo.length > 0
  const workspace: WorkspaceId = "hq"
  const deleteTargetOf = "n-101"
  const revokeTargetOf = "n-102"

  const confirmDiscard = () =>
    new Promise<boolean>((resolve) => {
      decide.current = resolve
      setDiscard(true)
    })

  return (
    <DemoFrame testId="ntf-nav-demo">
      <div className="flex flex-col gap-6">
        <DemoControls legend="例の操作（模擬。サーバーの状態だけを変え、画面には知らせない）">
          <Button
            variant="ghost"
            size="sm"
            disabled={deleted}
            data-testid="ntf-nav-delete"
            onClick={() => {
              const target = seedTarget(deleteTargetOf)
              if (target) notificationsServer.deleteTarget(target)
              setDeleted(true)
            }}
          >
            1 件目の通知の対象を削除する
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={revoked}
            data-testid="ntf-nav-revoke"
            onClick={() => {
              const target = seedTarget(revokeTargetOf)
              if (target) notificationsServer.revokeAccess(target)
              setRevoked(true)
            }}
          >
            2 件目の通知の対象の閲覧の権限を外す
          </Button>
          <Button variant="ghost" size="sm" data-testid="ntf-nav-scope" onClick={() => setScopeVersion((v) => v + 1)}>
            権限の変更を画面に反映する
          </Button>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-ui">
            <input
              type="checkbox"
              checked={canViewCustomers}
              data-testid="ntf-nav-can-view"
              onChange={(e) => setCanViewCustomers(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            顧客の内容を閲覧できる（画面の権限）
          </label>
        </DemoControls>
        <AppFrame
          testId="ntf-nav-app"
          header={
            <NotificationHeaderCenter
              userId={USER}
              workspaceId={workspace}
              scopeVersion={scopeVersion}
              subscriberLabel="nav"
              open={open}
              onOpenChange={setOpen}
              canViewContent={(n) => canViewCustomers || n.target?.kind !== "customer"}
              onNavigate={async (target, { workspaceId }) => {
                const ticket = navGuard.begin("navigate")
                try {
                  // 1. 未保存の変更があれば、破棄するかを確かめる（Unsaved Changes は Forms & Workflows で扱う。ここでは DiscardAlert）
                  if (dirty && !(await confirmDiscard())) return { status: "cancelled" }
                  // 2. 移動先で、対象の存在と閲覧の権限を確かめる（通知のリンクを認可済みとして信頼しない）
                  const blocked = await checkTarget(workspaceId, target, ticket.signal)
                  // 3. 確認の応答を待つ間に権限が変わった場合は、移動しない
                  if (!navGuard.isLatest(ticket)) return { status: "cancelled" }
                  if (blocked) return blocked
                  setMemo("")
                  setScreen({ title: target.label, editable: false })
                  return { status: "navigated" }
                } finally {
                  navGuard.release(ticket)
                }
              }}
            />
          }
        >
          <TargetScreen title={screen.title} onBack={screen.editable ? undefined : () => setOpen(true)}>
            {screen.editable && (
              <div className="flex max-w-md flex-col gap-2">
                <label htmlFor="ntf-nav-memo" className="text-ui font-medium">
                  メモ
                </label>
                <Textarea id="ntf-nav-memo" value={memo} onChange={(e) => setMemo(e.target.value)} data-testid="ntf-nav-memo" />
                <p className="text-caption text-muted-foreground">入力すると、未保存の変更として扱います。</p>
              </div>
            )}
          </TargetScreen>
        </AppFrame>
      </div>
      <DiscardChangesAlert
        open={discard}
        data-testid="ntf-discard"
        onOpenChange={(o) => {
          setDiscard(o)
          if (!o && decide.current) {
            decide.current(false)
            decide.current = null
          }
        }}
        onDiscard={() => {
          decide.current?.(true)
          decide.current = null
          setDiscard(false)
        }}
      />
    </DemoFrame>
  )
}

/** model.ts の通知の対象の ID（例の操作で使う） */
const seedTarget = (notificationId: string) => seedNotifications.find((n) => n.id === notificationId)?.target?.id ?? null

// ---------------------------------------------------------------- 通知の設定

function SettingsDemo() {
  const [workspace, setWorkspace] = useState<WorkspaceId>("hq")
  const [permission, setPermission] = useState<BrowserPermission>("default")
  const [saveResult, setSaveResult] = useState<"success" | "fail" | "unknown">("success")
  return (
    <DemoFrame testId="ntf-settings-demo">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <WorkspaceRadios name="ntf-settings-ws" value={workspace} onChange={setWorkspace} />
          <DemoControls legend="ブラウザの通知の許可（模擬。ブラウザには問い合わせない）">
            {(
              [
                ["default", "未確認"],
                ["granted", "許可"],
                ["denied", "ブロック"],
              ] as const
            ).map(([v, l]) => (
              <Radio key={v} name="ntf-settings-permission" checked={permission === v} onChange={() => setPermission(v)}>
                {l}
              </Radio>
            ))}
          </DemoControls>
          <DemoControls legend="設定の保存（模擬の通知サーバー）">
            {(
              [
                ["success", "成功"],
                ["fail", "失敗"],
                ["unknown", "結果が不明"],
              ] as const
            ).map(([v, l]) => (
              <Radio
                key={v}
                name="ntf-settings-save"
                checked={saveResult === v}
                onChange={() => {
                  setSaveResult(v)
                  notificationsServer.outcome.saveSetting = v
                }}
              >
                {l}
              </Radio>
            ))}
          </DemoControls>
        </div>
        <NotificationSettingsMatrix
          userId={USER}
          workspaceId={workspace}
          headingLevel={3}
          browserPermission={permission}
          onRequestBrowserPermission={() => setPermission("granted")}
        />
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 配信の状態と既読

function LifecycleDemo() {
  const [id, setId] = useState("n-101")
  const data = useBrowseData({
    query: "hq",
    fetcher: (_q, { signal }) => notificationsApi.list({ userId: USER, workspaceId: "hq" }, { signal }),
  })
  const item = data.isCurrent ? data.data!.items.find((n) => n.id === id) : undefined
  const choices: [string, string][] = [
    ["n-101", "担当の割り当て"],
    ["n-102", "メンション"],
    ["n-103", "書き出しの完了"],
  ]
  return (
    <DemoFrame testId="ntf-lifecycle">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <DemoControls legend="通知">
            {choices.map(([v, l]) => (
              <Radio key={v} name="ntf-lifecycle-id" checked={id === v} onChange={() => setId(v)}>
                {l}
              </Radio>
            ))}
          </DemoControls>
          <Button variant="outline" size="sm" onClick={data.reload} loading={data.status === "refreshing"}>
            最新の情報に更新
          </Button>
        </div>
        {item ? (
          <Table data-testid="ntf-lifecycle-table">
            <TableCaption className="sr-only">「{item.title}」の状態</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>段階</TableHead>
                <TableHead>状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>生成</TableCell>
                <TableCell>生成済み（{formatAbsoluteTime(item.createdAt, "Asia/Tokyo")}）</TableCell>
              </TableRow>
              {(["in-app", "email", "push"] as Channel[]).map((c) => {
                const record = item.delivery.find((d) => d.channel === c)
                return (
                  <TableRow key={c} data-testid={`ntf-delivery-${c}`}>
                    <TableCell>配信：{channelLabels[c]}</TableCell>
                    <TableCell>{record ? describeDelivery(record).label : "送らない（利用者の設定）"}</TableCell>
                  </TableRow>
                )
              })}
              <TableRow data-testid="ntf-lifecycle-read">
                <TableCell>閲覧（アプリ内）</TableCell>
                <TableCell>{item.read ? "既読" : "未読"}</TableCell>
              </TableRow>
              <TableRow data-testid="ntf-lifecycle-task">
                <TableCell>業務の対応</TableCell>
                <TableCell>{item.task === "open" ? "対応待ち" : item.task === "done" ? "対応済み" : "対応は不要"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        ) : (
          <p className="text-ui text-muted-foreground" aria-busy="true">
            {data.status === "error" ? "取得できませんでした" : "読み込んでいます"}
          </p>
        )}
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 未読の表示の例

function IndicatorSample({ count, hasUnread, display }: { count: number | null; hasUnread?: boolean | null; display: "dot" | "count" }) {
  const indicator = getUnreadIndicator({ count, hasUnread, display })
  const label = notificationTriggerLabel("お知らせ", indicator)
  return (
    <div className="flex items-center gap-4" data-testid="ntf-indicator-sample" data-label={label}>
      <span className="relative inline-flex size-12 items-center justify-center rounded-lg border border-border" aria-hidden="true">
        <Bell className="size-5" />
        <NotificationIndicator indicator={indicator} className={indicator.kind === "dot" ? "absolute top-3 right-3" : "absolute top-1.5 left-[calc(50%+2px)]"} />
      </span>
      <span className="text-ui text-muted-foreground">アクセシブルな名前：「{label}」</span>
    </div>
  )
}

const methodRows: [string, ReactNode][] = [
  ["Inline Feedback", "操作に直接関係する情報。入力の誤り、保存した項目の状態。操作した場所に示す"],
  ["Toast", "一時的な操作の結果。画面に結果が表れない操作の成功。部分的な失敗、重大なエラー、結果の不明を Toast だけにしない"],
  ["Alert", "継続して認識する必要がある情報。一括操作の部分的な失敗、更新できなかったこと。対象の画面に残す"],
  ["Banner", "広い範囲に関係する情報（障害、メンテナンス、契約の期限）。System States の System Banner を使う"],
  ["通知センター", "後から確かめる必要がある情報。担当の割り当て、メンション、長時間の処理の完了、リマインダー"],
  ["Dialog", "すぐに判断しないと先へ進めない場合だけ。重要というだけで作業を中断させない"],
  ["メール・Push", "製品の外へ知らせる必要がある場合。利用者の設定、組織のポリシー、Quiet Hours に従う"],
]

export function NotificationsPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / System & Account"
        name="Notifications"
        lead="知る価値のあるイベントだけを、適切な方法で知らせる。作業を不必要に中断させず、既読と業務の対応を区別し、確認できない状態を推測しない。"
      />

      <Section title="通知の必要性と分類" lead="すべてのイベントを通知にしない。通常の自動更新など、知らせる必要がないイベントは履歴に記録するだけにする。">
        <Rules
          rows={[
            ["通知する", "利用者が知る価値があり、知らなければ困るイベント（担当の割り当て、メンション、処理の完了、契約の更新、新しい端末からのログイン）"],
            ["通知しない", "画面を見ればわかる変化、自動の同期、利用者自身の操作の結果のうち画面に表れるもの"],
            ["分類（判断の基準）", "操作の結果、処理の完了、業務の通知、リマインダー、セキュリティ、システム、製品の情報。固定の必須の仕様にせず、表示方法、保存期間、配信の対象、無効にできるかを決める手がかりにする"],
            ["重要度と緊急性", "別々に持つ。具体的な値は製品が定義する。重要だというだけで Dialog にしない。すぐに認識や対応が必要な場合だけ強い表現を使う"],
          ]}
        />
      </Section>

      <Section title="通知方法の選び方" lead="情報の性質から 1 つの方法を選ぶ。同じ情報を、すべての方法で重複して知らせない。">
        <Rules rows={methodRows} />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="取り込みの部分的な失敗を、自動で消える Toast だけで知らせた例">
                <p className="text-caption text-muted-foreground">画面の右下（5 秒で消える）</p>
                <p className="rounded-md border border-border p-3 text-ui">取り込みが完了しました</p>
              </Mock>
            }
            badNote="2 件の失敗が伝わらず、消えた後に確かめられない。"
            good={
              <Mock label="取り込みの結果の画面に部分的な失敗の Alert を残し、通知センターにも記録した例">
                <p className="rounded-md border border-border p-3 text-ui">顧客の取り込みが一部失敗しました（成功 48 件、失敗 2 件）</p>
                <p className="text-caption text-muted-foreground">失敗した 2 件を確かめる ・ 通知センターにも記録</p>
              </Mock>
            }
            goodNote="部分的な失敗は、結果の画面の Alert に残す。後から確かめる場合は通知センターに記録する。"
          />
          <Compare
            bad={
              <Mock label="契約の更新のリマインダーを Dialog で表示して作業を止めた例">
                <div className="rounded-md bg-muted p-4 text-ui">
                  <p className="font-medium">契約の更新日まで 7 日です</p>
                  <p className="mt-2 text-muted-foreground">［OK］を押すまで操作できません</p>
                </div>
              </Mock>
            }
            badNote="重要でも、すぐに判断する必要がない。入力中の作業が中断される。"
            good={
              <Mock label="リマインダーを通知センターに置き、未読の Dot で知らせた例">
                <p className="text-ui">お知らせ（未読あり）</p>
                <p className="text-caption text-muted-foreground">契約の更新日まで 7 日の顧客が 2 件あります</p>
              </Mock>
            }
            goodNote="後から確かめれば足りる情報は、通知センターに置く。"
          />
        </div>
      </Section>

      <Section
        title="通知センター"
        lead="Header の右側（Header がない場合は Sidebar の下部）に置く。少量は Popover、モバイルは全画面の Sheet、大量の履歴は専用のページ。開いただけでは既読にしない。"
      >
        <CenterDemo />
      </Section>

      <Section title="未読の表示" lead="未読があることを知らせれば足りる場合は Dot、件数に意味がある場合は Count。0 件では表示しない。件数が不明なときに架空の件数を作らない。">
        <div data-testid="ntf-indicators">
          <Row label="Count（3 件）">
            <IndicatorSample count={3} display="count" />
          </Row>
          <Row label="Count（120 件）" note="99 を超えたら 99+。名前には正確な件数">
            <IndicatorSample count={120} display="count" />
          </Row>
          <Row label="Dot（3 件）" note="件数に意味がない場合">
            <IndicatorSample count={3} display="dot" />
          </Row>
          <Row label="0 件" note="追加の表示をしない">
            <IndicatorSample count={0} display="count" />
          </Row>
          <Row label="件数が不明（未読あり）" note="件数を作らず Dot">
            <IndicatorSample count={null} hasUnread display="count" />
          </Row>
          <Row label="件数が不明（取得できない）" note="表示しない">
            <IndicatorSample count={null} display="count" />
          </Row>
        </div>
        <Compare
          bad={
            <Mock label="通常の未読の件数を赤い Badge で表示した例">
              <span className="inline-flex h-5 min-w-5 items-center justify-center self-start rounded-full bg-destructive px-1.5 text-caption font-semibold text-destructive-foreground">
                3
              </span>
            </Mock>
          }
          badNote="赤は破壊的な操作とエラーを表す。未読を異常のように見せる。"
          good={
            <Mock label="未読の件数をブランドの色で表示した例">
              <span className="inline-flex h-5 min-w-5 items-center justify-center self-start rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground">
                3
              </span>
            </Mock>
          }
          goodNote="ブランドの色（primary）で示し、名前に「未読 3 件」を含める。"
        />
      </Section>

      <Section title="通知の情報構成" lead="タイトルだけで何が起きたかがわかるようにする。対象、発生した時刻、既読・未読、必要な操作を示し、アイコン、Badge、ボタンを足さない。">
        <Compare
          bad={
            <Mock label="タイトルが「更新があります」で、アイコン、Badge、3 つのボタンを付けた例">
              <p className="text-ui font-medium">更新があります</p>
              <p className="text-caption text-muted-foreground">［新着］［重要］ 開く ・ 既読 ・ 削除 ・ 共有</p>
            </Mock>
          }
          badNote="開くまで何が起きたかわからない。操作と装飾が多く、一覧を読みにくい。"
          good={
            <Mock label="タイトル、対象、相対時刻、未読の印だけを示した例">
              <p className="text-ui font-semibold">青葉商事の担当者に設定されました</p>
              <p className="text-caption text-muted-foreground">青葉商事 ・ 4 分前 ・ 対応待ち</p>
            </Mock>
          }
          goodNote="相対時刻には、正確な日時を title と <time dateTime> で添える（専用のページでは画面にも示す）。"
        />
      </Section>

      <Section
        title="専用のページ"
        lead="大量の履歴は専用のページで扱う。新着は「新着 N 件を表示」で加え、閲覧の位置とフォーカスを動かさない。既読と業務の対応は別に管理する。"
      >
        <InboxDemo />
      </Section>

      <Section title="通知から対象への移動" lead="通知の内容に直接関係する画面へ移動する。移動先で、対象の存在と閲覧の権限を確かめる。未保存の変更がある場合は、破棄するかを確かめる。">
        <NavigationDemo />
      </Section>

      <Section title="通知の設定" lead="通知の種類と配信チャネルを分ける。少数なら Switch の一覧、複数の種類とチャネルなら設定の Matrix。無効にできない通知には理由を示す。">
        <SettingsDemo />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="ブラウザの通知の許可を求めるボタンを、製品のプッシュ通知の Switch として表示した例">
                <p className="text-ui">プッシュ通知［オン］</p>
                <p className="text-caption text-muted-foreground">（押すとブラウザの許可を求める。拒否されるとオフに戻る）</p>
              </Mock>
            }
            badNote="製品の設定とブラウザの許可が混ざり、拒否した後に何が保存されたかわからない。"
            good={
              <Mock label="ブラウザの許可の状態を文で示し、製品の設定の Switch とは別にした例">
                <p className="text-caption text-muted-foreground">このブラウザの設定で、通知がブロックされています。</p>
                <p className="text-ui">メンション：プッシュ通知［オン］</p>
              </Mock>
            }
            goodNote="ブラウザ（OS）の許可と、製品の配信の設定を別に示す。"
          />
        </div>
      </Section>

      <Section title="配信の状態と既読" lead="生成、送信、配信、既読、業務の対応を区別する。確認できない状態を推測しない（メールは送信までしか確かめられないことが多い）。">
        <LifecycleDemo />
      </Section>

      <Section title="状態管理と信頼性">
        <Rules
          rows={[
            ["取得", "Data States を適用する。初回の取得、通知なし、未読なし、再取得中、取得失敗、再取得の失敗を区別する（useNotificationFeed は useBrowseData を使う）"],
            ["新着", "保留して「新着 N 件を表示」。未読の件数には、サーバーの件数にまだ含まれていない新着だけを加える（一覧と保留の両方にある通知を二重に数えない）。読み上げは件数だけにする"],
            ["購読", "購読ごとの記録（世代）で照合する。解除した購読、前の世代の購読（A → B → A の最初の A、権限の変更の前）、アンマウントの後、取得を止めている間に届いた通知を受け付けない"],
            ["既読の更新", "すぐに画面に反映し、応答で確定する。失敗は元に戻す。結果が不明なら「状態を確認中」とし、取得し直した結果で確定する。通知の ID ごとに最後の操作だけを反映する（サーバーでの処理の順序は製品が保証する）"],
            ["一括既読", "開始した時点の範囲に固定する。処理中に届いた新着を既読にしない。結果の件数は、応答で確認できた結果（更新した ID）から求め、要求した件数を使わない"],
            ["スコープ", "ワークスペース、アカウント、認可の範囲が変わったら、前の通知、未読の件数、保留中の新着、非同期の応答を破棄する（A → B → A でも反映しない）"],
            ["権限", "閲覧の権限を失った対象の内容を、通知の本文に残さない（サーバーが伏せて返し、画面は取得し直す）"],
          ]}
        />
      </Section>

      <Section title="モバイルとアクセシビリティ">
        <Bullets
          items={[
            "モバイルでは、通知センターを全画面の Sheet にする。大量の履歴は専用のページ。",
            "新着でフォーカスを奪わない。新着の読み上げは件数だけにし、すべての通知を強制的に読み上げない。",
            "未読を色だけで示さない（Dot、太字、読み上げの「未読、」）。",
            "キーボードで、開く、既読にする、未読に戻す、すべて既読にする、を操作できる。既読にした通知が消えたら、次の通知へフォーカスを移す。",
            "Toast と Banner は、通知センターと重要な操作を覆わない（Toast は画面の下、通知センターは Header の下）。",
            "動きを減らす設定では、開閉の大きさの変化と回転を止める。",
            "音や振動を唯一の手段にしない。使う場合は利用者の設定と製品の必要性に従う。",
          ]}
        />
        <p className="mt-6 text-ui text-muted-foreground">
          例の利用者は {users[USER].name}。基準の時刻は {formatAbsoluteTime(referenceNow, "Asia/Tokyo")}（Asia/Tokyo）。
        </p>
      </Section>
    </article>
  )
}
