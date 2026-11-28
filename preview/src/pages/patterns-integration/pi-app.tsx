import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BarChart3, Building2, LogOut, Settings } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { useAccess } from "@/patterns/access"
import { decideAccess } from "@/patterns/access-decision"
import { AccessState } from "@/patterns/access-state"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain, useAppShell } from "@/patterns/app-shell"
import { decideReauthenticationRestore, planReauthentication, resolveReturnTo } from "@/patterns/auth-flow"
import { SidebarNav, SidebarNavItem, type NavGroup, type NavLinkItem } from "@/patterns/sidebar-nav"
import { SystemBanner } from "@/patterns/system-banner"
import { getMutationAvailability, summarizeIssues, type SystemIssue } from "@/patterns/system-status"
import { useConnectivity, useStableIssues } from "@/patterns/system-status-hooks"
import { UnsavedChangesProvider, useNavigationGuard } from "@/patterns/unsaved-changes"

import { piWorkspaces, type PiUser } from "../../data/patterns-integration/model"
import {
  fetchAccess,
  logout,
  lookupCustomer,
  piControl,
  probe,
  subscribePi,
  type Permission,
} from "../../data/patterns-integration/server"
import { LoginScreen, ProductMark, SetupScreen, VerifyingScreen, needsSetup } from "./pi-account"
import { AnalysisScreen, MetricDetailsScreen } from "./pi-analysis"
import { contentAccessOf, makePermit, PiProvider, type PiContextValue, type PiDraft, type PiGrants } from "./pi-context"
import { clearInflightSaves, CustomerDetailScreen, CustomerEditScreen } from "./pi-customer"
import { CustomersScreen, dropListSnapshot, hasListSnapshot } from "./pi-customers"
import { ImportScreen } from "./pi-import"
import { NotificationsSheet, SettingsScreen, usePiFeed } from "./pi-notify"
import { piHref, PI_APP, usePiRouter } from "./pi-router"
import { VerifyPanel } from "./pi-verify"

// Patterns の横断の検証画面（#/patterns-integration）。Patterns の接続部分を検証するための画面であり、
// Pages フェーズの Reference Application の本実装ではない。Registry の Patterns を組み合わせ、1 つのデータモデル
// （data/patterns-integration）で、一覧・詳細・指標・明細が同じ顧客について矛盾しない値を示す。
//
// 画面の段階（phase）
//   login → verifying（現在の権限を取得して、復帰先と復元を決める）→ setup（初回だけ）→ app
//   app でセッションが切れたら reauth（業務の画面を描画しない。入力はメモリにだけ保持する）→ verifying → app
// 製品（この画面）の責務として行うこと
// - ルーティングと未保存の変更の確認の接続（pi-router.ts）。ワークスペースが変わったら、表示中の移動の確認を取り消す。
// - 認可の失効（セッションの期限切れ）は、未保存の変更を確かめずに releaseAll してから画面を外す。
// - 再認証の後は planReauthentication と decideReauthenticationRestore で、現在の認可を確かめてから復元を決める。

type Phase =
  | { kind: "login"; returnTo: string | null }
  | { kind: "verifying"; user: PiUser }
  | { kind: "setup"; user: PiUser; path: string }
  | { kind: "app"; user: PiUser; session: number; notice: string | null }
  | { kind: "reauth"; previous: PiUser; returnTo: string; draft: PiDraft | null; ws: string }

const DEFAULT_PATH = "/patterns-integration?page=analysis"
const pathOfHash = (hash: string) => (hash.startsWith(PI_APP) ? hash.slice(1) : null)
const pageNeeds = (page: string): Permission | null => (page === "settings" ? null : page === "customer-edit" || page === "import" ? "edit" : "view")

let sessionSeq = 0

