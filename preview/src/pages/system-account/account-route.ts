import { membershipOf, workspaces, type Permission, type UserId, type WorkspaceId } from "../../data/system-account/model"

// System & Account の統合の検証画面のルーティング（製品側のコード）。Registry には含めない。
// URL：#/account-app?page=customers&ws=hq（ログインの後の画面）、#/account-app?start=invited（ログインの前の開き方）。
// ログインの状態（セッション）は URL に入れない。画面のメモリだけに持つ（再読み込みするとログインの画面に戻る）。

export const APP = "#/account-app"

export type AccountPage = "home" | "customers" | "customer" | "notifications" | "settings" | "members" | "jobs" | "status"
export const accountPages: readonly AccountPage[] = ["home", "customers", "customer", "notifications", "settings", "members", "jobs", "status"]

/** ログインの前の開き方 */
export type AccountStart = "signin" | "invited" | "signup" | "return" | "sso"
export const accountStarts: readonly AccountStart[] = ["signin", "invited", "signup", "return", "sso"]

export type AccountRoute = {
  /** 既知のページ以外の値もそのまま持つ（存在しないページの表示のため） */
  page: string
  ws: string
  id: string | null
  /** 設定のカテゴリ */
  cat: string | null
  start: AccountStart
}

export function readAccountRoute(hash = window.location.hash): AccountRoute {
  const p = new URLSearchParams(hash.split("?")[1] ?? "")
  const start = p.get("start")
  return {
    page: p.get("page") ?? "home",
    ws: p.get("ws") ?? "hq",
    id: p.get("id"),
    cat: p.get("cat"),
    start: accountStarts.includes(start as AccountStart) ? (start as AccountStart) : "signin",
  }
}

export function accountHref(route: Partial<Omit<AccountRoute, "start">> & { start?: AccountStart }) {
  const p = new URLSearchParams()
  if (route.start && route.start !== "signin") p.set("start", route.start)
  if (route.page) p.set("page", route.page)
  if (route.ws) p.set("ws", route.ws)
  if (route.id) p.set("id", route.id)
  if (route.cat) p.set("cat", route.cat)
  const q = p.toString()
  return q ? `${APP}?${q}` : APP
}

// Object のプロトタイプの名前（constructor など）をワークスペースとして扱わない
export const isWorkspaceId = (v: string): v is WorkspaceId => Object.hasOwn(workspaces, v)

/** ページを開くのに必要な権限（製品の判断の例）。null はログインしていれば開ける */
export const pagePermission: Record<AccountPage, Permission | null> = {
  home: null,
  customers: "customers.view",
  customer: "customers.view",
  notifications: null,
  settings: null,
  members: "members.view",
  jobs: "customers.view",
  status: null,
}

/** 設定のカテゴリと、閲覧に必要な権限（設定の画面の settingsCategories と同じ判断） */
const settingsCategoryPermission: Record<string, Permission | null> = {
  profile: null,
  display: null,
  notifications: null,
  security: null,
  organization: "settings.org.view",
  members: "members.view",
}

/**
 * 認証の後の移動先（検証したパス）を、この画面の URL に変える。
 * /w/hq/home、/w/hq/customers、/w/hq/customers/C-00001、/w/hq/settings/members（メンバーと権限）、
 * /w/hq/settings/category/profile（設定のカテゴリ）、/w/hq/settings、/w/hq/notifications、/w/hq/jobs、/w/hq/status に対応する。
 * 対応しないパスは null（呼び出し側がホームへ移す）。
 */
export function parseAccountPath(path: string): (Partial<AccountRoute> & { ws: string; page: AccountPage }) | null {
  const m = /^\/w\/([^/?#]+)(\/[^?#]*)?$/.exec(path)
  if (!m) return null
  const ws = m[1]
  const rest = m[2] ?? "/home"
  const customer = /^\/customers\/([A-Z]-\d{5})$/.exec(rest)
  if (customer) return { ws, page: "customer", id: customer[1] }
  const category = /^\/settings\/category\/([a-z-]+)$/.exec(rest)
  if (category && Object.hasOwn(settingsCategoryPermission, category[1])) return { ws, page: "settings", cat: category[1] }
  if (rest === "/settings/members") return { ws, page: "members" }
  const simple: Record<string, AccountPage> = {
    "/home": "home",
    "/customers": "customers",
    "/settings": "settings",
    "/notifications": "notifications",
    "/jobs": "jobs",
    "/status": "status",
  }
  return Object.hasOwn(simple, rest) ? { ws, page: simple[rest] } : null
}

/** 認証の後の移動先（検証したパス）を、この画面の URL に変える。対応しないパスはホーム */
export function routeFromPath(path: string): Partial<AccountRoute> {
  const ws = /^\/w\/([^/?#]+)/.exec(path)?.[1]
  return parseAccountPath(path) ?? (ws ? { ws, page: "home" } : { page: "home" })
}

/**
 * 再認証の後に戻る位置（同じ利用者の場合だけ使う）。設定のカテゴリ、お知らせ、処理の状況、稼働状況も含める
 * （含めないと、設定の画面で入力していた利用者がホームへ移り、入力が失われたことに気づきにくい）
 */
export function pathFromRoute(route: AccountRoute) {
  const base = `/w/${route.ws}`
  if (route.page === "customer" && route.id) return `${base}/customers/${route.id}`
  if (route.page === "customers") return `${base}/customers`
  if (route.page === "members") return `${base}/settings/members`
  if (route.page === "settings") return route.cat && Object.hasOwn(settingsCategoryPermission, route.cat) ? `${base}/settings/category/${route.cat}` : `${base}/settings`
  if (route.page === "notifications" || route.page === "jobs" || route.page === "status") return `${base}/${route.page}`
  return `${base}/home`
}

/**
 * 認証の後の復帰先を、この利用者が開いてよいか（resolveReturnTo の isAllowed）。所属、ページの権限（pagePermission）、
 * 設定のカテゴリの権限を、現在の認可（permissionsOf）で判断する。ページのアクセスの判断と同じ表を使う（AUTH-1、AUTH-2）。
 */
export function canOpenAccountPath(userId: UserId, path: string, permissionsOf: (userId: UserId, workspaceId: WorkspaceId) => readonly Permission[]) {
  const target = parseAccountPath(path)
  if (!target || !canEnterWorkspace(userId, target.ws)) return false
  const permissions = permissionsOf(userId, target.ws)
  const needed = [pagePermission[target.page], target.page === "settings" && target.cat ? settingsCategoryPermission[target.cat] : null]
  return needed.every((p) => p === null || permissions.includes(p))
}

/** 利用者が所属しているワークスペースか。所属していないワークスペースの URL を、そのまま信頼しない */
export const canEnterWorkspace = (userId: UserId, ws: string): ws is WorkspaceId => isWorkspaceId(ws) && membershipOf(userId, ws) !== null
