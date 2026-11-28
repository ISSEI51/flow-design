import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger, ComboboxValue } from "@/components/ui/combobox"
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { ConfirmActionDialog, useUndoableAction, type UndoHandle } from "@/patterns/confirm-action"
import { FormSaveError, submitOnEnter, useFormState, type FormFields, type FormSaveResult } from "@/patterns/form-state"
import { useAutosave, useInstantSave } from "@/patterns/save-modes"
import { UnsavedChangesProvider, useNavigationGuard, useUnsavedChanges } from "@/patterns/unsaved-changes"

// Forms & Workflows の検品用の画面（上部の一覧には表示しない）。境界の条件を、ボタンと window.__fdFormsChecks で再現する。
// 実際の API は使わない。遅延と結果は、この画面の中で決める。
//   #/forms-checks?case=async    非同期の検証（依存する値、A→B→A、中止を無視する検証、非表示、reset、同期の例外、スコープ）
//   #/forms-checks?case=submit   Enter による送信（Input、Textarea、Select、Combobox、日付、ボタン、別の Dialog、止めた Enter、押し続け）
//   #/forms-checks?case=scope    保存、即時保存、自動保存、Undo、確認の Dialog の古い結果とスコープ
//   #/forms-checks?case=unsaved  保存して移動（一部の失敗、保存中の入力）、移動の失敗の後の保護、新しい変更、
//                                確認の表示中の対象の消滅、cancelNavigation、releaseAll（認可の失効）、保存の結果が不明な単位
//   #/forms-checks?case=toast    Toast の mousedown のフォーカスの維持（通常の通知、Undo、入力欄を含む通知、モーダルの表示中）

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// 検品から操作する保留中の処理（キーごと）。resolve と reject を検品のコードから呼ぶ
const pending = new Map<string, Deferred<unknown>[]>()
function hold<T>(key: string) {
  const d = deferred<T>()
  pending.set(key, [...(pending.get(key) ?? []), d as Deferred<unknown>])
  return d.promise
}
const checks = {
  /** 保留中の処理の数 */
  count: (key: string) => pending.get(key)?.length ?? 0,
  /** index 番目（既定は最初）の保留中の処理を解決する */
  resolve: (key: string, value: unknown, index = 0) => {
    const list = pending.get(key) ?? []
    const [d] = list.splice(index, 1)
    d?.resolve(value)
  },
  reject: (key: string, error: unknown, index = 0) => {
    const list = pending.get(key) ?? []
    const [d] = list.splice(index, 1)
    d?.reject(error)
  },
  FormSaveError,
  calls: [] as { key: string; args: unknown }[],
  /** 非同期の検証で同期の例外を投げる */
  throwSync: false,
}
declare global {
  interface Window {
    __fdFormsChecks?: typeof checks
  }
}
if (typeof window !== "undefined") window.__fdFormsChecks = checks

const Out = ({ testId, value }: { testId: string; value: unknown }) => (
  <pre data-testid={testId} className="overflow-x-auto rounded-md bg-muted p-2 text-caption">
    {JSON.stringify(value)}
  </pre>
)

// ---------------------------------------------------------------- 非同期の検証
type AsyncValues = { org: string; code: string; showCode: boolean }
function AsyncCase() {
  const [scope, setScope] = useState("A")
  // 検証できなかった場合に保存を許すか（製品がサーバーでの検証を保証する場合だけ allow）
  const [allow, setAllow] = useState(false)
  const fields: FormFields<AsyncValues> = useMemo(
    () => ({
      org: { label: "組織", required: true },
      showCode: { label: "コードを表示" },
      code: {
        label: "コード",
        required: true,
        active: (v) => v.showCode,
        asyncDeps: (v) => v.org,
        asyncTimeoutMs: 3000,
        asyncFailure: allow ? "allow" : "block",
        validateAsync: (value, all) => {
          checks.calls.push({ key: "check", args: { value, org: all.org } })
          if (checks.throwSync) throw new Error("同期の例外")
          // 中止を無視する検証（signal を使わない）
          return hold<string | null>("check")
        },
      },
    }),
    [allow]
  )
  const form = useFormState<AsyncValues>({ initialValues: { org: "A", code: "", showCode: true }, fields, scopeKey: scope, asyncDebounceMs: 50 })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => form.setValue("org", form.values.org === "A" ? "B" : "A", { commit: true })} data-testid="toggle-org">
          組織を切り替える（{form.values.org}）
        </Button>
        <Button size="sm" variant="secondary" onClick={() => form.setValue("showCode", !form.values.showCode, { commit: true })} data-testid="toggle-show">
          コードの表示を切り替える
        </Button>
        <Button size="sm" variant="secondary" onClick={() => form.reset({ org: "A", code: "", showCode: true })} data-testid="reset">
          reset
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setScope((s) => (s === "A" ? "B" : "A"))} data-testid="toggle-scope">
          スコープを切り替える（{scope}）
        </Button>
        <Button size="sm" variant="secondary" onClick={() => form.revalidate("code")} data-testid="revalidate">
          確かめ直す
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAllow((a) => !a)} data-testid="toggle-allow">
          検証できない場合の保存（{allow ? "allow" : "block"}）
        </Button>
      </div>
      {form.isActive("code") && (
        <Field>
          <FieldLabel>コード</FieldLabel>
          <Input {...form.inputProps("code")} data-testid="code" />
        </Field>
      )}
      <Out testId="async-state" value={{ status: form.asyncStatus("code"), message: form.asyncMessage("code"), canSubmit: form.canSubmit, blockers: form.blockers.map((b) => b.kind) }} />
    </div>
  )
}

