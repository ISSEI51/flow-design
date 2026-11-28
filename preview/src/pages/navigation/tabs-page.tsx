import { useEffect, useRef, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { activities, contracts } from "../../data/business"

const manyTabs = [
  "概要",
  "契約",
  "請求",
  "入金",
  "商談",
  "見積もり",
  "活動履歴",
  "担当者",
  "添付ファイル",
  "問い合わせ",
  "利用状況",
  "変更履歴",
]

// 表示に時間がかかる内容。選んでから 600ms 後に表示する。
function SlowPanel({ name }: { name: string }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 600)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <p className="text-ui text-muted-foreground" role="status">
      {ready ? `${name}の集計を表示しました` : `${name}を集計しています`}
    </p>
  )
}

// 2 つのタブに分かれたフォーム。検証の規則と、エラーのある非表示のタブへの移動は、この画面（製品）が持つ。
function KeepForm() {
  const [tab, setTab] = useState("basic")
  const [result, setResult] = useState("")
  const [emailError, setEmailError] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const email = String(data.get("billingEmail") ?? "")
    setEmailError(email === "")
    setResult(email === "" ? "" : `送信した値：${data.get("companyName") || "（会社名なし）"}、${email}`)
  }
  const goToEmail = () => {
    setTab("billing")
    // 選んだタブの内容が表示された後に、入力欄へ移る。
    window.requestAnimationFrame(() => emailRef.current?.focus())
  }
  return (
    <form data-testid="tabs-keep-form" noValidate onSubmit={submit} className="w-full max-w-md">
      {emailError && (
        <div role="alert" data-testid="tabs-keep-summary" className="mb-6 text-ui text-destructive">
          <button type="button" onClick={goToEmail} className="rounded-xs underline underline-offset-4 outline-none focus-visible:focus-ring">
            「請求先」の請求書の送付先を入力してください
          </button>
        </div>
      )}
      <Tabs data-testid="tabs-keep" value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList aria-label="顧客の編集">
          <TabsTrigger value="basic">基本情報</TabsTrigger>
          <TabsTrigger value="billing">請求先</TabsTrigger>
        </TabsList>
        <TabsContent value="basic">
          <Field>
            <FieldLabel>会社名</FieldLabel>
            <Input name="companyName" data-testid="tabs-keep-input" placeholder="株式会社山田商事" />
          </Field>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-2"
            data-testid="tabs-keep-to-billing"
            onClick={() => setTab("billing")}
          >
            請求先も入力する
          </Button>
        </TabsContent>
        <TabsContent value="billing">
          <Field invalid={emailError}>
            <FieldLabel>請求書の送付先</FieldLabel>
            <Input ref={emailRef} name="billingEmail" data-testid="tabs-keep-email" type="email" placeholder="keiri@example.com" />
            {emailError && <FieldError>請求書の送付先を入力してください</FieldError>}
          </Field>
        </TabsContent>
      </Tabs>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="submit" data-testid="tabs-keep-submit">
          保存する
        </Button>
        <p role="status" data-testid="tabs-keep-result" className="text-ui text-muted-foreground">
          {result}
        </p>
      </div>
    </form>
  )
}

