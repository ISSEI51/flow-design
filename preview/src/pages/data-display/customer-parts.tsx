import { createContext, useContext, type ReactNode } from "react"
import { createColumnHelper, type FilterFn } from "@tanstack/react-table"
import { Copy, Ellipsis, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DataTableColumnHeader,
  DataTablePageCheckbox,
  DataTableRowCheckbox,
  DataTableRowTrigger,
  useDataTableStatus,
  type DataTableFeatures,
} from "@/components/ui/data-table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { TableNoValue } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { formatDate, formatYen, statusLabel, type ContractStatus, type Customer } from "../../data/data-display/customers"

// 顧客管理の例で共通に使う、列の定義、契約状況の表示、絞り込みの Select、詳細の表示。

const statusTone: Record<ContractStatus, string> = {
  active: "bg-success",
  trial: "bg-info",
  paused: "bg-warning",
  cancelled: "bg-border-strong",
}

// 色の印と文字で示す。色だけに頼らない。文字は foreground にし、選択中の行の面でもコントラストを保つ。
export function StatusText({ status }: { status: ContractStatus }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", statusTone[status])} />
      {statusLabel[status]}
    </span>
  )
}

// 地域の複数選択。値が空の配列なら、すべての行を残す。
const regionFilter: FilterFn<DataTableFeatures, Customer> = (row, id, value: string[]) =>
  value.length === 0 || value.includes(row.getValue<string>(id))

const helper = createColumnHelper<DataTableFeatures, Customer>()

export const customerColumns = helper.columns([
  helper.display({
    id: "select",
    header: ({ table }) => <DataTablePageCheckbox table={table} />,
    cell: ({ row }) => <DataTableRowCheckbox row={row} label={`${row.original.company}を選択`} />,
    size: 48,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    enablePinning: false,
  }),
  helper.accessor("company", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row, getValue }) => <DataTableRowTrigger row={row}>{getValue()}</DataTableRowTrigger>,
    meta: { label: "会社名" },
    size: 260,
    minSize: 160,
    enableHiding: false,
    filterFn: "includesString",
    sortFn: "text",
  }),
  helper.accessor("status", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ getValue }) => <StatusText status={getValue()} />,
    meta: { label: "契約状況" },
    size: 128,
    enableSorting: false,
    filterFn: "equalsString",
  }),
  helper.accessor("owner", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    meta: { label: "担当者", cellClassName: "whitespace-nowrap" },
    size: 128,
    enableSorting: false,
    filterFn: "equalsString",
  }),
  helper.accessor("region", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    meta: { label: "地域", cellClassName: "whitespace-nowrap" },
    size: 112,
    enableSorting: false,
    filterFn: regionFilter,
  }),
  helper.accessor("monthlyFee", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ getValue }) => {
      const v = getValue()
      return v === null ? <TableNoValue label="未設定" /> : formatYen(v)
    },
    meta: { label: "月額", align: "right", cellClassName: "whitespace-nowrap" },
    size: 136,
    // 金額は大きい順から見ることが多いため、初めに押したときは降順にする。
    sortDescFirst: true,
    sortFn: "basic",
    sortUndefined: "last",
  }),
  helper.accessor("seats", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ getValue }) => `${getValue().toLocaleString("ja-JP")}人`,
    meta: { label: "利用者数", align: "right", cellClassName: "whitespace-nowrap" },
    size: 120,
    sortDescFirst: true,
    sortFn: "basic",
  }),
  helper.accessor((c) => (c.renewalDate ? new Date(c.renewalDate) : undefined), {
    id: "renewalDate",
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    cell: ({ row }) => (row.original.renewalDate ? formatDate(row.original.renewalDate) : <TableNoValue label="未定" />),
    meta: { label: "更新日", cellClassName: "whitespace-nowrap tabular-nums" },
    size: 128,
    // 更新日は近い順に見るため、初めに押したときは昇順にする（日付の列の既定は降順）。
    sortDescFirst: false,
    sortFn: "datetime",
    sortUndefined: "last",
  }),
  helper.accessor("phone", {
    header: ({ column }) => <DataTableColumnHeader column={column} />,
    // 電話番号は数値として比べないため、左寄せのまま桁だけそろえる。
    meta: { label: "電話番号", cellClassName: "whitespace-nowrap tabular-nums" },
    size: 152,
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
    enablePinning: false,
    // ボタンが 40px のため、上下の余白を取らずに行の高さ 48px に収める。
    meta: { align: "center", cellClassName: "py-0" },
  }),
])

