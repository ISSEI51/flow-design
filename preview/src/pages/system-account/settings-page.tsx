import { useEffect, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { memberships, roles, users, workspaces, type Permission, type UserId, type WorkspaceId } from "../../data/system-account/model"
import type { MockOutcome } from "../../data/system-account/mock"
import { serverPermissions, settingsApi, settingsServer, type SaveContract } from "../../data/system-account/settings-server"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import { DisplaySettingsSection, ProfileSection, SettingsArea, type SettingsCategoryId, type SettingsScope } from "./settings-screens"

// Patterns / System & Account / Settings の資料のページ。
// 例は模擬のサーバー（settings-server.ts）を使う。認証、認可、メールの送信は模擬の処理で、実際には行わない。

type ServerControls = { outcome: MockOutcome; slow: boolean; ignoreAbort: boolean; contract: SaveContract }

function useServerControls() {
  const [c, setC] = useState<ServerControls>({ outcome: "success", slow: false, ignoreAbort: false, contract: "ordered" })
  useEffect(() => {
    for (const k of ["instant", "form", "action", "invite"] as const) settingsServer.outcome[k] = c.outcome
    Object.assign(settingsServer.latency, c.slow ? { instant: 3000, form: 3000, action: 3000, invite: 3000 } : { instant: 500, form: 700, action: 600, invite: 600 })
    settingsServer.ignoreAbort = c.ignoreAbort
    settingsServer.contract = c.contract
  }, [c])
  return [c, setC] as const
}

function ServerControlsFields({ name, c, setC }: { name: string; c: ServerControls; setC: (c: ServerControls) => void }) {
  return (
    <>
      <DemoControls legend="保存の結果（模擬のサーバー）">
        {(
          [
            ["success", "成功"],
            ["fail", "失敗（保存されない）"],
            ["unknown", "結果が不明（応答が届かない）"],
          ] as [MockOutcome, string][]
        ).map(([v, l]) => (
          <Radio key={v} name={`${name}-outcome`} checked={c.outcome === v} onChange={() => setC({ ...c, outcome: v })}>
            {l}
          </Radio>
        ))}
      </DemoControls>
      <DemoControls legend="応答">
        <Radio name={`${name}-latency`} checked={!c.slow} onChange={() => setC({ ...c, slow: false })}>
          標準（0.5 秒）
        </Radio>
        <Radio name={`${name}-latency`} checked={c.slow} onChange={() => setC({ ...c, slow: true })}>
          遅い（3 秒）
        </Radio>
        <label className="flex min-h-10 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={c.ignoreAbort} onChange={(e) => setC({ ...c, ignoreAbort: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          中止の後も応答を返す（AbortSignal を無視する）
        </label>
      </DemoControls>
      <DemoControls legend="サーバーでの保存の順序（製品の API の契約）">
        {(
          [
            ["ordered", "受け付けた順に適用する"],
            ["unordered", "処理した順に適用する（順序の保証なし）"],
            ["versioned", "版の番号で競合を検出する（即時保存を項目ごとに直列にする）"],
          ] as [SaveContract, string][]
        ).map(([v, l]) => (
          <Radio key={v} name={`${name}-contract`} checked={c.contract === v} onChange={() => setC({ ...c, contract: v })}>
            {l}
          </Radio>
        ))}
      </DemoControls>
    </>
  )
}

const permissionsOf = (ws: WorkspaceId, user: UserId): Permission[] => serverPermissions(ws, user)
const roleName = (permissions: readonly Permission[]) =>
  Object.values(roles).find((r) => r.permissions.length === permissions.length && r.permissions.every((p) => permissions.includes(p)))?.name ?? "権限なし"

function categoryFromHash(): SettingsCategoryId | null {
  const m = /[?&]category=([a-z-]+)/.exec(window.location.hash)
  return (m?.[1] as SettingsCategoryId) ?? null
}

// ---------------------------------------------------------------- 設定の画面（Sidebar 型）
function SettingsDemo({ c, setC }: { c: ServerControls; setC: (c: ServerControls) => void }) {
  const [userId, setUserId] = useState<UserId>("u-sato")
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId>("hq")
  const [permissions, setPermissions] = useState<Permission[]>(() => permissionsOf("hq", "u-sato"))
  const [category, setCategory] = useState<SettingsCategoryId | null>(null)
  const [narrow, setNarrow] = useState(false)
  // 別のタブで開いたリンク（#/settings?category=…）のカテゴリを示す
  useEffect(() => {
    const sync = () => setCategory(categoryFromHash())
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])
  // サーバーのロールの表示を、ボタンの操作の後に描き直す
  const [, rerender] = useState(0)
  const scope: SettingsScope = { userId, workspaceId, permissions }
  const userWorkspaces = memberships.filter((m) => m.userId === userId).map((m) => m.workspaceId)
  const serverRole = roleName(permissionsOf(workspaceId, userId))
  const changeScope = (u: UserId, ws: WorkspaceId) => {
    setUserId(u)
    setWorkspaceId(ws)
    setPermissions(permissionsOf(ws, u))
  }
  return (
    <DemoFrame testId="set-demo">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="flex flex-col gap-2">
              <span id="set-demo-user-label" className="text-ui font-medium">
                アカウント
              </span>
              <Select
                items={Object.values(users).map((u) => ({ value: u.id, label: u.name }))}
                value={userId}
                onValueChange={(v) => {
                  const u = v as UserId
                  changeScope(u, memberships.find((m) => m.userId === u)!.workspaceId)
                }}
              >
                <SelectTrigger aria-labelledby="set-demo-user-label" className="w-56 max-w-full" data-testid="set-demo-user">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(users).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <span id="set-demo-ws-label" className="text-ui font-medium">
                ワークスペース
              </span>
              <Select
                items={userWorkspaces.map((w) => ({ value: w, label: workspaces[w].name }))}
                value={workspaceId}
                onValueChange={(v) => changeScope(userId, v as WorkspaceId)}
              >
                <SelectTrigger aria-labelledby="set-demo-ws-label" className="w-56 max-w-full" data-testid="set-demo-workspace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {userWorkspaces.map((w) => (
                    <SelectItem key={w} value={w}>
                      {workspaces[w].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <ServerControlsFields name="set-demo" c={c} setC={setC} />
          <DemoControls legend="ロールの変更（認可は模擬のサーバーが判断する）">
            <p className="w-full text-ui text-muted-foreground" data-testid="set-demo-roles">
              画面の権限：{roleName(permissions)}　サーバーのロール：{serverRole}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={serverRole !== "管理者"}
              onClick={() => {
                settingsServer.setRole(workspaceId, userId, "member")
                rerender((n) => n + 1)
              }}
              data-testid="set-demo-demote-server"
            >
              サーバーだけでメンバーに変更
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={serverRole !== "管理者"}
              onClick={() => {
                settingsServer.setRole(workspaceId, userId, "member")
                setPermissions(permissionsOf(workspaceId, userId))
              }}
              data-testid="set-demo-demote-both"
            >
              サーバーと画面でメンバーに変更
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const m = memberships.find((x) => x.userId === userId && x.workspaceId === workspaceId)!
                settingsServer.setRole(workspaceId, userId, m.role)
                setPermissions(permissionsOf(workspaceId, userId))
              }}
              data-testid="set-demo-restore-role"
            >
              ロールを元に戻す
            </Button>
          </DemoControls>
          <DemoControls legend="領域の幅">
            <Radio name="set-demo-width" checked={!narrow} onChange={() => setNarrow(false)}>
              広い
            </Radio>
            <Radio name="set-demo-width" checked={narrow} onChange={() => setNarrow(true)}>
              狭い（360px。カテゴリの一覧から個別のページへ移動する）
            </Radio>
          </DemoControls>
        </div>
        <div className={narrow ? "max-w-[360px]" : undefined} data-testid="set-demo-area">
          <SettingsArea
            scope={scope}
            api={settingsApi}
            category={category}
            onCategoryChange={setCategory}
            hrefFor={(id) => (id ? `#/settings?category=${id}` : "#/settings")}
            // 保存が権限不足で拒否されたら、サーバーから最新の権限を取り直す（製品の責務の例）
            onPermissionDenied={() => setPermissions(permissionsOf(workspaceId, userId))}
            saveContract={c.contract}
            headingLevel={3}
          />
        </div>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 保存の方式と保存の単位
function SaveUnitsDemo({ c, setC }: { c: ServerControls; setC: (c: ServerControls) => void }) {
  const scope: SettingsScope = { userId: "u-sato", workspaceId: "hq", permissions: permissionsOf("hq", "u-sato") }
  return (
    <DemoFrame testId="set-units">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <ServerControlsFields name="set-units" c={c} setC={setC} />
        </div>
        <div className="flex flex-col gap-12">
          <DisplaySettingsSection scope={scope} api={settingsApi} saveContract={c.contract} />
          <ProfileSection scope={scope} api={settingsApi} saveContract={c.contract} />
        </div>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 比較の見本
const bar = (w: string, strong = false) => <div className={`h-2 rounded-full ${strong ? "bg-border-strong" : "bg-border"}`} style={{ width: w }} />
const toggle = (on = true) => <div className={`h-4 w-7 shrink-0 rounded-full ${on ? "bg-primary" : "bg-input"}`} />

function LayoutMock({ label, caption, children }: { label: string; caption: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Mock label={label}>{children}</Mock>
      <p className="text-ui text-muted-foreground">{caption}</p>
    </div>
  )
}

export function SettingsPatternPage() {
  const [c, setC] = useServerControls()
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / System & Account"
        name="Settings"
        lead="利用者が、設定が適用される範囲（自分か、組織か、この端末か）と、保存された結果を確かめながら、設定を変えられるようにする。設定しなくても使いやすい初期状態を前提にし、必要なものだけを変えさせる。"
      />

      <Section
        title="設定の画面"
        lead="独立した複数のカテゴリを持つため、Sidebar 型にした。個人の設定と組織の設定を分け、どのアカウント・組織に対する設定かを示す。保存、認証、認可、メールの送信は模擬の処理である。"
      >
        <SettingsDemo c={c} setC={setC} />
      </Section>

      <Section title="レイアウトの選び方" lead="設定の項目の数と、カテゴリどうしの関係で選ぶ。Page Layout の standard（960px）と Section Layout を使う。">
        <div className="grid gap-8 sm:grid-cols-3">
          <LayoutMock label="1 つのページに、見出しと 3 つの設定を縦に並べた例" caption="単一のページ：項目が少ない場合。カテゴリの一覧を置かない。">
            {bar("40%", true)}
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                {bar("55%")}
                {toggle(i !== 1)}
              </div>
            ))}
          </LayoutMock>
          <LayoutMock label="左にカテゴリの一覧、右に選んだカテゴリの設定を置いた例" caption="Sidebar 型：独立した複数のカテゴリ（標準）。">
            <div className="flex gap-3">
              <div className="flex w-1/3 flex-col gap-2">
                <div className="h-3 rounded-xs bg-accent" />
                {bar("80%")}
                {bar("70%")}
                {bar("75%")}
              </div>
              <div className="flex flex-1 flex-col gap-3">
                {bar("50%", true)}
                {bar("80%")}
                {bar("65%")}
              </div>
            </div>
          </LayoutMock>
          <LayoutMock label="見出しの下にタブを 2 つ置き、1 つ目のタブの設定を示した例" caption="Tabs：関連の強い少数のカテゴリ（機能の近くの設定など）。">
            {bar("45%", true)}
            <div className="flex gap-4 border-b border-border pb-2">
              <div className="h-2 w-10 rounded-full bg-foreground" />
              <div className="h-2 w-10 rounded-full bg-border" />
            </div>
            {bar("70%")}
            {bar("55%")}
          </LayoutMock>
        </div>
        <div className="mt-8">
          <Rules
            rows={[
              ["単一のページ", "設定の項目が少ない場合。Section で意味のあるまとまりに分ける"],
              ["Sidebar 型", "独立した複数のカテゴリがある場合の標準。SettingsLayout と SettingsNav"],
              ["Tabs", "少数の、関連の強いカテゴリ。機能に固有の設定を、その機能の近くに置く場合など"],
              ["別のページ", "メンバーの管理、契約と請求の管理など、一覧や手順を持つ複雑な設定"],
            ]}
          />
        </div>
      </Section>

      <Section title="適用範囲と入口" lead="個人の設定、組織の設定、機能の設定、この端末だけの設定を区別し、すべてを 1 つの画面に集めない。入口は Sidebar の下部かアカウントメニューにする。">
        <Rules
          rows={[
            ["個人の設定", "アカウントに保存し、どの端末でも同じ。プロフィール、表示と言語、通知、ログインとセキュリティ"],
            ["組織の設定", "ワークスペースに保存し、すべてのメンバーに適用する。組織の情報、セキュリティのポリシー、メンバー"],
            ["機能の設定", "機能に固有の設定（一覧の表示の項目など）。その機能の近くに置いてよい"],
            ["この端末だけの設定", "端末のブラウザに保存する。ほかの端末に影響しないことを示す"],
            ["対象の表示", "カテゴリの見出しの下に、対象（佐藤 花子さん、本社営業部）と適用範囲を示す。カテゴリの一覧のグループの名前にも対象を含める"],
          ]}
        />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="Sidebar の「設定」が組織の設定、アカウントメニューの「設定」が個人の設定に移動する例">
                <p className="text-ui">Sidebar：設定 → 組織の設定</p>
                <p className="text-ui">アカウントメニュー：設定 → 個人の設定</p>
              </Mock>
            }
            badNote="同じ名前の入口が、異なる設定に移動する。利用者は、どちらから入ったかを覚えておく必要がある。"
            good={
              <Mock label="Sidebar の「設定」とアカウントメニューの「個人の設定」が、同じ設定の画面の該当するカテゴリに移動する例">
                <p className="text-ui">Sidebar：設定 → 設定の画面</p>
                <p className="text-ui">アカウントメニュー：個人の設定 → 設定の画面の「プロフィール」</p>
              </Mock>
            }
            goodNote="入口が複数あっても、同じ設定の画面に到達する。名前は到達する先を表す。"
          />
        </div>
      </Section>

      <Section title="表示形式とグループ化" lead="既存の Components を使い、単純な設定のために新しい入力の部品を作らない。関連する設定を意味のある単位にまとめ、余白と見出しで区切る。">
        <Rules
          rows={[
            ["ON・OFF", "即時保存は Switch。保存ボタンのあるフォームの中は Checkbox"],
            ["単一の選択", "Select（選択肢が 2 つでも）"],
            ["複数の選択", "Multi Select、Checkbox"],
            ["見た目の選択", "テーマなど、見本で比べる方が早い場合だけ、視覚的な選択肢（Radio Group）"],
            ["テキスト", "Input、Textarea"],
            ["パスワードの変更", "専用のフォームを開く Button（設定の行に入力欄を並べない）"],
            ["メンバーの管理", "Data Table（別のカテゴリのページ）"],
            ["外部の連携", "接続の状態の文と、接続・解除の Button"],
            ["文字と余白", "ページのタイトル 28px / 600、セクション 20〜24px / 600、設定の名前 14px / 500、補足 14px。項目の間 24px、グループの間 32〜48px、セクションの間 48px"],
          ]}
        />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="3 つの設定を、それぞれ枠で囲んで並べた例">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    {bar("50%")}
                    {toggle()}
                  </div>
                ))}
              </Mock>
            }
            badNote="設定の項目ごとに Card を置くと、すべてが同じ重みに見え、どれが関連するまとまりかがわからない。"
            good={
              <Mock label="見出しの下に 3 つの設定を余白で並べた例">
                {bar("35%", true)}
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-1">
                    {bar("50%")}
                    {toggle(i === 0)}
                  </div>
                ))}
              </Mock>
            }
            goodNote="見出しと余白でまとまりを示す。線は、余白と文字の強弱で足りない場合だけにする。"
          />
        </div>
      </Section>

      <Section
        title="保存の方式と保存の単位"
        lead="独立した低リスクの設定（テーマ、表示言語）は即時保存、依存し合う項目や影響の大きい設定（プロフィール、組織の情報、セキュリティのポリシー）は明示的な保存にする。保存の単位ごとに状態を示し、ある単位の保存でほかの単位の未保存の変更を解除しない。"
      >
        <SaveUnitsDemo c={c} setC={setC} />
        <div className="mt-8">
          <Rules
            rows={[
              ["即時保存", "変更した時点で項目ごとに保存し、項目の下に「保存中…」「保存しました」を示す。連続した変更では、最後の変更の応答だけを反映する"],
              ["明示的な保存", "「プロフィールを保存」で、フォームの項目をまとめて保存する。保存するまで「保存していない変更があります」を示す"],
              ["Switch と保存の方式", "Switch であることだけを理由に即時保存にしない。2 段階認証を無効にするなど影響の大きい変更は、確認の後に保存する"],
              ["確定した失敗", "即時保存は、最後に確認できたサーバーの値へ戻す。明示的な保存は、入力した内容を残す"],
              ["結果が不明", "表示を戻さず、「保存できたかを確認できませんでした」と「確認する」を示す。確認の結果で、保存されていたか、されていなかったかを示す"],
              ["権限不足", "保存されなかったことを示し、最新の権限を取り直す。閲覧だけの表示に変わった後も、保存されていないことを示す"],
            ]}
          />
        </div>
      </Section>

      <Section title="依存関係と継承" lead="組織のポリシー、組織の標準、製品の標準、個人の上書きの関係を示し、変更できない場合は理由を示す。上の画面の「表示と言語」「通知」「ログインとセキュリティ」「組織」で確かめられる。">
        <Rules
          rows={[
            ["親と子の設定", "親を無効にしても、子の値を消さない。子の値が使われていないことと、実際の動作（「通知を止めていません」）を示す"],
            ["組織の標準", "個人の設定で上書きしていない場合は、組織の標準を使う。選択肢に「組織の標準（日本語）」を置き、上書きを外せるようにする"],
            ["組織のポリシー", "必須のポリシー（多要素認証、セキュリティの通知）は個人の設定で無効にできない。操作を無効にし、理由と、保持している個人の値を示す"],
            ["契約プラン", "プランで使えない設定は、権限とは別の理由として示す（「スタンダードプランでは使えません」）"],
          ]}
        />
      </Section>

      <Section title="設定の検索、初期値とリセット" lead="設定の項目が多く、検索に価値がある場合だけ、Command を使った検索を置く。標準の設定へ戻す操作は、対象の範囲を示し、範囲の外の設定を変えない。">
        <Rules
          rows={[
            ["検索の対象", "設定の名前、カテゴリ、別名（「ダークモード」「MFA」）。権限のない機密の設定（セキュリティのポリシーなど）は候補に含めない"],
            ["検索の結果", "選ぶと、カテゴリへ移動し、設定の操作にフォーカスを移して画面の中央へスクロールする。未保存の変更がある場合は、移動の前に確かめる"],
            ["リセットの範囲", "「表示の設定を標準に戻す」は、テーマ、表示言語、タイムゾーンだけを変える。戻る項目をボタンの下に示す"],
            ["影響の大きい初期化", "組織のセキュリティのポリシーを標準に戻す場合は、変わる項目を Alert Dialog で示して確かめる"],
          ]}
        />
      </Section>

      <Section title="取り消せない操作の分離" lead="アカウントの削除、ワークスペースの削除などを通常の設定から分け、内容がわかる見出しを付ける。強調は操作のボタンだけにする。">
        <Compare
          bad={
            <Mock label="赤い太い枠で囲んだ「Danger Zone」の見出しの下に、削除のボタンを置いた例">
              <div className="flex flex-col gap-3 rounded-md border-2 border-destructive p-3">
                <p className="text-ui font-medium text-destructive">Danger Zone</p>
                {bar("70%")}
                <div className="h-6 w-24 rounded-sm bg-destructive" />
              </div>
            </Mock>
          }
          badNote="見出しから内容がわからない。大きな赤い枠は、画面の静けさを損ない、ほかの領域まで警告に見える。"
          good={
            <Mock label="細い線で区切った「ワークスペースの削除」の見出しの下に、説明と削除のボタンを置いた例">
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <p className="text-ui font-medium">ワークスペースの削除</p>
                {bar("70%")}
                <div className="h-6 w-24 rounded-sm bg-destructive" />
              </div>
            </Mock>
          }
          goodNote="見出しで内容を示し、破壊的な操作のボタンだけに Destructive を使う。確定の前に、対象の名前の入力や再認証を求める。"
        />
      </Section>

      <Section title="モバイル" lead="複数のカテゴリの設定は、カテゴリの一覧から個別のページへ移動する。デスクトップの Sidebar を縮めて残さない。上の画面の「領域の幅」で確かめられる。">
        <Rules
          rows={[
            ["一覧と個別のページ", "一覧の項目は 48px の行で、名前と含まれる設定の例を示す。個別のページの上に「設定」（一覧へ戻る）を置く"],
            ["名前と操作", "横に収まらない場合は、操作を名前の下へ移す（SettingRow の Container Query）。Switch は横に並べたままにする"],
            ["維持するもの", "戻る操作、保存の状態、変更できない理由を、狭い画面でも省略しない"],
          ]}
        />
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "保存の状態は、常に置いた role=\"status\" の領域の中身を変えて伝える。状態が変わってもフォーカスを動かさない。",
            "状態は文字とアイコンで示し、色だけで伝えない。権限不足と結果の不明は warning、確定した失敗だけを destructive にする。",
            "カテゴリの一覧は nav（「設定のカテゴリ」）で、現在のカテゴリに aria-current=\"page\" を付ける。",
            "狭い領域で個別のページへ移動したら、カテゴリの見出しにフォーカスを移す。一覧へ戻ったら、開いていたカテゴリの項目にフォーカスを移す。",
            "変更できない設定は、操作を無効にし、理由を操作の説明（aria-describedby）として読み上げる。",
          ]}
        />
      </Section>
    </article>
  )
}
