import { useEffect, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  describeFileLimits,
  FileUploadButton,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadList,
  type FileRejection,
} from "@/components/ui/file-upload"

import { Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { useMockUpload } from "./mock-upload"

const MB = 1024 * 1024

export function Rejections({ items, testId }: { items: FileRejection[]; testId?: string }) {
  if (items.length === 0) return null
  return (
    <Alert variant="destructive" data-testid={testId} role="alert">
      <AlertTitle>{items.length} 件のファイルを追加できませんでした</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1">
          {items.map((r, i) => (
            <li key={i} className="[overflow-wrap:anywhere]">
              {r.file.name}：{r.errors.map((e) => e.message).join("。")}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

// ボタン形式。プロフィール画像のように、選んだらすぐに送信するのが自然な用途の例外。
function ProfileImage() {
  const upload = useMockUpload({ processingMs: 400 })
  const [rejected, setRejected] = useState<FileRejection[]>([])
  const [url, setUrl] = useState<string>()
  const entry = upload.entries[0]
  useEffect(() => {
    if (entry?.status === "done") {
      const u = URL.createObjectURL(entry.file)
      setUrl(u)
      return () => URL.revokeObjectURL(u)
    }
  }, [entry?.status, entry?.file])
  const limits = { accept: "image/png,image/jpeg,.png,.jpg,.jpeg", maxSize: 2 * MB }
  return (
    <div className="flex w-full max-w-md flex-col gap-4" data-testid="upload-profile">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar size="xl">
          {url && <AvatarImage src={url} alt="" />}
          <AvatarFallback>山田</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <FileUploadButton
            {...limits}
            aria-describedby="profile-limits"
            onFilesSelected={({ accepted, rejected }) => {
              setRejected(rejected)
              const [e] = upload.add(accepted, true)
              if (e) upload.start(e)
            }}
          >
            画像を変更
          </FileUploadButton>
          <p id="profile-limits" className="text-caption text-muted-foreground">
            PNG、JPEG ／ 2 MB まで
          </p>
        </div>
      </div>
      <Rejections items={rejected} testId="upload-profile-rejected" />
      {entry && (
        <FileUploadList>
          <FileUploadItem
            name={entry.file.name}
            size={entry.file.size}
            type={entry.file.type}
            status={entry.status}
            progress={entry.progress}
            error={entry.error}
            statusLabel={entry.status === "done" ? "プロフィール画像を変更しました" : undefined}
            onRetry={() => upload.start(entry)}
          />
        </FileUploadList>
      )}
    </div>
  )
}

// ドロップゾーン形式、単一ファイル。選択と送信を分け、アップロードボタンで始める。
function SingleCsv() {
  const upload = useMockUpload({ processingKnown: true })
  const [rejected, setRejected] = useState<FileRejection[]>([])
  const entry = upload.entries[0]
  const limits = { accept: ".csv,text/csv", maxSize: 5 * MB }
  return (
    <div className="flex w-full flex-col gap-4" data-testid="upload-single">
      {!entry && (
        <FileUploadDropzone
          {...limits}
          title="CSV ファイルをここにドロップ"
          onFilesSelected={({ accepted, rejected }) => {
            setRejected(rejected)
            upload.add(accepted.slice(0, 1), true)
          }}
        />
      )}
      <Rejections items={rejected} testId="upload-single-rejected" />
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
              onRemove={() => upload.remove(entry.id)}
              onCancel={() => upload.cancel(entry.id)}
              onRetry={() => upload.start(entry)}
            />
          </FileUploadList>
          {entry.status === "selected" && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => upload.start(entry)}>アップロード</Button>
              <Button variant="secondary" onClick={() => upload.remove(entry.id)}>
                別のファイルを選ぶ
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// 複数ファイル。上限の件数、大きさ、形式を検証し、まとめて送信する。
function MultipleFiles() {
  const upload = useMockUpload()
  const [rejected, setRejected] = useState<FileRejection[]>([])
  const limits = { accept: ".pdf,.png,.jpg,.jpeg,.csv", maxSize: 10 * MB, maxFiles: 5 }
  const waiting = upload.entries.filter((e) => e.status === "selected").length
  return (
    <div className="flex w-full flex-col gap-4" data-testid="upload-multiple">
      <FileUploadDropzone
        {...limits}
        multiple
        currentCount={upload.entries.length}
        existingFiles={upload.entries.map((e) => e.file)}
        disabled={upload.entries.length >= limits.maxFiles}
        title={upload.entries.length >= limits.maxFiles ? "これ以上追加できません" : "ここにファイルをドロップ"}
        onFilesSelected={({ accepted, rejected }) => {
          setRejected(rejected)
          upload.add(accepted)
        }}
      />
      <Rejections items={rejected} testId="upload-multiple-rejected" />
      {upload.entries.length > 0 && (
        <FileUploadList data-testid="upload-multiple-list">
          {upload.entries.map((e) => (
            <FileUploadItem
              key={e.id}
              name={e.file.name}
              size={e.file.size}
              type={e.file.type}
              status={e.status}
              progress={e.progress}
              error={e.error}
              onRemove={() => upload.remove(e.id)}
              onCancel={() => upload.cancel(e.id)}
              onRetry={() => upload.start(e)}
            />
          ))}
        </FileUploadList>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={waiting === 0} onClick={upload.startAll}>
          {waiting > 0 ? `${waiting} 件をアップロード` : "アップロード"}
        </Button>
        <p className="text-ui text-muted-foreground">
          名前に「失敗」を含むファイルは送信の途中で失敗し、「遅延」を含むファイルは中止の後に完了の通知が遅れて届きます（無視されます）
        </p>
      </div>
    </div>
  )
}

const demoStates = [
  { status: "selected", name: "2026年11月_売上明細.csv", size: 482_113 },
  { status: "validating", name: "顧客一覧.csv", size: 1_204_551 },
  { status: "uploading", name: "見積書_株式会社青葉システム.pdf", size: 3_204_551, progress: 45 },
  { status: "uploaded", name: "商品マスタ.csv", size: 82_113, progress: 100 },
  { status: "processing", name: "取引履歴_2026.csv", size: 8_482_113, progress: null },
  { status: "done", name: "請求先.csv", size: 32_113, label: "1,248 行を取り込みました" },
  { status: "error", name: "在庫.csv", size: 12_113, error: "3 行目の「数量」が数値ではありません。修正したファイルを選び直してください。" },
  { status: "canceled", name: "photo.png", size: 2_304_000 },
] as const

export function FileUploadPage() {
  return (
    <article>
      <PageHeader
        name="File Upload"
        lead="ファイルを選び、送信と処理の状況を確かめる。選ぶことと送信することを分け、送信はアップロードボタンで始める。"
      />

      <Section title="ボタン形式" lead="プロフィール画像の変更や、小さな添付欄など、補助的な登録に使う。">
        <Row label="プロフィール画像" note="選んだらすぐに送信する例外。2 MB を超える画像と、PNG・JPEG 以外は選べない">
          <ProfileImage />
        </Row>
      </Section>

      <Section
        title="ドロップゾーン形式"
        lead="ファイルの登録が画面の主な目的のときに使う。ドラッグ＆ドロップだけに頼らず、ボタンでも選べる。"
      >
        <Row label="単一ファイル" note="選択 → 確認 → アップロードの順">
          <SingleCsv />
        </Row>
        <Row label="複数ファイル" note={describeFileLimits({ accept: ".pdf,.png,.jpg,.jpeg,.csv", maxSize: 10 * MB, maxFiles: 5 })}>
          <MultipleFiles />
        </Row>
      </Section>

      <Section
        title="ファイルの状態"
        lead="送信が 100% になったことと、サーバーの処理が終わったことを区別する。進捗率がわからない処理には数値を出さない。"
      >
        <Row label="8 つの状態">
          <FileUploadList data-testid="upload-states">
            {demoStates.map((s) => (
              <FileUploadItem
                key={s.status}
                name={s.name}
                size={s.size}
                status={s.status}
                progress={"progress" in s ? s.progress : undefined}
                error={"error" in s ? s.error : undefined}
                statusLabel={"label" in s ? s.label : undefined}
                onRemove={() => {}}
                onCancel={s.status === "uploading" ? () => {} : undefined}
                onRetry={s.status === "error" ? () => {} : undefined}
              />
            ))}
          </FileUploadList>
        </Row>
        <Row label="長いファイル名" note="省略せずに折り返す">
          <div className="w-full max-w-sm" data-testid="upload-long">
            <FileUploadList>
              <FileUploadItem
                name="2026年度_上期_全国営業所別_売上実績と前年同期比較_最終確定版_経営会議提出用_v12.csv"
                size={12_482_113}
                status="selected"
                onRemove={() => {}}
              />
              <FileUploadItem name="quarterly-revenue-report-by-region-and-product-line-final-approved.xlsx" size={882_113} status="selected" onRemove={() => {}} />
            </FileUploadList>
          </div>
        </Row>
      </Section>
    </article>
  )
}
