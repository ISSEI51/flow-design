import { expect, test } from "@playwright/test"

import { BulkRequestError, isBulkFullySucceeded, reconcileBulkResults, type BulkTarget } from "../../registry/patterns/bulk-selection"
import { collectPageErrors } from "./page-errors"

// 一括操作の結果と、固定した対象の照合（reconcileBulkResults）の検品。ブラウザを使わない。
// 結果が不足、重複、対象外、形式の誤りを含む場合に、すべて完了として扱わないことを確かめる。
collectPageErrors(test)

const ids = (n: number) => Array.from({ length: n }, (_, i) => `C-${String(i + 1).padStart(5, "0")}`)
const idsTarget = (n: number): BulkTarget => ({ kind: "ids", ids: ids(n) })
const queryTarget = (excludedIds: string[] = [], expectedCount: number | null = 580): BulkTarget => ({
  kind: "query",
  query: { search: "" },
  queryKey: "{}",
  excludedIds,
  expectedCount,
})
const ok = (id: string) => ({ id, outcome: "succeeded" as const })
const summaryOf = (r: ReturnType<typeof reconcileBulkResults>) => ({ ...r, requestError: null })

test.describe("Bulk results: reconciliation with the fixed target", () => {
  test("every ID returned once: complete, all succeeded", () => {
    const r = reconcileBulkResults(idsTarget(10), ids(10).map(ok))
    expect(r.succeeded).toHaveLength(10)
    expect(r.integrity).toMatchObject({ missing: 0, duplicates: 0, unexpected: 0, invalid: 0, complete: true, confirmedCount: 10 })
    expect(isBulkFullySucceeded(summaryOf(r))).toBe(true)
  })

  test("10 targets, 8 results: the 2 missing IDs are unknown, not succeeded", () => {
    const r = reconcileBulkResults(idsTarget(10), ids(8).map(ok))
    expect(r.succeeded).toHaveLength(8)
    expect(r.unknown.map((i) => i.id)).toEqual(["C-00009", "C-00010"])
    expect(r.unknown[0].message).toBe("結果が返されませんでした")
    expect(r.integrity).toMatchObject({ missing: 2, complete: false })
    expect(isBulkFullySucceeded(summaryOf(r))).toBe(false)
  })

  test("the same ID twice is counted once; conflicting results for one ID become unknown", () => {
    const same = reconcileBulkResults(idsTarget(2), [ok("C-00001"), ok("C-00001"), ok("C-00002")])
    expect(same.succeeded).toHaveLength(2)
    expect(same.integrity).toMatchObject({ duplicates: 1, complete: false })
    const conflict = reconcileBulkResults(idsTarget(2), [ok("C-00001"), { id: "C-00001", outcome: "failed" }, ok("C-00002")])
    expect(conflict.succeeded.map((i) => i.id)).toEqual(["C-00002"])
    expect(conflict.failed).toHaveLength(0)
    expect(conflict.unknown.map((i) => i.id)).toEqual(["C-00001"])
    expect(conflict.integrity.complete).toBe(false)
  })

  test("results for IDs outside the target (or excluded from all-matching) are not counted", () => {
    const r = reconcileBulkResults(idsTarget(2), [ok("C-00001"), ok("C-00002"), ok("X-99999")])
    expect(r.succeeded.map((i) => i.id)).toEqual(["C-00001", "C-00002"])
    expect(r.integrity).toMatchObject({ unexpected: 1, complete: false })
    const q = reconcileBulkResults(queryTarget(["C-00003"]), { items: [ok("C-00001"), ok("C-00003")], confirmedCount: 1 })
    expect(q.succeeded.map((i) => i.id)).toEqual(["C-00001"])
    expect(q.integrity).toMatchObject({ unexpected: 1, complete: false })
  })

  test("an empty result: every ID target is unknown", () => {
    const r = reconcileBulkResults(idsTarget(3), [])
    expect(r.succeeded).toHaveLength(0)
    expect(r.unknown).toHaveLength(3)
    expect(r.integrity).toMatchObject({ missing: 3, complete: false })
  })

  test("invalid entries are not counted; a malformed response is a request with an unknown outcome", () => {
    const r = reconcileBulkResults(idsTarget(2), [ok("C-00001"), null, { id: "", outcome: "succeeded" }, { id: "C-00002", outcome: "done" }, 42])
    expect(r.succeeded.map((i) => i.id)).toEqual(["C-00001"])
    expect(r.unknown.map((i) => i.id)).toEqual(["C-00002"])
    expect(r.integrity).toMatchObject({ invalid: 4, missing: 1, complete: false })
    for (const bad of [null, undefined, "ok", { result: [] }]) {
      expect(() => reconcileBulkResults(idsTarget(1), bad)).toThrow(BulkRequestError)
    }
    try {
      reconcileBulkResults(idsTarget(1), { result: [] })
    } catch (e) {
      expect((e as BulkRequestError).outcome).toBe("unknown")
    }
  })

  test("all matching: results are compared with the count the backend confirmed", () => {
    const all = reconcileBulkResults(queryTarget([], 578), { items: ids(578).map(ok), confirmedCount: 578 })
    expect(all.integrity).toMatchObject({ confirmedCount: 578, unreported: 0, overReported: 0, complete: true })
    expect(isBulkFullySucceeded(summaryOf(all))).toBe(true)
    // 確定した件数より結果が少ない：ID を特定できないため、件数だけを不足として示す。すべて完了にしない
    const fewer = reconcileBulkResults(queryTarget([], 578), { items: ids(570).map(ok), confirmedCount: 578 })
    expect(fewer.integrity).toMatchObject({ unreported: 8, complete: false })
    expect(isBulkFullySucceeded(summaryOf(fewer))).toBe(false)
    // 確定した件数より結果が多い：矛盾として扱う
    const more = reconcileBulkResults(queryTarget([], 578), { items: ids(580).map(ok), confirmedCount: 578 })
    expect(more.integrity).toMatchObject({ overReported: 2, complete: false })
    // 確定した件数を返さない：完全性を確かめられない。架空の件数を作らない
    const unknownCount = reconcileBulkResults(queryTarget(), ids(578).map(ok))
    expect(unknownCount.integrity).toMatchObject({ confirmedCount: null, unreported: null, complete: false })
    const negative = reconcileBulkResults(queryTarget(), { items: [], confirmedCount: -1 })
    expect(negative.integrity.confirmedCount).toBeNull()
  })

  test("all matching: a confirmed count different from the count shown at confirmation is not a full success", () => {
    // 選択のときは 580 件（expectedCount）、実行の時点でバックエンドが確定したのは 600 件
    const r = reconcileBulkResults(queryTarget(), { items: ids(600).map(ok), confirmedCount: 600 })
    expect(r.integrity).toMatchObject({ expectedCount: 580, confirmedCount: 600, countChanged: true, complete: false })
    expect(isBulkFullySucceeded(summaryOf(r))).toBe(false)
  })

  test("confirmedCount 0 with no results is complete; results with a 0 count are over-reported", () => {
    const zero = reconcileBulkResults({ ...queryTarget(), expectedCount: 0 } as BulkTarget, { items: [], confirmedCount: 0 })
    expect(zero.integrity).toMatchObject({ confirmedCount: 0, unreported: 0, overReported: 0, complete: true })
    const over = reconcileBulkResults({ ...queryTarget(), expectedCount: 0 } as BulkTarget, { items: [ok("C-00001")], confirmedCount: 0 })
    expect(over.integrity).toMatchObject({ overReported: 1, complete: false })
  })

  test("unexpected IDs are listed; non-string messages and non-boolean retryable are dropped", () => {
    const r = reconcileBulkResults(queryTarget(["C-00002"]), {
      items: [ok("C-00001"), ok("C-00002"), ok("C-00002")],
      confirmedCount: 1,
    })
    expect(r.integrity.unexpectedIds).toEqual(["C-00002"])
    expect(r.integrity.unexpected).toBe(2)
    const m = reconcileBulkResults(idsTarget(1), [{ id: "C-00001", outcome: "failed", message: { text: "x" }, retryable: "no" }])
    expect(m.failed[0]).toEqual({ id: "C-00001", outcome: "failed" })
  })

  test("the reconciled items are copies; later changes to the response do not change the summary", () => {
    const response = [ok("C-00001")]
    const r = reconcileBulkResults(idsTarget(1), response)
    response[0].outcome = "failed" as never
    expect(r.succeeded[0].outcome).toBe("succeeded")
  })
})
