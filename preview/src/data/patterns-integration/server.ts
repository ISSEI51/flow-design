// Patterns の横断の検証画面の模擬のサーバー（プレビュー専用。実際の API やデータベースは使わない。Registry には含めない）。
// 一覧、詳細、保存、一括操作、結果の照会、分析、認可、通知、設定、取り込みを 1 つのデータ（model.ts の Db）で扱う。
// 検品は window.__fdPi から、応答の保留と解放、結果の種類、権限、障害、セッションの期限切れを操作する。
//
// 応答の保留（hold）
// - hold[kind] が true の種類の要求は、release() を呼ぶまで応答しない。保留した要求は AbortSignal を無視する
//   （中止を無視して処理を続け、後から応答を返すサーバーを再現する）。順序の検品は、テストの側で解放の順序を決める。
// - 応答の内容は、要求を受け付けた時点のデータで決める（後から解放した古い要求は、古いデータを返す）。
// 結果の種類
// - 結果が不明（unknown）：応答が届かない。unknownApplied が true なら、サーバーでは処理が終わっている。
// - 権限（permissions）は、要求ごとにサーバーが確かめる（画面の表示とは別に、最終の判断はサーバーが行う）。

import { FormSaveError, type FormSaveResult } from "@/patterns/form-state"
import { BulkRequestError, type BulkItemResult } from "@/patterns/bulk-selection"

import {
  createDb,
  defaultListFilters,
  matchesConditions,
  metricStatus,
  summarize,
  type AnalysisConditions,
  type ListFilters,
  type MetricId,
  type PiCustomer,
} from "./model"

export type PiKind =
  | "list"
  | "detail"
  | "save"
  | "bulk"
  | "lookup"
  | "summary"
  | "details"
  | "access"
  | "login"
  | "notifications"
  | "read"
  | "settings"
  | "import"
  | "probe"
  | "status"
  | "delete"
  | "contact"
  | "export"

export type Permission = "view" | "edit" | "delete" | "export"
export type SaveMode = "success" | "failed" | "invalid" | "conflict" | "unknown" | "forbidden"
export type ItemOutcome = "succeeded" | "failed" | "unknown" | "forbidden"
/** full：件数と行ごとの結果をすべて返す。incomplete：作成の件数だけを返す（失敗の件数と行ごとの結果を返さない） */
export type ImportMode = "full" | "incomplete"
export type ServiceHealth = "operational" | "degraded" | "outage"

export type PiRequest = { seq: number; kind: PiKind; ws: string | null; key: string; payload?: unknown; settled: boolean; aborted: boolean }
export type Held = { seq: number; kind: PiKind; ws: string | null; key: string; release: () => void }
export type HeldFilter = { kind?: PiKind; ws?: string; key?: string; seq?: number }

export type PiNotification = {
  id: string
  ws: string
  userId: string
  title: string
  /** 対象の顧客（通知から詳細へ移動する） */
  customerId: string | null
  createdAt: string
  read: boolean
}

const allPermissions: Permission[] = ["view", "edit", "delete", "export"]

function initialPermissions(): Record<string, Record<string, Permission[]>> {
  return {
    // 佐藤：本社営業部と九州支店のすべての操作
    "u-sato": { hq: [...allPermissions], kyushu: [...allPermissions] },
    // 田中：本社営業部の閲覧だけ
    "u-tanaka": { hq: ["view"] },
  }
}

let notificationSeq = 100
function initialNotifications(): PiNotification[] {
  const base = (id: string, userId: string, ws: string, title: string, customerId: string | null, minutes: number, read = false): PiNotification => ({
    id,
    ws,
    userId,
    title,
    customerId,
    createdAt: new Date(Date.parse("2026-11-28T09:00:00+09:00") - minutes * 60_000).toISOString(),
    read,
  })
  return [
    base("n1", "u-sato", "hq", "株式会社アオバ商事の契約が更新されました", "c01", 5),
    base("n2", "u-sato", "hq", "株式会社イズミ製作所の担当者が変わりました", "c02", 30),
    base("n3", "u-sato", "hq", "株式会社エニシ建設から問い合わせがありました", "c04", 90, true),
    base("n4", "u-sato", "kyushu", "アオバ商事九州の請求書を発行しました", "c01", 15),
    base("n5", "u-tanaka", "hq", "閲覧の権限が付与されました", null, 60),
  ]
}

