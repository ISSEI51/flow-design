"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { Check, ChevronDown, CircleAlert, LoaderCircle, Plus, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { searchItemFilter } from "@/lib/search"
import { cn } from "@/lib/utils"

// Flow Design Combobox
// 検索付きの単一選択。shadcn/ui（Base UI 版）の Combobox と同じ部品名を使う。
// shadcn/ui は入力欄そのものを検索欄にするが、Flow Design は Base UI の「Input inside popup」の構成を標準にする。
// - 閉じた状態は Select と同じ外観で、確定済みの値を表示する（ComboboxTrigger + ComboboxValue）
// - 開くとメニューの中の検索欄（ComboboxInput）にフォーカスが移る
// - 検索文字列（inputValue）と確定済みの値（value）を別々に持つ。文字を入力しただけでは値は変わらない
// - Escape、外側のクリックで閉じると、検索文字列を破棄する。確定済みの値は残る
// アクセシビリティの構造は Base UI が担う。トリガーが role="combobox" のフォームの部品になり、
// 検索欄は aria-controls と aria-activedescendant で選択肢の一覧（role="listbox"）を操作する。
// 定義は docs/web/components/combobox.md を参照。

/**
 * Base UI の Combobox.Root。filter を指定しないときは、項目の label と keywords の部分一致で絞り込む
 * （大文字と小文字、全角と半角、カタカナとひらがなを区別しない）。
 * サーバー側で検索するときは filter={null} にする。
 */
function Combobox<Value, Multiple extends boolean | undefined = false>(
  props: ComboboxPrimitive.Root.Props<Value, Multiple>
) {
  // 読み取り専用のときは開かない。値は欄で確認できる。
  return <ComboboxPrimitive.Root filter={searchItemFilter} {...props} open={props.readOnly ? false : props.open} />
}

// キー操作のハイライト（docs/web/components/overlays.md の「キー操作のハイライト」）。
// 検索欄にフォーカスを残したまま aria-activedescendant で選択肢を移るため、:focus-visible は選択肢に一致しない。
// そこで data-highlighted に項目の内側の focus-ring を付け、ポインターを動かしている間は Popup の data-pointer で消す。
const keyHighlight = cn(
  "data-highlighted:focus-ring [--focus-ring-offset:calc(var(--focus-ring-width)*-1)]",
  "[[data-pointer]_&]:data-highlighted:outline-none"
)

// ポインターを動かしている間は data-pointer を付け、キーを押したら外す（Select、Dropdown Menu と同じ）。
// 矢印キーは検索欄で Base UI が処理し、Popup まで伝わらない場合があるため、キャプチャの段階で受け取る。
const pointerHandlers = <T extends HTMLElement>(onPointerMove?: React.PointerEventHandler<T>) => ({
  onPointerMove: (event: React.PointerEvent<T>) => {
    event.currentTarget.setAttribute("data-pointer", "")
    onPointerMove?.(event)
  },
  onKeyDownCapture: (event: React.KeyboardEvent<T>) => {
    event.currentTarget.removeAttribute("data-pointer")
  },
})

// Select の SelectTrigger と同じ外観。閉じた状態では、Select と見分けが付かないようにする。
const triggerClassName = cn(
  "group/combobox flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-4 py-2 text-left text-body text-foreground select-none",
  "min-h-control",
  "transition-[color,background-color,border-color] duration-(--duration-fast) ease-standard",
  "outline-none focus-visible:focus-ring",
  "data-placeholder:text-muted-foreground",
  "data-disabled:cursor-not-allowed data-disabled:opacity-50",
  "data-readonly:bg-muted",
  "aria-invalid:border-destructive data-invalid:border-destructive",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0"
)

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger data-slot="combobox-trigger" className={cn(triggerClassName, className)} {...props}>
      {children}
      <ComboboxPrimitive.Icon
        data-slot="combobox-icon"
        className="flex text-muted-foreground transition-transform duration-(--duration-normal) ease-standard motion-safe:group-data-popup-open/combobox:rotate-180"
      >
        <ChevronDown className="size-5" />
      </ComboboxPrimitive.Icon>
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxValue({ className, ...props }: ComboboxPrimitive.Value.Props & { className?: string }) {
  return (
    <span data-slot="combobox-value" className={cn("min-w-0 flex-1 text-left [word-break:auto-phrase]", className)}>
      <ComboboxPrimitive.Value {...props} />
    </span>
  )
}

