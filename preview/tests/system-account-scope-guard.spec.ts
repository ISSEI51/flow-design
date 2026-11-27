import { expect, test, type Page } from "@playwright/test"

import { collectPageErrors } from "./page-errors"

// useScopeGuard（registry/patterns/scope-guard.ts）の検品。preview/src/ssr/scope-guard-harness.tsx を StrictMode で描画し、
// window.__sg の関数で、スコープの変更、処理の開始、照合、アンマウントを行う。
// 確かめること：古い結果の無効化（世代）と、古い操作の開始の防止（Snapshot）を区別する。
collectPageErrors(test)

type Api = Window["__sg"]
const call = <K extends keyof Api>(page: Page, name: K, ...args: Parameters<Api[K]>) =>
  page.evaluate(([n, a]) => (window.__sg[n as keyof Api] as (...x: unknown[]) => unknown)(...(a as unknown[])), [name, args] as const) as Promise<
    ReturnType<Api[K]>
  >
/** 描画と effect が終わるまで待つ（時間ではなく、描画の 2 フレームと次のタスク） */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))))

async function open(page: Page) {
  await page.route("**/ssr.html", async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace("/src/ssr/client.tsx", "/src/ssr/scope-guard-harness.tsx")
    await route.fulfill({ response: res, body })
  })
  await page.goto("/ssr.html")
  await page.waitForFunction(() => window.__sgReady === true)
  await expect(page.getByTestId("sg-committed")).toHaveText("A")
  await settle(page)
}

async function setScope(page: Page, scope: string) {
  await call(page, "setScope", scope)
  await expect(page.getByTestId("sg-committed")).toHaveText(scope)
  await settle(page)
}