export type PiSettings = { email: boolean; contract: boolean; digest: boolean }

const config = {
  db: createDb(),
  latency: { list: 120, detail: 120, save: 300, bulk: 300, lookup: 200, summary: 200, details: 150, access: 120, login: 200, notifications: 120, read: 150, settings: 200, import: 300, probe: 50, status: 200, delete: 200, contact: 200, export: 100 } as Record<PiKind, number>,
  hold: {} as Partial<Record<PiKind, boolean>>,
  held: [] as Held[],
  requests: [] as PiRequest[],
  saveMode: "success" as SaveMode,
  /** 結果が不明の保存・一括操作で、サーバーが実際には処理を終えていたか */
  unknownApplied: true,
  /** 一括操作の ID ごとの結果（指定のない ID は成功）。一度失敗した ID は、次の実行では成功する（retry の検品） */
  bulkOutcomes: {} as Record<string, ItemOutcome>,
  /** 一括操作で、サーバーが実際に処理した ID（重複の実行がないことの検品） */
  processed: [] as string[],
  /** 一覧と詳細の取得の結果 */
  listMode: "success" as "success" | "failed",
  importMode: "full" as ImportMode,
  services: { analysis: "operational", export: "operational", notifications: "operational" } as Record<"analysis" | "export" | "notifications", ServiceHealth>,
  permissions: initialPermissions(),
  notifications: initialNotifications(),
  settings: {} as Record<string, PiSettings>,
  /** 設定の保存の結果 */
  settingsMode: "success" as "success" | "failed" | "unknown",
  /** サーバーのセッション。null はログインしていない */
  session: null as null | { userId: string; token: number },
  /** 接続の確認（probe）の結果 */
  probeOk: true,
  /** 詳細の「停止にする」とその取り消しの結果 */
  statusMode: "success" as "success" | "failed",
  /** 連絡の記録の保存の結果 */
  contactMode: "success" as "success" | "failed",
  /** 取り込みの要求ごとの行の結果（照会に使う） */
  imports: {} as Record<string, { ws: string; rows: ImportRowRecord[] }>,
  /** ワークスペースごとの次の顧客の番号 */
  nextId: {} as Record<string, number>,
  /** 初回のセットアップを終えた利用者 */
  setupDone: [] as string[],
}
let seq = 0
let sessionToken = 0

type Listener = (event: PiEvent) => void
export type PiEvent =
  | { type: "session-expired" }
  | { type: "notification"; notification: PiNotification }
  | { type: "permissions-changed"; userId: string; ws: string }
  | { type: "services-changed" }
const listeners = new Set<Listener>()
export function subscribePi(fn: Listener) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
const emit = (e: PiEvent) => listeners.forEach((l) => l(e))

