import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode, type RefObject } from "react"
import { Check, Circle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldOptionalMark, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { MinimalShell } from "@/patterns/app-shell"
import { AuthFormError, AuthStatus, type AuthFormErrorValue } from "@/patterns/auth-feedback"
import {
  checkEmailFormat,
  checkPasswordInput,
  checkVerificationCode,
  evaluatePasswordRequirements,
  resolveReturnTo,
  type AuthErrorKind,
  type PasswordRequirement,
  type ReturnToResult,
  type VerificationCodeFormat,
} from "@/patterns/auth-flow"
import { AuthLayout, type AuthLayoutVariant } from "@/patterns/auth-layout"
import { PasswordInput } from "@/patterns/password-input"
import { useScopeGuard, type ScopeTicket } from "@/patterns/scope-guard"
import { VerificationCodeInput } from "@/patterns/verification-code-input"

import {
  authServer,
  canOpenPath,
  getMailVersion,
  homePathOf,
  passwordMinLength,
  subscribeMail,
  type AuthApi,
  type AuthOrg,
  type MfaChallenge,
  type MfaMethod,
  type SentEmail,
  type SignInResult,
} from "../../data/system-account/auth-server"
import { MockRequestError, isAbortError } from "../../data/system-account/mock"
import { orgNameOf, orgPolicyOf } from "../../data/system-account/settings-server"
import { ProductMark } from "../app-structure/structure-sidebar"

// Authentication の画面の部品（プレビュー）。資料のページと、統合の検証画面（account-app.tsx）で使う。
// 認証の処理は props の api（模擬のサーバー auth-server.ts の authApi と同じ形）で受け取り、結果はコールバックで返す。
// 画面の移動（ルーター）は持たない。どの画面を表示するかは、呼び出し側が決める。
// 入力されたパスワードとコードは、この部品の state（メモリ）だけに置き、記録、URL、ストレージに書かない。

// ---------------------------------------------------------------- 共通

/** 製品のロゴ（製品名を含む） */
export function ProductLogo() {
  return (
    <span className="flex items-center gap-3 text-ui font-semibold">
      <ProductMark />
      Flow 営業管理
    </span>
  )
}

const defaultAside = (
  <>
    <p className="text-section [word-break:auto-phrase]">顧客との約束を、チームで守る。</p>
    <p className="text-body text-muted-foreground [word-break:auto-phrase]">商談、契約、更新の予定を、チームの全員が同じ画面で確かめられます。</p>
  </>
)

/** 画面の配置の共通の props */
export type AuthScreenLayout = {
  /** minimal（既定）、card、split */
  layout?: AuthLayoutVariant
  /** 見出しの階層。全画面（Minimal Shell）では 1 */
  headingLevel?: 1 | 2 | 3
  /** split の横の面 */
  aside?: ReactNode
}

/** 統合の検証画面で使う、Minimal Shell の全画面。中身に認証の画面（AuthLayout を使う部品）を置く */
export function AuthShell({ children }: { children: ReactNode }) {
  return <MinimalShell>{children}</MinimalShell>
}

/** 認証の後の移動先。復帰先が安全で、この利用者が開ける画面の場合だけ、その画面に戻す */
export function destinationFor(userId: string, returnTo: string | null | undefined): ReturnToResult {
  return resolveReturnTo(returnTo, { fallback: homePathOf(userId), isAllowed: (path) => canOpenPath(userId, path) })
}

/** 組織のポリシーと製品の構成から、ログインの方式を決める（製品の判断の例） */
export type SignInMethods = {
  password: boolean
  providers: ("google" | "microsoft")[]
  passkey: boolean
  sso: boolean
  magicLink: boolean
}

export function signInMethodsFor(org: AuthOrg, product: "password" | "magic-link" = "password"): SignInMethods {
  const policy = orgPolicyOf(org)
  if (policy.requireSso) return { password: false, providers: [], passkey: false, sso: true, magicLink: false }
  if (product === "magic-link") return { password: false, providers: [], passkey: false, sso: false, magicLink: true }
  return { password: true, providers: policy.allowSocialLogin ? ["google", "microsoft"] : [], passkey: true, sso: false, magicLink: false }
}

const providerLabels = { google: "Google でログイン", microsoft: "Microsoft でログイン" } as const

// 非同期の操作（プレビューの例）。
// - 同じキー（"verify"、"send" など）の操作は、同じスコープで 1 つだけ実行する（ref の Ticket で同期的に判定し、二重に送信しない）。
// - scope は、結果を反映してよい範囲（多要素認証では、確認の ID、方式、送信したコードの世代）。scope が変わったら、前の scope の
//   操作の結果を反映しない（方式の変更の後の古い応答、再送信の後の古い確認の結果）。前の scope の実行中の操作は、新しい scope の操作を止めない。
// - アンマウントの後の結果を反映しない。AbortSignal に従わない応答も反映しない（useScopeGuard の isLatest で照合する）。
function useAuthAction(scope = "auth-screen") {
  const guard = useScopeGuard(scope)
  const running = useRef(new Map<string, ScopeTicket>())
  const [tickets, setTickets] = useState<readonly ScopeTicket[]>([])
  const run = <T,>(key: string, task: (signal: AbortSignal) => Promise<T>, done: (value: T) => void, fail: (error: unknown) => void) => {
    const current = running.current.get(key)
    if (current && guard.isSameScope(current)) return false
    const ticket = guard.begin(key)
    running.current.set(key, ticket)
    setTickets((list) => [...list.filter((t) => t.key !== key), ticket])
    task(ticket.signal)
      .then(
        (value) => {
          if (guard.isLatest(ticket)) done(value)
        },
        (error) => {
          if (!isAbortError(error) && guard.isLatest(ticket)) fail(error)
        }
      )
      .finally(() => {
        if (running.current.get(key) === ticket) running.current.delete(key)
        setTickets((list) => list.filter((t) => t !== ticket))
        // 最後の照合（isLatest）の後に、キーの記録を消す
        guard.release(ticket)
      })
    return true
  }
  // 現在のスコープで実行中の操作だけを「実行中」として示す（前のスコープの操作で Loading を続けない）
  const isPending = (key: string) => tickets.some((t) => t.key === key && guard.isSameScope(t))
  const pending = tickets.find((t) => guard.isSameScope(t))?.key ?? null
  return { run, pending, isPending }
}

let errorSeq = 0
const codeOf = (error: unknown) => (error instanceof MockRequestError ? error.code : "network")
const extra = <K extends string>(error: unknown, key: K) => (error as Partial<Record<K, number>>)[key]

/** API のエラーを、認証のエラーの種類に対応させる（製品の責務の例） */
function kindOf(code: string): AuthErrorKind {
  switch (code) {
    case "invalid-credentials":
    case "invalid-code":
    case "provider-not-allowed":
    case "sso-required":
      return "invalid-credentials"
    case "rate-limited":
      return "rate-limited"
    case "service-unavailable":
      return "service-unavailable"
    case "code-expired":
    case "challenge-expired":
    case "invalid-link":
      return "expired"
    default:
      return "network"
  }
}

function formError(error: unknown, overrides: Partial<Omit<AuthFormErrorValue, "id">> = {}): AuthFormErrorValue {
  const code = codeOf(error)
  const value: AuthFormErrorValue = { id: ++errorSeq, kind: kindOf(code), ...overrides }
  if (code === "provider-not-allowed") value.title ??= "この組織では、外部アカウントでログインできません"
  if (code === "sso-required") value.title ??= "この組織では、組織の SSO でログインします"
  if (code === "mail-failed") {
    value.title ??= "メールを送信できませんでした"
    value.description ??= "時間をおいて、もう一度お試しください。"
  }
  return value
}

// 読み上げ。フォーカスが外れたときの入力の誤りを、フォームに 1 つ置いた領域で知らせる（forms.md の「エラーの読み上げ」）。
function useAnnouncer() {
  const [message, setMessage] = useState("")
  const node = (
    <p className="sr-only" aria-live="polite">
      {message}
    </p>
  )
  const announce = (text: string) => {
    setMessage("")
    requestAnimationFrame(() => setMessage(text))
  }
  return [node, announce] as const
}

// 秒数の残り。描画の中で時刻を読まない（Hydration で不一致にしない）。
function useCountdown(until: number | null) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (until === null) {
      setLeft(0)
      return
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [until])
  return left
}

