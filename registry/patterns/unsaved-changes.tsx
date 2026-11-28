"use client"

import * as React from "react"

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

// Flow Design Unsaved Changes（Patterns / Forms & Workflows）
// 未保存の変更がある間の、ページの移動と再読み込みの確認。定義と判断基準は docs/web/patterns/unsaved-changes.md を参照。
//
// 構成
//   UnsavedChangesProvider … 画面（App Shell の中など）に 1 つ置く。保存の単位（フォーム）ごとの状態を集め、
//                            移動の確認の Alert Dialog と、beforeunload の登録を持つ。
//   useUnsavedChanges      … 保存の単位ごとに呼ぶ。dirty（未保存の変更）、saving（保存中）、保存と破棄の処理を登録する。
//                            アンマウントすると登録を解除する（古い登録を残さない）。
//   useNavigationGuard     … 製品のルーターとの接続。移動の前に confirmNavigation(proceed) を呼ぶ。
//   DiscardChangesAlert    … Dialog、Sheet、Drawer を閉じるときの破棄の確認（各部品の onDiscardRequest から開く）。
//
// 規則
// - 未保存かどうかは、保存の単位が判断する（useFormState の isDirty など。触れただけでは未保存にしない）。
// - 確認は「編集を続ける」（初期フォーカス、Escape）と「変更を破棄」の 2 択。すべての対象が保存できる場合だけ
//   「保存して移動」を加える。保存がすべて成功した場合だけ移動し、失敗したら移動せず、入力を残す。
// - 確認中、保存を待つ間、保存して移動の途中に別の移動の要求が来た場合は、最後の要求だけを残す（前の要求は onCancel で取り消す）。
// - 破棄、または保存して移動した対象は、移動の処理の間は確認の対象から外す（確認が繰り返されない）。
//   dirty が false になると、再び対象に戻る。
// - 保存中に移動を求めた場合は、保存が終わるまで待つ。成功して未保存の変更がなければ移動し、失敗したら確認に切り替える。
//   待っている間も「移動をやめる」で取り消せる（通信の障害で操作できなくならない）。
//   待つ確認は 200ms 後に表示する（保存の直後の移動など、すぐに終わる場合は表示しない）。
// - beforeunload は、未保存の変更か保存中の処理がある間だけ登録する。ブラウザの標準の確認が出る（文言は指定できない。
//   ブラウザによっては、利用者がページを操作していない場合などに確認を出さない）。
//
// この部品が持たないもの（製品の責務）
// - 実際の移動の阻止と再開。ルーターの移動（リンク、Sidebar）、戻る・進む（popstate、ルーターの blocker）で
//   confirmNavigation を呼び、許可されたら proceed で移動する。
// - 下書きの保存、保存の API。

type Entry = {
  label?: string
  dirty: boolean
  saving: boolean
  canSave: boolean
  save?: () => Promise<boolean>
  discard?: () => void
  /** 値の変更の回数（useFormState の revision）。破棄や保存の後に変更があったかを確かめる */
  revision?: number | string
  /**
   * 破棄、または保存して移動した時点の revision。移動の処理の間だけ、確認の対象から外す。
   * revision が変わる（新しい変更がある）、dirty が false になる、移動の処理が終わる（次のタスク）のいずれかで解除する
   */
  released: { revision: number | string | undefined } | null
}

type NavigationRequest = {
  proceed: () => void
  onCancel?: () => void
  phase: "waiting" | "confirm" | "saving"
}

// 登録の関数（変わらない）と、状態（変わる）を別の Context にする。
// 状態が変わるたびに登録をやり直すと、「破棄した」「保存して移動した」の印（released）が消えるため。
type RegistryActions = {
  register: (id: string, entry: Omit<Entry, "released">) => void
  update: (id: string, entry: Omit<Entry, "released">) => void
  unregister: (id: string) => void
  confirmNavigation: (proceed: () => void, options?: { onCancel?: () => void }) => boolean
}
type RegistryState = { hasUnsavedChanges: boolean; saving: boolean; pending: boolean }

const UnsavedChangesContext = React.createContext<RegistryActions | null>(null)
const UnsavedChangesStateContext = React.createContext<RegistryState | null>(null)

/** 保存中に移動を求めたとき、「保存しています」の確認を表示するまでの時間（ms） */
const WAITING_DIALOG_DELAY_MS = 200

