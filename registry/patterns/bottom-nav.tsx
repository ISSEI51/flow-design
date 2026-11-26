"use client"

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@/lib/utils"

// Flow Design Bottom Navigation（Patterns / App Structure / Navigation）
// 一般消費者向けのサービスで、主要な機能が 3〜5 個あり、機能の間を頻繁に移動する場合だけ使う、モバイルのナビゲーション。
// 業務アプリケーションのモバイルは、Sidebar の Sheet（左から開く）を標準とする。
// 定義と判断基準は docs/web/patterns/navigation.md を参照。
//
// - AppShellBody の最後（AppShellMain の後）に置く。position: fixed で内容に重ねず、レイアウトの中に置くため、
//   メインの領域の操作対象を隠さない。
// - 下端に Safe Area の余白（--app-safe-bottom。既定は env(safe-area-inset-bottom)）を取る。
// - 項目はアイコンと短いラベル。現在地は aria-current="page"、ニュートラルの面（アイコンの背景）、文字の太さ 600 で示す。
//   ブランドカラーで塗らない。
// - md（768px）以上では表示しない。デスクトップでは Header Shell か Sidebar Shell のナビゲーションを使う。
// - タッチ操作の端末（pointer: coarse）で文字の入力欄にフォーカスがある間は隠し、入力の領域を広げる。
//   ソフトウェアキーボードそのものは検出しない。「タッチ操作の端末で文字の入力欄にフォーカスがある」ことから、
//   キーボードが表示されていると推定する（ハードウェアキーボードを付けたタブレットなどでは、推定が外れる）。

// 文字を入力する input の type。日付や時刻（OS の選択の部品が開く）、チェックボックス、ボタンなどは含めない。
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "tel", "url", "password", "number"])

// フォーカスした要素で、文字を入力するか（ソフトウェアキーボードが表示されると推定できるか）。
// - 読み取り専用と無効の入力欄は、文字を入力しないため含めない。
// - 入力できる Combobox は <input> のため、type で判定する。ボタンの Select（role="combobox"）は含めない。
// - contenteditable は含める。
function isTextEntry(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled
  return false
}

// タッチ操作の端末で、文字の入力欄にフォーカスがあるか。サーバーでの描画と Hydration の間は false。
function useTextEntryFocused() {
  const [focused, setFocused] = React.useState(false)
  React.useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)")
    const update = () => setFocused(coarse.matches && isTextEntry(document.activeElement))
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", update)
    coarse.addEventListener("change", update)
    update()
    return () => {
      document.removeEventListener("focusin", update)
      document.removeEventListener("focusout", update)
      coarse.removeEventListener("change", update)
    }
  }, [])
  return focused
}

function BottomNav({
  className,
  children,
  "aria-label": ariaLabel = "メインメニュー",
  hideWhileTyping = true,
  ...props
}: React.ComponentProps<"nav"> & {
  /** タッチ操作の端末で文字を入力している間は隠す */
  hideWhileTyping?: boolean
}) {
  const typing = useTextEntryFocused()
  const hidden = hideWhileTyping && typing
  return (
    <nav
      aria-label={ariaLabel}
      data-slot="bottom-nav"
      data-hidden={hidden || undefined}
      className={cn(
        "shrink-0 bg-sidebar text-sidebar-foreground md:hidden data-hidden:hidden",
        "pr-(--app-safe-right) pb-(--app-safe-bottom) pl-(--app-safe-left)",
        className
      )}
      {...props}
    >
      <ul className="grid auto-cols-fr grid-flow-col">{children}</ul>
    </nav>
  )
}

function BottomNavItem({
  icon: Icon,
  label,
  isActive = false,
  render,
  className,
  ...props
}: Omit<useRender.ComponentProps<"a">, "children"> & {
  icon: React.ComponentType<{ className?: string }>
  /** 短いラベル（日本語で 2〜5 文字程度）。長い場合は 2 行まで折り返す */
  label: string
  isActive?: boolean
}) {
  const element = useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "group/bottom-nav-item flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5",
          "text-caption text-muted-foreground select-none [word-break:auto-phrase]",
          "transition-colors duration-(--duration-fast) ease-standard",
          "outline-none focus-visible:focus-ring focus-visible:-outline-offset-2 rounded-sm",
          "aria-[current=page]:font-semibold aria-[current=page]:text-sidebar-accent-foreground",
          className
        ),
        "aria-current": isActive ? "page" : undefined,
        children: (
          <>
            <span
              aria-hidden="true"
              className={cn(
                "flex h-8 w-14 items-center justify-center rounded-full",
                "transition-colors duration-(--duration-fast) ease-standard",
                "group-hover/bottom-nav-item:bg-[color-mix(in_srgb,var(--sidebar-accent)_50%,var(--sidebar))]",
                "group-aria-[current=page]/bottom-nav-item:bg-sidebar-accent"
              )}
            >
              <Icon className="size-6" />
            </span>
            <span className="line-clamp-2 max-w-full text-center">{label}</span>
          </>
        ),
      },
      props
    ),
    render,
    state: { slot: "bottom-nav-item", active: isActive },
  })
  return <li className="flex min-w-0">{element}</li>
}

export { BottomNav, BottomNavItem }
