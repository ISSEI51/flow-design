import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, Minus } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  decideAccess,
  diffPermissions,
  pageAccessFromStatus,
  presentAction,
  resolveContentAccess,
  restrictionText,
  useAccess,
  type AccessSnapshot,
  type Restriction,
} from "@/patterns/access"
import { AccessState } from "@/patterns/access-state"
import { useBrowseData } from "@/patterns/browse-data"
import { DataRegionError } from "@/patterns/data-states"
import { RestrictedAction, RestrictionNotice, useFocusRecovery } from "@/patterns/restricted-action"
import { useScopeGuard, type ScopeGuard, type ScopeTicket } from "@/patterns/scope-guard"
import { TableScrollArea } from "@/patterns/table-scroll-area"

import { MockRequestError, MockUnknownError } from "../../data/system-account/mock"
import {
  orgSettings,
  permissionLabels,
  plans,
  roles as modelRoles,
  users,
  workspaces,
  type Feature,
  type Permission,
  type RoleId,
  type ServiceComponent,
  type UserId,
} from "../../data/system-account/model"
import {
  adminContactOf,
  exampleOperations,
  featureLabel,
  permissionLabel,
  prerequisiteLabels,
  requestablePermissions,
  scopeKeyOf,
  sensitivePermissions,
  type ExampleOperation,
  type PermissionScope,
} from "../../data/system-account/permission-data"
import type { AccessResponse, PermissionApi, PermissionRequestRecord, RecordResponse } from "../../data/system-account/permission-server"

// Permission States の画面の部品。統合の検証画面でも使えるよう、スコープ（利用者とワークスペース）、模擬のサーバーの API、
// コールバックを props で受け取る。模擬のサーバーの状態は持たない（permission-server.ts）。

type Access = AccessSnapshot<Permission, Feature, AccessResponse> & { scopeKey: string; reload: () => void }

const labels = {
  permission: permissionLabel,
  feature: featureLabel,
  prerequisite: (id: string) => prerequisiteLabels[id] ?? id,
}

/**
 * 処理中の状態を、処理を始めたときのスコープの世代と組で持つ。現在のスコープで始めた処理だけを「処理中」として返す。
 * スコープを切り替えた後（A → B → A を含む）や、別のスコープの処理の応答を待っている間に、操作を止めたままにしない。
 * 終了は、その処理の ticket が最新のときだけ反映する（後から始めた処理の状態を消さない）。
 */
function useInFlight<T>(guard: ScopeGuard) {
  const [state, setState] = useState<{ ticket: ScopeTicket; value: T } | null>(null)
  const current = state && guard.isSameScope(state.ticket) ? state.value : null
  return {
    current,
    start: (ticket: ScopeTicket, value: T) => setState({ ticket, value }),
    finish: (ticket: ScopeTicket) => setState((s) => (s?.ticket === ticket ? null : s)),
  }
}

const can = (access: Access, p: Permission) => decideAccess(access, { permissions: [p] }).allowed

/** 問い合わせ先の文。管理者が登録されていない場合は、名前を出さない */
export function contactText(scope: PermissionScope, subject = "") {
  const admins = adminContactOf(scope.workspaceId).filter((u) => u.id !== scope.userId)
  const who = admins.length ? `管理者の${admins.map((u) => `${u.name}さん（${u.email}）`).join("、")}` : "ワークスペースの管理者"
  return `${subject}${who}に問い合わせてください。`
}

// ---------------------------------------------------------------- 権限の取得
/**
 * スコープの権限を取得する。権限の変更の知らせ（api.subscribe）を受けたら取得し直す。
 * 取得中、取得の失敗、再確認中、再確認の失敗を含む状態を返す（status）。onResolved は、現在のスコープの最新の権限を
 * 反映したときに呼ぶ（古いスコープの応答、アンマウントの後の応答では呼ばない）。
 */
export function usePermissionAccess({ scope, api, onResolved }: { scope: PermissionScope; api: PermissionApi; onResolved?: (grants: AccessResponse) => void }) {
  const scopeKey = scopeKeyOf(scope)
  const [revision, setRevision] = useState(0)
  useEffect(() => api.subscribe((changed) => (changed === scopeKey || changed === "*") && setRevision((r) => r + 1)), [api, scopeKey])
  const access: Access = useAccess<Permission, Feature, AccessResponse>({
    scopeKey,
    revision,
    fetcher: ({ scopeKey: key, signal }) => api.fetchAccess(key, { signal }),
  })
  const resolvedRef = useRef(onResolved)
  resolvedRef.current = onResolved
  const grants = access.status === "ready" ? access.grants : null
  useEffect(() => {
    if (grants) resolvedRef.current?.(grants)
  }, [grants])
  // 権限が変わったことを、常に置いた Live Region で知らせる（同じスコープで、確定した権限が変わったときだけ）。
  const [notice, setNotice] = useState("")
  const previous = useRef<{ scope: string; permissions: string } | null>(null)
  useEffect(() => {
    if (!grants) return
    const permissions = [...grants.permissions].sort().join(",")
    const prev = previous.current
    previous.current = { scope: grants.scope, permissions }
    if (prev && prev.scope === grants.scope && prev.permissions !== permissions) setNotice("権限が変更されました。表示している操作を更新しました。")
    else if (!prev || prev.scope !== grants.scope) setNotice("")
  }, [grants])
  return { access, revision, notice }
}

// ---------------------------------------------------------------- 解決の方法
function PlanInfo({ scope }: { scope: PermissionScope }) {
  const [open, setOpen] = useState(false)
  const plan = plans[workspaces[scope.workspaceId].plan]
  const business = plans.business
  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="self-start">
        契約プランを確認
      </Button>
      {open && (
        <p className="text-ui" data-testid="perm-plan-info">
          現在のプランは{plan.name}です。{business.name}プランでは、
          {business.features
            .filter((f) => !plan.features.includes(f))
            .map(featureLabel)
            .join("と")}
          も利用できます。
        </p>
      )}
    </div>
  )
}

function PrerequisiteForm({ id, onResolve }: { id: string; onResolve: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState(false)
  return (
    <div className="flex w-full flex-col gap-3">
      <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="self-start">
        {prerequisiteLabels[id] ?? "設定"}を開く
      </Button>
      {open && (
        <form
          className="flex max-w-md flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!/^[^@\s]+@[^@\s]+$/.test(value)) return setError(true)
            onResolve(id)
          }}
        >
          <Field invalid={error}>
            <FieldLabel>送信元のアドレス</FieldLabel>
            <Input type="email" value={value} onChange={(e) => (setValue(e.target.value), setError(false))} placeholder="sales@example.com" />
            <FieldDescription>例の設定です。送信の確認は行いません。</FieldDescription>
          </Field>
          {error && <p className="text-ui text-destructive">メールアドレスの形式で入力してください。</p>}
          <Button type="submit" size="sm" className="self-start">
            設定を保存
          </Button>
        </form>
      )}
    </div>
  )
}

