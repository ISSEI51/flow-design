// Notifications のプレビューの模擬のサーバー。実際の通知の配信、メール、プッシュ通知は行わない。Registry には含めない。
// 取得の遅延と失敗、既読の更新の失敗と結果の不明、新着の到着、重複の配信、対象の削除、閲覧の権限の喪失、
// 通知の設定の保存の失敗を再現し、Patterns の挙動を確かめる。検品からは window.__fdSaNotificationsServer で設定する。
//
// 応答の保留と解放（Deferred）：hold[kind] を true にすると、その種類の応答を release(kind) まで返さない。
// 固定の応答時間に頼らず、検品が応答の順序を決める（A の応答を保留 → B へ切り替え → A へ戻る → 最初の A の応答を解放）。
// 新着の配信も holdDeliveries で保留し、releaseDeliveries で届ける（届ける先は配信した時点の購読者）。
//
// 模擬のデータの範囲：通知は佐藤 花子（u-sato）だけが持つ。ほかの利用者の通知は 0 件として返す。

import type { NotificationPage } from "@/patterns/notification-feed"
import { isInReadAllRange, type ChannelDelivery, type ReadAllRange } from "@/patterns/notification-state"

import { MockRequestError, MockUnknownError, mockRequest, type MockOutcome } from "./mock"
import { settingsServer } from "./settings-server"
import {
  defaultPersonalSettings,
  mandatoryNotifications,
  referenceNow,
  seedNotifications,
  type Channel,
  type NotificationRecord,
  type NotificationType,
  type PersonalSettings,
  type UserId,
  type WorkspaceId,
} from "./model"

/** プレビューの通知。model.ts の通知に、発生した時刻（epoch ms）と配信の記録を加える */
export type AppNotification = Omit<NotificationRecord, "minutesAgo"> & {
  createdAt: number
  /** 閲覧の権限を失った対象の通知（内容を伏せている） */
  restricted?: boolean
  /** サーバーが受け付けた順の番号（一括既読のカーソルに使う） */
  sequence: number
  delivery: ChannelDelivery[]
}

export type NotificationScope = { userId: UserId; workspaceId: WorkspaceId }
export type TargetCheck = { status: "ok" } | { status: "deleted" } | { status: "forbidden" }

type Kind = "list" | "read" | "readAll" | "resolve" | "settings" | "saveSetting" | "remove"

/** 保留している応答。release で解放する */
type Held = { seq: number; kind: Kind; ids?: string[]; workspaceId?: WorkspaceId; settle: (outcome?: ReleaseOutcome) => void }

/**
 * 保留した応答を解放するときの結果。MockOutcome に加えて、abort：製品の通信の層が独自に中止した場合の AbortError
 * （タイムアウト、利用者の取り消し）。サーバーでは処理を済ませている（要求を受け付けた時点で処理する）。
 */
export type ReleaseOutcome = MockOutcome | "abort"

/** 新着の配信の記録。購読者（label）ごとに、receive が受け付けたか（false：古い購読として捨てた） */
export type DeliveryLog = { workspaceId: WorkspaceId; ids: string[]; results: { label: string; accepted: boolean }[] }

/** 一括既読の応答の形（製品の API の違いの再現） */
export type ReadReport = "ids" | "count" | "none" | "invalid-count" | "extra-id"

export type NotificationRequestLog = {
  kind: Kind
  userId: UserId
  workspaceId?: WorkspaceId
  ids?: string[]
  read?: boolean
  range?: ReadAllRange
  setting?: SettingPatch
}

export type SettingPatch =
  | { kind: "channel"; type: NotificationType; channel: Channel; value: boolean }
  | { kind: "digest"; value: PersonalSettings["digest"] }
  | { kind: "quiet"; value: PersonalSettings["quietHours"] }

/** 組織のポリシー（ワークスペースごと）。使えない配信チャネルと、その理由 */
export const notificationPolicies: Record<WorkspaceId, { disabledChannels: { channel: Channel; reason: string }[] }> = {
  hq: { disabledChannels: [] },
  west: { disabledChannels: [{ channel: "push", reason: "西日本営業部の組織のポリシーで、プッシュ通知は使えません" }] },
}

