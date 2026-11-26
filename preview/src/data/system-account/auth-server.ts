// Authentication のプレビュー用の模擬のサーバー。実際の認証、メール送信、セッションの管理は行わない。Registry には含めない。
// 認証情報の不一致、通信の失敗、試行回数の制限、認証のサービスの障害、コードの期限切れ、メールの送信の失敗、
// 保存の途中のセッション切れ（結果が不明）を再現し、Authentication の Pattern の挙動を確かめる。
// 検品からは window.__fdSaAuthServer で設定する（応答の時間、結果、ignoreAbort、受け付けた要求の記録、reset()）。
//
// 入力されたパスワードと確認コードは、比較にだけ使い、記録（requests）にも残さない。

import { MockRequestError, mockRequest, type MockOutcome } from "./mock"
import {
  demoPassword,
  demoVerificationCode,
  memberships,
  membershipOf,
  orgSettings,
  roles,
  users,
  workspaces,
  type Permission,
  type UserId,
  type WorkspaceId,
} from "./model"

export type AuthOrg = WorkspaceId
export type MfaMethod = "totp" | "sms" | "recovery-code"
export type SignInProvider = "google" | "microsoft" | "passkey" | "sso"

/** 要求の種類。応答の時間と結果を種類ごとに設定する */
export type AuthRequestKind =
  | "sign-in"
  | "provider"
  | "mfa"
  | "mfa-send"
  | "magic-link"
  | "sign-up"
  | "verification-send"
  | "verification-open"
  | "reset-request"
  | "reset-token"
  | "reset-password"
  | "refresh"
  | "permissions"
  | "save"
  | "load"

/**
 * 応答の結果
 * - success：成功
 * - network：要求が届かなかった（処理されていない）
 * - unknown：応答が届かなかった（サーバーでは処理された。保存では結果が不明になる）
 * - rate-limited：試行回数の制限（ログイン、確認コード）
 * - service-unavailable：認証のサービスの障害
 * - mail-failed：メールを送信できなかった（メールの送信を伴う要求）
 */
export type AuthServerMode = "success" | "network" | "unknown" | "rate-limited" | "service-unavailable" | "mail-failed"

export type MfaChallenge = {
  id: string
  /** 利用者が登録している方式。登録していない方式は画面に出さない */
  methods: MfaMethod[]
  /** 最初に使う方式 */
  method: MfaMethod
  /** SMS の送信先（末尾だけ） */
  smsDestination: string | null
  /** コードの桁数（表示の説明にだけ使う。入力欄は桁数を固定しない） */
  codeLength: number
  /** SMS の再送信までの待ち時間（ms）。送信しない方式では null */
  resendAfterMs: number | null
}

export type SignInResult = { kind: "authenticated"; userId: string } | { kind: "mfa-required"; challenge: MfaChallenge }

type Challenge = MfaChallenge & { userId: UserId; issuedAt: number; lastSentAt: number; attempts: number }

type SentEmail = { to: string; type: "verify" | "reset" | "magic-link" | "account-exists" }

type ServerConfig = {
  /** 応答までの時間（ms） */
  latency: Record<AuthRequestKind, number>
  /** 種類ごとの結果。指定のない種類は success */
  mode: Partial<Record<AuthRequestKind, AuthServerMode>>
  /** AbortSignal に従わず、中止された後も応答を返す（古い応答の破棄の検品） */
  ignoreAbort: boolean
  /** 確認コードの有効期限（ms） */
  codeTtlMs: number
  /** 確認コードの入力の上限 */
  maxCodeAttempts: number
  /** コードとメールの再送信までの待ち時間（ms） */
  resendCooldownMs: number
  /** 次の保存の途中でセッションを切る（応答は届かない。サーバーでは保存される） */
  expireDuringSave: boolean
  /** 再認証の後に、編集の権限を取り消す（権限の再検証の検品） */
  revokeEditOnReauth: boolean
  /** 受け付けた要求（検品用）。パスワードとコードは含めない */
  requests: { kind: AuthRequestKind; email?: string; userId?: string; method?: string; provider?: string }[]
  /** 実際に送信したメール（模擬）。送信に失敗した要求は含めない */
  sentEmails: SentEmail[]
}

