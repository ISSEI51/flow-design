import { expect, test } from "@playwright/test"

import {
  deriveChecklist,
  deriveRequirements,
  getSetupStatus,
  pickGuidance,
  resolveFirstScreen,
  type OnboardingTaskDefinition,
} from "../../registry/patterns/onboarding"
import { roles, type OnboardingTaskId, type Permission } from "../src/data/system-account/model"
import { onboardingTaskDefinitions } from "../src/data/system-account/onboarding-data"
import { onboardingApi, onboardingServer, type RealCustomer, type SampleCustomer } from "../src/data/system-account/onboarding-server"
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

  test("excluding a required task for lack of permission does not meet the requirement; minTasks is configurable", () => {
    // 以前は「この利用者が行える必須の作業だけ」で requirementsMet を判定していた（メンバーは支払い方法が未登録でも true）。
    // 必須の条件は、Checklist の表示の対象とは別に、すべての作業の定義と実際の作業結果から判定する。
    const m = deriveChecklist({ tasks, permissions: member, audience: "creator", results: none, visibility: "expanded" })
    expect(ids(m)).not.toContain("set-billing")
    expect(m.requirementsMet).toBe(false)
    expect(m.outstandingRequired).toEqual([])
    expect(m.outstandingRequiredWithoutPermission.map((r) => [r.id, r.permission, r.permitted])).toEqual([["set-billing", "billing.manage", false]])
    expect(m.requirements.met).toBe(false)
    const custom: OnboardingTaskDefinition<"a" | "b", Permission>[] = [
      { id: "a", title: "A", scope: "account" },
      { id: "b", title: "B", scope: "workspace", permission: "billing.manage" },
    ]
    expect(deriveChecklist({ tasks: custom, permissions: [], audience: "creator", results: { account: [], workspace: [] }, visibility: "expanded", minTasks: 1 }).presentation).toBe("expanded")
  })
})

test.describe("Onboarding: required conditions are separate from checklist progress", () => {
  const billingDone = { account: [] as OnboardingTaskId[], workspace: ["set-billing"] as OnboardingTaskId[] }

  test("the requirement depends only on task definitions and results, not on permissions, audience or visibility", () => {
    for (const permissions of [admin, member, viewer])
      for (const audience of ["creator", "invited"] as const)
        for (const visibility of ["expanded", "collapsed", "hidden"] as const) {
          expect(deriveChecklist({ tasks, permissions, audience, results: none, visibility }).requirementsMet).toBe(false)
          expect(deriveChecklist({ tasks, permissions, audience, results: billingDone, visibility }).requirementsMet).toBe(true)
        }
    // 閲覧者：Checklist を使わない（presentation: none）が、必須の条件は未達成のまま
    const v = deriveChecklist({ tasks, permissions: viewer, audience: "invited", results: none, visibility: "expanded" })
    expect(v.presentation).toBe("none")
    expect(v.requirementsMet).toBe(false)
    expect(v.outstandingRequiredWithoutPermission.map((r) => r.id)).toEqual(["set-billing"])
    // Checklist を使わなくても、deriveRequirements だけで同じ値を求められる（画面の利用制限の判定に使う）
    expect(deriveRequirements({ tasks, permissions: viewer, results: none })).toEqual(v.requirements)
    expect(deriveRequirements({ tasks, permissions: admin, results: billingDone })).toEqual({ met: true, outstanding: [] })
  })

  test("an account-scoped required task is met only by the account result", () => {
    const custom: OnboardingTaskDefinition<"mfa" | "x", Permission>[] = [
      { id: "mfa", title: "多要素認証", scope: "account", required: true },
      { id: "x", title: "X", scope: "workspace" },
    ]
    expect(deriveRequirements({ tasks: custom, permissions: [], results: { account: [], workspace: ["mfa"] } }).met).toBe(false)
    expect(deriveRequirements({ tasks: custom, permissions: [], results: { account: ["mfa"], workspace: [] } }).met).toBe(true)
  })
})

