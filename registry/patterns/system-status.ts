// Flow Design System Status（Patterns / System & Account / System States）
// サービスとの接続、サービスの稼働、保存などの処理、長時間の処理の状態を区別して扱うための型と純粋な関数。
// 定義と判断基準は docs/web/patterns/system-states.md を参照。hook は system-status-hooks.ts（useConnectivity、useStableIssues）、
// 表示の部品は system-banner.tsx、service-state.tsx、job-status.tsx。
// このファイルは React とブラウザに依存しない（サーバーの描画とブラウザを使わない検品から読み込む）。
//
// この部品が守ること
// - 状態を 1 つの error にまとめない。接続（Connectivity）、サービスの稼働（Service Health）、処理（Mutation、Job）を別の値で持つ。
//   データの取得と鮮度（Data State）は Data Browsing の useBrowseData を使う（ここでは再実装しない）。
// - 状態を取得できない場合を「不明」（unknown）として扱い、正常（operational）にしない（healthOf）。
// - ブラウザのオンラインの状態（navigator.onLine）だけで、サービスに接続できるとは判断しない。オンラインになったら
//   製品が渡す疎通の確認（probe）を行い、成功するまで connecting とする（useConnectivity）。
// - 疎通の確認と安全な取得だけを、間隔と上限を設けて自動で再試行する。登録・編集・削除・決済・外部送信は、
//   冪等性が保証される場合を除いて自動で再試行しない。権限不足などは再試行しない（canAutoRetry）。
// - 接続と切断を短時間に繰り返す場合に、表示と読み上げを繰り返さない（useStableIssues）。操作の制限は遅らせない
//   （制限には useConnectivity の値をそのまま使う）。
// - 長時間の処理の古い状態（前の処理、順序が入れ替わって届いた応答）で、新しい状態を上書きしない（mergeJobUpdates）。
//   キャンセルの要求を、処理の停止として扱わない（displayJobState）。
// - 描画の中で window、navigator、Date.now() を読まない（SSR と Hydration で不一致を起こさない）。
//
// この部品が持たないもの（製品の責務）
// - 疎通の確認の API、サービスの状態の取得、障害の監視、Status Page の運用。
// - 通信の処理、再試行の実際の制御（要求の再送、冪等性のキー）、エラーの種類の判別。
// - ジョブの実行と管理の基盤、キャンセルの処理、オフライン同期とローカルの保存。

// ---------------------------------------------------------------- 状態の分類

/** 利用者に示す状態の分類。1 つの error にまとめない。unknown は状態を取得できない（正常として扱わない） */
type SystemCondition =
  | "operational"
  | "connecting"
  | "offline"
  | "degraded"
  | "partial-outage"
  | "outage"
  | "maintenance"
  | "recovering"
  | "unknown"

/** Connectivity：サービスとの接続。online は疎通を確認できた状態（ブラウザの online だけではない） */
type ConnectivityStatus = "online" | "connecting" | "offline"

/** offline の理由。browser：端末がネットワークに接続していない。unreachable：自動の再確認の上限まで疎通を確認できなかった */
type OfflineReason = "browser" | "unreachable"

/** Service Health：サービスや機能ごとの稼働状態。recovering は障害の対応の後で、回復を確かめている状態 */
type ServiceHealth = Extract<SystemCondition, "operational" | "degraded" | "partial-outage" | "outage" | "maintenance" | "recovering" | "unknown">

/** サービスの状態の取得の結果。failed と loading の間は、すべての機能を unknown として扱う */
type ServiceStatusReport<C extends string = string> =
  | { status: "loading" }
  | { status: "failed"; checkedAt: number | null }
  | { status: "ready"; components: Partial<Record<C, ServiceHealth>>; checkedAt: number }

/** 影響の範囲。action：特定の操作、region：画面の一部の領域、page：特定のページ、pages：複数のページ、product：製品全体 */
type ImpactScope = "action" | "region" | "page" | "pages" | "product"

/** 表示の位置。inline：操作の近く、region：領域の中の Alert・Error、page：ページの中の通知、banner：共通の Banner、screen：専用の状態の画面 */
type IssuePlacement = "inline" | "region" | "page" | "banner" | "screen"

