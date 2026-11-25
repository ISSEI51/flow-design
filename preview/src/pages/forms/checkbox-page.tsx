import { useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldError, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const channels = [
  { value: "email", label: "メール" },
  { value: "post", label: "郵送" },
  { value: "portal", label: "取引先ポータル" },
]

export function CheckboxPage() {
  const [selected, setSelected] = useState<string[]>(["email"])
  const all = selected.length === channels.length
  const some = selected.length > 0 && !all
  return (
    <article>
      <PageHeader name="Checkbox" lead="複数の選択、同意、確認事項に使う。保存ボタンで反映するフォームの ON/OFF にも使う。" />

      <Section title="基本" lead="ラベルを押しても切り替わる。Space キーで切り替える。">
        <Row label="未選択・選択">
          <div className="flex flex-col">
            <Field orientation="horizontal">
              <Checkbox data-testid="checkbox-basic" />
              <FieldLabel data-testid="checkbox-basic-label">請求書をメールでも受け取る</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Checkbox defaultChecked />
              <FieldLabel>納品書を同封する</FieldLabel>
            </Field>
          </div>
        </Row>
        <Row label="説明つき">
          <Field orientation="horizontal" className="max-w-md">
            <Checkbox />
            <FieldContent>
              <FieldLabel>担当者の変更を営業部に通知する</FieldLabel>
              <FieldDescription>変更があった日の翌営業日に、メールで通知する</FieldDescription>
            </FieldContent>
          </Field>
        </Row>
        <Row label="複数選択と一部選択" note="親の項目は、一部だけ選ばれているとき − を表示する">
          <div className="flex flex-col">
            <Field orientation="horizontal">
              <Checkbox
                data-testid="checkbox-parent"
                checked={all}
                indeterminate={some}
                onCheckedChange={(c) => setSelected(c ? channels.map((ch) => ch.value) : [])}
              />
              <FieldLabel>すべての送付方法</FieldLabel>
            </Field>
            <div className="pl-7">
              {channels.map((ch) => (
                <Field key={ch.value} orientation="horizontal">
                  <Checkbox
                    data-testid={`checkbox-${ch.value}`}
                    checked={selected.includes(ch.value)}
                    onCheckedChange={(c) =>
                      setSelected((s) => (c ? [...s, ch.value] : s.filter((v) => v !== ch.value)))
                    }
                  />
                  <FieldLabel>{ch.label}</FieldLabel>
                </Field>
              ))}
            </div>
          </div>
        </Row>
        <Row label="グループ" note="FieldSet と FieldLegend で、選択肢のまとまりに名前を付ける">
          <Field>
            <FieldSet>
              <FieldLegend variant="label">対応できる時間帯</FieldLegend>
              <div data-testid="checkbox-group">
                {["午前（9〜12 時）", "午後（13〜17 時）", "夜間（18〜21 時）"].map((t) => (
                  <FieldItem key={t}>
                    <Checkbox name="time" value={t} />
                    <FieldLabel>{t}</FieldLabel>
                  </FieldItem>
                ))}
              </div>
            </FieldSet>
          </Field>
        </Row>
      </Section>

      <Section title="押せる範囲" lead="行全体が押せる範囲になる。行どうしは重ならない。">
        <Row label="横に並べる" note="選択肢の間は 16px 以上あける">
          <Field className="flex-row flex-wrap gap-x-4" data-testid="checkbox-inline">
            {["月", "火", "水", "木", "金"].map((d) => (
              <FieldItem key={d}>
                <Checkbox name="weekday" value={d} />
                <FieldLabel>{d}曜日</FieldLabel>
              </FieldItem>
            ))}
          </Field>
        </Row>
        <Row label="高密度" note="--control-height を 32px にした場合。表の中など">
          <Field className="w-64 gap-0 [--control-height:2rem]" data-testid="checkbox-dense">
            {["請求書 1001", "請求書 1002", "請求書 1003"].map((t) => (
              <FieldItem key={t}>
                <Checkbox name="invoice" value={t} />
                <FieldLabel>{t}</FieldLabel>
              </FieldItem>
            ))}
          </Field>
        </Row>
      </Section>

      <Section title="状態">
        <Row label="無効">
          <div className="flex flex-col">
            <Field orientation="horizontal" disabled>
              <Checkbox data-testid="checkbox-disabled" />
              <FieldLabel>電子契約を使う（契約プランで選べない）</FieldLabel>
            </Field>
            <Field orientation="horizontal" disabled>
              <Checkbox defaultChecked />
              <FieldLabel>本人確認済み</FieldLabel>
            </Field>
          </div>
        </Row>
        <Row label="エラー">
          <Field orientation="horizontal" invalid className="flex-wrap">
            <Checkbox data-testid="checkbox-error" />
            <FieldLabel>利用規約に同意する</FieldLabel>
            <FieldError className="w-full">利用規約への同意が必要です。内容を確認し、チェックを入れてください</FieldError>
          </Field>
        </Row>
      </Section>

      <Section title="長いラベル">
        <Row label="日本語">
          <Field orientation="horizontal" className="max-w-sm">
            <Checkbox />
            <FieldLabel>契約の更新日の 30 日前に、更新の案内と見積書を担当者へメールで送る</FieldLabel>
          </Field>
        </Row>
        <Row label="英語">
          <Field orientation="horizontal" className="max-w-sm">
            <Checkbox />
            <FieldLabel>Send a renewal notice and a quote to the contact 30 days before the renewal date</FieldLabel>
          </Field>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Field orientation="horizontal">
              <FieldLabel>請求書をメールでも受け取る</FieldLabel>
              <Switch />
            </Field>
          }
          badNote="保存ボタンで反映するフォームに Switch を置くと、押した時点で反映されたように見える。"
          good={
            <Field orientation="horizontal">
              <Checkbox />
              <FieldLabel>請求書をメールでも受け取る</FieldLabel>
            </Field>
          }
          goodNote="保存して反映する項目は Checkbox にする。"
        />
        <Compare
          bad={
            <Field orientation="horizontal">
              <Checkbox />
              <FieldLabel>案内メールを受け取らない</FieldLabel>
            </Field>
          }
          badNote="否定の言葉で、チェックの意味を考えさせる。"
          good={
            <Field orientation="horizontal">
              <Checkbox defaultChecked />
              <FieldLabel>案内メールを受け取る</FieldLabel>
            </Field>
          }
          goodNote="チェックを入れた状態が、ラベルのとおりになる。"
        />
      </Section>
    </article>
  )
}
