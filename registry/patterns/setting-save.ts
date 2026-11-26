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
// - 保存の成功、保存中、確定した失敗、バリデーションによる拒否、権限不足、競合（版の不一致）、結果の不明を区別する。
//   クライアントが応答を待つのを中止した場合（AbortError）は、保存されなかったと判断せず、結果の不明として扱う。
//   スコープの変更とアンマウントの後に届いた結果（古い処理結果）は、どの状態にも反映しない。
// - 分類できない例外（通信の例外など）は、結果の不明とする（確定した失敗にしない）。
// - 結果が不明な項目は、確認するまで同じ項目の保存を送らない（whileUnknown が "block" の場合。既定）。
//   競合の項目は、確認するまで保存を送らない（古い版で送り直しても、また競合になるため）。
// - 即時保存の確定した失敗、バリデーションによる拒否、権限不足では、表示を、最後に確認できたサーバーの値へ戻す。
// - 結果の不明と競合では、表示を戻さない（サーバーの状態まで戻ったと判断しない）。verify で確かめる。
// - 結果が不明か競合になった項目（最新の要求でない要求の結果も含む）は、最後に確認できたサーバーの値を「未確認」として扱う。
//   verify、replace、その項目の保存の成功で確定するまで、(1) 確認できた値と等しいことを理由に保存を省略しない（版の照合）、
//   (2) 確定した失敗で、未確認の値へ戻して「元の設定に戻しました」と示さない（結果の不明として示し、確認させる）。
// - replace の後に届いた、replace の前に送った要求の応答は、最後に確認できた値と版を変えない（replace の値を正とする）。
// - 応答の値（サーバーで正規化された値）を表示に使う。応答に保存した項目の値が含まれない場合は、成功と判断せず、結果の不明にする。
// - 明示的な保存の失敗では、入力した内容を残す。保存の間に変えた項目も、保存の結果で上書きしない。
// - 同じ項目の連続した変更では、最後の変更の応答だけを表示に反映する。古い要求の応答で、新しい値を上書きしない。
//   古い要求の成功は、最後に確認できたサーバーの値（saved）にだけ反映する（新しい要求が失敗したときに戻す先にする）。
//   これは表示の規則であり、サーバーでの適用の順序を保証しない（製品の API の責務。docs の「サーバーでの保存の順序」）。
// - 版の番号（versions）を渡した場合は、項目ごとに保存を直列にし（前の要求の結果を待ってから次を送る）、
//   save の context.ifMatch に、最後に確認できた版を渡す。サーバーが版の不一致を拒否すれば、競合として示す。
// - スコープ（アカウント、ワークスペース、権限）の変更とアンマウントの後に届いた応答を反映しない。A → B → A でも同じ。
//   AbortSignal に従わない保存の処理でも同じ。
// - 1 つのフォームの保存は、ほかのフォームと即時保存の項目の状態を変えない（フォームごとに別の hook を使う）。
// - 複数の項目をまとめて保存する場合（changeMany）も、保存中に利用者が変えた項目には、その応答を反映しない。
//   項目ごとの成功と失敗は PartialSaveResult で返せる（部分的な成功）。返さない場合は、1 つの要求の成功か失敗として扱う。
// - 結果が不明な明示的な保存は、確認するまで、入力の破棄（discard）と、もう一度の保存（submit）を受け付けない。
// - 処理が終わったら、scope-guard の release でキーの記録を消す（長時間の利用で増え続けない）。
// - 前のスコープの描画で返した関数（古い画面や、非同期の処理の後に呼ばれた closure）から change、changeMany、verify、
//   replace、submit を呼んだ場合は、何もしない（現在のスコープの状態を「保存中」にしない。change は false、changeMany は
//   "aborted"、submit は "aborted"、replace は false を返す）。
// - 描画の中で ref を書き換えない（最新の関数と状態の ref、保存中の要求は、commit（layout effect）で更新するか、スコープと
//   組にして照合する。破棄された描画が、表示中のスコープの処理を変えないため）。
//
// save に渡す signal は、クライアントの待機の中止（スコープの変更、アンマウント）を伝えるだけである。
// 変更の要求そのものには渡さないことを推奨する（中止しても、サーバーでは処理される場合があるため。
// 渡すと、画面を移っただけで変更が取り消される場合と、されない場合が生じる）。verify（取得）には渡してよい。
//
// この部品が持たないもの（製品の責務）
// - 保存の処理（API）、サーバーでの要求の順序の保証（直列化、版の番号、If-Match、競合の検出）、冪等性、入力の検証。
// - 権限の変更の検知と再取得（onSettled で権限不足を受け取り、製品が権限を取り直す）。
// - 画面の移動の前の未保存の変更の確認（dirty を使って製品が行う）。

/** 保存の失敗の分類。aborted はクライアントの待機の中止（サーバーでの処理の有無は不明） */
type SaveErrorKind = "failed" | "invalid" | "forbidden" | "conflict" | "unknown" | "aborted"

/**
 * 結果が不明になった理由。no-response：応答がない、aborted：待機を中止した、missing：応答に項目の値がない、
 * unconfirmed：この要求は確定した失敗だが、前の要求の結果が不明なため、サーバーの現在の値がわからない
 */
type UnknownReason = "no-response" | "aborted" | "missing" | "unconfirmed"

type SettingSaveState =
  | { state: "idle" }
  | { state: "saving" }
  /** 結果が不明な保存を確かめている */
  | { state: "verifying" }
  | { state: "saved" }
  /** 処理されなかったことが確かな失敗。即時保存では、表示をサーバーの値へ戻した */
  | { state: "failed"; message: string }
  /** サーバーのバリデーションで拒否された（処理されていない）。即時保存では、表示をサーバーの値へ戻した */
  | { state: "invalid"; message: string }
  /** 変更する権限がない（権限が変わった可能性がある） */
  | { state: "forbidden"; message: string }
  /** 版が一致しないため、サーバーが拒否した（ほかの場所で変更された）。表示は戻さない。verify で確かめる */
  | { state: "conflict"; message: string }
  /**
   * 保存されたかがわからない。reason が unconfirmed の場合、cause にこの要求の確定した失敗の分類を入れる
   * （権限不足を受け取って権限を取り直すなど、製品が分類を使えるようにする）
   */
  | { state: "unknown"; message: string; reason?: UnknownReason; cause?: "failed" | "invalid" | "forbidden" }

/** 版の番号（ETag など） */
type SettingVersion = string | number

