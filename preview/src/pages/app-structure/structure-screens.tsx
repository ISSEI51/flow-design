import { useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react"
import { Download, Mail, Pencil, Plus, Search } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldOptionalMark, FieldRequiredMark } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { PageColumns, PageLayout } from "@/patterns/page-layout"
import { TableScrollArea } from "@/patterns/table-scroll-area"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import {
  Section,
  SectionActions,
  SectionDescription,
  SectionHeader,
  SectionHeading,
  SectionStack,
  SectionTitle,
} from "@/patterns/section-layout"

import {
  customers,
  formatDate,
  formatYen,
  owners,
  regions,
  statusLabel,
  type ContractStatus,
  type Customer,
} from "../../data/data-display/customers"
import { RegionBarChart, RevenueLineChart } from "../data-display/charts"

// App Structure の検証用の画面。正式な Pages の実装ではない。
// 画面の目的に合わせて PageLayout の幅を選び、Page Header と Section Layout で内容を組み立てる。

export type Go = (page: string, extra?: Record<string, string>) => (event: MouseEvent) => void
export type Href = (page: string, extra?: Record<string, string>) => string

const statusVariant: Record<ContractStatus, "success" | "info" | "warning" | "neutral"> = {
  active: "success",
  trial: "info",
  paused: "warning",
  cancelled: "neutral",
}

const listRows = customers.slice(0, 40)
const today = "2026-11-25"
// 件数は絞り込んだすべての契約から求め、一覧は先頭の 6 件だけを表示する（残りの件数とリンクを示す）。
const renewalsAll = customers
  .filter((c) => c.status === "active" && c.renewalDate !== null && c.renewalDate >= today && c.renewalDate <= "2026-12-25")
  .sort((a, b) => a.renewalDate!.localeCompare(b.renewalDate!))
const renewals = renewalsAll.slice(0, 6)

// プレビューでは実行しない操作。押しても何も起きない状態にせず、実行しないことを伝える。
function usePreviewOnly() {
  const { toast } = useToast()
  return (action: string) => () => toast({ title: `${action}は、この検証用の画面では実行しない` })
}

function TextLink({ href, onClick, children }: { href: string; onClick: (e: MouseEvent) => void; children: ReactNode }) {
  return (
    <a href={href} onClick={onClick} className="rounded-xs font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring">
      {children}
    </a>
  )
}

