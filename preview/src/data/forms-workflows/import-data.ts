// CSV の取り込みの模擬（プレビュー専用）。Registry には含めない。
// ファイルの解析は、確認のための最小限の分割だけを行う（引用符の中の区切り文字に対応する程度）。本格的な CSV の解析ではない。
// 検証と登録は、模擬のサーバーの処理として、このページのメモリの上で行う。

import type { ColumnMapping, ImportField } from "@/patterns/import-mapping"
import type { ImportIssue } from "@/patterns/import-review"

import { formsServer, listCustomers, wait } from "./server"

export const importFields: ImportField[] = [
  { id: "code", label: "顧客コード", required: true, aliases: ["コード", "customer code"] },
  { id: "company", label: "会社名", required: true, aliases: ["社名", "取引先名"] },
  { id: "owner", label: "担当者", aliases: ["担当", "営業担当"] },
  { id: "phone", label: "電話番号", aliases: ["TEL", "電話"] },
  { id: "email", label: "メールアドレス", aliases: ["mail", "E-mail", "メール"] },
  { id: "zip", label: "郵便番号", aliases: ["〒"] },
]

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024

// 見本のファイル。同じ見出しの列（電話番号）、別名の見出し（担当）、取り込まない列（メモ）、エラーと重複の候補を含む。
export function sampleCsv(rows = 40) {
  const lines = ["顧客コード,会社名,電話番号,電話番号,担当,メモ,メールアドレス"]
  for (let i = 1; i <= rows; i++) {
    const code = i === 3 ? "C-0001" : i === 9 ? "C-0002" : `C-${String(1000 + i).padStart(4, "0")}`
    const company = i === 5 || i === 17 ? "" : `株式会社サンプル${i}`
    const email = i === 12 ? "sample12@" : `info${i}@example.com`
    const phone = i % 7 === 0 ? "" : `03-5555-${String(1000 + i).slice(-4)}`
    lines.push([code, company, phone, `090-0000-${String(1000 + i).slice(-4)}`, i % 2 ? "佐藤 美咲" : "鈴木 健太", i === 4 ? "「至急」連絡" : "", email].join(","))
  }
  return lines.join("\n")
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (line.trim() === "") continue
    const cells: string[] = []
    let cur = ""
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') quoted = false
        else cur += ch
      } else if (ch === '"') quoted = true
      else if (ch === ",") {
        cells.push(cur)
        cur = ""
      } else cur += ch
    }
    cells.push(cur)
    rows.push(cells)
  }
  return { headers: rows[0] ?? [], rows: rows.slice(1) }
}

const failedOnce = new Set<number>()
// サーバーが処理を終えた行（結果を返せなかった行を含む）。結果が不明の行の状態の確認で使う
const processedRows = new Set<number>()

export type DuplicatePolicy = "skip" | "update" | "create"
export type ImportPlanRow = { row: number; values: Record<string, string>; state: "valid" | "review" | "error"; duplicateOf?: string }

/** 対応付けた値で、すべての行を検証する（模擬のサーバー） */
export async function validateRows(rows: string[][], mapping: ColumnMapping, signal?: AbortSignal) {
  await wait(formsServer.latency.import, signal)
  const existing = new Map(listCustomers().map((c) => [c.code, c]))
  const seen = new Set<string>()
  const plan: ImportPlanRow[] = []
  const issues: ImportIssue[] = []
  rows.forEach((cells, i) => {
    const row = i + 2 // 見出しの行が 1
    const values: Record<string, string> = {}
    for (const [key, field] of Object.entries(mapping)) if (field) values[field] = (cells[Number(key.replace("col-", ""))] ?? "").trim()
    let state = "valid" as ImportPlanRow["state"]
    let duplicateOf: string | undefined
    const add = (s: "error" | "review", field: string, message: string, fix?: string) => {
      issues.push({ row, state: s, field, message, fix })
      if (s === "error" || state === "valid") state = s
    }
    if (!values.code) add("error", "顧客コード", "顧客コードが空です", "C-0000 の形で入力してください")
    else if (!/^C-\d{4}$/.test(values.code)) add("error", "顧客コード", `「${values.code}」は顧客コードの形ではありません`, "C-0000 の形で入力してください")
    if (!values.company) add("error", "会社名", "会社名が空です", "会社名を入力してください")
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
      add("error", "メールアドレス", `「${values.email}」はメールアドレスの形ではありません`, "「@」の後にドメイン名を入力してください")
    if (values.code && existing.has(values.code) && (state as string) !== "error") {
      const c = existing.get(values.code)!
      duplicateOf = c.id
      add("review", "顧客コード", `登録済みの顧客（${c.code} ${c.company || `${c.lastName} ${c.firstName}`}）と同じ顧客コードです`, "重複の扱いで、登録しないか、更新するかを選んでください")
    } else if (values.code && seen.has(values.code) && (state as string) !== "error") {
      add("error", "顧客コード", `ファイルの中で、顧客コード「${values.code}」が重複しています`, "どちらかの行を直してください")
    }
    if (values.code) seen.add(values.code)
    plan.push({ row, values, state, duplicateOf })
  })
  return { plan, issues }
}

