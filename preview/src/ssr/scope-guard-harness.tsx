import { StrictMode, Suspense, startTransition, useEffect, useState, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

import { useScopeGuard, type ScopeGuard, type ScopeSnapshot, type ScopeTicket } from "@/patterns/scope-guard"

// useScopeGuard の検品用の画面（preview/tests/system-account-scope-guard.spec.ts）。画面には置かない。
// preview/ssr.html の client のスクリプトを、このファイルに置き換えて開く。StrictMode で描画する。
// 検品は window.__sg の関数で、スコープの変更、処理の開始、照合、アンマウントを行う。

type Registry = {
  tickets: Map<number, ScopeTicket>
  snapshots: Map<number, ScopeSnapshot>
  guards: Map<string, ScopeGuard>
  next: number
}

const registry: Registry = { tickets: new Map(), snapshots: new Map(), guards: new Map(), next: 1 }
const never = new Promise<never>(() => undefined)

declare global {
  interface Window {
    __sg: ReturnType<typeof createApi>
    __sgReady: boolean
  }
}

let setScopeState: (scope: string) => void = () => undefined
let setMountedState: (mounted: boolean) => void = () => undefined

function createApi() {
  const guard = (name = "a") => {
    const g = registry.guards.get(name)
    if (!g) throw new Error(`guard ${name} is not mounted`)
    return g
  }
  const ticket = (id: number) => registry.tickets.get(id)!
  const keep = (t: ScopeTicket | null) => {
    if (!t) return null
    const id = registry.next++
    registry.tickets.set(id, t)
    return id
  }
  return {
    /** スコープを変える（urgent な更新） */
    setScope: (scope: string) => setScopeState(scope),
    /** スコープを、描画が中断される transition で変える（新しいスコープの描画は suspend して commit されない） */
    setScopeSuspended: (scope: string) => startTransition(() => setScopeState(`suspend:${scope}`)),
    setMounted: (mounted: boolean) => setMountedState(mounted),
    /** 現在の描画で hook が返した値（古い画面の closure の再現に使う） */
    guardOf: (name = "a") => guard(name),
    scope: (name = "a") => guard(name).scope,
    begin: (key?: string, name = "a") => keep(guard(name).begin(key)),
    capture: (name = "a") => {
      const id = registry.next++
      registry.snapshots.set(id, guard(name).capture())
      return id
    },
    beginIfCurrent: (snapshotId: number, key?: string, name = "a") => keep(guard(name).beginIfCurrent(registry.snapshots.get(snapshotId)!, key)),
    isCurrentSnapshot: (snapshotId: number, name = "a") => guard(name).isCurrent(registry.snapshots.get(snapshotId)!),
    isCurrent: (id: number, name = "a") => guard(name).isCurrent(ticket(id)),
    isLatest: (id: number, name = "a") => guard(name).isLatest(ticket(id)),
    isSameScope: (id: number, name = "a") => guard(name).isSameScope(ticket(id)),
    release: (id: number, name = "a") => guard(name).release(ticket(id)),
    aborted: (id: number) => ticket(id).signal.aborted,
    generation: (id: number) => ticket(id).generation,
    /** 描画の中で照合した結果（描画の中の isSameScope。前のスコープの状態を表示しないための照合） */
    rendered: () => document.querySelector("[data-testid=sg-rendered]")?.textContent ?? "",
    /** 描画の中で照合する Ticket を指定する */
    watch: (id: number | null) => setWatchState(id),
  }
}

let setWatchState: (id: number | null) => void = () => undefined

function Probe({ name, scope, watch }: { name: string; scope: string; watch: number | null }) {
  const guard = useScopeGuard(scope)
  // 描画の中で、指定した Ticket が現在のスコープのものかを照合する（StrictMode の 2 回の描画でも同じ結果）
  const watched = watch !== null ? registry.tickets.get(watch) : undefined
  const sameScope = watched ? guard.isSameScope(watched) : null
  useEffect(() => {
    registry.guards.set(name, guard)
    return () => {
      if (registry.guards.get(name) === guard) registry.guards.delete(name)
    }
  }, [guard, name])
  return name === "a" ? (
    <p data-testid="sg-rendered" data-scope={scope}>
      {sameScope === null ? "none" : String(sameScope)}
    </p>
  ) : null
}

/** suspend: で始まるスコープでは、描画を止める（transition の描画を commit させない） */
function Gate({ scope, children }: { scope: string; children: ReactNode }) {
  if (scope.startsWith("suspend:")) throw never
  return <>{children}</>
}

function Harness() {
  const [scope, setScope] = useState("A")
  const [mounted, setMounted] = useState(true)
  const [watch, setWatch] = useState<number | null>(null)
  setScopeState = setScope
  setMountedState = setMounted
  setWatchState = setWatch
  const actual = scope.startsWith("suspend:") ? scope.slice("suspend:".length) : scope
  return (
    <main>
      <h1>Scope guard harness</h1>
      <Suspense fallback={<p>suspended</p>}>
        {mounted && (
          <>
            <Probe name="a" scope={actual} watch={watch} />
            <Probe name="b" scope={actual} watch={null} />
          </>
        )}
        <Gate scope={scope}>
          <p data-testid="sg-committed">{scope}</p>
        </Gate>
      </Suspense>
    </main>
  )
}

window.__sg = createApi()
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
)
window.__sgReady = true
