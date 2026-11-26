"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { DateRangePicker, dateErrorMessage, type DateRangeErrors } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addDays } from "date-fns"

import { fromDateString, isBeforeDate, isValidDate, toDateString, type DateRange, type DateString } from "@/lib/date"
import {
  comparisonBasisLabels,
  comparisonLabels,
  comparisonRange,
  describeRange,
  granularityLabels,
  granularityOrder,
  relativePeriods,
  type AnalysisPeriod,
  type ComparisonBasis,
  type ComparisonMode,
  type ComparisonRange,
  type Granularity,
  type PeriodContext,
  type RelativePeriodId,
  type ResolvedPeriod,
} from "@/patterns/analysis-period"
import { cn } from "@/lib/utils"

// Flow Design Analysis Controls（Patterns / Data Analysis / Analysis Filters・Period Comparison）
// 分析対象の期間、比較の条件、集計単位の操作。定義は docs/web/patterns/analysis-filters.md を参照。
//
// - AnalysisPeriodFilter：プリセット（製品が必要なものだけを選ぶ）と、期間の指定。プリセットはすぐに適用する。
//   指定した期間は「この期間で集計」で適用する。開始日と終了日がそろい、正しい順序で、選べる範囲（min、max）の中の
//   ときだけ押せる（不完全な条件や、片方の日付だけを変えた途中の期間で集計しない）。入力中の値と、適用中の期間を区別して示す。
// - ComparisonSelect：比較の条件。解決した比較期間（同経過期間、調整の理由）を文字で示す。
// - GranularitySelect：集計単位。期間に対して使える単位だけを示す。
// 3 つは別の操作であり、1 つのフィルターのメニューにまとめない。

function ControlLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} className="text-caption text-muted-foreground">
      {children}
    </span>
  )
}

const CUSTOM = "custom"

function AnalysisPeriodFilter({
  value,
  onValueChange,
  presets,
  resolved,
  context,
  allowCustom = true,
  label = "期間",
  min,
  max,
  className,
  locale = "ja-JP",
}: {
  value: AnalysisPeriod
  /** 期間を適用する。適用できない（不正な）期間なら false を返す（useAnalysisQuery の setPeriod） */
  onValueChange: (period: AnalysisPeriod) => boolean | void
  /** 表示するプリセット。製品の分析の目的に必要なものだけ */
  presets: readonly RelativePeriodId[]
  /** 適用中の期間（useAnalysisQuery の period） */
  resolved: ResolvedPeriod
  context: PeriodContext
  allowCustom?: boolean
  label?: string
  /** 選べる最初の日（データのある最初の日） */
  min?: Date
  /** 選べる最後の日。既定は今日（未来の日はデータがない） */
  max?: Date
  className?: string
  locale?: string
}) {
  const id = React.useId()
  const appliedRange = resolved.status === "ready" ? resolved.range : null
  const [editing, setEditing] = React.useState(value.kind === "absolute")
  const [draft, setDraft] = React.useState<DateRange>(() => (appliedRange ? { ...appliedRange } : { from: undefined, to: undefined }))
  const [errors, setErrors] = React.useState<DateRangeErrors>({ from: null, to: null, range: null })
  // 外から値が変わった場合（URL、ほかの画面からの移動、条件のリセット）は、表示をその値に合わせる。
  const valueKey = JSON.stringify(value)
  const [seenKey, setSeenKey] = React.useState(valueKey)
  if (seenKey !== valueKey) {
    setSeenKey(valueKey)
    setEditing(value.kind === "absolute")
    if (appliedRange) setDraft({ ...appliedRange })
  }
  const selectValue = editing ? CUSTOM : value.kind === "absolute" ? CUSTOM : value.id
  const items = [
    ...presets.map((p) => ({ value: p, label: relativePeriods[p].label })),
    ...(allowCustom ? [{ value: CUSTOM, label: "期間を指定" }] : []),
  ]
  const draftComplete = isValidDate(draft.from) && isValidDate(draft.to) && !isBeforeDate(draft.to!, draft.from!)
  const hasError = Boolean(errors.from || errors.to || errors.range)
  const draftApplied =
    draftComplete && appliedRange && toDateString(draft.from!) === toDateString(appliedRange.from) && toDateString(draft.to!) === toDateString(appliedRange.to)
  const messages = [
    errors.from && `開始日：${dateErrorMessage(errors.from, { min, max: max ?? context.today, locale })}`,
    errors.to && `終了日：${dateErrorMessage(errors.to, { min, max: max ?? context.today, locale })}`,
    errors.range && dateErrorMessage(errors.range),
  ].filter(Boolean) as string[]
  const pending = editing && !draftApplied
  // 期間の指定は「この期間で集計」で適用する。開始日と終了日は欄ごとに確定するため、片方だけを変えた途中の期間で集計しない。
  const apply = () => {
    if (!draftComplete || hasError) return
    onValueChange({ kind: "absolute", from: toDateString(draft.from!), to: toDateString(draft.to!) })
  }

  return (
    <div data-slot="analysis-period-filter" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <ControlLabel id={`${id}-label`}>{label}</ControlLabel>
          <Select
            items={items}
            value={selectValue}
            onValueChange={(v) => {
              if (v === CUSTOM) {
                // 期間の指定を始める。適用中の期間を写し、まだ何も変えない。
                setEditing(true)
                if (appliedRange) setDraft({ ...appliedRange })
                return
              }
              setEditing(false)
              onValueChange({ kind: "relative", id: v as RelativePeriodId })
            }}
          >
            <SelectTrigger aria-labelledby={`${id}-label`} size="sm" className="w-60 max-w-full text-ui" data-slot="analysis-period-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {editing && (
          <div className="flex min-w-0 flex-[1_1_26rem] flex-wrap items-end gap-x-3 gap-y-3">
            <div className="min-w-0 flex-[1_1_20rem]">
              <DateRangePicker
                value={draft}
                locale={locale}
                min={min}
                max={max ?? context.today}
                calendarProps={{ weekStartsOn: context.weekStartsOn ?? 1 }}
                labels={{ start: "開始日", end: "終了日" }}
                aria-describedby={messages.length ? `${id}-errors` : undefined}
                onErrorChange={setErrors}
                onValueChange={setDraft}
              />
            </div>
            <Button size="sm" variant="secondary" className="h-control" disabled={!pending || !draftComplete || hasError} onClick={apply} data-slot="analysis-period-apply">
              この期間で集計
            </Button>
            {pending && appliedRange && (
              <Button size="sm" variant="ghost" className="h-control" onClick={() => setDraft({ ...appliedRange })}>
                元に戻す
              </Button>
            )}
          </div>
        )}
      </div>
      {messages.length > 0 && (
        <p id={`${id}-errors`} className="text-caption text-destructive">
          {messages.join(" ")}
        </p>
      )}
      <p data-slot="analysis-period-applied" className="text-caption text-muted-foreground tabular-nums">
        {pending ? "適用中の期間：" : ""}
        {appliedRange ? describeRange(appliedRange, locale) : "—"}
        {resolved.status === "ready" && resolved.inProgress && "（途中の期間）"}
        {resolved.status === "ready" && resolved.truncated && resolved.requestedTo && `（${describeRange({ from: resolved.requestedTo, to: resolved.requestedTo }, locale)}までの指定のうち、今日まで）`}
        {pending && " ・ 入力した期間は、まだ適用していません"}
      </p>
    </div>
  )
}