// ---------------------------------------------------------------- メールアドレスの入力
const emailMessages = {
  empty: "メールアドレスを入力してください",
  "missing-at": "「@」を含めて入力してください（例：hanako.sato@example.com）",
  "fullwidth-at": "全角の「＠」を、半角の「@」にしてください",
  "missing-local": "「@」の前の部分を入力してください（例：hanako.sato@example.com）",
  "missing-domain": "「@」の後にドメイン名を入力してください（例：example.com）",
  space: "空白を取り除いてください",
} as const

/** メールアドレスの入力の誤り（明らかな誤りだけ）。正しければ null */
export function emailErrorOf(value: string) {
  const result = checkEmailFormat(value)
  return result.ok ? null : emailMessages[result.reason]
}

function EmailField({
  label = "メールアドレス",
  value,
  onValueChange,
  error,
  onErrorChange,
  announce,
  autoComplete = "username",
  readOnly,
  description,
  inputRef,
  testId,
}: {
  label?: string
  value: string
  onValueChange: (value: string) => void
  error: string | null | undefined
  onErrorChange: (error: string | null) => void
  announce: (text: string) => void
  autoComplete?: "username" | "email"
  readOnly?: boolean
  description?: ReactNode
  inputRef?: RefObject<HTMLInputElement | null>
  testId?: string
}) {
  // 一度でも入力したか。何も入力せずにフォーカスが通り過ぎただけでは、誤りを示さない。
  const dirty = useRef(false)
  return (
    <Field invalid={!!error}>
      <FieldLabel>{label}</FieldLabel>
      <Input
        ref={inputRef}
        // type="email" はモバイルのキーボードのため。ブラウザの形式の検証は使わない（form の noValidate）。
        type="email"
        name="email"
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
        readOnly={readOnly}
        value={value}
        data-testid={testId}
        onChange={(e) => {
          dirty.current = true
          onValueChange(e.target.value)
          // 誤りを表示している間だけ、入力ごとに確かめ直す。IME の変換中は確かめない。
          if (error && !(e.nativeEvent as InputEvent).isComposing) onErrorChange(emailErrorOf(e.target.value))
        }}
        onCompositionEnd={(e) => {
          if (error) onErrorChange(emailErrorOf(e.currentTarget.value))
        }}
        onBlur={(e) => {
          if (readOnly || (!dirty.current && !error)) return
          const message = emailErrorOf(e.currentTarget.value)
          if (message && message !== error) announce(message)
          onErrorChange(message)
        }}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

// ---------------------------------------------------------------- 新しいパスワードの要件
/** 製品のパスワードの方針の例。Registry は規則を持たず、製品が定義する */
export function passwordRequirementsFor(email: string): PasswordRequirement[] {
  const local = email.split("@")[0]?.trim().toLowerCase() ?? ""
  return [
    { id: "length", label: `${passwordMinLength} 文字以上`, test: (v) => v.length >= passwordMinLength },
    {
      id: "not-email",
      label: "メールアドレスの「@」の前の部分を含めない",
      test: (v) => v.length > 0 && (local.length < 3 || !v.toLowerCase().includes(local)),
    },
  ]
}

function NewPasswordField({
  label,
  value,
  onValueChange,
  email,
  error,
  inputRef,
  testId,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  email: string
  error: string | null | undefined
  inputRef?: RefObject<HTMLInputElement | null>
  testId?: string
}) {
  const { items } = evaluatePasswordRequirements(value, passwordRequirementsFor(email))
  return (
    <Field invalid={!!error}>
      <FieldLabel>{label}</FieldLabel>
      <PasswordInput ref={inputRef} name="new-password" autoComplete="new-password" value={value} onChange={(e) => onValueChange(e.target.value)} required data-testid={testId} />
      {/* 要件は入力の前から示す。達成の状態は文字（「達成」）でも伝え、色とアイコンだけにしない */}
      <FieldDescription render={<div />}>
        <ul className="flex flex-col gap-1" data-testid={testId ? `${testId}-requirements` : undefined}>
          {items.map((item) => (
            <li key={item.id} data-met={item.met || undefined} className="flex items-center gap-2 data-met:text-foreground">
              {item.met ? <Check aria-hidden="true" className="size-4 text-success" /> : <Circle aria-hidden="true" className="size-4" />}
              <span>
                {item.label}
                <span className="sr-only">{item.met ? "（達成）" : "（未達成）"}</span>
              </span>
            </li>
          ))}
        </ul>
      </FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

const linkButton = "min-h-10 self-start"

// ---------------------------------------------------------------- ログイン
export type SignInStep = "credentials" | "mfa" | "magic-link-sent"

export type SignInScreenProps = AuthScreenLayout & {
  api: AuthApi
  /** ログインのページの組織（組織のポリシーで方式を決める） */
  org: AuthOrg
  /** 方式。省略すると signInMethodsFor(org) */
  methods?: SignInMethods
  /** ログインの後に戻る画面（未検証の値。destinationFor で検証する） */
  returnTo?: string | null
  /** 認証が完了した（追加の確認を含む）。destination は検証した移動先 */
  onAuthenticated: (userId: string, destination: ReturnToResult) => void
  onForgotPassword?: (email: string) => void
  onSignUp?: () => void
  /** Magic Link を送信した（模擬の受信箱を表示するため） */
  onMagicLinkSent?: (email: string) => void
  onStepChange?: (step: SignInStep) => void
  initialEmail?: string
  /** 再認証：メールアドレスを固定する（「別のアカウントでログイン」で解除できる） */
  lockedEmail?: string
  title?: ReactNode
  description?: ReactNode
  /** 前の画面からの知らせ（「パスワードを変更しました」など） */
  status?: ReactNode
  testId?: string
}

export function SignInScreen({
  api,
  org,
  methods: methodsProp,
  returnTo = null,
  onAuthenticated,
  onForgotPassword,
  onSignUp,
  onMagicLinkSent,
  onStepChange,
  initialEmail = "",
  lockedEmail,
  title,
  description,
  status,
  layout = "minimal",
  headingLevel = 1,
  aside = defaultAside,
  testId = "auth-sign-in",
}: SignInScreenProps) {
  const methods = methodsProp ?? signInMethodsFor(org)
  const [step, setStep] = useState<{ kind: "credentials" } | { kind: "mfa"; challenge: MfaChallenge } | { kind: "magic-link-sent"; email: string }>({
    kind: "credentials",
  })
  const [email, setEmail] = useState(lockedEmail ?? initialEmail)
  const [emailLocked, setEmailLocked] = useState(!!lockedEmail)
  const [password, setPassword] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [error, setError] = useState<AuthFormErrorValue | null>(null)
  const { run, pending } = useAuthAction()
  const [announcer, announce] = useAnnouncer()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const go = (next: typeof step) => {
    setStep(next)
    onStepChange?.(next.kind)
  }

  const finish = (result: SignInResult) => {
    if (result.kind === "authenticated") {
      onAuthenticated(result.userId, destinationFor(result.userId, returnTo))
      return
    }
    // 最初の要素の確認が済んだら、パスワードをメモリに残さない。追加の確認では、もう一度入力させない。
    setPassword("")
    go({ kind: "mfa", challenge: result.challenge })
  }

  const forgotAction = onForgotPassword ? (
    <Button type="button" variant="link" size="sm" className={linkButton} onClick={() => onForgotPassword(email.trim())}>
      パスワードを再設定する
    </Button>
  ) : undefined

  const onPasswordSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    // 必要な入力が揃うまで、要求を送らない。ログインのパスワードには、新規の設定の規則を適用しない。
    const emailMessage = emailErrorOf(email)
    // purpose: "current"：空かどうかだけを確かめる（強度の規則を適用しない。値を変換しない）
    const passwordMessage = checkPasswordInput(password, { purpose: "current" }).ok ? null : "パスワードを入力してください"
    setEmailError(emailMessage)
    setPasswordError(passwordMessage)
    if (emailMessage || passwordMessage) {
      ;(emailMessage ? emailRef : passwordRef).current?.focus()
      return
    }
    run(
      "password",
      (signal) => api.signInWithPassword({ org, email: email.trim(), password }, { signal }),
      finish,
      (err) =>
        setError(
          formError(err, {
            action: codeOf(err) === "invalid-credentials" || codeOf(err) === "rate-limited" ? forgotAction : undefined,
          })
        )
    )
  }

  const provider = (p: "google" | "microsoft" | "passkey" | "sso") =>
    run(p, (signal) => api.signInWithProvider({ org, provider: p }, { signal }), finish, (err) => setError(formError(err)))

  const onMagicSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    const message = emailErrorOf(email)
    setEmailError(message)
    if (message) {
      emailRef.current?.focus()
      return
    }
    const to = email.trim()
    run(
      "magic-link",
      (signal) => api.sendMagicLink({ email: to }, { signal }),
      () => {
        setError(null)
        go({ kind: "magic-link-sent", email: to })
        onMagicLinkSent?.(to)
      },
      (err) => setError(formError(err))
    )
  }

  if (step.kind === "mfa") {
    return (
      <MfaScreen
        api={api}
        challenge={step.challenge}
        onAuthenticated={(userId) => onAuthenticated(userId, destinationFor(userId, returnTo))}
        onCancel={() => go({ kind: "credentials" })}
        layout={layout}
        headingLevel={headingLevel}
        aside={aside}
        testId={`${testId}-mfa`}
      />
    )
  }

  if (step.kind === "magic-link-sent") {
    return (
      <AuthLayout
        variant={layout}
        logo={<ProductLogo />}
        headingLevel={headingLevel}
        aside={aside}
        title="メールを確認してください"
        description={
          <>
            <span className="font-medium text-foreground [word-break:break-all]">{step.email}</span>{" "}
            がアカウントに登録されている場合は、ログイン用のリンクを送信しました。リンクを開くと、ログインできます。
          </>
        }
        data-testid={`${testId}-magic-sent`}
      >
        <Button type="button" variant="outline" className="w-full" onClick={() => go({ kind: "credentials" })}>
          別のメールアドレスを使う
        </Button>
      </AuthLayout>
    )
  }

  const orgName = orgNameOf(org)
  const anyAlternative = methods.passkey || methods.providers.length > 0
  return (
    <AuthLayout
      variant={layout}
      logo={<ProductLogo />}
      headingLevel={headingLevel}
      aside={aside}
      title={title ?? "ログイン"}
      description={description ?? (methods.sso ? `${orgName}では、組織のアカウントでログインします。` : undefined)}
      footer={
        onSignUp && !lockedEmail ? (
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-muted-foreground">
            アカウントをお持ちでない場合
            <Button type="button" variant="link" size="sm" onClick={onSignUp}>
              アカウントを作成
            </Button>
          </p>
        ) : undefined
      }
      data-testid={testId}
      data-step={step.kind}
    >
      <div className="flex flex-col gap-6">
        <AuthStatus data-testid={`${testId}-status`}>{status}</AuthStatus>
        <AuthFormError error={error} data-testid={`${testId}-error`} />
        {announcer}

        {methods.sso && (
          <Button className="w-full" loading={pending === "sso"} onClick={() => provider("sso")} data-testid={`${testId}-sso`}>
            組織の SSO でログイン
          </Button>
        )}

        {methods.magicLink && (
          <form noValidate onSubmit={onMagicSubmit} className="flex flex-col gap-6">
            <EmailField
              value={email}
              onValueChange={setEmail}
              error={emailError}
              onErrorChange={setEmailError}
              announce={announce}
              inputRef={emailRef}
              testId={`${testId}-email`}
              description="パスワードは使いません。メールで届くリンクからログインします。"
            />
            <Button type="submit" className="w-full" loading={pending === "magic-link"} data-testid={`${testId}-submit`}>
              ログイン用のリンクを送る
            </Button>
          </form>
        )}

        {methods.password && (
          <form noValidate onSubmit={onPasswordSubmit} className="flex flex-col gap-6" data-testid={`${testId}-form`}>
            <FieldGroup>
              <EmailField
                value={email}
                onValueChange={setEmail}
                error={emailError}
                onErrorChange={setEmailError}
                announce={announce}
                readOnly={emailLocked}
                inputRef={emailRef}
                testId={`${testId}-email`}
              />
              {emailLocked && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className={linkButton}
                  onClick={() => {
                    setEmailLocked(false)
                    setEmail("")
                    setPassword("")
                    // このボタンは消えるため、フォーカスをメールアドレスへ移す。次の描画までに利用者が別の入力欄へ
                    // 移った場合は、そのフォーカスを奪わない（フォーカスが body に落ちている場合だけ移す）
                    requestAnimationFrame(() => {
                      const active = document.activeElement
                      if (!active || active === document.body) emailRef.current?.focus()
                    })
                  }}
                  data-testid={`${testId}-switch-account`}
                >
                  別のアカウントでログイン
                </Button>
              )}
              <Field invalid={!!passwordError}>
                <FieldLabel>パスワード</FieldLabel>
                <PasswordInput
                  ref={passwordRef}
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (passwordError && e.target.value !== "") setPasswordError(null)
                  }}
                  data-testid={`${testId}-password`}
                />
                {passwordError && <FieldError>{passwordError}</FieldError>}
              </Field>
              {onForgotPassword && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className={linkButton}
                  onClick={() => onForgotPassword(email.trim())}
                  data-testid={`${testId}-forgot`}
                >
                  パスワードを忘れた場合
                </Button>
              )}
            </FieldGroup>
            <Button type="submit" className="w-full" loading={pending === "password"} data-testid={`${testId}-submit`}>
              ログイン
            </Button>
          </form>
        )}

        {methods.password && anyAlternative && <FieldSeparator>または</FieldSeparator>}
        {anyAlternative && (
          <div className="flex flex-col gap-3">
            {methods.passkey && (
              <Button variant="outline" className="w-full" loading={pending === "passkey"} onClick={() => provider("passkey")} data-testid={`${testId}-passkey`}>
                Passkey でログイン
              </Button>
            )}
            {methods.providers.map((p) => (
              <Button key={p} variant="outline" className="w-full" loading={pending === p} onClick={() => provider(p)} data-testid={`${testId}-${p}`}>
                {providerLabels[p]}
              </Button>
            ))}
          </div>
        )}
      </div>
    </AuthLayout>
  )
}

