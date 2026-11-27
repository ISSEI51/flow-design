import type * as React from "react"
import { CircleAlert, CircleCheck, CircleHelp, Gauge, LoaderCircle, RefreshCw, TriangleAlert, WifiOff, Wrench } from "lucide-react"

import { cn } from "@/lib/utils"

import { conditionLabels, type ServiceHealth, type SystemCondition } from "@/patterns/system-status"

// Flow Design Service State（Patterns / System & Account / System States）
// サービスと機能の状態の表示。定義と判断基準は docs/web/patterns/system-states.md を参照。
//
// - ConditionIcon：状態の分類に対応するアイコン。色だけで状態を伝えないよう、必ず文と組み合わせる。
// - ServiceHealthLabel：機能の状態（アイコンと文）。Status Page や機能の一覧で使う。unknown を「正常」と表示しない。
// - SystemStatusIndicator：接続の状態の常時表示。電話、機器の操作、リアルタイムの監視など、接続の状態が判断に必要な製品だけで使う。
//   通常の業務の画面では、正常の状態を表示しない（この部品を置かない）。
// - ServiceUnavailable：製品全体が使えない場合（メンテナンス、サービスの停止）の画面の内容。Minimal Shell の中に置く。
//
// この部品が守ること
// - 判明していない復旧の予定時刻を作らない（schedule を渡された場合だけ示す）。
// - Status Page や問い合わせ先は、製品が渡した場合だけ示す（links）。
// - 状態の確認の結果は、常に置いた領域（role="status"）の中身を変えて伝える。フォーカスを動かさない。
//
// この部品が持たないもの（製品の責務）
// - 状態の取得、障害の監視、復旧の予定時刻の判断、Status Page と問い合わせの窓口の運用。

const conditionIcons: Record<SystemCondition, { icon: typeof CircleCheck; className: string; spin?: boolean }> = {
  operational: { icon: CircleCheck, className: "text-success" },
  connecting: { icon: LoaderCircle, className: "text-muted-foreground", spin: true },
  offline: { icon: WifiOff, className: "text-warning" },
  degraded: { icon: Gauge, className: "text-warning" },
  "partial-outage": { icon: TriangleAlert, className: "text-warning" },
  // サービスの停止は本当のエラーのため、Destructive の色を使う。
  outage: { icon: CircleAlert, className: "text-destructive" },
  maintenance: { icon: Wrench, className: "text-info" },
  recovering: { icon: RefreshCw, className: "text-info" },
  unknown: { icon: CircleHelp, className: "text-muted-foreground" },
}

// 状態のアイコン。装飾として扱い（aria-hidden）、状態は隣の文で伝える。
// connecting の回転は、動きを減らす設定では止める（motion-safe）。
function ConditionIcon({ condition, className }: { condition: SystemCondition; className?: string }) {
  const { icon: Icon, className: tone, spin } = conditionIcons[condition]
  return (
    <Icon
      aria-hidden="true"
      data-slot="condition-icon"
      data-condition={condition}
      className={cn("size-5 shrink-0", tone, spin && "motion-safe:animate-spin", className)}
    />
  )
}

// 機能の状態。label を省略すると、状態の分類の名前（conditionLabels）を示す。
function ServiceHealthLabel({ health, label, className }: { health: ServiceHealth; label?: string; className?: string }) {
  return (
    <span data-slot="service-health" data-health={health} className={cn("inline-flex items-center gap-2 text-ui", className)}>
      <ConditionIcon condition={health} className="size-4" />
      {label ?? conditionLabels[health]}
    </span>
  )
}

// 接続の状態の常時表示。常に置き、中身（状態の文）を変える。状態が変わったときに読み上げる（role="status"）。
// 接続と切断を短時間に繰り返す場合は、製品が安定した値（useStableIssues など）を渡し、読み上げを繰り返さない。
// 状態を取得できない場合は unknown を渡す（正常と表示しない）。
function SystemStatusIndicator({
  condition,
  label,
  detail,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  condition: SystemCondition
  /** 状態の文。省略すると分類の名前 */
  label?: string
  /** 補足（最後に確認した時刻など） */
  detail?: React.ReactNode
}) {
  return (
    <div
      role="status"
      data-slot="system-status-indicator"
      data-condition={condition}
      className={cn("inline-flex min-h-10 items-center gap-2 text-ui", className)}
      {...props}
    >
      <ConditionIcon condition={condition} className="size-4" />
      <span className="font-medium">{label ?? conditionLabels[condition]}</span>
      {detail && <span className="text-muted-foreground">{detail}</span>}
    </div>
  )
}

// 製品全体が使えない場合の画面の内容。Minimal Shell（ナビゲーションを置かない）の中に置く。
// - 見出し（h1）、簡潔な説明、実際に利用できる操作（再確認など）を示す。
// - 予定（開始、終了の予定）は、製品がわかっている場合だけ渡す。判明していない復旧の予定時刻を作らない。
// - Status Page と問い合わせ先は、実在する場合だけ渡す（links）。
// - status：状態の確認の結果（「10:05 に確認しました。まだ利用できません」など）。常に置いた領域で読み上げる。
function ServiceUnavailable({
  condition,
  title,
  description,
  schedule,
  actions,
  status,
  links,
  titleAs: Title = "h1",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  condition: "outage" | "maintenance"
  title: React.ReactNode
  /** 見出しの要素。製品の画面を置き換える場合は h1。資料の中の例などでは下位の見出しにする */
  titleAs?: "h1" | "h2" | "h3"
  description?: React.ReactNode
  /** わかっている予定だけ（開始、終了の予定、タイムゾーン） */
  schedule?: { label: string; value: React.ReactNode }[]
  /** 実際に利用できる操作 */
  actions?: React.ReactNode
  /** 状態の確認の結果 */
  status?: React.ReactNode
  /** 実在する Status Page や問い合わせ先 */
  links?: React.ReactNode
}) {
  return (
    <div
      data-slot="service-unavailable"
      data-condition={condition}
      className={cn("mx-auto flex w-full max-w-[36rem] flex-col gap-6 px-6 py-12", className)}
      {...props}
    >
      <ConditionIcon condition={condition} className="size-8" />
      <div className="flex flex-col gap-3">
        <Title className="text-page-title">{title}</Title>
        {description && <div className="text-body text-muted-foreground">{description}</div>}
      </div>
      {schedule && schedule.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
          {schedule.map((s) => (
            <div key={s.label} className="contents">
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      <p role="status" data-slot="service-unavailable-status" className="min-h-6 text-ui text-muted-foreground">
        {status}
      </p>
      {links && <div className="flex flex-col gap-2 text-ui">{links}</div>}
    </div>
  )
}

export { ConditionIcon, ServiceHealthLabel, ServiceUnavailable, SystemStatusIndicator }
