import { useEffect, useRef, useState } from "react"
import { Eye, Pencil, Send } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage, getInitials } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { PageHeader } from "../../layout/page-header"

// 7 種類の Feedback を組み合わせた業務画面の例：11 月分の請求書の一括送信。
// - 読み込み中は Skeleton（一覧の aria-busy と状態の文字で伝える）
// - 送付先が未設定の顧客は Alert（継続して示す注意）と Badge。Alert は一覧の中に置き、操作の欄を動かさない
// - 送信中は Progress（実際に処理した件数から進捗率を出す）
// - 送信の結果は Toast。失敗は Toast だけに頼らず、一覧の Badge と件数で残す
// - アイコンだけの操作は Tooltip で補足する

type Status = "unsent" | "sent" | "failed" | "no-address"

type Invoice = { id: string; company: string; amount: number; status: Status; failOnSend?: boolean }

const initial: Invoice[] = [
  { id: "INV-1101", company: "山田商事株式会社", amount: 128000, status: "unsent" },
  { id: "INV-1102", company: "北斗システム株式会社", amount: 54000, status: "unsent", failOnSend: true },
  { id: "INV-1103", company: "Aoba Trading Co., Ltd.", amount: 312400, status: "no-address" },
  { id: "INV-1104", company: "株式会社みなと設計", amount: 86900, status: "sent" },
  { id: "INV-1105", company: "合同会社さくら食品", amount: 23100, status: "unsent" },
  { id: "INV-1106", company: "Kitaguni Logistics Inc.", amount: 451000, status: "no-address" },
  { id: "INV-1107", company: "株式会社東雲デザイン", amount: 77000, status: "unsent", failOnSend: true },
]

const badge: Record<Status, { label: string; variant: "neutral" | "success" | "destructive" | "warning" }> = {
  unsent: { label: "未送信", variant: "neutral" },
  sent: { label: "送信済み", variant: "success" },
  failed: { label: "送信失敗", variant: "destructive" },
  "no-address": { label: "送付先未設定", variant: "warning" },
}

const filters = [
  { value: "all", label: "すべて" },
  { value: "unsent", label: "未送信" },
  { value: "failed", label: "送信失敗" },
  { value: "no-address", label: "送付先未設定" },
]

const yen = (n: number) => `${n.toLocaleString("ja-JP")} 円`

