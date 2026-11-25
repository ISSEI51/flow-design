import { createColumnHelper, useTable } from "@tanstack/react-table"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, chartAnimation, chartStyles, type ChartConfig } from "@/components/ui/chart"
import {
  DataTable,
  DataTableColumnHeader,
  DataTablePageCheckbox,
  DataTablePagination,
  DataTableRowCheckbox,
  DataTableSearch,
  dataTableDefaults,
  dataTableFeatures,
  type DataTableFeatures,
} from "@/components/ui/data-table"
import { CursorPagination, PaginationControls } from "@/components/ui/pagination"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableNoValue, TableRow } from "@/components/ui/table"

// Data Display の SSR と Hydration の検品用の画面（preview/tests/data-display.spec.ts）。
// window や document を描画中に参照すると、サーバーでの描画で失敗する。

type Row = { id: string; name: string; amount: number | null }
const rows: Row[] = [
  { id: "a", name: "青葉製作所", amount: 120000 },
  { id: "b", name: "朝日商事", amount: null },
  { id: "c", name: "Northwind Labs", amount: 0 },
]
const helper = createColumnHelper<DataTableFeatures, Row>()
const columns = helper.columns([
  helper.display({
    id: "select",
    header: ({ table }) => <DataTablePageCheckbox table={table} />,
    cell: ({ row }) => <DataTableRowCheckbox row={row} label={`${row.original.name}を選択`} />,
    enableSorting: false,
  }),
  helper.accessor("name", { header: ({ column }) => <DataTableColumnHeader column={column} />, meta: { label: "会社名" } }),
  helper.accessor("amount", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ getValue }) => (getValue() === null ? <TableNoValue /> : `${getValue()!.toLocaleString("ja-JP")}円`),
    meta: { label: "月額", align: "right" },
  }),
])
const config = { amount: { label: "月額", color: "var(--chart-1)" } } satisfies ChartConfig
const noop = () => {}

export function DataDisplaySsrFixture() {
  const table = useTable({ ...dataTableDefaults, features: dataTableFeatures, columns, data: rows, getRowId: (r) => r.id })
  return (
    <main>
      <Table variant="striped" density="compact" bordered>
        <TableHeader>
          <TableRow>
            <TableHead>会社名</TableHead>
            <TableHead align="right">月額</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.name}</TableCell>
              <TableCell align="right">{r.amount === null ? <TableNoValue /> : r.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <DataTableSearch value="" onValueChange={noop} placeholder="会社名で検索" />
      <DataTable table={table} caption="顧客" />
      <DataTablePagination table={table} />
      <PaginationControls page={3} pageSize={50} totalCount={5800} onPageChange={noop} onPageSizeChange={noop} />
      <CursorPagination hasPrevious={false} hasNext onPrevious={noop} onNext={noop} shownCount={25} />
      <ChartContainer config={config} aria-label="月額" className="aspect-auto h-48 w-full">
        <BarChart data={rows}>
          <CartesianGrid {...chartStyles.grid} />
          <XAxis dataKey="name" {...chartStyles.axis} />
          <YAxis {...chartStyles.axis} />
          <Bar dataKey="amount" fill="var(--color-amount)" radius={4} {...chartAnimation} />
        </BarChart>
      </ChartContainer>
    </main>
  )
}
