import { useId, type ReactNode } from "react"
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartDataTable,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  chartAnimation,
  chartStyles,
  type ChartConfig,
} from "@/components/ui/chart"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableScrollArea } from "@/patterns/table-scroll-area"
import { compareValues, formatDifference, type EvaluationDirection } from "@/patterns/comparison"
import { formatMetricValue, type MetricFormat } from "@/patterns/metric-format"
import { ComparisonValue } from "@/patterns/metric"
import { DrillDownLink } from "@/patterns/drill-down"
import { formatDate } from "@/lib/date"
import { cn } from "@/lib/utils"

import type { TrendRow } from "../../data/data-analysis/analysis-model"
import { ANALYSIS_TODAY } from "../../data/data-analysis/subscriptions"

// Data Analysis の検証画面と資料のページで共有する、プレビュー専用の部品。Registry には含めない。

export const yenFormat: MetricFormat = { style: "currency", unit: "円" }
export const ratioFormat: MetricFormat = { style: "ratio", maximumFractionDigits: 1, minimumFractionDigits: 1 }
export const marginFormat: MetricFormat = { style: "ratio", maximumFractionDigits: 1, minimumFractionDigits: 1 }
export const countFormat = (unit: string): MetricFormat => ({ unit })

export const fmt = (v: number | null | undefined, format: MetricFormat) => formatMetricValue(v, format)?.text ?? "—"
/** 万円の単位の軸の目盛り */
export const manYen = (v: number) => `${Math.round(v / 10_000).toLocaleString("ja-JP")}万`

export const ready = (value: number | null | undefined) => ({ status: "ready" as const, value: value ?? null })

/** 数値の表。グラフの近くに置き、Tooltip を使えない人も数値を確かめられるようにする */
export function ChartDetails({ children, label = "数値を表で見る" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group text-ui">
      <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-xs text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:focus-ring">
        {label}
      </summary>
      <div className="mt-3 max-w-full overflow-x-auto">{children}</div>
    </details>
  )
}

// ---------------------------------------------------------------- MRR の推移（確定実績、途中経過、予測、前年）
const trendConfig = {
  confirmed: { label: "確定した実績", color: "var(--chart-1)", indicator: "line" },
  partial: { label: "途中経過", color: "var(--chart-1)", indicator: "dashed" },
  forecast: { label: "予測", color: "var(--chart-3)", indicator: "dashed" },
  previousYear: { label: "前年", color: "var(--border-strong)", indicator: "dashed" },
} satisfies ChartConfig

export function MrrTrendChart({ rows, forecastBasis, testId, height = "h-80" }: { rows: TrendRow[]; forecastBasis: Date | null; testId?: string; height?: string }) {
  const titleId = useId()
  const descId = useId()
  const shown = forecastBasis ? rows : rows.filter((r) => !r.isFuture)
  const config = forecastBasis ? trendConfig : (({ forecast: _f, ...rest }) => rest)(trendConfig)
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid={testId}>
      <p id={titleId} className="sr-only">
        月末の MRR の推移
      </p>
      <p id={descId} className="text-caption text-muted-foreground">
        月末の時点の値。今月は {ANALYSIS_TODAY.getMonth() + 1}月{ANALYSIS_TODAY.getDate()}日時点の途中経過（点線）。前年は同じ月の値（灰色の破線）。
        {forecastBasis ? `予測は ${formatDate(forecastBasis)} を基準にした製品の算出（橙の破線と範囲）。` : "予測のデータはありません。"}
      </p>
      <ChartContainer config={config} aria-labelledby={titleId} aria-describedby={descId} className={cn("aspect-auto w-full", height)}>
        <ComposedChart data={shown} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...chartStyles.grid} />
          <XAxis dataKey="label" {...chartStyles.axis} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...chartStyles.axis} width={64} tickFormatter={manYen} domain={["auto", "auto"]} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, p) => (p?.[0]?.payload as TrendRow | undefined)?.fullLabel ?? ""}
                valueFormatter={(v) => fmt(v, yenFormat)}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {forecastBasis && (
            <Area dataKey="forecastRange" stroke="none" fill="var(--chart-3)" fillOpacity={0.12} legendType="none" tooltipType="none" isAnimationActive={false} connectNulls={false} />
          )}
          <Line dataKey="previousYear" stroke="var(--color-previousYear)" {...chartStyles.forecastLine} strokeDasharray="4 4" {...chartAnimation} />
          <Line dataKey="confirmed" stroke="var(--color-confirmed)" {...chartStyles.line} {...chartAnimation} />
          <Line dataKey="partial" stroke="var(--color-partial)" {...chartStyles.line} strokeDasharray="2 3" dot={{ r: 3, fill: "var(--background)", strokeWidth: 2 }} {...chartAnimation} />
          {forecastBasis && <Line dataKey="forecast" stroke="var(--color-forecast)" {...chartStyles.forecastLine} {...chartAnimation} />}
        </ComposedChart>
      </ChartContainer>
      <ChartDetails>
        <ChartDataTable
          caption="月末の MRR の推移"
          data={shown.map((r) => ({
            month: r.fullLabel,
            actual: r.confirmed ?? (r.inProgress ? r.partial : null),
            state: r.isFuture ? "予測" : r.inProgress ? "途中経過" : "確定",
            previousYear: r.previousYear,
            forecast: r.isFuture ? r.forecast : null,
          }))}
          columns={[
            { key: "month", label: "月" },
            { key: "state", label: "状態" },
            { key: "actual", label: "実績", numeric: true, format: (v) => fmt(v as number, yenFormat) },
            { key: "previousYear", label: "前年の同じ月", numeric: true, format: (v) => fmt(v as number, yenFormat) },
            ...(forecastBasis ? [{ key: "forecast" as const, label: "予測", numeric: true, format: (v: unknown) => fmt(v as number, yenFormat) }] : []),
          ]}
        />
      </ChartDetails>
    </div>
  )
}

