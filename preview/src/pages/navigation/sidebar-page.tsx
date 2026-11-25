import { useState, type ReactNode } from "react"
import { Building2, FileText, House, Receipt } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { AppSidebar, pageLabels, type NavGroup } from "./app-sidebar"

const user = { name: "佐藤 花子", email: "hanako.sato@example.com" }

const longGroups: NavGroup[] = [
  {
    label: "営業と契約の管理",
    items: [
      { id: "customers", label: "顧客と取引先の担当者", icon: Building2 },
      { id: "contracts", label: "Contract renewals and cancellations", icon: FileText },
      { id: "invoices", label: "請求書の発行と送付の履歴", icon: Receipt },
    ],
  },
]

// プレビューの中に置くための枠。製品では SidebarProvider が画面全体（min-h-svh）を使う。
function Frame({ testId, children, className }: { testId: string; children: ReactNode; className?: string }) {
  return (
    <div data-testid={testId} className={className ?? "w-full"}>
      {children}
    </div>
  )
}

function Inset({ title }: { title: string }) {
  const { state, isMobile } = useSidebar()
  return (
    <SidebarInset render={<div />} className="min-h-0 overflow-auto">
      <div className="flex min-h-14 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-2" />
      </div>
      <div className="px-6 pb-6">
        <p className="text-heading" data-testid="frame-title">
          {title}
        </p>
        <p className="mt-2 text-ui text-muted-foreground" data-testid="frame-state">
          {isMobile ? "モバイル：メニューは Sheet で開く" : state === "expanded" ? "展開（240px）" : "折りたたみ（64px）"}
        </p>
      </div>
    </SidebarInset>
  )
}

function Demo({
  testId,
  groups,
  open,
  onOpenChange,
  keyboardShortcut,
}: {
  testId: string
  groups?: NavGroup[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  keyboardShortcut?: string | false
}) {
  const [current, setCurrent] = useState("customers")
  return (
    <Frame testId={testId}>
      <SidebarProvider
        open={open}
        onOpenChange={onOpenChange}
        keyboardShortcut={keyboardShortcut}
        className="h-[36rem] min-h-0 overflow-hidden rounded-xl border border-border"
      >
        <AppSidebar
          current={current}
          onNavigate={setCurrent}
          hrefFor={(id) => `#/sidebar?page=${id}`}
          user={user}
          groups={groups}
          className="h-full"
        />
        <Inset title={pageLabels[current] ?? current} />
      </SidebarProvider>
    </Frame>
  )
}

function ControlledDemo() {
  const [open, setOpen] = useState(true)
  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="controlled-expand">
          展開する
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)} data-testid="controlled-collapse">
          折りたたむ
        </Button>
        <p className="text-ui text-muted-foreground" role="status" data-testid="controlled-value">
          製品が持つ状態：open = {String(open)}
        </p>
      </div>
      <Demo testId="sidebar-controlled" open={open} onOpenChange={setOpen} keyboardShortcut={false} />
    </div>
  )
}

function FormDemo() {
  const [log, setLog] = useState<string[]>([])
  const add = (t: string) => setLog((l) => [...l, t])
  return (
    <form
      data-testid="sidebar-form"
      className="flex flex-wrap items-start gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        add("フォームを送信した")
      }}
    >
      <Static>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton data-testid="sidebar-form-button" onClick={() => add("下書きを保存した")}>
                <FileText />
                <span>下書きを保存</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                data-testid="sidebar-form-disabled"
                aria-disabled="true"
                render={<a href="#/sidebar?page=invoices" />}
                onClick={() => add("請求書へ移動した")}
              >
                <Receipt />
                <span>請求書（権限がありません）</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </Static>
      <p data-testid="sidebar-form-log" role="status" className="text-ui text-muted-foreground">
        {log.length ? log.join("、") : "まだ操作していません"}
      </p>
    </form>
  )
}

// 良い例と悪い例のための、開閉しない Sidebar。
function Static({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider keyboardShortcut={false} className="min-h-0 w-auto">
      <Sidebar collapsible="none" className="h-auto rounded-xl py-2">
        <SidebarContent>{children}</SidebarContent>
      </Sidebar>
    </SidebarProvider>
  )
}

