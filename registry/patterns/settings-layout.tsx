"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

// Flow Design Settings Layout（Patterns / System & Account / Settings）
// 独立した複数のカテゴリを持つ設定の画面の、カテゴリの一覧（Settings Navigation）と内容の配置。
// 定義と判断基準は docs/web/patterns/settings.md を参照。Page Layout（standard）の中に置く。
//
// - 広い領域（48rem 以上）：左にカテゴリの一覧（14rem）、右に選んだカテゴリの内容を置く（Sidebar 型）。
// - 狭い領域：カテゴリの一覧と内容を別のページとして扱う。view="list" は一覧だけ、view="detail" は内容と
//   一覧へ戻るリンク（SettingsBackLink）だけを示す。デスクトップの一覧を縮めて内容の横に残さない。
//   どちらを示すかは置かれた領域の幅（Container Query）で決め、描画の時点で window を読まない（SSR で同じ HTML になる）。
// - 項目の少ない設定は、この部品を使わず 1 つのページにする。関連の強い少数のカテゴリは Tabs を使う（資料を参照）。
//
// この部品が守ること
// - 現在のカテゴリを aria-current="page" で示す。リンクは <a href> で、修飾キー付きのクリックはブラウザに任せる。
// - 一覧の項目と戻るリンクは 40px 以上（狭い領域では 48px）の高さを持つ。
//
// この部品が持たないもの（製品の責務）
// - ルーティング（カテゴリの URL、戻る操作の履歴）、カテゴリの表示の可否（権限）、移動の前の未保存の変更の確認。
// - 移動の後のフォーカス（カテゴリの見出しへ移す。一覧へ戻ったら、開いていたカテゴリの項目へ移す）。

function SettingsLayout({
  view,
  nav,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** 狭い領域で示すもの。list：カテゴリの一覧、detail：選んだカテゴリの内容。広い領域では両方を示す */
  view: "list" | "detail"
  /** カテゴリの一覧（SettingsNav など） */
  nav: React.ReactNode
}) {
  return (
    <div data-slot="settings-layout" data-view={view} className={cn("@container/settings min-w-0", className)} {...props}>
      <div className="grid min-w-0 grid-cols-1 gap-8 @3xl/settings:grid-cols-[14rem_minmax(0,1fr)] @3xl/settings:gap-12">
        <div data-slot="settings-layout-nav" className={cn("min-w-0", view === "detail" && "@max-3xl/settings:hidden")}>
          {nav}
        </div>
        <div data-slot="settings-layout-content" className={cn("min-w-0", view === "list" && "@max-3xl/settings:hidden")}>
          {children}
        </div>
      </div>
    </div>
  )
}

type SettingsNavItem = {
  id: string
  label: string
  href: string
  /** 狭い領域の一覧で、名前の下に示す補足（含まれる設定の例） */
  description?: string
}

type SettingsNavGroup = {
  id: string
  /** 適用範囲の名前（「個人の設定」「組織の設定」）。対象の名前（アカウント、ワークスペース）を含める */
  label: string
  items: SettingsNavItem[]
}

const isPlainClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

function SettingsNav({
  groups,
  currentId,
  onNavigate,
  header,
  "aria-label": ariaLabel = "設定のカテゴリ",
  className,
}: {
  groups: SettingsNavGroup[]
  /** 現在のカテゴリ。狭い領域の一覧だけを示している間は null を渡してよい */
  currentId: string | null
  /** カテゴリを選んだとき。製品のルーターで移動する（未保存の変更の確認もここで行う） */
  onNavigate: (id: string, event: React.MouseEvent<HTMLAnchorElement>) => void
  /** 一覧の上に置く要素（設定の検索のボタンなど） */
  header?: React.ReactNode
  "aria-label"?: string
  className?: string
}) {
  return (
    <nav data-slot="settings-nav" aria-label={ariaLabel} className={cn("flex min-w-0 flex-col gap-6", className)}>
      {header}
      {groups.map((group) => (
        <div key={group.id} className="flex min-w-0 flex-col gap-2">
          {/* 見出しの階層に加えない（カテゴリの内容の見出しと競合させない）。一覧の名前として使う */}
          <p id={`settings-nav-${group.id}`} className="px-3 text-caption text-muted-foreground @max-3xl/settings:px-0">
            {group.label}
          </p>
          <ul aria-labelledby={`settings-nav-${group.id}`} className="flex min-w-0 flex-col gap-0.5 @max-3xl/settings:gap-0">
            {group.items.map((item) => {
              const current = item.id === currentId
              return (
                <li key={item.id} className="@max-3xl/settings:border-b @max-3xl/settings:border-border @max-3xl/settings:last:border-b-0">
                  <a
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    data-setting-category={item.id}
                    onClick={(e) => {
                      if (!isPlainClick(e)) return
                      e.preventDefault()
                      onNavigate(item.id, e)
                    }}
                    className={cn(
                      "flex min-h-10 min-w-0 items-center gap-3 rounded-sm px-3 py-2 text-ui outline-none focus-visible:focus-ring",
                      "transition-[background-color] duration-(--duration-fast) ease-standard hover:bg-accent",
                      current && "bg-accent font-medium @max-3xl/settings:bg-transparent",
                      "@max-3xl/settings:min-h-control @max-3xl/settings:px-0 @max-3xl/settings:py-3 @max-3xl/settings:hover:bg-transparent"
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="[word-break:auto-phrase] @max-3xl/settings:text-body @max-3xl/settings:font-medium">{item.label}</span>
                      {item.description && (
                        <span className="hidden text-ui text-muted-foreground [word-break:auto-phrase] @max-3xl/settings:block">{item.description}</span>
                      )}
                    </span>
                    <ChevronRight aria-hidden="true" className="hidden size-5 shrink-0 text-muted-foreground @max-3xl/settings:block" />
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

// 狭い領域で、カテゴリの内容から一覧へ戻るリンク。広い領域では一覧が隣にあるため示さない。
function SettingsBackLink({
  href,
  onNavigate,
  children = "設定",
  className,
}: {
  href: string
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>) => void
  /** 戻る先の名前 */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <a
      href={href}
      data-slot="settings-back-link"
      onClick={(e) => {
        if (!isPlainClick(e)) return
        e.preventDefault()
        onNavigate(e)
      }}
      className={cn(
        "-ms-2 inline-flex min-h-control w-fit items-center gap-1 rounded-sm pe-3 ps-1 text-ui font-medium outline-none focus-visible:focus-ring @3xl/settings:hidden",
        className
      )}
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
      {children}
    </a>
  )
}

export { SettingsBackLink, SettingsLayout, SettingsNav }
export type { SettingsNavGroup, SettingsNavItem }
