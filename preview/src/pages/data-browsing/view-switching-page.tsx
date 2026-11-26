import { useMemo, useState } from "react"
import { useTable, type PaginationState, type RowSelectionState, type SortingState } from "@tanstack/react-table"
import { CalendarDays, Kanban, LayoutGrid, List, Table2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable, DataTablePagination, DataTableSearch, dataTableDefaults, dataTableFeatures } from "@/components/ui/data-table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableScrollArea } from "@/patterns/table-scroll-area"
import { ViewSwitcher, ViewSwitcherMenu, useViewScopedState, type ViewOption } from "@/patterns/view-switcher"

import { customers, formatDate, statusLabel, statusOptions, type ContractStatus } from "../../data/data-display/customers"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { CompanyBrowser } from "./company-browser"
import { companyColumns, StatusText } from "./company-parts"
import { SimpleCards, SimpleList } from "./company-views"
import { AppLink, DemoFrame, Mock, Rules } from "./doc-parts"

type FiveView = "table" | "list" | "card" | "kanban" | "calendar"

const fiveViews: ViewOption<FiveView>[] = [
  { value: "table", label: "表", icon: <Table2 /> },
  { value: "list", label: "リスト", icon: <List /> },
  { value: "card", label: "カード", icon: <LayoutGrid /> },
  { value: "kanban", label: "カンバン", icon: <Kanban /> },
  { value: "calendar", label: "カレンダー", icon: <CalendarDays /> },
]

const sample = customers.filter((c) => c.renewalDate !== null).slice(0, 24)
const columns = companyColumns({ selectable: true })

