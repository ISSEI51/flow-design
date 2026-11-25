"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Flow Design Badge
// shadcn/ui（Base UI 版）の Badge と同じ API（render、variant）。
// 境界線タイプを標準にし、背景は透明。文字と境界線に、意味に対応する色を使う。
// 定義は docs/web/components/badge.md を参照。

const badgeVariants = cva(
  [
    "inline-flex min-h-6 w-fit max-w-full shrink-0 items-center justify-center gap-1 rounded-full border border-current bg-transparent px-2 py-0.5",
    "text-center text-caption font-medium [word-break:auto-phrase]",
    "[&>svg]:pointer-events-none [&>svg]:size-4 [&>svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        neutral: "text-muted-foreground",
        success: "text-success",
        warning: "text-warning",
        destructive: "text-destructive",
        info: "text-info",
        // shadcn/ui との互換のための名前。いずれも neutral と同じ見た目になる。
        default: "text-muted-foreground",
        secondary: "text-muted-foreground",
        outline: "text-muted-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

function Badge({
  className,
  variant = "neutral",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: "badge", variant },
  })
}

export { Badge, badgeVariants }
