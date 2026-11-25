import * as React from "react"
import {
  FlexRender,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrIncludesSome,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type CellData,
  type Column,
  type Header,
  type Row,
  type RowData,
  type Table as TanstackTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsUpDown, LoaderCircle, Pin, PinOff, Search, X } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { PaginationControls } from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type CellAlign,
  type TableDensity,
  type TableVariant,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// Flow Design Data Table
// 1 つの万能なコンポーネントではなく、TanStack Table（v9）と Table、Checkbox、Input、Pagination を
// 組み合わせるための部品の集まり。製品は useTable で表の状態を持ち、必要な部品だけを並べる。
// - dataTableFeatures：検索、絞り込み、並べ替え、ページ送り、行の選択、列の表示・並び替え・幅・固定
// - DataTable：表の描画。並べ替えの aria-sort、行を押したときの詳細表示、固定した列、データの状態
// - DataTableColumnHeader：並べ替えのボタン
// - DataTablePageCheckbox、DataTableRowCheckbox：ページ内の全選択と行の選択
// - DataTableSelectionBar：選択件数と一括操作
// - DataTableSearch：IME の変換中に検索しない検索欄
// - DataTableAppliedFilters：個別に表示していない条件と「すべて解除」
// - DataTableColumnOptions：列の表示・非表示、並び替え、固定（Popover などの中に置く）
// - DataTablePagination：Pagination を表の状態につなぐ
// - DataTableMessage：データ未登録、検索結果なし、取得失敗（Feedback の Alert）。読み込み中は Feedback の Skeleton
// 検索の処理、API 通信、権限、CSV 出力は持たない。製品の責務とする。
// 定義は docs/web/components/data-table.md を参照。

type DataTableColumnMeta = {
  /** 列の名前。列の表示切り替え、並べ替えの読み上げ、列幅の名前に使う */
  label?: string
  /** セルの文字の配置。金額と数量は right */
  align?: CellAlign
  headerClassName?: string
  cellClassName?: string
}

// Flow Design の Data Table が使う機能。機能を登録することと、操作を画面に表示することは別である。
// 画面に必要な操作だけを部品として並べる。
const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    equalsString: filterFn_equalsString,
    arrIncludesSome: filterFn_arrIncludesSome,
  },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime, basic: sortFn_basic },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnPinningFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
})

type DataTableFeatures = typeof dataTableFeatures
type DataTableInstance<TData extends RowData> = TanstackTable<DataTableFeatures, TData>
type DataTableRow<TData extends RowData> = Row<DataTableFeatures, TData>

// useTable に渡す既定の設定。並べ替えは 1 列だけ（Shift を押しても複数の列にしない）。
// 範囲の選択は、Checkbox の onCheckedChange が修飾キーを渡さないため使わない。
const dataTableDefaults = {
  enableMultiSort: false,
  enableSortingRemoval: true,
  enableRowRangeSelection: false,
  columnResizeMode: "onChange",
} as const

// 行の型は表ごとに異なるため、Context では unknown として持ち、DataTableRowTrigger で受け渡すだけにする。
const DataTableContext = React.createContext<{
  openRow?: (row: unknown) => void
  activeRowId?: string | null
}>({})

// 行の中で、それ自体が操作になる要素。これらを押したときは、行の詳細を開かない。
const INNER_CONTROL =
  "a[href],button,input,select,textarea,label,summary,[role=button],[role=checkbox],[role=switch],[role=link],[role=menuitem],[role=combobox],[role=separator],[contenteditable=true],[data-row-click-ignore]"

function columnLabel<TData extends RowData, TValue extends CellData>(column: Column<DataTableFeatures, TData, TValue>) {
  return column.columnDef.meta?.label ?? column.id
}

function sortAnnouncement<TData extends RowData>(column: Column<DataTableFeatures, TData, unknown> | undefined, dir: false | "asc" | "desc") {
  if (!column) return "並べ替えを解除しました"
  return `${columnLabel(column)}で${dir === "desc" ? "降順" : "昇順"}に並べ替えました`
}

