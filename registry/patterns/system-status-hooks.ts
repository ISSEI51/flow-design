"use client"

import * as React from "react"

import { defaultRetryPolicy, retryDelay, type ConnectivityStatus, type OfflineReason, type RetryPolicy } from "./system-status"

// Flow Design System Status の hook（Patterns / System & Account / System States）
// 定義と判断基準は docs/web/patterns/system-states.md を参照。型と純粋な関数は system-status.ts。
//
// この部品が守ること
// - ブラウザのオンラインの状態（navigator.onLine）だけで、サービスに接続できるとは判断しない（useConnectivity）。
// - 疎通の確認を、間隔と上限を設けて自動で再試行する。古い確認の応答、アンマウントの後の応答を反映しない。
// - 接続と切断を短時間に繰り返す場合に、表示と読み上げを繰り返さない（useStableIssues）。
// - 描画の中で window、navigator、Date.now() を読まない（effect の中で読む）。
//
// この部品が持たないもの（製品の責務）
// - 疎通の確認の API、通信の処理、要求の再送、エラーの種類の判別。

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
  status: ConnectivityStatus
  /** offline の理由。online と connecting では null */
  reason: OfflineReason | null
  /** 現在の切断の間に失敗した疎通の確認の回数 */
  attempt: number
  /** 次の自動の確認の時刻。自動の確認を予定していない場合は null */
  nextCheckAt: number | null
  /** 疎通の確認の要求を送っている */
  checking: boolean
  /** 切断を検出した時刻。接続している間は null */
  lostAt: number | null
  /** 最後に疎通を確認できた時刻 */
  confirmedAt: number | null
  /** 直前の切断（回復したときに設定する）。seq は回復ごとに増える。再取得、保存の結果の確認、復旧の通知の判断に使う */
  lastOutage: { lostAt: number; restoredAt: number; seq: number } | null
}

type ConnectivityOptions = {
  /** サービスへの疎通の確認（軽い取得の要求など）。届いたら resolve、届かなければ reject。製品が渡す */
  probe: (context: { signal: AbortSignal }) => Promise<unknown>
  /** 自動の確認の間隔と上限 */
  retry?: Partial<RetryPolicy>
  /** 疎通の確認の待ち時間の上限（ms）。超えたら失敗として扱う（probe が signal に従わない場合も） */
  timeout?: number
  /** ブラウザのオンラインの状態。既定は navigator.onLine と window の online / offline。検品や模擬の処理で置き換える */
  browserOnline?: BrowserOnlineSource
  /** 現在の時刻（ms） */
  now?: () => number
}

const initialConnectivity: ConnectivityState = {
  status: "online",
  reason: null,
  attempt: 0,
  nextCheckAt: null,
  checking: false,
  lostAt: null,
  confirmedAt: null,
  lastOutage: null,
}

/**
 * サービスとの接続の状態を管理する。
 * - 最初の描画（SSR を含む）は online。要求の失敗（reportFailure）か、ブラウザの offline で切断として扱う。
 * - ブラウザが offline になったら、すぐに offline（browser）にする。疎通の確認と自動の確認を止める。
 * - ブラウザが online になったら connecting にし、疎通の確認が成功してから online にする（online の通知だけで接続できたとしない）。
 * - 疎通の確認に失敗したら、間隔を延ばしながら自動で確認する。上限に達したら offline（unreachable）にし、利用者の操作（check）を待つ。
 * - 古い確認の応答、アンマウントの後の応答は反映しない。
 * 返す値の check() は利用者の「再接続を試す」、reportFailure() は製品の要求が通信の失敗で終わったときに呼ぶ。
 */
