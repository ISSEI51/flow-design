import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react"

import { useNavigationGuard } from "@/patterns/unsaved-changes"

// 検証画面のルーター（製品側のコードの例）。URL のハッシュ（#/forms-app?page=...）で画面を切り替える。
// Registry の useNavigationGuard は特定のルーターに依存しないため、移動の阻止と再開はこのルーターが行う。
//
// - アプリの中の移動（Sidebar、リンク、ボタン）：confirmNavigation(proceed) を通してから pushState する。
// - ブラウザの戻る・進む：popstate の時点で URL はすでに変わっている。未保存の変更がある場合は、
//   history.go(-delta) で元の項目に戻してから確認を開き、許可されたら history.go(delta) で改めて移動する。
//   delta は、履歴の項目ごとに記録した位置（history.state.fdFormsIdx）の差から求める。
// - 元に戻すための popstate（ignore）と、許可された移動の popstate（bypass）では、確認を開かない（確認の繰り返しを防ぐ）。
// - 画面の状態（route）は、確認が許可された後にだけ変える。AppShellMain の pageKey（フォーカスとスクロールの移動）は、
//   実際に移動したときだけ変わる。
// プレビューの制約：検証画面の外（プレビューの別のページ）へ戻る場合は、プレビューの一覧が先に画面を切り替えるため確認できない。
// 製品では、アプリの外への移動は beforeunload で確認する。

export const FORMS_APP = "#/forms-app"

export type FormsRoute = { page: string; id: string | null; params: URLSearchParams }

export function readFormsRoute(): FormsRoute {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
  return { page: params.get("page") ?? "customers", id: params.get("id"), params }
}

export const formsHref = (page: string, extra?: Record<string, string>) => `${FORMS_APP}?${new URLSearchParams({ page, ...extra }).toString()}`

const indexOf = (state: unknown) => ((state ?? {}) as { fdFormsIdx?: number }).fdFormsIdx

export function useFormsRouter() {
  const guard = useNavigationGuard()
  const guardRef = useRef(guard)
  guardRef.current = guard
  const [route, setRoute] = useState(readFormsRoute)
  const index = useRef(indexOf(window.history.state) ?? 0)
  const ignore = useRef(0)
  const bypass = useRef(false)

  useEffect(() => {
    if (indexOf(window.history.state) === undefined) window.history.replaceState({ ...(window.history.state ?? {}), fdFormsIdx: index.current }, "")
  }, [])

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (!window.location.hash.startsWith(FORMS_APP)) return
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
        setRoute(readFormsRoute())
        return
      }
      // 元の項目に戻してから確かめる
      ignore.current++
      window.history.go(-delta)
      g.confirmNavigation(() => {
        bypass.current = true
        window.history.go(delta)
        // 移動が起きなかった（履歴の項目がない）場合に、印を残さない。残すと、次の戻る・進むで確かめずに移動してしまう
        window.setTimeout(() => (bypass.current = false), 1000)
      })
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const navigate = useCallback((href: string, { replace = false }: { replace?: boolean } = {}) => {
    guardRef.current.confirmNavigation(() => {
      if (replace) window.history.replaceState({ fdFormsIdx: index.current }, "", href)
      else {
        index.current += 1
        window.history.pushState({ fdFormsIdx: index.current }, "", href)
      }
      setRoute(readFormsRoute())
    })
  }, [])

  // リンクの既定の移動を止めて、確認を通す。修飾キー付きのクリックは新しいタブに任せる。
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

  /**
   * 確認を通さずに URL と画面を置き換える（別のタブでのワークスペースの切り替えを再現する検証のため）。
   * 製品で、利用者の操作による移動に使わない
   */
  const replaceSilently = useCallback((href: string) => {
    window.history.replaceState({ fdFormsIdx: index.current }, "", href)
    setRoute(readFormsRoute())
  }, [])

  /** 移動の確認を表示しているか（最新の値。保存の後の処理から読む） */
  const isPending = useCallback(() => guardRef.current.pending, [])

  return { route, navigate, linkProps, isPending, replaceSilently }
}
