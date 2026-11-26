// Onboarding のプレビュー用の模擬のサーバー。実際の API、データベース、メール送信、決済は使わない。Registry には含めない。
// 状態（Checklist の表示の状態、閉じた案内、組織の作成の途中の入力、実際の作業結果）はこのサーバーのメモリに持つ。
// 部品を再マウントしても（再読み込みや別の端末の代わり）、ここから読み直すため初期状態に戻らない。ページを再読み込みすると初期値に戻る。
// 検品からは window.__fdSaOnboardingServer で、応答の時間、結果（success / fail / unknown）、ignoreAbort、受け付けた要求を設定・確認する。
//
// サンプルデータは、実際のデータと別の領域（sample）に置く。サンプルへの操作は実際のデータ、作業結果、集計、外部への送信に伝わらない。

import type { ChecklistVisibility, OnboardingTaskResults } from "@/patterns/onboarding"

import { customers as seedCustomers } from "../data-display/customers"
import { MockUnknownError, mockRequest, type MockOutcome } from "./mock"
import type { OnboardingTaskId, UserId } from "./model"
import { NEW_WORKSPACE_ID, onboardingWorkspaceNames } from "./onboarding-data"

export type OnboardingRequestKind =
  | "results"
  | "progress"
  | "help"
  | "save-visibility"
  | "dismiss-help"
  | "customers"
  | "add-customer"
  | "import"
  | "invite"
  | "billing"
  | "avatar"
  | "start-sample"
  | "delete-sample"
  | "load-draft"
  | "save-draft"
  | "create-workspace"
  | "find-created"
  | "find-request"
  | "join"

export type DataSpace = "real" | "sample"
export type OnboardingCustomer = { id: string; company: string; sample: boolean }

/** 組織の作成の途中の入力（手順の境界で保存する） */
export type SetupDraft = {
  /** 作成の要求の ID。同じ ID の作成は 1 回だけ処理する（二重の作成を防ぐ） */
  requestId: string
  step: "org" | "invite" | "data"
  values: { name: string; usage: "team" | "solo"; invites: string; start: "empty" | "sample" }
  /** スキップした任意の手順 */
  skipped: ("invite")[]
}

type WorkspaceStore = {
  name: string
  real: OnboardingCustomer[]
  /** サンプルの領域。null はサンプルを使っていない */
  sample: OnboardingCustomer[] | null
  invitations: string[]
  billing: boolean
  imports: number
}

type Store = {
  workspaces: Record<string, WorkspaceStore>
  avatars: Record<UserId, boolean>
  /** 利用者 × 組織の Checklist の表示の状態 */
  visibility: Record<string, ChecklistVisibility>
  /** 利用者（アカウント）ごとの閉じた案内 */
  dismissedHelp: Record<UserId, string[]>
  drafts: Partial<Record<UserId, SetupDraft>>
  /** 作成の要求の ID → 作成した組織の ID */
  created: Record<string, string>
  /** 参加した組織（利用者:組織） */
  joined: string[]
  /** 外部への送信（招待のメール）の記録。実際には送らない。サンプルの領域からは記録されない */
  sent: { kind: "invitation"; workspaceId: string; to: string }[]
  /** 処理した変更の要求（要求の ID → 結果）。同じ ID の要求は 1 回だけ処理する（冪等） */
  processed: Record<string, unknown>
}

const pick = (from: number, to: number) => seedCustomers.slice(from, to).map((c) => ({ id: c.id, company: c.company, sample: false }))

const sampleSeed = (): OnboardingCustomer[] =>
  ["サンプル商事株式会社", "株式会社サンプル製作所", "サンプル物産株式会社", "株式会社サンプル運輸"].map((company, i) => ({
    id: `S-${String(i + 1).padStart(3, "0")}`,
    company,
    sample: true,
  }))

