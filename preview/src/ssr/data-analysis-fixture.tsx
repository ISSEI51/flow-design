import { TooltipProvider } from "@/components/ui/tooltip"
import { makeDate } from "@/lib/date"
import { AnalysisPeriodFilter, ComparisonSelect, GranularitySelect } from "@/patterns/analysis-controls"
import { useAnalysisQuery, useCrossFilter } from "@/patterns/analysis-query"
import { AnalysisRegion, AnalysisScopeNote } from "@/patterns/analysis-region"
import { useBrowseData } from "@/patterns/browse-data"
import { compareValues } from "@/patterns/comparison"
import { DrillDownLink } from "@/patterns/drill-down"
import { ComparisonValue, Metric, MetricDefinition, MetricGroup, MetricTarget, Sparkline } from "@/patterns/metric"

// Data Analysis の Patterns の SSR と Hydration の検品用の画面。
// サーバーで描画するときは window と document がない。描画の結果は、サーバーとブラウザで同じでなければならない。
// 「今日」は固定の日付を渡す（サーバーとブラウザで時刻が異なっても、同じ期間に解決する）。データの取得は効果の中で行う。

const context = { today: makeDate(2026, 11, 25)!, weekStartsOn: 1 as const, fiscalYearStartMonth: 4 }
const ready = (value: number | null) => ({ status: "ready" as const, value })

export function DataAnalysisSsrFixture() {
  const a = useAnalysisQuery({
    defaultQuery: { period: { kind: "relative", id: "this-month" }, comparison: "previous-month", filters: { plans: [] as string[] } },
    context,
  })
  const cross = useCrossFilter()
  const data = useBrowseData({ query: a.key, fetcher: () => new Promise<number>((resolve) => setTimeout(() => resolve(428), 50)) })
  return (
    <TooltipProvider>
      <main className="flex flex-col gap-8 p-6" data-testid="ssr-analysis">
        <h1 className="text-page-title">事業の状況</h1>
        <div role="group" aria-label="ページ全体の条件" className="flex flex-wrap gap-6">
          <AnalysisPeriodFilter value={a.query.period} onValueChange={a.setPeriod} presets={["this-month", "last-month"]} resolved={a.period} context={context} />
          <ComparisonSelect value={a.query.comparison} onValueChange={(m) => a.setComparison(m)} options={["previous-month", "previous-year", "none"]} comparison={a.comparison} />
          <GranularitySelect value={a.query.granularity} onValueChange={a.setGranularity} options={a.granularities} />
        </div>
        <p data-testid="ssr-period">{a.period.status === "ready" ? `${a.period.days}日間` : "—"}</p>
        <AnalysisRegion title="主要な指標" status={data.status} conditions={<AnalysisScopeNote kind="override">期間：過去 24 か月</AnalysisScopeNote>}>
          <MetricGroup>
            <Metric
              size="hero"
              label="契約企業数"
              value={data.status === "ready" ? ready(data.data ?? null) : { status: "loading" }}
              format={{ unit: "社" }}
              definition={<MetricDefinition label="契約企業数">その日に契約中の企業の数。</MetricDefinition>}
              data-testid="ssr-accounts"
            />
            <Metric
              label="売上"
              value={ready(441_600_000)}
              format={{ unit: "円" }}
              comparison={<ComparisonValue result={compareValues({ current: ready(0.032), baseline: ready(0.04), kind: "ratio" })} label="前月比" direction="decrease" kind="ratio" format={{ style: "ratio" }} />}
              target={<MetricTarget value={112} target={100} format={{ unit: "件" }} />}
              sparkline={<Sparkline data={[1, 2, null, 4, 5]} label="推移" />}
            />
            <Metric label="未入金" value={ready(0)} format={{ unit: "円" }} />
            <Metric label="解約率" value={{ status: "unavailable" }} format={{ style: "ratio" }} />
            <Metric label="粗利率" value={ready(Number.NaN)} format={{ style: "ratio" }} />
          </MetricGroup>
        </AnalysisRegion>
        <button type="button" aria-pressed={cross.isSelected("plan", "standard")} onClick={() => cross.toggle({ source: "plan", field: "plan", value: "standard", label: "スタンダード" })} data-testid="ssr-cross">
          スタンダードで絞り込む
        </button>
        <p data-testid="ssr-cross-state">{cross.forRegion("term")?.label ?? "選択なし"}</p>
        <DrillDownLink origin="ssr-drill" href="#/drill">
          内訳を見る
        </DrillDownLink>
      </main>
    </TooltipProvider>
  )
}
