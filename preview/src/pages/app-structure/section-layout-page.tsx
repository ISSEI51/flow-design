import { useEffect, useRef, useState, type ReactNode } from "react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PageColumns } from "@/patterns/page-layout"
import {
  Section as PatternSection,
  SectionActions,
  SectionDescription,
  SectionHeader,
  SectionHeading,
  SectionStack,
  SectionTitle,
} from "@/patterns/section-layout"
import { cn } from "@/lib/utils"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets, Code, Example } from "./parts"

const ladder = [
  { n: "1", name: "余白", note: "関係の近いものを近く、遠いものを離す。最初に検討する" },
  { n: "2", name: "文字の強弱", note: "見出しの大きさと太さで、まとまりの始まりを示す" },
  { n: "3", name: "細い境界線", note: "内容が変わる境目。余白と文字で足りない場合だけ" },
  { n: "4", name: "背景色", note: "周りと性質の違う領域（補足、操作の領域）" },
  { n: "5", name: "Card", note: "独立した情報の単位や、並べて比べる選択肢" },
]

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{k}</dt>
      <dd className="mt-1 text-ui">{v}</dd>
    </div>
  )
}

function SeparationSamples() {
  const facts = (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <Fact k="月額" v="128,000円" />
      <Fact k="更新日" v="2027/03/31" />
    </dl>
  )
  return (
    <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
      <div data-testid="sep-space">
        <p className="mb-4 text-caption text-muted-foreground">1 余白</p>
        <div className="flex flex-col gap-8">
          {facts}
          {facts}
        </div>
      </div>
      <div data-testid="sep-type">
        <p className="mb-4 text-caption text-muted-foreground">2 文字の強弱</p>
        <div className="flex flex-col gap-8">
          <div>
            <p className="mb-3 text-heading">契約</p>
            {facts}
          </div>
          <div>
            <p className="mb-3 text-heading">請求</p>
            {facts}
          </div>
        </div>
      </div>
      <div data-testid="sep-line">
        <p className="mb-4 text-caption text-muted-foreground">3 細い境界線</p>
        <div className="flex flex-col">
          <div className="pb-6">{facts}</div>
          <div className="border-t border-border pt-6">{facts}</div>
        </div>
      </div>
      <div data-testid="sep-bg">
        <p className="mb-4 text-caption text-muted-foreground">4 背景色</p>
        <div className="flex flex-col gap-4">
          {facts}
          <div className="rounded-md bg-muted p-4 text-ui">未入金が 1 件ある。入金の確認は請求の担当が行う。</div>
        </div>
      </div>
      <div data-testid="sep-card" className="sm:col-span-2">
        <p className="mb-4 text-caption text-muted-foreground">5 Card（並べて比べる選択肢）</p>
        <PageColumns layout="equal" columns={3}>
          {[
            ["ライト", "10 席まで"],
            ["スタンダード", "50 席まで"],
            ["エンタープライズ", "上限なし"],
          ].map(([n, d]) => (
            <Card key={n} size="sm">
              <CardHeader>
                <CardTitle>{n}</CardTitle>
                <CardDescription>{d}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </PageColumns>
      </div>
    </div>
  )
}

// 例の中の見出しの階層を一覧にして、見出しの要素が階層どおりになっていることを示す。
function HeadingOutline({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [outline, setOutline] = useState<{ tag: string; text: string; size: string }[]>([])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setOutline(
      Array.from(el.querySelectorAll<HTMLElement>("h2, h3, h4")).map((h) => ({
        tag: h.tagName.toLowerCase(),
        text: h.textContent ?? "",
        size: getComputedStyle(h).fontSize,
      }))
    )
  }, [])
  return (
    <div className="grid gap-8 sm:grid-cols-[1fr_14rem]">
      <div ref={ref} data-testid="heading-demo" className="min-w-0">
        {children}
      </div>
      <div>
        <p className="text-caption text-muted-foreground">見出しの要素</p>
        <ol className="mt-2 flex flex-col gap-1 text-ui" data-testid="heading-outline">
          {outline.map((o, i) => (
            <li key={i} className={cn(o.tag === "h3" && "pl-4", o.tag === "h4" && "pl-8")}>
              <code className="text-caption text-muted-foreground">{o.tag}</code> {o.text}
              <span className="ml-1 text-caption text-muted-foreground">{o.size}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

const spacing = [
  ["関連性の強い要素", "4〜8px", [4, 8]],
  ["一般的な要素の間", "12〜16px", [12, 16]],
  ["見出しと内容", "16〜24px", [16, 24]],
  ["情報のグループの間", "24〜32px", [24, 32]],
  ["セクションの間", "32〜48px", [32, 48]],
  ["大きな章の間", "64〜96px", [64, 96]],
] as const

export function SectionLayoutPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / App Structure"
        name="Section Layout"
        lead="ページの中の情報のまとまりを、見出し、間隔、区切り方で表す。区切りは余白から検討し、前の方法で伝わる場合は次の方法を足さない。"
      />

      <Section title="区切り方の順序" lead="余白 → 文字の強弱 → 細い境界線 → 背景色 → Card の順に検討する。">
        <ol className="mb-10 flex flex-col">
          {ladder.map((l) => (
            <li key={l.n} className="grid grid-cols-[2rem_1fr] items-baseline gap-x-2 gap-y-1 border-b border-border py-3 text-ui last:border-b-0 sm:grid-cols-[2rem_8rem_1fr]">
              <span className="text-muted-foreground tabular-nums">{l.n}</span>
              <span className="font-medium">{l.name}</span>
              <span className="col-start-2 text-muted-foreground sm:col-start-3">{l.note}</span>
            </li>
          ))}
        </ol>
        <SeparationSamples />
      </Section>

      <Section title="見出し" lead="見出しの階層は HTML の見出しの要素で表し、文字の大きさだけで表さない。Section を入れ子にすると、見出しの要素が 1 つずつ下がる。">
        <Row label="セクション">24px / 600（h2）。見出しと内容の間は 24px。</Row>
        <Row label="サブセクション">20px / 600（h3）。見出しと内容の間は 16px。</Row>
        <Row label="補足の説明">14px。必要な場合だけ、見出しの下 8px に置く。</Row>
        <Row label="操作">見出しの右に置き、Secondary か Ghost を基本とする。収まらない場合は見出しの下へ移す。</Row>
        <Example className="mt-6">
          <HeadingOutline>
            <PatternSection>
              <SectionHeader>
                <SectionHeading>
                  <SectionTitle>請求の設定</SectionTitle>
                  <SectionDescription>顧客に送る請求書の内容と送り方。</SectionDescription>
                </SectionHeading>
                <SectionActions>
                  <Button variant="secondary" size="sm">
                    既定に戻す
                  </Button>
                </SectionActions>
              </SectionHeader>
              <SectionStack spacing="group">
                <PatternSection>
                  <SectionHeader>
                    <SectionTitle>差出人</SectionTitle>
                  </SectionHeader>
                  <p className="text-ui">株式会社フロー（billing@flow.example.com）</p>
                </PatternSection>
                <PatternSection>
                  <SectionHeader>
                    <SectionTitle>送付の時期</SectionTitle>
                  </SectionHeader>
                  <p className="text-ui">毎月 25 日に、翌月分を送る。</p>
                </PatternSection>
              </SectionStack>
            </PatternSection>
          </HeadingOutline>
        </Example>
      </Section>

      <Section title="余白" lead="すべての間隔を同じにせず、情報の関係を間隔で表す。値は Spacing のトークン（4px 単位の 13 段階）から選ぶ。">
        <ul className="flex flex-col" data-testid="spacing-scale">
          {spacing.map(([name, label, [a, b]]) => (
            <li key={name} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-border py-3 text-ui last:border-b-0 sm:grid-cols-[10rem_5rem_1fr]">
              <span>{name}</span>
              <span className="text-muted-foreground tabular-nums">{label}</span>
              <span className="col-span-2 flex items-center gap-2 sm:col-span-1" aria-hidden="true">
                <span className="h-3 rounded-xs bg-muted-foreground/50" style={{ width: a }} />
                <span className="h-3 rounded-xs bg-muted-foreground/25" style={{ width: b }} />
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Card" lead="独立した情報の単位や、並べて比べることに意味がある場合に使う。例：料金のプラン、独立したプロジェクト、複数の選択肢。">
        <Compare
          bad={
            <Card className="w-full">
              <CardHeader>
                <CardTitle>顧客の情報</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Card size="sm">
                  <CardContent>
                    <Fact k="会社名" v="株式会社山田商事" />
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardContent>
                    <Fact k="住所" v="東京都千代田区丸の内 1-1-1" />
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          }
          badNote="同じ文脈の連続した情報を、項目ごとに Card で囲み、さらに入れ子にしている。枠が増えるだけで、関係は伝わりにくくなる。"
          good={
            <div className="w-full">
              <p className="text-heading">顧客の情報</p>
              <dl className="mt-4 flex flex-col gap-3">
                <Fact k="会社名" v="株式会社山田商事" />
                <Fact k="住所" v="東京都千代田区丸の内 1-1-1" />
              </dl>
            </div>
          }
          goodNote="見出しと余白で 1 つのまとまりとして示す。"
        />
      </Section>

      <Section title="列の構成">
        <Row label="1 列">順序のある情報、入力、手続き。</Row>
        <Row label="均等な複数列">同等の重要性を持つ情報の比較（PageColumns layout=&quot;equal&quot;）。</Row>
        <Row label="メインと補足">中心の情報と、参照の頻度が高い補足の情報（PageColumns layout=&quot;main-aside&quot;）。</Row>
        <Row label="避ける">空いた領域を埋めるためだけに複数列にしない。</Row>
      </Section>

      <Section title="折りたたみ" lead="原則として情報は常に表示する。詳細の設定、使う頻度の低い情報、長い補足だけを Accordion で折りたたむ。">
        <Compare
          bad={
            <Accordion className="w-full">
              <AccordionItem value="detail">
                <AccordionTrigger level={4}>詳細の設定</AccordionTrigger>
                <AccordionContent>
                  <Field invalid>
                    <FieldLabel>請求書の送付先</FieldLabel>
                    <Input defaultValue="keiri@" />
                    <FieldError match>メールアドレスの形式で入力してください</FieldError>
                  </Field>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          }
          badNote="入力のエラーがある項目を、閉じた状態で隠している。送信しても、どこを直せばよいかわからない。"
          good={
            <div className="flex w-full flex-col gap-4">
              <Alert variant="destructive">
                <AlertTitle>1 件のエラーがある</AlertTitle>
                <AlertDescription>詳細の設定の「請求書の送付先」を確認する</AlertDescription>
              </Alert>
              <Accordion defaultValue={["detail"]}>
                <AccordionItem value="detail">
                  <AccordionTrigger level={4}>詳細の設定</AccordionTrigger>
                  <AccordionContent>エラーのある項目を含む場合は、開いた状態で表示する。</AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          }
          goodNote="重要な情報と入力のエラーは、初めから見える状態にする。閉じても入力した値は失わない（Accordion の keepMounted）。"
        />
      </Section>

      <Section title="実装例">
        <Code>{`<SectionStack>                    {/* セクションの間 48px */}
  <Section>                       {/* h2（ページの h1 の下） */}
    <SectionHeader>
      <SectionHeading>
        <SectionTitle>請求の設定</SectionTitle>
        <SectionDescription>…</SectionDescription>
      </SectionHeading>
      <SectionActions><Button variant="secondary">既定に戻す</Button></SectionActions>
    </SectionHeader>
    <Section>…</Section>           {/* 入れ子は h3 */}
  </Section>
  <Section divider>…</Section>     {/* 余白と文字で足りない場合だけ線を引く */}
</SectionStack>`}</Code>
      </Section>

      <Section title="製品の責務">
        <Bullets items={["見出しの文言。見出しと同じ意味の説明を添えない", "背景色と Card を使う理由（区切り方の順序のどの段階か）", "見出しの階層を変える必要がある場合の level の指定（Card の中など）"]} />
      </Section>
    </article>
  )
}
