"use client"

import * as React from "react"

import { useScopeGuard, type ScopeTicket } from "./scope-guard"
import {
  advanceStableIssues,
  normalizeRetryPolicy,
  retryDelay,
  type ConnectivityConfirmation,
  type ConnectivityStatus,
  type OfflineReason,
  type RetryPolicy,
  type StableIssuesState,
} from "./system-status"

// Flow Design System Status の hook（Patterns / System & Account / System States）
// 定義と判断基準は docs/web/patterns/system-states.md を参照。型と純粋な関数は system-status.ts。
//
// この部品が守ること
// - 接続を確認していない状態（unknown）を、確認できた状態（online）として扱わない。最初の状態は unknown（useConnectivity）。
// - ブラウザのオンラインの状態（navigator.onLine）だけで、サービスに接続できるとは判断しない（useConnectivity）。
// - 疎通の確認を、間隔と上限を設けて自動で再試行する。古い確認の応答、前の接続先の応答、タイムアウトの後の応答、
//   アンマウントの後の応答を反映しない。疎通の確認の API を必須にしない（製品の要求の成功で確認できる）。
// - 接続と切断を短時間に繰り返す場合に、表示と読み上げを繰り返さない（useStableIssues）。即時の認識が必要な問題は遅らせない。
//   スコープが変わったら、前のスコープの問題を示さない。
// - 描画の中で window、navigator、Date.now() を読まない（effect の中で読む）。
//
// この部品が持たないもの（製品の責務）
// - 疎通の確認の API（任意）、通信の処理、要求の再送、エラーの種類の判別、reportReachable と reportFailure を呼ぶこと。

// ---------------------------------------------------------------- hook：接続の状態

type BrowserOnlineSource = {
  /** 現在のオンラインの状態。false は「確実にネットワークに接続していない」、true は「接続している可能性がある」 */
  get: () => boolean
  /** 変化を購読する。購読を解除する関数を返す */
  subscribe: (onChange: () => void) => () => void
}

// 既定のブラウザのオンラインの状態。effect の中でだけ使う（描画の中で navigator を読まない）。
const navigatorOnline: BrowserOnlineSource = {
  get: () => navigator.onLine,
  subscribe: (onChange) => {
    window.addEventListener("online", onChange)
    window.addEventListener("offline", onChange)
    return () => {
      window.removeEventListener("online", onChange)
      window.removeEventListener("offline", onChange)
    }
  },
}

type ConnectivityState = {
  /** unknown：確認していない。online：経路に届くことを確認できた（サービスの稼働と、データの取得の成功は意味しない） */
  status: ConnectivityStatus
  /** offline の理由。online、connecting、unknown では null */
  reason: OfflineReason | null
  /** 現在の切断の間に失敗した疎通の確認の回数 */
  attempt: number
  /** 次の自動の確認の時刻。自動の確認を予定していない場合は null */
  nextCheckAt: number | null
  /** 疎通の確認の要求を送っている */
  checking: boolean
  /** 通信の失敗か、ブラウザの offline を検出した時刻。接続を確認できたら null。最初の確認の前は null */
  lostAt: number | null
  /** 現在の接続を確認できた時刻（online になった時刻、疎通の確認が成功した時刻）。一度も確認していなければ null */
  confirmedAt: number | null
  /** confirmedAt を確認した方法（疎通の確認、製品の要求の成功、確認済みの初期状態） */
  confirmedBy: ConnectivityConfirmation | null
  /** 直前の切断（回復したときに設定する）。seq は回復ごとに増える。再取得、保存の結果の確認、復旧の通知の判断に使う */
  lastOutage: { lostAt: number; restoredAt: number; seq: number } | null
  /** この状態の接続先（target） */
  target: string | undefined
}

