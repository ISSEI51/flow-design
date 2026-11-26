// Permission States のプレビューに固有の例のデータ。Registry の部品はこのデータを知らない（製品側のデータの例）。
// アカウント、ワークスペース、ロール、権限、契約プランは model.ts の値を使い、ほかのページと矛盾させない。

import { customers, type Customer } from "../data-display/customers"
import {
  featureLabels,
  membershipOf,
  permissionLabels,
  roles,
  users,
  workspaces,
  type Feature,
  type Permission,
  type RoleId,
  type ServiceComponent,
  type UserId,
  type WorkspaceId,
} from "./model"

/** 権限のスコープ（アカウント × ワークスペース）。応答の照合と、古い結果の破棄に使う */
export type PermissionScope = { userId: UserId; workspaceId: WorkspaceId }
export const scopeKeyOf = (s: PermissionScope) => `${s.userId}:${s.workspaceId}`

/** 例で切り替える利用者（model.ts の memberships と同じ組み合わせ） */
export const exampleScopes: { scope: PermissionScope; label: string }[] = (
  [
    ["u-sato", "hq"],
    ["u-suzuki", "hq"],
    ["u-tanaka", "hq"],
    ["u-sato", "west"],
  ] as const
).map(([userId, workspaceId]) => {
  const role = membershipOf(userId, workspaceId)!.role
  return {
    scope: { userId, workspaceId },
    label: `${users[userId].name}（${workspaces[workspaceId].name}・${roles[role].name}）`,
  }
})

export const roleLabel = (role: RoleId) => roles[role].name
export const permissionLabel = (p: Permission) => permissionLabels[p]
export const featureLabel = (f: Feature) => featureLabels[f]

/** 利用者が自分で申請できる権限。ここにない権限は、管理者への問い合わせだけを示す（存在しない申請の機能を表示しない） */
export const requestablePermissions: Permission[] = ["customers.edit", "customers.delete", "customers.export", "members.view"]

/** 付与・削除の影響が大きい権限。ロールの変更でこれらが増減する場合は、確認してから変更する */
export const sensitivePermissions: Permission[] = ["customers.delete", "members.manage", "billing.manage", "settings.org.edit", "audit.view"]

/** ワークスペースの管理者（問い合わせ先）。権限の申請ができない場合に示す */
export const adminContactOf = (workspaceId: WorkspaceId) => {
  const ids = (Object.keys(users) as UserId[]).filter((id) => membershipOf(id, workspaceId)?.role === "admin")
  return ids.map((id) => users[id])
}

/** 前提の設定の名前 */
export const prerequisiteLabels: Record<string, string> = {
  "invite-sender": "招待メールの送信元のアドレスの設定",
}

/** 制限された操作の例。必要な条件（製品のデータ）と、操作の性質（業務の操作か、管理の機能か） */
export type ExampleOperation = {
  id: "edit" | "delete" | "export" | "invite" | "audit"
  label: string
  permissions: Permission[]
  feature?: Feature
  service?: ServiceComponent
  prerequisite?: string
  relevance: "task" | "admin"
  disclosure?: "public" | "confidential"
}

export const exampleOperations: ExampleOperation[] = [
  { id: "edit", label: "顧客を編集", permissions: ["customers.edit"], service: "customers", relevance: "task" },
  { id: "delete", label: "顧客を削除", permissions: ["customers.delete"], service: "customers", relevance: "task" },
  { id: "export", label: "顧客を書き出す", permissions: ["customers.export"], feature: "export", service: "export", relevance: "task" },
  { id: "invite", label: "メンバーを招待", permissions: ["members.manage"], prerequisite: "invite-sender", relevance: "admin" },
  { id: "audit", label: "変更の履歴（監査ログ）を見る", permissions: ["audit.view"], feature: "audit-log", relevance: "admin" },
]

/**
 * 本社営業部の顧客の写し（例で使う 8 件）。
 * 2 件は「担当者と管理者だけが閲覧できる顧客」（レコード単位の制限）。閲覧できない利用者には、
 * 件数、検索の候補、書き出しの対象のいずれにも含めない（サーバーが送らない）。
 */
export type PermissionCustomer = Customer & {
  /** 顧客が属するワークスペース。ほかのワークスペースの利用者には、件数にも一覧にも含めない */
  workspaceId: WorkspaceId
  /** 閲覧できる利用者。null はワークスペースで customers.view を持つ全員 */
  visibleTo: UserId[] | null
  version: number
}

// 本社営業部は customers の 1〜8 番目、西日本営業部は 11〜18 番目（model.ts の西日本営業部の通知の対象 customers[10] を含む）。
export const seedPermissionCustomers = (): PermissionCustomer[] => [
  ...customers.slice(0, 8).map((c, i) => ({ ...c, workspaceId: "hq" as const, visibleTo: i === 2 || i === 5 ? (["u-sato"] as UserId[]) : null, version: 1 })),
  ...customers.slice(10, 18).map((c) => ({ ...c, workspaceId: "west" as const, visibleTo: null, version: 1 })),
]

/** 制限されている顧客の ID（検品で、件数や候補に含まれないことを確かめる） */
export const confidentialCustomerIds = seedPermissionCustomers()
  .filter((c) => c.visibleTo)
  .map((c) => c.id)

/** 編集の例で使う顧客（誰でも閲覧できる顧客） */
export const editingCustomerId = customers[0].id