type DataTableStatus = "ready" | "loading" | "refreshing" | "error"

type DataTableProps<TData extends RowData> = {
  table: DataTableInstance<TData>
  /**
   * データの状態。
   * loading … 初めての読み込み。行の代わりに読み込み中の表示
   * refreshing … 再取得中。表示中のデータを残す
   * error … 取得に失敗。0 件として表示しない
   */
  status?: DataTableStatus
  /** 行を押したときに詳細を表示する。指定しない場合、行は押せる見た目にならない */
  onRowOpen?: (row: DataTableRow<TData>) => void
  /** 詳細を表示できる行か。false の行は押せる見た目にしない */
  canOpenRow?: (row: DataTableRow<TData>) => boolean
  /** 詳細を表示中の行の ID */
  activeRowId?: string | null
  /** データが 1 件も登録されていないときの表示。最初の登録を促す */
  empty?: React.ReactNode
  /** 検索や絞り込みの結果が 0 件のときの表示。条件の変更と解除を促す */
  noResults?: React.ReactNode
  /** 取得に失敗したときの表示。原因と再試行の手段を示す */
  error?: React.ReactNode
  /** 検索や絞り込みが適用中か。既定は表の状態（globalFilter、columnFilters）から判断する */
  filtered?: boolean
  loadingRowCount?: number
  /**
   * fixed … 列の幅を TanStack Table の size で固定する。列幅の変更と列の固定で使う。
   * auto … 内容に合わせる（既定）
   */
  layout?: "auto" | "fixed"
  variant?: TableVariant
  density?: TableDensity
  bordered?: boolean
  /** 表の名前。visible にしない場合は支援技術だけに伝える */
  caption?: React.ReactNode
  captionVisible?: boolean
  className?: string
  containerClassName?: string
}

