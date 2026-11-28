// Flow Design Setting Resolve（Patterns / System & Account / Settings）
// 設定の値の継承（製品の標準値、組織の標準値、組織のポリシー、個人の上書き）、親の設定に依存する設定、
// 閲覧と変更の可否、設定の検索の候補、標準の設定へ戻す範囲を、画面から切り離した純粋な関数で求める。
// 定義は docs/web/patterns/settings.md を参照。React とブラウザに依存しない（Node の単体の検品から読み込む）。
//
// この部品が守ること
// - 組織の必須のポリシーは、個人の上書きより優先する。個人の値は消さずに残し、実際に有効な値と区別して返す。
// - 親の設定が無効でも、子の設定の値を消さない。保存されている値と、実際に有効かどうかを区別して返す。
// - 変更できない設定には、理由を返す（ポリシー、契約プラン、権限の順）。理由のない「変更できない」を返さない。
// - 閲覧の権限がない設定は、検索の候補に含めない。
// - 標準の設定へ戻す操作は、指定した範囲の項目だけを対象にし、範囲の外の値とロックされた値を変えない。
// - 通知のチャネル（resolveDeliveryChannel）は、必須の通知、組織のポリシー、個人の設定、端末の許可を区別する。
//   求めるのは配信の可否であり、既読かどうかとは別である。
//
// この部品が持たないもの（製品の責務）
// - 値の保存と取得、ポリシーと権限の判定の正しさ（バックエンドが最終的に判断する）。
// - 理由の文言の内容（製品が渡す。既定の文言は日本語の例）。

/** 実際に有効な値の出所 */
type SettingSource = "product-default" | "org-default" | "user" | "org-policy"

type SettingLayers<T> = {
  /** 製品の標準値 */
  productDefault: T
  /** 組織の標準値。個人の設定で上書きできる。未設定は undefined */
  orgDefault?: T
  /** 組織の必須のポリシー。個人の設定で上書きできない */
  orgPolicy?: { value: T; reason: string }
  /** 個人の上書き。未設定（標準に従う）は undefined */
  userValue?: T
}

type ResolvedSetting<T> = {
  /** 実際に有効な値 */
  value: T
  source: SettingSource
  /** 保存されている個人の上書き。ポリシーで使われていない場合も残す */
  userValue: T | undefined
  /** 個人の上書きが、組織のポリシーのために使われていない */
  userValueIgnored: boolean
  /** 個人の上書きを外したときの値と、その出所（「組織の標準に従う」の表示に使う） */
  inherited: { value: T; source: "product-default" | "org-default" }
  /** 組織のポリシーで固定されている */
  locked: boolean
  /** 固定されている理由 */
  lockReason: string | null
}

function resolveSetting<T>(layers: SettingLayers<T>, equals: (a: T, b: T) => boolean = Object.is): ResolvedSetting<T> {
  const inherited =
    layers.orgDefault !== undefined
      ? { value: layers.orgDefault, source: "org-default" as const }
      : { value: layers.productDefault, source: "product-default" as const }
  if (layers.orgPolicy) {
    return {
      value: layers.orgPolicy.value,
      source: "org-policy",
      userValue: layers.userValue,
      userValueIgnored: layers.userValue !== undefined && !equals(layers.userValue, layers.orgPolicy.value),
      inherited,
      locked: true,
      lockReason: layers.orgPolicy.reason,
    }
  }
  if (layers.userValue !== undefined) {
    return { value: layers.userValue, source: "user", userValue: layers.userValue, userValueIgnored: false, inherited, locked: false, lockReason: null }
  }
  return { value: inherited.value, source: inherited.source, userValue: undefined, userValueIgnored: false, inherited, locked: false, lockReason: null }
}

type DependentSetting<T> = {
  /** 保存されている子の値（親が無効でも保持する） */
  stored: T
  /** 子の値が実際に使われているか（親が有効か） */
  active: boolean
  /** 使われていない理由 */
  inactiveReason: string | null
}

/** 親の設定に依存する子の設定。親を無効にしても、子の値を消さない */
function resolveDependent<T>({
  parentEnabled,
  value,
  inactiveReason,
}: {
  parentEnabled: boolean
  value: T
  /** 親が無効のときに示す理由（例：「通知を止める時間帯」がオフのため、使われていません） */
  inactiveReason: string
}): DependentSetting<T> {
  return { stored: value, active: parentEnabled, inactiveReason: parentEnabled ? null : inactiveReason }
}

