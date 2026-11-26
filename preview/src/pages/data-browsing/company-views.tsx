import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTableMessage } from "@/components/ui/data-table"
import { Skeleton } from "@/components/ui/skeleton"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { getBrowseViewState, useBrowseData } from "@/patterns/browse-data"
import { DataRefreshIndicator, DataRegionError, LoadingReveal } from "@/patterns/data-states"

import { formatDate, formatYen, statusLabel, type Customer } from "../../data/data-display/customers"
import { listBoard, listRenewals, type CompanyQuery } from "../../data/data-browsing/company-server"
import { StatusText } from "./company-parts"

// 表示形式ごとの表示（製品側のコード）。Kanban と Calendar は、閲覧のための簡単な例であり、
// ドラッグによる状態の変更や予定の変更は行わない（表示形式の変更と、データの変更を分ける）。

const PER_COLUMN = 12

type ViewProps = {
  workspace: string
  query: Pick<CompanyQuery, "search" | "filters" | "sorting">
  filtered: boolean
  activeId: string | null
  onOpen: (id: string) => void
  onClearAll: () => void
  testId: string
}

function RecordButton({ customer, active, onOpen, className, children }: { customer: Customer; active: boolean; onOpen: (id: string) => void; className?: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      data-row-focus=""
      aria-haspopup="dialog"
      aria-expanded={active}
      onClick={() => onOpen(customer.id)}
      className={cn("rounded-xs text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring [word-break:auto-phrase]", className)}
    >
      {children ?? customer.company}
    </button>
  )
}

function ViewMessage({ state, onClearAll }: { state: "empty" | "no-results"; onClearAll: () => void }) {
  return state === "no-results" ? (
    <DataTableMessage
      status="no-results"
      title="条件に一致する顧客はいません"
      description="検索語や条件を変えてください。"
      action={
        <Button variant="outline" size="sm" onClick={onClearAll}>
          検索語と条件をすべて解除
        </Button>
      }
    />
  ) : (
    <DataTableMessage status="empty" title="顧客はまだ登録されていません" description="登録した顧客が、ここに表示されます。" />
  )
}

