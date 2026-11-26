import { useState } from "react"

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { compareValues, describeComparison } from "@/patterns/comparison"
import type { Loadable } from "@/patterns/data-states"
import { ComparisonValue, Metric, MetricDefinition, MetricGroup, MetricTarget, Sparkline } from "@/patterns/metric"
import { formatMetricValue, type MetricFormat } from "@/patterns/metric-format"

import { overviewData } from "../../data/data-analysis/analysis-model"
import { ANALYSIS_TODAY, defaultAnalysisFilters } from "../../data/data-analysis/subscriptions"
import { fullPeriodOf, comparisonRange, resolvePeriod, getPeriodElapsed } from "@/patterns/analysis-period"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import { analysisContext } from "./business-dashboard"
import { countFormat, fmt, ratioFormat, ready, yenFormat } from "./analysis-parts"

// Patterns / Data Analysis / Metric Overview の資料のページ。数値はすべて架空の記録（data-analysis/subscriptions.ts）から集計する。

const period = resolvePeriod({ kind: "relative", id: "this-month" }, analysisContext) as Extract<ReturnType<typeof resolvePeriod>, { status: "ready" }>
const comparison = comparisonRange({ period, mode: "previous-month" })
const full = fullPeriodOf(period, analysisContext)!
const o = overviewData({ period, full, comparison, filters: defaultAnalysisFilters })

