import { useEffect, useMemo, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { FileUploadDropzone, FileUploadItem, FileUploadList } from "@/components/ui/file-upload"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormActions } from "@/patterns/form-layout"
import { escapeCsvCell, exportFileName } from "@/patterns/export"
import { createImportColumns, useColumnMapping } from "@/patterns/import-mapping"
import { ColumnMappingList, ImportIssueTable, ImportResultSummary, ImportValidationSummary, importOutcome, type ImportFilter, type ImportResult } from "@/patterns/import-review"
import { useStepFlow, type StepDefinition } from "@/patterns/step-flow"
import { Stepper } from "@/patterns/stepper"
import { useUnsavedChanges } from "@/patterns/unsaved-changes"

import {
  IMPORT_MAX_BYTES,
  importFields,
  parseCsv,
  planCounts,
  checkImportStatus,
  runImport,
  sampleCsv,
  validateRows,
  type DuplicatePolicy,
  type ImportPlanRow,
} from "../../data/forms-workflows/import-data"
import { wait, formsServer } from "../../data/forms-workflows/server"

// CSV の取り込み（Import & Export の例。製品側のコード）。
// 1 ファイルの選択 → 2 項目の対応付け → 3 データの検証 → 4 内容の確認（ここで取り込む）→ 5 処理の結果。
// - ファイルを選んだだけでは送信しない。「ファイルを読み込む」でアップロードと解析を行う。
// - ファイルを変えたら、前のファイルの対応付け、検証の結果、確認を使わない（sourceKey で無効にする）。
// - 対応付けを変えたら、検証をやり直す（検証の結果は、対応付けのキーと組で持つ）。
// - 実行の前に、新規登録、更新、スキップ、除外の件数を示す。エラーの行を黙って除かない。
// - 正確な進捗がわかる場合だけ、進捗率を示す。結果が不明な行があれば、再実行ではなく状態の確認を促す。

type StepId = "file" | "mapping" | "validate" | "confirm" | "result"
const steps: StepDefinition<StepId>[] = [
  { id: "file", label: "ファイルの選択" },
  { id: "mapping", label: "項目の対応付け" },
  { id: "validate", label: "データの検証" },
  { id: "confirm", label: "内容の確認" },
  { id: "result", label: "処理の結果" },
]

type FileState = { file: File; key: string; status: "selected" | "uploading" | "uploaded" | "processing" | "done" | "error"; progress: number | null; error?: string }

