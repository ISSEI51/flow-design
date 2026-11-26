// Flow Design Notification State（Patterns / System & Account / Notifications）
// 通知の一覧の表示と既読の管理に使う純粋な関数。定義は docs/web/patterns/notifications.md を参照。
// React とブラウザに依存しない（Node の単体の検品から読み込む）。状態を持つ処理は notification-feed.ts にある。
//
// この部品が守ること
// - 重複は安定した通知の ID とイベントの ID で判定する。本文（タイトル）の文字列が同じだけの別のイベントを除かない。
// - 集約は、製品が集約してよいと判断した通知（canGroup）だけを、同じ groupKey で 2 件以上あるときに行う。
//   集約した後も、含まれる通知を個別に確かめられるよう、items を返す。
// - 未読の件数が不明な場合に、架空の件数を作らない（Dot か、表示なし）。0 件では何も表示しない。
// - 一括既読の対象は、開始した時点の範囲（ID の一覧、またはカーソル）に固定する。処理中に届いた通知を含めない。
// - 相対時刻は、渡された基準の時刻（now）から求める。描画中に Date.now() を読まない（SSR と Hydration の一致のため）。
// - Quiet Hours は、利用者のタイムゾーンで判定し、日をまたぐ範囲（22:00〜07:00）を扱う。緊急の通知は遅らせない。
// - 配信の状態は、確認できた事実だけから示す。送信できたことを、配信や既読として扱わない。
//
// この部品が持たないもの（製品の責務）
// - 実際のイベントの重複排除と通知の生成、配信、Digest と Quiet Hours の実行（通知の配信のサーバー）。
// - どの通知を集約してよいか、どの通知が緊急か、重要度と緊急性の値の定義。

/** 一覧の表示と既読の管理に必要な最小の項目。製品の通知の型は、これを含めばよい */
type NotificationLike = {
  /** 安定した通知の ID */
  id: string
  /** 通知を生成したイベントの ID。同じイベントから生成された通知は同じ値 */
  eventId?: string | null
  /** 内容がわかるタイトル。タイトルだけで何が起きたかがわかるようにする */
  title: string
  /** 発生した時刻（epoch ms） */
  createdAt: number
  /** 閲覧の状態。業務の対応の状態とは別に持つ */
  read: boolean
  /** 関連する連続したイベントをまとめるキー */
  groupKey?: string | null
  /**
   * サーバーが通知を受け付けた順の番号（単調に増える）。一括既読のカーソルに使う。
   * 発生時刻は、遅れて届いたイベントで前後が入れ替わるため、カーソルには向かない
   */
  sequence?: number | null
}

// ---------------------------------------------------------------- 並び順と重複

/** 新しい順。同じ時刻は ID の降順（毎回同じ順にする） */
function sortNotifications<T extends NotificationLike>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}

/**
 * 重複を除く。同じ通知の ID、または同じイベントの ID を持つ 2 件目以降を重複とする（先にあるものを残す）。
 * タイトルの文字列は比べない（同じ文の別のイベントを除かない）。
 */
function dedupeNotifications<T extends NotificationLike>(items: readonly T[]): { items: T[]; duplicates: T[] } {
  const ids = new Set<string>()
  const events = new Set<string>()
  const kept: T[] = []
  const duplicates: T[] = []
  for (const item of items) {
    const event = item.eventId ?? null
    if (ids.has(item.id) || (event !== null && events.has(event))) {
      duplicates.push(item)
      continue
    }
    ids.add(item.id)
    if (event !== null) events.add(event)
    kept.push(item)
  }
  return { items: kept, duplicates }
}

/**
 * 新しく届いた通知を、表示中の通知に加える。表示中のもの（既読の状態を含む）を優先し、重複は加えない。
 * added は実際に加えた通知（未読の件数の加算や、読み上げに使う）。
 */
function mergeNotifications<T extends NotificationLike>(current: readonly T[], incoming: readonly T[]) {
  const { items, duplicates } = dedupeNotifications([...current, ...incoming])
  const known = new Set(current.map((n) => n.id))
  const added = items.filter((n) => !known.has(n.id))
  return { items: sortNotifications(items), added, duplicates: duplicates.length }
}

/** current と重複しない incoming だけを返す（保留している新着の表示に使う） */
function withoutKnown<T extends NotificationLike>(current: readonly T[], incoming: readonly T[]): T[] {
  return mergeNotifications(current, incoming).added
}

// ---------------------------------------------------------------- 集約

