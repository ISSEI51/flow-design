"use client"

import * as React from "react"
import { Check, ChevronDown, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import type { StepItem } from "@/patterns/step-flow"

// Flow Design Stepper（Patterns / Forms & Workflows）
// 複数のステップの現在地と、各ステップの状態を示す。定義は docs/web/patterns/multi-step-workflow.md を参照。
//
// - Tabs ではない。ステップは順序を持ち、未到達のステップへは移れない。Progress Bar でもない（処理の進捗率を示さない）。
// - 状態は色だけで示さない。完了はチェックの形、要確認は警告の形と「要確認」の文字、現在地は太字と aria-current="step"。
//   支援技術には、状態の名前（「完了」「要確認」「未完了」）を文字で伝える。
// - 直接移動できるステップ（reachable）だけをボタンにする。それ以外は文字だけで、押せる形にしない。
// - layout：horizontal（上部の横型。標準）、vertical（縦型。ステップが多い、横に余裕がある）、
//   compact（現在のステップの名前と「ステップ 2 / 4」。一覧を開ける）、auto（置かれた領域が 36rem 以上で horizontal、狭ければ compact）。
// - 総数が決まっていない場合（total が null）は、総数を示さず、後のステップが決まっていないことを文字で示す。
// - currentLabel="hidden"：簡易の表示で、現在のステップの名前を見た目では省く（ページの見出しが同じ名前を示す場合）。
//   支援技術には、閉じた一覧の aria-current の代わりに、番号の後に現在のステップの名前を伝える（sr-only）。

const statusText = { complete: "完了", current: "現在のステップ", "needs-review": "要確認", upcoming: "未完了" } as const

function Marker({ item }: { item: StepItem }) {
  return (
    <span
      aria-hidden="true"
      data-slot="stepper-marker"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-ui font-semibold tabular-nums",
        "transition-[background-color,border-color,color] duration-(--duration-fast) ease-standard",
        item.status === "complete" && "bg-primary text-primary-foreground",
        item.status === "current" && "border-2 border-primary bg-background text-foreground",
        item.status === "upcoming" && "border border-border bg-background text-muted-foreground",
        item.status === "needs-review" && "border-2 border-warning bg-background text-warning"
      )}
    >
      {item.status === "complete" ? (
        <Check className="size-4" strokeWidth={2.5} />
      ) : item.status === "needs-review" ? (
        <TriangleAlert className="size-4" />
      ) : (
        item.index + 1
      )}
    </span>
  )
}

function StepLabel({ item }: { item: StepItem }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 text-left">
      <span
        className={cn(
          "text-ui [overflow-wrap:anywhere] [word-break:auto-phrase]",
          item.status === "current" ? "font-semibold text-foreground" : item.status === "upcoming" ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {item.label}
      </span>
      {item.status === "needs-review" ? (
        <span className="text-caption font-medium text-warning">要確認</span>
      ) : (
        <span className="sr-only">（{statusText[item.status]}）</span>
      )}
    </span>
  )
}

function StepEntry<Id extends string>({
  item,
  onSelect,
  className,
  children,
}: {
  item: StepItem<Id>
  onSelect?: (id: Id) => void
  className?: string
  children: React.ReactNode
}) {
  if (item.reachable && onSelect)
    return (
      <button
        type="button"
        data-slot="stepper-step"
        data-status={item.status}
        onClick={() => onSelect(item.id)}
        className={cn("group/step flex min-h-10 min-w-0 rounded-md text-left outline-none focus-visible:focus-ring", className)}
      >
        {children}
      </button>
    )
  return (
    <div data-slot="stepper-step" data-status={item.status} className={cn("flex min-w-0", className)}>
      {children}
    </div>
  )
}

function HorizontalSteps<Id extends string>({ items, onSelect, total }: { items: StepItem<Id>[]; onSelect?: (id: Id) => void; total: number | null }) {
  return (
    <ol className="flex min-w-0 items-start">
      {items.map((item, i) => (
        <li
          key={item.id}
          aria-current={item.status === "current" ? "step" : undefined}
          className="flex min-w-0 flex-1 flex-col gap-2"
          data-status={item.status}
        >
          <div className="flex items-center">
            <EntryMarker item={item} onSelect={onSelect} />
            {(i < items.length - 1 || total === null) && (
              <span
                aria-hidden="true"
                className={cn("mx-2 h-px flex-1", i < items.length - 1 && item.status === "complete" ? "bg-primary" : "bg-border")}
              />
            )}
          </div>
          <div className="pr-3">
            <StepEntry item={item} onSelect={onSelect} className="-m-1 p-1">
              <StepLabel item={item} />
            </StepEntry>
          </div>
        </li>
      ))}
      {total === null && (
        <li className="flex min-w-0 flex-1 flex-col gap-2 pt-1.5 text-caption text-muted-foreground [word-break:auto-phrase]">
          この後の手順は、選んだ内容で決まります
        </li>
      )}
    </ol>
  )
}

// 横型の印。印だけを押しても移れるよう、ボタンの中に置く。支援技術には、ラベルのボタンだけを示す（重複させない）。
function EntryMarker<Id extends string>({ item, onSelect }: { item: StepItem<Id>; onSelect?: (id: Id) => void }) {
  if (item.reachable && onSelect)
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => onSelect(item.id)}
        className="rounded-full outline-none"
      >
        <Marker item={item} />
      </button>
    )
  return <Marker item={item} />
}

