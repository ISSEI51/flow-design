import { useCallback, useEffect, useState, type MouseEvent } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useToast } from "@/components/ui/toast"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain, useAppShell } from "@/patterns/app-shell"
import type { BrowseQuery } from "@/patterns/browse-query"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderTitle } from "@/patterns/page-header"
import { Section, SectionDescription, SectionHeader, SectionHeading, SectionTitle } from "@/patterns/section-layout"
import type { NavGroup } from "@/patterns/sidebar-nav"
import { resolveInitialView } from "@/patterns/view-switcher"

import { structureLabels, structureNav, structureSettingsItem, structureUser } from "../../data/app-structure"
import { owners, statusOptions, type ContractStatus } from "../../data/data-display/customers"
import {
  companyServer,
  createCompany,
  defaultCompanyFilters,
  workspaces,
  type BulkMode,
  type CompanyFilters,
} from "../../data/data-browsing/company-server"
import { PlaceholderScreen } from "../app-structure/structure-screens"
import { ProductMark, StructureSidebar } from "../app-structure/structure-sidebar"
import { CompanyBrowser, viewOptions, type BrowseView, type BrowserSnapshot } from "./company-browser"
import { CompanyDetailPage } from "./company-detail"

// Data Browsing の 5 種類を組み合わせた、営業管理の検証用の画面。正式な Pages の実装ではない。
// App Structure の検証画面（structure-app）と同じ Sidebar と App Shell を使い、顧客の一覧と詳細を作る。
//
// 製品（この画面）の責務として行うこと
// - ルーティング：URL のハッシュ（#/browsing-app?page=customers&...）。
// - URL への同期：検索語以外の条件（フィルター、ソート、ページ、表示形式）。検索語は電話番号を含みうるため URL に入れない。
//   条件の変更は履歴を増やさない（history.replaceState）。
// - 一覧の位置の保存：履歴の項目ごとの記録（history.state の fdListKey）を、この画面のメモリに持つ。
//   一覧 → 詳細ページ → 戻る（ブラウザの戻るか、Breadcrumb）で、条件、スクロールの位置、フォーカスを復元する。
//   再読み込みした場合は、URL の条件だけを復元する（検索語とスクロールの位置は戻らない）。

const APP = "#/browsing-app"

type Route = { page: string; id: string | null; ws: string; params: URLSearchParams }

function readRoute(): Route {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
  return { page: params.get("page") ?? "customers", id: params.get("id"), ws: params.get("ws") ?? "hq", params }
}

const appHref = (page: string, extra?: Record<string, string>) => `${APP}?${new URLSearchParams({ page, ...extra }).toString()}`

// ---------------------------------------------------------------- URL と条件の変換
function queryFromParams(p: URLSearchParams): Partial<BrowseQuery<CompanyFilters>> {
  const num = (k: string) => (p.get(k) !== null && !Number.isNaN(Number(p.get(k))) ? Number(p.get(k)) : null)
  const status = p.get("status")
  const sort = p.get("sort")
  const filters: CompanyFilters = {
    ...defaultCompanyFilters,
    status: statusOptions.some((s) => s.value === status) ? (status as ContractStatus) : null,
    owner: owners.includes(p.get("owner") ?? "") ? p.get("owner") : null,
    regions: p.get("regions")?.split(",").filter(Boolean) ?? [],
    feeMin: num("feeMin"),
    feeMax: num("feeMax"),
    renewalFrom: p.get("renewalFrom"),
    renewalTo: p.get("renewalTo"),
  }
  const size = num("size")
  return {
    filters,
    sorting: sort ? [{ id: sort.replace(/\.desc$/, ""), desc: sort.endsWith(".desc") }] : [],
    pagination: { pageIndex: Math.max(0, (num("p") ?? 1) - 1), pageSize: size && [20, 50, 100].includes(size) ? size : 20 },
  }
}

