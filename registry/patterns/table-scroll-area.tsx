"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Table Scroll Area / Horizontal Scroll Area（Patterns / Data Browsing / List & Detail、View Switching）
// 横に続く情報があるときだけ、スクロールできる方向の端に薄い影を表示する。
// 定義は docs/web/patterns/list-and-detail.md の「Table の横スクロール」と view-switching.md を参照。
//
// - TableScrollArea：表（Table、DataTable）を囲む。中の data-slot="table-container"（Table の既存のスクロールの領域）を測る。
//   Table と DataTable は変更しない。左端に固定した列（data-pinned="start"）がある場合、左の影は固定した列の右端に表示する。
// - HorizontalScrollArea：表ではない横に並ぶ内容（Kanban の列など）。自身がスクロールの領域になる。
// 共通の規則
// - 影は、スクロールできる方向にだけ表示し、端に着いたらその方向の影を消す。横にスクロールしない場合は表示しない。
// - ネイティブのスクロールバーは隠さない。影はスクロールバーの上に重ねない。
// - 影は pointer-events: none の装飾（aria-hidden）で、クリック、文字の選択、フォーカスを妨げない。
// - 内容の幅と、領域の幅（Sidebar の開閉、画面の幅）の変化に追従する（ResizeObserver、MutationObserver）。

type Edges = { start: boolean; end: boolean; rtl: boolean; top: number; height: number; startInset: number; endInset: number }

const initial: Edges = { start: false, end: false, rtl: false, top: 0, height: 0, startInset: 0, endInset: 0 }

const same = (a: Edges, b: Edges) =>
  a.start === b.start &&
  a.end === b.end &&
  a.rtl === b.rtl &&
  a.top === b.top &&
  a.height === b.height &&
  a.startInset === b.startInset &&
  a.endInset === b.endInset

// root（影の位置の基準）の中の、横にスクロールする要素を測る。
function useScrollEdges(
  root: React.RefObject<HTMLElement | null>,
  findContainer: (root: HTMLElement) => HTMLElement | null,
  pinnedSelector?: string
) {
  const [edges, setEdges] = React.useState<Edges>(initial)
  const findRef = React.useRef(findContainer)
  findRef.current = findContainer

  React.useEffect(() => {
    const rootEl = root.current
    const container = rootEl ? findRef.current(rootEl) : null
    if (!rootEl || !container) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const style = getComputedStyle(container)
        const rtl = style.direction === "rtl"
        const max = container.scrollWidth - container.clientWidth
        // RTL では scrollLeft が 0 から負の値になる。
        const pos = Math.abs(container.scrollLeft)
        const scrollable = max > 1
        const rootBox = rootEl.getBoundingClientRect()
        const box = container.getBoundingClientRect()
        const borderStart = parseFloat(rtl ? style.borderRightWidth : style.borderLeftWidth) || 0
        const borderEnd = parseFloat(rtl ? style.borderLeftWidth : style.borderRightWidth) || 0
        const borderTop = parseFloat(style.borderTopWidth) || 0
        // 左端に固定した列の、スクロールする内容との境目。
        const pinned = pinnedSelector ? container.querySelectorAll<HTMLElement>(pinnedSelector) : []
        let startInset = borderStart
        if (pinned.length > 0) {
          const last = pinned[pinned.length - 1].getBoundingClientRect()
          startInset = rtl ? box.right - last.left : last.right - box.left
        }
        const next: Edges = {
          start: scrollable && pos > 1,
          end: scrollable && pos < max - 1,
          rtl,
          top: box.top - rootBox.top + borderTop,
          // clientHeight はスクロールバーを含まない。影をスクロールバーに重ねない。
          height: container.clientHeight,
          startInset: rtl ? rootBox.right - box.right + startInset : box.left - rootBox.left + startInset,
          endInset: rtl ? box.left - rootBox.left + borderEnd : rootBox.right - box.right + borderEnd,
        }
        setEdges((prev) => (same(prev, next) ? prev : next))
      })
    }
    measure()
    container.addEventListener("scroll", measure, { passive: true })
    const resize = new ResizeObserver(measure)
    resize.observe(container)
    if (container.firstElementChild) resize.observe(container.firstElementChild)
    // 列の固定の切り替え（data-pinned）と、内容の差し替え（Skeleton からデータへ）にも追従する。
    const mutation = new MutationObserver(measure)
    mutation.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-pinned"] })
    return () => {
      cancelAnimationFrame(frame)
      container.removeEventListener("scroll", measure)
      resize.disconnect()
      mutation.disconnect()
    }
  }, [root, pinnedSelector])

  return edges
}

const cue = "pointer-events-none absolute z-[3] w-4 transition-opacity duration-(--duration-fast) ease-standard"
const shade = "color-mix(in srgb, var(--foreground) 9%, transparent)"

function Cues({ edges }: { edges: Edges }) {
  return (
    <>
      <span
        aria-hidden="true"
        data-slot="table-scroll-cue"
        data-edge="start"
        className={cn(cue, edges.start ? "opacity-100" : "opacity-0")}
        style={{
          top: edges.top,
          height: edges.height,
          insetInlineStart: edges.startInset,
          backgroundImage: `linear-gradient(to ${edges.rtl ? "left" : "right"}, ${shade}, transparent)`,
        }}
      />
      <span
        aria-hidden="true"
        data-slot="table-scroll-cue"
        data-edge="end"
        className={cn(cue, edges.end ? "opacity-100" : "opacity-0")}
        style={{
          top: edges.top,
          height: edges.height,
          insetInlineEnd: edges.endInset,
          backgroundImage: `linear-gradient(to ${edges.rtl ? "right" : "left"}, ${shade}, transparent)`,
        }}
      />
    </>
  )
}

const findTableContainer = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-slot=table-container]")

function TableScrollArea({ className, children, ...props }: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(ref, findTableContainer, "thead th[data-pinned=start]")
  return (
    <div
      ref={ref}
      data-slot="table-scroll-area"
      data-scroll-start={edges.start || undefined}
      data-scroll-end={edges.end || undefined}
      className={cn("relative min-w-0", className)}
      {...props}
    >
      {children}
      <Cues edges={edges} />
    </div>
  )
}

const findOwnScroller = (root: HTMLElement) => root.querySelector<HTMLElement>(":scope > [data-slot=horizontal-scroll-container]")

// 表ではない、横に並ぶ内容のスクロールの領域。自身の中の要素が横にスクロールする（ページ全体はスクロールさせない）。
function HorizontalScrollArea({
  className,
  contentClassName,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** スクロールする要素（内容を並べる要素）のクラス */
  contentClassName?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(ref, findOwnScroller)
  return (
    <div
      ref={ref}
      data-slot="horizontal-scroll-area"
      data-scroll-start={edges.start || undefined}
      data-scroll-end={edges.end || undefined}
      className={cn("relative min-w-0", className)}
      {...props}
    >
      <div data-slot="horizontal-scroll-container" className={cn("overflow-x-auto overscroll-x-contain", contentClassName)}>
        {children}
      </div>
      <Cues edges={edges} />
    </div>
  )
}

export { HorizontalScrollArea, TableScrollArea }
