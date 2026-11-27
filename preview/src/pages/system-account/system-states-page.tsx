import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { ConditionIcon } from "@/patterns/service-state"
import { conditionLabels, type SystemCondition } from "@/patterns/system-status"

import type { WorkspaceId } from "../../data/system-account/model"
import { systemServer } from "../../data/system-account/system-server"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import {
  BackgroundJobsPanel,
  CallConnectionIndicator,
  formatTime,
  OfflineRegistrationExample,
  StatusPageExample,
  SyncStatesList,
  SystemAppExample,
  SystemBannerArea,
  SystemSimulatorControls,
  UnknownSaveExample,
  useSystemMonitor,
  type OfflineMode,
  type SystemMonitor,
} from "./system-screens"

const api = systemServer

// ---------------------------------------------------------------- 状態の分類
const conditions: [SystemCondition, string][] = [
  ["operational", "正常に稼働している。通常の業務の画面では表示しない"],
  ["connecting", "接続・再接続の確認中。確認できるまで、保存と削除を受け付けない"],
  ["offline", "端末がネットワークに接続していない、または自動の確認の上限まで接続できない。既存のデータは残す"],
  ["degraded", "動作が遅い。利用はできる"],
  ["partial-outage", "一部の機能を利用できない。ほかの機能はそのまま使える"],
  ["outage", "サービスを利用できない。製品全体なら専用の状態の画面"],
  ["maintenance", "メンテナンス中。製品全体なら専用の状態の画面"],
  ["recovering", "接続やサービスは回復したが、再取得や保存の結果の確認が終わっていない"],
  ["unknown", "状態を取得できない。正常として扱わない"],
]

