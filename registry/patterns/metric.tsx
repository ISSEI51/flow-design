"use client"

import * as React from "react"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react"
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import {
  describeComparison,
  getTargetProgress,
  type ComparisonDisplayOptions,
  type ComparisonResult,
  type EvaluationDirection,
  type ValueKind,
} from "@/patterns/comparison"
import type { Loadable } from "@/patterns/data-states"
import { formatMetricValue, type MetricFormat } from "@/patterns/metric-format"
import { cn } from "@/lib/utils"

// Flow Design Metric（Patterns / Data Analysis / Metric Overview）
// 指標の名前と現在値を基本とし、必要な場合だけ比較値、目標、推移、定義、詳細への移動を加える。
// 定義と判断基準は docs/web/patterns/metric-overview.md を参照。
//
// - MetricGroup：指標の並び（dl）。Card で囲まず、余白と文字の強弱で区切る。
// - Metric：1 つの指標。size で重要度を表す（hero 48px / 700、primary 36px / 600、secondary 28px / 600、compact 20px / 600）。
//   読み込み中は、同じ高さの Skeleton で場所を確保する。取得できない値、値がない値、算出できない値を 0 にしない。
// - ComparisonValue：比較値。増減の向きを矢印と符号で、良否を色と文字で示す（色だけで伝えない）。
//   Period Comparison の数値の表でも同じ部品を使う。計算は comparison.ts。
// - MetricTarget：目標に対する割合。100% を超える値もそのまま示し、Progress の表示の範囲とは区別する。
// - Sparkline：推移に意味がある場合だけ。データ点が足りない場合は描かない。欠損を 0 として描かない。
// - MetricDefinition：指標の定義（集計方法）。押すと開く Popover。判断に必要な情報を Hover だけの Tooltip に隠さない。

type MetricSize = "hero" | "primary" | "secondary" | "compact"

const valueSize: Record<MetricSize, string> = {
  hero: "text-display",
  primary: "text-metric",
  secondary: "text-page-title",
  compact: "text-heading",
}

// 単位は数値より小さくし、長い単位でも数値の読み取りを妨げないようにする。
const unitSize: Record<MetricSize, string> = {
  hero: "text-page-title",
  primary: "text-heading",
  secondary: "text-heading",
  compact: "text-ui font-semibold",
}

function MetricGroup({
  className,
  minItemWidth = "13rem",
  style,
  ...props
}: React.ComponentProps<"dl"> & {
  /** 1 つの指標の最小の幅。幅が足りない場合は折り返し、横にスクロールさせない */
  minItemWidth?: string
}) {
  return (
    <dl
      data-slot="metric-group"
      className={cn(
        "grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,var(--metric-min)),1fr))] items-start gap-x-12 gap-y-10",
        className
      )}
      style={{ "--metric-min": minItemWidth, ...style } as React.CSSProperties}
      {...props}
    />
  )
}

type MetricStatus = { kind: "provisional" | "stale" | "partial"; text: React.ReactNode }