// ---------------------------------------------------------------- 多要素認証
const methodCopy: Record<MfaMethod, { label: string; choose: string }> = {
  totp: { label: "確認コード", choose: "認証アプリのコードを使う" },
  sms: { label: "確認コード", choose: "SMS でコードを受け取る" },
  "recovery-code": { label: "リカバリーコード", choose: "リカバリーコードを使う" },
}

/**
 * 確認コードの扱い（製品の指定の例）。Registry の既定は区切りを取り除くだけで、全角の変換と大文字への変換をしない。
 * この製品では、確認コードとリカバリーコードの全角の英数字を半角と同じ意味として扱う。リカバリーコードの大文字・小文字を
 * 区別するかは、製品の設定（recoveryCaseSensitive）で決める。
 */
type CodePolicy = { format: VerificationCodeFormat; length: number; uppercase: boolean; fullWidth: "convert" | "keep"; unit: string }

function codePolicyFor(method: MfaMethod, challenge: MfaChallenge, recoveryCaseSensitive: boolean): CodePolicy {
  if (method === "recovery-code") return { format: "alphanumeric", length: 8, uppercase: !recoveryCaseSensitive, fullWidth: "convert", unit: "文字（ハイフンを除く）" }
  return { format: "numeric", length: challenge.codeLength, uppercase: false, fullWidth: "convert", unit: "桁" }
}

