"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"

import { toDateString } from "@/lib/date"
import type { AnalysisPeriod, Bucket, ComparisonRange, PeriodContext, ResolvedPeriod } from "@/patterns/analysis-period"
import { isValidTimeZone, nextDayStart, zonedStartOfDay } from "@/patterns/analysis-time"
import { cn } from "@/lib/utils"

// Flow Design Drill-down（Patterns / Data Analysis）
// 分析から、より具体的な内訳、明細、業務画面へ進み、元の分析に戻るための部品。定義は docs/web/patterns/drill-down.md を参照。
//
// - DrillDownLink：KPI、Chart の数値の表、Table の行から詳細へ進むリンク。操作できることを、操作の前に文字と形で示す。
//   すべての Chart の要素にアイコンを付けない。Chart の要素の選択（Cross-filtering）とは別の操作にする。
// - drillPeriodFor：実際に集計した期間（解決した期間、比較の系列の期間）を、固定の日付で引き継ぐ。
// - drillBucketPeriod：グラフの 1 つのデータ点（区間）の実際の期間と時刻を引き継ぐ。
// - groupOther：上位の項目と「その他」に分け、「その他」に実際に含まれる分類を持つ（表示の文字ではなく分類で絞り込む）。
//   加算できない指標（割合、平均、一意の件数）の「その他」は、製品が元のデータから再集計する。
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
 * 選んだ系列の、実際に集計した期間（固定の日付）。
 * - current：解決した分析の対象の期間。相対期間は固定の日付にし、未来の終了日を今日までに切り詰めた期間はその期間を使う
 *   （入力された期間ではなく、値の集計に使った期間を引き継ぐ）
 * - baseline：比較期間の側のデータ点から進む場合。現在の期間と誤認させず、比較の系列の期間を使う
 * 引き継ぐ期間は current（解決した期間）と comparison から求める。period は互換のために受け付けるが、使わない
 */
function drillPeriodFor(
  series: "current" | "baseline",
  { comparison, current }: { comparison: ComparisonRange; current: ResolvedPeriod; /** 使わない（互換のため） */ period?: AnalysisPeriod }
): AnalysisPeriod | null {
  const range = series === "current" ? (current.status === "ready" ? current.range : null) : comparison.status === "ready" ? comparison.range : null
  return range ? { kind: "absolute", from: toDateString(range.from), to: toDateString(range.to) } : null
}

/**
 * drillPeriodFor に加えて、実際に集計した時刻の範囲を返す。比較の系列が同じ経過時間（elapsed-time）の場合は、
 * 日の全体ではなく、集計した時刻までの半開区間（instant）を引き継ぐ。
 */
function drillRangeFor(
  series: "current" | "baseline",
  args: { comparison: ComparisonRange; current: ResolvedPeriod; context?: PeriodContext }
): { period: AnalysisPeriod; instant: { start: number; end: number } | null } | null {
  const period = drillPeriodFor(series, args)
  if (!period) return null
  const cmp = args.comparison
  if (cmp.status !== "ready" || cmp.instant === null) return { period, instant: null }
  if (series === "baseline") return { period, instant: cmp.instant }
  // 現在の系列：期間の始まりから、集計済みの時刻（asOf）まで。比較と同じ文脈（タイムゾーン、asOf）が必要
  const tz = args.context?.timeZone
  const asOf = args.context?.asOf
  if (args.current.status !== "ready" || asOf === undefined || !isValidTimeZone(tz)) return { period, instant: null }
  const start = zonedStartOfDay(toDateString(args.current.range.from), tz)
  return { period, instant: { start, end: Math.max(start, Math.min(asOf, nextDayStart(toDateString(args.current.range.to), tz))) } }
}

/**
 * グラフの 1 つのデータ点（区間）から進む場合の期間。区間の実際の開始日と終了日（期間の境界で切られた区間は、その部分）と、
 * 時刻がある場合（時間別、タイムゾーンを渡した区間）は、実際の開始と終了の時刻（半開区間）を返す。
 */
function drillBucketPeriod(bucket: Pick<Bucket, "from" | "to" | "start" | "end">): { period: AnalysisPeriod; instant: { start: number; end: number } | null } {
  return {
    period: { kind: "absolute", from: toDateString(bucket.from), to: toDateString(bucket.to) },
    instant: bucket.start !== null && bucket.end !== null ? { start: bucket.start, end: bucket.end } : null,
  }
}

type GroupedItem<T> =
  | { kind: "item"; key: string; label: string; value: number; item: T }
  | { kind: "other"; key: string; label: string; value: number | null; members: string[] }

