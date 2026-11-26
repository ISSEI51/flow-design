"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Flow Design View Switcher（Patterns / Data Browsing / View Switching）
// 一覧の表示形式（Table、List、Card、Kanban、Calendar）の切り替え。定義と判断基準は docs/web/patterns/view-switching.md を参照。
//
// - 置く場所：対象のデータ領域の直上・右側。Page Header の主要な操作の位置や、離れた位置には置かない。
// - ViewSwitcher：2〜3 種類のセグメント型。radiogroup（1 つだけ選ばれる）で、矢印キーで移動して選ぶ（Tab では 1 回で抜ける）。
//   選択中はニュートラルの面（ブランドカラーを使わない）と太さで示す。
//   iconOnly のときは、ボタンにアクセシブルな名前（aria-label）と Tooltip を付ける。
// - ViewSwitcherMenu：選択肢が多い場合や、領域が狭い場合の Dropdown Menu。
// - 表示形式の保存（URL、前回の値）は製品の責務。resolveInitialView で優先順位だけを決める。
// 表示形式の切り替えは、表示の変更であり、データの変更ではない。切り替えで検索語、フィルター、選択を変えない。

type ViewOption<V extends string> = {
  value: V
  /** 表示形式の名前（「表」「カンバン」） */
  label: string
  /** Lucide のアイコン（16px で表示する） */
  icon?: React.ReactNode
  disabled?: boolean
}

