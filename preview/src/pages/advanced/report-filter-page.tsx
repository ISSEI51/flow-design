import { useMemo, useState } from "react"
import { SearchX } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox"
import { DateRangePicker, dateErrorMessage, type DateError, type DateRangeError } from "@/components/ui/date-picker"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { MultiSelect } from "@/components/ui/multi-select"
import { dateRangePresets, formatDate, isBeforeDate, todayIn, type DateRange } from "@/lib/date"

import { people, prefectures, type Person } from "../../data/advanced"
import { RangeError } from "./date-picker-page"

// 集計期間と対象条件を指定し、結果を確かめる業務画面の例。
// 期間（Date Range Picker とプリセット）、地域（Multi Select）、担当者（Combobox）を組み合わせる。

type Sale = { id: number; date: Date; region: string; owner: string; amount: number }

// 決まった並びの売上データを作る。乱数は使わず、毎回同じ結果にする。
function makeSales(today: Date): Sale[] {
  const regions = ["tokyo", "kanagawa", "chiba", "saitama", "osaka", "aichi", "fukuoka", "hokkaido"]
  return Array.from({ length: 160 }, (_, i) => ({
    id: i + 1,
    date: new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((i * 7) % 120)),
    region: regions[(i * 5) % regions.length],
    owner: people[(i * 3) % 12].value,
    amount: 120_000 + ((i * 7919) % 50) * 18_000,
  }))
}

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" })

const presets = [
  dateRangePresets.thisWeek,
  dateRangePresets.thisMonth,
  dateRangePresets.lastMonth,
  dateRangePresets.last30Days,
  dateRangePresets.thisYear,
]

export function ReportFilterPage() {
  const today = todayIn()
  const sales = useMemo(() => makeSales(today), [today.getTime()])
  const initial = dateRangePresets.thisMonth.range(today, { weekStartsOn: 1 })
  const [range, setRange] = useState<DateRange>(initial)
  const [regions, setRegions] = useState<string[]>([])
  const [owner, setOwner] = useState<Person | null>(null)
  const [errors, setErrors] = useState<{ from: DateError | null; to: DateError | null; range: DateRangeError | null }>({
    from: null,
    to: null,
    range: null,
  })
  const [applied, setApplied] = useState({ range: initial as DateRange, regions: [] as string[], owner: null as Person | null })
  const hasError = !!(errors.from || errors.to || errors.range)

  const rows = sales.filter(
    (s) =>
      (!applied.range.from || !isBeforeDate(s.date, applied.range.from)) &&
      (!applied.range.to || !isBeforeDate(applied.range.to, s.date)) &&
      (applied.regions.length === 0 || applied.regions.includes(s.region)) &&
      (!applied.owner || s.owner === applied.owner.value)
  )
  const total = rows.reduce((n, r) => n + r.amount, 0)
  const byRegion = Object.entries(
    rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.region]: (m[r.region] ?? 0) + r.amount }), {})
  ).sort((a, b) => b[1] - a[1])

  const reset = () => {
    setRange(initial)
    setRegions([])
    setOwner(null)
    setApplied({ range: initial, regions: [], owner: null })
  }
  const messages = [
    errors.from && `開始日：${dateErrorMessage(errors.from)}`,
    errors.to && `終了日：${dateErrorMessage(errors.to)}`,
    errors.range && dateErrorMessage(errors.range),
  ].filter(Boolean) as string[]

  return (
    <article>
      <header className="mb-12">
        <p className="text-caption text-muted-foreground">組み合わせの例</p>
        <h1 className="mt-2 text-page-title">売上の集計</h1>
      </header>

      <form
        className="flex flex-col gap-6"
        data-testid="report-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!hasError) setApplied({ range, regions, owner })
        }}
      >
        <FieldSet>
          <FieldLegend variant="label">集計期間</FieldLegend>
          <DateRangePicker
            value={range}
            onValueChange={setRange}
            onErrorChange={setErrors}
            presets={presets}
            aria-describedby={messages.length ? "report-range-error" : undefined}
          />
          {messages.length > 0 && <RangeError id="report-range-error" errors={messages} />}
        </FieldSet>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field>
            <FieldLabel>地域</FieldLabel>
            <MultiSelect options={prefectures} value={regions} onValueChange={setRegions} placeholder="すべての地域" searchPlaceholder="都道府県名か読みで検索" />
          </Field>
          <Field>
            <FieldLabel>担当者</FieldLabel>
            <Combobox<Person> items={people} value={owner} onValueChange={setOwner} isItemEqualToValue={(a, b) => a.value === b.value}>
              <ComboboxTrigger data-testid="report-owner">
                <ComboboxValue placeholder="すべての担当者" />
              </ComboboxTrigger>
              <ComboboxContent>
                <ComboboxInput placeholder="名前で検索" aria-label="担当者を検索" />
                <ComboboxEmpty>一致する担当者がいません</ComboboxEmpty>
                <ComboboxList>
                  {(p: Person) => (
                    <ComboboxItem key={p.value} value={p}>
                      {p.label}
                      <span className="block text-caption text-muted-foreground">{p.team}</span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={hasError}>
            この条件で集計
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            条件をリセット
          </Button>
        </div>
      </form>

      <section className="mt-16" aria-labelledby="report-result" data-testid="report-result">
        <h2 id="report-result" className="text-section">
          集計結果
        </h2>
        <p className="mt-2 text-ui text-muted-foreground tabular-nums">
          {formatDate(applied.range.from) || "指定なし"} 〜 {formatDate(applied.range.to) || "指定なし"}
          {applied.regions.length > 0 && ` ／ ${applied.regions.length} 地域`}
          {applied.owner && ` ／ ${applied.owner.label}`}
        </p>
        {rows.length === 0 ? (
          <Empty status="no-results" className="mt-8" data-testid="report-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>条件に一致する売上がありません</EmptyTitle>
              <EmptyDescription>期間を広げるか、地域や担当者の条件を外してください。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="secondary" onClick={reset}>
                条件をリセット
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <p className="mt-8 text-metric tabular-nums" data-testid="report-total">
              {yen.format(total)}
            </p>
            <p className="mt-1 text-ui text-muted-foreground tabular-nums">{rows.length} 件の売上</p>
            <table className="mt-8 w-full text-ui">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="h-table-row font-normal">地域</th>
                  <th className="h-table-row text-right font-normal">売上</th>
                </tr>
              </thead>
              <tbody>
                {byRegion.map(([r, v]) => (
                  <tr key={r} className="border-b border-border last:border-b-0">
                    <td className="h-table-row">{prefectures.find((p) => p.value === r)?.label}</td>
                    <td className="h-table-row text-right tabular-nums">{yen.format(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </article>
  )
}
