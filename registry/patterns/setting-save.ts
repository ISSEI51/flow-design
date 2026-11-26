"use client"

import * as React from "react"

import { useScopeGuard, type ScopeTicket } from "./scope-guard"

// Flow Design Setting Save（Patterns / System & Account / Settings）
// 設定の保存の状態を、実際の保存の単位ごとに持つ hook。定義は docs/web/patterns/settings.md を参照。
// - useInstantSettings：独立した低リスクの設定を、変更した時点で項目ごとに保存する（即時保存）。
// - useSettingsForm：依存し合う項目や影響の大きい設定を、保存の操作でまとめて保存する（明示的な保存）。1 つのフォームに 1 つ使う。
// 結果の反映は useScopeGuard（scope-guard.ts）で、開始したときのスコープと最新の要求にだけ行う。
//
// この部品が守ること
// - 保存の成功、保存中、確定した失敗、結果の不明、権限不足を区別する（1 つの boolean や error にまとめない）。
// - 即時保存の確定した失敗と権限不足では、表示を、最後に確認できたサーバーの値へ戻す。
// - 結果が不明な場合は、表示を戻さない（サーバーの状態まで戻ったと判断しない）。verify で確かめる。
// - 明示的な保存の失敗では、入力した内容を残す。保存の間に変えた項目も、保存の結果で上書きしない。
// - 同じ項目の連続した変更では、最後の変更の応答だけを表示に反映する。古い要求の応答で、新しい値を上書きしない。
//   古い要求の成功は、最後に確認できたサーバーの値（saved）にだけ反映する（新しい要求が失敗したときに戻す先にする）。
// - スコープ（アカウント、ワークスペース、権限）の変更とアンマウントの後に届いた応答を反映しない。A → B → A でも同じ。
//   AbortSignal に従わない保存の処理でも同じ。
// - 1 つのフォームの保存は、ほかのフォームと即時保存の項目の状態を変えない（フォームごとに別の hook を使う）。
// - 複数の項目をまとめて保存する場合（changeMany）も、保存中に利用者が変えた項目には、その応答を反映しない。
// - 結果が不明な明示的な保存は、確認するまで入力の破棄（discard）を受け付けない。
//
// save に渡す signal は、クライアントの待機の中止（スコープの変更、アンマウント）を伝えるだけである。
// 変更の要求そのものには渡さないことを推奨する（中止しても、サーバーでは処理される場合があるため。
// 渡すと、画面を移っただけで変更が取り消される場合と、されない場合が生じる）。verify（取得）には渡してよい。
//
// この部品が持たないもの（製品の責務）
// - 保存の処理（API）、サーバーでの要求の順序の保証（版の番号、If-Match など）、冪等性、入力の検証。
// - 権限の変更の検知と再取得（onSettled で権限不足を受け取り、製品が権限を取り直す）。
// - 画面の移動の前の未保存の変更の確認（dirty を使って製品が行う）。

/** 保存の失敗の分類。aborted は中止（表示に反映しない） */
type SaveErrorKind = "failed" | "unknown" | "forbidden" | "aborted"

type SettingSaveState =
  | { state: "idle" }
  | { state: "saving" }
  /** 結果が不明な保存を確かめている */
  | { state: "verifying" }
  | { state: "saved" }
  /** 処理されなかったことが確かな失敗。即時保存では、表示をサーバーの値へ戻した */
  | { state: "failed"; message: string }
  /** 応答が届かず、保存されたかがわからない */
  | { state: "unknown"; message: string }
  /** 変更する権限がない（権限が変わった可能性がある） */
  | { state: "forbidden"; message: string }

type SaveContext = { signal: AbortSignal }

type SaveMessages = {
  instantFailed: string
  formFailed: string
  unknown: string
  forbidden: string
  /** 確かめた結果、保存されていなかった */
  notSaved: string
  formNotSaved: string
}

const defaultMessages: SaveMessages = {
  instantFailed: "保存できなかったため、元の設定に戻しました。",
  formFailed: "保存できませんでした。入力した内容は残っています。もう一度保存してください。",
  unknown: "保存できたかを確認できませんでした。",
  forbidden: "変更する権限がないため、保存できませんでした。",
  notSaved: "保存されていませんでした。現在保存されている設定を表示しています。",
  formNotSaved: "保存されていませんでした。入力した内容は残っています。",
}

