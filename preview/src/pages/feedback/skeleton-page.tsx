import { useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const customers = [
  { name: "山田商事株式会社", contact: "山田 花子", status: "送信済み" },
  { name: "北斗システム株式会社", contact: "佐藤 健", status: "未送信" },
  { name: "Aoba Trading Co., Ltd.", contact: "Hanako Yamada", status: "送信済み" },
]

// 行の高さを、読み込み前と後でそろえる（64px）
function CustomerRow({ c }: { c?: (typeof customers)[number] }) {
  return (
    <li className="flex h-16 items-center gap-3 border-b border-border">
      {c ? (
        <>
          <Avatar>
            <AvatarFallback>{c.contact[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-ui font-medium">{c.name}</p>
            <p className="truncate text-caption text-muted-foreground">{c.contact}</p>
          </div>
          <Badge variant={c.status === "送信済み" ? "success" : "neutral"}>{c.status}</Badge>
        </>
      ) : (
        <>
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-48 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </>
      )}
    </li>
  )
}

export function SkeletonPage() {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loaded")
  const load = (result: "loaded" | "error") => {
    setState("loading")
    window.setTimeout(() => setState(result), 1500)
  }
  return (
    <article>
      <PageHeader
        name="Skeleton"
        lead="読み込み中に、読み込み後の画面の構造を示す。控えめに明滅し、動きを減らす設定では止まる。"
      />

      <Section title="読み込みの切り替え" lead="読み込み後と同じ大きさで並べ、表示が切り替わってもレイアウトを動かさない。">
        <Row label="顧客一覧" note="読み込みは 1.5 秒">
          <div className="w-full max-w-lg">
            <div className="flex gap-2">
              <Button data-testid="skeleton-load" variant="secondary" size="sm" onClick={() => load("loaded")}>
                読み込む
              </Button>
              <Button data-testid="skeleton-fail" variant="secondary" size="sm" onClick={() => load("error")}>
                読み込みを失敗させる
              </Button>
            </div>
            <section
              aria-label="顧客一覧"
              aria-busy={state === "loading"}
              data-testid="skeleton-list"
              className="mt-4"
            >
              <p role="status" className="sr-only">
                {state === "loading" ? "顧客一覧を読み込んでいます" : ""}
              </p>
              {state === "error" ? (
                <p data-testid="skeleton-error" className="flex h-48 items-center text-ui text-destructive">
                  顧客一覧を読み込めませんでした。通信の状態を確認して、もう一度読み込んでください。
                </p>
              ) : (
                <ul data-testid="skeleton-rows">
                  {customers.map((c) => (
                    <CustomerRow key={c.name} c={state === "loading" ? undefined : c} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Row>
      </Section>

      <Section title="形">
        <Row label="読み込み後の形に合わせる" note="文字は角丸 8px、Avatar は円、Badge は Full Radius">
          <Skeleton data-testid="skeleton-sample" className="h-4 w-40 rounded-sm" />
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={<Skeleton className="h-24 w-full" />}
          badNote="読み込み後の構造と関係のない大きな四角。表示が切り替わると配置が動く。"
          good={
            <ul className="w-full">
              <CustomerRow />
            </ul>
          }
          goodNote="読み込み後の行と同じ構造と高さにする。"
        />
      </Section>
    </article>
  )
}