type SaveContext = {
  signal: AbortSignal
  /** 版の照合を使う場合の、最後に確認できた版（If-Match に使う）。使わない場合は undefined */
  ifMatch?: SettingVersion
}

type SaveManyContext<V> = { signal: AbortSignal; ifMatch: { [K in keyof V]?: SettingVersion } }

/** 版の番号つきの値。save と verify は、値の代わりにこれを返せる */
class VersionedValue<T> {
  constructor(
    readonly value: T,
    readonly version: SettingVersion
  ) {}
}
const withVersion = <T,>(value: T, version: SettingVersion) => new VersionedValue(value, version)
type MaybeVersioned<T> = T | VersionedValue<T>
const unwrap = <T,>(v: MaybeVersioned<T>): { value: T; version?: SettingVersion } =>
  v instanceof VersionedValue ? { value: v.value, version: v.version } : { value: v }

/**
 * 複数の項目の保存（changeMany）の、項目ごとの結果。saved に含めた項目は保存された、errors に含めた項目は失敗した
 * （errors の値は classify で分類する）。どちらにもない項目は、結果が不明として扱う。
 */
class PartialSaveResult<V> {
  constructor(
    readonly saved: { [K in keyof V]?: MaybeVersioned<V[K]> },
    readonly errors: { [K in keyof V]?: unknown } = {}
  ) {}
}
const partialSaveResult = <V,>(saved: { [K in keyof V]?: MaybeVersioned<V[K]> }, errors: { [K in keyof V]?: unknown } = {}) =>
  new PartialSaveResult<V>(saved, errors)

type SaveMessages = {
  instantFailed: string
  formFailed: string
  instantInvalid: string
  formInvalid: string
  unknown: string
  /** 結果が不明な間、同じ項目を変更できないこと（即時保存。whileUnknown が "block" の場合に unknown に続ける） */
  unknownLocked: string
  /** 結果が不明な間、もう一度保存できないこと（明示的な保存。unknown に続ける） */
  formUnknownLocked: string
  /** クライアントが応答を待つのを中止した */
  aborted: string
  /** 応答に保存した項目の値が含まれていない */
  missing: string
  forbidden: string
  conflict: string
  formConflict: string
  /** 確かめた結果、保存されていなかった */
  notSaved: string
  formNotSaved: string
  /** 即時保存の確定した失敗。ただし前の保存の結果が不明なため、戻す先（サーバーの現在の値）がわからない */
  unconfirmedFailed: string
}

const defaultMessages: SaveMessages = {
  instantFailed: "保存できなかったため、元の設定に戻しました。",
  formFailed: "保存できませんでした。入力した内容は残っています。もう一度保存してください。",
  instantInvalid: "この値は保存できなかったため、元の設定に戻しました。",
  formInvalid: "入力した内容を保存できませんでした。入力した内容は残っています。内容を確かめてください。",
  unknown: "保存できたかを確認できませんでした。",
  unknownLocked: "確認するまで、この設定は変更できません。",
  formUnknownLocked: "確認するまで、もう一度保存できません。",
  aborted: "応答を待つのを中止しました。保存されたかは確認が必要です。",
  missing: "保存の応答にこの設定の値が含まれていなかったため、保存できたかを確認できませんでした。",
  forbidden: "変更する権限がないため、保存できませんでした。",
  conflict: "ほかの場所で変更されていたため、保存しませんでした。確認すると、現在保存されている設定を表示します。",
  formConflict: "ほかの場所で変更されていたため、保存しませんでした。入力した内容は残っています。確認すると、現在保存されている内容を取得します。",
  notSaved: "保存されていませんでした。現在保存されている設定を表示しています。",
  formNotSaved: "保存されていませんでした。入力した内容は残っています。",
  unconfirmedFailed: "保存できませんでした。前の保存の結果を確認できていないため、現在保存されている設定を確認してください。",
}

/**
 * 既定の分類。通信のライブラリに合わせて、製品が classify を渡す。
 * - name が AbortError：aborted（クライアントの待機の中止。サーバーで処理されたかは不明）
 * - name が TimeoutError、outcome が "unknown"、status が 500 以上：unknown
 * - code が "forbidden" か status が 403：forbidden
 * - code が "conflict" か status が 409、412：conflict
 * - code が "invalid"、"validation" か status が 400、422、または fieldErrors を持つ：invalid
 * - outcome が "failed" か status が 400〜499：failed（サーバーが処理せずに応答した）
 * - それ以外（分類できない例外、通信の例外）：unknown（確定した失敗にしない）
 */
function classifySaveError(error: unknown): SaveErrorKind {
  if (!error || typeof error !== "object") return "unknown"
  const e = error as { name?: unknown; outcome?: unknown; code?: unknown; status?: unknown; fieldErrors?: unknown }
  // DOMException は環境によって Error の継承にならないため、name で判断する
  if (e.name === "AbortError") return "aborted"
  if (e.name === "TimeoutError" || e.outcome === "unknown") return "unknown"
  const status = typeof e.status === "number" ? e.status : undefined
  if (status !== undefined && status >= 500) return "unknown"
  if (e.code === "forbidden" || status === 403) return "forbidden"
  if (e.code === "conflict" || status === 409 || status === 412) return "conflict"
  if (e.code === "invalid" || e.code === "validation" || status === 400 || status === 422 || (e.fieldErrors && typeof e.fieldErrors === "object")) return "invalid"
  if (e.outcome === "failed" || (status !== undefined && status >= 400 && status < 500)) return "failed"
  return "unknown"
}

type Values = Record<string, unknown>

/**
 * change と changeMany の結果。
 * saved：すべて保存した／superseded：保存中に利用者が変えた項目（または replace）があり、その項目には反映しない／
 * partial：項目によって結果が異なる（statusOf で項目ごとに確かめる）／failed、invalid、forbidden、conflict、unknown：すべての項目が同じ結果／
 * blocked：結果が不明か競合の項目を含むため、送らなかった／aborted：スコープの変更、アンマウントで、結果を反映しなかった（古い処理結果）
 */
type SettleOutcome = "saved" | "superseded" | "partial" | "failed" | "invalid" | "forbidden" | "conflict" | "unknown" | "blocked" | "aborted"

type KeyOutcome<T = unknown> = { kind: "saved"; value: T; version?: SettingVersion } | { kind: "error"; error: unknown } | { kind: "missing" }

