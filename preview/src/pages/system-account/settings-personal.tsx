import { useState, type FormEvent } from "react"

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
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Section, SectionDescription, SectionHeader, SectionHeading, SectionTitle } from "@/patterns/section-layout"
import { applyReset, planReset, resolveDependent, resolveSetting } from "@/patterns/setting-resolve"
import { partialSaveResult, useInstantSettings, useSettingsForm, withVersion } from "@/patterns/setting-save"
import { SettingRow, SettingSaveStatus } from "@/patterns/setting-status"
import { useScopeGuard } from "@/patterns/scope-guard"
import { cn } from "@/lib/utils"

import { demoPassword, mandatoryNotifications, notificationTypeLabels, channelLabels, users, type Language, type Theme } from "../../data/system-account/model"
import { MockRequestError } from "../../data/system-account/mock"
import { displayDefaults, type DisplayValues, type InstantKey, type PersonalRecord, type Profile } from "../../data/system-account/settings-server"
import {
  FormFooter,
  hours,
  languageLabels,
  SectionLoadError,
  SectionLoading,
  timezones,
  useOrgData,
  usePersonalData,
  useReportDirty,
  userName,
  workspaceName,
  actionError,
  ActionStatus,
  type ActionState,
  type SettingsSectionProps,
} from "./settings-parts"

// 個人の設定の画面の部品（製品側のコードの例）。模擬のサーバーの関数（api）と対象（scope）を props で受け取る。

type InstantApi = ReturnType<typeof useInstantSettings<DisplayValues>>

function useDisplaySettings({ scope, api, record, onPermissionDenied, saveContract = "ordered" }: SettingsSectionProps & { record: PersonalRecord }) {
  const versioned = saveContract === "versioned"
  return useInstantSettings<DisplayValues>({
    values: record.display,
    scopeKey: scope.userId,
    // 版の照合：取得した版を渡すと、項目ごとに保存を直列にし、ifMatch に最後に確認できた版を渡す（模擬のサーバーの versioned）
    versions: versioned ? (record.displayVersions ?? {}) : undefined,
    // 変更の要求には、画面の移動やアンマウントで中止される signal を渡さない（中止してもサーバーで処理される場合があり、
    // 画面を移っただけで変更が失われることがないようにする）。結果の反映は hook が、開始したスコープと最新の要求に限る
    save: (key, value, { ifMatch }) =>
      versioned
        ? api.saveDisplayVersioned(scope.userId, key, value, { ifMatch: ifMatch as number | undefined }).then((r) => withVersion(r.value, r.version))
        : api.saveDisplay(scope.userId, key, value),
    verify: (key, { signal }) =>
      api.getPersonal(scope.userId, { signal }).then((p) => (versioned ? withVersion(p.display[key], p.displayVersions?.[key] ?? 0) : p.display[key])),
    // 権限不足は、前の保存の結果が不明なため結果の不明として示す場合（cause が forbidden）も、権限を取り直す
    onSettled: (_key, status) => (status.state === "forbidden" || (status.state === "unknown" && status.cause === "forbidden")) && onPermissionDenied?.(),
  })
}

const status = (s: InstantApi, key: InstantKey, testId: string) => (
  <SettingSaveStatus status={s.statusOf(key)} onVerify={() => s.verify(key)} data-testid={testId} />
)

/** 標準の設定へ戻す要求（一括）の応答を、項目ごとの結果にする（拒否された項目と、応答に含まれない項目を区別する） */
function toPartial(keys: InstantKey[], r: { values: Partial<DisplayValues>; versions: Record<InstantKey, number>; rejected: Partial<Record<InstantKey, { code: string; message: string }>> }, versioned: boolean) {
  const saved: { [K in InstantKey]?: DisplayValues[K] | ReturnType<typeof withVersion<DisplayValues[K]>> } = {}
  const errors: { [K in InstantKey]?: unknown } = {}
  for (const k of keys) {
    const rejected = r.rejected[k]
    if (rejected) errors[k] = new MockRequestError(rejected.message, rejected.code)
    else if (k in r.values) (saved as Record<string, unknown>)[k] = versioned ? withVersion(r.values[k], r.versions[k]) : r.values[k]
  }
  return partialSaveResult<DisplayValues>(saved, errors)
}

