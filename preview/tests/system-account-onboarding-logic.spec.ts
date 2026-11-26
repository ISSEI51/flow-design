import { expect, test } from "@playwright/test"

import { deriveChecklist, getSetupStatus, pickGuidance, resolveFirstScreen, type OnboardingTaskDefinition } from "../../registry/patterns/onboarding"
import { roles, type OnboardingTaskId, type Permission } from "../src/data/system-account/model"
import { onboardingTaskDefinitions } from "../src/data/system-account/onboarding-data"
import { onboardingApi, onboardingServer } from "../src/data/system-account/onboarding-server"
import { collectPageErrors } from "./page-errors"

// Onboarding の純粋な関数（registry/patterns/onboarding.ts）と、模擬のサーバーのデータの分離の検品。ブラウザを使わない。
// 期待値は資料（docs/web/patterns/onboarding.md）の規則から決める。
collectPageErrors(test)

const tasks = onboardingTaskDefinitions
const admin = roles.admin.permissions
const member = roles.member.permissions
const viewer = roles.viewer.permissions
const none = { account: [] as OnboardingTaskId[], workspace: [] as OnboardingTaskId[] }
const ids = (c: { items: { id: string }[] }) => c.items.map((i) => i.id)

test.describe("Onboarding: first screen after authentication", () => {
  test("a member of a workspace goes straight to the product; no welcome screen exists", () => {
    expect(resolveFirstScreen({ hasWorkspace: true })).toEqual({ screen: "product" })
    expect(resolveFirstScreen({ hasWorkspace: true, requiredSetup: [{ id: "mfa", done: true }] })).toEqual({ screen: "product" })
  })

  test("only screens with a purpose are inserted: invitation, workspace creation, required setup", () => {
    expect(resolveFirstScreen({ hasWorkspace: false })).toEqual({ screen: "create-workspace" })
    expect(resolveFirstScreen({ hasWorkspace: true, pendingInvitation: true })).toEqual({ screen: "accept-invitation" })
    expect(resolveFirstScreen({ hasWorkspace: false, pendingInvitation: true })).toEqual({ screen: "accept-invitation" })
    expect(
      resolveFirstScreen({ hasWorkspace: true, requiredSetup: [{ id: "mfa", done: false }, { id: "terms", done: true }, { id: "sso", done: false }] })
    ).toEqual({ screen: "required-setup", missing: ["mfa", "sso"] })
  })
})

