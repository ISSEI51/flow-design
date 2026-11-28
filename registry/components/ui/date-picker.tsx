"use client"

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
  isValidDate,
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
  // コンポーネント自身が値を変えたとき（不正な入力で値を null にしたときなど）は、入力した文字を残す。
  const own = React.useRef<{ date: Date | undefined } | null>(null)
  if (!isSameDate(last.current, date) && !(last.current === undefined && date === undefined)) {
    last.current = date
    const self = own.current !== null && (isSameDate(own.current.date, date) || (own.current.date === undefined && date === undefined))
    own.current = null
    if (!self) setText(formatDate(date, locale))
  }
  /** 次の値の変化は、このコンポーネントが行ったものとして扱う。 */
  const markOwn = (d: Date | undefined) => {
    own.current = { date: d }
  }
  return [text, setText, markOwn] as const
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

// ---- フォームとの連携

/**
 * 入力中の文字（下書き）から、送信する値と妥当性を決める。
 * - 送信する値（"YYYY-MM-DD"）は、確定を待たずに下書きから作る。下書きが不正なときは ""。
 *   以前に確定した古い日付が、不正な入力のまま送信されることはない
 * - 下書きが不正なときは、値を持つ入力欄（DateValueInput）に setCustomValidity でエラーの文を設定する。
 *   form.checkValidity() は false になり、noValidate のないフォームは送信されない
 */
function draftState(text: string, locale: string, constraints: DateConstraints) {
  const r = parseDateInput(text, locale)
  if (r.status === "empty") return { date: undefined, error: null, submit: "" }
  if (r.status === "invalid") return { date: undefined, error: r.reason as DateError, submit: "" }
  const error = checkConstraints(r.date, constraints)
  return { date: error ? undefined : r.date, error, submit: error ? "" : toDateString(r.date) }
}

/**
 * 送信する値と、日付の妥当性を持つ入力欄。画面には表示せず、フォーカスも受けない。
 * type="hidden" は妥当性の検証の対象外のため、見えない text の入力欄にする。
 * 見える入力欄（Base UI の Field.Control）に setCustomValidity を設定しないのは、Base UI の Field が入力のたびに
 * 妥当性を読み、React の描画の前の古い値でエラーを表示し続けるため。
 * ブラウザの検証で送信が止まったとき（invalid）は、見える入力欄にフォーカスを移し、エラーを確定して表示する。
 */
function DateValueInput({
  name,
  value,
  message,
  disabled,
  target,
  onInvalid,
  slot,
}: {
  name?: string
  value: string
  message: string
  disabled?: boolean
  /** 見える入力欄。data-for に id を入れ、エラーの概要から見える入力欄のラベルをたどれるようにする。 */
  target: React.RefObject<HTMLInputElement | null>
  onInvalid: () => void
  slot: string
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    ref.current?.setCustomValidity(message)
  }, [message])
  React.useEffect(() => {
    if (ref.current && target.current) ref.current.dataset.for = target.current.id
  })
  return (
    <input
      ref={ref}
      type="text"
      name={name}
      value={value}
      onChange={() => {}}
      disabled={disabled}
      tabIndex={-1}
      aria-hidden="true"
      autoComplete="off"
      data-slot={slot}
      className="pointer-events-none absolute size-px overflow-hidden opacity-0 [clip-path:inset(50%)]"
      onInvalid={(e) => {
        e.preventDefault()
        onInvalid()
      }}
    />
  )
}

/** 入力欄が属するフォームの submit（キャプチャ）と reset に反応する。 */
function useFormEvents(ref: React.RefObject<HTMLInputElement | null>, handlers: { submit: () => void; reset: () => void }) {
  const latest = React.useRef(handlers)
  latest.current = handlers
  React.useEffect(() => {
    const form = ref.current?.form
    if (!form) return
    // 送信の前に下書きを確定し、エラーを表示する。製品の onSubmit より前に呼ばれる。
    const onSubmit = () => latest.current.submit()
    // reset はフォームの値を戻す前に発生する。状態を初期値に戻し、描画し直したときに入力欄へ反映する。
    const onReset = () => latest.current.reset()
    form.addEventListener("submit", onSubmit, true)
    form.addEventListener("reset", onReset)
    return () => {
      form.removeEventListener("submit", onSubmit, true)
      form.removeEventListener("reset", onReset)
    }
  }, [ref])
}

