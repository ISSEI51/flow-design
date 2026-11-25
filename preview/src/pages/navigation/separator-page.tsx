import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const contract = [
  ["契約番号", "C-2026-0142"],
  ["契約期間", "2026年4月1日〜2027年3月31日"],
  ["月額", "¥128,000"],
]

export function SeparatorPage() {
  return (
    <article>
      <PageHeader
        name="Separator"
        lead="論理的に異なる情報や操作のグループを区切る。余白と文字の強弱で区別できる場合は置かない。"
      />

      <Section title="基本" lead="太さ 1px、色は border。影とグラデーションは使わない。">
        <Row label="横方向" note='orientation="horizontal"（既定）'>
          <div className="w-full max-w-md">
            <p className="text-ui font-medium">契約の内容</p>
            <Separator data-testid="separator-horizontal" className="my-4" />
            <p className="text-ui text-muted-foreground">請求先と支払い方法</p>
          </div>
        </Row>
        <Row label="縦方向" note='orientation="vertical"。操作のグループの間に置く'>
          <div className="flex h-10 items-center gap-2">
            <Button variant="ghost" size="sm">
              複製
            </Button>
            <Button variant="ghost" size="sm">
              書き出す
            </Button>
            <Separator data-testid="separator-vertical" orientation="vertical" className="mx-2 h-6 self-center" />
            <Button variant="ghost" size="sm" className="text-destructive">
              削除する
            </Button>
          </div>
        </Row>
      </Section>

      <Section
        title="意味のある区切りと装飾の線"
        lead="区切りの前後で内容が変わる場合は、既定のまま支援技術に伝える。見た目を整えるだけの線は decorative にする。"
      >
        <Row label="意味のある区切り" note='role="separator"。操作のグループの境目を伝える'>
          <div className="flex h-10 items-center gap-2">
            <Button variant="ghost" size="sm">
              編集
            </Button>
            <Separator data-testid="separator-semantic" orientation="vertical" className="mx-2 h-6 self-center" />
            <Button variant="ghost" size="sm">
              アーカイブ
            </Button>
          </div>
        </Row>
        <Row label="装飾" note='decorative。role="none" にし、支援技術には伝えない'>
          <div className="w-full max-w-md">
            <p className="text-ui text-muted-foreground">株式会社山田商事</p>
            <Separator data-testid="separator-decorative" decorative className="my-4" />
            <p className="text-ui text-muted-foreground">東京都千代田区丸の内 1-1-1</p>
          </div>
        </Row>
      </Section>

      <Section
        title="区切り方の順序"
        lead="1 余白、2 文字の大きさと太さ、3 薄い境界線、4 背景色、5 Card の順に検討する。前の方法で足りる場合は、次の方法を足さない。"
      >
        <div data-testid="separator-order" className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-caption text-muted-foreground">1 余白</p>
            <div className="mt-4 space-y-6">
              <Detail title="契約" rows={contract.slice(0, 2)} />
              <Detail title="請求" rows={[["請求日", "毎月末日"]]} />
            </div>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">2 文字の大きさと太さ</p>
            <div className="mt-4 space-y-4">
              <p className="text-heading">山田商事</p>
              <Detail title="契約" rows={contract.slice(0, 2)} />
            </div>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">3 薄い境界線</p>
            <div className="mt-4">
              <Detail title="契約" rows={contract.slice(0, 2)} />
              <Separator className="my-4" />
              <Detail title="請求" rows={[["請求日", "毎月末日"]]} />
            </div>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">4 背景色</p>
            <div className="mt-4 space-y-2">
              <div className="rounded-md bg-muted p-4">
                <Detail title="契約" rows={contract.slice(0, 2)} />
              </div>
              <div className="rounded-md bg-muted p-4">
                <Detail title="請求" rows={[["請求日", "毎月末日"]]} />
              </div>
            </div>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">5 Card</p>
            <Card size="sm" className="mt-4">
              <CardHeader>
                <CardTitle>未入金</CardTitle>
                <CardDescription>2026年11月末時点</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-metric tabular-nums">¥384,000</p>
              </CardContent>
            </Card>
          </div>
        </div>
        <p className="mt-6 max-w-[40rem] text-ui text-muted-foreground">
          Card は、KPI のように独立して読まれる情報だけに使う。
        </p>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <div className="w-full max-w-xs">
              {contract.map(([k, v], i) => (
                <div key={k}>
                  {i > 0 && <Separator className="my-3" />}
                  <p className="text-caption text-muted-foreground">{k}</p>
                  <p className="text-ui">{v}</p>
                </div>
              ))}
            </div>
          }
          badNote="関係の近い項目の間すべてに線を引く。線が多く、どこで内容が変わるのか、かえってわからない。"
          good={
            <div className="w-full max-w-xs">
              <dl className="space-y-3">
                {contract.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-caption text-muted-foreground">{k}</dt>
                    <dd className="text-ui">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          }
          goodNote="関係の近い項目は余白でまとめる。線は、内容が変わる境目だけに使う。"
        />
      </Section>
    </article>
  )
}

function Detail({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div>
      <p className="text-ui font-semibold">{title}</p>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-3 text-ui">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
