// Settings のプレビュー用の模擬のサーバー。実際の API、認証、認可、データベースは使わない。Registry には含めない。
// 応答の時間、結果（success / fail / unknown）、AbortSignal を無視する応答、権限の変更を再現し、Patterns の挙動を確かめる。
// 検品は window.__fdSaSettingsServer で設定する（応答の時間、結果、ignoreAbort、受け付けた要求の記録、reset()）。
//
// サーバーの規則（製品の API の責務の例）
// - 同じ項目への要求は、受け付けた順に適用する。後から届いた古い要求は、新しい値を上書きしない（版の比較）。
//   応答には、適用した後に保存されている値を返す。
// - 組織の設定の変更は、サーバーで保持するロール（roles）で判断する。画面に示した権限ではなく、サーバーの判断が最終的なもの。

import { isAbortError, mockRequest, MockRequestError, type MockOutcome } from "./mock"
import {
  defaultPersonalSettings,
  membershipOf,
  memberships,
  orgSettings,
  roles as roleDefs,
  users,
  workspaces,
  type Language,
  type Permission,
  type RoleId,
  type Theme,
  type UserId,
  type WorkspaceId,
} from "./model"

// ---------------------------------------------------------------- 値の型
export type DisplayValues = {
  theme: Theme
  /** 個人の上書き。null は組織の標準に従う */
  language: Language | null
  timezone: string
  /** 通知を止める時間帯（親）と、その時刻（子）。親を無効にしても子の値は残す */
  quietEnabled: boolean
  quietStart: string
  quietEnd: string
  /** 個人の 2 段階認証。組織のポリシーで必須の場合は、この値に関係なく有効 */
  mfa: boolean
}
export type InstantKey = keyof DisplayValues

export const displayDefaults: DisplayValues = {
  theme: defaultPersonalSettings.theme,
  language: null,
  timezone: defaultPersonalSettings.timezone,
  quietEnabled: defaultPersonalSettings.quietHours.enabled,
  quietStart: defaultPersonalSettings.quietHours.start,
  quietEnd: defaultPersonalSettings.quietHours.end,
  mfa: false,
}

export type Profile = { name: string; title: string; bio: string }
export type ExternalLink = { provider: "google"; connected: boolean; account: string | null }

export type PersonalRecord = {
  display: DisplayValues
  profile: Profile
  google: ExternalLink
  /** パスワードを最後に変更した日（表示用） */
  passwordChangedOn: string
  /** アカウントの削除の予約 */
  deletion: { scheduledOn: string } | null
}

export type OrgInfo = { name: string; defaultLanguage: Language }
export type SecurityPolicy = { requireMfa: boolean; allowSocialLogin: boolean; requireSso: boolean }
export const securityDefaults: SecurityPolicy = { requireMfa: false, allowSocialLogin: true, requireSso: false }

export type ChangeRecord = { id: string; by: string; at: string; summary: string }

export type OrgRecord = {
  info: OrgInfo
  security: SecurityPolicy
  plan: "standard" | "business"
  history: ChangeRecord[]
  deletion: { scheduledOn: string } | null
}

export type Member = { userId: string; name: string; email: string; role: RoleId; status: "active" | "invited" }

// ---------------------------------------------------------------- 設定
type Kind = "get" | "instant" | "form" | "members" | "invite" | "action"

type ServerConfig = {
  /** 応答までの時間（ms） */
  latency: Record<Kind, number>
  /** 次の要求だけの応答の時間（先頭から 1 つずつ使う）。連続した変更の応答の順序を入れ替える検品に使う */
  latencyQueue: Partial<Record<Kind, number[]>>
  /** 結果（すべての要求） */
  outcome: Record<Kind, MockOutcome>
  /** 次の要求だけの結果（先頭から 1 つずつ使う） */
  outcomeQueue: Partial<Record<Kind, MockOutcome[]>>
  /** AbortSignal に従わず、中止の後も応答を返す */
  ignoreAbort: boolean
  /** サーバーが保持するロール（`${workspaceId}:${userId}`）。画面の権限とは別に変えられる */
  roles: Record<string, RoleId>
  /** 受け付けた要求（検品用）。値はパスワードを含めない */
  requests: { kind: Kind; scope: string; key?: string; value?: unknown }[]
  /** サーバーで実際に適用した変更（検品用） */
  applied: { scope: string; key: string; value: unknown }[]
}

const initialRoles = () => Object.fromEntries(memberships.map((m) => [`${m.workspaceId}:${m.userId}`, m.role]))