/**
 * 既定の分類。AbortError は aborted、outcome が "unknown" のものは結果の不明、
 * code が "forbidden" か status が 403 のものは権限不足、それ以外は確定した失敗。
 * 通信のライブラリに合わせて、製品が classify を渡す。
 */
function classifySaveError(error: unknown): SaveErrorKind {
  const e = error as { name?: unknown; outcome?: unknown; code?: unknown; status?: unknown } | null
  if (e && typeof e === "object") {
    // DOMException は環境によって Error の継承にならないため、name で判断する
    if (e.name === "AbortError") return "aborted"
    if (e.outcome === "unknown") return "unknown"
    if (e.code === "forbidden" || e.status === 403) return "forbidden"
  }
  return "failed"
}

type Values = Record<string, unknown>

/** changeMany の結果 */
type SettleOutcome = "saved" | "superseded" | "failed" | "unknown" | "forbidden" | "aborted"

type InstantState<V extends Values> = {
  scope: string | undefined
  /** 表示する値。保存中は利用者が選んだ値 */
  values: V
  /** 最後に確認できたサーバーの値 */
  saved: V
  status: { [K in keyof V]?: SettingSaveState }
  /** 結果が不明な項目の、利用者が選んだ値 */
  intended: Partial<V>
}

type InstantSettingsOptions<V extends Values> = {
  /** サーバーに保存されている値（取得した値）。スコープが変わったときの初期値になる */
  values: V
  /** アカウント、ワークスペース、権限など。変わったら、保存中の応答を反映せず、values から始め直す */
  scopeKey?: string
  /** 1 つの項目の保存。保存されたサーバーの値を返す */
  save: <K extends keyof V & string>(key: K, value: V[K], context: SaveContext) => Promise<V[K]>
  /** 結果が不明な項目の、現在のサーバーの値を取得する */
  verify?: <K extends keyof V & string>(key: K, context: SaveContext) => Promise<V[K]>
  classify?: (error: unknown) => SaveErrorKind
  messages?: Partial<SaveMessages>
  equals?: (a: unknown, b: unknown) => boolean
  /** 最新の要求の結果（権限不足を受け取り、製品が権限を取り直すなど）。古い要求と別のスコープの結果では呼ばない */
  onSettled?: (key: keyof V & string, status: SettingSaveState) => void
}

