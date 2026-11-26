"use client"

import * as React from "react"

// Flow Design Import Mapping（Patterns / Forms & Workflows / Import & Export）
// 取り込むファイルの列と、登録先の項目の対応付け（Column Mapping）。定義は docs/web/patterns/import-and-export.md を参照。
// ファイルの解析（CSV、Excel）は行わない。製品が解析した見出しと値を渡す。
//
// - 列は安定した識別子（key）で持つ。同じ見出しの列が複数あっても区別する（見出しの文字では照合しない）。
// - 自動の対応付けは、見出しが項目の名前、ID、既知の別名と一致する場合だけ行う（全角・半角、大文字・小文字、空白、記号を無視）。
//   1 つの列が複数の項目に一致する場合と、複数の列が 1 つの項目に一致する場合は、曖昧として対応付けない。
// - 対応付けの問題：必須の項目の不足、1 つの項目への複数の列の対応付け（不正な重複）。
// - ファイル（sourceKey）が変わったら、前のファイルの対応付けを捨てて、自動の対応付けからやり直す。

export type ImportColumn = {
  /** 列の安定した識別子（`col-0` など）。見出しではない */
  key: string
  /** 元のファイルの列の位置（0 から） */
  index: number
  /** 元のファイルの見出し */
  header: string
  /** 値の例（先頭の数行）。ファイル全体の検証の結果ではない */
  samples: string[]
}

export type ImportField = {
  id: string
  label: string
  required?: boolean
  /** 見出しの別名（「TEL」「電話」など） */
  aliases?: string[]
}

/** 列の key から、登録先の項目の id。null は取り込まない */
export type ColumnMapping = Record<string, string | null>

export type MappingIssues = {
  /** 対応付けていない必須の項目 */
  missingRequired: ImportField[]
  /** 複数の列を対応付けた項目 */
  duplicates: { field: ImportField; columns: string[] }[]
}

/** 見出しと値の行から列を作る。key は列の位置から作る */
export function createImportColumns(headers: readonly string[], rows: readonly (readonly string[])[], sampleSize = 3): ImportColumn[] {
  return headers.map((header, index) => ({
    key: `col-${index}`,
    index,
    header,
    samples: rows
      .slice(0, sampleSize)
      .map((r) => r[index] ?? "")
      .filter((v) => v !== ""),
  }))
}

export function normalizeHeader(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s_\-・／/()（）[\]［］:：]/g, "")
}

/** 自動の対応付け。曖昧な列（ambiguous）は対応付けず、利用者に選ばせる */
export function autoMapColumns(columns: readonly ImportColumn[], fields: readonly ImportField[]) {
  const names = (f: ImportField) => [f.id, f.label, ...(f.aliases ?? [])].map(normalizeHeader)
  const candidates = new Map(columns.map((c) => [c.key, fields.filter((f) => names(f).includes(normalizeHeader(c.header)))]))
  const mapping: ColumnMapping = {}
  const ambiguous: string[] = []
  for (const c of columns) {
    const list = candidates.get(c.key) ?? []
    const field = list[0]
    const sameField = field ? columns.filter((o) => (candidates.get(o.key) ?? []).some((f) => f.id === field.id)) : []
    if (list.length === 1 && sameField.length === 1) mapping[c.key] = field.id
    else {
      mapping[c.key] = null
      if (list.length > 0) ambiguous.push(c.key)
    }
  }
  return { mapping, ambiguous }
}

export function getMappingIssues(mapping: ColumnMapping, fields: readonly ImportField[]): MappingIssues {
  const used = new Map<string, string[]>()
  for (const [col, field] of Object.entries(mapping)) if (field) used.set(field, [...(used.get(field) ?? []), col])
  return {
    missingRequired: fields.filter((f) => f.required && !used.has(f.id)),
    duplicates: fields.filter((f) => (used.get(f.id)?.length ?? 0) > 1).map((f) => ({ field: f, columns: used.get(f.id)! })),
  }
}

/**
 * 対応付けを、列と登録先の項目と照合する。存在しない列の対応付けは捨て、対象外の項目 ID は「取り込まない」にする。
 * 製品が保存した対応付け（前回の取り込みの設定など）を使う場合に、そのまま信用しない。
 */
export function sanitizeMapping(mapping: ColumnMapping, columns: readonly ImportColumn[], fields: readonly ImportField[]) {
  const columnKeys = new Set(columns.map((c) => c.key))
  const fieldIds = new Set(fields.map((f) => f.id))
  const clean: ColumnMapping = {}
  const unknownColumns: string[] = []
  const unknownFields: string[] = []
  for (const [key, field] of Object.entries(mapping)) {
    if (!columnKeys.has(key)) {
      unknownColumns.push(key)
      continue
    }
    if (field !== null && !fieldIds.has(field)) {
      unknownFields.push(field)
      clean[key] = null
      continue
    }
    clean[key] = field
  }
  for (const c of columns) if (!(c.key in clean)) clean[c.key] = null
  return { mapping: clean, unknownColumns, unknownFields }
}

