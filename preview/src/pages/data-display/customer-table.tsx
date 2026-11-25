import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  useTable,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnPinningState,
  type ColumnSizingState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import { ChevronDown, Columns3, Mail, SlidersHorizontal, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DataTable,
  DataTableAppliedFilters,
  DataTableColumnOptions,
  DataTableMessage,
  DataTablePagination,
  DataTableRefreshing,
  DataTableSearch,
  DataTableSelectionBar,
  dataTableDefaults,
  dataTableFeatures,
  getSelectionSummary,
  type AppliedFilter,
  type DataTableStatus,
} from "@/components/ui/data-table"
import { Field, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/components/ui/toast"

import {
  customers as allCustomers,
  fetchCustomers,
  mockServer,
  owners,
  regions,
  statusOptions,
  type ContractStatus,
  type Customer,
  type CustomerPage,
  type CustomerQuery,
} from "../../data/data-display/customers"
import { CustomerDetail, FilterSelect, RowActionContext, customerColumns } from "./customer-parts"

// 顧客管理の画面。検索、絞り込み、並べ替え、行の選択と一括操作、列の設定、ページ送り、詳細の表示を組み合わせる。
// mode="client" … 全件をブラウザに持ち、TanStack Table が絞り込み、並べ替え、ページ送りを行う
// mode="server" … 1 ページ分だけを模擬のサーバーから受け取る。表は manual* で処理を行わない

const ownerOptions = owners.map((o) => ({ value: o, label: o }))
const statusSelectOptions = statusOptions.map((s) => ({ value: s.value, label: s.label }))
const narrowHidden: ColumnVisibilityState = { seats: false, phone: false, renewalDate: false }
const initialPinning: ColumnPinningState = { start: ["select", "company"], end: [] }

type Filters = { search: string; status: ContractStatus | null; owner: string | null; regions: string[] }
const noFilters: Filters = { search: "", status: null, owner: null, regions: [] }

function useIsNarrow() {
  const [narrow] = useState(() => window.matchMedia("(max-width: 39.99rem)").matches)
  return narrow
}

// 一覧の上の設定（その他の条件、列の表示）。Popover で開く。
function SettingsPopover({
  label,
  icon,
  count,
  title,
  testId,
  children,
}: {
  label: string
  icon: ReactNode
  count?: number
  title: string
  testId: string
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="text-ui" data-testid={testId} />}>
        {icon}
        {label}
        {count ? <span className="tabular-nums">（{count}）</span> : null}
        <ChevronDown className="motion-safe:transition-transform motion-safe:duration-(--duration-normal) [[data-popup-open]_&]:rotate-180" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22.5rem,calc(100vw-2rem))]">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
        </PopoverHeader>
        {children}
      </PopoverContent>
    </Popover>
  )
}

