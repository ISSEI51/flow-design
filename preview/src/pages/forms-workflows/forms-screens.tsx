import { useEffect, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { ConfirmActionDialog } from "@/patterns/confirm-action"
import { FormActions, SaveBlockerNotice, focusFormControl } from "@/patterns/form-layout"
import { FormSaveError, useFormState, type FormFields, type FormState, type FormValues, submitOnEnter } from "@/patterns/form-state"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { useAutosave, useInstantSave } from "@/patterns/save-modes"
import { Section, SectionDescription, SectionHeader, SectionHeading, SectionStack, SectionTitle } from "@/patterns/section-layout"
import { DiscardChangesAlert, useUnsavedChanges } from "@/patterns/unsaved-changes"

import {
  customerName,
  deleteWorkspace,
  fetchSetting,
  formsServer,
  getCustomer,
  listCustomers,
  patchCustomer,
  planLabel,
  readSetting,
  restoreCustomer,
  saveSetting,
  saveSettingsForm,
  workspaceName,
  type Customer,
} from "../../data/forms-workflows/server"
import { ContractWizard } from "./contract-wizard"
import { CustomerForm, customerToValues, emptyCustomer, type CustomerSaved } from "./customer-form"
import { formsHref } from "./forms-router"
import { ImportWizard } from "./import-wizard"

// Forms & Workflows の検証画面の各ページ（製品側のコードの例）。正式な Pages の実装ではない。

export type Nav = {
  navigate: (href: string, options?: { replace?: boolean }) => void
  linkProps: (href: string) => { href: string; onClick: (e: React.MouseEvent) => void }
  /** 移動の確認を表示している（利用者の移動の要求を、保存の後の移動より優先する） */
  pending: () => boolean
}

const useRefresh = () => {
  const [, setN] = useState(0)
  return () => setN((n) => n + 1)
}

export function ArchivedScreen({ nav, ws }: { nav: Nav; ws: string }) {
  const refresh = useRefresh()
  const { toast } = useToast()
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(new Set())
  const rows = listCustomers(true, ws)
  return (
    <PageLayout width="standard" data-testid="forms-archived">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>アーカイブ済みの顧客</PageHeaderTitle>
          <PageHeaderDescription>アーカイブした顧客は、ここからいつでも戻せます。</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      {rows.length === 0 ? (
        <p className="text-ui text-muted-foreground">アーカイブ済みの顧客はありません。</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 py-3">
              <span className="text-ui">
                {c.code} {customerName(c)}
              </span>
              <Button
                size="sm"
                variant="secondary"
                loading={restoring.has(c.id)}
                onClick={async () => {
                  if (restoring.has(c.id)) return
                  setRestoring((s) => new Set([...s, c.id]))
                  try {
                    await restoreCustomer(c.id, ws)
                    toast({ variant: "success", title: `${customerName(c)}を元に戻しました` })
                  } catch (e) {
                    toast({ variant: "destructive", title: "元に戻せませんでした", description: e instanceof Error ? e.message : undefined })
                  }
                  setRestoring((s) => new Set([...s].filter((x) => x !== c.id)))
                  refresh()
                }}
              >
                元に戻す
              </Button>
            </li>
          ))}
        </ul>
      )}
      <a {...nav.linkProps(formsHref("customers", { ws }))} className="inline-flex min-h-10 w-fit items-center text-ui underline underline-offset-4 outline-none focus-visible:focus-ring">
        顧客の一覧へ
      </a>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 登録と編集
export function CustomerNewScreen({ nav, ws }: { nav: Nav; ws: string }) {
  const { toast } = useToast()
  const onSaved = (s: CustomerSaved) => {
    if (s.continueNext) {
      toast({ variant: "success", title: `${s.name}を登録しました`, description: "続けて次の顧客を入力できます" })
      return
    }
    toast({ variant: "success", title: `${s.name}を登録しました` })
    // 利用者が別の画面への移動を求めている間（保存して移動など）は、その移動を優先する。保存中に変えた内容が残る場合は移動しない
    if (!nav.pending() && !s.changedWhileSaving) nav.navigate(formsHref("customer", { id: s.id, ws }), { replace: true })
  }
  return (
    <PageLayout width="focused" data-testid="forms-customer-new">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客を登録</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <CustomerForm
        mode="create"
        initial={emptyCustomer}
        ws={ws}
        idPrefix="new"
        label="顧客の登録"
        allowContinue
        sticky
        testId="customer-new-form"
        onSaved={onSaved}
        onCancel={() => nav.navigate(formsHref("customers", { ws }))}
      />
    </PageLayout>
  )
}

