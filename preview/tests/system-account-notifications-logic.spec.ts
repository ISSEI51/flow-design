import { expect, test } from "@playwright/test"

import {
  applyReadAll,
  computeUnreadCount,
  createReadAllRange,
  dedupeNotifications,
  describeDelivery,
  focusAfterRemoval,
  formatNotificationTime,
  formatRelativeTime,
  getUnreadIndicator,
  groupNotifications,
  isInReadAllRange,
  isWithinQuietHours,
  mergeNotifications,
  notificationTriggerLabel,
  planDelivery,
  sortNotifications,
  type NotificationLike,
} from "../../registry/patterns/notification-state"
import { collectPageErrors } from "./page-errors"

// Notifications の純粋な関数（registry/patterns/notification-state.ts）の検品。ブラウザを使わない。
// 期待値は仕様（docs/web/patterns/notifications.md）から決める。
collectPageErrors(test)

const NOW = Date.parse("2026-11-26T10:00:00+09:00")
const MIN = 60_000
type N = NotificationLike & { type?: string }
const n = (id: string, minutesAgo: number, extra: Partial<N> = {}): N => ({
  id,
  eventId: `e-${id}`,
  title: `通知 ${id}`,
  createdAt: NOW - minutesAgo * MIN,
  read: false,
  ...extra,
})

test.describe("Notification state: order, duplicates, grouping", () => {
  test("sorted newest first; equal times are ordered by ID so the order is stable", () => {
    const out = sortNotifications([n("a", 10), n("c", 5), n("b", 5)]).map((x) => x.id)
    expect(out).toEqual(["c", "b", "a"])
  })

  test("duplicates are identified by notification ID and event ID, not by the title", () => {
    const sameText = [n("a", 1, { title: "同じ文" }), n("b", 2, { title: "同じ文" })]
    expect(dedupeNotifications(sameText).items.map((x) => x.id)).toEqual(["a", "b"])
    const sameId = [n("a", 1), { ...n("a", 1), title: "別の文" }]
    expect(dedupeNotifications(sameId).items).toHaveLength(1)
    const sameEvent = [n("a", 1, { eventId: "e-1" }), n("b", 1, { eventId: "e-1" })]
    const r = dedupeNotifications(sameEvent)
    expect(r.items.map((x) => x.id)).toEqual(["a"])
    expect(r.duplicates.map((x) => x.id)).toEqual(["b"])
    // eventId がない通知どうしは、ID だけで判定する
    expect(dedupeNotifications([n("a", 1, { eventId: null }), n("b", 1, { eventId: null })]).items).toHaveLength(2)
  })

  test("merging keeps the current item (and its read state) and reports only really added ones", () => {
    const current = [n("a", 5, { read: true })]
    const r = mergeNotifications(current, [n("a", 5, { read: false }), n("b", 0)])
    expect(r.items.map((x) => [x.id, x.read])).toEqual([
      ["b", false],
      ["a", true],
    ])
    expect(r.added.map((x) => x.id)).toEqual(["b"])
    expect(r.duplicates).toBe(1)
  })

  test("grouping: only groupable items with the same key, 2 or more, placed at the newest one; items stay reachable", () => {
    const items = [
      n("x", 1),
      n("r1", 30, { groupKey: "renewal", read: true }),
      n("r2", 20, { groupKey: "renewal" }),
      n("s1", 10, { groupKey: "login", type: "security" }),
      n("s2", 15, { groupKey: "login", type: "security" }),
      n("solo", 40, { groupKey: "only-one" }),
    ]
    const entries = groupNotifications(items, { canGroup: (i) => i.type !== "security" })
    expect(entries.map((e) => e.key)).toEqual(["x", "s1", "s2", "group:renewal", "solo"])
    const group = entries.find((e) => e.kind === "group")!
    expect(group.kind === "group" && group.items.map((i) => i.id)).toEqual(["r2", "r1"])
    expect(group.kind === "group" && group.unread).toBe(1)
    expect(group.kind === "group" && group.latest.id).toBe("r2")
  })
})