export function CustomerTable({ mode, testId }: { mode: "client" | "server"; testId: string }) {
  const narrow = useIsNarrow()
  const [filters, setFilters] = useState<Filters>(noFilters)
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 })
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(narrow ? narrowHidden : {})
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([])
  // 狭い画面では、固定する会社名の列を細くし、横にスクロールする範囲を残す。
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(narrow ? { company: 168 } : {})
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(initialPinning)
  const [openId, setOpenId] = useState<string | null>(null)
  const [allMatching, setAllMatching] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [data, setData] = useState<Customer[]>(allCustomers)
  const container = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // ---------------------------------------------------------------- server
  const [page, setPage] = useState<CustomerPage>({ rows: [], total: 0 })
  const [status, setStatus] = useState<DataTableStatus>(mode === "server" ? "loading" : "ready")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const requestId = useRef(0)
  const [reloadKey, setReloadKey] = useState(0)

  // 検索語は入力が止まってから 300ms 後に送る（IME の変換中は DataTableSearch が値を渡さない）。
  useEffect(() => {
    if (mode !== "server") return
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300)
    return () => clearTimeout(t)
  }, [mode, filters.search])

  const query: CustomerQuery = useMemo(
    () => ({
      search: debouncedSearch,
      status: filters.status,
      owner: filters.owner,
      regions: filters.regions,
      sort: sorting[0] ? { id: sorting[0].id as NonNullable<CustomerQuery["sort"]>["id"], desc: sorting[0].desc } : null,
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
    }),
    [debouncedSearch, filters.status, filters.owner, filters.regions, sorting, pagination]
  )

  useEffect(() => {
    if (mode !== "server") return
    // 要求ごとに番号を付け、最新の要求の応答だけを表示する。古い応答で上書きしない。
    const id = ++requestId.current
    const controller = new AbortController()
    setStatus((s) => (s === "loading" ? "loading" : "refreshing"))
    fetchCustomers(query, controller.signal).then(
      (result) => {
        if (id !== requestId.current) return
        setPage(result)
        setStatus("ready")
      },
      (error: unknown) => {
        if (id !== requestId.current || (error instanceof DOMException && error.name === "AbortError")) return
        setStatus("error")
      }
    )
    return () => controller.abort()
  }, [mode, query, reloadKey])

  // ---------------------------------------------------------------- client
  const columnFilters: ColumnFiltersState = useMemo(() => {
    if (mode === "server") return []
    const list: ColumnFiltersState = []
    if (filters.search) list.push({ id: "company", value: filters.search })
    if (filters.status) list.push({ id: "status", value: filters.status })
    if (filters.owner) list.push({ id: "owner", value: filters.owner })
    if (filters.regions.length) list.push({ id: "region", value: filters.regions })
    return list
  }, [mode, filters])

  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns: customerColumns,
    data: mode === "server" ? page.rows : data,
    getRowId: (row) => row.id,
    state: { sorting, pagination, rowSelection, columnVisibility, columnOrder, columnSizing, columnPinning, columnFilters },
    onSortingChange: (u) => {
      setSorting(u)
      setPagination((p) => ({ ...p, pageIndex: 0 }))
    },
    onPaginationChange: setPagination,
    onRowSelectionChange: (u) => {
      setAllMatching(false)
      setRowSelection(u)
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onColumnPinningChange: setColumnPinning,
    onColumnFiltersChange: () => {},
    autoResetPageIndex: false,
    ...(mode === "server" && { manualFiltering: true, manualSorting: true, manualPagination: true, rowCount: page.total }),
  })

  const updateFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    // 条件が変わったら最初のページに戻す。「全データを選択中」は条件に結びつくため解除する。
    setPagination((p) => ({ ...p, pageIndex: 0 }))
    setAllMatching(false)
  }, [])

  const clearAll = () => updateFilters(noFilters)
  const anyFilter = Boolean(filters.search || filters.status || filters.owner || filters.regions.length)

  // Popover の中の条件だけを、解除できる形で一覧の上に示す。
  const applied: AppliedFilter[] = filters.regions.map((r) => ({
    id: `region-${r}`,
    label: "地域",
    value: r,
    onRemove: () => updateFilters({ regions: filters.regions.filter((x) => x !== r) }),
  }))

  const summary = getSelectionSummary(table)
  const matchingCount = mode === "server" ? page.total : table.getFilteredRowModel().rows.length
  const totalShown = mode === "server" ? page.total : table.getFilteredRowModel().rows.length
  const effectiveSelected = allMatching ? matchingCount : summary.selectedCount

  const openCustomer = (mode === "server" ? page.rows : data).find((c) => c.id === openId) ?? null

  const clearSelection = () => {
    setRowSelection({})
    setAllMatching(false)
    setConfirmDelete(false)
  }

  const deleteSelected = () => {
    const count = effectiveSelected
    if (mode === "client") {
      const ids = new Set(allMatching ? table.getFilteredRowModel().rows.map((r) => r.id) : summary.selectedIds)
      setData((d) => d.filter((c) => !ids.has(c.id)))
      if (openId && ids.has(openId)) setOpenId(null)
    }
    clearSelection()
    toast({
      variant: "success",
      title: mode === "client" ? `${count.toLocaleString("ja-JP")}件の顧客を削除しました` : `${count.toLocaleString("ja-JP")}件の顧客の削除を受け付けました`,
      description: mode === "client" ? "プレビューの中だけで削除しています。" : "模擬のサーバーのため、データは変わりません。",
    })
  }

  // 閉じた後は、最後に開いた行の会社名のボタンにフォーカスを戻す。
  // 閉じる時点では openId が null になっているため、開いた行の ID を別に覚えておく。
  const lastOpenId = useRef<string | null>(null)
  if (openId) lastOpenId.current = openId
  const rowTrigger = () =>
    lastOpenId.current
      ? (container.current?.querySelector<HTMLElement>(`[data-row-id="${lastOpenId.current}"] [data-slot=data-table-row-trigger]`) ?? null)
      : null

  const status_ = mode === "server" ? status : "ready"
  const isEmptyData = mode === "client" ? data.length === 0 : false

  return (
    <RowActionContext.Provider
      value={(action, c) =>
        toast(
          action === "compose"
            ? { title: `${c.company}宛てのメールを作成します`, description: "プレビューでは送信しません。" }
            : { variant: "success", title: `顧客ID ${c.id} をコピーしました` }
        )
      }
    >
      <div data-testid={testId} className="flex flex-col gap-4">
        <div role="search" aria-label="顧客の検索と絞り込み" className="flex flex-wrap items-center gap-3">
          <DataTableSearch
            data-testid={`${testId}-search`}
            className="sm:max-w-72"
            placeholder="会社名で検索"
            value={filters.search}
            onValueChange={(search) => updateFilters({ search })}
          />
          <FilterSelect
            label="契約状況"
            testId={`${testId}-status`}
            value={filters.status}
            options={statusSelectOptions}
            onChange={(v) => updateFilters({ status: v as ContractStatus | null })}
          />
          <FilterSelect label="担当者" testId={`${testId}-owner`} value={filters.owner} options={ownerOptions} onChange={(v) => updateFilters({ owner: v })} />
          <SettingsPopover
            label="その他の条件"
            title="その他の条件"
            icon={<SlidersHorizontal />}
            count={filters.regions.length}
            testId={`${testId}-more`}
          >
            <Field>
            <FieldSet>
              <FieldLegend variant="label">地域</FieldLegend>
              <div className="grid grid-cols-2 gap-x-4">
                {regions.map((r) => (
                  <FieldItem key={r}>
                    <Checkbox
                      checked={filters.regions.includes(r)}
                      onCheckedChange={(checked) =>
                        updateFilters({ regions: checked ? [...filters.regions, r] : filters.regions.filter((x) => x !== r) })
                      }
                    />
                    <FieldLabel>{r}</FieldLabel>
                  </FieldItem>
                ))}
              </div>
            </FieldSet>
            </Field>
          </SettingsPopover>
          <SettingsPopover label="列の表示" title="列の表示" icon={<Columns3 />} testId={`${testId}-columns`}>
            <DataTableColumnOptions table={table} />
          </SettingsPopover>
        </div>

        {(applied.length > 0 || anyFilter) && (
          <DataTableAppliedFilters filters={applied} onClearAll={anyFilter ? clearAll : undefined} />
        )}

        {/* 件数と一括操作は同じ行に置き、選択しても表の位置を動かさない。 */}
        <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2" data-testid={`${testId}-status-row`}>
          {effectiveSelected > 0 ? (
              <DataTableSelectionBar
                className="flex-1"
                selectedCount={summary.selectedCount}
                hiddenCount={summary.hiddenCount}
                onClearSelection={clearSelection}
                selectAll={{
                  matchingCount,
                  pageAllSelected: summary.pageAllSelected,
                  allSelected: allMatching,
                  // クライアント側：絞り込み後の全行を ID で選ぶ。
                  // サーバー側：読み込んでいない行は ID で選べないため、「条件に一致する全データ」を選んだ状態として持つ。
                  onSelectAll: () => (mode === "client" ? table.toggleAllRowsSelected(true) : setAllMatching(true)),
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast({ title: `${effectiveSelected.toLocaleString("ja-JP")}件にお知らせメールを送ります`, description: "プレビューでは送信しません。" })}
                >
                  <Mail />
                  <span className="max-sm:sr-only">メールを送信</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)} className="text-destructive">
                  <Trash2 />
                  <span className="max-sm:sr-only">削除</span>
                </Button>
              </DataTableSelectionBar>
          ) : (
            <p className="text-ui tabular-nums" aria-live="polite" data-testid={`${testId}-count`}>
              {status_ === "loading" ? "読み込み中" : status_ === "error" ? "件数を取得できませんでした" : `${totalShown.toLocaleString("ja-JP")}件`}
            </p>
          )}
          {status_ === "refreshing" && <DataTableRefreshing className="ms-auto" />}
        </div>
        {/* 危険な一括操作は Alert Dialog で確かめる。 */}
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent data-testid={`${testId}-confirm`}>
            <AlertDialogHeader>
              <AlertDialogTitle>{effectiveSelected.toLocaleString("ja-JP")}件の顧客を削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>削除すると元に戻せません。契約と請求の履歴も表示できなくなります。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={deleteSelected}>
                {effectiveSelected.toLocaleString("ja-JP")}件を削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div ref={container}>
          <DataTable
            table={table}
            layout="fixed"
            variant="striped"
            status={status_}
            filtered={anyFilter}
            caption={mode === "client" ? "顧客の一覧" : "顧客の一覧（サーバー側の処理）"}
            onRowOpen={(row) => setOpenId(row.id)}
            activeRowId={openId}
            loadingRowCount={8}
            empty={
              isEmptyData ? (
                <DataTableMessage
                  title="顧客はまだ登録されていません"
                  description="最初の顧客を登録すると、ここに一覧が表示されます。"
                  action={<Button size="sm" onClick={() => setData(allCustomers)}>顧客を登録する</Button>}
                />
              ) : undefined
            }
            noResults={
              <DataTableMessage
                title="条件に一致する顧客はいません"
                description="検索語や絞り込みの条件を変えてください。"
                action={
                  <Button variant="outline" size="sm" onClick={clearAll}>
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
                  <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                    再試行
                  </Button>
                }
              />
            }
          />
          <CustomerDetail customer={openCustomer} onClose={() => setOpenId(null)} returnFocus={rowTrigger} />
        </div>

        <DataTablePagination table={table} disabled={status_ === "loading"} className="mt-2" />

        {mode === "server" && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <p className="text-caption text-muted-foreground">模擬のサーバーの操作</p>
            <Button
              variant="outline"
              size="xs"
              data-testid={`${testId}-fail`}
              onClick={() => {
                mockServer.failNext = true
                setReloadKey((k) => k + 1)
              }}
            >
              取得に失敗させる
            </Button>
            <Button variant="outline" size="xs" data-testid={`${testId}-reload`} onClick={() => setReloadKey((k) => k + 1)}>
              再取得する
            </Button>
          </div>
        )}
      </div>
    </RowActionContext.Provider>
  )
}

