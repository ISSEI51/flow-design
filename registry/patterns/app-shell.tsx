"use client"

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// Flow Design App Shell（Patterns / App Structure）
// 製品の画面全体の骨組み。Sidebar Shell を標準とし、Header Shell、Hybrid Shell、Minimal Shell も同じ部品で組み立てる。
// 定義と判断基準は docs/web/patterns/app-shell.md を参照。
//
// この部品が持つもの
// - 画面の高さ（100dvh）とスクロールの領域。ページ全体（document）はスクロールさせず、<main> だけを縦にスクロールさせる。
//   Sidebar（SidebarContent）は Sidebar の中で独立してスクロールする。
// - メインコンテンツへのスキップリンク（最初にフォーカスが移る要素）。
// - ページを移動した後のフォーカスとスクロールの位置（pageKey が変わったとき）。
// - Safe Area の余白（--app-safe-top などの CSS 変数。既定は env(safe-area-inset-*)）。
//
// Sidebar を置かない構成（Header Shell、Bottom Navigation の例）では、keyboardShortcut={false} を渡す。
// 既定のままでは、開く対象のない Ctrl / ⌘ + B を受け取り、ブラウザの既定の操作（ブックマークの表示など）を止める。
//
// この部品が持たないもの（製品の責務）
// - ルーティング、現在地の判定、認証、権限、データの取得。pageKey と、ナビゲーションの項目は製品が渡す。
// - Sidebar の開閉の状態の保存（sidebarOpen と onSidebarOpenChange で受け取り、製品の方法で保存する）。
// - 戻る・進むでのスクロールの復元（useAppShell().mainRef で <main> を受け取り、製品のルーターで行う）。
// - viewport の meta の viewport-fit=cover（Safe Area の値を使うために製品の HTML で指定する）。

type AppShellContextValue = {
  /** <main> の id。スキップリンクの移動先 */
  mainId: string
  /** スクロールの領域（<main>）。スクロールの復元など、製品の処理で使う */
  mainRef: React.RefObject<HTMLElement | null>
  /** <main> にフォーカスを移す（スキップリンク） */
  focusMain: () => void
}

const AppShellContext = React.createContext<AppShellContextValue | null>(null)

function useAppShell() {
  const context = React.useContext(AppShellContext)
  if (!context) throw new Error("useAppShell must be used within an AppShell.")
  return context
}

// Safe Area の値。製品が env() 以外の値（検品での擬似的な値など）を使う場合は、これらの変数を上書きする。
const safeAreaVars =
  "[--app-safe-top:env(safe-area-inset-top,0px)] [--app-safe-right:env(safe-area-inset-right,0px)] [--app-safe-bottom:env(safe-area-inset-bottom,0px)] [--app-safe-left:env(safe-area-inset-left,0px)]"