function useConnectivity({ probe, retry, timeout = 8000, browserOnline, now = Date.now }: ConnectivityOptions) {
  const [state, setState] = React.useState<ConnectivityState>(initialConnectivity)
  const stateRef = React.useRef(state)
  const options = React.useRef({ probe, retry, timeout, browserOnline: browserOnline ?? null, now })
  options.current = { probe, retry, timeout, browserOnline: browserOnline ?? null, now }
  const seq = React.useRef(0)
  const controller = React.useRef<AbortController | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = React.useRef(false)

  const commit = React.useCallback((patch: Partial<ConnectivityState>) => {
    stateRef.current = { ...stateRef.current, ...patch }
    setState(stateRef.current)
  }, [])

  const cancelPending = React.useCallback(() => {
    seq.current++
    controller.current?.abort()
    controller.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const source = () => options.current.browserOnline ?? navigatorOnline

  const runProbe = React.useCallback(() => {
    if (!mounted.current) return
    cancelPending()
    if (!source().get()) return
    const my = seq.current
    const c = new AbortController()
    controller.current = c
    const { probe: p, timeout: limit, now: clock } = options.current
    commit({
      checking: true,
      nextCheckAt: null,
      status: stateRef.current.status === "online" ? "connecting" : stateRef.current.status,
      lostAt: stateRef.current.lostAt ?? clock(),
    })
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timed = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        c.abort()
        reject(new Error("timeout"))
      }, limit)
    })
    Promise.race([Promise.resolve().then(() => p({ signal: c.signal })), timed]).then(
      () => {
        clearTimeout(timeoutId)
        if (my !== seq.current || !mounted.current) return
        controller.current = null
        const t = options.current.now()
        const s = stateRef.current
        commit({
          status: "online",
          reason: null,
          attempt: 0,
          nextCheckAt: null,
          checking: false,
          lostAt: null,
          confirmedAt: t,
          lastOutage: s.lostAt !== null ? { lostAt: s.lostAt, restoredAt: t, seq: (s.lastOutage?.seq ?? 0) + 1 } : s.lastOutage,
        })
      },
      () => {
        clearTimeout(timeoutId)
        if (my !== seq.current || !mounted.current) return
        controller.current = null
        const policy = { ...defaultRetryPolicy, ...options.current.retry }
        const attempt = stateRef.current.attempt + 1
        if (attempt >= policy.maxAttempts) {
          commit({ status: "offline", reason: "unreachable", attempt, nextCheckAt: null, checking: false })
          return
        }
        const delay = retryDelay(attempt, policy)
        commit({ status: "connecting", reason: null, attempt, nextCheckAt: options.current.now() + delay, checking: false })
        timer.current = setTimeout(() => {
          timer.current = null
          runProbe()
        }, delay)
      }
    )
    // source は options.current から読むため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelPending, commit])

  React.useEffect(() => {
    mounted.current = true
    const src = source()
    const sync = () => {
      if (!src.get()) {
        cancelPending()
        const s = stateRef.current
        commit({ status: "offline", reason: "browser", checking: false, nextCheckAt: null, attempt: 0, lostAt: s.lostAt ?? options.current.now() })
        return
      }
      // オンラインの通知だけでは接続できたとしない。疎通を確かめる。
      if (stateRef.current.status !== "online") {
        commit({ status: "connecting", reason: null, attempt: 0 })
        runProbe()
      }
    }
    sync()
    const unsubscribe = src.subscribe(sync)
    return () => {
      unsubscribe()
      mounted.current = false
      cancelPending()
    }
    // browserOnline の差し替えは想定しない（最初の値を使う）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const check = React.useCallback(() => {
    if (!mounted.current || !source().get()) return
    commit({ attempt: 0, reason: stateRef.current.status === "offline" ? null : stateRef.current.reason, status: stateRef.current.status === "offline" ? "connecting" : stateRef.current.status })
    runProbe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, runProbe])

  const reportFailure = React.useCallback(() => {
    if (!mounted.current || !source().get()) return
    const s = stateRef.current
    // 確認中、自動の確認を予定している間、上限に達した後は、重ねて確認しない
    if (s.status !== "online" || s.checking) return
    commit({ status: "connecting", lostAt: s.lostAt ?? options.current.now(), attempt: 0 })
    runProbe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, runProbe])

  return { ...state, check, reportFailure }
}

