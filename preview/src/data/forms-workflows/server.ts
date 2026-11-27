// Forms & Workflows のプレビュー用の模擬のサーバー。実際の API やデータベースは使わない。Registry には含めない。
// 遅延、保存の失敗、サーバー側の検証のエラー、結果の不明、予期しない例外、取り込みの部分的な失敗を再現し、Patterns の挙動を確かめる。
// 検証のための遅延と失敗は、ここ（プレビュー）だけで設定する（window.__fdFormsServer）。Registry の部品は遅延を持たない。
// データはワークスペース（hq、kyushu）ごとに分け、要求の宛先は呼び出し側が明示する（描画の時点の値に頼らない）。
// 保存した値は、このページを開いている間のメモリにだけ残る。実際には保存していない。

import { FormSaveError, type FormSaveResult } from "@/patterns/form-state"

/** throw：予期しない例外（通信の例外など。サーバーで処理が終わっていることがある） */
export type SaveMode = "success" | "fail" | "invalid" | "unknown" | "throw"
export type ActionMode = "success" | "fail" | "unknown"
export type ImportMode = "success" | "partial" | "fail" | "unknown" | "throw" | "inconsistent"
/** 非同期の検証：fail は通信の失敗、timeout は応答しない、ignore-abort は中止を無視して遅れて応答する */
export type CheckMode = "success" | "fail" | "timeout" | "ignore-abort"

export type Customer = {
  id: string
  code: string
  kind: "corporate" | "individual"
  company: string
  lastName: string
  firstName: string
  email: string
  phone: string
  zip: string
  address: string
  plan: string
  start: string
  end: string
  note: string
  archived: boolean
}

export type ServerRequest = { kind: string; at: number; payload?: unknown }

/** 保留できる応答の種類（検品用）。save は保存の要求、check は顧客コードの重複の確認 */
export type HoldKind = "save" | "check"
/** 保留した応答（検品用）。release() を呼ぶまで応答しない。key は要求の種類（save）または確かめた値（check） */
export type HeldResponse = { kind: HoldKind; key: string; release: () => void }
export type HeldFilter = Partial<Pick<HeldResponse, "kind" | "key">>

export const workspaces = [
  { id: "hq", name: "本社営業部" },
  { id: "kyushu", name: "九州支店" },
]
export const workspaceName = (ws: string) => workspaces.find((w) => w.id === ws)?.name ?? ws

export const formsServer = {
  latency: { save: 700, check: 500, autofill: 900, action: 600, import: 1200, draft: 300, list: 200 },
  saveMode: "success" as SaveMode,
  actionMode: "success" as ActionMode,
  undoMode: "success" as ActionMode,
  importMode: "partial" as ImportMode,
  checkMode: "success" as CheckMode,
  /** 即時保存（Switch）の結果 */
  instantMode: "success" as ActionMode,
  /** 自動保存の結果 */
  autosaveMode: "success" as ActionMode,
  /** 一覧の取得の結果（fail：再取得に失敗し、canOperate が false になる） */
  listMode: "success" as "success" | "fail",
  requests: [] as ServerRequest[],
  /** サーバーが応答を返した要求の種類（検品が、固定の時間ではなく応答を待つため） */
  settled: [] as string[],
  /**
   * 応答を保留する種類（検品用）。true の種類の要求は、応答の時間（latency）を使わず、release() を呼ぶまで応答しない。
   * 保留した要求は AbortSignal を無視する（中止を無視して処理を続け、後から応答を返すサーバーを再現する）。
   * 順序が結果を決める検品は、応答の時間や操作の速さを前提にせず、テストの側で解放の順序を決める
   * （Data Browsing の模擬サーバー（company-server.ts）の hold と同じ方式）。
   */
  hold: {} as Partial<Record<HoldKind, boolean>>,
  /** 保留中の応答（受け付けた順） */
  held: [] as HeldResponse[],
  release: (filter?: HeldFilter) => releaseHeld(filter),
}

