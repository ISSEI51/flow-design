"use client"

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { PanelLeft } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { Button, type ButtonProps } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Flow Design Sidebar
// shadcn/ui（Base UI 版）の Sidebar と同じ名前と構造（SidebarProvider、Sidebar の side / variant / collapsible、
// SidebarHeader、SidebarContent、SidebarGroup、SidebarMenu、SidebarMenuButton の isActive、SidebarFooter、
// SidebarTrigger、SidebarRail、SidebarInset、useSidebar など）。Flow Design では次を変えている。
// - 幅は展開時 240px、折りたたみ時 64px。背景は sidebar（薄いニュートラル）で、メインとの境界線は引かない。
// - 項目は高さ 44px（タッチ操作では 48px）、角丸 8px、文字 14px、アイコン 20px、アイコンと文字の間 12px、
//   内側の余白 12px。ホバー、押下、現在位置、フォーカス、無効を区別する。
// - 現在位置（isActive）は、薄いニュートラルの面（sidebar-accent）、foreground の文字とアイコン、太さ 600 で示し、
//   aria-current="page" を付ける。ブランドカラーの塗りと、左側の線は使わない。
// - 開閉の状態を cookie に保存しない。保存が必要な製品は、open と onOpenChange で状態を受け取り、
//   製品の方法で保存する。ルーティングのライブラリにも依存しない。
// - 折りたたみは 320ms（--duration-layout）の幅の transition。動きを減らす設定では 0ms になる。
//   中身は開閉の時点で配置を切り替え、幅の変化の途中で文字が折り返し直さないようにする。
// - 折りたたみ時は、項目の名前を視覚的に隠し、アクセシブルな名前として残す。tooltip を指定すると、
//   折りたたみ時だけ項目の名前を Tooltip（Feedback Components、表示まで 700ms）で表示する。
// - モバイル（768px 未満）では常に表示せず、SidebarTrigger で Sheet として開く。
// - キーボードの Ctrl / ⌘ + B で開閉する。keyboardShortcut で変更でき、false で無効にできる。
//   入力欄の中、IME の変換中、キーの長押し、他の処理が preventDefault() した操作、Sidebar 以外の Overlay の中では反応しない。
//   SidebarProvider が複数ある場合は、フォーカスのある Sidebar だけが反応する。フォーカスがどの Sidebar にもない場合は、
//   ショートカットが有効な最初の Sidebar だけが反応する。
// - サーバーでの描画では window と document を参照しない。useIsMobile のサーバーでの値は false（デスクトップ）で、
//   ブラウザで描画し直したときにモバイルの表示に切り替わる。
// 定義は docs/web/components/sidebar.md を参照。

const SIDEBAR_WIDTH = "15rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "4rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  /** SidebarTrigger の aria-controls が指す、Sidebar の本体の id */
  sidebarId: string
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider.")
  return context
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest("[role=textbox],[role=combobox],[role=searchbox]") !== null
  )
}

