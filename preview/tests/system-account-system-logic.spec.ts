import { expect, test } from "@playwright/test"

import {
  advanceStableIssues,
  assessJobReport,
  canAutoRetry,
  compareIssues,
  defaultRetryPolicy,
  displayJobState,
  getMutationAvailability,
  healthOf,
  isRegisteredOnServer,
  jobProgressRatio,
  mergeJobUpdates,
  normalizeJobCounts,
  normalizeJobProgress,
  normalizeJobState,
  normalizeRetryPolicy,
  overallHealth,
  placementOf,
  retryDelay,
  retryPolicyLimits,
  summarizeIssues,
  type JobCounts,
  type JobProgress,
  type JobSnapshot,
  type JobState,
  type StableIssuesState,
  type SystemIssue,
} from "../../registry/patterns/system-status"
import { collectPageErrors } from "./page-errors"

// System States の純粋な関数の検品（ブラウザを使わない）。期待値は指示書 7 章と、v0.1 の最終調整の 8 章の規則から決める。
// 時刻は引数で渡す（実時間に依存しない）。
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
    const same = mergeJobUpdates<JobSnapshot>(current, [job("a", 3, "running", { done: 300, total: 1240 }), job("a", 5, "running", { done: 0, total: 1240 })])
    expect(same).toBe(current)
    const next = mergeJobUpdates<JobSnapshot>(current, [job("a", 6, "running", { done: 900, total: 1240 })])
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
    // 合計を超える件数は、合計に丸めない（100 % として完了と誤解させない。v0.1 の最終調整 8 章）
    expect(normalizeJobProgress({ done: 12, total: 10 })).toBeNull()
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

// ------------------------------------------------------------------ v0.1 の最終調整（8 章）
test.describe("System status: unconfirmed connectivity", () => {
  test("mutations are blocked while the connection is unconfirmed unless the product explicitly allows it", () => {
    expect(getMutationAvailability({ connectivity: "unknown" })).toEqual({ allowed: false, reason: "unconfirmed" })
    expect(getMutationAvailability({ connectivity: "unknown", unconfirmed: "block" })).toEqual({ allowed: false, reason: "unconfirmed" })
    expect(getMutationAvailability({ connectivity: "unknown", unconfirmed: "allow" })).toEqual({ allowed: true, reason: null })
    // allow は unknown だけに効く（offline と connecting は止める。停止中の機能も止める）
    expect(getMutationAvailability({ connectivity: "offline", unconfirmed: "allow" }).allowed).toBe(false)
    expect(getMutationAvailability({ connectivity: "connecting", unconfirmed: "allow" }).allowed).toBe(false)
    expect(getMutationAvailability({ connectivity: "unknown", unconfirmed: "allow", health: "outage" })).toEqual({ allowed: false, reason: "outage" })
  })
})

test.describe("System status: offline registration states", () => {
  test("only synced is registered on the server; saved on the device, sending and unknown are not", () => {
    const states = ["saved-locally", "waiting", "syncing", "synced", "failed", "conflict", "unknown"] as const
    expect(states.filter(isRegisteredOnServer)).toEqual(["synced"])
  })
})

