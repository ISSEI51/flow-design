// 共通の hook の検品用の画面（preview/tests/patterns-integration-hooks.spec.ts）。画面には置かない。
// preview/ssr.html の client のスクリプトを、このファイルに置き換えて開く。StrictMode で描画する。
// 確かめること（Patterns Integration Review の 6.3）：
// - commit されない描画（suspend して保留した transition）が、表示中のスコープの操作と状態に影響しないこと
// - 古い描画の関数（A → B → A の最初の A を含む）から、新しいスコープの操作を始めないこと
// - 新しいスコープの最初の commit で、前のスコープの値と状態を表示しないこと
// - commit から passive effect までの間に届いた古い結果を反映しないこと
// 要求は Deferred で保留し、window.__h の関数で解放する。hook の値は useEffect で記録する（commit された描画の値だけ）。
/* eslint-disable @typescript-eslint/no-explicit-any */
import { StrictMode, Suspense, startTransition, useEffect, useLayoutEffect, useState, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

import { useBulkAction, useBulkSelection } from "@/patterns/bulk-selection"
import { useNotificationFeed } from "@/patterns/notification-feed"
import { useAutosave, useInstantSave } from "@/patterns/save-modes"
import { useFormState } from "@/patterns/form-state"


type Call = { id: number; kind: string; scope: string; payload?: unknown; done: boolean; aborted: () => boolean; resolve: (v: unknown) => void; reject: (e: unknown) => void }
const calls: Call[] = []
let nextId = 1
function deferred(kind: string, scope: string, signal?: AbortSignal, payload?: unknown) {
  return new Promise<any>((resolve, reject) => {
    calls.push({ id: nextId++, kind, scope, payload, done: false, aborted: () => signal?.aborted ?? false, resolve, reject })
  })
}
const log: unknown[] = []
const hooks: Record<string, any> = {}
const kept = new Map<string, Record<string, any>>()

let setScopeState: (s: string) => void = () => undefined
let setTextState: (f: (t: Record<string, string>) => Record<string, string>) => void = () => undefined
let setQState: (s: string) => void = () => undefined
let setServerState: (f: (t: Record<string, boolean>) => Record<string, boolean>) => void = () => undefined

function BulkProbe({ scope }: { scope: string }) {
  const b = useBulkAction<unknown, unknown>({
    scopeKey: scope,
    run: (target, { signal }) => deferred("bulk", scope, signal, target),
    onSettled: (s) => log.push({ kind: "bulk-settled", scope, s: s.succeeded.length }),
  })
  useEffect(() => {
    hooks.bulk = b
  })
  return <pre data-testid="bulk">{JSON.stringify({ scope, running: Boolean(b.running), summary: b.summary ? b.summary.succeeded.length : null })}</pre>
}

function FeedProbe({ scope }: { scope: string }) {
  const f = useNotificationFeed<{ id: string; title: string; read: boolean; createdAt: number }>({
    scopeKey: scope,
    fetcher: async () => ({ items: [{ id: `${scope}-n1`, title: `${scope} の通知`, read: false, createdAt: Date.UTC(2026, 0, 1) }], unreadCount: 1, hasMore: false }),
    updateRead: (ids, _read, { signal }) => {
      log.push({ kind: "updateRead-called", closureScope: scope, ids })
      return deferred("read", scope, signal, ids)
    },
  })
  useEffect(() => {
    hooks.feed = f
  })
  return <pre data-testid="feed">{JSON.stringify({ scope, items: f.items.map((n) => n.id), canOperate: f.canOperate })}</pre>
}

function AutosaveProbe({ scope, value }: { scope: string; value: string }) {
  const a = useAutosave<string>({
    value,
    scopeKey: scope,
    delayMs: 600000,
    save: (v, { signal }) => {
      log.push({ kind: "autosave-called", closureScope: scope, value: v })
      return deferred("autosave", scope, signal, v)
    },
  })
  useEffect(() => {
    hooks.autosave = a
  })
  return <pre data-testid="autosave">{JSON.stringify({ scope, value, status: a.status })}</pre>
}

function InstantProbe({ scope, server }: { scope: string; server: boolean }) {
  const s = useInstantSave<boolean>({
    value: server,
    scopeKey: scope,
    save: (next, { signal }) => {
      log.push({ kind: "instant-save-called", closureScope: scope, next })
      return deferred("instant", scope, signal, next)
    },
    verify: ({ signal }) => {
      log.push({ kind: "instant-verify-called", closureScope: scope })
      return deferred("instant-verify", scope, signal)
    },
  })
  useLayoutEffect(() => {
    log.push({ kind: "instant-commit", scope, value: s.value, status: s.status })
  })
  useEffect(() => {
    hooks.instant = s
  })
  return <pre data-testid="instant">{JSON.stringify({ scope, value: s.value, status: s.status })}</pre>
}

function FormProbe({ scope }: { scope: string }) {
  const form = useFormState<{ name: string }>({ initialValues: { name: `${scope}-name` }, fields: { name: { label: "名前" } }, scopeKey: scope })
  // product pattern: load the new record's values on scope change
  useEffect(() => {
    if (form.values.name.split("-")[0] !== scope) form.reset({ name: `${scope}-name` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])
  const submit = form.handleSubmit((values) => {
    log.push({ kind: "form-save-called", closureScope: scope, values })
    return deferred("form", scope, undefined, values)
  }, { onSuccess: (saved) => log.push({ kind: "form-onSuccess", renderScope: scope, saved }) })
  useLayoutEffect(() => {
    log.push({ kind: "form-commit", scope, name: form.values.name, status: form.status, formError: form.formError, submitted: form.submittedValues })
  })
  useEffect(() => {
    hooks.form = { ...form, submit }
  })
  return <pre data-testid="form">{JSON.stringify({ scope, name: form.values.name, status: form.status, formError: form.formError })}</pre>
}

function SelectionProbe({ scope, q }: { scope: string; q: string }) {
  const s = useBulkSelection<string>({ queryKey: q, query: q, scopeKey: scope, visibleIds: ["r1", "r2"], total: 100 })
  useEffect(() => {
    hooks.selection = s
  })
  return <pre data-testid="selection">{JSON.stringify({ scope, q, mode: s.mode, count: s.count, selectedIds: s.selectedIds })}</pre>
}

function RaceResolver({ scope }: { scope: string }) {
  useLayoutEffect(() => {
    const arm = (window as any).__raceArm
    if (arm && arm.scope === scope) {
      ;(window as any).__raceArm = null
      log.push({ kind: "race-resolve-at-commit", scope })
      ;(window as any).__h.resolve(arm.id, arm.value)
    }
  }, [scope])
  return null
}

const never = new Promise<never>(() => undefined)
function Gate({ scope, children }: { scope: string; children: ReactNode }) {
  if (scope.startsWith("suspend:")) throw never
  return <>{children}</>
}

function Harness() {
  const [scope, setScope] = useState("A")
  const [texts, setTexts] = useState<Record<string, string>>({ A: "a0", B: "b0" })
  const [q, setQ] = useState("q1")
  setQState = setQ
  const [server, setServer] = useState<Record<string, boolean>>({ A: true, B: false })
  setScopeState = setScope
  setTextState = setTexts
  setServerState = setServer
  const actual = scope.startsWith("suspend:") ? scope.slice(8) : scope
  const which = new URLSearchParams(location.search).get("case") ?? "all"
  return (
    <Suspense fallback={<p>suspended</p>}>
      {(which === "all" || which === "bulk") && <BulkProbe scope={actual} />}
      {(which === "all" || which === "feed") && <FeedProbe scope={actual} />}
      {(which === "all" || which === "autosave") && <AutosaveProbe scope={actual} value={texts[actual] ?? ""} />}
      {(which === "all" || which === "instant") && <InstantProbe scope={actual} server={server[actual] ?? false} />}
      {(which === "all" || which === "form") && <FormProbe scope={actual} />}
      {which === "selection" && <SelectionProbe scope={actual} q={q.startsWith("suspend:") ? q.slice(8) : q} />}
      <RaceResolver scope={actual} />
      <Gate scope={q.startsWith("suspend:") ? q : scope}>
        <p data-testid="committed">{scope}</p>
      </Gate>
    </Suspense>
  )
}

const errors: Record<string, () => unknown> = {
  unknown: () => ({ outcome: "unknown" }),
  failed: () => ({ outcome: "failed" }),
  abort: () => new DOMException("aborted", "AbortError"),
}

;(window as any).__h = {
  setScope: (s: string) => setScopeState(s),
  setScopeTransition: (s: string) => startTransition(() => setScopeState(s)),
  setScopeSuspended: (s: string) => startTransition(() => setScopeState(`suspend:${s}`)),
  setQ: (v: string) => setQState(v),
  setQSuspended: (v: string) => startTransition(() => setQState(`suspend:${v}`)),
  setText: (scope: string, v: string) => setTextState((t) => ({ ...t, [scope]: v })),
  setServer: (scope: string, v: boolean) => setServerState((t) => ({ ...t, [scope]: v })),
  keep: (name: string) => void kept.set(name, { ...hooks }),
  hook: (name: string, from?: string) => (from ? kept.get(from)! : hooks)[name],
  calls: () => calls.map(({ id, kind, scope, payload, done, aborted }) => ({ id, kind, scope, payload, done, aborted: aborted() })),
  resolve: (id: number, v: unknown) => {
    const c = calls.find((x) => x.id === id)!
    c.done = true
    c.resolve(v)
  },
  reject: (id: number, kind: string) => {
    const c = calls.find((x) => x.id === id)!
    c.done = true
    c.reject(errors[kind]())
  },
  log: () => log,
  dom: (id: string) => document.querySelector(`[data-testid=${id}]`)?.textContent ?? null,
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
)
;(window as any).__ready = true