export function CustomerEditScreen({ nav, id, from, ws }: { nav: Nav; id: string; from: string | null; ws: string }) {
  const { toast } = useToast()
  const [customer] = useState(() => getCustomer(id, ws))
  // 一覧から開いた編集は、一覧に戻って条件、位置、フォーカスを復元する（restore=1）
  const back = from === "detail" ? formsHref("customer", { id, ws }) : formsHref("customers", { ws, restore: "1" })
  if (!customer) return <MissingCustomer nav={nav} ws={ws} />
  return (
    <PageLayout width="focused" data-testid="forms-customer-edit">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{customerName(customer)}を編集</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <CustomerForm
        mode="edit"
        initial={customerToValues(customer)}
        customerId={customer.id}
        ws={ws}
        idPrefix="edit"
        label="顧客の編集"
        sticky
        testId="customer-edit-form"
        onSaved={(s) => {
          toast({ variant: "success", title: `${s.name}を保存しました` })
          // 一覧から開いた編集は一覧に、詳細から開いた編集は詳細に戻る。
          // 保存中に変えた内容が残っている場合は移動しない（移動の確認で破棄させない。フォームに未保存であることを示す）
          if (!nav.pending() && !s.changedWhileSaving) nav.navigate(back, { replace: true })
        }}
        onCancel={() => nav.navigate(back)}
      />
    </PageLayout>
  )
}