/** 描画が終わるまで待つ（固定の時間ではなく、タスク 1 つと描画のフレーム 2 つ） */
const settleFrames = async () => {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

async function release(filter: HeldFilter = {}) {
  const match = (h: Held) =>
    (filter.kind === undefined || h.kind === filter.kind) &&
    (filter.ws === undefined || h.ws === filter.ws) &&
    (filter.key === undefined || h.key === filter.key) &&
    (filter.seq === undefined || h.seq === filter.seq)
  const released = config.held.filter(match)
  config.held = config.held.filter((h) => !match(h))
  for (const h of released) h.release()
  await settleFrames()
  return released.length
}

/** 要求を記録し、応答の時間を待つ。保留が有効な種類は release() まで応答しない（AbortSignal を無視する） */
function receive(kind: PiKind, ws: string | null, key: string, payload?: unknown, signal?: AbortSignal) {
  const req: PiRequest = { seq: ++seq, kind, ws, key, payload, settled: false, aborted: false }
  config.requests.push(req)
  const done = () => (req.settled = true)
  const promise = new Promise<PiRequest>((resolve, reject) => {
    if (config.hold[kind]) {
      config.held.push({ seq: req.seq, kind, ws, key, release: () => resolve(req) })
      signal?.addEventListener("abort", () => (req.aborted = true))
      return
    }
    if (signal?.aborted) {
      req.aborted = true
      return reject(new DOMException("aborted", "AbortError"))
    }
    const t = window.setTimeout(() => resolve(req), config.latency[kind])
    signal?.addEventListener("abort", () => {
      req.aborted = true
      window.clearTimeout(t)
      reject(new DOMException("aborted", "AbortError"))
    })
  })
  return promise.finally(done)
}

export class PiAuthError extends Error {
  status: 401 | 403
  constructor(status: 401 | 403, message: string) {
    super(message)
    this.status = status
    this.name = "PiAuthError"
  }
}

const sessionUser = () => config.session?.userId ?? null
function can(userId: string | null, ws: string, permission: Permission) {
  if (!userId) return false
  return (config.permissions[userId]?.[ws] ?? []).includes(permission)
}
/** 要求の時点のセッションと権限を確かめる。応答を待つ前（受け付けた時点）と、応答の直前の両方で確かめる */
function authorize(ws: string, permission: Permission, token?: number) {
  if (!config.session || (token !== undefined && config.session.token !== token)) throw new PiAuthError(401, "ログインの有効期限が切れました")
  if (!can(config.session.userId, ws, permission)) throw new PiAuthError(403, "この操作の権限がありません")
}
const currentToken = () => config.session?.token

const rows = (ws: string) => config.db[ws] ?? []
const clone = <T,>(v: T): T => structuredClone(v)

// ---------------------------------------------------------------- 一覧と詳細
export type ListQuery = {
  search: string
  filters: ListFilters
  sorting: { id: string; desc: boolean }[]
  pagination: { pageIndex: number; pageSize: number }
}
export type ListPage = { rows: PiCustomer[]; total: number; offset: number }

function filterRows(ws: string, search: string, filters: ListFilters) {
  const s = search.trim()
  return rows(ws).filter(
    (c) =>
      (!s || c.name.includes(s) || c.email.includes(s)) &&
      (filters.status === null || c.status === filters.status) &&
      (filters.region === null || c.region === filters.region)
  )
}

export async function fetchCustomers(ws: string, q: ListQuery, signal: AbortSignal): Promise<ListPage> {
  const token = currentToken()
  authorize(ws, "view", token)
  // 受け付けた時点のデータで応答を決める
  const all = filterRows(ws, q.search, q.filters ?? defaultListFilters)
  const sort = q.sorting[0]
  if (sort) {
    const dir = sort.desc ? -1 : 1
    all.sort((a, b) => {
      const av = a[sort.id as keyof PiCustomer]
      const bv = b[sort.id as keyof PiCustomer]
      return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "ja")) * dir
    })
  }
  const { pageIndex, pageSize } = q.pagination
  const page: ListPage = { rows: clone(all.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)), total: all.length, offset: pageIndex * pageSize }
  const fail = config.listMode === "failed"
  await receive("list", ws, JSON.stringify(q), q, signal)
  if (fail) throw new Error("一覧を取得できませんでした")
  return page
}

/** エクスポート。要求の時点のセッションとエクスポートの権限を確かめる（受け付けた時点と応答の直前） */
export async function exportCustomers(ws: string, target: { ids: string[] } | { search: string; filters: ListFilters }) {
  const token = currentToken()
  authorize(ws, "export", token)
  const list = ("ids" in target ? rows(ws).filter((c) => target.ids.includes(c.id)) : filterRows(ws, target.search, target.filters)).map(clone)
  await receive("export", ws, JSON.stringify(target), target)
  authorize(ws, "export", token)
  return list
}

/** 一覧の検索条件に一致する ID（全件の選択の確定と、件数の表示に使う） */
export function matchingIds(ws: string, search: string, filters: ListFilters) {
  return filterRows(ws, search, filters).map((c) => c.id)
}

export async function fetchCustomer(ws: string, id: string, signal?: AbortSignal): Promise<PiCustomer | null> {
  const token = currentToken()
  authorize(ws, "view", token)
  const found = rows(ws).find((c) => c.id === id)
  const snapshot = found ? clone(found) : null
  const fail = config.listMode === "failed"
  await receive("detail", ws, id, undefined, signal)
  authorize(ws, "view", token)
  if (fail) throw new Error("顧客を取得できませんでした")
  return snapshot
}

