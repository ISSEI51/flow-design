import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { resolveContentAccess } from "@/patterns/access"
import { AccessState } from "@/patterns/access-state"

import { MockRequestError } from "../../data/system-account/mock"
import { permissionLabels, users, type UserId } from "../../data/system-account/model"
import {
  confidentialCustomerIds,
  editingCustomerId,
  exampleOperations,
  exampleScopes,
  scopeKeyOf,
  type PermissionScope,
} from "../../data/system-account/permission-data"
import { permissionServer, type PermissionRequestRecord } from "../../data/system-account/permission-server"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import {
  CustomerEditor,
  OrgSecuritySettings,
  PageAccessView,
  PartialOverview,
  PermissionChangeControls,
  RestrictedOperations,
  RoleManagement,
  defaultConditions,
  usePermissionAccess,
  type OperationConditions,
} from "./permission-screens"

const api = permissionServer.api
const scopeOf = (i: number) => exampleScopes[i].scope
const suzukiHq: PermissionScope = { userId: "u-suzuki", workspaceId: "hq" }
const tanakaHq: PermissionScope = { userId: "u-tanaka", workspaceId: "hq" }

function ScopeRadios({ name, value, onChange, options = [0, 1, 2, 3] }: { name: string; value: number; onChange: (i: number) => void; options?: number[] }) {
  return (
    <DemoControls legend="利用者（模擬のログイン）">
      {options.map((i) => (
        <Radio key={i} name={name} checked={value === i} onChange={() => onChange(i)}>
          {exampleScopes[i].label}
        </Radio>
      ))}
    </DemoControls>
  )
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--primary)]" />
      {children}
    </label>
  )
}