export function TabsPage() {
  const [slow, setSlow] = useState("month")
  return (
    <article>
      <PageHeader
        name="Tabs"
        lead="同じ対象について、異なる種類の情報を切り替える。アプリケーション全体のナビゲーションには使わない。"
      />

      <Section
        title="下線型（標準）"
        lead="高さ 48px、文字 14px、太さ 500、タブの間 24px、内容との間 24px。選択中は文字の色と 2px の下線で示す。"
      >
        <Row label="顧客の詳細" note="矢印キーで移動し、移動した時点で表示を切り替える">
          <Tabs data-testid="tabs-line" defaultValue="overview" className="w-full">
            <TabsList aria-label="山田商事の情報">
              <TabsTrigger value="overview">概要</TabsTrigger>
              <TabsTrigger value="contracts">契約</TabsTrigger>
              <TabsTrigger value="activities">活動履歴</TabsTrigger>
              <TabsTrigger value="members" disabled>
                担当者（権限がありません）
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="text-body">卸売業・東京都千代田区。2024年4月から契約している。</p>
            </TabsContent>
            <TabsContent value="contracts">
              <ul className="space-y-2 text-body">
                {contracts.map((c) => (
                  <li key={c.id}>
                    {c.name}（{c.status}）
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="activities">
              <ul className="space-y-2 text-body">
                {activities.map((a) => (
                  <li key={a.date}>
                    {a.date}　{a.text}
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="members">担当者</TabsContent>
          </Tabs>
        </Row>
      </Section>

      <Section
        title="塗りつぶし型（例外）"
        lead='variant="default"。shadcn/ui との互換のために提供する。小さな表示形式の切り替えなど、理由がある場合だけ使う。選択中は面を background にし、枠で示す。'
      >
        <Row label="集計の期間" note="同じグラフの表示形式を切り替える">
          <Tabs data-testid="tabs-filled" defaultValue="month">
            <TabsList variant="default" aria-label="集計の期間">
              <TabsTrigger value="month">月</TabsTrigger>
              <TabsTrigger value="quarter">四半期</TabsTrigger>
              <TabsTrigger value="year">年</TabsTrigger>
            </TabsList>
            <TabsContent value="month" className="text-ui text-muted-foreground">
              2026年11月の契約金額
            </TabsContent>
            <TabsContent value="quarter" className="text-ui text-muted-foreground">
              2026年度 第3四半期の契約金額
            </TabsContent>
            <TabsContent value="year" className="text-ui text-muted-foreground">
              2026年度の契約金額
            </TabsContent>
          </Tabs>
        </Row>
      </Section>

      <Section
        title="多くのタブ"
        lead="横幅が足りない場合は、文字を縮めずに横にスクロールする。タブが増え続ける場合は、情報の構造を見直す。"
      >
        <Row label="横スクロール" note="選んだタブは画面の中に表示される">
          <Tabs data-testid="tabs-many" defaultValue={manyTabs[0]} className="w-full">
            <TabsList aria-label="顧客の情報（多い例）">
              {manyTabs.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
            {manyTabs.map((t) => (
              <TabsContent key={t} value={t} className="text-ui text-muted-foreground">
                {t}の内容
              </TabsContent>
            ))}
          </Tabs>
        </Row>
        <Row label="長いラベル" note="日本語と英語。折り返さない">
          <Tabs data-testid="tabs-long" defaultValue="a" className="w-full">
            <TabsList aria-label="長いラベル">
              <TabsTrigger value="a">契約の更新と解約の手続き</TabsTrigger>
              <TabsTrigger value="b">Billing and payment history</TabsTrigger>
              <TabsTrigger value="c">担当者と通知の設定</TabsTrigger>
            </TabsList>
            <TabsContent value="a" className="text-ui text-muted-foreground">
              契約の更新と解約の手続き
            </TabsContent>
            <TabsContent value="b" className="text-ui text-muted-foreground">
              Billing and payment history
            </TabsContent>
            <TabsContent value="c" className="text-ui text-muted-foreground">
              担当者と通知の設定
            </TabsContent>
          </Tabs>
        </Row>
      </Section>

      <Section title="動作">
        <Row
          label="入力内容を保つ"
          note="非表示のタブも DOM に残し、入力した値を失わない。非表示のタブの値も送信される。エラーは、非表示のタブを開いて入力欄へ移るリンクで示す"
        >
          <KeepForm />
        </Row>
        <Row label="手動で選ぶ" note="activateOnFocus={false}。表示に時間がかかる内容は、Enter か Space で選ぶ">
          <Tabs data-testid="tabs-manual" value={slow} onValueChange={(v) => setSlow(String(v))} className="w-full">
            <TabsList activateOnFocus={false} aria-label="集計の単位">
              <TabsTrigger value="month">月別の集計</TabsTrigger>
              <TabsTrigger value="owner">担当者別の集計</TabsTrigger>
              <TabsTrigger value="industry">業種別の集計</TabsTrigger>
            </TabsList>
            <TabsContent value="month" keepMounted={false}>
              <SlowPanel name="月別" />
            </TabsContent>
            <TabsContent value="owner" keepMounted={false}>
              <SlowPanel name="担当者別" />
            </TabsContent>
            <TabsContent value="industry" keepMounted={false}>
              <SlowPanel name="業種別" />
            </TabsContent>
          </Tabs>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Tabs defaultValue="customers" className="w-full">
              <TabsList aria-label="主要な機能（悪い例）">
                <TabsTrigger value="customers">顧客</TabsTrigger>
                <TabsTrigger value="invoices">請求書</TabsTrigger>
                <TabsTrigger value="settings">設定</TabsTrigger>
              </TabsList>
            </Tabs>
          }
          badNote="関係のない主要な機能を Tabs で並べる。アプリケーションのナビゲーションは Sidebar が担う。"
          good={
            <Tabs defaultValue="overview" className="w-full">
              <TabsList aria-label="山田商事の情報（良い例）">
                <TabsTrigger value="overview">概要</TabsTrigger>
                <TabsTrigger value="contracts">契約</TabsTrigger>
                <TabsTrigger value="invoices">請求</TabsTrigger>
              </TabsList>
            </Tabs>
          }
          goodNote="1 社の顧客について、種類の異なる情報を切り替える。"
        />
        <Compare
          bad={
            <Tabs defaultValue="1" className="w-full">
              <TabsList aria-label="申し込みの手順（悪い例）">
                <TabsTrigger value="1">1 入力</TabsTrigger>
                <TabsTrigger value="2">2 確認</TabsTrigger>
                <TabsTrigger value="3">3 完了</TabsTrigger>
              </TabsList>
            </Tabs>
          }
          badNote="操作の手順を Tabs で表す。順番を飛ばして選べてしまい、どこまで進んだかもわからない。"
          good={
            <ol className="flex gap-6 text-ui">
              <li className="font-medium" aria-current="step">
                1 入力
              </li>
              <li className="text-muted-foreground">2 確認</li>
              <li className="text-muted-foreground">3 完了</li>
            </ol>
          }
          goodNote="手順は、進み具合を示す表示と「次へ」の操作で表す。"
        />
      </Section>
    </article>
  )
}
