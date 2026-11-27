// Permission States のプレビューの模擬のサーバー。実際の認可は行わない。Registry には含めない。
// 実際の製品と同じく、操作を受け付けた時点（応答の直前）の権限で認可を判断し、閲覧できないデータを応答に含めない。
// 検品から window.__fdSaPermissionServer で設定する（応答の時間、結果、ignoreAbort、受け付けた要求の記録、reset()）。
// 応答の順序を検品で制御する場合は、hold で種類ごとに要求を保留し、release で解放する（固定の応答時間に依存しない）。
// 保留した要求は、解放した時点でサーバーの処理（認可を含む）を行う。
// このファイルは相対パスだけを import する（ブラウザを使わない検品から読み込むため）。

import { mockRequest, MockRequestError, MockUnknownError, type MockOutcome } from "./mock"
import {
  memberships as seedMemberships,
  permissionLabels,
  plans,
  roles,
  users,
  workspaces,
  type Feature,
  type Membership,
  type Permission,
  type RoleId,
  type UserId,
  type WorkspaceId,
} from "./model"
import { requestablePermissions, scopeKeyOf, seedPermissionCustomers, type PermissionCustomer, type PermissionScope } from "./permission-data"

export type PermissionServerKind = "access" | "page" | "overview" | "record" | "save" | "request" | "requests" | "members" | "role" | "operation"

export type AccessResponse = {
  scope: string
  role: RoleId
  permissions: Permission[]
  features: Feature[]
  /** 権限の版。変更のたびに増える */
  revision: number
  /** この応答を返した要求の番号（log の位置。古い応答を反映しないことの検品用） */
  requestId: number
}

export type PermissionRequestRecord = {
  id: string
  scope: string
  permission: Permission
  status: "pending" | "approved" | "rejected"
}

export type PageResponse = { status: 200; title: string; body: string } | { status: 401 | 403 | 404 }

export type OverviewResponse = {
  /** 閲覧できる顧客だけの件数（閲覧できない顧客を含めない） */
  customerCount: number
  customers: { id: string; company: string }[]
  /** members.view がない利用者には送らない */
  members?: { userId: UserId; name: string; role: RoleId }[]
  /** billing.manage がない利用者には送らない */
  billing?: { plan: string; seats: number }
}

export type RecordResponse = Pick<PermissionCustomer, "id" | "company" | "owner" | "region" | "industry" | "phone" | "email" | "note" | "version">

type Config = {
  /** 応答までの時間（ms） */
  latency: Record<PermissionServerKind, number>
  /** 権限の取得の時間を、スコープ（`${userId}:${workspaceId}`）ごとに変える（A → B → A の検品） */
  accessLatencyByScope: Record<string, number>
  /** 処理の結果。指定しない種類は success */
  outcome: Partial<Record<PermissionServerKind, MockOutcome>>
  /** AbortSignal に従わず、中止された後も応答を返す */
  ignoreAbort: boolean
  /** 受け付けた要求（検品用） */
  log: { kind: PermissionServerKind; scope: string; detail?: string }[]
  /** 保留する要求の種類。true の種類の要求は、release まで応答しない（検品用） */
  hold: Partial<Record<PermissionServerKind, boolean>>
  /** 保留中の要求（受け付けた順）。中止された要求も、ignoreAbort が true の場合は残る */
  held: HeldRequest[]
}

/** 保留中の要求 */
export type HeldRequest = {
  kind: PermissionServerKind
  scope: string
  detail?: string
  /** log の位置 */
  logIndex: number
  /** 要求した側が中止した（AbortSignal） */
  aborted: boolean
  /**
   * 解放する。サーバーの処理を行い、結果（outcome。省略時は設定の値）を返す。
   * process が false の場合は、サーバーで処理せずに、結果が不明な失敗（要求が届かなかったが、届いたかを確かめられない）を返す
   */
  release: (outcome?: MockOutcome, options?: { process?: boolean }) => void
}

const initialConfig = (): Config => ({
  latency: { access: 400, page: 400, overview: 400, record: 400, save: 800, request: 600, requests: 300, members: 400, role: 600, operation: 500 },
  accessLatencyByScope: {},
  outcome: {},
  ignoreAbort: false,
  log: [],
  hold: {},
  held: [],
})