export function PatternsIntegrationApp() {
  const [phase, setPhase] = useState<Phase>(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
    return { kind: "login", returnTo: params.get("page") ? pathOfHash(window.location.hash) : null }
  })
  const pending = useRef<{ returnTo: string | null; draft: PiDraft | null; previous: PiUser | null; ws: string | null }>({ returnTo: null, draft: null, previous: null, ws: null })
  const restoredDraft = useRef<PiDraft | null>(null)
  const { dismiss, toasts } = useToast()
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts

  // 認証の後：現在の権限を取得し、復帰先（resolveReturnTo）と、再認証の後の復元（decideReauthenticationRestore）を決める
  const afterSignIn = useCallback(async (user: PiUser) => {
    const { returnTo, draft, previous, ws: previousWs } = pending.current
    pending.current = { returnTo: null, draft: null, previous: null, ws: null }
    setPhase({ kind: "verifying", user })
    const requested = new URLSearchParams((returnTo ?? DEFAULT_PATH).split("?")[1] ?? "")
    const ws = requested.get("ws") ?? "hq"
    let notice: string | null = null
    const plan = previous ? planReauthentication({ previousUserId: previous.id, userId: user.id, previousWorkspaceId: previousWs, workspaceId: ws, hasUnconfirmedMutation: draft?.unconfirmed ?? false }) : null
    if (plan && plan.kind !== "same-user") {
      // 別の利用者：前の利用者の入力、通知、キャッシュ、Toast、結果を受け取っていない保存の記録を引き継がない
      dropListSnapshot()
      clearInflightSaves(user.id)
      restoredDraft.current = null
      for (const t of toastsRef.current) dismiss(t.id)
    }
    let perms: Permission[] = []
    let fallbackWs = "hq"
    try {
      perms = (await fetchAccess(ws)).permissions
      if (perms.length === 0) {
        const other = piWorkspaces.find((w) => (piControl.config.permissions[user.id]?.[w.id] ?? []).includes("view"))
        fallbackWs = other?.id ?? "hq"
      } else fallbackWs = ws
    } catch {
      perms = []
    }
    const fallback = fallbackWs === "hq" ? DEFAULT_PATH : `${DEFAULT_PATH}&ws=${fallbackWs}`
    // 別の利用者の場合は、前の利用者の復帰先を使わない
    const raw = plan && plan.kind !== "same-user" ? null : returnTo
    const destination = resolveReturnTo(raw, {
      fallback,
      isAllowed: (path) => {
        const p = new URLSearchParams(path.split("?")[1] ?? "")
        if (!path.startsWith("/patterns-integration?") || (p.get("ws") ?? "hq") !== ws) return false
        const need = pageNeeds(p.get("page") ?? "analysis")
        return need === null || perms.includes(need)
      },
    })
    let path = destination.path
    if (plan?.kind === "same-user" && draft) {
      const target = await lookupCustomer(draft.ws, draft.id).catch(() => undefined)
      const keys = Object.keys(draft.values) as (keyof typeof draft.values)[]
      const sent = draft.submitted
      // 結果を確かめていない保存は、送った値（submitted）でサーバーの状態と照合する。期限切れの時点の入力（values）とは分ける
      const pendingMutation = !draft.unconfirmed || !sent
        ? undefined
        : target && keys.every((k) => String(target[k]) === String(sent[k]))
          ? ("applied" as const)
          : target
            ? ("not-applied" as const)
            : ("unknown" as const)
      const decision = decideReauthenticationRestore(plan, {
        sameAccount: true,
        sameWorkspace: draft.ws === ws,
        canView: perms.includes("view"),
        canEdit: perms.includes("edit"),
        target: target === undefined || target === null ? "missing" : target.version === draft.version || pendingMutation === "applied" ? "unchanged" : "changed",
        pendingMutation,
      })
      if (decision.restoreWork && target) {
        // 保存されていた場合は、サーバーの版を基準にする。保存の後に入力した内容（values が送った値と異なる項目）だけを戻す
        const onlySaved = pendingMutation === "applied" && keys.every((k) => String(draft.values[k]) === String(sent?.[k]))
        restoredDraft.current = onlySaved ? null : { ...draft, version: target.version }
        if (pendingMutation === "applied") notice = onlySaved ? "保存されていたことを確かめました" : "保存されていたことを確かめました。その後の入力は、まだ保存していません"
      } else {
        restoredDraft.current = null
        notice =
          pendingMutation === "applied"
            ? "保存されていたことを確かめました"
            : decision.reason === "no-edit-permission"
              ? "編集の権限がないため、ログインし直す前の入力を破棄しました"
              : decision.reason === "target-changed"
                ? "ログインし直す前に、ほかの利用者がこの顧客を変更しました。入力は戻していません"
                : decision.reason === "no-view-permission" || decision.reason === "target-missing"
                  ? "ログインし直す前の画面を開けないため、入力を破棄しました"
                  : null
        if (!decision.showTarget) path = fallback
        else if (!decision.allowEdit) path = `/patterns-integration?page=customer&id=${draft.id}${draft.ws === "hq" ? "" : `&ws=${draft.ws}`}`
      }
    }
    window.history.replaceState({ fdPiIdx: 0 }, "", `#${path}`)
    if (needsSetup(user.id)) setPhase({ kind: "setup", user, path })
    else setPhase({ kind: "app", user, session: ++sessionSeq, notice })
  }, [dismiss])

  const onExpired = useCallback((user: PiUser, draft: PiDraft | null) => {
    const returnTo = pathOfHash(window.location.hash) ?? DEFAULT_PATH
    const ws = new URLSearchParams(returnTo.split("?")[1] ?? "").get("ws") ?? "hq"
    setPhase({ kind: "reauth", previous: user, returnTo, draft, ws })
  }, [])

  if (phase.kind === "login")
    return (
      <LoginScreen
        onSignedIn={(user) => {
          pending.current = { returnTo: phase.returnTo, draft: null, previous: null, ws: null }
          void afterSignIn(user)
        }}
      />
    )
  if (phase.kind === "reauth")
    return (
      <ReauthGate
        phase={phase}
        onSignedIn={(user) => {
          pending.current = { returnTo: phase.returnTo, draft: phase.draft, previous: phase.previous, ws: phase.ws }
          void afterSignIn(user)
        }}
      />
    )
  if (phase.kind === "verifying") return <VerifyingScreen />
  if (phase.kind === "setup")
    return (
      <SetupScreen
        user={phase.user}
        onDone={() => {
          window.history.replaceState({ fdPiIdx: 0 }, "", `#${phase.path}`)
          setPhase({ kind: "app", user: phase.user, session: ++sessionSeq, notice: null })
        }}
      />
    )
  return (
    <UnsavedChangesProvider key={phase.session}>
      <SignedInApp
        user={phase.user}
        notice={phase.notice}
        peekDraft={(ws, id) => {
          const d = restoredDraft.current
          return d && d.ws === ws && d.id === id && d.userId === phase.user.id ? d : null
        }}
        consumeDraft={(d) => {
          if (restoredDraft.current === d) restoredDraft.current = null
        }}
        onExpired={onExpired}
        onSignedOut={() => {
          logout()
          dropListSnapshot()
          clearInflightSaves()
          for (const t of toastsRef.current) dismiss(t.id)
          setPhase({ kind: "login", returnTo: null })
        }}
      />
    </UnsavedChangesProvider>
  )
}