function AppShell({
  sidebarOpen,
  defaultSidebarOpen = true,
  onSidebarOpenChange,
  keyboardShortcut,
  skipLinkLabel = "メインコンテンツへ移動",
  mainId: mainIdProp,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "dir"> & {
  /** Sidebar の展開の状態（制御する場合） */
  sidebarOpen?: boolean
  defaultSidebarOpen?: boolean
  onSidebarOpenChange?: (open: boolean) => void
  /** Sidebar を開閉するキー（Ctrl / ⌘ と組み合わせる）。false で無効にする */
  keyboardShortcut?: string | false
  /** スキップリンクの文言 */
  skipLinkLabel?: string
  /** <main> の id。省略すると自動で付ける */
  mainId?: string
}) {
  const generatedId = React.useId()
  const mainId = mainIdProp ?? `app-main-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`
  const mainRef = React.useRef<HTMLElement | null>(null)
  const focusMain = React.useCallback(() => {
    const main = mainRef.current
    if (!main) return
    main.focus({ preventScroll: true })
  }, [])
  const value = React.useMemo(() => ({ mainId, mainRef, focusMain }), [mainId, focusMain])

  return (
    <AppShellContext.Provider value={value}>
      <SidebarProvider
        // data-slot は SidebarProvider の sidebar-wrapper を残す（キーボードの操作が参照する）。
        data-app-shell=""
        open={sidebarOpen}
        defaultOpen={defaultSidebarOpen}
        onOpenChange={onSidebarOpenChange}
        keyboardShortcut={keyboardShortcut}
        // 画面の高さに固定し、document をスクロールさせない。dvh はモバイルのブラウザの表示領域の変化に追従する。
        className={cn("group/app-shell relative h-dvh min-h-0 overflow-hidden bg-background", safeAreaVars, className)}
        {...props}
      >
        <a
          href={`#${mainId}`}
          data-slot="app-shell-skip-link"
          onClick={(event) => {
            // ハッシュによるルーティングを使う製品でも URL を変えずに移動する。
            event.preventDefault()
            focusMain()
          }}
          className={cn(
            "sr-only focus:not-sr-only focus:fixed focus:top-[calc(var(--app-safe-top)+0.5rem)] focus:left-[calc(var(--app-safe-left)+0.5rem)] focus:z-50",
            "focus:inline-flex focus:min-h-control focus:items-center focus:rounded-lg focus:bg-background focus:px-5",
            "focus:text-ui focus:font-medium focus:text-foreground focus:shadow-popover focus-visible:focus-ring"
          )}
        >
          {skipLinkLabel}
        </a>
        {children}
      </SidebarProvider>
    </AppShellContext.Provider>
  )
}

// Sidebar の右側の列。上から AppShellHeader（必要な場合だけ）、AppShellMain、BottomNav（必要な場合だけ）を置く。
function AppShellBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <SidebarInset
      render={<div />}
      data-app-shell-body=""
      className={cn("h-full min-h-0 overflow-hidden", className)}
      {...props}
    />
  )
}

