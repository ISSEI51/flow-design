"use client"

import * as React from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Flow Design Contextual Help（Patterns / System & Account / Onboarding）
// 操作している場所の近くに置く、短い案内。定義は docs/web/patterns/onboarding.md を参照。
//
// この部品が守ること
// - 画面の流れの中に置き、操作の対象を覆わない（Popover やモーダルにしない）。フォーカスを奪わない。
// - 閉じられる。閉じた案内は表示しない（dismissed が true のときは何も描画しない）。
// - 閉じたときにフォーカスが案内の中にあった場合は、focusAfterDismiss に移す（<body> に落とさない）。
//
// この部品が持たないもの（製品の責務）
// - 閉じた状態の保存（アカウントごとに保存し、再読み込みや別の端末でも繰り返し表示しない）。
// - 表示する時期と、同時に表示する案内を 1 つに絞ること（onboarding.ts の pickGuidance）。
// - 重要な情報を、この案内だけに置かないこと（項目の説明、ヘルプのページにも置く）。

function ContextualHelp({
  title,
  dismissed,
  onDismiss,
  dismissLabel = "この案内を閉じる",
  focusAfterDismiss,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  /** 案内の見出し（短く）。省略した場合は本文だけ */
  title?: React.ReactNode
  /** 利用者が閉じた（製品が保存した値）。true のときは描画しない */
  dismissed: boolean
  /** 閉じる。保存は製品が行う */
  onDismiss: () => void
  dismissLabel?: string
  /** 閉じた後のフォーカスの移動先（案内に関係する入力欄など） */
  focusAfterDismiss?: React.RefObject<HTMLElement | null>
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  if (dismissed) return null
  return (
    <div
      ref={ref}
      role="note"
      data-slot="contextual-help"
      className={cn("flex min-w-0 items-start gap-3 rounded-lg bg-muted py-2 ps-4 pe-2 text-ui", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1.5 [word-break:auto-phrase]">
        {title && <p className="font-medium">{title}</p>}
        <div className="text-muted-foreground">{children}</div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={dismissLabel}
        onClick={() => {
          if (ref.current?.contains(document.activeElement)) focusAfterDismiss?.current?.focus()
          onDismiss()
        }}
      >
        <X />
      </Button>
    </div>
  )
}

export { ContextualHelp }
