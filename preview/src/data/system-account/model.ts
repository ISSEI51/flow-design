// System & Account のプレビューで共通に使う、架空のアカウント、ワークスペース、ロール、権限、設定値、通知のデータ。
// 実在の人物・組織とは関係がない。Registry の部品はこのデータを知らない（製品側のデータの例）。
// 6 種類の資料のページと統合の検証画面は、すべてこのファイルの値を使い、件数や状態を矛盾させない。
// 認証、認可、メール送信、通知の配信、障害の監視は、すべて模擬の処理である（server.ts）。

import { customers } from "../data-display/customers"

// ---------------------------------------------------------------- アカウント
export type UserId = "u-sato" | "u-suzuki" | "u-tanaka"
export type User = { id: UserId; name: string; email: string }

// 佐藤 花子は App Structure と Data Browsing の検証画面と同じ利用者。
export const users: Record<UserId, User> = {
  "u-sato": { id: "u-sato", name: "佐藤 花子", email: "hanako.sato@example.com" },
  "u-suzuki": { id: "u-suzuki", name: "鈴木 一郎", email: "ichiro.suzuki@example.com" },
  "u-tanaka": { id: "u-tanaka", name: "田中 美咲", email: "misaki.tanaka@example.com" },
}

// 模擬のログインで使うパスワード。実際の認証情報を入力する必要がないよう、画面にも示す。
// 入力されたパスワードと認証コードは、メモリの外（LocalStorage、URL、ログ）に保存しない。
export const demoPassword = "flow-demo-2026"
// 模擬の多要素認証のコード。先頭の 0 を含む（数値に変換すると失われることの検品）。
export const demoVerificationCode = "012345"

// ---------------------------------------------------------------- ワークスペース（組織）と契約プラン
export type PlanId = "standard" | "business"
export type WorkspaceId = "hq" | "west"
export type Workspace = { id: WorkspaceId; name: string; plan: PlanId }

export const workspaces: Record<WorkspaceId, Workspace> = {
  hq: { id: "hq", name: "本社営業部", plan: "standard" },
  west: { id: "west", name: "西日本営業部", plan: "business" },
}

export const plans: Record<PlanId, { name: string; features: Feature[] }> = {
  standard: { name: "スタンダード", features: ["customers", "notifications", "export"] },
  business: { name: "ビジネス", features: ["customers", "notifications", "export", "audit-log", "sso"] },
}

// 契約プランで利用できる機能。認可（ロールの権限）とは別に管理する。
export type Feature = "customers" | "notifications" | "export" | "audit-log" | "sso"
export const featureLabels: Record<Feature, string> = {
  customers: "顧客管理",
  notifications: "通知",
  export: "書き出し",
  "audit-log": "監査ログ",
  sso: "組織の SSO",
}

// ---------------------------------------------------------------- ロールと権限（認可）
export type RoleId = "admin" | "member" | "viewer"
export type Permission =
  | "customers.view"
  | "customers.edit"
  | "customers.delete"
  | "customers.export"
  | "members.view"
  | "members.manage"
  | "billing.manage"
  | "settings.org.view"
  | "settings.org.edit"
  | "audit.view"

export const roles: Record<RoleId, { name: string; description: string; permissions: Permission[] }> = {
  admin: {
    name: "管理者",
    description: "メンバー、契約、組織の設定を管理できます",
    permissions: [
      "customers.view",
      "customers.edit",
      "customers.delete",
      "customers.export",
      "members.view",
      "members.manage",
      "billing.manage",
      "settings.org.view",
      "settings.org.edit",
      "audit.view",
    ],
  },
  member: {
    name: "メンバー",
    description: "顧客の登録と編集ができます",
    permissions: ["customers.view", "customers.edit", "customers.export", "members.view", "settings.org.view"],
  },
  viewer: {
    name: "閲覧者",
    description: "顧客を閲覧できます",
    permissions: ["customers.view"],
  },
}

export const permissionLabels: Record<Permission, string> = {
  "customers.view": "顧客を閲覧",
  "customers.edit": "顧客を登録・編集",
  "customers.delete": "顧客を削除",
  "customers.export": "顧客を書き出す",
  "members.view": "メンバーを閲覧",
  "members.manage": "メンバーを招待・変更",
  "billing.manage": "契約と請求を管理",
  "settings.org.view": "組織の設定を閲覧",
  "settings.org.edit": "組織の設定を変更",
  "audit.view": "監査ログを閲覧",
}

