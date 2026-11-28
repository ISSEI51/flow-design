import { useRef, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel, FieldOptionalMark } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { MinimalShell } from "@/patterns/app-shell"
import { AuthFormError, AuthStatus, type AuthFormErrorValue } from "@/patterns/auth-feedback"
import { checkEmailFormat, checkPasswordInput } from "@/patterns/auth-flow"
import { AuthLayout } from "@/patterns/auth-layout"
import { resolveFirstScreen } from "@/patterns/onboarding"
import { PageLayout } from "@/patterns/page-layout"
import { PasswordInput } from "@/patterns/password-input"
import { Stepper } from "@/patterns/stepper"
import { useStepFlow } from "@/patterns/step-flow"

import { userByEmail, type PiUser } from "../../data/patterns-integration/model"
import { completeSetup, isSetupDone, login } from "../../data/patterns-integration/server"

// 認証と初回のセットアップ（製品側のコード）。
// - ログイン：AuthLayout、PasswordInput、AuthFormError。送信中は二重に送らない（ref で同期的に判定する）。
// - 再認証：前の利用者のメールアドレスを固定し、「別のアカウントでログイン」を置く。再認証の画面の背後に業務のデータを描画しない。
// - 初回のセットアップ：resolveFirstScreen（必須の準備）と useStepFlow、Stepper。必須の項目（表示名）と任意の項目（通知）を分ける。

let errorSeq = 0

export function ProductMark() {
  return (
    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-caption font-semibold text-primary-foreground">
      F
    </span>
  )
}

function Logo() {
  return (
    <span className="flex items-center gap-3 text-ui font-semibold">
      <ProductMark />
      Flow 営業管理
    </span>
  )
}

export function LoginScreen({
  lockedEmail,
  onSignedIn,
  onOtherAccount,
  title = "ログイン",
  description,
}: {
  lockedEmail?: string
  onSignedIn: (user: PiUser) => void
  onOtherAccount?: () => void
  title?: string
  description?: string
}) {
  const [email, setEmail] = useState(lockedEmail ?? "")
  const [password, setPassword] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [error, setError] = useState<AuthFormErrorValue | null>(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy.current) return
    const em = checkEmailFormat(email).ok ? null : "メールアドレスの形式で入力してください（例：sato@example.com）"
    const pw = checkPasswordInput(password, { purpose: "current" }).ok ? null : "パスワードを入力してください"
    setEmailError(em)
    setPasswordError(pw)
    if (em || pw) return (em ? emailRef : passwordRef).current?.focus()
    busy.current = true
    setPending(true)
    try {
      const user = userByEmail(email)
      const r = await login(email, password, user?.id)
      if (!r.ok || !user) {
        setError({ id: ++errorSeq, kind: "invalid-credentials" })
        return
      }
      onSignedIn(user)
    } catch {
      setError({ id: ++errorSeq, kind: "network" })
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <MinimalShell>
      <PageLayout width="compact" align="center">
        <AuthLayout logo={<Logo />} title={title} description={description} data-testid="pi-login">
          <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
            <AuthFormError error={error} />
            <Field invalid={!!emailError}>
              <FieldLabel>メールアドレス</FieldLabel>
              <Input ref={emailRef} type="email" autoComplete="username" value={email} readOnly={lockedEmail !== undefined} onChange={(e) => setEmail(e.target.value)} />
              {emailError && <FieldError>{emailError}</FieldError>}
            </Field>
            <Field invalid={!!passwordError}>
              <FieldLabel>パスワード</FieldLabel>
              <PasswordInput ref={passwordRef} value={password} onChange={(e) => setPassword(e.target.value)} />
              {passwordError ? <FieldError>{passwordError}</FieldError> : <FieldDescription>検証画面のパスワードは flow-design です</FieldDescription>}
            </Field>
            <Button type="submit" className="w-full" loading={pending} data-testid="login-submit">
              ログイン
            </Button>
            {onOtherAccount && (
              <Button type="button" variant="link" className="justify-self-center" onClick={onOtherAccount} data-testid="login-other">
                別のアカウントでログイン
              </Button>
            )}
          </form>
        </AuthLayout>
      </PageLayout>
    </MinimalShell>
  )
}