type NotificationEntry<T extends NotificationLike> =
  | { kind: "item"; key: string; item: T }
  | {
      kind: "group"
      key: string
      groupKey: string
      /** 集約した通知（新しい順）。集約した後も個別に確かめられるようにする */
      items: T[]
      unread: number
      /** 最も新しい通知 */
      latest: T
    }

/**
 * 同じ groupKey を持ち、canGroup が true の通知を 1 つにまとめる。2 件以上あるときだけまとめる。
 * まとめた項目は、最も新しい通知の位置に置く。個別の対応が必要な通知や重要なセキュリティの通知は、
 * 製品が canGroup で false を返す（既定は groupKey があるものすべて）。
 */
function groupNotifications<T extends NotificationLike>(
  items: readonly T[],
  { canGroup = () => true }: { canGroup?: (item: T) => boolean } = {}
): NotificationEntry<T>[] {
  const sorted = sortNotifications(items)
  const members = new Map<string, T[]>()
  for (const item of sorted) {
    if (!item.groupKey || !canGroup(item)) continue
    const list = members.get(item.groupKey) ?? []
    list.push(item)
    members.set(item.groupKey, list)
  }
  const entries: NotificationEntry<T>[] = []
  const placed = new Set<string>()
  for (const item of sorted) {
    const group = item.groupKey && canGroup(item) ? members.get(item.groupKey) : undefined
    if (!group || group.length < 2) {
      entries.push({ kind: "item", key: item.id, item })
      continue
    }
    if (placed.has(item.groupKey!)) continue
    placed.add(item.groupKey!)
    entries.push({
      kind: "group",
      key: `group:${item.groupKey}`,
      groupKey: item.groupKey!,
      items: group,
      unread: countUnread(group),
      latest: group[0],
    })
  }
  return entries
}

function countUnread(items: readonly NotificationLike[]) {
  let n = 0
  for (const item of items) if (!item.read) n++
  return n
}

// ---------------------------------------------------------------- 未読の表示

type UnreadIndicator = {
  /** none：表示しない。dot：未読があることだけを示す。count：件数を示す */
  kind: "none" | "dot" | "count"
  /** 画面に表示する件数（99+ など）。count のときだけ */
  text: string | null
  /** アクセシブルな名前に加える文（「未読 3 件」「未読あり」「未読なし」）。不明なときは空 */
  description: string
}

/**
 * 未読の表示を決める。
 * - count が 0：表示しない。
 * - count が 1 以上：display が count なら件数（max を超えたら「99+」）、dot なら Dot。読み上げには正確な件数を使う。
 * - count が不明（null）：hasUnread が true なら Dot（架空の件数を作らない）、それ以外は表示しない。
 */
function getUnreadIndicator({
  count,
  hasUnread = null,
  display = "count",
  max = 99,
}: {
  /** 正確な未読の件数。不明なら null */
  count: number | null
  /** 件数が不明なときに、未読があることがわかっているか。不明なら null */
  hasUnread?: boolean | null
  display?: "dot" | "count"
  max?: number
}): UnreadIndicator {
  if (count !== null) {
    if (count <= 0) return { kind: "none", text: null, description: "未読なし" }
    const description = `未読 ${count.toLocaleString("ja-JP")} 件`
    if (display === "dot") return { kind: "dot", text: null, description }
    return { kind: "count", text: count > max ? `${max}+` : String(count), description }
  }
  if (hasUnread === true) return { kind: "dot", text: null, description: "未読あり" }
  if (hasUnread === false) return { kind: "none", text: null, description: "未読なし" }
  return { kind: "none", text: null, description: "" }
}

/** 通知センターを開くボタンのアクセシブルな名前（「お知らせ、未読 3 件」） */
function notificationTriggerLabel(base: string, indicator: UnreadIndicator) {
  return indicator.description ? `${base}、${indicator.description}` : base
}

/**
 * 表示する未読の件数。サーバーが返した件数（reported）に、まだサーバーの結果に反映していない
 * 画面の上の変更（既読・未読の更新中の通知）と、保留している新着の未読を加える。
 * reported が null の場合：一覧がすべて読み込み済み（complete）なら数え、そうでなければ null（不明）。
 */
function computeUnreadCount<T extends NotificationLike>({
  reported,
  base,
  shown,
  pending = [],
  complete = false,
}: {
  /** サーバーが返した未読の件数（取得した時点）。不明なら null */
  reported: number | null
  /** サーバーの結果としての通知（更新中の変更を含めない） */
  base: readonly T[]
  /** 画面の上の通知（更新中の変更を含める）。base と同じ ID の集まり */
  shown: readonly T[]
  /** 保留している新着（base と重複しないもの） */
  pending?: readonly T[]
  /** 一覧をすべて読み込んでいる（未読の件数を数えられる） */
  complete?: boolean
}): number | null {
  const extra = countUnread(pending)
  if (reported === null) return complete ? countUnread(shown) + extra : null
  return Math.max(0, reported - countUnread(base) + countUnread(shown) + extra)
}

