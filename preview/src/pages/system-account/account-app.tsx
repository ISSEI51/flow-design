import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { planReauthentication, resolveReturnTo } from "@/patterns/auth-flow"
import { MinimalShell } from "@/patterns/app-shell"
import { ServiceUnavailable } from "@/patterns/service-state"
import { summarizeIssues } from "@/patterns/system-status"

import { authApi, authServer, demoInvitation, homePathOf, type SentEmail } from "../../data/system-account/auth-server"
import { currentPermissionsOf } from "../../data/system-account/permission-server"
import { roles, users, workspaces, type UserId, type WorkspaceId } from "../../data/system-account/model"
import { NEW_WORKSPACE_ID, type OnboardingViewer, viewerOf } from "../../data/system-account/onboarding-data"
import { onboardingApi } from "../../data/system-account/onboarding-server"
import {
  AuthShell,
  EmailVerificationScreen,
  MockMailbox,
  NewPasswordScreen,
  PasswordResetRequestScreen,
  PasswordResetSentScreen,
  ProductLogo,
  ReauthScreen,
  ResetLinkProblemScreen,
  SignInScreen,
  SignUpScreen,
} from "./auth-screens"
import {
  accountHref,
  canEnterWorkspace,
  canOpenAccountPath,
  pathFromRoute,
  readAccountRoute,
  routeFromPath,
  type AccountRoute,
  type AccountStart,
} from "./account-route"
import { SignedInApp, type NavigationBlocker } from "./account-signed-in"
import { AccountVerifyPanel } from "./account-verify"
import { CreateOrganizationSetup, InvitedMemberStart, OnboardingProduct } from "./onboarding-screens"
import { buildSystemIssues, formatTime, useSystemMonitor, type SystemMonitor } from "./system-screens"

// System & Account の 6 種類を組み合わせた、営業管理の検証用の画面（製品側のコード）。正式な Pages の実装ではない。
// Registry の @/patterns/* と、各 Pattern のプレビューの画面の部品（*-screens.tsx）を組み合わせる。複製しない。
//
// 段階（phase）
// - auth：ログイン、多要素認証、新規登録、メールの確認、パスワードの再設定（Minimal Shell）
// - invited：招待されたメンバーの利用開始（Minimal Shell）
// - create-org：新規登録した利用者の組織の作成（Minimal Shell）
// - new-org：作成した直後の組織の最初の画面（Onboarding の範囲。初回利用の Empty State と Checklist）
// - app：ログインした後の製品の画面（App Shell）
// - reauth：セッションが切れた。製品の画面を描画しない（機密のデータを表示しない）
// 製品全体の停止とメンテナンスでは、どの段階でも状態の画面に置き換える（入力中の内容は残らないことを示す）。
//
// ログインの状態はメモリだけに持つ。URL、ストレージに入れない（再読み込みするとログインの画面に戻る）。

type AuthStep =
  | { kind: "sign-in"; email?: string; status?: string }
  | { kind: "sign-up" }
  | { kind: "verify"; email: string; sent: boolean }
  | { kind: "reset-request"; email: string }
  | { kind: "reset-sent"; email: string }
  | { kind: "reset-link"; reason: "expired" | "invalid" }
  | { kind: "new-password"; email: string; token: string }

type Phase =
  | { kind: "auth"; step: AuthStep }
  | { kind: "invited"; userId: UserId }
  | { kind: "create-org"; userId: string }
  | { kind: "new-org"; viewer: OnboardingViewer; start: "empty" | "sample" }
  | { kind: "app"; userId: UserId; sessionId: string }
  /** discardedInput：セッションが切れたときに、保存していない入力があった（復元しないため、再認証の画面で知らせる） */
  | { kind: "reauth"; userId: UserId; route: AccountRoute; discardedInput: boolean }

const initialStep = (start: AccountStart): AuthStep =>
  start === "invited"
    ? { kind: "sign-in", email: users["u-suzuki"].email, status: `${users["u-sato"].name}さんからの招待のリンクから開きました（模擬）。参加するには、ログインしてください。` }
    : start === "signup"
      ? { kind: "sign-up" }
      : { kind: "sign-in" }

