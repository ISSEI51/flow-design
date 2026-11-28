import { useEffect, useMemo, useRef, useState } from "react"
import { createColumnHelper, useTable } from "@tanstack/react-table"
import { ChevronDown, Ellipsis } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DataTable,
  DataTableMessage,
  DataTablePageCheckbox,
  DataTablePagination,
  DataTableRowCheckbox,
  DataTableSearch,
  DataTableSelectionBar,
  dataTableDefaults,
  dataTableFeatures,
  type DataTableFeatures,
} from "@/components/ui/data-table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/toast"
import { useAppShell } from "@/patterns/app-shell"
import { useBrowseData } from "@/patterns/browse-data"
import { useBrowseQuery, type BrowseQuery } from "@/patterns/browse-query"
import { BulkResultAlert, BulkRunStatus } from "@/patterns/bulk-actions"
import { BulkRequestError, isBulkFullySucceeded, useBulkAction, useBulkSelection, type BulkTarget } from "@/patterns/bulk-selection"
import { ConfirmActionDialog, useUndoableAction } from "@/patterns/confirm-action"
import { escapeCsvCell, exportFileName } from "@/patterns/export"
import { captureListPosition, useListPositionRestore, type ListPosition } from "@/patterns/list-detail"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderTitle } from "@/patterns/page-header"
import { TableScrollArea } from "@/patterns/table-scroll-area"

import {
  archiveCustomer,
  customerName,
  deleteCustomer,
  deleteCustomers,
  fetchCustomerPage,
  formsServer,
  listCustomers,
  planLabel,
  restoreCustomer,
  type Customer,
} from "../../data/forms-workflows/server"
import { ExportDialog, type ExportColumn } from "./export-dialog"
import { formsHref } from "./forms-router"
import { downloadText } from "./import-wizard"
import type { Nav } from "./forms-screens"

// 顧客の一覧（Data Browsing の Registry と Forms & Workflows の組み合わせ。製品側のコードの例）。
// - 一覧：useBrowseQuery（検索、ページ）、useBrowseData（取得、scopeKey）、Data Table。
// - 変更の操作（編集、アーカイブ、削除、一括の操作）は、canOperate（最新の取得に成功した）の間だけ受け付ける。
// - 一括の削除：useBulkSelection と useBulkAction（Data Browsing v0.1）。確認は ConfirmActionDialog の progress="external"
//   （実行を始めた時点で閉じ、進捗と結果は一覧の上に示す）。確認の表示中に対象が変わったら、確かめ直させる。
// - 編集へ移る前に、一覧の条件、データ、位置を記録し、戻ったときに復元する（captureListPosition、useListPositionRestore）。
// - エクスポート：表の右上から検索結果（直接のダウンロードと、項目を選ぶ Dialog）、一括操作のバーから選んだ行。

type Snapshot = { ws: string; token: string; query: BrowseQuery<Record<string, never>>; position: ListPosition; page: { data: Page; key: string } | null }
type Page = Awaited<ReturnType<typeof fetchCustomerPage>>

// 一覧の記録（この画面のメモリだけ。製品は履歴の項目ごとに保存する）。一覧から編集や詳細へ移るときに記録し、
// 一覧に戻ったとき（保存、キャンセル、ブラウザの戻る）に 1 回だけ使う。
// 使うのは、編集から一覧に戻る URL（restore=1）か、記録した履歴の項目（history.state の印）に戻った場合だけ。
// Sidebar などから一覧を新しく開いた場合は、前の条件と位置を復元しない
let snapshot: Snapshot | null = null
let snapshotSeq = 0
const markOf = (state: unknown) => ((state ?? {}) as { fdListSnapshot?: string }).fdListSnapshot
export const hasListSnapshot = (ws: string, params: URLSearchParams) =>
  snapshot !== null && snapshot.ws === ws && (params.get("restore") === "1" || markOf(window.history.state) === snapshot.token)
function takeListSnapshot(ws: string) {
  const s = snapshot && snapshot.ws === ws ? snapshot : null
  snapshot = null
  return s
}

