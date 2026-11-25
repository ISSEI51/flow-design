import { useEffect, useState } from "react"
import { History } from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { FileUploadDropzone, FileUploadItem, FileUploadList, type FileRejection } from "@/components/ui/file-upload"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { Rejections } from "./file-upload-page"
import { useMockUpload } from "./mock-upload"

// CSV で顧客を取り込む業務画面の例。
// ファイルを選ぶ → 内容を確かめる → 取り込みを始める → 送信と処理の状況を確かめる → 結果を確かめる、の順に進む。
// 送信と処理は模擬であり、外部のサーバーには送信しない。

const duplicateOptions = [
  { value: "skip", label: "取り込まない（既存のデータを残す）" },
  { value: "overwrite", label: "上書きする" },
]

type HistoryEntry = { name: string; result: string }

export function CsvImportPage() {
  const upload = useMockUpload({ processingMs: 1200, processingKnown: true })
  const [rejected, setRejected] = useState<FileRejection[]>([])
  const [duplicate, setDuplicate] = useState<string | null>("skip")
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const entry = upload.entries[0]
  const rowsTotal = 2_400
  const rowsDone = entry?.status === "processing" && entry.progress !== null ? Math.round((rowsTotal * entry.progress) / 100) : 0

  useEffect(() => {
    if (entry?.status === "done") setHistory((h) => [{ name: entry.file.name, result: "2,380 件を取り込み、20 件を取り込みませんでした" }, ...h])
  }, [entry?.status, entry?.file.name])

  const restart = () => {
    if (entry) upload.remove(entry.id)
    setRejected([])
  }

  return (
    <article>
      <header className="mb-12">
        <p className="text-caption text-muted-foreground">組み合わせの例</p>
        <h1 className="mt-2 text-page-title">顧客を CSV で取り込む</h1>
        <p className="mt-4 max-w-[40rem] text-body text-muted-foreground">
          1 行目を項目名とし、「会社名」「担当者名」「メールアドレス」の列を含めてください。
        </p>
      </header>

      <section className="flex flex-col gap-6" data-testid="import">
        {!entry && (
          <>
            <FileUploadDropzone
              accept=".csv,text/csv"
              maxSize={10 * 1024 * 1024}
              title="CSV ファイルをここにドロップ"
              onFilesSelected={({ accepted, rejected }) => {
                setRejected(rejected)
                upload.add(accepted.slice(0, 1), true)
              }}
            />
            <Rejections items={rejected} testId="import-rejected" />
          </>
        )}

        {entry && (
          <>
            <FileUploadList>
              <FileUploadItem
                name={entry.file.name}
                size={entry.file.size}
                type={entry.file.type}
                status={entry.status}
                progress={entry.progress}
                error={entry.error}
                statusLabel={
                  entry.status === "processing"
                    ? `データを取り込んでいます（${rowsDone.toLocaleString()} / ${rowsTotal.toLocaleString()} 行）`
                    : entry.status === "done"
                      ? "取り込みが完了しました"
                      : undefined
                }
                onRemove={entry.status === "selected" ? restart : undefined}
                onCancel={entry.status === "uploading" ? () => upload.cancel(entry.id) : undefined}
                onRetry={() => upload.start(entry)}
              />
            </FileUploadList>

            {entry.status === "selected" && (
              <div className="flex flex-col gap-6">
                <Field className="max-w-md">
                  <FieldLabel>既存の顧客と重複したとき</FieldLabel>
                  <Select items={duplicateOptions} value={duplicate} onValueChange={(v) => setDuplicate(v as string | null)}>
                    <SelectTrigger>
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
                  <FieldDescription>メールアドレスが同じ顧客を、重複とみなします</FieldDescription>
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => upload.start(entry)}>取り込みを開始</Button>
                  <Button variant="secondary" onClick={restart}>
                    別のファイルを選ぶ
                  </Button>
                </div>
              </div>
            )}

            {entry.status === "done" && (
              <Alert variant="success" data-testid="import-done">
                <AlertTitle>2,380 件の顧客を取り込みました</AlertTitle>
                <AlertDescription>メールアドレスが重複していた 20 件は、取り込みませんでした。</AlertDescription>
                <AlertAction>
                  <Button size="sm">顧客一覧を見る</Button>
                  <Button size="sm" variant="secondary" onClick={restart}>
                    続けて取り込む
                  </Button>
                </AlertAction>
              </Alert>
            )}
            {(entry.status === "error" || entry.status === "canceled") && (
              <div>
                <Button variant="secondary" onClick={restart}>
                  別のファイルを選ぶ
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="mt-16" aria-labelledby="import-history">
        <h2 id="import-history" className="text-section">
          取り込みの履歴
        </h2>
        {history.length === 0 ? (
          <Empty className="mt-4" data-testid="import-history-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History />
              </EmptyMedia>
              <EmptyTitle>取り込みの履歴はまだありません</EmptyTitle>
              <EmptyDescription>取り込みが完了すると、結果がここに残ります。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="mt-6 flex flex-col divide-y divide-border" data-testid="import-history-list">
            {history.map((h, i) => (
              <li key={i} className="flex flex-col gap-1 py-4">
                <span className="text-ui font-medium [overflow-wrap:anywhere]">{h.name}</span>
                <span className="text-caption text-muted-foreground">{h.result}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