test.describe("Onboarding: checklist derivation", () => {
  test("completion comes only from actual results; nothing is done without results", () => {
    const c = deriveChecklist({ tasks, permissions: admin, audience: "creator", results: none, visibility: "expanded" })
    expect(c.total).toBe(5)
    expect(c.doneCount).toBe(0)
    expect(c.progress).toBe("not-started")
    expect(c.items.every((i) => !i.done)).toBe(true)
    expect(c.presentation).toBe("expanded")
  })

  test("account and workspace results are not mixed: a result in the wrong scope does not complete the task", () => {
    // complete-profile はアカウント単位、first-customer は組織単位
    const wrong = deriveChecklist({
      tasks,
      permissions: admin,
      audience: "creator",
      results: { account: ["first-customer"], workspace: ["complete-profile"] },
      visibility: "expanded",
    })
    expect(wrong.doneCount).toBe(0)
    const right = deriveChecklist({
      tasks,
      permissions: admin,
      audience: "creator",
      results: { account: ["complete-profile"], workspace: ["first-customer"] },
      visibility: "expanded",
    })
    expect(right.items.filter((i) => i.done).map((i) => i.id).sort()).toEqual(["complete-profile", "first-customer"])
    expect(right.progress).toBe("in-progress")
  })

  test("tasks without permission are excluded (member: no invitations, no billing; viewer: no checklist)", () => {
    const m = deriveChecklist({ tasks, permissions: member, audience: "invited", results: none, visibility: "expanded" })
    expect(ids(m).sort()).toEqual(["complete-profile", "first-customer", "import-customers"])
    const v = deriveChecklist({ tasks, permissions: viewer, audience: "invited", results: none, visibility: "expanded" })
    expect(ids(v)).toEqual(["complete-profile"])
    // 作業が 1 件以下なら Checklist を使わない
    expect(v.presentation).toBe("none")
  })

  test("invited members are not asked again for workspace tasks already completed; the creator sees them as done", () => {
    const results = { account: [] as OnboardingTaskId[], workspace: ["first-customer", "import-customers", "invite-members", "set-billing"] as OnboardingTaskId[] }
    const invited = deriveChecklist({ tasks, permissions: member, audience: "invited", results, visibility: "expanded" })
    expect(ids(invited)).toEqual(["complete-profile"])
    expect(invited.presentation).toBe("none")
    const creator = deriveChecklist({ tasks, permissions: admin, audience: "creator", results, visibility: "expanded" })
    expect(creator.total).toBe(5)
    expect(creator.doneCount).toBe(4)
  })

  test("hidden is not completed: hiding keeps progress and the outstanding required task", () => {
    const results = { account: ["complete-profile"] as OnboardingTaskId[], workspace: ["first-customer"] as OnboardingTaskId[] }
    const shown = deriveChecklist({ tasks, permissions: admin, audience: "creator", results, visibility: "expanded" })
    const hidden = deriveChecklist({ tasks, permissions: admin, audience: "creator", results, visibility: "hidden" })
    expect(hidden.presentation).toBe("hidden")
    expect(hidden.progress).toBe("in-progress")
    expect(hidden.doneCount).toBe(shown.doneCount)
    expect(hidden.requirementsMet).toBe(false)
    expect(hidden.outstandingRequired.map((i) => i.id)).toEqual(["set-billing"])
  })

  test("all done: progress completed, presentation completed unless hidden; collapsed is kept otherwise", () => {
    const all = { account: ["complete-profile"] as OnboardingTaskId[], workspace: ["first-customer", "import-customers", "invite-members", "set-billing"] as OnboardingTaskId[] }
    const done = deriveChecklist({ tasks, permissions: admin, audience: "creator", results: all, visibility: "collapsed" })
    expect(done.progress).toBe("completed")
    expect(done.presentation).toBe("completed")
    expect(done.requirementsMet).toBe(true)
    expect(deriveChecklist({ tasks, permissions: admin, audience: "creator", results: all, visibility: "hidden" }).presentation).toBe("hidden")
    expect(deriveChecklist({ tasks, permissions: admin, audience: "creator", results: none, visibility: "collapsed" }).presentation).toBe("collapsed")
  })

  test("required tasks the viewer cannot do do not block the viewer's requirements; minTasks is configurable", () => {
    const m = deriveChecklist({ tasks, permissions: member, audience: "creator", results: none, visibility: "expanded" })
    expect(m.requirementsMet).toBe(true)
    const custom: OnboardingTaskDefinition<"a" | "b", Permission>[] = [
      { id: "a", title: "A", scope: "account" },
      { id: "b", title: "B", scope: "workspace", permission: "billing.manage" },
    ]
    expect(deriveChecklist({ tasks: custom, permissions: [], audience: "creator", results: { account: [], workspace: [] }, visibility: "expanded", minTasks: 1 }).presentation).toBe("expanded")
  })
})

test.describe("Onboarding: setup status and guidance", () => {
  test("setup status distinguishes not started, in progress, interrupted, skipped and completed", () => {
    expect(getSetupStatus({ completed: false, hasDraft: false, active: false })).toBe("not-started")
    expect(getSetupStatus({ completed: false, hasDraft: false, active: true })).toBe("not-started")
    expect(getSetupStatus({ completed: false, hasDraft: true, active: true })).toBe("in-progress")
    expect(getSetupStatus({ completed: false, hasDraft: true, active: false })).toBe("interrupted")
    expect(getSetupStatus({ completed: false, skipped: true, hasDraft: true, active: false })).toBe("skipped")
    expect(getSetupStatus({ completed: true, skipped: true, hasDraft: true, active: true })).toBe("completed")
  })

  test("only one guidance is picked; dismissed and ineligible candidates are skipped", () => {
    const c = [
      { id: "a", eligible: false },
      { id: "b", eligible: true },
      { id: "c", eligible: true },
    ]
    expect(pickGuidance(c, [])).toBe("b")
    expect(pickGuidance(c, ["b"])).toBe("c")
    expect(pickGuidance(c, ["b", "c"])).toBeNull()
  })
})

