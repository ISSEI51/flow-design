import { useState } from "react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const faq = [
  {
    q: "契約の途中でプランを変更できますか",
    a: "変更できます。上位のプランへの変更は翌日から、下位のプランへの変更は翌月の契約日から反映します。",
  },
  {
    q: "請求書の送付先を経理部に変えるには",
    a: "顧客の詳細の「請求」タブで、請求書の送付先を変更します。次回の請求書から新しい送付先に送ります。",
  },
  {
    q: "解約した後もデータを確認できますか",
    a: "解約日から 90 日間は、閲覧だけできます。90 日を過ぎるとデータを削除します。",
  },
]

export function AccordionPage() {
  const [lines, setLines] = useState(1)
  return (
    <article>
      <PageHeader
        name="Accordion"
        lead="補足の情報や、使う頻度の低い情報を、必要なときに開く。必要な情報を最初から隠さない。"
      />

      <Section
        title="複数展開（標準）"
        lead="複数の項目を同時に開ける。見出しは 48px 以上、16px、太さ 500。項目の間に 1px の線を引き、背景は透明にする。"
      >
        <Row label="よくある質問" note="見出し全体を押せる。Enter と Space で開閉する">
          <Accordion data-testid="accordion-multiple" className="max-w-xl">
            {faq.map((f, i) => (
              <AccordionItem key={f.q} value={`q${i}`}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Row>
      </Section>

      <Section
        title="単一展開（例外）"
        lead="multiple={false}。1 つを開くと他が閉じる。手順の説明のように、同時に読む理由がない場合だけ使う。"
      >
        <Row label="初期設定の手順">
          <Accordion data-testid="accordion-single" multiple={false} defaultValue={["s1"]} className="max-w-xl">
            <AccordionItem value="s1">
              <AccordionTrigger>1. 会社の情報を登録する</AccordionTrigger>
              <AccordionContent>設定の「会社」で、会社名、住所、請求書に記載する情報を登録します。</AccordionContent>
            </AccordionItem>
            <AccordionItem value="s2">
              <AccordionTrigger>2. メンバーを招待する</AccordionTrigger>
              <AccordionContent>設定の「メンバー」で、メールアドレスを入力して招待します。</AccordionContent>
            </AccordionItem>
            <AccordionItem value="s3">
              <AccordionTrigger>3. 顧客を読み込む</AccordionTrigger>
              <AccordionContent>顧客の一覧で「CSV を読み込む」を選び、ファイルを指定します。</AccordionContent>
            </AccordionItem>
          </Accordion>
        </Row>
      </Section>

      <Section title="動作">
        <Row label="高さの変化" note="開いた後に内容が増えても、高さが追従する">
          <Accordion data-testid="accordion-dynamic" defaultValue={["log"]} className="max-w-xl">
            <AccordionItem value="log">
              <AccordionTrigger>変更履歴</AccordionTrigger>
              <AccordionContent>
                <ul data-testid="accordion-dynamic-list" className="space-y-2">
                  {Array.from({ length: lines }, (_, i) => (
                    <li key={i}>2026年11月{20 - i}日　契約の内容を更新した</li>
                  ))}
                </ul>
                <Button variant="secondary" size="sm" className="mt-4" onClick={() => setLines((n) => n + 1)}>
                  さらに表示
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Row>
        <Row label="入力内容を保つ" note="閉じても内容を DOM に残し、入力した値を失わない">
          <Accordion data-testid="accordion-keep" className="max-w-xl">
            <AccordionItem value="memo">
              <AccordionTrigger>社内メモ</AccordionTrigger>
              <AccordionContent>
                <Field>
                  <FieldLabel>メモ</FieldLabel>
                  <Textarea data-testid="accordion-keep-input" placeholder="次回の訪問で確認すること" />
                </Field>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Row>
        <Row label="長いラベル" note="日本語と英語。見出しは折り返す">
          <Accordion data-testid="accordion-long" className="max-w-sm">
            <AccordionItem value="ja">
              <AccordionTrigger>契約の更新日の 30 日前に、担当者と経理部の両方へ通知する設定について</AccordionTrigger>
              <AccordionContent>設定の「通知」で変更できます。</AccordionContent>
            </AccordionItem>
            <AccordionItem value="en">
              <AccordionTrigger>How renewal notices are sent to both the contact and the accounting team</AccordionTrigger>
              <AccordionContent>You can change this in Settings.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Accordion className="w-full">
              <AccordionItem value="a">
                <AccordionTrigger>会社名（必須）</AccordionTrigger>
                <AccordionContent>
                  <Input aria-label="会社名" />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="b">
                <AccordionTrigger>メールアドレス（必須）</AccordionTrigger>
                <AccordionContent>
                  <Input aria-label="メールアドレス" />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          }
          badNote="必須の入力項目を折りたたむ。開かないと入力できず、入力し忘れも起きる。"
          good={
            <div className="w-full space-y-4">
              <Field>
                <FieldLabel>会社名</FieldLabel>
                <Input />
              </Field>
              <Accordion>
                <AccordionItem value="memo">
                  <AccordionTrigger>社内メモ（任意）</AccordionTrigger>
                  <AccordionContent>
                    <Textarea aria-label="社内メモ" />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          }
          goodNote="必須の項目は最初から表示し、任意で使う頻度の低い項目だけを折りたたむ。"
        />
      </Section>
    </article>
  )
}
