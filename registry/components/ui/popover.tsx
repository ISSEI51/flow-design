import type * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

// Flow Design Popover
// shadcn/ui（Base UI 版）の Popover と同じ名前と API。
// 非モーダル。外側のクリックと Escape で閉じ、フォーカスをトリガーに戻す。
// 幅は内容に合わせ、画面の空きと 360px の小さい方を上限にする。製品は className の w-* で幅を指定できる。
// 定義は docs/web/components/popover.md を参照。

const Popover = PopoverPrimitive.Root

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverClose(props: PopoverPrimitive.Close.Props) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionPadding = 8,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className="isolate z-50 outline-none"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "flex w-max max-w-[min(var(--available-width),22.5rem)] max-h-(--available-height) flex-col gap-4 overflow-y-auto p-4",
            "rounded-md border border-border bg-popover text-ui text-popover-foreground shadow-popover outline-none",
            "origin-(--transform-origin) transition-[opacity,scale] duration-(--duration-normal) ease-enter data-ending-style:ease-exit",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            "motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="popover-header" className={cn("flex flex-col gap-1", className)} {...props} />
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("text-body font-semibold text-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-ui text-muted-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

export { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger }
