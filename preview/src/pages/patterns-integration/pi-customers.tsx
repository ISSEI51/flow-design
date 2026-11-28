import { useEffect, useMemo, useRef, useState } from "react"
import { createColumnHelper, useTable } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import {
  DataTable,
  DataTableColumnHeader,
  DataTableMessage,
  DataTablePageCheckbox,
  DataTablePagination,
  DataTableRowCheckbox,
  DataTableRowTrigger,
  DataTableSearch,
  DataTableSelectionBar,
  dataTableDefaults,
  dataTableFeatures,
  type DataTableFeatures,
} from "@/components/ui/data-table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToast } from "@/components/ui/toast"
import { useAppShell } from "@/patterns/app-shell"
import { useBrowseData } from "@/patterns/browse-data"
import { useBrowseQuery, type BrowseQuery } from "@/patterns/browse-query"
import { BulkResultAlert, BulkRunStatus } from "@/patterns/bulk-actions"
import { isBulkFullySucceeded, useBulkAction, useBulkSelection, type BulkTarget } from "@/patterns/bulk-selection"
import { ConfirmActionDialog } from "@/patterns/confirm-action"
import { DataRegionError } from "@/patterns/data-states"
import { captureListPosition, useListPositionRestore, type ListPosition } from "@/patterns/list-detail"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderTitle } from "@/patterns/page-header"
import { PageLayout } from "@/patterns/page-layout"
import { TableScrollArea } from "@/patterns/table-scroll-area"

import { defaultListFilters, planLabel, regions, statusLabel, yen, type ListFilters, type PiCustomer } from "../../data/patterns-integration/model"
import { exportCustomers, fetchCustomers, lookupPaused, matchingIds, pauseCustomers, peekCustomer, type ListPage } from "../../data/patterns-integration/server"
import { ExportDialog, type ExportColumn } from "../forms-workflows/export-dialog"
import { onlyOfflineReason, ProtectedContent, usePi } from "./pi-context"
import { Facts } from "./pi-parts"
import { historyMarks, piHref } from "./pi-router"

// 顧客の一覧（Data Browsing と Forms & Workflows の Registry の組み合わせ。製品側のコードの例）。
// - 検索・絞り込み・並び替え・ページ：useBrowseQuery。取得：useBrowseData（scopeKey は利用者・ワークスペース・認可の世代）。
// - 行の名前を押すと、閲覧の Sheet で詳細を確かめる。Sheet から専用の詳細ページへ移る。
// - 一括操作（停止にする）：useBulkSelection、useBulkAction、ConfirmActionDialog（progress="external"、targetKey）。
//   結果が不明な行は、現在の認可で状態を照会する（再実行しない）。確定した失敗だけを再試行する。
// - エクスポート：Forms & Workflows の ExportDialog を、変更せずに使う（対象の範囲は始めた場所で決め、選択がなくなっても広げない）。
// - 一覧から移る前に、条件・データ・位置を記録し、戻ったとき（restore=1 か、記録した履歴の項目への戻る）に復元する。

type Query = BrowseQuery<ListFilters>
type Snapshot = {
  scope: string
  token: string
  openedIdx: number
  query: Query
  position: ListPosition
  page: { data: ListPage; key: string; fetchedAt: number | null; scope: string } | null
}
let snapshot: Snapshot | null = null
let snapshotSeq = 0
/** 一覧の記録を使ってよいか（記録と同じスコープで、記録した履歴の項目に戻ったか、記録したときに開いた画面から restore=1 で戻った） */
export function hasListSnapshot(scope: string, params: URLSearchParams) {
  if (!snapshot || snapshot.scope !== scope) return false
  const marks = historyMarks()
  if (marks.fdPiList === snapshot.token) return true
  return params.get("restore") === "1" && marks.fdPiFrom !== undefined && marks.fdPiFrom === snapshot.openedIdx
}
/** スコープ（利用者、ワークスペース、認可）が変わったときに、前の記録を捨てる */
export const dropListSnapshot = () => void (snapshot = null)

