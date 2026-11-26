"use client"

import * as React from "react"
import { CircleAlert, CircleCheck, CircleHelp, CircleMinus, Clock, LoaderCircle, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

import { isJobActive, jobStateLabels, normalizeJobProgress, type JobProgress, type JobState } from "@/patterns/system-status"

// Flow Design Background Job Status（Patterns / System & Account / System States）
// 長時間の処理（書き出し、取り込み、一括の更新など）の状態の一覧。ページを離れても続く処理を、後から確かめられるようにする。
// 定義と判断基準は docs/web/patterns/system-states.md を参照。一括操作の実行中の表示は Bulk Actions の BulkRunStatus を使う。
//
// この部品が守ること
// - 待機中、処理中、キャンセルの要求中、キャンセルの完了、成功、部分的な失敗、失敗、結果が不明を、文とアイコンで区別する。
// - 実際の進捗（progress）がある場合だけ、進捗率と件数を示す。ない場合は、進捗率を作らない。
// - キャンセルを要求した後は「キャンセルを要求しました」と示し、停止したとは示さない（サーバーが停止を確かめるまで）。
//   キャンセルの操作は、待機中と処理中の間だけ置く。
// - 状態の変化（終わった、キャンセルした）は、常に置いた領域（role="status"）で 1 回だけ伝える。進捗の変化は読み上げない
//   （Progress の値で伝える）。最初の表示で、既にある処理の状態を読み上げない。
//
// この部品が持たないもの（製品の責務）
// - ジョブの実行と管理の基盤、状態の取得（ポーリングや通知）、古い応答の判定（mergeJobUpdates を使う）、キャンセルの処理。
// - 結果の確認の操作（ダウンロード、失敗した行の確認など）。actions で渡す。

const fmt = new Intl.NumberFormat("ja-JP")

const stateIcons: Record<JobState, { icon: typeof CircleCheck; className: string; spin?: boolean }> = {
  queued: { icon: Clock, className: "text-muted-foreground" },
  running: { icon: LoaderCircle, className: "text-muted-foreground", spin: true },
  "cancel-requested": { icon: LoaderCircle, className: "text-muted-foreground", spin: true },
  cancelled: { icon: CircleMinus, className: "text-muted-foreground" },
  succeeded: { icon: CircleCheck, className: "text-success" },
  partial: { icon: TriangleAlert, className: "text-warning" },
  failed: { icon: CircleAlert, className: "text-destructive" },
  unknown: { icon: CircleHelp, className: "text-warning" },
}

function JobStateLabel({ state, className }: { state: JobState; className?: string }) {
  const { icon: Icon, className: tone, spin } = stateIcons[state]
  return (
    <span data-slot="job-state" data-state={state} className={cn("inline-flex items-center gap-2 text-ui", className)}>
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", tone, spin && "motion-safe:animate-spin")} />
      {jobStateLabels[state]}
    </span>
  )
}

function JobStatusItem({
  name,
  state,
  progress,
  unit = "件",
  description,
  onCancel,
  cancelLabel = "キャンセル",
  actions,
  className,
  ...props
}: Omit<React.ComponentProps<"li">, "children"> & {
  /** 処理の名前（「顧客の書き出し」） */
  name: string
  /** 示す状態。キャンセルを要求した後は displayJobState の結果を渡す */
  state: JobState
  /** 実際の進捗。わからない場合は null */
  progress: JobProgress | null
  /** 進捗の単位 */
  unit?: string
  /** 補足（開始した時刻、成功と失敗の件数、失敗の理由など） */
  description?: React.ReactNode
  /** キャンセルを要求する。待機中と処理中の間だけ示す */
  onCancel?: () => void
  cancelLabel?: string
  /** 結果の確認の操作（ダウンロード、結果を確認など） */
  actions?: React.ReactNode
}) {
  const real = normalizeJobProgress(progress)
  const active = isJobActive(state)
  const cancellable = onCancel && (state === "queued" || state === "running")
  return (
    <li data-slot="job-status-item" data-state={state} className={cn("flex flex-col gap-3 py-4", className)} {...props}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-ui font-medium [word-break:auto-phrase]">{name}</p>
          <JobStateLabel state={state} className="text-muted-foreground" />
        </div>
        {(cancellable || actions) && (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {cancellable && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                {cancelLabel}
              </Button>
            )}
          </div>
        )}
      </div>
      {/* 実際の進捗がある間だけ進捗率を示す。終わった後は、件数を説明に書く（製品） */}
      {active && real && (
        <Progress value={(real.done / real.total) * 100} status={state === "cancel-requested" ? "paused" : "default"} className="max-w-md gap-1">
          <ProgressLabel className="sr-only">{name}の進捗</ProgressLabel>
          <ProgressValue>{() => `${fmt.format(real.done)} / ${fmt.format(real.total)}${unit}`}</ProgressValue>
        </Progress>
      )}
      {description && <div className="text-ui text-muted-foreground [word-break:auto-phrase]">{description}</div>}
    </li>
  )
}

