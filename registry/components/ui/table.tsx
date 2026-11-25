"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Table
// shadcn/ui の Table と同じ名前と構造（Table、TableHeader、TableBody、TableFooter、TableRow、
// TableHead、TableCell、TableCaption）。Flow Design では次を追加している。
// - variant：横線（lines、既定）と交互の背景色（striped）。製品が画面ごとに選ぶ。件数で自動に切り替えない
// - density：行の最小の高さ。compact 36px、default 48px、comfortable 64px
// - bordered：独立した表として区別するときの外枠（角丸 12px（rounded-md）、1px の境界線）
// - align：セルの文字の配置。right は tabular-nums を付ける
// 行の背景は、セルが CSS 変数 --table-row-bg で塗る。固定した列のセルも同じ色で塗られ、
// 横にスクロールした内容が透けない。
// 定義は docs/web/components/table.md を参照。

type TableVariant = "lines" | "striped"
type TableDensity = "compact" | "default" | "comfortable"
type CellAlign = "left" | "center" | "right"

// 行の状態の面。ブランドカラーに依存しないニュートラルの段階にする（ブランドカラーは Checkbox と詳細表示中の線だけに使う）。
//   通常 background（#fff） < 交互の背景色 muted（#f5f5f5） < ホバー foreground 6%（#f2f2f2）
//   < 選択中 foreground 12%（#e4e4e4） < 選択中のホバー foreground 16%（#dbdbdb）
// ホバーを 6% にしているのは、ホバー中の行でも未選択の Checkbox の枠（input）が 3:1 を保つ上限のため。
// 面が濃くなる行では、補足の文字（muted-foreground）を foreground 75% に濃くして 4.5:1 を保つ。
// 値は製品が containerClassName などで上書きできる。
const rowStateVars = cn(
  "[--table-row-hover:color-mix(in_srgb,var(--foreground)_6%,var(--background))]",
  "[--table-row-selected:color-mix(in_srgb,var(--foreground)_12%,var(--background))]",
  "[--table-row-selected-hover:color-mix(in_srgb,var(--foreground)_16%,var(--background))]",
  "[--table-row-selected-border:color-mix(in_srgb,var(--foreground)_22%,var(--background))]"
)