test.describe("Notification state: unread indicator", () => {
  test("0 shows nothing; 1..99 shows the count; over 99 shows 99+ with the exact count in the name", () => {
    expect(getUnreadIndicator({ count: 0 })).toMatchObject({ kind: "none", text: null })
    expect(getUnreadIndicator({ count: 3 })).toMatchObject({ kind: "count", text: "3", description: "未読 3 件" })
    expect(getUnreadIndicator({ count: 99 })).toMatchObject({ kind: "count", text: "99" })
    const many = getUnreadIndicator({ count: 120 })
    expect(many).toMatchObject({ kind: "count", text: "99+" })
    expect(notificationTriggerLabel("お知らせ", many)).toBe("お知らせ、未読 120 件")
    expect(notificationTriggerLabel("お知らせ", getUnreadIndicator({ count: 1234 }))).toBe("お知らせ、未読 1,234 件")
  })

  test("dot display: the presence only, but the name still says the exact count", () => {
    const dot = getUnreadIndicator({ count: 3, display: "dot" })
    expect(dot).toMatchObject({ kind: "dot", text: null })
    expect(notificationTriggerLabel("お知らせ", dot)).toBe("お知らせ、未読 3 件")
    expect(getUnreadIndicator({ count: 0, display: "dot" }).kind).toBe("none")
  })

  test("unknown count: no invented number (dot when unread is known to exist, nothing otherwise)", () => {
    const known = getUnreadIndicator({ count: null, hasUnread: true, display: "count" })
    expect(known).toMatchObject({ kind: "dot", text: null, description: "未読あり" })
    const unknown = getUnreadIndicator({ count: null, display: "count" })
    expect(unknown).toMatchObject({ kind: "none", text: null, description: "" })
    expect(notificationTriggerLabel("お知らせ", unknown)).toBe("お知らせ")
  })

  test("displayed unread count: reported count + local pending changes + held new arrivals", () => {
    const base = [n("a", 1), n("b", 2), n("c", 3, { read: true })]
    // サーバーは未読 10 件（読み込んだのは 3 件）。a を既読に更新中、c を未読に戻す更新中、保留中の新着 1 件
    const shown = [{ ...base[0], read: true }, base[1], { ...base[2], read: false }]
    expect(computeUnreadCount({ reported: 10, base, shown, pending: [n("new", 0)] })).toBe(11)
    expect(computeUnreadCount({ reported: 10, base, shown: base })).toBe(10)
    // 件数が不明で、すべてを読み込んでいない：数えない
    expect(computeUnreadCount({ reported: null, base, shown: base, complete: false })).toBeNull()
    // 件数が不明でも、すべてを読み込んでいれば数えられる
    expect(computeUnreadCount({ reported: null, base, shown: base, complete: true })).toBe(2)
  })
})

