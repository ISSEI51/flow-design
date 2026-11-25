import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { ArrowLeft, House } from "lucide-react"

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

// プレビューの中ではページを移動しない。製品ではルーティングのライブラリのリンクを render に渡す。
const stay = (e: MouseEvent) => e.preventDefault()

function Home() {
  return (
    <BreadcrumbItem>
      <BreadcrumbLink href="#/breadcrumb" onClick={stay} aria-label="ホーム">
        <House />
      </BreadcrumbLink>
    </BreadcrumbItem>
  )
}

function Level({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <>
      <BreadcrumbItem>
        <BreadcrumbLink href="#/breadcrumb" onClick={stay} data-first={first || undefined}>
          {children}
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
    </>
  )
}

const deepPath = ["顧客", "株式会社山田商事", "契約", "C-2026-0142", "請求書"]

function DeepBreadcrumb() {
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLElement>(null)
  // 現在位置と直近の親を残し、間の階層を省略する。
  const hidden = deepPath.slice(0, -2)
  const shown = expanded ? deepPath : deepPath.slice(-2)
  // 展開すると押したボタンがなくなるため、表示した最初の階層へフォーカスを移す。
  useEffect(() => {
    if (expanded) ref.current?.querySelector<HTMLElement>("[data-first]")?.focus()
  }, [expanded])
  return (
    <Breadcrumb ref={ref} data-testid="breadcrumb-deep">
      <BreadcrumbList>
        <Home />
        <BreadcrumbSeparator />
        {!expanded && (
          <>
            <BreadcrumbItem>
              <BreadcrumbEllipsis
                data-testid="breadcrumb-expand"
                label={`省略した ${hidden.length} つの階層を表示`}
                render={<button type="button" onClick={() => setExpanded(true)} />}
              />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}
        {shown.map((name, i) => (
          <Level key={name} first={i === 0}>
            {name}
          </Level>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>2026年11月分</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function BreadcrumbPageDemo() {
  return (
    <article>
      <PageHeader
        name="Breadcrumb"
        lead="現在位置と、上位の階層との関係を示す。閲覧の履歴ではなく、情報の階層を表す。"
      />

      <Section title="基本" lead="ホームのアイコンと階層を並べる。上位の階層はリンク、現在位置は文字だけにする。">
        <Row label="標準" note="文字 14px、要素の間 8px、区切りは ChevronRight（16px）">
          <Breadcrumb data-testid="breadcrumb-basic">
            <BreadcrumbList>
              <Home />
              <BreadcrumbSeparator />
              <Level>顧客</Level>
              <BreadcrumbItem>
                <BreadcrumbPage data-testid="breadcrumb-current">株式会社山田商事</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Row>
        <Row label="英語" note="ホームのアイコンの名前も画面の言語に合わせる">
          <Breadcrumb aria-label="Breadcrumb">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#/breadcrumb" onClick={stay} aria-label="Home">
                  <House />
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <Level>Customers</Level>
              <BreadcrumbItem>
                <BreadcrumbPage>Yamada Trading Co., Ltd.</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Row>
      </Section>

      <Section
        title="深い階層"
        lead="間の階層を省略し、現在位置と直近の親を残す。省略した部分を押すと、すべての階層を表示する。"
      >
        <Row label="省略と展開">
          <DeepBreadcrumb />
        </Row>
      </Section>

      <Section title="モバイル" lead="横幅を超えないよう、狭い画面では間の階層を省略する。長いラベルは折り返す。">
        <Row label="狭い画面で省略" note="640px 未満で、間の階層を省略する">
          <Breadcrumb data-testid="breadcrumb-responsive">
            <BreadcrumbList>
              <Home />
              <BreadcrumbSeparator />
              <BreadcrumbItem className="sm:hidden">
                <BreadcrumbEllipsis />
              </BreadcrumbItem>
              <BreadcrumbSeparator className="sm:hidden" />
              <BreadcrumbItem className="max-sm:hidden">
                <BreadcrumbLink href="#/breadcrumb" onClick={stay}>
                  顧客
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="max-sm:hidden" />
              <BreadcrumbItem className="max-sm:hidden">
                <BreadcrumbLink href="#/breadcrumb" onClick={stay}>
                  株式会社山田商事
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="max-sm:hidden" />
              <Level>契約</Level>
              <BreadcrumbItem>
                <BreadcrumbPage>C-2026-0142</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Row>
        <Row label="長いラベル" note="日本語と英語">
          <div className="flex w-full max-w-sm flex-col gap-4">
            <Breadcrumb data-testid="breadcrumb-long">
              <BreadcrumbList>
                <Home />
                <BreadcrumbSeparator />
                <Level>北日本精密機械工業株式会社 札幌第二工場</Level>
                <BreadcrumbItem>
                  <BreadcrumbPage>2026年度 保守サービス契約（年間）</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Breadcrumb aria-label="Breadcrumb">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#/breadcrumb" onClick={stay} aria-label="Home">
                    <House />
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <Level>Global Precision Holdings Incorporated</Level>
                <BreadcrumbItem>
                  <BreadcrumbPage>Annual Maintenance Service Agreement 2026</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </Row>
      </Section>

      <Section
        title="浅い階層"
        lead="一覧と詳細の 2 階層だけの場合は、Breadcrumb の代わりに戻る操作を置いてよい。Sidebar で現在位置がわかる単純な一覧の画面では、どちらも置かない。"
      >
        <Row label="戻るリンク">
          <a
            href="#/breadcrumb"
            onClick={stay}
            data-testid="breadcrumb-back"
            className="inline-flex min-h-8 items-center gap-2 rounded-xs text-ui text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:focus-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            顧客一覧へ戻る
          </a>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <nav aria-label="パンくずリスト（悪い例）" className="text-ui text-muted-foreground">
              <a href="#/breadcrumb" onClick={stay} className="underline">
                検索結果
              </a>
              {" / "}
              <a href="#/breadcrumb" onClick={stay} className="underline">
                前のページ
              </a>
              {" / "}
              <a href="#/breadcrumb" onClick={stay} className="text-foreground underline">
                株式会社山田商事
              </a>
            </nav>
          }
          badNote="閲覧の履歴を並べ、現在位置もリンクにする。どの階層にいるのかがわからず、押しても同じページが開く。"
          good={
            <Breadcrumb aria-label="パンくずリスト（良い例）">
              <BreadcrumbList>
                <Home />
                <BreadcrumbSeparator />
                <Level>顧客</Level>
                <BreadcrumbItem>
                  <BreadcrumbPage>株式会社山田商事</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          }
          goodNote='情報の階層を並べ、現在位置は aria-current="page" の文字にする。'
        />
      </Section>
    </article>
  )
}
