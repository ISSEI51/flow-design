import * as React from "react"
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete"
import { Search } from "lucide-react"

import { ComboboxStatus } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { searchItemFilter } from "@/lib/search"
import { cn } from "@/lib/utils"

// Flow Design Command
// アプリケーションの機能、ページ、情報へ素早く移動する。shadcn/ui の Command と同じ部品名を使う
// （Command、CommandDialog、CommandInput、CommandList、CommandEmpty、CommandGroup、CommandItem、
// CommandSeparator、CommandShortcut）。
// shadcn/ui は cmdk を使うが、cmdk は Radix UI に依存する。Flow Design は Base UI の Autocomplete（inline）と
// Flow Design の Dialog で組み立て、依存パッケージを増やさない。
// - 中央の Dialog（最大幅 640px、角丸 20px、背景と開閉は Dialog と同じ）で表示する
// - 開くと検索欄にフォーカスし、↑↓ で候補を移動、Enter で実行、Escape で閉じる。閉じるとフォーカスを戻す
// - 実行の処理（ページの移動など）は CommandItem の onSelect で製品が行う。ルーティングのライブラリに依存しない
// - 権限のない操作は items に含めない。危険な操作は onSelect で Alert Dialog を開き、直接実行しない
// 定義は docs/web/components/command.md を参照。

type CommandItemData = {
  value: string
  label: string
  /** 別名や関連キーワード。検索の対象になる。 */
  keywords?: readonly string[]
}

type CommandGroupData<T extends CommandItemData = CommandItemData> = { value: string; label: string; items: T[] }

// Autocomplete.Root の props は、items がグループの配列か項目の配列かで型が分かれる。
// Command はどちらも受け取るため、内部では型の分岐を外して渡す（公開する props の型は Root.Props のまま）。
const AutocompleteRoot = AutocompletePrimitive.Root as unknown as React.ComponentType<Record<string, unknown>>

/**
 * Base UI の Autocomplete を inline で常に開いた状態で使う。
 * items にはグループの配列（{ value, label, items }）か、項目の配列を渡す。
 * filter を指定しないときは、項目の label と keywords の部分一致で絞り込む。サーバー側で検索するときは filter={null}。
 */
function Command<Item extends CommandItemData = CommandItemData>({
  className,
  children,
  filter = searchItemFilter,
  ...props
}: Omit<AutocompletePrimitive.Root.Props<Item>, "inline" | "open"> & { className?: string }) {
  return (
    <AutocompleteRoot
      inline
      open
      autoHighlight="always"
      keepHighlight
      filter={filter}
      itemToStringValue={(item: Item) => item.label}
      {...props}
    >
      <div
        data-slot="command"
        className={cn("flex min-h-0 w-full flex-col overflow-hidden bg-popover text-popover-foreground", className)}
      >
        {children}
      </div>
    </AutocompleteRoot>
  )
}

/**
 * Dialog の中に Command を置く。Dialog の size="lg"（最大幅 640px）を使い、余白は Command の各部分が持つ。
 * タイトルと説明は、画面には表示せず支援技術に伝える。
 */
function CommandDialog({
  title = "コマンド",
  description = "ページ、操作、設定を検索して実行します。↑↓ で選び、Enter で実行します。",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  children?: React.ReactNode
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        size="lg"
        showCloseButton={showCloseButton}
        data-slot="command-dialog"
        className={cn("h-[min(30rem,calc(100dvh-2rem))] gap-0 overflow-hidden p-0", className)}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  )
}