// ---------------------------------------------------------------- Enter による送信
type SubmitValues = { name: string; memo: string; kind: string | null; account: string | null; date: string; due: Date | null; other: string }
const accounts = [
  { value: "a1", label: "株式会社山田商事" },
  { value: "a2", label: "有限会社佐藤工業" },
]
function SubmitCase() {
  const [submits, setSubmits] = useState(0)
  const [dialog, setDialog] = useState(false)
  const [mode, setMode] = useState<"create" | "edit">("create")
  const fields: FormFields<SubmitValues> = useMemo(
    () => ({
      name: { label: "名前", required: true },
      memo: { label: "メモ" },
      kind: { label: "種類" },
      account: { label: "取引先" },
      date: { label: "日付" },
      due: { label: "期限" },
      other: { label: "その他" },
    }),
    []
  )
  const form = useFormState<SubmitValues>({
    initialValues: { name: mode === "edit" ? "山田" : "", memo: "", kind: null, account: null, date: "", due: null, other: "" },
    fields,
    requireChanges: mode === "edit",
  })
  const save = form.handleSubmit(async () => {
    setSubmits((n) => n + 1)
    return { status: "success" }
  })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" data-testid="mode-edit" onClick={() => (setMode("edit"), form.reset({ name: "山田", memo: "", kind: null, account: null, date: "", due: null, other: "" }))}>
          編集のフォームにする
        </Button>
      </div>
      <form noValidate onSubmit={(e) => void save(e)} onKeyDown={(e) => submitOnEnter(e, save)} data-testid="submit-form" className="flex flex-col gap-4">
        <Field>
          <FieldLabel>名前</FieldLabel>
          <Input {...form.inputProps("name")} data-testid="f-name" />
        </Field>
        <Field>
          <FieldLabel>メモ</FieldLabel>
          <Textarea {...form.inputProps("memo")} data-testid="f-memo" />
        </Field>
        <Field>
          <FieldLabel>種類</FieldLabel>
          <Select items={[{ value: "x", label: "法人" }, { value: "y", label: "個人" }]} value={form.values.kind} onValueChange={(v) => form.setValue("kind", v as string, { commit: true })}>
            <SelectTrigger data-testid="f-kind">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="x">法人</SelectItem>
              <SelectItem value="y">個人</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>取引先</FieldLabel>
          <Combobox items={accounts} value={accounts.find((a) => a.value === form.values.account) ?? null} onValueChange={(v) => form.setValue("account", (v as (typeof accounts)[number] | null)?.value ?? null, { commit: true })}>
            <ComboboxTrigger data-testid="f-account">
              <ComboboxValue placeholder="選択してください" />
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxInput placeholder="取引先名で検索" aria-label="取引先を検索" data-testid="f-account-input" />
              <ComboboxEmpty>一致する取引先がありません</ComboboxEmpty>
              <ComboboxList>{(item: (typeof accounts)[number]) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}</ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
        <Field>
          <FieldLabel>日付</FieldLabel>
          <Input type="date" value={form.values.date} onChange={(e) => form.setValue("date", e.target.value, { commit: true })} data-testid="f-date" />
        </Field>
        <Field>
          <FieldLabel htmlFor="f-datepicker">期限（Date Picker）</FieldLabel>
          {/* Components の DatePicker。文字の入力欄での Enter は日付の確定であり、送信ではない */}
          <DatePicker id="f-datepicker" value={form.values.due} onValueChange={(d) => form.setValue("due", d, { commit: true })} />
        </Field>
        <Field>
          <FieldLabel>Enter で送信しない入力欄</FieldLabel>
          <Input {...form.inputProps("other")} data-submit-on-enter="false" data-testid="f-other" />
        </Field>
        <Field>
          <FieldLabel>Enter を止める入力欄</FieldLabel>
          <Input
            data-testid="f-prevented"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault()
            }}
          />
        </Field>
        <Button type="button" variant="secondary" onClick={() => setDialog(true)} data-testid="open-dialog">
          別の操作を開く
        </Button>
        <Button type="submit" disabled={!form.canSubmit} focusableWhenDisabled data-testid="f-submit">
          保存する
        </Button>
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>別の操作</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Field>
                <FieldLabel>Dialog の中の入力欄</FieldLabel>
                <Input data-testid="f-dialog-input" />
              </Field>
            </DialogBody>
          </DialogContent>
        </Dialog>
      </form>
      <Out
        testId="submit-state"
        value={{
          submits,
          shownErrors: ["name"].filter((n) => form.error(n as keyof SubmitValues) !== null),
          canSubmit: form.canSubmit,
          unchanged: form.unchanged,
          due: form.values.due ? [form.values.due.getFullYear(), form.values.due.getMonth() + 1, form.values.due.getDate()].join("-") : null,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- スコープと古い結果
type One = { value: string; hidden: string; show: boolean }
function ScopeCase() {
  const [scope, setScope] = useState("A")
  const [mounted, setMounted] = useState(true)
  const [undoMounted, setUndoMounted] = useState(true)
  const [log, setLog] = useState<string[]>([])
  const add = (s: string) => setLog((l) => [...l, s])
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setScope((s) => (s === "A" ? "B" : "A"))} data-testid="scope-toggle">
          スコープを切り替える（{scope}）
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setMounted((m) => !m)} data-testid="mount-toggle">
          フォームを{mounted ? "外す" : "戻す"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setUndoMounted((m) => !m)} data-testid="undo-mount-toggle">
          Undo の部品を{undoMounted ? "外す" : "戻す"}
        </Button>
      </div>
      {mounted && <ScopeForm scope={scope} onEvent={add} />}
      <InstantCase scope={scope} />
      <AutosaveCase scope={scope} />
      {undoMounted && <UndoCase scope={scope} />}
      <ConfirmCase />
      <ExternalConfirmCase />
      <Out testId="scope-log" value={log} />
    </div>
  )
}

