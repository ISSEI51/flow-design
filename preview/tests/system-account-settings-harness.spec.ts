import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"

// useInstantSettings と useSettingsForm（registry/patterns/setting-save.ts）の検品。preview/src/ssr/setting-save-harness.tsx を
// StrictMode で描画し、window.__ss の関数で、スコープの変更、操作、保留した要求の解放を行う。
// 確かめること：
// - 前のスコープの描画で hook が返した関数（古い closure）から始めた操作が、現在のスコープの状態を「保存中」「確認中」にしない。
// - 描画の中で ref を書き換えない：commit されない描画（suspend した transition）の後も、表示中のスコープの
//   二重の保存の防止、onSettled、待っていた変更の送信が、表示中のスコープの関数で行われる。
// 応答の順序は、保留した要求の解放の順で決める（固定の待機を使わない）。
collectPageErrors(test)

type Api = Window["__ss"]
const call = <K extends keyof Api>(page: Page, name: K, ...args: Parameters<Api[K]>) =>
  page.evaluate(([n, a]) => (window.__ss[n as keyof Api] as (...x: unknown[]) => unknown)(...(a as unknown[])), [name, args] as const) as Promise<
    ReturnType<Api[K]>
  >
/** 描画と effect が終わるまで待つ（時間ではなく、描画の 2 フレームと次のタスク） */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))))
const pending = async (page: Page, kind: string) => (await call(page, "calls")).filter((c) => c.kind === kind && !c.done)
const callsOf = async (page: Page, kind: string) => (await call(page, "calls")).filter((c) => c.kind === kind)

