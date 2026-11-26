// Flow Design Auth Flow（Patterns / System & Account / Authentication）
// 認証の画面で共通に使う、ブラウザにも React にも依存しない関数。定義は docs/web/patterns/authentication.md を参照。
// Node（サーバー、ブラウザを使わない検品）からも読み込めるよう、別名（"@/..."）の import を持たない。
//
// この部品が守ること
// - 復帰先（ログインの後に戻る画面）は、同じオリジンの相対パスだけを受け付ける。外部の URL、プロトコル相対（//host）、
//   javascript: などのスキーム、バックスラッシュ、制御文字、エンコードして隠したそれらの形を拒否し、既定の画面に戻す。
//   URL として解析した後の値（ドットのセグメントを除いた値）も、同じ規則で確かめ直す。
// - ワークスペースと閲覧権限による復帰先の検証は、製品の関数（isAllowed）に任せる。この部品は製品の権限を知らない。
// - メールアドレスは、明らかに入力を誤った場合だけを知らせる（「@」がない、前後が空、空白を含む）。
//   ドメインのドット、文字の種類、長さで有効なアドレスを拒否しない。正当性はバックエンドで確かめる。
// - 確認コードは文字列のまま扱う（先頭の 0 を失わない）。ペーストした空白・ハイフン・全角の数字を取り除き・変換する。
//   桁数は固定しない。
// - 再認証の後に、同じ利用者か別の利用者かで、復元してよいものと破棄するものを決める。
//
// この部品が持たないもの（製品の責務）
// - 認証そのもの（パスワード、コード、トークンの検証）、試行回数の制限、アカウントの列挙の対策、セッションの管理。
// - パスワードの方針（文字数、文字の種類）。requirements で製品が定義する。
// - 復帰先のワークスペースと権限の判定（isAllowed）。実際の画面の移動（ルーター）。

// ---------------------------------------------------------------- 復帰先

/** 復帰先の判定の結果 */
type ReturnToResult =
  | { status: "accepted"; path: string }
  | {
      status: "fallback"
      /** 移動する画面（既定の画面） */
      path: string
      /** missing：指定がない。unsafe：同じオリジンの相対パスではない。not-allowed：製品の判定（ワークスペース、権限）で拒否した */
      reason: "missing" | "unsafe" | "not-allowed"
    }

// 判定にだけ使う仮のオリジン。実際の URL には使わない。
const PROBE_ORIGIN = "https://return-to.invalid"
const MAX_RETURN_TO_LENGTH = 2048

// 制御文字（タブ、改行を含む）。URL の解析では取り除かれ、「/\t/evil.example」が「//evil.example」になる。
const CONTROL = /[\u0000-\u001f\u007f]/

// %XX を 1 バイトの文字として復号する。危険な形（/、\、制御文字）は ASCII のため、これで確かめられる。
// decodeURIComponent と異なり、「100%」のような不完全な形でも例外にしない（有効なパスを拒否しない）。
const decodeAscii = (s: string) => s.replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))

function hasUnsafeShape(path: string) {
  if (CONTROL.test(path)) return true
  // ブラウザはバックスラッシュをスラッシュとして扱う（「/\evil.example」は「//evil.example」）。
  if (path.includes("\\")) return true
  if (!path.startsWith("/")) return true
  // プロトコル相対の URL
  if (path.startsWith("//")) return true
  return false
}

// 値と、それを 3 回まで復号した形（%2F%2F、%5C、%09、%252F%252F のような二重のエンコード）のどれかが危険な形か。
// 製品のルーターが復号してから移動する場合があるため。「%」の後が 16 進数でない部分は、そのまま残す。
// 各層は、URL として解析した後の形（ドットのセグメントを除いた形）も確かめる。
// 「/a/%2e%2e%2f%2fevil.example」は、復号すると「/a/..//evil.example」になり、解析すると「//evil.example」になる。
function hasUnsafeLayer(path: string) {
  let current = path
  for (let i = 0; i <= 3; i++) {
    if (hasUnsafeShape(current)) return true
    let parsed: URL
    try {
      parsed = new URL(current, PROBE_ORIGIN)
    } catch {
      return true
    }
    if (parsed.origin !== PROBE_ORIGIN || hasUnsafeShape(`${parsed.pathname}${parsed.search}${parsed.hash}`)) return true
    const next = decodeAscii(current)
    if (next === current) return false
    current = next
  }
  return false
}

