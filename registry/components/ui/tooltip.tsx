"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

// Flow Design Tooltip
// shadcn/ui（Base UI 版）の Tooltip と同じ構成。表示の遅延は 700ms。
// 色は foreground / background を使い、ブランドカラーの変更に影響されない。
// Base UI の Tooltip は、タッチ操作では開かない。補足情報だけを入れる。
// 定義は docs/web/components/tooltip.md を参照。

const TOOLTIP_DELAY = 700

// 表示の遅延の優先順位：TooltipTrigger の delay > TooltipProvider の delay > 700ms。
// Trigger に既定値を書くと Provider の設定を上書きしてしまうため、Provider の値を文脈で受け渡す。
const DelayContext = createContext<number | undefined>(undefined)

function TooltipProvider({ delay = TOOLTIP_DELAY, ...props }: TooltipPrimitive.Provider.Props) {
  return (
    <DelayContext.Provider value={delay}>
      <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />
    </DelayContext.Provider>
  )
}

// Escape は最前面から順に閉じる。Base UI の Tooltip は Dialog などの Overlay の木（FloatingTree）に属さないため、
// ポインターで開いた Tooltip（フォーカスは別の要素）があるとき、Escape が背後の Dialog に届き、両方が閉じる。
// 開いている間だけ、この Tooltip の Escape を document のキャプチャの段階で受け、Tooltip だけを閉じて伝播を止める。
// 閉じる操作は Base UI の actionsRef.close() を使う。IME の変換中の Escape は扱わない。
// キーボードのフォーカスで開いた Tooltip は、トリガーからフォーカスが離れると閉じる（Base UI が閉じるまでに少し時間がある）。
// 閉じるまでの間に、フォーカスの移った先（Dropdown Menu など）で押した Escape を横取りしないよう、
// フォーカスで開いた Tooltip は、トリガーにフォーカスがあるときだけ Escape を受ける。
function Tooltip({ actionsRef, onOpenChange, ...props }: TooltipPrimitive.Root.Props) {
  const ownActions = useRef<TooltipPrimitive.Root.Actions>(null)
  // 製品が actionsRef を渡した場合はそれを使い、渡さない場合は内部の ref を使う。
  const actions = actionsRef ?? ownActions
  const [openState, setOpenState] = useState(props.defaultOpen ?? false)
  const open = props.open ?? openState
  // フォーカスで開いたときのトリガー。ポインターなど、ほかの理由で開いたときは null
  const focusTrigger = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return
      const trigger = focusTrigger.current
      if (trigger && !trigger.contains(document.activeElement)) return
      event.preventDefault()
      event.stopPropagation()
      actions.current?.close()
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [open, actions])

  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      actionsRef={actions}
      onOpenChange={(next, details) => {
        if (next) {
          const target = details.event?.target
          focusTrigger.current = details.reason === "trigger-focus" && target instanceof Element ? target : null
        }
        onOpenChange?.(next, details)
        if (!details.isCanceled) setOpenState(next)
      }}
      {...props}
    />
  )
}

function TooltipTrigger({ delay, ...props }: TooltipPrimitive.Trigger.Props) {
  const providerDelay = useContext(DelayContext)
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" delay={delay ?? providerDelay ?? TOOLTIP_DELAY} {...props} />
}

// 重なり順：z-50（浮かぶ要素の層）。後から開いたモーダル（Dialog、Alert Dialog など）の外側に残った場合は、
// Base UI がモーダルの外側の要素に付ける data-base-ui-inert の下に入るため、モーダルの層（z-40）に下げる。
// DOM の順で新しいモーダルの背面に入り、押せなくなる（Base UI は同時に aria-hidden も付ける）。
function TooltipContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  alignOffset = 0,
  collisionPadding = 8,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className="isolate z-50 in-[[data-base-ui-inert]]:z-40"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "w-fit max-w-xs rounded-sm bg-foreground px-3 py-2 text-caption text-background shadow-menu [word-break:auto-phrase]",
            "origin-(--transform-origin) transition-[opacity,scale] duration-(--duration-fast) ease-standard",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            "motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95",
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { TOOLTIP_DELAY, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
