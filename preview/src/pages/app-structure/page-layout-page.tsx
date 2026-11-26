import { useState } from "react"

import { PageColumns } from "@/patterns/page-layout"
import { cn } from "@/lib/utils"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets, Code, S, Schematic, SchematicLines, ShellFrame } from "./parts"

const widthTable = [
  { id: "full", name: "Full Width", px: null, use: "一覧、Table" },
  { id: "wide", name: "Wide", px: 1440, use: "分析、ダッシュボード" },
  { id: "standard", name: "Standard", px: 960, use: "詳細、設定" },
  { id: "focused", name: "Focused", px: 640, use: "登録、編集、フォーム" },
  { id: "compact", name: "Compact", px: 400, use: "ログイン、認証" },
] as const

function WidthBars() {
  // 1920px の画面に対する割合で示す
  return (
    <div role="img" aria-label="5 種類の最大幅を、1920px の画面に対する割合で示した図" className="flex flex-col gap-3">
      {widthTable.map((w) => (
        <div key={w.id} className="grid grid-cols-[7rem_1fr] items-center gap-4 text-ui">
          <span className="font-medium">{w.name}</span>
          <div className="h-6 rounded-xs bg-sidebar">
            <div className="h-6 rounded-xs bg-muted-foreground/40" style={{ width: w.px ? `${(w.px / 1920) * 100}%` : "100%" }} />
          </div>
        </div>
      ))}
    </div>
  )
}

const sizes = [
  { value: "100%", label: "幅いっぱい" },
  { value: "720px", label: "720px" },
  { value: "420px", label: "420px" },
]

function ColumnsDemo() {
  const [size, setSize] = useState("100%")
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-x-4 text-ui">
        <legend className="mb-2 font-medium">内容の領域の幅（Sidebar の開閉で変わる幅を想定）</legend>
        {sizes.map((s) => (
          <label key={s.value} className="flex min-h-10 cursor-pointer items-center gap-2">
            <input type="radio" name="columns-width" checked={size === s.value} onChange={() => setSize(s.value)} className="size-4 accent-[var(--primary)]" />
            {s.label}
          </label>
        ))}
      </fieldset>
      {/* 枠の内側に余白を取らず、資料の内容の幅（912px）をそのまま列の領域にする */}
      <div data-testid="columns-demo" className="max-w-full border-y border-border py-6" style={{ width: size }}>
        <PageColumns layout="main-aside">
          <div data-testid="columns-main" className="min-w-0">
            <p className="text-heading">メイン</p>
            <p className="mt-2 text-ui text-muted-foreground">顧客の契約、連絡先、補足。最も重要な情報なので DOM の先頭に置く。</p>
          </div>
          <div data-testid="columns-aside" className="min-w-0">
            <p className="text-heading">補足</p>
            <p className="mt-2 text-ui text-muted-foreground">次にすること、最近の活動。56rem 未満では、メインの下に並ぶ。</p>
          </div>
        </PageColumns>
      </div>
    </div>
  )
}

