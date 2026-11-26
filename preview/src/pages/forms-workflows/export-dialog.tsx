import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { defaultExportScope, escapeCsvCell, exportFileName, exportScopeLabel, type ExportOrigin, type ExportScope } from "@/patterns/export"

import { downloadText } from "./import-wizard"

// エクスポートの設定（製品側のコードの例）。
// - 対象の範囲は、操作を始めた場所で初期値を決める（一括操作のバーは選んだ行、表の右上は検索結果のすべて）。
// - 件数がわからない範囲は、件数を示さない。
// - 出力する列の初期値は、表に表示している列。権限のない列は選択肢に出さない（最終的な確認はサーバーが行う）。
// - CSV は UTF-8。Excel で開く場合は BOM を付ける。

export type ExportColumn = { id: string; label: string; visible: boolean }

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

  const run = async () => {
    if (pending || chosen.length === 0) return
    setPending(true)
    setError(null)
    try {
      const rows = await getRows(scope)
      const lines = [chosen.map((c) => escapeCsvCell(c.label)).join(","), ...rows.map((r) => chosen.map((c) => escapeCsvCell(r[c.id])).join(","))]
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
  const scopeItems = scopes.map((s) => ({ value: s, label: exportScopeLabel(s, counts[s] ?? null) }))

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
          <Button loading={pending} disabled={chosen.length === 0} onClick={() => void run()} data-testid="export-run">
            ダウンロード
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