/**
 * 対応付けの状態。次のどれかが変わったら、自動の対応付けからやり直す（前の対応付けを使わない）。
 * - sourceKey（ファイルの識別子）
 * - 列の構成（同じファイルの識別子のまま、列の key と見出しが変わった）
 * - 登録先の項目の構成（項目の ID、必須）
 * key は、この対応付けの状態を表す。検証の結果などは key と組で持ち、key が変わったら古い結果を使わない。
 * initialMapping（保存した対応付け）は sanitizeMapping で照合してから使う。
 */
export function useColumnMapping({
  sourceKey,
  columns,
  fields,
  initialMapping,
}: {
  sourceKey: string | null
  columns: readonly ImportColumn[]
  fields: readonly ImportField[]
  initialMapping?: ColumnMapping
}) {
  const auto = React.useMemo(() => autoMapColumns(columns, fields), [columns, fields])
  const shape = `${sourceKey ?? ""}|${JSON.stringify(columns.map((c) => [c.key, c.header]))}|${JSON.stringify(fields.map((f) => [f.id, Boolean(f.required)]))}`
  const start = () => {
    if (!initialMapping) return { mapping: auto.mapping, rejected: { unknownColumns: [] as string[], unknownFields: [] as string[] } }
    const r = sanitizeMapping(initialMapping, columns, fields)
    return { mapping: r.mapping, rejected: { unknownColumns: r.unknownColumns, unknownFields: r.unknownFields } }
  }
  type MappingState = { shape: string; mapping: ColumnMapping; touched: ReadonlySet<string>; rejected: { unknownColumns: string[]; unknownFields: string[] } }
  const [state, setState] = React.useState<MappingState>(() => ({ shape, touched: new Set(), ...start() }))
  // ファイル、列、項目の構成が変わったら、前の対応付けを使わない（描画の中で同期する）
  let current = state
  if (state.shape !== shape) {
    current = { shape, touched: new Set(), ...start() }
    setState(current)
  }
  const issues = getMappingIssues(current.mapping, fields)
  const unresolved = initialMapping ? [] : auto.ambiguous.filter((k) => !current.touched.has(k))
  const columnKeys = new Set(columns.map((c) => c.key))
  const fieldIds = new Set(fields.map((f) => f.id))
  return {
    mapping: current.mapping,
    /** この対応付けの状態を表すキー（構成と対応付け）。検証の結果と組で持つ */
    key: `${shape}|${JSON.stringify(current.mapping)}`,
    issues,
    /** 保存した対応付けのうち、使わなかった列と項目 */
    rejected: current.rejected,
    /** 曖昧で、まだ利用者が選んでいない列 */
    ambiguous: unresolved,
    /** 自動で対応付けた列（利用者が変えていない） */
    isAuto: (key: string) => !current.touched.has(key) && current.mapping[key] !== null && auto.mapping[key] === current.mapping[key],
    /** 必須の項目がそろい、重複がなく、曖昧な列が残っていない */
    isComplete: sourceKey !== null && issues.missingRequired.length === 0 && issues.duplicates.length === 0 && unresolved.length === 0,
    /** 列の対応付けを変える。存在しない列と、対象外の項目 ID は受け付けない（false を返す） */
    setColumn: (key: string, fieldId: string | null) => {
      if (!columnKeys.has(key) || (fieldId !== null && !fieldIds.has(fieldId))) return false
      setState((s) => (s.shape !== shape ? s : { ...s, mapping: { ...s.mapping, [key]: fieldId }, touched: new Set([...s.touched, key]) }))
      return true
    },
    resetToAuto: () => setState({ shape, mapping: auto.mapping, touched: new Set(), rejected: { unknownColumns: [], unknownFields: [] } }),
  }
}

// ---------------------------------------------------------------- 処理の結果
export type ImportResult = {
  created: number
  updated: number
  skipped: number
  failed: number
  /** 結果を確かめられなかった件数（通信の切断、結果の不足や矛盾） */
  unknown: number
  /** 処理の対象の件数（実行の前に「処理の対象」として示した件数。登録しない重複を含み、エラーの行を含まない） */
  total: number
}

const countKeys = ["created", "updated", "skipped", "failed", "unknown", "total"] as const
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0

/** 結果の種類。件数が負の数、小数、NaN、Infinity の場合と、合計が処理の対象と一致しない場合は、結果が不明として扱う */
export function importOutcome(r: ImportResult): "success" | "partial" | "failed" | "unknown" {
  if (!countKeys.every((k) => isCount(r[k]))) return "unknown"
  const accounted = r.created + r.updated + r.skipped + r.failed + r.unknown
  if (r.unknown > 0 || accounted !== r.total) return "unknown"
  if (r.failed === 0) return "success"
  return r.created + r.updated > 0 ? "partial" : "failed"
}

export type ImportRowOutcome = "created" | "updated" | "skipped" | "failed" | "unknown"
export type ImportRowResult = { row: number; outcome: ImportRowOutcome; reason?: string }