// ---------------------------------------------------------------- hook：表示と読み上げの安定

/**
 * 問題の表示を安定させる。接続と切断を短時間に繰り返す場合に、Banner の表示と読み上げを繰り返さない。
 * - 問題は、showDelay の間続いてから表示する（短時間で自然に解消した失敗は表示しない）。
 *   途中で消えても、hideDelay より短い間に再び現れた場合は、続いているものとして扱う。
 * - 表示した問題が消えたら、hideDelay の間は表示を残し（settlingIds）、その間に再び現れなければ表示をやめる。
 *   残している間の内容は、最後に受け取った内容。製品は settlingIds の問題を「接続を確かめている」などの文に置き換えてよい。
 *   SystemBanner に settlingIds を渡すと、残している問題を読み上げない。
 * - 最初の描画（SSR を含む）は空。時刻は effect の中で読む。
 * 安全性に必要な操作の制限には、この値ではなく、元の状態（useConnectivity の status など）を使う。
 */
function useStableIssues<T extends { id: string }>(
  issues: readonly T[],
  { showDelay = 1000, hideDelay = 2000, now = Date.now }: { showDelay?: number; hideDelay?: number; now?: () => number } = {}
): { issues: T[]; settlingIds: string[] } {
  type Entry = { firstSeen: number; goneAt: number | null; shown: boolean }
  const entries = React.useRef(new Map<string, Entry>())
  // 最後に受け取った内容。表示をやめるまでの間（hideDelay）は、消えた問題の最後の内容を示す。
  const lastItems = React.useRef(new Map<string, T>())
  for (const item of issues) lastItems.current.set(item.id, item)
  const [visibleIds, setVisibleIds] = React.useState<string[]>([])
  const [tick, setTick] = React.useState(0)
  const clock = React.useRef(now)
  clock.current = now
  // 内容（文）の変化では時間の判定をやり直さない。問題の集合（ID）の変化だけで判定する。
  const idKey = issues.map((i) => i.id).join("\n")

  React.useEffect(() => {
    const t = clock.current()
    const m = entries.current
    const present = idKey === "" ? [] : idKey.split("\n")
    for (const id of present) {
      let e = m.get(id)
      if (!e || (e.goneAt !== null && t - e.goneAt >= hideDelay)) {
        e = { firstSeen: t, goneAt: null, shown: false }
        m.set(id, e)
      }
      e.goneAt = null
      if (!e.shown && t - e.firstSeen >= showDelay) e.shown = true
    }
    let next = Infinity
    for (const [id, e] of m) {
      if (present.includes(id)) {
        if (!e.shown) next = Math.min(next, e.firstSeen + showDelay)
        continue
      }
      e.goneAt ??= t
      if (t - e.goneAt >= hideDelay) {
        m.delete(id)
        lastItems.current.delete(id)
      } else next = Math.min(next, e.goneAt + hideDelay)
    }
    // 現在の問題を受け取った順に並べ、表示をやめる前の問題を後ろに置く
    const shown = [...present.filter((id) => m.get(id)?.shown), ...[...m.keys()].filter((id) => !present.includes(id) && m.get(id)!.shown)]
    setVisibleIds((prev) => (prev.length === shown.length && prev.every((p, i) => p === shown[i]) ? prev : shown))
    if (next === Infinity) return
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(0, next - t))
    return () => clearTimeout(timer)
  }, [idKey, tick, showDelay, hideDelay])

  const current = new Map(issues.map((i) => [i.id, i]))
  const settlingIds = visibleIds.filter((id) => !current.has(id))
  const visible = visibleIds.flatMap((id) => {
    const item = current.get(id) ?? lastItems.current.get(id)
    return item ? [item] : []
  })
  return { issues: visible, settlingIds }
}

export { useConnectivity, useStableIssues }
export type { BrowserOnlineSource, ConnectivityOptions, ConnectivityState }
