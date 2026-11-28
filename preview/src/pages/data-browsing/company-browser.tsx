import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react"
import { useTable, type ColumnPinningState, type ColumnVisibilityState } from "@tanstack/react-table"
import { CalendarDays, ChevronDown, Ellipsis, Kanban, SlidersHorizontal, Table2, Trash2, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DataTable,
  DataTableAppliedFilters,
  DataTableMessage,
  DataTablePagination,
  DataTableSearch,
  DataTableSelectionBar,
  dataTableDefaults,
  dataTableFeatures,
} from "@/components/ui/data-table"
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToast } from "@/components/ui/toast"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { useBrowseData, useDelayedFlag } from "@/patterns/browse-data"
import { useBrowseQuery, useFilterDraft } from "@/patterns/browse-query"
import { BulkResultAlert, BulkRunStatus } from "@/patterns/bulk-actions"
import { isBulkFullySucceeded, useBulkAction, useBulkSelection } from "@/patterns/bulk-selection"
import { ConfirmActionDialog } from "@/patterns/confirm-action"
import { DataRefreshIndicator, DataRegionError, LoadingReveal } from "@/patterns/data-states"
import { captureListPosition, getRecordNeighbors, useListPositionRestore, type ListPosition } from "@/patterns/list-detail"
import { TableScrollArea } from "@/patterns/table-scroll-area"
import { ViewSwitcher, useViewScopedState, type ViewOption } from "@/patterns/view-switcher"

import { owners, statusOptions, type ContractStatus, type Customer } from "../../data/data-display/customers"
import {
  defaultCompanyFilters,
  listCompanies,
  runCompanyBulk,
  type CompanyFilters,
  type CompanyPage,
  type CompanyPatch,
  type CompanyQuery,
} from "../../data/data-browsing/company-server"
import {
  ExtraFilterFields,
  FilterSelect,
  RowActionContext,
  companyColumns,
  hiddenAppliedFilters,
  ownerOptions,
  statusSelectOptions,
  type RowAction,
} from "./company-parts"
import { CompanyDetailSheet } from "./company-detail"
import { BoardView, CalendarView } from "./company-views"

// 顧客の一覧（製品側のコード）。Data Browsing の 5 種類を組み合わせる。
// Registry の部品（@/patterns/*、@/components/ui/*）を使い、模擬のサーバー（data/data-browsing）からデータを受け取る。
// 製品の責務として、この画面が行うこと：要求（listCompanies）、URL への同期（onStateChange）、一覧の位置の保存（onLeave）。

export type BrowseView = "table" | "board" | "calendar"

export const viewOptions: ViewOption<BrowseView>[] = [
  { value: "table", label: "表", icon: <Table2 /> },
  { value: "board", label: "カンバン", icon: <Kanban /> },
  { value: "calendar", label: "カレンダー", icon: <CalendarDays /> },
]

export type BrowserSnapshot = {
  /**
   * 記録したときのスコープ（この画面ではワークスペース。製品ではアカウント、ワークスペース、権限の版を含める）。
   * 製品は、現在のスコープと一致する場合だけ、この記録を一覧に渡す
   */
  scope: string
  query: CompanyQuery
  view: BrowseView
  calendarMonth: string
  position: ListPosition | null
  /** 一覧に戻ったときに、取得し直す間も表示するデータ（同じ条件の結果）。useBrowseData の initialData にそのまま渡す */
  page: { data: CompanyPage; key: string; fetchedAt: number | null; scope: string } | null
  /** ID で選んだ行（全件の選択は記録しない。戻ったときに、対象を検索結果の全件へ広げない） */
  selectedIds: string[]
}

type Features = {
  bulk?: boolean
  views?: boolean
  /** 別ページの詳細へのリンク */
  detailPage?: boolean
}

const withSelect = companyColumns({ selectable: true })
const withoutSelect = companyColumns({ selectable: false })
const pinning: ColumnPinningState = { start: ["select", "company"], end: [] }
const narrowHidden: ColumnVisibilityState = { region: false, phone: false }
const fmt = (n: number) => n.toLocaleString("ja-JP")
const selectionKey = (q: CompanyQuery) => JSON.stringify({ search: q.search, filters: q.filters })