// 5 つの表示形式。検索語と選択中のレコードは、表示形式を変えても残す。
// ページ番号（表）、グループ（カンバン）、表示期間（カレンダー）は、表示形式ごとに持つ。
function FiveViewsDemo() {
  const [view, setView] = useState<FiveView>("table")
  const [search, setSearch] = useState("")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useViewScopedState<"table", PaginationState>("table", () => ({ pageIndex: 0, pageSize: 8 }))
  const [groupBy, setGroupBy] = useViewScopedState<"kanban", "status" | "owner">("kanban", () => "status")
  const [month, setMonth] = useViewScopedState<"calendar", string>("calendar", () => "2026-12")

  const rows = useMemo(() => sample.filter((c) => c.company.includes(search)), [search])
  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns,
    data: rows,
    getRowId: (r) => r.id,
    state: { sorting, pagination, rowSelection, columnVisibility: { phone: false, region: false, actions: false } },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    autoResetPageIndex: false,
  })
  const selected = Object.keys(rowSelection).length
  const active = sample.find((c) => c.id === activeId)

  const groups =
    groupBy === "status"
      ? statusOptions.map((s) => ({ key: s.value, label: s.label, rows: rows.filter((c) => c.status === s.value) }))
      : [...new Set(rows.map((c) => c.owner))].map((o) => ({ key: o, label: o, rows: rows.filter((c) => c.owner === o) }))
  const inMonth = rows.filter((c) => c.renewalDate!.startsWith(month)).sort((a, b) => a.renewalDate!.localeCompare(b.renewalDate!))

  return (
    <DemoFrame testId="vs-five">
      <div className="flex flex-col gap-4">
        <DataTableSearch
          className="sm:max-w-72"
          placeholder="会社名で検索"
          value={search}
          onValueChange={(v) => {
            setSearch(v)
            setPagination((p) => ({ ...p, pageIndex: 0 }))
          }}
        />
        {/* 切り替えは、対象のデータ領域の直上・右に置く。5 種類は Dropdown にする */}
        <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-ui tabular-nums" data-testid="vs-five-count">
            {rows.length}件{selected > 0 && `（${selected}件を選択中）`}
          </p>
          <div className="ms-auto">
            <ViewSwitcherMenu value={view} onValueChange={setView} options={fiveViews} />
          </div>
        </div>
        {selected > 0 && view !== "table" && (
          <p className="text-ui" data-testid="vs-five-selection">
            {selected}件を選択中。一括操作は表で行えます。
            <Button variant="link" size="sm" onClick={() => setView("table")}>
              表に切り替える
            </Button>
          </p>
        )}
        <div data-testid={`vs-five-${view}`}>
          {view === "table" && (
            <div className="flex flex-col gap-4">
              <TableScrollArea>
                <DataTable table={table} caption="顧客（表）" onRowOpen={(r) => setActiveId(r.id)} activeRowId={activeId} filtered={search !== ""} />
              </TableScrollArea>
              <DataTablePagination table={table} />
            </div>
          )}
          {view === "list" && <SimpleList rows={rows} activeId={activeId} onOpen={setActiveId} />}
          {view === "card" && <SimpleCards rows={rows} activeId={activeId} onOpen={setActiveId} />}
          {view === "kanban" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-ui">
                <span id="vs-group-label">グループ</span>
                <Select
                  items={[
                    { value: "status", label: "契約状況" },
                    { value: "owner", label: "担当者" },
                  ]}
                  value={groupBy}
                  onValueChange={(v) => setGroupBy(v as "status" | "owner")}
                >
                  <SelectTrigger aria-labelledby="vs-group-label" className="w-40" data-testid="vs-group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status">契約状況</SelectItem>
                    <SelectItem value="owner">担当者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {groups.map((g) => (
                  <div key={g.key} className="flex w-56 shrink-0 flex-col gap-2 rounded-md bg-muted p-3">
                    <h3 className="text-ui font-semibold">
                      {groupBy === "status" ? <StatusText status={g.key as ContractStatus} /> : g.label}
                      <span className="ms-2 font-normal text-muted-foreground">{g.rows.length}件</span>
                    </h3>
                    {g.rows.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        data-row-id={c.id}
                        aria-pressed={activeId === c.id}
                        onClick={() => setActiveId(c.id)}
                        className="rounded-sm bg-background p-2 text-left text-ui outline-none focus-visible:focus-ring aria-pressed:shadow-[inset_2px_0_0_var(--primary)]"
                      >
                        {c.company}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {view === "calendar" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMonth(month === "2027-01" ? "2026-12" : "2026-11")} disabled={month === "2026-11"}>
                  前の月
                </Button>
                <h3 className="text-heading tabular-nums" data-testid="vs-month">
                  {month.replace("-", "年").replace(/年0?/, "年")}月
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setMonth(month === "2026-11" ? "2026-12" : "2027-01")} disabled={month === "2027-01"}>
                  次の月
                </Button>
                <span className="text-ui text-muted-foreground">表示期間の {inMonth.length}件</span>
              </div>
              <ol className="flex flex-col">
                {inMonth.map((c) => (
                  <li key={c.id} className="flex gap-4 border-b border-border py-2 text-ui">
                    <span className="w-24 text-muted-foreground tabular-nums">{formatDate(c.renewalDate!)}</span>
                    <button type="button" data-row-id={c.id} aria-pressed={activeId === c.id} onClick={() => setActiveId(c.id)} className="rounded-xs text-left underline-offset-4 outline-none hover:underline focus-visible:focus-ring aria-pressed:font-semibold">
                      {c.company}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <p className="border-t border-border pt-3 text-ui" data-testid="vs-five-active" aria-live="polite">
          {active ? `選択中のレコード：${active.company}（${statusLabel[active.status]}）` : "レコードを選ぶと、表示形式を変えても選択が残る"}
        </p>
      </div>
    </DemoFrame>
  )
}

function SegmentedDemo() {
  const [v, setV] = useState<"table" | "kanban" | "calendar">("table")
  const options: ViewOption<typeof v>[] = [
    { value: "table", label: "表", icon: <Table2 /> },
    { value: "kanban", label: "カンバン", icon: <Kanban /> },
    { value: "calendar", label: "カレンダー", icon: <CalendarDays /> },
  ]
  return (
    <div className="flex flex-wrap items-center gap-8" data-testid="vs-segmented">
      <ViewSwitcher label="表示形式（ラベルあり）" value={v} onValueChange={setV} options={options} />
      <ViewSwitcher label="表示形式（アイコンだけ）" value={v} onValueChange={setV} options={options} iconOnly />
    </div>
  )
}

export function ViewSwitchingPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Browsing"
        name="View Switching"
        lead="同じデータを、作業の目的に合う形式で見る。業務データは Table を基本にし、異なる作業の目的がある場合だけ切り替えを提供する。見た目の変化だけを理由に形式を増やさない。"
      />

      <Section title="5 つの表示形式" lead="検索語と選択中のレコードは、表示形式を変えても残る。ページ番号（表）、グループ（カンバン）、表示期間（カレンダー）は、表示形式ごとに持ち、戻ったときに戻る。">
        <FiveViewsDemo />
      </Section>

      <Section title="切り替えの部品" lead="2〜3 種類はセグメント型。選択中はニュートラルの面と太さで示す。矢印キーで移動して選ぶ。アイコンだけにする場合は、名前を aria-label と Tooltip で示す。">
        <SegmentedDemo />
      </Section>

      <Section title="検証画面での組み合わせ" lead="表（比較）、カンバン（契約状況ごとの把握）、カレンダー（更新日の把握）。表示形式に固有の範囲（カンバンの各列の先頭だけ、カレンダーの表示期間の中だけ）を明示する。">
        <div className="flex flex-col gap-4">
          <DemoFrame>
            <CompanyBrowser testId="vs-demo" workspace="hq" features={{ views: true, bulk: true }} />
          </DemoFrame>
          <AppLink href="#/browsing-app?page=customers&view=board">検証画面をカンバンで開く（URL の view）</AppLink>
        </div>
      </Section>

      <Section title="判断基準">
        <Rules
          rows={[
            ["Table", "多数の属性を比較する（標準）"],
            ["List", "順番に情報を確認する"],
            ["Card", "個々の情報を独立した単位として認識する（画像や要約を見て選ぶ）"],
            ["Kanban", "状態や進み具合を把握する"],
            ["Calendar", "日付や時間の関係を把握する"],
            ["最初の表示形式", "1 URL などで明示された形式 → 2 利用者がそのページで前回使った形式 → 3 製品の標準。保存は製品の責務"],
            ["モバイル", "作業の目的で選ぶ。比較が重要な場合は Table を残す。Table を無条件に Card に変えない"],
          ]}
        />
      </Section>

      <Section title="状態の扱い">
        <Bullets
          items={[
            "維持する：検索語、フィルター、選択中のレコードの ID、対応できる詳細の表示、切り替え先でも意味を持つソート。",
            "表示形式ごとに持つ：ページ番号、スクロールの位置、Table の列の設定、Kanban のグループ、Calendar の表示期間。",
            "一括操作に対応しない表示形式では、選択を無言で隠さない（「3件を選択中。一括操作は表で行えます」）。",
            "表示形式の変更は、データの変更ではない。切り替えで条件や権限を変えない。Kanban のドラッグによる状態の変更などは、このパターンの範囲外。",
          ]}
        />
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="表示形式の切り替えを Page Header の右上に置き、データ領域から離した例">
              <div className="flex items-center justify-between">
                <span className="text-heading">顧客</span>
                <span className="rounded-md border border-input px-2 py-1 text-caption">表｜カンバン</span>
              </div>
              <div className="h-8 rounded-sm border border-input" />
              <div className="h-16 rounded-sm bg-muted" />
            </Mock>
          }
          badNote="ページ全体の操作と区別できず、何の表示を変えるのかがわかりにくい。"
          good={
            <Mock label="表示形式の切り替えを、データ領域の直上・右に置いた例">
              <span className="text-heading">顧客</span>
              <div className="h-8 rounded-sm border border-input" />
              <div className="flex items-center justify-between">
                <span className="text-caption">128件</span>
                <span className="rounded-md border border-input px-2 py-1 text-caption">表｜カンバン</span>
              </div>
              <div className="h-16 rounded-sm bg-muted" />
            </Mock>
          }
          goodNote="対象のデータ領域の直上・右に置き、何を切り替えるかを位置で伝える。"
        />
      </Section>
    </article>
  )
}
