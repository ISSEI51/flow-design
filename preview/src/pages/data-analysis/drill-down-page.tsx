import { useState } from "react"

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableScrollArea } from "@/patterns/table-scroll-area"
import { comparisonRange, describeRange, resolvePeriod, type AnalysisPeriod } from "@/patterns/analysis-period"
import { scopeFilters } from "@/patterns/analysis-query"
import { drillPeriodFor, groupOther } from "@/patterns/drill-down"

import { churnByRegion } from "../../data/data-analysis/analysis-model"
import { churnRateIn, defaultAnalysisFilters, planLabels, regionLabels, termLabels, type AnalysisFilters, type Plan, type Region, type Term } from "../../data/data-analysis/subscriptions"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import { countFormat, fmt, ratioFormat } from "./analysis-parts"
import { analysisContext, analysisContextFor } from "./business-dashboard"

// Patterns / Data Analysis / Drill-down の資料のページ。

// ---------------------------------------------------------------- 階層と条件の引き継ぎ
function HierarchyDemo() {
  const [plan, setPlan] = useState<Plan | null>("standard")
  const [term, setTerm] = useState<Term | null>(null)
  const [globalTerm, setGlobalTerm] = useState<Term | null>(null)
  const global: AnalysisFilters = { ...defaultAnalysisFilters, regions: ["kanto"], terms: globalTerm ? [globalTerm] : [] }
  const scoped = scopeFilters(global, { plans: plan ? [plan] : [], terms: term ? [term] : [] })
  const levels = ["顧客維持の分析", plan && planLabels[plan], term && termLabels[term], "企業の一覧"].filter(Boolean) as string[]
  return (
    <DemoFrame testId="dd-hierarchy">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <DemoControls legend="全体の条件：契約期間">
            <Radio name="dd-global-term" checked={globalTerm === null} onChange={() => setGlobalTerm(null)}>
              すべて
            </Radio>
            <Radio name="dd-global-term" checked={globalTerm === "annual"} onChange={() => setGlobalTerm("annual")}>
              1年契約
            </Radio>
          </DemoControls>
          <DemoControls legend="選んだプラン">
            <Radio name="dd-plan" checked={plan === null} onChange={() => setPlan(null)}>
              選ばない（階層を省略）
            </Radio>
            <Radio name="dd-plan" checked={plan === "standard"} onChange={() => setPlan("standard")}>
              スタンダード
            </Radio>
          </DemoControls>
          <DemoControls legend="選んだ契約期間">
            <Radio name="dd-term" checked={term === null} onChange={() => setTerm(null)}>
              選ばない
            </Radio>
            <Radio name="dd-term" checked={term === "monthly"} onChange={() => setTerm("monthly")}>
              月契約
            </Radio>
          </DemoControls>
        </div>
        <Breadcrumb>
          <BreadcrumbList>
            {levels.map((l, i) => (
              <span key={l} className="contents">
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  <BreadcrumbPage className={i === levels.length - 1 ? undefined : "font-normal text-muted-foreground"}>{l}</BreadcrumbPage>
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <p className="text-ui" data-testid="dd-conditions">
          {scoped.status !== "ready" ? (
            <span className="text-destructive">選んだ対象が全体の条件（契約期間：{termLabels[globalTerm!]}）に含まれません。条件を上書きせず、対象がないことを示す。</span>
          ) : (
            <>
              集計の条件：地域 関東
              {scoped.filters.plans.length > 0 && ` ・ プラン ${scoped.filters.plans.map((p) => planLabels[p]).join("、")}`}
              {scoped.filters.terms.length > 0 && ` ・ 契約期間 ${scoped.filters.terms.map((t) => termLabels[t]).join("、")}`}
            </>
          )}
        </p>
        <p className="text-caption text-muted-foreground">Breadcrumb は分析の階層、集計の条件の文は現在の絞り込みを示す。最初から明細を見たい場合は、途中の階層を省略して開いてよい。</p>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 比較期間の系列から進む
function SeriesDemo() {
  const [series, setSeries] = useState<"current" | "baseline">("current")
  const period: AnalysisPeriod = { kind: "relative", id: "this-month" }
  const current = resolvePeriod(period, analysisContext)
  const comparison = current.status === "ready" ? comparisonRange({ period: current, mode: "previous-year", context: analysisContextFor("Asia/Tokyo") }) : ({ status: "none" } as const)
  const next = drillPeriodFor(series, { period, comparison, current })
  return (
    <DemoFrame testId="dd-series">
      <div className="flex flex-col gap-4">
        <DemoControls legend="押したデータ点の系列">
          <Radio name="dd-series" checked={series === "current"} onChange={() => setSeries("current")}>
            今月（実線）
          </Radio>
          <Radio name="dd-series" checked={series === "baseline"} onChange={() => setSeries("baseline")}>
            前年同期（破線）
          </Radio>
        </DemoControls>
        <p className="text-ui" data-testid="dd-series-period">
          詳細に引き継ぐ期間：{next && next.kind === "absolute" ? `${next.from.replaceAll("-", "/")}〜${next.to.replaceAll("-", "/")}` : "—"}
          <span className="text-muted-foreground">（固定の日付。相対期間の「今月」を引き継がない）</span>
        </p>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 「その他」
function OtherDemo() {
  const range = { from: new Date(2025, 10, 1), to: new Date(2026, 9, 31) }
  const rows = churnByRegion({ range, filters: defaultAnalysisFilters })
  // 件数は加算できる（sum）。解約率は加算できないため、「その他」の地域の契約から再集計する（解約した件数 ÷ 期首の件数）
  const byCount = groupOther(rows, { limit: 3, key: (r) => r.key, label: (r) => regionLabels[r.key], value: (r) => r.churned, aggregate: "sum" })
  const otherRegions = (byCount.groups.find((g) => g.kind === "other") as { members: string[] } | undefined)?.members ?? []
  const otherRate = otherRegions.length ? churnRateIn(range, { ...defaultAnalysisFilters, regions: otherRegions as Region[] }) : null
  const rateOf = (g: (typeof byCount.groups)[number]) => (g.kind === "other" ? otherRate : (g.item.rate ?? null))
  const groups = byCount.groups
  return (
    <div className="min-w-0 max-w-full" data-testid="dd-other">
      <TableScrollArea>
      <Table>
        <TableCaption>地域別の解約した企業（{describeRange(range)}）。上位 3 地域と「その他」。「その他」の件数は合計、解約率は含まれる地域の契約から再集計した値（地域の解約率の合計ではない）</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>地域</TableHead>
            <TableHead align="right">解約した企業</TableHead>
            <TableHead align="right">解約率</TableHead>
            <TableHead>詳細に引き継ぐ条件</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <TableRow key={g.key}>
              <TableCell>{g.label}</TableCell>
              <TableCell align="right" className="tabular-nums">
                {fmt(g.value, countFormat("社"))}
              </TableCell>
              <TableCell align="right" className="tabular-nums" data-testid={g.kind === "other" ? "dd-other-rate" : undefined}>
                {fmt(rateOf(g), ratioFormat)}
              </TableCell>
              <TableCell className="text-muted-foreground" data-testid={g.kind === "other" ? "dd-other-members" : undefined}>
                地域：{g.kind === "other" ? g.members.map((m) => regionLabels[m as keyof typeof regionLabels]).join("、") : g.label}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></TableScrollArea>
    </div>
  )
}

export function DrillDownPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Analysis"
        name="Drill-down"
        lead="利用者の疑問に沿って、全体から内訳、明細、個別の詳細へ進み、元の分析に戻る。選んだ対象の条件を元の条件に加えて引き継ぎ、戻ったときに条件と位置を復元する。"
      />

      <Section title="階層と条件の引き継ぎ" lead="元の分析の条件（期間、絞り込み、比較）を保ち、選んだ対象の条件を加える。条件が重ならない場合は、無条件に上書きしない。">
        <HierarchyDemo />
      </Section>

      <Section title="比較期間の系列から進む" lead="比較期間の側のデータ点から進む場合は、現在の期間と誤認させず、その系列の期間を引き継ぐ。">
        <SeriesDemo />
      </Section>

      <Section title="「その他」から進む" lead="表示の文字（「その他」）ではなく、実際に含まれる分類で絞り込む。">
        <OtherDemo />
      </Section>

      <Section title="表示の方法">
        <Rules
          rows={[
            ["同じ画面", "簡単な内訳や関連するデータ（Breakdown の領域、表の行の展開）"],
            ["非モーダルの Sheet", "元の分析を見ながら詳細を確かめる（検証画面の解約した企業の行）。前後の移動は、元の一覧の並び順と一致させる"],
            ["別のページ", "本格的な詳細の分析（プラン別、契約期間別、企業の詳細）。Breadcrumb で階層を示す"],
            ["Popover", "短い補足（指標の定義）。複雑な分析の画面を Popover の中に作らない"],
            ["モバイル", "全画面の Sheet か別のページ。狭い画面に Split View を無理に収めない。小さなデータ点だけに頼るタッチの操作を避ける"],
          ]}
        />
      </Section>

      <Section title="判断基準">
        <Rules
          rows={[
            ["開始の操作", "KPI、グラフの数値の表、表の行から進めるようにする。押せることを、押す前に文字とリンクの形で示す。すべてのグラフの要素にアイコンを付けない。ホバーだけの操作にしない"],
            ["Cross-filtering との区別", "Cross-filtering は同じ画面の対象を変え、Drill-down は具体的な画面へ進む。1 回のクリックで両方を実行しない（検証画面では、棒の選択とリンクを別の要素にしている）"],
            ["戻る", "分析の対象の期間、全体・個別の条件、比較、集計単位、グラフの設定、表の並び順とページ、選択、スクロールの位置、操作元へのフォーカスを復元する。データは最新を取得し直してよい。操作元がない場合は、近い見出しにフォーカスする"],
            ["連続した確認", "選んだ対象が素早く切り替わった場合に、前の対象の詳細を表示しない（useBrowseData の keepPreviousData: false）"],
            ["集計と明細の整合", "期間、絞り込み、集計の時点、指標の定義、単位、母集団をそろえる。企業の数と契約の数を混同しない。割合や平均は、明細の合計で再現できない場合がある"],
            ["権限", "集計と明細の閲覧の権限を分ける。権限のない明細をクライアントに渡して隠す方式にしない（サーバーが除き、件数だけを返す）。件数が集計と異なる理由を示す"],
            ["業務画面への移動", "分析の対象の条件を引き継いで業務画面へ移る。分析の画面に編集の機能を加えない。引き継いだ条件を、操作の権限や一括の処理の対象として信頼しない（バックエンドが確かめる）"],
          ]}
        />
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "詳細へ進む要素はリンク（a）。Sheet を開く要素はボタン（aria-haspopup=\"dialog\"）。",
            "グラフの上の操作が難しい場合は、数値の表のリンクから同じ詳細へ進める（「数値を表で見る」）。",
            "戻ったときは、操作元のリンクやボタンにフォーカスを戻す。AppShellMain の「h1 へフォーカス」は、復元する間は止める。",
            "Sheet には、対象の名前と一覧の中の位置（「12 / 84 件目」）を示す。",
          ]}
        />
        <div className="mt-6">
          <AppLink href="#/analysis-app?page=retention">検証画面（顧客維持の分析）で、詳細へ進んで戻る</AppLink>
        </div>
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="棒を押すと、同じ画面を絞り込み、さらに別のページへ移動する例">
              <div className="flex items-end gap-2">
                <span className="h-10 w-6 rounded-sm bg-chart-1" />
                <span className="h-6 w-6 rounded-sm bg-border" />
                <span className="h-8 w-6 rounded-sm bg-border" />
              </div>
              <span className="text-caption text-muted-foreground">棒を押す → 絞り込み ＋ 企業の一覧へ移動</span>
            </Mock>
          }
          badNote="絞り込みたいだけの利用者が、意図せず別の画面に移動する。"
          good={
            <Mock label="棒の選択で絞り込み、別のリンクで企業の一覧へ進む例">
              <div className="flex items-end gap-2">
                <span className="h-10 w-6 rounded-sm bg-chart-1" />
                <span className="h-6 w-6 rounded-sm bg-border" />
                <span className="h-8 w-6 rounded-sm bg-border" />
              </div>
              <span className="text-caption underline underline-offset-4">スタンダードの内訳を見る ›</span>
            </Mock>
          }
          goodNote="選択（絞り込み）と移動（Drill-down）を別の操作にする。"
        />
      </Section>
    </article>
  )
}