/** start=return：ログインの前に開こうとしていた画面（顧客の詳細） */
const returnPath = "/w/hq/customers/C-00004"

/**
 * 認証の後の移動先。復帰先が安全で、現在の認可（権限の模擬のサーバーのロール）で、ページのアクセスと同じ表（pagePermission）で
 * 開ける画面の場合だけ、その画面に戻す。ロールの初期値（model.ts）で判断しない（ロールを変えた後の復帰先を誤らない）
 */
function destinationInApp(userId: UserId, returnTo: string | null) {
  return resolveReturnTo(returnTo, { fallback: homePathOf(userId), isAllowed: (path) => canOpenAccountPath(userId, path, currentPermissionsOf) })
}

export function AccountApp() {
  const [route, setRoute] = useState<AccountRoute>(() => readAccountRoute())
  const [phase, setPhase] = useState<Phase>(() => ({ kind: "auth", step: initialStep(readAccountRoute().start) }))
  const monitor = useSystemMonitor()
  const { toasts, dismiss } = useToast()

  // 画面に反映している URL（hash）。製品のルーターの移動（navigate）は、確認を済ませてから先に記録する。
  // ブラウザの戻る・進む、アドレスバーの変更（hashchange）は、未保存の変更があれば確認する（blocker）。
  const appliedHash = useRef(window.location.hash)
  const blocker = useRef<NavigationBlocker | null>(null)
  const setBlocker = useCallback((next: NavigationBlocker | null) => {
    blocker.current = next
  }, [])
  const setHash = useCallback((href: string) => {
    window.location.hash = href
    appliedHash.current = window.location.hash
  }, [])
  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash
      if (next === appliedHash.current) return
      const apply = () => {
        appliedHash.current = next
        setRoute(readAccountRoute(next))
      }
      const confirm = blocker.current
      if (!confirm) return apply()
      const shown = appliedHash.current
      const proceeded = confirm(() => {
        // 確認の後に移動する：表示している画面の URL に戻していたため、移動先の URL に置き換える
        if (window.location.hash !== next) window.history.replaceState(window.history.state, "", next)
        apply()
      })
      // 確認の間は、表示している画面の URL に戻す（URL と表示を一致させる。取りやめた場合は、そのまま残る）
      if (!proceeded) window.history.pushState(window.history.state, "", shown)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const navigate = useCallback(
    (next: Partial<AccountRoute>) => {
      const current = readAccountRoute()
      const href = accountHref({ ...current, start: undefined, cat: null, id: null, ...next })
      setHash(href)
      // hashchange を待たずに、同じ描画で新しい位置を使う（別の利用者の再認証の直後に、前の利用者の位置で 1 回描画しない）
      setRoute(readAccountRoute(href))
    },
    [setHash]
  )

  // 利用者が変わったら（ログアウト、別の利用者の再認証）、前の利用者の Toast を閉じる
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts
  const clearToasts = useCallback(() => {
    for (const t of toastsRef.current) dismiss(t.id)
  }, [dismiss])

  const enterApp = useCallback(
    (userId: UserId, destination?: Partial<AccountRoute>) => {
      const sessionId = authApi.startSession(userId)
      const target = destination ?? {}
      const ws = target.ws && canEnterWorkspace(userId, target.ws) ? target.ws : (routeFromPath(destinationInApp(userId, null).path).ws as WorkspaceId)
      setPhase({ kind: "app", userId, sessionId })
      navigate({ page: "home", ...target, ws })
    },
    [navigate]
  )

  const signOut = useCallback(() => {
    clearToasts()
    setPhase({ kind: "auth", step: { kind: "sign-in", status: "ログアウトしました。" } })
    setHash(accountHref({}))
  }, [clearToasts, setHash])

  const startOver = (start: AccountStart) => {
    clearToasts()
    authServer.reset()
    setHash(accountHref({ start }))
    setPhase({ kind: "auth", step: initialStep(start) })
  }

  const { screen } = summarizeIssues(buildSystemIssues(monitor))
  const signedIn = phase.kind === "app" && canEnterWorkspace(phase.userId, route.ws) ? { userId: phase.userId, workspaceId: route.ws as WorkspaceId } : null

  // 製品全体が使えない：どの段階でも、製品の画面を状態の画面に置き換える
  if (screen) {
    return (
      <MinimalShell header={<ProductLogo />}>
        <UnavailableScreen monitor={monitor} />
        <div className="mx-auto w-full max-w-[40rem] px-4">
          <AccountVerifyPanel phase="unavailable" start={route.start} onStartChange={startOver} signedIn={null} />
        </div>
      </MinimalShell>
    )
  }

  if (phase.kind === "app") {
    if (!canEnterWorkspace(phase.userId, route.ws)) {
      // 所属していないワークスペースの URL：そのワークスペースの存在や内容を示さず、所属している最初のワークスペースへ移す
      return <RedirectToHome userId={phase.userId} navigate={navigate} />
    }
    return (
      <SignedInApp
        key={phase.userId}
        userId={phase.userId}
        route={{ ...route, ws: route.ws as WorkspaceId }}
        monitor={monitor}
        onRouteChange={navigate}
        onSignOut={signOut}
        onBlockerChange={setBlocker}
        onExpireSession={({ discardedInput }) => {
          authApi.expireSession(phase.sessionId)
          // 前の利用者の Toast（「元に戻す」など）を、再認証の画面の上に残さない
          clearToasts()
          setPhase({ kind: "reauth", userId: phase.userId, route: readAccountRoute(appliedHash.current), discardedInput })
        }}
      />
    )
  }

  const verify = <AccountVerifyPanel phase="auth" start={route.start} onStartChange={startOver} signedIn={signedIn} />

  if (phase.kind === "reauth") {
    const user = users[phase.userId]
    return (
      <AuthFrame verify={verify}>
        <ReauthScreen
          api={authApi}
          org={Object.hasOwn(workspaces, phase.route.ws) ? (phase.route.ws as WorkspaceId) : "hq"}
          user={user}
          keepsWork={false}
          discardedInput={phase.discardedInput}
          testId="acct-reauth"
          onAuthenticated={(nextUser) => {
            // 作業（未保存の入力）は復元しない（この画面は SignedInApp を作り直す）。開いていた位置に戻すかだけを決める。
            // 再認証の後のワークスペースは、開いていたワークスペース（ログインの画面では選び直さない）
            const plan = planReauthentication({
              previousUserId: phase.userId,
              userId: nextUser,
              previousWorkspaceId: phase.route.ws,
              workspaceId: phase.route.ws,
              hasUnconfirmedMutation: false,
            })
            if (plan.kind === "same-user") {
              // 同じ利用者：開いていた画面に戻る。戻る位置は、現在の所属と認可で確かめる（destinationInApp の isAllowed）。
              // 権限は、画面を作り直すときに取得し直す（古い権限を引き継がない）
              enterApp(nextUser as UserId, routeFromPath(destinationInApp(nextUser as UserId, pathFromRoute(phase.route)).path))
            } else {
              // 別の利用者：前の利用者の画面の位置、データ、Toast を引き継がない
              clearToasts()
              enterApp(nextUser as UserId)
            }
          }}
        />
      </AuthFrame>
    )
  }

  if (phase.kind === "invited") {
    const viewer = viewerOf(phase.userId, demoInvitation.workspaceId)
    return (
      <AuthFrame verify={verify} wide>
        <InvitedMemberStart
          viewer={viewer}
          invitedBy="u-sato"
          roleName={roles.member.name}
          api={onboardingApi}
          titleAs="h1"
          onJoined={() => enterApp(phase.userId, { ws: demoInvitation.workspaceId, page: "home" })}
        />
      </AuthFrame>
    )
  }

  if (phase.kind === "create-org") {
    return (
      <AuthFrame verify={verify} wide>
        <CreateOrganizationSetup
          userId={phase.userId as UserId}
          api={onboardingApi}
          titleAs="h1"
          onComplete={({ start }) =>
            setPhase({
              kind: "new-org",
              start,
              // 作成した組織の管理者。権限は、組織を作成した利用者の管理者のロール
              viewer: { userId: phase.userId as UserId, workspaceId: NEW_WORKSPACE_ID, permissions: roles.admin.permissions, joinedBy: "created" },
            })
          }
        />
      </AuthFrame>
    )
  }

  if (phase.kind === "new-org") {
    return (
      <MinimalShell
        header={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <ProductLogo />
            <Button variant="ghost" size="sm" onClick={signOut}>
              ログアウト
            </Button>
          </div>
        }
      >
        <div className="mx-auto w-full max-w-[60rem] px-4 py-6 md:px-6" data-testid="acct-new-org">
          <OnboardingProduct viewer={phase.viewer} api={onboardingApi} titleAs="h1" initialSpace={phase.start === "sample" ? "sample" : "real"} />
          {verify}
        </div>
      </MinimalShell>
    )
  }

  // ---------------------------------------------------------------- ログインの前
  const step = phase.step
  const org: WorkspaceId = route.start === "sso" ? "west" : "hq"
  const toSignIn = (email?: string, status?: string) => setPhase({ kind: "auth", step: { kind: "sign-in", email, status } })
  let content: ReactNode
  let mailbox: ReactNode = null
  if (step.kind === "sign-in") {
    content = (
      <SignInScreen
        key={`${route.start}:${step.status ?? ""}`}
        api={authApi}
        org={org}
        returnTo={route.start === "return" ? returnPath : null}
        initialEmail={step.email}
        status={step.status}
        testId="acct-signin"
        onAuthenticated={(userId) => {
          if (route.start === "invited" && userId === "u-suzuki") {
            setPhase({ kind: "invited", userId })
            return
          }
          // 復帰先は、ページのアクセスと同じ表と現在の認可で判断し直す（ログインの画面の destinationFor はロールの初期値で判断する）
          enterApp(userId as UserId, routeFromPath(destinationInApp(userId as UserId, route.start === "return" ? returnPath : null).path))
        }}
        onForgotPassword={(email) => setPhase({ kind: "auth", step: { kind: "reset-request", email } })}
        onSignUp={() => setPhase({ kind: "auth", step: { kind: "sign-up" } })}
      />
    )
  } else if (step.kind === "sign-up") {
    content = (
      <SignUpScreen
        api={authApi}
        testId="acct-signup"
        onVerificationPending={(email, sent) => setPhase({ kind: "auth", step: { kind: "verify", email, sent } })}
        onAuthenticated={(userId) => setPhase({ kind: "create-org", userId })}
        onSignIn={() => toSignIn()}
      />
    )
  } else if (step.kind === "verify") {
    content = (
      <EmailVerificationScreen
        api={authApi}
        email={step.email}
        emailSent={step.sent}
        testId="acct-verify-email"
        onEmailChange={(email) => setPhase({ kind: "auth", step: { kind: "verify", email, sent: true } })}
        onBackToSignIn={() => toSignIn()}
      />
    )
    mailbox = (
      <MockMailbox
        email={step.email}
        testId="acct-mailbox"
        onOpen={(mail: SentEmail) =>
          authApi.openVerificationLink({ email: mail.to }).then(
            (r) => r.kind === "authenticated" && setPhase({ kind: "create-org", userId: r.userId }),
            () => undefined
          )
        }
      />
    )
  } else if (step.kind === "reset-request") {
    content = (
      <PasswordResetRequestScreen
        api={authApi}
        initialEmail={step.email}
        testId="acct-reset-request"
        onRequested={(email) => setPhase({ kind: "auth", step: { kind: "reset-sent", email } })}
        onBackToSignIn={() => toSignIn()}
      />
    )
  } else if (step.kind === "reset-sent") {
    content = (
      <PasswordResetSentScreen
        api={authApi}
        email={step.email}
        testId="acct-reset-sent"
        onChangeEmail={() => setPhase({ kind: "auth", step: { kind: "reset-request", email: step.email } })}
        onBackToSignIn={() => toSignIn(step.email)}
      />
    )
    mailbox = (
      <MockMailbox
        email={step.email}
        testId="acct-mailbox"
        onOpen={() =>
          authApi.checkResetToken({ token: "valid" }).then(
            (r) =>
              setPhase({ kind: "auth", step: r.status === "valid" ? { kind: "new-password", email: r.email, token: "valid" } : { kind: "reset-link", reason: r.status } }),
            () => undefined
          )
        }
      />
    )
  } else if (step.kind === "reset-link") {
    content = (
      <ResetLinkProblemScreen
        reason={step.reason}
        testId="acct-reset-link"
        onRequestAgain={() => setPhase({ kind: "auth", step: { kind: "reset-request", email: "" } })}
        onBackToSignIn={() => toSignIn()}
      />
    )
  } else {
    content = (
      <NewPasswordScreen
        api={authApi}
        token={step.token}
        email={step.email}
        testId="acct-new-password"
        // 再設定の後は自動でログインしない（多要素認証を省かない）。成功の Dialog を出さず、ログインの画面で知らせる
        onChanged={(email) => toSignIn(email, "パスワードを変更しました。新しいパスワードでログインしてください。")}
        onLinkProblem={(reason) => setPhase({ kind: "auth", step: { kind: "reset-link", reason } })}
      />
    )
  }

  return (
    <AuthFrame verify={verify}>
      {content}
      {mailbox && <div className="mx-auto mt-8 w-full max-w-[400px] px-4">{mailbox}</div>}
    </AuthFrame>
  )
}

