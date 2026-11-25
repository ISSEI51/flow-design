import { useId, useState, type FormEvent } from "react"
import { addDays, startOfMonth } from "date-fns"
import { CircleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DatePicker, dateErrorMessage, DateRangePicker, type DateError, type DateRangeError } from "@/components/ui/date-picker"
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { dateRangePresets, formatDate, toDateString, todayIn, type DateRange } from "@/lib/date"

import { Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

// Field の外で使うエラーの文。期間の欄は 2 つの入力欄を持つため、FieldSet の下に置く。
export function RangeError({ id, errors }: { id: string; errors: string[] }) {
  return (
    <div id={id} className="flex flex-col gap-1" data-slot="range-error">
      {errors.map((e) => (
        <p key={e} className="flex items-start gap-2 text-ui text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{e}</span>
        </p>
      ))}
    </div>
  )
}

function SingleDate({
  testId,
  label,
  description,
  defaultValue,
  min,
  max,
  isDateDisabled,
  clearable,
  required,
  disabled,
  readOnly,
  name,
}: {
  testId: string
  name?: string
  label: string
  description?: string
  defaultValue?: Date | null
  min?: Date
  max?: Date
  isDateDisabled?: (d: Date) => boolean
  clearable?: boolean
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
}) {
  const [value, setValue] = useState<Date | null>(defaultValue ?? null)
  const [error, setError] = useState<DateError | null>(null)
  return (
    <Field className="max-w-xs" invalid={error !== null} disabled={disabled} data-testid={testId}>
      <FieldLabel>{label}</FieldLabel>
      <DatePicker
        value={value}
        onValueChange={setValue}
        onErrorChange={setError}
        min={min}
        max={max}
        isDateDisabled={isDateDisabled}
        clearable={clearable}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        name={name}
      />
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error ? dateErrorMessage(error, { min, max }) : null}</FieldError>
      <p data-testid={`${testId}-value`} className="text-caption text-muted-foreground tabular-nums">
        確定した値：{value ? toDateString(value) : "なし"}
      </p>
    </Field>
  )
}

function RangeField({
  testId,
  legend,
  presets,
  defaultValue,
  min,
  max,
}: {
  testId: string
  legend: string
  presets?: boolean
  defaultValue?: DateRange
  min?: Date
  max?: Date
}) {
  const [value, setValue] = useState<DateRange>(defaultValue ?? { from: undefined, to: undefined })
  const [errors, setErrors] = useState<{ from: DateError | null; to: DateError | null; range: DateRangeError | null }>({
    from: null,
    to: null,
    range: null,
  })
  const errorId = useId()
  const messages = [
    errors.from && `開始日：${dateErrorMessage(errors.from, { min, max })}`,
    errors.to && `終了日：${dateErrorMessage(errors.to, { min, max })}`,
    errors.range && dateErrorMessage(errors.range),
  ].filter(Boolean) as string[]
  return (
    <FieldSet className="w-full max-w-xl" data-testid={testId}>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <DateRangePicker
        value={value}
        onValueChange={setValue}
        onErrorChange={setErrors}
        min={min}
        max={max}
        aria-describedby={messages.length ? errorId : undefined}
        presets={
          presets
            ? [
                dateRangePresets.today,
                dateRangePresets.thisWeek,
                dateRangePresets.thisMonth,
                dateRangePresets.lastMonth,
                dateRangePresets.last7Days,
                dateRangePresets.last30Days,
                dateRangePresets.thisYear,
              ]
            : undefined
        }
      />
      {messages.length > 0 && <RangeError id={errorId} errors={messages} />}
      <p data-testid={`${testId}-value`} className="text-caption text-muted-foreground tabular-nums">
        送信される値：{value.from ? toDateString(value.from) : "（なし）"} 〜 {value.to ? toDateString(value.to) : "（なし）"}
      </p>
    </FieldSet>
  )
}

