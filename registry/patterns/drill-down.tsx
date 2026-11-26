"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"

import { toDateString } from "@/lib/date"
import type { AnalysisPeriod, ComparisonRange, ResolvedPeriod } from "@/patterns/analysis-period"
import { cn } from "@/lib/utils"

// Flow Design Drill-down（Patterns / Data Analysis）
// 分析から、より具体的な内訳、明細、業務画面へ進み、元の分析に戻るための部品。定義は docs/web/patterns/drill-down.md を参照。
//
// - DrillDownLink：KPI、Chart の数値の表、Table の行から詳細へ進むリンク。操作できることを、操作の前に文字と形で示す。
//   すべての Chart の要素にアイコンを付けない。Chart の要素の選択（Cross-filtering）とは別の操作にする。
// - drillPeriodFor：比較期間の系列のデータ点から進む場合に、その系列の期間を引き継ぐ。
// - groupOther：上位の項目と「その他」に分け、「その他」に実際に含まれる分類を持つ（表示の文字ではなく分類で絞り込む）。
// - captureAnalysisPosition / useAnalysisPositionRestore：分析の画面から離れるときのスクロールの位置と操作元を記録し、
//   戻ったときにデータの表示が終わってから復元する。操作元がない場合は、近い見出しなどへフォーカスする。
//   記録の保存（履歴の項目ごと）とルーターとの接続は製品の責務である。条件の引き継ぎには scopeFilters（analysis-query.ts）を使う。

/** 詳細へ進むリンク。操作元を data-drill-origin で示し、戻ったときのフォーカスの復元に使う */
function DrillDownLink({
  origin,
  className,
  children,
  showIcon = true,
  ...props
}: React.ComponentProps<"a"> & {
  /** 操作元の ID。戻ったときに、この要素へフォーカスを戻す */
  origin: string
  showIcon?: boolean
}) {
  return (
    <a
      data-slot="drill-down-link"
      data-drill-origin={origin}
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-xs text-ui font-medium text-foreground underline decoration-border-strong underline-offset-4 outline-none hover:decoration-foreground focus-visible:focus-ring",
        // タッチの操作の領域を 24px 以上にする（文字の行の高さを保ったまま、上下に広げる）
        "relative after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
        className
      )}
      {...props}
    >
      {children}
      {showIcon && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
    </a>
  )
}

/**
 * 選んだ系列の期間。比較期間側のデータ点から進む場合に、現在の期間と誤認させず、その系列の期間（固定の日付）を返す。
 */
function drillPeriodFor(
  series: "current" | "baseline",
  { period, comparison, current }: { period: AnalysisPeriod; comparison: ComparisonRange; current: ResolvedPeriod }
): AnalysisPeriod | null {
  if (series === "current") {
    if (current.status !== "ready") return null
    // 相対期間を引き継ぐと、詳細を開いた日と後で戻った日で期間が変わるため、固定の日付にする。
    return period.kind === "absolute" ? period : { kind: "absolute", from: toDateString(current.range.from), to: toDateString(current.range.to) }
  }
  if (comparison.status !== "ready") return null
  return { kind: "absolute", from: toDateString(comparison.range.from), to: toDateString(comparison.range.to) }
}

type GroupedItem<T> = { kind: "item"; key: string; label: string; value: number; item: T } | { kind: "other"; key: "__other"; label: string; value: number | null; members: string[] }

/**
 * 値の大きい順に limit 件を残し、残りを「その他」にまとめる。「その他」は、含まれる分類の key（members）を持つ。
 * 「その他」から詳細へ進む場合は、label（「その他」）ではなく members で絞り込む。
 * 値が数値でない項目（欠損）は、0 として合計せず、まとめから除いて skipped で返す。
 */
function groupOther<T>(
  items: readonly T[],
  {
    limit,
    key,
    label,
    value,
    otherLabel = "その他",
    combine,
  }: {
    limit: number
    key: (item: T) => string
    label: (item: T) => string
    value: (item: T) => number | null
    otherLabel?: string
    /**
     * 「その他」の値の求め方。既定は合計（件数、金額）。割合、平均、一意の件数は合計できないため、
     * 製品が元のデータから求め直す関数を渡す（members を受け取る）。null を返すと値を示さない
     */
    combine?: (rest: T[]) => number | null
  }
): { groups: GroupedItem<T>[]; skipped: T[] } {
  const valid = items.filter((i) => Number.isFinite(value(i)))
  const skipped = items.filter((i) => !Number.isFinite(value(i)))
  const sorted = [...valid].sort((a, b) => (value(b) as number) - (value(a) as number))
  const head = sorted.slice(0, limit)
  const rest = sorted.slice(limit)
  const groups: GroupedItem<T>[] = head.map((i) => ({ kind: "item", key: key(i), label: label(i), value: value(i) as number, item: i }))
  // 1 件だけを「その他」にしない（その項目の名前を示す方がわかりやすい）
  if (rest.length === 1) groups.push({ kind: "item", key: key(rest[0]), label: label(rest[0]), value: value(rest[0]) as number, item: rest[0] })
  else if (rest.length > 1)
    groups.push({ kind: "other", key: "__other", label: otherLabel, value: combine ? combine(rest) : rest.reduce((s, i) => s + (value(i) as number), 0), members: rest.map(key) })
  return { groups, skipped }
}