/** 端末（OS、ブラウザ）の通知の許可。unsupported：端末が通知に対応していない */
type DevicePermission = "granted" | "denied" | "default" | "unsupported"

type ResolvedDeliveryChannel = {
  /** 設定の値（Switch に示す値）。必須の通知はオン、組織のポリシーで使えないチャネルはオフ */
  setting: ResolvedSetting<boolean>
  /** 製品がこのチャネルで配信を試み、かつ端末の許可がある（配信されることであり、既読になることではない） */
  delivers: boolean
  /** 配信されない原因。user：個人の設定でオフ、policy：組織のポリシー、permission：端末の許可がない */
  blockedBy: "user" | "policy" | "permission" | null
}

/**
 * 通知の 1 つのチャネル（種類 × 受け取り方）の、必須の通知、組織のポリシー、個人の設定、端末の許可を区別して求める。
 * 必須の通知は組織のポリシーより優先する。個人の値は、ポリシーで使われていない間も残す（resolveSetting と同じ規則）。
 * 端末の許可は、製品の設定とは別に持つ（許可がなくても個人の設定は変えない。配信されないことだけを示す）。
 * ここで求めるのは配信の可否である。配信されたこと、既読になったことは、通知の状態（Notifications）が持つ。
 */
function resolveDeliveryChannel({
  userEnabled,
  required = null,
  disabledByPolicy = null,
  permission,
}: {
  /** 個人の設定（保存されている値） */
  userEnabled: boolean
  /** 必須の通知（無効にできない理由） */
  required?: { reason: string } | null
  /** 組織のポリシーで使えないチャネル（理由） */
  disabledByPolicy?: { reason: string } | null
  /** 端末の許可が必要なチャネル（プッシュ通知など）の場合だけ渡す */
  permission?: DevicePermission
}): ResolvedDeliveryChannel {
  const orgPolicy = required ? { value: true, reason: required.reason } : disabledByPolicy ? { value: false, reason: disabledByPolicy.reason } : undefined
  const setting = resolveSetting<boolean>({ productDefault: false, orgPolicy, userValue: userEnabled })
  const permitted = permission === undefined || permission === "granted"
  const blockedBy = !setting.value ? (setting.locked ? "policy" : "user") : permitted ? null : "permission"
  return { setting, delivers: setting.value && permitted, blockedBy }
}

type SettingAccess = {
  /** 表示してよいか（閲覧の権限） */
  visible: boolean
  /** 変更してよいか */
  editable: boolean
  /** 変更できない理由。visible が false の場合は null（理由も示さない） */
  reason: string | null
  /**
   * 変更できない原因。unresolved：最新の権限を確認していない（取得中、取得の失敗、再確認中、再確認の失敗）。
   * unresolved は v0.1 の Patterns Integration Review で追加した（既存の値は変わらない）
   */
  restriction: "none" | "policy" | "plan" | "permission" | "hidden" | "unresolved"
}

/** 最新の権限を確認していない状態（access-decision の AccessSnapshot の status のうち、ready 以外） */
type SettingAccessUnresolved = "loading" | "error" | "refreshing" | "stale"

const unresolvedReasons: Record<SettingAccessUnresolved, string> = {
  loading: "権限を確認しています。確認できるまで変更できません。",
  error: "権限を確認できませんでした。確認できるまで変更できません。",
  refreshing: "最新の権限を確認しています。確認できるまで変更できません。",
  stale: "最新の権限を確認できませんでした。確認できるまで変更できません。",
}

/**
 * 閲覧と変更の可否。閲覧の権限がなければ表示しない。変更できない理由は、ポリシー、契約プラン、権限、権限の未確定の順に判断する
 * （decideAccess と同じ順序。前の権限でも変更できない場合は、その理由を示す）。
 * unresolved を渡すと、前の権限では変更できる場合も editable を false にする（最新の権限を確認するまで変更を許可しない）。
 * 閲覧の可否（visible）は canView で決める。最新の権限を確認していない間に保護された値を表示するかは、
 * resolveContentAccess（access-decision）で製品が決める（この関数は値を隠さない）。
 * 権限の判定は表示の制御であり、実際の認可はバックエンドが行う（製品の責務）。
 */