const terminalAnnouncement: Partial<Record<JobState, string>> = {
  succeeded: "が完了しました",
  partial: "が一部失敗しました",
  failed: "が失敗しました",
  unknown: "の結果を確認できません",
  cancelled: "をキャンセルしました",
}

/**
 * 処理の状態の変化を、読み上げる文にする。終わった状態とキャンセルの完了に変わったときだけ文を返す。
 * 最初の描画で既にある処理と、進捗の変化では返さない。
 */
function useJobAnnouncement(
  jobs: readonly { id: string; name: string; state: JobState }[],
  include: (state: JobState) => boolean = () => true
) {
  const includeRef = React.useRef(include)
  includeRef.current = include
  const seen = React.useRef<Map<string, JobState> | null>(null)
  const [text, setText] = React.useState("")
  const key = jobs.map((j) => `${j.id}:${j.state}`).join("|")
  const latest = React.useRef(jobs)
  latest.current = jobs
  React.useEffect(() => {
    const prev = seen.current
    const next = new Map(latest.current.map((j) => [j.id, j.state]))
    seen.current = next
    if (!prev) return
    const changed = latest.current.filter(
      (j) => prev.has(j.id) && prev.get(j.id) !== j.state && terminalAnnouncement[j.state] && includeRef.current(j.state)
    )
    if (changed.length > 0) setText(changed.map((j) => `${j.name}${terminalAnnouncement[j.state]}`).join("。"))
  }, [key])
  return text
}

function JobStatusList({
  jobs,
  label = "処理の状況",
  announce = true,
  empty,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  /** 読み上げに使う処理の一覧（ID、名前、示す状態） */
  jobs: readonly { id: string; name: string; state: JobState }[]
  label?: string
  /**
   * 状態の変化を、この一覧の読み上げの領域で伝えるか。関数を渡すと、true を返した状態だけを伝える。
   * 製品が Toast で一部の変化（成功など）を伝える場合は、その状態を除く（重ねて読み上げない）。
   * 失敗、部分的な失敗、結果不明は、Toast を使う設定でも伝えない状態にしない（伝わらなくなる）。
   */
  announce?: boolean | ((state: JobState) => boolean)
  /** 処理がないときの表示 */
  empty?: React.ReactNode
  /** JobStatusItem を並べる */
  children?: React.ReactNode
}) {
  const announcement = useJobAnnouncement(jobs, typeof announce === "function" ? announce : () => announce)
  return (
    <div data-slot="job-status-list" className={cn("min-w-0", className)} {...props}>
      <p role="status" aria-live="polite" aria-atomic="true" data-slot="job-status-live" className="sr-only">
        {announcement}
      </p>
      {jobs.length === 0 ? (
        empty
      ) : (
        <ul aria-label={label} className="flex flex-col divide-y divide-border">
          {children}
        </ul>
      )}
    </div>
  )
}

export { JobStateLabel, JobStatusItem, JobStatusList, useJobAnnouncement }
