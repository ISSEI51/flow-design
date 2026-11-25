import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// Flow Design Switch
// shadcn/ui（Base UI 版）の Switch と同じ API。本体 44×28px、内側の円 20px。
// ON は primary、OFF は input（白い背景の上で 3:1 以上）。円の位置でも状態を示す。
// after 疑似要素で、押せる範囲を 48×48px に広げる。
// 即時に反映する設定に使う。定義は docs/web/components/switch.md を参照。

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-7 w-11 shrink-0 items-center rounded-full p-1",
        "transition-[background-color] duration-(--duration-fast) ease-standard",
        "outline-none after:absolute after:-inset-x-0.5 after:-inset-y-2.5 focus-visible:focus-ring",
        "data-checked:bg-primary data-unchecked:bg-input",
        "aria-invalid:ring-2 aria-invalid:ring-destructive aria-invalid:ring-offset-2",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-background transition-transform duration-(--duration-fast) ease-standard data-checked:translate-x-4 motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