export function CompanyBrowser({
  testId,
  workspace,
  features = {},
  initial,
  initialQuery,
  initialView = "table",
  scrollElement,
  onStateChange,
  onOpenPage,
  pageHref,
  pageSize = 20,
  refetchToken,
}: {
  testId: string
  workspace: string
  features?: Features
  /** 一覧に戻ったときの復元（製品が保存した値） */
  initial?: BrowserSnapshot | null
  /** URL から読み取った条件 */
  initialQuery?: Partial<CompanyQuery>
  initialView?: BrowseView
  /** 縦のスクロールの領域（AppShellMain）。ない場合は document */
  scrollElement?: RefObject<HTMLElement | null>
  /** 条件と表示形式が変わったとき（URL への同期は製品が行う） */
  onStateChange?: (query: CompanyQuery, view: BrowseView) => void
  /** 別ページの詳細を開く。離れる前の一覧の状態を渡す */
  onOpenPage?: (id: string, snapshot: BrowserSnapshot) => void
  pageHref?: (id: string) => string
  pageSize?: number
  /** 変わったら、同じ条件で取得し直す（検証用の操作。現在のページを維持する） */
  refetchToken?: number
}) {
  const { bulk: bulkEnabled = false, views = false, detailPage = false } = features
  const mobile = useIsMobile()
  const { toast } = useToast()
  const root = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const docScroll = useRef<HTMLElement | null>(typeof document === "undefined" ? null : (document.scrollingElement as HTMLElement))
  const scroller = scrollElement ?? docScroll

  // ---------------------------------------------------------------- Search & Filter
  const browse = useBrowseQuery<CompanyFilters>({
    defaultFilters: defaultCompanyFilters,
    initialQuery: initial?.query ?? { pagination: { pageIndex: 0, pageSize }, ...initialQuery },
    debounceMs: 300,
    defaultPageSize: pageSize,
  })
  const q = browse.query
  const [view, setView] = useState<BrowseView>(initial?.view ?? initialView)
  // 表示形式に固有の状態：カレンダーの表示期間（表のページ番号は query の pagination で持つ）。
  const [calendarMonth, setCalendarMonth] = useViewScopedState<"calendar", string>("calendar", () => initial?.calendarMonth ?? "2026-12")

  const stateCallback = useRef(onStateChange)
  stateCallback.current = onStateChange
  useEffect(() => stateCallback.current?.(q, view), [q, view])

  const setFilter = (patch: Partial<CompanyFilters>) => browse.setFilters(patch)
  const extraDraft = useFilterDraft({
    value: q.filters,
    defaultValue: defaultCompanyFilters,
    onApply: (f) => browse.setFilters(f),
  })
  const applied = hiddenAppliedFilters(q.filters, setFilter, { includeFrequent: mobile })
  // 隠れている適用済みの条件の数（Chip の数と同じ）を、追加の条件のボタンに示す。
  const extraCount = applied.length
  const clearAll = () => {
    browse.clearAll()
    // 解除のボタンは押すと消えるため、条件を入力し直す起点の検索欄へフォーカスを移す。
    searchRef.current?.focus()
  }

  // ---------------------------------------------------------------- Data States
  const data = useBrowseData({
    query: q,
    fetcher: (query, { signal }) => listCompanies(workspace, query, signal),
    scopeKey: workspace,
    enabled: view === "table",
    // 記録したときのスコープ（page.scope）が現在のワークスペースと異なる場合、useBrowseData は使わずに初回の読み込みにする。
    initialData: initial?.page ?? undefined,
  })
  // 戻ったときの復元の対象の条件のキー（useBrowseData の既定のキーと同じ）。表示中のデータがこの条件の結果のときだけ位置を戻す。
  const [restoreKey] = useState(() => (initial?.position ? JSON.stringify(q) : null))
  const reloadRef = useRef(data.reload)
  reloadRef.current = data.reload
  useEffect(() => {
    if (refetchToken) reloadRef.current()
  }, [refetchToken])
  const page = data.data
  const rows = useMemo(() => page?.rows ?? [], [page])
  const total = data.isCurrent ? (page?.total ?? null) : null
  // 古いデータ（再取得中、取得失敗、同じ条件の再取得の失敗）に依存する操作は、すぐに制限する。
  // isCurrent（表示できる）ではなく canOperate（最新の取得に成功した）で判断する。読み込みの表示だけを 200ms 遅らせる。
  const locked = view === "table" && !data.canOperate
  const showLoading = useDelayedFlag(data.status === "loading" || data.status === "refreshing")
  // 読み込み中の Skeleton の行数。同じスコープと条件の総件数がわかっている場合は、表示予定の行数にする（表の下の内容を動かさない）。
  // 最後に確定した総件数（commit した描画の値）。記録は効果の中で行い、描画の中では読むだけにする。
  const knownTotal = useRef<{ scope: string; key: string; total: number } | null>(null)
  useLayoutEffect(() => {
    if (data.isCurrent && page && page.total !== null) knownTotal.current = { scope: workspace, key: selectionKey(q), total: page.total }
  })
  const known = knownTotal.current
  const expectedRows =
    known && known.scope === workspace && known.key === selectionKey(q)
      ? Math.max(1, Math.min(q.pagination.pageSize, known.total - q.pagination.pageIndex * q.pagination.pageSize))
      : q.pagination.pageSize
  // 最後のページの行がなくなった（一括削除、ほかの利用者の削除）場合は、未登録や 0 件と表示せず、最後のページへ戻して取得し直す。
  const outOfRange = data.isCurrent && rows.length === 0 && q.pagination.pageIndex > 0
  useEffect(() => {
    if (!outOfRange) return
    const known = page?.total
    const last = known != null ? Math.max(0, Math.ceil(known / q.pagination.pageSize) - 1) : q.pagination.pageIndex - 1
    // 最後のページの番号を絶対値で指定する（Pagination が範囲の外のページを戻した場合と重ねて引かない）。
    browse.onPaginationChange((p) => ({ ...p, pageIndex: known != null ? last : Math.min(last, p.pageIndex) }))
  }, [outOfRange]) // eslint-disable-line react-hooks/exhaustive-deps

  // 行の名前（結果の表示、確認の文）。表示した行から覚えておく（表示していない行は件数で示す）。
  const names = useRef(new Map<string, string>())
  for (const r of rows) names.current.set(r.id, r.company)
  const nameOf = (id: string) => names.current.get(id) ?? id

  // ---------------------------------------------------------------- Bulk Actions
  const selection = useBulkSelection({
    queryKey: selectionKey(q),
    query: q,
    scopeKey: workspace,
    visibleIds: view === "table" ? rows.map((r) => r.id) : [],
    total,
  })
  // 戻ったとき：ID で選んでいた行の選択を戻す。記録は、製品が同じスコープの場合だけ渡す（initial）。
  // 条件（検索語、フィルター）も記録した値で始まるため、選択の条件と一致する。全件の選択は記録しない（対象を広げない）。
  const restoredSelection = useRef(false)
  useEffect(() => {
    if (restoredSelection.current) return
    restoredSelection.current = true
    const ids = initial?.scope === workspace ? (initial?.selectedIds ?? []) : []
    if (ids.length > 0) selection.onRowSelectionChange(() => Object.fromEntries(ids.map((id) => [id, true])))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // 操作の内容。結果（summary）に保存し、再試行で同じ内容を使う。
  type Payload = { kind: "patch"; patch: CompanyPatch } | { kind: "delete" } | { kind: "restore-owner"; owners: Record<string, string> }
  const previousOwners = useRef<Record<string, string>>({})
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  // すべて完了し、結果に不足も矛盾もない場合だけ、Toast だけで知らせる。
  const allDone = isBulkFullySucceeded
  // 押したボタンが消えたとき（実行の開始、選択が 0 件になった後）に、フォーカスを <body> に落とさない。
  const keepFocus = (target: () => HTMLElement | null) => {
    let frames = 0
    const check = () => {
      const active = document.activeElement
      if (!active || active === document.body || !document.contains(active)) target()?.focus()
      else if (frames++ < 20) requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }
  const action = useBulkAction<CompanyQuery, Payload>({
    scopeKey: workspace,
    run: (target, context) => {
      const payload = context.payload
      previousOwners.current = {}
      // 要求の宛先は、固定した対象のスコープ（描画の時点のワークスペースではない）。
      return runCompanyBulk(
        target.scope ?? workspace,
        target,
        (c) => {
          if (payload.kind === "patch") {
            if (payload.patch.owner) previousOwners.current[c.id] = c.owner
            Object.assign(c, payload.patch)
          } else if (payload.kind === "restore-owner") {
            c.owner = payload.owners[c.id] ?? c.owner
          }
        },
        context,
        payload.kind === "delete"
      )
    },
    onSettled: (summary) => {
      selection.settle(summary)
      data.reload()
      if (allDone(summary)) {
        // すべて完了：選択を解除し、Toast で知らせる。取り消せる低リスクの変更（担当者）は「元に戻す」を示す。
        const owners = { ...previousOwners.current }
        const undo = summary.payload.kind === "patch" && summary.payload.patch.owner && Object.keys(owners).length > 0
        toast({
          variant: "success",
          title: `${fmt(summary.succeeded.length)}件の${summary.action}が完了しました`,
          action: undo
            ? {
                label: "元に戻す",
                onClick: () => {
                  // 変更したときのワークスペースで取り消す。別のワークスペースに切り替えた後は実行しない。
                  const scope = summary.target.scope
                  if (scope !== workspaceRef.current) {
                    toast({ title: "別のワークスペースに切り替えたため、元に戻せません", description: "元のワークスペースで、担当者を変更し直してください。" })
                    return
                  }
                  void action.start("担当者の変更の取り消し", { kind: "ids", ids: Object.keys(owners), scope }, { kind: "restore-owner", owners })
                },
              }
            : undefined,
        })
        keepFocus(() => root.current?.querySelector<HTMLElement>("[data-slot=data-table-row-trigger]") ?? searchRef.current)
      } else {
        // 失敗や不明を含む結果は、一覧の上に残す。押したボタンが消えた場合は、結果の表示へフォーカスを移す。
        keepFocus(() => resultRef.current)
      }
    },
  })
  const running = action.running !== null
  const [confirmDelete, setConfirmDelete] = useState(false)
  // 削除の確認の対象のキー：スコープ、ID の一覧（件数が同じでも ID が違えば変わる）、全件の選択は条件、除外した ID、件数。
  // 確認の表示中に対象か件数が変わったら、ConfirmActionDialog が確かめ直させる。
  const deleteKey = JSON.stringify(
    selection.mode === "ids"
      ? ["ids", workspace, [...selection.selectedIds].sort()]
      : ["query", workspace, selectionKey(q), [...selection.excludedIds].sort(), selection.count]
  )
  const startAction = (label: string, payload: Payload) => {
    void action.start(label, selection.snapshot(), payload)
    keepFocus(() => root.current?.querySelector<HTMLElement>("[data-slot=bulk-run-status]") ?? null)
  }

  // モバイルの一括操作のバー（画面の下）の高さだけ、Toast を上げる。
  const bottomBar = useRef<HTMLDivElement>(null)
  const showBottomBar = mobile && bulkEnabled && view === "table" && selection.hasSelection
  useLayoutEffect(() => {
    const el = bottomBar.current
    if (!showBottomBar || !el) return
    const set = () => document.documentElement.style.setProperty("--toast-offset-bottom", `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty("--toast-offset-bottom")
    }
  }, [showBottomBar])

  // ---------------------------------------------------------------- List & Detail
  // 詳細を表示中の行は、ワークスペースと組で持つ。別のワークスペースに切り替えた描画から、前の行の詳細を開かない。
  const [open, setOpen] = useState<{ workspace: string; id: string } | null>(null)
  const openId = open && open.workspace === workspace ? open.id : null
  const setOpenId = (id: string | null) => setOpen(id === null ? null : { workspace, id })
  const openRow = rows.find((r) => r.id === openId) ?? null
  const neighbors = getRecordNeighbors({ ids: rows.map((r) => r.id), activeId: openId, offset: page?.offset ?? 0, total })
  const lastOpen = useRef<string | null>(null)
  if (openId) lastOpen.current = openId
  const rowTrigger = () =>
    lastOpen.current ? (root.current?.querySelector<HTMLElement>(`[data-row-id="${lastOpen.current}"] :is([data-slot=data-table-row-trigger],[data-row-focus])`) ?? null) : null

  const snapshot = (rowId: string | null): BrowserSnapshot => ({
    scope: workspace,
    query: q,
    view,
    calendarMonth,
    position: captureListPosition({ scrollElement: scroller.current, root: root.current, rowId }),
    // 取得した時刻も記録する（戻った後の再取得に失敗したとき、「前回」ではなく取得した時刻を示す）。
    page: data.isCurrent && page && data.dataKey ? { data: page, key: data.dataKey, fetchedAt: data.fetchedAt, scope: workspace } : null,
    selectedIds: selection.mode === "ids" ? [...selection.selectedIds] : [],
  })
  const openPage = (id: string, event?: MouseEvent) => {
    if (!onOpenPage) return
    if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return
    event?.preventDefault()
    onOpenPage(id, snapshot(id))
  }

  // 一覧に戻ったとき：データの表示が終わってから、スクロールの位置とフォーカスを戻す。
  // 復元の前に利用者が操作を始めたら（読み込み中に検索欄へ入力した場合など）、復元を取りやめる（useListPositionRestore）。
  useListPositionRestore({
    position: initial?.position ?? null,
    // 保持していたデータで先に表示し、取得し直した結果（行の削除などを反映した結果）が届いてから、フォーカスを戻す。
    ready: view === "table" ? data.isCurrent : true,
    // 保持していたデータ（同じ条件の行）を表示している間に、スクロールの位置だけを先に戻す。
    scrollReady: view === "table" && data.data !== undefined && data.dataKey === restoreKey,
    // 条件が変わった後の結果には、前の条件の位置を当てはめない。
    targetKey: view === "table" ? restoreKey : null,
    dataKey: view === "table" ? data.dataKey : null,
    root,
    scrollElement: scroller,
    fallbackFocus: () => root.current?.querySelector<HTMLElement>("[data-slot=empty-content] button") ?? searchRef.current,
  })

  // 保存の応答は、保存したワークスペースのデータにだけ反映する。
  const onSaved = (saved: Customer) =>
    data.setData((p) => ({ ...p, rows: p.rows.map((r) => (r.id === saved.id ? saved : r)) }), { scopeKey: workspace })

  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns: bulkEnabled ? withSelect : withoutSelect,
    data: rows,
    getRowId: (row) => row.id,
    state: {
      sorting: q.sorting,
      pagination: q.pagination,
      rowSelection: selection.rowSelection,
      columnPinning: pinning,
      columnVisibility: mobile ? narrowHidden : {},
      // 狭い画面では、固定する会社名の列を細くし、横にスクロールする範囲を残す。
      columnSizing: mobile ? { company: 168 } : {},
    },
    onSortingChange: browse.onSortingChange,
    onPaginationChange: browse.onPaginationChange,
    onRowSelectionChange: selection.onRowSelectionChange,
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    rowCount: total ?? undefined,
    autoResetPageIndex: false,
    enableRowSelection: bulkEnabled,
  })

  // ---------------------------------------------------------------- 表示
  const selectedLabel = selection.count === null ? "検索結果すべて" : `${fmt(selection.count)}件`
  // 件数の行を、一括操作のバーが入りきらない幅では、あらかじめ 2 行にする（モバイルは一括操作のバーを画面の下に置くため対象外）。
  const stackStatus = bulkEnabled && !mobile
  const bar = bulkEnabled && view === "table" && selection.hasSelection && (
    <DataTableSelectionBar
      // 幅を内容に合わせ、一括操作を件数のすぐ右に置く（行の中央に離して置かない）。
      className="min-w-0"
      // 一括操作は、表示中の行が最新の条件の結果と確定している間だけ受け付ける（再取得中、取得失敗の間は無効）。
      disabled={locked}
      disabledReason={data.refreshFailed ? "再取得するまで操作できません" : undefined}
      selectedCount={selection.mode === "ids" ? (selection.count ?? 0) : 0}
      hiddenCount={selection.hiddenCount ?? 0}
      onClearSelection={selection.clear}
      selectAll={{
        matchingCount: total ?? undefined,
        hasMore: page?.hasNextPage || (page?.offset ?? 0) > 0,
        pageAllSelected: selection.pageAllSelected,
        allSelected: selection.allMatching,
        excludedCount: selection.excludedIds.length,
        onSelectAll: selection.selectAllMatching,
      }}
    >
      {running ? (
        <BulkRunStatus action={action.running!.action} count={action.running!.target.kind === "ids" ? action.running!.target.ids.length : action.running!.target.expectedCount} progress={action.progress} />
      ) : (
        <>
          {/* よく使う操作を直接置き、その他はメニューにまとめる。Secondary と Ghost を基本にする */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="secondary" size="sm" data-testid={`${testId}-bulk-owner`} />}>
              <UserRound />
              <span className="max-sm:sr-only">担当者を変更</span>
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{selectedLabel}の担当者を変更</DropdownMenuLabel>
                {owners.map((o) => (
                  <DropdownMenuItem key={o} onClick={() => startAction("担当者の変更", { kind: "patch", patch: { owner: o } })}>
                    {o}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="その他の一括操作" data-testid={`${testId}-bulk-more`} />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>契約状況を変更</DropdownMenuLabel>
                {statusOptions.map((s) => (
                  <DropdownMenuItem key={s.value} onClick={() => startAction("契約状況の変更", { kind: "patch", patch: { status: s.value as ContractStatus } })}>
                    {s.label}にする
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </DataTableSelectionBar>
  )

  const countText =
    data.status === "loading"
      ? "読み込み中"
      : data.status === "error"
        ? "件数を取得できませんでした"
        : page?.total === null || page?.total === undefined
          ? // 総件数がわからない場合は、架空の件数を示さない。表示中の範囲だけを示す。
            rows.length > 0
            ? `${fmt((page?.offset ?? 0) + 1)}〜${fmt((page?.offset ?? 0) + rows.length)}件目を表示中`
            : "0件"
          : `${fmt(page.total)}件`

  const switcher = views && (
    <ViewSwitcher
      data-testid={`${testId}-views`}
      value={view}
      onValueChange={setView}
      options={viewOptions}
      // 狭い画面ではアイコンだけにする（名前は aria-label と Tooltip）。
      iconOnly={mobile}
    />
  )

  const tableEmpty = (
    <DataTableMessage
      title="顧客はまだ登録されていません"
      // Page Header に「顧客を登録」がある場合は、ここに同じ操作を重複して置かない。
      description="登録した顧客が、ここに表示されます。"
    />
  )
  const noResults = (
    <DataTableMessage
      title="条件に一致する顧客はいません"
      description={q.search ? `「${q.search}」に一致する顧客はいません。検索語や条件を変えてください。` : "条件を変えてください。"}
      action={
        <Button variant="outline" size="sm" onClick={clearAll}>
          検索語と条件をすべて解除
        </Button>
      }
    />
  )

  return (
    <RowActionContext.Provider
      value={(a: RowAction, c) => {
        if (a === "open-page") {
          if (onOpenPage) openPage(c.id)
          else toast({ title: "この例では、詳細ページを開かない", description: "検証画面では別ページの詳細を開けます。" })
        } else {
          void navigator.clipboard?.writeText(c.id).catch(() => undefined)
          toast({ variant: "success", title: `顧客ID ${c.id} をコピーしました` })
        }
      }}
    >
      <div ref={root} data-testid={testId} className="flex min-w-0 flex-col gap-4">
        {/* ---------------------------------------- 検索と条件 */}
        <div role="search" aria-label="顧客の検索と絞り込み" className="flex flex-wrap items-center gap-3">
          <DataTableSearch
            ref={searchRef}
            data-testid={`${testId}-search`}
            className="sm:max-w-80"
            placeholder="会社名・電話番号で検索"
            value={browse.searchInput}
            onValueChange={browse.setSearchInput}
          />
          {!mobile && (
            <>
              <FilterSelect
                label="契約状況"
                testId={`${testId}-status`}
                value={q.filters.status}
                options={statusSelectOptions}
                onChange={(v) => setFilter({ status: v as ContractStatus | null })}
              />
              <FilterSelect label="担当者" testId={`${testId}-owner`} value={q.filters.owner} options={ownerOptions} onChange={(v) => setFilter({ owner: v })} />
            </>
          )}
          <Button variant="outline" className="text-ui" data-testid={`${testId}-more`} onClick={() => extraDraft.onOpenChange(true)}>
            <SlidersHorizontal />
            {mobile ? "条件" : "その他の条件"}
            {extraCount > 0 && <span className="tabular-nums">（{extraCount}）</span>}
          </Button>
        </div>

        {(applied.length > 0 || browse.isFiltered) && (
          <div className="flex flex-wrap items-center gap-2" data-testid={`${testId}-applied`}>
            <DataTableAppliedFilters filters={applied} />
            {/* 解除の範囲を名前で示す。検索語がある場合は、検索語も含めて解除する */}
            <Button variant="ghost" size="xs" onClick={clearAll} className="pointer-coarse:min-h-10" data-testid={`${testId}-clear`}>
              {q.search ? "検索語と条件をすべて解除" : "条件をすべて解除"}
            </Button>
          </div>
        )}

        {selection.notice && (
          <p role="status" className="text-ui text-muted-foreground" data-testid={`${testId}-selection-notice`}>
            {selection.notice}
          </p>
        )}

        {action.summary && !allDone(action.summary) && (
          <div ref={resultRef} tabIndex={-1} className="outline-none">
            <BulkResultAlert
              summary={action.summary}
              getItemLabel={nameOf}
              onRetryFailed={() => void action.retryFailed()}
              retrying={running}
              onCheckLatest={data.reload}
              onDismiss={() => {
                action.dismiss()
                searchRef.current?.focus()
              }}
            />
          </div>
        )}

        {data.refreshFailed && view === "table" && (
          <DataRegionError
            variant="warning"
            title="最新の内容を取得できませんでした"
            description={`${data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "前回"}の時点の内容を表示しています。`}
            onRetry={data.reload}
            data-testid={`${testId}-refresh-error`}
          />
        )}

        {/* ---------------------------------------- 件数、一括操作、表示形式（データ領域の直上・右） */}
        {/*
          2 つの列の grid：左の列（件数、または一括操作のバー）は列の中で折り返し、右の列（更新中、表示形式の切り替え）は折り返さない。
          一括操作のバーが件数の行に入りきらない幅（行の容器の幅で判断する）では、あらかじめ 2 行にし、
          1 行目に件数か一括操作のバー（全幅）、2 行目の右に表示形式の切り替えを置く。行を選んだ・ページの全件を選んだ・
          再取得に失敗した時点で行の高さが変わらないため、表の位置が動かない（続けて押した位置が別の行にならない）。
          右の列の並び順：更新中 →（エクスポートの入口を置く場合は、ここ）→ 表示形式の切り替え（右端。データ領域の右端にそろえる）。
        */}
        <div className={cn(stackStatus && "@container/status")}>
          <div
            className={cn(
              "grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2",
              stackStatus && (views ? "@max-[70rem]/status:grid-cols-1" : "@max-[50rem]/status:grid-cols-1")
            )}
            data-testid={`${testId}-status-row`}
          >
            <div className="flex min-h-12 min-w-0 items-center">
              {bar && !showBottomBar ? (
                bar
              ) : view === "table" ? (
                <p
                  className={cn("text-ui tabular-nums", !data.isCurrent && data.status !== "loading" && "text-muted-foreground")}
                  data-testid={`${testId}-count`}
                  data-stale={(!data.isCurrent && data.status !== "loading") || undefined}
                >
                  {countText}
                </p>
              ) : (
                selection.hasSelection && (
                  // 一括操作に対応しない表示形式でも、選択を無言で隠さない。
                  <p className="text-ui" data-testid={`${testId}-selection-kept`}>
                    {selectedLabel}を選択中。一括操作は表で行えます。
                    <Button variant="link" size="sm" onClick={() => setView("table")}>
                      表に切り替える
                    </Button>
                    <Button variant="link" size="sm" onClick={selection.clear}>
                      選択を解除
                    </Button>
                  </p>
                )
              )}
              {/* 常に置いた読み上げの領域。検索のたびに重ならないよう、件数は結果が確定したときだけ入れる。一括操作の開始もここで伝える */}
              <p className="sr-only" aria-live="polite" data-testid={`${testId}-announce`}>
                {running ? `${action.running!.action}を実行中` : view === "table" && data.isCurrent ? countText : ""}
              </p>
            </div>
            <div className="flex items-center justify-self-end gap-3">
              {view === "table" && <DataRefreshIndicator active={data.status === "refreshing"} />}
              {switcher}
            </div>
          </div>
        </div>

        {/* ---------------------------------------- データ領域 */}
        {view === "table" ? (
          <>
            <LoadingReveal loading={data.status === "loading"}>
              <TableScrollArea data-testid={`${testId}-scroll`}>
                <DataTable
                  table={table}
                  layout="fixed"
                  status={outOfRange ? "refreshing" : data.status === "idle" ? "loading" : data.status}
                  locked={locked}
                  filtered={browse.isFiltered}
                  caption="顧客の一覧"
                  onRowOpen={(row) => setOpenId(row.id)}
                  activeRowId={openId}
                  // 表示予定の行数の Skeleton にする（高さを保つ）。総件数がわかっている場合は、最後のページの行数に合わせる。
                  loadingRowCount={expectedRows}
                  empty={tableEmpty}
                  noResults={noResults}
                  error={
                    <DataTableMessage
                      status="error"
                      title="顧客の一覧を取得できませんでした"
                      description="サーバーに接続できませんでした。時間をおいて、もう一度お試しください。"
                      action={
                        <Button variant="outline" size="sm" onClick={data.reload}>
                          再試行
                        </Button>
                      }
                    />
                  }
                />
              </TableScrollArea>
            </LoadingReveal>
            <div className={cn("transition-opacity duration-(--duration-fast)", showLoading && data.status === "refreshing" && "opacity-60")}>
              <DataTablePagination
                table={table}
                pageSizeOptions={[20, 50, 100]}
                hasNextPage={page?.hasNextPage}
                disabled={data.status === "loading" || data.status === "error"}
              />
            </div>
          </>
        ) : view === "board" ? (
          <BoardView
            workspace={workspace}
            query={q}
            filtered={browse.isFiltered}
            activeId={openId}
            onOpen={setOpenId}
            onClearAll={clearAll}
            refetchToken={refetchToken}
            testId={`${testId}-board`}
          />
        ) : (
          <CalendarView
            workspace={workspace}
            query={q}
            filtered={browse.isFiltered}
            activeId={openId}
            onOpen={setOpenId}
            onClearAll={clearAll}
            refetchToken={refetchToken}
            testId={`${testId}-calendar`}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
          />
        )}

        {showBottomBar && (
          // モバイル：選択中だけ、画面の下に一括操作のバーを置く。main の中の sticky のため、最後の行と Pagination を隠さない。
          <div
            ref={bottomBar}
            data-testid={`${testId}-bottom-bar`}
            className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-background px-4 pt-2 pb-[max(0.5rem,var(--app-safe-bottom,env(safe-area-inset-bottom)))]"
          >
            {bar}
          </div>
        )}

        {/* ---------------------------------------- 追加の条件（まとめて適用） */}
        {mobile ? (
          <Drawer open={extraDraft.open} onOpenChange={extraDraft.onOpenChange}>
            <DrawerContent data-testid={`${testId}-filters`}>
              <DrawerHeader>
                <DrawerTitle>条件</DrawerTitle>
              </DrawerHeader>
              <DrawerBody>
                <ExtraFilterFields value={extraDraft.draft} onChange={extraDraft.set} includeFrequent />
              </DrawerBody>
              <DrawerFooter>
                <Button variant="ghost" onClick={extraDraft.clear}>
                  条件をクリア
                </Button>
                <Button onClick={extraDraft.apply}>適用する</Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : (
          <Sheet mode="edit" open={extraDraft.open} onOpenChange={extraDraft.onOpenChange}>
            <SheetContent size="sm" data-testid={`${testId}-filters`} closeLabel="条件を閉じる">
              <SheetHeader>
                <SheetTitle>その他の条件</SheetTitle>
                <SheetDescription>「適用する」を押すと、一覧に反映します。閉じると、変更した条件は破棄します。</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <ExtraFilterFields value={extraDraft.draft} onChange={extraDraft.set} />
              </SheetBody>
              <SheetFooter>
                <Button variant="ghost" onClick={extraDraft.clear}>
                  条件をクリア
                </Button>
                <Button onClick={extraDraft.apply} data-testid={`${testId}-apply`}>
                  適用する
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        )}

        {/* ---------------------------------------- 危険な一括操作の確認 */}
        {/*
          ConfirmActionDialog（progress="external"）：実行を始めた時点で閉じ、進捗と結果は一覧の上に示す。
          確認の表示中に対象（ID、条件、件数）が変わったら、変わったことを示し、確かめ直すまで実行させない（targetKey）。
        */}
        <ConfirmActionDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          variant="destructive"
          progress="external"
          title={`${selectedLabel}の顧客を削除しますか？`}
          description={
            <>
              {selection.mode === "ids"
                ? `対象：${selection.selectedIds.slice(0, 3).map(nameOf).join("、")}${selection.selectedIds.length > 3 ? ` ほか ${fmt(selection.selectedIds.length - 3)}件` : ""}。`
                : `対象：現在の検索条件に一致する顧客${selection.excludedIds.length ? `（選択を外した ${fmt(selection.excludedIds.length)}件を除く）` : ""}。`}
              削除すると元に戻せません。契約と請求の履歴も表示できなくなります。
            </>
          }
          confirmLabel={`${selectedLabel}を削除する`}
          targetKey={deleteKey}
          data-testid={`${testId}-confirm-delete`}
          finalFocus={() => resultRef.current ?? searchRef.current ?? true}
          onConfirm={({ targetKey }) => {
            // 確かめた対象（表示していた targetKey）と、実行の時点の対象が一致し、操作を受け付けられる場合だけ実行する。
            // 確認の間に再取得が始まった、選択がなくなった、別の実行が始まった場合は、実行しない。
            if (targetKey !== deleteKey || locked || running || !selection.hasSelection) {
              toast({ title: "削除を実行していません", description: "一覧の状態が変わりました。選択と一覧を確かめてから、もう一度実行してください。" })
              return
            }
            startAction("削除", { kind: "delete" })
          }}
        />

        <CompanyDetailSheet
          workspace={workspace}
          openId={openId}
          listRow={openRow}
          neighbors={view === "table" ? neighbors : { previousId: null, nextId: null, position: null, total: null }}
          onSwitch={setOpenId}
          onClose={() => setOpenId(null)}
          returnFocus={rowTrigger}
          pageHref={detailPage ? pageHref : undefined}
          onOpenPage={(id, e) => openPage(id, e)}
          onSaved={onSaved}
        />
      </div>
    </RowActionContext.Provider>
  )
}
