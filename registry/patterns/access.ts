"use client"

import * as React from "react"

import { useBrowseData } from "./browse-data"
import type { AccessGrants, AccessSnapshot } from "./access-decision"

// Flow Design Access（Patterns / System & Account / Permission States）
// 利用者の権限（認可）と契約プランの機能（Entitlement）を、現在のスコープについて取得する hook。
// 定義は docs/web/patterns/permission-states.md を参照。
// 判断の純粋な関数と型は access-decision.ts にある（"use client" なし、React を使わない）。既存の import を壊さないよう、
// このファイルから再 export する。Server Components から判断の関数を呼ぶ場合は access-decision.ts から import する。
//
// この部品が守ること
// - スコープ（アカウント、ワークスペース、認可の範囲）が変わったら、同じ描画から前のスコープの権限を返さない。
//   A → B → A と戻った場合、AbortSignal に従わない取得の処理、アンマウントの後の応答でも、古い権限を反映しない
//   （useBrowseData の scopeKey と要求ごとの番号）。応答のスコープが要求したスコープと一致しない場合は、取得の失敗とする。
// - 権限の変更を知らせる値（revision）が変わったら、取得し直す。revision が変わった描画から（取得し直しの効果が走る前を含む）、
//   status を refreshing にし、verified を false にする。取得し直しに失敗した場合は stale にする。どちらも操作は許可しない。
//   useBrowseData の状態だけに頼らず、取得済みの権限の条件（revision と reload の回数）が描画の条件と一致する場合だけ ready にする。
// - reload も同じ：呼んだ描画から refreshing にする。latest() は、reload を呼んだ直後（同じイベントの処理の中）から、
//   取得し直すまで確認済みの権限を返さない。
// - latest() は、画面に反映した（commit した）最後の状態を返す。照合には commit の時点の値（layout effect で記録した値）と、
//   reload の回数（イベントの処理の中で同期的に増やす値）だけを使う。描画の中で ref を書き換えない
//   （Concurrent Rendering で中断・破棄された描画、Transition で Suspend した描画の条件で、表示中のスコープの操作を止めない）。
//   await の後、Dialog の確定、Toast や通知からの操作の開始の直前に、decideAccess(access.latest(), …) で判断し直すために使う。
//   新しい条件（スコープ、revision、enabled）は、commit した時点から反映する（commit の前は、表示中の条件の権限を返す）。
//   権限の変更を検知した処理の中で、commit を待たずに操作を止める場合は reload() を呼ぶ。
//
// この部品が持たないもの（製品の責務）
// - 実際の認可と、権限の取得の API。サーバーは、要求ごとに受け付けた時点の権限で認可する（この hook の判断は表示と操作の開始の制御）。
// - 権限の変更の検知（通知、定期的な確認）、セッションの管理、権限のキャッシュ。製品が変更を検知してから revision を
//   変えるまでの間は、この hook は変更を知らない（その間の操作は、サーバーの認可が拒否する）。検知した処理の中で reload() を
//   呼ぶと、latest() はその時点から確認済みの権限を返さない。

// ---------------------------------------------------------------- 取得の hook

/** 応答のスコープが、要求したスコープと一致しない */
class AccessScopeMismatchError extends Error {
  constructor(
    readonly requested: string,
    readonly received: string,
  ) {
    super("権限の応答のスコープが、要求したスコープと一致しません")
  }
}

/** useAccess の戻り値 */
type AccessResult<P extends string = string, F extends string = string, G extends AccessGrants<P, F> = AccessGrants<P, F>> = AccessSnapshot<P, F, G> & {
  /** この描画のスコープ */
  scopeKey: string
  /** 最新の認可を確認済みか（status が ready のときだけ true。useAccess は常に値を入れる） */
  verified: boolean
  /** 取得し直す。呼んだ時点から、取得し直すまで確認済みの権限として扱わない */
  reload: () => void
  /**
   * 画面に反映した（commit した）最後の状態。reload の後で取得し直していない場合と、アンマウントの後は、
   * 確認済みの権限として返さない（refreshing か loading）。新しい条件（スコープ、revision、enabled）は commit した時点から反映する。
   * イベントの処理と useEffect の中で呼ぶ（描画の中では呼ばない）
   */
  latest: () => AccessSnapshot<P, F, G>
}

type Committed<P extends string, F extends string, G extends AccessGrants<P, F>> = { reloads: number; snapshot: AccessSnapshot<P, F, G> }

const unresolved = { status: "loading", grants: null, error: null, verified: false } as const

/**
 * 現在のスコープの権限を取得する。
 * scopeKey：アカウント、ワークスペース、認可の範囲を 1 つの文字列にしたもの（例：`${userId}:${workspaceId}`）。
 * revision：権限の変更を知らせる値（サーバーからの通知、定期的な確認で製品が更新する）。変わったら取得し直す。
 * fetcher：権限を取得する処理。応答の grants.scope は scopeKey と一致すること。
 */
