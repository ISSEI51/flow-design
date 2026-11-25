import { useState, type CSSProperties } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, chartAnimation, chartStyles, type ChartConfig } from "@/components/ui/chart"

import { monthlyRevenue, newContractsByRegion } from "../../data/data-display/metrics"
import { PageHeader } from "../../layout/page-header"
import { Compare, Section } from "../../layout/section"
import {
  ChangeBarChart,
  EmptyChart,
  InvalidCompositionChart,
  ZeroAndMissingBarChart,
  PlanDonutChart,
  RegionBarChart,
  RevenueLineChart,
  SeatsFeeScatterChart,
  StatusStackedBarChart,
  UsersAreaChart,
  UsersLineChart,
} from "./charts"

// 製品がグラフの色を変える例。--chart-* を、グラフを囲む要素で上書きする。
// 上書きした製品は、scripts/tokens/check-contrast.mjs で背景とのコントラストと系列の区別を確かめる（docs/web/tokens.md）。
const palettes = [
  { id: "default", name: "標準（chart-1〜5）", vars: {} },
  { id: "brand", name: "chart-1 をブランドの色に", vars: { "--chart-1": "var(--primary)" } },
  { id: "gray", name: "グレースケールで確認", vars: { filter: "grayscale(1)" } },
] as const

const bars = newContractsByRegion.slice(0, 5)
const barConfig = { count: { label: "新規契約", color: "var(--chart-1)" } } satisfies ChartConfig
const lineConfig = { actual: { label: "実績", color: "var(--chart-1)" } } satisfies ChartConfig
const rainbow = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

function MiniBar({ truncated, colorful, gradient, highlight, label }: { truncated?: boolean; colorful?: boolean; gradient?: boolean; highlight?: string; label: string }) {
  return (
    <ChartContainer config={barConfig} aria-label={label} className="aspect-auto h-44 w-full">
      <BarChart data={bars} margin={{ left: 0, right: 8 }}>
        {gradient && (
          <defs>
            <linearGradient id="fd-bad-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" />
              <stop offset="100%" stopColor="var(--chart-4)" />
            </linearGradient>
          </defs>
        )}
        <CartesianGrid {...chartStyles.grid} />
        <XAxis dataKey="region" {...chartStyles.axis} interval={0} />
        <YAxis
          {...chartStyles.axis}
          width={40}
          domain={truncated ? [10, 100] : [0, 100]}
          ticks={truncated ? [10, 40, 70, 100] : [0, 25, 50, 75, 100]}
          allowDataOverflow
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v) => `${v}件`} />} />
        <Bar dataKey="count" fill={gradient ? "url(#fd-bad-gradient)" : "var(--color-count)"} radius={[4, 4, 0, 0]} {...chartAnimation}>
          {colorful && bars.map((b, i) => <Cell key={b.region} fill={rainbow[i]} />)}
          {highlight && bars.map((b) => <Cell key={b.region} fill={b.region === highlight ? "var(--primary)" : "var(--border-strong)"} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

function MiniLine({ zeroFilled, label }: { zeroFilled?: boolean; label: string }) {
  const data = monthlyRevenue.slice(2, 10).map((d) => ({ month: d.month.slice(5) + "月", actual: zeroFilled ? (d.actual ?? 0) : d.actual }))
  return (
    <ChartContainer config={lineConfig} aria-label={label} className="aspect-auto h-44 w-full">
      <LineChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid {...chartStyles.grid} />
        <XAxis dataKey="month" {...chartStyles.axis} />
        <YAxis {...chartStyles.axis} width={48} domain={zeroFilled ? [0, "auto"] : [1600, 2600]} tickFormatter={(v: number) => v.toLocaleString("ja-JP")} />
        <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => `${v.toLocaleString("ja-JP")}万円`} />} />
        <Line dataKey="actual" stroke="var(--color-actual)" connectNulls={false} {...chartStyles.line} {...chartAnimation} />
      </LineChart>
    </ChartContainer>
  )
}

