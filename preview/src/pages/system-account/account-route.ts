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

/**
 * 認証の後の移動先（auth-server の destinationFor が検証したパス）を、この画面の URL に変える。
 * /w/hq/home、/w/hq/customers、/w/hq/customers/C-00001、/w/hq/settings/members に対応する。
 */
export function routeFromPath(path: string): Partial<AccountRoute> {
  const m = /^\/w\/([^/?#]+)(\/[^?#]*)?/.exec(path)
  if (!m) return { page: "home" }
  const ws = m[1]
  const rest = m[2] ?? "/home"
  const customer = /^\/customers\/([A-Z]-\d{5})$/.exec(rest)
  if (customer) return { ws, page: "customer", id: customer[1] }
  if (rest === "/customers") return { ws, page: "customers" }
  if (rest === "/settings/members") return { ws, page: "members" }
  return { ws, page: "home" }
}

/** 再認証の後に戻る位置（同じ利用者の場合だけ使う） */
export function pathFromRoute(route: AccountRoute) {
  if (route.page === "customer" && route.id) return `/w/${route.ws}/customers/${route.id}`
  if (route.page === "customers") return `/w/${route.ws}/customers`
  if (route.page === "members") return `/w/${route.ws}/settings/members`
  return `/w/${route.ws}/home`
}

/** 利用者が所属しているワークスペースか。所属していないワークスペースの URL を、そのまま信頼しない */
export const canEnterWorkspace = (userId: UserId, ws: string): ws is WorkspaceId => isWorkspaceId(ws) && membershipOf(userId, ws) !== null
