import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Flow Design Tabs
// shadcn/ui（Base UI 版）の Tabs と同じ名前と API（Tabs、TabsList の variant、TabsTrigger、TabsContent、
// tabsListVariants）。Flow Design では次を変えている。
// - 標準は下線型（variant="line"）。variant を省略すると下線型になる。
//   塗りつぶし型は shadcn/ui との互換のため variant="default" で提供し、小さな表示形式の切り替えなど、
//   理由がある場合だけ使う。
// - 高さ 48px、文字 14px、太さ 500、タブの間 24px、内容との間 24px、選択中の下線 2px、影なし。
//   太さはすべてのタブで 500 にし、選択の切り替えで幅が変わらないようにする。
// - 横幅が足りない場合は、文字を縮めずに横にスクロールする。スクロールの領域の内側に 4px の余白を取り、
//   フォーカスの線が切れないようにする。外側の配置は負のマージンで元の位置に保つ。
// - TabsList の activateOnFocus の既定は true（矢印キーで移動した時点で表示を切り替える）。
//   表示に時間がかかる内容では、製品が false を指定し、Enter と Space で切り替える。
// - TabsContent の keepMounted の既定は true。非表示のタブの入力内容を保つ。
// 定義は docs/web/components/tabs.md を参照。

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      className={cn("group/tabs flex min-w-0 gap-6 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  [
    "group/tabs-list relative flex min-w-0 shrink-0 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]",
    "group-data-vertical/tabs:flex-col group-data-vertical/tabs:overflow-visible",
  ],
  {
    variants: {
      variant: {
        // 下線型。下の 1px の線は内容の領域の背景として描き、スクロールしても表示している幅に残す。
        line: [
          "-m-1 gap-6 p-1",
          "bg-[linear-gradient(var(--border),var(--border))] bg-clip-content bg-origin-content bg-no-repeat",
          "group-data-horizontal/tabs:bg-[length:100%_1px] group-data-horizontal/tabs:bg-bottom",
          "group-data-vertical/tabs:w-fit group-data-vertical/tabs:gap-0",
          "group-data-vertical/tabs:bg-[length:1px_100%] group-data-vertical/tabs:bg-left",
        ],
        // 塗りつぶし型（互換）。
        default: "w-fit max-w-full gap-1 rounded-lg bg-muted p-1",
      },
    },
    defaultVariants: { variant: "line" },
  }
)

function TabsList({
  className,
  variant = "line",
  activateOnFocus = true,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      activateOnFocus={activateOnFocus}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center gap-2 text-ui font-medium whitespace-nowrap select-none",
        "text-muted-foreground transition-[color,background-color,border-color] duration-(--duration-fast) ease-standard",
        "hover:not-data-disabled:text-foreground data-active:text-foreground",
        "outline-none focus-visible:focus-ring",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
        // 下線型：下線は文字の幅で、選択中だけ表示する。
        "group-data-[variant=line]/tabs-list:h-12 group-data-[variant=line]/tabs-list:rounded-xs",
        "group-data-[variant=line]/tabs-list:after:absolute group-data-[variant=line]/tabs-list:after:bg-foreground",
        "group-data-[variant=line]/tabs-list:after:opacity-0 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        "group-data-[variant=line]/tabs-list:after:transition-opacity group-data-[variant=line]/tabs-list:after:duration-(--duration-fast)",
        "group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-0.5",
        "group-data-vertical/tabs:justify-start group-data-vertical/tabs:group-data-[variant=line]/tabs-list:h-10 group-data-vertical/tabs:group-data-[variant=line]/tabs-list:px-4",
        "group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:start-0 group-data-vertical/tabs:after:w-0.5",
        // 塗りつぶし型：選択中は面を background にし、識別に必要な枠（input）を付ける。影は付けない。
        "group-data-[variant=default]/tabs-list:h-10 group-data-[variant=default]/tabs-list:rounded-sm group-data-[variant=default]/tabs-list:px-4",
        "group-data-[variant=default]/tabs-list:border group-data-[variant=default]/tabs-list:border-transparent",
        "group-data-[variant=default]/tabs-list:data-active:border-input group-data-[variant=default]/tabs-list:data-active:bg-background",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, keepMounted = true, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      keepMounted={keepMounted}
      className={cn("min-w-0 flex-1 rounded-sm outline-none focus-visible:focus-ring", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants }
