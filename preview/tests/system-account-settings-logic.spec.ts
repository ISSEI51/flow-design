import { expect, test } from "@playwright/test"

import {
  applyReset,
  planReset,
  resolveDeliveryChannel,
  resolveDependent,
  resolveSetting,
  settingAccess,
  toSettingSearchGroups,
  type SettingSearchEntry,
} from "../../registry/patterns/setting-resolve"
import { classifySaveError } from "../../registry/patterns/setting-save"
import { collectPageErrors } from "./page-errors"

// Settings の値の継承、親と子の設定、閲覧と変更の可否、検索の候補、標準の設定へ戻す範囲の検品。ブラウザを使わない。
// 期待値は指示書 4.8〜4.10 の規則から決める（画面の表示から決めない）。
collectPageErrors(test)

test.describe("Settings logic: inheritance", () => {
  test("no user value: the org default wins over the product default", () => {
    const r = resolveSetting({ productDefault: "ja", orgDefault: "en" })
    expect(r).toMatchObject({ value: "en", source: "org-default", locked: false, lockReason: null, userValue: undefined })
    expect(r.inherited).toEqual({ value: "en", source: "org-default" })
  })

  test("no org default: the product default is used", () => {
    const r = resolveSetting({ productDefault: "ja" })
    expect(r).toMatchObject({ value: "ja", source: "product-default" })
  })

  test("a user override wins over the defaults, and the inherited value stays known", () => {
    const r = resolveSetting({ productDefault: "ja", orgDefault: "ja", userValue: "en" })
    expect(r).toMatchObject({ value: "en", source: "user", locked: false })
    expect(r.inherited).toEqual({ value: "ja", source: "org-default" })
  })

  test("a mandatory org policy cannot be disabled by the user; the user value is kept, not erased", () => {
    const reason = "組織のポリシーで必須です"
    const r = resolveSetting({ productDefault: false, orgPolicy: { value: true, reason }, userValue: false })
    expect(r.value).toBe(true)
    expect(r.source).toBe("org-policy")
    expect(r.locked).toBe(true)
    expect(r.lockReason).toBe(reason)
    expect(r.userValue).toBe(false)
    expect(r.userValueIgnored).toBe(true)
  })

  test("a policy equal to the user value is locked but the user value is not reported as ignored", () => {
    const r = resolveSetting({ productDefault: false, orgPolicy: { value: true, reason: "必須" }, userValue: true })
    expect(r).toMatchObject({ value: true, locked: true, userValueIgnored: false })
  })

  test("a policy with a falsy value still wins (false and empty values are not treated as missing)", () => {
    const r = resolveSetting({ productDefault: true, orgDefault: true, orgPolicy: { value: false, reason: "禁止" }, userValue: true })
    expect(r.value).toBe(false)
    expect(r.source).toBe("org-policy")
    const empty = resolveSetting({ productDefault: "x", userValue: "" })
    expect(empty).toMatchObject({ value: "", source: "user" })
  })
})

test.describe("Settings logic: dependent settings", () => {
  test("disabling the parent keeps the child value and marks it inactive with a reason", () => {
    const value = { start: "22:00", end: "07:00" }
    const off = resolveDependent({ parentEnabled: false, value, inactiveReason: "親がオフのため使われていません" })
    expect(off.stored).toEqual(value)
    expect(off.active).toBe(false)
    expect(off.inactiveReason).toBe("親がオフのため使われていません")
    const on = resolveDependent({ parentEnabled: true, value, inactiveReason: "親がオフのため使われていません" })
    expect(on).toEqual({ stored: value, active: true, inactiveReason: null })
  })
})

test.describe("Settings logic: view and edit permissions", () => {
  test("no view permission: hidden, and no reason is disclosed", () => {
    expect(settingAccess({ canView: false, canEdit: true, lockReason: "x" })).toEqual({ visible: false, editable: false, reason: null, restriction: "hidden" })
  })
  test("view without edit: visible, read only, with the permission reason", () => {
    const a = settingAccess({ canView: true, canEdit: false, noPermissionReason: "管理者に依頼してください" })
    expect(a).toEqual({ visible: true, editable: false, reason: "管理者に依頼してください", restriction: "permission" })
  })
  test("policy comes before plan, plan before permission", () => {
    expect(settingAccess({ canView: true, canEdit: false, lockReason: "ポリシー", planReason: "プラン" })).toMatchObject({ reason: "ポリシー", restriction: "policy" })
    expect(settingAccess({ canView: true, canEdit: false, planReason: "プラン" })).toMatchObject({ reason: "プラン", restriction: "plan" })
  })
  test("edit permission and no restriction: editable", () => {
    expect(settingAccess({ canView: true, canEdit: true })).toEqual({ visible: true, editable: true, reason: null, restriction: "none" })
  })
})

