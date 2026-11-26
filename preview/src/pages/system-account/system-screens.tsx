import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { MinimalShell } from "@/patterns/app-shell"
import { useBrowseData } from "@/patterns/browse-data"
import { DataRegionError } from "@/patterns/data-states"
import { JobStatusItem, JobStatusList } from "@/patterns/job-status"
import { useScopeGuard } from "@/patterns/scope-guard"
import { SystemBanner, type SystemBannerIssue, type SystemBannerNotice } from "@/patterns/system-banner"
import { ConditionIcon, ServiceHealthLabel, ServiceUnavailable, SystemStatusIndicator } from "@/patterns/service-state"
import {
  canAutoRetry,
  displayJobState,
  getMutationAvailability,
  isJobActive,
  isRegisteredOnServer,
  mergeJobUpdates,
  overallHealth,
  summarizeIssues,
  type ImpactScope,
  type JobState,
  type MutationBlockReason,
  type OfflineEntryMode,
  type OfflineSyncState,
  type MutationStatus,
  type ServiceHealth,
  type ServiceStatusReport,
  type SystemCondition,
} from "@/patterns/system-status"
import { useConnectivity, useStableIssues } from "@/patterns/system-status-hooks"

import { isAbortError, MockRequestError, MockUnknownError } from "../../data/system-account/mock"
import { notificationsOf, serviceComponentLabels, workspaces, type ServiceComponent, type WorkspaceId } from "../../data/system-account/model"
import {
  incidentStatusLabels,
  jobKindLabels,
  serviceComponents,
  systemServer,
  type Incident,
  type JobKind,
  type JobRecord,
  type ServiceStatusResponse,
  type SystemServer,
} from "../../data/system-account/system-server"
import { Radio } from "../data-browsing/doc-parts"

// System States の画面の部品。資料のページ（system-states-page.tsx）と、統合の検証画面（account-app.tsx）で使う。
// 模擬のサーバー（system-server.ts）の関数とコールバックを props で受け取る。Registry の部品（system-status.ts など）を組み合わせる。
// ネットワークの状態、障害の監視、ジョブの実行は、すべて模擬の処理である。

export type SystemApi = SystemServer

// ---------------------------------------------------------------- 時刻の表示（日本時間に固定する）

