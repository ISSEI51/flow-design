import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { Search } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { getBrowseViewState, useBrowseData, type BrowseViewState } from "@/patterns/browse-data"
import { ContextualHelp } from "@/patterns/contextual-help"
import { DataRefreshIndicator, DataRegionError } from "@/patterns/data-states"
import { GettingStartedChecklist } from "@/patterns/getting-started"
import { deriveChecklist, pickGuidance, type Checklist, type ChecklistVisibility, type OnboardingTaskResults } from "@/patterns/onboarding"
import { useScopeGuard, type ScopeSnapshot, type ScopeTicket } from "@/patterns/scope-guard"
import { cn } from "@/lib/utils"
import { FormActions, SaveBlockerNotice, focusFormControl } from "@/patterns/form-layout"
import { submitOnEnter, useFormState, type FormFields } from "@/patterns/form-state"
import { useStepFlow, type StepDefinition } from "@/patterns/step-flow"
import { Stepper } from "@/patterns/stepper"
import { DiscardChangesAlert, useUnsavedChanges } from "@/patterns/unsaved-changes"

import { MockRequestError } from "../../data/system-account/mock"
import { users, type OnboardingTaskId, type Permission, type UserId } from "../../data/system-account/model"
import {
  helpIds,
  onboardingTaskDefinitions,
  screenLabels,
  taskActionLabels,
  taskScreens,
  type OnboardingViewer,
  type ProductScreen,
} from "../../data/system-account/onboarding-data"
import type { DataSpace, OnboardingApi, SetupDraft } from "../../data/system-account/onboarding-server"

// Onboarding の画面の部品（プレビュー）。統合の検証画面でも使えるよう、利用者（OnboardingViewer）、模擬のサーバーの関数（api）、
// コールバックを props で受け取る。状態は api（模擬のサーバー）に保存し、部品は保存しない。

type Heading = "h1" | "h2" | "h3"

/** 処理されなかったことが確かな失敗（サーバーが拒否した）。それ以外の例外は、結果が不明として扱う */
const isConfirmedFailure = (e: unknown): e is MockRequestError => e instanceof MockRequestError
const can = (v: OnboardingViewer, p: Permission) => v.permissions.includes(p)

/** 利用者、組織、権限の組み合わせ。変わったら、前の利用者の状態を表示しない */
export const viewerScope = (v: OnboardingViewer) => `${v.userId}:${v.workspaceId}:${[...v.permissions].sort().join(",")}`

// ---------------------------------------------------------------- Getting Started Checklist の接続

/**
 * Checklist の状態をまとめる。
 * - results を渡した場合は、それを実際の作業結果として使う（統合の検証画面は、製品のデータから作って渡す）。
 *   渡さない場合は api.getResults で取得し、resultsVersion が変わるたびに取得し直す。
 * - 表示の状態（折りたたみ、非表示）は api に保存する。保存に失敗した場合は、保存されている状態に戻す。
 */
export function useGettingStarted({
  viewer,
  api,
  results: externalResults,
  resultsVersion = 0,
}: {
  viewer: OnboardingViewer
  api: OnboardingApi
  results?: OnboardingTaskResults<OnboardingTaskId>
  resultsVersion?: number
}) {
  const scope = viewerScope(viewer)
  const fetched = useBrowseData({
    query: resultsVersion,
    queryKey: `${scope}|${resultsVersion}`,
    scopeKey: scope,
    enabled: !externalResults,
    fetcher: (_, { signal }) => api.getResults(viewer.userId, viewer.workspaceId, { signal }),
  })
  const progress = useBrowseData({
    query: scope,
    scopeKey: scope,
    fetcher: (_, { signal }) => api.getProgress(viewer.userId, viewer.workspaceId, { signal }),
  })
  const guard = useScopeGuard(scope)
  // 保存中の表示の状態。保存を始めたときのスコープと世代（Ticket）と組で持ち、現在のスコープと世代のものだけを使う
  // （A → B → A の最初の A で始めた保存の値を、戻った A で使い続けない）
  const [override, setOverride] = useState<{ ticket: ScopeTicket; visibility: ChecklistVisibility } | null>(null)
  const [notice, setNotice] = useState<{ scope: string; text: string } | null>(null)

  // 再取得中は、同じスコープの前の結果を使う（useBrowseData は別のスコープのデータを返さない）。
  const results = externalResults ?? (fetched.status === "error" ? undefined : fetched.data)
  const visibility = override && guard.isSameScope(override.ticket) ? override.visibility : progress.status === "error" ? undefined : progress.data?.visibility
  const checklist = useMemo(
    () =>
      results && visibility
        ? deriveChecklist({
            tasks: onboardingTaskDefinitions,
            permissions: viewer.permissions,
            audience: viewer.joinedBy === "created" ? "creator" : "invited",
            results,
            visibility,
          })
        : null,
    [results, visibility, viewer.permissions, viewer.joinedBy]
  )

  const setVisibility = (next: ChecklistVisibility) => {
    const ticket = guard.begin("visibility")
    // 前のスコープの描画の関数から呼ばれた場合（無効な Ticket）は、保存を始めない
    if (!guard.isCurrent(ticket)) return
    setOverride({ ticket, visibility: next })
    setNotice(null)
    // この保存の値だけを外す（後から始めた保存の値は残す）
    const clear = () => setOverride((o) => (o?.ticket === ticket ? null : o))
    // 保存の要求は中止しない（中止しても、サーバーで処理されることがあるため）。結果だけを、開始したスコープの最新の要求に反映する。
    api.saveVisibility(viewer.userId, viewer.workspaceId, next).then(
      (saved) => {
        if (!guard.isLatest(ticket)) return clear()
        guard.release(ticket)
        progress.setData((d) => ({ ...d, visibility: saved }), { scopeKey: scope })
        clear()
      },
      (error) => {
        if (!guard.isLatest(ticket)) return clear()
        guard.release(ticket)
        clear()
        if (!isConfirmedFailure(error)) {
          // 保存されたかがわからない（確定した失敗ではない）。保存されている状態を取得し直して表示する。
          progress.reload()
          setNotice({ scope, text: "表示の状態を保存できたかを確認できませんでした。保存されている状態を表示しています。" })
        } else {
          setNotice({ scope, text: "表示の状態を保存できませんでした。もう一度お試しください。" })
        }
      }
    )
  }

  const error = (!externalResults && fetched.status === "error") || progress.status === "error"
  return {
    scope,
    checklist,
    loading: !checklist && !error,
    error,
    notice: notice?.scope === scope ? notice.text : "",
    setVisibility,
    retry: () => {
      if (fetched.status === "error") fetched.reload()
      if (progress.status === "error") progress.reload()
    },
  }
}

export type GettingStartedState = ReturnType<typeof useGettingStarted>

/**
 * Getting Started Checklist の接続。非表示にした場合も、完了していない必須の作業は Alert で示し続ける
 * （非表示を要件の達成として扱わない）。再表示の入口は、製品の決まった場所（ヘッダーなど）に置く。
 * 権限がなく Checklist に表示しない必須の作業が残っている場合は、ほかの利用者（管理者）が行うことを示す
 * （権限で除いたことを、要件の達成として扱わない。示すかどうかと文は、製品のポリシーで決める）。
 */
