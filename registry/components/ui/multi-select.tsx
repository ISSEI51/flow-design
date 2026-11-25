"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { Check, ChevronDown, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ComboboxContent,
  comboboxKeyHighlight,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxList,
  ComboboxStatus,
  type ComboboxSearchStatus,
} from "@/components/ui/combobox"
import { matchesSearch } from "@/lib/search"
import { cn } from "@/lib/utils"

// Flow Design Multi Select
// 多数の選択肢から、検索して複数を選ぶ。shadcn/ui には同じ部品がないため、Flow Design が定める。
// Combobox と同じ Base UI の Combobox（multiple）と、同じメニュー、検索欄、選択肢を使い、操作方法をそろえる。
// - 値は選択肢の value（安定した一意の ID）の配列。選んだ順に並ぶ。同じ ID は重複しない
// - 選ぶたびに欄の表示を更新し、メニューは閉じない。確定ボタンは置かない
// - 欄には displayLimit 件（既定 3 件）までを個別に表示し、残りを「他 N 件」で示す
// - 個別に表示した項目には解除ボタンを付ける。ボタンは欄のトリガーの外に置き、button を入れ子にしない
// - メニューを開いたときは、選択済みの項目を先頭に並べ、件数と「すべて解除」を示す
// - 検索結果に含まれない選択済みの項目も、値と表示名を保つ（サーバー側の検索で結果が変わっても消えない）
// 定義は docs/web/components/multi-select.md を参照。

type MultiSelectOption = {
  /** 安定した一意の ID。フォームでは、この値が送信される。 */
  value: string
  label: string
  /** 別名や関連キーワード。検索の対象になる。 */
  keywords?: readonly string[]
  disabled?: boolean
}

type MultiSelectProps = {
  /** 選択肢。サーバー側で検索する場合は、現在の検索結果を渡す。 */
  options: readonly MultiSelectOption[]
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
  /** 選べる件数の上限 */
  max?: number
  /** 欄に個別に表示する件数。画面の幅や用途に合わせて変える。 */
  displayLimit?: number
  placeholder?: React.ReactNode
  searchPlaceholder?: string
  /** 検索欄のアクセシブルな名前 */
  searchLabel?: string
  emptyMessage?: React.ReactNode
  /** 既定は label と keywords の部分一致。サーバー側で検索するときは null。 */
  filter?: ((option: MultiSelectOption, query: string) => boolean) | null
  /** 検索文字列が変わった。サーバー側の検索では useComboboxSearch の onQueryChange を渡す。 */
  onSearchChange?: (query: string) => void
  /** サーバー側の検索の状態。省略時は表示しない。 */
  searchStatus?: ComboboxSearchStatus
  searchIdleMessage?: React.ReactNode
  onSearchRetry?: () => void
  name?: string
  form?: string
  id?: string
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
  className?: string
  /** 文言。ロケールに合わせて変える。 */
  labels?: Partial<{
    more: (count: number) => string
    remove: (label: string) => string
    clearAll: string
    selected: (count: number, max?: number) => string
    maxReached: (max: number) => string
  }>
}

const defaultLabels = {
  more: (n: number) => `他${n}件`,
  remove: (label: string) => `${label}を解除`,
  clearAll: "すべて解除",
  selected: (n: number, max?: number) => (max ? `${n}件を選択中（最大${max}件）` : `${n}件を選択中`),
  maxReached: (max: number) => `最大${max}件まで選べます。追加するには、選択中の項目を解除してください。`,
}

