import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { CalendarDays, Compass, House, PanelLeft, Search, UserRound, X } from "lucide-react"

import { Avatar, AvatarFallback, getInitials } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain, MinimalShell } from "@/patterns/app-shell"
import { BottomNav, BottomNavItem } from "@/patterns/bottom-nav"
import { PageLayout, type PageWidth } from "@/patterns/page-layout"
import { isNavParent, type NavChildItem, type NavGroup, type NavItem } from "@/patterns/sidebar-nav"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { Section, SectionHeader, SectionStack, SectionTitle } from "@/patterns/section-layout"
import { cn } from "@/lib/utils"

import { structureNav, structureSettingsItem, structureUser } from "../../data/app-structure"
import { ProductMark, StructureSidebar } from "./structure-sidebar"

// App Shell の 4 種類（Sidebar Shell 以外の 3 種類）と Bottom Navigation の検証用の画面。
// #/shell-examples?type=header | hybrid | minimal | bottom
// Sidebar Shell は業務アプリの例（#/structure-app）で確かめる。

function readParams() {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
  return { type: params.get("type") ?? "header", page: params.get("page"), width: params.get("width"), align: params.get("align") }
}

const hrefFor = (type: string, page: string) => `#/shell-examples?type=${type}&page=${page}`

function useParams() {
  const [p, setP] = useState(readParams)
  useEffect(() => {
    const on = () => setP(readParams())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return p
}

const go = (href: string) => (e: MouseEvent) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  window.location.hash = href
}

export function ShellExamples() {
  const { type, page, width, align } = useParams()
  if (type === "layout") return <LayoutExample width={(width as PageWidth | null) ?? "standard"} align={align === "center" ? "center" : "start"} />
  if (type === "hybrid") return <HybridShellExample page={page ?? "customers"} />
  if (type === "minimal") return <MinimalShellExample />
  if (type === "bottom") return <BottomNavExample page={page ?? "home"} />
  return <HeaderShellExample page={page ?? "reservations"} />
}

function LongContent({ count = 12, label }: { count?: number; label: string }) {
  return (
    <ul className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="border-b border-border py-4 last:border-b-0">
          <p className="text-ui font-medium">
            {label} {i + 1}
          </p>
          <p className="mt-1 text-caption text-muted-foreground">内容が画面に収まらない場合も、スクロールするのはメインの領域だけ</p>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- Header Shell
// 主要な機能が少ないサービス。上部のナビゲーションに機能を並べ、モバイルでは左から開く Sheet にする。
const headerPages = [
  { id: "reservations", label: "予約" },
  { id: "customers", label: "顧客" },
  { id: "staff", label: "スタッフ" },
]

function TopNavLinks({
  items,
  current,
  type,
  className,
  onNavigate,
  currentValue = "page",
}: {
  items: { id: string; label: string }[]
  current: string
  type: string
  className?: string
  onNavigate?: () => void
  /** page：リンク先が現在のページ。true：リンク先を含む集合（機能群）が現在地（Hybrid Shell） */
  currentValue?: "page" | "true"
}) {
  return (
    <ul className={cn("flex gap-1", className)}>
      {items.map((p) => (
        <li key={p.id}>
          <a
            href={hrefFor(type, p.id)}
            aria-current={current === p.id ? currentValue : undefined}
            onClick={(e) => {
              go(hrefFor(type, p.id))(e)
              onNavigate?.()
            }}
            className={cn(
              "flex min-h-10 items-center rounded-sm px-3 text-ui text-muted-foreground outline-none pointer-coarse:min-h-12",
              "transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:focus-ring",
              "aria-[current]:bg-sidebar-accent aria-[current]:font-semibold aria-[current]:text-foreground"
            )}
          >
            {p.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

function HeaderShellExample({ page }: { page: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const current = headerPages.find((p) => p.id === page) ?? headerPages[0]
  return (
    // Sidebar を置かないため、Ctrl / ⌘ + B を受け取らない
    <AppShell keyboardShortcut={false}>
      <AppShellBody>
        <AppShellHeader className="gap-4" data-testid="header-shell-header">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            {/* Sidebar Shell の SidebarTrigger と同じアイコンにし、メニューを開くボタンの形をそろえる */}
            <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label="メニュー" className="-ml-2 pointer-coarse:size-12 md:hidden" />}>
              <PanelLeft />
            </SheetTrigger>
            <SheetContent side="left" size="sm" closeLabel="メニューを閉じる">
              <SheetHeader>
                <SheetTitle>メニュー</SheetTitle>
              </SheetHeader>
              <nav aria-label="メインメニュー" className="px-4 pb-6">
                <TopNavLinks items={headerPages} current={current.id} type="header" className="flex-col" onNavigate={() => setMenuOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>
          <span className="flex items-center gap-3 text-ui font-semibold">
            <ProductMark />
            Flow 予約
          </span>
          <nav aria-label="メインメニュー" className="hidden md:block">
            <TopNavLinks items={headerPages} current={current.id} type="header" />
          </nav>
          <Avatar size="sm" label={`アカウント：${structureUser.name}`} className="ml-auto">
            <AvatarFallback>{getInitials(structureUser.name)}</AvatarFallback>
          </Avatar>
        </AppShellHeader>
        <AppShellMain pageKey={current.id}>
          <PageLayout width="standard">
            <PageHeader>
              <PageHeaderContent>
                <PageHeaderTitle>{current.label}</PageHeaderTitle>
              </PageHeaderContent>
              <PageHeaderActions>
                <Button>{current.id === "reservations" ? "予約を追加" : `${current.label}を追加`}</Button>
              </PageHeaderActions>
            </PageHeader>
            <LongContent label={`${current.label}の項目`} />
          </PageLayout>
        </AppShellMain>
      </AppShellBody>
    </AppShell>
  )
}

// ---------------------------------------------------------------- Hybrid Shell
// 大規模な製品。上部で機能群（営業、請求、分析）を切り替え、Sidebar には選んだ機能群の機能だけを並べる。
const areas = [
  { id: "sales", label: "営業", first: "customers" },
  { id: "billing", label: "請求", first: "invoices" },
  { id: "analytics", label: "分析", first: "sales-report" },
]

function HybridShellExample({ page }: { page: string }) {
  const { toast } = useToast()
  const groups = structureNav(false)
  const areaOf = (id: string) => (["invoices", "payments"].includes(id) ? "billing" : ["sales-report", "contract-report"].includes(id) ? "analytics" : "sales")
  const area = areaOf(page)
  // 機能群ごとの Sidebar の項目（営業、請求、分析の順のグループ）
  const groupIndex = { sales: 1, billing: 2, analytics: 3 }[area]!
  // この例のルーティング（#/shell-examples?type=hybrid&page=...）に合わせて、リンク先を付け直す
  const areaGroups: NavGroup[] = [groups[groupIndex]].map((g) => ({
    items: g.items.map((i): NavItem => {
      if (!isNavParent(i)) return { ...i, href: hrefFor("hybrid", i.id) }
      const link = (c: NavChildItem) => ({ ...c, href: hrefFor("hybrid", c.id) })
      if (i.href) return { ...i, href: hrefFor("hybrid", i.id), children: i.children.map(link) }
      // ページを持たない親は、子の項目が 1 つ以上（型の [最初の子, ...残り]）のまま付け直す
      const [first, ...rest] = i.children
      return { ...i, children: [link(first), ...rest.map(link)] }
    }),
  }))
  const label = groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])])).find((i) => i.id === page)?.label ?? "ページ"
  return (
    <AppShell>
      <div className="flex h-full min-h-0 w-full flex-col">
        <AppShellHeader className="gap-3" data-testid="hybrid-shell-header">
          <SidebarTrigger className="-ml-2 md:hidden" />
          <span className="flex items-center gap-3 text-ui font-semibold">
            <ProductMark />
            <span className="max-sm:sr-only">Flow</span>
          </span>
          <nav aria-label="機能群" className="min-w-0 overflow-x-auto">
            <TopNavLinks
              items={areas.map((a) => ({ id: a.first, label: a.label }))}
              current={areas.find((a) => a.id === area)!.first}
              type="hybrid"
              currentValue="true"
            />
          </nav>
        </AppShellHeader>
        <div className="flex min-h-0 flex-1">
          <StructureSidebar
            className="h-full"
            groups={areaGroups}
            settingsItem={{ ...structureSettingsItem(false), href: hrefFor("hybrid", "settings") }}
            currentId={page}
            homeHref={hrefFor("hybrid", "customers")}
            onNavigate={(id, e) => go(hrefFor("hybrid", id))(e)}
            user={structureUser}
            onSignOut={() => toast({ title: "ログアウトは、この例では実行しない" })}
            showProduct={false}
          />
          <AppShellBody>
            <AppShellMain pageKey={page}>
              <PageLayout width="full">
                <PageHeader>
                  <PageHeaderContent>
                    <PageHeaderTitle>{label}</PageHeaderTitle>
                  </PageHeaderContent>
                </PageHeader>
                <LongContent label={`${label}の項目`} count={8} />
              </PageLayout>
            </AppShellMain>
          </AppShellBody>
        </div>
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------- Minimal Shell
// 集中して行う操作。ナビゲーションを置かず、作業を終える操作（閉じる）だけを置く。ログインは業務アプリの例を参照。
function MinimalShellExample() {
  const { toast } = useToast()
  const previewOnly = (action: string) => () => toast({ title: `${action}は、この例では実行しない` })
  return (
    <MinimalShell
      header={
        <>
          <span className="flex min-w-0 items-center gap-3 text-ui font-semibold">
            <ProductMark />
            <span className="truncate">見積もりの作成</span>
          </span>
          <a href="#/app-shell" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-auto")}>
            <X />
            閉じる
          </a>
        </>
      }
    >
      <PageLayout width="focused" align="center" data-testid="minimal-content">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>見積もりの内容</PageHeaderTitle>
            <PageHeaderDescription>3 つの手順のうち 2 つ目。入力した内容は自動で保存する。</PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>件名</FieldLabel>
            <Input defaultValue="営業管理システムの導入" />
          </Field>
          <Field>
            <FieldLabel>備考</FieldLabel>
            <Textarea rows={4} />
          </Field>
        </FieldGroup>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={previewOnly("前の手順への移動")}>
            戻る
          </Button>
          <Button onClick={previewOnly("次の手順への移動")}>次へ</Button>
        </div>
      </PageLayout>
    </MinimalShell>
  )
}

// ---------------------------------------------------------------- Bottom Navigation
// 一般消費者向けで、主要な機能が 4 つ。モバイルでは Bottom Navigation、デスクトップでは上部のナビゲーション。
const consumerPages = [
  { id: "home", label: "ホーム", icon: House },
  { id: "explore", label: "さがす", icon: Compass },
  { id: "bookings", label: "予約", icon: CalendarDays },
  { id: "account", label: "マイページ", icon: UserRound },
]

function BottomNavExample({ page }: { page: string }) {
  const current = consumerPages.find((p) => p.id === page) ?? consumerPages[0]
  return (
    // Sidebar を置かないため、Ctrl / ⌘ + B を受け取らない
    <AppShell keyboardShortcut={false}>
      <AppShellBody>
        <AppShellHeader className="gap-4">
          <span className="flex items-center gap-3 text-ui font-semibold">
            <ProductMark />
            Flow トラベル
          </span>
          <nav aria-label="メインメニュー" className="hidden md:block">
            <TopNavLinks items={consumerPages} current={current.id} type="bottom" />
          </nav>
        </AppShellHeader>
        <AppShellMain pageKey={current.id} data-testid="bottom-main">
          <PageLayout width="standard">
            <PageHeader>
              <PageHeaderContent>
                <PageHeaderTitle>{current.label}</PageHeaderTitle>
              </PageHeaderContent>
            </PageHeader>
            <SectionStack>
              <Section>
                <SectionHeader>
                  <SectionTitle>行き先をさがす</SectionTitle>
                </SectionHeader>
                <div className="relative">
                  <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="行き先" placeholder="都市名、施設名" className="pl-11" data-testid="bottom-search" />
                </div>
              </Section>
              <Section>
                <SectionHeader>
                  <SectionTitle>おすすめ</SectionTitle>
                </SectionHeader>
                <LongContent label="おすすめの宿" count={10} />
              </Section>
            </SectionStack>
            <ExampleFootnote>最後の項目まで、Bottom Navigation に隠れずに操作できる</ExampleFootnote>
          </PageLayout>
        </AppShellMain>
        <BottomNav data-testid="bottom-nav">
          {consumerPages.map((p) => (
            <BottomNavItem key={p.id} icon={p.icon} label={p.label} href={hrefFor("bottom", p.id)} isActive={p.id === current.id} onClick={go(hrefFor("bottom", p.id))} />
          ))}
        </BottomNav>
      </AppShellBody>
    </AppShell>
  )
}

function ExampleFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="text-caption text-muted-foreground" data-testid="last-content">
      {children}
    </p>
  )
}

// ---------------------------------------------------------------- ページ幅の切り替え
// Sidebar Shell の中で PageLayout の 5 種類の幅と配置を切り替え、最大幅と余白が適用される領域を示す。
const widthOptions: { value: PageWidth; label: string }[] = [
  { value: "full", label: "Full Width" },
  { value: "wide", label: "Wide" },
  { value: "standard", label: "Standard" },
  { value: "focused", label: "Focused" },
  { value: "compact", label: "Compact" },
]

// 選択中は Primary で塗らず、ナビゲーションの現在地と同じニュートラルの面と太さ 600 で示す。
const toggleClass = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "text-muted-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
)

function LayoutExample({ width, align }: { width: PageWidth; align: "start" | "center" }) {
  const ref = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<{ content: number; padding: number } | null>(null)
  useEffect(() => {
    const layout = ref.current?.querySelector<HTMLElement>("[data-slot=page-layout]")
    const content = layout?.querySelector<HTMLElement>("[data-slot=page-layout-content]")
    if (!layout || !content) return
    const update = () =>
      setMeasured({ content: Math.round(content.getBoundingClientRect().width), padding: Math.round(parseFloat(getComputedStyle(layout).paddingLeft)) })
    const ro = new ResizeObserver(update)
    ro.observe(layout)
    ro.observe(content)
    update()
    return () => ro.disconnect()
  }, [width, align])
  const href = (w: string, a: string) => `#/shell-examples?type=layout&width=${w}&align=${a}`
  return (
    <AppShell>
      <StructureSidebar
        groups={structureNav(false)}
        settingsItem={structureSettingsItem(false)}
        currentId="customers"
        homeHref="#/shell-examples?type=layout"
        onNavigate={(_, e) => e.preventDefault()}
        user={structureUser}
        onSignOut={() => undefined}
      />
      <AppShellBody>
        <AppShellHeader className="md:hidden">
          <SidebarTrigger className="-ml-2" />
          <span className="text-ui font-semibold">ページ幅の切り替え</span>
        </AppShellHeader>
        <AppShellMain pageKey={`${width}:${align}`} data-testid="layout-main">
          {/* ページの余白の領域を薄い面、最大幅の内容の領域を破線で示す（検証のための表示） */}
          <div ref={ref} className="contents">
            <PageLayout width={width} align={align} className="min-h-full bg-sidebar/60" contentClassName="bg-background outline-1 outline-dashed outline-border-strong">
              <PageHeader>
                <PageHeaderContent>
                  <PageHeaderTitle>{widthOptions.find((w) => w.value === width)!.label}</PageHeaderTitle>
                  <PageHeaderDescription data-testid="layout-measure">
                    {measured ? `内容の幅 ${measured.content}px・ページの余白 ${measured.padding}px` : "測定中"}
                  </PageHeaderDescription>
                </PageHeaderContent>
              </PageHeader>
              <nav aria-label="幅と配置" className="flex flex-col gap-4">
                <ul className="flex flex-wrap gap-2">
                  {widthOptions.map((w) => (
                    <li key={w.value}>
                      <a
                        href={href(w.value, align)}
                        aria-current={w.value === width ? "page" : undefined}
                        onClick={go(href(w.value, align))}
                        className={toggleClass}
                      >
                        {w.label}
                      </a>
                    </li>
                  ))}
                </ul>
                <ul className="flex flex-wrap gap-2">
                  {(
                    [
                      ["start", "左寄せ"],
                      ["center", "中央寄せ"],
                    ] as const
                  ).map(([a, l]) => (
                    <li key={a}>
                      <a
                        href={href(width, a)}
                        aria-current={a === align ? "page" : undefined}
                        onClick={go(href(width, a))}
                        className={toggleClass}
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <LongContent label="内容" count={6} />
            </PageLayout>
          </div>
        </AppShellMain>
      </AppShellBody>
    </AppShell>
  )
}