export function GettingStartedConnected({
  state,
  onOpenTask,
  headingLevel = 2,
  className,
}: {
  state: GettingStartedState
  /** 作業の画面へ移る（製品のルーター）。完了にはしない */
  onOpenTask: (id: OnboardingTaskId) => void
  headingLevel?: 2 | 3
  className?: string
}) {
  const { checklist } = state
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 empty:hidden", className)} data-testid="onb-checklist-region">
      {state.error && (
        <DataRegionError title="利用開始の準備を取得できませんでした" description="ほかの機能はそのまま使えます。" onRetry={state.retry} />
      )}
      {checklist && (
        <GettingStartedChecklist
          data-testid="onb-checklist"
          tabIndex={-1}
          className="outline-none"
          checklist={checklist}
          scopeKey={state.scope}
          headingLevel={headingLevel}
          onVisibilityChange={state.setVisibility}
          onOpenTask={onOpenTask}
          actionLabel={(item) => taskActionLabels[item.id] ?? "作業の画面へ"}
        />
      )}
      {checklist?.presentation === "hidden" && checklist.outstandingRequired.length > 0 && (
        <Alert variant="warning" data-testid="onb-required-notice">
          <AlertTitle>{checklist.outstandingRequired.map((i) => i.title).join("、")}が完了していません</AlertTitle>
          <AlertDescription>試用期間の終了後も使い続けるために必要です。利用開始の準備を非表示にしても、この作業は残ります。</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => onOpenTask(checklist.outstandingRequired[0].id)}>
              {taskActionLabels[checklist.outstandingRequired[0].id] ?? "作業の画面へ"}
            </Button>
          </AlertAction>
        </Alert>
      )}
      {checklist && checklist.outstandingRequiredWithoutPermission.length > 0 && (
        <Alert variant="info" data-testid="onb-required-others-notice">
          <AlertTitle>{checklist.outstandingRequiredWithoutPermission.map((i) => i.title).join("、")}が完了していません</AlertTitle>
          <AlertDescription>試用期間の終了後も使い続けるために必要です。この作業は、権限のある組織の管理者が行います。</AlertDescription>
        </Alert>
      )}
      <p role="status" className="sr-only" data-testid="onb-checklist-notice">
        {state.notice}
      </p>
      {state.notice && <p className="text-ui text-muted-foreground">{state.notice}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- 閉じた案内（アカウント単位）

/**
 * 閉じた Contextual Help の ID。取得が終わるまでは案内を表示しない（閉じた案内が一瞬表示されることを防ぐ）。
 * 保存に失敗した場合も、この画面の間は表示しない（閉じたものを繰り返し出さない）。
 * 閉じた状態のスコープはアカウント（userId）。組織を切り替えても、権限が変わっても、閉じた案内を再び表示しない。
 * 組織や役割で内容が変わる案内は、別の ID にする（例：members-role-tasks）。
 */
export function useDismissedHelp({ userId, api }: { userId: UserId; api: OnboardingApi }) {
  const data = useBrowseData({ query: userId, scopeKey: userId, fetcher: (_, { signal }) => api.getDismissedHelp(userId, { signal }) })
  const guard = useScopeGuard(userId)
  const [local, setLocal] = useState<{ scope: UserId; ids: string[] }>({ scope: userId, ids: [] })
  const localIds = local.scope === userId ? local.ids : []
  const ready = data.status === "ready" || data.status === "refreshing"
  const dismissed = ready ? [...(data.data ?? []), ...localIds] : null
  return {
    /** 閉じた案内の ID。取得が終わるまでは null */
    dismissed,
    dismiss: (id: string) => {
      setLocal({ scope: userId, ids: [...localIds, id] })
      const ticket = guard.begin(id)
      api.dismissHelp(userId, id).then(
        (saved) => {
          if (!guard.isLatest(ticket)) return
          guard.release(ticket)
          data.setData(() => saved, { scopeKey: userId })
        },
        // 保存に失敗しても、この画面の間は表示しない（local に残す）
        () => guard.release(ticket)
      )
    },
  }
}

export type DismissedHelpState = ReturnType<typeof useDismissedHelp>

/** Contextual Help の例：顧客の検索欄の近くに置く。顧客の一覧にデータがあるときだけ表示する */
export function CustomersSearchHelp({
  help,
  eligible,
  focusAfterDismiss,
}: {
  help: DismissedHelpState
  /** 表示の条件（一覧にデータがある、ほかの案内を表示していない） */
  eligible: boolean
  focusAfterDismiss?: React.RefObject<HTMLElement | null>
}) {
  const shown = help.dismissed ? pickGuidance([{ id: helpIds.search, eligible }], help.dismissed) : null
  return (
    <ContextualHelp
      data-testid="onb-help-search"
      dismissed={shown !== helpIds.search}
      onDismiss={() => help.dismiss(helpIds.search)}
      focusAfterDismiss={focusAfterDismiss}
    >
      会社名の一部で検索できます。「株式会社」などの法人の種類は省いても見つかります。
    </ContextualHelp>
  )
}

// ---------------------------------------------------------------- 初回利用の Empty State

/**
 * 顧客の一覧の Empty State。未登録（初回利用）、検索結果 0件、取得失敗を区別する（getBrowseViewState）。
 * Page Header に「顧客を登録」がある場合（headerHasCreate）は、同じ操作を Empty に重ねない。
 */
export function FirstUseEmptyState({
  view,
  space = "real",
  canCreate,
  headerHasCreate,
  onCreate,
  onImport,
  onStartSample,
  startSampleLabel = "サンプルデータで試す",
  onClearSearch,
  onRetry,
}: {
  view: BrowseViewState
  space?: DataSpace
  /** 顧客を登録・取り込む権限がある */
  canCreate: boolean
  /** Page Header に「顧客を登録」がある */
  headerHasCreate: boolean
  onCreate?: () => void
  onImport?: () => void
  /** サンプルデータを使う（利用者が明示的に選ぶ） */
  onStartSample?: () => void
  /** サンプルのボタンの名前（結果が不明な場合は、確認の操作の名前にする） */
  startSampleLabel?: string
  onClearSearch: () => void
  onRetry: () => void
}) {
  if (view === "error")
    return <DataRegionError data-testid="onb-list-error" title="顧客の一覧を取得できませんでした" description="サーバーに接続できませんでした。" onRetry={onRetry} />
  if (view === "no-results")
    return (
      <Empty status="no-results" data-testid="onb-empty" data-view="no-results">
        <EmptyHeader>
          <EmptyTitle>条件に一致する顧客はいません</EmptyTitle>
          <EmptyDescription>検索語を変えるか、検索をクリアしてください。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            検索をクリア
          </Button>
        </EmptyContent>
      </Empty>
    )
  if (view !== "empty") return null
  if (space === "sample")
    return (
      <Empty data-testid="onb-empty" data-view="empty">
        <EmptyHeader>
          <EmptyTitle>サンプルの顧客はありません</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  return (
    <Empty data-testid="onb-empty" data-view="empty">
      <EmptyHeader>
        <EmptyTitle>顧客はまだ登録されていません</EmptyTitle>
        {canCreate ? (
          <EmptyDescription>
            顧客を登録すると、商談と契約の記録を始められます。
            {headerHasCreate ? "ページの上部の「顧客を登録」から 1 件ずつ登録するか、CSV ファイルから取り込みます。" : "1 件ずつ登録するか、CSV ファイルから取り込みます。"}
          </EmptyDescription>
        ) : (
          <EmptyDescription>顧客が登録されると、ここに表示されます。登録は、顧客の登録の権限があるメンバーが行います。</EmptyDescription>
        )}
      </EmptyHeader>
      {canCreate && (
        <EmptyContent>
          {!headerHasCreate && onCreate && <Button onClick={onCreate}>顧客を登録</Button>}
          {onImport && (
            <Button variant="outline" size="sm" onClick={onImport}>
              CSV から取り込む
            </Button>
          )}
          {onStartSample && (
            <Button variant="ghost" size="sm" onClick={onStartSample}>
              {startSampleLabel}
            </Button>
          )}
        </EmptyContent>
      )}
    </Empty>
  )
}

// ---------------------------------------------------------------- 非同期の操作（スコープの境界と二重実行）

type Outcome = { key: string; kind: "success" | "fail" | "unknown" | "not-processed"; text: string } | null
type RunOptions<T> = { success: (v: T) => string; onSuccess?: (v: T) => void; onSettled?: () => void }

/**
 * 変更の操作の実行。
 * - 二重実行を防ぐ（同じ操作の実行中は受け付けない）。操作ごとに要求の ID を付け、模擬のサーバーは同じ ID を 1 回だけ処理する。
 * - 結果が不明な場合は、同じ操作をもう一度実行させない。「処理されたかを確認する」（confirm）で要求の ID を照会し、
 *   処理されていれば成功として扱い、処理されていなければもう一度実行できるようにする。最新の状態（作業結果）も取得し直す。
 * - 確定した失敗（MockRequestError：サーバーが拒否した）だけを失敗とし、それ以外の例外（通信の例外など）は結果が不明として扱う
 *   （サーバーで処理が終わっている可能性があるため。もう一度実行する前に確認する）。
 * - 結果は、開始したときのスコープの最新の要求にだけ反映する（useScopeGuard）。
 * - 画面（Sheet など）を開いたときの Snapshot（capture）を渡した場合は、そのスコープと世代が現在と一致するときだけ始める
 *   （古い画面からの操作を、切り替えた後のスコープで始めない）。
 */
function useActions(scope: string, api: OnboardingApi) {
  const guard = useScopeGuard(scope)
  // 実行中の処理の Ticket。現在のスコープと世代で始めたものだけを「実行中」として示す（isSameScope）。
  // scopeKey の文字列だけで持つと、A → B → A の最初の A の処理が、戻った A で「実行中」のまま残る
  // （その応答は最初の A の世代のため反映せず、記録を消す処理にも届かない）。
  const [pending, setPending] = useState<readonly ScopeTicket[]>([])
  const [outcome, setOutcome] = useState<{ scope: string; value: Outcome }>({ scope, value: null })
  const [unresolved, setUnresolved] = useState<{ scope: string; ids: Record<string, string> }>({ scope, ids: {} })
  const pendingKeys = pending.filter((t) => guard.isSameScope(t)).map((t) => t.key)
  const unresolvedIds = unresolved.scope === scope ? unresolved.ids : {}
  // 実行中の処理（キー → Ticket）。前のスコープ（前の世代）の Ticket は guard.isLatest が false になるため、
  // 描画の中で記録を消さなくても、新しいスコープの操作を妨げない。
  const inflight = useRef(new Map<string, ScopeTicket>())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = useRef(new Map<string, RunOptions<any>>())
  const running = (key: string) => {
    const t = inflight.current.get(key)
    return t !== undefined && guard.isLatest(t)
  }
  const setUnresolvedId = (key: string, id: string | null) =>
    setUnresolved((u) => {
      const ids = { ...(u.scope === scope ? u.ids : {}) }
      if (id) ids[key] = id
      else delete ids[key]
      return { scope, ids }
    })

  const execute = <T,>(
    key: string,
    snapshot: ScopeSnapshot | undefined,
    request: () => Promise<T>,
    handle: (r: { ok: true; value: T } | { ok: false; error: unknown }) => Outcome
  ) => {
    if (running(key)) return false
    const ticket = snapshot ? guard.beginIfCurrent(snapshot, key) : guard.begin(key)
    // 前のスコープの描画の関数から呼ばれた場合（無効な Ticket）も、要求を送らない
    if (!ticket || !guard.isCurrent(ticket)) return false
    inflight.current.set(key, ticket)
    // 現在のスコープの Ticket だけを残す（前のスコープの記録を増やし続けない）
    setPending((p) => [...p.filter((t) => t.key !== key && guard.isSameScope(t)), ticket])
    setOutcome({ scope, value: null })
    const done = (r: { ok: true; value: T } | { ok: false; error: unknown }) => {
      if (inflight.current.get(key) === ticket) inflight.current.delete(key)
      // スコープにかかわらず、この処理の記録を外す（後から始めた処理の記録は消さない）
      setPending((p) => (p.includes(ticket) ? p.filter((t) => t !== ticket) : p))
      if (!guard.isSameScope(ticket)) return
      if (!guard.isLatest(ticket)) return
      guard.release(ticket)
      setOutcome({ scope, value: handle(r) })
    }
    request().then(
      (value) => done({ ok: true, value }),
      (error) => done({ ok: false, error })
    )
    return true
  }

  const run = <T,>(
    key: string,
    // 変更の処理には AbortSignal を渡さない（中止しても、サーバーで処理されることがあるため）。
    fn: (ctx: { requestId: string }) => Promise<T>,
    opts: RunOptions<T>,
    snapshot?: ScopeSnapshot
  ) => {
    // 結果が不明な操作は、処理されたかを確かめるまで、もう一度実行しない。
    if (unresolvedIds[key] || running(key)) return
    const requestId = crypto.randomUUID()
    const started = execute(key, snapshot, () => fn({ requestId }), (r) => {
      opts.onSettled?.()
      if (r.ok) {
        opts.onSuccess?.(r.value)
        return { key, kind: "success", text: opts.success(r.value) }
      }
      if (!isConfirmedFailure(r.error)) {
        setUnresolvedId(key, requestId)
        return { key, kind: "unknown", text: "結果を確認できませんでした。もう一度行う前に、処理されたかを確認してください。" }
      }
      return { key, kind: "fail", text: `${r.error.message}。もう一度お試しください。` }
    })
    if (started) options.current.set(key, opts)
  }

  const confirm = (key: string) => {
    const requestId = unresolvedIds[key]
    const opts = options.current.get(key)
    if (!requestId || !opts) return
    execute(key, undefined, () => api.findRequest(requestId), (r) => {
      if (!r.ok) return { key, kind: "unknown", text: "処理されたかを確認できませんでした。もう一度確認してください。" }
      setUnresolvedId(key, null)
      opts.onSettled?.()
      if (r.value === null) return { key, kind: "not-processed", text: "処理されていませんでした。もう一度行えます。" }
      opts.onSuccess?.(r.value)
      return { key, kind: "success", text: `処理されていました。${opts.success(r.value)}` }
    })
  }

  return {
    run,
    confirm,
    /** 画面（Sheet など）を開くときに呼び、run に渡す（イベントの処理と useEffect の中で呼ぶ） */
    capture: guard.capture,
    /** Snapshot が現在のスコープと世代のものか（描画の中でも呼べる） */
    isCurrent: guard.isCurrent,
    pending: (key: string) => pendingKeys.includes(key),
    /** 結果が不明で、処理されたかをまだ確かめていない */
    unresolved: (key: string) => Boolean(unresolvedIds[key]),
    outcome: outcome.scope === scope ? outcome.value : null,
  }
}

type Actions = ReturnType<typeof useActions>

/** 操作のボタン。結果が不明な間は、同じ操作の代わりに「処理されたかを確認する」を置く */
function ActionButton({
  actions,
  actionKey,
  onRun,
  type = "button",
  variant,
  size,
  testId,
  children,
}: {
  actions: Actions
  actionKey: string
  onRun?: () => void
  type?: "button" | "submit"
  variant?: "default" | "outline" | "secondary" | "ghost"
  size?: "sm" | "default"
  testId?: string
  children: ReactNode
}) {
  if (actions.unresolved(actionKey))
    return (
      <Button type="button" variant="outline" size={size} loading={actions.pending(actionKey)} onClick={() => actions.confirm(actionKey)} data-testid={testId ? `${testId}-confirm` : undefined}>
        処理されたかを確認する
      </Button>
    )
  return (
    <Button type={type} variant={variant} size={size} loading={actions.pending(actionKey)} onClick={onRun} data-testid={testId}>
      {children}
    </Button>
  )
}

function ActionResult({ outcome, keys, testId }: { outcome: Outcome; keys: string[]; testId?: string }) {
  const value = outcome && keys.includes(outcome.key) ? outcome : null
  return (
    <p role="status" data-testid={testId} data-kind={value?.kind} className={cn("min-h-6 text-ui", value?.kind === "fail" ? "text-destructive" : "text-muted-foreground")}>
      {value?.text}
    </p>
  )
}

// ---------------------------------------------------------------- 小さな製品の画面（組み合わせの例）

/**
 * Onboarding の組み合わせの例。顧客の一覧（初回利用の Empty State、サンプルデータ、Contextual Help）、
 * 作業の画面（取り込み、メンバー、支払い、プロフィール）、Getting Started Checklist を、1 つの製品の画面として示す。
 * 作業の結果はすべて api（模擬のサーバー）に保存し、Checklist の完了は api の実際の作業結果から判定する。
 */
export function OnboardingProduct({
  viewer,
  api,
  titleAs = "h3",
  initialSpace = "real",
  onChecklistChange,
}: {
  viewer: OnboardingViewer
  api: OnboardingApi
  /** Checklist の導出の結果（状態の表示に使う） */
  onChecklistChange?: (checklist: Checklist<OnboardingTaskId> | null) => void
  /** 画面の見出しの要素（資料のページの中では h3、全画面では h1） */
  titleAs?: Heading
  /** 最初に表示するデータの領域（組織の作成で「サンプルデータで試す」を選んだ場合は sample） */
  initialSpace?: DataSpace
}) {
  const scope = viewerScope(viewer)
  const [nav, setNav] = useState<{ scope: string; screen: ProductScreen; space: DataSpace }>({ scope, screen: "customers", space: initialSpace })
  const screen = nav.scope === scope ? nav.screen : "customers"
  const space = nav.scope === scope ? nav.space : "real"
  const [announce, setAnnounce] = useState("")
  const [createRequested, setCreateRequested] = useState(false)
  const onCreateHandled = useCallback(() => setCreateRequested(false), [])
  const go = (s: ProductScreen, sp: DataSpace = space) => {
    setNav({ scope, screen: s, space: sp })
    setAnnounce(`${screenLabels[s]}${sp === "sample" ? "（サンプル）" : ""}の画面を表示しています`)
  }
  const [version, setVersion] = useState(0)
  const changed = () => setVersion((v) => v + 1)
  const gs = useGettingStarted({ viewer, api, resultsVersion: version })
  const help = useDismissedHelp({ userId: viewer.userId, api })
  const reopenRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const focusAfter = useRef<"reopen" | "checklist" | null>(null)
  const hidden = gs.checklist?.presentation === "hidden"
  const onChecklistRef = useRef(onChecklistChange)
  onChecklistRef.current = onChecklistChange
  useEffect(() => onChecklistRef.current?.(gs.checklist), [gs.checklist])

  // 非表示にしたら再表示の入口へ、再表示したら Checklist へフォーカスを移す（<body> に落とさない）。
  useEffect(() => {
    if (focusAfter.current === "reopen" && hidden) reopenRef.current?.focus()
    if (focusAfter.current === "checklist" && !hidden) rootRef.current?.querySelector<HTMLElement>("[data-slot=getting-started]")?.focus()
    focusAfter.current = null
  }, [hidden])

  const screens: ProductScreen[] = (
    [
      ["customers", true],
      ["import", can(viewer, "customers.edit")],
      ["members", can(viewer, "members.view")],
      ["billing", can(viewer, "billing.manage")],
      ["profile", true],
    ] as const
  )
    .filter(([, ok]) => ok)
    .map(([s]) => s)

  const state = {
    ...gs,
    setVisibility: (v: ChecklistVisibility) => {
      if (v === "hidden") focusAfter.current = "reopen"
      gs.setVisibility(v)
    },
  }
  const Title = titleAs

  return (
    <div
      ref={rootRef}
      className="@container/product flex min-w-0 flex-col gap-6"
      data-testid="onb-product"
      data-scope={scope}
      // 閉じた案内の取得が終わったか（検品で、取得の後に案内が表示されないことを確かめる）
      data-help={help.dismissed ? "ready" : "loading"}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
        <p className="text-ui font-medium">{api.workspaceName(viewer.workspaceId)}</p>
        <nav aria-label="製品の画面（例）" className="flex min-w-0 flex-wrap gap-1">
          {screens.map((s) => (
            <Button key={s} variant={s === screen ? "secondary" : "ghost"} size="sm" aria-current={s === screen ? "page" : undefined} onClick={() => go(s, "real")}>
              {screenLabels[s]}
            </Button>
          ))}
        </nav>
        {hidden && (
          <Button
            ref={reopenRef}
            variant="ghost"
            size="sm"
            className="ms-auto"
            data-testid="onb-checklist-reopen"
            onClick={() => {
              focusAfter.current = "checklist"
              gs.setVisibility("expanded")
            }}
          >
            利用開始の準備を表示
          </Button>
        )}
      </div>

      <GettingStartedConnected
        state={state}
        headingLevel={titleAs === "h1" ? 2 : 3}
        onOpenTask={(id) => {
          go(taskScreens[id] ?? "customers", "real")
          if (id === "first-customer") setCreateRequested(true)
        }}
      />
      <p role="status" className="sr-only" data-testid="onb-screen-status">
        {announce}
      </p>

      {screen === "customers" && (
        <CustomersScreen
          viewer={viewer}
          api={api}
          space={space}
          onSpaceChange={(sp) => go("customers", sp)}
          onImport={() => go("import", "real")}
          onChanged={changed}
          help={help}
          createRequested={createRequested}
          onCreateHandled={onCreateHandled}
          Title={Title}
        />
      )}
      {screen === "import" && <ImportScreen viewer={viewer} api={api} onChanged={changed} onDone={() => go("customers", "real")} Title={Title} />}
      {screen === "members" && <MembersScreen viewer={viewer} api={api} onChanged={changed} help={help} Title={Title} />}
      {screen === "billing" && <BillingScreen viewer={viewer} api={api} onChanged={changed} Title={Title} />}
      {screen === "profile" && <ProfileScreen viewer={viewer} api={api} onChanged={changed} Title={Title} />}
    </div>
  )
}

function ScreenHeader({ Title, title, id, count, actions }: { Title: Heading; title: string; id?: string; count?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <Title id={id} className="text-section">
          {title}
        </Title>
        {count}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

function CustomersScreen({
  viewer,
  api,
  space,
  onSpaceChange,
  onImport,
  onChanged,
  help,
  createRequested,
  onCreateHandled,
  Title,
}: {
  viewer: OnboardingViewer
  api: OnboardingApi
  /** Checklist の作業から移った（登録の Sheet を開く） */
  createRequested: boolean
  onCreateHandled: () => void
  space: DataSpace
  onSpaceChange: (space: DataSpace) => void
  onImport: () => void
  onChanged: () => void
  help: DismissedHelpState
  Title: Heading
}) {
  const scope = `${viewerScope(viewer)}|${space}`
  const canCreate = can(viewer, "customers.edit")
  const [search, setSearch] = useState({ scope, value: "" })
  const term = search.scope === scope ? search.value : ""
  const list = useBrowseData({
    query: { space, term },
    scopeKey: scope,
    fetcher: (q, { signal }) => api.listCustomers(viewer.workspaceId, q.space, q.term, { signal }),
  })
  const view = getBrowseViewState({ status: list.status === "idle" ? "loading" : list.status, count: list.data?.total ?? 0, filtered: term.trim() !== "" })
  const actions = useActions(scope, api)
  // 登録の Sheet を開いたときのスコープと世代。利用者、組織、権限、データの領域が変わったら（A → B → A を含む）、Sheet を閉じた状態として扱い、
  // 前のスコープで入力した内容を、新しいスコープで登録しない。
  const [sheetSnapshot, setSheetSnapshot] = useState<ScopeSnapshot | null>(null)
  const sheet = sheetSnapshot !== null && actions.isCurrent(sheetSnapshot)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [discard, setDiscard] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  // Checklist の「顧客を登録」から移った場合は、登録の Sheet を開く（登録するまで完了にしない）。
  const openSheet = () => {
    setName("")
    setNameError("")
    setSheetSnapshot(actions.capture())
  }
  useEffect(() => {
    if (!createRequested) return
    if (canCreate) openSheet()
    onCreateHandled()
    // openSheet は描画ごとに作る関数。createRequested の変化だけで実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequested, canCreate, onCreateHandled])
  const hasAny = (list.data?.all ?? 0) > 0
  const sampleAvailable = list.data?.sampleAvailable ?? false
  const sample = space === "sample"

  const closeSheet = () => {
    setSheetSnapshot(null)
    setName("")
    setNameError("")
  }
  const submit = () => {
    // 結果が不明な間は、もう一度登録せず、登録されたかを確かめる（Enter で送信した場合も）。
    if (actions.unresolved("add")) return actions.confirm("add")
    const company = name.trim()
    if (!company) {
      setNameError("会社名を入力してください")
      return
    }
    if (!sheetSnapshot) return
    actions.run(
      "add",
      (ctx) => api.addCustomer(viewer.workspaceId, space, company, ctx),
      {
        success: (c) => (sample ? `サンプルに「${c.company}」を追加しました。` : `「${c.company}」を登録しました。`),
        onSuccess: closeSheet,
        onSettled: () => {
          list.reload()
          // 実際のデータの変更だけが、利用開始の準備の結果に関係する（サンプルは関係しない）。
          if (!sample) onChanged()
        },
      },
      // Sheet を開いたときのスコープと世代が現在と一致しない場合は、登録を始めない
      sheetSnapshot
    )
  }

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby={titleId} data-testid="onb-customers" data-space={space}>
      <ScreenHeader
        Title={Title}
        id={titleId}
        title={sample ? "顧客（サンプル）" : "顧客"}
        count={
          list.isCurrent && (
            <span className="text-ui text-muted-foreground tabular-nums" data-testid="onb-customers-count">
              {sample ? "サンプル " : ""}
              {list.data!.total} 件
            </span>
          )
        }
        actions={
          canCreate && (
            <Button onClick={openSheet} data-testid="onb-create">
              {sample ? "サンプルに追加" : "顧客を登録"}
            </Button>
          )
        }
      />

      {sample && (
        <Alert variant="info" data-testid="onb-sample-banner">
          <AlertTitle>サンプルデータを表示しています</AlertTitle>
          <AlertDescription>実際の顧客とは別の領域に保存しています。サンプルの顧客は、件数の集計、請求、利用開始の準備、メールの送信などの実際の処理の対象になりません。</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => onSpaceChange("real")}>
              実際のデータに戻る
            </Button>
            <ActionButton
              actions={actions}
              actionKey="delete-sample"
              variant="outline"
              size="sm"
              onRun={() =>
                actions.run("delete-sample", (ctx) => api.deleteSample(viewer.workspaceId, ctx), {
                  success: () => "サンプルデータを削除しました。",
                  onSuccess: () => onSpaceChange("real"),
                  onSettled: list.reload,
                })
              }
            >
              サンプルを削除
            </ActionButton>
          </AlertAction>
        </Alert>
      )}
      {!sample && sampleAvailable && (
        <div className="flex flex-wrap items-center gap-x-3 text-ui text-muted-foreground">
          サンプルデータがあります（実際の顧客には含まれません）。
          <Button variant="link" size="sm" onClick={() => onSpaceChange("sample")}>
            サンプルを表示
          </Button>
        </div>
      )}

      {(hasAny || term !== "") && (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="relative max-w-md">
            <Search aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              aria-label="顧客を検索"
              placeholder="会社名で検索"
              className="ps-11"
              value={term}
              onChange={(e) => setSearch({ scope, value: e.target.value })}
              data-testid="onb-search"
            />
          </div>
          {!sample && <CustomersSearchHelp help={help} eligible={view === "ready" && term === ""} focusAfterDismiss={searchRef} />}
        </div>
      )}

      <div aria-busy={list.status === "loading" || list.status === "refreshing" || undefined} className="flex min-w-0 flex-col gap-2" data-testid="onb-list" data-view={view}>
        <DataRefreshIndicator active={list.status === "refreshing"} />
        {(view === "ready" || view === "refreshing") && list.data && (
          <ul className="flex flex-col">
            {list.data.rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 border-b border-border py-3 text-ui last:border-b-0">
                <span className="min-w-0 [overflow-wrap:anywhere]">{c.company}</span>
                {c.sample && <span className="text-caption text-muted-foreground">サンプル</span>}
              </li>
            ))}
            {list.data.total > list.data.rows.length && (
              <li className="pt-3 text-caption text-muted-foreground">ほか {list.data.total - list.data.rows.length} 件</li>
            )}
          </ul>
        )}
        <FirstUseEmptyState
          view={view}
          space={space}
          canCreate={canCreate}
          headerHasCreate={canCreate}
          onImport={onImport}
          startSampleLabel={actions.unresolved("start-sample") ? "サンプルを用意できたかを確認する" : undefined}
          onStartSample={
            sampleAvailable
              ? undefined
              : actions.unresolved("start-sample")
                ? () => actions.confirm("start-sample")
                : () =>
                    actions.run("start-sample", (ctx) => api.startSample(viewer.workspaceId, ctx), {
                      success: (n) => `サンプルの顧客を ${n} 件用意しました。`,
                      onSuccess: () => onSpaceChange("sample"),
                      onSettled: list.reload,
                    })
          }
          onClearSearch={() => {
            setSearch({ scope, value: "" })
            searchRef.current?.focus()
          }}
          onRetry={list.reload}
        />
      </div>
      {/* 登録の Sheet を開いている間は、登録の結果を Sheet の中で示す（読み上げを重ねない） */}
      <ActionResult outcome={actions.outcome} keys={sheet ? ["start-sample", "delete-sample"] : ["add", "start-sample", "delete-sample"]} testId="onb-customers-result" />

      <Sheet open={sheet} onOpenChange={(o) => (o ? openSheet() : closeSheet())} unsavedChanges={name.trim() !== ""} onDiscardRequest={() => setDiscard(true)}>
        <SheetContent size="sm" data-testid="onb-create-sheet">
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <SheetHeader>
              <SheetTitle>{sample ? "サンプルに顧客を追加" : "顧客を登録"}</SheetTitle>
              <SheetDescription>
                {sample ? "サンプルの領域に追加します。実際の顧客と利用開始の準備には含まれません。" : "会社名だけで登録できます。そのほかの項目は、あとで追加できます。"}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <Field invalid={!!nameError}>
                <FieldLabel>会社名</FieldLabel>
                <Input value={name} required autoComplete="organization" onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError("")
                }} data-testid="onb-create-name" />
                {nameError && <FieldError>{nameError}</FieldError>}
              </Field>
              <ActionResult outcome={actions.outcome} keys={["add"]} testId="onb-create-result" />
            </SheetBody>
            <SheetFooter>
              <Button type="button" variant="ghost" onClick={() => (name.trim() ? setDiscard(true) : closeSheet())}>
                キャンセル
              </Button>
              <ActionButton actions={actions} actionKey="add" type="submit" testId="onb-create-submit">
                {sample ? "サンプルに追加" : "登録する"}
              </ActionButton>
            </SheetFooter>
          </form>
          <DiscardChangesAlert
            open={discard}
            onOpenChange={setDiscard}
            onDiscard={() => {
              setDiscard(false)
              closeSheet()
            }}
          />
        </SheetContent>
      </Sheet>
    </section>
  )
}

