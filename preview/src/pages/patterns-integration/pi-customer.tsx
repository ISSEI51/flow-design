import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldError, FieldGroup, FieldLabel, FieldOptionalMark } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { useBrowseData } from "@/patterns/browse-data"
import { ConfirmActionDialog, useUndoableAction, type UndoHandle } from "@/patterns/confirm-action"
import { DataRegionError } from "@/patterns/data-states"
import { FormActions, SaveBlockerNotice, focusFormControl } from "@/patterns/form-layout"
import { submitOnEnter, useFormState, type FormFields, type FormSaveResult } from "@/patterns/form-state"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { PageLayout } from "@/patterns/page-layout"
import { Section, SectionHeader, SectionStack, SectionTitle } from "@/patterns/section-layout"
import { DiscardChangesAlert, useUnsavedChanges } from "@/patterns/unsaved-changes"

import { metricLabel, planLabel, plans, statusLabel, yen, type MetricId, type PiCustomer } from "../../data/patterns-integration/model"
import {
  addContact,
  deleteCustomer,
  fetchCustomer,
  PiAuthError,
  lookupCustomer,
  saveCustomer,
  setCustomerStatus,
  type CustomerValues,
} from "../../data/patterns-integration/server"
import { conditionParams, conditionsFrom } from "./pi-analysis"
import { onlyOfflineReason, ProtectedContent, usePi } from "./pi-context"
import { Facts, PiBreadcrumb } from "./pi-parts"
import { piHref } from "./pi-router"

// 顧客の詳細と編集（製品側のコードの例）。
// - 詳細：useBrowseData（keepPreviousData: false。別のレコードの内容を現在のレコードとして表示しない）。
// - どこから開いたか（from=list、from=metric と分析の条件）を URL に持ち、階層の表示と、保存の後の戻り先に使う。
// - 「停止にする」は useUndoableAction（元に戻すの通知は、スコープが変わると閉じ、古い通知からは取り消さない）。
// - 連絡の記録は Drawer の中のフォーム。結果は Drawer の中で伝え、成功したら Drawer を閉じてから Toast を出す。
//   Drawer の表示中に、すでに表示している Toast は、Registry の Drawer が Drawer の面の上へずらす（toast.md）。
// - 編集：useFormState と useUnsavedChanges。保存の結果が不明な場合は、再送信せずに「状態を確認」で照会する。

type From = { from: string | null; extra: Record<string, string | null> }
function fromOf(params: URLSearchParams): From {
  const from = params.get("from")
  if (from === "metric") return { from, extra: { metric: params.get("metric"), ...conditionParams(conditionsFrom(params)) } }
  return { from, extra: {} }
}

function trail(ws: string, f: From) {
  const w = ws === "hq" ? null : ws
  if (f.from === "metric") {
    const metric = (f.extra.metric ?? "revenue") as MetricId
    const cond = { region: f.extra.region ?? null, plan: f.extra.plan ?? null }
    return [
      { label: "分析", href: piHref("analysis", { ws: w, ...cond, back: "1" }) },
      { label: `${metricLabel[metric] ?? "指標"}の明細`, href: piHref("metric", { ws: w, metric, ...cond }) },
    ]
  }
  return [{ label: "顧客", href: piHref("customers", { ws: w, restore: f.from === "list" ? "1" : null }) }]
}

function useCustomer(id: string) {
  const { ws, dataScope } = usePi()
  return useBrowseData({
    query: id,
    // 閲覧の権限を失ったら、取得した内容を破棄する（dataScope）
    scopeKey: dataScope,
    // 別のレコードの内容は残さない。同じレコードの取得し直し（保存の後など）は、前の内容を残す（表示を空にしない）
    keepPreviousData: (previousKey, nextKey) => previousKey === nextKey,
    fetcher: (i, { signal }) => fetchCustomer(ws, i, signal),
  })
}