// ---------------------------------------------------------------- 分析の画面への復帰

type AnalysisPosition = {
  /** 縦のスクロールの位置（AppShellMain） */
  scrollTop: number
  /** 操作元（data-drill-origin）の ID */
  origin: string | null
  /** 操作元を含む見出しの id。操作元がなくなった場合のフォーカスの移動先 */
  sectionTitleId: string | null
}

const ORIGIN = "[data-drill-origin]"

/** 分析の画面から離れる直前の位置を記録する。origin は押した要素（またはその中の要素） */
function captureAnalysisPosition({ scrollElement, origin }: { scrollElement: HTMLElement | null; origin: Element | null }): AnalysisPosition {
  const el = origin?.closest<HTMLElement>(ORIGIN) ?? null
  const section = el?.closest("section[aria-labelledby], section")
  const title = section?.querySelector<HTMLElement>("[data-slot=section-title][id], h2[id], h3[id]")
  return { scrollTop: scrollElement?.scrollTop ?? 0, origin: el?.dataset.drillOrigin ?? null, sectionTitleId: title?.id ?? null }
}

/**
 * 記録した位置を復元する。ready（データの表示が終わった）になった後の最初の描画で、1 回だけ行う。
 * 1. 縦のスクロールの位置
 * 2. 操作元の要素へフォーカス。ない場合は見出し（tabIndex=-1 を付ける）、それもない場合は fallbackFocus
 * AppShellMain の scrollOnNavigate と focusOnNavigate は、復元する間 false にする（製品が指定する）。
 */
function useAnalysisPositionRestore({
  position,
  ready,
  root,
  scrollElement,
  fallbackFocus,
  onRestored,
}: {
  position: AnalysisPosition | null
  ready: boolean
  root: React.RefObject<HTMLElement | null>
  scrollElement: React.RefObject<HTMLElement | null>
  fallbackFocus?: () => HTMLElement | null
  onRestored?: (result: { focused: "origin" | "section" | "fallback" | "none" }) => void
}) {
  const done = React.useRef<AnalysisPosition | null>(null)
  const fallbackRef = React.useRef(fallbackFocus)
  fallbackRef.current = fallbackFocus
  const restoredRef = React.useRef(onRestored)
  restoredRef.current = onRestored

  React.useEffect(() => {
    if (!position || !ready || done.current === position) return
    const frame = requestAnimationFrame(() => {
      done.current = position
      const scroller = scrollElement.current
      const area = root.current
      if (scroller) scroller.scrollTop = position.scrollTop
      let focused: "origin" | "section" | "fallback" | "none" = "none"
      let target: HTMLElement | null = null
      if (area && position.origin) {
        target = Array.from(area.querySelectorAll<HTMLElement>(ORIGIN)).find((el) => el.dataset.drillOrigin === position.origin) ?? null
        if (target) focused = "origin"
      }
      if (!target && area && position.sectionTitleId) {
        target = area.querySelector<HTMLElement>(`[id="${CSS.escape(position.sectionTitleId)}"]`)
        if (target) {
          if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1")
          focused = "section"
        }
      }
      if (!target) {
        target = fallbackRef.current?.() ?? null
        if (target) focused = "fallback"
      }
      if (target) {
        target.focus({ preventScroll: true })
        if (scroller) {
          const a = target.getBoundingClientRect()
          const b = scroller.getBoundingClientRect()
          if (a.top < b.top || a.bottom > b.bottom) target.scrollIntoView({ block: "nearest" })
        }
      }
      restoredRef.current?.({ focused })
    })
    return () => cancelAnimationFrame(frame)
  }, [position, ready, root, scrollElement])
}

export { DrillDownLink, captureAnalysisPosition, drillPeriodFor, groupOther, useAnalysisPositionRestore }
export type { AnalysisPosition, GroupedItem }