const initialConfig = (): ServerConfig => ({
  latency: { get: 250, instant: 500, form: 700, members: 300, invite: 600, action: 600 },
  latencyQueue: {},
  outcome: { get: "success", instant: "success", form: "success", members: "success", invite: "success", action: "success" },
  outcomeQueue: {},
  ignoreAbort: false,
  roles: initialRoles(),
  requests: [],
  applied: [],
})

// ---------------------------------------------------------------- データ
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

let personal: Record<UserId, PersonalRecord>
let orgs: Record<WorkspaceId, OrgRecord>
let invites: Record<WorkspaceId, Member[]>
/** 項目ごとの、受け付けた要求の番号と、適用した最新の番号 */
let received: Record<string, number>
let appliedSeq: Record<string, number>

function resetStore() {
  const profileOf = (id: UserId): Profile => ({
    name: users[id].name,
    title: id === "u-sato" ? "営業部 マネージャー" : "",
    bio: "",
  })
  personal = Object.fromEntries(
    (Object.keys(users) as UserId[]).map((id) => [
      id,
      {
        display: { ...displayDefaults, mfa: id === "u-sato" },
        profile: profileOf(id),
        google: { provider: "google", connected: id === "u-sato", account: id === "u-sato" ? users[id].email : null },
        passwordChangedOn: "2026-10-02",
        deletion: null,
      },
    ])
  ) as Record<UserId, PersonalRecord>
  orgs = {
    hq: {
      info: { name: orgSettings.hq.name, defaultLanguage: orgSettings.hq.defaultLanguage },
      security: { requireMfa: orgSettings.hq.requireMfa, allowSocialLogin: orgSettings.hq.allowSocialLogin, requireSso: orgSettings.hq.requireSso },
      plan: workspaces.hq.plan,
      history: [
        { id: "h-2", by: users["u-sato"].name, at: "2026-11-20 14:05", summary: "多要素認証を必須にしました" },
        { id: "h-1", by: users["u-sato"].name, at: "2026-10-01 09:30", summary: "組織を作成しました" },
      ],
      deletion: null,
    },
    west: {
      info: { name: orgSettings.west.name, defaultLanguage: orgSettings.west.defaultLanguage },
      security: { requireMfa: orgSettings.west.requireMfa, allowSocialLogin: orgSettings.west.allowSocialLogin, requireSso: orgSettings.west.requireSso },
      plan: workspaces.west.plan,
      history: [{ id: "h-1", by: "西日本営業部の管理者", at: "2026-09-12 11:00", summary: "組織の SSO を必須にしました" }],
      deletion: null,
    },
  }
  invites = { hq: [], west: [] }
  received = {}
  appliedSeq = {}
}
resetStore()

export const settingsServer: ServerConfig & {
  reset: () => void
  /** サーバーで保持するロールを変える（画面の権限には、製品が取り直すまで反映しない） */
  setRole: (workspaceId: WorkspaceId, userId: UserId, role: RoleId) => void
  /** 現在保存されている値（検品用） */
  personalOf: (userId: UserId) => PersonalRecord
  orgOf: (workspaceId: WorkspaceId) => OrgRecord
  /** ほかの端末や利用者が、サーバーの値を変えた場合を再現する（検品用） */
  setProfileElsewhere: (userId: UserId, profile: Profile) => void
} = Object.assign(initialConfig(), {
  reset() {
    Object.assign(settingsServer, initialConfig())
    resetStore()
  },
  setRole(workspaceId: WorkspaceId, userId: UserId, role: RoleId) {
    settingsServer.roles[`${workspaceId}:${userId}`] = role
  },
  personalOf: (userId: UserId) => clone(personal[userId]),
  orgOf: (workspaceId: WorkspaceId) => clone(orgs[workspaceId]),
  setProfileElsewhere: (userId: UserId, profile: Profile) => {
    personal[userId].profile = { ...profile }
  },
})

declare global {
  interface Window {
    __fdSaSettingsServer?: typeof settingsServer
  }
}
if (typeof window !== "undefined") window.__fdSaSettingsServer = settingsServer

// ---------------------------------------------------------------- 通信
function request<T>(kind: Kind, scope: string, signal: AbortSignal | undefined, run: () => T, log: { key?: string; value?: unknown } = {}): Promise<T> {
  settingsServer.requests.push({ kind, scope, ...log })
  const latency = settingsServer.latencyQueue[kind]?.shift() ?? settingsServer.latency[kind]
  const outcome = settingsServer.outcomeQueue[kind]?.shift() ?? settingsServer.outcome[kind]
  return mockRequest({ latency, outcome, signal, ignoreAbort: settingsServer.ignoreAbort, run, failMessage: "サーバーに接続できませんでした（模擬）" })
}

