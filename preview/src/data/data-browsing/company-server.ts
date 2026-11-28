// Data Browsing のプレビュー用の模擬のサーバー。実際の API やデータベースは使わない。Registry には含めない。
// 遅延、失敗、件数の有無、一括操作の部分的な失敗と結果の不明を再現し、Patterns の挙動を確かめる。
// 検証のための遅延は、ここ（プレビュー）だけで設定する。Registry の部品は遅延を持たない。

import type { BrowseQuery } from "@/patterns/browse-query"
import { BulkRequestError, type BulkItemResult, type BulkRunContext, type BulkRunResponse, type BulkTarget } from "@/patterns/bulk-selection"

import { customers as seedCustomers, type ContractStatus, type Customer } from "../data-display/customers"

export type CompanyFilters = {
  status: ContractStatus | null
  owner: string | null
  regions: string[]
  /** 月額の範囲（円）。null は指定なし */
  feeMin: number | null
  feeMax: number | null
  /** 更新日の範囲（YYYY-MM-DD） */
  renewalFrom: string | null
  renewalTo: string | null
}

export const defaultCompanyFilters: CompanyFilters = {
  status: null,
  owner: null,
  regions: [],
  feeMin: null,
  feeMax: null,
  renewalFrom: null,
  renewalTo: null,
}

export type CompanyQuery = BrowseQuery<CompanyFilters>

export type CompanyPage = {
  rows: Customer[]
  /** 正確な総件数。件数を返さない設定では null */
  total: number | null
  /** 次のページがあるか（総件数がない場合に使う） */
  hasNextPage: boolean
  /** ページの先頭の位置（0 から） */
  offset: number
}

export type Activity = { id: string; date: string; kind: string; note: string }

export type Workspace = { id: string; name: string }
export const workspaces: Workspace[] = [
  { id: "hq", name: "本社営業部" },
  { id: "kyushu", name: "九州支店" },
  { id: "new", name: "新しいワークスペース（データなし）" },
]

type LatencyKind = "list" | "detail" | "activity" | "update" | "bulk"

/** 保留した応答（検品用）。release() を呼ぶまで応答しない */
export type HeldResponse = { kind: LatencyKind; workspace: string; key: string; release: (fail?: boolean) => void }
export type HeldFilter = Partial<Pick<HeldResponse, "kind" | "workspace" | "key">>

export type BulkMode = "success" | "partial" | "fail" | "unknown" | "request-unknown" | "request-fail" | "incomplete"

type ServerConfig = {
  /** 応答までの時間（ms） */
  latency: Record<LatencyKind, number>
  /** 詳細の取得の時間を ID ごとに変える（取得の競合の検品） */
  detailLatency: Record<string, number>
  /** 次の要求を失敗させる */
  failNext: Partial<Record<LatencyKind, boolean>>
  /** 取引の履歴（部分的な取得）を常に失敗させる */
  activityAlwaysFails: boolean
  /** 総件数を返さない */
  countMode: "exact" | "unknown"
  /** 一括操作の結果 */
  bulkMode: BulkMode
  /** 一括操作で、実際の進捗を報告する */
  bulkReportsProgress: boolean
  /** 受け付けた要求（検品用） */
  requests: { kind: LatencyKind; workspace: string; key: string }[]
  /** 一括操作で実際に処理した ID（重複の実行がないことの検品用） */
  processed: string[]
  /** 一度失敗した ID。再試行では成功させる（権限がない行を除く） */
  failedBefore: Set<string>
  /**
   * 応答を保留する種類（検品用）。true の種類の要求は、応答の時間（latency）を使わず、release() を呼ぶまで応答しない。
   * 保留した要求は AbortSignal を無視する（中止を無視して処理を続け、後から応答を返すサーバーを再現する）。
   * 一括操作では、進捗の報告は続け、最後の応答（結果）だけを保留する。
   */
  hold: Partial<Record<LatencyKind, boolean>>
  /** 保留中の応答（受け付けた順） */
  held: HeldResponse[]
}

const initialConfig = (): ServerConfig => ({
  latency: { list: 600, detail: 400, activity: 700, update: 500, bulk: 900 },
  detailLatency: {},
  failNext: {},
  activityAlwaysFails: false,
  countMode: "exact",
  bulkMode: "success",
  bulkReportsProgress: true,
  requests: [],
  processed: [],
  failedBefore: new Set(),
  hold: {},
  held: [],
})