export function ChartPage() {
  const [palette, setPalette] = useState<(typeof palettes)[number]["id"]>("default")
  const vars = palettes.find((p) => p.id === palette)!.vars as CSSProperties
  return (
    <article>
      <PageHeader
        name="Chart"
        lead="データの量、推移、構成、関係を、誤解なく理解できるように示す。グラフの種類は目的から選び、装飾よりも正確な読み取りを優先する。"
      />

      <Section
        title="6 種類のグラフ"
        lead="押すか、グラフにフォーカスして ← → キーで、各点の数値を表示する。数値はグラフの下の表でも確認できる。"
      >
        <fieldset className="mb-10 flex flex-wrap items-center gap-4 text-ui">
          <legend className="sr-only">グラフの色</legend>
          <span aria-hidden="true" className="text-muted-foreground">
            グラフの色
          </span>
          {palettes.map((p) => (
            <label key={p.id} className="flex min-h-10 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="chart-palette"
                value={p.id}
                checked={palette === p.id}
                onChange={() => setPalette(p.id)}
                className="size-4 accent-[var(--primary)]"
                data-testid={`chart-palette-${p.id}`}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        <div style={vars} data-testid="chart-gallery" className="grid gap-16">
          <RevenueLineChart />
          <UsersLineChart />
          <RegionBarChart />
          <RegionBarChart highlight="関東" testId="chart-bar-highlight" />
          <ChangeBarChart />
          <UsersAreaChart />
          <PlanDonutChart />
          <StatusStackedBarChart />
          <SeatsFeeScatterChart />
        </div>
      </Section>

      <Section title="データの扱い" lead="0 と欠損、空のデータ、構成比に使えない値を、グラフの見た目だけに任せずに示す。">
        <div className="grid gap-16">
          <ZeroAndMissingBarChart />
          <EmptyChart />
          <InvalidCompositionChart />
          <details data-testid="chart-hidden" className="group">
            <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-sm text-ui font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring pointer-coarse:min-h-12">
              非表示の領域にあるグラフを開く
            </summary>
            <div className="mt-6">
              <RevenueLineChart testId="chart-hidden-line" headingLevel={4} />
            </div>
          </details>
        </div>
      </Section>

      <Section title="誤解を生まない表現" lead="同じデータでも、軸、色、欠損の扱いで受け取られ方が変わる。">
        <Compare
          bad={<MiniBar truncated label="避ける例：数値の軸を 10 から始めた棒グラフ" />}
          badNote="棒の軸を 10 から始める。北海道と東北の差が実際より大きく見える"
          good={<MiniBar label="使う例：数値の軸を 0 から始めた棒グラフ" />}
          goodNote="棒の長さが値に比例する。軸は 0 から始める"
        />
        <Compare
          bad={<MiniBar colorful label="避ける例：棒ごとに色を変えた棒グラフ" />}
          badNote="意味のない色分け。色に意味を探させ、凡例もない"
          good={<MiniBar highlight="関東" label="使う例：関東だけを強調した棒グラフ" />}
          goodNote="1 色を基本にし、比べたい項目だけを強調する"
        />
        <Compare
          bad={<MiniLine zeroFilled label="避ける例：欠損を 0 にした折れ線グラフ" />}
          badNote="集計できなかった 6 月を 0 にする。売上が急に落ちたように見える"
          good={<MiniLine label="使う例：欠損で線を途切れさせた折れ線グラフ" />}
          goodNote="欠損は線を途切れさせ、説明に理由を書く"
        />
        <Compare
          bad={<MiniBar gradient label="避ける例：装飾のグラデーションを付けた棒グラフ" />}
          badNote="装飾のグラデーション。色の変化が値の変化のように見える"
          good={<MiniBar label="使う例：単色の棒グラフ" />}
          goodNote="単色の面。値の違いは長さだけで示す"
        />
      </Section>
    </article>
  )
}