/** 利用者に示す問題。文（何が起きているか、影響、必要な行動）は製品が書く */
type SystemIssue = {
  /** 安定した ID（"connectivity"、"service:search"、"maintenance:2026-12-03" など）。集約と表示の安定に使う */
  id: string
  condition: Exclude<SystemCondition, "operational">
  scope: ImpactScope
  /** 何が起きているか */
  title: string
  /** 影響の範囲（使えない機能、使える機能） */
  impact?: string
  /** 利用者が取るべき行動（取る必要がない場合は書かない） */
  action?: string
  /** 利用者が閉じてよい（任意のお知らせ）。重大な利用の制限は閉じられるようにしない */
  dismissible?: boolean
  /** current：現在起きている問題（既定）。upcoming：予定（メンテナンスの事前のお知らせ）。現在の問題より後に並べる */
  timing?: "current" | "upcoming"
}

const conditionLabels: Record<SystemCondition, string> = {
  operational: "正常",
  connecting: "接続中",
  offline: "オフライン",
  degraded: "動作が遅い",
  "partial-outage": "一部の障害",
  outage: "停止中",
  maintenance: "メンテナンス中",
  recovering: "復旧を確認中",
  unknown: "状態を確認できません",
}

// 重大な順（小さいほど重大）。Banner の並びと、集約したときに先頭に示す問題を決める。
const severityOrder: Record<SystemCondition, number> = {
  outage: 0,
  maintenance: 1,
  offline: 2,
  "partial-outage": 3,
  connecting: 4,
  degraded: 5,
  recovering: 6,
  unknown: 7,
  operational: 8,
}

/** 並べる順。現在の問題を予定より前にし、それぞれを重大な順に並べる */
const compareIssues = (a: Pick<SystemIssue, "condition" | "timing">, b: Pick<SystemIssue, "condition" | "timing">) =>
  Number(a.timing === "upcoming") - Number(b.timing === "upcoming") || severityOrder[a.condition] - severityOrder[b.condition]

/** サービスの状態の取得の結果から、機能の状態を返す。取得に失敗した、取得中、項目がない場合は unknown（正常にしない） */
function healthOf<C extends string>(report: ServiceStatusReport<C> | null | undefined, component: C): ServiceHealth {
  if (!report || report.status !== "ready") return "unknown"
  return report.components[component] ?? "unknown"
}

/** 複数の機能の状態から、全体の状態を返す。1 つでも unknown があり、ほかに問題がなければ unknown（正常にしない） */
function overallHealth(healths: readonly ServiceHealth[]): ServiceHealth {
  if (healths.length === 0) return "unknown"
  if (healths.every((h) => h === "outage")) return "outage"
  if (healths.every((h) => h === "maintenance")) return "maintenance"
  if (healths.every((h) => h === "operational")) return "operational"
  const problems = healths.filter((h) => h !== "operational" && h !== "unknown")
  if (problems.length === 0) return "unknown"
  if (problems.some((h) => h === "outage" || h === "partial-outage" || h === "maintenance")) return "partial-outage"
  if (problems.some((h) => h === "degraded")) return "degraded"
  return "recovering"
}

/** 問題の表示の位置。製品全体が使えない場合（停止、メンテナンス）だけ専用の画面にする。オフラインは既存のデータを残すため Banner */
function placementOf(issue: Pick<SystemIssue, "condition" | "scope" | "timing">): IssuePlacement {
  switch (issue.scope) {
    case "product":
      return issue.timing !== "upcoming" && (issue.condition === "outage" || issue.condition === "maintenance") ? "screen" : "banner"
    case "pages":
      return "banner"
    case "page":
      return "page"
    case "region":
      return "region"
    case "action":
      return "inline"
  }
}

/**
 * 問題を表示の位置ごとに分け、重大な順に並べる。
 * - screen：専用の状態の画面に示す問題（最も重大な 1 つ）。ある場合、Banner は使わない（画面を置き換える）。
 * - banner：共通の Banner に示す問題。閉じたお知らせ（dismissed）を除く。閉じられない問題は、dismissed にあっても除かない。
 * - inline、region、page：操作の近く、領域、ページの中に示す問題。製品が該当する場所に置く。
 */
