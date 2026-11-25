import { Field, FieldDescription, FieldLabel, FieldOptionalMark, FieldRequiredMark } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

export function LabelPage() {
  return (
    <article>
      <PageHeader name="Label" lead="入力欄が何の情報かを示す。14px、太さ 500。入力欄の上に 8px 離して置く。" />

      <Section title="関連付け" lead="ラベルを押すと入力欄にフォーカスが移る。支援技術はラベルを入力欄の名前として読み上げる。">
        <Row label="Field の中" note="FieldLabel が自動で関連付ける">
          <Field className="max-w-sm">
            <FieldLabel data-testid="label-field">担当者名</FieldLabel>
            <Input data-testid="label-field-input" />
          </Field>
        </Row>
        <Row label="Field の外" note="Label の htmlFor と入力欄の id で関連付ける">
          <div className="flex max-w-sm flex-col gap-2">
            <Label htmlFor="label-standalone" data-testid="label-standalone">
              部署名
            </Label>
            <Input id="label-standalone" />
          </div>
        </Row>
      </Section>

      <Section title="必須と任意" lead="必須と任意のうち、少ない方に印を付ける。フォームの上に凡例を置く。">
        <Row label="任意の項目が少ない" note="任意の項目に「任意」と表示する">
          <div className="flex w-full max-w-sm flex-col gap-4">
            <p className="text-ui text-muted-foreground">「任意」と書かれていない項目は必須です。</p>
            <Field>
              <FieldLabel>会社名</FieldLabel>
              <Input required />
            </Field>
            <Field>
              <FieldLabel>
                電話番号
                <FieldOptionalMark />
              </FieldLabel>
              <Input type="tel" />
            </Field>
          </div>
        </Row>
        <Row label="必須の項目が少ない" note="必須の項目に * を表示する">
          <div className="flex w-full max-w-sm flex-col gap-4">
            <p className="text-ui text-muted-foreground">
              <span className="text-destructive">*</span> は必須の項目です。
            </p>
            <Field>
              <FieldLabel>
                メールアドレス
                <FieldRequiredMark />
              </FieldLabel>
              <Input data-testid="label-required-input" type="email" required />
            </Field>
            <Field>
              <FieldLabel>部署名</FieldLabel>
              <Input />
            </Field>
          </div>
        </Row>
      </Section>

      <Section title="長いラベル">
        <Row label="日本語">
          <Field className="max-w-sm">
            <FieldLabel>契約の更新に関する連絡を受け取る担当者のメールアドレス</FieldLabel>
            <Input type="email" />
          </Field>
        </Row>
        <Row label="英語">
          <Field className="max-w-sm">
            <FieldLabel>Contact person who receives notices about contract renewal</FieldLabel>
            <Input />
          </Field>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Field className="max-w-sm">
              <FieldLabel>会社名（法人格を含む正式な名前を入力してください）</FieldLabel>
              <Input />
            </Field>
          }
          badNote="ラベルに説明を詰め込んでいる。"
          good={
            <Field className="max-w-sm">
              <FieldLabel>会社名</FieldLabel>
              <Input />
              <FieldDescription>「株式会社」などを含む正式な名前</FieldDescription>
            </Field>
          }
          goodNote="ラベルは短くし、補足は説明に分ける。"
        />
        <Compare
          bad={
            <div className="flex w-full max-w-sm flex-col gap-4">
              <Field>
                <FieldLabel>
                  会社名
                  <FieldRequiredMark />
                </FieldLabel>
                <Input required />
              </Field>
              <Field>
                <FieldLabel>
                  電話番号
                  <FieldOptionalMark />
                </FieldLabel>
                <Input />
              </Field>
            </div>
          }
          badNote="必須と任意の両方に印があり、凡例もない。"
          good={
            <div className="flex w-full max-w-sm flex-col gap-4">
              <p className="text-ui text-muted-foreground">「任意」と書かれていない項目は必須です。</p>
              <Field>
                <FieldLabel>会社名</FieldLabel>
                <Input required />
              </Field>
              <Field>
                <FieldLabel>
                  電話番号
                  <FieldOptionalMark />
                </FieldLabel>
                <Input />
              </Field>
            </div>
          }
          goodNote="少ない方にだけ印を付け、凡例で意味を示す。"
        />
      </Section>
    </article>
  )
}