/**
 * 復帰先を、同じオリジンの相対パス（/ で始まる）として安全な場合だけ返す。安全でなければ null。
 * 返す値は、URL として解析し直した pathname + search + hash（「/a/../b」は「/b」になる）。
 * 解析の前の値だけでなく、解析した後の値も同じ規則で確かめ直す。ドットのセグメント（「/.//evil.example」
 * 「/a/..//evil.example」「/%2e%2e//evil.example」）は、解析で取り除かれると「//evil.example」になるため。
 */
function toSafeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_RETURN_TO_LENGTH) return null
  if (hasUnsafeLayer(raw)) return null
  let url: URL
  try {
    url = new URL(raw, PROBE_ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== PROBE_ORIGIN) return null
  const result = `${url.pathname}${url.search}${url.hash}`
  if (hasUnsafeLayer(result)) return null
  return result
}

/**
 * ログインの後の移動先を決める。
 * - 安全な相対パスで、製品の判定（isAllowed：ワークスペースの所属、閲覧権限）が true のときだけ、その画面に戻す。
 * - それ以外は既定の画面（fallback）。理由（reason）は記録や案内に使い、外部の URL を画面に表示しない。
 */
function resolveReturnTo(
  raw: string | null | undefined,
  { fallback, isAllowed }: { fallback: string; isAllowed?: (path: string) => boolean }
): ReturnToResult {
  if (raw == null || raw === "") return { status: "fallback", path: fallback, reason: "missing" }
  const path = toSafeReturnPath(raw)
  if (path === null) return { status: "fallback", path: fallback, reason: "unsafe" }
  if (isAllowed && !isAllowed(path)) return { status: "fallback", path: fallback, reason: "not-allowed" }
  return { status: "accepted", path }
}

// ---------------------------------------------------------------- メールアドレス

/** メールアドレスの最小限の形式の確認の結果 */
type EmailCheck =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "missing-at" | "fullwidth-at" | "missing-local" | "missing-domain" | "space" }

// 前後の空白（全角の空白を含む）。コピー＆ペーストで付いたものを取り除く。
const trimAll = (s: string) => s.replace(/^[\s　]+|[\s　]+$/g, "")

/**
 * メールアドレスの明らかな誤りだけを知らせる。値は前後の空白を取り除いたもの（大文字・小文字は変えない）。
 * ドメインのドット（user@localhost）、国際化ドメイン、「+」の付いたアドレスなどを拒否しない。
 */
function checkEmailFormat(input: string): EmailCheck {
  const value = trimAll(input)
  if (value === "") return { ok: false, reason: "empty" }
  const at = value.lastIndexOf("@")
  if (at === -1) return { ok: false, reason: value.includes("＠") ? "fullwidth-at" : "missing-at" }
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (local === "") return { ok: false, reason: "missing-local" }
  if (domain === "") return { ok: false, reason: "missing-domain" }
  // 引用符で囲んだローカル部（"john doe"@example.com）の空白は有効なため、ローカル部の外だけを確かめる。
  const quotedLocal = local.length >= 2 && local.startsWith('"') && local.endsWith('"')
  if (/[\s　]/.test(domain) || (!quotedLocal && /[\s　]/.test(local))) return { ok: false, reason: "space" }
  return { ok: true, value }
}

// ---------------------------------------------------------------- 確認コード

/** 確認コードの形式。numeric は数字だけ、alphanumeric は英字と数字（リカバリーコードなど） */
type VerificationCodeFormat = "numeric" | "alphanumeric"

// 全角の英数字と記号（U+FF01〜FF5E）を半角にする。日本語の入力の状態で入力した「０１２」など。
const toHalfWidth = (s: string) => s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))

/**
 * 確認コードを、比較できる文字列にする。数値に変換しない（先頭の 0 を失わない）。桁数で切り詰めない。
 * - 全角の英数字を半角にする。
 * - numeric：数字以外（空白、ハイフン、「ー」など）を取り除く。alphanumeric：英字と数字以外を取り除く。
 * - uppercase：英字を大文字にそろえる（大文字・小文字を区別しないコードの場合。製品が決める）。
 */