/** 理由に対応する、実際に利用できる解決の方法。利用できる方法がない理由（障害、接続、処理中）には何も置かない */
export function Resolution({
  reason,
  access,
  scope,
  api,
  revision,
  onResolvePrerequisite,
}: {
  reason: Restriction<Permission, Feature>
  access: Access
  scope: PermissionScope
  api: PermissionApi
  revision: number
  onResolvePrerequisite?: (id: string) => void
}): ReactNode {
  switch (reason.kind) {
    case "unresolved":
      return reason.status === "error" || reason.status === "stale" ? (
        <Button variant="outline" size="sm" onClick={access.reload}>
          権限を再確認
        </Button>
      ) : null
    case "authorization": {
      const requestable = reason.missing.every((p) => requestablePermissions.includes(p))
      if (requestable && reason.missing.length === 1) return <PermissionRequest scope={scope} permission={reason.missing[0]} api={api} revision={revision} />
      return <p className="text-ui text-muted-foreground">{contactText(scope, "必要な場合は、")}</p>
    }
    case "entitlement":
      return can(access, "billing.manage") ? (
        <PlanInfo scope={scope} />
      ) : (
        <p className="text-ui text-muted-foreground">{contactText(scope, "契約の変更は、")}</p>
      )
    case "prerequisite":
      return can(access, "settings.org.edit") && onResolvePrerequisite ? (
        <PrerequisiteForm id={reason.prerequisite} onResolve={onResolvePrerequisite} />
      ) : (
        <p className="text-ui text-muted-foreground">{contactText(scope, "設定は、")}</p>
      )
    default:
      return null
  }
}

// ---------------------------------------------------------------- 制限された操作
export type OperationConditions = {
  offline: boolean
  /** 障害で利用できないサービス */
  unavailable: ServiceComponent[]
  /** 処理中（例では、同じ顧客の保存の完了を待っている） */
  pending: boolean
  /** 済んでいない前提の設定 */
  unmetPrerequisites: string[]
}

export const defaultConditions: OperationConditions = { offline: false, unavailable: [], pending: false, unmetPrerequisites: [] }

/**
 * 顧客の詳細の操作。操作ごとに decideAccess と presentAction で扱いを決め、無効の理由を操作のすぐ後に示す。
 * 許可された操作を押すと、模擬のサーバーに送る（サーバーが受け付けた時点の権限で判断する）。
 */
