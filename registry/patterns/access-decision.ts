// Flow Design Access Decision（Patterns / System & Account / Permission States）
// 権限（認可）、契約プランの機能（Entitlement）、前提の設定、処理中、接続、サービスの状態から、操作を許可するか、
// 許可しない場合の理由、画面での扱い（表示・無効化・非表示・閲覧専用）を決める純粋な関数と型。
// 定義は docs/web/patterns/permission-states.md を参照。
// React と "@/..." を import しない（Server Components、サーバーの処理、ブラウザを使わない検品から呼べる）。
// 権限の取得の hook（useAccess）は access.ts にあり、このファイルの関数と型を再 export する。
//
// この部品が守ること
// - 利用を制限する理由を、認可、契約プラン、前提の設定の不足、処理中、接続、サービスの障害、権限の未確定に分けて返す
//   （Restriction の kind）。すべてを「権限がありません」にしない。
// - 権限の取得中、取得の失敗、再確認中、再確認の失敗、最新の認可を確認していない間（verified が false）は、
//   操作を許可しない（未確定の権限を許可として扱わない）。
// - 表示可能性（画面の構造を表示するか）、閲覧可能性（保護された情報を表示するか）、操作可能性（操作を始めてよいか）、
//   最新の認可を確認済みか（verified）を区別する。最新の認可を確認していない間に、保護された情報を表示し続けることを
//   既定にしない（resolveContentAccess の sensitivity と whileUnverified）。
// - すべてを機械的に非表示や無効にしない（業務との関係、存在を知らせてよいか、申請できるかで決める）。
// - 権限がない利用者に、契約プランの案内で機能の存在や解決の方法を示さない（契約プランと権限の両方が不足する場合）。
//
// この部品が持たないもの（製品の責務）
// - 実際の認可。UI の非表示と無効化は、バックエンドでの認可の代わりにならない。
// - ロールと権限の定義（RBAC、ABAC などの認可のモデル）。ロールの名前や権限の一覧を Registry で固定しない。
// - 操作ごとの性質の分類（業務の操作か管理の機能か、存在を知らせてよいか、申請できるか）。
// - 利用者に示す文の最終的な内容（restrictionText は既定の文であり、製品が置き換えられる）。

// ---------------------------------------------------------------- 型

/** 取得した権限と、契約プランで利用できる機能。P は権限の ID、F は機能の ID（製品のデータ） */
type AccessGrants<P extends string = string, F extends string = string> = {
  /** 応答が対象とするスコープ。要求したスコープと一致しない応答は使わない */
  scope: string
  permissions: readonly P[]
  features: readonly F[]
}

/**
 * 権限の取得の状態。
 * - loading：初回の取得中（スコープの変更の直後を含む）。grants はない
 * - error：取得に失敗した。grants はない
 * - refreshing：権限の変更の知らせを受けて取得し直している。grants は前の値（最新の認可ではない）
 * - stale：取得し直しに失敗した。grants は前の値（最新の認可ではない）
 * - ready：最新の取得に成功した
 *
 * verified：最新の認可を確認済みか。ready で verified が false の場合は、grants を確認済みの最新の認可として扱わない
 * （製品が、権限の変更の知らせを受けたが revision をまだ変えていない場合、サーバーで描画した権限をクライアントで
 * 確かめていない場合など）。decideAccess と resolveContentAccess は refreshing と同じに扱う。
 * 省略した ready は確認済みとして扱う（既存の呼び出しとの互換）。ready 以外は常に確認済みではない。
 */
type AccessSnapshot<P extends string = string, F extends string = string, G extends AccessGrants<P, F> = AccessGrants<P, F>> =
  | { status: "loading"; grants: null; error: null; verified?: false }
  | { status: "error"; grants: null; error: unknown; verified?: false }
  | { status: "refreshing"; grants: G; error: null; verified?: false }
  | { status: "stale"; grants: G; error: unknown; verified?: false }
  | { status: "ready"; grants: G; error: null; verified?: boolean }

