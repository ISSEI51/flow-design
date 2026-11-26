"use client"

import * as React from "react"
import { CalendarRange, Filter } from "lucide-react"

import { useDelayedFlag, type BrowseDataStatus } from "@/patterns/browse-data"
import { DataRefreshIndicator, DataRegionError, LoadingReveal } from "@/patterns/data-states"
import { Section, SectionActions, SectionDescription, SectionHeader, SectionHeading, SectionTitle } from "@/patterns/section-layout"
import { cn } from "@/lib/utils"

// Flow Design Analysis Region（Patterns / Data Analysis / Dashboard Layout）
// ダッシュボードの 1 つの分析の領域（Chart、Table、指標のまとまり）。定義は docs/web/patterns/dashboard-layout.md を参照。
//
// - Section Layout の Section の上に、領域ごとのデータの状態（読み込み、再取得、取得失敗）と、領域に適用する条件の表示を加える。
//   独立した領域は、個別に読み込み、再取得、エラーの表示ができる（ほかの領域を隠さない）。
// - Card で囲まない。区切りは余白、文字の強弱、必要な場合だけ細い境界線（divider）。
// - 個別の操作（集計単位、表示形式）は actions で見出しの右に置く。ページ全体の条件はここに置かない。
// - 全体条件と異なる条件（例外の期間、個別の絞り込み）は、conditions に AnalysisScopeNote を渡して、見出しの近くで示す。

function AnalysisRegion({
  title,
  description,
  actions,
  conditions,
  status = "ready",
  error,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Section>, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  /** この領域だけの操作（集計単位、表示形式、Group by） */
  actions?: React.ReactNode
  /** この領域に適用する、全体条件と異なる条件（AnalysisScopeNote） */
  conditions?: React.ReactNode
  /** 領域のデータの状態（useBrowseData の status） */
  status?: BrowseDataStatus
  /**
   * 取得の失敗。variant が warning（前の内容を表示している、再取得の失敗）の場合は内容も表示する。
   * destructive（既定）の場合は、古い条件の内容を表示しない
   */
  error?: { title: React.ReactNode; description?: React.ReactNode; onRetry?: () => void; variant?: "destructive" | "warning" } | null
}) {
  const loading = status === "loading" || status === "idle"
  // 薄くする表示も 200ms 遅らせ、短い再取得（リアルタイムの更新など）でちらつかせない。
  const dim = useDelayedFlag(status === "refreshing", 200)
  const showContent = !error || error.variant === "warning"
  return (
    <Section data-slot="analysis-region" data-status={status} aria-busy={loading || status === "refreshing" || undefined} className={className} {...props}>
      <SectionHeader>
        <SectionHeading>
          <SectionTitle>{title}</SectionTitle>
          {description && <SectionDescription>{description}</SectionDescription>}
          {conditions}
        </SectionHeading>
        {(actions || status === "refreshing") && (
          <SectionActions>
            <DataRefreshIndicator active={status === "refreshing"} className="text-caption" />
            {actions}
          </SectionActions>
        )}
      </SectionHeader>
      {error && <DataRegionError title={error.title} description={error.description} onRetry={error.onRetry} variant={error.variant} />}
      {showContent && (
        <LoadingReveal
          loading={loading}
          // 再取得の間は前の条件の結果を残すが、現在の条件の結果と誤認させないよう薄く表示する（操作の制限は製品が status で行う）。
          className={cn("transition-opacity duration-(--duration-fast)", dim && "opacity-50")}
          data-region-content=""
        >
          {children}
        </LoadingReveal>
      )}
    </Section>
  )
}

/**
 * 領域に適用する条件の表示。
 * - narrowed：全体条件を引き継ぎ、さらに絞り込んでいる（「全体の条件に加えて：プラン スタンダード」）
 * - override：全体条件と異なる条件を使っている（「期間：過去12か月（全体の期間とは別）」）。見落とされないよう、文字の色を強める
 */
function AnalysisScopeNote({
  kind = "narrowed",
  className,
  children,
  ...props
}: React.ComponentProps<"p"> & { kind?: "narrowed" | "override" }) {
  const Icon = kind === "override" ? CalendarRange : Filter
  return (
    <p
      data-slot="analysis-scope-note"
      data-kind={kind}
      className={cn(
        "flex min-w-0 items-start gap-1.5 text-caption [word-break:auto-phrase]",
        kind === "override" ? "font-medium text-foreground" : "text-muted-foreground",
        className
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

export { AnalysisRegion, AnalysisScopeNote }
