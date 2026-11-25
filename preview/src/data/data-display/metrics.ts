// Chart と業務ダッシュボードのプレビュー用の架空の集計値。

export type MonthlyRevenue = {
  month: string
  /** 実績（万円）。集計できなかった月は null */
  actual: number | null
  /** 予測（万円）。実績の最後の月から始め、線をつなげる */
  forecast: number | null
}

// 2025 年 12 月〜2027 年 2 月。2026 年 6 月は集計の不具合で値がない（欠損）。2026 年 12 月以降は予測。
export const monthlyRevenue: MonthlyRevenue[] = [
  { month: "2025/12", actual: 1820, forecast: null },
  { month: "2026/01", actual: 1760, forecast: null },
  { month: "2026/02", actual: 1905, forecast: null },
  { month: "2026/03", actual: 2140, forecast: null },
  { month: "2026/04", actual: 2010, forecast: null },
  { month: "2026/05", actual: 2085, forecast: null },
  { month: "2026/06", actual: null, forecast: null },
  { month: "2026/07", actual: 2230, forecast: null },
  { month: "2026/08", actual: 2190, forecast: null },
  { month: "2026/09", actual: 2380, forecast: null },
  { month: "2026/10", actual: 2455, forecast: null },
  { month: "2026/11", actual: 2510, forecast: 2510 },
  { month: "2026/12", actual: null, forecast: 2580 },
  { month: "2027/01", actual: null, forecast: 2540 },
  { month: "2027/02", actual: null, forecast: 2660 },
]

// プラン別の利用者数（人）の推移。複数系列。
export const usersByPlan = [
  { month: "6月", basic: 2100, standard: 3400, enterprise: 1200 },
  { month: "7月", basic: 2180, standard: 3520, enterprise: 1260 },
  { month: "8月", basic: 2150, standard: 3710, enterprise: 1340 },
  { month: "9月", basic: 2240, standard: 3830, enterprise: 1450 },
  { month: "10月", basic: 2300, standard: 3980, enterprise: 1530 },
  { month: "11月", basic: 2280, standard: 4150, enterprise: 1620 },
]

// 地域別の新規契約数（件、2026 年 10 月）。
export const newContractsByRegion = [
  { region: "北海道", count: 18 },
  { region: "東北", count: 23 },
  { region: "関東", count: 96 },
  { region: "中部", count: 41 },
  { region: "近畿", count: 57 },
  { region: "中国", count: 15 },
  { region: "四国", count: 9 },
  { region: "九州・沖縄", count: 31 },
]

// 地域別の前年同月比の増減（件）。負の値を含む。
export const contractChangeByRegion = [
  { region: "北海道", change: -4 },
  { region: "東北", change: 3 },
  { region: "関東", change: 21 },
  { region: "中部", change: 6 },
  { region: "近畿", change: -9 },
  { region: "中国", change: 0 },
  { region: "四国", change: -2 },
  { region: "九州・沖縄", change: 8 },
]

// プラン別の契約数（件、2026 年 11 月末）。構成比。
export const contractsByPlan = [
  { plan: "basic", label: "ベーシック", count: 214 },
  { plan: "standard", label: "スタンダード", count: 268 },
  { plan: "enterprise", label: "エンタープライズ", count: 98 },
]

// 四半期ごとの契約状況の内訳（件）。2026 年 4Q は途中集計。
export const statusByQuarter = [
  { quarter: "2026 1Q", active: 280, trial: 64, paused: 52, provisional: false },
  { quarter: "2026 2Q", active: 296, trial: 71, paused: 58, provisional: false },
  { quarter: "2026 3Q", active: 312, trial: 88, paused: 61, provisional: false },
  { quarter: "2026 4Q", active: 322, trial: 93, paused: 80, provisional: true },
]
