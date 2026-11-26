// Forms & Workflows のプレビュー用の模擬のサーバー。実際の API やデータベースは使わない。Registry には含めない。
// 遅延、保存の失敗、サーバー側の検証のエラー、結果の不明、取り込みの部分的な失敗を再現し、Patterns の挙動を確かめる。
// 検証のための遅延と失敗は、ここ（プレビュー）だけで設定する（window.__fdFormsServer）。Registry の部品は遅延を持たない。
// 保存した値は、このページを開いている間のメモリにだけ残る。実際には保存していない。

import type { FormSaveResult } from "@/patterns/form-state"

export type SaveMode = "success" | "fail" | "invalid" | "unknown"
export type ActionMode = "success" | "fail"
export type ImportMode = "success" | "partial" | "fail" | "unknown"

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

export const formsServer = {
  latency: { save: 700, check: 500, autofill: 900, action: 600, import: 1200, draft: 300 },
  saveMode: "success" as SaveMode,
  actionMode: "success" as ActionMode,
  undoMode: "success" as ActionMode,
  importMode: "partial" as ImportMode,
  /** 即時保存（Switch）を失敗させる */
  instantFails: false,
  /** 自動保存を失敗させる */
  autosaveFails: false,
  requests: [] as ServerRequest[],
}

declare global {
  interface Window {
    __fdFormsServer?: typeof formsServer
  }
}
if (typeof window !== "undefined") window.__fdFormsServer = formsServer

const log = (kind: string, payload?: unknown) => formsServer.requests.push({ kind, at: Date.now(), payload })

export function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
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

