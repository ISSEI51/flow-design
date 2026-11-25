import { createContext, useContext } from "react"
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

function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ delay, ...props }: TooltipPrimitive.Trigger.Props) {
  const providerDelay = useContext(DelayContext)
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" delay={delay ?? providerDelay ?? TOOLTIP_DELAY} {...props} />
}

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
        className="isolate z-50"
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