const timeFormat = new Intl.DateTimeFormat("ja-JP", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Tokyo" })
const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Tokyo" })
export const formatTime = (ms: number) => timeFormat.format(ms)
const formatDateTime = (ms: number) => dateTimeFormat.format(ms)
/** メンテナンスの時間帯（同じ日なら終了の時刻だけ） */
export function formatWindow(start: string, end: string) {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  const sameDay = new Date(s + 9 * 3600_000).toISOString().slice(0, 10) === new Date(e + 9 * 3600_000).toISOString().slice(0, 10)
  return `${formatDateTime(s)}〜${sameDay ? formatTime(e) : formatDateTime(e)}（日本時間）`
}

const isNetworkError = (error: unknown) => error instanceof MockRequestError && error.code === "network"

// ---------------------------------------------------------------- 影響の範囲（製品が決める。この製品の例）

/** 機能の障害が及ぶ範囲。顧客の閲覧と編集、ログインは複数のページ、検索と通知は画面の領域、書き出しは操作、契約と請求は 1 つのページ */
export const componentScope: Record<ServiceComponent, ImpactScope> = {
  "sign-in": "pages",
  customers: "pages",
  search: "region",
  export: "action",
  notifications: "region",
  billing: "page",
}

const componentImpact: Record<ServiceComponent, string> = {
  "sign-in": "ログイン中の利用は続けられます。ログインし直すことはできません。",
  customers: "一覧と詳細の表示に時間がかかります。保存は利用できます。",
  search: "一覧の表示と編集は利用できます。",
  export: "顧客の閲覧と編集は利用できます。",
  notifications: "新しい通知を受け取れません。ほかの機能は利用できます。",
  billing: "契約と請求のページを利用できません。",
}

/** 機能が停止中・メンテナンス中のときの影響（操作を止める） */
const componentStopImpact: Record<ServiceComponent, string> = {
  "sign-in": "ログイン中の利用は続けられます。ログインし直すことはできません。",
  customers: "顧客の一覧と詳細の表示、保存はできません。",
  search: "一覧の表示と編集は利用できます。",
  export: "顧客の閲覧と編集は利用できます。",
  notifications: "新しい通知を受け取れません。ほかの機能は利用できます。",
  billing: "契約と請求のページを利用できません。",
}

const healthTitle = (component: ServiceComponent, health: ServiceHealth) => {
  const label = serviceComponentLabels[component]
  switch (health) {
    case "degraded":
      return `${label}の動作が遅くなっています`
    case "partial-outage":
      return `${label}の一部が利用できません`
    case "outage":
      return `${label}を利用できません`
    case "maintenance":
      return `${label}はメンテナンス中です`
    case "recovering":
      return `${label}の復旧を確認しています`
    default:
      return label
  }
}

// ---------------------------------------------------------------- 監視（接続の状態とサービスの状態）

type StatusState = {
  report: ServiceStatusReport<ServiceComponent>
  /** 最後に取得できた状態。取得に失敗した間も残し、時点を示して使う */
  last: ServiceStatusResponse | null
  /** 最後に取得できた時刻（端末の時刻） */
  lastAt: number | null
  checking: boolean
}

export type SystemMonitor = ReturnType<typeof useSystemMonitor>

/**
 * 接続の状態（useConnectivity）と、サービスの状態（模擬の状態の API の定期的な取得）をまとめて持つ。
 * 接続と稼働は別の値で持ち、1 つの error にしない。状態の取得に失敗した場合は、最後に取得した状態を時点つきで残す（正常にしない）。
 * 接続の最初の状態は unknown（確認していない）。疎通の確認（probe）か、状態の取得の応答（reportReachable）で online にする。
 * 状態の API に応答が届いたことは、経路に届いたことだけを意味する（サービスの稼働は応答の内容で判断する）。
 */
export function useSystemMonitor({ api = systemServer, pollInterval = 5000 }: { api?: SystemApi; pollInterval?: number } = {}) {
  const connectivity = useConnectivity({ probe: api.probe, browserOnline: api.browser, retry: api.retry })
  const [status, setStatus] = useState<StatusState>({ report: { status: "loading" }, last: null, lastAt: null, checking: false })
  const guard = useScopeGuard("system-status")
  const reportFailure = connectivity.reportFailure
  const reportReachable = connectivity.reportReachable

  const refreshStatus = useCallback(() => {
    const ticket = guard.begin("status")
    setStatus((s) => ({ ...s, checking: true }))
    api.getServiceStatus(ticket.signal).then(
      (data) => {
        // 応答が届いた：経路に届いた（古い要求の応答でも、届いたことは確か）
        reportReachable()
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        const t = Date.now()
        setStatus({ report: { status: "ready", components: data.components, checkedAt: t }, last: data, lastAt: t, checking: false })
      },
      (error) => {
        if (!guard.isLatest(ticket) || isAbortError(error)) return
        guard.release(ticket)
        setStatus((s) => ({ ...s, report: { status: "failed", checkedAt: Date.now() }, checking: false }))
        if (isNetworkError(error)) reportFailure()
        // サーバーのエラーの応答は、経路に届いた（状態の取得の失敗であり、接続の失敗ではない）
        else reportReachable()
      }
    )
  }, [api, guard, reportFailure, reportReachable])

  // 安全な取得のため、定期的に取得する。端末がオフラインの間、再接続の確認中（connecting）、自動の確認の上限に達した後
  // （offline）は取得しない（疎通の確認と利用者の「再接続を試す」に任せ、自動の再試行の上限を超えて要求を送らない）
  const connectivityStatus = useRef(connectivity.status)
  useEffect(() => {
    connectivityStatus.current = connectivity.status
  })
  useEffect(() => {
    refreshStatus()
    const id = setInterval(() => {
      const c = connectivityStatus.current
      if (api.browser.get() && c !== "offline" && c !== "connecting") refreshStatus()
    }, pollInterval)
    return () => clearInterval(id)
  }, [api, pollInterval, refreshStatus])

  // 接続が回復したら、サービスの状態を取得し直す
  const outageSeq = connectivity.lastOutage?.seq ?? 0
  useEffect(() => {
    if (outageSeq > 0) refreshStatus()
  }, [outageSeq, refreshStatus])

  // 回復の後の確認（再取得、保存の結果の確認）。確認が終わるまで、接続の状態を「復旧を確認中」にする
  const [recoveryTasks, setRecoveryTasks] = useState<string[]>([])
  const setRecoveryTask = useCallback((id: string, active: boolean) => {
    setRecoveryTasks((tasks) => (active ? (tasks.includes(id) ? tasks : [...tasks, id]) : tasks.includes(id) ? tasks.filter((t) => t !== id) : tasks))
  }, [])
  // 回復の後の確認に失敗した領域（再取得の失敗など）。接続の回復と、データの取得の成功を区別する
  const [recoveryFailures, setRecoveryFailures] = useState<string[]>([])
  const setRecoveryFailed = useCallback((id: string, failed: boolean) => {
    setRecoveryFailures((ids) => (failed ? (ids.includes(id) ? ids : [...ids, id]) : ids.includes(id) ? ids.filter((t) => t !== id) : ids))
  }, [])

  /** 機能の状態。取得に失敗した間は、最後に取得した状態（時点つき）。一度も取得できていなければ unknown */
  const health = useCallback(
    (component: ServiceComponent): ServiceHealth => {
      if (status.report.status === "ready") return status.report.components[component] ?? "unknown"
      return status.last?.components[component] ?? "unknown"
    },
    [status]
  )
  const stale = status.report.status === "failed" && status.last !== null

  /** 登録・更新・削除を受け付けてよいか（制限はすぐに行う。表示の遅延と分ける） */
  const mutation = useCallback(
    (component: ServiceComponent) => getMutationAvailability({ connectivity: connectivity.status, health: health(component) }),
    [connectivity.status, health]
  )

  return { api, connectivity, status, stale, health, mutation, refreshStatus, recoveryTasks, setRecoveryTask, recoveryFailures, setRecoveryFailed }
}

/** 操作を受け付けない理由。verb は「保存」「書き出しを開始」など */
const mutationReason = (reason: MutationBlockReason, verb: string) =>
  ({
    offline: `オフラインのため、${verb}できません。`,
    connecting: `接続を確認できるまで、${verb}できません。`,
    unconfirmed: `接続を確認しています。確認できるまで、${verb}できません。`,
    outage: `障害のため、${verb}できません。`,
    maintenance: `メンテナンス中のため、${verb}できません。`,
  })[reason]

/** 接続が回復した後の確認（再取得や保存の結果の確認）を、監視に登録する */
function useRecoveryTask(monitor: SystemMonitor, id: string, active: boolean) {
  const { setRecoveryTask } = monitor
  useEffect(() => {
    setRecoveryTask(id, active)
  }, [id, active, setRecoveryTask])
  useEffect(() => () => setRecoveryTask(id, false), [id, setRecoveryTask])
}

// ---------------------------------------------------------------- 問題の一覧（Banner、状態の画面、領域）

/** 監視の状態から、利用者に示す問題を作る。文はこの製品の例 */
export function buildSystemIssues(
  monitor: SystemMonitor,
  { onRetryConnect, onShowDetails }: { onRetryConnect?: () => void; onShowDetails?: () => void } = {}
): SystemBannerIssue[] {
  const { connectivity: c, status } = monitor
  const issues: SystemBannerIssue[] = []
  const keepData = "表示中の内容は、最後に取得した時点のものです。保存、削除、新しい登録はできません。"
  if (c.status === "offline" && c.reason === "browser") {
    issues.push({ id: "connectivity", condition: "offline", scope: "product", title: "オフラインです", impact: keepData, action: "ネットワークに接続すると、自動で再接続します。" })
  } else if (c.status === "offline") {
    issues.push({
      id: "connectivity",
      condition: "offline",
      scope: "product",
      title: "サービスに接続できません",
      impact: keepData,
      action: "ネットワークの接続を確かめてから、再接続を試してください。",
      actions: onRetryConnect && (
        <Button variant="outline" size="sm" loading={c.checking} onClick={onRetryConnect}>
          再接続を試す
        </Button>
      ),
    })
  } else if (c.status === "connecting") {
    issues.push({
      id: "connectivity",
      condition: "connecting",
      scope: "product",
      // 一度も接続を確認していない場合は「再接続」としない
      title: c.confirmedAt === null ? "サービスに接続しています" : "再接続しています",
      impact: "接続を確認できるまで、保存と削除はできません。",
      // 回数は画面にだけ示す。読み上げは問題の分類が変わったときだけ（SystemBanner）
      action: c.attempt > 0 ? `自動で確認しています（${c.attempt} 回失敗しました）。` : undefined,
    })
  } else if (c.status === "unknown") {
    // 最初の確認の間（確認していない）。表示は useStableIssues で遅らせ、すぐに確認できた場合は表示しない。保存の制限はすぐに行う。
    // 切断（connectivity）とは別の ID にする（最初の確認の経過を、後の切断の表示の遅延に引き継がない。復旧の知らせを出さない）
    issues.push({
      id: "connectivity:unconfirmed",
      condition: "connecting",
      scope: "product",
      title: c.checking || c.lostAt === null ? "サービスへの接続を確認しています" : "サービスに接続できるかを確認できません",
      impact: "確認できるまで、保存と削除はできません。",
    })
  } else if (monitor.recoveryTasks.length > 0) {
    issues.push({ id: "connectivity", condition: "recovering", scope: "product", title: "接続が回復しました。最新の内容を確認しています", impact: "確認が終わるまで、表示中の内容への変更はできません。" })
  }

  // 状態の取得に失敗した間は、最後に取得した状態を時点つきで示す（問題が消えたように見せない）
  const data = status.last
  if (data) {
    const note = monitor.stale && monitor.status.lastAt !== null ? `（${formatTime(monitor.status.lastAt)}の時点の状態です。最新の状態を確認できません）` : ""
    const healths = serviceComponents.map((k) => data.components[k])
    const product = healths.every((h) => h === "outage") ? "outage" : healths.every((h) => h === "maintenance") ? "maintenance" : null
    if (product) {
      issues.push({
        id: "service:product",
        condition: product,
        scope: "product",
        immediate: true,
        title: product === "outage" ? "サービスを利用できません" : "メンテナンス中です",
        impact: "すべての機能を利用できません。" + note,
      })
    } else {
      for (const k of serviceComponents) {
        const h = data.components[k]
        if (h === "operational" || h === "unknown") continue
        // 停止とメンテナンスは操作を止めるため、表示と読み上げを遅らせない（immediate）
        const impact = h === "outage" || h === "maintenance" ? componentStopImpact[k] : componentImpact[k]
        issues.push({ id: `service:${k}`, condition: h, scope: componentScope[k], immediate: h === "outage" || h === "maintenance", title: healthTitle(k, h), impact: impact + note })
      }
    }
    for (const m of data.maintenance) {
      issues.push({
        id: `maintenance:${m.id}`,
        condition: "maintenance",
        scope: "pages",
        timing: "upcoming",
        dismissible: true,
        title: `${formatWindow(m.start, m.end)}に、${m.title}を行います`,
        impact: `この間、${m.components.map((k) => serviceComponentLabels[k]).join("と")}を利用できません。ほかの機能は利用できます。`,
        action: m.action,
        actions: onShowDetails && (
          <Button variant="link" size="sm" onClick={onShowDetails}>
            詳細を見る
          </Button>
        ),
      })
    }
  }
  return issues
}

/**
 * App Shell の上部の System Banner の領域。複数のページに影響する問題を集約し、表示を安定させる（useStableIssues）。
 * - 閉じたお知らせ（メンテナンスの事前のお知らせ）は表示しない。重大な制限は、操作の近く（書き出しの説明）と Status Page に残す。
 * - 表示した接続の問題が解消し、ほかの問題も残っていない場合だけ、復旧の知らせを示す（短時間で解消した失敗には示さない）。
 */
export function SystemBannerArea({
  monitor,
  onShowDetails,
  dismissed: dismissedProp,
  onDismissedChange,
  showDelay = 1000,
  hideDelay = 2000,
  include,
  scopeKey,
  className,
}: {
  monitor: SystemMonitor
  /** 問題のスコープ（アカウント、ワークスペース）。変わったら、前のスコープの問題を同じ描画から示さない */
  scopeKey?: string
  /** 示す問題を絞る（資料の例で、接続の問題だけを示す場合など） */
  include?: (issue: SystemBannerIssue) => boolean
  /** メンテナンスの詳細（Status Page など）を示す。実在する場合だけ渡す */
  onShowDetails?: () => void
  /** 閉じたお知らせの ID（製品が保持する場合） */
  dismissed?: string[]
  onDismissedChange?: (ids: string[]) => void
  showDelay?: number
  hideDelay?: number
  className?: string
}) {
  const [dismissedState, setDismissed] = useState<string[]>([])
  const dismissed = dismissedProp ?? dismissedState
  const raw = buildSystemIssues(monitor, { onRetryConnect: monitor.connectivity.check, onShowDetails })
  const { banner } = summarizeIssues(include ? raw.filter(include) : raw, { dismissed })
  const stable = useStableIssues(banner, { showDelay, hideDelay, scopeKey })
  // 解消した後に表示を残している接続の問題は、最後の文（オフラインなど）ではなく、確かめていることを示す
  const shown = stable.issues.map((i) =>
    stable.settlingIds.includes(i.id) && i.id === "connectivity"
      ? { id: i.id, condition: "recovering" as const, scope: i.scope, title: "接続を確認しました", impact: "接続が安定しているかを確かめています。" }
      : i
  )

  // 復旧の知らせ：表示していた接続の問題が消え、その間に切断からの回復（lastOutage）があった場合だけ。
  // 最初の確認（確認していない状態から online）は回復ではないため、知らせない
  const [notice, setNotice] = useState<SystemBannerNotice | null>(null)
  const shownAtSeq = useRef<number | null>(null)
  const hasConnectivity = shown.some((i) => i.id === "connectivity")
  const outageSeq = monitor.connectivity.lastOutage?.seq ?? 0
  useEffect(() => {
    if (hasConnectivity) {
      shownAtSeq.current ??= outageSeq
      setNotice(null)
      return
    }
    if (shownAtSeq.current === null) return
    const recovered = outageSeq > shownAtSeq.current
    shownAtSeq.current = null
    if (recovered) setNotice({ id: `recovered-${outageSeq}`, title: "接続が回復しました" })
  }, [hasConnectivity, outageSeq])
  // 再取得に成功した場合だけ「最新の内容を表示しています」と示す。失敗した領域がある場合は、その領域の表示に任せる
  const failedCount = monitor.recoveryFailures.length
  const shownNotice = notice && {
    ...notice,
    description: failedCount > 0 ? "最新の内容を取得できなかった領域があります。その領域で取得し直してください。" : "最新の内容を表示しています。",
  }
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  return (
    <SystemBanner
      data-testid="sys-banner"
      className={className}
      issues={shown}
      settlingIds={stable.settlingIds}
      notice={shown.length === 0 ? shownNotice : null}
      onDismiss={(id) => {
        if (notice && id === notice.id) {
          setNotice(null)
          return
        }
        const next = [...dismissed, id]
        if (onDismissedChange) onDismissedChange(next)
        else setDismissed(next)
      }}
    />
  )
}

// ---------------------------------------------------------------- 模擬の状態の切り替え（例の操作）

function useServerVersion(api: SystemApi) {
  return useSyncExternalStore(api.subscribe, api.version, api.version)
}

const scenarioOptions = [
  ["operational", "正常"],
  ["degraded", "動作が遅い（顧客の一覧）"],
  ["partial-outage", "一部の障害（検索）"],
  ["multiple", "複数の障害"],
  ["recovering", "復旧を確認中（検索）"],
  ["outage", "製品全体の停止"],
  ["maintenance", "メンテナンス中"],
] as const

type ScenarioId = (typeof scenarioOptions)[number][0]

function currentScenario(api: SystemApi): ScenarioId | null {
  const s = api.services
  const entries = serviceComponents.map((k) => [k, s[k]] as const)
  const others = (except: ServiceComponent[]) => entries.filter(([k]) => !except.includes(k)).every(([, h]) => h === "operational")
  if (entries.every(([, h]) => h === "operational")) return "operational"
  if (entries.every(([, h]) => h === "outage")) return "outage"
  if (entries.every(([, h]) => h === "maintenance")) return "maintenance"
  if (s.customers === "degraded" && others(["customers"])) return "degraded"
  if (s.search === "partial-outage" && others(["search"])) return "partial-outage"
  if (s.search === "recovering" && others(["search"])) return "recovering"
  if (s.search === "partial-outage" && s.notifications === "outage" && s.customers === "degraded" && s.billing === "outage") return "multiple"
  return null
}

/**
 * 模擬の状態を切り替える操作。ネットワーク、サービスへの経路、サービスの状態、状態の API の失敗。
 * 複数の場所に置いても、同じ模擬のサーバーを操作する（表示は購読で更新する）。
 */
export function SystemSimulatorControls({
  api = systemServer,
  parts = ["network", "reach", "service", "status"],
  name = "sys",
}: {
  api?: SystemApi
  parts?: ("network" | "reach" | "service" | "status")[]
  /** ラジオボタンの name の接頭辞（同じページに複数置く場合に分ける） */
  name?: string
}) {
  useServerVersion(api)
  const scenario = currentScenario(api)
  return (
    <div className="flex flex-col gap-4" data-testid={`${name}-controls`}>
      {parts.includes("network") && (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
          <legend className="mb-1 font-medium">端末のネットワーク（模擬）</legend>
          <Radio name={`${name}-network`} checked={api.browserOnline} onChange={() => api.setBrowserOnline(true)}>
            接続している
          </Radio>
          <Radio name={`${name}-network`} checked={!api.browserOnline} onChange={() => api.setBrowserOnline(false)}>
            切断した
          </Radio>
        </fieldset>
      )}
      {parts.includes("reach") && (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
          <legend className="mb-1 font-medium">サービスへの経路（模擬。端末はオンラインのまま）</legend>
          <Radio name={`${name}-reach`} checked={api.reachable} onChange={() => api.setReachable(true)}>
            届く
          </Radio>
          <Radio name={`${name}-reach`} checked={!api.reachable} onChange={() => api.setReachable(false)}>
            届かない
          </Radio>
        </fieldset>
      )}
      {parts.includes("service") && (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
          <legend className="mb-1 font-medium">サービスの状態（模擬の障害の監視）</legend>
          {scenarioOptions.map(([id, label]) => (
            <Radio key={id} name={`${name}-scenario`} checked={scenario === id} onChange={() => api.applyScenario(id)}>
              {label}
            </Radio>
          ))}
        </fieldset>
      )}
      {parts.includes("status") && (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
          <legend className="mb-1 font-medium">状態の取得（模擬）</legend>
          <Radio name={`${name}-status`} checked={!api.statusFails} onChange={() => api.setStatusFails(false)}>
            成功する
          </Radio>
          <Radio name={`${name}-status`} checked={api.statusFails} onChange={() => api.setStatusFails(true)}>
            失敗する
          </Radio>
        </fieldset>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 製品全体が使えない場合の画面

/**
 * メンテナンス中・サービスの停止中の画面。製品の画面を置き換える。embedded では資料のページの中に枠として置く（h1 を使わない）。
 * - 判明していない復旧の予定時刻を作らない（模擬のメンテナンスは終了の予定を返さない）。
 * - 実際に利用できる操作は「状態を再確認」だけ。Status Page と問い合わせ先は、渡された場合だけ示す。
 */
export function ServiceUnavailableScreen({
  monitor,
  embedded = false,
  onOpenStatusPage,
  contact,
}: {
  monitor: SystemMonitor
  embedded?: boolean
  /** 実在する Status Page を開く。ない場合は渡さない */
  onOpenStatusPage?: () => void
  /** 実在する問い合わせ先。ない場合は渡さない */
  contact?: ReactNode
}) {
  const { connectivity: c, status, refreshStatus } = monitor
  const condition = status.last && serviceComponents.every((k) => status.last!.components[k] === "maintenance") ? "maintenance" : "outage"
  const [checked, setChecked] = useState(false)
  const statusText = status.checking
    ? "状態を確認しています。"
    : checked && status.lastAt !== null
      ? `${formatTime(status.lastAt)}に確認しました。まだ利用できません。`
      : status.report.status === "failed"
        ? "状態を確認できませんでした。"
        : ""
  const content = (
    <ServiceUnavailable
      data-testid="sys-unavailable"
      condition={condition}
      className={embedded ? "py-10" : undefined}
      titleAs={embedded ? "h3" : "h1"}
      title={condition === "maintenance" ? "メンテナンス中です" : "サービスを利用できません"}
      description={
        condition === "maintenance"
          ? "顧客の閲覧と編集を含む、すべての機能を利用できません。終了の予定は、わかり次第お知らせします。"
          : "現在、すべての機能を利用できません。原因を調べています。入力中の内容は、この画面を閉じると失われます。"
      }
      actions={
        <Button
          variant="secondary"
          loading={status.checking}
          onClick={() => {
            setChecked(true)
            refreshStatus()
            c.check()
          }}
        >
          状態を再確認
        </Button>
      }
      status={statusText}
      links={
        (onOpenStatusPage || contact) && (
          <>
            {onOpenStatusPage && (
              <Button variant="link" className="w-fit" onClick={onOpenStatusPage}>
                稼働状況のページを見る
              </Button>
            )}
            {contact}
          </>
        )
      }
    />
  )
  if (embedded) return <div className="flex min-h-[24rem] items-center">{content}</div>
  return <MinimalShell header={<span className="text-ui font-medium">営業管理</span>}>{content}</MinimalShell>
}

// ---------------------------------------------------------------- 製品の画面の例（影響範囲と表示位置）

type CustomerRow = { id: string; company: string; owner: string }

/**
 * 製品の画面の例。影響の範囲ごとに表示する位置を変える。
 * - 複数のページ・製品全体（オフライン、顧客の一覧の性能の低下）：上部の System Banner
 * - 製品全体が使えない（停止、メンテナンス）：画面を状態の画面に置き換える
 * - 画面の領域（検索、通知）：その領域の中の Alert
 * - 操作（書き出し）：操作の近くの説明
 * 影響を受けていない機能は、そのまま使える。
 */
export function SystemAppExample({
  monitor,
  workspace = "hq",
  onShowDetails,
  onOpenStatusPage,
}: {
  monitor: SystemMonitor
  workspace?: WorkspaceId
  onShowDetails?: () => void
  onOpenStatusPage?: () => void
}) {
  const { screen } = summarizeIssues(buildSystemIssues(monitor))
  return (
    <div data-testid="sys-app" className="min-w-0 overflow-hidden rounded-lg border border-border">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 border-b border-border px-4 sm:px-6">
        <span className="text-ui font-medium">営業管理</span>
        <span className="text-ui text-muted-foreground">{workspaces[workspace].name}</span>
      </div>
      {screen ? (
        <ServiceUnavailableScreen monitor={monitor} embedded onOpenStatusPage={onOpenStatusPage} />
      ) : (
        <>
          <SystemBannerArea monitor={monitor} onShowDetails={onShowDetails} />
          <AppBody monitor={monitor} workspace={workspace} />
        </>
      )}
    </div>
  )
}

function AppBody({ monitor, workspace }: { monitor: SystemMonitor; workspace: WorkspaceId }) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState<"customers" | "billing">("customers")
  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:px-6">
      <nav aria-label="例の画面のページ" className="flex flex-wrap gap-2">
        {(
          [
            ["customers", "顧客"],
            ["billing", "契約と請求"],
          ] as const
        ).map(([id, label]) => (
          <Button key={id} variant={page === id ? "secondary" : "ghost"} size="sm" aria-current={page === id ? "page" : undefined} onClick={() => setPage(id)}>
            {label}
          </Button>
        ))}
      </nav>
      {page === "customers" ? (
        <div className="flex flex-col gap-10">
          <SearchRegion monitor={monitor} onSearch={setQuery} />
          <CustomersRegion monitor={monitor} workspace={workspace} query={query} />
          <div className="grid gap-10 @2xl/page:grid-cols-2">
            <ExportAction monitor={monitor} workspace={workspace} />
            <NotificationsRegion monitor={monitor} workspace={workspace} />
          </div>
        </div>
      ) : (
        <BillingPage monitor={monitor} workspace={workspace} />
      )}
    </div>
  )
}

// 特定のページに影響する問題は、そのページの中に示す（Banner にしない）
function BillingPage({ monitor, workspace }: { monitor: SystemMonitor; workspace: WorkspaceId }) {
  const health = monitor.health("billing")
  const down = health === "outage" || health === "partial-outage" || health === "maintenance"
  const plan = workspaces[workspace].plan === "business" ? "ビジネス" : "スタンダード"
  return (
    <section aria-labelledby="sys-billing-title" data-testid="sys-billing" className="flex flex-col gap-4">
      <h3 id="sys-billing-title" className="text-heading">
        契約と請求
      </h3>
      {down ? (
        <DataRegionError title={healthTitle("billing", health)} description="顧客の閲覧と編集は利用できます。" data-testid="sys-billing-error" />
      ) : (
        <p className="text-ui">現在のプラン：{plan}</p>
      )}
    </section>
  )
}

function SearchRegion({ monitor, onSearch }: { monitor: SystemMonitor; onSearch: (q: string) => void }) {
  const [text, setText] = useState("")
  const health = monitor.health("search")
  const unavailable = health === "partial-outage" || health === "outage" || health === "maintenance"
  // 検索は取得の処理。オフラインの間は送らない（既存の一覧は残す）
  const offline = monitor.connectivity.status !== "online"
  return (
    <section aria-labelledby="sys-search-title" data-testid="sys-search" className="flex flex-col gap-3">
      <h3 id="sys-search-title" className="text-heading">
        検索
      </h3>
      {unavailable && (
        <DataRegionError
          variant="warning"
          title={healthTitle("search", health)}
          description="一覧の表示と編集は利用できます。"
          data-testid="sys-search-error"
        />
      )}
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onSearch(text.trim())
        }}
      >
        <Input aria-label="会社名で検索" value={text} onChange={(e) => setText(e.target.value)} disabled={unavailable} className="w-72 max-w-full" />
        <Button type="submit" variant="secondary" disabled={unavailable || offline} aria-describedby={offline && !unavailable ? "sys-search-offline" : undefined}>
          検索
        </Button>
        {offline && !unavailable && (
          <p id="sys-search-offline" className="basis-full text-ui text-muted-foreground">
            接続が回復すると、検索できます。
          </p>
        )}
      </form>
    </section>
  )
}

function CustomersRegion({ monitor, workspace, query }: { monitor: SystemMonitor; workspace: WorkspaceId; query: string }) {
  const { api, connectivity } = monitor
  const { reportFailure, reportReachable } = connectivity
  const data = useBrowseData<{ workspace: WorkspaceId; query: string }, CustomerRow[]>({
    query: { workspace, query },
    scopeKey: workspace,
    // 応答が届いたら経路に届いたことを伝える（データの取得の成功は useBrowseData の状態で別に扱う）
    fetcher: ({ workspace: w, query: q }, { signal }) =>
      api.listCustomers(w, q, signal).then(
        (rows) => {
          reportReachable()
          return rows
        },
        (error) => {
          if (isNetworkError(error)) reportFailure()
          else if (!isAbortError(error)) reportReachable()
          throw error
        }
      ),
  })
  // 接続が回復したら、同じ条件で再取得する。取得が終わるまで「復旧を確認中」
  const outageSeq = connectivity.lastOutage?.seq ?? 0
  const [recovery, setRecovery] = useState<{ seq: number; since: number | null } | null>(null)
  const reload = data.reload
  useEffect(() => {
    if (outageSeq === 0) return
    setRecovery({ seq: outageSeq, since: null })
    reload()
  }, [outageSeq, reload])
  // 再取得の要求を送った後（refreshing）に、終わったら確認を終える。失敗した場合は、監視に失敗を伝える
  const { setRecoveryFailed } = monitor
  const fetchFailed = data.status === "error" || data.refreshFailed
  useEffect(() => {
    if (!recovery) return
    if (data.status === "refreshing" || data.status === "loading") {
      if (recovery.since === null) setRecovery({ ...recovery, since: 1 })
      return
    }
    if (recovery.since !== null) {
      setRecoveryFailed("customers", fetchFailed)
      setRecovery(null)
    }
  }, [data.status, recovery, fetchFailed, setRecoveryFailed])
  // 後で取得に成功したら、失敗を取り消す
  useEffect(() => {
    if (data.status === "ready" && !data.refreshFailed) setRecoveryFailed("customers", false)
  }, [data.status, data.refreshFailed, setRecoveryFailed])
  useEffect(() => () => setRecoveryFailed("customers", false), [setRecoveryFailed])
  useRecoveryTask(monitor, "customers", recovery !== null)

  const rows = data.data ?? []
  const outage = monitor.health("customers") === "outage"
  // 接続を確認できない間（unknown を含む）は、表示中の内容に取得した時刻を示す
  const offline = connectivity.status !== "online"
  const showTime = (offline || data.refreshFailed) && data.fetchedAt !== null
  return (
    <section aria-labelledby="sys-customers-title" data-testid="sys-customers" className="flex flex-col gap-3" aria-busy={data.status === "loading" || undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="sys-customers-title" className="text-heading">
          顧客
        </h3>
        <p className="min-h-6 text-ui text-muted-foreground" data-testid="sys-customers-time">
          {showTime ? `${formatTime(data.fetchedAt!)}の時点の内容` : ""}
        </p>
      </div>
      {data.refreshFailed && !offline && (
        <DataRegionError
          variant="warning"
          title="最新の内容を取得できませんでした"
          description={data.fetchedAt !== null ? `${formatTime(data.fetchedAt)}の時点の内容を表示しています。` : undefined}
          onRetry={data.reload}
          data-testid="sys-customers-refresh-error"
        />
      )}
      {data.status === "error" && !outage && !offline && (
        <DataRegionError title="顧客の一覧を取得できませんでした" onRetry={data.reload} data-testid="sys-customers-error" />
      )}
      {data.status === "error" && (offline || outage) && rows.length === 0 && (
        <p className="text-ui text-muted-foreground" data-testid="sys-customers-empty">
          接続が回復すると、一覧を表示します。
        </p>
      )}
      {data.status === "loading" ? (
        <ul aria-hidden="true" className="flex flex-col">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="border-b border-border py-3 last:border-b-0">
              <span data-slot="skeleton" className="block h-4 w-1/2 rounded-sm bg-border motion-safe:animate-pulse" />
            </li>
          ))}
        </ul>
      ) : (
        rows.length > 0 && (
          <ul className={offline || !data.canOperate ? "flex flex-col text-muted-foreground" : "flex flex-col"} data-testid="sys-customers-list">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-x-4 border-b border-border py-2 text-ui last:border-b-0">
                <span className="text-foreground">{r.company}</span>
                <span className="text-muted-foreground">{r.owner}</span>
              </li>
            ))}
          </ul>
        )
      )}
      {data.status === "ready" && rows.length === 0 && <p className="text-ui text-muted-foreground">条件に一致する顧客はいません</p>}
    </section>
  )
}