function methodDescription(method: MfaMethod, challenge: MfaChallenge) {
  if (method === "totp") return `認証アプリに表示されている ${challenge.codeLength} 桁のコードを入力してください。`
  if (method === "sms") return `${challenge.smsDestination ?? "登録した"}の電話番号に、SMS で ${challenge.codeLength} 桁のコードを送信しました。`
  return "保存しておいたリカバリーコードを 1 つ入力してください。使ったコードは、もう一度は使えません。"
}

export type MfaScreenProps = AuthScreenLayout & {
  api: AuthApi
  challenge: MfaChallenge
  /** 追加の確認が完了した。これより前は認証済みとして扱わない */
  onAuthenticated: (userId: string) => void
  /** ログインの最初に戻る */
  onCancel: () => void
  /** コードの文字数が揃ったら自動で送信する（製品の指定。IME の変換中は送信しない。二重に送信しない） */
  autoSubmit?: boolean
  /** リカバリーコードの大文字・小文字を区別する（製品の指定）。区別する場合は大文字にそろえない */
  recoveryCaseSensitive?: boolean
  testId?: string
}

export function MfaScreen({
  api,
  challenge,
  onAuthenticated,
  onCancel,
  autoSubmit = false,
  recoveryCaseSensitive = false,
  layout = "minimal",
  headingLevel = 1,
  aside = defaultAside,
  testId = "auth-mfa",
}: MfaScreenProps) {
  const [method, setMethod] = useState<MfaMethod>(challenge.method)
  // 送信したコードの世代。再送信のたびに進め、前のコードの確認の結果を反映しない
  const [issue, setIssue] = useState(0)
  const [code, setCode] = useState("")
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<AuthFormErrorValue | null>(null)
  const [choosing, setChoosing] = useState(false)
  // 上限に達した、または確認の有効期限が切れた：このまま続けられない（最初からやり直す）
  const [ended, setEnded] = useState(false)
  const [status, setStatus] = useState("")
  const [resendAt, setResendAt] = useState<number | null>(null)
  const resendLeft = useCountdown(resendAt)
  // 結果を反映する範囲：確認の ID、方式、送信したコードの世代。方式を変えた後、再送信した後の古い応答を反映しない
  const { run, isPending } = useAuthAction(`${challenge.id}:${method}:${issue}`)
  const codeRef = useRef<HTMLInputElement>(null)
  const copy = methodCopy[method]
  const policy = codePolicyFor(method, challenge, recoveryCaseSensitive)

  // SMS のコードを送った直後は、再送信までの待ち時間を示す（時刻は効果の中で読む）
  useEffect(() => {
    if (challenge.method === "sms" && challenge.resendAfterMs !== null) setResendAt(Date.now() + challenge.resendAfterMs)
  }, [challenge])

  const backToSignIn = (
    <Button type="button" variant="link" size="sm" className={linkButton} onClick={onCancel}>
      ログインに戻る
    </Button>
  )

  // 送信の前に、製品の指定した形式と桁数を確かめる。値は変えない（切り詰めない、想定外の文字を取り除かない）
  const codeErrorOf = (value: string) => {
    const check = checkVerificationCode(value, { format: policy.format, length: policy.length })
    if (check.ok) return null
    if (check.reason === "empty") return `${copy.label}を入力してください`
    if (check.reason === "unexpected-character")
      return policy.format === "numeric" ? `${copy.label}は数字だけで入力してください` : `${copy.label}は英字と数字だけで入力してください`
    return `${copy.label}は ${policy.length} ${policy.unit}で入力してください（入力：${check.length} ${policy.unit}）`
  }

  const verify = (value: string) => {
    if (ended || isPending("verify")) return
    const message = codeErrorOf(value)
    setFieldError(message)
    if (message) {
      codeRef.current?.focus()
      return
    }
    run(
      "verify",
      (signal) => api.verifyMfa({ challengeId: challenge.id, method, code: value }, { signal }),
      (result) => {
        if (result.kind === "authenticated") onAuthenticated(result.userId)
      },
      (err) => {
        const c = codeOf(err)
        if (c === "invalid-code") {
          const left = extra(err, "attemptsLeft")
          setError({
            id: ++errorSeq,
            kind: "invalid-credentials",
            title: `${copy.label}が正しくありません`,
            description: `入力し直してください。${left != null ? `あと ${left} 回入力できます。` : ""}`,
          })
          codeRef.current?.select()
        } else if (c === "code-expired") {
          setError({
            id: ++errorSeq,
            kind: "expired",
            title: "コードの有効期限が切れました",
            description: method === "sms" ? "新しいコードを送信して、入力してください。" : "認証アプリに表示されている、新しいコードを入力してください。",
          })
          setCode("")
        } else if (c === "rate-limited" || c === "challenge-expired") {
          setEnded(true)
          setError({
            id: ++errorSeq,
            kind: c === "rate-limited" ? "rate-limited" : "expired",
            title: c === "rate-limited" ? "確認コードの入力の上限に達しました" : "確認の有効期限が切れました",
            description: "安全のため、この確認は続けられません。時間をおいて、最初からログインしてください。",
            action: backToSignIn,
          })
        } else setError(formError(err))
      }
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    verify(code)
  }

  const sendSms = (switching: boolean) =>
    run(
      "send",
      (signal) => api.sendMfaCode({ challengeId: challenge.id, method: "sms" }, { signal }),
      (r) => {
        setMethod("sms")
        // 新しいコードを送った：前のコードの確認の結果を反映しない（スコープを進める）
        setIssue((n) => n + 1)
        setChoosing(false)
        setCode("")
        setFieldError(null)
        setError(null)
        setResendAt(Date.now() + r.retryAfterMs)
        setStatus(`${challenge.smsDestination ?? "登録した"}の電話番号に、${switching ? "" : "新しい"}コードを送信しました。`)
        // 方式を変えると入力欄を作り直すため、描画の後にフォーカスを移す
        requestAnimationFrame(() => codeRef.current?.focus())
      },
      (err) => {
        if (codeOf(err) === "too-soon") {
          const wait = extra(err, "retryAfterMs") ?? 0
          setResendAt(Date.now() + wait)
          setStatus(`再送信は ${Math.ceil(wait / 1000)} 秒後にできます。`)
        } else setError(formError(err, { title: "コードを送信できませんでした", description: "時間をおいて、もう一度お試しください。" }))
      }
    )

  const choose = (next: MfaMethod) => {
    if (next === "sms") {
      sendSms(true)
      return
    }
    api.selectMfaMethod({ challengeId: challenge.id, method: next })
    setMethod(next)
    setChoosing(false)
    setCode("")
    setFieldError(null)
    setError(null)
    setStatus("")
    requestAnimationFrame(() => codeRef.current?.focus())
  }

  const others = challenge.methods.filter((m) => m !== method)
  return (
    <AuthLayout
      variant={layout}
      logo={<ProductLogo />}
      headingLevel={headingLevel}
      aside={aside}
      title={method === "recovery-code" ? "リカバリーコードを入力" : "確認コードを入力"}
      description={methodDescription(method, challenge)}
      footer={backToSignIn}
      data-testid={testId}
      data-method={method}
    >
      <div className="flex flex-col gap-6">
        <AuthStatus data-testid={`${testId}-status`}>{status}</AuthStatus>
        <AuthFormError error={error} data-testid={`${testId}-error`} />
        <form noValidate onSubmit={submit} className="flex flex-col gap-6">
          <Field invalid={!!fieldError || error?.kind === "invalid-credentials"}>
            <FieldLabel>{copy.label}</FieldLabel>
            <VerificationCodeInput
              // 方式ごとに入力欄を作り直す（変換中の文字や onComplete の記録を、別の方式に持ち越さない）
              key={method}
              ref={codeRef}
              name={method === "recovery-code" ? "recovery-code" : "one-time-code"}
              format={policy.format}
              uppercase={policy.uppercase}
              fullWidth={policy.fullWidth}
              length={autoSubmit ? policy.length : undefined}
              onComplete={autoSubmit ? verify : undefined}
              value={code}
              onValueChange={(v) => {
                setCode(v)
                if (fieldError && v) setFieldError(null)
              }}
              disabled={ended}
              data-testid={`${testId}-code`}
            />
            {method === "recovery-code" && (
              <FieldDescription>
                「XXXX-XXXX」の形式です。ハイフンは省略できます。{recoveryCaseSensitive ? "大文字と小文字を区別します。" : "大文字と小文字は区別しません。"}
              </FieldDescription>
            )}
            {fieldError && <FieldError>{fieldError}</FieldError>}
          </Field>
          <Button type="submit" className="w-full" loading={isPending("verify")} disabled={ended} data-testid={`${testId}-submit`}>
            確認する
          </Button>
        </form>

        {/* 再送信は、送信する方式（SMS）を提供する場合だけ示す */}
        {method === "sms" && !ended && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isPending("send")}
              disabled={resendLeft > 0}
              onClick={() => sendSms(false)}
              data-testid={`${testId}-resend`}
            >
              コードを再送信
            </Button>
            <span className="text-ui text-muted-foreground" data-testid={`${testId}-resend-wait`}>
              {resendLeft > 0 ? `${resendLeft} 秒後に再送信できます` : ""}
            </span>
          </div>
        )}

        {/* 代替の方式は、利用者が登録している方式だけを示す */}
        {others.length > 0 && !ended && (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="link"
              size="sm"
              className={linkButton}
              aria-expanded={choosing}
              onClick={() => setChoosing((v) => !v)}
              data-testid={`${testId}-other`}
            >
              別の方法で確認する
            </Button>
            {choosing && (
              <ul className="flex flex-col gap-2" data-testid={`${testId}-methods`}>
                {others.map((m) => (
                  <li key={m}>
                    <Button type="button" variant="outline" className="w-full" loading={isPending("send") && m === "sms"} onClick={() => choose(m)}>
                      {methodCopy[m].choose}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </AuthLayout>
  )
}

// ---------------------------------------------------------------- 新規登録
export type SignUpInvitation = { email: string; workspaceName: string; inviterName: string }

export type SignUpScreenProps = AuthScreenLayout & {
  api: AuthApi
  /** 招待のリンクから開いた場合。メールアドレスを固定し、確認のメールを省く */
  invitation?: SignUpInvitation | null
  /** 確認のメールを待つ状態になった。emailSent が false の場合は送信できていない */
  onVerificationPending: (email: string, emailSent: boolean) => void
  /** 招待のリンクから登録し、そのまま利用を開始した */
  onAuthenticated: (userId: string) => void
  onSignIn?: () => void
  testId?: string
}

export function SignUpScreen({
  api,
  invitation = null,
  onVerificationPending,
  onAuthenticated,
  onSignIn,
  layout = "minimal",
  headingLevel = 1,
  aside = defaultAside,
  testId = "auth-sign-up",
}: SignUpScreenProps) {
  const [email, setEmail] = useState(invitation?.email ?? "")
  const [password, setPassword] = useState("")
  const [terms, setTerms] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null; terms?: string | null }>({})
  const [error, setError] = useState<AuthFormErrorValue | null>(null)
  const [termsOpen, setTermsOpen] = useState(false)
  const { run, pending } = useAuthAction()
  const [announcer, announce] = useAnnouncer()
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const termsRef = useRef<HTMLButtonElement>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    const passwordCheck = checkPasswordInput(password, { purpose: "new", requirements: passwordRequirementsFor(email) })
    const next = {
      email: emailErrorOf(email),
      password: passwordCheck.ok ? null : passwordCheck.reason === "empty" ? "パスワードを入力してください" : "パスワードの条件を満たしていません。上の条件を確かめてください",
      // 必要な同意（利用規約）。任意のお知らせの受け取りとは分ける
      terms: terms ? null : "利用を開始するには、利用規約とプライバシーポリシーへの同意が必要です",
    }
    setErrors(next)
    if (next.email) return emailRef.current?.focus()
    if (next.password) return passwordRef.current?.focus()
    if (next.terms) return termsRef.current?.focus()
    const to = email.trim()
    run(
      "sign-up",
      (signal) => api.signUp({ email: to, password, marketing, invited: !!invitation }, { signal }),
      (result) => {
        setPassword("")
        if (result.kind === "authenticated") onAuthenticated(result.userId)
        else onVerificationPending(to, result.emailSent)
      },
      (err) => setError(formError(err))
    )
  }

  return (
    <AuthLayout
      variant={layout}
      logo={<ProductLogo />}
      headingLevel={headingLevel}
      aside={aside}
      title="アカウントを作成"
      description={
        invitation ? `${invitation.inviterName}さんから「${invitation.workspaceName}」に招待されています。` : "メールアドレスとパスワードだけで始められます。"
      }
      footer={
        onSignIn ? (
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-muted-foreground">
            アカウントをお持ちの場合
            <Button type="button" variant="link" size="sm" onClick={onSignIn}>
              ログイン
            </Button>
          </p>
        ) : undefined
      }
      data-testid={testId}
    >
      <div className="flex flex-col gap-6">
        <AuthFormError error={error} data-testid={`${testId}-error`} />
        {announcer}
        <form noValidate onSubmit={submit} className="flex flex-col gap-6">
          <FieldGroup>
            <EmailField
              value={email}
              onValueChange={setEmail}
              error={errors.email}
              onErrorChange={(m) => setErrors((x) => ({ ...x, email: m }))}
              announce={announce}
              readOnly={!!invitation}
              description={invitation ? "招待されたメールアドレスで登録します。" : undefined}
              inputRef={emailRef}
              testId={`${testId}-email`}
            />
            <NewPasswordField
              label="パスワード"
              value={password}
              onValueChange={(v) => {
                setPassword(v)
                if (errors.password && evaluatePasswordRequirements(v, passwordRequirementsFor(email)).allMet) setErrors((x) => ({ ...x, password: null }))
              }}
              email={email}
              error={errors.password}
              inputRef={passwordRef}
              testId={`${testId}-password`}
            />
            <div className="flex flex-col gap-1">
              <Field orientation="horizontal" invalid={!!errors.terms} className="flex-wrap">
                <Checkbox
                  ref={termsRef}
                  required
                  checked={terms}
                  onCheckedChange={(c) => {
                    setTerms(c)
                    if (c) setErrors((x) => ({ ...x, terms: null }))
                  }}
                  data-testid={`${testId}-terms`}
                />
                <FieldLabel>利用規約とプライバシーポリシーに同意する</FieldLabel>
                {errors.terms && <FieldError className="w-full">{errors.terms}</FieldError>}
              </Field>
              <Button type="button" variant="link" size="sm" className={linkButton} onClick={() => setTermsOpen(true)}>
                利用規約とプライバシーポリシーを読む
              </Button>
            </div>
            <Field orientation="horizontal">
              <Checkbox checked={marketing} onCheckedChange={setMarketing} data-testid={`${testId}-marketing`} />
              <FieldLabel>
                新しい機能とイベントのお知らせをメールで受け取る
                <FieldOptionalMark />
              </FieldLabel>
            </Field>
          </FieldGroup>
          <Button type="submit" className="w-full" loading={pending === "sign-up"} data-testid={`${testId}-submit`}>
            アカウントを作成
          </Button>
        </form>
      </div>
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>利用規約とプライバシーポリシー</DialogTitle>
            <DialogDescription>プレビュー用の模擬の文書です。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-body">
              この製品は、登録したメールアドレスを、ログイン、セキュリティの通知、契約に関する連絡に使います。お知らせのメールは、同意した場合だけ送ります。
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </AuthLayout>
  )
}

// ---------------------------------------------------------------- メールの確認（送信後・再送信・アドレスの変更）
export type EmailVerificationScreenProps = AuthScreenLayout & {
  api: AuthApi
  email: string
  /** 確認のメールを送信できたか。false の場合は「送信しました」と表示しない */
  emailSent: boolean
  /** メールアドレスを変更して送信した */
  onEmailChange?: (email: string) => void
  onBackToSignIn?: () => void
  testId?: string
}

export function EmailVerificationScreen({
  api,
  email: initialEmail,
  emailSent,
  onEmailChange,
  onBackToSignIn,
  layout = "minimal",
  headingLevel = 1,
  aside = defaultAside,
  testId = "auth-verify-email",
}: EmailVerificationScreenProps) {
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState(emailSent)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialEmail)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [error, setError] = useState<AuthFormErrorValue | null>(
    emailSent ? null : { id: ++errorSeq, kind: "network", title: "確認のメールを送信できませんでした", description: "時間をおいて、もう一度送信してください。" }
  )
  const [status, setStatus] = useState("")
  const [resendAt, setResendAt] = useState<number | null>(null)
  const resendLeft = useCountdown(resendAt)
  const { run, pending } = useAuthAction()
  const [announcer, announce] = useAnnouncer()
  const draftRef = useRef<HTMLInputElement>(null)

  const send = (to: string, previousEmail?: string) =>
    run(
      "send",
      (signal) => api.sendVerification({ email: to, previousEmail }, { signal }),
      (r) => {
        const changed = previousEmail !== undefined && previousEmail !== to
        setEmail(to)
        setSent(true)
        setEditing(false)
        setError(null)
        setResendAt(Date.now() + r.retryAfterMs)
        setStatus(changed ? `${to} にメールを送信しました。` : `${to} にメールを再送信しました。`)
        if (changed) onEmailChange?.(to)
      },
      (err) => {
        if (codeOf(err) === "too-soon") {
          const wait = extra(err, "retryAfterMs") ?? 0
          setResendAt(Date.now() + wait)
          setStatus(`再送信は ${Math.ceil(wait / 1000)} 秒後にできます。`)
          return
        }
        setError(formError(err, { title: "確認のメールを送信できませんでした", description: "時間をおいて、もう一度送信してください。" }))
      }
    )

  return (
    <AuthLayout
      variant={layout}
      logo={<ProductLogo />}
      headingLevel={headingLevel}
      aside={aside}
      title="メールアドレスを確認してください"
      description={
        sent ? (
          <>
            <span className="font-medium text-foreground [word-break:break-all]">{email}</span>{" "}
            にメールを送信しました。メールの案内に従って、登録を完了してください。
          </>
        ) : (
          <>
            <span className="font-medium text-foreground [word-break:break-all]">{email}</span>{" "}
            に確認のメールを送る必要があります。
          </>
        )
      }
      footer={
        onBackToSignIn ? (
          <Button type="button" variant="link" size="sm" onClick={onBackToSignIn}>
            ログイン画面に戻る
          </Button>
        ) : undefined
      }
      data-testid={testId}
      data-sent={sent || undefined}
    >
      <div className="flex flex-col gap-6">
        <AuthStatus data-testid={`${testId}-status`}>{status}</AuthStatus>
        <AuthFormError error={error} data-testid={`${testId}-error`} />
        {announcer}
        {editing ? (
          <form
            noValidate
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              if (pending) return
              const message = emailErrorOf(draft)
              setDraftError(message)
              if (message) return draftRef.current?.focus()
              send(draft.trim(), email)
            }}
          >
            <EmailField
              label="新しいメールアドレス"
              value={draft}
              onValueChange={setDraft}
              error={draftError}
              onErrorChange={setDraftError}
              announce={announce}
              autoComplete="email"
              inputRef={draftRef}
              testId={`${testId}-new-email`}
            />
            <div className="flex flex-col gap-3">
              <Button type="submit" className="w-full" loading={pending === "send"} data-testid={`${testId}-change-submit`}>
                変更して確認のメールを送る
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setEditing(false)}>
                キャンセル
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant={sent ? "outline" : "default"}
                className="w-full"
                loading={pending === "send"}
                disabled={resendLeft > 0}
                onClick={() => send(email)}
                data-testid={`${testId}-resend`}
              >
                {sent ? "確認のメールを再送信" : "確認のメールを送信"}
              </Button>
              <p className="text-center text-ui text-muted-foreground" data-testid={`${testId}-resend-wait`}>
                {resendLeft > 0 ? `${resendLeft} 秒後に再送信できます` : ""}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setDraft(email)
                setDraftError(null)
                setEditing(true)
                requestAnimationFrame(() => draftRef.current?.select())
              }}
              data-testid={`${testId}-change`}
            >
              メールアドレスを変更
            </Button>
          </div>
        )}
      </div>
    </AuthLayout>
  )
}