export const companyServer: ServerConfig & {
  reset: () => void
  remove: (workspace: string, id: string) => void
  release: (filter?: HeldFilter, options?: { fail?: boolean }) => Promise<number>
} = Object.assign(initialConfig(), {
  reset() {
    Object.assign(companyServer, initialConfig())
    resetStore()
  },
  remove: (workspace: string, id: string) => removeCompany(workspace, id),
  release: (filter?: HeldFilter, options?: { fail?: boolean }) => releaseHeld(filter, options),
})

/**
 * 保留中の応答のうち、条件に一致するもの（指定がなければすべて）を受け付けた順に返す（検品用）。返した件数を返す。
 * 応答を受け取った処理（Promise の後続）と、その結果の描画が終わってから解決する（固定の待機時間を使わない）：
 * タスクを 1 つ待って Promise の後続を終わらせ、描画のフレームを 2 つ待って React の反映を終わらせる。
 * fail を指定すると、保留した応答を失敗として返す（要求の時点では決まっていない失敗。StrictMode の 2 回目の要求などにも使える）。
 */
async function releaseHeld(filter: HeldFilter = {}, { fail = false }: { fail?: boolean } = {}) {
  const match = (h: HeldResponse) =>
    (filter.kind === undefined || h.kind === filter.kind) &&
    (filter.workspace === undefined || h.workspace === filter.workspace) &&
    (filter.key === undefined || h.key === filter.key)
  const released = companyServer.held.filter(match)
  companyServer.held = companyServer.held.filter((h) => !match(h))
  for (const h of released) h.release(fail)
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return released.length
}

declare global {
  interface Window {
    __fdBrowseServer?: typeof companyServer
  }
}
if (typeof window !== "undefined") window.__fdBrowseServer = companyServer

// ワークスペースごとのデータ。ほかのプレビューのページと共有しないよう、写しを持つ。
let store: Record<string, Customer[]> = {}
function resetStore() {
  store = {
    hq: seedCustomers.map((c) => ({ ...c })),
    kyushu: seedCustomers.filter((c) => c.region === "九州・沖縄").map((c) => ({ ...c, id: c.id.replace("C-", "K-") })),
    new: [],
  }
}
resetStore()

export const companiesOf = (workspace: string) => store[workspace] ?? []

/** ほかの利用者が行を削除した場合を再現する（検品用） */
export function removeCompany(workspace: string, id: string) {
  store[workspace] = companiesOf(workspace).filter((c) => c.id !== id)
}

function wait<T>(
  kind: LatencyKind,
  signal: AbortSignal | undefined,
  produce: () => T,
  latency?: number,
  meta: { workspace: string; key: string } = { workspace: "", key: "" }
): Promise<T> {
  const fail = companyServer.failNext[kind]
  companyServer.failNext[kind] = false
  return new Promise((resolve, reject) => {
    const respond = (failNow = false) => {
      if (fail || failNow) reject(new Error("サーバーに接続できませんでした（模擬）"))
      else {
        try {
          resolve(produce())
        } catch (e) {
          reject(e)
        }
      }
    }
    // 保留：release() まで応答しない。AbortSignal も無視する。
    if (companyServer.hold[kind]) {
      companyServer.held.push({ kind, ...meta, release: respond })
      return
    }
    const timer = setTimeout(respond, latency ?? companyServer.latency[kind])
    signal?.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("aborted", "AbortError"))
    })
  })
}

const digits = (s: string) => s.replace(/[^0-9]/g, "")

/** 条件に一致する行（並べ替え済み）。ページ送りの前 */
export function matchCompanies(workspace: string, q: Pick<CompanyQuery, "search" | "filters" | "sorting">) {
  const search = q.search.trim().toLowerCase()
  const f = q.filters
  let rows = companiesOf(workspace).filter((c) => {
    if (search) {
      const phone = digits(search)
      const byName = c.company.toLowerCase().includes(search)
      const byPhone = phone.length >= 3 && digits(c.phone).includes(phone)
      if (!byName && !byPhone) return false
    }
    if (f.status && c.status !== f.status) return false
    if (f.owner && c.owner !== f.owner) return false
    if (f.regions.length && !f.regions.includes(c.region)) return false
    if (f.feeMin !== null && (c.monthlyFee === null || c.monthlyFee < f.feeMin)) return false
    if (f.feeMax !== null && (c.monthlyFee === null || c.monthlyFee > f.feeMax)) return false
    if (f.renewalFrom && (!c.renewalDate || c.renewalDate < f.renewalFrom)) return false
    if (f.renewalTo && (!c.renewalDate || c.renewalDate > f.renewalTo)) return false
    return true
  })
  const sort = q.sorting[0]
  if (sort) {
    const id = sort.id as keyof Customer
    rows = [...rows].sort((a, b) => {
      const x = a[id]
      const y = b[id]
      // 欠損値は向きに関係なく最後に置く。
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ja")
      return sort.desc ? -r : r
    })
  }
  return rows
}