type Config = {
  /** 応答までの時間（ms） */
  latency: Record<Kind, number>
  /** 一覧の取得の時間をワークスペースごとに変える（切り替えの競合の検品） */
  listLatencyByWorkspace: Partial<Record<WorkspaceId, number>>
  /** 次の要求の応答の時間（先頭から順に使う。連続した更新の競合の検品） */
  latencyQueue: Partial<Record<Kind, number[]>>
  /** 常に使う結果 */
  outcome: Record<Kind, MockOutcome>
  /** 次の 1 回だけ使う結果 */
  outcomeNext: Partial<Record<Kind, MockOutcome>>
  /** AbortSignal に従わない（中止された後も応答を返す） */
  ignoreAbort: boolean
  /** 未読の件数を返さない（件数が不明な場合の検品） */
  countMode: "exact" | "unknown"
  /** 新着を購読者に届けるまでの時間（ms） */
  pushDelay: number
  /** 一覧を、要求を受け付けた時点の状態で作る（応答の時間の間に変わった既読の状態を含めない。処理中の取得の検品） */
  listSnapshotAtStart: boolean
  /** 一覧で返す件数。null はすべて。残りがあれば hasMore を返す */
  pageSize: number | null
  /** 既読の更新などを、応答の時点で処理する（既定は要求を受け付けた時点）。処理中の取得との競合の検品 */
  processAtResponse: boolean
  /** true の種類の応答を、release まで保留する（Deferred） */
  hold: Partial<Record<Kind, boolean>>
  /** true の間、新着の配信を保留する（releaseDeliveries で届ける） */
  holdDeliveries: boolean
  /** 既読の更新と一括既読の応答の形。ids：更新した ID の一覧（既定）。count：件数だけ。none：何も返さない。
   * invalid-count：要求より多い件数。extra-id：範囲の外の ID（処理中に届いた通知）を含める */
  readReport: ReadReport
  /** 一覧で、同じ通知を 2 回返す（重複した ID の検品） */
  duplicateInList: boolean
  /** 未読の件数に加える値（サーバーの件数と一覧が一致しない場合の検品） */
  countOffset: number
  requests: NotificationRequestLog[]
  deliveries: DeliveryLog[]
}

const initialConfig = (): Config => ({
  latency: { list: 500, read: 400, readAll: 900, resolve: 300, settings: 400, saveSetting: 500, remove: 300 },
  listLatencyByWorkspace: {},
  latencyQueue: {},
  outcome: { list: "success", read: "success", readAll: "success", resolve: "success", settings: "success", saveSetting: "success", remove: "success" },
  outcomeNext: {},
  ignoreAbort: false,
  countMode: "exact",
  pushDelay: 0,
  listSnapshotAtStart: false,
  pageSize: null,
  processAtResponse: false,
  hold: {},
  holdDeliveries: false,
  readReport: "ids",
  duplicateInList: false,
  countOffset: 0,
  requests: [],
  deliveries: [],
})

// ---------------------------------------------------------------- データ

const MINUTE = 60_000

function deliveryOf(n: Pick<NotificationRecord, "type">, createdAt: number, settings: PersonalSettings): ChannelDelivery[] {
  const channels = settings.notifications[n.type]
  const records: ChannelDelivery[] = [
    // アプリ内：サーバーに保存し、一覧で取得できる状態になった時点を配信とする
    { channel: "in-app", sentAt: createdAt, deliveredAt: createdAt, deliveryConfirmable: true },
  ]
  // メール：送信の事業者に渡した時点までしか確認できない
  if (channels.email) records.push({ channel: "email", sentAt: createdAt + 30_000, deliveredAt: null, deliveryConfirmable: false })
  // プッシュ通知：OS の配信の確認を待つ（模擬では届かない）
  if (channels.push) records.push({ channel: "push", sentAt: createdAt + 5_000, deliveredAt: null, deliveryConfirmable: true })
  return records
}

const fromSeed = (n: NotificationRecord, sequence: number): AppNotification => {
  const { minutesAgo, ...rest } = n
  const createdAt = referenceNow - minutesAgo * MINUTE
  return { ...rest, createdAt, sequence, delivery: deliveryOf(n, createdAt, defaultPersonalSettings) }
}

const taskKey = (n: Pick<NotificationRecord, "target">) => (n.target ? `${n.target.kind}:${n.target.id}` : null)

