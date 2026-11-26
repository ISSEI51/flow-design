import type * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Auth Layout（Patterns / System & Account / Authentication）
// ログイン、新規登録、多要素認証、パスワードの再設定、再認証の画面の配置。定義は docs/web/patterns/authentication.md を参照。
// 画面全体の骨組み（高さ、スクロール、スキップリンク、<main>）は Minimal Shell（app-shell.tsx の MinimalShell）が持つ。
// この部品は Shell の中身の配置だけを持つため、資料のページの枠の中にも、Minimal Shell の全画面にも置ける。
//
// この部品が守ること
// - フォームの幅は最大 400px（max-w-100）。中央に置き、狭い画面では左右に 16px の余白を取る。
// - 製品のロゴ（logo）、見出し、説明、フォーム、補助の操作（footer）の順に並べる。
// - variant="card" は境界に意味がある場合だけ使う（背景に画像や色がある、ほかの内容と並ぶなど）。
// - variant="split" はブランドや製品の価値を伝える面（aside）を横に置く。コンテナの幅が 48rem 未満では aside を表示せず、
//   フォームだけにする（モバイルで認証のフォームを優先する）。判定は画面の幅ではなく、この部品の幅（Container Query）で行う。
// - 高さを固定しない。画面の高さが足りない場合は、Minimal Shell の <main> がそのままスクロールする。
//
// この部品が持たないもの（製品の責務）
// - 認証の処理、フォームの状態、エラーの判定。children に製品のフォームを渡す。
// - ロゴの画像と製品名、aside の内容（製品の紹介）。既存の利用者のログインのたびに製品の紹介を見せるかは製品が決める。

type AuthLayoutVariant = "minimal" | "card" | "split"

function AuthLayout({
  variant = "minimal",
  logo,
  title,
  description,
  headingLevel = 1,
  aside,
  footer,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  variant?: AuthLayoutVariant
  /** 製品を識別できるロゴ（製品名を含める。画像だけの場合は alt を付ける） */
  logo?: React.ReactNode
  /** 画面の見出し（「ログイン」など） */
  title: React.ReactNode
  /** 見出しの下の説明。見出しと同じ意味の文は置かない */
  description?: React.ReactNode
  /** 見出しの階層。Minimal Shell の全画面では 1。資料のページの例など、ほかの h1 がある場所では 2 や 3 にする */
  headingLevel?: 1 | 2 | 3
  /** variant="split" の横の面（ブランド、製品の価値）。狭い幅では表示しない */
  aside?: React.ReactNode
  /** フォームの下の補助の操作（アカウントの作成、ログインに戻るなど） */
  footer?: React.ReactNode
}) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3"
  const column = (
    <div data-slot="auth-layout-column" className="mx-auto flex w-full max-w-100 min-w-0 flex-col gap-8">
      {logo && <div data-slot="auth-layout-logo">{logo}</div>}
      <div
        data-slot="auth-layout-body"
        className={cn("flex min-w-0 flex-col gap-8", variant === "card" && "rounded-xl border border-border bg-card p-6 @sm/auth:p-8")}
      >
        <div data-slot="auth-layout-header" className="flex flex-col gap-2">
          <Heading data-slot="auth-layout-title" className="text-page-title [word-break:auto-phrase]">
            {title}
          </Heading>
          {description && (
            <div data-slot="auth-layout-description" className="text-body text-muted-foreground [word-break:auto-phrase]">
              {description}
            </div>
          )}
        </div>
        {children}
      </div>
      {footer && (
        <div data-slot="auth-layout-footer" className="flex flex-col items-center gap-2 text-ui">
          {footer}
        </div>
      )}
    </div>
  )

  return (
    <div
      data-slot="auth-layout"
      data-variant={variant}
      className={cn("@container/auth w-full min-w-0", className)}
      {...props}
    >
      {variant === "split" ? (
        <div data-slot="auth-layout-split" className="grid w-full gap-10 px-4 py-10 @3xl/auth:grid-cols-2 @3xl/auth:items-center @3xl/auth:px-10">
          <div className="min-w-0">{column}</div>
          {aside && (
            <aside
              data-slot="auth-layout-aside"
              className="hidden min-w-0 flex-col justify-center gap-4 rounded-2xl bg-muted p-10 @3xl/auth:flex"
            >
              {aside}
            </aside>
          )}
        </div>
      ) : (
        <div className="w-full px-4 py-10 @sm/auth:px-6">{column}</div>
      )}
    </div>
  )
}

export { AuthLayout }
export type { AuthLayoutVariant }