function useAccess<P extends string, F extends string, G extends AccessGrants<P, F> = AccessGrants<P, F>>({
  scopeKey,
  fetcher,
  revision = 0,
  enabled = true,
}: {
  scopeKey: string
  /** 権限を取得する処理。応答に製品の値（ロールの名前など）を含めてよい（G） */
  fetcher: (context: { scopeKey: string; signal: AbortSignal }) => Promise<G>
  revision?: string | number
  enabled?: boolean
}): AccessResult<P, F, G> {
  // 取得の条件：revision と reload の回数。reload も条件を変えるため、呼んだ描画から refreshing になる
  // （useBrowseData の reload は、効果が走るまでの描画で前の状態（ready）を返すため使わない）。
  const [reloads, setReloads] = React.useState(0)
  const requestKey = JSON.stringify([revision, reloads])
  const data = useBrowseData<string | number, G>({
    query: revision,
    queryKey: requestKey,
    scopeKey,
    enabled,
    // 権限の変更を知らせる値が変わった間は、前の権限を保持する（表示に使うかは製品のポリシー。操作は許可しない）。
    keepPreviousData: true,
    fetcher: async (_revision, { signal }) => {
      const grants = await fetcher({ scopeKey, signal })
      if (grants.scope !== scopeKey) throw new AccessScopeMismatchError(scopeKey, grants.scope)
      return grants
    },
  })

  // reload の要求の回数。イベントの処理の中で同期的に増やし、latest() がその時点から確認済みとして扱わないようにする。
  const requestedReloads = React.useRef(0)
  const reload = React.useCallback(() => {
    requestedReloads.current++
    setReloads((n) => n + 1)
  }, [])

  const snapshot = React.useMemo((): AccessSnapshot<P, F, G> => {
    // 前のスコープの値は、useBrowseData が同じ描画から返さない。念のため、スコープも照合する。
    const grants = data.data && data.data.scope === scopeKey ? data.data : null
    if (!grants || data.status === "loading" || data.status === "idle") {
      if (data.status === "error") return { status: "error", grants: null, error: data.error, verified: false }
      return unresolved
    }
    // 条件（revision、reload）が変わった後の取得に失敗した：useBrowseData は error にするが、同じスコープの前の権限があるため、
    // stale とし、ページを置き換えない。操作は許可しない。
    if (data.status === "error") return { status: "stale", grants, error: data.error, verified: false }
    if (data.status === "refreshing") return { status: "refreshing", grants, error: null, verified: false }
    if (data.refreshFailed) return { status: "stale", grants, error: data.error, verified: false }
    // 取得済みの権限の条件が、この描画の条件と一致する場合だけ確認済みとする（useBrowseData の実装に依存しない照合）。
    if (data.dataKey !== requestKey || !data.canOperate) return { status: "refreshing", grants, error: null, verified: false }
    return { status: "ready", grants, error: null, verified: true }
  }, [scopeKey, requestKey, data.data, data.dataKey, data.status, data.error, data.refreshFailed, data.canOperate])

  // commit した状態。latest() は commit した状態だけを返す（描画の中では ref を書き換えない）。
  // snapshot は条件（スコープ、revision、reload、enabled）が変わると別の値になるため、条件の変更の commit で記録し直す。
  const committed = React.useRef<Committed<P, F, G>>({ reloads: -1, snapshot: unresolved })
  const mounted = React.useRef(false)
  React.useLayoutEffect(() => {
    committed.current = { reloads, snapshot }
  }, [reloads, snapshot])
  React.useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const latest = React.useCallback((): AccessSnapshot<P, F, G> => {
    const c = committed.current
    const current = mounted.current && c.reloads >= requestedReloads.current
    if (current) return c.snapshot
    // reload の後の条件が commit されていない：確認済みとして扱わない。
    if (!mounted.current || !c.snapshot.grants) return unresolved
    return c.snapshot.status === "stale" ? c.snapshot : { status: "refreshing", grants: c.snapshot.grants, error: null, verified: false }
  }, [])

  return React.useMemo(
    // verified は ready のときだけ true（snapshot の各状態で値を入れている）。
    () => ({ ...snapshot, verified: snapshot.verified === true, scopeKey, reload, latest }) as AccessResult<P, F, G>,
    [snapshot, scopeKey, reload, latest],
  )
}

export {
  decideAccess,
  diffPermissions,
  isAccessVerified,
  pageAccessFromStatus,
  presentAction,
  resolveContentAccess,
  restrictionText,
  unverifiedStatus,
} from "./access-decision"
export type {
  AccessDecision,
  AccessGrants,
  AccessRequirement,
  AccessSnapshot,
  ActionAudience,
  ActionPresentation,
  ContentAccess,
  ContentSensitivity,
  PageAccessKind,
  Restriction,
  RestrictionKind,
  UnverifiedContentPolicy,
} from "./access-decision"
export { AccessScopeMismatchError, useAccess }
export type { AccessResult }
