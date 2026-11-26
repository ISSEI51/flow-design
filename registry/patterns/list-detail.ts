"use client"

import * as React from "react"

// Flow Design List & Detail（Patterns / Data Browsing）
// 一覧と詳細の行き来に必要な処理。定義と判断基準は docs/web/patterns/list-and-detail.md を参照。
//
// - getRecordNeighbors：詳細の前後の移動。現在の一覧（フィルターとソートを適用した順）の ID から求める。
//   表示中のページの外（サーバー側のページ送りで読み込んでいない行）は、前後のデータがわからないため null を返す。
// - captureListPosition / useListPositionRestore：一覧から離れるときの位置（縦と横のスクロール、フォーカスしていた行）
//   を記録し、戻ったときに、データの表示が終わってから復元する。
//   縦のスクロールの領域は AppShellMain（useAppShell().mainRef）。復元する場合は AppShellMain に
//   scrollOnNavigate={false} と focusOnNavigate={false} を渡し、既定の「先頭へ戻す」「h1 へフォーカス」を止める。
//   記録の保存（履歴の項目ごと、URL ごと）は製品の責務である。

type RecordNeighbors = {
  previousId: string | null
  nextId: string | null
  /** 一覧の中の位置（1 から）。わからない場合は null */
  position: number | null
  /** 一覧の件数。わからない場合は null */
  total: number | null
}

function getRecordNeighbors({
  ids,
  activeId,
  offset = 0,
  total = null,
}: {
  /** 表示中の一覧の ID（フィルターとソートを適用した順） */
  ids: readonly string[]
  activeId: string | null
  /** ids の先頭の、一覧の全体の中での位置（0 から。ページ送りの開始位置） */
  offset?: number
  /** 一覧の正確な件数。わからない場合は null */
  total?: number | null
}): RecordNeighbors {
  const index = activeId === null ? -1 : ids.indexOf(activeId)
  if (index < 0) return { previousId: null, nextId: null, position: null, total }
  return {
    previousId: ids[index - 1] ?? null,
    nextId: ids[index + 1] ?? null,
    position: offset + index + 1,
    total,
  }
}

type ListPosition = {
  /** 縦のスクロールの位置（AppShellMain） */
  scrollTop: number
  /** 横のスクロールの位置（表の領域） */
  scrollLeft: number
  /** フォーカスしていた行（詳細を開いた行）の ID */
  rowId: string | null
  /** その行の、表示中の行の中の位置（行がなくなったときに、近くの行を選ぶために使う） */
  rowIndex: number | null
}

// 行は data-row-id で探す。DataTable は行（tr）に付ける。List、Card などの表示形式では、製品が付ける。
const ROW = "[data-row-id]"
// 行の中でフォーカスを戻す要素。優先する順に探す。
const ROW_FOCUS = ["[data-row-focus]", "[data-slot=data-table-row-trigger]", "a[href]", "button:not([disabled])"]

function rowsIn(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>(ROW))
}

/** 一覧から離れる直前の位置を記録する */
function captureListPosition({
  scrollElement,
  root,
  rowId,
}: {
  scrollElement: HTMLElement | null
  /** 一覧の領域（表、表示形式の領域を含む要素） */
  root: HTMLElement | null
  rowId: string | null
}): ListPosition {
  const container = root?.querySelector<HTMLElement>("[data-slot=table-container]")
  const index = root && rowId ? rowsIn(root).findIndex((r) => r.dataset.rowId === rowId) : -1
  return {
    scrollTop: scrollElement?.scrollTop ?? 0,
    scrollLeft: container?.scrollLeft ?? 0,
    rowId,
    rowIndex: index >= 0 ? index : null,
  }
}

function focusTargetInRow(row: HTMLElement) {
  for (const selector of ROW_FOCUS) {
    const el = row.querySelector<HTMLElement>(selector)
    if (el) return el
  }
  return row.tabIndex >= 0 ? row : null
}

/**
 * 記録した位置を復元する。ready（データの表示が終わった）になった後の最初の描画で、1 回だけ行う。
 * 1. 縦と横のスクロールの位置
 * 2. 記録した行のフォーカスする要素。行がない場合は同じ位置の行（なければ最後の行）、行がない場合は fallbackFocus
 */
function useListPositionRestore({
  position,
  ready,
  root,
  scrollElement,
  fallbackFocus,
  onRestored,
}: {
  /** 復元する位置。null なら何もしない（初めて一覧を開いた場合） */
  position: ListPosition | null
  /** データの表示が終わった（再取得中でも、表示中の行が復元の対象と同じ条件の結果なら true でよい） */
  ready: boolean
  root: React.RefObject<HTMLElement | null>
  scrollElement: React.RefObject<HTMLElement | null>
  /** 行がないときのフォーカスの移動先（検索欄、Empty の操作など） */
  fallbackFocus?: () => HTMLElement | null
  onRestored?: () => void
}) {
  const done = React.useRef<ListPosition | null>(null)
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
      const container = area?.querySelector<HTMLElement>("[data-slot=table-container]")
      if (container) container.scrollLeft = position.scrollLeft
      let target: HTMLElement | null = null
      if (area) {
        const rows = rowsIn(area)
        const row =
          rows.find((r) => r.dataset.rowId === position.rowId) ??
          (position.rowIndex !== null && rows.length > 0 ? rows[Math.min(position.rowIndex, rows.length - 1)] : undefined)
        if (row) target = focusTargetInRow(row)
      }
      target ??= fallbackRef.current?.() ?? null
      if (target) {
        target.focus({ preventScroll: true })
        // 行が変わった（削除された）場合などで、フォーカスした要素が表示範囲の外にあるときだけ、近くまでスクロールする。
        if (scroller) {
          const a = target.getBoundingClientRect()
          const b = scroller.getBoundingClientRect()
          if (a.top < b.top || a.bottom > b.bottom) target.scrollIntoView({ block: "nearest" })
        }
      }
      restoredRef.current?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [position, ready, root, scrollElement])
}

export { captureListPosition, getRecordNeighbors, useListPositionRestore }
export type { ListPosition, RecordNeighbors }