const validDate = (d: Date | null | undefined) => (isValidDate(d) ? d : undefined)

// ---- 単一の日付

type DatePickerProps = DateConstraints & {
  /** 確定した日付。Invalid Date は null として扱う。 */
  value?: Date | null
  /** 初期値。フォームの reset でもこの値に戻る。 */
  defaultValue?: Date | null
  /** 確定した日付が変わった。不正な入力のときは null。 */
  onValueChange?: (date: Date | null) => void
  /** 入力のエラーが変わった。フォーカスが外れたとき、Enter、フォームの送信で確定した時点の結果。エラーがなくなったときは null。 */
  onErrorChange?: (error: DateError | null) => void
  /** 表示と入力の形式のロケール。既定は ja-JP（YYYY/MM/DD）。 */
  locale?: string
  /** Calendar に渡す設定（開始曜日、ロケール、「今日」のタイムゾーンなど） */
  calendarProps?: Pick<CalendarProps, "weekStartsOn" | "locale" | "timeZone" | "captionLayout" | "today">
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
  const [rawValue, setValue] = useControllable<Date | null>(
    valueProp === undefined ? undefined : (validDate(valueProp) ?? null),
    validDate(defaultValue) ?? null,
    onValueChange
  )
  const value = validDate(rawValue) ?? null
  const [text, setText, markOwn] = useDateText(value ?? undefined, locale)
  const [error, setErrorState] = React.useState<DateError | null>(null)
  const [open, setOpen] = React.useState(false)
  const narrow = useIsMobile()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const constraints = { min, max, isDateDisabled }
  const draft = draftState(text, locale, constraints)

  const setError = (e: DateError | null) => {
    if (e !== error) onErrorChange?.(e)
    setErrorState(e)
  }

  const commit = (raw: string) => {
    const d = draftState(raw, locale, constraints)
    setError(d.error)
    if (d.date) setText(formatDate(d.date, locale))
    if (!isSameDate(value ?? undefined, d.date) && !(value === null && d.date === undefined)) {
      markOwn(d.date)
      setValue(d.date ?? null)
    }
  }

  useFormEvents(inputRef, {
    submit: () => commit(inputRef.current?.value ?? text),
    reset: () => {
      const initial = validDate(defaultValue) ?? null
      setText(formatDate(initial ?? undefined, locale))
      setError(null)
      if (!isSameDate(value ?? undefined, initial ?? undefined)) setValue(initial)
    },
  })

  const shown = draft.date ?? value ?? undefined

  return (
    <div data-slot="date-picker" className={cn("relative w-full min-w-0", className)}>
      <Input
        ref={inputRef}
        id={id}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          // IME の変換中の Enter は、変換の確定であり、日付の確定ではない。
          // Enter では確定し、フォームの中では通常の入力欄と同じく送信を続ける（送信の前に submit で確定する）。
          if (e.key === "Enter" && !e.nativeEvent.isComposing) commit(e.currentTarget.value)
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
      <DateValueInput
        name={name}
        value={draft.submit}
        message={draft.error ? dateErrorMessage(draft.error, { min, max, locale }) : ""}
        disabled={disabled}
        target={inputRef}
        slot="date-picker-value"
        onInvalid={() => {
          commit(inputRef.current?.value ?? text)
          inputRef.current?.focus()
        }}
      />
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
              inputRef.current?.focus()
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

type DateRangeErrors = { from: DateError | null; to: DateError | null; range: "end-before-start" | null }

type DateRangePickerProps = DateConstraints & {
  value?: DateRange
  /** 初期値。フォームの reset でもこの値に戻る。 */
  defaultValue?: DateRange
  onValueChange?: (range: DateRange) => void
  /** 開始日、終了日、開始日と終了日の関係のエラー。確定した時点の結果。 */
  onErrorChange?: (errors: DateRangeErrors) => void
  locale?: string
  calendarProps?: Pick<CalendarProps, "weekStartsOn" | "locale" | "timeZone" | "captionLayout" | "today">
  /** よく使う期間。指定したときだけ表示する。min、max、isDateDisabled に合わない期間は押せない。 */
  presets?: DateRangePreset[]
  /** 「今日」のタイムゾーン。プリセットの計算に使う。 */
  timeZone?: string
  startName?: string
  endName?: string
  id?: string
  disabled?: boolean
  readOnly?: boolean
  /** 開始日と終了日の両方を必須にする。片側だけを必須にする場合は、製品が検証する。 */
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
  const [rawValue, setValue] = useControllable<DateRange>(valueProp, defaultValue, onValueChange)
  const value: DateRange = { from: validDate(rawValue.from), to: validDate(rawValue.to) }
  const [fromText, setFromText, markOwnFrom] = useDateText(value.from, locale)
  const [toText, setToText, markOwnTo] = useDateText(value.to, locale)
  const [errors, setErrorsState] = React.useState<{ from: DateError | null; to: DateError | null }>({ from: null, to: null })
  const [open, setOpen] = React.useState(false)
  const narrow = useIsMobile()
  const baseId = React.useId()
  const fromId = id ?? `${baseId}-from`
  const toId = `${baseId}-to`
  const fromRef = React.useRef<HTMLInputElement>(null)
  const toRef = React.useRef<HTMLInputElement>(null)
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

  // 下書きによる送信の値と妥当性。開始日と終了日の逆転も、下書きの時点で妥当性に反映する。
  const draftFrom = draftState(fromText, locale, constraints)
  const draftTo = draftState(toText, locale, constraints)
  const draftReversed = !!draftFrom.date && !!draftTo.date && isBeforeDate(draftTo.date, draftFrom.date)
  const fromMessage = draftFrom.error ? dateErrorMessage(draftFrom.error, { min, max, locale }) : ""
  const toMessage = draftTo.error
    ? dateErrorMessage(draftTo.error, { min, max, locale })
    : draftReversed
      ? dateErrorMessage("end-before-start")
      : ""

  const commit = (side: "from" | "to", raw: string) => {
    const d = draftState(raw, locale, constraints)
    setErrorsState((prev) => ({ ...prev, [side]: d.error }))
    if (d.date) (side === "from" ? setFromText : setToText)(formatDate(d.date, locale))
    if (!isSameDate(value[side], d.date) && !(value[side] === undefined && d.date === undefined)) {
      ;(side === "from" ? markOwnFrom : markOwnTo)(d.date)
      setValue({ ...value, [side]: d.date })
    }
  }

  const applyRange = (range: DateRange) => {
    setFromText(formatDate(range.from, locale))
    setToText(formatDate(range.to, locale))
    setErrorsState({ from: null, to: null })
    setValue(range)
  }

  useFormEvents(fromRef, {
    submit: () => {
      // 2 つの欄を同時に確定する（commit を続けて呼ぶと、後の呼び出しが前の値を上書きするため）。
      const f = draftState(fromRef.current?.value ?? fromText, locale, constraints)
      const t = draftState(toRef.current?.value ?? toText, locale, constraints)
      setErrorsState({ from: f.error, to: t.error })
      if (f.date) setFromText(formatDate(f.date, locale))
      if (t.date) setToText(formatDate(t.date, locale))
      markOwnFrom(f.date)
      markOwnTo(t.date)
      if (!isSameDate(value.from, f.date) || !isSameDate(value.to, t.date)) setValue({ from: f.date, to: t.date })
    },
    reset: () => {
      const initial = { from: validDate(defaultValue.from), to: validDate(defaultValue.to) }
      applyRange(initial)
    },
  })

  const today = todayIn(timeZone ?? calendarProps?.timeZone)
  const presetRange = (p: DateRangePreset) => p.range(calendarProps?.today ?? today, { weekStartsOn })
  const activePreset = presets?.find((p) => {
    const r = presetRange(p)
    return isSameDate(r.from, value.from) && isSameDate(r.to, value.to)
  })

  const field = (side: "from" | "to") => {
    const inputId = side === "from" ? fromId : toId
    const text = side === "from" ? fromText : toText
    const setText = side === "from" ? setFromText : setToText
    const invalid = errors[side] !== null || (side === "to" && rangeError !== null)
    return (
      <div className={cn("flex min-w-0 flex-1 basis-36 flex-col gap-2", side === "to" && "col-start-1")}>
        <label htmlFor={inputId} className="text-caption text-muted-foreground">
          {side === "from" ? (labels?.start ?? "開始日") : (labels?.end ?? "終了日")}
        </label>
        <input
          ref={side === "from" ? fromRef : toRef}
          id={inputId}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onBlur={(e) => commit(side, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) commit(side, e.currentTarget.value)
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
      {presets.map((p) => {
        const r = presetRange(p)
        // 選べる範囲の外の日や、選べない日で始まる・終わる期間は、選べない。
        const unavailable = checkConstraints(r.from, constraints) !== null || checkConstraints(r.to, constraints) !== null
        return (
          <Button
            key={p.id}
            type="button"
            variant="ghost"
            size="sm"
            disabled={unavailable}
            aria-pressed={activePreset?.id === p.id}
            className={cn("justify-start aria-pressed:bg-accent aria-pressed:font-semibold", narrow && "justify-center")}
            onClick={() => {
              applyRange(r)
              setOpen(false)
            }}
          >
            {p.label}
          </Button>
        )
      })}
    </div>
  )

  // 並べ方は、画面の幅ではなく、置かれた領域の幅（Container Query）で決める。Sheet や Popover の中でも、
  // 開始日と終了日の入力欄の幅をそろえる。
  //   領域が 24rem 以上：開始日 〜 終了日 カレンダーのボタン を 1 行に並べる
  //   領域が 24rem 未満：開始日と終了日を同じ幅で縦に並べ、カレンダーのボタンを終了日の右に置く（「〜」は表示しない）
  // 外側の要素は Container Query の容器のため、内容の幅を自身の幅にしない。幅が内容で決まる場所（inline-flex、
  // 幅を指定しない absolute、grid の auto の列、w-max の要素）では幅が 0 になる。その場合は className で幅を指定する
  // （docs/web/components/date-picker.md の「置く場所の制約」）。
  return (
    <div data-slot="date-range-picker" className={cn("@container/date-range w-full min-w-0", className)}>
    <div className="relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2 gap-y-4 @sm/date-range:flex">
      {field("from")}
      <span aria-hidden="true" className="hidden h-control items-center text-muted-foreground @sm/date-range:flex">
        〜
      </span>
      {field("to")}
      <DateValueInput
        name={startName}
        value={draftFrom.submit}
        message={fromMessage}
        disabled={disabled}
        target={fromRef}
        slot="date-range-from-value"
        onInvalid={() => {
          commit("from", fromRef.current?.value ?? fromText)
          fromRef.current?.focus()
        }}
      />
      <DateValueInput
        name={endName}
        value={draftTo.submit}
        message={toMessage}
        disabled={disabled}
        target={toRef}
        slot="date-range-to-value"
        onInvalid={() => {
          commit("to", toRef.current?.value ?? toText)
          if (!fromMessage) toRef.current?.focus()
        }}
      />
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
    </div>
  )
}

export { DatePicker, dateErrorMessage, DateRangePicker }
export type { DateError, DatePickerProps, DateRangeError, DateRangeErrors, DateRangePickerProps }
