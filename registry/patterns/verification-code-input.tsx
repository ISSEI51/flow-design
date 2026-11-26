"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { normalizeVerificationCode, type VerificationCodeFormat, type VerificationCodeNormalization } from "@/patterns/auth-flow"

// Flow Design Verification Code Input（Patterns / System & Account / Authentication）
// 多要素認証、メールの確認などのコードの入力欄。定義は docs/web/patterns/authentication.md を参照。
// 既存の Input（Field.Control）をそのまま使う。Field の中に置き、ラベルと説明（桁数、送信先）を付ける。
//
// この部品が守ること
// - 入力欄は 1 つ。桁ごとに入力欄を分けない（ペースト、自動入力、読み上げ、削除の操作が 1 か所で完結する）。
// - autoComplete="one-time-code"（SMS やメールのコードの自動入力）。numeric では inputMode="numeric" で数字のキーボードを出す。
// - 値は文字列のまま扱う（先頭の 0 を失わない）。maxLength で切り詰めない（「012 345」のペーストが途中で切れるため）。桁数を固定しない。
// - 既定の整形は、区切り（空白、ハイフン）を取り除くだけ。全角の変換（fullWidth）と大文字への変換（uppercase）は製品が指定する。
//   想定外の文字（英字、記号）を取り除かない（取り除くと別のコードとして送信してしまう。送信の前に checkVerificationCode で示す）。
// - 大文字・小文字を区別するコード（uppercase を指定しない）では、モバイルのキーボードに大文字を自動で入力させない（autoCapitalize="none"）。
// - IME で変換中（compositionstart から compositionend まで）の文字は変えず、onValueChange も onComplete も呼ばない。確定したときに整える。
// - onComplete は、確定した値の文字数が length と一致したときに 1 回だけ呼ぶ（同じ値で繰り返さない）。自動で送信するかは製品が決める。
// - 整えたときに、カーソルの位置を、残った文字の位置に合わせる。
//
// この部品が持たないもの（製品の責務）
// - コードの検証、期限、試行回数の制限、再送信、代替の方式。桁数と文字の種類の確認（送信の前に checkVerificationCode で確かめる）。
// - 自動で送信する場合の二重の送信の防止と、送信中の古い結果の破棄。

function VerificationCodeInput({
  value,
  onValueChange,
  format = "numeric",
  uppercase = false,
  fullWidth = "keep",
  separators = "remove",
  normalize,
  length,
  onComplete,
  className,
  ref,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> & {
  value: string
  onValueChange: (code: string) => void
  /** numeric：数字だけ（既定。数字のキーボード）。alphanumeric：英字と数字（リカバリーコードなど） */
  format?: VerificationCodeFormat
  /** 英字を大文字にそろえる（大文字・小文字を区別しないコードの場合だけ。既定は false） */
  uppercase?: boolean
  /** 全角の英数字を半角にする（既定は "keep"） */
  fullWidth?: VerificationCodeNormalization["fullWidth"]
  /** 区切りの文字を取り除く（既定は "remove"） */
  separators?: VerificationCodeNormalization["separators"]
  /** 製品に固有の形式の場合の整え方。指定すると uppercase、fullWidth、separators を使わない */
  normalize?: (raw: string) => string
  /** onComplete を呼ぶ文字数（入力欄の長さの制限ではない） */
  length?: number
  /** 確定した値の文字数が length と一致した（IME の変換中は呼ばない）。自動で送信する場合に使う */
  onComplete?: (code: string) => void
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const caret = React.useRef<number | null>(null)
  const clean = React.useCallback(
    (raw: string) => (normalize ? normalize(raw) : normalizeVerificationCode(raw, { uppercase, fullWidth, separators })),
    [normalize, uppercase, fullWidth, separators]
  )
  // 変換中の文字（未確定）。確定するまでは、この値を表示する。
  const [composing, setComposing] = React.useState<string | null>(null)
  // 最後に onComplete を呼んだ値。同じ値で繰り返さない（compositionend と、その後の input の両方で確定する場合など）
  const completed = React.useRef<string | null>(null)

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
    const next = clean(raw)
    onValueChange(next)
    if (length !== undefined && onComplete && next.length === length) {
      if (completed.current !== next) {
        completed.current = next
        onComplete(next)
      }
    } else {
      completed.current = null
    }
  }

  // 製品が値を変えた場合（誤りの後に空にするなど）は、同じ値をもう一度入力したときに onComplete を呼べるようにする
  React.useEffect(() => {
    if (completed.current !== null && completed.current !== value) completed.current = null
  }, [value])

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
      // 大文字・小文字を区別するコードで、モバイルのキーボードが先頭の文字を大文字にしないようにする
      autoCapitalize={uppercase ? "characters" : "none"}
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="done"
      data-slot="verification-code-input"
      data-composing={composing !== null || undefined}
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