/**
 * 保留中の応答のうち、条件に一致するもの（指定がなければすべて）を受け付けた順に返す（検品用）。返した件数を返す。
 * 応答を受け取った処理（Promise の後続）と、その結果の描画が終わってから解決する（固定の待機時間を使わない）：
 * タスクを 1 つ待って Promise の後続を終わらせ、描画のフレームを 2 つ待って React の反映を終わらせる。
 */
async function releaseHeld(filter: HeldFilter = {}) {
  const match = (h: HeldResponse) => (filter.kind === undefined || h.kind === filter.kind) && (filter.key === undefined || h.key === filter.key)
  const released = formsServer.held.filter(match)
  formsServer.held = formsServer.held.filter((h) => !match(h))
  for (const h of released) h.release()
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return released.length
}

declare global {
  interface Window {
    __fdFormsServer?: typeof formsServer
  }
}
if (typeof window !== "undefined") window.__fdFormsServer = formsServer

const log = (kind: string, payload?: unknown) => formsServer.requests.push({ kind, at: Date.now(), payload })

/** 応答を待つ。hold を指定し、その種類の保留が有効な場合は、release() まで応答しない（AbortSignal も無視する） */
export function wait(ms: number, signal?: AbortSignal, hold?: { kind: HoldKind; key: string }) {
  return new Promise<void>((resolve, reject) => {
    if (hold && formsServer.hold[hold.kind]) {
      formsServer.held.push({ ...hold, release: () => resolve() })
      return
    }
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"))
    const t = window.setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      window.clearTimeout(t)
      reject(new DOMException("aborted", "AbortError"))
    })
  })
}

export const plans = [
  { value: "light", label: "ライト（月額 9,800円）" },
  { value: "standard", label: "スタンダード（月額 29,800円）" },
  { value: "enterprise", label: "エンタープライズ（個別の見積もり）" },
]
export const planLabel = (v: string) => plans.find((p) => p.value === v)?.label ?? v

type Row = [string, Customer["kind"], string, string, string, string, string, string, string, string]
const toCustomers = (rows: Row[], prefix: string): Customer[] =>
  rows.map(([code, kind, company, lastName, firstName, email, phone, zip, address, plan], i) => ({
    id: `${prefix}-${i + 1}`,
    code,
    kind,
    company,
    lastName,
    firstName,
    email,
    phone,
    zip,
    address,
    plan,
    start: "2026-04-01",
    end: "2027-03-31",
    note: "",
    archived: false,
  }))

const seeds: Record<string, Customer[]> = {
  hq: toCustomers(
    [
      ["C-0001", "corporate", "株式会社山田商事", "山田", "太郎", "yamada@example.com", "03-1234-5678", "1000001", "東京都千代田区千代田 1-1", "standard"],
      ["C-0002", "corporate", "有限会社佐藤工業", "佐藤", "花子", "sato@example.com", "06-2345-6789", "5300001", "大阪府大阪市北区梅田 2-2", "light"],
      ["C-0003", "individual", "", "鈴木", "一郎", "suzuki@example.net", "090-1111-2222", "", "", "light"],
      ["C-0004", "corporate", "高橋システム株式会社", "高橋", "美咲", "takahashi@example.co.jp", "", "4600008", "愛知県名古屋市中区栄 3-3", "enterprise"],
      ["C-0005", "corporate", "株式会社田中物流", "田中", "翔", "tanaka@example.com", "092-333-4444", "8100001", "福岡県福岡市中央区天神 4-4", "standard"],
      ["C-0006", "corporate", "伊藤製作所株式会社", "伊藤", "彩", "ito@example.com", "011-555-0101", "", "", "light"],
      ["C-0007", "corporate", "株式会社渡辺フーズ", "渡辺", "大輔", "watanabe@example.com", "022-555-0202", "", "", "standard"],
      ["C-0008", "individual", "", "中村", "結衣", "nakamura@example.net", "080-3333-4444", "", "", "light"],
    ],
    "cu"
  ),
  // 九州支店には C-0001 がない（顧客コードの重複の確認は、ワークスペースで結果が変わる）
  kyushu: toCustomers(
    [
      ["C-0101", "corporate", "株式会社博多ロジスティクス", "小林", "健", "kobayashi@example.com", "092-111-2222", "8100001", "福岡県福岡市中央区天神 1-2", "standard"],
      ["C-0102", "corporate", "熊本精工株式会社", "加藤", "真理", "kato@example.com", "096-222-3333", "", "", "light"],
      ["C-0103", "individual", "", "吉田", "誠", "yoshida@example.net", "090-5555-6666", "", "", "light"],
    ],
    "ky"
  ),
}

