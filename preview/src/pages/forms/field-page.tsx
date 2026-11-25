import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldOptionalMark,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

export function FieldPage() {
  return (
    <article>
      <PageHeader
        name="Field"
        lead="ラベル、説明、入力欄、エラーを同じ構造で組み合わせる。関連付けは自動で行われる。検証の規則は持たない。"
      />

      <Section title="構造" lead="ラベル → 入力欄 → 説明 → エラーの順に、8px の間隔で並べる。">
        <Row label="縦に並べる" note='orientation="vertical"（既定）'>
          <Field className="max-w-sm" invalid data-testid="field-anatomy">
            <FieldLabel>メールアドレス</FieldLabel>
            <Input data-testid="field-anatomy-input" type="email" defaultValue="yamada@" />
            <FieldDescription data-testid="field-anatomy-description">請求書の送付先になる</FieldDescription>
            <FieldError data-testid="field-anatomy-error">
              「@」の後にドメイン名を入力してください（例：yamada@example.com）
            </FieldError>
          </Field>
        </Row>
        <Row label="横に並べる" note='orientation="horizontal"。Checkbox と Switch に使う'>
          <Field orientation="horizontal">
            <Checkbox data-testid="field-horizontal-checkbox" />
            <FieldLabel>担当者にも写しを送る</FieldLabel>
          </Field>
        </Row>
      </Section>

      <Section title="まとまり" lead="項目の間は 16px（FieldGroup）、まとまりの間は 32px にする。">
        <Row label="FieldSet と FieldLegend">
          <div className="flex w-full max-w-sm flex-col gap-8" data-testid="field-sets">
            <FieldSet>
              <FieldLegend>担当者</FieldLegend>
              <FieldGroup data-testid="field-group">
                <Field>
                  <FieldLabel>氏名</FieldLabel>
                  <Input autoComplete="name" />
                </Field>
                <Field>
                  <FieldLabel>部署名</FieldLabel>
                  <Input autoComplete="organization-title" />
                </Field>
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend>連絡先</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel>メールアドレス</FieldLabel>
                  <Input type="email" autoComplete="email" />
                </Field>
                <Field>
                  <FieldLabel>
                    電話番号
                    <FieldOptionalMark />
                  </FieldLabel>
                  <Input type="tel" autoComplete="tel" />
                </Field>
              </FieldGroup>
            </FieldSet>
          </div>
        </Row>
      </Section>

      <Section title="互換のための部品" lead="shadcn/ui のコードを移すときのために提供する。新しいフォームでは、区切りに余白を使い、見出しには FieldLabel と FieldLegend を使う。">
        <Row label="FieldSeparator" note="線で区切る">
          <div className="flex w-full max-w-sm flex-col gap-4" data-testid="field-separator-demo">
            <Field>
              <FieldLabel>メールアドレス</FieldLabel>
              <Input type="email" />
            </Field>
            <FieldSeparator>または</FieldSeparator>
            <Field>
              <FieldLabel>電話番号</FieldLabel>
              <Input type="tel" />
            </Field>
          </div>
        </Row>
        <Row label="FieldTitle" note="ラベルではない見出し">
          <Field orientation="horizontal" className="max-w-sm">
            <Checkbox aria-labelledby="field-title-demo" />
            <div data-slot="field-content" className="flex min-w-0 flex-1 flex-col gap-1">
              <FieldTitle id="field-title-demo" data-testid="field-title">
                自動更新
              </FieldTitle>
              <FieldDescription>契約の終了日に、同じ条件で 1 年間更新する</FieldDescription>
            </div>
          </Field>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <div className="flex w-full max-w-sm flex-col gap-4">
              <p className="text-ui text-destructive">入力内容に誤りがあります。</p>
              <Field>
                <FieldLabel>メールアドレス</FieldLabel>
                <Input defaultValue="yamada@" />
              </Field>
            </div>
          }
          badNote="エラーが入力欄から離れ、どの項目の問題か、どう直すかがわからない。"
          good={
            <Field className="max-w-sm" invalid>
              <FieldLabel>メールアドレス</FieldLabel>
              <Input defaultValue="yamada@" />
              <FieldError>「@」の後にドメイン名を入力してください（例：yamada@example.com）</FieldError>
            </Field>
          }
          goodNote="エラーは入力欄の直下に、原因と直し方を示す。"
        />
      </Section>
    </article>
  )
}