type ConnectivityOptions = {
  /**
   * サービスへの疎通の確認（軽い取得の要求など）。届いたら resolve、届かなければ reject。省略できる。
   * 省略した場合は、製品の要求の成功（reportReachable）だけで online にする（自動の確認と check は行わない）。
   * target は、確認を始めたときの接続先。
   */
  probe?: (context: { signal: AbortSignal; target: string | undefined }) => Promise<unknown>
  /** 自動の確認の間隔と上限。不正な値は既定の値にする（normalizeRetryPolicy） */
  retry?: Partial<RetryPolicy>
  /** 疎通の確認の待ち時間の上限（ms）。超えたら失敗として扱う（probe が signal に従わない場合も）。0 以下、NaN、Infinity は 8000 */
  timeout?: number
  /** ブラウザのオンラインの状態。既定は navigator.onLine と window の online / offline。検品や模擬の処理で置き換える */
  browserOnline?: BrowserOnlineSource
  /** 現在の時刻（ms） */
  now?: () => number
  /**
   * 製品が確認済みの初期状態。接続を確認できた時刻（ms）を渡すと、最初の描画から online にする（例：サーバーで描画するときの
   * 取得が成功し、その時刻を画面と一緒に渡した）。サーバーとブラウザで同じ値を渡す（Hydration を一致させる）。
   * 確認していない場合は渡さない（null）。最初の target にだけ使う。
   */
  initialConfirmedAt?: number | null
  /**
   * 接続先（サービス、拠点のサーバーなど）を表す値。変わったら、前の接続先の確認の状態、要求中の確認、予定した確認を捨て、
   * unknown から確かめ直す。前の接続先の確認の応答は反映しない（A → B → A でも、最初の A の応答を反映しない）。
   */
  target?: string
}

const validTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

const connectivityFor = (target: string | undefined, confirmedAt: number | null | undefined): ConnectivityState => ({
  status: validTime(confirmedAt) ? "online" : "unknown",
  reason: null,
  attempt: 0,
  nextCheckAt: null,
  checking: false,
  lostAt: null,
  confirmedAt: validTime(confirmedAt) ? confirmedAt : null,
  confirmedBy: validTime(confirmedAt) ? "initial" : null,
  lastOutage: null,
  target,
})

const defaultTimeout = 8000

/**
 * サービスとの接続の状態を管理する。
 * - 最初の描画（SSR を含む）は unknown（確認していない）。initialConfirmedAt を渡した場合だけ online。
 *   マウントの後、ブラウザが offline なら offline（browser）、online なら疎通を確認する（probe がある場合）。
 * - ブラウザが offline になったら、すぐに offline（browser）にする。疎通の確認と自動の確認を止める。
 * - ブラウザが online になったら、疎通の確認が成功するか、製品の要求の成功（reportReachable）を受けてから online にする
 *   （online の通知だけで接続できたとしない）。確認の間は connecting（最初の確認の前に切断していない場合は unknown のまま）。
 * - 疎通の確認に失敗したら、間隔を延ばしながら自動で確認する。上限に達したら offline（unreachable）にし、利用者の操作（check）を待つ。
 * - 古い確認の応答、前の接続先（target）の応答、タイムアウトの後の応答、アンマウントの後の応答は反映しない。
 * 返す値：check() は利用者の「再接続を試す」（確認を始めた場合 true）。reportFailure() は製品の要求が通信の失敗で終わったとき、
 * reportReachable() は製品の要求に応答が届いたとき（成功、または HTTP のエラーの応答）に呼ぶ。どちらも { target } を渡すと、
 * 現在の接続先と異なる場合は反映しない。
 */
