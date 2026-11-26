import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, chartAnimation, chartStyles, type ChartConfig } from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTableAppliedFilters, type AppliedFilter } from "@/components/ui/data-table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, fromDateString, toDateString } from "@/lib/date"
import { useAppShell } from "@/patterns/app-shell"
import { AnalysisPeriodFilter, ComparisonSelect, GranularitySelect } from "@/patterns/analysis-controls"
import { describeRange, type ComparisonRange, type DayRange } from "@/patterns/analysis-period"
import { scopeFilters, useAnalysisQuery, useCrossFilter, type CrossFilterSelection } from "@/patterns/analysis-query"
import { AnalysisRegion, AnalysisScopeNote } from "@/patterns/analysis-region"
import { useFilterDraft } from "@/patterns/browse-query"
import { useBrowseData } from "@/patterns/browse-data"
import { compareValues } from "@/patterns/comparison"
import { DataRegionError } from "@/patterns/data-states"
import { DrillDownLink, captureAnalysisPosition, useAnalysisPositionRestore, type AnalysisPosition } from "@/patterns/drill-down"
import { getRecordNeighbors } from "@/patterns/list-detail"
import { ComparisonValue, Metric, MetricDefinition, MetricGroup, Sparkline } from "@/patterns/metric"
import { PageColumns, PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { Section, SectionHeader, SectionHeading, SectionStack, SectionTitle } from "@/patterns/section-layout"

import {
  accountDetail,
  churnByPlan,
  churnByTerm,
  churnTrend,
  churnedAccountList,
  retentionSummary,
  type AccountDetail,
  type ChurnedListRow,
} from "../../data/data-analysis/analysis-model"
import { AnalysisRequestError, analysisServer, request } from "../../data/data-analysis/analysis-server"
import {
  ANALYSIS_TODAY,
  DATA_START,
  defaultAnalysisFilters,
  inDataRange,
  planLabels,
  plans,
  regionLabels,
  termLabels,
  terms,
  type AnalysisFilters,
  type Plan,
  type Term,
} from "../../data/data-analysis/subscriptions"
import { BreakdownBars, ChartDetails, countFormat, fmt, ratioFormat, ready, yenFormat } from "./analysis-parts"
import { APP, appHref, paramsFromQuery, queryFromParams, replaceHash, type Route } from "./analysis-route"
import { RegionSelect, analysisContext, baselineShort, comparisonShort, loadable } from "./business-dashboard"

// Analytical Dashboard（分析・原因の究明）の例：顧客維持の分析。
// 考える順：解約の状況（指標）→ 推移 → プラン別・契約期間別の内訳（Cross-filtering）→ 解約した企業 → 企業の詳細 → 業務画面。
//
// 製品（この画面）の責務として行うこと
// - URL への同期：期間、比較、集計単位、地域、契約期間（history.replaceState）。
// - 分析の画面の記録（履歴の項目ごと）：Cross-filtering の選択、表の並び順とページ、解約の理由の条件、スクロールの位置と操作元。
//   Drill-down のリンクを押したときに記録し、戻る（ブラウザの戻る、Breadcrumb の 1 つ上）で復元する。データは取得し直す。

type Snapshot = {
  selection: CrossFilterSelection | null
  sort: "end" | "fee"
  page: number
  reason: string | null
  position: AnalysisPosition
}

const snapshots = new Map<string, Snapshot>()
let keySeq = 0
type HistoryState = { fdAnalysisKey?: string; fdParentKey?: string }
const historyState = () => (window.history.state ?? {}) as HistoryState

export function isRestoring(route: Route) {
  if (route.page !== "retention" && route.page !== "retention-accounts") return false
  const key = historyState().fdAnalysisKey
  return Boolean(key && snapshots.has(key))
}

/** この履歴の項目の記録のキー。ない場合は効果の中で付ける（描画中は書き込まない） */
function useHistoryKey() {
  const [key] = useState(() => historyState().fdAnalysisKey ?? `analysis-${++keySeq}-${Date.now()}`)
  useEffect(() => {
    if (historyState().fdAnalysisKey !== key) window.history.replaceState({ ...historyState(), fdAnalysisKey: key }, "")
  }, [key])
  return key
}

/** Drill-down のリンクを押したときに、記録を保存し、移動先の履歴の項目に戻り先を記録する */
function useDrillCapture(key: string, snapshot: () => Omit<Snapshot, "position">) {
  const { mainRef } = useAppShell()
  return (e: MouseEvent) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>("a[data-drill-origin]")
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    snapshots.set(key, { ...snapshot(), position: captureAnalysisPosition({ scrollElement: mainRef.current, origin: link }) })
    e.preventDefault()
    window.location.hash = link.getAttribute("href")!.replace(/^#/, "")
    window.history.replaceState({ fdParentKey: key }, "")
  }
}

const reasons = ["利用頻度が低い", "予算の削減", "他社の製品に移行", "事業の縮小", "機能が不足している", "担当者の異動"]
const PAGE_SIZE = 10

const toKey = (d: Date) => toDateString(d)
const periodParams = (range: DayRange) => ({ from: toKey(range.from), to: toKey(range.to) })

function baseRange(c: ComparisonRange) {
  return c.status === "ready" ? c.range : null
}

const trendConfig = {
  ratePct: { label: "解約率（確定した区間）", color: "var(--chart-1)", indicator: "line" },
  partialPct: { label: "途中の区間", color: "var(--chart-1)", indicator: "dashed" },
  previousYearPct: { label: "前年", color: "var(--border-strong)", indicator: "dashed" },
} satisfies ChartConfig

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

// ---------------------------------------------------------------- 分析の画面
export function RetentionDashboard({ route }: { route: Route }) {
  const historyKey = useHistoryKey()
  const restore = snapshots.get(historyKey) ?? null
  const initialQuery = useMemo(() => queryFromParams(route.params), []) // eslint-disable-line react-hooks/exhaustive-deps
  const a = useAnalysisQuery<AnalysisFilters>({
    defaultQuery: { period: { kind: "relative", id: "last-12-months" }, comparison: "previous-year", filters: defaultAnalysisFilters },
    initialQuery,
    context: analysisContext,
    onQueryChange: (q) => replaceHash(`${APP}?${paramsFromQuery("retention", q).toString()}`),
  })
  const period = a.period
  const range = period.status === "ready" ? period.range : null
  const base = baseRange(a.comparison)
  const filters = a.query.filters
  const cross = useCrossFilter({ resetKey: JSON.stringify(filters), initialSelection: restore?.selection ?? null })
  const [sort, setSort] = useState<"end" | "fee">(restore?.sort ?? "end")
  const [page, setPage] = useState(restore?.page ?? 0)
  const [reason, setReason] = useState<string | null>(restore?.reason ?? null)
  const role = analysisServer.role

  const summary = useBrowseData({
    query: a.key,
    fetcher: (_, { signal }) => request("retention", a.key, () => retentionSummary({ range: range!, base, filters }), { signal }),
  })
  const trendKey = `${a.key}:${a.query.granularity}`
  const trend = useBrowseData({
    query: trendKey,
    fetcher: (_, { signal }) => request("trend", trendKey, () => churnTrend({ range: range!, granularity: a.query.granularity, filters }), { signal }),
  })
  const byPlan = useBrowseData({
    query: a.key,
    fetcher: (_, { signal }) => request("breakdown", a.key, () => churnByPlan({ range: range!, base, filters }), { signal }),
  })
  // Cross-filtering：プラン別の内訳で選んだプランを、契約期間別の内訳と企業の一覧に適用する（選択元のプラン別の内訳には適用しない）。
  const planSel = cross.forRegion("by-term")
  const scoped = planSel ? scopeFilters(filters, { plans: [planSel.value as Plan] }) : ({ status: "ready", filters, narrowed: [] } as const)
  const scopedKey = JSON.stringify([a.key, scoped.filters])
  const byTerm = useBrowseData({
    query: scopedKey,
    fetcher: (_, { signal }) => request("breakdown", scopedKey, () => churnByTerm({ range: range!, base, filters: scoped.filters }), { signal }),
  })
  const listKey = JSON.stringify([scopedKey, reason, role])
  const list = useBrowseData({
    query: listKey,
    fetcher: (_, { signal }) => request("accounts", listKey, () => churnedAccountList({ range: range!, filters: scoped.filters, role, reason }), { signal }),
  })

  // 条件が変わったら一覧の 1 ページ目に戻す（復元した最初の描画は除く）。
  const firstList = useRef(true)
  useEffect(() => {
    if (firstList.current) {
      firstList.current = false
      return
    }
    setPage(0)
  }, [listKey, sort])

  const rootRef = useRef<HTMLDivElement>(null)
  const { mainRef } = useAppShell()
  const allReady = [summary, trend, byPlan, byTerm, list].every((d) => d.status === "ready")
  useAnalysisPositionRestore({
    position: restore?.position ?? null,
    ready: allReady,
    root: rootRef,
    scrollElement: mainRef,
    fallbackFocus: () => rootRef.current?.querySelector("h1") ?? null,
    onRestored: () => snapshots.delete(historyKey),
  })
  const onClickCapture = useDrillCapture(historyKey, () => ({ selection: cross.selection, sort, page, reason }))

  // その他の条件（契約期間）：まとめて適用する。開くたびに適用中の条件から始め、閉じると破棄する。
  const draft = useFilterDraft({ value: { terms: filters.terms }, defaultValue: { terms: [] as Term[] }, onApply: (v) => a.setFilters({ terms: v.terms }) })
  const hidden: AppliedFilter[] = filters.terms.map((t) => ({
    id: `term-${t}`,
    label: "契約期間",
    value: termLabels[t],
    onRemove: () => a.setFilters({ terms: filters.terms.filter((x) => x !== t) }),
  }))

  const s = summary.data
  const st = summary.status
  const cmpReady = a.comparison.status === "ready"
  const cmpLabel = a.comparison.status === "ready" ? comparisonShort[a.comparison.mode] : ""
  const baseLabel = baselineShort[a.query.comparison]
  const cv = (pair: { current: number | null; baseline: number | null } | undefined, kind: "amount" | "ratio" = "amount") =>
    st === "error"
      ? compareValues({ current: { status: "unavailable" }, baseline: undefined })
      : !pair || st === "loading" || st === "idle"
        ? compareValues({ current: { status: "loading" }, baseline: undefined })
        : compareValues({ current: ready(pair.current), baseline: cmpReady ? ready(pair.baseline) : undefined, kind })

  // 内訳の 2 つのグラフは同じ軸（解約率の最大値）で描く
  const axisMax = Math.max(...(byPlan.data ?? []).map((r) => r.rate ?? 0), ...(byTerm.data ?? []).map((r) => r.rate ?? 0), 0)
  // Drill-down の URL。全体条件を引き継ぎ、期間は固定の日付にする（相対期間は、開いた日と戻った日で変わるため）。
  // Drill-down で加える条件は dplan、dterm に分け、全体条件（term）と区別する。
  const drillHref = ({ dplan, dterm, period: p }: { dplan?: string; dterm?: string; period?: { from: string; to: string } }) => {
    const q = paramsFromQuery("retention-accounts", a.query)
    q.delete("period")
    const r = p ?? (range ? periodParams(range) : null)
    if (r) {
      q.set("from", r.from)
      q.set("to", r.to)
    }
    if (dplan) q.set("dplan", dplan)
    if (dterm) q.set("dterm", dterm)
    return `${APP}?${q.toString()}`
  }

  const rows = useMemo(() => {
    const r = [...(list.data?.rows ?? [])]
    return sort === "fee" ? r.sort((x, y) => y.fee - x.fee || x.id.localeCompare(y.id)) : r
  }, [list.data, sort])

  return (
    <PageLayout width="wide" data-testid="analysis-retention">
      <div ref={rootRef} onClickCapture={onClickCapture} className="flex min-w-0 flex-col gap-8">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>顧客維持の分析</PageHeaderTitle>
            <PageHeaderDescription>架空のデータ。解約率 = 期間に解約した件数 ÷ 期間の初日の前日に契約中だった件数。</PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>

        <div className="flex min-w-0 flex-col gap-3">
          <div role="group" aria-label="ページ全体の条件" className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-4" data-testid="analysis-global-filters">
            <AnalysisPeriodFilter
              value={a.query.period}
              onValueChange={a.setPeriod}
              presets={["last-12-months", "this-fiscal-year", "last-fiscal-year", "last-90-days", "last-month"]}
              resolved={period}
              context={analysisContext}
              min={DATA_START}
            />
            <ComparisonSelect
              value={a.query.comparison}
              onValueChange={(m) => a.setComparison(m)}
              options={["previous-year", "previous-month", "previous-period", "custom", "none"]}
              comparison={a.comparison}
              period={period}
              customRange={a.query.comparisonCustom}
              onCustomRangeChange={(r) => a.setComparison("custom", r)}
              min={DATA_START}
            />
            <RegionSelect value={filters.regions} onChange={(regions) => a.setFilters({ regions })} />
            <div className="flex flex-col gap-1">
              <span className="text-caption text-transparent select-none" aria-hidden="true">
                .
              </span>
              <Popover open={draft.open} onOpenChange={draft.onOpenChange}>
                <PopoverTrigger render={<Button variant="secondary" size="sm" data-testid="retention-more" />}>
                  その他の条件{filters.terms.length ? `（${filters.terms.length}）` : ""}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72" data-testid="retention-more-popover">
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-ui font-semibold">契約期間</legend>
                    {terms.map((t) => (
                      <label key={t} className="flex min-h-10 cursor-pointer items-center gap-3 text-ui">
                        <Checkbox
                          checked={draft.draft.terms.includes(t)}
                          onCheckedChange={(c) => draft.set((d) => ({ terms: c ? [...d.terms, t] : d.terms.filter((x) => x !== t) }))}
                        />
                        {termLabels[t]}
                      </label>
                    ))}
                  </fieldset>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => draft.onOpenChange(false)}>
                      キャンセル
                    </Button>
                    <Button size="sm" onClick={draft.apply} disabled={!draft.dirty}>
                      適用する
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {/* 隠れている条件（その他の条件）だけを Chip で示す。見えている期間と地域は重複して示さない */}
          {hidden.length > 0 && <DataTableAppliedFilters filters={hidden} onClearAll={() => a.setFilters({ terms: [] })} />}
        </div>

        {range && !inDataRange(range) && (
          <DataRegionError
            variant="warning"
            title="期間に、集計の対象の範囲の外の日が含まれます"
            description={`集計できるのは ${formatDate(DATA_START)}〜${formatDate(ANALYSIS_TODAY)} です。範囲の外を含む期間の値は「データなし」と示し、0 として数えません。`}
            data-testid="retention-out-of-range"
          />
        )}
        <SectionStack spacing="section">
          <AnalysisRegion title="解約の状況" status={st} error={st === "error" ? { title: "解約の状況を取得できませんでした", description: "ほかの領域は表示しています。", onRetry: summary.reload } : null} data-testid="retention-summary">
            <MetricGroup>
              <Metric
                label="解約率"
                value={loadable(st, s?.churnRate.current)}
                format={ratioFormat}
                definition={
                  <MetricDefinition label="解約率">
                    <p>期間に解約した件数 ÷ 期間の初日の前日に契約中だった件数（{fmt(s?.activeAtStart, countFormat("件"))}）。期間の途中に契約した企業は分母に含めない。</p>
                  </MetricDefinition>
                }
                comparison={cmpReady && <ComparisonValue result={cv(s?.churnRate, "ratio")} label={cmpLabel} baseline={`${baseLabel} ${fmt(s?.churnRate.baseline, ratioFormat)}`} direction="decrease" kind="ratio" format={ratioFormat} data-testid="retention-rate-comparison" />}
                data-testid="retention-rate"
              />
              <Metric
                label="解約した企業"
                value={loadable(st, s?.churned.current)}
                format={countFormat("社")}
                comparison={cmpReady && <ComparisonValue result={cv(s?.churned)} label={cmpLabel} baseline={`${baseLabel} ${fmt(s?.churned.baseline, countFormat("社"))}`} direction="decrease" format={countFormat("社")} show="difference" />}
                action={range && <DrillDownLink origin="metric-churned" href={drillHref({})}>企業の一覧を見る</DrillDownLink>}
                data-testid="retention-churned"
              />
              <Metric
                label="解約した月額の合計"
                value={loadable(st, s?.churnMrr.current)}
                format={yenFormat}
                comparison={cmpReady && <ComparisonValue result={cv(s?.churnMrr)} label={cmpLabel} baseline={`${baseLabel} ${fmt(s?.churnMrr.baseline, yenFormat)}`} direction="decrease" format={yenFormat} />}
              />
            </MetricGroup>
          </AnalysisRegion>

          <AnalysisRegion
            title="解約率の推移"
            divider
            status={trend.status}
            error={trend.status === "error" ? { title: "解約率の推移を取得できませんでした", onRetry: trend.reload } : null}
            actions={<GranularitySelect value={a.query.granularity} onValueChange={a.setGranularity} options={a.granularities.filter((g) => g !== "hour")} shown={["day", "week", "month", "quarter", "year"]} />}
            conditions={
              a.notice ? (
                <p role="status" className="text-caption text-foreground" data-testid="granularity-notice">
                  {a.notice}
                </p>
              ) : null
            }
            data-testid="retention-trend"
          >
            {trend.data && <ChurnTrend rows={trend.data} drill={(row, series) => drillHref({ period: series === "current" ? { from: row.from, to: row.to } : { from: row.pyFrom, to: row.pyTo } })} />}
          </AnalysisRegion>

          <Section divider data-testid="retention-breakdown">
            <SectionHeader>
              <SectionHeading>
                <SectionTitle>プランと契約期間の内訳</SectionTitle>
                <p className="text-caption text-muted-foreground">プランを選ぶと、契約期間別の内訳と企業の一覧をそのプランで絞り込みます。2 つのグラフは同じ軸で描いています。</p>
              </SectionHeading>
            </SectionHeader>
            {cross.selection && (
              <div className="flex flex-wrap items-center gap-3" data-testid="cross-filter-state">
                <DataTableAppliedFilters
                  filters={[{ id: "cross", label: "選択中のプラン", value: cross.selection.label, onRemove: cross.clear }]}
                />
                <span className="text-caption text-muted-foreground">契約期間別の内訳と、解約した企業の一覧に適用しています。</span>
              </div>
            )}
            <PageColumns layout="equal">
              <AnalysisRegion
                title="プラン別の解約率"
                level={3}
                status={byPlan.status}
                error={byPlan.status === "error" ? { title: "プラン別の内訳を取得できませんでした", onRetry: byPlan.reload } : null}
                data-testid="retention-by-plan"
              >
                {byPlan.data && (
                  <BreakdownBars
                    testId="by-plan"
                    items={byPlan.data.map((r) => ({ key: r.key, label: planLabels[r.key], value: r.rate, detail: `${fmt(r.churned, countFormat("社"))}が解約（期首 ${fmt(r.base, countFormat("社"))}）` }))}
                    format={ratioFormat}
                    max={axisMax}
                    selected={cross.selection?.value ?? null}
                    onSelect={(item) => cross.toggle({ source: "by-plan", field: "plan", value: item.key, label: item.label })}
                    selectLabel={(item) => `${item.label}で絞り込む（解約率 ${fmt(item.value, ratioFormat)}）`}
                    drillHref={(item) => drillHref({ dplan: item.key })}
                    drillLabel={(item) => `${item.label}の内訳を見る`}
                  />
                )}
              </AnalysisRegion>
              <AnalysisRegion
                title="契約期間別の解約率"
                level={3}
                status={byTerm.status}
                conditions={planSel ? <AnalysisScopeNote>プラン：{planSel.label}（プラン別の内訳で選択）</AnalysisScopeNote> : null}
                error={byTerm.status === "error" ? { title: "契約期間別の内訳を取得できませんでした", onRetry: byTerm.reload } : null}
                data-testid="retention-by-term"
              >
                {byTerm.data && (
                  <BreakdownBars
                    testId="by-term"
                    items={byTerm.data.map((r) => ({ key: r.key, label: termLabels[r.key], value: r.rate, detail: `${fmt(r.churned, countFormat("社"))}が解約（期首 ${fmt(r.base, countFormat("社"))}）` }))}
                    format={ratioFormat}
                    max={axisMax}
                    drillHref={(item) => drillHref({ dplan: planSel?.value, dterm: item.key })}
                    drillLabel={(item) => `${item.label}の企業を見る`}
                  />
                )}
              </AnalysisRegion>
            </PageColumns>
          </Section>

          <AnalysisRegion
            title="解約した企業"
            divider
            status={list.status}
            error={list.status === "error" ? { title: "解約した企業の一覧を取得できませんでした", onRetry: list.reload } : null}
            conditions={
              <>
                {planSel && <AnalysisScopeNote>プラン：{planSel.label}（プラン別の内訳で選択）</AnalysisScopeNote>}
                {reason && <AnalysisScopeNote>解約の理由：{reason}（この一覧だけの条件）</AnalysisScopeNote>}
              </>
            }
            actions={
              <>
                <ListSelect label="解約の理由" value={reason ?? "all"} items={[{ value: "all", label: "すべての理由" }, ...reasons.map((r) => ({ value: r, label: r }))]} onChange={(v) => setReason(v === "all" ? null : v)} testId="retention-reason" />
                <ListSelect label="並び順" value={sort} items={[{ value: "end", label: "解約日の新しい順" }, { value: "fee", label: "月額の大きい順" }]} onChange={(v) => setSort(v as "end" | "fee")} testId="retention-sort" />
              </>
            }
            data-testid="retention-accounts"
          >
            {list.data && (list.data.outOfRange ? <OutOfRangeNote /> : <AccountList rows={rows} total={list.data.total ?? 0} hidden={list.data.hidden} page={page} onPage={setPage} />)}
          </AnalysisRegion>

          <AnalysisRegion title="次にすること" divider data-testid="retention-actions">
            {range && (
              <DrillDownLink
                origin="action-work"
                href={appHref("work", { ...periodParams(range), ...(scoped.filters.plans.length ? { plan: scoped.filters.plans.join(",") } : {}), ...(filters.regions.length ? { region: filters.regions.join(",") } : {}), ...(filters.terms.length ? { term: filters.terms.join(",") } : {}), ...(reason ? { reason } : {}) })}
              >
                この条件の解約した企業を、顧客の業務画面で開く
              </DrillDownLink>
            )}
          </AnalysisRegion>
        </SectionStack>
      </div>
    </PageLayout>
  )
}