/** ログインの前の画面の枠。Minimal Shell の中に、認証の画面と検証用の操作を置く */
function AuthFrame({ children, verify, wide = false }: { children: ReactNode; verify: ReactNode; wide?: boolean }) {
  return (
    <AuthShell>
      <div data-testid="acct-auth" className={wide ? "mx-auto flex w-full max-w-[40rem] flex-col px-4 py-6" : undefined}>
        {children}
      </div>
      <div className="mx-auto w-full max-w-[40rem] px-4 pb-8">{verify}</div>
    </AuthShell>
  )
}

function RedirectToHome({ userId, navigate }: { userId: UserId; navigate: (r: Partial<AccountRoute>) => void }) {
  useEffect(() => {
    navigate({ page: "home", ws: routeFromPath(destinationInApp(userId, null).path).ws })
  }, [userId, navigate])
  return null
}

/** 製品全体の停止とメンテナンス。判明していない復旧の予定時刻を示さない。実際に利用できる操作は「状態を再確認」だけ */
function UnavailableScreen({ monitor }: { monitor: SystemMonitor }) {
  const { status, refreshStatus, connectivity } = monitor
  const maintenance = status.last !== null && Object.values(status.last.components).every((h) => h === "maintenance")
  const [checked, setChecked] = useState(false)
  const statusText = status.checking
    ? "状態を確認しています。"
    : checked && status.lastAt !== null
      ? `${formatTime(status.lastAt)}に確認しました。まだ利用できません。`
      : ""
  return (
    <ServiceUnavailable
      data-testid="acct-unavailable"
      condition={maintenance ? "maintenance" : "outage"}
      titleAs="h1"
      title={maintenance ? "メンテナンス中です" : "サービスを利用できません"}
      description={
        maintenance
          ? "すべての機能を利用できません。終了の予定は、わかり次第お知らせします。"
          : "現在、すべての機能を利用できません。原因を調べています。入力中の内容は保存されていません。"
      }
      actions={
        <Button
          variant="secondary"
          loading={status.checking}
          onClick={() => {
            setChecked(true)
            refreshStatus()
            connectivity.check()
          }}
        >
          状態を再確認
        </Button>
      }
      status={statusText}
    />
  )
}
