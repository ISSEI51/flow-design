import { expect, test, type Locator, type Page } from "@playwright/test"

import { mandatoryNotifications, seedNotifications } from "../src/data/system-account/model"
import { collectPageErrors } from "./page-errors"

// Patterns / System & Account / Notifications の検品（資料のページ #/notifications の例）。
// 捕捉されなかった例外と、製品のコードから出たコンソールのエラーを失敗にする（page-errors.ts）。
// 模擬の通知サーバーは window.__fdSaNotificationsServer で設定する（応答の時間、結果、AbortSignal の無視、新着の配信）。
// 応答の順序に依存する検品は、固定の応答時間ではなく、応答の保留と解放（hold / release、holdDeliveries / releaseDeliveries）で
// 順序を決める（要求が保留されたことを heldCount で確かめてから、次の操作をする）。
// 期待値は model.ts の通知のデータと、docs/web/patterns/notifications.md の仕様から決める。
collectPageErrors(test)

type Server = NonNullable<Window["__fdSaNotificationsServer"]>
const server = <T,>(page: Page, fn: (s: Server) => T) =>
  page.evaluate((src) => new Function("s", `return (${src})(s)`)(window.__fdSaNotificationsServer), fn.toString()) as Promise<T>
const serverWith = <A, T>(page: Page, fn: (s: Server, arg: A) => T, arg: A) =>
  page.evaluate(({ src, arg }) => new Function("s", "a", `return (${src})(s, a)`)(window.__fdSaNotificationsServer, arg), { src: fn.toString(), arg }) as Promise<T>
const requests = (page: Page, kind: string) => server(page, (s) => s.requests).then((r) => r.filter((x) => x.kind === kind))
const stored = (page: Page, ws: "hq" | "west") => serverWith(page, (s, w) => s.stored(w), ws)
type Kind = Parameters<Server["release"]>[0]
/** その種類の応答を保留する（release まで返さない） */
const hold = (page: Page, ...kinds: Kind[]) => serverWith(page, (s, ks) => ks.forEach((k) => (s.hold[k] = true)), kinds)
const heldCount = (page: Page, kind: Kind) => serverWith(page, (s, k) => s.heldCount(k), kind)
/** 保留した応答を n 件になるまで待つ（要求が送られたことの確認） */
const waitHeld = (page: Page, kind: Kind, n = 1) => expect.poll(() => heldCount(page, kind)).toBe(n)
const release = (page: Page, kind: Kind, opts: Parameters<Server["release"]>[1] = {}) =>
  serverWith(page, (s, a) => s.release(a.kind, a.opts), { kind, opts })
/** 保留をやめ、保留している応答をすべて解放する */
const releaseAll = (page: Page, kind: Kind) =>
  serverWith(page, (s, k) => {
    s.hold[k] = false
    return s.release(k, { which: "all" })
  }, kind)
const deliveries = (page: Page) => server(page, (s) => s.deliveries)
/** 購読者（label）が、最後の配信を受け付けたか */
const lastAccepted = async (page: Page, label: string) => (await deliveries(page)).at(-1)?.results.find((r) => r.label === label)?.accepted
/** 応答を解放した後、画面の更新（React の描画）が終わるまで待つ（時間ではなく、描画の 2 フレーム） */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))))

const seed = (ws: "hq" | "west") => seedNotifications.filter((n) => n.workspaceId === ws)
const unreadSeed = (ws: "hq" | "west") => seed(ws).filter((n) => !n.read)
const title = (id: string) => seedNotifications.find((n) => n.id === id)!.title

const centerDemo = (page: Page) => page.getByTestId("ntf-center-demo")
const inbox = (page: Page) => page.getByTestId("ntf-inbox")
const panel = (page: Page) => page.getByTestId("ntf-center")
const item = (root: Locator, id: string) => root.locator(`[data-notification-id="${id}"]`)
const openButton = (root: Locator, id: string) => item(root, id).locator("[data-row-focus]")
const toggle = (root: Locator, id: string) => item(root, id).locator("[data-slot=notification-read-toggle]")

async function openPage(page: Page, { fast = true } = {}) {
  await page.goto("/#/notifications")
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible()
  if (fast) await server(page, (s) => Object.assign(s.latency, { list: 80, read: 80, readAll: 120, resolve: 60, settings: 60, saveSetting: 80 }))
}

async function openCenter(page: Page, root: Locator = centerDemo(page), { loaded = true } = {}) {
  await root.getByTestId("ntf-trigger").click()
  await expect(panel(page)).toBeVisible()
  if (loaded) await expect(panel(page).locator("[data-notification-id], [data-slot=notification-empty]").first()).toBeVisible()
  return panel(page)
}

// 名前の検品：モバイルの Sheet（モーダル）を開いている間は、背後のボタンが支援技術から隠れるため、aria-label で確かめる。
// 閉じた状態のアクセシブルな名前は、最初の検品（the trigger names the exact unread count）で確かめる。