function initialStore(): Store {
  return {
    workspaces: {
      // 本社営業部：Data Browsing の検証画面と同じ 580 件。取り込み、招待、支払い方法は完了している。
      hq: { name: onboardingWorkspaceNames.hq, real: pick(0, 580), sample: null, invitations: ["ichiro.suzuki@example.com", "misaki.tanaka@example.com"], billing: true, imports: 1 },
      // 西日本営業部：通知の「顧客の取り込み（成功 48 件）」に合わせて 48 件。
      west: { name: onboardingWorkspaceNames.west, real: pick(10, 58), sample: null, invitations: ["hanako.sato@example.com"], billing: true, imports: 1 },
      // 作成した直後の組織。顧客、招待、支払い方法はまだない。
      [NEW_WORKSPACE_ID]: { name: onboardingWorkspaceNames[NEW_WORKSPACE_ID], real: [], sample: null, invitations: [], billing: false, imports: 0 },
    },
    // 佐藤 花子は以前からの利用者で、プロフィールの写真を設定済み（アカウント単位の作業）。
    avatars: { "u-sato": true, "u-suzuki": false, "u-tanaka": false },
    // 佐藤 花子は、本社営業部の Checklist をすべて完了した後に閉じている。
    visibility: { "u-sato:hq": "hidden" },
    dismissedHelp: { "u-sato": [], "u-suzuki": [], "u-tanaka": [] },
    drafts: {},
    created: {},
    joined: [],
    sent: [],
    processed: {},
  }
}

type ServerConfig = {
  /** 応答までの時間（ms） */
  latency: Record<OnboardingRequestKind, number>
  /** 利用者ごとの応答の時間（指定した場合は latency より優先する。利用者の切り替えの競合の検品） */
  latencyByUser: Partial<Record<UserId, number>>
  /** 要求の種類ごとの結果。指定がなければ success */
  outcome: Partial<Record<OnboardingRequestKind, MockOutcome>>
  /** 次の 1 回だけの結果 */
  outcomeNext: Partial<Record<OnboardingRequestKind, MockOutcome>>
  /** AbortSignal に従わず、中止された後も応答を返す */
  ignoreAbort: boolean
  /** 次の 1 回だけ、処理せずに応答を失う（結果が不明で、実際には処理されていない場合の検品） */
  dropNext: Partial<Record<OnboardingRequestKind, boolean>>
  /** 受け付けた要求（検品用） */
  requests: { kind: OnboardingRequestKind; userId?: UserId; workspaceId?: string; space?: DataSpace }[]
}

const initialConfig = (): ServerConfig => ({
  latency: {
    results: 300,
    progress: 300,
    help: 300,
    "save-visibility": 300,
    "dismiss-help": 300,
    customers: 300,
    "add-customer": 400,
    import: 600,
    invite: 400,
    billing: 400,
    avatar: 400,
    "start-sample": 400,
    "delete-sample": 400,
    "load-draft": 300,
    "save-draft": 300,
    "create-workspace": 700,
    "find-created": 300,
    "find-request": 300,
    join: 400,
  },
  latencyByUser: {},
  outcome: {},
  outcomeNext: {},
  ignoreAbort: false,
  dropNext: {},
  requests: [],
})

let store = initialStore()

type Ctx = {
  signal?: AbortSignal
  /** 変更の要求の ID。同じ ID の要求は 1 回だけ処理し、2 回目以降は最初の結果を返す */
  requestId?: string
}

function call<T>(kind: OnboardingRequestKind, meta: { userId?: UserId; workspaceId?: string; space?: DataSpace }, ctx: Ctx, run: () => T, failMessage?: string) {
  const s = onboardingServer
  s.requests.push({ kind, ...meta })
  const outcome = s.outcomeNext[kind] ?? s.outcome[kind] ?? "success"
  delete s.outcomeNext[kind]
  const latency = (meta.userId && s.latencyByUser[meta.userId]) ?? s.latency[kind]
  if (s.dropNext[kind]) {
    delete s.dropNext[kind]
    return new Promise<T>((_, reject) => setTimeout(() => reject(new MockUnknownError()), latency))
  }
  const id = ctx.requestId
  const once = id
    ? () => {
        if (id in store.processed) return store.processed[id] as T
        const value = run()
        store.processed[id] = value
        return value
      }
    : run
  return mockRequest({ latency, outcome, signal: ctx.signal, ignoreAbort: s.ignoreAbort, run: once, failMessage })
}