// メニュー。角丸、影、開閉の動きは SelectContent と同じ。高さは画面の空きと 24rem（384px）の小さい方。
// 重なり順：z-50（浮かぶ要素の層）。後から開いたモーダル（Dialog、Alert Dialog など）の外側に残った場合は、
// Base UI がモーダルの外側の要素に付ける data-base-ui-inert の下に入るため、モーダルの層（z-40）に下げる（Select、Popover と同じ）。
// DOM の順で新しいモーダルの背面に入り、押せなくなる。Multi Select もこの部品を使う。
function ComboboxContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  onPointerMove,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        collisionPadding={8}
        className="isolate z-50 outline-none in-[[data-base-ui-inert]]:z-40"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "group/combobox-content relative flex max-h-[min(var(--available-height),24rem)] w-(--anchor-width) max-w-(--available-width) min-w-64 flex-col overflow-hidden",
            "rounded-xl border border-border bg-popover text-popover-foreground shadow-menu outline-none",
            "origin-(--transform-origin) transition-[opacity,scale] duration-(--duration-normal) ease-enter",
            "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:ease-exit",
            "motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95",
            className
          )}
          {...pointerHandlers(onPointerMove)}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

// メニューの中の検索欄。高さ 40px、文字 16px（iOS の Safari がフォーカス時に拡大しない大きさ）。
// アクセシブルな名前は aria-label で渡す（既定は「検索」）。
// Base UI は Field の中で、検索欄にも Field のラベル（aria-labelledby）を付ける。aria-labelledby は aria-label より
// 優先されるため、検索欄の名前を表す要素を置いて参照させ、トリガー（「取引先」）と検索欄（「取引先を検索」）を区別する。
function ComboboxInput({
  className,
  "aria-label": ariaLabel = "検索",
  ...props
}: ComboboxPrimitive.Input.Props) {
  const labelId = React.useId()
  return (
    <div data-slot="combobox-input-wrapper" className="relative shrink-0 p-2 pb-0">
      <span id={labelId} hidden>
        {ariaLabel}
      </span>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-[calc(50%-4px)] text-muted-foreground" />
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        aria-labelledby={labelId}
        autoComplete="off"
        className={cn(
          "h-10 w-full min-w-0 rounded-md border border-input bg-background pr-3 pl-10 text-body text-foreground",
          "outline-none placeholder:text-muted-foreground focus-visible:focus-ring",
          className
        )}
        {...props}
      />
    </div>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("min-h-0 flex-1 scroll-py-2 overflow-y-auto overscroll-contain p-2 outline-none data-empty:hidden", className)}
      {...props}
    />
  )
}

// 選択中の太さは aria-selected で指定する（multi-select.tsx の MultiSelectItem の説明を参照）。
function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex min-h-10 w-full cursor-default items-center rounded-md py-2 pr-10 pl-3 text-body outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        keyHighlight,
        "aria-selected:font-medium",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 whitespace-normal [word-break:auto-phrase]">{children}</span>
      <ComboboxPrimitive.ItemIndicator
        data-slot="combobox-item-indicator"
        className="pointer-events-none absolute right-3 flex items-center"
      >
        <Check className="size-5" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

// 新しい項目を追加する、明示的な操作。製品が新規作成を許可する場合だけ置く。
// value には既存の選択肢と重ならない値を渡し、選ばれたときの登録処理と権限の確認は製品が行う。
function ComboboxCreateItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-create-item"
      className={cn(
        "relative flex min-h-10 w-full cursor-default items-center gap-2 rounded-md py-2 pr-3 pl-3 text-body outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        keyHighlight,
        className
      )}
      {...props}
    >
      <Plus aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 [word-break:auto-phrase]">{children}</span>
    </ComboboxPrimitive.Item>
  )
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" className={cn("py-1", className)} {...props} />
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("px-3 py-1 text-caption text-muted-foreground", className)}
      {...props}
    />
  )
}

