import { StrictMode, Suspense, startTransition, useEffect, useState, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

import { useInstantSettings, useSettingsForm, withVersion } from "@/patterns/setting-save"

// useInstantSettings と useSettingsForm（registry/patterns/setting-save.ts）の検品用の画面
// （preview/tests/system-account-settings-harness.spec.ts）。画面には置かない。
// preview/ssr.html の client のスクリプトを、このファイルに置き換えて開く。StrictMode で描画する。
// 保存と確認の要求は、検品が解放するまで保留する（Deferred）。応答の順序は、時間ではなく解放の順で決める。
// 検品は window.__ss の関数で、スコープの変更（描画が commit されない transition を含む）、操作、要求の解放を行う。
// 古い画面の関数（前のスコープの描画で hook が返した値）は keep(name) で保存し、from に name を渡して呼ぶ。

type Values = { x: boolean; y: string }
type FormValues = { name: string }
const initialValues: Values = { x: false, y: "a" }
const initialForm: FormValues = { name: "a" }

type CallKind = "save" | "many" | "verify" | "form" | "form-verify"
type Call = {
  id: number
  kind: CallKind
  scope: string
  key?: string
  value?: unknown
  ifMatch?: unknown
  signalAborted: () => boolean
  done: boolean
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

const calls: Call[] = []
let nextId = 1
const outcomes = new Map<number, unknown>()

function deferred(kind: CallKind, scope: string, signal: AbortSignal | undefined, log: { key?: string; value?: unknown; ifMatch?: unknown } = {}) {
  return new Promise<never>((resolve, reject) => {
    calls.push({ id: nextId++, kind, scope, ...log, signalAborted: () => signal?.aborted ?? false, done: false, resolve: resolve as (v: unknown) => void, reject })
  })
}

type InstantApi = ReturnType<typeof useInstantSettings<Values>>
type FormApi = ReturnType<typeof useSettingsForm<FormValues>>
type Hooks = { instant?: InstantApi; form?: FormApi }

// commit された描画で hook が返した値（useEffect で記録する。破棄された描画の値は記録しない）
const hooks: Hooks = {}
const kept = new Map<string, Hooks>()

const errors = {
  unknown: () => ({ outcome: "unknown" }),
  failed: () => ({ outcome: "failed" }),
  conflict: () => ({ code: "conflict" }),
  forbidden: () => ({ code: "forbidden" }),
  abort: () => new DOMException("aborted", "AbortError"),
}

let setScopeState: (scope: string) => void = () => undefined
let setVersionedState: (v: boolean) => void = () => undefined
let setAutoVerifyState: (v: boolean) => void = () => undefined

declare global {
  interface Window {
    __ss: ReturnType<typeof createApi>
    __ssReady: boolean
  }
}

function createApi() {
  const of = (from?: string): Hooks => {
    const h = from ? kept.get(from) : hooks
    if (!h) throw new Error(`hooks ${from} are not kept`)
    return h
  }
  const track = (p: Promise<unknown>) => {
    const id = nextId++
    void p.then((o) => outcomes.set(id, o))
    return id
  }
  const call = (id: number) => {
    const c = calls.find((x) => x.id === id)
    if (!c || c.done) throw new Error(`call ${id} is not pending`)
    c.done = true
    return c
  }
  return {
    /** スコープを変える（urgent な更新） */
    setScope: (scope: string) => setScopeState(scope),
    /** スコープを、描画が commit されない transition で変える（新しいスコープの描画は suspend し、画面は前のスコープのまま） */
    setScopeSuspended: (scope: string) => startTransition(() => setScopeState(`suspend:${scope}`)),
    setVersioned: (v: boolean) => setVersionedState(v),
    /** onSettled で結果が不明を受け取ったら、その描画の verify を呼ぶ（製品のコードの例：Notifications の通知の設定） */
    setAutoVerify: (v: boolean) => setAutoVerifyState(v),
    /** 現在の（commit された）描画の hook の値を、name で保存する（古い画面の closure の再現） */
    keep: (name: string) => void kept.set(name, { ...hooks }),
    change: (key: keyof Values, value: unknown, from?: string) => of(from).instant!.change(key, value as never),
    changeMany: (values: Partial<Values>, from?: string) =>
      track(of(from).instant!.changeMany(values, (v, { signal, ifMatch }) => deferred("many", document.body.dataset.scope ?? "", signal, { value: v, ifMatch }))),
    verify: (key: keyof Values, from?: string) => of(from).instant!.verify(key),
    replace: (values: Partial<Values>, versions?: Partial<Record<keyof Values, number>>, from?: string) => of(from).instant!.replace(values, versions),
    submit: (from?: string) => track(of(from).form!.submit()),
    setValue: (name: string, from?: string) => of(from).form!.setValue("name", name),
    discard: (from?: string) => of(from).form!.discard(),
    formVerify: (from?: string) => of(from).form!.verify(),
    outcome: (id: number) => (outcomes.has(id) ? outcomes.get(id) : null),
    calls: () => calls.map(({ id, kind, scope, key, value, ifMatch, done, signalAborted }) => ({ id, kind, scope, key, value, ifMatch, done, aborted: signalAborted() })),
    /** 要求に成功の応答を返す。version を渡すと withVersion(value, version) を返す */
    resolve: (id: number, value: unknown, version?: number) => call(id).resolve(version === undefined ? value : withVersion(value, version)),
    reject: (id: number, kind: keyof typeof errors) => call(id).reject(errors[kind]()),
    /** 現在の（commit された）描画の状態 */
    instant: () => {
      const s = hooks.instant!
      return { values: s.values, saved: s.saved, status: s.status, pending: s.pending }
    },
    form: () => {
      const f = hooks.form!
      return { values: f.values, status: f.status, saving: f.saving }
    },
  }
}

function InstantProbe({ scope, versioned, autoVerify }: { scope: string; versioned: boolean; autoVerify: boolean }) {
  const s: InstantApi = useInstantSettings<Values>({
    values: initialValues,
    scopeKey: scope,
    versions: versioned ? { x: 0, y: 0 } : undefined,
    save: (key, value, { signal, ifMatch }) => deferred("save", scope, signal, { key, value, ifMatch }),
    verify: (key, { signal }) => deferred("verify", scope, signal, { key }),
    // この描画の s の verify を呼ぶ（hook は、commit された描画の onSettled を使う必要がある）
    onSettled: (key, status) => {
      if (autoVerify && status.state === "unknown") s.verify(key)
    },
  })
  useEffect(() => {
    hooks.instant = s
  })
  return <pre data-testid="ss-instant">{JSON.stringify({ scope, values: s.values, status: s.status })}</pre>
}

function FormProbe({ scope }: { scope: string }) {
  const f = useSettingsForm<FormValues>({
    values: initialForm,
    scopeKey: scope,
    save: (values, { signal, ifMatch }) => deferred("form", scope, signal, { value: values, ifMatch }),
    verify: ({ signal }) => deferred("form-verify", scope, signal),
  })
  useEffect(() => {
    hooks.form = f
  })
  return <pre data-testid="ss-form">{JSON.stringify({ scope, status: f.status })}</pre>
}

const never = new Promise<never>(() => undefined)

/** suspend: で始まるスコープでは、描画を止める（transition の描画を commit させない） */
function Gate({ scope, children }: { scope: string; children: ReactNode }) {
  if (scope.startsWith("suspend:")) throw never
  return <>{children}</>
}

function Harness() {
  const [scope, setScope] = useState("A")
  const [versioned, setVersioned] = useState(false)
  const [autoVerify, setAutoVerify] = useState(false)
  setScopeState = setScope
  setVersionedState = setVersioned
  setAutoVerifyState = setAutoVerify
  const actual = scope.startsWith("suspend:") ? scope.slice("suspend:".length) : scope
  useEffect(() => {
    document.body.dataset.scope = actual
  })
  return (
    <main>
      <h1>Setting save harness</h1>
      <Suspense fallback={<p>suspended</p>}>
        <InstantProbe key={String(versioned)} scope={actual} versioned={versioned} autoVerify={autoVerify} />
        <FormProbe scope={actual} />
        <Gate scope={scope}>
          <p data-testid="ss-committed">{scope}</p>
        </Gate>
      </Suspense>
    </main>
  )
}

window.__ss = createApi()
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
)
window.__ssReady = true