function ImportScreen({ viewer, api, onChanged, onDone, Title }: { viewer: OnboardingViewer; api: OnboardingApi; onChanged: () => void; onDone: () => void; Title: Heading }) {
  const actions = useActions(viewerScope(viewer), api)
  const [imported, setImported] = useState<number | null>(null)
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="onb-import">
      <ScreenHeader Title={Title} title="顧客を取り込む" />
      <p className="max-w-[40rem] text-ui text-muted-foreground">
        CSV ファイルの 1 行が 1 件の顧客になります。この例では、模擬の CSV ファイル（3 件）を取り込みます。実際のファイルは読み込みません。
      </p>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          actions={actions}
          actionKey="import"
          testId="onb-import-run"
          onRun={() =>
            actions.run("import", (ctx) => api.importCustomers(viewer.workspaceId, ctx), {
              success: (n) => `${n} 件を取り込みました。`,
              onSuccess: setImported,
              onSettled: onChanged,
            })
          }
        >
          模擬の CSV ファイルを取り込む
        </ActionButton>
        {imported !== null && (
          <Button variant="outline" onClick={onDone}>
            顧客の一覧へ
          </Button>
        )}
      </div>
      <ActionResult outcome={actions.outcome} keys={["import"]} testId="onb-import-result" />
    </section>
  )
}