// ---------------------------------------------------------------- 一括既読の範囲

/**
 * 一括既読の対象の範囲。開始した時点で固定し、処理中に届いた通知を含めない。
 * - ids：開始した時点で読み込み済みの未読の通知の ID。読み込んでいない通知は含めない（範囲を「読み込んだ未読 N 件」と示す）
 * - cursor：開始した時点の最も新しい通知までのすべて（読み込んでいない古い通知も含める）。
 *   比べる値は、サーバーが受け付けた順の番号（sequence）。すべての通知に sequence がある場合だけ使う。
 *   sequence がない場合は発生時刻（createdAt）で比べる（field: "createdAt"）。このときは、処理中に届いた
 *   発生時刻の古い通知（遅れて届いたイベント）も範囲に含まれる。製品のサーバーは sequence を返すことが望ましい。
 */
type ReadAllRange =
  | { kind: "ids"; scope: string | undefined; ids: string[] }
  | { kind: "cursor"; scope: string | undefined; field: "sequence" | "createdAt"; until: number | null; ids: string[] }

const cursorValue = (item: NotificationLike, field: "sequence" | "createdAt") => (field === "sequence" ? (item.sequence ?? null) : item.createdAt)

function createReadAllRange(
  items: readonly NotificationLike[],
  { scope, by = "ids" }: { scope: string | undefined; by?: "ids" | "cursor" }
): ReadAllRange {
  const sorted = sortNotifications(items)
  const ids = sorted.filter((n) => !n.read).map((n) => n.id)
  if (by === "ids") return { kind: "ids", scope, ids }
  const field = items.length > 0 && items.every((n) => typeof n.sequence === "number") ? "sequence" : "createdAt"
  let until: number | null = null
  for (const n of items) {
    const v = cursorValue(n, field)
    if (v !== null && (until === null || v > until)) until = v
  }
  return { kind: "cursor", scope, field, until, ids }
}

/** 通知が一括既読の範囲に含まれるか */
function isInReadAllRange(item: NotificationLike, range: ReadAllRange) {
  if (range.kind === "ids") return range.ids.includes(item.id)
  if (range.until === null) return false
  const v = cursorValue(item, range.field)
  return v !== null && v <= range.until
}

/** 範囲に含まれる通知だけを既読にする（処理中に届いた通知は未読のまま） */
function applyReadAll<T extends NotificationLike>(items: readonly T[], range: ReadAllRange): T[] {
  return items.map((n) => (!n.read && isInReadAllRange(n, range) ? { ...n, read: true } : n))
}

// ---------------------------------------------------------------- フォーカス

/**
 * 一覧から項目が消えたときのフォーカスの移動先。消えた項目の次（なければ前）の、残っている項目のキーを返す。
 * 残っている項目がなければ null（一覧の見出しなど、製品が決めた場所へ移す）。
 */
function focusAfterRemoval(previousKeys: readonly string[], nextKeys: readonly string[], removedKey: string): string | null {
  const remaining = new Set(nextKeys)
  const index = previousKeys.indexOf(removedKey)
  if (index < 0) return nextKeys[0] ?? null
  for (let i = index + 1; i < previousKeys.length; i++) if (remaining.has(previousKeys[i])) return previousKeys[i]
  for (let i = index - 1; i >= 0; i--) if (remaining.has(previousKeys[i])) return previousKeys[i]
  return null
}

// ---------------------------------------------------------------- 時刻

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 相対時刻（「たった今」「4 分前」「3 時間前」「2 日前」）。7 日以上前は null（正確な日付を示す） */
function formatRelativeTime(at: number, now: number): string | null {
  const diff = now - at
  if (diff < MINUTE) return "たった今"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 時間前`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 日前`
  return null
}

function zonedParts(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(at))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") }
}

/** 正確な日時（「2026年11月26日 9:56」）。タイムゾーンを必ず渡す（サーバーとブラウザで結果を変えない） */
function formatAbsoluteTime(at: number, timeZone: string) {
  const p = zonedParts(at, timeZone)
  return `${p.year}年${p.month}月${p.day}日 ${p.hour}:${String(p.minute).padStart(2, "0")}`
}

/**
 * 通知の時刻の表示。text は画面の文字（相対時刻、7 日以上前は日付）、absolute は正確な日時（title と読み上げ）、
 * iso は <time dateTime> の値。
 */
