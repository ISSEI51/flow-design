// System States のプレビューの模擬のサーバー。実際のネットワークの監視、障害の監視、ジョブの実行の基盤は使わない。Registry には含めない。
// 端末のネットワーク（模擬の navigator.onLine）、サービスへの経路、機能ごとの稼働状態、状態の API の失敗、保存の結果、
// 長時間の処理（ジョブ）の進捗とキャンセルを再現し、Patterns の挙動を確かめる。
// 検品からは window.__fdSaSystemServer で設定する（応答の時間、結果、ignoreAbort、受け付けた要求の記録、reset()）。

import type { BrowserOnlineSource } from "@/patterns/system-status-hooks"
import type { JobSnapshot, JobState, RetryPolicy, ServiceHealth } from "@/patterns/system-status"

import { customers, type Customer } from "../data-display/customers"
import { mockRequest, MockRequestError, type MockOutcome } from "./mock"
import { referenceNow, serviceComponentLabels, type ServiceComponent, type WorkspaceId } from "./model"

export const serviceComponents = Object.keys(serviceComponentLabels) as ServiceComponent[]

// ---------------------------------------------------------------- 型

export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved"
export const incidentStatusLabels: Record<IncidentStatus, string> = {
  investigating: "調査中",
  identified: "原因を特定",
  monitoring: "復旧を確認中",
  resolved: "解決済み",
}

export type Incident = {
  id: string
  title: string
  components: ServiceComponent[]
  status: IncidentStatus
  /** 基準の時刻（referenceNow）からの分。負の値は過去 */
  startedAt: number
  resolvedAt: number | null
  /** 対応の状況（新しい順）。利用者に公開してよい文だけを書く（内部の構成や Stack Trace を書かない） */
  updates: { at: number; text: string }[]
}

export type ScheduledMaintenance = {
  id: string
  title: string
  components: ServiceComponent[]
  /** ISO 8601（タイムゾーンつき） */
  start: string
  end: string
  /** 利用者が取るべき行動 */
  action: string
}

export type ServiceStatusResponse = {
  components: Record<ServiceComponent, ServiceHealth>
  incidents: Incident[]
  maintenance: ScheduledMaintenance[]
  /** 状態を更新した時刻（基準の時刻からの分） */
  updatedAt: number
}

export type MemoRecord = { customerId: string; text: string; revision: number; requestId: string | null }

export type JobKind = "export" | "import" | "bulk-update"
export const jobKindLabels: Record<JobKind, string> = {
  export: "顧客の書き出し",
  import: "顧客の取り込み",
  "bulk-update": "担当者の一括変更",
}

export type JobRecord = JobSnapshot & {
  workspace: WorkspaceId
  kind: JobKind
  name: string
  /** 開始の順番（表示の並びに使う） */
  number: number
  /** サーバーがキャンセルの要求を受け付けた */
  cancelRequested: boolean
  /** 部分的な失敗の件数 */
  counts: { succeeded: number; failed: number } | null
}

export type JobOutcome = "succeeded" | "partial" | "failed" | "unknown"

export type SyncOutcome = "success" | "fail" | "conflict" | "unknown"

type RequestKind = "probe" | "status" | "list" | "save" | "memo" | "job-start" | "job-list" | "job-cancel" | "register" | "register-check"

