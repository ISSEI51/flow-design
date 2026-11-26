import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils"

// Data Browsing の資料のページで使う、プレビュー専用の部品。Registry には含めない。

// 比較の図（避ける・使う）。操作できない見本のため、操作とフォーカスの対象にしない（inert）。
// 内容は説明の文（Compare の note）で伝える。
export function Mock({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <figure className={cn("w-full min-w-0", className)}>
      <div inert aria-hidden="true" className="pointer-events-none flex w-full min-w-0 flex-col gap-3 rounded-md border border-border p-4 select-none">
        {children}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  )
}

// 実際の画面（検証画面）を新しいタブで開くリンク。
export function AppLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-10 items-center gap-2 rounded-xs text-ui underline underline-offset-4 outline-none focus-visible:focus-ring"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-4" />
      <span className="sr-only">（新しいタブ）</span>
    </a>
  )
}

// 例の操作（検証のための設定）。例そのものとは区別する。
export function DemoControls({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui">
      <legend className="mb-1 font-medium">{legend}</legend>
      {children}
    </fieldset>
  )
}

export function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-4 accent-[var(--primary)]" />
      {children}
    </label>
  )
}

// 例の領域。境界線は資料の枠であり、Pattern の一部ではない。Container Query の基準（@container/page）にする。
// 狭い画面では、資料のページの余白（24px）の内側に枠を置くと Pagination が収まらないため、枠を外して左右に 8px 広げる。
export function DemoFrame({ children, testId, className }: { children: ReactNode; testId?: string; className?: string }) {
  return (
    <div data-testid={testId} className={cn("@container/page min-w-0 max-sm:-mx-2 sm:rounded-xl sm:border sm:border-border sm:p-6", className)}>
      {children}
    </div>
  )
}

export function Rules({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 text-ui sm:grid-cols-[12rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-medium">{k}</dt>
          <dd className="text-muted-foreground [word-break:auto-phrase]">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
