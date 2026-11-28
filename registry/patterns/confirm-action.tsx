"use client"

import * as React from "react"

import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
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
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { FormSaveError } from "@/patterns/form-state"
import { useScopeGuard } from "@/patterns/scope-guard"

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
// - 実行の方式（progress）
//     inline（既定）：短時間で終わる単一のレコードの操作。Dialog の中で処理中を示し、終わったら閉じる。
//                      実行中はキャンセルと Escape で閉じない。失敗したら原因を示し、もう一度実行できる。
//     external：一括の操作。実行を始めた時点で Dialog を閉じ、進捗と結果は製品が一覧の上に示す（Data Browsing の Bulk Actions）。
// - 結果が不明（onConfirm が { unknown } を返す、FormSaveError ではない例外、FormSaveError の unknown）の場合は、
//   もう一度実行のボタンを置かない（無条件に再実行させない）。状態を確かめる手段は製品が示す。
//   実行のボタンを取り除くため、フォーカスを結果が不明の知らせ（Alert）に移す（body に落とさない）。
// - blockedReason：権限の不足、接続の切断などで、いまは実行できない。実行のボタンを Focusable Disabled にし、理由を示す
//   （aria-describedby）。クリック、Enter、Space で実行しない。
// - targetKey を省略すると、この部品のすべての表示を同じ対象として扱う（結果が不明の状態を共有する）。
//   1 つの部品で複数の対象を確かめる場合は、必ず targetKey を渡す。
// - 開いている間に対象（targetKey）が変わったら、変わったことを示し、入力をやり直させ、
//   「変更後の内容を確かめました」を押すまで実行できない。件数が同じでも ID が違えば、targetKey が変わるように作る。
//   onConfirm には、そのとき表示していた targetKey を渡す。製品は、実行する対象と一致するかを、実行の時点でも確かめる。
// - 閉じた後、または別の対象で開き直した後に届いた古い実行の結果は、Dialog の表示を変えない。
// - 対象の名前の入力は、本人確認や権限の確認の代わりにならない（再認証、承認は製品の責務）。
//
// 実行の結果の通知（Toast、一覧の上の表示）、API、権限、対象の最終的な検証は製品の責務である。