export function PageLayoutPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / App Structure"
        name="Page Layout"
        lead="ページの内容の最大幅、配置、余白、列の構成、スクロールを決める。最大幅は、画面の目的と、読む・入力する・比べるの違いから選ぶ。"
      />

      <Section title="最大幅" lead="5 種類を標準とする。製品は CSS 変数（--page-width-wide など）で上書きでき、ページごとには maxWidth で変えられる。">
        <WidthBars />
        <table className="mt-8 w-full text-left text-ui">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="h-table-row pr-4 font-medium">種類</th>
              <th scope="col" className="h-table-row pr-4 text-right font-medium">最大幅</th>
              <th scope="col" className="h-table-row font-medium">主な用途</th>
            </tr>
          </thead>
          <tbody>
            {widthTable.map((w) => (
              <tr key={w.id} className="border-b border-border">
                <td className="h-table-row pr-4">
                  {w.name}
                  <code className="ml-2 text-caption text-muted-foreground">width="{w.id}"</code>
                </td>
                <td className="pr-4 text-right tabular-nums">{w.px ? `${w.px.toLocaleString("ja-JP")}px` : "上限なし"}</td>
                <td>{w.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="最大幅と余白の適用範囲">
        <Row label="ページの余白">PageLayout の要素（data-slot=&quot;page-layout&quot;）が持つ。デスクトップ（768px 以上）は 24px、モバイルは 16px。上の余白も同じ値にする。</Row>
        <Row label="最大幅">内側の要素（data-slot=&quot;page-layout-content&quot;）が持つ。ページの余白を除いた内容の幅である。</Row>
        <Row label="配置">Sidebar のある業務画面は左寄せ（align=&quot;start&quot;）。ページの間で内容の開始位置がそろう。独立した画面（ログインなど）は中央寄せ（align=&quot;center&quot;）。</Row>
        <ShellFrame src="#/shell-examples?type=layout&width=standard" title="ページ幅の切り替え" testId="layout-frame" height={560} />
      </Section>

      <Section title="列の構成" lead="内容の関係で 1 列と複数列を使い分ける。列の数は、画面の幅ではなく内容の領域の幅（Container Query）で切り替える。Sidebar を開閉すると、同じ画面の幅でも内容の幅が変わるため。">
        <ColumnsDemo />
        <Row label="DOM の順序">狭い領域では DOM の順序のとおり 1 列に並べる。視覚の順序だけを入れ替えない（order、grid の配置）。重要な情報を DOM の先頭に置く。</Row>
      </Section>

      <Section title="スクロール">
        <Row label="縦のスクロール">原則として 1 つ（メインの領域）。Sidebar、Sheet、Table など必要な場合だけ独立したスクロールを許容する。</Row>
        <Row label="横のスクロール">ページ全体の横スクロールは禁止。列の多い Table などは、その領域の中で横にスクロールする。</Row>
        <Row label="固定の要素">固定したヘッダーとフッターを安易に重ねない。Sticky の領域を使う場合は、フォーカスした要素が隠れないようにする（Page Header を参照）。</Row>
        <Compare
          bad={
            <Schematic label="ページの中に縦のスクロールの領域が 3 つある" className="w-full gap-2 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="relative flex-1 overflow-hidden rounded-xs border border-border">
                  <SchematicLines count={6} />
                  <div className="absolute top-2 right-1 h-8 w-1 rounded-full bg-muted-foreground/40" />
                </div>
              ))}
            </Schematic>
          }
          badNote="スクロールの領域が入れ子や並列になると、ホイールやスワイプの操作がどこに効くかわからなくなる。"
          good={
            <Schematic label="ページの縦のスクロールは 1 つで、表だけが横にスクロールする" className="w-full">
              <div className={S.sidebar} />
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className={cn(S.strong, "w-1/3")} />
                <div className="overflow-hidden rounded-xs border border-border p-2">
                  <div className="h-10 w-[140%] rounded-xs bg-sidebar" />
                </div>
                <div className={S.line} />
              </div>
            </Schematic>
          }
          goodNote="縦はメインの領域だけ。表は領域の中で横にスクロールする。"
        />
      </Section>

      <Section title="実装例">
        <Code>{`<PageLayout width="standard">
  <PageHeader>…</PageHeader>
  <PageColumns layout="main-aside">
    <div>メイン</div>
    <aside aria-label="補足の情報">補足</aside>
  </PageColumns>
</PageLayout>

/* 製品全体で最大幅を変える */
:root { --page-width-standard: 64rem; }`}</Code>
      </Section>

      <Section title="製品の責務">
        <Bullets items={["画面の目的に合う最大幅の選択", "製品全体で最大幅を変える場合の CSS 変数の上書き", "列の順序（DOM の順序）を、情報の重要度の順にすること"]} />
      </Section>
    </article>
  )
}
