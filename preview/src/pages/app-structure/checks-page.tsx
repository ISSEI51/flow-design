import { useEffect, useState, type MouseEvent, type ReactNode } from "react"
import { BarChart3, Building2, CalendarDays, Compass, FileText, Heart, House, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger, ComboboxValue } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Textarea } from "@/components/ui/textarea"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain, useAppShell } from "@/patterns/app-shell"
import { BottomNav, BottomNavItem } from "@/patterns/bottom-nav"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { Section, SectionActions, SectionHeader, SectionHeading, SectionStack, SectionTitle } from "@/patterns/section-layout"
import { SidebarNav, type NavGroup, type RenderLink } from "@/patterns/sidebar-nav"

// App Structure の境界の条件を確かめるための検品用の画面（#/structure-checks?case=...）。
// プレビューの上部の一覧には表示しない。資料の例ではなく、preview/tests/app-structure-checks.spec.ts が操作する。
//   focus     ページの移動の後のフォーカスとスクロール（h1 なし、遅れて表示する見出し、続けての移動、無効化、スクロールの復元）
//   nav       複数の SidebarNav、通常のリンク、製品のルーター（renderLink）
//   sections  Section の見出しの階層、level、landmark、titleId、見出しのない Section、長い見出し、操作の折り返し
//   bottom    Bottom Navigation と入力欄の種類、5 項目、長いラベル、hideWhileTyping
//   sticky    Sticky の Page Header の高さの変化と、Sticky をやめた後の scroll-padding-top

function readParams() {
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "")
}

function useParams() {
  const [p, setP] = useState(readParams)
  useEffect(() => {
    const on = () => setP(readParams())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return p
}

const base = "#/structure-checks"

export function StructureChecks() {
  const params = useParams()
  const c = params.get("case") ?? "focus"
  if (c === "nav") return <NavCheck params={params} />
  if (c === "sections") return <SectionsCheck />
  if (c === "bottom") return <BottomCheck params={params} />
  if (c === "sticky") return <StickyCheck />
  return <FocusCheck params={params} />
}

// ---------------------------------------------------------------- focus
const focusPages = [
  { id: "heading", label: "見出しあり" },
  { id: "no-heading", label: "見出しなし" },
  { id: "delayed", label: "遅れて表示" },
  { id: "long", label: "長いページ" },
]

function FocusCheck({ params }: { params: URLSearchParams }) {
  const page = params.get("p") ?? "heading"
  const focusOff = params.get("focus") === "off"
  const restore = params.get("restore") === "on"
  const extra = `${focusOff ? "&focus=off" : ""}${restore ? "&restore=on" : ""}`
  const href = (id: string) => `${base}?case=focus&p=${id}${extra}`
  const groups: NavGroup[] = [{ items: focusPages.map((p) => ({ id: p.id, label: p.label, icon: FileText, href: href(p.id) })) }]
  return (
    <AppShell>
      <Sidebar>
        <SidebarContent>
          <SidebarNav
            groups={groups}
            currentId={page}
            onNavigate={(id, e) => {
              e.preventDefault()
              window.location.hash = href(id)
            }}
          />
        </SidebarContent>
      </Sidebar>
      <AppShellBody>
        <AppShellHeader className="md:hidden">
          <SidebarTrigger />
          フォーカスの検品
        </AppShellHeader>
        <AppShellMain pageKey={page} focusOnNavigate={focusOff ? false : "heading"} scrollOnNavigate={restore ? false : "top"} data-testid="focus-main">
          {restore && <ScrollRestore page={page} />}
          {/* ページごとに作り直し、前のページの状態（読み込み済み）を引き継がない */}
          <FocusPage key={page} page={page} href={href} />
        </AppShellMain>
      </AppShellBody>
    </AppShell>
  )
}

// 製品によるスクロールの復元の例：移動の直前（hashchange の時点。まだ前のページの DOM）に main の scrollTop を覚え、
// 戻ったときに設定する。ルーターでは、移動を始める処理で保存する。
const savedScroll = new Map<string, number>()
function ScrollRestore({ page }: { page: string }) {
  const { mainRef } = useAppShell()
  // main の ref は親（AppShellMain）が持つため、子の layout effect の時点では未設定の場合がある。effect で行う
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    main.scrollTop = savedScroll.get(page) ?? 0
    const save = () => savedScroll.set(page, main.scrollTop)
    window.addEventListener("hashchange", save)
    return () => window.removeEventListener("hashchange", save)
  }, [page, mainRef])
  return null
}