type ConfirmResult = void | { error: string } | { unknown: string }

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
  progress = "inline",
  confirmationText,
  confirmationLabel,
  targetKey,
  changedNotice = "表示している間に、対象か内容が変わりました。変更後の内容を確かめてください。",
  blockedReason,
  onConfirm,
  onUnknown,
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
  /** inline：Dialog の中で処理中を示す。external：実行を始めた時点で閉じる（一括の操作） */
  progress?: "inline" | "external"
  /** 入力による追加の確認。この文字列と一致するまで実行できない */
  confirmationText?: string
  confirmationLabel?: React.ReactNode
  /**
   * 対象と内容を表すキー（ID の一覧、操作の内容、条件から作る）。
   * 省略すると、この部品のすべての表示を同じ対象として扱う（結果が不明になった後は、どの対象で開いても実行のボタンを示さない）
   */
  targetKey?: string
  changedNotice?: React.ReactNode
  /**
   * いまは実行できない理由（権限の不足、接続の切断など）。指定している間は、実行のボタンを Focusable Disabled にし、
   * この文を示して aria-describedby で関連付ける。実行の時点の権限の検証（バックエンド）の代わりにはならない
   */
  blockedReason?: React.ReactNode
  /**
   * 実行する。失敗した場合は { error }、結果が不明な場合は { unknown } を返す。
   * 例外は、FormSaveError の failed は失敗、それ以外は結果が不明として扱う。progress が external の場合、結果は使わない
   */
  onConfirm: (context: { targetKey: string | undefined }) => Promise<ConfirmResult> | ConfirmResult
  /**
   * 結果が不明になった。同じ対象（targetKey）では、この部品を表示している間、開き直しても実行のボタンを示さない。
   * 製品が状態を確かめて解く場合は、targetKey を変える（版や確認の時刻を含める）か、この部品を作り直す
   */
  onUnknown?: (targetKey: string | undefined) => void
} & Omit<React.ComponentProps<typeof AlertDialogContent>, "children" | "title">) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [unknown, setUnknown] = React.useState<string | null>(null)
  const [typed, setTyped] = React.useState("")
  const [ackedKey, setAckedKey] = React.useState(targetKey)
  const running = React.useRef(false)
  const generation = React.useRef(0)
  // 結果が不明になった対象。閉じて同じ対象で開き直しても、もう一度実行できる状態に戻さない
  const unknownByKey = React.useRef(new Map<string | undefined, string>())
  const inputRef = React.useRef<HTMLInputElement>(null)
  const unknownRef = React.useRef<HTMLDivElement>(null)
  // 実行の結果が不明になった：実行のボタンを取り除くため、知らせにフォーカスを移す
  const focusUnknown = React.useRef(false)
  const blockedId = React.useId()
  const blocked = blockedReason !== undefined && blockedReason !== null && blockedReason !== false

  // 開いたとき：その時点の対象を確認済みにし、入力と前回の結果を消す。開閉のたびに世代を進める
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setAckedKey(targetKey)
      setTyped("")
      setError(null)
      setUnknown(unknownByKey.current.get(targetKey) ?? null)
      setPending(false)
    }
  }
  // 開閉の commit の時点で世代を進める（passive effect まで待つと、その間に届いた古い結果を受け付ける）
  React.useLayoutEffect(() => {
    generation.current++
    running.current = false
  }, [open])
  // 対象が変わったら、入力をやり直させる
  const [lastKey, setLastKey] = React.useState(targetKey)
  if (targetKey !== lastKey) {
    setLastKey(targetKey)
    if (open && !pending) setTyped("")
  }
  const changed = open && targetKey !== ackedKey

  const matches = confirmationText === undefined || typed.trim().normalize("NFKC") === confirmationText.normalize("NFKC")

  React.useLayoutEffect(() => {
    if (!unknown || !focusUnknown.current) return
    focusUnknown.current = false
    unknownRef.current?.focus()
  }, [unknown])

  const run = async () => {
    if (running.current || !matches || changed || unknown || blocked) return
    const key = targetKey
    if (progress === "external") {
      // 一括の操作：閉じてから実行する。進捗と結果は製品が一覧の上に示す。
      // 閉じるまでの間の 2 回目の押下（ダブルクリック）で、二重に実行しない（開閉の commit で解く）
      running.current = true
      onOpenChange(false)
      void Promise.resolve()
        .then(() => onConfirm({ targetKey: key }))
        .catch(() => undefined)
      return
    }
    running.current = true
    const gen = generation.current
    setPending(true)
    setError(null)
    let result: ConfirmResult
    try {
      result = await onConfirm({ targetKey: key })
    } catch (e) {
      result =
        e instanceof FormSaveError && e.outcome === "failed"
          ? { error: e.message }
          : { unknown: e instanceof FormSaveError ? e.message : "実行されたかを確かめられていません。最新の状態を確認してください。" }
    }
    // 閉じた後、開き直した後の古い結果は使わない
    if (gen !== generation.current) return
    running.current = false
    setPending(false)
    if (result && "error" in result) {
      setError(result.error)
      return
    }
    if (result && "unknown" in result) {
      unknownByKey.current.set(key, result.unknown)
      focusUnknown.current = true
      setUnknown(result.unknown)
      onUnknown?.(key)
      return
    }
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
            <AlertAction>
              <Button size="sm" variant="secondary" onClick={() => setAckedKey(targetKey)}>
                変更後の内容を確かめました
              </Button>
            </AlertAction>
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
              disabled={pending || Boolean(unknown)}
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
        {unknown && (
          <Alert ref={unknownRef} tabIndex={-1} variant="warning" role="alert" data-slot="confirm-action-unknown" className="outline-none">
            <AlertDescription>{unknown}</AlertDescription>
          </Alert>
        )}
        {blocked && !unknown && (
          <Alert variant="warning" data-slot="confirm-action-blocked">
            <AlertDescription id={blockedId}>{blockedReason}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{unknown ? "閉じる" : cancelLabel}</AlertDialogCancel>
          {!unknown && (
            <AlertDialogAction
              variant={variant === "destructive" ? "destructive" : "default"}
              disabled={!matches || changed || blocked}
              focusableWhenDisabled={blocked || undefined}
              aria-describedby={blocked ? blockedId : undefined}
              loading={pending}
              onClick={() => void run()}
            >
              {error ? (retryLabel ?? confirmLabel) : confirmLabel}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type UndoHandle = {
  /** 取り消せる期限（ms、Date.now() の値） */
  expiresAt: number
  /** 実行したときのスコープ */
  scopeKey: string | undefined
  /** 取り消す。期限を過ぎた場合、すでに取り消した場合、スコープが変わった場合、失敗した場合は false */
  undo: () => Promise<boolean>
}

let undoInstanceSeq = 0

/**
 * 取り消せる操作。実行したら Toast で結果と「元に戻す」を示す。
 * - 1 回の実行ごとに別の通知と別の取り消しを持つ。通知の id は hook のインスタンスごとに分ける（複数のインスタンスで衝突しない）。
 * - 取り消しの対象は、実行の結果（perform の戻り値）で固定する。描画の時点の値を使わない。
 * - 取り消せる期限（windowMs）を過ぎたら、通知を閉じ、取り消しを受け付けない（ポインターを重ねて通知が残った場合も）。
 * - scopeKey（アカウント、ワークスペース）が変わったら、前のスコープの通知を閉じ、取り消しを受け付けない（別のスコープに操作しない）。
 * - アンマウントしたら、表示中の「元に戻す」の通知を閉じる。
 * - 実行の結果が不明（FormSaveError の unknown、それ以外の例外）の場合は、「元に戻す」を示さない。
 * - 取り消しの失敗は、期限の中ならもう一度取り消せる。取り消しの結果が不明の場合は、もう一度取り消せる状態に戻さない。
 * - Toast は消えるため、重要な復元の手段は画面にも残す（アーカイブ済みの一覧から戻すなど）。run が返す undo を使える。
 * 実際の取り消しの処理（バックエンド）は製品の責務である。
 */
function useUndoableAction({ windowMs = 10_000, scopeKey }: { windowMs?: number; scopeKey?: string } = {}) {
  const { toast, dismiss } = useToast()
  const [instance] = React.useState(() => ++undoInstanceSeq)
  const seq = React.useRef(0)
  const timers = React.useRef(new Set<number>())
  const scopeRef = React.useRef(scopeKey)
  const openIds = React.useRef(new Map<string, string | undefined>())
  const toastRef = React.useRef({ toast, dismiss })
  // 古い結果と古い Toast の「元に戻す」の照合は、scopeKey の文字列ではなく、スコープと世代で行う
  // （A → B → A の最初の A の Toast から、最後の A のデータを戻さない）
  const guard = useScopeGuard(scopeKey)
  const guardRef = React.useRef(guard)
  React.useLayoutEffect(() => {
    toastRef.current = { toast, dismiss }
    guardRef.current = guard
  })

  React.useEffect(() => {
    if (scopeRef.current === scopeKey) return
    scopeRef.current = scopeKey
    // 前のスコープの「元に戻す」の通知を閉じる
    for (const [id, scope] of openIds.current) if (scope !== scopeKey) toastRef.current.dismiss(id)
  }, [scopeKey])

  // アンマウント：タイマーを止め、表示中の「元に戻す」の通知を閉じる（押しても、この画面の取り消しは動かない）
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t)
      for (const id of openIds.current.keys()) toastRef.current.dismiss(id)
      openIds.current.clear()
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
      retryUndoLabel = "もう一度元に戻す",
      undoneTitle,
      failedTitle = "実行できませんでした",
      unknownTitle = "実行されたかを確かめられていません",
      undoFailedTitle = "元に戻せませんでした",
      undoUnknownTitle = "元に戻せたかを確かめられていません",
      expiredTitle = "元に戻せる時間を過ぎました",
      staleTitle = "表示している範囲（ワークスペースなど）が変わったため、元に戻せません",
      expiredDescription,
    }: {
      perform: () => Promise<T>
      /** 取り消す。対象は perform の戻り値で決める */
      undo: (result: T) => Promise<void>
      /** 実行の結果（「株式会社山田商事をアーカイブしました」） */
      title: string
      description?: string
      undoLabel?: string
      retryUndoLabel?: string
      undoneTitle: string
      failedTitle?: string
      unknownTitle?: string
      undoFailedTitle?: string
      undoUnknownTitle?: string
      expiredTitle?: string
      /** スコープが変わった後に「元に戻す」を押した場合の文 */
      staleTitle?: string
      /** 期限の後に戻す方法（「アーカイブ済みの一覧から戻せます」） */
      expiredDescription?: string
    }): Promise<
      | { ok: true; handle: UndoHandle }
      | { ok: false; outcome: "failed" | "unknown" }
      // stale：実行の間にスコープが変わった。performed は実行の結果（succeeded と unknown は、サーバーで処理された可能性がある）
      | { ok: false; outcome: "stale"; performed: "succeeded" | "failed" | "unknown" }
    > => {
      const scope = scopeRef.current
      const g = guardRef.current
      const snapshot = g.capture()
      let result: T
      try {
        result = await perform()
      } catch (e) {
        if (!g.isCurrent(snapshot)) return { ok: false, outcome: "stale", performed: e instanceof FormSaveError ? e.outcome : "unknown" }
        const outcome = e instanceof FormSaveError ? e.outcome : "unknown"
        toastRef.current.toast({
          variant: outcome === "failed" ? "destructive" : "warning",
          title: outcome === "failed" ? failedTitle : unknownTitle,
          description: e instanceof Error ? e.message : undefined,
        })
        return { ok: false, outcome }
      }
      // 実行の間にスコープが変わった場合は、新しいスコープに通知を出さない
      if (!g.isCurrent(snapshot)) return { ok: false, outcome: "stale", performed: "succeeded" }
      const baseId = `undo-${instance}-${++seq.current}`
      // 表示中の通知の id。取り消しに失敗して再試行の通知を出すたびに、新しい id にする
      // （閉じた通知と同じ id を使うと、閉じる途中の通知として扱われ、操作できない）
      let id = baseId
      let retries = 0
      const expiresAt = Date.now() + windowMs
      let state: "open" | "undoing" | "done" = "open"
      let timer = window.setTimeout(() => {
        timers.current.delete(timer)
        openIds.current.delete(id)
        toastRef.current.dismiss(id)
      }, windowMs)
      timers.current.add(timer)
      const doUndo = async () => {
        if (state !== "open") return false
        if (!g.isCurrent(snapshot)) {
          toastRef.current.dismiss(id)
          toastRef.current.toast({ variant: "warning", title: staleTitle, description: expiredDescription })
          return false
        }
        if (Date.now() > expiresAt) {
          toastRef.current.toast({ variant: "warning", title: expiredTitle, description: expiredDescription })
          return false
        }
        state = "undoing"
        window.clearTimeout(timer)
        timers.current.delete(timer)
        openIds.current.delete(id)
        toastRef.current.dismiss(id)
        try {
          await undo(result)
          state = "done"
          if (g.isCurrent(snapshot)) toastRef.current.toast({ variant: "success", title: undoneTitle })
          return true
        } catch (e) {
          const outcome = e instanceof FormSaveError ? e.outcome : "unknown"
          // 確定した失敗は、期限の中ならもう一度取り消せる。結果が不明なら、取り消せる状態に戻さない
          const retryable = outcome === "failed" && Date.now() <= expiresAt
          state = retryable ? "open" : "done"
          const remaining = expiresAt - Date.now()
          if (retryable) id = `${baseId}-retry-${++retries}`
          toastRef.current.toast({
            variant: outcome === "failed" ? "destructive" : "warning",
            title: outcome === "failed" ? undoFailedTitle : undoUnknownTitle,
            description: e instanceof Error ? e.message : undefined,
            // 確定した失敗は、期限の中ならこの通知から取り消し直せる（期限で通知を閉じる）
            ...(retryable && { id, timeout: remaining, action: { label: retryUndoLabel, onClick: () => void doUndo() } }),
          })
          if (retryable) {
            openIds.current.set(id, scope)
            timer = window.setTimeout(() => {
              timers.current.delete(timer)
              openIds.current.delete(id)
              toastRef.current.dismiss(id)
            }, remaining)
            timers.current.add(timer)
          }
          return false
        }
      }
      openIds.current.set(id, scope)
      toastRef.current.toast({ id, variant: "success", title, description, timeout: windowMs, action: { label: undoLabel, onClick: () => void doUndo() } })
      return { ok: true, handle: { expiresAt, scopeKey: scope, undo: doUndo } }
    },
    [instance, windowMs]
  )

  return { run }
}

export { ConfirmActionDialog, useUndoableAction }
export type { UndoHandle }
