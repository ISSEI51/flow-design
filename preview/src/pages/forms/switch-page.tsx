import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

// 即時に保存する設定。fail が true のときは保存に失敗し、元の状態に戻す。
export function useInstantSetting(initial: boolean, fail = false) {
  const [checked, setChecked] = useState(initial)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const change = (next: boolean) => {
    setChecked(next)
    setPending(true)
    setMessage("保存しています")
    window.setTimeout(() => {
      setPending(false)
      if (fail) {
        setChecked(!next)
        setMessage("保存できませんでした。通信の状態を確認して、もう一度切り替えてください")
      } else {
        setMessage(next ? "オンにしました" : "オフにしました")
      }
    }, 600)
  }
  return { checked, pending, message, change, failed: fail && message.startsWith("保存できません") }
}

export function SwitchPage() {
  const ok = useInstantSetting(true)
  const ng = useInstantSetting(false, true)
  return (
    <article>
      <PageHeader name="Switch" lead="押した時点で反映する ON/OFF の設定に使う。円の位置と色の両方で状態を示す。" />

      <Section title="基本" lead="ラベルを押しても切り替わる。Space キーで切り替える。">
        <Row label="オフ・オン">
          <div className="flex w-full max-w-md flex-col">
            <Field orientation="horizontal">
              <FieldLabel>請求書の発行をメールで通知する</FieldLabel>
              <Switch data-testid="switch-basic" />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel>入金の確認をメールで通知する</FieldLabel>
              <Switch defaultChecked />
            </Field>
          </div>
        </Row>
        <Row label="即時に保存" note="保存の結果を文字で知らせる">
          <div className="flex w-full max-w-md flex-col">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel>担当者の変更を通知する</FieldLabel>
                <FieldDescription role="status" data-testid="switch-ok-status">
                  {ok.message}
                </FieldDescription>
              </FieldContent>
              <Switch data-testid="switch-ok" checked={ok.checked} onCheckedChange={ok.change} disabled={ok.pending} />
            </Field>
          </div>
        </Row>
        <Row label="保存に失敗" note="元の状態に戻し、原因と次の操作を示す">
          <div className="flex w-full max-w-md flex-col">
            <Field orientation="horizontal" invalid={ng.failed}>
              <FieldContent>
                <FieldLabel>入金の遅れを通知する</FieldLabel>
                <FieldDescription
                  role="status"
                  data-testid="switch-ng-status"
                  className={ng.failed ? "text-destructive" : undefined}
                >
                  {ng.message}
                </FieldDescription>
              </FieldContent>
              <Switch data-testid="switch-ng" checked={ng.checked} onCheckedChange={ng.change} disabled={ng.pending} />
            </Field>
          </div>
        </Row>
      </Section>

      <Section title="状態">
        <Row label="無効">
          <div className="flex w-full max-w-md flex-col">
            <Field orientation="horizontal" disabled>
              <FieldLabel>二段階認証（管理者が設定している）</FieldLabel>
              <Switch data-testid="switch-disabled" defaultChecked />
            </Field>
          </div>
        </Row>
      </Section>

      <Section title="互換のための大きさ" lead='size="sm"（36×20px）は shadcn/ui との互換と、表の中など高密度の画面のために提供する。標準は default。'>
        <Row label="sm" note="押せる範囲は 48px を保つ">
          <div className="flex w-full max-w-md flex-col">
            <Field orientation="horizontal">
              <FieldLabel>一覧に請求書の番号を表示する</FieldLabel>
              <Switch data-testid="switch-sm" size="sm" />
            </Field>
          </div>
        </Row>
      </Section>

      <Section title="長いラベル">
        <Row label="日本語・英語">
          <div className="flex w-full max-w-sm flex-col">
            <Field orientation="horizontal">
              <FieldLabel>契約の更新日の 30 日前に、担当者と経理部の両方へ通知する</FieldLabel>
              <Switch />
            </Field>
            <Field orientation="horizontal">
              <FieldLabel>Notify both the contact and the accounting team 30 days before renewal</FieldLabel>
              <Switch />
            </Field>
          </div>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <div className="flex w-full max-w-xs flex-col">
              <Field orientation="horizontal">
                <FieldLabel>請求書をメールで受け取る</FieldLabel>
                <Switch />
              </Field>
              <div className="mt-4 flex justify-end">
                <Button>変更を保存</Button>
              </div>
            </div>
          }
          badNote="保存ボタンがあるのに Switch を使う。押した時点で反映されたのか、わからない。"
          good={
            <div className="flex w-full max-w-xs flex-col">
              <Field orientation="horizontal">
                <Checkbox />
                <FieldLabel>請求書をメールで受け取る</FieldLabel>
              </Field>
              <div className="mt-4 flex justify-end">
                <Button>変更を保存</Button>
              </div>
            </div>
          }
          goodNote="保存して反映するフォームでは Checkbox にする。"
        />
      </Section>
    </article>
  )
}
