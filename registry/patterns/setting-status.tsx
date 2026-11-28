"use client"

import * as React from "react"
import { Check, CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"

import type { SettingSaveState } from "@/patterns/setting-save"

// Flow Design Setting Status（Patterns / System & Account / Settings）
// 設定の 1 行（Settings Row）と、保存の状態の表示。定義は docs/web/patterns/settings.md を参照。
// - SettingRow：設定の名前と補足を左、操作（Switch、Select、Button）を右に置く 1 行（Settings Row）。Field で名前と操作を関連付ける。
//   行の幅が足りない場合は、操作を名前の下へ縦に移す（Container Query）。Switch など小さな操作は layout="inline" で横に保つ。
//   設定の項目ごとに Card で囲まない。行の間は余白（16〜24px）で区切る。
// - SettingSaveStatus：保存の単位の状態（保存中、保存しました、確定した失敗、バリデーションによる拒否、権限不足、競合、
//   結果の不明、未保存の変更）を文字で示す。常に置いた読み上げの領域（role="status"）の中身を変える。
//   結果が不明な場合と競合の場合だけ「保存されたかを確認」を置く（サーバーの値を取得し直す。同じ保存を送り直さない）。
//
// この部品が守ること
// - 状態を色だけで伝えない（文字とアイコン）。Destructive の色は、処理されなかったことが確かな失敗（確定した失敗と
//   バリデーションによる拒否）だけに使う（権限不足、競合、結果の不明は warning）。
// - 状態が変わってもフォーカスを動かさない。保存の状態は名前と補足の下（狭い領域では操作の下）に置き、文が増えても操作の位置を動かさない。
// - 読み上げの領域は display: none にしない（中身が空の間は高さ 0 になる）。
//
// この部品が持たないもの（製品の責務）
// - 保存の処理と状態（useInstantSettings、useSettingsForm）、文言の内容。

function SettingRow({
  label,
  description,
  status,
  layout = "auto",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  /** 設定の名前（14px / 500）。操作の名前になる */
  label: React.ReactNode
  /** 補足の説明、出所（組織の標準に従っている、組織のポリシー）、変更できない理由（14px）。操作の説明として読み上げる */
  description?: React.ReactNode
  /** 保存の状態（SettingSaveStatus）。名前と補足の下に置く */
  status?: React.ReactNode
  /** auto：幅が足りなければ操作を名前の下へ移す。inline：常に横に並べる（Switch など小さな操作） */
  layout?: "auto" | "inline"
  /** 操作（Switch、Select、Input、Button）。1 つの行に 1 つの設定を置く */
  children: React.ReactNode
}) {
  return (
    <div data-slot="setting-row" data-layout={layout} className={cn("@container/setting-row min-w-0", className)} {...props}>
      <div
        className={cn(
          "grid min-w-0 gap-x-6 gap-y-3",
          layout === "inline"
            ? "grid-cols-[minmax(0,1fr)_auto] items-start"
            : "grid-cols-1 @md/setting-row:grid-cols-[minmax(0,1fr)_auto] @md/setting-row:items-start"
        )}
      >
        {/* Field で名前と補足を操作に関連付ける。Field 自体は配置に加わらない（display: contents） */}
        <Field className="contents">
          <div data-slot="setting-row-text" className="flex min-w-0 flex-col gap-1 pt-1">
            <FieldLabel data-slot="setting-row-label" className="text-ui font-medium [word-break:auto-phrase]">
              {label}
            </FieldLabel>
            {description && <FieldDescription className="[word-break:auto-phrase]">{description}</FieldDescription>}
          </div>
          <div data-slot="setting-row-control" className="flex min-w-0 flex-wrap items-center gap-2">
            {children}
          </div>
        </Field>
        {/* 保存の状態は Field の外に置く（「保存されたかを確認」のボタンを、設定の操作として関連付けない） */}
        {status && <div className="col-start-1 min-w-0">{status}</div>}
      </div>
    </div>
  )
}

type StatusTexts = {
  saving: string
  verifying: string
  saved: string
  dirty: string
}

const defaultTexts: StatusTexts = {
  saving: "保存中…",
  verifying: "保存されたかを確認しています…",
  saved: "保存しました",
  dirty: "保存していない変更があります",
}

function SettingSaveStatus({
  status,
  dirty = false,
  onVerify,
  verifyLabel = "保存されたかを確認",
  texts,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  status: SettingSaveState
  /** 明示的な保存のフォームの未保存の変更（idle のときに示す） */
  dirty?: boolean
  /** 結果が不明か競合の保存を確かめる（サーバーの値を取得する）。渡さない場合は「保存されたかを確認」を置かない */
  onVerify?: () => void
  verifyLabel?: string
  texts?: Partial<StatusTexts>
}) {
  const t = { ...defaultTexts, ...texts }
  const s = status.state
  const text =
    s === "saving"
      ? t.saving
      : s === "verifying"
        ? t.verifying
        : s === "saved"
          ? t.saved
          : s === "idle"
            ? dirty
              ? t.dirty
              : ""
            : "message" in status
              ? status.message
              : ""
  const definite = s === "failed" || s === "invalid"
  const warning = s === "unknown" || s === "forbidden" || s === "conflict"
  const Icon = s === "saving" || s === "verifying" ? LoaderCircle : s === "saved" ? Check : definite ? CircleAlert : warning ? TriangleAlert : null
  return (
    <div
      data-slot="setting-save-status"
      data-state={s === "idle" && dirty ? "dirty" : s}
      data-reason={status.state === "unknown" ? status.reason : undefined}
      className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1", className)}
      {...props}
    >
      {/* 読み上げの領域は常に置き、中身だけを変える */}
      <p
        role="status"
        className={cn(
          "flex min-w-0 items-start gap-2 text-ui [word-break:auto-phrase]",
          definite ? "text-destructive" : warning ? "text-warning" : "text-muted-foreground"
        )}
      >
        {text && Icon && <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", (s === "saving" || s === "verifying") && "motion-safe:animate-spin")} />}
        {text && <span>{text}</span>}
      </p>
      {(s === "unknown" || s === "conflict") && onVerify && (
        <Button variant="outline" size="sm" onClick={onVerify}>
          {verifyLabel}
        </Button>
      )}
    </div>
  )
}

export { SettingRow, SettingSaveStatus }
