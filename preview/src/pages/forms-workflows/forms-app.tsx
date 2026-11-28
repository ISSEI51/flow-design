import { useEffect, useMemo, useState } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain } from "@/patterns/app-shell"
import type { NavGroup, NavItem } from "@/patterns/sidebar-nav"
import { PageHeader, PageHeaderContent, PageHeaderTitle } from "@/patterns/page-header"
import { PageLayout } from "@/patterns/page-layout"
import { UnsavedChangesProvider, useNavigationGuard } from "@/patterns/unsaved-changes"

import { structureLabels, structureNav, structureSettingsItem, structureUser } from "../../data/app-structure"
import { formsServer, workspaces, type ActionMode, type CheckMode, type ImportMode, type SaveMode } from "../../data/forms-workflows/server"
import { PlaceholderScreen } from "../app-structure/structure-screens"
import { ProductMark, StructureSidebar } from "../app-structure/structure-sidebar"
import { DemoControls, Radio } from "../data-browsing/doc-parts"
import { CustomersScreen, hasListSnapshot } from "./forms-customers"
import { formsHref, useFormsRouter } from "./forms-router"
import {
  ArchivedScreen,
  ContractNewScreen,
  ContractsScreen,
  CustomerDetailScreen,
  CustomerEditScreen,
  CustomerNewScreen,
  ImportScreen,
  SettingsScreen,
  type Nav,
} from "./forms-screens"

// Forms & Workflows の 6 種類を組み合わせた、営業管理の検証用の画面。正式な Pages の実装ではない。
// App Structure の検証画面と同じ Sidebar と App Shell を使い、顧客の一覧（Data Browsing の Registry）、登録・編集、設定、
// 契約の登録、CSV の取り込みを作る。App Structure と Data Browsing の検証画面は変更しない（別の画面として作った）。
//
// 製品（この画面）の責務として行うこと
// - ルーティングと、移動の前の未保存の変更の確認の接続（forms-router.ts）。
// - ワークスペース（スコープ）の切り替え。上部の Select は移動と同じく確認を通す。
//   「検証用の操作」の確認なしの切り替えは、別のタブでの切り替えやセッションの切り替えを再現する（スコープの境界の検品のため）。
//   スコープが変わったら、表示中の移動の確認を取り消す（cancelNavigation。古いワークスペースの移動先へ移動しない）。
// - ログアウト。Sidebar の「ログアウト」（利用者の操作）は、通常の移動と同じく未保存の変更を確かめる。
//   認可の失効（401、セッションの期限切れ、別のアカウントへの切り替え）は、確かめずに移動する（releaseAll。破棄の確認で失効を遅らせない）。
// - 保存、検証、取り込みの API（模擬のサーバー。window.__fdFormsServer で遅延と結果を切り替える）。

function navFor(groups: NavGroup[], ws: string): NavGroup[] {
  const extra = ws === "hq" ? undefined : { ws }
  return groups.map((g) => ({
    ...g,
    items: g.items.map(
      (it) =>
        ({
          ...it,
          ...(it.href !== undefined && { href: formsHref(it.id, extra) }),
          ...(it.children && { children: it.children.map((c) => ({ ...c, href: formsHref(c.id, extra) })) }),
        }) as NavItem
    ),
  }))
}

const navIdFor: Record<string, string> = {
  "customer-new": "customers",
  customer: "customers",
  "customer-edit": "customers",
  archived: "customers",
  import: "customers",
  "contract-new": "contracts",
}

// 別のレコードの画面は、別のワークスペースには存在しない。ワークスペースを切り替えたら、その種類の一覧に移る
const pageAfterSwitch: Record<string, string> = { customer: "customers", "customer-edit": "customers", archived: "archived" }

function SignedOutScreen() {
  return (
    <PageLayout width="focused" data-testid="forms-signed-out">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>もう一度ログインしてください</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <p className="text-ui text-muted-foreground">
        ログインの有効期限が切れたため、ログアウトしました。保存していない入力は、この画面に残していません。検証画面では、Sidebar から操作を続けられます。
      </p>
    </PageLayout>
  )
}

