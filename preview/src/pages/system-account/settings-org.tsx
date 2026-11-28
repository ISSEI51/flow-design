import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { createColumnHelper, useTable } from "@tanstack/react-table"

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTable, DataTableMessage, dataTableDefaults, dataTableFeatures, type DataTableFeatures } from "@/components/ui/data-table"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { resolveContentAccess } from "@/patterns/access"
import { useBrowseData } from "@/patterns/browse-data"
import { Section, SectionActions, SectionDescription, SectionHeader, SectionHeading, SectionTitle } from "@/patterns/section-layout"
import { planReset, resolveDependent, settingAccess } from "@/patterns/setting-resolve"
import { useSettingsForm } from "@/patterns/setting-save"
import { TableScrollArea } from "@/patterns/table-scroll-area"

import { DiscardAlert } from "../overlays/discard-alert"

import { plans, roles, type Language, type RoleId } from "../../data/system-account/model"
import { securityDefaults, type ChangeRecord, type Member, type OrgInfo, type OrgRecord, type SecurityPolicy } from "../../data/system-account/settings-server"
import {
  accessOf,
  allowedNow,
  can,
  FormFooter,
  pendingAccessText,
  unresolvedOf,
  languageLabels,
  permissionKey,
  SectionLoadError,
  SectionLoading,
  useOrgData,
  useSettingsFormUnsaved,
  workspaceName,
  actionError,
  ActionStatus,
  type ActionState,
  type SettingsSectionProps,
} from "./settings-parts"

// 組織の設定の画面の部品（製品側のコードの例）。模擬のサーバーの関数（api）と対象（scope）を props で受け取る。
// 閲覧（settings.org.view）と変更（settings.org.edit）を区別する。セキュリティのポリシーとワークスペースの削除は、
// 変更の権限がある利用者だけに示す（機密の設定）。

const noEditReason = "組織の設定を変更する権限がありません。変更が必要な場合は、管理者に依頼してください。"

/** 組織の設定：組織の情報、セキュリティのポリシー、ワークスペースの削除 */
export function OrgSettingsScreen(props: SettingsSectionProps) {
  const { scope } = props
  const org = useOrgData(scope, props.api)
  const canEdit = can(scope, "settings.org.edit")
  // 権限を失ったことを、フォームが閲覧だけに変わった後も示す（入力していた内容は保存されていない）
  const [lost, setLost] = useState<string | null>(null)
  const prev = useRef({ ws: scope.workspaceId, user: scope.userId, canEdit })
  useEffect(() => {
    const p = prev.current
    if (p.ws === scope.workspaceId && p.user === scope.userId && p.canEdit && !canEdit) {
      setLost("あなたのロールが変更されたため、組織の設定を変更できなくなりました。保存していない変更は反映されていません。")
    } else if (p.ws !== scope.workspaceId || p.user !== scope.userId || canEdit) {
      setLost(null)
    }
    prev.current = { ws: scope.workspaceId, user: scope.userId, canEdit }
  }, [scope.workspaceId, scope.userId, canEdit])

  // 組織の設定の値（組織名、ポリシー）は保護された情報。最新の権限を確認していない間は表示しない（whileUnverified の既定の hide）。
  // 入力中の内容を残すため、フォームはアンマウントせず、表示と操作の対象から外す（hidden と inert）
  const content = resolveContentAccess(accessOf(props), { view: ["settings.org.view"], edit: ["settings.org.edit"] })
  if (content.mode === "hidden" || !can(scope, "settings.org.view")) {
    return <p className="text-ui text-muted-foreground">組織の設定を閲覧する権限がありません。</p>
  }
  const pending = content.mode === "pending" ? content.status : null
  return (
    <div className="flex flex-col" data-testid="set-org" data-access={pending ?? "verified"}>
      {pending && (
        <p className="mb-12 text-ui text-muted-foreground" aria-busy={pending === "refreshing" || pending === "loading" || undefined} data-testid="set-org-pending">
          {pendingAccessText[pending]}
        </p>
      )}
      {/* 読み上げの領域は常に置き、中身だけを変える。空の間は高さ 0 */}
      <div role="status" className={lost ? "mb-12" : undefined} data-testid="set-org-permission-notice">
        {lost && (
          <Alert variant="warning">
            <AlertTitle>組織の設定を変更できなくなりました</AlertTitle>
            <AlertDescription>{lost}</AlertDescription>
          </Alert>
        )}
      </div>
      {org.status === "error" ? (
        <SectionLoadError title="組織の設定を取得できませんでした" onRetry={org.reload} />
      ) : !org.isCurrent ? (
        <SectionLoading rows={4} testId="set-org-loading" />
      ) : (
        <div className="flex flex-col gap-12" hidden={pending !== null} inert={pending !== null}>
          <OrgBody key={`${scope.workspaceId}:${scope.userId}:${permissionKey(scope)}`} {...props} record={org.data!} />
        </div>
      )}
    </div>
  )
}

