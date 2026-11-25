import { ArrowUpRight, MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { kpis } from "../../data/business"

export function CardPage() {
  return (
    <article>
      <PageHeader
        name="Card"
        lead="独立した意味を持つ情報をまとめる。囲まなくてもまとまりがわかる場合は使わない。"
      />

      <Section title="基本" lead="背景は card、1px の border、角丸 20px、内側の余白 24px、部分どうしの間 16px。影は付けない。">
        <Row label="構造" note="CardHeader、CardTitle、CardDescription、CardAction、CardContent、CardFooter">
          <Card data-testid="card-default" className="w-full max-w-md">
            <CardHeader>
              <CardTitle data-testid="card-default-title">株式会社山田商事</CardTitle>
              <CardDescription>製造業・東京都千代田区</CardDescription>
              <CardAction>
                <Button variant="ghost" size="icon-sm" aria-label="山田商事の操作">
                  <MoreHorizontal />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-caption text-muted-foreground">契約</dt>
                  <dd className="mt-1 text-ui">スタンダード</dd>
                </div>
                <div>
                  <dt className="text-caption text-muted-foreground">担当</dt>
                  <dd className="mt-1 text-ui">佐藤 花子</dd>
                </div>
              </dl>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" size="sm">
                顧客の詳細へ
              </Button>
            </CardFooter>
          </Card>
        </Row>
      </Section>

      <Section title="大きさ" lead="size で余白と角丸を変える。同じ並びの Card は大きさをそろえる。">
        <Row label="sm" note="余白 16px、角丸 20px。タイトル 16px、太さ 600">
          <Card data-testid="card-sm" size="sm" className="w-full max-w-xs">
            <CardHeader>
              <CardTitle>今月の新規契約</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-metric tabular-nums">12 件</p>
            </CardContent>
          </Card>
        </Row>
        <Row label="余白の上書き" note='size="sm" に className="p-0" を指定し、内容の側で余白を取る'>
          <Card data-testid="card-sm-override" size="sm" className="w-full max-w-xs p-0">
            <div className="p-4">
              <p className="text-ui text-muted-foreground">内容の側で余白を取る Card</p>
            </div>
          </Card>
        </Row>
        <Row label="default" note="余白 24px、角丸 20px。タイトル 20px、太さ 600">
          <Card data-testid="card-md" className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>今月の新規契約</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-metric tabular-nums">12 件</p>
            </CardContent>
          </Card>
        </Row>
        <Row label="lg" note="余白 32px、角丸 24px。ページの主題になる大きな Card">
          <Card data-testid="card-lg" size="lg" className="w-full max-w-md">
            <CardHeader>
              <CardTitle>スタンダードプラン</CardTitle>
              <CardDescription>従業員 300 名までの企業向け</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-metric tabular-nums">¥128,000 / 月</p>
            </CardContent>
            <CardFooter>
              <Button>このプランで契約する</Button>
            </CardFooter>
          </Card>
        </Row>
      </Section>

      <Section title="KPI の並び" lead="画面の幅に合わせて列の数を変える。高さは行の中でそろえる。">
        <div data-testid="card-grid" className="grid gap-4 sm:grid-cols-2">
          {kpis.map((k) => (
            <Card key={k.label} size="sm">
              <CardHeader>
                <CardDescription>{k.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-metric tabular-nums">{k.value}</p>
                <p className="mt-1 text-caption text-muted-foreground">{k.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="長い内容" lead="タイトルと内容は省略せずに折り返す。">
        <Row label="日本語・英語">
          <div className="grid w-full gap-4 sm:grid-cols-2">
            <Card data-testid="card-long">
              <CardHeader>
                <CardTitle>北日本精密機械工業株式会社 札幌第二工場 生産管理部</CardTitle>
                <CardDescription>契約の更新日の 30 日前に、担当者と経理部の両方へ通知します</CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>International Precision Manufacturing Holdings Corporation</CardTitle>
                <CardDescription>Renewal notices are sent to both the contact and the accounting team.</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </Row>
      </Section>

      <Section
        title="操作できる Card"
        lead="Card 全体を押せる場合は、タイトルをリンクにして範囲を Card 全体に広げる。ホバーとフォーカスの表示を付け、情報を表示するだけの Card と区別する。"
      >
        <Row label="リンクの Card" note="名前はタイトル。Card の中に他の操作を置かない">
          <div className="grid w-full gap-4 sm:grid-cols-2">
            {[
              ["株式会社山田商事", "契約 3 件・未入金なし"],
              ["北海物産株式会社", "契約 1 件・未入金 ¥42,000"],
            ].map(([name, note]) => (
              <Card
                key={name}
                data-testid="card-link"
                size="sm"
                className="transition-[background-color] duration-(--duration-fast) ease-standard has-[a:hover]:bg-accent has-[a:focus-visible]:focus-ring"
              >
                <CardHeader>
                  <CardTitle>
                    <a
                      href="#/card"
                      onClick={(e) => e.preventDefault()}
                      className="outline-none after:absolute after:inset-0 after:content-['']"
                    >
                      {name}
                    </a>
                  </CardTitle>
                  <CardDescription>{note}</CardDescription>
                  <CardAction>
                    <ArrowUpRight aria-hidden="true" className="size-5 text-muted-foreground" />
                  </CardAction>
                </CardHeader>
              </Card>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={<CardHeavy />}
          badNote="入力欄、説明文、表までを Card で囲み、Card の中に Card を重ねる。枠が増え、どれが独立した情報なのかわからない。"
          good={<CardLight />}
          goodNote="独立して読まれる KPI だけを Card にし、残りは余白と見出しで整理する。"
        />
      </Section>
    </article>
  )
}

const invoices = [
  ["11月分", "¥128,000", "入金済み"],
  ["10月分", "¥128,000", "入金済み"],
]

function CardHeavy() {
  return (
    <div data-testid="card-heavy" className="w-full space-y-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle>顧客情報</CardTitle>
          <CardDescription>顧客の情報を表示します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Card size="sm">
            <CardContent>
              <p className="text-caption text-muted-foreground">未入金</p>
              <p className="text-heading tabular-nums">¥0</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <table className="w-full text-ui">
                <tbody>
                  {invoices.map((r) => (
                    <tr key={r[0]}>
                      {r.map((c) => (
                        <td key={c} className="py-1">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
}

function CardLight() {
  return (
    <div data-testid="card-light" className="w-full">
      <Card size="sm" className="w-40">
        <CardContent>
          <p className="text-caption text-muted-foreground">未入金</p>
          <p className="text-heading tabular-nums">¥0</p>
        </CardContent>
      </Card>
      <p className="mt-6 text-ui font-semibold">請求</p>
      <table className="mt-2 w-full text-ui">
        <tbody>
          {invoices.map((r) => (
            <tr key={r[0]} className="border-b border-border last:border-b-0">
              {r.map((c) => (
                <td key={c} className="py-2">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
