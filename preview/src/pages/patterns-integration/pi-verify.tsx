import { useState, type ReactNode } from "react"

import type { PiUser } from "../../data/patterns-integration/model"
import { piControl, type ImportMode, type Permission, type SaveMode } from "../../data/patterns-integration/server"

// 検証用の操作（模擬のサーバー）。手動の検品で、結果の種類、権限、障害、セッションの期限切れ、新着のお知らせを切り替える。
// 自動の検品は window.__fdPi から同じ操作を行う。製品の画面には置かない。

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-6">{children}</div>
    </fieldset>
  )
}

function Choice({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-4 accent-[var(--primary)]" />
      {children}
    </label>
  )
}

function Action({ onClick, children, testId }: { onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button type="button" onClick={onClick} className="min-h-10 rounded-md text-left underline underline-offset-4" data-testid={testId}>
      {children}
    </button>
  )
}

const all: Permission[] = ["view", "edit", "delete", "export"]

export function VerifyPanel({ user, ws }: { user: PiUser; ws: string }) {
  const [, setN] = useState(0)
  const c = piControl.config
  const set = (fn: () => void) => {
    fn()
    setN((n) => n + 1)
  }
  const radio = <T extends string>(legend: string, name: string, value: T, options: [T, string][], apply: (v: T) => void) => (
    <Group legend={legend}>
      {options.map(([v, l]) => (
        <Choice key={v} name={`pi-${name}`} checked={value === v} onChange={() => set(() => apply(v))}>
          {l}
        </Choice>
      ))}
    </Group>
  )
  return (
    <details className="mx-4 mb-8 rounded-xl border border-border p-4 text-ui md:mx-6" data-testid="pi-verify">
      <summary className="min-h-10 cursor-pointer content-center font-medium">検証用の操作（模擬のサーバー）</summary>
      <div className="mt-4 flex flex-col gap-4">
        {radio<SaveMode>("顧客の保存の結果", "save", c.saveMode, [
          ["success", "成功"],
          ["failed", "失敗"],
          ["invalid", "サーバー側の検証のエラー"],
          ["conflict", "競合"],
          ["unknown", "結果が不明"],
          ["forbidden", "権限がない"],
        ], (v) => (c.saveMode = v))}
        {radio<"applied" | "not-applied">("結果が不明のとき、サーバーでは", "unknown-applied", c.unknownApplied ? "applied" : "not-applied", [
          ["applied", "処理を終えていた"],
          ["not-applied", "処理していなかった"],
        ], (v) => (c.unknownApplied = v === "applied"))}
        <Group legend="一括操作（停止にする）">
          <Action onClick={() => set(() => Object.assign(c.bulkOutcomes, { c03: "failed", c04: "unknown" }))}>
            次の実行で、3 行目（c03）を失敗、4 行目（c04）を結果が不明にする
          </Action>
        </Group>
        {radio<ImportMode>("取り込みの応答", "import", c.importMode, [
          ["full", "件数と行ごとの結果を返す"],
          ["incomplete", "作成の件数だけを返す"],
        ], (v) => (c.importMode = v))}
        {radio<"operational" | "outage">("分析のサービス", "analysis", c.services.analysis === "outage" ? "outage" : "operational", [
          ["operational", "正常"],
          ["outage", "障害"],
        ], (v) => piControl.setService("analysis", v))}
        <Group legend={`権限（${user.name}、このワークスペース）`}>
          <Action onClick={() => set(() => piControl.setPermissions(user.id, ws, ["view"]))}>閲覧だけにする</Action>
          <Action onClick={() => set(() => piControl.setPermissions(user.id, ws, []))}>閲覧の権限も外す</Action>
          <Action onClick={() => set(() => piControl.setPermissions(user.id, ws, all))}>すべての操作を許可する</Action>
          <Action onClick={() => set(() => piControl.setPermissions(user.id, ws, [...(c.permissions[user.id]?.[ws] ?? [])]))}>権限を確かめ直す（変更なし）</Action>
        </Group>
        <Group legend="お知らせとセッション">
          <Action onClick={() => piControl.pushNotification(ws, user.id, "株式会社ウミネコ運輸から問い合わせがありました", "c03")}>新着のお知らせを送る</Action>
          <Action onClick={() => piControl.expireSession()} testId="pi-expire">
            セッションの期限を切らす
          </Action>
        </Group>
      </div>
    </details>
  )
}