/** 実行の前の件数。重複の扱いと、エラーの行の扱いから決める */
export function planCounts(plan: ImportPlanRow[], policy: DuplicatePolicy) {
  const valid = plan.filter((p) => p.state === "valid").length
  const review = plan.filter((p) => p.state === "review").length
  const error = plan.filter((p) => p.state === "error").length
  return {
    create: valid + (policy === "create" ? review : 0),
    update: policy === "update" ? review : 0,
    skip: policy === "skip" ? review : 0,
    error,
    total: plan.length,
  }
}

/**
 * 取り込みを実行する（模擬）。サーバーの応答の形（件数と、行ごとの結果）を返す。照合は呼び出し側が reconcileImportResult で行う。
 * onProgress は処理した行の数を報告する（実際の進捗がわかる場合だけ）。
 * importMode：success（すべて成功）、partial（3 行が失敗。再処理は成功）、fail（すべて失敗）、unknown（途中で通信が切れ、後半の行の結果がない）、
 * throw（途中で通信の例外になり、応答がない。前半の行は登録済み）、
 * inconsistent（同じ行の異なる結果、対象ではない行の結果、結果の不足、行の結果と合わない件数を含む）。
 * unknown と throw では、応答を返せなかった行の一部（最初の 1 行、throw では前半）をサーバーは処理している。
 */
export async function runImport(
  targets: ImportPlanRow[],
  { policy, clearBlanks = false, onProgress }: { policy: DuplicatePolicy; clearBlanks?: boolean; onProgress?: (done: number) => void }
) {
  const mode = formsServer.importMode
  // 更新の空欄の扱い（clearBlanks）は、サーバーへの要求に含める（模擬のため、記録だけを残す）
  formsServer.requests.push({ kind: "run-import", at: Date.now(), payload: { rows: targets.map((t) => t.row), policy, clearBlanks } })
  const total = targets.length
  const rows: { row: number; outcome: string; reason?: string }[] = []
  let done = 0
  const step = Math.max(1, Math.ceil(total / 5))
  for (const t of targets) {
    if (done % step === 0) {
      onProgress?.(done)
      await wait(formsServer.latency.import / 5)
    }
    if ((mode === "unknown" || mode === "throw") && done >= Math.floor(total / 2)) {
      // 通信が切れる直前の 1 行は、サーバーでは登録している（応答だけが届かない）
      processedRows.add(t.row)
      if (mode === "throw") throw new Error("通信が切れました")
      break
    }
    done++
    if (mode === "throw") {
      processedRows.add(t.row)
      continue
    }
    // 一部失敗は、最初の試行だけ失敗させる（失敗した行の再処理は成功する）
    if (mode === "fail" || (mode === "partial" && rows.filter((r) => r.outcome === "failed").length < 3 && t.row % 6 === 0 && !failedOnce.has(t.row))) {
      if (mode === "partial") failedOnce.add(t.row)
      rows.push({ row: t.row, outcome: "failed", reason: mode === "fail" ? "サーバーで処理できませんでした" : "同じ時刻に、ほかの利用者が同じ顧客コードを登録しました" })
      continue
    }
    const outcome = t.state === "review" ? (policy === "skip" ? "skipped" : policy === "update" ? "updated" : "created") : "created"
    if (outcome !== "skipped") processedRows.add(t.row)
    rows.push({ row: t.row, outcome })
  }
  onProgress?.(done)
  if (mode === "inconsistent" && rows.length > 2) {
    rows.push({ ...rows[0], outcome: rows[0].outcome === "failed" ? "created" : "failed" }) // 同じ行の異なる結果
    rows.push({ row: 9999, outcome: "created" }) // 対象ではない行
    rows.splice(1, 1) // 結果の不足
  }
  const n = (o: string) => rows.filter((r) => r.outcome === o).length
  return {
    created: mode === "inconsistent" ? n("created") + 1 : n("created"),
    updated: n("updated"),
    skipped: n("skipped"),
    failed: n("failed"),
    rows,
  }
}

/** 結果が不明な行が、登録されたかを確かめる（模擬。この画面では、通信が切れた後の行は登録されていない） */
/** 結果が不明な行が、サーバーで登録されているかを確かめる（模擬）。登録済みの行と、登録されていない行に分ける */
export async function checkImportStatus(rows: ImportPlanRow[]) {
  await wait(formsServer.latency.action)
  return {
    registered: rows.filter((r) => processedRows.has(r.row)),
    notRegistered: rows.filter((r) => !processedRows.has(r.row)),
  }
}