const initialConfig = (): ServerConfig => ({
  latency: {
    "sign-in": 500,
    provider: 500,
    mfa: 400,
    "mfa-send": 400,
    "magic-link": 500,
    "sign-up": 600,
    "verification-send": 500,
    "verification-open": 300,
    "reset-request": 500,
    "reset-token": 300,
    "reset-password": 500,
    refresh: 300,
    permissions: 300,
    save: 700,
    load: 300,
  },
  mode: {},
  ignoreAbort: false,
  codeTtlMs: 5 * 60_000,
  maxCodeAttempts: 5,
  resendCooldownMs: 30_000,
  expireDuringSave: false,
  revokeEditOnReauth: false,
  requests: [],
  sentEmails: [],
})

// ---------------------------------------------------------------- サーバーの状態（メモリだけ）
let challenges = new Map<string, Challenge>()
let challengeSeq = 0
let sessionSeq = 0
let newUserSeq = 0
/** 新規登録の途中の利用者（メールの確認の前） */
let pendingSignUps = new Map<string, { userId: string; lastSentAt: number }>()
/** 使用済みのリカバリーコード */
let usedRecoveryCodes = new Set<string>()
/** セッションの例のメモ（顧客ごとの社内メモ）。利用者ごとに分ける */
let notes: Record<string, string> = {}
/** 有効なセッション */
let sessions = new Map<string, { userId: string }>()
/** 編集の権限を取り消した利用者 */
let revoked = new Set<string>()

function resetState() {
  challenges = new Map()
  challengeSeq = 0
  sessionSeq = 0
  newUserSeq = 0
  pendingSignUps = new Map()
  usedRecoveryCodes = new Set()
  notes = { "u-sato": "来月の更新の前に、担当者と打ち合わせる。", "u-suzuki": "", "u-tanaka": "" }
  sessions = new Map()
  revoked = new Set()
}
resetState()

export const authServer: ServerConfig & { reset: () => void } = Object.assign(initialConfig(), {
  reset() {
    Object.assign(authServer, initialConfig())
    resetState()
    mailVersion++
    for (const l of mailListeners) l()
  },
})

declare global {
  interface Window {
    __fdSaAuthServer?: typeof authServer
  }
}
if (typeof window !== "undefined") window.__fdSaAuthServer = authServer

// ---------------------------------------------------------------- 利用者の模擬のデータ
/** 利用者ごとに登録している多要素認証の方式。リカバリーコードを発行していない利用者には、その方式を出さない */
const mfaMethodsOf: Record<UserId, MfaMethod[]> = {
  "u-sato": ["totp", "sms", "recovery-code"],
  "u-suzuki": ["sms"],
  "u-tanaka": ["totp"],
}
const smsDestinationOf: Partial<Record<UserId, string>> = { "u-sato": "末尾 78", "u-suzuki": "末尾 12" }
/** 佐藤 花子のリカバリーコード（模擬）。画面に示す */
export const demoRecoveryCodes = ["7KQ2-M9XD", "P4WN-3ZTA"]
/** この端末に登録した Passkey の利用者（模擬） */
const passkeyUser: UserId = "u-sato"
/** 外部アカウント（Google、Microsoft）と組織の SSO で選んだ利用者（模擬） */
const externalUser: UserId = "u-sato"

/** 新規の利用者に設定する、パスワードの方針（製品の定義の例）。Registry は文字の種類の規則を持たない */
export const passwordMinLength = 12

/** 招待の例。招待されたメールアドレスは、招待のリンクで確認済みとして扱う */
export const demoInvitation = { email: "kenta.yamada@example.com", workspaceId: "hq" as WorkspaceId, inviterName: users["u-sato"].name }

// 模擬の受信箱（MockMailbox）に、送信したメールの変化を知らせる。
const mailListeners = new Set<() => void>()
let mailVersion = 0
function sendMail(mail: SentEmail) {
  authServer.sentEmails.push(mail)
  mailVersion++
  for (const l of mailListeners) l()
}
export const subscribeMail = (listener: () => void) => {
  mailListeners.add(listener)
  return () => {
    mailListeners.delete(listener)
  }
}
export const getMailVersion = () => mailVersion
export type { SentEmail }

const findUser = (email: string) => Object.values(users).find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null
const record = (entry: ServerConfig["requests"][number]) => authServer.requests.push(entry)
const modeOf = (kind: AuthRequestKind): AuthServerMode => authServer.mode[kind] ?? "success"

const errorMessages: Record<string, string> = {
  network: "サーバーに接続できませんでした（模擬）",
  "rate-limited": "試行回数の上限に達しました（模擬）",
  "service-unavailable": "認証のサービスが応答しません（模擬）",
  "mail-failed": "メールを送信できませんでした（模擬）",
}