type InstantState<V extends Values> = {
  /** この状態のスコープ（useScopeGuard がスコープごとに返す値。A → B → A の最初の A と最後の A も区別する） */
  owner: object
  /** 表示する値。保存中は利用者が選んだ値 */
  values: V
  /** 最後に確認できたサーバーの値 */
  saved: V
  status: { [K in keyof V]?: SettingSaveState }
  /** 結果が不明か競合の項目の、利用者が選んだ値 */
  intended: Partial<V>
}

type InstantSettingsOptions<V extends Values> = {
  /** サーバーに保存されている値（取得した値）。スコープが変わったときの初期値になる */
  values: V
  /** アカウント、ワークスペース、権限など。変わったら、保存中の応答を反映せず、values から始め直す */
  scopeKey?: string
  /** 1 つの項目の保存。保存されたサーバーの値（正規化した値）か、withVersion(値, 版) を返す */
  save: <K extends keyof V & string>(key: K, value: V[K], context: SaveContext) => Promise<MaybeVersioned<V[K]>>
  /** 結果が不明か競合の項目の、現在のサーバーの値（か withVersion）を取得する */
  verify?: <K extends keyof V & string>(key: K, context: { signal: AbortSignal }) => Promise<MaybeVersioned<V[K]>>
  /**
   * 取得した時点の、項目ごとの版。渡すと版の照合を使う：同じ項目の保存を直列にし、context.ifMatch に最後に確認できた版を渡す。
   * サーバーが版の不一致を拒否する（classify が conflict を返す）ことを前提にする
   */
  versions?: { [K in keyof V]?: SettingVersion }
  /**
   * 結果が不明な項目の変更。block：確認するまで送らない（既定。版の照合を使う場合は allow が既定）。
   * allow：新しい要求として送る（サーバーが順序か版を保証する場合だけ使う）
   */
  whileUnknown?: "block" | "allow"
  classify?: (error: unknown) => SaveErrorKind
  /** 分類した失敗の文を、製品が決める（サーバーの検証の文など）。undefined を返すと messages の文を使う */
  describe?: (error: unknown, kind: SaveErrorKind) => string | undefined
  messages?: Partial<SaveMessages>
  equals?: (a: unknown, b: unknown) => boolean
  /** 最新の要求の結果（権限不足を受け取り、製品が権限を取り直すなど）。古い要求と別のスコープの結果では呼ばない */
  onSettled?: (key: keyof V & string, status: SettingSaveState) => void
  /** verify の結果（saved：保存されていた、failed：保存されていなかった、unknown：確かめられなかった） */
  onVerified?: (key: keyof V & string, status: SettingSaveState) => void
}

/** 版の照合を使う場合の、項目ごとの送信の列。前の要求の結果を待つ間の、最新の変更を next に持つ */
type Lane = { next: { value: unknown; ticket: ScopeTicket } | null; waiters: (() => void)[] }