/** 画面の描画のための同期の参照（模擬のサーバーのデータ。権限は確かめない。検品と製品側の表示の補助だけに使う） */
export const peekCustomer = (ws: string, id: string) => rows(ws).find((c) => c.id === id) ?? null

export type CustomerValues = { name: string; email: string; phone: string; plan: string; status: PiCustomer["status"]; note: string }

/** 保存。成功の結果には、保存した後の版（version）を含める（続けて保存するときの競合の確認に使う） */
export async function saveCustomer(ws: string, id: string, values: CustomerValues, version: number): Promise<FormSaveResult<CustomerValues> & { version?: number }> {
  const token = currentToken()
  const mode = config.saveMode
  try {
    authorize(ws, "edit", token)
  } catch (e) {
    if (e instanceof PiAuthError && e.status === 403) return { status: "failed", formError: "この顧客を編集する権限がありません。管理者に権限を確認してください。" }
    throw new FormSaveError("ログインの有効期限が切れたため、保存されたかを確認できません。", "unknown")
  }
  const target = rows(ws).find((c) => c.id === id)
  const apply = () => {
    if (!target) return
    Object.assign(target, values, { version: target.version + 1 })
  }
  await receive("save", ws, id, values)
  if (!target) return { status: "failed", formError: "顧客が削除されたため、保存できませんでした。" }
  if (mode === "forbidden" || !can(sessionUser(), ws, "edit"))
    return { status: "failed", formError: "この顧客を編集する権限がありません。管理者に権限を確認してください。" }
  if (mode === "failed") return { status: "failed", formError: "サーバーで問題が起きたため、保存できませんでした。もう一度保存してください。" }
  if (mode === "invalid") return { status: "invalid", fieldErrors: { email: "このメールアドレスは別の顧客が使っています" } }
  if (mode === "conflict" || target.version !== version)
    return { status: "invalid", formError: "ほかの利用者がこの顧客を変更しました。最新の内容を確かめてから、もう一度保存してください。" }
  if (mode === "unknown") {
    if (config.unknownApplied) apply()
    // 応答が届かなかった（通信の切断）。保存されたかはわからない
    throw new Error("network: connection closed")
  }
  apply()
  return { status: "success", values, version: target.version }
}

/** 保存の結果が不明な場合の照会。現在のセッションと閲覧の権限で応答する（権限がなければ、保存されたかも返さない） */
export async function lookupCustomer(ws: string, id: string): Promise<PiCustomer | null> {
  const token = currentToken()
  authorize(ws, "view", token)
  const found = rows(ws).find((c) => c.id === id)
  const snapshot = found ? clone(found) : null
  await receive("lookup", ws, id)
  authorize(ws, "view", token)
  return snapshot
}

/** 1 件の状態の変更（詳細の「停止にする」と、その取り消し） */
export async function setCustomerStatus(ws: string, id: string, status: PiCustomer["status"]) {
  const token = currentToken()
  try {
    authorize(ws, "edit", token)
  } catch (e) {
    throw new FormSaveError(e instanceof Error ? e.message : "変更できませんでした", "failed")
  }
  const mode = config.statusMode
  await receive("status", ws, `${id}:${status}`, { id, status })
  if (mode === "failed") throw new FormSaveError("サーバーで問題が起きたため、変更できませんでした。", "failed")
  const c = rows(ws).find((r) => r.id === id)
  if (!c) throw new FormSaveError("顧客が見つかりません", "failed")
  c.status = status
  c.version++
  return { ws, id }
}

export async function deleteCustomer(ws: string, id: string) {
  const token = currentToken()
  authorize(ws, "delete", token)
  await receive("delete", ws, id)
  authorize(ws, "delete", token)
  config.db[ws] = rows(ws).filter((c) => c.id !== id)
}

/** 連絡の記録の追加 */
export async function addContact(ws: string, id: string, text: string) {
  const token = currentToken()
  const mode = config.contactMode
  authorize(ws, "edit", token)
  await receive("contact", ws, id, text)
  if (mode === "failed") throw new Error("サーバーで問題が起きたため、記録を保存できませんでした。")
  const c = rows(ws).find((r) => r.id === id)
  if (!c) throw new Error("顧客が見つかりません")
  c.contacts = [text, ...c.contacts]
}