/** 期間がデータの範囲の外を含む場合。0 件と区別する */
export function OutOfRangeNote() {
  return (
    <p className="text-ui text-muted-foreground" data-testid="out-of-range">
      期間に、集計の対象の範囲（{formatDate(DATA_START)}〜{formatDate(ANALYSIS_TODAY)}）の外の日が含まれるため、集計できません。期間を範囲の中に変えてください。
    </p>
  )
}

function ListSelect({ label, value, items, onChange, testId }: { label: string; value: string; items: { value: string; label: string }[]; onChange: (v: string) => void; testId?: string }) {
  const id = `list-select-${testId}`
  return (
    <div className="flex flex-col gap-1">
      <span id={id} className="text-caption text-muted-foreground">
        {label}
      </span>
      <Select items={items} value={value} onValueChange={(v) => onChange(String(v))}>
        <SelectTrigger aria-labelledby={id} size="sm" className="w-44 max-w-full text-ui" data-testid={testId}>
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
  )
}

type TrendPoint = ReturnType<typeof churnTrend>[number]

function ChurnTrend({ rows, drill }: { rows: TrendPoint[]; drill: (row: TrendPoint, series: "current" | "baseline") => string }) {
  // 途中の区間（今日を含む区間）は、確定した区間と同じ線で描かない（日数が少なく、値が低く見える）。
  // 直前の確定した区間と途中の区間の 2 点を、点線の別の系列にする。
  const progressIndex = rows.findIndex((r) => r.inProgress)
  const data = rows.map((r, i) => {
    const pct = r.rate === null ? null : r.rate * 100
    return {
      ...r,
      ratePct: r.inProgress ? null : pct,
      partialPct: progressIndex >= 0 && (i === progressIndex || i === progressIndex - 1) ? pct : null,
      previousYearPct: r.previousYear === null ? null : r.previousYear * 100,
    }
  })
  // 目盛りは 0.5% 刻み（大きい場合は 1% 刻み）の値を明示する。tickCount に任せると、文字の丸めと実際の位置がずれる。
  const peak = Math.max(0, ...data.flatMap((d) => [d.ratePct ?? 0, d.partialPct ?? 0, d.previousYearPct ?? 0]))
  const step = peak > 4 ? 1 : 0.5
  const top = Math.max(step, Math.ceil(peak / step) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="retention-trend-chart">
      <p id="retention-trend-desc" className="text-caption text-muted-foreground">
        区間ごとの解約率。前年は同じ区間の 1 年前の値（灰色の破線）。区間の初日の前日の契約中の件数が分母。今日を含む区間は途中の値（点線）。
      </p>
      <ChartContainer config={trendConfig} aria-label="解約率の推移" aria-describedby="retention-trend-desc" className="aspect-auto h-64 w-full">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...chartStyles.grid} />
          <XAxis dataKey="label" {...chartStyles.axis} interval="preserveStartEnd" minTickGap={12} />
          <YAxis {...chartStyles.axis} width={48} tickFormatter={(v: number) => `${v.toFixed(1)}%`} domain={[0, top]} ticks={ticks} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => (p?.[0]?.payload as TrendPoint | undefined)?.fullLabel ?? ""} valueFormatter={(v) => `${v.toFixed(1)}%`} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="previousYearPct" stroke="var(--color-previousYearPct)" {...chartStyles.forecastLine} strokeDasharray="4 4" {...chartAnimation} />
          <Line dataKey="ratePct" stroke="var(--color-ratePct)" {...chartStyles.line} {...chartAnimation} />
          <Line dataKey="partialPct" stroke="var(--color-partialPct)" {...chartStyles.line} strokeDasharray="2 3" dot={{ r: 3, fill: "var(--background)", strokeWidth: 2 }} {...chartAnimation} />
        </LineChart>
      </ChartContainer>
      <ChartDetails label="数値を表で見る（区間ごとの企業へ進む）">
        <Table density="compact" data-testid="retention-trend-table">
          <TableCaption className="sr-only">解約率の推移</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>区間</TableHead>
              <TableHead align="right">解約率</TableHead>
              <TableHead align="right">前年</TableHead>
              <TableHead>企業</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              return (
                <TableRow key={r.key}>
                  <TableCell>
                    {r.fullLabel}
                    {r.inProgress ? <span className="text-caption text-muted-foreground">（途中の区間）</span> : r.partial && <span className="text-caption text-muted-foreground">（期間の一部）</span>}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums">
                    {r.rate === null ? "—" : pct(r.rate)}
                  </TableCell>
                  <TableCell align="right" className="tabular-nums text-muted-foreground">
                    {r.previousYear === null ? "—" : pct(r.previousYear)}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-x-4">
                      <DrillDownLink origin={`trend:${r.key}`} href={drill(r, "current")} showIcon={false} className="text-caption">
                        {r.fullLabel}
                      </DrillDownLink>
                      {r.previousYear !== null && (
                        <DrillDownLink origin={`trend-py:${r.key}`} href={drill(r, "baseline")} showIcon={false} className="text-caption text-muted-foreground">
                          前年（{r.previousYearLabel}）
                        </DrillDownLink>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </ChartDetails>
    </div>
  )
}

// ---------------------------------------------------------------- 企業の一覧と、詳細の Sheet
function AccountList({ rows, total, hidden, page, onPage }: { rows: ChurnedListRow[]; total: number; hidden: number; page: number; onPage: (p: number) => void }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const shown = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const neighbors = getRecordNeighbors({ ids: rows.map((r) => r.id), activeId, total: rows.length })
  const open = (id: string | null) => {
    setActiveId(id)
    if (id) {
      const i = rows.findIndex((r) => r.id === id)
      if (i >= 0 && Math.floor(i / PAGE_SIZE) !== current) onPage(Math.floor(i / PAGE_SIZE))
    }
  }
  if (total === 0) return <p className="text-ui text-muted-foreground">この条件で解約した企業はありません。</p>
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-ui tabular-nums" data-testid="retention-list-count">
        {total}社
        {hidden > 0 && (
          <span className="text-muted-foreground" data-testid="retention-hidden">
            （表示できるのは {rows.length}社。{hidden}社は閲覧の権限がない取引先です）
          </span>
        )}
      </p>
      <div className="max-w-full overflow-x-auto" data-testid="retention-table">
        <Table>
          <TableCaption className="sr-only">解約した企業</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>会社名</TableHead>
              <TableHead>プラン</TableHead>
              <TableHead>契約期間</TableHead>
              <TableHead>地域</TableHead>
              <TableHead align="right">解約時の月額</TableHead>
              <TableHead>解約日</TableHead>
              <TableHead>理由</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.id} data-row-id={r.id} data-active={activeId === r.id || undefined}>
                <TableCell>
                  <button
                    type="button"
                    data-drill-origin={`row:${r.id}`}
                    aria-haspopup="dialog"
                    onClick={() => open(r.id)}
                    className="rounded-xs text-left font-medium underline decoration-border-strong underline-offset-4 outline-none hover:decoration-foreground focus-visible:focus-ring"
                  >
                    {r.name}
                  </button>
                </TableCell>
                <TableCell>{planLabels[r.plan]}</TableCell>
                <TableCell className="whitespace-nowrap">{termLabels[r.term]}</TableCell>
                <TableCell className="whitespace-nowrap">{regionLabels[r.region]}</TableCell>
                <TableCell align="right" className="whitespace-nowrap tabular-nums">
                  {fmt(r.fee, { ...yenFormat, notation: "standard" })}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDate(fromDateString(r.end))}</TableCell>
                <TableCell>{r.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && (
        <nav aria-label="一覧のページ" className="flex flex-wrap items-center gap-3 text-ui">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => onPage(current - 1)}>
            前の {PAGE_SIZE} 社
          </Button>
          <span className="tabular-nums" data-testid="retention-page">
            {current + 1} / {pages} ページ
          </span>
          <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => onPage(current + 1)}>
            次の {PAGE_SIZE} 社
          </Button>
        </nav>
      )}
      <AccountSheet id={activeId} onClose={() => setActiveId(null)} neighbors={neighbors} onMove={open} />
    </div>
  )
}