function CustomerCrumbs({ href, go, current }: { href: Href; go: Go; current: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href={href("customers")} onClick={go("customers")}>
            顧客
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

// ---------------------------------------------------------------- ダッシュボード（Wide）
const periods = [
  { value: "month", label: "今月" },
  { value: "quarter", label: "今四半期" },
  { value: "year", label: "今年度" },
]

// 期間で変わる指標（売上）。契約中の顧客、更新、未入金は、基準日の時点の値のため期間で変えない。
const salesByPeriod: Record<string, [string, string]> = {
  month: ["4,820万円", "前月比 +8.0%"],
  quarter: ["1億4,210万円", "前四半期比 +5.2%"],
  year: ["4億1,930万円", "前年度比 +11.4%"],
}

export function DashboardScreen({ href, go, title }: { href: Href; go: Go; title: string }) {
  const [period, setPeriod] = useState("month")
  const periodLabel = periods.find((p) => p.value === period)!.label
  const active = customers.filter((c) => c.status === "active").length
  const trial = customers.filter((c) => c.status === "trial").length
  return (
    <PageLayout width="wide" data-testid="screen-dashboard">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{title}</PageHeaderTitle>
          <PageHeaderDescription>2026 年 11 月 25 日時点。金額は税抜き。</PageHeaderDescription>
        </PageHeaderContent>
        {/* 分析の画面：ページ全体の条件（期間）をタイトルの右に置く */}
        <PageHeaderActions>
          <Select items={periods} value={period} onValueChange={(v) => setPeriod(String(v))}>
            <SelectTrigger aria-label="期間" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PageHeaderActions>
      </PageHeader>
      <SectionStack>
        <Section>
          <SectionHeader className="sr-only">
            <SectionTitle>{periodLabel}の状況</SectionTitle>
          </SectionHeader>
          {/* 指標は余白と文字の強弱で区切る。Card で囲まない */}
          <dl className="grid grid-cols-2 gap-x-8 gap-y-8 @4xl/page:grid-cols-4">
            {[
              [`${periodLabel}の売上`, ...salesByPeriod[period]],
              ["契約中の顧客", `${active}件`, `試用中 ${trial}件`],
              ["30 日以内に更新", `${renewalsAll.length}件`, "12 月 25 日まで"],
              ["未入金", "38万円", "3 社"],
            ].map(([k, v, n]) => (
              <div key={k} className="min-w-0" data-testid={`metric-${k}`}>
                <dt className="text-ui text-muted-foreground">{k}</dt>
                <dd className="mt-1 text-metric tabular-nums">{v}</dd>
                <dd className="mt-1 text-caption text-muted-foreground">{n}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <Section divider>
          <SectionHeader>
            <SectionHeading>
              <SectionTitle>推移と内訳</SectionTitle>
            </SectionHeading>
          </SectionHeader>
          <PageColumns layout="equal" className="gap-y-12">
            <RevenueLineChart testId="structure-line" />
            <RegionBarChart highlight="関東" testId="structure-bar" />
          </PageColumns>
        </Section>
        <Section divider>
          <SectionHeader>
            <SectionHeading>
              <SectionTitle>更新が近い契約</SectionTitle>
              <SectionDescription>更新日が 12 月 25 日までの契約。担当者が更新の意向を確かめる。</SectionDescription>
            </SectionHeading>
            <SectionActions>
              <a href={href("customers")} onClick={go("customers")} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                顧客の一覧を開く
              </a>
            </SectionActions>
          </SectionHeader>
          <ul>
            {renewals.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0">
                <TextLink href={href("customer", { id: c.id })} onClick={go("customer", { id: c.id })}>
                  {c.company}
                </TextLink>
                <span className="text-ui text-muted-foreground tabular-nums">
                  {formatDate(c.renewalDate!)} に更新・担当 {c.owner}
                </span>
              </li>
            ))}
          </ul>
          {renewalsAll.length > renewals.length && (
            <p className="text-ui text-muted-foreground">
              ほか {renewalsAll.length - renewals.length}件。
              <a href={href("renewals")} onClick={go("renewals")} className="ml-1 rounded-xs text-foreground underline underline-offset-4 outline-none focus-visible:focus-ring">
                更新が近い契約をすべて見る
              </a>
            </p>
          )}
        </Section>
      </SectionStack>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 顧客一覧（Full Width）
const statusFilter = [{ value: "all", label: "すべての状態" }, ...Object.entries(statusLabel).map(([value, label]) => ({ value, label }))]

export function CustomersScreen({ href, go, title }: { href: Href; go: Go; title: string }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<string>("all")
  const rows = listRows.filter((c) => (status === "all" || c.status === status) && c.company.includes(query))
  const previewOnly = usePreviewOnly()
  return (
    <PageLayout width="full" data-testid="screen-customers">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{title}</PageHeaderTitle>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="secondary" onClick={previewOnly("書き出し")}>
            <Download />
            書き出す
          </Button>
          <a href={href("customer-new")} onClick={go("customer-new")} className={buttonVariants()}>
            <Plus />
            顧客を登録
          </a>
        </PageHeaderActions>
      </PageHeader>
      <div className="flex min-w-0 flex-col gap-4">
        <div role="search" aria-label="顧客の絞り込み" className="flex flex-wrap gap-3">
          <div className="relative w-full sm:w-80">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="会社名で検索" placeholder="会社名で検索" className="pl-11" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Select items={statusFilter} value={status} onValueChange={(v) => setStatus(String(v))}>
            <SelectTrigger aria-label="状態" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusFilter.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-ui text-muted-foreground tabular-nums" aria-live="polite">
          {rows.length}件
        </p>
        {/* 列が多い表は、表の領域の中だけで横にスクロールする。ページ全体は横にスクロールしない。
            横に続く列があることは、スクロールできる方向の端の影で示す（TableScrollArea。Data Browsing の List & Detail） */}
        <TableScrollArea data-testid="customers-table-scroll">
        <Table data-testid="customers-table" containerClassName="min-w-0">
          <TableHeader>
            <TableRow>
              <TableHead>会社名</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>担当</TableHead>
              <TableHead>地域</TableHead>
              <TableHead>業種</TableHead>
              <TableHead align="right">月額</TableHead>
              <TableHead align="right">席数</TableHead>
              <TableHead>更新日</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap">
                  <TextLink href={href("customer", { id: c.id })} onClick={go("customer", { id: c.id })}>
                    {c.company}
                  </TextLink>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">{c.owner}</TableCell>
                <TableCell className="whitespace-nowrap">{c.region}</TableCell>
                <TableCell className="whitespace-nowrap">{c.industry}</TableCell>
                <TableCell align="right" className="whitespace-nowrap">
                  {c.monthlyFee === null ? "未設定" : formatYen(c.monthlyFee)}
                </TableCell>
                <TableCell align="right">{c.seats}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{c.renewalDate ? formatDate(c.renewalDate) : "未定"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableScrollArea>
      </div>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 顧客詳細（Standard）
function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 @2xl/page:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-ui text-muted-foreground">{k}</dt>
          <dd className="mt-1 text-body [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// 状態と更新日から、担当者が次にすることを決める。
function nextAction(c: Customer) {
  if (c.status === "cancelled") return "解約済み。再契約の相談があった場合は、新しい契約として登録する。"
  if (c.status === "paused") return "休止中。再開の予定を担当者が確かめる。"
  if (c.status === "trial") return "試用中。試用の終了の前に、契約の意向を確かめる。"
  if (!c.renewalDate) return "次の更新日が決まっていない。担当者が契約の予定を確かめる。"
  if (c.renewalDate < today) return `更新日（${formatDate(c.renewalDate)}）を過ぎている。更新の手続きの状況を確かめる。`
  return `${formatDate(c.renewalDate)} の更新の 30 日前までに、更新の意向を確かめる。`
}

export function CustomerScreen({ id, href, go, long }: { id: string | null; href: Href; go: Go; long: boolean }) {
  const previewOnly = usePreviewOnly()
  const found = customers.find((x) => x.id === id)
  if (!found) {
    return (
      <PageLayout width="standard" data-testid="screen-customer-missing">
        <PageHeader breadcrumb={<CustomerCrumbs href={href} go={go} current="見つからない顧客" />}>
          <PageHeaderContent>
            <PageHeaderTitle>顧客が見つからない</PageHeaderTitle>
            <PageHeaderDescription>削除されたか、URL が誤っている可能性がある。</PageHeaderDescription>
          </PageHeaderContent>
        </PageHeader>
        <a href={href("customers")} onClick={go("customers")} className={buttonVariants({ variant: "secondary" }) + " self-start"}>
          顧客の一覧に戻る
        </a>
      </PageLayout>
    )
  }
  const c: Customer = found
  const company = long ? `${c.company} 北日本営業本部 札幌第二営業所 法人営業課` : c.company
  return (
    <PageLayout width="standard" data-testid="screen-customer">
      {/* 一覧から開いた詳細は、戻る先（顧客の一覧）を Breadcrumb で示す */}
      <PageHeader breadcrumb={<CustomerCrumbs href={href} go={go} current={company} />}>
        <PageHeaderContent>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <PageHeaderTitle>{company}</PageHeaderTitle>
            <Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge>
          </div>
          <PageHeaderDescription>
            {c.industry}・{c.region}・担当 {c.owner}
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="secondary" onClick={previewOnly("メールの作成")}>
            <Mail />
            メールを作成
          </Button>
          <Button onClick={previewOnly("編集")}>
            <Pencil />
            編集
          </Button>
        </PageHeaderActions>
      </PageHeader>
      {/* メインと補足。狭い領域では DOM の順（メイン → 補足）に 1 列で並ぶ */}
      <PageColumns layout="main-aside">
        {/* セクションの間は余白（48px）と見出しで区切り、線を足さない */}
        <SectionStack>
          <Section>
            <SectionHeader>
              <SectionTitle>契約</SectionTitle>
            </SectionHeader>
            <Facts
              items={[
                ["月額", c.monthlyFee === null ? "未設定" : formatYen(c.monthlyFee)],
                ["席数", `${c.seats}席`],
                ["次の更新日", c.renewalDate ? formatDate(c.renewalDate) : "未定"],
                ["顧客 ID", c.id],
              ]}
            />
          </Section>
          <Section>
            <SectionHeader>
              <SectionTitle>連絡先</SectionTitle>
            </SectionHeader>
            <Facts
              items={[
                ["電話番号", c.phone],
                ["メールアドレス", c.email],
              ]}
            />
          </Section>
          <Section>
            <SectionHeader>
              <SectionTitle>社内メモと履歴</SectionTitle>
            </SectionHeader>
            {/* 参照の頻度が低い情報だけを折りたたむ */}
            <Accordion>
              <AccordionItem value="note">
                <AccordionTrigger>社内メモ</AccordionTrigger>
                <AccordionContent>{c.note ?? "メモはまだない。"}</AccordionContent>
              </AccordionItem>
              <AccordionItem value="history">
                <AccordionTrigger>変更履歴</AccordionTrigger>
                <AccordionContent>2026 年 10 月 28 日に、追加の 20 席の契約を締結した。</AccordionContent>
              </AccordionItem>
            </Accordion>
          </Section>
        </SectionStack>
        {/* 補足の列は、見出しを 1 段下げ（h3・20px）、メインより弱く示す。h2 は支援技術にだけ示す */}
        <aside aria-labelledby="customer-aside-title" data-testid="customer-aside">
          <Section titleId="customer-aside-title">
            <SectionHeader className="sr-only">
              <SectionTitle>補足の情報</SectionTitle>
            </SectionHeader>
            <SectionStack spacing="group">
              <Section>
                <SectionHeader>
                  <SectionTitle>次にすること</SectionTitle>
                </SectionHeader>
                <p className="text-ui" data-testid="next-action">
                  {nextAction(c)}
                </p>
              </Section>
              <Section>
                <SectionHeader>
                  <SectionTitle>最近の活動</SectionTitle>
                </SectionHeader>
                <ul className="flex flex-col gap-4">
                  {[
                    ["2026/11/20", `${c.owner}が、契約について電話で連絡した`],
                    ["2026/11/12", "11 月分の請求書を送付した"],
                  ].map(([d, t]) => (
                    <li key={d}>
                      <p className="text-caption text-muted-foreground tabular-nums">{d}</p>
                      <p className="mt-1 text-ui">{t}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            </SectionStack>
          </Section>
        </aside>
      </PageColumns>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 顧客登録（Focused）
const industryOptions = ["卸売業", "製造業", "運輸業", "情報通信業", "小売業"].map((v) => ({ value: v, label: v }))
const regionOptions = regions.map((v) => ({ value: v, label: v }))
const ownerOptions = owners.map((v) => ({ value: v, label: v }))

export function CustomerNewScreen({ href, go, onCreated }: { href: Href; go: Go; onCreated: (company: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const companyRef = useRef<HTMLInputElement>(null)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const company = String(new FormData(e.currentTarget).get("company") ?? "").trim()
    if (!company) {
      setError("会社名を入力してください")
      companyRef.current?.focus()
      return
    }
    onCreated(company)
  }
  return (
    <PageLayout width="focused" data-testid="screen-customer-new">
      <PageHeader breadcrumb={<CustomerCrumbs href={href} go={go} current="顧客を登録" />}>
        <PageHeaderContent>
          <PageHeaderTitle>顧客を登録</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      {/* 入力は順序のある手続きのため 1 列にする */}
      <form noValidate onSubmit={submit} className="flex flex-col gap-12">
        <Section>
          <SectionHeader>
            <SectionTitle>会社の情報</SectionTitle>
          </SectionHeader>
          <FieldGroup>
            <Field invalid={error !== null}>
              <FieldLabel>
                会社名
                <FieldRequiredMark />
              </FieldLabel>
              <Input ref={companyRef} name="company" autoComplete="organization" onChange={() => setError(null)} />
              {error && <FieldError match>{error}</FieldError>}
            </Field>
            <Field>
              <FieldLabel>業種</FieldLabel>
              <Select items={industryOptions} name="industry" defaultValue="卸売業">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {industryOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>地域</FieldLabel>
              <Select items={regionOptions} name="region" defaultValue="関東">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {regionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </Section>
        <Section>
          <SectionHeader>
            <SectionTitle>担当</SectionTitle>
          </SectionHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>社内の担当者</FieldLabel>
              <Select items={ownerOptions} name="owner" defaultValue={owners[0]}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ownerOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>
                先方の連絡先のメールアドレス
                <FieldOptionalMark />
              </FieldLabel>
              <Input type="email" name="email" autoComplete="email" />
            </Field>
          </FieldGroup>
        </Section>
        {/* 使う頻度が低い詳細の設定だけを折りたたむ。閉じても入力した値は残る（Accordion の keepMounted） */}
        <Accordion>
          <AccordionItem value="billing">
            <AccordionTrigger level={2}>請求の設定</AccordionTrigger>
            <AccordionContent>
              <FieldGroup className="pt-2">
                <Field>
                  <FieldLabel>
                    請求書の送付先
                    <FieldOptionalMark />
                  </FieldLabel>
                  <Input type="email" name="billingEmail" data-testid="billing-email" />
                  <FieldDescription>未入力の場合は、先方の連絡先に送る</FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox name="paper" />
                  <FieldLabel>紙の請求書も郵送する</FieldLabel>
                </Field>
              </FieldGroup>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div className="flex flex-wrap justify-end gap-2">
          <a href={href("customers")} onClick={go("customers")} className={buttonVariants({ variant: "ghost" })}>
            キャンセル
          </a>
          <Button type="submit">登録する</Button>
        </div>
      </form>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- 設定（Standard + Tabs）
export function SettingsScreen({ title }: { title: string }) {
  const { toast } = useToast()
  const save = (e: FormEvent) => {
    e.preventDefault()
    toast({ variant: "success", title: "設定を保存しました" })
  }
  return (
    <PageLayout width="standard" data-testid="screen-settings">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{title}</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      {/* 設定：タイトルの下に Tabs を置き、同じ対象（製品の設定）の情報を切り替える */}
      <Tabs defaultValue="general">
        <TabsList aria-label="設定の種類">
          <TabsTrigger value="general">一般</TabsTrigger>
          <TabsTrigger value="notifications">通知</TabsTrigger>
          <TabsTrigger value="plans">プラン</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <form onSubmit={save} className="flex max-w-[40rem] flex-col gap-12">
            <Section>
              <SectionHeader>
                <SectionTitle>会社の情報</SectionTitle>
              </SectionHeader>
              <FieldGroup>
                <Field>
                  <FieldLabel>会社名</FieldLabel>
                  <Input defaultValue="株式会社フロー" />
                </Field>
                <Field>
                  <FieldLabel>請求書の差出人のメールアドレス</FieldLabel>
                  <Input type="email" defaultValue="billing@flow.example.com" />
                  <FieldDescription>顧客に送る請求書の差出人になる</FieldDescription>
                </Field>
              </FieldGroup>
            </Section>
            <div className="flex justify-end">
              <Button type="submit">変更を保存</Button>
            </div>
          </form>
        </TabsContent>
        <TabsContent value="notifications">
          <Section className="max-w-[40rem]">
            <SectionHeader>
              <SectionHeading>
                <SectionTitle>メールの通知</SectionTitle>
                <SectionDescription>担当している顧客について、担当者に送る。</SectionDescription>
              </SectionHeading>
            </SectionHeader>
            <FieldGroup>
              <Field orientation="horizontal">
                <Switch defaultChecked />
                <FieldLabel>契約の更新日の 30 日前</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Switch />
                <FieldLabel>入金の確認</FieldLabel>
              </Field>
            </FieldGroup>
          </Section>
        </TabsContent>
        <TabsContent value="plans">
          {/* 独立した選択肢の比較：プランは Card で並べる理由がある（Section Layout の Card の判断基準） */}
          <Section>
            <SectionHeader>
              <SectionTitle>プランの比較</SectionTitle>
            </SectionHeader>
            <PageColumns layout="equal" columns={3}>
              {[
                ["ライト", "10 席まで", "月額 9,800円"],
                ["スタンダード", "50 席まで", "月額 39,800円"],
                ["エンタープライズ", "席数の上限なし", "個別に見積もり"],
              ].map(([n, s, p]) => (
                <Card key={n} size="sm">
                  <CardHeader>
                    <CardTitle>{n}</CardTitle>
                    <CardDescription>{s}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-ui tabular-nums">{p}</p>
                  </CardContent>
                </Card>
              ))}
            </PageColumns>
          </Section>
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- まだ作っていない画面
export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <PageLayout width="full" data-testid="screen-placeholder">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{title}</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <p className="text-ui text-muted-foreground">この画面の内容は、Data Browsing などの Patterns の段階で作る。</p>
    </PageLayout>
  )
}

// ---------------------------------------------------------------- ログイン（Minimal Shell + Compact）
export function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  const previewOnly = usePreviewOnly()
  return (
    <PageLayout width="compact" align="center" data-testid="screen-login">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>ログイン</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          onSignIn()
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel>メールアドレス</FieldLabel>
            <Input type="email" name="email" autoComplete="username" defaultValue="hanako.sato@example.com" />
          </Field>
          <Field>
            <FieldLabel>パスワード</FieldLabel>
            <Input type="password" name="password" autoComplete="current-password" defaultValue="preview-only" />
          </Field>
        </FieldGroup>
        <Button type="submit" className="w-full">
          ログイン
        </Button>
        <a href="#/structure-app?page=login" onClick={(e) => { e.preventDefault(); previewOnly("パスワードの再設定")() }} className="self-center rounded-xs text-ui underline underline-offset-4 outline-none focus-visible:focus-ring">
          パスワードを忘れた場合
        </a>
      </form>
    </PageLayout>
  )
}
