// Data Analysis の検証画面の模擬のサーバー。応答の時間、取得の失敗、権限、リアルタイムの更新を設定できる。
// 集計そのものは subscriptions.ts と operations.ts の関数で行い、ここでは通信の振る舞いだけを模擬する。
// 検品は window.__fdAnalysisServer で設定する。Registry には含めない。

export type AnalysisRequestKind =
  | "overview"
  | "trend"
  | "bridge"
  | "profit"
  | "comparison"
  | "retention"
  | "breakdown"
  | "accounts"
  | "account"
  | "ops-status"
  | "ops-alerts"
  | "ops-transfers"

/** network：通信の失敗（再試行で解決しうる）。forbidden：権限がない（再試行で解決しない） */
export class AnalysisRequestError extends Error {
  constructor(
    message: string,
    public kind: "network" | "forbidden"
  ) {
    super(message)
  }
}

export const analysisServer = {
  /** 種類ごとの応答の時間（ms）。指定のない種類は default */
  latency: { default: 350 } as Record<string, number>,
  /** 次の 1 回だけ失敗させる */
  failNext: {} as Record<string, boolean>,
  /** 常に失敗させる（「再試行」を押しても失敗し続ける） */
  alwaysFail: {} as Record<string, boolean>,
  /** manager：すべての明細を閲覧できる。staff：閲覧の権限が限られた取引先の明細と、企業の詳細を閲覧できない */
  role: "manager" as "manager" | "staff",
  /** 予測のデータを返すか。false の場合は予測を返さない（画面は未来を補完しない） */
  forecast: true,
  /** 受け付けた要求の記録（検品用） */
  requests: [] as { kind: string; key: string }[],
  /** 運用の監視のリアルタイムの更新 */
  realtime: { paused: false, intervalMs: 5000 },
}

declare global {
  interface Window {
    __fdAnalysisServer?: typeof analysisServer
  }
}

if (typeof window !== "undefined") window.__fdAnalysisServer = analysisServer

/**
 * 模擬の要求。compute は要求を受け付けた時点で実行する（集計の時点を要求ごとに固定する）。
 * 中止（signal）された場合は、応答を返さずに AbortError で終える。
 */
export function request<T>(kind: AnalysisRequestKind, key: string, compute: () => T, { signal }: { signal?: AbortSignal } = {}): Promise<T> {
  analysisServer.requests.push({ kind, key })
  const fail = analysisServer.alwaysFail[kind] || analysisServer.failNext[kind]
  analysisServer.failNext[kind] = false
  const latency = analysisServer.latency[kind] ?? analysisServer.latency.default
  return new Promise<T>((resolve, reject) => {
    let result: T
    try {
      result = compute()
    } catch (e) {
      reject(e)
      return
    }
    const timer = setTimeout(() => {
      if (fail) reject(new AnalysisRequestError("集計のサーバーが応答しませんでした", "network"))
      else resolve(result)
    }, latency)
    signal?.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("aborted", "AbortError"))
    })
  })
}
