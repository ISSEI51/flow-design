import { useState } from "react"
import { createColumnHelper, useTable, type RowSelectionState } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import {
  DataTable,
  DataTableMessage,
  DataTablePageCheckbox,
  DataTableRefreshing,
  DataTableRowCheckbox,
  DataTableRowTrigger,
  dataTableDefaults,
  dataTableFeatures,
  type DataTableFeatures,
  type DataTableStatus,
} from "@/components/ui/data-table"
import { TableNoValue } from "@/components/ui/table"

import { customers, formatYen, type Customer } from "../../data/data-display/customers"
import { PageHeader } from "../../layout/page-header"
import { Row, Section } from "../../layout/section"
import { CustomerTable } from "./customer-table"
import { StatusText } from "./customer-parts"

const helper = createColumnHelper<DataTableFeatures, Customer>()

// 行の選択の検品用。選択の列と会社名の列を固定し、狭い幅で横にスクロールさせる。4 行目は選択できない（disabled）。
const selectionColumns = helper.columns([
  helper.display({
    id: "select",
    header: ({ table }) => <DataTablePageCheckbox table={table} />,
    cell: ({ row }) => <DataTableRowCheckbox row={row} label={`${row.original.company}を選択`} />,
    size: 48,
    enableResizing: false,
  }),
  helper.accessor("company", {
    header: "会社名",
    cell: ({ row, getValue }) => <DataTableRowTrigger row={row}>{getValue()}</DataTableRowTrigger>,
    meta: { label: "会社名" },
    size: 200,
  }),
  helper.accessor("owner", { header: "担当者", size: 140, meta: { cellClassName: "whitespace-nowrap" } }),
  helper.accessor("region", { header: "地域", size: 120, meta: { cellClassName: "whitespace-nowrap" } }),
  helper.accessor("seats", { header: "利用者数", size: 120, meta: { align: "right" }, cell: ({ getValue }) => `${getValue()}人` }),
])
const selectionRows = customers.slice(20, 26)
const selectionPinning = { start: ["select", "company"], end: [] }

function SelectionDensityDemo({ density }: { density: "compact" | "default" | "comfortable" }) {
  const [opened, setOpened] = useState<string | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns: selectionColumns,
    data: selectionRows,
    getRowId: (r) => r.id,
    enableRowSelection: (row) => row.index !== 3,
    state: { rowSelection, columnPinning: selectionPinning },
    onRowSelectionChange: setRowSelection,
  })
  return (
    <div data-testid={`density-${density}`} className="w-full max-w-md">
      <DataTable
        table={table}
        density={density}
        layout="fixed"
        caption={`行の選択（${density}）`}
        onRowOpen={(row) => setOpened(row.original.company)}
        activeRowId={null}
      />
      <p className="mt-2 text-caption text-muted-foreground" data-testid={`density-${density}-state`}>
        選択：{Object.keys(rowSelection).length}件 / 詳細：{opened ?? "なし"}
      </p>
    </div>
  )
}
const stateColumns = helper.columns([
  helper.accessor("company", { header: "会社名", meta: { label: "会社名" } }),
  helper.accessor("status", { header: "契約状況", cell: ({ getValue }) => <StatusText status={getValue()} /> }),
  helper.accessor("monthlyFee", {
    header: "月額",
    meta: { align: "right" },
    cell: ({ getValue }) => {
      const v = getValue()
      return v === null ? <TableNoValue label="未設定" /> : formatYen(v)
    },
  }),
])
const sample = customers.slice(0, 3)
const none: Customer[] = []

type DemoState = "loading" | "empty" | "no-results" | "error" | "refreshing"

const stateInfo: Record<DemoState, { title: string; note: string }> = {
  loading: { title: "読み込み中", note: "初めての読み込み。行の形の表示で、表の位置と大きさを先に示す" },
  empty: { title: "データ未登録", note: "1 件も登録されていない。最初の登録を促す" },
  "no-results": { title: "検索結果なし", note: "条件に一致しない。条件の変更と解除を促す" },
  error: { title: "取得失敗", note: "0 件として表示しない。原因と再試行の手段を示す" },
  refreshing: { title: "再取得中", note: "表示中のデータを残し、更新していることだけを示す" },
}