// ---------------------------------------------------------------- 初回のセットアップ
export async function completeSetup(userId: string, displayName: string) {
  await receive("settings", null, `setup:${userId}`, { displayName })
  if (!config.setupDone.includes(userId)) config.setupDone.push(userId)
}
export const isSetupDone = (userId: string) => config.setupDone.includes(userId)

// ---------------------------------------------------------------- 一括操作（停止にする）
export async function pauseCustomers(ws: string, ids: string[]): Promise<BulkItemResult[]> {
  const token = currentToken()
  try {
    authorize(ws, "edit", token)
  } catch (e) {
    throw new BulkRequestError(e instanceof Error ? e.message : "実行できませんでした", e instanceof PiAuthError && e.status === 403 ? "failed" : "unknown")
  }
  const outcomes = Object.fromEntries(ids.map((id) => [id, config.bulkOutcomes[id] ?? "succeeded"])) as Record<string, ItemOutcome>
  await receive("bulk", ws, ids.join(","), ids)
  const results: BulkItemResult[] = []
  for (const id of ids) {
    const c = rows(ws).find((r) => r.id === id)
    const outcome = outcomes[id]
    if (!c) {
      results.push({ id, outcome: "failed", message: "顧客が見つかりません", retryable: false })
      continue
    }
    if (outcome === "forbidden") {
      results.push({ id, outcome: "failed", message: "この顧客を変更する権限がありません", retryable: false })
      continue
    }
    if (outcome === "failed") {
      // 一度失敗した ID は、次の実行では成功させる
      delete config.bulkOutcomes[id]
      results.push({ id, outcome: "failed", message: "ほかの処理と重なったため、変更できませんでした" })
      continue
    }
    if (outcome === "unknown") {
      delete config.bulkOutcomes[id]
      if (config.unknownApplied) {
        c.status = "paused"
        c.version++
        config.processed.push(id)
      }
      results.push({ id, outcome: "unknown", message: "結果を受け取れませんでした" })
      continue
    }
    c.status = "paused"
    c.version++
    config.processed.push(id)
    results.push({ id, outcome: "succeeded" })
  }
  return results
}

/** 一括操作の結果が不明な ID の状態の照会（停止になっているか）。現在の権限で応答する */
export async function lookupPaused(ws: string, ids: string[]): Promise<Record<string, boolean>> {
  const token = currentToken()
  authorize(ws, "view", token)
  const snapshot = Object.fromEntries(ids.map((id) => [id, rows(ws).find((c) => c.id === id)?.status === "paused"]))
  await receive("lookup", ws, ids.join(","), ids)
  authorize(ws, "view", token)
  return snapshot
}

// ---------------------------------------------------------------- 分析
export async function fetchSummary(ws: string, cond: AnalysisConditions, signal: AbortSignal) {
  const token = currentToken()
  authorize(ws, "view", token)
  const health = config.services.analysis
  const result = summarize(rows(ws), cond)
  await receive("summary", ws, JSON.stringify(cond), cond, signal)
  // 応答の直前にも、要求のセッションと閲覧の権限を確かめる（fetchCustomer と同じ）
  authorize(ws, "view", token)
  if (health === "outage") throw new Error("分析のサービスで障害が起きています")
  return result
}

/** 指標の明細。指標の業務上の定義（metricStatus）と、分析で使った条件で、同じデータから抽出する */
export async function fetchMetricDetails(ws: string, metric: MetricId, cond: AnalysisConditions, signal: AbortSignal) {
  const token = currentToken()
  authorize(ws, "view", token)
  const list = rows(ws)
    .filter((c) => c.status === metricStatus[metric] && matchesConditions(c, cond))
    .map(clone)
  await receive("details", ws, JSON.stringify([metric, cond]), { metric, cond }, signal)
  authorize(ws, "view", token)
  return list
}

// ---------------------------------------------------------------- 認証と認可
export async function login(email: string, password: string, userId: string | undefined) {
  await receive("login", null, email)
  if (!userId || password !== "flow-design") return { ok: false as const }
  config.session = { userId, token: ++sessionToken }
  return { ok: true as const, userId }
}
export function logout() {
  config.session = null
}

