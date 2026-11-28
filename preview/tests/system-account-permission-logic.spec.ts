import { expect, test } from "@playwright/test"

import {
  decideAccess,
  type AccessDecision,
  diffPermissions,
  isAccessVerified,
  pageAccessFromStatus,
  presentAction,
  resolveContentAccess,
  restrictionText,
  type AccessSnapshot,
  type ActionAudience,
  type Restriction,
} from "../../registry/patterns/access-decision"
import { MockRequestError } from "../src/data/system-account/mock"
import { plans, roles, workspaces, type Feature, type Permission } from "../src/data/system-account/model"
import { confidentialCustomerIds, requestablePermissions } from "../src/data/system-account/permission-data"
import { permissionServer } from "../src/data/system-account/permission-server"
import { collectPageErrors } from "./page-errors"

// Permission States の判断の関数（registry/patterns/access.ts）と、模擬のサーバーの認可の検品。ブラウザを使わない。
// 期待値は、指示書の判断基準（6 章）と model.ts のロール・契約プランから決める。
collectPageErrors(test)

type Snapshot = AccessSnapshot<Permission, Feature>
const grants = (role: keyof typeof roles, workspace: keyof typeof workspaces = "hq") => ({
  scope: `x:${workspace}`,
  permissions: roles[role].permissions,
  features: plans[workspaces[workspace].plan].features,
})
const ready = (role: keyof typeof roles, workspace: keyof typeof workspaces = "hq"): Snapshot => ({ status: "ready", grants: grants(role, workspace), error: null })
const loading: Snapshot = { status: "loading", grants: null, error: null }
const failed: Snapshot = { status: "error", grants: null, error: new Error("network") }
const refreshing = (role: keyof typeof roles): Snapshot => ({ status: "refreshing", grants: grants(role), error: null })
const stale = (role: keyof typeof roles): Snapshot => ({ status: "stale", grants: grants(role), error: new Error("network") })
/** 製品が、最新の認可を確認していないと示した ready（変更の知らせを受けたが、まだ取得し直していない場合など） */
const unverified = (role: keyof typeof roles): Snapshot => ({ status: "ready", grants: grants(role), error: null, verified: false })
const reasonOf = (d: AccessDecision<string, string>) => (d.allowed ? null : d.reason)

