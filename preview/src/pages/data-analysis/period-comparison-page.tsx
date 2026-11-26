import { useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, chartAnimation, chartStyles, type ChartConfig } from "@/components/ui/chart"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, isBeforeDate, makeDate } from "@/lib/date"
import { alignBuckets, buildBuckets, comparisonLabels, comparisonRange, describeRange, resolvePeriod, type ComparisonMode } from "@/patterns/analysis-period"
import { compareValues, describeComparison, type ComparableValue } from "@/patterns/comparison"
import { ComparisonValue } from "@/patterns/metric"

import { mrrTrend } from "../../data/data-analysis/analysis-model"
import { ANALYSIS_TODAY, defaultAnalysisFilters, planLabels, plans, revenueIn } from "../../data/data-analysis/subscriptions"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import { ChartDetails, ComparisonTable, DiffBarChart, MrrTrendChart, fmt, manYen, ready, yenFormat } from "./analysis-parts"
import { analysisContext } from "./business-dashboard"

// Patterns / Data Analysis / Period Comparison の資料のページ。

// ---------------------------------------------------------------- 比較期間の決め方
const todays: [string, Date][] = [
  ["2026/11/25（月の途中）", makeDate(2026, 11, 25)!],
  ["2026/03/30（前月に同じ日がない）", makeDate(2026, 3, 30)!],
  ["2024/02/29（うるう日）", makeDate(2024, 2, 29)!],
  ["2026/01/10（年をまたぐ）", makeDate(2026, 1, 10)!],
]