function Table({
  className,
  variant = "lines",
  density = "default",
  bordered = false,
  containerClassName,
  containerRef,
  ...props
}: React.ComponentProps<"table"> & {
  /** 横線（lines）か交互の背景色（striped）か。既定は lines */
  variant?: TableVariant
  /** 行の最小の高さ。既定は default（48px） */
  density?: TableDensity
  /** 外枠を付ける。独立した表として区別する必要がある場合だけ使う */
  bordered?: boolean
  /** 横スクロールする外側の要素のクラス */
  containerClassName?: string
  containerRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      data-variant={variant}
      data-density={density}
      data-bordered={bordered || undefined}
      className={cn(
        // ページ全体ではなく、表の中だけを横にスクロールする。
        "relative w-full overflow-x-auto overscroll-x-contain",
        "data-[density=compact]:[--table-row-height:2.25rem] data-[density=comfortable]:[--table-row-height:4rem]",
        // 交互の背景色。偶数行を muted にする。差は控えめにし、文字のコントラストは変えない。
        "data-[variant=striped]:[&>table>tbody>tr:nth-child(even)]:[--table-row-base:var(--muted)]",
        "data-bordered:rounded-md data-bordered:border data-bordered:border-border",
        containerClassName
      )}
    >
      <table
        data-slot="table"
        className={cn(
          // border-separate にして、境界線をセルに描く。固定した列（position: sticky）でも線が一緒に動く。
          "w-full caption-bottom border-separate border-spacing-0 text-ui text-foreground",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        // 横線：本文の行の間に 1px の border。外枠があるときは、最後の行の線を外枠と重ねない。
        "[[data-variant=lines]_&>tr>td]:border-b [[data-variant=lines]_&>tr>td]:border-border",
        "[[data-bordered]_&>tr:last-child>td]:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("font-medium [&>tr>td]:border-t [&>tr>td]:border-border", className)}
      {...props}
    />
  )
}

function TableRow({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"tr"> & {
  /** 行を押すと詳細を表示するなど、行が操作の対象になる。ホバーの背景と、指で押す高さ 48px を有効にする */
  interactive?: boolean
}) {
  return (
    <tr
      data-slot="table-row"
      data-interactive={interactive || undefined}
      className={cn(
        "[--table-row-base:var(--background)] [--table-row-bg:var(--table-row-base)]",
        rowStateVars,
        "data-interactive:cursor-pointer",
        "data-interactive:not-data-[state=selected]:hover:[--table-row-bg:var(--table-row-hover)]",
        "data-active:not-data-[state=selected]:[--table-row-bg:var(--table-row-hover)]",
        // 選択中は、交互の背景色より優先する。
        "data-[state=selected]:[--table-row-bg:var(--table-row-selected)]",
        "data-interactive:data-[state=selected]:hover:[--table-row-bg:var(--table-row-selected-hover)]",
        "data-interactive:hover:[--muted-foreground:color-mix(in_srgb,var(--foreground)_75%,var(--background))]",
        "data-active:[--muted-foreground:color-mix(in_srgb,var(--foreground)_75%,var(--background))]",
        "data-[state=selected]:[--muted-foreground:color-mix(in_srgb,var(--foreground)_75%,var(--background))]",
        // 横線の表で選択中の行が続くとき、行の間の線が面に埋もれないよう、線を一段濃くする。
        "data-[state=selected]:[&>td]:border-b-(--table-row-selected-border)",
        // 詳細を表示中の行：先頭のセルに 2px の線（primary）。面は変えず、選択中、ホバー中と区別する。
        "data-active:[&>td:first-child]:shadow-[inset_2px_0_0_var(--primary)]",
        // 指で操作する端末では、操作できる行（押すと詳細を開く行、Checkbox のある行）を 48px 以上にする（Compact でも）。
        "pointer-coarse:data-interactive:[&>td]:h-[max(var(--table-row-height),3rem)]",
        "pointer-coarse:has-[>td>[role=checkbox]]:[&>td]:h-[max(var(--table-row-height),3rem)]",
        className
      )}
      {...props}
    />
  )
}

const alignClass: Record<CellAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right tabular-nums",
}

function TableHead({
  className,
  align = "left",
  ...props
}: Omit<React.ComponentProps<"th">, "align"> & { align?: CellAlign }) {
  return (
    <th
      data-slot="table-head"
      data-align={align}
      className={cn(
        "h-10 border-b border-border bg-background px-4 align-middle text-caption font-medium whitespace-nowrap text-muted-foreground",
        alignClass[align],
        // Checkbox のセル：セル全体を押せる範囲にする。本文の行と重ならない。指で操作する端末では 48px にする。
        "[&:has(>[role=checkbox])]:relative [&:has(>[role=checkbox])]:w-12 [&:has(>[role=checkbox])]:px-0",
        "pointer-coarse:[&:has(>[role=checkbox])]:h-12",
        "[&>[role=checkbox]]:static [&>[role=checkbox]]:mx-auto [&>[role=checkbox]]:after:inset-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  align = "left",
  ...props
}: Omit<React.ComponentProps<"td">, "align"> & { align?: CellAlign }) {
  return (
    <td
      data-slot="table-cell"
      data-align={align}
      className={cn(
        // height はセルでは最小の高さとして働く。複数行の文字や拡大表示では行が伸びる。
        "h-table-row bg-(--table-row-bg) px-4 align-middle [word-break:auto-phrase]",
        "transition-[background-color] duration-(--duration-fast) ease-standard",
        "py-2 [[data-density=compact]_&]:py-1 [[data-density=comfortable]_&]:py-3",
        alignClass[align],
        // Checkbox のセル：セル全体を押せる範囲にする。隣の行と重ならない。
        "[&:has(>[role=checkbox])]:relative [&:has(>[role=checkbox])]:w-12 [&:has(>[role=checkbox])]:px-0",
        "[&>[role=checkbox]]:static [&>[role=checkbox]]:mx-auto [&>[role=checkbox]]:after:inset-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-left text-ui text-muted-foreground", className)}
      {...props}
    />
  )
}

// 値がないことを示す。0 と区別するため、空欄にも 0 にもしない。
// 画面には「—」を表示し、支援技術には label を読み上げる。
function TableNoValue({ label = "未登録", className, ...props }: React.ComponentProps<"span"> & { label?: string }) {
  return (
    <span data-slot="table-no-value" className={cn("text-muted-foreground", className)} {...props}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

// 長い文字を 1 行に省略する。省略は、列の幅を保つ必要がある場合だけに使う。
// 完全な内容を確かめる手段を、製品の文脈に合わせて用意する。
// - 行の詳細（Sheet など）がある表では、詳細に完全な内容を表示する（推奨）
// - 詳細がない表では expandable を指定する。実際に省略されたセルにだけ「全文を表示」のボタンを置き、
//   押すとそのセルだけ折り返して全文を表示する。省略されていないセルはフォーカスできる要素を増やさない
// title は、ポインターで確かめるための補助として付ける（タッチとキーボードでは使えない）。
function TableTruncate({
  className,
  children,
  title,
  expandable = false,
  expandLabel = "全文を表示",
  collapseLabel = "折りたたむ",
  ...props
}: React.ComponentProps<"span"> & {
  /** 省略されたときに、全文を表示するボタンを置く */
  expandable?: boolean
  expandLabel?: string
  collapseLabel?: string
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const text = typeof children === "string" ? children : undefined

  React.useEffect(() => {
    const el = ref.current
    if (!el || !expandable) return
    const measure = () => setTruncated(el.scrollWidth > el.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [expandable, children])

  const span = (
    <span
      ref={ref}
      data-slot="table-truncate"
      data-expanded={expanded || undefined}
      title={expanded ? undefined : (title ?? text)}
      className={cn("block max-w-full min-w-0", expanded ? "whitespace-normal [overflow-wrap:anywhere]" : "truncate", className)}
      {...props}
    >
      {children}
    </span>
  )
  if (!expandable) return span
  // 要素の構造を変えずに、省略されたときだけボタンを足す（測定の対象の要素を作り直さない）。
  return (
    <span data-slot="table-truncate-group" className="flex min-w-0 items-start gap-1">
      <span className="min-w-0 flex-1">{span}</span>
      {(truncated || expanded) && <button
        type="button"
        data-slot="table-truncate-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "-my-1 inline-flex min-h-8 shrink-0 items-center rounded-xs px-1 text-caption whitespace-nowrap text-muted-foreground underline underline-offset-4",
          "outline-none hover:text-foreground focus-visible:focus-ring pointer-coarse:min-h-10"
        )}
      >
        {expanded ? collapseLabel : expandLabel}
      </button>}
    </span>
  )
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableNoValue,
  TableRow,
  TableTruncate,
}
export type { CellAlign, TableDensity, TableVariant }