// Sidebar 以外の Overlay（Dialog、メニューなど）の中の操作か。モバイルの Sidebar 自身の Sheet は除く。
function isInOtherOverlay(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const overlay = target.closest("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]")
  return overlay !== null && overlay.closest("[data-sidebar=sidebar]") === null
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  keyboardShortcut = SIDEBAR_KEYBOARD_SHORTCUT,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Ctrl / ⌘ と組み合わせて開閉するキー（KeyboardEvent.key、大文字と小文字は区別しない）。false で無効にする */
  keyboardShortcut?: string | false
}) {
  const isMobile = useIsMobile()
  const sidebarId = React.useId()
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const [openMobile, setOpenMobile] = React.useState(false)

  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  // 同じ描画の中で続けて呼ばれても、最新の状態から計算する。
  const openRef = React.useRef(open)
  openRef.current = open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(openRef.current) : value
      openRef.current = openState
      if (setOpenProp) setOpenProp(openState)
      else _setOpen(openState)
    },
    [setOpenProp]
  )

  // デスクトップの幅になったら、モバイルの Sheet を閉じた状態に戻す。再びモバイルの幅になったときに、
  // 操作していない Sheet が開かないようにするため。
  React.useEffect(() => {
    if (!isMobile) setOpenMobile(false)
  }, [isMobile])

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((o) => !o) : setOpen((o) => !o)
  }, [isMobile, setOpen])

  React.useEffect(() => {
    if (keyboardShortcut === false) return
    const key = keyboardShortcut.toLowerCase()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.defaultPrevented ||
        event.isComposing ||
        event.key.toLowerCase() !== key ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        isEditable(event.target) ||
        isInOtherOverlay(event.target)
      )
        return
      // 複数の Sidebar があるときに、同時に開閉しないようにする。
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const target = event.target instanceof Element ? event.target : null
      const owner =
        target?.closest("[data-slot=sidebar-wrapper]") ??
        // モバイルの Sheet はポータルで body の直下に描画されるため、id で持ち主をたどる。
        (target?.closest("[data-sidebar=sidebar][data-sidebar-id]")
          ? document.querySelector(
              `[data-slot=sidebar-wrapper][data-sidebar-id="${target.closest("[data-sidebar-id]")!.getAttribute("data-sidebar-id")}"]`
            )
          : null) ??
        document.querySelector("[data-slot=sidebar-wrapper][data-keyboard-shortcut]")
      if (owner !== wrapper) return
      event.preventDefault()
      toggleSidebar()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar, keyboardShortcut])

  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({ sidebarId, state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar }),
    [sidebarId, state, open, setOpen, isMobile, openMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        ref={wrapperRef}
        data-slot="sidebar-wrapper"
        data-sidebar-id={sidebarId}
        data-keyboard-shortcut={keyboardShortcut === false ? undefined : keyboardShortcut}
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn("group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "icon",
  className,
  children,
  mobileTitle = "メニュー",
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  /** sidebar が標準。floating と inset は shadcn/ui との互換のため */
  variant?: "sidebar" | "floating" | "inset"
  /** 折りたたみの方法。Flow Design の既定は icon（アイコンだけを残す） */
  collapsible?: "offcanvas" | "icon" | "none"
  /** モバイルで Sheet として開いたときの名前（支援技術に伝える） */
  mobileTitle?: string
}) {
  const { isMobile, state, openMobile, setOpenMobile, sidebarId } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        id={sidebarId}
        data-slot="sidebar"
        className={cn("flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground", className)}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side={side}
          size="sm"
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          data-sidebar-id={sidebarId}
          id={sidebarId}
          closeLabel={`${mobileTitle}を閉じる`}
          {...(props as Omit<React.ComponentProps<typeof SheetContent>, "side" | "size">)}
          className={cn(
            "bg-sidebar p-0 text-sidebar-foreground",
            "data-[side=left]:w-(--sidebar-width) data-[side=right]:w-(--sidebar-width)",
            "data-[side=left]:data-[size=sm]:max-w-[calc(100vw-3rem)] data-[side=right]:data-[size=sm]:max-w-[calc(100vw-3rem)]",
            className
          )}
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE, ...props.style } as React.CSSProperties}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{mobileTitle}</SheetTitle>
            <SheetDescription>主要な機能へ移動する</SheetDescription>
          </SheetHeader>
          <div
            className={cn(
              "flex h-full w-full min-h-0 flex-col",
              "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
              side === "left" ? "pl-[env(safe-area-inset-left)]" : "pr-[env(safe-area-inset-right)]"
            )}
          >
            {children}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="group/sidebar peer hidden shrink-0 text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      <div
        id={sidebarId}
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "sticky top-0 flex h-svh w-(--sidebar-width) overflow-hidden bg-sidebar",
          "transition-[width,visibility] duration-(--duration-layout) ease-standard",
          "group-data-[collapsible=icon]/sidebar:w-(--sidebar-width-icon)",
          "group-data-[collapsible=offcanvas]/sidebar:invisible group-data-[collapsible=offcanvas]/sidebar:w-0",
          variant === "floating" && "m-2 h-[calc(100svh-1rem)] rounded-xl border border-sidebar-border",
          variant === "inset" && "bg-transparent",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex h-full w-(--sidebar-width) shrink-0 flex-col group-data-[collapsible=icon]/sidebar:w-(--sidebar-width-icon)"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  "aria-label": ariaLabel,
  ...props
}: Omit<ButtonProps, "size" | "aria-label" | "aria-labelledby" | "children"> & { "aria-label"?: string }) {
  const { toggleSidebar, isMobile, open, openMobile, sidebarId } = useSidebar()
  // 名前は状態で変えず、開閉の状態は aria-expanded で伝える。
  const label = ariaLabel ?? "メニュー"
  const expanded = isMobile ? openMobile : open
  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-expanded={expanded}
      // モバイルの Sheet は開いている間だけ DOM にあるため、そのときだけ関連付ける。
      aria-controls={!isMobile || openMobile ? sidebarId : undefined}
      aria-haspopup={isMobile ? "dialog" : undefined}
      className={cn("pointer-coarse:size-12", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeft className="rtl:rotate-180" />
    </Button>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar, open } = useSidebar()
  const label = open ? "メニューを折りたたむ" : "メニューを展開する"
  return (
    <button
      type="button"
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label={label}
      // ポインター操作だけの補助。キーボードと支援技術には SidebarTrigger を使ってもらう。
      aria-hidden="true"
      tabIndex={-1}
      onClick={toggleSidebar}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-2 sm:flex",
        "after:absolute after:inset-y-0 after:w-0.5 after:transition-colors after:duration-(--duration-fast) hover:after:bg-sidebar-border",
        "group-data-[side=left]/sidebar:right-0 group-data-[side=left]/sidebar:after:right-0",
        "group-data-[side=right]/sidebar:left-0 group-data-[side=right]/sidebar:after:left-0",
        "group-data-[side=left]/sidebar:cursor-w-resize group-data-[side=right]/sidebar:cursor-e-resize",
        "group-data-[side=left]/sidebar:group-data-[state=collapsed]/sidebar:cursor-e-resize",
        "group-data-[side=right]/sidebar:group-data-[state=collapsed]/sidebar:cursor-w-resize",
        className
      )}
      {...props}
    />
  )
}

