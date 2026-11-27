import type * as React from "react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

import type { AuthErrorKind } from "@/patterns/auth-flow"

// Flow Design Auth Feedback（Patterns / System & Account / Authentication）
// 認証のフォーム全体のエラー（Auth Error）と、処理の状態の知らせ（Auth Status）。定義は docs/web/patterns/authentication.md を参照。
// 入力の形式の誤りは、この部品ではなく入力欄の近く（FieldError）に示す。
//
// この部品が守ること
// - 読み上げの領域（role="alert" / role="status"）を常に置き、中身だけを変える。表示と同時に挿入した領域は
//   読み上げられない場合があるため。同じ誤りを続けて送信した場合も読み上げられるよう、製品は error.id を変える。
// - 認証情報の不一致（invalid-credentials）の既定の文は、アカウントが存在しない場合と区別できない文にする。
// - 種類ごとに、次に取る行動を示す。Destructive の色は、認証情報の不一致と通信の失敗（本当のエラー）だけに使い、
//   試行回数の制限、認証のサービスの障害、有効期限の切れは warning にする（利用者の操作の誤りではないため）。
// - フォーカスを移さない（送信した位置で読み上げを聞き、そのまま入力を直せる）。
//
// この部品が持たないもの（製品の責務）
// - エラーの判定（API のエラーを AuthErrorKind に対応させる）。アカウントの列挙の対策、試行回数の制限、応答の安全性。
// - 試行回数の制限の解除までの時間などの値（description で渡す）。

type AuthErrorCopy = { title: string; description: string }

/** 種類ごとの既定の文。製品の言葉に合わせて、title と description で上書きする */
const authErrorCopy: Record<Exclude<AuthErrorKind, "invalid-input">, AuthErrorCopy> = {
  "invalid-credentials": {
    title: "メールアドレスまたはパスワードが正しくありません",
    description: "入力した内容を確かめて、もう一度お試しください。パスワードを忘れた場合は、再設定できます。",
  },
  network: {
    title: "サーバーに接続できませんでした",
    description: "通信の状態を確かめて、もう一度お試しください。",
  },
  "rate-limited": {
    title: "ログインの試行回数が上限に達しました",
    description: "しばらく時間をおいてから、もう一度お試しください。パスワードを忘れた場合は、再設定できます。",
  },
  "service-unavailable": {
    title: "ログインのサービスで障害が発生しています",
    description: "入力した内容の誤りではありません。時間をおいて、もう一度お試しください。",
  },
  expired: {
    title: "有効期限が切れました",
    description: "もう一度、最初から操作してください。",
  },
}

const variantOf = (kind: AuthErrorKind) =>
  kind === "rate-limited" || kind === "service-unavailable" || kind === "expired" ? ("warning" as const) : ("destructive" as const)

type AuthFormErrorValue = {
  /** 変えると、同じ内容でも読み上げ直す（送信ごとに変える） */
  id: string | number
  kind: AuthErrorKind
  title?: React.ReactNode
  description?: React.ReactNode
  /** 次に取る行動（パスワードの再設定へのリンク、別の方法など） */
  action?: React.ReactNode
}

// フォーム全体のエラー。フォームの先頭（見出しの下、最初の入力欄の上）に置く。
function AuthFormError({
  error,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "role"> & { error: AuthFormErrorValue | null }) {
  const copy = error && error.kind !== "invalid-input" ? authErrorCopy[error.kind] : null
  return (
    <div data-slot="auth-form-error" role="alert" aria-atomic="true" className={cn("empty:sr-only", className)} {...props}>
      {error && (
        <Alert key={error.id} variant={variantOf(error.kind)} data-kind={error.kind}>
          <AlertTitle>{error.title ?? copy?.title}</AlertTitle>
          {(error.description ?? copy?.description) && <AlertDescription>{error.description ?? copy?.description}</AlertDescription>}
          {error.action && <AlertAction>{error.action}</AlertAction>}
        </Alert>
      )}
    </div>
  )
}

// 空の間は empty:sr-only で配置から外す（display: none にしない。読み上げの領域として残すため）。
// 処理の状態の知らせ（「確認メールを送信しました」「パスワードを変更しました。新しいパスワードでログインしてください」）。
// 成功の Dialog の代わりに、次の画面の中で知らせる。中身が空の間も領域を置く。
function AuthStatus({ className, children, ...props }: Omit<React.ComponentProps<"p">, "role">) {
  return (
    <p data-slot="auth-status" role="status" aria-live="polite" className={cn("text-ui text-muted-foreground empty:sr-only", className)} {...props}>
      {children}
    </p>
  )
}

export { AuthFormError, AuthStatus, authErrorCopy }
export type { AuthErrorCopy, AuthFormErrorValue }