function MembersScreen({ viewer, api, onChanged, help, Title }: { viewer: OnboardingViewer; api: OnboardingApi; onChanged: () => void; help: DismissedHelpState; Title: Heading }) {
  const actions = useActions(viewerScope(viewer), api)
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const manage = can(viewer, "members.manage")
  const shown = manage && help.dismissed ? pickGuidance([{ id: helpIds.roleTasks, eligible: true }], help.dismissed) : null
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="onb-members">
      <ScreenHeader Title={Title} title="メンバー" />
      {manage ? (
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (actions.unresolved("invite")) return actions.confirm("invite")
            const to = email.trim()
            if (!/^[^\s@]+@[^\s@]+$/.test(to)) {
              setError("メールアドレスを入力してください（例：name@example.com）")
              return
            }
            actions.run("invite", (ctx) => api.invite(viewer.workspaceId, to, ctx), {
              success: () => `${to} に招待を送りました（模擬。メールは送信しません）。`,
              onSuccess: () => setEmail(""),
              onSettled: onChanged,
            })
          }}
        >
          <Field invalid={!!error}>
            <FieldLabel>招待するメンバーのメールアドレス</FieldLabel>
            <Input ref={inputRef} type="email" autoComplete="off" value={email} onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError("")
            }} data-testid="onb-invite-email" />
            <FieldDescription>招待のメールは模擬の処理で、実際には送信しません。</FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <ContextualHelp
            data-testid="onb-help-roles"
            dismissed={shown !== helpIds.roleTasks}
            onDismiss={() => help.dismiss(helpIds.roleTasks)}
            focusAfterDismiss={inputRef}
          >
            招待したメンバーには、ロールの権限で行える作業だけが利用開始の準備に表示されます。組織で完了した作業は、もう一度求めません。
          </ContextualHelp>
          <div>
            <ActionButton actions={actions} actionKey="invite" type="submit" testId="onb-invite-submit">
              招待を送る
            </ActionButton>
          </div>
        </form>
      ) : (
        <p className="text-ui text-muted-foreground">メンバーの招待は、組織の管理者が行います。</p>
      )}
      <ActionResult outcome={actions.outcome} keys={["invite"]} testId="onb-invite-result" />
    </section>
  )
}

