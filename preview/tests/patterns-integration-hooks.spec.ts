import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"

// 共通の hook の横断の検品（Patterns Integration Review の 6.2、6.3）。preview/src/ssr/hooks-harness.tsx を StrictMode で描画し、
// window.__h の関数で、スコープの変更（urgent、transition、commit されない transition）、要求の保留と解放を行う。
// 確かめること
// - commit されない描画（suspend した transition の描画）が、表示中のスコープの操作と状態に影響しない（描画の中で ref を書き換えない）
// - 古い描画の関数（A → B → A の最初の A を含む）から、新しいスコープの操作を始めない
// - 新しいスコープの最初の commit で、前のスコープの値と状態を表示しない
// - commit から passive effect までの間に届いた古い結果を反映しない
collectPageErrors(test)

type Call = { id: number; kind: string; scope: string; payload?: unknown; done: boolean; aborted: boolean }
type LogEntry = Record<string, unknown> & { kind: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h = <T = unknown>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as any).__h[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>
/** 描画と effect が終わるまで待つ（時間ではなく、描画の 2 フレームと次のタスク） */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))))
const calls = (page: Page) => h<Call[]>(page, "calls")
const log = (page: Page) => h<LogEntry[]>(page, "log")
const dom = async <T,>(page: Page, id: string) => JSON.parse((await h<string>(page, "dom", id)) ?? "null") as T

