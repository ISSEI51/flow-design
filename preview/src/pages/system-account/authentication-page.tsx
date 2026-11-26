import { useEffect, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { AuthStatus } from "@/patterns/auth-feedback"
import {
  decideReauthenticationRestore,
  planReauthentication,
  resolveReturnTo,
  type ReauthDiscardTarget,
  type ReauthenticationPlan,
  type ReturnToResult,
} from "@/patterns/auth-flow"
import type { AuthLayoutVariant } from "@/patterns/auth-layout"
import { useScopeGuard } from "@/patterns/scope-guard"
import { TableScrollArea } from "@/patterns/table-scroll-area"

import { authApi, authServer, canOpenPath, demoInvitation, demoRecoveryCodes, homePathOf, type AuthServerMode, type SentEmail } from "../../data/system-account/auth-server"
import { customers } from "../../data/data-display/customers"
import { MockUnknownError, isAbortError } from "../../data/system-account/mock"
import { demoPassword, demoVerificationCode, membershipOf, notificationsOf, roles, users, workspaces, type UserId, type WorkspaceId } from "../../data/system-account/model"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import { DiscardAlert } from "../overlays/discard-alert"
import {
  EmailVerificationScreen,
  MfaScreen,
  MockMailbox,
  NewPasswordScreen,
  PasswordResetRequestScreen,
  PasswordResetSentScreen,
  ReauthScreen,
  ResetLinkProblemScreen,
  SignInScreen,
  SignUpScreen,
  signInMethodsFor,
  type SignInStep,
} from "./auth-screens"

// Authentication の資料のページ。例はすべて模擬の処理（auth-server.ts）で、実際の認証、メール送信、セッションの管理は行わない。
// 画面の部品は auth-screens.tsx にあり、統合の検証画面でも使う。資料のページでは h1 がほかにあるため、見出しを h3 にする。

const userName = (id: string) => (id in users ? users[id as UserId].name : "新しい利用者")
const destinationText = (d: ReturnToResult) =>
  d.status === "accepted"
    ? `${d.path}（元の目的の画面）`
    : `${d.path}（既定の画面。${{ missing: "復帰先の指定がない", unsafe: "復帰先が同じオリジンの相対パスではない", "not-allowed": "この利用者は復帰先の画面を開けない", "check-failed": "復帰先を開けるかを確かめられなかった" }[d.reason]}）`

function ResultLine({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p className="text-ui" data-testid={testId}>
      {children}
    </p>
  )
}

// ---------------------------------------------------------------- 模擬のアカウント
function DemoAccounts() {
  return (
    <Rules
      rows={[
        ["メールアドレス", `${users["u-sato"].email}（佐藤 花子）、${users["u-suzuki"].email}（鈴木 一郎）、${users["u-tanaka"].email}（田中 美咲）`],
        ["パスワード", demoPassword],
        ["確認コード", `${demoVerificationCode}（先頭の 0 を含む）`],
        ["リカバリーコード", `${demoRecoveryCodes.join("、")}（佐藤 花子だけ）`],
        ["保存", "入力したパスワードとコードは、この画面のメモリだけに置く。ストレージ、URL、ログには書かない。再読み込みで消える"],
      ]}
    />
  )
}

// ---------------------------------------------------------------- レイアウト
function LayoutDemo() {
  const [variant, setVariant] = useState<AuthLayoutVariant>("minimal")
  const [short, setShort] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-6">
      <DemoControls legend="配置">
        {(
          [
            ["minimal", "Minimal（既定）"],
            ["card", "Card"],
            ["split", "Split"],
          ] as const
        ).map(([v, l]) => (
          <Radio key={v} name="auth-layout" checked={variant === v} onChange={() => setVariant(v)}>
            {l}
          </Radio>
        ))}
        <label className="flex min-h-10 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} className="size-4 accent-[var(--primary)]" data-testid="auth-layout-short" />
          高さを 360px にする（画面の高さが足りない場合）
        </label>
      </DemoControls>
      <DemoFrame testId="auth-layout-frame" className="p-0 sm:p-0">
        {/* 高さが足りない場合の例：Minimal Shell の <main> と同じく、枠の中が縦にスクロールする */}
        <div className={short ? "h-90 overflow-y-auto" : undefined} data-testid="auth-layout-scroll" tabIndex={short ? 0 : undefined} aria-label={short ? "高さを制限した例" : undefined} role={short ? "region" : undefined}>
          {done ? (
            <div className="flex flex-col items-start gap-4 p-6">
              <ResultLine testId="auth-layout-result">{done}</ResultLine>
              <Button variant="outline" size="sm" onClick={() => setDone(null)}>
                ログインの画面に戻す
              </Button>
            </div>
          ) : (
            <SignInScreen
              key={variant}
              api={authApi}
              org="hq"
              layout={variant}
              headingLevel={3}
              onAuthenticated={(userId, d) => setDone(`認証済み：${userName(userId)}。移動先：${destinationText(d)}`)}
              testId="auth-layout"
            />
          )}
        </div>
      </DemoFrame>
    </div>
  )
}

// ---------------------------------------------------------------- ログインと認証方式
type PageKind = "hq" | "west" | "magic"
const loginPages: [PageKind, string][] = [
  ["hq", "本社営業部（パスワード、外部アカウント、Passkey。多要素認証が必須）"],
  ["west", "西日本営業部（組織の SSO が必須。外部アカウントは不可）"],
  ["magic", "メールのリンクでログインする製品（Magic Link）"],
]
const responseModes: [AuthServerMode, string][] = [
  ["success", "成功"],
  ["network", "通信の失敗"],
  ["rate-limited", "試行回数の制限"],
  ["service-unavailable", "認証のサービスの障害"],
]
const customerPath = `/w/hq/customers/${customers[11].id}?tab=activity`
export const returnToSamples: [string, string][] = [
  [customerPath, "顧客の詳細"],
  ["/w/hq/settings/billing", "契約と請求（管理者だけ）"],
  ["/w/west/customers", "西日本営業部の顧客"],
  ["//evil.example/login", "プロトコル相対の外部の URL"],
  ["https://evil.example/", "外部の URL"],
  ["javascript:alert(1)", "javascript: のスキーム"],
  ["/%2F%2Fevil.example", "エンコードした //"],
  ["/\\evil.example", "バックスラッシュ"],
]

