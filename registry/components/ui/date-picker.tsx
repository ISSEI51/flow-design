import * as React from "react"
import { CalendarDays, X } from "lucide-react"
import type { Matcher } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar, type CalendarProps } from "@/components/ui/calendar"
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { controlClassName, Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  dateFormatHint,
  formatDate,
  isBeforeDate,
  isSameDate,
  parseDateInput,
  toDateString,
  todayIn,
  type DateRange,
  type DateRangePreset,
} from "@/lib/date"
import { cn } from "@/lib/utils"

// Flow Design Date Picker
// 日付と期間を入力する。shadcn/ui と同じく Popover と Calendar の組み合わせで、Flow Design の Input、Popover、
// Drawer、Calendar を使う。shadcn/ui には部品がない（例だけがある）ため、DatePicker と DateRangePicker を定める。
// - 直接入力と Calendar の両方で入力できる。両者は同じ値を表示する
// - 入力中の文字（下書き）と、確定した日付を分ける。フォーカスが外れたときと Enter で確定する
// - 存在しない日付（2026/02/30）は受け付けず、別の日付に繰り越さない。形式の誤りと区別して知らせる
// - 期間は開始日と終了日を別々の欄で示す。終了日が開始日より前のときはエラーにし、自動で入れ替えない
// - 画面の幅が 768px 未満（useIsMobile）のときは、Popover ではなく下からの Drawer で Calendar を開き、1 か月だけ表示する
// - 値は日付だけ（ローカル時刻の 0 時の Date）。フォームでは "YYYY-MM-DD" を送信する（name、startName、endName）
// 定義は docs/web/components/date-picker.md を参照。

type DateError = "format" | "nonexistent" | "out-of-range" | "unavailable"
type DateRangeError = DateError | "end-before-start"

type DateConstraints = {
  /** 選べる最初の日 */
  min?: Date
  /** 選べる最後の日 */
  max?: Date
  /** 選べない日（祝日、定休日など）。true を返した日は選べない。 */
  isDateDisabled?: (date: Date) => boolean
}

/** エラーの文言。製品は FieldError にこの文言か、独自の文言を表示する。 */
function dateErrorMessage(error: DateRangeError, { min, max, locale = "ja-JP" }: DateConstraints & { locale?: string } = {}) {
  switch (error) {
    case "format":
      return `日付を ${dateFormatHint(locale)} の形式で入力してください（例：${formatDate(new Date(2026, 3, 1), locale)}）`
    case "nonexistent":
      return "存在しない日付です。月と日を確かめてください"
    case "out-of-range":
      if (min && max) return `${formatDate(min, locale)}〜${formatDate(max, locale)} の日付を入力してください`
      if (min) return `${formatDate(min, locale)} 以降の日付を入力してください`
      return `${formatDate(max, locale)} 以前の日付を入力してください`
    case "unavailable":
      return "この日付は選べません。別の日付を選んでください"
    case "end-before-start":
      return "終了日は開始日と同じか、それより後の日付にしてください"
  }
}

function checkConstraints(date: Date, { min, max, isDateDisabled }: DateConstraints): DateError | null {
  if ((min && isBeforeDate(date, min)) || (max && isBeforeDate(max, date))) return "out-of-range"
  if (isDateDisabled?.(date)) return "unavailable"
  return null
}

function calendarConstraints({ min, max, isDateDisabled }: DateConstraints) {
  const disabled: Matcher[] = []
  if (min) disabled.push({ before: min })
  if (max) disabled.push({ after: max })
  if (isDateDisabled) disabled.push(isDateDisabled)
  return {
    disabled,
    startMonth: min ? new Date(min.getFullYear(), min.getMonth()) : undefined,
    endMonth: max ? new Date(max.getFullYear(), max.getMonth()) : undefined,
  }
}

function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void, controlled = value !== undefined) {
  const [inner, setInner] = React.useState(defaultValue)
  const current = controlled ? (value as T) : inner
  const set = (v: T) => {
    if (!controlled) setInner(v)
    onChange?.(v)
  }
  return [current, set] as const
}

/**
 * 直接入力の欄の状態。text は入力中の文字（下書き）、確定は commit で行う。
 * 確定した日付が外から変わったとき（Calendar で選んだときなど）は、text を書き直す。
 */