let stores: Record<string, { customers: Customer[]; seq: number }> = {}
function initStores() {
  stores = Object.fromEntries(Object.entries(seeds).map(([ws, rows]) => [ws, { customers: rows.map((c) => ({ ...c })), seq: rows.length }]))
}
initStores()
const db = (ws: string) => stores[ws] ?? (stores[ws] = { customers: [], seq: 0 })
const prefixOf = (ws: string) => (ws === "hq" ? "cu" : ws.slice(0, 2))

/** 検証画面の状態を最初に戻す（検品のため） */
export function resetFormsServer() {
  initStores()
  settings.clear()
  formsServer.requests.length = 0
  formsServer.settled.length = 0
  formsServer.held = []
  formsServer.hold = {}
  Object.assign(formsServer, {
    saveMode: "success",
    actionMode: "success",
    undoMode: "success",
    importMode: "partial",
    checkMode: "success",
    instantMode: "success",
    autosaveMode: "success",
    listMode: "success",
  })
}

export const listCustomers = (archived = false, ws = "hq") => db(ws).customers.filter((c) => c.archived === archived)
export const getCustomer = (id: string, ws = "hq") => db(ws).customers.find((c) => c.id === id) ?? null
export const customerName = (c: Pick<Customer, "kind" | "company" | "lastName" | "firstName">) =>
  c.kind === "corporate" ? c.company : `${c.lastName} ${c.firstName}`

/** 一覧の取得（Data Browsing の useBrowseData に渡す。検索語、ページ、ページの大きさ） */
export async function fetchCustomerPage(
  ws: string,
  q: { search: string; pageIndex: number; pageSize: number },
  { signal }: { signal?: AbortSignal } = {}
) {
  log("list", { ws, ...q })
  await wait(formsServer.latency.list, signal)
  const term = q.search.trim()
  const all = listCustomers(false, ws).filter((c) => !term || `${c.code} ${customerName(c)} ${c.email}`.includes(term))
  return { rows: all.slice(q.pageIndex * q.pageSize, (q.pageIndex + 1) * q.pageSize), total: all.length }
}

// ---------------------------------------------------------------- 非同期の検証と自動補完
/** 顧客コードの重複の確認。ワークスペースごとに結果が変わる */
export async function checkCustomerCode(code: string, { signal, exceptId, ws = "hq" }: { signal?: AbortSignal; exceptId?: string; ws?: string } = {}) {
  log("check-code", { code, ws })
  const mode = formsServer.checkMode
  if (mode === "timeout") return new Promise<string | null>(() => undefined)
  // 中止を無視する検証：signal を渡さずに待ち、遅れて応答する
  await wait(mode === "ignore-abort" ? formsServer.latency.check * 3 : formsServer.latency.check, mode === "ignore-abort" ? undefined : signal, { kind: "check", key: code })
  if (mode === "fail") throw new Error("サーバーに接続できませんでした")
  return db(ws).customers.some((c) => c.code === code && c.id !== exceptId) ? `顧客コード「${code}」は登録済みです。別のコードを入力してください` : null
}

/** 契約の内容の確認（プランと利用人数の組み合わせ。利用人数の検証が、プランにも依存する） */
export async function checkSeats(plan: string | null, seats: string, { signal }: { signal?: AbortSignal } = {}) {
  log("check-seats", { plan, seats })
  await wait(formsServer.latency.check, signal)
  if (formsServer.checkMode === "fail") throw new Error("サーバーに接続できませんでした")
  const max = plan === "light" ? 10 : plan === "standard" ? 100 : 999
  return Number(seats) > max ? `${planLabel(plan ?? "")}の利用人数は ${max} 人までです。プランか人数を変えてください` : null
}

