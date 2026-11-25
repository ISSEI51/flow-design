import type * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Label
// shadcn/ui（Base UI 版）の Label と同じ API。14px、太さ 500。
// フォームの項目では FieldLabel を使う。FieldLabel はこの Label を描画に使う。

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-ui leading-snug font-medium text-foreground select-none [word-break:auto-phrase]",
        "group-data-[disabled]/field:cursor-not-allowed group-data-[disabled]/field:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
