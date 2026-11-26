"use client"

import * as React from "react"
import type { PaginationState, SortingState, Updater } from "@tanstack/react-table"

// Flow Design Browse Query（Patterns / Data Browsing / Search & Filter）
// 一覧の検索語、フィルター、ソート、ページ番号、ページサイズを 1 つの値（BrowseQuery）として持つ。
// 定義と判断基準は docs/web/patterns/search-and-filter.md を参照。
//
// この部品が持つもの
// - 検索欄の入力値（searchInput）と、実際に適用した検索語（query.search）の区別。
//   入力が止まってから debounceMs（既定 300ms。クライアント側の軽い検索は 0）後に適用する。
//   IME の変換中の値は、DataTableSearch が onValueChange を呼ばないため、ここにも届かない。
// - 条件（検索語、フィルター、ソート）を変えたときに、1 ページ目に戻すこと。
// - Data Table（useTable）の state と on*Change にそのまま渡せる sorting と pagination。
//   Data Table の状態の仕組みを置き換えない。表の外で持つ条件を、表と要求の両方に渡す。
//
// この部品が持たないもの（製品の責務）
// - データの取得（useBrowseData か、製品のデータ取得の仕組み）
// - URL への同期と保存。query と onQueryChange で制御し、製品の方法で保存する。
//   電話番号や個人情報を含みうる検索語は、URL に無条件に入れない。

type BrowseQuery<F> = {
  /** 適用した検索語（前後の空白を除く）。要求にはこの値を使う */
  search: string
  filters: F
  sorting: SortingState
  pagination: PaginationState
}

type FilterPatch<F> = Partial<F> | ((filters: F) => F)

type UseBrowseQueryOptions<F> = {
  /** フィルターの既定値。解除したときにこの値に戻る */
  defaultFilters: F
  /** 最初の値（一覧に戻ったときの復元、URL から読み取った値）。制御しない場合に使う */
  initialQuery?: Partial<BrowseQuery<F>>
  /** 制御する場合の値。製品が URL などと同期する */
  query?: BrowseQuery<F>
  onQueryChange?: (query: BrowseQuery<F>) => void
  /**
   * 入力が止まってから検索語を適用するまでの時間（ms）。サーバー側の検索は 300（既定）。
   * クライアント側の軽い検索は 0 にし、不必要に待たせない。
   */
  debounceMs?: number
  /** 自動では適用せず、applySearch（検索ボタン、Enter）で適用する。高負荷・高コストな検索に使う */
  manualSearch?: boolean
  /** 既定のページサイズ。既定は 50 */
  defaultPageSize?: number
  /**
   * ページサイズを変えたときのページ番号。
   * keep-position … 表示していた先頭の行を含むページへ移る（既定。Pagination v0.1 の仕様）
   * first-page … 1 ページ目に戻す
   */
  pageSizeChange?: "keep-position" | "first-page"
}

const normalizeSearch = (value: string) => value.trim()

function resolve<T>(updater: Updater<T>, old: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(old) : updater
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]))
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

/** 既定値から変わっているフィルターの数。keys を渡すと、その条件だけを数える（追加フィルターの件数の表示など） */
function countActiveFilters<F extends object>(filters: F, defaults: F, keys?: readonly (keyof F)[]) {
  const list = keys ?? (Object.keys(defaults) as (keyof F)[])
  return list.filter((k) => !sameValue(filters[k], defaults[k])).length
}

