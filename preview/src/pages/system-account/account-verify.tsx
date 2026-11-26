import { useId, useState, useSyncExternalStore, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

import { demoRecoveryCodes } from "../../data/system-account/auth-server"
import { demoPassword, demoVerificationCode, roles, users, type RoleId, type UserId, type WorkspaceId } from "../../data/system-account/model"
import { notificationsServer } from "../../data/system-account/notifications-server"
import { permissionServer } from "../../data/system-account/permission-server"
import { settingsServer } from "../../data/system-account/settings-server"
import type { MockOutcome } from "../../data/system-account/mock"
import { Radio } from "../data-browsing/doc-parts"
import { SystemSimulatorControls } from "./system-screens"
import type { AccountStart } from "./account-route"

// 統合の検証画面の「検証用の操作」（プレビュー専用）。製品の画面とは区別し、ページの最後に置く。
// 模擬のサーバーの設定を変えるだけで、製品の画面の状態を直接書き換えない（製品の画面は、サーバーの応答と知らせで更新する）。

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    // min-w-0：fieldset の既定の最小幅（内容の幅）で、狭い画面のページが横にスクロールしないようにする
    <fieldset className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-ui">
      <legend className="mb-1 font-medium">{legend}</legend>
      {children}
    </fieldset>
  )
}

// 模擬のサーバーの設定は、検証用の操作の中だけで変える。表示を合わせるため、ここで版を持つ。
let version = 0
const listeners = new Set<() => void>()
const bump = () => {
  version++
  for (const l of listeners) l()
}
const useVersion = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
    () => version
  )

/** 権限の模擬のサーバーと設定の模擬のサーバーの両方に、同じロールを設定する（管理者がロールを変えたことの模擬） */
export function setRoleEverywhere(userId: UserId, workspaceId: WorkspaceId, role: RoleId) {
  settingsServer.setRole(workspaceId, userId, role)
  permissionServer.simulate.setRole(userId, workspaceId, role)
  bump()
}

const startOptions: [AccountStart, string][] = [
  ["signin", "ログインの画面"],
  ["sso", "組織の SSO が必須の組織（西日本営業部）"],
  ["return", "ログインの後に顧客の詳細へ戻る"],
  ["invited", "招待のリンクから開く（鈴木 一郎）"],
  ["signup", "新規登録して組織を作成する"],
]

const outcomeOptions: [MockOutcome, string][] = [
  ["success", "成功"],
  ["fail", "失敗"],
  ["unknown", "結果が不明（応答が届かない）"],
]

export function AccountVerifyPanel({
  phase,
  start,
  onStartChange,
  signedIn,
  onExpireSession,
}: {
  phase: "auth" | "app" | "unavailable"
  start: AccountStart
  onStartChange: (start: AccountStart) => void
  /** ログインしている利用者とワークスペース */
  signedIn: { userId: UserId; workspaceId: WorkspaceId } | null
  onExpireSession?: () => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const name = `acct-${id.replace(/[^a-zA-Z0-9]/g, "")}`
  useVersion()
  const role = signedIn ? (settingsServer.roles[`${signedIn.workspaceId}:${signedIn.userId}`] as RoleId | undefined) : undefined
  return (
    <section aria-labelledby={`${name}-title`} data-testid="acct-verify" className="mt-16 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={`${name}-title`} className="text-ui font-semibold">
          検証用の操作（プレビュー専用）
        </h2>
        <Button variant="outline" size="sm" aria-expanded={open} aria-controls={`${name}-body`} onClick={() => setOpen((v) => !v)} data-testid="acct-verify-toggle">
          {open ? "閉じる" : "開く"}
        </Button>
      </div>
      <div id={`${name}-body`} hidden={!open} className="mt-6 flex flex-col gap-6">
        <p className="max-w-[40rem] text-ui text-muted-foreground">
          認証、認可、メールの送信、通知の配信、障害の監視は、すべてこの画面の中の模擬の処理です。実際のパスワードを入力しないでください。入力したパスワードと確認コードは、この画面のメモリだけに置き、保存しません。
        </p>
        <dl className="grid gap-x-8 gap-y-2 text-ui sm:grid-cols-[10rem_1fr]">
          <dt className="font-medium">アカウント</dt>
          <dd className="min-w-0 text-muted-foreground [word-break:break-all]">
            {(["u-sato", "u-suzuki", "u-tanaka"] as const).map((u) => `${users[u].email}（${users[u].name}）`).join("、")}
          </dd>
          <dt className="font-medium">パスワード</dt>
          <dd className="text-muted-foreground">{demoPassword}</dd>
          <dt className="font-medium">確認コード</dt>
          <dd className="text-muted-foreground">
            {demoVerificationCode}（リカバリーコード：{demoRecoveryCodes.join("、")}）
          </dd>
        </dl>

        {phase === "auth" && (
          <Group legend="ログインの前の開き方">
            {startOptions.map(([v, label]) => (
              <Radio key={v} name={`${name}-start`} checked={start === v} onChange={() => onStartChange(v)}>
                {label}
              </Radio>
            ))}
          </Group>
        )}

        {phase === "app" && signedIn && (
          <>
            <Group legend={`${users[signedIn.userId].name}さんのロール（管理者が変更したことの模擬）`}>
              {(Object.keys(roles) as RoleId[]).map((r) => (
                <Radio key={r} name={`${name}-role`} checked={role === r} onChange={() => setRoleEverywhere(signedIn.userId, signedIn.workspaceId, r)}>
                  {roles[r].name}
                </Radio>
              ))}
            </Group>
            <div className="flex flex-col gap-2">
              <p className="text-ui font-medium">セッション（模擬）</p>
              <div>
                <Button variant="secondary" size="sm" onClick={onExpireSession} data-testid="acct-expire">
                  セッションの有効期限を切る
                </Button>
              </div>
            </div>
            <Group legend="設定の保存の結果（模擬）">
              {outcomeOptions.map(([v, label]) => (
                <Radio
                  key={v}
                  name={`${name}-save`}
                  checked={settingsServer.outcome.instant === v}
                  onChange={() => {
                    settingsServer.outcome.instant = v
                    settingsServer.outcome.form = v
                    bump()
                  }}
                >
                  {label}
                </Radio>
              ))}
            </Group>
            <Group legend="お知らせの取得（模擬）">
              <Radio
                name={`${name}-ntf`}
                checked={notificationsServer.outcome.list === "success"}
                onChange={() => {
                  notificationsServer.outcome.list = "success"
                  bump()
                }}
              >
                成功する
              </Radio>
              <Radio
                name={`${name}-ntf`}
                checked={notificationsServer.outcome.list === "fail"}
                onChange={() => {
                  notificationsServer.outcome.list = "fail"
                  bump()
                }}
              >
                失敗する
              </Radio>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => notificationsServer.push(signedIn.workspaceId, { title: "高橋 由紀さんが商談のメモであなたをメンションしました", type: "mention" })}
                data-testid="acct-push"
              >
                新着のお知らせを届ける
              </Button>
            </Group>
          </>
        )}

        <SystemSimulatorControls name={`${name}-sys`} />
      </div>
    </section>
  )
}