function ViewSwitcher<V extends string>({
  label = "表示形式",
  value,
  onValueChange,
  options,
  iconOnly = false,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "onChange" | "defaultValue"> & {
  /** 支援技術に伝える、切り替えの名前 */
  label?: string
  value: V
  onValueChange: (value: V) => void
  options: readonly ViewOption<V>[]
  /** アイコンだけで表示する。名前は aria-label と Tooltip で示す */
  iconOnly?: boolean
}) {
  const buttons = React.useRef(new Map<V, HTMLButtonElement>())
  const enabled = options.filter((o) => !o.disabled)
  const focusable = options.some((o) => o.value === value && !o.disabled) ? value : enabled[0]?.value

  const moveTo = (next: ViewOption<V> | undefined) => {
    if (!next) return
    onValueChange(next.value)
    buttons.current.get(next.value)?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent, current: V) => {
    const index = enabled.findIndex((o) => o.value === current)
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl"
    const forward = rtl ? "ArrowLeft" : "ArrowRight"
    const backward = rtl ? "ArrowRight" : "ArrowLeft"
    let next: ViewOption<V> | undefined
    if (event.key === forward || event.key === "ArrowDown") next = enabled[(index + 1) % enabled.length]
    else if (event.key === backward || event.key === "ArrowUp") next = enabled[(index - 1 + enabled.length) % enabled.length]
    else if (event.key === "Home") next = enabled[0]
    else if (event.key === "End") next = enabled[enabled.length - 1]
    else return
    event.preventDefault()
    moveTo(next)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-slot="view-switcher"
      className={cn(
        "[--view-switcher-selected:color-mix(in_srgb,var(--foreground)_10%,var(--background))]",
        "inline-flex h-10 max-w-full shrink-0 items-stretch gap-0.5 rounded-lg border border-input bg-background p-0.5 pointer-coarse:h-12",
        className
      )}
      {...props}
    >
      {options.map((option) => {
        const checked = option.value === value
        const button = (
          <button
            key={option.value}
            ref={(el) => {
              if (el) buttons.current.set(option.value, el)
              else buttons.current.delete(option.value)
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={iconOnly ? option.label : undefined}
            tabIndex={option.value === focusable ? 0 : -1}
            disabled={option.disabled}
            data-slot="view-switcher-item"
            data-value={option.value}
            onClick={() => !checked && onValueChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, option.value)}
            className={cn(
              "inline-flex min-w-0 items-center justify-center gap-2 rounded-md px-3 text-ui whitespace-nowrap text-muted-foreground outline-none",
              "transition-[color,background-color] duration-(--duration-fast) ease-standard",
              "hover:bg-accent hover:text-foreground focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50",
              "aria-checked:bg-(--view-switcher-selected) aria-checked:font-medium aria-checked:text-foreground",
              // 強制カラーモードでは面の色が失われるため、選択中を枠で示す。
              "forced-colors:aria-checked:outline-2 forced-colors:aria-checked:outline-offset-[-2px] forced-colors:aria-checked:outline-[Highlight]",
              "[&_svg]:size-4 [&_svg]:shrink-0",
              iconOnly && "w-9 px-0 pointer-coarse:w-11"
            )}
          >
            {option.icon && <span aria-hidden="true" className="flex">{option.icon}</span>}
            {!iconOnly && <span>{option.label}</span>}
          </button>
        )
        if (!iconOnly) return button
        return (
          <Tooltip key={option.value}>
            <TooltipTrigger render={button} />
            <TooltipContent>{option.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

// 選択肢が多い場合や、データ領域の上に十分な幅がない場合の切り替え。ボタンに現在の表示形式を示す。
function ViewSwitcherMenu<V extends string>({
  label = "表示形式",
  value,
  onValueChange,
  options,
  className,
}: {
  label?: string
  value: V
  onValueChange: (value: V) => void
  options: readonly ViewOption<V>[]
  className?: string
}) {
  const current = options.find((o) => o.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" data-slot="view-switcher-menu" className={className} />}
      >
        {current?.icon && <span aria-hidden="true" className="flex [&_svg]:size-4">{current.icon}</span>}
        <span>
          <span className="sr-only">{label}：</span>
          {current?.label ?? label}
        </span>
        <ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={label}>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onValueChange(v as V)}>
          {options.map((o) => (
            // 選んだら閉じ、選んだ表示形式をすぐに見せる（Base UI の RadioItem の既定は閉じない）。
            <DropdownMenuRadioItem key={o.value} value={o.value} disabled={o.disabled} closeOnClick>
              {o.icon}
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 最初に表示する形式を決める。優先順位：
 * 1. URL などで明示的に指定された形式（requested）
 * 2. 利用者がそのページで前回使った形式（remembered。保存は製品の責務）
 * 3. 製品の標準の形式（fallback）
 * available に含まれない値（権限や画面の幅で使えない形式、古い保存値）は飛ばす。
 */
function resolveInitialView<V extends string>({
  requested,
  remembered,
  fallback,
  available,
}: {
  requested?: string | null
  remembered?: string | null
  fallback: V
  available: readonly V[]
}): V {
  for (const candidate of [requested, remembered]) {
    if (candidate && (available as readonly string[]).includes(candidate)) return candidate as V
  }
  return fallback
}

/**
 * 表示形式ごとに持つ状態（ページ番号、スクロール位置、列の設定、Kanban のグループ、Calendar の表示期間）。
 * 形式を切り替えて戻ったときに、その形式の状態を戻す。検索語、フィルター、選択などの共通の状態は、ここに入れない。
 */
function useViewScopedState<V extends string, S>(view: V, create: (view: V) => S) {
  const [map, setMap] = React.useState<Partial<Record<V, S>>>({})
  const defaults = React.useRef(new Map<V, S>())
  const createRef = React.useRef(create)
  createRef.current = create
  const fallback = (v: V) => {
    if (!defaults.current.has(v)) defaults.current.set(v, createRef.current(v))
    return defaults.current.get(v) as S
  }
  const value = map[view] ?? fallback(view)
  const setValue = React.useCallback(
    (updater: S | ((state: S) => S)) =>
      setMap((m) => {
        const old = m[view] ?? fallback(view)
        const next = typeof updater === "function" ? (updater as (state: S) => S)(old) : updater
        return Object.is(next, old) ? m : { ...m, [view]: next }
      }),
    // fallback は ref を読むため、view だけに依存する。
    [view] // eslint-disable-line react-hooks/exhaustive-deps
  )
  return [value, setValue] as const
}

export { resolveInitialView, useViewScopedState, ViewSwitcher, ViewSwitcherMenu }
export type { ViewOption }