export function listCompanies(workspace: string, q: CompanyQuery, signal?: AbortSignal): Promise<CompanyPage> {
  const key = JSON.stringify(q)
  companyServer.requests.push({ kind: "list", workspace, key })
  return wait(
    "list",
    signal,
    () => {
      const rows = matchCompanies(workspace, q)
      const { pageIndex, pageSize } = q.pagination
      const offset = pageIndex * pageSize
      return {
        rows: rows.slice(offset, offset + pageSize),
        total: companyServer.countMode === "exact" ? rows.length : null,
        hasNextPage: offset + pageSize < rows.length,
        offset,
      }
    },
    undefined,
    { workspace, key }
  )
}

export function getCompany(workspace: string, id: string, signal?: AbortSignal): Promise<Customer> {
  companyServer.requests.push({ kind: "detail", workspace, key: id })
  return wait(
    "detail",
    signal,
    () => {
      const c = companiesOf(workspace).find((x) => x.id === id)
      if (!c) throw new Error("この顧客は見つかりませんでした。削除された可能性があります。")
      return { ...c }
    },
    companyServer.detailLatency[id],
    { workspace, key: id }
  )
}

const kinds = ["訪問", "電話", "メール", "見積もりの送付", "契約の更新"]
export function getActivity(workspace: string, id: string, signal?: AbortSignal): Promise<Activity[]> {
  companyServer.requests.push({ kind: "activity", workspace, key: id })
  if (companyServer.activityAlwaysFails) companyServer.failNext.activity = true
  return wait("activity", signal, () => {
    const n = Number(id.replace(/\D/g, "")) || 1
    return Array.from({ length: 1 + (n % 4) }, (_, i) => ({
      id: `${id}-a${i}`,
      date: `2026-${String(11 - i).padStart(2, "0")}-${String(((n + i * 7) % 27) + 1).padStart(2, "0")}`,
      kind: kinds[(n + i) % kinds.length],
      note: i === 0 ? "次回の更新の条件を相談した。" : "担当者と連絡を取った。",
    }))
  })
}

export type CompanyPatch = Partial<Pick<Customer, "owner" | "status" | "note">>

export function updateCompany(workspace: string, id: string, patch: CompanyPatch): Promise<Customer> {
  companyServer.requests.push({ kind: "update", workspace, key: id })
  return wait("update", undefined, () => {
    const c = companiesOf(workspace).find((x) => x.id === id)
    if (!c) throw new Error("この顧客は見つかりませんでした")
    Object.assign(c, patch)
    return { ...c }
  })
}

export function createCompany(workspace: string, input: Pick<Customer, "company" | "owner" | "status">): Promise<Customer> {
  return wait("update", undefined, () => {
    const list = companiesOf(workspace)
    const prefix = workspace === "kyushu" ? "K-" : workspace === "new" ? "N-" : "C-"
    const c: Customer = {
      id: `${prefix}${String(90000 + list.length + 1).padStart(5, "0")}`,
      company: input.company,
      status: input.status,
      owner: input.owner,
      region: "関東",
      industry: "情報通信業",
      monthlyFee: null,
      seats: 1,
      renewalDate: null,
      phone: "03-0000-0000",
      email: "new@example.com",
      note: null,
    }
    list.unshift(c)
    return { ...c }
  })
}