function DataTable<TData extends RowData>({
  table,
  status = "ready",
  onRowOpen,
  canOpenRow,
  activeRowId,
  empty,
  noResults,
  error,
  filtered,
  loadingRowCount = 5,
  layout = "auto",
  variant,
  density,
  bordered,
  caption,
  captionVisible = false,
  className,
  containerClassName,
}: DataTableProps<TData>) {
  const fixed = layout === "fixed"
  const leafColumns = table.getVisibleLeafColumns()
  const lastLeafId = leafColumns[leafColumns.length - 1]?.id
  const rows = table.getRowModel().rows
  const sorting = table.atoms.sorting.get()
  const isFiltered =
    filtered ?? (Boolean(table.atoms.globalFilter.get()) || table.atoms.columnFilters.get().length > 0)

  // 並べ替えの結果を読み上げる。aria-sort の変化は、支援技術によっては読み上げられない。
  const [announcement, setAnnouncement] = React.useState("")
  const sortKey = JSON.stringify(sorting)
  const firstSort = React.useRef(true)
  React.useEffect(() => {
    if (firstSort.current) {
      firstSort.current = false
      return
    }
    const s = sorting[0]
    setAnnouncement(sortAnnouncement(s ? table.getColumn(s.id) : undefined, s ? (s.desc ? "desc" : "asc") : false))
  }, [sortKey])

  const openRow = React.useCallback((row: unknown) => onRowOpen?.(row as DataTableRow<TData>), [onRowOpen])
  const context = React.useMemo(() => ({ openRow: onRowOpen ? openRow : undefined, activeRowId }), [onRowOpen, openRow, activeRowId])

  const pinStyle = (column: Column<DataTableFeatures, TData, any>, isHeader: boolean): React.CSSProperties | undefined => {
    const pinned = column.getIsPinned()
    const style: React.CSSProperties = {}
    if (fixed && isHeader && column.id !== lastLeafId) style.width = column.getSize()
    if (pinned === "start") style.insetInlineStart = column.getStart("start")
    if (pinned === "end") style.insetInlineEnd = column.getAfter("end")
    if (pinned) {
      style.position = "sticky"
      style.zIndex = 1
    }
    return Object.keys(style).length ? style : undefined
  }

  // 固定した列の端に線を引き、スクロールした内容との境目を示す。
  const pinEdge = (column: Column<DataTableFeatures, TData, any>) => {
    const pinned = column.getIsPinned()
    if (pinned === "start") {
      const start = table.getStartVisibleLeafColumns()
      return start[start.length - 1]?.id === column.id ? "border-e border-e-border" : undefined
    }
    if (pinned === "end") return table.getEndVisibleLeafColumns()[0]?.id === column.id ? "border-s border-s-border" : undefined
    return undefined
  }

  const handleRowClick = (event: React.MouseEvent<HTMLTableRowElement>, row: DataTableRow<TData>) => {
    if (event.defaultPrevented || event.button !== 0) return
    const target = event.target as Element
    // Portal（Select のメニューなど）からのクリックは、React のツリーを通って行に届くため除く。
    if (!event.currentTarget.contains(target)) return
    const control = target.closest(INNER_CONTROL)
    if (control && event.currentTarget.contains(control)) return
    // 文字を選択したときは、詳細を開かない。
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && selection.anchorNode && event.currentTarget.contains(selection.anchorNode)) return
    onRowOpen?.(row)
  }

  const colSpan = Math.max(leafColumns.length, 1)
  const messageRow = (node: React.ReactNode, kind: string) => (
    <TableRow data-slot="data-table-message" data-kind={kind}>
      <TableCell colSpan={colSpan} className="h-auto py-0">
        {/* 横にスクロールしても、表示中の範囲に文字が残るようにする。 */}
        <div className="sticky start-4 max-w-[min(36rem,calc(100vw-4rem))]">{node}</div>
      </TableCell>
    </TableRow>
  )

  let body: React.ReactNode
  if (status === "loading") {
    body = Array.from({ length: loadingRowCount }, (_, i) => (
      <TableRow key={`loading-${i}`} aria-hidden="true" data-slot="data-table-loading-row">
        {leafColumns.map((column) => (
          <TableCell key={column.id} style={pinStyle(column, false)} className={pinEdge(column)}>
            {/* 読み込み後の文字の行と同じ高さの Skeleton。行全体は aria-hidden にし、読み込み中は aria-busy と状態の文で伝える。 */}
            <Skeleton className="h-4 w-3/4 max-w-40 rounded-sm" />
          </TableCell>
        ))}
      </TableRow>
    ))
  } else if (status === "error") {
    body = messageRow(error ?? <DataTableMessage tone="error" title="データを取得できませんでした" />, "error")
  } else if (rows.length === 0) {
    body = isFiltered
      ? messageRow(noResults ?? <DataTableMessage title="条件に一致するデータがありません" />, "no-results")
      : messageRow(empty ?? <DataTableMessage title="データがありません" />, "empty")
  } else {
    body = rows.map((row) => {
      const openable = Boolean(onRowOpen) && (canOpenRow?.(row) ?? true)
      const active = activeRowId != null && activeRowId === row.id
      return (
        <TableRow
          key={row.id}
          data-row-id={row.id}
          interactive={openable}
          data-state={row.getIsSelected() ? "selected" : undefined}
          data-active={active || undefined}
          aria-current={active ? "true" : undefined}
          onClick={openable ? (e) => handleRowClick(e, row) : undefined}
        >
          {row.getVisibleCells().map((cell) => {
            const meta = cell.column.columnDef.meta
            return (
              <TableCell
                key={cell.id}
                align={meta?.align}
                style={pinStyle(cell.column, false)}
                className={cn(pinEdge(cell.column), meta?.cellClassName)}
              >
                <FlexRender cell={cell} />
              </TableCell>
            )
          })}
        </TableRow>
      )
    })
  }

  return (
    <DataTableContext.Provider value={context}>
      <p role="status" className="sr-only" data-slot="data-table-announcement">
        {status === "loading" ? "読み込み中" : status === "refreshing" ? "更新中" : announcement}
      </p>
      <Table
        data-slot="data-table"
        variant={variant}
        density={density}
        bordered={bordered}
        aria-busy={status === "loading" || status === "refreshing" || undefined}
        containerClassName={containerClassName}
        // 幅を固定した列では、文節（auto-phrase）がセルの幅を超えるときだけ、文節の途中でも折り返す。
        className={cn(fixed && "table-fixed [&_td]:[overflow-wrap:anywhere]", className)}
        style={fixed ? { width: `max(100%, ${table.getTotalSize()}px)` } : undefined}
      >
        {caption && <TableCaption className={cn(!captionVisible && "sr-only")}>{caption}</TableCaption>}
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const column = header.column
                const meta = column.columnDef.meta
                const sorted = column.getIsSorted()
                // 列幅は layout="fixed" のときだけ描画に反映される。auto の表には区切りを表示しない。
                const resizable = fixed && column.getCanResize()
                return (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    align={meta?.align}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    data-pinned={column.getIsPinned() || undefined}
                    style={pinStyle(column, true)}
                    className={cn("group/head", resizable && "relative", pinEdge(column), meta?.headerClassName)}
                  >
                    {header.isPlaceholder ? null : <FlexRender header={header} />}
                    {resizable && !header.isPlaceholder && <DataTableResizeHandle header={header} />}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>{body}</TableBody>
      </Table>
    </DataTableContext.Provider>
  )
}

