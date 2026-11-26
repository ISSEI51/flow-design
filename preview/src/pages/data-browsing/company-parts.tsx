import { createContext, useContext, type ReactNode } from "react"
import { createColumnHelper } from "@tanstack/react-table"
import { Copy, Ellipsis, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DataTableColumnHeader,
  DataTablePageCheckbox,
  DataTableRowCheckbox,
  DataTableRowTrigger,
  useDataTableStatus,
  type AppliedFilter,
  type DataTableFeatures,
} from "@/components/ui/data-table"
import { DateRangePicker } from "@/components/ui/date-picker"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { fromDateString, toDateString } from "@/lib/date"
import { DataValue } from "@/patterns/data-states"

import { formatDate, formatYen, owners, regions, statusOptions, type Customer } from "../../data/data-display/customers"
import type { CompanyFilters } from "../../data/data-browsing/company-server"
import { FilterSelect, StatusText } from "../data-display/customer-parts"

// Data Browsing の検証画面（製品側のコード）で共通に使う、列の定義、条件の入力、適用中の条件の表示。

export const ownerOptions = owners.map((o) => ({ value: o, label: o }))
export const statusSelectOptions = statusOptions.map((s) => ({ value: s.value, label: s.label }))
export { FilterSelect, StatusText }

const yen = new Intl.NumberFormat("ja-JP")
export const feeLabel = (min: number | null, max: number | null) =>
  min !== null && max !== null
    ? `${yen.format(min)}〜${yen.format(max)}円`
    : min !== null
      ? `${yen.format(min)}円以上`
      : `${yen.format(max ?? 0)}円以下`
const dateLabel = (from: string | null, to: string | null) =>
  from && to ? `${formatDate(from)}〜${formatDate(to)}` : from ? `${formatDate(from)}以降` : `${formatDate(to ?? "")}以前`

// 行の中の操作。行を押したときの詳細の表示とは別にする（DataTable が行の中の button と Portal を除く）。
export type RowAction = "open-page" | "copy-id"
export const RowActionContext = createContext<(action: RowAction, customer: Customer) => void>(() => {})

function RowActions({ customer }: { customer: Customer }) {
  const run = useContext(RowActionContext)
  // 再取得中など、表示中の行が最新と確定していない間は、行を対象にした操作を開けない。
  const { locked } = useDataTableStatus()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={locked}
        render={<Button variant="ghost" size="icon-sm" aria-label={`${customer.company}の操作`} className="pointer-coarse:size-12" />}
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run("open-page", customer)}>
          <ExternalLink />
          詳細ページを開く
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("copy-id", customer)}>
          <Copy />
          顧客IDをコピー
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const helper = createColumnHelper<DataTableFeatures, Customer>()

// サーバー側で並べ替える列だけを enableSorting にする（並べ替えの処理は模擬のサーバーが行う）。
export function companyColumns({ selectable }: { selectable: boolean }) {
  const cols = helper.columns([
    helper.display({
      id: "select",
      header: ({ table }) => <DataTablePageCheckbox table={table} />,
      cell: ({ row }) => <DataTableRowCheckbox row={row} label={`${row.original.company}を選択`} />,
      size: 48,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    }),
    helper.accessor("company", {
      header: ({ column }) => <DataTableColumnHeader column={column} />,
      // キーボードで詳細を開くボタン。行全体のクリックと同じ操作になる。
      cell: ({ row, getValue }) => <DataTableRowTrigger row={row}>{getValue()}</DataTableRowTrigger>,
      meta: { label: "会社名" },
      size: 240,
      minSize: 140,
      enableHiding: false,
      sortDescFirst: false,
    }),
    helper.accessor("status", {
      header: ({ column }) => <DataTableColumnHeader column={column} />,
      cell: ({ getValue }) => <StatusText status={getValue()} />,
      meta: { label: "契約状況" },
      size: 120,
      enableSorting: false,
    }),
    helper.accessor("owner", {
      header: ({ column }) => <DataTableColumnHeader column={column} />,
      meta: { label: "担当者", cellClassName: "whitespace-nowrap" },
      size: 120,
      enableSorting: false,
    }),
    helper.accessor("region", {
      header: ({ column }) => <DataTableColumnHeader column={column} />,
      meta: { label: "地域", cellClassName: "whitespace-nowrap" },
      size: 112,
      enableSorting: false,
    }),
    helper.accessor("monthlyFee", {
      header: ({ column }) => <DataTableColumnHeader column={column} />,
      // 未設定（null）と、無料のプラン（0円）を区別する。
      cell: ({ getValue }) => <DataValue value={{ status: "ready", value: getValue() }} format={formatYen} emptyLabel="未設定" />,
      meta: { label: "月額", align: "right", cellClassName: "whitespace-nowrap" },
      size: 128,
      sortDescFirst: true,
    }),
    helper.accessor("renewalDate", {
      header: ({ column }) => <DataTableColumnHeader column={column} />,
      cell: ({ getValue }) => <DataValue value={{ status: "ready", value: getValue() }} format={formatDate} emptyLabel="未定" />,
      meta: { label: "更新日", cellClassName: "whitespace-nowrap tabular-nums" },
      size: 120,
      sortDescFirst: false,
    }),
    helper.accessor("phone", {
      header: ({ column }) => <DataTableColumnHeader column={column} />,
      // 電話番号のリンクは、行の詳細を開かずに発信する（DataTable が a[href] を除く）。
      cell: ({ getValue }) => (
        <a
          href={`tel:${getValue().replaceAll("-", "")}`}
          className="rounded-xs tabular-nums underline-offset-4 outline-none hover:underline focus-visible:focus-ring"
        >
          {getValue()}
        </a>
      ),
      meta: { label: "電話番号", cellClassName: "whitespace-nowrap" },
      size: 148,
      enableSorting: false,
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => <RowActions customer={row.original} />,
      size: 64,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      meta: { align: "center", cellClassName: "py-0" },
    }),
  ])
  return selectable ? cols : cols.slice(1)
}

