import { expect, test } from "@playwright/test"

import {
  canAutoRetry,
  compareIssues,
  displayJobState,
  getMutationAvailability,
  healthOf,
  mergeJobUpdates,
  normalizeJobProgress,
  overallHealth,
  placementOf,
  retryDelay,
  summarizeIssues,
  type JobSnapshot,
  type SystemIssue,
} from "../../registry/patterns/system-status"
import { collectPageErrors } from "./page-errors"

// System States の純粋な関数の検品（ブラウザを使わない）。期待値は指示書 7 章の規則から決める。
collectPageErrors(test)

const issue = (id: string, condition: SystemIssue["condition"], scope: SystemIssue["scope"], extra: Partial<SystemIssue> = {}): SystemIssue => ({
  id,
  condition,
  scope,
  title: id,
  ...extra,
})

test.describe("System status: health and placement", () => {
  test("a failed or loading status report is unknown, never operational", () => {
    expect(healthOf({ status: "failed", checkedAt: 1 }, "search")).toBe("unknown")
    expect(healthOf({ status: "loading" }, "search")).toBe("unknown")
    expect(healthOf(null, "search")).toBe("unknown")
    // 項目がない場合も正常にしない
    expect(healthOf<string>({ status: "ready", components: { customers: "operational" }, checkedAt: 1 }, "search")).toBe("unknown")
    expect(healthOf({ status: "ready", components: { search: "operational" }, checkedAt: 1 }, "search")).toBe("operational")
  })

  test("overall health: unknown parts do not become operational; mixed problems are a partial outage", () => {
    expect(overallHealth([])).toBe("unknown")
    expect(overallHealth(["operational", "operational"])).toBe("operational")
    expect(overallHealth(["operational", "unknown"])).toBe("unknown")
    expect(overallHealth(["outage", "outage"])).toBe("outage")
    expect(overallHealth(["maintenance", "maintenance"])).toBe("maintenance")
    expect(overallHealth(["operational", "outage"])).toBe("partial-outage")
    expect(overallHealth(["operational", "degraded"])).toBe("degraded")
    expect(overallHealth(["unknown", "degraded"])).toBe("degraded")
    expect(overallHealth(["operational", "recovering"])).toBe("recovering")
  })

  test("placement by impact scope; only a product-wide outage or maintenance replaces the screen", () => {
    expect(placementOf({ scope: "action", condition: "outage" })).toBe("inline")
    expect(placementOf({ scope: "region", condition: "partial-outage" })).toBe("region")
    expect(placementOf({ scope: "page", condition: "outage" })).toBe("page")
    expect(placementOf({ scope: "pages", condition: "degraded" })).toBe("banner")
    expect(placementOf({ scope: "product", condition: "outage" })).toBe("screen")
    expect(placementOf({ scope: "product", condition: "maintenance" })).toBe("screen")
    // オフラインは既存のデータを残すため、製品全体でも Banner
    expect(placementOf({ scope: "product", condition: "offline" })).toBe("banner")
    // 予定のメンテナンスは画面を置き換えない
    expect(placementOf({ scope: "product", condition: "maintenance", timing: "upcoming" })).toBe("banner")
  })

  test("summarize: severity order, upcoming after current, dismissed notices only, screen suppresses the banner", () => {
    const list = [
      issue("upcoming", "maintenance", "pages", { timing: "upcoming", dismissible: true }),
      issue("slow", "degraded", "pages"),
      issue("net", "offline", "product"),
      issue("search", "partial-outage", "region"),
      issue("export", "outage", "action"),
      issue("billing", "outage", "page"),
    ]
    const s = summarizeIssues(list)
    expect(s.screen).toBeNull()
    expect(s.banner.map((i) => i.id)).toEqual(["net", "slow", "upcoming"])
    expect(s.region.map((i) => i.id)).toEqual(["search"])
    expect(s.inline.map((i) => i.id)).toEqual(["export"])
    expect(s.page.map((i) => i.id)).toEqual(["billing"])
    // 閉じたお知らせは除く。閉じられない問題は、ID が含まれていても除かない
    expect(summarizeIssues(list, { dismissed: ["upcoming", "net"] }).banner.map((i) => i.id)).toEqual(["net", "slow"])
    const down = summarizeIssues([...list, issue("all", "outage", "product")])
    expect(down.screen?.id).toBe("all")
    expect(down.banner).toEqual([])
    expect(compareIssues({ condition: "outage", timing: "upcoming" }, { condition: "recovering" })).toBeGreaterThan(0)
  })
})