test.describe("decideAccess: reasons are kept as separate states", () => {
  test("loading and failed permissions never allow an operation, even one every role has", () => {
    for (const s of [loading, failed]) {
      const d = decideAccess(s, { permissions: ["customers.view"] })
      expect(d.allowed).toBe(false)
      expect(reasonOf(d)).toEqual({ kind: "unresolved", status: s.status })
    }
    // 条件のない操作も、権限が確定するまで許可しない。
    expect(decideAccess(loading).allowed).toBe(false)
    expect(decideAccess(failed).allowed).toBe(false)
  })

  test("refreshing / stale permissions: an operation the previous permissions allowed is still not allowed", () => {
    expect(reasonOf(decideAccess(refreshing("admin"), { permissions: ["customers.delete"] }))).toEqual({ kind: "unresolved", status: "refreshing" })
    expect(reasonOf(decideAccess(stale("admin"), { permissions: ["customers.delete"] }))).toEqual({ kind: "unresolved", status: "stale" })
    // 前の権限で許可されない操作も、新しい権限で許可される可能性があるため、確認中は「権限がない」と示さない（PERM-6）。
    // missing に前の権限に含まれていなかった権限を持つ。確認が終われば（ready）、認可の理由になる。
    expect(reasonOf(decideAccess(refreshing("viewer"), { permissions: ["customers.delete"] }))).toEqual({ kind: "unresolved", status: "refreshing", missing: ["customers.delete"] })
    expect(reasonOf(decideAccess(stale("viewer"), { permissions: ["customers.delete"] }))).toEqual({ kind: "unresolved", status: "stale", missing: ["customers.delete"] })
    expect(reasonOf(decideAccess(ready("viewer"), { permissions: ["customers.delete"] }))).toEqual({ kind: "authorization", missing: ["customers.delete"] })
    expect(restrictionText(reasonOf(decideAccess(refreshing("viewer"), { permissions: ["customers.delete"] }))!)).toBe("最新の権限を確認しています")
  })

  test("refreshing / stale: an operation the previous permissions did not allow keeps its previous presentation (PERM-6)", () => {
    const present = (s: Snapshot, p: Permission, a: ActionAudience) => presentAction(decideAccess(s, { permissions: [p] }), a).mode
    // 表示していなかった管理の機能と、存在を知らせない機能は、確認中に表示し始めない
    expect(present(refreshing("viewer"), "members.manage", { relevance: "admin" })).toBe("hidden")
    expect(present(stale("viewer"), "members.manage", { relevance: "admin" })).toBe("hidden")
    expect(present(refreshing("viewer"), "customers.delete", { relevance: "task", disclosure: "confidential" })).toBe("hidden")
    // 業務の操作と申請できる管理の機能は、前と同じく無効にして示す（理由は確認中）
    expect(present(refreshing("viewer"), "customers.edit", { relevance: "task" })).toBe("disabled")
    expect(present(refreshing("viewer"), "members.manage", { relevance: "admin", requestable: true })).toBe("disabled")
    // 確認が終わった後の扱いは、確認中と同じ（表示が揺れない）
    expect(present(ready("viewer"), "members.manage", { relevance: "admin" })).toBe("hidden")
    expect(present(ready("viewer"), "customers.edit", { relevance: "task" })).toBe("disabled")
  })

  test("authorization: the missing permissions only", () => {
    expect(decideAccess(ready("admin"), { permissions: ["customers.delete"] }).allowed).toBe(true)
    expect(reasonOf(decideAccess(ready("member"), { permissions: ["customers.view", "customers.delete"] }))).toEqual({ kind: "authorization", missing: ["customers.delete"] })
  })

  test("entitlement (contract plan) is distinct from authorization and is decided first", () => {
    // 本社営業部（スタンダード）には監査ログがない。管理者でも契約プランが理由。
    expect(reasonOf(decideAccess(ready("admin", "hq"), { permissions: ["audit.view"], feature: "audit-log" }))).toEqual({ kind: "entitlement", feature: "audit-log", missing: [] })
    // 権限もない場合は、契約プランを理由にし、不足している権限も持つ（申請しても解決しないため）。
    expect(reasonOf(decideAccess(ready("member", "hq"), { permissions: ["audit.view"], feature: "audit-log" }))).toEqual({
      kind: "entitlement",
      feature: "audit-log",
      missing: ["audit.view"],
    })
    // 西日本営業部（ビジネス）では、メンバーの理由は認可になる。
    expect(reasonOf(decideAccess(ready("member", "west"), { permissions: ["audit.view"], feature: "audit-log" }))).toEqual({ kind: "authorization", missing: ["audit.view"] })
    expect(decideAccess(ready("admin", "west"), { permissions: ["audit.view"], feature: "audit-log" }).allowed).toBe(true)
  })

  test("prerequisite, service, connectivity and pending are separate, and come after the structural reasons", () => {
    const base = { permissions: ["customers.export"] as Permission[], feature: "export" as Feature }
    expect(reasonOf(decideAccess(ready("member"), { ...base, unmetPrerequisite: "invite-sender" }))).toEqual({ kind: "prerequisite", prerequisite: "invite-sender" })
    expect(reasonOf(decideAccess(ready("member"), { ...base, service: "unavailable" }))).toEqual({ kind: "service" })
    expect(reasonOf(decideAccess(ready("member"), { ...base, connectivity: "offline" }))).toEqual({ kind: "connectivity", status: "offline" })
    // 接続を確認していない（unconfirmed）も、確認済みの online として扱わない
    expect(reasonOf(decideAccess(ready("member"), { ...base, connectivity: "unconfirmed" }))).toEqual({ kind: "connectivity", status: "unconfirmed" })
    expect(restrictionText({ kind: "connectivity", status: "unconfirmed" })).toBe("接続を確認しています。確認できるまで、この操作は行えません")
    expect(restrictionText({ kind: "connectivity", status: "offline" })).toBe("オフラインのため利用できません。接続が戻ると利用できます")
    expect(reasonOf(decideAccess(ready("member"), { ...base, pending: true }))).toEqual({ kind: "pending" })
    // 権限がない場合は、オフラインや障害より先に認可を理由にする（接続が戻っても使えないため）。
    expect(reasonOf(decideAccess(ready("viewer"), { ...base, connectivity: "offline", service: "unavailable", pending: true }))).toEqual({
      kind: "authorization",
      missing: ["customers.export"],
    })
    expect(decideAccess(ready("member"), { ...base, connectivity: "online", service: "available", pending: false }).allowed).toBe(true)
  })
})