type Store = {
  notifications: Record<WorkspaceId, AppNotification[]>
  /** 業務のデータ（対応が必要な作業）。通知の既読・削除とは別に持つ */
  tasks: Record<WorkspaceId, Map<string, { label: string; status: "open" | "done" }>>
  deletedTargets: Set<string>
  revokedTargets: Set<string>
  /** 閲覧の権限を失った通知（一覧に返さず、既読の更新もしない） */
  hiddenNotifications: Set<string>
  settings: Map<UserId, PersonalSettings>
  seq: number
  /** 受け付けた順の番号の最後の値 */
  sequence: number
  /** 加えた古い通知の数 */
  older: number
}

const cloneSettings = (s: PersonalSettings): PersonalSettings => structuredClone(s)

function initialStore(): Store {
  const notifications = { hq: [] as AppNotification[], west: [] as AppNotification[] }
  const tasks = { hq: new Map(), west: new Map() } as Store["tasks"]
  // 受け付けた順の番号：発生した時刻の古い順（同じ時刻は ID の順）
  const order = [...seedNotifications].sort((a, b) => b.minutesAgo - a.minutesAgo || (a.id < b.id ? -1 : 1))
  for (const n of seedNotifications) {
    notifications[n.workspaceId].push(fromSeed(n, order.indexOf(n) + 1))
    const key = taskKey(n)
    if (key && n.task !== "none") tasks[n.workspaceId].set(key, { label: n.target!.label, status: n.task === "done" ? "done" : "open" })
  }
  return { notifications, tasks, deletedTargets: new Set(), revokedTargets: new Set(), hiddenNotifications: new Set(), settings: new Map(), seq: 0, sequence: order.length, older: 0 }
}

let store = initialStore()
/** 購読者。戻り値は受け付けたか（receive の結果）。void は受け付けたものとして記録する */
type Listener = (items: AppNotification[]) => boolean | void
const listeners = new Map<string, Set<{ listener: Listener; label: string }>>()
let held: Held[] = []
let heldSeq = 0
let heldDeliveries: (() => void)[] = []
const scopeId = (s: NotificationScope) => `${s.userId}:${s.workspaceId}`

// ---------------------------------------------------------------- 設定と記録