const helper = createColumnHelper<DataTableFeatures, PiCustomer>()
const exportColumns: ExportColumn[] = [
  { id: "name", label: "顧客", visible: true },
  { id: "region", label: "地域", visible: true },
  { id: "plan", label: "プラン", visible: true },
  { id: "status", label: "状態", visible: true },
  { id: "mrr", label: "月額", visible: true },
  { id: "email", label: "メールアドレス", visible: false, sensitive: true },
]
const rowFor = (c: PiCustomer) => ({ name: c.name, region: c.region, plan: planLabel(c.plan), status: statusLabel[c.status], mrr: c.mrr, email: c.email })
const fmt = (n: number) => n.toLocaleString("ja-JP")
const sortOptions = [
  { value: "none", label: "標準" },
  { value: "name", label: "顧客の名前順" },
  { value: "mrr-desc", label: "月額の高い順" },
  { value: "mrr-asc", label: "月額の低い順" },
]
const sortValue = (q: Query) => {
  const s = q.sorting[0]
  if (!s) return "none"
  return s.id === "mrr" ? (s.desc ? "mrr-desc" : "mrr-asc") : "name"
}

function FilterSelect({ label, value, options, onChange, testId }: { label: string; value: string | null; options: { value: string; label: string }[]; onChange: (v: string | null) => void; testId: string }) {
  const items = [{ value: "all", label: `${label}：すべて` }, ...options.map((o) => ({ value: o.value, label: `${label}：${o.label}` }))]
  return (
    <Select items={items} value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? null : String(v))}>
      <SelectTrigger aria-label={label} className="w-full sm:w-auto sm:min-w-40" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CustomersScreen({ restore }: { restore: boolean }) {
  const { ws, scope, dataScope, nav, permit, outageSeq, viewAccess, access, connectivity } = usePi()
  const canImport = access.grants?.permissions.includes("edit") ?? false
  const { toast } = useToast()
  const { mainRef } = useAppShell()
  const root = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // 描画の中では記録を読むだけにする（commit されなかった描画で記録を消さない）。使い終えたことは commit の後に記録する
  const [initial] = useState(() => (restore && snapshot && snapshot.scope === scope ? snapshot : null))
  useEffect(() => {
    if (initial && snapshot === initial) snapshot = null
  }, [initial])
  const browse = useBrowseQuery<ListFilters>({
    defaultFilters: defaultListFilters,
    initialQuery: initial?.query ?? { pagination: { pageIndex: 0, pageSize: 10 } },
    debounceMs: 300,
    defaultPageSize: 10,
  })
  const q = browse.query
  const [restoreKey] = useState(() => (initial ? JSON.stringify(initial.query) : null))
  const data = useBrowseData({
    query: q,
    scopeKey: dataScope,
    initialData: initial?.page ?? undefined,
    // 要求の宛先は、取得を始めた時点のワークスペース
    fetcher: (query, { signal }) => fetchCustomers(ws, query, signal),
  })
  // 接続が回復したら、安全な取得（一覧）を再開する。結果が不明な更新は再実行しない
  const { reload } = data
  const seenOutage = useRef(outageSeq)
  useEffect(() => {
    if (outageSeq === seenOutage.current) return
    seenOutage.current = outageSeq
    reload()
  }, [outageSeq, reload])
  const page = data.data
  const rows = useMemo(() => page?.rows ?? [], [page])
  const total = data.isCurrent ? (page?.total ?? null) : null
  const edit = permit("edit")
  const exporting = permit("export")
  const locked = !data.canOperate
  const names = useRef(new Map<string, string>())
  for (const r of rows) names.current.set(r.id, r.name)
  const nameOf = (id: string) => names.current.get(id) ?? peekCustomer(ws, id)?.name ?? id

  const selection = useBulkSelection({ queryKey: JSON.stringify([q.search, q.filters]), query: q, scopeKey: scope, visibleIds: rows.map((r) => r.id), total })
  useEffect(() => {
    // 検品用：一括操作のバーの選択を、ほかの処理が解除したことを再現する（エクスポートの範囲が広がらないことの検品）
    const w = window.__fdPi as Record<string, unknown> | undefined
    if (!w) return
    w.clearSelection = () => selection.clear()
    // 検品用：確認の表示中に、選んだ行がほかの処理で変わったことを再現する
    w.setSelected = (id: string, on: boolean) => selection.setSelected(id, on)
    return () => {
      delete w.clearSelection
      delete w.setSelected
    }
  })

  // ---------------------------------------------------------------- 一括操作
  // 照会の結果の知らせ（照会で結果が不明な行がなくなると、BulkResultAlert を閉じることがあるため、画面に残す）
  const [lookupNotice, setLookupNotice] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)
  // 押したボタンや進行状況の表示が消えたときに、フォーカスを <body> に落とさない（Data Browsing の検証画面と同じ方法）
  const keepFocus = (target: () => HTMLElement | null) => {
    let frames = 0
    const check = () => {
      const active = document.activeElement
      if (!active || active === document.body || !document.contains(active)) target()?.focus()
      else if (frames++ < 20) requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }
  const action = useBulkAction<Query, { kind: "pause" }>({
    scopeKey: scope,
    run: async (target) => {
      const ids = target.kind === "ids" ? target.ids : matchingIds(ws, target.query.search, target.query.filters).filter((id) => !target.excludedIds.includes(id))
      const items = await pauseCustomers(ws, ids)
      return target.kind === "ids" ? items : { items, confirmedCount: ids.length }
    },
    onSettled: (summary) => {
      selection.settle(summary)
      setLookupNotice(null)
      data.reload()
      if (isBulkFullySucceeded(summary)) {
        toast({ variant: "success", title: `${fmt(summary.succeeded.length)}件の顧客を停止にしました` })
        keepFocus(() => root.current?.querySelector<HTMLElement>("[data-slot=data-table-row-trigger]") ?? searchRef.current)
      } else keepFocus(() => resultRef.current)
    },
  })
  const running = action.running !== null
  const [confirmOpen, setConfirmOpen] = useState(false)
  const bulkTarget: BulkTarget<Query> | null = confirmOpen ? selection.snapshot() : null
  const bulkCount = bulkTarget ? (bulkTarget.kind === "ids" ? bulkTarget.ids.length : bulkTarget.expectedCount) : null
  const keyOfTarget = (t: BulkTarget<Query>) =>
    JSON.stringify(t.kind === "ids" ? ["ids", t.scope, [...t.ids].sort()] : ["query", t.scope, t.queryKey, [...t.excludedIds].sort(), t.expectedCount])
  // 結果が不明な行の照会。現在のスコープの認可で照会し、照会の結果を useBulkAction.resolveUnknown で反映する
  // （停止になっていた行は完了、変更されていなかった行は確定した失敗になり、「失敗した N件を再試行」の対象になる）。照会の前に再実行しない
  const summary = action.summary
  const checkUnknown = async () => {
    if (!summary || checking) return
    const ids = summary.unknown.map((i) => i.id)
    const from = action.capture()
    setChecking(true)
    try {
      const state = await lookupPaused(ws, ids)
      const resolved = action.resolveUnknown(
        ids.map((id) => (state[id] ? { id, outcome: "succeeded" as const } : { id, outcome: "failed" as const, message: "変更されていませんでした" })),
        { from }
      )
      if (resolved > 0) {
        const applied = ids.filter((id) => state[id])
        const notApplied = ids.filter((id) => !state[id])
        setLookupNotice(
          `状態を確認しました：${fmt(applied.length)}件は停止になっていました${notApplied.length ? `。${notApplied.map(nameOf).join("、")}は変更されていませんでした` : ""}`
        )
        data.reload()
      }
    } catch {
      toast({ variant: "destructive", title: "状態を確認できませんでした", description: "時間をおいて、もう一度確認してください。" })
    } finally {
      setChecking(false)
    }
  }

  // ---------------------------------------------------------------- 一覧の位置
  const saveSnapshot = (rowId: string | null) => {
    const token = `pi-list-${++snapshotSeq}`
    window.history.replaceState({ ...(window.history.state ?? {}), fdPiList: token }, "")
    snapshot = {
      scope,
      token,
      openedIdx: (historyMarks().fdPiIdx ?? 0) + 1,
      query: q,
      position: captureListPosition({ scrollElement: mainRef.current, root: root.current, rowId }),
      page: data.isCurrent && page && data.dataKey ? { data: page, key: data.dataKey, fetchedAt: data.fetchedAt, scope: dataScope } : null,
    }
  }
  useListPositionRestore({
    position: initial?.position ?? null,
    ready: data.isCurrent,
    scrollReady: data.data !== undefined && data.dataKey === restoreKey,
    targetKey: restoreKey,
    dataKey: data.dataKey,
    root,
    scrollElement: mainRef,
    fallbackFocus: () => searchRef.current,
  })

  // ---------------------------------------------------------------- 詳細の Sheet
  const [open, setOpen] = useState<{ scope: string; id: string } | null>(null)
  // 権限の確認中と閲覧の権限がない間は、詳細の Sheet を表示しない（保護された内容を描画しない）
  const viewing = viewAccess === "allowed"
  const openId = open && open.scope === scope && viewing ? open.id : null
  useEffect(() => {
    if (!viewing) setOpen(null)
  }, [viewing])
  const openRow = rows.find((r) => r.id === openId) ?? null
  const lastOpen = useRef<string | null>(null)
  if (openId) lastOpen.current = openId
  const openPage = (id: string) => {
    saveSnapshot(id)
    nav.navigate(piHref("customer", { ws: ws === "hq" ? null : ws, id, from: "list" }))
  }
  const openEdit = (id: string) => {
    saveSnapshot(id)
    nav.navigate(piHref("customer-edit", { ws: ws === "hq" ? null : ws, id, from: "list" }))
  }

  // ---------------------------------------------------------------- エクスポート
  const [exportOrigin, setExportOrigin] = useState<"table" | "selection-bar" | null>(null)
  const selectedIds = selection.mode === "ids" ? selection.selectedIds : []
  const exportBlocked = locked ? "一覧を取得し終えるまで操作できません" : exporting.reason
  // 操作できない理由は、一覧の上に 1 回だけ見える文で示し、操作の部品から aria-describedby で参照する（同じ文を重ねない）
  const reasons = [...new Set([exportBlocked, edit.reason].filter((r): r is string => r !== null))]
  const reasonId = (r: string | null) => (r === null ? undefined : `pi-list-reason-${reasons.indexOf(r)}`)
  const allSelectedExport = "検索結果全件の選択では、選んだ行のエクスポートはできません。表の上のエクスポートを使ってください"
  // 権限を失ったら、開いているエクスポートと確認を閉じる（古い権限で実行させない）
  useEffect(() => {
    if (!exporting.allowed) setExportOrigin(null)
    if (!edit.allowed) setConfirmOpen(false)
  }, [exporting.allowed, edit.allowed])

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "select",
          header: ({ table }) => <DataTablePageCheckbox table={table} />,
          cell: ({ row }) => <DataTableRowCheckbox row={row} label={`${row.original.name}を選択`} />,
          size: 48,
          enableSorting: false,
          enableHiding: false,
        }),
        helper.accessor("name", {
          header: ({ column }) => <DataTableColumnHeader column={column} title="顧客" />,
          meta: { label: "顧客" },
          cell: ({ row }) => <DataTableRowTrigger row={row}>{row.original.name}</DataTableRowTrigger>,
        }),
        helper.accessor("region", { header: "地域", meta: { label: "地域" }, enableSorting: false }),
        helper.accessor((r) => planLabel(r.plan), { id: "plan", header: "プラン", meta: { label: "プラン" }, enableSorting: false }),
        helper.accessor((r) => statusLabel[r.status], { id: "status", header: "状態", meta: { label: "状態" }, enableSorting: false }),
        helper.accessor("mrr", {
          header: ({ column }) => <DataTableColumnHeader column={column} title="月額" />,
          meta: { label: "月額", align: "right", cellClassName: "tabular-nums whitespace-nowrap" },
          cell: ({ getValue }) => yen(getValue()),
        }),
      ]),
    []
  )
  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns,
    data: rows,
    getRowId: (r) => r.id,
    state: { sorting: q.sorting, pagination: q.pagination, rowSelection: selection.rowSelection },
    onSortingChange: browse.onSortingChange,
    onPaginationChange: browse.onPaginationChange,
    onRowSelectionChange: selection.onRowSelectionChange,
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    rowCount: total ?? undefined,
    autoResetPageIndex: false,
  })

  const sortItems = sortOptions
  return (
    <PageLayout width="full" data-testid="pi-customers">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客</PageHeaderTitle>
        </PageHeaderContent>
        {/* 取り込みは編集の権限が必要。権限がなければ入口を置かない（取り込みの画面も開けない） */}
        {canImport && (
          <PageHeaderActions>
            <a
              {...nav.linkProps(piHref("import", { ws: ws === "hq" ? null : ws }))}
              className="inline-flex min-h-control items-center rounded-xs text-ui font-medium underline underline-offset-4 outline-none focus-visible:focus-ring"
            >
              CSV から取り込む
            </a>
          </PageHeaderActions>
        )}
      </PageHeader>
      <ProtectedContent label="顧客の一覧">
        <div ref={root} className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <DataTableSearch
              ref={searchRef}
              className="sm:max-w-72"
              placeholder="顧客の名前、メールアドレスで検索"
              value={browse.searchInput}
              onValueChange={browse.setSearchInput}
              data-testid="customers-search"
            />
            {/* 狭い画面では、絞り込みと並び順を 2 列に並べる（縦に長くしない） */}
            <div className="grid w-full grid-cols-1 gap-3 min-[22.5rem]:grid-cols-2 sm:contents">
              <FilterSelect label="状態" value={q.filters.status} options={[{ value: "active", label: "契約中" }, { value: "paused", label: "停止中" }]} onChange={(v) => browse.setFilters({ status: v as ListFilters["status"] })} testId="filter-status" />
              <FilterSelect label="地域" value={q.filters.region} options={regions.map((r) => ({ value: r, label: r }))} onChange={(v) => browse.setFilters({ region: v })} testId="filter-region" />
              <Select
                items={sortItems}
                value={sortValue(q)}
                onValueChange={(v) => browse.onSortingChange(v === "none" ? [] : v === "name" ? [{ id: "name", desc: false }] : [{ id: "mrr", desc: v === "mrr-desc" }])}
              >
                <SelectTrigger aria-label="並び順" className="w-full sm:w-auto sm:min-w-40" data-testid="sort-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortItems.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            <Button
              variant="secondary"
              className="w-full sm:ml-auto sm:w-auto"
              disabled={exportBlocked !== null}
              focusableWhenDisabled
              aria-describedby={reasonId(exportBlocked)}
              onClick={() => setExportOrigin("table")}
              data-testid="customers-export"
            >
              エクスポート
            </Button>
            </div>
          </div>
          {reasons.length > 0 && (
            <div className={onlyOfflineReason(reasons, connectivity) ? "sr-only" : "flex flex-col gap-1 text-ui text-muted-foreground"} data-testid="list-restrictions">
              {reasons.map((r) => (
                <p key={r} id={reasonId(r)}>
                  {r}
                </p>
              ))}
            </div>
          )}

          {summary && !isBulkFullySucceeded(summary) && (
            <div ref={resultRef} tabIndex={-1} className="outline-none" data-testid="bulk-result">
              <BulkResultAlert
                summary={summary}
                getItemLabel={nameOf}
                retrying={running || checking}
                onRetryFailed={edit.allowed ? () => void action.retryFailed() : undefined}
                // 結果が不明な行があれば照会して反映する。なければ一覧を取得し直す（結果の矛盾の確認）
                onCheckLatest={summary.unknown.length > 0 ? () => void checkUnknown() : data.reload}
                onDismiss={() => {
                  action.dismiss()
                  setLookupNotice(null)
                  searchRef.current?.focus()
                }}
              />
            </div>
          )}
          <p role="status" className="text-ui empty:hidden" data-testid="bulk-checked">
            {lookupNotice}
          </p>

          <div className="flex min-h-12 items-center" data-testid="customers-bar">
            {selection.hasSelection ? (
              <DataTableSelectionBar
                disabled={locked}
                selectedCount={selection.mode === "ids" ? (selection.count ?? 0) : 0}
                hiddenCount={selection.hiddenCount ?? 0}
                onClearSelection={selection.clear}
                selectAll={{
                  matchingCount: total ?? undefined,
                  pageAllSelected: selection.pageAllSelected,
                  allSelected: selection.allMatching,
                  excludedCount: selection.excludedIds.length,
                  onSelectAll: selection.selectAllMatching,
                }}
              >
                {running ? (
                  <BulkRunStatus action="停止" count={bulkCount ?? (action.running?.target.kind === "ids" ? action.running.target.ids.length : null)} progress={action.progress} />
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={locked || selection.mode !== "ids" || exportBlocked !== null}
                      focusableWhenDisabled
                      aria-describedby={exportBlocked ? reasonId(exportBlocked) : selection.mode !== "ids" ? "pi-all-selected-export" : undefined}
                      onClick={() => setExportOrigin("selection-bar")}
                      data-testid="customers-export-selected"
                    >
                      エクスポート
                    </Button>
                    {selection.mode !== "ids" && !exportBlocked && (
                      <span id="pi-all-selected-export" className="sr-only">
                        {allSelectedExport}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={locked || !edit.allowed}
                      focusableWhenDisabled
                      aria-describedby={reasonId(edit.reason)}
                      onClick={() => setConfirmOpen(true)}
                      data-testid="customers-pause-selected"
                    >
                      停止にする
                    </Button>
                  </>
                )}
              </DataTableSelectionBar>
            ) : (
              <p className="text-ui text-muted-foreground" aria-live="polite" data-testid="customers-count">
                {total === null ? "" : `${fmt(total)}件`}
              </p>
            )}
          </div>

          {data.refreshFailed && (
            <DataRegionError variant="warning" title="最新の一覧を取得できませんでした" description="前回取得した時点の一覧を表示しています。再試行するまで、変更の操作はできません。" onRetry={data.reload} />
          )}
          <TableScrollArea>
            <DataTable
              table={table}
              status={data.status === "idle" ? "loading" : data.status}
              locked={locked}
              filtered={browse.isFiltered}
              caption="顧客の一覧"
              loadingRowCount={q.pagination.pageSize}
              onRowOpen={(row) => setOpen({ scope, id: row.id })}
              activeRowId={openId}
              noResults={<DataTableMessage title="条件に一致する顧客はありません" action={<Button variant="outline" size="sm" onClick={browse.clearAll}>条件をリセット</Button>} />}
              error={
                <DataTableMessage
                  status="error"
                  title="顧客の一覧を取得できませんでした"
                  description="時間をおいて、もう一度お試しください。"
                  action={
                    <Button variant="outline" size="sm" onClick={data.reload}>
                      再試行
                    </Button>
                  }
                />
              }
            />
          </TableScrollArea>
          <DataTablePagination table={table} pageSizeOptions={[10, 20]} disabled={locked} />
        </div>
      </ProtectedContent>

      <Sheet mode="view" open={openRow !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent
          data-testid="customer-sheet"
          closeLabel="詳細を閉じる"
          finalFocus={() => root.current?.querySelector<HTMLElement>(`[data-row-id="${lastOpen.current}"] [data-slot=data-table-row-trigger]`) ?? true}
        >
          <SheetHeader>
            <SheetTitle>{openRow?.name ?? ""}</SheetTitle>
            <SheetDescription>{openRow ? `${openRow.region}・${planLabel(openRow.plan)}` : ""}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {openRow && (
              <Facts
                testId="sheet-facts"
                items={[
                  { label: "状態", value: statusLabel[openRow.status] },
                  { label: "月額", value: yen(openRow.mrr), testId: "sheet-mrr" },
                  { label: "メールアドレス", value: openRow.email },
                  { label: "電話番号", value: openRow.phone || "未登録" },
                ]}
              />
            )}
          </SheetBody>
          <SheetFooter>
            {openRow && (
              <>
                <Button variant="secondary" onClick={() => openPage(openRow.id)} data-testid="sheet-open-page">
                  詳細ページを開く
                </Button>
                {edit.allowed && (
                  <Button onClick={() => openEdit(openRow.id)} data-testid="sheet-edit">
                    編集
                  </Button>
                )}
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        progress="external"
        title={bulkCount === null ? "検索条件に一致する顧客をすべて停止にしますか？" : `${fmt(bulkCount)}件の顧客を停止にしますか？`}
        description="停止にした顧客は、月額の売上に含めません。実行の時点で、サーバーが対象と権限を確かめます。"
        confirmLabel={bulkCount === null ? "すべて停止にする" : `${fmt(bulkCount)}件を停止にする`}
        targetKey={bulkTarget ? keyOfTarget(bulkTarget) : undefined}
        data-testid="pause-confirm"
        finalFocus={() => root.current?.querySelector<HTMLElement>("[data-slot=bulk-run-status], [data-slot=bulk-result]") ?? searchRef.current ?? true}
        onConfirm={({ targetKey }) => {
          // 確かめた対象と、実行の時点の対象が一致し、操作を受け付けられる場合だけ実行する
          const target = selection.snapshot()
          if (keyOfTarget(target) !== targetKey || locked || running || !selection.hasSelection || !edit.allowed) {
            toast({ title: "停止にしていません", description: "一覧の状態が変わりました。選択と一覧を確かめてから、もう一度実行してください。" })
            return
          }
          setLookupNotice(null)
          void action.start("停止", target, { kind: "pause" })
        }}
      >
        {/* 対象の名前は、閲覧の権限を確かめている間だけ示す（確認中は確認の Dialog 自体も閉じる） */}
        {viewing && bulkTarget?.kind === "ids" && (
          <ul className="flex flex-col gap-1 text-ui" data-testid="pause-targets">
            {bulkTarget.ids.slice(0, 3).map((id) => (
              <li key={id}>{nameOf(id)}</li>
            ))}
            {bulkTarget.ids.length > 3 && <li className="text-muted-foreground">ほか {fmt(bulkTarget.ids.length - 3)}件</li>}
          </ul>
        )}
      </ConfirmActionDialog>

      {exportOrigin && (
        <ExportDialog
          open
          onOpenChange={(o) => {
            if (o) return
            setExportOrigin(null)
          }}
          origin={exportOrigin}
          kind="顧客"
          columns={exportColumns}
          counts={{ selected: selectedIds.length, page: rows.length, results: total, all: matchingIds(ws, "", defaultListFilters).length }}
          targetOf={(s) => (s === "selected" ? JSON.stringify([...selectedIds].sort()) : s === "page" ? JSON.stringify(rows.map((r) => r.id)) : s === "results" ? JSON.stringify([q.search, q.filters]) : `all:${ws}`)}
          getRows={async (s) => {
            // 実行の時点の範囲で、サーバーに出力を求める（サーバーがエクスポートの権限を確かめる）。選択がなくなった場合に、検索結果へ広げない
            if (!exporting.allowed) throw new Error("forbidden")
            const target =
              s === "selected"
                ? { ids: selection.mode === "ids" ? selection.selectedIds : [] }
                : s === "page"
                  ? { ids: rows.map((r) => r.id) }
                  : s === "results"
                    ? { search: q.search, filters: q.filters }
                    : { search: "", filters: defaultListFilters }
            return (await exportCustomers(ws, target)).map(rowFor)
          }}
        />
      )}
    </PageLayout>
  )
}
