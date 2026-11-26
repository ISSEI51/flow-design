"use client"

import * as React from "react"

// Flow Design Form State（Patterns / Forms & Workflows）
// 1 つの保存の単位（フォーム）の状態を持つ hook。定義と判断基準は docs/web/patterns/create-and-edit.md を参照。
//
// 分けて持つ状態
//   操作の履歴（interacted）   … 利用者が値を変えた項目。触れただけ（フォーカス）では含めない
//   現在の値（values）
//   入力の妥当性                … 描画のたびに、現在の値から同期の検証を計算する（Blur を待たない）
//   エラーの表示（shown）       … 入力を終えた（Blur した）項目、選択を確定した項目、保存を試みた後のすべての項目
//   未保存の変更（isDirty）     … 最後に保存した値（baseline）と現在の値の比較。normalize した値で比べる
//   非同期の検証（async）       … 値ごとの結果。古い値の応答は、現在の値の結果として使わない
//   保存の処理（status）        … idle、submitting、succeeded、failed、unknown（保存されたかわからない）
//
// 保存の可否（canSubmit）とエラーの表示は分ける。
// - canSubmit は、表示に関係なく、表示中のすべての項目（active）の検証が成功したときだけ true。
//   最後の項目からフォーカスを外さなくても、正しい値を入力した時点で保存できる。
// - エラーは、入力を終えるまで表示しない。入力中の不完全な値（「yamada@」など）をエラーとして見せない。
// - IME で変換中の項目がある間は、保存できない（確定していない値を検証しない）。
// - 送信の処理（handleSubmit）でも条件を確かめる。ボタンの disabled だけに頼らない（Enter、requestSubmit）。
//   保存ボタンを focusableWhenDisabled で無効にしている間は、Enter の暗黙の送信が起きないため、submitOnEnter で受け取る。
// - 保存されたかわからない（unknown）場合は、製品が状態を確かめるまで保存できない（無条件に再実行しない）。
//
// この hook が持たないもの（製品の責務）
// - 検証の規則の中身、サーバー側の検証、保存の API、保存の後の移動、Toast。
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
   * 結果は値ごとに持ち、古い値の応答は使わない。通信に失敗した場合は保存を止めない（保存時にサーバーが確かめる）
   */
  validateAsync?: (value: V[K], values: V, context: { signal: AbortSignal }) => Promise<string | null>
  /**
   * 表示の条件。false の項目は、検証、保存の可否、送信する値、未保存の判定から除く。
   * 値は消さずに保持し、条件が戻ったときに再び表示する（利用者の入力を意図せず消さない）
   */
  active?: (values: V) => boolean
  /** 保存するデータとしての値。未保存の判定に使う（前後の空白を除く、順序のない配列を並べるなど） */
  normalize?: (value: V[K]) => unknown
}

export type FormFields<V extends FormValues> = { [K in keyof V]: FieldConfig<V, K> }

export type AsyncCheckStatus = "idle" | "pending" | "validating" | "valid" | "invalid" | "unverified"

export type FormStatus = "idle" | "submitting" | "succeeded" | "failed" | "unknown"

/** 保存の処理の結果。製品の保存の処理が返す */
export type FormSaveResult<V extends FormValues> =
  /** 保存した。values はサーバーが保存した値（正規化した値など）。省略すると送信した値 */
  | { status: "success"; values?: Partial<V> }
  /** サーバー側の検証で保存できなかった（重複、権限の変更、同時の編集など）。入力は残す */
  | { status: "invalid"; fieldErrors?: Partial<Record<keyof V, string>>; formError?: string }
  /** 保存されていない（通信の失敗、サーバーの障害） */
  | { status: "failed"; formError: string }
  /** 保存されたかわからない（タイムアウト、応答の前の切断）。無条件に再実行させない */
  | { status: "unknown"; formError: string }

export type FormBlockerKind = "missing" | "incomplete" | "invalid" | "checking"

/** 保存できない理由。項目ごと */
export type FormBlocker<V extends FormValues> = {
  name: keyof V & string
  label: string
  /**
   * missing：必須の項目が空。incomplete：値はあるが、検証が成功していない（エラーはまだ表示していない）。
   * invalid：エラーを表示している。checking：非同期の検証の結果を待っている
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
  async: Readonly<Partial<Record<keyof V, AsyncEntry>>>
  server: Readonly<Partial<Record<keyof V, ServerError>>>
  formError: string | null
  status: FormStatus
  /** 送信中の値（送信した時点で確定する） */
  submitted: V | null
}