function normalizeVerificationCode(
  input: string,
  { format = "numeric", uppercase = false }: { format?: VerificationCodeFormat; uppercase?: boolean } = {}
): string {
  const half = toHalfWidth(input)
  const kept = format === "numeric" ? half.replace(/[^0-9]/g, "") : half.replace(/[^0-9A-Za-z]/g, "")
  return uppercase ? kept.toUpperCase() : kept
}

// ---------------------------------------------------------------- 新しいパスワード

/** 製品が定義するパスワードの要件。Registry は文字の種類の規則を持たない */
type PasswordRequirement = { id: string; label: string; test: (value: string) => boolean }

/** 要件ごとの達成状態。入力の前から一覧を表示するために、空の値でも呼べる */
function evaluatePasswordRequirements(value: string, requirements: readonly PasswordRequirement[]) {
  const items = requirements.map((r) => ({ id: r.id, label: r.label, met: r.test(value) }))
  return { items, allMet: items.every((i) => i.met) }
}

// ---------------------------------------------------------------- 再認証

/** 再認証の後の扱い */
type ReauthenticationPlan =
  | {
      kind: "same-user"
      /** 保持していた作業（未保存の入力など）を復元してよいか。権限を再検証した結果（permissionsStillAllow）による */
      restoreWork: boolean
      /** 結果を確かめていない保存などがあり、再送信の前にサーバーで結果を確かめる必要があるか */
      confirmPending: boolean
      /** 前の利用者のデータ、選択、入力、通知、非同期処理の結果を破棄するか */
      discardPreviousUser: false
    }
  | { kind: "different-user"; restoreWork: false; confirmPending: false; discardPreviousUser: true }

/**
 * セッションが切れた後の再認証の結果から、復元と破棄を決める。
 * - 同じ利用者：権限を再検証して許される場合だけ、保持していた作業を復元する。結果が不明な保存は、再送信せずに確かめる。
 * - 別の利用者（別のアカウントでログインした）：前の利用者のデータと入力をすべて破棄する。結果が不明な保存も、
 *   新しい利用者の権限で確かめたり再送信したりしない。
 * previousUserId が null（前の利用者がわからない）の場合も、別の利用者として扱う。
 */
function planReauthentication({
  previousUserId,
  userId,
  permissionsStillAllow,
  hasUnconfirmedMutation,
}: {
  previousUserId: string | null
  userId: string
  /** 再認証の後に、製品が権限を取得し直して確かめた結果 */
  permissionsStillAllow: boolean
  hasUnconfirmedMutation: boolean
}): ReauthenticationPlan {
  if (previousUserId === null || previousUserId !== userId) {
    return { kind: "different-user", restoreWork: false, confirmPending: false, discardPreviousUser: true }
  }
  return { kind: "same-user", restoreWork: permissionsStillAllow, confirmPending: hasUnconfirmedMutation, discardPreviousUser: false }
}

// ---------------------------------------------------------------- 認証のエラー

/**
 * 認証のエラーの種類。製品は、自分の API のエラーをこのどれかに対応させる。
 * - invalid-input：入力の形式の誤り（入力欄の近くに示す）
 * - invalid-credentials：認証情報の不一致。アカウントが存在しない場合も同じにする（フォーム全体に示す）
 * - network：通信の失敗（応答が届かなかった）
 * - rate-limited：試行回数の制限
 * - service-unavailable：認証のサービスの障害
 * - expired：確認コード、メールのリンク、認証の途中の状態の有効期限が切れた
 */
type AuthErrorKind = "invalid-input" | "invalid-credentials" | "network" | "rate-limited" | "service-unavailable" | "expired"

export {
  checkEmailFormat,
  evaluatePasswordRequirements,
  normalizeVerificationCode,
  planReauthentication,
  resolveReturnTo,
  toSafeReturnPath,
}
export type { AuthErrorKind, EmailCheck, PasswordRequirement, ReauthenticationPlan, ReturnToResult, VerificationCodeFormat }
