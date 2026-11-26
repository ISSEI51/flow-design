"use client"

import * as React from "react"

import { stableKey } from "@/patterns/form-state"

// Flow Design Save Modes（Patterns / Forms & Workflows）
// 明示的な保存（useFormState）以外の 2 つの保存の方式。定義は docs/web/patterns/create-and-edit.md の「保存の方式」を参照。
//
//   即時保存（useInstantSave） … 独立した Switch や単一の項目。切り替えた時点で保存する。
//                                 失敗したら、サーバーが最後に受け付けた値に戻す（画面の表示と保存の状態を一致させる）。
//   自動保存（useAutosave）    … 文書やメモなどの継続的な入力。入力が止まってから保存する。
//                                 未保存、保存中、保存済み、保存の失敗を区別する。
//
// どちらも、保存の API、再試行の方針、通知の文言は製品が持つ。

export type InstantSaveStatus = "idle" | "saving" | "saved" | "failed"

/**
 * 即時保存。表示する値（value）は、保存中は新しい値、失敗したら最後に保存できた値になる。
 * 保存中は次の変更を受け付けない（change は false を返す）。製品は保存中の操作部品を disabled にする。
 * 続けて変更できる設計にすると、応答の順序とサーバーに反映した順序が一致しない場合がある。
 */
export function useInstantSave<T>({
  value: savedValue,
  save,
}: {
  /** サーバーが保存している値。再取得などで変わった場合は、保存中でなければ表示に反映する */
  value: T
  save: (next: T, context: { signal: AbortSignal }) => Promise<void>
}) {
  const [value, setValue] = React.useState(savedValue)
  const [status, setStatus] = React.useState<InstantSaveStatus>("idle")
  const confirmed = React.useRef(savedValue)
  const pending = React.useRef(false)
  const controller = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    if (pending.current) return
    confirmed.current = savedValue
    setValue(savedValue)
  }, [savedValue])

  React.useEffect(() => () => controller.current?.abort(), [])

  const change = React.useCallback(
    (next: T) => {
      if (pending.current) return false
      pending.current = true
      const c = new AbortController()
      controller.current = c
      setValue(next)
      setStatus("saving")
      save(next, { signal: c.signal }).then(
        () => {
          if (c.signal.aborted) return
          pending.current = false
          confirmed.current = next
          setStatus("saved")
        },
        () => {
          if (c.signal.aborted) return
          pending.current = false
          // 保存できなかった値を表示し続けない。最後に保存できた値に戻す
          setValue(confirmed.current)
          setStatus("failed")
        }
      )
      return true
    },
    [save]
  )

  return { value, status, pending: status === "saving", change }
}

export type AutosaveStatus = "saved" | "unsaved" | "saving" | "failed"

/**
 * 自動保存。value が保存した値と変わったら、入力が止まってから（delayMs）保存する。
 * - 保存中に値が変わった場合は、保存が終わった後に、最新の値をもう一度保存する。保存中の値を保存済みと誤認しない。
 * - 失敗したら failed にし、値が変わるか retry() を呼ぶまで保存しない（自動で繰り返さない）。
 * - flush() は待たずに保存し、最新の値が保存できたかを返す（移動の前の保存など）。
 */
export function useAutosave<T>({
  value,
  save,
  delayMs = 1000,
  enabled = true,
}: {
  value: T
  save: (value: T, context: { signal: AbortSignal }) => Promise<void>
  delayMs?: number
  /** false の間は保存しない（読み込み中、権限がないなど） */
  enabled?: boolean
}) {
  const key = stableKey(value)
  const [savedKey, setSavedKey] = React.useState(key)
  const [saving, setSaving] = React.useState(false)
  const [failedKey, setFailedKey] = React.useState<string | null>(null)
  const [savedAt, setSavedAt] = React.useState<Date | null>(null)
  const latest = React.useRef({ value, key, save })
  latest.current = { value, key, save }
  const inflight = React.useRef<Promise<boolean> | null>(null)
  const savedKeyRef = React.useRef(savedKey)
  savedKeyRef.current = savedKey
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = React.useCallback((): Promise<boolean> => {
    if (inflight.current) {
      // 保存中なら、終わった後に最新の値を保存する
      return inflight.current.then(() => (latest.current.key === savedKeyRef.current ? true : run()))
    }
    const { value: v, key: k, save: fn } = latest.current
    if (k === savedKeyRef.current) return Promise.resolve(true)
    const controller = new AbortController()
    setSaving(true)
    const p = fn(v, { signal: controller.signal }).then(
      () => {
        inflight.current = null
        if (!mounted.current) return true
        savedKeyRef.current = k
        setSavedKey(k)
        setSavedAt(new Date())
        setFailedKey(null)
        setSaving(false)
        return latest.current.key === k
      },
      () => {
        inflight.current = null
        if (!mounted.current) return false
        setFailedKey(k)
        setSaving(false)
        return false
      }
    )
    inflight.current = p
    return p
  }, [])

  React.useEffect(() => {
    if (!enabled || key === savedKey || saving || key === failedKey) return
    const timer = window.setTimeout(() => void run(), delayMs)
    return () => window.clearTimeout(timer)
  }, [enabled, key, savedKey, saving, failedKey, delayMs, run])

  const status: AutosaveStatus = saving ? "saving" : key === savedKey ? "saved" : failedKey === key ? "failed" : "unsaved"

  return {
    status,
    /** 最後に保存できた時刻 */
    savedAt,
    /** 保存していない変更がある（保存中を含む） */
    hasUnsavedChanges: key !== savedKey,
    flush: run,
    retry: () => {
      setFailedKey(null)
      return run()
    },
    /** 製品が別の経路で保存した値を、保存済みにする（読み込んだ値を基準にするなど） */
    markSaved: (v: T) => {
      const k = stableKey(v)
      savedKeyRef.current = k
      setSavedKey(k)
    },
  }
}
