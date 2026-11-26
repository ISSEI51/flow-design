"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Table Scroll Area（Patterns / Data Browsing / List & Detail）
// 表（Table、DataTable）を囲み、横に続く情報があるときだけ、その方向の端に薄い影を表示する。
// 定義は docs/web/patterns/list-and-detail.md の「Table の横スクロール」を参照。
//
// - スクロールは Table の領域（data-slot="table-container"）の中で行う。ページ全体をスクロールさせない（Table の既定）。
// - 影は、スクロールできる方向にだけ表示し、端に着いたらその方向の影を消す。横にスクロールしない場合は表示しない。
// - 左端に固定した列（DataTable の data-pinned="start"）がある場合、左の影は固定した列の右端に表示する。
// - ネイティブのスクロールバーは隠さない。影はスクロールバーの上に重ねない。
// - 影は pointer-events: none の装飾（aria-hidden）で、クリック、文字の選択、フォーカスを妨げない。
// - 内容の幅（列の表示・非表示、列幅）と、領域の幅（Sidebar の開閉、画面の幅）の変化に追従する（ResizeObserver）。
// Table と DataTable は変更しない。囲んだ要素の中の data-slot="table-container" を探して測る。

type Edges = { start: boolean; end: boolean; rtl: boolean; top: number; height: number; startInset: number; endInset: number }

const initial: Edges = { start: false, end: false, rtl: false, top: 0, height: 0, startInset: 0, endInset: 0 }

function TableScrollArea({ className, children, ...props }: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState<Edges>(initial)

  React.useEffect(() => {
    const root = ref.current
    const container = root?.querySelector<HTMLElement>("[data-slot=table-container]")
    if (!root || !container) return
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
        const rootBox = root.getBoundingClientRect()
        const box = container.getBoundingClientRect()
        const borderStart = parseFloat(rtl ? style.borderRightWidth : style.borderLeftWidth) || 0
        const borderEnd = parseFloat(rtl ? style.borderLeftWidth : style.borderRightWidth) || 0
        const borderTop = parseFloat(style.borderTopWidth) || 0
        // 左端に固定した列の、スクロールする内容との境目。
        const pinned = container.querySelectorAll<HTMLElement>("thead th[data-pinned=start]")
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
        setEdges((prev) =>
          prev.start === next.start &&
          prev.end === next.end &&
          prev.rtl === next.rtl &&
          prev.top === next.top &&
          prev.height === next.height &&
          prev.startInset === next.startInset &&
          prev.endInset === next.endInset
            ? prev
            : next
        )
      })
    }
    measure()
    container.addEventListener("scroll", measure, { passive: true })
    const resize = new ResizeObserver(measure)
    resize.observe(container)
    const table = container.querySelector("table")
    if (table) resize.observe(table)
    // 列の固定の切り替え（data-pinned）と、行の差し替え（Skeleton からデータへ）にも追従する。
    const mutation = new MutationObserver(measure)
    mutation.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-pinned"] })
    return () => {
      cancelAnimationFrame(frame)
      container.removeEventListener("scroll", measure)
      resize.disconnect()
      mutation.disconnect()
    }
  }, [])

  const cue = "pointer-events-none absolute z-[3] w-4 transition-opacity duration-(--duration-fast) ease-standard"
  const shade = "color-mix(in srgb, var(--foreground) 9%, transparent)"
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
    </div>
  )
}

export { TableScrollArea }