const seed: Customer[] = [
  ["C-0001", "corporate", "株式会社山田商事", "山田", "太郎", "yamada@example.com", "03-1234-5678", "1000001", "東京都千代田区千代田 1-1", "standard"],
  ["C-0002", "corporate", "有限会社佐藤工業", "佐藤", "花子", "sato@example.com", "06-2345-6789", "5300001", "大阪府大阪市北区梅田 2-2", "light"],
  ["C-0003", "individual", "", "鈴木", "一郎", "suzuki@example.net", "090-1111-2222", "", "", "light"],
  ["C-0004", "corporate", "高橋システム株式会社", "高橋", "美咲", "takahashi@example.co.jp", "", "4600008", "愛知県名古屋市中区栄 3-3", "enterprise"],
  ["C-0005", "corporate", "株式会社田中物流", "田中", "翔", "tanaka@example.com", "092-333-4444", "8100001", "福岡県福岡市中央区天神 4-4", "standard"],
].map(([code, kind, company, lastName, firstName, email, phone, zip, address, plan], i) => ({
  id: `cu-${i + 1}`,
  code,
  kind: kind as Customer["kind"],
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

let customers: Customer[] = seed.map((c) => ({ ...c }))
let seq = seed.length

/** 検証画面の状態を最初に戻す（検品のため） */
export function resetFormsServer() {
  customers = seed.map((c) => ({ ...c }))
  seq = seed.length
  formsServer.requests.length = 0
  Object.assign(formsServer, { saveMode: "success", actionMode: "success", undoMode: "success", importMode: "partial", instantFails: false, autosaveFails: false })
}

export const listCustomers = (archived = false) => customers.filter((c) => c.archived === archived)
export const getCustomer = (id: string) => customers.find((c) => c.id === id) ?? null
export const customerName = (c: Pick<Customer, "kind" | "company" | "lastName" | "firstName">) =>
  c.kind === "corporate" ? c.company : `${c.lastName} ${c.firstName}`

// ---------------------------------------------------------------- 非同期の検証と自動補完
/** 顧客コードの重複の確認 */
export async function checkCustomerCode(code: string, { signal, exceptId }: { signal?: AbortSignal; exceptId?: string } = {}) {
  log("check-code", code)
  await wait(formsServer.latency.check, signal)
  return customers.some((c) => c.code === code && c.id !== exceptId) ? `顧客コード「${code}」は登録済みです。別のコードを入力してください` : null
}

const zipTable: Record<string, string> = {
  "1000001": "東京都千代田区千代田",
  "1500001": "東京都渋谷区神宮前",
  "5300001": "大阪府大阪市北区梅田",
  "4600008": "愛知県名古屋市中区栄",
  "8100001": "福岡県福岡市中央区天神",
}

/** 郵便番号から住所を探す（自動補完） */
export async function lookupZip(zip: string, signal?: AbortSignal) {
  log("lookup-zip", zip)
  await wait(formsServer.latency.autofill, signal)
  return zipTable[zip.replace("-", "")] ?? null
}

// ---------------------------------------------------------------- 保存
type CustomerInput = Partial<Omit<Customer, "id" | "archived">>

function saveOutcome<V extends Record<string, unknown>>(values: Partial<V>, duplicateField?: keyof V): FormSaveResult<V> | null {
  if (formsServer.saveMode === "fail")
    return { status: "failed", formError: "サーバーに接続できませんでした。入力した内容は残っています。時間をおいて、もう一度保存してください。" }
  if (formsServer.saveMode === "unknown")
    return {
      status: "unknown",
      formError: "応答がないまま時間が過ぎました。保存されたかを確かめられていません。一覧を開いて登録されているかを確認してから、必要な場合だけもう一度保存してください。",
    }
  if (formsServer.saveMode === "invalid" && duplicateField)
    return {
      status: "invalid",
      fieldErrors: { [duplicateField]: "このメールアドレスは、ほかの顧客が使っています（保存の直前に登録されました）。別のメールアドレスを入力してください" } as Partial<Record<keyof V, string>>,
      formError: "保存できませんでした。1 つの項目を確認してください。",
    }
  void values
  return null
}

export async function createCustomer(values: CustomerInput): Promise<FormSaveResult<CustomerInput> & { id?: string }> {
  log("create-customer", values)
  await wait(formsServer.latency.save)
  const failed = saveOutcome<CustomerInput>(values, "email")
  if (failed) {
    // 結果が不明の場合は、実際には保存されていることがある（応答だけが失われた）
    if (failed.status === "unknown") customers.push(normalize({ ...values }, `cu-${++seq}`))
    return failed
  }
  if (customers.some((c) => c.code === values.code))
    return { status: "invalid", fieldErrors: { code: `顧客コード「${values.code}」は登録済みです。別のコードを入力してください` } }
  const created = normalize({ ...values }, `cu-${++seq}`)
  customers.push(created)
  return { status: "success", values: { ...values, email: created.email, company: created.company }, id: created.id }
}

export async function updateCustomer(id: string, values: CustomerInput): Promise<FormSaveResult<CustomerInput>> {
  log("update-customer", { id, values })
  await wait(formsServer.latency.save)
  const failed = saveOutcome<CustomerInput>(values, "email")
  if (failed) return failed
  const i = customers.findIndex((c) => c.id === id)
  if (i === -1) return { status: "failed", formError: "この顧客は削除されています。一覧に戻って確認してください。" }
  customers[i] = { ...customers[i], ...normalize({ ...customers[i], ...values }, id) }
  return { status: "success", values: { ...values, email: customers[i].email } }
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

/** 単一の項目の保存（Inline の編集、即時保存） */
export async function patchCustomer(id: string, patch: CustomerInput) {
  log("patch-customer", { id, patch })
  await wait(formsServer.latency.save)
  if (formsServer.saveMode === "fail") throw new Error("サーバーに接続できませんでした")
  const i = customers.findIndex((c) => c.id === id)
  if (i !== -1) customers[i] = { ...customers[i], ...patch }
}

export async function saveSetting(kind: string, payload: unknown, { fail = false }: { fail?: boolean } = {}) {
  log(`setting-${kind}`, payload)
  await wait(formsServer.latency.save)
  if (fail) throw new Error("保存できませんでした")
}

export async function saveSettingsForm<V extends Record<string, unknown>>(kind: string, values: Partial<V>): Promise<FormSaveResult<V>> {
  log(`settings-${kind}`, values)
  await wait(formsServer.latency.save)
  return saveOutcome<V>(values) ?? { status: "success" }
}

// ---------------------------------------------------------------- 確認と取り消し
export async function archiveCustomer(id: string) {
  log("archive", id)
  await wait(formsServer.latency.action)
  if (formsServer.actionMode === "fail") throw new Error("サーバーに接続できませんでした。時間をおいて、もう一度実行してください。")
  const c = customers.find((x) => x.id === id)
  if (c) c.archived = true
  return id
}

export async function restoreCustomer(id: string) {
  log("restore", id)
  await wait(formsServer.latency.action)
  if (formsServer.undoMode === "fail") throw new Error("サーバーに接続できませんでした。アーカイブ済みの一覧から、もう一度戻してください。")
  const c = customers.find((x) => x.id === id)
  if (c) c.archived = false
}

export async function deleteCustomers(ids: string[]) {
  log("delete", ids)
  await wait(formsServer.latency.action)
  if (formsServer.actionMode === "fail") return { error: "削除できませんでした。サーバーに接続できません。時間をおいて、もう一度実行してください。" }
  customers = customers.filter((c) => !ids.includes(c.id))
  return null
}

export async function deleteWorkspace(name: string) {
  log("delete-workspace", name)
  await wait(formsServer.latency.action)
  if (formsServer.actionMode === "fail") return { error: "削除できませんでした。サーバーに接続できません。時間をおいて、もう一度実行してください。" }
  return null
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
  await wait(formsServer.latency.save)
  if (formsServer.saveMode === "fail") throw new Error("契約を登録できませんでした。入力した内容は残っています。時間をおいて、もう一度登録してください。")
  return `K-${String(Math.floor(Date.now() / 1000) % 100000).padStart(5, "0")}`
}
