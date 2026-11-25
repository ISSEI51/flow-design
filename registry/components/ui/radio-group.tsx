import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { cn } from "@/lib/utils"

// Flow Design Radio Group
// shadcn/ui（Base UI 版）の RadioGroup と同じ API。本体 20×20px の円。
// Flow Design の単一選択は Select を優先する。Radio Group は既存画面との互換などに使う。
// 定義は docs/web/components/radio-group.md を参照。

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn("flex flex-col", className)} {...props} />
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "peer relative flex size-5 shrink-0 items-center justify-center rounded-full border border-input bg-background",
        "transition-[border-color] duration-(--duration-fast) ease-standard",
        "outline-none after:absolute after:-inset-3.5 focus-visible:focus-ring",
        // Field の行の中では、行全体が押せる範囲になるため、本体の拡張を使わない。
        "[[data-slot=field-item]_&]:after:hidden [[data-slot=field][data-orientation=horizontal]_&]:after:hidden",
        // 本体は行を覆うラベルの上に置き、本体を押したときは本体が直接受け取る。
        "[[data-slot=field-item]_&]:z-10 [[data-slot=field][data-orientation=horizontal]_&]:z-10",
        "data-checked:border-primary",
        "aria-invalid:not-data-checked:border-destructive data-invalid:not-data-checked:border-destructive",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator data-slot="radio-group-indicator" className="size-2.5 rounded-full bg-primary" />
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
