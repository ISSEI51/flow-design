import { expect, test } from "@playwright/test"

import {
  classifyConsoleErrors,
  classifyPageErrors,
  judgePageErrors,
  startPageErrorRecording,
  type ErrorRecord,
} from "./page-errors"

// 例外記録の判定条件の検品。値は、調査で実際に記録された事象を元にしている。
// time はページの時刻（リスナーが受け取った時点の performance.now()）、nodeTime は Node で受け取った時刻。テストでは同じ値から作る。
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "判定の関数だけを確かめるため、1 つの project で実行する"))

const DOC = "doc-1"
const event = (time: number, over: Partial<NonNullable<ErrorRecord["event"]>> = {}, docId = DOC): ErrorRecord => ({
  kind: "non-finite-event",
  message: "pointerdown",
  time,
  docId,
  nodeTime: time,
  event: {
    type: "pointerdown",
    constructorName: "PointerEvent",
    isTrusted: true,
    pointerType: "mouse",
    clientX: "NaN",
    clientY: "NaN",
    target: "HTML[]",
    ...over,
  },
})
const windowError = (time: number, over: Partial<ErrorRecord> = {}): ErrorRecord => ({
  kind: "window-error",
  message: "TypeError: The provided value is non-finite",
  stack: "elementsFromPoint@[native code]\nexpectHitTarget@\nlistener@",
  filename: "undefined",
  line: 7845,
  time,
  docId: DOC,
  nodeTime: time,
  ...over,
})
const pageError = (time: number, over: Partial<ErrorRecord> = {}): ErrorRecord => ({
  kind: "pageerror",
  message: "TypeError: The provided value is non-finite",
  stack: "TypeError: The provided value is non-finite\n    at elementsFromPoint (undefined:7845:46)\n    at expectHitTarget (:7845:46)\n    at listener (:7939:38)",
  nodeTime: time,
  ...over,
})
const WEBKIT = ["webkit", "27.2"] as const

