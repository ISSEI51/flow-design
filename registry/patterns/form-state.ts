"use client"

import * as React from "react"

import { useScopeGuard } from "@/patterns/scope-guard"

// Flow Design Form State（Patterns / Forms & Workflows）
// 1 つの保存の単位（フォーム）の状態を持つ hook。定義と判断基準は docs/web/patterns/create-and-edit.md を参照。
//
// 分けて持つ状態
//   操作の履歴（interacted）   … 利用者が値を変えた項目。触れただけ（フォーカス）では含めない
//   現在の値（values）
//   入力の妥当性                … 描画のたびに、現在の値から同期の検証を計算する（Blur を待たない）
//   エラーの表示（shown）       … 入力を終えた（Blur した）項目、選択を確定した項目、保存を試みた後のすべての項目
//   未保存の変更（isDirty）     … 最後に保存した値（baseline）と現在の値の比較。normalize した値で比べる
//   非同期の検証（async）       … 検証のキー（値、依存する値、スコープ）ごとの結果。古いキーの応答は使わない
//   保存の処理（status）        … idle、submitting、succeeded、failed、unknown（保存されたかわからない）
//
// 保存の可否（canSubmit）とエラーの表示は分ける。
// - canSubmit は、表示に関係なく、表示中のすべての項目（active）の検証が成功したときだけ true。
//   最後の項目からフォーカスを外さなくても、正しい値を入力した時点で保存できる。
// - エラーは、入力を終えるまで表示しない。入力中の不完全な値（「yamada@」など）をエラーとして見せない。
// - IME で変換中の項目がある間、非同期の検証の結果を待つ間、保存中、保存の結果が不明な間は、保存できない。
// - 編集のフォーム（requireChanges）では、変更がなければ保存しない。
// - 送信の処理（handleSubmit）でも同じ条件を確かめる。ボタンの disabled だけに頼らない（Enter、requestSubmit）。
//   保存ボタンを focusableWhenDisabled で無効にしている間は、Enter の暗黙の送信が起きないため、submitOnEnter で受け取る。
//
// スコープと世代
// - scopeKey（アカウント、ワークスペース、レコード）が変わる、reset を呼ぶ、アンマウントすると、世代を進める。
//   それより前に始めた非同期の検証、保存、自動補完の結果は、新しい状態（値、基準値、エラー、通知）を変えない。
//   AbortSignal を無視する処理でも、結果を世代で照合する。
// - AbortSignal はクライアントの待機の中止であり、サーバーでの処理の取り消しを保証しない。
//
// 値の前提
// - 値は不変のデータとして扱う（変えるときは新しいオブジェクトや配列を渡す）。hook は値を複製しない。
// - 比較（stableKey）が扱うのは、文字列、数値、真偽値、null、undefined、Date、配列、プレーンなオブジェクト。
//   Map、Set、クラスのインスタンス、関数は扱わない。必要な場合は normalize で上の形にする。
//
// この hook が持たないもの（製品の責務）
// - 検証の規則の中身、サーバー側の検証、保存の API と冪等性、保存の後の移動、Toast。
// - 入力欄の id とフォーカスの移動（blockers の項目名から、製品が入力欄を探す）。
// - 特定のフォームのライブラリへの依存。値は製品の型（V）のまま持つ。

export type FormValues = Record<string, unknown>

export type FieldConfig<V extends FormValues, K extends keyof V = keyof V> = {
  /** 項目の名前。保存できない理由の表示に使う（例：「会社名」） */
  label: string
  /** 必須。条件で変わる場合は関数にする */
  required?: boolean | ((values: V) => boolean)
  /** 必須の項目が空のときの文。既定は「{label}を入力してください」 */
  requiredMessage?: string
  /** 空とみなす値。既定は null、undefined、空白だけの文字列、空の配列、false */
  isEmpty?: (value: V[K]) => boolean
  /** 同期の検証。空でない値だけを検証する。エラーの文（原因と直し方）を返し、正しければ null */
  validate?: (value: V[K], values: V) => string | null
  /**
   * 非同期の検証（重複の確認など）。同期の検証が成功した値だけを、入力が止まってから確かめる。
   * 結果は検証のキー（この項目の値、asyncDeps の値、scopeKey）ごとに持ち、古いキーの応答は使わない。
   * 例外、拒否、期限切れ（asyncTimeoutMs）は「検証できなかった」として扱う（asyncFailure）
   */
  validateAsync?: (value: V[K], values: V, context: { signal: AbortSignal }) => Promise<string | null>
  /**
   * 非同期の検証が依存するほかの項目の値（組織と顧客コード、国と郵便番号など）。
   * 返した値が変わると、この項目の値が同じでも以前の結果を使わず、検証し直す
   */
  asyncDeps?: (values: V) => unknown
  /**
   * 非同期の検証ができなかった（通信の失敗、期限切れ、例外）場合の扱い。
   * block（既定）：保存できない。revalidate で確かめ直す。
   * allow：保存を止めない。保存の処理の中で、サーバーが必ず同じ検証を行う場合だけ選ぶ（権限、前提の条件の確認には使わない）
   */
  asyncFailure?: "block" | "allow"
  /** 非同期の検証の期限（ms）。過ぎたら検証できなかったとして扱う。既定は 10000 */
  asyncTimeoutMs?: number
  /**
   * 表示の条件。false の項目は、検証、保存の可否、送信する値、未保存の判定から除く。
   * 値は消さずに保持し、条件が戻ったときに再び表示する（利用者の入力を意図せず消さない）
   */
  active?: (values: V) => boolean
  /** 保存するデータとしての値。未保存の判定に使う（前後の空白を除く、順序のない配列を並べるなど） */
  normalize?: (value: V[K]) => unknown
}

