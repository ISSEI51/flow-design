import { useState } from "react"
import { BellRing, CircleAlert } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const variants = [
  ["neutral", "メンテナンスのお知らせ", "12 月 1 日 2:00〜4:00 は、請求書の送信を停止します。"],
  ["success", "口座の確認が完了しました", "次回の請求から、自動引き落としを利用できます。"],
  ["warning", "送付先が未設定の顧客が 3 件あります", "送付先を設定するまで、これらの顧客には請求書を送信できません。"],
  ["destructive", "請求書を送信できませんでした", "メールサーバーに接続できません。時間をおいて、もう一度送信してください。"],
  ["info", "インボイス制度の登録番号を表示できます", "設定画面で登録番号を入力すると、請求書に表示されます。"],
] as const

export function AlertPage() {
  const [shown, setShown] = useState(false)
  return (
    <article>
      <PageHeader
        name="Alert"
        lead="画面の中で、継続して示す必要がある重要な情報、注意、エラーを伝える。背景は無彩色で、意味は色の付いたアイコンと文章で示す。"
      />

      <Section title="種類">
        {variants.map(([v, title, desc]) => (
          <Row key={v} label={v} note={`variant="${v}"`}>
            <Alert data-testid={`alert-${v}`} variant={v}>
              <AlertTitle>{title}</AlertTitle>
              <AlertDescription>{desc}</AlertDescription>
            </Alert>
          </Row>
        ))}
        <Row label="次の操作" note="対応が必要な場合は、操作を添える">
          <Alert variant="warning">
            <AlertTitle>送付先が未設定の顧客が 3 件あります</AlertTitle>
            <AlertDescription>送付先を設定するまで、これらの顧客には請求書を送信できません。</AlertDescription>
            <AlertAction>
              <Button size="sm" variant="secondary">
                送付先を設定
              </Button>
            </AlertAction>
          </Alert>
        </Row>
        <Row label="説明だけ">
          <Alert>
            <AlertDescription>請求書の控えは 7 年間保存されます。</AlertDescription>
          </Alert>
        </Row>
      </Section>

      <Section title="アイコンの指定" lead="既定では種類のアイコンを自動で表示する。shadcn/ui のように子要素でアイコンを渡しても重複しない。">
        <Row label="種類だけ" note='variant="destructive"'>
          <Alert data-testid="alert-icon-auto" variant="destructive">
            <AlertTitle>請求書を送信できませんでした</AlertTitle>
          </Alert>
        </Row>
        <Row label="icon で指定" note="icon={<BellRing />}">
          <Alert data-testid="alert-icon-prop" variant="info" icon={<BellRing />}>
            <AlertTitle>締め日の 3 日前です</AlertTitle>
          </Alert>
        </Row>
        <Row label="子要素で指定" note="shadcn/ui と同じ書き方">
          <Alert data-testid="alert-icon-child" variant="destructive">
            <CircleAlert />
            <AlertTitle>請求書を送信できませんでした</AlertTitle>
            <AlertDescription>メールサーバーに接続できません。</AlertDescription>
          </Alert>
        </Row>
        <Row label="アイコンなし" note="icon={false}">
          <Alert data-testid="alert-icon-none" icon={false}>
            <AlertTitle>請求書の控えは 7 年間保存されます</AlertTitle>
          </Alert>
        </Row>
      </Section>

      <Section title="読み上げ" lead="最初から表示している Alert には role を付けない。操作の結果として表示する重要なエラーだけ role=&quot;alert&quot; にする。">
        <Row label="動的に表示" note='role="alert"'>
          <div className="flex w-full flex-col gap-4">
            <div>
              <Button data-testid="alert-trigger" variant="secondary" onClick={() => setShown(true)}>
                接続を確認する
              </Button>
            </div>
            {shown && (
              <Alert data-testid="alert-dynamic" variant="destructive" role="alert">
                <AlertTitle>会計システムに接続できませんでした</AlertTitle>
                <AlertDescription>連携の設定で API キーが有効か確認してください。</AlertDescription>
              </Alert>
            )}
          </div>
        </Row>
      </Section>

      <Section title="長い文字">
        <Row label="英語">
          <Alert variant="info">
            <AlertTitle>Invoices for the previous month are created on the next business day after the closing date</AlertTitle>
            <AlertDescription>
              You can change the closing date in the billing settings. Changes apply from the next billing cycle.
            </AlertDescription>
          </Alert>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <div className="w-full rounded-md border-l-4 border-destructive bg-destructive p-4 text-ui text-destructive-foreground">
              エラーが発生しました
            </div>
          }
          badNote="強い背景色と左側の線で装飾し、何が起きたか、次に何をするかがわからない。"
          good={
            <Alert variant="destructive">
              <AlertTitle>請求書を送信できませんでした</AlertTitle>
              <AlertDescription>メールサーバーに接続できません。時間をおいて、もう一度送信してください。</AlertDescription>
            </Alert>
          }
          goodNote="無彩色の面に、色の付いたアイコンと、原因と次の操作を書く。"
        />
      </Section>
    </article>
  )
}
