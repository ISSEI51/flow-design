"use client"

import * as React from "react"

// Flow Design Scope Guard（Patterns / System & Account）
// 非同期の処理（保存、既読の更新、権限の申請、再認証の後の確認、購読など）について、
// (1) 古い画面や Toast から、古いスコープの操作を始めない（開始の防止）
// (2) 始めた処理の結果を、開始したときのスコープと、そのキーの最新の要求にだけ反映する（古い応答の無効化）
// の 2 つを行う hook。定義は docs/web/patterns/system-and-account.md の「共通の状態管理と安全性」を参照。
// Data Browsing の useBrowseData（取得）と同じ規則を、取得以外の処理に使えるようにする。
//
// scopeKey と世代の違い
// - scopeKey は、アカウント、ワークスペース、認可の範囲を表す値。A → B → A と戻ると、同じ値になる。
// - 世代（generation）は、スコープの変更が画面に反映される（commit）たびに増える番号。A → B → A の最初の A と、
//   最後の A は、同じ scopeKey でも別の世代になる。この部品は scopeKey と世代の両方で照合する。
//
// この部品が守ること
// - スコープが変わったら、前の世代の処理の結果を反映しない。A → B → A と戻っても、最初の A の結果を反映しない。
// - 描画の中の照合（isSameScope など）は、その描画のスコープで行う。新しいスコープの最初の描画から、
//   前のスコープの状態を表示しない（効果が走る前も含む）。hook が返す値は、スコープごとに別のオブジェクトになり、
//   その描画のスコープを持つ（描画の中で ref を書き換えない）。
// - 描画の途中では、世代を進めない、AbortController を中止しない（破棄された描画、StrictMode の 2 回目の描画、
//   Concurrent Rendering で中断された描画が、画面に表示されているスコープの有効な処理を中止しないため）。
//   世代の更新と中止は、スコープの変更の commit の時点（layout effect）で行う。
// - 非同期の結果の照合は、commit されたスコープと世代で行う。新しいスコープの描画が始まってから commit されるまでの間に
//   届いた結果は、まだ画面に表示している前のスコープの結果として扱う（製品の状態は、スコープごとに持つか、
//   描画の中で isSameScope で照合する。新しいスコープの描画では、その結果を表示しない）。
// - 同じキー（設定の項目、通知の ID など）の処理は、最後に始めたものだけを最新とする。
// - 古い画面で取得した Snapshot（capture）からの開始（beginIfCurrent）は、スコープと世代が現在と一致しない場合に
//   始めない（null を返す）。始めない操作は、現在の処理の番号を変えない（現在の処理を無効にしない）。
// - アンマウントの後に届いた結果を反映しない。アンマウントの後は処理を始めない。
// - AbortSignal に従わない処理の結果も反映しない（signal はクライアントの待機の中止であり、サーバーでの処理の取り消しではない）。
// - 別の hook のインスタンスで作った Ticket と Snapshot を受け付けない。
// - 処理のキーの記録は、release で消せる。スコープの変更とアンマウントで、すべて消す（長時間の利用で増え続けない）。
//
// この部品が持たないもの（製品の責務）
// - 処理そのもの（API の呼び出し）、冪等性、サーバーでの取り消し、サーバーでの処理の順序（直列化、バージョン番号）。
// - 実際の認可（開始の時点でスコープが現在のものでも、サーバーは要求ごとに認可を確かめる）。
// - 結果が不明な処理の確認（製品が再取得や照会で確かめる）。
//
// 呼び出す場所
// - begin、beginIfCurrent、capture は、イベントの処理と useEffect の中で呼ぶ（描画の中では呼ばない）。
//   子の useLayoutEffect の中で呼ぶと、親の hook の commit の処理より前に呼ばれるため、無効な Ticket になる場合がある。
// - isLatest、isSameScope、isCurrent は、描画の中でも呼べる（前のスコープの状態を表示しないための照合）。
//   描画の中では、その描画で hook が返した値を使う。