function ScopeForm({ scope, onEvent }: { scope: string; onEvent: (s: string) => void }) {
  const fields: FormFields<One> = useMemo(
    () => ({ value: { label: "値", required: true }, hidden: { label: "非表示の値", active: (v) => v.show }, show: { label: "表示" } }),
    []
  )
  const form = useFormState<One>({ initialValues: { value: "", hidden: "前の値", show: false }, fields, scopeKey: scope })
  const save = form.handleSubmit(
    async (v) => {
      checks.calls.push({ key: "save", args: v })
      return (await hold<FormSaveResult<One>>("save")) as FormSaveResult<One>
    },
    { onSuccess: (_s, info) => onEvent(`success:${info.changedWhileSaving}`) }
  )
  return (
    <div className="flex flex-col gap-2" data-testid="scope-form">
      <Input {...form.inputProps("value")} data-testid="s-value" />
      <Input {...form.inputProps("hidden")} data-testid="s-hidden" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save().then((ok) => onEvent(`saved:${ok}`))} data-testid="s-save">
          保存する
        </Button>
        <Button size="sm" variant="secondary" onClick={() => form.setValue("show", !form.values.show, { commit: true })} data-testid="s-toggle-hidden">
          非表示の項目を切り替える
        </Button>
        <Button size="sm" variant="secondary" onClick={() => form.reset({ value: "別のレコード", hidden: "", show: false })} data-testid="s-reset">
          別のレコードに reset
        </Button>
        <Button size="sm" variant="secondary" onClick={() => form.resolveUnknown({ saved: false })} data-testid="s-not-saved">
          保存されていなかった
        </Button>
        <Button size="sm" variant="secondary" onClick={() => form.resolveUnknown({ saved: true })} data-testid="s-was-saved">
          保存されていた
        </Button>
        <Button size="sm" variant="secondary" onClick={() => form.clearFormError()} data-testid="s-clear-error">
          エラーの文を消す
        </Button>
      </div>
      <Out
        testId="scope-form-state"
        value={{ status: form.status, values: form.values, baseline: form.baseline, dirty: form.isDirty, canSubmit: form.canSubmit, formError: form.formError, submitted: form.submittedValues }}
      />
    </div>
  )
}

