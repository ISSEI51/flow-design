// useAccess（registry/patterns/access.ts）の検品用の部品。画面には置かない。
// 検品（preview/tests/system-account-permission.spec.ts）が、ブラウザの中で動的に import し、別の React の root に描画する。
// 取得の処理は Deferred Promise（応答の保留と解放）で、応答の順序を検品から制御する（固定の応答時間に依存しない）。
// commit ごとの状態（layout effect の時点）を記録し、「条件が変わった最初の commit で操作を許可しない」ことを確かめる。

import { memo, startTransition, StrictMode, use, useLayoutEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"

import { decideAccess, useAccess, type AccessResult } from "@/patterns/access"

type Grants = { scope: string; permissions: string[]; features: string[] }

/** 送られた取得の要求。検品が resolve / reject を呼ぶ */
export type ProbeRequest = {
  id: number
  scopeKey: string
  aborted: boolean
  resolve: (grants: Grants) => void
  reject: (error?: unknown) => void
}

/** commit ごとの記録 */
export type ProbeRecord = {
  scopeKey: string
  revision: number
  enabled: boolean
  status: string
  verified: boolean
  grantsScope: string | null
  permissions: string | null
  /** decideAccess(access, { permissions: ["x"] }).allowed */
  allowed: boolean
}

export type AccessProbe = {
  records: ProbeRecord[]
  requests: ProbeRequest[]
  /** 条件を変え、その描画を同期的に commit する（効果は commit の後に走る） */
  set: (next: Partial<{ scopeKey: string; revision: number; enabled: boolean }>) => void
  /** useAccess の reload を呼び、その描画を同期的に commit する */
  reload: () => void
  /** reload を呼んだ直後（commit の前）の latest() の判断 */
  reloadAndDecideLatest: () => boolean
  /** latest() で decideAccess した結果 */
  decideLatest: () => boolean
  /** 応答の処理と描画が進むのを待つ */
  settle: () => Promise<void>
  unmount: () => void
}

const settle = () => new Promise<void>((resolve) => setTimeout(() => setTimeout(resolve, 0), 0))

export function mountAccessProbe(initial: { scopeKey: string; revision?: number; enabled?: boolean }): AccessProbe {
  const records: ProbeRecord[] = []
  const requests: ProbeRequest[] = []
  let setProps: (next: { scopeKey: string; revision: number; enabled: boolean }) => void = () => {}
  let props = { scopeKey: initial.scopeKey, revision: initial.revision ?? 0, enabled: initial.enabled ?? true }
  let current: AccessResult<string, string, Grants> | null = null

  const fetcher = ({ scopeKey, signal }: { scopeKey: string; signal: AbortSignal }) =>
    new Promise<Grants>((resolve, reject) => {
      const request: ProbeRequest = { id: requests.length, scopeKey, aborted: signal.aborted, resolve, reject: (e) => reject(e ?? new Error("failed")) }
      // AbortSignal に従わない取得の処理：中止されても応答を返せる（検品が resolve を呼ぶ）
      signal.addEventListener("abort", () => (request.aborted = true), { once: true })
      requests.push(request)
    })

  function Probe() {
    const [p, setP] = useState(props)
    setProps = setP
    const access = useAccess<string, string, Grants>({ scopeKey: p.scopeKey, revision: p.revision, enabled: p.enabled, fetcher })
    current = access
    const allowed = decideAccess(access, { permissions: ["x"] }).allowed
    useLayoutEffect(() => {
      records.push({
        scopeKey: p.scopeKey,
        revision: p.revision,
        enabled: p.enabled,
        status: access.status,
        verified: access.verified,
        grantsScope: access.grants?.scope ?? null,
        permissions: access.grants ? access.grants.permissions.join(",") : null,
        allowed,
      })
    })
    return null
  }

  const el = document.createElement("div")
  document.body.append(el)
  const root = createRoot(el)
  flushSync(() =>
    root.render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    ),
  )
  return {
    records,
    requests,
    set: (next) => {
      props = { ...props, ...next }
      flushSync(() => setProps(props))
    },
    reload: () => flushSync(() => current!.reload()),
    reloadAndDecideLatest: () => {
      current!.reload()
      return decideAccess(current!.latest(), { permissions: ["x"] }).allowed
    },
    decideLatest: () => decideAccess(current!.latest(), { permissions: ["x"] }).allowed,
    settle,
    unmount: () => {
      root.unmount()
      el.remove()
    },
  }
}