function VerticalSteps<Id extends string>({ items, onSelect, total }: { items: StepItem<Id>[]; onSelect?: (id: Id) => void; total: number | null }) {
  return (
    <ol className="flex min-w-0 flex-col">
      {items.map((item, i) => (
        <li key={item.id} aria-current={item.status === "current" ? "step" : undefined} data-status={item.status} className="relative min-w-0 pb-4 last:pb-0">
          {(i < items.length - 1 || total === null) && (
            <span aria-hidden="true" className={cn("absolute top-10 bottom-1 left-4 w-px", item.status === "complete" ? "bg-primary" : "bg-border")} />
          )}
          <StepEntry item={item} onSelect={onSelect} className="items-start gap-3 p-0">
            <Marker item={item} />
            <span className="min-w-0 flex-1 pt-1.5">
              <StepLabel item={item} />
            </span>
          </StepEntry>
        </li>
      ))}
      {total === null && <li className="pl-11 text-caption text-muted-foreground">この後の手順は、選んだ内容で決まります</li>}
    </ol>
  )
}

function CompactSteps<Id extends string>({
  items,
  onSelect,
  total,
  currentLabel,
}: {
  items: StepItem<Id>[]
  onSelect?: (id: Id) => void
  total: number | null
  currentLabel: "visible" | "hidden"
}) {
  const [open, setOpen] = React.useState(false)
  const listId = React.useId()
  const current = items.find((i) => i.status === "current")
  const position = current ? current.index + 1 : 0
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className={cn("flex min-w-0 justify-between gap-4", currentLabel === "visible" ? "items-start" : "items-center")}>
        <p className="flex min-w-0 flex-col gap-0.5" data-slot="stepper-current">
          <span className="text-caption text-muted-foreground tabular-nums">
            {total === null ? `ステップ ${position}` : `ステップ ${position} / ${total}`}
          </span>
          {currentLabel === "visible" ? (
            <>
              <span className="text-ui font-semibold [overflow-wrap:anywhere] [word-break:auto-phrase]">{current?.label}</span>
              <span className="sr-only">（現在のステップ）</span>
            </>
          ) : (
            // 一覧を閉じている間は aria-current="step" の要素が隠れるため、現在のステップの名前を文字で伝える
            current && <span className="sr-only">（現在のステップ：{current.label}）</span>
          )}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="-mr-2 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md px-2 text-ui text-foreground outline-none hover:bg-accent focus-visible:focus-ring"
        >
          すべての手順
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-(--duration-fast)", open && "rotate-180")} />
        </button>
      </div>
      <div id={listId} hidden={!open}>
        <VerticalSteps
          items={items}
          total={total}
          onSelect={
            onSelect &&
            ((id: Id) => {
              setOpen(false)
              onSelect(id)
            })
          }
        />
      </div>
    </div>
  )
}

function Stepper<Id extends string>({
  items,
  total,
  onSelect,
  layout = "auto",
  currentLabel = "visible",
  "aria-label": label = "手順",
  className,
  ...props
}: Omit<React.ComponentProps<"nav">, "onSelect"> & {
  items: StepItem<Id>[]
  /** 総数。決まっていない場合は null */
  total: number | null
  /** 直接移動できるステップを押した */
  onSelect?: (id: Id) => void
  layout?: "auto" | "horizontal" | "vertical" | "compact"
  /**
   * 簡易の表示（compact、auto の狭い領域）で、現在のステップの名前を示すか。
   * ページの中にステップの名前の見出しがすぐ続く場合は hidden にし、同じ名前を続けて示さない（番号と総数、手順の一覧の入口は残す）。
   * hidden でも、支援技術には現在のステップの名前を伝える（sr-only）。
   * Stepper を見出しと離して置く場合は visible（既定）
   */
  currentLabel?: "visible" | "hidden"
}) {
  return (
    <nav data-slot="stepper" data-layout={layout} aria-label={label} className={cn("@container/stepper w-full min-w-0", className)} {...props}>
      {layout === "horizontal" && <HorizontalSteps items={items} onSelect={onSelect} total={total} />}
      {layout === "vertical" && <VerticalSteps items={items} onSelect={onSelect} total={total} />}
      {layout === "compact" && <CompactSteps items={items} onSelect={onSelect} total={total} currentLabel={currentLabel} />}
      {layout === "auto" && (
        <>
          <div data-slot="stepper-wide" className="hidden @xl/stepper:block">
            <HorizontalSteps items={items} onSelect={onSelect} total={total} />
          </div>
          <div data-slot="stepper-narrow" className="@xl/stepper:hidden">
            <CompactSteps items={items} onSelect={onSelect} total={total} currentLabel={currentLabel} />
          </div>
        </>
      )}
    </nav>
  )
}

export { Stepper }
