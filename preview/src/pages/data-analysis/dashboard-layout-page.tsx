import { useState } from "react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AnalysisRegion } from "@/patterns/analysis-region"
import { useBrowseData } from "@/patterns/browse-data"
import { Metric, MetricGroup } from "@/patterns/metric"
import { PageColumns } from "@/patterns/page-layout"

import { request, analysisServer } from "../../data/data-analysis/analysis-server"
import { activeOn, ANALYSIS_TODAY, churnRateIn, defaultAnalysisFilters, mrrBridge, operatingProfitIn, regionLabels, regions } from "../../data/data-analysis/subscriptions"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets, S, Schematic } from "../app-structure/parts"
import { AppLink, DemoFrame, Mock, Rules } from "../data-browsing/doc-parts"
import { DiffBarChart, countFormat, ratioFormat, yenFormat } from "./analysis-parts"
import { loadable } from "./business-dashboard"
import { cn } from "@/lib/utils"

// Patterns / Data Analysis / Dashboard Layout の資料のページ。

const types = [
  {
    id: "business",
    name: "Strategic Dashboard",
    purpose: "経営・意思決定。現在の状況と推移を厚くする",
    order: ["主要な指標と目標", "推移（全幅）", "増減の要因（メイン＋補足）", "収益性（Chart＋Table）", "期間の比較", "次にすること"],
  },
  {
    id: "retention",
    name: "Analytical Dashboard",
    purpose: "分析・原因の究明。内訳と明細を厚くする",
    order: ["解約の状況", "推移と集計単位", "内訳（均等な 2 列、同じ軸）", "明細の表", "業務画面への移動"],
  },
  {
    id: "operations",
    name: "Operational Dashboard",
    purpose: "業務・リアルタイムの監視。対応が必要な情報を先頭に置く",
    order: ["対応が必要なアラート", "現在の状態", "サービスごとの状態", "個別の処理の進捗"],
  },
]