const emptyState = <V extends FormValues>(values: V): State<V> => ({
  values,
  baseline: values,
  interacted: new Set(),
  shown: new Set(),
  composing: new Set(),
  edits: {} as State<V>["edits"],
  async: {} as State<V>["async"],
  server: {} as State<V>["server"],
  formError: null,
  status: "idle",
  submitted: null,
})

function defaultIsEmpty(value: unknown) {
  if (value === null || value === undefined || value === false) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** 構造の比較のためのキー。配列は順序を含めて比べる。順序に意味がない場合は normalize で並べる */
export function stableKey(value: unknown): string {
  if (value === undefined) return "u"
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

export function useFormState<V extends FormValues>({
  initialValues,
  fields,
  asyncDebounceMs = 400,
}: {
  /** 最後に保存した値（基準値）。登録は初期値、編集は読み込んだ値。変えるときは reset を呼ぶ */
  initialValues: V
  fields: FormFields<V>
  /** 非同期の検証を始めるまでの、入力が止まってからの時間（ms） */
  asyncDebounceMs?: number
}) {
  const [state, setState] = React.useState<State<V>>(() => emptyState(initialValues))
  const stateRef = React.useRef(state)
  stateRef.current = state
  const fieldsRef = React.useRef(fields)
  fieldsRef.current = fields
  const names = React.useMemo(() => Object.keys(fields) as (keyof V & string)[], [fields])

  const update = React.useCallback((fn: (s: State<V>) => State<V>) => {
    setState((s) => {
      const next = fn(s)
      stateRef.current = next
      return next
    })
  }, [])

  // ---------------------------------------------------------------- 計算（描画のたびに現在の値から）
  const normalizeOf = React.useCallback(
    (name: keyof V, value: unknown) => {
      const n = fieldsRef.current[name]?.normalize as ((v: unknown) => unknown) | undefined
      return stableKey(n ? n(value) : value)
    },
    []
  )

  const evaluate = React.useCallback(
    (s: State<V>) => {
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
      const asyncKey = (name: keyof V) =>
        f[name].validateAsync && active(name) && !empty(name) && syncError(name) === null ? normalizeOf(name, s.values[name]) : null
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

  const ev = evaluate(state)

  const blockers: FormBlocker<V>[] = []
  for (const name of names) {
    if (!ev.active(name)) continue
    const label = fields[name].label
    const error = ev.currentError(name)
    if (error) {
      const kind: FormBlockerKind =
        ev.empty(name) && ev.required(name) ? "missing" : state.shown.has(name) || ev.serverError(name) ? "invalid" : "incomplete"
      blockers.push({ name, label, kind, message: kind === "invalid" ? error : null })
      continue
    }
    const entry = ev.asyncEntry(name)
    if (entry && (entry.status === "pending" || entry.status === "validating")) blockers.push({ name, label, kind: "checking", message: null })
  }

  const composing = state.composing.size > 0
  const submitting = state.status === "submitting"
  // 保存されたかわからない（unknown）間は、もう一度保存しない。製品が状態を確かめ、clearFormError か markSaved を呼ぶまで止める
  const unknownResult = state.status === "unknown"
  const canSubmit = !submitting && !composing && !unknownResult && blockers.length === 0

  const dirtyFields = names.filter(
    (name) => ev.active(name) && normalizeOf(name, state.values[name]) !== normalizeOf(name, state.baseline[name])
  )
  const isDirty = dirtyFields.length > 0

  // ---------------------------------------------------------------- 非同期の検証
  // 項目ごとに、検証する値のキーが変わったときだけ始める。前の値の検証は取り消し、応答はキーで照合する。
  const timers = React.useRef(new Map<keyof V, { key: string; timer: number; controller?: AbortController }>())
  const asyncKeys = names.map((name) => [name, state.composing.has(name) ? null : ev.asyncKey(name)] as const)
  const asyncSignature = JSON.stringify(asyncKeys)
  React.useEffect(() => {
    const running = timers.current
    for (const [name, key] of asyncKeys) {
      const current = running.get(name)
      if (current && current.key === key) continue
      if (current) {
        window.clearTimeout(current.timer)
        current.controller?.abort()
        running.delete(name)
      }
      if (key === null) continue
      const settled = stateRef.current.async[name]
      if (settled && settled.key === key && settled.status !== "pending" && settled.status !== "validating") continue
      const job: { key: string; timer: number; controller?: AbortController } = { key, timer: 0 }
      job.timer = window.setTimeout(() => {
        const controller = new AbortController()
        job.controller = controller
        const s = stateRef.current
        update((prev) => ({ ...prev, async: { ...prev.async, [name]: { key, status: "validating", message: null } } }))
        const validator = fieldsRef.current[name].validateAsync as
          | ((v: unknown, all: V, c: { signal: AbortSignal }) => Promise<string | null>)
          | undefined
        if (!validator) return
        validator(s.values[name], s.values, { signal: controller.signal }).then(
          (message) => {
            if (controller.signal.aborted) return
            running.delete(name)
            update((prev) =>
              normalizeOf(name, prev.values[name]) !== key
                ? prev
                : { ...prev, async: { ...prev.async, [name]: { key, status: message ? "invalid" : "valid", message } } }
            )
          },
          () => {
            if (controller.signal.aborted) return
            running.delete(name)
            update((prev) =>
              normalizeOf(name, prev.values[name]) !== key
                ? prev
                : { ...prev, async: { ...prev.async, [name]: { key, status: "unverified", message: null } } }
            )
          }
        )
      }, asyncDebounceMs)
      running.set(name, job)
    }
    // asyncKeys は asyncSignature で表す（毎回の描画で新しい配列になるため）
  }, [asyncSignature, asyncDebounceMs, update, normalizeOf])
  React.useEffect(
    () => () => {
      for (const job of timers.current.values()) {
        window.clearTimeout(job.timer)
        job.controller?.abort()
      }
      timers.current.clear()
    },
    []
  )

  // ---------------------------------------------------------------- 操作
  const setValue = React.useCallback(
    <K extends keyof V>(name: K, value: V[K], options: { composing?: boolean; commit?: boolean } = {}) => {
      update((s) => ({
        ...s,
        values: { ...s.values, [name]: value },
        interacted: add(s.interacted, name),
        edits: { ...s.edits, [name]: (s.edits[name] ?? 0) + 1 },
        composing: options.composing ? add(s.composing, name) : remove(s.composing, name),
        // 選択式の項目（Select、Checkbox、日付の選択）は、選んだ時点で入力を終えたとみなす
        shown: options.commit ? add(s.shown, name) : s.shown,
        status: s.status === "submitting" ? s.status : s.status === "succeeded" ? "idle" : s.status,
      }))
    },
    [update]
  )

  /** 入力を終えた（フォーカスが外れた）。値を変えた項目だけ、エラーを表示する */
  const blur = React.useCallback(
    (name: keyof V) => {
      update((s) => (s.interacted.has(name) && !s.composing.has(name) ? { ...s, shown: add(s.shown, name) } : s))
    },
    [update]
  )

  const compositionStart = React.useCallback(
    (name: keyof V) => update((s) => ({ ...s, composing: add(s.composing, name) })),
    [update]
  )

  /** 指定した項目のエラーを表示する（複数のステップの、表示中のステップだけ、など） */
  const reveal = React.useCallback(
    (fieldNames: (keyof V)[]) => update((s) => ({ ...s, shown: add(s.shown, ...fieldNames) })),
    [update]
  )

  /** すべての項目のエラーを表示する（保存を試みたとき） */
  const revealAll = React.useCallback(() => reveal(Object.keys(fieldsRef.current) as (keyof V)[]), [reveal])

  /** 値と基準値を置き換え、操作の履歴、エラー、保存の状態を消す（別のレコードを開いた、連続して登録する） */
  const reset = React.useCallback(
    (values?: V) => {
      for (const job of timers.current.values()) {
        window.clearTimeout(job.timer)
        job.controller?.abort()
      }
      timers.current.clear()
      update((s) => emptyState(values ?? s.baseline))
    },
    [update]
  )

  /** 値を最後に保存した値（基準値）に戻す。未保存の変更の破棄に使う */
  const discard = React.useCallback(() => {
    update((s) => emptyState(s.baseline))
  }, [update])

  /**
   * 自動補完を始める時点の、利用者の編集の回数を記録する。応答が届いたら applyAutofill に渡す。
   * その間に利用者が変えた項目は、応答で上書きしない。
   */
  const captureEdits = React.useCallback((fieldNames: (keyof V)[]) => {
    const s = stateRef.current
    return Object.fromEntries(fieldNames.map((n) => [n, s.edits[n] ?? 0])) as Partial<Record<keyof V, number>>
  }, [])

  const applyAutofill = React.useCallback(
    (token: Partial<Record<keyof V, number>>, patch: Partial<V>) => {
      // 入れる項目は、最新の状態で同期に決める（更新の関数は副作用を持たない）
      const current = stateRef.current
      const applied = (Object.keys(patch) as (keyof V)[]).filter((key) => (current.edits[key] ?? 0) === (token[key] ?? 0))
      if (!applied.length) return applied
      update((s) => {
        const values = { ...s.values }
        const keys = applied.filter((key) => (s.edits[key] ?? 0) === (token[key] ?? 0))
        for (const key of keys) values[key] = patch[key] as V[keyof V]
        // 自動で入れた値は入力を終えた値として扱い、問題があればすぐに示す。編集の回数は増やさない
        return keys.length ? { ...s, values, shown: add(s.shown, ...keys) } : s
      })
      return applied
    },
    [update]
  )

  /** 送信する値。表示していない（active が false の）項目は含めない */
  const getSubmitValues = React.useCallback((): Partial<V> => {
    const s = stateRef.current
    const e = evaluate(s)
    const out: Partial<V> = {}
    for (const name of Object.keys(fieldsRef.current) as (keyof V)[]) if (e.active(name)) out[name] = s.values[name]
    return out
  }, [evaluate])

  /** 最新の状態で、保存の可否を確かめる（送信の処理の中で使う。描画の前の値で判断しない） */
  const check = React.useCallback(() => {
    const s = stateRef.current
    const e = evaluate(s)
    const f = Object.keys(fieldsRef.current) as (keyof V)[]
    const blocked = f.some((name) => {
      if (!e.active(name)) return false
      if (e.currentError(name)) return true
      const entry = e.asyncEntry(name)
      return Boolean(entry && (entry.status === "pending" || entry.status === "validating"))
    })
    return {
      ok: s.status !== "submitting" && s.status !== "unknown" && s.composing.size === 0 && !blocked,
      composing: s.composing.size > 0,
      submitting: s.status === "submitting",
      unknown: s.status === "unknown",
    }
  }, [evaluate])

  const submittingRef = React.useRef(false)
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * 送信の処理を作る。form の onSubmit に渡すか、ボタンから呼ぶ。
   * - 保存できない状態（未入力、エラー、確認中、変換中）、保存中の場合は、保存の処理を呼ばない。
   *   変換中と保存中は何もしない。それ以外はすべての項目のエラーを表示し、onBlocked を呼ぶ（最初の項目へのフォーカスなど）。
   * - 送信した時点の値を確定し、保存の処理に渡す。保存中に入力した値は、保存した値として扱わない。
   * 返す Promise は、保存できた場合だけ true になる（「保存して移動」などで使う）。
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
        const result = check()
        if (submittingRef.current || result.submitting || result.composing || result.unknown) return false
        if (!result.ok) {
          revealAll()
          // エラーの表示を反映した後の blockers を渡す
          const s = stateRef.current
          const e = evaluate(s)
          const list: FormBlocker<V>[] = (Object.keys(fieldsRef.current) as (keyof V & string)[]).flatMap((name) => {
            if (!e.active(name)) return []
            const error = e.currentError(name)
            const label = fieldsRef.current[name].label
            if (error) return [{ name, label, kind: e.empty(name) && e.required(name) ? "missing" : "invalid", message: error } as FormBlocker<V>]
            const entry = e.asyncEntry(name)
            return entry && (entry.status === "pending" || entry.status === "validating") ? [{ name, label, kind: "checking", message: null } as FormBlocker<V>] : []
          })
          options.onBlocked?.(list)
          return false
        }
        submittingRef.current = true
        const snapshot = stateRef.current.values
        const submitValues = getSubmitValues()
        update((s) => ({ ...s, status: "submitting", submitted: snapshot, formError: null, server: {} as State<V>["server"] }))
        let outcome: FormSaveResult<V>
        try {
          outcome = await save(submitValues, { values: snapshot })
        } catch {
          outcome = { status: "failed", formError: "保存できませんでした。入力した内容は残っています。時間をおいて、もう一度保存してください。" }
        }
        submittingRef.current = false
        if (!mounted.current) return outcome.status === "success"
        if (outcome.status === "success") {
          const savedValues = { ...snapshot, ...(outcome.values ?? {}) } as V
          const latest = stateRef.current.values
          const changedWhileSaving = (Object.keys(fieldsRef.current) as (keyof V)[]).some(
            (key) => normalizeOf(key, latest[key]) !== normalizeOf(key, snapshot[key])
          )
          update((s) => {
            // 保存中に変えていない項目だけ、サーバーが保存した値（正規化した値）にそろえる
            const values = { ...s.values }
            for (const key of Object.keys(savedValues) as (keyof V)[]) {
              if (normalizeOf(key, s.values[key]) === normalizeOf(key, snapshot[key])) values[key] = savedValues[key]
            }
            return { ...s, values, baseline: savedValues, status: "succeeded", submitted: null, formError: null }
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
          update((s) => ({
            ...s,
            status: "failed",
            submitted: null,
            server,
            shown: add(s.shown, ...(Object.keys(server) as (keyof V)[])),
            formError: outcome.formError ?? null,
          }))
          return false
        }
        // 結果が不明な場合は、送信した値を残す（製品が、保存されたかを送信した値で確かめる）
        update((s) => ({ ...s, status: outcome.status, submitted: outcome.status === "unknown" ? snapshot : null, formError: outcome.formError }))
        return false
      },
    [check, evaluate, getSubmitValues, normalizeOf, revealAll, update]
  )

  /** 製品が別の経路で保存した値を、基準値にする（下書きの再開、保存されていたことを確かめた場合など） */
  const markSaved = React.useCallback(
    (values: V) =>
      update((s) => ({
        ...s,
        baseline: values,
        status: s.status === "unknown" ? "succeeded" : s.status,
        submitted: s.status === "unknown" ? null : s.submitted,
        formError: s.status === "unknown" ? null : s.formError,
      })),
    [update]
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
    error,
    /** 表示する項目か（active） */
    isActive: (name: keyof V) => ev.active(name),
    isRequired: (name: keyof V) => ev.active(name) && ev.required(name),
    /** 値を変えた項目か（操作の履歴） */
    isInteracted: (name: keyof V) => state.interacted.has(name),
    asyncStatus: (name: keyof V): AsyncCheckStatus => ev.asyncEntry(name)?.status ?? "idle",
    setValue,
    blur,
    compositionStart,
    reveal,
    revealAll,
    reset,
    discard,
    markSaved,
    captureEdits,
    applyAutofill,
    getSubmitValues,
    handleSubmit,
    inputProps,
    /** フォーム全体のエラーを消す（利用者が閉じたとき） */
    clearFormError: () =>
      update((s) => (s.status === "submitting" ? { ...s, formError: null } : { ...s, formError: null, status: "idle", submitted: null })),
  }
}

export type FormState<V extends FormValues> = ReturnType<typeof useFormState<V>>

/**
 * 1 行の入力欄での Enter を、送信の処理（handleSubmit の戻り値）に渡す。form の onKeyDown に指定する。
 * 保存ボタンを focusableWhenDisabled で無効にしている間、ブラウザの暗黙の送信（Enter）は Base UI がボタンへのクリックを
 * 止めるため submit にならない。この関数で送信の処理を呼び、保存できない場合はエラーの表示と最初の項目へのフォーカスを行う。
 * 変換中（IME）の Enter、Textarea、ボタンなどの Enter は対象にしない。
 */
export function submitOnEnter(event: React.KeyboardEvent<HTMLFormElement>, submit: () => unknown) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  if (["button", "submit", "reset", "checkbox", "radio", "file", "image", "hidden"].includes(target.type)) return
  event.preventDefault()
  void submit()
}
