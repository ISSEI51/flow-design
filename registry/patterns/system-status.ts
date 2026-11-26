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
// - 接続を確認していない状態（unknown）と、接続を確認できた状態（online）を区別する。最初の状態は unknown
//   （製品が確認済みの初期状態を渡した場合だけ online）。確認していない接続を、確認済みとして扱わない（getMutationAvailability）。
// - ブラウザのオンラインの状態（navigator.onLine）だけで、サービスに接続できるとは判断しない。オンラインになったら
//   製品が渡す疎通の確認（probe）を行うか、製品の要求の成功（reportReachable）を待つ（useConnectivity）。
// - 疎通の確認の成功（経路に届いた）、サービスの正常な稼働（ServiceHealth）、業務のデータの取得の成功（Data State）を混同しない。
// - 疎通の確認と安全な取得だけを、間隔と上限を設けて自動で再試行する。登録・編集・削除・決済・外部送信は、
//   冪等性が保証される場合を除いて自動で再試行しない。権限不足などは再試行しない（canAutoRetry）。
// - 接続と切断を短時間に繰り返す場合に、表示と読み上げを繰り返さない（useStableIssues、advanceStableIssues）。操作の制限は遅らせない
//   （制限には useConnectivity の値をそのまま使う）。即時の認識が必要な問題（immediate）は、表示も遅らせない。
// - 不正な設定値（負、NaN、Infinity、0）と極端な値（0.001ms、1e9 回など）で、再試行の間隔と回数を壊さない（normalizeRetryPolicy、retryPolicyLimits）。
// - 長時間の処理の古い状態（前の処理、順序が入れ替わって届いた応答）で、新しい状態を上書きしない（mergeJobUpdates）。
//   キャンセルの要求を、処理の停止として扱わない（displayJobState）。不正な進捗率と件数を、成功として扱わない（assessJobReport）。
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

/**
 * Connectivity：サービスとの接続。
 * - unknown：接続を確認していない（最初の状態）。または、疎通の確認の API がない製品で、通信の失敗の後にまだ確認できていない。
 * - online：サービスへの経路に届くことを確認できた（疎通の確認の成功、製品の要求の成功、製品が渡した確認済みの初期状態）。
 *   サービスが正常に稼働していること（ServiceHealth）と、業務のデータを取得できたこと（Data State）は意味しない。
 * - connecting：通信の失敗の後、またはブラウザが online に戻った後で、疎通を確認している（自動の確認を含む）。
 * - offline：ブラウザが offline（reason: "browser"）、または自動の確認の上限まで疎通を確認できなかった（"unreachable"）。
 */
type ConnectivityStatus = "unknown" | "online" | "connecting" | "offline"

/** online を確認した方法。probe：疎通の確認。request：製品の要求の成功（reportReachable）。initial：製品が渡した確認済みの初期状態 */
type ConnectivityConfirmation = "probe" | "request" | "initial"

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
  /**
   * 表示を遅らせない（useStableIssues の showDelay を使わない）。即時の認識が必要な重大な障害、操作を止める必要がある問題に付ける。
   * 読み上げも遅らせない（SystemBanner の announceDelay を使わない）。
   */
  immediate?: boolean
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

type MutationBlockReason = "offline" | "connecting" | "unconfirmed" | "outage" | "maintenance"

/**
 * サーバーへの登録・更新・削除を受け付けてよいか。制限はすぐに行う（表示の遅延と分ける）。
 * - 接続が offline、connecting の間は受け付けない。結果を確かめられない処理を増やさないため。
 * - 接続を確認していない間（unknown）は、既定では受け付けない（reason: "unconfirmed"）。確認していない接続を確認済みとして扱わない。
 *   製品が、確認の前に送った要求の失敗を安全に扱える場合だけ、unconfirmed: "allow" を指定する
 *   （電話、機器の操作など、接続の状態を判断に使う製品では指定しない）。
 * - 対象の機能が停止中、メンテナンス中の間は受け付けない。
 * - 動作が遅い、一部の障害、不明の場合は受け付ける（状態の取得の失敗だけで、利用できる機能を止めない）。
 */