// ワークスペースごとの所属とロール。
export type Membership = { userId: UserId; workspaceId: WorkspaceId; role: RoleId; joinedBy: "created" | "invited" }
export const memberships: Membership[] = [
  { userId: "u-sato", workspaceId: "hq", role: "admin", joinedBy: "created" },
  { userId: "u-sato", workspaceId: "west", role: "member", joinedBy: "invited" },
  { userId: "u-suzuki", workspaceId: "hq", role: "member", joinedBy: "invited" },
  { userId: "u-tanaka", workspaceId: "hq", role: "viewer", joinedBy: "invited" },
]

export const membershipOf = (userId: UserId, workspaceId: WorkspaceId) =>
  memberships.find((m) => m.userId === userId && m.workspaceId === workspaceId) ?? null
export const workspacesOf = (userId: UserId) => memberships.filter((m) => m.userId === userId).map((m) => workspaces[m.workspaceId])

// ---------------------------------------------------------------- 設定値
export type Theme = "system" | "light" | "dark"
export type Language = "ja" | "en"
export type NotificationType = "assignment" | "mention" | "renewal" | "job" | "security" | "product"
export type Channel = "in-app" | "email" | "push"

export const notificationTypeLabels: Record<NotificationType, string> = {
  assignment: "担当の割り当て",
  mention: "コメントでのメンション",
  renewal: "契約の更新のリマインダー",
  job: "書き出しと取り込みの完了",
  security: "セキュリティ（新しい端末からのログインなど）",
  product: "新しい機能のお知らせ",
}
export const channelLabels: Record<Channel, string> = { "in-app": "アプリ内", email: "メール", push: "プッシュ通知" }

// 個人の設定（アカウント単位）
export type PersonalSettings = {
  theme: Theme
  language: Language
  timezone: string
  /** 通知の種類 × 配信チャネル */
  notifications: Record<NotificationType, Record<Channel, boolean>>
  digest: "off" | "daily"
  quietHours: { enabled: boolean; start: string; end: string }
}

const allChannels = (inApp: boolean, email: boolean, push: boolean) => ({ "in-app": inApp, email, push })

export const defaultPersonalSettings: PersonalSettings = {
  theme: "system",
  language: "ja",
  timezone: "Asia/Tokyo",
  notifications: {
    assignment: allChannels(true, true, false),
    mention: allChannels(true, true, true),
    renewal: allChannels(true, true, false),
    job: allChannels(true, false, false),
    security: allChannels(true, true, false),
    product: allChannels(true, false, false),
  },
  digest: "off",
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
}

// 組織の設定と組織のポリシー（ワークスペース単位）
export type OrgSettings = {
  name: string
  /** 組織の標準の表示言語。個人の設定で上書きできる */
  defaultLanguage: Language
  /** 多要素認証を必須にする（組織のポリシー。個人の設定で無効にできない） */
  requireMfa: boolean
  /** 外部アカウント（Google、Microsoft）でのログインを許可する */
  allowSocialLogin: boolean
  /** 組織の SSO を必須にする（ビジネスプランだけ） */
  requireSso: boolean
}

export const orgSettings: Record<WorkspaceId, OrgSettings> = {
  hq: { name: "本社営業部", defaultLanguage: "ja", requireMfa: true, allowSocialLogin: true, requireSso: false },
  west: { name: "西日本営業部", defaultLanguage: "ja", requireMfa: false, allowSocialLogin: false, requireSso: true },
}

// 組織のポリシーで無効にできない通知（必須の通知）。理由を画面に示す。
export const mandatoryNotifications: { type: NotificationType; channel: Channel; reason: string }[] = [
  { type: "security", channel: "email", reason: "組織のポリシーで、セキュリティの通知はメールで必ず届きます" },
  { type: "security", channel: "in-app", reason: "アカウントを保護するため、アプリ内のセキュリティの通知は無効にできません" },
]

// ---------------------------------------------------------------- 通知
export type NotificationRecord = {
  /** 安定した通知の ID。重複の判定に使う（本文の文字列では判定しない） */
  id: string
  /** 通知を生成したイベントの ID（同じイベントから生成された通知は同じ値） */
  eventId: string
  workspaceId: WorkspaceId
  type: NotificationType
  title: string
  /** 対象（通知から移動する先） */
  target: { kind: "customer" | "job" | "settings"; id: string; label: string } | null
  /** 発生した時刻。基準の時刻（referenceNow）からの分 */
  minutesAgo: number
  read: boolean
  /** 業務の対応の状態。閲覧の状態（read）とは独立して持つ */
  task: "none" | "open" | "done"
  /** 関連する連続したイベントをまとめるキー */
  groupKey?: string
}

// 相対時刻の基準。プレビューの表示と検品の結果を、実行した日時によって変えない。
export const referenceNow = new Date("2026-11-26T10:00:00+09:00").getTime()