test.describe("presentAction: hidden, disabled with a reason, or enabled", () => {
  const task: ActionAudience = { relevance: "task" }
  const admin: ActionAudience = { relevance: "admin" }
  const confidential: ActionAudience = { relevance: "task", disclosure: "confidential" }
  const present = (s: Snapshot, req: Parameters<typeof decideAccess<Permission, Feature>>[1], a: ActionAudience) => presentAction(decideAccess(s, req), a).mode

  test("an operation the user may need is disabled with its reason; an unrelated admin function is hidden", () => {
    expect(present(ready("viewer"), { permissions: ["customers.edit"] }, task)).toBe("disabled")
    expect(present(ready("viewer"), { permissions: ["members.manage"] }, admin)).toBe("hidden")
    expect(present(ready("admin"), { permissions: ["members.manage"] }, admin)).toBe("enabled")
  })

  test("a function whose existence cannot be disclosed is hidden whenever it is not allowed by role or plan", () => {
    expect(present(ready("viewer"), { permissions: ["customers.delete"] }, confidential)).toBe("hidden")
    expect(present(ready("viewer"), { permissions: ["customers.delete"] }, { ...confidential, requestable: true })).toBe("hidden")
    expect(present(ready("admin", "hq"), { feature: "sso" }, confidential)).toBe("hidden")
    expect(present(loading, { permissions: ["customers.delete"] }, confidential)).toBe("hidden")
  })

  test("an admin function that can be requested is shown disabled", () => {
    expect(present(ready("member"), { permissions: ["members.manage"] }, { relevance: "admin", requestable: true })).toBe("disabled")
  })

  test("contract plan: an authorized admin sees the plan reason; an unauthorized member does not see the admin function", () => {
    const audit = { permissions: ["audit.view"] as Permission[], feature: "audit-log" as Feature }
    expect(present(ready("admin", "hq"), audit, admin)).toBe("disabled")
    expect(present(ready("member", "hq"), audit, admin)).toBe("hidden")
  })

  test("while permissions load or fail: task operations are disabled, admin functions stay hidden until confirmed", () => {
    expect(present(loading, { permissions: ["customers.edit"] }, task)).toBe("disabled")
    expect(present(failed, { permissions: ["customers.edit"] }, task)).toBe("disabled")
    expect(present(loading, { permissions: ["members.manage"] }, admin)).toBe("hidden")
    // 再確認中は、前に表示していた管理の機能を消さずに無効にする。
    expect(present(refreshing("admin"), { permissions: ["members.manage"] }, admin)).toBe("disabled")
  })

  test("temporary reasons (offline, outage, pending, prerequisite) disable but never hide an allowed function", () => {
    for (const extra of [{ connectivity: "offline" as const }, { service: "unavailable" as const }, { pending: true }, { unmetPrerequisite: "invite-sender" }]) {
      expect(present(ready("admin"), { permissions: ["members.manage"], ...extra }, admin)).toBe("disabled")
      expect(present(ready("admin"), { permissions: ["members.manage"], ...extra }, { relevance: "admin", disclosure: "confidential" })).toBe("disabled")
    }
  })
})