/** 再認証の後、現在の認可を確かめている間の画面。以前の作業と保護された内容は描画しない */
export function VerifyingScreen() {
  return (
    <MinimalShell>
      <PageLayout width="compact" align="center">
        <AuthLayout logo={<Logo />} title="権限を確認しています" data-testid="pi-verifying">
          <AuthStatus>現在の権限を確かめてから、作業していた画面に戻ります。</AuthStatus>
        </AuthLayout>
      </PageLayout>
    </MinimalShell>
  )
}

/** 初回のセットアップが必要か（必須の準備が残っているか） */
export const needsSetup = (userId: string) => resolveFirstScreen({ hasWorkspace: true, requiredSetup: [{ id: "profile", done: isSetupDone(userId) }] }).screen === "required-setup"

type StepId = "profile" | "notify" | "confirm"
const steps: { id: StepId; label: string }[] = [
  { id: "profile", label: "表示名" },
  { id: "notify", label: "通知（任意）" },
  { id: "confirm", label: "確認" },
]

export function SetupScreen({ user, onDone }: { user: PiUser; onDone: () => void }) {
  const [displayName, setDisplayName] = useState("")
  const [touched, setTouched] = useState(false)
  const [email, setEmail] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOk = displayName.trim().length > 0
  const flow = useStepFlow<StepId>({ steps, isComplete: (id) => (id === "profile" ? nameOk : true) })
  const current = steps.find((s) => s.id === flow.current)
  const finish = async () => {
    // 送信の前に、すべての必須の手順が終わっているかを確かめ直す
    const missing = flow.firstIncomplete()
    if (missing && missing !== "confirm") return void flow.goTo(missing)
    setSaving(true)
    setError(null)
    try {
      await completeSetup(user.id, displayName.trim())
      onDone()
    } catch {
      setError("保存できませんでした。もう一度お試しください。")
    } finally {
      setSaving(false)
    }
  }
  return (
    <MinimalShell>
      <PageLayout width="focused" data-testid="pi-setup">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-page-title">利用を始める準備</h1>
            <p className="text-ui text-muted-foreground">{user.email}</p>
          </div>
          <Stepper items={flow.items} total={flow.total} currentLabel="hidden" onSelect={saving ? undefined : (id) => flow.goTo(id)} aria-label="準備の手順" />
          <h2 ref={flow.headingRef} tabIndex={-1} className="text-section outline-none">
            {current?.label}
          </h2>
          {flow.current === "profile" && (
            <Field invalid={touched && !nameOk}>
              <FieldLabel>表示名</FieldLabel>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} onBlur={() => setTouched(true)} autoComplete="name" data-testid="setup-name" />
              {touched && !nameOk ? <FieldError>表示名を入力してください</FieldError> : <FieldDescription>チームのほかの人に表示する名前</FieldDescription>}
            </Field>
          )}
          {flow.current === "notify" && (
            <Field>
              <div className="flex items-center justify-between gap-4">
                <FieldLabel>
                  お知らせをメールでも受け取る
                  <FieldOptionalMark />
                </FieldLabel>
                <Switch checked={email} onCheckedChange={setEmail} />
              </div>
              <FieldDescription>あとで設定の画面から変えられます</FieldDescription>
            </Field>
          )}
          {flow.current === "confirm" && (
            <dl className="grid gap-x-6 gap-y-2 text-ui sm:grid-cols-[10rem_1fr]" data-testid="setup-summary">
              <dt className="text-muted-foreground">表示名</dt>
              <dd>{displayName}</dd>
              <dt className="text-muted-foreground">メールでの通知</dt>
              <dd>{email ? "受け取る" : "受け取らない"}</dd>
            </dl>
          )}
          {error && (
            <p role="alert" className="text-ui text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            {!flow.isFirst && (
              <Button variant="secondary" disabled={saving} onClick={() => flow.back()}>
                戻る
              </Button>
            )}
            {flow.isLast ? (
              <Button loading={saving} onClick={() => void finish()} data-testid="setup-finish">
                利用を始める
              </Button>
            ) : (
              <Button
                disabled={!flow.canNext}
                focusableWhenDisabled
                aria-describedby={!flow.canNext ? "pi-setup-next-reason" : undefined}
                onClick={() => {
                  setTouched(true)
                  flow.next()
                }}
                data-testid="setup-next"
              >
                次へ
              </Button>
            )}
          </div>
          {!flow.canNext && !flow.isLast && (
            <p id="pi-setup-next-reason" className="text-right text-ui text-muted-foreground">
              表示名を入力すると次へ進めます
            </p>
          )}
        </div>
      </PageLayout>
    </MinimalShell>
  )
}