function useDateText(date: Date | undefined, locale: string) {
  const [text, setText] = React.useState(() => formatDate(date, locale))
  const last = React.useRef(date)
  if (!isSameDate(last.current, date) && !(last.current === undefined && date === undefined)) {
    last.current = date
    setText(formatDate(date, locale))
  }
  return [text, setText] as const
}

// ---- Calendar を開く部分

function CalendarOverlay({
  open,
  onOpenChange,
  narrow,
  title,
  triggerLabel,
  disabled,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  narrow: boolean
  title: string
  triggerLabel: string
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const trigger = (
    <Button
      ref={triggerRef}
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={triggerLabel}
      disabled={disabled}
      data-slot="date-picker-trigger"
      className={cn("text-muted-foreground", className)}
      onClick={narrow ? () => onOpenChange(true) : undefined}
    >
      <CalendarDays />
    </Button>
  )
  if (narrow)
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={onOpenChange}>
          {/* Drawer はトリガーの外で開くため、閉じた後のフォーカスの戻り先を指定する。 */}
          <DrawerContent data-slot="date-picker-drawer" finalFocus={triggerRef}>
            <DrawerHeader>
              <DrawerTitle>{title}</DrawerTitle>
            </DrawerHeader>
            <DrawerBody className="flex flex-col items-center gap-4">{children}</DrawerBody>
          </DrawerContent>
        </Drawer>
      </>
    )
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="end"
        aria-label={title}
        data-slot="date-picker-content"
        className="w-auto max-w-[min(var(--available-width),48rem)] p-3"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

// ---- 単一の日付

type DatePickerProps = DateConstraints & {
  value?: Date | null
  defaultValue?: Date | null
  /** 確定した日付が変わった。不正な入力のときは null。 */
  onValueChange?: (date: Date | null) => void
  /** 直接入力のエラーが変わった。エラーがなくなったときは null。 */
  onErrorChange?: (error: DateError | null) => void
  /** 表示と入力の形式のロケール。既定は ja-JP（YYYY/MM/DD）。 */
  locale?: string
  /** Calendar に渡す設定（開始曜日、ロケール、「今日」のタイムゾーンなど） */
  calendarProps?: Pick<CalendarProps, "weekStartsOn" | "locale" | "timeZone" | "captionLayout">
  /** フォームで "YYYY-MM-DD" を送信する名前 */
  name?: string
  id?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  placeholder?: string
  /** 入力した日付を消すボタンを表示する */
  clearable?: boolean
  className?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
  labels?: Partial<{ open: string; clear: string; title: string }>
}

function DatePicker({
  value: valueProp,
  defaultValue = null,
  onValueChange,
  onErrorChange,
  locale = "ja-JP",
  calendarProps,
  name,
  id,
  disabled,
  readOnly,
  required,
  placeholder,
  clearable,
  className,
  labels,
  min,
  max,
  isDateDisabled,
  ...aria
}: DatePickerProps) {
  const [value, setValue] = useControllable<Date | null>(valueProp, defaultValue, onValueChange)
  const [text, setText] = useDateText(value ?? undefined, locale)
  const [error, setErrorState] = React.useState<DateError | null>(null)
  const [open, setOpen] = React.useState(false)
  const narrow = useIsMobile()
  const constraints = { min, max, isDateDisabled }

  const setError = (e: DateError | null) => {
    if (e !== error) onErrorChange?.(e)
    setErrorState(e)
  }

  const commit = (raw: string) => {
    const r = parseDateInput(raw, locale)
    if (r.status === "empty") {
      setError(null)
      if (value) setValue(null)
      return
    }
    if (r.status === "invalid") {
      setError(r.reason)
      if (value) setValue(null)
      return
    }
    const e = checkConstraints(r.date, constraints)
    setError(e)
    if (e) {
      if (value) setValue(null)
      return
    }
    setText(formatDate(r.date, locale))
    if (!isSameDate(value ?? undefined, r.date)) setValue(r.date)
  }

  const draft = parseDateInput(text, locale)
  const shown = draft.status === "valid" ? draft.date : (value ?? undefined)

  return (
    <div data-slot="date-picker" className={cn("relative w-full min-w-0", className)}>
      <Input
        id={id}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault()
            commit(e.currentTarget.value)
          }
        }}
        placeholder={placeholder ?? dateFormatHint(locale)}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-invalid={aria["aria-invalid"] || error !== null || undefined}
        aria-describedby={aria["aria-describedby"]}
        data-slot="date-picker-input"
        className={cn("tabular-nums", clearable && value ? "pr-24" : "pr-14")}
      />
      {name && <input type="hidden" name={name} value={value ? toDateString(value) : ""} />}
      <div className="absolute inset-y-0 right-1 flex items-center gap-1">
        {clearable && value && !disabled && !readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels?.clear ?? "日付を消去"}
            className="text-muted-foreground"
            onClick={() => {
              setText("")
              setError(null)
              setValue(null)
            }}
          >
            <X />
          </Button>
        )}
        {!readOnly && (
          <CalendarOverlay
            open={open}
            onOpenChange={setOpen}
            narrow={narrow}
            title={labels?.title ?? "日付を選択"}
            triggerLabel={labels?.open ?? "カレンダーから選ぶ"}
            disabled={disabled}
          >
            <Calendar
              mode="single"
              autoFocus
              selected={shown}
              defaultMonth={shown ?? min}
              onSelect={(d) => {
                if (!d) return
                setText(formatDate(d, locale))
                setError(null)
                setValue(d)
                setOpen(false)
              }}
              {...calendarConstraints(constraints)}
              {...calendarProps}
            />
          </CalendarOverlay>
        )}
      </div>
    </div>
  )
}

