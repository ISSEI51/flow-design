import { useState, type ComponentType, type MouseEvent } from "react"
import {
  BarChart3,
  Building2,
  ChevronDown,
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// 顧客管理・契約管理の BtoB SaaS のナビゲーション。プレビュー（製品）側のコード。
// 項目、現在位置、ユーザー情報は、コンポーネントではなくこの画面が持つ。
// 項目は業務の順序（顧客 → 商談 → 契約 → 請求 → 入金）と意味でグループに分け、階層は 2 つまでにする。

export type NavItem = {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  badge?: string
  children?: { id: string; label: string }[]
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
        children: [
          { id: "contracts", label: "契約の一覧" },
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
  { label: "分析", items: [{ id: "reports", label: "レポート", icon: BarChart3 }] },
]

export const settingsItem: NavItem = { id: "settings", label: "設定", icon: Settings }

export const pageLabels: Record<string, string> = Object.fromEntries(
  [...navGroups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])])), settingsItem].map((i) => [
    i.id,
    i.label,
  ])
)

export type User = { name: string; email: string }

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
  const { isMobile, setOpenMobile, state, setOpen } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  const parentOf = (id: string) => groups.flatMap((g) => g.items).find((i) => i.children?.some((c) => c.id === id))?.id
  const [openParents, setOpenParents] = useState<string[]>(() => {
    const p = parentOf(current)
    return p ? [p] : []
  })

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
        <nav aria-label="メインメニュー">
          {groups.map((group, gi) => (
            <SidebarGroup key={group.label ?? gi}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    if (!item.children) {
                      return (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton isActive={current === item.id} render={link(item)} tooltip={item.label}>
                            <Icon />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                          {item.badge && <SidebarMenuBadge aria-hidden="true">{item.badge}</SidebarMenuBadge>}
                        </SidebarMenuItem>
                      )
                    }
                    const expanded = openParents.includes(item.id)
                    const childActive = item.children.some((c) => c.id === current)
                    const subId = `sidebar-sub-${item.id}`
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          tooltip={item.label}
                          aria-expanded={collapsed ? undefined : expanded}
                          aria-controls={collapsed ? undefined : subId}
                          onClick={() => {
                            // 折りたたみ中は子の項目が見えないため、メニューを展開して子の項目を表示する。
                            if (collapsed) {
                              setOpen(true)
                              setOpenParents((p) => (p.includes(item.id) ? p : [...p, item.id]))
                              return
                            }
                            setOpenParents((p) => (expanded ? p.filter((x) => x !== item.id) : [...p, item.id]))
                          }}
                          className={cn(
                            collapsed &&
                              childActive &&
                              "bg-sidebar-accent! font-semibold text-sidebar-accent-foreground"
                          )}
                        >
                          <Icon />
                          <span>{item.label}</span>
                          <ChevronDown
                            aria-hidden="true"
                            className={cn(
                              "ml-auto size-4! transition-transform duration-(--duration-normal) ease-standard group-data-[collapsible=icon]/sidebar:hidden",
                              expanded && "rotate-180"
                            )}
                          />
                        </SidebarMenuButton>
                        {expanded && (
                          <SidebarMenuSub id={subId}>
                            {item.children.map((c) => (
                              <SidebarMenuSubItem key={c.id}>
                                <SidebarMenuSubButton
                                  isActive={current === c.id}
                                  href={hrefFor(c.id)}
                                  onClick={go(c.id)}
                                >
                                  {c.label}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        )}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
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