function useInstantSettings<V extends Values>({
  values: initial,
  scopeKey,
  save,
  verify,
  classify = classifySaveError,
  messages: messagesProp,
  equals = Object.is,
  onSettled,
}: InstantSettingsOptions<V>) {
  const guard = useScopeGuard(scopeKey)
  const fresh = (): InstantState<V> => ({ scope: scopeKey, values: initial, saved: initial, status: {}, intended: {} })
  const [state, setState] = React.useState<InstantState<V>>(fresh)
  // スコープが変わったら、同じ描画から新しいスコープの値を返す（前のスコープの値と状態を 1 回も返さない）。
  const current = state.scope === scopeKey ? state : fresh()
  if (state.scope !== scopeKey) setState(current)

  const latest = React.useRef({ save, verify, classify, onSettled, equals, messages: { ...defaultMessages, ...messagesProp } })
  latest.current = { save, verify, classify, onSettled, equals, messages: { ...defaultMessages, ...messagesProp } }

  const update = React.useCallback((patch: (s: InstantState<V>) => Partial<InstantState<V>>) => setState((s) => ({ ...s, ...patch(s) })), [])

  /**
   * 1 つ以上の項目を 1 つの要求で保存する。項目ごとに要求の番号を進め、結果を項目ごとに反映する。
   * 保存中に利用者が同じ項目を変えた場合、その項目にはこの要求の結果を反映しない（新しい変更が最新）。
   */
  const run = React.useCallback(
    (values: Partial<V>, request: (context: SaveContext) => Promise<Partial<V>>): Promise<SettleOutcome> => {
      const keys = Object.keys(values) as (keyof V & string)[]
      const tickets = new Map(keys.map((k) => [k, guard.begin(k)] as const))
      const { classify, messages } = latest.current
      update((s) => {
        const intended = { ...s.intended }
        const status = { ...s.status }
        for (const k of keys) {
          delete intended[k]
          status[k] = { state: "saving" }
        }
        return { values: { ...s.values, ...values }, status, intended }
      })
      // 中止の signal は、スコープの変更とアンマウントで中止する（待機の中止。サーバーでの取り消しではない）
      const signal = tickets.get(keys[0])!.signal
      return request({ signal }).then(
        (result) => {
          const sameScope = keys.some((k) => guard.isSameScope(tickets.get(k)!))
          if (!sameScope) return "aborted" as const
          const latestKeys = keys.filter((k) => guard.isLatest(tickets.get(k)!))
          const olderKeys = keys.filter((k) => !latestKeys.includes(k))
          update((s) => {
            const next = { values: { ...s.values }, saved: { ...s.saved }, status: { ...s.status } }
            for (const k of latestKeys) {
              next.values[k] = result[k] as V[typeof k]
              next.saved[k] = result[k] as V[typeof k]
              next.status[k] = { state: "saved" }
            }
            // 古い要求の成功。最新の要求が保存中なら、戻す先（サーバーの値）だけを更新する。
            // 最新の要求が確定した失敗でサーバーの値へ戻した後なら、表示も更新する（サーバーには古い要求の値がある）。
            // 最新の要求が成功した後、結果が不明な間は、何も変えない（最新の結果か、確認の結果を正とする）。
            for (const k of olderKeys) {
              const st = s.status[k]?.state
              if (st === "saving") next.saved[k] = result[k] as V[typeof k]
              else if (st === "failed" || st === "forbidden") {
                next.saved[k] = result[k] as V[typeof k]
                next.values[k] = result[k] as V[typeof k]
              }
            }
            return next
          })
          for (const k of latestKeys) latest.current.onSettled?.(k, { state: "saved" })
          return latestKeys.length === keys.length ? ("saved" as const) : ("superseded" as const)
        },
        (error) => {
          const kind = classify(error)
          if (kind === "aborted") return "aborted" as const
          const latestKeys = keys.filter((k) => guard.isLatest(tickets.get(k)!))
          if (latestKeys.length === 0) return "superseded" as const
          const status: SettingSaveState =
            kind === "unknown"
              ? { state: "unknown", message: messages.unknown }
              : kind === "forbidden"
                ? { state: "forbidden", message: messages.forbidden }
                : { state: "failed", message: messages.instantFailed }
          update((s) => {
            const next = { values: { ...s.values }, status: { ...s.status }, intended: { ...s.intended } }
            for (const k of latestKeys) {
              next.status[k] = status
              // 結果が不明な場合は戻さない。確定した失敗と権限不足は、最後に確認できたサーバーの値へ戻す
              if (kind === "unknown") next.intended[k] = values[k]
              else next.values[k] = s.saved[k]
            }
            return next
          })
          for (const k of latestKeys) latest.current.onSettled?.(k, status)
          return kind
        }
      )
    },
    [guard, update]
  )

  const change = React.useCallback(
    <K extends keyof V & string>(key: K, value: V[K]) => {
      const { save } = latest.current
      void run({ [key]: value } as unknown as Partial<V>, (context) => save(key, value, context).then((r) => ({ [key]: r }) as unknown as Partial<V>))
    },
    [run]
  )

  /**
   * 複数の項目を 1 つの要求で保存する（標準の設定へ戻すなど）。項目ごとの状態は change と同じ規則で反映する。
   * 結果：saved（すべて反映）、superseded（保存中に利用者が変えた項目があり、その項目は反映しない）、
   * failed、unknown、forbidden、aborted（スコープの変更、アンマウント）
   */
  const changeMany = React.useCallback(
    (values: Partial<V>, request: (values: Partial<V>, context: SaveContext) => Promise<Partial<V>>) =>
      run(values, (context) => request(values, context)),
    [run]
  )

  const verifyKey = React.useCallback(
    <K extends keyof V & string>(key: K) => {
      const fetcher = latest.current.verify
      if (!fetcher) return
      const ticket = guard.begin(key)
      update((s) => ({ status: { ...s.status, [key]: { state: "verifying" } } }))
      fetcher(key, { signal: ticket.signal }).then(
        (serverValue) => {
          if (!guard.isLatest(ticket)) return
          update((s) => {
            const savedAsIntended = key in s.intended ? latest.current.equals(serverValue, s.intended[key]) : true
            const intended = { ...s.intended }
            delete intended[key]
            return {
              values: { ...s.values, [key]: serverValue },
              saved: { ...s.saved, [key]: serverValue },
              intended,
              status: {
                ...s.status,
                [key]: savedAsIntended ? { state: "saved" } : { state: "failed", message: latest.current.messages.notSaved },
              },
            }
          })
        },
        (error) => {
          if (latest.current.classify(error) === "aborted" || !guard.isLatest(ticket)) return
          update((s) => ({ status: { ...s.status, [key]: { state: "unknown", message: latest.current.messages.unknown } } }))
        }
      )
    },
    [guard, update]
  )

  /**
   * 別の経路（再取得など）で確定したサーバーの値を反映する。
   * 反映する項目の保存中の要求は古くなり、後から届いた応答は表示を上書きしない。
   */
  const replace = React.useCallback(
    (next: Partial<V>) => {
      for (const key of Object.keys(next)) guard.begin(key)
      setState((s) => {
        const status = { ...s.status }
        const intended = { ...s.intended }
        for (const key of Object.keys(next)) {
          delete status[key as keyof V]
          delete intended[key as keyof V]
        }
        return { ...s, values: { ...s.values, ...next }, saved: { ...s.saved, ...next }, status, intended }
      })
    },
    [guard]
  )

  const statusOf = (key: keyof V & string): SettingSaveState => current.status[key] ?? { state: "idle" }
  const pending = Object.values(current.status).some((s) => s?.state === "saving" || s?.state === "verifying")
  return { values: current.values, saved: current.saved, status: current.status, statusOf, change, changeMany, verify: verifyKey, replace, pending }
}

