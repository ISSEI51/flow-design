import { expect, test } from "@playwright/test"

import {
  checkEmailFormat,
  evaluatePasswordRequirements,
  normalizeVerificationCode,
  planReauthentication,
  resolveReturnTo,
  toSafeReturnPath,
} from "../../registry/patterns/auth-flow"
import { collectPageErrors } from "./page-errors"

// Authentication の純粋な関数（registry/patterns/auth-flow.ts）の検品。ブラウザを使わない。
// 期待値は仕様（docs/web/patterns/authentication.md）から決める：同じオリジンの相対パスだけを復帰先にする、
// 明らかな誤り以外のメールアドレスを拒否しない、コードは文字列で扱い桁数で切らない、別の利用者では作業を破棄する。
collectPageErrors(test)

test.describe("Return-to: only same-origin relative paths", () => {
  test("relative paths are accepted and normalized", () => {
    expect(toSafeReturnPath("/w/hq/customers/C-00012?tab=activity#notes")).toBe("/w/hq/customers/C-00012?tab=activity#notes")
    expect(toSafeReturnPath("/w/hq/../hq/home")).toBe("/w/hq/home")
    expect(toSafeReturnPath("/")).toBe("/")
    // 「%」の後が 16 進数でない（不完全な）形も、有効なパスとして拒否しない
    expect(toSafeReturnPath("/w/hq/customers?q=100%")).toBe("/w/hq/customers?q=100%")
    expect(toSafeReturnPath("/w/hq/customers?q=%E9%9D%92")).toBe("/w/hq/customers?q=%E9%9D%92")
    // 解析の後もプロトコル相対にならないドットのセグメントは受け付ける
    expect(toSafeReturnPath("/w/./hq/home")).toBe("/w/hq/home")
    expect(toSafeReturnPath("/../w/hq/home")).toBe("/w/hq/home")
  })

  const unsafe = [
    "//evil.example",
    "//evil.example/login",
    "///evil.example",
    "https://evil.example/",
    "http:evil.example",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "/\\evil.example",
    "\\\\evil.example",
    "/%2F%2Fevil.example",
    "/%2f%2fevil.example",
    "/%5Cevil.example",
    "/%252F%252Fevil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/%09/evil.example",
    "/%0a/evil.example",
    // ドットのセグメント：URL として解析すると取り除かれ、プロトコル相対の URL になる形
    "/.//evil.example",
    "/a/..//evil.example",
    "/..//evil.example/x",
    "/%2e//evil.example",
    "/%2E%2E//evil.example",
    "/w/hq/../..//evil.example",
    "/././/evil.example",
    "/.%2F/evil.example",
    "/a/%2e%2e%2f%2fevil.example",
    "/a/%252e%252e%252f%252fevil.example",
    "/./\\evil.example",
    " /w/hq/home",
    "w/hq/home",
    "",
  ]
  for (const raw of unsafe) {
    test(`rejected: ${JSON.stringify(raw)}`, () => {
      expect(toSafeReturnPath(raw)).toBeNull()
    })
  }

  test("non-strings and very long values are rejected", () => {
    expect(toSafeReturnPath(null)).toBeNull()
    expect(toSafeReturnPath(undefined)).toBeNull()
    expect(toSafeReturnPath(42)).toBeNull()
    expect(toSafeReturnPath({ toString: () => "/w/hq/home" })).toBeNull()
    expect(toSafeReturnPath(`/${"a".repeat(3000)}`)).toBeNull()
  })

  test("resolveReturnTo: fallback with the reason, and the product check receives the normalized path", () => {
    const seen: string[] = []
    const isAllowed = (p: string) => {
      seen.push(p)
      return p.startsWith("/w/hq/")
    }
    expect(resolveReturnTo("/w/hq/x/../customers", { fallback: "/w/hq/home", isAllowed })).toEqual({ status: "accepted", path: "/w/hq/customers" })
    expect(seen).toEqual(["/w/hq/customers"])
    expect(resolveReturnTo("/w/west/customers", { fallback: "/w/hq/home", isAllowed })).toEqual({ status: "fallback", path: "/w/hq/home", reason: "not-allowed" })
    expect(resolveReturnTo("//evil.example", { fallback: "/w/hq/home", isAllowed })).toEqual({ status: "fallback", path: "/w/hq/home", reason: "unsafe" })
    // isAllowed を渡さない場合も、ドットのセグメントで外部に出る値を受け付けない
    expect(resolveReturnTo("/.//evil.example", { fallback: "/w/hq/home" })).toEqual({ status: "fallback", path: "/w/hq/home", reason: "unsafe" })
    expect(resolveReturnTo(null, { fallback: "/w/hq/home" })).toEqual({ status: "fallback", path: "/w/hq/home", reason: "missing" })
    expect(resolveReturnTo("", { fallback: "/w/hq/home" })).toEqual({ status: "fallback", path: "/w/hq/home", reason: "missing" })
    // 安全でない値は、製品の判定に渡さない
    expect(seen).toEqual(["/w/hq/customers", "/w/west/customers"])
  })
})

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

