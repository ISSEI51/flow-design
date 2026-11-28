"use client"

import * as React from "react"
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  importOutcome,
  type ColumnMapping,
  type ImportColumn,
  type ImportField,
  type ImportIntegrity,
  type ImportOutcome,
  type ImportResult,
  type MappingIssues,
} from "@/patterns/import-mapping"

// Flow Design Import Review（Patterns / Forms & Workflows / Import & Export）
// インポートの対応付け、データの検証の結果、処理の結果の表示。定義は docs/web/patterns/import-and-export.md を参照。
// ファイルの送信、解析、検証、登録の処理は製品が行い、結果の件数と行をこの部品に渡す。
//
//   ColumnMappingList       … ファイルの列ごとに、見出し、値の例、登録先の項目（Select）、状態を示す
//   ImportValidationSummary … 正常（登録できる）、要確認（重複の候補など）、エラー（登録できない）の件数と絞り込み
//   ImportIssueTable        … 元のファイルの行番号、項目、原因、直し方
//   ImportResultSummary     … 新規登録、更新、スキップ、失敗の件数。結果が不明な行があれば、再実行ではなく確認を促す

const NONE = "__none__"

function ColumnMappingList({
  columns,
  fields,
  mapping,
  issues,
  ambiguous,
  isAuto,
  onChange,
  disabled,
  className,
}: {
  columns: readonly ImportColumn[]
  fields: readonly ImportField[]
  mapping: ColumnMapping
  issues: MappingIssues
  /** 曖昧で、利用者が選んでいない列 */
  ambiguous: readonly string[]
  isAuto: (key: string) => boolean
  onChange: (key: string, fieldId: string | null) => void
  disabled?: boolean
  className?: string
}) {
  const items = [{ value: NONE, label: "取り込まない" }, ...fields.map((f) => ({ value: f.id, label: f.required ? `${f.label}（必須）` : f.label }))]
  const duplicateOf = (key: string) => issues.duplicates.find((d) => d.columns.includes(key))
  return (
    <ul data-slot="column-mapping" className={cn("flex min-w-0 flex-col divide-y divide-border border-y border-border", className)}>
      {columns.map((c) => {
        const value = mapping[c.key] ?? NONE
        const dup = duplicateOf(c.key)
        const isAmbiguous = ambiguous.includes(c.key)
        return (
          <li key={c.key} data-column={c.key} className="@container/mapping-row min-w-0 py-4">
            <div className="grid min-w-0 gap-3 @xl/mapping-row:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16rem] @xl/mapping-row:items-start @xl/mapping-row:gap-6">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-ui font-medium [overflow-wrap:anywhere]">
                  {c.header || <span className="text-muted-foreground">（見出しなし）</span>}
                </p>
                <p className="text-caption text-muted-foreground tabular-nums">{c.index + 1} 列目</p>
              </div>
              <div className="min-w-0 text-ui">
                <p className="sr-only">値の例</p>
                {c.samples.length ? (
                  <ul className="flex flex-col gap-0.5 text-muted-foreground [overflow-wrap:anywhere]">
                    {c.samples.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">値の例がありません（先頭の行が空）</p>
                )}
              </div>
              <Field invalid={Boolean(dup)}>
                {/* 同じ見出しの列を区別できるよう、列の位置を名前に含める */}
                <FieldLabel className="sr-only">
                  {c.index + 1} 列目「{c.header || "見出しなし"}」の登録先
                </FieldLabel>
                <Select items={items} value={value} disabled={disabled} onValueChange={(v) => onChange(c.key, v === NONE || v === null ? null : String(v))}>
                  <SelectTrigger data-testid={`mapping-${c.key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {dup ? (
                  <FieldError>「{dup.field.label}」に {dup.columns.length} つの列を対応付けています。1 つを選んでください</FieldError>
                ) : isAmbiguous ? (
                  <FieldDescription className="text-warning">候補が複数あります。登録先を選んでください</FieldDescription>
                ) : isAuto(c.key) ? (
                  <FieldDescription>見出しから自動で対応付けました</FieldDescription>
                ) : null}
              </Field>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export type ImportRowState = "valid" | "review" | "error"
export type ImportFilter = "all" | "review" | "error"

const stateMeta = {
  valid: { label: "登録できる", Icon: CircleCheck, className: "text-success" },
  review: { label: "確認が必要", Icon: TriangleAlert, className: "text-warning" },
  error: { label: "エラー", Icon: CircleAlert, className: "text-destructive" },
} as const

const fmt = (n: number) => n.toLocaleString("ja-JP")

/**
 * データの検証の結果の件数と、表示する行の絞り込み。
 * 件数はファイル全体の数を渡す。行の表示が一部だけの場合は、製品がそのことと全体の件数を示す。
 */
function ImportValidationSummary({
  counts,
  filter,
  onFilterChange,
  className,
}: {
  counts: Record<ImportRowState, number>
  filter: ImportFilter
  onFilterChange: (filter: ImportFilter) => void
  className?: string
}) {
  const total = counts.valid + counts.review + counts.error
  const options: [ImportFilter, string][] = [
    ["all", `すべて（${fmt(total)}）`],
    ["review", `確認が必要（${fmt(counts.review)}）`],
    ["error", `エラー（${fmt(counts.error)}）`],
  ]
  return (
    <div data-slot="import-validation-summary" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {(Object.keys(stateMeta) as ImportRowState[]).map((k) => {
          const { label, Icon, className: color } = stateMeta[k]
          return (
            <div key={k} className="flex flex-col gap-1" data-state={k}>
              <dt className="flex items-center gap-1.5 text-ui text-muted-foreground">
                <Icon aria-hidden="true" className={cn("size-4", color)} />
                {label}
              </dt>
              <dd className="text-heading tabular-nums">{fmt(counts[k])}件</dd>
            </div>
          )
        })}
      </dl>
      <div role="group" aria-label="表示する行" className="flex flex-wrap gap-2">
        {options.map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? "secondary" : "ghost"}
            aria-pressed={filter === value}
            className={cn(filter === value && "font-semibold")}
            onClick={() => onFilterChange(value)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}

export type ImportIssue = {
  /** 元のファイルの行番号（見出しの行を 1 とする） */
  row: number
  state: Exclude<ImportRowState, "valid">
  field: string
  /** 原因 */
  message: string
  /** 直し方 */
  fix?: string
}

function ImportIssueTable({ issues, caption, className }: { issues: readonly ImportIssue[]; caption: React.ReactNode; className?: string }) {
  return (
    <Table data-slot="import-issue-table" density="compact" containerClassName={className}>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead align="right" className="w-20">
            行
          </TableHead>
          <TableHead className="w-28">状態</TableHead>
          <TableHead className="w-36">項目</TableHead>
          <TableHead>原因と直し方</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((i) => {
          const { label, Icon, className: color } = stateMeta[i.state]
          return (
            <TableRow key={`${i.row}-${i.field}`} data-row={i.row} data-state={i.state}>
              <TableCell align="right" className="tabular-nums">
                {i.row}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <Icon aria-hidden="true" className={cn("size-4 shrink-0", color)} />
                  {label}
                </span>
              </TableCell>
              <TableCell>{i.field}</TableCell>
              <TableCell className="[word-break:auto-phrase]">
                {i.message}
                {i.fix && <span className="block text-muted-foreground">{i.fix}</span>}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

const countLabels: Record<string, string> = { created: "新規登録", updated: "更新", skipped: "スキップ", failed: "失敗", unknown: "結果が不明" }

/**
 * 処理の結果。件数の合計が処理の対象と一致しない場合は、結果が不明として扱う。
 * - 結果の種類は importOutcome(result, integrity) で決める。integrity を省略すると、照合していない件数として扱い、成功として示さない。
 * - 照合に矛盾がある（integrity.complete が false）が、対象のすべての行の結果が確定している（重なった結果、対象ではない行の結果、
 *   件数と行ごとの結果の不一致だけ）場合は、件数で判定した結果を示す。成功の形（success の色、role="status"）にはせず、矛盾を一覧で示す。
 * - 失敗した行だけを再処理できる（onRetryFailed）。成功した行は再処理の対象にしない（製品が対象を絞る）。
 * - 結果が不明な場合は、再処理のボタンを置かず、状態の確認を促す（onCheckStatus）。
 */
function ImportResultSummary({
  result,
  integrity,
  onRetryFailed,
  onDownloadFailed,
  onCheckStatus,
  retrying,
  className,
}: {
  result: ImportResult
  /**
   * reconcileImportResult の照合の結果。矛盾がある場合は、成功として示さず、件数に含めなかった結果と理由を示す。
   * 省略すると、件数を照合していないため、件数の上で成功でも結果が不明として示す
   */
  integrity?: ImportIntegrity
  onRetryFailed?: () => void
  onDownloadFailed?: () => void
  onCheckStatus?: () => void
  retrying?: boolean
  className?: string
}) {
  const counted = importOutcome(result, integrity)
  // 照合していない件数（integrity がない）は、件数の上で成功していても、成功として示さない
  const outcome = !integrity && counted === "success" ? "unknown" : counted
  // 照合に矛盾があるが、すべての行の結果が確定している（outcome が unknown ではない）
  const anomalies = integrity !== undefined && !integrity.complete && outcome !== "unknown"
  const missing = result.total - (result.created + result.updated + result.skipped + result.failed + result.unknown)
  const title = {
    success: anomalies ? "取り込みが終わりました。サーバーの応答に矛盾がありました" : "取り込みが終わりました",
    partial: "一部の行を取り込めませんでした",
    failed: "取り込めませんでした",
    unknown: "結果を確かめられていない行があります",
  }[outcome]
  const variant = outcome === "success" && !anomalies ? "success" : outcome === "failed" ? "destructive" : "warning"
  const missingCounts = integrity?.missingCounts ?? []
  // 結果が不明な理由。事実と異なる理由を示さない（合計が一致しているのに「一致しません」と書かない）
  const unknownReason =
    result.unknown > 0
      ? "処理の途中で結果を受け取れなかった行があり、登録されたかを確かめられていません。"
      : !integrity
        ? "処理の対象と結果を照合していないため、結果を確かめられていません。"
        : missingCounts.length > 0
          ? `サーバーが${missingCounts.map((k) => `「${countLabels[k] ?? k}」`).join("")}の件数を返さなかったため、すべての行の結果を確かめられていません。`
          : integrity.invalidCounts.length > 0
            ? "件数の形式が正しくない結果があったため、すべての行の結果を確かめられていません。"
            : "結果の件数の合計が、処理の対象の件数と一致しません。"
  const parts = [
    ["新規登録", result.created],
    ["更新", result.updated],
    ["スキップ", result.skipped],
    ["失敗", result.failed],
    ["結果が不明", result.unknown + Math.max(0, missing)],
  ] as const
  return (
    <Alert
      variant={variant}
      role={outcome === "success" && !anomalies ? "status" : "alert"}
      data-slot="import-result"
      data-outcome={outcome}
      data-complete={integrity ? String(integrity.complete) : undefined}
      className={className}
    >
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
          {parts
            .filter(([k, v]) => v > 0 || k === "新規登録" || k === "失敗")
            .map(([k, v]) => (
              <div key={k} className="flex gap-1">
                <dt>{k}</dt>
                <dd className="font-medium text-foreground">{fmt(v)}件</dd>
              </div>
            ))}
          <div className="flex gap-1">
            <dt>処理の対象</dt>
            <dd className="font-medium text-foreground">{fmt(result.total)}件</dd>
          </div>
        </dl>
        {integrity && !integrity.complete && (
          <ul className="mt-2 list-disc pl-5" data-slot="import-integrity">
            {integrity.missingRows.length > 0 && <li>{fmt(integrity.missingRows.length)}行の結果が返されませんでした（結果が不明として数えています）</li>}
            {missingCounts.length > 0 && <li>サーバーが{missingCounts.map((k) => `「${countLabels[k] ?? k}」`).join("")}の件数を返しませんでした（0 件とはみなしていません）</li>}
            {integrity.duplicateRows.length > 0 && <li>{fmt(integrity.duplicateRows.length)}行について、結果が重なって返されました（同じ結果は 1 つとして数え、異なる結果は結果が不明として扱いました）</li>}
            {integrity.unexpectedRows.length > 0 && <li>取り込みの対象ではない {fmt(integrity.unexpectedRows.length)}行の結果が返されました（件数に含めていません）</li>}
            {integrity.countsDisagree && <li>サーバーが返した件数が、行ごとの結果と一致しません（行ごとの結果で数えています）</li>}
            {integrity.invalidCounts.length > 0 && <li>件数の形式が正しくない結果がありました</li>}
          </ul>
        )}
        {outcome === "unknown" && (
          <p className="mt-2">
            {unknownReason}
            もう一度取り込む前に、状態を確認してください。
          </p>
        )}
        {anomalies && <p className="mt-2">処理の対象のすべての行の結果は確定しています。応答の矛盾は、サーバーの記録で確認してください。</p>}
      </AlertDescription>
      {(outcome === "partial" || outcome === "failed" || outcome === "unknown") && (
        <AlertAction>
          {outcome === "unknown" ? (
            onCheckStatus && (
              <Button size="sm" variant="secondary" onClick={onCheckStatus}>
                状態を確認
              </Button>
            )
          ) : (
            <>
              {onRetryFailed && (
                <Button size="sm" variant="secondary" loading={retrying} onClick={onRetryFailed}>
                  失敗した {fmt(result.failed)}件だけを再処理
                </Button>
              )}
              {onDownloadFailed && (
                <Button size="sm" variant="ghost" onClick={onDownloadFailed}>
                  失敗した行をダウンロード
                </Button>
              )}
            </>
          )}
        </AlertAction>
      )}
    </Alert>
  )
}

export { ColumnMappingList, ImportIssueTable, ImportResultSummary, ImportValidationSummary }
// 結果の型と判定は import-mapping.ts にある（React を使わず、サーバーでも使える）。ここからも使えるように再び公開する
export { importOutcome, type ImportOutcome, type ImportResult }