// ---------------------------------------------------------------- パスワードの再設定
export type PasswordResetRequestScreenProps = AuthScreenLayout & {
  api: AuthApi
  initialEmail?: string
  /** 申請を受け付けた（登録されている場合だけ、サーバーが送信する） */
  onRequested: (email: string) => void
  onBackToSignIn?: () => void
  testId?: string
}

export function PasswordResetRequestScreen({
  api,
  initialEmail = "",
  onRequested,
  onBackToSignIn,
  layout = "minimal",
  headingLevel = 1,
  aside = defaultAside,
  testId = "auth-reset-request",
}: PasswordResetRequestScreenProps) {
  const [email, setEmail] = useState(initialEmail)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [error, setError] = useState<AuthFormErrorValue | null>(null)
  const { run, pending } = useAuthAction()
  const [announcer, announce] = useAnnouncer()
  const emailRef = useRef<HTMLInputElement>(null)
  return (
    <AuthLayout
      variant={layout}
      logo={<ProductLogo />}
      headingLevel={headingLevel}
      aside={aside}
      title="パスワードの再設定"
      description="登録したメールアドレスに、パスワードを再設定するためのリンクを送ります。"
      footer={
        onBackToSignIn ? (
          <Button type="button" variant="link" size="sm" onClick={onBackToSignIn}>
            ログイン画面に戻る
          </Button>
        ) : undefined
      }
      data-testid={testId}
    >
      <div className="flex flex-col gap-6">
        <AuthFormError error={error} data-testid={`${testId}-error`} />
        {announcer}
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (pending) return
            const message = emailErrorOf(email)
            setEmailError(message)
            if (message) return emailRef.current?.focus()
            const to = email.trim()
            run("request", (signal) => api.requestPasswordReset({ email: to }, { signal }), () => onRequested(to), (err) => setError(formError(err)))
          }}
        >
          <EmailField
            value={email}
            onValueChange={setEmail}
            error={emailError}
            onErrorChange={setEmailError}
            announce={announce}
            autoComplete="email"
            inputRef={emailRef}
            testId={`${testId}-email`}
          />
          <Button type="submit" className="w-full" loading={pending === "request"} data-testid={`${testId}-submit`}>
            再設定のリンクを送る
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}