// ---------------------------------------------------------------- 破棄された描画（Concurrent Rendering）の検品
// 親が scopeKey を持ち、useAccess を使う子は memo で包む（props が同じなら描画しない）。隣の部品が新しいスコープの描画で
// Suspend するため、Transition で始めた新しいスコープの描画は commit されない。その後でスコープを元に戻すと、
// 子は props が commit 済みの値と同じため描画されず、新しいスコープの描画は破棄される。

export type AccessTransitionProbe = {
  requests: ProbeRequest[]
  /** Transition で scopeKey を変える（新しいスコープの描画は Suspend して commit されない） */
  startScopeTransition: (scopeKey: string) => void
  /** scopeKey を同期的に変え、commit する */
  setScope: (scopeKey: string) => void
  /** 画面に表示しているスコープ（commit 済み） */
  shownScope: () => string | null
  /** latest() で decideAccess した結果と、latest() の status */
  decideLatest: () => { allowed: boolean; status: string }
  settle: () => Promise<void>
  unmount: () => void
}

export function mountAccessTransitionProbe(initial: { scopeKey: string; suspendScope: string }): AccessTransitionProbe {
  const requests: ProbeRequest[] = []
  let current: AccessResult<string, string, Grants> | null = null
  let shown: string | null = null
  let setScopeState: (scopeKey: string) => void = () => {}
  // 解決しない Promise：suspendScope の描画を commit させない
  const never = new Promise<never>(() => {})

  const fetcher = ({ scopeKey, signal }: { scopeKey: string; signal: AbortSignal }) =>
    new Promise<Grants>((resolve, reject) => {
      const request: ProbeRequest = { id: requests.length, scopeKey, aborted: signal.aborted, resolve, reject: (e) => reject(e ?? new Error("failed")) }
      signal.addEventListener("abort", () => (request.aborted = true), { once: true })
      requests.push(request)
    })

  const Child = memo(function Child({ scopeKey }: { scopeKey: string }) {
    const access = useAccess<string, string, Grants>({ scopeKey, fetcher })
    current = access
    useLayoutEffect(() => {
      shown = scopeKey
    })
    return null
  })
  function Suspender({ scopeKey }: { scopeKey: string }) {
    if (scopeKey === initial.suspendScope) use(never)
    return null
  }
  function Parent() {
    const [scopeKey, setScopeKey] = useState(initial.scopeKey)
    setScopeState = setScopeKey
    return (
      <>
        <Child scopeKey={scopeKey} />
        <Suspender scopeKey={scopeKey} />
      </>
    )
  }

  const el = document.createElement("div")
  document.body.append(el)
  const root = createRoot(el)
  flushSync(() =>
    root.render(
      <StrictMode>
        <Parent />
      </StrictMode>,
    ),
  )
  return {
    requests,
    startScopeTransition: (scopeKey) => startTransition(() => setScopeState(scopeKey)),
    setScope: (scopeKey) => flushSync(() => setScopeState(scopeKey)),
    shownScope: () => shown,
    decideLatest: () => {
      const latest = current!.latest()
      return { allowed: decideAccess(latest, { permissions: ["x"] }).allowed, status: latest.status }
    },
    settle,
    unmount: () => {
      root.unmount()
      el.remove()
    },
  }
}

declare global {
  interface Window {
    __fdSaAccessProbe?: AccessProbe
    __fdSaAccessTransitionProbe?: AccessTransitionProbe
  }
}
