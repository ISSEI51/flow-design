import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Flow Design Empty
// shadcn/ui の Empty と同じ名前と構造（Empty、EmptyHeader、EmptyMedia、EmptyTitle、EmptyDescription、EmptyContent）。
// データがない理由と、次の操作がある場合はその操作を示す。
// - 外枠と影を付けない。中央に置く
// - アイコンは 64px の muted の面（角丸 20px）に、32px の Lucide を置く。装飾のイラストは使わない
// - タイトル 20px（太さ 600）、説明 14px
// - アイコン、説明、操作は必須ではない。必要なものだけを置く
// status で状態を区別する。error は取得に失敗したことを示し、データが 0 件の状態と混同しない。
// 定義は docs/web/components/empty.md を参照。

type EmptyStatus = "empty" | "no-results" | "complete" | "error"

function Empty({
  className,
  status = "empty",
  ...props
}: React.ComponentProps<"div"> & {
  /** empty：未登録、no-results：検索結果なし、complete：対応すべき項目がない、error：取得失敗 */
  status?: EmptyStatus
}) {
  return (
    <div
      data-slot="empty"
      data-status={status}
      className={cn(
        "group/empty flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center",
        className
      )}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-[30rem] min-w-0 flex-col items-center gap-2", className)}
      {...props}
    />
  )
}

const emptyMediaVariants = cva("flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0", {
  variants: {
    variant: {
      default: "mb-2 bg-transparent",
      // 64px の面、角丸 20px、32px のアイコン。取得失敗では、アイコンを destructive にする。
      icon: cn(
        "mb-2 size-16 rounded-xl bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-8",
        "group-data-[status=error]/empty:text-destructive"
      ),
    },
  },
  defaultVariants: { variant: "default" },
})

// アイコンは飾りとして扱い、支援技術には読ませない。状態はタイトルの文字で伝える。
function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      aria-hidden="true"
      className={cn(emptyMediaVariants({ variant }), className)}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-heading text-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-ui text-muted-foreground [word-break:auto-phrase] [&>a]:text-foreground [&>a]:underline [&>a]:underline-offset-4",
        className
      )}
      {...props}
    />
  )
}

// 次の操作。操作がある場合だけ置く。ボタンの間隔は 8px。
function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn("flex w-full max-w-[30rem] min-w-0 flex-wrap items-center justify-center gap-2", className)}
      {...props}
    />
  )
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle }
export type { EmptyStatus }
