import { type ComponentType, type MouseEvent } from "react"
import {
  BarChart3,
  Building2,
  FileText,
  Handshake,
  House,
  Receipt,
  Settings,
  Wallet,
} from "lucide-react"

import { Avatar, AvatarFallback, getInitials } from "@/components/ui/avatar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { SidebarNav, type NavGroup as RegistryNavGroup } from "@/patterns/sidebar-nav"

// 顧客管理・契約管理の BtoB SaaS のナビゲーション。プレビュー（製品）側のコード。
// 項目、現在位置、ユーザー情報は、コンポーネントではなくこの画面が持つ。
// 項目は業務の順序（顧客 → 商談 → 契約 → 請求 → 入金）と意味でグループに分け、階層は 2 つまでにする。
// 描画は Registry の SidebarNav（registry/patterns/sidebar-nav.tsx）が行う。折りたたみ時は Dropdown Menu で子の項目を開く。

export type NavChild = { id: string; label: string }

export type NavItem = {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  badge?: string
  /** 子の項目を持つ親が、自身のページも持つ場合のメニューの中での名前 */
  pageLabel?: string
  children?: NavChild[]
}

export type NavGroup = { label?: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  { items: [{ id: "home", label: "ホーム", icon: House }] },
  {
    label: "営業",
    items: [
      { id: "customers", label: "顧客", icon: Building2 },
      { id: "deals", label: "商談", icon: Handshake, badge: "18" },
      {
        id: "contracts",
        label: "契約",
        icon: FileText,
        pageLabel: "契約の一覧",
        children: [
          { id: "renewals", label: "更新が近い契約" },
          { id: "cancellations", label: "解約の申し込み" },
        ],
      },
    ],
  },
  {
    label: "請求",
    items: [
      { id: "invoices", label: "請求書", icon: Receipt },
      { id: "payments", label: "入金", icon: Wallet },
    ],
  },
  {
    label: "分析",
    items: [
      {
        id: "reports",
        label: "レポート",
        icon: BarChart3,
        children: [
          { id: "sales-report", label: "売上のレポート" },
          { id: "contract-report", label: "契約の推移" },
        ],
      },
    ],
  },
]

export const settingsItem: NavItem = { id: "settings", label: "設定", icon: Settings }

export const pageLabels: Record<string, string> = Object.fromEntries(
  [...navGroups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])])), settingsItem].map((i) => [
    i.id,
    i.label,
  ])
)

export type User = { name: string; email: string }

// 画面が持つ項目（id）に、製品のルーティングで決まるリンク先（href）を付ける。
// 子の項目を持つ親は、pageLabel がある場合だけ自身のページ（href）を持つ。
function toRegistryGroups(groups: NavGroup[], hrefFor: (id: string) => string): RegistryNavGroup[] {
  return groups.map((g) => ({
    label: g.label,
    items: g.items.map((i) => ({
      ...i,
      href: !i.children || i.pageLabel ? hrefFor(i.id) : undefined,
      children: i.children?.map((c) => ({ ...c, href: hrefFor(c.id) })),
    })),
  }))
}

export function AppSidebar({
  current,
  onNavigate,
  hrefFor,
  user,
  groups = navGroups,
  productName = "Flow 顧客管理",
  className,
}: {
  current: string
  onNavigate: (id: string) => void
  hrefFor: (id: string) => string
  user: User
  groups?: NavGroup[]
  productName?: string
  className?: string
}) {
  const { isMobile, setOpenMobile } = useSidebar()

  // ルーティングはこの画面の責務。移動したら、モバイルでは Sheet を閉じる。
  const go = (id: string) => (e: MouseEvent) => {
    e.preventDefault()
    onNavigate(id)
    if (isMobile) setOpenMobile(false)
  }

  const link = (item: { id: string }) => <a href={hrefFor(item.id)} onClick={go(item.id)} />

  return (
    <Sidebar collapsible="icon" className={className}>
      <SidebarHeader>
        <a
          href={hrefFor("home")}
          onClick={go("home")}
          className="flex min-h-11 items-center gap-3 rounded-sm px-2 outline-none focus-visible:focus-ring group-data-[collapsible=icon]/sidebar:w-10 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0"
        >
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-caption font-semibold text-primary-foreground"
          >
            F
          </span>
          <span className="truncate text-ui font-semibold group-data-[collapsible=icon]/sidebar:sr-only">
            {productName}
          </span>
        </a>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav
          groups={toRegistryGroups(groups, hrefFor)}
          currentId={current}
          onNavigate={(id, e) => {
            e.preventDefault()
            onNavigate(id)
          }}
        />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={current === settingsItem.id}
              render={link(settingsItem)}
              tooltip={settingsItem.label}
            >
              <Settings />
              <span>{settingsItem.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex min-h-12 items-center gap-3 px-2 group-data-[collapsible=icon]/sidebar:w-10 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0">
          <Avatar size="sm" className="shrink-0">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]/sidebar:sr-only">
            <span className="block truncate text-ui font-medium text-sidebar-foreground">{user.name}</span>
            <span className="block truncate text-caption text-muted-foreground">{user.email}</span>
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