function MultiSelect({
  options,
  value: valueProp,
  defaultValue = [],
  onValueChange,
  max,
  displayLimit = 3,
  placeholder = "選択してください",
  searchPlaceholder = "検索",
  searchLabel,
  emptyMessage = "一致する項目がありません",
  filter,
  onSearchChange,
  searchStatus,
  searchIdleMessage,
  onSearchRetry,
  name,
  form,
  id,
  required,
  disabled,
  readOnly,
  className,
  labels: labelsProp,
}: MultiSelectProps) {
  const labels = { ...defaultLabels, ...labelsProp }
  const [uncontrolled, setUncontrolled] = React.useState<string[]>(defaultValue)
  const value = valueProp ?? uncontrolled
  const setValue = React.useCallback(
    (next: string[]) => {
      const unique = Array.from(new Set(next))
      if (valueProp === undefined) setUncontrolled(unique)
      onValueChange?.(unique)
    },
    [valueProp, onValueChange]
  )

  // 一度受け取った選択肢を覚えておく。検索結果に含まれない選択済みの項目も、表示名を失わない。
  const known = React.useRef(new Map<string, MultiSelectOption>())
  for (const o of options) known.current.set(o.value, o)
  const optionOf = (v: string): MultiSelectOption => known.current.get(v) ?? { value: v, label: v }

  // 開いたときの選択済みの項目を先頭に並べる。開いている間は並びを変えない（選ぶたびに位置が動かない）。
  const [pinned, setPinned] = React.useState<string[]>([])
  // サーバー側の検索（filter={null}）では絞り込まないため、選択済みの項目は検索結果に関係なく先頭に残り、
  // メニューの中で確かめて解除できる。
  const pinnedSet = new Set(pinned)
  const items = [...pinned, ...options.map((o) => o.value).filter((v) => !pinnedSet.has(v))]

  const reachedMax = max !== undefined && value.length >= max
  const shown = value.slice(0, displayLimit)
  const rest = value.length - shown.length
  const summary = value.map((v) => optionOf(v).label).join("、")

  // 解除した後のフォーカスの移動先。次の項目の解除ボタン、なければトリガー。
  const removeRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const pendingFocus = React.useRef<number | null>(null)
  React.useLayoutEffect(() => {
    if (pendingFocus.current === null) return
    const i = pendingFocus.current
    pendingFocus.current = null
    ;(removeRefs.current[i] ?? removeRefs.current[i - 1] ?? triggerRef.current)?.focus()
  })

  const remove = (v: string, index: number) => {
    pendingFocus.current = index
    setValue(value.filter((x) => x !== v))
  }

  return (
    <ComboboxPrimitive.Root<string, true>
      multiple
      items={items}
      value={value}
      onValueChange={(next) => setValue(max !== undefined ? next.slice(0, max) : next)}
      onOpenChange={(open) => {
        if (open) setPinned(value)
      }}
      onInputValueChange={(q, details) => {
        // 項目を選んでも検索文字列を消さない。同じ検索結果から続けて選べる。
        if (details.isItemPress) {
          details.cancel()
          return
        }
        onSearchChange?.(q)
      }}
      itemToStringLabel={(v) => optionOf(v).label}
      filter={
        filter === null
          ? null
          : (v: string, q: string) => {
              const o = optionOf(v)
              return filter ? filter(o, q) : matchesSearch([o.label, ...(o.keywords ?? [])], q)
            }
      }
      name={name}
      form={form}
      id={id}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
      // 読み取り専用のときは開かない。選択中の項目は欄で確認できる。
      open={readOnly ? false : undefined}
    >
      <div
        data-slot="multi-select-control"
        data-disabled={disabled || undefined}
        className={cn(
          "group/multi-select relative flex min-h-control w-full min-w-0 flex-wrap items-center gap-2 rounded-md border border-input bg-background py-1.5 pr-12 pl-2 text-body text-foreground",
          "transition-[color,background-color,border-color] duration-(--duration-fast) ease-standard",
          "has-[[data-slot=multi-select-trigger]:focus-visible]:focus-ring",
          "has-[[data-slot=multi-select-trigger][data-invalid]]:border-destructive has-[[data-slot=multi-select-trigger][aria-invalid=true]]:border-destructive",
          "has-[[data-slot=multi-select-trigger][data-readonly]]:bg-muted",
          "data-disabled:cursor-not-allowed data-disabled:opacity-50",
          className
        )}
      >
        {/* トリガーは欄の全体を覆う。解除ボタンはトリガーの上に重ねる（兄弟要素であり、入れ子にしない）。 */}
        <ComboboxPrimitive.Trigger
          ref={triggerRef}
          data-slot="multi-select-trigger"
          className="absolute inset-0 rounded-md outline-none data-disabled:cursor-not-allowed"
        >
          <span className="sr-only">{value.length > 0 ? summary : placeholder}</span>
        </ComboboxPrimitive.Trigger>
        {value.length === 0 && (
          <span aria-hidden="true" className="pointer-events-none px-2 text-muted-foreground">
            {placeholder}
          </span>
        )}
        {shown.map((v, i) => {
          const label = optionOf(v).label
          return (
            <span
              key={v}
              data-slot="multi-select-chip"
              className="pointer-events-none relative z-10 inline-flex h-8 max-w-full min-w-0 items-center rounded-sm bg-muted pl-3 text-ui text-foreground"
            >
              <span aria-hidden="true" className="min-w-0 truncate">
                {label}
              </span>
              {!disabled && !readOnly && (
                <button
                  ref={(el) => {
                    removeRefs.current[i] = el
                  }}
                  type="button"
                  data-slot="multi-select-chip-remove"
                  aria-label={labels.remove(label)}
                  onClick={() => remove(v, i)}
                  className={cn(
                    "pointer-events-auto flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none",
                    "transition-[color,background-color] duration-(--duration-fast) ease-standard",
                    "hover:bg-[color-mix(in_srgb,var(--muted)_88%,var(--foreground))] hover:text-foreground focus-visible:focus-ring"
                  )}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
              {(disabled || readOnly) && <span className="w-3" />}
            </span>
          )
        })}
        {rest > 0 && (
          <span aria-hidden="true" data-slot="multi-select-more" className="pointer-events-none shrink-0 px-1 text-ui text-muted-foreground tabular-nums">
            {labels.more(rest)}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted-foreground transition-transform duration-(--duration-normal) ease-standard motion-safe:group-has-[[data-popup-open]]/multi-select:rotate-180"
        />
      </div>
      <ComboboxContent>
        <ComboboxInput placeholder={searchPlaceholder} aria-label={searchLabel ?? searchPlaceholder} />
        {value.length > 0 && (
          <div data-slot="multi-select-summary" className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-3 pb-1 text-ui text-muted-foreground">
            <span className="tabular-nums">{labels.selected(value.length, max)}</span>
            {!readOnly && (
              <Button variant="link" size="xs" className="min-h-8 text-foreground" onClick={() => setValue([])}>
                {labels.clearAll}
              </Button>
            )}
          </div>
        )}
        {reachedMax && (
          <p data-slot="multi-select-max" className="shrink-0 px-5 pt-1 text-caption text-muted-foreground">
            {labels.maxReached(max!)}
          </p>
        )}
        {searchStatus && searchStatus !== "success" && (
          <ComboboxStatus status={searchStatus} idleMessage={searchIdleMessage} onRetry={onSearchRetry} />
        )}
        {(!searchStatus || searchStatus === "success") && <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>}
        <ComboboxList>
          {(v: string) => {
            const o = optionOf(v)
            return (
              <MultiSelectItem
                key={v}
                value={v}
                disabled={o.disabled || (reachedMax && !value.includes(v))}
              >
                {o.label}
              </MultiSelectItem>
            )
          }}
        </ComboboxList>
      </ComboboxContent>
    </ComboboxPrimitive.Root>
  )
}

// 選択肢。左に Checkbox と同じ形の印を置き、選択中を示す。高さ 40px 以上。
// 選択中の判定は aria-selected で行う。shadcn/tailwind.css の data-selected: は [data-selected="true"] だけに一致し、
// Base UI の data-selected（値なし）には一致しないため。
function MultiSelectItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="multi-select-item"
      className={cn(
        "group/multi-select-item relative flex min-h-10 w-full cursor-default items-center gap-3 rounded-md py-2 pr-3 pl-3 text-body outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        comboboxKeyHighlight,
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-xs border border-input bg-background text-primary-foreground",
          "group-aria-selected/multi-select-item:border-primary group-aria-selected/multi-select-item:bg-primary"
        )}
      >
        <Check className="hidden size-4 [--icon-stroke-width:3] group-aria-selected/multi-select-item:block" />
      </span>
      <span className="min-w-0 flex-1 whitespace-normal [word-break:auto-phrase]">{children}</span>
    </ComboboxPrimitive.Item>
  )
}

export { MultiSelect, MultiSelectItem }
export type { MultiSelectOption, MultiSelectProps }