/** 現在の認可の取得（画面の表示と操作の可否に使う）。要求の時点の権限を返す */
export async function fetchAccess(ws: string, signal?: AbortSignal) {
  const token = currentToken()
  const userId = sessionUser()
  if (!userId) throw new PiAuthError(401, "ログインしていません")
  const perms = [...(config.permissions[userId]?.[ws] ?? [])]
  await receive("access", ws, userId, undefined, signal)
  if (currentToken() !== token) throw new PiAuthError(401, "ログインの有効期限が切れました")
  return { userId, ws, permissions: perms }
}

// ---------------------------------------------------------------- 通知
export async function fetchNotifications(ws: string, signal?: AbortSignal) {
  const token = currentToken()
  const userId = sessionUser()
  if (!userId) throw new PiAuthError(401, "ログインしていません")
  const list = config.notifications.filter((n) => n.ws === ws && n.userId === userId).map(clone)
  await receive("notifications", ws, userId, undefined, signal)
  if (currentToken() !== token) throw new PiAuthError(401, "ログインの有効期限が切れました")
  return list
}

/** 既読・未読の変更。ids の通知だけを変える（一括既読は、開始の時点の範囲の ID を渡す） */
export async function setNotificationsRead(ws: string, ids: string[], read: boolean) {
  const userId = sessionUser()
  if (!userId) throw new PiAuthError(401, "ログインしていません")
  const targets = config.notifications.filter((n) => n.ws === ws && n.userId === userId && ids.includes(n.id))
  await receive("read", ws, `${read}:${ids.join(",")}`, { ids, read })
  for (const n of targets) n.read = read
  return targets.map((n) => n.id)
}

// ---------------------------------------------------------------- 設定（通知の設定）
const defaultSettings: PiSettings = { email: true, contract: true, digest: false }
export async function fetchSettings(userId: string) {
  const s = clone(config.settings[userId] ?? defaultSettings)
  await receive("settings", null, `get:${userId}`)
  return s
}
export async function saveSetting<K extends keyof PiSettings>(userId: string, key: K, value: PiSettings[K]) {
  const mode = config.settingsMode
  await receive("settings", null, `set:${userId}:${key}`, { key, value })
  // 確定した失敗（サーバーが処理を拒否した）。結果が不明（応答が届かない）は下の通信の例外
  if (mode === "failed") throw new FormSaveError("サーバーが保存を受け付けませんでした", "failed")
  const next = { ...(config.settings[userId] ?? defaultSettings), [key]: value }
  config.settings[userId] = next
  if (mode === "unknown") throw new Error("network: connection closed")
  return clone(next)
}

// ---------------------------------------------------------------- 取り込み
export type ImportRow = { name: string; email: string; plan: string }
/** 取り込み。メールアドレスの形式が正しくない行は失敗にする。importMode が incomplete の場合は、件数の一部だけを返す（結果の完全性を確かめられない） */
export type ImportRowRecord = { row: number; outcome: "created" | "failed"; reason?: string }

/**
 * 取り込み。importId は製品が作る要求の ID（同じ取り込みの照会に使う。応答を受け取れなかった場合も照会できる）。
 * サーバーは行ごとの結果を importId ごとに記録する
 */
export async function importCustomers(ws: string, importId: string, list: ImportRow[]) {
  const token = currentToken()
  authorize(ws, "edit", token)
  const mode = config.importMode
  await receive("import", ws, importId, list)
  const records: ImportRowRecord[] = []
  list.forEach((r, i) => {
    if (!/^[^\s@]+@[^\s@]+$/.test(r.email)) {
      records.push({ row: i + 1, outcome: "failed", reason: "メールアドレスの形式が正しくありません" })
      return
    }
    // ID はワークスペースごとの連番（削除の後も、使った番号を使い直さない）
    const n = config.nextId[ws] ?? Math.max(0, ...rows(ws).map((c) => Number(c.id.slice(1)) || 0)) + 1
    config.nextId[ws] = n + 1
    rows(ws).push({
      id: `c${String(n).padStart(2, "0")}`,
      name: r.name,
      region: "東京",
      plan: r.plan || "light",
      status: "active",
      mrr: r.plan === "enterprise" ? 98000 : r.plan === "standard" ? 29800 : 9800,
      email: r.email,
      phone: "",
      note: "",
      contacts: [],
      version: 1,
    })
    records.push({ row: i + 1, outcome: "created" })
  })
  config.imports[importId] = { ws, rows: records }
  const created = records.filter((r) => r.outcome === "created").length
  if (mode === "incomplete") {
    // 件数の一部（失敗の件数）と行ごとの結果を返さない
    return { created }
  }
  return { created, updated: 0, skipped: 0, failed: records.length - created, rows: records }
}

