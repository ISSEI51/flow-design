import { useState } from "react"
import { Building2, CalendarDays, Compass, FileText, House } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarMenu,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { findNavTrail, SidebarNav, SidebarNavItem } from "@/patterns/sidebar-nav"
import { cn } from "@/lib/utils"

import { structureLabels, structureNav, structureSettingsItem } from "../../data/app-structure"
import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets, Code, ShellFrame } from "./parts"

function FrameState({ currentId, long }: { currentId: string; long: boolean }) {
  const { state } = useSidebar()
  const trail = findNavTrail(structureNav(long), currentId)
  const name = trail?.child?.label ?? trail?.item.label ?? structureLabels(long)[currentId]
  return (
    <SidebarInset render={<div />} className="min-h-0 overflow-auto">
      <div className="flex min-h-14 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-2" />
      </div>
      <div className="px-6 pb-6">
        <p className="text-heading" data-testid="nav-frame-title">
          {name}
        </p>
        <p className="mt-2 text-ui text-muted-foreground">
          {trail?.group.label ? `${trail.group.label} › ` : ""}
          {trail?.child ? `${trail.item.label} › ` : ""}
          {name}・{state === "expanded" ? "展開（240px）" : "折りたたみ（64px）"}
        </p>
      </div>
    </SidebarInset>
  )
}

// 資料のページの中に置く Sidebar。製品では AppShell が画面全体を使う。
function NavigationDemo() {
  const [currentId, setCurrentId] = useState("customers")
  const [long, setLong] = useState(false)
  const navigate = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    setCurrentId(id)
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Checkbox id="nav-long" checked={long} onCheckedChange={(v) => setLong(v === true)} />
        <Label htmlFor="nav-long">長いメニュー名にする</Label>
      </div>
      <div data-testid="nav-demo" className="overflow-hidden rounded-xl border border-border">
        <SidebarProvider className="h-[600px] min-h-0" keyboardShortcut={false}>
          <Sidebar className="h-full">
            <SidebarContent>
              <SidebarNav groups={structureNav(long)} currentId={currentId} onNavigate={navigate} />
              <SidebarMenu className="mt-auto px-3 pb-3">
                <SidebarNavItem item={structureSettingsItem(long)} currentId={currentId} onNavigate={navigate} />
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>
          <FrameState currentId={currentId} long={long} />
        </SidebarProvider>
      </div>
    </div>
  )
}

function MiniNav({ items, tone }: { items: { label: string; active?: boolean; depth?: number; heading?: boolean }[]; tone: "bad" | "good" }) {
  return (
    <ul className="w-full max-w-60 rounded-md bg-sidebar p-2 text-ui">
      {items.map((it, i) =>
        it.heading ? (
          <li key={i} className="px-3 pt-3 pb-1 text-caption text-muted-foreground">
            {it.label}
          </li>
        ) : (
          <li
            key={i}
            className={cn(
              "flex min-h-9 items-center rounded-sm px-3 text-muted-foreground",
              it.depth === 1 && "pl-8",
              it.depth === 2 && "pl-14",
              it.active && tone === "good" && "bg-sidebar-accent font-semibold text-foreground",
              it.active && tone === "bad" && "bg-primary font-semibold text-primary-foreground"
            )}
          >
            {it.label}
          </li>
        )
      )}
    </ul>
  )
}

