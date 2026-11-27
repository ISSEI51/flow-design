// Flow Design Auth Flow（Patterns / System & Account / Authentication）
// 認証の画面で共通に使う、ブラウザにも React にも依存しない関数。定義は docs/web/patterns/authentication.md を参照。
// Node（サーバー、ブラウザを使わない検品）からも読み込めるよう、別名（"@/..."）の import を持たない。
//
// この部品が守ること
// - 復帰先（ログインの後に戻る画面）は、安全性を確定できた同じオリジンの相対パスだけを受け付ける。確定できない値は拒否する。
//   値を復号し続けて変わらなくなるまでの各段階（上限の回数まで）を確かめ、外部の URL、プロトコル相対（//host）、スキーム、
//   バックスラッシュ、制御文字、ドットのセグメント、不完全なエンコード、長すぎる値を拒否する。
//   受け付けた場合に返す値は、入力した文字列そのもの（検証した後に別の変換をしない）。
// - 復帰先の閲覧の可否（ワークスペースの所属、権限）は、製品の関数（isAllowed）で必ず確かめる。内部のパスであることだけで受け付けない。
//   isAllowed が true 以外を返した場合、例外を投げた場合は拒否する。既定の画面（fallback）も同じ形の検証をする。
// - メールアドレスは、明らかに入力を誤った場合だけを知らせる（「@」がない、前後が空、空白を含む）。
//   ドメインのドット、文字の種類、長さで有効なアドレスを拒否しない。正当性はバックエンドで確かめる。
// - パスワードは、ログイン（current）と新規の設定（new）で確かめる条件を分ける。ログインでは空かどうかだけを確かめる。
//   パスワードの値を変換しない（前後の空白を取り除かない）。
// - 確認コードは文字列のまま扱う（先頭の 0 を失わない）。既定の整形は区切り（空白、ハイフン）を取り除くだけで、
//   全角の変換、大文字への変換、想定外の文字の削除をしない（製品のコードの意味を変えない）。変換は製品が指定する。
// - 再認証の後に、同じ利用者であることだけで作業を復元しない。製品が現在の認可で確かめた結果から、復元するかを決める。
//
// この部品が持たないもの（製品の責務）
// - 認証そのもの（パスワード、コード、トークンの検証）、試行回数の制限、アカウントの列挙の対策、セッションの管理。
// - パスワードの方針（文字数、文字の種類）。requirements で製品が定義する。
// - 復帰先のワークスペースと権限の判定（isAllowed）。製品に固有の遷移先（任意の URL に移動する内部のエンドポイントなど）の検証。
//   実際の画面の移動（ルーター）。
// - 再認証の後の権限の取得、対象のデータの確認、結果が不明な保存の照会（すべて現在の認可で行う）。

// ---------------------------------------------------------------- 復帰先

/** 復帰先の判定の結果 */
type ReturnToResult =
  | { status: "accepted"; path: string }
  | {
      status: "fallback"
      /** 移動する画面（検証した既定の画面。既定の画面が不正な場合は SAFE_DEFAULT_RETURN_PATH） */
      path: string
      /**
       * missing：指定がない。unsafe：安全性を確定できない（同じオリジンの相対パスと確定できない）。
       * not-allowed：製品の判定（isAllowed）が true を返さなかった。check-failed：製品の判定が例外を投げた、または判定の関数がない
       */
      reason: "missing" | "unsafe" | "not-allowed" | "check-failed"
      /** 渡された既定の画面（fallback）が不正だったため、SAFE_DEFAULT_RETURN_PATH にした */
      invalidFallback?: true
    }

/** 復帰先の検証の条件 */
type ReturnPathOptions = {
  /** 受け付ける値の最大の長さ（文字数）。既定は 2048 */
  maxLength?: number
  /** 復号を繰り返す最大の回数。この回数で値が変わらなくならない場合は拒否する。既定は 4 */
  maxDecodeRounds?: number
}

/** 既定の画面（fallback）が不正な場合に使う、定数の安全なパス */
const SAFE_DEFAULT_RETURN_PATH = "/"
const DEFAULT_MAX_RETURN_TO_LENGTH = 2048
const DEFAULT_MAX_DECODE_ROUNDS = 4