export type PasswordResetSentScreenProps = AuthScreenLayout & {
  api: AuthApi
  email: string
  onChangeEmail: () => void
  onBackToSignIn?: () => void
  testId?: string
}

export function PasswordResetSentScreen({
  api,
  email,
  onChangeEmail,
  onBackToSignIn,
  layout = "minimal",
  headingLevel = 1,
  aside = defaultAside,
  testId = "auth-reset-sent",
}: PasswordResetSentScreenProps) {
  const [error, setError] = useState<AuthFormErrorValue | null>(null)
  const [status, setStatus] = useState("")
  const { run, pending } = useAuthAction()
  return (
    <AuthLayout
      variant={layout}
      logo={<ProductLogo />}
      headingLevel={headingLevel}
      aside={aside}
      title="メールを確認してください"
      description={
        <>
          <span className="font-medium text-foreground [word-break:break-all]">{email}</span>{" "}
          がアカウントに登録されている場合は、パスワードを再設定するためのリンクを送信しました。リンクは 30 分間有効です。
        </>
      }
      footer={
        onBackToSignIn ? (
          <Button type="button" variant="link" size="sm" onClick={onBackToSignIn}>
            ログイン画面に戻る
          </Button>
        ) : undefined
      }
      data-testid={testId}
    >
      <div className="flex flex-col gap-6">
        <AuthStatus data-testid={`${testId}-status`}>{status}</AuthStatus>
        <AuthFormError error={error} data-testid={`${testId}-error`} />
        <p className="text-ui text-muted-foreground">メールが届かない場合は、迷惑メールのフォルダーを確かめるか、もう一度送ってください。</p>
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            loading={pending === "resend"}
            onClick={() =>
              run(
                "resend",
                (signal) => api.requestPasswordReset({ email }, { signal }),
                () => {
                  setError(null)
                  setStatus(`${email} がアカウントに登録されている場合は、もう一度送信しました。`)
                },
                (err) => {
                  setStatus("")
                  setError(formError(err))
                }
              )
            }
            data-testid={`${testId}-resend`}
          >
            もう一度送る
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onChangeEmail} data-testid={`${testId}-change`}>
            別のメールアドレスを入力
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}

