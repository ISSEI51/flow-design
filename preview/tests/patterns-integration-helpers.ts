import { expect, type Page } from "@playwright/test"

// Patterns の横断の検証画面（#/patterns-integration）の検品の共通の操作。
// 模擬のサーバーは window.__fdPi（preview/src/data/patterns-integration/server.ts の piControl）。
// 時間で待たない：応答の保留と解放（hold、release）、要求の件数、画面の状態で待つ。

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

export const APP = "/#/patterns-integration"

/** window.__fdPi の関数を呼ぶ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pi = <T = unknown>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as any).__fdPi[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>

/** window.__fdPi.config の値を変える */
export const setConfig = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate((p) => Object.assign((window as unknown as { __fdPi: { config: Record<string, unknown> } }).__fdPi.config, p), patch)

export const hold = (page: Page, kind: PiKind, on = true) =>
  page.evaluate(([k, v]) => ((window as unknown as { __fdPi: { config: { hold: Record<string, boolean> } } }).__fdPi.config.hold[k as string] = v as boolean), [kind, on] as const)

/** 保留中の応答を解放する（応答の後の描画が終わってから解決する） */
export const release = (page: Page, filter: { kind?: PiKind; ws?: string; key?: string; seq?: number } = {}) => pi<number>(page, "release", filter)

export const requests = (page: Page, kind?: PiKind) =>
  pi<{ seq: number; kind: string; ws: string | null; key: string; payload?: unknown; settled: boolean; aborted: boolean }[]>(page, "requests", kind)

/** 保留中の応答。クライアントが待機を中止した要求（StrictMode の 2 回目の effect の前に中止した取得など）を除く */
export const heldList = async (page: Page) => {
  const aborted = new Set((await requests(page)).filter((r) => r.aborted).map((r) => r.seq))
  return (await pi<{ seq: number; kind: string; ws: string | null; key: string }[]>(page, "heldList")).filter((h) => !aborted.has(h.seq))
}

export const users = {
  sato: { id: "u-sato", email: "sato@example.com", name: "佐藤 美咲" },
  tanaka: { id: "u-tanaka", email: "tanaka@example.com", name: "田中 健" },
}

/** ログインの画面でログインする */
export async function signIn(page: Page, email = users.sato.email) {
  const form = page.getByTestId("pi-login")
  await expect(form).toBeVisible()
  const field = form.getByLabel("メールアドレス")
  if ((await field.getAttribute("readonly")) === null) await field.fill(email)
  await form.getByLabel("パスワード", { exact: true }).fill("flow-design")
  await form.getByRole("button", { name: "ログイン", exact: true }).click()
}

/**
 * 画面を開いてログインする。setup：初回のセットアップを済ませた状態にする（既定）。
 * route：ログインの後に開く画面（例 "page=customers"）。ログインの後の復帰先として渡す
 */
export async function openApp(
  page: Page,
  { route = "page=analysis", user = users.sato, setupDone = true, prepare }: { route?: string; user?: { id: string; email: string }; setupDone?: boolean; prepare?: () => Promise<unknown> } = {}
) {
  await page.goto(`${APP}?${route}`)
  await page.waitForFunction(() => Boolean((window as unknown as { __fdPi?: unknown }).__fdPi))
  // ログインの前に、模擬のサーバーのデータと設定を整える（最初の取得から反映する）
  await prepare?.()
  if (setupDone) await page.evaluate((id) => (window as unknown as { __fdPi: { config: { setupDone: string[] } } }).__fdPi.config.setupDone.push(id), user.id)
  await signIn(page, user.email)
  if (setupDone) await expect(page.getByTestId("pi-app")).toBeVisible()
}

/** 顧客の一覧の表の行 */
export const row = (page: Page, name: string) => page.getByRole("row").filter({ has: page.getByRole("button", { name, exact: true }) })

/** 一覧の取得が終わった（件数の表示がある） */
export async function listReady(page: Page) {
  await expect(page.getByTestId("pi-customers")).toBeVisible()
  await expect(page.getByRole("cell", { name: /円$/ }).first()).toBeVisible()
}

/** Sidebar の項目を押す（モバイルでは Sheet を開いてから） */
export async function sidebarGo(page: Page, name: string) {
  const isMobile = await page.evaluate(() => window.innerWidth < 768)
  if (isMobile) await page.getByRole("banner").getByRole("button", { name: "メニュー" }).click()
  await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name, exact: true }).click()
}

/** 横方向にページがスクロールしない（文書の幅が表示領域を超えない） */
export const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("[data-testid=pi-main]")
    return document.documentElement.scrollWidth <= window.innerWidth && (!main || main.scrollWidth <= main.clientWidth)
  })