function useConnectivity(options: ConnectivityOptions = {}) {
  const { target, initialConfirmedAt } = options
  const [state, setState] = React.useState<ConnectivityState>(() => connectivityFor(target, initialConfirmedAt))
  const stateRef = React.useRef(state)
  // 最新の options と guard。描画の中では書き換えない（破棄された描画の値を使わないため、commit の後の layout effect で更新する）
  const optionsRef = React.useRef(options)
  // 接続先ごとの確認の Ticket。接続先の変更（commit）とアンマウントで、前の確認の応答を反映しない。
  const guard = useScopeGuard(target)
  // 購読（browserOnline.subscribe）、タイマー、effect から呼ぶ関数は、この ref から最新の guard を使う。
  // 最初の描画の guard を購読に保持したまま接続先が変わると、begin が無効な Ticket を返し、確認の結果が反映されないため。
  // useScopeGuard の layout effect（世代の更新と結び付け）の後に実行する（この hook の中で、後に宣言しているため）。
  const guardRef = React.useRef(guard)
  React.useLayoutEffect(() => {
    optionsRef.current = options
    guardRef.current = guard
  })
  const ticketRef = React.useRef<ScopeTicket | null>(null)
  const controller = React.useRef<AbortController | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = React.useRef(false)

  // 以下の関数は、ref だけを使う（描画ごとに作り直さない）。購読と effect に最初の値を渡しても、最新の状態と guard を使う。
  const commit = React.useCallback((patch: Partial<ConnectivityState>) => {
    stateRef.current = { ...stateRef.current, ...patch }
    setState(stateRef.current)
  }, [])

  const source = React.useCallback(() => optionsRef.current.browserOnline ?? navigatorOnline, [])
  const clock = React.useCallback(() => (optionsRef.current.now ?? Date.now)(), [])
  const sameTarget = React.useCallback(
    (context?: { target?: string }) => !context || !("target" in context) || context.target === stateRef.current.target,
    []
  )

  // 要求中の確認と、予定した確認を止める。要求中の確認の応答は反映しない。
  const cancelPending = React.useCallback(() => {
    if (ticketRef.current) guardRef.current.release(ticketRef.current)
    ticketRef.current = null
    controller.current?.abort()
    controller.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (timeoutTimer.current) clearTimeout(timeoutTimer.current)
    timeoutTimer.current = null
  }, [])

  const markReachable = React.useCallback(
    (by: ConnectivityConfirmation) => {
      const t = clock()
      const s = stateRef.current
      commit({
        status: "online",
        reason: null,
        attempt: 0,
        nextCheckAt: null,
        checking: false,
        lostAt: null,
        confirmedAt: t,
        confirmedBy: by,
        lastOutage: s.lostAt !== null ? { lostAt: s.lostAt, restoredAt: t, seq: (s.lastOutage?.seq ?? 0) + 1 } : s.lastOutage,
      })
    },
    [clock, commit]
  )

  const runProbeRef = React.useRef<() => boolean>(() => false)

  const probeFailed = React.useCallback(() => {
    const policy = normalizeRetryPolicy(optionsRef.current.retry)
    const s = stateRef.current
    const attempt = s.attempt + 1
    const lostAt = s.lostAt ?? clock()
    if (attempt >= policy.maxAttempts) {
      commit({ status: "offline", reason: "unreachable", attempt, nextCheckAt: null, checking: false, lostAt })
      return
    }
    const delay = retryDelay(attempt, policy)
    commit({ status: "connecting", reason: null, attempt, nextCheckAt: clock() + delay, checking: false, lostAt })
    timer.current = setTimeout(() => {
      timer.current = null
      runProbeRef.current()
    }, delay)
  }, [clock, commit])

  const runProbe = React.useCallback(() => {
    const probe = optionsRef.current.probe
    if (!mounted.current || !probe) return false
    cancelPending()
    if (!source().get()) return false
    const guard = guardRef.current
    const ticket = guard.begin("probe")
    ticketRef.current = ticket
    const c = new AbortController()
    controller.current = c
    const probeTarget = stateRef.current.target
    commit({ checking: true, nextCheckAt: null })
    const raw = optionsRef.current.timeout
    const limit = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : defaultTimeout
    let settled = false
    const finish = (reached: boolean) => {
      if (settled) return
      settled = true
      // 止めた確認（新しい確認、接続先の変更、アンマウント）の応答：何もしない（ticketRef は止めたときに解除している）
      if (ticketRef.current !== ticket) return
      if (timeoutTimer.current) clearTimeout(timeoutTimer.current)
      timeoutTimer.current = null
      controller.current = null
      ticketRef.current = null
      // 最後の照合：同じ接続先の、最新の確認だけを反映する。照合の後に記録を消す
      const latest = guardRef.current.isLatest(ticket)
      guardRef.current.release(ticket)
      if (!latest) {
        // 照合に失敗した Ticket（無効な Ticket など）が残っていた場合も、確認中の状態は解除する（結果は反映しない）。
        // 解除しないと、checking と ticketRef が残り、sync、reportFailure、自動の確認が止まる
        commit({ checking: false })
        return
      }
      if (reached) markReachable("probe")
      else probeFailed()
    }
    timeoutTimer.current = setTimeout(() => {
      // タイムアウト：probe が signal に従わない場合も、ここで失敗とする（後から届いた応答は反映しない）
      c.abort()
      finish(false)
    }, limit)
    Promise.resolve()
      .then(() => probe({ signal: c.signal, target: probeTarget }))
      .then(
        () => finish(true),
        () => finish(false)
      )
    return true
  }, [cancelPending, commit, markReachable, probeFailed, source])
  React.useLayoutEffect(() => {
    runProbeRef.current = runProbe
  }, [runProbe])

  // ブラウザのオンラインの状態に合わせる（マウント、online / offline の通知、接続先の変更）
  const sync = React.useCallback(() => {
    if (!mounted.current) return
    const s = stateRef.current
    if (!source().get()) {
      cancelPending()
      commit({ status: "offline", reason: "browser", checking: false, nextCheckAt: null, attempt: 0, lostAt: s.lostAt ?? clock() })
      return
    }
    // オンラインの通知だけでは接続できたとしない。確認済みなら変えない。確認の要求中なら重ねない。
    if (s.status === "online" || ticketRef.current) return
    // 切断の後は connecting。最初の確認の前（切断を検出していない）は unknown のまま
    const status: ConnectivityStatus = s.lostAt === null && s.status === "unknown" ? "unknown" : optionsRef.current.probe ? "connecting" : "unknown"
    commit({ status, reason: null, attempt: 0, nextCheckAt: null })
    runProbe()
  }, [cancelPending, clock, commit, runProbe, source])

  React.useEffect(() => {
    mounted.current = true
    const src = source()
    sync()
    // sync は描画ごとに作り直さない（ref だけを使う）。接続先が変わった後の通知でも、最新の guard で確認を始める
    const unsubscribe = src.subscribe(sync)
    return () => {
      unsubscribe()
      mounted.current = false
      cancelPending()
      // 要求中の確認を止めた（StrictMode の仮のアンマウントの後に、もう一度確かめられるようにする）
      stateRef.current = { ...stateRef.current, checking: false, nextCheckAt: null }
    }
    // browserOnline の差し替えは想定しない（最初の値を使う）
  }, [cancelPending, source, sync])

  // 接続先の変更：前の接続先の状態、要求中の確認、予定した確認を捨て、unknown から確かめ直す
  React.useEffect(() => {
    if (stateRef.current.target === target) return
    cancelPending()
    stateRef.current = connectivityFor(target, null)
    setState(stateRef.current)
    sync()
  }, [target, cancelPending, sync])

  const check = React.useCallback(() => {
    if (!mounted.current || !source().get() || !optionsRef.current.probe) return false
    const s = stateRef.current
    commit({ attempt: 0, ...(s.status === "offline" ? { status: "connecting" as const, reason: null } : {}) })
    return runProbe()
  }, [commit, runProbe, source])

  const reportFailure = React.useCallback(
    (context?: { target?: string }) => {
      if (!mounted.current || !source().get() || !sameTarget(context)) return
      const s = stateRef.current
      const lostAt = s.lostAt ?? clock()
      // 確認の要求中、自動の確認を予定している間、上限に達した後は、重ねて確認しない。
      // 失敗の時刻は記録する（最初の確認の間に業務の要求が失敗した場合も、確認できた後に lastOutage で再取得できるようにする）
      if (ticketRef.current || s.status === "connecting" || s.status === "offline") {
        if (s.lostAt === null) commit({ lostAt })
        return
      }
      if (!optionsRef.current.probe) {
        // 疎通の確認がない：次の要求の成功（reportReachable）まで、確認していない状態にする
        commit({ status: "unknown", reason: null, attempt: 0, nextCheckAt: null, lostAt })
        return
      }
      commit({ status: "connecting", reason: null, lostAt, attempt: 0 })
      runProbe()
    },
    [clock, commit, runProbe, sameTarget, source]
  )

  const reportReachable = React.useCallback(
    (context?: { target?: string }) => {
      // ブラウザが offline の間は反映しない（navigator.onLine が false の場合は、確実に接続していない）
      if (!mounted.current || !source().get() || !sameTarget(context)) return
      const s = stateRef.current
      if (s.status === "online" && !ticketRef.current) return
      // 製品の要求の応答が届いた：要求中の疎通の確認と、予定した確認を止めて online にする
      cancelPending()
      markReachable("request")
    },
    [cancelPending, markReachable, sameTarget, source]
  )

  // 接続先が変わった描画では、effect の前でも、前の接続先の状態を示さない
  const view = state.target === target ? state : connectivityFor(target, null)
  return { ...view, check, reportFailure, reportReachable }
}