export type ImportIntegrity = {
  /** 件数の形式が正しくない項目（負の数、小数、NaN、Infinity、数ではない） */
  invalidCounts: string[]
  /** 件数の合計が、処理の対象の件数と一致しない */
  totalMismatch: boolean
  /** 行ごとの結果で、結果が返らなかった行 */
  missingRows: number[]
  /** 同じ行の結果が重なった行（異なる結果が重なった行は、結果が不明として扱う） */
  duplicateRows: number[]
  /** 処理の対象ではない行の結果（件数に含めない） */
  unexpectedRows: number[]
  /** 行ごとの結果から数えた件数と、サーバーが返した件数が一致しない */
  countsDisagree: boolean
  /** 結果が対象と一致し、矛盾がない */
  complete: boolean
}

const rowOutcomes = new Set<ImportRowOutcome>(["created", "updated", "skipped", "failed", "unknown"])

/**
 * 取り込みの結果を、処理の対象と照合する（Data Browsing の reconcileBulkResults と同じ考え方）。結果が足りない場合に、成功として扱わない。
 * - 件数だけの結果：負の数、小数、NaN、Infinity を 0 とみなして記録し、合計が処理の対象と一致しなければ、足りない分を結果が不明にする。
 * - 行ごとの結果（rows）：対象の行ごとに結果を 1 つずつ求める。返らなかった行は結果が不明。同じ行の重なりは 1 つとして数え、
 *   異なる結果が重なった行は結果が不明。対象ではない行の結果は件数に含めない。行ごとの結果から件数を数える（サーバーの件数より優先する）。
 * target.rows には、処理の対象の行番号（元のファイルの行番号）を渡す。行ごとの結果がない API では省略する。
 */
export function reconcileImportResult(target: { total: number; rows?: readonly number[] }, response: unknown) {
  const raw = (response && typeof response === "object" ? response : {}) as Record<string, unknown>
  const invalidCounts: string[] = []
  const count = (k: (typeof countKeys)[number]) => {
    const v = raw[k] ?? (k === "unknown" ? 0 : undefined)
    if (isCount(v)) return v
    invalidCounts.push(k)
    return 0
  }
  let rowResults: ImportRowResult[] | null = null
  const missingRows: number[] = []
  const duplicateRows: number[] = []
  const unexpectedRows: number[] = []
  let countsDisagree = false
  let result: ImportResult
  if (Array.isArray(raw.rows) && target.rows) {
    const allowed = new Set(target.rows)
    const byRow = new Map<number, ImportRowResult>()
    for (const v of raw.rows as unknown[]) {
      const item = v as Partial<ImportRowResult>
      if (!item || typeof item.row !== "number" || !rowOutcomes.has(item.outcome as ImportRowOutcome)) continue
      if (!allowed.has(item.row)) {
        unexpectedRows.push(item.row)
        continue
      }
      const seen = byRow.get(item.row)
      if (seen) {
        duplicateRows.push(item.row)
        if (seen.outcome !== item.outcome) byRow.set(item.row, { row: item.row, outcome: "unknown", reason: "同じ行について異なる結果を受け取りました" })
        continue
      }
      byRow.set(item.row, { row: item.row, outcome: item.outcome as ImportRowOutcome, ...(typeof item.reason === "string" && { reason: item.reason }) })
    }
    for (const row of target.rows) {
      if (!byRow.has(row)) {
        missingRows.push(row)
        byRow.set(row, { row, outcome: "unknown", reason: "結果が返されませんでした" })
      }
    }
    rowResults = target.rows.map((r) => byRow.get(r)!)
    const n = (o: ImportRowOutcome) => rowResults!.filter((r) => r.outcome === o).length
    result = { created: n("created"), updated: n("updated"), skipped: n("skipped"), failed: n("failed"), unknown: n("unknown"), total: target.rows.length }
    // サーバーの件数があれば、行ごとの結果と比べる（一致しなくても、行ごとの結果を使う）
    if (countKeys.some((k) => k !== "total" && raw[k] !== undefined)) {
      countsDisagree = (["created", "updated", "skipped", "failed"] as const).some((k) => raw[k] !== result[k])
    }
  } else {
    result = { created: count("created"), updated: count("updated"), skipped: count("skipped"), failed: count("failed"), unknown: count("unknown"), total: target.total }
    const accounted = result.created + result.updated + result.skipped + result.failed + result.unknown
    // 足りない件数は結果が不明。多すぎる件数は矛盾として記録し、結果が不明として扱う
    if (accounted < target.total) result.unknown += target.total - accounted
  }
  const accounted = result.created + result.updated + result.skipped + result.failed + result.unknown
  const totalMismatch = accounted !== target.total
  const integrity: ImportIntegrity = {
    invalidCounts,
    totalMismatch,
    missingRows,
    duplicateRows,
    unexpectedRows,
    countsDisagree,
    complete: invalidCounts.length === 0 && !totalMismatch && missingRows.length === 0 && duplicateRows.length === 0 && unexpectedRows.length === 0 && !countsDisagree,
  }
  return { result, rows: rowResults, integrity }
}
