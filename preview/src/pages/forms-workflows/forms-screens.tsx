import { useEffect, useRef, useState, type ReactNode } from "react"
import { Ellipsis } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { ConfirmActionDialog, useUndoableAction } from "@/patterns/confirm-action"
import { FormActions, SaveBlockerNotice, focusFormControl } from "@/patterns/form-layout"
import { useFormState, type FormFields, type FormState, type FormValues, submitOnEnter } from "@/patterns/form-state"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { useAutosave, useInstantSave } from "@/patterns/save-modes"
import { Section, SectionDescription, SectionHeader, SectionHeading, SectionStack, SectionTitle } from "@/patterns/section-layout"
import { DiscardChangesAlert, useUnsavedChanges } from "@/patterns/unsaved-changes"

import {
  archiveCustomer,
  customerName,
  deleteCustomers,
  deleteWorkspace,
  formsServer,
  getCustomer,
  listCustomers,
  patchCustomer,
  planLabel,
  restoreCustomer,
  saveSetting,
  saveSettingsForm,
  type Customer,
} from "../../data/forms-workflows/server"
import { ContractWizard } from "./contract-wizard"
import { CustomerForm, customerToValues, emptyCustomer, type CustomerSaved } from "./customer-form"
import { ExportDialog, type ExportColumn } from "./export-dialog"
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

// ---------------------------------------------------------------- 顧客の一覧
const exportColumns: ExportColumn[] = [
  { id: "code", label: "顧客コード", visible: true },
  { id: "name", label: "名前", visible: true },
  { id: "email", label: "メールアドレス", visible: true },
  { id: "plan", label: "プラン", visible: true },
  { id: "phone", label: "電話番号", visible: false },
  { id: "address", label: "住所", visible: false },
]
const rowFor = (c: Customer) => ({ code: c.code, name: customerName(c), email: c.email, plan: planLabel(c.plan), phone: c.phone, address: c.address })