function StaticItem({ label, icon, active, className }: { label: string; icon: ReactNode; active?: boolean; className?: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} className={className}>
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function SidebarPage() {
  return (
    <article>
      <PageHeader
        name="Sidebar"
        lead="業務アプリケーションの主要なナビゲーション。現在位置を示し、目的の機能へ迷わず移動できるようにする。"
      />

      <Section
        title="展開と折りたたみ"
        lead="展開時 240px、折りたたみ時 64px。初期状態は展開。折りたたむとアイコンだけになり、すべての主要な機能へ移動できる。"
      >
        <Row
          label="ページの切り替え"
          note="項目を押すと、現在位置が移る。左上のボタン、または Ctrl / ⌘ + B で開閉する。折りたたむと、項目の名前を Tooltip で表示し、子の項目を持つ「契約」「レポート」はメニューで子の項目を開く"
        >
          <Demo testId="sidebar-basic" />
        </Row>
      </Section>

      <Section
        title="状態の制御"
        lead="open と onOpenChange で、開閉の状態を製品が持つ。保存の方法（Cookie、localStorage、サーバー）は製品が決める。"
      >
        <Row label="製品から開閉する">
          <ControlledDemo />
        </Row>
      </Section>

      <Section
        title="読み込み中"
        lead="項目を取得している間は SidebarMenuSkeleton を置き、項目と同じ高さを保つ。読み込み中であることは、親の aria-busy と文字で伝える。"
      >
        <Row label="項目の取得中">
          <div data-testid="sidebar-loading">
            <Static>
              <SidebarGroup aria-busy="true">
                <SidebarGroupLabel>営業</SidebarGroupLabel>
                <p className="sr-only" role="status">
                  メニューを読み込んでいます
                </p>
                <SidebarMenu>
                  {Array.from({ length: 4 }, (_, i) => (
                    <SidebarMenuItem key={i}>
                      <SidebarMenuSkeleton showIcon />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </Static>
          </div>
        </Row>
      </Section>

      <Section
        title="キーボードのショートカット"
        lead='既定は Ctrl / ⌘ + B。keyboardShortcut でキーを変え、false で無効にする。Sidebar が複数ある場合は、フォーカスのある Sidebar だけが開閉する。このページの「状態の制御」と「長いラベル」の例は無効にしている。'
      >
        <Row label="キーを変える" note='keyboardShortcut="m"。この枠の中にフォーカスがあるときに Ctrl / ⌘ + M で開閉する'>
          <Demo testId="sidebar-shortcut" keyboardShortcut="m" />
        </Row>
      </Section>

      <Section
        title="ボタンとリンク、無効な項目"
        lead='SidebarMenuButton は既定で type="button" の button を描画し、フォームの中で送信しない。aria-disabled の項目はフォーカスできるが、押しても実行しない。'
      >
        <Row label="フォームの中">
          <FormDemo />
        </Row>
      </Section>

      <Section title="長いラベル" lead="省略せずに折り返す。折りたたんだときは名前を視覚的に隠し、アクセシブルな名前として残す。">
        <Row label="日本語・英語">
          <Demo testId="sidebar-long" groups={longGroups} keyboardShortcut={false} />
        </Row>
      </Section>

      <Section
        title="モバイル"
        lead="768px 未満では常に表示せず、メニューのボタンで Sheet として開く。背景の操作を止め、フォーカスを中に閉じ込め、Escape で閉じる。移動したら閉じる。"
      >
        <Row label="幅 390px" note="業務アプリケーションの例を、幅 390px の枠で表示している">
          <iframe
            title="モバイルの業務アプリケーションの例"
            src="#/app?page=customers"
            className="h-[44rem] w-full max-w-[390px] rounded-xl border border-border"
          />
        </Row>
      </Section>

      <Section title="業務アプリケーションの例" lead="Sidebar、Tabs、Breadcrumb、Card、Accordion、Separator を組み合わせた画面。">
        <Row label="画面全体で開く">
          <a
            href="#/app"
            className="rounded-xs text-ui font-medium underline underline-offset-4 outline-none focus-visible:focus-ring"
          >
            業務アプリの例を開く
          </a>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Static>
              <SidebarGroup>
                <SidebarMenu>
                  <StaticItem label="ホーム" icon={<House />} />
                  <StaticItem
                    label="顧客"
                    icon={<Building2 />}
                    active
                    className="relative bg-primary! text-primary-foreground! before:absolute before:inset-y-1 before:-left-3 before:w-1 before:rounded-full before:bg-primary"
                  />
                  <StaticItem label="契約" icon={<FileText />} />
                </SidebarMenu>
              </SidebarGroup>
            </Static>
          }
          badNote="現在位置をブランドカラーで塗り、左側に線を付ける。強い塗りが画面で最も目立ち、内容より先に目に入る。"
          good={
            <Static>
              <SidebarGroup>
                <SidebarMenu>
                  <StaticItem label="ホーム" icon={<House />} />
                  <StaticItem label="顧客" icon={<Building2 />} active />
                  <StaticItem label="契約" icon={<FileText />} />
                </SidebarMenu>
              </SidebarGroup>
            </Static>
          }
          goodNote="薄いニュートラルの面、文字とアイコンの色、太さ 600 で示す。"
        />
        <Compare
          bad={
            <Static>
              <SidebarGroup>
                <SidebarMenu>
                  <StaticItem label="営業" icon={<Building2 />} />
                  <SidebarMenuItem>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton href="#/sidebar">顧客</SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSub className="mt-0">
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton href="#/sidebar">契約</SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSub className="mt-0">
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton href="#/sidebar">更新</SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            </SidebarMenuSub>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            </Static>
          }
          badNote="項目が増えるたびに階層を深くする。目的の機能がどこにあるか、開いて探す必要がある。"
          good={
            <Static>
              <SidebarGroup>
                <SidebarGroupLabel>営業</SidebarGroupLabel>
                <SidebarMenu>
                  <StaticItem label="顧客" icon={<Building2 />} />
                  <StaticItem label="契約" icon={<FileText />} />
                </SidebarMenu>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>請求</SidebarGroupLabel>
                <SidebarMenu>
                  <StaticItem label="請求書" icon={<Receipt />} />
                </SidebarMenu>
              </SidebarGroup>
            </Static>
          }
          goodNote="深くする前に、意味のあるグループに分ける。階層は 2 つまで。"
        />
      </Section>
    </article>
  )
}