function BillingScreen({ viewer, api, onChanged, Title }: { viewer: OnboardingViewer; api: OnboardingApi; onChanged: () => void; Title: Heading }) {
  const actions = useActions(viewerScope(viewer), api)
  // 請求の対象の件数（模擬）。サーバーが実際の領域だけを数える（サンプルの顧客を含めない）。
  const usage = useBrowseData({
    query: viewer.workspaceId,
    scopeKey: viewerScope(viewer),
    fetcher: (workspaceId, { signal }) => api.getUsage(workspaceId, { signal }),
  })
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="onb-billing">
      <ScreenHeader Title={Title} title="支払い" />
      <p className="max-w-[40rem] text-ui text-muted-foreground">試用期間の終了後も使い続けるには、支払い方法の登録が必要です。この例では、カードの番号を入力せずに模擬の支払い方法を登録します。</p>
      <p className="text-ui text-muted-foreground tabular-nums" data-testid="onb-billing-usage">
        {usage.isCurrent && usage.data ? `請求の対象の顧客（模擬）：${usage.data.customers} 件。サンプルの顧客は含めません。` : "\u00a0"}
      </p>
      <div>
        <ActionButton
          actions={actions}
          actionKey="billing"
          onRun={() =>
            actions.run("billing", (ctx) => api.registerBilling(viewer.workspaceId, ctx), {
              success: () => "支払い方法を登録しました（模擬）。",
              onSettled: onChanged,
            })
          }
        >
          模擬の支払い方法を登録する
        </ActionButton>
      </div>
      <ActionResult outcome={actions.outcome} keys={["billing"]} testId="onb-billing-result" />
    </section>
  )
}