export function RestrictedOperations({
  scope,
  api,
  access,
  revision,
  conditions = defaultConditions,
  operations = exampleOperations,
  onResolvePrerequisite,
  onRun,
}: {
  scope: PermissionScope
  api: PermissionApi
  access: Access
  revision: number
  conditions?: OperationConditions
  operations?: ExampleOperation[]
  onResolvePrerequisite?: (id: string) => void
  onRun?: (result: { operation: ExampleOperation; ok: boolean; message: string }) => void
}) {
  const guard = useScopeGuard(access.scopeKey)
  const running = useInFlight<string>(guard)
  const [result, setResult] = useState("")
  // スコープが変わったら、前のスコープの結果を表示しない（描画の時点で照合する）。
  const [resultScope, setResultScope] = useState(access.scopeKey)
  const shownResult = resultScope === access.scopeKey ? result : ""
  const run = (op: ExampleOperation) => {
    if (running.current) return
    const ticket = guard.begin("run")
    running.start(ticket, op.id)
    api
      .runOperation(access.scopeKey, op.permissions, op.feature ?? null, { signal: ticket.signal })
      .then(
        () => {
          if (!guard.isLatest(ticket)) return
          const message = `「${op.label}」をサーバーが受け付けました（模擬。実際の処理は行いません）。`
          setResult(message)
          setResultScope(ticket.scope!)
          onRun?.({ operation: op, ok: true, message })
        },
        (error: unknown) => {
          if (!guard.isLatest(ticket)) return
          const message =
            error instanceof MockRequestError && error.code === "forbidden"
              ? `「${op.label}」をサーバーが拒否しました。${error.message}。`
              : `「${op.label}」を送れませんでした。サーバーに接続できませんでした。`
          setResult(message)
          setResultScope(ticket.scope!)
          onRun?.({ operation: op, ok: false, message })
        },
      )
      .finally(() => running.finish(ticket))
  }
  // 別のスコープで始めた処理は、現在のスコープの処理中として扱わない（useInFlight）。
  const runningShown = running.current
  return (
    <div
      className="flex flex-col"
      data-testid="perm-ops"
      data-status={access.status}
      data-scope={access.grants?.scope ?? ""}
      data-request-id={access.grants?.requestId ?? ""}
      aria-busy={access.status === "loading" || undefined}
    >
      <ul className="flex flex-col gap-6">
        {operations.map((op) => {
          const decision = decideAccess(access, {
            permissions: op.permissions,
            feature: op.feature,
            unmetPrerequisite: op.prerequisite && conditions.unmetPrerequisites.includes(op.prerequisite) ? op.prerequisite : null,
            service: op.service && conditions.unavailable.includes(op.service) ? "unavailable" : "available",
            connectivity: conditions.offline ? "offline" : "online",
            pending: conditions.pending || runningShown !== null,
          })
          const presentation = presentAction(decision, {
            relevance: op.relevance,
            disclosure: op.disclosure,
            requestable: op.permissions.every((p) => requestablePermissions.includes(p)),
          })
          if (presentation.mode === "hidden") return null
          return (
            <li key={op.id} className="min-w-0">
              <RestrictedAction
                presentation={presentation}
                data-testid={`perm-op-${op.id}`}
                reason={presentation.reason ? restrictionText(presentation.reason, labels) : undefined}
                resolution={
                  presentation.reason ? (
                    <Resolution
                      reason={presentation.reason}
                      access={access}
                      scope={scope}
                      api={api}
                      revision={revision}
                      onResolvePrerequisite={onResolvePrerequisite}
                    />
                  ) : undefined
                }
              >
                {(control) => (
                  <Button variant="outline" className="self-start" {...control} loading={runningShown === op.id} onClick={() => run(op)}>
                    {op.label}
                  </Button>
                )}
              </RestrictedAction>
            </li>
          )
        })}
      </ul>
      <p role="status" className={shownResult ? "mt-6 text-ui" : "text-ui"} data-testid="perm-ops-result">
        {shownResult}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- 権限の申請
/**
 * 権限の申請。申請の状態（承認待ち、承認、却下）は、サーバーの申請の記録から表示する。
 * 送信中と承認待ちの間は申請の操作を置かない（二重申請の防止）。サーバーも、承認待ちの申請があれば新しく作らない。
 */
export function PermissionRequest({
  scope,
  permission,
  api,
  revision,
  onRequested,
}: {
  scope: PermissionScope
  permission: Permission
  api: PermissionApi
  /** 権限の変更の知らせ。変わったら申請の状態を取得し直す */
  revision: number
  onRequested?: (request: PermissionRequestRecord, created: boolean) => void
}) {
  const scopeKey = scopeKeyOf(scope)
  const list = useBrowseData({
    query: permission,
    queryKey: `${permission}:${revision}`,
    scopeKey,
    fetcher: (_p, { signal }) => api.listRequests(scopeKey, { signal }),
  })
  const guard = useScopeGuard(`${scopeKey}:${permission}`)
  // 押した直後の 2 回目の押下を、状態の更新を待たずに判定するための ticket。スコープの世代と組で照合する。
  const submitting = useRef<ScopeTicket | null>(null)
  const inFlight = useInFlight<true>(guard)
  const busy = inFlight.current !== null
  const [message, setMessage] = useState<{ scope: string; text: string; error: boolean } | null>(null)
  const latest = list.data?.filter((r) => r.permission === permission).at(-1) ?? null
  const label = permissionLabel(permission)
  const submit = () => {
    // 押した直後の 2 回目の押下も送らない（状態の更新を待たずに判定する）。
    if (submitting.current && guard.isSameScope(submitting.current)) return
    const ticket = guard.begin("request")
    submitting.current = ticket
    inFlight.start(ticket, true)
    api
      .requestPermission(scopeKey, permission, { signal: ticket.signal })
      .then(
        ({ request, created }) => {
          if (!guard.isLatest(ticket)) return
          list.setData((rows) => [...rows.filter((r) => r.id !== request.id), request], { scopeKey })
          setMessage({
            scope: scopeKey,
            text: created
              ? `「${label}」の権限を申請しました。承認されると、この操作を利用できます。`
              : `「${label}」の権限は、すでに申請しています（承認待ち）。`,
            error: false,
          })
          onRequested?.(request, created)
        },
        (error: unknown) => {
          if (!guard.isLatest(ticket)) return
          const code = error instanceof MockRequestError ? error.code : "unknown"
          // 結果が不明な場合は、申請の記録を取得し直して確かめる（再送しない）。
          if (error instanceof MockUnknownError) list.reload()
          setMessage({
            scope: scopeKey,
            text:
              error instanceof MockUnknownError
                ? "申請の結果を確認できませんでした。申請の状態を確認しています。"
                : code === "already-granted"
                  ? "すでに権限があります。表示を更新しています。"
                  : "申請を送れませんでした。もう一度お試しください。",
            error: !(error instanceof MockUnknownError) && code !== "already-granted",
          })
        },
      )
      .finally(() => {
        if (submitting.current === ticket) submitting.current = null
        inFlight.finish(ticket)
      })
  }
  const shownMessage = message?.scope === scopeKey ? message : null
  let body: ReactNode
  if (list.status === "loading" || list.status === "idle") body = <p className="text-ui text-muted-foreground">申請の状態を確認しています</p>
  else if (list.status === "error")
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-ui text-muted-foreground">申請の状態を確認できませんでした。</p>
        <Button variant="outline" size="sm" onClick={list.reload}>
          再試行
        </Button>
      </div>
    )
  else if (latest?.status === "pending")
    body = (
      <p className="text-ui" data-testid="perm-request-status" data-status="pending">
        「{label}」の権限を申請しています（承認待ち）。
      </p>
    )
  else if (latest?.status === "approved")
    body = (
      <p className="text-ui" data-testid="perm-request-status" data-status="approved">
        申請が承認されました。権限を反映しています。
      </p>
    )
  else
    body = (
      <div className="flex flex-col gap-2">
        {latest?.status === "rejected" && (
          <p className="text-ui" data-testid="perm-request-status" data-status="rejected">
            「{label}」の権限の申請は却下されました。必要な場合は、理由を添えて管理者に相談してください。
          </p>
        )}
        <Button variant="secondary" size="sm" className="self-start" loading={busy} disabled={list.status === "refreshing"} onClick={submit}>
          {latest?.status === "rejected" ? "もう一度申請する" : `「${label}」の権限を申請`}
        </Button>
      </div>
    )
  return (
    <div
      className="flex flex-col gap-2 [&>[role=status]:empty]:-mt-2"
      data-testid={`perm-request-${permission}`}
      data-request-status={latest?.status ?? "none"}
    >
      {body}
      <p role="status" className={shownMessage?.error ? "text-ui text-destructive" : "text-ui text-muted-foreground"}>
        {shownMessage?.text ?? ""}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- ページへのアクセス
/**
 * ページのアクセスの状態（ログインが必要、権限がない、存在しない）。サーバーの応答から決め、ステータスコードだけを表示しない。
 * scope が null はログインしていない。
 */
export function PageAccessView({
  scope,
  path,
  api,
  onSignIn,
  onNavigate,
  concealForbidden = false,
  headingLevel = 2,
}: {
  scope: PermissionScope | null
  path: string
  api: PermissionApi
  onSignIn: () => void
  onNavigate: (path: string) => void
  concealForbidden?: boolean
  headingLevel?: 1 | 2 | 3
}) {
  const scopeKey = scope ? scopeKeyOf(scope) : "anonymous"
  const page = useBrowseData({
    query: path,
    scopeKey,
    keepPreviousData: false,
    fetcher: (p, { signal }) => api.fetchPage(scope ? scopeKey : null, p, { signal }),
  })
  if (page.status === "error")
    return (
      <DataRegionError
        title="ページを読み込めませんでした"
        description="サーバーに接続できませんでした。"
        onRetry={page.reload}
        data-testid="perm-page-error"
      />
    )
  if (!page.isCurrent || !page.data)
    return (
      <p className="py-12 text-center text-ui text-muted-foreground" aria-busy="true" data-testid="perm-page-loading">
        読み込んでいます
      </p>
    )
  const kind = pageAccessFromStatus(page.data.status, { concealForbidden })
  const back = (
    <Button variant="outline" onClick={() => onNavigate("/customers")}>
      顧客の一覧へ
    </Button>
  )
  if (kind === "unauthenticated")
    return (
      <AccessState
        kind="unauthenticated"
        headingLevel={headingLevel}
        data-testid="perm-page-state"
        actions={<Button onClick={onSignIn}>ログイン（模擬）</Button>}
      />
    )
  if (kind === "forbidden")
    return (
      <AccessState
        kind="forbidden"
        headingLevel={headingLevel}
        data-testid="perm-page-state"
        description={`契約と請求の設定は、管理者だけが表示できます。${scope ? contactText(scope, "必要な場合は、") : ""}`}
        actions={back}
      />
    )
  if (kind === "not-found" || page.data.status !== 200)
    return <AccessState kind="not-found" headingLevel={headingLevel} data-testid="perm-page-state" actions={back} />
  const Heading = `h${headingLevel}` as const
  return (
    <div className="flex flex-col gap-2 py-6" data-testid="perm-page-content">
      <Heading className="text-heading">{page.data.title}</Heading>
      <p className="text-ui text-muted-foreground">{page.data.body}</p>
    </div>
  )
}

// ---------------------------------------------------------------- 部分的な閲覧権限
/**
 * ワークスペースの概要。閲覧できる情報は表示し、閲覧できない情報はサーバーが送らない。
 * 担当者だけが閲覧できる顧客は、件数、検索の結果、書き出しの対象に含めない（存在を明かさない）。
 * メンバーの一覧は存在を明かしてよいため、権限がない場合は理由と申請を示す。契約と請求は管理の機能のため、セクションごと表示しない。
 */
export function PartialOverview({ scope, api, access, revision }: { scope: PermissionScope; api: PermissionApi; access: Access; revision: number }) {
  const scopeKey = scopeKeyOf(scope)
  const [search, setSearch] = useState("")
  const data = useBrowseData({
    query: search,
    queryKey: `${search}:${revision}`,
    scopeKey,
    fetcher: (q, { signal }) => api.fetchOverview(scopeKey, q, { signal }),
  })
  const members = resolveContentAccess(access, { view: ["members.view"] })
  const current = data.isCurrent ? data.data : undefined
  return (
    <div className="flex flex-col gap-10" data-testid="perm-overview" data-scope={access.grants?.scope ?? ""}>
      <section className="flex flex-col gap-4" aria-labelledby="perm-overview-customers">
        <h3 id="perm-overview-customers" className="text-heading">
          顧客
        </h3>
        <Field className="max-w-sm">
          <FieldLabel>顧客を検索</FieldLabel>
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="perm-overview-search" />
        </Field>
        {data.status === "error" ? (
          <DataRegionError title="顧客を取得できませんでした" onRetry={data.reload} />
        ) : (
          <div aria-busy={!current || undefined} className="flex flex-col gap-3">
            <p className="text-ui" data-testid="perm-overview-count" data-ready={Boolean(current) || undefined}>
              {current ? `${current.customerCount} 件` : "読み込んでいます"}
            </p>
            {current && (
              <ul className="flex flex-col text-ui" data-testid="perm-overview-results">
                {current.customers.map((c) => (
                  <li key={c.id} className="border-b border-border py-2 last:border-b-0">
                    {c.company}
                  </li>
                ))}
              </ul>
            )}
            {current && <p className="text-ui text-muted-foreground">書き出しの対象は、表示している {current.customerCount} 件です。</p>}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="perm-overview-members" data-testid="perm-overview-members">
        <h3 id="perm-overview-members" className="text-heading">
          メンバー
        </h3>
        {members.mode === "pending" ? (
          <p className="text-ui text-muted-foreground">{members.status === "loading" ? "権限を確認しています" : "権限を確認できませんでした"}</p>
        ) : members.mode === "hidden" ? (
          <RestrictionNotice
            title="メンバーの一覧を表示する権限がありません"
            description="顧客の情報は、引き続き表示できます。"
            restriction={members.reason.kind}
            actions={<PermissionRequest scope={scope} permission="members.view" api={api} revision={revision} />}
          />
        ) : current?.members ? (
          <ul className="flex flex-col text-ui">
            {current.members.map((m) => (
              <li key={m.userId} className="flex flex-wrap justify-between gap-x-4 border-b border-border py-2 last:border-b-0">
                <span>{m.name}</span>
                <span className="text-muted-foreground">{modelRoles[m.role].name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui text-muted-foreground">読み込んでいます</p>
        )}
      </section>

      {current?.billing && (
        <section className="flex flex-col gap-4" aria-labelledby="perm-overview-billing" data-testid="perm-overview-billing">
          <h3 id="perm-overview-billing" className="text-heading">
            契約と請求
          </h3>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-ui">
            <dt className="text-muted-foreground">プラン</dt>
            <dd>{current.billing.plan}</dd>
            <dt className="text-muted-foreground">席の数</dt>
            <dd>{current.billing.seats}</dd>
          </dl>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 契約プランによる制限
/**
 * 組織のセキュリティの設定。契約プランで利用できない機能（Entitlement）と、変更の権限がない（Authorization）を区別する。
 * 組織の設定を閲覧できない利用者には、何も描画しない（管理の機能のため）。
 */
export function OrgSecuritySettings({ scope, access }: { scope: PermissionScope; access: Access }) {
  const content = resolveContentAccess(access, { view: ["settings.org.view"], edit: ["settings.org.edit"] })
  if (content.mode === "hidden") return null
  if (content.mode === "pending")
    return <p className="text-ui text-muted-foreground">{content.status === "loading" ? "権限を確認しています" : "権限を確認できませんでした"}</p>
  const org = orgSettings[scope.workspaceId]
  // 表示の判断であり、操作の判断ではない。契約プランの機能だけを確かめる。
  const ssoEntitled = access.grants!.features.includes("sso")
  const ssoReason: Restriction<Permission, Feature> = { kind: "entitlement", feature: "sso", missing: [] }
  const audit = presentAction(decideAccess<Permission, Feature>(access, { permissions: ["audit.view"], feature: "audit-log" }), { relevance: "admin" })
  const editNoticeId = "perm-org-edit-notice"
  return (
    <div className="flex flex-col gap-6" data-testid="perm-org-settings" data-scope={access.grants?.scope ?? ""}>
      {content.mode === "read-only" && (
        <RestrictionNotice
          id={editNoticeId}
          title="組織の設定は閲覧だけできます"
          description={`変更には「${permissionLabel("settings.org.edit")}」の権限が必要です。${contactText(scope, "変更が必要な場合は、")}`}
          restriction={content.reason.kind}
          data-testid="perm-org-readonly"
        />
      )}
      <dl className="flex flex-col">
        <div className="grid gap-1 border-b border-border py-4 first:pt-0 sm:grid-cols-[14rem_1fr] sm:gap-6">
          <dt className="text-ui font-medium">多要素認証を必須にする</dt>
          <dd className="text-ui">{org.requireMfa ? "必須" : "任意"}</dd>
        </div>
        <div
          className="grid gap-1 border-b border-border py-4 sm:grid-cols-[14rem_1fr] sm:gap-6"
          data-testid="perm-org-sso"
          data-restriction={ssoEntitled ? undefined : ssoReason.kind}
        >
          <dt className="text-ui font-medium">{featureLabel("sso")}</dt>
          <dd className="flex min-w-0 flex-col gap-2 text-ui">
            {ssoEntitled ? (
              <span>{org.requireSso ? "必須" : "任意"}</span>
            ) : (
              <>
                <span>{restrictionText(ssoReason, labels)}。ビジネスプランで利用できます。</span>
                {/* 利用できる既存の機能を先に示す */}
                {org.requireMfa && <span className="text-muted-foreground">現在は、多要素認証を必須にしてログインを保護しています。</span>}
                {can(access, "billing.manage") ? (
                  <PlanInfo scope={scope} />
                ) : (
                  <span className="text-muted-foreground">{contactText(scope, "契約の変更は、")}</span>
                )}
              </>
            )}
          </dd>
        </div>
        {audit.mode !== "hidden" && (
          <div className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6" data-testid="perm-org-audit" data-restriction={audit.reason?.kind}>
            <dt className="text-ui font-medium">{featureLabel("audit-log")}</dt>
            <dd className="text-ui">
              {audit.mode === "enabled" ? "記録しています" : `${restrictionText(audit.reason, labels)}。ビジネスプランで利用できます。`}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

// ---------------------------------------------------------------- 編集中の権限変更
type Values = { owner: string; note: string }
type Draft = { values: Values; base: Values; baseVersion: number }
type EditorNotice = "none" | "edit-lost" | "edit-lost-kept" | "edit-lost-discarded" | "view-lost" | "view-lost-discarded" | "regained" | "rebased"
type SaveState =
  { status: "idle" | "saving" | "checking" } | { status: "saved" | "confirmed-saved" | "confirmed-not-saved" | "rejected" | "failed"; message: string }

const valuesOf = (r: RecordResponse): Values => ({ owner: r.owner, note: r.note ?? "" })
const sameValues = (a: Values, b: Values) => a.owner === b.owner && a.note === b.note

const noticeText: Record<Exclude<EditorNotice, "none">, { title: string; description: string }> = {
  "edit-lost": { title: "編集の権限が変更されました", description: "この顧客は閲覧だけできます。" },
  "edit-lost-kept": {
    title: "編集の権限が変更されました",
    description: "保存は停止しました。入力中の内容は保持しています。編集の権限が戻ると、続きから編集できます。",
  },
  "edit-lost-discarded": { title: "編集の権限が変更されました", description: "保存は停止し、入力中の内容は破棄しました。この顧客は閲覧だけできます。" },
  "view-lost": { title: "この顧客を表示できなくなりました", description: "閲覧の権限が変更されたためです。" },
  "view-lost-discarded": { title: "この顧客を表示できなくなりました", description: "閲覧の権限が変更されたため、入力中の内容は破棄しました。" },
  regained: { title: "編集の権限が戻りました", description: "最新の内容と権限を確認しました。編集を再開できます。" },
  rebased: {
    title: "編集の権限が戻りました",
    description: "ほかの人がこの顧客を更新していました。変更していない項目は最新の内容にし、入力した項目は残しています。",
  },
}

/**
 * 顧客の編集。編集中に権限が変わった場合の扱いを示す。
 * - 編集の権限を失った：保存を停止し、閲覧専用の表示にする。未保存の入力は draftPolicy が keep の場合だけ保持する。
 * - 閲覧の権限も失った：顧客の内容を表示しない。入力は破棄し、内容を含まない文で理由を伝える。
 * - 保存中に権限が変わった：サーバーの実際の結果を表示する。結果が不明な場合は取得し直して確かめる。
 * - 権限が戻った：最新の権限と顧客の内容を取得し直してから、編集を再開する。
 * - フォーカスしていた入力欄が消えた場合は、変更を知らせる見出しへフォーカスを移す。
 */
export function CustomerEditor({
  scope,
  api,
  access,
  revision,
  recordId,
  draftPolicy = "keep",
  offline = false,
  onSaved,
  headingAs: H = "h3",
}: {
  scope: PermissionScope
  api: PermissionApi
  access: Access
  revision: number
  /** 顧客の名前の見出しの要素。ページの h1 の直下に置く場合は h2 */
  headingAs?: "h2" | "h3"
  recordId: string
  /** 編集の権限を失ったときに、未保存の入力を保持するか（製品のポリシー） */
  draftPolicy?: "keep" | "discard"
  offline?: boolean
  onSaved?: (record: RecordResponse) => void
}) {
  const scopeKey = scopeKeyOf(scope)
  const content = resolveContentAccess(access, { view: ["customers.view"], edit: ["customers.edit"] })
  const record = useBrowseData({
    query: recordId,
    queryKey: `${recordId}:${revision}`,
    scopeKey,
    enabled: content.mode === "edit" || content.mode === "read-only",
    fetcher: (id, { signal }) => api.fetchRecord(scopeKey, id, { signal }),
  })
  const recordMissing = record.status === "error" && record.error instanceof MockRequestError && record.error.code === "not-found"
  const mode: "pending" | "loading" | "error" | "hidden" | "read-only" | "edit" =
    content.mode === "pending"
      ? content.status === "loading"
        ? "pending"
        : "error"
      : content.mode === "hidden" || recordMissing
        ? "hidden"
        : record.status === "error"
          ? "error"
          : !record.data
            ? "loading"
            : content.mode

  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<EditorNotice>("none")
  const guard = useScopeGuard(scopeKey)
  // 保存の状態は、保存を始めたときのスコープの世代と組で持つ。別のスコープで始めた保存の状態（保存中、結果の文）を示さない。
  const [saveState, setSaveState] = useState<{ ticket: ScopeTicket | null; save: SaveState }>({ ticket: null, save: { status: "idle" } })
  const save: SaveState = saveState.ticket && !guard.isSameScope(saveState.ticket) ? { status: "idle" } : saveState.save
  const setSave = (value: SaveState, ticket?: ScopeTicket) => setSaveState((s) => ({ ticket: ticket ?? s.ticket, save: value }))
  const saving = save.status === "saving"
  const dirty = draft !== null && !sameValues(draft.values, draft.base)

  // モードの変化に応じて、入力の扱いと知らせを決める。
  const prevMode = useRef(mode)
  useEffect(() => {
    const prev = prevMode.current
    prevMode.current = mode
    if (prev === mode) return
    if (mode === "hidden") {
      // 閲覧できなくなった：入力に機密の情報が含まれうるため、ポリシーにかかわらず破棄する。
      setNotice(dirty ? "view-lost-discarded" : prev === "pending" || prev === "loading" ? "none" : "view-lost")
      setDraft(null)
    } else if (mode === "read-only" && prev === "edit") {
      if (!dirty) {
        setNotice("edit-lost")
        setDraft(null)
      } else if (draftPolicy === "keep") setNotice("edit-lost-kept")
      else {
        setNotice("edit-lost-discarded")
        setDraft(null)
      }
    }
    // 権限が戻った場合の知らせは、最新の内容を確かめた後（下の効果）に出す。
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // 編集できる状態で、最新の権限と最新の内容を取得できたら、入力を用意する（再開の前の再検証）。
  const regaining = useRef(false)
  useEffect(() => {
    if (mode === "read-only" || mode === "hidden") regaining.current = notice !== "none" || regaining.current
  }, [mode, notice])
  useEffect(() => {
    if (mode !== "edit" || access.status !== "ready" || !record.canOperate || !record.data || saving) return
    const latest = record.data
    if (!draft) {
      setDraft({ values: valuesOf(latest), base: valuesOf(latest), baseVersion: latest.version })
      if (regaining.current) {
        regaining.current = false
        setNotice("regained")
      }
      return
    }
    if (draft.baseVersion !== latest.version) {
      // ほかの人の更新：変更していない項目は最新の内容にし、入力した項目は残す。
      const base = valuesOf(latest)
      const values: Values = {
        owner: draft.values.owner === draft.base.owner ? base.owner : draft.values.owner,
        note: draft.values.note === draft.base.note ? base.note : draft.values.note,
      }
      setDraft({ values, base, baseVersion: latest.version })
      if (regaining.current || !sameValues(draft.values, draft.base)) setNotice(regaining.current ? "rebased" : notice)
      regaining.current = false
    } else if (regaining.current) {
      regaining.current = false
      setNotice("regained")
    }
  }, [mode, access.status, record.canOperate, record.data, saving]) // eslint-disable-line react-hooks/exhaustive-deps

  // 結果が不明な保存：取得し直した内容で、保存されたかを確かめる。
  const checkFrom = useRef<{ fetchedAt: number | null; expected: Values; baseVersion: number } | null>(null)
  useEffect(() => {
    const check = checkFrom.current
    if (save.status !== "checking" || !check || !record.data || record.status !== "ready" || record.fetchedAt === check.fetchedAt) return
    checkFrom.current = null
    const latest = record.data
    if (latest.version > check.baseVersion && sameValues(valuesOf(latest), check.expected)) {
      setDraft({ values: valuesOf(latest), base: valuesOf(latest), baseVersion: latest.version })
      setSave({ status: "confirmed-saved", message: "保存されていたことを確認しました。" })
    } else setSave({ status: "confirmed-not-saved", message: "保存されていなかったことを確認しました。入力は残しています。もう一度保存してください。" })
  }, [save.status, record.data, record.status, record.fetchedAt])

  const saveDecision = decideAccess(access, { permissions: ["customers.edit"], connectivity: offline ? "offline" : "online" })
  const submit = () => {
    if (!draft || saving || !saveDecision.allowed || !record.canOperate) return
    const ticket = guard.begin("save")
    const expected = draft.values
    const baseVersion = draft.baseVersion
    setSave({ status: "saving" }, ticket)
    api.saveRecord(scopeKey, recordId, { owner: expected.owner, note: expected.note || null }, { signal: ticket.signal }).then(
      (saved) => {
        // 別のスコープで始めた保存の状態は、描画の時点で示さない（save の導出）。
        if (!guard.isLatest(ticket)) return
        record.setData(() => saved, { scopeKey: ticket.scope })
        setDraft((d) => (d ? { values: d.values, base: expected, baseVersion: saved.version } : d))
        setSave({ status: "saved", message: "保存しました。" })
        onSaved?.(saved)
      },
      (error: unknown) => {
        // 別のスコープで始めた保存の状態は、描画の時点で示さない（save の導出）。
        if (!guard.isLatest(ticket)) return
        if (error instanceof MockUnknownError) {
          checkFrom.current = { fetchedAt: record.fetchedAt, expected, baseVersion }
          setSave({ status: "checking" })
          record.reload()
        } else if (error instanceof MockRequestError && (error.code === "forbidden" || error.code === "not-found")) {
          setSave({ status: "rejected", message: "保存されませんでした。権限が変更されたため、サーバーが保存を受け付けませんでした。" })
        } else setSave({ status: "failed", message: "保存できませんでした。サーバーに接続できませんでした。もう一度保存してください。" })
      },
    )
  }

  const containerRef = useRef<HTMLDivElement>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  useFocusRecovery(containerRef, noticeRef, `${mode}:${notice}`)

  const shownNotice = notice !== "none" ? noticeText[notice] : null
  const saveMessage =
    save.status === "saving" ? "保存しています" : save.status === "checking" ? "保存できたかを確認しています" : "message" in save ? save.message : ""
  const data = record.data
  return (
    <div ref={containerRef} className="flex flex-col" data-testid="perm-editor" data-mode={mode} data-scope={access.grants?.scope ?? ""}>
      {/* 常に置いた Live Region。権限の変化と、その結果の扱いを知らせる */}
      <div role="status" data-testid="perm-editor-notice" data-notice={notice}>
        {shownNotice && (
          <div className="flex flex-col gap-1 rounded-md bg-muted p-4">
            <p ref={noticeRef} tabIndex={-1} className="text-ui font-medium outline-none focus-visible:focus-ring">
              {shownNotice.title}
            </p>
            <p className="text-ui text-muted-foreground">{shownNotice.description}</p>
          </div>
        )}
      </div>
      <div className={shownNotice ? "mt-6" : undefined}>
        {mode === "pending" || mode === "loading" ? (
          <p className="text-ui text-muted-foreground" aria-busy="true">
            {mode === "pending" ? "権限を確認しています" : "読み込んでいます"}
          </p>
        ) : mode === "error" ? (
          <DataRegionError
            title="この顧客を表示できませんでした"
            description="権限か内容を取得できませんでした。"
            onRetry={() => (access.reload(), record.reload())}
          />
        ) : mode === "hidden" || !data ? null : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <H className="text-heading">{data.company}</H>
              <p className="text-ui text-muted-foreground">
                {data.region}・{data.industry}
              </p>
            </div>
            {mode === "edit" && draft ? (
              <form
                className="flex flex-col gap-4"
                data-testid="perm-editor-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
              >
                {/* 一部の項目だけ変更できない場合は、その項目を Read Only の Input にする（値を選択してコピーできる） */}
                <Field className="max-w-xs">
                  <FieldLabel>顧客 ID</FieldLabel>
                  <Input readOnly value={data.id} data-testid="perm-editor-id" />
                </Field>
                <Field className="max-w-sm">
                  <FieldLabel>担当者</FieldLabel>
                  <Input
                    value={draft.values.owner}
                    onChange={(e) => setDraft({ ...draft, values: { ...draft.values, owner: e.target.value } })}
                    data-testid="perm-editor-owner"
                  />
                </Field>
                <Field>
                  <FieldLabel>備考</FieldLabel>
                  <Textarea
                    value={draft.values.note}
                    onChange={(e) => setDraft({ ...draft, values: { ...draft.values, note: e.target.value } })}
                    rows={3}
                    data-testid="perm-editor-note"
                  />
                </Field>
                <RestrictedAction
                  presentation={saveDecision.allowed ? { mode: "enabled", reason: null } : { mode: "disabled", reason: saveDecision.reason }}
                  reason={saveDecision.allowed ? undefined : restrictionText(saveDecision.reason, labels)}
                >
                  {(control) => (
                    <Button
                      type="submit"
                      className="self-start"
                      {...control}
                      disabled={control.disabled || !dirty}
                      loading={saving || save.status === "checking"}
                      data-testid="perm-editor-save"
                    >
                      保存
                    </Button>
                  )}
                </RestrictedAction>
              </form>
            ) : (
              <dl className="grid max-w-xl gap-x-6 gap-y-3 text-ui sm:grid-cols-[8rem_1fr]" data-testid="perm-editor-readonly">
                <dt className="text-muted-foreground">顧客 ID</dt>
                <dd>{data.id}</dd>
                <dt className="text-muted-foreground">担当者</dt>
                <dd>{data.owner}</dd>
                <dt className="text-muted-foreground">電話番号</dt>
                <dd>{data.phone}</dd>
                <dt className="text-muted-foreground">備考</dt>
                <dd className="[word-break:auto-phrase]">{data.note ?? "—"}</dd>
              </dl>
            )}
          </div>
        )}
      </div>
      <p role="status" className={saveMessage ? "mt-4 text-ui" : "text-ui"} data-testid="perm-editor-save-status" data-status={save.status}>
        {saveMessage}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- 権限の管理
/** Permission Matrix。ロールごとに、実際に可能な操作を示す。ロールと権限は製品のデータとして受け取る */
export function PermissionMatrix<R extends string, P extends string>({
  roles,
  permissions,
  permissionLabel: labelOf,
  caption = "ロールごとにできる操作",
}: {
  roles: { id: R; name: string; permissions: readonly P[] }[]
  permissions: readonly P[]
  permissionLabel: (p: P) => string
  caption?: string
}) {
  return (
    <TableScrollArea>
      <Table data-testid="perm-matrix" density="compact">
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">操作</TableHead>
            {roles.map((r) => (
              <TableHead key={r.id} scope="col" align="center">
                {r.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissions.map((p) => (
            <TableRow key={p} data-permission={p}>
              <TableHead scope="row" className="font-normal">
                {labelOf(p)}
              </TableHead>
              {roles.map((r) => {
                const ok = r.permissions.includes(p)
                return (
                  <TableCell key={r.id} align="center" data-role={r.id} data-allowed={ok}>
                    {ok ? (
                      <Check aria-hidden="true" className="mx-auto size-5" />
                    ) : (
                      <Minus aria-hidden="true" className="mx-auto size-4 text-muted-foreground" />
                    )}
                    <span className="sr-only">{ok ? "できる" : "できない"}</span>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScrollArea>
  )
}

type Member = { userId: UserId; name: string; email: string; role: RoleId }

/**
 * メンバーのロールの管理。影響の大きい変更（sensitive の権限が増減する変更）は、できるようになる操作とできなくなる操作を
 * 示して確認する。権限昇格、自分自身の変更、最後の管理者の変更の検証はサーバーが行い、拒否の応答をそのまま示す。
 */
export function RoleManagement({
  scope,
  api,
  access,
  revision,
  roles = modelRoles,
  sensitive = sensitivePermissions,
  onChanged,
  headingAs: H = "h3",
}: {
  scope: PermissionScope
  api: PermissionApi
  access: Access
  revision: number
  roles?: Record<RoleId, { name: string; description: string; permissions: Permission[] }>
  sensitive?: Permission[]
  onChanged?: (change: { userId: UserId; role: RoleId }) => void
  /** 区切りの見出しの要素。ページの h1 の直下に置く場合は h2 */
  headingAs?: "h2" | "h3"
}) {
  const scopeKey = scopeKeyOf(scope)
  const view = resolveContentAccess(access, { view: ["members.view"], edit: ["members.manage"] })
  const manage = decideAccess(access, { permissions: ["members.manage"] })
  const members = useBrowseData({
    query: "members",
    queryKey: `members:${revision}`,
    scopeKey,
    enabled: view.mode === "edit" || view.mode === "read-only",
    fetcher: (_q, { signal }) => api.listMembers(scopeKey, { signal }),
  })
  const guard = useScopeGuard(scopeKey)
  // 確認中の変更と処理中の状態は、スコープと組で持ち、現在のスコープの値だけを使う。
  const [pendingState, setPending] = useState<{ scope: string; member: Member; to: RoleId; added: Permission[]; removed: Permission[] } | null>(null)
  const pending = pendingState?.scope === scopeKey ? pendingState : null
  const inFlight = useInFlight<true>(guard)
  const committing = inFlight.current !== null
  const [result, setResult] = useState<{ scope: string; text: string; error: boolean } | null>(null)
  const roleList = useMemo(() => (Object.keys(roles) as RoleId[]).map((id) => ({ id, ...roles[id] })), [roles])

  const commit = (member: Member, to: RoleId) => {
    const ticket = guard.begin(`role:${member.userId}`)
    inFlight.start(ticket, true)
    api
      .changeRole(scopeKey, member.userId, to, { signal: ticket.signal })
      .then(
        () => {
          if (!guard.isLatest(ticket)) return
          members.reload()
          setResult({ scope: scopeKey, text: `${member.name}さんのロールを${roles[to].name}に変更しました。`, error: false })
          onChanged?.({ userId: member.userId, role: to })
        },
        (error: unknown) => {
          if (!guard.isLatest(ticket)) return
          setResult({
            scope: scopeKey,
            text:
              error instanceof MockRequestError && error.code !== "network"
                ? `ロールを変更できませんでした。${error.message}。`
                : "ロールを変更できませんでした。サーバーに接続できませんでした。",
            error: true,
          })
        },
      )
      .finally(() => {
        inFlight.finish(ticket)
        setPending((p) => (p?.scope === ticket.scope ? null : p))
      })
  }
  const request = (member: Member, to: RoleId) => {
    if (committing || to === member.role) return
    const { added, removed } = diffPermissions(roles[member.role].permissions, roles[to].permissions)
    if ([...added, ...removed].some((p) => sensitive.includes(p))) setPending({ scope: scopeKey, member, to, added, removed })
    else commit(member, to)
  }
  const shownResult = result?.scope === scopeKey ? result : null
  return (
    <div className="flex flex-col gap-10" data-testid="perm-roles" data-scope={access.grants?.scope ?? ""}>
      <section className="flex flex-col gap-4" aria-labelledby="perm-roles-matrix">
        <H id="perm-roles-matrix" className="text-heading">
          ロールごとにできる操作
        </H>
        <PermissionMatrix roles={roleList} permissions={Object.keys(permissionLabels) as Permission[]} permissionLabel={permissionLabel} />
      </section>

      {view.mode !== "hidden" && (
        <section className="flex flex-col gap-4" aria-labelledby="perm-roles-members">
          <H id="perm-roles-members" className="text-heading">
            メンバー
          </H>
          {view.mode === "read-only" && (
            <RestrictionNotice
              title="ロールは閲覧だけできます"
              description={`ロールの変更には「${permissionLabel("members.manage")}」の権限が必要です。${contactText(scope, "変更が必要な場合は、")}`}
              restriction={view.reason.kind}
            />
          )}
          {view.mode === "pending" || !members.isCurrent || !members.data ? (
            members.status === "error" ? (
              <DataRegionError title="メンバーを取得できませんでした" onRetry={members.reload} />
            ) : (
              <p className="text-ui text-muted-foreground" aria-busy="true">
                読み込んでいます
              </p>
            )
          ) : (
            <ul className="flex flex-col" data-testid="perm-members">
              {members.data.map((m) => {
                const self = m.userId === scope.userId
                return (
                  <li
                    key={m.userId}
                    className="grid items-center gap-x-6 gap-y-2 border-b border-border py-3 last:border-b-0 sm:grid-cols-[1fr_14rem]"
                    data-user={m.userId}
                  >
                    <div className="min-w-0">
                      <p className="text-ui font-medium">{m.name}</p>
                      <p className="text-caption text-muted-foreground [overflow-wrap:anywhere]">{m.email}</p>
                    </div>
                    {self && manage.allowed && view.mode === "edit" ? (
                      // 自分自身の行は、押せない Select を置かず、ロールを文字で示して理由を添える。
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-ui">{roles[m.role].name}（自分）</p>
                        <p className="text-caption text-muted-foreground">自分自身のロールは、ほかの管理者が変更します。</p>
                      </div>
                    ) : manage.allowed && view.mode === "edit" ? (
                      <div className="flex min-w-0 flex-col gap-1">
                        <Select
                          items={roleList.map((r) => ({ value: r.id, label: r.name }))}
                          value={m.role}
                          disabled={committing}
                          onValueChange={(v) => request(m, v as RoleId)}
                        >
                          <SelectTrigger size="sm" aria-label={`${m.name}さんのロール`} data-testid={`perm-role-${m.userId}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roleList.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <p className="text-ui">{roles[m.role].name}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p role="status" className={shownResult?.error ? "text-ui text-destructive" : "text-ui"} data-testid="perm-roles-result">
            {shownResult?.text ?? ""}
          </p>
        </section>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && !committing && setPending(null)}>
        <AlertDialogContent data-testid="perm-role-confirm">
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pending.member.name}さんを{roles[pending.to].name}に変更しますか？
                </AlertDialogTitle>
                <AlertDialogDescription>変更はすぐに反映されます。</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-4 text-ui">
                {pending.added.length > 0 && (
                  <div>
                    <p className="font-medium">できるようになる操作</p>
                    <ul className="mt-1 list-disc ps-5 text-muted-foreground" data-testid="perm-role-added">
                      {pending.added.map((p) => (
                        <li key={p}>{permissionLabel(p)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {pending.removed.length > 0 && (
                  <div>
                    <p className="font-medium">できなくなる操作</p>
                    <ul className="mt-1 list-disc ps-5 text-muted-foreground" data-testid="perm-role-removed">
                      {pending.removed.map((p) => (
                        <li key={p}>{permissionLabel(p)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={committing}>キャンセル</AlertDialogCancel>
                <AlertDialogAction loading={committing} onClick={() => commit(pending.member, pending.to)}>
                  {roles[pending.to].name}に変更
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------- 権限の変更のシミュレーション
/** ほかの利用者（管理者）の操作を模擬する。サーバーの状態を直接変え、対象の利用者に変更を知らせる */
export function PermissionChangeControls({
  server,
  scope,
  recordId,
  legend = "管理者の操作（模擬。認可の検証を行わずに反映する）",
}: {
  server: {
    simulate: {
      setRole: (u: UserId, w: PermissionScope["workspaceId"], r: RoleId) => void
      restrictRecord: (id: string, to: UserId[] | null) => void
      updateRecord: (id: string, patch: { note?: string | null }) => void
    }
  }
  scope: PermissionScope
  recordId?: string
  legend?: string
}) {
  const name = users[scope.userId].name
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 text-ui">
      <legend className="mb-1 font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" className="max-w-full" onClick={() => server.simulate.setRole(scope.userId, scope.workspaceId, "viewer")}>
          {name}さんを閲覧者にする
        </Button>
        <Button variant="secondary" size="sm" className="max-w-full" onClick={() => server.simulate.setRole(scope.userId, scope.workspaceId, "member")}>
          {name}さんをメンバーに戻す
        </Button>
        {recordId && (
          <>
            <Button variant="secondary" size="sm" className="max-w-full" onClick={() => server.simulate.restrictRecord(recordId, ["u-sato"])}>
              この顧客の閲覧を担当者だけにする
            </Button>
            <Button variant="secondary" size="sm" className="max-w-full" onClick={() => server.simulate.restrictRecord(recordId, null)}>
              この顧客の閲覧の制限を外す
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="max-w-full"
              onClick={() => server.simulate.updateRecord(recordId, { note: "ほかの利用者が更新した備考（模擬）" })}
            >
              ほかの人が備考を更新する
            </Button>
          </>
        )}
      </div>
    </fieldset>
  )
}

export type { Access as PermissionAccess }
