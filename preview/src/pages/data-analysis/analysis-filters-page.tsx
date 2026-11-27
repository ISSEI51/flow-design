import { useState } from "react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableScrollArea } from "@/patterns/table-scroll-area"
import { AnalysisPeriodFilter, ComparisonSelect, GranularitySelect } from "@/patterns/analysis-controls"
import { buildBuckets, describeRange, granularityLabels, hoursInDay, toInstantRange, type WeekStartsOn } from "@/patterns/analysis-period"
import { fromDateString, makeDate } from "@/lib/date"
import { scopeFilters, useAnalysisQuery } from "@/patterns/analysis-query"

import { defaultAnalysisFilters, newAccountsIn, planLabels, plans, regionLabels, regions, type AnalysisFilters, type Plan, type Region } from "../../data/data-analysis/subscriptions"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import { analysisContext } from "./business-dashboard"

// Patterns / Data Analysis / Analysis Filters の資料のページ。

// ---------------------------------------------------------------- 期間、集計単位、比較
function PeriodDemo() {
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(1)
  const context = { ...analysisContext, weekStartsOn }
  const a = useAnalysisQuery<AnalysisFilters>({
    defaultQuery: { period: { kind: "relative", id: "this-month" }, comparison: "previous-month", filters: defaultAnalysisFilters },
    context,
  })
  const p = a.period
  const buckets = p.status === "ready" ? buildBuckets(p.range, a.query.granularity, context) : []
  const tokyo = p.status === "ready" ? toInstantRange(p.range, "Asia/Tokyo") : null
  const la = p.status === "ready" ? toInstantRange(p.range, "America/Los_Angeles") : null
  const total = buckets.reduce((s, b) => s + (newAccountsIn(b, defaultAnalysisFilters) ?? 0), 0)
  return (
    <DemoFrame testId="af-period">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <AnalysisPeriodFilter
            value={a.query.period}
            onValueChange={a.setPeriod}
            presets={["today", "this-week", "last-week", "this-month", "last-month", "last-30-days", "last-90-days", "this-quarter", "this-fiscal-year"]}
            resolved={p}
            context={context}
          />
          <GranularitySelect value={a.query.granularity} onValueChange={a.setGranularity} options={a.granularities} />
          <ComparisonSelect value={a.query.comparison} onValueChange={(m) => a.setComparison(m)} options={["previous-month", "previous-year", "previous-period", "none"]} comparison={a.comparison} />
        </div>
        <DemoControls legend="週の始まり（製品の設定）">
          <Radio name="af-week" checked={weekStartsOn === 1} onChange={() => setWeekStartsOn(1)}>
            月曜日
          </Radio>
          <Radio name="af-week" checked={weekStartsOn === 0} onChange={() => setWeekStartsOn(0)}>
            日曜日
          </Radio>
        </DemoControls>
        <p role="status" className="min-h-5 text-ui" data-testid="af-notice">
          {a.notice}
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-ui sm:grid-cols-[12rem_1fr]" data-testid="af-resolved">
          <dt className="text-muted-foreground">期間の種類</dt>
          <dd>{a.query.period.kind === "relative" ? "相対期間（保存すると、使う日の「今日」から決まる）" : "固定の期間（保存しても変わらない）"}</dd>
          <dt className="text-muted-foreground">集計単位</dt>
          <dd data-testid="af-granularity">
            {granularityLabels[a.query.granularity]}（{a.query.granularityMode === "manual" ? "手動で選択" : "期間に合わせて自動"}）・ {buckets.length} 区間
            {buckets.some((b) => b.partial) && "（期間の境界で切られた区間を含む）"}
          </dd>
          <dt className="text-muted-foreground">新規の契約の合計</dt>
          <dd className="tabular-nums" data-testid="af-total">
            {total}件（集計単位を変えても同じ）
          </dd>
          <dt className="text-muted-foreground">バックエンドへ渡す期間</dt>
          <dd className="flex flex-col gap-1 tabular-nums [overflow-wrap:anywhere]" data-testid="af-instant">
            <span>[{tokyo?.start}, {tokyo?.end})（Asia/Tokyo）</span>
            <span className="text-muted-foreground">[{la?.start}, {la?.end})（America/Los_Angeles）</span>
          </dd>
        </dl>
        <div className="min-w-0 max-w-full">
          <TableScrollArea>
          <Table density="compact">
            <TableCaption className="sr-only">集計の区間</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>区間</TableHead>
                <TableHead>日付</TableHead>
                <TableHead>状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.slice(0, 12).map((b) => (
                <TableRow key={`${b.key}:${b.hour ?? ""}`}>
                  <TableCell>{b.fullLabel}</TableCell>
                  <TableCell className="tabular-nums">{describeRange(b)}</TableCell>
                  <TableCell className="text-muted-foreground">{[b.partial && "期間の一部", b.inProgress && "途中の区間"].filter(Boolean).join("、") || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></TableScrollArea>
          {buckets.length > 12 && <p className="mt-2 text-caption text-muted-foreground">ほか {buckets.length - 12} 区間</p>}
        </div>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 時間別の区間とタイムゾーン
const tzCases: [string, string, string][] = [
  ["Asia/Tokyo", "2026-11-25", "日本（夏時間なし）"],
  ["America/New_York", "2026-03-08", "ニューヨーク：夏時間の開始（23 時間）"],
  ["America/New_York", "2026-11-01", "ニューヨーク：夏時間の終了（25 時間）"],
  ["Europe/Berlin", "2026-10-25", "ベルリン：夏時間の終了（25 時間）"],
  ["Asia/Kathmandu", "2026-11-25", "カトマンズ：UTC+5:45"],
  ["Australia/Lord_Howe", "2026-10-04", "ロード・ハウ島：30 分の夏時間（23.5 時間）"],
]

function TimeZoneDemo() {
  const [i, setI] = useState(2)
  const [tz, date, name] = tzCases[i]
  const d = fromDateString(date)!
  const buckets = buildBuckets({ from: d, to: d }, "hour", { today: makeDate(2030, 1, 1)!, timeZone: tz })
  return (
    <DemoFrame testId="af-timezone">
      <div className="flex flex-col gap-4">
        <DemoControls legend="集計のタイムゾーンと日付（製品が明示的に渡す）">
          {tzCases.map(([, , label], k) => (
            <Radio key={label} name="af-tz" checked={i === k} onChange={() => setI(k)}>
              {label}
            </Radio>
          ))}
        </DemoControls>
        <p className="text-ui" data-testid="af-tz-summary">
          {name}：{date.replaceAll("-", "/")} は {hoursInDay(date, tz)} 時間、時間別の区間は {buckets.length} 個
        </p>
        <div className="min-w-0 max-w-full">
          <TableScrollArea>
          <Table density="compact" data-testid="af-tz-table">
            <TableCaption className="sr-only">時間別の区間</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>区間</TableHead>
                <TableHead>開始の時刻（キー）</TableHead>
                <TableHead align="right">長さ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.map((b) => (
                <TableRow key={b.key}>
                  <TableCell className="whitespace-nowrap">{b.label}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{b.key}</TableCell>
                  <TableCell align="right" className="whitespace-nowrap tabular-nums">
                    {b.durationMinutes}分{b.partial && <span className="text-caption text-muted-foreground">（夏時間）</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></TableScrollArea>
        </div>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 全体条件と個別条件
function ScopeDemo() {
  const [region, setRegion] = useState<Region | "all">("kanto")
  const [globalPlan, setGlobalPlan] = useState<Plan | "all">("all")
  const [localPlan, setLocalPlan] = useState<Plan | "all">("standard")
  const global: AnalysisFilters = { ...defaultAnalysisFilters, regions: region === "all" ? [] : [region], plans: globalPlan === "all" ? [] : [globalPlan] }
  const scoped = scopeFilters(global, { plans: localPlan === "all" ? [] : [localPlan] })
  const describe = (f: AnalysisFilters) =>
    [f.regions.length ? `地域：${f.regions.map((r) => regionLabels[r]).join("、")}` : "すべての地域", f.plans.length ? `プラン：${f.plans.map((p) => planLabels[p]).join("、")}` : "すべてのプラン"].join(" ・ ")
  const select = <T extends string>(id: string, label: string, value: T | "all", onChange: (v: T | "all") => void, options: [T, string][], allLabel: string) => (
    <div className="flex flex-col gap-1">
      <span id={id} className="text-caption text-muted-foreground">
        {label}
      </span>
      <Select<string> items={[{ value: "all", label: allLabel }, ...options.map(([v, l]) => ({ value: v as string, label: l }))]} value={value as string} onValueChange={(v) => onChange((v ?? "all") as T | "all")}>
        <SelectTrigger aria-labelledby={id} size="sm" className="w-44 text-ui" data-testid={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
  return (
    <DemoFrame testId="af-scope">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-6">
          <div role="group" aria-label="ページ全体の条件" className="flex flex-wrap gap-4">
            {select("af-global-region", "全体：地域", region, setRegion, regions.map((r) => [r, regionLabels[r]]), "すべての地域")}
            {select("af-global-plan", "全体：プラン", globalPlan, setGlobalPlan, plans.map((p) => [p, planLabels[p]]), "すべてのプラン")}
          </div>
          <div role="group" aria-label="グラフだけの条件" className="flex flex-wrap gap-4">
            {select("af-local-plan", "このグラフ：プラン", localPlan, setLocalPlan, plans.map((p) => [p, planLabels[p]]), "絞り込まない")}
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-ui sm:grid-cols-[12rem_1fr]" data-testid="af-scope-result">
          <dt className="text-muted-foreground">全体の条件</dt>
          <dd>{describe(global)}</dd>
          <dt className="text-muted-foreground">このグラフに適用する条件</dt>
          <dd data-testid="af-scope-effective">
            {scoped.status !== "ready" ? (
              <span className="text-destructive">全体の条件と重ならないため、このグラフに表示できる対象はありません（全体の条件を上書きしません）</span>
            ) : (
              <>
                {describe(scoped.filters)}
                {scoped.narrowed.length > 0 && <span className="text-muted-foreground">（全体の条件を引き継ぎ、さらに絞り込み）</span>}
              </>
            )}
          </dd>
        </dl>
      </div>
    </DemoFrame>
  )
}

const operations: [string, string, string][] = [
  ["Filter", "分析の対象を絞り込む（行が減る）", "地域：関東、プラン：スタンダード"],
  ["Group by", "集計の軸を変える（同じ対象を分ける）", "プラン別、契約期間別"],
  ["Granularity", "時間の単位を変える（合計は変わらない）", "日別、週別、月別"],
  ["Metric", "表示する指標を切り替える", "MRR、契約企業数"],
  ["View", "表示の形式を変える", "グラフ、表"],
  ["Comparison", "比べる条件を変える", "前月、前年同期"],
]

export function AnalysisFiltersPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Analysis"
        name="Analysis Filters"
        lead="分析の対象と期間を決める。ページ全体の条件と、グラフや表だけの条件の適用範囲を明確にし、絞り込み、集計の軸、集計単位を別の操作として扱う。"
      />

      <Section title="期間、集計単位、比較" lead="プリセットはすぐに適用する。期間の指定は「この期間で集計」で適用する（片方の日付だけを変えた途中の期間で集計しない）。今日より後の日は選べない。期間と集計単位は別に持ち、手動で選んだ集計単位は使える限り維持する。">
        <PeriodDemo />
      </Section>

      <Section title="時間別の区間とタイムゾーン" lead="時間別の区間は、集計のタイムゾーンのローカル時刻の「時」で区切った実際の区間（半開区間）。夏時間の開始日は存在しない時刻の区間を作らず（23 区間）、終了日は同じ時刻を時差で区別する（25 区間）。">
        <TimeZoneDemo />
      </Section>

      <Section title="全体条件と個別条件" lead="個別条件は全体条件を引き継ぎ、さらに絞り込む。重ならない場合は、全体条件を黙って上書きせず、表示できる対象がないことを示す。">
        <ScopeDemo />
      </Section>

      <Section title="操作の区別" lead="次の 6 つは別の操作。1 つのフィルターのメニューにまとめない。">
        <Rules rows={operations.map(([name, what, ex]) => [name, `${what}。例：${ex}`])} />
      </Section>

      <Section title="判断基準">
        <Rules
          rows={[
            ["配置", "全体の条件は Page Header の直下。グラフや表だけの条件は、その見出しの右。同じ条件の選択欄を各グラフに繰り返さない"],
            ["例外の条件", "全体の期間と異なる期間（過去 24 か月の推移など）を使う領域は、その見出しの近くで「ページの期間とは別」と示す"],
            ["表示", "期間とよく使う条件は常に表示する。使う頻度の低い条件は Popover や Sheet にまとめ、適用中の隠れた条件だけを Chip で示す（見えている条件を重ねて示さない）"],
            ["適用", "原則はすぐに適用する。複雑な条件や重い集計は、まとめて適用し、キャンセルで未適用の変更を破棄できる。古い応答で新しい条件の結果を上書きしない（useBrowseData）"],
            ["相対期間と固定の期間", "「今月」を保存すると、翌月はその月を指す。開始日と終了日を保存すると固定の期間になる。再現が必要な共有の URL や報告には、固定の期間か集計の基準日を使う"],
            ["時間の定義", "タイムゾーン、週の始まり、暦月と会計期間、期間の端を含むか、相対期間の基準の時刻、途中の期間を一貫させる。バックエンドへは半開区間 [開始日 0 時, 終了日の翌日 0 時) で渡す。夏時間で 1 日が 23 時間や 25 時間になる"],
            ["Cross-filtering", "分析に意味がある場合だけ提供する。選んだ要素、影響を受ける領域、解除の方法を示す。選択元のグラフには適用しない。ホバーだけで選ばない"],
            ["保持と共有", "詳細から戻ったら元の条件を復元する。URL と保存は製品の責務。個人情報を含む条件を URL に入れない。アカウントやワークスペースを変えたら、古い条件とデータを持ち越さない"],
            ["モバイル", "期間を常に表示し、ほかの条件は Drawer や Sheet にまとめる。適用中の条件と解除の方法を示す"],
          ]}
        />
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "全体の条件と個別の条件を、名前の付いたグループ（role=\"group\"）に分ける。",
            "集計単位を自動で変えたときは、role=\"status\" の文で知らせる。",
            "Cross-filtering の選択は aria-pressed のボタンで、キーボードとタッチで選べる。解除は Chip のボタン。",
            "期間の入力の誤りは、入力欄に関連付けた文で示す（Date Picker の仕様）。",
          ]}
        />
        <div className="mt-6">
          <AppLink href="#/analysis-app?page=retention">検証画面（顧客維持の分析）で確かめる</AppLink>
        </div>
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="期間、集計単位、指標、表示形式を 1 つのフィルターのメニューにまとめた例">
              <span className="rounded-md border border-border px-3 py-1 text-ui">フィルター（6）</span>
              <span className="text-caption text-muted-foreground">期間 ・ 地域 ・ 集計単位 ・ 指標 ・ 表示形式 ・ 比較</span>
            </Mock>
          }
          badNote="何が対象を絞り込み、何が表示だけを変えるのかがわからない。"
          good={
            <Mock label="期間と比較をページの上部に、集計単位をグラフの右に置いた例">
              <div className="flex gap-2">
                <span className="rounded-md border border-border px-2 py-1 text-caption">今月</span>
                <span className="rounded-md border border-border px-2 py-1 text-caption">前月と比較</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ui font-semibold">解約率の推移</span>
                <span className="rounded-md border border-border px-2 py-1 text-caption">月別</span>
              </div>
            </Mock>
          }
          goodNote="ページ全体の条件と、グラフだけの設定を、置く場所で区別する。"
        />
      </Section>
    </article>
  )
}
