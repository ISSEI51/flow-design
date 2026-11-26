import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTableAppliedFilters, DataTableSearch } from "@/components/ui/data-table"
import { Field, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { useBrowseData } from "@/patterns/browse-data"
import { countActiveFilters, useBrowseQuery } from "@/patterns/browse-query"

import { customers, regions } from "../../data/data-display/customers"
import { companyServer } from "../../data/data-browsing/company-server"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { CompanyBrowser } from "./company-browser"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "./doc-parts"

// ---------------------------------------------------------------- 入力値と適用した検索語
// サーバー側の検索（300ms の Debounce）と、クライアント側の軽い検索（待たない）を切り替えて、違いを示す。
function SearchStateDemo() {
  const [mode, setMode] = useState<"server" | "client">("server")
  const browse = useBrowseQuery({ defaultFilters: {}, debounceMs: mode === "server" ? 300 : 0 })
  const requests = useRef(0)
  const [log, setLog] = useState<string[]>([])
  // 模擬の要求。応答の時間を検索語ごとに変え、後に送った要求が先に返る場合を再現する（古い応答は表示しない）。
  const data = useBrowseData({
    query: browse.query.search,
    queryKey: `${mode}:${browse.query.search}`,
    // この模擬の要求は、中止（signal）に従わず、古い要求も応答を返す。古い応答を表示しないことは、要求ごとの番号の判定で確かめる。
    fetcher: (search) => {
      requests.current++
      setLog((l) => [...l.slice(-4), search === "" ? "（空）" : search])
      const latency = mode === "client" ? 0 : search.length % 2 === 1 ? 1500 : 150
      return new Promise<number>((resolve) => {
        setTimeout(() => {
          ;(window as unknown as { __fdStaleResponses?: string[] }).__fdStaleResponses?.push(search)
          resolve(customers.filter((c) => c.company.includes(search)).length)
        }, latency)
      })
    },
  })
  return (
    <DemoFrame testId="sf-search-state">
      <div className="flex flex-col gap-4">
        <DemoControls legend="検索の種類">
          <Radio name="sf-mode" checked={mode === "server"} onChange={() => setMode("server")}>
            サーバー側の検索（300ms 待つ）
          </Radio>
          <Radio name="sf-mode" checked={mode === "client"} onChange={() => setMode("client")}>
            クライアント側の軽い検索（待たない）
          </Radio>
        </DemoControls>
        <DataTableSearch
          data-testid="sf-search-input"
          className="sm:max-w-80"
          placeholder="会社名で検索"
          value={browse.searchInput}
          onValueChange={browse.setSearchInput}
        />
        <dl className="grid gap-x-6 gap-y-2 text-ui sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">入力値</dt>
          <dd data-testid="sf-input-value">{browse.searchInput || "（空）"}</dd>
          <dt className="text-muted-foreground">適用した検索語</dt>
          <dd data-testid="sf-applied-value">{browse.query.search || "（空）"}</dd>
          <dt className="text-muted-foreground">要求した検索語</dt>
          <dd data-testid="sf-request-log">{log.join(" → ") || "（なし）"}</dd>
          <dt className="text-muted-foreground">結果</dt>
          <dd data-testid="sf-result" aria-live="polite">
            {data.isCurrent ? `${data.data!.toLocaleString("ja-JP")}件（「${browse.query.search}」の結果）` : "取得中"}
          </dd>
        </dl>
        <p className="text-caption text-muted-foreground">
          日本語の変換中は、入力値も適用した検索語も変わらない。変換を確定してから数える。奇数の文字数の検索語は応答を遅らせ、古い応答が新しい結果を上書きしないことを確かめられる。
        </p>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 少数の追加条件（Popover、即時適用）
type RegionFilters = { regions: string[] }

function PopoverFilterDemo() {
  // クライアント側の軽い絞り込み。条件は即時に適用し、検索は待たない（debounceMs: 0）。
  const browse = useBrowseQuery<RegionFilters>({ defaultFilters: { regions: [] }, debounceMs: 0 })
  const { search, filters } = browse.query
  const count = useMemo(
    () => customers.filter((c) => c.company.includes(search) && (filters.regions.length === 0 || filters.regions.includes(c.region))).length,
    [search, filters]
  )
  const searchRef = useRef<HTMLInputElement>(null)
  const active = countActiveFilters(filters, { regions: [] })
  return (
    <DemoFrame testId="sf-popover">
      <div className="flex flex-col gap-4">
        <div role="search" aria-label="顧客の検索と絞り込み（Popover の例）" className="flex flex-wrap items-center gap-3">
          <DataTableSearch ref={searchRef} className="sm:max-w-72" placeholder="会社名で検索" value={browse.searchInput} onValueChange={browse.setSearchInput} />
          <Popover>
            <PopoverTrigger render={<Button variant="outline" className="text-ui" data-testid="sf-popover-trigger" />}>
              <SlidersHorizontal />
              地域
              {/* 隠れている適用済みの条件の数を、追加の条件のボタンに示す */}
              {filters.regions.length > 0 && <span className="tabular-nums">（{filters.regions.length}）</span>}
              <ChevronDown />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(22.5rem,calc(100vw-2rem))]">
              <PopoverHeader>
                <PopoverTitle>地域</PopoverTitle>
              </PopoverHeader>
              <Field>
                <FieldSet>
                  <FieldLegend variant="label" className="sr-only">
                    地域
                  </FieldLegend>
                  <div className="grid grid-cols-2 gap-x-4">
                    {regions.map((r) => (
                      <FieldItem key={r}>
                        <Checkbox
                          checked={filters.regions.includes(r)}
                          onCheckedChange={(c) =>
                            browse.setFilters({ regions: c ? [...filters.regions, r] : filters.regions.filter((x) => x !== r) })
                          }
                        />
                        <FieldLabel>{r}</FieldLabel>
                      </FieldItem>
                    ))}
                  </div>
                </FieldSet>
              </Field>
            </PopoverContent>
          </Popover>
        </div>
        {(active > 0 || search) && (
          <div className="flex flex-wrap items-center gap-2">
            <DataTableAppliedFilters
              filters={filters.regions.map((r) => ({
                id: r,
                label: "地域",
                value: r,
                onRemove: () => browse.setFilters({ regions: filters.regions.filter((x) => x !== r) }),
              }))}
            />
            {active > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  // 条件だけを解除する（検索語は残す）
                  browse.resetFilters()
                  searchRef.current?.focus()
                }}
              >
                条件だけを解除
              </Button>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                browse.clearAll()
                searchRef.current?.focus()
              }}
            >
              検索語と条件をすべて解除
            </Button>
          </div>
        )}
        <p className="text-ui tabular-nums" data-testid="sf-popover-count" aria-live="polite">
          {count.toLocaleString("ja-JP")}件
        </p>
      </div>
    </DemoFrame>
  )
}