/** 利用を制限する理由。原因ごとに別の状態として持つ */
type Restriction<P extends string = string, F extends string = string> =
  /** 権限が確定していない（取得中、取得の失敗、再確認中、再確認の失敗） */
  | { kind: "unresolved"; status: "loading" | "error" | "refreshing" | "stale" }
  /** 契約プランで利用できない機能。ロールの権限とは別。missing は、あわせて不足している権限（ない場合は空） */
  | { kind: "entitlement"; feature: F; missing: P[] }
  /** 必要な権限がない（認可） */
  | { kind: "authorization"; missing: P[] }
  /** 前提となる設定が済んでいない */
  | { kind: "prerequisite"; prerequisite: string }
  /** サービスや機能の障害、メンテナンス */
  | { kind: "service" }
  /** サービスに接続できない（オフライン）、または接続を確認していない（unconfirmed） */
  | { kind: "connectivity"; status?: "offline" | "unconfirmed" }
  /** 処理中（同じ対象の保存や処理の完了を待っている） */
  | { kind: "pending" }

type RestrictionKind = Restriction["kind"]

type AccessDecision<P extends string = string, F extends string = string> = { allowed: true; reason: null } | { allowed: false; reason: Restriction<P, F> }

/** 操作に必要な条件。製品が操作ごとに渡す */
type AccessRequirement<P extends string = string, F extends string = string> = {
  /** 必要な権限（すべて必要） */
  permissions?: readonly P[]
  /** 契約プランで利用できる必要がある機能 */
  feature?: F
  /** 済んでいない前提の設定の ID。済んでいる場合は null か省略 */
  unmetPrerequisite?: string | null
  /** 操作に関係するサービスの状態 */
  service?: "available" | "unavailable"
  /**
   * サービスとの接続。unconfirmed は、接続を確認していない（useConnectivity の unknown など）。
   * unconfirmed は offline と同じく操作を許可しない（確認していない接続を、確認済みとして扱わない）。
   */
  connectivity?: "online" | "offline" | "unconfirmed"
  /** 処理中（保存の完了を待っているなど） */
  pending?: boolean
}

// ---------------------------------------------------------------- 判断の関数（純粋）

const allowed: AccessDecision<never, never> = { allowed: true, reason: null }
const deny = <P extends string, F extends string>(reason: Restriction<P, F>): AccessDecision<P, F> => ({ allowed: false, reason })

/** 最新の認可を確認済みか（ready で、verified が false ではない） */
function isAccessVerified(snapshot: AccessSnapshot<string, string>): boolean {
  return snapshot.status === "ready" && snapshot.verified !== false
}

/**
 * 前の権限（grants）はあるが、最新の認可を確認していない状態の種類。確認済みの場合と grants がない場合は null。
 * stale は確認に失敗した場合、refreshing は確認中の場合（ready で verified が false の場合を含む）。
 */
function unverifiedStatus(snapshot: AccessSnapshot<string, string>): "refreshing" | "stale" | null {
  if (snapshot.status === "stale") return "stale"
  if (snapshot.status === "refreshing") return "refreshing"
  if (snapshot.status === "ready" && snapshot.verified === false) return "refreshing"
  return null
}

/**
 * 操作を許可するかと、許可しない理由を決める。
 * 判断の順序：権限の未確定 → 契約プラン → 認可 → （再確認中・再確認の失敗）→ 前提の設定 → サービスの障害 → 接続 → 処理中。
 * 契約プランを認可より先に判断する（権限を申請しても、契約プランで利用できなければ解決しないため）。
 * 一時的な理由（障害、接続、処理中）を構造的な理由（契約プラン、認可、前提の設定）より後にする
 * （オフラインと示した後、接続が戻っても権限がないために使えない、という誤解を避けるため）。
 */