/**
 * 値の大きい順に limit 件を残し、残りを「その他」にまとめる。「その他」は、含まれる分類の key（members）を持つ。
 * 「その他」から詳細へ進む場合は、label（「その他」）ではなく members で絞り込む。
 *
 * - aggregate：「その他」の値の求め方。"sum"（件数、金額など加算できる指標）か、関数（割合、平均、一意の件数など
 *   加算できない指標。製品が元のデータから再集計する）。関数が null を返した場合と、合計が有限の数にならない場合は
 *   値を null にする（0 に置き換えない）
 * - 値が数値でない項目（欠損、NaN、Infinity）は、まとめから除いて skipped で返す
 * - 分類の key が重複している場合と、otherKey（既定 "__other"）と同じ key がある場合は RangeError（製品のデータの誤り）
 * - limit が 0 以下ならすべてを「その他」に、件数以上なら「その他」を作らない。1 件だけを「その他」にしない
 * - includeSkippedInOther で欠損した分類がある場合は、まとめる値のある項目が 0〜1 件でも「その他」を作る
 */
function groupOther<T>(
  items: readonly T[],
  {
    limit,
    key,
    label,
    value,
    aggregate,
    otherLabel = "その他",
    otherKey = "__other",
    includeSkippedInOther = false,
  }: {
    limit: number
    key: (item: T) => string
    label: (item: T) => string
    value: (item: T) => number | null
    aggregate: "sum" | ((rest: T[]) => number | null)
    otherLabel?: string
    otherKey?: string
    /**
     * 値が欠損した分類を、「その他」の members に含める（値の計算には含めない）。「その他」から明細へ進むときに、
     * 欠損した分類の明細も対象にする場合に使う
     */
    includeSkippedInOther?: boolean
  }
): { groups: GroupedItem<T>[]; skipped: T[] } {
  if (aggregate !== "sum" && typeof aggregate !== "function") throw new RangeError("groupOther: aggregate に \"sum\" か再集計の関数を指定してください")
  const keys = items.map(key)
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i)
  if (dup.length) throw new RangeError(`groupOther: 分類の key が重複しています（${[...new Set(dup)].join("、")}）`)
  if (keys.includes(otherKey)) throw new RangeError(`groupOther: 「その他」の key（${otherKey}）と同じ分類があります。otherKey を変えてください`)
  if (!Number.isFinite(limit)) throw new RangeError(`groupOther: limit が不正です（${limit}）`)
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
  const valid = items.filter((i) => isNum(value(i)))
  const skipped = items.filter((i) => !isNum(value(i)))
  const sorted = [...valid].sort((a, b) => (value(b) as number) - (value(a) as number))
  const n = Math.max(0, Math.floor(limit))
  const head = sorted.slice(0, n)
  const rest = sorted.slice(n)
  const groups: GroupedItem<T>[] = head.map((i) => ({ kind: "item", key: key(i), label: label(i), value: value(i) as number, item: i }))
  // 欠損した分類を「その他」に含める場合は、まとめる項目が 0〜1 件でも「その他」を作る（欠損した分類の明細へ進めなくしない）。
  // 値は、値のある項目（rest）だけから求める。値のある項目がない場合は null（0 にしない）
  const keepSkipped = includeSkippedInOther && skipped.length > 0
  if (rest.length === 1 && n > 0 && !keepSkipped) {
    groups.push({ kind: "item", key: key(rest[0]), label: label(rest[0]), value: value(rest[0]) as number, item: rest[0] })
  } else if (rest.length > 0 || keepSkipped) {
    let v: number | null
    if (rest.length === 0) v = null
    else if (aggregate === "sum") {
      const total = rest.reduce((s, i) => s + (value(i) as number), 0)
      v = Number.isFinite(total) ? total : null
    } else {
      const r = aggregate(rest)
      v = isNum(r) ? r : null
    }
    groups.push({ kind: "other", key: otherKey, label: otherLabel, value: v, members: [...rest.map(key), ...(includeSkippedInOther ? skipped.map(key) : [])] })
  }
  return { groups, skipped }
}

// ---------------------------------------------------------------- 分析の画面への復帰

type AnalysisPosition = {
  /** 縦のスクロールの位置（AppShellMain） */
  scrollTop: number
  /** 横にスクロールする領域（data-scroll-key を付けた要素）の位置 */
  scrollLeft: Record<string, number>
  /** 操作元（data-drill-origin）の ID */
  origin: string | null
  /**
   * 操作元を含む領域の見出し（領域の順番と見出しの文字）。操作元がない・見えない場合のフォーカスの移動先。
   * 自動で付けた id（useId）は画面を作り直すと変わる場合があるため、id では探さない
   */
  section: { index: number; title: string } | null
}

const ORIGIN = "[data-drill-origin]"
const SCROLL = "[data-scroll-key]"

// data-scroll-key を付けた要素の中に Table の横スクロールの領域（data-slot="table-container"）があれば、それを使う。
function scrollTarget(el: HTMLElement) {
  return el.querySelector<HTMLElement>("[data-slot=table-container]") ?? el
}

