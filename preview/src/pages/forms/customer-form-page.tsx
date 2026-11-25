import { useRef, useState, type ChangeEvent, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldItem,
  FieldLabel,
  FieldLegend,
  FieldOptionalMark,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { industries, plans } from "../../data/industries"
import { PageHeader } from "../../layout/page-header"
import { useInstantSetting } from "./switch-page"

// 顧客登録のフォームの例。検証の規則は、コンポーネントではなくこの画面が持つ。
// - 文字の項目は、フォーカスが外れたとき（blur）と送信時に検証する。
// - 一度エラーを表示した項目は、入力に応じて再検証する。
// - 文字数の上限だけは、入力中に知らせる。
// - IME で変換中の文字は検証しない。変換が確定したときに検証する。
// - 選択式の項目は、送信時に検証し、エラーの表示後は選び直したときに再検証する。

const NOTE_MAX = 200

type Values = {
  companyName: string
  companyKana: string
  industry: string | null
  employees: string
  contactName: string
  email: string
  phone: string
  plan: string | null
  delivery: string[]
  note: string
  agree: boolean
}
type Name = keyof Values

const initial: Values = {
  companyName: "",
  companyKana: "",
  industry: null,
  employees: "",
  contactName: "",
  email: "",
  phone: "",
  plan: null,
  delivery: [],
  note: "",
  agree: false,
}

const ids: Record<Name, string> = {
  companyName: "customer-company",
  companyKana: "customer-kana",
  industry: "customer-industry",
  employees: "customer-employees",
  contactName: "customer-contact",
  email: "customer-email",
  phone: "customer-phone",
  plan: "customer-plan",
  delivery: "customer-delivery-email",
  note: "customer-note",
  agree: "customer-agree",
}

function validate(name: Name, v: Values): string | null {
  switch (name) {
    case "companyName":
      return v.companyName.trim() ? null : "会社名を入力してください"
    case "companyKana":
      if (!v.companyKana.trim()) return "会社名のフリガナを入力してください"
      return /^[ァ-ヶー・\s　]+$/.test(v.companyKana)
        ? null
        : "フリガナは全角カタカナで入力してください（例：ヤマダショウジ）"
    case "industry":
      return v.industry ? null : "業種を選んでください。当てはまるものがない場合は「サービス業（他に分類されないもの）」を選びます"
    case "employees":
      if (!v.employees) return null
      return /^[1-9][0-9]*$/.test(v.employees) ? null : "従業員数は 1 以上の整数で入力してください"
    case "contactName":
      return v.contactName.trim() ? null : "担当者名を入力してください"
    case "email":
      if (!v.email.trim()) return "メールアドレスを入力してください"
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)
        ? null
        : "メールアドレスの形式が正しくありません。「@」の後にドメイン名を入力してください（例：yamada@example.com）"
    case "phone":
      if (!v.phone) return null
      return /^[0-9-]{10,13}$/.test(v.phone) ? null : "電話番号は数字とハイフンで入力してください（例：03-1234-5678）"
    case "plan":
      return v.plan ? null : "契約プランを選んでください"
    case "delivery":
      return v.delivery.length ? null : "請求書の送付方法を 1 つ以上選んでください"
    case "note":
      return v.note.length <= NOTE_MAX ? null : `備考は ${NOTE_MAX} 文字以内で入力してください（現在 ${v.note.length} 文字）`
    case "agree":
      return v.agree ? null : "利用規約への同意が必要です。内容を確認し、チェックを入れてください"
  }
}

const names = Object.keys(initial) as Name[]

// エラーの概要から、該当する項目へフォーカスを移す。
// Checkbox と Switch の id は Base UI が隠れた input に付けるため、同じ Field の操作要素を探す。
function focusControl(id: string) {
  const el = document.getElementById(id)
  const target =
    el instanceof HTMLInputElement && el.getAttribute("aria-hidden") === "true"
      ? el.closest("[data-slot=field], [data-slot=field-item]")?.querySelector<HTMLElement>("[role=checkbox],[role=switch]")
      : el
  target?.focus()
  target?.scrollIntoView({ block: "center" })
}