function InstantCase({ scope }: { scope: string }) {
  const [saved, setSaved] = useState(false)
  const s = useInstantSave<boolean>({
    value: saved,
    scopeKey: scope,
    // 製品の保存の処理も、中止（スコープの変更）の後に自分の状態を変えない
    save: async (next, { signal }) => {
      await hold<void>("instant")
      if (!signal.aborted) setSaved(next)
    },
    verify: () => hold<boolean>("verify"),
  })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => s.change(!s.value)} data-testid="i-toggle">
        即時保存を切り替える
      </Button>
      <Button size="sm" variant="secondary" onClick={() => void s.check()} data-testid="i-check">
        確かめる
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setSaved((v) => !v)} data-testid="i-server-change">
        サーバーの値が変わる（再取得）
      </Button>
      <Out testId="instant-state" value={{ value: s.value, status: s.status }} />
    </div>
  )
}

function AutosaveCase({ scope }: { scope: string }) {
  const [text, setText] = useState("")
  const a = useAutosave({ value: text, scopeKey: scope, delayMs: 50, save: () => hold<void>("autosave") })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} data-testid="a-text" />
      <Button size="sm" variant="secondary" onClick={() => void a.retry()} data-testid="a-retry">
        もう一度保存
      </Button>
      <Out testId="autosave-state" value={{ status: a.status }} />
    </div>
  )
}

function UndoCase({ scope }: { scope: string }) {
  const first = useUndoableAction({ scopeKey: scope, windowMs: 60_000 })
  const second = useUndoableAction({ scopeKey: scope, windowMs: 60_000 })
  const [undone, setUndone] = useState<string[]>([])
  const [results, setResults] = useState<unknown[]>([])
  const handle = useRef<UndoHandle | null>(null)
  const act = (inst: typeof first, name: string, slow = false) =>
    void inst
      .run({
        // slow：実行の結果を検品から返す（実行の間のスコープの変更）
        perform: async () => {
          if (slow) await hold<void>("perform")
          return { name, scope }
        },
      undo: async (r) => {
        checks.calls.push({ key: "undo", args: r })
        await hold<void>("undo")
        setUndone((u) => [...u, `${r.name}@${r.scope}`])
      },
        title: `${name}を実行しました`,
        undoneTitle: `${name}を元に戻しました`,
      })
      .then((r) => {
        if (r.ok) handle.current = r.handle
        setResults((l) => [...l, r.ok ? { ok: true } : r])
      })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => act(first, "操作1")} data-testid="u-first">
        操作1
      </Button>
      <Button size="sm" variant="secondary" onClick={() => act(second, "操作2")} data-testid="u-second">
        操作2
      </Button>
      <Button size="sm" variant="secondary" onClick={() => act(first, "操作3", true)} data-testid="u-slow">
        操作3（実行の結果を待つ）
      </Button>
      {/* 画面に残した戻す手段（run が返す handle.undo）。古いスコープの handle で、現在のスコープを変えないことを確かめる */}
      <Button size="sm" variant="secondary" onClick={() => void handle.current?.undo().then((ok) => setResults((l) => [...l, { handleUndo: ok }]))} data-testid="u-handle-undo">
        最後の操作を画面から元に戻す
      </Button>
      <Out testId="undo-state" value={undone} />
      <Out testId="undo-results" value={results} />
    </div>
  )
}

function ConfirmCase() {
  const [target, setTarget] = useState<string | null>(null)
  const [done, setDone] = useState<string[]>([])
  const [blocked, setBlocked] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => setBlocked((b) => !b)} data-testid="c-block">
        実行できない理由を{blocked ? "外す" : "示す"}（blockedReason）
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setTarget("X")} data-testid="c-open-x">
        X を削除
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setTarget("Y")} data-testid="c-open-y">
        Y を削除
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setTarget(null)} data-testid="c-close">
        閉じる（製品の処理）
      </Button>
      <ConfirmActionDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`${target ?? ""}を削除しますか？`}
        confirmLabel={`${target ?? ""}を削除`}
        targetKey={target ?? undefined}
        variant="destructive"
        blockedReason={blocked ? "削除する権限がなくなりました。管理者に権限を確認してください。" : undefined}
        data-testid="c-dialog"
        onConfirm={async ({ targetKey }) => {
          // 検品から { unknown: "..." } や { error: "..." } を渡すと、その結果を返す
          const result = await hold<{ unknown: string } | { error: string } | undefined>("confirm")
          if (result) return result
          setDone((d) => [...d, targetKey ?? ""])
        }}
      />
      <Out testId="confirm-state" value={done} />
    </div>
  )
}

