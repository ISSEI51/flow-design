"use client"

import * as React from "react"
import { Circle, CircleCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

import type { Checklist, ChecklistVisibility } from "@/patterns/onboarding"

// Flow Design Getting Started Checklist（Patterns / System & Account / Onboarding）
// 複数の初期作業が必要な場合に、完了した件数、進捗、作業への移動、折りたたみ、非表示を示す。
// 定義は docs/web/patterns/onboarding.md を参照。内容と状態は deriveChecklist（onboarding.ts）で導いて渡す。
//
// この部品が守ること
// - 完了は checklist（実際の作業結果から導いたもの）だけで示す。作業のボタンは作業の画面へ移る操作であり、完了にしない。
// - 非表示（onVisibilityChange("hidden")）と完了を分ける。すべて完了した場合は、完了を短く示して閉じられるようにする。
// - 状態を色やアイコンだけで伝えない（「完了」の文字と、支援技術向けの「完了」「未完了」）。
// - 作業が完了したことを、常に置いた読み上げの領域（role="status"）で伝える。最初の表示とスコープの変更では読み上げない。
//   フォーカスは動かさない。
//
// この部品が持たないもの（製品の責務）
// - 表示の状態の保存（サーバーなど）。非表示にした後の再表示の入口（ヘルプのメニューなど）と、非表示にした後のフォーカスの移動先。
// - 作業の画面への移動（onOpenTask で受け取り、製品のルーターで移る）。
// - 必須の作業が残っている場合の案内（非表示にしても、関係する画面で示す）。

function GettingStartedChecklist<Id extends string>({
  checklist,
  onVisibilityChange,
  onOpenTask,
  actionLabel,
  title = "利用開始の準備",
  scopeKey,
  headingLevel = 2,
  className,
  ...props
}: Omit<React.ComponentProps<"section">, "title" | "children"> & {
  /** deriveChecklist の結果 */
  checklist: Checklist<Id>
  /** 表示の状態の変更（折りたたみ、展開、非表示）。保存は製品が行う */
  onVisibilityChange: (visibility: ChecklistVisibility) => void
  /** 作業の画面へ移る。完了にはしない */
  onOpenTask: (id: Id) => void
  /** 作業のボタンの名前。押した結果がわかる名前にする（「顧客の一覧へ」など） */
  actionLabel: (item: Checklist<Id>["items"][number]) => string
  title?: string
  /** 利用者と組織の組み合わせ。変わったら、完了の読み上げの比較をやり直す */
  scopeKey?: string
  headingLevel?: 2 | 3
}) {
  const id = React.useId()
  const headingId = `${id}-title`
  const listId = `${id}-list`
  const Heading = headingLevel === 2 ? "h2" : "h3"
  const { items, doneCount, total, presentation } = checklist

  // 作業の完了の読み上げ。前の描画の完了した作業と比べ、新しく完了したものだけを伝える。
  const [message, setMessage] = React.useState("")
  const previous = React.useRef<{ scope: string | undefined; done: Set<string> } | null>(null)
  const doneKey = items
    .filter((i) => i.done)
    .map((i) => i.id)
    .join("\n")
  React.useEffect(() => {
    const done = new Set(doneKey ? doneKey.split("\n") : [])
    const before = previous.current
    previous.current = { scope: scopeKey, done }
    if (!before || before.scope !== scopeKey) {
      setMessage("")
      return
    }
    const added = items.filter((i) => i.done && !before.done.has(i.id))
    if (added.length === 0) return
    setMessage(
      doneCount === total
        ? `すべての作業が完了しました（${total} 件）`
        : `「${added.map((a) => a.title).join("」「")}」が完了しました。${total} 件中 ${doneCount} 件が完了しています`
    )
    // items は doneKey と scopeKey で比べる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey, scopeKey])

  if (presentation === "none" || presentation === "hidden") return null
  const expanded = presentation === "expanded"
  return (
    <section
      data-slot="getting-started"
      data-presentation={presentation}
      aria-labelledby={headingId}
      className={cn("@container/checklist flex min-w-0 flex-col gap-4 rounded-xl border border-border p-4 @md/checklist:p-6", className)}
      {...props}
    >
      <p role="status" className="sr-only">
        {message}
      </p>
      {presentation === "completed" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Heading id={headingId} className="text-heading">
              {title}が完了しました
            </Heading>
            <p className="text-ui text-muted-foreground">{total} 件の作業がすべて完了しています。</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onVisibilityChange("hidden")}>
            閉じる
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Heading id={headingId} className="text-heading">
              {title}
            </Heading>
            <p className="text-ui text-muted-foreground tabular-nums" data-slot="getting-started-count">
              {total} 件中 {doneCount} 件完了
            </p>
            <div className="ms-auto flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={expanded}
                aria-controls={expanded ? listId : undefined}
                onClick={() => onVisibilityChange(expanded ? "collapsed" : "expanded")}
              >
                {expanded ? "折りたたむ" : "作業を表示"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onVisibilityChange("hidden")}>
                非表示にする
              </Button>
            </div>
          </div>
          <Progress value={total === 0 ? 0 : (doneCount / total) * 100} getAriaValueText={() => `${total} 件中 ${doneCount} 件完了`}>
            <ProgressLabel className="sr-only">{title}の進捗</ProgressLabel>
          </Progress>
          {expanded && (
            <ol id={listId} className="flex flex-col">
              {items.map((item) => (
                <li
                  key={item.id}
                  data-task-id={item.id}
                  data-done={item.done || undefined}
                  className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 border-t border-border py-3 first:border-t-0 @md/checklist:grid-cols-[auto_1fr_auto] @md/checklist:items-center"
                >
                  {item.done ? (
                    <CircleCheck aria-hidden="true" className="mt-0.5 size-5 text-success @md/checklist:mt-0" />
                  ) : (
                    <Circle aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground @md/checklist:mt-0" />
                  )}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className={cn("text-ui font-medium [word-break:auto-phrase]", item.done && "text-muted-foreground")}>
                      <span className="sr-only">{item.done ? "完了：" : "未完了："}</span>
                      {item.title}
                      {item.required && <span className="ms-2 text-caption font-normal text-muted-foreground">必須</span>}
                    </p>
                    {item.description && !item.done && (
                      // 狭い領域では補足の説明を省き、通常の操作の領域を圧迫しない。
                      <p className="hidden text-caption text-muted-foreground [word-break:auto-phrase] @md/checklist:block">{item.description}</p>
                    )}
                  </div>
                  {item.done ? (
                    <span aria-hidden="true" className="col-start-2 text-ui text-success @md/checklist:col-start-3">
                      完了
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="col-start-2 justify-self-start @md/checklist:col-start-3"
                      onClick={() => onOpenTask(item.id)}
                    >
                      {actionLabel(item)}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  )
}

export { GettingStartedChecklist }