export const notificationsServer = Object.assign(initialConfig(), {
  reset() {
    Object.assign(notificationsServer, initialConfig())
    store = initialStore()
    held = []
    heldDeliveries = []
  },
  /** 保留している応答の数（kind を省略するとすべて） */
  heldCount(kind?: Kind) {
    return held.filter((h) => !kind || h.kind === kind).length
  },
  /** 保留している応答の一覧（古い順） */
  heldRequests() {
    return held.map((h) => ({ seq: h.seq, kind: h.kind, ids: h.ids, workspaceId: h.workspaceId }))
  },
  /**
   * 保留している応答を解放する。which：first（最も古い）、last（最も新しい）、all。outcome を渡すと、その結果で応答する
   * （fail は処理しない、unknown は処理したうえで結果が不明として返す、abort は処理したうえで AbortError を返す）。解放した数を返す
   */
  release(kind: Kind, { which = "first", outcome, workspaceId }: { which?: "first" | "last" | "all"; outcome?: ReleaseOutcome; workspaceId?: WorkspaceId } = {}) {
    const targets = held.filter((h) => h.kind === kind && (workspaceId === undefined || h.workspaceId === workspaceId))
    const chosen = which === "all" ? targets : which === "last" ? targets.slice(-1) : targets.slice(0, 1)
    held = held.filter((h) => !chosen.includes(h))
    chosen.forEach((h) => h.settle(outcome))
    return chosen.length
  },
  /** 保留している新着の配信を届ける */
  releaseDeliveries() {
    const list = heldDeliveries
    heldDeliveries = []
    list.forEach((f) => f())
    return list.length
  },
  /** 通知そのものをサーバーで削除する（画面には知らせない） */
  deleteNotification(workspaceId: WorkspaceId, id: string) {
    store.notifications[workspaceId] = store.notifications[workspaceId].filter((n) => n.id !== id)
  },
  /** 通知そのものの閲覧の権限を失ったことを再現する（一覧に返さず、既読の更新の対象にしない） */
  hideNotification(id: string) {
    store.hiddenNotifications.add(id)
  },
  /** 新しい通知が届いたことを再現する。購読しているスコープに pushDelay の後で届ける */
  push(workspaceId: WorkspaceId, partial: Partial<Pick<AppNotification, "title" | "type" | "eventId" | "target" | "groupKey" | "task">> = {}) {
    store.seq++
    const createdAt = referenceNow + store.seq * 1000
    const type = partial.type ?? "mention"
    const record: AppNotification = {
      id: `n-new-${store.seq}`,
      eventId: partial.eventId ?? `e-new-${store.seq}`,
      workspaceId,
      type,
      title: partial.title ?? `新しいコメントでメンションされました（${store.seq}）`,
      target: partial.target ?? null,
      createdAt,
      sequence: ++store.sequence,
      read: false,
      task: partial.task ?? "none",
      groupKey: partial.groupKey,
      delivery: deliveryOf({ type }, createdAt, settingsOf("u-sato")),
    }
    store.notifications[workspaceId].push(record)
    deliver(workspaceId, [record])
    return record.id
  },
  /**
   * 読み込んでいない古い未読の通知を count 件加える（pageSize と組み合わせて、件数と一括既読の範囲を検品する）。
   * 受け付けた順の番号は、既存の通知より前にする
   */
  addOlderUnread(workspaceId: WorkspaceId, count: number) {
    const oldest = Math.min(...store.notifications[workspaceId].map((n) => n.createdAt), referenceNow)
    for (let i = 0; i < count; i++) {
      store.older++
      const createdAt = oldest - (i + 1) * 60 * MINUTE
      store.notifications[workspaceId].push({
        id: `n-old-${store.older}`,
        eventId: `e-old-${store.older}`,
        workspaceId,
        type: "job",
        title: `顧客の書き出しが完了しました（以前の処理 ${store.older}）`,
        target: null,
        createdAt,
        sequence: -store.older,
        read: false,
        task: "none",
        delivery: deliveryOf({ type: "job" }, createdAt, defaultPersonalSettings),
      })
    }
  },
  /** 同じ通知（同じ ID とイベントの ID）を、もう一度配信する（重複の配信の再現） */
  redeliver(workspaceId: WorkspaceId, id: string) {
    const record = store.notifications[workspaceId].find((n) => n.id === id)
    if (record) deliver(workspaceId, [{ ...record }])
  },
  /** 同じタイトルの、別のイベントの通知を届ける（文字列が同じでも重複ではない） */
  pushSameTitle(workspaceId: WorkspaceId, id: string) {
    const record = store.notifications[workspaceId].find((n) => n.id === id)
    if (!record) return null
    return notificationsServer.push(workspaceId, { title: record.title, type: record.type, target: record.target, task: record.task })
  },
  /** 対象のデータが削除されたことを再現する（通知は残る） */
  deleteTarget(targetId: string) {
    store.deletedTargets.add(targetId)
  },
  /** 対象の閲覧の権限を失ったことを再現する。一覧では内容を伏せる */
  revokeAccess(targetId: string) {
    store.revokedTargets.add(targetId)
  },
  restoreAccess(targetId: string) {
    store.revokedTargets.delete(targetId)
  },
  /** 業務のデータ（対応の状態）。通知の既読・削除では変わらない */
  tasksOf(workspaceId: WorkspaceId) {
    return [...store.tasks[workspaceId].entries()].map(([key, t]) => ({ key, ...t }))
  },
  completeTask(workspaceId: WorkspaceId, key: string) {
    const task = store.tasks[workspaceId].get(key)
    if (task) task.status = "done"
  },
  /** サーバーの通知の状態（検品用） */
  stored(workspaceId: WorkspaceId) {
    return store.notifications[workspaceId].map((n) => ({ id: n.id, read: n.read, title: n.title }))
  },
  storedSettings(userId: UserId) {
    return cloneSettings(settingsOf(userId))
  },
})

declare global {
  interface Window {
    __fdSaNotificationsServer?: typeof notificationsServer
  }
}
if (typeof window !== "undefined") window.__fdSaNotificationsServer = notificationsServer

export type NotificationsServerConfig = typeof notificationsServer

function settingsOf(userId: UserId) {
  let s = store.settings.get(userId)
  if (!s) {
    s = cloneSettings(defaultPersonalSettings)
    store.settings.set(userId, s)
  }
  // タイムゾーンの正本は個人の設定（Settings の模擬のサーバーの表示の設定）。通知の設定には複製を持たない（SET-4）。
  // 個人の設定でタイムゾーンを変えると、通知を控える時間の判定と表示も、そのタイムゾーンになる。
  const timezone = settingsServer.personalOf(userId)?.display.timezone
  if (timezone) s.timezone = timezone
  return s
}