// 並べ替えのボタン。押すたびに、昇順 → 降順 → 解除（初めの向きは列の sortDescFirst）。
// 現在の向きは th の aria-sort とアイコンで示す。
function DataTableColumnHeader<TData extends RowData, TValue extends CellData>({
  column,
  title,
  className,
}: {
  column: Column<DataTableFeatures, TData, TValue>
  title?: React.ReactNode
  className?: string
}) {
  const label = title ?? columnLabel(column)
  if (!column.getCanSort()) return <span className={className}>{label}</span>
  const sorted = column.getIsSorted()
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown
  const right = column.columnDef.meta?.align === "right"
  return (
    <button
      type="button"
      data-slot="data-table-column-header"
      data-sorted={sorted || undefined}
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "-mx-2 inline-flex min-h-8 items-center gap-1 rounded-sm px-2 text-caption font-medium whitespace-nowrap text-muted-foreground",
        "transition-[color,background-color] duration-(--duration-fast) ease-standard",
        "outline-none hover:bg-accent hover:text-accent-foreground focus-visible:focus-ring data-sorted:text-foreground",
        right && "flex-row-reverse",
        className
      )}
    >
      {label}
      <Icon aria-hidden="true" className={cn("size-4", !sorted && "text-muted-foreground")} />
    </button>
  )
}

