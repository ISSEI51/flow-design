import { useEffect, useMemo, useRef, useState } from "react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldOptionalMark, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormActions, FormRow, SaveBlockerNotice, focusFormControl } from "@/patterns/form-layout"
import { useFormState, type FormFields, type FormSaveResult, submitOnEnter } from "@/patterns/form-state"
import { Section, SectionHeader, SectionStack, SectionTitle } from "@/patterns/section-layout"
import { useUnsavedChanges } from "@/patterns/unsaved-changes"

import {
  checkCustomerCode,
  createCustomer,
  customerName,
  listCustomers,
  matchesSavedCustomer,
  lookupZip,
  plans,
  updateCustomer,
  type Customer,
} from "../../data/forms-workflows/server"

// 顧客の登録と編集のフォーム（製品側のコードの例）。登録と編集で、項目の順序とまとまりを同じにする。
// - 保存ボタンは、必須の項目がそろい、すべての検証が成功するまで押せない。理由をボタンの近くに示す。
// - エラーは入力を終えた（Blur した）項目だけに示す。表示中のエラーは、入力のたびに再検証する。
// - 顧客コードの重複は、入力が止まってからサーバーに確かめる（古い応答は使わない）。
// - 郵便番号から住所を補完する。補完の応答が届く前に利用者が住所を入力した場合は、上書きしない。
// - 種類が個人の場合は会社名を表示しない。値は残し、送信しない。

export type CustomerValues = {
  kind: "corporate" | "individual"
  company: string
  lastName: string
  firstName: string
  code: string
  email: string
  phone: string
  zip: string
  address: string
  plan: string | null
  start: string
  end: string
  note: string
}

export const emptyCustomer: CustomerValues = {
  kind: "corporate",
  company: "",
  lastName: "",
  firstName: "",
  code: "",
  email: "",
  phone: "",
  zip: "",
  address: "",
  // 契約のプランは料金に関わるため、初期値で選ばない
  plan: null,
  start: "",
  end: "",
  note: "",
}

export const customerToValues = (c: Customer): CustomerValues => ({ ...emptyCustomer, ...c, plan: c.plan || null })

const NOTE_MAX = 200
const kinds = [
  { value: "corporate", label: "法人" },
  { value: "individual", label: "個人" },
]

function customerFields(exceptId: string | undefined, ws: string): FormFields<CustomerValues> {
  return {
    kind: { label: "種類", required: true },
    company: { label: "会社名", required: true, active: (v) => v.kind === "corporate", normalize: (v) => v.trim() },
    lastName: { label: "姓", required: true, requiredMessage: "姓を入力してください", normalize: (v) => v.trim() },
    firstName: { label: "名", required: true, requiredMessage: "名を入力してください", normalize: (v) => v.trim() },
    code: {
      label: "顧客コード",
      required: true,
      validate: (v) => (/^C-\d{4}$/.test(v) ? null : "顧客コードは「C-」と 4 桁の数字で入力してください（例：C-0123）"),
      // 顧客コードの重複は、ワークスペースごとに確かめる（ワークスペースは scopeKey として検証のキーに入る）。
      // 確かめられなかった場合は保存できない（asyncFailure の既定 block）。保存の処理でもサーバーが重複を確かめる
      validateAsync: (v, _all, { signal }) => checkCustomerCode(v, { signal, exceptId, ws }),
      asyncTimeoutMs: 5000,
    },
    email: {
      label: "メールアドレス",
      required: true,
      normalize: (v) => v.trim().toLowerCase(),
      validate: (v) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "メールアドレスの形式が正しくありません。「@」の後にドメイン名を入力してください（例：yamada@example.com）",
    },
    phone: { label: "電話番号", validate: (v) => (/^[0-9-]{10,13}$/.test(v) ? null : "電話番号は数字とハイフンで入力してください（例：03-1234-5678）") },
    zip: { label: "郵便番号", validate: (v) => (/^\d{3}-?\d{4}$/.test(v) ? null : "郵便番号は 7 桁の数字で入力してください（例：100-0001）") },
    address: { label: "住所", normalize: (v) => v.trim() },
    plan: { label: "契約プラン", required: true, requiredMessage: "契約プランを選んでください" },
    start: { label: "開始日", required: true, requiredMessage: "契約の開始日を入力してください" },
    end: {
      label: "終了日",
      validate: (v, all) => (all.start && v < all.start ? "終了日は開始日と同じか、後の日付にしてください" : null),
    },
    note: { label: "備考", validate: (v) => (v.length <= NOTE_MAX ? null : `備考は ${NOTE_MAX} 文字以内で入力してください（現在 ${v.length} 文字）`) },
  }
}