export function CustomersScreen({ nav }: { nav: Nav }) {
  const refresh = useRefresh()
  const { toast } = useToast()
  const undo = useUndoableAction()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null)
  const [exportOrigin, setExportOrigin] = useState<"table" | "selection-bar" | null>(null)
  const all = listCustomers()
  const rows = all.filter((c) => !query.trim() || `${c.code} ${customerName(c)} ${c.email}`.includes(query.trim()))
  const archivedCount = listCustomers(true).length
  // 確認の対象は、現在も存在する行だけ（確認の間に別の利用者がアーカイブした行は除く）。
  // 閉じる動きの間も内容を変えないよう、最後に表示した対象を残す
  const lastTargets = useRef<string[]>([])
  if (confirmIds) lastTargets.current = confirmIds.filter((id) => all.some((c) => c.id === id))
  const targets = lastTargets.current

  // 検証用：確認を開いた 2 秒後に、ほかの利用者が対象の 1 件をアーカイブする
  useEffect(() => {
    if (!confirmIds || !window.__fdFormsChangeWhileConfirm || confirmIds.length < 2) return
    const t = window.setTimeout(() => {
      const c = getCustomer(confirmIds[0])
      if (c) c.archived = true
      refresh()
    }, 2000)
    return () => window.clearTimeout(t)
    // 開いたときだけ
  }, [confirmIds])

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const archive = (c: Customer) =>
    void undo
      .run({
        perform: () => archiveCustomer(c.id),
        undo: async (id) => {
          await restoreCustomer(id)
          refresh()
        },
        title: `${customerName(c)}をアーカイブしました`,
        undoneTitle: `${customerName(c)}を元に戻しました`,
        expiredDescription: "アーカイブ済みの顧客の一覧から戻せます",
      })
      .then(() => {
        setSelected((s) => new Set([...s].filter((x) => x !== c.id)))
        refresh()
      })

  const named = targets.map((id) => ({ id, name: customerName(getCustomer(id) ?? { kind: "corporate", company: id, lastName: "", firstName: "" }) }))
  return (
    <PageLayout width="full" data-testid="forms-customers">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客</PageHeaderTitle>
        </PageHeaderContent>
        <PageHeaderActions>
          <a {...nav.linkProps(formsHref("import"))} className="inline-flex min-h-control items-center rounded-lg px-5 text-ui font-medium outline-none hover:bg-accent focus-visible:focus-ring">
            CSV から取り込む
          </a>
          <Button onClick={() => nav.navigate(formsHref("customer-new"))} data-testid="customers-new">
            顧客を登録
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Field className="max-w-80">
            <FieldLabel>検索</FieldLabel>
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="コード、名前、メールアドレス" data-testid="customers-search" />
          </Field>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="secondary" data-testid="customers-export" />}>エクスポート</DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setExportOrigin("table")}>項目を選んでエクスポート…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 text-ui" aria-live="polite" data-testid="customers-bar">
          {selected.size > 0 ? (
            <>
              <span className="font-medium">{selected.size}件を選択中</span>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                選択を解除
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setExportOrigin("selection-bar")}>
                エクスポート
              </Button>
              <Button size="sm" variant="secondary" className="text-destructive" onClick={() => setConfirmIds([...selected])} data-testid="customers-delete-selected">
                削除
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground">{rows.length}件</span>
          )}
        </div>

        <Table data-testid="customers-table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <span className="sr-only">選択</span>
              </TableHead>
              <TableHead>顧客コード</TableHead>
              <TableHead>名前</TableHead>
              <TableHead>メールアドレス</TableHead>
              <TableHead>プラン</TableHead>
              <TableHead className="w-14">
                <span className="sr-only">操作</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id} data-row-id={c.id}>
                <TableCell>
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={(on) => toggle(c.id, on)} aria-label={`${customerName(c)}を選択`} />
                </TableCell>
                <TableCell className="tabular-nums">{c.code}</TableCell>
                <TableCell>
                  <a {...nav.linkProps(formsHref("customer", { id: c.id }))} className="font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring">
                    {customerName(c)}
                  </a>
                </TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell>{planLabel(c.plan)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${customerName(c)}の操作`} />}>
                      <Ellipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => nav.navigate(formsHref("customer-edit", { id: c.id, from: "list" }))}>編集</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => archive(c)}>アーカイブ</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setConfirmIds([c.id])}>
                        削除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <a {...nav.linkProps(formsHref("archived"))} className="inline-flex min-h-10 w-fit items-center text-ui underline underline-offset-4 outline-none focus-visible:focus-ring">
          アーカイブ済みの顧客（{archivedCount}件）
        </a>
      </div>

      <ConfirmActionDialog
        open={confirmIds !== null}
        onOpenChange={(o) => !o && setConfirmIds(null)}
        variant="destructive"
        title={`${targets.length}件の顧客を削除しますか？`}
        description="削除した顧客は元に戻せません。契約と請求の履歴も表示できなくなります。残す必要がある場合は、アーカイブを使ってください。"
        confirmLabel={`${targets.length}件を削除`}
        retryLabel="もう一度削除"
        targetKey={[...targets].sort().join(",")}
        data-testid="customers-delete-dialog"
        onConfirm={async ({ targetKey }) => {
          const ids = (targetKey ?? "").split(",").filter(Boolean)
          const error = (await deleteCustomers(ids))?.error
          if (error) return { error }
          setSelected((s) => new Set([...s].filter((x) => !ids.includes(x))))
          refresh()
          toast({ variant: "success", title: `${ids.length}件の顧客を削除しました` })
        }}
      >
        <ul className="flex flex-col gap-1 text-ui" data-testid="customers-delete-targets">
          {named.slice(0, 3).map((n) => (
            <li key={n.id}>{n.name}</li>
          ))}
          {named.length > 3 && <li className="text-muted-foreground">ほか {named.length - 3}件</li>}
        </ul>
      </ConfirmActionDialog>

      {exportOrigin && (
        <ExportDialog
          open
          onOpenChange={(o) => !o && setExportOrigin(null)}
          origin={exportOrigin}
          kind="顧客"
          columns={exportColumns}
          // この一覧はページに分けていないため、「表示中のページ」は選択肢にしない（検索結果と同じになる）。
          // 「すべてのデータ」は、アーカイブ済みの顧客を含む
          counts={{ selected: selected.size, page: undefined, results: rows.length, all: all.length + listCustomers(true).length }}
          getRows={async (scope) =>
            (scope === "selected" ? all.filter((c) => selected.has(c.id)) : scope === "all" ? [...all, ...listCustomers(true)] : rows).map(rowFor)
          }
        />
      )}
    </PageLayout>
  )
}

declare global {
  interface Window {
    __fdFormsChangeWhileConfirm?: boolean
  }
}

export function ArchivedScreen({ nav }: { nav: Nav }) {
  const refresh = useRefresh()
  const { toast } = useToast()
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(new Set())
  const rows = listCustomers(true)
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
                    await restoreCustomer(c.id)
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
      <a {...nav.linkProps(formsHref("customers"))} className="inline-flex min-h-10 w-fit items-center text-ui underline underline-offset-4 outline-none focus-visible:focus-ring">
        顧客の一覧へ
      </a>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 登録と編集
export function CustomerNewScreen({ nav }: { nav: Nav }) {
  const { toast } = useToast()
  const onSaved = (s: CustomerSaved) => {
    if (s.continueNext) {
      toast({ variant: "success", title: `${s.name}を登録しました`, description: "続けて次の顧客を入力できます" })
      return
    }
    toast({ variant: "success", title: `${s.name}を登録しました` })
    // 利用者が別の画面への移動を求めている間（保存して移動など）は、その移動を優先する。保存中に変えた内容が残る場合は移動しない
    if (!nav.pending() && !s.changedWhileSaving) nav.navigate(formsHref("customer", { id: s.id }), { replace: true })
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
        idPrefix="new"
        label="顧客の登録"
        allowContinue
        sticky
        testId="customer-new-form"
        onSaved={onSaved}
        onCancel={() => nav.navigate(formsHref("customers"))}
      />
    </PageLayout>
  )
}

export function CustomerEditScreen({ nav, id, from }: { nav: Nav; id: string; from: string | null }) {
  const { toast } = useToast()
  const [customer] = useState(() => getCustomer(id))
  const back = from === "detail" ? formsHref("customer", { id }) : formsHref("customers")
  if (!customer) return <MissingCustomer nav={nav} />
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

function MissingCustomer({ nav }: { nav: Nav }) {
  return (
    <PageLayout width="standard">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客が見つかりません</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <a {...nav.linkProps(formsHref("customers"))} className="text-ui underline underline-offset-4">
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

export function CustomerDetailScreen({ nav, id }: { nav: Nav; id: string }) {
  const refresh = useRefresh()
  const { toast } = useToast()
  const customer = getCustomer(id)
  const [contactOpen, setContactOpen] = useState(false)
  if (!customer) return <MissingCustomer nav={nav} />
  return (
    <PageLayout width="standard" data-testid="forms-customer">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{customerName(customer)}</PageHeaderTitle>
          <PageHeaderDescription>{customer.code}</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="secondary" onClick={() => nav.navigate(formsHref("customer-edit", { id, from: "detail" }))}>
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
              await patchCustomer(id, { note })
              refresh()
            }}
          />
        </Section>
      </SectionStack>
      <ContactSheet
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
        } catch {
          setError("保存できませんでした。入力した内容は残っています。もう一度保存してください。")
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
function ContactSheet({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customer: Customer; onSaved: () => void }) {
  const form = useFormState<ContactValues>({ initialValues: { email: customer.email, phone: customer.phone }, fields: contactFields })
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (open) form.reset({ email: customer.email, phone: customer.phone })
    // 開いたときに、保存されている値から始める
  }, [open])
  // ページの移動（ブラウザの戻るなど）でも失われないよう登録する。Sheet を閉じる操作は Sheet の確認だけが扱う
  useUnsavedChanges({ dirty: open && form.isDirty, saving: form.submitting, label: "連絡先", onDiscard: form.discard })
  const close = () => onOpenChange(false)
  const save = form.handleSubmit(
    async (v) => {
      await patchCustomer(customer.id, { email: (v.email ?? "").trim().toLowerCase(), phone: v.phone })
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
}: {
  kind: string
  title: string
  description?: string
  initial: V
  fields: FormFields<V>
  children: (form: FormState<V>, id: (n: keyof V) => string) => ReactNode
}) {
  const { toast } = useToast()
  const form = useFormState<V>({ initialValues: initial, fields })
  const id = (n: keyof V) => `settings-${kind}-${String(n)}`
  const save = form.handleSubmit((v) => saveSettingsForm<V>(kind, v), {
    onBlocked: (b) => b[0] && focusFormControl(id(b[0].name)),
    onSuccess: () => toast({ variant: "success", title: `${title}を保存しました` }),
  })
  // 保存の単位ごとに登録する。1 つを保存しても、ほかのフォームの未保存の状態は残る
  useUnsavedChanges({ dirty: form.isDirty, saving: form.submitting, label: title, canSave: form.canSubmit, onSave: () => save(), onDiscard: form.discard })
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

export function InstantSwitch({ label, description, initial, kind }: { label: string; description: string; initial: boolean; kind: string }) {
  const [saved, setSaved] = useState(initial)
  const s = useInstantSave<boolean>({
    value: saved,
    save: async (next) => {
      await saveSetting(kind, next, { fail: formsServer.instantFails })
      setSaved(next)
    },
  })
  const message =
    s.status === "saving" ? "保存しています" : s.status === "saved" ? (s.value ? "オンにしました" : "オフにしました") : s.status === "failed" ? "保存できなかったため、元の設定に戻しました。もう一度切り替えてください" : description
  return (
    <Field orientation="horizontal" invalid={s.status === "failed"} data-testid={`instant-${kind}`}>
      <FieldContent>
        <FieldLabel>{label}</FieldLabel>
        <FieldDescription role="status" className={s.status === "failed" ? "text-destructive" : undefined}>
          {message}
        </FieldDescription>
      </FieldContent>
      <Switch checked={s.value} onCheckedChange={(v) => s.change(v)} disabled={s.pending} />
    </Field>
  )
}

export function AutosaveMemo() {
  const [value, setValue] = useState("毎月第 1 営業日に、契約の更新が近い顧客を確認する。")
  const auto = useAutosave({
    value,
    save: async (v) => {
      await saveSetting("memo", v, { fail: formsServer.autosaveFails })
    },
  })
  useUnsavedChanges({ dirty: auto.hasUnsavedChanges, saving: auto.status === "saving", label: "チームのメモ", canSave: true, onSave: () => auto.flush() })
  const status = {
    saved: auto.savedAt ? `${auto.savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} に保存しました` : "保存済み",
    unsaved: "入力が止まると保存します",
    saving: "保存しています",
    failed: "保存できませんでした。通信の状態を確認してください",
  }[auto.status]
  return (
    <Field invalid={auto.status === "failed"}>
      <FieldLabel>チームのメモ</FieldLabel>
      <Textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} data-testid="autosave-memo" />
      <div className="flex flex-wrap items-center gap-3">
        <FieldDescription role="status" data-testid="autosave-status" data-status={auto.status} className={auto.status === "failed" ? "text-destructive" : undefined}>
          {status}
        </FieldDescription>
        {auto.status === "failed" && (
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

export function SettingsScreen() {
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
            <InstantSwitch kind="notify-renewal" label="契約の更新が近づいたら通知する" description="更新日の 30 日前に通知します" initial />
            <InstantSwitch kind="notify-import" label="取り込みが終わったら通知する" description="取り込みの結果をメールで送ります" initial={false} />
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
            <AutosaveMemo />
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
        title="ワークスペース「本社営業部」を削除しますか？"
        description="顧客 5件、契約、請求、取り込みの履歴を含む、すべてのデータを削除します。削除したデータは元に戻せません。"
        confirmationText="本社営業部"
        confirmationLabel="確認のため、ワークスペースの名前「本社営業部」を入力してください"
        confirmLabel="ワークスペースを削除"
        data-testid="workspace-delete-dialog"
        onConfirm={async () => {
          const result = await deleteWorkspace("本社営業部")
          if (result?.error) return { error: result.error }
          toast({ variant: "success", title: "ワークスペースの削除を受け付けました", description: "検証画面のため、データは削除していません" })
        }}
      />
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 契約と取り込み
export function ContractsScreen({ nav }: { nav: Nav }) {
  return (
    <PageLayout width="standard" data-testid="forms-contracts">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>契約</PageHeaderTitle>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button onClick={() => nav.navigate(formsHref("contract-new"))} data-testid="contracts-new">
            契約を登録
          </Button>
        </PageHeaderActions>
      </PageHeader>
      <p className="text-ui text-muted-foreground">契約の一覧は、この検証画面の範囲外です。</p>
    </PageLayout>
  )
}

export function ContractNewScreen({ nav }: { nav: Nav }) {
  return (
    <PageLayout width="focused" data-testid="forms-contract-new">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>契約を登録</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <ContractWizard draftKey="hanako.sato:hq:contract-new" idPrefix="contract" onCancel={() => nav.navigate(formsHref("contracts"))} onDone={() => nav.navigate(formsHref("contracts"))} />
    </PageLayout>
  )
}

export function ImportScreen({ nav }: { nav: Nav }) {
  return (
    <PageLayout width="standard" data-testid="forms-import">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客を取り込む</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <ImportWizard idPrefix="import" onFinished={() => nav.navigate(formsHref("customers"))} />
    </PageLayout>
  )
}
