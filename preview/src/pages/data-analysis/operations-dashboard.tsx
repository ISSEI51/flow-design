import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { AlertTriangle, CircleAlert, CircleCheck, CircleX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableScrollArea } from "@/patterns/table-scroll-area"
import { AnalysisRegion } from "@/patterns/analysis-region"
import { useBrowseData } from "@/patterns/browse-data"
import { Metric, MetricGroup } from "@/patterns/metric"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { SectionStack } from "@/patterns/section-layout"
import { cn } from "@/lib/utils"

import { analysisServer, request } from "../../data/data-analysis/analysis-server"
import { alertsAt, opsClock, opsTime, servicesAt, transfersAt, type ServiceState } from "../../data/data-analysis/operations"
import { countFormat, fmt, ready } from "./analysis-parts"

// Operational Dashboard（業務・リアルタイムの監視）の例：決済と請求の処理の監視。
// 考える順：対応が必要な情報（アラート）→ 現在の状態（指標）→ サービスごとの状態 → 個別の処理の進捗。
// - リアルタイムの更新（5 秒ごと）は、値をその場で書き換える。行の順序とフォーカス、スクロールの位置を変えない。
// - 新しいアラートは、すぐに一覧へ差し込まない（読んでいる位置がずれる）。件数を示し、押したときに表示する。
// - 口座振替の処理状況は、独立して取得する領域。失敗しても、ほかの領域は表示し、この領域だけを再取得できる。
// - 自動の更新は止められる。

// リアルタイムの更新の回数。検品は window.__fdOpsTicker.advance() で進める。
const listeners = new Set<() => void>()
export const opsTicker = {
  tick: 0,
  advance() {
    this.tick += 1
    listeners.forEach((l) => l())
  },
  reset() {
    this.tick = 0
    listeners.forEach((l) => l())
  },
}
declare global {
  interface Window {
    __fdOpsTicker?: typeof opsTicker
  }
}
if (typeof window !== "undefined") window.__fdOpsTicker = opsTicker

function useTick() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => opsTicker.tick,
    () => 0
  )
}