const helper = createColumnHelper<DataTableFeatures, Customer>()
const exportColumns: ExportColumn[] = [
  { id: "code", label: "顧客コード", visible: true },
  { id: "name", label: "名前", visible: true },
  { id: "email", label: "メールアドレス", visible: true },
  { id: "plan", label: "プラン", visible: true },
  // 個人情報を含む列。選んだ場合は、ダウンロードの前に確かめる
  { id: "phone", label: "電話番号", visible: false, sensitive: true },
  { id: "address", label: "住所", visible: false, sensitive: true },
]
const rowFor = (c: Customer) => ({ code: c.code, name: customerName(c), email: c.email, plan: planLabel(c.plan), phone: c.phone, address: c.address })
const fmt = (n: number) => n.toLocaleString("ja-JP")

declare global {
  interface Window {
    __fdFormsChangeWhileConfirm?: boolean
    __fdFormsClearSelection?: () => void
    __fdFormsSetSelected?: (id: string, selected: boolean) => void
  }
}

export function CustomersScreen({ nav, ws, restore }: { nav: Nav; ws: string; restore: boolean }) {
  const { toast } = useToast()
  const undo = useUndoableAction({ scopeKey: ws })
  const { mainRef } = useAppShell()
  const root = useRef<HTMLDivElement>(null)
  const [initial] = useState(() => (restore ? takeListSnapshot(ws) : null))
  // 検証用：一括操作のバーの選択を、ほかの処理が解除したことを再現する（エクスポートの範囲が広がらないことの検品）
  useEffect(() => {
    window.__fdFormsClearSelection = () => selection.clear()
    // 検証用：確認の表示中に、選んだ行がほかの処理で入れ替わったことを再現する
    window.__fdFormsSetSelected = (id, selected) => selection.setSelected(id, selected)
    return () => {
      delete window.__fdFormsClearSelection
      delete window.__fdFormsSetSelected
    }
  })
  const browse = useBrowseQuery<Record<string, never>>({
    defaultFilters: {},
    initialQuery: initial?.query ?? { pagination: { pageIndex: 0, pageSize: 5 } },
    debounceMs: 300,
    defaultPageSize: 5,
  })
  const q = browse.query
  const data = useBrowseData({
    query: q,
    scopeKey: ws,
    initialData: initial?.page ?? undefined,
    // 要求の宛先は、取得を始めた時点のワークスペース（描画の後に変わっても、別のワークスペースの結果を混ぜない）
    fetcher: (query, { signal }) => {
      if (formsServer.listMode === "fail") return Promise.reject(new Error("一覧を取得できませんでした"))
      return fetchCustomerPage(ws, { search: query.search, pageIndex: query.pagination.pageIndex, pageSize: query.pagination.pageSize }, { signal })
    },
  })
  const page = data.data
  const rows = useMemo(() => page?.rows ?? [], [page])
  const total = data.isCurrent ? (page?.total ?? null) : null
  const locked = !data.canOperate
  const names = useRef(new Map<string, string>())
  for (const r of rows) names.current.set(r.id, customerName(r))
  const nameOf = (id: string) => names.current.get(id) ?? id

  const selection = useBulkSelection({ queryKey: q.search, query: q, scopeKey: ws, visibleIds: rows.map((r) => r.id), total })
  const action = useBulkAction<typeof q, { kind: "delete" }>({
    scopeKey: ws,
    run: async (target) => {
      // 全件の選択は、実行の時点の条件でサーバーが対象を確定する（確定した件数を返す）
      const scope = target.scope ?? ws
      if (target.kind === "ids") return deleteCustomers(target.ids, scope)
      const ids = listCustomers(false, scope)
        .filter((c) => !target.query.search || `${c.code} ${customerName(c)} ${c.email}`.includes(target.query.search))
        .map((c) => c.id)
        .filter((id) => !target.excludedIds.includes(id))
      if (!ids.length) throw new BulkRequestError("削除する顧客がありません", "failed")
      return { items: await deleteCustomers(ids, scope), confirmedCount: ids.length }
    },
    onSettled: (summary) => {
      selection.settle(summary)
      data.reload()
      if (isBulkFullySucceeded(summary)) toast({ variant: "success", title: `${fmt(summary.succeeded.length)}件の顧客を削除しました` })
    },
  })

  // ---------------------------------------------------------------- 確認（一括の削除、単一の削除）
  const [confirm, setConfirm] = useState<null | { kind: "bulk" } | { kind: "one"; id: string; name: string }>(null)
  const bulkTarget: BulkTarget<typeof q> | null = confirm?.kind === "bulk" ? selection.snapshot() : null
  const bulkCount = bulkTarget ? (bulkTarget.kind === "ids" ? bulkTarget.ids.length : bulkTarget.expectedCount) : null
  // 対象のキー：ID の一覧（件数が同じでも ID が違えば変わる）、全件の選択は条件と除外した ID
  const bulkKey = bulkTarget ? JSON.stringify(bulkTarget.kind === "ids" ? [...bulkTarget.ids].sort() : [bulkTarget.queryKey, bulkTarget.excludedIds]) : undefined
  // 検証用：確認の表示中に、ほかの利用者が対象の 1 件を削除する（選択から外れ、対象が変わる）
  useEffect(() => {
    if (confirm?.kind !== "bulk" || !window.__fdFormsChangeWhileConfirm) return
    const t = window.setTimeout(() => {
      const first = selection.snapshot()
      if (first.kind !== "ids" || first.ids.length < 2) return
      selection.onRowSelectionChange((sel) => {
        const next = { ...sel }
        delete next[first.ids[0]]
        return next
      })
    }, 1500)
    return () => window.clearTimeout(t)
    // 開いたときだけ
  }, [confirm?.kind])

  // ---------------------------------------------------------------- 一覧の位置
  const saveSnapshot = (rowId: string | null) => {
    const token = `list-${++snapshotSeq}`
    // 一覧の履歴の項目に印を付ける（ブラウザの戻るでこの項目に戻ったときだけ復元する）
    window.history.replaceState({ ...(window.history.state ?? {}), fdListSnapshot: token }, "")
    snapshot = {
      ws,
      token,
      query: q,
      position: captureListPosition({ scrollElement: mainRef.current, root: root.current, rowId }),
      page: data.isCurrent && page && data.dataKey ? { data: page, key: data.dataKey } : null,
    }
  }
  useListPositionRestore({ position: initial?.position ?? null, ready: data.isCurrent, root, scrollElement: mainRef })

  const openEdit = (c: Customer) => {
    saveSnapshot(c.id)
    nav.navigate(formsHref("customer-edit", { id: c.id, from: "list", ws }))
  }

  const archive = (c: Customer) =>
    void undo
      .run({
        perform: () => archiveCustomer(c.id, ws),
        // 取り消しの対象は、実行の結果（ID とワークスペース）で固定する
        undo: async (r) => {
          await restoreCustomer(r.id, r.ws)
          data.reload()
        },
        title: `${customerName(c)}をアーカイブしました`,
        undoneTitle: `${customerName(c)}を元に戻しました`,
        expiredDescription: "アーカイブ済みの顧客の一覧から戻せます",
      })
      .then(() => data.reload())

  // ---------------------------------------------------------------- エクスポート
  const [exportOrigin, setExportOrigin] = useState<"table" | "selection-bar" | null>(null)
  const searchRows = () =>
    listCustomers(false, ws).filter((c) => !q.search || `${c.code} ${customerName(c)} ${c.email}`.includes(q.search))
  // 対象と形式が明確で、個人情報を含まない出力は、確認を挟まずにダウンロードする
  const downloadDirect = () => {
    const visible = exportColumns.filter((c) => c.visible)
    const lines = [visible.map((c) => escapeCsvCell(c.label)).join(","), ...searchRows().map((c) => visible.map((col) => escapeCsvCell(rowFor(c)[col.id as keyof ReturnType<typeof rowFor>])).join(","))]
    downloadText(exportFileName({ kind: "顧客", scope: "検索結果", date: new Date(), extension: "csv" }), lines.join("\r\n"), { bom: true })
  }
  const selectedIds = selection.mode === "ids" ? Object.keys(selection.rowSelection) : []

  // ---------------------------------------------------------------- 表
  const columns = useMemo(
    () =>
      helper.columns([
      helper.display({
        id: "select",
        header: ({ table }) => <DataTablePageCheckbox table={table} />,
        cell: ({ row }) => <DataTableRowCheckbox row={row} label={`${customerName(row.original)}を選択`} />,
        size: 48,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      }),
      helper.accessor("code", { header: "顧客コード", meta: { label: "顧客コード", cellClassName: "tabular-nums whitespace-nowrap" }, size: 120, enableSorting: false }),
      helper.display({
        id: "name",
        header: "名前",
        meta: { label: "名前" },
        size: 220,
        cell: ({ row }) => (
          <a
            href={formsHref("customer", { id: row.original.id, ws })}
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
              e.preventDefault()
              saveSnapshot(row.original.id)
              nav.navigate(formsHref("customer", { id: row.original.id, ws }))
            }}
            data-row-focus=""
            className="font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring"
          >
            {customerName(row.original)}
          </a>
        ),
      }),
      helper.accessor("email", { header: "メールアドレス", meta: { label: "メールアドレス" }, size: 220, enableSorting: false }),
      helper.accessor((r) => planLabel(r.plan), { id: "plan", header: "プラン", meta: { label: "プラン" }, size: 200, enableSorting: false }),
      helper.display({
        id: "actions",
        header: () => <span className="sr-only">操作</span>,
        size: 64,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={`${customerName(row.original)}の操作`} disabled={locked} data-testid={`row-actions-${row.original.id}`} />}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEdit(row.original)}>編集</DropdownMenuItem>
              <DropdownMenuItem onClick={() => archive(row.original)}>アーカイブ</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirm({ kind: "one", id: row.original.id, name: customerName(row.original) })}>
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }),
      ]),
    // nav と ws と locked の変化で作り直す
    [nav, ws, locked]
  )
  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns,
    data: rows,
    getRowId: (r) => r.id,
    state: { pagination: q.pagination, rowSelection: selection.rowSelection },
    onPaginationChange: browse.onPaginationChange,
    onRowSelectionChange: selection.onRowSelectionChange,
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    rowCount: total ?? undefined,
    autoResetPageIndex: false,
  })

  const running = action.running !== null
  return (
    <PageLayout width="full" data-testid="forms-customers">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客</PageHeaderTitle>
        </PageHeaderContent>
        <PageHeaderActions>
          <a {...nav.linkProps(formsHref("import", { ws }))} className="inline-flex min-h-control items-center rounded-lg px-5 text-ui font-medium outline-none hover:bg-accent focus-visible:focus-ring">
            CSV から取り込む
          </a>
          <Button onClick={() => nav.navigate(formsHref("customer-new", { ws }))} data-testid="customers-new">
            顧客を登録
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div ref={root} className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DataTableSearch
            className="sm:max-w-80"
            placeholder="コード、名前、メールアドレスで検索"
            value={browse.searchInput}
            onValueChange={browse.setSearchInput}
            data-testid="customers-search"
          />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="secondary" disabled={locked} data-testid="customers-export" />}>
              エクスポート
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={downloadDirect} data-testid="customers-export-direct">
                {total === null ? "検索結果を CSV でダウンロード" : `検索結果の ${fmt(total)}件を CSV でダウンロード`}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExportOrigin("table")}>項目を選んでエクスポート…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {action.summary && !isBulkFullySucceeded(action.summary) && (
          <BulkResultAlert summary={action.summary} getItemLabel={nameOf} onCheckLatest={data.reload} onDismiss={action.dismiss} />
        )}

        <div className="flex min-h-12 items-center" data-testid="customers-bar">
          {selection.hasSelection ? (
            <DataTableSelectionBar
              disabled={locked}
              disabledReason={data.refreshFailed ? "再取得するまで操作できません" : undefined}
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
                <BulkRunStatus action="削除" count={bulkCount} progress={action.progress} />
              ) : (
                <>
                  <Button size="sm" variant="secondary" disabled={locked || selection.mode !== "ids"} onClick={() => setExportOrigin("selection-bar")} data-testid="customers-export-selected">
                    エクスポート
                  </Button>
                  <Button size="sm" variant="secondary" className="text-destructive" disabled={locked} onClick={() => setConfirm({ kind: "bulk" })} data-testid="customers-delete-selected">
                    削除
                  </Button>
                </>
              )}
            </DataTableSelectionBar>
          ) : (
            <p className="text-ui text-muted-foreground" aria-live="polite">
              {total === null ? "" : `${fmt(total)}件`}
            </p>
          )}
        </div>

        <TableScrollArea>
          <DataTable
            table={table}
            layout="fixed"
            status={data.status === "idle" ? "loading" : data.status}
            locked={locked}
            filtered={browse.isFiltered}
            caption="顧客の一覧"
            loadingRowCount={q.pagination.pageSize}
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
        <DataTablePagination table={table} pageSizeOptions={[5, 20]} disabled={locked} />
        {data.refreshFailed && (
          <p role="alert" className="text-ui text-destructive">
            一覧を最新にできませんでした。再取得するまで、変更の操作はできません。
            <Button variant="link" className="ml-2 h-auto min-h-0 p-0" onClick={data.reload}>
              再取得
            </Button>
          </p>
        )}
        <a {...nav.linkProps(formsHref("archived", { ws }))} className="inline-flex min-h-10 w-fit items-center text-ui underline underline-offset-4 outline-none focus-visible:focus-ring">
          アーカイブ済みの顧客（{listCustomers(true, ws).length}件）
        </a>
      </div>

      <ConfirmActionDialog
        open={confirm?.kind === "bulk"}
        onOpenChange={(o) => !o && setConfirm(null)}
        variant="destructive"
        progress="external"
        title={bulkCount === null ? "検索条件に一致する顧客をすべて削除しますか？" : `${fmt(bulkCount)}件の顧客を削除しますか？`}
        description="削除した顧客は元に戻せません。契約と請求の履歴も表示できなくなります。実行の時点で、サーバーが対象と権限を確かめます。"
        confirmLabel={bulkCount === null ? "すべて削除" : `${fmt(bulkCount)}件を削除`}
        targetKey={bulkKey}
        data-testid="customers-delete-dialog"
        onConfirm={() => {
          // 確かめた対象（確認の表示と同じ選択）で実行する
          void action.start("削除", selection.snapshot(), { kind: "delete" })
        }}
      >
        {bulkTarget?.kind === "ids" && (
          <ul className="flex flex-col gap-1 text-ui" data-testid="customers-delete-targets">
            {bulkTarget.ids.slice(0, 3).map((id) => (
              <li key={id}>{nameOf(id)}</li>
            ))}
            {bulkTarget.ids.length > 3 && <li className="text-muted-foreground">ほか {fmt(bulkTarget.ids.length - 3)}件</li>}
          </ul>
        )}
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={confirm?.kind === "one"}
        onOpenChange={(o) => !o && setConfirm(null)}
        variant="destructive"
        title={confirm?.kind === "one" ? `「${confirm.name}」を削除しますか？` : ""}
        description="削除した顧客は元に戻せません。契約と請求の履歴も表示できなくなります。"
        confirmLabel="顧客を削除"
        targetKey={confirm?.kind === "one" ? confirm.id : undefined}
        data-testid="customers-delete-one"
        onConfirm={async ({ targetKey }) => {
          // 確かめた対象（表示していた ID）とワークスペースで実行する
          await deleteCustomer(targetKey!, ws)
          data.reload()
          toast({ variant: "success", title: "顧客を削除しました" })
        }}
      />

      {exportOrigin && (
        <ExportDialog
          open
          onOpenChange={(o) => !o && setExportOrigin(null)}
          origin={exportOrigin}
          kind="顧客"
          columns={exportColumns}
          counts={{ selected: selectedIds.length, page: rows.length, results: total, all: listCustomers(false, ws).length + listCustomers(true, ws).length }}
          // 個人情報の確認の対象に、範囲の中身を含める（選んだ行の ID、検索の条件、表示中のページの ID）
          targetOf={(scope) =>
            scope === "selected"
              ? JSON.stringify([...selectedIds].sort())
              : scope === "page"
                ? JSON.stringify(rows.map((r) => r.id))
                : scope === "results"
                  ? JSON.stringify(q.search)
                  : `all:${ws}`
          }
          getRows={async (scope) => {
            if (scope === "selected") {
              // 実行の時点の選択で出す。選択がなくなった場合に、検索結果へ広げない
              const ids = selection.mode === "ids" ? Object.keys(selection.rowSelection) : []
              return listCustomers(false, ws).filter((c) => ids.includes(c.id)).map(rowFor)
            }
            if (scope === "page") return rows.map(rowFor)
            if (scope === "all") return [...listCustomers(false, ws), ...listCustomers(true, ws)].map(rowFor)
            return searchRows().map(rowFor)
          }}
        />
      )}
    </PageLayout>
  )
}