test.describe("Settings logic: search candidates", () => {
  const entries: SettingSearchEntry[] = [
    { id: "theme", label: "テーマ", categoryId: "display", category: "表示と言語", aliases: ["ダークモード"], visible: true },
    { id: "require-sso", label: "組織の SSO を必須にする", categoryId: "organization", category: "組織", aliases: ["SSO"], visible: false },
    { id: "org-name", label: "組織名", categoryId: "organization", category: "組織", visible: true },
  ]
  test("settings without view permission are excluded; category and aliases become keywords", () => {
    const groups = toSettingSearchGroups(entries)
    expect(groups.map((g) => g.value)).toEqual(["display", "organization"])
    const ids = groups.flatMap((g) => g.items.map((i) => i.value))
    expect(ids).toEqual(["theme", "org-name"])
    expect(ids).not.toContain("require-sso")
    expect(groups[0].items[0].keywords).toEqual(["表示と言語", "ダークモード"])
    expect(groups[0].items[0]).toMatchObject({ categoryId: "display", category: "表示と言語" })
  })
  test("a category whose settings are all hidden does not appear", () => {
    expect(toSettingSearchGroups([entries[1]])).toEqual([])
  })
})

test.describe("Settings logic: reset to defaults", () => {
  const defaults = { theme: "system", language: null as string | null, timezone: "Asia/Tokyo", mfa: false }
  test("only keys in the range change; other keys keep their values", () => {
    const current = { theme: "dark", language: "en" as string | null, timezone: "Asia/Tokyo", mfa: true }
    const plan = planReset(current, defaults, ["theme", "language", "timezone"])
    expect(plan.changes).toEqual([
      { key: "theme", from: "dark", to: "system" },
      { key: "language", from: "en", to: null },
    ])
    expect(plan.unchanged).toEqual(["timezone"])
    expect(plan.skipped).toEqual([])
    const next = applyReset(current, plan)
    expect(next).toEqual({ theme: "system", language: null, timezone: "Asia/Tokyo", mfa: true })
    // 元の値を書き換えない
    expect(current.theme).toBe("dark")
  })
  test("locked keys are skipped and keep their values", () => {
    const current = { theme: "dark", language: "en" as string | null, timezone: "Europe/London", mfa: true }
    const plan = planReset(current, defaults, ["theme", "mfa"], { locked: ["mfa"] })
    expect(plan.changes.map((c) => c.key)).toEqual(["theme"])
    expect(plan.skipped).toEqual(["mfa"])
    expect(applyReset(current, plan)).toEqual({ theme: "system", language: "en", timezone: "Europe/London", mfa: true })
  })
  test("already default: no changes", () => {
    expect(planReset(defaults, defaults, ["theme", "language"]).changes).toEqual([])
  })
})

test.describe("Settings logic: classifying save errors", () => {
  // 指示書 6 章：保存成功、確定した失敗、バリデーションによる拒否、権限不足、結果不明、クライアント側の待機中断を区別する。
  // 分類できない例外を確定した失敗にしない。AbortError だけで保存されなかったと判断しない。
  test("definite failures need an explicit server answer", () => {
    expect(classifySaveError({ outcome: "failed" })).toBe("failed")
    expect(classifySaveError({ status: 404 })).toBe("failed")
    expect(classifySaveError({ status: 429 })).toBe("failed")
    expect(classifySaveError({ outcome: "failed", code: "plan" })).toBe("failed")
  })
  test("validation, permission and version conflicts are separate kinds", () => {
    expect(classifySaveError({ status: 422 })).toBe("invalid")
    expect(classifySaveError({ status: 400 })).toBe("invalid")
    expect(classifySaveError({ code: "validation" })).toBe("invalid")
    expect(classifySaveError({ fieldErrors: { name: "必須です" } })).toBe("invalid")
    expect(classifySaveError({ status: 403 })).toBe("forbidden")
    expect(classifySaveError({ outcome: "failed", code: "forbidden" })).toBe("forbidden")
    expect(classifySaveError({ status: 409 })).toBe("conflict")
    expect(classifySaveError({ status: 412 })).toBe("conflict")
    expect(classifySaveError({ outcome: "failed", code: "conflict" })).toBe("conflict")
  })
  test("unclassified exceptions, timeouts and 5xx are unknown, not failed", () => {
    expect(classifySaveError(new TypeError("Failed to fetch"))).toBe("unknown")
    expect(classifySaveError(new Error("something"))).toBe("unknown")
    expect(classifySaveError("network down")).toBe("unknown")
    expect(classifySaveError(null)).toBe("unknown")
    expect(classifySaveError(undefined)).toBe("unknown")
    expect(classifySaveError({ name: "TimeoutError" })).toBe("unknown")
    expect(classifySaveError({ outcome: "unknown" })).toBe("unknown")
    expect(classifySaveError({ status: 500 })).toBe("unknown")
    expect(classifySaveError({ status: 503 })).toBe("unknown")
    expect(classifySaveError({ status: 504, code: "forbidden" })).toBe("unknown")
  })
  test("AbortError is the client's wait being stopped (aborted), never a definite failure", () => {
    expect(classifySaveError(new DOMException("aborted", "AbortError"))).toBe("aborted")
    expect(classifySaveError({ name: "AbortError", outcome: "failed" })).toBe("aborted")
  })
})