function ComparisonSelect({
  value,
  onValueChange,
  options,
  disabledOptions = [],
  comparison,
  period,
  basis,
  context,
  customRange,
  onCustomRangeChange,
  label = "比較",
  min,
  className,
  locale = "ja-JP",
}: {
  value: ComparisonMode
  onValueChange: (mode: ComparisonMode) => void
  /** 表示する比較の条件。分析の目的に必要なものだけ。期間によって変えず、使えない条件は disabledOptions で無効にする（GranularitySelect と同じ理由） */
  options: readonly ComparisonMode[]
  disabledOptions?: readonly ComparisonMode[]
  /** 解決した比較期間（useAnalysisQuery の comparison） */
  comparison: ComparisonRange
  /** 分析の対象の期間。渡すと、比較期間が重なる比較の条件を無効にする */
  period?: ResolvedPeriod
  /** 比較の方式と、その判定に必要な値（useAnalysisQuery の comparisonBasis と context）。無効にする選択肢の判定に使う */
  basis?: ComparisonBasis | null
  context?: PeriodContext
  /** 期間を指定する比較（custom）の期間 */
  customRange?: { from: DateString; to: DateString } | null
  /** custom の期間を適用する。渡すと、options の custom で期間を入力できる */
  onCustomRangeChange?: (range: { from: DateString; to: DateString }) => void
  label?: string
  /** 比較の期間として選べる最初の日 */
  min?: Date
  className?: string
  locale?: string
}) {
  const id = React.useId()
  const disabled = new Set(disabledOptions)
  // 分析の対象と重なる比較期間は、同じ日を両方で数えるため選べない（3 か月の期間の前月など）。
  if (period?.status === "ready") {
    for (const m of options) if (m !== "custom" && m !== "none" && comparisonRange({ period, mode: m, basis: basis ?? undefined, context }).status === "invalid") disabled.add(m)
  }
  const items = options.map((o) => ({ value: o, label: comparisonLabels[o] }))
  const initialDraft = (): DateRange => ({ from: fromDateString(customRange?.from), to: fromDateString(customRange?.to) })
  const [draft, setDraft] = React.useState<DateRange>(initialDraft)
  const [errors, setErrors] = React.useState<DateRangeErrors>({ from: null, to: null, range: null })
  const draftComplete = isValidDate(draft.from) && isValidDate(draft.to) && !isBeforeDate(draft.to!, draft.from!)
  const draftApplied = draftComplete && customRange?.from === toDateString(draft.from!) && customRange?.to === toDateString(draft.to!)
  const max = period?.status === "ready" ? addDays(period.range.from, -1) : undefined
  return (
    <div data-slot="comparison-select" className={cn("flex min-w-0 flex-col gap-1", className)}>
      <ControlLabel id={`${id}-label`}>{label}</ControlLabel>
      <Select items={items} value={value} onValueChange={(v) => onValueChange(v as ComparisonMode)}>
        <SelectTrigger aria-labelledby={`${id}-label`} aria-describedby={`${id}-range`} size="sm" className="w-52 max-w-full text-ui">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem key={it.value} value={it.value} disabled={disabled.has(it.value)}>
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === "custom" && onCustomRangeChange && (
        <div className="mt-2 flex min-w-0 flex-wrap items-end gap-3" data-slot="comparison-custom">
          <div className="min-w-0 flex-[1_1_20rem]">
            <DateRangePicker
              value={draft}
              locale={locale}
              min={min}
              max={max}
              labels={{ start: "比較の開始日", end: "比較の終了日" }}
              onErrorChange={setErrors}
              onValueChange={setDraft}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-control"
            disabled={!draftComplete || draftApplied || Boolean(errors.from || errors.to || errors.range)}
            onClick={() => onCustomRangeChange({ from: toDateString(draft.from!), to: toDateString(draft.to!) })}
          >
            この期間と比較
          </Button>
        </div>
      )}
      <p id={`${id}-range`} data-slot="comparison-range" className="text-caption text-muted-foreground tabular-nums [word-break:auto-phrase]">
        {comparison.status === "ready" ? (
          <>
            {describeRange(comparison.range, locale)}
            {/* 期間を指定した比較は、比較の方式でそろえた期間ではないため、方式の名前を示さない（長さが異なる場合は理由を示す） */}
            {comparison.mode !== "custom" && comparison.basis !== "calendar" && `（${comparisonBasisLabels[comparison.basis]}）`}
            {!comparison.fair && comparison.reason && <span className="block text-foreground" data-slot="comparison-unfair">{comparison.reason}</span>}
            {comparison.note && <span className="block">{comparison.note}</span>}
          </>
        ) : comparison.status === "invalid" ? (
          <span className="text-foreground" data-slot="comparison-unavailable">
            {
              {
                overlap: "比較期間が分析の対象の期間と重なるため、比較できません。比較の対象か期間を変えてください",
                "end-before-start": "比較の終了日が開始日より前です。比較期間を指定し直してください",
                missing: "比較期間を指定してください",
                future: "比較期間に今日より後の日が含まれます。比較期間を指定し直してください",
                "unknown-mode": "比較の対象が不正です。比較の対象を選び直してください",
                "no-business-days": "分析の対象に営業日がないため、同じ営業日数で比べられません。比較の方式か期間を変えてください",
                "as-of-required": "同じ経過時間で比べるには、集計済みの時刻が必要です。比較の方式を変えてください",
                "invalid-time-zone": "集計のタイムゾーンが不正なため、比較できません",
                "business-calendar-required": "同じ営業日数で比べるには、営業日のカレンダーが必要です。比較の方式を変えてください",
              }[comparison.reason]
            }
          </span>
        ) : (
          "比較しません"
        )}
      </p>
    </div>
  )
}