function useBrowseQuery<F extends object>({
  defaultFilters,
  initialQuery,
  query: controlledQuery,
  onQueryChange,
  debounceMs = 300,
  manualSearch = false,
  defaultPageSize = 50,
  pageSizeChange = "keep-position",
}: UseBrowseQueryOptions<F>) {
  const [internal, setInternal] = React.useState<BrowseQuery<F>>(() => ({
    search: normalizeSearch(initialQuery?.search ?? ""),
    filters: initialQuery?.filters ?? defaultFilters,
    sorting: initialQuery?.sorting ?? [],
    pagination: initialQuery?.pagination ?? { pageIndex: 0, pageSize: defaultPageSize },
  }))
  const query = controlledQuery ?? internal
  const queryRef = React.useRef(query)
  queryRef.current = query
  const onChangeRef = React.useRef(onQueryChange)
  onChangeRef.current = onQueryChange
  const defaultsRef = React.useRef(defaultFilters)
  defaultsRef.current = defaultFilters

  const controlled = controlledQuery !== undefined
  const update = React.useCallback(
    (next: (q: BrowseQuery<F>) => BrowseQuery<F>) => {
      const value = next(queryRef.current)
      if (value === queryRef.current) return
      queryRef.current = value
      if (!controlled) setInternal(value)
      onChangeRef.current?.(value)
    },
    [controlled]
  )

  // 検索欄の入力値。適用した検索語とは別に持つ。
  const [searchInput, setSearchInputState] = React.useState(query.search)
  const applied = React.useRef(query.search)

  // 「すべて解除」や一覧への復帰などで、適用した検索語が外から変わったときに、入力値を合わせる。
  React.useEffect(() => {
    if (query.search !== applied.current) {
      applied.current = query.search
      setSearchInputState(query.search)
    }
  }, [query.search])

  const commitSearch = React.useCallback(
    (value: string) => {
      const search = normalizeSearch(value)
      applied.current = search
      update((q) => (q.search === search ? q : { ...q, search, pagination: { ...q.pagination, pageIndex: 0 } }))
    },
    [update]
  )

  // 入力が止まってから適用する。0 のときは入力のたびに適用する。
  React.useEffect(() => {
    if (manualSearch || debounceMs <= 0) return
    if (normalizeSearch(searchInput) === queryRef.current.search) return
    const timer = setTimeout(() => commitSearch(searchInput), debounceMs)
    return () => clearTimeout(timer)
  }, [searchInput, debounceMs, manualSearch, commitSearch])

  const setSearchInput = React.useCallback(
    (value: string) => {
      setSearchInputState(value)
      if (!manualSearch && debounceMs <= 0) commitSearch(value)
    },
    [manualSearch, debounceMs, commitSearch]
  )

  /** 入力中の検索語をすぐに適用する（検索ボタン、Enter） */
  const applySearch = React.useCallback(() => commitSearch(searchInput), [commitSearch, searchInput])

  const resetPage = (q: BrowseQuery<F>, patch: Partial<BrowseQuery<F>>) => ({
    ...q,
    ...patch,
    pagination: { ...q.pagination, pageIndex: 0 },
  })

  /** フィルターを変えて、すぐに適用する。1 ページ目に戻す */
  const setFilters = React.useCallback(
    (patch: FilterPatch<F>) =>
      update((q) => {
        const filters = typeof patch === "function" ? patch(q.filters) : { ...q.filters, ...patch }
        return sameValue(filters, q.filters) ? q : resetPage(q, { filters })
      }),
    [update]
  )

  /** フィルターだけを既定値に戻す（検索語は残す）。keys を渡すと、その条件だけを戻す */
  const resetFilters = React.useCallback(
    (keys?: readonly (keyof F)[]) =>
      setFilters((f) => {
        if (!keys) return defaultsRef.current
        const next = { ...f }
        for (const k of keys) next[k] = defaultsRef.current[k]
        return next
      }),
    [setFilters]
  )

  /** 検索語とフィルターをすべて解除する。ソートとページサイズは残す */
  const clearAll = React.useCallback(() => {
    applied.current = ""
    setSearchInputState("")
    update((q) =>
      q.search === "" && sameValue(q.filters, defaultsRef.current) ? q : resetPage(q, { search: "", filters: defaultsRef.current })
    )
  }, [update])

  /** useTable の onSortingChange。並べ替えを変えたら 1 ページ目に戻す */
  const onSortingChange = React.useCallback(
    (updater: Updater<SortingState>) =>
      update((q) => {
        const sorting = resolve(updater, q.sorting)
        return sameValue(sorting, q.sorting) ? q : resetPage(q, { sorting })
      }),
    [update]
  )

  /** useTable の onPaginationChange（DataTablePagination からも呼ばれる） */
  const onPaginationChange = React.useCallback(
    (updater: Updater<PaginationState>) =>
      update((q) => {
        const next = resolve(updater, q.pagination)
        const pagination =
          pageSizeChange === "first-page" && next.pageSize !== q.pagination.pageSize ? { ...next, pageIndex: 0 } : next
        return sameValue(pagination, q.pagination) ? q : { ...q, pagination }
      }),
    [update, pageSizeChange]
  )

  /** 条件をまとめて置き換える（一覧への復帰、戻る・進む） */
  const replaceQuery = React.useCallback(
    (next: BrowseQuery<F>) => {
      applied.current = next.search
      setSearchInputState(next.search)
      update(() => next)
    },
    [update]
  )

  const filtersActive = countActiveFilters(query.filters, defaultFilters) > 0
  return {
    /** 適用した条件。要求と useTable にはこの値を使う */
    query,
    /** 検索欄の値（DataTableSearch の value） */
    searchInput,
    /** DataTableSearch の onValueChange（IME の変換が確定した値で呼ばれる） */
    setSearchInput,
    applySearch,
    /** 入力値をまだ適用していない（debounce の待ち、または manualSearch で未実行） */
    isSearchPending: normalizeSearch(searchInput) !== query.search,
    setFilters,
    resetFilters,
    clearAll,
    onSortingChange,
    onPaginationChange,
    replaceQuery,
    /** 検索語かフィルターが適用されている（DataTable の filtered、検索結果 0 件の判断に使う） */
    isFiltered: query.search !== "" || filtersActive,
    filtersActive,
  }
}

