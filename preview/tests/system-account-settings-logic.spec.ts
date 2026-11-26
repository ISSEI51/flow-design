import { expect, test } from "@playwright/test"

import { applyReset, planReset, resolveDependent, resolveSetting, settingAccess, toSettingSearchGroups, type SettingSearchEntry } from "../../registry/patterns/setting-resolve"
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
