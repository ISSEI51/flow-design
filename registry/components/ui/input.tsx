import type * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

// Flow Design Input
// shadcn/ui（Base UI 版）の Input と同じ API。Base UI の Input は Field.Control であり、
// Field の中に置くと、ラベル、説明、エラーが自動で関連付けられる。
// 定義は docs/web/components/input.md を参照。

const controlClassName = cn(
  "w-full min-w-0 rounded-md border border-input bg-background text-body text-foreground",
  "transition-[color,background-color,border-color] duration-(--duration-fast) ease-standard",
  "outline-none placeholder:text-muted-foreground focus-visible:focus-ring",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "read-only:not-disabled:bg-muted",
  "aria-invalid:border-destructive data-invalid:border-destructive"
)

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        controlClassName,
        "h-control px-4",
        "file:mr-3 file:h-full file:border-0 file:bg-transparent file:text-ui file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input, controlClassName }