export function downloadText(name: string, text: string, { bom = false }: { bom?: boolean } = {}) {
  // Excel で開く CSV は、文字化けを防ぐため BOM 付きの UTF-8 にする
  const blob = new Blob([bom ? "﻿" : "", text], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

let fileSeq = 0

export function ImportWizard({ idPrefix, onFinished }: { idPrefix: string; onFinished?: () => void }) {
  const [file, setFile] = useState<FileState | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)
  const [parsed, setParsed] = useState<{ key: string; headers: string[]; rows: string[][] } | null>(null)
  const sourceKey = parsed && file && parsed.key === file.key ? parsed.key : null
  const columns = useMemo(() => (sourceKey && parsed ? createImportColumns(parsed.headers, parsed.rows) : []), [sourceKey, parsed])
  const mapping = useColumnMapping({ sourceKey, columns, fields: importFields })
  const mappingKey = `${sourceKey}:${JSON.stringify(mapping.mapping)}`
  const [validation, setValidation] = useState<{ key: string; plan: ImportPlanRow[]; issues: Awaited<ReturnType<typeof validateRows>>["issues"] } | null>(null)
  const [validating, setValidating] = useState(false)
  const validationCurrent = validation?.key === mappingKey ? validation : null
  const [filter, setFilter] = useState<ImportFilter>("all")
  const [policy, setPolicy] = useState<DuplicatePolicy>("skip")
  const [clearBlanks, setClearBlanks] = useState(false)
  const [allOrNothing, setAllOrNothing] = useState(false)
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null)
  // unknownRows：結果を受け取れなかった行。行の位置から推測せず、実行ごとに記録する
  const [outcome, setOutcome] = useState<{
    result: ImportResult
    failedRows: { row: number; reason: string }[]
    unknownRows: ImportPlanRow[]
    targets: ImportPlanRow[]
  } | null>(null)
  const [retrying, setRetrying] = useState(false)
  const validateController = useRef<AbortController | null>(null)

  const counts = validationCurrent ? planCounts(validationCurrent.plan, policy) : null
  const targets = validationCurrent ? validationCurrent.plan.filter((p) => p.state !== "error") : []
  const blockedByErrors = allOrNothing && (counts?.error ?? 0) > 0

  const isComplete = (id: StepId) => {
    switch (id) {
      case "file":
        return sourceKey !== null && (parsed?.rows.length ?? 0) > 0
      case "mapping":
        return sourceKey !== null && mapping.isComplete
      case "validate":
        return validationCurrent !== null
      case "confirm":
        return outcome !== null
      case "result":
        return false
    }
  }
  const flow = useStepFlow<StepId>({ steps, isComplete })
  const current = flow.current ?? "file"
  const finished = outcome !== null
  // 処理が終わった後に次のステップへ進む。完了の判定は、結果を反映した後の描画で行う
  const advance = useRef<StepId | null>(null)
  useEffect(() => {
    if (advance.current && advance.current === current && isComplete(current)) {
      advance.current = null
      flow.next()
    }
  })

  useUnsavedChanges({ dirty: file !== null && !finished, saving: running !== null, label: "CSV の取り込み" })

  // ---------------------------------------------------------------- 1 ファイル
  const choose = (f: File) => {
    setRejection(null)
    // 新しいファイル：前のファイルの解析、対応付け、検証は、キーが変わるため使われない
    setFile({ file: f, key: `${f.name}:${f.size}:${f.lastModified}:${++fileSeq}`, status: "selected", progress: null })
    setValidation(null)
  }
  const load = async () => {
    if (!file || file.status === "uploading" || file.status === "processing") return
    const key = file.key
    const set = (patch: Partial<FileState>) => setFile((cur) => (cur && cur.key === key ? { ...cur, ...patch } : cur))
    // アップロード（模擬。実際の進捗を報告する）→ 解析 → 完了
    for (const p of [0, 35, 70, 100]) {
      set({ status: "uploading", progress: p })
      await wait(formsServer.latency.import / 6)
    }
    set({ status: "processing", progress: null })
    const text = await file.file.text()
    await wait(formsServer.latency.import / 3)
    const result = parseCsv(text)
    if (!result.headers.length || !result.rows.length) {
      set({ status: "error", error: "データの行が見つかりませんでした。1 行目に見出し、2 行目からデータがあるファイルを選んでください" })
      return
    }
    setParsed({ key, ...result })
    set({ status: "done" })
    advance.current = "file"
  }

  // ---------------------------------------------------------------- 3 検証
  const validate = async () => {
    if (!sourceKey || !parsed) return
    validateController.current?.abort()
    const controller = new AbortController()
    validateController.current = controller
    const key = mappingKey
    setValidating(true)
    try {
      const r = await validateRows(parsed.rows, mapping.mapping, controller.signal)
      if (controller.signal.aborted) return
      setValidation({ key, ...r })
      setFilter(r.issues.some((i) => i.state === "error") ? "error" : "all")
      setValidating(false)
    } catch {
      if (!controller.signal.aborted) setValidating(false)
    }
  }

  // ---------------------------------------------------------------- 4 実行
  const run = async (rows: ImportPlanRow[]) => {
    setRunning({ done: 0, total: rows.length })
    const r = await runImport(rows, { policy, clearBlanks, onProgress: (done) => setRunning({ done, total: rows.length }) })
    setRunning(null)
    return r
  }
  const start = async () => {
    if (running || finished || blockedByErrors || !validationCurrent) return
    const r = await run(targets)
    setOutcome({ ...r, targets })
    advance.current = "confirm"
  }
  const retryFailed = async () => {
    if (!outcome || retrying) return
    setRetrying(true)
    // 失敗した行だけを再処理する。成功した行は対象にしない
    const failed = new Set(outcome.failedRows.map((f) => f.row))
    const rows = outcome.targets.filter((t) => failed.has(t.row))
    const r = await run(rows)
    setRetrying(false)
    setOutcome({
      targets: outcome.targets,
      failedRows: r.failedRows,
      unknownRows: [...outcome.unknownRows, ...r.unknownRows],
      result: {
        created: outcome.result.created + r.result.created,
        updated: outcome.result.updated + r.result.updated,
        skipped: outcome.result.skipped + r.result.skipped,
        failed: r.result.failed,
        unknown: outcome.result.unknown + r.result.unknown,
        total: outcome.result.total,
      },
    })
  }

  // 結果が不明な行の状態をサーバーに確かめる。登録されていなかった行は失敗として扱い、再処理できるようにする
  const [checkingStatus, setCheckingStatus] = useState(false)
  const checkStatus = async () => {
    if (!outcome || checkingStatus) return
    setCheckingStatus(true)
    const notRegistered = await checkImportStatus(outcome.unknownRows)
    setCheckingStatus(false)
    setOutcome({
      ...outcome,
      failedRows: [...outcome.failedRows, ...notRegistered.map((r) => ({ row: r.row, reason: "通信が切れたため、登録されていませんでした" }))],
      unknownRows: outcome.unknownRows.filter((u) => !notRegistered.some((n) => n.row === u.row)),
      result: { ...outcome.result, failed: outcome.result.failed + notRegistered.length, unknown: outcome.result.unknown - notRegistered.length },
    })
  }

  const restart = () => {
    setFile(null)
    setParsed(null)
    setValidation(null)
    setOutcome(null)
    setPolicy("skip")
    setClearBlanks(false)
    setAllOrNothing(false)
    flow.restore({})
  }

  const downloadIssues = () => {
    if (!validationCurrent) return
    const lines = ["行,状態,項目,原因,直し方", ...validationCurrent.issues.map((i) => [i.row, i.state === "error" ? "エラー" : "確認が必要", i.field, i.message, i.fix ?? ""].map(escapeCsvCell).join(","))]
    downloadText(exportFileName({ kind: "取り込みの確認", scope: "エラーと要確認", date: new Date(), extension: "csv" }), lines.join("\r\n"), { bom: true })
  }
  const downloadFailed = () => {
    if (!outcome) return
    const lines = ["行,原因", ...outcome.failedRows.map((f) => [f.row, f.reason].map(escapeCsvCell).join(","))]
    downloadText(exportFileName({ kind: "取り込みの失敗", date: new Date(), extension: "csv" }), lines.join("\r\n"), { bom: true })
  }

  const visibleIssues = validationCurrent ? validationCurrent.issues.filter((i) => filter === "all" || i.state === filter) : []
  const PREVIEW = 20
  const fmt = (n: number) => n.toLocaleString("ja-JP")

  return (
    <div className="flex min-w-0 flex-col gap-8" data-testid={idPrefix} data-step={current}>
      <Stepper
        items={flow.items}
        total={flow.total}
        onSelect={running || finished ? undefined : (id) => flow.goTo(id)}
        aria-label="取り込みの手順"
        data-testid={`${idPrefix}-stepper`}
      />
      <h2 ref={flow.headingRef} className="text-section outline-none" data-testid={`${idPrefix}-heading`}>
        {steps.find((s) => s.id === current)?.label}
      </h2>

      {current === "file" && (
        <div className="flex flex-col gap-6">
          <FileUploadDropzone
            accept=".csv,text/csv"
            maxSize={IMPORT_MAX_BYTES}
            title="CSV ファイルをドロップ"
            description="CSV（UTF-8、BOM 付きも可）、5 MB まで。1 行目に見出しを置きます"
            onFilesSelected={({ accepted, rejected }) => {
              if (accepted[0]) choose(accepted[0])
              else if (rejected[0]) setRejection(rejected[0].errors.map((e) => e.message).join("。"))
            }}
            disabled={file?.status === "uploading" || file?.status === "processing"}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => downloadText("顧客の取り込み_テンプレート.csv", `${importFields.map((f) => f.label).join(",")}\r\n`, { bom: true })}
            >
              テンプレートをダウンロード
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid={`${idPrefix}-sample`}
              onClick={() => choose(new File([sampleCsv()], "顧客の一覧_見本.csv", { type: "text/csv", lastModified: Date.now() }))}
            >
              見本のファイルを使う
            </Button>
          </div>
          {rejection && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>このファイルは選べません</AlertTitle>
              <AlertDescription>{rejection}</AlertDescription>
            </Alert>
          )}
          {file && (
            <FileUploadList>
              <FileUploadItem
                name={file.file.name}
                size={file.file.size}
                type={file.file.type}
                status={file.status}
                progress={file.progress}
                error={file.error}
                statusLabel={file.status === "selected" ? "選択済み（まだ読み込んでいません）" : file.status === "done" ? `${fmt(parsed?.rows.length ?? 0)}行を読み込みました` : undefined}
                onRemove={() => {
                  setFile(null)
                  setParsed(null)
                }}
              />
            </FileUploadList>
          )}
        </div>
      )}

      {current === "mapping" && (
        <div className="flex flex-col gap-6">
          <p className="text-ui text-muted-foreground">
            {fmt(columns.length)} 列の見出しを、登録先の項目に対応付けます。値の例は先頭の 3 行で、ファイル全体の検証の結果ではありません。
          </p>
          <ColumnMappingList
            columns={columns}
            fields={importFields}
            mapping={mapping.mapping}
            issues={mapping.issues}
            ambiguous={mapping.ambiguous}
            isAuto={mapping.isAuto}
            onChange={mapping.setColumn}
          />
        </div>
      )}

      {current === "validate" && (
        <div className="flex flex-col gap-6">
          {!validationCurrent ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-ui text-muted-foreground">
                {validation ? "対応付けを変えたため、もう一度検証します。" : `${fmt(parsed?.rows.length ?? 0)} 行のすべてを、登録できるかどうか確かめます。`}
              </p>
              <Button onClick={() => void validate()} loading={validating} data-testid={`${idPrefix}-validate`}>
                データを検証
              </Button>
              {validating && <p role="status" className="text-ui text-muted-foreground">検証しています</p>}
            </div>
          ) : (
            <>
              <ImportValidationSummary
                counts={{
                  valid: validationCurrent.plan.filter((p) => p.state === "valid").length,
                  review: validationCurrent.plan.filter((p) => p.state === "review").length,
                  error: validationCurrent.plan.filter((p) => p.state === "error").length,
                }}
                filter={filter}
                onFilterChange={setFilter}
              />
              {visibleIssues.length > 0 ? (
                <>
                  <ImportIssueTable issues={visibleIssues.slice(0, PREVIEW)} caption="確認が必要な行とエラーの行" />
                  <p className="text-ui text-muted-foreground" data-testid={`${idPrefix}-issue-range`}>
                    {visibleIssues.length > PREVIEW
                      ? `先頭の ${PREVIEW} 件を表示しています（全 ${fmt(visibleIssues.length)} 件）。すべてはファイルでダウンロードできます。`
                      : `${fmt(visibleIssues.length)} 件をすべて表示しています。`}
                  </p>
                  <div>
                    <Button variant="secondary" size="sm" onClick={downloadIssues}>
                      エラーと要確認の行をダウンロード
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-ui text-muted-foreground">確認が必要な行とエラーの行はありません。</p>
              )}
              <FieldGroup>
                <Field>
                  <FieldLabel>登録済みの顧客と顧客コードが同じ行</FieldLabel>
                  <Select
                    items={duplicateOptions}
                    value={policy}
                    onValueChange={(v) => {
                      setPolicy(v as DuplicatePolicy)
                      if (v !== "update") setClearBlanks(false)
                    }}
                  >
                    <SelectTrigger data-testid={`${idPrefix}-policy`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {duplicateOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>既定では、登録済みのデータを変えません。更新と新規の登録は、選んだ場合だけ行います</FieldDescription>
                </Field>
                {policy === "update" && (
                  <Field orientation="horizontal">
                    <Checkbox checked={clearBlanks} onCheckedChange={(c) => setClearBlanks(c)} />
                    <FieldContent>
                      <FieldLabel>空欄の項目で、登録済みの値を消す</FieldLabel>
                      <FieldDescription>選ばない場合、ファイルの空欄は「変更しない」として扱い、登録済みの値を残します</FieldDescription>
                    </FieldContent>
                  </Field>
                )}
                <Field>
                  <FieldLabel>エラーの行がある場合</FieldLabel>
                  <Select items={partialOptions} value={allOrNothing ? "all" : "valid"} onValueChange={(v) => setAllOrNothing(v === "all")}>
                    <SelectTrigger data-testid={`${idPrefix}-partial`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {partialOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>顧客は 1 件ずつ独立しているため、正常な行だけを取り込めます。行どうしが関係するデータでは、すべて正常な場合だけ取り込む方式にします</FieldDescription>
                </Field>
              </FieldGroup>
            </>
          )}
        </div>
      )}

      {current === "confirm" && counts && (
        <div className="flex flex-col gap-6" data-testid={`${idPrefix}-confirm`}>
          <dl className="grid gap-x-6 gap-y-2 text-ui sm:grid-cols-[12rem_1fr]">
            <dt className="text-muted-foreground">ファイル</dt>
            <dd>{file?.file.name}</dd>
            <dt className="text-muted-foreground">新規に登録</dt>
            <dd className="tabular-nums">{fmt(counts.create)}件</dd>
            <dt className="text-muted-foreground">登録済みの顧客を更新</dt>
            <dd className="tabular-nums">
              {fmt(counts.update)}件{policy === "update" && (clearBlanks ? "（空欄の項目は値を消す）" : "（空欄の項目は値を残す）")}
            </dd>
            <dt className="text-muted-foreground">登録しない（重複）</dt>
            <dd className="tabular-nums">{fmt(counts.skip)}件</dd>
            <dt className="text-muted-foreground">取り込まない（エラー）</dt>
            <dd className="tabular-nums">{fmt(counts.error)}件</dd>
            <dt className="text-muted-foreground">処理の対象</dt>
            <dd className="tabular-nums">{fmt(counts.total - counts.error)}件（登録しない重複を含む。結果の件数と同じ）</dd>
          </dl>
          {blockedByErrors && (
            <Alert variant="warning" role="alert">
              <AlertTitle>エラーの行があるため取り込めません</AlertTitle>
              <AlertDescription>「すべての行が正常な場合だけ取り込む」を選んでいます。ファイルを直して選び直すか、データの検証で方式を変えてください。</AlertDescription>
            </Alert>
          )}
          {running && (
            <div className="flex flex-col gap-2" role="status">
              <p className="text-ui">
                取り込んでいます（{fmt(running.done)} / {fmt(running.total)} 行）
              </p>
              <Progress value={running.total ? (running.done / running.total) * 100 : null} aria-label="取り込みの進捗" />
            </div>
          )}
        </div>
      )}

      {current === "result" && outcome && (
        <div className="flex flex-col gap-6" data-testid={`${idPrefix}-result`}>
          <ImportResultSummary
            result={outcome.result}
            retrying={retrying || checkingStatus}
            onRetryFailed={outcome.result.failed > 0 ? () => void retryFailed() : undefined}
            onDownloadFailed={outcome.result.failed > 0 ? downloadFailed : undefined}
            onCheckStatus={() => void checkStatus()}
          />
          {running && (
            <div className="flex flex-col gap-2" role="status">
              <p className="text-ui">
                失敗した行を再処理しています（{fmt(running.done)} / {fmt(running.total)} 行）
              </p>
              <Progress value={running.total ? (running.done / running.total) * 100 : null} aria-label="再処理の進捗" />
            </div>
          )}
          {outcome.failedRows.length > 0 && (
            <ul className="flex flex-col gap-1 text-ui" aria-label="失敗した行">
              {outcome.failedRows.map((f) => (
                <li key={f.row}>
                  {f.row} 行目：{f.reason}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={restart} disabled={running !== null}>
              別のファイルを取り込む
            </Button>
            {onFinished && importOutcome(outcome.result) !== "unknown" && (
              <Button onClick={onFinished} disabled={running !== null}>
                顧客の一覧へ
              </Button>
            )}
          </div>
        </div>
      )}

      {current !== "result" && (
        <FormActions
          notice={
            current === "mapping" ? (
              <>
                <div id={`${idPrefix}-notice`} data-testid={`${idPrefix}-notice`} className="flex flex-col gap-1 text-ui text-muted-foreground">
                  {mapping.issues.missingRequired.length > 0 && (
                    <p>必須の項目{mapping.issues.missingRequired.map((f) => `「${f.label}」`).join("")}に、列を対応付けてください</p>
                  )}
                  {mapping.issues.duplicates.length > 0 && (
                    <p>{mapping.issues.duplicates.map((d) => `「${d.field.label}」`).join("")}に複数の列を対応付けています。1 つにしてください</p>
                  )}
                </div>
                {mapping.ambiguous.length > 0 && (
                  <p className="text-ui text-muted-foreground" data-testid={`${idPrefix}-ambiguous`}>
                    見出しから登録先を決められない列が {mapping.ambiguous.length} つあります。登録先を選ぶか、「取り込まない」を選んでください。
                  </p>
                )}
              </>
            ) : null
          }
        >
          {!flow.isFirst && (
            <Button variant="secondary" disabled={running !== null} onClick={() => flow.back()}>
              戻る
            </Button>
          )}
          {current === "file" &&
            (sourceKey ? (
              <Button onClick={() => flow.next()} data-testid={`${idPrefix}-next`}>
                次へ
              </Button>
            ) : (
              <Button
                onClick={() => void load()}
                disabled={!file || file.status === "error"}
                loading={file?.status === "uploading" || file?.status === "processing"}
                data-testid={`${idPrefix}-load`}
              >
                ファイルを読み込む
              </Button>
            ))}
          {current === "mapping" && (
            <Button
              onClick={() => flow.next()}
              disabled={!flow.canNext}
              focusableWhenDisabled
              aria-describedby={`${idPrefix}-notice`}
              data-testid={`${idPrefix}-next`}
            >
              次へ
            </Button>
          )}
          {current === "validate" && (
            <Button onClick={() => flow.next()} disabled={!flow.canNext || validating} focusableWhenDisabled data-testid={`${idPrefix}-next`}>
              次へ
            </Button>
          )}
          {current === "confirm" && counts && (
            <Button onClick={() => void start()} loading={running !== null} disabled={blockedByErrors || counts.create + counts.update === 0} data-testid={`${idPrefix}-run`}>
              {runLabel(counts)}
            </Button>
          )}
        </FormActions>
      )}
    </div>
  )
}

function runLabel(c: ReturnType<typeof planCounts>) {
  const fmt = (n: number) => n.toLocaleString("ja-JP")
  const excluded = [c.error > 0 && `エラーの ${fmt(c.error)}件`, c.skip > 0 && `重複の ${fmt(c.skip)}件`].filter(Boolean).join("と")
  return `${fmt(c.create + c.update)}件を取り込む${excluded ? `（${excluded}を除く）` : ""}`
}

const duplicateOptions = [
  { value: "skip", label: "登録しない（登録済みのデータを残す）" },
  { value: "update", label: "登録済みの顧客を更新する" },
  { value: "create", label: "新しい顧客として登録する（新しいコードを割り当てる）" },
]
const partialOptions = [
  { value: "valid", label: "正常な行だけを取り込む" },
  { value: "all", label: "すべての行が正常な場合だけ取り込む" },
]