function paramsFromQuery(q: BrowseQuery<CompanyFilters>, view: BrowseView, ws: string) {
  const p = new URLSearchParams({ page: "customers" })
  if (ws !== "hq") p.set("ws", ws)
  const f = q.filters
  if (f.status) p.set("status", f.status)
  if (f.owner) p.set("owner", f.owner)
  if (f.regions.length) p.set("regions", f.regions.join(","))
  if (f.feeMin !== null) p.set("feeMin", String(f.feeMin))
  if (f.feeMax !== null) p.set("feeMax", String(f.feeMax))
  if (f.renewalFrom) p.set("renewalFrom", f.renewalFrom)
  if (f.renewalTo) p.set("renewalTo", f.renewalTo)
  if (q.sorting[0]) p.set("sort", `${q.sorting[0].id}${q.sorting[0].desc ? ".desc" : ""}`)
  if (q.pagination.pageIndex > 0) p.set("p", String(q.pagination.pageIndex + 1))
  if (q.pagination.pageSize !== 20) p.set("size", String(q.pagination.pageSize))
  if (view !== "table") p.set("view", view)
  return p
}

// 履歴の項目ごとの一覧の記録。製品はセッションのストレージなどに保存してもよい（この画面はメモリだけ）。
const snapshots = new Map<string, BrowserSnapshot>()
let lastView: BrowseView | null = null
let keySeq = 0

// 履歴の項目の記録のキー。描画中は読むだけにし、ない場合の書き込み（replaceState）は効果の中で行う。
function readListKey() {
  return ((window.history.state ?? {}) as { fdListKey?: string }).fdListKey ?? null
}

// ---------------------------------------------------------------- 一覧のページ
function CustomersScreen({
  route,
  title,
  reloadToken,
  onReload,
  onWorkspaceChange,
}: {
  route: Route
  title: string
  reloadToken: number
  onReload: () => void
  onWorkspaceChange: (ws: string) => void
}) {
  const { mainRef } = useAppShell()
  const [listKey] = useState(() => readListKey() ?? `list-${++keySeq}-${Date.now()}`)
  useEffect(() => {
    if (readListKey() !== listKey) window.history.replaceState({ ...(window.history.state ?? {}), fdListKey: listKey }, "")
  }, [listKey])
  const restore = snapshots.get(listKey) ?? null
  const [creating, setCreating] = useState(false)
  const view = resolveInitialView({
    requested: route.params.get("view"),
    remembered: lastView,
    fallback: "table",
    available: viewOptions.map((o) => o.value),
  })

  return (
    <PageLayout width="full" data-testid="browsing-customers">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{title}</PageHeaderTitle>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button onClick={() => setCreating(true)} data-testid="browsing-create">
            <Plus />
            顧客を登録
          </Button>
        </PageHeaderActions>
      </PageHeader>
      <CompanyBrowser
        // 履歴の項目ごとに、一覧の状態を作り直す。ワークスペースの切り替えは、同じ一覧のままスコープだけを変える。
        key={`${listKey}:${reloadToken}`}
        testId="app-list"
        workspace={route.ws}
        features={{ bulk: true, views: true, detailPage: true }}
        initial={restore}
        initialQuery={queryFromParams(route.params)}
        initialView={view}
        scrollElement={mainRef}
        pageHref={(id) => appHref("customer", { id, ...(route.ws !== "hq" && { ws: route.ws }) })}
        onStateChange={(q, v) => {
          lastView = v
          const hash = `${APP}?${paramsFromQuery(q, v, route.ws).toString()}`
          if (window.location.hash !== hash) window.history.replaceState(window.history.state, "", hash)
        }}
        onOpenPage={(id, snapshot) => {
          snapshots.set(listKey, snapshot)
          window.location.hash = appHref("customer", { id, ...(route.ws !== "hq" && { ws: route.ws }) })
          // 詳細ページの履歴の項目に、戻り先の一覧を記録する。
          window.history.replaceState({ fdFromList: listKey }, "")
        }}
      />
      <CreateCompanySheet
        open={creating}
        onOpenChange={setCreating}
        workspace={route.ws}
        onCreated={() => {
          snapshots.delete(listKey)
          onReload()
        }}
      />
      <ServerControls ws={route.ws} onReload={onReload} onWorkspaceChange={onWorkspaceChange} />
    </PageLayout>
  )
}