test.describe("resolveContentAccess: read only is a mode, not disabled inputs", () => {
  const record = { view: ["customers.view"] as Permission[], edit: ["customers.edit"] as Permission[] }
  test("modes by role", () => {
    expect(resolveContentAccess(ready("admin"), record).mode).toBe("edit")
    expect(resolveContentAccess(ready("member"), record).mode).toBe("edit")
    expect(resolveContentAccess(ready("viewer"), record)).toEqual({ mode: "read-only", reason: { kind: "authorization", missing: ["customers.edit"] } })
    expect(resolveContentAccess(ready("viewer"), { view: ["members.view"] }).mode).toBe("hidden")
  })
  test("unknown permissions show no content; refreshing keeps the previous mode only when the product chooses keep (operations are decided separately)", () => {
    expect(resolveContentAccess(loading, record)).toEqual({ mode: "pending", status: "loading" })
    expect(resolveContentAccess(failed, record)).toEqual({ mode: "pending", status: "error" })
    // v0.1：保護された情報を、最新の認可を確認していない間に表示し続けることを既定にしない（製品が keep を選んだ場合だけ）。
    expect(resolveContentAccess(refreshing("member"), { ...record, whileUnverified: "keep" }).mode).toBe("edit")
    expect(resolveContentAccess(refreshing("member"), record)).toEqual({ mode: "pending", status: "refreshing" })
    expect(decideAccess(refreshing("member"), { permissions: ["customers.edit"] }).allowed).toBe(false)
  })

  // 表示可能性（構造）、閲覧可能性（保護された情報）、操作可能性、最新の認可の確認を区別する。
  test("table: sensitivity × whileUnverified × verification state", () => {
    type Opts = Parameters<typeof resolveContentAccess<Permission, Feature>>[1]
    const rows: [string, Snapshot, Opts, ReturnType<typeof resolveContentAccess>["mode"], string | null][] = [
      // [説明, 状態, 指定, 内容の扱い, pending の status]
      ["ready, protected (default)", ready("member"), record, "edit", null],
      ["refreshing, protected (default hide)", refreshing("member"), record, "pending", "refreshing"],
      ["stale, protected (default hide)", stale("member"), record, "pending", "stale"],
      ["ready but unverified, protected (default hide)", unverified("member"), record, "pending", "refreshing"],
      ["refreshing, protected, keep", refreshing("member"), { ...record, whileUnverified: "keep" }, "edit", null],
      ["stale, protected, keep (viewer: read only)", stale("viewer"), { ...record, whileUnverified: "keep" }, "read-only", null],
      ["refreshing, public-structure (hide is ignored)", refreshing("member"), { ...record, sensitivity: "public-structure", whileUnverified: "hide" }, "edit", null],
      ["stale, public-structure", stale("viewer"), { ...record, sensitivity: "public-structure" }, "read-only", null],
      // 前の権限でも閲覧できない内容は、確認中も hidden のまま（pending にして領域の存在を示さない）
      ["refreshing, no view permission before", refreshing("viewer"), { view: ["members.view"] }, "hidden", null],
      ["stale, no view permission before, keep", stale("viewer"), { view: ["members.view"], whileUnverified: "keep" }, "hidden", null],
      ["loading", loading, { ...record, whileUnverified: "keep" }, "pending", "loading"],
      ["error", failed, { ...record, sensitivity: "public-structure" }, "pending", "error"],
    ]
    for (const [name, snapshot, opts, mode, status] of rows) {
      const content = resolveContentAccess(snapshot, opts)
      expect(content.mode, name).toBe(mode)
      expect(content.mode === "pending" ? content.status : null, name).toBe(status)
      // どの行でも、最新の認可を確認していない間は操作（保存）を許可しない
      if (!isAccessVerified(snapshot)) expect(decideAccess(snapshot, { permissions: opts.view }).allowed, name).toBe(false)
    }
  })
})

test.describe("verified: the latest authorization is confirmed only for ready", () => {
  test("isAccessVerified per state; a ready snapshot without verified stays compatible (verified)", () => {
    expect(isAccessVerified(ready("member"))).toBe(true)
    expect(isAccessVerified({ status: "ready", grants: grants("member"), error: null, verified: true })).toBe(true)
    for (const s of [loading, failed, refreshing("member"), stale("member"), unverified("member")]) expect(isAccessVerified(s)).toBe(false)
  })

  test("ready with verified: false is treated like refreshing by decideAccess and presentAction", () => {
    expect(reasonOf(decideAccess(unverified("admin"), { permissions: ["customers.delete"] }))).toEqual({ kind: "unresolved", status: "refreshing" })
    expect(decideAccess(unverified("admin")).allowed).toBe(false)
    // 前の権限でも許可されない操作も、確認するまで「権限がない」とは示さない（PERM-6。画面での扱いは前の権限と同じ）
    expect(reasonOf(decideAccess(unverified("viewer"), { permissions: ["customers.delete"] }))).toEqual({ kind: "unresolved", status: "refreshing", missing: ["customers.delete"] })
    expect(presentAction(decideAccess(unverified("admin"), { permissions: ["members.manage"] }), { relevance: "admin" }).mode).toBe("disabled")
  })
})