test.describe("System status: restrictions and retry", () => {
  test("mutations are blocked while offline or connecting, and for an outage or maintenance of the component", () => {
    expect(getMutationAvailability({ connectivity: "offline" })).toEqual({ allowed: false, reason: "offline" })
    expect(getMutationAvailability({ connectivity: "connecting" })).toEqual({ allowed: false, reason: "connecting" })
    expect(getMutationAvailability({ connectivity: "online", health: "outage" })).toEqual({ allowed: false, reason: "outage" })
    expect(getMutationAvailability({ connectivity: "online", health: "maintenance" })).toEqual({ allowed: false, reason: "maintenance" })
    // 状態の取得の失敗、性能の低下、一部の障害だけでは止めない
    for (const health of ["unknown", "degraded", "partial-outage", "operational", "recovering"] as const)
      expect(getMutationAvailability({ connectivity: "online", health }).allowed).toBe(true)
  })

  test("retry delay doubles up to the maximum and is deterministic", () => {
    const policy = { baseDelay: 1000, maxDelay: 8000, maxAttempts: 4 }
    expect([1, 2, 3, 4, 5].map((n) => retryDelay(n, policy))).toEqual([1000, 2000, 4000, 8000, 8000])
    expect(retryDelay(0, policy)).toBe(1000)
  })

  test("auto retry: safe reads and probes only; mutations only when idempotent; never for permission or validation errors", () => {
    const policy = { baseDelay: 1000, maxDelay: 8000, maxAttempts: 3 }
    expect(canAutoRetry({ kind: "read", failure: "network", attempt: 1, policy })).toBe(true)
    expect(canAutoRetry({ kind: "probe", failure: "timeout", attempt: 2, policy })).toBe(true)
    expect(canAutoRetry({ kind: "probe", failure: "timeout", attempt: 3, policy })).toBe(false)
    for (const kind of ["mutation", "payment", "external-send"] as const) {
      expect(canAutoRetry({ kind, failure: "network", attempt: 1, policy })).toBe(false)
      expect(canAutoRetry({ kind, failure: "unknown-result", attempt: 1, policy })).toBe(false)
      expect(canAutoRetry({ kind, failure: "network", attempt: 1, idempotent: true, policy })).toBe(true)
    }
    for (const failure of ["forbidden", "unauthenticated", "invalid"] as const) {
      expect(canAutoRetry({ kind: "read", failure, attempt: 0, policy })).toBe(false)
      expect(canAutoRetry({ kind: "mutation", failure, attempt: 0, idempotent: true, policy })).toBe(false)
    }
  })
})

test.describe("System status: jobs", () => {
  const job = (id: string, revision: number, state: JobSnapshot["state"], progress: JobSnapshot["progress"] = null): JobSnapshot => ({ id, revision, state, progress })

  test("an older revision of the same job does not overwrite a newer state", () => {
    const current = { a: job("a", 5, "running", { done: 600, total: 1240 }) }
    const same = mergeJobUpdates(current, [job("a", 3, "running", { done: 300, total: 1240 }), job("a", 5, "running", { done: 0, total: 1240 })])
    expect(same).toBe(current)
    const next = mergeJobUpdates(current, [job("a", 6, "running", { done: 900, total: 1240 })])
    expect(next.a.progress).toEqual({ done: 900, total: 1240 })
    expect(current.a.progress).toEqual({ done: 600, total: 1240 })
  })

  test("a finished job never returns to running; another job's progress is not applied to a new job", () => {
    const done = { a: job("a", 9, "succeeded") }
    expect(mergeJobUpdates(done, [job("a", 10, "running", { done: 10, total: 100 })]).a.state).toBe("succeeded")
    const both = mergeJobUpdates({ b: job("b", 1, "queued") }, [job("a", 3, "running", { done: 50, total: 100 })])
    expect(both.b).toEqual(job("b", 1, "queued"))
    expect(both.a.progress).toEqual({ done: 50, total: 100 })
  })

  test("progress is shown only when it is real", () => {
    expect(normalizeJobProgress(null)).toBeNull()
    expect(normalizeJobProgress({ done: 0, total: 0 })).toBeNull()
    expect(normalizeJobProgress({ done: Number.NaN, total: 10 })).toBeNull()
    expect(normalizeJobProgress({ done: -1, total: 10 })).toBeNull()
    expect(normalizeJobProgress({ done: 12, total: 10 })).toEqual({ done: 10, total: 10 })
  })

  test("a cancel request is not shown as cancelled until the server says so", () => {
    expect(displayJobState({ state: "running" }, true)).toBe("cancel-requested")
    expect(displayJobState({ state: "queued" }, true)).toBe("cancel-requested")
    expect(displayJobState({ state: "cancelled" }, true)).toBe("cancelled")
    // 停止の前に完了した
    expect(displayJobState({ state: "succeeded" }, true)).toBe("succeeded")
    expect(displayJobState({ state: "running" }, false)).toBe("running")
  })
})