// ---------------------------------------------------------------- サーバーの状態
type State = {
  memberships: Membership[]
  /** 申請の承認などで個別に付与した権限 */
  grants: Record<string, Permission[]>
  revision: Record<string, number>
  requests: PermissionRequestRecord[]
  customers: PermissionCustomer[]
  requestSeq: number
}

const initialState = (): State => ({
  memberships: seedMemberships.map((m) => ({ ...m })),
  grants: {},
  revision: {},
  requests: [],
  customers: seedPermissionCustomers(),
  requestSeq: 0,
})

let state = initialState()
const listeners = new Set<(scope: string) => void>()
const requestListeners = new Set<() => void>()
const notifyRequests = () => {
  for (const l of [...requestListeners]) l()
}

const parse = (scope: string): PermissionScope => {
  const [userId, workspaceId] = scope.split(":") as [UserId, WorkspaceId]
  return { userId, workspaceId }
}
const membership = (s: PermissionScope) => state.memberships.find((m) => m.userId === s.userId && m.workspaceId === s.workspaceId) ?? null
const permissionsOf = (scope: string): Permission[] => {
  const m = membership(parse(scope))
  if (!m) return []
  const extra = state.grants[scope] ?? []
  return [...roles[m.role].permissions, ...extra.filter((p) => !roles[m.role].permissions.includes(p))]
}
const has = (scope: string, p: Permission) => permissionsOf(scope).includes(p)
const canSeeRecord = (scope: string, c: PermissionCustomer) =>
  c.workspaceId === parse(scope).workspaceId && has(scope, "customers.view") && (c.visibleTo === null || c.visibleTo.includes(parse(scope).userId))
const workspaceScopes = (workspaceId: WorkspaceId) => state.memberships.filter((m) => m.workspaceId === workspaceId).map((m) => scopeKeyOf(m))

/** 権限が変わったことを知らせる（実際の製品では、サーバーからの通知や定期的な確認で検知する） */
function notify(scope: string) {
  state.revision[scope] = (state.revision[scope] ?? 0) + 1
  for (const l of [...listeners]) l(scope)
}

function request<T>(kind: PermissionServerKind, scope: string, signal: AbortSignal | undefined, run: () => T, detail?: string, latency?: number): Promise<T> {
  const logIndex = permissionServer.log.push({ kind, scope, detail }) - 1
  if (permissionServer.hold[kind]) {
    const ignoreAbort = permissionServer.ignoreAbort
    return new Promise<T>((resolve, reject) => {
      const entry: HeldRequest = {
        kind,
        scope,
        detail,
        logIndex,
        aborted: false,
        release: (outcome, { process = true } = {}) => {
          permissionServer.held = permissionServer.held.filter((h) => h !== entry)
          if (!process) {
            reject(new MockUnknownError())
            return
          }
          mockRequest({
            latency: 0,
            outcome: outcome ?? permissionServer.outcome[kind] ?? "success",
            run,
            failMessage: "サーバーに接続できませんでした（模擬）",
            failCode: "network",
          }).then(resolve, reject)
        },
      }
      permissionServer.held.push(entry)
      if (signal) {
        const onAbort = () => {
          entry.aborted = true
          if (ignoreAbort) return
          permissionServer.held = permissionServer.held.filter((h) => h !== entry)
          reject(new DOMException("aborted", "AbortError"))
        }
        if (signal.aborted) onAbort()
        else signal.addEventListener("abort", onAbort, { once: true })
      }
    })
  }
  return mockRequest({
    latency: latency ?? permissionServer.latency[kind],
    outcome: permissionServer.outcome[kind] ?? "success",
    signal,
    ignoreAbort: permissionServer.ignoreAbort,
    run,
    failMessage: "サーバーに接続できませんでした（模擬）",
    failCode: "network",
  })
}

const forbidden = (message: string, code = "forbidden") => new MockRequestError(message, code)

