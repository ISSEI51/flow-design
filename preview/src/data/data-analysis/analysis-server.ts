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
  /**
   * 一覧で、閲覧できない明細の件数を返すか。show：件数を返す（「4社は閲覧の権限がない取引先です」）。hide：一覧では件数を返さない。
   * 件数からも情報を推測できる場合があるため、公開するかは製品が決める。hide でも集計の指標は返すため、指標と一覧の件数の差から推測できる。
   * 集計値も隠す必要がある場合は、指標の公開の範囲を製品が別に決める（この模擬のサーバーでは扱わない）
   */
  hiddenCountPolicy: "show" as "show" | "hide",
  /** 集計のタイムゾーン。結果の意味が変わるため、取得の条件のキーに含める */
  timeZone: "Asia/Tokyo",
  /** 予測のデータを返すか。false の場合は予測を返さない（画面は未来を補完しない） */
  forecast: true,
  /** 受け付けた要求の記録（検品用）。scope は要求を送ったときのワークスペースと権限 */
  requests: [] as { kind: string; key: string; scope: string }[],
  /** 応答を返した記録（検品用）。中止された要求は含まない */
  responses: [] as { kind: string; key: string; scope: string }[],
  /** 中止（AbortSignal）を無視する API の再現。true なら、中止された要求も後から応答を返す */
  ignoreAbort: false,
  /** 運用の監視のリアルタイムの更新 */
  realtime: { paused: false, intervalMs: 5000 },
}

declare global {
  interface Window {
    __fdAnalysisServer?: typeof analysisServer
  }
}

if (typeof window !== "undefined") window.__fdAnalysisServer = analysisServer

/** ワークスペース（データのスコープ）。九州支店のワークスペースは、九州・沖縄の契約だけを持つ */
export const analysisWorkspaces = [
  { id: "hq", name: "本社（すべての地域）" },
  { id: "kyushu", name: "九州支店" },
] as const
export type AnalysisWorkspace = (typeof analysisWorkspaces)[number]["id"]

/**
 * 模擬の要求。compute は要求を受け付けた時点で実行する（集計の時点を要求ごとに固定する）。
 * 中止（signal）された場合は、応答を返さずに AbortError で終える。
 */
export function request<T>(kind: AnalysisRequestKind, key: string, compute: () => T, { signal, scope = "" }: { signal?: AbortSignal; scope?: string } = {}): Promise<T> {
  analysisServer.requests.push({ kind, key, scope })
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
      analysisServer.responses.push({ kind, key, scope })
      if (fail) reject(new AnalysisRequestError("集計のサーバーが応答しませんでした", "network"))
      else resolve(result)
    }, latency)
    signal?.addEventListener("abort", () => {
      // 中止を無視する API では、応答が後から届く（画面は、古い応答を反映しないことを確かめる）
      if (analysisServer.ignoreAbort) return
      clearTimeout(timer)
      reject(new DOMException("aborted", "AbortError"))
    })
  })
}