test.describe("System status: invalid retry settings", () => {
  const table: [string, Parameters<typeof normalizeRetryPolicy>[0], ReturnType<typeof normalizeRetryPolicy>][] = [
    ["omitted", undefined, defaultRetryPolicy],
    ["valid", { baseDelay: 1000, maxDelay: 8000, maxAttempts: 4 }, { baseDelay: 1000, maxDelay: 8000, maxAttempts: 4 }],
    ["negative delays", { baseDelay: -1, maxDelay: -5 }, defaultRetryPolicy],
    ["zero delays", { baseDelay: 0, maxDelay: 0 }, defaultRetryPolicy],
    ["NaN", { baseDelay: Number.NaN, maxDelay: Number.NaN, maxAttempts: Number.NaN }, defaultRetryPolicy],
    ["Infinity", { baseDelay: Infinity, maxDelay: Infinity, maxAttempts: Infinity }, defaultRetryPolicy],
    ["max below base", { baseDelay: 4000, maxDelay: 1000 }, { baseDelay: 4000, maxDelay: 4000, maxAttempts: 5 }],
    ["zero attempts is one (no automatic retry)", { maxAttempts: 0 }, { ...defaultRetryPolicy, maxAttempts: 1 }],
    ["negative attempts is one", { maxAttempts: -3 }, { ...defaultRetryPolicy, maxAttempts: 1 }],
    ["fractional attempts are floored", { maxAttempts: 2.7 }, { ...defaultRetryPolicy, maxAttempts: 2 }],
  ]
  for (const [name, input, expected] of table) {
    test(`normalizeRetryPolicy: ${name}`, () => {
      expect(normalizeRetryPolicy(input)).toEqual(expected)
    })
  }

  // 独立レビュー L5：正しい形でも極端な値（0.001ms、1e9 回など）を、そのまま使わない。下限 100ms、間隔の上限 1 時間、回数の上限 100 回
  const bounds: [string, Parameters<typeof normalizeRetryPolicy>[0], ReturnType<typeof normalizeRetryPolicy>][] = [
    ["tiny base delay is raised to the lower bound", { baseDelay: 0.001, maxDelay: 8000, maxAttempts: 4 }, { baseDelay: 100, maxDelay: 8000, maxAttempts: 4 }],
    ["tiny delays are both raised", { baseDelay: 0.001, maxDelay: 0.002 }, { baseDelay: 100, maxDelay: 100, maxAttempts: 5 }],
    ["lower bound itself is kept", { baseDelay: 100, maxDelay: 100 }, { baseDelay: 100, maxDelay: 100, maxAttempts: 5 }],
    ["just below the lower bound", { baseDelay: 99.9 }, { baseDelay: 100, maxDelay: 30000, maxAttempts: 5 }],
    ["huge max delay is lowered to one hour", { baseDelay: 1000, maxDelay: 1e12 }, { baseDelay: 1000, maxDelay: 3_600_000, maxAttempts: 5 }],
    ["huge base delay is lowered to one hour", { baseDelay: 2 ** 31 }, { baseDelay: 3_600_000, maxDelay: 3_600_000, maxAttempts: 5 }],
    ["upper bound itself is kept", { baseDelay: 3_600_000, maxDelay: 3_600_000 }, { baseDelay: 3_600_000, maxDelay: 3_600_000, maxAttempts: 5 }],
    ["huge attempts are lowered to 100", { maxAttempts: 1e9 }, { ...defaultRetryPolicy, maxAttempts: 100 }],
    ["100 attempts is kept", { maxAttempts: 100 }, { ...defaultRetryPolicy, maxAttempts: 100 }],
    ["101 attempts is lowered to 100", { maxAttempts: 101 }, { ...defaultRetryPolicy, maxAttempts: 100 }],
    ["max safe integer attempts", { maxAttempts: Number.MAX_SAFE_INTEGER }, { ...defaultRetryPolicy, maxAttempts: 100 }],
    ["all extreme at once", { baseDelay: 0.001, maxDelay: 1e12, maxAttempts: 1e9 }, { baseDelay: 100, maxDelay: 3_600_000, maxAttempts: 100 }],
  ]
  for (const [name, input, expected] of bounds) {
    test(`normalizeRetryPolicy bounds: ${name}`, () => {
      expect(normalizeRetryPolicy(input)).toEqual(expected)
    })
  }

  test("the limits are exported, and an invalid or extreme fallback is checked by the same rules", () => {
    expect(retryPolicyLimits).toEqual({ minDelay: 100, maxDelay: 3_600_000, maxAttempts: 100 })
    expect(normalizeRetryPolicy(undefined, { baseDelay: 0.001, maxDelay: 1e12, maxAttempts: 1e9 })).toEqual({ baseDelay: 100, maxDelay: 3_600_000, maxAttempts: 100 })
    expect(normalizeRetryPolicy({}, { baseDelay: Number.NaN, maxDelay: -1, maxAttempts: 0 })).toEqual(defaultRetryPolicy)
    // 下限と上限は、retryDelay と canAutoRetry にも効く（間隔なしの繰り返し、事実上上限のない再試行をしない）
    expect(retryDelay(1, { baseDelay: 0.001 })).toBe(100)
    expect(retryDelay(60, { baseDelay: 1000, maxDelay: 1e12 })).toBe(3_600_000)
    expect(canAutoRetry({ kind: "read", failure: "network", attempt: 99, policy: { maxAttempts: 1e9 } })).toBe(true)
    expect(canAutoRetry({ kind: "read", failure: "network", attempt: 100, policy: { maxAttempts: 1e9 } })).toBe(false)
  })

  test("retry delay is finite and bounded for invalid attempts and settings", () => {
    const policy = { baseDelay: 1000, maxDelay: 8000, maxAttempts: 4 }
    for (const attempt of [Number.NaN, -1, 0, Infinity, -Infinity]) {
      const d = retryDelay(attempt, policy)
      expect(Number.isFinite(d), String(attempt)).toBe(true)
      expect(d).toBe(1000)
    }
    expect(retryDelay(1000, policy)).toBe(8000)
    for (const bad of [{ baseDelay: Number.NaN }, { baseDelay: -10 }, { baseDelay: 0 }, { maxDelay: Infinity }]) {
      const d = retryDelay(3, bad)
      expect(Number.isFinite(d) && d > 0, JSON.stringify(bad)).toBe(true)
    }
  })

  test("auto retry is refused for an invalid attempt count and keeps a finite limit for invalid settings", () => {
    for (const attempt of [Number.NaN, -1, -Infinity]) expect(canAutoRetry({ kind: "read", failure: "network", attempt })).toBe(false)
    // 上限が Infinity でも、既定の上限（5 回）で止まる
    expect(canAutoRetry({ kind: "read", failure: "network", attempt: 4, policy: { maxAttempts: Infinity } })).toBe(true)
    expect(canAutoRetry({ kind: "read", failure: "network", attempt: 5, policy: { maxAttempts: Infinity } })).toBe(false)
    expect(canAutoRetry({ kind: "read", failure: "network", attempt: 1, policy: { maxAttempts: Number.NaN } })).toBe(true)
    // 0 は自動の再試行をしない（1 回目の失敗で止まる）
    expect(canAutoRetry({ kind: "probe", failure: "timeout", attempt: 1, policy: { maxAttempts: 0 } })).toBe(false)
  })
})