// 行の中の操作（Dropdown Menu）。押しても行の詳細は開かない（DataTable が行の中の button と Portal を除く）。
export const RowActionContext = createContext<(action: "compose" | "copy", customer: Customer) => void>(() => {})

// 再取得中などで表が locked の間は、表示中の古い行を対象にした操作を防ぐため、メニューを開けない。
function RowActions({ customer }: { customer: Customer }) {
  const run = useContext(RowActionContext)
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
        <DropdownMenuItem onClick={() => run("compose", customer)}>
          <Mail />
          メールを作成
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("copy", customer)}>
          <Copy />
          顧客IDをコピー
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type Option = { value: string; label: string }

// 頻繁に使う条件を、一覧の上に個別に表示する Select。選んだ値は欄の中に残るため、適用中の条件として重複して並べない。
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  value: string | null
  options: readonly Option[]
  onChange: (value: string | null) => void
  testId?: string
}) {
  const items = [{ value: "all", label: "すべて" }, ...options]
  return (
    <Select items={items} value={value ?? "all"} onValueChange={(v) => onChange(v === "all" || v == null ? null : String(v))}>
      <SelectTrigger aria-label={label} data-testid={testId} className="w-auto min-w-0 text-ui">
        <SelectValue>{(v: string) => `${label}：${items.find((i) => i.value === v)?.label ?? "すべて"}`}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere] [word-break:auto-phrase]">{children}</dd>
    </div>
  )
}

// 行の詳細。閲覧の Sheet（非モーダル）で開く。一覧を操作しながら、別の行の詳細に切り替えられる。
// 開くとフォーカスを Sheet に移し、閉じると開いた行の会社名のボタンに戻す。
export function CustomerDetail({
  customer,
  onClose,
  returnFocus,
}: {
  customer: Customer | null
  onClose: () => void
  /** 閉じた後にフォーカスを戻す要素 */
  returnFocus: () => HTMLElement | null
}) {
  return (
    <Sheet mode="view" open={customer !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent data-testid="customer-detail" closeLabel="詳細を閉じる" finalFocus={() => returnFocus() ?? true}>
        {customer && (
          <>
            <SheetHeader>
              <SheetTitle className="[word-break:auto-phrase]">{customer.company}</SheetTitle>
              <SheetDescription>{customer.id}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <dl className="grid gap-3 text-ui">
                <DetailRow label="契約状況">
                  <StatusText status={customer.status} />
                </DetailRow>
                <DetailRow label="担当者">{customer.owner}</DetailRow>
                <DetailRow label="地域">{customer.region}</DetailRow>
                <DetailRow label="業種">{customer.industry}</DetailRow>
                <DetailRow label="月額">{customer.monthlyFee === null ? <TableNoValue label="未設定" /> : formatYen(customer.monthlyFee)}</DetailRow>
                <DetailRow label="利用者数">{customer.seats.toLocaleString("ja-JP")}人</DetailRow>
                <DetailRow label="更新日">{customer.renewalDate ? formatDate(customer.renewalDate) : <TableNoValue label="未定" />}</DetailRow>
                <DetailRow label="電話番号">{customer.phone}</DetailRow>
                <DetailRow label="メール">{customer.email}</DetailRow>
                <DetailRow label="備考">{customer.note ?? <TableNoValue label="なし" />}</DetailRow>
              </dl>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
