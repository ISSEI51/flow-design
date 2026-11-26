import { useState } from "react"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain } from "@/patterns/app-shell"
import type { NavGroup, NavItem } from "@/patterns/sidebar-nav"
import { UnsavedChangesProvider } from "@/patterns/unsaved-changes"

import { structureLabels, structureNav, structureSettingsItem, structureUser } from "../../data/app-structure"
import { formsServer, type ActionMode, type ImportMode, type SaveMode } from "../../data/forms-workflows/server"
import { PlaceholderScreen } from "../app-structure/structure-screens"
import { ProductMark, StructureSidebar } from "../app-structure/structure-sidebar"
import { DemoControls, Radio } from "../data-browsing/doc-parts"
import { formsHref, useFormsRouter } from "./forms-router"
import {
  ArchivedScreen,
  ContractNewScreen,
  ContractsScreen,
  CustomerDetailScreen,
  CustomerEditScreen,
  CustomerNewScreen,
  CustomersScreen,
  ImportScreen,
  SettingsScreen,
  type Nav,
} from "./forms-screens"

// Forms & Workflows の 6 種類を組み合わせた、営業管理の検証用の画面。正式な Pages の実装ではない。
// App Structure の検証画面と同じ Sidebar と App Shell を使い、顧客の登録・編集、設定、契約の登録、CSV の取り込みを作る。
// App Structure と Data Browsing の検証画面は変更しない（別の画面として作った）。
//
// 製品（この画面）の責務として行うこと
// - ルーティングと、移動の前の未保存の変更の確認の接続（forms-router.ts）。
// - 保存、検証、取り込みの API（模擬のサーバー。window.__fdFormsServer で遅延と結果を切り替える）。

function navFor(groups: NavGroup[]): NavGroup[] {
  return groups.map((g) => ({
    ...g,
    items: g.items.map(
      (it) =>
        ({
          ...it,
          ...(it.href !== undefined && { href: formsHref(it.id) }),
          ...(it.children && { children: it.children.map((c) => ({ ...c, href: formsHref(c.id) })) }),
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

function VerifyControls() {
  const [, setN] = useState(0)
  const set = (fn: () => void) => {
    fn()
    setN((n) => n + 1)
  }
  const radios = <T extends string>(legend: string, name: string, key: "saveMode" | "actionMode" | "undoMode" | "importMode", options: [T, string][]) => (
    <DemoControls legend={legend}>
      {options.map(([v, l]) => (
        <Radio key={v} name={name} checked={formsServer[key] === v} onChange={() => set(() => ((formsServer as Record<string, unknown>)[key] = v))}>
          {l}
        </Radio>
      ))}
    </DemoControls>
  )
  return (
    <details className="mx-4 mb-8 rounded-xl border border-border p-4 text-ui md:mx-6" data-testid="forms-verify">
      <summary className="min-h-10 cursor-pointer content-center font-medium">検証用の操作（模擬のサーバー）</summary>
      <div className="mt-4 flex flex-col gap-4">
        {radios<SaveMode>("保存の結果", "fv-save", "saveMode", [
          ["success", "成功"],
          ["fail", "失敗"],
          ["invalid", "サーバー側の検証のエラー"],
          ["unknown", "結果が不明"],
        ])}
        {radios<ActionMode>("アーカイブと削除の結果", "fv-action", "actionMode", [
          ["success", "成功"],
          ["fail", "失敗"],
        ])}
        {radios<ActionMode>("元に戻すの結果", "fv-undo", "undoMode", [
          ["success", "成功"],
          ["fail", "失敗"],
        ])}
        {radios<ImportMode>("取り込みの結果", "fv-import", "importMode", [
          ["success", "すべて成功"],
          ["partial", "一部失敗"],
          ["fail", "すべて失敗"],
          ["unknown", "途中で通信が切れる"],
        ])}
        <div className="flex flex-wrap gap-x-6">
          <label className="flex min-h-10 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={formsServer.instantFails} onChange={(e) => set(() => (formsServer.instantFails = e.target.checked))} className="size-4 accent-[var(--primary)]" />
            即時保存を失敗させる
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={formsServer.autosaveFails} onChange={(e) => set(() => (formsServer.autosaveFails = e.target.checked))} className="size-4 accent-[var(--primary)]" />
            自動保存を失敗させる
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(window.__fdFormsChangeWhileConfirm)}
              onChange={(e) => set(() => (window.__fdFormsChangeWhileConfirm = e.target.checked))}
              className="size-4 accent-[var(--primary)]"
            />
            削除の確認の表示中に、ほかの利用者が対象の 1 件をアーカイブする（2 件以上を選んだとき）
          </label>
        </div>
      </div>
    </details>
  )
}

function FormsAppInner() {
  const { route, navigate, linkProps, isPending } = useFormsRouter()
  const [open, setOpen] = useState(true)
  const nav: Nav = { navigate, linkProps, pending: isPending }
  const labels = structureLabels(false)

  let body
  switch (route.page) {
    case "customers":
      body = <CustomersScreen nav={nav} />
      break
    case "customer-new":
      body = <CustomerNewScreen nav={nav} />
      break
    case "customer":
      body = <CustomerDetailScreen key={route.id} nav={nav} id={route.id ?? ""} />
      break
    case "customer-edit":
      body = <CustomerEditScreen key={route.id} nav={nav} id={route.id ?? ""} from={route.params.get("from")} />
      break
    case "archived":
      body = <ArchivedScreen nav={nav} />
      break
    case "settings":
      body = <SettingsScreen />
      break
    case "contracts":
      body = <ContractsScreen nav={nav} />
      break
    case "contract-new":
      body = <ContractNewScreen nav={nav} />
      break
    case "import":
      body = <ImportScreen nav={nav} />
      break
    default:
      body = <PlaceholderScreen title={labels[route.page] ?? "ページ"} />
  }

  return (
    <AppShell sidebarOpen={open} onSidebarOpenChange={setOpen}>
      <StructureSidebar
        groups={navFor(structureNav(false))}
        settingsItem={{ ...structureSettingsItem(false), href: formsHref("settings") }}
        currentId={navIdFor[route.page] ?? route.page}
        homeHref={formsHref("home")}
        onNavigate={(id, e) => {
          e.preventDefault()
          navigate(formsHref(id))
        }}
        user={structureUser}
        onSignOut={() => navigate(formsHref("customers"))}
      />
      <AppShellBody>
        <AppShellHeader className="md:hidden">
          <SidebarTrigger className="-ml-2" />
          <span className="flex min-w-0 items-center gap-3 text-ui font-semibold">
            <ProductMark />
            <span className="truncate">Flow 営業管理</span>
          </span>
        </AppShellHeader>
        <AppShellMain pageKey={`${route.page}:${route.id ?? ""}`} data-testid="forms-main">
          {body}
          <VerifyControls />
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