test.describe("Notification state: read-all range", () => {
  test("ids range: fixed at start; arrivals during the run stay unread", () => {
    const start = [n("a", 1), n("b", 2, { read: true }), n("c", 3)]
    const range = createReadAllRange(start, { scope: "u:hq" })
    expect(range).toMatchObject({ kind: "ids", scope: "u:hq", ids: ["a", "c"] })
    const during = [n("late", 0), ...start]
    const after = applyReadAll(during, range)
    expect(after.map((x) => [x.id, x.read])).toEqual([
      ["late", false],
      ["a", true],
      ["b", true],
      ["c", true],
    ])
  })

  test("cursor range by server sequence: everything up to the start, including unloaded older ones; later arrivals excluded", () => {
    const start = [n("a", 5, { sequence: 9 }), n("b", 10, { sequence: 10 })]
    const range = createReadAllRange(start, { scope: "s", by: "cursor" })
    expect(range).toMatchObject({ kind: "cursor", field: "sequence", until: 10 })
    expect(isInReadAllRange(n("older-unloaded", 60, { sequence: 2 }), range)).toBe(true)
    expect(isInReadAllRange(n("a", 5, { sequence: 9 }), range)).toBe(true)
    expect(isInReadAllRange(n("newer", 1, { sequence: 11 }), range)).toBe(false)
    // 処理中に届いた、発生時刻の古いイベント（遅れて届いた）も、受け付けた順では後なので含めない
    expect(isInReadAllRange(n("late-old-event", 120, { sequence: 12 }), range)).toBe(false)
    // 番号は数値で比べる（文字列の "n-10" < "n-9" の問題がない）
    const r2 = createReadAllRange([n("n-9", 3, { sequence: 9 }), n("n-10", 1, { sequence: 10 })], { scope: "s", by: "cursor" })
    expect(isInReadAllRange(n("n-10", 1, { sequence: 10 }), r2)).toBe(true)
    expect(isInReadAllRange(n("n-11", 0, { sequence: 11 }), r2)).toBe(false)
  })

  test("cursor range without sequence falls back to the event time (documented limitation)", () => {
    const range = createReadAllRange([n("a", 5), n("b", 10)], { scope: "s", by: "cursor" })
    expect(range).toMatchObject({ kind: "cursor", field: "createdAt", until: NOW - 5 * MIN })
    expect(isInReadAllRange(n("older", 60), range)).toBe(true)
    expect(isInReadAllRange(n("newer", 1), range)).toBe(false)
    // 制約：処理中に届いた発生時刻の古い通知は含まれる（sequence を使うと含まれない。上の検品）
    expect(isInReadAllRange(n("late-old-event", 120), range)).toBe(true)
    // 一部の通知に sequence がない場合も発生時刻で比べる
    expect(createReadAllRange([n("a", 5, { sequence: 1 }), n("b", 6)], { scope: "s", by: "cursor" })).toMatchObject({ field: "createdAt" })
    expect(createReadAllRange([], { scope: "s", by: "cursor" })).toMatchObject({ until: null, ids: [] })
    expect(isInReadAllRange(n("x", 1), createReadAllRange([], { scope: "s", by: "cursor" }))).toBe(false)
  })
})

test.describe("Notification state: focus after removal", () => {
  test("next remaining item, else previous, else null", () => {
    expect(focusAfterRemoval(["a", "b", "c"], ["a", "c"], "b")).toBe("c")
    expect(focusAfterRemoval(["a", "b", "c"], ["a", "b"], "c")).toBe("b")
    expect(focusAfterRemoval(["a", "b", "c"], ["a"], "b")).toBe("a")
    expect(focusAfterRemoval(["a"], [], "a")).toBeNull()
  })
})

test.describe("Notification state: time", () => {
  test("relative time from the given reference time (not the clock)", () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe("たった今")
    expect(formatRelativeTime(NOW + 5_000, NOW)).toBe("たった今")
    expect(formatRelativeTime(NOW - 4 * MIN, NOW)).toBe("4 分前")
    expect(formatRelativeTime(NOW - 180 * MIN, NOW)).toBe("3 時間前")
    expect(formatRelativeTime(NOW - 26 * 60 * MIN, NOW)).toBe("1 日前")
    expect(formatRelativeTime(NOW - 8 * 24 * 60 * MIN, NOW)).toBeNull()
  })

  test("absolute time uses the given time zone; dateTime is ISO", () => {
    const t = formatNotificationTime(NOW - 4 * MIN, { now: NOW, timeZone: "Asia/Tokyo" })
    expect(t).toEqual({ text: "4 分前", relative: "4 分前", absolute: "2026年11月26日 9:56", iso: "2026-11-26T00:56:00.000Z" })
    expect(formatNotificationTime(NOW - 4 * MIN, { now: NOW, timeZone: "America/New_York" }).absolute).toBe("2026年11月25日 19:56")
    // 7 日以上前は日付
    expect(formatNotificationTime(NOW - 10 * 24 * 60 * MIN, { now: NOW, timeZone: "Asia/Tokyo" }).text).toBe("11月16日")
  })
})

