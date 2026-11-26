import * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Page Layout（Patterns / App Structure）
// ページの内容の最大幅、配置、余白を決める。定義と判断基準は docs/web/patterns/page-layout.md を参照。
//
// 領域
//   PageLayout（data-slot="page-layout"）            … メインの領域の幅いっぱい。ページの余白（padding）を持つ
//     └ 内容（data-slot="page-layout-content"）     … 最大幅を持つ。Page Header と内容を縦に並べる
//   最大幅は、ページの余白を除いた内容の幅である。たとえば Standard（960px）の画面の横幅は、960px + 左右の余白になる。
//
// 最大幅（--page-width-*。製品は :root などで上書きできる。ページごとには maxWidth で上書きする）
//   full      上限なし   一覧、Table
//   wide      1440px    分析、ダッシュボード
//   standard  960px     詳細、設定
//   focused   640px     登録、編集、フォーム
//   compact   400px     ログイン、認証
//
// - 配置：Sidebar のある業務画面は start（左寄せ）。ページ間で内容の開始位置がそろう。独立した画面（Minimal Shell）は center。
// - 余白：デスクトップ（md 以上）は 24px、モバイルは 16px。上の余白も同じ値にし、ページ間で内容の開始位置をそろえる。
// - Page Header と内容の間は 32px。
// - 内容は Container Query の基準（@container/page）になる。列の切り替えは、画面の幅ではなく内容の幅で判断する。

const pageWidths = {
  full: "none",
  wide: "var(--page-width-wide, 90rem)",
  standard: "var(--page-width-standard, 60rem)",
  focused: "var(--page-width-focused, 40rem)",
  compact: "var(--page-width-compact, 25rem)",
} as const

type PageWidth = keyof typeof pageWidths

function PageLayout({
  width = "standard",
  align = "start",
  maxWidth,
  className,
  contentClassName,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** 内容の最大幅の種類 */
  width?: PageWidth
  /** start：左寄せ（Sidebar のある業務画面）。center：中央寄せ（独立した画面） */
  align?: "start" | "center"
  /** このページだけ最大幅を変える（CSS の長さ） */
  maxWidth?: string
  contentClassName?: string
}) {
  return (
    <div
      data-slot="page-layout"
      data-width={width}
      data-align={align}
      className={cn(
        "w-full min-w-0",
        "[--page-padding-x:1rem] [--page-padding-top:1rem] md:[--page-padding-x:1.5rem] md:[--page-padding-top:1.5rem]",
        "px-(--page-padding-x) pt-(--page-padding-top) pb-16",
        className
      )}
      style={{ "--page-max-width": maxWidth ?? pageWidths[width], ...style } as React.CSSProperties}
      {...props}
    >
      <div
        data-slot="page-layout-content"
        className={cn(
          "@container/page relative flex w-full max-w-(--page-max-width) min-w-0 flex-col gap-8",
          align === "center" ? "mx-auto" : "mr-auto",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}

// 列の構成。列の数は、置かれた領域の幅（Container Query）で切り替え、狭い領域では DOM の順序のとおり 1 列に並べる。
// DOM の順序は、重要な情報から並べる。視覚の順序だけを入れ替える（order、grid の配置）ことはしない。
//   main-aside：メインと補足。1 つ目の子がメイン、2 つ目の子が補足（幅 18rem）。56rem 以上で横に並べる
//   equal：同等の重要性を持つ情報の比較。columns の数まで、等しい幅で並べる
const columnLayouts = {
  "main-aside": "@4xl/columns:grid-cols-[minmax(0,1fr)_18rem] @4xl/columns:gap-x-12",
  equal2: "@2xl/columns:grid-cols-2",
  equal3: "@2xl/columns:grid-cols-2 @5xl/columns:grid-cols-3",
} as const

function PageColumns({
  layout = "main-aside",
  columns = 2,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  layout?: "main-aside" | "equal"
  /** equal の列の最大数 */
  columns?: 2 | 3
}) {
  const key = layout === "main-aside" ? "main-aside" : columns === 3 ? "equal3" : "equal2"
  return (
    <div data-slot="page-columns" data-layout={layout} className="@container/columns min-w-0">
      <div className={cn("grid min-w-0 grid-cols-1 items-start gap-x-8 gap-y-8", columnLayouts[key], className)} {...props}>
        {children}
      </div>
    </div>
  )
}

export { PageColumns, PageLayout, pageWidths, type PageWidth }