function useInstantSettings<V extends Values>({
  values: initial,
  scopeKey,
  save,
  verify,
  versions,
  whileUnknown,
  classify = classifySaveError,
  describe,
  messages: messagesProp,
  equals = Object.is,
  onSettled,
  onVerified,
}: InstantSettingsOptions<V>) {
  const guard = useScopeGuard(scopeKey)
  const versioned = versions !== undefined
  const blockWhileUnknown = (whileUnknown ?? (versioned ? "allow" : "block")) === "block"
  // スコープの初期の状態（values は、スコープが変わった時点の値を使う）
  const freshState = React.useMemo<InstantState<V>>(
    () => ({ owner: guard, values: initial, saved: initial, status: {}, intended: {} }),
    // initial は、スコープが変わった時点の値だけを使う
    [guard]
  )
  const [state, setState] = React.useState<InstantState<V> | null>(null)
  // スコープが変わったら、同じ描画から新しいスコープの値を返す（前のスコープの値と状態を 1 回も返さない）。
  // 描画の中で setState しない（commit されない描画の更新が、表示中のスコープの状態を初期化しないため）。
  // 状態はスコープ（owner）と組にし、スコープが異なる状態は使わない。更新は、そのスコープの状態に対して行う
  const current = state !== null && state.owner === guard ? state : freshState
  const setScoped = React.useCallback(
    (fn: (s: InstantState<V>) => InstantState<V>) => setState((s) => fn(s !== null && s.owner === guard ? s : freshState)),
    [guard, freshState]
  )
  // commit された状態（イベントの処理で、結果が不明な項目かを判断する）。描画の中では書き換えない
  // （破棄された描画の状態を、表示中のスコープのイベントの処理で使わないため）。
  const currentRef = React.useRef(current)

  const messages = { ...defaultMessages, ...messagesProp }
  const props = { save, verify, classify, describe, onSettled, onVerified, equals, messages, blockWhileUnknown, versioned }
  // commit された描画の関数と設定。非同期の結果の処理は、これを使う（破棄された描画の関数を使わない）
  const latest = React.useRef(props)

  // 版の照合のための、最後に確認できたサーバーの値と版（イベントの処理の中で同期的に読む）と、項目ごとの送信の列。
  // unconfirmed：結果が不明か競合になり、最後に確認できた値が未確認の項目。
  // replaced：項目ごとの replace の回数（replace の前に送った要求の応答を、確認できた値に反映しないため）。
  // スコープの変更の commit で作り直す（描画の中では書き換えない）。
  const confirmedRef = React.useRef<{ values: V; versions: { [K in keyof V]?: SettingVersion } }>({ values: initial, versions: versions ?? {} })
  const lanesRef = React.useRef(new Map<string, Lane>())
  const unconfirmedRef = React.useRef(new Set<string>())
  const replacedRef = React.useRef(new Map<string, number>())
  const committedScope = React.useRef(scopeKey)
  React.useLayoutEffect(() => {
    if (committedScope.current === scopeKey) return
    committedScope.current = scopeKey
    confirmedRef.current = { values: initial, versions: versions ?? {} }
    lanesRef.current = new Map()
    unconfirmedRef.current = new Set()
    replacedRef.current = new Map()
    // initial と versions は、スコープが変わった時点の値だけを使う
  }, [scopeKey])
  // 版の照合を途中から使う（versions を渡し始めた）場合は、その時点の versions を最後に確認できた版とする。
  // 版の照合をやめた場合は、版を捨てる。どちらも送信の列を作り直す（前の方式の列を、新しい方式で待たない）
  const committedVersioned = React.useRef(versioned)
  React.useLayoutEffect(() => {
    if (committedVersioned.current === versioned) return
    committedVersioned.current = versioned
    confirmedRef.current = { values: confirmedRef.current.values, versions: versions ?? {} }
    lanesRef.current = new Map()
    // versions は、版の照合を始めた時点の値だけを使う
  }, [versioned])

  const update = React.useCallback((patch: (s: InstantState<V>) => Partial<InstantState<V>>) => setScoped((s) => ({ ...s, ...patch(s) })), [setScoped])

  const isBlocked = React.useCallback((key: string) => {
    const st = currentRef.current.status[key as keyof V]?.state
    if (st === "conflict") return true
    return latest.current.blockWhileUnknown && (st === "unknown" || st === "verifying")
  }, [])

  /** 項目の結果の状態。unconfirmed：最後に確認できた値が未確認の項目（確定した失敗を、戻せない失敗として示す） */
  const stateFor = React.useCallback((o: KeyOutcome, unconfirmed = false): SettingSaveState => {
    const { classify, describe, messages, blockWhileUnknown } = latest.current
    const unknownText = (base: string) => (blockWhileUnknown ? `${base}${messages.unknownLocked}` : base)
    if (o.kind === "saved") return { state: "saved" }
    if (o.kind === "missing") return { state: "unknown", message: unknownText(messages.missing), reason: "missing" }
    const kind = classify(o.error)
    const text = (fallback: string) => describe?.(o.error, kind) ?? fallback
    // 確定した失敗でも、前の要求の結果が不明なら、サーバーの現在の値はわからない（戻す先がない）。結果の不明として確認させる
    if (unconfirmed && (kind === "failed" || kind === "invalid" || kind === "forbidden")) {
      return { state: "unknown", message: unknownText(messages.unconfirmedFailed), reason: "unconfirmed", cause: kind }
    }
    switch (kind) {
      case "aborted":
        return { state: "unknown", message: unknownText(text(messages.aborted)), reason: "aborted" }
      case "unknown":
        return { state: "unknown", message: unknownText(text(messages.unknown)), reason: "no-response" }
      case "forbidden":
        return { state: "forbidden", message: text(messages.forbidden) }
      case "conflict":
        return { state: "conflict", message: text(messages.conflict) }
      case "invalid":
        return { state: "invalid", message: text(messages.instantInvalid) }
      default:
        return { state: "failed", message: text(messages.instantFailed) }
    }
  }, [])

  /**
   * 1 つ以上の項目を 1 つの要求で保存する。tickets は、項目ごとに開始した処理（呼び出す側で begin する）。
   * 保存中に利用者が同じ項目を変えた場合、その項目にはこの要求の結果を反映しない（新しい変更が最新）。
   */
  const run = React.useCallback(
    (
      values: Partial<V>,
      tickets: Map<keyof V & string, ScopeTicket>,
      request: (context: SaveManyContext<V>) => Promise<Partial<{ [K in keyof V]: MaybeVersioned<V[K]> }> | PartialSaveResult<V>>
    ): Promise<SettleOutcome> => {
      const keys = [...tickets.keys()]
      const ifMatch: { [K in keyof V]?: SettingVersion } = {}
      if (latest.current.versioned) for (const k of keys) ifMatch[k] = confirmedRef.current.versions[k]
      // 中止の signal は、スコープの変更とアンマウントで中止する（待機の中止。サーバーでの取り消しではない）
      const signal = tickets.get(keys[0])!.signal
      // 送った時点の、項目ごとの replace の回数
      const replacedAtSend = new Map(keys.map((k) => [k, replacedRef.current.get(k) ?? 0] as const))

      const settle = (outcomeOf: (k: keyof V & string) => KeyOutcome): SettleOutcome => {
        const releaseAll = () => tickets.forEach((t) => guard.release(t))
        if (!keys.some((k) => guard.isSameScope(tickets.get(k)!))) {
          releaseAll()
          return "aborted"
        }
        const latestKeys = keys.filter((k) => guard.isLatest(tickets.get(k)!))
        const statuses = new Map(latestKeys.map((k) => [k, stateFor(outcomeOf(k), unconfirmedRef.current.has(k))] as const))
        // replace の後に届いた、replace の前に送った要求の応答は、最後に確認できた値を変えない（replace の値を正とする）
        const notReplaced = new Set(keys.filter((k) => (replacedRef.current.get(k) ?? 0) === replacedAtSend.get(k)))
        const { versioned } = latest.current
        for (const k of notReplaced) {
          const o = outcomeOf(k)
          if (o.kind === "saved") {
            // 成功：サーバーの値を確認できた。版の照合では、最新の要求でない要求の成功も確定する
            // （項目ごとに直列のため、応答はサーバーでの順序と一致する）。版を使わない場合は、最新の要求の成功だけで確定する
            if (versioned || latestKeys.includes(k)) unconfirmedRef.current.delete(k)
            // 版の照合：成功した要求の値と版を、最後に確認できた値にする
            if (versioned) {
              confirmedRef.current = {
                values: { ...confirmedRef.current.values, [k]: o.value },
                versions: o.version === undefined ? confirmedRef.current.versions : { ...confirmedRef.current.versions, [k]: o.version },
              }
            }
          } else {
            // 結果の不明と競合（最新の要求でない要求の結果も含む）：最後に確認できた値は未確認になる
            const st = statuses.get(k) ?? stateFor(o)
            if (st.state === "unknown" || st.state === "conflict") unconfirmedRef.current.add(k)
          }
        }
        update((s) => {
          const next = { values: { ...s.values }, saved: { ...s.saved }, status: { ...s.status }, intended: { ...s.intended } }
          for (const k of keys) {
            const o = outcomeOf(k)
            const st = statuses.get(k)
            if (st) {
              next.status[k] = st
              if (o.kind === "saved") {
                // サーバーが返した値（正規化された値）を表示する
                next.values[k] = o.value as V[typeof k]
                next.saved[k] = o.value as V[typeof k]
                delete next.intended[k]
              } else if (st.state === "unknown" || st.state === "conflict") {
                // 結果が不明か競合：戻さない（サーバーの状態まで戻ったと判断しない）
                next.intended[k] = values[k]
              } else {
                // 確定した失敗、バリデーションによる拒否、権限不足：最後に確認できたサーバーの値へ戻す
                next.values[k] = s.saved[k]
                delete next.intended[k]
              }
            } else if (o.kind === "saved" && notReplaced.has(k)) {
              // 古い要求の成功。最新の要求が保存中なら、戻す先（サーバーの値）だけを更新する。
              // 最新の要求が確定した失敗でサーバーの値へ戻した後なら、表示も更新する（サーバーには古い要求の値がある）。
              // 最新の要求が成功した後、結果が不明な間、replace の後（replace の後の変更が保存中の場合も含む）は、
              // 何も変えない（最新の結果か、確認の結果か、replace の値を正とする）。
              const prev = s.status[k]?.state
              if (prev === "saving") next.saved[k] = o.value as V[typeof k]
              else if (prev === "failed" || prev === "forbidden" || prev === "invalid") {
                next.saved[k] = o.value as V[typeof k]
                next.values[k] = o.value as V[typeof k]
              }
            }
          }
          return next
        })
        for (const [k, st] of statuses) latest.current.onSettled?.(k, st)
        // 最後の照合の後に、キーの記録を消す
        releaseAll()
        if (latestKeys.length === 0) return "superseded"
        const kinds = new Set([...statuses.values()].map((s) => s.state))
        if (kinds.size === 1) {
          const only = [...kinds][0]
          if (only === "saved") return latestKeys.length === keys.length ? "saved" : "superseded"
          return only as SettleOutcome
        }
        return "partial"
      }

      return request({ signal, ifMatch }).then(
        (result) =>
          settle((k) => {
            if (result instanceof PartialSaveResult) {
              const saved = result.saved as Record<string, unknown>
              const errors = result.errors as Record<string, unknown>
              if (k in saved && saved[k] !== undefined) return { kind: "saved", ...unwrap(saved[k]) }
              if (k in errors) return { kind: "error", error: errors[k] }
              return { kind: "missing" }
            }
            const raw = result && typeof result === "object" ? (result as Record<string, unknown>)[k] : undefined
            // 応答に項目の値がない（undefined を含む）：成功と判断しない
            return raw === undefined ? { kind: "missing" } : { kind: "saved", ...unwrap(raw) }
          }),
        (error) => settle(() => ({ kind: "error", error }))
      )
    },
    [guard, stateFor, update]
  )

  const markSaving = React.useCallback(
    (values: Partial<V>) =>
      update((s) => {
        const intended = { ...s.intended }
        const status = { ...s.status }
        for (const k of Object.keys(values) as (keyof V)[]) {
          delete intended[k]
          status[k] = { state: "saving" }
        }
        return { values: { ...s.values, ...values }, status, intended }
      }),
    [update]
  )

  const sendOne = React.useCallback(
    <K extends keyof V & string>(key: K, value: V[K], ticket: ScopeTicket) =>
      run({ [key]: value } as unknown as Partial<V>, new Map([[key, ticket]]), (context) =>
        latest.current.save(key, value, { signal: context.signal, ifMatch: context.ifMatch[key] }).then((r) => ({ [key]: r }) as never)
      ),
    [run]
  )

  // 版の照合：項目の送信の列を空け、待っていた変更を送る
  const vacate = React.useCallback((keys: string[], map: Map<string, Lane>) => {
    for (const k of keys) {
      const lane = map.get(k)
      if (!lane) continue
      map.delete(k)
      lane.waiters.forEach((w) => w())
      // スコープが変わった後の列（map が古い）では、次の変更を送らない
      if (lane.next && map === lanesRef.current) dispatchRef.current(k, lane.next.value, lane.next.ticket)
    }
  }, [])

  const dispatch = React.useCallback(
    (key: string, value: unknown, ticket: ScopeTicket) => {
      // replace やスコープの変更で古くなった変更は送らない
      if (!guard.isLatest(ticket)) {
        guard.release(ticket)
        return
      }
      // サーバーで確認できた値と同じなら送らない（ON → OFF → ON で、最初の ON が保存された場合など）。
      // 確認できた値が未確認の項目（前の要求の結果が不明か競合）では、等しくても送る（サーバーには別の値がある場合がある）
      if (!unconfirmedRef.current.has(key) && latest.current.equals(value, confirmedRef.current.values[key])) {
        update((s) => ({ values: { ...s.values, [key]: value }, status: { ...s.status, [key]: { state: "saved" } } }))
        latest.current.onSettled?.(key as keyof V & string, { state: "saved" })
        guard.release(ticket)
        return
      }
      const map = lanesRef.current
      map.set(key, { next: null, waiters: [] })
      void sendOne(key as keyof V & string, value as V[keyof V & string], ticket).then(() => vacate([key], map))
    },
    [guard, sendOne, update, vacate]
  )
  // commit された描画の dispatch（待っていた変更を、前の要求の応答の後に送るときに使う）
  const dispatchRef = React.useRef(dispatch)
  // 描画の中では ref を書き換えない。commit の時点で、最新の状態と関数にする
  React.useLayoutEffect(() => {
    currentRef.current = current
    latest.current = props
    dispatchRef.current = dispatch
  })

  /**
   * 項目を変更して保存する。送らなかった場合は false を返す（結果が不明か競合の項目、
   * または前のスコープの描画の関数から呼んだ場合。後者では状態を変えない）
   */
  const change = React.useCallback(
    <K extends keyof V & string>(key: K, value: V[K]): boolean => {
      if (isBlocked(key)) return false
      const ticket = guard.begin(key)
      // 前のスコープの描画の関数から呼んだ（無効な Ticket）：現在のスコープの状態を「保存中」にしない
      if (!guard.isCurrent(ticket)) return false
      markSaving({ [key]: value } as unknown as Partial<V>)
      if (!latest.current.versioned) {
        void sendOne(key, value, ticket)
        return true
      }
      // 版の照合：同じ項目の前の要求の結果を待つ。待つ間の変更は、最後のものだけを送る
      const lane = lanesRef.current.get(key)
      if (lane) {
        if (lane.next) guard.release(lane.next.ticket)
        lane.next = { value, ticket }
      } else dispatch(key, value, ticket)
      return true
    },
    [dispatch, guard, isBlocked, markSaving, sendOne]
  )

  /**
   * 複数の項目を 1 つの要求で保存する（標準の設定へ戻すなど）。項目ごとの状態は change と同じ規則で反映する。
   * request は、全体の成功（項目の値）か、項目ごとの結果（partialSaveResult）を返す。例外は、すべての項目の失敗として扱う。
   * 版の照合を使う場合は、同じ項目の前の要求の結果を待ってから送り、待つ間に利用者が変えた項目は送らない。
   * 結果が不明か競合の項目を含む場合は、送らずに blocked を返す。
   */
  const changeMany = React.useCallback(
    (
      values: Partial<V>,
      request: (values: Partial<V>, context: SaveManyContext<V>) => Promise<Partial<{ [K in keyof V]: MaybeVersioned<V[K]> }> | PartialSaveResult<V>>
    ): Promise<SettleOutcome> => {
      const keys = Object.keys(values) as (keyof V & string)[]
      if (keys.length === 0) return Promise.resolve("saved")
      if (keys.some(isBlocked)) return Promise.resolve("blocked")
      const tickets = new Map(keys.map((k) => [k, guard.begin(k)] as const))
      // 前のスコープの描画の関数から呼んだ：送らず、状態を変えない
      if (![...tickets.values()].every((t) => guard.isCurrent(t))) return Promise.resolve("aborted")
      markSaving(values)
      if (!latest.current.versioned) return run(values, tickets, (context) => request(values, context))
      const whenFree = () =>
        new Promise<void>((resolve) => {
          const check = () => {
            const busy = keys.find((k) => lanesRef.current.has(k))
            if (busy) lanesRef.current.get(busy)!.waiters.push(check)
            else resolve()
          }
          check()
        })
      return whenFree().then(() => {
        const live = keys.filter((k) => guard.isLatest(tickets.get(k)!))
        for (const k of keys) if (!live.includes(k)) guard.release(tickets.get(k)!)
        if (live.length === 0) return keys.some((k) => guard.isSameScope(tickets.get(k)!)) ? ("superseded" as const) : ("aborted" as const)
        const sub = Object.fromEntries(live.map((k) => [k, values[k]])) as Partial<V>
        const map = lanesRef.current
        for (const k of live) map.set(k, { next: null, waiters: [] })
        return run(sub, new Map(live.map((k) => [k, tickets.get(k)!] as const)), (context) => request(sub, context)).then((outcome) => {
          vacate(live, map)
          return live.length < keys.length && outcome === "saved" ? "superseded" : outcome
        })
      })
    },
    [guard, isBlocked, markSaving, run, vacate]
  )

  const verifyKey = React.useCallback(
    <K extends keyof V & string>(key: K) => {
      const fetcher = latest.current.verify
      if (!fetcher) return
      const ticket = guard.begin(key)
      // 前のスコープの描画の関数から呼んだ：現在のスコープの状態を「確認中」にしない
      if (!guard.isCurrent(ticket)) return
      update((s) => ({ status: { ...s.status, [key]: { state: "verifying" } } }))
      fetcher(key, { signal: ticket.signal }).then(
        (raw) => {
          if (!guard.isLatest(ticket)) return guard.release(ticket)
          const { value: serverValue, version } = unwrap(raw)
          unconfirmedRef.current.delete(key)
          if (latest.current.versioned) {
            confirmedRef.current = {
              values: { ...confirmedRef.current.values, [key]: serverValue },
              versions: version === undefined ? confirmedRef.current.versions : { ...confirmedRef.current.versions, [key]: version },
            }
          }
          const s = currentRef.current
          const savedAsIntended = key in s.intended ? latest.current.equals(serverValue, s.intended[key]) : true
          const status: SettingSaveState = savedAsIntended ? { state: "saved" } : { state: "failed", message: latest.current.messages.notSaved }
          update((prev) => {
            const intended = { ...prev.intended }
            delete intended[key]
            return { values: { ...prev.values, [key]: serverValue }, saved: { ...prev.saved, [key]: serverValue }, intended, status: { ...prev.status, [key]: status } }
          })
          latest.current.onVerified?.(key, status)
          guard.release(ticket)
        },
        () => {
          if (!guard.isLatest(ticket)) return guard.release(ticket)
          // 確認の取得の待機を中止した場合も含め、確かめられなかった
          const { messages, blockWhileUnknown } = latest.current
          const status: SettingSaveState = { state: "unknown", message: blockWhileUnknown ? `${messages.unknown}${messages.unknownLocked}` : messages.unknown, reason: "no-response" }
          update((s) => ({ status: { ...s.status, [key]: status } }))
          latest.current.onVerified?.(key, status)
          guard.release(ticket)
        }
      )
    },
    [guard, update]
  )

  /**
   * 別の経路（再取得など）で確定したサーバーの値（と版）を反映する。
   * 反映する項目の保存中の要求は古くなり、後から届いた応答は、表示と、最後に確認できた値と版を上書きしない。待っている変更も送らない。
   * 前のスコープの描画の関数から呼んだ場合（取得の後に呼ぶ closure など）は、何もせずに false を返す。
   */
  const replace = React.useCallback(
    (next: Partial<V>, nextVersions?: { [K in keyof V]?: SettingVersion }): boolean => {
      // 前のスコープの値（別のスコープで取得した値）で、現在のスコープの状態を上書きしない
      if (!guard.isCurrent(guard.capture())) return false
      for (const key of Object.keys(next)) {
        // 新しい番号で前の要求を古くし、すぐに記録を消す（release の後は、どの要求も最新ではない）
        guard.release(guard.begin(key))
        replacedRef.current.set(key, (replacedRef.current.get(key) ?? 0) + 1)
        unconfirmedRef.current.delete(key)
      }
      if (latest.current.versioned) {
        confirmedRef.current = { values: { ...confirmedRef.current.values, ...next }, versions: { ...confirmedRef.current.versions, ...nextVersions } }
      }
      setScoped((s) => {
        const status = { ...s.status }
        const intended = { ...s.intended }
        for (const key of Object.keys(next)) {
          delete status[key as keyof V]
          delete intended[key as keyof V]
        }
        return { ...s, values: { ...s.values, ...next }, saved: { ...s.saved, ...next }, status, intended }
      })
      return true
    },
    [guard, setScoped]
  )

  const statusOf = (key: keyof V & string): SettingSaveState => current.status[key] ?? { state: "idle" }
  /** 項目を変更できるか（結果が不明か競合で、確認するまで送らない場合は false）。操作の readOnly に使う */
  const canChange = (key: keyof V & string) => {
    const st = current.status[key]?.state
    return !(st === "conflict" || (blockWhileUnknown && (st === "unknown" || st === "verifying")))
  }
  const pending = Object.values(current.status).some((s) => s?.state === "saving" || s?.state === "verifying")
  return { values: current.values, saved: current.saved, status: current.status, statusOf, canChange, change, changeMany, verify: verifyKey, replace, pending }
}