test.describe("several restrictions at once: the function is not disclosed to users without the permission", () => {
  const audit = { permissions: ["audit.view"] as Permission[], feature: "audit-log" as Feature }
  test("table: plan + permission + temporary reasons", () => {
    type Row = [string, Snapshot, Parameters<typeof decideAccess<Permission, Feature>>[1], ActionAudience, string, string | null]
    const rows: Row[] = [
      // [説明, 状態, 条件, 操作の性質, 画面での扱い, 理由の kind]
      ["admin, plan lacks feature (admin function)", ready("admin", "hq"), audit, { relevance: "admin" }, "disabled", "entitlement"],
      ["member, plan lacks feature and permission (admin function)", ready("member", "hq"), audit, { relevance: "admin" }, "hidden", "entitlement"],
      ["member, plan + permission, requestable admin function", ready("member", "hq"), audit, { relevance: "admin", requestable: true }, "hidden", "entitlement"],
      ["member, plan + permission, task operation", ready("member", "hq"), audit, { relevance: "task" }, "disabled", "entitlement"],
      ["member, plan + permission, confidential", ready("member", "hq"), audit, { relevance: "task", disclosure: "confidential" }, "hidden", "entitlement"],
      ["viewer, permission + offline + outage + pending", ready("viewer"), { permissions: ["customers.export"], feature: "export", connectivity: "offline", service: "unavailable", pending: true }, { relevance: "task" }, "disabled", "authorization"],
      ["admin, prerequisite + offline", ready("admin"), { permissions: ["members.manage"], unmetPrerequisite: "invite-sender", connectivity: "offline" }, { relevance: "admin" }, "disabled", "prerequisite"],
      ["admin, outage + offline", ready("admin"), { permissions: ["customers.export"], service: "unavailable", connectivity: "offline" }, { relevance: "task" }, "disabled", "service"],
      ["member (west), permission only", ready("member", "west"), audit, { relevance: "admin" }, "hidden", "authorization"],
      ["refreshing admin, plan lacks feature", refreshing("admin"), audit, { relevance: "admin" }, "disabled", "entitlement"],
    ]
    for (const [name, snapshot, requirement, audience, mode, kind] of rows) {
      const decision = decideAccess(snapshot, requirement)
      expect(presentAction(decision, audience).mode, name).toBe(mode)
      expect(reasonOf(decision)?.kind ?? null, name).toBe(kind)
    }
  })

  test("restrictionText: when the permission is also missing, the text does not mention the plan or the feature", () => {
    const withPermission = restrictionText<Permission, Feature>({ kind: "entitlement", feature: "audit-log", missing: [] }, { feature: () => "監査ログ" })
    const withoutPermission = restrictionText<Permission, Feature>({ kind: "entitlement", feature: "audit-log", missing: ["audit.view"] }, { feature: () => "監査ログ" })
    expect(withPermission).toBe("監査ログは、現在の契約プランでは利用できません")
    expect(withoutPermission).not.toMatch(/契約|プラン|監査ログ/)
    expect(withoutPermission).not.toMatch(/権限が必要|権限がありません/)
    expect(withoutPermission).toBe("この操作は利用できません")
  })
})

