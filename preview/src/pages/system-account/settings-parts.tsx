import { useEffect, useRef, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { useBrowseData } from "@/patterns/browse-data"
import { DataRegionError, LoadingReveal } from "@/patterns/data-states"
import { classifySaveError } from "@/patterns/setting-save"
import { SettingSaveStatus } from "@/patterns/setting-status"

import type { SettingsApi } from "../../data/system-account/settings-server"
import { users, workspaces, type Language, type Permission, type UserId, type WorkspaceId } from "../../data/system-account/model"

// Settings の画面の部品（製品側のコードの例）で共通に使うもの。Registry には含めない。

/** 設定の画面の対象。アカウント、ワークスペース、そのワークスペースでのロールの権限 */
export type SettingsScope = { userId: UserId; workspaceId: WorkspaceId; permissions: readonly Permission[] }

export const can = (scope: SettingsScope, p: Permission) => scope.permissions.includes(p)
export const permissionKey = (scope: SettingsScope) => [...scope.permissions].sort().join(",")
export const userName = (scope: SettingsScope) => users[scope.userId].name
export const workspaceName = (scope: SettingsScope) => workspaces[scope.workspaceId].name

/** 画面の部品が受け取る値。api は模擬のサーバーの関数（製品の API に置き換える） */
export type SettingsSectionProps = {
  scope: SettingsScope
  api: SettingsApi
  /** 保存が権限不足で拒否された。製品が最新の権限を取り直す */
  onPermissionDenied?: () => void
  /** 明示的な保存のフォームの未保存の変更。画面の移動の前の確認に使う */
  onDirtyChange?: (unit: string, dirty: boolean) => void
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

type FormLike = {
  status: Parameters<typeof SettingSaveStatus>[0]["status"]
  dirty: boolean
  saving: boolean
  canDiscard: boolean
  discard: () => void
  verify: () => void
}

/** 明示的な保存のフォームの操作の行：保存、変更の取り消し、保存の状態 */
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
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={form.saving} data-testid={`${testId}-save`}>
          {saveLabel}
        </Button>
        {/* 結果が不明な間は破棄できない（サーバーに保存された可能性がある）。確認の後に取り消せる */}
        <Button type="button" variant="ghost" disabled={!form.canDiscard} onClick={form.discard} data-testid={`${testId}-discard`}>
          変更を取り消す
        </Button>
        {extra}
      </div>
      <SettingSaveStatus status={form.status} dirty={form.dirty} onVerify={form.verify} data-testid={`${testId}-status`} />
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

/** 模擬の通信のエラーを分類する（setting-save の classifySaveError と同じ規則） */
export function actionError(error: unknown, unknownText: string, failedPrefix: string): ActionState {
  const kind = classifySaveError(error)
  if (kind === "unknown") return { kind: "unknown", text: unknownText }
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
          確認する
        </Button>
      )}
    </div>
  )
}