test.describe("Settings logic: policy and personal value conflicts", () => {
  test("a personal save that lands while a policy is introduced keeps the personal value; the policy decides the effective value", () => {
    // 個人の値（オフ）を保存した後に、組織のポリシー（必須）が届いた
    const before = resolveSetting({ productDefault: false, userValue: false })
    expect(before).toMatchObject({ value: false, source: "user", locked: false })
    const after = resolveSetting({ productDefault: false, userValue: false, orgPolicy: { value: true, reason: "必須" } })
    expect(after).toMatchObject({ value: true, source: "org-policy", userValue: false, userValueIgnored: true, locked: true })
    // ポリシーが外れると、保持していた個人の値が使われる
    expect(resolveSetting({ productDefault: false, userValue: false })).toMatchObject({ value: false, source: "user" })
  })
  test("a locked setting is not editable even with edit permission", () => {
    const r = resolveSetting({ productDefault: false, userValue: false, orgPolicy: { value: true, reason: "必須" } })
    expect(settingAccess({ canView: true, canEdit: true, lockReason: r.lockReason })).toMatchObject({ editable: false, restriction: "policy" })
  })
})

test.describe("Settings logic: notification delivery channels", () => {
  test("mandatory, org policy, personal value and device permission are distinguished", () => {
    // 個人の設定でオン、許可あり：届く
    expect(resolveDeliveryChannel({ userEnabled: true, permission: "granted" })).toMatchObject({ delivers: true, blockedBy: null })
    // 個人の設定でオフ
    expect(resolveDeliveryChannel({ userEnabled: false })).toMatchObject({ delivers: false, blockedBy: "user" })
    // 必須の通知：個人の値がオフでもオン。個人の値は残す
    const required = resolveDeliveryChannel({ userEnabled: false, required: { reason: "必須" } })
    expect(required.setting).toMatchObject({ value: true, locked: true, userValue: false, userValueIgnored: true, lockReason: "必須" })
    expect(required).toMatchObject({ delivers: true, blockedBy: null })
    // 組織のポリシーで使えない：オフに固定し、個人の値（オン）は残す
    const disabled = resolveDeliveryChannel({ userEnabled: true, disabledByPolicy: { reason: "使えません" } })
    expect(disabled.setting).toMatchObject({ value: false, locked: true, userValue: true, userValueIgnored: true })
    expect(disabled).toMatchObject({ delivers: false, blockedBy: "policy" })
    // 必須はポリシーより優先する
    expect(resolveDeliveryChannel({ userEnabled: false, required: { reason: "必須" }, disabledByPolicy: { reason: "x" } }).setting.value).toBe(true)
  })
  test("without device permission the personal setting stays on, but nothing is delivered to this device", () => {
    for (const permission of ["denied", "default", "unsupported"] as const) {
      const r = resolveDeliveryChannel({ userEnabled: true, permission })
      expect(r.setting.value).toBe(true)
      expect(r).toMatchObject({ delivers: false, blockedBy: "permission" })
    }
    // 必須の通知でも、端末の許可がなければ、この端末には届かない（届けたことにしない）
    expect(resolveDeliveryChannel({ userEnabled: true, required: { reason: "必須" }, permission: "denied" })).toMatchObject({ delivers: false, blockedBy: "permission" })
    // 個人の設定がオフなら、原因は個人の設定（許可の有無に関係しない）
    expect(resolveDeliveryChannel({ userEnabled: false, permission: "denied" }).blockedBy).toBe("user")
  })
})
