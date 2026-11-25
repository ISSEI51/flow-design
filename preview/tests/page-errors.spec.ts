import { expect, test } from "@playwright/test"

import { classifyPageErrors, type ErrorRecord } from "./page-errors"

// 例外記録の判定条件の検品。ページは開かない。値は、調査で実際に記録された事象を元にしている。
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "判定の関数だけを確かめるため、1 つの project で実行する"))

const event = (time: number, over: Partial<NonNullable<ErrorRecord["event"]>> = {}): ErrorRecord => ({
  kind: "non-finite-event",
  message: "pointerdown",
  time,
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
  ...over,
})
const pageError = (time: number, over: Partial<ErrorRecord> = {}): ErrorRecord => ({
  kind: "pageerror",
  message: "TypeError: The provided value is non-finite",
  stack: "TypeError: The provided value is non-finite\n    at elementsFromPoint (undefined:7845:46)\n    at expectHitTarget (:7845:46)\n    at listener (:7939:38)",
  time,
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
    const mixed = classifyPageErrors([event(1000), windowError(1001), { kind: "pageerror", message: "Error: boom", time: 1002 }], ...WEBKIT)
    expect(mixed.unexplained.map((x) => x.message)).toEqual(["Error: boom"])
  })

  test("console errors are recorded but not classified as uncaught", () => {
    const r = classifyPageErrors([{ kind: "console", message: "Warning", time: 1 }], ...WEBKIT)
    expect(r).toEqual({ environment: [], unexplained: [] })
  })
})