// ------------------------------------------------------------------ 資料のページ
test.describe("Notifications page", { tag: "@webkit" }, () => {
  test("one h1, named controls, no horizontal page scroll, inert comparison mocks", async ({ page }) => {
    await openPage(page)
    await expect(page.locator("h1")).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const main = page.locator("main").first()
    const controls = main.getByRole("button").or(main.getByRole("link")).or(main.getByRole("switch"))
    const n = await controls.count()
    expect(n).toBeGreaterThan(10)
    for (let i = 0; i < n; i++) {
      const c = controls.nth(i)
      if (await c.isVisible()) await expect(c).toHaveAccessibleName(/\S/)
    }
    const mocks = await page.locator("figure [inert]").all()
    expect(mocks.length).toBeGreaterThan(5)
    for (const mock of mocks) expect(await mock.evaluate((el) => (el as HTMLElement).inert)).toBe(true)
    // 模擬の処理であることを画面に示す
    await expect(main.getByText(/模擬の通知サーバー/).first()).toBeVisible()
  })

  test("the trigger names the exact unread count; opening the center does not mark anything read", async ({ page }) => {
    await openPage(page)
    const trigger = centerDemo(page).getByTestId("ntf-trigger")
    await expect(trigger).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("hq").length} 件`)
    await expect(trigger.locator("[data-slot=notification-indicator]")).toHaveText(String(unreadSeed("hq").length))
    let center = await openCenter(page)
    await expect(item(center, "n-101")).toBeVisible()
    // 閉じて開き直す（開閉の効果がすべて走った後）まで、既読の要求がない
    await page.keyboard.press("Escape")
    await expect(center).toBeHidden()
    center = await openCenter(page)
    expect(await requests(page, "read")).toHaveLength(0)
    expect(await requests(page, "readAll")).toHaveLength(0)
    expect((await stored(page, "hq")).filter((n) => !n.read)).toHaveLength(unreadSeed("hq").length)
    // 未読を色だけで示さない：読み上げの「未読、」と太字
    await expect(openButton(center, "n-101")).toHaveAccessibleName(new RegExp(`^未読、\\s*${title("n-101")}`))
    await expect(openButton(center, "n-106")).not.toHaveAccessibleName(/未読/)
    // 相対時刻に正確な日時（title と dateTime）
    const time = openButton(center, "n-101").locator("time")
    await expect(time).toHaveText("4 分前")
    await expect(time).toHaveAttribute("title", "2026年11月26日 9:56")
    await expect(time).toHaveAttribute("datetime", "2026-11-26T00:56:00.000Z")
  })

  test("320px: the page, the center and the settings do not scroll horizontally", async ({ page, isMobile }) => {
    test.skip(isMobile, "画面の幅を変えて確かめる")
    await page.setViewportSize({ width: 320, height: 800 })
    await openPage(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await openCenter(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    // 320px は md 未満のため、全画面の Sheet になる（開く動きが終わってから測る）
    await expect.poll(async () => {
      const box = (await panel(page).boundingBox())!
      return [Math.round(box.x), Math.round(box.width)]
    }).toEqual([0, 320])
  })
})

// ------------------------------------------------------------------ 通知センター
test.describe("Notification center", () => {
  test("open and close: Popover on desktop, full-screen Sheet on mobile; Escape returns focus to the trigger", async ({ page, isMobile }) => {
    await openPage(page)
    const trigger = centerDemo(page).getByTestId("ntf-trigger")
    const center = await openCenter(page)
    await expect(center).toHaveAccessibleName("お知らせ")
    // 開いたときは見出しへフォーカス
    await expect(center.getByRole("heading", { name: "お知らせ" })).toBeFocused()
    if (isMobile) {
      await expect(center).toHaveAttribute("role", "dialog")
      const box = (await center.boundingBox())!
      expect(Math.round(box.width)).toBe(page.viewportSize()!.width)
    } else {
      await expect(center).toHaveAttribute("data-slot", "popover-content")
    }
    await page.keyboard.press("Escape")
    await expect(center).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test("indicator: count, dot, 99+, 0 and unknown (examples) follow the specification", async ({ page }) => {
    await openPage(page)
    const samples = page.getByTestId("ntf-indicators").getByTestId("ntf-indicator-sample")
    const expected: [string, string | null][] = [
      ["お知らせ、未読 3 件", "3"],
      ["お知らせ、未読 120 件", "99+"],
      ["お知らせ、未読 3 件", null], // Dot
      ["お知らせ、未読なし", null], // 0 件：表示しない
      ["お知らせ、未読あり", null], // 件数が不明：Dot
      ["お知らせ", null], // 不明：表示しない
    ]
    await expect(samples).toHaveCount(expected.length)
    for (const [i, [label, text]] of expected.entries()) {
      const s = samples.nth(i)
      await expect(s).toHaveAttribute("data-label", label)
      // 数字を表示するのは Count のときだけ
      if (text !== null) await expect(s.locator("[data-kind=count]")).toHaveText(text)
      else await expect(s.locator("[data-kind=count]")).toHaveCount(0)
    }
    await expect(samples.nth(2).locator("[data-kind=dot]")).toHaveCount(1)
    await expect(samples.nth(3).locator("[data-slot=notification-indicator]")).toHaveCount(0)
    await expect(samples.nth(4).locator("[data-kind=dot]")).toHaveCount(1)
    await expect(samples.nth(5).locator("[data-slot=notification-indicator]")).toHaveCount(0)
    // 通常の未読に Destructive の赤を使わない（primary と同じ色）
    const colors = await samples.nth(0).locator("[data-slot=notification-indicator]").evaluate((el) => {
      const probe = document.createElement("span")
      probe.style.color = "var(--primary)"
      document.body.append(probe)
      const primary = getComputedStyle(probe).color
      probe.style.color = "var(--destructive)"
      const destructive = getComputedStyle(probe).color
      probe.remove()
      return { bg: getComputedStyle(el).backgroundColor, primary, destructive }
    })
    expect(colors.bg).toBe(colors.primary)
    expect(colors.bg).not.toBe(colors.destructive)
  })

  test("live trigger: dot display keeps the exact count in the name; read all removes the indicator", async ({ page }) => {
    await openPage(page)
    await centerDemo(page).getByText("未読があることだけ（Dot）").click()
    const trigger = centerDemo(page).getByTestId("ntf-trigger")
    await expect(trigger.locator("[data-kind=dot]")).toHaveCount(1)
    await expect(trigger).toHaveAttribute("aria-label", `お知らせ、未読 ${unreadSeed("hq").length} 件`)
    const center = await openCenter(page)
    await center.getByRole("button", { name: "すべて既読にする" }).click()
    await expect(trigger).toHaveAttribute("aria-label", "お知らせ、未読なし")
    await expect(trigger.locator("[data-slot=notification-indicator]")).toHaveCount(0)
  })

  test("mark one read and back to unread: the count and the server follow; keyboard only", async ({ page }) => {
    await openPage(page)
    const trigger = centerDemo(page).getByTestId("ntf-trigger")
    const center = await openCenter(page)
    await expect(item(center, "n-101")).toBeVisible()
    const total = unreadSeed("hq").length
    // 見出し → すべて → 未読 → すべて既読 → 1 件目を開く → 1 件目の既読 の順に Tab で進む
    for (let i = 0; i < 5; i++) await page.keyboard.press("Tab")
    await expect(toggle(center, "n-101")).toBeFocused()
    await expect(toggle(center, "n-101")).toHaveAccessibleName(`「${title("n-101")}」を既読にする`)
    await page.keyboard.press("Enter")
    await expect(item(center, "n-101")).toHaveAttribute("data-read", "")
    await expect(toggle(center, "n-101")).toHaveAccessibleName(`「${title("n-101")}」を未読に戻す`)
    await expect(toggle(center, "n-101")).toBeFocused()
    await expect(trigger).toHaveAttribute("aria-label", `お知らせ、未読 ${total - 1} 件`)
    await expect.poll(async () => (await stored(page, "hq")).find((n) => n.id === "n-101")!.read).toBe(true)
    await page.keyboard.press("Enter")
    await expect(item(center, "n-101")).not.toHaveAttribute("data-read")
    await expect(trigger).toHaveAttribute("aria-label", `お知らせ、未読 ${total} 件`)
    await expect.poll(async () => (await stored(page, "hq")).find((n) => n.id === "n-101")!.read).toBe(false)
  })

  test("read all: the range is the unread items at the start, shown before running", async ({ page }) => {
    await openPage(page)
    const center = await openCenter(page)
    const ids = unreadSeed("hq").map((n) => n.id)
    await expect(center.getByText(`対象：本社営業部の未読 ${ids.length} 件`)).toBeVisible()
    const button = center.getByRole("button", { name: "すべて既読にする" })
    await expect(button).toHaveAccessibleDescription(`対象：本社営業部の未読 ${ids.length} 件`)
    await button.click()
    await expect(center.locator("[data-notification-id]:not([data-read])")).toHaveCount(0)
    const [req] = await requests(page, "readAll")
    expect([...req.ids!].sort()).toEqual([...ids].sort())
    // ボタンが消えたら、見出しへフォーカスを移す（<body> に落とさない）
    await expect(center.getByRole("heading", { name: "お知らせ" })).toBeFocused()
    await expect(center.locator("[data-slot=notification-live]")).toHaveText(`${ids.length} 件を既読にしました`)
  })

  test("a new notification arriving during read all stays unread (client and server)", async ({ page }) => {
    await openPage(page)
    await hold(page, "readAll")
    const trigger = centerDemo(page).getByTestId("ntf-trigger")
    const center = await openCenter(page)
    await center.getByRole("button", { name: "すべて既読にする" }).click()
    await expect(center.getByText(/件を既読にしています/)).toBeVisible()
    await waitHeld(page, "readAll")
    const newId = await server(page, (s) => s.push("hq"))
    // 開いている間は保留し、一覧を動かさない。件数には含める
    await expect(center.getByRole("button", { name: "新着 1 件を表示" })).toBeVisible()
    await releaseAll(page, "readAll")
    await expect(center.locator("[data-slot=notification-read-all]")).toBeHidden()
    await expect(trigger).toHaveAttribute("aria-label", "お知らせ、未読 1 件")
    await center.getByRole("button", { name: "新着 1 件を表示" }).click()
    await expect(item(center, newId)).not.toHaveAttribute("data-read")
    // 押した操作の結果として、加えた新着へフォーカスを移す（対象のない通知は既読の操作）
    await expect(toggle(center, newId)).toBeFocused()
    expect((await stored(page, "hq")).find((n) => n.id === newId)!.read).toBe(false)
    const [req] = await requests(page, "readAll")
    expect(req.ids).not.toContain(newId)
  })

  test("unread filter: marking read removes the item and moves focus to the next one, then to the heading", async ({ page }) => {
    await openPage(page)
    const center = await openCenter(page)
    await center.getByRole("button", { name: "未読", exact: true }).click()
    await expect(center.getByRole("button", { name: "未読", exact: true })).toHaveAttribute("aria-pressed", "true")
    const ids = unreadSeed("hq").map((n) => n.id) // 新しい順：n-101, n-102, n-103
    await expect(center.locator("[data-notification-id]")).toHaveCount(ids.length)
    await toggle(center, ids[0]).click()
    await expect(item(center, ids[0])).toHaveCount(0)
    await expect(openButton(center, ids[1])).toBeFocused()
    await page.keyboard.press("Tab")
    await page.keyboard.press("Enter")
    await expect(item(center, ids[1])).toHaveCount(0)
    await expect(openButton(center, ids[2])).toBeFocused()
    await toggle(center, ids[2]).click()
    await expect(center.getByText("未読のお知らせはありません")).toBeVisible()
    await expect(center.getByRole("heading", { name: "お知らせ" })).toBeFocused()
    // 未読なし（通知はある）と通知なしを区別する
    await expect(center.getByText("お知らせはありません", { exact: true })).toHaveCount(0)
  })

  test("fetch failure: an error with retry, no invented count; retry recovers", async ({ page }) => {
    await openPage(page)
    await server(page, (s) => (s.outcomeNext.list = "fail"))
    await centerDemo(page).getByText("失敗", { exact: true }).click()
    const trigger = centerDemo(page).getByTestId("ntf-trigger")
    const center = await openCenter(page, centerDemo(page), { loaded: false })
    await expect(center.getByRole("alert")).toContainText("お知らせを取得できませんでした")
    await expect(trigger).toHaveAttribute("aria-label", "お知らせ")
    await expect(trigger.locator("[data-slot=notification-indicator]")).toHaveCount(0)
    await expect(center.locator("[data-notification-id]")).toHaveCount(0)
    await server(page, (s) => (s.outcome.list = "success"))
    await center.getByRole("button", { name: "再試行" }).click()
    await expect(item(center, "n-101")).toBeVisible()
    await expect(trigger).toHaveAttribute("aria-label", `お知らせ、未読 ${unreadSeed("hq").length} 件`)
  })

  test("initial loading is busy and announced; nothing is shown as empty while loading", async ({ page }) => {
    await openPage(page)
    // 取得の応答を保留したまま、通知センターを取得し直す（「遅い」は画面を開き直す操作。応答の時間は保留で決める）
    await hold(page, "list")
    await centerDemo(page).getByText("遅い（3 秒）").click()
    await waitHeld(page, "list")
    const center = await openCenter(page, centerDemo(page), { loaded: false })
    await expect(center.locator("[data-slot=notification-scroll]")).toHaveAttribute("aria-busy", "true")
    await expect(center.getByText("お知らせはありません")).toHaveCount(0)
    await expect(center.getByText("読み込み中")).toBeAttached()
    await expect(centerDemo(page).getByTestId("ntf-trigger")).toHaveAttribute("aria-label", "お知らせ")
    await releaseAll(page, "list")
    await expect(item(center, "n-101")).toBeVisible()
  })

  test("open a notification: move to the target, mark it read, and return to the same item", async ({ page }) => {
    await openPage(page)
    const center = await openCenter(page)
    await openButton(center, "n-102").click()
    await expect(center).toBeHidden()
    await expect(centerDemo(page).getByTestId("ntf-target-title")).toHaveText(seed("hq")[1].target!.label)
    await expect.poll(async () => (await stored(page, "hq")).find((n) => n.id === "n-102")!.read).toBe(true)
    const [resolve] = await requests(page, "resolve")
    expect(resolve.ids).toEqual([seed("hq")[1].target!.id])
    await centerDemo(page).getByTestId("ntf-back").click()
    await expect(panel(page)).toBeVisible()
    await expect(openButton(panel(page), "n-102")).toBeFocused()
    await expect(item(panel(page), "n-102")).toHaveAttribute("data-read", "")
  })

  test("workspace A → B → A with responses that ignore AbortSignal: no stale notifications or counts", async ({ page }) => {
    await openPage(page)
    await expect(centerDemo(page).getByTestId("ntf-trigger")).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("hq").length} 件`)
    await server(page, (s) => (s.ignoreAbort = true))
    await hold(page, "list")
    const trigger = centerDemo(page).getByTestId("ntf-trigger")
    const ws = centerDemo(page).getByRole("group", { name: "ワークスペース" })
    const before = await heldCount(page, "list")
    await ws.getByText("西日本営業部").click()
    await ws.getByText("本社営業部").click()
    await ws.getByText("西日本営業部").click()
    // 3 回の取得（B、A、B）をすべて保留する。最後の B の応答を先に解放し、その後で前の A と B の応答（中止に従わない）を解放する
    await waitHeld(page, "list", before + 3)
    await release(page, "list", { which: "last" })
    await expect(trigger).toHaveAttribute("aria-label", `お知らせ、未読 ${unreadSeed("west").length} 件`)
    await releaseAll(page, "list")
    await settle(page)
    await expect(trigger).toHaveAttribute("aria-label", `お知らせ、未読 ${unreadSeed("west").length} 件`)
    const center = await openCenter(page)
    await expect(center.locator("[data-notification-id]")).toHaveCount(seed("west").length)
    for (const n of seed("hq")) await expect(item(center, n.id)).toHaveCount(0)
    await expect(center.getByText("西日本営業部", { exact: true })).toBeVisible()
  })

  test("account switch: the previous account's count and notifications are not shown, even for one render", async ({ page }) => {
    await openPage(page)
    const trigger = centerDemo(page).getByTestId("ntf-trigger")
    await expect(trigger).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("hq").length} 件`)
    await hold(page, "list")
    // 切り替えた後のすべての描画（aria-label の変更）を記録し、前のアカウントの件数が一度も現れないことを確かめる。
    // 件数が不明の間（取得中）は件数を作らない。
    await trigger.evaluate((el) => {
      const seen: string[] = ((window as unknown as { __ntfLabels: string[] }).__ntfLabels = [])
      new MutationObserver(() => seen.push(el.getAttribute("aria-label") ?? "")).observe(el, { attributes: true, attributeFilter: ["aria-label"] })
    })
    await centerDemo(page).getByText("鈴木 一郎").click()
    await expect(trigger).toHaveAttribute("aria-label", "お知らせ")
    await waitHeld(page, "list")
    await releaseAll(page, "list")
    await expect(trigger).toHaveAttribute("aria-label", "お知らせ、未読なし")
    const seen = await page.evaluate(() => (window as unknown as { __ntfLabels: string[] }).__ntfLabels)
    expect(seen).toEqual(["お知らせ", "お知らせ、未読なし"])
    const center = await openCenter(page)
    await expect(center.getByText("お知らせはありません", { exact: true })).toBeVisible()
    for (const n of seed("hq")) await expect(item(center, n.id)).toHaveCount(0)
  })

  test("a read update started in A is not applied after switching to B (ignoring AbortSignal)", async ({ page, isMobile }) => {
    await openPage(page)
    await server(page, (s) => (s.ignoreAbort = true))
    await hold(page, "read")
    const trigger = centerDemo(page).getByTestId("ntf-trigger")
    const center = await openCenter(page)
    await toggle(center, "n-101").click()
    await waitHeld(page, "read")
    await page.keyboard.press("Escape")
    if (isMobile) await expect(center).toBeHidden()
    await centerDemo(page).getByRole("group", { name: "ワークスペース" }).getByText("西日本営業部").click()
    await expect(trigger).toHaveAttribute("aria-label", `お知らせ、未読 ${unreadSeed("west").length} 件`)
    await releaseAll(page, "read")
    await settle(page)
    await expect(trigger).toHaveAttribute("aria-label", `お知らせ、未読 ${unreadSeed("west").length} 件`)
    const west = await openCenter(page)
    for (const n of unreadSeed("west")) await expect(item(west, n.id)).not.toHaveAttribute("data-read")
  })

  test("unmounting while a read update is pending: the late response is not applied and nothing throws", async ({ page }) => {
    await openPage(page)
    await server(page, (s) => (s.ignoreAbort = true))
    await hold(page, "read")
    const center = await openCenter(page)
    await toggle(center, "n-103").click()
    await waitHeld(page, "read")
    await page.keyboard.press("Escape")
    await centerDemo(page).getByTestId("ntf-center-mount").click()
    await expect(centerDemo(page).getByTestId("ntf-trigger")).toHaveCount(0)
    await releaseAll(page, "read")
    await settle(page)
    await centerDemo(page).getByTestId("ntf-center-mount").click()
    // 戻した後は、サーバーの状態を取得し直して表示する（サーバーでは処理されている）
    await expect(centerDemo(page).getByTestId("ntf-trigger")).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("hq").length - 1} 件`)
  })

  test("reduced motion: the center opens without scale animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openPage(page)
    const center = await openCenter(page)
    const transform = await center.evaluate((el) => getComputedStyle(el).scale)
    expect(["none", "1"]).toContain(transform)
    const chevron = center.locator("[data-group] svg").first()
    expect(await chevron.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("all")
    expect(await chevron.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s")
  })
})