/** サーバーが保持するロールの権限 */
export function serverPermissions(workspaceId: WorkspaceId, userId: UserId): Permission[] {
  const role = settingsServer.roles[`${workspaceId}:${userId}`]
  return role ? [...roleDefs[role].permissions] : []
}

function authorize(workspaceId: WorkspaceId, userId: UserId, permission: Permission) {
  if (!serverPermissions(workspaceId, userId).includes(permission)) {
    throw new MockRequestError("この操作を行う権限がありません", "forbidden")
  }
}

/** 同じ項目への要求を受け付けた順に適用する。古い要求は適用せず、現在の値を返す */
function ordered<T>(itemKey: string, apply: () => void, read: () => T): () => T {
  const seq = (received[itemKey] = (received[itemKey] ?? 0) + 1)
  return () => {
    if (seq > (appliedSeq[itemKey] ?? 0)) {
      apply() // 権限がない、契約プランで使えないなどの場合は例外になり、適用しない
      appliedSeq[itemKey] = seq
    }
    return read()
  }
}

const today = "2026-11-26"
const nowLabel = () => {
  // 変更の履歴の時刻。基準の日付（model.ts の referenceNow と同じ日）に、実際の時刻を付ける（表示の例）
  const d = new Date()
  return `${today} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

let historySeq = 100

type Ctx = { signal?: AbortSignal }

export const settingsApi = {
  getPersonal(userId: UserId, { signal }: Ctx = {}) {
    return request("get", userId, signal, () => clone(personal[userId]), { key: "personal" })
  },
  saveDisplay<K extends InstantKey>(userId: UserId, key: K, value: DisplayValues[K], { signal }: Ctx = {}) {
    const run = ordered(
      `${userId}:${key}`,
      () => {
        personal[userId].display[key] = value
        settingsServer.applied.push({ scope: userId, key, value })
      },
      () => personal[userId].display[key]
    )
    return request("instant", userId, signal, run, { key, value })
  },
  saveDisplayBatch(userId: UserId, values: Partial<DisplayValues>, { signal }: Ctx = {}) {
    const runs = (Object.keys(values) as InstantKey[]).map((key) =>
      ordered(
        `${userId}:${key}`,
        () => {
          ;(personal[userId].display as Record<string, unknown>)[key] = values[key]
          settingsServer.applied.push({ scope: userId, key, value: values[key] })
        },
        () => personal[userId].display[key]
      )
    )
    return request(
      "form",
      userId,
      signal,
      () => {
        runs.forEach((r) => r())
        return clone(personal[userId].display)
      },
      { key: "display-reset", value: values }
    )
  },
  saveProfile(userId: UserId, profile: Profile, { signal }: Ctx = {}) {
    const run = ordered(
      `${userId}:profile`,
      () => {
        personal[userId].profile = { ...profile }
        settingsServer.applied.push({ scope: userId, key: "profile", value: profile })
      },
      () => clone(personal[userId].profile)
    )
    return request("form", userId, signal, run, { key: "profile", value: profile })
  },
  /** パスワードの変更（模擬）。入力されたパスワードは記録しない */
  changePassword(userId: UserId, current: string, next: string, demoPassword: string, { signal }: Ctx = {}) {
    return request(
      "action",
      userId,
      signal,
      () => {
        if (current !== demoPassword) throw new MockRequestError("現在のパスワードが正しくありません", "invalid-password")
        if (next.length < 12) throw new MockRequestError("新しいパスワードは 12 文字以上にしてください", "weak-password")
        personal[userId].passwordChangedOn = today
        return { changedOn: today }
      },
      { key: "password" }
    )
  },
  setGoogle(userId: UserId, workspaceId: WorkspaceId, connect: boolean, { signal }: Ctx = {}) {
    return request(
      "action",
      userId,
      signal,
      () => {
        if (connect && !orgs[workspaceId].security.allowSocialLogin) throw new MockRequestError("組織のポリシーで許可されていません", "forbidden")
        personal[userId].google = { provider: "google", connected: connect, account: connect ? users[userId].email : null }
        return clone(personal[userId].google)
      },
      { key: "google", value: connect }
    )
  },
  scheduleAccountDeletion(userId: UserId, password: string, demoPassword: string, schedule: boolean, { signal }: Ctx = {}) {
    return request(
      "action",
      userId,
      signal,
      () => {
        if (schedule && password !== demoPassword) throw new MockRequestError("パスワードが正しくありません", "invalid-password")
        personal[userId].deletion = schedule ? { scheduledOn: "2026-12-26" } : null
        return personal[userId].deletion
      },
      { key: "account-deletion", value: schedule }
    )
  },
  getOrg(workspaceId: WorkspaceId, { signal }: Ctx = {}) {
    return request("get", workspaceId, signal, () => clone(orgs[workspaceId]), { key: "org" })
  },
  saveOrgInfo(workspaceId: WorkspaceId, userId: UserId, info: OrgInfo, { signal }: Ctx = {}) {
    const run = ordered(
      `${workspaceId}:info`,
      () => {
        authorize(workspaceId, userId, "settings.org.edit")
        orgs[workspaceId].info = { ...info }
        orgs[workspaceId].history.unshift({ id: `h-${++historySeq}`, by: users[userId].name, at: nowLabel(), summary: "組織の情報を変更しました" })
        settingsServer.applied.push({ scope: workspaceId, key: "info", value: info })
      },
      () => ({ info: clone(orgs[workspaceId].info), history: clone(orgs[workspaceId].history) })
    )
    return request("form", `${workspaceId}:${userId}`, signal, run, { key: "info", value: info })
  },
  saveSecurity(workspaceId: WorkspaceId, userId: UserId, security: SecurityPolicy, { signal }: Ctx = {}) {
    const run = ordered(
      `${workspaceId}:security`,
      () => {
        authorize(workspaceId, userId, "settings.org.edit")
        if (security.requireSso && orgs[workspaceId].plan !== "business") throw new MockRequestError("この契約プランでは使えません", "plan")
        orgs[workspaceId].security = { ...security }
        orgs[workspaceId].history.unshift({ id: `h-${++historySeq}`, by: users[userId].name, at: nowLabel(), summary: "セキュリティのポリシーを変更しました" })
        settingsServer.applied.push({ scope: workspaceId, key: "security", value: security })
      },
      () => ({ security: clone(orgs[workspaceId].security), history: clone(orgs[workspaceId].history) })
    )
    return request("form", `${workspaceId}:${userId}`, signal, run, { key: "security", value: security })
  },
  scheduleWorkspaceDeletion(workspaceId: WorkspaceId, userId: UserId, schedule: boolean, { signal }: Ctx = {}) {
    return request(
      "action",
      `${workspaceId}:${userId}`,
      signal,
      () => {
        authorize(workspaceId, userId, "settings.org.edit")
        orgs[workspaceId].deletion = schedule ? { scheduledOn: "2026-12-26" } : null
        return orgs[workspaceId].deletion
      },
      { key: "workspace-deletion", value: schedule }
    )
  },
  listMembers(workspaceId: WorkspaceId, userId: UserId, { signal }: Ctx = {}) {
    return request(
      "members",
      `${workspaceId}:${userId}`,
      signal,
      () => {
        authorize(workspaceId, userId, "members.view")
        const active: Member[] = memberships
          .filter((m) => m.workspaceId === workspaceId)
          .map((m) => ({ userId: m.userId, name: users[m.userId].name, email: users[m.userId].email, role: settingsServer.roles[`${workspaceId}:${m.userId}`] ?? m.role, status: "active" }))
        return [...active, ...clone(invites[workspaceId])]
      },
      { key: "members" }
    )
  },
  invite(workspaceId: WorkspaceId, userId: UserId, email: string, role: RoleId, { signal }: Ctx = {}) {
    return request(
      "invite",
      `${workspaceId}:${userId}`,
      signal,
      () => {
        authorize(workspaceId, userId, "members.manage")
        const exists = [...memberships.filter((m) => m.workspaceId === workspaceId).map((m) => users[m.userId].email), ...invites[workspaceId].map((i) => i.email)]
        if (exists.includes(email)) throw new MockRequestError("このメールアドレスは、すでにメンバーか招待中です", "duplicate")
        const member: Member = { userId: `invite-${email}`, name: "", email, role, status: "invited" }
        invites[workspaceId].push(member)
        return member
      },
      { key: "invite", value: { email, role } }
    )
  },
}

export type SettingsApi = typeof settingsApi
export { isAbortError, membershipOf }