function ProfileScreen({ viewer, api, onChanged, Title }: { viewer: OnboardingViewer; api: OnboardingApi; onChanged: () => void; Title: Heading }) {
  const actions = useActions(viewerScope(viewer), api)
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="onb-profile">
      <ScreenHeader Title={Title} title="プロフィール" />
      <p className="text-ui text-muted-foreground">
        {/* 新規登録した直後の利用者は、共通のモックデータ（model.ts の users）にない */}
        {viewer.userId in users ? `${users[viewer.userId].name}（${users[viewer.userId].email}）。` : ""}プロフィールの写真は、すべての組織で共通です。
      </p>
      <div>
        <ActionButton
          actions={actions}
          actionKey="avatar"
          onRun={() =>
            actions.run("avatar", (ctx) => api.setAvatar(viewer.userId, ctx), {
              success: () => "プロフィールの写真を設定しました（模擬の画像）。",
              onSettled: onChanged,
            })
          }
        >
          模擬の写真を設定する
        </ActionButton>
      </div>
      <ActionResult outcome={actions.outcome} keys={["avatar"]} testId="onb-profile-result" />
    </section>
  )
}

// ---------------------------------------------------------------- 組織の作成（Multi-step Workflow）

type StepId = SetupDraft["step"]

const newDraft = (requestId = ""): SetupDraft => ({
  // 作成の要求の ID。描画中に乱数を使わないよう、効果とイベントの中で作る。
  requestId,
  step: "org",
  values: { name: "", usage: "team", invites: "", start: "empty" },
  skipped: [],
})

const parseInvites = (s: string) =>
  s
    .split(/[\s,、]+/)
    .map((x) => x.trim())
    .filter(Boolean)

/** フォームの値。skipInvite は、任意の招待の手順をスキップした（入力していても送信しない） */
type SetupValues = SetupDraft["values"] & { skipInvite: boolean }

const setupFields: FormFields<SetupValues> = {
  name: { label: "組織名", required: true, requiredMessage: "組織名を入力してください", normalize: (v) => v.trim() },
  usage: { label: "使い方" },
  invites: {
    label: "招待するメンバーのメールアドレス",
    // 自分だけで使う場合と、スキップした場合は、検証と送信から除く（値は残す）
    active: (v) => v.usage === "team" && !v.skipInvite,
    validate: (v) => {
      const bad = parseInvites(v).find((x) => !/^[^\s@]+@[^\s@]+$/.test(x))
      return bad ? `「${bad}」はメールアドレスの形式ではありません` : null
    },
  },
  start: { label: "最初に表示する顧客の一覧" },
  skipInvite: { label: "メンバーの招待" },
}

const stepFields: Record<StepId, (keyof SetupValues)[]> = { org: ["name", "usage"], invite: ["invites"], data: ["start"] }

/** 必須の手順（組織名）と任意の手順（招待、データの始め方）。任意の手順は Stepper の名前でも示す */
const stepMeta: Record<StepId, { title: string; required: boolean }> = {
  org: { title: "組織を作成", required: true },
  invite: { title: "メンバーを招待", required: false },
  data: { title: "顧客データの始め方", required: false },
}

/** 分岐で不要になった手順を除いた、現在の手順の並び。自分だけで使う場合は招待の手順を除く */
export const setupStepsOf = (values: Pick<SetupDraft["values"], "usage">): StepDefinition<StepId>[] =>
  (values.usage === "team" ? (["org", "invite", "data"] as const) : (["org", "data"] as const)).map((id) => ({
    id,
    label: stepMeta[id].required ? stepMeta[id].title : `${stepMeta[id].title}（任意）`,
  }))

const valuesOf = (draft: SetupDraft): SetupValues => ({ ...draft.values, skipInvite: draft.skipped.includes("invite") })

/**
 * 組織の作成。Multi-step Workflow（useStepFlow、Stepper、useFormState、handleSubmit）と Unsaved Changes で作る。
 * - 必須（組織名）と任意（招待、データの始め方）を区別し、任意の手順はスキップできる。合理的な初期値を用意する。
 * - 手順を移るたびに途中の入力を api に保存する（下書き）。再マウント（再読み込み、別の端末）では続きから再開する。
 * - 自分だけで使う場合は、招待の手順を除く（入力していても送信しない）。
 * - 作成の要求の ID（requestId）で、同じ組織を二重に作成しない。結果が不明な場合は、作成されたかを確かめるまで作成し直せない。
 * - 作成の後は、成功の画面を挟まずに onComplete で製品の利用画面へ移る。
 * - 前回の手順の保存の後に入力した内容は、移動（UnsavedChangesProvider の中）と再読み込みの前に確かめる。
 */
export function CreateOrganizationSetup({
  userId,
  api,
  onComplete,
  onActiveChange,
  titleAs = "h3",
}: {
  userId: UserId
  api: OnboardingApi
  /** 作成した。成功の画面を挟まずに、製品の利用画面へ移る */
  onComplete: (result: { workspaceId: string; start: "empty" | "sample" }) => void
  /** 途中の入力の有無（状態の表示に使う） */
  onActiveChange?: (state: { hasDraft: boolean }) => void
  titleAs?: Heading
}) {
  const guard = useScopeGuard(userId)
  const [phase, setPhase] = useState<"loading" | "ready" | "load-error">("loading")
  const [draft, setDraft] = useState<SetupDraft>(() => newDraft())
  const [resumed, setResumed] = useState(false)
  const [restarted, setRestarted] = useState(false)
  const [saveNote, setSaveNote] = useState("")
  const [loadToken, setLoadToken] = useState(0)
  const onActiveRef = useRef(onActiveChange)
  onActiveRef.current = onActiveChange

  useEffect(() => {
    const ticket = guard.begin("load")
    setPhase("loading")
    api.loadDraft(userId, { signal: ticket.signal }).then(
      (saved) => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        if (saved) {
          setDraft(saved)
          setResumed(true)
        } else setDraft(newDraft(crypto.randomUUID()))
        onActiveRef.current?.({ hasDraft: !!saved })
        setPhase("ready")
      },
      () => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        setPhase("load-error")
      }
    )
  }, [userId, loadToken, api, guard])

  // 最初から入力し直す：保存した途中の入力を削除し、新しい作成の要求の ID のフォームを作り直す（key で再マウント）
  const restart = () => {
    const ticket = guard.begin("save")
    setSaveNote("")
    setDraft(newDraft(crypto.randomUUID()))
    setResumed(false)
    setRestarted(true)
    api.saveDraft(userId, null).then(
      () => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        onActiveRef.current?.({ hasDraft: false })
      },
      () => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        setSaveNote("保存した途中の入力を削除できませんでした。もう一度開くと、前回の入力から再開します。")
      }
    )
  }

  if (phase === "load-error")
    return (
      <DataRegionError title="途中の入力を読み込めませんでした" description="もう一度読み込むか、最初から入力してください。" onRetry={() => setLoadToken((t) => t + 1)} data-testid="onb-setup-load-error" />
    )
  if (phase === "loading")
    return (
      <div aria-busy="true" className="min-h-64" data-testid="onb-setup-loading">
        <p className="sr-only">読み込み中</p>
      </div>
    )

  // 利用者と作成の要求ごとに、フォームと手順の状態を作り直す（新しいスコープは initialValues から始める）
  return (
    <SetupForm
      key={`${userId}:${draft.requestId}`}
      userId={userId}
      api={api}
      draft={draft}
      resumed={resumed}
      focusOnMount={restarted}
      onRestart={restart}
      saveNote={saveNote}
      setSaveNote={setSaveNote}
      onComplete={onComplete}
      onDraftSaved={(hasDraft) => onActiveRef.current?.({ hasDraft })}
      titleAs={titleAs}
    />
  )
}