const stateText: Record<ServiceState, { label: string; icon: typeof CircleCheck; className: string }> = {
  normal: { label: "正常", icon: CircleCheck, className: "text-muted-foreground" },
  degraded: { label: "上限を超過", icon: CircleAlert, className: "text-warning" },
  down: { label: "停止のおそれ", icon: CircleX, className: "text-destructive" },
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`

export function OperationsDashboard() {
  const tick = useTick()
  const [auto, setAuto] = useState(!analysisServer.realtime.paused)
  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => {
      if (!analysisServer.realtime.paused) opsTicker.advance()
    }, analysisServer.realtime.intervalMs)
    return () => clearInterval(t)
  }, [auto])

  const services = servicesAt(tick)
  const processed = services.reduce((s, x) => s + x.processed, 0)
  // サービスごとに上限が異なるため、全体のエラー率や最も遅い応答時間ではなく、上限を超えたサービスの数で異常を示す。
  const overLimit = services.filter((s) => s.errorRate > s.errorLimit)

  // アラート：表示している一覧（shown）と、届いた一覧（latest）を分ける。
  const latest = alertsAt(tick)
  const [shownIds, setShownIds] = useState<string[]>(() => latest.map((a) => a.id))
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  const pending = latest.filter((a) => !shownIds.includes(a.id))
  const open = latest.filter((a) => shownIds.includes(a.id) && !acknowledged.includes(a.id))
  const listRef = useRef<HTMLUListElement>(null)
  const pendingFocus = useRef<number | null>(null)
  useEffect(() => {
    if (pendingFocus.current === null) return
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-ack]")
    const target = buttons?.[Math.min(pendingFocus.current, (buttons?.length ?? 1) - 1)]
    pendingFocus.current = null
    ;(target ?? document.getElementById("ops-alerts-title"))?.focus()
  })

  const transfersKey = `transfers:${tick}`
  const transfers = useBrowseData({
    query: transfersKey,
    fetcher: (_, { signal }) => request("ops-transfers", transfersKey, () => ({ ...transfersAt(tick), tick }), { signal }),
  })
  const tr = transfers.data

  return (
    <PageLayout width="wide" data-testid="analysis-operations">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>処理の監視</PageHeaderTitle>
          <PageHeaderDescription>架空のデータ。直近 15 分の値。{auto ? `${analysisServer.realtime.intervalMs / 1000} 秒ごとに更新します。` : "自動の更新を止めています。"}</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions className="items-center gap-4">
          <span className="text-caption text-muted-foreground tabular-nums" data-testid="ops-updated">
            {opsClock(opsTime(tick))} 時点
          </span>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-ui">
            <Switch checked={auto} onCheckedChange={setAuto} data-testid="ops-auto" />
            自動で更新
          </label>
          <Button variant="secondary" size="sm" onClick={() => opsTicker.advance()} data-testid="ops-refresh">
            今すぐ更新
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <SectionStack spacing="section">
        {/* 対応が必要な情報を最初に置く（Operational Dashboard の例外の順序） */}
        <section aria-labelledby="ops-alerts-title" className="flex flex-col gap-4" data-testid="ops-alerts">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="ops-alerts-title" tabIndex={-1} className="text-section outline-none">
              対応が必要なアラート <span className="tabular-nums">{open.length}件</span>
            </h2>
            {pending.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShownIds(latest.map((a) => a.id))} data-testid="ops-show-new">
                新しいアラートを表示（{pending.length}件）
              </Button>
            )}
          </div>
          {open.length === 0 ? (
            <p className="text-ui text-muted-foreground">対応が必要なアラートはありません。</p>
          ) : (
            <ul ref={listRef} className="flex flex-col">
              {open.map((a, i) => (
                <li key={a.id} data-alert-id={a.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-border py-3 last:border-b-0">
                  <div className="flex min-w-0 gap-3">
                    {a.severity === "critical" ? <CircleX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" /> : <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />}
                    <div className="min-w-0">
                      <p className="text-ui font-medium [word-break:auto-phrase]">
                        <span className={a.severity === "critical" ? "text-destructive" : "text-warning"}>{a.severity === "critical" ? "重大" : "注意"}</span>
                        <span className="mx-2 text-muted-foreground">・</span>
                        {a.title}
                      </p>
                      <p className="text-caption text-muted-foreground tabular-nums">
                        {a.service} ・ {opsClock(a.at)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="xs"
                    data-ack={a.id}
                    onClick={() => {
                      pendingFocus.current = i
                      setAcknowledged((x) => [...x, a.id])
                    }}
                  >
                    対応済みにする
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <AnalysisRegion title="現在の状態" divider status="ready" data-testid="ops-metrics">
          <MetricGroup>
            <Metric
              label="エラー率が上限を超えたサービス"
              value={ready(overLimit.length)}
              format={countFormat("件")}
              note={overLimit.length ? overLimit.map((s) => s.name).join("、") : `${services.length} サービスすべてが上限の内`}
              data-testid="ops-over-limit"
            />
            <Metric label="対応が必要なアラート" value={ready(open.length)} format={countFormat("件")} />
            <Metric label="処理件数" value={ready(processed)} format={countFormat("件")} note="直近 15 分、すべてのサービス" />
          </MetricGroup>
        </AnalysisRegion>

        <AnalysisRegion title="サービスごとの状態" divider status="ready" data-testid="ops-services">
          <TableScrollArea className="max-w-full">
            <Table>
              <TableCaption className="sr-only">サービスごとの状態</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>サービス</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead align="right">エラー率</TableHead>
                  <TableHead align="right">応答時間</TableHead>
                  <TableHead align="right">処理件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((s) => {
                  const st = stateText[s.state]
                  const Icon = st.icon
                  return (
                    <TableRow key={s.id} data-row-id={s.id} data-state={s.state}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", st.className)}>
                          <Icon aria-hidden="true" className="size-4" />
                          {st.label}
                        </span>
                      </TableCell>
                      <TableCell align="right" className="whitespace-nowrap tabular-nums">
                        <span className={s.errorRate > s.errorLimit ? "font-semibold" : undefined}>{pct(s.errorRate, 2)}</span>
                        <span className="text-caption text-muted-foreground">（上限 {pct(s.errorLimit)}）</span>
                      </TableCell>
                      <TableCell align="right" className="whitespace-nowrap tabular-nums">
                        {s.p95Ms.toLocaleString("ja-JP")}ms
                      </TableCell>
                      <TableCell align="right" className="tabular-nums">
                        {fmt(s.processed, countFormat("件"))}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableScrollArea>
        </AnalysisRegion>

        <AnalysisRegion
          title="口座振替の処理状況"
          description={`12 月分の口座振替のデータの作成。${transfers.data ? `${opsClock(opsTime(transfers.data.tick))} 時点の値。` : ""}`}
          divider
          status={transfers.status}
          error={transfers.status === "error" ? { title: "口座振替の処理状況を取得できませんでした", description: "ほかの領域は表示しています。この領域だけを再取得できます。", onRetry: transfers.reload } : null}
          data-testid="ops-transfers"
        >
          {tr ? (
            <div className="flex max-w-xl flex-col gap-3">
              <Progress value={(tr.processed / tr.total) * 100}>
                <ProgressLabel>作成済み</ProgressLabel>
                <ProgressValue>{() => `${tr.processed.toLocaleString("ja-JP")} / ${tr.total.toLocaleString("ja-JP")}件`}</ProgressValue>
              </Progress>
              <p className="text-ui text-muted-foreground tabular-nums">
                作成できなかった口座 {tr.failed.toLocaleString("ja-JP")}件（口座の情報の不備）
              </p>
            </div>
          ) : (
            <div className="h-16" />
          )}
        </AnalysisRegion>
      </SectionStack>
    </PageLayout>
  )
}
