import { House } from "lucide-react"

import type { NavItem } from "@/patterns/sidebar-nav"

// SidebarNav の項目の型の検品。npm run typecheck で確かめる（実行はしない）。
// 誤りを期待する行（ts-expect-error の指示）で型の誤りが起きなければ、typecheck が失敗する。

export const typeChecks: NavItem[] = [
  // 子の項目を持たない項目：href は必須
  { id: "home", label: "ホーム", icon: House, href: "/" },
  // @ts-expect-error 子の項目を持たない項目に href がない（href="#" への暗黙のフォールバックを型で防ぐ）
  { id: "home", label: "ホーム", icon: House },
  // 子の項目を持つ親：href を省略できる（親はページを持たない）
  { id: "reports", label: "レポート", icon: House, children: [{ id: "sales", label: "売上", href: "/reports/sales" }] },
  // 子の項目を持つ親：href と pageLabel を持てる
  {
    id: "contracts",
    label: "契約",
    icon: House,
    href: "/contracts",
    pageLabel: "契約の一覧",
    children: [{ id: "renewals", label: "更新が近い契約", href: "/contracts/renewals" }],
  },
  // @ts-expect-error ページを持たない親に pageLabel を付けた
  { id: "reports", label: "レポート", icon: House, pageLabel: "一覧", children: [{ id: "a", label: "A", href: "/a" }] },
  // @ts-expect-error 子の項目を持つ親に badge を付けた（親では表示しない）
  { id: "reports", label: "レポート", icon: House, badge: "3", children: [{ id: "a", label: "A", href: "/a" }] },
  // badge には意味（badgeLabel）が必要
  { id: "deals", label: "商談", icon: House, href: "/deals", badge: "18", badgeLabel: "進行中 18 件" },
  // @ts-expect-error badge だけを付け、意味（badgeLabel）がない
  { id: "deals", label: "商談", icon: House, href: "/deals", badge: "18" },
  // @ts-expect-error ページを持たない親の子の項目が空（何も描画されない）
  { id: "reports", label: "レポート", icon: House, children: [] },
  // ページを持つ親は、子の項目が空でもよい（親のページへの通常の項目として描画する）
  { id: "contracts", label: "契約", icon: House, href: "/contracts", children: [] },
  // @ts-expect-error 子の項目を持たない項目に pageLabel を付けた
  { id: "home", label: "ホーム", icon: House, href: "/", pageLabel: "ホームの一覧" },
  {
    id: "reports",
    label: "レポート",
    icon: House,
    // @ts-expect-error 3 階層目（子の項目の子）は持てない
    children: [{ id: "a", label: "A", href: "/a", children: [{ id: "b", label: "B", href: "/b" }] }],
  },
]
