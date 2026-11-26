import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useBrowseData } from "@/patterns/browse-data"
import { DataRegionError } from "@/patterns/data-states"
import { formatAbsoluteTime, isWithinQuietHours } from "@/patterns/notification-state"
import { resolveDeliveryChannel, type DevicePermission } from "@/patterns/setting-resolve"
import { useInstantSettings, type SettingSaveState } from "@/patterns/setting-save"
import { cn } from "@/lib/utils"

import {
  channelLabels,
  mandatoryNotifications,
  notificationTypeLabels,
  referenceNow,
  type Channel,
  type NotificationType,
  type PersonalSettings,
  type UserId,
  type WorkspaceId,
} from "../../data/system-account/model"
import { notificationPolicies, notificationsApi, type NotificationsApi, type SettingPatch } from "../../data/system-account/notifications-server"

// 通知の設定（種類 × 配信チャネルの Matrix、まとめて受け取る、通知を控える時間）。製品側のコードの例。Registry には含めない。
// 保存は Settings の即時保存（useInstantSettings）を使う：項目ごとの最新の要求だけの反映、スコープの境界、
// 確定した失敗の戻し、結果の不明の確認、確認するまで同じ項目を送らない規則は、Settings と同じ。
// 区別するもの：必須の通知（無効にできない）、個人の設定（保存されている値）、組織のポリシー（使えないチャネル）、
// 端末（OS、ブラウザ）の通知の許可（製品の設定とは別）。配信されることと、既読になることは別の状態である。
// 通知の配信、メール、プッシュ通知、ブラウザの通知の許可は、すべて模擬の処理である。

export type BrowserPermission = "default" | "granted" | "denied"

export type NotificationSettingsMatrixProps = {
  userId: UserId
  workspaceId: WorkspaceId
  api?: NotificationsApi
  now?: number
  /** ブラウザ（OS）の通知の許可（模擬）。製品の配信の設定とは別に持つ */
  browserPermission: BrowserPermission
  /** ブラウザの通知の許可を求める（模擬）。製品は Notification.requestPermission() などを呼ぶ */
  onRequestBrowserPermission?: () => void
  headingLevel?: 2 | 3
}

const types = Object.keys(notificationTypeLabels) as NotificationType[]
const channels = Object.keys(channelLabels) as Channel[]
const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)

/** 保存の単位（項目）の値。種類 × チャネルは `${type}:${channel}` */
type MatrixValues = Record<string, unknown>
type Quiet = PersonalSettings["quietHours"]

const flatten = (s: PersonalSettings): MatrixValues => {
  const values: MatrixValues = { digest: s.digest, quiet: s.quietHours }
  for (const t of types) for (const c of channels) values[`${t}:${c}`] = s.notifications[t][c]
  return values
}
const patchOf = (key: string, value: unknown): SettingPatch => {
  if (key === "digest") return { kind: "digest", value: value as PersonalSettings["digest"] }
  if (key === "quiet") return { kind: "quiet", value: value as Quiet }
  const [type, channel] = key.split(":") as [NotificationType, Channel]
  return { kind: "channel", type, channel, value: value as boolean }
}
// 通知を控える時間は、開始、終了、オンとオフをまとめた 1 つの値（1 つの保存の単位）。値で比べる
const sameValue = (a: unknown, b: unknown) => Object.is(a, b) || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b))

type CellStatus = { state: "failed" | "unknown"; message: string }

/** 保存の失敗（destructive）と、結果の不明（warning。取得し直している）を区別して示す */
function StatusText({ status }: { status: CellStatus }) {
  return (
    <p data-testid="ntf-setting-error" data-state={status.state} className={cn("mt-1 text-caption", status.state === "failed" ? "text-destructive" : "text-warning")}>
      {status.message}
    </p>
  )
}

/**
 * 通知の種類と配信チャネルの設定。Switch は即時に保存する。必須の通知は無効にできない理由を示す。
 * 組織のポリシーで使えないチャネルと、ブラウザの通知の許可（製品の設定とは別）を区別して示す。
 */
export function NotificationSettingsMatrix(props: NotificationSettingsMatrixProps) {
  const { userId, workspaceId, api = notificationsApi } = props
  const scopeKey = `${userId}:${workspaceId}`
  const data = useBrowseData({ query: userId, scopeKey, fetcher: (u, { signal }) => api.loadSettings(u, { signal }) })
  if (data.status === "error") {
    return <DataRegionError title="通知の設定を取得できませんでした" description="通信の状態を確かめて、もう一度お試しください。" onRetry={data.reload} />
  }
  if (!data.isCurrent || !data.data) {
    return (
      <div aria-busy="true" className="py-8 text-ui text-muted-foreground">
        通知の設定を読み込んでいます
      </div>
    )
  }
  return <MatrixForm key={scopeKey} {...props} api={api} settings={data.data} />
}

