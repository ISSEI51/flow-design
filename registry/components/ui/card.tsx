import type * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Card
// shadcn/ui（Base UI 版）の Card と同じ名前と構造（Card、CardHeader、CardTitle、CardDescription、
// CardAction、CardContent、CardFooter）と size。Flow Design では次を変えている。
// - 境界線は 1px の border。影は付けない（影は浮かぶ要素だけに使う）。
// - 角丸 20px、内側の余白 24px。size="sm" は余白 16px、size="lg" は角丸 24px、余白 32px。
// - 部分どうしの間隔は 16px。CardFooter に背景と区切り線を付けない。区切りは余白で表す。
// - CardTitle は 20px、太さ 600（text-heading）。sm は 16px、太さ 600。
// Card は独立した意味のある情報だけに使う。囲まなくてもまとまりがわかる場合は使わない。
// 定義は docs/web/components/card.md を参照。

type CardSize = "sm" | "default" | "lg"

// 大きさのクラスは属性のセレクターにせず、className で余白や角丸を上書きできるようにする。
const cardSizes: Record<CardSize, string> = {
  sm: "rounded-xl p-4",
  default: "rounded-xl p-6",
  lg: "rounded-2xl p-8",
}

function Card({ className, size = "default", ...props }: React.ComponentProps<"div"> & { size?: CardSize }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card relative flex min-w-0 flex-col gap-4 border border-border bg-card text-ui text-card-foreground",
        cardSizes[size],
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header grid auto-rows-min items-start gap-1",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-action]:gap-x-4",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-heading text-card-foreground [word-break:auto-phrase] group-data-[size=sm]/card:text-body group-data-[size=sm]/card:font-semibold",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-ui text-muted-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("min-w-0", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("mt-auto flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
export type { CardSize }