export type FormFields<V extends FormValues> = { [K in keyof V]: FieldConfig<V, K> }

/**
 * pending：入力が止まるのを待っている。validating：確かめている。valid、invalid：結果。
 * error：検証できなかった（保存を止める）。unverified：検証できなかったが asyncFailure が allow（保存を止めない）
 */
export type AsyncCheckStatus = "idle" | "pending" | "validating" | "valid" | "invalid" | "error" | "unverified"

export type FormStatus = "idle" | "submitting" | "succeeded" | "failed" | "unknown"

/** 保存の処理の結果。製品の保存の処理が返す */
export type FormSaveResult<V extends FormValues> =
  /** 保存した。values はサーバーが保存した値（正規化した値など）。省略すると送信した値 */
  | { status: "success"; values?: Partial<V> }
  /** サーバー側の検証で保存できなかった（重複、権限の変更、同時の編集など）。入力は残す */
  | { status: "invalid"; fieldErrors?: Partial<Record<keyof V, string>>; formError?: string }
  /** 保存されていないことが確かな失敗（サーバーが処理を拒否した、送信の前に失敗した） */
  | { status: "failed"; formError: string }
  /** 保存されたかわからない（タイムアウト、応答の前の切断、予期しない例外）。無条件に再実行させない */
  | { status: "unknown"; formError: string }

/**
 * 保存の処理が投げる例外の種類を示す。failed は保存されていないことが確かな失敗。
 * FormSaveError ではない例外（通信の例外など）は、サーバーで処理が終わっている可能性があるため unknown として扱う
 */
export class FormSaveError extends Error {
  outcome: "failed" | "unknown"
  constructor(message: string, outcome: "failed" | "unknown") {
    super(message)
    this.name = "FormSaveError"
    this.outcome = outcome
  }
}

export type FormBlockerKind = "missing" | "incomplete" | "invalid" | "checking" | "check-failed"

/** 保存できない理由。項目ごと */
export type FormBlocker<V extends FormValues> = {
  name: keyof V & string
  label: string
  /**
   * missing：必須の項目が空。incomplete：値はあるが、検証が成功していない（エラーはまだ表示していない）。
   * invalid：エラーを表示している。checking：非同期の検証の結果を待っている。
   * check-failed：非同期の検証ができなかった（revalidate で確かめ直す）
   */
  kind: FormBlockerKind
  message: string | null
}

type AsyncEntry = { key: string; status: AsyncCheckStatus; message: string | null }
type ServerError = { message: string; key: string }

type State<V extends FormValues> = {
  values: V
  baseline: V
  interacted: ReadonlySet<keyof V>
  shown: ReadonlySet<keyof V>
  composing: ReadonlySet<keyof V>
  /** 利用者が値を変えた回数。遅れて届いた自動補完の結果で、利用者の修正を上書きしないために使う */
  edits: Readonly<Partial<Record<keyof V, number>>>
  /** 自動補完で値を入れた回数。古い自動補完の応答で、新しい自動補完の値を上書きしないために使う */
  fills: Readonly<Partial<Record<keyof V, number>>>
  /** 確かめ直しを求めた回数（検証のキーに含める） */
  rechecks: Readonly<Partial<Record<keyof V, number>>>
  async: Readonly<Partial<Record<keyof V, AsyncEntry>>>
  server: Readonly<Partial<Record<keyof V, ServerError>>>
  formError: string | null
  status: FormStatus
  /** 送信中の値（送信した時点で確定する）。結果が不明の場合は、その保存で送信した値を残す */
  submitted: V | null
  /** 送信した項目（送信した時点で表示していた項目） */
  submittedFields: readonly (keyof V)[]
  /** reset とスコープの変更の回数。非同期の検証を、同じキーでも始め直すために使う */
  epoch: number
  /** この状態が属するスコープ（useScopeGuard の値）。A → B → A の最初の A と最後の A は別のオブジェクト */
  owner: object | null
}

const emptyState = <V extends FormValues>(values: V, epoch = 0, owner: object | null = null): State<V> => ({
  epoch,
  owner,
  values,
  baseline: values,
  interacted: new Set(),
  shown: new Set(),
  composing: new Set(),
  edits: {} as State<V>["edits"],
  fills: {} as State<V>["fills"],
  rechecks: {} as State<V>["rechecks"],
  async: {} as State<V>["async"],
  server: {} as State<V>["server"],
  formError: null,
  status: "idle",
  submitted: null,
  submittedFields: [],
})

