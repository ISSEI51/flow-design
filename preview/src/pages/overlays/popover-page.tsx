import { useState } from "react"
import { Copy, ListFilter, Mail, Phone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { customers, statusLabel, type Customer } from "../../data/customers"
import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const statuses = Object.entries(statusLabel) as [Customer["status"], string][]
const owners = [
  { value: "all", label: "すべての担当者" },
  { value: "me", label: "自分が担当" },
]

// 絞り込み。条件を選んで「適用」で反映する。Popover の中に Checkbox と Select を置ける。
function FilterPopover() {
  const [open, setOpen] = useState(false)
  const [applied, setApplied] = useState<Customer["status"][]>([])
  const [draft, setDraft] = useState<Customer["status"][]>([])
  const [owner, setOwner] = useState<string | null>("all")
  const list = applied.length ? customers.filter((c) => applied.includes(c.status)) : customers
  return (
    <div className="flex w-full flex-col gap-4">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setDraft(applied)
        }}
      >
        <PopoverTrigger render={<Button variant="outline" size="sm" className="self-start" data-testid="popover-filter-trigger" />}>
          <ListFilter />
          {applied.length ? `絞り込み（${applied.length}）` : "絞り込み"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80" data-testid="popover-filter">
          <PopoverHeader>
            <PopoverTitle>絞り込み</PopoverTitle>
          </PopoverHeader>
          <FieldGroup>
            <Field>
              <FieldSet>
                <FieldLegend variant="label">状態</FieldLegend>
                <div>
                  {statuses.map(([value, label]) => (
                    <FieldItem key={value}>
                      <Checkbox
                        checked={draft.includes(value)}
                        onCheckedChange={(c) => setDraft((d) => (c ? [...d, value] : d.filter((v) => v !== value)))}
                      />
                      <FieldLabel>{label}</FieldLabel>
                    </FieldItem>
                  ))}
                </div>
              </FieldSet>
            </Field>
            <Field>
              <FieldLabel>担当者</FieldLabel>
              <Select items={owners} value={owner} onValueChange={(v) => setOwner(v as string | null)}>
                <SelectTrigger data-testid="popover-filter-owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft([])}>
              条件をリセット
            </Button>
            <Button
              size="sm"
              data-testid="popover-filter-apply"
              onClick={() => {
                setApplied(draft)
                setOpen(false)
              }}
            >
              適用
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <ul data-testid="popover-filter-result" className="flex flex-col text-ui">
        {list.map((c) => (
          <li key={c.id} className="flex justify-between gap-4 border-t border-border py-3 first:border-t-0">
            <span className="min-w-0 [word-break:auto-phrase]">{c.name}</span>
            <span className="shrink-0 text-muted-foreground">{statusLabel[c.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ContactPopover({ customer, testId }: { customer: Customer; testId?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Popover onOpenChange={() => setCopied(false)}>
      <PopoverTrigger render={<Button variant="link" data-testid={testId && `${testId}-trigger`} />}>
        {customer.contact}
      </PopoverTrigger>
      <PopoverContent align="start" data-testid={testId}>
        <PopoverHeader>
          <PopoverTitle>{customer.contact}</PopoverTitle>
          <PopoverDescription>{customer.name}</PopoverDescription>
        </PopoverHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2 text-ui">
          <dt>
            <Mail className="size-5 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">メールアドレス</span>
          </dt>
          <dd className="min-w-0 break-all">{customer.email}</dd>
          <dt>
            <Phone className="size-5 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">電話番号</span>
          </dt>
          <dd>{customer.phone}</dd>
        </dl>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCopied(true)}>
            <Copy />
            メールアドレスをコピー
          </Button>
          <p role="status" className="text-caption text-muted-foreground">
            {copied ? "コピーしました" : ""}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const longText =
  "請求書の発行日は、契約の開始日にかかわらず毎月 25 日です。25 日が土日祝日の場合は、前の営業日に発行します。" +
  "Invoices are issued on the 25th of each month regardless of the contract start date. If the 25th falls on a weekend or holiday, the invoice is issued on the previous business day."

export function PopoverPage() {
  return (
    <article>
      <PageHeader
        name="Popover"
        lead="今の操作に関係する補足の情報や、小さな複合操作を、画面を移らずに表示する。非モーダルで、外側のクリックと Escape で閉じる。"
      />

      <Section
        title="絞り込み"
        lead="Checkbox や Select を置ける。Popover の中で Select を開いたとき、Escape は Select だけを閉じる。"
      >
        <Row label="一覧の絞り込み" note="選んだ条件は「適用」で反映する">
          <FilterPopover />
        </Row>
      </Section>

      <Section title="補足の情報" lead="関係する情報の確認と、それに対する小さな操作をまとめる。">
        <Row label="担当者の連絡先">
          <ContactPopover customer={customers[0]} testId="popover-contact" />
        </Row>
      </Section>

      <Section title="位置" lead="標準は下に開く。画面の端では、はみ出さないように位置と向きを変える。">
        <Row label="画面の両端" note="左端と右端のトリガー">
          <div className="flex w-full justify-between">
            <ContactPopover customer={customers[1]} testId="popover-edge-left" />
            <ContactPopover customer={customers[3]} testId="popover-edge-right" />
          </div>
        </Row>
        <Row label="上に開く" note='side="top"'>
          <Popover>
            <PopoverTrigger render={<Button variant="secondary" />}>請求日について</PopoverTrigger>
            <PopoverContent side="top">
              <PopoverDescription>毎月 25 日に発行します。</PopoverDescription>
            </PopoverContent>
          </Popover>
        </Row>
      </Section>

      <Section title="長い内容" lead="幅は内容に合わせ、360px を超えると折り返す。高さが足りないときは中をスクロールする。">
        <Row label="日本語・英語">
          <Popover>
            <PopoverTrigger render={<Button variant="secondary" data-testid="popover-long-trigger" />}>請求日の決まり</PopoverTrigger>
            <PopoverContent align="start" data-testid="popover-long">
              <PopoverHeader>
                <PopoverTitle>請求日の決まり / Billing date</PopoverTitle>
                <PopoverDescription>{longText}</PopoverDescription>
              </PopoverHeader>
              <PopoverClose render={<Button variant="secondary" size="sm" className="self-end" />}>閉じる</PopoverClose>
            </PopoverContent>
          </Popover>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Popover>
              <PopoverTrigger render={<Button variant="secondary" />}>顧客を登録</PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <PopoverTitle>顧客を登録</PopoverTitle>
                {["会社名", "フリガナ", "担当者", "メールアドレス", "電話番号", "住所"].map((l) => (
                  <Field key={l}>
                    <FieldLabel>{l}</FieldLabel>
                    <Input />
                  </Field>
                ))}
                <Button>登録</Button>
              </PopoverContent>
            </Popover>
          }
          badNote="長いフォームは、外側のクリックで閉じて入力が失われやすい。画面の端からもはみ出す。"
          good={<FilterPopoverMini />}
          goodNote="Popover には、数個の条件や操作だけを置く。長いフォームは Dialog か専用のページにする。"
        />
      </Section>
    </article>
  )
}

function FilterPopoverMini() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <ListFilter />
        絞り込み
      </PopoverTrigger>
      <PopoverContent align="start">
        <Field>
          <FieldSet>
            <FieldLegend variant="label">状態</FieldLegend>
            <div>
              {statuses.map(([value, label]) => (
                <FieldItem key={value}>
                  <Checkbox />
                  <FieldLabel>{label}</FieldLabel>
                </FieldItem>
              ))}
            </div>
          </FieldSet>
        </Field>
      </PopoverContent>
    </Popover>
  )
}