async function open(page: Page, which: string) {
  await page.route("**/ssr.html*", async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace("/src/ssr/client.tsx", "/src/ssr/hooks-harness.tsx")
    await route.fulfill({ response: res, body })
  })
  await page.goto(`/ssr.html?case=${which}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.waitForFunction(() => (window as any).__ready === true)
  await expect(page.getByTestId("committed")).toHaveText("A")
  await settle(page)
}

/** 新しいスコープへの transition を始め、その描画を suspend させて commit しない（画面は A のまま） */
async function holdTransition(page: Page, scope: string) {
  await h(page, "setScopeSuspended", scope)
  await settle(page)
  await expect(page.getByTestId("committed")).toHaveText("A")
}

async function setScope(page: Page, scope: string) {
  await h(page, "setScope", scope)
  await expect(page.getByTestId("committed")).toHaveText(scope)
  await settle(page)
}

test.describe("shared hooks: uncommitted renders and stale closures", { tag: "@webkit" }, () => {
  test("bulk action: a result arriving while a scope transition is held is applied to the shown scope", async ({ page }) => {
    await open(page, "bulk")
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      void w.__h.hook("bulk").start("delete", { kind: "ids", ids: ["r1"], scope: "A" }, null).then((r: unknown) => (w.__r1 = r ? "result" : "undefined"))
    })
    await expect.poll(async () => (await calls(page)).length).toBe(1)
    await holdTransition(page, "B")
    const [first] = await calls(page)
    await h(page, "resolve", first.id, [{ id: "r1", outcome: "succeeded" }])
    await settle(page)
    // 表示中の A の画面に結果を示す（commit されない B の描画のスコープで捨てない）
    await expect.poll(() => dom<{ running: boolean; summary: number | null }>(page, "bulk")).toEqual({ scope: "A", running: false, summary: 1 })
    expect(await page.evaluate(() => (window as unknown as { __r1: string }).__r1)).toBe("result")
    expect((await log(page)).some((l) => l.kind === "bulk-settled" && l.scope === "A")).toBe(true)
  })

  test("bulk action: start() from the first A after A → B → A sends no request", async ({ page }) => {
    await open(page, "bulk")
    await h(page, "keep", "firstA")
    await setScope(page, "B")
    await setScope(page, "A")
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (window as any).__h.hook("bulk", "firstA").start("undo", { kind: "ids", ids: ["r1"], scope: "A" }, null)
    })
    await settle(page)
    expect(await calls(page)).toHaveLength(0)
    // 現在の A の start は実行できる
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (window as any).__h.hook("bulk").start("undo", { kind: "ids", ids: ["r1"], scope: "A" }, null)
    })
    await expect.poll(async () => (await calls(page)).length).toBe(1)
  })

  test("bulk action: unknown rows are resolved only from a lookup started in the current scope", async ({ page }) => {
    await open(page, "bulk")
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (window as any).__h.hook("bulk").start("delete", { kind: "ids", ids: ["r1", "r2", "r3"], scope: "A" }, null)
    })
    await expect.poll(async () => (await calls(page)).length).toBe(1)
    const [first] = await calls(page)
    await h(page, "resolve", first.id, [
      { id: "r1", outcome: "unknown" },
      { id: "r2", outcome: "unknown" },
      { id: "r3", outcome: "unknown" },
    ])
    await settle(page)
    type Summary = { succeeded: { id: string }[]; failed: { id: string }[]; unknown: { id: string }[] }
    const summary = () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__h.hook("bulk").summary as Summary
        return { succeeded: s.succeeded.map((i) => i.id), failed: s.failed.map((i) => i.id), unknown: s.unknown.map((i) => i.id) }
      })
    expect(await summary()).toEqual({ succeeded: [], failed: [], unknown: ["r1", "r2", "r3"] })
    // 照会を始めたときの Snapshot。照会の結果は、行ごとに完了と確定した失敗へ移す。確かめられなかった行は不明のまま
    const resolved = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = (window as any).__h.hook("bulk")
      const from = b.capture()
      return b.resolveUnknown([{ id: "r1", outcome: "succeeded" }, { id: "r2", outcome: "failed", message: "処理されていませんでした" }], { from })
    })
    expect(resolved).toBe(2)
    await settle(page)
    expect(await summary()).toEqual({ succeeded: ["r1"], failed: ["r2"], unknown: ["r3"] })
    // 照会の間にスコープが変わった（A → B → A）場合は、最初の A で取った Snapshot の照会の結果を反映しない
    const old = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      w.__oldFrom = w.__h.hook("bulk").capture()
      return true
    })
    expect(old).toBe(true)
    await setScope(page, "B")
    await setScope(page, "A")
    const stale = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      return w.__h.hook("bulk").resolveUnknown([{ id: "r3", outcome: "succeeded" }], { from: w.__oldFrom })
    })
    expect(stale).toBe(0)
  })

  test("notification feed: a read update from the shown scope uses that scope's updateRead while a transition is held", async ({ page }) => {
    await open(page, "feed")
    await expect.poll(async () => (await dom<{ items: string[] }>(page, "feed")).items).toEqual(["A-n1"])
    await holdTransition(page, "B")
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (window as any).__h.hook("feed").setRead("A-n1", true)
    })
    await expect.poll(async () => (await log(page)).filter((l) => l.kind === "updateRead-called")).toEqual([
      { kind: "updateRead-called", closureScope: "A", ids: ["A-n1"] },
    ])
  })

  test("autosave: flush while a transition is held saves the shown document with its own save", async ({ page }) => {
    await open(page, "autosave")
    await h(page, "setText", "A", "a1-edited")
    await settle(page)
    await holdTransition(page, "B")
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (window as any).__h.hook("autosave").flush()
    })
    await expect.poll(async () => (await log(page)).filter((l) => l.kind === "autosave-called")).toEqual([
      { kind: "autosave-called", closureScope: "A", value: "a1-edited" },
    ])
  })

  test("instant save: the first commit of a new scope shows that scope's value; an old closure starts nothing", async ({ page }) => {
    await open(page, "instant")
    await h(page, "keep", "A")
    await setScope(page, "B")
    // B の最初の commit から、B のサーバーの値（false）と idle を示す（A の値 true を 1 回も示さない）
    const commits = (await log(page)).filter((l) => l.kind === "instant-commit" && l.scope === "B")
    expect(commits.length).toBeGreaterThan(0)
    for (const c of commits) expect(c).toMatchObject({ value: false, status: "idle" })
    // A の描画の change と check は、B の状態を変えず、要求を送らない
    expect(await page.evaluate(() => (window as unknown as { __h: { hook: (n: string, f: string) => { change: (v: boolean) => boolean } } }).__h.hook("instant", "A").change(true))).toBe(false)
    expect(await page.evaluate(() => (window as unknown as { __h: { hook: (n: string, f: string) => { check: () => Promise<boolean> } } }).__h.hook("instant", "A").check())).toBe(false)
    await settle(page)
    expect(await calls(page)).toHaveLength(0)
    expect(await dom(page, "instant")).toEqual({ scope: "B", value: false, status: "idle" })
  })

  test("instant save: a result released at the commit of the next scope is not shown in it", async ({ page }) => {
    await open(page, "instant")
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__h.hook("instant").change(false)
    })
    await expect.poll(async () => (await calls(page)).length).toBe(1)
    const [first] = await calls(page)
    // B の commit の layout effect の中で、A の保存の応答を解放する（commit から passive effect までの間）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate((id) => ((window as any).__raceArm = { scope: "B", id, value: undefined }), first.id)
    await h(page, "setScopeTransition", "B")
    await expect(page.getByTestId("committed")).toHaveText("B")
    await settle(page)
    expect(await dom(page, "instant")).toEqual({ scope: "B", value: false, status: "idle" })
    for (const c of (await log(page)).filter((l) => l.kind === "instant-commit" && l.scope === "B")) expect(c).toMatchObject({ status: "idle" })
  })

  test("form state: the first commit of a new scope shows its own values and no saving state; an old submit sends nothing", async ({ page }) => {
    await open(page, "form")
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__h.hook("form").setValue("name", "A-edited")
    })
    await settle(page)
    await h(page, "keep", "A")
    await setScope(page, "B")
    const commits = (await log(page)).filter((l) => l.kind === "form-commit" && l.scope === "B")
    expect(commits.length).toBeGreaterThan(0)
    for (const c of commits) expect(c).toMatchObject({ name: "B-name", status: "idle", formError: null, submitted: null })
    // A の描画で作った送信の処理は、B の値を A の save に渡さない
    expect(await page.evaluate(() => (window as unknown as { __h: { hook: (n: string, f: string) => { submit: () => Promise<boolean> } } }).__h.hook("form", "A").submit())).toBe(false)
    expect(await page.evaluate(() => (window as unknown as { __h: { hook: (n: string, f: string) => { setValue: (k: string, v: string) => boolean } } }).__h.hook("form", "A").setValue("name", "X"))).toBe(undefined)
    await settle(page)
    expect((await log(page)).filter((l) => l.kind === "form-save-called")).toEqual([])
    expect(await dom(page, "form")).toMatchObject({ scope: "B", name: "B-name", status: "idle" })
  })

  for (const mode of ["setScopeTransition", "setScope"] as const) {
    test(`form state: a save released at the commit of the next scope does not call onSuccess there (${mode})`, async ({ page }) => {
      await open(page, "form")
      await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (window as any).__h.hook("form").submit()
      })
      await expect.poll(async () => (await calls(page)).length).toBe(1)
      const [first] = await calls(page)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.evaluate((id) => ((window as any).__raceArm = { scope: "B", id, value: { status: "success" } }), first.id)
      await h(page, mode, "B")
      await expect(page.getByTestId("committed")).toHaveText("B")
      await settle(page)
      expect((await log(page)).some((l) => l.kind === "race-resolve-at-commit")).toBe(true)
      expect((await log(page)).filter((l) => l.kind === "form-onSuccess")).toEqual([])
      expect(await dom(page, "form")).toMatchObject({ scope: "B", status: "idle" })
    })
  }

  test("bulk selection: while a query transition is held, the shown selection is fixed and changed from the shown state", async ({ page }) => {
    await open(page, "selection")
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__h.hook("selection").selectAllMatching()
    })
    await settle(page)
    expect(await dom(page, "selection")).toMatchObject({ mode: "all", count: 100 })
    await h(page, "setQSuspended", "q2")
    await settle(page)
    const snap = await page.evaluate(() => (window as unknown as { __h: { hook: (n: string) => { snapshot: () => unknown } } }).__h.hook("selection").snapshot())
    expect(snap).toMatchObject({ kind: "query", queryKey: "q1", excludedIds: [] })
    await page.evaluate(() => (window as unknown as { __h: { hook: (n: string) => { setSelected: (id: string, v: boolean) => void } } }).__h.hook("selection").setSelected("r2", false))
    await settle(page)
    // 全件の選択のまま、r2 だけを除外する（commit されない描画の「解除された選択」から変更しない）
    expect(await dom(page, "selection")).toMatchObject({ mode: "all", count: 99 })
  })
})