const zipTable: Record<string, string> = {
  "1000001": "東京都千代田区千代田",
  "1500001": "東京都渋谷区神宮前",
  "5300001": "大阪府大阪市北区梅田",
  "4600008": "愛知県名古屋市中区栄",
  "8100001": "福岡県福岡市中央区天神",
}

/** 郵便番号から住所を探す（自動補完）。中止を無視して遅れて応答する（呼び出し側が照合して捨てることを確かめる） */
export async function lookupZip(zip: string, signal?: AbortSignal) {
  log("lookup-zip", zip)
  void signal
  // 1 文字目が 1 の郵便番号は遅く返す（続けて探したときに、応答の順序が入れ替わる）
  await wait(zip.startsWith("1") ? formsServer.latency.autofill * 2 : formsServer.latency.autofill)
  return zipTable[zip.replace("-", "")] ?? null
}

// ---------------------------------------------------------------- 保存
type CustomerInput = Partial<Omit<Customer, "id" | "archived">>

function saveOutcome<V extends Record<string, unknown>>(values: Partial<V>, duplicateField?: keyof V): FormSaveResult<V> | null {
  if (formsServer.saveMode === "fail")
    return { status: "failed", formError: "サーバーが保存を受け付けませんでした。入力した内容は残っています。時間をおいて、もう一度保存してください。" }
  if (formsServer.saveMode === "unknown")
    return {
      status: "unknown",
      formError: "応答がないまま時間が過ぎました。保存されたかを確かめられていません。保存されているかを確認してから、必要な場合だけもう一度保存してください。",
    }
  if (formsServer.saveMode === "throw") throw new TypeError("Failed to fetch")
  if (formsServer.saveMode === "invalid" && duplicateField)
    return {
      status: "invalid",
      fieldErrors: { [duplicateField]: "このメールアドレスは、ほかの顧客が使っています（保存の直前に登録されました）。別のメールアドレスを入力してください" } as Partial<Record<keyof V, string>>,
      formError: "保存できませんでした。1 つの項目を確認してください。",
    }
  void values
  return null
}

export async function createCustomer(values: CustomerInput, ws = "hq"): Promise<FormSaveResult<CustomerInput> & { id?: string }> {
  log("create-customer", { ws, values })
  await wait(formsServer.latency.save, undefined, { kind: "save", key: "create-customer" })
  formsServer.settled.push("create-customer")
  const store = db(ws)
  const mode = formsServer.saveMode
  // 結果が不明、予期しない例外の場合も、実際には保存されていることがある（応答だけが失われた）
  if (mode === "unknown" || mode === "throw") store.customers.push(normalize({ ...values }, `${prefixOf(ws)}-${++store.seq}`))
  const failed = saveOutcome<CustomerInput>(values, "email")
  if (failed) return failed
  if (store.customers.some((c) => c.code === values.code))
    return { status: "invalid", fieldErrors: { code: `顧客コード「${values.code}」は登録済みです。別のコードを入力してください` } }
  const created = normalize({ ...values }, `${prefixOf(ws)}-${++store.seq}`)
  store.customers.push(created)
  return { status: "success", values: { ...values, email: created.email, company: created.company }, id: created.id }
}

export async function updateCustomer(id: string, values: CustomerInput, ws = "hq"): Promise<FormSaveResult<CustomerInput>> {
  log("update-customer", { ws, id, values })
  await wait(formsServer.latency.save, undefined, { kind: "save", key: "update-customer" })
  formsServer.settled.push("update-customer")
  // 予期しない例外（throw）：サーバーは保存したが、応答が届かない（登録の場合と同じ）。unknown は保存しない
  if (formsServer.saveMode === "throw") {
    const store = db(ws)
    const i = store.customers.findIndex((c) => c.id === id)
    if (i !== -1) store.customers[i] = { ...store.customers[i], ...normalize({ ...store.customers[i], ...values }, id), archived: store.customers[i].archived }
  }
  const failed = saveOutcome<CustomerInput>(values, "email")
  if (failed) return failed
  const store = db(ws)
  const i = store.customers.findIndex((c) => c.id === id)
  if (i === -1) return { status: "failed", formError: "この顧客は削除されています。一覧に戻って確認してください。" }
  store.customers[i] = { ...store.customers[i], ...normalize({ ...store.customers[i], ...values }, id), archived: store.customers[i].archived }
  return { status: "success", values: { ...values, email: store.customers[i].email } }
}