const c = (i: number) => customers[i]

export const seedNotifications: NotificationRecord[] = [
  { id: "n-101", eventId: "e-101", workspaceId: "hq", type: "assignment", title: `${c(0).company}の担当者に設定されました`, target: { kind: "customer", id: c(0).id, label: c(0).company }, minutesAgo: 4, read: false, task: "open" },
  { id: "n-102", eventId: "e-102", workspaceId: "hq", type: "mention", title: `高橋 由紀さんが${c(1).company}のメモであなたをメンションしました`, target: { kind: "customer", id: c(1).id, label: c(1).company }, minutesAgo: 18, read: false, task: "none" },
  { id: "n-103", eventId: "e-103", workspaceId: "hq", type: "job", title: "顧客の書き出しが完了しました（1,240 件）", target: { kind: "job", id: "job-export-1", label: "顧客の書き出し" }, minutesAgo: 35, read: false, task: "none" },
  { id: "n-104", eventId: "e-104", workspaceId: "hq", type: "renewal", title: `${c(2).company}の契約の更新日まで 7 日です`, target: { kind: "customer", id: c(2).id, label: c(2).company }, minutesAgo: 60 * 3, read: true, task: "open", groupKey: "renewal-week" },
  { id: "n-105", eventId: "e-105", workspaceId: "hq", type: "renewal", title: `${c(3).company}の契約の更新日まで 7 日です`, target: { kind: "customer", id: c(3).id, label: c(3).company }, minutesAgo: 60 * 3, read: true, task: "open", groupKey: "renewal-week" },
  { id: "n-106", eventId: "e-106", workspaceId: "hq", type: "security", title: "新しい端末からログインしました（macOS、Safari）", target: { kind: "settings", id: "security", label: "セキュリティの設定" }, minutesAgo: 60 * 26, read: true, task: "none" },
  { id: "n-107", eventId: "e-107", workspaceId: "hq", type: "product", title: "一覧の表示形式に Calendar を追加しました", target: null, minutesAgo: 60 * 24 * 3, read: true, task: "none" },
  { id: "n-201", eventId: "e-201", workspaceId: "west", type: "assignment", title: `${c(10).company}の担当者に設定されました`, target: { kind: "customer", id: c(10).id, label: c(10).company }, minutesAgo: 9, read: false, task: "open" },
  { id: "n-202", eventId: "e-202", workspaceId: "west", type: "job", title: "顧客の取り込みが一部失敗しました（成功 48 件、失敗 2 件）", target: { kind: "job", id: "job-import-2", label: "顧客の取り込み" }, minutesAgo: 50, read: false, task: "open" },
]

export const notificationsOf = (workspaceId: WorkspaceId) => seedNotifications.filter((n) => n.workspaceId === workspaceId)

// ---------------------------------------------------------------- Onboarding の初期作業
export type OnboardingTaskId = "invite-members" | "import-customers" | "connect-calendar" | "set-billing" | "complete-profile" | "first-customer"
export type OnboardingTask = {
  id: OnboardingTaskId
  title: string
  description: string
  /** 作業に必要な権限。権限のない利用者の Checklist に表示しない */
  permission: Permission | null
  /** 進捗を数える単位 */
  scope: "account" | "workspace"
}

export const onboardingTasks: OnboardingTask[] = [
  { id: "first-customer", title: "最初の顧客を登録する", description: "顧客の一覧から登録すると、商談と契約を記録できます。", permission: "customers.edit", scope: "workspace" },
  { id: "import-customers", title: "既存の顧客を取り込む", description: "CSV ファイルから、まとめて登録できます。", permission: "customers.edit", scope: "workspace" },
  { id: "invite-members", title: "メンバーを招待する", description: "一緒に使うメンバーを招待します。", permission: "members.manage", scope: "workspace" },
  { id: "set-billing", title: "支払い方法を登録する", description: "試用期間の終了後も続けて使えます。", permission: "billing.manage", scope: "workspace" },
  { id: "complete-profile", title: "プロフィールの写真を設定する", description: "メンバーがあなたを見分けやすくなります。", permission: null, scope: "account" },
]

// ---------------------------------------------------------------- サービスの状態（System States）
export type ServiceComponent = "sign-in" | "customers" | "search" | "export" | "notifications" | "billing"
export const serviceComponentLabels: Record<ServiceComponent, string> = {
  "sign-in": "ログイン",
  customers: "顧客の閲覧と編集",
  search: "検索",
  export: "書き出し",
  notifications: "通知",
  billing: "契約と請求",
}
