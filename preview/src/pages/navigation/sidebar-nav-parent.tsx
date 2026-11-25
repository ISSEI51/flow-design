import { useState, type ComponentType, type MouseEvent } from "react"
import { Check, ChevronDown } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// 子の項目を持つ Sidebar の項目（2 階層目への入り口）。Sidebar と Dropdown Menu を組み合わせた Pattern。
// Sidebar の本体は、ナビゲーションの構造を持たない。この部品も、項目と現在位置と移動の処理を受け取るだけにする。
//
// - 展開時：子の項目を Sidebar の中に 2 階層目として表示する。
//   - 親が自身のページを持つ場合：親はリンク。右の SidebarMenuAction で子の項目を開閉する（aria-expanded）。
//   - 親が自身のページを持たない場合：親はボタンで、押すと子の項目を開閉する（aria-expanded）。
// - 折りたたみ時：子の項目は Sidebar の中に表示できないため、親を Dropdown Menu のボタンにし、右側に子の項目を表示する。
//   親が自身のページを持つ場合は、メニューの最初に親のページを置く。Tooltip は付けない（メニューの見出しで名前がわかり、
//   Tooltip とメニューが重なるため）。
// - モバイル（Sheet）は常に展開時の表示になる。
// - 現在位置は aria-current="page" で伝える。折りたたみ時は、子が現在位置のとき親を現在位置の面で示す。

export type NavChild = { id: string; label: string }

export function SidebarNavParent({
  id,
  label,
  icon: Icon,
  pageLabel,
  items,
  current,
  hrefFor,
  onNavigate,
}: {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** 親が自身のページを持つ場合の、メニューの中での名前（例：契約の一覧）。持たない場合は省略する */
  pageLabel?: string
  items: NavChild[]
  current: string
  hrefFor: (id: string) => string
  onNavigate: (id: string, event: MouseEvent) => void
}) {
  const { state, isMobile } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  const childActive = items.some((c) => c.id === current)
  const selfActive = pageLabel !== undefined && current === id
  const [expanded, setExpanded] = useState(childActive || selfActive)
  const subId = `sidebar-sub-${id}`

  if (collapsed) {
    const entries = pageLabel ? [{ id, label: pageLabel }, ...items] : items
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <SidebarMenuButton
            render={<DropdownMenuTrigger />}
            data-nav-parent={id}
            className={cn((childActive || selfActive) && "bg-sidebar-accent! font-semibold text-sidebar-accent-foreground")}
          >
            <Icon />
            <span>{label}</span>
          </SidebarMenuButton>
          <DropdownMenuContent side="right" align="start" sideOffset={12} className="max-w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{label}</DropdownMenuLabel>
              {entries.map((c) => {
                const active = current === c.id
                return (
                  <DropdownMenuItem
                    key={c.id}
                    render={<a href={hrefFor(c.id)} />}
                    aria-current={active ? "page" : undefined}
                    onClick={(e) => onNavigate(c.id, e)}
                    className={cn("pr-10", active && "font-semibold")}
                  >
                    {c.label}
                    {active && <Check aria-hidden="true" className="absolute right-3" />}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )
  }

  const toggle = () => setExpanded((v) => !v)
  return (
    <SidebarMenuItem>
      {pageLabel ? (
        <>
          <SidebarMenuButton
            isActive={selfActive}
            render={<a href={hrefFor(id)} onClick={(e) => onNavigate(id, e)} />}
          >
            <Icon />
            <span>{label}</span>
          </SidebarMenuButton>
          <SidebarMenuAction
            aria-label={`${label}の下の項目`}
            aria-expanded={expanded}
            aria-controls={subId}
            onClick={toggle}
          >
            <ChevronDown className={cn("transition-transform duration-(--duration-normal) ease-standard", expanded && "rotate-180")} />
          </SidebarMenuAction>
        </>
      ) : (
        <SidebarMenuButton aria-expanded={expanded} aria-controls={subId} onClick={toggle}>
          <Icon />
          <span>{label}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "ml-auto size-4! transition-transform duration-(--duration-normal) ease-standard",
              expanded && "rotate-180"
            )}
          />
        </SidebarMenuButton>
      )}
      {expanded && (
        <SidebarMenuSub id={subId}>
          {items.map((c) => (
            <SidebarMenuSubItem key={c.id}>
              <SidebarMenuSubButton
                isActive={current === c.id}
                href={hrefFor(c.id)}
                onClick={(e) => onNavigate(c.id, e)}
              >
                {c.label}
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}