/**
 * 送信した値が、サーバーの記録と一致するか（結果が不明の後の確認）。
 * 送信した項目だけを、サーバーが保存する形（normalize）にそろえてから比べる。
 */
export function matchesSavedCustomer(record: Customer, sent: CustomerInput) {
  const expected = normalize({ ...record, ...sent }, record.id)
  return (Object.keys(sent) as (keyof CustomerInput)[]).every((key) => key === "plan" ? (expected.plan || "") === (record.plan || "") : expected[key as keyof Customer] === record[key as keyof Customer])
}

// サーバーが保存する形にそろえる（前後の空白、メールアドレスの小文字）
function normalize(v: CustomerInput, id: string): Customer {
  return {
    id,
    code: v.code ?? "",
    kind: v.kind ?? "corporate",
    company: (v.company ?? "").trim(),
    lastName: (v.lastName ?? "").trim(),
    firstName: (v.firstName ?? "").trim(),
    email: (v.email ?? "").trim().toLowerCase(),
    phone: v.phone ?? "",
    zip: v.zip ?? "",
    address: v.address ?? "",
    plan: v.plan ?? "",
    start: v.start ?? "",
    end: v.end ?? "",
    note: v.note ?? "",
    archived: false,
  }
}

/** 単一の項目の保存（Inline の編集） */
export async function patchCustomer(id: string, patch: CustomerInput, ws = "hq") {
  log("patch-customer", { ws, id, patch })
  await wait(formsServer.latency.save, undefined, { kind: "save", key: "patch-customer" })
  if (formsServer.saveMode === "fail") throw new FormSaveError("サーバーが保存を受け付けませんでした", "failed")
  const store = db(ws)
  const i = store.customers.findIndex((c) => c.id === id)
  if (i !== -1) store.customers[i] = { ...store.customers[i], ...patch }
  if (formsServer.saveMode === "unknown" || formsServer.saveMode === "throw") throw new FormSaveError("保存されたかを確かめられていません", "unknown")
}

// 即時保存と自動保存の設定の値（ワークスペースごと）。結果が不明の場合も、サーバーには反映していることがある
const settings = new Map<string, unknown>()
export const readSetting = <T,>(ws: string, kind: string, fallback: T) => (settings.has(`${ws}:${kind}`) ? (settings.get(`${ws}:${kind}`) as T) : fallback)

export async function saveSetting(kind: string, payload: unknown, { mode = "success", ws = "hq" }: { mode?: ActionMode; ws?: string } = {}) {
  log(`setting-${kind}`, { ws, payload })
  await wait(formsServer.latency.save, undefined, { kind: "save", key: `setting-${kind}` })
  if (mode === "fail") throw new FormSaveError("保存できませんでした", "failed")
  settings.set(`${ws}:${kind}`, payload)
  if (mode === "unknown") throw new FormSaveError("保存されたかを確かめられていません", "unknown")
}

/** 設定の値をサーバーから読み直す（即時保存と自動保存の結果が不明な場合の確認） */
export async function fetchSetting<T>(kind: string, fallback: T, ws = "hq") {
  log(`fetch-setting-${kind}`, { ws })
  await wait(formsServer.latency.action)
  return readSetting(ws, kind, fallback)
}

export async function saveSettingsForm<V extends Record<string, unknown>>(kind: string, values: Partial<V>, ws = "hq"): Promise<FormSaveResult<V>> {
  log(`settings-${kind}`, { ws, values })
  await wait(formsServer.latency.save, undefined, { kind: "save", key: `settings-${kind}` })
  formsServer.settled.push(`settings-${kind}`)
  // 成功と、結果が不明（応答だけが届かない）の場合は、サーバーに反映する。値はワークスペースごとに持つ
  if (formsServer.saveMode === "success" || formsServer.saveMode === "unknown" || formsServer.saveMode === "throw") {
    const key = `${ws}:form-${kind}`
    settings.set(key, { ...((settings.get(key) as object | undefined) ?? {}), ...values })
  }
  return saveOutcome<V>(values) ?? { status: "success" }
}

