"use client"

import * as React from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

// Flow Design Confirmation（Patterns / Forms & Workflows）
// 操作の前の確認と、取り消し（Undo）。定義と判断基準は docs/web/patterns/confirmation.md を参照。
//
// 確認の要否は、影響の範囲、危険の大きさ、取り消せるかで判断する（操作の名前だけで決めない）。
//   影響が小さい          … 確認しない
//   安全に取り消せる      … 確認せずに実行し、useUndoableAction で「元に戻す」を示す
//   影響が大きい・不可逆  … ConfirmActionDialog（Alert Dialog）で、対象、件数、内容、影響、取り消せるかを示す
//   極めて重大            … ConfirmActionDialog の confirmationText で、対象の名前の入力を求める
//
// ConfirmActionDialog の規則
// - 初期フォーカスはキャンセル（入力を求める場合は入力欄）。Escape はキャンセル。外側のクリックでは閉じない（Alert Dialog）。
//   実行のボタンに初期フォーカスを置かないため、開いた直後の Enter で実行されない。
// - 実行中は、キャンセルと Escape で閉じない（結果がわからなくなるため）。onConfirm の二重の呼び出しを止める。
// - 失敗したら閉じずに、原因をこの中に示す。もう一度実行できる。
// - 開いている間に対象（targetKey）が変わったら、変わったことを示し、入力をやり直させる。
//   onConfirm には、そのとき表示していた targetKey を渡す。製品は、実行する対象と一致するかを確かめる。
// - 対象の名前の入力は、本人確認や権限の確認の代わりにならない（再認証、承認は製品の責務）。
//
// 実行の結果の通知（Toast、一覧の上の表示）、API、権限、対象の最終的な検証は製品の責務である。

type ConfirmResult = void | { error: string }