function summarizeIssues<T extends SystemIssue>(issues: readonly T[], { dismissed = [] }: { dismissed?: readonly string[] } = {}) {
  const sorted = [...issues].sort(compareIssues)
  const by = (p: IssuePlacement) => sorted.filter((i) => placementOf(i) === p)
  const screen = by("screen")[0] ?? null
  return {
    screen,
    banner: screen ? [] : by("banner").filter((i) => !(i.dismissible && dismissed.includes(i.id))),
    page: by("page"),
    region: by("region"),
    inline: by("inline"),
  }
}

// ---------------------------------------------------------------- 操作の制限

type MutationBlockReason = "offline" | "connecting" | "outage" | "maintenance"

/**
 * サーバーへの登録・更新・削除を受け付けてよいか。制限はすぐに行う（表示の遅延と分ける）。
 * - 接続が online でない間（再接続中を含む）は受け付けない。結果を確かめられない処理を増やさないため。
 * - 対象の機能が停止中、メンテナンス中の間は受け付けない。
 * - 動作が遅い、一部の障害、不明の場合は受け付ける（状態の取得の失敗だけで、利用できる機能を止めない）。
 */
function getMutationAvailability({
  connectivity,
  health = "operational",
}: {
  connectivity: ConnectivityStatus
  health?: ServiceHealth
}): { allowed: true; reason: null } | { allowed: false; reason: MutationBlockReason } {
  if (connectivity === "offline") return { allowed: false, reason: "offline" }
  if (connectivity === "connecting") return { allowed: false, reason: "connecting" }
  if (health === "outage") return { allowed: false, reason: "outage" }
  if (health === "maintenance") return { allowed: false, reason: "maintenance" }
  return { allowed: true, reason: null }
}

// ---------------------------------------------------------------- 再試行

type RetryPolicy = {
  /** 最初の再試行までの間隔（ms）。2 回目以降は 2 倍ずつ延ばす */
  baseDelay: number
  /** 間隔の上限（ms） */
  maxDelay: number
  /** 自動の再試行の上限の回数。超えたら自動では試さず、利用者の操作を待つ */
  maxAttempts: number
}

const defaultRetryPolicy: RetryPolicy = { baseDelay: 2000, maxDelay: 30000, maxAttempts: 5 }

/** attempt 回目（1 から）の失敗の後、次の再試行までの間隔。結果を決定的にするため、乱数を加えない（必要なら製品が加える） */
function retryDelay(attempt: number, policy: RetryPolicy = defaultRetryPolicy) {
  const n = Math.max(1, Math.floor(attempt))
  return Math.min(policy.maxDelay, policy.baseDelay * 2 ** (n - 1))
}

/** 処理の種類。read：安全な取得。probe：疎通の確認。mutation：登録・編集・削除。payment：決済。external-send：外部への送信 */
type OperationKind = "read" | "probe" | "mutation" | "payment" | "external-send"

/** 失敗の種類。製品が判別する。unknown-result：応答を受け取れず、サーバーで処理されたかがわからない */
type FailureKind = "network" | "timeout" | "server" | "unknown-result" | "forbidden" | "unauthenticated" | "invalid"

/**
 * 自動で再試行してよいか。
 * - 権限不足、認証切れ、入力の誤りは、再試行しても解決しないため、再試行しない。
 * - 安全な取得と疎通の確認は、上限の回数まで再試行してよい。
 * - 登録・編集・削除・決済・外部送信は、冪等性が保証される場合（同じ要求を何度送っても 1 回だけ処理される）だけ再試行してよい。
 *   結果が不明な処理（unknown-result）は、冪等性が保証されない限り、結果を確かめる前に再実行しない。
 */
function canAutoRetry({
  kind,
  failure,
  attempt,
  idempotent = false,
  policy = defaultRetryPolicy,
}: {
  kind: OperationKind
  failure: FailureKind
  /** これまでに失敗した回数 */
  attempt: number
  /** 同じ要求を何度送っても 1 回だけ処理されることが、API の契約で保証されている */
  idempotent?: boolean
  policy?: RetryPolicy
}) {
  if (failure === "forbidden" || failure === "unauthenticated" || failure === "invalid") return false
  if (attempt >= policy.maxAttempts) return false
  if (kind === "read" || kind === "probe") return true
  return idempotent
}

// ---------------------------------------------------------------- 処理（保存）の状態