// 主要な内容の領域。既定は <main>。プレビューのように、すでに <main> がある中に置く場合は render で変える。
function SidebarInset({ className, render, ...props }: useRender.ComponentProps<"main">) {
  return useRender({
    defaultTagName: "main",
    props: mergeProps<"main">(
      {
        className: cn(
          "relative flex w-full min-w-0 flex-1 flex-col bg-background",
          "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl",
          "md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "sidebar-inset" },
  })
}

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("w-full bg-background group-data-[collapsible=icon]/sidebar:hidden", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-3 group-data-[close-button]/sheet-content:pr-16", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("mt-auto flex flex-col gap-2 p-3", className)}
      {...props}
    />
  )
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-3 w-auto bg-sidebar-border", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:thin]",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col px-3 py-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex h-8 shrink-0 items-center overflow-hidden rounded-sm px-3 text-caption font-medium whitespace-nowrap text-muted-foreground",
          "transition-opacity duration-(--duration-fast) ease-standard outline-none focus-visible:focus-ring",
          // 折りたたみ時も高さを残し、アイコンの縦の位置を変えない。
          "group-data-[collapsible=icon]/sidebar:opacity-0 group-data-[collapsible=icon]/sidebar:select-none",
          "[&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "sidebar-group-label", sidebar: "group-label" },
  })
}

function SidebarGroupAction({ className, render, ...props }: useRender.ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-2 right-3 flex size-8 items-center justify-center rounded-sm text-muted-foreground",
          "transition-[color,background-color] duration-(--duration-fast) ease-standard",
          "hover:bg-[color-mix(in_srgb,var(--sidebar-accent)_50%,var(--sidebar))] hover:text-sidebar-accent-foreground",
          "outline-none focus-visible:focus-ring group-data-[collapsible=icon]/sidebar:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          className
        ),
        type: buttonType(render),
        onClickCapture: isAriaDisabled(props, render) ? preventDisabled : undefined,
      },
      props
    ),
    render,
    state: { slot: "sidebar-group-action", sidebar: "group-action" },
  })
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-group-content" data-sidebar="group-content" className={cn("w-full", className)} {...props} />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

// aria-disabled の項目は、フォーカスできるまま実行を止める。
// render に渡した要素の onClick も止めるため、キャプチャの段階で止める。
function isAriaDisabled(props: { "aria-disabled"?: unknown }, render: unknown) {
  const own = props["aria-disabled"]
  const fromRender = React.isValidElement<{ "aria-disabled"?: unknown }>(render) ? render.props["aria-disabled"] : undefined
  return [own, fromRender].some((v) => v === true || v === "true")
}

function preventDisabled(event: React.MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
}

// 既定で <button> を描画する部品は type="button" にし、フォームの中で送信しないようにする。
const buttonType = (render: unknown) => (render ? undefined : ("button" as const))

// 項目の状態。ホバーは sidebar-accent を sidebar に半分混ぜた面、押下と現在位置は sidebar-accent の面。
// 現在位置は、さらに文字とアイコンを foreground にし、太さを 600 にする。
const itemState = [
  "text-muted-foreground transition-[color,background-color] duration-(--duration-fast) ease-standard",
  // 現在位置の項目は、ホバーしても現在位置の面のままにする。
  "hover:not-aria-disabled:not-data-active:bg-[color-mix(in_srgb,var(--sidebar-accent)_50%,var(--sidebar))] hover:not-aria-disabled:text-sidebar-accent-foreground",
  "active:not-aria-disabled:bg-sidebar-accent",
  "data-active:bg-sidebar-accent data-active:font-semibold data-active:text-sidebar-accent-foreground",
  "outline-none focus-visible:focus-ring",
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
]

