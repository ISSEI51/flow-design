// Settings のプレビュー用の模擬のサーバー。実際の API、認証、認可、データベースは使わない。Registry には含めない。
// 応答の時間、結果（success / fail / unknown）、AbortSignal を無視する応答、権限の変更を再現し、Patterns の挙動を確かめる。
// 検品は window.__fdSaSettingsServer で設定する（応答の時間、結果、ignoreAbort、受け付けた要求の記録、reset()）。
// 応答の保留と解放（Deferred）：hold[kind] を true にすると、その種類の要求をサーバーで処理せずに保留し、release で処理して応答する。
// 保留中にクライアントが待機を中止しても（AbortSignal）、要求はサーバーに届いているものとして、release の時点で処理する。
// release に respond: false を渡すと、サーバーで処理し、応答だけを次の release まで保留する（サーバーでの処理の順序と、
// クライアントに応答が届く順序を別々に決める検品に使う。例：処理の後、応答が届く前に、別の経路で取得し直す）。
//
// サーバーの規則（製品の API の責務の例）。contract で切り替える
// - ordered（既定）：同じ項目への要求は、受け付けた順に適用する。後から処理した古い要求は、新しい値を上書きしない（受付の番号の比較）。
// - unordered：処理した順に適用する（順序を保証しないサーバーの再現。古い要求が後で処理されると、古い値が残る）。
// - versioned：ordered に加えて、ifMatch（版の番号）を渡された要求は、現在の版と一致しない場合に拒否する（code: "conflict"）。
// - 応答には、適用した後に保存されている値を返す。プロフィールの文字列は前後の空白を除いて保存する（サーバーでの正規化）。
// - 組織の設定の変更は、サーバーで保持するロール（roles）で判断する。画面に示した権限ではなく、サーバーの判断が最終的なもの。

import { isAbortError, mockRequest, MockRequestError, MockUnknownError, type MockOutcome } from "./mock"
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
  /** 表示の設定の項目ごとの版（getPersonal の応答だけに含める） */
  displayVersions?: Record<InstantKey, number>
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

/** サーバーの保存の順序の規則（製品の API の契約の例） */
export type SaveContract = "ordered" | "unordered" | "versioned"

/** 保留した要求の解放の結果。client-abort：サーバーでは処理し、クライアントには AbortError を返す（待機の中止の再現） */
export type ReleaseOutcome = MockOutcome | "client-abort"

type Held = {
  seq: number
  kind: Kind
  key?: string
  value?: unknown
  /** サーバーで処理した（応答だけを保留している） */
  processed: boolean
  /** サーバーで処理する（まだなら）。respond が false なら応答を保留する */
  settle: (outcome?: ReleaseOutcome, respond?: boolean) => void
}

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
  /** true の種類の要求を、release まで保留する（Deferred。サーバーでの処理も release の時点） */
  hold: Partial<Record<Kind, boolean>>
  /** 保存の順序の規則 */
  contract: SaveContract
  /** 一括の保存（saveDisplayBatch）で、サーバーのバリデーションで拒否する項目（部分的な失敗の再現） */
  batchReject: InstantKey[]
  /** 保存の応答から除く項目（応答に保存した項目の値が含まれない場合の再現） */
  omitResponseKeys: InstantKey[]
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
  hold: {},
  contract: "ordered",
  batchReject: [],
  omitResponseKeys: [],
  roles: initialRoles(),
  requests: [],
  applied: [],
})

// ---------------------------------------------------------------- データ
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