function decideAccess<P extends string, F extends string>(snapshot: AccessSnapshot<P, F>, requirement: AccessRequirement<P, F> = {}): AccessDecision<P, F> {
  // 取得中と取得の失敗は、許可として扱わない。
  if (snapshot.status === "loading" || snapshot.status === "error") return deny({ kind: "unresolved", status: snapshot.status })
  const { grants } = snapshot
  const missing = (requirement.permissions ?? []).filter((p) => !grants.permissions.includes(p))
  if (requirement.feature !== undefined && !grants.features.includes(requirement.feature)) {
    return deny({ kind: "entitlement", feature: requirement.feature, missing })
  }
  if (missing.length > 0) return deny({ kind: "authorization", missing })
  // 前の権限では許可される場合も、最新の認可を確認するまで操作を許可しない（verified が false の ready を含む）。
  const unverified = unverifiedStatus(snapshot)
  if (unverified) return deny({ kind: "unresolved", status: unverified })
  if (requirement.unmetPrerequisite) return deny({ kind: "prerequisite", prerequisite: requirement.unmetPrerequisite })
  if (requirement.service === "unavailable") return deny({ kind: "service" })
  if (requirement.connectivity === "offline" || requirement.connectivity === "unconfirmed") {
    return deny({ kind: "connectivity", status: requirement.connectivity })
  }
  if (requirement.pending) return deny({ kind: "pending" })
  return allowed
}

/** 操作の画面での扱い */
type ActionPresentation<P extends string = string, F extends string = string> =
  | { mode: "enabled"; reason: null }
  /** 表示し、無効にして理由を示す */
  | { mode: "disabled"; reason: Restriction<P, F> }
  /** 表示しない */
  | { mode: "hidden"; reason: Restriction<P, F> }

/** 操作の性質。製品が操作ごとに決める */
type ActionAudience = {
  /**
   * task：利用者の業務に関係し、必要とする可能性がある操作（無効にして理由を示す）
   * admin：利用者の業務に関係のない管理の機能（権限がなければ表示しない）
   */
  relevance: "task" | "admin"
  /** confidential：存在を利用者に知らせてはならない機能（権限がなければ表示しない）。既定は public */
  disclosure?: "public" | "confidential"
  /** 権限を申請できる。admin の操作でも、申請できる場合は無効にして表示する */
  requestable?: boolean
}

/**
 * 操作を表示するか、無効にするか、表示しないかを決める。すべてを機械的に非表示や無効にしない。
 * - 許可される：enabled
 * - 権限の取得中・取得の失敗：業務の操作（task、public）は無効にして理由を示す。管理の機能と存在を知らせない機能は、
 *   確定するまで表示しない（表示した後に消すと、存在を知らせることになり、表示も揺れるため）
 * - 再確認中・再確認の失敗：前の権限で許可されていた操作のため、無効にする（表示は保つ）
 * - 契約プラン：存在を知らせない機能は表示しない。権限がある利用者には、管理の機能も無効にして理由を示す（その利用者の業務に関係するため）。
 *   権限もない場合は、認可と同じに扱う。ただし申請できる場合も、管理の機能は表示しない（申請しても契約プランで利用できないため）。
 *   理由の文（restrictionText）は、契約プランの案内を含めない
 * - 認可：存在を知らせない機能は表示しない。管理の機能は、申請できる場合を除いて表示しない。業務の操作は無効にする
 * - 前提の設定、障害、接続、処理中：権限はあるため、無効にして理由を示す
 */
function presentAction<P extends string, F extends string>(decision: AccessDecision<P, F>, audience: ActionAudience): ActionPresentation<P, F> {
  if (decision.allowed) return { mode: "enabled", reason: null }
  const reason = decision.reason
  const confidential = audience.disclosure === "confidential"
  switch (reason.kind) {
    case "unresolved":
      if (reason.status === "refreshing" || reason.status === "stale") return { mode: "disabled", reason }
      return audience.relevance === "task" && !confidential ? { mode: "disabled", reason } : { mode: "hidden", reason }
    case "entitlement":
      if (confidential) return { mode: "hidden", reason }
      if (reason.missing.length === 0) return { mode: "disabled", reason }
      return audience.relevance === "admin" ? { mode: "hidden", reason } : { mode: "disabled", reason }
    case "authorization":
      if (confidential) return { mode: "hidden", reason }
      if (audience.relevance === "admin" && !audience.requestable) return { mode: "hidden", reason }
      return { mode: "disabled", reason }
    default:
      return { mode: "disabled", reason }
  }
}

