import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { decideAccess, unverifiedStatus, type AccessSnapshot } from "@/patterns/access"
import { useBrowseData } from "@/patterns/browse-data"
import { DataRegionError, LoadingReveal } from "@/patterns/data-states"
import { classifySaveError } from "@/patterns/setting-save"
import { SettingSaveStatus } from "@/patterns/setting-status"
import { useUnsavedChanges } from "@/patterns/unsaved-changes"

import { orgNameOf, orgSettingsVersion, subscribeOrgSettings, type SaveContract, type SettingsApi } from "../../data/system-account/settings-server"
import { users, type Language, type Permission, type UserId, type WorkspaceId } from "../../data/system-account/model"

// Settings の画面の部品（製品側のコードの例）で共通に使うもの。Registry には含めない。

/** 設定の画面の対象。アカウント、ワークスペース、そのワークスペースでのロールの権限 */
export type SettingsScope = { userId: UserId; workspaceId: WorkspaceId; permissions: readonly Permission[] }

export const can = (scope: SettingsScope, p: Permission) => scope.permissions.includes(p)
export const permissionKey = (scope: SettingsScope) => [...scope.permissions].sort().join(",")
export const userName = (scope: SettingsScope) => users[scope.userId].name
/** 組織の名前。正本は Settings の模擬のサーバー（保存した組織名を表示する） */
export const workspaceName = (scope: SettingsScope) => orgNameOf(scope.workspaceId)

/** 組織の設定（名前、ポリシー）の変更で描画し直す。組織名を表示する部品の上位で呼ぶ */
export function useOrgSettingsVersion() {
  return useSyncExternalStore(subscribeOrgSettings, orgSettingsVersion, orgSettingsVersion)
}

/**
 * 権限の取得の状態（useAccess の戻り値の一部）。統合の検証画面は usePermissionAccess の access を渡す。
 * 渡さない場合（Settings の単独のプレビュー）は、scope.permissions を確認済みの権限として扱う。
 */
export type SettingsAccess = AccessSnapshot<Permission, string> & {
  /** commit した最新の状態。操作の開始の直前に判断し直すために使う */
  latest: () => AccessSnapshot<Permission, string>
  /** 取得し直す（保存が権限不足で拒否されたときなど） */
  reload?: () => void
}

/** 画面の部品が受け取る値。api は模擬のサーバーの関数（製品の API に置き換える） */
export type SettingsSectionProps = {
  scope: SettingsScope
  api: SettingsApi
  /** 権限の取得の状態。渡した場合は、最新の権限を確認していない間、保護された設定の値を表示せず、変更を始めない */
  access?: SettingsAccess
  /** 保存が権限不足で拒否された。製品が最新の権限を取り直す */
  onPermissionDenied?: () => void
  /** 明示的な保存のフォームの未保存の変更。画面の移動の前の確認に使う */
  onDirtyChange?: (unit: string, dirty: boolean) => void
  /**
   * 模擬のサーバーの保存の順序の規則。versioned の場合は、即時保存に版の照合（versions、ifMatch）を使う。
   * 製品では、API の契約に合わせて固定する（画面の操作で切り替えない）
   */
  saveContract?: SaveContract
}

const settledOf = (scope: SettingsScope): AccessSnapshot<Permission, string> => ({
  status: "ready",
  grants: { scope: `${scope.workspaceId}:${scope.userId}`, permissions: scope.permissions, features: [] },
  error: null,
})

/** 描画に使う権限の状態。access を渡していない場合は、scope.permissions を確認済みとして扱う */
export const accessOf = ({ scope, access }: Pick<SettingsSectionProps, "scope" | "access">): AccessSnapshot<Permission, string> => access ?? settledOf(scope)

/** 最新の権限を確認していない状態（確認済みは null） */
export function unresolvedOf(snapshot: AccessSnapshot<Permission, string>): "loading" | "error" | "refreshing" | "stale" | null {
  if (snapshot.status === "loading" || snapshot.status === "error") return snapshot.status
  return unverifiedStatus(snapshot)
}

/**
 * 操作の開始の直前に、commit した最新の権限で判断し直す（描画の時点の判断だけに頼らない）。
 * 権限の変更の知らせを受けた同じ処理の中で押された場合も、確認済みの権限として扱わない（useAccess の latest）
 */
export function allowedNow(props: Pick<SettingsSectionProps, "scope" | "access">, permission: Permission) {
  const snapshot = props.access ? props.access.latest() : settledOf(props.scope)
  return decideAccess(snapshot, { permissions: [permission] }).allowed
}