function FocusPage({ page, href }: { page: string; href: (id: string) => string }) {
  const { focusHeading } = useAppShell()
  const [loaded, setLoaded] = useState(page !== "delayed")
  // 遅れて表示する見出し：読み込みの後に h1 を表示し、製品が focusHeading を呼ぶ。
  // 読み込みの完了は、検品が window.__finishLoading() で起こす（時間に依存しない）。
  useEffect(() => {
    if (page !== "delayed") return
    const w = window as unknown as { __finishLoading?: () => void }
    w.__finishLoading = () => setLoaded(true)
    return () => {
      delete w.__finishLoading
    }
  }, [page])
  const [focusedLater, setFocusedLater] = useState<boolean | null>(null)
  useEffect(() => {
    if (page === "delayed" && loaded) setFocusedLater(focusHeading())
  }, [page, loaded, focusHeading])
  const links = (
    <ul className="flex flex-wrap gap-2">
      {focusPages.map((p) => (
        <li key={p.id}>
          <a href={href(p.id)} className="text-ui underline" data-testid={`inline-${p.id}`}>
            {p.label}へ
          </a>
        </li>
      ))}
    </ul>
  )
  if (page === "no-heading")
    return (
      <PageLayout>
        <p className="text-ui" data-testid="no-heading">
          この画面には h1 がない（移動の後は main にフォーカスが移る）
        </p>
        {links}
      </PageLayout>
    )
  if (page === "delayed" && !loaded)
    return (
      <PageLayout>
        <p className="text-ui" aria-busy="true" data-testid="loading">
          読み込み中
        </p>
      </PageLayout>
    )
  return (
    <PageLayout>
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{focusPages.find((p) => p.id === page)?.label ?? "見出しあり"}</PageHeaderTitle>
          {page === "delayed" && <PageHeaderDescription data-testid="focused-later">focusHeading の結果：{String(focusedLater)}</PageHeaderDescription>}
        </PageHeaderContent>
      </PageHeader>
      {links}
      {page === "long" && (
        <ul>
          {Array.from({ length: 60 }, (_, i) => (
            <li key={i} className="border-b border-border py-3 text-ui">
              行 {i + 1}
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  )
}

// ---------------------------------------------------------------- nav
function navGroups(prefix: string, href: (id: string) => string): NavGroup[] {
  return [
    {
      items: [
        { id: "home", label: "ホーム", icon: House, href: href("home") },
        { id: "customers", label: "顧客", icon: Building2, href: href("customers"), badge: "3", badgeLabel: "未対応 3 件" },
        {
          id: "contracts",
          label: "契約",
          icon: FileText,
          href: href("contracts"),
          pageLabel: "契約の一覧",
          children: [
            { id: "renewals", label: "更新が近い契約", href: href("renewals") },
            { id: "cancellations", label: "解約の申し込み", href: href("cancellations") },
          ],
        },
        {
          id: "reports",
          label: "レポート",
          icon: BarChart3,
          children: [{ id: "sales", label: `${prefix}売上`, href: href("sales") }],
        },
      ],
    },
  ]
}

function NavFrame({ testId, title, children }: { testId: string; title: ReactNode; children: ReactNode }) {
  return (
    <div data-testid={testId} className="overflow-hidden rounded-xl border border-border">
      <SidebarProvider className="h-[520px] min-h-0" keyboardShortcut={false}>
        {children}
        <SidebarInset render={<div />} className="min-h-0 p-6">
          <SidebarTrigger className="-ml-2" />
          <p className="mt-4 text-heading" data-testid={`${testId}-title`}>
            {title}
          </p>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}

// 製品のルーターの代わり。<a> の既定の移動を止め、製品の状態を変える。
function RouterLink({ to, onGo, ...props }: { to: string; onGo: (to: string) => void } & React.ComponentProps<"a">) {
  return (
    <a
      {...props}
      href={to}
      data-router-link=""
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        props.onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        onGo(to)
      }}
    />
  )
}

function NavCheck({ params }: { params: URLSearchParams }) {
  // A：通常のリンク。URL（ハッシュ）が現在地を決める。onNavigate を渡さない
  const a = params.get("a") ?? "home"
  const hrefA = (id: string) => `${base}?case=nav&a=${id}`
  // B：製品のルーター。renderLink でリンクの要素を差し替える
  const [b, setB] = useState("home")
  const [log, setLog] = useState<string[]>([])
  const routes = new Map<string, string>()
  const hrefB = (id: string) => {
    const to = `/app/${id}`
    routes.set(to, id)
    return to
  }
  const groupsB = navGroups("B：", hrefB)
  const renderLinkB: RenderLink = ({ href }) => (
    <RouterLink
      to={href}
      onGo={(to) => {
        const id = routes.get(to) ?? "home"
        setB(id)
        setLog((l) => [...l, id])
      }}
    />
  )
  return (
    <main className="grid gap-6 p-6 lg:grid-cols-2">
      <NavFrame testId="nav-a" title={a}>
        <Sidebar className="h-full">
          <SidebarContent>
            <SidebarNav aria-label="メインメニュー A" groups={navGroups("A：", hrefA)} currentId={a} />
          </SidebarContent>
        </Sidebar>
      </NavFrame>
      <NavFrame testId="nav-b" title={b}>
        <Sidebar className="h-full">
          <SidebarContent>
            <SidebarNav aria-label="メインメニュー B" groups={groupsB} currentId={b} renderLink={renderLinkB} />
          </SidebarContent>
        </Sidebar>
      </NavFrame>
      <p className="text-ui" data-testid="router-log">
        ルーターの移動：{log.join(",")}
      </p>
    </main>
  )
}

// ---------------------------------------------------------------- sections
function SectionsCheck() {
  return (
    <main className="mx-auto max-w-[960px] px-4 py-6 md:px-6">
      <h1 className="text-page-title">Section の検品</h1>
      <SectionStack className="mt-8" data-testid="sections">
        <Section data-testid="nest">
          <SectionHeader>
            <SectionTitle>階層 2</SectionTitle>
          </SectionHeader>
          <Section>
            <SectionHeader>
              <SectionTitle>階層 3</SectionTitle>
            </SectionHeader>
            <Section>
              <SectionHeader>
                <SectionTitle>階層 4</SectionTitle>
              </SectionHeader>
              <Section>
                <SectionHeader>
                  <SectionTitle>階層 5</SectionTitle>
                </SectionHeader>
                <Section>
                  <SectionHeader>
                    <SectionTitle>階層 6</SectionTitle>
                  </SectionHeader>
                  <Section>
                    <SectionHeader>
                      <SectionTitle>階層 7（h6 のまま）</SectionTitle>
                    </SectionHeader>
                  </Section>
                </Section>
              </Section>
            </Section>
          </Section>
        </Section>
        <Section level={4} data-testid="explicit">
          <SectionHeader>
            <SectionTitle>明示した階層 4</SectionTitle>
          </SectionHeader>
        </Section>
        <Section landmark data-testid="landmark">
          <SectionHeader>
            <SectionTitle>請求の設定</SectionTitle>
          </SectionHeader>
        </Section>
        <Section landmark titleId="billing-history" data-testid="custom-id">
          <SectionHeader>
            <SectionTitle>請求の履歴</SectionTitle>
          </SectionHeader>
        </Section>
        <Section landmark data-testid="no-title">
          <p className="text-ui">見出しのない Section（landmark を指定したが SectionTitle がない）</p>
        </Section>
        <DynamicTitleSection />
        <Section landmark aria-label="お知らせ" data-testid="aria-label">
          <p className="text-ui">aria-label で名前を付けた Section</p>
        </Section>
        <Section data-testid="plain">
          <SectionHeader>
            <SectionTitle>ランドマークにしない Section</SectionTitle>
          </SectionHeader>
        </Section>
        <Section data-testid="long">
          <SectionHeader>
            <SectionHeading>
              <SectionTitle>
                北日本精密機械工業株式会社 札幌第二工場 生産管理部との契約の更新に関する確認事項と、担当者の引き継ぎの記録
              </SectionTitle>
            </SectionHeading>
            <SectionActions>
              <Button variant="secondary" size="sm">
                既定に戻す
              </Button>
              <Button variant="ghost" size="sm">
                履歴を見る
              </Button>
            </SectionActions>
          </SectionHeader>
        </Section>
      </SectionStack>
    </main>
  )
}

// 見出しを後から表示・削除する landmark（Section は再描画されず、SectionTitle の登録で追従する）
function DynamicTitleSection() {
  return (
    <Section landmark data-testid="dynamic">
      <DynamicTitle />
    </Section>
  )
}

function DynamicTitle() {
  const [show, setShow] = useState(false)
  return (
    <>
      {show && (
        <SectionHeader>
          <SectionTitle>後から表示した見出し</SectionTitle>
        </SectionHeader>
      )}
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setShow((v) => !v)} data-testid="toggle-title">
        見出しを{show ? "隠す" : "表示"}
      </Button>
    </>
  )
}

// ---------------------------------------------------------------- bottom
const consumer = [
  { id: "home", label: "ホーム", long: "ホームとお知らせ", icon: House },
  { id: "explore", label: "さがす", long: "宿と体験をさがす", icon: Compass },
  { id: "bookings", label: "予約", long: "予約の確認と変更", icon: CalendarDays },
  { id: "favorites", label: "お気に入り", long: "お気に入りの宿", icon: Heart },
  { id: "account", label: "マイページ", long: "マイページと設定", icon: UserRound },
]
const cities = ["札幌", "仙台", "東京", "名古屋", "大阪", "福岡"].map((c) => ({ value: c, label: c }))
const guests = ["1 人", "2 人", "3 人"].map((g) => ({ value: g, label: g }))

function BottomCheck({ params }: { params: URLSearchParams }) {
  const page = params.get("p") ?? "home"
  const long = params.get("long") === "1"
  const hideOff = params.get("hide") === "off"
  const href = (id: string) => `${base}?case=bottom&p=${id}${long ? "&long=1" : ""}${hideOff ? "&hide=off" : ""}`
  return (
    <AppShell keyboardShortcut={false}>
      <AppShellBody>
        <AppShellHeader>Bottom Navigation の検品</AppShellHeader>
        <AppShellMain pageKey={page}>
          <PageLayout>
            <PageHeader>
              <PageHeaderContent>
                <PageHeaderTitle>{consumer.find((c) => c.id === page)?.label}</PageHeaderTitle>
              </PageHeaderContent>
            </PageHeader>
            <div className="flex flex-col gap-4">
              <Input aria-label="文字の入力" data-testid="in-text" />
              <Input aria-label="予約番号（読み取り専用）" readOnly defaultValue="R-2026-1123" data-testid="in-readonly" />
              <Input aria-label="日付" type="date" data-testid="in-date" />
              <Textarea aria-label="要望" data-testid="in-textarea" />
              <div contentEditable suppressContentEditableWarning role="textbox" aria-label="メモ" data-testid="in-editable" className="min-h-12 rounded-md border border-input p-3 text-ui">
                編集できる領域
              </div>
              <Select items={guests} defaultValue="2 人">
                <SelectTrigger aria-label="人数" data-testid="in-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {guests.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Combobox items={cities}>
                <ComboboxTrigger aria-label="都市" data-testid="in-combobox">
                  <ComboboxValue placeholder="都市を選ぶ" />
                </ComboboxTrigger>
                <ComboboxContent>
                  <ComboboxInput placeholder="都市名で検索" aria-label="都市を検索" data-testid="in-combobox-input" />
                  <ComboboxEmpty>一致する都市がない</ComboboxEmpty>
                  <ComboboxList>
                    {(item: { value: string; label: string }) => (
                      <ComboboxItem key={item.value} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <div className="flex items-center gap-2">
                <Checkbox id="in-check" data-testid="in-checkbox" />
                <Label htmlFor="in-check">朝食付き</Label>
              </div>
            </div>
          </PageLayout>
        </AppShellMain>
        <BottomNav hideWhileTyping={!hideOff} data-testid="bottom-nav">
          {consumer.map((c) => (
            <BottomNavItem
              key={c.id}
              icon={c.icon}
              label={long ? c.long : c.label}
              href={href(c.id)}
              isActive={c.id === page}
            />
          ))}
        </BottomNav>
      </AppShellBody>
    </AppShell>
  )
}

// ---------------------------------------------------------------- sticky
function StickyCheck() {
  const [sticky, setSticky] = useState(true)
  const [more, setMore] = useState(false)
  return (
    <AppShell keyboardShortcut={false}>
      <AppShellBody>
        <AppShellMain data-testid="sticky-main">
          <PageLayout width="standard">
            <PageHeader sticky={sticky}>
              <PageHeaderContent>
                <PageHeaderTitle>11 月の請求の確認</PageHeaderTitle>
                {more && <PageHeaderDescription>未確認 12 件・確認済み 36 件。確認済みにした請求書は、翌日に送付する。</PageHeaderDescription>}
              </PageHeaderContent>
              <PageHeaderActions>
                <Button variant="secondary" onClick={() => setMore((v) => !v)} data-testid="toggle-more">
                  補足を{more ? "隠す" : "表示"}
                </Button>
                <Button variant="secondary" onClick={() => setSticky((v) => !v)} data-testid="toggle-sticky">
                  {sticky ? "固定をやめる" : "固定する"}
                </Button>
              </PageHeaderActions>
            </PageHeader>
            <ul>
              {Array.from({ length: 40 }, (_, i) => (
                <li key={i} className="flex items-center justify-between border-b border-border py-3">
                  <span className="text-ui">請求書 INV-{String(i + 1).padStart(3, "0")}</span>
                  <Button variant="ghost" size="sm">
                    開く {i + 1}
                  </Button>
                </li>
              ))}
            </ul>
          </PageLayout>
        </AppShellMain>
      </AppShellBody>
    </AppShell>
  )
}
