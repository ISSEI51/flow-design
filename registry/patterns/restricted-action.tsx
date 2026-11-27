"use client"

import * as React from "react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

import type { ActionPresentation } from "@/patterns/access-decision"

// Flow Design Restricted Action（Patterns / System & Account / Permission States）
// 利用が制限された操作を、presentAction の結果（enabled、disabled、hidden）に従って表示し、無効の理由を操作の近くに示す。
// 定義は docs/web/patterns/permission-states.md を参照。
//
// この部品が守ること
// - hidden の操作は描画しない。disabled の操作は、理由の文を操作のすぐ後に表示し、aria-describedby で関連付ける。
// - 無効にした操作もフォーカスできるようにする（focusableWhenDisabled）。キーボードの利用者が操作に移動したときに、
//   理由が読み上げられる。理由は常に表示する文であり、Tooltip（ポインターだけで開き、タッチでは開かない）に依存しない。
// - 理由の種類（data-restriction）を、鍵のアイコンや色だけでなく、文で伝える。
// - 複数の操作が同じ制限を受ける場合は、RestrictionNotice（セクションの説明）の id を describedBy に渡し、操作ごとに
//   同じ文を繰り返さない。
//
// この部品が持たないもの（製品の責務）
// - 許可の判断（decideAccess、presentAction）と、実際の認可（バックエンド）。
// - 理由の文と、解決の方法（権限の申請、管理者への問い合わせ、設定への移動）。実際に利用できる方法だけを製品が渡す。

/** 操作の要素に渡す属性。Flow Design の Button にそのまま渡せる */
type RestrictedControlProps = {
  disabled: boolean
  /** 無効のときもフォーカスできるようにする（Base UI の Button の属性） */
  focusableWhenDisabled: boolean
  "aria-describedby"?: string
  "data-restriction"?: string
}

function RestrictedAction({
  presentation,
  reason,
  resolution,
  describedBy,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  presentation: ActionPresentation
  /** 無効の理由。操作のすぐ後に表示する。セクションの説明で示す場合は省略し、describedBy に説明の id を渡す */
  reason?: React.ReactNode
  /** 解決の方法（権限の申請など）。実際に利用できるものだけを渡す */
  resolution?: React.ReactNode
  /** 理由を示す別の要素（RestrictionNotice など）の id */
  describedBy?: string
  children: (control: RestrictedControlProps) => React.ReactNode
}) {
  const reasonId = React.useId()
  if (presentation.mode === "hidden") return null
  if (presentation.mode === "enabled") {
    return (
      <div data-slot="restricted-action" data-mode="enabled" className={cn("flex min-w-0 flex-col gap-2", className)} {...props}>
        {children({ disabled: false, focusableWhenDisabled: false })}
      </div>
    )
  }
  const ids = [reason ? reasonId : null, describedBy].filter(Boolean).join(" ") || undefined
  return (
    <div
      data-slot="restricted-action"
      data-mode="disabled"
      data-restriction={presentation.reason.kind}
      className={cn("flex min-w-0 flex-col gap-2", className)}
      {...props}
    >
      {children({ disabled: true, focusableWhenDisabled: true, "aria-describedby": ids, "data-restriction": presentation.reason.kind })}
      {reason && (
        <p id={reasonId} data-slot="restriction-reason" className="text-ui text-muted-foreground [word-break:auto-phrase]">
          {reason}
        </p>
      )}
      {resolution && <div className="flex flex-wrap items-center gap-2">{resolution}</div>}
    </div>
  )
}

// セクション単位の制限の説明。複数の操作が同じ理由で制限される場合に、セクションの先頭に 1 つだけ置く。
// 静的な説明であり、role を付けない。権限の変更で後から表示する場合は、製品が Live Region で変更を伝える。
function RestrictionNotice({
  title,
  description,
  actions,
  restriction,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  /** 解決の方法。実際に利用できるものだけを渡す */
  actions?: React.ReactNode
  /** 理由の種類（Restriction の kind） */
  restriction?: string
}) {
  return (
    <Alert variant="neutral" data-slot="restriction-notice" data-restriction={restriction} className={className} {...props}>
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      {actions && <AlertAction>{actions}</AlertAction>}
    </Alert>
  )
}

// 権限の変更などで、フォーカスしていた操作が描画されなくなったときに、代わりの要素（説明の見出しなど）へフォーカスを移す。
// container の中にフォーカスがあり、trigger が変わった描画でフォーカスが失われた（document.body に戻った）場合だけ移す。
// 利用者が自分でほかの場所へフォーカスを移していた場合や、操作が無効になっただけで残っている場合は、フォーカスを動かさない。
// container は、切り替わる前後の内容をどちらも含む、描画し直されない要素にする。
function useFocusRecovery(container: React.RefObject<HTMLElement | null>, fallback: React.RefObject<HTMLElement | null>, trigger: unknown) {
  const inside = React.useRef(false)
  React.useEffect(() => {
    const el = container.current
    if (!el) return
    const onIn = () => {
      inside.current = true
    }
    const onOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null
      if (next && el.contains(next)) return
      if (next) {
        inside.current = false
        return
      }
      // 移動先がない：要素が取り除かれたか、利用者がフォーカスできない場所を押した。
      // 要素が文書に残っている場合は、利用者がフォーカスを外したものとして扱う。
      const target = event.target as Node
      setTimeout(() => {
        if (target.isConnected && !el.contains(document.activeElement)) inside.current = false
      }, 0)
    }
    el.addEventListener("focusin", onIn)
    el.addEventListener("focusout", onOut)
    return () => {
      el.removeEventListener("focusin", onIn)
      el.removeEventListener("focusout", onOut)
    }
  }, [container])
  React.useLayoutEffect(() => {
    if (!inside.current) return
    const active = document.activeElement
    if (active && active !== document.body) return
    // 代わりの要素がまだ描画されていない場合は、次の変化（説明を描画した描画）で移す。
    const target = fallback.current
    if (!target) return
    inside.current = false
    target.focus()
  }, [trigger, fallback])
}

export { RestrictedAction, RestrictionNotice, useFocusRecovery }
export type { RestrictedControlProps }
