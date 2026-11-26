"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Page Header（Patterns / App Structure）
// ページの目的（タイトル）と、ページ全体に対する操作をまとめる。定義と判断基準は docs/web/patterns/page-header.md を参照。
//
// - 左にタイトル（28px / 600、<h1>）、右に操作。補足の説明（14px）は必要な場合だけ置き、タイトルとの間は 8px。
// - 操作の間は 8px。主要な操作（Primary）は 1 つまで。補助の操作は Secondary か Ghost にする。
// - 操作がタイトルの右に収まる場合は右に置き、収まらない場合はタイトルの下に置く。タイトルには少なくとも 20rem を残す。
//   幅の判断は、画面の幅ではなく Page Header が置かれた領域の幅で行う（Sidebar の開閉に追従する）。
// - 背景はメインの内容と同じ。境界線と Card は使わない。メインの内容との間（24〜32px）は PageLayout が取る。
// - Breadcrumb は、階層や現在地がわかりにくい場合だけ、breadcrumb に渡してタイトルの上に置く。
// - sticky は、常に確認する情報や頻繁な操作がある場合だけ使う。固定している間だけ下に細い境界線を引き、
//   スクロールの領域に scroll-padding-top を設定して、フォーカスした要素が Page Header の下に隠れないようにする。
//   Sticky の Page Header は、1 つのスクロールの領域に 1 つまで（scroll-padding-top を 1 つの値で設定するため）。

// 縦にスクロールする最も近い祖先。見つからない場合は document のスクロール（null）。
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === "auto" || overflowY === "scroll") return p
  }
  return null
}

function useStickyHeader(ref: React.RefObject<HTMLElement | null>, sentinel: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [stuck, setStuck] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    const mark = sentinel.current
    if (!enabled || !el || !mark) return
    const root = scrollParent(el)
    const target = root ?? document.documentElement
    // 固定した高さの分だけ、スクロールの領域の上端に余白を取る（WCAG 2.4.11 Focus Not Obscured）。
    const resize = new ResizeObserver(() => {
      target.style.setProperty("--app-shell-sticky-top", `${el.offsetHeight}px`)
      target.style.scrollPaddingTop = `${el.offsetHeight}px`
    })
    resize.observe(el)
    // Page Header の元の位置（sentinel）が領域の上端より上に出たら、固定している状態とみなす。
    const intersection = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { root, threshold: 0 })
    intersection.observe(mark)
    return () => {
      resize.disconnect()
      intersection.disconnect()
      target.style.removeProperty("--app-shell-sticky-top")
      target.style.scrollPaddingTop = ""
    }
  }, [ref, sentinel, enabled])
  return enabled && stuck
}

function PageHeader({
  breadcrumb,
  sticky = false,
  className,
  children,
  ...props
}: React.ComponentProps<"header"> & {
  /** 階層や現在地がわかりにくい場合だけ置く Breadcrumb */
  breadcrumb?: React.ReactNode
  /** スクロールしても上端に固定する */
  sticky?: boolean
}) {
  const ref = React.useRef<HTMLElement>(null)
  const sentinel = React.useRef<HTMLDivElement>(null)
  const stuck = useStickyHeader(ref, sentinel, sticky)
  return (
    <>
      {/* 印。absolute にして親（PageLayout）の gap に加わらないようにし、ページの上の余白の上端（Page Header が固定され始める位置）に置く */}
      {sticky && (
        <div
          ref={sentinel}
          aria-hidden="true"
          data-slot="page-header-sentinel"
          className="pointer-events-none absolute -top-(--page-padding-top,0px) h-px w-px"
        />
      )}
      <header
        ref={ref}
        data-slot="page-header"
        data-sticky={sticky || undefined}
        data-stuck={stuck || undefined}
        className={cn(
          "flex min-w-0 flex-col gap-2 bg-background",
          // 固定するときは、ページの上の余白（PageLayout の --page-padding-top）を Page Header の内側に含め、
          // 内容が上の余白に見えないようにする。下の 16px は内容との間の一部として重ねる。
          sticky &&
            "sticky top-0 z-20 -mt-(--page-padding-top,0px) -mb-4 pt-(--page-padding-top,0px) pb-4 transition-[border-color] duration-(--duration-fast) border-b border-transparent data-stuck:border-border",
          className
        )}
        {...props}
      >
        {breadcrumb}
        <div data-slot="page-header-row" className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-4">
          {children}
        </div>
      </header>
    </>
  )
}

// タイトルと補足の説明（必要ならステータス）のまとまり。
function PageHeaderContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-content"
      className={cn("flex min-w-0 flex-[1_1_20rem] flex-col gap-2", className)}
      {...props}
    />
  )
}

function PageHeaderTitle({
  as: Comp = "h1",
  className,
  ...props
}: React.ComponentProps<"h1"> & {
  /** 見出しの要素。ページのタイトルは h1。資料の中の例などで、文書の見出しの階層に合わせる場合だけ変える */
  as?: "h1" | "h2" | "h3"
}) {
  return (
    <Comp
      data-slot="page-header-title"
      className={cn(
        "min-w-0 text-page-title [overflow-wrap:anywhere] [word-break:auto-phrase]",
        // ページの移動の後に AppShellMain がフォーカスを移す先。操作の対象ではないため、フォーカスの枠は表示しない。
        "outline-none",
        className
      )}
      {...props}
    />
  )
}

function PageHeaderDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-description"
      className={cn("max-w-[40rem] text-ui text-muted-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

// ページ全体に対する操作。主要な操作は最後（右端）に置く。
function PageHeaderActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn("flex max-w-full min-w-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle }
