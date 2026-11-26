import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { getBrowseViewState } from "@/patterns/browse-data"
import { getSetupStatus, resolveFirstScreen, type Checklist, type FirstScreen, type OnboardingProgress } from "@/patterns/onboarding"

import { roles, type UserId } from "../../data/system-account/model"
import { NEW_WORKSPACE_ID, viewerOf, type OnboardingViewer } from "../../data/system-account/onboarding-data"
import { onboardingApi, onboardingServer } from "../../data/system-account/onboarding-server"
import { PageHeader } from "../../layout/page-header"
import { Compare, Section } from "../../layout/section"
import { Bullets } from "../app-structure/parts"
import { DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import { CreateOrganizationSetup, FirstUseEmptyState, InvitedMemberStart, OnboardingProduct } from "./onboarding-screens"

// ---------------------------------------------------------------- 最初の画面
type Arrival = "signup" | "invitation" | "member" | "policy"
const arrivals: [Arrival, string][] = [
  ["signup", "新規登録した（所属する組織がない）"],
  ["invitation", "招待のリンクから来た"],
  ["member", "所属する組織がある"],
  ["policy", "組織のポリシーで多要素認証が必須で、まだ設定していない"],
]
const firstScreenLabels: Record<FirstScreen["screen"], string> = {
  product: "製品の利用画面（顧客の一覧）へ直接移る",
  "accept-invitation": "招待の承諾（参加する組織と招待した人を確かめる）",
  "create-workspace": "組織の作成",
  "required-setup": "利用開始の前に必要な設定（多要素認証）",
}

function FirstScreenDemo() {
  const [arrival, setArrival] = useState<Arrival>("member")
  const result = resolveFirstScreen({
    hasWorkspace: arrival !== "signup",
    pendingInvitation: arrival === "invitation",
    requiredSetup: [{ id: "mfa", done: arrival !== "policy" }],
  })
  return (
    <DemoFrame testId="onb-first">
      <div className="flex flex-col gap-4">
        <DemoControls legend="認証の後の状況（模擬。実際の認証は行わない）">
          {arrivals.map(([v, l]) => (
            <Radio key={v} name="onb-arrival" checked={arrival === v} onChange={() => setArrival(v)}>
              {l}
            </Radio>
          ))}
        </DemoControls>
        <p className="text-body" data-testid="onb-first-screen" data-screen={result.screen}>
          移る先：<span className="font-medium">{firstScreenLabels[result.screen]}</span>
        </p>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 組織の作成
const progressLabels: Record<OnboardingProgress, string> = {
  "not-started": "未開始",
  "in-progress": "進行中",
  interrupted: "中断（続きから再開できる）",
  skipped: "スキップ",
  completed: "完了",
}

function SetupDemo() {
  const [open, setOpen] = useState(true)
  const [hasDraft, setHasDraft] = useState(false)
  const [created, setCreated] = useState<{ workspaceId: string; start: "empty" | "sample" } | null>(null)
  const [outcome, setOutcome] = useState(() => onboardingServer.outcome["create-workspace"] ?? "success")
  const status = getSetupStatus({ completed: created !== null, hasDraft, active: open && !created })
  const viewer: OnboardingViewer | null = created
    ? { userId: "u-sato", workspaceId: created.workspaceId, permissions: roles.admin.permissions, joinedBy: "created" }
    : null
  return (
    <DemoFrame testId="onb-setup-demo">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <DemoControls legend="組織の作成の結果（模擬のサーバー）">
            {(
              [
                ["success", "成功"],
                ["fail", "失敗"],
                ["unknown", "結果が不明（作成はされる）"],
              ] as const
            ).map(([v, l]) => (
              <Radio
                key={v}
                name="onb-setup-outcome"
                checked={outcome === v}
                onChange={() => {
                  setOutcome(v)
                  onboardingServer.outcome["create-workspace"] = v
                }}
              >
                {l}
              </Radio>
            ))}
          </DemoControls>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-ui" data-testid="onb-setup-status" data-status={status}>
              状態：{progressLabels[status]}
            </p>
            {!created &&
              (open ? (
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} data-testid="onb-setup-close">
                  画面を閉じる（中断）
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="onb-setup-open">
                  画面を開き直す
                </Button>
              ))}
            {created && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreated(null)
                  setOpen(true)
                }}
              >
                別の組織を作成する
              </Button>
            )}
          </div>
        </div>
        {viewer && created ? (
          // 作成の後は、成功の画面を挟まずに製品の利用画面を表示する。
          <OnboardingProduct key={created.workspaceId} viewer={viewer} api={onboardingApi} initialSpace={created.start === "sample" ? "sample" : "real"} />
        ) : open ? (
          <CreateOrganizationSetup userId="u-sato" api={onboardingApi} onActiveChange={(s) => setHasDraft(s.hasDraft)} onComplete={setCreated} />
        ) : (
          <p className="text-ui text-muted-foreground">組織の作成の画面を閉じています。途中の入力は模擬のサーバーに保存されています。</p>
        )}
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- Getting Started Checklist
type ViewerOption = { key: string; userId: UserId; workspaceId: string; label: string }
const viewerOptions: ViewerOption[] = [
  { key: "sato-new", userId: "u-sato", workspaceId: NEW_WORKSPACE_ID, label: "佐藤 花子・新しい組織（組織を作成した管理者）" },
  { key: "suzuki-new", userId: "u-suzuki", workspaceId: NEW_WORKSPACE_ID, label: "鈴木 一郎・新しい組織（招待されたメンバー）" },
  { key: "tanaka-new", userId: "u-tanaka", workspaceId: NEW_WORKSPACE_ID, label: "田中 美咲・新しい組織（招待された閲覧者）" },
  { key: "sato-hq", userId: "u-sato", workspaceId: "hq", label: "佐藤 花子・本社営業部（利用中の組織）" },
]
const visibilityLabels = { expanded: "展開", collapsed: "折りたたみ", hidden: "非表示" } as const
const checklistProgressLabels = { "not-started": "未開始", "in-progress": "進行中", completed: "完了" } as const

function ChecklistDemo() {
  const [key, setKey] = useState("sato-new")
  const [mount, setMount] = useState(0)
  const [slow, setSlow] = useState(false)
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const option = viewerOptions.find((o) => o.key === key)!
  const viewer = viewerOf(option.userId, option.workspaceId)
  useEffect(() => {
    for (const k of Object.keys(onboardingServer.latency) as (keyof typeof onboardingServer.latency)[]) onboardingServer.latency[k] = slow ? 2000 : 300
  }, [slow])
  return (
    <DemoFrame testId="onb-checklist-demo">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <DemoControls legend="利用者（模擬のアカウント）">
            {viewerOptions.map((o) => (
              <Radio key={o.key} name="onb-viewer" checked={key === o.key} onChange={() => setKey(o.key)}>
                {o.label}
              </Radio>
            ))}
          </DemoControls>
          <DemoControls legend="模擬のサーバーの応答">
            <Radio name="onb-latency" checked={!slow} onChange={() => setSlow(false)}>
              標準（300ms）
            </Radio>
            <Radio name="onb-latency" checked={slow} onChange={() => setSlow(true)}>
              遅い（2 秒）
            </Radio>
            <Button variant="outline" size="sm" onClick={() => setMount((m) => m + 1)} data-testid="onb-remount">
              再読み込みを模擬する
            </Button>
          </DemoControls>
          <p className="text-ui text-muted-foreground" data-testid="onb-checklist-state">
            {checklist
              ? `進捗：${checklistProgressLabels[checklist.progress]}（${checklist.total} 件中 ${checklist.doneCount} 件）・表示：${checklist.presentation === "none" ? "Checklist を使わない（作業が 1 件以下）" : visibilityLabels[checklist.visibility]}・必須の作業：${checklist.requirementsMet ? "完了" : "未完了"}`
              : "読み込み中"}
          </p>
        </div>
        <OnboardingProduct key={mount} viewer={viewer} api={onboardingApi} onChecklistChange={setChecklist} />
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 初回利用の Empty State
const emptyCases: [string, string, { status: "ready" | "error"; count: number; filtered: boolean }][] = [
  ["empty", "未登録（初回利用）", { status: "ready", count: 0, filtered: false }],
  ["no-results", "検索結果 0件", { status: "ready", count: 0, filtered: true }],
  ["error", "取得失敗", { status: "error", count: 0, filtered: false }],
]

// 状態ごとの見本（操作の対象にしない）。実際に操作できる例は、上の Checklist の例の顧客の画面。
function EmptySamples() {
  const noop = () => {}
  return (
    <div className="grid gap-8 @container sm:grid-cols-3" data-testid="onb-empty-samples">
      {emptyCases.map(([k, label, input]) => (
        <div key={k} className="flex min-w-0 flex-col gap-3">
          <p className="text-ui font-medium">{label}</p>
          <Mock label={`${label}の表示`}>
            <FirstUseEmptyState view={getBrowseViewState(input)} canCreate headerHasCreate onImport={noop} onStartSample={noop} onClearSearch={noop} onRetry={noop} />
          </Mock>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- 招待されたメンバー
const invitedOptions: { userId: UserId; label: string }[] = [
  { userId: "u-suzuki", label: "鈴木 一郎（メンバーとして招待）" },
  { userId: "u-tanaka", label: "田中 美咲（閲覧者として招待）" },
]

function InvitedDemo() {
  const [userId, setUserId] = useState<UserId>("u-suzuki")
  const [joined, setJoined] = useState<UserId | null>(null)
  const viewer = viewerOf(userId, "hq")
  const role = roles[userId === "u-tanaka" ? "viewer" : "member"]
  return (
    <DemoFrame testId="onb-invited-demo">
      <div className="flex flex-col gap-6">
        <DemoControls legend="本社営業部に招待された利用者（模擬の招待）">
          {invitedOptions.map((o) => (
            <Radio
              key={o.userId}
              name="onb-invited"
              checked={userId === o.userId}
              onChange={() => {
                setUserId(o.userId)
                setJoined(null)
              }}
            >
              {o.label}
            </Radio>
          ))}
        </DemoControls>
        {joined === userId ? (
          <OnboardingProduct viewer={viewer} api={onboardingApi} />
        ) : (
          <InvitedMemberStart viewer={viewer} invitedBy="u-sato" roleName={role.name} api={onboardingApi} onJoined={() => setJoined(userId)} />
        )}
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- ページ
export function OnboardingPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / System & Account"
        name="Onboarding"
        lead="機能の説明より、最初の価値を体験することを優先する。必要な知識は、実際に使うときに示す。認証の後は製品の利用画面へ直接移り、初期作業の完了は実際の作業結果から判定する。"
      />

      <Section title="最初の画面" lead="歓迎するだけの画面は置かない。組織の作成、招待の承諾、利用開始の前に必要な設定など、独立した画面に意味がある場合だけ挟む。">
        <FirstScreenDemo />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="認証の後に、歓迎の文と「始める」だけの画面を挟む例">
                <p className="text-heading">ようこそ</p>
                <p className="text-ui text-muted-foreground">これから、さっそく始めましょう。</p>
                <div className="h-10 w-28 rounded-lg bg-primary" />
              </Mock>
            }
            badNote="押す以外にすることがなく、利用までの手順が 1 つ増える。"
            good={
              <Mock label="認証の後に、顧客の一覧と利用開始の準備を直接表示する例">
                <p className="text-heading">顧客</p>
                <div className="h-2 w-2/3 rounded-full bg-border" />
                <div className="h-2 w-1/2 rounded-full bg-border" />
              </Mock>
            }
            goodNote="利用画面を直接表示し、必要な案内は画面の中で示す。"
          />
        </div>
      </Section>

      <Section title="初期設定の 3 種類" lead="後から設定できるものは、合理的な初期値を用意して、利用開始の前に求めない。">
        <Rules
          rows={[
            ["利用開始の前に必要", "組織名（組織を作成する場合）、組織のポリシーで必須の多要素認証。これがないと利用を始められないものだけ"],
            ["利用開始の後でも可能", "表示言語、タイムゾーン、通知、プロフィールの写真。初期値（組織の標準、端末の設定）で始め、設定の画面で変える"],
            ["特定の機能を使うときに必要", "支払い方法（試用期間の終了時）、外部のカレンダーとの連携（予定を同期するとき）。その機能を使う画面で求める"],
            ["質問", "使い方（チームか自分だけか）など、実際の体験を変える質問だけを求める。業種や規模は、初期値や表示を実際に変える場合だけ"],
          ]}
        />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="組織の作成の必須の項目に、知った経緯と会社の規模の質問を混ぜた例">
                <p className="text-ui font-medium">組織名（必須）</p>
                <div className="h-10 rounded-md border border-border" />
                <p className="text-ui font-medium">この製品を知ったきっかけ（必須）</p>
                <div className="h-10 rounded-md border border-border" />
                <p className="text-ui font-medium">会社の規模（必須）</p>
                <div className="h-10 rounded-md border border-border" />
              </Mock>
            }
            badNote="利用に関係しない質問が、利用開始を妨げる。マーケティングの質問を必須にしない。"
            good={
              <Mock label="組織の作成で、組織名だけを必須にした例">
                <p className="text-ui font-medium">組織名</p>
                <div className="h-10 rounded-md border border-border" />
                <p className="text-caption text-muted-foreground">あとで組織の設定で変更できます。</p>
              </Mock>
            }
            goodNote="利用に必要なものだけを求め、変更できることを示す。"
          />
        </div>
      </Section>

      <Section
        title="組織の作成"
        lead="必須の手順と任意の手順を区別し、任意の手順はスキップできる。手順を移るたびに途中の入力を保存し、閉じても続きから再開できる。作成の後は、成功の画面を挟まずに利用画面へ移る。"
      >
        <SetupDemo />
        <div className="mt-8">
          <Rules
            rows={[
              ["必須と任意", "手順ごとに「必須」「任意」を示す。組織名だけが必須。使い方とデータの始め方には初期値がある"],
              ["スキップ", "任意の手順（メンバーの招待）はスキップできる。スキップした作業は、利用開始の準備に残る"],
              ["分岐", "「自分だけで使う」を選ぶと、招待の手順を除く（手順の数が減り、入力していた招待は送信しない）"],
              ["戻る・再開", "戻っても入力は残る。途中の入力は手順の境界で保存し、再読み込みや別の端末では続きの手順から再開する"],
              ["結果が不明", "作成されたかを確かめてから、もう一度作成できるようにする（同じ要求の ID で二重に作成しない）"],
            ]}
          />
        </div>
      </Section>

      <Section
        title="Getting Started Checklist"
        lead="複数の初期作業が必要な場合だけ使う（3〜5 件）。完了は実際の作業結果から判定し、作業のボタンは作業の画面へ移るだけにする。非表示にしても、必須の作業は完了にならない。"
      >
        <ChecklistDemo />
        <div className="mt-8">
          <Rules
            rows={[
              ["完了の判定", "顧客を実際に登録した、招待を実際に送った、などの結果から判定する。ボタンを押した、Checklist を閉じた、では完了にしない"],
              ["提供するもの", "完了した件数、進捗の表示、作業の画面への移動、折りたたみ、非表示、再表示の入口（画面の上部）"],
              ["非表示", "非表示は表示の状態であり、完了ではない。必須の作業が残っている場合は、非表示にしても関係する場所で示す"],
              ["すべて完了", "完了したことを短く示し、閉じられるようにする。閉じた後は表示しない"],
              ["権限と利用者", "権限のない作業は表示しない。招待されたメンバーには、組織で完了済みの作業を表示しない。作業が 1 件以下なら Checklist を使わない"],
              ["進捗の単位", "アカウント単位（プロフィールの写真）と組織単位（顧客、招待、支払い）を分ける。組織単位の作業は、ほかのメンバーが完了しても完了になる"],
            ]}
          />
        </div>
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="作業の横のチェックを押すだけで完了になる Checklist の例">
                <p className="text-ui">□ 最初の顧客を登録する</p>
                <p className="text-ui">□ メンバーを招待する</p>
                <p className="text-caption text-muted-foreground">チェックを付けると完了になります</p>
              </Mock>
            }
            badNote="作業をしていなくても完了になり、進捗が実際の状態と一致しない。"
            good={
              <Mock label="作業の画面へ移るボタンがあり、作業の結果で完了になる Checklist の例">
                <p className="text-ui">最初の顧客を登録する</p>
                <div className="h-10 w-28 rounded-md bg-secondary" />
                <p className="text-caption text-muted-foreground">顧客を登録すると完了になります</p>
              </Mock>
            }
            goodNote="作業の画面へ移り、実際に作業した結果で完了になる。"
          />
        </div>
      </Section>

      <Section title="初回利用の Empty State" lead="何ができるか、最初に何をするか、どこから操作するかを短く伝える。未登録、検索結果 0件、取得失敗を区別する。">
        <EmptySamples />
        <p className="mt-6 text-ui text-muted-foreground">
          上の Getting Started Checklist の例の「新しい組織」で、未登録の表示を確かめられる。顧客を登録した後に一致しない語で検索すると、検索結果 0件の表示になる。
        </p>
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="Page Header と Empty State の両方に「顧客を登録」を置いた例">
                <div className="flex items-center justify-between">
                  <p className="text-heading">顧客</p>
                  <div className="h-10 w-28 rounded-lg bg-primary" />
                </div>
                <p className="text-center text-ui">顧客はまだ登録されていません</p>
                <div className="mx-auto h-10 w-28 rounded-lg bg-primary" />
              </Mock>
            }
            badNote="同じ操作が 2 か所にあり、どちらを押すか迷う。主要な操作が 2 つに見える。"
            good={
              <Mock label="Page Header にだけ「顧客を登録」を置き、Empty State で場所を示した例">
                <div className="flex items-center justify-between">
                  <p className="text-heading">顧客</p>
                  <div className="h-10 w-28 rounded-lg bg-primary" />
                </div>
                <p className="text-center text-ui">顧客はまだ登録されていません</p>
                <p className="text-center text-caption text-muted-foreground">ページの上部の「顧客を登録」から登録します</p>
              </Mock>
            }
            goodNote="操作は 1 か所に置き、Empty State では場所と、ほかの始め方（取り込み、サンプル）を示す。"
          />
        </div>
      </Section>

      <Section title="Product Tour" lead="強制的な Tour は標準にしない。汎用の Tour の仕組みは、このリリースでは提供しない。">
        <Rules
          rows={[
            ["検討する場合", "複雑な専門機能など、説明によって学習の負荷が下がる場合だけ"],
            ["開始・終了・再開", "利用者が自分で開始し、途中で終了し、必要なら続きから再開できる"],
            ["作らない", "自明なボタンや検索欄を順番に説明する Tour。初回のログインで自動的に始まり、終わるまで操作できない Tour"],
            ["代わりに", "その機能を使う場所の Contextual Help と、ヘルプのページ"],
          ]}
        />
        <div className="mt-8">
          <Compare
            bad={
              <Mock label="画面を暗くして、検索欄から順に 8 個の要素を説明する Tour の例">
                <div className="rounded-md bg-muted p-3">
                  <p className="text-ui font-medium">1 / 8　これは検索欄です</p>
                  <p className="text-caption text-muted-foreground">次へ</p>
                </div>
              </Mock>
            }
            badNote="見ればわかることを説明し、終わるまで操作できない。"
            good={
              <Mock label="専門的な機能の近くに、短い案内と閉じるボタンを置いた例">
                <div className="h-10 rounded-md border border-border" />
                <div className="rounded-lg bg-muted px-4 py-2 text-caption text-muted-foreground">会社名の一部で検索できます</div>
              </Mock>
            }
            goodNote="必要な場所で短く示し、閉じられる。"
          />
        </div>
      </Section>

      <Section title="Contextual Help" lead="必要なときに短い案内を示し、操作を妨げない。閉じた案内は、再読み込みや別の端末でも表示しない。">
        <Rules
          rows={[
            ["置き方", "関係する操作の近くに、画面の流れの中に置く。入力欄やボタンを覆わない（Popover にしない）。フォーカスを奪わない"],
            ["表示の条件", "その操作を使える状態のときだけ（例：顧客の検索の案内は、顧客が 1 件以上あるときだけ）。同時に表示する案内は 1 つ"],
            ["閉じる", "閉じるボタンを置く。閉じた状態はアカウントごとに保存する（製品の責務）。保存に失敗しても、その画面の間は表示しない"],
            ["重要な情報", "一度だけの案内に置かない。項目の説明やヘルプのページにも置く"],
          ]}
        />
        <p className="mt-6 text-ui text-muted-foreground">上の Getting Started Checklist の例で「佐藤 花子・本社営業部」を選ぶと、顧客の検索欄の近くに案内が表示される。</p>
      </Section>

      <Section title="サンプルデータ" lead="製品の価値を体験するのに実際のデータの構造が必要な場合だけ、利用者が明示的に選んだときに使う。">
        <Rules
          rows={[
            ["選ぶ", "組織の作成の最後、または初回利用の Empty State の「サンプルデータで試す」。自動では入れない"],
            ["識別", "サンプルを表示している間は、画面の上部に常に示す。行にも「サンプル」と示す"],
            ["分離", "実際のデータと別の領域に保存する。サンプルへの登録は、実際の顧客の件数、利用開始の準備、集計、請求、外部への送信に含まれない"],
            ["終了・削除", "「実際のデータに戻る」と「サンプルを削除」をいつでも押せる場所に置く"],
            ["製品の責務", "見た目のラベルだけでなく、保存の領域、検索、集計、通知、外部への送信、請求の処理で、サンプルを実際のデータと分ける"],
          ]}
        />
        <p className="mt-6 text-ui text-muted-foreground">上の例の「新しい組織」の顧客の画面で、「サンプルデータで試す」から確かめられる。</p>
      </Section>

      <Section title="利用者の違い" lead="組織を作成した管理者と、既存の組織に招待されたメンバーを区別する。設定済みの項目を、すべてのメンバーに再設定させない。">
        <InvitedDemo />
        <div className="mt-8">
          <Rules
            rows={[
              ["組織を作成した管理者", "組織の作成、組織単位の作業（顧客、取り込み、招待、支払い）とアカウント単位の作業を Checklist で示す"],
              ["招待されたメンバー", "招待の承諾だけを確かめ、利用画面へ移る。組織で完了済みの作業は示さない。権限のない作業も示さない"],
              ["閲覧者", "登録の権限がないため、Empty State に登録の操作を置かない。作業が 1 件以下なので Checklist を使わない"],
            ]}
          />
        </div>
      </Section>

      <Section title="状態" lead="進捗と表示を別の値で持つ。非表示と完了を混同しない。状態の保存は製品が行い、再読み込みや別の端末で初期状態に戻らないようにする。">
        <Rules
          rows={[
            ["未開始", "作業や手順を、まだ 1 つも始めていない"],
            ["進行中", "一部が完了している、または手順の画面を操作している"],
            ["中断", "途中の入力が保存されていて、手順の画面を閉じた。続きの手順から再開できる"],
            ["スキップ", "任意の手順を行わないことにした。完了ではない（Checklist に作業として残る）"],
            ["非表示", "利用者が Checklist を非表示にした。表示の状態であり、進捗は変わらない"],
            ["完了", "実際の作業結果で、すべての作業が完了した"],
          ]}
        />
      </Section>

      <Section title="評価指標" lead="チュートリアルの完了率だけで品質を判断しない。最初の価値体験（例：最初の顧客を登録し、一覧で確かめた）を製品が定義し、計測する。">
        <Rules
          rows={[
            ["Time to First Value", "登録から、最初の価値体験までの時間。短いほどよい。待ち時間と、利用に関係しない質問の数を見直す"],
            ["Activation Rate", "登録した利用者のうち、最初の価値体験に達した割合"],
            ["Setup Completion Rate", "必須の初期設定を完了した割合。任意の手順のスキップは失敗に数えない"],
            ["Step Drop-off", "手順ごとの離脱。離脱の多い手順は、必須かどうか、後に回せるかを見直す"],
            ["Onboarding 後の継続率", "最初の価値体験の後も、使い続けているか（例：1 週間後、4 週間後）"],
          ]}
        />
        <p className="mt-6 text-ui text-muted-foreground">イベントの収集と分析の基盤は、このリリースでは提供しない（製品の責務）。</p>
      </Section>

      <Section title="モバイルとアクセシビリティ">
        <Bullets
          items={[
            "Checklist は折りたたみ、非表示にでき、通常の操作の領域を圧迫しない。狭い画面では作業のボタンを作業名の下に置く。",
            "同時に表示する案内は 1 つ（Empty State を表示している領域には Contextual Help を出さない）。",
            "作業の完了は、Checklist の中に常に置いた読み上げの領域（role=\"status\"）で伝える。最初の表示と利用者の切り替えでは読み上げない。",
            "手順を移ったら、その手順の見出しにフォーカスを移す。Checklist を非表示にしたら再表示の入口へ、再表示したら Checklist へフォーカスを移す。",
            "演出のための待ち時間、最低表示時間、強制的なアニメーションを置かない。",
          ]}
        />
      </Section>
    </article>
  )
}