/**
 * 取り込みの結果の照会。現在のセッションと閲覧の権限で応答する。
 * サーバーが要求を受け付けていない場合は null（どの行も取り込んでいない）
 */
export async function lookupImport(ws: string, importId: string) {
  const token = currentToken()
  authorize(ws, "view", token)
  const record = config.imports[importId]
  const snapshot = record && record.ws === ws ? clone(record.rows) : null
  await receive("lookup", ws, importId)
  authorize(ws, "view", token)
  return snapshot
}

// ---------------------------------------------------------------- 接続の確認
export async function probe(signal?: AbortSignal) {
  const ok = config.probeOk
  await receive("probe", null, "probe", undefined, signal)
  if (!ok) throw new Error("probe failed")
  return true
}

// ---------------------------------------------------------------- 検品の操作（window.__fdPi）
function reset() {
  config.db = createDb()
  config.hold = {}
  config.held = []
  config.requests = []
  config.saveMode = "success"
  config.unknownApplied = true
  config.bulkOutcomes = {}
  config.processed = []
  config.listMode = "success"
  config.importMode = "full"
  config.services = { analysis: "operational", export: "operational", notifications: "operational" }
  config.permissions = initialPermissions()
  config.notifications = initialNotifications()
  config.settings = {}
  config.settingsMode = "success"
  config.session = null
  config.probeOk = true
  config.contactMode = "success"
  config.statusMode = "success"
  config.imports = {}
  config.nextId = {}
  config.setupDone = []
}

export const piControl = {
  config,
  release,
  reset,
  settle: settleFrames,
  /** 受け付けた要求（種類で絞る） */
  requests: (kind?: PiKind) => config.requests.filter((r) => kind === undefined || r.kind === kind),
  /** 保留中の応答 */
  heldList: () => config.held.map(({ seq, kind, ws, key }) => ({ seq, kind, ws, key })),
  setPermissions(userId: string, ws: string, permissions: Permission[]) {
    config.permissions[userId] = { ...(config.permissions[userId] ?? {}), [ws]: permissions }
    emit({ type: "permissions-changed", userId, ws })
  },
  /** サーバーのセッションを失効させる（次の要求は 401。画面にも知らせる） */
  expireSession() {
    config.session = null
    emit({ type: "session-expired" })
  },
  /** 新着の通知をサーバーで作り、購読中の画面へ送る */
  pushNotification(ws: string, userId: string, title: string, customerId: string | null = null) {
    const n: PiNotification = { id: `n${++notificationSeq}`, ws, userId, title, customerId, createdAt: new Date().toISOString(), read: false }
    config.notifications.push(n)
    emit({ type: "notification", notification: clone(n) })
    return n.id
  },
  setService(name: keyof typeof config.services, health: ServiceHealth) {
    config.services[name] = health
    emit({ type: "services-changed" })
  },
  /** サーバーのデータを直接変える（ほかの利用者の変更） */
  updateCustomer(ws: string, id: string, patch: Partial<PiCustomer>) {
    const c = rows(ws).find((r) => r.id === id)
    if (c) Object.assign(c, patch, { version: c.version + 1 })
  },
  customer: (ws: string, id: string) => clone(rows(ws).find((r) => r.id === id) ?? null),
  summary: (ws: string, cond: AnalysisConditions) => summarize(rows(ws), cond),
}

declare global {
  interface Window {
    __fdPi?: typeof piControl & Record<string, unknown>
  }
}
if (typeof window !== "undefined") window.__fdPi = piControl