function OrgBody(props: SettingsSectionProps & { record: OrgRecord }) {
  const { scope, record } = props
  const canEdit = can(scope, "settings.org.edit")
  const [history, setHistory] = useState(record.history)
  return (
    <>
      <OrgInfoForm {...props} initial={record.info} onSaved={setHistory} history={history} />
      {canEdit && <SecurityPolicyForm {...props} initial={record.security} plan={record.plan} onSaved={setHistory} history={history} />}
      {canEdit && <WorkspaceDeletion {...props} initialDeletion={record.deletion} />}
    </>
  )
}

function LastChange({ history, testId }: { history: ChangeRecord[]; testId: string }) {
  const last = history[0]
  if (!last) return null
  return (
    <p className="text-ui text-muted-foreground" data-testid={testId}>
      最終変更：{last.by}・{last.at}（{last.summary}）
    </p>
  )
}

// ---------------------------------------------------------------- 組織の情報（明示的な保存）
function OrgInfoForm(props: SettingsSectionProps & { initial: OrgInfo; onSaved: (h: ChangeRecord[]) => void; history: ChangeRecord[] }) {
  const { scope, api, onDirtyChange, onPermissionDenied, initial, onSaved, history } = props
  const access = settingAccess({
    canView: can(scope, "settings.org.view"),
    canEdit: can(scope, "settings.org.edit"),
    noPermissionReason: noEditReason,
    unresolved: unresolvedOf(accessOf(props)),
  })
  const form = useSettingsForm<OrgInfo>({
    values: initial,
    scopeKey: `${scope.workspaceId}:${scope.userId}:${permissionKey(scope)}`,
    // 変更の要求には、アンマウントで中止される signal を渡さない（中止してもサーバーで処理される場合があるため）
    save: (values) =>
      api.saveOrgInfo(scope.workspaceId, scope.userId, values).then((r) => {
        onSaved(r.history)
        return r.info
      }),
    verify: ({ signal }) => api.getOrg(scope.workspaceId, { signal }).then((o) => o.info),
    requireChanges: true,
    messages: { forbidden: "変更する権限がないため、保存できませんでした。最新の権限を確認しています。" },
    onSettled: (s) => s.state === "forbidden" && onPermissionDenied?.(),
  })
  const [showErrors, setShowErrors] = useState(false)
  const nameError = form.values.name.trim() === "" ? "組織名を入力してください" : null
  // 移動の確認の対象にする。「保存して移動」は、入力に誤りがなく、最新の権限で変更できる場合だけ示す
  useSettingsFormUnsaved({ unit: "org-info", label: "組織の情報", form, onDirtyChange, canSave: !nameError && access.editable, beforeSave: () => allowedNow(props, "settings.org.edit") })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    // 描画の時点の判断に加えて、送信の直前に commit した最新の権限で判断し直す（権限の変更の知らせと同じ処理の中の押下を含む）
    if (!access.editable || !allowedNow(props, "settings.org.edit")) return
    setShowErrors(true)
    if (!nameError) void form.submit()
  }
  return (
    <form onSubmit={submit} noValidate data-testid="set-org-info">
      <Section>
        <SectionHeader>
          <SectionHeading>
            <SectionTitle>組織の情報</SectionTitle>
            <SectionDescription>
              {workspaceName(scope)}のすべてのメンバーに適用されます。{access.editable ? "「組織の情報を保存」を押すまで反映されません。" : ""}
            </SectionDescription>
          </SectionHeading>
        </SectionHeader>
        <div className="flex max-w-[40rem] flex-col gap-8">
          {!access.editable && (
            <p className="text-ui" data-testid="set-org-info-readonly">
              {access.reason}
            </p>
          )}
          <FieldGroup>
            <Field invalid={showErrors && !!nameError} data-setting-id="org-name">
              <FieldLabel>組織名</FieldLabel>
              <Input value={form.values.name} readOnly={!access.editable} onChange={(e) => form.setValue("name", e.target.value)} data-testid="set-org-name" />
              {showErrors && nameError && <FieldError>{nameError}</FieldError>}
            </Field>
            <Field data-setting-id="org-language">
              <FieldLabel>組織の標準の表示言語</FieldLabel>
              <Select
                items={(["ja", "en"] as Language[]).map((l) => ({ value: l, label: languageLabels[l] }))}
                value={form.values.defaultLanguage}
                readOnly={!access.editable}
                onValueChange={(v) => v && form.setValue("defaultLanguage", v as Language)}
              >
                <SelectTrigger className="w-64 max-w-full" data-testid="set-org-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ja">日本語</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>個人の設定で表示言語を選んでいないメンバーに使われます。</FieldDescription>
            </Field>
          </FieldGroup>
          <LastChange history={history} testId="set-org-last-change" />
          {access.editable && <FormFooter form={form} saveLabel="組織の情報を保存" testId="set-org-info" />}
        </div>
      </Section>
    </form>
  )
}