// 一括の操作（progress="external"）。実行の開始時に閉じる。閉じるまでの 2 回目の押下で、二重に実行しないこと
function ExternalConfirmCase() {
  const [open, setOpen] = useState(false)
  const [runs, setRuns] = useState(0)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="e-open">
        一括の削除
      </Button>
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="3件を削除しますか？"
        confirmLabel="3件を削除"
        targetKey="a,b,c"
        variant="destructive"
        progress="external"
        data-testid="e-dialog"
        onConfirm={() => setRuns((n) => n + 1)}
      />
      <Out testId="external-runs" value={runs} />
    </div>
  )
}

// ---------------------------------------------------------------- 未保存の変更と移動
function UnsavedUnit({ name, label, withDiscard = true }: { name: string; label: string; withDiscard?: boolean }) {
  const fields: FormFields<{ v: string }> = useMemo(() => ({ v: { label, required: true } }), [label])
  const form = useFormState<{ v: string }>({ initialValues: { v: "" }, fields })
  const save = form.handleSubmit(async (v) => (await hold<FormSaveResult<{ v: string }>>(`save-${name}`)) ?? { status: "success", values: v })
  // withDiscard が false の単位は、破棄の処理を持たない（移動するとアンマウントされる画面の状態など）。破棄しても値は残る
  useUnsavedChanges({
    dirty: form.isDirty || form.status === "unknown",
    saving: form.submitting,
    unknown: form.status === "unknown",
    label,
    revision: form.revision,
    canSave: form.canSubmit,
    onSave: () => save(),
    onDiscard: withDiscard ? form.discard : undefined,
  })
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input {...form.inputProps("v")} data-testid={`u-${name}`} />
    </Field>
  )
}