/** 開始した処理。開始したときのスコープ、世代、キーを固定する */
type ScopeTicket = {
  /** 開始したときのスコープ */
  readonly scope: string | undefined
  /** 開始したときのスコープの世代 */
  readonly generation: number
  /** 処理のキー */
  readonly key: string
  /** 処理の番号（この hook のインスタンスの中で増え続ける） */
  readonly seq: number
  /** スコープの変更とアンマウントで中止する。サーバーでの処理の取り消しを保証しない */
  readonly signal: AbortSignal
}

/** 画面や Toast を作ったときのスコープと世代。後から操作を始めるときに、現在と一致するかを照合する */
type ScopeSnapshot = {
  readonly scope: string | undefined
  readonly generation: number
}

type ScopeGuard = {
  /** この値を返した描画のスコープ */
  readonly scope: string | undefined
  /**
   * 現在のスコープで処理を始める。同じキーの前の処理は最新ではなくなる（中止はしない。保存の要求を中止しても、
   * サーバーで処理されることがあるため）。アンマウントの後に呼ぶと、最初から無効な Ticket を返す。
   */
  begin: (key?: string) => ScopeTicket
  /**
   * capture で取得したスコープと世代が現在と一致する場合だけ処理を始める。一致しない場合は null を返し、
   * 同じキーの現在の処理を無効にしない（古い画面、古い Toast、古い通知からの操作を始めない）。
   */
  beginIfCurrent: (snapshot: ScopeSnapshot, key?: string) => ScopeTicket | null
  /** 現在のスコープと世代を取得する（画面や Toast を作るときに保存する） */
  capture: () => ScopeSnapshot
  /** Snapshot または Ticket が、現在のスコープと世代のものか（アンマウントの後は false） */
  isCurrent: (snapshot: ScopeSnapshot | ScopeTicket) => boolean
  /** 処理が、現在のスコープの、そのキーの最新の処理か（アンマウントの後は false） */
  isLatest: (ticket: ScopeTicket) => boolean
  /** 処理が、現在のスコープで始めたものか（同じキーの新しい処理があっても true） */
  isSameScope: (ticket: ScopeTicket) => boolean
  /** 処理が終わったことを記録する。そのキーの最新の処理の場合だけ、キーの記録を消す（ほかの処理には影響しない） */
  release: (ticket: ScopeTicket) => void
}

// Ticket と Snapshot を作った hook のインスタンス。別のインスタンスのものを受け付けない。
const owners = new WeakMap<object, object>()
// hook が返した値を、それが commit された時点の世代に結び付ける関数。A → B → A の最初の A の値（古い closure）を、
// scopeKey が同じでも、最後の A の値と区別するため。
const binders = new WeakMap<object, (generation: number) => void>()