type ServerConfig = {
  /** 応答までの時間（ms） */
  latency: Record<RequestKind, number>
  /** job-list の応答の時間を、要求ごとに先頭から使う（順序が入れ替わる応答の検品） */
  jobListLatencies: number[]
  /** 端末のネットワーク（模擬の navigator.onLine）。setBrowserOnline で変える */
  browserOnline: boolean
  /** サービスへの経路。false の間、要求はサービスに届かない（処理されない失敗） */
  reachable: boolean
  /** 疎通の確認を、この回数だけ失敗させる（再接続の自動の確認の検品） */
  probeFailures: number
  /** 顧客の一覧の取得を、この回数だけ失敗させる（サーバーの失敗。回復の後の再取得の失敗の検品） */
  listFailures: number
  /** サービスの状態の API を失敗させる */
  statusFails: boolean
  /** 機能ごとの稼働状態 */
  services: Record<ServiceComponent, ServiceHealth>
  incidents: Incident[]
  maintenance: ScheduledMaintenance[]
  /** 状態を更新した時刻（基準の時刻からの分） */
  statusUpdatedAt: number
  /** 保存の結果 */
  saveOutcome: MockOutcome
  /** メモの取得を、この回数だけ失敗させる（サーバーの失敗） */
  memoFailures: number
  /** ジョブの開始の要求の結果 */
  jobStartOutcome: MockOutcome
  /** 中止の信号（AbortSignal）に従わない */
  ignoreAbort: boolean
  /** ジョブが実際の進捗を返す */
  jobReportsProgress: boolean
  /** ジョブの結果 */
  jobOutcome: JobOutcome
  /** キャンセルの要求の後、サーバーで停止するか（completed：停止する前に完了する） */
  jobCancelOutcome: "cancelled" | "completed"
  /** ジョブの進捗を進める間隔（ms） */
  jobStep: number
  /** オフラインの登録の同期の結果 */
  syncOutcome: SyncOutcome
  /** 資料のページがサービスの状態を取得し直す間隔（ms）。製品の監視の間隔の例 */
  statusPollInterval: number
  /** 受け付けた要求（検品用）。サービスに届かなかった要求も記録する（reached） */
  requests: { kind: RequestKind; workspace?: string; detail?: string; reached: boolean }[]
}

const pastIncidents = (): Incident[] => [
  {
    id: "inc-1118",
    title: "検索の結果の表示が遅くなっていました",
    components: ["search"],
    status: "resolved",
    startedAt: -60 * 24 * 8,
    resolvedAt: -60 * 24 * 8 + 95,
    updates: [
      { at: -60 * 24 * 8 + 95, text: "対応が完了し、通常の速さで表示されることを確認しました。" },
      { at: -60 * 24 * 8 + 20, text: "原因を特定し、対応しています。" },
    ],
  },
  {
    id: "inc-1102",
    title: "通知が一時的に届きませんでした",
    components: ["notifications"],
    status: "resolved",
    startedAt: -60 * 24 * 24,
    resolvedAt: -60 * 24 * 24 + 48,
    updates: [{ at: -60 * 24 * 24 + 48, text: "遅れていた通知は、すべて配信しました。" }],
  },
]

const upcomingMaintenance = (): ScheduledMaintenance[] => [
  {
    id: "mnt-1203",
    title: "書き出しと契約の管理のメンテナンス",
    components: ["export", "billing"],
    start: "2026-12-03T02:00:00+09:00",
    end: "2026-12-03T04:00:00+09:00",
    action: "書き出しが必要な場合は、開始の前に済ませてください。",
  },
]

const allOperational = (): Record<ServiceComponent, ServiceHealth> =>
  Object.fromEntries(serviceComponents.map((c) => [c, "operational"])) as Record<ServiceComponent, ServiceHealth>

const initialConfig = (): ServerConfig => ({
  latency: { probe: 300, status: 300, list: 400, save: 600, memo: 300, "job-start": 300, "job-list": 200, "job-cancel": 300, register: 600, "register-check": 300 },
  jobListLatencies: [],
  browserOnline: true,
  reachable: true,
  probeFailures: 0,
  listFailures: 0,
  statusFails: false,
  services: allOperational(),
  incidents: pastIncidents(),
  maintenance: upcomingMaintenance(),
  statusUpdatedAt: -3,
  saveOutcome: "success",
  memoFailures: 0,
  jobStartOutcome: "success",
  ignoreAbort: false,
  jobReportsProgress: true,
  jobOutcome: "succeeded",
  jobCancelOutcome: "cancelled",
  jobStep: 700,
  syncOutcome: "success",
  statusPollInterval: 5000,
  requests: [],
})

// ---------------------------------------------------------------- 状態の場面（資料のページの操作と検品で使う）

export type SystemScenario = "operational" | "degraded" | "partial-outage" | "multiple" | "outage" | "maintenance" | "recovering"

const scenarioIncident = (id: string, title: string, components: ServiceComponent[], status: IncidentStatus, text: string): Incident => ({
  id,
  title,
  components,
  status,
  startedAt: -12,
  resolvedAt: null,
  updates: [{ at: -5, text }],
})