export type CustomerSaved = {
  id: string
  name: string
  continueNext: boolean
  /** 保存中に値が変わり、未保存の変更が残っている（製品は移動しない） */
  changedWhileSaving?: boolean
}

export function CustomerForm({
  mode,
  initial,
  customerId,
  ws = "hq",
  idPrefix,
  label,
  onSaved,
  onCancel,
  allowContinue = false,
  sticky = false,
  testId,
}: {
  mode: "create" | "edit"
  initial: CustomerValues
  customerId?: string
  /** ワークスペース。要求の宛先とスコープ */
  ws?: string
  idPrefix: string
  /** 移動の確認の文に示す名前 */
  label?: string
  onSaved: (saved: CustomerSaved) => void
  onCancel: () => void
  /** 登録して次の顧客を続けて登録する操作 */
  allowContinue?: boolean
  sticky?: boolean
  testId?: string
}) {
  const fields = useMemo(() => customerFields(customerId, ws), [customerId, ws])
  // スコープ：ワークスペースとレコード。編集は変更がなければ保存しない（requireChanges）
  const form = useFormState<CustomerValues>({ initialValues: initial, fields, scopeKey: `${ws}:${customerId ?? "new"}`, requireChanges: mode === "edit" })
  const id = (name: keyof CustomerValues) => `${idPrefix}-${name}`
  const noticeId = `${idPrefix}-save-notice`
  const continueRef = useRef(false)
  const [zipState, setZipState] = useState<"idle" | "loading" | "filled" | "none" | "kept">("idle")
  const lastAuto = useRef<string | null>(null)

  // 郵便番号が正しい形になったら、住所を探す。
  // - 探し始めた時点で利用者が入力した住所がある場合は、上書きしない（空か、前回の補完の値のときだけ入れる）。
  // - 応答が届くまでに利用者が住所を変えた場合も、上書きしない（captureEdits と applyAutofill）。
  const zip = form.values.zip
  const zipValid = /^\d{3}-?\d{4}$/.test(zip)
  const addressAtStart = form.values.address
  useEffect(() => {
    if (!zipValid) {
      setZipState("idle")
      return
    }
    if (addressAtStart !== "" && addressAtStart !== lastAuto.current) {
      setZipState("kept")
      return
    }
    const controller = new AbortController()
    const token = form.captureEdits(["address"])
    setZipState("loading")
    lookupZip(zip, controller.signal).then(
      (address) => {
        if (controller.signal.aborted) return
        if (!address) return setZipState("none")
        const applied = form.applyAutofill(token, { address })
        if (applied.length) {
          lastAuto.current = address
          setZipState("filled")
        } else setZipState("kept")
      },
      () => undefined
    )
    return () => controller.abort()
    // 郵便番号の変化だけで探す（住所の入力では探し直さない）
  }, [zip, zipValid])

  const savedId = useRef<string | null>(null)
  const save = form.handleSubmit(
    async (values) => {
      const input = { ...values, plan: values.plan ?? undefined }
      if (mode === "create") {
        const result = await createCustomer(input, ws)
        if (result.status === "success" && result.id) savedId.current = result.id
        return result as FormSaveResult<CustomerValues>
      }
      return (await updateCustomer(customerId!, input, ws)) as FormSaveResult<CustomerValues>
    },
    {
      onBlocked: (blockers) => {
        const first = blockers[0]
        if (first) focusFormControl(id(first.name))
      },
      onSuccess: (saved, { changedWhileSaving }) => {
        onSaved({ id: savedId.current ?? customerId ?? "", name: customerName(saved), continueNext: continueRef.current, changedWhileSaving })
        if (continueRef.current) {
          form.reset(emptyCustomer)
          lastAuto.current = null
          requestAnimationFrame(() => document.getElementById(id("kind"))?.focus())
        }
      },
    }
  )

  useUnsavedChanges({
    dirty: form.isDirty || form.status === "unknown",
    saving: form.submitting,
    // 結果が不明の間は、確認の文を「保存されたかを確認できていません」にする（「保存されていません」と断定しない）
    unknown: form.status === "unknown",
    label,
    revision: form.revision,
    canSave: form.canSubmit,
    onSave: () => save(),
    onDiscard: form.discard,
  })

  // 保存されたかわからない場合：同じ顧客コードの顧客が登録されているかを確かめる
  const [checking, setChecking] = useState(false)
  // 確かめた結果の移動（onSaved）は、resolveUnknown の結果を描画し、未保存の変更の登録を更新した後に行う
  const [confirmedSaved, setConfirmedSaved] = useState<CustomerSaved | null>(null)
  useEffect(() => {
    if (!confirmedSaved) return
    setConfirmedSaved(null)
    onSaved(confirmedSaved)
  }, [confirmedSaved])
  const checkSaved = () => {
    setChecking(true)
    window.setTimeout(() => {
      setChecking(false)
      // 登録は同じ顧客コードの顧客があるか、編集は保存した値がサーバーの値と一致するかで確かめる
      // 照合するのは、結果が不明になった保存で送信した値（その後に入力した値ではない）
      const sent = form.submittedValues ?? form.values
      // 送信した項目（表示していた項目）だけを、すべて比べる
      const sentInput = Object.fromEntries(
        (Object.keys(sent) as (keyof CustomerValues)[])
          .filter((key) => fields[key]?.active?.(sent) ?? true)
          .map((key) => [key, key === "plan" ? (sent.plan ?? undefined) : sent[key]])
      )
      const found =
        mode === "create"
          ? listCustomers(false, ws).find((c) => c.code === sent.code)
          : listCustomers(false, ws).find((c) => c.id === customerId && matchesSavedCustomer(c, sentInput))
      if (found) {
        // 送信した値を基準値にする。送信の後に変えた値は、未保存のまま残る
        form.resolveUnknown({ saved: true, values: sent })
        setConfirmedSaved({ id: found.id, name: customerName(found), continueNext: false })
      } else form.resolveUnknown({ saved: false })
    }, 400)
  }

  const unknown = form.status === "unknown"
  const canPress = form.canSubmit
  const text = (name: "company" | "lastName" | "firstName" | "code" | "email" | "phone" | "zip" | "address" | "note") => ({
    ...form.inputProps(name),
    id: id(name),
  })
  const err = (name: keyof CustomerValues, testid?: string) => {
    const e = form.error(name)
    return e ? <FieldError data-testid={testid ?? `${idPrefix}-${name}-error`}>{e}</FieldError> : null
  }
  const corporate = form.values.kind === "corporate"
  const codeStatus = form.asyncStatus("code")

  return (
    <form
      noValidate
      onSubmit={(e) => {
        continueRef.current = false
        void save(e)
      }}
      onKeyDown={(e) =>
        submitOnEnter(e, () => {
          continueRef.current = false
          return save()
        })
      }
      data-testid={testId}
      data-dirty={form.isDirty || undefined}
      data-status={form.status}
      className="flex min-w-0 flex-col gap-8"
    >
      <p className="text-ui text-muted-foreground">「任意」と書かれていない項目は必須です。</p>
      <SectionStack>
        <Section>
          <SectionHeader>
            <SectionTitle>基本の情報</SectionTitle>
          </SectionHeader>
          <FieldGroup>
            <Field invalid={!!form.error("kind")}>
              <FieldLabel>種類</FieldLabel>
              <Select items={kinds} value={form.values.kind} onValueChange={(v) => form.setValue("kind", v as CustomerValues["kind"], { commit: true })}>
                <SelectTrigger id={id("kind")} className="max-w-60" data-testid={`${idPrefix}-kind`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {corporate && (
              <Field invalid={!!form.error("company")}>
                <FieldLabel>会社名</FieldLabel>
                <Input {...text("company")} autoComplete="organization" />
                <FieldDescription>「株式会社」などを含む正式な名前</FieldDescription>
                {err("company")}
              </Field>
            )}
            <FieldSet>
              <FieldLegend variant="label">{corporate ? "担当者の氏名" : "氏名"}</FieldLegend>
              <FormRow>
                <Field invalid={!!form.error("lastName")}>
                  <FieldLabel>姓</FieldLabel>
                  <Input {...text("lastName")} autoComplete="family-name" />
                  {err("lastName")}
                </Field>
                <Field invalid={!!form.error("firstName")}>
                  <FieldLabel>名</FieldLabel>
                  <Input {...text("firstName")} autoComplete="given-name" />
                  {err("firstName")}
                </Field>
              </FormRow>
            </FieldSet>
            <Field invalid={!!form.error("code") || codeStatus === "error"}>
              <FieldLabel>顧客コード</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Input {...text("code")} className="max-w-48" autoComplete="off" spellCheck={false} />
                {codeStatus === "error" && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => form.revalidate("code")} data-testid={`${idPrefix}-code-recheck`}>
                    もう一度確かめる
                  </Button>
                )}
              </div>
              {form.error("code") ? (
                err("code")
              ) : (
                <FieldDescription role="status" data-testid={`${idPrefix}-code-status`}>
                  {codeStatus === "validating" || codeStatus === "pending"
                    ? "登録済みのコードと重ならないかを確かめています"
                    : codeStatus === "valid"
                      ? "このコードは使えます"
                      : codeStatus === "error"
                        ? (form.asyncMessage("code") ?? "重複を確かめられませんでした")
                        : "C-0123 の形。ほかの顧客と同じコードは使えません"}
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </Section>

        <Section>
          <SectionHeader>
            <SectionTitle>連絡先</SectionTitle>
          </SectionHeader>
          <FieldGroup>
            <Field invalid={!!form.error("email")}>
              <FieldLabel>メールアドレス</FieldLabel>
              <Input {...text("email")} type="email" autoComplete="email" />
              {err("email")}
            </Field>
            <Field invalid={!!form.error("phone")}>
              <FieldLabel>
                電話番号
                <FieldOptionalMark />
              </FieldLabel>
              <Input {...text("phone")} type="tel" autoComplete="tel" className="max-w-60" />
              {err("phone")}
            </Field>
            <Field invalid={!!form.error("zip")}>
              <FieldLabel>
                郵便番号
                <FieldOptionalMark />
              </FieldLabel>
              <Input {...text("zip")} inputMode="numeric" autoComplete="postal-code" className="max-w-40" />
              {form.error("zip") ? err("zip") : <FieldDescription>入力すると、住所の都道府県と市区町村を補完します</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel>
                住所
                <FieldOptionalMark />
              </FieldLabel>
              <Input {...text("address")} autoComplete="street-address" />
              <FieldDescription role="status" data-testid={`${idPrefix}-zip-status`}>
                {zipState === "loading"
                  ? "郵便番号から住所を探しています"
                  : zipState === "filled"
                    ? "郵便番号から入力しました。番地を続けて入力してください"
                    : zipState === "none"
                      ? "この郵便番号の住所は見つかりませんでした"
                      : zipState === "kept"
                        ? "入力した住所を残しました（郵便番号からの補完で上書きしていません）"
                        : ""}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </Section>

        <Section>
          <SectionHeader>
            <SectionTitle>契約</SectionTitle>
          </SectionHeader>
          <FieldGroup>
            <Field invalid={!!form.error("plan")}>
              <FieldLabel>契約プラン</FieldLabel>
              <Select items={plans} value={form.values.plan} onValueChange={(v) => form.setValue("plan", v as string | null, { commit: true })}>
                <SelectTrigger id={id("plan")} data-testid={`${idPrefix}-plan`}>
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("plan")}
            </Field>
            <FieldSet>
              <FieldLegend variant="label">契約の期間</FieldLegend>
              <FormRow>
                <Field invalid={!!form.error("start")}>
                  <FieldLabel>開始日</FieldLabel>
                  <Input id={id("start")} type="date" value={form.values.start} required onChange={(e) => form.setValue("start", e.target.value, { commit: true })} />
                  {err("start")}
                </Field>
                <Field invalid={!!form.error("end")}>
                  <FieldLabel>
                    終了日
                    <FieldOptionalMark />
                  </FieldLabel>
                  <Input id={id("end")} type="date" value={form.values.end} onChange={(e) => form.setValue("end", e.target.value, { commit: true })} />
                  {err("end")}
                </Field>
              </FormRow>
            </FieldSet>
            <Field invalid={!!form.error("note")}>
              <FieldLabel>
                備考
                <FieldOptionalMark />
              </FieldLabel>
              <Textarea {...text("note")} rows={3} />
              {form.error("note") ? (
                err("note")
              ) : (
                <FieldDescription>
                  {form.values.note.length} / {NOTE_MAX} 文字
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </Section>
      </SectionStack>

      {form.formError && (
        <Alert variant={unknown ? "warning" : "destructive"} role="alert" data-testid={`${idPrefix}-form-error`}>
          <AlertTitle>{unknown ? "保存されたかを確かめられていません" : "保存できませんでした"}</AlertTitle>
          <AlertDescription>{form.formError}</AlertDescription>
          {unknown && (
            <AlertAction>
              <Button size="sm" variant="secondary" loading={checking} onClick={checkSaved}>
                {mode === "create" ? "登録されたかを確認" : "保存されたかを確認"}
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}

      <FormActions
        sticky={sticky}
        notice={
          <>
            <SaveBlockerNotice
              id={noticeId}
              data-testid={`${idPrefix}-save-notice`}
              blockers={form.blockers}
              // 結果が不明、保存中、変換中も、保存ボタンの aria-describedby の参照先に理由を置く（空にしない）
              reason={unknown ? "unknown" : form.submitting ? "submitting" : form.composing ? "composing" : undefined}
              unchanged={form.unchanged}
              detail
              onFocusField={(name) => focusFormControl(id(name))}
            />
            {form.status === "succeeded" && form.isDirty && (
              <p className="text-ui text-muted-foreground" role="status">
                保存中に変えた内容は、まだ保存していません
              </p>
            )}
          </>
        }
      >
        <Button type="button" variant="secondary" onClick={onCancel} disabled={form.submitting}>
          キャンセル
        </Button>
        {allowContinue && (
          <Button
            type="button"
            variant="secondary"
            disabled={!canPress}
            focusableWhenDisabled
            aria-describedby={noticeId}
            onClick={() => {
              continueRef.current = true
              void save()
            }}
          >
            登録して次へ
          </Button>
        )}
        <Button
          type="submit"
          loading={form.submitting}
          disabled={!canPress}
          focusableWhenDisabled
          aria-describedby={noticeId}
          data-testid={`${idPrefix}-submit`}
        >
          {mode === "create" ? "登録する" : "保存する"}
        </Button>
      </FormActions>
    </form>
  )
}
