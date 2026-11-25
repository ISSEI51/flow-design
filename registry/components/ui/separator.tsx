import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

// Flow Design Separator
// shadcn/ui（Base UI 版）の Separator と同じ名前と API（orientation）。Flow Design では decorative を追加している。
// - 既定は意味のある区切り。Base UI が role="separator" と aria-orientation を付け、支援技術に区切りを伝える。
// - decorative：見た目だけの線。role="none" にして、支援技術には伝えない。
// 線は 1px、色は border。影とグラデーションは使わない。
// 区切りはまず余白と文字の強弱で表し、それで足りない場合だけ使う（美的基準 03）。
// 定義は docs/web/components/separator.md を参照。

function Separator({
  className,
  orientation = "horizontal",
  decorative = false,
  ...props
}: SeparatorPrimitive.Props & {
  /** 見た目だけの線。支援技術には区切りとして伝えない */
  decorative?: boolean
}) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      data-decorative={decorative || undefined}
      orientation={orientation}
      className={cn(
        // 向きのクラスは属性のセレクターにせず、className で高さや配置を上書きできるようにする。
        "shrink-0 bg-border",
        orientation === "vertical" ? "w-px self-stretch" : "h-px w-full",
        className
      )}
      {...(decorative ? { role: "none", "aria-orientation": undefined } : {})}
      {...props}
    />
  )
}

export { Separator }
