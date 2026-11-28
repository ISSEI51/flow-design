import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { reconcileImportResult, type ImportIntegrity, type ImportResult } from "@/patterns/import-mapping"
import { ImportResultSummary } from "@/patterns/import-review"
import { PageHeader, PageHeaderContent, PageHeaderTitle } from "@/patterns/page-header"
import { PageLayout } from "@/patterns/page-layout"
import { RestrictedAction } from "@/patterns/restricted-action"

import { importCustomers, lookupImport, type ImportRow } from "../../data/patterns-integration/server"
import { usePi } from "./pi-context"
import { PiBreadcrumb } from "./pi-parts"
import { piHref } from "./pi-router"

// CSV の取り込み（Import & Export の結果の照合の例。製品側のコード）。
// - 応答は reconcileImportResult で、取り込みの対象（行の番号）と照合する。件数の一部しか返らない場合は成功として示さない。
// - 結果が不明な場合は再処理のボタンを置かず、「状態を確認」でサーバーの状態を照会する（行の位置から推測しない）。
// - 列の対応付けは、この検証画面では固定（名前、メールアドレス、プラン）。対応付けの検証は Forms & Workflows の検証画面で行う。

type Outcome = { result: ImportResult; integrity: ImportIntegrity }
let importSeq = 0

function parse(text: string): ImportRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "")
  return lines.slice(1).map((l) => {
    const [name = "", email = "", plan = ""] = l.split(",").map((v) => v.trim())
    return { name, email, plan }
  })
}

export function ImportScreen() {
  const { ws, permit, permitLatest } = usePi()
  const w = ws === "hq" ? null : ws
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importId, setImportId] = useState<string | null>(null)
  const edit = permit("edit")
  const targetRows = rows ? rows.map((_, i) => i + 1) : []

  const run = async () => {
    if (!rows || running) return
    if (!permitLatest("edit")) return setError("取り込む権限がないか、オフラインのため取り込めません。")
    setRunning(true)
    setError(null)
    // 要求の ID。応答を受け取れなかった場合も、この ID でサーバーの結果を照会する
    const id = `import-${ws}-${++importSeq}-${Date.now()}`
    setImportId(id)
    try {
      const raw = await importCustomers(ws, id, rows)
      const r = reconcileImportResult({ total: rows.length, rows: targetRows }, raw)
      setOutcome({ result: r.result, integrity: r.integrity })
    } catch {
      // 応答がない：すべての行の結果が不明
      const r = reconcileImportResult({ total: rows.length, rows: targetRows }, { rows: targetRows.map((row) => ({ row, outcome: "unknown" })) })
      setOutcome({ result: r.result, integrity: r.integrity })
    } finally {
      setRunning(false)
    }
  }

  // 状態の確認：この取り込みの要求（importId）の行ごとの結果を、現在の認可でサーバーに照会する。行の位置や内容から推測しない
  const checkStatus = async () => {
    if (!rows || checking || !importId) return
    setChecking(true)
    try {
      const recorded = await lookupImport(ws, importId)
      // サーバーが要求を受け付けていない場合は、どの行も取り込んでいない（確定した失敗）
      const response = {
        rows: rows.map((_, i) => {
          const r = recorded?.find((x) => x.row === i + 1)
          return r ? { row: r.row, outcome: r.outcome, reason: r.reason } : { row: i + 1, outcome: "failed", reason: "取り込まれていません" }
        }),
      }
      const r = reconcileImportResult({ total: rows.length, rows: targetRows }, response)
      setOutcome({ result: r.result, integrity: r.integrity })
    } catch {
      setError("状態を確認できませんでした。時間をおいて、もう一度確認してください。")
    } finally {
      setChecking(false)
    }
  }

  return (
    <PageLayout width="focused" data-testid="pi-import">
      <PageHeader>
        <div className="basis-full">
          <PiBreadcrumb items={[{ label: "顧客", href: piHref("customers", { ws: w }) }]} current="CSV から取り込む" />
        </div>
        <PageHeaderContent>
          <PageHeaderTitle>CSV から取り込む</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <div className="flex flex-col gap-6">
        <Field>
          <FieldLabel>CSV ファイル</FieldLabel>
          <Input
            type="file"
            accept=".csv,text/csv"
            data-testid="import-file"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              setOutcome(null)
              setError(null)
              if (!file) return setRows(null)
              setFileName(file.name)
              setRows(parse(await file.text()))
            }}
          />
          <FieldDescription>1 行目は見出し（名前、メールアドレス、プラン）。2 行目から 1 行に 1 件の顧客。</FieldDescription>
        </Field>
        {rows && !outcome && (
          <p className="text-ui" data-testid="import-ready">
            {fileName}：{rows.length.toLocaleString("ja-JP")}件
          </p>
        )}
        {error && (
          <p role="alert" className="text-ui text-destructive">
            {error}
          </p>
        )}
        {outcome ? (
          <div data-testid="import-result">
            <ImportResultSummary result={outcome.result} integrity={outcome.integrity} retrying={checking} onCheckStatus={() => void checkStatus()} />
          </div>
        ) : (
          <RestrictedAction presentation={edit.presentation} reason={edit.reason ?? undefined}>
            {(control) => (
              <Button {...control} className="w-fit" disabled={!rows || !edit.allowed} loading={running} onClick={() => void run()} data-testid="import-run">
                取り込む
              </Button>
            )}
          </RestrictedAction>
        )}
      </div>
    </PageLayout>
  )
}