// ---------------------------------------------------------------- Kanban：契約状況ごとの件数と進み具合を把握する
export function BoardView({ workspace, query, filtered, activeId, onOpen, onClearAll, testId }: ViewProps) {
  const data = useBrowseData({
    query,
    fetcher: (q, { signal }) => listBoard(workspace, q, PER_COLUMN, signal),
    scopeKey: workspace,
  })
  const total = data.data?.reduce((n, c) => n + c.total, 0) ?? 0
  const state = getBrowseViewState({ status: data.status, count: total, filtered })
  return (
    <section aria-label="カンバン（契約状況ごと）" aria-busy={data.status === "loading" || data.status === "refreshing" || undefined} data-testid={testId} className="flex flex-col gap-4">
      <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1">
        {/* 表示形式に固有の範囲を明示する（各列は先頭の一部だけ） */}
        <p className="text-ui text-muted-foreground">各列の先頭 {PER_COLUMN}件を、現在の並べ替えの順に表示しています。すべての行は表で確認できます。</p>
        <DataRefreshIndicator active={data.status === "refreshing"} className="ms-auto" />
      </div>
      {state === "error" ? (
        <DataRegionError title="カンバンを表示できませんでした" description="サーバーに接続できませんでした。" onRetry={data.reload} />
      ) : state === "empty" || state === "no-results" ? (
        <ViewMessage state={state} onClearAll={onClearAll} />
      ) : (
        <LoadingReveal loading={data.status === "loading"}>
          <div className="-mx-1 flex gap-4 overflow-x-auto overscroll-x-contain px-1 pb-2">
            {(data.data ?? (["trial", "active", "paused", "cancelled"] as const).map((status) => ({ status, total: 0, rows: [] as Customer[] }))).map((col) => (
              <div key={col.status} className="flex w-64 shrink-0 flex-col gap-3 rounded-md bg-muted p-3" data-testid={`${testId}-${col.status}`}>
                <h3 className="flex items-baseline justify-between gap-2 text-ui font-semibold">
                  <StatusText status={col.status} />
                  {data.status === "loading" ? (
                    <Skeleton className="h-4 w-10 rounded-sm" />
                  ) : (
                    <span className="font-normal text-muted-foreground tabular-nums">{col.total.toLocaleString("ja-JP")}件</span>
                  )}
                </h3>
                <ul className="flex flex-col gap-2">
                  {data.status === "loading"
                    ? Array.from({ length: 4 }, (_, i) => (
                        <li key={i} aria-hidden="true" className="flex flex-col gap-2 rounded-sm bg-background p-3">
                          <Skeleton className="h-4 w-3/4 rounded-sm" />
                          <Skeleton className="h-3 w-1/2 rounded-sm" />
                        </li>
                      ))
                    : col.rows.map((c) => (
                        <li
                          key={c.id}
                          data-row-id={c.id}
                          data-active={activeId === c.id || undefined}
                          className="flex flex-col gap-1 rounded-sm bg-background p-3 text-ui data-active:shadow-[inset_2px_0_0_var(--primary)]"
                        >
                          <RecordButton customer={c} active={activeId === c.id} onOpen={onOpen} />
                          <span className="text-caption text-muted-foreground">
                            {c.owner}・{c.renewalDate ? `${formatDate(c.renewalDate)} 更新` : "更新日 未定"}
                          </span>
                        </li>
                      ))}
                </ul>
                {data.status !== "loading" && col.total > col.rows.length && (
                  <p className="text-caption text-muted-foreground">ほか {(col.total - col.rows.length).toLocaleString("ja-JP")}件</p>
                )}
              </div>
            ))}
          </div>
        </LoadingReveal>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Calendar：更新日の関係を把握する
const WEEK = ["月", "火", "水", "木", "金", "土", "日"]

function monthLabel(month: string) {
  const [y, m] = month.split("-")
  return `${y}年${Number(m)}月`
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export function CalendarView({ workspace, query, filtered, activeId, onOpen, onClearAll, testId, month, onMonthChange }: ViewProps & {
  /** 表示期間（YYYY-MM）。表示形式に固有の状態 */
  month: string
  onMonthChange: (month: string) => void
}) {
  const mobile = useIsMobile()
  const q = { search: query.search, filters: query.filters }
  const data = useBrowseData({
    query: { ...q, month },
    fetcher: (v, { signal }) => listRenewals(workspace, v, v.month, signal),
    scopeKey: workspace,
  })
  const rows = data.data ?? []
  const state = getBrowseViewState({ status: data.status, count: rows.length, filtered })
  const [y, m] = month.split("-").map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7
  const byDay = new Map<number, Customer[]>()
  for (const c of rows) {
    const d = Number(c.renewalDate!.slice(8, 10))
    byDay.set(d, [...(byDay.get(d) ?? []), c])
  }

  return (
    <section aria-label={`カレンダー（${monthLabel(month)}の更新日）`} aria-busy={data.status === "loading" || data.status === "refreshing" || undefined} data-testid={testId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="前の月" onClick={() => onMonthChange(shiftMonth(month, -1))}>
            <ChevronLeft />
          </Button>
          <h3 className="min-w-28 text-center text-heading tabular-nums" aria-live="polite">
            {monthLabel(month)}
          </h3>
          <Button variant="ghost" size="icon-sm" aria-label="次の月" onClick={() => onMonthChange(shiftMonth(month, 1))}>
            <ChevronRight />
          </Button>
        </div>
        {/* 表示期間によって表示の対象が変わることを示す */}
        <p className="text-ui text-muted-foreground" data-testid={`${testId}-range`}>
          {data.isCurrent ? `この月に更新を迎える ${rows.length.toLocaleString("ja-JP")}件（表示期間の中だけ）` : "この月に更新を迎える顧客（表示期間の中だけ）"}
        </p>
        <DataRefreshIndicator active={data.status === "refreshing"} className="ms-auto" />
      </div>
      {state === "error" ? (
        <DataRegionError title="カレンダーを表示できませんでした" description="サーバーに接続できませんでした。" onRetry={data.reload} />
      ) : state === "empty" || state === "no-results" ? (
        // 0 件は「この月に該当がない」ことであり、データの未登録とは限らないため、月の範囲で伝える。
        <p className="flex flex-wrap items-center justify-center gap-x-2 py-8 text-center text-ui text-muted-foreground">
          {monthLabel(month)}に更新を迎える顧客はいません。
          {filtered && (
            <Button variant="link" size="sm" onClick={onClearAll}>
              検索語と条件をすべて解除
            </Button>
          )}
        </p>
      ) : mobile ? (
        // 狭い画面では月の格子を読めないため、日付の順の一覧にする（表示形式は Calendar のまま）。
        <LoadingReveal loading={data.status === "loading"}>
          <ol className="flex flex-col">
            {data.status === "loading"
              ? Array.from({ length: 4 }, (_, i) => (
                  <li key={i} aria-hidden="true" className="border-b border-border py-3">
                    <Skeleton className="h-4 w-2/3 rounded-sm" />
                  </li>
                ))
              : [...byDay.entries()].map(([day, list]) => (
                  <li key={day} className="flex gap-4 border-b border-border py-3 text-ui">
                    <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{m}/{day}（{WEEK[(lead + day - 1) % 7]}）</span>
                    <ul className="flex min-w-0 flex-col gap-1">
                      {list.map((c) => (
                        <li key={c.id} data-row-id={c.id}>
                          <RecordButton customer={c} active={activeId === c.id} onOpen={onOpen} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
          </ol>
        </LoadingReveal>
      ) : (
        <LoadingReveal loading={data.status === "loading"}>
          {/* 矢印キーで移動する grid ではないため、role は付けない。日付は各セルの文字（支援技術には月日）で示す。 */}
          <div className="grid grid-cols-7 border-t border-l border-border text-ui">
            <div aria-hidden="true" className="contents">
              {WEEK.map((w) => (
                <div key={w} className="border-r border-b border-border px-2 py-1 text-caption text-muted-foreground">
                  {w}
                </div>
              ))}
            </div>
            {Array.from({ length: Math.ceil((lead + days) / 7) }, (_, week) => (
              <div key={week} className="contents">
                {Array.from({ length: 7 }, (_, i) => {
                  const day = week * 7 + i - lead + 1
                  const inMonth = day >= 1 && day <= days
                  const list = inMonth ? (byDay.get(day) ?? []) : []
                  return (
                    <div
                      key={i}
                      aria-hidden={inMonth ? undefined : true}
                      className={cn("flex min-h-24 min-w-0 flex-col gap-1 border-r border-b border-border p-1.5", !inMonth && "bg-muted")}
                    >
                      {inMonth && (
                        <span className="text-caption text-muted-foreground tabular-nums">
                          <span aria-hidden="true">{day}</span>
                          <span className="sr-only">
                            {m}月{day}日（{WEEK[i]}）{list.length > 0 ? `、${list.length}件` : ""}
                          </span>
                        </span>
                      )}
                      {data.status === "loading" && inMonth && day % 5 === 0 && <Skeleton className="h-4 w-full rounded-sm" />}
                      {data.status !== "loading" &&
                        list.slice(0, 3).map((c) => (
                          <div key={c.id} data-row-id={c.id} className="min-w-0">
                            <RecordButton customer={c} active={activeId === c.id} onOpen={onOpen} className="block w-full truncate text-caption font-normal">
                              {/* 省略した名前は title で確かめられる。押すと詳細に全体を表示する */}
                              <span title={c.company}>{c.company}</span>
                            </RecordButton>
                          </div>
                        ))}
                      {data.status !== "loading" && list.length > 3 && (
                        <span className="text-caption text-muted-foreground">ほか {list.length - 3}件</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </LoadingReveal>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- List と Card（View Switching の資料のページで使う）
export function SimpleList({ rows, activeId, onOpen }: { rows: Customer[]; activeId: string | null; onOpen: (id: string) => void }) {
  return (
    <ul className="flex flex-col" data-testid="view-list">
      {rows.map((c) => (
        <li key={c.id} data-row-id={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3 text-ui last:border-b-0">
          <RecordButton customer={c} active={activeId === c.id} onOpen={onOpen} />
          <span className="text-muted-foreground tabular-nums">
            {statusLabel[c.status]}・{c.owner}・{c.renewalDate ? formatDate(c.renewalDate) : "更新日 未定"}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function SimpleCards({ rows, activeId, onOpen }: { rows: Customer[]; activeId: string | null; onOpen: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-1 gap-4 @xl/page:grid-cols-2 @4xl/page:grid-cols-3" data-testid="view-card">
      {rows.map((c) => (
        <li key={c.id} data-row-id={c.id} className="flex flex-col gap-3 rounded-md border border-border p-4 text-ui">
          <RecordButton customer={c} active={activeId === c.id} onOpen={onOpen} className="text-body" />
          <StatusText status={c.status} />
          <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-muted-foreground">
            <dt>担当者</dt>
            <dd className="text-foreground">{c.owner}</dd>
            <dt>月額</dt>
            <dd className="text-foreground tabular-nums">{c.monthlyFee === null ? "未設定" : formatYen(c.monthlyFee)}</dd>
          </dl>
        </li>
      ))}
    </ul>
  )
}