function SetupForm({
  userId,
  api,
  draft,
  resumed,
  focusOnMount,
  onRestart,
  saveNote,
  setSaveNote,
  onComplete,
  onDraftSaved,
  titleAs,
}: {
  userId: UserId
  api: OnboardingApi
  draft: SetupDraft
  resumed: boolean
  focusOnMount: boolean
  onRestart: () => void
  saveNote: string
  setSaveNote: (note: string) => void
  onComplete: (result: { workspaceId: string; start: "empty" | "sample" }) => void
  onDraftSaved: (hasDraft: boolean) => void
  titleAs: Heading
}) {
  const idPrefix = useId()
  const fieldId = (name: keyof SetupValues) => `${idPrefix}-${name}`
  const guard = useScopeGuard(userId)
  const form = useFormState<SetupValues>({ initialValues: valuesOf(draft), fields: setupFields })
  const steps = setupStepsOf(form.values)
  const blocked = new Set(form.blockers.map((b) => b.name))
  const isComplete = (id: StepId) => !stepFields[id].some((f) => blocked.has(f))
  // 下書きの現在の手順から再開する。手前の手順は、次へで進んだ（完了した）ものとして扱う
  const [initialFlow] = useState(() => {
    const ids = setupStepsOf(draft.values).map((s) => s.id)
    const at = Math.max(0, ids.indexOf(draft.step))
    return { current: ids[at], reached: ids.slice(0, at + 1), completed: ids.slice(0, at) }
  })
  const flow = useStepFlow<StepId>({ steps, isComplete, initial: initialFlow })
  const step: StepId = flow.current ?? "org"
  const meta = stepMeta[step]
  const Title = titleAs
  const [draftSaving, setDraftSaving] = useState(false)
  const [check, setCheck] = useState<"idle" | "checking" | "not-created">("idle")
  const [confirmRestart, setConfirmRestart] = useState(false)
  const headingEl = useRef<HTMLElement | null>(null)
  const noticeId = `${idPrefix}-notice`

  // 最初から入力し直した後は、最初の手順の見出しにフォーカスを移す（useStepFlow は最初の表示では移さない）
  useEffect(() => {
    if (focusOnMount) headingEl.current?.focus()
    // マウントの時だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 手順を移ったら、途中の入力を下書きとして保存する。保存できた値を基準値にする（未保存の変更の確認に使う）
  const lastStep = useRef(step)
  useEffect(() => {
    if (lastStep.current === step) return
    lastStep.current = step
    const values = form.values
    const next: SetupDraft = {
      requestId: draft.requestId,
      step,
      values: { name: values.name, usage: values.usage, invites: values.invites, start: values.start },
      skipped: values.skipInvite ? ["invite"] : [],
    }
    const ticket = guard.begin("save")
    setSaveNote("")
    setDraftSaving(true)
    api.saveDraft(userId, next).then(
      () => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        setDraftSaving(false)
        form.markSaved(values)
        onDraftSaved(true)
      },
      () => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        setDraftSaving(false)
        setSaveNote("途中の入力を保存できませんでした。この画面を閉じると、入力した内容は失われます。")
      }
    )
  }, [step, form, draft.requestId, guard, api, userId, setSaveNote, onDraftSaved])

  const unknown = form.status === "unknown"
  // 前回の手順の保存の後の入力と、結果が不明な作成を、移動と再読み込みから守る（下書きの保存中は、終わるまで待つ）
  useUnsavedChanges({ dirty: form.isDirty || unknown, saving: draftSaving, unknown, label: "組織の作成", revision: form.revision, onDiscard: form.discard })

  // 作成した組織。handleSubmit の onSuccess（世代が変わっていない場合だけ呼ばれる）で使う
  const created = useRef<string | null>(null)
  const submit = form.handleSubmit(
    async (values) => {
      setCheck("idle")
      // 分岐で不要になった手順（自分だけで使う場合の招待）と、スキップした手順の入力は送信しない（active で除かれ、values に含まれない）。
      const invites = values.invites !== undefined ? parseInvites(values.invites) : []
      try {
        const r = await api.createWorkspace(userId, { requestId: draft.requestId, name: (values.name ?? "").trim(), invites, start: values.start ?? "empty" })
        created.current = r.workspaceId
        return { status: "success" }
      } catch (error) {
        // 確定した失敗だけを、もう一度作成できる状態にする。それ以外（通信の例外など）は、作成されたかを確かめる。
        return isConfirmedFailure(error)
          ? { status: "failed", formError: "入力した内容は残っています。もう一度お試しください。" }
          : { status: "unknown", formError: "通信が途中で切れました。もう一度作成する前に、作成されたかを確かめます。" }
      }
    },
    {
      onBlocked: () => {
        const target = flow.firstIncomplete()
        if (target) flow.goTo(target)
      },
      // 閉じた画面（アンマウントの後）、別の利用者に変わった後の応答では呼ばれない
      onSuccess: (saved) => {
        if (created.current) onComplete({ workspaceId: created.current, start: saved.start })
      },
    }
  )

  // 次へ、または最後の手順では作成。完了していない場合は、この手順の項目だけエラーを示し、最初の項目へフォーカスを移す
  const advance = () => {
    if (flow.isLast) {
      void submit()
      return
    }
    if (!flow.next()) {
      form.reveal(stepFields[step])
      const first = form.blockers.find((b) => stepFields[step].includes(b.name))
      if (first) focusFormControl(fieldId(first.name))
    }
  }
  // スキップと、招待の手順の次へは、skipInvite を変えた後の描画（検証の対象が変わった後）で進む
  const [advanceRequest, setAdvanceRequest] = useState(0)
  useEffect(() => {
    if (advanceRequest) advance()
    // advanceRequest が変わったときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceRequest])
  const requestAdvance = (skipInvite: boolean) => {
    if (form.values.skipInvite !== skipInvite) form.setValue("skipInvite", skipInvite, { commit: true })
    setAdvanceRequest((n) => n + 1)
  }
  const onNext = () => {
    // 招待の手順：入力がない場合はスキップとして扱う。入力がある場合は、スキップしていても検証して送信の対象に戻す
    if (step === "invite") requestAdvance(parseInvites(form.values.invites).length === 0)
    else advance()
  }

  const busyNow = () => check === "checking" || form.submitting
  const confirm = () => {
    if (busyNow() || !unknown) return
    const ticket = guard.begin("check")
    setCheck("checking")
    api.findCreated(userId, draft.requestId, { signal: ticket.signal }).then(
      (r) => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        if (r) {
          form.resolveUnknown({ saved: true })
          setCheck("idle")
          onComplete({ workspaceId: r.workspaceId, start: form.submittedValues?.start ?? form.values.start })
        } else {
          form.resolveUnknown({ saved: false })
          setCheck("not-created")
        }
      },
      () => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        setCheck("idle")
      }
    )
  }

  const stepBlockers = form.blockers.filter((b) => stepFields[step].includes(b.name))
  const err = (name: keyof SetupValues) => {
    const e = form.error(name)
    return e ? <FieldError>{e}</FieldError> : null
  }

  return (
    <div className="flex w-full max-w-[32rem] min-w-0 flex-col gap-6" data-testid="onb-setup" data-step={step}>
      {/* 見出しが直後に続くため、簡易の Stepper には現在の手順の名前を重ねない（支援技術には sr-only で伝える） */}
      <Stepper items={flow.items} total={flow.total} onSelect={(id) => flow.goTo(id)} layout="compact" currentLabel="hidden" aria-label="組織の作成の手順" data-testid="onb-setup-stepper" />
      <form
        noValidate
        className="flex min-w-0 flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          onNext()
        }}
        onKeyDown={(e) => submitOnEnter(e, onNext)}
      >
        <div className="flex flex-col gap-2">
          <Title
            ref={(el: HTMLHeadingElement | null) => {
              flow.headingRef(el)
              headingEl.current = el
            }}
            tabIndex={-1}
            className="text-section outline-none"
          >
            {meta.title}
          </Title>
          <p className="text-ui text-muted-foreground" data-testid="onb-setup-requirement" data-required={meta.required}>
            {meta.required ? "必須の手順です。" : "任意の手順です。スキップしても、あとで設定できます。"}
          </p>
          {resumed && (
            <p className="text-ui text-muted-foreground" data-testid="onb-setup-resumed">
              前回の入力の続きから再開しています。
              <Button type="button" variant="link" size="sm" className="ms-2" disabled={form.submitting || unknown || check === "checking" || draftSaving} onClick={() => setConfirmRestart(true)}>
                最初から入力し直す
              </Button>
            </p>
          )}
        </div>

        {step === "org" && (
          <div className="flex flex-col gap-6">
            <Field invalid={!!form.error("name")}>
              <FieldLabel>組織名</FieldLabel>
              <Input {...form.inputProps("name")} id={fieldId("name")} autoComplete="organization" data-testid="onb-setup-name" />
              <FieldDescription>会社名や部署名など。あとで組織の設定で変更できます。</FieldDescription>
              {err("name")}
            </Field>
            <Field>
              <FieldSet render={<RadioGroup value={form.values.usage} onValueChange={(v) => form.setValue("usage", v as "team" | "solo", { commit: true })} />}>
                <FieldLegend variant="label">使い方</FieldLegend>
                <div>
                  <FieldItem>
                    <RadioGroupItem value="team" />
                    <FieldLabel>チームで使う</FieldLabel>
                  </FieldItem>
                  <FieldItem>
                    <RadioGroupItem value="solo" />
                    <FieldLabel>自分だけで使う</FieldLabel>
                  </FieldItem>
                </div>
              </FieldSet>
              <FieldDescription>自分だけで使う場合は、メンバーの招待の手順を省きます。あとから招待することもできます。</FieldDescription>
            </Field>
          </div>
        )}

        {step === "invite" && (
          <Field invalid={!!form.error("invites")}>
            <FieldLabel>招待するメンバーのメールアドレス</FieldLabel>
            <Textarea
              {...form.inputProps("invites")}
              onChange={(e) => {
                // スキップした後に入力し直した場合は、送信の対象に戻す
                if (form.values.skipInvite) form.setValue("skipInvite", false, { commit: true })
                form.inputProps("invites").onChange(e)
              }}
              id={fieldId("invites")}
              rows={3}
              data-testid="onb-setup-invites"
            />
            <FieldDescription>複数の場合は改行かカンマで区切ります。招待のメールは模擬の処理で、実際には送信しません。あとでメンバーの画面からも招待できます。</FieldDescription>
            {err("invites")}
          </Field>
        )}

        {step === "data" && (
          <Field>
            <FieldSet render={<RadioGroup value={form.values.start} onValueChange={(v) => form.setValue("start", v as "empty" | "sample", { commit: true })} />}>
              <FieldLegend variant="label">最初に表示する顧客の一覧</FieldLegend>
              <div>
                <FieldItem>
                  <RadioGroupItem value="empty" />
                  <FieldLabel>空の状態から始める</FieldLabel>
                </FieldItem>
                <FieldItem>
                  <RadioGroupItem value="sample" />
                  <FieldLabel>サンプルデータで試す</FieldLabel>
                </FieldItem>
              </div>
            </FieldSet>
            <FieldDescription>サンプルデータは実際の顧客とは別に表示し、いつでも削除できます。顧客の登録と CSV ファイルの取り込みは、作成した後に顧客の一覧から行えます。</FieldDescription>
          </Field>
        )}

        {form.status === "failed" && form.formError && (
          <Alert variant="destructive" role="alert" data-testid="onb-setup-error">
            <AlertTitle>組織を作成できませんでした</AlertTitle>
            <AlertDescription>{form.formError}</AlertDescription>
          </Alert>
        )}
        {unknown && (
          <Alert variant="warning" role="alert" data-testid="onb-setup-unknown">
            <AlertTitle>組織が作成されたかを確認できませんでした</AlertTitle>
            <AlertDescription>{form.formError}</AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" size="sm" loading={check === "checking"} onClick={confirm}>
                作成されたかを確認する
              </Button>
            </AlertAction>
          </Alert>
        )}
        {check === "not-created" && form.status === "idle" && (
          <Alert data-testid="onb-setup-not-created">
            <AlertTitle>組織は作成されていませんでした</AlertTitle>
            <AlertDescription>入力した内容で、もう一度作成できます。</AlertDescription>
          </Alert>
        )}

        <FormActions
          notice={
            <SaveBlockerNotice
              id={noticeId}
              blockers={stepBlockers}
              reason={unknown ? "unknown" : form.submitting ? "submitting" : form.composing ? "composing" : undefined}
              goal={flow.isLast ? "作成できます" : "次へ進めます"}
              data-testid="onb-setup-notice"
            />
          }
        >
          {!flow.isFirst && (
            <Button type="button" variant="secondary" onClick={() => flow.back()} disabled={form.submitting || check === "checking"}>
              戻る
            </Button>
          )}
          {step === "invite" && (
            <Button type="button" variant="ghost" onClick={() => requestAdvance(true)}>
              スキップ
            </Button>
          )}
          {flow.isLast ? (
            <Button
              type="submit"
              loading={form.submitting || check === "checking"}
              disabled={!form.canSubmit}
              focusableWhenDisabled
              aria-describedby={noticeId}
              data-testid="onb-setup-create"
            >
              組織を作成して始める
            </Button>
          ) : (
            <Button type="submit" disabled={!flow.canNext} focusableWhenDisabled aria-describedby={noticeId} data-testid="onb-setup-next">
              次へ
            </Button>
          )}
        </FormActions>
      </form>
      <p role="status" className="text-ui text-muted-foreground empty:hidden">
        {saveNote}
      </p>
      <DiscardChangesAlert
        open={confirmRestart}
        onOpenChange={setConfirmRestart}
        title="入力した内容を破棄して、最初から入力し直しますか？"
        description="保存した途中の入力も削除します。"
        onDiscard={() => {
          setConfirmRestart(false)
          onRestart()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- 招待されたメンバーの利用開始

/**
 * 招待されたメンバーの利用開始。参加する組織と招待した人を確かめる画面だけを置き、参加の後は製品の利用画面へ直接移る。
 * 組織で設定済みの項目（組織名、標準の言語など）は、もう一度求めない。
 */
export function InvitedMemberStart({
  viewer,
  invitedBy,
  roleName,
  api,
  onJoined,
  titleAs = "h3",
}: {
  viewer: OnboardingViewer
  invitedBy: UserId
  roleName: string
  api: OnboardingApi
  onJoined: (workspaceId: string) => void
  titleAs?: Heading
}) {
  const actions = useActions(viewerScope(viewer), api)
  const Title = titleAs
  return (
    <div className="flex w-full max-w-[32rem] min-w-0 flex-col gap-6" data-testid="onb-invited">
      <div className="flex flex-col gap-2">
        <Title className="text-section">{api.workspaceName(viewer.workspaceId)}に参加する</Title>
        <p className="text-body text-muted-foreground">
          {users[invitedBy].name}さんから、{roleName}として招待されています（模擬の招待）。
        </p>
      </div>
      <p className="text-ui text-muted-foreground">
        組織の設定は管理者が済ませています。表示言語とタイムゾーンは組織の標準を使い、あとで個人の設定で変更できます。
      </p>
      <div>
        <ActionButton
          actions={actions}
          actionKey="join"
          testId="onb-join"
          onRun={() =>
            actions.run("join", (ctx) => api.acceptInvitation(viewer.userId, viewer.workspaceId, ctx), {
              success: () => "",
              onSuccess: () => onJoined(viewer.workspaceId),
            })
          }
        >
          参加して始める
        </ActionButton>
      </div>
      <ActionResult outcome={actions.outcome} keys={["join"]} testId="onb-join-result" />
    </div>
  )
}
