import type { MouseEvent } from "react"
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react"

import { Avatar, AvatarFallback, getInitials } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { useToast } from "@/components/ui/toast"
import { SidebarNav, SidebarNavItem, type NavGroup, type NavItem } from "@/patterns/sidebar-nav"
import { cn } from "@/lib/utils"

// 業務アプリの例の Sidebar（製品側のコード）。Registry の Sidebar と SidebarNav を組み合わせる。
// - 上部：製品名（ホームへのリンク）と、デスクトップで Sidebar を折りたたむボタン
// - 中央：メインメニュー（SidebarContent の中で独立してスクロールする）
// - 下部：製品の設定とアカウント

export function ProductMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-caption font-semibold text-primary-foreground",
        className
      )}
    >
      F
    </span>
  )
}

export function StructureSidebar({
  groups,
  settingsItem,
  currentId,
  onNavigate,
  homeHref,
  user,
  productName = "Flow 営業管理",
  onSignOut,
  showProduct = true,
  className,
}: {
  groups: NavGroup[]
  settingsItem: NavItem
  currentId: string
  onNavigate: (id: string, event: MouseEvent) => void
  homeHref: string
  user: { name: string; email: string }
  productName?: string
  onSignOut: () => void
  /** 製品名をヘッダーに置く画面（Hybrid Shell）では false にし、同じ表示を重ねない */
  showProduct?: boolean
  className?: string
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const { toast } = useToast()
  return (
    <Sidebar collapsible="icon" className={className}>
      <SidebarHeader className="flex-row items-center group-data-[collapsible=icon]/sidebar:flex-col">
        {showProduct && (
        <a
          href={homeHref}
          onClick={(e) => {
            // 修飾キー付きのクリックと中ボタンは、新しいタブで開く操作としてブラウザに任せる
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            onNavigate("home", e)
            if (isMobile) setOpenMobile(false)
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-sm px-2 outline-none focus-visible:focus-ring group-data-[collapsible=icon]/sidebar:w-10 group-data-[collapsible=icon]/sidebar:flex-none group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0"
        >
          <ProductMark />
          <span className="truncate text-ui font-semibold group-data-[collapsible=icon]/sidebar:sr-only">{productName}</span>
        </a>
        )}
        {/* モバイルの Sheet には閉じるボタンがあるため、折りたたみのボタンはデスクトップだけに置く */}
        {!isMobile && <SidebarTrigger data-testid="sidebar-collapse" className={cn(!showProduct && "ml-auto group-data-[collapsible=icon]/sidebar:ml-0")} />}
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav groups={groups} currentId={currentId} onNavigate={onNavigate} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarNavItem item={settingsItem} currentId={currentId} onNavigate={onNavigate} />
          <SidebarMenuItem>
            <DropdownMenu>
              <SidebarMenuButton
                size="lg"
                render={<DropdownMenuTrigger />}
                className="group-data-[collapsible=icon]/sidebar:size-10"
              >
                {/* 折りたたみ時は span の名前が視覚的に隠れる。Avatar は div で包んで表示を残す */}
                <div className="flex shrink-0">
                  <Avatar size="sm">
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                </div>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-sidebar-foreground">{user.name}</span>
                  <span className="truncate text-caption">{user.email}</span>
                </span>
                <ChevronsUpDown aria-hidden="true" className="ml-auto size-4! group-data-[collapsible=icon]/sidebar:hidden" />
              </SidebarMenuButton>
              <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" sideOffset={12} className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => toast({ title: "プロフィールは、この検証用の画面では表示しない" })}>
                    <UserRound />
                    プロフィール
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut}>
                  <LogOut />
                  ログアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