const defaultLabels = {
  title: "変更を破棄しますか？",
  description: (labels: string[]) =>
    labels.length ? `${labels.map((l) => `「${l}」`).join("")}の変更は保存されていません。` : "入力した内容は保存されません。",
  keepEditing: "編集を続ける",
  discard: "変更を破棄",
  saveAndLeave: "保存して移動",
  waitingTitle: "保存しています",
  waitingDescription: "保存が終わると移動します。",
  stopLeaving: "移動をやめる",
}

function UnsavedChangesProvider({
  children,
  labels: labelOverrides,
}: {
  children: React.ReactNode
  labels?: Partial<typeof defaultLabels>
}) {
  const labels = { ...defaultLabels, ...labelOverrides }
  const entries = React.useRef(new Map<string, Entry>())
  const [version, setVersion] = React.useState(0)
  const [request, setRequestState] = React.useState<NavigationRequest | null>(null)
  const requestRef = React.useRef<NavigationRequest | null>(null)
  const setRequest = React.useCallback((next: NavigationRequest | null) => {
    requestRef.current = next
    setRequestState(next)
  }, [])
  const bump = React.useCallback(() => setVersion((v) => v + 1), [])

  const active = () => [...entries.current.values()]
  const isReleased = (e: Entry) => e.released !== null && e.released.revision === e.revision
  const blocking = () => active().filter((e) => e.dirty && !isReleased(e))
  const blockingIds = () => [...entries.current.entries()].filter(([, e]) => e.dirty && !isReleased(e)).map(([id]) => id)
  // 移動の処理（proceed）の後に、確認を省く印を解除する。移動が失敗した（画面が残った）場合も、未保存の変更を守る
  const releaseLater = React.useCallback(() => {
    window.setTimeout(() => {
      let changed = false
      for (const e of entries.current.values()) {
        if (e.released) {
          e.released = null
          changed = true
        }
      }
      if (changed) bump()
    }, 0)
  }, [bump])
  const anySaving = () => active().some((e) => e.saving)

  const register = React.useCallback(
    (id: string, entry: Omit<Entry, "released">) => {
      entries.current.set(id, { ...entry, released: null })
      bump()
    },
    [bump]
  )
  const update = React.useCallback(
    (id: string, entry: Omit<Entry, "released">) => {
      const prev = entries.current.get(id)
      if (!prev) return
      const released = prev.released && entry.dirty && prev.released.revision === entry.revision ? prev.released : null
      const changed =
        prev.dirty !== entry.dirty ||
        prev.saving !== entry.saving ||
        prev.canSave !== entry.canSave ||
        prev.label !== entry.label ||
        prev.revision !== entry.revision ||
        prev.released !== released
      entries.current.set(id, { ...entry, released })
      if (changed) bump()
    },
    [bump]
  )
  const unregister = React.useCallback(
    (id: string) => {
      if (entries.current.delete(id)) bump()
    },
    [bump]
  )

  const confirmNavigation = React.useCallback(
    (proceed: () => void, options: { onCancel?: () => void } = {}) => {
      if (blocking().length === 0 && !anySaving()) {
        proceed()
        return true
      }
      // 確認中の要求は、新しい要求に置き換える
      const previous = requestRef.current
      if (previous) previous.onCancel?.()
      if (previous?.phase === "saving") {
        // 保存して移動の途中：保存は続け、終わった後の移動先を最新の要求に置き換える
        setRequest({ ...previous, proceed, onCancel: options.onCancel })
        return false
      }
      setRequest({ proceed, onCancel: options.onCancel, phase: anySaving() ? "waiting" : "confirm" })
      return false
    },
    [setRequest]
  )

  const hasUnsavedChanges = blocking().length > 0
  const saving = anySaving()

  // 保存が終わるのを待っている要求：終わったら、未保存の変更がなければ移動し、残っていれば確認に切り替える
  React.useEffect(() => {
    const r = requestRef.current
    if (!r || r.phase !== "waiting" || saving) return
    if (!hasUnsavedChanges) {
      setRequest(null)
      r.proceed()
    } else setRequest({ ...r, phase: "confirm" })
  }, [version, saving, hasUnsavedChanges, setRequest])

  // 再読み込み、タブを閉じる、別のサイトへの移動。必要な間だけ登録する
  React.useEffect(() => {
    if (!hasUnsavedChanges && !saving) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // 古いブラウザは returnValue の設定で確認を出す。文言は表示されない
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [hasUnsavedChanges, saving])

  // 保存して移動の途中でも、移動はやめられる（保存は続き、結果はフォームに示す）。保存が終わらない場合に操作できなくならない
  const cancel = () => {
    const r = requestRef.current
    if (!r) return
    setRequest(null)
    r.onCancel?.()
  }

  const discard = () => {
    const r = requestRef.current
    if (!r) return
    for (const e of blocking()) {
      e.released = { revision: e.revision }
      e.discard?.()
    }
    setRequest(null)
    bump()
    r.proceed()
    releaseLater()
  }

  const targets = blocking()
  const canSaveAll = targets.length > 0 && targets.every((e) => e.save && e.canSave)

  const saveAndLeave = async () => {
    const r = requestRef.current
    if (!r || r.phase !== "confirm") return
    setRequest({ ...r, phase: "saving" })
    let ok = true
    for (const id of blockingIds()) {
      // 1 つでも失敗したら、残りを保存せずに止める（移動しない）。登録は保存の間に置き換わるため、id で引き直す
      const before = entries.current.get(id)?.revision
      ok = Boolean(await entries.current.get(id)?.save?.().catch(() => false))
      if (!ok) break
      const current = entries.current.get(id)
      // 保存を始めた時点の revision で印を付ける。保存の間に入力があれば、revision が変わり、確認の対象に戻る
      if (current) current.released = { revision: before }
    }
    // 保存の結果をフォームが反映し、登録が更新されるのを待つ
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    // 保存の間に「移動をやめる」を押した場合は、移動しない。別の移動を求めた場合は、最新の要求で移動する
    const latest = requestRef.current
    if (!latest) {
      bump()
      return
    }
    if (ok && blocking().length > 0) {
      // 保存の間に新しい入力があった：移動せずに、もう一度確かめる
      setRequest({ ...latest, phase: "confirm" })
      bump()
      return
    }
    setRequest(null)
    bump()
    if (ok) {
      latest.proceed()
      releaseLater()
    } else latest.onCancel?.()
  }

  const actions = React.useMemo<RegistryActions>(() => ({ register, update, unregister, confirmNavigation }), [register, update, unregister, confirmNavigation])
  const state = React.useMemo<RegistryState>(() => ({ hasUnsavedChanges, saving, pending: request !== null }), [hasUnsavedChanges, saving, request])

  const waiting = request?.phase === "waiting"
  // 保存が終わるのを待つ確認は、少し待ってから表示する。短い保存（保存の後の移動など）では表示しない
  const [waitingVisible, setWaitingVisible] = React.useState(false)
  React.useEffect(() => {
    if (!waiting) {
      setWaitingVisible(false)
      return
    }
    const timer = window.setTimeout(() => setWaitingVisible(true), WAITING_DIALOG_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [waiting])
  return (
    <UnsavedChangesContext.Provider value={actions}>
      <UnsavedChangesStateContext.Provider value={state}>
      {children}
      <AlertDialog
        open={request !== null && (!waiting || waitingVisible)}
        onOpenChange={(open) => {
          if (!open) cancel()
        }}
      >
        <AlertDialogContent size="sm" data-slot="unsaved-changes-dialog" data-phase={request?.phase}>
          <AlertDialogHeader>
            <AlertDialogTitle>{waiting ? labels.waitingTitle : labels.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {waiting ? labels.waitingDescription : labels.description(targets.map((e) => e.label).filter((l): l is string => Boolean(l)))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{waiting || request?.phase === "saving" ? labels.stopLeaving : labels.keepEditing}</AlertDialogCancel>
            {!waiting && (
              <AlertDialogAction variant="destructive" disabled={request?.phase === "saving"} onClick={discard}>
                {labels.discard}
              </AlertDialogAction>
            )}
            {!waiting && canSaveAll && (
              <AlertDialogAction loading={request?.phase === "saving"} onClick={() => void saveAndLeave()}>
                {labels.saveAndLeave}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </UnsavedChangesStateContext.Provider>
    </UnsavedChangesContext.Provider>
  )
}

/**
 * 保存の単位（フォーム）を、移動の確認の対象に登録する。UnsavedChangesProvider の外では何もしない。
 * onSave を渡すと「保存して移動」の対象になる（canSave が false の間は除く）。保存が成功したら true を返す。
 * onDiscard は「変更を破棄」で呼ぶ。値を最後に保存した値に戻す（同じ画面に残る場合に、再び確認しないため）。
 */
function useUnsavedChanges({
  dirty,
  saving = false,
  label,
  canSave = true,
  revision,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  saving?: boolean
  /** 確認の文に示す名前（「請求先」など）。保存の単位が 1 つだけの画面では省略してよい */
  label?: string
  canSave?: boolean
  /** 値の変更の回数（useFormState の revision）。破棄や保存の後の新しい変更を、確認の対象に戻すために使う */
  revision?: number | string
  onSave?: () => Promise<boolean>
  onDiscard?: () => void
}) {
  const registry = React.useContext(UnsavedChangesContext)
  const id = React.useId()
  // 描画の中で書き換えない。transition が commit されずに保留している間に「保存して移動」を押しても、
  // commit されていない描画の onSave（別のスコープの保存）を呼ばないため、commit の時点で更新する
  const handlers = React.useRef({ onSave, onDiscard })
  React.useLayoutEffect(() => {
    handlers.current = { onSave, onDiscard }
  })
  const entry = React.useMemo(
    () => ({
      label,
      dirty,
      saving,
      revision,
      canSave: canSave && Boolean(onSave),
      save: onSave ? () => handlers.current.onSave?.() ?? Promise.resolve(false) : undefined,
      discard: () => handlers.current.onDiscard?.(),
    }),
    [label, dirty, saving, revision, canSave, onSave]
  )
  const entryRef = React.useRef(entry)
  React.useLayoutEffect(() => {
    entryRef.current = entry
  })
  React.useEffect(() => {
    if (!registry) return
    // 登録と解除は、マウントとアンマウントだけで行う（registry の関数は変わらない）
    registry.register(id, entryRef.current)
    return () => registry.unregister(id)
  }, [registry, id])
  React.useEffect(() => {
    registry?.update(id, entry)
  }, [registry, id, entry])
}

/**
 * 製品のルーターと接続する。
 * confirmNavigation(proceed, { onCancel })：未保存の変更も保存中の処理もなければ、すぐに proceed を呼んで true を返す。
 * あれば確認を開いて false を返す。許可されたら proceed、取り消されたら onCancel を呼ぶ。
 */
function useNavigationGuard() {
  const registry = React.useContext(UnsavedChangesContext)
  const state = React.useContext(UnsavedChangesStateContext)
  return React.useMemo(
    () =>
      registry && state
        ? {
            hasUnsavedChanges: state.hasUnsavedChanges,
            saving: state.saving,
            /** 確認を表示している */
            pending: state.pending,
            confirmNavigation: registry.confirmNavigation,
          }
        : {
            hasUnsavedChanges: false,
            saving: false,
            pending: false,
            confirmNavigation: (proceed: () => void) => {
              proceed()
              return true
            },
          },
    [registry, state]
  )
}

/**
 * Dialog、Sheet、Drawer を閉じるときの、変更の破棄の確認。各部品の onDiscardRequest から開く。
 * 親の Overlay の中に置くと入れ子になり、Escape はこの確認だけを閉じる（入力は残る）。
 * onSave を渡すと「保存して閉じる」を加える。保存に失敗した場合は、確認を閉じて Overlay と入力を残す（製品が処理する）。
 */
function DiscardChangesAlert({
  open,
  onOpenChange,
  onDiscard,
  onSave,
  saving = false,
  title = defaultLabels.title,
  description = "入力した内容は保存されません。",
  saveLabel = "保存して閉じる",
  ...props
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
  onSave?: () => void
  saving?: boolean
  title?: React.ReactNode
  description?: React.ReactNode
  saveLabel?: string
} & Omit<React.ComponentProps<typeof AlertDialogContent>, "children">) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <AlertDialogContent size="sm" data-slot="discard-changes-alert" {...props}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>{defaultLabels.keepEditing}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={saving} onClick={onDiscard}>
            {defaultLabels.discard}
          </AlertDialogAction>
          {onSave && (
            <Button loading={saving} onClick={onSave}>
              {saveLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { DiscardChangesAlert, UnsavedChangesProvider, useNavigationGuard, useUnsavedChanges }
