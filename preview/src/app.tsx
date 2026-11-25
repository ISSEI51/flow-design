import { useEffect, useState } from "react"

import { Toaster, ToastProvider } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"

import { catalog } from "./catalog"

const brands = [
  { id: "neutral", name: "標準", vars: {} },
  { id: "blue", name: "青", vars: { "--primary": "#1e40af", "--primary-foreground": "#ffffff" } },
  { id: "violet", name: "紫", vars: { "--primary": "#6d28d9", "--primary-foreground": "#ffffff" } },
] as const

function currentId() {
  // "#/app?page=customers" のように、ページの中の状態をハッシュの ? 以降に持つページがある。
  const id = window.location.hash.replace("#/", "").split("?")[0]
  return catalog.some((c) => c.id === id) ? id : catalog[0].id
}

export function App() {
  const [id, setId] = useState(currentId)
  const [brand, setBrand] = useState<(typeof brands)[number]["id"]>("neutral")

  useEffect(() => {
    const onHash = () => setId(currentId())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const entry = catalog.find((c) => c.id === id)!
  const Page = entry.page
  const vars = brands.find((b) => b.id === brand)!.vars

  // ブランドカラーは :root に設定し、ポータルで表示する Toast や Tooltip にも反映する。
  useEffect(() => {
    const root = document.documentElement
    for (const b of brands) for (const k of Object.keys(b.vars)) root.style.removeProperty(k)
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  }, [vars])

  // 画面全体を使うページ（業務アプリケーションの例）は、プレビューの見出しと幅の制限を付けずに表示する。
  if (entry.fullscreen) {
    return (
      <ToastProvider>
        <TooltipProvider>
          <div className="min-h-dvh bg-background text-foreground">
            <Page />
          </div>
          <Toaster />
        </TooltipProvider>
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
    <TooltipProvider>
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-4 px-6 pt-8">
        <nav aria-label="コンポーネント" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-ui">
          <span className="font-semibold">Flow Design</span>
          {catalog.map((c) => (
            <a
              key={c.id}
              href={`#/${c.id}`}
              aria-current={c.id === id ? "page" : undefined}
              className="text-muted-foreground underline-offset-4 hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:underline"
            >
              {c.name}
            </a>
          ))}
        </nav>
        <fieldset className="flex items-center gap-4 text-ui">
          <legend className="sr-only">ブランドカラー</legend>
          <span aria-hidden="true" className="text-muted-foreground">
            ブランドカラー
          </span>
          {brands.map((b) => (
            <label key={b.id} className="flex min-h-10 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="brand"
                value={b.id}
                checked={brand === b.id}
                onChange={() => setBrand(b.id)}
                className="size-4 accent-[var(--primary)]"
              />
              {b.name}
            </label>
          ))}
        </fieldset>
      </header>
      <main className="mx-auto max-w-[960px] px-6 pt-12 pb-24">
        <Page />
      </main>
    </div>
    <Toaster />
    </TooltipProvider>
    </ToastProvider>
  )
}
