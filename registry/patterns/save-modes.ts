"use client"

import * as React from "react"

import { FormSaveError, stableKey } from "@/patterns/form-state"

// Flow Design Save Modes（Patterns / Forms & Workflows）
// 明示的な保存（useFormState）以外の 2 つの保存の方式。定義は docs/web/patterns/create-and-edit.md の「保存の方式」を参照。
//
//   即時保存（useInstantSave） … 独立した Switch や単一の項目。切り替えた時点で保存する。
//   自動保存（useAutosave）    … 文書やメモなどの継続的な入力。入力が止まってから保存する。
//
// 保存の結果（save が投げる例外で区別する）
//   成功                       … save が値を返す
//   確定した失敗               … FormSaveError(message, "failed")。保存されていない
//   結果が不明                 … FormSaveError(message, "unknown")、またはそれ以外の例外（通信の例外など）。
//                                 サーバーで処理が終わっている可能性があるため、自動で再実行しない
//
// スコープと世代：scopeKey（アカウント、ワークスペース、レコード）の変更とアンマウントで世代を進め、
// それより前に始めた保存の結果で、新しいスコープの表示と状態を変えない。AbortSignal はサーバーでの処理の取り消しを保証しない。
//
// 保存の API、冪等性、再試行の方針、通知の文言は製品が持つ。

const outcomeOf = (error: unknown) => (error instanceof FormSaveError ? error.outcome : "unknown")

export type InstantSaveStatus = "idle" | "saving" | "saved" | "failed" | "unknown" | "checking"

/**
 * 即時保存。
 * - 保存中は新しい値を表示し、次の変更を受け付けない（change は false を返す）。製品は保存中の操作部品を disabled にする。
 * - 確定した失敗：最後に保存できた値に戻す（failed）。
 * - 結果が不明：値を戻さない。保存した値かどうかがわからないことを示し（unknown）、次の変更を受け付けない。
 *   verify（サーバーの値を読む処理）を渡すと、verify() で確かめて表示をサーバーの値にそろえる。
 *   value（サーバーが保存している値）が変わった場合も、その値で確かめたとして解く。
 */
export function useInstantSave<T>({
  value: savedValue,
  save,
  verify,
  scopeKey,
}: {
  /** サーバーが保存している値。再取得などで変わった場合は、保存中でなければ表示に反映する */
  value: T
  save: (next: T, context: { signal: AbortSignal }) => Promise<void>
  /** サーバーの値を読み直す（結果が不明の後の確認） */
  verify?: (context: { signal: AbortSignal }) => Promise<T>
  /** アカウント、ワークスペースなど。変わったら、古い保存の結果を使わず、value の値から始め直す */
  scopeKey?: string
}) {
  const [value, setValue] = React.useState(savedValue)
  const [status, setStatus] = React.useState<InstantSaveStatus>("idle")
  const confirmed = React.useRef(savedValue)
  const busy = React.useRef(false)
  const unknownRef = React.useRef(false)
  const controller = React.useRef<AbortController | null>(null)
  const generation = React.useRef(0)
  const scopeRef = React.useRef(scopeKey)

  React.useEffect(() => {
    const scopeChanged = scopeRef.current !== scopeKey
    scopeRef.current = scopeKey
    if (scopeChanged) {
      generation.current++
      controller.current?.abort()
      busy.current = false
      unknownRef.current = false
      setStatus("idle")
    } else if (busy.current) return
    confirmed.current = savedValue
    setValue(savedValue)
    if (unknownRef.current) {
      // サーバーの値を受け取った：結果が不明な状態を、その値で解く
      unknownRef.current = false
      setStatus("idle")
    }
  }, [savedValue, scopeKey])

  React.useEffect(
    () => () => {
      generation.current++
      controller.current?.abort()
    },
    []
  )

  const change = React.useCallback(
    (next: T) => {
      if (busy.current || unknownRef.current) return false
      busy.current = true
      const gen = generation.current
      const c = new AbortController()
      controller.current = c
      setValue(next)
      setStatus("saving")
      save(next, { signal: c.signal }).then(
        () => {
          if (gen !== generation.current) return
          busy.current = false
          confirmed.current = next
          setStatus("saved")
        },
        (error) => {
          if (gen !== generation.current) return
          busy.current = false
          if (outcomeOf(error) === "failed") {
            // 保存できなかった値を表示し続けない。最後に保存できた値に戻す
            setValue(confirmed.current)
            setStatus("failed")
            return
          }
          // 結果が不明：表示を戻すと、サーバーの値も戻ったと誤解させるため、値は変えずに不明であることを示す
          unknownRef.current = true
          setStatus("unknown")
        }
      )
      return true
    },
    [save]
  )

  /** 結果が不明な場合に、サーバーの値を読んで表示をそろえる。確かめられたら true */
  const check = React.useCallback(async () => {
    if (!verify || busy.current) return false
    busy.current = true
    const gen = generation.current
    const c = new AbortController()
    controller.current = c
    setStatus("checking")
    try {
      const actual = await verify({ signal: c.signal })
      if (gen !== generation.current) return false
      busy.current = false
      unknownRef.current = false
      confirmed.current = actual
      setValue(actual)
      setStatus("idle")
      return true
    } catch {
      if (gen !== generation.current) return false
      busy.current = false
      setStatus("unknown")
      return false
    }
  }, [verify])

  return { value, status, pending: status === "saving" || status === "checking", unknown: status === "unknown", change, check }
}