test.describe("Onboarding: zero target tasks are not 'all done'", () => {
  const gated: OnboardingTaskDefinition<"a" | "b", Permission>[] = [
    { id: "a", title: "A", scope: "workspace", permission: "billing.manage", required: true },
    { id: "b", title: "B", scope: "workspace", permission: "members.manage" },
  ]

  test("zero tasks: progress none and presentation none, even with minTasks 0; the requirement stays unmet", () => {
    for (const minTasks of [0, 1, 2]) {
      const c = deriveChecklist({ tasks: gated, permissions: [], audience: "creator", results: { account: [], workspace: [] }, visibility: "expanded", minTasks })
      expect(c.total).toBe(0)
      expect(c.progress).toBe("none")
      expect(c.presentation).toBe("none")
      expect(c.requirementsMet).toBe(false)
    }
  })

  test("invited member whose remaining tasks were all done by the workspace: no tasks, not completed", () => {
    const wsOnly: OnboardingTaskDefinition<"a" | "b", Permission>[] = [
      { id: "a", title: "A", scope: "workspace" },
      { id: "b", title: "B", scope: "workspace" },
    ]
    const c = deriveChecklist({ tasks: wsOnly, permissions: [], audience: "invited", results: { account: [], workspace: ["a", "b"] }, visibility: "expanded", minTasks: 0 })
    expect(c.total).toBe(0)
    expect(c.progress).toBe("none")
    expect(c.presentation).toBe("none")
    // 組織を作成した利用者には、同じ結果がすべて完了として示される
    const creator = deriveChecklist({ tasks: wsOnly, permissions: [], audience: "creator", results: { account: [], workspace: ["a", "b"] }, visibility: "expanded" })
    expect(creator.progress).toBe("completed")
    expect(creator.presentation).toBe("completed")
  })
})