function MetricValue({
  value,
  format,
  size = "primary",
  emptyLabel = "データなし",
  unavailableLabel = "取得できません",
  invalidLabel = "算出できません",
  className,
}: {
  value: Loadable<number>
  format?: MetricFormat
  size?: MetricSize
  /** 値がない（ready の null）ときの表示 */
  emptyLabel?: string
  unavailableLabel?: string
  /** 数値でない値（NaN、Infinity）のときの表示 */
  invalidLabel?: string
  className?: string
}) {
  if (value.status === "loading") {
    return (
      <span data-slot="metric-value" data-state="loading" className={cn("block", valueSize[size], className)}>
        {/* 数値と同じ行の高さの Skeleton。読み込みの前後でレイアウトを保つ */}
        <span data-slot="skeleton" aria-hidden="true" className="inline-block h-[0.9em] w-[4.5em] max-w-full rounded-sm bg-border align-middle motion-safe:animate-pulse motion-safe:[animation-duration:1.8s]" />
        <span className="sr-only">読み込み中</span>
      </span>
    )
  }
  // 数値でない状態は、数値と同じ大きさで強調しない。行の高さは数値と同じにして、並びをそろえる。
  const statusText = (text: string, state: string) => (
    <span data-slot="metric-value" data-state={state} className={cn("flex min-h-[1.2em] items-center", valueSize[size], className)}>
      <span className="text-heading text-muted-foreground">{text}</span>
    </span>
  )
  if (value.status === "unavailable") return statusText(unavailableLabel, "unavailable")
  if (value.value === null) return statusText(emptyLabel, "empty")
  const f = formatMetricValue(value.value, format)
  if (!f) return statusText(invalidLabel, "invalid")
  return (
    <span data-slot="metric-value" data-state="ready" className={cn("flex min-w-0 flex-wrap items-baseline tabular-nums", valueSize[size], className)}>
      {/* 画面の文字と読み上げを一致させる。省略した場合も、表示した値（約4.42億円）を読む */}
      <data value={String(value.value)} title={f.approximate ? f.exactText : undefined} className="min-w-0 [overflow-wrap:anywhere]">
        {f.parts.approximate && <span className={unitSize[size]}>{f.parts.approximate}</span>}
        {f.parts.prefix && <span className={unitSize[size]}>{f.parts.prefix}</span>}
        <span>{f.parts.number}</span>
        {f.parts.suffix && <span className={cn("ms-0.5", unitSize[size])}>{f.parts.suffix}</span>}
      </data>
    </span>
  )
}

function Metric({
  label,
  value,
  format,
  size = "primary",
  comparison,
  target,
  sparkline,
  definition,
  status,
  note,
  action,
  emptyLabel,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode
  value: Loadable<number>
  format?: MetricFormat
  size?: MetricSize
  /** 比較値（ComparisonValue）。比較に意味がない指標には渡さない */
  comparison?: React.ReactNode
  /** 目標（MetricTarget）。実際に目標がある場合だけ */
  target?: React.ReactNode
  /** 推移（Sparkline）。推移が判断に関係する場合だけ */
  sparkline?: React.ReactNode
  /** 定義（MetricDefinition）。定義によって結果が変わる指標だけ */
  definition?: React.ReactNode
  /** 未確定、古いデータ、一部の取得の失敗などの状態 */
  status?: MetricStatus
  /** 補足（12px） */
  note?: React.ReactNode
  /** 詳細への移動（DrillDownLink）。実際の詳細がある場合だけ。指標の全体をリンクにしない */
  action?: React.ReactNode
  emptyLabel?: string
}) {
  return (
    <div
      data-slot="metric"
      data-size={size}
      aria-busy={value.status === "loading" || undefined}
      className={cn("flex min-w-0 flex-col", size === "compact" ? "gap-1" : "gap-2", className)}
      {...props}
    >
      <dt className="flex min-w-0 items-center gap-1 text-ui font-medium text-muted-foreground">
        <span className="min-w-0 [word-break:auto-phrase]">{label}</span>
        {definition}
      </dt>
      <dd className="flex min-w-0 flex-col gap-2">
        <MetricValue value={value} format={format} size={size} emptyLabel={emptyLabel} />
        {status && (
          <span data-slot="metric-status" data-kind={status.kind} className="text-caption text-muted-foreground">
            {status.text}
          </span>
        )}
        {comparison}
        {target}
        {sparkline}
        {note && <span className="text-caption text-muted-foreground [word-break:auto-phrase]">{note}</span>}
        {action && <span className="mt-1">{action}</span>}
      </dd>
    </div>
  )
}

const evaluationClass = {
  improved: "text-success",
  worsened: "text-destructive",
  neutral: "text-muted-foreground",
  unchanged: "text-muted-foreground",
} as const