// ---------------------------------------------------------------- hook：表示と読み上げの安定

const isImmediateIssue = (issue: { id: string }) => (issue as { immediate?: unknown }).immediate === true

/**
 * 問題の表示を安定させる。接続と切断を短時間に繰り返す場合に、Banner の表示と読み上げを繰り返さない。判定は advanceStableIssues。
 * - 問題は、showDelay の間続いてから表示する（短時間で自然に解消した失敗は表示しない）。
 *   途中で消えても、hideDelay より短い間に再び現れた場合は、続いているものとして扱う。
 * - immediate の問題（immediate で判定する。既定は issue.immediate === true）は遅らせない。同じ描画から表示する。
 * - 表示した問題が消えたら、hideDelay の間は表示を残し（settlingIds）、その間に再び現れなければ表示をやめる。
 *   残している間の内容は、最後に受け取った内容。製品は settlingIds の問題を「接続を確かめている」などの文に置き換えてよい。
 *   SystemBanner に settlingIds を渡すと、残している問題を読み上げない。
 * - scopeKey（アカウント、ワークスペースなど）が変わったら、同じ描画から前のスコープの問題を示さない（残している問題も含む）。
 *   障害の情報に機密性がある場合は、scopeKey を必ず渡す。
 * - 最初の描画（SSR を含む）は immediate の問題だけ。時刻は effect の中で読む。
 * 安全性に必要な操作の制限には、この値ではなく、元の状態（useConnectivity の status など）を使う。
 */
