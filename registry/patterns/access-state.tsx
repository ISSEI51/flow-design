import type * as React from "react"
import { FileQuestionMark, LogIn, ShieldX } from "lucide-react"

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// Flow Design Access State（Patterns / System & Account / Permission States）
// ページや領域にアクセスできない状態（ログインが必要、閲覧の権限がない、存在しない）を、既存の Empty で示す。
// 定義は docs/web/patterns/permission-states.md を参照。
//
// この部品が守ること
// - HTTP のステータスコードだけを表示しない。状態を文で示し、安全な移動先と解決の方法を actions で示せるようにする。
// - 「存在しない」の既定の文は、存在を明かさないために権限不足を不存在として扱う場合（pageAccessFromStatus の
//   concealForbidden、またはバックエンドが 404 を返す場合）にも、そのまま使える文にする。本当に存在しない場合と同じ文になる。
// - アイコンは飾りとして扱う（Empty の EmptyMedia は aria-hidden）。状態は見出しの文で伝える。
//
// この部品が持たないもの（製品の責務）
// - 応答の判定と情報公開のポリシー（どの対象の権限不足を不存在として扱うか）。バックエンドで保証する。
// - ログイン、権限の申請、移動先の処理。actions に、実際に利用できる操作だけを渡す。

type AccessStateKind = "unauthenticated" | "forbidden" | "not-found"

const defaults: Record<AccessStateKind, { title: string; description: string; Icon: typeof LogIn }> = {
  unauthenticated: {
    title: "ログインが必要です",
    description: "このページを表示するには、ログインしてください。ログインした後、このページに戻ります。",
    Icon: LogIn,
  },
  forbidden: {
    title: "このページを表示する権限がありません",
    description: "必要な場合は、ワークスペースの管理者に閲覧の権限を依頼してください。",
    Icon: ShieldX,
  },
  "not-found": {
    title: "ページが見つかりません",
    description: "URL が正しいかを確認してください。削除された場合や、表示する権限がない場合も、このように表示されます。",
    Icon: FileQuestionMark,
  },
}

function AccessState({
  kind,
  title,
  description,
  actions,
  headingLevel = 1,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  kind: AccessStateKind
  title?: React.ReactNode
  description?: React.ReactNode
  /** 安全な移動先と解決の方法（ログイン、権限の申請、一覧へ戻る）。実際に利用できるものだけを渡す */
  actions?: React.ReactNode
  /** 見出しの段階。ページ全体を置き換える場合は 1、ページの中の領域では 2 以下 */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6
}) {
  const d = defaults[kind]
  return (
    <Empty data-slot="access-state" data-access={kind} {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <d.Icon />
        </EmptyMedia>
        <EmptyTitle role="heading" aria-level={headingLevel}>
          {title ?? d.title}
        </EmptyTitle>
        <EmptyDescription>{description ?? d.description}</EmptyDescription>
      </EmptyHeader>
      {actions && <EmptyContent>{actions}</EmptyContent>}
    </Empty>
  )
}

export { AccessState }
export type { AccessStateKind }
