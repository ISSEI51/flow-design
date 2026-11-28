// Patterns の横断の検証画面のデータモデル（プレビュー専用。Registry には含めない。Pages の共通データモデルの本実装ではない）。
// 一覧、詳細、指標（KPI）、明細（Drill-down）は、すべてこのモデルの同じ顧客から計算する。
// そのため、同じ顧客について、一覧・詳細・指標・明細で矛盾する値を表示しない（Patterns Integration Review 10.1）。
//
// - ワークスペース（hq、kyushu）ごとに顧客を分ける。同じ ID（c01 など）が両方にあり、内容は異なる（A→B の取り違えの検品）。
// - 月額（mrr）は、契約中（active）の顧客だけを売上に数える。停止中（paused）は売上に含めない。
// - 指標の基準時刻（asOf）は固定する（検品の結果が実行の時刻に依存しない）。

export type CustomerStatus = "active" | "paused"

export type PiCustomer = {
  id: string
  name: string
  region: string
  plan: string
  status: CustomerStatus
  /** 月額（円） */
  mrr: number
  email: string
  phone: string
  note: string
  /** 連絡の記録（新しい順） */
  contacts: string[]
  /** 保存のたびに 1 増える（競合の検出に使う） */
  version: number
}

export type PiWorkspace = { id: string; name: string }

export const piWorkspaces: PiWorkspace[] = [
  { id: "hq", name: "本社営業部" },
  { id: "kyushu", name: "九州支店" },
]
export const workspaceName = (ws: string) => piWorkspaces.find((w) => w.id === ws)?.name ?? ws

export type PiUser = { id: string; name: string; email: string; password: string }

/** 検証用の利用者。パスワードは画面の説明に表示する（実際の認証ではない） */
export const piUsers: PiUser[] = [
  { id: "u-sato", name: "佐藤 美咲", email: "sato@example.com", password: "flow-design" },
  { id: "u-tanaka", name: "田中 健", email: "tanaka@example.com", password: "flow-design" },
]
export const userByEmail = (email: string) => piUsers.find((u) => u.email === email.trim().toLowerCase())

export const regions = ["東京", "大阪", "福岡", "札幌"] as const
export const plans = [
  { value: "light", label: "ライト" },
  { value: "standard", label: "スタンダード" },
  { value: "enterprise", label: "エンタープライズ" },
] as const
export const planLabel = (v: string) => plans.find((p) => p.value === v)?.label ?? v
export const statusLabel: Record<CustomerStatus, string> = { active: "契約中", paused: "停止中" }

const names = [
  "アオバ商事",
  "イズミ製作所",
  "ウミネコ運輸",
  "エニシ建設",
  "オオトリ食品",
  "カエデ薬品",
  "キリン電機",
  "クスノキ出版",
  "ケヤキ不動産",
  "コマチ物産",
  "サクラ通信",
  "シラカバ工業",
  "スズラン化粧品",
  "セキレイ旅行",
  "ソラマメ農園",
  "タチバナ証券",
  "チドリ印刷",
  "ツバキ医療",
  "テッセン鉄工",
  "トキワ百貨店",
  "ナデシコ保険",
  "ニレ設計",
  "ヌマタ水産",
  "ネムノキ家具",
]
const planCycle = ["standard", "light", "enterprise", "standard", "light"]
const mrrOf: Record<string, number> = { light: 9800, standard: 29800, enterprise: 98000 }

function seed(ws: string): PiCustomer[] {
  const offset = ws === "hq" ? 0 : 7
  return names.map((base, i) => {
    const n = i + 1
    const id = `c${String(n).padStart(2, "0")}`
    const name = ws === "hq" ? `株式会社${base}` : `${base}九州`
    const plan = planCycle[(i + offset) % planCycle.length]
    // 5 件に 1 件を停止中にする（九州支店は位置をずらす）
    const status: CustomerStatus = (i + offset) % 5 === 4 ? "paused" : "active"
    return {
      id,
      name,
      region: ws === "hq" ? regions[i % 3] : regions[(i % 2) + 2],
      plan,
      status,
      mrr: mrrOf[plan],
      email: `contact-${id}@${ws}.example.com`,
      phone: `0${(i % 9) + 1}-${String(1000 + n * 37).slice(-4)}-${String(2000 + n * 53).slice(-4)}`,
      note: "",
      contacts: [],
      version: 1,
    }
  })
}

/** ワークスペースごとの顧客。サーバー（server.ts）だけが書き換える */
export type Db = Record<string, PiCustomer[]>
export const createDb = (): Db => Object.fromEntries(piWorkspaces.map((w) => [w.id, seed(w.id)]))

// ---------------------------------------------------------------- 一覧の条件
export type ListFilters = { status: CustomerStatus | null; region: string | null }
export const defaultListFilters: ListFilters = { status: null, region: null }

// ---------------------------------------------------------------- 分析の条件と指標
/** 分析の条件。地域とプランは、指標と明細の両方の範囲を決める（明細へは、実際に使った条件をそのまま渡す） */
export type AnalysisConditions = { region: string | null; plan: string | null }
export const defaultAnalysisConditions: AnalysisConditions = { region: null, plan: null }

/** 指標の基準時刻（固定） */
export const ANALYSIS_AS_OF = "2026-11-28T09:00:00+09:00"

export type MetricId = "revenue" | "active" | "paused"
export const metricLabel: Record<MetricId, string> = { revenue: "月額の売上", active: "契約中の顧客", paused: "停止中の顧客" }

/** 指標ごとの明細の範囲（業務上の定義）。月額の売上と契約中の顧客は契約中、停止中の顧客は停止中の顧客を数える */
export const metricStatus: Record<MetricId, CustomerStatus> = { revenue: "active", active: "active", paused: "paused" }

export function matchesConditions(c: PiCustomer, cond: AnalysisConditions) {
  return (cond.region === null || c.region === cond.region) && (cond.plan === null || c.plan === cond.plan)
}

export type AnalysisSummary = {
  conditions: AnalysisConditions
  asOf: string
  metrics: Record<MetricId, number>
  /** 地域ごとの月額の売上（契約中だけ） */
  byRegion: { region: string; revenue: number; active: number }[]
}

export function summarize(rows: PiCustomer[], cond: AnalysisConditions): AnalysisSummary {
  const inScope = rows.filter((c) => matchesConditions(c, cond))
  const active = inScope.filter((c) => c.status === "active")
  const regionsInScope = [...new Set(rows.map((c) => c.region))].filter((r) => cond.region === null || r === cond.region)
  return {
    conditions: cond,
    asOf: ANALYSIS_AS_OF,
    metrics: {
      revenue: active.reduce((s, c) => s + c.mrr, 0),
      active: active.length,
      paused: inScope.length - active.length,
    },
    byRegion: regionsInScope.map((region) => {
      const rs = active.filter((c) => c.region === region)
      return { region, revenue: rs.reduce((s, c) => s + c.mrr, 0), active: rs.length }
    }),
  }
}

export const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`
export const count = (n: number) => `${n.toLocaleString("ja-JP")}件`

export function conditionsText(cond: AnalysisConditions) {
  return `地域：${cond.region ?? "すべて"}、プラン：${cond.plan ? planLabel(cond.plan) : "すべて"}`
}