let personal: Record<UserId, PersonalRecord>
let orgs: Record<WorkspaceId, OrgRecord>
let invites: Record<WorkspaceId, Member[]>
/** 項目ごとの、受け付けた要求の番号と、適用した最新の番号と、版の番号 */
let received: Record<string, number>
let appliedSeq: Record<string, number>
let versions: Record<string, number>
/** 保留している要求（古い順） */
let held: Held[] = []
let heldSeq = 0

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
  versions = {}
  held = []
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
  /** ほかの端末で表示の設定を変えた場合を再現する（版も進める） */
  setDisplayElsewhere: <K extends InstantKey>(userId: UserId, key: K, value: DisplayValues[K]) => void
  /** ほかの管理者がセキュリティのポリシーを変えた場合を再現する */
  setSecurityElsewhere: (workspaceId: WorkspaceId, patch: Partial<SecurityPolicy>) => void
  /** 項目の現在の版（検品用） */
  versionOf: (itemKey: string) => number
  /** 保留している要求（古い順） */
  heldRequests: () => { seq: number; kind: Kind; key?: string; value?: unknown; processed: boolean }[]
  /**
   * 保留している要求を処理して応答する。which：first（最も古い）、last（最も新しい）、all、または seq。
   * outcome を渡すと、その結果にする（fail：処理しない、unknown：処理して結果が不明を返す、client-abort：処理して AbortError を返す）。
   * respond: false を渡すと、サーバーで処理するが応答を返さない（次の release で、処理した時点の結果を返す。outcome はその時点で決まる）
   */
  release: (kind: Kind, options?: { which?: "first" | "last" | "all" | number; outcome?: ReleaseOutcome; respond?: boolean }) => number
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
  setDisplayElsewhere<K extends InstantKey>(userId: UserId, key: K, value: DisplayValues[K]) {
    personal[userId].display[key] = value
    const itemKey = `${userId}:${key}`
    versions[itemKey] = (versions[itemKey] ?? 0) + 1
  },
  setSecurityElsewhere(workspaceId: WorkspaceId, patch: Partial<SecurityPolicy>) {
    orgs[workspaceId].security = { ...orgs[workspaceId].security, ...patch }
  },
  versionOf: (itemKey: string) => versions[itemKey] ?? 0,
  heldRequests: () => held.map((h) => ({ seq: h.seq, kind: h.kind, key: h.key, value: h.value, processed: h.processed })),
  release(
    kind: Kind,
    { which = "first", outcome, respond = true }: { which?: "first" | "last" | "all" | number; outcome?: ReleaseOutcome; respond?: boolean } = {}
  ) {
    // respond: false は、まだ処理していない要求だけを対象にする
    const targets = held.filter((h) => h.kind === kind && (respond || !h.processed))
    const chosen =
      typeof which === "number" ? targets.filter((h) => h.seq === which) : which === "all" ? targets : which === "last" ? targets.slice(-1) : targets.slice(0, 1)
    if (respond) held = held.filter((h) => !chosen.includes(h))
    chosen.forEach((h) => h.settle(outcome, respond))
    return chosen.length
  },
})

declare global {
  interface Window {
    __fdSaSettingsServer?: typeof settingsServer
  }
}
if (typeof window !== "undefined") window.__fdSaSettingsServer = settingsServer

// ---------------------------------------------------------------- 通信
const failMessage = "サーバーに接続できませんでした（模擬）"