function IconAction({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label={label}>
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function BillingPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState(initial)
  const [filter, setFilter] = useState("all")
  const [job, setJob] = useState<{ done: number; total: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 1200)
    return () => {
      window.clearTimeout(t)
      window.clearInterval(timer.current)
    }
  }, [])

  const targets = invoices.filter((i) => i.status === "unsent" || i.status === "failed")
  const noAddress = invoices.filter((i) => i.status === "no-address").length
  const failed = invoices.filter((i) => i.status === "failed").length
  const shown = invoices.filter((i) => filter === "all" || i.status === filter)

  const send = () => {
    const queue = targets.map((t) => t.id)
    if (!queue.length) return
    setJob({ done: 0, total: queue.length })
    let n = 0
    let failures = 0
    timer.current = window.setInterval(() => {
      const id = queue[n]
      setInvoices((list) =>
        list.map((i) => (i.id === id ? { ...i, status: i.failOnSend && i.status !== "failed" ? "failed" : "sent" } : i))
      )
      const target = invoices.find((i) => i.id === id)
      if (target?.failOnSend && target.status !== "failed") failures += 1
      n += 1
      setJob({ done: n, total: queue.length })
      if (n === queue.length) {
        window.clearInterval(timer.current)
        window.setTimeout(() => setJob(null), 600)
        const sent = queue.length - failures
        if (sent) toast({ variant: "success", title: `${sent} 件の請求書を送信しました` })
        // 同じ処理の失敗は 1 つの通知にまとめる。失敗は一覧の Badge にも残る
        if (failures)
          toast({
            id: "billing-failed",
            variant: "destructive",
            title: `${failures} 件の請求書を送信できませんでした`,
            description: "メールサーバーが応答しませんでした。一覧の「送信失敗」から再送できます",
            action: { label: "失敗した請求書を表示", onClick: () => setFilter("failed") },
          })
      }
    }, 400)
  }

  return (
    <article>
      <PageHeader name="例：請求書の一括送信" lead="7 種類の Feedback と Button、Select を組み合わせた業務画面。" />

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2 className="text-section">11 月分の請求書</h2>
          <p className="mt-2 flex items-center gap-2 text-ui text-muted-foreground">
            <Avatar size="xs">
              <AvatarImage src="/avatars/portrait.png" />
              <AvatarFallback>佐</AvatarFallback>
            </Avatar>
            最終更新：佐藤 健
          </p>
        </div>
        <AvatarGroup role="img" aria-label="担当者 3 名：佐藤 健、山田 花子、Hanako Yamada">
          <Avatar size="sm">
            <AvatarImage src="/avatars/portrait.png" />
            <AvatarFallback>佐</AvatarFallback>
          </Avatar>
          <Avatar size="sm">
            <AvatarFallback>{getInitials("山田 花子")}</AvatarFallback>
          </Avatar>
          <Avatar size="sm">
            <AvatarFallback>{getInitials("Hanako Yamada")}</AvatarFallback>
          </Avatar>
        </AvatarGroup>
      </div>


      <div className="mt-8 flex flex-wrap items-end justify-between gap-4" data-testid="billing-toolbar">
        <Field className="w-56">
          <FieldLabel>表示</FieldLabel>
          <Select items={filters} value={filter} onValueChange={(v) => setFilter(v as string)}>
            <SelectTrigger data-testid="billing-filter" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filters.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button data-testid="billing-send" onClick={send} loading={!!job} disabled={loading || !targets.length}>
          <Send />
          {failed ? `未送信と失敗の請求書を送信（${targets.length} 件）` : `未送信の請求書を送信（${targets.length} 件）`}
        </Button>
      </div>

      {job && (
        <Progress data-testid="billing-progress" value={Math.floor((job.done / job.total) * 100)} className="mt-6">
          <ProgressLabel>請求書を送信しています</ProgressLabel>
          <ProgressValue>{() => `${job.done} / ${job.total} 件`}</ProgressValue>
        </Progress>
      )}

      <section aria-label="請求書の一覧" aria-busy={loading} className="mt-6" data-testid="billing-list">
        <p role="status" className="sr-only">
          {loading ? "請求書の一覧を読み込んでいます" : ""}
        </p>
        {/* 読み込みの結果として出る注意は、操作の欄（表示の切り替え、送信）より下に置く。
            読み込みが終わっても、操作の欄の位置は動かない。 */}
        {!loading && noAddress > 0 && (
        <Alert variant="warning" className="mb-6" data-testid="billing-alert">
          <AlertTitle>送付先が未設定の顧客が {noAddress} 件あります</AlertTitle>
          <AlertDescription>送付先を設定するまで、これらの請求書は送信できません。</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="secondary" onClick={() => setFilter("no-address")}>
              未設定の請求書を表示
            </Button>
          </AlertAction>
        </Alert>
      )}
        <ul>
          {(loading ? initial : shown).map((inv) => (
            <li key={inv.id} className="flex h-16 items-center gap-3 border-b border-border">
              {loading ? (
                <>
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-48 max-w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </>
              ) : (
                <>
                  <Avatar>
                    <AvatarFallback kind="organization">{getInitials(inv.company)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium">{inv.company}</p>
                    <p className="text-caption text-muted-foreground tabular-nums">
                      {inv.id}　{yen(inv.amount)}
                    </p>
                  </div>
                  <Badge data-testid={`billing-badge-${inv.id}`} variant={badge[inv.status].variant}>
                    {badge[inv.status].label}
                  </Badge>
                  <div className="flex">
                    <IconAction label="請求書を表示">
                      <Eye />
                    </IconAction>
                    <IconAction label="送付先を編集">
                      <Pencil />
                    </IconAction>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        {!loading && shown.length === 0 && (
          <p className="py-12 text-center text-ui text-muted-foreground">該当する請求書はありません</p>
        )}
      </section>
    </article>
  )
}
