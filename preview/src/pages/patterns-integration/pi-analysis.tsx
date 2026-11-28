import { useEffect, useRef, useState, type MouseEvent } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAppShell } from "@/patterns/app-shell"
import { AnalysisRegion, AnalysisScopeNote } from "@/patterns/analysis-region"
import { useAnalysisQuery } from "@/patterns/analysis-query"
import { describeRange, type PeriodContext } from "@/patterns/analysis-period"
import { useBrowseData } from "@/patterns/browse-data"
import { DrillDownLink, captureAnalysisPosition, useAnalysisPositionRestore, type AnalysisPosition } from "@/patterns/drill-down"
import { Metric, MetricGroup } from "@/patterns/metric"
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { PageLayout } from "@/patterns/page-layout"
import { Section, SectionHeader, SectionTitle } from "@/patterns/section-layout"

import {
  conditionsText,
  metricLabel,
  planLabel,
  plans,
  regions,
  statusLabel,
  yen,
  type AnalysisConditions,
  type MetricId,
} from "../../data/patterns-integration/model"
import { fetchMetricDetails, fetchSummary } from "../../data/patterns-integration/server"
import { ProtectedContent, usePi } from "./pi-context"
import { PiBreadcrumb } from "./pi-parts"
import { piHref } from "./pi-router"

// 分析（Dashboard）と、指標の明細（Drill-down）。製品側のコードの例。
// - 条件は useAnalysisQuery（期間は固定、絞り込みは地域とプラン）。URL（region、plan）に持つ。
// - 指標と明細は、同じ顧客のデータから計算する（model.ts の summarize と fetchMetricDetails）。
// - 再取得の間は、前の結果と、その結果の計算に使った条件（応答に含めた conditions）を staleLabel で示す。
// - 明細へのリンクは、表示中の結果の計算に使った条件で作る（入力中・取得中の新しい条件ではない）。
// - 明細から戻ったとき（back=1）は、同じスコープと同じ条件の場合だけ、操作元へフォーカスとスクロールを戻す。

const PERIOD = { kind: "absolute" as const, from: "2026-11-01", to: "2026-11-28" }
const context: PeriodContext = { today: new Date(2026, 10, 28), timeZone: "Asia/Tokyo" }

export const conditionParams = (c: AnalysisConditions) => ({ region: c.region, plan: c.plan })
export const conditionsFrom = (params: URLSearchParams): AnalysisConditions => {
  const region = params.get("region")
  const plan = params.get("plan")
  return {
    region: region && (regions as readonly string[]).includes(region) ? region : null,
    plan: plan && plans.some((p) => p.value === plan) ? plan : null,
  }
}
const condKey = (c: AnalysisConditions) => JSON.stringify([c.region, c.plan])

// 分析の画面から明細へ移る前の位置（メモリだけ。製品は履歴の項目ごとに保存する）
let analysisSnapshot: { scope: string; cond: string; position: AnalysisPosition } | null = null

function ConditionSelect({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  value: string | null
  options: { value: string; label: string }[]
  onChange: (v: string | null) => void
  testId: string
}) {
  const items = [{ value: "all", label: "すべて" }, ...options]
  return (
    <label className="flex min-w-0 flex-col gap-2 text-ui font-medium">
      {label}
      <Select items={items} value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? null : String(v))}>
        <SelectTrigger className="w-full min-w-40 sm:w-48" data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

