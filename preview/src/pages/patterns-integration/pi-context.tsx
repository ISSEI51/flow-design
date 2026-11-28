import { createContext, useContext, type MutableRefObject, type ReactNode } from "react"

import type { AccessResult } from "@/patterns/access"
import { decideAccess, presentAction, resolveContentAccess, restrictionText, type ActionPresentation } from "@/patterns/access-decision"
import { AccessState } from "@/patterns/access-state"
import { getMutationAvailability, type ConnectivityStatus, type ServiceHealth } from "@/patterns/system-status"

import type { PiUser } from "../../data/patterns-integration/model"
import type { CustomerValues, Permission } from "../../data/patterns-integration/server"
import type { PiNav } from "./pi-router"

// 横断の検証画面の共有の状態（製品側のコード）。SignedInApp が値を作り、各画面が読む。
// - scope：画面と操作の境界（利用者とワークスペース）。権限の再確認や、関係のない権限の変更では変えない
//   （入力中のフォーム、実行中の一括操作と結果を作り直さない）。
// - dataScope：取得したデータの境界。scope に閲覧の権限の有無を加える（閲覧の権限を失ったら、取得したデータを破棄する）。
//   編集の権限の喪失は、編集のフォームの key（pi-customer.tsx）で扱う。
// - access：useAccess の結果。保護された内容は resolveContentAccess（whileUnverified: "hide"）で、確認中は描画しない。
// - permit：操作の可否。権限（decideAccess）と接続・障害（getMutationAvailability）を合わせて判断し、理由の文を返す。

export type PiGrants = { scope: string; permissions: Permission[]; features: never[] }

/** 再認証の後に復元を検討する入力（メモリだけ） */
/** values：期限切れの時点の入力。submitted：結果を確かめていない保存で送った値（照会に使う。なければ null） */
export type PiDraft = { userId: string; ws: string; id: string; values: CustomerValues; submitted: CustomerValues | null; version: number; unconfirmed: boolean }

export type Permit = { allowed: boolean; reason: string | null; presentation: ActionPresentation<Permission, never> }

export type PiContextValue = {
  user: PiUser
  ws: string
  scope: string
  dataScope: string
  nav: PiNav
  access: AccessResult<Permission, never, PiGrants>
  /** 閲覧の可否。pending は権限の確認中（保護された内容を描画しない） */
  viewAccess: "allowed" | "pending" | "denied"
  connectivity: ConnectivityStatus
  health: (component: "analysis" | "export" | "notifications" | "customers") => ServiceHealth
  permit: (permission: Permission, component?: "analysis" | "export" | "notifications" | "customers") => Permit
  /** 操作の直前に、最新の権限（access.latest()）で確かめる */
  permitLatest: (permission: Permission) => boolean
  /** 編集中のフォームが、セッションの期限切れのときに入力を渡すための登録先 */
  draftSource: MutableRefObject<null | (() => PiDraft | null)>
  /** 再認証の後に復元すると決めた入力。描画の中では読むだけにし（peek）、commit の後に使い終えたことを知らせる（consume） */
  peekRestoredDraft: (ws: string, id: string) => PiDraft | null
  consumeRestoredDraft: (draft: PiDraft) => void
  reportReachable: () => void
  reportFailure: () => void
  outageSeq: number
}

const Ctx = createContext<PiContextValue | null>(null)
export const PiProvider = Ctx.Provider
export function usePi() {
  const v = useContext(Ctx)
  if (!v) throw new Error("usePi は SignedInApp の中で使う")
  return v
}

const permissionLabel: Record<Permission, string> = { view: "顧客の閲覧", edit: "顧客の編集", delete: "顧客の削除", export: "顧客のエクスポート" }
const connectivityOf = (s: ConnectivityStatus) => (s === "online" ? "online" : s === "offline" ? "offline" : "unconfirmed")

const mutationText = {
  offline: "オフラインのため利用できません。接続が戻ると利用できます",
  connecting: "接続を確認しています。確認できるまで、この操作は行えません",
  unconfirmed: "接続を確認しています。確認できるまで、この操作は行えません",
  outage: "障害のため、この機能は一時的に利用できません",
  maintenance: "メンテナンス中のため、この機能は一時的に利用できません",
} as const

export function makePermit(access: AccessResult<Permission, never, PiGrants>, connectivity: ConnectivityStatus, health: ServiceHealth) {
  return (permission: Permission): Permit => {
    const decision = decideAccess(access, { permissions: [permission] })
    const presentation = presentAction(decision, { relevance: "task" })
    if (!decision.allowed) return { allowed: false, reason: restrictionText(decision.reason, { permission: (p) => permissionLabel[p] }), presentation }
    // 閲覧は接続の状態で止めない（取得済みの内容は表示できる）。変更の操作は、接続と障害で止める
    if (permission === "view") return { allowed: true, reason: null, presentation }
    const m = getMutationAvailability({ connectivity: connectivity, health })
    if (!m.allowed) {
      const reason = { kind: connectivityOf(connectivity) === "online" ? "service" : "connectivity" } as const
      return { allowed: false, reason: mutationText[m.reason], presentation: { mode: "disabled", reason } as ActionPresentation<Permission, never> }
    }
    return { allowed: true, reason: null, presentation }
  }
}

export function contentAccessOf(access: AccessResult<Permission, never, PiGrants>): PiContextValue["viewAccess"] {
  const content = resolveContentAccess(access, { view: ["view"], edit: ["edit"], sensitivity: "protected", whileUnverified: "hide" })
  return content.mode === "pending" ? "pending" : content.mode === "hidden" ? "denied" : "allowed"
}

/**
 * 保護された内容。権限の確認中（再確認を含む）は描画しない（重ねて隠すのではなく、描画しない）。
 * 閲覧の権限がなければ、内容の代わりに権限がないことを示す。
 */
export function ProtectedContent({ label, children }: { label: string; children: ReactNode }) {
  const { viewAccess, access } = usePi()
  if (viewAccess === "pending")
    return (
      <p role="status" className="text-ui text-muted-foreground" data-testid="access-pending">
        {access.status === "stale" || access.status === "error" ? "最新の権限を確認できませんでした。確認できるまで、" : "最新の権限を確認しています。確認できるまで、"}
        {label}は表示しません。
      </p>
    )
  if (viewAccess === "denied") return <AccessState kind="forbidden" headingLevel={2} data-testid="access-denied" />
  return <>{children}</>
}