function StateDemo({ state }: { state: DemoState }) {
  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns: stateColumns,
    data: state === "refreshing" ? sample : none,
    getRowId: (r) => r.id,
  })
  const status: DataTableStatus = state === "loading" ? "loading" : state === "error" ? "error" : state === "refreshing" ? "refreshing" : "ready"
  return (
    <div data-testid={`state-${state}`} className="border-t border-border py-6 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-ui font-medium">{stateInfo[state].title}</p>
        {state === "refreshing" && <DataTableRefreshing />}
      </div>
      <p className="mt-1 text-caption text-muted-foreground">{stateInfo[state].note}</p>
      <div className="mt-4">
        <DataTable
          table={table}
          status={status}
          loadingRowCount={3}
          filtered={state === "no-results"}
          caption={`データの状態：${stateInfo[state].title}`}
          empty={
            <DataTableMessage
              title="顧客はまだ登録されていません"
              description="最初の顧客を登録すると、ここに一覧が表示されます。"
              action={<Button size="sm">顧客を登録する</Button>}
            />
          }
          noResults={
            <DataTableMessage
              title="「青葉物流」に一致する顧客はいません"
              description="検索語や絞り込みの条件を変えてください。"
              action={
                <Button variant="outline" size="sm">
                  条件をすべて解除
                </Button>
              }
            />
          }
          error={
            <DataTableMessage
              status="error"
              title="顧客の一覧を取得できませんでした"
              description="サーバーに接続できませんでした。時間をおいて、もう一度お試しください。"
              action={
                <Button variant="outline" size="sm">
                  再試行
                </Button>
              }
            />
          }
        />
      </div>
    </div>
  )
}

export function DataTablePage() {
  const [key, setKey] = useState(0)
  return (
    <article>
      <PageHeader
        name="Data Table"
        lead="多くのデータから、必要な行を見つけ、判断し、次の操作へ移るための一覧。TanStack Table と Table、Checkbox、Select、Pagination を組み合わせる。"
      />

      <Section
        title="顧客管理（クライアント側の処理）"
        lead="580 件をブラウザに持ち、検索、絞り込み、並べ替え、ページ送りを TanStack Table で行う。行を押すか、会社名のボタンで詳細を開く。"
      >
        <CustomerTable key={`client-${key}`} mode="client" testId="client" />
        <p className="mt-6">
          <Button variant="ghost" size="sm" onClick={() => setKey((k) => k + 1)}>
            初期の状態に戻す
          </Button>
        </p>
      </Section>

      <Section
        title="サーバー側の処理を模擬"
        lead="1 ページ分だけを模擬のサーバーから受け取る（0.4〜0.8 秒の遅延）。検索は入力が止まってから送り、古い応答で表示を上書きしない。再取得の間は表示中のデータを残す。"
      >
        <CustomerTable mode="server" testId="server" />
      </Section>

      <Section
        title="情報密度と行の選択"
        lead="Checkbox はセル全体が押せる範囲になり、隣の行とセルに重ならない。指で操作する端末では、Compact でも選択できる行を 48px 以上にする。4 行目は選択できない。"
      >
        {(["compact", "default", "comfortable"] as const).map((d) => (
          <Row key={d} label={d === "compact" ? "Compact（36px）" : d === "default" ? "Default（48px）" : "Comfortable（64px）"}>
            <SelectionDensityDemo density={d} />
          </Row>
        ))}
      </Section>

      <Section title="データの状態" lead="状態ごとに、表示と次の操作を変える。取得に失敗した状態を 0 件として表示しない。">
        {(Object.keys(stateInfo) as DemoState[]).map((s) => (
          <StateDemo key={s} state={s} />
        ))}
      </Section>
    </article>
  )
}