function scenarioState(scenario: SystemScenario): Pick<ServerConfig, "services" | "incidents"> {
  const services = allOperational()
  const past = pastIncidents()
  switch (scenario) {
    case "operational":
      return { services, incidents: past }
    case "degraded":
      services.customers = "degraded"
      return {
        services,
        incidents: [scenarioIncident("inc-1126a", "顧客の一覧の表示が遅くなっています", ["customers"], "investigating", "表示が遅くなっていることを確認し、原因を調べています。"), ...past],
      }
    case "partial-outage":
      services.search = "partial-outage"
      return {
        services,
        incidents: [scenarioIncident("inc-1126b", "検索の一部が利用できません", ["search"], "identified", "原因を特定し、対応しています。一覧の表示と編集は利用できます。"), ...past],
      }
    case "multiple":
      services.search = "partial-outage"
      services.notifications = "outage"
      services.customers = "degraded"
      services.billing = "outage"
      return {
        services,
        incidents: [
          scenarioIncident("inc-1126c", "通知を受け取れません", ["notifications"], "investigating", "通知が届かないことを確認し、原因を調べています。"),
          scenarioIncident("inc-1126e", "契約と請求のページを表示できません", ["billing"], "investigating", "原因を調べています。"),
          scenarioIncident("inc-1126b", "検索の一部が利用できません", ["search"], "identified", "原因を特定し、対応しています。"),
          scenarioIncident("inc-1126a", "顧客の一覧の表示が遅くなっています", ["customers"], "investigating", "原因を調べています。"),
          ...past,
        ],
      }
    case "outage":
      for (const c of serviceComponents) services[c] = "outage"
      return {
        services,
        incidents: [scenarioIncident("inc-1126d", "サービスを利用できません", [...serviceComponents], "investigating", "サービスを利用できないことを確認し、原因を調べています。"), ...past],
      }
    case "maintenance":
      for (const c of serviceComponents) services[c] = "maintenance"
      return { services, incidents: past }
    case "recovering":
      services.search = "recovering"
      return {
        services,
        incidents: [scenarioIncident("inc-1126b", "検索の一部が利用できませんでした", ["search"], "monitoring", "対応が完了し、復旧を確認しています。"), ...past],
      }
  }
}

// ---------------------------------------------------------------- 保存されたデータ（ワークスペースごと）

const customerSets: Record<WorkspaceId, Customer[]> = {
  hq: customers.filter((c) => c.region === "関東").slice(0, 5),
  west: customers.filter((c) => c.region === "近畿").slice(0, 5),
}

let memos: Record<WorkspaceId, Record<string, MemoRecord>> = { hq: {}, west: {} }
// internalDone：サーバーでの処理の進み。進捗を返さない設定でも、サーバーでは処理が進む。
type InternalJob = JobRecord & { internalDone: number }
let jobs: InternalJob[] = []
let jobNumber = 0
let jobTimer: ReturnType<typeof setInterval> | null = null
/** オフラインの登録の同期で、サーバーが受け付けた登録（端末の ID ごと。重複の防止の確認に使う） */
let registered: Record<string, { name: string; workspace: WorkspaceId }> = {}
let listCalls = 0

function resetStore() {
  memos = {
    hq: Object.fromEntries(customerSets.hq.map((c) => [c.id, { customerId: c.id, text: "次回の訪問で、契約の更新を相談する。", revision: 1, requestId: null }])),
    west: Object.fromEntries(customerSets.west.map((c) => [c.id, { customerId: c.id, text: "", revision: 1, requestId: null }])),
  }
  jobs = []
  jobNumber = 0
  registered = {}
  listCalls = 0
  if (jobTimer) clearInterval(jobTimer)
  jobTimer = null
}
resetStore()

// ---------------------------------------------------------------- 変化の購読（例の操作の表示を更新する）

const listeners = new Set<() => void>()
let version = 0
function notify() {
  version++
  for (const l of [...listeners]) l()
}

const browserListeners = new Set<() => void>()

// ---------------------------------------------------------------- 要求

function record(kind: RequestKind, workspace?: string, detail?: string) {
  const reached = config.browserOnline && config.reachable
  config.requests.push({ kind, workspace, detail, reached })
  return reached
}

/** サービスに届かない要求（処理されない失敗）。応答の時間の後に失敗する */
const unreachable = (latency: number, signal?: AbortSignal) =>
  mockRequest<never>({ latency, outcome: "fail", signal, ignoreAbort: config.ignoreAbort, run: () => undefined as never, failMessage: "サービスに接続できませんでした", failCode: "network" })

