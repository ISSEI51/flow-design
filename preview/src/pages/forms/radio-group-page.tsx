import { Field, FieldError, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const sizes = [
  { value: "small", label: "1〜49 人" },
  { value: "medium", label: "50〜299 人" },
  { value: "large", label: "300 人以上" },
]

function Group({
  testid,
  legend,
  options,
  disabled,
  invalid,
  defaultValue,
}: {
  testid?: string
  legend: string
  options: { value: string; label: string }[]
  disabled?: boolean
  invalid?: boolean
  defaultValue?: string
}) {
  return (
    <Field disabled={disabled} invalid={invalid} className="max-w-md">
      <FieldSet render={<RadioGroup data-testid={testid} defaultValue={defaultValue} />}>
        <FieldLegend variant="label">{legend}</FieldLegend>
        <div>
          {options.map((o) => (
            <FieldItem key={o.value}>
              <RadioGroupItem value={o.value} />
              <FieldLabel>{o.label}</FieldLabel>
            </FieldItem>
          ))}
        </div>
      </FieldSet>
      {invalid && <FieldError>従業員の規模を選んでください</FieldError>}
    </Field>
  )
}

export function RadioGroupPage() {
  return (
    <article>
      <PageHeader
        name="Radio Group"
        lead="排他的な選択。Flow Design の単一選択は Select を優先する。既存画面との互換など、必要な場合にだけ使う。"
      />

      <Section title="基本" lead="Tab キーでグループに入り、↑↓←→ キーで選択を移す。">
        <Row label="選択済み">
          <Group testid="radio-basic" legend="従業員の規模" options={sizes} defaultValue="medium" />
        </Row>
        <Row label="未選択">
          <Group legend="従業員の規模" options={sizes} />
        </Row>
      </Section>

      <Section title="状態">
        <Row label="無効">
          <Group testid="radio-disabled" legend="従業員の規模" options={sizes} defaultValue="small" disabled />
        </Row>
        <Row label="エラー">
          <Group testid="radio-error" legend="従業員の規模" options={sizes} invalid />
        </Row>
      </Section>

      <Section title="長いラベル">
        <Row label="日本語・英語">
          <Group
            legend="支払い方法"
            options={[
              { value: "transfer", label: "銀行振込（請求書の発行日から 30 日以内に指定の口座へ振り込む）" },
              { value: "debit", label: "Direct debit from the registered bank account on the 27th of each month" },
            ]}
          />
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={<Group legend="従業員の規模" options={sizes} defaultValue="small" />}
          badNote="新しいフォームの単一選択に Radio Group を使う。Select と混在すると、選び方がそろわない。"
          good={
            <Field className="max-w-sm">
              <FieldLabel>従業員の規模</FieldLabel>
              <Select items={sizes} defaultValue="small">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sizes.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          }
          goodNote="単一選択は Select にする。Radio Group は既存の画面と表現をそろえる必要がある場合に使う。"
        />
      </Section>
    </article>
  )
}