function ReauthGate({ phase, onSignedIn }: { phase: Extract<Phase, { kind: "reauth" }>; onSignedIn: (user: PiUser) => void }) {
  const [other, setOther] = useState(false)
  return (
    <LoginScreen
      key={other ? "other" : "same"}
      lockedEmail={other ? undefined : phase.previous.email}
      title={other ? "別のアカウントでログイン" : "もう一度ログインしてください"}
      description={other ? "前のアカウントの入力と表示していた内容は引き継ぎません。" : "ログインの有効期限が切れました。ログインすると、権限を確かめてから作業していた画面に戻ります。"}
      onOtherAccount={other ? undefined : () => setOther(true)}
      onSignedIn={onSignedIn}
    />
  )
}

// ---------------------------------------------------------------- ログイン後
const navGroups: NavGroup[] = [
  {
    items: [
      { id: "analysis", label: "分析", icon: BarChart3, href: piHref("analysis") },
      { id: "customers", label: "顧客", icon: Building2, href: piHref("customers") },
    ],
  },
]
const settingsItem: NavLinkItem = { id: "settings", label: "通知の設定", icon: Settings, href: piHref("settings") }
const navIdOf: Record<string, string> = { customer: "customers", "customer-edit": "customers", import: "customers", metric: "analysis" }

