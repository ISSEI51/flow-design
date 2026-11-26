import { useState } from "react"

import { Button } from "@/components/ui/button"
import { PageLayout } from "@/patterns/page-layout"
import { Section, SectionDescription, SectionHeader, SectionHeading, SectionTitle } from "@/patterns/section-layout"

import { analysisServer, type AnalysisRequestKind } from "../../data/data-analysis/analysis-server"
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
            <legend className="mb-1 font-medium">明細の閲覧の権限</legend>
            {radio("analysis-role", "manager", analysisServer.role, "管理者（すべて）", () => set(() => (analysisServer.role = "manager")))}
            {radio("analysis-role", "staff", analysisServer.role, "担当者（一部の取引先を除く）", () => set(() => (analysisServer.role = "staff")))}
          </fieldset>
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
