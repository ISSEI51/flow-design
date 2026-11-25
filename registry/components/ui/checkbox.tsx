import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

// Flow Design Checkbox
// shadcn/ui（Base UI 版）の Checkbox と同じ API。本体 20×20px、角丸 4px。
// after 疑似要素で、押せる範囲を 48×48px に広げる。
// 定義は docs/web/components/checkbox.md を参照。

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer relative flex size-5 shrink-0 items-center justify-center rounded-xs border border-input bg-background text-primary-foreground",
        "transition-[background-color,border-color] duration-(--duration-fast) ease-standard",
        "outline-none after:absolute after:-inset-3.5 focus-visible:focus-ring",
        // Field の行の中では、行全体が押せる範囲になるため、本体の拡張を使わない。
        "[[data-slot=field-item]_&]:after:hidden [[data-slot=field][data-orientation=horizontal]_&]:after:hidden",
        // 本体は行を覆うラベルの上に置き、本体を押したときは本体が直接受け取る。
        "[[data-slot=field-item]_&]:z-10 [[data-slot=field][data-orientation=horizontal]_&]:z-10",
        "data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
        "aria-invalid:not-data-checked:border-destructive data-invalid:not-data-checked:border-destructive",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center [--icon-stroke-width:3]"
      >
        <Check className="size-4 group-data-indeterminate/checkbox:hidden" />
        <Minus className="hidden size-4 group-data-indeterminate/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