test.describe("System status: stable issues", () => {
  // 1 つの問題の流れを、時刻と問題の一覧の組で順に判定する（showDelay 1000、hideDelay 2000）
  type Step = { at: number; present: { id: string; immediate?: boolean }[]; scope?: string; visible: string[]; settling?: string[] }
  const run = (steps: Step[]) => {
    let state: StableIssuesState | null = null
    for (const step of steps) {
      const r = advanceStableIssues(state, { scope: step.scope, present: step.present, now: step.at, showDelay: 1000, hideDelay: 2000 })
      state = r.state
      expect(r.visible, `at ${step.at}`).toEqual(step.visible)
      expect(r.settling, `settling at ${step.at}`).toEqual(step.settling ?? [])
    }
  }
  const net = { id: "connectivity" }
  const search = { id: "service:search" }

  test("an issue that resolves before it is shown is never shown", () => {
    run([
      { at: 0, present: [net], visible: [] },
      { at: 400, present: [], visible: [] },
      // hideDelay を過ぎて再び現れた場合は、新しい問題として 1 秒待つ
      { at: 2600, present: [net], visible: [] },
      { at: 3000, present: [], visible: [] },
      { at: 6000, present: [], visible: [] },
    ])
  })

  test("an issue shown and briefly resolved stays shown (settling) and continues when it returns", () => {
    run([
      { at: 0, present: [net], visible: [] },
      { at: 1000, present: [net], visible: ["connectivity"] },
      { at: 1500, present: [], visible: ["connectivity"], settling: ["connectivity"] },
      { at: 2500, present: [net], visible: ["connectivity"] },
      { at: 2600, present: [], visible: ["connectivity"], settling: ["connectivity"] },
      // 完全な復旧：hideDelay の後に表示をやめる
      { at: 4600, present: [], visible: [] },
    ])
  })

  test("flapping before it is shown counts as one continuing issue (shown once, not repeatedly)", () => {
    run([
      { at: 0, present: [net], visible: [] },
      { at: 400, present: [], visible: [] },
      { at: 800, present: [net], visible: [] },
      { at: 1000, present: [net], visible: ["connectivity"] },
    ])
  })

  test("immediate issues are shown at once, also when the same ID escalates; de-escalation keeps it shown", () => {
    run([
      { at: 0, present: [{ id: "service:customers", immediate: true }], visible: ["service:customers"] },
      // immediate の問題も、解消した後は hideDelay の間だけ表示を残す（表示を繰り返さない）
      { at: 5, present: [], visible: ["service:customers"], settling: ["service:customers"] },
      { at: 2005, present: [], visible: [] },
    ])
    run([
      { at: 10, present: [search], visible: [] },
      // 同じ ID で重要度が上がった（操作を止める必要がある）：表示の遅延の前でも表示する
      { at: 200, present: [{ ...search, immediate: true }], visible: ["service:search"] },
      // 重要度が下がっても、表示は続ける（表示と読み上げを繰り返さない）
      { at: 300, present: [search], visible: ["service:search"] },
    ])
  })

  test("another issue continues while one recovers; order is current issues, then settling", () => {
    run([
      { at: 0, present: [net, search], visible: [] },
      { at: 1000, present: [net, search], visible: ["connectivity", "service:search"] },
      { at: 1200, present: [search], visible: ["service:search", "connectivity"], settling: ["connectivity"] },
      { at: 3200, present: [search], visible: ["service:search"] },
    ])
  })

  test("a scope change drops the previous scope's issues at once, including settling ones", () => {
    run([
      { at: 0, scope: "hq", present: [net], visible: [] },
      { at: 1000, scope: "hq", present: [net], visible: ["connectivity"] },
      { at: 1100, scope: "hq", present: [], visible: ["connectivity"], settling: ["connectivity"] },
      { at: 1200, scope: "west", present: [], visible: [] },
      // 別のスコープの同じ ID は、新しい問題として扱う（前のスコープの経過を引き継がない）
      { at: 1300, scope: "west", present: [net], visible: [] },
      { at: 2300, scope: "west", present: [net], visible: ["connectivity"] },
    ])
  })

  test("next check time and invalid delays", () => {
    const r = advanceStableIssues(null, { present: [net], now: 100, showDelay: 1000, hideDelay: 2000 })
    expect(r.nextAt).toBe(1100)
    const shown = advanceStableIssues(r.state, { present: [net], now: 1100 })
    expect(shown.nextAt).toBeNull()
    const gone = advanceStableIssues(shown.state, { present: [], now: 1500 })
    expect(gone.nextAt).toBe(3500)
    for (const bad of [Number.NaN, -1, Infinity]) {
      const x = advanceStableIssues(null, { present: [net], now: 0, showDelay: bad, hideDelay: bad })
      expect(x.nextAt).toBe(1000)
    }
    // 同じ ID が 2 回あっても 1 つとして扱う
    expect(advanceStableIssues(null, { present: [{ id: "a", immediate: true }, { id: "a", immediate: true }], now: 0 }).visible).toEqual(["a"])
  })
})