export type ResetLinkProblemScreenProps = AuthScreenLayout & {
  reason: "expired" | "invalid"
  onRequestAgain: () => void
  onBackToSignIn?: () => void
  testId?: string
}

export function ResetLinkProblemScreen({
  reason,
  onRequestAgain,
  onBackToSignIn,
  layout = "minimal",
  headingLevel = 1,
  aside = defaultAside,
  testId = "auth-reset-link",
}: ResetLinkProblemScreenProps) {
  return (
    <AuthLayout
      variant={layout}
      logo={<ProductLogo />}
      headingLevel={headingLevel}
      aside={aside}
      title={reason === "expired" ? "リンクの有効期限が切れています" : "このリンクは使えません"}
      description={
        reason === "expired"
          ? "パスワードを再設定するためのリンクは、送信から 30 分で使えなくなります。もう一度、再設定のリンクを送ってください。"
          : "リンクがすでに使われたか、正しくありません。もう一度、再設定のリンクを送ってください。"
      }
      footer={
        onBackToSignIn ? (
          <Button type="button" variant="link" size="sm" onClick={onBackToSignIn}>
            ログイン画面に戻る
          </Button>
        ) : undefined
      }
      data-testid={testId}
      data-reason={reason}
    >
      <Button type="button" className="w-full" onClick={onRequestAgain} data-testid={`${testId}-again`}>
        再設定のリンクを送り直す
      </Button>
    </AuthLayout>
  )
}