/** 最新の権限を確認していない間に、保護された設定の値の代わりに示す文 */
export const pendingAccessText: Record<"loading" | "error" | "refreshing" | "stale", string> = {
  loading: "権限を確認しています。",
  error: "権限を確認できませんでした。確認できるまで、内容を表示しません。",
  refreshing: "最新の権限を確認しています。確認できるまで、内容を表示しません。",
  stale: "最新の権限を確認できませんでした。確認できるまで、内容を表示しません。",
}

export const languageLabels: Record<Language, string> = { ja: "日本語", en: "English" }

export const timezones = [
  { value: "Asia/Tokyo", label: "日本（東京）" },
  { value: "Asia/Singapore", label: "シンガポール" },
  { value: "Europe/London", label: "イギリス（ロンドン）" },
  { value: "America/Los_Angeles", label: "アメリカ（ロサンゼルス）" },
]

export const hours = Array.from({ length: 24 }, (_, h) => {
  const v = `${String(h).padStart(2, "0")}:00`
  return { value: v, label: v }
})

export function usePersonalData(scope: SettingsScope, api: SettingsApi) {
  return useBrowseData({
    query: scope.userId,
    fetcher: (userId, { signal }) => api.getPersonal(userId, { signal }),
    scopeKey: scope.userId,
    keepPreviousData: false,
  })
}

export function useOrgData(scope: SettingsScope, api: SettingsApi) {
  return useBrowseData({
    query: scope.workspaceId,
    fetcher: (workspaceId, { signal }) => api.getOrg(workspaceId, { signal }),
    // 権限が変わったら、古い権限で取得した内容を表示しない
    scopeKey: `${scope.workspaceId}:${scope.userId}:${permissionKey(scope)}`,
    keepPreviousData: false,
  })
}

/** 読み込み中の Skeleton。表示予定の行の数に合わせる */
export function SectionLoading({ rows = 3, testId }: { rows?: number; testId?: string }) {
  return (
    <LoadingReveal loading data-testid={testId}>
      <div aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">読み込み中</span>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <span data-slot="skeleton" aria-hidden="true" className="block h-4 w-40 rounded-sm bg-border motion-safe:animate-pulse" />
            <span data-slot="skeleton" aria-hidden="true" className="block h-10 w-full max-w-sm rounded-md bg-border motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </LoadingReveal>
  )
}

export function SectionLoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return <DataRegionError title={title} description="サーバーに接続できませんでした（模擬）。" onRetry={onRetry} />
}

/** 明示的な保存のフォームの未保存の変更を、親に知らせる。アンマウントで解除する */
export function useReportDirty(unit: string, dirty: boolean, onDirtyChange?: (unit: string, dirty: boolean) => void) {
  const report = useRef(onDirtyChange)
  report.current = onDirtyChange
  useEffect(() => {
    report.current?.(unit, dirty)
  }, [unit, dirty])
  useEffect(() => () => report.current?.(unit, false), [unit])
}

/**
 * 保存の結果を確認していない保存の単位の名前に付ける印。移動の確認の文（describeUnsavedSettings）で、
 * 「保存されていません」と断定しない文に切り替えるために使う
 */
const unresolvedLabelSuffix = "（保存できたかを確認していません）"

/**
 * 移動の確認（UnsavedChangesProvider の labels.description）の文。保存の結果を確認していない単位には、
 * 「保存されていません」と示さない（サーバーに保存されている場合がある）。
 */
export function describeUnsavedSettings(labels: string[]) {
  const unresolved = labels.filter((l) => l.endsWith(unresolvedLabelSuffix)).map((l) => l.slice(0, -unresolvedLabelSuffix.length))
  const dirty = labels.filter((l) => !l.endsWith(unresolvedLabelSuffix))
  const quote = (ls: string[]) => ls.map((l) => `「${l}」`).join("")
  const parts: string[] = []
  if (dirty.length) parts.push(`${quote(dirty)}の変更は保存されていません。`)
  if (unresolved.length) {
    parts.push(
      `${quote(unresolved)}は、保存できたかを確認していません。サーバーには保存されている場合があります。移動すると、画面の入力は消えます。移動せずに「保存されたかを確認」で確かめられます。`
    )
  }
  return parts.join("") || "入力した内容は保存されません。"
}

/**
 * 明示的な保存のフォームを、移動の確認（Unsaved Changes）の対象に登録する。設定の画面（SettingsArea）にも未保存の変更を知らせる。
 * - 対象：未保存の変更がある間と、保存の結果を確認していない間（結果の不明、競合）。後者は「保存されていません」と示さない。
 * - 「保存して移動」：canSave が true で、保存を送れる間だけ（入力の誤り、確認の Dialog が必要な変更、結果の確認の前は除く）。
 *   保存が成功した場合だけ移動する（Unsaved Changes の規則）。
 * - 「変更を破棄」：form.discard を呼ぶ（結果を確認していない間は、form.discard は何もしない）。
 */