function Missing() {
  return (
    <PageLayout width="standard">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>顧客が見つかりません</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <p className="text-ui text-muted-foreground">削除されたか、このワークスペースにはない顧客です。</p>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 詳細
export function CustomerDetailScreen({ id, params }: { id: string; params: URLSearchParams }) {
  const { ws, scope, nav, permit, permitLatest, viewAccess, connectivity } = usePi()
  const { toast } = useToast()
  const detail = useCustomer(id)
  // keepPreviousData は同じレコードの取得し直しだけで前の内容を残すため、data は常にこのレコードの内容（再取得中は前回の内容）。
  // 権限の確認中と閲覧の権限がない間は、名前を含めて顧客の内容を使わない（見出し、階層、Drawer、確認の文）
  const viewing = viewAccess === "allowed"
  const c = viewing ? (detail.data ?? undefined) : undefined
  const f = fromOf(params)
  const w = ws === "hq" ? null : ws
  const undo = useUndoableAction({ scopeKey: scope })
  const edit = permit("edit")
  const del = permit("delete")
  const reasons = [...new Set([del.reason, edit.reason].filter((r): r is string => r !== null))]
  const reasonId = (r: string | null) => (r === null ? undefined : `pi-detail-reason-${reasons.indexOf(r)}`)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  // 確認中と権限の喪失では、開いている削除の確認を閉じる。連絡の記録の Drawer は、利用者の入力を持つため、
  // 確認中は開いたまま顧客の名前だけを隠し（保存は permitLatest で止める）、閲覧の権限を失ったときだけ閉じる
  useEffect(() => {
    if (!viewing) setConfirmDelete(false)
    if (viewAccess === "denied") setContactOpen(false)
  }, [viewing, viewAccess])

  if (viewing && detail.status === "ready" && detail.data === null) return <Missing />
  const pause = async (customer: PiCustomer) => {
    const next = customer.status === "active" ? "paused" : "active"
    const r = await undo.run({
      perform: () => setCustomerStatus(ws, customer.id, next),
      // 取り消しの対象は、実行の結果（ワークスペースと ID）で固定する
      undo: async (res) => {
        await setCustomerStatus(res.ws, res.id, customer.status)
        detail.reload()
      },
      title: `${customer.name}を${statusLabel[next]}にしました`,
      undoneTitle: `${customer.name}を${statusLabel[customer.status]}に戻しました`,
    })
    // 検品用：最後の「元に戻す」（古いスコープから呼んでも取り消さないことの検品）
    if (r.ok && window.__fdPi) (window.__fdPi as Record<string, unknown>).lastUndo = r.handle as UndoHandle
    detail.reload()
  }

  return (
    <PageLayout width="standard" data-testid="pi-customer">
      <PageHeader>
        <div className="basis-full">
          <PiBreadcrumb items={trail(ws, f)} current={c?.name ?? "顧客"} />
        </div>
        <PageHeaderContent>
          <PageHeaderTitle>{c?.name ?? "顧客"}</PageHeaderTitle>
          {c && <PageHeaderDescription>{`${c.region}・${planLabel(c.plan)}`}</PageHeaderDescription>}
        </PageHeaderContent>
        {c && (
          // 危険な操作（削除）を先に、主要な操作（編集）を最後に置く。狭い画面でも横に並べ、幅を内容に合わせる
          <PageHeaderActions className="w-fit flex-row flex-wrap">
            {del.presentation.mode !== "hidden" && (
              <Button
                variant="secondary"
                className="text-destructive"
                disabled={!del.allowed}
                focusableWhenDisabled
                aria-describedby={reasonId(del.reason)}
                onClick={() => setConfirmDelete(true)}
                data-testid="detail-delete"
              >
                削除
              </Button>
            )}
            {edit.presentation.mode !== "hidden" && (
              <Button
                disabled={!edit.allowed}
                focusableWhenDisabled
                aria-describedby={reasonId(edit.reason)}
                onClick={() => nav.navigate(piHref("customer-edit", { ws: w, id, from: f.from === "metric" ? "metric" : "detail", ...(f.from === "metric" ? f.extra : {}) }))}
                data-testid="detail-edit"
              >
                編集
              </Button>
            )}
          </PageHeaderActions>
        )}
      </PageHeader>
      {c && reasons.length > 0 && (
        // 操作できない理由は 1 か所に 1 回だけ示し、各操作から aria-describedby で参照する
        <div className={onlyOfflineReason(reasons, connectivity) ? "sr-only" : "flex flex-col gap-1 text-ui text-muted-foreground"} data-testid="detail-restrictions">
          {reasons.map((r) => (
            <p key={r} id={reasonId(r)}>
              {r}
            </p>
          ))}
        </div>
      )}
      <ProtectedContent label="顧客の情報">
        {detail.status === "error" && !c ? (
          <DataRegionError title="顧客を取得できませんでした" onRetry={detail.reload} />
        ) : (
          <SectionStack>
            <Section>
              <SectionHeader>
                <SectionTitle>契約</SectionTitle>
                {c && edit.presentation.mode !== "hidden" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!edit.allowed}
                    focusableWhenDisabled
                    aria-describedby={reasonId(edit.reason)}
                    onClick={() => void pause(c)}
                    data-testid="detail-pause"
                  >
                    {c.status === "active" ? "停止にする" : "契約中に戻す"}
                  </Button>
                )}
              </SectionHeader>
              {c && (
                <Facts
                  testId="detail-contract"
                  items={[
                    { label: "状態", value: statusLabel[c.status], testId: "detail-status" },
                    { label: "地域", value: c.region },
                    { label: "プラン", value: planLabel(c.plan) },
                    { label: "月額", value: yen(c.mrr), testId: "detail-mrr" },
                  ]}
                />
              )}
            </Section>
            <Section>
              <SectionHeader>
                <SectionTitle>連絡先</SectionTitle>
              </SectionHeader>
              {c && (
                <Facts
                  items={[
                    { label: "メールアドレス", value: c.email, testId: "detail-email" },
                    { label: "電話番号", value: c.phone || "未登録" },
                    { label: "社内のメモ", value: c.note || "未登録", testId: "detail-note" },
                  ]}
                />
              )}
            </Section>
            <Section>
              <SectionHeader>
                <SectionTitle>連絡の記録</SectionTitle>
                {c && edit.presentation.mode !== "hidden" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!edit.allowed}
                    focusableWhenDisabled
                    aria-describedby={reasonId(edit.reason)}
                    onClick={() => setContactOpen(true)}
                    data-testid="contact-add"
                  >
                    記録を追加
                  </Button>
                )}
              </SectionHeader>
              {c && (c.contacts.length === 0 ? <p className="text-ui text-muted-foreground">記録はありません</p> : (
                <ul className="flex flex-col gap-2 text-ui" data-testid="contact-list">
                  {c.contacts.map((t, i) => (
                    <li key={i} className="[overflow-wrap:anywhere]">
                      {t}
                    </li>
                  ))}
                </ul>
              ))}
            </Section>
          </SectionStack>
        )}
      </ProtectedContent>

      {detail.data && viewAccess !== "denied" && (
        <ContactDrawer
          open={contactOpen}
          onOpenChange={setContactOpen}
          customer={detail.data}
          showName={viewing}
          onSaved={() => {
            detail.reload()
          }}
        />
      )}
      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        variant="destructive"
        // 確認の文に顧客の名前を入れない（権限の確認中に閉じる途中の Dialog に、保護された内容を残さない）。対象は詳細ページの見出しで示す
        title="この顧客を削除しますか？"
        description="削除した顧客は元に戻せません。"
        confirmLabel="顧客を削除"
        targetKey={`${scope}:${id}`}
        data-testid="delete-confirm"
        onConfirm={async ({ targetKey }) => {
          // 確かめた対象（スコープと ID）と、実行の直前の権限で実行する
          if (targetKey !== `${scope}:${id}`) return { error: "対象が変わりました。確かめてから、もう一度実行してください。" }
          if (!permitLatest("delete")) return { error: "顧客を削除する権限がなくなりました。管理者に権限を確認してください。" }
          try {
            await deleteCustomer(ws, id)
          } catch (e) {
            // サーバーが権限で拒否した（403）：削除していないことが確かな失敗。結果が不明として扱わない
            if (e instanceof PiAuthError && e.status === 403) return { error: "顧客を削除する権限がありません。管理者に権限を確認してください。" }
            throw e
          }
          toast({ variant: "success", title: "顧客を削除しました" })
          nav.force(piHref("customers", { ws: w }))
        }}
      />
    </PageLayout>
  )
}