function useAccount(id: string | null) {
  return useBrowseData({
    query: id ?? "",
    enabled: id !== null,
    // 別の企業に切り替えたら、前の企業の詳細を残さない（現在の企業の情報として表示しない）
    keepPreviousData: false,
    fetcher: (key, { signal }) => request("account", key, () => accountDetail(key, analysisServer.role), { signal }),
  })
}

function AccountSummary({ account }: { account: AccountDetail }) {
  const seg = account.segments[account.segments.length - 1]
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-ui">
      <dt className="text-muted-foreground">地域</dt>
      <dd>{regionLabels[account.region]}</dd>
      <dt className="text-muted-foreground">プラン</dt>
      <dd>{planLabels[seg.plan]}</dd>
      <dt className="text-muted-foreground">契約期間</dt>
      <dd>{termLabels[account.term]}</dd>
      <dt className="text-muted-foreground">契約の開始</dt>
      <dd className="tabular-nums">{formatDate(fromDateString(account.start))}</dd>
      <dt className="text-muted-foreground">解約日</dt>
      <dd className="tabular-nums">{account.end ? formatDate(fromDateString(account.end)) : "契約中"}</dd>
      <dt className="text-muted-foreground">解約の理由</dt>
      <dd>{account.churnReason ?? "—"}</dd>
      <dt className="text-muted-foreground">担当者</dt>
      <dd>{account.owner}</dd>
      <dt className="text-muted-foreground">月額の推移</dt>
      <dd>
        <Sparkline data={account.history} minPoints={2} label={`最後の 12 か月の月額。最後は ${fmt(account.history.filter((v) => v !== null).at(-1), yenFormat)}`} />
      </dd>
    </dl>
  )
}