function GranularitySelect({
  value,
  onValueChange,
  options,
  shown,
  label = "集計単位",
  className,
}: {
  value: Granularity
  onValueChange: (granularity: Granularity) => void
  /** 期間に対して使える集計単位（useAnalysisQuery の granularities）。ほかの単位は無効として示す */
  options: readonly Granularity[]
  /** 一覧に示す単位（固定）。既定はすべての単位 */
  shown?: readonly Granularity[]
  label?: string
  className?: string
}) {
  const id = React.useId()
  // 選択肢の一覧は固定し、期間に対して使えない単位は無効にする。
  // Base UI の Select は、選択肢の一覧が変わった時点で現在の値が一覧にないと、値を最初の値に戻す（onValueChange を呼ぶ）。
  // 期間の変更で一覧を入れ替えると、この処理が変更の前の値で走り、利用者が選んでいない単位に変わるため。
  const items = (shown ?? granularityOrder).map((g) => ({ value: g, label: granularityLabels[g] }))
  return (
    <div data-slot="granularity-select" className={cn("flex min-w-0 flex-col gap-1", className)}>
      <ControlLabel id={`${id}-label`}>{label}</ControlLabel>
      <Select items={items} value={value} onValueChange={(v) => onValueChange(v as Granularity)}>
        <SelectTrigger aria-labelledby={`${id}-label`} size="sm" className="w-32 max-w-full text-ui">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem key={it.value} value={it.value} disabled={!options.includes(it.value)}>
              {it.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export { AnalysisPeriodFilter, ComparisonSelect, GranularitySelect }
