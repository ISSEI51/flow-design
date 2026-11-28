import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"

import { useNavigationGuard } from "@/patterns/unsaved-changes"

// 横断の検証画面のルーター（製品側のコードの例。Forms & Workflows の検証画面の forms-router.ts と同じ方式）。
// URL のハッシュ（#/patterns-integration?page=...&ws=...）で画面を切り替える。
// - アプリの中の移動（Sidebar、通知、リンク、Drill-down）：confirmNavigation(proceed) を通してから pushState する。
// - ブラウザの戻る・進む：未保存の変更がある場合は、history.go(-delta) で元の項目に戻してから確かめ、許可されたら進め直す。
// - 履歴の項目ごとに位置（fdPiIdx）と、移動の元の項目の位置（fdPiFrom）を記録する（一覧の復元の判断に使う）。
// - 画面の状態（route）は、確認が許可された後にだけ変える。

export const PI_APP = "#/patterns-integration"

export type PiRoute = { page: string; id: string | null; params: URLSearchParams }

export function readPiRoute(): PiRoute {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
  return { page: params.get("page") ?? "home", id: params.get("id"), params }
}

export const piHref = (page: string, extra?: Record<string, string | null | undefined>) => {
  const p = new URLSearchParams({ page })
  for (const [k, v] of Object.entries(extra ?? {})) if (v !== null && v !== undefined && v !== "") p.set(k, v)
  return `${PI_APP}?${p.toString()}`
}

type Marks = { fdPiIdx?: number; fdPiFrom?: number }
export const historyMarks = () => (window.history.state ?? {}) as Marks & Record<string, unknown>
const indexOf = (state: unknown) => ((state ?? {}) as Marks).fdPiIdx

export type PiNav = {
  /** onNavigated：実際に移動したときだけ呼ぶ（未保存の変更の確認で「編集を続ける」を選んだ場合は呼ばない） */
  navigate: (href: string, options?: { replace?: boolean; onCancel?: () => void; onNavigated?: () => void }) => void
  linkProps: (href: string) => { href: string; onClick: (e: MouseEvent) => void }
  /** 確認なしで移動する（認可の失効、ログアウトの後など。利用者の未保存の変更の保護より、失効を優先する場合だけ） */
  force: (href: string) => void
  pending: () => boolean
}

export function usePiRouter() {
  const guard = useNavigationGuard()
  const guardRef = useRef(guard)
  guardRef.current = guard
  const [route, setRoute] = useState(readPiRoute)
  const index = useRef(indexOf(window.history.state) ?? 0)
  const ignore = useRef(0)
  const bypass = useRef(false)

  useEffect(() => {
    if (indexOf(window.history.state) === undefined) window.history.replaceState({ ...(window.history.state ?? {}), fdPiIdx: index.current }, "")
  }, [])

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (!window.location.hash.startsWith(PI_APP)) return
      const next = indexOf(event.state) ?? 0
      if (ignore.current > 0) {
        ignore.current--
        return
      }
      const delta = next - index.current
      const g = guardRef.current
      if (bypass.current || delta === 0 || (!g.hasUnsavedChanges && !g.saving)) {
        bypass.current = false
        index.current = next
        setRoute(readPiRoute())
        return
      }
      ignore.current++
      window.history.go(-delta)
      g.confirmNavigation(() => {
        bypass.current = true
        window.history.go(delta)
      })
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const go = useCallback((href: string, replace: boolean) => {
    const from = index.current
    if (replace) window.history.replaceState({ fdPiIdx: index.current, fdPiFrom: from }, "", href)
    else {
      index.current += 1
      window.history.pushState({ fdPiIdx: index.current, fdPiFrom: from }, "", href)
    }
    setRoute(readPiRoute())
  }, [])

  const navigate = useCallback<PiNav["navigate"]>(
    (href, { replace = false, onCancel, onNavigated } = {}) =>
      guardRef.current.confirmNavigation(
        () => {
          go(href, replace)
          onNavigated?.()
        },
        { onCancel }
      ),
    [go]
  )

  const force = useCallback((href: string) => go(href, false), [go])

  const linkProps = useCallback(
    (href: string) => ({
      href,
      onClick: (e: MouseEvent) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(href)
      },
    }),
    [navigate]
  )

  const pending = useCallback(() => guardRef.current.pending, [])

  const nav = useMemo<PiNav>(() => ({ navigate, linkProps, force, pending }), [navigate, linkProps, force, pending])
  return { route, nav }
}
