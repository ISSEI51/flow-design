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
import type { NavGroup, NavItem } from "@/patterns/sidebar-nav"
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
//   一覧 → 詳細ページ → 戻る（ブラウザの戻るか、Breadcrumb）で、条件、選択、スクロールの位置、フォーカスを復元する。
//   再読み込みした場合は、URL の条件だけを復元する（検索語とスクロールの位置は戻らない）。
// - 記録を使ってよいかの判断：記録したときのスコープ（ワークスペース）が、戻った履歴の項目の URL のワークスペースと
//   一致する場合だけ使う。履歴の項目のキー（fdListKey）は、ワークスペースを切り替えても変わらないため、キーだけで判断しない。
//   製品では、スコープにアカウントと権限の版も含める。
// - Sidebar から一覧を開く操作は、表示中が一覧でも、新しい履歴の項目（新しい fdListKey）で一覧を作り直す（前の条件と位置を持ち越さない）。

const APP = "#/browsing-app"

type Route = {
  page: string
  id: string | null
  ws: string
  params: URLSearchParams
  /** 一覧の履歴の項目のキー（history.state の fdListKey）。一覧の画面は、このキーごとに作り直す */
  listKey: string | null
}

function readRoute(): Route {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
  const page = params.get("page") ?? "customers"
  return { page, id: params.get("id"), ws: params.get("ws") ?? "hq", params, listKey: page === "customers" ? readListKey() : null }
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
const newListKey = () => `list-${++keySeq}-${Date.now()}`

// 履歴の項目の記録のキー。描画中は読むだけにし、ない場合の書き込み（replaceState）は効果の中で行う。
function readListKey() {
  return ((window.history.state ?? {}) as { fdListKey?: string }).fdListKey ?? null
}

// 一覧の履歴の項目にキーがない場合（初めて開いた、リンクで開いた）は、新しいキーを割り当てる（履歴への書き込みは効果の中で行う）。
const withListKey = (route: Route): Route => (route.page === "customers" && !route.listKey ? { ...route, listKey: newListKey() } : route)

/** 記録を使ってよいか：記録したときのスコープ（ワークスペース）が、現在のスコープと一致する場合だけ使う */
function restorableSnapshot(listKey: string | null, ws: string) {
  const s = listKey ? snapshots.get(listKey) : undefined
  return s && s.scope === ws ? s : null
}

// ---------------------------------------------------------------- 一覧のページ
function CustomersScreen({
  route,
  listKey,
  title,
  reloadToken,
  onReload,
  onWorkspaceChange,
}: {
  route: Route
  /** この一覧の履歴の項目のキー。キーが変わると、親が一覧を作り直す（key） */
  listKey: string
  title: string
  reloadToken: number
  onReload: () => void
  onWorkspaceChange: (ws: string) => void
}) {
  const { mainRef } = useAppShell()
  useEffect(() => {
    if (readListKey() !== listKey) window.history.replaceState({ ...(window.history.state ?? {}), fdListKey: listKey }, "")
  }, [listKey])
  // 一覧を作るときの記録（CompanyBrowser は作ったときだけ読む）。別のワークスペースの記録は使わない。
  const [restore] = useState(() => restorableSnapshot(listKey, route.ws))
  const [creating, setCreating] = useState(false)
  const [refetchToken, setRefetchToken] = useState(0)
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
        // 「一覧を作り直す」で作り直す（履歴の項目ごとの作り直しは、親の key で行う）。
        // ワークスペースの切り替えは、同じ一覧のままスコープだけを変える。
        key={reloadToken}
        testId="app-list"
        workspace={route.ws}
        features={{ bulk: true, views: true, detailPage: true }}
        initial={restore}
        initialQuery={queryFromParams(route.params)}
        initialView={view}
        scrollElement={mainRef}
        refetchToken={refetchToken}
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
      <ServerControls ws={route.ws} onReload={onReload} onRefetch={() => setRefetchToken((n) => n + 1)} onWorkspaceChange={onWorkspaceChange} />
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
function ServerControls({
  ws,
  onReload,
  onRefetch,
  onWorkspaceChange,
}: {
  ws: string
  onReload: () => void
  onRefetch: () => void
  onWorkspaceChange: (ws: string) => void
}) {
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
              ["incomplete", "結果が足りない・重複する"],
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
          <Button variant="outline" size="xs" data-testid="browsing-refetch" onClick={onRefetch}>
            最新の情報に更新
          </Button>
          <Button variant="outline" size="xs" onClick={onReload}>
            一覧を作り直す
          </Button>
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- 画面全体
// App Structure の検証画面のメニューを、この画面の URL に置き換える（項目の構造は変えない）。
function navFor(groups: NavGroup[]): NavGroup[] {
  return groups.map((g) => ({
    ...g,
    items: g.items.map(
      (it) =>
        ({
          ...it,
          ...(it.href !== undefined && { href: appHref(it.id) }),
          ...(it.children && { children: it.children.map((c) => ({ ...c, href: appHref(c.id) })) }),
        }) as NavItem
    ),
  }))
}

export function BrowsingApp() {
  const [route, setRoute] = useState(() => withListKey(readRoute()))
  const [reloadToken, setReloadToken] = useState(0)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    // URL のハッシュの変化（リンク、location.hash）と、履歴の移動（戻る・進む。URL が同じ項目の間の移動を含む）。
    // 同じ移動で hashchange と popstate の両方が届くため、キーのない一覧の項目には、ここで（描画の前に）キーを書き込む。
    const onNavigate = () => {
      // この画面の外（プレビューの別のページ）への移動は、プレビューの一覧が扱う（一覧の URL に書き戻さない）。
      if (!window.location.hash.startsWith(APP)) return
      const r = readRoute()
      if (r.page === "customers" && !r.listKey) window.history.replaceState({ ...(window.history.state ?? {}), fdListKey: newListKey() }, "")
      setRoute(readRoute())
    }
    window.addEventListener("hashchange", onNavigate)
    window.addEventListener("popstate", onNavigate)
    return () => {
      window.removeEventListener("hashchange", onNavigate)
      window.removeEventListener("popstate", onNavigate)
    }
  }, [])

  const navigateTo = useCallback((page: string) => {
    if (page === "customers" && readRoute().page === "customers") {
      // 表示中の一覧を Sidebar から開き直す：新しい履歴の項目（新しいキー）で、条件と位置を持ち越さずに一覧を作り直す。
      // URL が同じ場合も履歴の項目を増やし、前の項目の記録（戻ったときの復元）を上書きしない。
      window.history.pushState({ fdListKey: newListKey() }, "", appHref(page))
      setRoute(readRoute())
      return
    }
    window.location.hash = appHref(page)
  }, [])

  const labels = structureLabels(false)
  const listState = (window.history.state ?? {}) as { fdListKey?: string; fdFromList?: string }
  // 一覧に戻り、使える記録（同じワークスペースの記録）がある場合は、AppShellMain の「先頭へ戻す」「h1 へフォーカス」を止め、
  // CompanyBrowser が復元する。CompanyBrowser に渡す記録と同じ条件で判断する。
  const restoring = route.page === "customers" && restorableSnapshot(route.listKey, route.ws) !== null

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
        // 履歴の項目ごとに、一覧を作り直す。
        key={route.listKey ?? ""}
        route={route}
        listKey={route.listKey ?? ""}
        title={labels.customers}
        reloadToken={reloadToken}
        onReload={() => setReloadToken((n) => n + 1)}
        onWorkspaceChange={(ws) => {
          // 同じ一覧のまま、ワークスペース（データのスコープ）だけを切り替える。表示中のデータ、選択、詳細の表示は持ち越さない。
          // この履歴の項目の記録は、前のワークスペースの一覧の状態のため破棄する（戻ったときに、別のワークスペースの行を表示しない）。
          if (route.listKey) snapshots.delete(route.listKey)
          const p = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
          if (ws === "hq") p.delete("ws")
          else p.set("ws", ws)
          window.history.replaceState(window.history.state, "", `${APP}?${p.toString()}`)
          setRoute((prev) => ({ ...readRoute(), listKey: prev.listKey }))
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
          // 一覧は履歴の項目ごとに別のページとして扱う（Sidebar から開き直した一覧も、先頭と h1 から始める）。
          pageKey={`${route.page}:${route.id ?? ""}:${route.listKey ?? ""}`}
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