test.describe("Verification code: a string, separators removed, not truncated", () => {
  test("leading zeros are kept", () => {
    const code = normalizeVerificationCode("012345")
    expect(code).toBe("012345")
    expect(typeof code).toBe("string")
    expect(normalizeVerificationCode("000000")).toBe("000000")
  })

  test("pasted spaces, hyphens and full-width digits are normalized", () => {
    for (const raw of ["012 345", " 012 345 ", "012-345", "012‐345", "012−345", "012ー345", "０１２３４５", "０１２－３４５", "012　345", "コード：012345"]) {
      expect(normalizeVerificationCode(raw), raw).toBe("012345")
    }
  })

  test("the length is not fixed", () => {
    expect(normalizeVerificationCode("01234567")).toBe("01234567")
    expect(normalizeVerificationCode("0123")).toBe("0123")
  })

  test("alphanumeric codes (recovery codes) keep letters; uppercase is optional", () => {
    expect(normalizeVerificationCode("7kq2-m9xd", { format: "alphanumeric", uppercase: true })).toBe("7KQ2M9XD")
    expect(normalizeVerificationCode("7kq2 M9XD", { format: "alphanumeric" })).toBe("7kq2M9XD")
    expect(normalizeVerificationCode("７ＫＱ２－Ｍ９ＸＤ", { format: "alphanumeric" })).toBe("7KQ2M9XD")
  })
})

test.describe("New password requirements are defined by the product", () => {
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
  })
})

test.describe("Reauthentication: same user restores, a different user discards", () => {
  test("same user with permissions: restore and confirm the unconfirmed save", () => {
    expect(planReauthentication({ previousUserId: "u-sato", userId: "u-sato", permissionsStillAllow: true, hasUnconfirmedMutation: true })).toEqual({
      kind: "same-user",
      restoreWork: true,
      confirmPending: true,
      discardPreviousUser: false,
    })
  })

  test("same user without permissions: do not restore the work", () => {
    const plan = planReauthentication({ previousUserId: "u-sato", userId: "u-sato", permissionsStillAllow: false, hasUnconfirmedMutation: false })
    expect(plan).toMatchObject({ kind: "same-user", restoreWork: false, confirmPending: false })
  })

  test("different user: discard everything, never confirm or resend the previous user's save", () => {
    const plan = planReauthentication({ previousUserId: "u-sato", userId: "u-suzuki", permissionsStillAllow: true, hasUnconfirmedMutation: true })
    expect(plan).toEqual({ kind: "different-user", restoreWork: false, confirmPending: false, discardPreviousUser: true })
  })

  test("an unknown previous user is treated as a different user", () => {
    expect(planReauthentication({ previousUserId: null, userId: "u-sato", permissionsStillAllow: true, hasUnconfirmedMutation: false }).kind).toBe("different-user")
  })
})
