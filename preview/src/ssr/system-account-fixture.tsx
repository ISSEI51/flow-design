import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TooltipProvider } from "@/components/ui/tooltip"
import { decideAccess, presentAction, useAccess } from "@/patterns/access"
import { AccessState } from "@/patterns/access-state"
import { AuthFormError, AuthStatus } from "@/patterns/auth-feedback"
import { AuthLayout } from "@/patterns/auth-layout"
import { ContextualHelp } from "@/patterns/contextual-help"
import { GettingStartedChecklist } from "@/patterns/getting-started"
import { JobStatusItem, JobStatusList } from "@/patterns/job-status"
import { NotificationButton } from "@/patterns/notification-indicator"
import { deriveChecklist } from "@/patterns/onboarding"
import { PasswordInput } from "@/patterns/password-input"
import { RestrictedAction } from "@/patterns/restricted-action"
import { useScopeGuard } from "@/patterns/scope-guard"
import { SystemStatusIndicator } from "@/patterns/service-state"
import { SettingsLayout, SettingsNav } from "@/patterns/settings-layout"
import { useInstantSettings } from "@/patterns/setting-save"
import { SettingRow, SettingSaveStatus } from "@/patterns/setting-status"
import { SystemBanner } from "@/patterns/system-banner"
import { useConnectivity } from "@/patterns/system-status-hooks"
import { VerificationCodeInput } from "@/patterns/verification-code-input"
import { Switch } from "@/components/ui/switch"

// System & Account の Patterns の SSR と Hydration の検品用の画面。
// サーバーで描画するときは window、document、navigator がない。描画の結果は、サーバーとブラウザで同じでなければならない。
// 取得と疎通の確認は、サーバーでは行わない（効果の中で行う）。最初の描画では、権限は確定していない（許可しない）。

type P = "customers.view" | "customers.edit"
type Grants = { scope: string; permissions: P[]; features: string[] }

const tasks = [
  { id: "first-customer", title: "最初の顧客を登録する", permission: "customers.edit" as P, scope: "workspace" as const },
  { id: "complete-profile", title: "プロフィールの写真を設定する", scope: "account" as const },
  { id: "invite-members", title: "メンバーを招待する", scope: "workspace" as const },
]

export function SystemAccountSsrFixture() {
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [helpDismissed, setHelpDismissed] = useState(false)
  const guard = useScopeGuard("u-sato:hq")
  const access = useAccess<P, string, Grants>({
    scopeKey: "u-sato:hq",
    fetcher: () => new Promise<Grants>((resolve) => setTimeout(() => resolve({ scope: "u-sato:hq", permissions: ["customers.view"], features: [] }), 50)),
  })
  const edit = presentAction(decideAccess(access, { permissions: ["customers.edit"] }), { relevance: "task" })
  const connectivity = useConnectivity({ probe: () => Promise.resolve() })
  const settings = useInstantSettings({
    values: { digest: false },
    scopeKey: "u-sato",
    save: (_key, value) => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 50)),
  })
  const checklist = deriveChecklist({
    tasks,
    permissions: access.status === "ready" ? access.grants.permissions : [],
    audience: "creator",
    results: { account: ["complete-profile"], workspace: [] },
    visibility: "expanded",
  })
  return (
    <TooltipProvider>
      <main className="flex flex-col gap-12 p-6" data-testid="ssr-account">
        <h1 className="text-page-title">System & Account</h1>
        <p data-testid="ssr-access">{access.status}</p>
        <p data-testid="ssr-guard">{guard.scope}</p>
        <p data-testid="ssr-connectivity">{connectivity.status}</p>

        <AuthLayout variant="card" headingLevel={2} title="ログイン" logo={<span>Flow 営業管理</span>}>
          <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
            <AuthStatus>模擬のログインです。</AuthStatus>
            <AuthFormError error={null} />
            <label className="flex flex-col gap-2 text-ui">
              メールアドレス
              <Input type="email" autoComplete="username" />
            </label>
            <label className="flex flex-col gap-2 text-ui">
              パスワード
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} data-testid="ssr-password" />
            </label>
            <label className="flex flex-col gap-2 text-ui">
              確認コード
              <VerificationCodeInput value={code} onValueChange={setCode} data-testid="ssr-code" />
            </label>
          </form>
        </AuthLayout>

        <SettingsLayout
          view="detail"
          nav={<SettingsNav groups={[{ id: "personal", label: "個人の設定", items: [{ id: "display", label: "表示と言語", href: "#display" }] }]} currentId="display" onNavigate={() => undefined} />}
        >
          <SettingRow label="毎日のまとめ" description="未読のお知らせを 1 日 1 回まとめて送ります。">
            <Switch checked={settings.values.digest} onCheckedChange={(v) => settings.change("digest", v)} data-testid="ssr-digest" />
          </SettingRow>
          <SettingSaveStatus status={settings.statusOf("digest")} data-testid="ssr-digest-status" />
        </SettingsLayout>

        <GettingStartedChecklist checklist={checklist} onVisibilityChange={() => undefined} onOpenTask={() => undefined} actionLabel={(item) => `${item.title}へ`} />
        <ContextualHelp title="検索のヒント" dismissed={helpDismissed} onDismiss={() => setHelpDismissed(true)}>
          会社名の一部でも検索できます。
        </ContextualHelp>

        <RestrictedAction presentation={edit} reason={edit.mode === "disabled" ? "権限を確認しています" : undefined}>
          {(control) => (
            <Button {...control} data-testid="ssr-edit">
              顧客を編集
            </Button>
          )}
        </RestrictedAction>
        <AccessState kind="forbidden" headingLevel={2} />

        <SystemBanner issues={[{ id: "service:search", condition: "partial-outage", scope: "pages", title: "検索を利用できません", impact: "顧客の閲覧と編集は利用できます。" }]} />
        <SystemStatusIndicator condition="unknown" />
        <JobStatusList jobs={[{ id: "job-1", name: "顧客の書き出し", state: "running" }]}>
          <JobStatusItem name="顧客の書き出し" state="running" progress={null} />
        </JobStatusList>

        <NotificationButton count={null} hasUnread={true} display="dot" data-testid="ssr-notifications" />
      </main>
    </TooltipProvider>
  )
}