function MatrixForm({
  userId,
  workspaceId,
  api,
  now = referenceNow,
  browserPermission,
  onRequestBrowserPermission,
  headingLevel = 2,
  settings,
}: NotificationSettingsMatrixProps & { api: NotificationsApi; settings: PersonalSettings }) {
  const baseId = useId()
  const H = headingLevel === 2 ? "h2" : "h3"
  const H2 = headingLevel === 2 ? "h3" : "h4"
  const policy = notificationPolicies[workspaceId]
  const labels = new Map<string, string>()
  // 項目ごとの結果の文（失敗と結果の不明）。次の変更まで残す。announcement は常に置いた読み上げの領域の中身
  const [notices, setNotices] = useState<Map<string, CellStatus>>(new Map())
  const [announcement, setAnnouncement] = useState("")
  const notice = (key: string, status: CellStatus | null) =>
    setNotices((m) => {
      const next = new Map(m)
      if (status) next.set(key, status)
      else next.delete(key)
      return next
    })

  const s = useInstantSettings<MatrixValues>({
    values: flatten(settings),
    scopeKey: `${userId}:${workspaceId}`,
    // 変更の要求には、画面の移動で中止される signal を渡さない（Settings と同じ方針）
    save: (key, value) => api.saveSetting(userId, workspaceId, patchOf(key, value), { signal: new AbortController().signal }).then((r) => flatten(r)[key]),
    verify: (key, { signal }) => api.loadSettings(userId, { signal }).then((r) => flatten(r)[key]),
    equals: sameValue,
    onSettled: (key, status) => settled(key, status),
    onVerified: (key, status) => {
      // 結果が不明だった項目を取得し直した。示している文は残し、取得した値を表示していることを加える
      const label = labels.get(key) ?? ""
      if (status.state === "unknown") notice(key, { state: "unknown", message: `${label}を保存できたかを確認できませんでした。最新の設定も取得できませんでした。` })
      else notice(key, { state: "unknown", message: `${label}を保存できたかを確認できませんでした。取得し直した最新の設定を表示しています。` })
    },
  })

  function settled(key: string, status: SettingSaveState) {
    const label = labels.get(key) ?? ""
    if (status.state === "saved") {
      notice(key, null)
      setAnnouncement(`${label}を保存しました`)
      return
    }
    // 結果の不明と競合：保存されたかがわからない。同じ保存を送り直さず、最新の設定を取得し直す（取得は副作用のない要求）
    const unknown = status.state === "unknown" || status.state === "conflict"
    const cell: CellStatus = unknown
      ? { state: "unknown", message: `${label}を保存できたかを確認できませんでした。最新の設定を取得し直しています。` }
      : { state: "failed", message: `${label}を保存できませんでした。もう一度お試しください。` }
    notice(key, cell)
    // 失敗と結果の不明も、常に置いた読み上げの領域で伝える
    setAnnouncement(cell.message)
    if (unknown) s.verify(key)
  }

  const change = (key: string, value: unknown, label: string) => {
    labels.set(key, label)
    if (!s.change(key, value)) return
    notice(key, null)
    setAnnouncement("")
  }
  // 描画のたびに、項目の名前を登録する（結果の文に使う）
  const register = (key: string, label: string) => {
    labels.set(key, label)
    return key
  }

  const quiet = s.values.quiet as Quiet
  const digest = s.values.digest as PersonalSettings["digest"]
  const crosses = quiet.start > quiet.end
  const inQuiet = isWithinQuietHours(now, { ...quiet, timeZone: settings.timezone })
  const pushPolicy = policy.disabledChannels.find((d) => d.channel === "push")
  const devicePermission: DevicePermission = browserPermission
  // プッシュ通知をオンにしているが、このブラウザの許可がないため届かない種類（個人の設定は変えない）
  const pushWithoutPermission = types.filter(
    (type) =>
      resolveDeliveryChannel({
        userEnabled: s.values[`${type}:push`] as boolean,
        required: mandatoryNotifications.find((m) => m.type === type && m.channel === "push") ?? null,
        disabledByPolicy: pushPolicy ?? null,
        permission: devicePermission,
      }).blockedBy === "permission"
  )

  return (
    <div className="flex min-w-0 flex-col gap-10" data-testid="ntf-settings">
      <p role="status" className="sr-only" data-testid="ntf-settings-live">
        {announcement}
      </p>
      <section aria-labelledby={`${baseId}-matrix`} className="@container/matrix min-w-0">
        <H id={`${baseId}-matrix`} className="text-heading">
          通知の種類と受け取り方
        </H>
        <p className="mt-2 text-ui text-muted-foreground">変更はすぐに保存されます。この設定は、すべてのワークスペースで共通です。</p>
        <p className="mt-2 text-ui text-muted-foreground" data-testid="ntf-delivery-note">
          ここでは、通知を届けるかどうかを決めます。メールやプッシュ通知で届いても、通知は既読になりません。既読になるのは、アプリ内で通知を開いたときです。
        </p>

        {/* ブラウザ（OS）の通知の許可。製品の設定（下の Switch）とは別のもの */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-ui" data-testid="ntf-browser-permission">
          <p className="text-muted-foreground">
            {browserPermission === "granted"
              ? "このブラウザで、プッシュ通知が許可されています（ブラウザの設定）。"
              : browserPermission === "denied"
                ? "このブラウザの設定で、通知がブロックされています。プッシュ通知を受け取るには、ブラウザの設定で許可してください。下の設定は、ブラウザの許可とは別に保存されます。"
                : "このブラウザでは、プッシュ通知がまだ許可されていません（ブラウザの設定）。"}
            {pushWithoutPermission.length > 0 &&
              `プッシュ通知をオンにしている ${pushWithoutPermission.length} 種類の通知は、許可されるまでこのブラウザには届きません（設定はオンのまま保存されています）。`}
          </p>
          {browserPermission === "default" && onRequestBrowserPermission && (
            <Button variant="outline" size="sm" onClick={onRequestBrowserPermission}>
              ブラウザの通知を許可する
            </Button>
          )}
        </div>
        {pushPolicy && (
          <p id={`${baseId}-policy-push`} className="mt-2 text-ui text-muted-foreground" data-testid="ntf-policy">
            プッシュ通知：{pushPolicy.reason}。個人の設定は残り、このワークスペースでは届きません。
          </p>
        )}

        <div className="mt-6" role="group" aria-label="通知の種類と配信チャネル">
          {/* 列の見出し。各 Switch のアクセシブルな名前に種類とチャネルを含めるため、支援技術からは隠す */}
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)] gap-x-2 pb-2 text-caption text-muted-foreground @xl/matrix:grid">
            <span>種類</span>
            {channels.map((c) => (
              <span key={c} className="text-center">
                {channelLabels[c]}
              </span>
            ))}
          </div>
          {types.map((type) => {
            const mandatory = mandatoryNotifications.filter((m) => m.type === type)
            const rowErrors = channels.map((c) => notices.get(`${type}:${c}`)).filter(Boolean) as CellStatus[]
            return (
              <div
                key={type}
                role="group"
                aria-labelledby={`${baseId}-${type}`}
                data-testid={`ntf-type-${type}`}
                className="grid gap-x-2 gap-y-1 border-t border-border py-4 @xl/matrix:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)] @xl/matrix:items-center"
              >
                <div className="min-w-0">
                  <p id={`${baseId}-${type}`} className="text-ui font-medium [word-break:auto-phrase]">
                    {notificationTypeLabels[type]}
                  </p>
                  {mandatory.map((m) => (
                    <p key={m.channel} id={`${baseId}-${type}-${m.channel}-reason`} className="mt-1 text-caption text-muted-foreground [word-break:auto-phrase]">
                      {channelLabels[m.channel]}は無効にできません：{m.reason}
                    </p>
                  ))}
                  {rowErrors.map((e, i) => (
                    <StatusText key={i} status={e} />
                  ))}
                </div>
                {channels.map((channel) => {
                  const key = `${type}:${channel}`
                  const label = `${notificationTypeLabels[type]}：${channelLabels[channel]}`
                  register(key, `${label}の設定`)
                  const required = mandatory.find((m) => m.channel === channel) ?? null
                  const blocked = policy.disabledChannels.find((d) => d.channel === channel) ?? null
                  // 必須の通知、組織のポリシー、個人の設定を区別する（Switch には実際に有効な値を示し、個人の値は残す）
                  const resolved = resolveDeliveryChannel({ userEnabled: s.values[key] as boolean, required, disabledByPolicy: blocked })
                  const locked = resolved.setting.locked
                  return (
                    <div key={channel} className="flex min-h-12 items-center justify-between gap-3 @xl/matrix:justify-center">
                      <span aria-hidden="true" className="text-ui text-muted-foreground @xl/matrix:hidden">
                        {channelLabels[channel]}
                      </span>
                      <Switch
                        checked={resolved.setting.value}
                        readOnly={locked || !s.canChange(key)}
                        aria-label={label}
                        aria-describedby={required ? `${baseId}-${type}-${channel}-reason` : blocked ? `${baseId}-policy-push` : undefined}
                        data-testid={`ntf-switch-${type}-${channel}`}
                        data-user-value={String(resolved.setting.userValue)}
                        className="data-readonly:cursor-not-allowed data-readonly:opacity-50"
                        onCheckedChange={(value) => {
                          if (locked) return
                          change(key, value, `${label}の設定`)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </section>

      <section aria-labelledby={`${baseId}-fatigue`} className="min-w-0">
        <H2 id={`${baseId}-fatigue`} className="text-heading">
          受け取る量を減らす
        </H2>
        <div className="mt-4 flex flex-col">
          <div className="flex min-h-12 items-start justify-between gap-4 border-t border-border py-4">
            <div className="min-w-0">
              <p id={`${baseId}-digest`} className="text-ui font-medium">
                メールを 1 日 1 回まとめて受け取る
              </p>
              <p id={`${baseId}-digest-note`} className="mt-1 text-caption text-muted-foreground">
                セキュリティの通知と、すぐに対応が必要な通知は、まとめずにすぐ届きます。
              </p>
              {notices.get(register("digest", "まとめて受け取る設定")) && <StatusText status={notices.get("digest")!} />}
            </div>
            <Switch
              checked={digest === "daily"}
              readOnly={!s.canChange("digest")}
              aria-labelledby={`${baseId}-digest`}
              aria-describedby={`${baseId}-digest-note`}
              data-testid="ntf-digest"
              onCheckedChange={(on) => change("digest", on ? "daily" : "off", "まとめて受け取る設定")}
            />
          </div>
          <div className="flex flex-col gap-3 border-t border-border py-4" data-setting-id="quiet">
            <div className="flex min-h-12 items-start justify-between gap-4">
              <div className="min-w-0">
                <p id={`${baseId}-quiet`} className="text-ui font-medium">
                  通知を控える時間
                </p>
                <p id={`${baseId}-quiet-note`} className="mt-1 text-caption text-muted-foreground [word-break:auto-phrase]" data-testid="ntf-quiet-summary">
                  {quiet.enabled
                    ? `${quiet.start}〜${crosses ? "翌 " : ""}${quiet.end}（${settings.timezone}）は、メールとプッシュ通知を控えます。基準の時刻（${formatAbsoluteTime(now, settings.timezone)}）は${inQuiet ? "控える時間の中" : "控える時間の外"}です。`
                    : "設定していません。"}
                  セキュリティの通知と、すぐに対応が必要な通知は、この時間も届きます。
                </p>
                {notices.get(register("quiet", "通知を控える時間")) && <StatusText status={notices.get("quiet")!} />}
              </div>
              <Switch
                checked={quiet.enabled}
                readOnly={!s.canChange("quiet")}
                aria-labelledby={`${baseId}-quiet`}
                aria-describedby={`${baseId}-quiet-note`}
                data-testid="ntf-quiet"
                onCheckedChange={(on) => change("quiet", { ...quiet, enabled: on }, "通知を控える時間")}
              />
            </div>
            {quiet.enabled && (
              <div className="flex flex-wrap items-center gap-3 text-ui">
                {(["start", "end"] as const).map((edge) => (
                  <div key={edge} className="flex items-center gap-2">
                    <span id={`${baseId}-quiet-${edge}`}>{edge === "start" ? "開始" : "終了"}</span>
                    <Select
                      items={hours.map((h) => ({ value: h, label: h }))}
                      value={quiet[edge]}
                      readOnly={!s.canChange("quiet")}
                      onValueChange={(v) => change("quiet", { ...quiet, [edge]: String(v) }, "通知を控える時間")}
                    >
                      <SelectTrigger aria-labelledby={`${baseId}-quiet-${edge}`} className="w-28" data-testid={`ntf-quiet-${edge}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {hours.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