type FormState<V extends Values> = {
  scope: string | undefined
  values: V
  saved: V
  status: SettingSaveState
  /** 保存を始めたときの値（結果が不明な保存の確認に使う） */
  submitted: V | null
}

type SettingsFormOptions<V extends Values> = {
  /** サーバーに保存されている値。スコープが変わったときの初期値になる */
  values: V
  scopeKey?: string
  /** フォーム全体の保存。保存されたサーバーの値を返す */
  save: (values: V, context: SaveContext) => Promise<V>
  /** 結果が不明な保存のあとに、現在のサーバーの値を取得する */
  verify?: (context: SaveContext) => Promise<V>
  classify?: (error: unknown) => SaveErrorKind
  messages?: Partial<SaveMessages>
  equals?: (a: unknown, b: unknown) => boolean
  onSettled?: (status: SettingSaveState) => void
}

function useSettingsForm<V extends Values>({
  values: initial,
  scopeKey,
  save,
  verify,
  classify = classifySaveError,
  messages: messagesProp,
  equals = Object.is,
  onSettled,
}: SettingsFormOptions<V>) {
  const guard = useScopeGuard(scopeKey)
  const fresh = (): FormState<V> => ({ scope: scopeKey, values: initial, saved: initial, status: { state: "idle" }, submitted: null })
  const [state, setState] = React.useState<FormState<V>>(fresh)
  // 保存中の要求。二重の保存を、描画を待たずに防ぐ。スコープが変わったら、前のスコープの要求を待たない
  const busy = React.useRef<ScopeTicket | null>(null)
  const current = state.scope === scopeKey ? state : fresh()
  if (state.scope !== scopeKey) {
    busy.current = null
    setState(current)
  }
  const currentRef = React.useRef(current)
  currentRef.current = current

  const latest = React.useRef({ save, verify, classify, onSettled, equals, messages: { ...defaultMessages, ...messagesProp } })
  latest.current = { save, verify, classify, onSettled, equals, messages: { ...defaultMessages, ...messagesProp } }

  const dirtyKeys = (Object.keys(current.values) as (keyof V & string)[]).filter((k) => !equals(current.values[k], current.saved[k]))

  /** 保存の結果を反映する。保存を始めた後に変えた項目は、入力した値を残す */
  const settle = (s: FormState<V>, snapshot: V, result: V): Partial<FormState<V>> => {
    const values = { ...result }
    for (const k of Object.keys(s.values) as (keyof V)[]) {
      if (!latest.current.equals(s.values[k], snapshot[k])) values[k] = s.values[k]
    }
    return { values, saved: result, submitted: null }
  }

  const setValue = React.useCallback(<K extends keyof V & string>(key: K, value: V[K]) => {
    setState((s) => ({
      ...s,
      values: { ...s.values, [key]: value },
      // 保存の結果の表示（保存しました、失敗）は、次の変更で未保存の表示に戻す。保存中と確認中は残す
      status: s.status.state === "saving" || s.status.state === "verifying" ? s.status : { state: "idle" },
    }))
  }, [])

  /** フォームを保存する。values を渡すと、その値を保存する（標準の設定へ戻すなど） */
  const submit = React.useCallback(
    (override?: V) => {
      if (busy.current) return
      const values = override ?? currentRef.current.values
      const ticket = guard.begin("submit")
      busy.current = ticket
      const release = () => {
        if (busy.current === ticket) busy.current = null
      }
      setState((s) => ({ ...s, values, status: { state: "saving" }, submitted: values }))
      const { save, classify, messages } = latest.current
      save(values, { signal: ticket.signal }).then(
        (result) => {
          release()
          if (!guard.isLatest(ticket)) return
          const status: SettingSaveState = { state: "saved" }
          setState((s) => ({ ...s, ...settle(s, values, result), status }))
          latest.current.onSettled?.(status)
        },
        (error) => {
          release()
          const kind = classify(error)
          if (kind === "aborted" || !guard.isLatest(ticket)) return
          const status: SettingSaveState =
            kind === "unknown"
              ? { state: "unknown", message: messages.unknown }
              : kind === "forbidden"
                ? { state: "forbidden", message: messages.forbidden }
                : { state: "failed", message: messages.formFailed }
          setState((s) => ({ ...s, status, submitted: kind === "unknown" ? values : null }))
          latest.current.onSettled?.(status)
        }
      )
    },
    [guard]
  )

  /** 結果が不明な保存のあとに、サーバーの値を確かめる */
  const verifyForm = React.useCallback(() => {
    const fetcher = latest.current.verify
    if (!fetcher || busy.current) return
    const ticket = guard.begin("submit")
    busy.current = ticket
    const release = () => {
      if (busy.current === ticket) busy.current = null
    }
    setState((s) => ({ ...s, status: { state: "verifying" } }))
    fetcher({ signal: ticket.signal }).then(
      (serverValues) => {
        release()
        if (!guard.isLatest(ticket)) return
        setState((s) => {
          const snapshot = s.submitted
          const savedAsSubmitted =
            snapshot !== null && (Object.keys(snapshot) as (keyof V)[]).every((k) => latest.current.equals(serverValues[k], snapshot[k]))
          if (snapshot && savedAsSubmitted) return { ...s, ...settle(s, snapshot, serverValues), status: { state: "saved" } }
          // 保存されていなかった：入力した内容を残し、戻す先だけをサーバーの値にする
          return { ...s, saved: serverValues, submitted: null, status: { state: "failed", message: latest.current.messages.formNotSaved } }
        })
      },
      (error) => {
        release()
        if (latest.current.classify(error) === "aborted" || !guard.isLatest(ticket)) return
        setState((s) => ({ ...s, status: { state: "unknown", message: latest.current.messages.unknown } }))
      }
    )
  }, [guard])

  /**
   * 入力した内容を破棄し、最後に確認できたサーバーの値に戻す。
   * 保存中、確認中、結果が不明な間は何もしない（サーバーに保存された可能性がある値を、戻ったものとして扱わない）
   */
  const discard = React.useCallback(() => {
    setState((s) =>
      s.status.state === "saving" || s.status.state === "verifying" || s.status.state === "unknown" ? s : { ...s, values: s.saved, status: { state: "idle" } }
    )
  }, [])

  const saving = current.status.state === "saving" || current.status.state === "verifying"
  /** 入力を破棄できるか（保存中、確認中、結果が不明な間はできない） */
  const canDiscard = dirtyKeys.length > 0 && !saving && current.status.state !== "unknown"
  return {
    canDiscard,
    values: current.values,
    saved: current.saved,
    status: current.status,
    dirty: dirtyKeys.length > 0,
    dirtyKeys,
    saving,
    setValue,
    submit,
    verify: verifyForm,
    discard,
  }
}

export { classifySaveError, defaultMessages as settingSaveMessages, useInstantSettings, useSettingsForm }
export type { InstantSettingsOptions, SettleOutcome, SaveContext, SaveErrorKind, SaveMessages, SettingSaveState, SettingsFormOptions }
