import { Search, SearchX, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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
import {
  Command,
  CommandCollection,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  useCommandShortcutLabel,
} from "@/components/ui/command"
import { DatePicker, DateRangePicker } from "@/components/ui/date-picker"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { FileUploadButton, FileUploadDropzone, FileUploadItem, FileUploadList } from "@/components/ui/file-upload"
import { MultiSelect } from "@/components/ui/multi-select"
import { dateRangePresets } from "@/lib/date"

import { accounts, prefectures, type Option } from "../data/advanced"

// Advanced Components の SSR と Hydration の検品用の画面。サーバーとブラウザで同じ HTML になることを確かめる。
// 日付は固定する（today と defaultMonth を渡す）。「今日」をサーバーとブラウザで別々に計算すると、
// タイムゾーンや日付の変わり目で HTML が食い違うため。製品でも、サーバーで描画する場合は today を渡す。
const TODAY = new Date(2026, 10, 25)

const groups = [
  {
    value: "pages",
    label: "ページ",
    items: [
      { value: "dashboard", label: "ダッシュボード" },
      { value: "customers", label: "顧客一覧" },
    ],
  },
]

function ShortcutHint() {
  // サーバーと Hydration の間は null。Hydration の後に「⌘K」か「Ctrl+K」になる。
  const label = useCommandShortcutLabel()
  return (
    <Button variant="outline" data-testid="ssr-command-open">
      <Search />
      ページや操作を検索
      {label && (
        <kbd aria-hidden="true" data-testid="ssr-shortcut-label">
          {label}
        </kbd>
      )}
    </Button>
  )
}

export function AdvancedSsrFixture() {
  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-12 px-4 py-8" data-testid="ssr-advanced">
      <h1 className="text-page-title">Advanced Components の SSR</h1>

      <Field className="max-w-sm">
        <FieldLabel>取引先</FieldLabel>
        <Combobox items={accounts} defaultValue={accounts[1]}>
          <ComboboxTrigger data-testid="ssr-combobox">
            <ComboboxValue placeholder="選択してください" />
          </ComboboxTrigger>
          <ComboboxContent>
            <ComboboxInput aria-label="取引先を検索" />
            <ComboboxEmpty>一致する取引先がありません</ComboboxEmpty>
            <ComboboxList>
              {(item: Option) => (
                <ComboboxItem key={item.value} value={item}>
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>

      <Field className="max-w-md">
        <FieldLabel>配送エリア</FieldLabel>
        <MultiSelect options={prefectures} defaultValue={["tokyo", "kanagawa", "chiba", "saitama"]} name="regions" />
      </Field>

      <section className="flex flex-col gap-4">
        <ShortcutHint />
        <div className="max-w-[40rem] rounded-xl border border-border">
          <Command items={groups} className="max-h-64 rounded-xl">
            <CommandInput aria-label="ページを検索" />
            <CommandEmpty>一致する項目がありません</CommandEmpty>
            <CommandList>
              {(group: (typeof groups)[number]) => (
                <CommandGroup key={group.value} items={group.items} heading={group.label}>
                  <CommandCollection>
                    {(item: { value: string; label: string }) => (
                      <CommandItem key={item.value} value={item}>
                        {item.label}
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      </section>

      <div data-testid="ssr-calendar">
        <Calendar mode="single" today={TODAY} defaultMonth={TODAY} selected={new Date(2026, 10, 20)} />
      </div>

      <Field className="max-w-xs">
        <FieldLabel>契約日</FieldLabel>
        <DatePicker name="contract_date" defaultValue={new Date(2026, 3, 1)} calendarProps={{ today: TODAY }} />
      </Field>

      <FieldSet className="max-w-xl">
        <FieldLegend variant="label">集計期間</FieldLegend>
        <DateRangePicker
          startName="from"
          endName="to"
          defaultValue={{ from: new Date(2026, 10, 1), to: TODAY }}
          presets={[dateRangePresets.thisMonth, dateRangePresets.lastMonth]}
          calendarProps={{ today: TODAY }}
        />
      </FieldSet>

      <section className="flex flex-col gap-4">
        <FileUploadButton accept="image/png">画像を変更</FileUploadButton>
        <FileUploadDropzone accept=".csv" maxSize={5 * 1024 * 1024} />
        <FileUploadList>
          <FileUploadItem name="顧客一覧.csv" size={120_000} status="uploading" progress={40} />
          <FileUploadItem name="取引履歴.csv" size={8_000_000} status="processing" progress={null} />
        </FileUploadList>
      </section>

      <Empty status="no-results">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>条件に一致する顧客がいません</EmptyTitle>
          <EmptyDescription>条件を減らすと見つかる場合があります。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="secondary">
            <Users />
            条件をリセット
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