// ---------------------------------------------------------------- 表示と言語（即時保存）
const themes: { value: Theme; label: string }[] = [
  { value: "system", label: "端末に合わせる" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
]

// テーマの見本（装飾ではなく、選択肢の内容を示す図）。
function ThemeSample({ theme }: { theme: Theme }) {
  const pane = (dark: boolean) => (
    <span className={cn("flex flex-1 flex-col gap-1.5 p-2", dark ? "bg-primary" : "bg-background")}>
      <span className={cn("h-1.5 w-3/4 rounded-full", dark ? "bg-primary-foreground/70" : "bg-border-strong")} />
      <span className={cn("h-1.5 w-1/2 rounded-full", dark ? "bg-primary-foreground/40" : "bg-border")} />
    </span>
  )
  return (
    <span aria-hidden="true" className="flex h-14 overflow-hidden rounded-sm border border-border">
      {theme === "system" ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : (
        pane(theme === "dark")
      )}
    </span>
  )
}

export function DisplaySettingsSection(props: SettingsSectionProps) {
  const personal = usePersonalData(props.scope, props.api)
  const org = useOrgData(props.scope, props.api)
  if (personal.status === "error") return <SectionLoadError title="表示の設定を取得できませんでした" onRetry={personal.reload} />
  if (!personal.isCurrent || !(org.isCurrent || org.status === "error")) return <SectionLoading rows={3} testId="set-display-loading" />
  return (
    <DisplayForm
      key={`${props.scope.userId}:${props.saveContract ?? "ordered"}`}
      {...props}
      record={personal.data!}
      // 組織の設定を取得できない場合は、製品の標準値を使う（個人の設定の変更は止めない）
      orgLanguage={org.isCurrent ? org.data!.info.defaultLanguage : undefined}
    />
  )
}

function DisplayForm(props: SettingsSectionProps & { record: PersonalRecord; orgLanguage: Language | undefined }) {
  const { scope, api, orgLanguage, saveContract } = props
  const s = useDisplaySettings(props)
  const [density, setDensity] = useState<"standard" | "compact">("standard")
  const [resetNote, setResetNote] = useState("")
  const [resetting, setResetting] = useState(false)
  const [reloadNote, setReloadNote] = useState("")
  // サーバーの設定の取得し直し（最後に始めた取得だけを反映する）。DisplayForm は利用者と保存の方式ごとに作り直す
  const reloadGuard = useScopeGuard(props.scope.userId)
  const language = resolveSetting<Language>({ productDefault: "ja", orgDefault: orgLanguage, userValue: s.values.language ?? undefined })
  const orgDefaultLabel = `${orgLanguage ? "組織" : "製品"}の標準（${languageLabels[language.inherited.value]}）`
  const resetKeys = ["theme", "language", "timezone"] as const
  const plan = planReset(s.values, displayDefaults, resetKeys)
  const saving = resetKeys.some((k) => s.statusOf(k).state === "saving")
  // 結果が不明か競合の項目がある間は、標準に戻す要求を送らない（確認してから戻す）
  const unresolved = resetKeys.filter((k) => !s.canChange(k))

  const reset = () => {
    if (resetting || plan.changes.length === 0) return
    setResetting(true)
    setResetNote("標準の設定に戻しています…")
    const next = applyReset(s.values, plan)
    const changed = Object.fromEntries(plan.changes.map((c) => [c.key, next[c.key]])) as Partial<DisplayValues>
    const names = plan.changes.map((c) => resetLabels[c.key as (typeof resetKeys)[number]]).join("、")
    // 項目ごとの保存と同じ規則で反映する。戻している間に利用者が変えた項目には、この応答を反映しない
    const versioned = saveContract === "versioned"
    s.changeMany(changed, (values, { ifMatch }) =>
      api
        .saveDisplayBatch(scope.userId, values, { ifMatch: ifMatch as Partial<Record<InstantKey, number>> })
        .then((r) => toPartial(Object.keys(values) as InstantKey[], r, versioned))
    ).then((outcome) => {
      setResetting(false)
      if (outcome === "aborted") return
      setResetNote(
        outcome === "saved"
          ? `${names}を標準に戻しました。`
          : outcome === "superseded"
            ? `${names}を標準に戻しました。戻している間に変えた項目は、変えた値を保存しています。`
            : outcome === "partial"
              ? "一部の項目だけを標準に戻しました。項目ごとの状態を確かめてください。"
              : outcome === "unknown"
                ? "標準の設定に戻せたかを確認できませんでした。各項目の「確認する」で確かめてください。"
                : outcome === "blocked"
                  ? "保存できたかを確認していない項目があるため、標準に戻していません。先に「確認する」で確かめてください。"
                  : outcome === "conflict"
                    ? "ほかの場所で変更されていたため、標準に戻していません。各項目の「確認する」で、現在の設定を確かめてください。"
                    : outcome === "forbidden"
                      ? "変更する権限がないため、標準の設定に戻せませんでした。設定は変わっていません。"
                      : "標準の設定に戻せませんでした。設定は変わっていません。"
      )
    })
  }

  // サーバーの値を取得し直して反映する（replace）。保存中の要求の応答は、この後に届いても、表示と最後に確認できた値を上書きしない。
  // 取得の後に呼ぶ replace は、取得を始めた時点の描画の関数。スコープが変わっていれば、hook が何もせずに false を返す
  // 取得を続けて押した場合は、最後に始めた取得の応答だけを反映する（応答の順が入れ替わっても、古い取得の値で上書きしない）。
  // 取得を始めた後に送った保存の結果より新しい値であることは、製品の API が保証する（版の照合、または保存の後に取得し直す）。
  const reload = () => {
    const ticket = reloadGuard.begin("reload")
    setReloadNote("サーバーの設定を取得しています…")
    const versioned = saveContract === "versioned"
    api.getPersonal(scope.userId).then(
      (p) => {
        const latest = reloadGuard.isLatest(ticket)
        reloadGuard.release(ticket)
        if (!latest) return
        const values = Object.fromEntries(resetKeys.map((k) => [k, p.display[k]])) as Partial<DisplayValues>
        const versions = versioned ? Object.fromEntries(resetKeys.map((k) => [k, p.displayVersions?.[k] ?? 0])) : undefined
        if (s.replace(values, versions)) setReloadNote("サーバーに保存されている設定を表示しています。")
      },
      () => {
        const latest = reloadGuard.isLatest(ticket)
        reloadGuard.release(ticket)
        if (latest) setReloadNote("サーバーの設定を取得できませんでした。")
      }
    )
  }

  return (
    <div className="flex flex-col gap-12" data-testid="set-display">
      <Section>
        <SectionHeader>
          <SectionHeading>
            <SectionTitle>表示</SectionTitle>
            <SectionDescription>変更すると、すぐに保存します。{userName(scope)}さんのアカウントだけに適用されます。</SectionDescription>
          </SectionHeading>
        </SectionHeader>
        <div className="flex flex-col gap-6">
          <FieldSet data-setting-id="theme">
            <FieldLegend variant="label">テーマ</FieldLegend>
            <p className="text-ui text-muted-foreground">Flow Design v0.1 にはダークモードの値がないため、この例では保存だけを行い、表示は変わりません。</p>
            <div className="@container/theme max-w-lg">
            <RadioGroup
              value={s.values.theme}
              readOnly={!s.canChange("theme")}
              onValueChange={(v) => s.change("theme", v as Theme)}
              className="grid grid-cols-1 gap-3 @sm/theme:grid-cols-3"
              data-testid="set-theme"
            >
              {themes.map((t) => (
                <label
                  key={t.value}
                  className="flex min-w-0 cursor-pointer flex-col gap-3 rounded-md border border-input p-3 has-data-checked:border-primary has-[:focus-visible]:focus-ring"
                >
                  <ThemeSample theme={t.value} />
                  <span className="flex min-h-6 items-center gap-2 text-ui">
                    <RadioGroupItem value={t.value} className="focus-visible:outline-none" />
                    {t.label}
                  </span>
                </label>
              ))}
            </RadioGroup>
            </div>
            {status(s, "theme", "set-theme-status")}
          </FieldSet>

          <SettingRow
            data-setting-id="language"
            label="表示言語"
            description={
              language.source === "user"
                ? `あなたが選んだ言語を使っています。${orgLanguage ? "組織" : "製品"}の標準は${languageLabels[language.inherited.value]}です。`
                : orgLanguage
                  ? `組織（${workspaceName(scope)}）の標準の言語を使っています。`
                  : "製品の標準の言語を使っています。"
            }
            status={status(s, "language", "set-language-status")}
          >
            <Select
              items={[{ value: "inherit", label: orgDefaultLabel }, ...(["ja", "en"] as Language[]).map((l) => ({ value: l, label: languageLabels[l] }))]}
              value={s.values.language ?? "inherit"}
              readOnly={!s.canChange("language")}
              onValueChange={(v) => s.change("language", v === "inherit" || v == null ? null : (v as Language))}
            >
              <SelectTrigger className="w-64 max-w-full" data-testid="set-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">{orgDefaultLabel}</SelectItem>
                <SelectItem value="ja">日本語</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow data-setting-id="timezone" label="タイムゾーン" description="予定と通知の時刻の表示に使います。" status={status(s, "timezone", "set-timezone-status")}>
            <Select items={timezones} value={s.values.timezone} readOnly={!s.canChange("timezone")} onValueChange={(v) => v && s.change("timezone", String(v))}>
              <SelectTrigger className="w-64 max-w-full" data-testid="set-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <div className="flex flex-col gap-2" data-testid="set-display-reset" data-resetting={resetting || undefined}>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={reset} loading={resetting} disabled={plan.changes.length === 0 || saving || unresolved.length > 0} data-testid="set-display-reset-button">
                表示の設定を標準に戻す
              </Button>
            </div>
            <p className="text-ui text-muted-foreground">
              {unresolved.length > 0
                ? `${unresolved.map((k) => resetLabels[k]).join("、")}の保存の結果を確認するまで、標準に戻せません。`
                : plan.changes.length === 0
                ? "テーマ、表示言語、タイムゾーンは標準の設定です。"
                : `${plan.changes.map((c) => resetLabels[c.key as (typeof resetKeys)[number]]).join("、")}を標準に戻します。プロフィール、通知、セキュリティの設定は変わりません。`}
            </p>
            <p role="status" className="text-ui text-muted-foreground" data-testid="set-display-reset-status">
              {resetNote}
            </p>
          </div>

          <div className="flex flex-col gap-2" data-testid="set-display-reload">
            <div>
              <Button variant="outline" onClick={reload} data-testid="set-display-reload-button">
                サーバーの設定を取得し直す
              </Button>
            </div>
            <p className="text-ui text-muted-foreground">ほかの端末で変更した場合に、テーマ、表示言語、タイムゾーンの保存されている値を表示します。</p>
            <p role="status" className="text-ui text-muted-foreground" data-testid="set-display-reload-status">
              {reloadNote}
            </p>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader>
          <SectionHeading>
            <SectionTitle>この端末だけの設定</SectionTitle>
            <SectionDescription>この端末のブラウザに保存し、ほかの端末とアカウントの設定には影響しません（この例では保存せず、再読み込みで元に戻ります）。</SectionDescription>
          </SectionHeading>
        </SectionHeader>
        <SettingRow data-setting-id="density" label="表の行の高さ" description={density === "compact" ? "行を 40px にして、多くの行を表示します。" : "行を 48px にします。"}>
          <Select
            items={[
              { value: "standard", label: "標準" },
              { value: "compact", label: "コンパクト" },
            ]}
            value={density}
            onValueChange={(v) => setDensity(v === "compact" ? "compact" : "standard")}
          >
            <SelectTrigger className="w-40 max-w-full" data-testid="set-density">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">標準</SelectItem>
              <SelectItem value="compact">コンパクト</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </Section>
    </div>
  )
}

const resetLabels = { theme: "テーマ", language: "表示言語", timezone: "タイムゾーン" } as const

// ---------------------------------------------------------------- 通知を止める時間帯（即時保存、親と子の設定）
export function QuietHoursSection(props: SettingsSectionProps) {
  const personal = usePersonalData(props.scope, props.api)
  if (personal.status === "error") return <SectionLoadError title="通知の設定を取得できませんでした" onRetry={personal.reload} />
  if (!personal.isCurrent) return <SectionLoading rows={2} testId="set-quiet-loading" />
  return <QuietHoursForm key={`${props.scope.userId}:${props.saveContract ?? "ordered"}`} {...props} record={personal.data!} />
}

function QuietHoursForm(props: SettingsSectionProps & { record: PersonalRecord }) {
  const s = useDisplaySettings(props)
  const child = resolveDependent({
    parentEnabled: s.values.quietEnabled,
    value: { start: s.values.quietStart, end: s.values.quietEnd },
    inactiveReason: "「通知を止める時間帯」がオフのため、この時刻は使われていません。値は保持しています。",
  })
  const mandatory = mandatoryNotifications.map((m) => `${notificationTypeLabels[m.type].replace(/（.*）/, "")}（${channelLabels[m.channel]}）`)
  const hourSelect = (key: "quietStart" | "quietEnd", testId: string) => (
    <Select items={hours} value={s.values[key]} readOnly={!s.canChange(key)} onValueChange={(v) => v && s.change(key, String(v))}>
      <SelectTrigger className="w-32" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {hours.map((h) => (
          <SelectItem key={h.value} value={h.value}>
            {h.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
  return (
    <Section data-testid="set-quiet">
      <SectionHeader>
        <SectionHeading>
          <SectionTitle>通知を止める時間帯</SectionTitle>
          <SectionDescription>変更すると、すぐに保存します。</SectionDescription>
        </SectionHeading>
      </SectionHeader>
      <div className="flex flex-col gap-6">
        <SettingRow
          data-setting-id="quiet"
          layout="inline"
          label="指定した時間帯は、プッシュ通知とメールを送らない"
          description={`${mandatory.join("、")}は、組織のポリシーで必須のため、この時間帯にも届きます。`}
          status={status(s, "quietEnabled", "set-quiet-status")}
        >
          <Switch checked={s.values.quietEnabled} readOnly={!s.canChange("quietEnabled")} onCheckedChange={(v) => s.change("quietEnabled", v)} data-testid="set-quiet-switch" />
        </SettingRow>
        <div className="flex flex-col gap-6 border-s border-border ps-4" data-testid="set-quiet-children" data-active={child.active || undefined}>
          <SettingRow
            label="開始"
            description={child.active ? undefined : child.inactiveReason}
            status={status(s, "quietStart", "set-quiet-start-status")}
          >
            {hourSelect("quietStart", "set-quiet-start")}
          </SettingRow>
          <SettingRow label="終了" status={status(s, "quietEnd", "set-quiet-end-status")}>
            {hourSelect("quietEnd", "set-quiet-end")}
          </SettingRow>
        </div>
        <p className="text-ui" data-testid="set-quiet-effective">
          現在の動作：{child.active ? `${child.stored.start}〜${child.stored.end} の通知を止めています。` : "通知を止めていません。"}
        </p>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- プロフィール（明示的な保存）
export function ProfileSection(props: SettingsSectionProps) {
  const personal = usePersonalData(props.scope, props.api)
  if (personal.status === "error") return <SectionLoadError title="プロフィールを取得できませんでした" onRetry={personal.reload} />
  if (!personal.isCurrent) return <SectionLoading rows={3} testId="set-profile-loading" />
  return <ProfileForm key={props.scope.userId} {...props} initial={personal.data!.profile} />
}

function ProfileForm({ scope, api, onDirtyChange, onPermissionDenied, initial }: SettingsSectionProps & { initial: Profile }) {
  const form = useSettingsForm<Profile>({
    values: initial,
    scopeKey: scope.userId,
    // 変更の要求には、アンマウントで中止される signal を渡さない（即時保存と同じ方針）
    save: (values) => api.saveProfile(scope.userId, values),
    verify: ({ signal }) => api.getPersonal(scope.userId, { signal }).then((p) => p.profile),
    // 変更がない場合は送らない（Forms & Workflows の requireChanges と同じ規則）
    requireChanges: true,
    onSettled: (s) => s.state === "forbidden" && onPermissionDenied?.(),
  })
  const [showErrors, setShowErrors] = useState(false)
  useReportDirty("profile", form.dirty, onDirtyChange)
  const nameError = form.values.name.trim() === "" ? "表示名を入力してください" : null
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setShowErrors(true)
    if (nameError) return
    void form.submit()
  }
  return (
    <form onSubmit={submit} noValidate data-testid="set-profile">
      <Section>
        <SectionHeader>
          <SectionHeading>
            <SectionTitle>メンバーに表示する情報</SectionTitle>
            <SectionDescription>組織のメンバーに表示されます。「プロフィールを保存」を押すまで反映されません。</SectionDescription>
          </SectionHeading>
        </SectionHeader>
        <div className="flex max-w-[40rem] flex-col gap-8">
          <FieldGroup>
            <Field invalid={showErrors && !!nameError} data-setting-id="profile-name">
              <FieldLabel>表示名</FieldLabel>
              <Input value={form.values.name} onChange={(e) => form.setValue("name", e.target.value)} required autoComplete="name" data-testid="set-profile-name" />
              {showErrors && nameError && <FieldError>{nameError}</FieldError>}
            </Field>
            <Field data-setting-id="profile-title">
              <FieldLabel>役職</FieldLabel>
              <Input value={form.values.title} onChange={(e) => form.setValue("title", e.target.value)} autoComplete="organization-title" data-testid="set-profile-title" />
            </Field>
            <Field data-setting-id="profile-bio">
              <FieldLabel>自己紹介</FieldLabel>
              <Textarea rows={3} value={form.values.bio} onChange={(e) => form.setValue("bio", e.target.value)} data-testid="set-profile-bio" />
            </Field>
            <div className="flex flex-col gap-1">
              <p className="text-ui font-medium">メールアドレス</p>
              <p className="text-ui">{users[scope.userId].email}</p>
              <p className="text-ui text-muted-foreground">メールアドレスの変更には確認のメールが必要なため、このフォームでは変更しません。</p>
            </div>
          </FieldGroup>
          <FormFooter form={form} saveLabel="プロフィールを保存" testId="set-profile" />
        </div>
      </Section>
    </form>
  )
}

// ---------------------------------------------------------------- アカウントの削除（通常の設定から分ける）
export function AccountDeletionSection({ scope, api }: SettingsSectionProps) {
  const personal = usePersonalData(scope, api)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scheduled, setScheduled] = useState<{ userId: string; on: string | null } | null>(null)
  const [action, setAction] = useState<ActionState>({ kind: "idle" })
  const scheduledOn = scheduled?.userId === scope.userId ? scheduled.on : personal.isCurrent ? (personal.data!.deletion?.scheduledOn ?? null) : null
  const run = (schedule: boolean) => {
    setBusy(true)
    setError(null)
    setAction({ kind: "busy" })
    const userId = scope.userId
    api.scheduleAccountDeletion(userId, password, demoPassword, schedule).then(
      (r) => {
        setBusy(false)
        setPassword("")
        setOpen(false)
        setScheduled({ userId, on: r?.scheduledOn ?? null })
        setAction({ kind: "idle" })
      },
      (e: Error) => {
        setBusy(false)
        const state = actionError(e, schedule ? "削除を予約できたかを確認できませんでした。" : "削除を取り消せたかを確認できませんでした。", "")
        if (state.kind === "unknown") {
          // 処理されたかがわからない。予約した・していないと判断せず、確認させる
          setPassword("")
          setOpen(false)
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
    const userId = scope.userId
    api.getPersonal(userId).then(
      (p) => {
        setScheduled({ userId, on: p.deletion?.scheduledOn ?? null })
        setAction({ kind: "done", text: p.deletion ? "削除は予約されています。" : "削除は予約されていません。" })
      },
      () => setAction({ kind: "unknown", text: "確認できませんでした。もう一度確認してください。" })
    )
  }
  return (
    <Section divider data-testid="set-account-delete" data-setting-id="account-delete">
      <SectionHeader>
        <SectionHeading>
          <SectionTitle>アカウントの削除</SectionTitle>
          <SectionDescription>
            すべてのワークスペースから退出し、プロフィールと個人の設定を削除します。削除を予約してから 30 日間は取り消せます。
          </SectionDescription>
        </SectionHeading>
      </SectionHeader>
      <div className="flex flex-col gap-3">
        <p role="status" className="text-ui empty:hidden" data-testid="set-account-delete-status">
          {scheduledOn && action.kind !== "unknown" ? `${scheduledOn.replace(/-/g, "/")} に削除されます。それまでは取り消せます。` : ""}
        </p>
        <ActionStatus state={action} onVerify={verify} testId="set-account-delete-result" />
        <div>
          {action.kind === "unknown" ? null : scheduledOn ? (
            <Button variant="outline" loading={busy} onClick={() => run(false)} data-testid="set-account-delete-cancel">
              アカウントの削除を取り消す
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setOpen(true)} disabled={!personal.isCurrent} data-testid="set-account-delete-open">
              アカウントを削除
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
            setPassword("")
            setError(null)
          }
        }}
      >
        <AlertDialogContent data-testid="set-account-delete-dialog">
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              if (password) run(true)
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{users[scope.userId].name}さんのアカウントを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>本人であることを確かめるため、パスワードを入力してください。30 日後に削除されます。</AlertDialogDescription>
            </AlertDialogHeader>
            <Field invalid={!!error}>
              <FieldLabel>パスワード</FieldLabel>
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="set-account-delete-password" />
              <FieldDescription>模擬のパスワード：{demoPassword}（実際のパスワードは入力しないでください）</FieldDescription>
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction type="submit" variant="destructive" loading={busy} disabled={!password} data-testid="set-account-delete-confirm">
                アカウントを削除
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}

// ---------------------------------------------------------------- ログインとセキュリティ
export function LoginSecuritySection(props: SettingsSectionProps) {
  const personal = usePersonalData(props.scope, props.api)
  const org = useOrgData(props.scope, props.api)
  if (personal.status === "error" || org.status === "error")
    return <SectionLoadError title="セキュリティの設定を取得できませんでした" onRetry={() => (personal.status === "error" ? personal.reload() : org.reload())} />
  if (!personal.isCurrent || !org.isCurrent) return <SectionLoading rows={3} testId="set-security-loading" />
  return (
    <LoginSecurityForm
      key={`${props.scope.userId}:${props.scope.workspaceId}`}
      {...props}
      record={personal.data!}
      passwordChangedOn={personal.data!.passwordChangedOn}
      google={personal.data!.google}
      policy={org.data!.security}
    />
  )
}

function LoginSecurityForm(
  props: SettingsSectionProps & {
    record: PersonalRecord
    passwordChangedOn: string
    google: { connected: boolean; account: string | null }
    policy: { requireMfa: boolean; allowSocialLogin: boolean; requireSso: boolean }
  }
) {
  const { scope, api, policy } = props
  const s = useDisplaySettings(props)
  const [confirmOff, setConfirmOff] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [changedOn, setChangedOn] = useState(props.passwordChangedOn)
  const [passwordState, setPasswordState] = useState<ActionState>({ kind: "idle" })
  const [google, setGoogle] = useState(props.google)
  const [googleState, setGoogleState] = useState<ActionState>({ kind: "idle" })
  const ws = workspaceName(scope)
  const mfa = resolveSetting<boolean>({
    productDefault: false,
    orgPolicy: policy.requireMfa ? { value: true, reason: `組織（${ws}）のポリシーで必須のため、無効にできません。` } : undefined,
    userValue: s.values.mfa,
  })
  const socialReason = policy.requireSso
    ? `組織（${ws}）では SSO でのログインが必須のため、外部アカウントでは接続できません。`
    : !policy.allowSocialLogin
      ? `組織（${ws}）のポリシーで、外部アカウントでのログインは許可されていません。`
      : null
  const toggleGoogle = (connect: boolean) => {
    setGoogleState({ kind: "busy" })
    api.setGoogle(scope.userId, scope.workspaceId, connect).then(
      (g) => {
        setGoogle(g)
        setGoogleState({ kind: "done", text: connect ? "接続しました（模擬）" : "接続を解除しました" })
      },
      (e: Error) =>
        setGoogleState(actionError(e, `${connect ? "接続" : "接続の解除"}できたかを確認できませんでした。`, `${connect ? "接続" : "接続の解除"}できませんでした`))
    )
  }
  // 結果が不明な操作は、サーバーの状態を取得し直して確かめる（接続した・していないと推測しない）
  const verifyGoogle = () => {
    setGoogleState({ kind: "busy" })
    api.getPersonal(scope.userId).then(
      (p) => {
        setGoogle(p.google)
        setGoogleState({ kind: "done", text: p.google.connected ? "接続しています（確認しました）" : "接続していません（確認しました）" })
      },
      () => setGoogleState({ kind: "unknown", text: "確認できませんでした。もう一度確認してください。" })
    )
  }
  const verifyPassword = () => {
    setPasswordState({ kind: "busy" })
    api.getPersonal(scope.userId).then(
      (p) => {
        const changed = p.passwordChangedOn !== changedOn
        setChangedOn(p.passwordChangedOn)
        setPasswordState(
          changed ? { kind: "done", text: "パスワードは変更されていました。" } : { kind: "failed", text: "パスワードは変更されていませんでした。もう一度変更してください。" }
        )
      },
      () => setPasswordState({ kind: "unknown", text: "確認できませんでした。もう一度確認してください。" })
    )
  }
  return (
    <div className="flex flex-col gap-12" data-testid="set-security">
      <Section>
        <SectionHeader>
          <SectionHeading>
            <SectionTitle>ログイン</SectionTitle>
            <SectionDescription>認証は模擬の処理です。実際のパスワードは入力しないでください。</SectionDescription>
          </SectionHeading>
        </SectionHeader>
        <div className="flex flex-col gap-6">
          <SettingRow data-setting-id="password" label="パスワード" description={`最終変更：${changedOn.replace(/-/g, "/")}`} status={<ActionStatus state={passwordState} onVerify={verifyPassword} testId="set-password-status" />}>
            <Button variant="outline" onClick={() => setPasswordOpen(true)} data-testid="set-password-open">
              パスワードを変更
            </Button>
          </SettingRow>
          <SettingRow
            data-setting-id="mfa"
            layout="inline"
            label="2 段階認証"
            description={
              mfa.locked
                ? `${mfa.lockReason}${mfa.userValueIgnored ? "あなたの設定（オフ）は保持しており、ポリシーが変わると使われます。" : ""}`
                : "ログインのときに、パスワードに加えて認証アプリのコードを求めます。"
            }
            status={status(s, "mfa", "set-mfa-status")}
          >
            <Switch
              checked={mfa.value}
              disabled={mfa.locked}
              readOnly={!s.canChange("mfa")}
              onCheckedChange={(v) => (v ? s.change("mfa", true) : setConfirmOff(true))}
              data-testid="set-mfa"
            />
          </SettingRow>
          <SettingRow
            data-setting-id="google"
            label="Google アカウントでのログイン"
            description={[google.connected ? `接続中：${google.account}` : "接続していません", !google.connected && socialReason].filter(Boolean).join("。")}
            status={<ActionStatus state={googleState} onVerify={verifyGoogle} testId="set-google-status" />}
          >
            {googleState.kind === "unknown" ? null : google.connected ? (
              <Button variant="outline" loading={googleState.kind === "busy"} onClick={() => toggleGoogle(false)} data-testid="set-google">
                接続を解除
              </Button>
            ) : (
              !socialReason && (
                <Button variant="outline" loading={googleState.kind === "busy"} onClick={() => toggleGoogle(true)} data-testid="set-google">
                  接続する
                </Button>
              )
            )}
          </SettingRow>
        </div>
      </Section>
      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent size="sm" data-testid="set-mfa-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>2 段階認証を無効にしますか？</AlertDialogTitle>
            <AlertDialogDescription>パスワードだけでログインできるようになります。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>有効のままにする</AlertDialogCancel>
            {/* 取り消せる設定の変更のため、Destructive にしない（Destructive は取り消せない操作だけに使う） */}
            <AlertDialogAction
              onClick={() => {
                setConfirmOff(false)
                s.change("mfa", false)
              }}
            >
              無効にする
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        onSubmit={(current, next) =>
          api.changePassword(scope.userId, current, next, demoPassword).then(
            (r) => {
              setChangedOn(r.changedOn)
              setPasswordState({ kind: "done", text: "パスワードを変更しました" })
            },
            (e: Error) => {
              const state = actionError(e, "パスワードを変更できたかを確認できませんでした。", "")
              // 結果が不明：変更された可能性があるため、同じ現在のパスワードで再試行させない。閉じて確認させる
              if (state.kind === "unknown") setPasswordState(state)
              else throw e
            }
          )
        }
      />
    </div>
  )
}

// パスワードの変更の専用のフォーム。統合の後は Authentication の Password Input と再認証の手順に置き換える。
function PasswordDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (current: string, next: string) => Promise<void>
}) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const clear = () => {
    // 入力されたパスワードはメモリの外に残さない。閉じたら消す
    setCurrent("")
    setNext("")
    setError(null)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return
        onOpenChange(o)
        if (!o) clear()
      }}
    >
      <DialogContent size="sm" data-testid="set-password-dialog">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            if (busy) return
            setBusy(true)
            setError(null)
            onSubmit(current, next).then(
              () => {
                setBusy(false)
                clear()
                onOpenChange(false)
              },
              (err: Error) => {
                setBusy(false)
                setError(err.message)
              }
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>パスワードを変更</DialogTitle>
            <DialogDescription>模擬の処理です。現在のパスワードは「{demoPassword}」です。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup>
              <Field>
                <FieldLabel>現在のパスワード</FieldLabel>
                <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="set-password-current" />
              </Field>
              <Field invalid={!!error}>
                <FieldLabel>新しいパスワード</FieldLabel>
                <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="set-password-new" />
                <FieldDescription>12 文字以上</FieldDescription>
                {error && <FieldError>{error}</FieldError>}
              </Field>
            </FieldGroup>
          </DialogBody>
          <DialogFooter showCloseButton closeLabel="キャンセル">
            <Button type="submit" loading={busy} disabled={!current || !next} data-testid="set-password-submit">
              パスワードを変更
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
