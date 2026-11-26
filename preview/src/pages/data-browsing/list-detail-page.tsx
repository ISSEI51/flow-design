import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { getRecordNeighbors } from "@/patterns/list-detail"
import { TableScrollArea } from "@/patterns/table-scroll-area"

import { customers, formatYen } from "../../data/data-display/customers"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { CompanyBrowser } from "./company-browser"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "./doc-parts"

// ---------------------------------------------------------------- Inline Expansion：少量の補足を、行の下に開く
const invoices = [
  { id: "INV-1041", company: "株式会社青葉製作所", total: 132000, lines: [["基本料金（11 月）", 120000], ["追加の利用者 2 人", 12000]] },
  { id: "INV-1042", company: "朝日ソリューションズ", total: 88000, lines: [["基本料金（11 月）", 88000]] },
  { id: "INV-1043", company: "合同会社北斗物流", total: 214500, lines: [["基本料金（11 月）", 180000], ["追加の利用者 5 人", 30000], ["振込手数料", 4500]] },
] as const

function InlineExpansionDemo() {
  const [open, setOpen] = useState<string[]>([])
  return (
    <DemoFrame testId="ld-inline">
      <Table>
        <TableCaption className="sr-only">請求書の一覧（明細を行の下に開く）</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <span className="sr-only">明細</span>
            </TableHead>
            <TableHead>請求書</TableHead>
            <TableHead>請求先</TableHead>
            <TableHead align="right">金額</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.flatMap((inv) => {
            const expanded = open.includes(inv.id)
            const rows = [
              <TableRow key={inv.id}>
                <TableCell className="px-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-expanded={expanded}
                    aria-controls={`${inv.id}-lines`}
                    aria-label={`${inv.id}の明細`}
                    onClick={() => setOpen((o) => (expanded ? o.filter((x) => x !== inv.id) : [...o, inv.id]))}
                  >
                    {expanded ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                </TableCell>
                <TableCell className="tabular-nums">{inv.id}</TableCell>
                <TableCell>{inv.company}</TableCell>
                <TableCell align="right">{formatYen(inv.total)}</TableCell>
              </TableRow>,
            ]
            if (expanded) {
              rows.push(
                <TableRow key={`${inv.id}-lines`} id={`${inv.id}-lines`}>
                  <TableCell />
                  <TableCell colSpan={3}>
                    <ul className="flex flex-col gap-1 py-1 text-ui text-muted-foreground">
                      {inv.lines.map(([name, amount]) => (
                        <li key={name} className="flex justify-between gap-4">
                          <span>{name}</span>
                          <span className="tabular-nums">{formatYen(amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              )
            }
            return rows
          })}
        </TableBody>
      </Table>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- Split View：連続して処理する
const queue = customers.slice(0, 8).map((c, i) => ({
  id: `Q-${300 + i}`,
  company: c.company,
  subject: ["請求書の再発行", "利用者の追加", "契約の更新の相談", "支払い方法の変更"][i % 4],
  body: `${c.company}の${c.owner}さんから。${["11 月分の請求書を再発行してほしい。", "利用者を 3 人追加したい。", "来月の更新の条件を確認したい。", "口座振替に変えたい。"][i % 4]}`,
}))

function SplitViewDemo() {
  const [active, setActive] = useState(queue[0].id)
  const [done, setDone] = useState<string[]>([])
  const item = queue.find((q) => q.id === active)!
  const { nextId, position } = getRecordNeighbors({ ids: queue.map((q) => q.id), activeId: active, total: queue.length })
  return (
    <DemoFrame testId="ld-split">
      <div className="grid min-w-0 gap-6 @2xl/page:grid-cols-[16rem_1fr]">
        <ul aria-label="問い合わせ" className="flex flex-col">
          {queue.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                aria-current={q.id === active ? "true" : undefined}
                onClick={() => setActive(q.id)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left text-ui outline-none hover:bg-accent focus-visible:focus-ring",
                  "aria-[current]:bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))]"
                )}
              >
                <span className={cn("font-medium", done.includes(q.id) && "text-muted-foreground line-through")}>{q.subject}</span>
                <span className="text-caption text-muted-foreground">{q.company}</span>
              </button>
            </li>
          ))}
        </ul>
        <section aria-label="問い合わせの内容" className="flex min-w-0 flex-col gap-4 @2xl/page:border-l @2xl/page:border-border @2xl/page:pl-6">
          <div>
            <p className="text-caption text-muted-foreground">
              {item.id}・{position} / {queue.length}件目
            </p>
            <h3 className="mt-1 text-heading">{item.subject}</h3>
          </div>
          <p className="text-ui">{item.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setDone((d) => [...d, item.id])
                if (nextId) setActive(nextId)
              }}
            >
              対応済みにして次へ
            </Button>
            <Button variant="ghost" size="sm" disabled={!nextId} onClick={() => nextId && setActive(nextId)}>
              次の問い合わせ
            </Button>
          </div>
        </section>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 横スクロールの手がかり
const widths = [
  ["100%", "幅いっぱい"],
  ["640px", "640px"],
  ["360px", "360px"],
] as const

function ScrollCueDemo() {
  const [width, setWidth] = useState<string>("360px")
  const rows = customers.slice(0, 5)
  return (
    <div className="flex flex-col gap-4">
      <DemoControls legend="表の領域の幅（Sidebar の開閉で変わる幅を想定）">
        {widths.map(([v, l]) => (
          <Radio key={v} name="ld-width" checked={width === v} onChange={() => setWidth(v)}>
            {l}
          </Radio>
        ))}
      </DemoControls>
      <div className="max-w-full" style={{ width }} data-testid="ld-scroll-demo">
        <TableScrollArea>
          <Table bordered>
            <TableCaption className="sr-only">顧客の一覧（横スクロールの例）</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>会社名</TableHead>
                <TableHead>担当者</TableHead>
                <TableHead>地域</TableHead>
                <TableHead>業種</TableHead>
                <TableHead align="right">利用者数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">{c.company}</TableCell>
                  <TableCell className="whitespace-nowrap">{c.owner}</TableCell>
                  <TableCell className="whitespace-nowrap">{c.region}</TableCell>
                  <TableCell className="whitespace-nowrap">{c.industry}</TableCell>
                  <TableCell align="right">{c.seats}人</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScrollArea>
      </div>
    </div>
  )
}

export function ListDetailPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Browsing"
        name="List & Detail"
        lead="一覧から詳細を確かめ、必要な操作へ進み、一覧に戻る。詳細の表示方式は、情報の量と作業の流れで選ぶ。すべてを Sheet や別ページに統一しない。"
      />

      <Section title="操作できる例" lead="行のどこを押しても詳細を開く（Checkbox、電話番号のリンク、行の操作、文字の選択を除く）。詳細は非モーダルの Sheet で開き、閉じずに別の行へ切り替えられる。編集はモーダルの Sheet。">
        <div className="flex flex-col gap-4">
          <DemoFrame>
            <CompanyBrowser testId="ld-demo" workspace="hq" />
          </DemoFrame>
          <AppLink href="#/browsing-app?page=customers">別ページの詳細と、一覧への復帰を検証画面で試す</AppLink>
        </div>
      </Section>

      <Section title="表示方式の使い分け">
        <Rules
          rows={[
            ["Sheet（非モーダル）", "簡単な詳細の確認。背景を暗くせず、一覧の別の行に切り替えられる。詳細を表示中の行（左端の線）と、一括操作の選択（面の色）を分ける"],
            ["別ページ", "情報量が多い詳細、複雑な操作、URL で共有する必要がある場合。戻ったときは条件、スクロールの位置、フォーカスを復元する"],
            ["Split View", "連続して複数の情報を処理する場合（問い合わせの対応など）"],
            ["Inline Expansion", "少量の補足、複数の行の比較（請求の明細など）"],
            ["編集", "原則としてモーダルの Sheet。複雑な編集は別ページ。未保存の変更は、閉じる前に破棄を確認する"],
          ]}
        />
      </Section>

      <Section title="Split View" lead="次の対象へ続けて進む作業。一覧と詳細を並べ、狭い領域では縦に並べる。">
        <SplitViewDemo />
      </Section>

      <Section title="Inline Expansion" lead="少量の補足を、行の下に開く。複数の行を開いて比べられる。">
        <InlineExpansionDemo />
      </Section>

      <Section title="Table の横スクロール" lead="ページ全体ではなく Table の領域の中でスクロールする。横に続く情報がある方向にだけ、端に薄い影を表示し、端に着いたら消す。ネイティブのスクロールバーは隠さない。">
        <ScrollCueDemo />
      </Section>

      <Section title="一覧への復帰">
        <Bullets
          items={[
            "検索語、フィルター、ソート、ページ番号とページサイズ、縦と横のスクロールの位置、フォーカスしていた行を復元する。",
            "復元は、データの表示が終わってから行う（AppShellMain の scrollOnNavigate と focusOnNavigate を false にし、製品が useListPositionRestore で戻す）。",
            "対象の行がなくなった場合は、同じ位置の行、なければ検索欄や Empty の操作にフォーカスを移す。",
            "ブラウザの戻る・進むに対応するため、履歴の項目ごとに一覧の記録を持つ。URL への同期と保存は製品の責務。",
          ]}
        />
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="閲覧のための Sheet で背景を暗くし、一覧を操作できなくした例">
              <div className="relative h-28 overflow-hidden rounded-sm bg-black/40">
                <div className="absolute inset-y-0 right-0 w-1/2 bg-background p-3 text-ui">詳細</div>
              </div>
            </Mock>
          }
          badNote="閲覧のたびに閉じて開き直す必要があり、連続した確認の負荷が大きい。"
          good={
            <Mock label="非モーダルの Sheet で、一覧を見ながら別の行に切り替えられる例">
              <div className="relative flex h-28 overflow-hidden rounded-sm border border-border">
                <div className="flex w-1/2 flex-col gap-2 p-3">
                  <div className="h-2 rounded-full bg-border" />
                  <div className="h-2 rounded-full bg-border shadow-[inset_2px_0_0_var(--primary)]" />
                  <div className="h-2 rounded-full bg-border" />
                </div>
                <div className="w-1/2 border-l border-border p-3 text-ui">詳細</div>
              </div>
            </Mock>
          }
          goodNote="背景を暗くせず、一覧の行を押すと詳細が切り替わる。"
        />
        <Compare
          bad={
            <Mock label="行の右端の小さな「詳細」のリンクだけで詳細を開く例">
              <div className="flex justify-between border-b border-border py-2 text-ui">
                <span>株式会社青葉製作所</span>
                <span className="text-caption underline">詳細</span>
              </div>
            </Mock>
          }
          badNote="押せる範囲が小さく、行のどこを押せばよいかがわからない。"
          good={
            <Mock label="行全体を押すと詳細を開き、会社名がキーボードで開くボタンになっている例">
              <div className="flex justify-between rounded-sm bg-[color-mix(in_srgb,var(--foreground)_6%,var(--background))] px-2 py-2 text-ui">
                <span className="font-medium">株式会社青葉製作所</span>
                <span className="text-muted-foreground">03-1234-5678</span>
              </div>
            </Mock>
          }
          goodNote="行全体を押せる範囲にし、会社名をキーボードで詳細を開くボタンにする。"
        />
      </Section>
    </article>
  )
}
