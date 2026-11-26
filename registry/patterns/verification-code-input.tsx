"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { normalizeVerificationCode, type VerificationCodeFormat } from "@/patterns/auth-flow"

// Flow Design Verification Code Input（Patterns / System & Account / Authentication）
// 多要素認証、メールの確認などのコードの入力欄。定義は docs/web/patterns/authentication.md を参照。
// 既存の Input（Field.Control）をそのまま使う。Field の中に置き、ラベルと説明（桁数、送信先）を付ける。
//
// この部品が守ること
// - 入力欄は 1 つ。桁ごとに入力欄を分けない（ペースト、自動入力、読み上げ、削除の操作が 1 か所で完結する）。
// - autoComplete="one-time-code"（SMS やメールのコードの自動入力）。numeric では inputMode="numeric" で数字のキーボードを出す。
// - 値は文字列のまま扱う（先頭の 0 を失わない）。ペーストや入力で混ざった空白、ハイフン、全角の数字を取り除き・変換する
//   （normalizeVerificationCode）。maxLength で切り詰めない（「012 345」のペーストが途中で切れるため）。桁数を固定しない。
// - IME で変換中の文字は変えない。確定したとき（compositionend）に整える。
// - 整えたときに、カーソルの位置を、残った文字の位置に合わせる。
//
// この部品が持たないもの（製品の責務）
// - コードの検証、期限、試行回数の制限、再送信、代替の方式。桁数の確認（必要な場合は送信時に製品が確かめる）。
// - 自動で送信するか（入力が揃ったときに送信する場合は、製品が二重の送信を防ぐ）。

function VerificationCodeInput({
  value,
  onValueChange,
  format = "numeric",
  uppercase = false,
  normalize,
  className,
  ref,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> & {
  value: string
  onValueChange: (code: string) => void
  /** numeric：数字だけ（既定）。alphanumeric：英字と数字（リカバリーコードなど） */
  format?: VerificationCodeFormat
  /** 英字を大文字にそろえる（大文字・小文字を区別しないコードの場合） */
  uppercase?: boolean
  /** 製品に固有の形式の場合の整え方。指定すると format と uppercase を使わない */
  normalize?: (raw: string) => string
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const caret = React.useRef<number | null>(null)
  const clean = React.useCallback(
    (raw: string) => (normalize ? normalize(raw) : normalizeVerificationCode(raw, { format, uppercase })),
    [normalize, format, uppercase]
  )
  // 変換中の文字（未確定）。確定するまでは、この値を表示する。
  const [composing, setComposing] = React.useState<string | null>(null)

  const setRefs = React.useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref]
  )

  const commit = (input: HTMLInputElement) => {
    const raw = input.value
    const at = input.selectionStart ?? raw.length
    // カーソルより前の部分を整えた長さが、整えた後のカーソルの位置
    caret.current = clean(raw.slice(0, at)).length
    onValueChange(clean(raw))
  }

  React.useLayoutEffect(() => {
    const input = inputRef.current
    const at = caret.current
    caret.current = null
    if (!input || at === null || document.activeElement !== input) return
    try {
      input.setSelectionRange(at, at)
    } catch {
      // 何もしない
    }
  }, [value])

  return (
    <Input
      ref={setRefs}
      type="text"
      inputMode={format === "numeric" ? "numeric" : "text"}
      autoComplete="one-time-code"
      autoCapitalize={format === "alphanumeric" ? "characters" : "off"}
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="done"
      data-slot="verification-code-input"
      value={composing ?? value}
      onChange={(event) => {
        if ((event.nativeEvent as InputEvent).isComposing) {
          setComposing(event.currentTarget.value)
          return
        }
        setComposing(null)
        commit(event.currentTarget)
      }}
      onCompositionStart={(event) => setComposing(event.currentTarget.value)}
      onCompositionEnd={(event) => {
        setComposing(null)
        commit(event.currentTarget)
      }}
      className={cn("text-heading tracking-[0.2em] tabular-nums", className)}
      {...props}
    />
  )
}

export { VerificationCodeInput }