test.describe("useScopeGuard", { tag: "@webkit" }, () => {
  test("A → B → A: a ticket from the first A is not current in the second A (generation, not the scope value)", async ({ page }) => {
    await open(page)
    const first = (await call(page, "begin", "save"))!
    expect(await call(page, "isLatest", first)).toBe(true)
    await setScope(page, "B")
    expect(await call(page, "isLatest", first)).toBe(false)
    expect(await call(page, "aborted", first)).toBe(true)
    await setScope(page, "A")
    expect(await call(page, "scope")).toBe("A")
    // 同じ scopeKey（A）でも、最初の A の世代の結果は反映しない
    expect(await call(page, "isLatest", first)).toBe(false)
    expect(await call(page, "isSameScope", first)).toBe(false)
    const second = (await call(page, "begin", "save"))!
    expect(await call(page, "isLatest", second)).toBe(true)
    expect(await call(page, "generation", second)).toBeGreaterThan(await call(page, "generation", first))
  })

  test("the same key: only the last started operation is the latest; an older one does not overwrite it", async ({ page }) => {
    await open(page)
    const on = (await call(page, "begin", "digest"))!
    const off = (await call(page, "begin", "digest"))!
    const other = (await call(page, "begin", "theme"))!
    expect(await call(page, "isLatest", on)).toBe(false)
    expect(await call(page, "isSameScope", on)).toBe(true)
    expect(await call(page, "isLatest", off)).toBe(true)
    expect(await call(page, "isLatest", other)).toBe(true)
    // 同じキーの前の処理は中止しない（保存の要求を中止しても、サーバーで処理されることがあるため）
    expect(await call(page, "aborted", on)).toBe(false)
  })

  test("an operation from an old screen or Toast (snapshot) is not started after the scope changed, and does not invalidate the current one", async ({ page }) => {
    await open(page)
    // 最初の A で Toast を作った（Snapshot を保存した）
    const toastSnapshot = await call(page, "capture")
    await setScope(page, "B")
    await setScope(page, "A")
    // 現在の A で始めた処理
    const current = (await call(page, "begin", "undo"))!
    expect(await call(page, "isLatest", current)).toBe(true)
    // 最初の A の Toast の「元に戻す」：スコープの値は同じ A でも、世代が違うため始めない
    expect(await call(page, "isCurrentSnapshot", toastSnapshot)).toBe(false)
    expect(await call(page, "beginIfCurrent", toastSnapshot, "undo")).toBeNull()
    // 始めなかった操作は、現在の処理を無効にしない
    expect(await call(page, "isLatest", current)).toBe(true)
    // 現在の世代の Snapshot からは始められる。始めた処理が、そのキーの最新になる
    const fresh = await call(page, "capture")
    const started = await call(page, "beginIfCurrent", fresh, "undo")
    expect(started).not.toBeNull()
    expect(await call(page, "isLatest", started!)).toBe(true)
    expect(await call(page, "isLatest", current)).toBe(false)
  })

  test("after unmount: results are not applied, signals are aborted, and new operations start already invalid", async ({ page }) => {
    await open(page)
    const t = (await call(page, "begin", "save"))!
    const snap = await call(page, "capture")
    await call(page, "setMounted", false)
    await settle(page)
    expect(await call(page, "aborted", t)).toBe(true)
    // アンマウントの後は guard が登録から外れる（検品から呼べない）。再マウントは新しいインスタンス
    await call(page, "setMounted", true)
    await settle(page)
    // 別のインスタンス（再マウント後）は、前のインスタンスの Ticket と Snapshot を受け付けない
    expect(await call(page, "isLatest", t)).toBe(false)
    expect(await call(page, "isCurrentSnapshot", snap)).toBe(false)
    expect(await call(page, "beginIfCurrent", snap, "save")).toBeNull()
  })

  test("begin from a value returned in a previous scope's render (an old closure) gives an invalid ticket", async ({ page }) => {
    await open(page)
    // A の描画で返した値を、古い画面の closure として保持する
    await page.evaluate(() => {
      const w = window as unknown as { __oldGuard: unknown; __sg: { guardOf: (n?: string) => unknown } }
      w.__oldGuard = w.__sg.guardOf()
    })
    await setScope(page, "B")
    const result = await page.evaluate(() => {
      const w = window as unknown as { __oldGuard: { begin: (k: string) => { generation: number; signal: AbortSignal } } }
      const t = w.__oldGuard.begin("undo")
      return { generation: t.generation, aborted: t.signal.aborted }
    })
    expect(result).toEqual({ generation: -1, aborted: true })
    // 現在の B の処理には影響しない
    const current = (await call(page, "begin", "undo"))!
    expect(await call(page, "isLatest", current)).toBe(true)
  })

  test("A → B → A: begin and capture from the first A's value (old closure) are invalid and do not affect the current A", async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      const w = window as unknown as { __firstA: unknown; __sg: { guardOf: (n?: string) => unknown } }
      w.__firstA = w.__sg.guardOf()
    })
    await setScope(page, "B")
    await setScope(page, "A")
    const current = (await call(page, "begin", "undo"))!
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __firstA: { begin: (k: string) => { generation: number; signal: AbortSignal }; capture: () => { generation: number }; scope: string }
        __sg: { guardOf: (n?: string) => unknown }
      }
      const stale = w.__firstA.begin("undo")
      return {
        sameObject: w.__firstA === w.__sg.guardOf(),
        scope: w.__firstA.scope,
        generation: stale.generation,
        aborted: stale.signal.aborted,
        snapshotGeneration: w.__firstA.capture().generation,
      }
    })
    expect(result).toEqual({ sameObject: false, scope: "A", generation: -1, aborted: true, snapshotGeneration: -1 })
    // 現在の値の Snapshot を、最初の A の値の beginIfCurrent と isCurrent に渡しても、始めない（null）、現在とは認めない
    const fromStale = await page.evaluate(() => {
      const w = window as unknown as {
        __firstA: { beginIfCurrent: (s: unknown, k: string) => unknown; isCurrent: (s: unknown) => boolean }
        __sg: { guardOf: (n?: string) => { capture: () => unknown } }
      }
      const snapshot = w.__sg.guardOf().capture()
      return { started: w.__firstA.beginIfCurrent(snapshot, "undo"), current: w.__firstA.isCurrent(snapshot) }
    })
    expect(fromStale).toEqual({ started: null, current: false })
    // 現在の A の同じキーの処理は、最新のまま
    expect(await call(page, "isLatest", current)).toBe(true)
  })

  test("a ticket of another hook instance with the same scope is not accepted", async ({ page }) => {
    await open(page)
    const fromB = (await call(page, "begin", "save", "b"))!
    expect(await call(page, "isLatest", fromB, "b")).toBe(true)
    expect(await call(page, "isLatest", fromB, "a")).toBe(false)
    expect(await call(page, "isSameScope", fromB, "a")).toBe(false)
    const snapB = await call(page, "capture", "b")
    expect(await call(page, "beginIfCurrent", snapB, "save", "a")).toBeNull()
  })

  test("a render of a new scope that is never committed (suspended transition) does not abort or invalidate the shown scope's operations", async ({ page }) => {
    await open(page)
    const t = (await call(page, "begin", "save"))!
    await call(page, "setScopeSuspended", "B")
    await settle(page)
    // 新しいスコープの描画は suspend して、画面は A のまま
    await expect(page.getByTestId("sg-committed")).toHaveText("A")
    // 描画の途中で中止しない。画面に表示している A の処理は有効なまま（世代は commit でだけ進む）
    expect(await call(page, "aborted", t)).toBe(false)
    expect(await call(page, "isLatest", t)).toBe(true)
    expect(await call(page, "scope")).toBe("A")
    // transition を取りやめて A に戻しても、同じ世代の処理として扱う
    await setScope(page, "A")
    expect(await call(page, "isLatest", t)).toBe(true)
    expect(await call(page, "aborted", t)).toBe(false)
    // B を commit すると、A の処理は無効になり、待機を中止する
    await setScope(page, "B")
    expect(await call(page, "isLatest", t)).toBe(false)
    expect(await call(page, "aborted", t)).toBe(true)
  })

  test("in render: a previous scope's ticket is rejected from the first render of the new scope (before effects)", async ({ page }) => {
    await open(page)
    const t = (await call(page, "begin", "save"))!
    await call(page, "watch", t)
    await expect(page.getByTestId("sg-rendered")).toHaveText("true")
    // 描画のたびに照合の結果を記録する（新しいスコープで true が一度でも描画されたら失敗）
    await page.evaluate(() => {
      const w = window as unknown as { __renders: string[] }
      w.__renders = []
      const el = document.querySelector("[data-testid=sg-rendered]")!
      new MutationObserver(() => w.__renders.push(`${el.getAttribute("data-scope")}:${el.textContent}`)).observe(el, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      })
    })
    await setScope(page, "B")
    await expect(page.getByTestId("sg-rendered")).toHaveText("false")
    const renders = await page.evaluate(() => (window as unknown as { __renders: string[] }).__renders)
    expect(renders.filter((r) => r.startsWith("B:true"))).toEqual([])
  })

  test("release removes the key record only for the latest ticket; a released key can start again", async ({ page }) => {
    await open(page)
    const older = (await call(page, "begin", "n-1"))!
    const latest = (await call(page, "begin", "n-1"))!
    // 古い Ticket の release は、最新の処理の記録を消さない
    await call(page, "release", older)
    expect(await call(page, "isLatest", latest)).toBe(true)
    await call(page, "release", latest)
    // release の後は、そのキーの処理は最新ではない（最後の照合の後に release する）
    expect(await call(page, "isLatest", latest)).toBe(false)
    expect(await call(page, "isLatest", older)).toBe(false)
    expect(await call(page, "isSameScope", latest)).toBe(true)
    const again = (await call(page, "begin", "n-1"))!
    expect(await call(page, "isLatest", again)).toBe(true)
    expect(await call(page, "isLatest", latest)).toBe(false)
  })

  test("StrictMode: a ticket started after mount stays valid through repeated renders", async ({ page }) => {
    await open(page)
    const t = (await call(page, "begin", "save"))!
    // 同じスコープでの再描画（StrictMode では 2 回描画する）で、世代を進めない
    await call(page, "watch", t)
    await expect(page.getByTestId("sg-rendered")).toHaveText("true")
    await call(page, "watch", null)
    await call(page, "watch", t)
    await expect(page.getByTestId("sg-rendered")).toHaveText("true")
    expect(await call(page, "isLatest", t)).toBe(true)
    expect(await call(page, "aborted", t)).toBe(false)
  })
})