function defaultIsEmpty(value: unknown) {
  if (value === null || value === undefined || value === false) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * 構造の比較のためのキー。扱う値：文字列、数値、真偽値、null、undefined、Date、配列（順序を含めて比べる）、プレーンなオブジェクト（キーの順序は問わない）。
 * Map、Set、クラスのインスタンスは扱わない（プレーンなオブジェクトと同じように列挙できるプロパティだけを比べる）。必要な場合は normalize で変換する
 */
export function stableKey(value: unknown): string {
  if (value === undefined) return "u"
  if (typeof value === "number" && !Number.isFinite(value)) return `n${String(value)}`
  if (value instanceof Date) return `d${value.getTime()}`
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableKey(v)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? String(value)
}

const add = <T,>(set: ReadonlySet<T>, ...items: T[]) => {
  if (items.every((i) => set.has(i))) return set
  const next = new Set(set)
  for (const i of items) next.add(i)
  return next
}
const remove = <T,>(set: ReadonlySet<T>, item: T) => {
  if (!set.has(item)) return set
  const next = new Set(set)
  next.delete(item)
  return next
}

type StringKeys<V> = { [K in keyof V]: V[K] extends string ? K : never }[keyof V] & string

/** 自動補完を始めた時点の記録（captureEdits の戻り値） */
export type AutofillToken<V extends FormValues> = {
  generation: number
  edits: Partial<Record<keyof V, number>>
  fills: Partial<Record<keyof V, number>>
}

type AsyncJob = { key: string; timer: number; generation: number; controller?: AbortController; deadline?: number }

const UNKNOWN_MESSAGE = "保存されたかを確かめられていません。「保存されたかを確認」で確かめてから、必要な場合だけもう一度保存してください。"

export function useFormState<V extends FormValues>({
  initialValues,
  fields,
  asyncDebounceMs = 400,
  scopeKey,
  requireChanges = false,
}: {
  /** 最後に保存した値（基準値）。登録は初期値、編集は読み込んだ値。変えるときは reset を呼ぶ */
  initialValues: V
  fields: FormFields<V>
  /** 非同期の検証を始めるまでの、入力が止まってからの時間（ms） */
  asyncDebounceMs?: number
  /**
   * アカウント、ワークスペース、レコードなど。変わったら、非同期の検証の結果、サーバーのエラー、保存の状態を捨て、
   * 実行中の処理の結果を使わない。値と基準値は変えない（新しいスコープの値は、製品が reset で渡す）
   */
  scopeKey?: string
  /** 編集のフォーム。変更がない間は保存しない（Button、Enter、requestSubmit、handleSubmit のすべて） */
  requireChanges?: boolean
}) {
  // スコープの境界。スコープごとに別のオブジェクトになり（A → B → A でも別）、古い描画の関数からの操作の照合に使う
  const guard = useScopeGuard(scopeKey)
  const [rawState, setState] = React.useState<State<V>>(() => emptyState(initialValues, 0, guard))
  // スコープが変わった描画の initialValues から始めた状態（新しいスコープの値は initialValues で渡す）
  const scopeStart = React.useMemo(() => emptyState(initialValues, 0, guard), [guard])
  // 新しいスコープの最初の描画から、前のスコープの値、基準値、エラー、保存の状態を返さない（effect を待たない）。
  // 送信もできない（handleSubmit は commit されたスコープの値でだけ送る）。
  const state: State<V> = rawState.owner === guard ? rawState : { ...scopeStart, epoch: rawState.epoch + 1 }
  // commit された状態。描画の中では書き換えない（commit されていない描画の状態で送信や検証をしないため）
  const stateRef = React.useRef(rawState)
  const fieldsRef = React.useRef(fields)
  // 描画の中の検証（evaluate）が、その描画の fields を使うため、描画の中で更新する
  fieldsRef.current = fields
  const names = React.useMemo(() => Object.keys(fields) as (keyof V & string)[], [fields])
  // 世代。reset、スコープの変更、アンマウントで進める。古い世代の処理の結果は使わない
  const generation = React.useRef(0)
  const scopeRef = React.useRef(scopeKey)
  const submittingRef = React.useRef(false)
  const optionsRef = React.useRef({ requireChanges })

  React.useLayoutEffect(() => {
    stateRef.current = rawState
    optionsRef.current = { requireChanges }
  })

  const update = React.useCallback((fn: (s: State<V>) => State<V>) => {
    setState((s) => {
      const next = fn(s)
      stateRef.current = next
      return next
    })
  }, [])

  /**
   * この描画のスコープが commit されたスコープと同じ場合だけ、状態を変える。
   * 前のスコープの画面、Toast、Dialog に残った関数（古い closure）からの操作は、現在のスコープの状態を変えない。
   */
  const isLive = React.useCallback(() => stateRef.current.owner === guard && guard.isCurrent(guard.capture()), [guard])
  const updateLive = React.useCallback(
    (fn: (s: State<V>) => State<V>) => {
      if (!isLive()) return false
      update((s) => (s.owner === guard ? fn(s) : s))
      return true
    },
    [guard, isLive, update]
  )

  // ---------------------------------------------------------------- 計算（描画のたびに現在の値から）
  const normalizeOf = React.useCallback((name: keyof V, value: unknown) => {
    const n = fieldsRef.current[name]?.normalize as ((v: unknown) => unknown) | undefined
    return stableKey(n ? n(value) : value)
  }, [])

  const evaluate = React.useCallback(
    (s: State<V>, scope: string | undefined) => {
      const f = fieldsRef.current
      const active = (name: keyof V) => f[name].active?.(s.values) ?? true
      const required = (name: keyof V) => {
        const r = f[name].required
        return typeof r === "function" ? r(s.values) : Boolean(r)
      }
      const empty = (name: keyof V) => (f[name].isEmpty ?? defaultIsEmpty)(s.values[name] as never)
      // 同期の検証の結果。空の必須の項目は requiredMessage。空の任意の項目は検証しない
      const syncError = (name: keyof V): string | null => {
        if (!active(name)) return null
        if (empty(name)) return required(name) ? (f[name].requiredMessage ?? `${f[name].label}を入力してください`) : null
        return (f[name].validate as ((v: unknown, all: V) => string | null) | undefined)?.(s.values[name], s.values) ?? null
      }
      // 検証のキー：値、依存する値、スコープ、確かめ直しの回数
      const asyncKey = (name: keyof V) => {
        if (!f[name].validateAsync || !active(name) || empty(name) || syncError(name) !== null) return null
        const deps = f[name].asyncDeps?.(s.values)
        return stableKey([normalizeOf(name, s.values[name]), deps === undefined ? null : stableKey(deps), scope ?? null, s.rechecks[name] ?? 0])
      }
      const asyncEntry = (name: keyof V) => {
        const key = asyncKey(name)
        if (key === null) return null
        const entry = s.async[name]
        return entry && entry.key === key ? entry : ({ key, status: "pending", message: null } satisfies AsyncEntry)
      }
      const serverError = (name: keyof V) => {
        const e = s.server[name]
        return e && e.key === normalizeOf(name, s.values[name]) ? e.message : null
      }
      // 項目の現在のエラー（表示するかどうかとは別）
      const currentError = (name: keyof V) => {
        if (!active(name)) return null
        const sync = syncError(name)
        if (sync) return sync
        const server = serverError(name)
        if (server) return server
        const entry = asyncEntry(name)
        return entry?.status === "invalid" ? entry.message : null
      }
      return { active, required, empty, syncError, asyncKey, asyncEntry, serverError, currentError }
    },
    [normalizeOf]
  )

  const listBlockers = React.useCallback(
    (s: State<V>, scope: string | undefined, revealed: boolean): FormBlocker<V>[] => {
      const e = evaluate(s, scope)
      const out: FormBlocker<V>[] = []
      for (const name of Object.keys(fieldsRef.current) as (keyof V & string)[]) {
        if (!e.active(name)) continue
        const label = fieldsRef.current[name].label
        const error = e.currentError(name)
        if (error) {
          const kind: FormBlockerKind =
            e.empty(name) && e.required(name) ? "missing" : revealed || s.shown.has(name) || e.serverError(name) ? "invalid" : "incomplete"
          out.push({ name, label, kind, message: kind === "invalid" ? error : null })
          continue
        }
        const entry = e.asyncEntry(name)
        if (entry && (entry.status === "pending" || entry.status === "validating")) out.push({ name, label, kind: "checking", message: null })
        else if (entry?.status === "error") out.push({ name, label, kind: "check-failed", message: entry.message })
      }
      return out
    },
    [evaluate]
  )

  const ev = evaluate(state, scopeKey)
  const blockers = listBlockers(state, scopeKey, false)

  const dirtyOf = React.useCallback(
    (s: State<V>, scope: string | undefined) => {
      const e = evaluate(s, scope)
      return (Object.keys(fieldsRef.current) as (keyof V & string)[]).filter(
        (name) => e.active(name) && normalizeOf(name, s.values[name]) !== normalizeOf(name, s.baseline[name])
      )
    },
    [evaluate, normalizeOf]
  )
  const dirtyFields = dirtyOf(state, scopeKey)
  const isDirty = dirtyFields.length > 0
  const composing = state.composing.size > 0
  const submitting = state.status === "submitting"
  const unknownResult = state.status === "unknown"
  const unchanged = requireChanges && !isDirty
  const canSubmit = !submitting && !composing && !unknownResult && !unchanged && blockers.length === 0

  // ---------------------------------------------------------------- 非同期の検証
  // 項目ごとに、検証のキーが変わったときだけ始める。前のキーの検証は取り消し、応答はキーと世代で照合する。
  const jobs = React.useRef(new Map<keyof V, AsyncJob>())
  const cancelJobs = React.useCallback(() => {
    for (const job of jobs.current.values()) {
      window.clearTimeout(job.timer)
      job.controller?.abort()
    }
    jobs.current.clear()
  }, [])
  // スコープの変更の commit：古いスコープの処理の結果を使わず、値、基準値、エラー、保存の状態を、
  // スコープが変わった描画の initialValues から始め直す。commit の時点（layout effect）で行う
  // （passive effect まで待つと、その間に届いた古い保存の結果を受け付け、前のスコープの状態が 1 回 commit される）
  React.useLayoutEffect(() => {
    scopeRef.current = scopeKey
    if (stateRef.current.owner === guard) return
    generation.current++
    cancelJobs()
    submittingRef.current = false
    update((s) => (s.owner === guard ? s : { ...scopeStart, epoch: s.epoch + 1 }))
  }, [guard, scopeKey, scopeStart, cancelJobs, update])

  const asyncKeys = names.map((name) => [name, state.composing.has(name) ? null : ev.asyncKey(name)] as const)
  // epoch を含める：reset とスコープの変更の後は、同じキーでも検証を始め直す（取り消した検証の結果を待ち続けない）
  const asyncSignature = JSON.stringify([state.epoch, asyncKeys])
  React.useEffect(() => {
    const running = jobs.current
    for (const [name, key] of asyncKeys) {
      const current = running.get(name)
      if (current && current.key === key && current.generation === generation.current) continue
      if (current) {
        window.clearTimeout(current.timer)
        current.controller?.abort()
        running.delete(name)
      }
      if (key === null) continue
      const settled = stateRef.current.async[name]
      if (settled && settled.key === key && settled.status !== "pending" && settled.status !== "validating") continue
      const job: AsyncJob = { key, timer: 0, generation: generation.current }
      const isCurrent = () => running.get(name) === job && job.generation === generation.current
      const settle = (status: AsyncCheckStatus, message: string | null) => {
        if (!isCurrent()) return
        running.delete(name)
        window.clearTimeout(job.timer)
        job.controller?.abort()
        update((prev) => ({ ...prev, async: { ...prev.async, [name]: { key, status, message } } }))
      }
      const failed = (reason: "error" | "timeout") => {
        const config = fieldsRef.current[name]
        const label = config.label
        const allow = config.asyncFailure === "allow"
        // allow（保存を止めない）では、確かめ直しを求めない。保存の時にサーバーが同じ確認を行うことを伝える
        const message = allow
          ? reason === "timeout"
            ? `${label}の確認が時間内に終わりませんでした。保存するときに確かめます`
            : `${label}をいまは確かめられませんでした。保存するときに確かめます`
          : reason === "timeout"
            ? `${label}の確認が時間内に終わりませんでした。もう一度確かめてください`
            : `${label}を確かめられませんでした。通信の状態を確認して、もう一度確かめてください`
        settle(allow ? "unverified" : "error", message)
      }
      job.timer = window.setTimeout(() => {
        if (!isCurrent()) return
        const controller = new AbortController()
        job.controller = controller
        const s = stateRef.current
        const config = fieldsRef.current[name]
        update((prev) => ({ ...prev, async: { ...prev.async, [name]: { key, status: "validating", message: null } } }))
        // 期限。AbortSignal を無視する検証でも、期限を過ぎた結果は使わない
        job.timer = window.setTimeout(() => failed("timeout"), config.asyncTimeoutMs ?? 10_000)
        const validator = config.validateAsync as ((v: unknown, all: V, c: { signal: AbortSignal }) => Promise<string | null>) | undefined
        // 同期の例外も、検証できなかったとして扱う
        Promise.resolve()
          .then(() => validator?.(s.values[name], s.values, { signal: controller.signal }) ?? null)
          .then(
            (message) => {
              if (typeof message !== "string" && message !== null) return failed("error")
              settle(message ? "invalid" : "valid", message)
            },
            () => failed("error")
          )
      }, asyncDebounceMs)
      running.set(name, job)
    }
    // asyncKeys は asyncSignature で表す（毎回の描画で新しい配列になるため）
  }, [asyncSignature, asyncDebounceMs, update])


  React.useLayoutEffect(
    () => () => {
      // アンマウント：実行中の処理の結果を使わない
      generation.current++
      cancelJobs()
    },
    [cancelJobs]
  )

  // ---------------------------------------------------------------- 操作
  const setValue = React.useCallback(
    <K extends keyof V>(name: K, value: V[K], options: { composing?: boolean; commit?: boolean } = {}) => {
      updateLive((s) => ({
        ...s,
        values: { ...s.values, [name]: value },
        interacted: add(s.interacted, name),
        edits: { ...s.edits, [name]: (s.edits[name] ?? 0) + 1 },
        composing: options.composing ? add(s.composing, name) : remove(s.composing, name),
        // 選択式の項目（Select、Checkbox、日付の選択）は、選んだ時点で入力を終えたとみなす
        shown: options.commit ? add(s.shown, name) : s.shown,
        status: s.status === "succeeded" ? "idle" : s.status,
      }))
    },
    [updateLive]
  )

  /** 入力を終えた（フォーカスが外れた）。値を変えた項目だけ、エラーを表示する */
  const blur = React.useCallback(
    (name: keyof V) => {
      updateLive((s) => (s.interacted.has(name) && !s.composing.has(name) ? { ...s, shown: add(s.shown, name) } : s))
    },
    [updateLive]
  )

  const compositionStart = React.useCallback((name: keyof V) => void updateLive((s) => ({ ...s, composing: add(s.composing, name) })), [updateLive])

  /** 指定した項目のエラーを表示する（複数のステップの、表示中のステップだけ、など） */
  const reveal = React.useCallback((fieldNames: (keyof V)[]) => void updateLive((s) => ({ ...s, shown: add(s.shown, ...fieldNames) })), [updateLive])

  /** すべての項目のエラーを表示する（保存を試みたとき） */
  const revealAll = React.useCallback(() => reveal(Object.keys(fieldsRef.current) as (keyof V)[]), [reveal])

  /** 非同期の検証をやり直す（検証できなかった、結果が古い可能性がある） */
  const revalidate = React.useCallback(
    (name: keyof V) => void updateLive((s) => ({ ...s, rechecks: { ...s.rechecks, [name]: (s.rechecks[name] ?? 0) + 1 } })),
    [updateLive]
  )

  /**
   * 値と基準値を置き換え、操作の履歴、エラー、保存の状態を消す（別のレコードを開いた、連続して登録する）。
   * 世代を進めるため、それまでに始めた保存、検証、自動補完の結果は、新しい状態を変えない。
   * 前のスコープの描画の関数から呼んだ場合は何もしない（false）
   */
  const reset = React.useCallback(
    (values?: V) => {
      if (!isLive()) return false
      generation.current++
      cancelJobs()
      submittingRef.current = false
      update((s) => (s.owner === guard ? emptyState(values ?? s.baseline, s.epoch + 1, guard) : s))
      return true
    },
    [cancelJobs, guard, isLive, update]
  )

  /**
   * 値を最後に保存した値（基準値）に戻す。未保存の変更の破棄に使う。
   * 保存中と、保存の結果が不明な間は破棄しない（false）。送信した値（submittedValues）は、保存されたかを確かめるために残す
   */
  const discard = React.useCallback(() => {
    const status = stateRef.current.status
    if (submittingRef.current || status === "submitting" || status === "unknown") return false
    return reset()
  }, [reset])

  /**
   * 自動補完を始める時点の記録。応答が届いたら applyAutofill に渡す。
   * その間に利用者が変えた項目、ほかの自動補完が値を入れた項目、reset やスコープの変更の後の応答は、値を変えない
   */
  const captureEdits = React.useCallback((fieldNames: (keyof V)[]): AutofillToken<V> => {
    const s = stateRef.current
    return {
      // 前のスコープの描画の関数から作った記録は、どの世代とも一致しない
      generation: isLive() ? generation.current : -1,
      edits: Object.fromEntries(fieldNames.map((n) => [n, s.edits[n] ?? 0])) as Partial<Record<keyof V, number>>,
      fills: Object.fromEntries(fieldNames.map((n) => [n, s.fills[n] ?? 0])) as Partial<Record<keyof V, number>>,
    }
  }, [isLive])

  const applyAutofill = React.useCallback(
    (token: AutofillToken<V>, patch: Partial<V>) => {
      if (token.generation !== generation.current || !isLive()) return [] as (keyof V)[]
      // 入れる項目は、最新の状態で同期に決める（更新の関数は副作用を持たない）
      const ok = (s: State<V>, key: keyof V) => (s.edits[key] ?? 0) === (token.edits[key] ?? 0) && (s.fills[key] ?? 0) === (token.fills[key] ?? 0)
      const applied = (Object.keys(patch) as (keyof V)[]).filter((key) => key in token.edits && ok(stateRef.current, key))
      if (!applied.length) return applied
      update((s) => {
        if (s.owner !== guard) return s
        const keys = applied.filter((key) => ok(s, key))
        if (!keys.length) return s
        const values = { ...s.values }
        const fills: Partial<Record<keyof V, number>> = { ...s.fills }
        for (const key of keys) {
          values[key] = patch[key] as V[keyof V]
          fills[key] = (fills[key] ?? 0) + 1
        }
        // 自動で入れた値は入力を終えた値として扱い、問題があればすぐに示す。編集の回数は増やさない
        return { ...s, values, fills, shown: add(s.shown, ...keys) }
      })
      return applied
    },
    [guard, isLive, update]
  )

  /** 送信する値。表示していない（active が false の）項目は含めない */
  const getSubmitValues = React.useCallback((): Partial<V> => {
    const s = stateRef.current
    const e = evaluate(s, scopeRef.current)
    const out: Partial<V> = {}
    for (const name of Object.keys(fieldsRef.current) as (keyof V)[]) if (e.active(name)) out[name] = s.values[name]
    return out
  }, [evaluate])

  /**
   * 送信の処理を作る。form の onSubmit に渡すか、ボタンから呼ぶ。返す Promise は、保存できた場合だけ true になる。
   * - 何もしない（false）：保存中、変換中、保存の結果が不明、変更のない編集（requireChanges）、非同期の検証を待っている間。
   * - 保存できない（未入力、エラー、検証できなかった）：すべての項目のエラーを表示し、onBlocked を呼ぶ（最初の項目へのフォーカスなど）。
   * - 送信した時点の値を確定し、保存の処理に渡す。保存中に入力した値は、保存した値として扱わない。
   * - 保存の処理の例外：FormSaveError はその outcome。それ以外の例外は、サーバーで処理が終わっている可能性があるため unknown。
   * - 保存の間に reset、スコープの変更、アンマウントがあった場合は、結果で状態を変えず、onSuccess を呼ばない（false）。
   */
  const handleSubmit = React.useCallback(
    (
      save: (values: Partial<V>, context: { values: V }) => Promise<FormSaveResult<V>>,
      options: {
        onBlocked?: (blockers: FormBlocker<V>[]) => void
        /** changedWhileSaving：保存中に値が変わり、保存した後も未保存の変更が残っている */
        onSuccess?: (saved: V, info: { changedWhileSaving: boolean }) => void
      } = {}
    ) =>
      async (event?: { preventDefault: () => void }): Promise<boolean> => {
        event?.preventDefault()
        // 前のスコープの描画で作った送信の処理（古い画面、Dialog、Toast の closure）、commit の前、アンマウントの後は送らない。
        // 送ると、新しいスコープの値を、古いスコープの save（古いレコードの ID など）に渡すことになる
        if (!isLive()) return false
        const s = stateRef.current
        const scope = scopeRef.current
        if (submittingRef.current || s.status === "submitting" || s.status === "unknown" || s.composing.size > 0) return false
        if (optionsRef.current.requireChanges && dirtyOf(s, scope).length === 0) return false
        const found = listBlockers(s, scope, true)
        if (found.length > 0) {
          // 非同期の検証の結果を待っているだけなら、エラーを出さずに何もしない
          if (found.every((b) => b.kind === "checking")) return false
          revealAll()
          options.onBlocked?.(found.filter((b) => b.kind !== "checking"))
          return false
        }
        submittingRef.current = true
        const gen = generation.current
        const snapshot = s.values
        const submitValues = getSubmitValues()
        const sentFields = Object.keys(submitValues) as (keyof V)[]
        update((prev) => ({ ...prev, status: "submitting", submitted: snapshot, submittedFields: sentFields, formError: null, server: {} as State<V>["server"] }))
        let outcome: FormSaveResult<V>
        try {
          outcome = await save(submitValues, { values: snapshot })
        } catch (error) {
          outcome =
            error instanceof FormSaveError && error.outcome === "failed"
              ? { status: "failed", formError: error.message }
              : { status: "unknown", formError: error instanceof FormSaveError ? error.message : UNKNOWN_MESSAGE }
        }
        // 古い世代の結果は使わない（別のレコード、別のスコープ、アンマウントの後）
        if (gen !== generation.current) return false
        submittingRef.current = false
        if (outcome.status === "success") {
          const latest = stateRef.current
          // 基準値：送信した項目はサーバーが保存した値、送信していない（非表示の）項目は以前の基準値のまま
          const savedValues = { ...latest.baseline, ...submitValues, ...(outcome.values ?? {}) } as V
          const changedWhileSaving = (Object.keys(fieldsRef.current) as (keyof V)[]).some(
            (key) => key in submitValues && normalizeOf(key, latest.values[key]) !== normalizeOf(key, snapshot[key])
          )
          update((prev) => {
            // 保存中に変えていない項目だけ、サーバーが保存した値（正規化した値）にそろえる
            const values = { ...prev.values }
            for (const key of Object.keys(outcome.values ?? {}) as (keyof V)[]) {
              if (normalizeOf(key, prev.values[key]) === normalizeOf(key, snapshot[key])) values[key] = savedValues[key]
            }
            return { ...prev, values, baseline: savedValues, status: "succeeded", submitted: null, formError: null }
          })
          options.onSuccess?.(savedValues, { changedWhileSaving })
          return true
        }
        if (outcome.status === "invalid") {
          const server: Partial<Record<keyof V, ServerError>> = {}
          for (const key of Object.keys(outcome.fieldErrors ?? {}) as (keyof V)[]) {
            const message = outcome.fieldErrors?.[key]
            if (message) server[key] = { message, key: normalizeOf(key, snapshot[key]) }
          }
          update((prev) => ({
            ...prev,
            status: "failed",
            submitted: null,
            server,
            shown: add(prev.shown, ...(Object.keys(server) as (keyof V)[])),
            formError: outcome.formError ?? null,
          }))
          return false
        }
        // 結果が不明な場合は、送信した値を残す（製品が、保存されたかを送信した値で確かめる）
        update((prev) => ({ ...prev, status: outcome.status, submitted: outcome.status === "unknown" ? snapshot : null, formError: outcome.formError }))
        return false
      },
    [dirtyOf, getSubmitValues, isLive, listBlockers, normalizeOf, revealAll, update]
  )

  /** 製品が別の経路で保存した値を、基準値にする（下書きの再開、即時保存との組み合わせなど） */
  const markSaved = React.useCallback((values: V) => updateLive((s) => ({ ...s, baseline: values })), [updateLive])

  /**
   * 保存の結果が不明な状態を、製品が確かめた結果で解く。メッセージを消すだけでは解かない（clearFormError では解けない）。
   * saved：サーバーに保存されていた。values（既定は送信した値）を基準値にする。送信の後に変えた値は未保存のまま残る。
   * not-saved：保存されていなかった。もう一度保存できる状態に戻す
   * 照会は、現在のスコープの認可で行う（製品の責務）。前のスコープの描画の関数から呼んだ場合は何もしない（false）
   */
  const resolveUnknown = React.useCallback(
    (result: { saved: true; values?: V } | { saved: false }) =>
      updateLive((s) => {
        if (s.status !== "unknown") return s
        if (result.saved) {
          // 送信した項目だけを基準値にする（送信していない非表示の項目は、以前の基準値のまま）
          const source = result.values ?? s.submitted ?? s.values
          const baseline = { ...s.baseline }
          for (const key of s.submittedFields) baseline[key] = source[key]
          return { ...s, baseline, status: "succeeded", submitted: null, formError: null }
        }
        return { ...s, status: "idle", submitted: null, formError: null }
      }),
    [updateLive]
  )

  /** テキストの入力欄（Input、Textarea）に渡す props。IME の変換と Blur を扱う */
  const inputProps = <K extends StringKeys<V>>(name: K) => ({
    name,
    value: state.values[name] as string,
    required: ev.active(name) && ev.required(name),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue(name, event.target.value as V[K], { composing: Boolean((event.nativeEvent as InputEvent).isComposing) }),
    onCompositionStart: () => compositionStart(name),
    onCompositionEnd: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue(name, event.currentTarget.value as V[K], { composing: false }),
    onBlur: () => blur(name),
  })

  /** 表示するエラー。入力を終える前の項目は null。サーバーの検証のエラーはすぐに表示する */
  const error = (name: keyof V) => {
    if (!ev.active(name) || state.composing.has(name)) return null
    const server = ev.serverError(name)
    if (server) return server
    return state.shown.has(name) ? ev.currentError(name) : null
  }

  const revision = names.reduce((n, name) => n + (state.edits[name] ?? 0) + (state.fills[name] ?? 0), 0)

  return {
    values: state.values,
    baseline: state.baseline,
    status: state.status,
    submitting,
    /** 送信中の値。結果が不明（unknown）の場合は、その保存で送信した値 */
    submittedValues: state.submitted,
    /** フォーム全体のエラー（保存の失敗、サーバーの検証） */
    formError: state.formError,
    canSubmit,
    blockers,
    composing,
    isDirty,
    dirtyFields,
    /** 変更がないため保存しない（requireChanges の編集のフォーム） */
    unchanged,
    /** 値の変更の回数（利用者の入力と自動補完）。未保存の変更の確認（useUnsavedChanges の revision）に渡す */
    revision,
    error,
    /** 表示する項目か（active） */
    isActive: (name: keyof V) => ev.active(name),
    isRequired: (name: keyof V) => ev.active(name) && ev.required(name),
    /** 値を変えた項目か（操作の履歴） */
    isInteracted: (name: keyof V) => state.interacted.has(name),
    asyncStatus: (name: keyof V): AsyncCheckStatus => ev.asyncEntry(name)?.status ?? "idle",
    /** 非同期の検証の文（検証できなかった理由など） */
    asyncMessage: (name: keyof V) => ev.asyncEntry(name)?.message ?? null,
    setValue,
    blur,
    compositionStart,
    reveal,
    revealAll,
    revalidate,
    reset,
    discard,
    markSaved,
    resolveUnknown,
    captureEdits,
    applyAutofill,
    getSubmitValues,
    handleSubmit,
    inputProps,
    /**
     * フォーム全体のエラーの文を消す（利用者が閉じたとき）。保存の結果が不明な状態は解かない（文だけを消し、保存できないまま。resolveUnknown で解く）
     */
    clearFormError: () =>
      updateLive((s) =>
        s.status === "unknown" || s.status === "submitting" ? { ...s, formError: null } : { ...s, formError: null, status: "idle" }
      ),
  }
}

export type FormState<V extends FormValues> = ReturnType<typeof useFormState<V>>

/**
 * 1 行の入力欄での Enter を、送信の処理（handleSubmit の戻り値）に渡す。form の onKeyDown に指定する。
 * 保存ボタンを focusableWhenDisabled で無効にしている間、ブラウザの暗黙の送信（Enter）は Base UI がボタンへのクリックを
 * 止めるため submit にならない。この関数で送信の処理を呼ぶ。保存の条件は handleSubmit が確かめる。
 *
 * 送信にしない Enter
 * - IME の変換の確定（isComposing、keyCode 229）、修飾キー付き、押し続けによる連続の入力（repeat）、ほかの処理が止めた（defaultPrevented）
 * - Textarea、contenteditable、ボタン、Checkbox、Radio、File、日付と時刻の入力欄
 * - Combobox、Multi Select、Select、Date Picker、Dropdown Menu などの部品（role が combobox、listbox、menu、grid、
 *   aria-haspopup、aria-expanded="true" の要素、それらの中の要素）
 * - Date Picker と Date Range Picker の文字の入力欄（data-slot が date-picker、date-range-picker の中の入力欄）。
 *   Enter は入力した日付の確定であり、送信ではない（確定した日付を確かめてから、利用者が保存する）
 * - フォームの外の要素、フォームとは別の Dialog の中の要素（Dialog の中の独立した操作）、読み取り専用と無効の入力欄
 * - data-submit-on-enter="false" を付けた要素とその中の要素
 */
const textInputTypes = new Set(["text", "email", "tel", "url", "search", "number", "password", ""])
const widgetSelector = "[role=combobox],[role=listbox],[role=menu],[role=grid],[role=tree],[aria-haspopup]:not([aria-haspopup=false]),[aria-expanded=true]"
// 日付の文字の入力欄（Components の DatePicker、DateRangePicker）。Enter は日付の確定（部品が onKeyDown で確定する）
const dateEntrySelector = "[data-slot=date-picker],[data-slot=date-range-picker]"

// 暗黙の送信（Enter）の対象になる入力欄の種類
const implicitSubmitTypes = new Set([...textInputTypes, "date", "datetime-local", "month", "week", "time", "checkbox", "radio", "range", "color"])

export function submitOnEnter(event: React.KeyboardEvent<HTMLFormElement>, submit: () => unknown) {
  if (event.key !== "Enter" || event.defaultPrevented) return
  // 変換の確定の Enter では、ブラウザは送信しない。何もしない（変換を妨げない）
  if (event.nativeEvent.isComposing || event.keyCode === 229) return
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const form = event.currentTarget
  // フォームの外の要素（Portal で描画した Popover や、別の Dialog）での Enter には触れない
  if (!form.contains(target)) return
  const excluded =
    event.repeat ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    !textInputTypes.has(target.type) ||
    target.readOnly ||
    target.disabled ||
    Boolean(target.closest(widgetSelector)) ||
    Boolean(target.closest(dateEntrySelector)) ||
    Boolean(target.closest("[data-submit-on-enter=false]")) ||
    target.closest("[role=dialog],[role=alertdialog]") !== form.closest("[role=dialog],[role=alertdialog]")
  if (excluded) {
    // 送信にしない Enter でも、保存ボタンが押せる間は、ブラウザの暗黙の送信が起きる。それを止める
    // （部品の Enter の処理（Combobox の選択など）は、この前に要素の側で終わっている）
    if (implicitSubmitTypes.has(target.type) && !target.closest(widgetSelector)) event.preventDefault()
    return
  }
  event.preventDefault()
  void submit()
}