/**
 * Mutation State：保存などの処理の状態。
 * - unknown：応答を受け取れなかった（サーバーでは完了している可能性がある）。保存済みとして扱わず、結果を確かめる。
 * - blocked：接続やサービスの状態のため、送っていない（入力は保持する）。
 */
type MutationStatus = "idle" | "saving" | "saved" | "failed" | "unknown" | "checking" | "blocked"

// ---------------------------------------------------------------- 長時間の処理（Job State）

type JobState = "queued" | "running" | "cancel-requested" | "cancelled" | "succeeded" | "partial" | "failed" | "unknown"

type JobProgress = { done: number; total: number }

/** サーバーが返すジョブの状態 */
type JobSnapshot = {
  /** ジョブの ID。処理ごとに異なる（同じ種類の処理をもう一度始めたら、別の ID） */
  id: string
  /** ジョブの状態の版。サーバーが状態を変えるたびに増やす。古い応答の判定に使う */
  revision: number
  state: JobState
  /** 実際の進捗。サーバーが取得できない場合は null（進捗率を示さない） */
  progress: JobProgress | null
}

const jobStateLabels: Record<JobState, string> = {
  queued: "待機中",
  running: "処理中",
  "cancel-requested": "キャンセルを要求しました",
  cancelled: "キャンセルしました",
  succeeded: "完了",
  partial: "一部が失敗",
  failed: "失敗",
  unknown: "結果を確認できません",
}

const activeJobStates: readonly JobState[] = ["queued", "running", "cancel-requested"]
const isJobActive = (state: JobState) => activeJobStates.includes(state)

/** 実際の進捗として示してよい値か。total が 0 以下、数値でない値は進捗として扱わない（進捗率を作らない） */
function normalizeJobProgress(progress: JobProgress | null | undefined): JobProgress | null {
  if (!progress) return null
  const { done, total } = progress
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0 || done < 0) return null
  return { done: Math.min(done, total), total }
}

/**
 * 届いたジョブの状態を、現在の状態に反映する。ジョブの ID ごとに、版（revision）が新しいものだけを反映する。
 * - 同じジョブの古い版（順序が入れ替わって届いた応答、遅れて届いた進捗）で、新しい状態を上書きしない。
 * - 終わった状態（完了、失敗など）から、実行中の状態に戻さない（版の誤りがあっても戻さない）。
 * - 前の処理の状態を、別の ID の新しい処理に反映しない（ID で分ける）。
 * 入力を書き換えず、変更がない場合は同じオブジェクトを返す。
 */
function mergeJobUpdates<T extends JobSnapshot>(current: Readonly<Record<string, T>>, updates: readonly T[]): Record<string, T> {
  let next: Record<string, T> | null = null
  for (const u of updates) {
    const base = next ?? current
    const prev = base[u.id]
    if (prev && u.revision <= prev.revision) continue
    if (prev && !isJobActive(prev.state) && isJobActive(u.state)) continue
    next ??= { ...current }
    next[u.id] = { ...u, progress: normalizeJobProgress(u.progress) }
  }
  return next ?? (current as Record<string, T>)
}

/**
 * 利用者に示すジョブの状態。キャンセルを要求した後も、サーバーが停止を確かめるまでは cancel-requested とする
 * （要求を送っただけで、キャンセルしたと示さない）。サーバーが終わった状態を返したら、その状態を示す
 * （キャンセルの前に完了した場合は succeeded）。
 */
function displayJobState(job: Pick<JobSnapshot, "state">, cancelRequested: boolean): JobState {
  if (cancelRequested && (job.state === "queued" || job.state === "running")) return "cancel-requested"
  return job.state
}

export {
  canAutoRetry,
  compareIssues,
  conditionLabels,
  defaultRetryPolicy,
  displayJobState,
  getMutationAvailability,
  healthOf,
  isJobActive,
  jobStateLabels,
  mergeJobUpdates,
  normalizeJobProgress,
  overallHealth,
  placementOf,
  retryDelay,
  severityOrder,
  summarizeIssues,
}
export type {
  ConnectivityStatus,
  FailureKind,
  ImpactScope,
  IssuePlacement,
  JobProgress,
  JobSnapshot,
  JobState,
  MutationBlockReason,
  MutationStatus,
  OfflineReason,
  OperationKind,
  RetryPolicy,
  ServiceHealth,
  ServiceStatusReport,
  SystemCondition,
  SystemIssue,
}