const sidebarMenuButtonVariants = cva(
  [
    "peer/menu-button group/menu-button flex w-full min-w-0 items-center gap-3 rounded-sm px-3 py-2 text-left text-ui",
    "[word-break:auto-phrase] select-none",
    "min-h-11 pointer-coarse:min-h-12",
    ...itemState,
    "[&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
    "[&>span]:min-w-0 [&>span]:flex-1",
    "group-has-data-[sidebar=menu-action]/menu-item:pr-12 group-has-data-[sidebar=menu-badge]/menu-item:pr-12",
    // 折りたたみ時：アイコンだけを中央に置き、名前は視覚的に隠してアクセシブルな名前として残す。
    "group-data-[collapsible=icon]/sidebar:w-10 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0",
    "group-data-[collapsible=icon]/sidebar:[&>span]:sr-only",
  ],
  {
    variants: {
      variant: {
        default: "",
        outline: "bg-background shadow-[0_0_0_1px_var(--sidebar-border)]",
      },
      size: {
        default: "",
        sm: "min-h-10 pointer-coarse:min-h-12",
        lg: "min-h-12 group-data-[collapsible=icon]/sidebar:min-h-12",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> & {
  /** 現在位置。aria-current="page" を付ける */
  isActive?: boolean
  /** 折りたたみ時に表示する Tooltip。名前は項目の文字で伝わるため、Tooltip は視覚的な補助として使う */
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar()
  const comp = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(sidebarMenuButtonVariants({ variant, size }), className),
        "aria-current": isActive ? "page" : undefined,
        type: buttonType(render),
        onClickCapture: isAriaDisabled(props, render) ? preventDisabled : undefined,
      },
      props
    ),
    render: tooltip ? <TooltipTrigger render={render} /> : render,
    state: { slot: "sidebar-menu-button", sidebar: "menu-button", size, active: isActive },
  })

  if (!tooltip) return comp

  const content = typeof tooltip === "string" ? { children: tooltip } : tooltip
  return (
    // 展開時とモバイルでは、名前が見えているため表示しない。
    <Tooltip disabled={state !== "collapsed" || isMobile}>
      {comp}
      <TooltipContent side="right" align="center" {...content} />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> & { showOnHover?: boolean }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-1.5 right-1 flex size-8 items-center justify-center rounded-sm text-muted-foreground",
          "transition-[color,background-color,opacity] duration-(--duration-fast) ease-standard",
          "hover:bg-sidebar-accent group-hover/menu-item:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground",
          "outline-none focus-visible:focus-ring group-data-[collapsible=icon]/sidebar:hidden",
          // タッチ操作では 40px にする（項目の高さ 48px の中に収める）。
          "pointer-coarse:top-1 pointer-coarse:right-0 pointer-coarse:size-10 [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100 pointer-fine:opacity-0",
          className
        ),
        type: buttonType(render),
        onClickCapture: isAriaDisabled(props, render) ? preventDisabled : undefined,
      },
      props
    ),
    render,
    state: { slot: "sidebar-menu-action", sidebar: "menu-action" },
  })
}

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute top-1/2 right-3 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-xs px-1",
        "text-caption font-medium text-muted-foreground tabular-nums select-none",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground group-data-[collapsible=icon]/sidebar:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & { showIcon?: boolean }) {
  // 文字の幅は、項目の順番に応じて 3 つの固定値（70%、55%、85%）を繰り返す。
  // shadcn/ui は Math.random() を使うが、サーバーとブラウザで値が変わり、Hydration の不一致になるため使わない。
  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex min-h-11 items-center gap-3 rounded-sm px-3", className)}
      {...props}
    >
      {showIcon && <Skeleton className="size-5 rounded-xs" data-sidebar="menu-skeleton-icon" />}
      <Skeleton
        className={cn(
          "h-4 max-w-[70%] flex-1 rounded-xs group-data-[collapsible=icon]/sidebar:hidden",
          "[li:nth-child(3n+2)>*>&]:max-w-[55%] [li:nth-child(3n)>*>&]:max-w-[85%]"
        )}
        data-sidebar="menu-skeleton-text"
      />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        // 親の項目の文字の位置（余白 12px + アイコン 20px + 間 12px）に、子の項目の文字をそろえる。
        "mt-1 flex min-w-0 flex-col gap-1 pl-8 group-data-[collapsible=icon]/sidebar:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> & {
  size?: "sm" | "md"
  /** 現在位置。aria-current="page" を付ける */
  isActive?: boolean
}) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "flex w-full min-w-0 items-center gap-3 rounded-sm px-3 py-2 text-ui [word-break:auto-phrase] select-none",
          "min-h-11 pointer-coarse:min-h-12 data-[size=sm]:min-h-10 pointer-coarse:data-[size=sm]:min-h-12",
          ...itemState,
          "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          className
        ),
        "aria-current": isActive ? "page" : undefined,
        onClickCapture: isAriaDisabled(props, render) ? preventDisabled : undefined,
      },
      props
    ),
    render,
    state: { slot: "sidebar-menu-sub-button", sidebar: "menu-sub-button", size, active: isActive },
  })
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  sidebarMenuButtonVariants,
  useSidebar,
}
