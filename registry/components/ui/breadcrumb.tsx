import type * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"

// Flow Design Breadcrumb
// shadcn/ui（Base UI 版）の Breadcrumb と同じ名前と構造（Breadcrumb、BreadcrumbList、BreadcrumbItem、
// BreadcrumbLink、BreadcrumbPage、BreadcrumbSeparator、BreadcrumbEllipsis）。Flow Design では次を変えている。
// - 文字 14px、要素の間 8px、区切りは Lucide の ChevronRight（16px）。背景、境界線、影はない。
// - 上位の階層は muted-foreground、現在位置は foreground、太さ 500。
// - BreadcrumbPage は aria-current="page" だけを付け、リンクの役割（role="link"、aria-disabled）を付けない。
//   現在位置はリンクではないため。
// - BreadcrumbEllipsis は省略した階層があることを支援技術にも伝える。render で button にすると、
//   省略した階層を表示する操作になる。
// - nav の名前の既定は「パンくずリスト」。
// ルーティングのライブラリには依存しない。BreadcrumbLink の render に製品のリンクを渡す。
// 定義は docs/web/components/breadcrumb.md を参照。

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label="パンくずリスト" data-slot="breadcrumb" className={cn("min-w-0", className)} {...props} />
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-ui text-muted-foreground [overflow-wrap:anywhere]",
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li data-slot="breadcrumb-item" className={cn("inline-flex min-w-0 items-center gap-2", className)} {...props} />
  )
}

function BreadcrumbLink({ className, render, ...props }: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "inline-flex min-h-8 min-w-0 items-center gap-2 rounded-xs text-muted-foreground [word-break:auto-phrase]",
          "underline-offset-4 transition-[color] duration-(--duration-fast) ease-standard",
          "hover:text-foreground hover:underline",
          "outline-none focus-visible:focus-ring",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "breadcrumb-link" },
  })
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn(
        "inline-flex min-h-8 min-w-0 items-center font-medium text-foreground [word-break:auto-phrase]",
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("flex items-center text-muted-foreground [&>svg]:size-4 rtl:[&>svg]:rotate-180", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  )
}

function BreadcrumbEllipsis({
  className,
  render,
  label = "省略した階層",
  ...props
}: useRender.ComponentProps<"span"> & {
  /** 支援技術に伝える名前。render で button にした場合は、押した結果がわかる名前にする */
  label?: string
}) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          "inline-flex size-8 items-center justify-center rounded-xs text-muted-foreground",
          "transition-[color] duration-(--duration-fast) ease-standard hover:text-foreground",
          "outline-none focus-visible:focus-ring [&>svg]:size-4",
          className
        ),
        children: (
          <>
            <MoreHorizontal aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </>
        ),
      },
      props
    ),
    render,
    state: { slot: "breadcrumb-ellipsis" },
  })
}

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
}
