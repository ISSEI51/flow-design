import type * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Skeleton
// shadcn/ui の Skeleton と同じ API。控えめな明滅（1.8 秒周期）。光が流れる動きは使わない。
// 動きを減らす設定では止まる。支援技術には読み上げさせない（aria-hidden）。
// 読み込み中であることは、親要素の aria-busy と、文字の状態表示で伝える。
// 定義は docs/web/components/skeleton.md を参照。

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-md bg-border motion-safe:animate-pulse motion-safe:[animation-duration:1.8s]", className)}
      {...props}
    />
  )
}

export { Skeleton }