/**
 * 模擬の要求。mode に応じて失敗させる。run の中で MockRequestError を投げると、その失敗になる。
 * network、rate-limited、service-unavailable、mail-failed は run を実行しない（処理されない）。
 */
function request<T>(kind: AuthRequestKind, signal: AbortSignal | undefined, run: () => T): Promise<T> {
  const mode = modeOf(kind)
  const failed = mode !== "success" && mode !== "unknown"
  const outcome: MockOutcome = failed ? "fail" : mode === "unknown" ? "unknown" : "success"
  return mockRequest({
    latency: authServer.latency[kind],
    outcome,
    signal,
    ignoreAbort: authServer.ignoreAbort,
    run,
    failMessage: failed ? errorMessages[mode] : undefined,
    failCode: failed ? mode : undefined,
  })
}

function issueChallenge(userId: UserId): MfaChallenge {
  const id = `mfa-${++challengeSeq}`
  const methods = mfaMethodsOf[userId]
  const now = Date.now()
  const challenge: Challenge = {
    id,
    userId,
    methods,
    method: methods[0],
    smsDestination: smsDestinationOf[userId] ?? null,
    codeLength: demoVerificationCode.length,
    resendAfterMs: methods[0] === "sms" ? authServer.resendCooldownMs : null,
    issuedAt: now,
    lastSentAt: now,
    attempts: 0,
  }
  challenges.set(id, challenge)
  const { userId: _u, issuedAt: _i, lastSentAt: _l, attempts: _a, ...publicChallenge } = challenge
  return publicChallenge
}

function afterFirstFactor(org: AuthOrg, userId: UserId, factorSatisfiesMfa: boolean): SignInResult {
  if (orgSettings[org].requireMfa && !factorSatisfiesMfa) return { kind: "mfa-required", challenge: issueChallenge(userId) }
  return { kind: "authenticated", userId }
}

// ---------------------------------------------------------------- 製品の判定（復帰先）
/** ログインの後の既定の画面 */
export function homePathOf(userId: string) {
  const first = memberships.find((m) => m.userId === userId)
  return `/w/${first?.workspaceId ?? "hq"}/home`
}

/** 利用者の権限（ワークスペースごと） */
export function permissionsOf(userId: string, workspaceId: WorkspaceId): Permission[] {
  const m = membershipOf(userId as UserId, workspaceId)
  if (!m) return []
  const list = roles[m.role].permissions
  return revoked.has(userId) ? list.filter((p) => p !== "customers.edit" && p !== "customers.delete") : list
}

/**
 * 復帰先の画面を、この利用者が開いてよいか（製品の判定の例）。所属していないワークスペース、権限のない画面、
 * 存在しない画面は false。resolveReturnTo の isAllowed に渡す。
 */
