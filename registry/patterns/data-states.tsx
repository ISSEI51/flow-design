"use client"

import * as React from "react"
import { LoaderCircle } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { TableNoValue } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { useDelayedFlag } from "@/patterns/browse-data"

// Flow Design Data States（Patterns / Data Browsing）
// データの状態を正しく伝えるための小さな部品。定義と判断基準は docs/web/patterns/data-states.md を参照。
// 状態の判断（useBrowseData、getBrowseViewState）と表示の部品を分け、1 つの巨大な部品にしない。
//
// - LoadingReveal：読み込み中の Skeleton を、読み込みが 200ms 続いたときだけ見せる。領域の高さは最初から確保する。
// - DataRefreshIndicator：再取得中の表示。読み込みが 200ms 続いたときだけ見せ、それまでも場所は確保する。
// - DataRegionError：失敗した領域（項目、Section、Chart、Table、ページ）に対応する範囲のエラー。再取得できる場合だけ再試行を置く。
// - DataValue：取得済みの値、実際の 0、未登録、取得できない、取得中を区別して表示する。欠損と失敗を 0 にしない。

// 読み込み中に表示する Skeleton（data-slot="skeleton"）を、delay の間は見えなくする（visibility: hidden）。
// 要素は最初から置くため、表示の前後で領域の高さが変わらない。最低表示時間は設けない。
function LoadingReveal({
  loading,
  delay = 200,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  /** 読み込み中か。操作の制限には、この値ではなく取得の状態そのものを使う */
  loading: boolean
  delay?: number
}) {
  const revealed = useDelayedFlag(loading, delay)
  return (
    <div
      data-slot="loading-reveal"
      data-loading={loading || undefined}
      data-revealed={revealed || undefined}
      className={cn("min-w-0 [&[data-loading]:not([data-revealed])_[data-slot=skeleton]]:invisible", className)}
      {...props}
    />
  )
}

// 再取得中の表示。表示中のデータを残したまま、更新していることを示す。
// 読み上げは、領域の aria-busy と、DataTable の読み上げの領域（「更新中」）に任せ、ここでは繰り返さない。
function DataRefreshIndicator({
  active,
  delay = 200,
  className,
  children = "更新中",
}: {
  active: boolean
  delay?: number
  className?: string
  children?: React.ReactNode
}) {
  const visible = useDelayedFlag(active, delay)
  return (
    <span
      data-slot="data-refresh-indicator"
      data-visible={visible || undefined}
      // 表示していない間も場所を確保し、表示したときに周りの要素を動かさない。
      className={cn("inline-flex items-center gap-2 text-ui text-muted-foreground", !visible && "invisible", className)}
    >
      <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
      {children}
    </span>
  )
}

// 領域のエラー。重要なエラーを Toast だけで伝えず、失敗した領域に残す。
// role="alert"：操作や取得の結果として後から表示されるため、表示したときに読み上げる。
// 権限不足など、単純な再取得で解決しない場合は onRetry を渡さない（無意味な再試行を置かない）。
function DataRegionError({
  title,
  description,
  onRetry,
  retryLabel = "再試行",
  retrying = false,
  variant = "destructive",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  onRetry?: () => void
  retryLabel?: string
  retrying?: boolean
  /** destructive：取得できず、内容を表示できない。warning：前の内容を表示している（再取得の失敗） */
  variant?: "destructive" | "warning"
}) {
  return (
    <Alert variant={variant} role="alert" data-slot="data-region-error" className={className} {...props}>
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      {(onRetry || children) && (
        <AlertAction>
          {onRetry && (
            <Button variant="outline" size="sm" loading={retrying} onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {children}
        </AlertAction>
      )}
    </Alert>
  )
}

/** 値の状態。未登録（値がない）は ready の null、取得できないは unavailable で表す */
type Loadable<T> =
  | { status: "loading" }
  | { status: "unavailable"; reason?: string }
  | { status: "ready"; value: T | null }

function DataValue<T>({
  value,
  format = (v) => String(v),
  emptyLabel = "未登録",
  unavailableLabel = "取得できません",
  className,
}: {
  value: Loadable<T>
  /** 値の表示。0 は 0 として表示する */
  format?: (value: T) => React.ReactNode
  /** 値がないときに、支援技術に伝える名前（画面には「—」） */
  emptyLabel?: string
  /** 取得できないときの表示 */
  unavailableLabel?: string
  className?: string
}) {
  if (value.status === "loading") {
    return (
      <span data-slot="data-value" data-state="loading" className={cn("inline-flex align-middle", className)}>
        <span data-slot="skeleton" aria-hidden="true" className="inline-block h-4 w-16 rounded-sm bg-border motion-safe:animate-pulse motion-safe:[animation-duration:1.8s]" />
        <span className="sr-only">読み込み中</span>
      </span>
    )
  }
  if (value.status === "unavailable") {
    return (
      <span data-slot="data-value" data-state="unavailable" title={value.reason} className={cn("text-muted-foreground", className)}>
        {unavailableLabel}
      </span>
    )
  }
  if (value.value === null) return <TableNoValue data-state="empty" label={emptyLabel} className={className} />
  return (
    <span data-slot="data-value" data-state="ready" className={className}>
      {format(value.value)}
    </span>
  )
}

export { DataRefreshIndicator, DataRegionError, DataValue, LoadingReveal }
export type { Loadable }