function withWs(groups: NavGroup[], ws: string): NavGroup[] {
  const extra = ws === "hq" ? undefined : { ws }
  return groups.map((g) => ({ ...g, items: g.items.map((it) => ({ ...it, href: piHref(it.id, extra) }) as NavLinkItem) }))
}

function PiSidebar({ ws, currentId, user, onNavigate, onSignOut }: { ws: string; currentId: string; user: PiUser; onNavigate: (id: string) => void; onSignOut: () => void }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const go = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    onNavigate(id)
  }
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center group-data-[collapsible=icon]/sidebar:flex-col">
        <span className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-2 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0">
          <ProductMark />
          <span className="truncate text-ui font-semibold group-data-[collapsible=icon]/sidebar:sr-only">Flow 営業管理</span>
        </span>
        {!isMobile && <SidebarTrigger />}
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav groups={withWs(navGroups, ws)} currentId={currentId} onNavigate={go} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarNavItem item={{ ...settingsItem, href: piHref("settings", ws === "hq" ? undefined : { ws }) }} currentId={currentId} onNavigate={go} />
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                if (isMobile) setOpenMobile(false)
                onSignOut()
              }}
              data-testid="sign-out"
            >
              <LogOut />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">ログアウト</span>
                <span className="truncate text-caption text-muted-foreground">{user.name}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function SignedInApp({
  user,
  notice,
  peekDraft,
  consumeDraft,
  onExpired,
  onSignedOut,
}: {
  user: PiUser
  notice: string | null
  peekDraft: (ws: string, id: string) => PiDraft | null
  consumeDraft: (draft: PiDraft) => void
  onExpired: (user: PiUser, draft: PiDraft | null) => void
  onSignedOut: () => void
}) {
  const { route, nav } = usePiRouter()
  const guard = useNavigationGuard()
  const { dismiss, toasts } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [centerOpen, setCenterOpen] = useState(false)
  // 所属するワークスペース（権限の有無とは別。権限をすべて失っても、所属は変わらない）
  const memberOf = piWorkspaces.filter((w) => w.id in (piControl.config.permissions[user.id] ?? {}))
  const requestedWs = route.params.get("ws") ?? "hq"
  const ws = memberOf.some((w) => w.id === requestedWs) ? requestedWs : (memberOf[0]?.id ?? "hq")

  // ---------------------------------------------------------------- 権限
  const [revision, setRevision] = useState(0)
  const accessScope = `${user.id}:${ws}`
  const access = useAccess<Permission, never, PiGrants>({
    scopeKey: accessScope,
    revision,
    fetcher: async ({ scopeKey, signal }) => ({ scope: scopeKey, permissions: (await fetchAccess(ws, signal)).permissions, features: [] }),
  })
  const { reload: reloadAccess } = access
  useEffect(
    () =>
      subscribePi((e) => {
        if (e.type === "permissions-changed" && e.userId === user.id && e.ws === ws) {
          // 権限の変更の知らせ：同じ処理の中で再確認の状態にする（確認が終わるまで、保護された内容を描画しない）
          setRevision((r) => r + 1)
          reloadAccess()
        }
      }),
    [user.id, ws, reloadAccess]
  )
  const grants = access.grants
  // 画面と操作のスコープは、利用者とワークスペース。権限の再確認や関係のない権限の変更では変えない（入力や実行中の操作を作り直さない）。
  // 取得したデータのスコープには、閲覧の権限の有無を加える（閲覧の権限を失ったら破棄する）
  const scope = `${user.id}:${ws}`
  const canView = grants?.permissions.includes("view") ?? false
  const dataScope = `${scope}:${canView ? "view" : "none"}`
  const viewAccess = contentAccessOf(access)

  // ---------------------------------------------------------------- 接続と障害
  const connectivity = useConnectivity({ probe: ({ signal }) => probe(signal) })
  const [services, setServices] = useState(() => ({ ...piControl.config.services }))
  useEffect(() => subscribePi((e) => e.type === "services-changed" && setServices({ ...piControl.config.services })), [])
  const health = useCallback((c: "analysis" | "export" | "notifications" | "customers") => (c === "customers" ? "operational" : services[c]), [services])
  const connRef = useRef(connectivity.status)
  useEffect(() => {
    connRef.current = connectivity.status
  })
  const outageSeq = connectivity.lastOutage?.seq ?? 0

  // ---------------------------------------------------------------- セッションの期限切れ
  const draftSource = useRef<null | (() => PiDraft | null)>(null)
  const { releaseAll, cancelNavigation } = guard
  useEffect(
    () =>
      subscribePi((e) => {
        if (e.type !== "session-expired") return
        const draft = draftSource.current?.() ?? null
        // 認可の失効：破棄の確認と beforeunload を止めてから画面を外す（確認で失効を遅らせない）
        releaseAll()
        for (const t of toasts) dismiss(t.id)
        onExpired(user, draft)
      }),
    [releaseAll, onExpired, user, toasts, dismiss]
  )
  // スコープ（ワークスペース）が変わったら、前のスコープの移動の確認を取り消し、通知（Toast）を閉じる
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts
  const firstWs = useRef(true)
  useEffect(() => {
    cancelNavigation()
    if (firstWs.current) {
      firstWs.current = false
      return
    }
    for (const t of toastsRef.current) dismiss(t.id)
  }, [ws, cancelNavigation, dismiss])

  const feed = usePiFeed({ userId: user.id, ws, scope: dataScope, holdIncoming: centerOpen, enabled: grants !== null && services.notifications !== "outage" })

  const ctx = useMemo<PiContextValue>(() => {
    const permitOf = makePermit(access, connectivity.status, "operational")
    return {
      user,
      ws,
      scope,
      dataScope,
      nav,
      access,
      viewAccess,
      connectivity: connectivity.status,
      health,
      permit: (p, component) => (component ? makePermit(access, connectivity.status, health(component))(p) : permitOf(p)),
      viewAllowedLatest: () => contentAccessOf(access.latest()) === "allowed",
      permitLatest: (p) =>
        decideAccess(access.latest(), { permissions: [p] }).allowed && (p === "view" || getMutationAvailability({ connectivity: connRef.current }).allowed),
      draftSource,
      peekRestoredDraft: peekDraft,
      consumeRestoredDraft: consumeDraft,
      reportReachable: connectivity.reportReachable,
      reportFailure: connectivity.reportFailure,
      outageSeq,
    }
  }, [user, ws, scope, dataScope, nav, access, viewAccess, connectivity.status, connectivity.reportReachable, connectivity.reportFailure, health, peekDraft, consumeDraft, outageSeq])

  // ---------------------------------------------------------------- システムの状態の表示
  const issues: SystemIssue[] = []
  if (connectivity.status === "offline")
    issues.push({ id: "offline", condition: "offline", scope: "product", title: "オフラインです", impact: "保存、停止、エクスポートなどの変更はできません。表示中の内容は、接続が切れる前に取得したものです。", immediate: true })
  if (services.analysis === "outage")
    issues.push({ id: "analysis", condition: "partial-outage", scope: "pages", title: "分析を表示できません", impact: "顧客の一覧、詳細、編集は利用できます。" })
  const { banner } = summarizeIssues(issues)
  const stable = useStableIssues(banner, { scopeKey: dataScope, immediate: (i) => i.condition === "offline" })

  // ---------------------------------------------------------------- 画面
  const restoreList = useMemo(() => route.page === "customers" && hasListSnapshot(scope, route.params), [route])
  const restoreAnalysis = route.page === "analysis" && route.params.get("back") === "1"
  const restore = restoreList || restoreAnalysis
  const need = pageNeeds(route.page)
  const pageAllowed = need === null || grants === null || grants.permissions.includes(need)
  let body: React.ReactNode
  if (grants === null)
    body = (
      <p role="status" className="px-4 py-6 text-ui text-muted-foreground md:px-6" data-testid="access-loading">
        権限を確認しています
      </p>
    )
  else if (!pageAllowed) body = <div className="px-4 py-6 md:px-6"><AccessState kind="forbidden" /></div>
  else
    switch (route.page) {
      case "customers":
        body = <CustomersScreen key={scope} restore={restoreList} />
        break
      case "customer":
        body = <CustomerDetailScreen key={`${scope}:${route.id}`} id={route.id ?? ""} params={route.params} />
        break
      case "customer-edit":
        body = <CustomerEditScreen key={`${scope}:${route.id}`} id={route.id ?? ""} params={route.params} />
        break
      case "metric":
        body = <MetricDetailsScreen key={`${scope}:${route.params.toString()}`} params={route.params} />
        break
      case "import":
        body = <ImportScreen key={scope} />
        break
      case "settings":
        body = <SettingsScreen />
        break
      default:
        body = <AnalysisScreen key={`${scope}:${route.params.get("back") ?? ""}:${route.params.get("region") ?? ""}:${route.params.get("plan") ?? ""}`} params={route.params} />
    }

  const wsItems = memberOf.map((w) => ({ value: w.id, label: w.name }))
  const switchWs = (next: string) => {
    if (next === ws) return
    const page = route.page === "customer" || route.page === "customer-edit" || route.page === "metric" ? (route.page === "metric" ? "analysis" : "customers") : route.page
    nav.navigate(piHref(page, next === "hq" ? undefined : { ws: next }))
  }

  return (
    <PiProvider value={ctx}>
      <AppShell sidebarOpen={sidebarOpen} onSidebarOpenChange={setSidebarOpen} data-testid="pi-app" data-ws={ws} data-user={user.id}>
        <PiSidebar
          ws={ws}
          currentId={navIdOf[route.page] ?? route.page}
          user={user}
          onNavigate={(id) => nav.navigate(piHref(id, ws === "hq" ? undefined : { ws }))}
          onSignOut={() => onSignOutGuarded(guard, onSignedOut)}
        />
        <AppShellBody>
          <AppShellHeader className="gap-3">
            <span className="flex min-w-0 items-center gap-2 md:hidden">
              <SidebarTrigger className="-ml-2" />
              <span className="sr-only">Flow 営業管理</span>
            </span>
            <Select items={wsItems} value={ws} onValueChange={(v) => switchWs(String(v))}>
              <SelectTrigger aria-label="ワークスペース" className="ml-auto w-auto min-w-0 max-w-48 sm:min-w-40" data-testid="workspace-switcher">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {wsItems.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <NotificationsSheet feed={feed} open={centerOpen} onOpenChange={setCenterOpen} />
          </AppShellHeader>
          {stable.issues.length > 0 && <SystemBanner issues={stable.issues} settlingIds={stable.settlingIds} data-testid="pi-banner" />}
          <AppShellMain
            pageKey={`${route.page}:${route.id ?? ""}:${ws}`}
            scrollOnNavigate={restore ? false : "top"}
            focusOnNavigate={restore ? false : "heading"}
            data-testid="pi-main"
          >
            {notice && (
              <p role="status" className="mx-4 mt-4 text-ui md:mx-6" data-testid="reauth-notice">
                {notice}
              </p>
            )}
            {body}
            <HeadingWhenReady ready={grants !== null} pageKey={`${route.page}:${route.id ?? ""}:${ws}`} />
            <VerifyPanel user={user} ws={ws} />
          </AppShellMain>
        </AppShellBody>
      </AppShell>
    </PiProvider>
  )
}

/**
 * 権限の取得を待つ間に移動した場合、AppShellMain は見出し（h1）がないため main にフォーカスする。
 * 画面の内容（h1）を表示した後に、見出しへフォーカスを移す（focusHeading。利用者がほかへ移した場合は移さない）
 */
function HeadingWhenReady({ ready, pageKey }: { ready: boolean; pageKey: string }) {
  const { focusHeading } = useAppShell()
  useEffect(() => {
    if (ready) focusHeading()
  }, [ready, pageKey, focusHeading])
  return null
}

/** ログアウト（利用者の操作）。未保存の変更がある場合だけ、通常の移動と同じく確かめる */
function onSignOutGuarded(guard: ReturnType<typeof useNavigationGuard>, signOut: () => void) {
  guard.confirmNavigation(() => {
    guard.releaseAll()
    signOut()
  })
}

