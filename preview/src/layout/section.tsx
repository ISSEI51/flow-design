import type { ReactNode } from "react"

// プレビュー専用の配置部品。コンポーネントの見た目は持たない。

export function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="mt-16 first:mt-0">
      <h2 className="text-section">{title}</h2>
      {lead && <p className="mt-2 max-w-[40rem] text-body text-muted-foreground">{lead}</p>}
      <div className="mt-8">{children}</div>
    </section>
  )
}

export function Row({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-t border-border py-6 first:border-t-0 first:pt-0 sm:grid-cols-[12rem_1fr]">
      <div>
        <p className="text-ui font-medium">{label}</p>
        {note && <p className="mt-1 text-caption text-muted-foreground">{note}</p>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-4">{children}</div>
    </div>
  )
}

export function Compare({ bad, good, badNote, goodNote }: { bad: ReactNode; good: ReactNode; badNote: string; goodNote: string }) {
  return (
    <div className="grid gap-8 border-t border-border py-6 first:border-t-0 first:pt-0 sm:grid-cols-2">
      <div className="min-w-0">
        <p className="text-ui font-medium text-destructive">避ける</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">{bad}</div>
        <p className="mt-4 text-ui text-muted-foreground">{badNote}</p>
      </div>
      <div className="min-w-0">
        <p className="text-ui font-medium text-success">使う</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">{good}</div>
        <p className="mt-4 text-ui text-muted-foreground">{goodNote}</p>
      </div>
    </div>
  )
}
