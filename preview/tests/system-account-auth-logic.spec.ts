import { expect, test } from "@playwright/test"

import {
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
  type ReauthVerification,
  type ReturnToResult,
} from "../../registry/patterns/auth-flow"
import { collectPageErrors } from "./page-errors"

// Authentication の純粋な関数（registry/patterns/auth-flow.ts）の検品。ブラウザを使わない。
// 期待値は仕様（docs/web/patterns/authentication.md）から決める：安全性を確定できない復帰先を許可しない、
// 明らかな誤り以外のメールアドレスを拒否しない、コードは文字列で扱い意味を変えない、同じ利用者であることだけで作業を復元しない。
collectPageErrors(test)

// ------------------------------------------------------------------ 復帰先
// 製品の判定の例：ワークスペースの所属と、画面ごとの権限（佐藤 花子：本社営業部の管理者・西日本営業部のメンバー、田中 美咲：本社営業部の閲覧者）
const memberOf: Record<string, string[]> = { sato: ["hq", "west"], tanaka: ["hq"] }
const canOpen = (user: "sato" | "tanaka") => (path: string) => {
  const match = /^\/w\/([^/?#]+)(\/[^?#]*)?/.exec(path)
  if (!match || !memberOf[user].includes(match[1])) return false
  if (match[2] === "/settings/billing") return user === "sato" && match[1] === "hq"
  return true
}
const allowAll = () => true
const FALLBACK = "/w/hq/home"

// 6 回エンコードした「/」。復号の上限（既定 4 回）では値が変わり続ける
const deeplyEncodedSlash = `%${"25".repeat(5)}2F`

type Case = {
  category: string
  raw: string | null | undefined
  expected: ReturnToResult
  fallback?: string
  isAllowed?: (path: string) => boolean
  options?: { maxLength?: number; maxDecodeRounds?: number }
}
const accepted = (path: string): ReturnToResult => ({ status: "accepted", path })
const fallbackTo = (reason: "missing" | "unsafe" | "not-allowed" | "check-failed", path = FALLBACK): ReturnToResult => ({ status: "fallback", path, reason })

// 指示書の列挙した入力の種類（3 章「認証後の復帰先」）
const requiredCategories = [
  "通常の内部パス",
  "外部URL",
  "プロトコル相対URL",
  "バックスラッシュ",
  "制御文字",
  "ドットセグメント",
  "多重エンコード",
  "正規化後に外部URLとなる形",
  "不完全なエンコード",
  "長すぎるパス",
  "不正なfallback",
  "権限のない内部ページ",
  "別ワークスペースへの移動",
  "isAllowedが例外を返す場合",
]

const cases: Case[] = [
  // 通常の内部パス：受け付け、検証した文字列をそのまま返す
  { category: "通常の内部パス", raw: "/w/hq/customers/C-00012?tab=activity#notes", expected: accepted("/w/hq/customers/C-00012?tab=activity#notes") },
  { category: "通常の内部パス", raw: "/", expected: accepted("/"), isAllowed: allowAll },
  { category: "通常の内部パス", raw: "/w/hq/customers?q=%E9%9D%92%E5%B1%B1", expected: accepted("/w/hq/customers?q=%E9%9D%92%E5%B1%B1") },
  { category: "通常の内部パス", raw: "/w/hq/customers?q=a%2Bb&sort=name", expected: accepted("/w/hq/customers?q=a%2Bb&sort=name") },
  // 二重にエンコードした安全な値（%25E9 → %E9 → 青）。復号の各段階が安全なため受け付ける
  { category: "通常の内部パス", raw: "/w/hq/customers?q=%25E9%259D%2592", expected: accepted("/w/hq/customers?q=%25E9%259D%2592") },
  { category: "指定なし", raw: null, expected: fallbackTo("missing") },
  { category: "指定なし", raw: undefined, expected: fallbackTo("missing") },
  { category: "指定なし", raw: "", expected: fallbackTo("missing") },

  // 外部URL（スキームを含む）
  { category: "外部URL", raw: "https://evil.example/", expected: fallbackTo("unsafe") },
  { category: "外部URL", raw: "HTTPS://evil.example/", expected: fallbackTo("unsafe") },
  { category: "外部URL", raw: "http:evil.example", expected: fallbackTo("unsafe") },
  { category: "外部URL", raw: "javascript:alert(1)", expected: fallbackTo("unsafe") },
  { category: "外部URL", raw: "JavaScript:alert(1)", expected: fallbackTo("unsafe") },
  { category: "外部URL", raw: "data:text/html,<script>alert(1)</script>", expected: fallbackTo("unsafe") },
  { category: "外部URL", raw: "w/hq/home", expected: fallbackTo("unsafe") },

  // プロトコル相対URL
  { category: "プロトコル相対URL", raw: "//evil.example", expected: fallbackTo("unsafe") },
  { category: "プロトコル相対URL", raw: "//evil.example/login", expected: fallbackTo("unsafe") },
  { category: "プロトコル相対URL", raw: "///evil.example", expected: fallbackTo("unsafe") },

  // バックスラッシュ（ブラウザはスラッシュとして扱う）
  { category: "バックスラッシュ", raw: "/\\evil.example", expected: fallbackTo("unsafe") },
  { category: "バックスラッシュ", raw: "\\\\evil.example", expected: fallbackTo("unsafe") },
  { category: "バックスラッシュ", raw: "/./\\evil.example", expected: fallbackTo("unsafe") },
  { category: "バックスラッシュ", raw: "/w/hq/customers?q=a\\b", expected: fallbackTo("unsafe") },

  // 制御文字（URL の解析で取り除かれる文字、見た目に現れない書式の文字）、前後の空白
  { category: "制御文字", raw: "/\t/evil.example", expected: fallbackTo("unsafe") },
  { category: "制御文字", raw: "/\n/evil.example", expected: fallbackTo("unsafe") },
  { category: "制御文字", raw: "/w/hq\u0000/home", expected: fallbackTo("unsafe") },
  { category: "制御文字", raw: "/w/hq\u007f/home", expected: fallbackTo("unsafe") },
  { category: "制御文字", raw: "/w/hq\u0085/home", expected: fallbackTo("unsafe") },
  { category: "制御文字", raw: "/w/\u202ehq/home", expected: fallbackTo("unsafe") },
  { category: "制御文字", raw: " /w/hq/home", expected: fallbackTo("unsafe") },
  { category: "制御文字", raw: "/w/hq/home ", expected: fallbackTo("unsafe") },

  // ドットのセグメント：正規化（URL の解析）で値が変わるため、検証した値と移動する値が一致しない。拒否する
  { category: "ドットセグメント", raw: "/w/hq/../hq/home", expected: fallbackTo("unsafe") },
  { category: "ドットセグメント", raw: "/w/./hq/home", expected: fallbackTo("unsafe") },
  { category: "ドットセグメント", raw: "/../w/hq/home", expected: fallbackTo("unsafe") },
  { category: "ドットセグメント", raw: "/w/hq/..", expected: fallbackTo("unsafe") },
  { category: "ドットセグメント", raw: "/w/%2e%2e/w/hq/home", expected: fallbackTo("unsafe") },
  { category: "ドットセグメント", raw: "/w/hq/.%2E/x", expected: fallbackTo("unsafe") },

  // 多重エンコード：製品のルーターが復号してから移動する場合の各段階
  { category: "多重エンコード", raw: "/%2F%2Fevil.example", expected: fallbackTo("unsafe") },
  { category: "多重エンコード", raw: "/%2f%2fevil.example", expected: fallbackTo("unsafe") },
  { category: "多重エンコード", raw: "/%252F%252Fevil.example", expected: fallbackTo("unsafe") },
  { category: "多重エンコード", raw: "/%25252F%25252Fevil.example", expected: fallbackTo("unsafe") },
  { category: "多重エンコード", raw: "/%5Cevil.example", expected: fallbackTo("unsafe") },
  { category: "多重エンコード", raw: "/%255Cevil.example", expected: fallbackTo("unsafe") },
  { category: "多重エンコード", raw: "/%09/evil.example", expected: fallbackTo("unsafe") },
  { category: "多重エンコード", raw: "/%2509/evil.example", expected: fallbackTo("unsafe") },
  { category: "多重エンコード", raw: "/%0a/evil.example", expected: fallbackTo("unsafe") },
  // 上限の回数（既定 4 回）で値が変わらなくならない：安全性を確定できない
  { category: "多重エンコード", raw: `/w/hq/a${deeplyEncodedSlash}b`, expected: fallbackTo("unsafe") },
  // 上限を製品が引数で広げた場合は、すべての段階を確かめたうえで受け付ける
  { category: "多重エンコード", raw: `/w/hq/a${deeplyEncodedSlash}b`, expected: accepted(`/w/hq/a${deeplyEncodedSlash}b`), options: { maxDecodeRounds: 8 } },
  // 復号の回数の上限の設定値は 16 に収める（大きな値で、確かめる段階の数が増え続けないため）。17 回のエンコードは確定できない
  { category: "多重エンコード", raw: `/w/hq/a%${"25".repeat(16)}2Fb`, expected: fallbackTo("unsafe"), options: { maxDecodeRounds: 100 } },
  { category: "多重エンコード", raw: `/w/hq/a%${"25".repeat(15)}2Fb`, expected: accepted(`/w/hq/a%${"25".repeat(15)}2Fb`), options: { maxDecodeRounds: 100 } },

  // 正規化（復号、URL の解析、互換の分解）の後に外部の URL になる形
  { category: "正規化後に外部URLとなる形", raw: "/.//evil.example", expected: fallbackTo("unsafe") },
  { category: "正規化後に外部URLとなる形", raw: "/a/..//evil.example", expected: fallbackTo("unsafe") },
  { category: "正規化後に外部URLとなる形", raw: "/..//evil.example/x", expected: fallbackTo("unsafe") },
  { category: "正規化後に外部URLとなる形", raw: "/w/hq/../..//evil.example", expected: fallbackTo("unsafe") },
  { category: "正規化後に外部URLとなる形", raw: "/%2e//evil.example", expected: fallbackTo("unsafe") },
  { category: "正規化後に外部URLとなる形", raw: "/%2E%2E//evil.example", expected: fallbackTo("unsafe") },
  { category: "正規化後に外部URLとなる形", raw: "/.%2F/evil.example", expected: fallbackTo("unsafe") },
  { category: "正規化後に外部URLとなる形", raw: "/a/%2e%2e%2f%2fevil.example", expected: fallbackTo("unsafe") },
  { category: "正規化後に外部URLとなる形", raw: "/a/%252e%252e%252f%252fevil.example", expected: fallbackTo("unsafe") },
  // 全角の「／」（U+FF0F）：NFKC で正規化するルーターでは「//evil.example」になる
  { category: "正規化後に外部URLとなる形", raw: "/%EF%BC%8Fevil.example", expected: fallbackTo("unsafe") },
  // 全角の「％」（U+FF05）と小さい「﹪」（U+FE6A）：復号 → NFKC で「%2F%2F」→ さらに復号すると「//」になる（独立したレビューの指摘）
  { category: "正規化後に外部URLとなる形", raw: "/%EF%BC%852F%EF%BC%852Fevil", expected: fallbackTo("unsafe") },
  { category: "正規化後に外部URLとなる形", raw: "/%EF%B9%AA2F%EF%B9%AA2Fevil", expected: fallbackTo("unsafe") },

  // 不完全なエンコード（decodeURIComponent が失敗する）
  { category: "不完全なエンコード", raw: "/w/hq/customers?q=100%", expected: fallbackTo("unsafe") },
  { category: "不完全なエンコード", raw: "/w/hq/%ZZ", expected: fallbackTo("unsafe") },
  { category: "不完全なエンコード", raw: "/w/hq/%E9", expected: fallbackTo("unsafe") },
  { category: "不完全なエンコード", raw: "/w/%C0%AF", expected: fallbackTo("unsafe") },
  // 1 回の復号の後に不完全になる（2 回目の復号で失敗する）値も、安全性を確定できないため拒否する
  { category: "不完全なエンコード", raw: "/w/hq/customers?q=100%25", expected: fallbackTo("unsafe") },

  // 長すぎるパス（既定の上限は 2048 文字。製品が引数で指定できる）
  { category: "長すぎるパス", raw: `/${"a".repeat(2047)}`, expected: accepted(`/${"a".repeat(2047)}`) },
  { category: "長すぎるパス", raw: `/${"a".repeat(2048)}`, expected: fallbackTo("unsafe") },
  { category: "長すぎるパス", raw: `/${"a".repeat(2048)}`, expected: accepted(`/${"a".repeat(2048)}`), options: { maxLength: 4096 } },
  { category: "長すぎるパス", raw: "/w/hq/customers", expected: fallbackTo("unsafe"), options: { maxLength: 10 } },
  // 不正な上限の設定値は、上限なしにせず既定値にする
  { category: "長すぎるパス", raw: `/${"a".repeat(3000)}`, expected: fallbackTo("unsafe"), options: { maxLength: Number.NaN } },

  // 不正な fallback：同じ検証で拒否し、定数の安全な既定値（"/"）にする
  { category: "不正なfallback", raw: "//evil.example", fallback: "https://evil.example/", expected: { status: "fallback", path: SAFE_DEFAULT_RETURN_PATH, reason: "unsafe", invalidFallback: true } },
  { category: "不正なfallback", raw: null, fallback: "//evil.example", expected: { status: "fallback", path: SAFE_DEFAULT_RETURN_PATH, reason: "missing", invalidFallback: true } },
  { category: "不正なfallback", raw: null, fallback: "", expected: { status: "fallback", path: SAFE_DEFAULT_RETURN_PATH, reason: "missing", invalidFallback: true } },
  { category: "不正なfallback", raw: null, fallback: "/w/hq/../home", expected: { status: "fallback", path: SAFE_DEFAULT_RETURN_PATH, reason: "missing", invalidFallback: true } },
  { category: "不正なfallback", raw: "/w/hq/settings/billing", fallback: "javascript:alert(1)", isAllowed: canOpen("tanaka"), expected: { status: "fallback", path: SAFE_DEFAULT_RETURN_PATH, reason: "not-allowed", invalidFallback: true } },
  // 安全な fallback は受け付けた値のまま使う
  { category: "不正なfallback", raw: null, fallback: "/w/west/home", expected: fallbackTo("missing", "/w/west/home") },

  // 権限のない内部ページ：内部のパスであることだけで受け付けない
  { category: "権限のない内部ページ", raw: "/w/hq/settings/billing", isAllowed: canOpen("tanaka"), expected: fallbackTo("not-allowed") },
  { category: "権限のない内部ページ", raw: "/w/hq/settings/billing", isAllowed: canOpen("sato"), expected: accepted("/w/hq/settings/billing") },
  // true 以外の値（truthy な値を含む）は許可として扱わない
  { category: "権限のない内部ページ", raw: "/w/hq/home", isAllowed: (() => "yes") as unknown as (p: string) => boolean, expected: fallbackTo("not-allowed") },
  { category: "権限のない内部ページ", raw: "/w/hq/home", isAllowed: (() => undefined) as unknown as (p: string) => boolean, expected: fallbackTo("not-allowed") },

  // 別ワークスペースへの移動：所属しているかは製品の isAllowed が判断する
  { category: "別ワークスペースへの移動", raw: "/w/west/customers", isAllowed: canOpen("tanaka"), expected: fallbackTo("not-allowed") },
  { category: "別ワークスペースへの移動", raw: "/w/west/customers", isAllowed: canOpen("sato"), expected: accepted("/w/west/customers") },
  { category: "別ワークスペースへの移動", raw: "/w/unknown/customers", isAllowed: canOpen("sato"), expected: fallbackTo("not-allowed") },

  // isAllowed が例外を投げる場合、判定の関数がない場合は拒否する
  {
    category: "isAllowedが例外を返す場合",
    raw: "/w/hq/customers",
    isAllowed: () => {
      throw new Error("permission service unavailable")
    },
    expected: fallbackTo("check-failed"),
  },
  { category: "isAllowedが例外を返す場合", raw: "/w/hq/customers", isAllowed: undefined as unknown as (p: string) => boolean, expected: fallbackTo("check-failed") },
]

test.describe("Return-to: a path is allowed only when its safety is established", () => {
  test("the table covers every kind of input listed in the specification", () => {
    const covered = new Set(cases.map((c) => c.category))
    for (const category of requiredCategories) expect(covered.has(category), category).toBe(true)
  })

  for (const [i, c] of cases.entries()) {
    test(`${c.category} #${i}: ${JSON.stringify(c.raw)?.slice(0, 80)}${c.fallback !== undefined ? ` (fallback ${JSON.stringify(c.fallback)})` : ""}`, () => {
      const seen: string[] = []
      const product = "isAllowed" in c ? c.isAllowed : allowAll
      const isAllowed =
        typeof product === "function"
          ? (p: string) => {
              seen.push(p)
              return product(p)
            }
          : (product as unknown as (p: string) => boolean)
      const result = resolveReturnTo(c.raw, { fallback: c.fallback ?? FALLBACK, isAllowed, ...c.options })
      expect(result).toEqual(c.expected)
      // 安全性を確定できない値は、製品の判定に渡さない。渡す値と移動する値は、入力した文字列と同じ
      if (c.expected.status === "fallback" && (c.expected.reason === "unsafe" || c.expected.reason === "missing")) expect(seen).toEqual([])
      if (c.expected.status === "accepted") {
        expect(seen).toEqual([c.raw])
        expect(result.path).toBe(c.raw)
        expect(toSafeReturnPath(c.raw, c.options)).toBe(c.raw)
      }
      // 移動先は、どの場合も同じオリジンの相対パス
      const target = new URL(result.path, "https://origin.invalid")
      expect(target.origin).toBe("https://origin.invalid")
    })
  }

  test("non-strings are rejected", () => {
    expect(toSafeReturnPath(null)).toBeNull()
    expect(toSafeReturnPath(undefined)).toBeNull()
    expect(toSafeReturnPath(42)).toBeNull()
    expect(toSafeReturnPath({ toString: () => "/w/hq/home" })).toBeNull()
    expect(toSafeReturnPath(`/${"a".repeat(3000)}`)).toBeNull()
  })

  test("the value passed to isAllowed is the value that is returned, without any later transformation", () => {
    const seen: string[] = []
    const result = resolveReturnTo("/w/hq/customers/C-00012?tab=activity", {
      fallback: FALLBACK,
      isAllowed: (p) => {
        seen.push(p)
        return true
      },
    })
    expect(result).toEqual({ status: "accepted", path: "/w/hq/customers/C-00012?tab=activity" })
    expect(seen).toEqual(["/w/hq/customers/C-00012?tab=activity"])
    // fallback は isAllowed に渡さない
    resolveReturnTo(null, { fallback: FALLBACK, isAllowed: (p) => (seen.push(p), true) })
    expect(seen).toHaveLength(1)
  })
})

// ------------------------------------------------------------------ メールアドレス
test.describe("Email: only obvious mistakes are reported", () => {
  const valid = [
    "hanako.sato@example.com",
    "user+tag@example.com",
    "user@localhost",
    "名前@例え.jp",
    '"john doe"@example.com',
    "o'brien@example.ie",
    "a@b",
  ]
  for (const v of valid) {
    test(`accepted: ${v}`, () => {
      expect(checkEmailFormat(v)).toEqual({ ok: true, value: v })
    })
  }

  test("surrounding spaces (including full-width) are trimmed; case is kept", () => {
    expect(checkEmailFormat(" Hanako.Sato@Example.com　")).toEqual({ ok: true, value: "Hanako.Sato@Example.com" })
  })

  test("obvious mistakes have a specific reason", () => {
    expect(checkEmailFormat("")).toEqual({ ok: false, reason: "empty" })
    expect(checkEmailFormat("   ")).toEqual({ ok: false, reason: "empty" })
    expect(checkEmailFormat("hanako.sato")).toEqual({ ok: false, reason: "missing-at" })
    expect(checkEmailFormat("hanako.sato＠example.com")).toEqual({ ok: false, reason: "fullwidth-at" })
    expect(checkEmailFormat("@example.com")).toEqual({ ok: false, reason: "missing-local" })
    expect(checkEmailFormat("hanako@")).toEqual({ ok: false, reason: "missing-domain" })
    expect(checkEmailFormat("hanako sato@example.com")).toEqual({ ok: false, reason: "space" })
    expect(checkEmailFormat("hanako@exa mple.com")).toEqual({ ok: false, reason: "space" })
  })
})

// ------------------------------------------------------------------ 確認コード
test.describe("Verification code: a string; the default normalization does not change its meaning", () => {
  test("leading zeros are kept", () => {
    const code = normalizeVerificationCode("012345")
    expect(code).toBe("012345")
    expect(typeof code).toBe("string")
    expect(normalizeVerificationCode("000000")).toBe("000000")
  })

  test("pasted spaces and hyphens are removed by default", () => {
    for (const raw of ["012 345", " 012 345 ", "012-345", "012‐345", "012−345", "012ー345", "012　345", "012－345", "012\t345"]) {
      expect(normalizeVerificationCode(raw), raw).toBe("012345")
    }
    // 区切りに意味がある製品のコードでは、取り除かない
    expect(normalizeVerificationCode("012-345", { separators: "keep" })).toBe("012-345")
  })

  test("full-width characters are converted only when the product says so", () => {
    // 既定は変えない（送信の前の確認で、想定外の文字として示す）
    expect(normalizeVerificationCode("０１２３４５")).toBe("０１２３４５")
    expect(checkVerificationCode(normalizeVerificationCode("０１２３４５"))).toEqual({ ok: false, reason: "unexpected-character", length: 6 })
    // 製品が全角の数字を同じ意味と決めた場合
    for (const raw of ["０１２３４５", "０１２－３４５", "０１２　３４５"]) {
      expect(normalizeVerificationCode(raw, { fullWidth: "convert" }), raw).toBe("012345")
    }
  })

  test("unexpected characters are kept and reported, never removed (removing them would send a different code)", () => {
    expect(normalizeVerificationCode("12a456")).toBe("12a456")
    expect(checkVerificationCode("12a456")).toEqual({ ok: false, reason: "unexpected-character", length: 6 })
    // 英字の O（ゼロではない）
    expect(normalizeVerificationCode("O12345")).toBe("O12345")
    expect(checkVerificationCode("O12345").ok).toBe(false)
    // 説明の文字ごとのペースト（「ー」は区切りとして取り除くが、ほかの文字は残す）
    expect(normalizeVerificationCode("コード：012345")).toBe("コド：012345")
    expect(checkVerificationCode(normalizeVerificationCode("コード：012345"))).toMatchObject({ ok: false, reason: "unexpected-character" })
  })

  test("the length is not fixed by the registry and too many digits are not truncated", () => {
    expect(normalizeVerificationCode("01234567")).toBe("01234567")
    expect(normalizeVerificationCode("0123")).toBe("0123")
    // 製品が桁数を指定した場合の確認
    expect(checkVerificationCode("0123456", { length: 6 })).toEqual({ ok: false, reason: "too-long", length: 7 })
    expect(checkVerificationCode("01234", { length: 6 })).toEqual({ ok: false, reason: "too-short", length: 5 })
    expect(checkVerificationCode("012345", { length: 6 })).toEqual({ ok: true, value: "012345" })
    expect(checkVerificationCode("0123456", { length: { min: 6, max: 8 } })).toEqual({ ok: true, value: "0123456" })
    expect(checkVerificationCode("")).toEqual({ ok: false, reason: "empty", length: 0 })
  })

  test("recovery codes: case is kept by default (case-sensitive codes); uppercase only when the product says so", () => {
    expect(normalizeVerificationCode("7Kq2-m9Xd")).toBe("7Kq2m9Xd")
    expect(normalizeVerificationCode("7kq2 M9XD", { format: "alphanumeric" })).toBe("7kq2M9XD")
    expect(normalizeVerificationCode("7kq2-m9xd", { format: "alphanumeric", uppercase: true })).toBe("7KQ2M9XD")
    expect(normalizeVerificationCode("７ＫＱ２－Ｍ９ＸＤ", { format: "alphanumeric", fullWidth: "convert" })).toBe("7KQ2M9XD")
    expect(normalizeVerificationCode("７ｋｑ２－ｍ９ｘｄ", { fullWidth: "convert" })).toBe("7kq2m9xd")
    expect(checkVerificationCode("7Kq2m9Xd", { format: "alphanumeric", length: 8 })).toEqual({ ok: true, value: "7Kq2m9Xd" })
    expect(checkVerificationCode("7Kq2_m9X", { format: "alphanumeric" }).ok).toBe(false)
  })
})

// ------------------------------------------------------------------ パスワード
test.describe("Passwords: sign-in and new passwords are checked differently", () => {
  const requirements = [
    { id: "length", label: "12 文字以上", test: (v: string) => v.length >= 12 },
    { id: "digit", label: "数字を含む", test: (v: string) => /\d/.test(v) },
  ]

  test("every requirement is listed before input, each with its own status", () => {
    expect(evaluatePasswordRequirements("", requirements)).toEqual({
      items: [
        { id: "length", label: "12 文字以上", met: false },
        { id: "digit", label: "数字を含む", met: false },
      ],
      allMet: false,
    })
    expect(evaluatePasswordRequirements("abc1", requirements).items.map((i) => i.met)).toEqual([false, true])
    expect(evaluatePasswordRequirements("abcdefghijk1", requirements).allMet).toBe(true)
  })

  test("the registry imposes no rule of its own", () => {
    expect(evaluatePasswordRequirements("a", []).allMet).toBe(true)
    expect(checkPasswordInput("a", { purpose: "new" })).toEqual({ ok: true })
  })

  test("sign-in (current): only emptiness is checked; requirements are not applied; the value is not trimmed", () => {
    expect(checkPasswordInput("", { purpose: "current" })).toEqual({ ok: false, reason: "empty" })
    expect(checkPasswordInput("abc", { purpose: "current", requirements })).toEqual({ ok: true })
    // 空白だけのパスワードも、空ではない（前後の空白を取り除かない）
    expect(checkPasswordInput("   ", { purpose: "current" })).toEqual({ ok: true })
  })

  test("new password: emptiness and the product's requirements", () => {
    expect(checkPasswordInput("", { purpose: "new", requirements })).toEqual({ ok: false, reason: "empty" })
    expect(checkPasswordInput("abc", { purpose: "new", requirements })).toEqual({ ok: false, reason: "requirements", unmet: ["length", "digit"] })
    expect(checkPasswordInput("abcdefghijkl", { purpose: "new", requirements })).toEqual({ ok: false, reason: "requirements", unmet: ["digit"] })
    expect(checkPasswordInput("abcdefghijk1", { purpose: "new", requirements })).toEqual({ ok: true })
  })
})

// ------------------------------------------------------------------ 再認証
test.describe("Reauthentication: being the same user is not enough to restore work", () => {
  const verified: ReauthVerification = { sameAccount: true, sameWorkspace: true, canView: true, canEdit: true, target: "unchanged" }
  const samePlan = (hasUnconfirmedMutation = false) =>
    planReauthentication({ previousUserId: "u-sato", userId: "u-sato", previousWorkspaceId: "hq", workspaceId: "hq", hasUnconfirmedMutation })

  test("same user: the plan is only a candidate; restoreWork is false until the product verifies the current authorization", () => {
    const plan = samePlan(true)
    expect(plan).toMatchObject({ kind: "same-user", restoreWork: false, confirmPending: true, discardPreviousUser: false })
    expect(plan.checks).toEqual(["account", "workspace", "view-permission", "edit-permission", "target", "unconfirmed-mutation"])
    // 以前の引数（permissionsStillAllow）は結果に影響しない
    expect(planReauthentication({ previousUserId: "u-sato", userId: "u-sato", permissionsStillAllow: true, hasUnconfirmedMutation: false }).restoreWork).toBe(false)
  })

  test("same user, everything verified: restore the work", () => {
    expect(decideReauthenticationRestore(samePlan(), verified)).toEqual({ restoreWork: true, showTarget: true, allowEdit: true, discard: [], pendingMutation: "none", reason: null })
  })

  test("the unconfirmed save is resolved only by a query made with the current authorization; it is never resent", () => {
    expect(decideReauthenticationRestore(samePlan(true), { ...verified, pendingMutation: "applied" })).toMatchObject({ restoreWork: true, pendingMutation: "applied" })
    expect(decideReauthenticationRestore(samePlan(true), { ...verified, pendingMutation: "not-applied" })).toMatchObject({ restoreWork: true, pendingMutation: "not-applied" })
    // 照会できていない：編集させない（同じ保存の繰り返しを防ぐ）
    for (const pendingMutation of ["unknown", undefined] as const) {
      expect(decideReauthenticationRestore(samePlan(true), { ...verified, pendingMutation })).toEqual({
        restoreWork: false,
        showTarget: true,
        allowEdit: false,
        discard: [],
        pendingMutation: "unresolved",
        reason: "pending-unresolved",
      })
    }
  })

  test("same user in another organization: the previous work is not restored", () => {
    const plan = planReauthentication({ previousUserId: "u-sato", userId: "u-sato", previousWorkspaceId: "hq", workspaceId: "west", hasUnconfirmedMutation: true })
    expect(plan).toMatchObject({ kind: "different-workspace", restoreWork: false, confirmPending: false })
    expect(plan.discard).toEqual(["input", "notifications", "cache", "async-results", "unconfirmed-mutation"])
    expect(decideReauthenticationRestore(plan, verified)).toMatchObject({ restoreWork: false, showTarget: false, pendingMutation: "discarded", reason: "different-workspace" })
    // 片方のワークスペースだけを渡した場合は、同じと確かめられないため別のワークスペースとして扱う
    expect(planReauthentication({ previousUserId: "u-sato", userId: "u-sato", previousWorkspaceId: "hq", hasUnconfirmedMutation: false }).kind).toBe("different-workspace")
    // 製品が確かめた結果でワークスペースが違う場合も復元しない
    expect(decideReauthenticationRestore(samePlan(), { ...verified, sameWorkspace: false })).toMatchObject({ restoreWork: false, showTarget: false, reason: "different-workspace" })
  })

  test("lost the view permission: neither the target nor the held input is shown, and the save result is not queried", () => {
    const decision = decideReauthenticationRestore(samePlan(true), { ...verified, canView: false, canEdit: false, pendingMutation: "applied" })
    expect(decision).toEqual({
      restoreWork: false,
      showTarget: false,
      allowEdit: false,
      discard: ["input", "cache", "async-results", "unconfirmed-mutation"],
      pendingMutation: "unresolved",
      reason: "no-view-permission",
    })
  })

  test("lost the edit permission: shown read-only; the held input is discarded", () => {
    expect(decideReauthenticationRestore(samePlan(), { ...verified, canEdit: false })).toEqual({
      restoreWork: false,
      showTarget: true,
      allowEdit: false,
      discard: ["input", "async-results"],
      pendingMutation: "none",
      reason: "no-edit-permission",
    })
  })

  test("the target was deleted or changed: the input is not restored automatically", () => {
    expect(decideReauthenticationRestore(samePlan(), { ...verified, target: "missing" })).toMatchObject({ restoreWork: false, showTarget: false, reason: "target-missing" })
    expect(decideReauthenticationRestore(samePlan(), { ...verified, target: "changed" })).toMatchObject({ restoreWork: false, showTarget: true, reason: "target-changed" })
  })

  test("a different account in the verification is treated like a different user", () => {
    expect(decideReauthenticationRestore(samePlan(true), { ...verified, sameAccount: false })).toEqual({
      restoreWork: false,
      showTarget: false,
      allowEdit: false,
      discard: ["input", "credentials", "notifications", "cache", "async-results", "unconfirmed-mutation"],
      pendingMutation: "discarded",
      reason: "different-account",
    })
  })

  test("unchecked or non-boolean values are not treated as allowed", () => {
    const loose = { sameAccount: true, sameWorkspace: true, canView: "yes", canEdit: 1, target: "unchanged" } as unknown as ReauthVerification
    expect(decideReauthenticationRestore(samePlan(), loose)).toMatchObject({ restoreWork: false, showTarget: false, reason: "no-view-permission" })
    expect(decideReauthenticationRestore(samePlan(), {} as ReauthVerification)).toMatchObject({ restoreWork: false, showTarget: false })
  })

  test("different user: discard input, credentials, notifications, cache and async results; never query or resend the previous user's save", () => {
    const plan = planReauthentication({ previousUserId: "u-sato", userId: "u-suzuki", permissionsStillAllow: true, hasUnconfirmedMutation: true })
    expect(plan).toEqual({
      kind: "different-user",
      restoreWork: false,
      confirmPending: false,
      discardPreviousUser: true,
      discard: ["input", "credentials", "notifications", "cache", "async-results", "unconfirmed-mutation"],
      checks: [],
    })
    expect(decideReauthenticationRestore(plan, verified)).toMatchObject({ restoreWork: false, showTarget: false, pendingMutation: "discarded", reason: "different-user" })
  })

  test("an unknown previous user is treated as a different user", () => {
    expect(planReauthentication({ previousUserId: null, userId: "u-sato", hasUnconfirmedMutation: false }).kind).toBe("different-user")
  })
})