function RangeDemo() {
  const [today, setToday] = useState(0)
  const ctx = { ...analysisContext, today: todays[today][1] }
  const periods = [
    ["今月", resolvePeriod({ kind: "relative", id: "this-month" }, ctx)],
    ["先月（月の全体）", resolvePeriod({ kind: "relative", id: "last-month" }, ctx)],
    ["過去7日間", resolvePeriod({ kind: "relative", id: "last-7-days" }, ctx)],
  ] as const
  const modes: ComparisonMode[] = ["previous-month", "previous-year", "previous-period"]
  return (
    <DemoFrame testId="pc-ranges">
      <div className="flex flex-col gap-4">
        <DemoControls legend="今日">
          {todays.map(([l], i) => (
            <Radio key={l} name="pc-today" checked={today === i} onChange={() => setToday(i)}>
              {l}
            </Radio>
          ))}
        </DemoControls>
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableCaption className="sr-only">比較期間</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>分析の対象</TableHead>
                {modes.map((m) => (
                  <TableHead key={m}>{comparisonLabels[m]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map(([label, p]) =>
                p.status !== "ready" ? null : (
                  <TableRow key={label}>
                    <TableCell className="whitespace-nowrap">
                      {label}
                      <span className="block text-caption text-muted-foreground tabular-nums">{describeRange(p.range)}</span>
                    </TableCell>
                    {modes.map((m) => {
                      const c = comparisonRange({ period: p, mode: m })
                      return (
                        <TableCell key={m} className="align-top" data-testid={`pc-range-${m}`}>
                          {c.status === "ready" && (
                            <>
                              <span className="tabular-nums">{describeRange(c.range)}</span>
                              <span className="block text-caption text-muted-foreground">
                                {c.alignment === "same-elapsed" ? "同じ経過日数" : c.alignment === "full" ? "月の全体" : `${c.days} 日間`}
                                {c.note && `。${c.note}`}
                              </span>
                            </>
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 比較できない場合
const cases: { label: string; current: ComparableValue; baseline: ComparableValue | undefined; kind?: "ratio"; reason?: string; unit: string }[] = [
  { label: "通常", current: ready(428), baseline: ready(400), unit: "社" },
  { label: "基準値が 0", current: ready(12), baseline: ready(0), unit: "件" },
  { label: "ともに 0", current: ready(0), baseline: ready(0), unit: "件" },
  { label: "基準値がマイナス", current: ready(-40_000), baseline: ready(-120_000), unit: "円" },
  { label: "赤字から黒字", current: ready(800_000), baseline: ready(-1_200_000), unit: "円" },
  { label: "割合（4.0% → 3.2%）", current: ready(0.032), baseline: ready(0.04), kind: "ratio", unit: "" },
  { label: "比較のデータがない", current: ready(18), baseline: ready(null), unit: "件" },
  { label: "比較のデータの取得に失敗", current: ready(18), baseline: { status: "unavailable" }, unit: "件" },
  { label: "集計の条件が異なる", current: ready(18), baseline: ready(15), reason: "前年は解約の定義が異なる", unit: "件" },
]

function CasesDemo() {
  return (
    <div className="max-w-full overflow-x-auto" data-testid="pc-cases">
      <Table>
        <TableCaption className="sr-only">比較値の算出の可否</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>状態</TableHead>
            <TableHead align="right">実数差</TableHead>
            <TableHead align="right">増減率</TableHead>
            <TableHead>表示</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.map((c) => {
            const r = compareValues({ current: c.current, baseline: c.baseline, kind: c.kind, incomparableReason: c.reason })
            const format = c.kind === "ratio" ? { style: "ratio" as const, maximumFractionDigits: 1, minimumFractionDigits: 1 } : { unit: c.unit }
            const rate = describeComparison(r, { format, show: "rate" })
            return (
              <TableRow key={c.label} data-case={c.label}>
                <TableCell>{c.label}</TableCell>
                <TableCell align="right" className="whitespace-nowrap tabular-nums">
                  {r.status === "ready" ? (c.kind === "ratio" ? describeComparison(r, { format, show: "points" }).text : describeComparison(r, { format, show: "difference" }).text) : "—"}
                </TableCell>
                <TableCell align="right" className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {r.status === "ready" ? (r.rate === null ? "算出できない" : rate.text) : "—"}
                </TableCell>
                <TableCell>
                  <ComparisonValue result={r} label="前期比" format={format} kind={c.kind} direction="increase" evaluationLabel="never" />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------- 比較のグラフ
const overlayConfig = {
  current: { label: "今月（11/1〜11/25）", color: "var(--chart-1)", indicator: "line" },
  baseline: { label: "前月（10/1〜10/31）", color: "var(--border-strong)", indicator: "dashed" },
} satisfies ChartConfig

function OverlayChart() {
  const p = resolvePeriod({ kind: "relative", id: "this-month" }, analysisContext)
  if (p.status !== "ready") return null
  const cur = buildBuckets({ from: p.range.from, to: makeDate(2026, 11, 30)! }, "day", analysisContext)
  const prev = buildBuckets({ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 31)! }, "day", analysisContext)
  let a = 0
  let b = 0
  // 1 日目からの累計の売上を、期間の中の位置（経過日）でそろえて重ねる。未来の日は描かない（0 にしない）。
  const rows = alignBuckets(cur, prev).map((r) => {
    const future = r.current && isBeforeDate(ANALYSIS_TODAY, r.current.from)
    if (r.current && !future) a += revenueIn(r.current, defaultAnalysisFilters) ?? 0
    if (r.baseline) b += revenueIn(r.baseline, defaultAnalysisFilters) ?? 0
    return {
      day: `${r.index + 1}日目`,
      current: r.current && !future ? a : null,
      baseline: r.baseline ? b : null,
      currentDate: r.current ? formatDate(r.current.from) : "—",
      baselineDate: r.baseline ? formatDate(r.baseline.from) : "—",
    }
  })
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="pc-overlay">
      <p id="pc-overlay-desc" className="text-caption text-muted-foreground">
        月の 1 日からの累計の売上を、経過した日でそろえて重ねる。Tooltip と表で元の日付を確かめられる。
      </p>
      <ChartContainer config={overlayConfig} aria-label="今月と前月の累計の売上" aria-describedby="pc-overlay-desc" className="aspect-auto h-64 w-full">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...chartStyles.grid} />
          <XAxis dataKey="day" {...chartStyles.axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...chartStyles.axis} width={64} tickFormatter={manYen} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
                  return r ? `${r.day}（今月 ${r.currentDate}、前月 ${r.baselineDate}）` : ""
                }}
                valueFormatter={(v) => fmt(v, yenFormat)}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="baseline" stroke="var(--color-baseline)" {...chartStyles.forecastLine} strokeDasharray="4 4" {...chartAnimation} />
          <Line dataKey="current" stroke="var(--color-current)" {...chartStyles.line} {...chartAnimation} />
        </LineChart>
      </ChartContainer>
      <ChartDetails>
        <Table density="compact">
          <TableCaption className="sr-only">今月と前月の累計の売上</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>経過日</TableHead>
              <TableHead>今月の日付</TableHead>
              <TableHead align="right">今月の累計</TableHead>
              <TableHead>前月の日付</TableHead>
              <TableHead align="right">前月の累計</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.day}>
                <TableCell>{r.day}</TableCell>
                <TableCell className="tabular-nums">{r.currentDate}</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {r.current === null ? "—" : fmt(r.current, yenFormat)}
                </TableCell>
                <TableCell className="tabular-nums">{r.baselineDate}</TableCell>
                <TableCell align="right" className="tabular-nums">
                  {r.baseline === null ? "—" : fmt(r.baseline, yenFormat)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ChartDetails>
    </div>
  )
}

const barConfig = {
  current: { label: "今月（25日間）", color: "var(--chart-1)" },
  baseline: { label: "前月の同じ 25 日間", color: "var(--border-strong)" },
} satisfies ChartConfig

function PlanComparison() {
  const cur = { from: makeDate(2026, 11, 1)!, to: ANALYSIS_TODAY }
  const base = { from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 25)! }
  const rows = plans.map((p) => {
    const f = { ...defaultAnalysisFilters, plans: [p] }
    return { key: p, label: planLabels[p], current: revenueIn(cur, f), baseline: revenueIn(base, f) }
  })
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div data-testid="pc-bars">
        <ChartContainer config={barConfig} aria-label="プラン別の売上の比較（並べた棒）" className="aspect-auto h-64 w-full">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...chartStyles.grid} />
            <XAxis dataKey="label" {...chartStyles.axis} />
            <YAxis {...chartStyles.axis} width={64} tickFormatter={manYen} domain={[0, "auto"]} />
            <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => fmt(v, yenFormat)} />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="baseline" fill="var(--color-baseline)" radius={chartStyles.barRadius} {...chartAnimation} />
            <Bar dataKey="current" fill="var(--color-current)" radius={chartStyles.barRadius} {...chartAnimation} />
          </BarChart>
        </ChartContainer>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-ui font-medium">増減の差（正と負の値）</p>
        <DiffBarChart items={rows.map((r) => ({ key: r.key, label: r.label, value: r.current !== null && r.baseline !== null ? r.current - r.baseline : null }))} format={yenFormat} title="プラン別の売上の増減" testId="pc-diff" />
      </div>
      <ComparisonTable
        testId="pc-table"
        caption="プラン別の売上の比較"
        currentLabel="今月（11/1〜11/25）"
        baselineLabel="前月（10/1〜10/25）"
        notation="compact"
        rows={rows.map((r) => ({ key: r.key, label: r.label, current: r.current, baseline: r.baseline, format: yenFormat, direction: "increase" }))}
      />
    </div>
  )
}

function ForecastDemo() {
  const [forecast, setForecast] = useState(true)
  const t = mrrTrend({ filters: defaultAnalysisFilters, withForecast: forecast })
  return (
    <DemoFrame testId="pc-forecast">
      <div className="flex flex-col gap-4">
        <DemoControls legend="予測のデータ">
          <Radio name="pc-forecast" checked={forecast} onChange={() => setForecast(true)}>
            ある（製品が算出）
          </Radio>
          <Radio name="pc-forecast" checked={!forecast} onChange={() => setForecast(false)}>
            ない
          </Radio>
        </DemoControls>
        <MrrTrendChart rows={t.rows} forecastBasis={t.forecastBasis} height="h-72" />
        {forecast && (
          <p className="text-caption text-muted-foreground">
            予測の基準日：{formatDate(ANALYSIS_TODAY)}。算出の方法：直近 6 か月の月末の MRR の増加の平均を加える（架空の例）。範囲は月ごとに ±1.5% ずつ広げた値。
          </p>
        )}
      </div>
    </DemoFrame>
  )
}

// 比較の見本の数値も、同じ記録から求める
const mtd = revenueIn({ from: makeDate(2026, 11, 1)!, to: ANALYSIS_TODAY }, defaultAnalysisFilters)!
const prevFull = revenueIn({ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 31)! }, defaultAnalysisFilters)!
const prevSame = revenueIn({ from: makeDate(2026, 10, 1)!, to: makeDate(2026, 10, 25)! }, defaultAnalysisFilters)!
const signedPct = (a: number, b: number) => describeComparison(compareValues({ current: ready(a), baseline: ready(b) }), { show: "rate" }).text

export function PeriodComparisonPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Analysis"
        name="Period Comparison"
        lead="何が変化したかを、公平な期間どうしで比べて示す。途中の期間は同じ経過の期間と比べ、比較できない場合は理由を示す。実数差、増減率、パーセントポイント差を区別する。"
      />

      <Section title="比較期間の決め方" lead="途中の期間（今月の 25 日間）は、前月の同じ 25 日間と比べる。比較先に同じ日がない場合（3/30 の前月、2/29 の前年）は月末に合わせ、そのことを示す。月の全体どうしは、日数が異なっても月の全体で比べる。">
        <RangeDemo />
      </Section>

      <Section title="比較値の算出の可否" lead="基準値が 0 の場合は増減率を算出できない。基準値がマイナスの場合は実数差を示す。NaN や Infinity を表示しない。割合どうしの差は pt で示す。">
        <CasesDemo />
      </Section>

      <Section title="比較のグラフ" lead="現在の実績は主要な色の実線、過去の実績は Neutral の破線。色だけで系列を区別せず、凡例と線の種類を併用する。棒グラフは 0 から始める。">
        <div className="flex flex-col gap-12">
          <OverlayChart />
          <PlanComparison />
        </div>
      </Section>

      <Section title="確定した実績、途中経過、予測" lead="確定した実績は実線、途中経過は点線と白抜きの点、予測は別の色の破線と範囲で示す。予測のデータがない場合は、未来を補完しない。予測の算出は製品の責務。">
        <ForecastDemo />
      </Section>

      <Section title="判断基準">
        <Rules
          rows={[
            ["比較の対象", "前日・前週、前月・前四半期、前年同期、直前の同じ長さの期間、目標・予算、期間の指定、比較なし。分析の目的に必要なものだけを示す"],
            ["期間の途中の累積", "売上や新規の契約などは、過去の同じ経過の期間と比べる。月の途中の実績を前月の全体と比べて、悪化と評価しない"],
            ["時点の指標", "MRR、契約企業数などは、比較の基準の時点（10/25時点）を示す"],
            ["割合と平均", "母集団、分母、集計の方法をそろえる。割合の内部の値は 0〜1 に統一する（API で 0〜100 と混在させない）"],
            ["表示", "主に示す値を 1 つにする。実数差と増減率の両方を示すのは、判断に役立つ場合だけ。計算は丸める前の値で行う"],
            ["グラフの軸", "比べるグラフを並べる場合は、軸の範囲と単位をそろえる。重ねる場合は、元の日付を Tooltip と表で確かめられるようにする"],
            ["目標との比較", "過去の実績との比較と、目標の達成率を区別する。両方が必要な場合だけ並べる。小さい方が望ましい指標は上限として示す"],
            ["Waterfall Chart", "期首から期末への増減の内訳（新規、増額、減額、解約）を順に積み上げる場合に有効。汎用の部品にはせず、この段階では内訳の増減差のグラフと数値の表で示す（検証画面の「MRR の増減の内訳」）。製品が作る場合は、棒の始点を前の棒の終点にそろえ、合計の棒を区別し、数値の表を併記する"],
            ["操作の位置", "ページ全体の比較は期間の近く。表やグラフだけの比較は、その見出しの右。モバイルでも比較の対象と変更の操作を残す"],
          ]}
        />
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "比較値は「+7.0%（増加、改善）」のように、向きと評価を文で読み上げる。",
            "比較のグラフは、凡例の文字と線の種類で系列を区別し、数値の表を併記する。",
            "比較できない場合は、記号ではなく理由の文（「比較データなし」「比較できません（前年は解約の定義が異なる）」）で示す。",
          ]}
        />
        <div className="mt-6">
          <AppLink href="#/analysis-app?page=business">検証画面（事業の状況）で確かめる</AppLink>
        </div>
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="月の途中の売上を前月の全体と比べて、悪化と表示した例">
              <span className="text-caption text-muted-foreground">今月の売上（25日間）</span>
              <span className="text-heading">{fmt(mtd, yenFormat)}</span>
              <span className="text-caption text-destructive">
                ↘ {signedPct(mtd, prevFull)}（前月 {fmt(prevFull, yenFormat)}）
              </span>
            </Mock>
          }
          badNote="経過した日数が違うため、売上が減ったように見える。"
          good={
            <Mock label="月の途中の売上を前月の同じ 25 日間と比べた例">
              <span className="text-caption text-muted-foreground">今月の売上（25日間）</span>
              <span className="text-heading">{fmt(mtd, yenFormat)}</span>
              <span className="text-caption text-success">
                ↗ {signedPct(mtd, prevSame)}（前月の同じ 25 日間 {fmt(prevSame, yenFormat)}）
              </span>
            </Mock>
          }
          goodNote="同じ経過の期間で比べ、比較の対象を文字で示す。"
        />
      </Section>
    </article>
  )
}
