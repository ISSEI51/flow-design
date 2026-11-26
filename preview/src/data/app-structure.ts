import {
  BarChart3,
  Building2,
  FileSignature,
  FileText,
  Handshake,
  House,
  Receipt,
  Settings,
  UserPlus,
  Wallet,
} from "lucide-react"

import type { NavGroup, NavItem } from "@/patterns/sidebar-nav"

// App Structure の検証用の業務アプリケーション（営業管理）のデータ。Registry の部品はこのデータを知らない。
// 項目は機能の分類ではなく、営業の業務の流れ（見込み客 → 顧客 → 商談 → 見積もり → 契約 → 請求 → 入金）の順に並べる。
// 毎日最初に見る「ホーム」は、使用頻度が極端に高いため、流れの外の先頭に置く（合理的な例外）。
// 設定は製品全体に関わるため、Sidebar の下部に置く。

export const structureHref = (page: string, extra?: Record<string, string>) => {
  const params = new URLSearchParams({ page, ...extra })
  return `#/structure-app?${params.toString()}`
}

type Labels = Record<string, string>

const shortLabels: Labels = {
  home: "ホーム",
  leads: "見込み客",
  customers: "顧客",
  deals: "商談",
  quotes: "見積もり",
  contracts: "契約",
  renewals: "更新が近い契約",
  cancellations: "解約の申し込み",
  invoices: "請求書",
  payments: "入金",
  reports: "レポート",
  "sales-report": "売上のレポート",
  "contract-report": "契約の推移",
  settings: "設定",
  "customer-new": "顧客を登録",
}

// 翻訳や長い名前による文字数の増加を確かめるための名前（&long=1）。
const longLabels: Labels = {
  ...shortLabels,
  leads: "見込み客と問い合わせの管理",
  customers: "顧客と取引先の担当者",
  deals: "Deals and opportunities in progress",
  renewals: "30 日以内に更新を迎える契約の一覧",
  "sales-report": "部門別・担当者別の売上のレポート",
}

export function structureLabels(long: boolean) {
  return long ? longLabels : shortLabels
}

export function structureNav(long: boolean, extra?: Record<string, string>): NavGroup[] {
  const l = structureLabels(long)
  const href = (id: string) => structureHref(id, extra)
  const item = (id: string, icon: NavItem["icon"], more?: Partial<NavItem>): NavItem => ({ id, label: l[id], icon, href: href(id), ...more })
  return [
    { items: [item("home", House)] },
    {
      label: "営業",
      items: [
        item("leads", UserPlus),
        item("customers", Building2),
        item("deals", Handshake, { badge: "18", badgeLabel: "進行中 18 件" }),
        item("quotes", FileSignature),
        item("contracts", FileText, {
          pageLabel: "契約の一覧",
          children: [
            { id: "renewals", label: l.renewals, href: href("renewals") },
            { id: "cancellations", label: l.cancellations, href: href("cancellations") },
          ],
        }),
      ],
    },
    {
      label: "請求",
      items: [item("invoices", Receipt), item("payments", Wallet)],
    },
    {
      // 分析の機能は 1 つのため、グループの見出しを付けない（見出しが項目の名前を繰り返すだけになる）。
      items: [
        // レポートは自身のページを持たない。押すと子の項目を開閉する。
        {
          id: "reports",
          label: l.reports,
          icon: BarChart3,
          children: [
            { id: "sales-report", label: l["sales-report"], href: href("sales-report") },
            { id: "contract-report", label: l["contract-report"], href: href("contract-report") },
          ],
        },
      ],
    },
  ]
}

export const structureSettingsItem = (long: boolean, extra?: Record<string, string>): NavItem => ({
  id: "settings",
  label: structureLabels(long).settings,
  icon: Settings,
  href: structureHref("settings", extra),
})

export const structureUser = { name: "佐藤 花子", email: "hanako.sato@example.com", team: "東日本営業部" }