/** 内容（レコード、設定の項目）の扱い */
type ContentAccess<P extends string = string, F extends string = string> =
  /**
   * 内容を表示しない（権限を確認していることか、確認できなかったことを示す）。
   * loading と error は前の権限がない場合。refreshing と stale は、前の権限では閲覧できるが、最新の認可を確認していない
   * 保護された情報を、製品のポリシー（whileUnverified: "hide"）で表示しない場合
   */
  | { mode: "pending"; status: "loading" | "error" | "refreshing" | "stale" }
  /** 閲覧できない。存在を知らせてよい場合は理由を示し、そうでなければ領域ごと表示しない */
  | { mode: "hidden"; reason: Restriction<P, F> }
  /** 閲覧できるが変更できない。通常の文字で表示する（すべての Input を Disabled にしない） */
  | { mode: "read-only"; reason: Restriction<P, F> }
  | { mode: "edit"; reason: null }

/**
 * 内容の機密性。製品が内容ごとに指定する。
 * - public-structure：画面の構造（見出し、項目名、ナビゲーション、操作の配置）や、閲覧の権限を持つ人に共通の公開された情報。
 *   最新の認可を確認していない間も、前の権限で表示を決める（表示を揺らさない）
 * - protected：閲覧の権限で保護された情報（レコードの内容、メンバーの一覧、設定の値）。最新の認可を確認していない間の扱いは
 *   whileUnverified で決める
 */
type ContentSensitivity = "public-structure" | "protected"

/**
 * 最新の認可を確認していない間（refreshing、stale、verified が false の ready）に、保護された情報をどう扱うか（製品のポリシー）。
 * - hide：表示しない（mode: "pending"。既定）。入力中の値など、画面の状態は製品が保持してよい
 * - keep：前の権限で表示を続ける。権限を失っていた場合に、その間は失った権限で閲覧できた情報が表示される。製品が、
 *   その情報を表示し続けてよいと判断した場合にだけ指定する（例：自分が入力中の内容、閲覧の範囲が変わりにくい情報）
 * どちらでも、前の権限で閲覧できない内容は表示しない（hidden のまま。確認中に表示し始めない）。操作は decideAccess で判断し、
 * 確認が終わるまで許可しない。
 */
type UnverifiedContentPolicy = "keep" | "hide"

/**
 * 内容を編集できるか、閲覧専用か、表示しないかを決める。
 * 最新の認可を確認していない間は、sensitivity と whileUnverified で決める。既定（sensitivity: "protected"、whileUnverified: "hide"）では、
 * 前の権限で閲覧できる保護された情報を表示しない（pending）。保存などの操作は decideAccess で判断し、確認が終わるまで許可しない。
 */
