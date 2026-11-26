"use client"

import * as React from "react"
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// Flow Design Sidebar Navigation（Patterns / App Structure / Navigation）
// Sidebar（Components）と Dropdown Menu を組み合わせ、項目の一覧からナビゲーションを描画する。
// 定義と判断基準は docs/web/patterns/navigation.md を参照。
//
// - 階層は 2 つまで（主要な項目と、その子の項目）。3 つ目以上の階層は型で受け付けない。
// - 主要な項目はアイコンと文字、子の項目は文字だけ。現在地は Sidebar の isActive（ニュートラルの面と太さ 600）で示す。
// - 現在地は currentId（製品が自分のルーターから求めた項目の id）で受け取り、特定のルーティングのライブラリに依存しない。
//   項目の id は、1 つの SidebarNav の中で一意にする（製品の責務）。
// - リンクの要素は renderLink で変えられる（既定は <a href>）。例：Next.js の <Link>、React Router の <Link>。
// - 子の項目を持たない項目は href が必須（型で保証する）。href を持たない親は、子の項目がある場合だけ描画する。
// - 子の項目を持つ項目（SidebarNavParent）
//   - 展開時：子の項目を 2 階層目として Sidebar の中に表示する。現在地を含むグループは、現在地がグループに入ったときに開く。
//     ほかのグループも任意に開閉できる。利用者が閉じた状態は、グループの中で移動しても変えない。
//   - 親が自身のページ（href）を持つ場合：親はリンクで、右の開閉のボタン（aria-expanded）で子の項目を開閉する。
//     親への移動と子の開閉を、別の操作に分ける。
//   - 親が自身のページを持たない場合：親はボタンで、押すと子の項目を開閉する。
//   - 折りたたみ時（64px）：親を Dropdown Menu のボタンにし、右側に子の項目を表示する。
//   - モバイル（Sheet）では常に展開時の表示になる。
//   - 親の現在地の表し方（data-nav-current）
//       page         親のページ自体が現在地：sidebar-accent の面、太さ 600、aria-current="page"（Sidebar の isActive）
//       child-open   子が現在地で、子を表示している：親は面なし、文字を sidebar-accent-foreground・太さ 500。子が現在地の面と aria-current="page"
//       child-closed 子が現在地で、子を閉じている：面なし、文字を sidebar-accent-foreground・太さ 600、aria-current="true"
//       （なし）      現在地を含まない
//       折りたたみ時 子か親のページが現在地：sidebar-accent の面、太さ 600、aria-current="true"
//     親のページ自体が現在地でない場合は、aria-current="page" を付けない。
// - 項目を選んで移動したら、モバイルの Sheet を閉じる。修飾キー（Ctrl、⌘、Shift、Alt）付きのクリックと中ボタンは、
//   新しいタブで開く操作として扱い、移動とみなさない。
// - 子の項目の領域の id は useId で作り、同じ画面に複数の SidebarNav を置いても重複しない。

type NavIcon = React.ComponentType<{ className?: string }>

/** 子の項目（2 階層目）。アイコンは持たない */
type NavChildItem = {
  id: string
  label: string
  href: string
}

type NavItemBase = {
  id: string
  label: string
  icon: NavIcon
}

/** 子の項目を持たない、主要な項目。href は必須 */
type NavLinkItem = NavItemBase & {
  href: string
  children?: undefined
  pageLabel?: undefined
} & (
    | { badge?: undefined; badgeLabel?: undefined }
    | {
        /** 件数など（例：18）。表示は視覚だけ（aria-hidden） */
        badge: string
        /** badge の意味（例：進行中 18 件）。項目の説明（aria-describedby）として支援技術に伝える。badge を付ける場合は必須 */
        badgeLabel: string
      }
  )

/** 子の項目を持つ親。href を省略すると、親はページを持たない（押すと子の項目を開閉する）。badge は表示しない */
type NavParentItem = NavItemBase & {
  badge?: undefined
  badgeLabel?: undefined
} & (
    | {
        href: string
        /** 折りたたみ時のメニューの中での、親のページの名前（例：契約の一覧）。省略すると label */
        pageLabel?: string
        /** 空の場合は、親のページへの通常の項目として描画する */
        children: readonly NavChildItem[]
      }
    | {
        href?: undefined
        pageLabel?: undefined
        /** ページを持たない親は、子の項目が 1 つ以上必要 */
        children: readonly [NavChildItem, ...NavChildItem[]]
      }
  )

/** 主要な項目（1 階層目） */
type NavItem = NavLinkItem | NavParentItem

/** 項目のまとまり。label は意味のある分類が必要な場合だけ付ける */
type NavGroup = {
  label?: string
  items: readonly NavItem[]
}

type RenderLink = (link: { id: string; href: string }) => React.ReactElement

const defaultRenderLink: RenderLink = ({ href }) => <a href={href} />

function isNavParent(item: NavItem): item is NavParentItem {
  return item.children !== undefined
}