test.describe("classifyPageErrors", () => {
  test("accepts the confirmed WebKit event: trusted pointer event with NaN, then expectHitTarget", () => {
    const list = [event(1000), windowError(1001), pageError(1003)]
    const r = classifyPageErrors(list, ...WEBKIT)
    expect(r.environment).toHaveLength(2)
    expect(r.unexplained).toEqual([])
  })

  test("rejects other browsers and other WebKit versions", () => {
    const list = [event(1000), windowError(1001), pageError(1003)]
    expect(classifyPageErrors(list, "chromium", "159.0").unexplained).toHaveLength(2)
    expect(classifyPageErrors(list, "webkit", "28.0").unexplained).toHaveLength(2)
  })

  test("rejects when there is no matching event, or the event is untrusted, finite or of another type", () => {
    expect(classifyPageErrors([windowError(1001)], ...WEBKIT).unexplained).toHaveLength(1)
    for (const over of [{ isTrusted: false }, { clientX: "10", clientY: "20" }, { type: "mousemove" }, { constructorName: "Event" }]) {
      expect(classifyPageErrors([event(1000, over), windowError(1001)], ...WEBKIT).unexplained, JSON.stringify(over)).toHaveLength(1)
    }
  })

  test("rejects when the error is not right after the event", () => {
    expect(classifyPageErrors([event(1000), windowError(1006)], ...WEBKIT).unexplained).toHaveLength(1)
    // イベントより前に起きた例外
    expect(classifyPageErrors([event(1000), windowError(999)], ...WEBKIT).unexplained).toHaveLength(1)
  })

  test("rejects other messages and stacks, including product code", () => {
    const cases: Partial<ErrorRecord>[] = [
      { message: "TypeError: undefined is not an object" },
      { stack: "elementsFromPoint@[native code]\nopen@http://localhost:5174/src/app.tsx:10:5" },
      { stack: "scrollTo@[native code]\nexpectHitTarget@\nlistener@" },
      { stack: undefined },
      { filename: "http://localhost:5174/node_modules/.vite/deps/@base-ui_react.js" },
    ]
    for (const over of cases) {
      expect(classifyPageErrors([event(1000), windowError(1001, over)], ...WEBKIT).unexplained, JSON.stringify(over)).toHaveLength(1)
    }
  })

  test("a pageerror is accepted only as the duplicate of an accepted window error", () => {
    // window の error がない pageerror
    expect(classifyPageErrors([event(1000), pageError(1003)], ...WEBKIT).unexplained).toHaveLength(1)
    // 件数が window の error を超える分
    const r = classifyPageErrors([event(1000), windowError(1001), pageError(1003), pageError(1004)], ...WEBKIT)
    expect(r.environment).toHaveLength(2)
    expect(r.unexplained).toHaveLength(1)
    // 別の例外と混ざっても、そちらは失敗にする
    const mixed = classifyPageErrors([event(1000), windowError(1001), { kind: "pageerror", message: "Error: boom", nodeTime: 1002 }], ...WEBKIT)
    expect(mixed.unexplained.map((x) => x.message)).toEqual(["Error: boom"])
  })

  test("with a paused page clock (same page time), the Node time still has to be right after the event", () => {
    // page.clock.pauseAt では、ページの時刻がすべて同じ値になる。Node で受け取った時刻で、離れた記録を関係づけない
    const r = classifyPageErrors([{ ...event(1000), nodeTime: 1000 }, windowError(1000, { nodeTime: 1200 })], ...WEBKIT)
    expect(r.unexplained).toHaveLength(1)
    // Node の時刻でイベントより前の例外も関係づけない
    expect(classifyPageErrors([{ ...event(1000), nodeTime: 1000 }, windowError(1000, { nodeTime: 990 })], ...WEBKIT).unexplained).toHaveLength(1)
    expect(classifyPageErrors([{ ...event(1000), nodeTime: 1000 }, windowError(1000, { nodeTime: 1010 })], ...WEBKIT).unexplained).toEqual([])
  })

  test("an event and an error in different documents are not related, even with close times", () => {
    // ページを移動すると timeStamp の起点が変わる。別の文書のイベントとは関係づけない
    expect(classifyPageErrors([event(1000, {}, "doc-0"), windowError(1001)], ...WEBKIT).unexplained).toHaveLength(1)
  })

  test("a pageerror is matched by the Node time, not by the page time", () => {
    // ページの時計を固定しても、Node で受け取った時刻で照合する
    const r = classifyPageErrors([event(1000), windowError(1001), pageError(1030)], ...WEBKIT)
    expect(r.unexplained).toEqual([])
    expect(classifyPageErrors([event(1000), windowError(1001), pageError(1052)], ...WEBKIT).unexplained).toHaveLength(1)
  })

  test("unhandled rejections are always unexplained", () => {
    const r = classifyPageErrors([event(1000), { kind: "unhandledrejection", message: "boom", time: 1001, docId: DOC, nodeTime: 1001 }], ...WEBKIT)
    expect(r.unexplained.map((x) => x.kind)).toEqual(["unhandledrejection"])
  })

  test("console errors: only the exact Vite connection messages are environment; others fail", () => {
    const c = (message: string): ErrorRecord => ({ kind: "console", message, nodeTime: 1 })
    const env = [
      c("WebSocket connection to 'ws://localhost:5284/?token=v8u15hBU4eVq' failed: Error in connection establishment: net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS"),
      c("[vite] failed to connect to websocket.\nyour current setup: ..."),
      c("Failed to send error to Vite server: TypeError: Cannot read properties of undefined (reading 'send')"),
    ]
    const product = [
      c("Warning: Each child in a list should have a unique \"key\" prop."),
      c("A tree hydrated but some attributes of the server rendered HTML didn't match the client properties."),
      c("WebSocket connection to 'wss://api.example.com/socket' failed: "),
      c("Uncaught TypeError: x is undefined"),
    ]
    const r = classifyConsoleErrors([...env, ...product])
    expect(r.environment).toEqual(env)
    expect(r.product).toEqual(product)
    // 例外の判定とは別に扱う
    expect(classifyPageErrors(env, ...WEBKIT)).toEqual({ environment: [], unexplained: [] })
    expect(judgePageErrors(product, ...WEBKIT).failures).toHaveLength(4)
  })
})