test.describe("Onboarding: recalculation from the current role and the current results", () => {
  const some = { account: ["complete-profile"] as OnboardingTaskId[], workspace: ["invite-members"] as OnboardingTaskId[] }

  test("a role change recalculates the target tasks from the same results (admin → member → admin)", () => {
    const a1 = deriveChecklist({ tasks, permissions: admin, audience: "creator", results: some, visibility: "expanded" })
    const m = deriveChecklist({ tasks, permissions: member, audience: "creator", results: some, visibility: "expanded" })
    const a2 = deriveChecklist({ tasks, permissions: admin, audience: "creator", results: some, visibility: "expanded" })
    expect([a1.total, a1.doneCount]).toEqual([5, 2])
    // メンバーには招待（完了済み）と支払いを示さない。完了の件数は、表示する作業の中だけで数える
    expect(ids(m).sort()).toEqual(["complete-profile", "first-customer", "import-customers"])
    expect([m.total, m.doneCount]).toEqual([3, 1])
    expect(a2).toEqual(a1)
    // 必須の条件は役割で変わらない
    expect([a1.requirementsMet, m.requirementsMet]).toEqual([false, false])
  })

  test("a task completed earlier becomes incomplete when its result disappears (derived from results, not remembered)", () => {
    const all = { account: ["complete-profile"] as OnboardingTaskId[], workspace: ["first-customer", "import-customers", "invite-members", "set-billing"] as OnboardingTaskId[] }
    const lost = { account: all.account, workspace: all.workspace.filter((id) => id !== "set-billing") }
    const before = deriveChecklist({ tasks, permissions: admin, audience: "creator", results: all, visibility: "collapsed" })
    expect([before.progress, before.presentation, before.requirementsMet]).toEqual(["completed", "completed", true])
    const after = deriveChecklist({ tasks, permissions: admin, audience: "creator", results: lost, visibility: "collapsed" })
    expect([after.progress, after.presentation, after.requirementsMet]).toEqual(["in-progress", "collapsed", false])
    expect(after.outstandingRequired.map((i) => i.id)).toEqual(["set-billing"])
    // すべて完了の後に閉じていた（hidden）場合も、必須の作業が残ったことは outstandingRequired で示せる
    const closed = deriveChecklist({ tasks, permissions: admin, audience: "creator", results: lost, visibility: "hidden" })
    expect(closed.presentation).toBe("hidden")
    expect(closed.outstandingRequired.map((i) => i.id)).toEqual(["set-billing"])
    // 招待されたメンバーには、組織で未完了に戻った作業を、権限があれば再び示す
    const reopened = { account: [] as OnboardingTaskId[], workspace: ["import-customers", "invite-members", "set-billing"] as OnboardingTaskId[] }
    expect(ids(deriveChecklist({ tasks, permissions: member, audience: "invited", results: reopened, visibility: "expanded" })).sort()).toEqual([
      "complete-profile",
      "first-customer",
    ])
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

  test("the same user in another workspace: account results carry over, workspace results do not", async () => {
    const hq = await onboardingApi.getResults("u-sato", "hq")
    const created = await onboardingApi.getResults("u-sato", "new")
    expect(hq.account).toEqual(["complete-profile"])
    expect(created.account).toEqual(["complete-profile"])
    expect([...hq.workspace].sort()).toEqual(["first-customer", "import-customers", "invite-members", "set-billing"])
    expect(created.workspace).toEqual([])
    const v = await onboardingApi.getProgress("u-sato", "new")
    expect(v.visibility).toBe("expanded")
    expect((await onboardingApi.getProgress("u-sato", "hq")).visibility).toBe("hidden")
  })

  test("sample data does not enter billing usage or external sending; the types keep them apart", async () => {
    await onboardingApi.startSample("new")
    await onboardingApi.addCustomer("new", "sample", "サンプルの追加")
    expect(await onboardingApi.getUsage("new")).toEqual({ customers: 0 })
    await onboardingApi.addCustomer("new", "real", "株式会社じっさい")
    expect(await onboardingApi.getUsage("new")).toEqual({ customers: 1 })
    expect(onboardingServer.snapshot().sent).toEqual([])
    const sample: SampleCustomer = { id: "S-9", company: "サンプル", sample: true }
    // @ts-expect-error サンプルの顧客は、実際の顧客（集計、請求、外部への送信の対象）の型にならない
    const asReal: RealCustomer = sample
    expect(asReal.sample).toBe(true)
  })

  test("skipping the optional steps creates the workspace with the defaults: no invitations, no sample data", async () => {
    const { workspaceId } = await onboardingApi.createWorkspace("u-sato", { requestId: "r-skip", name: "初期値の組織", invites: [], start: "empty" })
    const snap = onboardingServer.snapshot()
    expect(snap.workspaces[workspaceId]).toMatchObject({ invitations: [], sample: null, billing: false, imports: 0 })
    expect(snap.sent).toEqual([])
  })

  test("held requests are processed only when released, in the order the test chooses", async () => {
    onboardingServer.holdWhen = (r) => r.kind === "add-customer"
    const first = onboardingApi.addCustomer("new", "real", "一番目")
    const second = onboardingApi.addCustomer("new", "real", "二番目")
    expect(onboardingServer.held).toHaveLength(2)
    expect(onboardingServer.snapshot().workspaces.new.real).toHaveLength(0)
    expect(await onboardingServer.releaseHeld((r) => r === onboardingServer.held[1])).toBe(1)
    expect((await second).company).toBe("二番目")
    expect(await onboardingServer.releaseHeld()).toBe(1)
    expect((await first).company).toBe("一番目")
    expect(onboardingServer.snapshot().workspaces.new.real.map((c) => c.company)).toEqual(["一番目", "二番目"])
  })

  test("creating a workspace twice with the same request ID creates it once", async () => {
    const payload = { requestId: "r-1", name: "テスト組織", invites: [], start: "empty" as const }
    const a = await onboardingApi.createWorkspace("u-sato", payload)
    const b = await onboardingApi.createWorkspace("u-sato", payload)
    expect(a.workspaceId).toBe(b.workspaceId)
    expect(Object.keys(onboardingServer.snapshot().created)).toEqual(["r-1"])
  })
})