function settingAccess({
  canView,
  canEdit,
  lockReason = null,
  planReason = null,
  noPermissionReason = "変更する権限がありません。管理者に依頼してください。",
  unresolved = null,
  unresolvedReason,
}: {
  canView: boolean
  canEdit: boolean
  /** 組織のポリシーで固定されている理由（resolveSetting の lockReason） */
  lockReason?: string | null
  /** 契約プランで利用できない理由 */
  planReason?: string | null
  noPermissionReason?: string
  /** 最新の権限を確認していない状態。確認済みの場合は null か省略（既定） */
  unresolved?: SettingAccessUnresolved | null
  /** unresolved の場合の理由の文（既定は日本語の例） */
  unresolvedReason?: string
}): SettingAccess {
  if (!canView) return { visible: false, editable: false, reason: null, restriction: "hidden" }
  if (lockReason) return { visible: true, editable: false, reason: lockReason, restriction: "policy" }
  if (planReason) return { visible: true, editable: false, reason: planReason, restriction: "plan" }
  if (!canEdit) return { visible: true, editable: false, reason: noPermissionReason, restriction: "permission" }
  if (unresolved) return { visible: true, editable: false, reason: unresolvedReason ?? unresolvedReasons[unresolved], restriction: "unresolved" }
  return { visible: true, editable: true, reason: null, restriction: "none" }
}

type SettingSearchEntry = {
  /** 移動先の設定の項目の ID（画面の data-setting-id） */
  id: string
  /** 設定の名前 */
  label: string
  /** 所属するカテゴリの ID と名前 */
  categoryId: string
  category: string
  /** 検索用の別名（「ダークモード」「MFA」など） */
  aliases?: readonly string[]
  /** 閲覧の権限があるか。false の項目は候補に含めない */
  visible: boolean
}

type SettingSearchItem = { value: string; label: string; keywords: string[]; categoryId: string; category: string }

/**
 * 設定の検索の候補（Command の items）を作る。閲覧の権限がない項目は含めない。
 * 候補はカテゴリの名前と別名でも見つかる（Command の keywords）。
 */
function toSettingSearchGroups(entries: readonly SettingSearchEntry[]): { value: string; label: string; items: SettingSearchItem[] }[] {
  const groups = new Map<string, { value: string; label: string; items: SettingSearchItem[] }>()
  for (const e of entries) {
    if (!e.visible) continue
    const group = groups.get(e.categoryId) ?? { value: e.categoryId, label: e.category, items: [] }
    group.items.push({ value: e.id, label: e.label, keywords: [e.category, ...(e.aliases ?? [])], categoryId: e.categoryId, category: e.category })
    groups.set(e.categoryId, group)
  }
  return [...groups.values()]
}

type ResetPlan<V> = {
  /** 標準の値へ変わる項目 */
  changes: { key: keyof V; from: V[keyof V]; to: V[keyof V] }[]
  /** 範囲の中で、すでに標準の値の項目 */
  unchanged: (keyof V)[]
  /** 範囲の中で、ロックされているため変えない項目 */
  skipped: (keyof V)[]
}

/** 標準の設定へ戻す範囲を決める。keys の外の項目は対象にしない */
function planReset<V extends Record<string, unknown>>(
  current: V,
  defaults: V,
  keys: readonly (keyof V)[],
  { locked = [], equals = Object.is }: { locked?: readonly (keyof V)[]; equals?: (a: unknown, b: unknown) => boolean } = {}
): ResetPlan<V> {
  const plan: ResetPlan<V> = { changes: [], unchanged: [], skipped: [] }
  for (const key of keys) {
    if (locked.includes(key)) plan.skipped.push(key)
    else if (equals(current[key], defaults[key])) plan.unchanged.push(key)
    else plan.changes.push({ key, from: current[key], to: defaults[key] })
  }
  return plan
}

/** planReset の結果を適用した値。変わる項目以外は、元の値をそのまま残す */
function applyReset<V extends Record<string, unknown>>(current: V, plan: ResetPlan<V>): V {
  const next = { ...current }
  for (const c of plan.changes) next[c.key] = c.to
  return next
}

export { applyReset, planReset, resolveDeliveryChannel, resolveDependent, resolveSetting, settingAccess, toSettingSearchGroups }
export type {
  DependentSetting,
  DevicePermission,
  ResolvedDeliveryChannel,
  ResetPlan,
  ResolvedSetting,
  SettingAccess,
  SettingAccessUnresolved,
  SettingLayers,
  SettingSearchEntry,
  SettingSearchItem,
  SettingSource,
}
