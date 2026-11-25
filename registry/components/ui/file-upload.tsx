"use client"

import * as React from "react"
import {
  CircleAlert,
  CircleCheck,
  CircleSlash,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Upload,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

// Flow Design File Upload
// ファイルの選択と、送信・処理の状態の表示を提供する。shadcn/ui には同じ部品がないため、Flow Design が定める。
// - 選択と送信を分ける。ファイルを選んだだけでは送信しない。送信は製品が明示的な操作（アップロードボタン）で始める
// - 形式は 2 種類。補助的な登録はボタン（FileUploadButton）、登録が画面の主な目的ならドロップゾーン（FileUploadDropzone）
// - ドラッグ＆ドロップだけに頼らず、クリックとキーボードで選べるボタンを必ず置く
// - クライアント側の検証（形式、大きさ、件数）は早く知らせるためのもの。安全性は保証しない。最終的な検証はサーバーが行う
// - 状態は 8 つ（selected、validating、uploading、uploaded、processing、done、error、canceled）。
//   送信が 100% になったこと（uploaded）と、サーバーのデータ処理が終わったこと（done）を区別する
// - 進捗率が不明なときは数値を出さない（progress={null}）
// - 中止できる処理にだけ、中止のボタンを出す（onCancel を渡したときだけ）
// API の通信、保存、認証、ウイルス検査、内容の検証、データ処理、再試行、中断は製品の責務である。
// 定義は docs/web/components/file-upload.md を参照。

type FileUploadStatus = "selected" | "validating" | "uploading" | "uploaded" | "processing" | "done" | "error" | "canceled"

type FileRejectionCode = "type" | "size" | "count" | "duplicate"
type FileRejection = { file: File; errors: { code: FileRejectionCode; message: string }[] }

type FileLimits = {
  /** input の accept と同じ形式（".csv,text/csv"、"image/*"） */
  accept?: string
  /** 1 ファイルの最大のバイト数 */
  maxSize?: number
  /** 選べる件数の上限。すでに選んだ件数（currentCount）を含む */
  maxFiles?: number
  /** すでに選んでいる件数 */
  currentCount?: number
  /** すでに選んでいるファイル。名前、大きさ、更新日時が同じファイルを、重複として選べないようにする。 */
  existingFiles?: readonly File[]
}

// ---- 検証と表示の補助

/** バイト数を読みやすい単位にする。1 KB = 1024 バイト。 */
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`
}

const acceptList = (accept?: string) =>
  (accept ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

/** ファイルが accept に合うか。拡張子と MIME Type の表記だけを確かめる。内容が安全かどうかは判定しない。 */
function matchesAccept(file: File, accept?: string) {
  const list = acceptList(accept)
  if (list.length === 0) return true
  const name = file.name.toLowerCase()
  const type = (file.type || "").toLowerCase()
  return list.some((a) =>
    a.startsWith(".") ? name.endsWith(a) : a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a
  )
}

/** 制限の説明文。ドロップゾーンとボタンの説明に使う。 */
function describeFileLimits({ accept, maxSize, maxFiles }: FileLimits) {
  const parts: string[] = []
  const exts = acceptList(accept).filter((a) => a.startsWith("."))
  if (exts.length) parts.push(`形式：${exts.join("、")}`)
  if (maxSize) parts.push(`1 ファイル ${formatFileSize(maxSize)} まで`)
  if (maxFiles) parts.push(`${maxFiles} 件まで`)
  return parts.join(" ／ ")
}

/** 同じファイルか。名前、大きさ、更新日時（lastModified）で比べる。内容は比べない。 */
function isSameFile(a: File, b: File) {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
}

/**
 * クライアント側の検証。結果は選べたファイルと、理由つきの選べなかったファイルに分ける。
 * 件数の上限は、すでに選んでいる件数（currentCount）を含めて数える。重複は existingFiles と、同じ選択の中で調べる。
 */
function validateFiles(files: File[], { accept, maxSize, maxFiles, currentCount = 0, existingFiles = [] }: FileLimits) {
  const accepted: File[] = []
  const rejected: FileRejection[] = []
  for (const file of files) {
    const errors: FileRejection["errors"] = []
    if (existingFiles.some((f) => isSameFile(f, file)) || accepted.some((f) => isSameFile(f, file))) {
      rejected.push({ file, errors: [{ code: "duplicate", message: "同じファイルがすでに選ばれています" }] })
      continue
    }
    if (!matchesAccept(file, accept)) {
      const exts = acceptList(accept).filter((a) => a.startsWith("."))
      errors.push({ code: "type", message: exts.length ? `${exts.join("、")} のファイルを選んでください` : "この形式のファイルは選べません" })
    }
    if (maxSize !== undefined && file.size > maxSize)
      errors.push({
        code: "size",
        message: `${formatFileSize(maxSize)} 以下のファイルを選んでください（このファイルは ${formatFileSize(file.size)}）`,
      })
    if (errors.length === 0 && maxFiles !== undefined && currentCount + accepted.length >= maxFiles)
      errors.push({ code: "count", message: `選べるのは ${maxFiles} 件までです` })
    if (errors.length) rejected.push({ file, errors })
    else accepted.push(file)
  }
  return { accepted, rejected }
}

// ---- ファイルの選択

type FileSelectProps = FileLimits & {
  multiple?: boolean
  disabled?: boolean
  /** ファイルが選ばれた。検証の結果を受け取る。送信はしない。 */
  onFilesSelected?: (result: { accepted: File[]; rejected: FileRejection[] }) => void
  /** input の name。フォームとして送信する場合に使う。 */
  name?: string
}

/** ファイルの選択とドラッグ＆ドロップの処理。独自の見た目を作るときに使う。 */
function useFileSelect({ accept, maxSize, maxFiles, currentCount, existingFiles, multiple, disabled, onFilesSelected, name }: FileSelectProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const depth = React.useRef(0)

  const handle = (list: FileList | null) => {
    if (!list || disabled) return
    const files = Array.from(list)
    onFilesSelected?.(validateFiles(multiple ? files : files.slice(0, 1), { accept, maxSize, maxFiles, currentCount, existingFiles }))
  }

  const open = () => {
    if (!disabled) inputRef.current?.click()
  }

  const inputProps: React.ComponentProps<"input"> = {
    ref: inputRef,
    type: "file",
    name,
    accept,
    multiple,
    disabled,
    tabIndex: -1,
    "aria-hidden": true,
    className: "sr-only",
    onChange: (e) => {
      handle(e.currentTarget.files)
      // 同じファイルを続けて選んでも onChange が呼ばれるよう、値を空にする。
      e.currentTarget.value = ""
    },
  }

  const dropzoneProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (disabled || !e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      depth.current++
      setDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (disabled || !e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      if (disabled) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      handle(e.dataTransfer.files)
    },
  }

  return { open, inputProps, dropzoneProps, dragging }
}

/**
 * ドロップゾーン。CSV の取り込みや複数ファイルの登録など、ファイルの登録が画面の主な目的のときに使う。
 * 領域のどこを押してもファイルを選べる。キーボードでは中のボタンで選ぶ（領域そのものはフォーカスしない）。
 */
function FileUploadDropzone({
  className,
  title = "ここにファイルをドロップ",
  description,
  buttonLabel = "ファイルを選択",
  icon,
  ...props
}: FileSelectProps & {
  className?: string
  title?: React.ReactNode
  /** 制限の説明。省略時は accept、maxSize、maxFiles から作る。 */
  description?: React.ReactNode
  buttonLabel?: React.ReactNode
  icon?: React.ReactNode
}) {
  const { open, inputProps, dropzoneProps, dragging } = useFileSelect(props)
  const descriptionId = React.useId()
  const text = description ?? describeFileLimits(props)
  return (
    <div
      data-slot="file-upload-dropzone"
      data-dragging={dragging || undefined}
      data-disabled={props.disabled || undefined}
      onClick={open}
      {...dropzoneProps}
      className={cn(
        "flex w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-4 rounded-md border border-dashed border-input bg-background p-6 text-center",
        "transition-[background-color,border-color] duration-(--duration-fast) ease-standard",
        "hover:bg-accent/50",
        "data-dragging:border-primary data-dragging:bg-accent",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-background",
        className
      )}
    >
      <span aria-hidden="true" className="text-muted-foreground [&_svg]:size-8">
        {icon ?? <Upload />}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-body font-medium text-foreground [word-break:auto-phrase]">{title}</p>
        {text && (
          <p id={descriptionId} className="text-ui text-muted-foreground [word-break:auto-phrase]">
            {text}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={props.disabled}
        aria-describedby={text ? descriptionId : undefined}
        onClick={(e) => {
          e.stopPropagation()
          open()
        }}
      >
        {buttonLabel}
      </Button>
      <input {...inputProps} />
    </div>
  )
}

/** ボタン形式。プロフィール画像の変更や、小さな添付欄など、補助的な登録に使う。 */
function FileUploadButton({
  children = "ファイルを選択",
  variant = "outline",
  className,
  ...props
}: FileSelectProps & {
  children?: React.ReactNode
  variant?: React.ComponentProps<typeof Button>["variant"]
  className?: string
  "aria-describedby"?: string
}) {
  const { open, inputProps } = useFileSelect(props)
  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={props.disabled}
        aria-describedby={props["aria-describedby"]}
        onClick={open}
        className={className}
      >
        <Upload aria-hidden="true" />
        {children}
      </Button>
      <input {...inputProps} />
    </>
  )
}

// ---- 選んだファイルの一覧と状態

function FileUploadList({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="file-upload-list" className={cn("flex w-full min-w-0 flex-col divide-y divide-border", className)} {...props} />
}

const statusText: Record<FileUploadStatus, string> = {
  selected: "アップロード前",
  validating: "確認しています",
  uploading: "アップロードしています",
  uploaded: "アップロード完了。処理を待っています",
  processing: "データを処理しています",
  done: "完了",
  error: "失敗しました",
  canceled: "中止しました",
}

const active = (s: FileUploadStatus) => s === "validating" || s === "uploading" || s === "uploaded" || s === "processing"

function iconFor(name: string, type?: string) {
  const n = name.toLowerCase()
  if (type?.startsWith("image/")) return FileImage
  if (/\.(csv|tsv|xlsx?)$/.test(n)) return FileSpreadsheet
  if (type?.startsWith("text/") || /\.(txt|md|pdf|docx?)$/.test(n)) return FileText
  return FileIcon
}

function FileUploadItem({
  className,
  name,
  size,
  type,
  status,
  progress,
  error,
  statusLabel,
  onRemove,
  onCancel,
  onRetry,
  labels,
  ...props
}: Omit<React.ComponentProps<"li">, "children"> & {
  name: string
  /** バイト数。わからない場合は省略する。 */
  size?: number
  /** MIME Type。わからない場合は省略する。 */
  type?: string
  status: FileUploadStatus
  /** 0〜100。進捗率がわからない場合は null（数値を表示しない）。uploading と processing で使う。 */
  progress?: number | null
  /** 失敗の原因と、次に行うこと */
  error?: React.ReactNode
  /** 状態の文言を変える（例：「12,480 行を取り込みました」） */
  statusLabel?: React.ReactNode
  /** 選択の解除。送信前、失敗、中止の状態で表示する。 */
  onRemove?: () => void
  /** 中止。実際に中止できる処理にだけ渡す。送信中と処理中に表示する。 */
  onCancel?: () => void
  /** 再試行。失敗と中止の状態で表示する。 */
  onRetry?: () => void
  labels?: Partial<{ remove: string; cancel: string; retry: string }>
}) {
  const Icon = iconFor(name, type)
  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase() : undefined
  const showProgress = status === "uploading" || status === "processing" || status === "validating"
  const pct = typeof progress === "number" ? Math.round(Math.min(100, Math.max(0, progress))) : null
  const StatusIcon = status === "done" ? CircleCheck : status === "error" ? CircleAlert : status === "canceled" ? CircleSlash : null
  return (
    <li
      data-slot="file-upload-item"
      data-status={status}
      className={cn("group/file flex min-w-0 items-start gap-3 py-4", className)}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          {/* 長いファイル名は省略せず、どこでも折り返して全文を表示する。 */}
          <p data-slot="file-upload-name" className="text-ui font-medium text-foreground [overflow-wrap:anywhere]">
            {name}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground tabular-nums">
            {ext && <span>{ext}</span>}
            {size !== undefined && <span>{formatFileSize(size)}</span>}
            <span
              data-slot="file-upload-status"
              role="status"
              className={cn(
                "inline-flex items-center gap-1",
                "group-data-[status=done]/file:text-success group-data-[status=error]/file:text-destructive"
              )}
            >
              {StatusIcon && <StatusIcon aria-hidden="true" className="size-4" />}
              {statusLabel ?? statusText[status]}
            </span>
            {showProgress && pct !== null && <span aria-hidden="true">{pct}%</span>}
          </p>
        </div>
        {showProgress && (
          <Progress
            value={status === "validating" ? null : pct}
            aria-label={`${name}の${status === "processing" ? "処理" : status === "validating" ? "確認" : "アップロード"}の進捗`}
          />
        )}
        {status === "error" && error && (
          <p data-slot="file-upload-error" className="text-ui text-destructive [word-break:auto-phrase]">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onRetry && (status === "error" || status === "canceled") && (
          <Button variant="outline" size="xs" onClick={onRetry} aria-label={`${name}を${labels?.retry ?? "再試行"}`}>
            <RotateCcw aria-hidden="true" />
            {labels?.retry ?? "再試行"}
          </Button>
        )}
        {onCancel && (status === "uploading" || status === "processing") && (
          <Button variant="ghost" size="xs" onClick={onCancel} aria-label={`${name}の${labels?.cancel ?? "中止"}`}>
            {labels?.cancel ?? "中止"}
          </Button>
        )}
        {onRemove && !active(status) && status !== "done" && (
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`${name}を${labels?.remove ?? "一覧から外す"}`}>
            <X />
          </Button>
        )}
      </div>
    </li>
  )
}

export {
  describeFileLimits,
  FileUploadButton,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadList,
  formatFileSize,
  isSameFile,
  matchesAccept,
  useFileSelect,
  validateFiles,
}
export type { FileRejection, FileRejectionCode, FileUploadStatus }