const productDown = () => {
  const states = serviceComponents.map((c) => config.services[c])
  if (states.every((s) => s === "maintenance")) return "maintenance"
  if (states.every((s) => s === "outage")) return "outage"
  return null
}

function snapshotJob({ internalDone: _internal, ...j }: InternalJob): JobRecord {
  return { ...j, progress: j.progress ? { ...j.progress } : null, counts: j.counts ? { ...j.counts } : null }
}

function advanceJobs() {
  let changed = false
  for (const j of jobs) {
    if (j.state === "queued") {
      j.state = j.cancelRequested ? "cancelled" : "running"
      j.revision++
      changed = true
      continue
    }
    if (j.state !== "running" && j.state !== "cancel-requested") continue
    if (j.cancelRequested && config.jobCancelOutcome === "cancelled") {
      j.state = "cancelled"
      j.revision++
      changed = true
      continue
    }
    const total = 1240
    const done = Math.min(total, j.internalDone + 310)
    j.internalDone = done
    j.progress = config.jobReportsProgress ? { done, total } : null
    j.revision++
    changed = true
    if (done >= total) {
      const outcome = config.jobOutcome
      j.state = outcome
      j.counts = outcome === "partial" ? { succeeded: total - 12, failed: 12 } : outcome === "succeeded" ? { succeeded: total, failed: 0 } : null
    }
  }
  if (!jobs.some((j) => j.state === "queued" || j.state === "running" || j.state === "cancel-requested")) {
    if (jobTimer) clearInterval(jobTimer)
    jobTimer = null
  }
  if (changed) notify()
}

function ensureJobTimer() {
  if (!jobTimer) jobTimer = setInterval(advanceJobs, config.jobStep)
}

const config: ServerConfig = initialConfig()

// 検品の初期設定：ページを読み込む前に window.__fdSaSystemServerInit を置くと、最初の要求の前に反映する（latency は項目ごとに上書き）
type ServerInit = Partial<Omit<ServerConfig, "latency">> & { latency?: Partial<ServerConfig["latency"]> }
function applyInit(init: ServerInit | undefined) {
  if (!init) return
  const { latency, ...rest } = init
  Object.assign(config, rest)
  if (latency) config.latency = { ...config.latency, ...latency }
}

