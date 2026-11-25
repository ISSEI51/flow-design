import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

export function InputPage() {
  return (
    <article>
      <PageHeader name="Input" lead="1 行の文字や数値を入力する。ラベルは入力欄の上に置く。" />

      <Section title="入力の種類" lead="HTML の type、autocomplete、inputMode を使い、ブラウザの入力補助とモバイルのキーボードを活かす。">
        <Row label="文字" note='type="text"'>
          <Field className="max-w-sm">
            <FieldLabel>会社名</FieldLabel>
            <Input data-testid="input-text" autoComplete="organization" />
          </Field>
        </Row>
        <Row label="メールアドレス" note='type="email" autoComplete="email"'>
          <Field className="max-w-sm">
            <FieldLabel>メールアドレス</FieldLabel>
            <Input data-testid="input-email" type="email" autoComplete="email" />
          </Field>
        </Row>
        <Row label="電話番号" note='type="tel" autoComplete="tel"'>
          <Field className="max-w-sm">
            <FieldLabel>電話番号</FieldLabel>
            <Input type="tel" autoComplete="tel" />
          </Field>
        </Row>
        <Row label="数値" note='type="number" inputMode="numeric"'>
          <Field className="max-w-sm">
            <FieldLabel>従業員数</FieldLabel>
            <Input type="number" inputMode="numeric" min={1} />
          </Field>
        </Row>
        <Row label="パスワード" note='type="password" autoComplete="current-password"'>
          <Field className="max-w-sm">
            <FieldLabel>パスワード</FieldLabel>
            <Input type="password" autoComplete="current-password" />
          </Field>
        </Row>
      </Section>

      <Section title="状態" lead="フォーカスは Tab キーかクリックで確認する。">
        <Row label="通常">
          <Field className="max-w-sm">
            <FieldLabel>会社名</FieldLabel>
            <Input data-testid="input-default" placeholder="例：山田商事株式会社" />
          </Field>
        </Row>
        <Row label="入力済み">
          <Field className="max-w-sm">
            <FieldLabel>会社名</FieldLabel>
            <Input defaultValue="山田商事株式会社" />
          </Field>
        </Row>
        <Row label="無効" note="変更できず、送信もされない">
          <Field className="max-w-sm" disabled>
            <FieldLabel>顧客番号</FieldLabel>
            <Input data-testid="input-disabled" defaultValue="C-000128" />
          </Field>
        </Row>
        <Row label="読み取り専用" note="変更できないが、選択とコピーはでき、送信される">
          <Field className="max-w-sm">
            <FieldLabel>登録日</FieldLabel>
            <Input data-testid="input-readonly" readOnly defaultValue="2026年11月25日" />
          </Field>
        </Row>
        <Row label="エラー" note="枠の色、アイコン、文字で示す">
          <Field className="max-w-sm" invalid>
            <FieldLabel>メールアドレス</FieldLabel>
            <Input data-testid="input-error" type="email" defaultValue="yamada@" />
            <FieldError data-testid="input-error-message">
              「@」の後にドメイン名を入力してください（例：yamada@example.com）
            </FieldError>
          </Field>
        </Row>
      </Section>

      <Section title="長いラベル">
        <Row label="日本語">
          <Field className="max-w-sm">
            <FieldLabel>請求書の送付先として登録するメールアドレス（複数の場合は代表のアドレス）</FieldLabel>
            <Input type="email" />
          </Field>
        </Row>
        <Row label="英語">
          <Field className="max-w-sm">
            <FieldLabel>Email address used for invoices and payment notifications</FieldLabel>
            <Input type="email" />
            <FieldDescription>We send a copy of every invoice to this address.</FieldDescription>
          </Field>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={<Input aria-label="会社名" placeholder="会社名" className="max-w-sm" />}
          badNote="プレースホルダーをラベルにしている。入力を始めると、何の欄かわからなくなる。"
          good={
            <Field className="max-w-sm">
              <FieldLabel>会社名</FieldLabel>
              <Input />
            </Field>
          }
          goodNote="ラベルを入力欄の上に置く。"
        />
        <Compare
          bad={
            <Field className="max-w-sm" invalid>
              <FieldLabel>メールアドレス</FieldLabel>
              <Input defaultValue="yamada@" />
              <FieldError>入力が正しくありません</FieldError>
            </Field>
          }
          badNote="何が正しくないのか、どう直せばよいのかがわからない。"
          good={
            <Field className="max-w-sm" invalid>
              <FieldLabel>メールアドレス</FieldLabel>
              <Input defaultValue="yamada@" />
              <FieldError>「@」の後にドメイン名を入力してください（例：yamada@example.com）</FieldError>
            </Field>
          }
          goodNote="原因と直し方を示す。"
        />
      </Section>
    </article>
  )
}