export function canOpenPath(userId: string, path: string) {
  const pathname = path.split(/[?#]/)[0]
  const match = /^\/w\/([^/]+)(\/.*)?$/.exec(pathname)
  if (!match) return false
  const workspaceId = match[1] as WorkspaceId
  if (!(workspaceId in workspaces)) return false
  const permissions = permissionsOf(userId, workspaceId)
  if (permissions.length === 0) return false
  const rest = match[2] ?? "/home"
  const rules: [RegExp, Permission | null][] = [
    [/^\/home$/, null],
    [/^\/customers(\/[A-Z]-\d{5})?$/, "customers.view"],
    [/^\/settings\/members$/, "members.manage"],
    [/^\/settings\/billing$/, "billing.manage"],
  ]
  const rule = rules.find(([re]) => re.test(rest))
  if (!rule) return false
  return rule[1] === null || permissions.includes(rule[1])
}

// ---------------------------------------------------------------- API
type Opts = { signal?: AbortSignal }

export const authApi = {
  /** メールアドレスとパスワード。アカウントが存在しない場合も、パスワードの不一致と同じ応答にする */
  signInWithPassword({ org, email, password }: { org: AuthOrg; email: string; password: string }, { signal }: Opts = {}) {
    record({ kind: "sign-in", email })
    return request("sign-in", signal, (): SignInResult => {
      const user = findUser(email)
      if (orgSettings[org].requireSso) throw new MockRequestError("この組織は SSO でログインします（模擬）", "sso-required")
      if (!user || password !== demoPassword || !membershipOf(user.id, org)) {
        throw new MockRequestError("認証情報が一致しません（模擬）", "invalid-credentials")
      }
      return afterFirstFactor(org, user.id, false)
    })
  },

  /** 外部アカウント、Passkey、組織の SSO（模擬。実際のプロバイダーの画面は開かない） */
  signInWithProvider({ org, provider }: { org: AuthOrg; provider: SignInProvider }, { signal }: Opts = {}) {
    record({ kind: "provider", provider })
    return request("provider", signal, (): SignInResult => {
      const policy = orgSettings[org]
      if ((provider === "google" || provider === "microsoft") && !policy.allowSocialLogin) {
        throw new MockRequestError("この組織では外部アカウントを使えません（模擬）", "provider-not-allowed")
      }
      if (policy.requireSso && provider !== "sso") throw new MockRequestError("この組織は SSO でログインします（模擬）", "sso-required")
      const userId = provider === "passkey" ? passkeyUser : externalUser
      if (!membershipOf(userId, org)) throw new MockRequestError("認証情報が一致しません（模擬）", "invalid-credentials")
      // Passkey は端末の所持と生体認証などを確かめるため、追加の確認を求めない（製品の判断の例）。
      // 組織の SSO では、多要素認証を組織の認証基盤が行う。
      return afterFirstFactor(org, userId, provider === "passkey" || provider === "sso")
    })
  },

  /** 確認コードの検証。桁数ではなく、文字列として比べる（先頭の 0 を含む） */
  verifyMfa({ challengeId, method, code }: { challengeId: string; method: MfaMethod; code: string }, { signal }: Opts = {}) {
    record({ kind: "mfa", method })
    return request("mfa", signal, (): SignInResult => {
      const c = challenges.get(challengeId)
      if (!c) throw new MockRequestError("確認の有効期限が切れました（模擬）", "challenge-expired")
      if (c.attempts >= authServer.maxCodeAttempts) throw new MockRequestError("入力の上限に達しました（模擬）", "rate-limited")
      if (!c.methods.includes(method)) throw new MockRequestError("この方式は使えません（模擬）", "method-unavailable")
      if (method === "recovery-code") {
        const normalized = code.toUpperCase()
        const valid = c.userId === "u-sato" && demoRecoveryCodes.some((r) => r.replace("-", "") === normalized) && !usedRecoveryCodes.has(normalized)
        if (!valid) {
          c.attempts++
          throw Object.assign(new MockRequestError("リカバリーコードが一致しません（模擬）", "invalid-code"), {
            attemptsLeft: authServer.maxCodeAttempts - c.attempts,
          })
        }
        usedRecoveryCodes.add(normalized)
      } else {
        if (Date.now() - c.issuedAt > authServer.codeTtlMs) throw new MockRequestError("コードの有効期限が切れました（模擬）", "code-expired")
        if (code !== demoVerificationCode) {
          c.attempts++
          throw Object.assign(new MockRequestError("コードが一致しません（模擬）", "invalid-code"), {
            attemptsLeft: authServer.maxCodeAttempts - c.attempts,
          })
        }
      }
      challenges.delete(challengeId)
      return { kind: "authenticated", userId: c.userId }
    })
  },

  /** SMS のコードを送る（方式を SMS に切り替えたとき、再送信するとき）。送信の間隔を制限する */
  sendMfaCode({ challengeId, method }: { challengeId: string; method: MfaMethod }, { signal }: Opts = {}) {
    record({ kind: "mfa-send", method })
    return request("mfa-send", signal, () => {
      const c = challenges.get(challengeId)
      if (!c) throw new MockRequestError("確認の有効期限が切れました（模擬）", "challenge-expired")
      if (method !== "sms") throw new MockRequestError("この方式は送信しません（模擬）", "method-unavailable")
      const now = Date.now()
      const wait = c.lastSentAt + authServer.resendCooldownMs - now
      if (c.method === "sms" && wait > 0) throw Object.assign(new MockRequestError("再送信の間隔が短すぎます（模擬）", "too-soon"), { retryAfterMs: wait })
      c.method = "sms"
      c.issuedAt = now
      c.lastSentAt = now
      return { retryAfterMs: authServer.resendCooldownMs }
    })
  },

  /** 方式を切り替える（送信を伴わない方式：認証アプリ、リカバリーコード） */
  selectMfaMethod({ challengeId, method }: { challengeId: string; method: MfaMethod }) {
    const c = challenges.get(challengeId)
    if (c && c.methods.includes(method) && method !== "sms") {
      c.method = method
      c.issuedAt = Date.now()
    }
  },

  /** ログイン用のリンク（Magic Link）。アカウントの有無を応答で区別しない */
  sendMagicLink({ email }: { email: string }, { signal }: Opts = {}) {
    record({ kind: "magic-link", email })
    return request("magic-link", signal, () => {
      if (findUser(email)) sendMail({ to: email.trim(), type: "magic-link" })
      return { ok: true as const }
    })
  },

  /** メールのログイン用のリンクを開いた（模擬） */
  openMagicLink({ email }: { email: string }, { signal }: Opts = {}) {
    record({ kind: "verification-open", email })
    return request("verification-open", signal, (): SignInResult => {
      const sent = authServer.sentEmails.some((m) => m.type === "magic-link" && m.to.toLowerCase() === email.trim().toLowerCase())
      const user = findUser(email)
      if (!sent || !user) throw new MockRequestError("リンクが無効です（模擬）", "invalid-link")
      return { kind: "authenticated", userId: user.id }
    })
  },

  /**
   * 新規登録。登録済みのメールアドレスでも、同じ応答にする（登録済みであることは、その宛先へのメールで知らせる）。
   * 確認メールを送信できなかった場合は emailSent: false を返す（送信済みと表示しない）。
   */
  signUp(
    { email, invited }: { email: string; password: string; marketing: boolean; invited: boolean },
    { signal }: Opts = {}
  ): Promise<{ kind: "verification-pending"; emailSent: boolean } | { kind: "authenticated"; userId: string }> {
    record({ kind: "sign-up", email })
    const mailFails = modeOf("sign-up") === "mail-failed"
    return mockRequest({
      latency: authServer.latency["sign-up"],
      outcome: modeOf("sign-up") === "network" ? "fail" : modeOf("sign-up") === "unknown" ? "unknown" : "success",
      signal,
      ignoreAbort: authServer.ignoreAbort,
      failMessage: errorMessages.network,
      failCode: "network",
      run: () => {
        const to = email.trim()
        // 招待のリンクから登録した場合は、招待したメールアドレスを確認済みとして扱う
        if (invited && to.toLowerCase() === demoInvitation.email) {
          return { kind: "authenticated" as const, userId: `u-new-${++newUserSeq}` }
        }
        const existing = findUser(to)
        if (!pendingSignUps.has(to.toLowerCase()) && !existing) pendingSignUps.set(to.toLowerCase(), { userId: `u-new-${++newUserSeq}`, lastSentAt: 0 })
        if (mailFails) return { kind: "verification-pending" as const, emailSent: false }
        sendMail({ to, type: existing ? "account-exists" : "verify" })
        const p = pendingSignUps.get(to.toLowerCase())
        if (p) p.lastSentAt = Date.now()
        return { kind: "verification-pending" as const, emailSent: true }
      },
    })
  },

  /** 確認メールの再送信、またはメールアドレスの変更後の送信 */
  sendVerification({ email, previousEmail }: { email: string; previousEmail?: string }, { signal }: Opts = {}) {
    record({ kind: "verification-send", email })
    return request("verification-send", signal, () => {
      const to = email.trim()
      const key = to.toLowerCase()
      if (previousEmail && previousEmail.toLowerCase() !== key) {
        const prev = pendingSignUps.get(previousEmail.toLowerCase())
        pendingSignUps.delete(previousEmail.toLowerCase())
        if (!findUser(to)) pendingSignUps.set(key, { userId: prev?.userId ?? `u-new-${++newUserSeq}`, lastSentAt: 0 })
      }
      const p = pendingSignUps.get(key)
      const now = Date.now()
      if (p && p.lastSentAt && now - p.lastSentAt < authServer.resendCooldownMs) {
        throw Object.assign(new MockRequestError("再送信の間隔が短すぎます（模擬）", "too-soon"), {
          retryAfterMs: p.lastSentAt + authServer.resendCooldownMs - now,
        })
      }
      sendMail({ to, type: findUser(to) ? "account-exists" : "verify" })
      if (p) p.lastSentAt = now
      return { retryAfterMs: authServer.resendCooldownMs }
    })
  },

  /** 確認メールのリンクを開いた（模擬）。送信していないアドレスのリンクは無効 */
  openVerificationLink({ email }: { email: string }, { signal }: Opts = {}) {
    record({ kind: "verification-open", email })
    return request("verification-open", signal, (): SignInResult => {
      const key = email.trim().toLowerCase()
      const sent = authServer.sentEmails.some((m) => m.type === "verify" && m.to.toLowerCase() === key)
      const p = pendingSignUps.get(key)
      if (!sent || !p) throw new MockRequestError("リンクが無効です（模擬）", "invalid-link")
      pendingSignUps.delete(key)
      return { kind: "authenticated", userId: p.userId }
    })
  },

  /** パスワードの再設定の申請。アカウントの有無を応答で区別しない（登録されている場合だけ送信する） */
  requestPasswordReset({ email }: { email: string }, { signal }: Opts = {}) {
    record({ kind: "reset-request", email })
    return request("reset-request", signal, () => {
      if (findUser(email)) sendMail({ to: email.trim(), type: "reset" })
      return { ok: true as const }
    })
  },

  /** 再設定のリンクの確認（模擬のトークン：valid、expired、used） */
  checkResetToken({ token }: { token: string }, { signal }: Opts = {}) {
    record({ kind: "reset-token" })
    return request("reset-token", signal, () => {
      if (token === "expired") return { status: "expired" as const }
      if (token !== "valid") return { status: "invalid" as const }
      return { status: "valid" as const, email: users["u-sato"].email }
    })
  },

  /** 新しいパスワードの設定。方針（文字数）はサーバーでも確かめる */
  resetPassword({ token, password }: { token: string; password: string }, { signal }: Opts = {}) {
    record({ kind: "reset-password" })
    return request("reset-password", signal, () => {
      if (token !== "valid") throw new MockRequestError("リンクの有効期限が切れました（模擬）", "invalid-link")
      if (password.length < passwordMinLength) throw new MockRequestError("パスワードが短すぎます（模擬）", "weak-password")
      return { email: users["u-sato"].email }
    })
  },

  // ---------------------------------------------------------------- セッション（セッション切れの例）
  /** ログインの完了。新しいセッションを発行する */
  startSession(userId: string, { reauthenticated = false }: { reauthenticated?: boolean } = {}) {
    const id = `s-${++sessionSeq}`
    sessions.set(id, { userId })
    if (reauthenticated && authServer.revokeEditOnReauth) revoked.add(userId)
    return id
  },
  /** セッションを切る（模擬：有効期限） */
  expireSession(sessionId: string) {
    sessions.delete(sessionId)
  },
  isSessionValid(sessionId: string) {
    return sessions.has(sessionId)
  },
  /** 利用者に意識させない自動の更新。mode が success なら新しいセッションを返す */
  refreshSession({ sessionId, userId }: { sessionId: string; userId: string }, { signal }: Opts = {}) {
    record({ kind: "refresh", userId })
    return request("refresh", signal, () => {
      sessions.delete(sessionId)
      const id = `s-${++sessionSeq}`
      sessions.set(id, { userId })
      return { sessionId: id }
    })
  },
  /** 再認証の後の権限の取得し直し */
  fetchPermissions({ userId, workspaceId }: { userId: string; workspaceId: WorkspaceId }, { signal }: Opts = {}) {
    record({ kind: "permissions", userId })
    return request("permissions", signal, () => permissionsOf(userId, workspaceId))
  },
  /** 社内メモの保存。expireDuringSave のときは、保存した後にセッションを切り、応答を返さない（結果が不明） */
  saveNote({ sessionId, text }: { sessionId: string; text: string }, { signal }: Opts = {}) {
    const session = sessions.get(sessionId)
    record({ kind: "save", userId: session?.userId })
    const expire = authServer.expireDuringSave
    authServer.expireDuringSave = false
    return mockRequest({
      latency: authServer.latency.save,
      outcome: expire ? "unknown" : modeOf("save") === "success" ? "success" : modeOf("save") === "unknown" ? "unknown" : "fail",
      signal,
      ignoreAbort: authServer.ignoreAbort,
      failMessage: errorMessages.network,
      failCode: "network",
      run: () => {
        const s = sessions.get(sessionId)
        if (!s) throw new MockRequestError("セッションの有効期限が切れています（模擬）", "session-expired")
        notes[s.userId] = text
        if (expire) sessions.delete(sessionId)
        return { text }
      },
    })
  },
  /** 社内メモの取得（保存の結果を確かめる） */
  loadNote({ userId }: { userId: string }, { signal }: Opts = {}) {
    record({ kind: "load", userId })
    return request("load", signal, () => notes[userId] ?? "")
  },
}

export type AuthApi = typeof authApi
