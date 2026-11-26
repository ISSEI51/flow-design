import type * as React from "react"
import { Bell } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { getUnreadIndicator, notificationTriggerLabel, type UnreadIndicator } from "@/patterns/notification-state"

// Flow Design Notification Indicator（Patterns / System & Account / Notifications）
// 未読の表示（Dot、Count）と、通知センターを開くボタン。定義は docs/web/patterns/notifications.md の「未読の表示」を参照。
//
// この部品が守ること
// - 0 件では何も表示しない。件数が不明なときに架空の件数を作らない（getUnreadIndicator）。
// - 99 件を超えたら「99+」と表示し、アクセシブルな名前には正確な件数を含める（「お知らせ、未読 120 件」）。
// - 通常の未読に Destructive の赤を使わない。ブランドの色（primary）を使い、色だけでなく形（Dot、数字）でも示す。
// - 表示そのもの（Dot、数字）は支援技術から隠し、未読の状態はボタンの名前で伝える（重複して読み上げない）。
//
// この部品が持たないもの（製品の責務）
// - 未読の件数の取得（useNotificationFeed、製品の API）。Dot と Count のどちらにするか（件数に意味があるか）。

/** 未読の表示そのもの。支援技術から隠す。ボタンなどの名前に notificationTriggerLabel の文を含める */
function NotificationIndicator({ indicator, className }: { indicator: UnreadIndicator; className?: string }) {
  if (indicator.kind === "none") return null
  if (indicator.kind === "dot") {
    return (
      <span
        aria-hidden="true"
        data-slot="notification-indicator"
        data-kind="dot"
        className={cn("pointer-events-none block size-2.5 rounded-full bg-primary ring-2 ring-background", className)}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      data-slot="notification-indicator"
      data-kind="count"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5",
        "text-caption leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-background",
        className
      )}
    >
      {indicator.text}
    </span>
  )
}

type NotificationButtonProps = Omit<React.ComponentProps<typeof Button>, "children" | "size" | "aria-label"> & {
  /** 未読の件数。不明なら null */
  count: number | null
  /** 件数が不明なときに、未読があることがわかっているか */
  hasUnread?: boolean | null
  /** dot：未読があることだけを示す。count：件数を示す（件数に意味がある場合） */
  display?: "dot" | "count"
  /** アクセシブルな名前の基本の文。未読の状態を後ろに加える（「お知らせ、未読 3 件」） */
  label?: string
}

// Header の右側（Header がない場合は Sidebar の下部）に置く、通知センターを開くアイコンのボタン。
// PopoverTrigger や SheetTrigger の render に渡せる（props と ref をそのまま Button に渡す）。
function NotificationButton({ count, hasUnread = null, display = "count", label = "お知らせ", variant = "ghost", className, ...props }: NotificationButtonProps) {
  const indicator = getUnreadIndicator({ count, hasUnread, display })
  return (
    <Button
      variant={variant}
      size="icon"
      aria-label={notificationTriggerLabel(label, indicator)}
      data-slot="notification-button"
      data-unread={indicator.kind === "none" ? undefined : indicator.kind}
      className={cn("relative", className)}
      {...props}
    >
      <Bell aria-hidden="true" />
      <NotificationIndicator
        indicator={indicator}
        className={cn("absolute", indicator.kind === "dot" ? "top-3 right-3" : "top-1.5 left-[calc(50%+2px)]")}
      />
    </Button>
  )
}

export { NotificationButton, NotificationIndicator }
export type { NotificationButtonProps }