function VerifyControls({ onExternalSwitch, onSessionExpired, ws }: { onExternalSwitch: (ws: string) => void; onSessionExpired: () => void; ws: string }) {
  const [, setN] = useState(0)
  const set = (fn: () => void) => {
    fn()
    setN((n) => n + 1)
  }
  type Key = "saveMode" | "actionMode" | "undoMode" | "importMode" | "checkMode" | "instantMode" | "autosaveMode" | "listMode"
  const radios = <T extends string>(legend: string, key: Key, options: [T, string][]) => (
    <DemoControls legend={legend}>
      {options.map(([v, l]) => (
        <Radio key={v} name={`fv-${key}`} checked={formsServer[key] === v} onChange={() => set(() => ((formsServer as Record<string, unknown>)[key] = v))}>
          {l}
        </Radio>
      ))}
    </DemoControls>
  )
  const action: [ActionMode, string][] = [
    ["success", "成功"],
    ["fail", "失敗"],
    ["unknown", "結果が不明"],
  ]
  return (
    <details className="mx-4 mb-8 rounded-xl border border-border p-4 text-ui md:mx-6" data-testid="forms-verify">
      <summary className="min-h-10 cursor-pointer content-center font-medium">検証用の操作（模擬のサーバー）</summary>
      <div className="mt-4 flex flex-col gap-4">
        {radios<SaveMode>("保存の結果", "saveMode", [
          ["success", "成功"],
          ["fail", "失敗"],
          ["invalid", "サーバー側の検証のエラー"],
          ["unknown", "結果が不明"],
          ["throw", "予期しない例外"],
        ])}
        {radios<CheckMode>("非同期の検証（顧客コードの重複）", "checkMode", [
          ["success", "成功"],
          ["fail", "通信の失敗"],
          ["timeout", "応答しない"],
          ["ignore-abort", "中止を無視して遅れて応答"],
        ])}
        {radios<ActionMode>("アーカイブと削除の結果", "actionMode", action)}
        {radios<ActionMode>("元に戻すの結果", "undoMode", action)}
        {radios<ActionMode>("即時保存の結果", "instantMode", action)}
        {radios<ActionMode>("自動保存の結果", "autosaveMode", action)}
        {radios<"success" | "fail">("一覧の取得", "listMode", [
          ["success", "成功"],
          ["fail", "失敗（再取得すると、変更の操作ができなくなる）"],
        ])}
        {radios<ImportMode>("取り込みの結果", "importMode", [
          ["success", "すべて成功"],
          ["partial", "一部失敗"],
          ["fail", "すべて失敗"],
          ["unknown", "途中で通信が切れる"],
          ["throw", "途中で通信の例外になる（応答がない）"],
          ["inconsistent", "結果に矛盾がある"],
        ])}
        <div className="flex flex-wrap gap-x-6">
          <label className="flex min-h-10 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(window.__fdFormsChangeWhileConfirm)}
              onChange={(e) => set(() => (window.__fdFormsChangeWhileConfirm = e.target.checked))}
              className="size-4 accent-[var(--primary)]"
            />
            削除の確認の表示中に、選んだ行の 1 件を選択から外す（2 件以上を選んだとき）
          </label>
        </div>
        <DemoControls legend="確認なしでワークスペースを切り替える（別のタブでの切り替えを再現）">
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={w.id === ws}
              onClick={() => onExternalSwitch(w.id)}
              className="min-h-10 rounded-md px-3 underline underline-offset-4 disabled:opacity-50"
              data-testid={`external-ws-${w.id}`}
            >
              {w.name}
            </button>
          ))}
        </DemoControls>
        <DemoControls legend="認可の失効（サーバーが 401 を返した、別のアカウントでログインした）">
          <button type="button" onClick={onSessionExpired} className="min-h-10 rounded-md px-3 underline underline-offset-4" data-testid="session-expired">
            未保存の変更を確かめずに、ログアウトの画面へ移る
          </button>
        </DemoControls>
      </div>
    </details>
  )
}