function ComparisonValue({
  result,
  label,
  baseline,
  direction = "neutral",
  evaluationLabel = "auto",
  format,
  kind,
  show,
  rateFractionDigits,
  pointFractionDigits,
  className,
  ...props
}: Omit<ComparisonDisplayOptions, "direction"> &
  Omit<React.ComponentProps<"span">, "children"> & {
  result: ComparisonResult
  /** 比較の名前（「前月比」「前年同期比」） */
  label: React.ReactNode
  /** 比較の対象の実数（「前月 4.24億円」）。比較対象の値を確かめられるようにする */
  baseline?: React.ReactNode
  direction?: EvaluationDirection
  /**
   * 評価（改善・悪化）を文字でも示すか。auto（既定）：減少が望ましい指標だけ示す（増減の向きと評価が逆になるため）。
   * 読み上げには常に含める
   */
  evaluationLabel?: "auto" | "always" | "never"
  format?: MetricFormat
  kind?: ValueKind
  show?: ComparisonDisplayOptions["show"]
  className?: string
}) {
  const d = describeComparison(result, { format, kind, show, direction, rateFractionDigits, pointFractionDigits })
  const Icon = d.change === "increase" ? ArrowUpRight : d.change === "decrease" ? ArrowDownRight : ArrowRight
  const showEvaluation =
    d.evaluationLabel !== "" && d.evaluation !== "unchanged" && (evaluationLabel === "always" || (evaluationLabel === "auto" && direction === "decrease"))
  const changeWord = d.change === "increase" ? "増加" : d.change === "decrease" ? "減少" : ""
  return (
    <span
      data-slot="comparison-value"
      data-change={d.change ?? undefined}
      data-evaluation={d.evaluation ?? undefined}
      className={cn("inline-flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-ui", className)}
      {...props}
    >
      <span className="text-muted-foreground">{label}</span>
      {d.available ? (
        <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", evaluationClass[d.evaluation ?? "neutral"])}>
          {d.change !== "unchanged" && <Icon aria-hidden="true" className="size-4 shrink-0 self-center" />}
          <span>{d.text}</span>
          {changeWord && <span className="sr-only">（{changeWord}{d.evaluationLabel ? `、${d.evaluationLabel}` : ""}）</span>}
          {showEvaluation && <span aria-hidden="true" className="ms-1">{d.evaluationLabel}</span>}
        </span>
      ) : (
        <span className="text-muted-foreground">{d.text}</span>
      )}
      {baseline && <span className="text-muted-foreground tabular-nums">{baseline}</span>}
      {d.detail && <span className="basis-full text-caption text-muted-foreground">{d.detail}</span>}
    </span>
  )
}

