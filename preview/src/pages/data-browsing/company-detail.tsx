import { useEffect, useState, type MouseEvent, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, Pencil } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { useBrowseData } from "@/patterns/browse-data"
import { DataRegionError, DataValue, LoadingReveal } from "@/patterns/data-states"
import type { RecordNeighbors } from "@/patterns/list-detail"
import { PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderTitle } from "@/patterns/page-header"
import { Section, SectionHeader, SectionHeading, SectionStack, SectionTitle } from "@/patterns/section-layout"

import { formatDate, formatYen, owners, statusOptions, type ContractStatus, type Customer } from "../../data/data-display/customers"
import { getActivity, getCompany, updateCompany, type CompanyPatch } from "../../data/data-browsing/company-server"
import { DiscardAlert } from "../overlays/discard-alert"
import { DetailRow, StatusText } from "./company-parts"

// 顧客の詳細（製品側のコード）。閲覧は非モーダルの Sheet か別ページ、編集はモーダルの Sheet。
// 詳細の情報は、1 対象を識別する情報 → 2 現在の状態 → 3 判断や操作に必要な情報 → 4 その他 → 5 使用頻度の低い情報 の順に置く。

function DetailBody({ customer, level }: { customer: Customer; level: 2 | 3 }) {
  return (
    <SectionStack spacing="group">
      <Section level={level}>
        <SectionHeader>
          <SectionTitle>契約</SectionTitle>
        </SectionHeader>
        <dl className="text-ui">
          <DetailRow label="契約状況">
            <StatusText status={customer.status} />
          </DetailRow>
          <DetailRow label="担当者">{customer.owner}</DetailRow>
          <DetailRow label="月額">
            <DataValue value={{ status: "ready", value: customer.monthlyFee }} format={formatYen} emptyLabel="未設定" />
          </DetailRow>
          <DetailRow label="更新日">
            <DataValue value={{ status: "ready", value: customer.renewalDate }} format={formatDate} emptyLabel="未定" />
          </DetailRow>
          <DetailRow label="利用者数">{customer.seats.toLocaleString("ja-JP")}人</DetailRow>
        </dl>
      </Section>
      <Section level={level}>
        <SectionHeader>
          <SectionTitle>連絡先と会社の情報</SectionTitle>
        </SectionHeader>
        <dl className="text-ui">
          <DetailRow label="電話番号">
            <a href={`tel:${customer.phone.replaceAll("-", "")}`} className="underline-offset-4 hover:underline">
              {customer.phone}
            </a>
          </DetailRow>
          <DetailRow label="メール">{customer.email}</DetailRow>
          <DetailRow label="地域">{customer.region}</DetailRow>
          <DetailRow label="業種">{customer.industry}</DetailRow>
        </dl>
      </Section>
      <Section level={level}>
        <SectionHeader>
          <SectionTitle>メモ</SectionTitle>
        </SectionHeader>
        <p className="text-ui [word-break:auto-phrase]">{customer.note ?? <span className="text-muted-foreground">メモはありません</span>}</p>
      </Section>
    </SectionStack>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid grid-cols-[7rem_1fr] gap-4 py-2">
          <Skeleton className="h-4 w-16 rounded-sm" />
          <Skeleton className="h-4 w-3/4 rounded-sm" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- 編集（モーダルの Sheet）
export function EditCompanySheet({
  workspace,
  customer,
  open,
  onOpenChange,
  onSaved,
}: {
  workspace: string
  customer: Customer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (customer: Customer) => void
}) {
  const [form, setForm] = useState<{ owner: string; status: ContractStatus; note: string }>({ owner: "", status: "active", note: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && customer) {
      setForm({ owner: customer.owner, status: customer.status, note: customer.note ?? "" })
      setError(null)
    }
  }, [open, customer])

  const dirty = customer !== null && (form.owner !== customer.owner || form.status !== customer.status || form.note !== (customer.note ?? ""))

  const save = async () => {
    if (!customer || saving) return
    setSaving(true)
    setError(null)
    const patch: CompanyPatch = { owner: form.owner, status: form.status, note: form.note.trim() === "" ? null : form.note }
    try {
      const saved = await updateCompany(workspace, customer.id, patch)
      setSaving(false)
      onSaved(saved)
      onOpenChange(false)
      // 保存の成功は Toast で知らせる。失敗は Sheet の中に残す（入力を失わない）。
      toast({ variant: "success", title: `${saved.company}を保存しました` })
    } catch {
      setSaving(false)
      setError("サーバーに接続できませんでした。入力した内容は残っています。時間をおいて、もう一度保存してください。")
    }
  }

  return (
    <Sheet
      mode="edit"
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      unsavedChanges={dirty}
      onDiscardRequest={() => setConfirm(true)}
    >
      <SheetContent data-testid="company-edit" closeLabel="編集を閉じる">
        <SheetHeader>
          <SheetTitle>{customer ? `${customer.company}を編集` : "編集"}</SheetTitle>
          <SheetDescription>{customer?.id}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="company-edit-form"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <FieldGroup>
              {error && (
                <Alert variant="destructive" role="alert" data-testid="company-edit-error">
                  <AlertTitle>保存できませんでした</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel>担当者</FieldLabel>
                <Select items={owners.map((o) => ({ value: o, label: o }))} value={form.owner} onValueChange={(v) => setForm((f) => ({ ...f, owner: String(v) }))}>
                  <SelectTrigger data-testid="company-edit-owner">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>契約状況</FieldLabel>
                <Select items={statusOptions} value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ContractStatus }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>メモ</FieldLabel>
                <Textarea rows={4} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} data-testid="company-edit-note" />
              </Field>
            </FieldGroup>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" disabled={saving} onClick={() => (dirty ? setConfirm(true) : onOpenChange(false))}>
            キャンセル
          </Button>
          <Button type="submit" form="company-edit-form" loading={saving} disabled={!dirty}>
            保存する
          </Button>
        </SheetFooter>
        <DiscardAlert
          open={confirm}
          onOpenChange={setConfirm}
          testId="company-edit-discard"
          onDiscard={() => {
            setConfirm(false)
            onOpenChange(false)
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------- 閲覧（非モーダルの Sheet）
export function CompanyDetailSheet({
  workspace,
  openId,
  listRow,
  neighbors,
  onSwitch,
  onClose,
  returnFocus,
  pageHref,
  onOpenPage,
  onSaved,
}: {
  workspace: string
  openId: string | null
  /** 一覧の行（対象を識別する情報）。詳細の取得の前から、どの行の詳細かを示す */
  listRow: Customer | null
  neighbors: RecordNeighbors
  onSwitch: (id: string) => void
  onClose: () => void
  returnFocus: () => HTMLElement | null
  /** 別ページの詳細の URL（新しいタブでも開ける） */
  pageHref?: (id: string) => string
  onOpenPage?: (id: string, event: MouseEvent) => void
  onSaved: (customer: Customer) => void
}) {
  const [editing, setEditing] = useState(false)
  // 別のレコードの情報を、現在のレコードの情報として表示しない（keepPreviousData: false）。
  const detail = useBrowseData({
    query: openId,
    queryKey: openId ?? "",
    fetcher: (id, { signal }) => getCompany(workspace, id!, signal),
    keepPreviousData: false,
    enabled: openId !== null,
    scopeKey: workspace,
  })
  const customer = detail.isCurrent || detail.status === "refreshing" ? (detail.data ?? null) : null
  const title = listRow?.company ?? customer?.company ?? ""
  const position = neighbors.position !== null && neighbors.total !== null ? `${neighbors.total.toLocaleString("ja-JP")}件中 ${neighbors.position.toLocaleString("ja-JP")}件目` : null

  return (
    <>
    <Sheet mode="view" open={openId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent data-testid="company-detail" closeLabel="詳細を閉じる" finalFocus={() => returnFocus() ?? true}>
        <SheetHeader>
          <SheetTitle data-testid="company-detail-title">{title}</SheetTitle>
          <SheetDescription>
            {openId}
            {position && <span className="ms-3 tabular-nums">（{position}）</span>}
          </SheetDescription>
        </SheetHeader>
        <SheetBody aria-busy={detail.status === "loading" || undefined} data-testid="company-detail-body" data-detail-id={customer?.id}>
          {detail.status === "error" ? (
            <DataRegionError title="詳細を取得できませんでした" description={detail.error instanceof Error ? detail.error.message : undefined} onRetry={detail.reload} />
          ) : customer ? (
            <DetailBody customer={customer} level={3} />
          ) : (
            <LoadingReveal loading>
              <DetailSkeleton />
            </LoadingReveal>
          )}
        </SheetBody>
        <SheetFooter className="justify-between sm:justify-between">
          {/* 前後の移動は、現在のフィルターとソートの順に従う。表示中のページの外は、前後がわからないため無効にする。 */}
          <div className="flex gap-2 *:flex-1 sm:*:flex-none">
            <Button variant="ghost" size="sm" disabled={!neighbors.previousId} onClick={() => neighbors.previousId && onSwitch(neighbors.previousId)} aria-label="前の顧客">
              <ChevronLeft />
              <span className="max-sm:sr-only">前へ</span>
            </Button>
            <Button variant="ghost" size="sm" disabled={!neighbors.nextId} onClick={() => neighbors.nextId && onSwitch(neighbors.nextId)} aria-label="次の顧客">
              <span className="max-sm:sr-only">次へ</span>
              <ChevronRight />
            </Button>
          </div>
          <div className="flex gap-2 *:flex-1 sm:*:flex-none">
            {pageHref && openId && (
              <a
                href={pageHref(openId)}
                onClick={(e) => onOpenPage?.(openId, e)}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <ExternalLink />
                詳細ページ
              </a>
            )}
            <Button variant="secondary" size="sm" disabled={!customer} onClick={() => setEditing(true)}>
              <Pencil />
              編集
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
      {/* 編集は、閲覧の Sheet の中に入れ子にせず、独立したモーダルの Sheet にする（背景を暗くし、一覧の操作を止める）。 */}
      <EditCompanySheet
        workspace={workspace}
        customer={customer}
        open={editing}
        onOpenChange={setEditing}
        onSaved={(saved) => {
          detail.setData(() => saved)
          onSaved(saved)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------- 別ページの詳細
export function CompanyDetailPage({
  workspace,
  id,
  backHref,
  onBack,
  onSaved,
}: {
  workspace: string
  id: string
  backHref: string
  /** 一覧に戻る。一覧から開いた場合は履歴を戻り、条件と位置を復元する */
  onBack: (event: MouseEvent) => void
  onSaved?: (customer: Customer) => void
}) {
  const [editing, setEditing] = useState(false)
  const detail = useBrowseData({ query: id, fetcher: (v, { signal }) => getCompany(workspace, v, signal), keepPreviousData: false, scopeKey: workspace })
  // 取引の履歴は別に取得する。失敗しても、ほかの情報は表示する（部分的な失敗）。
  const activity = useBrowseData({ query: id, fetcher: (v, { signal }) => getActivity(workspace, v, signal), keepPreviousData: false, scopeKey: workspace })
  const customer = detail.isCurrent ? detail.data! : null

  let body: ReactNode
  if (detail.status === "error") {
    body = <DataRegionError title="顧客の情報を取得できませんでした" description={detail.error instanceof Error ? detail.error.message : undefined} onRetry={detail.reload} />
  } else if (!customer) {
    body = (
      <LoadingReveal loading>
        <DetailSkeleton />
      </LoadingReveal>
    )
  } else {
    body = (
      <SectionStack>
        <DetailBody customer={customer} level={2} />
        <Section divider data-testid="company-activity" aria-busy={activity.status === "loading" || undefined}>
          <SectionHeader>
            <SectionHeading>
              <SectionTitle>取引の履歴</SectionTitle>
            </SectionHeading>
          </SectionHeader>
          {activity.status === "error" ? (
            <DataRegionError
              title="取引の履歴を取得できませんでした"
              description="ほかの情報は表示しています。履歴だけを再取得できます。"
              onRetry={activity.reload}
              data-testid="company-activity-error"
            />
          ) : activity.isCurrent ? (
            <ul className="flex flex-col">
              {activity.data!.map((a) => (
                <li key={a.id} className="grid grid-cols-[6rem_8rem_1fr] gap-4 border-b border-border py-3 text-ui last:border-b-0 max-sm:grid-cols-[6rem_1fr]">
                  <span className="text-muted-foreground tabular-nums">{formatDate(a.date)}</span>
                  <span>{a.kind}</span>
                  <span className="text-muted-foreground max-sm:col-span-2">{a.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <LoadingReveal loading>
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-5 w-full rounded-sm" />
                ))}
              </div>
            </LoadingReveal>
          )}
        </Section>
      </SectionStack>
    )
  }

  return (
    <PageLayout width="standard" data-testid="company-page">
      <PageHeader
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href={backHref} onClick={onBack} data-testid="company-page-back">
                  顧客
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{customer?.company ?? id}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      >
        <PageHeaderContent>
          <PageHeaderTitle>{customer?.company ?? <span className="sr-only">顧客の詳細（読み込み中）</span>}</PageHeaderTitle>
          {!customer && detail.status !== "error" && <Skeleton aria-hidden="true" className="h-8 w-72 max-w-full rounded-sm" />}
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="secondary" disabled={!customer} onClick={() => setEditing(true)}>
            <Pencil />
            編集
          </Button>
        </PageHeaderActions>
      </PageHeader>
      <div aria-busy={detail.status === "loading" || undefined}>{body}</div>
      <EditCompanySheet
        workspace={workspace}
        customer={customer}
        open={editing}
        onOpenChange={setEditing}
        onSaved={(saved) => {
          detail.setData(() => saved)
          onSaved?.(saved)
        }}
      />
    </PageLayout>
  )
}