// 検索欄。高さ 56px、文字 16px。下に区切りの線を引く。
function CommandInput({ className, "aria-label": ariaLabel = "検索", ...props }: AutocompletePrimitive.Input.Props) {
  return (
    <div data-slot="command-input-wrapper" className="flex shrink-0 items-center gap-3 border-b border-border px-5">
      <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <AutocompletePrimitive.Input
        data-slot="command-input"
        aria-label={ariaLabel}
        autoComplete="off"
        className={cn(
          "h-14 w-full min-w-0 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      data-slot="command-list"
      className={cn("min-h-0 flex-1 scroll-py-2 overflow-y-auto overscroll-contain p-2 outline-none data-empty:hidden", className)}
      {...props}
    />
  )
}

function CommandEmpty({ className, ...props }: AutocompletePrimitive.Empty.Props) {
  return (
    <AutocompletePrimitive.Empty
      data-slot="command-empty"
      className={cn("px-5 text-center text-ui text-muted-foreground empty:hidden not-empty:py-10", className)}
      {...props}
    />
  )
}

/** 意味のあるまとまり（ページ、操作、設定など）。heading は 12px の見出し。 */
function CommandGroup({
  className,
  heading,
  children,
  ...props
}: AutocompletePrimitive.Group.Props & { heading?: React.ReactNode }) {
  return (
    <AutocompletePrimitive.Group data-slot="command-group" className={cn("py-1", className)} {...props}>
      {heading && (
        <AutocompletePrimitive.GroupLabel data-slot="command-group-heading" className="px-3 pt-2 pb-1 text-caption text-muted-foreground">
          {heading}
        </AutocompletePrimitive.GroupLabel>
      )}
      {children}
    </AutocompletePrimitive.Group>
  )
}

function CommandCollection(props: AutocompletePrimitive.Collection.Props) {
  return <AutocompletePrimitive.Collection data-slot="command-collection" {...props} />
}

/**
 * 候補。高さ 48px 以上、文字 14px、アイコン 20px。選んでいる候補の面は accent。
 * onSelect は、押したときと Enter のときに呼ばれる（shadcn/ui の CommandItem と同じ名前）。
 */
function CommandItem({
  className,
  onSelect,
  onClick,
  ...props
}: AutocompletePrimitive.Item.Props & { onSelect?: () => void }) {
  return (
    <AutocompletePrimitive.Item
      data-slot="command-item"
      onClick={(e) => {
        onClick?.(e)
        onSelect?.()
      }}
      className={cn(
        "relative flex min-h-12 w-full cursor-default items-center gap-3 rounded-md px-3 py-2 text-ui text-foreground outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5 [&>svg]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({ className, ...props }: AutocompletePrimitive.Separator.Props) {
  return (
    <AutocompletePrimitive.Separator
      data-slot="command-separator"
      className={cn("pointer-events-none -mx-2 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

/** 候補の右に表示するキーボードショートカット。表示だけで、キーの処理はしない。 */
function CommandShortcut({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="command-shortcut"
      className={cn("ml-auto font-sans text-caption tracking-widest text-muted-foreground", className)}
      {...props}
    />
  )
}

/** 読み込み中と取得失敗の表示。Combobox の ComboboxStatus と同じ。 */
const CommandStatus = ComboboxStatus

// ---- 起動のショートカット

function isMac() {
  if (typeof navigator === "undefined") return false
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform
  return /mac|iphone|ipad/i.test(platform)
}

/** ショートカットの表示。macOS は「⌘K」、それ以外は「Ctrl+K」。 */
function commandShortcutLabel(key = "k") {
  return isMac() ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`
}

/**
 * Cmd + K（macOS）、Ctrl + K（Windows、Linux）で onTrigger を呼ぶ。
 * - enabled を false にすると登録しない。key で別のキーに変えられる
 * - IME の変換中（isComposing）と、Shift・Alt を併用したときは反応しない
 * - 一致したときだけ preventDefault する。ほかのショートカットには干渉しない
 */
function useCommandShortcut(onTrigger: () => void, { key = "k", enabled = true }: { key?: string; enabled?: boolean } = {}) {
  const ref = React.useRef(onTrigger)
  ref.current = onTrigger
  React.useEffect(() => {
    if (!enabled) return
    const mac = isMac()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return
      if (e.key.toLowerCase() !== key.toLowerCase() || e.shiftKey || e.altKey) return
      if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return
      e.preventDefault()
      ref.current()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [key, enabled])
}

export {
  Command,
  CommandCollection,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  CommandStatus,
  commandShortcutLabel,
  useCommandShortcut,
}
export type { CommandGroupData, CommandItemData }