function TypesDemo() {
  return (
    <div className="grid gap-10 @container/page sm:grid-cols-3 sm:gap-8" data-testid="dl-types">
      {types.map((t) => (
        <div key={t.id} className="flex min-w-0 flex-col gap-3">
          <h3 className="text-heading">{t.name}</h3>
          <p className="text-ui text-muted-foreground">{t.purpose}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-ui">
            {t.order.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ol>
          <AppLink href={`#/analysis-app?page=${t.id}`}>検証画面で開く</AppLink>
        </div>
      ))}
    </div>
  )
}

function LayoutsDemo() {
  const box = (className?: string) => <div className={cn("rounded-sm bg-muted", className)} />
  const items: [string, string, React.ReactNode][] = [
    ["全幅", "長い期間の推移、列の多い表", <div className="flex flex-1 flex-col gap-2 p-3">{box("h-full")}</div>],
    ["均等な複数の列", "同じ重要度の情報の比較。高さ、軸、単位をそろえる", <div className="grid flex-1 grid-cols-2 gap-2 p-3">{box()}{box()}</div>],
    ["メイン＋補足", "主要なグラフと、その内訳や件数", <div className="grid flex-1 grid-cols-[2fr_1fr] gap-2 p-3">{box()}<div className="flex flex-col gap-2"><div className={S.line} /><div className={cn(S.line, "w-2/3")} /></div></div>],
    ["Chart＋Table", "傾向から具体的なデータへ進む", <div className="flex flex-1 flex-col gap-2 p-3">{box("h-12")}<div className={S.line} /><div className={S.line} /><div className={cn(S.line, "w-3/4")} /></div>],
  ]
  return (
    <div className="grid gap-6 sm:grid-cols-2" data-testid="dl-layouts">
      {items.map(([name, use, schema]) => (
        <div key={name} className="flex min-w-0 flex-col gap-2">
          <Schematic label={`${name}の構成`}>{schema}</Schematic>
          <p className="text-ui font-medium">{name}</p>
          <p className="text-caption text-muted-foreground">{use}</p>
        </div>
      ))}
    </div>
  )
}

// 独立した領域：個別に読み込み、失敗し、再取得する。
function RegionsDemo() {
  const [failA, setFailA] = useState(false)
  const [token, setToken] = useState(0)
  const range = { from: new Date(ANALYSIS_TODAY.getFullYear(), ANALYSIS_TODAY.getMonth(), 1), to: ANALYSIS_TODAY }
  const a = useBrowseData({
    query: `a:${token}`,
    fetcher: (k, { signal }) => {
      if (failA) analysisServer.failNext.overview = true
      return request("overview", k, () => activeOn(ANALYSIS_TODAY, defaultAnalysisFilters), { signal })
    },
  })
  const b = useBrowseData({
    query: `b:${token}`,
    fetcher: (k, { signal }) => request("retention", k, () => churnRateIn(range, defaultAnalysisFilters), { signal }),
  })
  return (
    <DemoFrame testId="dl-regions">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3 text-ui">
          <label className="flex min-h-10 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={failA} onChange={(e) => setFailA(e.target.checked)} className="size-4 accent-[var(--primary)]" data-testid="dl-fail-a" />
            契約企業数の取得を失敗させる
          </label>
          <Button variant="outline" size="xs" onClick={() => setToken((n) => n + 1)} data-testid="dl-reload">
            両方を取得し直す
          </Button>
        </div>
        <PageColumns layout="equal">
          <AnalysisRegion
            title="契約企業数"
            level={3}
            status={a.status}
            error={a.status === "error" ? { title: "契約企業数を取得できませんでした", description: "解約率は表示しています。", onRetry: () => { setFailA(false); a.reload() } } : null}
            data-testid="dl-region-a"
          >
            <MetricGroup>
              <Metric size="secondary" label="2026/11/25時点" value={loadable(a.status, a.data)} format={countFormat("社")} />
            </MetricGroup>
          </AnalysisRegion>
          <AnalysisRegion title="今月の解約率" level={3} status={b.status} data-testid="dl-region-b">
            <MetricGroup>
              <Metric size="secondary" label="途中経過（25日間）" value={loadable(b.status, b.data)} format={ratioFormat} />
            </MetricGroup>
          </AnalysisRegion>
        </PageColumns>
      </div>
    </DemoFrame>
  )
}

// タブと折りたたみの中のグラフ。Tabs と Accordion は既定で非表示の内容も DOM に残す（keepMounted）。
// 非表示の間は大きさが 0 になるため、Chart は大きさを測れるまで描かず、表示されたときに親の幅で描く。
function HiddenChartsDemo() {
  const range = { from: new Date(ANALYSIS_TODAY.getFullYear(), ANALYSIS_TODAY.getMonth(), 1), to: ANALYSIS_TODAY }
  const b = mrrBridge(range, defaultAnalysisFilters)
  const bridge = [
    { key: "added", label: "新規の契約", value: b.added },
    { key: "expansion", label: "増額", value: b.expansion },
    { key: "contraction", label: "減額", value: -b.contraction },
    { key: "churn", label: "解約", value: -b.churn },
  ]
  const profit = regions.map((r) => ({ key: r, label: regionLabels[r], value: operatingProfitIn(range, { ...defaultAnalysisFilters, regions: [r] }) }))
  return (
    <DemoFrame testId="dl-hidden-charts">
      <div className="flex flex-col gap-8">
        <Tabs defaultValue="bridge">
          <TabsList>
            <TabsTrigger value="bridge">MRR の増減の内訳</TabsTrigger>
            <TabsTrigger value="profit">地域別の営業利益</TabsTrigger>
          </TabsList>
          <TabsContent value="bridge" data-testid="dl-tab-bridge">
            <DiffBarChart items={bridge} format={yenFormat} title="今月の MRR の増減の内訳" testId="dl-tab-bridge-chart" />
          </TabsContent>
          <TabsContent value="profit" data-testid="dl-tab-profit">
            <DiffBarChart items={profit} format={yenFormat} title="今月の地域別の営業利益" testId="dl-tab-profit-chart" />
          </TabsContent>
        </Tabs>
        <Accordion>
          <AccordionItem value="profit">
            <AccordionTrigger>地域別の営業利益（折りたたみ）</AccordionTrigger>
            <AccordionContent>
              <DiffBarChart items={profit} format={yenFormat} title="今月の地域別の営業利益（折りたたみ）" testId="dl-accordion-chart" />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </DemoFrame>
  )
}

export function DashboardLayoutPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Analysis"
        name="Dashboard Layout"
        lead="分析の画面を、利用者が考える順（現在の状況 → 変化 → 要因 → 具体的なデータ → 次の行動）に並べる。すべての領域を必須にせず、目的に応じて厚くする領域を変える。"
      />

      <Section title="3 つの型" lead="固定のテンプレートではなく、設計の判断の基準として使う。">
        <TypesDemo />
      </Section>

      <Section title="Chart と Table の配置" lead="情報の関係から選ぶ。画面を埋めるためだけに複数の列にしない。">
        <LayoutsDemo />
      </Section>

      <Section title="独立した領域" lead="領域ごとに読み込み、再取得、エラーを示す。一部の失敗で、ほかの領域を隠さない。比べる必要のある指標（同じ時点の値）は、1 回の取得でそろえる。">
        <RegionsDemo />
      </Section>

      <Section title="タブと折りたたみの中のグラフ" lead="Tabs と Accordion は、非表示の内容も DOM に残す。非表示の間のグラフは描かずに場所だけを確保し、表示したときに親の幅で描く。">
        <HiddenChartsDemo />
      </Section>

      <Section title="判断基準">
        <Rules
          rows={[
            ["最大幅と余白", "Page Layout の Wide（最大 1440px）。余白はデスクトップ 24px、モバイル 16px。並べたグラフの間は 24px、セクションの間は 48px、大きな分析の章の間は 64〜96px。列の多い監視の表は最大幅を設けなくてよい"],
            ["区切り", "余白 → 文字の強弱 → 細い線 → 背景 → Card の順に検討する。グラフや指標を機械的に Card で囲まない。Card を入れ子にしない"],
            ["グラフの高さ", "補助のグラフ 96〜160px、標準 240〜320px、主要なグラフ 320〜480px を目安にし、軸の文字、凡例、データの量で決める"],
            ["操作の位置", "ページ全体の条件は Page Header の直下。グラフだけの集計単位や表示形式は、そのグラフの見出しの右"],
            ["最初の表示", "ページの目的、主要な指標、分析の対象の期間、重要な異常を先に置く。全体を 1 画面に収めることを目標にしない。入れ子のスクロールの領域を作らない"],
            ["再取得", "前の結果を残す場合は、内容を薄くせずに、「更新中」と表示中の結果の条件を文字で示す（200ms 未満の再取得では示さない）。古い結果を現在の条件の結果と誤認させない"],
            ["リアルタイムの更新", "値をその場で書き換え、行の順序、フォーカス、スクロールの位置を変えない。新しい項目は件数を示し、利用者が押したときに表示する。自動の更新を止められるようにする"],
            ["カスタマイズ", "製品が合理的な初期の構成を作る。並べ替えなどは、利用者ごとに目的が異なる場合だけ検討し、標準の構成に戻せるようにする"],
            ["モバイル", "考える順を保ったまま 1 列にする。グラフを読めない大きさまで縮めない。表の横スクロールは表の領域の中だけ"],
          ]}
        />
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "各領域は見出し（h2、h3）を持ち、見出しの一覧から移動できる。",
            "読み込み中と再取得中の領域に aria-busy を付ける。領域のエラーは role=\"alert\" で、失敗した領域の中に示す。",
            "グラフには目的の名前を付け、同じ数値を表で確かめられるようにする（「数値を表で見る」）。",
            "リアルタイムの更新のたびに読み上げない。新しいアラートの件数はボタンの名前で示す。",
          ]}
        />
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="同じ大きさのカードを 3 列 2 行に並べたダッシュボードの例">
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-12 rounded-md border border-border" />
                ))}
              </div>
            </Mock>
          }
          badNote="考える順がなく、どこから読めばよいかわからない。"
          good={
            <Mock label="主要な指標、全幅の推移、内訳と表の順に並べたダッシュボードの例">
              <div className="flex gap-4">
                <span className="h-6 w-20 rounded-sm bg-muted-foreground/40" />
                <span className="h-4 w-12 self-end rounded-sm bg-border" />
                <span className="h-4 w-12 self-end rounded-sm bg-border" />
              </div>
              <div className="h-12 rounded-sm bg-muted" />
              <div className="grid grid-cols-[2fr_1fr] gap-2">
                <div className="h-8 rounded-sm bg-muted" />
                <div className="h-8 rounded-sm bg-muted/60" />
              </div>
            </Mock>
          }
          goodNote="現在の状況 → 推移 → 内訳の順に、重要度を大きさと位置で示す。"
        />
      </Section>
    </article>
  )
}