test.describe("page access, role diff and reason texts", () => {
  test("pageAccessFromStatus: 401, 403 and 404 map to distinct states; concealForbidden treats 403 as not found", () => {
    expect(pageAccessFromStatus(200)).toBe("granted")
    expect(pageAccessFromStatus(401)).toBe("unauthenticated")
    expect(pageAccessFromStatus(403)).toBe("forbidden")
    expect(pageAccessFromStatus(404)).toBe("not-found")
    expect(pageAccessFromStatus(403, { concealForbidden: true })).toBe("not-found")
    expect(pageAccessFromStatus(500)).toBe("error")
  })

  test("diffPermissions: what a role change adds and removes", () => {
    expect(diffPermissions(roles.member.permissions, roles.admin.permissions)).toEqual({
      added: ["customers.delete", "members.manage", "billing.manage", "settings.org.edit", "audit.view"],
      removed: [],
    })
    expect(diffPermissions(roles.member.permissions, roles.viewer.permissions)).toEqual({
      added: [],
      removed: ["customers.edit", "customers.export", "members.view", "settings.org.view"],
    })
  })

  test("restrictionText: every reason has its own text; only authorization talks about a missing permission", () => {
    const reasons: Restriction<Permission, Feature>[] = [
      { kind: "unresolved", status: "loading" },
      { kind: "unresolved", status: "error" },
      { kind: "unresolved", status: "refreshing" },
      { kind: "unresolved", status: "stale" },
      { kind: "entitlement", feature: "audit-log", missing: [] },
      { kind: "entitlement", feature: "audit-log", missing: ["audit.view"] },
      { kind: "authorization", missing: ["customers.edit"] },
      { kind: "prerequisite", prerequisite: "invite-sender" },
      { kind: "service" },
      { kind: "connectivity" },
      { kind: "connectivity", status: "unconfirmed" },
      { kind: "pending" },
    ]
    const texts = reasons.map((r) => restrictionText(r, { permission: (p) => p, feature: (f) => f }))
    expect(new Set(texts).size).toBe(reasons.length)
    texts.forEach((t, i) => {
      expect(t).not.toContain("権限がありません")
      if (reasons[i].kind !== "authorization") expect(t).not.toContain("権限が必要")
    })
    expect(restrictionText({ kind: "authorization", missing: ["customers.edit"] }, { permission: () => "顧客を登録・編集" })).toBe("この操作には「顧客を登録・編集」の権限が必要です")
  })
})

