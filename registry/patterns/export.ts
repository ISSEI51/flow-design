// Flow Design Export（Patterns / Forms & Workflows / Import & Export）
// エクスポートの対象の範囲、ファイル名、CSV のセルの値の扱い。定義は docs/web/patterns/import-and-export.md を参照。
// ファイルの生成（CSV の全体、XLSX）、権限の確認、出力の処理は製品の責務である。

/** selected：選んだ行。page：表示中のページ。results：検索結果のすべて。all：すべてのデータ */
export type ExportScope = "selected" | "page" | "results" | "all"

/** 操作を始めた場所。一括操作のバーは選んだ行、表の右上は検索結果のすべて、設定の画面はすべてのデータ */
export type ExportOrigin = "selection-bar" | "table" | "settings"

export function defaultExportScope(origin: ExportOrigin, { selectedCount = 0 }: { selectedCount?: number } = {}): ExportScope {
  if (origin === "selection-bar") return selectedCount > 0 ? "selected" : "results"
  if (origin === "settings") return "all"
  return "results"
}

const scopeNames: Record<ExportScope, string> = {
  selected: "選んだ行",
  page: "表示中のページ",
  results: "検索結果のすべて",
  all: "すべてのデータ",
}

/**
 * 範囲の名前と件数。件数がわからない場合（null）は件数を示さない（架空の件数を出さない）。
 * 例：「検索結果のすべて（580件）」「すべてのデータ」
 */
export function exportScopeLabel(scope: ExportScope, count: number | null | undefined) {
  return typeof count === "number" ? `${scopeNames[scope]}（${count.toLocaleString("ja-JP")}件）` : scopeNames[scope]
}

/**
 * ファイル名。データの種類、範囲、出力の日時がわかるようにする。ファイル名に使えない文字は「_」にする。
 * 例：「顧客_検索結果_20261126-1530.csv」
 */
export function exportFileName({ kind, scope, date, extension }: { kind: string; scope?: string; date: Date; extension: string }) {
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_")
  return `${[kind, scope].filter(Boolean).map((s) => safe(s!)).join("_")}_${stamp}.${extension.replace(/^\./, "")}`
}

/**
 * CSV の 1 つのセルの値。
 * - 表計算ソフトが数式として実行しないよう、=、+、-、@、タブ、改行で始まる文字列の先頭に「'」を付ける（CSV Injection の対策）。
 *   数値の型の値（負の数を含む）には付けない。
 *   値が変わるため、データの移行やバックアップの形式では、製品が方針を決める。
 * - 区切り文字、引用符、改行を含む値は、引用符で囲む。
 * 電話番号や郵便番号の先頭の 0 は、CSV では保てない場合がある（表計算ソフトが数値に変える）。必要なら XLSX で文字列の型を指定する。
 */
export function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return ""
  if (typeof value === "number" || typeof value === "bigint") return String(value)
  let text = value instanceof Date ? value.toISOString() : String(value)
  if (/^[=+\-@\t\r\n]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