// 列の幅を変える区切り。ドラッグ、タッチに加え、フォーカスして ← → キーで 16px ずつ（Shift で 64px）変える。
// ダブルクリックと Enter で元の幅に戻す。
function DataTableResizeHandle<TData extends RowData>({ header }: { header: Header<DataTableFeatures, TData, any> }) {
  const column = header.column
  const handler = header.getResizeHandler()
  const min = column.columnDef.minSize ?? 80
  const max = column.columnDef.maxSize ?? 640
  const size = column.getSize()
  const resize = (next: number) =>
    header.getContext().table.setColumnSizing((old) => ({ ...old, [column.id]: Math.min(Math.max(next, min), max) }))
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`${columnLabel(column)}の列幅`}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${size}px`}
      tabIndex={0}
      data-slot="data-table-resize-handle"
      data-resizing={column.getIsResizing() || undefined}
      onMouseDown={handler}
      onTouchStart={handler}
      onDoubleClick={() => column.resetSize()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16
        if (e.key === "ArrowLeft") resize(size - step)
        else if (e.key === "ArrowRight") resize(size + step)
        else if (e.key === "Enter") column.resetSize()
        else return
        e.preventDefault()
      }}
      className={cn(
        "absolute inset-y-0 end-0 z-[2] flex w-4 cursor-col-resize touch-none items-center justify-center select-none",
        "rounded-xs outline-none focus-visible:focus-ring",
        "after:h-5 after:w-0.5 after:rounded-full after:bg-border-strong",
        "opacity-0 transition-opacity duration-(--duration-fast) group-hover/head:opacity-100 focus-visible:opacity-100 data-resizing:opacity-100 pointer-coarse:opacity-100",
        "data-resizing:after:bg-primary"
      )}
    />
  )
}

// ページ内の全選択。一部を選んでいるときは Indeterminate。
// 選ぶのは表示中のページの行だけで、検索条件に一致する全データではない（DataTableSelectionBar を参照）。
function DataTablePageCheckbox<TData extends RowData>({
  table,
  label = "このページの行をすべて選択",
}: {
  table: DataTableInstance<TData>
  label?: string
}) {
  const all = table.getIsAllPageRowsSelected()
  const some = table.getIsSomePageRowsSelected()
  return (
    <Checkbox
      aria-label={label}
      checked={all}
      indeterminate={some && !all}
      disabled={table.getRowModel().rows.length === 0}
      onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
    />
  )
}

// 行の選択。選択は行の ID（getRowId）で管理する。並べ替えやページ移動で、別の行が選ばれない。
function DataTableRowCheckbox<TData extends RowData>({ row, label }: { row: DataTableRow<TData>; label: string }) {
  return (
    <Checkbox
      aria-label={label}
      checked={row.getIsSelected()}
      disabled={!row.getCanSelect()}
      onCheckedChange={(checked) => row.toggleSelected(checked)}
    />
  )
}

// 行の詳細を開くボタン。キーボードで詳細を開く手段として、行の主要な列（会社名など）に置く。
function DataTableRowTrigger<TData extends RowData>({
  row,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "onClick"> & { row: DataTableRow<TData> }) {
  const { openRow, activeRowId } = React.useContext(DataTableContext)
  if (!openRow) return <>{children}</>
  return (
    <button
      type="button"
      data-slot="data-table-row-trigger"
      aria-haspopup="dialog"
      aria-expanded={activeRowId === row.id}
      onClick={() => openRow(row)}
      className={cn(
        "rounded-xs text-left font-medium text-foreground underline-offset-4 [word-break:auto-phrase]",
        "outline-none hover:underline focus-visible:focus-ring",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

type DataTableSelectionBarProps = {
  /** 選択中の件数。表示していないページの行も含む */
  selectedCount: number
  /** 選択中のうち、いま表示していない件数（別のページ、絞り込みで隠れた行） */
  hiddenCount?: number
  onClearSelection: () => void
  /**
   * ページ内をすべて選んだとき、検索条件に一致する全データの選択を提案する。
   * サーバー側のページ送りでは、読み込んでいない行を ID で選べないため、「全データを選択中」の状態を製品が持つ。
   */
  selectAll?: {
    /** 検索条件に一致する全データの件数 */
    matchingCount: number
    /** ページ内のすべての行を選んでいる */
    pageAllSelected: boolean
    /** 検索条件に一致する全データを選択中 */
    allSelected: boolean
    onSelectAll: () => void
  }
  /** 一括操作のボタン */
  children?: React.ReactNode
  className?: string
}

const countFormat = new Intl.NumberFormat("ja-JP")

// 選択件数と一括操作。1 件以上選んだときだけ表示する。
// 表示件数の行と同じ位置に置き、表の位置がずれないようにする（docs/web/components/data-table.md）。
// 狭い画面では、一括操作のボタンをアイコンだけにして 1 行に収める（文字は支援技術に残す）。
function DataTableSelectionBar({ selectedCount, hiddenCount = 0, onClearSelection, selectAll, children, className }: DataTableSelectionBarProps) {
  if (selectedCount === 0 && !selectAll?.allSelected) return null
  const all = selectAll?.allSelected
  const count = all ? selectAll!.matchingCount : selectedCount
  return (
    <div
      role="region"
      aria-label="選択した行の操作"
      data-slot="data-table-selection-bar"
      className={cn("flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4", className)}
    >
      <p aria-live="polite" className="text-ui font-medium tabular-nums">
        {all ? `検索条件に一致する ${countFormat.format(count)}件をすべて選択中` : `${countFormat.format(count)}件を選択中`}
        {!all && hiddenCount > 0 && (
          <span className="font-normal text-muted-foreground">（表示していない {countFormat.format(hiddenCount)}件を含む）</span>
        )}
      </p>
      {selectAll && selectAll.pageAllSelected && !all && selectAll.matchingCount > selectedCount && (
        <Button variant="link" size="sm" onClick={selectAll.onSelectAll}>
          検索条件に一致する {countFormat.format(selectAll.matchingCount)}件をすべて選択
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        選択を解除
      </Button>
      {children && <div className="flex flex-wrap items-center gap-2 sm:ms-auto">{children}</div>}
    </div>
  )
}

// 検索欄。一覧の上に置く。プレースホルダーには検索の対象を書く（「会社名で検索」）。
// IME で変換中は onValueChange を呼ばず、確定した値で呼ぶ。サーバー側の検索の遅延（debounce）は製品が行う。
function DataTableSearch({
  value,
  onValueChange,
  placeholder,
  label,
  className,
  inputClassName,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  /** 支援技術に伝える名前。既定はプレースホルダー */
  label?: string
  inputClassName?: string
}) {
  const [draft, setDraft] = React.useState(value)
  const composing = React.useRef(false)
  const emitted = React.useRef(value)

  // 「すべて解除」などで外から値が変わったときに、表示を合わせる。
  React.useEffect(() => {
    if (!composing.current && value !== emitted.current) {
      emitted.current = value
      setDraft(value)
    }
  }, [value])

  const emit = (next: string) => {
    if (next === emitted.current) return
    emitted.current = next
    onValueChange(next)
  }

  return (
    <div data-slot="data-table-search" className={cn("relative w-full min-w-0", className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          if (!composing.current && !(e.nativeEvent as InputEvent).isComposing) emit(e.target.value)
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={(e) => {
          composing.current = false
          emit(e.currentTarget.value)
        }}
        className={cn("pl-12 [&::-webkit-search-cancel-button]:cursor-pointer", inputClassName)}
        {...props}
      />
    </div>
  )
}

type AppliedFilter = {
  id: string
  /** 条件の名前（「地域」） */
  label: string
  /** 条件の値（「関東」） */
  value: string
  onRemove: () => void
}

// 適用中の条件。個別に表示しているフィルター（Select など）の値は重複して並べない。
// Popover や Sheet の中にまとめた条件だけを、解除できる形で示す。
function DataTableAppliedFilters({
  filters,
  onClearAll,
  className,
}: {
  filters: AppliedFilter[]
  /** 指定すると「すべて解除」を表示する。検索と個別のフィルターも含めて解除する */
  onClearAll?: () => void
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const pendingFocus = React.useRef<number | null>(null)

  // 解除したボタンが消えた後、同じ位置のボタン（なければ前、最後は「すべて解除」）にフォーカスを移す。
  React.useEffect(() => {
    if (pendingFocus.current === null || !ref.current) return
    const buttons = ref.current.querySelectorAll<HTMLButtonElement>("button")
    const target = buttons[Math.min(pendingFocus.current, buttons.length - 1)]
    pendingFocus.current = null
    ;(target ?? ref.current).focus()
  })

  if (filters.length === 0 && !onClearAll) return null
  return (
    <div
      ref={ref}
      role="group"
      aria-label="適用中の条件"
      tabIndex={-1}
      data-slot="data-table-applied-filters"
      className={cn("flex flex-wrap items-center gap-2 outline-none", className)}
    >
      {filters.map((filter, index) => (
        <button
          key={filter.id}
          type="button"
          aria-label={`${filter.label}：${filter.value}の条件を解除`}
          onClick={() => {
            pendingFocus.current = index
            filter.onRemove()
          }}
          className={cn(
            "inline-flex min-h-8 items-center gap-1 rounded-sm bg-secondary py-1 ps-3 pe-2 text-ui text-secondary-foreground",
            "transition-[background-color] duration-(--duration-fast) ease-standard",
            "outline-none hover:bg-[color-mix(in_srgb,var(--secondary)_94%,var(--foreground))] focus-visible:focus-ring pointer-coarse:min-h-10"
          )}
        >
          <span className="[word-break:auto-phrase]">
            {filter.label}：{filter.value}
          </span>
          <X aria-hidden="true" className="size-4" />
        </button>
      ))}
      {onClearAll && (
        <Button variant="ghost" size="xs" onClick={onClearAll} className="pointer-coarse:min-h-10">
          すべて解除
        </Button>
      )}
    </div>
  )
}

// 列の表示・非表示、並び替え、固定。Popover などの中に置く。
// 並び替えはドラッグではなくボタンで行う。enableHiding: false の列（識別に必要な列）は隠せない。
// meta.label のない列（選択、行の操作）は対象にしない。
function DataTableColumnOptions<TData extends RowData>({
  table,
  reorder = true,
  pin = true,
  className,
}: {
  table: DataTableInstance<TData>
  reorder?: boolean
  pin?: boolean
  className?: string
}) {
  const ref = React.useRef<HTMLUListElement>(null)
  const columns = table.getAllLeafColumns().filter((c) => c.columnDef.meta?.label)
  const focusAfter = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!focusAfter.current || !ref.current) return
    const el = ref.current.querySelector<HTMLElement>(`[data-focus-key="${focusAfter.current}"]`)
    focusAfter.current = null
    el?.focus()
  })

  const move = (id: string, dir: -1 | 1) => {
    const order = table.getAllLeafColumns().map((c) => c.id)
    const movable = columns.filter((c) => !c.getIsPinned()).map((c) => c.id)
    const neighbor = movable[movable.indexOf(id) + dir]
    if (!neighbor) return
    const a = order.indexOf(id)
    const b = order.indexOf(neighbor)
    ;[order[a], order[b]] = [order[b], order[a]]
    focusAfter.current = `${id}:${dir}`
    table.setColumnOrder(order)
  }

  const unpinned = columns.filter((c) => !c.getIsPinned())
  return (
    <ul ref={ref} data-slot="data-table-column-options" aria-label="列の設定" className={cn("flex flex-col", className)}>
      {columns.map((column) => {
        const label = columnLabel(column)
        const pinned = column.getIsPinned()
        const index = unpinned.indexOf(column)
        return (
          <li key={column.id} className="flex min-h-control items-center gap-1">
            <Field orientation="horizontal" className="flex-1">
              <Checkbox
                checked={column.getIsVisible()}
                disabled={!column.getCanHide()}
                onCheckedChange={(checked) => column.toggleVisibility(checked)}
              />
              <FieldLabel className="text-ui font-normal [word-break:auto-phrase]">
                {label}
                {!column.getCanHide() && <span className="text-muted-foreground">（常に表示）</span>}
              </FieldLabel>
            </Field>
            {pin && column.getCanPin() && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${label}を左端に固定`}
                aria-pressed={pinned === "start"}
                data-focus-key={`${column.id}:pin`}
                onClick={() => {
                  focusAfter.current = `${column.id}:pin`
                  column.pin(pinned ? false : "start")
                }}
                className="pointer-coarse:size-12"
              >
                {pinned ? <PinOff /> : <Pin />}
              </Button>
            )}
            {reorder && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${label}を左へ移動`}
                  data-focus-key={`${column.id}:-1`}
                  disabled={Boolean(pinned) || index <= 0}
                  onClick={() => move(column.id, -1)}
                  className="pointer-coarse:size-12"
                >
                  <ArrowLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${label}を右へ移動`}
                  data-focus-key={`${column.id}:1`}
                  disabled={Boolean(pinned) || index < 0 || index >= unpinned.length - 1}
                  onClick={() => move(column.id, 1)}
                  className="pointer-coarse:size-12"
                >
                  <ArrowRight />
                </Button>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// Pagination を表の状態につなぐ。クライアント側では絞り込み後の件数、サーバー側では rowCount を総件数にする。