function AccountError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof AnalysisRequestError && error.kind === "forbidden") {
    // 権限不足は再試行で解決しない。再試行を置かず、次にすべきことを示す。
    return <DataRegionError title="この企業の詳細を表示する権限がありません" description="集計には含まれています。詳細が必要な場合は、管理者に閲覧の権限を依頼してください。" />
  }
  return <DataRegionError title="企業の詳細を取得できませんでした" description="一覧と集計はそのまま表示しています。" onRetry={onRetry} />
}

function AccountSheet({ id, onClose, neighbors, onMove }: { id: string | null; onClose: () => void; neighbors: ReturnType<typeof getRecordNeighbors>; onMove: (id: string) => void }) {
  const account = useAccount(id)
  const d = account.isCurrent ? account.data : null
  return (
    <Sheet mode="view" open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent size="default" data-testid="account-sheet" aria-busy={account.status === "loading" || undefined}>
        <SheetHeader>
          <SheetTitle>{d?.name ?? (account.status === "error" ? "企業の詳細" : "読み込み中")}</SheetTitle>
          <SheetDescription>
            {neighbors.position !== null ? `解約した企業の ${neighbors.position} / ${neighbors.total} 件目` : "解約した企業"}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {account.status === "error" ? (
            <AccountError error={account.error} onRetry={account.reload} />
          ) : d ? (
            <AccountSummary account={d} />
          ) : account.isCurrent && d === null ? (
            <p className="text-ui text-muted-foreground">この企業は見つかりません。</p>
          ) : (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} data-slot="skeleton" className="block h-4 w-2/3 rounded-sm bg-border motion-safe:animate-pulse" />
              ))}
            </div>
          )}
        </SheetBody>
        <SheetFooter className="justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!neighbors.previousId} onClick={() => neighbors.previousId && onMove(neighbors.previousId)}>
              前の企業
            </Button>
            <Button variant="outline" size="sm" disabled={!neighbors.nextId} onClick={() => neighbors.nextId && onMove(neighbors.nextId)}>
              次の企業
            </Button>
          </div>
          {id && (
            <DrillDownLink origin={`row:${id}`} href={appHref("account", { id })} className="text-ui" data-testid="account-sheet-page">
              詳細ページを開く
            </DrillDownLink>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------- Drill-down の画面（企業の一覧）
type DrillContext = {
  range: DayRange | null
  plan: Plan | null
  term: Term | null
  /** ページ全体の条件（分析の画面から引き継いだ条件） */
  global: AnalysisFilters
  /** 全体条件に Drill-down の条件を加えた結果。重ならない場合は conflict */
  scoped: ReturnType<typeof scopeFilters<AnalysisFilters>>
}

function drillContext(route: Route): DrillContext {
  const q = queryFromParams(route.params)
  const plan = route.params.get("dplan")
  const term = route.params.get("dterm")
  const period = q.period
  const from = period?.kind === "absolute" ? fromDateString(period.from) : null
  const to = period?.kind === "absolute" ? fromDateString(period.to) : null
  const global = { ...defaultAnalysisFilters, ...q.filters }
  const p = plan && (plans as string[]).includes(plan) ? (plan as Plan) : null
  const t = term && (terms as string[]).includes(term) ? (term as Term) : null
  return {
    range: from && to ? { from, to } : null,
    plan: p,
    term: t,
    global,
    // 選んだ対象の条件を、全体条件に加える（全体条件を黙って上書きしない）
    scoped: scopeFilters(global, { plans: p ? [p] : [], terms: t ? [t] : [] }),
  }
}

/** 分析の階層の Breadcrumb。1 つ上の階層で、履歴に戻り先がある場合は、履歴を戻る（条件と位置を復元する） */
export function AnalysisBreadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  const parentKey = historyState().fdParentKey
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((it, i) => (
          <span key={i} className="contents">
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {it.href ? (
                <BreadcrumbLink
                  href={it.href}
                  onClick={(e) => {
                    if (i === items.length - 2 && parentKey && snapshots.has(parentKey) && e.button === 0 && !e.metaKey && !e.ctrlKey) {
                      e.preventDefault()
                      window.history.back()
                    }
                  }}
                >
                  {it.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{it.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function drillCrumbs(route: Route, last?: string) {
  const c = drillContext(route)
  const base = new URLSearchParams(route.params)
  const href = (page: string, drop: string[]) => {
    const p = new URLSearchParams(base)
    p.set("page", page)
    for (const k of drop) p.delete(k)
    p.delete("id")
    return `${APP}?${p.toString()}`
  }
  const items: { label: string; href?: string }[] = [{ label: "顧客維持の分析", href: href("retention", ["dplan", "dterm"]) }]
  if (c.plan) items.push({ label: planLabels[c.plan], href: c.term || last ? href("retention-accounts", ["dterm"]) : undefined })
  if (c.term) items.push({ label: termLabels[c.term], href: last ? href("retention-accounts", []) : undefined })
  if (!c.plan && !c.term) items.push({ label: "解約した企業", href: last ? href("retention-accounts", []) : undefined })
  if (last) items.push({ label: last })
  return items
}

export function RetentionAccountsPage({ route }: { route: Route }) {
  const historyKey = useHistoryKey()
  const restore = snapshots.get(historyKey) ?? null
  const c = drillContext(route)
  const role = analysisServer.role
  const filters = c.scoped.filters
  const conflict = c.scoped.status === "conflict"
  const key = JSON.stringify([c.range?.from.getTime(), c.range?.to.getTime(), filters, role])
  const list = useBrowseData({
    query: key,
    enabled: c.range !== null && !conflict,
    fetcher: (_, { signal }) => request("accounts", key, () => churnedAccountList({ range: c.range!, filters, role }), { signal }),
  })
  const byTerm = useBrowseData({
    query: key,
    enabled: c.range !== null && !conflict && c.plan !== null && c.term === null,
    fetcher: (_, { signal }) => request("breakdown", key, () => churnByTerm({ range: c.range!, base: null, filters }), { signal }),
  })
  const [page, setPage] = useState(restore?.page ?? 0)
  const rootRef = useRef<HTMLDivElement>(null)
  const { mainRef } = useAppShell()
  useAnalysisPositionRestore({
    position: restore?.position ?? null,
    ready: list.status === "ready" && (byTerm.status === "ready" || byTerm.status === "idle"),
    root: rootRef,
    scrollElement: mainRef,
    fallbackFocus: () => rootRef.current?.querySelector("h1") ?? null,
    onRestored: () => snapshots.delete(historyKey),
  })
  const onClickCapture = useDrillCapture(historyKey, () => ({ selection: null, sort: "end", page, reason: null }))
  const title = [c.plan && planLabels[c.plan], c.term && termLabels[c.term]].filter(Boolean).join("・")
  const nextParams = (extra: Record<string, string>) => Object.fromEntries([...new URLSearchParams(route.params).entries(), ...Object.entries(extra)].filter(([k]) => k !== "page"))

  return (
    <PageLayout width="wide" data-testid="analysis-retention-accounts">
      <div ref={rootRef} onClickCapture={onClickCapture} className="flex min-w-0 flex-col gap-8">
        <PageHeader>
          <div className="basis-full">
            <AnalysisBreadcrumb items={drillCrumbs(route)} />
          </div>
          <PageHeaderContent>
            <PageHeaderTitle>{title ? `${title}の解約` : "解約した企業"}</PageHeaderTitle>
            {/* Breadcrumb は分析の階層、ここは集計の条件。同じ情報を繰り返さない */}
            <PageHeaderDescription data-testid="drill-conditions">
              期間：{c.range ? describeRange(c.range) : "—"}
              {c.global.regions.length ? ` ・ 地域：${c.global.regions.map((r) => regionLabels[r]).join("、")}` : " ・ すべての地域"}
              {!c.term && c.global.terms.length ? ` ・ 契約期間：${c.global.terms.map((t) => termLabels[t]).join("、")}` : ""}
            </PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
        {c.range === null ? (
          <DataRegionError title="期間がわかりません" description="分析の画面から開き直してください。" />
        ) : conflict ? (
          <DataRegionError
            variant="warning"
            title="ページ全体の条件と重なる企業がありません"
            description={`選んだ対象（${title}）が、分析の画面の条件（契約期間：${c.global.terms.map((t) => termLabels[t]).join("、")}）に含まれていません。条件を外して表示することはしません。`}
            data-testid="drill-conflict"
          />
        ) : (
          <SectionStack spacing="section">
            {c.plan && !c.term && (
              <AnalysisRegion title="契約期間別の解約率" status={byTerm.status} error={byTerm.status === "error" ? { title: "契約期間別の内訳を取得できませんでした", onRetry: byTerm.reload } : null} data-testid="drill-by-term">
                {byTerm.data && (
                  <BreakdownBars
                    testId="drill-term"
                    items={byTerm.data.map((r) => ({ key: r.key, label: termLabels[r.key], value: r.rate, detail: `${fmt(r.churned, countFormat("社"))}が解約` }))}
                    format={ratioFormat}
                    drillHref={(item) => appHref("retention-accounts", nextParams({ dterm: item.key }))}
                    drillLabel={(item) => `${item.label}の企業を見る`}
                  />
                )}
              </AnalysisRegion>
            )}
            <AnalysisRegion title="解約した企業" divider={Boolean(c.plan && !c.term)} status={list.status} error={list.status === "error" ? { title: "企業の一覧を取得できませんでした", onRetry: list.reload } : null} data-testid="drill-accounts">
              {list.data && (list.data.outOfRange ? <OutOfRangeNote /> : <DrillAccountTable rows={list.data.rows} total={list.data.total ?? 0} hidden={list.data.hidden} page={page} onPage={setPage} route={route} />)}
            </AnalysisRegion>
          </SectionStack>
        )}
      </div>
    </PageLayout>
  )
}

function DrillAccountTable({ rows, total, hidden, page, onPage, route }: { rows: ChurnedListRow[]; total: number; hidden: number; page: number; onPage: (p: number) => void; route: Route }) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const shown = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  if (total === 0) return <p className="text-ui text-muted-foreground">この条件で解約した企業はありません。</p>
  const ctx = Object.fromEntries([...route.params.entries()].filter(([k]) => k !== "page"))
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-ui tabular-nums" data-testid="drill-count">
        {total}社{hidden > 0 && <span className="text-muted-foreground">（表示できるのは {rows.length}社。{hidden}社は閲覧の権限がない取引先です）</span>}
      </p>
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableCaption className="sr-only">解約した企業</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>会社名</TableHead>
              <TableHead>プラン</TableHead>
              <TableHead>契約期間</TableHead>
              <TableHead align="right">解約時の月額</TableHead>
              <TableHead>解約日</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.id} data-row-id={r.id}>
                <TableCell>
                  <DrillDownLink origin={`row:${r.id}`} href={appHref("account", { ...ctx, id: r.id })} showIcon={false}>
                    {r.name}
                  </DrillDownLink>
                </TableCell>
                <TableCell>{planLabels[r.plan]}</TableCell>
                <TableCell className="whitespace-nowrap">{termLabels[r.term]}</TableCell>
                <TableCell align="right" className="whitespace-nowrap tabular-nums">
                  {fmt(r.fee, { ...yenFormat, notation: "standard" })}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDate(fromDateString(r.end))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && (
        <nav aria-label="一覧のページ" className="flex flex-wrap items-center gap-3 text-ui">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => onPage(current - 1)}>
            前の {PAGE_SIZE} 社
          </Button>
          <span className="tabular-nums">
            {current + 1} / {pages} ページ
          </span>
          <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => onPage(current + 1)}>
            次の {PAGE_SIZE} 社
          </Button>
        </nav>
      )}
    </div>
  )
}

export { AccountError, AccountSummary, useAccount, drillContext }
