import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { AnalysisRegion } from "@/patterns/analysis-region"
import { DrillDownLink } from "@/patterns/drill-down"

import { appHref, type Route } from "./analysis-route"
import { useSession } from "./analysis-session"
import { AccountError, AccountSummary, AnalysisBreadcrumb, accountNotFoundText, drillCrumbs, useAccount } from "./retention-dashboard"

// Drill-down の最後の階層：個別の企業の詳細（別ページ）。
// 分析の条件は URL で受け取り、Breadcrumb で分析の階層に戻れるようにする。
// 明細の閲覧の権限がない場合は、サーバーが詳細を返さない（クライアントで隠さない）。集計の画面は、そのまま使える。

export function AccountDetailPage({ route }: { route: Route }) {
  const id = route.params.get("id")
  const account = useAccount(id)
  const { session } = useSession()
  const d = account.isCurrent ? account.data : null
  const name = d?.name ?? (account.status === "error" ? "企業の詳細" : account.isCurrent ? "企業が見つかりません" : "読み込み中")
  return (
    <PageLayout width="standard" data-testid="analysis-account">
      <PageHeader>
        <div className="basis-full">
          <AnalysisBreadcrumb items={drillCrumbs(route, name)} />
        </div>
        <PageHeaderContent>
          <PageHeaderTitle>{name}</PageHeaderTitle>
          {d && <PageHeaderDescription>{d.id}</PageHeaderDescription>}
        </PageHeaderContent>
      </PageHeader>
      <AnalysisRegion title="契約の情報" status={account.status} data-testid="account-detail">
        {account.status === "error" ? (
          <AccountError error={account.error} onRetry={account.reload} />
        ) : d ? (
          <AccountSummary account={d} />
        ) : account.isCurrent ? (
          <p className="text-ui text-muted-foreground">{accountNotFoundText(session.forbiddenDetail)}</p>
        ) : (
          <div className="h-64" />
        )}
      </AnalysisRegion>
      {d && (
        <AnalysisRegion title="次にすること" divider>
          <DrillDownLink origin="account-work" href={appHref("work", { ids: d.id })}>
            この企業を顧客の業務画面で開く
          </DrillDownLink>
        </AnalysisRegion>
      )}
    </PageLayout>
  )
}