function MissingCustomer({ nav, ws }: { nav: Nav; ws: string }) {
  return (
    <PageLayout width="standard">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客が見つかりません</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <a {...nav.linkProps(formsHref("customers", { ws }))} className="text-ui underline underline-offset-4">
        顧客の一覧へ
      </a>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 詳細（Sheet の編集と Inline の編集）
type ContactValues = { email: string; phone: string }
const contactFields: FormFields<ContactValues> = {
  email: {
    label: "メールアドレス",
    required: true,
    normalize: (v) => v.trim().toLowerCase(),
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "メールアドレスの形式が正しくありません（例：yamada@example.com）"),
  },
  phone: { label: "電話番号", validate: (v) => (/^[0-9-]{10,13}$/.test(v) ? null : "電話番号は数字とハイフンで入力してください（例：03-1234-5678）") },
}

export function CustomerDetailScreen({ nav, id, ws }: { nav: Nav; id: string; ws: string }) {
  const refresh = useRefresh()
  const { toast } = useToast()
  const customer = getCustomer(id, ws)
  const [contactOpen, setContactOpen] = useState(false)
  if (!customer) return <MissingCustomer nav={nav} ws={ws} />
  return (
    <PageLayout width="standard" data-testid="forms-customer">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{customerName(customer)}</PageHeaderTitle>
          <PageHeaderDescription>{customer.code}</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="secondary" onClick={() => nav.navigate(formsHref("customer-edit", { id, from: "detail", ws }))}>
            編集
          </Button>
        </PageHeaderActions>
      </PageHeader>
      <SectionStack>
        <Section>
          <SectionHeader>
            <SectionHeading>
              <SectionTitle>連絡先</SectionTitle>
            </SectionHeading>
            <Button variant="secondary" size="sm" onClick={() => setContactOpen(true)} data-testid="contact-edit">
              連絡先を変更
            </Button>
          </SectionHeader>
          <dl className="grid gap-x-6 gap-y-2 text-ui sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">メールアドレス</dt>
            <dd data-testid="detail-email">{customer.email}</dd>
            <dt className="text-muted-foreground">電話番号</dt>
            <dd>{customer.phone || "未登録"}</dd>
            <dt className="text-muted-foreground">住所</dt>
            <dd>{customer.address || "未登録"}</dd>
          </dl>
        </Section>
        <Section>
          <SectionHeader>
            <SectionTitle>契約</SectionTitle>
          </SectionHeader>
          <dl className="grid gap-x-6 gap-y-2 text-ui sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">プラン</dt>
            <dd>{planLabel(customer.plan)}</dd>
            <dt className="text-muted-foreground">期間</dt>
            <dd>
              {customer.start.replaceAll("-", "/")}〜{customer.end.replaceAll("-", "/")}
            </dd>
          </dl>
        </Section>
        <Section>
          <SectionHeader>
            <SectionTitle>社内のメモ</SectionTitle>
          </SectionHeader>
          <InlineNote
            value={customer.note}
            onSave={async (note) => {
              await patchCustomer(id, { note }, ws)
              refresh()
            }}
          />
        </Section>
      </SectionStack>
      <ContactSheet
        ws={ws}
        open={contactOpen}
        onOpenChange={setContactOpen}
        customer={customer}
        onSaved={() => {
          refresh()
          toast({ variant: "success", title: "連絡先を保存しました" })
        }}
      />
    </PageLayout>
  )
}

/** 頻繁に変える単一の項目の Inline の編集。保存とキャンセルを項目の近くに置く */
function InlineNote({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  useUnsavedChanges({ dirty: editing && draft !== value, saving, label: "社内のメモ", onDiscard: () => setEditing(false) })
  if (!editing)
    return (
      <div className="flex items-start justify-between gap-4">
        <p className="text-ui whitespace-pre-wrap" data-testid="inline-note-value">
          {value || <span className="text-muted-foreground">メモはありません</span>}
        </p>
        <Button
          ref={editRef}
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(value)
            setError(null)
            setEditing(true)
          }}
          data-testid="inline-note-edit"
        >
          メモを編集
        </Button>
      </div>
    )
  const finish = () => {
    setEditing(false)
    requestAnimationFrame(() => editRef.current?.focus())
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (saving) return
        setSaving(true)
        setError(null)
        try {
          await onSave(draft)
          finish()
        } catch (e) {
          setError(
            e instanceof FormSaveError && e.outcome === "failed"
              ? "保存できませんでした。入力した内容は残っています。もう一度保存してください。"
              : "保存されたかを確かめられていません。ページを開き直して確認してください。"
          )
        } finally {
          setSaving(false)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && draft === value) finish()
      }}
    >
      <Field invalid={!!error}>
        <FieldLabel className="sr-only">社内のメモ</FieldLabel>
        <Textarea autoFocus rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} data-testid="inline-note-input" />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving} disabled={draft === value}>
          メモを保存
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={finish}>
          キャンセル
        </Button>
      </div>
    </form>
  )
}