function request<T>(kind: Kind, scope: string, signal: AbortSignal | undefined, run: () => T, log: { key?: string; value?: unknown } = {}): Promise<T> {
  settingsServer.requests.push({ kind, scope, ...log })
  const latency = settingsServer.latencyQueue[kind]?.shift() ?? settingsServer.latency[kind]
  const outcome = settingsServer.outcomeQueue[kind]?.shift() ?? settingsServer.outcome[kind]
  if (!settingsServer.hold[kind]) return mockRequest({ latency, outcome, signal, ignoreAbort: settingsServer.ignoreAbort, run, failMessage })
  // 保留：release の時点でサーバーが処理する。クライアントが待機を中止しても、処理は行う（要求はサーバーに届いている）
  return new Promise<T>((resolve, reject) => {
    let answered = false
    let final: ReleaseOutcome = outcome
    let value: T | undefined
    let error: unknown = null
    const entry: Held = {
      seq: ++heldSeq,
      kind,
      key: log.key,
      value: log.value,
      processed: false,
      settle: (released, respond = true) => {
        // サーバーでの処理は 1 回だけ（respond: false で処理した要求は、応答の時点で処理し直さない）
        if (!entry.processed) {
          entry.processed = true
          final = released ?? outcome
          if (final !== "fail") {
            try {
              value = run()
            } catch (e) {
              error = e
            }
          }
        }
        if (!respond || answered) return
        answered = true
        if (final === "client-abort") reject(new DOMException("aborted", "AbortError"))
        else if (error) reject(error)
        else if (final === "fail") reject(new MockRequestError(failMessage))
        else if (final === "unknown") reject(new MockUnknownError())
        else resolve(value as T)
      },
    }
    held.push(entry)
    if (signal && !settingsServer.ignoreAbort) {
      const onAbort = () => {
        if (answered) return
        answered = true
        reject(new DOMException("aborted", "AbortError"))
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener("abort", onAbort, { once: true })
    }
  })
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

/**
 * 同じ項目への要求を、contract の規則で適用する。ordered と versioned は受け付けた順（古い要求は適用せず、現在の値を返す）、
 * unordered は処理した順。versioned で ifMatch を渡された場合は、現在の版と一致しなければ拒否する
 */
function ordered<T>(itemKey: string, apply: () => void, read: () => T, ifMatch?: number): () => T {
  const seq = (received[itemKey] = (received[itemKey] ?? 0) + 1)
  return () => {
    const contract = settingsServer.contract
    if (contract === "versioned" && ifMatch !== undefined && ifMatch !== (versions[itemKey] ?? 0)) {
      throw new MockRequestError("ほかの場所で変更されています", "conflict")
    }
    if (contract === "unordered" || seq > (appliedSeq[itemKey] ?? 0)) {
      apply() // 権限がない、契約プランで使えないなどの場合は例外になり、適用しない
      appliedSeq[itemKey] = Math.max(seq, appliedSeq[itemKey] ?? 0)
      versions[itemKey] = (versions[itemKey] ?? 0) + 1
    }
    return read()
  }
}

const displayVersionsOf = (userId: UserId) =>
  Object.fromEntries((Object.keys(displayDefaults) as InstantKey[]).map((k) => [k, versions[`${userId}:${k}`] ?? 0])) as Record<InstantKey, number>
const trimProfile = (p: Profile): Profile => ({ name: p.name.trim(), title: p.title.trim(), bio: p.bio.trim() })

const today = "2026-11-26"
const nowLabel = () => {
  // 変更の履歴の時刻。基準の日付（model.ts の referenceNow と同じ日）に、実際の時刻を付ける（表示の例）
  const d = new Date()
  return `${today} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

let historySeq = 100

type Ctx = { signal?: AbortSignal }
type VersionedCtx = Ctx & { ifMatch?: number }

export const settingsApi = {
  getPersonal(userId: UserId, { signal }: Ctx = {}) {
    return request("get", userId, signal, () => ({ ...clone(personal[userId]), displayVersions: displayVersionsOf(userId) }), { key: "personal" })
  },
  /** 現在の保存の規則（模擬のサーバーの contract）。画面は、版の照合を使うかをこれで決める */
  saveContract: (): SaveContract => settingsServer.contract,
  /** 表示の設定の 1 項目の保存。応答は保存されている値（omitResponseKeys の項目は undefined） */
  saveDisplay<K extends InstantKey>(userId: UserId, key: K, value: DisplayValues[K], { signal, ifMatch }: VersionedCtx = {}) {
    return settingsApi.saveDisplayVersioned(userId, key, value, { signal, ifMatch }).then((r) => r.value)
  },
  /** 表示の設定の 1 項目の保存。保存されている値と版を返す */
  saveDisplayVersioned<K extends InstantKey>(userId: UserId, key: K, value: DisplayValues[K], { signal, ifMatch }: VersionedCtx = {}) {
    const itemKey = `${userId}:${key}`
    const run = ordered(
      itemKey,
      () => {
        personal[userId].display[key] = value
        settingsServer.applied.push({ scope: userId, key, value })
      },
      () => ({
        value: settingsServer.omitResponseKeys.includes(key) ? (undefined as unknown as DisplayValues[K]) : personal[userId].display[key],
        version: versions[itemKey] ?? 0,
      }),
      ifMatch
    )
    return request("instant", userId, signal, run, { key, value })
  },
  /**
   * 表示の設定の複数の項目の保存（標準の設定へ戻す）。項目ごとに適用し、batchReject の項目と版の不一致の項目は適用せずに
   * rejected で返す（部分的な成功）。values は保存されている値（omitResponseKeys の項目を除く）、versions は版
   */
  saveDisplayBatch(userId: UserId, values: Partial<DisplayValues>, { signal, ifMatch = {} }: Ctx & { ifMatch?: Partial<Record<InstantKey, number>> } = {}) {
    const keys = Object.keys(values) as InstantKey[]
    const runs = keys.map((key) => {
      const run = ordered(
        `${userId}:${key}`,
        () => {
          if (settingsServer.batchReject.includes(key)) throw new MockRequestError("この値は保存できません（模擬）", "invalid")
          ;(personal[userId].display as Record<string, unknown>)[key] = values[key]
          settingsServer.applied.push({ scope: userId, key, value: values[key] })
        },
        () => undefined,
        ifMatch[key]
      )
      return [key, run] as const
    })
    return request(
      "form",
      userId,
      signal,
      () => {
        const rejected: Partial<Record<InstantKey, { code: string; message: string }>> = {}
        for (const [key, run] of runs) {
          try {
            run()
          } catch (e) {
            const err = e as MockRequestError
            rejected[key] = { code: err.code, message: err.message }
          }
        }
        const display = clone(personal[userId].display) as Partial<DisplayValues>
        for (const k of settingsServer.omitResponseKeys) delete display[k]
        return { values: display, versions: displayVersionsOf(userId), rejected }
      },
      { key: "display-reset", value: values }
    )
  },
  saveProfile(userId: UserId, profile: Profile, { signal }: Ctx = {}) {
    const run = ordered(
      `${userId}:profile`,
      () => {
        // サーバーでの正規化：前後の空白を除いて保存する
        personal[userId].profile = trimProfile(profile)
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
