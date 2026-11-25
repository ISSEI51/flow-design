import type * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { Check, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

// Flow Design Dropdown Menu
// shadcn/ui（Base UI 版）の Dropdown Menu と同じ名前と API（variant="destructive"、inset など）。
// 実行する操作を選ぶためのもの。フォームで値を選ぶ場合は Select を使う。
// 定義は docs/web/components/dropdown-menu.md を参照。

const DropdownMenu = MenuPrimitive.Root

function DropdownMenuPortal(props: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

const popupClassName = cn(
  "max-h-(--available-height) max-w-(--available-width) min-w-48 overflow-x-hidden overflow-y-auto p-2",
  "rounded-md border border-border bg-popover text-ui text-popover-foreground shadow-menu outline-none",
  "origin-(--transform-origin) transition-[opacity,scale] duration-(--duration-normal) ease-enter data-ending-style:ease-exit",
  "data-starting-style:opacity-0 data-ending-style:opacity-0",
  "motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95"
)

// キーボードとポインターの切り分け。Base UI は、キー操作でもホバーでも、項目に DOM のフォーカスを移し、
// data-highlighted を付ける（aria-activedescendant は使わない）。:focus-visible はキー操作の後に一致するが、
// キー操作の後にポインターを動かした場合も一致したままになる。そのため、ポインターを動かしている間は
// Popup に data-pointer を付けてフォーカスの枠を消し、キーを押したら外す。
function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionPadding = 8,
  className,
  onPointerMove,
  onKeyDown,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(popupClassName, className)}
          onPointerMove={(event) => {
            event.currentTarget.setAttribute("data-pointer", "")
            onPointerMove?.(event)
          }}
          onKeyDown={(event) => {
            event.currentTarget.removeAttribute("data-pointer")
            onKeyDown?.(event)
          }}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuLabel({ className, inset, ...props }: MenuPrimitive.GroupLabel.Props & { inset?: boolean }) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset || undefined}
      className={cn("px-3 pt-2 pb-1 text-caption text-muted-foreground data-inset:pl-10", className)}
      {...props}
    />
  )
}

// 項目。高さ 40px 以上、角丸 8px、文字 14px、アイコン 20px、アイコンと文字の間隔 8px。
// アイコンのない項目を、アイコンのある項目と文字の位置でそろえる場合は inset を付ける（12 + 20 + 8 = 40px）。
// ハイライト：ホバーとキー操作のどちらも accent の面。キー操作のときは、加えて focus-ring を項目の内側に描く。
// 内側に描くため、スクロールする領域の端や隣の項目で枠が欠けない。
const itemClassName = cn(
  "group/dropdown-menu-item relative flex min-h-10 w-full cursor-default items-center gap-2 rounded-sm px-3 py-2",
  "text-left text-ui text-foreground outline-none select-none [word-break:auto-phrase]",
  "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
  "focus-visible:focus-ring [--focus-ring-offset:calc(var(--focus-ring-width)*-1)] [[data-pointer]_&]:focus-visible:outline-none",
  // キー操作で項目を表示範囲に入れるとき、メニューの余白（8px）を残す。
  "scroll-my-2",
  "data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-10",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5"
)

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & { inset?: boolean; variant?: "default" | "destructive" }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset || undefined}
      data-variant={variant}
      className={cn(
        itemClassName,
        "data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & { inset?: boolean }) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset || undefined}
      className={cn(itemClassName, "data-popup-open:bg-accent data-popup-open:text-accent-foreground", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto text-muted-foreground" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -9,
  side = "right",
  sideOffset = 4,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className={className}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & { inset?: boolean }) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset || undefined}
      className={cn(itemClassName, "pr-10", className)}
      {...props}
    >
      <span
        data-slot="dropdown-menu-checkbox-item-indicator"
        className="pointer-events-none absolute right-3 flex items-center justify-center"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <Check />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & { inset?: boolean }) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset || undefined}
      className={cn(itemClassName, "pr-10", className)}
      {...props}
    >
      <span
        data-slot="dropdown-menu-radio-item-indicator"
        className="pointer-events-none absolute right-3 flex items-center justify-center"
      >
        <MenuPrimitive.RadioItemIndicator>
          <Check />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

// 論理的に異なる操作のまとまりの間にだけ置く。
function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("pointer-events-none -mx-2 my-2 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto pl-4 text-caption text-muted-foreground tabular-nums", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
}
