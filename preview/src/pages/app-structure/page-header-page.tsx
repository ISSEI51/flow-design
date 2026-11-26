import { useState } from "react"
import { Download, Pencil, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader as DocHeader } from "../../layout/page-header"
import { Bullets, Code, Example } from "./parts"

// 資料の中の例は、文書の見出しの階層（h1 は資料のタイトル）に合わせて h3 にする。製品では h1。
const T = (props: { children: string }) => <PageHeaderTitle as="h3" {...props} />

const periods = [
  { value: "month", label: "今月" },
  { value: "quarter", label: "今四半期" },
]

const widths = [
  { value: "320", label: "320px" },
  { value: "480", label: "480px" },
  { value: "720", label: "720px" },
  { value: "full", label: "幅いっぱい" },
]

function ResponsiveDemo() {
  const [width, setWidth] = useState("480")
  const [long, setLong] = useState(true)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-ui">
        <fieldset className="flex flex-wrap gap-x-4">
          <legend className="sr-only">領域の幅</legend>
          {widths.map((w) => (
            <label key={w.value} className="flex min-h-10 cursor-pointer items-center gap-2">
              <input type="radio" name="ph-width" checked={width === w.value} onChange={() => setWidth(w.value)} className="size-4 accent-[var(--primary)]" />
              {w.label}
            </label>
          ))}
        </fieldset>
        <label className="flex min-h-10 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          長いタイトル
        </label>
      </div>
      <div data-testid="ph-responsive" className="max-w-full rounded-xl border border-border py-6" style={{ width: width === "full" ? "100%" : `${width}px` }}>
        <PageLayout width="full">
          <PageHeader>
            <PageHeaderContent>
              <T>{long ? "北日本精密機械工業株式会社 札幌第二工場 生産管理部の契約" : "顧客"}</T>
            </PageHeaderContent>
            <PageHeaderActions>
              <Button variant="secondary">
                <Download />
                書き出す
              </Button>
              <Button>
                <Plus />
                顧客を登録
              </Button>
            </PageHeaderActions>
          </PageHeader>
        </PageLayout>
      </div>
    </div>
  )
}

function StickyDemo() {
  return (
    <div data-testid="ph-sticky" className="h-96 overflow-y-auto rounded-xl border border-border">
      <PageLayout width="full">
        <PageHeader sticky>
          <PageHeaderContent>
            <T>11 月の請求の確認</T>
            <PageHeaderDescription>未確認 12 件・確認済み 36 件</PageHeaderDescription>
          </PageHeaderContent>
          <PageHeaderActions>
            <Button>確認済みにする</Button>
          </PageHeaderActions>
        </PageHeader>
        <ul className="flex flex-col">
          {Array.from({ length: 20 }, (_, i) => (
            <li key={i} className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
              <span className="text-ui">請求書 INV-2026-11{String(i + 1).padStart(2, "0")}</span>
              <Button variant="ghost" size="sm">
                開く
              </Button>
            </li>
          ))}
        </ul>
      </PageLayout>
    </div>
  )
}