function ServerOptions() {
  const [count, setCount] = useState(companyServer.countMode)
  const [latency, setLatency] = useState(companyServer.latency.list)
  useEffect(() => {
    companyServer.countMode = count
    companyServer.latency.list = latency
    // ほかのページの例に設定を持ち越さない。
    return () => {
      companyServer.countMode = "exact"
      companyServer.latency.list = 600
    }
  }, [count, latency])
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-2">
      <DemoControls legend="件数（次の取得から）">
        <Radio name="sf-count" checked={count === "exact"} onChange={() => setCount("exact")}>
          正確な件数を返す
        </Radio>
        <Radio name="sf-count" checked={count === "unknown"} onChange={() => setCount("unknown")}>
          件数を返さない
        </Radio>
      </DemoControls>
      <DemoControls legend="応答までの時間">
        <Radio name="sf-latency" checked={latency === 600} onChange={() => setLatency(600)}>
          600ms
        </Radio>
        <Radio name="sf-latency" checked={latency === 2500} onChange={() => setLatency(2500)}>
          2.5 秒
        </Radio>
      </DemoControls>
    </div>
  )
}

export function SearchFilterPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Browsing"
        name="Search & Filter"
        lead="目的の情報を見つけるための検索、フィルター、ソート、ページ送り。検索欄とよく使う条件を常に見せ、使う頻度の低い条件はまとめる。入力中の条件と、適用した条件を分けて扱う。"
      />

      <Section title="操作できる例" lead="サーバー側の検索とページ送り。検索は入力が止まってから 300ms 後に適用し、その他の条件は Sheet でまとめて適用する。狭い画面では、検索欄以外の条件を Drawer にまとめる。">
        <div className="flex flex-col gap-6">
          <ServerOptions />
          <DemoFrame>
            <CompanyBrowser testId="sf-demo" workspace="hq" />
          </DemoFrame>
          <AppLink href="#/browsing-app?page=customers">検証画面（5 種類の組み合わせ）を開く</AppLink>
        </div>
      </Section>

      <Section title="入力値と、適用した検索語" lead="検索欄の入力値と、要求に使う検索語を分ける。変換中の文字では検索しない。古い要求の応答で、新しい結果を上書きしない。">
        <SearchStateDemo />
      </Section>

      <Section title="少数の追加条件" lead="条件が少ない場合は Popover にまとめ、選んだらすぐに適用する。検索語まで解除するのか、条件だけを解除するのかを、ボタンの名前で示す。">
        <PopoverFilterDemo />
      </Section>

      <Section title="判断基準">
        <Rules
          rows={[
            ["常に表示する", "検索欄と、よく使う条件（1〜3 個）。検索欄のプレースホルダーには検索の対象を書く（「会社名・電話番号で検索」）"],
            ["まとめる", "使う頻度の低い条件。少数なら Popover、多数なら Sheet、モバイルは Drawer か Sheet"],
            ["即時に適用する", "Select、Checkbox などの単純な条件（原則）"],
            ["まとめて適用する", "複数の条件を組み合わせる場合。編集中の条件を「適用する」で反映し、キャンセル、Escape、閉じる操作では破棄する"],
            ["Debounce", "サーバー側の検索は 300ms。クライアント側の軽い検索は待たない。高負荷・高コストな検索は検索ボタンで実行してよい"],
            ["1 ページ目に戻す", "検索語、フィルター、ソートを変えたとき。ページサイズの変更は、表示していた先頭の行を含むページへ移る（Pagination v0.1）"],
            ["件数", "正確な総件数がわかる場合だけ示す。わからない場合は表示中の範囲だけを示す。再取得中の件数は、薄い色にして新しい結果と区別する"],
          ]}
        />
      </Section>

      <Section title="適用中の条件">
        <Bullets
          items={[
            "常に表示している条件（Select の中に値が見える）は、Chip に重複して表示しない。",
            "まとめた条件（隠れている条件）だけを Chip で示し、個別に解除できるようにする。Chip は状態を示す Badge と区別し、解除の名前（「地域：関東の条件を解除」）と押せる範囲を持たせる。",
            "条件がないときは、Chip も解除のボタンも表示しない。",
          ]}
        />
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="Select に見えている契約状況を、Chip にも重複して表示した例">
              <div className="flex gap-2 text-ui">
                <span className="rounded-lg border border-input px-3 py-2">契約状況：契約中</span>
                <span className="rounded-lg border border-input px-3 py-2">その他の条件</span>
              </div>
              <div className="flex gap-2 text-ui">
                <span className="rounded-sm bg-secondary px-3 py-1">契約状況：契約中 ×</span>
                <span className="rounded-sm bg-secondary px-3 py-1">地域：関東 ×</span>
              </div>
            </Mock>
          }
          badNote="見えている条件を Chip にも並べると、同じ情報を 2 回読むことになる。"
          good={
            <Mock label="隠れている地域の条件だけを Chip で示した例">
              <div className="flex gap-2 text-ui">
                <span className="rounded-lg border border-input px-3 py-2">契約状況：契約中</span>
                <span className="rounded-lg border border-input px-3 py-2">その他の条件（1）</span>
              </div>
              <div className="flex gap-2 text-ui">
                <span className="rounded-sm bg-secondary px-3 py-1">地域：関東 ×</span>
              </div>
            </Mock>
          }
          goodNote="隠れている条件だけを示し、追加の条件のボタンに件数を添える。"
        />
        <Compare
          bad={
            <Mock label="総件数がわからないのに、約 1,000 件と表示した例">
              <p className="text-ui">約 1,000件</p>
            </Mock>
          }
          badNote="架空の件数は、判断を誤らせる。"
          good={
            <Mock label="総件数がわからないため、表示中の範囲だけを示した例">
              <p className="text-ui">1〜20件目を表示中</p>
            </Mock>
          }
          goodNote="わかっている範囲だけを示し、次のページの有無で移動を制御する。"
        />
        <Compare
          bad={
            <Mock label="プレースホルダーが「検索」だけの検索欄">
              <span className="rounded-lg border border-input px-4 py-3 text-ui text-muted-foreground">検索</span>
            </Mock>
          }
          badNote="何で検索できるかがわからない。"
          good={
            <Mock label="プレースホルダーが「会社名・電話番号で検索」の検索欄">
              <span className="rounded-lg border border-input px-4 py-3 text-ui text-muted-foreground">会社名・電話番号で検索</span>
            </Mock>
          }
          goodNote="検索の対象を、利用者の言葉で書く。"
        />
      </Section>
    </article>
  )
}