// ---------------------------------------------------------------- セキュリティのポリシー（明示的な保存、確認、標準に戻す）
const policyLabels: Record<keyof SecurityPolicy, string> = {
  requireMfa: "多要素認証を必須にする",
  requireSso: "組織の SSO を必須にする",
  allowSocialLogin: "外部アカウント（Google、Microsoft）でのログインを許可する",
}
const onOff = (v: unknown) => (v ? "オン" : "オフ")

function SecurityPolicyForm(props: SettingsSectionProps & { initial: SecurityPolicy; plan: OrgRecord["plan"]; onSaved: (h: ChangeRecord[]) => void; history: ChangeRecord[] }) {
  const { scope, api, onDirtyChange, onPermissionDenied, initial, plan, onSaved, history } = props
  const form = useSettingsForm<SecurityPolicy>({
    values: initial,
    scopeKey: `${scope.workspaceId}:${scope.userId}:${permissionKey(scope)}`,
    save: (values) =>
      api.saveSecurity(scope.workspaceId, scope.userId, values).then((r) => {
        onSaved(r.history)
        return r.security
      }),
    verify: ({ signal }) => api.getOrg(scope.workspaceId, { signal }).then((o) => o.security),
    requireChanges: true,
    messages: { forbidden: "変更する権限がないため、保存できませんでした。最新の権限を確認しています。" },
    onSettled: (s) => s.state === "forbidden" && onPermissionDenied?.(),
  })
  const [confirm, setConfirm] = useState<null | "save" | "reset">(null)
  const ssoAccess = settingAccess({
    canView: true,
    canEdit: true,
    planReason: plan === "business" ? null : `${plans[plan].name}プランでは使えません。${plans.business.name}プランで使えます。`,
  })
  const social = resolveDependent({
    parentEnabled: !form.values.requireSso,
    value: form.values.allowSocialLogin,
    inactiveReason: "SSO が必須の間は使われません。設定は保持しています。",
  })
  // 影響の大きい変更：全員のログインの方法が変わる
  const tightened = (Object.keys(policyLabels) as (keyof SecurityPolicy)[]).filter(
    (k) => k !== "allowSocialLogin" && form.values[k] && !form.saved[k]
  )
  const resetPlan = planReset(form.saved, securityDefaults, ["requireMfa", "requireSso", "allowSocialLogin"])
  // 移動の確認の対象にする。全員のログインの方法を厳しくする変更は、確認の Dialog を省かないため「保存して移動」を示さない
  useSettingsFormUnsaved({
    unit: "org-security",
    label: "セキュリティのポリシー",
    form,
    onDirtyChange,
    canSave: tightened.length === 0 && unresolvedOf(accessOf(props)) === null,
    beforeSave: () => allowedNow(props, "settings.org.edit"),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (form.saving || !form.dirty) return
    // 最新の権限を確認していない間は、確認の Dialog も開かない（送信の直前の判断と同じ）
    if (!allowedNow(props, "settings.org.edit")) return
    if (tightened.length > 0) setConfirm("save")
    else form.submit()
  }
  const check = (key: keyof SecurityPolicy, description: string, disabled = false) => (
    <Field orientation="horizontal" data-setting-id={key === "requireMfa" ? "require-mfa" : key === "requireSso" ? "require-sso" : "allow-social"}>
      <Checkbox
        checked={form.values[key]}
        disabled={disabled}
        onCheckedChange={(v) => form.setValue(key, v === true)}
        data-testid={`set-policy-${key}`}
      />
      <FieldContent>
        <FieldLabel>{policyLabels[key]}</FieldLabel>
        <FieldDescription className="[word-break:auto-phrase]">{description}</FieldDescription>
      </FieldContent>
    </Field>
  )
  return (
    <form onSubmit={submit} noValidate data-testid="set-org-security">
      <Section>
        <SectionHeader>
          <SectionHeading>
            <SectionTitle>セキュリティのポリシー</SectionTitle>
            <SectionDescription>すべてのメンバーのログインに適用され、個人の設定より優先されます。「ポリシーを保存」を押すまで反映されません。</SectionDescription>
          </SectionHeading>
          <SectionActions>
            <Button type="button" variant="outline" size="sm" disabled={resetPlan.changes.length === 0 || form.saving} onClick={() => setConfirm("reset")} data-testid="set-policy-reset">
              標準のポリシーに戻す
            </Button>
          </SectionActions>
        </SectionHeader>
        <div className="flex max-w-[40rem] flex-col gap-8">
          <FieldGroup className="gap-2">
            {check("requireMfa", "ログインのときに、すべてのメンバーに 2 段階認証を求めます。個人の設定では無効にできません。")}
            {check("requireSso", ssoAccess.reason ?? "組織の ID プロバイダーでのログインだけを許可します。", !ssoAccess.editable && !form.values.requireSso)}
            {check("allowSocialLogin", social.active ? "メンバーが個人の設定で Google アカウントを接続できます。" : (social.inactiveReason ?? ""))}
          </FieldGroup>
          <FormFooter form={form} saveLabel="ポリシーを保存" testId="set-policy" />
          <div className="flex flex-col gap-2">
            <p className="text-ui font-medium">変更の履歴</p>
            <ol className="flex flex-col gap-1 text-ui text-muted-foreground" data-testid="set-policy-history">
              {history.slice(0, 5).map((h) => (
                <li key={h.id}>
                  {h.at}　{h.by}：{h.summary}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent data-testid="set-policy-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "reset" ? "セキュリティのポリシーを標準に戻しますか？" : "セキュリティのポリシーを変更しますか？"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reset"
                ? `${resetPlan.changes.map((c) => `${policyLabels[c.key]}：${onOff(c.from)} → ${onOff(c.to)}`).join("、")}。${workspaceName(scope)}のすべてのメンバーに、すぐに適用されます。${form.dirty ? "保存していない変更は破棄されます。" : ""}`
                : `${tightened.map((k) => policyLabels[k]).join("、")}。${workspaceName(scope)}のすべてのメンバーは、次のログインから新しいポリシーに従う必要があります。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const kind = confirm
                setConfirm(null)
                // Dialog を開いている間に権限が変わった場合は送らない
                if (!allowedNow(props, "settings.org.edit")) return
                if (kind === "reset") form.submit({ ...form.saved, ...Object.fromEntries(resetPlan.changes.map((c) => [c.key, c.to])) })
                else form.submit()
              }}
              data-testid="set-policy-confirm-action"
            >
              {confirm === "reset" ? "標準に戻す" : "変更を保存"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

// ---------------------------------------------------------------- ワークスペースの削除（通常の設定から分ける）
function WorkspaceDeletion(props: SettingsSectionProps & { initialDeletion: OrgRecord["deletion"] }) {
  const { scope, api, initialDeletion } = props
  const name = workspaceName(scope)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scheduledOn, setScheduledOn] = useState(initialDeletion?.scheduledOn ?? null)
  const [action, setAction] = useState<ActionState>({ kind: "idle" })
  const run = (schedule: boolean) => {
    // 確定の直前に、commit した最新の権限で判断し直す（確認の Dialog を開いている間の権限の変更を含む）
    if (!allowedNow(props, "settings.org.edit")) {
      setError("最新の権限を確認できるまで、削除の予約と取り消しはできません。")
      return
    }
    setBusy(true)
    setError(null)
    setAction({ kind: "busy" })
    api.scheduleWorkspaceDeletion(scope.workspaceId, scope.userId, schedule).then(
      (r) => {
        setBusy(false)
        setOpen(false)
        setTyped("")
        setScheduledOn(r?.scheduledOn ?? null)
        setAction({ kind: "idle" })
      },
      (e: Error) => {
        setBusy(false)
        const state = actionError(e, schedule ? "削除を予約できたかを確認できませんでした。" : "削除を取り消せたかを確認できませんでした。", "")
        if (state.kind === "unknown") {
          // 処理されたかがわからない。予約した・していないと判断せず、確認させる
          setOpen(false)
          setTyped("")
          setAction(state)
        } else if (open) {
          setError(e.message)
          setAction({ kind: "idle" })
        } else setAction({ kind: "failed", text: `削除を取り消せませんでした：${e.message}` })
      }
    )
  }
  const verify = () => {
    setAction({ kind: "busy" })
    api.getOrg(scope.workspaceId).then(
      (o) => {
        setScheduledOn(o.deletion?.scheduledOn ?? null)
        setAction({ kind: "done", text: o.deletion ? "削除は予約されています。" : "削除は予約されていません。" })
      },
      () => setAction({ kind: "unknown", text: "確認できませんでした。もう一度確認してください。" })
    )
  }
  return (
    <Section divider data-testid="set-ws-delete" data-setting-id="workspace-delete">
      <SectionHeader>
        <SectionHeading>
          <SectionTitle>ワークスペースの削除</SectionTitle>
          <SectionDescription>{name}の顧客、商談、設定をすべて削除し、メンバーは利用できなくなります。削除を予約してから 30 日間は取り消せます。</SectionDescription>
        </SectionHeading>
      </SectionHeader>
      <div className="flex flex-col gap-3">
        <p role="status" className="text-ui empty:hidden" data-testid="set-ws-delete-status">
          {scheduledOn && action.kind !== "unknown" ? `${scheduledOn.replace(/-/g, "/")} に削除されます。それまでは取り消せます。` : ""}
        </p>
        <ActionStatus state={action} onVerify={verify} testId="set-ws-delete-result" />
        <div>
          {action.kind === "unknown" ? null : scheduledOn ? (
            <Button variant="outline" loading={busy} onClick={() => run(false)} data-testid="set-ws-delete-cancel">
              ワークスペースの削除を取り消す
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setOpen(true)} data-testid="set-ws-delete-open">
              ワークスペースを削除
            </Button>
          )}
        </div>
      </div>
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return
          setOpen(o)
          if (!o) {
            setTyped("")
            setError(null)
          }
        }}
      >
        <AlertDialogContent data-testid="set-ws-delete-dialog">
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              if (typed.trim() === name) run(true)
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{name}を削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>すべてのメンバーが利用できなくなります。30 日後に、データをすべて削除します。</AlertDialogDescription>
            </AlertDialogHeader>
            <Field invalid={!!error}>
              <FieldLabel>確認のため、ワークスペースの名前「{name}」を入力してください</FieldLabel>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="set-ws-delete-input" />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction type="submit" variant="destructive" loading={busy} disabled={typed.trim() !== name} data-testid="set-ws-delete-confirm">
                ワークスペースを削除
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}

// ---------------------------------------------------------------- メンバー（Data Table。別のカテゴリのページ）
const helper = createColumnHelper<DataTableFeatures, Member>()
const memberColumns = helper.columns([
  helper.accessor("name", {
    header: "名前",
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">（招待中）</span>,
    meta: { label: "名前" },
    size: 160,
  }),
  helper.accessor("email", { header: "メールアドレス", meta: { label: "メールアドレス" }, size: 240 }),
  helper.accessor("role", { header: "ロール", cell: ({ getValue }) => roles[getValue()].name, meta: { label: "ロール", cellClassName: "whitespace-nowrap" }, size: 120 }),
  helper.accessor("status", {
    header: "状態",
    cell: ({ getValue }) => (getValue() === "invited" ? "招待中" : "参加中"),
    meta: { label: "状態", cellClassName: "whitespace-nowrap" },
    size: 100,
  }),
])

export function MembersScreen(props: SettingsSectionProps) {
  const { scope, api, onPermissionDenied } = props
  // メンバーの一覧は保護された情報。最新の権限を確認していない間は表示せず、招待も始めない
  const content = resolveContentAccess(accessOf(props), { view: ["members.view"], edit: ["members.manage"] })
  const pending = content.mode === "pending" ? content.status : null
  const canManage = can(scope, "members.manage") && pending === null
  const scopeKey = `${scope.workspaceId}:${scope.userId}:${permissionKey(scope)}`
  const members = useBrowseData({
    query: scope.workspaceId,
    fetcher: (ws, { signal }) => api.listMembers(ws, scope.userId, { signal }),
    scopeKey,
    keepPreviousData: false,
  })
  const rows = useMemo(() => members.data ?? [], [members.data])
  const table = useTable({ ...dataTableDefaults, features: dataTableFeatures, columns: memberColumns, data: rows, getRowId: (r) => r.userId })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [note, setNote] = useState("")
  if (!can(scope, "members.view") || content.mode === "hidden") return <p className="text-ui text-muted-foreground">メンバーの一覧を閲覧する権限がありません。</p>
  if (pending)
    return (
      <p className="text-ui text-muted-foreground" data-testid="set-members-pending">
        {pendingAccessText[pending]}
      </p>
    )
  return (
    <Section data-testid="set-members">
      <SectionHeader>
        <SectionHeading>
          <SectionTitle>メンバーの一覧</SectionTitle>
          <SectionDescription>
            {workspaceName(scope)}のメンバー。{canManage ? "招待のメールは模擬の処理で、送信しません。" : "メンバーの招待とロールの変更は、管理者が行います。"}
          </SectionDescription>
        </SectionHeading>
        {canManage && (
          <SectionActions>
            <Button variant="secondary" onClick={() => setInviteOpen(true)} data-testid="set-invite-open" data-setting-id="invite">
              メンバーを招待
            </Button>
          </SectionActions>
        )}
      </SectionHeader>
      <p role="status" className="text-ui text-muted-foreground empty:hidden" data-testid="set-members-status">
        {note}
      </p>
      <div data-setting-id="members">
        <TableScrollArea>
          <DataTable
            table={table}
            caption={`${workspaceName(scope)}のメンバー`}
            status={members.status === "idle" ? "loading" : members.status}
            loadingRowCount={4}
            empty={<DataTableMessage title="メンバーはいません" />}
            error={
              <DataTableMessage
                status="error"
                title="メンバーの一覧を取得できませんでした"
                description="サーバーに接続できませんでした（模擬）。"
                action={
                  <Button variant="outline" size="sm" onClick={members.reload}>
                    再試行
                  </Button>
                }
              />
            }
          />
        </TableScrollArea>
      </div>
      {canManage && (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onInvite={(email, role) =>
            !allowedNow(props, "members.manage")
              ? Promise.reject(new Error("最新の権限を確認できるまで、招待できません。"))
              : api.invite(scope.workspaceId, scope.userId, email, role).then(
              (m) => {
                // 招待を始めたときのスコープの一覧にだけ加える（ワークスペースを切り替えた後に届いた応答を反映しない）
                members.setData((d) => [...d, m], { scopeKey })
                setNote(`${email} を${roles[role].name}として招待しました（模擬：メールは送信していません）。`)
              },
              (e: { code?: string; message: string; outcome?: string }) => {
                if (e.code === "forbidden") onPermissionDenied?.()
                if (e.outcome === "unknown") {
                  // 招待できたかがわからない。一覧を取得し直して、招待中かどうかを示す（同じ招待を重ねて送らせない）
                  setNote(`${email} を招待できたかを確認できませんでした。一覧を取得し直しています。`)
                  members.reload()
                  return
                }
                throw e
              }
            )
          }
        />
      )}
    </Section>
  )
}

function InviteDialog({ open, onOpenChange, onInvite }: { open: boolean; onOpenChange: (o: boolean) => void; onInvite: (email: string, role: RoleId) => Promise<void> }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<RoleId>("member")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discard, setDiscard] = useState(false)
  const dirty = email !== "" || role !== "member"
  const close = () => {
    setEmail("")
    setRole("member")
    setError(null)
    onOpenChange(false)
  }
  const emailError = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? null : "メールアドレスを入力してください（例：taro.yamada@example.com）"
  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : !busy && close())} unsavedChanges={dirty} onDiscardRequest={() => !busy && setDiscard(true)}>
        <DialogContent size="sm" data-testid="set-invite-dialog">
          <form
            className="contents"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (busy) return
              if (emailError) {
                setError(emailError)
                return
              }
              setBusy(true)
              setError(null)
              onInvite(email.trim(), role).then(
                () => {
                  setBusy(false)
                  close()
                },
                (err: Error) => {
                  setBusy(false)
                  setError(err.message)
                }
              )
            }}
          >
            <DialogHeader>
              <DialogTitle>メンバーを招待</DialogTitle>
              <DialogDescription>招待されたメンバーは、メールのリンクから参加します（模擬）。</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <FieldGroup>
                <Field invalid={!!error}>
                  <FieldLabel>メールアドレス</FieldLabel>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" data-testid="set-invite-email" />
                  {error && <FieldError>{error}</FieldError>}
                </Field>
                <Field>
                  <FieldLabel>ロール</FieldLabel>
                  <Select items={(Object.keys(roles) as RoleId[]).map((r) => ({ value: r, label: roles[r].name }))} value={role} onValueChange={(v) => v && setRole(v as RoleId)}>
                    <SelectTrigger data-testid="set-invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(roles) as RoleId[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {roles[r].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>{roles[role].description}</FieldDescription>
                </Field>
              </FieldGroup>
            </DialogBody>
            <DialogFooter showCloseButton closeLabel="キャンセル">
              <Button type="submit" loading={busy} data-testid="set-invite-submit">
                招待する
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardAlert
        open={discard}
        onOpenChange={setDiscard}
        onDiscard={() => {
          setDiscard(false)
          close()
        }}
      />
    </>
  )
}