// ---------------------------------------------------------------- 増減差のグラフ（正負の値）
export type DiffItem = { key: string; label: string; value: number | null }

/**
 * 正と負の値を、0 の線から左右に伸ばす棒グラフ（Recharts の BarChart、横向き）。
 * 値の向きは位置と符号で示し、良否の色（Success、Destructive）は使わない。
 */
export function DiffBarChart({ items, format, title, testId, height }: { items: DiffItem[]; format: MetricFormat; title: string; testId?: string; height?: number }) {
  const titleId = useId()
  const config = { value: { label: title, color: "var(--chart-1)" } } satisfies ChartConfig
  const data = items.map((i) => ({ ...i, display: i.value }))
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid={testId}>
      <p id={titleId} className="sr-only">
        {title}
      </p>
      <ChartContainer config={config} aria-labelledby={titleId} className="aspect-auto w-full" style={{ height: height ?? 48 * items.length + 40 }}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} vertical />
          <XAxis type="number" {...chartStyles.axis} tickFormatter={manYen} domain={["auto", "auto"]} />
          <YAxis type="category" dataKey="label" {...chartStyles.axis} width={104} />
          <ReferenceLine x={0} stroke="var(--border-strong)" />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator valueFormatter={(v) => formatDifference(v, format) ?? "—"} />} />
          <Bar dataKey="display" name="value" radius={chartStyles.barRadius} {...chartAnimation}>
            {data.map((d) => (
              <Cell key={d.key} fill={(d.value ?? 0) < 0 ? "var(--chart-3)" : "var(--chart-1)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}

// ---------------------------------------------------------------- 数値の比較の表
export type ComparisonRowSpec = {
  key: string
  label: ReactNode
  current: number | null
  baseline: number | null
  format: MetricFormat
  direction: EvaluationDirection
  kind?: "amount" | "ratio"
  /** 基準値の取得に失敗した */
  baselineUnavailable?: boolean
  /** 集計の条件が異なるため比較できない理由 */
  incomparable?: string | null
}

/**
 * 現在の期間と比較期間の数値の表。増減は Metric と同じ ComparisonValue（comparison.ts）で示す。
 * 列は「指標・現在・増減・比較期間」の順。狭い画面で横にスクロールする前に、判断に必要な増減が見えるようにする。
 */
export function ComparisonTable({
  rows,
  caption,
  currentLabel,
  baselineLabel,
  testId,
  notation,
}: {
  rows: ComparisonRowSpec[]
  caption: string
  currentLabel: ReactNode
  baselineLabel: ReactNode
  testId?: string
  /** compact：すべての行を省略表記にする（同じ単位の列で、表記を混在させない）。省略すると行ごとに、現在値と基準値で同じ表記にする */
  notation?: "compact"
}) {
  // 同じ行（同じ列）の値の表記をそろえる。「約102万円」と「173,000円」を並べない。
  const rowFormat = (r: ComparisonRowSpec): MetricFormat => {
    if (r.format.style === "ratio") return r.format
    const big = Math.max(Math.abs(r.current ?? 0), Math.abs(r.baseline ?? 0)) >= (r.format.compactFrom ?? 1_000_000)
    return { ...r.format, notation: notation === "compact" || big ? "compact" : "standard" }
  }
  return (
    <TableScrollArea className="max-w-full" data-testid={testId}>
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>指標</TableHead>
            <TableHead align="right">{currentLabel}</TableHead>
            <TableHead>増減</TableHead>
            <TableHead align="right">{baselineLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} data-row-key={r.key}>
              <TableCell className="min-w-28 font-medium">{r.label}</TableCell>
              <TableCell align="right" className="whitespace-nowrap tabular-nums">
                {fmt(r.current, rowFormat(r))}
              </TableCell>
              <TableCell className="min-w-32">
                <ComparisonValue
                  label={<span className="sr-only">増減</span>}
                  result={compareValues({
                    current: ready(r.current),
                    baseline: r.baselineUnavailable ? { status: "unavailable" } : ready(r.baseline),
                    kind: r.kind,
                    incomparableReason: r.incomparable,
                  })}
                  direction={r.direction}
                  format={rowFormat(r)}
                  kind={r.kind}
                  show={r.kind === "ratio" ? "points" : "auto"}
                />
              </TableCell>
              <TableCell align="right" className="whitespace-nowrap tabular-nums text-muted-foreground">
                {r.baselineUnavailable ? "取得できません" : fmt(r.baseline, rowFormat(r))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  )
}

// ---------------------------------------------------------------- 内訳の横棒（Cross-filtering の選択元）
export type BreakdownItem = { key: string; label: string; value: number | null; detail?: string; baseline?: number | null }

/**
 * 内訳の横棒。棒は HTML で描き、各行を選択のボタン（aria-pressed）にする（キーボードとタッチで選べる）。
 * - 選んだ行は色で、選ばない行は薄い色で示す。選択元の内訳は消さない（Cross-filtering は選択元に適用しない）
 * - 詳細へ進むリンク（drillHref）は選択のボタンとは別の要素にする（1 回の操作で両方を実行しない）
 * - 値がない行は「データなし」と示し、0 の棒と区別する
 */
export function BreakdownBars({
  items,
  format,
  selected,
  onSelect,
  selectLabel,
  drillHref,
  drillLabel,
  max,
  testId,
}: {
  items: BreakdownItem[]
  format: MetricFormat
  selected?: string | null
  /** 指定すると、行を選んで同じ画面のほかの領域を絞り込める（Cross-filtering） */
  onSelect?: (item: BreakdownItem) => void
  selectLabel?: (item: BreakdownItem) => string
  drillHref?: (item: BreakdownItem) => string
  drillLabel?: (item: BreakdownItem) => string
  /** 棒の長さの最大値（ほかの内訳と軸をそろえる場合に渡す） */
  max?: number
  testId?: string
}) {
  const top = max ?? Math.max(...items.map((i) => i.value ?? 0), 0)
  return (
    <ul className="flex flex-col gap-1" data-testid={testId}>
      {items.map((item) => {
        const pct = item.value === null || top <= 0 ? 0 : Math.max(0, (item.value / top) * 100)
        const isSelected = selected === item.key
        const dim = selected != null && !isSelected
        const bar = (
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-ui font-medium [word-break:auto-phrase]">{item.label}</span>
              <span className="shrink-0 text-ui tabular-nums">{item.value === null ? <span className="text-muted-foreground">データなし</span> : fmt(item.value, format)}</span>
            </span>
            <span aria-hidden="true" className="block h-2 w-full rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full transition-[background-color] duration-(--duration-fast)", dim ? "bg-border-strong" : "bg-chart-1")}
                style={{ width: `${pct}%` }}
              />
            </span>
            {item.detail && <span className="text-caption text-muted-foreground tabular-nums">{item.detail}</span>}
          </span>
        )
        return (
          <li key={item.key} data-key={item.key} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            {onSelect ? (
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={selectLabel?.(item)}
                onClick={() => onSelect(item)}
                className={cn(
                  "-mx-2 flex min-w-0 flex-[1_1_16rem] cursor-pointer rounded-md px-2 py-2 text-left outline-none transition-[background-color] duration-(--duration-fast)",
                  "hover:bg-muted focus-visible:focus-ring aria-pressed:bg-accent"
                )}
              >
                {bar}
              </button>
            ) : (
              <div className="flex min-w-0 flex-[1_1_16rem] py-2">{bar}</div>
            )}
            {drillHref && (
              <DrillDownLink origin={`${testId ?? "breakdown"}:${item.key}`} href={drillHref(item)} className="text-caption">
                {drillLabel?.(item) ?? "企業を見る"}
              </DrillDownLink>
            )}
          </li>
        )
      })}
    </ul>
  )
}
