import type * as React from "react"
import { Field as FieldPrimitive } from "@base-ui/react/field"

import { controlClassName } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// Flow Design Textarea
// shadcn/ui の Textarea と同じ API。文字、角丸、境界線、フォーカスは Input と共通。
// Base UI の Field.Control として描画し、Field の中ではラベル、説明、エラーと関連付けられる。
// 定義は docs/web/components/textarea.md を参照。

function Textarea({ className, rows, cols, wrap, ...props }: React.ComponentProps<"textarea">) {
  return (
    <FieldPrimitive.Control
      data-slot="textarea"
      // id、value、onChange などは Field.Control に渡し、ラベルとの関連付けを Base UI に任せる。
      // textarea に固有の属性だけを描画する要素に渡す。
      render={<textarea rows={rows} cols={cols} wrap={wrap} />}
      className={cn(controlClassName, "block min-h-24 px-4 py-3 field-sizing-content resize-y", className)}
      {...(props as FieldPrimitive.Control.Props)}
    />
  )
}

export { Textarea }