function deliver(workspaceId: WorkspaceId, items: AppNotification[]) {
  // 届ける先は、配信した時点の購読者（切り替えの後に古いスコープへ届く、古い WebSocket・SSE の再現）
  const targets = [...(listeners.get(`u-sato:${workspaceId}`) ?? [])]
  const copy = items.map((n) => view(n))
  const send = () => {
    const results = targets.map((t) => ({ label: t.label, accepted: t.listener(copy) !== false }))
    notificationsServer.deliveries.push({ workspaceId, ids: copy.map((n) => n.id), results })
  }
  if (notificationsServer.holdDeliveries) heldDeliveries.push(send)
  else setTimeout(send, notificationsServer.pushDelay)
}

/**
 * 応答を待つ。hold の間は release まで、それ以外は latency の後に、結果（outcome）で解決する。
 * AbortSignal に従う（ignoreAbort の間は従わない）。保留中に中止された場合は、保留の一覧から外す。
 */
function wait(kind: Kind, latency: number, outcome: MockOutcome, signal: AbortSignal | undefined, ids?: string[], workspaceId?: WorkspaceId): Promise<ReleaseOutcome> {
  return new Promise<ReleaseOutcome>((resolve, reject) => {
    let entry: Held | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    if (notificationsServer.hold[kind]) {
      entry = { seq: ++heldSeq, kind, ids, workspaceId, settle: (o) => resolve(o ?? outcome) }
      held.push(entry)
    } else {
      timer = setTimeout(() => resolve(outcome), latency)
    }
    if (signal && !notificationsServer.ignoreAbort) {
      const onAbort = () => {
        if (timer) clearTimeout(timer)
        if (entry) held = held.filter((h) => h !== entry)
        reject(new DOMException("aborted", "AbortError"))
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener("abort", onAbort, { once: true })
    }
  })
}

function take(kind: Kind) {
  const next = notificationsServer.outcomeNext[kind]
  if (next) delete notificationsServer.outcomeNext[kind]
  const queue = notificationsServer.latencyQueue[kind]
  const queued = queue && queue.length > 0 ? queue.shift() : undefined
  return { outcome: next ?? notificationsServer.outcome[kind], latency: queued ?? notificationsServer.latency[kind] }
}

/** 一覧に返す形。閲覧の権限を失った対象の通知は、内容（タイトル、対象の名前）を返さない */
function view(n: AppNotification): AppNotification {
  const key = taskKey(n)
  const task = key ? store.tasks[n.workspaceId].get(key) : undefined
  const projected = { ...n, task: task ? task.status : "none" } as AppNotification
  if (n.target && store.revokedTargets.has(n.target.id)) {
    return { ...projected, title: "閲覧できない対象に関するお知らせ", target: null, restricted: true, groupKey: undefined, task: "none" }
  }
  return projected
}

/**
 * 応答を遅らせる。処理（run）は要求を受け付けた時点で行う（サーバーは受け付けた順に処理する）。
 * processAtResponse の間は、応答の時点で処理する（処理が遅れるサーバーの再現）。
 * 保留した応答を release の outcome で解放した場合は、その結果にする（fail：処理しない。要求の時点で処理済みなら取り消さない）。
 */
function respond<T>(kind: Kind, signal: AbortSignal | undefined, run: () => T, failMessage: string, ids?: string[]): Promise<T> {
  const { outcome, latency } = take(kind)
  const atResponse = notificationsServer.processAtResponse
  let value: T | undefined
  let error: unknown = null
  let processed = false
  const process = () => {
    processed = true
    try {
      value = run()
    } catch (e) {
      error = e
    }
  }
  if (!atResponse && outcome !== "fail") process()
  return wait(kind, latency, outcome, signal, ids).then((final) => {
    if (!processed && final !== "fail") process()
    if (error) throw error
    if (final === "abort") throw new DOMException("aborted by the product's request layer (mock)", "AbortError")
    if (final === "fail") throw new MockRequestError(failMessage)
    if (final === "unknown") throw new MockUnknownError()
    return value as T
  })
}

/** 既読の更新の応答を、readReport の形にする（製品の API の違いの再現） */
function report(updated: string[], requested: number, extra: string | null): UpdateResponse {
  switch (notificationsServer.readReport) {
    case "count":
      return { count: updated.length }
    case "none":
      return undefined
    case "invalid-count":
      return { count: requested + 5 }
    case "extra-id":
      return { updated: extra ? [...updated, extra] : updated }
    default:
      return { updated }
  }
}

/** 一覧に返す通知（閲覧の権限を失った通知を除く） */
const visible = (workspaceId: WorkspaceId) => store.notifications[workspaceId].filter((n) => !store.hiddenNotifications.has(n.id))

// ---------------------------------------------------------------- API（画面の部品に props で渡す）

/** 既読の更新の応答。updated：実際に更新した ID。count：件数だけ。undefined：何も返さない（readReport で選ぶ） */
export type UpdateResponse = { updated?: string[]; count?: number } | undefined

export type NotificationsApi = {
  list: (scope: NotificationScope, context: { signal: AbortSignal }) => Promise<NotificationPage<AppNotification>>
  updateRead: (scope: NotificationScope, ids: string[], read: boolean, context: { signal: AbortSignal }) => Promise<UpdateResponse>
  markAllRead: (scope: NotificationScope, range: ReadAllRange, context: { signal: AbortSignal }) => Promise<UpdateResponse>
  remove: (scope: NotificationScope, id: string, context?: { signal?: AbortSignal }) => Promise<void>
  /** 新着の購読。listener の戻り値は受け付けたか（検品の記録 deliveries に、label とともに残す） */
  subscribe: (scope: NotificationScope, listener: Listener, label?: string) => () => void
  resolveTarget: (scope: NotificationScope, target: NonNullable<AppNotification["target"]>, context?: { signal?: AbortSignal }) => Promise<TargetCheck>
  loadSettings: (userId: UserId, context: { signal: AbortSignal }) => Promise<PersonalSettings>
  saveSetting: (userId: UserId, workspaceId: WorkspaceId, patch: SettingPatch, context: { signal: AbortSignal }) => Promise<PersonalSettings>
}

export const notificationsApi: NotificationsApi = {
  list: (scope, { signal }) => {
    notificationsServer.requests.push({ kind: "list", ...scope })
    const { outcome, latency } = take("list")
    const delay = notificationsServer.listLatencyByWorkspace[scope.workspaceId] ?? latency
    const build = (): NotificationPage<AppNotification> => {
      const all = scope.userId === "u-sato" ? visible(scope.workspaceId).map(view) : []
      const sorted = [...all].sort((a, b) => b.createdAt - a.createdAt || b.sequence - a.sequence)
      const size = notificationsServer.pageSize
      const page = size === null ? sorted : sorted.slice(0, size)
      const items = notificationsServer.duplicateInList && page.length > 0 ? [...page, { ...page[0] }] : page
      const unread = all.filter((n) => !n.read).length + notificationsServer.countOffset
      return {
        items,
        unreadCount: notificationsServer.countMode === "exact" ? unread : null,
        hasMore: notificationsServer.countMode === "unknown" || page.length < sorted.length,
        // 一覧と件数が反映している、受け付けた順の番号の最大値（保留中の新着を二重に数えないために使う）
        asOf: store.sequence,
      }
    }
    // 要求を受け付けた時点の一覧（応答までの間に確定した既読の状態を含まない）
    const snapshot = notificationsServer.listSnapshotAtStart ? build() : null
    return wait("list", delay, outcome, signal, undefined, scope.workspaceId).then((final) => {
      if (final === "fail") throw new MockRequestError("お知らせを取得できませんでした（模擬）")
      if (final === "abort") throw new DOMException("aborted by the product's request layer (mock)", "AbortError")
      const page = snapshot ?? build()
      if (final === "unknown") throw new MockUnknownError()
      return page
    })
  },
  updateRead: (scope, ids, read, { signal }) => {
    notificationsServer.requests.push({ kind: "read", ...scope, ids, read })
    return respond(
      "read",
      signal,
      () => {
        // 削除された通知と、閲覧の権限を失った通知は更新しない（updated に含めない）
        const updated: string[] = []
        for (const n of visible(scope.workspaceId)) {
          if (ids.includes(n.id)) {
            n.read = read
            updated.push(n.id)
          }
        }
        return report(updated, ids.length, null)
      },
      "既読の状態を更新できませんでした（模擬）",
      ids
    )
  },
  markAllRead: (scope, range, { signal }) => {
    notificationsServer.requests.push({ kind: "readAll", ...scope, range, ids: range.ids })
    return respond(
      "readAll",
      signal,
      () => {
        // 範囲（ids：開始した時点の ID、cursor：開始した時点の最も新しい通知までの受け付けた順の番号）の通知だけを既読にする。
        // 処理中に届いた通知は含めない。
        // 範囲のスコープを確かめる（製品のサーバーは、要求の認可のスコープと範囲のスコープが一致することを確かめる）
        if (range.scope !== undefined && !range.scope.startsWith(`${scope.userId}:${scope.workspaceId}:`)) {
          throw new MockRequestError("範囲のスコープが要求と一致しません（模擬）", "scope")
        }
        const updated: string[] = []
        for (const n of visible(scope.workspaceId)) {
          if (!n.read && isInReadAllRange(n, range)) {
            n.read = true
            updated.push(n.id)
          }
        }
        // extra-id：範囲の外の通知（処理中に届いた最も新しい未読）を、誤って結果に含めるサーバーの再現（実際には更新しない）
        const outside = visible(scope.workspaceId).find((n) => !n.read && !isInReadAllRange(n, range))
        return report(updated, range.ids.length, outside?.id ?? null)
      },
      "すべて既読にできませんでした（模擬）",
      range.ids
    )
  },
  remove: (scope, id, context) => {
    notificationsServer.requests.push({ kind: "remove", ...scope, ids: [id] })
    // 通知だけを削除する。業務のデータ（対応の状態）は変えない。
    return respond(
      "remove",
      context?.signal,
      () => {
        store.notifications[scope.workspaceId] = store.notifications[scope.workspaceId].filter((n) => n.id !== id)
      },
      "お知らせを削除できませんでした（模擬）"
    )
  },
  subscribe: (scope, listener, label = "") => {
    const key = scopeId(scope)
    const set = listeners.get(key) ?? new Set()
    const entry = { listener, label }
    set.add(entry)
    listeners.set(key, set)
    return () => set.delete(entry)
  },
  resolveTarget: (scope, target, context) => {
    notificationsServer.requests.push({ kind: "resolve", ...scope, ids: [target.id] })
    return respond(
      "resolve",
      context?.signal,
      (): TargetCheck => {
        if (store.deletedTargets.has(target.id)) return { status: "deleted" }
        if (store.revokedTargets.has(target.id)) return { status: "forbidden" }
        return { status: "ok" }
      },
      "対象を確認できませんでした（模擬）"
    )
  },
  loadSettings: (userId, { signal }) => {
    notificationsServer.requests.push({ kind: "settings", userId })
    const { outcome, latency } = take("settings")
    return mockRequest({
      latency,
      outcome,
      signal,
      ignoreAbort: notificationsServer.ignoreAbort,
      failMessage: "通知の設定を取得できませんでした（模擬）",
      run: () => cloneSettings(settingsOf(userId)),
    })
  },
  saveSetting: (userId, workspaceId, patch, { signal }) => {
    notificationsServer.requests.push({ kind: "saveSetting", userId, workspaceId, setting: patch })
    return respond(
      "saveSetting",
      signal,
      () => {
        const s = settingsOf(userId)
        if (patch.kind === "channel") {
          // 必須の通知と、組織のポリシーで使えないチャネルは、サーバーでも拒否する（画面の制限だけに頼らない）
          if (!patch.value && mandatoryNotifications.some((m) => m.type === patch.type && m.channel === patch.channel)) {
            throw new MockRequestError("この通知は無効にできません", "mandatory")
          }
          if (patch.value && notificationPolicies[workspaceId].disabledChannels.some((d) => d.channel === patch.channel)) {
            throw new MockRequestError("組織のポリシーで使えないチャネルです", "policy")
          }
          s.notifications[patch.type][patch.channel] = patch.value
        } else if (patch.kind === "digest") s.digest = patch.value
        else s.quietHours = { ...patch.value }
        return cloneSettings(s)
      },
      "設定を保存できませんでした（模擬）"
    )
  },
}
