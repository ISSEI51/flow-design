// 顧客管理・契約管理の BtoB SaaS を想定したプレビュー用のデータ。
// コンポーネントはこのデータを知らない。ナビゲーションの項目と現在位置は、画面（製品）が渡す。

export const kpis = [
  { label: "今月の契約金額", value: "¥4,820,000", note: "先月より 8% 増" },
  { label: "更新が近い契約", value: "6 件", note: "30 日以内" },
  { label: "未入金", value: "¥384,000", note: "3 社" },
  { label: "進行中の商談", value: "18 件", note: "うち 5 件が見積もり" },
]

export type Customer = {
  id: string
  name: string
  industry: string
  plan: string
  owner: string
  renewal: string
  unpaid: string
}

export const customers: Customer[] = [
  { id: "yamada", name: "株式会社山田商事", industry: "卸売業", plan: "スタンダード", owner: "佐藤 花子", renewal: "2027年3月31日", unpaid: "¥0" },
  { id: "hokkai", name: "北海物産株式会社", industry: "製造業", plan: "ライト", owner: "鈴木 一郎", renewal: "2026年12月15日", unpaid: "¥42,000" },
  { id: "minato", name: "みなと運輸株式会社", industry: "運輸業", plan: "エンタープライズ", owner: "佐藤 花子", renewal: "2027年6月30日", unpaid: "¥0" },
  { id: "kita", name: "北日本精密機械工業株式会社", industry: "製造業", plan: "スタンダード", owner: "高橋 健", renewal: "2026年12月31日", unpaid: "¥342,000" },
  { id: "global", name: "Global Precision Holdings Inc.", industry: "製造業", plan: "エンタープライズ", owner: "田中 美咲", renewal: "2027年1月31日", unpaid: "¥0" },
]

export const contracts = [
  { id: "C-2026-0142", name: "スタンダードプラン", period: "2026年4月1日〜2027年3月31日", amount: "¥128,000 / 月", status: "契約中" },
  { id: "C-2025-0098", name: "導入支援", period: "2025年4月1日〜2025年6月30日", amount: "¥450,000", status: "終了" },
  { id: "C-2026-0187", name: "追加ユーザー 20 名", period: "2026年10月1日〜2027年3月31日", amount: "¥24,000 / 月", status: "契約中" },
]

export const activities = [
  { date: "2026年11月20日", text: "佐藤 花子が、契約の更新について電話で連絡した" },
  { date: "2026年11月12日", text: "11月分の請求書を送付した" },
  { date: "2026年10月28日", text: "追加ユーザー 20 名の契約を締結した" },
]