export const systemServer = Object.assign(config, {
  reset() {
    Object.assign(config, initialConfig())
    resetStore()
    for (const l of [...browserListeners]) l()
    notify()
  },
  /** 端末のネットワークの接続を変える（ブラウザの online / offline の通知を模擬する） */
  setBrowserOnline(online: boolean) {
    config.browserOnline = online
    for (const l of [...browserListeners]) l()
    notify()
  },
  setReachable(reachable: boolean) {
    config.reachable = reachable
    notify()
  },
  setService(component: ServiceComponent, health: ServiceHealth) {
    config.services = { ...config.services, [component]: health }
    notify()
  },
  setStatusFails(fails: boolean) {
    config.statusFails = fails
    notify()
  },
  applyScenario(scenario: SystemScenario) {
    Object.assign(config, scenarioState(scenario))
    config.statusUpdatedAt = scenario === "operational" ? -3 : -1
    notify()
  },
  /** 設定を変えて、表示を更新する（検品から使う。latency は項目ごとに上書き） */
  set(patch: ServerInit) {
    applyInit(patch)
    notify()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  version: () => version,
  /** 模擬の navigator.onLine（useConnectivity の browserOnline に渡す） */
  browser: {
    get: () => config.browserOnline,
    subscribe: (onChange: () => void) => {
      browserListeners.add(onChange)
      return () => {
        browserListeners.delete(onChange)
      }
    },
  } satisfies BrowserOnlineSource,
  /** 再接続の自動の確認の間隔と上限（資料の例では短くする） */
  retry: { baseDelay: 1000, maxDelay: 8000, maxAttempts: 4 } satisfies RetryPolicy,

  // -------------------------------------------------------------- API
  /** 疎通の確認。ネットワークの経路を確かめる（サービスの稼働は getServiceStatus で確かめる） */
  probe({ signal }: { signal: AbortSignal }): Promise<void> {
    const reached = record("probe")
    if (!config.browserOnline) return Promise.reject(new MockRequestError("ネットワークに接続していません", "network"))
    if (!reached) return unreachable(config.latency.probe, signal)
    if (config.probeFailures > 0) {
      config.probeFailures--
      return unreachable(config.latency.probe, signal)
    }
    return mockRequest({ latency: config.latency.probe, signal, ignoreAbort: config.ignoreAbort, run: () => undefined })
  },

  getServiceStatus(signal?: AbortSignal): Promise<ServiceStatusResponse> {
    if (!record("status")) return unreachable(config.latency.status, signal)
    return mockRequest({
      latency: config.latency.status,
      outcome: config.statusFails ? "fail" : "success",
      signal,
      ignoreAbort: config.ignoreAbort,
      failMessage: "サービスの状態を取得できませんでした",
      failCode: "status",
      run: () => ({
        components: { ...config.services },
        incidents: config.incidents.map((i) => ({ ...i, components: [...i.components], updates: [...i.updates] })),
        maintenance: config.maintenance.map((m) => ({ ...m, components: [...m.components] })),
        updatedAt: config.statusUpdatedAt,
      }),
    })
  },

  listCustomers(workspace: WorkspaceId, query: string, signal?: AbortSignal): Promise<{ id: string; company: string; owner: string }[]> {
    if (!record("list", workspace, query)) return unreachable(config.latency.list, signal)
    listCalls++
    if (config.listFailures > 0) {
      config.listFailures--
      return mockRequest({ latency: config.latency.list, outcome: "fail", signal, run: () => [], failMessage: "顧客の一覧を取得できませんでした", failCode: "server" })
    }
    const down = productDown() ?? (config.services.customers === "outage" ? "outage" : null)
    if (down) return mockRequest({ latency: config.latency.list, outcome: "fail", signal, run: () => [], failMessage: "顧客の一覧を取得できませんでした", failCode: down })
    if (query && (config.services.search === "outage" || config.services.search === "partial-outage"))
      return mockRequest({ latency: config.latency.list, outcome: "fail", signal, run: () => [], failMessage: "検索を利用できません", failCode: "search" })
    return mockRequest({
      latency: config.services.customers === "degraded" ? config.latency.list * 3 : config.latency.list,
      signal,
      ignoreAbort: config.ignoreAbort,
      run: () => customerSets[workspace].filter((c) => !query || c.company.includes(query)).map((c) => ({ id: c.id, company: c.company, owner: c.owner })),
    })
  },

  customersOf: (workspace: WorkspaceId) => customerSets[workspace],
  listCalls: () => listCalls,

  saveMemo(input: { workspace: WorkspaceId; customerId: string; text: string; requestId: string }, signal?: AbortSignal): Promise<MemoRecord> {
    if (!record("save", input.workspace, input.requestId)) return unreachable(config.latency.save, signal)
    return mockRequest({
      latency: config.latency.save,
      outcome: config.saveOutcome,
      signal,
      ignoreAbort: config.ignoreAbort,
      failMessage: "保存できませんでした",
      failCode: "save",
      run: () => {
        const prev = memos[input.workspace][input.customerId]
        const next = { customerId: input.customerId, text: input.text, revision: (prev?.revision ?? 0) + 1, requestId: input.requestId }
        memos[input.workspace][input.customerId] = next
        notify()
        return { ...next }
      },
    })
  },

  getMemo(workspace: WorkspaceId, customerId: string, signal?: AbortSignal): Promise<MemoRecord> {
    if (!record("memo", workspace, customerId)) return unreachable(config.latency.memo, signal)
    if (config.memoFailures > 0) {
      config.memoFailures--
      return mockRequest({ latency: config.latency.memo, outcome: "fail", signal, run: () => ({ customerId, text: "", revision: 0, requestId: null }), failMessage: "メモを取得できませんでした", failCode: "server" })
    }
    return mockRequest({
      latency: config.latency.memo,
      signal,
      ignoreAbort: config.ignoreAbort,
      run: () => ({ ...(memos[workspace][customerId] ?? { customerId, text: "", revision: 0, requestId: null }) }),
    })
  },

  /** サーバーに保存されているメモ（検品用。要求を記録しない） */
  memoOf: (workspace: WorkspaceId, customerId: string) => memos[workspace][customerId],

  startJob(workspace: WorkspaceId, kind: JobKind, signal?: AbortSignal): Promise<JobRecord> {
    if (!record("job-start", workspace, kind)) return unreachable(config.latency["job-start"], signal)
    return mockRequest({
      latency: config.latency["job-start"],
      outcome: config.jobStartOutcome,
      failMessage: "開始できませんでした",
      failCode: "job-start",
      signal,
      run: () => {
        const job: InternalJob = {
          id: `job-${kind}-${++jobNumber}`,
          revision: 1,
          state: "queued",
          progress: config.jobReportsProgress ? { done: 0, total: 1240 } : null,
          workspace,
          kind,
          name: jobKindLabels[kind],
          number: jobNumber,
          cancelRequested: false,
          counts: null,
          internalDone: 0,
        }
        jobs.push(job)
        ensureJobTimer()
        notify()
        return snapshotJob(job)
      },
    })
  },

  listJobs(workspace: WorkspaceId, signal?: AbortSignal): Promise<JobRecord[]> {
    // 要求を受け付けた時点の状態を返す（応答の時間の間に変わった状態は含まない）
    const latency = config.jobListLatencies.length > 0 ? config.jobListLatencies.shift()! : config.latency["job-list"]
    if (!record("job-list", workspace)) return unreachable(latency, signal)
    const snapshot = jobs.filter((j) => j.workspace === workspace).map(snapshotJob)
    return mockRequest({ latency, signal, ignoreAbort: config.ignoreAbort, run: () => snapshot })
  },

  cancelJob(workspace: WorkspaceId, jobId: string, signal?: AbortSignal): Promise<void> {
    if (!record("job-cancel", workspace, jobId)) return unreachable(config.latency["job-cancel"], signal)
    return mockRequest({
      latency: config.latency["job-cancel"],
      signal,
      run: () => {
        const job = jobs.find((j) => j.id === jobId && j.workspace === workspace)
        if (!job || (job.state !== "queued" && job.state !== "running")) return
        // 要求を受け付けただけで、停止はしていない。停止はジョブの次の進行で行う（または停止の前に完了する）。
        job.cancelRequested = true
        job.state = "cancel-requested"
        job.revision++
        notify()
      },
    })
  },

  jobsOf: (workspace: WorkspaceId) => jobs.filter((j) => j.workspace === workspace).map(snapshotJob),

  /** オフラインで端末に保存した登録を、サーバーに送る。localId は重複の防止のキー（冪等性のキー） */
  registerCustomer(input: { workspace: WorkspaceId; localId: string; name: string }, signal?: AbortSignal): Promise<{ id: string }> {
    if (!record("register", input.workspace, input.localId)) return unreachable(config.latency.register, signal)
    const outcome = config.syncOutcome
    if (outcome === "conflict")
      return mockRequest({ latency: config.latency.register, outcome: "fail", signal, run: () => ({ id: "" }), failMessage: "同じ名前の顧客が、ほかの利用者によって登録されています", failCode: "conflict" })
    return mockRequest({
      latency: config.latency.register,
      outcome: outcome === "fail" ? "fail" : outcome === "unknown" ? "unknown" : "success",
      signal,
      ignoreAbort: config.ignoreAbort,
      failMessage: "登録できませんでした",
      failCode: "register",
      run: () => {
        // 同じ localId の登録は 1 回だけ受け付ける（重複の防止）
        registered[input.localId] ??= { name: input.name, workspace: input.workspace }
        notify()
        return { id: `C-NEW-${input.localId}` }
      },
    })
  },

  /** 端末の ID で、サーバーに登録されたかを確かめる */
  checkRegistration(input: { workspace: WorkspaceId; localId: string }, signal?: AbortSignal): Promise<{ registered: boolean }> {
    if (!record("register-check", input.workspace, input.localId)) return unreachable(config.latency["register-check"], signal)
    return mockRequest({ latency: config.latency["register-check"], signal, run: () => ({ registered: Boolean(registered[input.localId]) }) })
  },

  registeredCount: () => Object.keys(registered).length,
  /** 基準の時刻（分）を時刻にする */
  at: (minutes: number) => referenceNow + minutes * 60_000,
})

export type SystemServer = typeof systemServer

declare global {
  interface Window {
    __fdSaSystemServer?: SystemServer
    __fdSaSystemServerInit?: ServerInit
  }
}
if (typeof window !== "undefined") {
  applyInit(window.__fdSaSystemServerInit)
  window.__fdSaSystemServer = systemServer
}

export const isTerminalJob = (state: JobState) => state !== "queued" && state !== "running" && state !== "cancel-requested"