/** 分析の画面から離れる直前の位置を記録する。origin は押した要素（またはその中の要素） */
function captureAnalysisPosition({
  scrollElement,
  origin,
  root,
}: {
  scrollElement: HTMLElement | null
  origin: Element | null
  /** 横のスクロールの位置を記録する範囲。省略すると origin を含む文書 */
  root?: ParentNode | null
}): AnalysisPosition {
  const el = origin?.closest<HTMLElement>(ORIGIN) ?? null
  const scope = root ?? origin?.ownerDocument ?? null
  const sectionEl = el?.closest("section")
  const title = sectionEl?.querySelector<HTMLElement>("[data-slot=section-title], h2, h3")
  const sections = scope ? Array.from(scope.querySelectorAll("section")) : []
  const section = sectionEl && title ? { index: sections.indexOf(sectionEl), title: title.textContent ?? "" } : null
  const scrollLeft: Record<string, number> = {}
  scope?.querySelectorAll<HTMLElement>(SCROLL).forEach((s) => {
    if (s.dataset.scrollKey) scrollLeft[s.dataset.scrollKey] = scrollTarget(s).scrollLeft
  })
  return { scrollTop: scrollElement?.scrollTop ?? 0, scrollLeft, origin: el?.dataset.drillOrigin ?? null, section }
}

// フォーカスできる要素か。削除、非表示、無効、inert の要素にはフォーカスを移さない。
function canFocus(el: HTMLElement | null): el is HTMLElement {
  if (!el || !el.isConnected) return false
  if (el.closest("[inert]") || el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return false
  if (el.getClientRects().length === 0) return false
  const style = getComputedStyle(el)
  return style.visibility !== "hidden"
}

function tryFocus(el: HTMLElement | null) {
  if (!canFocus(el)) return false
  el.focus({ preventScroll: true })
  return el.ownerDocument.activeElement === el
}

/**
 * 記録した位置を復元する。ready（データの表示が終わった）になった後の最初の描画で、1 回だけ行う。
 * 1. 縦のスクロールの位置と、横にスクロールする領域（data-scroll-key）の位置
 * 2. 操作元の要素へフォーカス。操作元がない・非表示・無効の場合は見出し（tabIndex=-1 を付ける）、それもできない場合は fallbackFocus
 *    実際にフォーカスが移ったことを確かめる（移らなかった要素を復元の成功としない）
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
      area?.querySelectorAll<HTMLElement>(SCROLL).forEach((s) => {
        const left = s.dataset.scrollKey ? position.scrollLeft[s.dataset.scrollKey] : undefined
        if (left !== undefined) scrollTarget(s).scrollLeft = left
      })
      let focused: "origin" | "section" | "fallback" | "none" = "none"
      let target: HTMLElement | null = null
      if (area && position.origin) {
        const candidates = Array.from(area.querySelectorAll<HTMLElement>(ORIGIN)).filter((el) => el.dataset.drillOrigin === position.origin)
        target = candidates.find((el) => tryFocus(el)) ?? null
        if (target) focused = "origin"
      }
      if (!target && area && position.section) {
        const { index, title: text } = position.section
        const sections = Array.from(area.querySelectorAll("section"))
        // 同じ順番の領域の見出しが同じ文字なら、その見出し。なければ、同じ文字の見出しを探す
        const heading = (s: Element | undefined) => s?.querySelector<HTMLElement>("[data-slot=section-title], h2, h3") ?? null
        const byIndex = heading(sections[index])
        const title = byIndex && byIndex.textContent === text ? byIndex : (sections.map(heading).find((h) => h?.textContent === text) ?? null)
        if (title && !title.hasAttribute("tabindex")) title.setAttribute("tabindex", "-1")
        if (tryFocus(title)) {
          target = title
          focused = "section"
        }
      }
      if (!target) {
        const f = fallbackRef.current?.() ?? null
        if (f && !f.hasAttribute("tabindex") && !f.matches("a[href], button, input, select, textarea")) f.setAttribute("tabindex", "-1")
        if (tryFocus(f)) {
          target = f
          focused = "fallback"
        }
      }
      if (target && scroller) {
        const a = target.getBoundingClientRect()
        const b = scroller.getBoundingClientRect()
        if (a.top < b.top || a.bottom > b.bottom) target.scrollIntoView({ block: "nearest" })
      }
      restoredRef.current?.({ focused })
    })
    return () => cancelAnimationFrame(frame)
  }, [position, ready, root, scrollElement])
}

export { DrillDownLink, captureAnalysisPosition, drillBucketPeriod, drillPeriodFor, drillRangeFor, groupOther, useAnalysisPositionRestore }
export type { AnalysisPosition, GroupedItem }