function getMutationAvailability({
  connectivity,
  health = "operational",
  unconfirmed = "block",
}: {
  connectivity: ConnectivityStatus
  health?: ServiceHealth
  /** 接続を確認していない間（unknown）の扱い。既定は block */
  unconfirmed?: "block" | "allow"
}): { allowed: true; reason: null } | { allowed: false; reason: MutationBlockReason } {
  if (connectivity === "offline") return { allowed: false, reason: "offline" }
  if (connectivity === "connecting") return { allowed: false, reason: "connecting" }
  if (connectivity !== "online" && !(connectivity === "unknown" && unconfirmed === "allow")) return { allowed: false, reason: "unconfirmed" }
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

/**
 * 再試行の設定の下限と上限。normalizeRetryPolicy は、正しい形の値でも、この範囲に収める。
 * - minDelay（100ms）：間隔の下限。0.001ms などの極端に小さい値で、間隔なしに要求を繰り返さないため。
 * - maxDelay（1 時間）：間隔の上限。setTimeout は 2^31 - 1ms（約 24.8 日）を超える値をすぐに実行するため、それより十分小さい値にする。
 * - maxAttempts（100 回）：自動の再試行の回数の上限。1e9 などの値で、事実上上限のない再試行をしないため。
 */
const retryPolicyLimits = { minDelay: 100, maxDelay: 3_600_000, maxAttempts: 100 } as const

const isPositiveFinite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const clampDelay = (v: number) => clamp(v, retryPolicyLimits.minDelay, retryPolicyLimits.maxDelay)

/**
 * 再試行の設定を、使える値にする。省略した項目と不正な値は、既定の値（fallback）にする。
 * - baseDelay、maxDelay：0 より大きい有限の数だけを使う（負、0、NaN、Infinity は既定の値）。0 を許すと、間隔なしで要求を繰り返すため。
 *   正しい形の値は、下限（100ms）と上限（1 時間）の範囲に収める（retryPolicyLimits）。
 *   maxDelay が baseDelay より小さい場合は、baseDelay にそろえる。
 * - maxAttempts：有限の数だけを使い、小数は切り捨てる。1 より小さい値（0、負）は 1（自動の再試行をしない）。100 より大きい値は 100。
 *   NaN と Infinity は既定の値（上限のない再試行をしないため）。
 * - fallback も同じ規則で確かめる（fallback の不正な項目は defaultRetryPolicy の値）。
 */
function normalizeRetryPolicy(policy: Partial<RetryPolicy> | null | undefined, fallback: RetryPolicy = defaultRetryPolicy): RetryPolicy {
  const fbBase = isPositiveFinite(fallback?.baseDelay) ? fallback.baseDelay : defaultRetryPolicy.baseDelay
  const fbMax = isPositiveFinite(fallback?.maxDelay) ? fallback.maxDelay : defaultRetryPolicy.maxDelay
  const fbAttempts = typeof fallback?.maxAttempts === "number" && Number.isFinite(fallback.maxAttempts) && fallback.maxAttempts >= 1 ? fallback.maxAttempts : defaultRetryPolicy.maxAttempts
  const baseDelay = clampDelay(isPositiveFinite(policy?.baseDelay) ? policy.baseDelay : fbBase)
  const maxRaw = clampDelay(isPositiveFinite(policy?.maxDelay) ? policy.maxDelay : fbMax)
  const attemptsRaw = policy?.maxAttempts
  const attempts = typeof attemptsRaw === "number" && Number.isFinite(attemptsRaw) ? attemptsRaw : fbAttempts
  const maxAttempts = clamp(Math.floor(attempts), 1, retryPolicyLimits.maxAttempts)
  return { baseDelay, maxDelay: Math.max(baseDelay, maxRaw), maxAttempts }
}

/**
 * attempt 回目（1 から）の失敗の後、次の再試行までの間隔。結果を決定的にするため、乱数を加えない（必要なら製品が加える）。
 * attempt が数でない、1 より小さい場合は 1 回目として扱う。policy は normalizeRetryPolicy で使える値にする。
 */
function retryDelay(attempt: number, policy: Partial<RetryPolicy> = defaultRetryPolicy) {
  const p = normalizeRetryPolicy(policy)
  const n = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1
  return Math.min(p.maxDelay, p.baseDelay * 2 ** (n - 1))
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
  /** これまでに失敗した回数。数でない、負の値は、再試行しない（回数を確かめられないため） */
  attempt: number
  /** 同じ要求を何度送っても 1 回だけ処理されることが、API の契約で保証されている */
  idempotent?: boolean
  /** 不正な値は normalizeRetryPolicy で既定の値にする */
  policy?: Partial<RetryPolicy>
}) {
  if (failure === "forbidden" || failure === "unauthenticated" || failure === "invalid") return false
  if (!Number.isFinite(attempt) || attempt < 0) return false
  if (attempt >= normalizeRetryPolicy(policy).maxAttempts) return false
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

// ---------------------------------------------------------------- オフラインの新規登録

/**
 * オフラインの新規登録の方式。
 * - online-only：登録不可。オフラインの間は入力も受け付けない。
 * - input-only：入力のみ可能。入力を画面に残し、接続を確認できた後で利用者が登録する（標準）。
 * - offline-queue：オフライン登録。端末に保存し、後でサーバーに送る。製品が同期の安全性（認証・認可、競合、重複の防止、
 *   保存の期間、端末上の機密データの保護）を保証する場合だけの例外。この部品は同期の処理を持たない。
 */
type OfflineEntryMode = "online-only" | "input-only" | "offline-queue"

/**
 * 端末に保存した登録の状態。synced だけが「サーバーで正式に登録された」状態。
 * - saved-locally：端末に保存した（サーバーには送っていない）。waiting：送るのを待っている。syncing：送っている。
 * - synced：サーバーが登録を確定した。failed：登録されなかった（確か）。conflict：サーバーが競合で拒否した。
 * - unknown：送ったが結果を確認できない（登録された可能性がある。送り直す前に確かめる）。
 */
type OfflineSyncState = "saved-locally" | "waiting" | "syncing" | "synced" | "failed" | "conflict" | "unknown"

/** サーバーで正式に登録されたか。端末への保存、送信中、結果不明は false（登録済みと示さない） */
const isRegisteredOnServer = (state: OfflineSyncState) => state === "synced"

// ---------------------------------------------------------------- 長時間の処理（Job State）

type JobState = "queued" | "running" | "cancel-requested" | "cancelled" | "succeeded" | "partial" | "failed" | "unknown"

const jobStates: readonly JobState[] = ["queued", "running", "cancel-requested", "cancelled", "succeeded", "partial", "failed", "unknown"]

/**
 * 実際の進捗。done / total（処理した件数と、全体の件数）か、percent（進捗率。0 から 100）のどちらか。
 * 正しい値の条件は normalizeJobProgress。
 */
type JobProgress = { done: number; total: number; percent?: undefined } | { percent: number; done?: undefined; total?: undefined }

/** 処理の結果の件数。total（全体の件数）は、わかる場合だけ */
type JobCounts = { succeeded: number; failed: number; total?: number }

/** サーバーが返すジョブの状態 */
type JobSnapshot = {
  /** ジョブの ID。処理ごとに異なる（同じ種類の処理をもう一度始めたら、別の ID） */
  id: string
  /** ジョブの状態の版。サーバーが状態を変えるたびに増やす。古い応答の判定に使う。有限の数でない版の応答は反映しない */
  revision: number
  state: JobState
  /** 実際の進捗。サーバーが取得できない場合は null（進捗率を示さない） */
  progress: JobProgress | null
  /** 結果の件数（成功、失敗）。わからない場合は null か省略 */
  counts?: JobCounts | null
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

/** サーバーが返した状態の値を JobState にする。知らない値は unknown（完了や失敗と推測しない） */
function normalizeJobState(state: unknown): JobState {
  return typeof state === "string" && (jobStates as readonly string[]).includes(state) ? (state as JobState) : "unknown"
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0

/**
 * 実際の進捗として示してよい値か。正しくない値は null（進捗率を作らない。表示では「進み具合を確認できません」）。
 * - done / total：どちらも 0 以上の整数で、total が 1 以上、done が total 以下。NaN、Infinity、負の値、小数、合計を超える値は null。
 * - percent：0 以上 100 以下の有限の数。負、100 を超える値、NaN は null。
 * 正しくない値を、上限や下限に丸めない（100 % を超える値を 100 % として、完了と誤解させない）。
 */
function normalizeJobProgress(progress: JobProgress | null | undefined): JobProgress | null {
  if (!progress || typeof progress !== "object") return null
  if (progress.percent !== undefined) {
    const { percent } = progress
    return typeof percent === "number" && Number.isFinite(percent) && percent >= 0 && percent <= 100 ? { percent } : null
  }
  const { done, total } = progress
  if (!isCount(done) || !isCount(total) || total < 1 || done > total) return null
  return { done, total }
}

/** 進捗の割合（0 から 1）。正しくない進捗は null */
function jobProgressRatio(progress: JobProgress | null | undefined): number | null {
  const p = normalizeJobProgress(progress)
  if (!p) return null
  return p.percent !== undefined ? p.percent / 100 : p.done / p.total
}

/**
 * 結果の件数として示してよい値か。succeeded と failed は 0 以上の整数。total がある場合は 1 以上の整数で、合計が total 以下。
 * total を省略した場合は、knownTotal（進捗の total）で合計を確かめる。正しくない値は null。
 */
function normalizeJobCounts(counts: JobCounts | null | undefined, knownTotal?: number | null): JobCounts | null {
  if (!counts || typeof counts !== "object") return null
  const { succeeded, failed, total } = counts
  if (!isCount(succeeded) || !isCount(failed)) return null
  if (total !== undefined && (!isCount(total) || total < 1)) return null
  const limit = total ?? (isCount(knownTotal) && knownTotal >= 1 ? knownTotal : undefined)
  if (limit !== undefined && succeeded + failed > limit) return null
  return total !== undefined ? { succeeded, failed, total } : { succeeded, failed }
}

type JobReportProblem = "invalid-state" | "invalid-progress" | "invalid-counts" | "inconsistent-result"

/**
 * サーバーが返したジョブの進捗と件数を確かめる。
 * - progress、counts：表示してよい値（正しくない値は null）。
 * - problems：正しくない値と、状態と矛盾する値。1 つでもあれば valid は false。
 * 成功（succeeded）と部分的な失敗（partial）は、次の場合に矛盾とする（成功として示さない）。
 * - succeeded：失敗の件数が 1 以上、成功の件数が全体の件数より少ない、進捗が全体に達していない。
 * - partial：失敗の件数が 0。
 */
function assessJobReport(job: Pick<JobSnapshot, "state" | "progress"> & { counts?: JobCounts | null }): {
  progress: JobProgress | null
  counts: JobCounts | null
  valid: boolean
  problems: JobReportProblem[]
} {
  const problems: JobReportProblem[] = []
  const state = normalizeJobState(job.state)
  if (state !== job.state) problems.push("invalid-state")
  const progress = normalizeJobProgress(job.progress)
  if (job.progress != null && !progress) problems.push("invalid-progress")
  const total = progress && progress.total !== undefined ? progress.total : null
  const counts = normalizeJobCounts(job.counts, total)
  if (job.counts != null && !counts) problems.push("invalid-counts")
  const countTotal = counts?.total ?? total
  if (state === "succeeded") {
    const short =
      (counts && counts.failed > 0) ||
      (counts && countTotal !== null && counts.succeeded < countTotal) ||
      (progress && (progress.percent !== undefined ? progress.percent < 100 : progress.done < progress.total))
    if (short) problems.push("inconsistent-result")
  }
  if (state === "partial" && counts && counts.failed === 0) problems.push("inconsistent-result")
  return { progress, counts, valid: problems.length === 0, problems }
}

/**
 * 届いたジョブの状態を、現在の状態に反映する。ジョブの ID ごとに、版（revision）が新しいものだけを反映する。
 * - 同じジョブの古い版（順序が入れ替わって届いた応答、遅れて届いた進捗）で、新しい状態を上書きしない。
 * - 版が有限の数でない応答は反映しない（比較できないため）。
 * - 終わった状態（完了、失敗など）から、実行中の状態に戻さない（版の誤りがあっても戻さない）。
 * - 前の処理の状態を、別の ID の新しい処理に反映しない（ID で分ける）。
 * 届いた値をそのまま持つ（進捗と件数の確かめは、表示のときに assessJobReport で行う。正しくない値を正しい値に変えて残さない）。
 * 入力を書き換えず、変更がない場合は同じオブジェクトを返す。
 */
function mergeJobUpdates<T extends JobSnapshot>(current: Readonly<Record<string, T>>, updates: readonly T[]): Record<string, T> {
  let next: Record<string, T> | null = null
  for (const u of updates) {
    if (!Number.isFinite(u.revision)) continue
    const base = next ?? current
    const prev = base[u.id]
    if (prev && u.revision <= prev.revision) continue
    if (prev && !isJobActive(prev.state) && isJobActive(u.state)) continue
    next ??= { ...current }
    next[u.id] = u
  }
  return next ?? (current as Record<string, T>)
}

/**
 * 利用者に示すジョブの状態。
 * - キャンセルを要求した後も、サーバーが停止を確かめるまでは cancel-requested とする（要求を送っただけで、キャンセルしたと示さない）。
 *   サーバーが終わった状態を返したら、その状態を示す（キャンセルの前に完了した場合は succeeded）。
 * - 知らない状態の値は unknown。成功と部分的な失敗は、進捗と件数が正しく、矛盾しない場合だけ示す（assessJobReport）。
 *   正しくない場合は unknown（結果を確認できません）。
 */
function displayJobState(job: Pick<JobSnapshot, "state"> & { progress?: JobProgress | null; counts?: JobCounts | null }, cancelRequested: boolean): JobState {
  const state = normalizeJobState(job.state)
  if (cancelRequested && (state === "queued" || state === "running")) return "cancel-requested"
  if ((state === "succeeded" || state === "partial") && !assessJobReport({ state, progress: job.progress ?? null, counts: job.counts }).valid) return "unknown"
  return state
}

// ---------------------------------------------------------------- 表示の安定（useStableIssues の判定）

type StableIssueEntry = {
  /** 現れた時刻（続いている間は変えない） */
  firstSeen: number
  /** 消えた時刻。現れている間は null */
  goneAt: number | null
  /** 表示している */
  shown: boolean
}

/** 表示の安定の判定の状態。スコープごとに持つ（スコープが変わったら、前のスコープの問題を残さない） */
type StableIssuesState = { scope: string | undefined; entries: Readonly<Record<string, StableIssueEntry>>; order: readonly string[] }

const nonNegative = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback)

/**
 * 問題の表示を安定させる判定（純粋な関数。useStableIssues が使う）。now の時点の問題の一覧から、表示する問題を決める。
 * - 問題は showDelay の間続いてから表示する（表示する前に自然に解消した問題は表示しない）。
 *   immediate の問題は、現れた時点で表示する（即時の認識が必要な重大な障害、操作を止める必要がある問題）。
 *   表示の前に同じ ID の問題が immediate に変わった場合も、その時点で表示する。
 * - 表示した問題が消えたら、hideDelay の間は表示を残す（settling。表示中に一時的に解消した問題）。その間に再び現れたら、
 *   続いているものとして扱う（表示と読み上げを繰り返さない）。表示する前の問題も、hideDelay より短い間に再び現れたら、続いているものとして扱う。
 * - scope が前の判定と異なる場合は、前のスコープの問題をすべて捨てる（表示を残さない）。
 * - showDelay、hideDelay が負、NaN、Infinity の場合は、既定の値（1000、2000）にする。
 * 返す値：state（次の判定に渡す）、visible（表示する問題の ID。現在の問題を present の順に、その後に settling）、settling、
 * nextAt（次に判定し直す時刻。予定がなければ null）。
 */
function advanceStableIssues(
  prev: StableIssuesState | null,
  {
    scope,
    present,
    now,
    showDelay = 1000,
    hideDelay = 2000,
  }: { scope?: string; present: readonly { id: string; immediate?: boolean }[]; now: number; showDelay?: number; hideDelay?: number }
): { state: StableIssuesState; visible: string[]; settling: string[]; nextAt: number | null } {
  const show = nonNegative(showDelay, 1000)
  const hide = nonNegative(hideDelay, 2000)
  const base = prev && prev.scope === scope ? prev : { scope, entries: {}, order: [] }
  const entries: Record<string, StableIssueEntry> = {}
  const order: string[] = []
  const presentIds = new Set<string>()
  let nextAt = Infinity
  for (const item of present) {
    if (presentIds.has(item.id)) continue
    presentIds.add(item.id)
    const old = base.entries[item.id]
    const entry: StableIssueEntry =
      !old || (old.goneAt !== null && now - old.goneAt >= hide) ? { firstSeen: now, goneAt: null, shown: false } : { ...old, goneAt: null }
    if (!entry.shown && (item.immediate === true || now - entry.firstSeen >= show)) entry.shown = true
    if (!entry.shown) nextAt = Math.min(nextAt, entry.firstSeen + show)
    entries[item.id] = entry
    order.push(item.id)
  }
  for (const id of base.order) {
    if (presentIds.has(id)) continue
    const old = base.entries[id]
    const goneAt = old.goneAt ?? now
    if (now - goneAt >= hide) continue
    entries[id] = { ...old, goneAt }
    order.push(id)
    nextAt = Math.min(nextAt, goneAt + hide)
  }
  const visible = order.filter((id) => presentIds.has(id) && entries[id].shown)
  const settling = order.filter((id) => !presentIds.has(id) && entries[id].shown)
  return { state: { scope, entries, order }, visible: [...visible, ...settling], settling, nextAt: nextAt === Infinity ? null : nextAt }
}

export {
  advanceStableIssues,
  assessJobReport,
  canAutoRetry,
  compareIssues,
  conditionLabels,
  defaultRetryPolicy,
  displayJobState,
  getMutationAvailability,
  healthOf,
  isJobActive,
  isRegisteredOnServer,
  jobProgressRatio,
  jobStateLabels,
  mergeJobUpdates,
  normalizeJobCounts,
  normalizeJobProgress,
  normalizeJobState,
  normalizeRetryPolicy,
  overallHealth,
  retryPolicyLimits,
  placementOf,
  retryDelay,
  severityOrder,
  summarizeIssues,
}
export type {
  ConnectivityConfirmation,
  ConnectivityStatus,
  FailureKind,
  ImpactScope,
  IssuePlacement,
  JobCounts,
  JobProgress,
  JobReportProblem,
  JobSnapshot,
  JobState,
  MutationBlockReason,
  MutationStatus,
  OfflineEntryMode,
  OfflineReason,
  OfflineSyncState,
  OperationKind,
  RetryPolicy,
  ServiceHealth,
  ServiceStatusReport,
  StableIssueEntry,
  StableIssuesState,
  SystemCondition,
  SystemIssue,
}
