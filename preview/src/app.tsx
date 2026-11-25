import { useEffect, useState, type CSSProperties } from "react"

import { catalog } from "./catalog"

const brands = [
  { id: "neutral", name: "標準", vars: {} },
  { id: "blue", name: "青", vars: { "--primary": "#1d4ed8", "--primary-foreground": "#ffffff" } },
  { id: "violet", name: "紫", vars: { "--primary": "#6d28d9", "--primary-foreground": "#ffffff" } },
] as const

function currentId() {
  const id = window.location.hash.replace("#/", "")
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

  return (
    <div style={vars as CSSProperties} className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-4 px-6 pt-8">
        <nav aria-label="コンポーネント" className="flex items-center gap-6 text-ui">
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
  )
}
