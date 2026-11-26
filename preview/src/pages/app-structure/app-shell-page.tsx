import { useState } from "react"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets, Code, S, Schematic, SchematicLines, ShellFrame } from "./parts"
import { cn } from "@/lib/utils"

const shells = [
  { id: "sidebar", name: "Sidebar Shell", use: "業務 SaaS、管理画面の標準", src: "#/structure-app?page=customers" },
  { id: "header", name: "Header Shell", use: "主要な機能が少ないサービス", src: "#/shell-examples?type=header" },
  { id: "hybrid", name: "Hybrid Shell", use: "大規模な製品で機能群を切り替える", src: "#/shell-examples?type=hybrid&page=customers" },
  { id: "minimal", name: "Minimal Shell", use: "ログイン、集中して行う操作", src: "#/structure-app?page=login" },
  { id: "bottom", name: "Bottom Navigation", use: "一般消費者向け、主要な機能が 3〜5 個（モバイル）", src: "#/shell-examples?type=bottom" },
] as const

function ShellSchematic({ id }: { id: (typeof shells)[number]["id"] }) {
  if (id === "sidebar")
    return (
      <Schematic label="左に Sidebar、右にメインの内容">
        <div className={S.sidebar} />
        <SchematicLines />
      </Schematic>
    )
  if (id === "header")
    return (
      <Schematic label="上にヘッダーとナビゲーション、その下にメインの内容" className="flex-col">
        <div className={S.header} />
        <SchematicLines />
      </Schematic>
    )
  if (id === "hybrid")
    return (
      <Schematic label="上に機能群を切り替えるヘッダー、その下の左に Sidebar、右にメインの内容" className="flex-col">
        <div className={S.header} />
        <div className="flex flex-1">
          <div className={S.sidebar} />
          <SchematicLines count={3} />
        </div>
      </Schematic>
    )
  if (id === "minimal")
    return (
      <Schematic label="ナビゲーションがなく、中央に狭い内容" className="flex-col items-center justify-center">
        <div className="flex w-2/5 flex-col gap-2">
          <div className={cn(S.strong, "w-1/2")} />
          <div className={S.line} />
          <div className={S.line} />
          <div className="h-3 rounded-full bg-muted-foreground/40" />
        </div>
      </Schematic>
    )
  return (
    <Schematic label="モバイルの画面の下に、4 つの機能のナビゲーション" className="mx-auto w-24 flex-col">
      <SchematicLines count={5} />
      <div className="flex h-6 shrink-0 items-center justify-around bg-sidebar">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("size-2 rounded-full", i === 0 ? "bg-muted-foreground" : "bg-border")} />
        ))}
      </div>
    </Schematic>
  )
}