test.describe("Onboarding mock server: sample data is separate from real data", () => {
  test.beforeEach(() => {
    onboardingServer.reset()
    for (const k of Object.keys(onboardingServer.latency) as (keyof typeof onboardingServer.latency)[]) onboardingServer.latency[k] = 0
  })

  test("adding to the sample space does not change real customers or task results", async () => {
    await onboardingApi.startSample("new")
    await onboardingApi.addCustomer("new", "sample", "サンプルの追加")
    const snap = onboardingServer.snapshot()
    expect(snap.workspaces.new.real).toHaveLength(0)
    expect(snap.workspaces.new.sample).toHaveLength(5)
    const results = await onboardingApi.getResults("u-sato", "new")
    expect(results.workspace).not.toContain("first-customer")
    const real = await onboardingApi.listCustomers("new", "real", "")
    expect(real.total).toBe(0)
    await onboardingApi.deleteSample("new")
    expect(onboardingServer.snapshot().workspaces.new.sample).toBeNull()
  })

  test("changes with the same request ID are processed once (customer, import, invitation)", async () => {
    const a = await onboardingApi.addCustomer("new", "real", "株式会社いちど", { requestId: "q-1" })
    const b = await onboardingApi.addCustomer("new", "real", "株式会社いちど", { requestId: "q-1" })
    expect(b).toEqual(a)
    expect(await onboardingApi.importCustomers("new", { requestId: "q-2" })).toBe(3)
    expect(await onboardingApi.importCustomers("new", { requestId: "q-2" })).toBe(3)
    await onboardingApi.invite("new", "x@example.com", { requestId: "q-3" })
    await onboardingApi.invite("new", "x@example.com", { requestId: "q-3" })
    const snap = onboardingServer.snapshot()
    expect(snap.workspaces.new.real).toHaveLength(4)
    expect(snap.workspaces.new.imports).toBe(1)
    expect(snap.workspaces.new.invitations).toEqual(["x@example.com"])
    expect(snap.sent).toHaveLength(1)
    // 照会：処理した要求は最初の結果、処理していない要求は null
    expect(await onboardingApi.findRequest("q-2")).toBe(3)
    expect(await onboardingApi.findRequest("q-404")).toBeNull()
  })

  test("an unknown result that was processed can be found; a dropped request is not processed", async () => {
    onboardingServer.outcomeNext.import = "unknown"
    await expect(onboardingApi.importCustomers("new", { requestId: "u-1" })).rejects.toThrow()
    expect(await onboardingApi.findRequest("u-1")).toBe(3)
    onboardingServer.dropNext.invite = true
    await expect(onboardingApi.invite("new", "y@example.com", { requestId: "u-2" })).rejects.toThrow()
    expect(await onboardingApi.findRequest("u-2")).toBeNull()
    expect(onboardingServer.snapshot().workspaces.new.invitations).toEqual([])
  })

  test("creating a workspace twice with the same request ID creates it once", async () => {
    const payload = { requestId: "r-1", name: "テスト組織", invites: [], start: "empty" as const }
    const a = await onboardingApi.createWorkspace("u-sato", payload)
    const b = await onboardingApi.createWorkspace("u-sato", payload)
    expect(a.workspaceId).toBe(b.workspaceId)
    expect(Object.keys(onboardingServer.snapshot().created)).toEqual(["r-1"])
  })
})