// 一括操作。対象の確定はサーバーが行う（全件の選択では、条件と除外した ID から対象を求める）。
// bulkMode で結果を変える。partial は、ID の末尾の数字が 3 の倍数の行を失敗にする（権限がない行は再試行できない）。
// 一度処理した ID は processed に記録し、同じ操作の重複を検品で確かめる。
export function runCompanyBulk(
  workspace: string,
  target: BulkTarget<CompanyQuery>,
  apply: (c: Customer) => void,
  context: BulkRunContext,
  deleteRows = false
): Promise<BulkRunResponse> {
  companyServer.requests.push({ kind: "bulk", workspace, key: JSON.stringify(target) })
  const mode = companyServer.bulkMode
  const ids =
    target.kind === "ids"
      ? target.ids
      : matchCompanies(workspace, target.query)
          .map((c) => c.id)
          .filter((id) => !target.excludedIds.includes(id))
  const total = ids.length
  const step = companyServer.latency.bulk / 4
  // 要求そのものを受け付けない（処理していない）場合。
  if (mode === "request-fail") {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new BulkRequestError("サーバーが要求を受け付けませんでした（模擬）", "failed")), step)
    )
  }
  // 保留（検品用）：進捗の報告は続け、最後の応答だけを release() まで保留する。AbortSignal は無視する。
  const held = companyServer.hold.bulk === true
  return new Promise((resolve, reject) => {
    let done = 0
    const tick = () => {
      // 待機を中止した場合：処理済みの行があるかもしれないため、結果が不明として返す。
      if (context.signal.aborted && !held) {
        reject(new BulkRequestError("処理の待機を中止しました（模擬）", "unknown"))
        return
      }
      done = Math.min(total, done + Math.ceil(total / 4))
      if (companyServer.bulkReportsProgress) context.reportProgress(done, total)
      if (done < total) {
        setTimeout(tick, step)
        return
      }
      if (held) companyServer.held.push({ kind: "bulk", workspace, key: JSON.stringify(target), release: finish })
      else finish()
    }
    const finish = () => {
      if (mode === "request-unknown") {
        reject(new BulkRequestError("通信が途中で切れました（模擬）", "unknown"))
        return
      }
      const list = companiesOf(workspace)
      const results: BulkItemResult[] = ids.map((id, i) => {
        const n = Number(id.replace(/\D/g, ""))
        const locked = mode === "partial" && n % 9 === 0
        let outcome: BulkItemResult["outcome"] = "succeeded"
        if (locked) outcome = "failed"
        else if (companyServer.failedBefore.has(id)) outcome = "succeeded"
        else if (mode === "fail") outcome = "failed"
        else if (mode === "partial" && n % 3 === 0) outcome = "failed"
        else if (mode === "unknown" && i % 4 === 3) outcome = "unknown"
        if (outcome === "failed") {
          companyServer.failedBefore.add(id)
          return locked
            ? { id, outcome, message: "この顧客を変更する権限がありません", retryable: false }
            : { id, outcome, message: "ほかの利用者が編集中のため、変更できませんでした" }
        }
        // 結果が不明な行も、サーバーでは処理が終わっている（通信だけが途中で切れた）場合を再現する。
        companyServer.processed.push(id)
        const c = list.find((x) => x.id === id)
        if (c) apply(c)
        return { id, outcome }
      })
      // incomplete：結果の一部を返さず、対象ではない ID の結果と、重複した結果を混ぜる（結果の完全性の検品）。
      let reported = results
      if (mode === "incomplete" && results.length > 0) {
        reported = [...results.slice(0, -1), results[0], { id: "X-99999", outcome: "succeeded" }]
      }
      if (deleteRows) {
        const removed = new Set(results.filter((r) => r.outcome !== "failed").map((r) => r.id))
        store[workspace] = list.filter((c) => !removed.has(c.id))
      }
      // 全件の選択（query）では、バックエンドが確定した対象の件数を返す（API の契約）。
      resolve(target.kind === "query" ? { items: reported, confirmedCount: ids.length } : reported)
    }
    setTimeout(tick, step)
  })
}

// ---------------------------------------------------------------- 表示形式ごとの取得
// Kanban：契約状況ごとの件数と、各列の先頭（並べ替えの順）の行。Calendar：表示期間の月の更新日。

export type BoardColumn = { status: ContractStatus; total: number; rows: Customer[] }

export function listBoard(
  workspace: string,
  q: Pick<CompanyQuery, "search" | "filters" | "sorting">,
  perColumn: number,
  signal?: AbortSignal
): Promise<BoardColumn[]> {
  const key = `board:${JSON.stringify(q)}`
  companyServer.requests.push({ kind: "list", workspace, key })
  return wait(
    "list",
    signal,
    () => {
      const rows = matchCompanies(workspace, q)
      const order: ContractStatus[] = ["trial", "active", "paused", "cancelled"]
      return order.map((status) => {
        const all = rows.filter((c) => c.status === status)
        return { status, total: all.length, rows: all.slice(0, perColumn) }
      })
    },
    undefined,
    { workspace, key }
  )
}

export function listRenewals(
  workspace: string,
  q: Pick<CompanyQuery, "search" | "filters">,
  month: string,
  signal?: AbortSignal
): Promise<Customer[]> {
  const key = `calendar:${month}:${JSON.stringify(q)}`
  companyServer.requests.push({ kind: "list", workspace, key })
  return wait(
    "list",
    signal,
    () => matchCompanies(workspace, { ...q, sorting: [{ id: "renewalDate", desc: false }] }).filter((c) => c.renewalDate?.startsWith(month)),
    undefined,
    { workspace, key }
  )
}