// 記録の仕組みの検品。製品のコードの時計（Date）を page.clock で固定しても、記録の時刻は実際の前後関係を保つ。
test.describe("startPageErrorRecording", () => {
  test("records keep real time order with a fixed clock, across navigations", async ({ page }) => {
    const list = await startPageErrorRecording(page)
    await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+09:00"))
    await page.goto("/#/button")
    await page.getByRole("heading", { level: 1 }).waitFor()
    // 製品の時計は固定されている
    expect(await page.evaluate(() => [Date.now(), Date.now()])).toEqual([Date.parse("2026-11-25T10:00:00+09:00"), Date.parse("2026-11-25T10:00:00+09:00")])
    // 約 80ms の間隔で、捕捉されない例外を 2 回起こす（検品の基盤そのものの確認のため、collectPageErrors は使わない）。
    // 時計を固定すると、setTimeout と requestAnimationFrame のコールバックは Playwright の時計の置き換えが呼び出し、
    // その中の例外は捕捉されてコンソールのエラーになる（下の別のテスト）。pageerror を確かめるため、マイクロタスクで起こし、間隔は Node 側で空ける
    await page.evaluate(() => queueMicrotask(() => { throw new Error("first") }))
    await page.waitForTimeout(80)
    await page.evaluate(() => queueMicrotask(() => { throw new Error("second") }))
    await expect.poll(() => list.filter((r) => r.kind === "window-error").length).toBe(2)
    const [a, b] = list.filter((r) => r.kind === "window-error")
    // 固定した Date では 0ms になる差が、イベントの timeStamp では実際の時間差になる
    expect(b.time! - a.time!).toBeGreaterThanOrEqual(60)
    expect(a.docId).toBe(b.docId)
    // pageerror は Node の時刻で、対応する window の error と近い
    await expect.poll(() => list.filter((r) => r.kind === "pageerror").length).toBe(2)
    const [pa, pb] = list.filter((r) => r.kind === "pageerror")
    expect(Math.abs(pa.nodeTime - a.nodeTime)).toBeLessThan(50)
    expect(Math.abs(pb.nodeTime - b.nodeTime)).toBeLessThan(50)
    // ページを移動しても、前の文書の記録は残り、文書の ID は変わる
    await page.goto("/#/input")
    await page.reload()
    await page.getByRole("heading", { level: 1 }).waitFor()
    await page.evaluate(() => Promise.reject(new Error("rejected")))
      .catch(() => undefined)
    await page.evaluate(() => {
      void Promise.reject(new Error("unhandled"))
    })
    await expect.poll(() => list.filter((r) => r.kind === "unhandledrejection").length).toBe(1)
    const rejection = list.find((r) => r.kind === "unhandledrejection")!
    expect(rejection.message).toBe("unhandled")
    expect(rejection.docId).not.toBe(a.docId)
    expect(list.filter((r) => r.kind === "window-error")).toHaveLength(2)
    // 判定：製品の例外はすべて失敗の対象
    expect(judgePageErrors(list, "chromium", "159").unexplained.length).toBeGreaterThanOrEqual(5)
  })

  test("with a fixed clock, an exception in a timer callback becomes a console error and still fails", async ({ page }) => {
    const list = await startPageErrorRecording(page)
    await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+09:00"))
    await page.goto("/#/button")
    await page.getByRole("heading", { level: 1 }).waitFor()
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("timer boom")
      }, 0)
    })
    await expect.poll(() => list.filter((r) => r.kind === "console" && r.message.includes("timer boom")).length).toBeGreaterThan(0)
    // pageerror と window の error にはならない（Playwright の時計の置き換えが捕捉する）
    expect(list.filter((r) => r.kind !== "console" && r.message.includes("timer boom"))).toEqual([])
    // コンソールのエラーとして、検品を失敗にする
    expect(judgePageErrors(list, "chromium", "159").failures.some((f) => f.includes("timer boom"))).toBe(true)
  })
})
