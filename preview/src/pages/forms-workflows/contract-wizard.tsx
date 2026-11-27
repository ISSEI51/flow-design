import { useEffect, useRef, useState } from "react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormActions, SaveBlockerNotice, focusFormControl } from "@/patterns/form-layout"
import { FormSaveError, useFormState, type FormFields, submitOnEnter } from "@/patterns/form-state"
import { useStepFlow, type StepDefinition, type StepFlowSnapshot } from "@/patterns/step-flow"
import { Stepper } from "@/patterns/stepper"
import { DiscardChangesAlert, useUnsavedChanges } from "@/patterns/unsaved-changes"

import { checkSeats, deleteDraft, listCustomers, plans, readDraft, saveDraft, submitContract, customerName } from "../../data/forms-workflows/server"

// 契約の登録（複数のステップの例。製品側のコード）。
// - 契約の種類で、後のステップが変わる（新規：顧客、契約の内容、支払い、確認。更新：更新する契約、契約の内容、確認）。
//   種類を選ぶまでは総数が決まらないため、「ステップ 1」とだけ示す。
// - 次へは、現在のステップの必須の項目と検証が完了したときだけ押せる。戻るはいつでも押せる。
// - 契約の内容でエンタープライズを選ぶと、支払いは請求書だけになる。クレジットカードを選んでいた場合は、支払いのステップを要確認にする。
// - 下書き（このページのメモリ）から、入力、現在のステップ、到達したステップを再開する。再開の時点の選択肢で確かめ直す。
// - 最終の確認の後に、同じ内容の確認の Dialog を重ねない。

export type ContractValues = {
  contractType: "new" | "renewal" | null
  customerId: string | null
  renewalOf: string | null
  plan: string | null
  seats: string
  start: string
  payment: "invoice" | "card" | null
  billingEmail: string
  cardHolder: string
}

const emptyContract: ContractValues = {
  contractType: null,
  customerId: null,
  renewalOf: null,
  plan: null,
  seats: "",
  start: "",
  payment: null,
  billingEmail: "",
  cardHolder: "",
}

export const renewableContracts = [
  { value: "K-1001", label: "K-1001 株式会社山田商事（スタンダード、2027/03/31 まで）" },
  { value: "K-1002", label: "K-1002 有限会社佐藤工業（ライト、2027/01/31 まで）" },
]

type StepId = "type" | "customer" | "renewal" | "terms" | "payment" | "review"

const stepFields: Record<StepId, (keyof ContractValues)[]> = {
  type: ["contractType"],
  customer: ["customerId"],
  renewal: ["renewalOf"],
  terms: ["plan", "seats", "start"],
  payment: ["payment", "billingEmail", "cardHolder"],
  review: [],
}

const isNew = (v: ContractValues) => v.contractType === "new"
const fields: FormFields<ContractValues> = {
  contractType: { label: "契約の種類", required: true, requiredMessage: "契約の種類を選んでください" },
  customerId: { label: "顧客", required: true, requiredMessage: "顧客を選んでください", active: isNew },
  renewalOf: { label: "更新する契約", required: true, requiredMessage: "更新する契約を選んでください", active: (v) => v.contractType === "renewal" },
  plan: {
    label: "プラン",
    required: true,
    requiredMessage: "プランを選んでください",
    validate: (v) => (plans.some((p) => p.value === v) ? null : "選んでいたプランは提供を終了しました。別のプランを選んでください"),
  },
  seats: {
    label: "利用人数",
    required: true,
    validate: (v) => (/^[1-9]\d{0,2}$/.test(v) ? null : "利用人数は 1〜999 の整数で入力してください"),
    // 利用人数の上限はプランで決まる。プランを変えると、人数が同じでも確かめ直す（asyncDeps）
    validateAsync: (v, all, { signal }) => checkSeats(all.plan, v, { signal }),
    asyncDeps: (all) => all.plan,
  },
  start: { label: "開始日", required: true, requiredMessage: "開始日を入力してください" },
  payment: {
    label: "支払い方法",
    required: true,
    requiredMessage: "支払い方法を選んでください",
    active: isNew,
    validate: (v, all) => (all.plan === "enterprise" && v === "card" ? "エンタープライズは請求書での支払いだけです。支払い方法を選び直してください" : null),
  },
  billingEmail: {
    label: "請求書の送付先",
    required: true,
    active: (v) => isNew(v) && v.payment === "invoice",
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "メールアドレスの形式が正しくありません（例：keiri@example.com）"),
  },
  cardHolder: { label: "カードの名義", required: true, active: (v) => isNew(v) && v.payment === "card" },
}

