import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldOptionalMark, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormActions, FormRow, SaveBlockerNotice, focusFormControl } from "@/patterns/form-layout"
import { useFormState, type FormFields, submitOnEnter } from "@/patterns/form-state"
import { Section as PatternSection, SectionHeader, SectionStack, SectionTitle } from "@/patterns/section-layout"

import { PageHeader } from "../../layout/page-header"
import { Compare, Section } from "../../layout/section"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoFrame, Mock, Rules } from "../data-browsing/doc-parts"

type BillingValues = {
  lastName: string
  firstName: string
  delivery: "email" | "post"
  email: string
  zip: string
  address: string
  start: string
  end: string
  limit: string
  currency: string
}

const fields: FormFields<BillingValues> = {
  lastName: { label: "姓", required: true, requiredMessage: "姓を入力してください" },
  firstName: { label: "名", required: true, requiredMessage: "名を入力してください" },
  delivery: { label: "送付の方法", required: true },
  email: {
    label: "送付先のメールアドレス",
    required: true,
    active: (v) => v.delivery === "email",
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "メールアドレスの形式が正しくありません（例：keiri@example.com）"),
  },
  zip: { label: "郵便番号", required: true, active: (v) => v.delivery === "post", validate: (v) => (/^\d{3}-?\d{4}$/.test(v) ? null : "郵便番号は 7 桁の数字で入力してください（例：100-0001）") },
  address: { label: "住所", required: true, active: (v) => v.delivery === "post" },
  start: { label: "開始日", required: true, requiredMessage: "開始日を入力してください" },
  end: { label: "終了日", validate: (v, all) => (all.start && v < all.start ? "終了日は開始日と同じか、後の日付にしてください" : null) },
  limit: { label: "上限の金額", validate: (v) => (/^\d{1,9}$/.test(v) ? null : "金額は半角の数字で入力してください（例：50000）") },
  currency: { label: "通貨" },
}

const initial: BillingValues = { lastName: "", firstName: "", delivery: "email", email: "", zip: "", address: "", start: "", end: "", limit: "", currency: "JPY" }
const deliveries = [
  { value: "email", label: "メール" },
  { value: "post", label: "郵送" },
]
const currencies = [
  { value: "JPY", label: "円" },
  { value: "USD", label: "米ドル" },
]

