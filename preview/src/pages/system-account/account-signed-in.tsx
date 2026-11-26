import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { Activity, Bell, Building2, ChevronsUpDown, House, ListChecks, LogOut, Settings, UserRound, Users } from "lucide-react"

import { Avatar, AvatarFallback, getInitials } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { useToast } from "@/components/ui/toast"
import { decideAccess } from "@/patterns/access"
import { AccessState } from "@/patterns/access-state"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain } from "@/patterns/app-shell"
import { useBrowseData } from "@/patterns/browse-data"
import { DataRegionError } from "@/patterns/data-states"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { useScopeGuard } from "@/patterns/scope-guard"
import { SidebarNav, SidebarNavItem, type NavGroup } from "@/patterns/sidebar-nav"

import { membershipOf, roles, users, workspaces, workspacesOf, type OnboardingTaskId, type Permission, type UserId, type WorkspaceId } from "../../data/system-account/model"
import { onboardingApi } from "../../data/system-account/onboarding-server"
import { notificationsApi } from "../../data/system-account/notifications-server"
import { scopeKeyOf } from "../../data/system-account/permission-data"
import { permissionServer } from "../../data/system-account/permission-server"
import { settingsApi } from "../../data/system-account/settings-server"
import { ProductMark } from "../app-structure/structure-sidebar"
import { DiscardAlert } from "../overlays/discard-alert"
import { accountHref, pagePermission, type AccountPage, type AccountRoute } from "./account-route"
import { AccountVerifyPanel } from "./account-verify"
import { NotificationHeaderCenter, NotificationInbox, NotificationSettingsMatrix, useMockNotificationFeed, type BrowserPermission, type OnNavigate } from "./notification-screens"
import { GettingStartedConnected, useGettingStarted } from "./onboarding-screens"
import { contactText, CustomerEditor, RestrictedOperations, RoleManagement, usePermissionAccess, type PermissionAccess } from "./permission-screens"
import { SettingsArea, type SettingsCategoryId } from "./settings-screens"
import { BackgroundJobsPanel, StatusPageExample, SystemBannerArea, type SystemMonitor } from "./system-screens"

// System & Account の統合の検証画面のうち、ログインした後の製品の画面（製品側のコード）。正式な Pages の実装ではない。
//
// スコープ（利用者、ワークスペース、権限）の扱い
// - 権限は、権限の模擬のサーバーから取得した値（usePermissionAccess）だけを使う。取得中と取得の失敗は許可として扱わない。
// - 利用者が変わったら、この部品ごと作り直す（呼び出し側の key）。ワークスペースと権限が変わったら、各部品の scopeKey が変わり、
//   前のスコープのデータ、選択、未保存の入力、非同期の結果を表示しない。Toast も閉じる（別のスコープへの誤操作を防ぐ）。
// - 所属していないワークスペースの URL を信頼しない（canEnterWorkspace。呼び出し側で確かめる）。

const settingsCategoryIds: SettingsCategoryId[] = ["profile", "display", "notifications", "security", "organization", "members"]
const asCategory = (v: string | null): SettingsCategoryId | null => (settingsCategoryIds.includes(v as SettingsCategoryId) ? (v as SettingsCategoryId) : null)

/** Checklist の作業を開く画面（製品のルーター）。開くだけで、作業を完了にはしない */
const taskRoute: Partial<Record<OnboardingTaskId, Partial<AccountRoute>>> = {
  "first-customer": { page: "customers" },
  "import-customers": { page: "jobs" },
  "invite-members": { page: "members" },
  "set-billing": { page: "settings", cat: "organization" },
  "complete-profile": { page: "settings", cat: "profile" },
}

const navLabels: Record<AccountPage, string> = {
  home: "ホーム",
  customers: "顧客",
  customer: "顧客の詳細",
  notifications: "お知らせ",
  settings: "設定",
  members: "メンバーと権限",
  jobs: "処理の状況",
  status: "稼働状況",
}

export type SignedInAppProps = {
  userId: UserId
  route: AccountRoute & { ws: WorkspaceId }
  monitor: SystemMonitor
  /** URL を変える（製品のルーター）。未保存の変更の確認は、この部品が済ませてから呼ぶ */
  onRouteChange: (route: Partial<AccountRoute>) => void
  onSignOut: () => void
  onExpireSession: () => void
}

