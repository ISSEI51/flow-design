import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"

import { usePi } from "./pi-context"

// 横断の検証画面の小さな部品（製品側のコード）。

/** 階層の現在地。リンクは移動の確認（未保存の変更）を通す */
export function PiBreadcrumb({ items, current }: { items: { label: string; href: string }[]; current: string }) {
  const { nav } = usePi()
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((it) => (
          <span key={it.href} className="contents">
            <BreadcrumbItem>
              <BreadcrumbLink {...nav.linkProps(it.href)}>{it.label}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </span>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** 定義の一覧（詳細の項目） */
export function Facts({ items, testId }: { items: { label: string; value: React.ReactNode; testId?: string }[]; testId?: string }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-ui sm:grid-cols-[10rem_1fr]" data-testid={testId}>
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="text-muted-foreground">{it.label}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]" data-testid={it.testId}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