function useScopeGuard(scopeKey: string | undefined): ScopeGuard {
  // commit されたスコープと、その世代。layout effect でだけ更新する（描画の中では読むだけ）。
  const committedRef = React.useRef<{ scope: string | undefined; generation: number }>({ scope: scopeKey, generation: 0 })
  const mountedRef = React.useRef(false)
  const seqRef = React.useRef(0)
  const latestRef = React.useRef(new Map<string, number>())
  const controllerRef = React.useRef<AbortController | null>(null)
  const ownerRef = React.useRef<object>({})

  // スコープの変更の commit：世代を進め、前のスコープの待機を中止し、キーの記録を消す。
  React.useLayoutEffect(() => {
    if (committedRef.current.scope === scopeKey) return
    committedRef.current = { scope: scopeKey, generation: committedRef.current.generation + 1 }
    latestRef.current = new Map()
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [scopeKey])

  // マウントとアンマウント。StrictMode の仮のアンマウントでも世代を進める（その前に始めた処理の結果を反映しない）。
  React.useLayoutEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      committedRef.current = { scope: committedRef.current.scope, generation: committedRef.current.generation + 1 }
      latestRef.current = new Map()
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  const guard = React.useMemo<ScopeGuard>(() => {
    // この値が commit された世代（commit の前と、別の世代の値は null か、現在と異なる番号）
    let bound: number | null = null
    const isBoundToCurrent = () => bound !== null && bound === committedRef.current.generation
    const owned = (value: object) => owners.get(value) === ownerRef.current
    const isCurrent = (snapshot: ScopeSnapshot | ScopeTicket) =>
      owned(snapshot) &&
      mountedRef.current &&
      // 古い値（前のスコープ、A → B → A の最初の A の描画で返した値）からの照合は、現在のものと認めない
      isBoundToCurrent() &&
      snapshot.generation === committedRef.current.generation &&
      snapshot.scope === committedRef.current.scope &&
      // この値を返した描画のスコープと一致する場合だけ（新しいスコープの描画の中では、commit の前でも前のスコープのものとして扱う）
      snapshot.scope === scopeKey
    const start = (key: string): ScopeTicket => {
      const seq = ++seqRef.current
      // 有効な Ticket は、マウントの後に、現在のスコープの値（この値を返した描画のスコープが commit されたもの）から始めたものだけ。
      // 前のスコープの描画で返した値（古い画面や Toast の closure）から begin を呼んだ場合は、無効な Ticket にする。
      // A → B → A の最初の A の値も、最後の A とは別の世代に結び付いているため、無効な Ticket にする
      // （古い操作の開始そのものを止めるには、beginIfCurrent を使う）。
      const valid = mountedRef.current && committedRef.current.scope === scopeKey && isBoundToCurrent()
      let signal: AbortSignal
      if (valid) {
        if (!controllerRef.current) controllerRef.current = new AbortController()
        signal = controllerRef.current.signal
        latestRef.current.set(key, seq)
      } else {
        // アンマウントの後、SSR の描画の中、前のスコープの値から：最初から中止した、無効な Ticket
        const aborted = new AbortController()
        aborted.abort()
        signal = aborted.signal
      }
      // 無効な Ticket は、どの世代とも一致しない番号にする
      const generation = valid ? committedRef.current.generation : -1
      const ticket: ScopeTicket = { scope: scopeKey, generation, key, seq, signal }
      owners.set(ticket, ownerRef.current)
      return ticket
    }
    const value: ScopeGuard = {
      scope: scopeKey,
      begin: (key = "") => start(key),
      beginIfCurrent: (snapshot, key = "") => (isCurrent(snapshot) ? start(key) : null),
      capture: () => {
        // 古い値（別の世代に結び付いた値）からは、現在の世代の Snapshot を作らない
        const snapshot: ScopeSnapshot = {
          scope: scopeKey,
          generation: mountedRef.current && committedRef.current.scope === scopeKey && isBoundToCurrent() ? committedRef.current.generation : -1,
        }
        owners.set(snapshot, ownerRef.current)
        return snapshot
      },
      isCurrent,
      isSameScope: (ticket) => isCurrent(ticket),
      isLatest: (ticket) => isCurrent(ticket) && latestRef.current.get(ticket.key) === ticket.seq,
      release: (ticket) => {
        if (!owned(ticket) || ticket.generation !== committedRef.current.generation) return
        if (latestRef.current.get(ticket.key) === ticket.seq) latestRef.current.delete(ticket.key)
      },
    }
    binders.set(value, (generation) => {
      bound = generation
    })
    return value
    // スコープごとに別のオブジェクトにする（描画の中の照合に、その描画のスコープを使うため）
  }, [scopeKey])

  // 返す値を、commit された時点の世代に結び付ける（スコープの変更の commit とマウントの処理の後に実行する）。
  // StrictMode の仮のアンマウントの後の再実行でも、進んだ世代に結び付け直す。
  React.useLayoutEffect(() => {
    binders.get(guard)?.(committedRef.current.generation)
  }, [guard])

  return guard
}

export { useScopeGuard }
export type { ScopeGuard, ScopeSnapshot, ScopeTicket }
