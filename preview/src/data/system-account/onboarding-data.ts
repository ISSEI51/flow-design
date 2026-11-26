// Onboarding のプレビューで使う例のデータ。Registry には含めない。
// 利用者、ロール、権限、既存の組織（本社営業部、西日本営業部）は model.ts の値を使う。
// 「新しい組織」は、作成した直後の組織の例として Onboarding のプレビューだけで使う（model.ts の組織とは別）。

import type { OnboardingTaskDefinition } from "@/patterns/onboarding"

import {
  memberships,
  onboardingTasks,
  roles,
  users,
  workspaces,
  type OnboardingTaskId,
  type Permission,
  type RoleId,
  type UserId,
} from "./model"

export type OnboardingWorkspaceId = string

/** 作成した直後の組織（Onboarding のプレビューだけで使う） */
export const NEW_WORKSPACE_ID = "new"

export const onboardingWorkspaceNames: Record<string, string> = {
  hq: workspaces.hq.name,
  west: workspaces.west.name,
  [NEW_WORKSPACE_ID]: "新しい組織",
}

/** Onboarding の例で使う所属。model.ts の所属に、作成した直後の組織の所属を加える */
export const onboardingMemberships: { userId: UserId; workspaceId: string; role: RoleId; joinedBy: "created" | "invited" }[] = [
  ...memberships,
  { userId: "u-sato", workspaceId: NEW_WORKSPACE_ID, role: "admin", joinedBy: "created" },
  { userId: "u-suzuki", workspaceId: NEW_WORKSPACE_ID, role: "member", joinedBy: "invited" },
  { userId: "u-tanaka", workspaceId: NEW_WORKSPACE_ID, role: "viewer", joinedBy: "invited" },
]

/** Onboarding の部品が受け取る利用者。統合の検証画面は、現在の利用者と組織からこの値を作って渡す */
export type OnboardingViewer = {
  userId: UserId
  workspaceId: string
  /** 現在の組織でのロールの権限 */
  permissions: readonly Permission[]
  /** 組織を作成した（created）か、招待された（invited）か */
  joinedBy: "created" | "invited"
}

export function viewerOf(userId: UserId, workspaceId: string): OnboardingViewer {
  const m = onboardingMemberships.find((x) => x.userId === userId && x.workspaceId === workspaceId)
  if (!m) throw new Error(`no membership: ${userId} ${workspaceId}`)
  return { userId, workspaceId, permissions: roles[m.role].permissions, joinedBy: m.joinedBy }
}

export const viewerLabel = (v: OnboardingViewer) => {
  const m = onboardingMemberships.find((x) => x.userId === v.userId && x.workspaceId === v.workspaceId)
  return `${users[v.userId].name}（${m ? roles[m.role].name : ""}、${v.joinedBy === "created" ? "組織を作成" : "招待"}）`
}

/**
 * 利用を続けるための要件。支払い方法は「特定の時点（試用期間の終了）で必要な設定」であり、
 * 利用開始の前には求めない。Checklist を非表示にしても、要件の達成としては扱わない。
 */
export const requiredTaskIds: readonly OnboardingTaskId[] = ["set-billing"]

/** Registry の deriveChecklist に渡す作業の定義（model.ts の作業に、必須かどうかを加える） */
export const onboardingTaskDefinitions: OnboardingTaskDefinition<OnboardingTaskId, Permission>[] = onboardingTasks.map((t) => ({
  ...t,
  required: requiredTaskIds.includes(t.id),
}))

/** 作業の画面（プレビューの小さな製品の画面） */
export type ProductScreen = "customers" | "import" | "members" | "billing" | "profile"

export const taskScreens: Partial<Record<OnboardingTaskId, ProductScreen>> = {
  "first-customer": "customers",
  "import-customers": "import",
  "invite-members": "members",
  "set-billing": "billing",
  "complete-profile": "profile",
}

/** 作業のボタンの名前。押した結果（移る先）がわかる名前にする */
export const taskActionLabels: Partial<Record<OnboardingTaskId, string>> = {
  "first-customer": "顧客を登録",
  "import-customers": "取り込みの画面へ",
  "invite-members": "メンバーの画面へ",
  "set-billing": "支払いの画面へ",
  "complete-profile": "プロフィールへ",
}

export const screenLabels: Record<ProductScreen, string> = {
  customers: "顧客",
  import: "取り込み",
  members: "メンバー",
  billing: "支払い",
  profile: "プロフィール",
}

/** Contextual Help の ID（閉じた状態をアカウントごとに保存する） */
export const helpIds = {
  search: "customers-search",
  roleTasks: "members-role-tasks",
} as const