export function AppShellPage() {
  const [shell, setShell] = useState<(typeof shells)[number]["id"]>("sidebar")
  const current = shells.find((s) => s.id === shell)!
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / App Structure"
        name="App Shell"
        lead="製品の画面全体の骨組み。ナビゲーション、メインの内容、スクロールの領域の関係を決める。業務アプリケーションは Sidebar Shell を標準にする。"
      />

      <Section title="構造の使い分け" lead="機能の数と、機能の間を移動する頻度で選ぶ。4 種類は 1 つの部品の Variant ではなく、同じ部品（AppShell、Sidebar、AppShellHeader）の組み合わせで作る。">
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
          {shells.map((s) => (
            <div key={s.id} className="min-w-0">
              <ShellSchematic id={s.id} />
              <h3 className="mt-4 text-ui font-semibold">
                {s.name}
                {s.id === "sidebar" && <span className="ml-2 font-normal text-muted-foreground">標準</span>}
              </h3>
              <p className="mt-1 text-ui text-muted-foreground">{s.use}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="実際に操作する" lead="Sidebar の開閉、ページの移動、モバイルのメニューを確かめる。iframe の中は、選んだ幅の画面として描画する。">
        <fieldset className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-ui">
          <legend className="mb-2 text-ui font-medium">構造</legend>
          {shells.map((s) => (
            <label key={s.id} className="flex min-h-10 cursor-pointer items-center gap-2">
              <input type="radio" name="shell" value={s.id} checked={shell === s.id} onChange={() => setShell(s.id)} className="size-4 accent-[var(--primary)]" />
              {s.name}
            </label>
          ))}
        </fieldset>
        <ShellFrame key={current.id} src={current.src} title={current.name} testId="shell-frame" defaultDevice={current.id === "bottom" ? "mobile" : "desktop"} />
      </Section>

      <Section title="Sidebar Shell の標準" lead="寸法と面は Sidebar（Components）の仕様をそのまま使う。">
        <Row label="Sidebar">展開時 240px、折りたたみ時 64px。背景は sidebar（薄いニュートラル）で、メインとの境界線は引かない。</Row>
        <Row label="グローバルヘッダー">全画面に共通の操作（検索、お知らせ、機能群の切り替え）がある場合だけ置く。デスクトップで不要な場合も、モバイルではメニューを開くボタンのために置く（md:hidden）。</Row>
        <Row label="下部">製品の設定とアカウントを Sidebar の下部に置く。</Row>
        <Row label="スクロール">ページ全体（document）はスクロールさせない。メインの領域（main）と、Sidebar のメニュー（SidebarContent）が、それぞれ独立して縦にスクロールする。</Row>
      </Section>

      <Section title="スクロールの領域">
        <Compare
          bad={
            <Schematic label="ページ全体がスクロールし、固定したヘッダーとフッターが内容に重なる" className="w-full flex-col">
              <div className="h-5 shrink-0 bg-sidebar shadow-menu" />
              <SchematicLines count={4} />
              <div className="h-5 shrink-0 bg-sidebar" />
            </Schematic>
          }
          badNote="position: fixed のヘッダーとフッターを重ねると、内容とフォーカスした要素が隠れる。スクロールの領域が増えると、どこをスクロールしているかわからなくなる。"
          good={
            <Schematic label="ヘッダーとナビゲーションは固定の領域、メインの領域だけがスクロールする" className="w-full">
              <div className={S.sidebar} />
              <div className="flex flex-1 flex-col">
                <SchematicLines count={3} className="overflow-hidden" />
                <div className="mx-3 mb-2 h-1 rounded-full bg-muted-foreground/30" />
              </div>
            </Schematic>
          }
          goodNote="ナビゲーションはレイアウトの中に置き、内容に重ねない。縦にスクロールするのはメインの領域だけ。"
        />
      </Section>

      <Section title="モバイル">
        <Row label="業務アプリケーション">左から開く Sheet でナビゲーションを表示する（Sidebar のモバイルの表示）。項目を選んで移動したら閉じる。</Row>
        <Row label="一般消費者向け">主要な機能が 3〜5 個で、機能の間を頻繁に移動する場合は、Bottom Navigation を使ってよい（Navigation を参照）。</Row>
        <Row label="Safe Area">ヘッダーの上、Bottom Navigation の下、左右に env(safe-area-inset-*) の余白を取る。値は CSS 変数 --app-safe-top などで上書きできる。製品の HTML の viewport に viewport-fit=cover が必要。</Row>
        <Row label="高さ">画面の高さは 100dvh。モバイルのブラウザのアドレスバーの表示と非表示に追従する。</Row>
        <Row label="ソフトウェアキーボード">Bottom Navigation は、タッチ操作の端末で文字の入力欄にフォーカスがある間は隠す。固定の要素が入力欄とキーボードの間に残らない。</Row>
      </Section>

      <Section title="操作とアクセシビリティ">
        <Row label="ランドマーク">header（グローバルヘッダー）、nav（メインメニュー）、main を 1 つずつ置く。Sidebar の中のナビゲーションは nav の「メインメニュー」。</Row>
        <Row label="スキップリンク">最初の Tab で「メインコンテンツへ移動」を表示する。押すと main にフォーカスが移り、次の Tab で内容の最初の操作に移る。URL のハッシュは変えない（ハッシュでルーティングする製品でも使える）。</Row>
        <Row label="移動の後のフォーカス">AppShellMain の pageKey が変わったら、メインの領域を先頭までスクロールし、ページの見出し（h1）にフォーカスを移す。モバイルのメニューから移動した場合は、メニューが閉じてから移す。</Row>
        <Row label="Sidebar の開閉">展開と折りたたみは SidebarTrigger、SidebarRail（ポインターだけ）、Ctrl / ⌘ + B。開閉の状態の保存は製品が行う。</Row>
        <Row label="SSR と Hydration">サーバーでは window と document を参照しない。サーバーの HTML はデスクトップの表示で、Hydration の後にモバイルの表示へ切り替わる。モバイルの幅では、Hydration の前も CSS で Sidebar を隠す。</Row>
      </Section>

      <Section title="実装例">
        <Code>{`<AppShell sidebarOpen={open} onSidebarOpenChange={save}>
  <Sidebar>…<SidebarNav groups={groups} currentId={currentId} onNavigate={go} />…</Sidebar>
  <AppShellBody>
    <AppShellHeader className="md:hidden">
      <SidebarTrigger />
      製品名
    </AppShellHeader>
    <AppShellMain pageKey={location.pathname}>
      <PageLayout width="full">…</PageLayout>
    </AppShellMain>
  </AppShellBody>
</AppShell>`}</Code>
      </Section>

      <Section title="製品の責務">
        <Bullets
          items={[
            "ルーティング、現在地の判定（currentId）、認証、権限、データの取得",
            "Sidebar の開閉の状態の保存（cookie、localStorage、サーバー）",
            "戻る・進むでのスクロールの復元。document ではなく main がスクロールするため、ルーターの既定の復元は効かない。useAppShell().mainRef の scrollTop を保存し、戻ったときに設定する",
            "viewport の meta の viewport-fit=cover と、必要に応じて interactive-widget",
            "ページの移動の前の未保存の変更の確認（Forms & Workflows で扱う）",
          ]}
        />
      </Section>
    </article>
  )
}