test.describe("mock server: authorization is decided on the server at processing time", () => {
  test.beforeEach(() => {
    permissionServer.reset()
    for (const k of Object.keys(permissionServer.latency) as (keyof typeof permissionServer.latency)[]) permissionServer.latency[k] = 0
  })
  const api = permissionServer.api
  const codeOf = (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof MockRequestError ? e.code : String(e)))

  test("role change: forbidden, last admin, self, escalation are rejected by the server", async () => {
    expect(await codeOf(api.changeRole("u-tanaka:hq", "u-tanaka", "admin"))).toBe("forbidden")
    expect(await codeOf(api.changeRole("u-sato:hq", "u-sato", "viewer"))).toBe("last-admin")
    expect(await codeOf(api.changeRole("u-sato:hq", "u-suzuki", "admin"))).toBe("ok")
    expect(await codeOf(api.changeRole("u-sato:hq", "u-sato", "viewer"))).toBe("self")
    // メンバーの管理だけを個別に付与された利用者は、自分にない権限を含むロールを付与できない。
    permissionServer.reset()
    for (const k of Object.keys(permissionServer.latency) as (keyof typeof permissionServer.latency)[]) permissionServer.latency[k] = 0
    permissionServer.simulate.grant("u-suzuki:hq", "members.manage")
    expect(await codeOf(api.changeRole("u-suzuki:hq", "u-tanaka", "admin"))).toBe("escalation")
    expect(await codeOf(api.changeRole("u-suzuki:hq", "u-tanaka", "member"))).toBe("ok")
    expect(permissionServer.inspect().memberships.find((m) => m.userId === "u-tanaka")!.role).toBe("member")
  })

  test("permission request: concurrent duplicates create one request; non-requestable and granted permissions are refused", async () => {
    const [a, b] = await Promise.all([api.requestPermission("u-tanaka:hq", "customers.edit"), api.requestPermission("u-tanaka:hq", "customers.edit")])
    expect([a.created, b.created].sort()).toEqual([false, true])
    expect(a.request.id).toBe(b.request.id)
    expect(permissionServer.inspect().requests.filter((r) => r.permission === "customers.edit")).toHaveLength(1)
    expect(requestablePermissions).not.toContain("billing.manage")
    expect(await codeOf(api.requestPermission("u-tanaka:hq", "billing.manage"))).toBe("not-requestable")
    expect(await codeOf(api.requestPermission("u-suzuki:hq", "customers.edit"))).toBe("already-granted")
    // 承認すると権限が付与され、同じ権限をもう一度申請できない（すでに権限がある）。
    permissionServer.simulate.decide(a.request.id, "approved")
    expect((await api.fetchAccess("u-tanaka:hq")).permissions).toContain("customers.edit")
    expect(await codeOf(api.requestPermission("u-tanaka:hq", "customers.edit"))).toBe("already-granted")
  })

  test("save: the permission at processing time decides, not the permission when the user pressed save", async () => {
    permissionServer.latency.save = 50
    const saving = codeOf(api.saveRecord("u-suzuki:hq", "C-00001", { owner: "鈴木 一郎", note: "更新" }))
    permissionServer.simulate.setRole("u-suzuki", "hq", "viewer")
    expect(await saving).toBe("forbidden")
    expect(permissionServer.inspect().customers.find((c) => c.id === "C-00001")!.version).toBe(1)
  })

  test("data the user cannot see is not sent: counts, search results, members and billing", async () => {
    const all = await api.fetchOverview("u-sato:hq", "")
    const viewer = await api.fetchOverview("u-tanaka:hq", "")
    expect(all.customerCount).toBe(8)
    expect(viewer.customerCount).toBe(8 - confidentialCustomerIds.length)
    expect(viewer.customers.map((c) => c.id)).not.toEqual(expect.arrayContaining([confidentialCustomerIds[0]]))
    expect(viewer.customers.some((c) => confidentialCustomerIds.includes(c.id))).toBe(false)
    expect(viewer.members).toBeUndefined()
    expect(viewer.billing).toBeUndefined()
    expect((await api.fetchOverview("u-suzuki:hq", "")).members).toHaveLength(3)
    expect(all.billing).toBeDefined()
    // 検索の結果にも含めない（会社名で検索しても 0 件）。
    const name = permissionServer.inspect().customers.find((c) => c.id === confidentialCustomerIds[0])!.company
    expect((await api.fetchOverview("u-tanaka:hq", name)).customerCount).toBe(0)
    expect((await api.fetchOverview("u-sato:hq", name)).customerCount).toBeGreaterThan(0)
  })

  test("pages: 401 signed out, 403 for a page whose existence is public, 404 for a confidential record (same as missing)", async () => {
    const status = async (scope: string | null, path: string) => (await api.fetchPage(scope, path)).status
    expect(await status(null, "/customers/C-00001")).toBe(401)
    expect(await status("u-tanaka:hq", "/settings/billing")).toBe(403)
    expect(await status("u-sato:hq", "/settings/billing")).toBe(200)
    expect(await status("u-tanaka:hq", `/customers/${confidentialCustomerIds[0]}`)).toBe(404)
    expect(await status("u-tanaka:hq", "/customers/C-99999")).toBe(404)
    expect(await status("u-sato:hq", `/customers/${confidentialCustomerIds[0]}`)).toBe(200)
  })

  test("a held request is processed (and authorized) when it is released, not when it was sent", async () => {
    permissionServer.hold.operation = true
    const sent = codeOf(api.runOperation("u-suzuki:hq", ["customers.edit"], null))
    expect(permissionServer.held.map((h) => h.kind)).toEqual(["operation"])
    permissionServer.simulate.setRole("u-suzuki", "hq", "viewer")
    expect(permissionServer.release("operation")).toBe(1)
    expect(await sent).toBe("forbidden")
    expect(permissionServer.held).toHaveLength(0)
    // 中止された要求は、ignoreAbort でなければ保留を解き、応答しない
    const controller = new AbortController()
    const aborted = codeOf(api.runOperation("u-suzuki:hq", ["customers.view"], null, { signal: controller.signal }))
    controller.abort()
    expect(await aborted).toMatch(/AbortError/)
    expect(permissionServer.held).toHaveLength(0)
    // process: false は、サーバーで処理せずに結果が不明な失敗を返す（申請の照会の検品）
    permissionServer.hold.request = true
    const unknown = api.requestPermission("u-tanaka:hq", "customers.edit").then(() => "ok", (e: unknown) => (e as Error).constructor.name)
    permissionServer.release("request", { process: false })
    expect(await unknown).toBe("MockUnknownError")
    expect(permissionServer.inspect().requests).toHaveLength(0)
  })

  test("an operation is re-authorized on the server (UI state is not trusted)", async () => {
    expect(await codeOf(api.runOperation("u-tanaka:hq", ["customers.delete"], null))).toBe("forbidden")
    expect(await codeOf(api.runOperation("u-sato:hq", ["audit.view"], "audit-log"))).toBe("forbidden")
    expect(await codeOf(api.runOperation("u-sato:hq", ["customers.delete"], null))).toBe("ok")
  })
})