export function CustomerFormPage() {
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Partial<Record<Name, string>>>({})
  const [summary, setSummary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<[string, string][] | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  // 一度でも入力した項目。何も入力せずにフォーカスが通り過ぎただけでは、エラーを出さない。
  const dirty = useRef(new Set<Name>())
  const billing = useInstantSetting(true)
  const overdue = useInstantSetting(false, true)

  const revalidate = (name: Name, next: Values) =>
    setErrors((e) => {
      const message = validate(name, next)
      const { [name]: _, ...rest } = e
      return message ? { ...rest, [name]: message } : rest
    })

  // 値を更新する。エラーを表示中の項目と、文字数の上限だけを入力中に再検証する。
  const update = <N extends Name>(name: N, value: Values[N], composing = false) => {
    const next = { ...values, [name]: value }
    dirty.current.add(name)
    setValues(next)
    setResult(null)
    if (composing) return
    if (name in errors || name === "note") revalidate(name, next)
  }

  const text = (name: Name) => ({
    id: ids[name],
    value: values[name] as string,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      update(name, e.target.value, (e.nativeEvent as InputEvent).isComposing),
    onCompositionEnd: (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) =>
      update(name, e.currentTarget.value),
    onBlur: () => {
      if (dirty.current.has(name) || name in errors) revalidate(name, values)
    },
  })

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (saving) return
    const all: Partial<Record<Name, string>> = {}
    for (const n of names) {
      const m = validate(n, values)
      if (m) all[n] = m
    }
    setErrors(all)
    if (Object.keys(all).length) {
      setSummary(true)
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    setSummary(false)
    const data = new FormData(e.currentTarget)
    setSaving(true)
    window.setTimeout(() => {
      setSaving(false)
      setResult([...data.keys()].filter((k, i, a) => a.indexOf(k) === i).map((k) => [k, data.getAll(k).join(", ")]))
    }, 800)
  }

  const errorList = names.filter((n) => errors[n])

  return (
    <article>
      <PageHeader
        name="フォームの例：顧客の登録"
        lead="8 種類の入力コンポーネントと Button を組み合わせた、操作できるフォーム。単一選択は Select にそろえている。"
      />

      <form noValidate onSubmit={onSubmit} className="flex max-w-xl flex-col gap-8" data-testid="customer-form">
        <p className="text-ui text-muted-foreground" data-testid="form-legend">
          「任意」と書かれていない項目は必須です。
        </p>

        {summary && errorList.length > 0 && (
          <div
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
            data-testid="error-summary"
            className="rounded-xl border border-destructive p-6 outline-none focus-visible:focus-ring"
          >
            <p className="text-heading">入力内容を確認してください（{errorList.length} 件）</p>
            <ul className="mt-4 flex flex-col gap-2 text-ui">
              {errorList.map((n) => (
                <li key={n}>
                  <a
                    href={`#${ids[n]}`}
                    className="text-destructive underline underline-offset-4"
                    onClick={(e) => {
                      e.preventDefault()
                      focusControl(ids[n])
                    }}
                  >
                    {errors[n]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <FieldSet>
          <FieldLegend>会社の情報</FieldLegend>
          <FieldGroup>
            <Field name="companyName" invalid={!!errors.companyName}>
              <FieldLabel>会社名</FieldLabel>
              <Input {...text("companyName")} required autoComplete="organization" />
              <FieldDescription>「株式会社」などを含む正式な名前</FieldDescription>
              {errors.companyName && <FieldError>{errors.companyName}</FieldError>}
            </Field>
            <Field name="companyKana" invalid={!!errors.companyKana}>
              <FieldLabel>会社名（フリガナ）</FieldLabel>
              <Input {...text("companyKana")} required />
              {errors.companyKana && <FieldError data-testid="kana-error">{errors.companyKana}</FieldError>}
            </Field>
            <Field name="industry" invalid={!!errors.industry}>
              <FieldLabel>業種</FieldLabel>
              <Select
                items={industries}
                required
                value={values.industry}
                onValueChange={(v) => update("industry", v as string | null)}
              >
                <SelectTrigger id={ids.industry}>
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.industry && <FieldError>{errors.industry}</FieldError>}
            </Field>
            <Field name="employees" invalid={!!errors.employees}>
              <FieldLabel>
                従業員数
                <FieldOptionalMark />
              </FieldLabel>
              <Input {...text("employees")} type="number" inputMode="numeric" min={1} className="max-w-40" />
              {errors.employees && <FieldError>{errors.employees}</FieldError>}
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>担当者</FieldLegend>
          <FieldGroup>
            <Field name="contactName" invalid={!!errors.contactName}>
              <FieldLabel>担当者名</FieldLabel>
              <Input {...text("contactName")} required autoComplete="name" />
              {errors.contactName && <FieldError>{errors.contactName}</FieldError>}
            </Field>
            <Field name="email" invalid={!!errors.email}>
              <FieldLabel>メールアドレス</FieldLabel>
              <Input {...text("email")} type="email" required autoComplete="email" />
              {errors.email && <FieldError data-testid="email-error">{errors.email}</FieldError>}
            </Field>
            <Field name="phone" invalid={!!errors.phone}>
              <FieldLabel>
                電話番号
                <FieldOptionalMark />
              </FieldLabel>
              <Input {...text("phone")} type="tel" autoComplete="tel" />
              {errors.phone && <FieldError>{errors.phone}</FieldError>}
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>契約</FieldLegend>
          <FieldGroup>
            <Field name="plan" invalid={!!errors.plan}>
              <FieldLabel>契約プラン</FieldLabel>
              <Select items={plans} required value={values.plan} onValueChange={(v) => update("plan", v as string | null)}>
                <SelectTrigger id={ids.plan}>
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
              {errors.plan && <FieldError>{errors.plan}</FieldError>}
            </Field>
            <Field invalid={!!errors.delivery}>
              <FieldSet>
                <FieldLegend variant="label">請求書の送付方法</FieldLegend>
                <FieldDescription>複数選べる</FieldDescription>
                <div>
                  {[
                    { value: "email", label: "メール" },
                    { value: "post", label: "郵送" },
                  ].map((o) => (
                    <FieldItem key={o.value}>
                      <Checkbox
                        id={`customer-delivery-${o.value}`}
                        name="delivery"
                        value={o.value}
                        checked={values.delivery.includes(o.value)}
                        onCheckedChange={(c) =>
                          update(
                            "delivery",
                            c ? [...values.delivery, o.value] : values.delivery.filter((d) => d !== o.value)
                          )
                        }
                      />
                      <FieldLabel>{o.label}</FieldLabel>
                    </FieldItem>
                  ))}
                </div>
              </FieldSet>
              {errors.delivery && <FieldError>{errors.delivery}</FieldError>}
            </Field>
            <Field name="note" invalid={!!errors.note}>
              <FieldLabel>
                備考
                <FieldOptionalMark />
              </FieldLabel>
              <Textarea {...text("note")} rows={4} data-testid="note" />
              {errors.note ? (
                <FieldError>{errors.note}</FieldError>
              ) : (
                <FieldDescription>
                  {values.note.length} / {NOTE_MAX} 文字
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </FieldSet>

        <Field orientation="horizontal" name="agree" invalid={!!errors.agree} className="flex-wrap">
          <Checkbox id={ids.agree} required checked={values.agree} onCheckedChange={(c) => update("agree", c)} />
          <FieldLabel>利用規約に同意する</FieldLabel>
          {errors.agree && <FieldError className="w-full">{errors.agree}</FieldError>}
        </Field>

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setValues(initial)
              dirty.current.clear()
              setErrors({})
              setSummary(false)
              setResult(null)
            }}
          >
            入力内容を消す
          </Button>
          <Button type="submit" loading={saving} data-testid="customer-submit">
            顧客を登録
          </Button>
        </div>

        <div role="status" data-testid="customer-status" className="text-ui">
          {saving ? "登録しています" : result ? "顧客を登録しました" : ""}
        </div>
        {result && (
          <dl data-testid="customer-result" className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-ui">
            {result.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd data-key={k}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </form>

      <section className="mt-24 max-w-xl" aria-labelledby="notify-heading">
        <h2 id="notify-heading" className="text-section">
          通知の設定
        </h2>
        <p className="mt-2 text-body text-muted-foreground">切り替えた時点で保存される。保存ボタンはない。</p>
        <div className="mt-6 flex flex-col">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>請求書の発行を通知する</FieldLabel>
              <FieldDescription role="status">{billing.message}</FieldDescription>
            </FieldContent>
            <Switch checked={billing.checked} onCheckedChange={billing.change} disabled={billing.pending} />
          </Field>
          <Field orientation="horizontal" invalid={overdue.failed}>
            <FieldContent>
              <FieldLabel>入金の遅れを通知する</FieldLabel>
              <FieldDescription role="status" className={overdue.failed ? "text-destructive" : undefined}>
                {overdue.message}
              </FieldDescription>
            </FieldContent>
            <Switch checked={overdue.checked} onCheckedChange={overdue.change} disabled={overdue.pending} />
          </Field>
        </div>
      </section>
    </article>
  )
}