// ---------------------------------------------------------------- API（製品の API の例）
const api = {
  /** 権限と、契約プランで利用できる機能 */
  fetchAccess(scope: string, { signal }: { signal?: AbortSignal } = {}): Promise<AccessResponse> {
    const requestId = permissionServer.log.length
    return request(
      "access",
      scope,
      signal,
      () => {
        const s = parse(scope)
        const m = membership(s)
        if (!m) throw forbidden("このワークスペースのメンバーではありません", "not-member")
        return {
          scope,
          role: m.role,
          permissions: permissionsOf(scope),
          features: [...plans[workspaces[s.workspaceId].plan].features],
          revision: state.revision[scope] ?? 0,
          requestId,
        }
      },
      undefined,
      permissionServer.accessLatencyByScope[scope],
    )
  },

  /** ページ（HTTP のステータスに相当する応答）。scope が null はログインしていない */
  fetchPage(scope: string | null, path: string, { signal }: { signal?: AbortSignal } = {}): Promise<PageResponse> {
    return request(
      "page",
      scope ?? "anonymous",
      signal,
      (): PageResponse => {
        if (!scope) return { status: 401 }
        if (path === "/customers") {
          if (!has(scope, "customers.view")) return { status: 403 }
          const count = state.customers.filter((c) => canSeeRecord(scope, c)).length
          return { status: 200, title: "顧客", body: `閲覧できる顧客は ${count} 件です。` }
        }
        const customer = path.match(/^\/customers\/(.+)$/)?.[1]
        if (customer) {
          const c = state.customers.find((x) => x.id === customer)
          // 閲覧できない顧客は、存在しない顧客と同じ応答にする（存在を明かさない。情報公開のポリシー）。
          if (!c || !canSeeRecord(scope, c)) return { status: 404 }
          return { status: 200, title: c.company, body: `${c.region}・${c.industry}・担当 ${c.owner}` }
        }
        if (path === "/settings/billing") {
          // 契約と請求の設定は、存在を知られても問題がないため、権限不足を 403 で返す。
          if (!has(scope, "billing.manage")) return { status: 403 }
          const ws = workspaces[parse(scope).workspaceId]
          return { status: 200, title: "契約と請求", body: `${plans[ws.plan].name}プラン` }
        }
        return { status: 404 }
      },
      path,
    )
  },

  /** ワークスペースの概要。閲覧できない情報は応答に含めない */
  fetchOverview(scope: string, search: string, { signal }: { signal?: AbortSignal } = {}): Promise<OverviewResponse> {
    return request(
      "overview",
      scope,
      signal,
      (): OverviewResponse => {
        if (!has(scope, "customers.view")) throw forbidden("顧客を閲覧する権限がありません")
        const visible = state.customers.filter((c) => canSeeRecord(scope, c))
        const q = search.trim().toLowerCase()
        const matched = q ? visible.filter((c) => c.company.toLowerCase().includes(q)) : visible
        const s = parse(scope)
        const res: OverviewResponse = { customerCount: matched.length, customers: matched.map((c) => ({ id: c.id, company: c.company })) }
        if (has(scope, "members.view")) {
          res.members = state.memberships
            .filter((m) => m.workspaceId === s.workspaceId)
            .map((m) => ({ userId: m.userId, name: users[m.userId].name, role: m.role }))
        }
        if (has(scope, "billing.manage")) res.billing = { plan: plans[workspaces[s.workspaceId].plan].name, seats: 25 }
        return res
      },
      search,
    )
  },

  fetchRecord(scope: string, id: string, { signal }: { signal?: AbortSignal } = {}): Promise<RecordResponse> {
    return request(
      "record",
      scope,
      signal,
      () => {
        const c = state.customers.find((x) => x.id === id)
        if (!c || !canSeeRecord(scope, c)) throw forbidden("顧客が見つかりません", "not-found")
        const { id: cid, company, owner, region, industry, phone, email, note, version } = c
        return { id: cid, company, owner, region, industry, phone, email, note, version }
      },
      id,
    )
  },

  /** 保存。処理する時点の権限で判断する（保存中に権限が変わった場合は拒否する） */
  saveRecord(scope: string, id: string, patch: { note: string | null; owner: string }, { signal }: { signal?: AbortSignal } = {}): Promise<RecordResponse> {
    return request(
      "save",
      scope,
      signal,
      () => {
        const c = state.customers.find((x) => x.id === id)
        if (!c || !canSeeRecord(scope, c)) throw forbidden("顧客が見つかりません", "not-found")
        if (!has(scope, "customers.edit")) throw forbidden("顧客を編集する権限がありません")
        Object.assign(c, patch, { version: c.version + 1 })
        const { id: cid, company, owner, region, industry, phone, email, note, version } = c
        return { id: cid, company, owner, region, industry, phone, email, note, version }
      },
      id,
    )
  },

  /** 権限の申請。同じ権限の承認待ちの申請がある場合は、新しく作らずに既存の申請を返す（二重申請の防止） */
  requestPermission(
    scope: string,
    permission: Permission,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<{ request: PermissionRequestRecord; created: boolean }> {
    return request(
      "request",
      scope,
      signal,
      () => {
        if (!membership(parse(scope))) throw forbidden("このワークスペースのメンバーではありません", "not-member")
        if (has(scope, permission)) throw forbidden("すでに権限があります", "already-granted")
        if (!requestablePermissions.includes(permission)) throw forbidden("この権限は申請できません", "not-requestable")
        const pending = state.requests.find((r) => r.scope === scope && r.permission === permission && r.status === "pending")
        if (pending) return { request: { ...pending }, created: false }
        const r: PermissionRequestRecord = { id: `pr-${++state.requestSeq}`, scope, permission, status: "pending" }
        state.requests.push(r)
        queueMicrotask(notifyRequests)
        return { request: { ...r }, created: true }
      },
      permission,
    )
  },

  listRequests(scope: string, { signal }: { signal?: AbortSignal } = {}): Promise<PermissionRequestRecord[]> {
    return request("requests", scope, signal, () => state.requests.filter((r) => r.scope === scope).map((r) => ({ ...r })))
  },

  /** purpose：要求の目的（受け付けた要求の記録 log の detail。検品で、どの画面の要求かを区別する） */
  listMembers(
    scope: string,
    { signal, purpose }: { signal?: AbortSignal; purpose?: string } = {},
  ): Promise<{ userId: UserId; name: string; email: string; role: RoleId }[]> {
    return request(
      "members",
      scope,
      signal,
      () => {
        if (!has(scope, "members.view")) throw forbidden("メンバーを閲覧する権限がありません")
        const ws = parse(scope).workspaceId
        return state.memberships
          .filter((m) => m.workspaceId === ws)
          .map((m) => ({ userId: m.userId, name: users[m.userId].name, email: users[m.userId].email, role: m.role }))
      },
      purpose,
    )
  },

  /**
   * ロールの変更。検証はサーバーの責務であり、UI の制限に依存しない。
   * 順に、操作する人の権限、対象、最後の管理者、自分自身の変更、権限昇格（自分にない権限を付与する）を検証する。
   */
  changeRole(scope: string, targetUserId: UserId, role: RoleId, { signal }: { signal?: AbortSignal } = {}): Promise<{ userId: UserId; role: RoleId }> {
    return request(
      "role",
      scope,
      signal,
      () => {
        const actor = parse(scope)
        if (!has(scope, "members.manage")) throw forbidden("メンバーのロールを変更する権限がありません")
        const target = state.memberships.find((m) => m.userId === targetUserId && m.workspaceId === actor.workspaceId)
        if (!target) throw forbidden("メンバーが見つかりません", "not-found")
        if (target.role === role) return { userId: targetUserId, role }
        const admins = state.memberships.filter((m) => m.workspaceId === actor.workspaceId && m.role === "admin")
        if (target.role === "admin" && admins.length === 1) throw forbidden("ワークスペースの最後の管理者のため、ロールを変更できません", "last-admin")
        if (targetUserId === actor.userId) throw forbidden("自分自身のロールは変更できません。ほかの管理者に依頼してください", "self")
        const actorPermissions = permissionsOf(scope)
        if (roles[role].permissions.some((p) => !actorPermissions.includes(p))) throw forbidden("自分にない権限を含むロールは付与できません", "escalation")
        target.role = role
        notify(scopeKeyOf(target))
        return { userId: targetUserId, role }
      },
      `${targetUserId}:${role}`,
    )
  },

  /** 操作の実行。受け付けた時点の権限と契約プランで判断する（実際の処理は行わない） */
  runOperation(scope: string, permissions: Permission[], feature: Feature | null, { signal }: { signal?: AbortSignal } = {}): Promise<{ ok: true }> {
    return request(
      "operation",
      scope,
      signal,
      () => {
        const missing = permissions.filter((p) => !has(scope, p))
        if (missing.length) throw forbidden(`「${missing.map((p) => permissionLabels[p]).join("」「")}」の権限がありません`)
        if (feature && !plans[workspaces[parse(scope).workspaceId].plan].features.includes(feature)) throw forbidden("現在の契約プランでは利用できません")
        return { ok: true as const }
      },
      permissions.join(","),
    )
  },

  /** 権限の変更の知らせを受け取る（実際の製品の通知や定期的な確認に相当する） */
  subscribe(listener: (scope: string) => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /** 申請の記録の変化を受け取る（管理者の画面の模擬で使う） */
  subscribeRequests(listener: () => void) {
    requestListeners.add(listener)
    return () => {
      requestListeners.delete(listener)
    }
  },

  revisionOf: (scope: string) => state.revision[scope] ?? 0,
}

// ---------------------------------------------------------------- ほかの利用者の操作（模擬）。認可の検証を行わず、すぐに反映する
const simulate = {
  /** 管理者がロールを変更した */
  /** silent：変更の知らせを送らない（知らせが届く前に、利用者が古い権限で操作した場合の再現） */
  setRole(userId: UserId, workspaceId: WorkspaceId, role: RoleId, { silent = false }: { silent?: boolean } = {}) {
    const m = state.memberships.find((x) => x.userId === userId && x.workspaceId === workspaceId)
    if (!m || m.role === role) return
    m.role = role
    if (silent) state.revision[scopeKeyOf(m)] = (state.revision[scopeKeyOf(m)] ?? 0) + 1
    else notify(scopeKeyOf(m))
  },
  /** 管理者が申請を承認・却下した */
  decide(requestId: string, decision: "approved" | "rejected") {
    const r = state.requests.find((x) => x.id === requestId)
    if (!r || r.status !== "pending") return
    r.status = decision
    if (decision === "approved") state.grants[r.scope] = [...(state.grants[r.scope] ?? []), r.permission]
    notify(r.scope)
    notifyRequests()
  },
  /** 個別の権限を付与した（検品用） */
  grant(scope: string, permission: Permission) {
    state.grants[scope] = [...(state.grants[scope] ?? []), permission]
    notify(scope)
  },
  /** 顧客の閲覧を担当者だけに制限した（null で制限を外す） */
  restrictRecord(id: string, visibleTo: UserId[] | null) {
    const c = state.customers.find((x) => x.id === id)
    if (!c) return
    c.visibleTo = visibleTo
    for (const s of workspaceScopes("hq")) notify(s)
  },
  /** ほかの利用者が顧客を更新した */
  updateRecord(id: string, patch: Partial<Pick<PermissionCustomer, "note" | "owner">>) {
    const c = state.customers.find((x) => x.id === id)
    if (!c) return
    Object.assign(c, patch, { version: c.version + 1 })
  },
}

/**
 * 保留中の要求を解放する（検品用）。kind と、scope または filter に一致するものを、受け付けた順に解放する。
 * 解放した数を返す。応答を受け取った側の処理（then）が終わるまで待つ場合は、settle を await する。
 */
function release(
  kind: PermissionServerKind,
  { scope, outcome, last = false, process = true }: { scope?: string; outcome?: MockOutcome; last?: boolean; process?: boolean } = {},
) {
  const targets = permissionServer.held.filter((h) => h.kind === kind && (scope === undefined || h.scope === scope))
  const chosen = last ? targets.slice(-1) : targets
  for (const h of chosen) h.release(outcome, { process })
  return chosen.length
}

/** 応答の処理（Promise の then と、それによる React の描画の予約）が進むのを待つ（検品用）。固定の時間を待たない */
const settle = () => new Promise<void>((resolve) => setTimeout(() => setTimeout(resolve, 0), 0))

export const permissionServer: Config & {
  api: typeof api
  simulate: typeof simulate
  release: typeof release
  settle: typeof settle
  /** 現在のサーバーの状態の写し（検品用） */
  inspect: () => { requests: PermissionRequestRecord[]; memberships: Membership[]; customers: PermissionCustomer[]; grants: Record<string, Permission[]> }
  reset: () => void
} = Object.assign(initialConfig(), {
  api,
  simulate,
  release,
  settle,
  inspect: () => structuredClone({ requests: state.requests, memberships: state.memberships, customers: state.customers, grants: state.grants }),
  reset() {
    Object.assign(permissionServer, initialConfig())
    state = initialState()
    for (const l of [...listeners]) l("*")
    notifyRequests()
  },
})

export type PermissionServer = typeof permissionServer
export type PermissionApi = typeof api

declare global {
  interface Window {
    __fdSaPermissionServer?: typeof permissionServer
  }
}
if (typeof window !== "undefined") window.__fdSaPermissionServer = permissionServer
