// 運用の監視（決済と請求の処理）の、架空のデータ。更新の回数（tick）から決まった値を作る（毎回同じ結果になる）。
// 1 tick は 5 秒。tick 0 は 2026 年 11 月 25 日 14:30:00（日本時間）。Registry には含めない。

export const OPS_BASE_EPOCH = Date.UTC(2026, 10, 25, 5, 30, 0) // 14:30:00 JST
export const OPS_TICK_SECONDS = 5

export type ServiceState = "normal" | "degraded" | "down"

export type ServiceStatus = {
  id: string
  name: string
  state: ServiceState
  /** 直近 15 分のエラー率（0〜1） */
  errorRate: number
  /** エラー率の上限（0〜1） */
  errorLimit: number
  /** 直近 15 分の応答時間の 95 パーセンタイル（ms） */
  p95Ms: number
  /** 直近 15 分の処理件数 */
  processed: number
}

export type OpsAlert = {
  id: string
  /** 発生した時刻（エポックからのミリ秒） */
  at: number
  service: string
  severity: "critical" | "warning"
  title: string
}

const SERVICES = [
  { id: "payment-api", name: "決済 API", base: 4200, p95: 180, limit: 0.01 },
  { id: "invoice", name: "請求書の発行", base: 860, p95: 420, limit: 0.02 },
  { id: "webhook", name: "Webhook の通知", base: 2600, p95: 240, limit: 0.02 },
  { id: "mail", name: "メールの送信", base: 1500, p95: 900, limit: 0.03 },
]

// 決まった並びの揺らぎ（0〜1）。
const wave = (tick: number, k: number) => (Math.sin(tick * 0.9 + k * 1.7) + 1) / 2

export function opsTime(tick: number) {
  return OPS_BASE_EPOCH + tick * OPS_TICK_SECONDS * 1000
}

export function servicesAt(tick: number): ServiceStatus[] {
  return SERVICES.map((s, k) => {
    // Webhook の通知は tick 3〜11 の間、エラー率が上限を超える（異常の例）。
    const incident = s.id === "webhook" && tick >= 3 && tick <= 11
    const errorRate = incident ? 0.034 + wave(tick, k) * 0.01 : s.limit * (0.15 + wave(tick, k) * 0.35)
    const p95Ms = Math.round(s.p95 * (incident ? 2.6 : 0.9 + wave(tick, k + 1) * 0.25))
    const state: ServiceState = errorRate > s.limit * 2.5 ? "down" : errorRate > s.limit ? "degraded" : "normal"
    return {
      id: s.id,
      name: s.name,
      state,
      errorRate,
      errorLimit: s.limit,
      p95Ms,
      processed: Math.round(s.base * (0.92 + wave(tick, k + 2) * 0.16)),
    }
  })
}

const ALERT_PLAN: { tick: number; service: string; severity: OpsAlert["severity"]; title: string }[] = [
  { tick: -40, service: "メールの送信", severity: "warning", title: "送信の待ち件数が 500 件を超えました" },
  { tick: -12, service: "請求書の発行", severity: "warning", title: "PDF の生成に 3 秒以上かかっています" },
  { tick: 3, service: "Webhook の通知", severity: "critical", title: "エラー率が上限（2.0%）を超えました" },
  { tick: 6, service: "Webhook の通知", severity: "warning", title: "通知先の 3 社で再送が続いています" },
  { tick: 9, service: "決済 API", severity: "warning", title: "応答時間が通常の 1.5 倍になっています" },
  { tick: 14, service: "メールの送信", severity: "warning", title: "迷惑メールの判定による差し戻しが増えています" },
  { tick: 20, service: "請求書の発行", severity: "critical", title: "12 月分の請求書の発行が止まっています" },
]

/** その時点までに発生したアラート。新しい順 */
export function alertsAt(tick: number): OpsAlert[] {
  return ALERT_PLAN.filter((a) => a.tick <= tick)
    .map((a, i) => ({ id: `AL-${String(i + 1).padStart(3, "0")}`, at: opsTime(a.tick), service: a.service, severity: a.severity, title: a.title }))
    .reverse()
}

/** 口座振替の処理状況（実際の件数）。tick ごとに 140 件ずつ処理する */
export function transfersAt(tick: number) {
  const total = 4_820
  const processed = Math.min(total, 1_960 + Math.max(0, tick) * 140)
  const failed = Math.floor(processed * 0.006)
  return { total, processed, failed }
}

export const opsClock = (epoch: number) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(epoch))