function ComboboxCollection(props: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("pointer-events-none -mx-2 my-2 h-px bg-border", className)}
      {...props}
    />
  )
}

// 絞り込んだ結果が 0 件のときだけ表示する。
function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-5 text-ui text-muted-foreground empty:hidden not-empty:py-6", className)}
      {...props}
    />
  )
}

// ---- サーバー側の検索

type ComboboxSearchStatus = "idle" | "loading" | "success" | "error"

/**
 * サーバー側の検索の状態を管理する。Combobox と Multi Select の onInputValueChange に onQueryChange を渡す。
 * - 入力が止まってから debounce（既定 300ms）後に search を呼ぶ
 * - 新しい検索を始めると、前の検索の AbortSignal を中断し、古い結果で上書きしない
 * - 日本語 IME の変換中は、Base UI が onInputValueChange を呼ばない。確定した文字列で検索する
 * - 読み込み中（loading）、結果あり・なし（success）、取得失敗（error）を区別する
 * 検索の方法と API の通信は search に渡す。この hook は項目を生成しない。
 */
function useComboboxSearch<T>({
  search,
  debounce = 300,
  minLength = 1,
}: {
  search: (query: string, signal: AbortSignal) => Promise<T[]>
  debounce?: number
  /** この文字数より短いときは検索しない（status は idle） */
  minLength?: number
}) {
  const [query, setQuery] = React.useState("")
  const [items, setItems] = React.useState<T[]>([])
  const [status, setStatus] = React.useState<ComboboxSearchStatus>("idle")
  const [error, setError] = React.useState<unknown>(null)
  const [attempt, setAttempt] = React.useState(0)
  const searchRef = React.useRef(search)
  searchRef.current = search

  React.useEffect(() => {
    const q = query.trim()
    if (q.length < minLength) {
      setStatus("idle")
      setItems([])
      return
    }
    setStatus("loading")
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchRef.current(q, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return
          setItems(result)
          setError(null)
          setStatus("success")
        },
        (e) => {
          if (controller.signal.aborted) return
          setError(e)
          setStatus("error")
        }
      )
    }, debounce)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, debounce, minLength, attempt])

  const onQueryChange = React.useCallback((value: string) => setQuery(value), [])
  const retry = React.useCallback(() => setAttempt((n) => n + 1), [])
  return { query, onQueryChange, items, status, error, retry }
}

/**
 * 検索の状態の表示。読み込み中、取得失敗、入力前の案内を、結果なし（ComboboxEmpty）と区別して示す。
 * Base UI の Combobox.Status（role="status"）で、状態の変化を支援技術に伝える。
 */
function ComboboxStatus({
  status,
  idleMessage,
  loadingMessage = "検索しています",
  errorMessage = "検索結果を取得できませんでした。",
  onRetry,
  retryLabel = "再試行",
  className,
}: {
  status: ComboboxSearchStatus
  idleMessage?: React.ReactNode
  loadingMessage?: React.ReactNode
  errorMessage?: React.ReactNode
  onRetry?: () => void
  retryLabel?: string
  className?: string
}) {
  return (
    <ComboboxPrimitive.Status
      data-slot="combobox-status"
      data-status={status}
      className={cn("text-ui text-muted-foreground empty:hidden", className)}
    >
      {status === "loading" && (
        <div className="flex items-center gap-2 px-5 py-6">
          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
          {loadingMessage}
        </div>
      )}
      {status === "error" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 text-destructive">
          <span className="flex items-start gap-2">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {errorMessage}
          </span>
          {onRetry && (
            <Button variant="outline" size="xs" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
        </div>
      )}
      {status === "idle" && idleMessage && <div className="px-5 py-6">{idleMessage}</div>}
    </ComboboxPrimitive.Status>
  )
}

export {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxCreateItem,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxStatus,
  ComboboxTrigger,
  ComboboxValue,
  keyHighlight as comboboxKeyHighlight,
  pointerHandlers as comboboxPointerHandlers,
  triggerClassName as comboboxTriggerClassName,
  useComboboxSearch,
}
export type { ComboboxSearchStatus }
