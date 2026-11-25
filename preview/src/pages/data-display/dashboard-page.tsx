import { useMemo, useState } from "react"
import { createColumnHelper, useTable, type SortingState } from "@tanstack/react-table"

import { buttonVariants } from "@/components/ui/button"
import { DataTable, DataTableColumnHeader, DataTablePagination, dataTableDefaults, dataTableFeatures, type DataTableFeatures } from "@/components/ui/data-table"
import { TableNoValue } from "@/components/ui/table"

import { customers, formatDate, formatYen, type Customer } from "../../data/data-display/customers"
import { contractChangeByRegion, monthlyRevenue, newContractsByRegion } from "../../data/data-display/metrics"
import { RegionBarChart, RevenueLineChart } from "./charts"
import { StatusText } from "./customer-parts"

// 業務ダッシュボードの例。カードで囲まず、余白と文字の階層で区切る（Navigation & Layout の方針）。
// 理解する順：全体の数値 → 推移と内訳 → 次に対応する顧客の一覧。

const TODAY = "2026-11-25"
const in30 = "2026-12-25"
const renewals = customers
  .filter((c) => c.status !== "cancelled" && c.renewalDate && c.renewalDate >= TODAY && c.renewalDate <= in30)
  .map((c) => ({ ...c }))

const helper = createColumnHelper<DataTableFeatures, Customer>()
const columns = helper.columns([
  helper.accessor("company", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    meta: { label: "会社名" },
    sortFn: "text",
  }),
  helper.accessor("status", {
    header: "契約状況",
    cell: ({ getValue }) => <StatusText status={getValue()} />,
    enableSorting: false,
  }),
  helper.accessor("owner", { header: "担当者", enableSorting: false, meta: { cellClassName: "whitespace-nowrap" } }),
  helper.accessor("monthlyFee", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ getValue }) => {
      const v = getValue()
      return v === null ? <TableNoValue label="未設定" /> : formatYen(v)
    },
    meta: { label: "月額", align: "right", cellClassName: "whitespace-nowrap" },
    sortDescFirst: true,
    sortFn: "basic",
    sortUndefined: "last",
  }),
  helper.accessor((c) => (c.renewalDate ? new Date(c.renewalDate) : undefined), {
    id: "renewalDate",
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => formatDate(row.original.renewalDate!),
    meta: { label: "更新日", cellClassName: "whitespace-nowrap tabular-nums" },
    sortDescFirst: false,
    sortFn: "datetime",
  }),
])

const last = monthlyRevenue.filter((m) => m.actual !== null)
const thisMonth = last[last.length - 1].actual!
const prevMonth = last[last.length - 2].actual!
const mom = ((thisMonth - prevMonth) / prevMonth) * 100
const active = customers.filter((c) => c.status === "active").length
const trial = customers.filter((c) => c.status === "trial").length
// 新規契約は地域別の棒グラフと同じ集計（2026 年 10 月）から求める。
const newTotal = newContractsByRegion.reduce((s, d) => s + d.count, 0)
const changeTotal = contractChangeByRegion.reduce((s, d) => s + d.change, 0)

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ui text-muted-foreground">{label}</dt>
      {/* 狭い画面では 2 列に並べるため、数値と単位が折り返さない大きさにする。 */}
      <dd className="mt-2 text-section whitespace-nowrap tabular-nums sm:text-metric">{value}</dd>
      <dd className="mt-1 text-ui text-muted-foreground">{note}</dd>
    </div>
  )
}

export function DashboardPage() {
  const [sorting, setSorting] = useState<SortingState>([{ id: "renewalDate", desc: false }])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 })
  const data = useMemo(() => renewals, [])
  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns,
    data,
    getRowId: (r) => r.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  })

  return (
    <article data-testid="dashboard">
      <header className="mb-12">
        <p className="text-caption text-muted-foreground">Patterns</p>
        <h1 className="mt-2 text-page-title">営業の状況</h1>
        <p className="mt-4 text-body text-muted-foreground">2026 年 11 月 25 日時点。金額は税抜き。</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
        <Metric label="今月の売上" value={`${thisMonth.toLocaleString("ja-JP")}万円`} note={`前月比 ${mom >= 0 ? "+" : "−"}${Math.abs(mom).toFixed(1)}%`} />
        <Metric label="契約中の顧客" value={`${active}件`} note={`試用中 ${trial}件`} />
        <Metric label="30 日以内に更新" value={`${renewals.length}件`} note="12 月 25 日まで" />
        <Metric label="10 月の新規契約" value={`${newTotal}件`} note={`前年同月 ${newTotal - changeTotal}件`} />
      </dl>

      <section className="mt-16 grid gap-16 border-t border-border pt-12 lg:grid-cols-2 lg:gap-12" aria-label="推移と内訳">
        <RevenueLineChart testId="dashboard-line" />
        <RegionBarChart highlight="関東" testId="dashboard-bar" />
      </section>

      <section className="mt-16 border-t border-border pt-12" aria-labelledby="renewal-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="renewal-title" className="text-section">
              更新が近い顧客
            </h2>
            <p className="mt-2 text-ui text-muted-foreground">更新日が 12 月 25 日までの {renewals.length}件。担当者が更新の意向を確認する。</p>
          </div>
          <a href="#/data-table" className={buttonVariants({ variant: "outline", size: "sm" })}>
            顧客の一覧を開く
          </a>
        </div>
        <div className="mt-6">
          <DataTable table={table} density="compact" caption="更新が近い顧客" />
        </div>
        <DataTablePagination table={table} className="mt-6" />
      </section>
    </article>
  )
}