async function open(page: Page) {
  await page.route("**/ssr.html", async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace("/src/ssr/client.tsx", "/src/ssr/setting-save-harness.tsx")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr.html")
  await page.waitForFunction(() => window.__ssReady === true)
  await expect(page.getByTestId("ss-committed")).toHaveText("A")
  await settle(page)
}

async function setScope(page: Page, scope: string) {
  await call(page, "setScope", scope)
  await expect(page.getByTestId("ss-committed")).toHaveText(scope)
  await settle(page)
}

/** 新しいスコープの描画を始めるが、commit しない（画面は前のスコープのまま） */
async function suspendScope(page: Page, scope: string) {
  await call(page, "setScopeSuspended", scope)
  await settle(page)
  await expect(page.getByTestId("ss-committed")).not.toHaveText(scope)
}

test.describe("Settings hooks: calls from a previous scope's render", () => {
  test("change from an A closure after A → B: nothing is sent and B is not left 'saving'", async ({ page }) => {
    await open(page)
    await call(page, "keep", "A")
    await setScope(page, "B")
    expect(await call(page, "change", "x", true, "A")).toBe(false)
    await settle(page)
    const b = await call(page, "instant")
    expect(b.status).toEqual({})
    expect(b.pending).toBe(false)
    expect(b.values.x).toBe(false)
    expect(await callsOf(page, "save")).toEqual([])
    // B の描画の関数からは送る
    expect(await call(page, "change", "x", true)).toBe(true)
    await expect.poll(async () => (await pending(page, "save")).map((c) => c.scope)).toEqual(["B"])
  })

  test("A → B → A: a closure from the first A does not start operations in the second A", async ({ page }) => {
    await open(page)
    await call(page, "keep", "A1")
    await setScope(page, "B")
    await setScope(page, "A")
    expect(await call(page, "change", "x", true, "A1")).toBe(false)
    await call(page, "verify", "x", "A1")
    expect(await call(page, "replace", { y: "from-first-A" }, undefined, "A1")).toBe(false)
    const many = await call(page, "changeMany", { x: true, y: "b" }, "A1")
    const submit = await call(page, "submit", "A1")
    await call(page, "formVerify", "A1")
    await expect.poll(() => call(page, "outcome", many)).toBe("aborted")
    await expect.poll(() => call(page, "outcome", submit)).toBe("aborted")
    await settle(page)
    const a = await call(page, "instant")
    expect(a).toMatchObject({ values: { x: false, y: "a" }, status: {}, pending: false })
    expect((await call(page, "form")).status).toEqual({ state: "idle" })
    expect(await call(page, "calls")).toEqual([])
  })

  test("explicit save: setValue and discard from an A closure do not change the form state of B", async ({ page }) => {
    await open(page)
    await call(page, "keep", "A")
    await setScope(page, "B")
    await call(page, "setValue", "b-input")
    await settle(page)
    expect((await call(page, "form")).values).toEqual({ name: "b-input" })
    // 前のスコープの関数からの入力と破棄は、B の入力を変えない
    await call(page, "setValue", "from-A", "A")
    await call(page, "discard", "A")
    await settle(page)
    expect((await call(page, "form")).values).toEqual({ name: "b-input" })
    // B の関数からの破棄は行う
    await call(page, "discard")
    await settle(page)
    expect((await call(page, "form")).values).toEqual({ name: "a" })
  })
})

test.describe("Settings hooks: no ref writes during render", () => {
  test("explicit save: a render of B that is not committed does not allow a second save in the displayed A", async ({ page }) => {
    await open(page)
    const first = await call(page, "submit")
    await expect.poll(async () => (await pending(page, "form")).length).toBe(1)
    await settle(page)
    await suspendScope(page, "B")
    // 画面は A のまま、保存中。2 回目の保存は送らない
    const second = await call(page, "submit")
    await expect.poll(() => call(page, "outcome", second)).toBe("busy")
    expect((await callsOf(page, "form")).length).toBe(1)
    expect((await call(page, "form")).status).toEqual({ state: "saving" })
    // transition を取りやめて A に戻し、保存の応答を返す
    await setScope(page, "A")
    const [req] = await pending(page, "form")
    await call(page, "resolve", req.id, { name: "a" })
    await expect.poll(() => call(page, "outcome", first)).toBe("saved")
    await settle(page)
    expect((await call(page, "form")).status).toEqual({ state: "saved" })
  })

  test("explicit save: after B is committed, A's in-flight save does not block saving in B", async ({ page }) => {
    await open(page)
    await call(page, "submit")
    await expect.poll(async () => (await pending(page, "form")).length).toBe(1)
    await setScope(page, "B")
    const inB = await call(page, "submit")
    await expect.poll(async () => (await pending(page, "form")).map((c) => c.scope)).toEqual(["A", "B"])
    const b = (await pending(page, "form")).find((c) => c.scope === "B")!
    await call(page, "resolve", b.id, { name: "a" })
    await expect.poll(() => call(page, "outcome", inB)).toBe("saved")
  })

  test("instant save: a render of B that is not committed does not reset the displayed A state (no setState during render)", async ({ page }) => {
    await open(page)
    expect(await call(page, "change", "x", true)).toBe(true)
    await expect.poll(async () => (await pending(page, "save")).length).toBe(1)
    await settle(page)
    await suspendScope(page, "B")
    const [req] = await pending(page, "save")
    await call(page, "reject", req.id, "failed")
    // A の状態に、確定した失敗を反映する（B の描画の初期の状態で上書きしない）
    await expect.poll(async () => (await call(page, "instant")).status.x?.state).toBe("failed")
    expect((await call(page, "instant")).values.x).toBe(false)
    await expect(page.getByTestId("ss-committed")).toHaveText("A")
  })

  test("instant save: onSettled of the displayed A runs after a render of B that is not committed (verify starts in A)", async ({ page }) => {
    await open(page)
    await call(page, "setAutoVerify", true)
    await settle(page)
    expect(await call(page, "change", "x", true)).toBe(true)
    await expect.poll(async () => (await pending(page, "save")).length).toBe(1)
    await suspendScope(page, "B")
    const [req] = await pending(page, "save")
    await call(page, "reject", req.id, "unknown")
    // onSettled は、commit された A の描画の関数で呼ばれ、A の verify が確認の要求を送る
    await expect.poll(async () => (await pending(page, "verify")).map((c) => [c.scope, c.aborted])).toEqual([["A", false]])
    await settle(page)
    expect((await call(page, "instant")).status.x).toEqual({ state: "verifying" })
    const [v] = await pending(page, "verify")
    await call(page, "resolve", v.id, true)
    await expect.poll(async () => (await call(page, "instant")).status.x).toEqual({ state: "saved" })
    expect((await call(page, "instant")).values.x).toBe(true)
  })

  test("versioned: a waiting change is sent by the displayed A after a render of B that is not committed", async ({ page }) => {
    await open(page)
    await call(page, "setVersioned", true)
    await settle(page)
    expect(await call(page, "change", "x", true)).toBe(true)
    await expect.poll(async () => (await pending(page, "save")).length).toBe(1)
    await settle(page)
    // 前の要求の結果を待つ間の変更（送らずに待つ）
    expect(await call(page, "change", "x", false)).toBe(true)
    await settle(page)
    expect((await callsOf(page, "save")).length).toBe(1)
    await suspendScope(page, "B")
    const [first] = await pending(page, "save")
    expect(first.ifMatch).toBe(0)
    await call(page, "resolve", first.id, true, 1)
    // 待っていた OFF を、応答の版（1）で送る
    await expect.poll(async () => (await pending(page, "save")).map((c) => [c.scope, c.value, c.ifMatch])).toEqual([["A", false, 1]])
    const [next] = await pending(page, "save")
    await call(page, "resolve", next.id, false, 2)
    await expect.poll(async () => (await call(page, "instant")).status.x).toEqual({ state: "saved" })
    expect((await call(page, "instant")).pending).toBe(false)
  })
})