export type AutosaveStatus = "saved" | "unsaved" | "saving" | "failed" | "unknown"

/**
 * 自動保存。value が保存した値と変わったら、入力が止まってから（delayMs）保存する。
 * - 保存中に値が変わった場合は、保存が終わった後に、最新の値をもう一度保存する。保存中の値を保存済みと誤認しない。
 * - 確定した失敗：failed。値が変わるか retry() を呼ぶまで保存しない（自動で繰り返さない）。
 * - 結果が不明：unknown。値が変わっても自動では保存しない。retry()（利用者の明示的な操作）か markSaved（確かめた結果）で解く。
 *   文書の全体を保存する API のように、同じ値の保存を繰り返しても結果が変わらない（冪等である）場合だけ retry を置く。
 * - flush() は待たずに保存し、最新の値が保存できたかを返す（移動の前の保存など）。結果が不明の間は保存せずに false を返す。
 * - scopeKey が変わったら、古い保存の結果を使わず、その時点の値を保存済みとして始め直す（別の文書を開いた）。
 */
export function useAutosave<T>({
  value,
  save,
  delayMs = 1000,
  enabled = true,
  scopeKey,
}: {
  value: T
  save: (value: T, context: { signal: AbortSignal }) => Promise<void>
  delayMs?: number
  /** false の間は保存しない（読み込み中、権限がないなど） */
  enabled?: boolean
  scopeKey?: string
}) {
  const key = stableKey(value)
  const [savedKey, setSavedKey] = React.useState(key)
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<{ key: string; outcome: "failed" | "unknown" } | null>(null)
  const [savedAt, setSavedAt] = React.useState<Date | null>(null)
  const latest = React.useRef({ value, key, save })
  latest.current = { value, key, save }
  const inflight = React.useRef<Promise<boolean> | null>(null)
  const savedKeyRef = React.useRef(savedKey)
  savedKeyRef.current = savedKey
  const unknownRef = React.useRef(false)
  const generation = React.useRef(0)
  const scopeRef = React.useRef(scopeKey)
  const controllerRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    if (scopeRef.current === scopeKey) return
    scopeRef.current = scopeKey
    generation.current++
    controllerRef.current?.abort()
    inflight.current = null
    unknownRef.current = false
    savedKeyRef.current = latest.current.key
    setSavedKey(latest.current.key)
    setSaving(false)
    setFailure(null)
    setSavedAt(null)
  }, [scopeKey])

  React.useEffect(
    () => () => {
      generation.current++
      controllerRef.current?.abort()
    },
    []
  )

  const run = React.useCallback((): Promise<boolean> => {
    if (unknownRef.current) return Promise.resolve(false)
    const gen = generation.current
    if (inflight.current) {
      // 保存中なら、終わった後に最新の値を保存する
      return inflight.current.then((ok) => (gen !== generation.current || !ok ? false : latest.current.key === savedKeyRef.current ? true : run()))
    }
    const { value: v, key: k, save: fn } = latest.current
    if (k === savedKeyRef.current) return Promise.resolve(true)
    const controller = new AbortController()
    controllerRef.current = controller
    setSaving(true)
    const p = fn(v, { signal: controller.signal }).then(
      () => {
        if (gen !== generation.current) return false
        inflight.current = null
        savedKeyRef.current = k
        setSavedKey(k)
        setSavedAt(new Date())
        setFailure(null)
        setSaving(false)
        return latest.current.key === k
      },
      (error) => {
        if (gen !== generation.current) return false
        inflight.current = null
        const outcome = outcomeOf(error)
        if (outcome === "unknown") unknownRef.current = true
        setFailure({ key: k, outcome })
        setSaving(false)
        return false
      }
    )
    inflight.current = p
    return p
  }, [])

  React.useEffect(() => {
    if (!enabled || key === savedKey || saving || failure?.outcome === "unknown" || key === failure?.key) return
    const timer = window.setTimeout(() => void run(), delayMs)
    return () => window.clearTimeout(timer)
  }, [enabled, key, savedKey, saving, failure, delayMs, run])

  const status: AutosaveStatus = saving
    ? "saving"
    : failure?.outcome === "unknown"
      ? "unknown"
      : key === savedKey
        ? "saved"
        : failure?.key === key
          ? "failed"
          : "unsaved"

  return {
    status,
    /** 最後に保存できた時刻 */
    savedAt,
    /** 保存していない変更がある（保存中と、結果が不明を含む） */
    hasUnsavedChanges: key !== savedKey || failure?.outcome === "unknown",
    flush: run,
    /** 利用者の明示的な操作で、もう一度保存する（確定した失敗の後、または冪等な保存で結果が不明の後） */
    retry: () => {
      unknownRef.current = false
      setFailure(null)
      return run()
    },
    /** 製品が確かめた値、または別の経路で保存した値を、保存済みにする。結果が不明な状態も解く */
    markSaved: (v: T) => {
      const k = stableKey(v)
      unknownRef.current = false
      setFailure(null)
      savedKeyRef.current = k
      setSavedKey(k)
    },
  }
}
