import { useEffect, useId, useState, type ReactNode } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"

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
  type ChartDataColumn,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

import { customers } from "../../data/data-display/customers"
import {
  contractChangeByRegion,
  contractsByPlan,
  monthlyRevenue,
  newContractsByRegion,
  statusByQuarter,
  usersByPlan,
} from "../../data/data-display/metrics"

// グラフの例。グラフの種類ごとに Recharts の部品を組み立てる。Chart の Variant は使わない。
// 各グラフは、目的がわかる見出し、単位・期間・対象の説明、同じ数値の表を持つ。

// 狭い画面では、項目名の長い棒グラフを横向きにし、項目名を縦軸に並べる（文字を重ねない、省かない）。
function useNarrow() {
  const query = "(max-width: 39.99rem)"
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return narrow
}

const man = (v: number) => `${v.toLocaleString("ja-JP")}万円`
const ken = (v: number) => `${v.toLocaleString("ja-JP")}件`
const nin = (v: number) => `${v.toLocaleString("ja-JP")}人`

// グラフの見出し、説明、本体、数値の表をまとめる。表は <details> で開閉し、Tooltip を使えない人も数値を確認できる。
export function ChartFigure<T extends Record<string, unknown>>({
  title,
  description,
  children,
  data,
  columns,
  testId,
  className,
  headingLevel = 3,
}: {
  title: string
  description: ReactNode
  children: (ids: { titleId: string; descId: string }) => ReactNode
  data?: readonly T[]
  columns?: readonly ChartDataColumn<T>[]
  testId?: string
  className?: string
  headingLevel?: 3 | 4
}) {
  const id = useId()
  const titleId = `${id}-title`
  const descId = `${id}-desc`
  const H = headingLevel === 3 ? "h3" : "h4"
  return (
    <div data-testid={testId} className={cn("min-w-0", className)}>
      <H id={titleId} className="text-heading">
        {title}
      </H>
      <p id={descId} className="mt-1 text-ui text-muted-foreground">
        {description}
      </p>
      <div className="mt-6">{children({ titleId, descId })}</div>
      {data && columns && (
        <details className="group mt-4">
          <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-sm text-ui font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring pointer-coarse:min-h-12">
            数値を表で見る
          </summary>
          <div className="mt-2">
            <ChartDataTable data={data} columns={columns} caption={title} />
          </div>
        </details>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Line
const revenueConfig = {
  actual: { label: "実績", color: "var(--chart-1)", indicator: "line" },
  forecast: { label: "予測", color: "var(--chart-1)", indicator: "dashed" },
} satisfies ChartConfig

export function RevenueLineChart({ testId = "chart-line", headingLevel }: { testId?: string; headingLevel?: 3 | 4 }) {
  return (
    <ChartFigure
      testId={testId}
      headingLevel={headingLevel}
      title="月次売上"
      description="単位：万円。2025 年 12 月〜2026 年 11 月の実績と、2027 年 2 月までの予測（破線）。2026 年 6 月は集計できなかったため線を途切れさせている。"
      data={monthlyRevenue}
      columns={[
        { key: "month", label: "月" },
        { key: "actual", label: "実績（万円）", numeric: true },
        { key: "forecast", label: "予測（万円）", numeric: true, format: (v, row) => (row.actual !== null ? "—" : (v as number).toLocaleString("ja-JP")) },
      ]}
    >
      {({ titleId, descId }) => (
        <ChartContainer config={revenueConfig} aria-labelledby={titleId} aria-describedby={descId} className="aspect-auto h-64 w-full">
          <LineChart data={monthlyRevenue} margin={{ left: 8, right: 8 }}>
            <CartesianGrid {...chartStyles.grid} />
            <XAxis dataKey="month" {...chartStyles.axis} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...chartStyles.axis} width={56} tickFormatter={(v: number) => v.toLocaleString("ja-JP")} domain={[1600, 2800]} />
            <ChartTooltip content={<ChartTooltipContent valueFormatter={man} />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line dataKey="actual" type="linear" stroke="var(--color-actual)" connectNulls={false} {...chartStyles.line} {...chartAnimation} />
            <Line dataKey="forecast" type="linear" stroke="var(--color-forecast)" {...chartStyles.forecastLine} {...chartAnimation} />
          </LineChart>
        </ChartContainer>
      )}
    </ChartFigure>
  )
}

const usersConfig = {
  basic: { label: "ベーシック", color: "var(--chart-1)", indicator: "line" },
  standard: { label: "スタンダード", color: "var(--chart-2)", indicator: "dashed" },
  enterprise: { label: "エンタープライズ", color: "var(--chart-3)", indicator: "line" },
} satisfies ChartConfig

export function UsersLineChart() {
  return (
    <ChartFigure
      testId="chart-line-multi"
      title="プラン別の利用者数"
      description="単位：人。2026 年 6 月〜11 月の月末時点。系列は色に加えて線の種類と凡例で区別する。"
      data={usersByPlan}
      columns={[
        { key: "month", label: "月" },
        { key: "basic", label: "ベーシック（人）", numeric: true },
        { key: "standard", label: "スタンダード（人）", numeric: true },
        { key: "enterprise", label: "エンタープライズ（人）", numeric: true },
      ]}
    >
      {({ titleId, descId }) => (
        <ChartContainer config={usersConfig} aria-labelledby={titleId} aria-describedby={descId} className="aspect-auto h-64 w-full">
          <LineChart data={usersByPlan} margin={{ left: 8, right: 8 }}>
            <CartesianGrid {...chartStyles.grid} />
            <XAxis dataKey="month" {...chartStyles.axis} />
            <YAxis {...chartStyles.axis} width={56} tickFormatter={(v: number) => v.toLocaleString("ja-JP")} />
            <ChartTooltip content={<ChartTooltipContent valueFormatter={nin} />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line dataKey="basic" stroke="var(--color-basic)" {...chartStyles.line} {...chartAnimation} />
            <Line dataKey="standard" stroke="var(--color-standard)" {...chartStyles.line} strokeDasharray="6 4" {...chartAnimation} />
            <Line dataKey="enterprise" stroke="var(--color-enterprise)" {...chartStyles.line} dot={{ r: 3 }} {...chartAnimation} />
          </LineChart>
        </ChartContainer>
      )}
    </ChartFigure>
  )
}

// ---------------------------------------------------------------- Bar
const regionConfig = { count: { label: "新規契約", color: "var(--chart-1)" } } satisfies ChartConfig

export function RegionBarChart({
  highlight,
  testId = "chart-bar",
  headingLevel,
}: {
  /** 強調する地域。指定すると、それ以外をニュートラルの色にする */
  highlight?: string
  testId?: string
  headingLevel?: 3 | 4
}) {
  const narrow = useNarrow()
  return (
    <ChartFigure
      testId={testId}
      headingLevel={headingLevel}
      title={highlight ? `地域別の新規契約数（${highlight}を強調）` : "地域別の新規契約数"}
      description={
        highlight
          ? `単位：件。2026 年 10 月。比べたい${highlight}だけをブランドの色にし、ほかはニュートラルの色にする。`
          : "単位：件。2026 年 10 月。単一の系列は 1 色で表す。数値の軸は 0 から始める。"
      }
      data={newContractsByRegion}
      columns={[
        { key: "region", label: "地域" },
        { key: "count", label: "新規契約（件）", numeric: true },
      ]}
    >
      {({ titleId, descId }) => (
        <ChartContainer
          config={regionConfig}
          aria-labelledby={titleId}
          aria-describedby={descId}
          className={narrow ? "aspect-auto h-80 w-full" : "aspect-auto h-64 w-full"}
        >
          <BarChart data={newContractsByRegion} layout={narrow ? "vertical" : "horizontal"} margin={{ left: 8, right: 8 }}>
            <CartesianGrid {...(narrow ? { horizontal: false } : chartStyles.grid)} />
            {narrow ? (
              <>
                <XAxis type="number" {...chartStyles.axis} domain={[0, "auto"]} allowDecimals={false} />
                <YAxis type="category" dataKey="region" {...chartStyles.axis} width={72} interval={0} />
              </>
            ) : (
              <>
                <XAxis dataKey="region" {...chartStyles.axis} interval={0} />
                <YAxis {...chartStyles.axis} width={40} domain={[0, "auto"]} allowDecimals={false} />
              </>
            )}
            <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={ken} hideIndicator={!!highlight} />} />
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={narrow ? [0, chartStyles.barRadius, chartStyles.barRadius, 0] : [chartStyles.barRadius, chartStyles.barRadius, 0, 0]}
              {...chartAnimation}
            >
              {highlight &&
                newContractsByRegion.map((d) => (
                  <Cell key={d.region} fill={d.region === highlight ? "var(--primary)" : "var(--border-strong)"} />
                ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartFigure>
  )
}

const changeConfig = { change: { label: "前年同月比", color: "var(--chart-3)" } } satisfies ChartConfig

export function ChangeBarChart() {
  const narrow = useNarrow()
  return (
    <ChartFigure
      testId="chart-bar-negative"
      title="地域別の新規契約数の増減"
      description="単位：件。2026 年 10 月と前年同月の差。負の値は 0 の線より下に伸ばす。増減の向きは位置で示し、色を変えない。"
      data={contractChangeByRegion}
      columns={[
        { key: "region", label: "地域" },
        { key: "change", label: "増減（件）", numeric: true, format: (v) => ((v as number) > 0 ? `+${v}` : (v as number) < 0 ? `−${Math.abs(v as number)}` : "0") },
      ]}
    >
      {({ titleId, descId }) => (
        <ChartContainer
          config={changeConfig}
          aria-labelledby={titleId}
          aria-describedby={descId}
          className={narrow ? "aspect-auto h-80 w-full" : "aspect-auto h-64 w-full"}
        >
          <BarChart data={contractChangeByRegion} layout={narrow ? "vertical" : "horizontal"} margin={{ left: 8, right: 8 }}>
            <CartesianGrid {...(narrow ? { horizontal: false } : chartStyles.grid)} />
            {narrow ? (
              <>
                <XAxis type="number" {...chartStyles.axis} domain={[-10, 25]} ticks={[-10, 0, 10, 20]} />
                <YAxis type="category" dataKey="region" {...chartStyles.axis} width={72} interval={0} />
                <ReferenceLine x={0} stroke="var(--border-strong)" />
              </>
            ) : (
              <>
                <XAxis dataKey="region" {...chartStyles.axis} interval={0} />
                <YAxis {...chartStyles.axis} width={40} domain={[-10, 25]} ticks={[-10, 0, 10, 20]} />
                <ReferenceLine y={0} stroke="var(--border-strong)" />
              </>
            )}
            <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v) => (v > 0 ? `+${v}件` : `${v}件`)} />} />
            <Bar dataKey="change" fill="var(--color-change)" radius={chartStyles.barRadius} {...chartAnimation} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartFigure>
  )
}

// ---------------------------------------------------------------- Area
const areaConfig = { total: { label: "利用者数", color: "var(--chart-2)" } } satisfies ChartConfig
const totalUsers = usersByPlan.map((d) => ({ month: d.month, total: d.basic + d.standard + d.enterprise }))

export function UsersAreaChart() {
  return (
    <ChartFigure
      testId="chart-area"
      title="利用者数の合計"
      description="単位：人。2026 年 6 月〜11 月の月末時点。量の推移を面で示す。面の数値の軸は 0 から始める。"
      data={totalUsers}
      columns={[
        { key: "month", label: "月" },
        { key: "total", label: "利用者数（人）", numeric: true },
      ]}
    >
      {({ titleId, descId }) => (
        <ChartContainer config={areaConfig} aria-labelledby={titleId} aria-describedby={descId} className="aspect-auto h-64 w-full">
          <AreaChart data={totalUsers} margin={{ left: 8, right: 8 }}>
            <CartesianGrid {...chartStyles.grid} />
            <XAxis dataKey="month" {...chartStyles.axis} />
            <YAxis {...chartStyles.axis} width={56} domain={[0, "auto"]} tickFormatter={(v: number) => v.toLocaleString("ja-JP")} />
            <ChartTooltip content={<ChartTooltipContent valueFormatter={nin} indicator="line" />} />
            {/* グラデーションは使わず、同じ色の透明度だけで面を示す。 */}
            <Area dataKey="total" type="linear" stroke="var(--color-total)" fill="var(--color-total)" fillOpacity={0.16} {...chartStyles.line} {...chartAnimation} />
          </AreaChart>
        </ChartContainer>
      )}
    </ChartFigure>
  )
}

// ---------------------------------------------------------------- Donut
const planConfig = {
  basic: { label: "ベーシック", color: "var(--chart-1)" },
  standard: { label: "スタンダード", color: "var(--chart-2)" },
  enterprise: { label: "エンタープライズ", color: "var(--chart-3)" },
} satisfies ChartConfig
const planTotal = contractsByPlan.reduce((s, d) => s + d.count, 0)
const planData = contractsByPlan.map((d) => ({ ...d, fill: `var(--color-${d.plan})`, share: Math.round((d.count / planTotal) * 1000) / 10 }))

export function PlanDonutChart({ headingLevel }: { headingLevel?: 3 | 4 }) {
  return (
    <ChartFigure
      testId="chart-donut"
      headingLevel={headingLevel}
      title="プラン別の契約数の構成比"
      description={`2026 年 11 月末の全契約 ${planTotal}件に対する割合。凡例に件数と割合を示す。`}
      data={planData}
      columns={[
        { key: "label", label: "プラン" },
        { key: "count", label: "契約数（件）", numeric: true },
        { key: "share", label: "割合（%）", numeric: true, format: (v) => `${(v as number).toFixed(1)}%` },
      ]}
    >
      {({ titleId, descId }) => (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <ChartContainer config={planConfig} aria-labelledby={titleId} aria-describedby={descId} className="aspect-square w-full max-w-56">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="plan" valueFormatter={ken} />} />
              <Pie data={planData} dataKey="count" nameKey="plan" innerRadius="62%" outerRadius="100%" strokeWidth={2} {...chartAnimation}>
                <Label
                  content={({ viewBox }) => {
                    const vb = viewBox as { cx?: number; cy?: number }
                    if (vb?.cx == null || vb.cy == null) return null
                    return (
                      <text x={vb.cx} y={vb.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={vb.cx} y={vb.cy - 8} className="fill-foreground text-heading font-semibold tabular-nums">
                          {planTotal}
                        </tspan>
                        <tspan x={vb.cx} y={vb.cy + 14} className="fill-muted-foreground text-caption">
                          件
                        </tspan>
                      </text>
                    )
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="grid w-full max-w-64 gap-3 text-ui" aria-label="凡例">
            {planData.map((d) => (
              <li key={d.plan} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px]" style={{ background: `var(--chart-${d.plan === "basic" ? 1 : d.plan === "standard" ? 2 : 3})` }} />
                <span className="flex-1">{d.label}</span>
                <span className="tabular-nums">{d.count}件</span>
                <span className="w-14 text-right text-muted-foreground tabular-nums">{d.share.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartFigure>
  )
}

// ---------------------------------------------------------------- Stacked Bar
const stackConfig = {
  active: { label: "契約中", color: "var(--chart-1)" },
  trial: { label: "試用中", color: "var(--chart-2)" },
  paused: { label: "休止中", color: "var(--chart-3)" },
} satisfies ChartConfig

export function StatusStackedBarChart() {
  return (
    <ChartFigure
      testId="chart-stacked"
      title="四半期ごとの契約状況の内訳"
      description="単位：件。四半期の末日時点。2026 年 4Q は 11 月末時点の途中集計で、確定値ではない（軸のラベルに「途中」と示す）。"
      data={statusByQuarter}
      columns={[
        { key: "quarter", label: "四半期", format: (v, row) => `${v}${row.provisional ? "（途中集計）" : ""}` },
        { key: "active", label: "契約中（件）", numeric: true },
        { key: "trial", label: "試用中（件）", numeric: true },
        { key: "paused", label: "休止中（件）", numeric: true },
      ]}
    >
      {({ titleId, descId }) => (
        <ChartContainer config={stackConfig} aria-labelledby={titleId} aria-describedby={descId} className="aspect-auto h-64 w-full">
          <BarChart data={statusByQuarter} margin={{ left: 8, right: 8 }}>
            <CartesianGrid {...chartStyles.grid} />
            <XAxis
              dataKey="quarter"
              {...chartStyles.axis}
              tickFormatter={(v: string) => (statusByQuarter.find((q) => q.quarter === v)?.provisional ? `${v}（途中）` : v)}
            />
            <YAxis {...chartStyles.axis} width={40} domain={[0, "auto"]} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={ken} />} />
            <ChartLegend content={<ChartLegendContent />} />
            {/* 系列の間に背景色の細い線を入れ、隣り合う色の境目を色だけに頼らずに示す。 */}
            {/* 途中集計の四半期は、すべての系列を淡くして確定値と区別する（軸のラベルにも「途中」と示す）。 */}
            {(["active", "trial", "paused"] as const).map((key, i, all) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="s"
                fill={`var(--color-${key})`}
                stroke="var(--background)"
                strokeWidth={1}
                radius={i === all.length - 1 ? [chartStyles.barRadius, chartStyles.barRadius, 0, 0] : 0}
                {...chartAnimation}
              >
                {statusByQuarter.map((q) => (
                  <Cell key={q.quarter} fillOpacity={q.provisional ? 0.55 : 1} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ChartContainer>
      )}
    </ChartFigure>
  )
}

// ---------------------------------------------------------------- Scatter
const scatterConfig = { customer: { label: "顧客", color: "var(--chart-3)" } } satisfies ChartConfig
const scatterData = customers
  .filter((c) => c.status === "active" && c.monthlyFee)
  .slice(0, 120)
  .map((c) => ({ company: c.company, seats: c.seats, fee: Math.round((c.monthlyFee ?? 0) / 1000) / 10 }))

export function SeatsFeeScatterChart() {
  return (
    <ChartFigure
      testId="chart-scatter"
      title="利用者数と月額の関係"
      description="契約中の顧客 120 社。横軸は利用者数（人）、縦軸は月額（万円）。月額が未設定の顧客は含めない。"
      data={scatterData.slice(0, 20)}
      columns={[
        { key: "company", label: "会社名（先頭 20 社）" },
        { key: "seats", label: "利用者数（人）", numeric: true },
        { key: "fee", label: "月額（万円）", numeric: true },
      ]}
    >
      {({ titleId, descId }) => (
        <ChartContainer config={scatterConfig} aria-labelledby={titleId} aria-describedby={descId} className="aspect-auto h-72 w-full">
          <ScatterChart margin={{ left: 8, right: 8, bottom: 16 }}>
            <CartesianGrid {...chartStyles.grid} />
            <XAxis type="number" dataKey="seats" name="利用者数" unit="人" {...chartStyles.axis} domain={[0, "auto"]}>
              <Label value="利用者数（人）" position="insideBottom" offset={-12} className="text-caption" />
            </XAxis>
            <YAxis type="number" dataKey="fee" name="月額" unit="万円" {...chartStyles.axis} width={64} domain={[0, "auto"]} />
            <ZAxis range={[36, 36]} />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelKey="company"
                  formatter={(value, name, item) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{name}</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {Number(value).toLocaleString("ja-JP")}
                        {item.unit}
                      </span>
                    </div>
                  )}
                  labelFormatter={(_, payload) => (payload?.[0]?.payload as { company?: string })?.company}
                />
              }
            />
            <Scatter data={scatterData} fill="var(--color-customer)" fillOpacity={0.7} {...chartAnimation} />
          </ScatterChart>
        </ChartContainer>
      )}
    </ChartFigure>
  )
}