// 判定にだけ使う仮のオリジン。実際の URL には使わない。
const PROBE_ORIGIN = "https://return-to.invalid"

// 制御文字：C0（タブ、改行を含む）、DEL、C1。URL の解析では取り除かれ、「/\t/evil.example」が「//evil.example」になる。
// 加えて、見た目に現れない書式の文字（双方向の制御、ゼロ幅、行と段落の区切り、BOM）も、安全性を確定できないものとして拒否する。
const UNSAFE_CHAR = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/

// ドットのセグメント（「.」「..」）。URL の解析で取り除かれ、値が変わる（「/a/..//evil.example」は「//evil.example」）。
const DOT_SEGMENT = /(^|\/)\.{1,2}(\/|\?|#|$)/

function hasUnsafeShape(value: string) {
  if (UNSAFE_CHAR.test(value)) return true
  // ブラウザはバックスラッシュをスラッシュとして扱う（「/\evil.example」は「//evil.example」）。
  if (value.includes("\\")) return true
  // 同じオリジンの相対パス（/ で始まる）だけ。スキーム（https:、javascript:）、相対のパス（a/b）を拒否する。
  if (!value.startsWith("/")) return true
  // プロトコル相対の URL
  if (value.startsWith("//")) return true
  if (DOT_SEGMENT.test(value)) return true
  // WHATWG URL として解析して、オリジンが変わらないこと
  try {
    if (new URL(value, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return true
  } catch {
    return true
  }
  return false
}

// 1 つの段階の確認。互換の分解（NFKC：全角の「／」「＼」「．」など）で危険な形になる値も拒否する
// （NFKC で正規化してから移動する製品のルーターがあるため）。
const hasUnsafeLayer = (value: string) => hasUnsafeShape(value) || hasUnsafeShape(value.normalize("NFKC"))

/**
 * 復帰先を、安全性を確定できた同じオリジンの相対パス（/ で始まる）の場合だけ返す。確定できなければ null。
 * - 受け付けるのは、WHATWG URL として解析し直しても変わらない値（正規の形）だけ。ドットのセグメント（「/a/../b」）、
 *   エンコードしていない空白や日本語を含む値は、解析で値が変わるため拒否する（製品は encodeURIComponent した値を渡す）。
 * - 製品のルーターが復号してから移動する場合に備え、decodeURIComponent を値が変わらなくなるまで繰り返し、各段階を確かめる。
 *   maxDecodeRounds の回数で変わらなくならない値、復号で例外になる値（「100%」のような不完全なエンコード、
 *   不正な UTF-8 のバイト列）は拒否する。
 * - 返す値は raw と同じ文字列（検証した値そのもの）。検証の後に別の変換をしない。
 */
function toSafeReturnPath(raw: unknown, options: ReturnPathOptions = {}): string | null {
  // 不正な設定値（NaN、負の数、Infinity）は既定値にする（上限なしにしない）
  const maxLength = Number.isFinite(options.maxLength) && options.maxLength! > 0 ? options.maxLength! : DEFAULT_MAX_RETURN_TO_LENGTH
  const maxRounds = Number.isFinite(options.maxDecodeRounds) && options.maxDecodeRounds! >= 0 ? Math.floor(options.maxDecodeRounds!) : DEFAULT_MAX_DECODE_ROUNDS
  if (typeof raw !== "string" || raw.length === 0 || raw.length > maxLength) return null
  if (hasUnsafeLayer(raw)) return null
  // 正規の形：URL として解析し直しても変わらない値だけを受け付ける（検証した値と移動する値を一致させる）
  let canonical: string
  try {
    const url = new URL(raw, PROBE_ORIGIN)
    canonical = `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
  if (canonical !== raw) return null
  // 復号の各段階。製品のルーターが「NFKC で正規化してから復号する」場合にも備え、各段階の値と、その NFKC の値の両方を
  // 復号し続けて確かめる（全角の「％」が NFKC で「%」になり、さらに復号すると「//」になる形を拒否する）。
  return isSafeDecodeChain(raw, Math.min(maxRounds, MAX_DECODE_ROUNDS_LIMIT), new Set()) ? raw : null
}

/** 復号の回数の上限の設定値の最大（大きな値で、確かめる段階の数が増え続けないため） */
const MAX_DECODE_ROUNDS_LIMIT = 16

/**
 * value と、その NFKC の値を、値が変わらなくなるまで復号し続け、どの段階も安全か。rounds の回数で確定しなければ false。
 * 確かめた値は checked に記録し、同じ値を再び確かめない（元の値と NFKC の値の 2 つの経路が、同じ値に合流するため）。
 */
function isSafeDecodeChain(value: string, rounds: number, checked: Set<string>): boolean {
  const key = `${rounds}:${value}`
  if (checked.has(key)) return true
  checked.add(key)
  if (hasUnsafeLayer(value)) return false
  const forms = [...new Set([value, value.normalize("NFKC")])]
  for (const form of forms) {
    let next: string
    try {
      next = decodeURIComponent(form)
    } catch {
      return false
    }
    if (next === form) continue
    // 上限の回数まで復号しても、まだ値が変わる（さらに深いエンコード）：安全性を確定できない
    if (rounds <= 0) return false
    if (!isSafeDecodeChain(next, rounds - 1, checked)) return false
  }
  return true
}

/**
 * ログインの後の移動先を決める。
 * - raw が安全な相対パス（toSafeReturnPath）で、製品の判定（isAllowed：ワークスペースの所属、閲覧権限）が true を返したときだけ、
 *   その画面に戻す。isAllowed に渡す値と、返す path は同じ文字列。
 * - isAllowed は必須。true 以外（false、undefined、"yes" など）は拒否する。例外を投げた場合も拒否する（reason: check-failed）。
 * - それ以外は既定の画面（fallback）。fallback も toSafeReturnPath で確かめ、不正な場合は SAFE_DEFAULT_RETURN_PATH（"/"）にする。
 *   fallback は isAllowed に渡さない（製品は、利用者が常に開ける画面か、開けない場合を自ら扱う画面を渡す）。
 * - 理由（reason）は記録や案内に使い、拒否した値（外部の URL）を画面に表示しない。
 * - 製品に固有の遷移先（任意の URL に移動する内部のエンドポイント、/logout?next= など）が安全かどうかは、この関数では判断できない。
 *   それらは isAllowed で拒否する（製品の責務）。
 */
function resolveReturnTo(
  raw: string | null | undefined,
  { fallback, isAllowed, ...options }: { fallback: string; isAllowed: (path: string) => boolean } & ReturnPathOptions
): ReturnToResult {
  const safeFallback = toSafeReturnPath(fallback, options)
  const fallbackResult = (reason: "missing" | "unsafe" | "not-allowed" | "check-failed"): ReturnToResult =>
    safeFallback === null
      ? { status: "fallback", path: SAFE_DEFAULT_RETURN_PATH, reason, invalidFallback: true }
      : { status: "fallback", path: safeFallback, reason }
  if (raw == null || raw === "") return fallbackResult("missing")
  const path = toSafeReturnPath(raw, options)
  if (path === null) return fallbackResult("unsafe")
  if (typeof isAllowed !== "function") return fallbackResult("check-failed")
  let allowed: unknown
  try {
    allowed = isAllowed(path)
  } catch {
    return fallbackResult("check-failed")
  }
  if (allowed !== true) return fallbackResult("not-allowed")
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

/** 確認コードの整え方。製品のコードの仕様に合わせて、製品が指定する */
type VerificationCodeNormalization = {
  /**
   * 区切りの文字（半角・全角の空白、ハイフンと長音などの横線）を取り除くか。既定は "remove"。
   * 区切りに意味がある製品のコードでは "keep" にする。
   */
  separators?: "remove" | "keep"
  /** 全角の英数字（U+FF01〜FF5E）を半角にするか。既定は "keep"（変えない）。製品がそのコードで同じ意味と決めた場合だけ "convert" */
  fullWidth?: "convert" | "keep"
  /** 英字を大文字にそろえるか。既定は false。大文字・小文字を区別しないコードの場合だけ製品が true にする */
  uppercase?: boolean
  /** @deprecated 整形には使わない（想定外の文字を取り除かない）。形式の確認は checkVerificationCode の format で行う */
  format?: VerificationCodeFormat
}

// 区切りとして扱う文字：空白（半角、全角、タブ）、ハイフンの類（- ‐ ‑ ‒ – — ― − ー －）
const CODE_SEPARATORS = /[\s\u3000\-\u2010-\u2015\u2212\u30fc\uff0d]/g

// 全角の英数字と記号（U+FF01〜FF5E）を半角にする。日本語の入力の状態で入力した「０１２」など。
const toHalfWidth = (s: string) => s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))

/**
 * 確認コードを、比較できる文字列にする。数値に変換しない（先頭の 0 を失わない）。桁数で切り詰めない。
 * 既定では区切り（空白、ハイフン）を取り除くだけで、それ以外の文字（英字、記号、全角の文字）を変えず、取り除かない。
 * 想定外の文字は checkVerificationCode で見つけ、利用者に示す（取り除くと、別のコードとして送信してしまうため）。
 */
function normalizeVerificationCode(
  input: string,
  { separators = "remove", fullWidth = "keep", uppercase = false }: VerificationCodeNormalization = {}
): string {
  let value = fullWidth === "convert" ? toHalfWidth(input) : input
  if (separators === "remove") value = value.replace(CODE_SEPARATORS, "")
  return uppercase ? value.toUpperCase() : value
}

/** 確認コードの送信の前の確認の結果 */
type VerificationCodeCheck =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "unexpected-character" | "too-short" | "too-long"; length: number }

/**
 * 整えた確認コードが、製品の指定した形式と桁数に合うかを確かめる（送信の前）。値は変えない。
 * - format：numeric は半角の数字だけ、alphanumeric は半角の英字と数字だけ。
 * - length：桁数（数、または { min, max }）。省略すると確かめない。桁数を超えた値を切り詰めない。
 */
function checkVerificationCode(
  code: string,
  { format = "numeric", length }: { format?: VerificationCodeFormat; length?: number | { min?: number; max?: number } } = {}
): VerificationCodeCheck {
  const n = code.length
  if (n === 0) return { ok: false, reason: "empty", length: 0 }
  const pattern = format === "numeric" ? /^[0-9]+$/ : /^[0-9A-Za-z]+$/
  if (!pattern.test(code)) return { ok: false, reason: "unexpected-character", length: n }
  const min = typeof length === "number" ? length : length?.min
  const max = typeof length === "number" ? length : length?.max
  if (min !== undefined && n < min) return { ok: false, reason: "too-short", length: n }
  if (max !== undefined && n > max) return { ok: false, reason: "too-long", length: n }
  return { ok: true, value: code }
}

// ---------------------------------------------------------------- パスワード

/** 製品が定義するパスワードの要件。Registry は文字の種類の規則を持たない */
type PasswordRequirement = { id: string; label: string; test: (value: string) => boolean }

/** 要件ごとの達成状態。入力の前から一覧を表示するために、空の値でも呼べる */
function evaluatePasswordRequirements(value: string, requirements: readonly PasswordRequirement[]) {
  const items = requirements.map((r) => ({ id: r.id, label: r.label, met: r.test(value) }))
  return { items, allMet: items.every((i) => i.met) }
}

/** パスワードの欄の用途。current：ログイン（現在のパスワード）、new：新規の設定（新規登録、再設定、変更） */
type PasswordPurpose = "current" | "new"

type PasswordCheck = { ok: true } | { ok: false; reason: "empty" } | { ok: false; reason: "requirements"; unmet: string[] }

/**
 * 送信の前のパスワードの確認。値は変えない（前後の空白も取り除かない。空白を含むパスワードがあるため）。
 * - current（ログイン）：空かどうかだけを確かめる。requirements を渡しても使わない（以前の方針で作ったパスワードでログインできるように）。
 * - new（新規の設定）：空かどうかと、製品の requirements を確かめる。
 */
function checkPasswordInput(
  value: string,
  { purpose, requirements = [] }: { purpose: PasswordPurpose; requirements?: readonly PasswordRequirement[] }
): PasswordCheck {
  if (value === "") return { ok: false, reason: "empty" }
  if (purpose === "current") return { ok: true }
  const { items } = evaluatePasswordRequirements(value, requirements)
  const unmet = items.filter((i) => !i.met).map((i) => i.id)
  return unmet.length === 0 ? { ok: true } : { ok: false, reason: "requirements", unmet }
}

// ---------------------------------------------------------------- 再認証

/** 別の利用者、別のワークスペースになった場合に破棄するもの */
type ReauthDiscardTarget =
  /** 未保存の入力、選択、検索語 */
  | "input"
  /** 前の利用者の認証情報（入力したパスワード、コード、トークン、セッションの情報） */
  | "credentials"
  /** 通知（一覧、件数、Toast） */
  | "notifications"
  /** 取得したデータのキャッシュ */
  | "cache"
  /** 前のセッションで始めた非同期処理の結果 */
  | "async-results"
  /** 結果が不明な保存の記録と内容（新しい利用者・ワークスペースの権限で照会、再送信しない） */
  | "unconfirmed-mutation"

/** 同じ利用者の場合に、製品が現在の認可で確かめる項目 */
type ReauthCheck = "account" | "workspace" | "view-permission" | "edit-permission" | "target" | "unconfirmed-mutation"

const DISCARD_ON_DIFFERENT_USER: readonly ReauthDiscardTarget[] = ["input", "credentials", "notifications", "cache", "async-results", "unconfirmed-mutation"]
const DISCARD_ON_DIFFERENT_WORKSPACE: readonly ReauthDiscardTarget[] = ["input", "notifications", "cache", "async-results", "unconfirmed-mutation"]

/**
 * 再認証の後の扱いの候補（planReauthentication の結果）。この段階では、どの場合も作業を復元しない（restoreWork: false）。
 * 同じ利用者の場合は、製品が checks の項目を現在の認可で確かめ、decideReauthenticationRestore で最終的に決める。
 */
type ReauthenticationPlan =
  | {
      kind: "same-user"
      /** この段階では常に false。decideReauthenticationRestore の restoreWork で決める */
      restoreWork: false
      /** 結果を確かめていない保存などがあり、再送信の前に、現在の認可でサーバーに照会する必要があるか */
      confirmPending: boolean
      discardPreviousUser: false
      discard: readonly ReauthDiscardTarget[]
      /** 復元の前に、製品が現在の認可で確かめる項目 */
      checks: readonly ReauthCheck[]
    }
  | {
      /** 同じ利用者で、別のワークスペース（組織）になった。前の作業をそのまま復元しない */
      kind: "different-workspace"
      restoreWork: false
      confirmPending: false
      discardPreviousUser: false
      discard: readonly ReauthDiscardTarget[]
      checks: readonly ReauthCheck[]
    }
  | {
      kind: "different-user"
      restoreWork: false
      confirmPending: false
      discardPreviousUser: true
      discard: readonly ReauthDiscardTarget[]
      checks: readonly ReauthCheck[]
    }

/**
 * セッションが切れた後の再認証の結果から、扱いの候補を決める。同じ利用者であることだけで作業を復元しない。
 * - 別の利用者（previousUserId が null で、前の利用者がわからない場合を含む）：前の利用者の入力、認証情報、通知、キャッシュ、
 *   非同期処理の結果、結果が不明な保存を破棄する。結果が不明な保存を、新しい利用者の権限で照会したり再送信したりしない。
 * - 同じ利用者で、ワークスペースが変わった：前のワークスペースの入力、通知、キャッシュ、非同期処理の結果、結果が不明な保存を
 *   画面から破棄する（前のワークスペースで照会する場合は、製品がそのワークスペースの現在の認可で行う）。
 *   ワークスペースは、previousWorkspaceId か workspaceId のどちらかを渡した場合に比べる（片方だけの場合は別のワークスペースとして扱う）。
 * - 同じ利用者で、同じワークスペース：候補（restoreWork: false）と、確かめる項目（checks）を返す。
 */
function planReauthentication({
  previousUserId,
  userId,
  hasUnconfirmedMutation,
  ...workspace
}: {
  previousUserId: string | null
  userId: string
  /** 作業を保持したときのワークスペース（組織） */
  previousWorkspaceId?: string | null
  /** 再認証の後のワークスペース（組織） */
  workspaceId?: string | null
  hasUnconfirmedMutation: boolean
  /**
   * @deprecated 使わない（値は結果に影響しない）。同じ利用者の作業の復元は、decideReauthenticationRestore に、
   * 製品が現在の認可で確かめた結果（閲覧、編集、対象、保存の結果）を渡して決める。
   */
  permissionsStillAllow?: boolean
}): ReauthenticationPlan {
  if (previousUserId === null || previousUserId !== userId) {
    return { kind: "different-user", restoreWork: false, confirmPending: false, discardPreviousUser: true, discard: DISCARD_ON_DIFFERENT_USER, checks: [] }
  }
  const compareWorkspace = "previousWorkspaceId" in workspace || "workspaceId" in workspace
  if (compareWorkspace && (workspace.previousWorkspaceId ?? null) !== (workspace.workspaceId ?? null)) {
    return { kind: "different-workspace", restoreWork: false, confirmPending: false, discardPreviousUser: false, discard: DISCARD_ON_DIFFERENT_WORKSPACE, checks: [] }
  }
  const checks: ReauthCheck[] = ["account", "workspace", "view-permission", "edit-permission", "target"]
  if (hasUnconfirmedMutation) checks.push("unconfirmed-mutation")
  return { kind: "same-user", restoreWork: false, confirmPending: hasUnconfirmedMutation, discardPreviousUser: false, discard: [], checks }
}

/** 製品が、再認証の後の現在の認可で確かめた結果。true と確かめた項目だけを true にする（確かめていない項目は false） */
type ReauthVerification = {
  /** 現在のセッションのアカウントが、作業を保持したアカウントと同じ（セッションの情報で確かめた） */
  sameAccount: boolean
  /** 現在のワークスペース（組織）が、作業を保持したワークスペースと同じ */
  sameWorkspace: boolean
  /** 現在の認可で、対象のデータを閲覧できる */
  canView: boolean
  /** 現在の認可で、対象のデータを編集できる */
  canEdit: boolean
  /** 対象のデータ。unchanged：存在し、作業を保持した時点から変わっていない。changed：変わった。missing：ない（削除、移動） */
  target: "unchanged" | "changed" | "missing"
  /**
   * 結果が不明な保存を、現在の認可で照会した結果。applied：保存されていた。not-applied：保存されていなかった。
   * unknown（または省略）：照会できなかった。閲覧できない場合は照会しない
   */
  pendingMutation?: "applied" | "not-applied" | "unknown"
}

/** 復元しない理由 */
type ReauthDecisionReason =
  | "different-user"
  | "different-account"
  | "different-workspace"
  | "no-view-permission"
  | "target-missing"
  | "target-changed"
  | "no-edit-permission"
  | "pending-unresolved"

/** 再認証の後の最終的な扱い */
type ReauthenticationDecision = {
  /** 保持していた未保存の入力を、編集できる状態で復元するか */
  restoreWork: boolean
  /** 対象のデータを表示するか（現在の認可で閲覧できると確かめた場合だけ） */
  showTarget: boolean
  /** 編集を許可するか（現在の認可で編集できると確かめ、未確認の保存が解決した場合だけ） */
  allowEdit: boolean
  /** 破棄するもの */
  discard: readonly ReauthDiscardTarget[]
  /**
   * 結果が不明な保存の扱い。none：ない。applied / not-applied：照会の結果（not-applied でも自動で再送信しない）。
   * unresolved：確かめられていない（再送信しない。照会をやり直す）。discarded：別の利用者・ワークスペースのため破棄した
   */
  pendingMutation: "none" | "applied" | "not-applied" | "unresolved" | "discarded"
  /** 復元しない理由。復元する場合は null */
  reason: ReauthDecisionReason | null
}

/**
 * planReauthentication の候補と、製品が現在の認可で確かめた結果（verification）から、作業を復元するかを決める。
 * 確かめていない項目、true 以外の値は、許可されていないものとして扱う。
 * - アカウントが違う：別の利用者と同じく、すべて破棄する。
 * - ワークスペースが違う：前の作業を復元しない。
 * - 閲覧できない：対象のデータも、保持した入力も表示しない（閲覧の権限を失った情報を復元しない）。保存の結果も照会しない。
 * - 対象がない：入力を破棄する。対象が変わった：入力を自動で復元しない（製品が差分を示すなどして、利用者が判断する）。
 * - 編集できない：対象を読み取り専用で表示し、入力を破棄する。
 * - 結果が不明な保存を照会できていない：編集させず（同じ保存の繰り返しを防ぐ）、照会をやり直す。
 */
function decideReauthenticationRestore(plan: ReauthenticationPlan, verification: ReauthVerification): ReauthenticationDecision {
  if (plan.kind === "different-user") {
    return { restoreWork: false, showTarget: false, allowEdit: false, discard: plan.discard, pendingMutation: "discarded", reason: "different-user" }
  }
  if (plan.kind === "different-workspace") {
    return { restoreWork: false, showTarget: false, allowEdit: false, discard: plan.discard, pendingMutation: "discarded", reason: "different-workspace" }
  }
  const v = verification
  if (v.sameAccount !== true) {
    return { restoreWork: false, showTarget: false, allowEdit: false, discard: DISCARD_ON_DIFFERENT_USER, pendingMutation: "discarded", reason: "different-account" }
  }
  if (v.sameWorkspace !== true) {
    return { restoreWork: false, showTarget: false, allowEdit: false, discard: DISCARD_ON_DIFFERENT_WORKSPACE, pendingMutation: "discarded", reason: "different-workspace" }
  }
  const pending: ReauthenticationDecision["pendingMutation"] = !plan.confirmPending
    ? "none"
    : v.pendingMutation === "applied" || v.pendingMutation === "not-applied"
      ? v.pendingMutation
      : "unresolved"
  if (v.canView !== true) {
    return {
      restoreWork: false,
      showTarget: false,
      allowEdit: false,
      discard: ["input", "cache", "async-results", "unconfirmed-mutation"],
      pendingMutation: plan.confirmPending ? "unresolved" : "none",
      reason: "no-view-permission",
    }
  }
  if (v.target === "missing") {
    return { restoreWork: false, showTarget: false, allowEdit: false, discard: ["input", "cache", "async-results"], pendingMutation: pending, reason: "target-missing" }
  }
  if (v.target !== "unchanged") {
    return { restoreWork: false, showTarget: true, allowEdit: v.canEdit === true && pending !== "unresolved", discard: ["async-results"], pendingMutation: pending, reason: "target-changed" }
  }
  if (v.canEdit !== true) {
    return { restoreWork: false, showTarget: true, allowEdit: false, discard: ["input", "async-results"], pendingMutation: pending, reason: "no-edit-permission" }
  }
  if (pending === "unresolved") {
    return { restoreWork: false, showTarget: true, allowEdit: false, discard: [], pendingMutation: pending, reason: "pending-unresolved" }
  }
  return { restoreWork: true, showTarget: true, allowEdit: true, discard: [], pendingMutation: pending, reason: null }
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
  SAFE_DEFAULT_RETURN_PATH,
  checkEmailFormat,
  checkPasswordInput,
  checkVerificationCode,
  decideReauthenticationRestore,
  evaluatePasswordRequirements,
  normalizeVerificationCode,
  planReauthentication,
  resolveReturnTo,
  toSafeReturnPath,
}
export type {
  AuthErrorKind,
  EmailCheck,
  PasswordCheck,
  PasswordPurpose,
  PasswordRequirement,
  ReauthCheck,
  ReauthDecisionReason,
  ReauthDiscardTarget,
  ReauthenticationDecision,
  ReauthenticationPlan,
  ReauthVerification,
  ReturnPathOptions,
  ReturnToResult,
  VerificationCodeCheck,
  VerificationCodeFormat,
  VerificationCodeNormalization,
}