// ---------------------------------------------------------------- 非表示・無効化と制限の理由
function OperationsDemo() {
  const [scopeIndex, setScopeIndex] = useState(0)
  const [fetchMode, setFetchMode] = useState<"normal" | "slow" | "fail">("normal")
  const [conditions, setConditions] = useState<OperationConditions>({ ...defaultConditions, unmetPrerequisites: ["invite-sender"] })
  const scope = scopeOf(scopeIndex)
  const { access, revision } = usePermissionAccess({ scope, api })
  const setFetch = (mode: typeof fetchMode) => {
    setFetchMode(mode)
    permissionServer.latency.access = mode === "slow" ? 3000 : 400
    permissionServer.outcome.access = mode === "fail" ? "fail" : "success"
    access.reload()
  }
  const toggle = (key: "offline" | "pending", v: boolean) => setConditions((c) => ({ ...c, [key]: v }))
  return (
    <DemoFrame testId="perm-demo-ops">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <ScopeRadios name="perm-ops-scope" value={scopeIndex} onChange={setScopeIndex} />
          <DemoControls legend="権限の取得（模擬のサーバー）">
            <Radio name="perm-ops-fetch" checked={fetchMode === "normal"} onChange={() => setFetch("normal")}>
              標準（400ms）
            </Radio>
            <Radio name="perm-ops-fetch" checked={fetchMode === "slow"} onChange={() => setFetch("slow")}>
              遅い（3 秒）
            </Radio>
            <Radio name="perm-ops-fetch" checked={fetchMode === "fail"} onChange={() => setFetch("fail")}>
              失敗する
            </Radio>
          </DemoControls>
          <DemoControls legend="そのほかの条件（模擬）">
            <Check checked={conditions.offline} onChange={(v) => toggle("offline", v)}>
              オフライン
            </Check>
            <Check checked={conditions.unavailable.includes("export")} onChange={(v) => setConditions((c) => ({ ...c, unavailable: v ? ["export"] : [] }))}>
              書き出しの障害
            </Check>
            <Check checked={conditions.pending} onChange={(v) => toggle("pending", v)}>
              保存の処理中
            </Check>
            <Check
              checked={conditions.unmetPrerequisites.includes("invite-sender")}
              onChange={(v) => setConditions((c) => ({ ...c, unmetPrerequisites: v ? ["invite-sender"] : [] }))}
            >
              招待メールの送信元が未設定
            </Check>
          </DemoControls>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-heading">顧客の詳細の操作</h3>
          <p className="text-ui text-muted-foreground">
            {users[scope.userId].name}さんに表示される操作（{exampleOperations.length} 種類のうち、表示するもの）
          </p>
        </div>
        <RestrictedOperations
          scope={scope}
          api={api}
          access={access}
          revision={revision}
          conditions={conditions}
          onResolvePrerequisite={() => setConditions((c) => ({ ...c, unmetPrerequisites: [] }))}
        />
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 閲覧専用
function ReadOnlyDemo() {
  const { access, revision } = usePermissionAccess({ scope: tanakaHq, api })
  return (
    <DemoFrame testId="perm-demo-readonly">
      <p className="mb-6 text-ui text-muted-foreground">田中 美咲さん（本社営業部・閲覧者）が顧客の詳細を開いた例</p>
      <CustomerEditor scope={tanakaHq} api={api} access={access} revision={revision} recordId={editingCustomerId} />
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- ページへのアクセス
const pageOptions = [
  { path: `/customers/${editingCustomerId}`, label: "顧客の詳細" },
  { path: `/customers/${confidentialCustomerIds[0]}`, label: "担当者だけが閲覧できる顧客" },
  { path: "/settings/billing", label: "契約と請求の設定" },
  { path: "/customers/C-99999", label: "存在しない顧客" },
  { path: "/customers", label: "顧客の一覧" },
]

function PageAccessDemo() {
  const [user, setUser] = useState<"none" | UserId>("none")
  const [path, setPath] = useState(pageOptions[0].path)
  const scope: PermissionScope | null = user === "none" ? null : { userId: user, workspaceId: "hq" }
  return (
    <DemoFrame testId="perm-demo-page">
      <div className="flex flex-col gap-6">
        <DemoControls legend="利用者（模擬のログイン）">
          <Radio name="perm-page-user" checked={user === "none"} onChange={() => setUser("none")}>
            ログインしていない
          </Radio>
          <Radio name="perm-page-user" checked={user === "u-tanaka"} onChange={() => setUser("u-tanaka")}>
            田中 美咲（閲覧者）
          </Radio>
          <Radio name="perm-page-user" checked={user === "u-sato"} onChange={() => setUser("u-sato")}>
            佐藤 花子（管理者）
          </Radio>
        </DemoControls>
        <DemoControls legend="開くページ">
          {pageOptions.map((p) => (
            <Radio key={p.path} name="perm-page-path" checked={path === p.path} onChange={() => setPath(p.path)}>
              {p.label}
            </Radio>
          ))}
        </DemoControls>
        <p className="text-caption text-muted-foreground">
          URL：<span className="font-mono">{path}</span>
        </p>
        <PageAccessView scope={scope} path={path} api={api} headingLevel={3} onSignIn={() => setUser("u-tanaka")} onNavigate={setPath} />
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 部分的な閲覧権限
function PartialDemo() {
  const [scopeIndex, setScopeIndex] = useState(2)
  const scope = scopeOf(scopeIndex)
  const { access, revision } = usePermissionAccess({ scope, api })
  return (
    <DemoFrame testId="perm-demo-partial">
      <div className="flex flex-col gap-8">
        <ScopeRadios name="perm-partial-scope" value={scopeIndex} onChange={setScopeIndex} options={[0, 1, 2]} />
        <PartialOverview key={scopeKeyOf(scope)} scope={scope} api={api} access={access} revision={revision} />
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 権限の申請
function usePendingRequests() {
  return useSyncExternalStore(
    api.subscribeRequests,
    () => requestsSnapshot(),
    () => emptyRequests,
  )
}
const emptyRequests: PermissionRequestRecord[] = []
let lastRequests: PermissionRequestRecord[] = emptyRequests
let lastRequestsKey = ""
function requestsSnapshot() {
  const requests = permissionServer.inspect().requests
  const key = JSON.stringify(requests)
  if (key !== lastRequestsKey) {
    lastRequestsKey = key
    lastRequests = requests
  }
  return lastRequests
}

function RequestDemo() {
  const { access, revision } = usePermissionAccess({ scope: tanakaHq, api })
  const requests = usePendingRequests().filter((r) => r.status === "pending")
  return (
    <DemoFrame testId="perm-demo-request">
      <div className="flex flex-col gap-8">
        <p className="text-ui text-muted-foreground">田中 美咲さん（本社営業部・閲覧者）の画面</p>
        <RestrictedOperations
          scope={tanakaHq}
          api={api}
          access={access}
          revision={revision}
          operations={exampleOperations.filter((o) => o.id === "edit" || o.id === "delete")}
        />
        <fieldset className="flex flex-col gap-3 text-ui" data-testid="perm-admin-requests">
          <legend className="mb-1 font-medium">管理者の画面（模擬。申請の承認と却下）</legend>
          {requests.length === 0 ? (
            <p className="text-muted-foreground">承認待ちの申請はありません。</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2" data-request={r.id}>
                  <span>
                    {users[r.scope.split(":")[0] as UserId].name}さん：「{permissionLabels[r.permission]}」
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => permissionServer.simulate.decide(r.id, "approved")}>
                      承認する
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => permissionServer.simulate.decide(r.id, "rejected")}>
                      却下する
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 契約プランによる制限
function PlanDemo() {
  const [scopeIndex, setScopeIndex] = useState(0)
  const scope = scopeOf(scopeIndex)
  const { access } = usePermissionAccess({ scope, api })
  const hidden = resolveContentAccess(access, { view: ["settings.org.view"] }).mode === "hidden"
  return (
    <DemoFrame testId="perm-demo-plan">
      <div className="flex flex-col gap-8">
        <ScopeRadios name="perm-plan-scope" value={scopeIndex} onChange={setScopeIndex} />
        <h3 className="text-heading">組織のセキュリティ</h3>
        {hidden ? (
          <p className="text-ui text-muted-foreground" data-testid="perm-org-hidden">
            （この利用者には、組織の設定を表示しません。業務に関係のない管理の機能のためです）
          </p>
        ) : (
          <OrgSecuritySettings scope={scope} access={access} />
        )}
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 利用中の権限変更
function LiveChangeDemo() {
  const { access, revision, notice } = usePermissionAccess({ scope: suzukiHq, api })
  return (
    <DemoFrame testId="perm-demo-live">
      <div className="flex flex-col gap-8">
        <PermissionChangeControls server={permissionServer} scope={suzukiHq} />
        <div className="flex flex-col gap-4">
          <p className="text-ui text-muted-foreground">鈴木 一郎さん（本社営業部）の画面</p>
          <p role="status" className="text-ui" data-testid="perm-live-notice">
            {notice}
          </p>
          <RestrictedOperations scope={suzukiHq} api={api} access={access} revision={revision} operations={exampleOperations.filter((o) => o.id !== "audit")} />
        </div>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 編集中の権限変更
function EditingDemo() {
  const { access, revision } = usePermissionAccess({ scope: suzukiHq, api })
  const [policy, setPolicy] = useState<"keep" | "discard">("keep")
  const [slowSave, setSlowSave] = useState(false)
  useEffect(() => {
    permissionServer.latency.save = slowSave ? 3000 : 800
  }, [slowSave])
  return (
    <DemoFrame testId="perm-demo-edit">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <PermissionChangeControls server={permissionServer} scope={suzukiHq} recordId={editingCustomerId} />
          <DemoControls legend="未保存の入力の扱い（製品のポリシー）">
            <Radio name="perm-edit-policy" checked={policy === "keep"} onChange={() => setPolicy("keep")}>
              編集の権限が戻るまで保持する
            </Radio>
            <Radio name="perm-edit-policy" checked={policy === "discard"} onChange={() => setPolicy("discard")}>
              破棄する
            </Radio>
          </DemoControls>
          <DemoControls legend="保存（模擬のサーバー）">
            <Check checked={slowSave} onChange={setSlowSave}>
              保存に 3 秒かかる
            </Check>
          </DemoControls>
        </div>
        <CustomerEditor scope={suzukiHq} api={api} access={access} revision={revision} recordId={editingCustomerId} draftPolicy={policy} />
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 権限の管理
function RolesDemo() {
  const [scopeIndex, setScopeIndex] = useState(0)
  const scope = scopeOf(scopeIndex)
  const { access, revision } = usePermissionAccess({ scope, api })
  return (
    <DemoFrame testId="perm-demo-roles">
      <div className="flex flex-col gap-8">
        <ScopeRadios name="perm-roles-scope" value={scopeIndex} onChange={setScopeIndex} options={[0, 1, 2]} />
        <RoleManagement scope={scope} api={api} access={access} revision={revision} />
      </div>
    </DemoFrame>
  )
}

// UI の制限を経由せずに要求を送った場合に、サーバーが拒否することを示す。
const directRequests: { id: string; label: string; scope: string; target: UserId; role: "admin" | "viewer" }[] = [
  { id: "escalate", label: "田中 美咲（閲覧者）として、自分を管理者にする", scope: "u-tanaka:hq", target: "u-tanaka", role: "admin" },
  { id: "self", label: "佐藤 花子（管理者）として、自分を閲覧者にする", scope: "u-sato:hq", target: "u-sato", role: "viewer" },
]

function DirectRequestDemo() {
  const [result, setResult] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const send = (r: (typeof directRequests)[number]) => {
    setBusy(r.id)
    api
      .changeRole(r.scope, r.target, r.role)
      .then(
        () => setResult("サーバーが受け付けました。"),
        (e: unknown) => setResult(e instanceof MockRequestError ? `サーバーが拒否しました（${e.code}）：${e.message}` : "サーバーに接続できませんでした。"),
      )
      .finally(() => setBusy(null))
  }
  return (
    <DemoFrame testId="perm-demo-direct">
      <div className="flex flex-col gap-4">
        <fieldset className="flex min-w-0 flex-col gap-2 text-ui">
          <legend className="mb-1 font-medium">画面を経由せずにサーバーへ送る要求（模擬。URL やリクエストの改変に相当する）</legend>
          <div className="flex flex-wrap gap-2">
            {directRequests.map((r) => (
              <Button key={r.id} variant="outline" size="sm" className="max-w-full" loading={busy === r.id} disabled={busy !== null && busy !== r.id} onClick={() => send(r)}>
                {r.label}
              </Button>
            ))}
          </div>
        </fieldset>
        <p role="status" className="text-ui" data-testid="perm-direct-result">
          {result}
        </p>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 古い認可の結果の無効化
function StaleInner({ scope, onResolved }: { scope: PermissionScope; onResolved: (text: string) => void }) {
  const { access, revision } = usePermissionAccess({
    scope,
    api,
    onResolved: (g) => onResolved(`${users[g.scope.split(":")[0] as UserId].name}（要求 ${g.requestId}）`),
  })
  return (
    <RestrictedOperations
      scope={scope}
      api={api}
      access={access}
      revision={revision}
      operations={exampleOperations.filter((o) => o.id === "edit" || o.id === "invite")}
    />
  )
}

function StaleDemo() {
  const [scopeIndex, setScopeIndex] = useState(0)
  const [mounted, setMounted] = useState(true)
  const [log, setLog] = useState<string[]>([])
  const scope = scopeOf(scopeIndex)
  return (
    <DemoFrame testId="perm-demo-stale">
      <div className="flex flex-col gap-6">
        <ScopeRadios name="perm-stale-scope" value={scopeIndex} onChange={setScopeIndex} options={[0, 2]} />
        <DemoControls legend="例の表示">
          <Check checked={mounted} onChange={setMounted}>
            例を表示する（外すとアンマウントする）
          </Check>
        </DemoControls>
        {mounted && <StaleInner scope={scope} onResolved={(t) => setLog((l) => [...l, t])} />}
        <div className="flex flex-col gap-2 text-ui">
          <p className="font-medium">反映した権限の応答</p>
          <ol className="flex flex-col gap-1 text-muted-foreground" data-testid="perm-stale-log">
            {log.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </div>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- ページ
export function PermissionStatesPage() {
  // 検品で、模擬のサーバーの状態を初期に戻せるようにする（ページを開き直したときと同じ）。
  useEffect(() => () => permissionServer.reset(), [])
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / System & Account"
        name="Permission States"
        lead="権限や契約プランで利用できない機能を、業務との関係と情報公開の安全性に応じて、表示しない・無効にして理由を示す・閲覧だけにする、のいずれかで扱う。UI の制限は、バックエンドでの認可の代わりにならない。"
      />

      <Section title="判断の基準" lead="すべてを機械的に非表示や無効にしない。利用者がその機能を必要とする可能性と、存在を知らせてよいかで決める。">
        <Rules
          rows={[
            ["業務に関係のない管理の機能", "表示しない（メンバーの招待、監査ログ、契約と請求）"],
            ["存在を知らせてはならない機能", "表示しない。件数、検索の候補、書き出し、通知にも含めない"],
            ["必要とする可能性がある操作", "無効にし、操作の近くに理由と解決の方法を示す"],
            ["閲覧できるが変更できない", "閲覧専用。通常の文字で表示する（すべての Input を Disabled にしない）"],
            ["権限を申請できる", "必要に応じて表示し、申請の操作を示す（実際に申請できる場合だけ）"],
            ["権限を確認できていない", "操作を許可しない。取得中と取得の失敗を、許可として扱わない"],
          ]}
        />
      </Section>

      <Section
        title="制限された操作と理由"
        lead="認可、契約プラン、前提の設定の不足、処理中、接続、障害、権限の未確定を、内部でも別の状態として持ち、それぞれの文で示す。権限の取得と認可は模擬の処理である。"
      >
        <OperationsDemo />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="理由が異なる 3 つの操作を、すべて「権限がありません」と表示した例">
                {["顧客を編集", "顧客を書き出す", "メンバーを招待"].map((l) => (
                  <div key={l} className="flex flex-col gap-1">
                    <span className="w-fit rounded-md border border-input px-3 py-1.5 text-ui opacity-50">{l}</span>
                    <span className="text-caption text-muted-foreground">権限がありません</span>
                  </div>
                ))}
              </Mock>
            }
            badNote="障害やオフライン、前提の設定の不足まで「権限がありません」と示すと、利用者は不要な申請をし、待てば使えることもわからない。"
            good={
              <Mock label="操作ごとに、権限、障害、前提の設定という異なる理由を示した例">
                {[
                  ["顧客を編集", "この操作には「顧客を登録・編集」の権限が必要です"],
                  ["顧客を書き出す", "障害のため、この機能は一時的に利用できません"],
                  ["メンバーを招待", "招待メールの送信元のアドレスの設定を済ませると利用できます"],
                ].map(([l, r]) => (
                  <div key={l} className="flex flex-col gap-1">
                    <span className="w-fit rounded-md border border-input px-3 py-1.5 text-ui opacity-50">{l}</span>
                    <span className="text-caption text-muted-foreground">{r}</span>
                  </div>
                ))}
              </Mock>
            }
            goodNote="原因ごとに文を変え、操作のすぐ後に置く。Tooltip にだけ理由を入れない。"
          />
        </div>
      </Section>

      <Section
        title="閲覧専用"
        lead="閲覧だけを目的とする表示は、通常の文字で示す。コピーが必要な値や、一部の項目だけ変更できない場合は Read Only の Input を使う。"
      >
        <ReadOnlyDemo />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="すべての入力欄を Disabled にした閲覧専用の画面の例">
                {[
                  ["担当者", "佐藤 美咲"],
                  ["電話番号", "03-1234-5678"],
                  ["備考", "更新の相談は 12 月"],
                ].map(([l, v]) => (
                  <div key={l} className="flex flex-col gap-1 opacity-50">
                    <span className="text-caption">{l}</span>
                    <span className="rounded-md border border-input bg-muted px-3 py-1.5 text-ui">{v}</span>
                  </div>
                ))}
              </Mock>
            }
            badNote="文字が薄くなり、読みにくい。編集できる画面と誤認し、押せない理由も伝わらない。"
            good={
              <Mock label="閲覧専用の内容を、項目名と値の文字で示した例">
                {[
                  ["担当者", "佐藤 美咲"],
                  ["電話番号", "03-1234-5678"],
                  ["備考", "更新の相談は 12 月"],
                ].map(([l, v]) => (
                  <div key={l} className="grid grid-cols-[5rem_1fr] text-ui">
                    <span className="text-muted-foreground">{l}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </Mock>
            }
            goodNote="閲覧できる情報の視認性を下げない。"
          />
        </div>
      </Section>

      <Section
        title="ページへのアクセス"
        lead="ログインが必要、閲覧の権限がない、存在しない、を区別し、安全な移動先と解決の方法を示す。存在を明かすことが情報の漏えいになる対象は、権限不足を不存在と同じ応答にする（バックエンドで保証する）。"
      >
        <PageAccessDemo />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="「403 Forbidden」とだけ表示した例">
                <p className="text-metric">403</p>
                <p className="text-ui text-muted-foreground">Forbidden</p>
              </Mock>
            }
            badNote="何が起きたか、次に何をすればよいかがわからない。"
            good={
              <Mock label="状態の見出し、説明、移動先のボタンを示した例">
                <AccessState
                  kind="forbidden"
                  headingLevel={4}
                  actions={<span className="rounded-lg border border-input px-4 py-2 text-ui">顧客の一覧へ</span>}
                />
              </Mock>
            }
            goodNote="状態を文で示し、解決の方法と安全な移動先を置く。"
          />
        </div>
      </Section>

      <Section
        title="部分的な閲覧権限"
        lead="閲覧できる情報は表示し続ける。存在を知らせてはならない情報は、セクションごと表示せず、件数と検索の結果にも含めない。"
      >
        <PartialDemo />
      </Section>

      <Section
        title="権限の申請"
        lead="実際に利用できる解決の方法だけを示す。必要な権限だけを申請でき、申請の状態はサーバーの記録に基づく。承認待ちの間は、もう一度申請できない。"
      >
        <RequestDemo />
      </Section>

      <Section
        title="契約プランによる制限"
        lead="契約プラン（Entitlement）とロールの権限（Authorization）を区別する。有料の機能の存在は伝えてよいが、過剰に誘導しない。契約を変更できない利用者には、問い合わせ先を示す。"
      >
        <PlanDemo />
      </Section>

      <Section
        title="利用中の権限変更"
        lead="新しい権限を検知したら、再読み込みを待たずに表示と操作を更新する。権限が付与された場合も、再ログインを求めない。権限の検知は模擬の通知である。"
      >
        <LiveChangeDemo />
      </Section>

      <Section
        title="編集中の権限変更"
        lead="編集の権限を失ったら保存を停止し、閲覧の権限も失ったら内容を表示しない。保存中に変わった場合は実際の結果を示し、権限が戻った場合は最新の内容と権限を確かめてから再開する。"
      >
        <EditingDemo />
      </Section>

      <Section
        title="権限の管理"
        lead="ロールの名前だけでなく、実際にできる操作を示す。影響の大きい変更は確認する。権限昇格、自分自身の変更、最後の管理者の変更は、サーバーが検証して拒否する。"
      >
        <RolesDemo />
        <div className="mt-8">
          <DirectRequestDemo />
        </div>
      </Section>

      <Section
        title="古い認可の結果の無効化"
        lead="利用者やワークスペースを A → B → A と切り替えた場合も、中止の合図に従わない応答やアンマウントの後の応答で、古い権限を復元しない。"
      >
        <StaleDemo />
      </Section>

      <Section title="セキュリティと UI の責務">
        <Bullets
          items={[
            "UI の非表示と無効化は、実際の認可の代わりにならない。アクセスと操作の認可は、バックエンドで行う。",
            "閲覧の権限がないデータを、クライアントへ送らない（隠すだけにしない）。",
            "URL、リクエスト、ワークスペースの ID を無条件に信頼しない。サーバーは、操作を受け付けた時点の権限で判断する。",
            "未確定の権限で操作を許可しない。権限の取得の失敗を、許可として扱わない。",
            "アカウント、ワークスペース、認可の範囲が変わったら、前のデータと権限を引き継がない。",
          ]}
        />
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "無効の理由は、操作のすぐ後に文で示し、aria-describedby で関連付ける。無効の操作もフォーカスでき、キーボードでもタッチでも理由を確認できる。",
            "鍵のアイコンや色だけで状態を伝えない。",
            '権限の変更は、常に置いた Live Region（role="status"）で知らせる。フォーカスを奪わない。',
            "フォーカスしていた操作が権限の変更で消えた場合は、変更を知らせる見出しへフォーカスを移す。",
          ]}
        />
        <div className="mt-6">
          <AppLink href="#/account-app">統合の検証画面で、権限の変更を試す</AppLink>
        </div>
      </Section>
    </article>
  )
}