// ---------------------------------------------------------------- 重要度と文字の大きさ
function HierarchyDemo() {
  return (
    <DemoFrame testId="mo-hierarchy">
      <MetricGroup minItemWidth="14rem" className="gap-y-12">
        <Metric
          className="col-span-full"
          size="hero"
          label="MRR（月額の契約金額）"
          value={ready(o.mrr.current)}
          format={yenFormat}
          status={{ kind: "partial", text: "2026/11/25時点" }}
          comparison={<ComparisonValue result={compareValues({ current: ready(o.mrr.current), baseline: ready(o.mrr.baseline) })} label="前月比" baseline={`2026/10/25時点 ${fmt(o.mrr.baseline, yenFormat)}`} direction="increase" format={yenFormat} />}
          sparkline={<Sparkline data={o.mrrSpark} label={`過去 12 か月の月末の MRR は ${fmt(o.mrrSpark[0], yenFormat)}から ${fmt(o.mrrSpark[11], yenFormat)}に変化`} />}
          definition={
            <MetricDefinition label="MRR">
              <p>その日に有効な契約の月額の合計（税抜き）。初期費用と従量の料金を含めない。</p>
              <p className="tabular-nums">正確な値：{formatMetricValue(o.mrr.current, { ...yenFormat, notation: "standard" })?.text}</p>
            </MetricDefinition>
          }
        />
        <Metric size="primary" label="契約企業数" value={ready(o.accounts.current)} format={countFormat("社")} />
        <Metric size="secondary" label="新規の契約（今月）" value={ready(o.newAccounts.current)} format={countFormat("件")} />
        <Metric size="compact" label="粗利率" value={ready(o.grossMargin.current)} format={ratioFormat} />
      </MetricGroup>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 数値の表記
const samples: [string, number, MetricFormat][] = [
  ["売上", 36_800_000, { unit: "円" }],
  ["年間の契約金額", 441_600_000, { unit: "円" }],
  ["処理件数", 5_120_374, { unit: "件" }],
  ["解約率（0〜1 の値 0.032）", 0.032, { style: "ratio" }],
  ["契約企業数", 428, { unit: "社" }],
  ["営業利益（赤字）", -1_234_000, { unit: "円" }],
]

function FormatDemo() {
  const [locale, setLocale] = useState<"ja-JP" | "en-US">("ja-JP")
  const [notation, setNotation] = useState<"auto" | "standard">("auto")
  return (
    <DemoFrame testId="mo-format">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <DemoControls legend="ロケール">
            <Radio name="mo-locale" checked={locale === "ja-JP"} onChange={() => setLocale("ja-JP")}>
              日本語（ja-JP、円）
            </Radio>
            <Radio name="mo-locale" checked={locale === "en-US"} onChange={() => setLocale("en-US")}>
              英語（en-US、USD）
            </Radio>
          </DemoControls>
          <DemoControls legend="表記">
            <Radio name="mo-notation" checked={notation === "auto"} onChange={() => setNotation("auto")}>
              大きな値は省略
            </Radio>
            <Radio name="mo-notation" checked={notation === "standard"} onChange={() => setNotation("standard")}>
              省略しない
            </Radio>
          </DemoControls>
        </div>
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableCaption className="sr-only">数値の表記の例</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>指標</TableHead>
                <TableHead align="right">表示</TableHead>
                <TableHead align="right">省略前の値</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {samples.map(([label, v, f]) => {
                const format: MetricFormat =
                  locale === "en-US" ? { ...f, locale, ...(f.unit === "円" ? { style: "currency", currency: "USD", unit: undefined } : f.unit ? { unit: f.unit === "件" ? " items" : " companies" } : {}) } : f
                const r = formatMetricValue(v, { ...format, notation })
                return (
                  <TableRow key={label}>
                    <TableCell>{label}</TableCell>
                    <TableCell align="right" className="whitespace-nowrap tabular-nums" data-testid="mo-format-text">
                      {r?.text}
                    </TableCell>
                    <TableCell align="right" className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {r?.approximate ? r.exactText : "（同じ）"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-caption text-muted-foreground">en-US の例は表記の確認のため、同じ数値をドルとして示している（為替の換算はしていない）。</p>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 増減と良否
function EvaluationDemo() {
  const rows: { label: string; current: number; baseline: number; direction: "increase" | "decrease" | "neutral"; format: MetricFormat; kind?: "ratio" }[] = [
    { label: "売上", current: 8_310_000, baseline: 7_680_000, direction: "increase", format: yenFormat },
    { label: "解約率", current: 0.032, baseline: 0.04, direction: "decrease", format: ratioFormat, kind: "ratio" },
    { label: "エラー率", current: 0.012, baseline: 0.008, direction: "decrease", format: { style: "ratio", maximumFractionDigits: 1, minimumFractionDigits: 1 }, kind: "ratio" },
    { label: "問い合わせ件数", current: 138, baseline: 121, direction: "neutral", format: countFormat("件") },
    { label: "契約企業数", current: 428, baseline: 428, direction: "increase", format: countFormat("社") },
  ]
  return (
    <DemoFrame testId="mo-evaluation">
      <MetricGroup minItemWidth="12rem">
        {rows.map((r) => (
          <Metric
            key={r.label}
            size="compact"
            label={r.label}
            value={ready(r.current)}
            format={r.format}
            comparison={<ComparisonValue result={compareValues({ current: ready(r.current), baseline: ready(r.baseline), kind: r.kind })} label="前月比" baseline={`前月 ${fmt(r.baseline, r.format)}`} direction={r.direction} kind={r.kind} format={r.format} />}
          />
        ))}
      </MetricGroup>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 目標
function TargetDemo() {
  const elapsed = getPeriodElapsed(full, ANALYSIS_TODAY)
  return (
    <DemoFrame testId="mo-target">
      <MetricGroup minItemWidth="14rem">
        <Metric size="compact" label="売上（目標に未達）" value={ready(83_100_000)} format={yenFormat} target={<MetricTarget value={83_100_000} target={97_100_000} format={yenFormat} label="今月の目標" elapsed={elapsed} />} />
        <Metric size="compact" label="売上（目標を超過）" value={ready(108_700_000)} format={yenFormat} target={<MetricTarget value={108_700_000} target={97_100_000} format={yenFormat} label="今月の目標" />} />
        <Metric size="compact" label="解約率（上限の目標）" value={ready(0.018)} format={ratioFormat} target={<MetricTarget value={0.018} target={0.015} direction="decrease" format={ratioFormat} label="月の上限" />} />
        <Metric size="compact" label="解約率（上限の内）" value={ready(0.006)} format={ratioFormat} target={<MetricTarget value={0.006} target={0.015} direction="decrease" format={ratioFormat} label="月の上限" elapsed={getPeriodElapsed(full, ANALYSIS_TODAY)} />} />
        <Metric size="compact" label="目標が 0" value={ready(3)} format={countFormat("件")} target={<MetricTarget value={3} target={0} format={countFormat("件")} />} />
        <Metric size="compact" label="目標がマイナス" value={ready(-120_000)} format={yenFormat} target={<MetricTarget value={-120_000} target={-500_000} format={yenFormat} />} />
        <Metric size="compact" label="目標が未設定" value={ready(52)} format={countFormat("件")} target={<MetricTarget value={52} target={null} format={countFormat("件")} />} />
      </MetricGroup>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- データの状態
type StateCase = "ready" | "zero" | "missing" | "loading" | "unavailable" | "stale" | "provisional" | "nan"
const stateCases: [StateCase, string][] = [
  ["ready", "正常"],
  ["zero", "実際の 0"],
  ["missing", "欠損"],
  ["loading", "初回の読み込み"],
  ["unavailable", "取得失敗"],
  ["stale", "古いデータ"],
  ["provisional", "未確定"],
  ["nan", "算出できない値（NaN）"],
]

function StatesDemo() {
  const [c, setC] = useState<StateCase>("ready")
  const value: Loadable<number> =
    c === "loading" ? { status: "loading" } : c === "unavailable" ? { status: "unavailable" } : c === "missing" ? ready(null) : c === "zero" ? ready(0) : c === "nan" ? ready(Number.NaN) : ready(384_000)
  return (
    <DemoFrame testId="mo-states">
      <div className="flex flex-col gap-6">
        <DemoControls legend="値の状態">
          {stateCases.map(([v, l]) => (
            <Radio key={v} name="mo-state" checked={c === v} onChange={() => setC(v)}>
              {l}
            </Radio>
          ))}
        </DemoControls>
        <MetricGroup>
          <Metric
            label="未入金"
            value={value}
            format={yenFormat}
            status={c === "stale" ? { kind: "stale", text: "14:32 の時点の値（最新の値を取得できませんでした）" } : c === "provisional" ? { kind: "provisional", text: "未確定（月末に確定）" } : undefined}
            emptyLabel="データなし"
            data-testid="mo-state-metric"
          />
          <Metric label="契約企業数" value={ready(428)} format={countFormat("社")} />
        </MetricGroup>
        <p className="text-caption text-muted-foreground">取得できない値、データのない値、算出できない値は、数値と同じ大きさで強調しない。読み込みの前後で、指標の高さを変えない。</p>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- Sparkline
function SparklineDemo() {
  const withGap = [12, 14, 13, null, null, 16, 18, 17, 19, 21, 20, 22]
  return (
    <DemoFrame testId="mo-sparkline">
      <MetricGroup minItemWidth="14rem">
        <Metric size="compact" label="欠損がある推移" value={ready(22)} format={countFormat("件")} sparkline={<Sparkline data={withGap} label="12 か月の件数。4 月と 5 月はデータなし。12 件から 22 件に増加" />} note="4〜5 月はデータなし（線を途切れさせ、0 として描かない）" />
        <Metric size="compact" label="データ点が足りない" value={ready(3)} format={countFormat("件")} sparkline={<Sparkline data={[1, 3]} label="2 か月だけの値" />} note="値のある点が 4 つ未満のため、推移を描かない" data-testid="mo-sparkline-few" />
      </MetricGroup>
    </DemoFrame>
  )
}

export function MetricOverviewPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Analysis"
        name="Metric Overview"
        lead="現在の状況を、判断に必要な指標の名前と値から伝える。重要度を文字の大きさと配置で示し、比較値、目標、推移、定義は意味がある場合だけ加える。数値はすべて架空のデータ。"
      />

      <Section title="重要度と文字の大きさ" lead="特に強調する指標 48px / 700、主要な指標 36px / 600、補助の指標 28px / 600、コンパクトな指標 20px / 600。Card で囲まず、余白で区切る。">
        <HierarchyDemo />
      </Section>

      <Section title="数値の表記" lead="大きな値は省略表記にし、値が変わる場合は「約」を付ける。省略前の値は定義などで確かめられるようにする。計算には丸める前の値を使う。">
        <FormatDemo />
      </Section>

      <Section title="増減と良否" lead="増減の向きは矢印と符号、良否は色で示す。減少が望ましい指標は、向きと良否が逆になるため「改善」「悪化」を文字でも示す。良否を定義できない指標は色を付けない。">
        <EvaluationDemo />
      </Section>

      <Section title="目標" lead="目標がある場合だけ示す。達成率と期間の経過を別の文で示す。100% を超える値はそのまま示し、Progress の表示の範囲と区別する。目標に届かないことだけを理由に Destructive にしない。">
        <TargetDemo />
      </Section>

      <Section title="データの状態" lead="正常、実際の 0、欠損、読み込み、取得失敗、古いデータ、未確定を区別する。NaN や Infinity を数値として表示しない。">
        <StatesDemo />
      </Section>

      <Section title="Sparkline" lead="推移が判断に関係する場合だけ使う。欠損は線を途切れさせる。データ点が足りない場合、同じ内容の詳しいグラフが直下にある場合は使わない。">
        <SparklineDemo />
      </Section>

      <Section title="判断基準">
        <Rules
          rows={[
            ["主要な指標", "3〜5 個を目安にする（固定の上限ではない）。利用者の判断に必要な指標を先に置き、補助の指標は関連する分析の領域に置く"],
            ["比較値", "比較の対象（前月比、前年同期比）と、比較の対象の値（前月 4,240万円）を示す。比較に意味がない指標には付けない"],
            ["時点の指標", "MRR、契約企業数などは、いつの時点の値か（2026/11/25時点）と、比較の基準の時点を示す"],
            ["定義", "定義によって結果が変わる指標（MRR、解約率など）は、押すと開く Popover で集計方法を示す。判断に必要な情報をホバーだけの Tooltip に置かない"],
            ["詳細への移動", "実際の詳細がある場合だけ、リンク（「解約の内訳を見る」）を置く。指標の全体をリンクにせず、閲覧だけの指標を押せるように見せない"],
            ["モバイル", "重要度の順を保ったまま 1 列に並べる。横のスクロールやカルーセルにしない。画面が狭いことを理由に重要な指標を削らない"],
          ]}
        />
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "指標の並びは dl（名前は dt、値は dd）。読み上げは画面の文字と同じ（「約4.42億円」）。省略前の値は定義の Popover で示す。",
            "比較値は、増減と評価を文で読み上げる（「+1.7%（増加、改善）」）。色だけで伝えない。",
            "目標の Progress の読み上げの値は、表示の範囲に収める前の実際の割合（112.0%）。",
            "Sparkline は装飾として隠し、推移の要約を支援技術向けの文で示す。",
            "読み込み中の指標に aria-busy を付け、Skeleton は装飾として扱う。",
          ]}
        />
        <div className="mt-6">
          <AppLink href="#/analysis-app?page=business">検証画面（事業の状況）で確かめる</AppLink>
        </div>
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="同じ大きさの 6 枚のカードに、アイコンと比較値を機械的に付けた例">
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex flex-col gap-1 rounded-md border border-border p-2">
                    <span className="size-3 rounded-full bg-border" />
                    <span className="h-2 w-2/3 rounded-full bg-border" />
                    <span className="text-ui font-semibold">12.3%</span>
                    <span className="text-caption text-success">+2.1%</span>
                  </div>
                ))}
              </div>
            </Mock>
          }
          badNote="すべてが同じ重要度に見え、何と比べた値かもわからない。"
          good={
            <Mock label="最も重要な指標を大きく示し、ほかの指標を小さく並べた例">
              <span className="text-caption text-muted-foreground">MRR</span>
              <span className="text-page-title">{fmt(o.mrr.current, yenFormat)}</span>
              <span className="text-caption text-muted-foreground">
                前月比 {describeComparison(compareValues({ current: ready(o.mrr.current), baseline: ready(o.mrr.baseline) }), { show: "rate" }).text}（10/25時点 {fmt(o.mrr.baseline, yenFormat)}）
              </span>
              <div className="mt-2 flex gap-6">
                <span className="text-ui">{fmt(o.accounts.current, countFormat("社"))}</span>
                <span className="text-ui">解約率 {fmt(o.churnRate.current, ratioFormat)}</span>
              </div>
            </Mock>
          }
          goodNote="重要度を文字の大きさで示し、比較の対象と値を添える。"
        />
        <Compare
          bad={
            <Mock label="解約率の減少を赤い色だけで示した例">
              <span className="text-caption text-muted-foreground">解約率</span>
              <span className="text-heading text-destructive">3.2%</span>
            </Mock>
          }
          badNote="減ったのか増えたのか、良いのか悪いのかが色だけでは伝わらない。減少を自動で Destructive にしている。"
          good={
            <Mock label="解約率の減少を矢印、符号、「改善」の文字で示した例">
              <span className="text-caption text-muted-foreground">解約率</span>
              <span className="text-heading">3.2%</span>
              <span className="text-caption text-success">↘ −0.8pt 改善（前月 4.0%）</span>
            </Mock>
          }
          goodNote="向きは矢印と符号、良否は色と文字で示す。評価の方向は指標ごとに製品が定義する。"
        />
      </Section>
    </article>
  )
}