const ws = (id: string) => {
  const w = store.workspaces[id]
  if (!w) throw new Error(`unknown workspace: ${id}`)
  return w
}

/** 実際の作業結果。サンプルの領域は含めない */
function resultsOf(userId: UserId, workspaceId: string): OnboardingTaskResults<OnboardingTaskId> {
  const w = ws(workspaceId)
  const workspace: OnboardingTaskId[] = []
  if (w.real.length > 0) workspace.push("first-customer")
  if (w.imports > 0) workspace.push("import-customers")
  if (w.invitations.length > 0) workspace.push("invite-members")
  if (w.billing) workspace.push("set-billing")
  return { account: store.avatars[userId] ? ["complete-profile"] : [], workspace }
}

let seq = 0
const nextId = (prefix: string) => `${prefix}-${String(++seq).padStart(4, "0")}`

/** 部品が使う模擬の API。統合の検証画面は、この関数を props で渡す */
export const onboardingApi = {
  getResults: (userId: UserId, workspaceId: string, ctx: Ctx = {}) =>
    call("results", { userId, workspaceId }, ctx, () => resultsOf(userId, workspaceId)),
  getProgress: (userId: UserId, workspaceId: string, ctx: Ctx = {}) =>
    call("progress", { userId, workspaceId }, ctx, () => ({
      visibility: store.visibility[`${userId}:${workspaceId}`] ?? ("expanded" as ChecklistVisibility),
    })),
  getDismissedHelp: (userId: UserId, ctx: Ctx = {}) => call("help", { userId }, ctx, () => [...(store.dismissedHelp[userId] ?? [])]),
  saveVisibility: (userId: UserId, workspaceId: string, visibility: ChecklistVisibility, ctx: Ctx = {}) =>
    call("save-visibility", { userId, workspaceId }, ctx, () => {
      store.visibility[`${userId}:${workspaceId}`] = visibility
      return visibility
    }, "表示の状態を保存できませんでした"),
  dismissHelp: (userId: UserId, helpId: string, ctx: Ctx = {}) =>
    call("dismiss-help", { userId }, ctx, () => {
      const list = (store.dismissedHelp[userId] ??= [])
      if (!list.includes(helpId)) list.push(helpId)
      return [...list]
    }),
  listCustomers: (workspaceId: string, space: DataSpace, search: string, ctx: Ctx = {}) =>
    call("customers", { workspaceId, space }, ctx, () => {
      const w = ws(workspaceId)
      const all = space === "sample" ? (w.sample ?? []) : w.real
      const q = search.trim()
      const rows = q ? all.filter((c) => c.company.includes(q)) : all
      return { rows: rows.slice(0, 6), total: rows.length, all: all.length, sampleAvailable: w.sample !== null }
    }, "顧客の一覧を取得できませんでした"),
  addCustomer: (workspaceId: string, space: DataSpace, company: string, ctx: Ctx = {}) =>
    call("add-customer", { workspaceId, space }, ctx, () => {
      const w = ws(workspaceId)
      if (space === "sample") {
        if (!w.sample) throw new Error("sample is not active")
        const c = { id: nextId("S"), company, sample: true }
        w.sample.unshift(c)
        return c
      }
      const c = { id: nextId("C"), company, sample: false }
      w.real.unshift(c)
      return c
    }, "顧客を登録できませんでした"),
  importCustomers: (workspaceId: string, ctx: Ctx = {}) =>
    call("import", { workspaceId, space: "real" }, ctx, () => {
      const w = ws(workspaceId)
      const rows = ["青葉精機株式会社", "株式会社みなと設計", "北斗食品株式会社"].map((company) => ({ id: nextId("C"), company, sample: false }))
      w.real.unshift(...rows)
      w.imports++
      return rows.length
    }, "取り込めませんでした"),
  invite: (workspaceId: string, email: string, ctx: Ctx = {}) =>
    call("invite", { workspaceId, space: "real" }, ctx, () => {
      const w = ws(workspaceId)
      w.invitations.push(email)
      store.sent.push({ kind: "invitation", workspaceId, to: email })
      return w.invitations.length
    }, "招待を送れませんでした"),
  registerBilling: (workspaceId: string, ctx: Ctx = {}) =>
    call("billing", { workspaceId }, ctx, () => {
      ws(workspaceId).billing = true
      return true
    }, "支払い方法を登録できませんでした"),
  setAvatar: (userId: UserId, ctx: Ctx = {}) =>
    call("avatar", { userId }, ctx, () => {
      store.avatars[userId] = true
      return true
    }, "写真を設定できませんでした"),
  startSample: (workspaceId: string, ctx: Ctx = {}) =>
    call("start-sample", { workspaceId, space: "sample" }, ctx, () => {
      const w = ws(workspaceId)
      if (!w.sample) w.sample = sampleSeed()
      return w.sample.length
    }, "サンプルデータを用意できませんでした"),
  deleteSample: (workspaceId: string, ctx: Ctx = {}) =>
    call("delete-sample", { workspaceId, space: "sample" }, ctx, () => {
      ws(workspaceId).sample = null
      return true
    }, "サンプルデータを削除できませんでした"),
  loadDraft: (userId: UserId, ctx: Ctx = {}) =>
    call("load-draft", { userId }, ctx, () => (store.drafts[userId] ? structuredClone(store.drafts[userId]) : null)),
  saveDraft: (userId: UserId, draft: SetupDraft | null, ctx: Ctx = {}) =>
    call("save-draft", { userId }, ctx, () => {
      if (draft) store.drafts[userId] = structuredClone(draft)
      else delete store.drafts[userId]
      return true
    }, "途中の入力を保存できませんでした"),
  /** 組織を作成する。同じ requestId の要求は 1 回だけ処理し、2 回目以降は同じ組織を返す */
  createWorkspace: (
    userId: UserId,
    payload: { requestId: string; name: string; invites: string[]; start: "empty" | "sample" },
    ctx: Ctx = {}
  ) =>
    call("create-workspace", { userId }, ctx, () => {
      const existing = store.created[payload.requestId]
      if (existing) return { workspaceId: existing }
      const id = nextId("org")
      store.workspaces[id] = { name: payload.name, real: [], sample: payload.start === "sample" ? sampleSeed() : null, invitations: [...payload.invites], billing: false, imports: 0 }
      for (const to of payload.invites) store.sent.push({ kind: "invitation", workspaceId: id, to })
      store.created[payload.requestId] = id
      delete store.drafts[userId]
      return { workspaceId: id }
    }, "組織を作成できませんでした"),
  /** 結果が不明だった作成の要求が、処理されたかを確かめる */
  findCreated: (userId: UserId, requestId: string, ctx: Ctx = {}) =>
    call("find-created", { userId }, ctx, () => (store.created[requestId] ? { workspaceId: store.created[requestId] } : null)),
  acceptInvitation: (userId: UserId, workspaceId: string, ctx: Ctx = {}) =>
    call("join", { userId, workspaceId }, ctx, () => {
      const key = `${userId}:${workspaceId}`
      if (!store.joined.includes(key)) store.joined.push(key)
      return true
    }, "参加できませんでした"),
  /** 結果が不明だった変更の要求が、処理されたかを確かめる。処理されていれば最初の結果、されていなければ null */
  findRequest: (requestId: string, ctx: Ctx = {}) =>
    call("find-request", {}, ctx, () => (requestId in store.processed ? store.processed[requestId] : null)),
  workspaceName: (workspaceId: string) => store.workspaces[workspaceId]?.name ?? workspaceId,
}

export type OnboardingApi = typeof onboardingApi

export const onboardingServer: ServerConfig & {
  reset: () => void
  /** 現在の保存内容の写し（検品用） */
  snapshot: () => Store
} = Object.assign(initialConfig(), {
  reset() {
    Object.assign(onboardingServer, initialConfig())
    store = initialStore()
    seq = 0
  },
  snapshot: () => structuredClone(store),
})

declare global {
  interface Window {
    __fdSaOnboardingServer?: typeof onboardingServer
  }
}
if (typeof window !== "undefined") window.__fdSaOnboardingServer = onboardingServer