function FormsAppInner() {
  const { route, navigate, linkProps, isPending, replaceSilently } = useFormsRouter()
  const guard = useNavigationGuard()
  const [open, setOpen] = useState(true)
  const nav: Nav = useMemo(() => ({ navigate, linkProps, pending: isPending }), [navigate, linkProps, isPending])
  const labels = structureLabels(false)
  const ws = route.params.get("ws") ?? "hq"
  // 一覧から移った画面から戻った（保存、キャンセル、ブラウザの戻る）：一覧が条件、位置、フォーカスを復元する
  // 移動のたび（route が変わるとき）に 1 回だけ判定する。一覧が記録を使った後の描画でも、同じ値を保つ
  const restore = useMemo(() => route.page === "customers" && hasListSnapshot(ws, route.params), [route])
  const wsExtra = ws === "hq" ? undefined : { ws }
  // スコープ（ワークスペース）が変わったら、前のスコープで受けた移動の確認を取り消す。
  // 残すと、確認の「変更を破棄」で前のワークスペースの URL へ移動する
  const { cancelNavigation, releaseAll } = guard
  useEffect(() => cancelNavigation(), [ws, cancelNavigation])
  // 認可の失効：確認と beforeunload を止めてから移動する。保護された入力を残すことより、失効を優先する
  const expireSession = () => {
    releaseAll()
    navigate(formsHref("signed-out"))
  }

  const switchHref = (next: string) => {
    const page = pageAfterSwitch[route.page] ?? route.page
    return formsHref(page, next === "hq" ? undefined : { ws: next })
  }

  let body
  switch (route.page) {
    case "customers":
      body = <CustomersScreen key={ws} nav={nav} ws={ws} restore={restore} />
      break
    case "customer-new":
      body = <CustomerNewScreen nav={nav} ws={ws} />
      break
    case "customer":
      body = <CustomerDetailScreen key={`${ws}:${route.id}`} nav={nav} id={route.id ?? ""} ws={ws} />
      break
    case "customer-edit":
      body = <CustomerEditScreen key={`${ws}:${route.id}`} nav={nav} id={route.id ?? ""} from={route.params.get("from")} ws={ws} />
      break
    case "archived":
      body = <ArchivedScreen nav={nav} ws={ws} />
      break
    case "settings":
      body = <SettingsScreen ws={ws} />
      break
    case "contracts":
      body = <ContractsScreen nav={nav} ws={ws} />
      break
    case "contract-new":
      body = <ContractNewScreen nav={nav} ws={ws} />
      break
    case "import":
      body = <ImportScreen nav={nav} ws={ws} />
      break
    case "signed-out":
      body = <SignedOutScreen />
      break
    default:
      body = <PlaceholderScreen title={labels[route.page] ?? "ページ"} />
  }

  const wsItems = workspaces.map((w) => ({ value: w.id, label: w.name }))
  return (
    <AppShell sidebarOpen={open} onSidebarOpenChange={setOpen}>
      <StructureSidebar
        groups={navFor(structureNav(false), ws)}
        settingsItem={{ ...structureSettingsItem(false), href: formsHref("settings", wsExtra) }}
        currentId={navIdFor[route.page] ?? route.page}
        homeHref={formsHref("home", wsExtra)}
        onNavigate={(id, e) => {
          e.preventDefault()
          navigate(formsHref(id, wsExtra))
        }}
        user={structureUser}
        onSignOut={() => navigate(formsHref("customers"))}
      />
      <AppShellBody>
        <AppShellHeader className="justify-between">
          <span className="flex min-w-0 items-center gap-2 md:hidden">
            <SidebarTrigger className="-ml-2" />
            <ProductMark />
            <span className="truncate text-ui font-semibold">Flow 営業管理</span>
          </span>
          {/* ワークスペースの切り替えは、画面の移動と同じく、未保存の変更を確かめてから行う */}
          <Select items={wsItems} value={ws} onValueChange={(v) => v !== ws && navigate(switchHref(String(v)))}>
            <SelectTrigger aria-label="ワークスペース" className="ml-auto w-auto min-w-40" data-testid="workspace-switcher">
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
        </AppShellHeader>
        <AppShellMain
          pageKey={`${route.page}:${route.id ?? ""}:${ws}`}
          // 一覧に戻って復元する場合は、先頭へのスクロールと h1 へのフォーカスを止める（一覧が位置とフォーカスを戻す）
          scrollOnNavigate={restore ? false : "top"}
          focusOnNavigate={restore ? false : "heading"}
          data-testid="forms-main"
          data-ws={ws}
        >
          {body}
          <VerifyControls ws={ws} onExternalSwitch={(next) => replaceSilently(switchHref(next))} onSessionExpired={expireSession} />
        </AppShellMain>
      </AppShellBody>
    </AppShell>
  )
}

export function FormsApp() {
  return (
    <UnsavedChangesProvider>
      <FormsAppInner />
    </UnsavedChangesProvider>
  )
}
