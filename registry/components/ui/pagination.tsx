import * as React from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Ellipsis } from "lucide-react"

import { Button, buttonVariants, type ButtonProps } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

// Flow Design Pagination
// shadcn/ui（Base UI 版）の Pagination と同じ名前と構造（Pagination、PaginationContent、PaginationItem、
// PaginationLink、PaginationPrevious、PaginationNext、PaginationEllipsis）。Flow Design では次を追加している。
// - PaginationLink：href があれば <a>、なければ <button>。選択中のページは Primary、aria-current="page"
// - PaginationFirst、PaginationLast：最初と最後のページへの移動
// - PaginationControls：表示範囲、総件数、表示件数、ページ番号をまとめた標準の組み合わせ
// - CursorPagination：総件数とページ数を取得しない、前後だけの移動
// - getPaginationItems：省略記号を含むページ番号の並び。並びの長さを一定にして、ボタンの位置を動かさない
// 操作ボタンは 40px。指で操作する端末では 48px。
// 定義は docs/web/components/pagination.md を参照。

function Pagination({ className, "aria-label": ariaLabel = "ページ送り", ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label={ariaLabel} data-slot="pagination" className={cn("flex min-w-0", className)} {...props} />
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="pagination-content" className={cn("flex items-center gap-1", className)} {...props} />
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

// 40px（指で操作する端末では 48px）。ページ番号は桁が増えても幅が足りるよう、最小の幅で指定する。
const controlClass = "min-h-10 min-w-10 px-2 pointer-coarse:min-h-12 pointer-coarse:min-w-12 rounded-md"

type PaginationLinkProps = Omit<ButtonProps, "size" | "variant"> & {
  isActive?: boolean
  /** 指定すると <a> で描画する。URL でページを表す場合に使う */
  href?: string
}

function PaginationLink({ className, isActive = false, href, disabled, children, ...props }: PaginationLinkProps) {
  const classes = cn(controlClass, "tabular-nums", className)
  const variant = isActive ? "default" : "ghost"
  // URL でページを表す場合はリンクとして描画する（Base UI の Button に描画させると role="button" になるため）。
  // 無効のリンクは href を外し、aria-disabled で伝える。
  if (href !== undefined) {
    const { "aria-label": ariaLabel, onClick, id, title } = props as React.ComponentProps<"a">
    return (
      <a
        href={disabled ? undefined : href}
        aria-label={ariaLabel}
        aria-current={isActive ? "page" : undefined}
        aria-disabled={disabled || undefined}
        data-slot="pagination-link"
        data-active={isActive || undefined}
        id={id}
        title={title}
        onClick={disabled ? undefined : onClick}
        className={buttonVariants({
          variant,
          size: "sm",
          className: cn(classes, "aria-disabled:pointer-events-none aria-disabled:opacity-50"),
        })}
      >
        {children}
      </a>
    )
  }
  return (
    <Button
      {...(props as ButtonProps)}
      variant={variant}
      size="sm"
      data-slot="pagination-link"
      data-active={isActive || undefined}
      aria-current={isActive ? "page" : undefined}
      disabled={disabled}
      className={classes}
    >
      {children}
    </Button>
  )
}

function PaginationPrevious({
  className,
  text = "前へ",
  ...props
}: PaginationLinkProps & { text?: string }) {
  return (
    <PaginationLink className={cn("gap-1 sm:pr-3", className)} {...props}>
      <ChevronLeft />
      {/* 狭い画面ではアイコンだけを表示し、文字は支援技術に残す。 */}
      <span className="sr-only sm:not-sr-only">{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({ className, text = "次へ", ...props }: PaginationLinkProps & { text?: string }) {
  return (
    <PaginationLink className={cn("gap-1 sm:pl-3", className)} {...props}>
      <span className="sr-only sm:not-sr-only">{text}</span>
      <ChevronRight />
    </PaginationLink>
  )
}

function PaginationFirst(props: PaginationLinkProps) {
  return (
    <PaginationLink aria-label="最初のページ" {...props}>
      <ChevronsLeft />
    </PaginationLink>
  )
}

function PaginationLast(props: PaginationLinkProps) {
  return (
    <PaginationLink aria-label="最後のページ" {...props}>
      <ChevronsRight />
    </PaginationLink>
  )
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn("flex size-10 items-center justify-center text-muted-foreground pointer-coarse:size-12", className)}
      {...props}
    >
      <Ellipsis className="size-5" />
    </span>
  )
}

// ページを移動した後のフォーカスの維持。押したボタンが無効になったとき（最初、最後のページに着いたとき）や
// 並びが変わってボタンが消えたときに、フォーカスが body に移らないよう、現在のページか、残っているボタンへ移す。
function useKeepFocus() {
  const ref = React.useRef<HTMLElement>(null)
  const pending = React.useRef(false)
  const mark = () => {
    pending.current = Boolean(ref.current?.contains(document.activeElement))
  }
  React.useEffect(() => {
    if (!pending.current) return
    pending.current = false
    const root = ref.current
    const active = document.activeElement as HTMLElement | null
    // 無効になったボタンは、ブラウザが後からフォーカスを外す（その時点ではまだ activeElement のことがある）。
    if (!root || (active && root.contains(active) && !active.matches(":disabled"))) return
    const target =
      root.querySelector<HTMLElement>("[aria-current=page]") ?? root.querySelector<HTMLElement>("button:not(:disabled), a[href]")
    target?.focus()
  })
  return { ref, mark }
}

type PaginationItemValue = number | "ellipsis-start" | "ellipsis-end"

// 最初と最後のページ、現在のページとその前後 siblingCount ページを並べ、間を省略記号にする。
// 並びの長さは 5 + siblingCount × 2 で一定。ページ数がそれ以下なら、すべてのページを並べる。
function getPaginationItems(page: number, pageCount: number, siblingCount = 1): PaginationItemValue[] {
  const slots = 5 + siblingCount * 2
  if (pageCount <= slots) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const current = Math.min(Math.max(page, 1), pageCount)
  const start = Math.max(Math.min(current - siblingCount, pageCount - 2 - siblingCount * 2), 3)
  const end = Math.min(Math.max(current + siblingCount, 3 + siblingCount * 2), pageCount - 2)
  const items: PaginationItemValue[] = [1]
  items.push(start > 3 ? "ellipsis-start" : 2)
  for (let p = start; p <= end; p++) items.push(p)
  items.push(end < pageCount - 2 ? "ellipsis-end" : pageCount - 1)
  items.push(pageCount)
  return items
}

const numberFormat = new Intl.NumberFormat("ja-JP")
const formatCount = (n: number) => numberFormat.format(n)

// 表示件数を変えたとき、いま表示している先頭の項目が含まれるページへ移る。
function pageForPageSize(page: number, pageSize: number, nextPageSize: number) {
  return Math.floor(((page - 1) * pageSize) / nextPageSize) + 1
}

// 640px 未満の幅か。サーバーでの描画と Hydration の間は false（広い画面の並び）にし、
// その後にブラウザの幅に合わせる。初めの描画でサーバーとブラウザの HTML を一致させるため。
const NARROW_QUERY = "(max-width: 39.99rem)"
function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(NARROW_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}
function useNarrow() {
  return React.useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false
  )
}

function PageSizeSelect({
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  unit,
  disabled = false,
}: {
  pageSize: number
  pageSizeOptions: readonly number[]
  onPageSizeChange: (size: number) => void
  unit: string
  disabled?: boolean
}) {
  const id = React.useId()
  const items = pageSizeOptions.map((n) => ({ value: n, label: `${formatCount(n)}${unit}` }))
  return (
    <div data-slot="pagination-page-size" className="flex items-center gap-2">
      <span id={id} className="text-ui whitespace-nowrap text-muted-foreground">
        表示件数
      </span>
      <Select items={items} value={pageSize} disabled={disabled} onValueChange={(v) => v != null && onPageSizeChange(Number(v))}>
        <SelectTrigger size="sm" aria-labelledby={id} className="w-auto min-w-28 text-ui pointer-coarse:min-h-12">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

type PaginationControlsProps = {
  /** 現在のページ。1 から数える */
  page: number
  pageSize: number
  /** 総件数。取得していない場合は undefined にする。推測した値を渡さない */
  totalCount?: number
  /** 総件数がわからないときに、次のページがあるか */
  hasNextPage?: boolean
  onPageChange: (page: number) => void
  /** 指定すると、表示件数の選択を表示する */
  onPageSizeChange?: (pageSize: number, page: number) => void
  pageSizeOptions?: readonly number[]
  /** 現在のページの前後に並べるページ数。狭い画面では 0 になる */
  siblingCount?: number
  /** 最初と最後のページへの移動。既定はページ数が 7 を超えるとき */
  showFirstLast?: boolean
  /** 件数の単位 */
  unit?: string
  /** 処理中。移動の操作を受け付けない */
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

// 表示範囲、総件数、表示件数、ページ番号をまとめた標準の組み合わせ。表の下に置く。
function PaginationControls({
  page,
  pageSize,
  totalCount,
  hasNextPage = false,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  siblingCount = 1,
  showFirstLast,
  unit = "件",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: PaginationControlsProps) {
  const narrow = useNarrow()
  const keep = useKeepFocus()
  const go = (p: number) => {
    keep.mark()
    onPageChange(p)
  }
  const known = totalCount !== undefined
  const pageCount = known ? Math.max(1, Math.ceil(totalCount / pageSize)) : undefined
  const current = pageCount ? Math.min(Math.max(page, 1), pageCount) : Math.max(page, 1)

  // 絞り込みなどでページ数が減ったとき、存在しないページを表示しない。
  React.useEffect(() => {
    if (pageCount !== undefined && page > pageCount) onPageChange(pageCount)
  }, [page, pageCount, onPageChange])

  const empty = known && totalCount === 0
  const from = (current - 1) * pageSize + 1
  const to = known ? Math.min(current * pageSize, totalCount) : current * pageSize
  const canPrev = !disabled && current > 1
  const canNext = !disabled && (pageCount !== undefined ? current < pageCount : hasNextPage)
  const items = pageCount !== undefined && !empty ? getPaginationItems(current, pageCount, narrow ? 0 : siblingCount) : []
  const firstLast = (showFirstLast ?? (pageCount ?? 0) > 7) && !narrow

  let rangeText: string
  let rangeLabel: string
  if (empty) {
    rangeText = `0${unit}`
    rangeLabel = `0${unit}`
  } else if (known) {
    rangeText = `${formatCount(from)}–${formatCount(to)} / ${formatCount(totalCount)}${unit}`
    rangeLabel = `${formatCount(totalCount)}${unit}中 ${formatCount(from)}〜${formatCount(to)}${unit}目`
  } else {
    // 総件数がわからない場合は、現在のページの範囲だけを示す。総件数とページ数は推測しない。
    rangeText = `${formatCount(from)}–${formatCount(to)}${unit}目`
    rangeLabel = rangeText
  }

  return (
    <div
      data-slot="pagination-controls"
      className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-3", className)}
    >
      <p data-slot="pagination-range" aria-live="polite" className="text-ui tabular-nums whitespace-nowrap">
        <span aria-hidden="true">{rangeText}</span>
        <span className="sr-only">{rangeLabel}</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {onPageSizeChange && (
          <PageSizeSelect
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            unit={unit}
            disabled={disabled}
            onPageSizeChange={(size) => onPageSizeChange(size, pageForPageSize(current, pageSize, size))}
          />
        )}
        <Pagination aria-label={ariaLabel} ref={keep.ref as React.Ref<HTMLElement>}>
          <PaginationContent>
            {firstLast && (
              <PaginationItem>
                <PaginationFirst disabled={!canPrev} onClick={() => go(1)} />
              </PaginationItem>
            )}
            <PaginationItem>
              <PaginationPrevious disabled={!canPrev} onClick={() => go(current - 1)} />
            </PaginationItem>
            {items.map((item) =>
              typeof item === "number" ? (
                <PaginationItem key={item}>
                  <PaginationLink
                    isActive={item === current}
                    disabled={disabled && item !== current}
                    aria-label={`${item}ページ目`}
                    onClick={() => item !== current && go(item)}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationEllipsis />
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext disabled={!canNext} onClick={() => go(current + 1)} />
            </PaginationItem>
            {firstLast && pageCount !== undefined && (
              <PaginationItem>
                <PaginationLast disabled={!canNext} onClick={() => go(pageCount)} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

type CursorPaginationProps = {
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
  /** 現在のページに表示している件数。指定すると「50件を表示中」と示す */
  shownCount?: number
  pageSize?: number
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: readonly number[]
  unit?: string
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

// カーソルによる前後の移動。総件数、ページ数、現在の位置を取得しない一覧で使う。
// 取得していない値を推測して表示しない。
function CursorPagination({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  shownCount,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  unit = "件",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: CursorPaginationProps) {
  const keep = useKeepFocus()
  return (
    <div
      data-slot="cursor-pagination"
      className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-3", className)}
    >
      <p data-slot="pagination-range" aria-live="polite" className="text-ui tabular-nums whitespace-nowrap">
        {shownCount !== undefined ? `${formatCount(shownCount)}${unit}を表示中` : null}
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {onPageSizeChange && pageSize !== undefined && (
          <PageSizeSelect
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            unit={unit}
            disabled={disabled}
            onPageSizeChange={onPageSizeChange}
          />
        )}
        <Pagination aria-label={ariaLabel} ref={keep.ref as React.Ref<HTMLElement>}>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                disabled={disabled || !hasPrevious}
                onClick={() => {
                  keep.mark()
                  onPrevious()
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                disabled={disabled || !hasNext}
                onClick={() => {
                  keep.mark()
                  onNext()
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

export {
  CursorPagination,
  Pagination,
  PaginationContent,
  PaginationControls,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  getPaginationItems,
  pageForPageSize,
}
export type { CursorPaginationProps, PaginationControlsProps, PaginationItemValue }