export function NavigationPatternPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / App Structure"
        name="Navigation"
        lead="主要な機能への移動。項目は業務の流れの順に並べ、階層は 2 つまでにする。現在地はニュートラルの面と文字の太さで示す。"
      />

      <Section title="実際に操作する" lead="子の項目を持つ「契約」と「レポート」の開閉、親への移動、折りたたみ時の Dropdown Menu を確かめる。">
        <NavigationDemo />
      </Section>

      <Section title="階層" lead="フラット → グループ → 2 階層の順に検討する。">
        <Row label="フラット" note="原則">項目が少ない場合は、見出しを付けずに並べる。</Row>
        <Row label="グループ" note="意味のある分類がある場合">業務の段階（営業、請求、分析）などで分ける。グループの見出しは、分類に意味がある場合だけ置く。</Row>
        <Row label="2 階層" note="最大">子の項目は文字だけにし、親の文字の位置にそろえる。</Row>
        <Compare
          bad={
            <MiniNav
              tone="good"
              items={[
                { label: "マスタ" },
                { label: "顧客マスタ", depth: 1 },
                { label: "取引先", depth: 2 },
                { label: "担当者", depth: 2, active: true },
                { label: "商品マスタ", depth: 1 },
              ]}
            />
          }
          badNote="3 階層以上は、現在地と移動先を覚える負荷が増える。3 つ目の階層が必要な場合は、画面の中の Tabs や Hybrid Shell で情報の構造を見直す。"
          good={
            <MiniNav
              tone="good"
              items={[
                { label: "顧客", active: true },
                { label: "商談" },
                { label: "契約" },
                { label: "更新が近い契約", depth: 1 },
                { label: "解約の申し込み", depth: 1 },
              ]}
            />
          }
          goodNote="2 階層まで。取引先と担当者は、顧客の詳細の Tabs で切り替える。"
        />
      </Section>

      <Section title="並び順" lead="機能を分類するのではなく、業務の流れとユーザーが考える順に並べる。">
        <Compare
          bad={
            <MiniNav
              tone="good"
              items={[
                { label: "マスタ管理", heading: true },
                { label: "顧客" },
                { label: "商品" },
                { label: "伝票", heading: true },
                { label: "請求書" },
                { label: "見積もり" },
                { label: "契約" },
              ]}
            />
          }
          badNote="システムの内部の構造（マスタ、伝票）で分類すると、次の作業がどこにあるかを考えさせる。"
          good={
            <MiniNav
              tone="good"
              items={[
                { label: "ホーム" },
                { label: "営業", heading: true },
                { label: "見込み客" },
                { label: "顧客", active: true },
                { label: "商談" },
                { label: "見積もり" },
                { label: "契約" },
                { label: "請求", heading: true },
                { label: "請求書" },
                { label: "入金" },
              ]}
            />
          }
          goodNote="見込み客 → 顧客 → 商談 → 見積もり → 契約 → 請求 → 入金の流れに沿う。毎日最初に見るホームは、使用頻度が極端に高いため先頭に置く（合理的な例外）。"
        />
      </Section>

      <Section title="視覚表現">
        <Row label="主要な項目">アイコンと文字を併用する（アイコン 20px、文字 14px、高さ 44px、タッチ操作では 48px）。</Row>
        <Row label="子の項目">文字だけ。親の文字の位置にそろえる。</Row>
        <Row label="子が現在地の親" note="上の例の「契約」で確かめる">
          子を表示している間は、親は面なしで文字を太さ 500 にする。子を閉じると、親を太さ 600 で示し（面は付けない）、aria-current=&quot;true&quot; を付ける。親のページ自体が現在地の場合だけ、親を現在地の面（太さ 600、aria-current=&quot;page&quot;）にする。
        </Row>
        <Compare
          bad={<MiniNav tone="bad" items={[{ label: "顧客", active: true }, { label: "商談" }, { label: "契約" }]} />}
          badNote="ブランドカラーで全面を塗ると、画面の中で最も強い要素になり、主要な操作（Primary のボタン）と区別できない。"
          good={<MiniNav tone="good" items={[{ label: "顧客", active: true }, { label: "商談" }, { label: "契約" }]} />}
          goodNote="現在地は sidebar-accent の面と文字の太さ 600 で示し、aria-current=&quot;page&quot; を付ける。"
        />
      </Section>

      <Section title="開閉">
        <Row label="現在地を含むグループ">現在地がグループに入ったときに開く。グループの中で移動しても、利用者が閉じた状態は変えない。</Row>
        <Row label="ほかのグループ">利用者が任意に開閉できる。</Row>
        <Row label="親への移動と子の開閉">親が自身のページを持つ場合、親はリンク、右のボタン（aria-expanded）は子の開閉。持たない場合、親は開閉のボタン。</Row>
        <Row label="折りたたみ時">親を Dropdown Menu のボタンにし、右側に子の項目を表示する（既存の Dropdown Menu の操作）。</Row>
      </Section>

      <Section title="Bottom Navigation" lead="一般消費者向けのサービスで、主要な機能が 3〜5 個あり、機能の間を頻繁に移動する場合だけ使う。業務アプリケーションのモバイルは、左から開く Sheet を標準とする。">
        <ShellFrame src="#/shell-examples?type=bottom" title="Bottom Navigation の例" testId="bottom-frame" defaultDevice="mobile" />
        <div className="mt-8">
          <Compare
            bad={
              <div className="flex w-full max-w-80 justify-around rounded-md bg-sidebar py-3">
                {[House, Building2, FileText, House, Building2, FileText].map((Icon, i) => (
                  <Icon key={i} aria-hidden="true" className={cn("size-5", i === 0 ? "text-foreground" : "text-muted-foreground")} />
                ))}
              </div>
            }
            badNote="6 個以上の項目や、アイコンだけの項目は、意味を覚える負荷が増える。現在地が色の違いだけでは伝わらない。"
            good={
              <div className="flex w-full max-w-80 justify-around rounded-md bg-sidebar py-2 text-caption text-muted-foreground">
                {[
                  [House, "ホーム", true],
                  [Compass, "さがす", false],
                  [CalendarDays, "予約", false],
                ].map(([Icon, label, active]) => {
                  const I = Icon as typeof House
                  return (
                    <span key={label as string} className={cn("flex flex-col items-center gap-1", active && "font-semibold text-foreground")}>
                      <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-sidebar-accent")}>
                        <I aria-hidden="true" className="size-5" />
                      </span>
                      {label as string}
                    </span>
                  )
                })}
              </div>
            }
            goodNote="3〜5 個。アイコンと短いラベルを併用し、現在地は面と太さで示す。下端に Safe Area の余白を取る。"
          />
        </div>
      </Section>

      <Section title="現在地の判定" lead="特定のルーティングのライブラリに依存させない。製品が自分のルーターから項目の id を求め、currentId に渡す。">
        <Code>{`// React Router の例。リンクの要素は renderLink で差し替える
const { pathname } = useLocation()
const currentId = pathname.startsWith("/customers") ? "customers" : pathname.slice(1)

<SidebarNav
  groups={groups}
  currentId={currentId}
  renderLink={({ href }) => <Link to={href} />}
/>`}</Code>
      </Section>

      <Section title="製品の責務">
        <Bullets
          items={[
            "項目の一覧（groups）と並び順。業務の流れに沿って決める",
            "現在地の判定（currentId）。詳細や登録の画面は、親の一覧の項目を現在地にする",
            "権限による項目の表示と非表示。押せない項目を並べるより、使えない項目は表示しない",
            "件数などの badge の値の取得",
          ]}
        />
      </Section>
    </article>
  )
}
