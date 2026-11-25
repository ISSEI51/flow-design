// 顧客一覧のサンプル。Sheet、Dropdown Menu、Alert Dialog の確認用。
export type Customer = {
  id: string
  name: string
  contact: string
  industry: string
  status: "active" | "negotiating" | "paused"
  email: string
  phone: string
  address: string
  plan: string
  updated: string
  note: string
}

export const statusLabel: Record<Customer["status"], string> = {
  active: "契約中",
  negotiating: "商談中",
  paused: "休止中",
}

export const customers: Customer[] = [
  {
    id: "C-0012",
    name: "山田商事",
    contact: "山田 太郎",
    industry: "wholesale",
    status: "active",
    email: "yamada@example.com",
    phone: "03-1234-5678",
    address: "東京都千代田区丸の内 1-2-3",
    plan: "年額プラン",
    updated: "2026-11-20",
    note: "毎月 25 日に請求書を郵送する。担当者の変更は 12 月を予定。",
  },
  {
    id: "C-0015",
    name: "佐藤製作所",
    contact: "佐藤 花子",
    industry: "manufacturing",
    status: "negotiating",
    email: "sato@example.com",
    phone: "06-2345-6789",
    address: "大阪府大阪市北区梅田 2-4-6",
    plan: "月額プラン",
    updated: "2026-11-18",
    note: "工場の増設に合わせて、来年 4 月から利用人数を増やす予定。",
  },
  {
    id: "C-0021",
    name: "北海道グリーンファーム株式会社 札幌支社 営業企画部",
    contact: "鈴木 一郎",
    industry: "agriculture",
    status: "active",
    email: "suzuki@example.com",
    phone: "011-345-6789",
    address: "北海道札幌市中央区北一条西 3-1",
    plan: "年額プラン",
    updated: "2026-11-15",
    note:
      "会社名が長い顧客の確認用。請求書の宛名は「北海道グリーンファーム株式会社 札幌支社」とし、部署名は省略する。" +
      "支払いは翌月末の振り込み。年末年始は 12 月 28 日から 1 月 5 日まで休業する。",
  },
  {
    id: "C-0024",
    name: "Northwind Trading Co., Ltd.",
    contact: "Emily Clark",
    industry: "wholesale",
    status: "paused",
    email: "emily.clark@example.com",
    phone: "+1 206-555-0142",
    address: "1200 Pine Street, Seattle, WA 98101",
    plan: "Monthly plan",
    updated: "2026-10-30",
    note: "English-speaking contact. Invoices are sent by email only, in USD.",
  },
  {
    id: "C-0031",
    name: "高橋建設",
    contact: "高橋 次郎",
    industry: "construction",
    status: "active",
    email: "takahashi@example.com",
    phone: "052-456-7890",
    address: "愛知県名古屋市中村区名駅 4-5-6",
    plan: "年額プラン",
    updated: "2026-10-22",
    note: "現場ごとに請求先が異なる。請求書の発行前に担当者へ確認する。",
  },
  {
    id: "C-0036",
    name: "伊藤デザイン事務所",
    contact: "伊藤 さくら",
    industry: "research",
    status: "negotiating",
    email: "ito@example.com",
    phone: "092-567-8901",
    address: "福岡県福岡市中央区天神 1-7-8",
    plan: "月額プラン",
    updated: "2026-10-10",
    note: "見積もりを提出済み。12 月上旬に回答をもらう予定。",
  },
]