// 追加の条件（Sheet、Drawer の中）。値の編集だけを行い、適用は呼び出し側が決める（まとめて適用）。
export const extraFilterKeys = ["regions", "feeMin", "feeMax", "renewalFrom", "renewalTo"] as const satisfies readonly (keyof CompanyFilters)[]

export function ExtraFilterFields({
  value,
  onChange,
  includeFrequent = false,
}: {
  value: CompanyFilters
  onChange: (patch: Partial<CompanyFilters>) => void
  /** モバイルの Drawer では、常時表示の条件（契約状況、担当者）も含める */
  includeFrequent?: boolean
}) {
  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v))
  return (
    <div className="flex flex-col gap-6">
      {includeFrequent && (
        <>
          <Field>
            <FieldLabel>契約状況</FieldLabel>
            <FilterSelect
              label="契約状況"
              value={value.status}
              options={statusSelectOptions}
              onChange={(v) => onChange({ status: v as CompanyFilters["status"] })}
            />
          </Field>
          <Field>
            <FieldLabel>担当者</FieldLabel>
            <FilterSelect label="担当者" value={value.owner} options={ownerOptions} onChange={(v) => onChange({ owner: v })} />
          </Field>
        </>
      )}
      <Field>
        <FieldSet>
          <FieldLegend variant="label">地域</FieldLegend>
          <div className="grid grid-cols-2 gap-x-4">
            {regions.map((r) => (
              <FieldItem key={r}>
                <Checkbox
                  checked={value.regions.includes(r)}
                  onCheckedChange={(checked) => onChange({ regions: checked ? [...value.regions, r] : value.regions.filter((x) => x !== r) })}
                />
                <FieldLabel>{r}</FieldLabel>
              </FieldItem>
            ))}
          </div>
        </FieldSet>
      </Field>
      <FieldSet>
        <FieldLegend variant="label">月額（円）</FieldLegend>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Input
            inputMode="numeric"
            aria-label="月額の下限（円）"
            placeholder="下限"
            value={value.feeMin ?? ""}
            onChange={(e) => onChange({ feeMin: num(e.target.value) })}
          />
          <span aria-hidden="true">〜</span>
          <Input
            inputMode="numeric"
            aria-label="月額の上限（円）"
            placeholder="上限"
            value={value.feeMax ?? ""}
            onChange={(e) => onChange({ feeMax: num(e.target.value) })}
          />
        </div>
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">更新日</FieldLegend>
        <DateRangePicker
          value={{ from: fromDateString(value.renewalFrom), to: fromDateString(value.renewalTo) }}
          onValueChange={(r) =>
            onChange({ renewalFrom: r.from ? toDateString(r.from) : null, renewalTo: r.to ? toDateString(r.to) : null })
          }
          labels={{ start: "更新日の開始", end: "更新日の終了" }}
        />
      </FieldSet>
    </div>
  )
}

// 常時表示していない条件だけを、解除できる形で示す（契約状況と担当者は Select の中に見えているため含めない）。
export function hiddenAppliedFilters(
  filters: CompanyFilters,
  update: (patch: Partial<CompanyFilters>) => void,
  { includeFrequent = false }: { includeFrequent?: boolean } = {}
): AppliedFilter[] {
  const list: AppliedFilter[] = []
  if (includeFrequent && filters.status) {
    list.push({
      id: "status",
      label: "契約状況",
      value: statusOptions.find((s) => s.value === filters.status)!.label,
      onRemove: () => update({ status: null }),
    })
  }
  if (includeFrequent && filters.owner) list.push({ id: "owner", label: "担当者", value: filters.owner, onRemove: () => update({ owner: null }) })
  for (const r of filters.regions) {
    list.push({ id: `region-${r}`, label: "地域", value: r, onRemove: () => update({ regions: filters.regions.filter((x) => x !== r) }) })
  }
  if (filters.feeMin !== null || filters.feeMax !== null) {
    list.push({ id: "fee", label: "月額", value: feeLabel(filters.feeMin, filters.feeMax), onRemove: () => update({ feeMin: null, feeMax: null }) })
  }
  if (filters.renewalFrom || filters.renewalTo) {
    list.push({
      id: "renewal",
      label: "更新日",
      value: dateLabel(filters.renewalFrom, filters.renewalTo),
      onRemove: () => update({ renewalFrom: null, renewalTo: null }),
    })
  }
  return list
}

// 詳細の項目（定義リスト）。ラベルと値を 2 列に並べる。
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere] [word-break:auto-phrase]">{children}</dd>
    </div>
  )
}
