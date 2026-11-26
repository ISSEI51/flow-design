import { useState, type ReactNode } from "react"
import { ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils"

// App Structure の資料のページで使う、プレビュー専用の部品。Registry には含めない。

// 実際の画面を iframe で表示する枠。iframe の中は独立した画面の幅で描画されるため、
// メディアクエリ（Sidebar のモバイルの表示など）も実際の画面と同じに動く。
export function ShellFrame({
  src,
  title,
  testId,
  defaultDevice = "desktop",
  height = 640,
}: {
  src: string
  title: string
  testId?: string
  defaultDevice?: "desktop" | "mobile"
  height?: number
}) {
  const [device, setDevice] = useState(defaultDevice)
  const name = `device-${testId ?? title}`
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <fieldset className="flex flex-wrap items-center gap-x-4 text-ui">
          <legend className="sr-only">{title}の表示の幅</legend>
          {(
            [
              ["desktop", "デスクトップ"],
              ["mobile", "モバイル（390px）"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="flex min-h-10 cursor-pointer items-center gap-2">
              <input type="radio" name={name} value={v} checked={device === v} onChange={() => setDevice(v)} className="size-4 accent-[var(--primary)]" />
              {l}
            </label>
          ))}
        </fieldset>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center gap-2 rounded-xs text-ui underline underline-offset-4 outline-none focus-visible:focus-ring"
        >
          全画面で開く
          <ExternalLink aria-hidden="true" className="size-4" />
          <span className="sr-only">（新しいタブ）</span>
        </a>
      </div>
      <div className={cn("min-w-0 overflow-hidden rounded-xl border border-border", device === "mobile" && "w-[390px] max-w-full")}>
        <iframe title={title} src={src} className="block w-full" style={{ height: device === "mobile" ? 720 : height }} />
      </div>
    </div>
  )
}

// 構造の模式図。線と面だけで、画面の領域の関係を示す。
export function Schematic({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div role="img" aria-label={label} className={cn("flex h-36 overflow-hidden rounded-md border border-border bg-background", className)}>
      {children}
    </div>
  )
}

export const S = {
  sidebar: "w-1/4 shrink-0 bg-sidebar",
  header: "h-5 shrink-0 bg-sidebar",
  line: "h-1.5 rounded-full bg-border",
  strong: "h-2 rounded-full bg-muted-foreground/60",
}

export function SchematicLines({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col gap-2 p-3", className)}>
      <div className={cn(S.strong, "w-1/3")} />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn(S.line, i % 2 ? "w-3/4" : "w-full")} />
      ))}
    </div>
  )
}

// 資料の中の例を置く領域。境界線は資料の枠であり、Pattern の一部ではない。
export function Example({ children, className, label, testId }: { children: ReactNode; className?: string; label?: string; testId?: string }) {
  return (
    <div data-testid={testId} className={cn("min-w-0 rounded-xl border border-border p-6", className)}>
      {label && <p className="mb-4 text-caption text-muted-foreground">{label}</p>}
      {children}
    </div>
  )
}

export function Code({ children }: { children: string }) {
  return (
    <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-4 text-caption leading-relaxed">
      <code>{children}</code>
    </pre>
  )
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-ui">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}
