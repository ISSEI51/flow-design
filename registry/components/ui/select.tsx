import type * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

// Flow Design Select
// shadcn/ui（Base UI 版）の Select と同じ名前と API。Flow Design の単一選択の標準。
// 開閉は Base UI の data-starting-style / data-ending-style による CSS の transition で行い、
// 追加のアニメーション用パッケージを使わない。
// 定義は docs/web/components/select.md を参照。

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn("py-1", className)} {...props} />
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("min-w-0 flex-1 text-left [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & { size?: "sm" | "default" }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "group/select flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-4 py-2 text-left text-body text-foreground select-none",
        "data-[size=default]:min-h-control data-[size=sm]:min-h-10",
        "transition-[color,background-color,border-color] duration-(--duration-fast) ease-standard",
        "outline-none focus-visible:focus-ring",
        "data-placeholder:text-muted-foreground",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "aria-invalid:border-destructive data-invalid:border-destructive",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        data-slot="select-icon"
        className="flex text-muted-foreground transition-transform duration-(--duration-normal) ease-standard motion-safe:group-data-popup-open/select:rotate-180"
      >
        <ChevronDown className="size-5" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

// 重なり順：z-50（浮かぶ要素の層）。後から開いたモーダル（Dialog、Alert Dialog など）の外側に残った場合は、
// Base UI がモーダルの外側の要素に付ける data-base-ui-inert の下に入るため、モーダルの層（z-40）に下げる。
// DOM の順で新しいモーダルの背面に入り、押せなくなる（Base UI は同時に aria-hidden も付ける）。
function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  onPointerMove,
  onKeyDown,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50 outline-none in-[[data-base-ui-inert]]:z-40"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative flex max-h-[min(var(--available-height),24rem)] w-(--anchor-width) min-w-48 flex-col overflow-hidden",
            "rounded-xl border border-border bg-popover text-popover-foreground shadow-menu outline-none",
            "origin-(--transform-origin) transition-[opacity,scale] duration-(--duration-normal) ease-enter",
            "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:ease-exit",
            "motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95",
            className
          )}
          // ポインターを動かしている間はフォーカスの枠を消し、キーを押したら戻す（Dropdown Menu と同じ）。
          onPointerMove={(event) => {
            event.currentTarget.setAttribute("data-pointer", "")
            onPointerMove?.(event)
          }}
          onKeyDown={(event) => {
            event.currentTarget.removeAttribute("data-pointer")
            onKeyDown?.(event)
          }}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="overflow-y-auto p-2 outline-none">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-3 py-1 text-caption text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-10 w-full cursor-default items-center rounded-md py-2 pr-10 pl-3 text-body outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        // キー操作のときは、項目の内側に focus-ring を描く。選択中（Check と太さ 500）とは別に示す。
        "focus-visible:focus-ring [--focus-ring-offset:calc(var(--focus-ring-width)*-1)] [[data-pointer]_&]:focus-visible:outline-none",
        // キー操作で項目を表示範囲に入れるとき、上下のスクロールボタン（24px）に隠れないよう余白を残す。
        "scroll-my-6",
        "data-selected:font-medium",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 whitespace-normal [word-break:auto-phrase]">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        data-slot="select-item-indicator"
        className="pointer-events-none absolute right-3 flex items-center"
      >
        <Check className="size-5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-2 my-2 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn("absolute inset-x-0 top-0 z-10 flex h-6 w-full cursor-default items-center justify-center bg-popover text-muted-foreground", className)}
      {...props}
    >
      <ChevronUp className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn("absolute inset-x-0 bottom-0 z-10 flex h-6 w-full cursor-default items-center justify-center bg-popover text-muted-foreground", className)}
      {...props}
    >
      <ChevronDown className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
