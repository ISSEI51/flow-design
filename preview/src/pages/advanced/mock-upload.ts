import { useCallback, useEffect, useRef, useState } from "react"

import type { FileUploadStatus } from "@/components/ui/file-upload"

// プレビュー用の送信と処理の模擬。外部のサーバーには送信しない。製品の側で行う処理の例でもある。
// 送信：150ms ごとに 20% 進む。処理：processingMs の間（processingKnown のときは進捗率あり）。
// - 名前に「失敗」か "error" を含むファイルは、送信の 60% で失敗する
// - 名前に「遅延」を含むファイルは、中止した後に、サーバーからの完了の通知が遅れて届く（中止できない処理の模擬）
// 製品の側の注意（この模擬で行っていること）
// - 同じファイルの送信を重ねて始めない（送信中のものは start を無視する）
// - 送信を始めるたびに番号（generation）を変え、古い送信の通知を無視する。中止の後に届いた完了の通知で、完了にしない

export type UploadEntry = {
  id: string
  file: File
  status: FileUploadStatus
  progress: number | null
  error?: string
}

declare global {
  interface Window {
    /** 検品用。start で実際に送信を始めた回数をファイル名ごとに数える。 */
    __uploadStarts?: Record<string, number>
  }
}

let seq = 0

export function useMockUpload({ processingMs = 900, processingKnown = false } = {}) {
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const timers = useRef(new Map<string, number[]>())
  const statusRef = useRef(new Map<string, FileUploadStatus>())
  const generation = useRef(new Map<string, number>())

  useEffect(
    () => () => {
      timers.current.forEach((ts) => ts.forEach((t) => window.clearTimeout(t)))
    },
    []
  )

  const patch = (id: string, p: Partial<UploadEntry>) => {
    if (p.status) statusRef.current.set(id, p.status)
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e)))
  }
  const stop = (id: string) => {
    timers.current.get(id)?.forEach((t) => window.clearTimeout(t))
    timers.current.delete(id)
  }
  const later = (id: string, ms: number, fn: () => void) => {
    const t = window.setTimeout(fn, ms)
    timers.current.set(id, [...(timers.current.get(id) ?? []), t])
  }

  const add = useCallback((files: File[], replace = false) => {
    const next = files.map((file) => ({ id: `f-${++seq}`, file, status: "selected" as const, progress: 0 }))
    for (const e of next) statusRef.current.set(e.id, "selected")
    setEntries((es) => (replace ? next : [...es, ...next]))
    return next
  }, [])

  const remove = (id: string) => {
    stop(id)
    statusRef.current.delete(id)
    setEntries((es) => es.filter((e) => e.id !== id))
  }

  const start = (entry: UploadEntry) => {
    const now = statusRef.current.get(entry.id)
    // 送信中、処理中、完了のものは、重ねて始めない（ボタンの連続した操作など）
    if (now === "uploading" || now === "uploaded" || now === "processing" || now === "done") return
    const gen = (generation.current.get(entry.id) ?? 0) + 1
    generation.current.set(entry.id, gen)
    window.__uploadStarts = { ...window.__uploadStarts, [entry.file.name]: (window.__uploadStarts?.[entry.file.name] ?? 0) + 1 }
    const current = () => generation.current.get(entry.id) === gen && statusRef.current.get(entry.id) !== "canceled"
    const fail = /失敗|error/i.test(entry.file.name)
    stop(entry.id)
    patch(entry.id, { status: "uploading", progress: 0, error: undefined })
    const step = (progress: number) => {
      if (!current()) return
      if (fail && progress >= 60) {
        patch(entry.id, { status: "error", progress, error: "通信が切断されました。ネットワークの接続を確かめて、再試行してください。" })
        return
      }
      if (progress < 100) {
        patch(entry.id, { progress })
        later(entry.id, 150, () => step(progress + 20))
        return
      }
      patch(entry.id, { status: "uploaded", progress: 100 })
      // 送信の完了と処理の開始の間に、短い待ちがある。
      later(entry.id, 300, () => {
        if (!current()) return
        patch(entry.id, { status: "processing", progress: processingKnown ? 0 : null })
        const proc = (p: number) => {
          if (!current()) return
          if (p >= 100) patch(entry.id, { status: "done", progress: 100 })
          else {
            if (processingKnown) patch(entry.id, { progress: p })
            later(entry.id, processingMs / 4, () => proc(p + 25))
          }
        }
        later(entry.id, processingMs / 4, () => proc(25))
      })
    }
    later(entry.id, 150, () => step(20))
  }

  const cancel = (id: string) => {
    stop(id)
    patch(id, { status: "canceled" })
    const entry = entries.find((e) => e.id === id)
    if (entry && /遅延/.test(entry.file.name)) {
      // 中止できない処理の模擬：サーバーの完了の通知が、中止の後に届く。番号と状態を確かめて無視する。
      const gen = generation.current.get(id)
      window.setTimeout(() => {
        if (generation.current.get(id) !== gen || statusRef.current.get(id) === "canceled") return
        patch(id, { status: "done", progress: 100 })
      }, 600)
    }
  }

  const startAll = () => entries.filter((e) => statusRef.current.get(e.id) === "selected").forEach(start)

  return { entries, add, remove, start, startAll, cancel, setEntries }
}
