import { useState } from "react"

import { Button } from "@/components/ui/button"
import { PageLayout } from "@/patterns/page-layout"
import { Section, SectionDescription, SectionHeader, SectionHeading, SectionTitle } from "@/patterns/section-layout"

import { analysisServer, type AnalysisRequestKind } from "../../data/data-analysis/analysis-server"
import { useSession } from "./analysis-session"
import { opsTicker } from "./operations-dashboard"

// 検証用の操作（製品の画面には含めない）。模擬のサーバーの応答の時間、取得の失敗、権限、予測の有無、リアルタイムの更新を切り替える。

const regionsByPage: Record<string, [AnalysisRequestKind, string][]> = {
  business: [
    ["overview", "主要な指標"],
    ["trend", "MRR の推移"],
    ["bridge", "増減の内訳"],
    ["profit", "地域別の営業利益"],
  ],
  retention: [
    ["retention", "解約の状況"],
    ["trend", "解約率の推移"],
    ["breakdown", "内訳"],
    ["accounts", "解約した企業"],
    ["account", "企業の詳細"],
  ],
  "retention-accounts": [["accounts", "企業の一覧"]],
  account: [["account", "企業の詳細"]],
  operations: [["ops-transfers", "口座振替の処理状況"]],
}

export function AnalysisControls({ page, onReload }: { page: string; onReload: () => void }) {
  const { session, setSession } = useSession()
  const [, force] = useState(0)
  const set = (fn: () => void) => {
    fn()
    force((n) => n + 1)
  }
  const radio = (name: string, value: string, current: string, label: string, onChange: () => void) => (
    <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2">
      <input type="radio" name={name} value={value} checked={current === value} onChange={onChange} className="size-4 accent-[var(--primary)]" />
      {label}
    </label>
  )
  const targets = regionsByPage[page] ?? []
  return (
    <PageLayout width="wide" className="pt-0" data-testid="analysis-controls">
      <Section divider>
        <SectionHeader>
          <SectionHeading>
            <SectionTitle>検証用の操作</SectionTitle>
            <SectionDescription>模擬のサーバーの設定。製品の画面には含めない。変更は次の取得から反映する（「画面を作り直す」ですぐに反映する）。</SectionDescription>
          </SectionHeading>
        </SectionHeader>
        <div className="grid gap-6 text-ui @3xl/page:grid-cols-2">
          <fieldset className="flex flex-wrap items-center gap-x-4">
            <legend className="mb-1 font-medium">応答までの時間</legend>
            {(
              [
                [100, "短い（100ms）"],
                [350, "標準（350ms）"],
                [3000, "長い（3 秒）"],
              ] as const
            ).map(([ms, label]) => radio("analysis-latency", String(ms), String(analysisServer.latency.default), label, () => set(() => (analysisServer.latency = { default: ms }))))}
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-x-4">
            <legend className="mb-1 font-medium">ワークスペース（データのスコープ）</legend>
            {radio("analysis-ws", "hq", session.workspace, "本社（すべての地域）", () => setSession({ workspace: "hq" }))}
            {radio("analysis-ws", "kyushu", session.workspace, "九州支店", () => setSession({ workspace: "kyushu" }))}
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-x-4">
            <legend className="mb-1 font-medium">明細の閲覧の権限</legend>
            {radio("analysis-role", "manager", session.role, "管理者（すべて）", () => setSession({ role: "manager" }))}
            {radio("analysis-role", "staff", session.role, "担当者（一部の取引先を除く）", () => setSession({ role: "staff" }))}
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-x-4">
            <legend className="mb-1 font-medium">一覧の、閲覧できない明細の件数</legend>
            {radio("analysis-hidden", "show", session.hiddenCountPolicy, "件数を示す", () => setSession({ hiddenCountPolicy: "show" }))}
            {radio("analysis-hidden", "hide", session.hiddenCountPolicy, "一覧では件数を示さない", () => setSession({ hiddenCountPolicy: "hide" }))}
            <p className="w-full text-caption text-muted-foreground">
              一覧の件数だけを隠す設定。閲覧できない明細の有無にかかわらず、一覧の応答と文は同じ形になる。集計の指標（解約した企業数）は表示するため、指標と一覧の件数の差から推測できる。集計値の公開の範囲は、製品が別に決める。
            </p>
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-x-4">
            <legend className="mb-1 font-medium">閲覧の権限がない企業の詳細</legend>
            {radio("analysis-forbidden", "forbidden", session.forbiddenDetail, "権限不足として示す", () => setSession({ forbiddenDetail: "forbidden" }))}
            {radio("analysis-forbidden", "not-found", session.forbiddenDetail, "存在しない場合と同じに示す", () => setSession({ forbiddenDetail: "not-found" }))}
            <p className="w-full text-caption text-muted-foreground">
              権限不足として示すと、企業が存在し、集計に含まれることがわかる。企業の存在そのものが機密の場合は、存在しない場合と同じに示す（実際の応答の違いはバックエンドがなくす）。
            </p>
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-x-4">
            <legend className="mb-1 font-medium">集計のタイムゾーン</legend>
            {radio("analysis-tz", "Asia/Tokyo", session.timeZone, "Asia/Tokyo", () => setSession({ timeZone: "Asia/Tokyo" }))}
            {radio("analysis-tz", "America/New_York", session.timeZone, "America/New_York", () => setSession({ timeZone: "America/New_York" }))}
          </fieldset>
          <label className="flex min-h-10 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={analysisServer.ignoreAbort}
              onChange={(e) => set(() => (analysisServer.ignoreAbort = e.target.checked))}
              className="size-4 accent-[var(--primary)]"
              data-testid="ignore-abort"
            />
            中止を無視する API（古い応答も後から届く）
          </label>
          {page === "business" && (
            <fieldset className="flex flex-wrap items-center gap-x-4">
              <legend className="mb-1 font-medium">予測のデータ</legend>
              {radio("analysis-forecast", "on", analysisServer.forecast ? "on" : "off", "返す", () => set(() => (analysisServer.forecast = true)))}
              {radio("analysis-forecast", "off", analysisServer.forecast ? "on" : "off", "返さない", () => set(() => (analysisServer.forecast = false)))}
            </fieldset>
          )}
          {targets.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 font-medium">取得を失敗させる領域（常に失敗）</legend>
              <div className="flex flex-wrap gap-x-4">
                {targets.map(([kind, label]) => (
                  <label key={kind} className="flex min-h-10 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(analysisServer.alwaysFail[kind])}
                      onChange={(e) => set(() => (analysisServer.alwaysFail[kind] = e.target.checked))}
                      className="size-4 accent-[var(--primary)]"
                      data-testid={`fail-${kind}`}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {page === "operations" && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="xs" onClick={() => opsTicker.reset()}>
                監視の時刻を 14:30 に戻す
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 @3xl/page:col-span-2">
            <Button variant="outline" size="xs" onClick={onReload} data-testid="analysis-rebuild">
              画面を作り直す
            </Button>
          </div>
        </div>
      </Section>
    </PageLayout>
  )
}