function useStableIssues<T extends { id: string }>(
  issues: readonly T[],
  {
    showDelay = 1000,
    hideDelay = 2000,
    now = Date.now,
    scopeKey,
    immediate = isImmediateIssue,
  }: { showDelay?: number; hideDelay?: number; now?: () => number; scopeKey?: string; immediate?: (issue: T) => boolean } = {}
): { issues: T[]; settlingIds: string[] } {
  const machine = React.useRef<StableIssuesState | null>(null)
  // 最後に受け取った内容（スコープごと）。表示をやめるまでの間（hideDelay）は、消えた問題の最後の内容を示す。
  const lastItems = React.useRef<{ scope: string | undefined; items: Map<string, T> }>({ scope: scopeKey, items: new Map() })
  const [result, setResult] = React.useState<{ scope: string | undefined; visible: string[]; settling: string[] }>({ scope: scopeKey, visible: [], settling: [] })
  const [tick, setTick] = React.useState(0)
  const clock = React.useRef(now)
  const immediateRef = React.useRef(immediate)
  React.useEffect(() => {
    clock.current = now
    immediateRef.current = immediate
  })
  const flags = issues.map((i) => ({ id: i.id, immediate: immediate(i) }))
  // 内容（文）の変化では時間の判定をやり直さない。問題の集合（ID）と immediate の変化だけで判定する。
  const idKey = flags.map((f) => `${f.immediate ? "!" : ""}${f.id}`).join("\n")

  // 内容を記録する（毎回の commit）
  React.useEffect(() => {
    if (lastItems.current.scope !== scopeKey) lastItems.current = { scope: scopeKey, items: new Map() }
    for (const item of issues) lastItems.current.items.set(item.id, item)
  })

  React.useEffect(() => {
    const present = idKey === "" ? [] : idKey.split("\n").map((k) => (k.startsWith("!") ? { id: k.slice(1), immediate: true } : { id: k, immediate: false }))
    const t = clock.current()
    const next = advanceStableIssues(machine.current, { scope: scopeKey, present, now: t, showDelay, hideDelay })
    machine.current = next.state
    // 表示をやめた問題の内容を消す
    const items = lastItems.current.items
    for (const id of [...items.keys()]) if (!(id in next.state.entries)) items.delete(id)
    setResult((prev) =>
      prev.scope === scopeKey && same(prev.visible, next.visible) && same(prev.settling, next.settling)
        ? prev
        : { scope: scopeKey, visible: next.visible, settling: next.settling }
    )
    if (next.nextAt === null) return
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(0, next.nextAt - t))
    return () => clearTimeout(timer)
  }, [idKey, tick, showDelay, hideDelay, scopeKey])

  // 描画：前のスコープの結果は使わない。immediate の問題は、判定（effect）の前でも示す。
  const own = result.scope === scopeKey
  const current = new Map(issues.map((i) => [i.id, i]))
  // 表示していた問題が消えた描画では、判定（effect）の前でも表示を残す（消えた直後の 1 回の描画で表示が途切れないようにする）
  const settlingIds = own ? result.visible.filter((id) => !current.has(id)) : []
  const shownIds = new Set(own ? result.visible : [])
  const presentIds = flags.filter((f) => f.immediate || shownIds.has(f.id)).map((f) => f.id)
  const items = lastItems.current.scope === scopeKey ? lastItems.current.items : null
  const visible = [...new Set(presentIds)].flatMap((id) => {
    const item = current.get(id)
    return item ? [item] : []
  })
  for (const id of settlingIds) {
    const item = items?.get(id)
    if (item) visible.push(item)
  }
  return { issues: visible, settlingIds: settlingIds.filter((id) => items?.has(id)) }
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i])

export { useConnectivity, useStableIssues }
export type { BrowserOnlineSource, ConnectivityOptions, ConnectivityState }