function SignInDemo() {
  const [kind, setKind] = useState<PageKind>("hq")
  const [mode, setMode] = useState<AuthServerMode>("success")
  const [returnTo, setReturnTo] = useState(customerPath)
  const [step, setStep] = useState<SignInStep>("credentials")
  const [result, setResult] = useState<{ userId: string; destination: ReturnToResult } | null>(null)
  const [magicEmail, setMagicEmail] = useState<string | null>(null)
  // 「パスワードを忘れた場合」から開いた再設定の画面
  const [forgot, setForgot] = useState<{ email: string; sent: boolean } | null>(null)
  const [run, setRun] = useState(0)
  const org = kind === "west" ? "west" : "hq"

  useEffect(() => {
    authServer.mode["sign-in"] = mode
    authServer.mode.provider = mode
    authServer.mode["magic-link"] = mode
  }, [mode])

  const restart = () => {
    setResult(null)
    setStep("credentials")
    setMagicEmail(null)
    setForgot(null)
    setRun((n) => n + 1)
  }

  const openMail = (mail: SentEmail) => {
    authApi.openMagicLink({ email: mail.to }).then(
      (r) => r.kind === "authenticated" && setResult({ userId: r.userId, destination: resolveDestination(r.userId, returnTo) }),
      () => undefined
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <DemoControls legend="ログインのページ（組織のポリシー）">
        {loginPages.map(([v, l]) => (
          <Radio
            key={v}
            name="auth-page"
            checked={kind === v}
            onChange={() => {
              setKind(v)
              restart()
            }}
          >
            {l}
          </Radio>
        ))}
      </DemoControls>
      <DemoControls legend="模擬のサーバーの応答">
        {responseModes.map(([v, l]) => (
          <Radio key={v} name="auth-mode" checked={mode === v} onChange={() => setMode(v)}>
            {l}
          </Radio>
        ))}
      </DemoControls>
      <DemoControls legend="ログインの後に戻る画面（復帰先の値）">
        {returnToSamples.map(([v, l]) => (
          <Radio
            key={v}
            name="auth-return-to"
            checked={returnTo === v}
            onChange={() => {
              setReturnTo(v)
              restart()
            }}
          >
            <span>
              {l}
              <code className="ms-2 text-caption text-muted-foreground [word-break:break-all]">{v}</code>
            </span>
          </Radio>
        ))}
      </DemoControls>
      <DemoFrame testId="auth-signin-frame">
        {result ? (
          <div className="flex flex-col items-start gap-4" data-testid="auth-signin-done">
            {/* 認証の後は成功の Dialog を出さず、目的の画面に移動する。ここでは移動先だけを示す */}
            <p className="text-heading">移動した画面（模擬）</p>
            <p className="text-body [word-break:break-all]" data-testid="auth-signin-destination" data-status={result.destination.status}>
              {result.destination.path}
            </p>
          </div>
        ) : forgot ? (
          forgot.sent ? (
            <PasswordResetSentScreen
              api={authApi}
              email={forgot.email}
              headingLevel={3}
              onChangeEmail={() => setForgot({ email: forgot.email, sent: false })}
              onBackToSignIn={() => setForgot(null)}
              testId="auth-signin-reset-sent"
            />
          ) : (
            <PasswordResetRequestScreen
              api={authApi}
              initialEmail={forgot.email}
              headingLevel={3}
              onRequested={(email) => setForgot({ email, sent: true })}
              onBackToSignIn={() => setForgot(null)}
              testId="auth-signin-reset"
            />
          )
        ) : (
          <div className={kind === "magic" ? "grid gap-8 @3xl/page:grid-cols-[minmax(0,1fr)_16rem]" : undefined}>
            <SignInScreen
              key={`${kind}-${run}`}
              api={authApi}
              org={org}
              methods={signInMethodsFor(org, kind === "magic" ? "magic-link" : "password")}
              returnTo={returnTo}
              headingLevel={3}
              onAuthenticated={(userId, destination) => setResult({ userId, destination })}
              onStepChange={setStep}
              onMagicLinkSent={setMagicEmail}
              onForgotPassword={(email) => setForgot({ email, sent: false })}
              testId="auth-signin"
            />
            {kind === "magic" && (
              <div className="min-w-0 @3xl/page:pt-10">
                <MockMailbox email={magicEmail ?? ""} onOpen={openMail} testId="auth-signin-mailbox" />
              </div>
            )}
          </div>
        )}
      </DemoFrame>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <ResultLine testId="auth-signin-state">
          状態：
          {result
            ? `認証済み（${userName(result.userId)}）。移動先：${destinationText(result.destination)}`
            : step === "mfa"
              ? "追加の確認が必要（まだ認証済みではない）"
              : "未認証"}
        </ResultLine>
        <Button variant="outline" size="sm" onClick={restart} data-testid="auth-signin-restart">
          最初からやり直す
        </Button>
      </div>
    </div>
  )
}

const resolveDestination = (userId: string, returnTo: string | null) =>
  resolveReturnTo(returnTo, { fallback: homePathOf(userId), isAllowed: (p) => canOpenPath(userId, p) })

// ---------------------------------------------------------------- 多要素認証
const mfaUsers: [UserId, string][] = [
  ["u-sato", "佐藤 花子（認証アプリ、SMS、リカバリーコード）"],
  ["u-suzuki", "鈴木 一郎（SMS だけ）"],
  ["u-tanaka", "田中 美咲（認証アプリだけ）"],
]

function MfaDemo() {
  const [userId, setUserId] = useState<UserId>("u-sato")
  const [expired, setExpired] = useState(false)
  // 製品の指定の例：入力が揃ったら自動で送信するか、リカバリーコードの大文字・小文字を区別するか
  const [autoSubmit, setAutoSubmit] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [challenge, setChallenge] = useState<Awaited<ReturnType<typeof authApi.signInWithPassword>> | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [run, setRun] = useState(0)

  // 設定を変えたら、同じ操作の中で前の画面を消す（古い確認の画面に入力させない）
  const reset = (apply: () => void) => {
    setChallenge(null)
    setResult(null)
    apply()
  }

  // 1 つ目の要素（パスワード）の確認が済んだ状態から始める（模擬）
  useEffect(() => {
    let active = true
    authServer.codeTtlMs = expired ? 0 : 5 * 60_000
    authServer.recoveryCaseSensitive = caseSensitive
    authApi.signInWithPassword({ org: "hq", email: users[userId].email, password: demoPassword }).then(
      (r) => active && setChallenge(r),
      () => undefined
    )
    return () => {
      active = false
    }
  }, [userId, expired, caseSensitive, run])

  return (
    <div className="flex flex-col gap-6">
      <DemoControls legend="利用者（登録している方式）">
        {mfaUsers.map(([v, l]) => (
          <Radio key={v} name="auth-mfa-user" checked={userId === v} onChange={() => reset(() => setUserId(v))}>
            {l}
          </Radio>
        ))}
      </DemoControls>
      <DemoControls legend="コードの有効期限（模擬）">
        <Radio name="auth-mfa-ttl" checked={!expired} onChange={() => reset(() => setExpired(false))}>
          5 分
        </Radio>
        <Radio name="auth-mfa-ttl" checked={expired} onChange={() => reset(() => setExpired(true))}>
          切れている
        </Radio>
      </DemoControls>
      <DemoControls legend="リカバリーコードの大文字・小文字（製品の指定）">
        <Radio name="auth-mfa-case" checked={!caseSensitive} onChange={() => reset(() => setCaseSensitive(false))}>
          区別しない（大文字にそろえる）
        </Radio>
        <Radio name="auth-mfa-case" checked={caseSensitive} onChange={() => reset(() => setCaseSensitive(true))}>
          区別する（入力のまま送る）
        </Radio>
        <label className="flex min-h-10 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={autoSubmit} onChange={(e) => setAutoSubmit(e.target.checked)} className="size-4 accent-[var(--primary)]" data-testid="auth-mfa-auto-submit" />
          コードの桁数が揃ったら自動で送信する
        </label>
      </DemoControls>
      <DemoFrame testId="auth-mfa-frame">
        {result ? (
          <ResultLine testId="auth-mfa-result">{result}</ResultLine>
        ) : challenge?.kind === "mfa-required" ? (
          <MfaScreen
            key={challenge.challenge.id}
            api={authApi}
            challenge={challenge.challenge}
            headingLevel={3}
            autoSubmit={autoSubmit}
            recoveryCaseSensitive={caseSensitive}
            onAuthenticated={(id) => setResult(`認証済み：${userName(id)}`)}
            onCancel={() => setResult("ログインの最初の画面に戻りました（パスワードから入力し直す）")}
            testId="auth-mfa"
          />
        ) : (
          <p className="text-ui text-muted-foreground" aria-busy="true">
            準備しています
          </p>
        )}
      </DemoFrame>
      <div>
        <Button variant="outline" size="sm" onClick={() => reset(() => setRun((n) => n + 1))} data-testid="auth-mfa-restart">
          最初からやり直す
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 新規登録とメールの確認
type SignUpState = { kind: "form" } | { kind: "verify"; email: string; sent: boolean } | { kind: "done"; userId: string }

function SignUpDemo() {
  const [invited, setInvited] = useState(false)
  const [mailFails, setMailFails] = useState(false)
  const [state, setState] = useState<SignUpState>({ kind: "form" })
  const [run, setRun] = useState(0)
  useEffect(() => {
    authServer.mode["sign-up"] = mailFails ? "mail-failed" : "success"
    authServer.mode["verification-send"] = mailFails ? "mail-failed" : "success"
  }, [mailFails])
  const restart = () => {
    setState({ kind: "form" })
    setRun((n) => n + 1)
  }
  return (
    <div className="flex flex-col gap-6">
      <DemoControls legend="開き方">
        <Radio
          name="auth-signup-entry"
          checked={!invited}
          onChange={() => {
            setInvited(false)
            restart()
          }}
        >
          通常
        </Radio>
        <Radio
          name="auth-signup-entry"
          checked={invited}
          onChange={() => {
            setInvited(true)
            restart()
          }}
        >
          招待のリンク（{demoInvitation.email}）
        </Radio>
      </DemoControls>
      <DemoControls legend="確認のメールの送信（模擬）">
        <Radio name="auth-signup-mail" checked={!mailFails} onChange={() => setMailFails(false)}>
          成功
        </Radio>
        <Radio name="auth-signup-mail" checked={mailFails} onChange={() => setMailFails(true)}>
          送信に失敗
        </Radio>
      </DemoControls>
      <DemoFrame testId="auth-signup-frame">
        {state.kind === "form" && (
          <SignUpScreen
            key={run}
            api={authApi}
            invitation={invited ? { email: demoInvitation.email, workspaceName: workspaces[demoInvitation.workspaceId].name, inviterName: demoInvitation.inviterName } : null}
            headingLevel={3}
            onVerificationPending={(email, sent) => setState({ kind: "verify", email, sent })}
            onAuthenticated={(userId) => setState({ kind: "done", userId })}
            testId="auth-signup"
          />
        )}
        {state.kind === "verify" && (
          <div className="grid gap-8 @3xl/page:grid-cols-[minmax(0,1fr)_16rem]">
            <EmailVerificationScreen
              api={authApi}
              email={state.email}
              emailSent={state.sent}
              headingLevel={3}
              onEmailChange={(email) => setState({ kind: "verify", email, sent: true })}
              onBackToSignIn={restart}
              testId="auth-verify"
            />
            <div className="min-w-0 @3xl/page:pt-10">
              <MockMailbox
                email={state.email}
                testId="auth-signup-mailbox"
                onOpen={(mail) =>
                  authApi.openVerificationLink({ email: mail.to }).then(
                    (r) => r.kind === "authenticated" && setState({ kind: "done", userId: r.userId }),
                    () => undefined
                  )
                }
              />
            </div>
          </div>
        )}
        {state.kind === "done" && (
          <div className="flex flex-col items-start gap-2" data-testid="auth-signup-done">
            <p className="text-heading">利用を開始しました（模擬）</p>
            <p className="text-ui text-muted-foreground">次は Onboarding の最初の画面に移動する。追加のプロフィールや利用目的は、ここでは尋ねない。</p>
          </div>
        )}
      </DemoFrame>
      <div>
        <Button variant="outline" size="sm" onClick={restart} data-testid="auth-signup-restart">
          最初からやり直す
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- パスワードの再設定
type ResetState =
  | { kind: "request"; email: string }
  | { kind: "sent"; email: string }
  | { kind: "link"; reason: "expired" | "invalid" }
  | { kind: "new"; email: string }
  | { kind: "signin"; email: string; changed: boolean }

function ResetDemo() {
  const [mailFails, setMailFails] = useState(false)
  const [token, setToken] = useState<"valid" | "expired" | "used">("valid")
  const [state, setState] = useState<ResetState>({ kind: "request", email: "" })
  const [signedIn, setSignedIn] = useState<string | null>(null)
  useEffect(() => {
    authServer.mode["reset-request"] = mailFails ? "mail-failed" : "success"
  }, [mailFails])
  const back = () => {
    setSignedIn(null)
    setState({ kind: "request", email: "" })
  }
  const openLink = () =>
    authApi.checkResetToken({ token }).then(
      (r) => setState(r.status === "valid" ? { kind: "new", email: r.email } : { kind: "link", reason: r.status }),
      () => undefined
    )
  return (
    <div className="flex flex-col gap-6">
      <DemoControls legend="再設定のメールの送信（模擬）">
        <Radio name="auth-reset-mail" checked={!mailFails} onChange={() => setMailFails(false)}>
          成功
        </Radio>
        <Radio name="auth-reset-mail" checked={mailFails} onChange={() => setMailFails(true)}>
          送信に失敗
        </Radio>
      </DemoControls>
      <DemoControls legend="メールのリンクの状態（模擬）">
        {(
          [
            ["valid", "有効"],
            ["expired", "期限切れ"],
            ["used", "使用済み"],
          ] as const
        ).map(([v, l]) => (
          <Radio key={v} name="auth-reset-token" checked={token === v} onChange={() => setToken(v)}>
            {l}
          </Radio>
        ))}
      </DemoControls>
      <DemoFrame testId="auth-reset-frame">
        <div className="grid gap-8 @3xl/page:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0">
            {state.kind === "request" && (
              <PasswordResetRequestScreen
                api={authApi}
                initialEmail={state.email}
                headingLevel={3}
                onRequested={(email) => setState({ kind: "sent", email })}
                onBackToSignIn={() => setState({ kind: "signin", email: "", changed: false })}
                testId="auth-reset-request"
              />
            )}
            {state.kind === "sent" && (
              <PasswordResetSentScreen
                api={authApi}
                email={state.email}
                headingLevel={3}
                onChangeEmail={() => setState({ kind: "request", email: state.email })}
                onBackToSignIn={() => setState({ kind: "signin", email: state.email, changed: false })}
                testId="auth-reset-sent"
              />
            )}
            {state.kind === "link" && (
              <ResetLinkProblemScreen reason={state.reason} headingLevel={3} onRequestAgain={back} onBackToSignIn={() => setState({ kind: "signin", email: "", changed: false })} testId="auth-reset-link" />
            )}
            {state.kind === "new" && (
              <NewPasswordScreen
                api={authApi}
                token={token === "valid" ? "valid" : token}
                email={state.email}
                headingLevel={3}
                onChanged={(email) => setState({ kind: "signin", email, changed: true })}
                onLinkProblem={(reason) => setState({ kind: "link", reason })}
                testId="auth-new-password"
              />
            )}
            {state.kind === "signin" &&
              (signedIn ? (
                <ResultLine testId="auth-reset-result">{signedIn}</ResultLine>
              ) : (
                <SignInScreen
                  api={authApi}
                  org="hq"
                  initialEmail={state.email}
                  headingLevel={3}
                  // 成功の Dialog を出さず、次の画面（ログイン）の中で知らせる
                  status={state.changed ? "パスワードを変更しました。新しいパスワードでログインしてください。" : undefined}
                  onForgotPassword={(email) => setState({ kind: "request", email })}
                  onAuthenticated={(userId) => setSignedIn(`認証済み：${userName(userId)}`)}
                  testId="auth-reset-signin"
                />
              ))}
          </div>
          {(state.kind === "sent" || state.kind === "request") && (
            <div className="min-w-0 @3xl/page:pt-10">
              <MockMailbox email={state.email} onOpen={openLink} testId="auth-reset-mailbox" />
            </div>
          )}
        </div>
      </DemoFrame>
      <div>
        <Button variant="outline" size="sm" onClick={back} data-testid="auth-reset-restart">
          最初からやり直す
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 復帰先の検証
function ReturnToTable() {
  const rows: [string, string][] = [
    ...returnToSamples,
    ["", "指定なし"],
    ["/w/hq/customers?q=100%", "不完全なエンコード（「%」の後が 16 進数でない）"],
    ["/w/hq/../hq/settings/billing", "ドットのセグメント（解析で値が変わる）"],
    ["/%252F%252Fevil.example", "二重にエンコードした //"],
    ["/w/hq/customers?q=%E9%9D%92%E5%B1%B1", "エンコードした検索の条件（青山）"],
  ]
  return (
    <TableScrollArea>
    <Table data-testid="auth-return-to-table">
      <TableCaption className="sr-only">復帰先の値と、ログインした利用者ごとの移動先</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>復帰先の値</TableHead>
          <TableHead>佐藤 花子（本社営業部の管理者、西日本営業部のメンバー）</TableHead>
          <TableHead>田中 美咲（本社営業部の閲覧者）</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([value, label]) => (
          <TableRow key={value || "empty"}>
            <TableCell>
              <span className="block">{label}</span>
              <code className="text-caption text-muted-foreground [word-break:break-all]">{value || "（なし）"}</code>
            </TableCell>
            {(["u-sato", "u-tanaka"] as const).map((u) => (
              <TableCell key={u} className="[word-break:break-all]">
                {destinationText(resolveDestination(u, value))}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </TableScrollArea>
  )
}

// ---------------------------------------------------------------- セッション切れと再認証
type SaveState = "idle" | "saving" | "saved" | "failed" | "unknown"
/** 再認証の後に表示するもの。content：顧客の情報。no-access：閲覧できない。other-workspace：別のワークスペース */
type SessionView = "content" | "no-access" | "other-workspace"
type VerifyArgs = {
  plan: ReauthenticationPlan
  /** 作業を保持したときの利用者とワークスペース */
  previousUserId: string
  previousWorkspaceId: WorkspaceId
  /** 再認証の後の利用者、セッション、ワークスペース */
  nextUserId: string
  sessionId: string
  workspaceId: WorkspaceId
  /** 結果が不明な保存の内容（同じ利用者の場合だけ） */
  unconfirmed: string | null
}

const discardLabels: Record<ReauthDiscardTarget, string> = {
  input: "入力",
  credentials: "認証情報",
  notifications: "通知",
  cache: "キャッシュ",
  "async-results": "非同期の結果",
  "unconfirmed-mutation": "結果が不明な保存",
}

function SessionDemo() {
  const [userId, setUserId] = useState<string>("u-sato")
  // 作業を保持しているワークスペース（この例の顧客は本社営業部のもの）
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId>("hq")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [phase, setPhase] = useState<"active" | "expired" | "verifying">("active")
  const [view, setView] = useState<SessionView>("content")
  const [refreshable, setRefreshable] = useState(false)
  const [revoke, setRevoke] = useState<"none" | "edit" | "view">("none")
  const [nextWorkspace, setNextWorkspace] = useState<WorkspaceId>("hq")
  const [expireNextSave, setExpireNextSave] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  // 結果を確かめていない保存の内容。再認証の後に、再送信せずに、現在の認可で照会して確かめる
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [canEdit, setCanEdit] = useState(true)
  const [log, setLog] = useState("")
  // 利用者とワークスペースが変わったら、前のスコープの保存と更新の結果を反映しない
  const guard = useScopeGuard(`${userId}:${workspaceId}`)
  // 再認証の後の確認（利用者が変わってもスコープを変えない。最後の確認だけを反映する）
  const verifyGuard = useScopeGuard("session-verify")
  const verifyArgs = useRef<VerifyArgs | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const saving = useRef(false)
  const customer = customers[0]

  // 最初のセッション（ログイン済みの状態から始める）
  useEffect(() => {
    const id = authApi.startSession("u-sato")
    setSessionId(id)
    authApi.loadNote({ sessionId: id }).then((t) => setSaved(t), () => undefined)
    return () => authApi.expireSession(id)
  }, [])
  useEffect(() => {
    authServer.revokeEditOnReauth = revoke === "edit"
    authServer.revokeViewOnReauth = revoke === "view"
  }, [revoke])

  const value = draft ?? saved ?? ""
  const dirty = draft !== null && draft !== saved

  const expire = () => {
    if (!sessionId) return
    authApi.expireSession(sessionId)
    if (!refreshable) {
      setPhase("expired")
      setLog("セッションが切れました。再認証が必要です。")
      return
    }
    // 安全に自動で更新できる場合は、利用者に知らせずに更新する
    const ticket = guard.begin("refresh")
    authApi
      .refreshSession({ sessionId, userId }, { signal: ticket.signal })
      .then(
        (r) => {
          if (!guard.isLatest(ticket)) return
          setSessionId(r.sessionId)
          setLog("セッションを自動で更新しました（画面には表示しない）。")
        },
        (e) => {
          if (isAbortError(e) || !guard.isLatest(ticket)) return
          setPhase("expired")
          setLog("自動の更新に失敗しました。再認証が必要です。")
        }
      )
      .finally(() => guard.release(ticket))
  }

  const save = () => {
    if (!sessionId || saving.current || draft === null) return
    saving.current = true
    if (expireNextSave) {
      authServer.expireDuringSave = true
      setExpireNextSave(false)
    }
    const text = draft
    const ticket = guard.begin("save")
    setSaveState("saving")
    setMessage("")
    authApi
      .saveNote({ sessionId, text }, { signal: ticket.signal })
      .then(
        (r) => {
          if (!guard.isLatest(ticket)) return
          setSaved(r.text)
          setDraft(null)
          setSaveState("saved")
          setMessage("保存しました。")
        },
        (e) => {
          if (isAbortError(e) || !guard.isLatest(ticket)) return
          const sessionGone = !authApi.isSessionValid(sessionId)
          if (e instanceof MockUnknownError) {
            // 応答が届かなかった：保存されたかどうかわからない。再認証の後に、再送信せずに確かめる
            setUnconfirmed(text)
            setSaveState("unknown")
            setMessage("保存の結果を確かめられませんでした。")
          } else {
            setSaveState("failed")
            setMessage(sessionGone ? "セッションが切れていたため、保存されていません。" : "保存できませんでした。もう一度お試しください。")
          }
          if (sessionGone) {
            setPhase("expired")
            setLog(e instanceof MockUnknownError ? "保存の途中でセッションが切れました（サーバーでは保存済み、応答は届いていない）。" : "セッションが切れていました。")
          }
        }
      )
      .finally(() => {
        saving.current = false
        guard.release(ticket)
      })
  }

  // planReauthentication と decideReauthenticationRestore の discard に従って破棄する
  const discard = (targets: readonly ReauthDiscardTarget[]) => {
    if (targets.includes("input")) setDraft(null)
    if (targets.includes("cache")) setSaved(null)
    if (targets.includes("unconfirmed-mutation")) setUnconfirmed(null)
    // async-results：利用者かワークスペースが変わると guard のスコープが変わり、前のスコープの結果を反映しない
    // credentials：前のセッションの ID は onReauthenticated で置き換え、ログインの画面の入力はアンマウントで消える
  }

  const onReauthenticated = (nextUserId: string) => {
    const previous = userId
    const id = authApi.startSession(nextUserId, { reauthenticated: true })
    setSessionId(id)
    // 同じ利用者であることだけで、作業を復元しない。ワークスペースが変わった場合も、そのまま復元しない
    const plan = planReauthentication({
      previousUserId: previous,
      userId: nextUserId,
      previousWorkspaceId: workspaceId,
      workspaceId: nextWorkspace,
      hasUnconfirmedMutation: unconfirmed !== null,
    })
    if (plan.kind !== "same-user") {
      discard(plan.discard)
      setUserId(nextUserId)
      setWorkspaceId(nextWorkspace)
      setSaveState("idle")
      setMessage("")
      setLog(
        `${plan.kind === "different-user" ? "別の利用者" : "別のワークスペース"}でログインしました。前の作業を復元せず、次を破棄しました：${plan.discard.map((d) => discardLabels[d]).join("、")}（${plan.kind}）。`
      )
    }
    verify({
      plan,
      previousUserId: previous,
      previousWorkspaceId: workspaceId,
      nextUserId,
      sessionId: id,
      workspaceId: nextWorkspace,
      unconfirmed: plan.kind === "same-user" ? unconfirmed : null,
    })
  }

  // 権限を取得し直し、現在の認可で対象を照会してから、復元するかを決める（decideReauthenticationRestore）。
  // 確認の要求は、最後に始めたものだけを反映し、アンマウントの後や中止の後の応答を反映しない（verifyGuard）。
  // 失敗した場合は内容を表示せず、もう一度確かめる操作を示す。
  const verify = (args: VerifyArgs) => {
    const { plan, nextUserId, sessionId: sid, workspaceId: ws, unconfirmed: pendingText } = args
    const ticket = verifyGuard.begin("verify")
    setPhase("verifying")
    setVerifyError(null)
    verifyArgs.current = args
    const latest = () => verifyGuard.isLatest(ticket)
    const run = async () => {
      const permissions = await authApi.fetchPermissions({ userId: nextUserId, workspaceId: ws }, { signal: ticket.signal })
      if (!latest()) return
      const allowView = permissions.includes("customers.view")
      const allowEdit = permissions.includes("customers.edit")
      if (plan.kind === "different-workspace" || ws !== "hq") {
        // この例の顧客は本社営業部のもの。別のワークスペースでは、その顧客の情報を取得しない
        setCanEdit(false)
        setView("other-workspace")
        setPhase("active")
        return
      }
      // 閲覧できる場合だけ、現在のセッション（現在の認可）で照会する。保存の結果の照会にも、現在の認可が必要
      let note: string | null = null
      if (allowView) {
        note = await authApi.loadNote({ sessionId: sid }, { signal: ticket.signal })
        if (!latest()) return
      }
      if (plan.kind === "different-user") {
        setCanEdit(allowEdit)
        setSaved(note)
        setView(allowView ? "content" : "no-access")
        setPhase("active")
        return
      }
      const decision = decideReauthenticationRestore(plan, {
        // セッションの利用者（再認証で発行したセッション）と、作業を保持した利用者を比べる
        sameAccount: nextUserId === args.previousUserId,
        sameWorkspace: ws === args.previousWorkspaceId,
        canView: allowView,
        canEdit: allowEdit,
        target: "unchanged",
        pendingMutation: plan.confirmPending && note !== null ? (note === pendingText ? "applied" : "not-applied") : undefined,
      })
      discard(decision.discard)
      setCanEdit(decision.allowEdit)
      setView(decision.showTarget ? "content" : "no-access")
      if (decision.showTarget && note !== null) setSaved(note)
      if (decision.pendingMutation !== "none" && decision.pendingMutation !== "unresolved") setUnconfirmed(null)
      if (decision.pendingMutation === "applied") {
        setDraft(null)
        setSaveState("saved")
      } else if (decision.pendingMutation === "not-applied") setSaveState("failed")
      else setSaveState("idle")
      switch (decision.reason) {
        case "no-view-permission":
          setMessage("閲覧の権限がなくなったため、この顧客の情報と、保存していない入力内容を表示しません。")
          break
        case "no-edit-permission":
          setMessage("編集の権限がなくなったため、保存していない入力内容を破棄しました。")
          break
        case null:
          if (decision.pendingMutation === "applied") setMessage("保存されていたことを確かめました（再送信していません）。")
          else if (decision.pendingMutation === "not-applied") setMessage("保存されていませんでした。入力内容を確かめて、もう一度保存してください。")
          else if (draft !== null) setMessage("保存していない入力内容を復元しました。")
          break
        default:
          setMessage("前の作業を復元しませんでした。")
      }
      setPhase("active")
    }
    run().catch((e) => {
      if (isAbortError(e) || !latest()) return
      setVerifyError("権限と保存の結果を確かめられませんでした。")
    })
  }

  const role = membershipOf(userId as UserId, workspaceId)?.role
  return (
    <div className="flex flex-col gap-6">
      <DemoControls legend="セッションの更新（模擬）">
        <Radio name="auth-session-refresh" checked={!refreshable} onChange={() => setRefreshable(false)}>
          再認証が必要
        </Radio>
        <Radio name="auth-session-refresh" checked={refreshable} onChange={() => setRefreshable(true)}>
          安全に自動で更新できる
        </Radio>
      </DemoControls>
      <DemoControls legend="再認証の後の権限（模擬）">
        <Radio name="auth-session-perm" checked={revoke === "none"} onChange={() => setRevoke("none")}>
          変わらない
        </Radio>
        <Radio name="auth-session-perm" checked={revoke === "edit"} onChange={() => setRevoke("edit")}>
          編集の権限がなくなる
        </Radio>
        <Radio name="auth-session-perm" checked={revoke === "view"} onChange={() => setRevoke("view")}>
          閲覧の権限がなくなる
        </Radio>
      </DemoControls>
      <DemoControls legend="再認証の後のワークスペース（模擬）">
        <Radio name="auth-session-ws" checked={nextWorkspace === "hq"} onChange={() => setNextWorkspace("hq")}>
          同じ（本社営業部）
        </Radio>
        <Radio name="auth-session-ws" checked={nextWorkspace === "west"} onChange={() => setNextWorkspace("west")}>
          別のワークスペース（西日本営業部）
        </Radio>
      </DemoControls>
      <DemoControls legend="セッションの操作（模擬）">
        <Button variant="outline" size="sm" onClick={expire} disabled={phase !== "active"} data-testid="auth-session-expire">
          セッションを切る
        </Button>
        <label className="flex min-h-10 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={expireNextSave} onChange={(e) => setExpireNextSave(e.target.checked)} className="size-4 accent-[var(--primary)]" data-testid="auth-session-expire-on-save" />
          次の保存の途中でセッションを切る（応答は届かない）
        </label>
      </DemoControls>
      <DemoFrame testId="auth-session-frame">
        {phase === "expired" ? (
          // セッションが切れている間は、機密のデータを表示しない（画面の背後にも残さない）
          <ReauthScreen
            api={authApi}
            org="hq"
            user={userId in users ? users[userId as UserId] : { id: userId, name: "利用者", email: "" }}
            headingLevel={3}
            keepsWork={draft !== null || unconfirmed !== null}
            onAuthenticated={onReauthenticated}
            testId="auth-reauth"
          />
        ) : phase === "verifying" ? (
          <div className="flex flex-col items-start gap-4" data-testid="auth-session-verifying">
            {/* 確かめられない間は、内容を表示しない */}
            <p className="text-ui text-muted-foreground" role="status" aria-busy={verifyError ? undefined : true}>
              {verifyError ?? "権限を確かめています"}
            </p>
            {verifyError && (
              <Button variant="outline" size="sm" onClick={() => verifyArgs.current && verify(verifyArgs.current)} data-testid="auth-session-verify-retry">
                もう一度確かめる
              </Button>
            )}
          </div>
        ) : view === "other-workspace" ? (
          <div className="flex flex-col items-start gap-2" data-testid="auth-session-other-workspace">
            <p className="text-heading">{workspaces[workspaceId].name}のホーム（模擬）</p>
            <p className="text-ui text-muted-foreground">別のワークスペースでログインしたため、前のワークスペースの作業を復元していません。</p>
          </div>
        ) : view === "no-access" ? (
          <div className="flex flex-col items-start gap-2" data-testid="auth-session-no-access">
            <p className="text-heading">この顧客を表示する権限がありません</p>
            <AuthStatus data-testid="auth-session-message">{message}</AuthStatus>
          </div>
        ) : (
          <div className="flex flex-col gap-6" data-testid="auth-session-content">
            <div className="flex flex-col gap-1">
              <h3 className="text-heading">{customer.company}</h3>
              <p className="text-ui text-muted-foreground">
                {userName(userId)}（{role ? roles[role].name : "所属なし"}）として表示しています。担当：{customer.owner}、電話：{customer.phone}
              </p>
            </div>
            <Field>
              <FieldLabel>社内メモ</FieldLabel>
              <Textarea
                value={value}
                readOnly={!canEdit}
                onChange={(e) => {
                  setDraft(e.target.value)
                  if (saveState !== "saving") setSaveState("idle")
                }}
                data-testid="auth-session-note"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-4">
              {canEdit && (
                <Button onClick={save} loading={saveState === "saving"} disabled={!dirty && saveState !== "failed"} data-testid="auth-session-save">
                  保存
                </Button>
              )}
              <AuthStatus data-testid="auth-session-message">{message}</AuthStatus>
            </div>
          </div>
        )}
      </DemoFrame>
      <p className="text-ui text-muted-foreground" data-testid="auth-session-log">
        模擬のサーバーの記録：{log || "なし"}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- ログアウトとアカウントの切り替え
type Account = { userId: UserId; workspaceId: WorkspaceId }

function AccountContent({ account, onDirtyChange, exportApi }: { account: Account; onDirtyChange: (dirty: boolean) => void; exportApi: () => void }) {
  // この部品はスコープ（アカウントとワークスペース）ごとに作り直す。検索語、選択、入力は前のスコープから引き継がない。
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [memo, setMemo] = useState("")
  const rows = customers.filter((c) => (account.workspaceId === "hq" ? c.region !== "近畿" : c.region === "近畿")).slice(0, 4)
  const visible = rows.filter((c) => c.company.includes(search))
  const unread = notificationsOf(account.workspaceId).filter((n) => !n.read).length
  const role = membershipOf(account.userId, account.workspaceId)?.role
  return (
    <div className="flex flex-col gap-6" data-testid="auth-account-content" data-scope={`${account.userId}:${account.workspaceId}`}>
      <p className="text-ui text-muted-foreground" data-testid="auth-account-summary">
        {users[account.userId].name}・{workspaces[account.workspaceId].name}・{role ? roles[role].name : "所属なし"}・未読の通知 {unread} 件
      </p>
      <Field>
        <FieldLabel>顧客を検索</FieldLabel>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} data-testid="auth-account-search" />
      </Field>
      <ul className="flex flex-col" data-testid="auth-account-list">
        {visible.map((c) => (
          <li key={c.id} className="border-b border-border last:border-b-0">
            <Field orientation="horizontal">
              <Checkbox
                checked={selected.has(c.id)}
                onCheckedChange={(v) =>
                  setSelected((s) => {
                    const next = new Set(s)
                    if (v) next.add(c.id)
                    else next.delete(c.id)
                    return next
                  })
                }
              />
              <FieldLabel>{c.company}</FieldLabel>
            </Field>
          </li>
        ))}
      </ul>
      <p className="text-ui" data-testid="auth-account-selected">
        選択：{selected.size} 件
      </p>
      <Field>
        <FieldLabel>メモ（未保存）</FieldLabel>
        <Input
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value)
            onDirtyChange(e.target.value !== "")
          }}
          data-testid="auth-account-memo"
        />
      </Field>
      <div>
        <Button variant="outline" size="sm" onClick={exportApi} data-testid="auth-account-export">
          顧客を書き出す（3 秒）
        </Button>
      </div>
    </div>
  )
}

function AccountDemo() {
  const { toast, dismiss } = useToast()
  const [account, setAccount] = useState<Account | null>({ userId: "u-sato", workspaceId: "hq" })
  const [dirty, setDirty] = useState(false)
  const [confirm, setConfirm] = useState<(() => void) | null>(null)
  const [status, setStatus] = useState("")
  const scope = account ? `${account.userId}:${account.workspaceId}` : "signed-out"
  const guard = useScopeGuard(scope)
  const toastIds = useRef<string[]>([])
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss

  // スコープが変わったら、前のスコープの Toast を閉じる（別のスコープで誤って操作させない）
  useEffect(
    () => () => {
      for (const id of toastIds.current) dismissRef.current(id)
      toastIds.current = []
    },
    [scope]
  )

  // 未保存の変更がある場合だけ、破棄の確認を挟む
  const guarded = (action: () => void) => {
    if (dirty) setConfirm(() => action)
    else action()
  }
  const change = (next: Account | null) => {
    setDirty(false)
    setAccount(next)
    setStatus(next ? "" : "ログアウトしました。")
  }

  const startExport = () => {
    if (!account) return
    const ticket = guard.begin("export")
    const name = workspaces[account.workspaceId].name
    authApi
      .exportCustomers({ workspaceId: account.workspaceId }, { signal: ticket.signal })
      .then(
        () => {
          // 開始したスコープの最新の処理の結果だけを反映する（A → B → A でも反映しない。AbortSignal に従わない応答も）
          if (!guard.isLatest(ticket)) return
          const id = toast({ variant: "success", title: `顧客の書き出しが完了しました（${name}）` })
          if (id) toastIds.current.push(id)
        },
        () => undefined
      )
      .finally(() => guard.release(ticket))
  }

  const memberships = account ? Object.values(workspaces).filter((w) => membershipOf(account.userId, w.id)) : []
  return (
    <DemoFrame testId="auth-account-frame">
      <AuthStatus data-testid="auth-account-status" className="mb-4">
        {status}
      </AuthStatus>
      {account ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 text-ui">
              <span id="auth-account-ws-label">ワークスペース</span>
              <Select
                items={memberships.map((w) => ({ value: w.id, label: w.name }))}
                value={account.workspaceId}
                onValueChange={(v) => guarded(() => change({ ...account, workspaceId: v as WorkspaceId }))}
              >
                <SelectTrigger aria-labelledby="auth-account-ws-label" className="w-56 max-w-full" data-testid="auth-account-workspace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {memberships.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" data-testid="auth-account-menu" />}>{users[account.userId].name}</DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{users[account.userId].email}</DropdownMenuLabel>
                  {(["u-sato", "u-suzuki"] as const)
                    .filter((u) => u !== account.userId)
                    .map((u) => (
                      <DropdownMenuItem key={u} onClick={() => guarded(() => change({ userId: u, workspaceId: "hq" }))}>
                        {users[u].name}に切り替える
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {/* ログアウトは破壊的な操作ではないため、Destructive の赤にしない */}
                <DropdownMenuItem onClick={() => guarded(() => change(null))} data-testid="auth-account-logout">
                  ログアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <AccountContent key={scope} account={account} onDirtyChange={setDirty} exportApi={startExport} />
        </div>
      ) : (
        <div className="flex flex-col items-start gap-4" data-testid="auth-account-signed-out">
          <Button onClick={() => change({ userId: "u-sato", workspaceId: "hq" })}>佐藤 花子としてログインし直す（模擬）</Button>
        </div>
      )}
      <DiscardAlert
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        onDiscard={() => {
          const action = confirm
          setConfirm(null)
          action?.()
        }}
        testId="auth-account-discard"
      />
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- ページ
export function AuthenticationPage() {
  // 模擬のサーバーの設定は、ページを開くたびに既定に戻す（検品と例の操作を独立させる）
  useState(() => authServer.reset())
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / System & Account"
        name="Authentication"
        lead="ログイン、多要素認証、新規登録、メールの確認、パスワードの再設定、セッション切れの再認証を、必要最低限の手順で安全に行う。この画面の認証、メールの送信、セッションは、すべて模擬の処理である。"
      />

      <Section title="模擬のアカウント" lead="実際の認証情報は入力しない。次の値で例を操作できる。">
        <DemoAccounts />
      </Section>

      <Section title="レイアウト" lead="Minimal Shell の中に、最大 400px のフォームを中央に置く。Primary Button は全幅。Card は境界に意味がある場合、Split はブランドを伝える場合だけ使い、狭い幅では Split を解除する。">
        <LayoutDemo />
      </Section>

      <Section title="ログインと認証方式" lead="すべての方式を並べず、製品と組織のポリシーに合う方式を示す。本社営業部は多要素認証が必須、西日本営業部は組織の SSO だけを使う。">
        <SignInDemo />
      </Section>

      <Section title="多要素認証" lead="コードの入力欄は 1 つ。ペースト、自動入力、先頭の 0 を妨げない。再送信と代替の方式は、利用者が登録している場合だけ示す。ログインの情報をもう一度入力させない。">
        <MfaDemo />
      </Section>

      <Section title="新規登録とメールの確認" lead="利用の開始に必要な情報だけを尋ねる。利用規約への同意と、任意のお知らせの受け取りを分ける。送信できなかったメールを「送信しました」と表示しない。">
        <SignUpDemo />
      </Section>

      <Section title="パスワードの再設定" lead="申請の結果から、アカウントの有無がわからないようにする。模擬の受信箱には、実際に送信したメールだけが届く。">
        <ResetDemo />
      </Section>

      <Section title="復帰先の検証" lead="ログインの後は元の目的の画面に戻す。同じオリジンの相対パスで、利用者が開ける画面の場合だけ戻し、それ以外は既定の画面に移動する。">
        <ReturnToTable />
      </Section>

      <Section title="セッション切れと再認証" lead="安全に自動で更新できる場合は、利用者に意識させない。再認証が必要な場合は、機密のデータを隠してから案内する。保存の途中で切れた場合は、再送信の前に結果を確かめる。">
        <SessionDemo />
      </Section>

      <Section title="ログアウトとアカウントの切り替え" lead="通常のログアウトでは確認しない。未保存の変更がある場合だけ、破棄を確かめる。アカウントやワークスペースが変わったら、データ、選択、検索語、入力、通知、Toast、非同期処理の結果を前のスコープから引き継がない。">
        <AccountDemo />
      </Section>

      <Section title="判断基準">
        <Rules
          rows={[
            ["メールアドレス＋パスワード", "多くの製品の標準。パスワードマネージャーと自動入力を妨げない。ログインの欄に新規の設定の規則を適用しない"],
            ["外部アカウント", "利用者が業務で Google や Microsoft のアカウントを使っている場合。組織のポリシーで禁止されている場合は表示しない"],
            ["Passkey", "対応する端末と利用者が多い場合。端末の所持と生体認証などを確かめるため、追加の確認を省いてよい（製品が判断する）"],
            ["Magic Link", "ログインの頻度が低く、パスワードを覚えさせたくない製品。メールの到着を待つため、頻繁に使う業務の製品には向かない"],
            ["組織の SSO", "組織が認証基盤を指定している場合。その組織のログインでは、ほかの方式を表示しない"],
            ["多要素認証", "組織のポリシー、扱うデータの重要度で必須にする。すべての製品で標準の必須にしない"],
            ["エラー", "形式の誤りは入力欄の近く、認証情報の不一致はフォーム全体。不一致とアカウントの不存在を区別できない文にする"],
            ["遷移", "成功の Dialog を出さず、元の目的の画面に移動する。追加の確認が済むまで認証済みにしない"],
          ]}
        />
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="確認コードを 6 つの入力欄に分けた例">
              <div className="flex gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="flex size-10 items-center justify-center rounded-md border border-input text-heading">
                    {i < 2 ? "0" : ""}
                  </span>
                ))}
              </div>
            </Mock>
          }
          badNote="入力欄を桁ごとに分けると、ペースト、自動入力、削除、読み上げが桁ごとに分かれ、途中で失敗しやすい。"
          good={
            <Mock label="確認コードの入力欄が 1 つの例">
              <span className="text-ui font-medium">確認コード</span>
              <span className="flex h-12 w-full items-center rounded-md border border-input px-4 text-heading tracking-[0.2em] tabular-nums">012345</span>
            </Mock>
          }
          goodNote="入力欄は 1 つにし、桁の多さは文字の間隔で読みやすくする。空白やハイフンを含むペーストも受け付ける。"
        />
        <Compare
          bad={
            <Mock label="アカウントの有無がわかるエラーの例">
              <span className="text-ui text-destructive">このメールアドレスは登録されていません</span>
            </Mock>
          }
          badNote="未認証の利用者に、アカウントの有無を知らせる。登録されているアドレスを探す手がかりになる。"
          good={
            <Mock label="アカウントの有無がわからないエラーの例">
              <span className="text-ui font-medium">メールアドレスまたはパスワードが正しくありません</span>
              <span className="text-ui text-muted-foreground">パスワードを忘れた場合は、再設定できます。</span>
            </Mock>
          }
          goodNote="不一致と不存在を同じ文にし、次に取る行動（再設定）を示す。"
        />
        <Compare
          bad={
            <Mock label="ログアウトを赤い文字にし、確認の Dialog を出す例">
              <span className="text-ui text-destructive">ログアウト</span>
              <span className="text-ui text-muted-foreground">「本当にログアウトしますか？」</span>
            </Mock>
          }
          badNote="ログアウトは取り消せない破壊的な操作ではない。毎回の確認は手順を増やすだけになる。"
          good={
            <Mock label="ログアウトを通常の項目にする例">
              <span className="text-ui">ログアウト</span>
              <span className="text-ui text-muted-foreground">未保存の変更がある場合だけ「変更を破棄しますか？」</span>
            </Mock>
          }
          goodNote="通常の項目として置き、未保存の変更がある場合だけ破棄を確かめる。"
        />
        <Compare
          bad={
            <Mock label="パスワードの再入力欄を置いた例">
              <span className="text-ui font-medium">新しいパスワード</span>
              <span className="h-12 w-full rounded-md border border-input" />
              <span className="text-ui font-medium">新しいパスワード（確認）</span>
              <span className="h-12 w-full rounded-md border border-input" />
            </Mock>
          }
          badNote="再入力の欄を機械的に置くと、入力の負荷が 2 倍になる。パスワードマネージャーの生成した値では意味がない。"
          good={
            <Mock label="表示の切り替えで確かめる例">
              <span className="text-ui font-medium">新しいパスワード</span>
              <span className="flex h-12 w-full items-center justify-end rounded-md border border-input px-3 text-caption text-muted-foreground">表示</span>
              <span className="text-ui text-muted-foreground">12 文字以上</span>
            </Mock>
          }
          goodNote="表示の切り替えで入力を確かめられるため、再入力の欄を省く。要件は入力の前から示す。"
        />
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "パスワードの表示の切り替えは type=\"button\"。名前は「パスワードを表示」で固定し、状態を aria-pressed で伝える。ポインターで押しても、入力欄のフォーカスとカーソルの位置を保つ。",
            "確認コードは 1 つの入力欄（autocomplete=\"one-time-code\"、inputmode=\"numeric\"）。桁数は説明の文で伝え、maxlength で切り詰めない。",
            "フォーム全体のエラーは常に置いた role=\"alert\" の領域、処理の知らせは role=\"status\" の領域の中身を変えて伝える。エラーでフォーカスを移さない。",
            "送信時の入力の誤りは、最初の誤りのある欄にフォーカスを移す。フォーカスが外れたときの誤りは、フォームの aria-live=\"polite\" の領域で知らせる。",
            "Loading 中の Button はフォーカスを保ったまま押せない状態になり、二重に送信しない。",
            "狭い幅では Split の横の面を表示せず、フォームを先に示す。高さが足りない場合は、Minimal Shell の main がそのままスクロールする。",
          ]}
        />
      </Section>
    </article>
  )
}