function resolveContentAccess<P extends string, F extends string>(
  snapshot: AccessSnapshot<P, F>,
  {
    view = [],
    edit = [],
    feature,
    sensitivity = "protected",
    whileUnverified = "hide",
  }: {
    view?: readonly P[]
    edit?: readonly P[]
    feature?: F
    /** 内容の機密性。既定は protected */
    sensitivity?: ContentSensitivity
    /** 最新の認可を確認していない間の、保護された情報の扱い。既定は hide。sensitivity が public-structure の場合は使わない */
    whileUnverified?: UnverifiedContentPolicy
  },
): ContentAccess<P, F> {
  if (snapshot.status === "loading" || snapshot.status === "error") return { mode: "pending", status: snapshot.status }
  const settled = { status: "ready", grants: snapshot.grants, error: null } as const
  const viewDecision = decideAccess(settled, { permissions: view, feature })
  // 前の権限でも閲覧できない内容は、確認中も表示しない（存在を知らせてよいかは、製品が hidden の扱いで決める）。
  if (!viewDecision.allowed) return { mode: "hidden", reason: viewDecision.reason }
  const unverified = unverifiedStatus(snapshot)
  if (unverified && sensitivity === "protected" && whileUnverified === "hide") return { mode: "pending", status: unverified }
  const editDecision = decideAccess(settled, { permissions: [...view, ...edit], feature })
  if (!editDecision.allowed) return { mode: "read-only", reason: editDecision.reason }
  return { mode: "edit", reason: null }
}

/** ページへのアクセスの状態 */
type PageAccessKind = "granted" | "unauthenticated" | "forbidden" | "not-found" | "error"

/**
 * サーバーの応答（HTTP のステータス）から、ページのアクセスの状態を決める。
 * concealForbidden：対象の存在を明かすことが情報の漏えいになる場合に、権限不足を不存在と同じに扱う。
 * 実際の応答と情報公開のポリシーは、バックエンドで保証する（この関数は表示の対応だけを決める）。
 */
function pageAccessFromStatus(status: number, { concealForbidden = false }: { concealForbidden?: boolean } = {}): PageAccessKind {
  if (status >= 200 && status < 300) return "granted"
  if (status === 401) return "unauthenticated"
  if (status === 403) return concealForbidden ? "not-found" : "forbidden"
  if (status === 404 || status === 410) return "not-found"
  return "error"
}

/** 2 つの権限の一覧の差。ロールの変更の影響（できるようになる操作、できなくなる操作）を示すために使う */
function diffPermissions<P extends string>(before: readonly P[], after: readonly P[]): { added: P[]; removed: P[] } {
  return {
    added: after.filter((p) => !before.includes(p)),
    removed: before.filter((p) => !after.includes(p)),
  }
}

/** 理由の既定の文。製品は labels で権限、機能、前提の設定の名前を渡す。文そのものを製品の文に置き換えてもよい */
function restrictionText<P extends string, F extends string>(
  reason: Restriction<P, F>,
  labels: { permission?: (p: P) => string; feature?: (f: F) => string; prerequisite?: (id: string) => string } = {},
): string {
  switch (reason.kind) {
    case "unresolved":
      return {
        loading: "権限を確認しています",
        error: "権限を確認できませんでした。確認できるまで、この操作は行えません",
        refreshing: "最新の権限を確認しています",
        stale: "最新の権限を確認できませんでした。確認できるまで、この操作は行えません",
      }[reason.status]
    case "entitlement":
      // 権限もない利用者には、契約プランの案内（機能の名前、プランで解決できること）を示さない。
      // 契約プランを変えても、権限がないため解決しない。機能の存在を、権限のない利用者に知らせない。
      if (reason.missing.length > 0) return "この操作は利用できません"
      return `${labels.feature?.(reason.feature) ?? "この機能"}は、現在の契約プランでは利用できません`
    case "authorization": {
      const names = reason.missing.map((p) => labels.permission?.(p) ?? p)
      return `この操作には「${names.join("」「")}」の権限が必要です`
    }
    case "prerequisite":
      return `${labels.prerequisite?.(reason.prerequisite) ?? "必要な設定"}を済ませると利用できます`
    case "service":
      return "障害のため、この機能は一時的に利用できません"
    case "connectivity":
      if (reason.status === "unconfirmed") return "接続を確認しています。確認できるまで、この操作は行えません"
      return "オフラインのため利用できません。接続が戻ると利用できます"
    case "pending":
      return "処理が終わるまで操作できません"
  }
}

export { decideAccess, diffPermissions, isAccessVerified, pageAccessFromStatus, presentAction, resolveContentAccess, restrictionText, unverifiedStatus }
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
}
