import { useCallback, useEffect, useRef, useState } from "react"

import type { FileUploadStatus } from "@/components/ui/file-upload"

// プレビュー用の送信と処理の模擬。外部のサーバーには送信しない。
// 送信：150ms ごとに 20% 進む。処理：processingMs の間、進捗不明。
// 名前に「失敗」か "error" を含むファイルは、送信の 60% で失敗する。

export type UploadEntry = {
  id: string
  file: File
  status: FileUploadStatus
  progress: number | null
  error?: string
}

let seq = 0

export function useMockUpload({ processingMs = 900, processingKnown = false } = {}) {
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const timers = useRef(new Map<string, number>())

  useEffect(() => () => timers.current.forEach((t) => window.clearInterval(t)), [])

  const patch = (id: string, p: Partial<UploadEntry>) => setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e)))
  const stop = (id: string) => {
    window.clearInterval(timers.current.get(id))
    timers.current.delete(id)
  }

  const add = useCallback((files: File[], replace = false) => {
    const next = files.map((file) => ({ id: `f-${++seq}`, file, status: "selected" as const, progress: 0 }))
    setEntries((es) => (replace ? next : [...es, ...next]))
    return next
  }, [])

  const remove = (id: string) => {
    stop(id)
    setEntries((es) => es.filter((e) => e.id !== id))
  }

  const start = (entry: UploadEntry) => {
    const fail = /失敗|error/i.test(entry.file.name)
    let progress = 0
    patch(entry.id, { status: "uploading", progress: 0, error: undefined })
    stop(entry.id)
    const t = window.setInterval(() => {
      progress += 20
      if (fail && progress >= 60) {
        stop(entry.id)
        patch(entry.id, { status: "error", progress, error: "通信が切断されました。ネットワークの接続を確かめて、再試行してください。" })
        return
      }
      if (progress < 100) {
        patch(entry.id, { progress })
        return
      }
      stop(entry.id)
      patch(entry.id, { status: "uploaded", progress: 100 })
      // 送信の完了と処理の開始の間に、短い待ちがある。
      const t2 = window.setTimeout(() => {
        patch(entry.id, { status: "processing", progress: processingKnown ? 0 : null })
        let p = 0
        const t3 = window.setInterval(() => {
          p += 25
          if (p >= 100) {
            stop(entry.id)
            patch(entry.id, { status: "done", progress: 100 })
          } else if (processingKnown) patch(entry.id, { progress: p })
        }, processingMs / 4)
        timers.current.set(entry.id, t3)
      }, 300)
      timers.current.set(entry.id, t2)
    }, 150)
    timers.current.set(entry.id, t)
  }

  const cancel = (id: string) => {
    stop(id)
    patch(id, { status: "canceled" })
  }

  const startAll = () => entries.filter((e) => e.status === "selected").forEach(start)

  return { entries, add, remove, start, startAll, cancel, setEntries }
}
