import { useEffect, useMemo, useState } from "react"

import { toDateString } from "@/lib/date"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { comparisonLabels, describeRange, fullPeriodOf, getPeriodElapsed, type ComparisonMode, type ComparisonRange, type PeriodUnit } from "@/patterns/analysis-period"
import { AnalysisPeriodFilter, ComparisonSelect } from "@/patterns/analysis-controls"
import { useAnalysisQuery } from "@/patterns/analysis-query"
import { AnalysisRegion, AnalysisScopeNote } from "@/patterns/analysis-region"
import { useBrowseData, type BrowseDataStatus } from "@/patterns/browse-data"
import { compareValues, formatDifference } from "@/patterns/comparison"
import { DrillDownLink } from "@/patterns/drill-down"
import { ComparisonValue, Metric, MetricDefinition, MetricGroup, MetricTarget, Sparkline } from "@/patterns/metric"
import { formatMetricValue } from "@/patterns/metric-format"
import { PageColumns, PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { SectionStack } from "@/patterns/section-layout"
import type { Loadable } from "@/patterns/data-states"
import { comparisonRange } from "@/patterns/analysis-period"

import { bridgeData, mrrTrend, overviewData, profitByRegion, type OverviewData } from "../../data/data-analysis/analysis-model"
import { analysisServer, request } from "../../data/data-analysis/analysis-server"
import {
  ANALYSIS_TODAY,
  DATA_START,
  defaultAnalysisFilters,
  regionLabels,
  regions,
  type AnalysisFilters,
  type Region,
} from "../../data/data-analysis/subscriptions"
import { ComparisonTable, DiffBarChart, MrrTrendChart, countFormat, fmt, marginFormat, ratioFormat, ready, yenFormat, type ComparisonRowSpec } from "./analysis-parts"
import { paramsFromQuery, queryFromParams, replaceHash, type Route } from "./analysis-route"

// Strategic Dashboard（経営・意思決定）の例：事業の状況。
// 考える順：現在の状況（主要指標と目標）→ 推移（MRR）→ 増減の要因 → 収益性 → 期間の比較 → 次にすること。
// 主要指標は 1 回の要求で取得し、集計の時点をそろえる（MRR、契約企業数、売上、解約率が同じ時点の値になる）。

export const analysisContext = { today: ANALYSIS_TODAY, weekStartsOn: 1 as const, fiscalYearStartMonth: 4 }

export function comparisonOptionsFor(unit: PeriodUnit | null): ComparisonMode[] {
  if (unit === "month") return ["previous-month", "previous-year", "none"]
  if (unit === "quarter") return ["previous-quarter", "previous-year", "none"]
  if (unit === "year" || unit === "fiscal-year") return ["previous-year", "none"]
  return ["previous-period", "previous-year", "none"]
}

const allComparisonOptions: ComparisonMode[] = ["previous-month", "previous-quarter", "previous-year", "previous-period", "custom", "none"]

export const comparisonShort: Record<ComparisonMode, string> = {
  none: "",
  "previous-period": "前期間比",
  "previous-month": "前月比",
  "previous-quarter": "前四半期比",
  "previous-year": "前年同期比",
  custom: "比較期間比",
}
export const baselineShort: Record<ComparisonMode, string> = {
  none: "",
  "previous-period": "前期間",
  "previous-month": "前月",
  "previous-quarter": "前四半期",
  "previous-year": "前年同期",
  custom: "比較期間",
}

const regionItems = [{ value: "all", label: "すべての地域" }, ...regions.map((r) => ({ value: r, label: regionLabels[r] }))]

export function RegionSelect({ value, onChange, label = "地域" }: { value: Region[]; onChange: (v: Region[]) => void; label?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id="analysis-region-label" className="text-caption text-muted-foreground">
        {label}
      </span>
      <Select items={regionItems} value={value[0] ?? "all"} onValueChange={(v) => onChange(!v || String(v) === "all" ? [] : [v as Region])}>
        <SelectTrigger aria-labelledby="analysis-region-label" size="sm" className="w-44 max-w-full text-ui" data-testid="analysis-region-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {regionItems.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** 取得の状態から、指標の値の状態を決める。取得の失敗は「取得できません」、値がない場合は ready の null */
export function loadable(status: BrowseDataStatus, value: number | null | undefined): Loadable<number> {
  if (status === "loading" || status === "idle") return { status: "loading" }
  if (status === "error") return { status: "unavailable" }
  return ready(value)
}

const regionError = (name: string, reload: () => void) => ({ title: `${name}を取得できませんでした`, description: "ほかの領域は表示しています。この領域だけを再取得できます。", onRetry: reload })

export function BusinessDashboard({ route }: { route: Route }) {
  const initialQuery = useMemo(() => queryFromParams(route.params), []) // eslint-disable-line react-hooks/exhaustive-deps
  const a = useAnalysisQuery<AnalysisFilters>({
    defaultQuery: { period: { kind: "relative", id: "this-month" }, comparison: "previous-month", filters: defaultAnalysisFilters },
    initialQuery,
    context: analysisContext,
    onQueryChange: (q) => replaceHash(`#/analysis-app?${paramsFromQuery("business", q).toString()}`),
  })
  const period = a.period
  const options = comparisonOptionsFor(period.status === "ready" ? period.unit : null)
  // 期間の種類が変わり、選んでいた比較が使えなくなった場合（期間を指定する比較は除く）は、使える最初の比較にし、そのことを知らせる。
  const [cmpNotice, setCmpNotice] = useState<string | null>(null)
  useEffect(() => {
    const q = a.query.comparison
    if (q === "custom" || options.includes(q)) return
    setCmpNotice(`期間に合わせて、比較を「${comparisonLabels[q]}」から「${comparisonLabels[options[0]]}」に変えました`)
    a.setComparison(options[0])
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const full = period.status === "ready" ? fullPeriodOf(period, analysisContext) : null
  const key = a.key
  const overview = useBrowseData({
    query: key,
    fetcher: (_, { signal }) =>
      request("overview", key, () => overviewData({ period: period as never, full, comparison: a.comparison, filters: a.query.filters }), { signal }),
  })
  const trendKey = JSON.stringify({ f: a.query.filters, forecast: analysisServer.forecast })
  const trend = useBrowseData({
    query: trendKey,
    fetcher: (_, { signal }) => request("trend", trendKey, () => mrrTrend({ filters: a.query.filters, withForecast: analysisServer.forecast }), { signal }),
  })
  const bridge = useBrowseData({
    query: key,
    fetcher: (_, { signal }) => request("bridge", key, () => bridgeData({ period: period as never, comparison: a.comparison, filters: a.query.filters }), { signal }),
  })
  const profit = useBrowseData({
    query: key,
    fetcher: (_, { signal }) => request("profit", key, () => profitByRegion({ period: period as never, comparison: a.comparison, filters: a.query.filters }), { signal }),
  })

  const range = period.status === "ready" ? period.range : null
  const cmp = a.comparison
  const cmpLabel = cmp.status === "ready" ? comparisonShort[cmp.mode] : ""
  const base = baselineShort[a.query.comparison]
  const o = overview.data as OverviewData | undefined
  const st = overview.status
  const asOfText = range ? `${describeRange({ from: range.to, to: range.to })}時点` : ""
  const elapsed = full && period.status === "ready" && period.inProgress ? getPeriodElapsed(full, ANALYSIS_TODAY) : undefined

  const cmpValue = (current: number | null | undefined, baseline: number | null | undefined, kind: "amount" | "ratio" = "amount") =>
    st === "ready" || st === "refreshing"
      ? compareValues({ current: ready(current), baseline: cmp.status === "ready" ? ready(baseline) : undefined, kind })
      : compareValues({ current: { status: st === "error" ? "unavailable" : "loading" }, baseline: undefined })

  const showComparison = cmp.status === "ready"
  // 顧客維持の分析へ、同じ期間（固定の日付）と全体の絞り込みを引き継ぐ。比較は顧客維持の分析の既定（前年同期）にする。
  const retentionHref = () =>
    range ? `${"#/analysis-app"}?${paramsFromQuery("retention", { ...a.query, period: { kind: "absolute", from: toKey(range.from), to: toKey(range.to) }, comparison: "previous-year", granularityMode: "auto" }).toString()}` : "#"

  return (
    <PageLayout width="wide" data-testid="analysis-business">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>事業の状況</PageHeaderTitle>
          <PageHeaderDescription>架空のデータ。{describeRange({ from: ANALYSIS_TODAY, to: ANALYSIS_TODAY })}時点。金額は税抜き。会計年度は 4 月始まり。</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {/* ページ全体の条件。Page Header の直下に置き、すべての領域に適用する */}
      <div role="group" aria-label="ページ全体の条件" className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-4" data-testid="analysis-global-filters">
        <AnalysisPeriodFilter
          value={a.query.period}
          onValueChange={(p) => {
            setCmpNotice(null)
            return a.setPeriod(p)
          }}
          presets={["this-month", "last-month", "this-quarter", "last-quarter", "this-fiscal-year"]}
          resolved={period}
          context={analysisContext}
          min={DATA_START}
        />
        <ComparisonSelect
          value={a.query.comparison}
          onValueChange={(m) => {
            setCmpNotice(null)
            a.setComparison(m)
          }}
          options={allComparisonOptions}
          disabledOptions={allComparisonOptions.filter((m) => m !== "custom" && !options.includes(m))}
          comparison={cmp}
          period={period}
          customRange={a.query.comparisonCustom}
          onCustomRangeChange={(r) => a.setComparison("custom", r)}
          min={DATA_START}
        />
        <RegionSelect value={a.query.filters.regions} onChange={(regions) => a.setFilters({ regions })} />
      </div>
      <p role="status" className="-mt-4 text-caption text-foreground empty:hidden" data-testid="business-cmp-notice">
        {cmpNotice}
      </p>

      <SectionStack spacing="section">
        {/* 1 Overview：現在の状況 */}
        <AnalysisRegion
          title="主要な指標"
          status={st}
          error={st === "error" ? regionError("主要な指標", overview.reload) : null}
          data-testid="business-overview"
          conditions={a.query.filters.regions.length ? <AnalysisScopeNote>{regionLabels[a.query.filters.regions[0]]}の契約だけを集計しています。売上の目標は全社の目標のため表示しません。</AnalysisScopeNote> : null}
        >
          <MetricGroup minItemWidth="15rem" className="gap-y-12">
            <Metric
              className="col-span-full"
              size="hero"
              label="MRR（月額の契約金額）"
              value={loadable(st, o?.mrr.current)}
              format={yenFormat}
              definition={
                <MetricDefinition label="MRR" exact={formatMetricValue(o?.mrr.current, { ...yenFormat, notation: "standard" })?.text}>
                  <p>その日に有効な契約の月額の合計（税抜き）。初期費用と従量の料金を含めない。解約は、解約の発効日から除く。</p>
                </MetricDefinition>
              }
              status={{ kind: "partial", text: asOfText }}
              comparison={
                showComparison && (
                  <ComparisonValue
                    result={cmpValue(o?.mrr.current, o?.mrr.baseline)}
                    label={cmpLabel}
                    baseline={o?.baselineAsOf ? `${describeRange({ from: o.baselineAsOf, to: o.baselineAsOf })}時点 ${fmt(o.mrr.baseline, yenFormat)}` : undefined}
                    direction="increase"
                    format={yenFormat}
                    data-testid="business-mrr-comparison"
                  />
                )
              }
              sparkline={o && <Sparkline data={o.mrrSpark} label={`過去 12 か月の月末の MRR は ${fmt(o.mrrSpark[0], yenFormat)}から ${fmt(o.mrrSpark[11], yenFormat)}に変化`} />}
              data-testid="metric-mrr"
            />
            <Metric
              label="売上"
              value={loadable(st, o?.revenue.current)}
              format={yenFormat}
              definition={
                <MetricDefinition label="売上" exact={formatMetricValue(o?.revenue.current, { ...yenFormat, notation: "standard" })?.text}>
                  <p>期間の各日に有効な契約の月額を、日割り（月額 × 12 ÷ 365）にして合計した値（税抜き）。月の日数によって 1 日の売上を変えない。</p>
                </MetricDefinition>
              }
              status={period.status === "ready" && period.inProgress ? { kind: "provisional", text: `途中経過（${asOfText}）` } : undefined}
              comparison={
                showComparison && (
                  <ComparisonValue result={cmpValue(o?.revenue.current, o?.revenue.baseline)} label={cmpLabel} baseline={`${base} ${fmt(o?.revenue.baseline, yenFormat)}`} direction="increase" format={yenFormat} />
                )
              }
              target={o && o.revenueTarget !== null && <MetricTarget value={o.revenue.current} target={o.revenueTarget} format={yenFormat} label={`${period.status === "ready" && period.label ? period.label : "期間"}の目標`} elapsed={elapsed} />}
              data-testid="metric-revenue"
            />
            <Metric
              label="契約企業数"
              value={loadable(st, o?.accounts.current)}
              format={countFormat("社")}
              status={{ kind: "partial", text: asOfText }}
              comparison={
                showComparison && (
                  <ComparisonValue
                    result={cmpValue(o?.accounts.current, o?.accounts.baseline)}
                    label={cmpLabel}
                    baseline={o?.baselineAsOf ? `${describeRange({ from: o.baselineAsOf, to: o.baselineAsOf })}時点 ${fmt(o.accounts.baseline, countFormat("社"))}` : undefined}
                    direction="increase"
                    format={countFormat("社")}
                    show="difference"
                    data-testid="business-accounts-comparison"
                  />
                )
              }
              data-testid="metric-accounts"
            />
            <Metric
              label="解約率"
              value={loadable(st, o?.churnRate.current)}
              format={ratioFormat}
              definition={
                <MetricDefinition label="解約率">
                  <p>期間に解約した契約の件数 ÷ 期間の初日の前日に契約中だった件数。月額の金額ではなく、件数で計算する。</p>
                </MetricDefinition>
              }
              comparison={
                showComparison && (
                  <ComparisonValue result={cmpValue(o?.churnRate.current, o?.churnRate.baseline, "ratio")} label={cmpLabel} baseline={`${base} ${fmt(o?.churnRate.baseline, ratioFormat)}`} direction="decrease" kind="ratio" format={ratioFormat} data-testid="business-churn-comparison" />
                )
              }
              target={o && o.churnLimit !== null && <MetricTarget value={o.churnRate.current} target={o.churnLimit} direction="decrease" format={ratioFormat} label="月の上限" elapsed={elapsed} />}
              action={
                range && (
                  <DrillDownLink origin="metric-churn" href={retentionHref()}>
                    解約の内訳を見る
                  </DrillDownLink>
                )
              }
              data-testid="metric-churn"
            />
          </MetricGroup>
        </AnalysisRegion>

        {/* 2 Trend：どのように変化したか */}
        <AnalysisRegion
          title="MRR の推移"
          divider
          status={trend.status}
          error={trend.status === "error" ? regionError("MRR の推移", trend.reload) : null}
          conditions={<AnalysisScopeNote kind="override">期間：過去 24 か月と今後 3 か月（ページの期間とは別）</AnalysisScopeNote>}
          data-testid="business-trend"
        >
          {trend.data ? <MrrTrendChart rows={trend.data.rows} forecastBasis={trend.data.forecastBasis} testId="business-trend-chart" /> : <div className="h-80" />}
        </AnalysisRegion>

        {/* 3 Breakdown：変化の要因 */}
        <AnalysisRegion
          title="MRR の増減の内訳"
          description={range ? `${describeRange({ from: range.from, to: range.from })}の前日から${describeRange({ from: range.to, to: range.to })}までの増減。期間の中で契約して解約した契約は含めない。` : undefined}
          divider
          status={bridge.status}
          error={bridge.status === "error" ? regionError("MRR の増減の内訳", bridge.reload) : null}
          data-testid="business-bridge"
        >
          {bridge.data ? <BridgeContent data={bridge.data} cmp={cmp} newAccounts={o?.newAccounts} status={st} /> : <div className="h-64" />}
        </AnalysisRegion>

        {/* 収益性 */}
        <AnalysisRegion
          title="地域別の営業利益"
          description="営業利益 = 粗利（売上 − 原価）− 地域の固定費。九州・沖縄は 2024 年 4 月に拠点を開いた。"
          divider
          status={profit.status}
          error={profit.status === "error" ? regionError("地域別の営業利益", profit.reload) : null}
          data-testid="business-profit"
        >
          <div className="flex flex-col gap-8">
            <MetricGroup>
              <Metric
                size="secondary"
                label="粗利率"
                value={loadable(st, o?.grossMargin.current)}
                format={marginFormat}
                comparison={
                  showComparison && <ComparisonValue result={cmpValue(o?.grossMargin.current, o?.grossMargin.baseline, "ratio")} label={cmpLabel} baseline={`${base} ${fmt(o?.grossMargin.baseline, marginFormat)}`} direction="increase" kind="ratio" format={marginFormat} />
                }
              />
            </MetricGroup>
            {profit.data && (
              <ComparisonTable
                testId="business-profit-table"
                notation="compact"
                caption="地域別の営業利益"
                currentLabel={range ? describeRange(range) : "現在"}
                baselineLabel={cmp.status === "ready" ? `${base}（${describeRange(cmp.range)}）` : "比較なし"}
                rows={profit.data.map((r) => ({
                  key: r.region,
                  label: regionLabels[r.region],
                  current: r.current,
                  baseline: cmp.status === "ready" ? r.baseline : null,
                  format: yenFormat,
                  direction: "increase",
                }))}
              />
            )}
          </div>
        </AnalysisRegion>

        <PeriodComparisonSection global={a} />

        {/* 5 Action：次にすること */}
        <AnalysisRegion title="次にすること" divider status="ready" data-testid="business-actions">
          <ul className="flex flex-col gap-3 text-ui">
            {o && o.revenueTarget !== null && o.revenue.current !== null && o.revenue.current < o.revenueTarget && (
              <li>
                {period.status === "ready" && period.label}の売上の目標まで、あと {fmt(o.revenueTarget - o.revenue.current, yenFormat)}。
              </li>
            )}
            {range && (
              <li>
                <DrillDownLink origin="action-retention" href={retentionHref()}>
                  同じ期間の解約の内訳を確かめる（顧客維持の分析）
                </DrillDownLink>
              </li>
            )}
          </ul>
        </AnalysisRegion>
      </SectionStack>
    </PageLayout>
  )
}

const toKey = (d: Date) => toDateString(d)

function BridgeContent({
  data,
  cmp,
  newAccounts,
  status,
}: {
  data: ReturnType<typeof bridgeData>
  cmp: ComparisonRange
  newAccounts?: { current: number | null; baseline: number | null }
  status: BrowseDataStatus
}) {
  const c = data.current
  const items = [
    { key: "added", label: "新規の契約", value: c.added },
    { key: "expansion", label: "増額", value: c.expansion },
    { key: "contraction", label: "減額", value: -c.contraction },
    { key: "churn", label: "解約", value: -c.churn },
  ]
  return (
    <PageColumns layout="main-aside">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-ui">
          <span className="text-muted-foreground">期首 </span>
          <span className="tabular-nums">{fmt(c.start, yenFormat)}</span>
          <span className="text-muted-foreground"> → 期末 </span>
          <span className="font-medium tabular-nums">{fmt(c.end, yenFormat)}</span>
          <span className="text-muted-foreground">（増減 </span>
          <span className="tabular-nums">{c.start !== null && c.end !== null ? (formatDifference(c.end - c.start, { ...yenFormat, notation: "compact" }) ?? "—") : "—"}</span>
          <span className="text-muted-foreground">）</span>
        </p>
        <DiffBarChart items={items} format={yenFormat} title="MRR の増減の内訳" testId="business-bridge-chart" />
        <ComparisonTable
          testId="business-bridge-table"
          notation="compact"
          caption="MRR の増減の内訳"
          currentLabel="今回の期間"
          baselineLabel={cmp.status === "ready" ? `比較期間（${describeRange(cmp.range)}）` : "比較なし"}
          rows={[
            { key: "added", label: "新規の契約", current: c.added, baseline: data.baseline?.added ?? null, format: yenFormat, direction: "increase" },
            { key: "expansion", label: "増額", current: c.expansion, baseline: data.baseline?.expansion ?? null, format: yenFormat, direction: "increase" },
            { key: "contraction", label: "減額", current: c.contraction, baseline: data.baseline?.contraction ?? null, format: yenFormat, direction: "decrease" },
            { key: "churn", label: "解約", current: c.churn, baseline: data.baseline?.churn ?? null, format: yenFormat, direction: "decrease" },
          ]}
        />
      </div>
      {/* 補足：件数。増減の金額の内訳の理解を補う */}
      <MetricGroup minItemWidth="10rem" className="gap-y-8">
        <Metric
          size="compact"
          label="新規の契約"
          value={loadable(status, newAccounts?.current)}
          format={countFormat("件")}
          comparison={cmp.status === "ready" && newAccounts && <ComparisonValue result={compareValues({ current: ready(newAccounts.current), baseline: ready(newAccounts.baseline) })} label={comparisonShort[cmp.mode]} baseline={`${baselineShort[cmp.mode]} ${fmt(newAccounts.baseline, countFormat("件"))}`} direction="increase" format={countFormat("件")} show="difference" />}
        />
      </MetricGroup>
    </PageColumns>
  )
}

// 期間の比較。ページ全体の比較とは別に、この表だけの比較の条件を持つ（個別の比較は対象の直上・右に置く）。
function PeriodComparisonSection({ global }: { global: ReturnType<typeof useAnalysisQuery<AnalysisFilters>> }) {
  const [mode, setMode] = useState<ComparisonMode>("previous-year")
  const period = global.period
  const local = period.status === "ready" ? comparisonRange({ period, mode }) : ({ status: "none" } as ComparisonRange)
  const key = JSON.stringify([global.key, mode])
  const data = useBrowseData({
    query: key,
    fetcher: (_, { signal }) =>
      request("comparison", key, () => overviewData({ period: period as never, full: fullPeriodOf(period as never, analysisContext), comparison: local, filters: global.query.filters }), { signal }),
  })
  const o = data.data
  const rows: ComparisonRowSpec[] = o
    ? [
        { key: "revenue", label: "売上", current: o.revenue.current, baseline: o.revenue.baseline, format: yenFormat, direction: "increase" },
        { key: "mrr", label: "MRR（期間の最終日）", current: o.mrr.current, baseline: o.mrr.baseline, format: yenFormat, direction: "increase" },
        { key: "accounts", label: "契約企業数（期間の最終日）", current: o.accounts.current, baseline: o.accounts.baseline, format: countFormat("社"), direction: "increase" },
        { key: "new", label: "新規の契約", current: o.newAccounts.current, baseline: o.newAccounts.baseline, format: countFormat("件"), direction: "increase" },
        { key: "churn", label: "解約率", current: o.churnRate.current, baseline: o.churnRate.baseline, format: ratioFormat, direction: "decrease", kind: "ratio" },
        { key: "margin", label: "粗利率", current: o.grossMargin.current, baseline: o.grossMargin.baseline, format: marginFormat, direction: "increase", kind: "ratio" },
      ]
    : []
  return (
    <AnalysisRegion
      title="期間の比較"
      divider
      status={data.status}
      error={data.status === "error" ? regionError("期間の比較", data.reload) : null}
      actions={<ComparisonSelect label="この表の比較" value={mode} onValueChange={setMode} options={["previous-year", "previous-period", "previous-month"]}
          disabledOptions={period.status === "ready" && period.unit === "month" ? [] : ["previous-month"]} comparison={local} />}
      conditions={<AnalysisScopeNote kind="override">比較：この表だけの条件（ページの比較とは別）</AnalysisScopeNote>}
      data-testid="business-comparison"
    >
      {o && local.status === "ready" && period.status === "ready" && (
        <ComparisonTable
          testId="business-comparison-table"
          caption="期間の比較"
          currentLabel={describeRange(period.range)}
          baselineLabel={describeRange(local.range)}
          rows={rows}
        />
      )}
    </AnalysisRegion>
  )
}
