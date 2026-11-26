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
// - 権限の変更を知らせる値（revision）が変わったら、取得し直す。取得し直す間は前の権限を表示に使い（refreshing）、
//   取得し直しに失敗した場合も、同じスコープの前の権限を表示に使う（stale）。どちらも操作は許可しない。
//
// この部品が持たないもの（製品の責務）
// - 実際の認可と、権限の取得の API。
// - 権限の変更の検知（通知、定期的な確認）、セッションの管理、権限のキャッシュ。

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
}): AccessSnapshot<P, F, G> & { scopeKey: string; reload: () => void } {
  const data = useBrowseData<string | number, G>({
    query: revision,
    queryKey: String(revision),
    scopeKey,
    enabled,
    // 権限の変更を知らせる値が変わった間は、前の権限を表示に使う（操作は許可しない）。
    keepPreviousData: true,
    fetcher: async (_revision, { signal }) => {
      const grants = await fetcher({ scopeKey, signal })
      if (grants.scope !== scopeKey) throw new AccessScopeMismatchError(scopeKey, grants.scope)
      return grants
    },
  })
  const { reload } = data
  return React.useMemo((): AccessSnapshot<P, F, G> & { scopeKey: string; reload: () => void } => {
    const base = { scopeKey, reload }
    // 前のスコープの値は、useBrowseData が同じ描画から返さない。念のため、スコープも照合する。
    const grants = data.data && data.data.scope === scopeKey ? data.data : null
    if (!grants || data.status === "loading" || data.status === "idle") {
      if (data.status === "error") return { ...base, status: "error", grants: null, error: data.error }
      return { ...base, status: "loading", grants: null, error: null }
    }
    // 権限の変更の知らせ（revision）の後の取得に失敗した：useBrowseData は条件（revision）が変わった後の失敗を error にするが、
    // 同じスコープの前の権限があるため、表示には前の権限を使い、操作は許可しない（stale）。ページを置き換えない。
    if (data.status === "error") return { ...base, status: "stale", grants, error: data.error }
    if (data.status === "refreshing") return { ...base, status: "refreshing", grants, error: null }
    if (data.refreshFailed) return { ...base, status: "stale", grants, error: data.error }
    return { ...base, status: "ready", grants, error: null }
  }, [scopeKey, reload, data.data, data.status, data.error, data.refreshFailed])
}

export { decideAccess, diffPermissions, pageAccessFromStatus, presentAction, resolveContentAccess, restrictionText } from "./access-decision"
export type {
  AccessDecision,
  AccessGrants,
  AccessRequirement,
  AccessSnapshot,
  ActionAudience,
  ActionPresentation,
  ContentAccess,
  PageAccessKind,
  Restriction,
  RestrictionKind,
} from "./access-decision"
export { AccessScopeMismatchError, useAccess }
