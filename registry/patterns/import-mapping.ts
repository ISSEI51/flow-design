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
 * 対応付けの状態。sourceKey（ファイルの識別子）が変わったら、自動の対応付けからやり直す。
 * confirmed は、利用者が曖昧な列を含めて対応付けを確かめた印。対応付けを変えると解除する。
 */
export function useColumnMapping({
  sourceKey,
  columns,
  fields,
}: {
  sourceKey: string | null
  columns: readonly ImportColumn[]
  fields: readonly ImportField[]
}) {
  const auto = React.useMemo(() => autoMapColumns(columns, fields), [columns, fields])
  const [state, setState] = React.useState<{ sourceKey: string | null; mapping: ColumnMapping; touched: ReadonlySet<string> }>(() => ({
    sourceKey,
    mapping: auto.mapping,
    touched: new Set(),
  }))
  // ファイルが変わったら、前のファイルの対応付けを使わない（描画の中で同期する）
  let current = state
  if (state.sourceKey !== sourceKey) {
    current = { sourceKey, mapping: auto.mapping, touched: new Set() }
    setState(current)
  }
  const issues = getMappingIssues(current.mapping, fields)
  const unresolved = auto.ambiguous.filter((k) => !current.touched.has(k))
  return {
    mapping: current.mapping,
    issues,
    /** 曖昧で、まだ利用者が選んでいない列 */
    ambiguous: unresolved,
    /** 自動で対応付けた列（利用者が変えていない） */
    isAuto: (key: string) => !current.touched.has(key) && current.mapping[key] !== null && auto.mapping[key] === current.mapping[key],
    /** 必須の項目がそろい、重複がなく、曖昧な列が残っていない */
    isComplete: issues.missingRequired.length === 0 && issues.duplicates.length === 0 && unresolved.length === 0,
    setColumn: (key: string, fieldId: string | null) =>
      setState((s) => ({ ...s, mapping: { ...s.mapping, [key]: fieldId }, touched: new Set([...s.touched, key]) })),
    resetToAuto: () => setState({ sourceKey, mapping: auto.mapping, touched: new Set() }),
  }
}

// ---------------------------------------------------------------- 処理の結果
export type ImportResult = {
  created: number
  updated: number
  skipped: number
  failed: number
  /** 結果を確かめられなかった件数（通信の切断など） */
  unknown: number
  /** 処理の対象の件数（実行の前に「処理の対象」として示した件数。登録しない重複を含み、エラーの行を含まない） */
  total: number
}

/** 結果の種類。件数の合計が処理の対象と一致しない場合は、結果が不明として扱う */
export function importOutcome(r: ImportResult): "success" | "partial" | "failed" | "unknown" {
  const accounted = r.created + r.updated + r.skipped + r.failed + r.unknown
  if (r.unknown > 0 || accounted !== r.total) return "unknown"
  if (r.failed === 0) return "success"
  return r.created + r.updated > 0 ? "partial" : "failed"
}

