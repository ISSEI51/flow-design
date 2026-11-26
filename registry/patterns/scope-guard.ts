"use client"

import * as React from "react"

// Flow Design Scope Guard（Patterns / System & Account）
// 非同期の処理（保存、既読の更新、権限の申請、再認証の後の確認など）の結果を、開始したときのスコープと
// 最新の要求にだけ反映するための hook。定義は docs/web/patterns/system-and-account.md の「共通の状態管理と安全性」を参照。
// Data Browsing の useBrowseData（取得）と同じ規則を、取得以外の処理に使えるようにする。
//
// この部品が守ること
// - スコープ（アカウント、ワークスペース、認可の範囲）が変わったら、世代を進める。A → B → A と戻っても、
//   最初の A で始めた処理の結果を反映しない（スコープの値ではなく世代で比べる）。
// - 同じキー（設定の項目、通知の ID など）の処理は、最後に始めたものだけを最新とする。古い応答で最新の値を上書きしない。
// - アンマウントの後に届いた結果を反映しない。
// - AbortSignal に従わない処理の結果も反映しない（signal はクライアントの待機の中止であり、サーバーでの処理の取り消しではない）。
//
// この部品が持たないもの（製品の責務）
// - 処理そのもの（API の呼び出し）、冪等性、サーバーでの取り消し、実際の認可。
// - 結果が不明な処理の確認（製品が再取得や照会で確かめる）。

type ScopeTicket = {
  /** 開始したときのスコープ */
  readonly scope: string | undefined
  /** 開始したときのスコープの世代 */
  readonly generation: number
  /** 処理のキー */
  readonly key: string
  /** キーごとの処理の番号 */
  readonly seq: number
  /** スコープの変更とアンマウントで中止する。サーバーでの処理の取り消しを保証しない */
  readonly signal: AbortSignal
}

type ScopeGuard = {
  /** 現在のスコープ */
  readonly scope: string | undefined
  /** 処理を始める。同じキーの前の処理は最新ではなくなる（中止はしない。保存の要求を中止しても、サーバーで処理されることがあるため） */
  begin: (key?: string) => ScopeTicket
  /** 処理が、現在のスコープの、そのキーの最新の処理か（アンマウントの後は false） */
  isLatest: (ticket: ScopeTicket) => boolean
  /** 処理が、現在のスコープで始めたものか（同じキーの新しい処理があっても true） */
  isSameScope: (ticket: ScopeTicket) => boolean
}

function useScopeGuard(scopeKey: string | undefined): ScopeGuard {
  const scopeRef = React.useRef(scopeKey)
  const generationRef = React.useRef(0)
  const mountedRef = React.useRef(true)
  const seqRef = React.useRef(new Map<string, number>())
  const controllerRef = React.useRef<AbortController | null>(null)

  // 描画の時点でスコープの変更を反映する。効果が走る前に届いた結果も、新しいスコープに反映しない。
  // StrictMode の 2 回目の描画では、同じ値のため世代を進めない。
  if (scopeRef.current !== scopeKey) {
    scopeRef.current = scopeKey
    generationRef.current++
    seqRef.current = new Map()
    controllerRef.current?.abort()
    controllerRef.current = null
  }

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current++
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  return React.useMemo<ScopeGuard>(
    () => ({
      get scope() {
        return scopeRef.current
      },
      begin: (key = "") => {
        if (!controllerRef.current) controllerRef.current = new AbortController()
        const seq = (seqRef.current.get(key) ?? 0) + 1
        seqRef.current.set(key, seq)
        return { scope: scopeRef.current, generation: generationRef.current, key, seq, signal: controllerRef.current.signal }
      },
      isSameScope: (ticket) => mountedRef.current && ticket.generation === generationRef.current,
      isLatest: (ticket) =>
        mountedRef.current && ticket.generation === generationRef.current && seqRef.current.get(ticket.key) === ticket.seq,
    }),
    []
  )
}

export { useScopeGuard }
export type { ScopeGuard, ScopeTicket }
