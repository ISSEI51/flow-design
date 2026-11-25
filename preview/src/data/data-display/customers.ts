// Data Display のプレビュー用の架空の顧客データ。実在の企業とは関係がない。
// 乱数は種を固定しているため、毎回同じデータになる（検品で件数や並び順を確かめられる）。

export type ContractStatus = "active" | "trial" | "paused" | "cancelled"

export type Customer = {
  id: string
  company: string
  status: ContractStatus
  owner: string
  region: string
  industry: string
  /** 月額（円）。未設定は null。0 は無料のプラン */
  monthlyFee: number | null
  seats: number
  /** 次の更新日（YYYY-MM-DD）。未定は null */
  renewalDate: string | null
  phone: string
  email: string
  note: string | null
}

export const statusOptions: { value: ContractStatus; label: string }[] = [
  { value: "active", label: "契約中" },
  { value: "trial", label: "試用中" },
  { value: "paused", label: "休止中" },
  { value: "cancelled", label: "解約済み" },
]
export const statusLabel = Object.fromEntries(statusOptions.map((s) => [s.value, s.label])) as Record<ContractStatus, string>

export const owners = ["佐藤 美咲", "鈴木 健太", "高橋 由紀", "田中 翔", "伊藤 彩", "渡辺 大輔"]
export const regions = ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州・沖縄"]
const industries = ["製造業", "情報通信業", "卸売業、小売業", "建設業", "医療、福祉", "教育、学習支援業", "運輸業、郵便業"]

const prefixes = ["株式会社", "有限会社", "合同会社", ""]
const stems = [
  "青葉", "朝日", "桜井", "みなと", "北斗", "若草", "こもれび", "山吹", "白樺", "東雲", "瑞穂", "千歳", "銀河", "ひだまり",
  "Blue Harbor", "Northwind", "Kite & Co.", "Lumen", "Maple", "Orbit",
]
const suffixes = ["製作所", "商事", "システムズ", "工業", "物流", "ソリューションズ", "フーズ", "メディカル", "設計", "Labs"]

// 長い名前（日本語・英語）。折り返しと省略の確認用。
const longNames = [
  "株式会社東日本総合物流サービスホールディングス・アンド・パートナーズ",
  "International Precision Instruments and Advanced Manufacturing Solutions Ltd.",
  "医療法人社団 こもれび会 地域連携在宅医療推進センター",
]

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function makeCustomers(count: number): Customer[] {
  const rand = seeded(20261125)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const list: Customer[] = []
  for (let i = 0; i < count; i++) {
    const n = i + 1
    const company =
      i < longNames.length * 97 && i % 97 === 13 ? longNames[Math.floor(i / 97) % longNames.length] : `${pick(prefixes)}${pick(stems)}${pick(suffixes)}`
    const r = rand()
    const status: ContractStatus = r < 0.56 ? "active" : r < 0.72 ? "trial" : r < 0.86 ? "paused" : "cancelled"
    const seats = 3 + Math.floor(rand() * 240)
    const fee = rand()
    const monthlyFee = fee < 0.07 ? null : fee < 0.11 ? 0 : Math.round((8 + rand() * 180) * 1000) * (status === "trial" ? 0 : 1)
    const month = 1 + Math.floor(rand() * 12)
    const day = 1 + Math.floor(rand() * 28)
    const renewalDate =
      status === "cancelled" || rand() < 0.06 ? null : `${rand() < 0.5 ? 2026 : 2027}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    list.push({
      id: `C-${String(n).padStart(5, "0")}`,
      company: company.trim() || `顧客 ${n}`,
      status,
      owner: pick(owners),
      region: pick(regions),
      industry: pick(industries),
      monthlyFee,
      seats,
      renewalDate,
      phone: `0${3 + Math.floor(rand() * 6)}-${String(1000 + Math.floor(rand() * 8999))}-${String(1000 + Math.floor(rand() * 8999))}`,
      email: `contact${n}@example.com`,
      note: rand() < 0.2 ? "請求書は月末締め、翌月 10 日に郵送。担当の変更は事前に連絡が必要。" : null,
    })
  }
  return list
}

export const customers: Customer[] = makeCustomers(580)

const yen = new Intl.NumberFormat("ja-JP")
export const formatYen = (n: number) => `${yen.format(n)}円`
export const formatDate = (iso: string) => iso.replaceAll("-", "/")

// ---------------------------------------------------------------- サーバー側の処理の模擬
// 実際の API やデータベースは使わない。遅延と失敗を再現し、古い応答による上書きの防止を確かめる。

export type CustomerQuery = {
  search: string
  status: ContractStatus | null
  owner: string | null
  regions: string[]
  sort: { id: "company" | "monthlyFee" | "seats" | "renewalDate"; desc: boolean } | null
  pageIndex: number
  pageSize: number
}

export type CustomerPage = { rows: Customer[]; total: number }

type MockConfig = {
  /** 応答までの時間（ms）。検索語ごとに変えられる */
  latency: (query: CustomerQuery) => number
  /** 次の要求を失敗させる */
  failNext: boolean
  /** 受け付けた要求の数（検品用） */
  requests: CustomerQuery[]
}

export const mockServer: MockConfig = {
  latency: () => 400 + Math.floor(Math.random() * 400),
  failNext: false,
  requests: [],
}

declare global {
  interface Window {
    __fdMockServer?: MockConfig
  }
}
if (typeof window !== "undefined") window.__fdMockServer = mockServer

export function queryCustomers(q: CustomerQuery, source: readonly Customer[] = customers): CustomerPage {
  const search = q.search.trim().toLowerCase()
  let rows = source.filter(
    (c) =>
      (!search || c.company.toLowerCase().includes(search)) &&
      (!q.status || c.status === q.status) &&
      (!q.owner || c.owner === q.owner) &&
      (q.regions.length === 0 || q.regions.includes(c.region))
  )
  if (q.sort) {
    const { id, desc } = q.sort
    // 欠損値は向きに関係なく最後に置く。
    rows = [...rows].sort((a, b) => {
      const x = a[id]
      const y = b[id]
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ja")
      return desc ? -r : r
    })
  }
  const start = q.pageIndex * q.pageSize
  return { rows: rows.slice(start, start + q.pageSize), total: rows.length }
}

export function fetchCustomers(q: CustomerQuery, signal?: AbortSignal): Promise<CustomerPage> {
  mockServer.requests.push(q)
  const fail = mockServer.failNext
  mockServer.failNext = false
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (fail) reject(new Error("サーバーに接続できませんでした（模擬）"))
      else resolve(queryCustomers(q))
    }, mockServer.latency(q))
    signal?.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("aborted", "AbortError"))
    })
  })
}

// カーソル方式の模擬。総件数を返さず、次と前のカーソルだけを返す。
export function fetchCustomersByCursor(cursor: string | null, pageSize: number) {
  const start = cursor ? customers.findIndex((c) => c.id === cursor) : 0
  const rows = customers.slice(start, start + pageSize)
  const next = customers[start + pageSize]?.id ?? null
  const prev = start > 0 ? customers[Math.max(start - pageSize, 0)].id : null
  return { rows, next, prev }
}