export function useSettingsFormUnsaved({
  unit,
  label,
  form,
  onDirtyChange,
  canSave = true,
  beforeSave,
}: {
  unit: string
  label: string
  form: Pick<FormLike, "dirty" | "saving" | "canSubmit" | "submitBlockedReason" | "discard"> & { submit: () => Promise<string> }
  onDirtyChange?: (unit: string, dirty: boolean) => void
  canSave?: boolean
  /** 「保存して移動」で送る直前の判断（最新の権限など）。false を返すと送らず、移動しない */
  beforeSave?: () => boolean
}) {
  const unresolved = form.submitBlockedReason === "unresolved"
  const pending = form.dirty || unresolved
  useReportDirty(unit, pending, onDirtyChange)
  const { submit, discard } = form
  useUnsavedChanges({
    dirty: pending,
    saving: form.saving,
    label: unresolved ? `${label}${unresolvedLabelSuffix}` : label,
    canSave: canSave && form.canSubmit,
    onSave: async () => (beforeSave && !beforeSave() ? false : (await submit()) === "saved"),
    onDiscard: discard,
  })
}

type FormLike = {
  status: Parameters<typeof SettingSaveStatus>[0]["status"]
  dirty: boolean
  saving: boolean
  canDiscard: boolean
  canSubmit: boolean
  submitBlockedReason: "saving" | "unresolved" | "unchanged" | null
  discard: () => void
  verify: () => void
}

const blockedTexts = {
  unchanged: "変更がないため、保存していません。",
  unresolved: "前の保存の結果を確認するまで、もう一度保存できません。「保存されたかを確認」で確かめてください。",
} as const

/**
 * 明示的な保存のフォームの操作の行：保存、変更の取り消し、保存の状態。
 * 保存できない間（変更がない、結果が不明か競合）も保存のボタンは無効にせず（フォーカスを失わせない）、押したときに理由を示す
 */
export function FormFooter({
  form,
  saveLabel,
  testId,
  extra,
}: {
  form: FormLike
  saveLabel: string
  testId: string
  extra?: ReactNode
}) {
  const [note, setNote] = useState<string | null>(null)
  const reason = form.submitBlockedReason
  // 保存できるようになったら、理由の文を消す
  useEffect(() => {
    if (reason === null || reason === "saving") setNote(null)
  }, [reason])
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          loading={form.saving}
          onClick={(e) => {
            if (reason === "unchanged" || reason === "unresolved") {
              e.preventDefault()
              setNote(blockedTexts[reason])
            }
          }}
          data-testid={`${testId}-save`}
        >
          {saveLabel}
        </Button>
        {/* 結果が不明な間は破棄できない（サーバーに保存された可能性がある）。確認の後に取り消せる */}
        <Button type="button" variant="ghost" disabled={!form.canDiscard} onClick={form.discard} data-testid={`${testId}-discard`}>
          変更を取り消す
        </Button>
        {extra}
      </div>
      <SettingSaveStatus status={form.status} dirty={form.dirty} onVerify={form.verify} data-testid={`${testId}-status`} />
      <p role="status" className="text-ui text-muted-foreground" data-testid={`${testId}-blocked`}>
        {note ?? ""}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- 1 回だけの操作（接続、削除の予約、パスワードの変更）の結果
// 成功、処理中、確定した失敗、結果の不明を区別する。結果が不明な場合は「確認する」で、サーバーの状態を取得し直す。

export type ActionState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; text: string }
  | { kind: "failed"; text: string }
  | { kind: "unknown"; text: string }

/**
 * 模擬の通信のエラーを分類する（setting-save の classifySaveError を使う）。結果の不明と、クライアントの待機の中止（aborted）は、
 * どちらも処理されたかがわからないため「確認する」の対象にする
 */
export function actionError(error: unknown, unknownText: string, failedPrefix: string): ActionState {
  const kind = classifySaveError(error)
  if (kind === "unknown" || kind === "aborted") return { kind: "unknown", text: unknownText }
  return { kind: "failed", text: `${failedPrefix}${error instanceof Error ? `：${error.message}` : ""}` }
}

export function ActionStatus({ state, onVerify, testId }: { state: ActionState; onVerify?: () => void; testId?: string }) {
  const text = state.kind === "idle" ? "" : state.kind === "busy" ? "" : state.text
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" data-testid={testId} data-state={state.kind}>
      {/* 読み上げの領域は常に置き、中身だけを変える */}
      <p
        role="status"
        className={
          state.kind === "failed" ? "text-ui text-destructive" : state.kind === "unknown" ? "text-ui text-warning" : "text-ui text-muted-foreground"
        }
      >
        {text}
      </p>
      {state.kind === "unknown" && onVerify && (
        <Button variant="outline" size="sm" onClick={onVerify}>
          状態を確認
        </Button>
      )}
    </div>
  )
}
