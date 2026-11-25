import { useState } from "react"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const MAX = 200

export function TextareaPage() {
  const [note, setNote] = useState("")
  const over = note.length > MAX
  return (
    <article>
      <PageHeader name="Textarea" lead="複数行の文章を入力する。高さは 96px から、内容と操作に合わせて広がる。" />

      <Section title="基本" lead="縦方向にだけ大きさを変えられる。入力に合わせて高さが広がる。">
        <Row label="通常">
          <Field className="max-w-lg">
            <FieldLabel>備考</FieldLabel>
            <Textarea data-testid="textarea-default" placeholder="例：請求書は経理部の山田様宛てに送付" />
          </Field>
        </Row>
        <Row label="文字数の上限" note="上限は入力中に知らせる">
          <Field className="max-w-lg" invalid={over}>
            <FieldLabel>備考</FieldLabel>
            <Textarea data-testid="textarea-counter" value={note} onChange={(e) => setNote(e.target.value)} />
            {over ? (
              <FieldError data-testid="textarea-counter-error">
                {MAX} 文字以内で入力してください（現在 {note.length} 文字）
              </FieldError>
            ) : (
              <FieldDescription data-testid="textarea-counter-count">
                {note.length} / {MAX} 文字
              </FieldDescription>
            )}
          </Field>
        </Row>
      </Section>

      <Section title="状態">
        <Row label="無効">
          <Field className="max-w-lg" disabled>
            <FieldLabel>社内メモ</FieldLabel>
            <Textarea data-testid="textarea-disabled" defaultValue="担当者の変更があった場合は営業部へ連絡する。" />
          </Field>
        </Row>
        <Row label="読み取り専用">
          <Field className="max-w-lg">
            <FieldLabel>契約時の特記事項</FieldLabel>
            <Textarea readOnly defaultValue="初年度の保守費用は無償とする。" />
          </Field>
        </Row>
        <Row label="エラー">
          <Field className="max-w-lg" invalid>
            <FieldLabel>解約の理由</FieldLabel>
            <Textarea data-testid="textarea-error" />
            <FieldError>解約の理由を入力してください。選択肢にない場合は、具体的な状況を書いてください</FieldError>
          </Field>
        </Row>
      </Section>

      <Section title="長いラベル">
        <Row label="英語">
          <Field className="max-w-lg">
            <FieldLabel>Describe the issue, including what you expected and what actually happened</FieldLabel>
            <Textarea />
          </Field>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Field className="max-w-sm">
              <FieldLabel>問い合わせの内容</FieldLabel>
              <Textarea className="min-h-0" rows={1} />
            </Field>
          }
          badNote="1 行分の高さしかなく、長い文章を見直しにくい。"
          good={
            <Field className="max-w-sm">
              <FieldLabel>問い合わせの内容</FieldLabel>
              <Textarea rows={5} />
            </Field>
          }
          goodNote="想定する文章の長さに合わせて、最初の高さを決める。"
        />
      </Section>
    </article>
  )
}
