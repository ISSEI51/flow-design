"use client"

import * as React from "react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// Flow Design Accordion
// shadcn/ui（Base UI 版）の Accordion と同じ名前と構造（Accordion、AccordionItem、AccordionTrigger、
// AccordionContent）。Flow Design では次を変えている。
// - multiple の既定は true（複数の項目を同時に開ける）。単一展開は、理由がある場合に multiple={false} を指定する。
// - keepMounted の既定は true。閉じた項目の内容を DOM に残し、入力した値を保つ。
// - 見出しは 48px 以上、16px、太さ 500。アイコンは ChevronDown（20px）で、開くと 180° 回る。
// - 項目の間に 1px の border。背景は透明、影なし。内容の下の余白は 16px。
// - 開閉は 240ms（--duration-slow）の高さの transition。動きを減らす設定では 0ms になる。
//   内容の高さは Base UI の --accordion-panel-height で決まり、開いた後に高さが変わっても追従する。
// - AccordionTrigger の level で見出しのレベル（h2〜h6、既定は h3）を指定できる。
// - 内容の中にフォーカスがある状態で項目が閉じた場合（製品が value を変えて閉じた場合など）は、
//   フォーカスをその項目の見出しへ移す。閉じて非表示になった要素にフォーカスが残らないようにするため。
// 定義は docs/web/components/accordion.md を参照。

function Accordion({
  className,
  multiple = true,
  keepMounted = true,
  ...props
}: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      multiple={multiple}
      keepMounted={keepMounted}
      className={cn("flex w-full min-w-0 flex-col", className)}
      {...props}
    />
  )
}

function AccordionItem({ className, ref, ...props }: AccordionPrimitive.Item.Props) {
  const itemRef = React.useRef<HTMLDivElement | null>(null)
  const wasOpen = React.useRef(false)
  // 描画のたびに開閉の状態を確かめる。閉じた項目の内容にフォーカスが残っていたら、見出しへ移す。
  React.useLayoutEffect(() => {
    const el = itemRef.current
    if (!el) return
    const open = el.hasAttribute("data-open")
    if (wasOpen.current && !open) {
      const panel = el.querySelector("[data-slot=accordion-content]")
      if (panel?.contains(document.activeElement)) {
        el.querySelector<HTMLElement>("[data-slot=accordion-trigger]")?.focus()
      }
    }
    wasOpen.current = open
  })
  return (
    <AccordionPrimitive.Item
      ref={(node: HTMLDivElement | null) => {
        itemRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      data-slot="accordion-item"
      className={cn("border-b border-border last:border-b-0", className)}
      {...props}
    />
  )
}

type HeadingLevel = 2 | 3 | 4 | 5 | 6

function AccordionTrigger({
  className,
  children,
  level = 3,
  ...props
}: AccordionPrimitive.Trigger.Props & {
  /** 見出しのレベル。ページの見出しの構造に合わせる */
  level?: HeadingLevel
}) {
  const Heading = `h${level}` as const
  return (
    <AccordionPrimitive.Header data-slot="accordion-header" className="flex" render={<Heading />}>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger flex min-h-12 flex-1 items-center justify-between gap-4 rounded-sm py-3 text-left",
          "text-body font-medium text-foreground [word-break:auto-phrase]",
          "underline-offset-4 hover:not-data-disabled:underline",
          "outline-none focus-visible:focus-ring",
          "data-disabled:cursor-not-allowed data-disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown
          data-slot="accordion-trigger-icon"
          aria-hidden="true"
          className={cn(
            "pointer-events-none size-5 shrink-0 text-muted-foreground",
            "transition-transform duration-(--duration-slow) ease-standard group-data-panel-open/accordion-trigger:rotate-180"
          )}
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        // 高さの変化の間は内容を隠す。左右と上に 4px の余白を取り、中の要素のフォーカスの線が切れないようにする。
        "-mx-1 h-(--accordion-panel-height) overflow-hidden px-1 text-body text-muted-foreground",
        "transition-[height] duration-(--duration-slow) ease-standard",
        "data-starting-style:h-0 data-ending-style:h-0"
      )}
      {...props}
    >
      <div
        data-slot="accordion-content-inner"
        className={cn(
          "pt-1 pb-4 [word-break:auto-phrase] [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_p:not(:last-child)]:mb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
