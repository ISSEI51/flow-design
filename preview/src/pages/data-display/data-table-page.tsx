import { useState } from "react"
import { createColumnHelper, useTable } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import {
  DataTable,
  DataTableMessage,
  DataTableRefreshing,
  dataTableDefaults,
  dataTableFeatures,
  type DataTableFeatures,
  type DataTableStatus,
} from "@/components/ui/data-table"
import { TableNoValue } from "@/components/ui/table"

import { customers, formatYen, type Customer } from "../../data/data-display/customers"
import { PageHeader } from "../../layout/page-header"
import { Section } from "../../layout/section"
import { CustomerTable } from "./customer-table"
import { StatusText } from "./customer-parts"

const helper = createColumnHelper<DataTableFeatures, Customer>()
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
              tone="error"
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

      <Section title="データの状態" lead="状態ごとに、表示と次の操作を変える。取得に失敗した状態を 0 件として表示しない。">
        {(Object.keys(stateInfo) as DemoState[]).map((s) => (
          <StateDemo key={s} state={s} />
        ))}
      </Section>
    </article>
  )
}