// ---------------------------------------------------------------- 確認と取り消し
function actionResult(mode: ActionMode, failedMessage: string) {
  if (mode === "fail") throw new FormSaveError(failedMessage, "failed")
  if (mode === "unknown") throw new FormSaveError("処理の結果を確かめられていません。最新の状態を確認してください。", "unknown")
}

export async function archiveCustomer(id: string, ws = "hq") {
  log("archive", { ws, id })
  await wait(formsServer.latency.action)
  if (formsServer.actionMode !== "fail") {
    const c = db(ws).customers.find((x) => x.id === id)
    if (c) c.archived = true
  }
  actionResult(formsServer.actionMode, "アーカイブできませんでした。時間をおいて、もう一度実行してください。")
  return { id, ws }
}

export async function restoreCustomer(id: string, ws = "hq") {
  log("restore", { ws, id })
  await wait(formsServer.latency.action)
  if (formsServer.undoMode !== "fail") {
    const c = db(ws).customers.find((x) => x.id === id)
    if (c) c.archived = false
  }
  actionResult(formsServer.undoMode, "元に戻せませんでした。アーカイブ済みの一覧から、もう一度戻してください。")
}

/** 一括の削除（Data Browsing の useBulkAction の run に渡す。行ごとの結果を返す） */
export async function deleteCustomers(ids: string[], ws = "hq") {
  log("delete", { ws, ids })
  await wait(formsServer.latency.action)
  const mode = formsServer.actionMode
  if (mode === "fail") return ids.map((id) => ({ id, outcome: "failed" as const, message: "サーバーが削除を受け付けませんでした" }))
  const store = db(ws)
  store.customers = store.customers.filter((c) => !ids.includes(c.id))
  // 結果が不明：削除はしたが、最後の行の結果が返らない
  return mode === "unknown" ? ids.slice(0, -1).map((id) => ({ id, outcome: "succeeded" as const })) : ids.map((id) => ({ id, outcome: "succeeded" as const }))
}

export async function deleteCustomer(id: string, ws = "hq") {
  const [result] = await deleteCustomers([id], ws)
  if (!result) throw new FormSaveError("削除されたかを確かめられていません。一覧を更新して確認してください。", "unknown")
  if (result.outcome === "failed") throw new FormSaveError("削除できませんでした。時間をおいて、もう一度実行してください。", "failed")
}

export async function deleteWorkspace(name: string) {
  log("delete-workspace", name)
  await wait(formsServer.latency.action)
  actionResult(formsServer.actionMode, "削除できませんでした。サーバーに接続できません。時間をおいて、もう一度実行してください。")
}

// ---------------------------------------------------------------- 下書き（このページのメモリだけ）
const drafts = new Map<string, { savedAt: Date; data: unknown }>()
export async function saveDraft(key: string, data: unknown) {
  log("save-draft", key)
  await wait(formsServer.latency.draft)
  drafts.set(key, { savedAt: new Date(), data: structuredClone(data) })
  return drafts.get(key)!.savedAt
}
export const readDraft = <T,>(key: string) => drafts.get(key) as { savedAt: Date; data: T } | undefined
export const deleteDraft = (key: string) => drafts.delete(key)

export async function submitContract(payload: unknown) {
  log("submit-contract", payload)
  await wait(formsServer.latency.save, undefined, { kind: "save", key: "submit-contract" })
  if (formsServer.saveMode === "fail") throw new FormSaveError("契約を登録できませんでした。入力した内容は残っています。時間をおいて、もう一度登録してください。", "failed")
  if (formsServer.saveMode === "unknown" || formsServer.saveMode === "throw")
    throw new FormSaveError("契約が登録されたかを確かめられていません。契約の一覧で確認してから、必要な場合だけもう一度登録してください。", "unknown")
  return `K-${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, "0")}`
}