// ------------------------------------------------------------------ 専用のページ
test.describe("Notification inbox", () => {
  test("grouping: related reminders are grouped and each target stays reachable; security is not grouped", async ({ page }) => {
    await openPage(page)
    const list = inbox(page)
    const group = list.locator("[data-group]")
    await expect(group).toHaveCount(1)
    const groupButton = group.getByRole("button", { name: /^契約の更新日まで 7 日の顧客が/ })
    await expect(groupButton).toHaveAttribute("aria-expanded", "false")
    await expect(groupButton).toContainText(`契約の更新日まで 7 日の顧客が 2 件あります`)
    await groupButton.click()
    await expect(groupButton).toHaveAttribute("aria-expanded", "true")
    for (const id of ["n-104", "n-105"]) await expect(openButton(group, id)).toContainText(title(id))
    // セキュリティの通知は、同じ groupKey でも集約しない
    await page.getByTestId("ntf-inbox-demo").evaluate(() => {
      const s = window.__fdSaNotificationsServer!
      s.push("hq", { type: "security", title: "新しい端末からログインしました（Windows、Edge）", groupKey: "login" })
      s.push("hq", { type: "security", title: "新しい端末からログインしました（iOS、Safari）", groupKey: "login" })
    })
    await list.getByRole("button", { name: "新着 2 件を表示" }).click()
    await expect(list.locator("[data-group]")).toHaveCount(1)
    await expect(list.getByText("新しい端末からログインしました（Windows、Edge）")).toBeVisible()
    await expect(list.getByText("新しい端末からログインしました（iOS、Safari）")).toBeVisible()
  })

  test("duplicates: the same notification delivered again is ignored; the same text from another event is kept", async ({ page }) => {
    await openPage(page)
    const list = inbox(page)
    await expect(item(list, "n-101")).toBeVisible()
    const delivered = (await deliveries(page)).length
    await page.getByTestId("ntf-inbox-redeliver").click()
    // 配信が届き、受け付けられた（重複のため一覧に加えない）ことを確かめてから、表示を確かめる
    await expect.poll(async () => (await deliveries(page)).length).toBe(delivered + 1)
    expect(await lastAccepted(page, "inbox")).toBe(true)
    await settle(page)
    await expect(list.locator("[data-slot=notification-show-new]")).toHaveCount(0)
    await expect(list.locator('[data-notification-id="n-101"]')).toHaveCount(1)
    await page.getByTestId("ntf-inbox-same-title").click()
    await list.getByRole("button", { name: "新着 1 件を表示" }).click()
    await expect(list.locator("[data-notification-id]").filter({ hasText: title("n-101") })).toHaveCount(2)
  })

  test("new arrivals keep the scroll position and focus; announced by count only", async ({ page }) => {
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 600 })
    await openPage(page)
    const list = inbox(page)
    const scroller = list.locator("[data-slot=notification-scroll]")
    await expect(item(list, "n-107")).toBeVisible()
    await scroller.evaluate((el) => (el.scrollTop = 120))
    const top = await scroller.evaluate((el) => el.scrollTop)
    await openButton(list, "n-106").focus()
    await page.getByTestId("ntf-inbox-demo").evaluate(() => window.__fdSaNotificationsServer!.push("hq"))
    const live = list.locator("[data-slot=notification-live]")
    await expect(live).toHaveText("新着のお知らせが 1 件あります")
    await expect(live).toHaveAttribute("role", "status")
    await expect(openButton(list, "n-106")).toBeFocused()
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(top)
    await expect(list.locator("[data-notification-id^=n-new]")).toHaveCount(0)
  })

  test("read state and business task are independent; deleting a notification keeps the business data", async ({ page }) => {
    await openPage(page)
    const list = inbox(page)
    const tasks = page.getByTestId("ntf-tasks")
    const openTasks = seed("hq").filter((n) => n.task === "open").length
    await expect(tasks).toContainText(`対応待ち（顧客と処理の画面で管理する業務のデータ）：${openTasks} 件`)
    await expect(item(list, "n-101")).toContainText("対応待ち")
    await toggle(list, "n-101").click()
    await expect(item(list, "n-101")).toHaveAttribute("data-read", "")
    await expect(item(list, "n-101")).toContainText("対応待ち")
    await expect(tasks).toContainText(`：${openTasks} 件`)
    // 通知を削除しても、業務のデータは変わらない
    await item(list, "n-101").getByRole("button", { name: `「${title("n-101")}」のお知らせを削除` }).click()
    await expect(item(list, "n-101")).toHaveCount(0)
    await expect(openButton(list, "n-102")).toBeFocused()
    await expect(tasks).toContainText(`：${openTasks} 件`)
    // 対象の画面で対応を完了しても、既読・未読は変わらない（n-105 は既読、n-104 は既読のまま）
    await list.locator("[data-group]").getByRole("button", { name: /^契約の更新日まで 7 日の顧客が/ }).click()
    await openButton(list, "n-105").click()
    await page.getByTestId("ntf-complete-task").click()
    await expect(tasks).toContainText(`：${openTasks - 1} 件`)
    await page.getByTestId("ntf-back").click()
    await expect(item(list, "n-105")).toContainText("対応済み")
    expect((await stored(page, "hq")).find((n) => n.id === "n-102")!.read).toBe(false)
  })

  test("returning from the target restores scroll and focus to the opened notification", async ({ page }) => {
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 600 })
    await openPage(page)
    const list = inbox(page)
    await expect(item(list, "n-106")).toBeVisible()
    const scroller = list.locator("[data-slot=notification-scroll]")
    await scroller.evaluate((el) => (el.scrollTop = 100))
    const top = await scroller.evaluate((el) => el.scrollTop)
    await openButton(list, "n-106").click()
    await expect(page.getByTestId("ntf-inbox").getByTestId("ntf-target-title")).toHaveText("セキュリティの設定")
    await page.getByTestId("ntf-inbox").getByTestId("ntf-back").click()
    await expect(openButton(list, "n-106")).toBeFocused()
    expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - top)).toBeLessThanOrEqual(1)
  })

  test("read update failure restores the state and stays on screen; unknown result re-fetches", async ({ page }) => {
    await openPage(page)
    const list = inbox(page)
    await page.getByTestId("ntf-inbox-demo").getByText("失敗", { exact: true }).click()
    await toggle(list, "n-102").click()
    await expect(list.locator("[data-slot=notification-update-error]")).toContainText("1 件を既読にできませんでした")
    await expect(item(list, "n-102")).not.toHaveAttribute("data-read")
    expect((await stored(page, "hq")).find((n) => n.id === "n-102")!.read).toBe(false)

    await page.getByTestId("ntf-inbox-demo").getByText("結果が不明").click()
    const before = (await requests(page, "list")).length
    await toggle(list, "n-102").click()
    await expect(list.locator("[data-slot=notification-update-error]")).toContainText("更新できたかを確認できませんでした")
    // 取得し直して、実際の状態（サーバーでは処理された）を表示する
    await expect.poll(async () => (await requests(page, "list")).length).toBeGreaterThan(before)
    await expect(item(list, "n-102")).toHaveAttribute("data-read", "")
  })

  test("consecutive updates: a slow older response does not overwrite the newer state", async ({ page }) => {
    await openPage(page)
    const list = inbox(page)
    await expect(item(list, "n-103")).toBeVisible()
    await server(page, (s) => (s.ignoreAbort = true))
    await hold(page, "read")
    await toggle(list, "n-103").click() // 既読にする
    await waitHeld(page, "read", 1)
    await toggle(list, "n-103").click() // 未読に戻す
    await waitHeld(page, "read", 2)
    // 新しい要求（未読に戻す）の応答を先に、古い要求（既読にする）の応答を後に返す
    await release(page, "read", { which: "last" })
    await expect(item(list, "n-103")).not.toHaveAttribute("data-read")
    await releaseAll(page, "read")
    await settle(page)
    await expect(item(list, "n-103")).not.toHaveAttribute("data-read")
    expect((await stored(page, "hq")).find((n) => n.id === "n-103")!.read).toBe(false)
    await expect(list.locator("[data-slot=notification-update-error]")).toHaveCount(0)
  })

  test("no notifications vs no unread notifications", async ({ page }) => {
    await openPage(page)
    await page.getByTestId("ntf-inbox-demo").getByRole("group", { name: "ワークスペース" }).getByText("西日本営業部").click()
    const list = inbox(page)
    for (const n of seed("west")) {
      await expect(item(list, n.id)).toBeVisible()
      await item(list, n.id).getByRole("button", { name: /のお知らせを削除$/ }).click()
      await expect(item(list, n.id)).toHaveCount(0)
    }
    await expect(list.getByText("お知らせはありません", { exact: true })).toBeVisible()
    await list.getByRole("button", { name: "未読", exact: true }).click()
    await expect(list.getByText("お知らせはありません", { exact: true })).toBeVisible()
    await expect(list.getByText("未読のお知らせはありません")).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 通知から対象への移動
test.describe("Navigation from a notification", () => {
  const nav = (page: Page) => page.getByTestId("ntf-nav-demo")

  test("unsaved changes: keep editing cancels the move and keeps it unread; discarding moves", async ({ page }) => {
    await openPage(page)
    await nav(page).getByTestId("ntf-nav-memo").fill("連絡の予定を確認する")
    let center = await openCenter(page, nav(page))
    await openButton(center, "n-103").click()
    const alert = page.getByTestId("ntf-discard")
    await expect(alert).toBeVisible()
    await alert.getByRole("button", { name: "編集を続ける" }).click()
    await expect(alert).toBeHidden()
    await expect(nav(page).getByTestId("ntf-nav-memo")).toHaveValue("連絡の予定を確認する")
    expect(await requests(page, "resolve")).toHaveLength(0)
    expect((await stored(page, "hq")).find((n) => n.id === "n-103")!.read).toBe(false)
    if (!(await panel(page).isVisible())) center = await openCenter(page, nav(page))
    await openButton(panel(page), "n-103").click()
    await alert.getByRole("button", { name: "変更を破棄" }).click()
    await expect(nav(page).getByTestId("ntf-target-title")).toHaveText(seed("hq")[2].target!.label)
    await expect.poll(async () => (await stored(page, "hq")).find((n) => n.id === "n-103")!.read).toBe(true)
  })

  test("deleted target: not moved, the reason is shown in the center, the notification is kept", async ({ page }) => {
    await openPage(page)
    await expect(nav(page).getByTestId("ntf-trigger")).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("hq").length} 件`)
    await nav(page).getByTestId("ntf-nav-delete").click()
    const center = await openCenter(page, nav(page))
    await openButton(center, "n-101").click()
    await expect(center.locator("[data-slot=notification-navigate-notice]")).toContainText(`${seed("hq")[0].target!.label}は削除されています`)
    await expect(center).toBeVisible()
    await expect(item(center, "n-101")).toBeVisible()
    await expect(nav(page).getByTestId("ntf-target-title")).toHaveText("株式会社サンプルの詳細（編集中）")
  })

  test("lost permission: the link is not trusted; the content is removed from the notification", async ({ page }) => {
    await openPage(page)
    // 取得が終わった後で、サーバーの権限だけを変える（画面には知らせない）
    await expect(nav(page).getByTestId("ntf-trigger")).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("hq").length} 件`)
    await nav(page).getByTestId("ntf-nav-revoke").click()
    const center = await openCenter(page, nav(page))
    await expect(openButton(center, "n-102")).toContainText(title("n-102"))
    await openButton(center, "n-102").click()
    await expect(center.locator("[data-slot=notification-navigate-notice]")).toContainText("閲覧する権限がありません")
    await expect(nav(page).getByTestId("ntf-target-title")).toHaveText("株式会社サンプルの詳細（編集中）")
    // 取得し直した後は、権限のない内容（タイトル、対象の名前）を通知に残さない
    await expect(item(center, "n-102")).toContainText("閲覧できない対象に関するお知らせ")
    await expect(nav(page).getByText(title("n-102"))).toHaveCount(0)
    await expect(center.getByText(title("n-102"))).toHaveCount(0)
  })

  test("a permission change applied as a scope change discards and re-fetches the notifications", async ({ page }) => {
    await openPage(page)
    await expect(nav(page).getByTestId("ntf-trigger")).toHaveAccessibleName(/未読 3 件/)
    const before = (await requests(page, "list")).length
    await nav(page).getByTestId("ntf-nav-revoke").click()
    await nav(page).getByTestId("ntf-nav-scope").click()
    await expect.poll(async () => (await requests(page, "list")).length).toBeGreaterThan(before)
    const center = await openCenter(page, nav(page))
    await expect(item(center, "n-102")).toContainText("閲覧できない対象に関するお知らせ")
    await expect(openButton(center, "n-102")).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 通知の設定
test.describe("Notification settings", () => {
  const settings = (page: Page) => page.getByTestId("ntf-settings-demo")

  test("a switch saves immediately; type and channel are both in its name", async ({ page }) => {
    await openPage(page)
    const sw = settings(page).getByRole("switch", { name: "コメントでのメンション：プッシュ通知" })
    await expect(sw).toHaveAttribute("aria-checked", "true")
    await sw.click()
    await expect(sw).toHaveAttribute("aria-checked", "false")
    await expect.poll(async () => serverWith(page, (s, u) => s.storedSettings(u).notifications.mention.push, "u-sato" as const)).toBe(false)
    await expect(settings(page).getByTestId("ntf-settings-live")).toHaveText("コメントでのメンション：プッシュ通知の設定を保存しました")
  })

  test("mandatory notifications cannot be turned off and show the reason", async ({ page }) => {
    await openPage(page)
    for (const m of mandatoryNotifications) {
      const channel = { "in-app": "アプリ内", email: "メール", push: "プッシュ通知" }[m.channel]
      const sw = settings(page).getByTestId(`ntf-switch-${m.type}-${m.channel}`)
      await expect(sw).toHaveAttribute("aria-checked", "true")
      await expect(sw).toHaveAttribute("aria-readonly", "true")
      await expect(sw).toHaveAccessibleDescription(`${channel}は無効にできません：${m.reason}`)
      await expect(settings(page).getByText(`${channel}は無効にできません：${m.reason}`)).toBeVisible()
      await sw.click({ force: true })
      await expect(sw).toHaveAttribute("aria-checked", "true")
    }
    expect(await requests(page, "saveSetting")).toHaveLength(0)
  })

  test("organization policy and the browser permission are shown separately from the product setting", async ({ page }) => {
    await openPage(page)
    await settings(page).getByRole("group", { name: "ワークスペース" }).getByText("西日本営業部").click()
    await expect(settings(page).getByTestId("ntf-policy")).toContainText("西日本営業部の組織のポリシーで、プッシュ通知は使えません")
    const push = settings(page).getByRole("switch", { name: "コメントでのメンション：プッシュ通知" })
    await expect(push).toHaveAttribute("aria-checked", "false")
    await expect(push).toHaveAttribute("aria-readonly", "true")
    // 個人の設定（サーバー）は残る
    expect(await serverWith(page, (s, u) => s.storedSettings(u).notifications.mention.push, "u-sato" as const)).toBe(true)
    // ブラウザの許可（模擬）
    const permission = settings(page).getByTestId("ntf-browser-permission")
    await expect(permission).toContainText("まだ許可されていません")
    await permission.getByRole("button", { name: "ブラウザの通知を許可する" }).click()
    await expect(permission).toContainText("許可されています")
    await settings(page).getByText("ブロック", { exact: true }).click()
    await expect(permission).toContainText("ブロックされています")
    await expect(permission).toContainText("ブラウザの許可とは別に保存されます")
  })

  test("save failure restores the switch and shows the error; unknown result re-fetches", async ({ page }) => {
    await openPage(page)
    await settings(page).getByText("失敗", { exact: true }).click()
    const sw = settings(page).getByRole("switch", { name: "新しい機能のお知らせ：アプリ内" })
    await sw.click()
    await expect(settings(page).getByTestId("ntf-setting-error")).toContainText("新しい機能のお知らせ：アプリ内の設定を保存できませんでした")
    await expect(sw).toHaveAttribute("aria-checked", "true")
    expect(await serverWith(page, (s, u) => s.storedSettings(u).notifications.product["in-app"], "u-sato" as const)).toBe(true)
    await settings(page).getByText("結果が不明", { exact: true }).click()
    await sw.click()
    await expect(settings(page).getByTestId("ntf-setting-error")).toContainText("保存できたかを確認できませんでした")
    // サーバーでは保存されている。取得し直した値を表示する
    await expect(sw).toHaveAttribute("aria-checked", "false")
  })

  test("quiet hours across midnight are described in the user's time zone", async ({ page }) => {
    await openPage(page)
    await settings(page).getByTestId("ntf-quiet").click()
    await expect(settings(page).getByTestId("ntf-quiet-summary")).toContainText("22:00〜翌 07:00（Asia/Tokyo）")
    await expect(settings(page).getByTestId("ntf-quiet-summary")).toContainText("控える時間の外")
    await expect(settings(page).getByTestId("ntf-quiet-summary")).toContainText("セキュリティの通知と、すぐに対応が必要な通知は、この時間も届きます")
    await expect.poll(async () => serverWith(page, (s, u) => s.storedSettings(u).quietHours.enabled, "u-sato" as const)).toBe(true)
  })
})

// ------------------------------------------------------------------ 配信の状態と既読
test.describe("Delivery state and read state", () => {
  test("sent is not delivered or read; reading changes only the read state", async ({ page }) => {
    await openPage(page)
    const table = page.getByTestId("ntf-lifecycle")
    await expect(table.getByTestId("ntf-delivery-in-app")).toContainText("配信済み")
    await expect(table.getByTestId("ntf-delivery-email")).toContainText("送信済み（届いたかは確認できません）")
    await expect(table.getByTestId("ntf-delivery-push")).toContainText("送らない（利用者の設定）")
    await expect(table.getByTestId("ntf-lifecycle-read")).toContainText("未読")
    await expect(table.getByTestId("ntf-lifecycle-task")).toContainText("対応待ち")
    await toggle(inbox(page), "n-101").click()
    await expect.poll(async () => (await stored(page, "hq")).find((n) => n.id === "n-101")!.read).toBe(true)
    await table.getByRole("button", { name: "最新の状態を取得する" }).click()
    await expect(table.getByTestId("ntf-lifecycle-read")).toContainText("既読")
    await expect(table.getByTestId("ntf-delivery-email")).toContainText("送信済み（届いたかは確認できません）")
    await expect(table.getByTestId("ntf-lifecycle-task")).toContainText("対応待ち")
    await table.getByText("メンション").click()
    await expect(table.getByTestId("ntf-delivery-push")).toContainText("送信済み（配信の確認を待っています）")
  })
})

// ------------------------------------------------------------------ 独立レビューの指摘の検品
test.describe("Read-all range, in-flight fetches, removal, live regions", () => {
  const inboxDemo = (page: Page) => page.getByTestId("ntf-inbox-demo")
  const unreadOnServer = async (page: Page) => (await stored(page, "hq")).filter((n) => !n.read).length
  const loadedHq = () => unreadSeed("hq").length // 新しい 5 件の中の未読（n-101〜n-103）
  const older = 9

  test("ids range with unloaded unread notifications: not called 'all'; only the loaded ones are read", async ({ page }) => {
    await openPage(page)
    await inboxDemo(page).getByTestId("ntf-inbox-paging").click()
    const list = inbox(page)
    await expect(list.locator("[data-notification-id]")).toHaveCount(3) // 3 件 ＋ 集約（2 件）
    const button = list.locator("[data-slot=notification-read-all]")
    await expect(button).toHaveText(`読み込んだ ${loadedHq()} 件を既読にする`)
    await expect(button).toHaveAccessibleDescription(`対象：読み込んだ未読 ${loadedHq()} 件（ほかの未読 ${older} 件は対象外）`)
    await button.click()
    await expect(list.locator("[data-notification-id]:not([data-read])")).toHaveCount(0)
    await expect(button).toBeHidden()
    expect(await unreadOnServer(page)).toBe(older)
    const [req] = await requests(page, "readAll")
    expect(req.range!.kind).toBe("ids")
    expect(req.ids).toHaveLength(loadedHq())
  })

  test("cursor range: 'all' with the server count; the result and count come from the server (re-fetched)", async ({ page }) => {
    await openPage(page)
    await inboxDemo(page).getByTestId("ntf-inbox-paging").click()
    await inboxDemo(page).getByText("開始した時点までのすべて（カーソル）").click()
    const list = inbox(page)
    await expect(item(list, "n-101")).toBeVisible()
    const total = loadedHq() + older
    const button = list.locator("[data-slot=notification-read-all]")
    await expect(button).toHaveText("すべて既読にする")
    await expect(button).toHaveAccessibleDescription(new RegExp(`^対象：本社営業部の未読 ${total} 件`))
    const lists = (await requests(page, "list")).length
    await button.click()
    await expect(list.locator("[data-slot=notification-live]")).toHaveText(`${total} 件を既読にしました`)
    // 成功した後に取得し直して、件数を確定する
    await expect.poll(async () => (await requests(page, "list")).length).toBeGreaterThan(lists)
    await expect(button).toBeHidden()
    await expect(list.getByText(/未読 \d+ 件/)).toHaveCount(0)
    expect(await unreadOnServer(page)).toBe(0)
    const readAll = (await requests(page, "readAll")).at(-1)!
    expect(readAll.range).toMatchObject({ kind: "cursor", field: "sequence" })
  })

  test("cursor range: a notification arriving during the run stays unread and is counted", async ({ page }) => {
    await openPage(page)
    await inboxDemo(page).getByTestId("ntf-inbox-paging").click()
    await inboxDemo(page).getByText("開始した時点までのすべて（カーソル）").click()
    await hold(page, "readAll")
    const list = inbox(page)
    await expect(item(list, "n-101")).toBeVisible()
    await list.locator("[data-slot=notification-read-all]").click()
    await waitHeld(page, "readAll")
    const newId = await server(page, (s) => s.push("hq"))
    await expect(list.getByRole("button", { name: "新着 1 件を表示" })).toBeVisible()
    await releaseAll(page, "readAll")
    await expect(list.locator("[data-slot=notification-live]")).toHaveText(`${loadedHq() + older} 件を既読にしました`)
    expect((await stored(page, "hq")).find((n) => n.id === newId)!.read).toBe(false)
    expect(await unreadOnServer(page)).toBe(1)
    // 成功した後の取得し直しの結果に新着が含まれる（保留は一覧と重複しないものだけのため、ボタンは消える）
    await expect(item(list, newId)).not.toHaveAttribute("data-read")
    await expect(list.getByRole("button", { name: "新着 1 件を表示" })).toHaveCount(0)
    await expect(list.locator("[data-slot=notification-read-all]")).toHaveAccessibleDescription(/^対象：本社営業部の未読 1 件/)
  })

  test("a fetch started before a read is confirmed does not overwrite the confirmed state", async ({ page }) => {
    await openPage(page)
    const list = inbox(page)
    await expect(item(list, "n-102")).toBeVisible()
    // サーバーは応答の時点で処理し、一覧は要求を受け付けた時点の状態で返す
    await server(page, (s) => {
      s.processAtResponse = true
      s.listSnapshotAtStart = true
    })
    await hold(page, "read", "list")
    await toggle(list, "n-102").click() // 1. 既読（応答を保留。サーバーではまだ処理していない）
    await waitHeld(page, "read", 1)
    await server(page, (s) => (s.outcomeNext.read = "unknown"))
    await toggle(list, "n-103").click() // 2. 既読（結果が不明になる）
    await waitHeld(page, "read", 2)
    const lists = (await requests(page, "list")).length
    // 2 の応答（結果が不明）を先に返す → 取得し直す（一覧は n-102 が未読の時点。応答を保留）
    await release(page, "read", { which: "last" })
    await waitHeld(page, "list", 1)
    expect((await requests(page, "list")).length).toBe(lists + 1)
    // 結果が不明な通知は、取得し直した結果が届くまで「状態を確認中」
    await expect(item(list, "n-103")).toHaveAttribute("data-verifying", "")
    await expect(toggle(list, "n-103")).toHaveAttribute("aria-disabled", "true")
    // 1 の応答を返す（サーバーで処理され、確定する）→ その後で、確定より前に始めた取得の応答を返す
    await release(page, "read")
    await expect.poll(async () => (await stored(page, "hq")).find((n) => n.id === "n-102")!.read).toBe(true)
    await releaseAll(page, "list")
    await expect(item(list, "n-103")).not.toHaveAttribute("data-verifying")
    await expect(item(list, "n-102")).toHaveAttribute("data-read", "")
    await expect(item(list, "n-103")).toHaveAttribute("data-read", "")
    // 範囲の文の件数も、確定した状態に合う（n-101 だけが未読）
    await expect(list.locator("[data-slot=notification-read-all]")).toHaveAccessibleDescription("対象：本社営業部の未読 1 件")
  })

  test("removal: failure is shown and allows retry; a second request is not sent while removing", async ({ page }) => {
    await openPage(page)
    const list = inbox(page)
    const remove = item(list, "n-102").getByRole("button", { name: /のお知らせを削除$/ })
    await server(page, (s) => (s.outcomeNext.remove = "fail"))
    await remove.click()
    await expect(list.locator("[data-slot=notification-remove-error]")).toContainText(`「${title("n-102")}」を削除できませんでした`)
    await expect(remove).toBeEnabled()
    await expect(item(list, "n-102")).toBeVisible()
    await hold(page, "remove")
    await remove.click()
    await waitHeld(page, "remove")
    await remove.click({ force: true })
    await remove.dispatchEvent("click")
    await settle(page)
    expect(await heldCount(page, "remove")).toBe(1)
    await releaseAll(page, "remove")
    await expect(item(list, "n-102")).toHaveCount(0)
    expect(await requests(page, "remove")).toHaveLength(2) // 失敗した 1 回 ＋ 成功した 1 回
  })

  // 削除中の状態は、要求を始めたスコープの世代と組で持つ。scopeKey の文字列だけで持つと、A → B → A の最初の A の要求が
  // 戻った A で「削除中」のまま残り、もう一度削除できなくなる。
  test("removal started in A, then A → B → A: the first A's request does not stay 'removing' in the current A", async ({ page }) => {
    await openPage(page)
    // 応答の時点で処理する（中止された要求は処理されない）
    await server(page, (s) => (s.processAtResponse = true))
    const list = inbox(page)
    const ws = page.getByTestId("ntf-inbox-demo").getByRole("group", { name: "ワークスペース" })
    const remove = () => item(list, "n-102").getByRole("button", { name: /のお知らせを削除$/ })
    await expect(item(list, "n-102")).toBeVisible()
    await hold(page, "remove")
    await remove().click()
    await waitHeld(page, "remove")
    await expect(remove()).toHaveAttribute("data-loading", "true")
    // B へ切り替えると、A の削除の要求は中止される（保留の一覧から外れ、サーバーは処理しない）
    await ws.getByText("西日本営業部").click()
    await waitHeld(page, "remove", 0)
    await ws.getByText("本社営業部").click()
    await expect(item(list, "n-102")).toBeVisible()
    await settle(page)
    await expect(remove()).not.toHaveAttribute("data-loading")
    await expect(list.locator("[data-slot=notification-remove-error]")).toHaveCount(0)
    // もう一度削除できる
    await remove().click()
    await waitHeld(page, "remove")
    await releaseAll(page, "remove")
    await expect(item(list, "n-102")).toHaveCount(0)
    expect((await stored(page, "hq")).some((n) => n.id === "n-102")).toBe(false)
    expect((await requests(page, "remove")).map((r) => r.workspaceId)).toEqual(["hq", "hq"])
  })

  test("removal ending with an AbortError in the same scope: treated as unknown and re-fetched, not left 'removing'", async ({ page }) => {
    await openPage(page)
    const list = inbox(page)
    const remove = () => item(list, "n-103").getByRole("button", { name: /のお知らせを削除$/ })
    await expect(item(list, "n-103")).toBeVisible()
    await hold(page, "remove", "list")
    await remove().click()
    await waitHeld(page, "remove")
    await expect(remove()).toHaveAttribute("data-loading", "true")
    // 製品の通信の層の中止。模擬のサーバーは要求を受け付けた時点で削除している
    expect(await release(page, "remove", { outcome: "abort" })).toBe(1)
    await waitHeld(page, "list")
    await expect(list.locator("[data-slot=notification-remove-error]")).toContainText(`「${title("n-103")}」を削除できたかを確認できませんでした`)
    await expect(remove()).not.toHaveAttribute("data-loading")
    await releaseAll(page, "list")
    await expect(item(list, "n-103")).toHaveCount(0)
    expect((await stored(page, "hq")).some((n) => n.id === "n-103")).toBe(false)
  })

  test("settings: failure and unknown results are announced; unknown is a warning, not an error", async ({ page }) => {
    await openPage(page)
    const settings = page.getByTestId("ntf-settings-demo")
    const live = settings.getByTestId("ntf-settings-live")
    await expect(live).toHaveAttribute("role", "status")
    await settings.getByText("失敗", { exact: true }).click()
    await settings.getByRole("switch", { name: "新しい機能のお知らせ：アプリ内" }).click()
    await expect(live).toHaveText("新しい機能のお知らせ：アプリ内の設定を保存できませんでした。もう一度お試しください。")
    await expect(settings.getByTestId("ntf-setting-error")).toHaveAttribute("data-state", "failed")
    await settings.getByText("結果が不明", { exact: true }).click()
    await settings.getByTestId("ntf-digest").click()
    await expect(live).toHaveText("まとめて受け取る設定を保存できたかを確認できませんでした。最新の設定を取得し直しています。")
    const unknown = settings.locator("[data-testid=ntf-setting-error][data-state=unknown]")
    await expect(unknown).toBeVisible()
    await expect(unknown).toHaveClass(/text-warning/)
    await expect(unknown).not.toHaveClass(/text-destructive/)
  })

  test("the notice live region is present in the accessibility tree while empty", async ({ page }) => {
    await openPage(page)
    const region = inbox(page).locator("[data-slot=notification-notice]")
    await expect(region).toHaveAttribute("aria-live", "polite")
    await expect(region).toBeEmpty()
    expect(await region.evaluate((el) => getComputedStyle(el).display)).not.toBe("none")
  })

  test("holding a new notification while the center is open does not move the shown notifications", async ({ page }) => {
    await openPage(page)
    const center = await openCenter(page)
    const before = (await item(center, "n-101").boundingBox())!
    await server(page, (s) => s.push("hq", { title: "x", type: "mention" }))
    await expect(center.getByRole("button", { name: "新着 1 件を表示" })).toBeVisible()
    const after = (await item(center, "n-101").boundingBox())!
    expect(Math.abs(after.y - before.y)).toBeLessThan(1)
    await expect(openButton(center, "n-101")).toBeVisible()
  })
})

// ------------------------------------------------------------------ 購読の世代（v0.1 の最終調整）
// 古い購読（WebSocket・SSE）から届いた通知を受け付けないことを、模擬のサーバーの配信の記録（購読者ごとの accepted）と画面で確かめる。
// 配信は holdDeliveries で保留し、届ける先は配信した時点の購読者になる（古い購読へ届く状況の再現）。
test.describe("Subscription generations", () => {
  const ws = (page: Page) => centerDemo(page).getByRole("group", { name: "ワークスペース" })
  const trigger = (page: Page) => centerDemo(page).getByTestId("ntf-trigger")
  const nav = (page: Page) => page.getByTestId("ntf-nav-demo")

  test("A → B → A: a notification from the first A's subscription is not accepted by the current A", async ({ page }) => {
    await openPage(page)
    await expect(trigger(page)).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("hq").length} 件`)
    await server(page, (s) => (s.holdDeliveries = true))
    // 最初の A の購読に届く通知（配信を保留）。その後で、サーバーから通知を削除する（取得し直した一覧には含まれない）
    const id = await server(page, (s) => s.push("hq"))
    await serverWith(page, (s, i) => s.deleteNotification("hq", i), id)
    await ws(page).getByText("西日本営業部").click()
    await expect(trigger(page)).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("west").length} 件`)
    await ws(page).getByText("本社営業部").click()
    await expect(trigger(page)).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("hq").length} 件`)
    await server(page, (s) => s.releaseDeliveries())
    await expect.poll(() => lastAccepted(page, "center")).toBe(false)
    await settle(page)
    // 受け付けていれば、通知センターを閉じている間は一覧に加わり、件数が増える
    await expect(trigger(page)).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("hq").length} 件`)
    const center = await openCenter(page)
    await expect(item(center, id)).toHaveCount(0)
    await expect(center.locator("[data-slot=notification-show-new]")).toHaveCount(0)
    // 現在の A の購読には届く
    await server(page, (s) => (s.holdDeliveries = false))
    const next = await server(page, (s) => s.push("hq"))
    await expect(center.getByRole("button", { name: "新着 1 件を表示" })).toBeVisible()
    expect(await lastAccepted(page, "center")).toBe(true)
    expect((await deliveries(page)).at(-1)!.ids).toEqual([next])
  })

  test("after unsubscribing (unmount), a late notification is not accepted", async ({ page }) => {
    await openPage(page)
    await expect(trigger(page)).toHaveAccessibleName(/未読 3 件/)
    await server(page, (s) => (s.holdDeliveries = true))
    await server(page, (s) => s.push("hq"))
    await centerDemo(page).getByTestId("ntf-center-mount").click()
    await expect(trigger(page)).toHaveCount(0)
    await server(page, (s) => s.releaseDeliveries())
    await expect.poll(() => lastAccepted(page, "center")).toBe(false)
    // 同じ時点の、解除していない購読（専用のページ）は受け付ける
    expect(await lastAccepted(page, "inbox")).toBe(true)
  })

  test("a scope change while fetching is paused: the old subscription is not accepted; resuming subscribes to the new scope", async ({ page }) => {
    await openPage(page)
    await expect(trigger(page)).toHaveAccessibleName(/未読 3 件/)
    await server(page, (s) => (s.holdDeliveries = true))
    await server(page, (s) => s.push("hq"))
    await centerDemo(page).getByTestId("ntf-center-pause").check()
    await ws(page).getByText("西日本営業部").click()
    await server(page, (s) => s.releaseDeliveries())
    await expect.poll(() => lastAccepted(page, "center")).toBe(false)
    // 取得を止めている間は、件数を示さない
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ")
    await server(page, (s) => (s.holdDeliveries = false))
    await centerDemo(page).getByTestId("ntf-center-pause").uncheck()
    await expect(trigger(page)).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("west").length} 件`)
    await server(page, (s) => s.push("west"))
    await expect.poll(() => lastAccepted(page, "center")).toBe(true)
    await expect(trigger(page)).toHaveAccessibleName(`お知らせ、未読 ${unreadSeed("west").length + 1} 件`)
  })

  test("an authorization change in the same workspace: the subscription from before the change is not accepted", async ({ page }) => {
    await openPage(page)
    const navTrigger = nav(page).getByTestId("ntf-trigger")
    await expect(navTrigger).toHaveAccessibleName(/未読 3 件/)
    await server(page, (s) => (s.holdDeliveries = true))
    const id = await server(page, (s) => s.push("hq"))
    await serverWith(page, (s, i) => s.deleteNotification("hq", i), id)
    const lists = (await requests(page, "list")).length
    await nav(page).getByTestId("ntf-nav-scope").click()
    await expect.poll(async () => (await requests(page, "list")).length).toBeGreaterThan(lists)
    await expect(navTrigger).toHaveAccessibleName(/未読 3 件/)
    await server(page, (s) => s.releaseDeliveries())
    await expect.poll(() => lastAccepted(page, "nav")).toBe(false)
    await settle(page)
    await expect(navTrigger).toHaveAccessibleName(/未読 3 件/)
    const center = await openCenter(page, nav(page))
    await expect(item(center, id)).toHaveCount(0)
  })
})

// ------------------------------------------------------------------ 既読・未読の更新（v0.1 の最終調整）
test.describe("Read updates: ordering, partial results, verification", () => {
  const trigger = (page: Page) => centerDemo(page).getByTestId("ntf-trigger")
  const total = unreadSeed("hq").length

  test("the same ID read → unread → read: only the last request decides, in any response order", async ({ page }) => {
    await openPage(page)
    await server(page, (s) => (s.ignoreAbort = true))
    await hold(page, "read")
    const center = await openCenter(page)
    for (let i = 1; i <= 3; i++) {
      await toggle(center, "n-103").click()
      await waitHeld(page, "read", i)
    }
    await expect(item(center, "n-103")).toHaveAttribute("data-read", "")
    // 最後の要求（既読）の応答を先に返し、前の 2 件（既読、未読）の応答を後で返す
    await release(page, "read", { which: "last" })
    await expect(trigger(page)).toHaveAttribute("aria-label", `お知らせ、未読 ${total - 1} 件`)
    await release(page, "read", { which: "last" }) // 未読に戻す（古い）
    await release(page, "read") // 既読にする（最も古い）
    await settle(page)
    await expect(item(center, "n-103")).toHaveAttribute("data-read", "")
    await expect(trigger(page)).toHaveAttribute("aria-label", `お知らせ、未読 ${total - 1} 件`)
    await expect(center.locator("[data-slot=notification-update-error]")).toHaveCount(0)
    // 模擬のサーバーは受け付けた順に処理する（最後の要求の値）
    expect((await stored(page, "hq")).find((n) => n.id === "n-103")!.read).toBe(true)
  })

  test("an individual unread during read all is kept; the older read-all result does not overwrite it", async ({ page }) => {
    await openPage(page)
    await hold(page, "readAll")
    const center = await openCenter(page)
    await center.getByRole("button", { name: "すべて既読にする" }).click()
    await waitHeld(page, "readAll")
    await expect(item(center, "n-102")).toHaveAttribute("data-read", "")
    // 一括既読の処理中に、1 件を未読に戻す（こちらの応答は先に返る）
    await toggle(center, "n-102").click()
    await expect.poll(async () => (await stored(page, "hq")).find((n) => n.id === "n-102")!.read).toBe(false)
    await releaseAll(page, "readAll")
    await expect(center.locator("[data-slot=notification-live]")).toHaveText(`${total} 件を既読にしました`)
    await settle(page)
    await expect(item(center, "n-102")).not.toHaveAttribute("data-read")
    await expect(item(center, "n-101")).toHaveAttribute("data-read", "")
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読 1 件")
    expect((await stored(page, "hq")).filter((n) => !n.read).map((n) => n.id)).toEqual(["n-102"])
  })

  test("unknown result: shown as verifying with an unknown count until the re-fetch confirms it", async ({ page }) => {
    await openPage(page)
    await server(page, (s) => (s.outcomeNext.read = "unknown"))
    await hold(page, "list")
    const center = await openCenter(page)
    await toggle(center, "n-101").click()
    await waitHeld(page, "list")
    await expect(item(center, "n-101")).toHaveAttribute("data-verifying", "")
    await expect(item(center, "n-101")).toContainText("状態を確認中")
    await expect(toggle(center, "n-101")).toHaveAttribute("aria-disabled", "true")
    // 結果が確定するまで件数を示さない（未読があることだけがわかる）
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読あり")
    await expect(center.locator("[data-slot=notification-update-error]")).toContainText("更新できたかを確認できませんでした")
    await releaseAll(page, "list")
    await expect(item(center, "n-101")).not.toHaveAttribute("data-verifying")
    await expect(item(center, "n-101")).toHaveAttribute("data-read", "")
    await expect(trigger(page)).toHaveAttribute("aria-label", `お知らせ、未読 ${total - 1} 件`)
  })

  // M3：製品の通信の層が、同じスコープの中で独自に中止した（タイムアウト、利用者の取り消し）AbortError。
  // サーバーでは処理されている（模擬のサーバーは要求を受け付けた時点で処理する）。結果が不明と同じに扱い、更新中のまま残さない。
  test("an AbortError in the same scope (product timeout): treated as unknown and re-fetched, not left updating", async ({ page }) => {
    await openPage(page)
    await hold(page, "read", "list")
    const center = await openCenter(page)
    await toggle(center, "n-101").click()
    await waitHeld(page, "read")
    await expect(item(center, "n-101")).toHaveAttribute("data-read", "")
    const lists = (await requests(page, "list")).length
    expect(await release(page, "read", { outcome: "abort" })).toBe(1)
    // 取得し直しを始め（応答は保留）、その間は「確認中」で、件数を示さない
    await waitHeld(page, "list")
    expect((await requests(page, "list")).length).toBe(lists + 1)
    await expect(item(center, "n-101")).toHaveAttribute("data-verifying", "")
    await expect(toggle(center, "n-101")).toHaveAttribute("aria-disabled", "true")
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読あり")
    await expect(center.locator("[data-slot=notification-update-error]")).toContainText("更新できたかを確認できませんでした")
    // 取得し直した結果（サーバーでは既読）で確定する
    await releaseAll(page, "list")
    await expect(item(center, "n-101")).not.toHaveAttribute("data-verifying")
    await expect(item(center, "n-101")).toHaveAttribute("data-read", "")
    await expect(trigger(page)).toHaveAttribute("aria-label", `お知らせ、未読 ${total - 1} 件`)
    // 次の操作を受け付ける（未読に戻す）
    await toggle(center, "n-101").click()
    await waitHeld(page, "read")
    await releaseAll(page, "read")
    await expect(item(center, "n-101")).not.toHaveAttribute("data-read")
    await expect(trigger(page)).toHaveAttribute("aria-label", `お知らせ、未読 ${total} 件`)
    expect((await stored(page, "hq")).find((n) => n.id === "n-101")!.read).toBe(false)
  })

  test("read all ending with an AbortError in the same scope: the running range is released and the result is re-fetched", async ({ page }) => {
    await openPage(page)
    await hold(page, "readAll", "list")
    const center = await openCenter(page)
    const readAllButton = center.locator("[data-slot=notification-read-all]")
    await readAllButton.click()
    await waitHeld(page, "readAll")
    await expect(readAllButton).toHaveAttribute("data-loading", "true")
    await expect(center.getByText(`${total} 件を既読にしています`)).toBeVisible()
    expect(await release(page, "readAll", { outcome: "abort" })).toBe(1)
    await waitHeld(page, "list")
    // 一括既読の実行中の範囲を解除する（「既読にしています」のまま残らない）。範囲の通知は確認中で、件数は示さない
    await expect(center.getByText(/件を既読にしています/)).toHaveCount(0)
    await expect(center.locator("[data-notification-id][data-verifying]")).toHaveCount(total)
    await expect(readAllButton).toBeHidden()
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ")
    await expect(center.locator("[data-slot=notification-update-error]")).toContainText("更新できたかを確認できませんでした")
    await releaseAll(page, "list")
    await expect(center.locator("[data-notification-id][data-verifying]")).toHaveCount(0)
    await expect(center.locator("[data-notification-id]:not([data-read])")).toHaveCount(0)
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読なし")
    expect((await stored(page, "hq")).filter((n) => !n.read)).toHaveLength(0)
    // 新着が届いた後に、もう一度一括既読を始められる（前の範囲が残っていない）
    const newId = await server(page, (s) => s.push("hq"))
    await center.getByRole("button", { name: "新着 1 件を表示" }).click()
    await expect(item(center, newId)).not.toHaveAttribute("data-read")
    await readAllButton.click()
    await waitHeld(page, "readAll")
    await releaseAll(page, "readAll")
    await expect(item(center, newId)).toHaveAttribute("data-read", "")
    expect((await requests(page, "readAll")).length).toBe(2)
  })

  test("a deleted notification and a notification without access are not updated: reverted, explained, re-fetched", async ({ page }) => {
    await openPage(page)
    const list = inbox(page)
    await expect(item(list, "n-102")).toBeVisible()
    await server(page, (s) => s.deleteNotification("hq", "n-102"))
    await toggle(list, "n-102").click()
    const error = list.locator("[data-slot=notification-update-error]")
    await expect(error).toContainText("1 件は既読にできませんでした（削除されたか、閲覧できなくなったお知らせです）")
    await expect(item(list, "n-102")).toHaveCount(0)
    await server(page, (s) => s.hideNotification("n-103"))
    await toggle(list, "n-103").click()
    await expect(error).toContainText("1 件は既読にできませんでした")
    await expect(item(list, "n-103")).toHaveCount(0)
    expect((await stored(page, "hq")).find((n) => n.id === "n-103")!.read).toBe(false)
  })

  test("duplicate IDs in the list are shown and counted once", async ({ page }) => {
    await openPage(page)
    await server(page, (s) => (s.duplicateInList = true))
    const ws = centerDemo(page).getByRole("group", { name: "ワークスペース" })
    await ws.getByText("西日本営業部").click()
    await ws.getByText("本社営業部").click()
    await expect(trigger(page)).toHaveAccessibleName(`お知らせ、未読 ${total} 件`)
    const center = await openCenter(page)
    await expect(item(center, "n-101")).toHaveCount(1)
  })

  test("a server count that disagrees with a complete list: the list is used", async ({ page }) => {
    await openPage(page)
    await server(page, (s) => (s.countOffset = -2))
    const ws = centerDemo(page).getByRole("group", { name: "ワークスペース" })
    await ws.getByText("西日本営業部").click()
    await ws.getByText("本社営業部").click()
    await expect(trigger(page)).toHaveAccessibleName(`お知らせ、未読 ${total} 件`)
  })

  test("a held arrival that the re-fetched list also contains is not counted twice", async ({ page }) => {
    await openPage(page)
    const center = await openCenter(page)
    const id = await server(page, (s) => s.push("hq"))
    await expect(center.getByRole("button", { name: "新着 1 件を表示" })).toBeVisible()
    await expect(trigger(page)).toHaveAttribute("aria-label", `お知らせ、未読 ${total + 1} 件`)
    // 結果が不明 → 取得し直す。取得した一覧に保留中の新着が含まれる
    await server(page, (s) => (s.outcomeNext.read = "unknown"))
    await toggle(center, "n-101").click()
    await expect(item(center, id)).toBeVisible()
    await expect(center.locator("[data-slot=notification-show-new]")).toHaveCount(0)
    const onServer = (await stored(page, "hq")).filter((n) => !n.read).length
    await expect(trigger(page)).toHaveAttribute("aria-label", `お知らせ、未読 ${onServer} 件`)
  })
})

// ------------------------------------------------------------------ 一括既読の結果（v0.1 の最終調整）
test.describe("Read-all results come from the confirmed response", () => {
  const live = (root: Locator) => root.locator("[data-slot=notification-live]")
  const trigger = (page: Page) => centerDemo(page).getByTestId("ntf-trigger")

  test("partial success: the count is the confirmed IDs, and the rest is explained", async ({ page }) => {
    await openPage(page)
    const center = await openCenter(page)
    await server(page, (s) => s.deleteNotification("hq", "n-102"))
    await center.getByRole("button", { name: "すべて既読にする" }).click()
    await expect(live(center)).toHaveText("2 件を既読にしました。1 件は既読にできませんでした")
    await expect(center.locator("[data-slot=notification-update-error]")).toContainText("1 件は既読にできませんでした")
    await expect(item(center, "n-102")).toHaveCount(0)
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読なし")
  })

  test("no result reported: the requested count is not announced; the state is verified by re-fetching", async ({ page }) => {
    await openPage(page)
    await server(page, (s) => (s.readReport = "none"))
    await hold(page, "list")
    const center = await openCenter(page)
    await center.getByRole("button", { name: "すべて既読にする" }).click()
    await waitHeld(page, "list")
    await expect(live(center)).toHaveText("既読にした件数を確認しています")
    await expect(center.locator("[data-notification-id][data-verifying]")).toHaveCount(unreadSeed("hq").length)
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ")
    await releaseAll(page, "list")
    await expect(center.locator("[data-notification-id][data-verifying]")).toHaveCount(0)
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読なし")
  })

  test("an invalid count (more than requested) is not used", async ({ page }) => {
    await openPage(page)
    await server(page, (s) => (s.readReport = "invalid-count"))
    const center = await openCenter(page)
    await center.getByRole("button", { name: "すべて既読にする" }).click()
    await expect(live(center)).toHaveText("既読にした件数を確認しています")
    await expect(center.locator("[data-notification-id][data-verifying]")).toHaveCount(0)
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読なし")
  })

  test("an out-of-range ID in the response (arrived during the run) is not counted or marked read", async ({ page }) => {
    await openPage(page)
    // 応答の時点で処理するサーバーが、処理中に届いた通知の ID を結果に含める（実際には更新しない）
    await server(page, (s) => {
      s.readReport = "extra-id"
      s.processAtResponse = true
    })
    await hold(page, "readAll")
    const center = await openCenter(page)
    await center.getByRole("button", { name: "すべて既読にする" }).click()
    await waitHeld(page, "readAll")
    const id = await server(page, (s) => s.push("hq"))
    await expect(center.getByRole("button", { name: "新着 1 件を表示" })).toBeVisible()
    await releaseAll(page, "readAll")
    // 範囲の外の ID を含む結果は、取得し直して確かめる（取得した一覧に新着が含まれ、保留は消える）
    await expect(center.locator("[data-slot=notification-show-new]")).toHaveCount(0)
    await expect(live(center)).toHaveText(`${unreadSeed("hq").length} 件を既読にしました`)
    await expect(item(center, id)).not.toHaveAttribute("data-read")
    expect((await stored(page, "hq")).find((n) => n.id === id)!.read).toBe(false)
    await expect(trigger(page)).toHaveAttribute("aria-label", "お知らせ、未読 1 件")
  })

  test("cursor range text says that unloaded notifications are included", async ({ page }) => {
    await openPage(page)
    const demo = page.getByTestId("ntf-inbox-demo")
    await demo.getByTestId("ntf-inbox-paging").click()
    await demo.getByText("開始した時点までのすべて（カーソル）").click()
    await expect(inbox(page).locator("[data-slot=notification-read-all]")).toHaveAccessibleDescription(/読み込んでいない古いお知らせを含む/)
  })
})

// ------------------------------------------------------------------ 通知から対象への移動の競合（v0.1 の最終調整）
test.describe("Navigation from a notification: changes between selection and move", () => {
  const nav = (page: Page) => page.getByTestId("ntf-nav-demo")

  test("workspace change while the target is checked: no move, not marked read, no notice", async ({ page, isMobile }) => {
    await openPage(page)
    await hold(page, "resolve")
    const center = await openCenter(page)
    await openButton(center, "n-102").click()
    await waitHeld(page, "resolve")
    await page.keyboard.press("Escape")
    if (isMobile) await expect(center).toBeHidden()
    await centerDemo(page).getByRole("group", { name: "ワークスペース" }).getByText("西日本営業部").click()
    await expect(centerDemo(page).getByTestId("ntf-trigger")).toHaveAccessibleName(/未読 2 件/)
    await releaseAll(page, "resolve")
    await settle(page)
    await expect(centerDemo(page).getByTestId("ntf-target")).toHaveCount(0)
    await expect(centerDemo(page)).toContainText("西日本営業部の顧客の一覧（例）")
    expect((await stored(page, "hq")).find((n) => n.id === "n-102")!.read).toBe(false)
    expect(await requests(page, "read")).toHaveLength(0)
    const west = await openCenter(page)
    await expect(west.locator("[data-slot=notification-navigate-notice]")).toHaveCount(0)
  })

  test("an older selection is superseded: only the last opened notification moves and is marked read", async ({ page }) => {
    await openPage(page)
    await hold(page, "resolve")
    const center = await openCenter(page)
    await openButton(center, "n-101").click()
    await waitHeld(page, "resolve", 1)
    await openButton(center, "n-103").click()
    await waitHeld(page, "resolve", 2)
    await release(page, "resolve") // 古い選択（n-101）の確認の応答
    await settle(page)
    await expect(centerDemo(page).getByTestId("ntf-target")).toHaveCount(0)
    await release(page, "resolve")
    await expect(centerDemo(page).getByTestId("ntf-target-title")).toHaveText(seed("hq")[2].target!.label)
    await expect.poll(async () => (await stored(page, "hq")).find((n) => n.id === "n-103")!.read).toBe(true)
    expect((await stored(page, "hq")).find((n) => n.id === "n-101")!.read).toBe(false)
  })

  test("authorization change while the target is checked: no move, not marked read", async ({ page, isMobile }) => {
    await openPage(page)
    await hold(page, "resolve")
    const center = await openCenter(page, nav(page))
    await openButton(center, "n-103").click()
    await waitHeld(page, "resolve")
    await page.keyboard.press("Escape")
    if (isMobile) await expect(center).toBeHidden()
    await nav(page).getByTestId("ntf-nav-scope").click()
    await releaseAll(page, "resolve")
    await settle(page)
    await expect(nav(page).getByTestId("ntf-target-title")).toHaveText("株式会社サンプルの詳細（編集中）")
    expect((await stored(page, "hq")).find((n) => n.id === "n-103")!.read).toBe(false)
  })

  test("target validation fails: not moved, the reason is shown, not marked read", async ({ page }) => {
    await openPage(page)
    await server(page, (s) => (s.outcomeNext.resolve = "fail"))
    const center = await openCenter(page, nav(page))
    await openButton(center, "n-103").click()
    await expect(center.locator("[data-slot=notification-navigate-notice]")).toContainText("対象を確認できませんでした")
    await expect(nav(page).getByTestId("ntf-target-title")).toHaveText("株式会社サンプルの詳細（編集中）")
    await settle(page)
    expect((await stored(page, "hq")).find((n) => n.id === "n-103")!.read).toBe(false)
    expect(await requests(page, "read")).toHaveLength(0)
  })

  test("sensitive content follows the current view permission: hidden title, no target, cannot be opened", async ({ page }) => {
    await openPage(page)
    await nav(page).getByTestId("ntf-nav-can-view").uncheck()
    const center = await openCenter(page, nav(page))
    for (const id of ["n-101", "n-102"]) {
      await expect(item(center, id)).toHaveAttribute("data-hidden-content", "")
      await expect(item(center, id)).toContainText("閲覧できない内容のお知らせ")
      await expect(item(center, id)).not.toContainText(title(id))
      await expect(item(center, id)).not.toContainText(seedNotifications.find((n) => n.id === id)!.target!.label)
      await expect(openButton(center, id)).toHaveCount(0)
      await expect(toggle(center, id)).toHaveAccessibleName("「閲覧できない内容のお知らせ」を既読にする")
    }
    // 顧客以外の通知は表示する
    await expect(openButton(center, "n-103")).toContainText(title("n-103"))
    // 権限が戻れば、取得し直さなくても表示する（モバイルの Sheet はモーダルのため、閉じてから操作する）
    await page.keyboard.press("Escape")
    await expect(center).toBeHidden()
    const lists = (await requests(page, "list")).length
    await nav(page).getByTestId("ntf-nav-can-view").check()
    const reopened = await openCenter(page, nav(page))
    await expect(openButton(reopened, "n-101")).toContainText(title("n-101"))
    expect((await requests(page, "list")).length).toBe(lists)
  })
})
