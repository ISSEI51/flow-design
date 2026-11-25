import { useState } from "react"

import { Field, FieldDescription, FieldError, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { industries, plans } from "../../data/industries"
import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const longOptions = [
  { value: "a", label: "請求書と納品書を毎月まとめて郵送し、電子版も同時にメールで送る" },
  { value: "b", label: "Send invoices by email only and keep paper copies on request" },
  { value: "c", label: "郵送のみ" },
]

export function SelectPage() {
  const [industry, setIndustry] = useState<string | null>(null)
  return (
    <article>
      <PageHeader
        name="Select"
        lead="選択肢から 1 つを選ぶ。Flow Design の単一選択の標準。選んだ結果が 1 つの欄に残り、確認しやすい。"
      />

      <Section title="基本" lead="押すか、フォーカスして Enter、Space、↓ キーで開く。↑↓ で移動し、文字を入力すると先頭が一致する選択肢へ移る。">
        <Row label="未選択" note="プレースホルダーはラベルの代わりにしない">
          <Field className="max-w-sm" name="industry">
            <FieldLabel>業種</FieldLabel>
            <Select items={industries} value={industry} onValueChange={(v) => setIndustry(v as string | null)}>
              <SelectTrigger data-testid="select-industry">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent data-testid="select-industry-content">
                {industries.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription data-testid="select-industry-result">
              {industry ? `選択中：${industries.find((i) => i.value === industry)?.label}` : "主な事業に最も近いものを選ぶ"}
            </FieldDescription>
          </Field>
        </Row>
        <Row label="選択済み" note="選んだ結果がそのまま表示される">
          <Field className="max-w-sm">
            <FieldLabel>契約プラン</FieldLabel>
            <Select items={plans} defaultValue="yearly">
              <SelectTrigger data-testid="select-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Row>
        <Row label="グループ" note="選択肢の種類が分かれるとき">
          <Field className="max-w-sm">
            <FieldLabel>担当部署</FieldLabel>
            <Select
              items={[
                { value: "sales1", label: "営業第一部" },
                { value: "sales2", label: "営業第二部" },
                { value: "support", label: "カスタマーサポート" },
                { value: "billing", label: "請求管理" },
              ]}
            >
              <SelectTrigger>
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>営業</SelectLabel>
                  <SelectItem value="sales1">営業第一部</SelectItem>
                  <SelectItem value="sales2">営業第二部</SelectItem>
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>管理</SelectLabel>
                  <SelectItem value="support">カスタマーサポート</SelectItem>
                  <SelectItem value="billing">請求管理</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </Row>
      </Section>

      <Section title="状態">
        <Row label="無効">
          <Field className="max-w-sm" disabled>
            <FieldLabel>契約プラン</FieldLabel>
            <Select items={plans} defaultValue="monthly" disabled>
              <SelectTrigger data-testid="select-disabled">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Row>
        <Row label="エラー">
          <Field className="max-w-sm" invalid>
            <FieldLabel>業種</FieldLabel>
            <Select items={industries}>
              <SelectTrigger data-testid="select-error">
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
            <FieldError>業種を選んでください。当てはまるものがない場合は「サービス業（他に分類されないもの）」を選びます</FieldError>
          </Field>
        </Row>
      </Section>

      <Section title="長い選択肢" lead="選択肢も選んだ結果も、省略せずに折り返す。">
        <Row label="日本語・英語">
          <Field className="max-w-xs">
            <FieldLabel>請求書の送付方法</FieldLabel>
            <Select items={longOptions} defaultValue="a">
              <SelectTrigger data-testid="select-long">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {longOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Field className="max-w-sm">
              <FieldSet render={<RadioGroup defaultValue="monthly" />}>
                <FieldLegend variant="label">契約プラン</FieldLegend>
                {plans.map((p) => (
                  <FieldItem key={p.value}>
                    <RadioGroupItem value={p.value} />
                    <FieldLabel>{p.label}</FieldLabel>
                  </FieldItem>
                ))}
              </FieldSet>
            </Field>
          }
          badNote="単一選択の表現がフォームの中で混在する。選択肢が 2 つでも Radio Group にしない。"
          good={
            <Field className="max-w-sm">
              <FieldLabel>契約プラン</FieldLabel>
              <Select items={plans} defaultValue="monthly">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          }
          goodNote="単一選択は Select にそろえる。選んだ結果が 1 つの欄に残る。"
        />
      </Section>
    </article>
  )
}
