import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Bell, Download, House, Plus, Search } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { activities, contracts, customers, kpis } from "../../data/business"
import { AppSidebar, pageLabels } from "./app-sidebar"

// 業務アプリケーション（顧客管理・契約管理）の画面の例。6 つのコンポーネントを組み合わせる。
// ページの切り替えは URL のハッシュ（#/app?page=...）で行う。ルーティングとメニューの開閉状態の保存は、
// この画面（製品）が持つ。コンポーネントは特定のルーティングやストレージに依存しない。

const user = { name: "佐藤 花子", email: "hanako.sato@example.com" }
const STORAGE_KEY = "flow-design-preview:sidebar-open"

function readRoute() {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
  return { page: params.get("page") ?? "home", id: params.get("id") }
}

const hrefFor = (page: string, id?: string) => `#/app?page=${page}${id ? `&id=${id}` : ""}`

function readOpen() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false"
  } catch {
    return true
  }
}

// 画面の目的に応じた内容の最大幅（docs/web/components/navigation-layout.md）
const widths = {
  list: "max-w-none",
  dashboard: "max-w-[1440px]",
  detail: "max-w-[960px]",
  form: "max-w-[640px]",
} as const

export function AppPage() {
  const [route, setRoute] = useState(readRoute)
  const [open, setOpenState] = useState(readOpen)

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // 保存できない環境では、この画面を開いている間だけ状態を保つ。
    }
  }, [])

  const navigate = (page: string, id?: string) => {
    window.location.hash = hrefFor(page, id)
    window.scrollTo(0, 0)
  }

  const navCurrent = route.page === "customer" ? "customers" : route.page
  const customer = customers.find((c) => c.id === route.id) ?? customers[0]

  let crumbs: { label: string; page?: string }[] = []
  let body: ReactNode
  let width: keyof typeof widths = "detail"
  switch (route.page) {
    case "home":
      width = "dashboard"
      body = <Dashboard onOpen={(id) => navigate("customer", id)} />
      break
    case "customers":
      width = "list"
      crumbs = [{ label: "顧客" }]
      body = <CustomerList onOpen={(id) => navigate("customer", id)} />
      break
    case "customer":
      width = "detail"
      crumbs = [{ label: "顧客", page: "customers" }, { label: customer.name }]
      body = <CustomerDetail customer={customer} />
      break
    case "settings":
      width = "form"
      crumbs = [{ label: "設定" }]
      body = <SettingsForm />
      break
    default:
      width = "list"
      crumbs = [{ label: pageLabels[route.page] ?? "ページ" }]
      body = <Placeholder title={pageLabels[route.page] ?? "ページ"} />
  }

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <AppSidebar current={navCurrent} onNavigate={(id) => navigate(id)} hrefFor={(id) => hrefFor(id)} user={user} />
      <SidebarInset data-testid="app-main">
        <header
          data-testid="app-header"
          className="flex min-h-16 items-center gap-2 px-4 pt-[env(safe-area-inset-top)] md:px-6"
        >
          <SidebarTrigger className="-ml-2" />
          <Separator decorative orientation="vertical" className="mr-2 h-6 self-center" />
          <Breadcrumb className="flex-1">
            <BreadcrumbList>
              <BreadcrumbItem>
                {crumbs.length === 0 ? (
                  <BreadcrumbPage>
                    <House className="size-4" aria-hidden="true" />
                    <span className="sr-only">ホーム</span>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={hrefFor("home")} aria-label="ホーム">
                    <House />
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {crumbs.map((c, i) => (
                <Crumb key={c.label} last={i === crumbs.length - 1} {...c} />
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <Button variant="ghost" size="icon-sm" aria-label="検索">
            <Search />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="お知らせ">
            <Bell />
          </Button>
        </header>
        <div className={cn("w-full px-4 pt-6 pb-16 md:px-6", widths[width])}>{body}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function Crumb({ label, page, last }: { label: string; page?: string; last: boolean }) {
  return (
    <>
      <BreadcrumbSeparator className={cn(!last && "max-sm:hidden")} />
      <BreadcrumbItem className={cn(!last && "max-sm:hidden")}>
        {last || !page ? <BreadcrumbPage>{label}</BreadcrumbPage> : <BreadcrumbLink href={hrefFor(page)}>{label}</BreadcrumbLink>}
      </BreadcrumbItem>
    </>
  )
}

function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-page-title [word-break:auto-phrase]">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

function Dashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const renewals = customers.filter((c) => c.renewal.startsWith("2026年12月"))
  return (
    <div data-testid="app-dashboard">
      <PageTitle title="ホーム" />
      <section aria-labelledby="kpi-heading" className="mt-8">
        <h2 id="kpi-heading" className="sr-only">
          今月の状況
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} size="sm">
              <CardHeader>
                <CardDescription>{k.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-metric tabular-nums">{k.value}</p>
                <p className="mt-1 text-caption text-muted-foreground">{k.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <div className="mt-12 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="renewal-heading">
          <h2 id="renewal-heading" className="text-heading">
            更新が近い契約
          </h2>
          <ul className="mt-4">
            {renewals.map((c) => (
              <li key={c.id} className="border-b border-border py-3 last:border-b-0">
                <a
                  href={hrefFor("customer", c.id)}
                  onClick={(e) => {
                    e.preventDefault()
                    onOpen(c.id)
                  }}
                  className="rounded-xs text-ui font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring"
                >
                  {c.name}
                </a>
                <p className="mt-1 text-caption text-muted-foreground">
                  {c.renewal}に更新・{c.plan}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="text-heading">
            最近の活動
          </h2>
          <ul className="mt-4 space-y-4">
            {activities.map((a) => (
              <li key={a.date}>
                <p className="text-caption text-muted-foreground">{a.date}</p>
                <p className="mt-1 text-ui">{a.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

const owners = [
  { value: "all", label: "すべての担当者" },
  { value: "sato", label: "佐藤 花子" },
  { value: "suzuki", label: "鈴木 一郎" },
]

function CustomerList({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div data-testid="app-customers">
      <PageTitle title="顧客">
        <Button variant="secondary">
          <Download />
          書き出す
        </Button>
        <Button>
          <Plus />
          顧客を追加
        </Button>
      </PageTitle>
      <div role="search" className="mt-8 flex flex-wrap gap-4">
        <Input aria-label="顧客を検索" placeholder="会社名で検索" className="w-full sm:w-72" />
        <Select items={owners} defaultValue="all">
          <SelectTrigger aria-label="担当者" className="w-full sm:w-48">
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
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-ui whitespace-nowrap">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              {["会社名", "業種", "プラン", "担当", "更新日", "未入金"].map((h) => (
                <th key={h} scope="col" className="h-table-row px-3 font-medium first:pl-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-border">
                <td className="h-table-row px-3 pl-0">
                  <a
                    href={hrefFor("customer", c.id)}
                    onClick={(e) => {
                      e.preventDefault()
                      onOpen(c.id)
                    }}
                    className="rounded-xs font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring"
                  >
                    {c.name}
                  </a>
                </td>
                <td className="px-3">{c.industry}</td>
                <td className="px-3">{c.plan}</td>
                <td className="px-3">{c.owner}</td>
                <td className="px-3 tabular-nums">{c.renewal}</td>
                <td className="px-3 tabular-nums">{c.unpaid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CustomerDetail({ customer }: { customer: (typeof customers)[number] }) {
  return (
    <div data-testid="app-customer">
      <PageTitle title={customer.name}>
        <Button variant="secondary">編集</Button>
        <Button>
          <Plus />
          商談を追加
        </Button>
      </PageTitle>
      <p className="mt-2 text-ui text-muted-foreground">
        {customer.industry}・担当 {customer.owner}
      </p>
      <Tabs defaultValue="overview" className="mt-8">
        <TabsList aria-label={`${customer.name}の情報`}>
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="contracts">契約</TabsTrigger>
          <TabsTrigger value="invoices">請求</TabsTrigger>
          <TabsTrigger value="activities">活動履歴</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["プラン", customer.plan],
              ["次回の更新日", customer.renewal],
              ["未入金", customer.unpaid],
            ].map(([k, v]) => (
              <Card key={k} size="sm">
                <CardHeader>
                  <CardDescription>{k}</CardDescription>
                  <CardTitle className="tabular-nums">{v}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
          <h2 className="mt-12 text-heading">基本情報</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {[
              ["住所", "東京都千代田区丸の内 1-1-1"],
              ["電話番号", "03-1234-5678"],
              ["請求書の送付先", "keiri@yamada.example.com"],
              ["契約開始日", "2024年4月1日"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-caption text-muted-foreground">{k}</dt>
                <dd className="mt-1 text-ui">{v}</dd>
              </div>
            ))}
          </dl>
          <Separator className="my-8" />
          <h2 className="text-heading">補足</h2>
          <Accordion className="mt-2">
            <AccordionItem value="memo">
              <AccordionTrigger>社内メモ</AccordionTrigger>
              <AccordionContent>来期は全社への導入を検討している。決裁は4月。</AccordionContent>
            </AccordionItem>
            <AccordionItem value="history">
              <AccordionTrigger>変更履歴</AccordionTrigger>
              <AccordionContent>2026年10月28日に、追加ユーザー 20 名の契約を締結した。</AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
        <TabsContent value="contracts">
          <ul>
            {contracts.map((c) => (
              <li key={c.id} className="border-b border-border py-4 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-ui font-medium">{c.name}</p>
                  <p className="text-ui tabular-nums">{c.amount}</p>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                  <Badge variant={c.status === "契約中" ? "success" : "neutral"}>{c.status}</Badge>
                  {c.id}・{c.period}
                </p>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="invoices">
          <p className="text-ui text-muted-foreground">11月分の請求書（¥152,000）を2026年11月12日に送付した。</p>
        </TabsContent>
        <TabsContent value="activities">
          <ul className="space-y-4">
            {activities.map((a) => (
              <li key={a.date}>
                <p className="text-caption text-muted-foreground">{a.date}</p>
                <p className="mt-1 text-ui">{a.text}</p>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SettingsForm() {
  return (
    <div data-testid="app-settings">
      <PageTitle title="設定" />
      <form className="mt-8" onSubmit={(e) => e.preventDefault()}>
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
          <Field orientation="horizontal">
            <Checkbox defaultChecked />
            <FieldLabel>契約の更新日の 30 日前に担当者へ通知する</FieldLabel>
          </Field>
        </FieldGroup>
        <div className="mt-8 flex justify-end">
          <Button type="submit">変更を保存</Button>
        </div>
      </form>
    </div>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <div data-testid="app-placeholder">
      <PageTitle title={title} />
      <p className="mt-4 text-ui text-muted-foreground">この画面の内容は、Patterns の段階で作る。</p>
    </div>
  )
}