function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  retryLabel,
  cancelLabel = "キャンセル",
  variant = "default",
  confirmationText,
  confirmationLabel,
  targetKey,
  changedNotice = "表示している間に、対象が変わりました。内容を確かめてから実行してください。",
  onConfirm,
  ...props
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 操作と対象（「3件の顧客を削除しますか？」）。「確認」「本当によろしいですか？」だけにしない */
  title: React.ReactNode
  /** 影響の範囲と、取り消せるか */
  description?: React.ReactNode
  /** 対象の一覧など */
  children?: React.ReactNode
  /** 実行のボタン。操作と件数（「3件を削除」） */
  confirmLabel: string
  /** 失敗した後の実行のボタン。省略すると confirmLabel */
  retryLabel?: string
  cancelLabel?: string
  /** destructive：削除などの破壊的な操作。default：通常の確認（Primary） */
  variant?: "default" | "destructive"
  /** 入力による追加の確認。この文字列と一致するまで実行できない */
  confirmationText?: string
  confirmationLabel?: React.ReactNode
  /** 対象を表すキー（ID の一覧、件数、条件から作る） */
  targetKey?: string
  changedNotice?: React.ReactNode
  /** 実行する。失敗した場合は { error } を返す（例外も失敗として扱う） */
  onConfirm: (context: { targetKey: string | undefined }) => Promise<ConfirmResult> | ConfirmResult
} & Omit<React.ComponentProps<typeof AlertDialogContent>, "children" | "title">) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [typed, setTyped] = React.useState("")
  const [openedKey, setOpenedKey] = React.useState(targetKey)
  const running = React.useRef(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // 開いたときの対象を記録し、入力と前回の結果を消す
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setOpenedKey(targetKey)
      setTyped("")
      setError(null)
    }
  }
  const changed = open && targetKey !== openedKey
  // 対象が変わったら、入力をやり直させる
  const [lastKey, setLastKey] = React.useState(targetKey)
  if (targetKey !== lastKey) {
    setLastKey(targetKey)
    if (open) setTyped("")
  }

  const matches = confirmationText === undefined || typed.trim().normalize("NFKC") === confirmationText.normalize("NFKC")

  const run = async () => {
    if (running.current || !matches) return
    running.current = true
    setPending(true)
    setError(null)
    const key = targetKey
    let result: ConfirmResult
    try {
      result = await onConfirm({ targetKey: key })
    } catch {
      result = { error: "実行できませんでした。時間をおいて、もう一度実行してください。" }
    }
    running.current = false
    setPending(false)
    if (result && "error" in result) {
      setError(result.error)
      return
    }
    setOpenedKey(key)
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent
        data-slot="confirm-action-dialog"
        data-variant={variant}
        initialFocus={confirmationText !== undefined ? inputRef : undefined}
        {...props}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        {changed && (
          <Alert variant="warning" data-slot="confirm-action-changed">
            <AlertDescription>{changedNotice}</AlertDescription>
          </Alert>
        )}
        {confirmationText !== undefined && (
          <Field>
            <FieldLabel>{confirmationLabel ?? `確認のため「${confirmationText}」と入力してください`}</FieldLabel>
            <Input
              ref={inputRef}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
              onChange={(e) => setTyped(e.target.value)}
              // 入力欄での Enter で実行しない（実行はボタンだけで行う）
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault()
              }}
            />
            {!matches && typed.length > 0 && <FieldDescription>入力した文字が一致していません</FieldDescription>}
          </Field>
        )}
        {error && (
          <Alert variant="destructive" role="alert" data-slot="confirm-action-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={!matches}
            loading={pending}
            onClick={() => void run()}
          >
            {error ? (retryLabel ?? confirmLabel) : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type UndoHandle = {
  /** 取り消せる期限（ms、Date.now() の値） */
  expiresAt: number
  /** 取り消す。期限を過ぎた場合、すでに取り消した場合、失敗した場合は false */
  undo: () => Promise<boolean>
}

/**
 * 取り消せる操作。実行したら Toast で結果と「元に戻す」を示す。
 * - 1 回の実行ごとに別の通知と別の取り消しを持つ。続けて実行しても、別の操作を取り消さない。
 * - 取り消せる期限（windowMs）を過ぎたら、通知を閉じ、取り消しを受け付けない（ポインターを重ねて通知が残った場合も）。
 * - 取り消しの失敗は、失敗の通知で示す。
 * - Toast は消えるため、重要な復元の手段は画面にも残す（アーカイブ済みの一覧から戻すなど）。run が返す undo を使える。
 * 実際の取り消しの処理（バックエンド）は製品の責務である。
 */
function useUndoableAction({ windowMs = 10_000 }: { windowMs?: number } = {}) {
  const { toast, dismiss } = useToast()
  const seq = React.useRef(0)
  const timers = React.useRef(new Set<number>())
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t)
    },
    []
  )

  const run = React.useCallback(
    async <T,>({
      perform,
      undo,
      title,
      description,
      undoLabel = "元に戻す",
      undoneTitle,
      failedTitle = "実行できませんでした",
      undoFailedTitle = "元に戻せませんでした",
      expiredTitle = "元に戻せる時間を過ぎました",
      expiredDescription,
    }: {
      perform: () => Promise<T>
      undo: (result: T) => Promise<void>
      /** 実行の結果（「株式会社山田商事をアーカイブしました」） */
      title: string
      description?: string
      undoLabel?: string
      undoneTitle: string
      failedTitle?: string
      undoFailedTitle?: string
      expiredTitle?: string
      /** 期限の後に戻す方法（「アーカイブ済みの一覧から戻せます」） */
      expiredDescription?: string
    }): Promise<{ ok: true; handle: UndoHandle } | { ok: false }> => {
      let result: T
      try {
        result = await perform()
      } catch (e) {
        toast({ variant: "destructive", title: failedTitle, description: e instanceof Error ? e.message : undefined })
        return { ok: false }
      }
      const id = `undo-${++seq.current}`
      const expiresAt = Date.now() + windowMs
      let state: "open" | "undoing" | "done" = "open"
      const timer = window.setTimeout(() => {
        timers.current.delete(timer)
        dismiss(id)
      }, windowMs)
      timers.current.add(timer)
      const doUndo = async () => {
        if (state !== "open") return false
        if (Date.now() > expiresAt) {
          toast({ variant: "warning", title: expiredTitle, description: expiredDescription })
          return false
        }
        state = "undoing"
        window.clearTimeout(timer)
        timers.current.delete(timer)
        dismiss(id)
        try {
          await undo(result)
          state = "done"
          toast({ variant: "success", title: undoneTitle })
          return true
        } catch (e) {
          // 取り消しに失敗した操作は、期限の中ならもう一度取り消せる
          state = "open"
          toast({ variant: "destructive", title: undoFailedTitle, description: e instanceof Error ? e.message : undefined })
          return false
        }
      }
      toast({ id, variant: "success", title, description, timeout: windowMs, action: { label: undoLabel, onClick: () => void doUndo() } })
      return { ok: true, handle: { expiresAt, undo: doUndo } }
    },
    [toast, dismiss, windowMs]
  )

  return { run }
}

export { ConfirmActionDialog, useUndoableAction }
export type { UndoHandle }
