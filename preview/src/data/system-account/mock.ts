// System & Account のプレビューの模擬の通信。Registry には含めない。
// 実際の認証、認可、メール送信、通知の配信、障害の監視は行わない。
//
// 結果の種類
// - success：処理が完了し、応答が届いた
// - fail：処理されなかったことが確かな失敗（サーバーが拒否した、要求が届かなかった）
// - unknown：応答が届かなかった。サーバーでは処理が完了している場合がある（通信の切断、タイムアウト）
//   run は実行する（サーバーでは処理された）が、呼び出し側には MockUnknownError を返す
//
// ignoreAbort を true にすると、AbortSignal に従わず、中止された後も応答を返す（古い応答の破棄の検品）。

export type MockOutcome = "success" | "fail" | "unknown"

/** 処理されなかったことが確かな失敗 */
export class MockRequestError extends Error {
  readonly outcome = "failed" as const
  constructor(
    message: string,
    /** 失敗の種類。製品が利用者に示す文を選ぶために使う */
    readonly code: string = "failed"
  ) {
    super(message)
  }
}

/** 結果が不明な失敗（処理された可能性がある） */
export class MockUnknownError extends Error {
  readonly outcome = "unknown" as const
  constructor(message = "応答を受け取れませんでした。処理が完了しているかを確認してください。") {
    super(message)
  }
}

export function mockRequest<T>({
  latency,
  outcome = "success",
  signal,
  ignoreAbort = false,
  run,
  failMessage = "処理できませんでした",
  failCode,
}: {
  latency: number
  outcome?: MockOutcome
  signal?: AbortSignal
  ignoreAbort?: boolean
  /** サーバーでの処理。success と unknown では実行する */
  run: () => T
  failMessage?: string
  failCode?: string
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (outcome === "fail") {
        reject(new MockRequestError(failMessage, failCode))
        return
      }
      let value: T
      try {
        value = run()
      } catch (error) {
        reject(error)
        return
      }
      if (outcome === "unknown") reject(new MockUnknownError())
      else resolve(value)
    }, latency)
    if (signal && !ignoreAbort) {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException("aborted", "AbortError"))
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener("abort", onAbort, { once: true })
    }
  })
}

export const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError"
