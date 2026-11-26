import { useCallback, useEffect, useMemo, useState } from "react"
import { BarChart3 } from "lucide-react"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain } from "@/patterns/app-shell"
import type { NavGroup, NavItem } from "@/patterns/sidebar-nav"

import { structureLabels, structureNav, structureSettingsItem, structureUser } from "../../data/app-structure"
import { PlaceholderScreen } from "../app-structure/structure-screens"
import { ProductMark, StructureSidebar } from "../app-structure/structure-sidebar"
import { AccountDetailPage } from "./account-detail"
import { analysisServer } from "../../data/data-analysis/analysis-server"
import { AnalysisControls } from "./analysis-controls-panel"
import { SessionProvider, defaultSession, type AnalysisSession } from "./analysis-session"
import { appHref, readRoute } from "./analysis-route"
import { BusinessDashboard } from "./business-dashboard"
import { OperationsDashboard } from "./operations-dashboard"
import { RetentionAccountsPage, RetentionDashboard, isRestoring } from "./retention-dashboard"
import { WorkScreen } from "./work-screen"

// Data Analysis の 5 種類を組み合わせた検証用の画面。正式な Pages の実装ではない。
// App Structure の検証画面と同じ Sidebar と App Shell を使い、レポートの下に 3 つのダッシュボードを置く。
//   business：Strategic Dashboard（事業の状況）
//   retention：Analytical Dashboard（顧客維持の分析）→ retention-accounts（企業の一覧）→ account（企業の詳細）
//   operations：Operational Dashboard（決済と請求の処理の監視）
// すべての数値は preview/src/data/data-analysis/ の架空の記録から集計する。

const reportChildren = [
  { id: "business", label: "事業の状況" },
  { id: "retention", label: "顧客維持の分析" },
  { id: "operations", label: "処理の監視" },
]

function navFor(groups: NavGroup[]): NavGroup[] {
  return groups.map((g) => ({
    ...g,
    items: g.items.map((it) => {
      if (it.id === "reports") {
        const [first, ...rest] = reportChildren.map((c) => ({ ...c, href: appHref(c.id) }))
        const reports: NavItem = { id: "reports", label: "レポート", icon: BarChart3, children: [first, ...rest] }
        return reports
      }
      return {
        ...it,
        ...(it.href !== undefined && { href: appHref(it.id) }),
        ...(it.children && { children: it.children.map((c) => ({ ...c, href: appHref(c.id) })) }),
      } as NavItem
    }),
  }))
}

const currentNavId = (page: string) => (page === "retention-accounts" || page === "account" ? "retention" : page)

export function AnalysisApp() {
  const [route, setRoute] = useState(readRoute)
  const [open, setOpen] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  // 製品側の状態（ワークスペース、権限、タイムゾーン、明細の件数の公開）。変わっても画面を作り直さず、
  // 各領域の useBrowseData の scopeKey と取得の条件のキーで、前のデータを破棄・取得し直す。
  const [session, setSessionState] = useState<AnalysisSession>(defaultSession)
  const sessionValue = useMemo(
    () => ({
      session,
      setSession: (patch: Partial<AnalysisSession>) =>
        setSessionState((s) => {
          const next = { ...s, ...patch }
          analysisServer.role = next.role
          analysisServer.hiddenCountPolicy = next.hiddenCountPolicy
          analysisServer.timeZone = next.timeZone
          return next
        }),
    }),
    [session]
  )

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigateTo = useCallback((page: string) => {
    window.location.hash = appHref(page)
  }, [])

  const labels = structureLabels(false)
  // 詳細から戻り、記録がある場合は、AppShellMain の「先頭へ戻す」「h1 へフォーカス」を止め、画面が復元する。
  const restoring = isRestoring(route)

  let body
  // URL の条件が変わる移動（Sidebar、ほかの画面からのリンク、履歴）では、画面を作り直して URL の条件を読み直す。
  // 画面の中の条件の変更は history.replaceState で URL に反映するため、hashchange は起きず、作り直さない。
  const routeKey = `${reloadToken}:${route.params.toString()}`
  if (route.page === "business") body = <BusinessDashboard key={routeKey} route={route} />
  else if (route.page === "retention") body = <RetentionDashboard key={routeKey} route={route} />
  else if (route.page === "retention-accounts") body = <RetentionAccountsPage key={`${reloadToken}:${route.params.toString()}`} route={route} />
  else if (route.page === "account") body = <AccountDetailPage key={route.params.get("id")} route={route} />
  else if (route.page === "operations") body = <OperationsDashboard key={reloadToken} />
  else if (route.page === "work") body = <WorkScreen route={route} />
  else body = <PlaceholderScreen title={labels[route.page] ?? "ページ"} />

  return (
    <SessionProvider value={sessionValue}>
    <AppShell sidebarOpen={open} onSidebarOpenChange={setOpen}>
      <StructureSidebar
        groups={navFor(structureNav(false))}
        settingsItem={{ ...structureSettingsItem(false), href: appHref("settings") }}
        currentId={currentNavId(route.page)}
        homeHref={appHref("home")}
        onNavigate={(id, e) => {
          e.preventDefault()
          navigateTo(id)
        }}
        user={structureUser}
        onSignOut={() => navigateTo("business")}
      />
      <AppShellBody>
        <AppShellHeader className="md:hidden">
          <SidebarTrigger className="-ml-2" />
          <span className="flex min-w-0 items-center gap-3 text-ui font-semibold">
            <ProductMark />
            <span className="truncate">Flow 営業管理</span>
          </span>
        </AppShellHeader>
        <AppShellMain
          pageKey={`${route.page}:${route.params.get("id") ?? ""}:${route.params.get("plan") ?? ""}:${route.params.get("term") ?? ""}`}
          scrollOnNavigate={restoring ? false : "top"}
          focusOnNavigate={restoring ? false : "heading"}
          data-testid="analysis-main"
        >
          {body}
          <AnalysisControls page={route.page} onReload={() => setReloadToken((n) => n + 1)} />
        </AppShellMain>
      </AppShellBody>
    </AppShell>
    </SessionProvider>
  )
}