export type NewPasswordScreenProps = AuthScreenLayout & {
  api: AuthApi
  /** 再設定のリンクのトークン（模擬） */
  token: string
  /** 対象のアカウント。パスワードマネージャーが、どのアカウントのパスワードかを判断するために示す */
  email: string
  /** 変更した。新しいパスワードでログインし直す（多要素認証を省かないため、ここでは認証済みにしない） */
  onChanged: (email: string) => void
  /** リンクの有効期限が切れていた */
  onLinkProblem: (reason: "expired" | "invalid") => void
  testId?: string
}

export function NewPasswordScreen({
  api,
  token,
  email,
  onChanged,
  onLinkProblem,
  layout = "minimal",
  headingLevel = 1,
  aside = defaultAside,
  testId = "auth-new-password",
}: NewPasswordScreenProps) {
  const [password, setPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [error, setError] = useState<AuthFormErrorValue | null>(null)
  const { run, pending } = useAuthAction()
  const passwordRef = useRef<HTMLInputElement>(null)
  return (
    <AuthLayout
      variant={layout}
      logo={<ProductLogo />}
      headingLevel={headingLevel}
      aside={aside}
      title="新しいパスワードを設定"
      description="確認のための再入力は不要です。表示に切り替えて、入力した内容を確かめられます。"
      data-testid={testId}
    >
      <div className="flex flex-col gap-6">
        <AuthFormError error={error} data-testid={`${testId}-error`} />
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (pending) return
            const check = checkPasswordInput(password, { purpose: "new", requirements: passwordRequirementsFor(email) })
            const message = check.ok ? null : check.reason === "empty" ? "新しいパスワードを入力してください" : "パスワードの条件を満たしていません。上の条件を確かめてください"
            setPasswordError(message)
            if (message) return passwordRef.current?.focus()
            run(
              "reset",
              (signal) => api.resetPassword({ token, password }, { signal }),
              (r) => {
                setPassword("")
                onChanged(r.email)
              },
              (err) => {
                const c = codeOf(err)
                if (c === "invalid-link") onLinkProblem("expired")
                else if (c === "weak-password") setPasswordError("パスワードの条件を満たしていません。上の条件を確かめてください")
                else setError(formError(err))
              }
            )
          }}
        >
          <FieldGroup>
            {/* パスワードマネージャーが対象のアカウントを判断できるよう、ユーザー名（メールアドレス）を同じフォームに置く */}
            <Field>
              <FieldLabel>アカウント</FieldLabel>
              <Input type="email" name="username" autoComplete="username" value={email} readOnly data-testid={`${testId}-username`} />
            </Field>
            <NewPasswordField
              label="新しいパスワード"
              value={password}
              onValueChange={(v) => {
                setPassword(v)
                if (passwordError && evaluatePasswordRequirements(v, passwordRequirementsFor(email)).allMet) setPasswordError(null)
              }}
              email={email}
              error={passwordError}
              inputRef={passwordRef}
              testId={`${testId}-password`}
            />
          </FieldGroup>
          <Button type="submit" className="w-full" loading={pending === "reset"} data-testid={`${testId}-submit`}>
            パスワードを変更
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}

// ---------------------------------------------------------------- セッション切れの再認証
export type ReauthScreenProps = AuthScreenLayout & {
  api: AuthApi
  org: AuthOrg
  /** セッションが切れる前の利用者 */
  user: { id: string; name: string; email: string }
  /** 再認証が完了した（追加の確認を含む）。前の利用者と同じかどうかは、呼び出し側が planReauthentication で決める */
  onAuthenticated: (userId: string) => void
  /** 保持している作業を、同じアカウントでのログインの後に復元するか（説明の文を変える） */
  keepsWork?: boolean
  /** keepsWork が false で、保存していない入力を破棄した（復元しない）ことを知らせる。既定は false */
  discardedInput?: boolean
  testId?: string
}

export function ReauthScreen({
  api,
  org,
  user,
  onAuthenticated,
  keepsWork = true,
  discardedInput = false,
  layout = "minimal",
  headingLevel = 1,
  aside,
  testId = "auth-reauth",
}: ReauthScreenProps) {
  return (
    <SignInScreen
      api={api}
      org={org}
      lockedEmail={user.email}
      title="もう一度ログインしてください"
      description={
        keepsWork
          ? "セッションの有効期限が切れました。同じアカウントでログインすると、権限を確かめてから、保存していない入力内容を復元します。"
          : discardedInput
            ? "セッションの有効期限が切れました。保存していない入力は破棄されました。続けるには、もう一度ログインしてください。"
            : "セッションの有効期限が切れました。続けるには、もう一度ログインしてください。"
      }
      onAuthenticated={(userId) => onAuthenticated(userId)}
      layout={layout}
      headingLevel={headingLevel}
      aside={aside}
      testId={testId}
    />
  )
}

// ---------------------------------------------------------------- 模擬の受信箱
const mailLabels: Record<SentEmail["type"], string> = {
  verify: "メールアドレスの確認",
  reset: "パスワードの再設定",
  "magic-link": "ログイン用のリンク",
  "account-exists": "このメールアドレスは登録済みです（お知らせ）",
}

/**
 * 模擬のサーバーが実際に「送信」したメールだけを示す。送信していないメール（アカウントがない、送信に失敗した）は表示されない。
 * 実際のメールは送らない。リンクを開く操作は、利用者がメールのリンクを開いたことの代わりである。
 */
export function MockMailbox({
  email,
  onOpen,
  testId = "auth-mailbox",
}: {
  email: string
  /** リンクを開く（account-exists には開くリンクがない） */
  onOpen: (mail: SentEmail) => void
  testId?: string
}) {
  useSyncExternalStore(subscribeMail, getMailVersion, getMailVersion)
  const key = email.trim().toLowerCase()
  const mails = authServer.sentEmails.filter((m) => m.to.toLowerCase() === key)
  return (
    <div className="flex min-w-0 flex-col gap-2 text-ui" data-testid={testId}>
      <p className="font-medium">
        模擬の受信箱<span className="font-normal text-muted-foreground [word-break:break-all]">（{email || "メールアドレスの入力前"}）</span>
      </p>
      {mails.length === 0 ? (
        <p className="text-muted-foreground" data-testid={`${testId}-empty`}>
          届いたメールはありません。
        </p>
      ) : (
        <ul className="flex flex-col">
          {mails.map((m, i) => (
            <li key={i} className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 border-b border-border py-1 last:border-b-0" data-type={m.type}>
              <span>{mailLabels[m.type]}</span>
              {m.type !== "account-exists" && (
                <Button type="button" variant="outline" size="sm" onClick={() => onOpen(m)}>
                  リンクを開く
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