function BillingExample() {
  const form = useFormState<BillingValues>({ initialValues: initial, fields })
  const [sent, setSent] = useState<Partial<BillingValues> | null>(null)
  const id = (n: keyof BillingValues) => `fl-${n}`
  const save = form.handleSubmit(
    async (v) => {
      setSent(v)
      return { status: "success" }
    },
    { onBlocked: (b) => b[0] && focusFormControl(id(b[0].name)) }
  )
  const err = (n: keyof BillingValues) => (form.error(n) ? <FieldError>{form.error(n)}</FieldError> : null)
  const t = (n: "lastName" | "firstName" | "email" | "zip" | "address" | "limit") => ({ ...form.inputProps(n), id: id(n) })
  return (
    <form noValidate onSubmit={(e) => void save(e)} onKeyDown={(e) => submitOnEnter(e, save)} className="flex max-w-[40rem] flex-col gap-8" data-testid="fl-form">
      <p className="text-ui text-muted-foreground">「任意」と書かれていない項目は必須です。</p>
      <SectionStack>
        <PatternSection>
          <SectionHeader>
            <SectionTitle>宛名</SectionTitle>
          </SectionHeader>
          <FieldSet>
            <FieldLegend variant="label" className="sr-only">
              氏名
            </FieldLegend>
            <FormRow data-testid="fl-name-row">
              <Field invalid={!!form.error("lastName")}>
                <FieldLabel>姓</FieldLabel>
                <Input {...t("lastName")} autoComplete="family-name" />
                {err("lastName")}
              </Field>
              <Field invalid={!!form.error("firstName")}>
                <FieldLabel>名</FieldLabel>
                <Input {...t("firstName")} autoComplete="given-name" />
                {err("firstName")}
              </Field>
            </FormRow>
          </FieldSet>
        </PatternSection>
        <PatternSection>
          <SectionHeader>
            <SectionTitle>送付先</SectionTitle>
          </SectionHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>送付の方法</FieldLabel>
              <Select items={deliveries} value={form.values.delivery} onValueChange={(v) => form.setValue("delivery", v as BillingValues["delivery"], { commit: true })}>
                <SelectTrigger id={id("delivery")} className="max-w-60" data-testid="fl-delivery">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deliveries.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>選んだ方法に必要な項目だけを表示します。切り替えても、入力した値は残ります</FieldDescription>
            </Field>
            {form.isActive("email") && (
              <Field invalid={!!form.error("email")}>
                <FieldLabel>送付先のメールアドレス</FieldLabel>
                <Input {...t("email")} type="email" autoComplete="email" />
                {err("email")}
              </Field>
            )}
            {form.isActive("zip") && (
              <>
                <Field invalid={!!form.error("zip")}>
                  <FieldLabel>郵便番号</FieldLabel>
                  <Input {...t("zip")} inputMode="numeric" autoComplete="postal-code" className="max-w-40" />
                  {err("zip")}
                </Field>
                <Field invalid={!!form.error("address")}>
                  <FieldLabel>住所</FieldLabel>
                  <Input {...t("address")} autoComplete="street-address" />
                  {err("address")}
                </Field>
              </>
            )}
          </FieldGroup>
        </PatternSection>
        <PatternSection>
          <SectionHeader>
            <SectionTitle>請求の条件</SectionTitle>
          </SectionHeader>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">請求の期間</FieldLegend>
              <FormRow>
                <Field invalid={!!form.error("start")}>
                  <FieldLabel>開始日</FieldLabel>
                  <Input id={id("start")} type="date" required value={form.values.start} onChange={(e) => form.setValue("start", e.target.value, { commit: true })} />
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
            <FieldSet>
              <FieldLegend variant="label">
                1 か月の上限
                <FieldOptionalMark className="ml-1" />
              </FieldLegend>
              <FormRow columns="value-unit">
                <Field invalid={!!form.error("limit")}>
                  <FieldLabel>上限の金額</FieldLabel>
                  <Input {...t("limit")} inputMode="numeric" />
                  {err("limit")}
                </Field>
                <Field>
                  <FieldLabel>通貨</FieldLabel>
                  <Select items={currencies} value={form.values.currency} onValueChange={(v) => form.setValue("currency", String(v), { commit: true })}>
                    <SelectTrigger id={id("currency")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>
            </FieldSet>
          </FieldGroup>
        </PatternSection>
      </SectionStack>
      <FormActions notice={<SaveBlockerNotice id="fl-notice" blockers={form.blockers} hidden={form.composing} />}>
        <Button type="submit" disabled={!form.canSubmit} focusableWhenDisabled aria-describedby="fl-notice" data-testid="fl-submit">
          請求先を登録
        </Button>
      </FormActions>
      {sent && (
        <div className="flex flex-col gap-2" role="status" data-testid="fl-sent">
          <p className="text-ui font-medium">送信する値（この例は保存しません）</p>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1 text-ui">
            {Object.entries(sent).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{fields[k as keyof BillingValues].label}</dt>
                <dd data-key={k}>{String(v) || "（空）"}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </form>
  )
}

const bar = (w: string, strong = false) => <div className={`h-2 rounded-full ${strong ? "bg-muted-foreground/60" : "bg-muted"}`} style={{ width: w }} />
const box = <div className="h-8 rounded-md border border-border" />

export function FormLayoutPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Forms & Workflows"
        name="Form Layout"
        lead="利用者が考える順に、1 列で項目を並べる。関係の強い項目だけを横に並べ、まとまりは余白と見出しで区切る。必要な項目だけを、必要なときに表示する。"
      />

      <Section title="操作できる例" lead="請求先の登録。送付の方法で、表示する項目が変わる（非表示の項目の値は残し、送信しない）。必須の項目がそろうまで、登録のボタンは押せない。">
        <div className="flex flex-col gap-6">
          <DemoFrame testId="fl-demo">
            <BillingExample />
          </DemoFrame>
          <AppLink href="#/forms-app?page=customer-new">検証画面で、顧客の登録（自動補完と非同期の検証）を試す</AppLink>
        </div>
      </Section>

      <Section title="列とまとまり">
        <Rules
          rows={[
            ["列", "原則 1 列。姓と名、開始日と終了日、最小値と最大値、数値と単位など、関係の強い項目だけを横に並べる（FormRow）。空いた場所を埋めるために並べない"],
            ["狭い領域", "FormRow は、置かれた領域が 28rem より狭いと 1 列になる。視覚の順序と DOM、キーボードの順序は同じ"],
            ["幅", "Page Layout の Focused（40rem、640px）を基本とする。入力欄は幅いっぱい。郵便番号、コード、金額など短い値は、入力が見えなくならない範囲で狭める"],
            ["ラベル", "入力欄の上。Placeholder をラベルの代わりにしない。左に置くのは、専門的な業務の画面などで理由がある場合だけ"],
            ["必須と任意", "少ない方に印を付け、フォームの上に凡例を置く。色だけで伝えない。表示と実際の必須の条件を一致させる（useFormState の required）"],
            ["間隔", "ラベルと入力欄 8px（Field）、項目の間 16px（FieldGroup）、情報のグループの間 24〜32px（FieldSet）、セクションの間 32〜48px（SectionStack）"],
            ["区切り", "Section の見出しと余白で区切る。フォームを Card で囲んだり、項目ごとに線を引いたりしない"],
          ]}
        />
      </Section>

      <Section title="条件付きの入力と自動補完">
        <Bullets
          items={[
            "条件によって不要になる項目は、表示しない。useFormState の active が false の項目は、検証、保存の可否、送信する値、未保存の判定から除く。",
            "非表示にしても値は消さない。条件を戻すと、入力した値がそのまま表示される。破棄が必要な場合は、理由を示してから製品が消す。",
            "自動補完（郵便番号から住所など）で入った値は、利用者が直せる。補完の応答が届く前に利用者が変えた値は、上書きしない（captureEdits と applyAutofill）。",
            "契約の条件、金額、権限など、重要な選択肢を初期値で選ばない。",
          ]}
        />
      </Section>

      <Section title="操作ボタン">
        <Bullets
          items={[
            "フォームの末尾に置く（FormActions）。キャンセルは Secondary、保存は Primary。ボタンの文言は「登録する」「保存する」「担当者を変更」のように、行う操作を示す。",
            "保存できない理由は、保存ボタンの近くに示す（SaveBlockerNotice）。長いフォームでは、項目ごとのボタンから該当する項目へ移動できる。",
            "長いフォームと Sheet では、画面の下に固定してよい（sticky）。固定しても、フォーカスした入力欄とエラーが隠れないよう、スクロールの余白（scroll-padding-bottom）を取る。",
            "モバイルでは Safe Area の余白を含め、文字の入力中は固定を解除する（ソフトウェアキーボードの上に残さない）。",
          ]}
        />
      </Section>

      <Section title="比較">
        <Compare
          bad={
            <Mock label="関係のない項目を 2 列に並べ、ラベルの代わりに Placeholder を使ったフォーム">
              <div className="grid grid-cols-2 gap-3">
                {["会社名", "電話番号", "メールアドレス", "郵便番号"].map((p) => (
                  <div key={p} className="flex h-8 items-center rounded-md border border-border px-2 text-caption text-muted-foreground">
                    {p}
                  </div>
                ))}
              </div>
            </Mock>
          }
          badNote="空いた場所を埋めるために 2 列にすると、読む順序が左右と上下に分かれる。Placeholder は入力を始めると消え、何の欄かわからなくなる。"
          good={
            <Mock label="ラベルを入力欄の上に置いた 1 列のフォーム。姓と名だけを横に並べている">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    {bar("40%", true)}
                    {box}
                  </div>
                  <div className="flex flex-col gap-1">
                    {bar("40%", true)}
                    {box}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {bar("30%", true)}
                  {box}
                </div>
                <div className="flex flex-col gap-1">
                  {bar("35%", true)}
                  {box}
                </div>
              </div>
            </Mock>
          }
          goodNote="上から順に読み、入力する。横に並べるのは、姓と名のように 1 つの情報を構成する項目だけにする。"
        />
        <Compare
          bad={
            <Mock label="すべての項目に必須の印を付け、赤い色だけで示したフォーム">
              {["会社名 *", "担当者名 *", "メールアドレス *"].map((p) => (
                <div key={p} className="flex flex-col gap-1">
                  <span className="text-caption text-destructive">{p}</span>
                  {box}
                </div>
              ))}
            </Mock>
          }
          badNote="印が多いと、印のない項目が目立たない。色だけでは、色の区別がしにくい利用者に伝わらない。"
          good={
            <Mock label="必須が多いフォームで、任意の項目にだけ「任意」と書いたフォーム">
              <span className="text-caption text-muted-foreground">「任意」と書かれていない項目は必須です。</span>
              {["会社名", "担当者名", "電話番号 任意"].map((p) => (
                <div key={p} className="flex flex-col gap-1">
                  <span className="text-caption">{p}</span>
                  {box}
                </div>
              ))}
            </Mock>
          }
          goodNote="少ない方に印を付け、凡例で意味を示す。「任意」は文字なので、ラベルの一部として読み上げられる。"
        />
      </Section>
    </article>
  )
}