// 新しいタブやウィンドウで開く操作か（ブラウザの既定の動作に任せ、移動とみなさない）。
function isModifiedClick(event: React.MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

/** 現在地を含む項目を探す。Breadcrumb、ページの見出し、モバイルのヘッダーの表示に使う */
function findNavTrail(groups: readonly NavGroup[], currentId: string | undefined) {
  for (const group of groups) {
    for (const item of group.items) {
      if (item.id === currentId) return { group, item, child: undefined }
      const child = item.children?.find((c) => c.id === currentId)
      if (child) return { group, item, child }
    }
  }
  return undefined
}

function useNavigate(onNavigate?: (id: string, event: React.MouseEvent) => void) {
  const { isMobile, setOpenMobile } = useSidebar()
  return React.useCallback(
    (id: string, event: React.MouseEvent) => {
      if (isModifiedClick(event)) return
      onNavigate?.(id, event)
      // 移動したら、モバイルでは Sheet を閉じ、移動先のページを見せる。
      if (isMobile) setOpenMobile(false)
    },
    [isMobile, onNavigate, setOpenMobile]
  )
}

function SidebarNav({
  groups,
  currentId,
  onNavigate,
  renderLink = defaultRenderLink,
  className,
  "aria-label": ariaLabel = "メインメニュー",
  ...props
}: Omit<React.ComponentProps<"nav">, "children"> & {
  groups: readonly NavGroup[]
  /** 現在地の項目の id。製品が自分のルーターから求める */
  currentId?: string
  /** 項目を選んだとき。クライアント側のルーティングでは event.preventDefault() を呼んでから移動する */
  onNavigate?: (id: string, event: React.MouseEvent) => void
  renderLink?: RenderLink
}) {
  return (
    <nav aria-label={ariaLabel} data-slot="sidebar-nav" className={className} {...props}>
      {groups.map((group, gi) => (
        <SidebarGroup key={group.label ?? `group-${gi}`}>
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                if (!isNavParent(item))
                  return <SidebarNavItem key={item.id} item={item} currentId={currentId} onNavigate={onNavigate} renderLink={renderLink} />
                if (item.children.length > 0)
                  return <SidebarNavParent key={item.id} item={item} currentId={currentId} onNavigate={onNavigate} renderLink={renderLink} />
                // 子の項目が空の親：ページを持つ場合だけ、通常の項目として描画する
                if (item.href)
                  return (
                    <SidebarNavItem
                      key={item.id}
                      item={{ id: item.id, label: item.label, icon: item.icon, href: item.href }}
                      currentId={currentId}
                      onNavigate={onNavigate}
                      renderLink={renderLink}
                    />
                  )
                return null
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  )
}

/** 子の項目を持たない、主要な項目 */
function SidebarNavItem({
  item,
  currentId,
  onNavigate,
  renderLink = defaultRenderLink,
}: {
  item: NavLinkItem
  currentId?: string
  onNavigate?: (id: string, event: React.MouseEvent) => void
  renderLink?: RenderLink
}) {
  const navigate = useNavigate(onNavigate)
  const descriptionId = `sidebar-nav-badge${React.useId()}`
  const Icon = item.icon
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={currentId === item.id}
        render={renderLink({ id: item.id, href: item.href })}
        onClick={(e) => navigate(item.id, e)}
        tooltip={item.label}
        // badge の意味は説明（aria-describedby）で伝え、項目の名前は変えない
        aria-describedby={item.badge ? descriptionId : undefined}
      >
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
      {item.badge && (
        <>
          <SidebarMenuBadge aria-hidden="true">{item.badge}</SidebarMenuBadge>
          <span id={descriptionId} hidden>
            {item.badgeLabel}
          </span>
        </>
      )}
    </SidebarMenuItem>
  )
}

// 子が現在地のときの、展開時の親の表し方。
const parentCurrentClass = {
  "child-open": "font-medium text-sidebar-accent-foreground",
  // 面は付けない。sidebar-accent を薄めた面は、親のページ自体が現在地の面（sidebar-accent）と見分けにくい
  // （両者のコントラスト比は約 1.07）ため、文字の強調（太さ 600）だけで示す。
  "child-closed": "font-semibold text-sidebar-accent-foreground",
} as const

/** 子の項目を持つ項目（2 階層目への入り口） */
function SidebarNavParent({
  item,
  currentId,
  onNavigate,
  renderLink = defaultRenderLink,
  open: openProp,
  defaultOpen,
  onOpenChange,
}: {
  item: NavParentItem
  currentId?: string
  onNavigate?: (id: string, event: React.MouseEvent) => void
  renderLink?: RenderLink
  /** 子の項目の開閉（制御する場合） */
  open?: boolean
  /** 省略すると、現在地を含む場合に開いた状態で始める */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { state, isMobile } = useSidebar()
  const navigate = useNavigate(onNavigate)
  const subId = `sidebar-nav-sub${React.useId()}`
  const Icon = item.icon
  const children = item.children
  const collapsed = state === "collapsed" && !isMobile
  const selfActive = item.href !== undefined && currentId === item.id
  const childActive = children.some((c) => c.id === currentId)
  const containsCurrent = selfActive || childActive

  const [openState, setOpenState] = React.useState(defaultOpen ?? containsCurrent)
  const controlled = openProp !== undefined
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    if (!controlled) setOpenState(next)
    onOpenChange?.(next)
  }

  // 現在地がこのグループに入ったときに開く。グループの中で移動しても、利用者が閉じた状態は変えない。
  // 制御しない場合は描画の中で状態を合わせ、閉じた状態が一瞬表示されないようにする。
  const [prevContains, setPrevContains] = React.useState(containsCurrent)
  if (prevContains !== containsCurrent) {
    setPrevContains(containsCurrent)
    if (containsCurrent && !controlled) setOpenState(true)
  }
  // 制御する場合は、描画の後に製品へ知らせる（描画の中でほかの部品の状態を変えない）。
  const onOpenChangeRef = React.useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  const prevContainsRef = React.useRef(containsCurrent)
  React.useEffect(() => {
    if (controlled && containsCurrent && !prevContainsRef.current && !open) onOpenChangeRef.current?.(true)
    prevContainsRef.current = containsCurrent
  }, [controlled, containsCurrent, open])

  if (collapsed) {
    const entries = item.href ? [{ id: item.id, label: item.pageLabel ?? item.label, href: item.href }, ...children] : children
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <SidebarMenuButton
            render={<DropdownMenuTrigger />}
            data-nav-parent={item.id}
            data-nav-current={containsCurrent ? "collapsed" : undefined}
            // 面の色だけで伝えず、現在地を含む項目であることを aria-current="true"（集合の中の現在の項目）でも伝える。
            // 名前は変えない（名前で項目を探す操作と支援技術の読み上げを、状態で変えないため）。
            aria-current={containsCurrent ? "true" : undefined}
            className={cn(containsCurrent && "bg-sidebar-accent! font-semibold text-sidebar-accent-foreground")}
          >
            <Icon />
            <span>{item.label}</span>
          </SidebarMenuButton>
          <DropdownMenuContent side="right" align="start" sideOffset={12} className="max-w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
              {entries.map((c) => {
                const active = currentId === c.id
                return (
                  <DropdownMenuItem
                    key={c.id}
                    render={renderLink({ id: c.id, href: c.href })}
                    aria-current={active ? "page" : undefined}
                    onClick={(e) => navigate(c.id, e)}
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

  // 展開時の親の現在地の状態。親のページ自体は isActive（page）で表す。
  const childState = childActive ? (open ? "child-open" : "child-closed") : undefined
  const parentState = {
    "data-nav-current": selfActive ? "page" : childState,
    // 子を閉じているときは、子の aria-current="page" が見えないため、親に aria-current="true" を付ける。
    // 値がない場合はキーを渡さない（undefined を渡すと、isActive が付ける aria-current="page" を消すため）
    ...(childState === "child-closed" ? { "aria-current": "true" as const } : {}),
    className: childState ? parentCurrentClass[childState] : undefined,
  }

  return (
    <SidebarMenuItem>
      {item.href ? (
        <>
          <SidebarMenuButton
            isActive={selfActive}
            render={renderLink({ id: item.id, href: item.href })}
            onClick={(e) => navigate(item.id, e)}
            {...parentState}
          >
            <Icon />
            <span>{item.label}</span>
          </SidebarMenuButton>
          <SidebarMenuAction
            aria-label={`${item.label}の下の項目`}
            aria-expanded={open}
            aria-controls={open ? subId : undefined}
            onClick={() => setOpen(!open)}
          >
            <ChevronDown
              className={cn("motion-safe:transition-transform motion-safe:duration-(--duration-normal) ease-standard", open && "rotate-180")}
            />
          </SidebarMenuAction>
        </>
      ) : (
        <SidebarMenuButton aria-expanded={open} aria-controls={open ? subId : undefined} onClick={() => setOpen(!open)} {...parentState}>
          <Icon />
          <span>{item.label}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "ml-auto size-4! motion-safe:transition-transform motion-safe:duration-(--duration-normal) ease-standard",
              open && "rotate-180"
            )}
          />
        </SidebarMenuButton>
      )}
      {open && (
        <SidebarMenuSub id={subId}>
          {children.map((c) => (
            <SidebarMenuSubItem key={c.id}>
              <SidebarMenuSubButton
                isActive={currentId === c.id}
                render={renderLink({ id: c.id, href: c.href })}
                onClick={(e) => navigate(c.id, e)}
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

export {
  SidebarNav,
  SidebarNavItem,
  SidebarNavParent,
  findNavTrail,
  isNavParent,
  type NavChildItem,
  type NavGroup,
  type NavItem,
  type NavLinkItem,
  type NavParentItem,
  type RenderLink,
}
