"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// Flow Design Password Input（Patterns / System & Account / Authentication）
// パスワードの入力欄と、表示・非表示の切り替え。定義は docs/web/patterns/authentication.md を参照。
// 既存の Input（Field.Control）をそのまま使うため、Field の中に置くと、ラベル、説明、エラーが関連付けられる。
//
// この部品が守ること
// - 初期状態は非表示（type="password"）。
// - 切り替えのボタンは type="button"（フォームを送信しない）。アクセシブルな名前は「パスワードを表示」で固定し、
//   状態は aria-pressed で伝える（名前と状態を両方変えると、押した結果がわかりにくい）。
// - 切り替えても、入力値を変えない。入力欄にフォーカスがあった場合は、フォーカスと選択の範囲（カーソルの位置）を戻す。
//   ポインターで押した場合は、入力欄からフォーカスを移さない（キーボードで押した場合は、ボタンにフォーカスが残る）。
// - autoComplete の既定は current-password。新しいパスワードの欄では new-password を渡す（パスワードマネージャーが
//   ログインと新規の設定を区別する）。
// - 自動入力、パスワードマネージャー、コピー＆ペーストを妨げない（paste や copy を止めない）。spellCheck は常に false にする
//   （表示中の type="text" で、入力値がスペルチェックの対象にならないようにする）。
//
// この部品が持たないもの（製品の責務）
// - 強度の判定、文字の種類の規則（ログインの欄に新規のパスワードの規則を適用しない）。
// - 入力値の保存。パスワードをログ、URL、分析のイベント、永続化した下書きに含めない。

type Selection = { start: number | null; end: number | null; direction: "forward" | "backward" | "none" | null }

function PasswordInput({
  visible: visibleProp,
  defaultVisible = false,
  onVisibleChange,
  toggleLabel = "パスワードを表示",
  autoComplete = "current-password",
  disabled,
  className,
  ref,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  /** 表示中か（制御する場合） */
  visible?: boolean
  defaultVisible?: boolean
  onVisibleChange?: (visible: boolean) => void
  /** 切り替えのボタンのアクセシブルな名前。状態は aria-pressed で伝わる */
  toggleLabel?: string
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultVisible)
  const visible = visibleProp ?? uncontrolled
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  // 切り替えの直前に入力欄にフォーカスがあった場合の選択の範囲。type を変えた後に戻す。
  const restore = React.useRef<Selection | null>(null)

  const setRefs = React.useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref]
  )

  const toggle = () => {
    const input = inputRef.current
    restore.current =
      input && document.activeElement === input
        ? { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection }
        : null
    const next = !visible
    if (visibleProp === undefined) setUncontrolled(next)
    onVisibleChange?.(next)
  }

  // type を変えると、ブラウザによっては選択の範囲が先頭に戻る。描画の直後に戻す。
  React.useLayoutEffect(() => {
    const input = inputRef.current
    const saved = restore.current
    restore.current = null
    if (!input || !saved) return
    if (document.activeElement !== input) input.focus({ preventScroll: true })
    if (saved.start !== null && saved.end !== null) {
      try {
        input.setSelectionRange(saved.start, saved.end, saved.direction ?? undefined)
      } catch {
        // 選択の範囲を持たない入力型では何もしない
      }
    }
  }, [visible])

  return (
    <div data-slot="password-input" className="relative w-full min-w-0">
      <Input
        ref={setRefs}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        className={cn("pe-14", className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={toggleLabel}
        aria-pressed={visible}
        disabled={disabled}
        data-slot="password-input-toggle"
        // ポインターで押したときに、入力欄からフォーカスを移さない。
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
        className="absolute end-1 top-1/2 -translate-y-1/2"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  )
}

export { PasswordInput }