export function AnalysisScreen({ params }: { params: URLSearchParams }) {
  const { ws, scope, dataScope, nav, outageSeq } = usePi()
  const { mainRef } = useAppShell()
  const root = useRef<HTMLDivElement>(null)
  const initialCond = conditionsFrom(params)
  const a = useAnalysisQuery<AnalysisConditions>({
    defaultQuery: { period: PERIOD, comparison: "none", filters: { region: null, plan: null } },
    initialQuery: { filters: initialCond },
    context,
    // 条件は URL に持つ。履歴の項目は増やさない（戻る操作で、条件の変更を 1 つずつ戻さない）
    onQueryChange: (q) =>
      window.history.replaceState(window.history.state, "", piHref("analysis", { ws: ws === "hq" ? null : ws, ...conditionParams(q.filters) })),
  })
  const cond = a.query.filters
  const summary = useBrowseData({
    query: a.key ?? "",
    enabled: a.key !== null,
    scopeKey: dataScope,
    // 応答に、計算に使った条件（conditions）を含める。表示中の結果の条件は、この値から示す
    fetcher: (_key, { signal }) => fetchSummary(ws, cond, signal),
  })
  // 接続が回復したら、安全な取得（表示中の指標）を再開する。変更の操作は再実行しない
  const { reload: reloadSummary } = summary
  const seenOutage = useRef(outageSeq)
  useEffect(() => {
    if (outageSeq === seenOutage.current) return
    seenOutage.current = outageSeq
    reloadSummary()
  }, [outageSeq, reloadSummary])
  const shown = summary.data
  const st = summary.status === "idle" ? "loading" : summary.status
  const stale = summary.status === "refreshing" && shown ? conditionsText(shown.conditions) : null

  // 描画の中では記録を読むだけにし、使い終えたことは commit の後に記録する
  const [snapshotUsed] = useState(() => {
    const s = analysisSnapshot
    return params.get("back") === "1" && s && s.scope === scope && s.cond === condKey(initialCond) ? s : null
  })
  useEffect(() => {
    if (snapshotUsed && analysisSnapshot === snapshotUsed) analysisSnapshot = null
  }, [snapshotUsed])
  const restore = snapshotUsed?.position ?? null
  useAnalysisPositionRestore({
    position: restore,
    ready: summary.isCurrent,
    root,
    scrollElement: mainRef,
    fallbackFocus: () => root.current?.querySelector<HTMLElement>("h1") ?? null,
  })

  const shownCond = shown?.conditions ?? cond
  const detailsHref = (metric: MetricId, region?: string) =>
    piHref("metric", { ws: ws === "hq" ? null : ws, metric, ...conditionParams({ ...shownCond, region: region ?? shownCond.region }) })
  const drill = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    analysisSnapshot = { scope, cond: condKey(shownCond), position: captureAnalysisPosition({ scrollElement: mainRef.current, origin: e.currentTarget, root: root.current }) }
    nav.navigate(href)
  }
  const value = (v: number | undefined) =>
    st === "loading" ? ({ status: "loading" } as const) : st === "error" ? ({ status: "unavailable" } as const) : ({ status: "ready", value: v ?? null } as const)
  const metricIds: MetricId[] = ["revenue", "active", "paused"]

  return (
    <PageLayout width="wide" data-testid="pi-analysis">
      <div ref={root} className="flex min-w-0 flex-col gap-8">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>分析</PageHeaderTitle>
            <PageHeaderDescription>
              {a.period.status === "ready" ? describeRange(a.period.range) : ""}（基準時刻 2026/11/28 9:00）
            </PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
        <div role="group" aria-label="ページ全体の条件" className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-4">
          <ConditionSelect label="地域" value={cond.region} options={regions.map((r) => ({ value: r, label: r }))} onChange={(region) => a.setFilters({ region })} testId="analysis-region" />
          <ConditionSelect label="プラン" value={cond.plan} options={plans.map((p) => ({ value: p.value, label: p.label }))} onChange={(plan) => a.setFilters({ plan })} testId="analysis-plan" />
        </div>
        <ProtectedContent label="分析">
          <AnalysisRegion
            title="主要な指標"
            status={st}
            staleLabel={stale}
            data-testid="analysis-metrics"
            // 影響の範囲は、画面の上部の知らせ（SystemBanner）で示す。ここでは同じ説明を繰り返さない
            error={st === "error" ? { title: "主要な指標を取得できませんでした", onRetry: summary.reload } : null}
            // 集計の条件の注記は、表示中の結果が現在の条件の結果のときだけ示す（再取得中は staleLabel が条件を示す。失敗の後は結果を示さない）
            conditions={st === "ready" && shown && (shown.conditions.region || shown.conditions.plan) ? <AnalysisScopeNote>{conditionsText(shown.conditions)}で集計しています。</AnalysisScopeNote> : null}
          >
            <MetricGroup>
              {metricIds.map((m) => (
                <Metric
                  key={m}
                  label={metricLabel[m]}
                  value={value(shown?.metrics[m])}
                  format={m === "revenue" ? { style: "currency", unit: "円" } : { style: "number", unit: "件" }}
                  data-testid={`metric-${m}`}
                  action={
                    shown && (
                      <DrillDownLink origin={`metric-${m}`} href={detailsHref(m)} onClick={drill(detailsHref(m))}>
                        {/* 3 つの指標のリンクを区別できる名前にする（見た目の文は短く保つ） */}
                        <span className="sr-only">{metricLabel[m]}の</span>明細を見る
                      </DrillDownLink>
                    )
                  }
                />
              ))}
            </MetricGroup>
            {/* 同じ取得の結果のため、別の領域にせず、同じ領域の中に置く（更新中と条件の表示を 1 回にする） */}
            <Section className="mt-12" data-testid="analysis-regions">
              <SectionHeader>
                <SectionTitle>地域ごとの月額の売上</SectionTitle>
              </SectionHeader>
            <Table data-scroll-key="regions">
              <TableHeader>
                <TableRow>
                  <TableHead>地域</TableHead>
                  <TableHead className="text-right">契約中の顧客</TableHead>
                  <TableHead className="text-right">月額の売上</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(shown?.byRegion ?? []).map((r) => (
                  <TableRow key={r.region}>
                    <TableCell>
                      <DrillDownLink origin={`region-${r.region}`} href={detailsHref("revenue", r.region)} onClick={drill(detailsHref("revenue", r.region))}>
                        {r.region}
                      </DrillDownLink>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.active.toLocaleString("ja-JP")}件</TableCell>
                    <TableCell className="text-right tabular-nums">{yen(r.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </Section>
          </AnalysisRegion>
        </ProtectedContent>
      </div>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 明細
export function MetricDetailsScreen({ params }: { params: URLSearchParams }) {
  const { ws, dataScope, nav } = usePi()
  const metricParam = params.get("metric")
  const metric: MetricId = metricParam === "active" || metricParam === "paused" ? metricParam : "revenue"
  // 分析の画面で、表示中の結果の計算に使った条件（URL）をそのまま使う。見た目の文から条件を作り直さない
  const cond = conditionsFrom(params)
  const wsParam = ws === "hq" ? null : ws
  const details = useBrowseData({
    query: JSON.stringify([metric, cond]),
    scopeKey: dataScope,
    fetcher: (_k, { signal }) => fetchMetricDetails(ws, metric, cond, signal),
  })
  const list = details.data ?? []
  const total = metric === "revenue" ? yen(list.reduce((s, c) => s + c.mrr, 0)) : `${list.length.toLocaleString("ja-JP")}件`
  const st = details.status === "idle" ? "loading" : details.status
  const analysisHref = piHref("analysis", { ws: wsParam, ...conditionParams(cond), back: "1" })
  const here = { from: "metric", metric, ...conditionParams(cond) }
  return (
    <PageLayout width="standard" data-testid="pi-metric">
      <PageHeader>
        <div className="basis-full">
          <PiBreadcrumb items={[{ label: "分析", href: analysisHref }]} current={`${metricLabel[metric]}の明細`} />
        </div>
        <PageHeaderContent>
          <PageHeaderTitle>{metricLabel[metric]}の明細</PageHeaderTitle>
          <PageHeaderDescription data-testid="metric-conditions">
            {conditionsText(cond)}、状態：{statusLabel[metric === "paused" ? "paused" : "active"]}
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      <ProtectedContent label="明細">
        <AnalysisRegion title="対象の顧客" status={st} error={st === "error" ? { title: "明細を取得できませんでした", onRetry: details.reload } : null} data-testid="metric-details">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>顧客</TableHead>
                <TableHead>地域</TableHead>
                <TableHead>プラン</TableHead>
                <TableHead className="text-right">月額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id} data-row-id={c.id}>
                  <TableCell>
                    <a {...nav.linkProps(piHref("customer", { ws: wsParam, id: c.id, ...here }))} className="font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring">
                      {c.name}
                    </a>
                  </TableCell>
                  <TableCell>{c.region}</TableCell>
                  <TableCell>{planLabel(c.plan)}</TableCell>
                  <TableCell className="text-right tabular-nums">{yen(c.mrr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>合計（{list.length.toLocaleString("ja-JP")}件）</TableCell>
                <TableCell className="text-right tabular-nums" data-testid="metric-total">
                  {total}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </AnalysisRegion>
      </ProtectedContent>
    </PageLayout>
  )
}