function stepsFor(v: ContractValues): StepDefinition<StepId>[] {
  const first: StepDefinition<StepId> = { id: "type", label: "契約の種類" }
  if (v.contractType === "new")
    return [first, { id: "customer", label: "顧客" }, { id: "terms", label: "契約の内容" }, { id: "payment", label: "支払い" }, { id: "review", label: "確認" }]
  if (v.contractType === "renewal")
    return [first, { id: "renewal", label: "更新する契約" }, { id: "terms", label: "契約の内容" }, { id: "review", label: "確認" }]
  return [first]
}

type Draft = { values: ContractValues; flow: StepFlowSnapshot<StepId> }

const paymentOptions = [
  { value: "invoice", label: "請求書（銀行振込）" },
  { value: "card", label: "クレジットカード" },
]

export function ContractWizard({
  draftKey,
  idPrefix,
  onDone,
  onCancel,
  stepperLayout = "auto",
}: {
  /** 下書きの保存先のキー。アカウント、ワークスペース、画面で分け、境界を越えて共有しない */
  draftKey: string
  idPrefix: string
  onDone?: (contractId: string) => void
  onCancel: () => void
  stepperLayout?: "auto" | "horizontal" | "vertical" | "compact"
}) {
  const form = useFormState<ContractValues>({ initialValues: emptyContract, fields })
  const steps = stepsFor(form.values)
  const blockedFields = new Set(form.blockers.map((b) => b.name))
  const isComplete = (id: StepId) => !stepFields[id].some((f) => blockedFields.has(f))
  const flow = useStepFlow<StepId>({ steps, isComplete, stepsKnown: form.values.contractType !== null })
  const current = flow.current ?? "type"
  const id = (name: keyof ContractValues) => `${idPrefix}-${name}`
  const [draftInfo, setDraftInfo] = useState(() => readDraft<Draft>(draftKey))
  const [resumeOffered, setResumeOffered] = useState(() => Boolean(readDraft<Draft>(draftKey)))
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null)
  const [doneId, setDoneId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // 完了の画面を表示したときに 1 回だけ、見出しにフォーカスを移す
  const doneHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (doneId) doneHeading.current?.focus()
  }, [doneId])
  // 入力を始めた後に下書きから再開する場合は、入力を置き換えてよいかを確かめる
  const [confirmResume, setConfirmResume] = useState(false)

  // 別の画面のキーに切り替わった場合は、その画面の下書きを読む（境界を越えて持ち越さない）
  useEffect(() => {
    const d = readDraft<Draft>(draftKey)
    setDraftInfo(d)
    setResumeOffered(Boolean(d))
  }, [draftKey])

  useUnsavedChanges({ dirty: (form.isDirty || form.status === "unknown") && !doneId, saving: form.submitting || draftSaving, label: "契約の登録", revision: form.revision, onDiscard: form.discard })

  const stepBlockers = form.blockers.filter((b) => stepFields[current].includes(b.name))
  const noticeId = `${idPrefix}-step-notice`

  const resume = () => {
    const d = readDraft<Draft>(draftKey)
    if (!d) return
    // 下書きの値を基準にする（正式な保存ではないが、下書きとして残っているため、移動で失われない）
    form.reset(d.data.values)
    flow.restore(d.data.flow)
    // 再開の時点の選択肢と条件で、到達していたステップの項目を確かめ直す（提供を終えたプランなど）
    const reached = new Set([...(d.data.flow.reached ?? []), d.data.flow.current])
    form.reveal((Object.keys(stepFields) as StepId[]).filter((s) => reached.has(s)).flatMap((s) => stepFields[s]))
    setResumeOffered(false)
  }

  const saveAsDraft = async () => {
    setDraftSaving(true)
    const at = await saveDraft(draftKey, { values: form.values, flow: flow.snapshot() } satisfies Draft)
    setDraftSaving(false)
    setDraftSavedAt(at)
    setDraftInfo(readDraft<Draft>(draftKey))
    form.markSaved(form.values)
  }

  const submit = form.handleSubmit(
    async (values) => {
      setSubmitError(null)
      try {
        const contractId = await submitContract(values)
        deleteDraft(draftKey)
        setDoneId(contractId)
        return { status: "success" }
      } catch (e) {
        // 確定した失敗だけをもう一度登録できる状態にする。それ以外（通信の例外など）は結果が不明として扱う
        const failed = e instanceof FormSaveError && e.outcome === "failed"
        const message = e instanceof Error && e instanceof FormSaveError ? e.message : "契約が登録されたかを確かめられていません。契約の一覧で確認してください。"
        setSubmitError(message)
        return failed ? { status: "failed", formError: message } : { status: "unknown", formError: message }
      }
    },
    {
      onBlocked: () => {
        const target = flow.firstIncomplete()
        if (target) flow.goTo(target)
      },
    }
  )

  // 次へ、または最終のステップでは登録。Enter で求めたが完了していない場合は、このステップの項目だけエラーを示す
  const advance = () => {
    if (current === "review") void submit()
    else if (!flow.next()) {
      form.reveal(stepFields[current])
      const first = stepBlockers[0]
      if (first) focusFormControl(id(first.name))
    }
  }

  if (doneId) {
    return (
      <div data-testid={`${idPrefix}-done`} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 ref={doneHeading} tabIndex={-1} className="text-section outline-none">
            契約を登録しました
          </h2>
          <p className="text-body text-muted-foreground">契約番号 {doneId}。開始日の前日に、確認のメールを送ります。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setDoneId(null)
              form.reset(emptyContract)
              flow.restore({})
            }}
          >
            続けて契約を登録
          </Button>
          {onDone && <Button onClick={() => onDone(doneId)}>契約の一覧へ</Button>}
        </div>
      </div>
    )
  }

  const select = <K extends "contractType" | "customerId" | "renewalOf" | "plan" | "payment">(
    name: K,
    items: { value: string; label: string }[],
    placeholder = "選択してください"
  ) => (
    <Select items={items} value={form.values[name] as string | null} onValueChange={(v) => form.setValue(name, v as ContractValues[K], { commit: true })}>
      <SelectTrigger id={id(name)} data-testid={id(name)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
  const err = (name: keyof ContractValues) => {
    const e = form.error(name)
    return e ? <FieldError data-testid={`${id(name)}-error`}>{e}</FieldError> : null
  }

  const seatsStatus = form.asyncStatus("seats")
  const stepLabel = steps.find((s) => s.id === current)?.label ?? ""
  const customer = listCustomers().find((c) => c.id === form.values.customerId)

  return (
    <div className="flex min-w-0 flex-col gap-8" data-testid={idPrefix} data-step={current}>
      {resumeOffered && draftInfo && (
        <Alert variant="info" data-testid={`${idPrefix}-draft`}>
          <AlertTitle>保存した下書きがあります</AlertTitle>
          <AlertDescription>
            {draftInfo.savedAt.toLocaleString("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            に保存した下書きから再開できます。
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="secondary" onClick={() => (form.isDirty ? setConfirmResume(true) : resume())}>
              下書きから再開
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                deleteDraft(draftKey)
                setDraftInfo(undefined)
                setResumeOffered(false)
              }}
            >
              下書きを破棄
            </Button>
          </AlertAction>
        </Alert>
      )}

      <DiscardChangesAlert
        open={confirmResume}
        onOpenChange={setConfirmResume}
        title="入力した内容を、下書きの内容に置き換えますか？"
        description="この画面で入力した内容は保存されません。"
        onDiscard={() => {
          setConfirmResume(false)
          resume()
        }}
      />
      <Stepper items={flow.items} total={flow.total} onSelect={(sid) => flow.goTo(sid)} layout={stepperLayout} currentLabel="hidden" aria-label="契約の登録の手順" data-testid={`${idPrefix}-stepper`} />

      <form
        noValidate
        className="flex min-w-0 flex-col gap-8"
        onSubmit={(e) => {
          e.preventDefault()
          advance()
        }}
        onKeyDown={(e) => submitOnEnter(e, advance)}
      >
        <h2 ref={flow.headingRef} className="text-section outline-none" data-testid={`${idPrefix}-heading`}>
          {stepLabel}
        </h2>

        {current === "type" && (
          <FieldGroup>
            <Field invalid={!!form.error("contractType")}>
              <FieldLabel>種類</FieldLabel>
              {select("contractType", [
                { value: "new", label: "新規の契約" },
                { value: "renewal", label: "契約の更新" },
              ])}
              <FieldDescription>選んだ種類によって、この後の手順が変わります</FieldDescription>
              {err("contractType")}
            </Field>
          </FieldGroup>
        )}

        {current === "customer" && (
          <FieldGroup>
            <Field invalid={!!form.error("customerId")}>
              <FieldLabel>顧客</FieldLabel>
              {select(
                "customerId",
                listCustomers().map((c) => ({ value: c.id, label: `${c.code} ${customerName(c)}` }))
              )}
              {err("customerId")}
            </Field>
          </FieldGroup>
        )}

        {current === "renewal" && (
          <FieldGroup>
            <Field invalid={!!form.error("renewalOf")}>
              <FieldLabel>更新する契約</FieldLabel>
              {select("renewalOf", renewableContracts)}
              {err("renewalOf")}
            </Field>
          </FieldGroup>
        )}

        {current === "terms" && (
          <FieldGroup>
            <Field invalid={!!form.error("plan")}>
              <FieldLabel>プラン</FieldLabel>
              {select("plan", plans)}
              {err("plan")}
            </Field>
            <Field invalid={!!form.error("seats") || seatsStatus === "error"}>
              <FieldLabel>利用人数</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Input {...form.inputProps("seats")} id={id("seats")} inputMode="numeric" className="max-w-32" />
                <span className="text-body text-muted-foreground">人</span>
                {seatsStatus === "error" && (
                  // 確かめられなかった（通信の失敗、応答しない）：利用者の操作で確かめ直す
                  <Button type="button" variant="secondary" size="sm" onClick={() => form.revalidate("seats")} data-testid={`${idPrefix}-seats-recheck`}>
                    もう一度確かめる
                  </Button>
                )}
              </div>
              {form.error("seats")
                ? err("seats")
                : seatsStatus === "error" && (
                    <FieldDescription role="status" data-testid={`${idPrefix}-seats-status`}>
                      {form.asyncMessage("seats") ?? "利用人数を確かめられませんでした"}
                    </FieldDescription>
                  )}
            </Field>
            <Field invalid={!!form.error("start")}>
              <FieldLabel>開始日</FieldLabel>
              <Input id={id("start")} type="date" required value={form.values.start} onChange={(e) => form.setValue("start", e.target.value, { commit: true })} className="max-w-60" />
              {err("start")}
            </Field>
          </FieldGroup>
        )}

        {current === "payment" && (
          <FieldGroup>
            <Field invalid={!!form.error("payment")}>
              <FieldLabel>支払い方法</FieldLabel>
              {select("payment", form.values.plan === "enterprise" ? paymentOptions.filter((o) => o.value === "invoice").concat(form.values.payment === "card" ? [paymentOptions[1]] : []) : paymentOptions)}
              {form.values.plan === "enterprise" && !form.error("payment") && <FieldDescription>エンタープライズは請求書での支払いだけです</FieldDescription>}
              {err("payment")}
            </Field>
            {form.isActive("billingEmail") && (
              <Field invalid={!!form.error("billingEmail")}>
                <FieldLabel>請求書の送付先</FieldLabel>
                <Input {...form.inputProps("billingEmail")} id={id("billingEmail")} type="email" autoComplete="email" />
                {err("billingEmail")}
              </Field>
            )}
            {form.isActive("cardHolder") && (
              <Field invalid={!!form.error("cardHolder")}>
                <FieldLabel>カードの名義</FieldLabel>
                <Input {...form.inputProps("cardHolder")} id={id("cardHolder")} autoComplete="cc-name" />
                <FieldDescription>カードの番号は、登録の後に決済の画面で入力します</FieldDescription>
                {err("cardHolder")}
              </Field>
            )}
          </FieldGroup>
        )}

        {current === "review" && (
          <div className="flex flex-col gap-8" data-testid={`${idPrefix}-review`}>
            {steps
              .filter((s) => s.id !== "type" && s.id !== "review")
              .map((s) => (
                <section key={s.id} className="flex flex-col gap-3" aria-labelledby={`${idPrefix}-review-${s.id}`}>
                  <div className="flex items-center justify-between gap-4">
                    <h3 id={`${idPrefix}-review-${s.id}`} className="text-heading">
                      {s.label}
                    </h3>
                    <Button type="button" variant="ghost" size="sm" onClick={() => flow.goTo(s.id)} aria-label={`${s.label}を変更`}>
                      変更
                    </Button>
                  </div>
                  <dl className="grid gap-x-6 gap-y-2 text-ui sm:grid-cols-[10rem_1fr]">
                    {stepFields[s.id]
                      .filter((f) => form.isActive(f))
                      .map((f) => (
                        <div key={f} className="contents">
                          <dt className="text-muted-foreground">{fields[f].label}</dt>
                          <dd>{displayValue(f, form.values, customer ? customerName(customer) : null)}</dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ))}
          </div>
        )}

        {submitError && (
          <Alert variant={form.status === "unknown" ? "warning" : "destructive"} role="alert" data-testid={`${idPrefix}-submit-error`}>
            <AlertTitle>{form.status === "unknown" ? "登録されたかを確かめられていません" : "登録できませんでした"}</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <FormActions
          notice={
            <>
              <SaveBlockerNotice
                id={noticeId}
                blockers={stepBlockers}
                hidden={form.composing}
                goal={current === "review" ? "登録できます" : "次へ進めます"}
                onFocusField={(name) => focusFormControl(id(name))}
                data-testid={`${idPrefix}-notice`}
              />
              {draftSavedAt && !form.isDirty && (
                <p className="text-ui text-muted-foreground" role="status">
                  {draftSavedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} に下書きを保存しました
                </p>
              )}
            </>
          }
        >
          <Button type="button" variant="ghost" onClick={onCancel} disabled={form.submitting}>
            キャンセル
          </Button>
          <Button type="button" variant="secondary" loading={draftSaving} disabled={form.submitting} onClick={() => void saveAsDraft()}>
            下書きを保存
          </Button>
          {!flow.isFirst && (
            <Button type="button" variant="secondary" disabled={form.submitting} onClick={() => flow.back()} data-testid={`${idPrefix}-back`}>
              戻る
            </Button>
          )}
          {current === "review" ? (
            <Button type="submit" loading={form.submitting} disabled={!form.canSubmit} focusableWhenDisabled aria-describedby={noticeId} data-testid={`${idPrefix}-submit`}>
              契約を登録する
            </Button>
          ) : (
            <Button type="submit" disabled={!flow.canNext} focusableWhenDisabled aria-describedby={noticeId} data-testid={`${idPrefix}-next`}>
              次へ
            </Button>
          )}
        </FormActions>
      </form>
    </div>
  )
}

function displayValue(name: keyof ContractValues, v: ContractValues, customer: string | null) {
  switch (name) {
    case "customerId":
      return customer ?? "—"
    case "renewalOf":
      return renewableContracts.find((c) => c.value === v.renewalOf)?.label ?? "—"
    case "plan":
      return plans.find((p) => p.value === v.plan)?.label ?? "—"
    case "seats":
      return `${v.seats} 人`
    case "start":
      return v.start.replaceAll("-", "/")
    case "payment":
      return paymentOptions.find((p) => p.value === v.payment)?.label ?? "—"
    default:
      return String(v[name] ?? "")
  }
}

/** 検品と資料のために、提供を終えたプランを含む下書きを作る（再開の時点での再検証を確かめる） */
export function seedStaleDraft(draftKey: string) {
  return saveDraft(draftKey, {
    values: { ...emptyContract, contractType: "new", customerId: "cu-1", plan: "basic-2025", seats: "12", start: "2026-12-01" },
    flow: { current: "terms", reached: ["type", "customer", "terms"], completed: ["type", "customer"] },
  } satisfies Draft)
}