test.describe("Notification state: quiet hours and delivery", () => {
  const quiet = { enabled: true, start: "22:00", end: "07:00", timeZone: "Asia/Tokyo" }
  const at = (iso: string) => Date.parse(iso)

  test("a range across midnight in the user's time zone", () => {
    expect(isWithinQuietHours(at("2026-11-26T23:30:00+09:00"), quiet)).toBe(true)
    expect(isWithinQuietHours(at("2026-11-27T06:59:00+09:00"), quiet)).toBe(true)
    expect(isWithinQuietHours(at("2026-11-27T07:00:00+09:00"), quiet)).toBe(false)
    expect(isWithinQuietHours(at("2026-11-26T21:59:00+09:00"), quiet)).toBe(false)
    expect(isWithinQuietHours(at("2026-11-26T22:00:00+09:00"), quiet)).toBe(true)
    // 同じ時刻（UTC 13:30）でも、タイムゾーンが変わると判定が変わる
    const instant = at("2026-11-26T13:30:00Z")
    expect(isWithinQuietHours(instant, quiet)).toBe(true) // 東京 22:30
    expect(isWithinQuietHours(instant, { ...quiet, timeZone: "Europe/London" })).toBe(false) // ロンドン 13:30
  })

  test("a range within a day, disabled, and equal start and end", () => {
    const day = { enabled: true, start: "09:00", end: "18:00", timeZone: "Asia/Tokyo" }
    expect(isWithinQuietHours(at("2026-11-26T12:00:00+09:00"), day)).toBe(true)
    expect(isWithinQuietHours(at("2026-11-26T18:00:00+09:00"), day)).toBe(false)
    expect(isWithinQuietHours(at("2026-11-26T23:00:00+09:00"), { ...quiet, enabled: false })).toBe(false)
    expect(isWithinQuietHours(at("2026-11-26T23:00:00+09:00"), { ...quiet, start: "22:00", end: "22:00" })).toBe(false)
  })

  test("urgent notifications are never deferred or digested", () => {
    const night = at("2026-11-26T23:30:00+09:00")
    expect(planDelivery({ urgent: true, at: night, quietHours: quiet, digest: true })).toBe("immediate")
    expect(planDelivery({ urgent: false, at: night, quietHours: quiet, digest: true })).toBe("deferred")
    expect(planDelivery({ urgent: false, at: at("2026-11-26T10:00:00+09:00"), quietHours: quiet, digest: true })).toBe("digest")
    expect(planDelivery({ urgent: false, at: at("2026-11-26T10:00:00+09:00"), quietHours: quiet })).toBe("immediate")
  })

  test("delivery: sent is not delivered; unconfirmable channels are not guessed as delivered", () => {
    const base = { channel: "email", sentAt: null, deliveredAt: null, deliveryConfirmable: false }
    expect(describeDelivery(base).state).toBe("not-sent")
    expect(describeDelivery({ ...base, held: true }).state).toBe("held")
    expect(describeDelivery({ ...base, sentAt: NOW }).state).toBe("sent-unconfirmable")
    expect(describeDelivery({ ...base, sentAt: NOW }).label).toBe("送信済み（届いたかは確認できません）")
    expect(describeDelivery({ ...base, channel: "push", sentAt: NOW, deliveryConfirmable: true }).state).toBe("sent-awaiting")
    expect(describeDelivery({ ...base, channel: "in-app", sentAt: NOW, deliveredAt: NOW, deliveryConfirmable: true })).toEqual({ state: "delivered", label: "配信済み" })
    expect(describeDelivery({ ...base, sentAt: NOW, failed: true }).state).toBe("failed")
  })
})