/** 連絡の記録（Drawer の中のフォーム）。結果は Drawer の中に示し、成功したら閉じてから Toast を出す */
function ContactDrawer({
  open,
  onOpenChange,
  customer,
  showName,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  customer: PiCustomer
  /** 顧客の名前を示すか（権限の確認中は示さない） */
  showName: boolean
  onSaved: () => void
}) {
  const { ws, permitLatest } = usePi()
  const { toast } = useToast()
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discard, setDiscard] = useState(false)
  const savedRef = useRef(false)
  const dirty = text.trim() !== ""

  // Drawer の表示中は、Registry の Drawer が、すでに表示している Toast を Drawer の面の上へずらす（--toast-offset-overlay。toast.md）。
  // この画面では位置を設定しない

  const save = async () => {
    if (saving || !dirty) return
    if (!permitLatest("edit")) {
      setError("記録を追加する権限がないか、オフラインのため保存できません。")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addContact(ws, customer.id, text.trim())
      savedRef.current = true
      setText("")
      onOpenChange(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "記録を保存できませんでした。")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(o) => {
          if (saving) return
          onOpenChange(o)
          if (!o) setError(null)
        }}
        unsavedChanges={dirty}
        onDiscardRequest={() => setDiscard(true)}
        onOpenChangeComplete={(o) => {
          // 閉じ終えてから結果を知らせる（Drawer の下部の操作に Toast を重ねない）
          if (o || !savedRef.current) return
          savedRef.current = false
          toast({ variant: "success", title: "連絡の記録を保存しました" })
        }}
      >
        <DrawerContent data-testid="contact-drawer">
          <DrawerHeader>
            <DrawerTitle>連絡の記録を追加</DrawerTitle>
            <DrawerDescription>{showName ? customer.name : "権限を確認しています"}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <form
              id="pi-contact-form"
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
              className="flex flex-col gap-4"
            >
              <Field>
                <FieldLabel>内容</FieldLabel>
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} data-testid="contact-text" />
              </Field>
              {error && (
                <Alert variant="destructive" role="alert" data-testid="contact-error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </form>
          </DrawerBody>
          <DrawerFooter>
            <span id="pi-contact-save-reason" className="sr-only">
              内容を入力すると保存できます
            </span>
            <Button variant="secondary" disabled={saving} onClick={() => (dirty ? setDiscard(true) : onOpenChange(false))}>
              キャンセル
            </Button>
            <Button
              type="submit"
              form="pi-contact-form"
              loading={saving}
              disabled={!dirty}
              focusableWhenDisabled
              aria-describedby={!dirty ? "pi-contact-save-reason" : undefined}
              data-testid="contact-save"
            >
              記録を保存
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <DiscardChangesAlert
        open={discard}
        onOpenChange={setDiscard}
        onDiscard={() => {
          setText("")
          setError(null)
          setDiscard(false)
          onOpenChange(false)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------- 編集
const fields: FormFields<CustomerValues> = {
  name: { label: "顧客の名前", required: true, normalize: (v) => v.trim() },
  email: {
    label: "メールアドレス",
    required: true,
    normalize: (v) => v.trim().toLowerCase(),
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "メールアドレスの形式が正しくありません（例：yamada@example.com）"),
  },
  phone: { label: "電話番号", validate: (v) => (/^[0-9-]{10,13}$/.test(v) ? null : "電話番号は数字とハイフンで入力してください（例：03-1234-5678）") },
  plan: { label: "プラン", required: true },
  status: { label: "状態", required: true },
  note: { label: "社内のメモ" },
}
const valuesOf = (c: PiCustomer): CustomerValues => ({ name: c.name, email: c.email, phone: c.phone, plan: c.plan, status: c.status, note: c.note })

/**
 * 結果を受け取る前にフォームが外れた保存（編集の権限を失って画面が外れた、など）。ワークスペースと ID ごと（メモリだけ）。
 * 同じ顧客のフォームを開き直したときに、結果を照会するまで保存させない（前の保存が後から反映される場合がある）
 */
const inflightSaves = new Map<string, { submitted: CustomerValues }>()

export function CustomerEditScreen({ id, params }: { id: string; params: URLSearchParams }) {
  const { ws, scope, access, viewAccess } = usePi()
  const f = fromOf(params)
  const w = ws === "hq" ? null : ws
  const detail = useCustomer(id)
  if (viewAccess === "allowed" && detail.status === "ready" && detail.data === null) return <Missing />
  // フォームは、最初に取得した内容で作る。取得し直しでは作り直さない（入力を残す）
  const c = detail.data ?? null
  const viewing = viewAccess === "allowed"
  // 編集の権限を失ったときだけフォームを作り直す（権限の再確認や、関係のない権限の変更では作り直さない）
  const canEdit = access.grants?.permissions.includes("edit") ?? false
  return (
    <PageLayout width="focused" data-testid="pi-customer-edit">
      <PageHeader>
        <div className="basis-full">
          <PiBreadcrumb
            items={[
              ...trail(ws, f),
              { label: viewing && c ? c.name : "顧客", href: piHref("customer", { ws: w, id, ...(f.from === "metric" ? { from: "metric", ...f.extra } : f.from === "list" ? { from: "list" } : {}) }) },
            ]}
            current="編集"
          />
        </div>
        <PageHeaderContent>
          {/* 権限の確認中は、見出しに顧客の名前を入れない。「を編集」は途中で改行しない（WebKit は語句の単位の改行に対応していない） */}
          <PageHeaderTitle>
            {viewing && c ? (
              <>
                {c.name}
                <span className="whitespace-nowrap">を編集</span>
              </>
            ) : (
              "顧客を編集"
            )}
          </PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      {viewing && detail.status === "error" && !c && <DataRegionError title="顧客を取得できませんでした" onRetry={detail.reload} />}
      {/* フォームの状態（入力、保存中の処理）は、権限の確認中も保持する。入力欄は EditForm の中の ProtectedContent で隠す */}
      {c && <EditForm key={`${scope}:${id}:${canEdit ? "edit" : "read"}`} customer={c} params={params} />}
      {!c && <ProtectedContent label="顧客の情報">{null}</ProtectedContent>}
    </PageLayout>
  )
}

function EditForm({ customer, params }: { customer: PiCustomer; params: URLSearchParams }) {
  const { ws, scope, nav, user, permit, permitLatest, draftSource, peekRestoredDraft, consumeRestoredDraft, connectivity } = usePi()
  const { toast } = useToast()
  const f = fromOf(params)
  const w = ws === "hq" ? null : ws
  const back =
    f.from === "metric"
      ? piHref("metric", { ws: w, ...f.extra })
      : f.from === "detail"
        ? piHref("customer", { ws: w, id: customer.id })
        : piHref("customers", { ws: w, restore: "1" })
  const form = useFormState<CustomerValues>({ initialValues: valuesOf(customer), fields, scopeKey: `${scope}:${customer.id}`, requireChanges: true })
  const edit = permit("edit")
  // 保存の競合の確認に送る版。保存に成功したら、サーバーが返した版に進める（続けて保存しても、自分の保存を競合としない）
  const versionRef = useRef(customer.version)
  const saveKey = `${ws}:${customer.id}`
  // 前のフォームで結果を受け取らなかった保存（描画の中では読むだけ）
  const [orphan, setOrphan] = useState(() => inflightSaves.get(saveKey) ?? null)
  // 再認証の後に復元すると決めた入力（描画の中では読むだけ。使い終えたことは effect で知らせる）
  const [restored] = useState(() => peekRestoredDraft(ws, customer.id))
  const [restoredShown, setRestoredShown] = useState(false)
  // 再認証の後に、現在の認可で復元すると決めた入力を戻す（保存していない変更として残す）
  useEffect(() => {
    if (!restored) return
    consumeRestoredDraft(restored)
    for (const key of Object.keys(restored.values) as (keyof CustomerValues)[]) {
      if (restored.values[key] !== form.values[key]) form.setValue(key, restored.values[key] as never)
    }
    setRestoredShown(true)
    // 初回だけ
  }, [])

  // セッションの期限切れのときに、入力を渡す（保存していない変更があるときだけ）。
  // 期限切れの時点の入力（values）と、結果を確かめていない保存で送った値（submitted）を分けて渡す
  const latest = useRef({ form })
  useLayoutEffect(() => {
    latest.current = { form }
  })
  useEffect(() => {
    draftSource.current = () => {
      const { form: fs } = latest.current
      const unconfirmed = fs.status === "unknown" || fs.status === "submitting"
      if (!fs.isDirty && !unconfirmed) return null
      return { userId: user.id, ws, id: customer.id, values: fs.values, submitted: unconfirmed ? (fs.submittedValues as CustomerValues | null) : null, version: versionRef.current, unconfirmed }
    }
    return () => void (draftSource.current = null)
  }, [draftSource, user.id, ws, customer.id])

  const save = form.handleSubmit(
    async (values): Promise<FormSaveResult<CustomerValues>> => {
      // 送信の直前に、最新の権限と接続で確かめる（ボタンの無効化だけに頼らない）
      if (!permitLatest("edit")) return { status: "failed", formError: "この顧客を編集する権限がないか、オフラインのため保存できません。" }
      const submitted = { ...valuesOf(customer), ...values } as CustomerValues
      // 結果を受け取る前にフォームが外れた場合に備えて記録する。通信の例外（結果が不明）では記録を残し、照会で解く
      inflightSaves.set(saveKey, { submitted })
      const result = await saveCustomer(ws, customer.id, submitted, versionRef.current)
      if (result.status === "success" && result.version !== undefined) versionRef.current = result.version
      // 結果を受け取った（フォームが外れていても、ここは実行される）。次に開くフォームで照会を求めない
      inflightSaves.delete(saveKey)
      return result
    },
    {
      onBlocked: (blockers) => {
        const first = blockers[0]
        if (first) focusFormControl(`pi-edit-${first.name}`)
      },
      onSuccess: (saved, { changedWhileSaving }) => {
        toast({ variant: "success", title: `${saved.name}を保存しました` })
        // 保存中に変えた内容が残っている場合と、保存して移動の途中は、ここでは移動しない
        if (!nav.pending() && !changedWhileSaving) nav.navigate(back, { replace: true })
      },
    }
  )

  useUnsavedChanges({
    dirty: form.isDirty || form.status === "unknown",
    saving: form.submitting,
    unknown: form.status === "unknown",
    label: "顧客の編集",
    revision: form.revision,
    canSave: form.canSubmit && edit.allowed && orphan === null,
    onSave: () => save(),
    onDiscard: form.discard,
  })

  // 前のフォームの保存の結果を、現在の認可で照会する。照会するまで、このフォームでは保存しない
  const [checkingOrphan, setCheckingOrphan] = useState(false)
  const checkOrphan = async () => {
    if (!orphan || checkingOrphan) return
    setCheckingOrphan(true)
    try {
      const server = await lookupCustomer(ws, customer.id)
      if (!server) return
      const keys = Object.keys(fields) as (keyof CustomerValues)[]
      const applied = keys.every((k) => String(server[k]).trim() === String(orphan.submitted[k] ?? "").trim())
      inflightSaves.delete(saveKey)
      setOrphan(null)
      versionRef.current = server.version
      // 基準値をサーバーの現在の値にする（保存されていれば、その内容）
      form.reset(valuesOf(server))
      toast({ variant: applied ? "success" : "neutral", title: applied ? "保存されていたことを確かめました" : "前の保存は反映されていませんでした" })
    } catch {
      toast({ variant: "destructive", title: "状態を確認できませんでした", description: "時間をおいて、もう一度確認してください。" })
    } finally {
      setCheckingOrphan(false)
    }
  }

  // 保存されたかわからない場合：再送信せず、現在の認可でサーバーの値を照会する
  const [checking, setChecking] = useState(false)
  const checkSaved = async () => {
    if (checking) return
    setChecking(true)
    try {
      const sent = form.submittedValues ?? form.values
      const server = await lookupCustomer(ws, customer.id)
      const keys = Object.keys(fields) as (keyof CustomerValues)[]
      const matched = server !== null && keys.every((k) => String(server[k]).trim() === String(sent[k] ?? "").trim())
      if (matched) {
        inflightSaves.delete(saveKey)
        // 保存されていた：次の保存は、照会した版を基準にする
        versionRef.current = server.version
        form.resolveUnknown({ saved: true, values: sent as CustomerValues })
        toast({ variant: "success", title: "保存されていたことを確かめました" })
      } else {
        inflightSaves.delete(saveKey)
        if (server) versionRef.current = server.version
        form.resolveUnknown({ saved: false })
      }
    } catch {
      toast({ variant: "destructive", title: "状態を確認できませんでした", description: "時間をおいて、もう一度確認してください。" })
    } finally {
      setChecking(false)
    }
  }

  const unknown = form.status === "unknown"
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (form.formError) errorRef.current?.scrollIntoView({ block: "nearest" })
  }, [form.formError])
  const id = (name: string) => `pi-edit-${name}`
  const err = (name: keyof CustomerValues) => {
    const e = form.error(name)
    return e ? <FieldError data-testid={`edit-${name}-error`}>{e}</FieldError> : null
  }
  const canPress = form.canSubmit && edit.allowed && orphan === null
  const statusItems = [
    { value: "active", label: statusLabel.active },
    { value: "paused", label: statusLabel.paused },
  ]
  const planItems = plans.map((p) => ({ value: p.value, label: p.label }))
  // 権限の確認中は、入力欄（顧客の内容を含む）を描画しない。フォームの状態（入力と保存中の処理）はこの部品が持ち続ける
  return (
    <ProtectedContent label="顧客の情報">
    <form
      noValidate
      onSubmit={(e) => void save(e)}
      onKeyDown={(e) => submitOnEnter(e, () => save())}
      data-testid="edit-form"
      data-dirty={form.isDirty || undefined}
      data-status={form.status}
      className="flex min-w-0 flex-col gap-8"
    >
      {restoredShown && (
        <p role="status" className="text-ui" data-testid="draft-restored">
          ログインし直す前の入力を戻しました。まだ保存していません。
        </p>
      )}
      {orphan && (
        <Alert variant="warning" role="alert" data-testid="edit-orphan">
          <AlertTitle>前に始めた保存の結果を確かめていません</AlertTitle>
          <AlertDescription>画面を開き直す前に始めた保存が、サーバーで反映されたかを確かめてから保存してください。</AlertDescription>
          <AlertAction>
            <Button type="button" size="sm" variant="secondary" loading={checkingOrphan} onClick={() => void checkOrphan()}>
              保存されたかを確認
            </Button>
          </AlertAction>
        </Alert>
      )}
      <FieldGroup>
        <Field invalid={!!form.error("name")}>
          <FieldLabel>顧客の名前</FieldLabel>
          <Input {...form.inputProps("name")} id={id("name")} autoComplete="organization" />
          {err("name")}
        </Field>
        <Field invalid={!!form.error("email")}>
          <FieldLabel>メールアドレス</FieldLabel>
          <Input {...form.inputProps("email")} id={id("email")} type="email" autoComplete="email" />
          {err("email")}
        </Field>
        <Field invalid={!!form.error("phone")}>
          <FieldLabel>
            電話番号
            <FieldOptionalMark />
          </FieldLabel>
          <Input {...form.inputProps("phone")} id={id("phone")} type="tel" className="max-w-60" />
          {err("phone")}
        </Field>
        <Field>
          <FieldLabel>プラン</FieldLabel>
          <Select items={planItems} value={form.values.plan} onValueChange={(v) => form.setValue("plan", String(v), { commit: true })}>
            <SelectTrigger id={id("plan")} className="w-full sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {planItems.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>状態</FieldLabel>
          <Select items={statusItems} value={form.values.status} onValueChange={(v) => form.setValue("status", v as CustomerValues["status"], { commit: true })}>
            <SelectTrigger id={id("status")} className="w-full sm:w-60" data-testid="edit-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>
            社内のメモ
            <FieldOptionalMark />
          </FieldLabel>
          <Textarea {...form.inputProps("note")} id={id("note")} rows={3} />
        </Field>
      </FieldGroup>

      {form.formError && (
        // 固定した操作の領域（FormActions）に隠れないよう、下の余白を空けて表示の範囲に入れる
        <Alert ref={errorRef} variant={unknown ? "warning" : "destructive"} role="alert" className="scroll-mb-40" data-testid="edit-form-error">
          <AlertTitle>{unknown ? "保存されたかを確かめられていません" : "保存できませんでした"}</AlertTitle>
          {/* 見出しと同じ文を説明の先頭で繰り返さない（Registry の既定の文は、見出しと同じ文で始まる） */}
          <AlertDescription>{form.formError.replace(/^保存されたかを確かめられていません。/, "")}</AlertDescription>
          {unknown && (
            <AlertAction>
              <Button type="button" size="sm" variant="secondary" loading={checking} onClick={() => void checkSaved()} data-testid="edit-check">
                保存されたかを確認
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}

      <FormActions
        sticky
        notice={
          <>
            <SaveBlockerNotice
              id="pi-edit-notice"
              blockers={form.blockers}
              reason={unknown ? "unknown" : form.submitting ? "submitting" : form.composing ? "composing" : undefined}
              unchanged={form.unchanged}
              detail
              onFocusField={(name) => focusFormControl(id(name))}
            />
            {!edit.allowed && edit.reason && (
              <p id="pi-edit-blocked" className={onlyOfflineReason([edit.reason], connectivity) ? "sr-only" : "text-ui text-muted-foreground"} data-testid="edit-blocked">
                {edit.reason}
              </p>
            )}
          </>
        }
      >
        <Button type="button" variant="secondary" onClick={() => nav.navigate(back)} disabled={form.submitting}>
          キャンセル
        </Button>
        <Button type="submit" loading={form.submitting} disabled={!canPress} focusableWhenDisabled aria-describedby={!edit.allowed && edit.reason ? "pi-edit-notice pi-edit-blocked" : "pi-edit-notice"} data-testid="edit-submit">
          保存する
        </Button>
      </FormActions>
    </form>
    </ProtectedContent>
  )
}
