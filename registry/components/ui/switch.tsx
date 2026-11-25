import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// Flow Design Switch
// shadcn/ui（Base UI 版）の Switch と同じ API。本体 44×28px、内側の円 20px（size="sm" は 36×20px、16px）。
// ON は primary、OFF は input（白い背景の上で 3:1 以上）。円の位置でも状態を示す。
// after 疑似要素で、押せる範囲を 48×48px に広げる。
// 即時に反映する設定に使う。定義は docs/web/components/switch.md を参照。

// size="sm" は shadcn/ui との互換と、表の中など高密度の画面のために提供する。
// Flow Design の標準は size="default"（44×28px）。
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & { size?: "sm" | "default" }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "group/switch relative inline-flex shrink-0 items-center rounded-full",
        "data-[size=default]:h-7 data-[size=default]:w-11 data-[size=default]:p-1",
        "data-[size=sm]:h-5 data-[size=sm]:w-9 data-[size=sm]:p-0.5",
        "transition-[background-color] duration-(--duration-fast) ease-standard",
        "outline-none after:absolute focus-visible:focus-ring",
        "data-[size=default]:after:-inset-x-0.5 data-[size=default]:after:-inset-y-2.5",
        "data-[size=sm]:after:-inset-x-1.5 data-[size=sm]:after:-inset-y-3.5",
        // Field の行の中では、行全体が押せる範囲になるため、本体の拡張を使わない。
        "[[data-slot=field-item]_&]:after:hidden [[data-slot=field][data-orientation=horizontal]_&]:after:hidden",
        // 本体は行を覆うラベルの上に置き、本体を押したときは本体が直接受け取る。
        "[[data-slot=field-item]_&]:z-10 [[data-slot=field][data-orientation=horizontal]_&]:z-10",
        "data-checked:bg-primary data-unchecked:bg-input",
        "aria-invalid:ring-2 aria-invalid:ring-destructive aria-invalid:ring-offset-2",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background transition-transform duration-(--duration-fast) ease-standard group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-4 data-checked:translate-x-4 motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