export function SignedInApp({ userId, route, monitor, onRouteChange, onSignOut, onExpireSession }: SignedInAppProps) {
  const ws = route.ws
  const scope = useMemo(() => ({ userId, workspaceId: ws }), [userId, ws])
  const { access, revision, notice } = usePermissionAccess({ scope, api: permissionServer.api })
  // 表示と各部品のスコープに使う権限。確定していない間は空（許可しない）。再確認中は前の確定した権限で表示を決める。
  const grants = access.grants && access.grants.scope === scopeKeyOf(scope) ? access.grants : null
  const permissions: readonly Permission[] = useMemo(() => grants?.permissions ?? [], [grants])
  const permissionKey = [...permissions].sort().join(",")

  // ワークスペースや権限が変わったら、表示中の Toast を閉じる（前のスコープの「元に戻す」などを押させない）
  const { toasts, dismiss } = useToast()
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts
  useEffect(() => {
    for (const t of toastsRef.current) dismiss(t.id)
  }, [ws, permissionKey, dismiss])

  // 未保存の変更（設定の明示的な保存のフォーム）。画面の外への移動の前に確認する。
  const [dirty, setDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<{ next: Partial<AccountRoute> | "sign-out"; resolve: (ok: boolean) => void; returnFocus?: () => void } | null>(null)
  const requestNavigate = useCallback(
    (next: Partial<AccountRoute> | "sign-out", options: { beforeConfirm?: () => void; returnFocus?: () => void } = {}) =>
      new Promise<boolean>((resolve) => {
        const leaving = next === "sign-out" || next.page !== "settings"
        if (dirty && leaving) {
          options.beforeConfirm?.()
          setPendingNav({ next, resolve, returnFocus: options.returnFocus })
          return
        }
        if (next === "sign-out") onSignOut()
        else onRouteChange(next)
        resolve(true)
      }),
    [dirty, onRouteChange, onSignOut]
  )
  const go = (next: Partial<AccountRoute>) => void requestNavigate({ ws, ...next })
  useEffect(() => {
    if (route.page !== "settings") setDirty(false)
  }, [route.page])

  // お知らせ（Header の通知センターと専用のページで 1 つの状態を共有する）。専用のページの表示中は、新着を保留する。
  // 通知センターを開いている間と専用のページの表示中は、新着を保留する（閲覧の位置とフォーカスを動かさない）
  const [centerOpen, setCenterOpen] = useState(false)
  const feed = useMockNotificationFeed({ userId, workspaceId: ws, scopeVersion: permissionKey, holdIncoming: centerOpen || route.page === "notifications" })
  useEffect(() => setCenterOpen(false), [ws])
  // 通知から移動する処理は、開始したワークスペースと権限のスコープでだけ続ける。確認の応答を待つ間に切り替えたら、移動しない
  const navigationGuard = useScopeGuard(`${userId}:${ws}:${permissionKey}`)
  const accessRef = useRef(access)
  accessRef.current = access
  const onNotificationNavigate: OnNavigate = async (target, { workspaceId }) => {
    const ticket = navigationGuard.begin("navigate")
    // 通知のリンクを認可済みとして信頼しない。対象の存在と閲覧の権限を、移動の前に確かめる。
    const check = await notificationsApi.resolveTarget({ userId, workspaceId }, target, { signal: ticket.signal })
    if (!navigationGuard.isLatest(ticket)) return { status: "cancelled" }
    if (check.status === "deleted") return { status: "unavailable", reason: "deleted", message: `${target.label}は削除されています。お知らせは残しています。` }
    if (check.status === "forbidden") return { status: "unavailable", reason: "forbidden", message: "この対象を閲覧する権限がありません。管理者に権限を依頼してください。" }
    const next: Partial<AccountRoute> =
      target.kind === "customer" ? { page: "customer", id: target.id } : target.kind === "job" ? { page: "jobs" } : { page: "settings", cat: "security" }
    const needed = pagePermission[next.page as AccountPage]
    // クリックした時点ではなく、確認の応答の後の最新の権限で判断する（再確認中は許可しない）
    if (needed && !decideAccess(accessRef.current, { permissions: [needed] }).allowed) {
      return { status: "unavailable", reason: "forbidden", message: "この対象を閲覧する権限がありません。管理者に権限を依頼してください。" }
    }
    const ok = await requestNavigate(
      { ws: workspaceId as WorkspaceId, ...next },
      {
        // 確認の Dialog の前に通知センターを閉じる（モバイルの通知センターはモーダルの Sheet で、外の Dialog を操作できなくなるため）
        beforeConfirm: () => setCenterOpen(false),
        // 取りやめた場合は、通知センターを開くボタンへフォーカスを戻す（押した通知は閉じた通知センターの中にあり、戻せない）
        returnFocus: () => document.querySelector<HTMLElement>("[data-testid=ntf-trigger]")?.focus(),
      }
    )
    return ok ? { status: "navigated" } : { status: "cancelled" }
  }

  const page = (pagePermissionKnown(route.page) ? route.page : null) as AccountPage | null
  const can = (p: Permission | null) => p === null || permissions.includes(p)
  const navItem = (id: AccountPage, icon: typeof House) => ({ id, label: navLabels[id], icon, href: accountHref({ page: id, ws }) })
  // 権限が確定するまで、権限の必要な項目を表示しない（表示した後で消すと、存在を知らせることになる）
  const groups: NavGroup[] = [
    { items: [navItem("home", House)] },
    { items: [...(can("customers.view") ? [navItem("customers", Building2), navItem("jobs", ListChecks)] : []), navItem("notifications", Bell)] },
    { label: "管理", items: [...(can("members.view") ? [navItem("members", Users)] : []), navItem("status", Activity)] },
  ]
  const currentNav = route.page === "customer" ? "customers" : route.page

  let body: ReactNode
  const needed = page ? pagePermission[page] : null
  const decision = needed ? decideAccess(access, { permissions: [needed] }) : null
  if (!page) {
    body = (
      <AccessState
        kind="not-found"
        headingLevel={1}
        actions={
          <Button variant="outline" onClick={() => go({ page: "home" })}>
            ホームへ移動
          </Button>
        }
      />
    )
  } else if (decision && !decision.allowed && decision.reason.kind === "unresolved" && decision.reason.status === "loading") {
    body = <PageFrame title={navLabels[page]} busy="権限を確認しています" />
  } else if (decision && !decision.allowed && decision.reason.kind === "unresolved" && decision.reason.status === "error") {
    body = (
      <PageFrame title={navLabels[page]}>
        <DataRegionError title="権限を確認できませんでした" description="表示できる内容を確かめられないため、表示していません。" onRetry={access.reload} />
      </PageFrame>
    )
  } else if (decision && !decision.allowed && (decision.reason.kind === "authorization" || decision.reason.kind === "entitlement")) {
    body = (
      <AccessState
        kind="forbidden"
        headingLevel={1}
        description={contactText(scope, "必要な場合は、")}
        actions={
          <Button variant="outline" onClick={() => go({ page: "home" })}>
            ホームへ移動
          </Button>
        }
      />
    )
  } else {
    body = (
      <PageBody
        page={page}
        route={route}
        userId={userId}
        scope={scope}
        access={access}
        revision={revision}
        permissions={permissions}
        monitor={monitor}
        feed={feed}
        onNavigate={onNotificationNavigate}
        go={go}
        onDirtyChange={setDirty}
      />
    )
  }

  return (
    <AppShell>
      <AccountSidebar
        userId={userId}
        ws={ws}
        groups={groups}
        currentId={currentNav}
        settingsHref={accountHref({ page: "settings", ws })}
        onNavigate={(id, e) => {
          e.preventDefault()
          go(id === "settings" ? { page: "settings" } : { page: id })
        }}
        onWorkspaceChange={(next) => void requestNavigate({ ws: next, page: "home" })}
        onProfile={() => go({ page: "settings", cat: "profile" })}
        onSignOut={() => void requestNavigate("sign-out")}
      />
      <AppShellBody>
        <AppShellHeader>
          <SidebarTrigger className="-ml-2 md:hidden" />
          <span className="flex min-w-0 items-center gap-3 text-ui font-semibold md:hidden">
            <ProductMark />
            <span className="truncate">Flow 営業管理</span>
          </span>
          <span className="hidden min-w-0 truncate text-ui text-muted-foreground md:inline" data-testid="acct-workspace">
            {workspaces[ws].name}
          </span>
          <div className="ml-auto flex items-center">
            <NotificationHeaderCenter
              userId={userId}
              workspaceId={ws}
              scopeVersion={permissionKey}
              feed={feed}
              open={centerOpen}
              onOpenChange={setCenterOpen}
              onNavigate={onNotificationNavigate}
              onOpenAll={() => {
                setCenterOpen(false)
                go({ page: "notifications" })
              }}
              onOpenSettings={() => {
                setCenterOpen(false)
                go({ page: "settings", cat: "notifications" })
              }}
            />
          </div>
        </AppShellHeader>
        {/* 複数のページに関わる障害とオフラインは、main の外（上部）に示す。main のスクロールで隠れない */}
        <SystemBannerArea monitor={monitor} onShowDetails={() => go({ page: "status" })} className="shrink-0" />
        <p className="sr-only" role="status" aria-live="polite" data-testid="acct-permission-notice">
          {notice}
        </p>
        <AppShellMain pageKey={`${ws}:${route.page}:${route.id ?? ""}:${route.page === "settings" ? "" : route.cat ?? ""}`} data-testid="acct-main">
          {body}
          <div className="px-4 pb-16 md:px-6">
            <AccountVerifyPanel phase="app" start="signin" onStartChange={() => undefined} signedIn={{ userId, workspaceId: ws }} onExpireSession={onExpireSession} />
          </div>
        </AppShellMain>
      </AppShellBody>
      <DiscardAlert
        open={pendingNav !== null}
        onOpenChange={(open) => {
          if (open || !pendingNav) return
          pendingNav.resolve(false)
          setPendingNav(null)
          // Alert Dialog がフォーカスを戻し終わった後に移す
          if (pendingNav.returnFocus) window.setTimeout(pendingNav.returnFocus, 0)
        }}
        onDiscard={() => {
          if (!pendingNav) return
          const { next, resolve } = pendingNav
          setPendingNav(null)
          setDirty(false)
          if (next === "sign-out") onSignOut()
          else onRouteChange(next)
          resolve(true)
        }}
        testId="acct-discard"
      />
    </AppShell>
  )
}

// Object のプロトタイプの名前（constructor、toString など）を既知のページとして扱わない
const pagePermissionKnown = (page: string): page is AccountPage => Object.hasOwn(pagePermission, page)

// ---------------------------------------------------------------- ページ
function PageFrame({ title, description, actions, busy, children }: { title: string; description?: ReactNode; actions?: ReactNode; busy?: string; children?: ReactNode }) {
  return (
    <PageLayout width="standard">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{title}</PageHeaderTitle>
          {description && <PageHeaderDescription>{description}</PageHeaderDescription>}
        </PageHeaderContent>
        {actions && <PageHeaderActions>{actions}</PageHeaderActions>}
      </PageHeader>
      {busy ? (
        <p className="text-ui text-muted-foreground" aria-busy="true">
          {busy}
        </p>
      ) : (
        children
      )}
    </PageLayout>
  )
}

type PageBodyProps = {
  page: AccountPage
  route: AccountRoute & { ws: WorkspaceId }
  userId: UserId
  scope: { userId: UserId; workspaceId: WorkspaceId }
  access: PermissionAccess
  revision: number
  permissions: readonly Permission[]
  monitor: SystemMonitor
  feed: ReturnType<typeof useMockNotificationFeed>
  onNavigate: OnNavigate
  go: (next: Partial<AccountRoute>) => void
  onDirtyChange: (dirty: boolean) => void
}

function PageBody(props: PageBodyProps) {
  const { page, route, userId, scope, access, revision, monitor, feed, onNavigate, go, onDirtyChange } = props
  const ws = route.ws
  switch (page) {
    case "home":
      return <HomePage {...props} />
    case "customers":
      return <CustomersPage {...props} />
    case "customer":
      return (
        <PageFrame title="顧客の詳細">
          <div className="flex flex-col gap-6">
            <div>
              <Button variant="link" className="px-0" onClick={() => go({ page: "customers" })}>
                顧客の一覧に戻る
              </Button>
            </div>
            {route.id ? (
              <CustomerEditor
                key={`${ws}:${route.id}`}
                scope={scope}
                api={permissionServer.api}
                access={access}
                revision={revision}
                recordId={route.id}
                headingAs="h2"
                offline={!monitor.mutation("customers").allowed}
              />
            ) : (
              <AccessState kind="not-found" headingLevel={2} />
            )}
          </div>
        </PageFrame>
      )
    case "notifications":
      return (
        <PageLayout width="standard">
          <NotificationInbox userId={userId} workspaceId={ws} feed={feed} onNavigate={onNavigate} headingLevel={1} />
        </PageLayout>
      )
    case "settings":
      return <SettingsPage {...props} onDirtyChange={onDirtyChange} />
    case "members":
      return (
        <PageFrame title="メンバーと権限" description="ロールの名前だけでなく、ロールごとに実際にできる操作を示します。">
          <RoleManagement scope={scope} api={permissionServer.api} access={access} revision={revision} headingAs="h2" />
        </PageFrame>
      )
    case "jobs": {
      // 権限の再確認中（refreshing）と再確認の失敗（stale）では、前の権限で開始させない
      const canExport = decideAccess(access, { permissions: ["customers.export"] }).allowed
      const mutation = monitor.mutation("export")
      return (
        <PageFrame title="処理の状況" description="書き出しと取り込みは、このページを離れても続きます。戻ったときに、結果を確かめられます。">
          <BackgroundJobsPanel
            monitor={monitor}
            workspace={ws}
            unavailableReason={!canExport ? "顧客を書き出す権限がありません。" : !mutation.allowed ? "接続とサービスの状態を確かめるまで、開始できません。" : undefined}
          />
        </PageFrame>
      )
    }
    case "status":
      return (
        <PageFrame title="稼働状況" description="機能ごとの状態と、現在の障害、メンテナンスの予定を示します（模擬の監視）。">
          <StatusPageExample headingLevel={2} />
        </PageFrame>
      )
  }
}

function HomePage(props: PageBodyProps) {
  const { userId, route, permissions, go } = props
  const ws = route.ws
  const membership = membershipOf(userId, ws)
  const viewer = useMemo(
    () => ({ userId, workspaceId: ws as string, permissions, joinedBy: membership?.joinedBy ?? ("invited" as const) }),
    [userId, ws, permissions, membership?.joinedBy]
  )
  const state = useGettingStarted({ viewer, api: onboardingApi })
  const hidden = state.checklist?.presentation === "hidden"
  return (
    <PageFrame
      title="ホーム"
      description={`${workspaces[ws].name}・${membership ? roles[membership.role].name : ""}`}
      actions={
        hidden ? (
          <Button variant="outline" onClick={() => state.setVisibility("expanded")} data-testid="acct-checklist-show">
            はじめにやることを表示
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-12">
        <GettingStartedConnected state={state} onOpenTask={(id) => go(taskRoute[id] ?? { page: "home" })} />
        {permissions.includes("customers.view") && <CustomerLinks {...props} limit={5} title="最近の顧客" />}
      </div>
    </PageFrame>
  )
}

function CustomersPage(props: PageBodyProps) {
  const { scope, access, revision, monitor } = props
  const offline = !monitor.mutation("customers").allowed
  return (
    <PageFrame title="顧客">
      <div className="flex flex-col gap-10">
        <RestrictedOperations
          scope={scope}
          api={permissionServer.api}
          access={access}
          revision={revision}
          conditions={{ offline, unavailable: [], pending: false, unmetPrerequisites: [] }}
        />
        <CustomerLinks {...props} title="顧客の一覧" />
      </div>
    </PageFrame>
  )
}

/** 閲覧できる顧客の一覧。担当者だけに制限された顧客は、サーバーが件数と一覧に含めない */
function CustomerLinks({ scope, revision, go, limit, title }: PageBodyProps & { limit?: number; title: string }) {
  const scopeKey = scopeKeyOf(scope)
  const data = useBrowseData({
    query: revision,
    queryKey: `customers:${revision}`,
    scopeKey,
    fetcher: (_, { signal }) => permissionServer.api.fetchOverview(scopeKey, "", { signal }),
  })
  const current = data.isCurrent ? data.data : undefined
  const headingId = `acct-customers-${limit ? "recent" : "all"}`
  if (data.status === "error") return <DataRegionError title="顧客を取得できませんでした" onRetry={data.reload} />
  const shown = current ? (limit ? current.customers.slice(0, limit) : current.customers) : []
  return (
    <section aria-labelledby={headingId} aria-busy={!current || undefined} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-heading">
        {title}
      </h2>
      {!limit && (
        <p className="text-ui text-muted-foreground" data-testid="acct-customer-count">
          {current ? `${current.customerCount} 件` : "読み込んでいます"}
        </p>
      )}
      {!current && limit && <p className="text-ui text-muted-foreground">読み込んでいます</p>}
      {current && (
        <ul className="flex flex-col text-ui" data-testid={limit ? "acct-recent-customers" : "acct-customers"}>
          {shown.map((c) => (
            <li key={c.id} className="border-b border-border last:border-b-0">
              <a
                href={accountHref({ page: "customer", ws: scope.workspaceId, id: c.id })}
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                  e.preventDefault()
                  go({ page: "customer", id: c.id })
                }}
                className="flex min-h-11 items-center rounded-xs underline-offset-4 outline-none hover:underline focus-visible:focus-ring"
              >
                {c.company}
              </a>
            </li>
          ))}
        </ul>
      )}
      {limit && current && current.customerCount > limit && (
        <div>
          <Button variant="link" className="px-0" onClick={() => go({ page: "customers" })}>
            すべての顧客を見る（{current.customerCount} 件）
          </Button>
        </div>
      )}
    </section>
  )
}

function SettingsPage({ userId, route, permissions, go, onDirtyChange }: PageBodyProps) {
  const ws = route.ws
  const settingsScope = useMemo(() => ({ userId, workspaceId: ws, permissions }), [userId, ws, permissions])
  const [browserPermission, setBrowserPermission] = useState<BrowserPermission>("default")
  return (
    <PageFrame title="設定" description={`${users[userId].name}さんの個人の設定と、${workspaces[ws].name}の設定`}>
      <SettingsArea
        scope={settingsScope}
        api={settingsApi}
        category={asCategory(route.cat)}
        onCategoryChange={(cat) => go({ page: "settings", cat })}
        hrefFor={(cat) => accountHref({ page: "settings", ws, cat })}
        onPermissionDenied={() => undefined}
        onAnyDirtyChange={onDirtyChange}
        notifications={
          <NotificationSettingsMatrix
            userId={userId}
            workspaceId={ws}
            browserPermission={browserPermission}
            // 模擬：実際の Notification.requestPermission() は呼ばない
            onRequestBrowserPermission={() => setBrowserPermission("granted")}
            headingLevel={3}
          />
        }
      />
    </PageFrame>
  )
}

// ---------------------------------------------------------------- Sidebar
function AccountSidebar({
  userId,
  ws,
  groups,
  currentId,
  settingsHref,
  onNavigate,
  onWorkspaceChange,
  onProfile,
  onSignOut,
}: {
  userId: UserId
  ws: WorkspaceId
  groups: NavGroup[]
  currentId: string
  settingsHref: string
  onNavigate: (id: AccountPage, event: MouseEvent) => void
  onWorkspaceChange: (ws: WorkspaceId) => void
  onProfile: () => void
  onSignOut: () => void
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const user = users[userId]
  const list = workspacesOf(userId)
  const navigate = (id: string, e: MouseEvent) => {
    onNavigate(id as AccountPage, e)
    if (isMobile) setOpenMobile(false)
  }
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center group-data-[collapsible=icon]/sidebar:flex-col">
        <a
          href={accountHref({ page: "home", ws })}
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            navigate("home", e)
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-sm px-2 outline-none focus-visible:focus-ring group-data-[collapsible=icon]/sidebar:w-10 group-data-[collapsible=icon]/sidebar:flex-none group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0"
        >
          <ProductMark />
          <span className="truncate text-ui font-semibold group-data-[collapsible=icon]/sidebar:sr-only">Flow 営業管理</span>
        </a>
        {!isMobile && <SidebarTrigger />}
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav groups={groups} currentId={currentId} onNavigate={navigate} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarNavItem item={{ id: "settings", label: "設定", icon: Settings, href: settingsHref }} currentId={currentId} onNavigate={navigate} />
          <SidebarMenuItem>
            <DropdownMenu>
              <SidebarMenuButton size="lg" render={<DropdownMenuTrigger />} className="group-data-[collapsible=icon]/sidebar:size-10" data-testid="acct-account-menu">
                <div className="flex shrink-0">
                  <Avatar size="sm">
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                </div>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-sidebar-foreground">{user.name}</span>
                  <span className="truncate text-caption">{workspaces[ws].name}</span>
                </span>
                <ChevronsUpDown aria-hidden="true" className="ml-auto size-4! group-data-[collapsible=icon]/sidebar:hidden" />
              </SidebarMenuButton>
              <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" sideOffset={12} className="min-w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                {list.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>ワークスペース</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={ws} onValueChange={(v) => v !== ws && onWorkspaceChange(v as WorkspaceId)}>
                        {list.map((w) => (
                          // 選んだら閉じる（Base UI の RadioItem は既定では閉じない。切り替えの後もメニューが開いたまま残らないように）
                          <DropdownMenuRadioItem key={w.id} value={w.id} closeOnClick>
                            {w.name}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onProfile}>
                  <UserRound />
                  プロフィール
                </DropdownMenuItem>
                {/* 通常のログアウトは確認せず、Destructive の色にしない。未保存の変更がある場合だけ確認する */}
                <DropdownMenuItem onClick={onSignOut}>
                  <LogOut />
                  ログアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
