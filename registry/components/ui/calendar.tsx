"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayButtonProps } from "react-day-picker"
import { ja } from "react-day-picker/locale"

import { buttonVariants } from "@/components/ui/button"
import { todayIn } from "@/lib/date"
import { cn } from "@/lib/utils"

// Flow Design Calendar
// shadcn/ui の Calendar と同じく react-day-picker を使い、同じ名前（Calendar、CalendarDayButton）にする。
// 日付を見て選ぶための共通の部品であり、予定の管理は扱わない。
// - 月曜始まりを標準にする（weekStartsOn で変えられる）。ロケールの既定は日本語
// - 年と月をドロップダウンで直接選べる（captionLayout="dropdown"）。前月・翌月のボタンもある
// - 選択は react-day-picker の mode（single、multiple、range）で選ぶ
// - 日付だけを扱う。値はローカル時刻の 0 時の Date。timeZone は「今日」を決めるためだけに使い、
//   react-day-picker には渡さない（選んだ日付が TZDate になり、前日や翌日にずれることを防ぐ）
// - 祝日や土日の色は持たない。必要な製品が modifiers と modifiersClassNames で加える
// 状態の表し方：今日は境界線、選択中は primary の塗り、範囲の内側は muted の帯、選択できない日は透明度 50%、
// 表示月以外の日は muted-foreground。今日を選んだときは、塗りの内側に線を引いて両方を示す。
// 定義は docs/web/components/calendar.md を参照。

type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  /** 「今日」を決めるタイムゾーン（例："Asia/Tokyo"）。省略時はブラウザのタイムゾーン。 */
  timeZone?: string
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  locale = ja,
  weekStartsOn = 1,
  timeZone,
  today: todayProp,
  startMonth,
  endMonth,
  formatters,
  components,
  ...props
}: CalendarProps) {
  const today = todayProp ?? todayIn(timeZone)
  const code = locale.code ?? "ja"
  return (
    <DayPicker
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      locale={locale}
      weekStartsOn={weekStartsOn}
      today={today}
      // 年のドロップダウンの範囲。既定は今日から 100 年前〜10 年後。最小・最大の日付があるときは製品が指定する。
      startMonth={startMonth ?? new Date(today.getFullYear() - 100, 0)}
      endMonth={endMonth ?? new Date(today.getFullYear() + 10, 11)}
      className={cn(
        "group/calendar relative w-fit bg-transparent text-ui text-foreground [--cell-size:2.5rem] pointer-coarse:[--cell-size:3rem]",
        className
      )}
      formatters={{
        formatYearDropdown: (date) => new Intl.DateTimeFormat(code, { year: "numeric" }).format(date),
        formatMonthDropdown: (date) => new Intl.DateTimeFormat(code, { month: "short" }).format(date),
        ...formatters,
      }}
      classNames={{
        root: "w-fit",
        months: "relative flex flex-col gap-8 sm:flex-row",
        month: "flex w-full flex-col gap-2",
        nav: "absolute inset-x-0 top-0 flex h-(--cell-size) items-center justify-between",
        button_previous: buttonVariants({
          variant: "ghost",
          size: "icon-sm",
          className: "size-(--cell-size) rounded-sm aria-disabled:pointer-events-none aria-disabled:opacity-50",
        }),
        button_next: buttonVariants({
          variant: "ghost",
          size: "icon-sm",
          className: "size-(--cell-size) rounded-sm aria-disabled:pointer-events-none aria-disabled:opacity-50",
        }),
        month_caption: "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
        dropdowns: "flex items-center justify-center gap-1 text-body font-medium",
        // ネイティブの select を透明にして文字の上に重ねる。キーボード、スクリーンリーダー、モバイルの選択画面は OS の標準のまま使える。
        dropdown_root: cn(
          "relative flex h-10 items-center rounded-sm",
          "transition-[background-color] duration-(--duration-fast) ease-standard hover:bg-accent",
          "has-focus-visible:focus-ring"
        ),
        dropdown: "absolute inset-0 w-full cursor-pointer appearance-none opacity-0",
        caption_label: cn(
          "flex items-center gap-1 text-body font-medium select-none",
          captionLayout === "label" ? "" : "h-10 px-2 [&>svg]:size-4 [&>svg]:text-muted-foreground"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "flex h-8 w-(--cell-size) items-center justify-center text-caption font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        week_number_header: "w-(--cell-size) select-none",
        week_number: "flex size-(--cell-size) items-center justify-center text-caption text-muted-foreground select-none",
        day: "group/day relative size-(--cell-size) p-0 text-center select-none",
        // 範囲の内側の帯。開始日と終了日は、帯の端を角丸にする。
        range_start: "rounded-l-sm bg-muted",
        range_middle: "bg-muted",
        range_end: "rounded-r-sm bg-muted",
        today: "",
        outside: "",
        disabled: "",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className, size: _size, ...rest }) => {
          const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown
          return <Icon aria-hidden="true" className={cn("size-5", className)} {...rest} />
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({ className, day, modifiers, ...props }: DayButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])
  const single = modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle
  return (
    <button
      ref={ref}
      data-slot="calendar-day"
      data-day={day.isoDate}
      data-today={modifiers.today || undefined}
      data-single={single || undefined}
      data-range-start={modifiers.range_start || undefined}
      data-range-end={modifiers.range_end || undefined}
      data-range-middle={modifiers.range_middle || undefined}
      data-outside={day.outside || undefined}
      data-unavailable={modifiers.disabled || undefined}
      className={cn(
        "relative flex size-(--cell-size) items-center justify-center rounded-sm border border-transparent text-ui text-foreground tabular-nums outline-none",
        "transition-[color,background-color] duration-(--duration-fast) ease-standard",
        "hover:bg-accent focus-visible:z-10 focus-visible:focus-ring",
        "data-outside:text-muted-foreground",
        // 今日：境界線
        "data-today:border-border-strong",
        // 選択中、範囲の開始・終了：primary の塗り
        "data-single:bg-primary data-single:text-primary-foreground data-single:hover:bg-primary/90",
        "data-range-start:bg-primary data-range-start:text-primary-foreground data-range-start:hover:bg-primary/90",
        "data-range-end:bg-primary data-range-end:text-primary-foreground data-range-end:hover:bg-primary/90",
        // 範囲の内側：帯（td の muted）の上に通常の文字
        "data-range-middle:rounded-none data-range-middle:bg-transparent data-range-middle:hover:bg-accent",
        // 今日を選んだとき：塗りの内側に primary-foreground の線を引き、今日であることも示す
        "data-today:data-single:shadow-[inset_0_0_0_2px_var(--primary),inset_0_0_0_3px_var(--primary-foreground)]",
        "data-today:data-range-start:shadow-[inset_0_0_0_2px_var(--primary),inset_0_0_0_3px_var(--primary-foreground)]",
        "data-today:data-range-end:shadow-[inset_0_0_0_2px_var(--primary),inset_0_0_0_3px_var(--primary-foreground)]",
        // 選択できない日
        "data-unavailable:cursor-not-allowed data-unavailable:opacity-50 data-unavailable:hover:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
export type { CalendarProps }