/** 一覧や詳細からの簡単な編集（編集の Sheet）。Sheet の未保存の変更の仕組みを使い、移動の確認と二重にしない */
function ContactSheet({
  open,
  onOpenChange,
  customer,
  onSaved,
  ws,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  customer: Customer
  onSaved: () => void
  ws: string
}) {
  // スコープはワークスペースとレコード。別のレコードで開き直した後に、前の保存の結果を使わない
  const form = useFormState<ContactValues>({
    initialValues: { email: customer.email, phone: customer.phone },
    fields: contactFields,
    scopeKey: `${ws}:${customer.id}`,
    requireChanges: true,
  })
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (open) form.reset({ email: customer.email, phone: customer.phone })
    // 開いたときに、保存されている値から始める
  }, [open])
  // ページの移動（ブラウザの戻るなど）でも失われないよう登録する。Sheet を閉じる操作は Sheet の確認だけが扱う
  useUnsavedChanges({ dirty: open && form.isDirty, saving: form.submitting, label: "連絡先", revision: form.revision, onDiscard: form.discard })
  const close = () => onOpenChange(false)
  const save = form.handleSubmit(
    async (v) => {
      await patchCustomer(customer.id, { email: (v.email ?? "").trim().toLowerCase(), phone: v.phone }, ws)
      return { status: "success" }
    },
    {
      onBlocked: (b) => b[0] && focusFormControl(`contact-${b[0].name}`),
      onSuccess: () => {
        close()
        onSaved()
      },
    }
  )
  return (
    <Sheet
      mode="edit"
      open={open}
      onOpenChange={(o) => !form.submitting && onOpenChange(o)}
      unsavedChanges={form.isDirty}
      onDiscardRequest={() => setConfirm(true)}
    >
      <SheetContent data-testid="contact-sheet" closeLabel="連絡先の変更を閉じる">
        <SheetHeader>
          <SheetTitle>連絡先を変更</SheetTitle>
          <SheetDescription>{customerName(customer)}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="contact-form" noValidate onSubmit={(e) => void save(e)} onKeyDown={(e) => submitOnEnter(e, save)}>
            <FieldGroup>
              <Field invalid={!!form.error("email")}>
                <FieldLabel>メールアドレス</FieldLabel>
                <Input {...form.inputProps("email")} id="contact-email" type="email" />
                {form.error("email") && <FieldError>{form.error("email")}</FieldError>}
              </Field>
              <Field invalid={!!form.error("phone")}>
                <FieldLabel>電話番号</FieldLabel>
                <Input {...form.inputProps("phone")} id="contact-phone" type="tel" />
                {form.error("phone") && <FieldError>{form.error("phone")}</FieldError>}
              </Field>
            </FieldGroup>
          </form>
        </SheetBody>
        <SheetFooter>
          <SaveBlockerNotice id="contact-notice" blockers={form.blockers} unchanged={!form.isDirty} className="w-full" />
          <Button variant="secondary" disabled={form.submitting} onClick={() => (form.isDirty ? setConfirm(true) : close())}>
            キャンセル
          </Button>
          <Button type="submit" form="contact-form" loading={form.submitting} disabled={!form.canSubmit || !form.isDirty} focusableWhenDisabled aria-describedby="contact-notice">
            保存する
          </Button>
        </SheetFooter>
        <DiscardChangesAlert
          open={confirm}
          onOpenChange={setConfirm}
          data-testid="contact-discard"
          onDiscard={() => {
            setConfirm(false)
            form.discard()
            close()
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------- 設定（複数の独立したフォーム）
function SettingsForm<V extends FormValues>({
  kind,
  title,
  description,
  initial,
  fields,
  children,
  ws,
}: {
  ws: string
  kind: string
  title: string
  description?: string
  initial: V
  fields: FormFields<V>
  children: (form: FormState<V>, id: (n: keyof V) => string) => ReactNode
}) {
  const { toast } = useToast()
  // スコープはワークスペース。保存中に切り替わった場合、古い保存の結果で新しいワークスペースの値と通知を変えない
  // ワークスペースごとにサーバーが保存している値から始める（保存したことがなければ initial）
  const stored = () => ({ ...initial, ...readSetting<Partial<V>>(ws, `form-${kind}`, {}) })
  const form = useFormState<V>({ initialValues: stored(), fields, scopeKey: ws, requireChanges: true })
  const id = (n: keyof V) => `settings-${kind}-${String(n)}`
  const lastWs = useRef(ws)
  useEffect(() => {
    if (lastWs.current === ws) return
    lastWs.current = ws
    form.reset(stored())
    // ワークスペースが変わったときだけ、そのワークスペースの値から始める
  }, [ws])
  const save = form.handleSubmit((v) => saveSettingsForm<V>(kind, v, ws), {
    onBlocked: (b) => b[0] && focusFormControl(id(b[0].name)),
    onSuccess: () => toast({ variant: "success", title: `${title}を保存しました` }),
  })
  // 保存の単位ごとに登録する。1 つを保存しても、ほかのフォームの未保存の状態は残る
  useUnsavedChanges({ dirty: form.isDirty, saving: form.submitting, label: title, revision: form.revision, canSave: form.canSubmit, onSave: () => save(), onDiscard: form.discard })
  return (
    <Section data-testid={`settings-${kind}`} data-dirty={form.isDirty || undefined}>
      <SectionHeader>
        <SectionHeading>
          <SectionTitle>{title}</SectionTitle>
          {description && <SectionDescription>{description}</SectionDescription>}
        </SectionHeading>
      </SectionHeader>
      <form noValidate onSubmit={(e) => void save(e)} onKeyDown={(e) => submitOnEnter(e, save)} className="flex max-w-[40rem] flex-col gap-6">
        <FieldGroup>{children(form, id)}</FieldGroup>
        {form.formError && <p role="alert" className="text-ui text-destructive">{form.formError}</p>}
        <FormActions
          notice={
            <>
              <SaveBlockerNotice id={`${id("notice" as keyof V)}`} blockers={form.blockers} hidden={form.submitting} unchanged={!form.isDirty} />
              {form.isDirty && !form.submitting && form.blockers.length === 0 && <p className="text-ui text-muted-foreground">保存していない変更があります</p>}
            </>
          }
        >
          <Button
            type="submit"
            loading={form.submitting}
            disabled={!form.canSubmit || !form.isDirty}
            focusableWhenDisabled
            aria-describedby={id("notice" as keyof V)}
            data-testid={`settings-${kind}-save`}
          >
            {title}を保存
          </Button>
        </FormActions>
      </form>
    </Section>
  )
}

const text = <V extends FormValues>(form: FormState<V>, name: keyof V & string, id: string) => ({
  ...(form.inputProps as (n: string) => ReturnType<FormState<{ x: string }>["inputProps"]>)(name),
  id,
})

export function InstantSwitch({ label, description, initial, kind, ws = "hq" }: { label: string; description: string; initial: boolean; kind: string; ws?: string }) {
  const [saved, setSaved] = useState(() => readSetting(ws, kind, initial))
  useEffect(() => setSaved(readSetting(ws, kind, initial)), [ws, kind, initial])
  const s = useInstantSave<boolean>({
    value: saved,
    scopeKey: ws,
    // スコープの変更で中止された後は、この画面の状態を変えない（新しいワークスペースの値を、古い保存の結果で上書きしない）
    save: async (next, { signal }) => {
      await saveSetting(kind, next, { mode: formsServer.instantMode, ws })
      if (!signal.aborted) setSaved(next)
    },
    // 結果が不明な場合に、サーバーの値を読み直す
    verify: () => fetchSetting(kind, initial, ws),
  })
  const message = {
    idle: description,
    saving: "保存しています",
    saved: s.value ? "オンにしました" : "オフにしました",
    failed: "保存できなかったため、元の設定に戻しました。もう一度切り替えてください",
    unknown: "保存されたかを確かめられていません。表示はサーバーの値と異なる場合があります",
    checking: "サーバーの設定を確かめています",
  }[s.status]
  return (
    <Field orientation="horizontal" invalid={s.status === "failed"} data-testid={`instant-${kind}`} data-status={s.status}>
      <FieldContent>
        <FieldLabel>{label}</FieldLabel>
        <FieldDescription role="status" className={s.status === "failed" ? "text-destructive" : s.status === "unknown" ? "text-warning" : undefined}>
          {message}
        </FieldDescription>
        {s.unknown && (
          <div>
            <Button size="xs" variant="secondary" onClick={() => void s.check()}>
              設定を確かめる
            </Button>
          </div>
        )}
      </FieldContent>
      <Switch checked={s.value} onCheckedChange={(v) => s.change(v)} disabled={s.pending || s.unknown} />
    </Field>
  )
}

export function AutosaveMemo({ ws = "hq" }: { ws?: string }) {
  const initialMemo = "毎月第 1 営業日に、契約の更新が近い顧客を確認する。"
  const [value, setValue] = useState(() => readSetting(ws, "memo", initialMemo))
  // ワークスペースが変わったら、そのワークスペースのメモを表示する（scopeKey で、前のワークスペースの保存の結果を使わない）
  const lastWs = useRef(ws)
  if (lastWs.current !== ws) {
    lastWs.current = ws
    setValue(readSetting(ws, "memo", initialMemo))
  }
  const auto = useAutosave({
    value,
    scopeKey: ws,
    save: async (v) => {
      await saveSetting("memo", v, { mode: formsServer.autosaveMode, ws })
    },
  })
  useUnsavedChanges({ dirty: auto.hasUnsavedChanges, saving: auto.status === "saving", label: "チームのメモ", canSave: auto.status !== "unknown", onSave: () => auto.flush() })
  const status = {
    saved: auto.savedAt ? `${auto.savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} に保存しました` : "保存済み",
    unsaved: "入力が止まると保存します",
    saving: "保存しています",
    failed: "保存できませんでした。通信の状態を確認してください",
    unknown: "保存されたかを確かめられていません。自動では保存し直しません",
  }[auto.status]
  return (
    <Field invalid={auto.status === "failed"}>
      <FieldLabel>チームのメモ</FieldLabel>
      <Textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} data-testid="autosave-memo" />
      <div className="flex flex-wrap items-center gap-3">
        <FieldDescription
          role="status"
          data-testid="autosave-status"
          data-status={auto.status}
          className={auto.status === "failed" ? "text-destructive" : auto.status === "unknown" ? "text-warning" : undefined}
        >
          {status}
        </FieldDescription>
        {(auto.status === "failed" || auto.status === "unknown") && (
          // メモの全体を保存する（同じ内容を保存し直しても結果が変わらない）ため、利用者の操作で保存し直せる
          <Button size="xs" variant="secondary" onClick={() => void auto.retry()}>
            もう一度保存
          </Button>
        )}
      </div>
    </Field>
  )
}

type CompanyValues = { name: string; phone: string }
type BillingValues = { recipient: string; email: string }

export function SettingsScreen({ ws }: { ws: string }) {
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)
  return (
    <PageLayout width="standard" data-testid="forms-settings">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>設定</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <SectionStack>
        <SettingsForm<CompanyValues>
          ws={ws}
          kind="company"
          title="会社の情報"
          initial={{ name: "株式会社フロー", phone: "03-0000-1111" }}
          fields={{
            name: { label: "会社名", required: true },
            phone: { label: "代表の電話番号", validate: (v) => (/^[0-9-]{10,13}$/.test(v) ? null : "電話番号は数字とハイフンで入力してください（例：03-1234-5678）") },
          }}
        >
          {(form, id) => (
            <>
              <Field invalid={!!form.error("name")}>
                <FieldLabel>会社名</FieldLabel>
                <Input {...text(form, "name", id("name"))} />
                {form.error("name") && <FieldError>{form.error("name")}</FieldError>}
              </Field>
              <Field invalid={!!form.error("phone")}>
                <FieldLabel>代表の電話番号</FieldLabel>
                <Input {...text(form, "phone", id("phone"))} type="tel" className="max-w-60" />
                {form.error("phone") && <FieldError>{form.error("phone")}</FieldError>}
              </Field>
            </>
          )}
        </SettingsForm>
        <SettingsForm<BillingValues>
          ws={ws}
          kind="billing"
          title="請求先"
          description="請求書の宛名と送付先"
          initial={{ recipient: "株式会社フロー 経理部", email: "keiri@example.com" }}
          fields={{
            recipient: { label: "宛名", required: true },
            email: { label: "送付先のメールアドレス", required: true, validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "メールアドレスの形式が正しくありません（例：keiri@example.com）") },
          }}
        >
          {(form, id) => (
            <>
              <Field invalid={!!form.error("recipient")}>
                <FieldLabel>宛名</FieldLabel>
                <Input {...text(form, "recipient", id("recipient"))} />
                {form.error("recipient") && <FieldError>{form.error("recipient")}</FieldError>}
              </Field>
              <Field invalid={!!form.error("email")}>
                <FieldLabel>送付先のメールアドレス</FieldLabel>
                <Input {...text(form, "email", id("email"))} type="email" />
                {form.error("email") && <FieldError>{form.error("email")}</FieldError>}
              </Field>
            </>
          )}
        </SettingsForm>
        <Section>
          <SectionHeader>
            <SectionHeading>
              <SectionTitle>通知</SectionTitle>
              <SectionDescription>切り替えた時点で保存します</SectionDescription>
            </SectionHeading>
          </SectionHeader>
          <div className="flex max-w-[40rem] flex-col">
            <InstantSwitch ws={ws} kind="notify-renewal" label="契約の更新が近づいたら通知する" description="更新日の 30 日前に通知します" initial />
            <InstantSwitch ws={ws} kind="notify-import" label="取り込みが終わったら通知する" description="取り込みの結果をメールで送ります" initial={false} />
          </div>
        </Section>
        <Section>
          <SectionHeader>
            <SectionHeading>
              <SectionTitle>メモ</SectionTitle>
              <SectionDescription>入力すると自動で保存します</SectionDescription>
            </SectionHeading>
          </SectionHeader>
          <div className="max-w-[40rem]">
            <AutosaveMemo ws={ws} />
          </div>
        </Section>
        <Section divider>
          <SectionHeader>
            <SectionHeading>
              <SectionTitle>ワークスペースの削除</SectionTitle>
              <SectionDescription>顧客、契約、請求のすべてのデータを削除します。削除したデータは元に戻せません。</SectionDescription>
            </SectionHeading>
          </SectionHeader>
          <div>
            <Button variant="secondary" className="text-destructive" onClick={() => setDeleting(true)} data-testid="workspace-delete">
              ワークスペースを削除
            </Button>
          </div>
        </Section>
      </SectionStack>
      <ConfirmActionDialog
        open={deleting}
        onOpenChange={setDeleting}
        variant="destructive"
        title={`ワークスペース「${workspaceName(ws)}」を削除しますか？`}
        description={`顧客 ${listCustomers(false, ws).length}件、契約、請求、取り込みの履歴を含む、すべてのデータを削除します。削除したデータは元に戻せません。`}
        confirmationText={workspaceName(ws)}
        confirmationLabel={`確認のため、ワークスペースの名前「${workspaceName(ws)}」を入力してください`}
        confirmLabel="ワークスペースを削除"
        targetKey={ws}
        data-testid="workspace-delete-dialog"
        onConfirm={async () => {
          await deleteWorkspace(workspaceName(ws))
          toast({ variant: "success", title: "ワークスペースの削除を受け付けました", description: "検証画面のため、データは削除していません" })
        }}
      />
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 契約と取り込み
export function ContractsScreen({ nav, ws }: { nav: Nav; ws: string }) {
  return (
    <PageLayout width="standard" data-testid="forms-contracts">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>契約</PageHeaderTitle>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button onClick={() => nav.navigate(formsHref("contract-new", { ws }))} data-testid="contracts-new">
            契約を登録
          </Button>
        </PageHeaderActions>
      </PageHeader>
      <p className="text-ui text-muted-foreground">契約の一覧は、この検証画面の範囲外です。</p>
    </PageLayout>
  )
}

export function ContractNewScreen({ nav, ws }: { nav: Nav; ws: string }) {
  return (
    <PageLayout width="focused" data-testid="forms-contract-new">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>契約を登録</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      {/* 下書きは、アカウント、ワークスペース、画面で分ける（境界を越えて共有しない） */}
      <ContractWizard
        key={ws}
        draftKey={`hanako.sato:${ws}:contract-new`}
        idPrefix="contract"
        onCancel={() => nav.navigate(formsHref("contracts", { ws }))}
        onDone={() => nav.navigate(formsHref("contracts", { ws }))}
      />
    </PageLayout>
  )
}

export function ImportScreen({ nav, ws }: { nav: Nav; ws: string }) {
  return (
    <PageLayout width="standard" data-testid="forms-import">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客を取り込む</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <ImportWizard key={ws} idPrefix="import" onFinished={() => nav.navigate(formsHref("customers", { ws }))} />
    </PageLayout>
  )
}
