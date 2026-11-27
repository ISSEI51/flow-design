"use client"

import * as React from "react"
import { ChevronDown, CircleCheck, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { ConditionIcon } from "@/patterns/service-state"
import { compareIssues, type SystemIssue } from "@/patterns/system-status"

// Flow Design System Banner（Patterns / System & Account / System States）
// 複数のページに影響する問題（オフライン、複数の機能の障害、メンテナンスの事前のお知らせなど）を、App Shell の上部に示す。
// 定義と判断基準は docs/web/patterns/system-states.md を参照。
//
// この部品が守ること
// - Neutral の背景（bg-muted）に、意味のあるアイコンと文で、問題、影響の範囲、必要な行動を示す。高さは内容に合わせる。
// - 複数の問題は、最も重大な 1 つを示し、ほかは「ほか N 件」にまとめる（開いて確かめられる）。
// - 読み上げは、常に置いた領域（role="status"）の中身を変えて伝える。問題の集合と分類が announceDelay の間変わらなかったときだけ
//   更新し、接続と切断を短時間に繰り返す場合や、自動の再試行のたびに読み上げを繰り返さない。フォーカスを動かさない。
//   immediate の問題（即時の認識が必要な重大な障害、操作を止める必要がある問題）が新たに加わった場合は、遅らせずに更新する。
// - 閉じられるのは dismissible の問題と知らせだけ。閉じた後は、フォーカスを Banner の領域に移す（<body> に落とさない）。
//
// この部品が持たないもの（製品の責務）
// - 問題の判断と文、表示の安定（useStableIssues）、閉じた状態の保持、Banner を固定するかの判断（置く位置で決める）。
// - 同じ問題を Toast や Alert で重ねて示さないこと。

type SystemBannerIssue = SystemIssue & {
  /** 問題に対して実際に行える操作（再接続を試す、詳細を見るなど） */
  actions?: React.ReactNode
}

/** 復旧などの知らせ。問題がない間だけ示す */
type SystemBannerNotice = { id: string; title: string; description?: string }

// 文の終わりに句点がなければ補う（「〜です」と「〜できます。」を同じようにつなぐ）
const sentence = (text: string) => (/[。．.!?！？]$/.test(text) ? text : `${text}。`)
const sentences = (...parts: (string | undefined)[]) => parts.filter((p): p is string => Boolean(p)).map(sentence).join("")

const announcementOf = (issues: readonly SystemBannerIssue[], notice: SystemBannerNotice | null | undefined) => {
  if (issues.length === 0) return notice ? sentences(notice.title, notice.description) : ""
  const [first, ...rest] = issues
  const head = sentences(first.title, first.impact, first.action)
  return rest.length > 0 ? `${head}ほかに ${rest.length} 件の問題があります。` : head
}

function SystemBanner({
  issues: issuesProp,
  notice,
  onDismiss,
  settlingIds = [],
  announceDelay = 1000,
  label = "システムの状態",
  dismissLabel = "お知らせを閉じる",
  className,
  ...props
}: Omit<React.ComponentProps<"section">, "children"> & {
  /** 示す問題。現在の問題、予定の順に、重大な順に並べ直す */
  issues: readonly SystemBannerIssue[]
  /** 復旧の知らせなど。問題がない間だけ示す */
  notice?: SystemBannerNotice | null
  /** dismissible の問題と、知らせを閉じる */
  onDismiss?: (id: string) => void
  /** 解消した後、表示を残している問題（useStableIssues の settlingIds）。読み上げない */
  settlingIds?: readonly string[]
  /** 読み上げの内容を更新するまでの時間（ms） */
  announceDelay?: number
  /** 領域の名前 */
  label?: string
  dismissLabel?: string
}) {
  const issues = React.useMemo(
    () => [...issuesProp].sort(compareIssues),
    [issuesProp]
  )
  const [expanded, setExpanded] = React.useState(false)
  const sectionRef = React.useRef<HTMLElement>(null)
  const listId = React.useId()
  const [first, ...rest] = issues
  const shownNotice = first ? null : (notice ?? null)

  // 読み上げ：問題の集合と分類（と知らせ）が announceDelay の間変わらなかったときだけ更新する。
  // 文の細部（再試行の回数など）の変化と、解消した後に表示を残している問題では更新しない。
  const announced = issues.filter((i) => !settlingIds.includes(i.id))
  const announceKey =
    announced.map((i) => `${i.immediate ? "!" : ""}${i.id}:${i.condition}`).join("|") + (shownNotice ? `#${shownNotice.id}` : "")
  const latest = React.useRef({ issues: announced, notice: shownNotice })
  React.useEffect(() => {
    latest.current = { issues: announced, notice: shownNotice }
  })
  const [announcement, setAnnouncement] = React.useState("")
  // 読み上げた immediate の問題（同じ問題を、遅らせずに繰り返し読み上げない）
  const announcedImmediate = React.useRef<string[]>([])
  React.useEffect(() => {
    const { issues: list } = latest.current
    const fresh = list.some((i) => i.immediate && !announcedImmediate.current.includes(`${i.id}:${i.condition}`))
    const timer = setTimeout(
      () => {
        const { issues: now, notice: n } = latest.current
        announcedImmediate.current = now.filter((i) => i.immediate).map((i) => `${i.id}:${i.condition}`)
        setAnnouncement(announcementOf(now, n))
      },
      fresh ? 0 : announceDelay
    )
    return () => clearTimeout(timer)
  }, [announceKey, announceDelay])

  // 問題が 1 件以下になったら、まとめた一覧を閉じる
  if (expanded && rest.length === 0) setExpanded(false)

  const dismiss = (id: string) => {
    onDismiss?.(id)
    // 閉じるボタンが消えるため、フォーカスを Banner の領域に移す
    sectionRef.current?.focus({ preventScroll: true })
  }

  return (
    <section
      ref={sectionRef}
      aria-label={label}
      tabIndex={-1}
      data-slot="system-banner"
      data-empty={(!first && !shownNotice) || undefined}
      className={cn("min-w-0 outline-none", className)}
      {...props}
    >
      <p role="status" aria-live="polite" aria-atomic="true" data-slot="system-banner-live" className="sr-only">
        {announcement}
      </p>
      {first && (
        <div
          data-slot="system-banner-item"
          data-condition={first.condition}
          data-issue={first.id}
          className="flex items-start gap-3 bg-muted px-4 py-3 text-foreground sm:px-6"
        >
          <ConditionIcon condition={first.condition} className="mt-0.5" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-ui font-medium [word-break:auto-phrase]">{first.title}</p>
            {(first.impact || first.action) && (
              <p className="text-ui text-muted-foreground [word-break:auto-phrase]">
                {[first.impact, first.action].filter(Boolean).join("")}
              </p>
            )}
            {(first.actions || rest.length > 0) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                {first.actions}
                {rest.length > 0 && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={listId}
                    data-slot="system-banner-more"
                    onClick={() => setExpanded((v) => !v)}
                    className="inline-flex min-h-10 items-center gap-1 rounded-xs text-ui font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring"
                  >
                    ほか {rest.length} 件の問題
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("size-4 transition-transform duration-(--duration-fast) motion-reduce:transition-none", expanded && "rotate-180")}
                    />
                  </button>
                )}
              </div>
            )}
            {rest.length > 0 && (
              <ul id={listId} hidden={!expanded} data-slot="system-banner-list" className="mt-2 flex flex-col gap-3">
                {rest.map((issue) => (
                  <li key={issue.id} data-issue={issue.id} data-condition={issue.condition} className="flex items-start gap-3">
                    <ConditionIcon condition={issue.condition} className="mt-0.5 size-4" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-ui font-medium [word-break:auto-phrase]">{issue.title}</p>
                      {(issue.impact || issue.action) && (
                        <p className="text-ui text-muted-foreground [word-break:auto-phrase]">
                          {[issue.impact, issue.action].filter(Boolean).join("")}
                        </p>
                      )}
                      {issue.actions && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{issue.actions}</div>}
                    </div>
                    {issue.dismissible && onDismiss && (
                      <Button variant="ghost" size="icon-sm" aria-label={dismissLabel} onClick={() => dismiss(issue.id)}>
                        <X />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {first.dismissible && onDismiss && (
            <Button variant="ghost" size="icon-sm" aria-label={dismissLabel} className="-my-1" onClick={() => dismiss(first.id)}>
              <X />
            </Button>
          )}
        </div>
      )}
      {shownNotice && (
        <div data-slot="system-banner-notice" className="flex items-start gap-3 bg-muted px-4 py-3 text-foreground sm:px-6">
          <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-ui font-medium">{shownNotice.title}</p>
            {shownNotice.description && <p className="text-ui text-muted-foreground">{shownNotice.description}</p>}
          </div>
          {onDismiss && (
            <Button variant="ghost" size="icon-sm" aria-label={dismissLabel} className="-my-1" onClick={() => dismiss(shownNotice.id)}>
              <X />
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

export { SystemBanner }
export type { SystemBannerIssue, SystemBannerNotice }