type FormState<V extends Values> = {
  /** この状態のスコープ（useScopeGuard がスコープごとに返す値） */
  owner: object
  values: V
  saved: V
  status: SettingSaveState
  /** 保存を始めたときの値（結果が不明か競合の保存の確認に使う） */
  submitted: V | null
}

/**
 * submit の結果。saved、failed、invalid、forbidden、conflict、unknown は保存の結果。
 * superseded：同じフォームの新しい処理があった／aborted：スコープの変更、アンマウント（結果を反映しなかった）／
 * busy：保存中か確認中／blocked：結果が不明か競合で、確認するまで保存できない／unchanged：requireChanges で、変更がない
 */
type SubmitOutcome = "saved" | "failed" | "invalid" | "forbidden" | "conflict" | "unknown" | "superseded" | "aborted" | "busy" | "blocked" | "unchanged"

type SettingsFormOptions<V extends Values> = {
  /** サーバーに保存されている値。スコープが変わったときの初期値になる */
  values: V
  scopeKey?: string
  /** フォーム全体の保存。保存されたサーバーの値（正規化した値）か、withVersion(値, 版) を返す */
  save: (values: V, context: SaveContext) => Promise<MaybeVersioned<V>>
  /** 結果が不明か競合の保存のあとに、現在のサーバーの値（か withVersion）を取得する */
  verify?: (context: { signal: AbortSignal }) => Promise<MaybeVersioned<V>>
  /** 取得した時点の版。渡すと、save の context.ifMatch に、最後に確認できた版を渡す */
  version?: SettingVersion
  /** true：変更がない場合は保存しない（submit が unchanged を返す）。override を渡した submit には適用しない */
  requireChanges?: boolean
  classify?: (error: unknown) => SaveErrorKind
  describe?: (error: unknown, kind: SaveErrorKind) => string | undefined
  messages?: Partial<SaveMessages>
  equals?: (a: unknown, b: unknown) => boolean
  onSettled?: (status: SettingSaveState) => void
}