type FilterDraftOptions<F> = {
  /** 適用済みの条件（Sheet や Popover にまとめた条件だけでよい） */
  value: F
  /** 「適用」で、編集中の条件を適用する */
  onApply: (value: F) => void
  /** 「条件をクリア」で戻す値 */
  defaultValue: F
}

// 編集中の条件と、適用済みの条件を分ける（複雑な条件をまとめて適用する Sheet、Popover）。
// 開いたときに適用済みの条件を写し、「適用」でまとめて反映する。キャンセル、Escape、外側のクリックで閉じたときは、
// 編集中の条件を破棄する（確認は出さない。適用済みの条件は変わらないため、失われる入力は条件の選択だけである）。
function useFilterDraft<F extends object>({ value, onApply, defaultValue }: FilterDraftOptions<F>) {
  const [open, setOpenState] = React.useState(false)
  const [draft, setDraft] = React.useState<F>(value)

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      // 開くたびに、適用済みの条件から始める。閉じるときは何も反映しない（破棄）。
      if (next) setDraft(value)
      setOpenState(next)
    },
    [value]
  )

  const set = React.useCallback((patch: Partial<F> | ((draft: F) => F)) => {
    setDraft((d) => (typeof patch === "function" ? patch(d) : { ...d, ...patch }))
  }, [])

  const apply = React.useCallback(() => {
    onApply(draft)
    setOpenState(false)
  }, [draft, onApply])

  return {
    open,
    onOpenChange,
    /** 編集中の条件 */
    draft,
    set,
    /** 編集中の条件を既定値に戻す（まだ適用しない） */
    clear: () => setDraft(defaultValue),
    apply,
    /** 適用済みの条件と異なる */
    dirty: !sameValue(draft, value),
    /** 編集中の条件で、既定値から変わっている数 */
    draftCount: countActiveFilters(draft, defaultValue),
  }
}

export { countActiveFilters, useBrowseQuery, useFilterDraft }
export type { BrowseQuery, FilterPatch, UseBrowseQueryOptions }