function UnsavedInner() {
  const guard = useNavigationGuard()
  const [page, setPage] = useState("a")
  const [log, setLog] = useState<string[]>([])
  const [units, setUnits] = useState(true)
  const failNavigation = useRef(false)
  return (
    <div className="flex flex-col gap-4">
      {!units ? (
        <p>保存の単位を外した（スコープの変更の再現）</p>
      ) : page === "a" ? (
        <>
          <UnsavedUnit name="one" label="1 つ目" />
          <UnsavedUnit name="two" label="2 つ目" />
          <UnsavedUnit name="three" label="3 つ目（破棄の処理なし）" withDiscard={false} />
        </>
      ) : (
        <p>別のページ</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          data-testid="go"
          onClick={() =>
            guard.confirmNavigation(
              () => {
                // 移動の失敗を再現する：許可されたが、画面は変わらない
                if (failNavigation.current) return setLog((l) => [...l, "navigation-failed"])
                setPage((p) => (p === "a" ? "b" : "a"))
                setLog((l) => [...l, "moved"])
              },
              { onCancel: () => setLog((l) => [...l, "cancelled"]) }
            )
          }
        >
          移動する
        </Button>
        <Button
          size="sm"
          variant="secondary"
          data-testid="go-c"
          onClick={() =>
            guard.confirmNavigation(
              () => {
                setPage("c")
                setLog((l) => [...l, "moved-c"])
              },
              { onCancel: () => setLog((l) => [...l, "cancelled-c"]) }
            )
          }
        >
          別の場所へ移動する
        </Button>
        <Button size="sm" variant="secondary" data-testid="fail-navigation" onClick={() => (failNavigation.current = true)}>
          次の移動を失敗させる
        </Button>
        {/* 確認の表示中にモーダルの背後から押す（検品は DOM から押す）。スコープの変更で、保存の単位がアンマウントされる場合の再現 */}
        <Button size="sm" variant="secondary" data-testid="unmount-units" onClick={() => setUnits(false)}>
          保存の単位を外す
        </Button>
        <Button size="sm" variant="secondary" data-testid="cancel-navigation" onClick={() => guard.cancelNavigation()}>
          移動の確認を取り消す（cancelNavigation）
        </Button>
        <Button
          size="sm"
          variant="secondary"
          data-testid="release-all"
          onClick={() => {
            // 認可の失効：確認と beforeunload を止めてから、確認せずに移動する
            guard.releaseAll()
            guard.confirmNavigation(() => {
              setPage("signed-out")
              setLog((l) => [...l, "moved-signed-out"])
            })
          }}
        >
          認可の失効（releaseAll）
        </Button>
        <Button size="sm" variant="secondary" data-testid="release-only" onClick={() => guard.releaseAll()}>
          releaseAll だけを呼ぶ（移動しない）
        </Button>
      </div>
      <Out testId="unsaved-log" value={{ log, page, hasUnsaved: guard.hasUnsavedChanges }} />
    </div>
  )
}

// ---------------------------------------------------------------- Toast のフォーカス
// Toast は、ポインターで押してもボタン（本体、閉じる、操作）にフォーカスを移さない。入力欄（input、textarea、select、
// contenteditable）は除く（押して入力できるようにする）。モーダルの表示中は、Toast に入力欄を置かない（資料の注意）。
// この画面は、その既存の設計の回帰の検品のためだけに、入力欄を含む通知を出す
function ToastFields() {
  return (
    <span className="mt-2 flex flex-col gap-2" data-testid="toast-fields">
      <input aria-label="通知の中の入力欄" data-testid="toast-input" className="h-8 rounded-sm border border-border px-2" />
      <textarea aria-label="通知の中の複数行の入力欄" data-testid="toast-textarea" className="rounded-sm border border-border px-2" rows={2} />
      <select aria-label="通知の中の選択" data-testid="toast-select" className="h-8 rounded-sm border border-border px-2">
        <option>A</option>
        <option>B</option>
      </select>
      <span contentEditable suppressContentEditableWarning role="textbox" aria-label="通知の中の編集できる領域" data-testid="toast-editable" className="block min-h-8 rounded-sm border border-border px-2">
        編集できる
      </span>
    </span>
  )
}

function ToastButtons({ prefix, onAction }: { prefix: string; onAction: (s: string) => void }) {
  const { toast } = useToast()
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" data-testid={`${prefix}-plain`} onClick={() => toast({ title: "通常の通知", timeout: 0 })}>
        通常の通知
      </Button>
      <Button
        size="sm"
        variant="secondary"
        data-testid={`${prefix}-undo`}
        onClick={() => toast({ variant: "success", title: "アーカイブしました", action: { label: "元に戻す", onClick: () => onAction(`${prefix}:undo`) } })}
      >
        元に戻せる通知
      </Button>
      <Button size="sm" variant="secondary" data-testid={`${prefix}-fields`} onClick={() => toast({ title: "入力欄のある通知", timeout: 0, description: <ToastFields /> })}>
        入力欄のある通知
      </Button>
    </div>
  )
}

function ToastCase() {
  const [dialog, setDialog] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const add = (s: string) => setLog((l) => [...l, s])
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel>ページの入力欄</FieldLabel>
        <Input data-testid="t-base" />
      </Field>
      <ToastButtons prefix="t" onAction={add} />
      <Button variant="secondary" data-testid="t-open-dialog" onClick={() => setDialog(true)}>
        モーダルを開く
      </Button>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent data-testid="t-dialog">
          <DialogHeader>
            <DialogTitle>モーダル</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel>モーダルの入力欄</FieldLabel>
                <Input data-testid="t-dialog-input" />
              </Field>
              <ToastButtons prefix="td" onAction={add} />
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
      <Out testId="toast-log" value={log} />
    </div>
  )
}

export function FormsChecksPage() {
  const [, setN] = useState(0)
  useEffect(() => {
    const onHash = () => setN((n) => n + 1)
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  const kind = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("case") ?? "async"
  return (
    <main className="mx-auto flex max-w-[50rem] flex-col gap-8 p-6">
      <h1 className="text-page-title">Forms & Workflows の検品（{kind}）</h1>
      {kind === "async" && <AsyncCase />}
      {kind === "submit" && <SubmitCase />}
      {kind === "scope" && <ScopeCase />}
      {kind === "toast" && <ToastCase />}
      {kind === "unsaved" && (
        <UnsavedChangesProvider>
          <UnsavedInner />
        </UnsavedChangesProvider>
      )}
    </main>
  )
}