function CreateCompanySheet({ open, onOpenChange, workspace, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; workspace: string; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  useEffect(() => {
    if (open) {
      setName("")
      setError(null)
    }
  }, [open])
  return (
    <Sheet mode="edit" open={open} onOpenChange={(o) => !saving && onOpenChange(o)} unsavedChanges={name.trim() !== ""} onDiscardRequest={null}>
      <SheetContent size="sm" data-testid="browsing-create-sheet">
        <SheetHeader>
          <SheetTitle>顧客を登録</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form
            id="browsing-create-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!name.trim()) return
              setSaving(true)
              setError(null)
              try {
                const c = await createCompany(workspace, { company: name.trim(), owner: owners[0], status: "trial" })
                setSaving(false)
                onOpenChange(false)
                onCreated()
                toast({ variant: "success", title: `${c.company}を登録しました` })
              } catch {
                setSaving(false)
                setError("登録できませんでした。入力した内容は残っています。時間をおいて、もう一度登録してください。")
              }
            }}
          >
            <FieldGroup>
              {error && (
                <p role="alert" className="text-ui text-destructive">
                  {error}
                </p>
              )}
              <Field>
                <FieldLabel>会社名</FieldLabel>
                <Input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
              </Field>
            </FieldGroup>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" disabled={saving} onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button type="submit" form="browsing-create-form" loading={saving}>
            登録する
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------- 検証用の操作（製品には含めない）
function ServerControls({ ws, onReload, onWorkspaceChange }: { ws: string; onReload: () => void; onWorkspaceChange: (ws: string) => void }) {
  const [, force] = useState(0)
  const set = (fn: () => void) => {
    fn()
    force((n) => n + 1)
  }
  const latency = companyServer.latency.list
  const radio = (name: string, value: string, current: string, label: string, onChange: () => void) => (
    <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2">
      <input type="radio" name={name} value={value} checked={current === value} onChange={onChange} className="size-4 accent-[var(--primary)]" />
      {label}
    </label>
  )
  return (
    <Section divider data-testid="browsing-controls" className="mt-8">
      <SectionHeader>
        <SectionHeading>
          <SectionTitle>検証用の操作</SectionTitle>
          <SectionDescription>模擬のサーバーの設定。製品の画面には含めない。</SectionDescription>
        </SectionHeading>
      </SectionHeader>
      <div className="grid gap-6 text-ui @3xl/page:grid-cols-2">
        <fieldset className="flex flex-wrap items-center gap-x-4">
          <legend className="mb-1 font-medium">応答までの時間</legend>
          {(
            [
              [100, "短い（100ms）"],
              [600, "標準（600ms）"],
              [3000, "長い（3 秒）"],
            ] as const
          ).map(([ms, label]) =>
            radio("latency", String(ms), String(latency), label, () =>
              set(() => {
                companyServer.latency.list = ms
                companyServer.latency.detail = ms
                companyServer.latency.activity = ms
              })
            )
          )}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-x-4">
          <legend className="mb-1 font-medium">件数</legend>
          {radio("count", "exact", companyServer.countMode, "正確な件数を返す", () => set(() => (companyServer.countMode = "exact")))}
          {radio("count", "unknown", companyServer.countMode, "件数を返さない", () => set(() => (companyServer.countMode = "unknown")))}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-x-4">
          <legend className="mb-1 font-medium">一括操作の結果</legend>
          {(
            [
              ["success", "すべて成功"],
              ["partial", "一部失敗"],
              ["fail", "すべて失敗"],
              ["unknown", "一部の結果が不明"],
              ["request-unknown", "通信が切れる"],
              ["request-fail", "要求を受け付けない"],
            ] as [BulkMode, string][]
          ).map(([v, l]) => radio("bulk", v, companyServer.bulkMode, l, () => set(() => (companyServer.bulkMode = v))))}
        </fieldset>
        <div className="flex flex-col gap-2">
          <p className="font-medium">ワークスペース</p>
          <Select
            items={workspaces.map((w) => ({ value: w.id, label: w.name }))}
            value={ws}
            onValueChange={(v) => onWorkspaceChange(String(v))}
          >
            <SelectTrigger aria-label="ワークスペース" className="w-72 max-w-full" data-testid="browsing-workspace">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3 @3xl/page:col-span-2">
          <Button variant="outline" size="xs" data-testid="browsing-fail-next" onClick={() => set(() => (companyServer.failNext.list = true))}>
            次の一覧の取得を失敗させる
          </Button>
          <label className="flex min-h-10 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={companyServer.activityAlwaysFails}
              onChange={(e) => set(() => (companyServer.activityAlwaysFails = e.target.checked))}
              className="size-4 accent-[var(--primary)]"
            />
            詳細ページの取引の履歴の取得を失敗させる
          </label>
          <Button variant="outline" size="xs" onClick={onReload}>
            一覧を作り直す
          </Button>
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- 画面全体
function navFor(groups: NavGroup[]): NavGroup[] {
  const fix = (href: string | undefined, id: string) => (href ? appHref(id) : undefined)
  return groups.map((g) => ({
    ...g,
    items: g.items.map((it) => ({
      ...it,
      href: fix(it.href, it.id),
      children: it.children?.map((c) => ({ ...c, href: appHref(c.id) })),
    })),
  }))
}

export function BrowsingApp() {
  const [route, setRoute] = useState(readRoute)
  const [reloadToken, setReloadToken] = useState(0)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigateTo = useCallback((page: string) => {
    window.location.hash = appHref(page)
  }, [])

  const labels = structureLabels(false)
  const listState = (window.history.state ?? {}) as { fdListKey?: string; fdFromList?: string }
  // 一覧に戻り、記録がある場合は、AppShellMain の「先頭へ戻す」「h1 へフォーカス」を止め、CompanyBrowser が復元する。
  const restoring = route.page === "customers" && Boolean(listState.fdListKey && snapshots.has(listState.fdListKey))

  const backHref = appHref("customers", route.ws !== "hq" ? { ws: route.ws } : {})
  const onBack = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    // 一覧から開いた詳細なら、履歴を戻る（条件と位置を復元する）。直接開いた場合は、一覧へ移動する。
    if (listState.fdFromList) window.history.back()
    else window.location.hash = backHref
  }

  let body
  if (route.page === "customers") {
    body = (
      <CustomersScreen
        route={route}
        title={labels.customers}
        reloadToken={reloadToken}
        onReload={() => setReloadToken((n) => n + 1)}
        onWorkspaceChange={(ws) => {
          // 同じ一覧のまま、ワークスペース（データのスコープ）だけを切り替える。表示中のデータ、選択、詳細の表示は持ち越さない。
          const p = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
          if (ws === "hq") p.delete("ws")
          else p.set("ws", ws)
          window.history.replaceState(window.history.state, "", `${APP}?${p.toString()}`)
          setRoute(readRoute())
        }}
      />
    )
  } else if (route.page === "customer" && route.id) {
    body = <CompanyDetailPage key={route.id} workspace={route.ws} id={route.id} backHref={backHref} onBack={onBack} />
  } else {
    body = <PlaceholderScreen title={labels[route.page] ?? "ページ"} />
  }

  return (
    <AppShell sidebarOpen={open} onSidebarOpenChange={setOpen}>
      <StructureSidebar
        groups={navFor(structureNav(false))}
        settingsItem={{ ...structureSettingsItem(false), href: appHref("settings") }}
        currentId={route.page === "customer" ? "customers" : route.page}
        homeHref={appHref("home")}
        onNavigate={(id, e) => {
          e.preventDefault()
          navigateTo(id)
        }}
        user={structureUser}
        onSignOut={() => navigateTo("customers")}
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
          pageKey={`${route.page}:${route.id ?? ""}`}
          scrollOnNavigate={restoring ? false : "top"}
          focusOnNavigate={restoring ? false : "heading"}
          data-testid="browsing-main"
        >
          {body}
        </AppShellMain>
      </AppShellBody>
    </AppShell>
  )
}