// グローバルヘッダー。全画面で共通の操作（検索、お知らせ、機能群の切り替えなど）がある場合と、
// モバイルでメニューを開くボタンを置く場合だけ使う。デスクトップで不要な場合は className="md:hidden" にする。
function AppShellHeader({ className, render, ...props }: useRender.ComponentProps<"header">) {
  return useRender({
    defaultTagName: "header",
    props: mergeProps<"header">(
      {
        className: cn(
          "flex min-h-16 shrink-0 items-center gap-2 bg-background",
          "pt-(--app-safe-top) pr-[max(1rem,var(--app-safe-right))] pl-[max(1rem,var(--app-safe-left))]",
          "md:pr-[max(1.5rem,var(--app-safe-right))] md:pl-[max(1.5rem,var(--app-safe-left))]",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "app-shell-header" },
  })
}

type FocusTarget = "heading" | "main" | false

// 移動先のページの見出し（h1）。なければ <main>。
function focusTargetIn(main: HTMLElement, target: FocusTarget) {
  if (target === false) return null
  if (target === "heading") {
    const heading = main.querySelector<HTMLElement>("h1")
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1")
      return heading
    }
  }
  return main
}

// Sidebar のモバイルの Sheet が閉じ終わる（Base UI がフォーカスを開いたボタンに戻す）のを待つ。
function afterMobileMenuClosed(callback: () => void) {
  let frame = 0
  let count = 0
  const check = () => {
    // 閉じる動きは --duration-slow（240ms）。動きを減らす設定では 0ms。上限を超えたら待たずに移す。
    if (document.querySelector("[data-slot=sidebar][data-mobile=true]") && count++ < 120) {
      frame = requestAnimationFrame(check)
      return
    }
    callback()
  }
  frame = requestAnimationFrame(check)
  return () => cancelAnimationFrame(frame)
}

// 主要な内容の領域（<main>）。縦のスクロールはこの要素で行う。
function AppShellMain({
  pageKey,
  focusOnNavigate = "heading",
  scrollOnNavigate = "top",
  className,
  ...props
}: React.ComponentProps<"main"> & {
  /** 現在のページを表す値（パスなど）。変わったときに、スクロールの位置とフォーカスを移動先のページに合わせる */
  pageKey?: string
  /** 移動の後にフォーカスを移す先。heading はページの h1（なければ <main>）。false は移さない */
  focusOnNavigate?: FocusTarget
  /** 移動の後のスクロール。top は先頭に戻す。false は製品が復元する */
  scrollOnNavigate?: "top" | false
}) {
  const { mainId, mainRef } = useAppShell()
  const previousKey = React.useRef(pageKey)

  React.useEffect(() => {
    // 最初の表示ではフォーカスを動かさない（ブラウザの既定の位置から操作を始める）。
    if (previousKey.current === pageKey) return
    previousKey.current = pageKey
    const main = mainRef.current
    if (!main) return
    if (scrollOnNavigate === "top") main.scrollTo({ top: 0, left: 0 })
    return afterMobileMenuClosed(() => {
      const target = focusTargetIn(main, focusOnNavigate)
      target?.focus({ preventScroll: true })
    })
  }, [pageKey, focusOnNavigate, scrollOnNavigate, mainRef])

  return (
    <main
      ref={mainRef}
      id={mainId}
      tabIndex={-1}
      data-slot="app-shell-main"
      className={cn(
        "relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain outline-none",
        // 固定した要素（Sticky の Page Header）の下にフォーカスした要素が隠れないよう、スクロールの余白を取る。
        "scroll-pt-(--app-shell-sticky-top,0px)",
        // 左右の Safe Area。デスクトップの Sidebar が左端にある場合は、左の余白を Sidebar の側に任せる。
        "pr-(--app-safe-right) pl-(--app-safe-left) md:group-has-[[data-slot=sidebar-container]]/app-shell:pl-0",
        className
      )}
      {...props}
    />
  )
}

// Minimal Shell：ログインや、集中して行う操作の画面。ナビゲーションを置かず、製品名と内容だけを示す。
// 内容は縦方向の中央に置き、画面に収まらない場合は上から並べてスクロールする。
function MinimalShell({
  header,
  skipLinkLabel = "メインコンテンツへ移動",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** 製品名やロゴ、言語の切り替えなど。ナビゲーションは置かない */
  header?: React.ReactNode
  skipLinkLabel?: string
}) {
  const mainRef = React.useRef<HTMLElement>(null)
  const mainId = `minimal-main-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <div
      data-slot="minimal-shell"
      className={cn("flex h-dvh min-h-0 flex-col overflow-hidden bg-background", safeAreaVars, className)}
      {...props}
    >
      <a
        href={`#${mainId}`}
        data-slot="app-shell-skip-link"
        onClick={(event) => {
          event.preventDefault()
          mainRef.current?.focus({ preventScroll: true })
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-[calc(var(--app-safe-top)+0.5rem)] focus:left-[calc(var(--app-safe-left)+0.5rem)] focus:z-50 focus:inline-flex focus:min-h-control focus:items-center focus:rounded-lg focus:bg-background focus:px-5 focus:text-ui focus:font-medium focus:shadow-popover focus-visible:focus-ring"
      >
        {skipLinkLabel}
      </a>
      {header && (
        <header
          data-slot="minimal-shell-header"
          className="flex min-h-16 shrink-0 items-center gap-2 pt-(--app-safe-top) pr-[max(1rem,var(--app-safe-right))] pl-[max(1rem,var(--app-safe-left))] md:pr-[max(1.5rem,var(--app-safe-right))] md:pl-[max(1.5rem,var(--app-safe-left))]"
        >
          {header}
        </header>
      )}
      <main
        ref={mainRef}
        id={mainId}
        tabIndex={-1}
        data-slot="minimal-shell-main"
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain pr-(--app-safe-right) pb-(--app-safe-bottom) pl-(--app-safe-left) outline-none"
      >
        <div className="my-auto w-full">{children}</div>
      </main>
    </div>
  )
}

export { AppShell, AppShellBody, AppShellHeader, AppShellMain, MinimalShell, useAppShell }