const percent = (ratio: number) =>
  new Intl.NumberFormat("ja-JP", { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ratio)

function MetricTarget({
  value,
  target,
  direction = "increase",
  format,
  label,
  elapsed,
  className,
}: {
  value: number | null | undefined
  target: number | null | undefined
  /** decrease の指標は上限の目標として示す（「上限 3.0% に対して 2.4%」） */
  direction?: EvaluationDirection
  format?: MetricFormat
  /** 目標の名前（「今月の目標」）。既定は direction から「目標」か「上限」 */
  label?: string
  /**
   * 期間の経過。達成率と区別して、別の文で示す。途中の期間の値を期間の全体の目標（月の上限など）と比べる場合は、必ず渡す
   * （月の初めほど、目標から遠く、上限の内に見えるため）
   */
  elapsed?: { elapsedDays: number; totalDays: number; ratio: number }
  className?: string
}) {
  const p = getTargetProgress({ value, target, direction })
  const name = label ?? (direction === "decrease" ? "上限" : "目標")
  const targetText = formatMetricValue(target, format)?.text ?? "—"
  if (p.status === "invalid") {
    const reason = {
      "target-missing": "目標が設定されていません",
      "value-missing": "現在値がないため、達成率を算出できません",
      "target-zero": `${name}が 0 のため、達成率を算出できません`,
      "target-negative": `${name}がマイナスのため、達成率を算出できません`,
    }[p.reason]
    return (
      <p data-slot="metric-target" data-state="invalid" className={cn("text-caption text-muted-foreground", className)}>
        {p.reason === "target-missing" ? reason : `${name} ${targetText}：${reason}`}
      </p>
    )
  }
  // 上限の目標（limit）は、割合の割合（「上限 1.5% に対して 42.6%」）を示さない。現在値と上限を同じ単位で比べる。
  // 割合（ratio）の差は pt、それ以外は値の単位（件、円）で示す。
  const gapText = (gap: number) =>
    format?.style === "ratio" ? `${(Math.abs(gap) * 100).toFixed(format.maximumFractionDigits ?? 1)}pt` : (formatMetricValue(Math.abs(gap), format)?.text ?? "—")
  const ratioText = percent(p.ratio)
  const mainText = p.kind === "achievement" ? ratioText : p.met ? `あと ${gapText(p.remaining)}` : `${gapText(p.remaining)} 超過`
  const statusText =
    p.kind === "achievement" ? (p.met ? (p.ratio > 1 ? "目標を超えています" : "目標に達しました") : null) : p.met ? null : `${name}を超えています`
  const aria =
    p.kind === "achievement"
      ? `${name} ${targetText} に対して ${ratioText}${statusText ? `、${statusText}` : ""}`
      : p.met
        ? `${name} ${targetText} まで、あと ${gapText(p.remaining)}`
        : `${name} ${targetText} を ${gapText(p.remaining)} 超えています`
  return (
    <div data-slot="metric-target" data-kind={p.kind} data-met={p.met || undefined} className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Progress
        value={p.barValue}
        // 読み上げる値は、表示の範囲（0〜100）に収める前の実際の値
        getAriaValueText={() => aria}
        className="gap-y-1.5"
      >
        <ProgressLabel className="text-caption font-normal text-muted-foreground">
          {name} {targetText}
          {p.kind === "achievement" ? "に対して" : p.met ? "まで" : "を"}
        </ProgressLabel>
        <ProgressValue className="ms-auto text-caption font-medium tabular-nums text-foreground">{() => mainText}</ProgressValue>
      </Progress>
      {(statusText || elapsed) && (
        <p className="flex flex-wrap gap-x-3 text-caption text-muted-foreground">
          {statusText && <span>{statusText}</span>}
          {elapsed && (
            <span data-slot="metric-target-elapsed">
              期間の経過 {elapsed.elapsedDays} / {elapsed.totalDays}日（{percent(elapsed.ratio)}）
            </span>
          )}
        </p>
      )}
    </div>
  )
}

function Sparkline({
  data,
  label,
  minPoints = 4,
  color = "var(--chart-1)",
  className,
}: {
  /** 古い順の値。欠損は null（0 にしない） */
  data: readonly (number | null)[]
  /** 推移の要約（読み上げ）。「過去 12 か月で 4.10億円から 4.42億円に増加」 */
  label: string
  /** 描くのに必要な、値のあるデータ点の数。足りない場合は描かない */
  minPoints?: number
  color?: string
  className?: string
}) {
  // Recharts（クライアントの部品）を描くため、このファイルは "use client" とする。
  const rows = React.useMemo(() => data.map((v, i) => ({ i, v: typeof v === "number" && Number.isFinite(v) ? v : null })), [data])
  const points = rows.filter((r) => r.v !== null).length
  if (points < minPoints) return null
  return (
    <span data-slot="sparkline" className={cn("block h-8 w-full max-w-48", className)}>
      <span aria-hidden="true" className="block size-full">
        <ResponsiveContainer initialDimension={{ width: 160, height: 32 }}>
          <LineChart data={rows} margin={{ top: 3, right: 3, bottom: 3, left: 3 }} accessibilityLayer={false}>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            {/* 欠損（null）は線を途切れさせる。0 として描かない */}
            <Line dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

function MetricDefinition({
  label,
  exact,
  children,
}: {
  label: string
  /** 省略前の正確な値（formatMetricValue の exactText）。省略表記の指標は、ここで正確な値を確かめられるようにする */
  exact?: string | null
  children: React.ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${label}の定義`}
        data-slot="metric-definition-trigger"
        className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:focus-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']"
      >
        <Info aria-hidden="true" className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" data-slot="metric-definition">
        <p className="text-ui font-semibold">{label}の定義</p>
        <div className="flex flex-col gap-2 text-ui text-muted-foreground [word-break:auto-phrase]">{children}</div>
        {exact && (
          <p className="text-ui tabular-nums" data-slot="metric-definition-exact">
            正確な値：{exact}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { ComparisonValue, Metric, MetricDefinition, MetricGroup, MetricTarget, MetricValue, Sparkline }
export type { MetricSize, MetricStatus }
