import { fromDateString } from "@/lib/date"
import { describeRange } from "@/patterns/analysis-period"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"

import { planLabels, regionLabels, type Plan, type Region } from "../../data/data-analysis/subscriptions"
import type { Route } from "./analysis-route"

// 分析から業務画面への移動の例。業務画面そのものは検証画面の範囲の外であり、引き継いだ条件だけを示す。
// 分析の条件は、操作の権限や一括の処理の対象として信頼しない。実際の対象と権限は、業務画面のバックエンドが確かめる。

export function WorkScreen({ route }: { route: Route }) {
  const p = route.params
  const from = fromDateString(p.get("from"))
  const to = fromDateString(p.get("to"))
  const rows: [string, string][] = []
  if (from && to) rows.push(["解約日", describeRange({ from, to })])
  if (p.get("plan")) rows.push(["プラン", p.get("plan")!.split(",").map((v) => planLabels[v as Plan] ?? v).join("、")])
  if (p.get("region")) rows.push(["地域", p.get("region")!.split(",").map((v) => regionLabels[v as Region] ?? v).join("、")])
  if (p.get("reason")) rows.push(["解約の理由", p.get("reason")!])
  if (p.get("ids")) rows.push(["企業", p.get("ids")!])
  return (
    <PageLayout width="standard" data-testid="analysis-work">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客</PageHeaderTitle>
          <PageHeaderDescription>顧客の業務画面（検証画面の範囲の外）。分析の画面から、次の条件を引き継いだ。</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      <dl className="grid max-w-xl grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-ui" data-testid="work-conditions">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="max-w-[40rem] text-ui text-muted-foreground">
        引き継いだ条件は、一覧の初期の絞り込みにだけ使う。登録、編集、一括の処理の対象と権限は、業務画面のバックエンドが確かめる（Forms & Workflows の設計方針に従う）。
      </p>
    </PageLayout>
  )
}
