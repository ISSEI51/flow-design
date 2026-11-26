"use client"

import { LoaderCircle } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

import type { BulkSummary } from "@/patterns/bulk-selection"

// Flow Design Bulk Actions（Patterns / Data Browsing）
// 一括操作の実行中の表示と、結果の表示。選択と実行の状態は bulk-selection.ts（useBulkSelection、useBulkAction）。
// 件数と一括操作のバーは、Data Table の DataTableSelectionBar を使う（再実装しない）。
// 定義と判断基準は docs/web/patterns/bulk-actions.md を参照。

const fmt = new Intl.NumberFormat("ja-JP")
const n = (count: number) => `${fmt.format(count)}件`

// 実行中の表示。実際の進捗（progress）がある場合だけ進捗率を示す。ない場合は、進捗率を推測して示さない。
// 読み上げは、製品が常に置いている読み上げの領域（aria-live）で開始と終了を伝える。この要素は表示と同時に挿入されるため、
// role="status" を付けても読み上げられない支援技術がある。進捗は Progress の値で伝える。
// tabIndex={-1}：実行を始めたボタンが消えたときに、フォーカスを移す先にする。
function BulkRunStatus({
  action,
  count,
  progress,
  className,
}: {
  /** 操作の名前（「担当者の変更」） */
  action: string
  /** 対象の件数。わからない場合は null */
  count: number | null
  progress: { done: number; total: number } | null
  className?: string
}) {
  return (
    <div data-slot="bulk-run-status" tabIndex={-1} className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 outline-none", className)}>
      <p className="inline-flex items-center gap-2 text-ui font-medium">
        <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
        {count === null ? `${action}を実行中` : `${n(count)}の${action}を実行中`}
      </p>
      {progress && progress.total > 0 && (
        <Progress value={(progress.done / progress.total) * 100} className="w-full max-w-60 gap-1">
          <ProgressLabel className="sr-only">{action}の進捗</ProgressLabel>
          <ProgressValue>{() => `${fmt.format(progress.done)} / ${n(progress.total)}`}</ProgressValue>
        </Progress>
      )}
    </div>
  )
}

// 一括操作の結果。重要な部分失敗を Toast だけで伝えず、操作した一覧の上に残す（利用者が閉じるまで）。
// - 完了、失敗、結果が不明の件数を分けて示す。
// - 失敗した行は、名前と理由を示し、失敗した行だけを再試行できる（再試行できない失敗は対象から除く）。
// - 結果が不明な行は、再試行のボタンを置かない。最新の状態の確認を促す（重複して実行しないため）。
function BulkResultAlert({
  summary,
  getItemLabel,
  onRetryFailed,
  onCheckLatest,
  onDismiss,
  retrying = false,
  maxItems = 5,
  className,
}: {
  summary: BulkSummary<unknown, unknown>
  /** 行の名前（会社名など）。省略すると ID */
  getItemLabel?: (id: string) => string
  onRetryFailed?: () => void
  /** 最新の状態を取得し直す（結果が不明な場合） */
  onCheckLatest?: () => void
  onDismiss: () => void
  retrying?: boolean
  /** 失敗した行を一覧で示す上限。超えた分は件数で示す */
  maxItems?: number
  className?: string
}) {
  const { action, succeeded, failed, unknown, requestError } = summary
  const label = (id: string) => getItemLabel?.(id) ?? id
  const retryable = failed.filter((i) => i.retryable !== false)
  const total = succeeded.length + failed.length + unknown.length

  let variant: "success" | "warning" | "destructive" = "success"
  let title: string
  if (requestError) {
    variant = requestError.outcome === "unknown" ? "warning" : "destructive"
    title =
      requestError.outcome === "unknown"
        ? `${action}の結果を確認できませんでした`
        : `${action}を実行できませんでした`
  } else if (failed.length === 0 && unknown.length === 0) {
    title = `${n(succeeded.length)}の${action}が完了しました`
  } else if (succeeded.length === 0 && unknown.length === 0) {
    variant = "destructive"
    title = `${n(failed.length)}の${action}がすべて失敗しました`
  } else {
    variant = "warning"
    title = `${n(total)}のうち、${n(succeeded.length)}の${action}が完了しました`
  }

  const counts = [
    ["完了", succeeded.length],
    ["失敗", failed.length],
    ["結果が不明", unknown.length],
  ] as const

  return (
    <Alert
      variant={variant}
      // 失敗を含む結果は、表示したときに読み上げる。すべて完了した場合は、他の読み上げを妨げない。
      role={variant === "success" ? "status" : "alert"}
      data-slot="bulk-result"
      data-outcome={requestError ? `request-${requestError.outcome}` : variant}
      className={className}
    >
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        {requestError ? (
          <p>
            {requestError.message}
            {requestError.outcome === "unknown"
              ? "。処理されたかを確認できないため、もう一度実行する前に最新の状態を確認してください。"
              : "。処理は行われていません。選択はそのまま残しています。"}
          </p>
        ) : (
          total > 0 &&
          (failed.length > 0 || unknown.length > 0) && (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
              {counts
                .filter(([, c]) => c > 0)
                .map(([k, c]) => (
                  <div key={k} className="flex gap-2">
                    <dt>{k}</dt>
                    <dd className="font-medium text-foreground">{n(c)}</dd>
                  </div>
                ))}
            </dl>
          )
        )}
        {failed.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">失敗した{failed.length > maxItems ? `${n(failed.length)}（先頭の ${n(maxItems)}）` : "行"}</p>
            <ul className="flex list-disc flex-col gap-1 ps-5" data-slot="bulk-result-failed">
              {failed.slice(0, maxItems).map((i) => (
                <li key={i.id} className="[word-break:auto-phrase]">
                  {label(i.id)}
                  {i.message && `：${i.message}`}
                </li>
              ))}
            </ul>
            {failed.length > maxItems && <p>ほか {n(failed.length - maxItems)}。失敗した行は選択したままにしています。</p>}
            {failed.length <= maxItems && <p>失敗した行は選択したままにしています。</p>}
          </div>
        )}
        {unknown.length > 0 && (
          <p data-slot="bulk-result-unknown">
            {n(unknown.length)}は、処理されたかを確認できませんでした。重複して実行しないよう、選択を解除しています。最新の状態を確認してから、必要な行だけをもう一度操作してください。
          </p>
        )}
      </AlertDescription>
      <AlertAction>
        {onRetryFailed && retryable.length > 0 && (
          <Button variant="secondary" size="sm" loading={retrying} onClick={onRetryFailed}>
            失敗した {n(retryable.length)}を再試行
          </Button>
        )}
        {/* 要求そのものが失敗した（処理されていない）場合は、同じ対象でもう一度実行できる */}
        {onRetryFailed && requestError?.outcome === "failed" && (
          <Button variant="secondary" size="sm" loading={retrying} onClick={onRetryFailed}>
            もう一度実行
          </Button>
        )}
        {onCheckLatest && (unknown.length > 0 || requestError?.outcome === "unknown") && (
          <Button variant="secondary" size="sm" onClick={onCheckLatest}>
            最新の状態を確認
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          結果を閉じる
        </Button>
      </AlertAction>
    </Alert>
  )
}

export { BulkResultAlert, BulkRunStatus }