test.describe("System status: job progress and counts (table)", () => {
  const progressTable: [string, JobProgress | null, JobProgress | null][] = [
    ["none", null, null],
    ["valid count", { done: 310, total: 1240 }, { done: 310, total: 1240 }],
    ["zero done", { done: 0, total: 1240 }, { done: 0, total: 1240 }],
    ["complete", { done: 1240, total: 1240 }, { done: 1240, total: 1240 }],
    ["negative done", { done: -1, total: 10 }, null],
    ["done over total", { done: 11, total: 10 }, null],
    ["fractional done", { done: 1.5, total: 10 }, null],
    ["fractional total", { done: 1, total: 10.5 }, null],
    ["zero total", { done: 0, total: 0 }, null],
    ["negative total", { done: 0, total: -10 }, null],
    ["NaN done", { done: Number.NaN, total: 10 }, null],
    ["Infinity total", { done: 1, total: Infinity }, null],
    ["valid percent", { percent: 42.5 }, { percent: 42.5 }],
    ["percent 0", { percent: 0 }, { percent: 0 }],
    ["percent 100", { percent: 100 }, { percent: 100 }],
    ["negative percent", { percent: -1 }, null],
    ["percent over 100", { percent: 100.1 }, null],
    ["NaN percent", { percent: Number.NaN }, null],
    ["Infinity percent", { percent: Infinity }, null],
  ]
  for (const [name, input, expected] of progressTable) {
    test(`normalizeJobProgress: ${name}`, () => {
      expect(normalizeJobProgress(input)).toEqual(expected)
      const ratio = jobProgressRatio(input)
      if (expected === null) expect(ratio).toBeNull()
      else {
        expect(ratio).not.toBeNull()
        expect(ratio! >= 0 && ratio! <= 1).toBe(true)
      }
    })
  }

  const countTable: [string, JobCounts | null, number | null, JobCounts | null][] = [
    ["none", null, null, null],
    ["valid", { succeeded: 1228, failed: 12 }, 1240, { succeeded: 1228, failed: 12 }],
    ["valid with own total", { succeeded: 5, failed: 1, total: 10 }, null, { succeeded: 5, failed: 1, total: 10 }],
    ["valid without any total", { succeeded: 5, failed: 1 }, null, { succeeded: 5, failed: 1 }],
    ["negative", { succeeded: -1, failed: 0 }, 10, null],
    ["over the progress total", { succeeded: 1240, failed: 12 }, 1240, null],
    ["over its own total", { succeeded: 9, failed: 2, total: 10 }, null, null],
    ["fractional", { succeeded: 1.5, failed: 0 }, 10, null],
    ["NaN", { succeeded: Number.NaN, failed: 0 }, 10, null],
    ["invalid own total", { succeeded: 1, failed: 0, total: 0 }, null, null],
  ]
  for (const [name, input, total, expected] of countTable) {
    test(`normalizeJobCounts: ${name}`, () => {
      expect(normalizeJobCounts(input, total)).toEqual(expected)
    })
  }

  // 示す状態：不正な値と矛盾する値を、成功として示さない
  const stateTable: [string, { state: JobState; progress: JobProgress | null; counts?: JobCounts | null }, boolean, JobState][] = [
    ["succeeded, valid", { state: "succeeded", progress: { done: 1240, total: 1240 }, counts: { succeeded: 1240, failed: 0 } }, false, "succeeded"],
    ["succeeded without details", { state: "succeeded", progress: null }, false, "succeeded"],
    ["succeeded, percent 100", { state: "succeeded", progress: { percent: 100 } }, false, "succeeded"],
    ["succeeded, progress over total", { state: "succeeded", progress: { done: 2480, total: 1240 } }, false, "unknown"],
    ["succeeded, progress short of total", { state: "succeeded", progress: { done: 1000, total: 1240 } }, false, "unknown"],
    ["succeeded, percent 99", { state: "succeeded", progress: { percent: 99 } }, false, "unknown"],
    ["succeeded, NaN percent", { state: "succeeded", progress: { percent: Number.NaN } }, false, "unknown"],
    ["succeeded with failures", { state: "succeeded", progress: null, counts: { succeeded: 1228, failed: 12 } }, false, "unknown"],
    ["succeeded, counts over total", { state: "succeeded", progress: { done: 1240, total: 1240 }, counts: { succeeded: 1240, failed: 12 } }, false, "unknown"],
    ["succeeded, fewer successes than total", { state: "succeeded", progress: { done: 1240, total: 1240 }, counts: { succeeded: 1000, failed: 0 } }, false, "unknown"],
    ["partial, valid", { state: "partial", progress: { done: 1240, total: 1240 }, counts: { succeeded: 1228, failed: 12 } }, false, "partial"],
    ["partial without failures", { state: "partial", progress: null, counts: { succeeded: 1240, failed: 0 } }, false, "unknown"],
    ["partial, negative counts", { state: "partial", progress: null, counts: { succeeded: -1, failed: 2 } }, false, "unknown"],
    ["running, invalid progress stays running", { state: "running", progress: { done: 20, total: 10 } }, false, "running"],
    ["running, cancel requested", { state: "running", progress: null }, true, "cancel-requested"],
    ["cancelled after the request", { state: "cancelled", progress: null }, true, "cancelled"],
    ["failed", { state: "failed", progress: null }, false, "failed"],
    ["unknown", { state: "unknown", progress: null }, false, "unknown"],
    ["unexpected state value", { state: "done" as JobState, progress: null }, false, "unknown"],
  ]
  for (const [name, job, cancel, expected] of stateTable) {
    test(`displayJobState: ${name}`, () => {
      expect(displayJobState(job, cancel)).toBe(expected)
    })
  }

  test("assessJobReport lists the problems; normalizeJobState rejects unknown values", () => {
    expect(assessJobReport({ state: "succeeded", progress: { done: 11, total: 10 } }).problems).toEqual(["invalid-progress"])
    expect(assessJobReport({ state: "succeeded", progress: null, counts: { succeeded: 1, failed: 1 } }).problems).toEqual(["inconsistent-result"])
    expect(assessJobReport({ state: "partial", progress: { done: 10, total: 10 }, counts: { succeeded: 10, failed: 1 } }).problems).toEqual(["invalid-counts"])
    expect(assessJobReport({ state: "running", progress: { done: 1, total: 10 } }).valid).toBe(true)
    expect(normalizeJobState("succeeded")).toBe("succeeded")
    for (const bad of ["done", "", null, undefined, 3]) expect(normalizeJobState(bad)).toBe("unknown")
  })

  test("a response with a non-finite revision is not applied; values are kept as received for display checks", () => {
    const current: Record<string, JobSnapshot> = { a: { id: "a", revision: 2, state: "running", progress: { done: 1, total: 10 } } }
    expect(mergeJobUpdates<JobSnapshot>(current, [{ id: "a", revision: Number.NaN, state: "succeeded", progress: null }])).toBe(current)
    expect(mergeJobUpdates<JobSnapshot>(current, [{ id: "a", revision: Infinity, state: "succeeded", progress: null }])).toBe(current)
    const invalid = mergeJobUpdates<JobSnapshot>(current, [{ id: "a", revision: 3, state: "succeeded", progress: { done: 20, total: 10 } }])
    // 届いた値を残し、表示で不明にする（正しくない値を正しい値に変えない）
    expect(invalid.a.progress).toEqual({ done: 20, total: 10 })
    expect(displayJobState(invalid.a, false)).toBe("unknown")
  })
})
