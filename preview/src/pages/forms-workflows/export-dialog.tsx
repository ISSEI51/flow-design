import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmActionDialog } from "@/patterns/confirm-action"
import { defaultExportScope, escapeCsvCell, exportFileName, exportScopeLabel, type ExportOrigin, type ExportScope } from "@/patterns/export"

import { downloadText } from "./import-wizard"

// エクスポートの設定（製品側のコードの例）。
// - 対象の範囲は、操作を始めた場所で初期値を決める（一括操作のバーは選んだ行、表の右上は検索結果のすべて）。
// - 件数がわからない範囲は、件数を示さない。
// - 出力する列の初期値は、表に表示している列。権限のない列は選択肢に出さない（最終的な確認はサーバーが行う）。
// - CSV は UTF-8。Excel で開く場合は BOM を付ける。
// - 「選んだ行」を選んでいる間に選択がなくなった場合は、出力できないことを示す（検索結果のすべてに暗黙に広げない）。
// - 個人情報の列（sensitive）を含む場合は、ダウンロードの前に ConfirmActionDialog で確かめる。

/** sensitive：個人情報など、出力の前に確かめる列 */
export type ExportColumn = { id: string; label: string; visible: boolean; sensitive?: boolean }

export function ExportDialog({
  open,
  onOpenChange,
  origin,
  counts,
  columns,
  kind,
  getRows,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  origin: ExportOrigin
  /** 件数。null は件数がわからない。page を undefined にすると「表示中のページ」を選択肢にしない */
  counts: { selected: number | null; page?: number | null; results: number | null; all: number | null }
  /** 権限のある列だけを渡す */
  columns: ExportColumn[]
  kind: string
  getRows: (scope: ExportScope) => Promise<Record<string, unknown>[]>
}) {
  // 選んだ行がない場合は「選んだ行」を、ページに分けていない一覧（page が undefined）では「表示中のページ」を、選択肢にしない
  const scopes = (["selected", "page", "results", "all"] as ExportScope[]).filter(
    (s) => (s !== "selected" || (counts.selected ?? 0) > 0) && (s !== "page" || counts.page !== undefined)
  )
  const [scope, setScope] = useState<ExportScope>(() => defaultExportScope(origin, { selectedCount: counts.selected ?? 0 }))
  const [selected, setSelected] = useState(() => new Set(columns.filter((c) => c.visible).map((c) => c.id)))
  const [format, setFormat] = useState<"utf8" | "excel">("excel")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 開くたびに、始めた場所に合わせた初期値に戻す
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setScope(defaultExportScope(origin, { selectedCount: counts.selected ?? 0 }))
      setSelected(new Set(columns.filter((c) => c.visible).map((c) => c.id)))
      setError(null)
    }
  }

  const scopeName = { selected: "選択", page: "表示中のページ", results: "検索結果", all: "すべて" }[scope]
  const fileName = exportFileName({ kind, scope: scopeName, date: new Date(), extension: "csv" })
  const chosen = columns.filter((c) => selected.has(c.id))
  const sensitive = chosen.filter((c) => c.sensitive)
  const noSelection = scope === "selected" && (counts.selected ?? 0) === 0
  const [confirmSensitive, setConfirmSensitive] = useState(false)

  const request = () => {
    if (pending || chosen.length === 0 || noSelection) return
    if (sensitive.length) setConfirmSensitive(true)
    else void run()
  }

  const run = async () => {
    if (pending || chosen.length === 0 || noSelection) return
    setPending(true)
    setError(null)
    try {
      const rows = await getRows(scope)
      // 表計算ソフトで開く形式は、式として解釈される値に ' を付ける（spreadsheet）。
      // ほかのシステムへの取り込みの形式は、値を変えない（raw）。取り込む側が値を式として扱わないことを前提にする
      const mode = format === "excel" ? "spreadsheet" : "raw"
      const cell = (v: unknown) => escapeCsvCell(v, { mode })
      const lines = [chosen.map((c) => cell(c.label)).join(","), ...rows.map((r) => chosen.map((c) => cell(r[c.id])).join(","))]
      downloadText(fileName, lines.join("\r\n"), { bom: format === "excel" })
      onOpenChange(false)
    } catch {
      setError("データを取得できませんでした。時間をおいて、もう一度ダウンロードしてください。")
    } finally {
      setPending(false)
    }
  }

  const formats = [
    { value: "excel", label: "CSV（Excel で開く。BOM 付きの UTF-8）" },
    { value: "utf8", label: "CSV（UTF-8。ほかのシステムへの取り込み）" },
  ]
  // 「選んだ行」を選んでいる間は、選択がなくなっても選択肢から外さない（ほかの範囲に変わったように見せない）
  const shownScopes = scope === "selected" && !scopes.includes("selected") ? (["selected", ...scopes] as ExportScope[]) : scopes
  const scopeItems = shownScopes.map((s) => ({ value: s, label: exportScopeLabel(s, counts[s] ?? null) }))

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="lg" data-testid="export-dialog">
        <DialogHeader>
          <DialogTitle>{kind}をエクスポート</DialogTitle>
          <DialogDescription>ファイル名：{fileName}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <FieldGroup className="gap-6">
            <Field>
              <FieldLabel>対象</FieldLabel>
              <Select items={scopeItems} value={scope} onValueChange={(v) => setScope(v as ExportScope)}>
                <SelectTrigger data-testid="export-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopeItems.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
            <FieldSet>
              <FieldLegend variant="label">出力する列</FieldLegend>
              <p className="text-ui text-muted-foreground">表に表示している列を選んでいます。権限のある列だけを選べます</p>
              <div className="grid gap-x-4 sm:grid-cols-2" data-testid="export-columns">
                {columns.map((c) => (
                  <FieldItem key={c.id}>
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={(on) =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (on) next.add(c.id)
                          else next.delete(c.id)
                          return next
                        })
                      }
                    />
                    <FieldLabel>{c.label}</FieldLabel>
                  </FieldItem>
                ))}
              </div>
              {chosen.length === 0 && <p className="text-ui text-destructive">1 つ以上の列を選んでください</p>}
            </FieldSet>
            </Field>
            <Field>
              <FieldLabel>形式</FieldLabel>
              <Select items={formats} value={format} onValueChange={(v) => setFormat(v as "utf8" | "excel")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formats.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Excel で直接開くと、電話番号や郵便番号の先頭の 0 が消えることがあります</FieldDescription>
            </Field>
            {noSelection && (
              <Alert variant="warning" role="alert" data-testid="export-no-selection">
                <AlertDescription>選んだ行がありません。一覧で行を選ぶか、対象を変えてください。</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button loading={pending} disabled={chosen.length === 0 || noSelection} onClick={request} data-testid="export-run">
            ダウンロード
          </Button>
        </DialogFooter>
        <ConfirmActionDialog
          open={confirmSensitive}
          onOpenChange={setConfirmSensitive}
          title={`個人情報を含む${exportScopeLabel(scope, counts[scope] ?? null)}をダウンロードしますか？`}
          description={`${sensitive.map((c) => `「${c.label}」`).join("")}を含みます。ダウンロードしたファイルは、社内の規程に従って管理してください。`}
          confirmLabel="ダウンロード"
          targetKey={JSON.stringify([scope, chosen.map((c) => c.id)])}
          data-testid="export-sensitive-confirm"
          onConfirm={() => run()}
        />
      </DialogContent>
    </Dialog>
  )
}
