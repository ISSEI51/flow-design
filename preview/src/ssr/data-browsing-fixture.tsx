import { useState } from "react"
import { useTable } from "@tanstack/react-table"
import { Kanban, Table2 } from "lucide-react"

import { DataTable, DataTableSearch, dataTableDefaults, dataTableFeatures } from "@/components/ui/data-table"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useBrowseData } from "@/patterns/browse-data"
import { useBrowseQuery } from "@/patterns/browse-query"
import { BulkResultAlert } from "@/patterns/bulk-actions"
import { useBulkSelection } from "@/patterns/bulk-selection"
import { DataRefreshIndicator, DataRegionError, DataValue, LoadingReveal } from "@/patterns/data-states"
import { TableScrollArea } from "@/patterns/table-scroll-area"
import { ViewSwitcher, ViewSwitcherMenu } from "@/patterns/view-switcher"

import { customers } from "../data/data-display/customers"
import { companyColumns } from "../pages/data-browsing/company-parts"

// Data Browsing の Patterns の SSR と Hydration の検品用の画面。
// サーバーで描画するときは window と document がない。描画の結果は、サーバーとブラウザで同じでなければならない。
// データの取得は、サーバーでは行わない（効果の中で行う）。最初の描画は「初回の読み込み」になる。

const columns = companyColumns({ selectable: true })
const rows = customers.slice(0, 5)

export function DataBrowsingSsrFixture() {
  const [view, setView] = useState<"table" | "kanban">("table")
  const browse = useBrowseQuery({ defaultFilters: {}, debounceMs: 0, defaultPageSize: 5 })
  const data = useBrowseData({
    query: browse.query,
    fetcher: () => new Promise<typeof rows>((resolve) => setTimeout(() => resolve(rows), 50)),
  })
  const shown = data.data ?? []
  const selection = useBulkSelection({ queryKey: browse.query.search, query: browse.query, visibleIds: shown.map((r) => r.id), total: 5 })
  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns,
    data: shown,
    getRowId: (r) => r.id,
    state: { sorting: browse.query.sorting, pagination: browse.query.pagination, rowSelection: selection.rowSelection },
    onSortingChange: browse.onSortingChange,
    onPaginationChange: browse.onPaginationChange,
    onRowSelectionChange: selection.onRowSelectionChange,
  })
  return (
    <TooltipProvider>
      <main className="flex flex-col gap-6 p-6" data-testid="ssr-browsing">
        <h1 className="text-page-title">顧客</h1>
        <DataTableSearch placeholder="会社名で検索" value={browse.searchInput} onValueChange={browse.setSearchInput} />
        <div className="flex items-center justify-between gap-4">
          <p data-testid="ssr-status">{data.status}</p>
          <DataRefreshIndicator active={data.status === "refreshing"} />
          <ViewSwitcher
            value={view}
            onValueChange={setView}
            options={[
              { value: "table", label: "表", icon: <Table2 /> },
              { value: "kanban", label: "カンバン", icon: <Kanban /> },
            ]}
          />
        </div>
        <ViewSwitcherMenu
          value={view}
          onValueChange={setView}
          options={[
            { value: "table", label: "表" },
            { value: "kanban", label: "カンバン" },
          ]}
        />
        <LoadingReveal loading={data.status === "loading"}>
          <TableScrollArea>
            <DataTable table={table} caption="顧客の一覧" status={data.status === "idle" ? "loading" : data.status} loadingRowCount={5} />
          </TableScrollArea>
        </LoadingReveal>
        <p data-testid="ssr-selected">{selection.count}件を選択中</p>
        <dl>
          <dt>月額</dt>
          <dd>
            <DataValue value={{ status: "ready", value: 0 }} format={(n) => `${n}円`} />
          </dd>
          <dt>更新日</dt>
          <dd>
            <DataValue value={{ status: "ready", value: null }} emptyLabel="未定" />
          </dd>
          <dt>売上</dt>
          <dd>
            <DataValue value={{ status: "unavailable" }} />
          </dd>
        </dl>
        <DataRegionError title="取引の履歴を取得できませんでした" onRetry={() => undefined} />
        <BulkResultAlert
          summary={{
            action: "担当者の変更",
            target: { kind: "ids", ids: ["C-00001", "C-00003"] },
            payload: null,
            succeeded: [{ id: "C-00001", outcome: "succeeded" }],
            failed: [{ id: "C-00003", outcome: "failed", message: "権限がありません", retryable: false }],
            unknown: [],
            requestError: null,
            integrity: { missing: 0, duplicates: 0, unexpected: 0, invalid: 0, confirmedCount: 2, unreported: null, overReported: 0, unexpectedIds: [], expectedCount: 2, countChanged: false, reconciled: true, complete: true },
          }}
          onDismiss={() => undefined}
        />
      </main>
    </TooltipProvider>
  )
}