// ---- 期間

type DateRangePickerProps = DateConstraints & {
  value?: DateRange
  defaultValue?: DateRange
  onValueChange?: (range: DateRange) => void
  /** 開始日、終了日、開始日と終了日の関係のエラー */
  onErrorChange?: (errors: { from: DateError | null; to: DateError | null; range: "end-before-start" | null }) => void
  locale?: string
  calendarProps?: Pick<CalendarProps, "weekStartsOn" | "locale" | "timeZone" | "captionLayout">
  /** よく使う期間。指定したときだけ表示する。 */
  presets?: DateRangePreset[]
  /** 「今日」のタイムゾーン。プリセットの計算に使う。 */
  timeZone?: string
  startName?: string
  endName?: string
  id?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  className?: string
  "aria-describedby"?: string
  labels?: Partial<{ start: string; end: string; open: string; title: string; presets: string }>
}

function DateRangePicker({
  value: valueProp,
  defaultValue = { from: undefined, to: undefined },
  onValueChange,
  onErrorChange,
  locale = "ja-JP",
  calendarProps,
  presets,
  timeZone,
  startName,
  endName,
  id,
  disabled,
  readOnly,
  required,
  className,
  labels,
  min,
  max,
  isDateDisabled,
  ...aria
}: DateRangePickerProps) {
  const [value, setValue] = useControllable<DateRange>(valueProp, defaultValue, onValueChange)
  const [fromText, setFromText] = useDateText(value.from, locale)
  const [toText, setToText] = useDateText(value.to, locale)
  const [errors, setErrorsState] = React.useState<{ from: DateError | null; to: DateError | null }>({ from: null, to: null })
  const [open, setOpen] = React.useState(false)
  const narrow = useIsMobile()
  const baseId = React.useId()
  const fromId = id ?? `${baseId}-from`
  const toId = `${baseId}-to`
  const constraints = { min, max, isDateDisabled }
  const weekStartsOn = calendarProps?.weekStartsOn ?? 1

  const rangeError: "end-before-start" | null =
    value.from && value.to && isBeforeDate(value.to, value.from) ? "end-before-start" : null
  const lastReported = React.useRef("")
  React.useEffect(() => {
    const key = `${errors.from}|${errors.to}|${rangeError}`
    if (key !== lastReported.current) {
      lastReported.current = key
      onErrorChange?.({ ...errors, range: rangeError })
    }
  })

  const commit = (side: "from" | "to", raw: string) => {
    const r = parseDateInput(raw, locale)
    let date: Date | undefined
    let e: DateError | null = null
    if (r.status === "invalid") e = r.reason
    else if (r.status === "valid") {
      e = checkConstraints(r.date, constraints)
      if (!e) date = r.date
    }
    setErrorsState((prev) => ({ ...prev, [side]: e }))
    if (date) (side === "from" ? setFromText : setToText)(formatDate(date, locale))
    if (!isSameDate(value[side], date) && !(value[side] === undefined && date === undefined)) setValue({ ...value, [side]: date })
  }

  const applyRange = (range: DateRange) => {
    setFromText(formatDate(range.from, locale))
    setToText(formatDate(range.to, locale))
    setErrorsState({ from: null, to: null })
    setValue(range)
  }

  const today = todayIn(timeZone ?? calendarProps?.timeZone)
  const activePreset = presets?.find((p) => {
    const r = p.range(today, { weekStartsOn })
    return isSameDate(r.from, value.from) && isSameDate(r.to, value.to)
  })

  const field = (side: "from" | "to") => {
    const inputId = side === "from" ? fromId : toId
    const text = side === "from" ? fromText : toText
    const setText = side === "from" ? setFromText : setToText
    const invalid = errors[side] !== null || (side === "to" && rangeError !== null)
    return (
      <div className="flex min-w-0 flex-1 basis-36 flex-col gap-2">
        <label htmlFor={inputId} className="text-caption text-muted-foreground">
          {side === "from" ? (labels?.start ?? "開始日") : (labels?.end ?? "終了日")}
        </label>
        <input
          id={inputId}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onBlur={(e) => commit(side, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              commit(side, e.currentTarget.value)
            }
          }}
          placeholder={dateFormatHint(locale)}
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={aria["aria-describedby"]}
          data-slot={`date-range-${side}`}
          className={cn(controlClassName, "h-control px-4 tabular-nums")}
        />
      </div>
    )
  }

  const presetList = presets && presets.length > 0 && (
    <div
      role="group"
      aria-label={labels?.presets ?? "よく使う期間"}
      data-slot="date-range-presets"
      className={cn("flex gap-1", narrow ? "flex-wrap justify-center" : "w-36 shrink-0 flex-col border-r border-border pr-3")}
    >
      {presets.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={activePreset?.id === p.id}
          className={cn("justify-start aria-pressed:bg-accent aria-pressed:font-semibold", narrow && "justify-center")}
          onClick={() => {
            applyRange(p.range(today, { weekStartsOn }))
            setOpen(false)
          }}
        >
          {p.label}
        </Button>
      ))}
    </div>
  )

  return (
    <div data-slot="date-range-picker" className={cn("flex w-full min-w-0 flex-wrap items-end gap-x-2 gap-y-4", className)}>
      {field("from")}
      <span aria-hidden="true" className="hidden h-control items-center text-muted-foreground sm:flex">
        〜
      </span>
      {field("to")}
      {startName && <input type="hidden" name={startName} value={value.from ? toDateString(value.from) : ""} />}
      {endName && <input type="hidden" name={endName} value={value.to ? toDateString(value.to) : ""} />}
      {!readOnly && (
        <div className="flex h-control items-center">
          <CalendarOverlay
            open={open}
            onOpenChange={setOpen}
            narrow={narrow}
            title={labels?.title ?? "期間を選択"}
            triggerLabel={labels?.open ?? "カレンダーから期間を選ぶ"}
            disabled={disabled}
            className="size-control rounded-md border border-input text-foreground"
          >
            <div className={cn("flex gap-3", narrow && "flex-col items-center")}>
              {presetList}
              <Calendar
                mode="range"
                autoFocus
                resetOnSelect
                numberOfMonths={narrow ? 1 : 2}
                selected={rangeError ? { from: value.from, to: undefined } : value.from ? { from: value.from, to: value.to } : undefined}
                defaultMonth={value.from ?? min}
                onSelect={(r) => {
                  const next = { from: r?.from, to: r?.to }
                  applyRange(next)
                  // resetOnSelect では、1 回目に開始日、2 回目に終了日が決まる。終了日が決まったら閉じる。
                  if (next.from && next.to) setOpen(false)
                }}
                {...calendarConstraints(constraints)}
                {...calendarProps}
              />
            </div>
          </CalendarOverlay>
        </div>
      )}
    </div>
  )
}

export { DatePicker, dateErrorMessage, DateRangePicker }
export type { DateError, DatePickerProps, DateRangeError, DateRangePickerProps }