function formatNotificationTime(at: number, { now, timeZone }: { now: number; timeZone: string }) {
  const absolute = formatAbsoluteTime(at, timeZone)
  const p = zonedParts(at, timeZone)
  const relative = formatRelativeTime(at, now)
  return { text: relative ?? `${p.month}月${p.day}日`, relative, absolute, iso: new Date(at).toISOString() }
}

// ---------------------------------------------------------------- Quiet Hours と配信の判断

type QuietHours = {
  enabled: boolean
  /** 開始の時刻（"22:00"）。利用者のタイムゾーンでの時刻 */
  start: string
  /** 終了の時刻（"07:00"）。start より前なら翌日の時刻（日をまたぐ） */
  end: string
  /** 利用者のタイムゾーン（"Asia/Tokyo"） */
  timeZone: string
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + (m || 0)
}

/** at が Quiet Hours の中か。開始と終了が同じ時刻の場合は、範囲がないものとして false */
function isWithinQuietHours(at: number, quiet: QuietHours) {
  if (!quiet.enabled) return false
  const start = toMinutes(quiet.start)
  const end = toMinutes(quiet.end)
  if (start === end) return false
  const p = zonedParts(at, quiet.timeZone)
  const minute = p.hour * 60 + p.minute
  // 日をまたがない範囲（09:00〜18:00）と、日をまたぐ範囲（22:00〜07:00）
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}

/**
 * 製品の外（メール、プッシュ）への配信の判断の例。実際の配信は製品のサーバーが行う。
 * - urgent（すぐに対応が必要、重要なセキュリティ）：Quiet Hours と Digest でも、すぐに届ける（遅らせない）
 * - Quiet Hours の中：終わるまで保留する
 * - Digest が有効：まとめて届ける
 */
function planDelivery({
  urgent,
  at,
  quietHours,
  digest,
}: {
  urgent: boolean
  at: number
  quietHours?: QuietHours | null
  digest?: boolean
}): "immediate" | "deferred" | "digest" {
  if (urgent) return "immediate"
  if (quietHours && isWithinQuietHours(at, quietHours)) return "deferred"
  if (digest) return "digest"
  return "immediate"
}

// ---------------------------------------------------------------- 配信の状態

/** 配信チャネルごとの記録。確認できない値は null にする（推測で埋めない） */
type ChannelDelivery = {
  channel: string
  /** 送信した（配信の事業者や OS に渡した）時刻 */
  sentAt: number | null
  /** 配信が確認できた時刻 */
  deliveredAt: number | null
  /** このチャネルで配信を確認できるか（メールは確認できないことが多い） */
  deliveryConfirmable: boolean
  /** 送信に失敗した */
  failed?: boolean
  /** Quiet Hours や Digest で保留している */
  held?: boolean
}

type DeliveryState = "held" | "not-sent" | "failed" | "sent-unconfirmable" | "sent-awaiting" | "delivered"

const deliveryLabels: Record<DeliveryState, string> = {
  held: "保留中（通知を控える時間、またはまとめて届ける設定）",
  "not-sent": "未送信",
  failed: "送信に失敗",
  "sent-unconfirmable": "送信済み（届いたかは確認できません）",
  "sent-awaiting": "送信済み（配信の確認を待っています）",
  delivered: "配信済み",
}

/** 配信の状態。送信済みを配信済みとして扱わない。配信を確認できないチャネルで、配信済みと推測しない */
function describeDelivery(record: ChannelDelivery): { state: DeliveryState; label: string } {
  const state: DeliveryState = record.failed
    ? "failed"
    : record.deliveredAt !== null
      ? "delivered"
      : record.sentAt !== null
        ? record.deliveryConfirmable
          ? "sent-awaiting"
          : "sent-unconfirmable"
        : record.held
          ? "held"
          : "not-sent"
  return { state, label: deliveryLabels[state] }
}

export {
  applyReadAll,
  computeUnreadCount,
  countUnread,
  createReadAllRange,
  dedupeNotifications,
  describeDelivery,
  focusAfterRemoval,
  formatAbsoluteTime,
  formatNotificationTime,
  formatRelativeTime,
  getUnreadIndicator,
  groupNotifications,
  isInReadAllRange,
  isWithinQuietHours,
  mergeNotifications,
  notificationTriggerLabel,
  planDelivery,
  sortNotifications,
  withoutKnown,
}
export type { ChannelDelivery, DeliveryState, NotificationEntry, NotificationLike, QuietHours, ReadAllRange, UnreadIndicator }