// フォームの送信の例。製品は送信の前に form.checkValidity() を確かめる。
// Date Picker は、不正な入力、範囲外、開始日と終了日の逆転があると、入力欄の妥当性を不正にする（setCustomValidity）。
// noValidate のフォームでは、ブラウザは送信を止めないため、製品がここで止める。
function FormExample() {
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<string[]>([])
  const [contract, setContract] = useState<Date | null>(new Date(2026, 3, 1))
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    if (!form.checkValidity()) {
      // Date Picker の値と妥当性は、見えない入力欄が持つ。data-for から、見える入力欄とラベルをたどる。
      const invalid = Array.from(form.elements).filter(
        (el): el is HTMLInputElement => el instanceof HTMLInputElement && !el.validity.valid
      )
      const visible = (el: HTMLInputElement) => (el.dataset.for ? (document.getElementById(el.dataset.for) as HTMLInputElement) : el)
      setBlocked(invalid.map((el) => `${visible(el).labels?.[0]?.textContent ?? el.name}：${el.validationMessage}`))
      setSubmitted(null)
      if (invalid[0]) visible(invalid[0]).focus()
      return
    }
    setBlocked([])
    const fd = new FormData(form)
    setSubmitted(`contract_date=${fd.get("contract_date")}, from=${fd.get("from")}, to=${fd.get("to")}`)
  }
  return (
    <form
      onSubmit={onSubmit}
      onReset={() => {
        setSubmitted(null)
        setBlocked([])
      }}
      noValidate
      className="flex w-full max-w-xl flex-col gap-6"
      data-testid="date-form"
    >
      <Field className="max-w-xs">
        <FieldLabel>契約日</FieldLabel>
        <DatePicker name="contract_date" value={contract} onValueChange={setContract} defaultValue={new Date(2026, 3, 1)} required />
      </Field>
      <FieldSet>
        <FieldLegend variant="label">請求の対象期間</FieldLegend>
        <DateRangePicker startName="from" endName="to" defaultValue={{ from: new Date(2026, 3, 1), to: new Date(2026, 3, 30) }} />
      </FieldSet>
      {blocked.length > 0 && <RangeError id="date-form-errors" errors={blocked} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">送信</Button>
        <Button type="reset" variant="secondary">
          初期値に戻す
        </Button>
        <Button type="button" variant="ghost" onClick={() => setContract(new Date(2026, 4, 15))} data-testid="date-form-external">
          契約日を 2026/05/15 にする
        </Button>
      </div>
      <output data-testid="date-form-result" className="text-ui text-muted-foreground">
        {submitted}
      </output>
    </form>
  )
}

export function DatePickerPage() {
  const today = todayIn()
  return (
    <article>
      <PageHeader
        name="Date Picker"
        lead="日付と期間を入力する。直接入力しても、カレンダーから選んでもよい。入力中の文字と、確定した日付を区別する。"
      />

      <Section
        title="単一の日付"
        lead="YYYY/MM/DD で入力する。区切りのない 8 桁（20261125）や全角の数字も受け付ける。フォーカスが外れたときと Enter で確定する。"
      >
        <Row label="直接入力とカレンダー" note="入力した日付は、カレンダーを開くと選択されている">
          <SingleDate testId="date-basic" label="契約日" clearable />
        </Row>
        <Row label="不正な日付" note="2026/02/30 のような存在しない日付は受け付けない。形式の誤りとは別の文言で示す">
          <SingleDate testId="date-invalid" label="納品日" description="例：2026/02/30、2026/13/01、2026/1 を入力する" />
        </Row>
        <Row label="うるう年" note="2028/02/29 は選べる。2027/02/29 は存在しない">
          <SingleDate testId="date-leap" label="更新日" defaultValue={new Date(2028, 1, 29)} />
        </Row>
        <Row label="選択できる範囲" note="今日から 90 日後まで。土日は選べない">
          <SingleDate
            testId="date-range-limit"
            label="訪問の希望日"
            min={today}
            max={addDays(today, 90)}
            isDateDisabled={(d) => d.getDay() === 0 || d.getDay() === 6}
            description={`${formatDate(today)}〜${formatDate(addDays(today, 90))} の平日`}
          />
        </Row>
      </Section>

      <Section
        title="期間"
        lead="開始日と終了日を別々に確かめられる。終了日が開始日より前のときはエラーにし、自動で入れ替えない。片側だけの指定もできる。"
      >
        <Row label="開始日と終了日" note="カレンダーでは、1 回目に開始日、2 回目に終了日を選ぶ">
          <RangeField testId="date-period" legend="対象期間" />
        </Row>
        <Row label="プリセット" note="よく使う期間がある場合だけ表示する。今日を基準に計算する">
          <RangeField testId="date-presets" legend="集計期間" presets />
        </Row>
        <Row label="プリセットと制約" note="今月の 1 日より前は選べない。合わないプリセットは押せない">
          <RangeField testId="date-presets-min" legend="集計期間" presets min={startOfMonth(today)} max={today} />
        </Row>
      </Section>

      <Section title="状態">
        <Row label="フォームの送信" note="日付は YYYY-MM-DD で送信する。タイムゾーンによって前日や翌日にずれない">
          <FormExample />
        </Row>
        <Row label="無効">
          <SingleDate testId="date-disabled" label="契約日" name="disabled_date" defaultValue={new Date(2026, 3, 1)} disabled />
        </Row>
        <Row label="読み取り専用" note="カレンダーのボタンを出さない">
          <SingleDate testId="date-readonly" label="契約日" name="readonly_date" defaultValue={new Date(2026, 3, 1)} readOnly />
        </Row>
      </Section>
    </article>
  )
}