function ConditionTable() {
  return (
    <dl className="grid gap-x-8 gap-y-4 text-ui sm:grid-cols-[16rem_1fr]" data-testid="sys-conditions">
      {conditions.map(([c, note]) => (
        <div key={c} className="contents">
          <dt className="flex flex-wrap items-center gap-x-2 font-medium">
            <ConditionIcon condition={c} className="size-4" />
            {conditionLabels[c]}
            <span className="text-caption font-normal text-muted-foreground">{c}</span>
          </dt>
          <dd className="text-muted-foreground">{note}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------- 再試行の状況
function RetryDetails({ monitor }: { monitor: SystemMonitor }) {
  const c = monitor.connectivity
  // 次の確認までの秒数は、表示の例として 1 秒ごとに更新する（読み上げの領域には入れない）
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  const next = c.nextCheckAt !== null && now !== null ? Math.max(0, Math.ceil((c.nextCheckAt - now) / 1000)) : null
  const status = {
    unknown: c.checking ? "接続を確認している（まだ確認していない）" : "接続を確認していない",
    online: "接続している",
    connecting: "再接続の確認中",
    offline: c.reason === "browser" ? "オフライン（端末）" : "接続できない（自動の確認を終了）",
  }[c.status]
  return (
    <div className="flex flex-col gap-4" data-testid="sys-retry">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
        <dt className="text-muted-foreground">接続</dt>
        <dd data-testid="sys-retry-status" data-status={c.status}>
          {status}
        </dd>
        <dt className="text-muted-foreground">失敗した確認</dt>
        <dd data-testid="sys-retry-attempt">{c.attempt} 回（上限 {api.retry.maxAttempts} 回）</dd>
        <dt className="text-muted-foreground">次の自動の確認</dt>
        <dd data-testid="sys-retry-next">{c.checking ? "確認しています" : next !== null ? `${next} 秒後` : "予定していません"}</dd>
        <dt className="text-muted-foreground">最後に確認できた時刻</dt>
        <dd>{c.confirmedAt !== null ? formatTime(c.confirmedAt) : "—"}</dd>
      </dl>
      <div>
        <Button variant="outline" size="sm" onClick={c.check} loading={c.checking} disabled={!api.browserOnline}>
          再接続を試す
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 接続と切断の繰り返し
function FlappingDemo({ monitor }: { monitor: SystemMonitor }) {
  const [running, setRunning] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const frame = useRef<HTMLDivElement>(null)
  const [counts, setCounts] = useState({ announcements: 0, shown: 0, blocked: 0 })
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // 読み上げの領域の文の変化と、Banner の表示の変化を数える（例の計測。製品には不要）
  useEffect(() => {
    const root = frame.current
    if (!root) return
    const live = root.querySelector("[data-slot=system-banner-live]")
    const banner = root.querySelector("[data-slot=system-banner]")
    if (!live || !banner) return
    let lastText = live.textContent ?? ""
    let lastEmpty = banner.hasAttribute("data-empty")
    const observer = new MutationObserver(() => {
      const text = live.textContent ?? ""
      const empty = banner.hasAttribute("data-empty")
      setCounts((c) => ({
        ...c,
        announcements: c.announcements + (text !== lastText && text !== "" ? 1 : 0),
        shown: c.shown + (lastEmpty && !empty ? 1 : 0),
      }))
      lastText = text
      lastEmpty = empty
    })
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-empty"] })
    return () => observer.disconnect()
  }, [])

  const allowed = monitor.mutation("customers").allowed
  const prevAllowed = useRef(allowed)
  useEffect(() => {
    if (prevAllowed.current && !allowed) setCounts((c) => ({ ...c, blocked: c.blocked + 1 }))
    prevAllowed.current = allowed
  }, [allowed])

  const start = () => {
    timers.current.forEach(clearTimeout)
    setCounts({ announcements: 0, shown: 0, blocked: 0 })
    setRunning(true)
    // 400ms ごとに切断と接続を 5 回繰り返す（模擬）
    timers.current = Array.from({ length: 10 }, (_, i) => setTimeout(() => api.setBrowserOnline(i % 2 === 1), i * 400))
    timers.current.push(setTimeout(() => setRunning(false), 10 * 400))
  }
  return (
    <div className="flex flex-col gap-6" ref={frame} data-testid="sys-flapping">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={start} disabled={running}>
          接続と切断を 5 回繰り返す
        </Button>
        <span className="text-ui text-muted-foreground" data-testid="sys-flapping-allowed" data-allowed={allowed}>
          {allowed ? "保存を受け付けます" : "接続を確認できるまで、保存を受け付けません"}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <SystemBannerArea monitor={monitor} include={(i) => i.id === "connectivity"} />
        <p className="px-4 py-6 text-ui text-muted-foreground sm:px-6">（製品の画面。この例の Banner は接続の問題だけを示す）</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui" data-testid="sys-flapping-counts">
        <dt className="text-muted-foreground">保存を制限した回数（すぐに反映）</dt>
        <dd data-testid="sys-flapping-blocked">{counts.blocked} 回</dd>
        <dt className="text-muted-foreground">Banner を表示した回数</dt>
        <dd data-testid="sys-flapping-shown">{counts.shown} 回</dd>
        <dt className="text-muted-foreground">読み上げの内容を更新した回数</dt>
        <dd data-testid="sys-flapping-announced">{counts.announcements} 回</dd>
      </dl>
    </div>
  )
}

// ---------------------------------------------------------------- 保存の結果の設定
function SaveControls() {
  const [, force] = useState(0)
  const set = (outcome: "success" | "fail" | "unknown") => {
    api.set({ saveOutcome: outcome })
    force((n) => n + 1)
  }
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
      <legend className="mb-1 font-medium">保存の結果（模擬）</legend>
      {(
        [
          ["success", "成功"],
          ["fail", "失敗（処理されていない）"],
          ["unknown", "応答なし（サーバーでは保存される）"],
        ] as const
      ).map(([v, l]) => (
        <Radio key={v} name="sys-save-outcome" checked={api.saveOutcome === v} onChange={() => set(v)}>
          {l}
        </Radio>
      ))}
    </fieldset>
  )
}

function JobControls() {
  const [, force] = useState(0)
  const set = (patch: Parameters<typeof api.set>[0]) => {
    api.set(patch)
    force((n) => n + 1)
  }
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
        <legend className="mb-1 font-medium">進捗（模擬のジョブ）</legend>
        <Radio name="sys-job-progress" checked={api.jobReportsProgress} onChange={() => set({ jobReportsProgress: true })}>
          実際の進捗を返す
        </Radio>
        <Radio name="sys-job-progress" checked={!api.jobReportsProgress} onChange={() => set({ jobReportsProgress: false })}>
          返さない
        </Radio>
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
        <legend className="mb-1 font-medium">結果</legend>
        {(
          [
            ["succeeded", "成功"],
            ["partial", "一部が失敗"],
            ["failed", "失敗"],
            ["unknown", "結果不明"],
          ] as const
        ).map(([v, l]) => (
          <Radio key={v} name="sys-job-outcome" checked={api.jobOutcome === v} onChange={() => set({ jobOutcome: v })}>
            {l}
          </Radio>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
        <legend className="mb-1 font-medium">キャンセルの要求の後</legend>
        <Radio name="sys-job-cancel" checked={api.jobCancelOutcome === "cancelled"} onChange={() => set({ jobCancelOutcome: "cancelled" })}>
          停止する
        </Radio>
        <Radio name="sys-job-cancel" checked={api.jobCancelOutcome === "completed"} onChange={() => set({ jobCancelOutcome: "completed" })}>
          停止の前に完了する
        </Radio>
      </fieldset>
    </div>
  )
}

function SyncControls() {
  const [, force] = useState(0)
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
      <legend className="mb-1 font-medium">同期の結果（模擬）</legend>
      {(
        [
          ["success", "成功"],
          ["fail", "失敗"],
          ["conflict", "競合"],
          ["unknown", "結果不明"],
        ] as const
      ).map(([v, l]) => (
        <Radio
          key={v}
          name="sys-sync-outcome"
          checked={api.syncOutcome === v}
          onChange={() => {
            api.set({ syncOutcome: v })
            force((n) => n + 1)
          }}
        >
          {l}
        </Radio>
      ))}
    </fieldset>
  )
}

const workspaceOptions: [WorkspaceId, string][] = [
  ["hq", "本社営業部"],
  ["west", "西日本営業部"],
]

export function SystemStatesPage() {
  const monitor = useSystemMonitor({ api, pollInterval: api.statusPollInterval })
  const [saveWorkspace, setSaveWorkspace] = useState<WorkspaceId>("hq")
  const [jobWorkspace, setJobWorkspace] = useState<WorkspaceId>("hq")
  const [offlineMode, setOfflineMode] = useState<OfflineMode>("input-only")
  const statusRef = useRef<HTMLDivElement>(null)
  const showStatusPage = () => {
    const el = statusRef.current
    if (!el) return
    el.scrollIntoView({ block: "start" })
    el.focus({ preventScroll: true })
  }
  const availability = monitor.mutation("customers")
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / System & Account"
        name="System States"
        lead="接続、サービスの稼働、データ、保存、長時間の処理の状態を区別して伝える。影響の範囲に合う場所に示し、影響を受けていない機能は使えるままにする。確かめられていない結果を、成功として示さない。"
      />

      <Section title="状態の分類" lead="状態を 1 つのエラーにまとめない。接続、サービスの稼働、データ、保存、長時間の処理は別の値で持ち、同時に複数の状態がありうる。">
        <ConditionTable />
        <div className="mt-10">
          <Rules
            rows={[
              ["接続（Connectivity）", "サービスとの接続。ブラウザの online だけで接続できたとせず、疎通の確認が成功してから接続とする"],
              ["サービスの稼働（Service Health）", "機能ごとの稼働状態。状態を取得できない場合は不明とし、正常にしない"],
              ["データ（Data State）", "取得と鮮度。Data Browsing の Data States（useBrowseData）に従う"],
              ["保存（Mutation State）", "保存中、保存済み、失敗（処理されていない）、結果不明（処理された可能性がある）、送っていない（オフライン）"],
              ["長時間の処理（Job State）", "待機中、処理中、キャンセルの要求中、キャンセルの完了、成功、部分的な失敗、失敗、結果不明"],
            ]}
          />
        </div>
      </Section>

      <Section
        title="影響範囲と表示位置"
        lead="特定の操作は操作の近く、特定の領域は領域の中の Alert、複数のページは上部の Banner、製品全体が使えない場合は専用の状態の画面に示す。ネットワーク、障害の監視、状態の取得はすべて模擬の処理である。"
      >
        <DemoFrame testId="sys-impact">
          <div className="flex flex-col gap-8">
            <SystemSimulatorControls api={api} name="sys-impact" />
            <SystemAppExample monitor={monitor} onShowDetails={showStatusPage} onOpenStatusPage={showStatusPage} />
          </div>
        </DemoFrame>
        <div className="mt-10">
          <Rules
            rows={[
              ["特定の操作", "操作の近くに理由を示す（書き出しのボタンの下）。ほかの操作は使える"],
              ["特定の領域", "その領域の中の Alert や Error State（検索、通知）。一覧の表示と編集は使える"],
              ["特定のページ", "そのページの中の通知（契約と請求のページ）"],
              ["複数のページ", "App Shell の上部の System Banner（オフライン、顧客の一覧の性能の低下）"],
              ["製品全体", "Minimal Shell の専用の状態の画面（停止、メンテナンス）。オフラインは既存のデータを残すため Banner"],
            ]}
          />
        </div>
      </Section>

      <Section title="System Banner" lead="App Shell の上部に、Neutral の背景、意味のあるアイコン、文で、問題、影響の範囲、必要な行動を示す。高さは内容に合わせ、複数の問題は最も重大な 1 つと「ほか N 件」にまとめる。">
        <Rules
          rows={[
            ["置く位置", "App Shell の上部。常に認識する必要がある問題（オフライン、操作の制限）は、スクロールの領域（main）の外に置いて固定する。任意のお知らせは main の先頭に置き、内容と一緒にスクロールさせる"],
            ["集約", "重大な順（停止、メンテナンス、オフライン、一部の障害、再接続、性能の低下、復旧の確認）。予定は現在の問題の後"],
            ["閉じる", "任意のお知らせだけ閉じられる。重大な制限は、閉じた後も操作の近くと Status Page で確認できる"],
            ["重複", "同じ問題を Banner、Toast、Alert で重ねて示さない。領域の Alert に示す問題は Banner に出さない"],
            ["重なり", "Banner は上部の流れの中に置き、Toast（下部）、Bottom Navigation、Drawer と重ならない。画面の下に固定の操作がある場合は、Toast を --toast-offset-bottom で上げる"],
          ]}
        />
      </Section>

      <Section
        title="オフライン"
        lead="安全に表示できる既存のデータは残し、取得した時刻を示す。標準的な業務 SaaS では、オフラインの間の新規登録、更新、削除を制限する。入力できることと、サーバーに登録できることを区別する。"
      >
        <DemoFrame testId="sys-offline">
          <div className="flex flex-col gap-8">
            <SystemSimulatorControls api={api} parts={["network"]} name="sys-offline" />
            <OfflineRegistrationExample monitor={monitor} mode={offlineMode} onModeChange={setOfflineMode} />
            {offlineMode === "offline-queue" && <SyncControls />}
          </div>
        </DemoFrame>
        <div className="mt-10">
          <Rules
            rows={[
              ["登録不可", "オンラインの接続が必要。オフラインの間は入力も受け付けない（入力しても登録できないため）"],
              ["入力のみ可能", "入力した内容を画面に残し、接続が回復した後で利用者が登録する。入力できることと登録できることを区別して示す"],
              ["オフライン登録", "端末に保存し、後でサーバーと同期する。製品が安全に提供できる場合だけの例外。同期の認証・認可、競合、重複の防止、保存の期間、端末の機密データの保護は製品の責務"],
            ]}
          />
        </div>
        <div className="mt-10 flex flex-col gap-4">
          <h3 className="text-heading">オフライン登録の状態</h3>
          <p className="max-w-[40rem] text-ui text-muted-foreground">端末に保存しただけで、正式な登録が完了したとは示さない。この例の「端末への保存」は画面のメモリだけで行い、再読み込みで消える（永続的なローカルの保存と同期の基盤は実装しない）。</p>
          <SyncStatesList />
        </div>
      </Section>

      <Section title="正常状態" lead="通常の業務の画面では、正常の状態を表示しない。電話、機器の操作、リアルタイムの監視など、接続の状態が判断に必要な製品だけ、常に表示する。状態を確認できていない場合は、正常と表示しない。">
        <DemoFrame testId="sys-indicator-demo">
          <div className="flex flex-col gap-4">
            <p className="text-ui text-muted-foreground">通話の画面の例（接続の状態は模擬）。接続を確認するまで「正常」と示さず、通話を開始させない。</p>
            <CallConnectionIndicator api={api} />
          </div>
        </DemoFrame>
        <div className="mt-10">
          <Compare
            bad={
              <Mock label="業務の画面の上部に「すべてのシステムは正常です」と常に表示した例">
                <p className="text-ui font-medium">すべてのシステムは正常です</p>
                <div className="h-2 w-3/4 rounded-full bg-border" />
                <div className="h-2 w-1/2 rounded-full bg-border" />
              </Mock>
            }
            badNote="判断に使わない情報が常に場所を取る。状態の取得に失敗したときも「正常」と表示されやすい。"
            good={
              <Mock label="正常の間は何も表示せず、業務の内容だけを示した例">
                <div className="h-2 w-3/4 rounded-full bg-border" />
                <div className="h-2 w-1/2 rounded-full bg-border" />
              </Mock>
            }
            goodNote="問題があるときだけ示す。接続が判断に必要な製品だけ、状態を常に表示する。"
          />
        </div>
      </Section>

      <Section title="メンテナンスの事前通知" lead="利用に影響するメンテナンスだけを知らせる。開始と終了の予定、タイムゾーン、影響の範囲、取るべき行動、詳細を示す。">
        <Rules
          rows={[
            ["内容", "「12月3日(木) 2:00〜4:00（日本時間）に、書き出しと契約の管理のメンテナンスを行います」。影響する機能と、利用できる機能を書く"],
            ["行動", "「書き出しが必要な場合は、開始の前に済ませてください」。行動が不要なら書かない"],
            ["閉じる", "任意のお知らせのため閉じられる。閉じた後も、書き出しの操作の近くと Status Page に予定を残す（上の例で確かめられる）"],
            ["知らせない", "利用に影響しない内部のメンテナンス"],
          ]}
        />
      </Section>

      <Section title="メンテナンス中・サービス停止中" lead="製品全体が使えない場合は Minimal Shell の状態の画面にする。簡潔な説明と、実際に使える操作だけを置く。判明していない復旧の予定時刻を作らない。">
        <Compare
          bad={
            <Mock label="根拠のない復旧の予定時刻と、存在しない問い合わせ先を示した例">
              <p className="text-heading">ただいまメンテナンス中です</p>
              <p className="text-ui">まもなく復旧します（10:30 ごろの予定）</p>
              <p className="text-ui underline">お問い合わせはこちら</p>
            </Mock>
          }
          badNote="判明していない時刻を示すと、利用者は誤った見通しで待つ。存在しない窓口に案内しない。"
          good={
            <Mock label="わかっていることだけを示し、状態を再確認できる例">
              <p className="text-heading">メンテナンス中です</p>
              <p className="text-ui text-muted-foreground">終了の予定は、わかり次第お知らせします。</p>
              <span className="w-fit rounded-md bg-secondary px-3 py-1 text-ui">状態を再確認</span>
            </Mock>
          }
          goodNote="予定がわかっている場合だけ時刻を示す。Status Page と問い合わせ先は、実在する場合だけ案内する。"
        />
        <p className="mt-6 max-w-[40rem] text-ui text-muted-foreground">上の「影響範囲と表示位置」の例で「製品全体の停止」「メンテナンス中」を選ぶと、画面が状態の画面に置き換わる。統合の検証画面では、Minimal Shell の画面全体で表示する。</p>
      </Section>

      <Section title="再試行と自動復旧" lead="安全な取得と疎通の確認だけを、間隔と上限を設けて自動で再試行する。登録、編集、削除、決済、外部送信は、結果を確かめる前に無条件に再実行しない。">
        <DemoFrame testId="sys-retry-demo">
          <div className="flex flex-col gap-8">
            <SystemSimulatorControls api={api} parts={["reach"]} name="sys-retry" />
            <RetryDetails monitor={monitor} />
          </div>
        </DemoFrame>
        <div className="mt-10">
          <Rules
            rows={[
              ["自動で再試行する", "疎通の確認、安全な取得（状態、一覧）。間隔を 1 秒、2 秒、4 秒と延ばし、上限（この例は 4 回）で止めて、利用者の「再接続を試す」を待つ"],
              ["自動で再試行しない", "登録、編集、削除、決済、外部送信。冪等性（同じ要求を何度送っても 1 回だけ処理される）が API の契約で保証される場合だけ許容する"],
              ["再試行を置かない", "権限不足、認証切れ、入力の誤り。再試行しても解決しないため、次にすべきことを示す"],
              ["結果が不明", "再試行のボタンを置かず、結果の確認を置く。接続が回復したら、自動で結果を確かめる（安全な取得）"],
            ]}
          />
        </div>
      </Section>

      <Section title="未保存データと結果不明" lead="入力した内容は安全な範囲で残す。保存の成功を確認できない場合は、保存済みとして扱わない。通信が切れた後も、サーバーでは処理が完了している可能性がある。">
        <DemoFrame testId="sys-save-demo">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <SaveControls />
              <SystemSimulatorControls api={api} parts={["network"]} name="sys-save" />
            </div>
            <UnknownSaveExample monitor={monitor} workspace={saveWorkspace} onWorkspaceChange={setSaveWorkspace} />
          </div>
        </DemoFrame>
        <div className="mt-10">
          <Rules
            rows={[
              ["失敗（処理されていない）", "入力を残し、もう一度保存できる"],
              ["結果不明", "「保存できたかを確認できません」。保存のボタンを止め、「保存されたかを確認」を置く。要求の ID がサーバーの記録と一致すれば保存済み"],
              ["接続の回復", "結果が不明な保存を、自動で確かめる。確かめている間は「復旧を確認中」"],
              ["スコープの変更", "ワークスペースを切り替えたら、入力と結果を破棄し、前のワークスペースの保存の結果を反映しない（情報の保護を優先する）"],
            ]}
          />
        </div>
      </Section>

      <Section title="長時間処理" lead="実際の進捗を取得できる場合だけ進捗率を示す。キャンセルを要求しても、処理が止まったとは判断しない。ページを離れても続く処理は、戻ったときに状況を取得し直す。ジョブの実行は模擬の処理である。">
        <DemoFrame testId="sys-jobs-demo">
          <div className="flex flex-col gap-8">
            <JobControls />
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
              <legend className="mb-1 font-medium">ワークスペース</legend>
              {workspaceOptions.map(([w, l]) => (
                <Radio key={w} name="sys-job-workspace" checked={jobWorkspace === w} onChange={() => setJobWorkspace(w)}>
                  {l}
                </Radio>
              ))}
            </fieldset>
            <BackgroundJobsPanel
              monitor={monitor}
              workspace={jobWorkspace}
              notifyWith="toast"
              unavailableReason={availability.allowed ? undefined : "接続を確認できるまで、新しい処理を始められません。"}
            />
          </div>
        </DemoFrame>
        <div className="mt-10">
          <Rules
            rows={[
              ["進捗", "サーバーが実際の件数を返す間だけ Progress と件数を示す。返さない場合は「処理中」だけ"],
              ["キャンセル", "要求した後は「キャンセルを要求しました」。サーバーが停止を確かめたら「キャンセルしました」。停止の前に完了した場合は「完了」"],
              ["古い状態", "ジョブの ID と版で、前の処理や順序が入れ替わって届いた状態を反映しない。Toast も処理ごとの ID"],
              ["結果", "部分的な失敗と結果不明は、一覧に残す（Toast だけで伝えない）。結果不明は、データを確かめてから必要な場合だけ始め直す"],
            ]}
          />
        </div>
      </Section>

      <Section title="障害と復旧の通知" lead="短時間で自然に解消した失敗には、通知も成功の知らせも出さない。表示した障害が解消したときだけ、復旧を知らせる。接続と切断を繰り返す場合は、表示と読み上げを繰り返さない。操作の制限は遅らせない。">
        <DemoFrame testId="sys-flapping-demo">
          <FlappingDemo monitor={monitor} />
        </DemoFrame>
        <div className="mt-10">
          <Rules
            rows={[
              ["表示の安定", "問題が 1 秒続いてから表示する。消えても 2 秒の間に再び現れた場合は続いているものとして扱い、表示を残す（useStableIssues）"],
              ["読み上げ", "問題の集合と分類が 1 秒変わらなかったときだけ更新する。自動の再試行の回数の変化では更新しない"],
              ["操作の制限", "遅らせない。接続を確認できない間は、すぐに保存を受け付けない"],
              ["復旧の知らせ", "表示した接続の問題が解消し、ほかの問題がない場合だけ「接続が回復しました」。再取得や保存の結果の確認が必要な間は「復旧を確認中」を続ける"],
              ["部分的な障害", "別の障害が残っている場合は、その表示を続ける（すべてを解除しない）"],
            ]}
          />
        </div>
      </Section>

      <Section title="Status Page" lead="必要な製品だけが提供する。製品全体の障害のときにも確認できるよう、主要なサービスと異なる障害の境界で運用することを推奨する。内部の構成や Stack Trace をそのまま公開しない。">
        <div ref={statusRef} tabIndex={-1} className="outline-none" aria-label="Status Page の例">
          <DemoFrame testId="sys-status-demo">
            <div className="flex flex-col gap-8">
              <SystemSimulatorControls api={api} parts={["service", "status"]} name="sys-status" />
              <StatusPageExample api={api} />
            </div>
          </DemoFrame>
        </div>
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "状態の変化は、常に置いた読み上げの領域（role=\"status\"）の中身を変えて伝える。表示と同時に挿入した領域には頼らない。",
            "自動の再試行のたびに読み上げない。問題の集合と分類が変わったときだけ、1 回読み上げる。",
            "通知や状態の変化でフォーカスを奪わない。お知らせを閉じたときは、フォーカスを Banner の領域に移す（<body> に落とさない）。",
            "Banner は上部の流れの中に置き、重要な操作の領域を覆わない。狭い画面では、複数の問題を「ほか N 件」にまとめる。",
            "色だけで状態を伝えない。アイコンと文を組み合わせる。",
            "動きを減らす設定では、再接続と処理中の回転を止める（motion-safe）。",
          ]}
        />
        <div className="mt-6">
          <AppLink href="#/account-app">統合の検証画面で、オフラインと復旧を試す</AppLink>
        </div>
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="同じ障害を、赤い Banner、Toast、領域の Alert で同時に示した例">
              <p className="rounded-sm bg-destructive px-3 py-2 text-ui text-destructive-foreground">エラーが発生しました</p>
              <p className="text-ui">検索を利用できません</p>
              <p className="self-end rounded-md border border-border px-3 py-2 text-ui">エラーが発生しました</p>
            </Mock>
          }
          badNote="同じ問題が 3 か所に現れ、何が起きているか、何ができるかがわからない。赤は破壊的な操作と本当のエラーだけに使う。"
          good={
            <Mock label="検索の領域の中だけに、利用できない機能と利用できる機能を示した例">
              <p className="text-ui font-medium">検索の一部が利用できません</p>
              <p className="text-ui text-muted-foreground">一覧の表示と編集は利用できます。</p>
            </Mock>
          }
          goodNote="影響の範囲に合う 1 か所に、問題と、利用できる機能を示す。"
        />
        <Compare
          bad={
            <Mock label="応答を受け取れなかった保存を「保存しました」と示した例">
              <p className="text-ui">保存しました</p>
            </Mock>
          }
          badNote="サーバーで保存されたかがわからない。利用者は保存できたと誤解する。"
          good={
            <Mock label="保存できたかを確認できないと示し、確認の操作を置いた例">
              <p className="text-ui">保存できたかを確認できません。</p>
              <span className="w-fit rounded-md border border-border px-3 py-1 text-ui">保存されたかを確認</span>
            </Mock>
          }
          goodNote="結果を確かめてから、保存済みか、もう一度保存できるかを示す。"
        />
      </Section>
    </article>
  )
}