function useSettingsForm<V extends Values>({
  values: initial,
  scopeKey,
  save,
  verify,
  version,
  requireChanges = false,
  classify = classifySaveError,
  describe,
  messages: messagesProp,
  equals = Object.is,
  onSettled,
}: SettingsFormOptions<V>) {
  const guard = useScopeGuard(scopeKey)
  // スコープの初期の状態と、スコープと組にした状態（useInstantSettings と同じ。描画の中で setState しない）
  const freshState = React.useMemo<FormState<V>>(
    () => ({ owner: guard, values: initial, saved: initial, status: { state: "idle" }, submitted: null }),
    // initial は、スコープが変わった時点の値だけを使う
    [guard]
  )
  const [state, setStateRaw] = React.useState<FormState<V> | null>(null)
  const setState = React.useCallback(
    (next: FormState<V> | ((s: FormState<V>) => FormState<V>)) =>
      setStateRaw((s) => {
        const base = s !== null && s.owner === guard ? s : freshState
        return typeof next === "function" ? next(base) : next
      }),
    [guard, freshState]
  )
  // 保存中か確認中の要求。二重の保存を、描画を待たずに防ぐ。
  // スコープが変わったら、前のスコープの要求を待たない。描画の中で消さず、Ticket のスコープで照合する
  // （スコープの変更の描画が破棄され、前のスコープを表示し続ける場合に、表示中のスコープの二重の保存を許さないため）。
  const busy = React.useRef<ScopeTicket | null>(null)
  const current = state !== null && state.owner === guard ? state : freshState
  // commit された状態（描画の中では書き換えない）
  const currentRef = React.useRef(current)

  const messages = { ...defaultMessages, ...messagesProp }
  const props = { save, verify, classify, describe, onSettled, equals, messages, requireChanges }
  // commit された描画の関数と設定
  const latest = React.useRef(props)
  React.useLayoutEffect(() => {
    currentRef.current = current
    latest.current = props
  })

  // 最後に確認できた版。スコープの変更の commit で作り直す
  const versionRef = React.useRef(version)
  const committedScope = React.useRef(scopeKey)
  React.useLayoutEffect(() => {
    if (committedScope.current === scopeKey) return
    committedScope.current = scopeKey
    versionRef.current = version
  }, [scopeKey])

  const dirtyOf = (s: FormState<V>) => (Object.keys(s.values) as (keyof V & string)[]).filter((k) => !equals(s.values[k], s.saved[k]))
  const dirtyKeys = dirtyOf(current)

  /** 保存の結果を反映する。保存を始めた後に変えた項目は、入力した値を残す */
  const settle = (s: FormState<V>, snapshot: V, result: V): Partial<FormState<V>> => {
    const values = { ...result }
    for (const k of Object.keys(s.values) as (keyof V)[]) {
      if (!latest.current.equals(s.values[k], snapshot[k])) values[k] = s.values[k]
    }
    return { values, saved: result, submitted: null }
  }

  const setValue = React.useCallback(<K extends keyof V & string>(key: K, value: V[K]) => {
    // 前のスコープの描画の関数から呼んだ場合は、現在のスコープの入力を変えない
    if (!guard.isCurrent(guard.capture())) return
    setState((s) => ({
      ...s,
      values: { ...s.values, [key]: value },
      // 保存の結果の表示（保存しました、失敗）は、次の変更で未保存の表示に戻す。保存中、確認中、結果の不明と競合は残す
      status: s.status.state === "saving" || s.status.state === "verifying" || s.status.state === "unknown" || s.status.state === "conflict" ? s.status : { state: "idle" },
    }))
  }, [guard, setState])

  const errorStatus = (error: unknown): SettingSaveState => {
    const { classify, describe, messages } = latest.current
    const kind = classify(error)
    const text = (fallback: string) => describe?.(error, kind) ?? fallback
    switch (kind) {
      case "aborted":
        return { state: "unknown", message: `${text(messages.aborted)}${messages.formUnknownLocked}`, reason: "aborted" }
      case "unknown":
        return { state: "unknown", message: `${text(messages.unknown)}${messages.formUnknownLocked}`, reason: "no-response" }
      case "forbidden":
        return { state: "forbidden", message: text(messages.forbidden) }
      case "conflict":
        return { state: "conflict", message: text(messages.formConflict) }
      case "invalid":
        return { state: "invalid", message: text(messages.formInvalid) }
      default:
        return { state: "failed", message: text(messages.formFailed) }
    }
  }

  /**
   * フォームを保存する。values を渡すと、その値を保存する（標準の設定へ戻すなど）。
   * 保存中、確認中、結果が不明か競合の間は送らない。結果（SubmitOutcome）を返す（保存して移動するなど、製品が待てる）
   */
  const submit = React.useCallback(
    (override?: V): Promise<SubmitOutcome> => {
      // 保存中か確認中の、このスコープの要求がある
      if (busy.current && guard.isSameScope(busy.current)) return Promise.resolve("busy")
      const now = currentRef.current
      if (now.status.state === "unknown" || now.status.state === "conflict") return Promise.resolve("blocked")
      if (!override && latest.current.requireChanges && dirtyOf(now).length === 0) return Promise.resolve("unchanged")
      const values = override ?? now.values
      const ticket = guard.begin("submit")
      // 前のスコープの描画の関数から呼んだ（無効な Ticket）：送らず、現在のスコープの状態を「保存中」にしない
      if (!guard.isCurrent(ticket)) return Promise.resolve("aborted")
      busy.current = ticket
      const done = () => {
        if (busy.current === ticket) busy.current = null
      }
      setState((s) => ({ ...s, values, status: { state: "saving" }, submitted: values }))
      const finish = (status: SettingSaveState | null, apply: (s: FormState<V>) => FormState<V>): SubmitOutcome => {
        done()
        if (!guard.isLatest(ticket)) {
          const stale: SubmitOutcome = guard.isSameScope(ticket) ? "superseded" : "aborted"
          guard.release(ticket)
          return stale
        }
        setState(apply)
        if (status) latest.current.onSettled?.(status)
        guard.release(ticket)
        return (status?.state ?? "saved") as SubmitOutcome
      }
      return latest.current.save(values, { signal: ticket.signal, ifMatch: versionRef.current }).then(
        (raw) => {
          const { value: result, version: nextVersion } = unwrap(raw)
          // 応答に保存した項目の値が含まれない：成功と判断しない
          const missing = !result || typeof result !== "object" || (Object.keys(values) as (keyof V)[]).some((k) => (result as V)[k] === undefined)
          if (missing) {
            const { messages } = latest.current
            const status: SettingSaveState = { state: "unknown", message: `${messages.missing}${messages.formUnknownLocked}`, reason: "missing" }
            return finish(status, (s) => ({ ...s, status, submitted: values }))
          }
          if (guard.isLatest(ticket) && nextVersion !== undefined) versionRef.current = nextVersion
          const status: SettingSaveState = { state: "saved" }
          return finish(status, (s) => ({ ...s, ...settle(s, values, result), status }))
        },
        (error) => {
          const status = errorStatus(error)
          const keep = status.state === "unknown" || status.state === "conflict"
          return finish(status, (s) => ({ ...s, status, submitted: keep ? values : null }))
        }
      )
    },
    [guard, setState]
  )

  /** 結果が不明か競合の保存のあとに、サーバーの値を確かめる */
  const verifyForm = React.useCallback(() => {
    const fetcher = latest.current.verify
    if (!fetcher || (busy.current && guard.isSameScope(busy.current))) return
    const ticket = guard.begin("submit")
    if (!guard.isCurrent(ticket)) return
    busy.current = ticket
    const done = () => {
      if (busy.current === ticket) busy.current = null
      guard.release(ticket)
    }
    setState((s) => ({ ...s, status: { state: "verifying" } }))
    fetcher({ signal: ticket.signal }).then(
      (raw) => {
        if (!guard.isLatest(ticket)) return done()
        const { value: serverValues, version: serverVersion } = unwrap(raw)
        if (serverVersion !== undefined) versionRef.current = serverVersion
        setState((s) => {
          const snapshot = s.submitted
          const savedAsSubmitted =
            snapshot !== null && (Object.keys(snapshot) as (keyof V)[]).every((k) => latest.current.equals(serverValues[k], snapshot[k]))
          if (snapshot && savedAsSubmitted) return { ...s, ...settle(s, snapshot, serverValues), status: { state: "saved" } }
          // 保存されていなかった：入力した内容を残し、戻す先だけをサーバーの値にする
          return { ...s, saved: serverValues, submitted: null, status: { state: "failed", message: latest.current.messages.formNotSaved } }
        })
        done()
      },
      () => {
        if (!guard.isLatest(ticket)) return done()
        const { messages } = latest.current
        setState((s) => ({ ...s, status: { state: "unknown", message: `${messages.unknown}${messages.formUnknownLocked}`, reason: "no-response" } }))
        done()
      }
    )
  }, [guard, setState])

  /**
   * 入力した内容を破棄し、最後に確認できたサーバーの値に戻す。
   * 保存中、確認中、結果が不明か競合の間は何もしない（サーバーに保存された可能性がある値を、戻ったものとして扱わない）
   */
  const discard = React.useCallback(() => {
    if (!guard.isCurrent(guard.capture())) return
    setState((s) =>
      s.status.state === "saving" || s.status.state === "verifying" || s.status.state === "unknown" || s.status.state === "conflict"
        ? s
        : { ...s, values: s.saved, status: { state: "idle" } }
    )
  }, [guard, setState])

  const saving = current.status.state === "saving" || current.status.state === "verifying"
  const unresolved = current.status.state === "unknown" || current.status.state === "conflict"
  /** 保存を送れない理由（送れる場合は null） */
  const submitBlockedReason: "saving" | "unresolved" | "unchanged" | null = saving
    ? "saving"
    : unresolved
      ? "unresolved"
      : requireChanges && dirtyKeys.length === 0
        ? "unchanged"
        : null
  /** 入力を破棄できるか（保存中、確認中、結果が不明か競合の間はできない） */
  const canDiscard = dirtyKeys.length > 0 && !saving && !unresolved
  return {
    canDiscard,
    canSubmit: submitBlockedReason === null,
    submitBlockedReason,
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

export { classifySaveError, defaultMessages as settingSaveMessages, partialSaveResult, PartialSaveResult, useInstantSettings, useSettingsForm, VersionedValue, withVersion }
export type {
  InstantSettingsOptions,
  MaybeVersioned,
  SaveContext,
  SaveErrorKind,
  SaveManyContext,
  SaveMessages,
  SettingSaveState,
  SettingsFormOptions,
  SettingVersion,
  SettleOutcome,
  SubmitOutcome,
  UnknownReason,
}