// サーバー側で rowCount を渡さない（総件数がわからない）場合は、総件数とページ数を表示しない。
function DataTablePagination<TData extends RowData>({
  table,
  pageSizeOptions,
  hasNextPage,
  disabled,
  className,
}: {
  table: DataTableInstance<TData>
  pageSizeOptions?: readonly number[]
  /** 総件数がわからないときに、次のページがあるか */
  hasNextPage?: boolean
  disabled?: boolean
  className?: string
}) {
  const { pageIndex, pageSize } = table.atoms.pagination.get()
  const known = !table.options.manualPagination || table.options.rowCount !== undefined
  const onPageChange = React.useCallback((page: number) => table.setPageIndex(page - 1), [table])
  return (
    <PaginationControls
      className={className}
      page={pageIndex + 1}
      pageSize={pageSize}
      totalCount={known ? table.getRowCount() : undefined}
      hasNextPage={hasNextPage}
      disabled={disabled}
      pageSizeOptions={pageSizeOptions}
      onPageChange={onPageChange}
      onPageSizeChange={(size, page) => table.setPagination({ pageIndex: page - 1, pageSize: size })}
    />
  )
}

// 取得失敗、データ未登録、検索結果なしの表示。表の本文の中に置く。
// 取得失敗は Feedback の Alert（destructive）で、原因と再試行の手段を示す。0 件の表示と混同させない。
// データ未登録と検索結果なしは、見出しと説明と次の操作だけを置く（独立した Empty コンポーネントは対象外）。
function DataTableMessage({
  title,
  description,
  action,
  tone = "default",
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  tone?: "default" | "error"
  className?: string
}) {
  if (tone === "error") {
    return (
      <div data-slot="data-table-message-content" data-tone={tone} className={cn("py-6", className)}>
        <Alert variant="destructive" role="alert">
          <AlertTitle>{title}</AlertTitle>
          {description && <AlertDescription>{description}</AlertDescription>}
          {action && <AlertAction>{action}</AlertAction>}
        </Alert>
      </div>
    )
  }
  return (
    <div data-slot="data-table-message-content" data-tone={tone} className={cn("flex flex-col items-start gap-2 py-10", className)}>
      <p className="text-body font-medium">{title}</p>
      {description && <p className="text-ui text-muted-foreground [word-break:auto-phrase]">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
    </div>
  )
}

// 再取得中の表示。表示中のデータを残したまま、更新していることを示す。
function DataTableRefreshing({ className, children = "更新中" }: { className?: string; children?: React.ReactNode }) {
  return (
    <span data-slot="data-table-refreshing" className={cn("inline-flex items-center gap-2 text-ui text-muted-foreground", className)}>
      <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
      {children}
    </span>
  )
}

// 選択の件数をまとめる。selectedCount はすべてのページ、hiddenCount は現在の表示に含まれない件数。
function getSelectionSummary<TData extends RowData>(table: DataTableInstance<TData>) {
  const selectedIds = table.getSelectedRowIds()
  const visible = table.getRowModel().rows.filter((r) => r.getIsSelected()).length
  return {
    selectedIds,
    selectedCount: selectedIds.length,
    visibleSelectedCount: visible,
    hiddenCount: selectedIds.length - visible,
    pageAllSelected: table.getRowModel().rows.length > 0 && table.getIsAllPageRowsSelected(),
  }
}

export {
  DataTable,
  DataTableAppliedFilters,
  DataTableColumnHeader,
  DataTableColumnOptions,
  DataTableMessage,
  DataTablePageCheckbox,
  DataTablePagination,
  DataTableRefreshing,
  DataTableResizeHandle,
  DataTableRowCheckbox,
  DataTableRowTrigger,
  DataTableSearch,
  DataTableSelectionBar,
  dataTableDefaults,
  dataTableFeatures,
  getSelectionSummary,
}
export type { AppliedFilter, DataTableColumnMeta, DataTableFeatures, DataTableInstance, DataTableRow, DataTableStatus }
