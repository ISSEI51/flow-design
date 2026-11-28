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
//   復元の前に利用者が操作を始めた場合（読み込み中に検索欄へ入力した場合など）は、復元を取りやめる（watchUserInteraction）。
//   記録の保存（履歴の項目ごと、URL ごと）と、記録を使ってよいか（同じアカウント、ワークスペース、権限か）の判断は製品の責務である。

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

// 利用者の操作とみなすイベント。復元の前に利用者が操作を始めたら、復元を取りやめる（入力中の欄からフォーカスやスクロールを奪わない）。
// スクロールは、プログラムによる変更（内容の高さの変化による位置の調整など）と区別できないため、scroll ではなく、
// スクロールを起こす利用者の操作（wheel、touchmove、キー、スクロールバーの pointerdown）で判断する。
const INTERACTION_EVENTS = ["pointerdown", "keydown", "wheel", "touchmove", "focusin"] as const

/**
 * 利用者の操作（pointerdown、keydown、wheel、touchmove、focusin）を 1 回だけ検知する。戻り値は監視の解除。
 * 位置やフォーカスを後から復元する処理が、復元の前に利用者が操作を始めたかを知るために使う。
 * 復元の処理が自分でフォーカスを移す前に、監視を解除する（自分のフォーカスの移動を操作として扱わない）。
 */
function watchUserInteraction(onInteract: () => void) {
  const options = { capture: true, passive: true } as const
  const stop = () => {
    for (const type of INTERACTION_EVENTS) document.removeEventListener(type, handler, options)
  }
  const handler = () => {
    stop()
    onInteract()
  }
  for (const type of INTERACTION_EVENTS) document.addEventListener(type, handler, options)
  return stop
}

/**
 * 記録した位置を復元する。ready（データの表示が終わった）になった後の最初の描画で、1 回だけ行う。
 * 1. 縦と横のスクロールの位置
 * 2. 記録した行のフォーカスする要素。行がない場合は同じ位置の行（なければ最後の行）、行がない場合は fallbackFocus
 *
 * 取りやめる場合（記録した位置を使わない）
 * - 一覧を表示した後、復元の前に、利用者が操作した（クリック、キーの入力、ホイールやタッチのスクロール、フォーカスの移動）。
 *   読み込みの間に検索欄へ入力を始めた場合などに、フォーカスとスクロールを奪わない。
 * - targetKey（記録したときの条件のキー）と dataKey（表示しているデータの条件のキー）を渡し、両者が異なる。
 *   条件が変わった後の結果に、前の条件の位置を当てはめない。この場合は、何もフォーカスしていないときだけ fallbackFocus へ移す。
 *
 * scrollReady：保持していたデータ（initialData）で同じ条件の行を先に表示している場合に true にする。
 * スクロールの位置だけを先に戻し、フォーカスは ready（取得し直した結果）を待って戻す（削除された行にフォーカスしない）。
 */
function useListPositionRestore({
  position,
  ready,
  scrollReady = false,
  root,
  scrollElement,
  fallbackFocus,
  onRestored,
  targetKey,
  dataKey,
}: {
  /** 復元する位置。null なら何もしない（初めて一覧を開いた場合） */
  position: ListPosition | null
  /** データの表示が終わった（再取得中でも、表示中の行が復元の対象と同じ条件の結果なら true でよい） */
  ready: boolean
  /** 復元の対象と同じ条件の行を表示している（取得し直す前の保持していたデータを含む）。スクロールの位置だけを先に戻す */
  scrollReady?: boolean
  root: React.RefObject<HTMLElement | null>
  scrollElement: React.RefObject<HTMLElement | null>
  /** 行がないときのフォーカスの移動先（検索欄、Empty の操作など） */
  fallbackFocus?: () => HTMLElement | null
  /** 復元を終えた、または取りやめた（利用者の操作、条件の不一致）。製品は記録を破棄してよい */
  onRestored?: () => void
  /** 位置を記録したときの条件のキー。dataKey と組で渡す */
  targetKey?: string | null
  /** 表示しているデータの条件のキー（useBrowseData の dataKey） */
  dataKey?: string | null
}) {
  const done = React.useRef<ListPosition | null>(null)
  const scrolled = React.useRef<ListPosition | null>(null)
  const cancelled = React.useRef<ListPosition | null>(null)
  const stopWatching = React.useRef<(() => void) | null>(null)
  const fallbackRef = React.useRef(fallbackFocus)
  const restoredRef = React.useRef(onRestored)
  React.useLayoutEffect(() => {
    fallbackRef.current = fallbackFocus
    restoredRef.current = onRestored
  })

  // 一覧を表示した時点から、復元が終わるまで、利用者の操作を監視する。
  React.useEffect(() => {
    if (!position || done.current === position) return
    const stop = watchUserInteraction(() => {
      cancelled.current = position
      // 取りやめた場合も、記録を使い終えたことを知らせる（製品が記録を破棄し、後から作り直した一覧で古い位置を戻さない）。
      restoredRef.current?.()
    })
    stopWatching.current = stop
    return () => {
      stop()
      if (stopWatching.current === stop) stopWatching.current = null
    }
  }, [position])

  const keyMismatch = targetKey != null && dataKey != null && targetKey !== dataKey

  React.useEffect(() => {
    if (!position || done.current === position || cancelled.current === position) return
    const earlyScroll = scrollReady && !ready && !keyMismatch && scrolled.current !== position
    if (!ready && !earlyScroll) return
    const frame = requestAnimationFrame(() => {
      if (cancelled.current === position || done.current === position) return
      const scroller = scrollElement.current
      const area = root.current
      const restoreScroll = () => {
        if (scrolled.current === position) return
        scrolled.current = position
        if (scroller) scroller.scrollTop = position.scrollTop
        const container = area?.querySelector<HTMLElement>("[data-slot=table-container]")
        if (container) container.scrollLeft = position.scrollLeft
      }
      if (!ready) {
        restoreScroll()
        return
      }
      done.current = position
      // 自分で移すフォーカスを、利用者の操作として扱わない。
      stopWatching.current?.()
      stopWatching.current = null
      if (keyMismatch) {
        // 条件が変わった：前の条件の位置と行を当てはめない。フォーカスが失われている場合だけ、次の操作の起点へ移す。
        const active = document.activeElement
        if (!active || active === document.body) fallbackRef.current?.()?.focus({ preventScroll: true })
        restoredRef.current?.()
        return
      }
      restoreScroll()
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
  }, [position, ready, scrollReady, keyMismatch, root, scrollElement])
}

export { captureListPosition, getRecordNeighbors, useListPositionRestore, watchUserInteraction }
export type { ListPosition, RecordNeighbors }