function ExportAction({ monitor, workspace }: { monitor: SystemMonitor; workspace: WorkspaceId }) {
  const availability = monitor.mutation("export")
  const maintenance = monitor.status.last?.maintenance.filter((m) => m.components.includes("export")) ?? []
  return (
    <section aria-labelledby="sys-export-title" data-testid="sys-export" className="flex min-w-0 flex-col gap-3">
      <h3 id="sys-export-title" className="text-heading">
        書き出し
      </h3>
      <BackgroundJobsPanel
        monitor={monitor}
        workspace={workspace}
        kinds={["export"]}
        compact
        unavailableReason={!availability.allowed ? mutationReason(availability.reason, "書き出しを開始") : undefined}
      />
      {/* 閉じられるお知らせを閉じた後も、重大な制限は操作の近くで確認できるようにする */}
      {maintenance.map((m) => (
        <p key={m.id} className="text-ui text-muted-foreground" data-testid="sys-export-maintenance">
          {formatWindow(m.start, m.end)}は、メンテナンスのため書き出しを利用できません。
        </p>
      ))}
    </section>
  )
}

function NotificationsRegion({ monitor, workspace }: { monitor: SystemMonitor; workspace: WorkspaceId }) {
  const health = monitor.health("notifications")
  const unread = notificationsOf(workspace).filter((n) => !n.read).length
  const down = health === "outage" || health === "partial-outage" || health === "maintenance"
  return (
    <section aria-labelledby="sys-notifications-title" data-testid="sys-notifications" className="flex min-w-0 flex-col gap-3">
      <h3 id="sys-notifications-title" className="text-heading">
        通知
      </h3>
      {down ? (
        // 再取得では解決しない障害のため、再試行を置かない。復旧は監視の状態で反映する
        <DataRegionError title={healthTitle("notifications", health)} description="ほかの機能は利用できます。" data-testid="sys-notifications-error" />
      ) : (
        <p className="text-ui">未読の通知が {unread} 件あります</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- 長時間の処理（Background Job Status）

/** notifyWith="toast" のときに Toast で伝える状態。ほかの終わった状態は、一覧に残し、読み上げの領域で伝える */
const toastedJobStates: readonly JobState[] = ["succeeded", "cancelled"]

const fmt = new Intl.NumberFormat("ja-JP")

function jobDescription(job: JobRecord, state: ReturnType<typeof displayJobState>) {
  const no = `処理 ${job.number}`
  switch (state) {
    case "queued":
      return `${no}。開始を待っています。`
    case "running":
      return job.progress ? `${no}。` : `${no}。進み具合は表示できません。この画面を離れても処理は続きます。`
    case "cancel-requested":
      return `${no}。処理が止まるまで、結果が反映される場合があります。`
    case "cancelled":
      return `${no}。処理を止めました。途中までの結果は保存していません。`
    case "succeeded":
      return `${no}。${fmt.format(job.counts?.succeeded ?? 0)}件を処理しました。`
    case "partial":
      return `${no}。成功 ${fmt.format(job.counts?.succeeded ?? 0)}件、失敗 ${fmt.format(job.counts?.failed ?? 0)}件。失敗した行は処理していません。`
    case "failed":
      return `${no}。処理できませんでした。もう一度始めてください。`
    case "unknown":
      return `${no}。処理が完了したかを確認できません。データを確かめてから、必要な場合だけもう一度始めてください。`
  }
}

/**
 * 長時間の処理の一覧。ページを離れても処理はサーバーで続き、戻ったときに状況を取得し直す。
 * - 状況は定期的に取得する（安全な取得）。ジョブの ID と版で、古い応答（順序が入れ替わったもの、AbortSignal に従わないもの）を反映しない。
 * - キャンセルの要求は、サーバーが停止を確かめるまで「キャンセルを要求しました」とする。
 * - ワークスペースを切り替えたら、前のワークスペースの処理と応答を表示しない（useScopeGuard）。A → B → A でも古い応答を反映しない。
 * - 終わった処理の知らせ：notifyWith="toast" では、成功とキャンセルの完了を Toast（処理ごとの ID）で、失敗、部分的な失敗、
 *   結果不明を一覧の読み上げの領域で伝える（Toast と重ねない）。live-region では、すべてを一覧の読み上げの領域で 1 回だけ伝える。
 * - 開始の要求中の状態とエラーは、ワークスペースと組で持ち、現在のワークスペースの値だけを示す。
 */
export function BackgroundJobsPanel({
  monitor,
  workspace,
  kinds = ["export", "import"],
  pollInterval = 600,
  notifyWith = "live-region",
  compact = false,
  unavailableReason,
  canStart,
}: {
  monitor: SystemMonitor
  workspace: WorkspaceId
  kinds?: JobKind[]
  pollInterval?: number
  notifyWith?: "live-region" | "toast"
  /** 開始の操作と一覧だけを示す（画面の例の書き出し） */
  compact?: boolean
  /** 開始できない理由（オフライン、メンテナンスなど）。渡すと開始の操作を無効にする */
  unavailableReason?: string
  /**
   * 開始の直前に、最新の状態（権限など）で開始してよいかを確かめる（製品の関数）。開始できない理由を返すと始めない。
   * 描画の時点の unavailableReason だけでは、権限の変更の知らせの後、画面の更新の前に押された場合を止められないため
   */
  canStart?: (kind: JobKind) => string | null
}) {
  const { api, connectivity } = monitor
  const reportFailure = connectivity.reportFailure
  const guard = useScopeGuard(workspace)
  const { toast } = useToast()
  type PanelState = { workspace: WorkspaceId; jobs: Record<string, JobRecord>; cancel: string[]; error: string | null; fetchedAt: number | null; loaded: boolean; message: string | null }
  const emptyState = (w: WorkspaceId): PanelState => ({ workspace: w, jobs: {}, cancel: [], error: null, fetchedAt: null, loaded: false, message: null })
  const [state, setState] = useState<PanelState>(() => emptyState(workspace))
  // ワークスペースが変わったら、同じ描画から前のワークスペースの処理、知らせ、エラーを表示しない
  const current = state.workspace === workspace ? state : emptyState(workspace)
  if (state.workspace !== workspace) setState(current)
  const patch = (w: WorkspaceId, p: Partial<PanelState>) => setState((s) => (s.workspace !== w ? s : { ...s, ...p }))
  // 開始の要求を送っているワークスペース。スコープと組で持ち、現在のワークスペースの値だけを示す。
  // 切り替えた後に応答が届いても必ず解除する（応答の結果は、そのワークスペースの一覧の取得で確かめる）。
  // A → B → A と戻った場合は、最初の A の要求が終わるまで A の開始を受け付けない（サーバーで処理されている可能性があるため）。
  const startingRef = useRef(new Set<WorkspaceId>())
  const [startingList, setStartingList] = useState<WorkspaceId[]>([])
  const starting = startingList.includes(workspace)
  // commit されたワークスペース。描画の中では書き換えない（破棄された描画のワークスペースを使わないため、layout effect で更新する）
  const workspaceRef = useRef(workspace)

  const load = useCallback(() => {
    const ticket = guard.begin("list")
    api.listJobs(workspace, ticket.signal).then(
      (list) => {
        if (!guard.isSameScope(ticket)) return
        // 版で古い応答を除くため、同じスコープの応答は、最新の要求でなくても反映する（mergeJobUpdates）
        setState((s) => (s.workspace !== workspace ? s : { ...s, jobs: mergeJobUpdates(s.jobs, list), error: null, fetchedAt: Date.now(), loaded: true }))
        guard.release(ticket)
      },
      (error) => {
        if (!guard.isLatest(ticket) || isAbortError(error)) return
        guard.release(ticket)
        if (isNetworkError(error)) reportFailure()
        setState((s) => (s.workspace !== workspace ? s : { ...s, error: "処理の状況を取得できませんでした", loaded: true }))
      }
    )
  }, [api, guard, workspace, reportFailure])

  const jobs = useMemo(
    () =>
      Object.values(current.jobs)
        .filter((j) => kinds.includes(j.kind))
        .sort((a, b) => b.number - a.number),
    [current.jobs, kinds]
  )
  const anyActive = jobs.some((j) => isJobActive(j.state))
  // 示す状態。成功と部分的な失敗は、進捗と件数が正しい場合だけ（正しくなければ結果不明）。Toast と読み上げもこの値で決める
  const views = jobs.map((j) => ({ job: j, state: displayJobState(j, current.cancel.includes(j.id)) }))
  // 最初の表示（ページに戻ったとき）に取得し、処理中のものがある間は定期的に取得する
  useEffect(() => {
    load()
  }, [load])
  // 処理中のものがある間は定期的に取得する。再接続の確認中と、自動の確認の上限に達した後は取得しない（回復の後に取得し直す）
  const connectivityStatus = useRef(connectivity.status)
  useEffect(() => {
    connectivityStatus.current = connectivity.status
  })
  useEffect(() => {
    if (!anyActive) return
    const id = setInterval(() => {
      const c = connectivityStatus.current
      if (api.browser.get() && c !== "offline" && c !== "connecting") load()
    }, pollInterval)
    return () => clearInterval(id)
  }, [anyActive, api, load, pollInterval])
  const outageSeq = connectivity.lastOutage?.seq ?? 0
  useEffect(() => {
    if (outageSeq > 0) load()
  }, [outageSeq, load])

  // 終わった処理を Toast で知らせる（処理ごとの ID。最初の表示で既に終わっていた処理と、別のワークスペースの処理は知らせない）
  const seen = useRef<{ workspace: WorkspaceId; states: Map<string, string> } | null>(null)
  useEffect(() => {
    if (notifyWith !== "toast" || !current.loaded) return
    const prev = seen.current?.workspace === workspace ? seen.current.states : null
    const next = new Map(views.map((v) => [v.job.id, v.state]))
    seen.current = { workspace, states: next }
    if (!prev) return
    for (const { job: j, state } of views) {
      const before = prev.get(j.id)
      if (!before || before === state || isJobActive(state)) continue
      if (state === "succeeded") toast({ id: `job-${j.id}`, variant: "success", title: `${j.name}が完了しました`, description: `処理 ${j.number}` })
      else if (state === "cancelled") toast({ id: `job-${j.id}`, variant: "neutral", title: `${j.name}をキャンセルしました`, description: `処理 ${j.number}` })
    }
    // views は jobs と cancel から作る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, current.cancel, current.loaded, notifyWith, workspace, toast])

  // 開始の応答（スコープの変更の後に届く場合がある）から、最新の load（最新の guard）を呼ぶ。
  // 応答を待つ間に保持した closure の load は、前のスコープの guard を使うため、begin が無効な Ticket になる
  const loadRef = useRef(load)
  useLayoutEffect(() => {
    workspaceRef.current = workspace
    loadRef.current = load
  })
  const start = (kind: JobKind) => {
    const w = workspace
    // 二重の開始を防ぐ（ボタンの無効化より前に、同じ描画の中の 2 回目の押下も止める）
    if (startingRef.current.has(w)) return
    const blocked = canStart?.(kind) ?? null
    if (blocked) {
      patch(w, { message: blocked })
      return
    }
    startingRef.current.add(w)
    setStartingList([...startingRef.current])
    patch(w, { message: null })
    const ticket = guard.begin("start")
    const settle = () => {
      startingRef.current.delete(w)
      setStartingList([...startingRef.current])
      // 切り替えて戻った後に届いた場合も、一覧を取得し直して、サーバーの状態を示す（安全な取得）
      if (!guard.isSameScope(ticket) && workspaceRef.current === w) loadRef.current()
    }
    // 開始の要求は、スコープの変更で中止しない（中止はクライアントの待機の中止であり、サーバーでは処理が始まる場合がある）。
    // 古いスコープの結果は guard で反映しない
    api.startJob(w, kind).then(
      (job) => {
        settle()
        if (!guard.isSameScope(ticket)) return
        guard.release(ticket)
        setState((s) => (s.workspace !== w ? s : { ...s, jobs: mergeJobUpdates(s.jobs, [job]) }))
      },
      (error) => {
        settle()
        if (!guard.isSameScope(ticket)) return
        guard.release(ticket)
        if (isNetworkError(error)) reportFailure()
        // 開始の要求の結果が不明な場合は、もう一度押させる前に一覧で確かめる
        patch(w, { message: error instanceof MockUnknownError ? "開始できたかを確認できません。処理の一覧を確かめてください。" : "開始できませんでした。" })
        loadRef.current()
      }
    )
  }

  const cancel = (job: JobRecord) => {
    const ticket = guard.begin(`cancel:${job.id}`)
    setState((s) => (s.workspace !== workspace ? s : { ...s, cancel: [...s.cancel, job.id] }))
    api.cancelJob(workspace, job.id, ticket.signal).then(
      () => {
        if (!guard.isSameScope(ticket)) return
        // キーは処理ごと（cancel:<ID>）のため、終わったら記録を消す（長時間の利用で増え続けない）
        guard.release(ticket)
        loadRef.current()
      },
      (error) => {
        if (!guard.isSameScope(ticket)) return
        guard.release(ticket)
        if (isNetworkError(error)) reportFailure()
        // 要求が届かなかった：キャンセルを要求していない状態に戻す
        setState((s) => (s.workspace !== workspace ? s : { ...s, cancel: s.cancel.filter((id) => id !== job.id), message: "キャンセルを要求できませんでした。" }))
      }
    )
  }

  const disabled = Boolean(unavailableReason) || starting
  const reasonId = `sys-jobs-reason-${workspace}-${compact ? "c" : "f"}`
  return (
    <div data-testid={compact ? "sys-export-jobs" : "sys-jobs"} data-workspace={workspace} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {kinds.map((kind) => (
          <Button
            key={kind}
            variant="secondary"
            size="sm"
            disabled={disabled}
            loading={starting}
            aria-describedby={unavailableReason ? reasonId : undefined}
            onClick={() => start(kind)}
          >
            {kind === "export" ? "顧客を書き出す" : kind === "import" ? "顧客を取り込む" : jobKindLabels[kind]}
          </Button>
        ))}
        {!compact && (
          <Button variant="ghost" size="sm" onClick={load}>
            状況を更新
          </Button>
        )}
      </div>
      {unavailableReason && (
        <p id={reasonId} className="text-ui text-muted-foreground" data-testid="sys-jobs-reason">
          {unavailableReason}
        </p>
      )}
      {current.message && (
        <p className="text-ui text-muted-foreground" data-testid="sys-jobs-message">
          {current.message}
        </p>
      )}
      {current.error && current.fetchedAt !== null && (
        <DataRegionError
          variant="warning"
          title={current.error}
          description={`${formatTime(current.fetchedAt)}の時点の状況を表示しています。`}
          onRetry={load}
        />
      )}
      <JobStatusList
        jobs={views.map((v) => ({ id: v.job.id, name: `${v.job.name}（処理 ${v.job.number}）`, state: v.state }))}
        // Toast で伝える成功とキャンセルの完了だけを除き、失敗、部分的な失敗、結果不明は一覧の読み上げの領域で伝える
        announce={notifyWith === "live-region" ? true : (state) => !toastedJobStates.includes(state)}
        empty={current.loaded && !compact ? <p className="text-ui text-muted-foreground">処理中の作業はありません</p> : null}
      >
        {views.map(({ job, state: s }) => (
          <JobStatusItem
            key={job.id}
            data-job={job.id}
            name={job.name}
            state={s}
            progress={job.progress}
            description={jobDescription(job, s)}
            onCancel={() => cancel(job)}
            actions={
              s === "unknown" ? (
                <Button variant="outline" size="sm" onClick={load}>
                  最新の状態を確認
                </Button>
              ) : undefined
            }
          />
        ))}
      </JobStatusList>
    </div>
  )
}

// ---------------------------------------------------------------- 保存の結果が不明な場合の確認

const newRequestId = (() => {
  let n = 0
  return () => `req-${++n}`
})()

type SaveState =
  | { status: Exclude<MutationStatus, "unknown" | "checking" | "failed"> }
  | { status: "failed"; message: string; checked?: boolean }
  | { status: "unknown" | "checking"; requestId: string; text: string }

/**
 * 保存の結果が不明な場合の確認の例（顧客のメモ）。
 * - 応答を受け取れなかった保存（unknown）は、保存済みとして扱わない。再試行のボタンを置かず、結果の確認を置く。
 * - 接続が回復したら、自動で結果を確かめる（安全な取得）。保存の要求の ID がサーバーの記録と一致すれば保存済み。
 * - 入力した内容は、この画面のメモリに残す（失敗、結果の不明、オフラインの間）。ワークスペースを切り替えたら破棄する（情報の保護）。
 * - 古いスコープの保存と確認の結果は反映しない（useScopeGuard）。
 */
export function UnknownSaveExample({
  monitor,
  workspace,
  onWorkspaceChange,
}: {
  monitor: SystemMonitor
  workspace: WorkspaceId
  onWorkspaceChange?: (w: WorkspaceId) => void
}) {
  const { api, connectivity } = monitor
  const reportFailure = connectivity.reportFailure
  const customer = api.customersOf(workspace)[0]
  const scope = `${workspace}:${customer.id}`
  const guard = useScopeGuard(scope)
  // saved：サーバーに保存されている内容（取得するまで null）。loadFailed：取得に失敗した
  type Draft = { scope: string; text: string; saved: string | null; loadFailed: boolean }
  const [draft, setDraft] = useState<Draft>({ scope, text: "", saved: null, loadFailed: false })
  const [save, setSave] = useState<{ scope: string; state: SaveState }>({ scope, state: { status: "idle" } })
  // スコープが変わったら、同じ描画から前のスコープの入力と結果を表示しない
  const d: Draft = draft.scope === scope ? draft : { scope, text: "", saved: null, loadFailed: false }
  const s = save.scope === scope ? save.state : ({ status: "idle" } as SaveState)
  if (draft.scope !== scope) setDraft(d)
  if (save.scope !== scope) setSave({ scope, state: s })

  // 保存されている内容を取得する。失敗した場合は理由を示し、接続が回復したら取得し直す（安全な取得）
  const loadMemo = useCallback(() => {
    const ticket = guard.begin("load")
    setDraft((prev) => (prev.scope !== scope || !prev.loadFailed ? prev : { ...prev, loadFailed: false }))
    api.getMemo(workspace, customer.id, ticket.signal).then(
      (memo) => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        setDraft((prev) => (prev.scope !== scope || prev.saved !== null ? prev : { scope, text: memo.text, saved: memo.text, loadFailed: false }))
      },
      (error) => {
        if (!guard.isLatest(ticket) || isAbortError(error)) return
        guard.release(ticket)
        if (isNetworkError(error)) reportFailure()
        setDraft((prev) => (prev.scope !== scope || prev.saved !== null ? prev : { ...prev, loadFailed: true }))
      }
    )
  }, [api, guard, workspace, customer.id, scope, reportFailure])
  useEffect(() => {
    loadMemo()
  }, [loadMemo])

  const setState = (state: SaveState) => setSave({ scope, state })
  const availability = monitor.mutation("customers")

  const check = useCallback(
    (requestId: string, text: string) => {
      const ticket = guard.begin("check")
      setSave({ scope, state: { status: "checking", requestId, text } })
      api.getMemo(workspace, customer.id, ticket.signal).then(
        (memo) => {
          if (!guard.isLatest(ticket)) return
          guard.release(ticket)
          if (memo.requestId === requestId) {
            setSave({ scope, state: { status: "saved" } })
            setDraft((prev) => (prev.scope === scope ? { ...prev, saved: text } : prev))
          } else setSave({ scope, state: { status: "failed", message: "保存されていませんでした。入力した内容は残っています。もう一度保存できます。", checked: true } })
        },
        (error) => {
          if (!guard.isLatest(ticket) || isAbortError(error)) return
          guard.release(ticket)
          if (isNetworkError(error)) reportFailure()
          // 確かめられなかった：結果は不明のまま
          setSave({ scope, state: { status: "unknown", requestId, text } })
        }
      )
    },
    [api, guard, workspace, customer.id, scope, reportFailure]
  )

  // 接続が回復したら、結果が不明な保存を自動で確かめる（安全な取得）
  const outageSeq = connectivity.lastOutage?.seq ?? 0
  const pendingCheck = s.status === "unknown" ? s : null
  // 回復の effect から読む値。描画の中では書き換えない（commit の後に更新する。この effect より前に宣言する）
  const pendingRef = useRef(pendingCheck)
  const loadedRef = useRef(d.saved !== null)
  useLayoutEffect(() => {
    pendingRef.current = pendingCheck
    loadedRef.current = d.saved !== null
  })
  useEffect(() => {
    if (outageSeq === 0) return
    // まだ取得できていない内容は、接続が回復したら取得し直す
    if (!loadedRef.current) loadMemo()
    if (pendingRef.current) check(pendingRef.current.requestId, pendingRef.current.text)
  }, [outageSeq, check, loadMemo])
  useRecoveryTask(monitor, `memo:${scope}`, s.status === "checking")

  const submit = () => {
    if (s.status === "saving" || s.status === "checking") return
    if (!availability.allowed) {
      setState({ status: "blocked" })
      return
    }
    const requestId = newRequestId()
    const text = d.text
    const ticket = guard.begin("save")
    setState({ status: "saving" })
    api.saveMemo({ workspace, customerId: customer.id, text, requestId }, ticket.signal).then(
      () => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        setSave({ scope, state: { status: "saved" } })
        setDraft((prev) => (prev.scope === scope ? { ...prev, saved: text } : prev))
      },
      (error) => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        if (error instanceof MockUnknownError) {
          // 応答を受け取れなかった。サーバーでは保存されている可能性がある。
          // 1 回の応答の欠落では切断と判断しない（接続の確認は、次の失敗や定期的な取得に任せる）
          setSave({ scope, state: { status: "unknown", requestId, text } })
          return
        }
        if (isNetworkError(error)) reportFailure()
        setSave({ scope, state: { status: "failed", message: "保存できませんでした。入力した内容は残っています。" } })
      }
    )
  }

  const dirty = d.saved !== null && d.text !== d.saved
  const busy = s.status === "saving" || s.status === "checking"
  // 結果が不明な間は、同じ保存を重ねない（確認を先にする）
  const canSubmit = availability.allowed && !busy && s.status !== "unknown" && d.saved !== null
  const online = connectivity.status === "online"
  // 結果が不明な保存と確認中の表示は、接続の状態より優先する（結果を確かめるまで残す）。
  // 内容を取得できていない間は入力を受け付けないため、「入力した内容は残ります」と示さず、取得の状態を示す。
  // 接続を確認していない間（unknown）は、オフラインと示さない
  const message =
    d.saved === null
      ? connectivity.status === "offline"
        ? "オフラインのため、メモを取得できません。接続が回復すると取得します。"
        : d.loadFailed
          ? "メモを取得できませんでした。"
          : "メモを取得しています。"
      : s.status === "unknown"
      ? "保存できたかを確認できません。通信が切れたため、サーバーでは保存されている可能性があります。"
      : s.status === "checking"
        ? "保存されたかを確認しています。"
        : s.status === "saving"
          ? "保存しています。"
          : !availability.allowed
            ? `${mutationReason(availability.reason, "保存")}入力した内容は、この画面に残ります。`
            : s.status === "saved"
              ? "保存しました。"
              : s.status === "failed"
                ? s.message
                : ""
  return (
    <div data-testid="sys-save" data-workspace={workspace} className="flex min-w-0 flex-col gap-4">
      {onWorkspaceChange && (
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
          <legend className="mb-1 font-medium">ワークスペース</legend>
          {(["hq", "west"] as const).map((w) => (
            <Radio key={w} name="sys-save-workspace" checked={workspace === w} onChange={() => onWorkspaceChange(w)}>
              {workspaces[w].name}
            </Radio>
          ))}
        </fieldset>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor="sys-save-memo" className="text-ui font-medium">
          {customer.company}のメモ
        </label>
        <Textarea id="sys-save-memo" rows={3} value={d.text} disabled={d.saved === null} onChange={(e) => setDraft({ ...d, text: e.target.value })} aria-describedby="sys-save-status" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={submit} loading={s.status === "saving"} disabled={!canSubmit || (!dirty && s.status !== "failed")}>
          保存
        </Button>
        {d.saved === null && d.loadFailed && online && (
          <Button variant="outline" size="sm" onClick={loadMemo}>
            もう一度取得
          </Button>
        )}
        {(s.status === "unknown" || s.status === "checking") && (
          <Button variant="outline" size="sm" loading={s.status === "checking"} disabled={connectivity.status !== "online"} onClick={() => s.status === "unknown" && check(s.requestId, s.text)}>
            保存されたかを確認
          </Button>
        )}
      </div>
      <p id="sys-save-status" role="status" data-testid="sys-save-status" data-status={s.status} data-loaded={d.saved !== null} className="min-h-6 text-ui text-muted-foreground">
        {message}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- Status Page の例

const incidentTime = (api: SystemApi, minutes: number) => formatDateTime(api.at(minutes))

/**
 * Status Page の構成の例。全体の稼働状況、機能ごとの状態、現在の障害と対応状況、メンテナンスの予定、過去の障害、最終更新の時刻。
 * 状態を取得できない場合は「状態を取得できません」と示し、正常と表示しない。内部の構成や Stack Trace を示さない。
 * 実際の Status Page は、主要なサービスと異なる障害の境界で運用する（模擬のため、同じ模擬のサーバーから取得する）。
 */
export function StatusPageExample({ api = systemServer, headingLevel = 3 }: { api?: SystemApi; headingLevel?: 2 | 3 }) {
  const guard = useScopeGuard("status-page")
  const [state, setState] = useState<{ data: ServiceStatusResponse | null; status: "loading" | "ready" | "failed" }>({ data: null, status: "loading" })
  const load = useCallback(() => {
    const ticket = guard.begin("status")
    setState((s) => ({ ...s, status: s.data ? s.status : "loading" }))
    api.getServiceStatus(ticket.signal).then(
      (data) => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        setState({ data, status: "ready" })
      },
      (error) => {
        if (!guard.isLatest(ticket) || isAbortError(error)) return
        guard.release(ticket)
        setState((s) => ({ ...s, status: "failed" }))
      }
    )
  }, [api, guard])
  useEffect(() => {
    load()
  }, [load])
  const H = `h${headingLevel}` as const
  const Sub = `h${headingLevel + 1}` as "h3" | "h4"
  const data = state.status === "ready" ? state.data : null
  const overall: ServiceHealth = data ? overallHealth(serviceComponents.map((k) => data.components[k])) : "unknown"
  const overallText: Record<ServiceHealth, string> = {
    operational: "すべての機能が正常に動作しています",
    degraded: "一部の機能の動作が遅くなっています",
    "partial-outage": "一部の機能を利用できません",
    outage: "サービスを利用できません",
    maintenance: "メンテナンス中です",
    recovering: "復旧を確認しています",
    unknown: "状態を取得できません",
  }
  const current = data?.incidents.filter((i) => i.status !== "resolved") ?? []
  const past = data?.incidents.filter((i) => i.status === "resolved") ?? []
  return (
    <div data-testid="sys-status-page" data-overall={overall} className="flex min-w-0 flex-col gap-10">
      <div className="flex flex-col gap-2">
        <H className="text-section">営業管理の稼働状況</H>
        <p className="text-caption text-muted-foreground">模擬の Status Page です。実際の障害の監視は行っていません。</p>
      </div>
      <div className="flex flex-col gap-3" aria-busy={state.status === "loading" || undefined}>
        <p role="status" className="flex items-center gap-3 text-heading" data-testid="sys-status-overall">
          <ServiceHealthLabel health={overall} label={state.status === "loading" ? "状態を取得しています" : overallText[overall]} className="text-heading [&_svg]:size-5" />
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-ui text-muted-foreground" data-testid="sys-status-updated">
            {data ? `最終更新：${incidentTime(api, data.updatedAt)}` : state.status === "failed" ? "状態を取得できませんでした。時間をおいて、もう一度取得してください。" : ""}
          </p>
          <Button variant="outline" size="sm" onClick={load} loading={state.status === "loading" && state.data !== null}>
            最新の状態を取得
          </Button>
        </div>
      </div>
      {data && (
        <>
          <section className="flex flex-col gap-3">
            <Sub className="text-heading">機能ごとの状態</Sub>
            <dl className="flex flex-col" data-testid="sys-status-components">
              {serviceComponents.map((k) => (
                <div key={k} className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-border py-3 last:border-b-0">
                  <dt className="text-ui">{serviceComponentLabels[k]}</dt>
                  <dd>
                    <ServiceHealthLabel health={data.components[k]} className="text-muted-foreground" />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="flex flex-col gap-3">
            <Sub className="text-heading">現在の障害</Sub>
            {current.length === 0 ? <p className="text-ui text-muted-foreground">現在の障害はありません</p> : <IncidentList api={api} incidents={current} />}
          </section>
          <section className="flex flex-col gap-3">
            <Sub className="text-heading">メンテナンスの予定</Sub>
            {data.maintenance.length === 0 ? (
              <p className="text-ui text-muted-foreground">予定はありません</p>
            ) : (
              <ul className="flex flex-col gap-4" data-testid="sys-status-maintenance">
                {data.maintenance.map((m) => (
                  <li key={m.id} className="flex flex-col gap-1">
                    <p className="text-ui font-medium">{m.title}</p>
                    <p className="text-ui">{formatWindow(m.start, m.end)}</p>
                    <p className="text-ui text-muted-foreground">
                      {m.components.map((k) => serviceComponentLabels[k]).join("と")}を利用できません。{m.action}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <Sub className="text-heading">過去の障害</Sub>
            <IncidentList api={api} incidents={past} />
          </section>
        </>
      )}
    </div>
  )
}

function IncidentList({ api, incidents }: { api: SystemApi; incidents: Incident[] }) {
  return (
    <ul className="flex flex-col gap-6">
      {incidents.map((i) => (
        <li key={i.id} className="flex flex-col gap-2" data-incident={i.id}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-ui font-medium">{i.title}</p>
            <p className="text-ui text-muted-foreground">{incidentStatusLabels[i.status]}</p>
          </div>
          <p className="text-caption text-muted-foreground">
            {i.components.map((k) => serviceComponentLabels[k]).join("、")} ・ {incidentTime(api, i.startedAt)}に発生
            {i.resolvedAt !== null && ` ・ ${incidentTime(api, i.resolvedAt)}に解決`}
          </p>
          <ol className="flex flex-col gap-1">
            {i.updates.map((u) => (
              <li key={u.at} className="text-ui text-muted-foreground">
                {formatTime(api.at(u.at))}　{u.text}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- オフラインの新規登録

export type OfflineMode = OfflineEntryMode
export const offlineModeLabels: Record<OfflineMode, string> = {
  "online-only": "登録不可（オンラインが必要）",
  "input-only": "入力のみ可能（回復後に利用者が登録）",
  "offline-queue": "オフライン登録（端末に保存し、後で同期）",
}

export type SyncState = OfflineSyncState
export const syncStateLabels: Record<SyncState, string> = {
  "saved-locally": "端末に保存しました（まだ登録されていません）",
  waiting: "同期を待っています（まだ登録されていません）",
  syncing: "サーバーに送っています",
  synced: "登録しました",
  failed: "登録できませんでした",
  conflict: "同じ名前の顧客が、ほかの利用者によって登録されています",
  unknown: "登録されたかを確認できません",
}
const syncCondition: Record<SyncState, SystemCondition> = {
  "saved-locally": "offline",
  waiting: "connecting",
  syncing: "connecting",
  synced: "operational",
  failed: "outage",
  conflict: "partial-outage",
  unknown: "unknown",
}

function StateText({ condition, label }: { condition: SystemCondition; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-ui text-muted-foreground">
      <ConditionIcon condition={condition} className="size-4" />
      {label}
    </span>
  )
}

type QueueItem = { localId: string; name: string; state: SyncState; attempts: number }

/**
 * オフラインの新規登録の 3 方式の例。端末への保存はこの画面のメモリだけ（再読み込みで消える。永続的なローカルの保存はしない）。
 * - 登録不可：オフラインの間は入力も受け付けない。
 * - 入力のみ可能：入力は受け付け、登録はオンラインの間だけ。入力はこの画面に残り、回復後に利用者が登録する。
 * - オフライン登録：端末に保存し、オンラインになったら送る。端末に保存しただけで「登録しました」と示さない。
 *   送るときは端末の ID（localId）を重複の防止のキーにする（冪等性）。結果が不明なら、登録されたかを確かめてから送り直す。
 */
export function OfflineRegistrationExample({ monitor, workspace = "hq", mode, onModeChange }: { monitor: SystemMonitor; workspace?: WorkspaceId; mode: OfflineMode; onModeChange: (m: OfflineMode) => void }) {
  const { api, connectivity } = monitor
  const reportFailure = connectivity.reportFailure
  // 登録は接続を確認できた間（online）だけ。確認していない間（unknown）と再接続の確認中は送らない
  const online = connectivity.status === "online"
  const offline = connectivity.status === "offline"
  const [name, setName] = useState("")
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [message, setMessage] = useState("")
  const guard = useScopeGuard(`${workspace}:${mode}`)
  const nextId = useRef(0)
  // タイマーから読む最新の一覧。描画の中では書き換えない（commit の後に更新する）
  const queueRef = useRef(queue)
  useLayoutEffect(() => {
    queueRef.current = queue
  })

  const update = (localId: string, patch: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.localId === localId ? { ...i, ...patch } : i)))

  const send = useCallback(
    (item: QueueItem) => {
      const ticket = guard.begin(item.localId)
      setQueue((q) => q.map((i) => (i.localId === item.localId ? { ...i, state: "syncing" } : i)))
      api.registerCustomer({ workspace, localId: item.localId, name: item.name }, ticket.signal).then(
        () => {
          if (!guard.isLatest(ticket)) return
          // キーは登録ごと（localId）のため、終わったら記録を消す（長時間の利用で増え続けない）
          guard.release(ticket)
          setQueue((q) => q.map((i) => (i.localId === item.localId ? { ...i, state: "synced" } : i)))
        },
        (error) => {
          if (!guard.isLatest(ticket)) return
          guard.release(ticket)
          const attempts = item.attempts + 1
          if (error instanceof MockUnknownError) {
            // 結果が不明：送り直す前に、登録されたかを確かめる（安全な取得）
            setQueue((q) => q.map((i) => (i.localId === item.localId ? { ...i, state: "unknown", attempts } : i)))
            return
          }
          if (error instanceof MockRequestError && error.code === "conflict") {
            setQueue((q) => q.map((i) => (i.localId === item.localId ? { ...i, state: "conflict", attempts } : i)))
            return
          }
          // 届かなかった：重複の防止のキーがあるため、上限まで自動で送り直してよい
          const retry = isNetworkError(error) && canAutoRetry({ kind: "mutation", failure: "network", attempt: attempts, idempotent: true, policy: { baseDelay: 1000, maxDelay: 4000, maxAttempts: 3 } })
          setQueue((q) => q.map((i) => (i.localId === item.localId ? { ...i, state: retry ? "waiting" : "failed", attempts } : i)))
          if (isNetworkError(error)) reportFailure()
        }
      )
    },
    [api, guard, workspace, reportFailure]
  )
  // タイマーから最新の send（最新の guard）を呼ぶ。描画の中では書き換えない
  const sendRef = useRef(send)
  useLayoutEffect(() => {
    sendRef.current = send
  })

  const confirm = (item: QueueItem) => {
    const ticket = guard.begin(item.localId)
    api.checkRegistration({ workspace, localId: item.localId }, ticket.signal).then(
      (r) => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        if (r.registered) update(item.localId, { state: "synced" })
        else update(item.localId, { state: "waiting" })
      },
      () => {
        if (guard.isLatest(ticket)) guard.release(ticket)
      }
    )
  }

  // オンラインの間、同期を待っている登録を送る。送る前に「同期を待っています」を示す
  const waitingKey = queue
    .filter((i) => i.state === "saved-locally" || i.state === "waiting")
    .map((i) => i.localId)
    .join(",")
  useEffect(() => {
    if (!online || mode !== "offline-queue" || waitingKey === "") return
    setQueue((q) => (q.some((i) => i.state === "saved-locally") ? q.map((i) => (i.state === "saved-locally" ? { ...i, state: "waiting" } : i)) : q))
    const timer = setTimeout(() => {
      for (const id of waitingKey.split(",")) {
        const latest = queueRef.current.find((q) => q.localId === id)
        if (latest && (latest.state === "saved-locally" || latest.state === "waiting")) sendRef.current(latest)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [online, mode, waitingKey])

  // 直接の登録（オンライン）の状態。送っている間、結果が不明な間、確かめている間は、同じ登録を重ねない。
  // 重複の防止のキー（localId）は、登録が確定するか、入力を変えるまで同じ値を使う（冪等性）。
  type Direct = { scope: string; status: "idle" | "sending" | "unknown" | "checking"; localId: string | null; name: string }
  const directScope = `${workspace}:${mode}`
  const [directState, setDirect] = useState<Direct>({ scope: directScope, status: "idle", localId: null, name: "" })
  const direct: Direct = directState.scope === directScope ? directState : { scope: directScope, status: "idle", localId: null, name: "" }
  if (directState.scope !== directScope) setDirect(direct)
  const directBusy = useRef<string | null>(null)
  // 同じ描画の中で 2 回押されても、2 回目は入力が空として扱う（端末への保存の重複を防ぐ）
  const nameRef = useRef(name)
  const changeName = (value: string) => {
    nameRef.current = value
    setName(value)
    // 入力を変えたら、前の重複の防止のキーは使わない（結果が不明な間は、入力を変えても登録を受け付けない）
    if (direct.status === "idle" && direct.localId) setDirect({ ...direct, localId: null })
  }

  const register = () => {
    const value = nameRef.current.trim()
    if (!value) return
    if (mode === "offline-queue" && !online) {
      const item: QueueItem = { localId: `local-${++nextId.current}`, name: value, state: "saved-locally", attempts: 0 }
      nameRef.current = ""
      setQueue((q) => [...q, item])
      setName("")
      setMessage(`${value}を端末に保存しました。まだ登録されていません。接続が回復したら送ります。`)
      return
    }
    if (!online) return
    if (directBusy.current === directScope || direct.status !== "idle") return
    directBusy.current = directScope
    const localId = direct.localId ?? `direct-${++nextId.current}`
    const ticket = guard.begin("direct")
    setDirect({ scope: directScope, status: "sending", localId, name: value })
    setMessage("登録しています。")
    api.registerCustomer({ workspace, localId, name: value }, ticket.signal).then(
      () => {
        if (directBusy.current === directScope) directBusy.current = null
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        nameRef.current = ""
        setName("")
        setDirect({ scope: directScope, status: "idle", localId: null, name: "" })
        setMessage(`${value}を登録しました。`)
      },
      (error) => {
        if (directBusy.current === directScope) directBusy.current = null
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        if (isNetworkError(error)) reportFailure()
        if (error instanceof MockUnknownError) {
          // 登録されたかを確かめるまで、もう一度登録させない
          setDirect({ scope: directScope, status: "unknown", localId, name: value })
          setMessage("登録できたかを確認できません。入力した内容は残っています。登録されたかを確かめてください。")
          return
        }
        // 処理されていない失敗：同じキーで、もう一度登録できる
        setDirect({ scope: directScope, status: "idle", localId, name: value })
        setMessage("登録できませんでした。入力した内容は残っています。")
      }
    )
  }

  const confirmDirect = () => {
    if (direct.status !== "unknown" || !direct.localId) return
    const { localId, name: value } = direct
    const ticket = guard.begin("direct")
    setDirect({ ...direct, status: "checking" })
    setMessage("登録されたかを確認しています。")
    api.checkRegistration({ workspace, localId }, ticket.signal).then(
      (r) => {
        if (!guard.isLatest(ticket)) return
        guard.release(ticket)
        if (r.registered) {
          nameRef.current = ""
          setName("")
          setDirect({ scope: directScope, status: "idle", localId: null, name: "" })
          setMessage(`${value}は登録されていました。`)
        } else {
          setDirect({ scope: directScope, status: "idle", localId, name: value })
          setMessage("登録されていませんでした。入力した内容は残っています。もう一度登録できます。")
        }
      },
      (error) => {
        if (!guard.isLatest(ticket) || isAbortError(error)) return
        guard.release(ticket)
        if (isNetworkError(error)) reportFailure()
        setDirect({ scope: directScope, status: "unknown", localId, name: value })
        setMessage("登録されたかを確認できませんでした。")
      }
    )
  }

  const inputDisabled = mode === "online-only" && !online
  // 直接の登録の結果を確かめる前は、端末への保存も含めて、同じ登録を受け付けない
  const submitDisabled = (!online && mode !== "offline-queue") || direct.status !== "idle"
  const reason = online
    ? ""
    : !offline && connectivity.confirmedAt === null && connectivity.status === "unknown"
      ? mode === "offline-queue"
        ? "接続を確認しています。確認できるまでは端末に保存し、確認できたら送ります。"
        : "接続を確認しています。確認できるまで登録できません。"
      : mode === "online-only"
        ? "オンラインのときだけ登録できます。"
        : mode === "input-only"
          ? "接続が回復したら「登録」を押してください。入力した内容は、この画面に残ります。"
          : "オフラインの間は端末に保存し、接続が回復したら送ります。"
  return (
    <div data-testid="sys-offline-register" data-mode={mode} className="flex min-w-0 flex-col gap-6">
      <fieldset className="flex flex-col gap-1 text-ui">
        <legend className="mb-1 font-medium">新規登録の方式</legend>
        {(Object.keys(offlineModeLabels) as OfflineMode[]).map((m) => (
          <Radio key={m} name="sys-offline-mode" checked={mode === m} onChange={() => onModeChange(m)}>
            {offlineModeLabels[m]}
          </Radio>
        ))}
      </fieldset>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          register()
        }}
      >
        <label htmlFor="sys-offline-name" className="text-ui font-medium">
          会社名
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <Input id="sys-offline-name" value={name} disabled={inputDisabled} onChange={(e) => changeName(e.target.value)} className="w-72 max-w-full" aria-describedby="sys-offline-reason" />
          <Button type="submit" variant="secondary" loading={online && direct.status === "sending"} disabled={submitDisabled || !name.trim()}>
            {mode === "offline-queue" && !online ? "端末に保存" : "登録"}
          </Button>
        </div>
        <p id="sys-offline-reason" className="min-h-6 text-ui text-muted-foreground" data-testid="sys-offline-reason">
          {reason}
        </p>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="min-h-6 text-ui text-muted-foreground" data-testid="sys-offline-message" data-direct={direct.status}>
          {message}
        </p>
        {(direct.status === "unknown" || direct.status === "checking") && (
          <Button variant="outline" size="sm" loading={direct.status === "checking"} disabled={!online} onClick={confirmDirect}>
            登録されたかを確認
          </Button>
        )}
      </div>
      {mode === "offline-queue" && queue.length > 0 && (
        <ul aria-label="端末に保存した登録" className="flex flex-col divide-y divide-border" data-testid="sys-offline-queue">
          {queue.map((item) => (
            <li key={item.localId} data-sync={item.state} data-registered={isRegisteredOnServer(item.state)} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-ui font-medium">{item.name}</span>
                <StateText condition={syncCondition[item.state]} label={syncStateLabels[item.state]} />
              </div>
              {item.state === "unknown" && (
                <Button variant="outline" size="sm" disabled={!online} onClick={() => confirm(item)}>
                  登録されたかを確認
                </Button>
              )}
              {(item.state === "failed" || item.state === "conflict") && (
                <Button variant="ghost" size="sm" onClick={() => setQueue((q) => q.filter((i) => i.localId !== item.localId))}>
                  端末から削除
                </Button>
              )}
              {item.state === "failed" && (
                <Button variant="outline" size="sm" disabled={!online} onClick={() => send({ ...item, attempts: 0 })}>
                  もう一度送る
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** オフライン登録の状態の表示例（模擬の状態。操作はできない） */
export function SyncStatesList() {
  return (
    <dl className="grid gap-x-8 gap-y-3 text-ui sm:grid-cols-[12rem_1fr]" data-testid="sys-sync-states">
      {(Object.keys(syncStateLabels) as SyncState[]).map((s) => (
        <div key={s} className="contents">
          <dt className="font-medium">{({ "saved-locally": "端末への保存", waiting: "同期待ち", syncing: "同期中", synced: "同期成功", failed: "同期失敗", conflict: "競合", unknown: "結果不明" } as const)[s]}</dt>
          <dd>
            <StateText condition={syncCondition[s]} label={syncStateLabels[s]} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------- 接続の状態の常時表示（接続が判断に必要な製品の例）

export type CallTarget = "tokyo" | "osaka"
const callTargets: Record<CallTarget, string> = { tokyo: "東京の通話サーバー", osaka: "大阪の通話サーバー" }
/** 接続を確認する方法。probe：疎通の確認の API。request：業務の要求の成功（疎通の確認の API がない製品） */
export type CallConfirmMode = "probe" | "request"
const confirmedByLabels = { probe: "疎通の確認", request: "業務の要求", initial: "確認済みの初期状態" } as const

/**
 * 通話の画面の例。接続の状態が判断に必要なため、常に表示する。接続先（通話のサーバー）ごとに確かめ直す。
 * - 一度も確認していない間は「接続を確認していません」とし、正常と示さない。通話の開始は、接続を確認できた間だけ受け付ける
 *   （getMutationAvailability の既定。確認していない接続で通話を始めない）。
 * - 接続先を変えたら、前の接続先の確認の状態と応答を使わない（useConnectivity の target）。
 * - 疎通の確認の API がない場合（request）は、業務の要求の応答が届いたときだけ確認できたとする（reportReachable）。
 */
export function CallConnectionIndicator({ api = systemServer }: { api?: SystemApi }) {
  const [target, setTarget] = useState<CallTarget>("tokyo")
  const [mode, setMode] = useState<CallConfirmMode>("probe")
  return (
    <div className="flex flex-col gap-6" data-testid="sys-call">
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
          <legend className="mb-1 font-medium">接続先</legend>
          {(Object.keys(callTargets) as CallTarget[]).map((t) => (
            <Radio key={t} name="sys-call-target" checked={target === t} onChange={() => setTarget(t)}>
              {callTargets[t]}
            </Radio>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
          <legend className="mb-1 font-medium">接続の確認の方法（模擬）</legend>
          <Radio name="sys-call-mode" checked={mode === "probe"} onChange={() => setMode("probe")}>
            疎通の確認の API
          </Radio>
          <Radio name="sys-call-mode" checked={mode === "request"} onChange={() => setMode("request")}>
            業務の要求の応答（疎通の確認の API なし）
          </Radio>
        </fieldset>
      </div>
      {/* 確認の方法を変えたら、接続の状態を最初から確かめる（別の hook のインスタンスにする） */}
      <CallConnectionPanel key={mode} api={api} target={target} mode={mode} />
    </div>
  )
}

function CallConnectionPanel({ api, target, mode }: { api: SystemApi; target: CallTarget; mode: CallConfirmMode }) {
  const c = useConnectivity({
    probe: mode === "probe" ? ({ signal, target: t }) => api.probe({ signal, target: t }) : undefined,
    browserOnline: api.browser,
    retry: api.retry,
    timeout: 3000,
    target,
  })
  useServerVersion(api)
  const [message, setMessage] = useState("")
  const condition: SystemCondition =
    c.status === "offline" ? "offline" : c.status === "connecting" ? "connecting" : c.status === "unknown" ? "unknown" : "operational"
  const label =
    condition === "operational"
      ? `${callTargets[target]}に接続しています`
      : condition === "connecting"
        ? c.confirmedAt === null
          ? "接続しています"
          : "再接続しています"
        : condition === "offline"
          ? "接続していません"
          : c.checking
            ? "接続を確認しています"
            : "接続を確認していません"
  // 通話の開始は、接続を確認できた間だけ（確認していない接続を確認済みとして扱わない）
  const call = getMutationAvailability({ connectivity: c.status })
  // 業務の要求（疎通の確認の API がない製品）。始めたときの接続先を渡し、変わった後の応答を反映しない
  const fetchHistory = () => {
    const t = target
    api.listCustomers("hq", "").then(
      () => c.reportReachable({ target: t }),
      (error) => {
        if (isNetworkError(error)) c.reportFailure({ target: t })
        else if (!isAbortError(error)) c.reportReachable({ target: t })
      }
    )
  }
  return (
    <div className="flex flex-col gap-4" data-testid="sys-indicator-frame" data-target={target} data-mode={mode} data-attempt={c.attempt}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SystemStatusIndicator
          condition={condition}
          label={label}
          data-testid="sys-indicator"
          data-status={c.status}
          data-confirmed-by={c.confirmedBy ?? undefined}
          detail={c.confirmedAt !== null && condition === "operational" && c.confirmedBy ? `${formatTime(c.confirmedAt)}に確認（${confirmedByLabels[c.confirmedBy]}）` : undefined}
        />
        {mode === "probe" ? (
          <Button variant="outline" size="sm" onClick={c.check} loading={c.checking} disabled={!api.browserOnline}>
            接続を確認
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={fetchHistory} disabled={!api.browserOnline}>
            通話の履歴を取得
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          data-testid="sys-call-start"
          disabled={!call.allowed}
          aria-describedby={!call.allowed ? "sys-call-reason" : undefined}
          onClick={() => setMessage(`（模擬）${callTargets[target]}で通話を開始しました。`)}
        >
          通話を開始
        </Button>
        <p id="sys-call-reason" className="min-h-6 text-ui text-muted-foreground" data-testid="sys-call-reason">
          {call.allowed ? message : call.reason === "unconfirmed" ? "接続を確認できるまで、通話を開始できません。" : mutationReason(call.reason, "通話を開始")}
        </p>
      </div>
    </div>
  )
}