export function PageHeaderPatternPage() {
  return (
    <article>
      <DocHeader
        eyebrow="Patterns / App Structure"
        name="Page Header"
        lead="ページの目的（タイトル）と、ページ全体に対する操作をまとめる。左にタイトル、右に操作を置き、背景はメインの内容と同じにする。"
      />

      <Section title="構造">
        <Row label="タイトル">28px / 600 の h1。ページの目的を示す。</Row>
        <Row label="補足の説明">14px。必要な場合だけ置く。タイトルとの間は 8px。</Row>
        <Row label="操作">右に置き、間は 8px。主要な操作（Primary）は原則 1 つで、不要な場合は置かない。補助の操作は Secondary か Ghost。</Row>
        <Row label="内容との間">32px（PageLayout が取る）。境界線と Card は使わない。</Row>
        <Row label="Breadcrumb">階層や現在地がわかりにくい場合だけ、タイトルの上に置く。</Row>
      </Section>

      <Section title="使用例">
        <div className="flex flex-col gap-6">
          <Example label="一覧：ページ名と登録の操作" testId="ph-list">
            <PageHeader>
              <PageHeaderContent>
                <T>顧客</T>
              </PageHeaderContent>
              <PageHeaderActions>
                <Button variant="secondary">
                  <Download />
                  書き出す
                </Button>
                <Button>
                  <Plus />
                  顧客を登録
                </Button>
              </PageHeaderActions>
            </PageHeader>
          </Example>
          <Example label="詳細：対象の名前、ステータス、編集の操作。一覧への戻り先を Breadcrumb で示す" testId="ph-detail">
            <PageHeader
              breadcrumb={
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="#/page-header" onClick={(e) => e.preventDefault()}>
                        顧客
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>株式会社山田商事</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              }
            >
              <PageHeaderContent>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <T>株式会社山田商事</T>
                  <Badge variant="success">契約中</Badge>
                </div>
                <PageHeaderDescription>卸売業・関東・担当 佐藤 花子</PageHeaderDescription>
              </PageHeaderContent>
              <PageHeaderActions>
                <Button>
                  <Pencil />
                  編集
                </Button>
              </PageHeaderActions>
            </PageHeader>
          </Example>
          <Example label="設定：タイトルと Tabs" testId="ph-settings">
            <div className="flex flex-col gap-6">
              <PageHeader>
                <PageHeaderContent>
                  <T>設定</T>
                </PageHeaderContent>
              </PageHeader>
              <Tabs defaultValue="general">
                <TabsList aria-label="設定の種類">
                  <TabsTrigger value="general">一般</TabsTrigger>
                  <TabsTrigger value="notifications">通知</TabsTrigger>
                  <TabsTrigger value="members">メンバー</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </Example>
          <Example label="分析：タイトルと期間などの条件" testId="ph-analytics">
            <PageHeader>
              <PageHeaderContent>
                <T>売上のレポート</T>
                <PageHeaderDescription>金額は税抜き。前日までの確定分。</PageHeaderDescription>
              </PageHeaderContent>
              <PageHeaderActions>
                <Select items={periods} defaultValue="month">
                  <SelectTrigger aria-label="期間" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PageHeaderActions>
            </PageHeader>
          </Example>
        </div>
      </Section>

      <Section title="レスポンシブ" lead="操作がタイトルの右に収まる場合は右に、収まらない場合はタイトルの下に置く。判断は画面の幅ではなく Page Header の領域の幅で行い、タイトルに 20rem を残せない場合に下へ移す。操作は隠さない。">
        <ResponsiveDemo />
      </Section>

      <Section title="スクロール" lead="通常は内容と一緒にスクロールする。常に確認する情報や頻繁な操作がある場合だけ Sticky にする。固定している間だけ下に細い境界線を引き、フォーカスした要素が Page Header の下に隠れないよう、スクロールの領域に scroll-padding-top を設定する。">
        <StickyDemo />
      </Section>

      <Section title="アンチパターン">
        <Compare
          bad={
            <PageHeader className="w-full">
              <PageHeaderContent>
                <T>顧客管理</T>
                <PageHeaderDescription>顧客の情報を管理できます。</PageHeaderDescription>
              </PageHeaderContent>
            </PageHeader>
          }
          badNote="タイトルを繰り返すだけの説明は、読む量を増やすだけで判断の役に立たない（原則 04）。"
          good={
            <PageHeader className="w-full">
              <PageHeaderContent>
                <T>顧客</T>
              </PageHeaderContent>
            </PageHeader>
          }
          goodNote="タイトルだけで目的がわかる場合は、説明を置かない。"
        />
        <Compare
          bad={
            <PageHeader className="w-full">
              <PageHeaderContent>
                <T>顧客</T>
              </PageHeaderContent>
              <PageHeaderActions>
                <Button>書き出す</Button>
                <Button>取り込む</Button>
                <Button>顧客を登録</Button>
              </PageHeaderActions>
            </PageHeader>
          }
          badNote="Primary が複数あると、最初にすべき操作がわからない。"
          good={
            <PageHeader className="w-full">
              <PageHeaderContent>
                <T>顧客</T>
              </PageHeaderContent>
              <PageHeaderActions>
                <Button variant="ghost">取り込む</Button>
                <Button variant="secondary">書き出す</Button>
                <Button>顧客を登録</Button>
              </PageHeaderActions>
            </PageHeader>
          }
          goodNote="主要な操作は 1 つ。補助の操作は Secondary と Ghost にし、主要な操作を最後（右端）に置く。"
        />
        <Row label="Breadcrumb の機械的な追加">Sidebar で現在地がわかる最上位のページ（顧客の一覧など）には置かない。詳細や登録など、戻り先を示す必要があるページにだけ置く。</Row>
        <Row label="Card と境界線">Page Header を Card で囲んだり、下に常に線を引いたりしない。背景はメインの内容と同じ。</Row>
      </Section>

      <Section title="実装例">
        <Code>{`<PageHeader breadcrumb={<Breadcrumb>…</Breadcrumb>}>
  <PageHeaderContent>
    <PageHeaderTitle>株式会社山田商事</PageHeaderTitle>
    <PageHeaderDescription>卸売業・担当 佐藤 花子</PageHeaderDescription>
  </PageHeaderContent>
  <PageHeaderActions>
    <Button variant="secondary">メールを作成</Button>
    <Button>編集</Button>
  </PageHeaderActions>
</PageHeader>`}</Code>
      </Section>

      <Section title="製品の責務">
        <Bullets items={["ページのタイトルの文言と、document.title の更新", "Breadcrumb の階層とリンク先（ルーティング）", "操作の権限による表示", "Sticky にするかどうかの判断"]} />
      </Section>
    </article>
  )
}
