import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  CursorPagination,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationControls,
} from "@/components/ui/pagination"

import { fetchCustomersByCursor } from "../../data/data-display/customers"
import { PageHeader } from "../../layout/page-header"
import { Row, Section } from "../../layout/section"

function Controlled({ total, testId, initialPage = 1, initialSize = 50 }: { total?: number; testId: string; initialPage?: number; initialSize?: number }) {
  const [page, setPage] = useState(initialPage)
  const [size, setSize] = useState(initialSize)
  return (
    <div data-testid={testId} className="w-full">
      <PaginationControls
        page={page}
        pageSize={size}
        totalCount={total}
        hasNextPage={total === undefined ? page < 4 : undefined}
        onPageChange={setPage}
        onPageSizeChange={(s, p) => {
          setSize(s)
          setPage(p)
        }}
      />
      <p className="mt-2 text-caption text-muted-foreground" data-testid={`${testId}-state`}>
        page={page} pageSize={size}
      </p>
    </div>
  )
}

// 絞り込みで総件数が減る例。存在しないページは表示しない。
function Shrinking() {
  const [total, setTotal] = useState(580)
  const [page, setPage] = useState(12)
  return (
    <div data-testid="pagination-shrink" className="w-full">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setTotal(580)}>
          580件
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTotal(130)} data-testid="pagination-shrink-130">
          絞り込み（130件）
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTotal(0)} data-testid="pagination-shrink-0">
          絞り込み（0件）
        </Button>
      </div>
      <PaginationControls page={page} pageSize={50} totalCount={total} onPageChange={setPage} />
      <p className="mt-2 text-caption text-muted-foreground" data-testid="pagination-shrink-state">
        page={page}
      </p>
    </div>
  )
}

function Cursor() {
  const [cursor, setCursor] = useState<string | null>(null)
  const [size, setSize] = useState(25)
  const result = fetchCustomersByCursor(cursor, size)
  return (
    <div data-testid="pagination-cursor" className="w-full">
      <CursorPagination
        hasPrevious={result.prev !== null}
        hasNext={result.next !== null}
        onPrevious={() => setCursor(result.prev)}
        onNext={() => setCursor(result.next)}
        shownCount={result.rows.length}
        pageSize={size}
        onPageSizeChange={(s) => {
          setSize(s)
          setCursor(null)
        }}
      />
      <p className="mt-2 text-caption text-muted-foreground" data-testid="pagination-cursor-state">
        先頭：{result.rows[0]?.id}
      </p>
    </div>
  )
}

// プレビューでは移動しない。製品ではルーターのリンクとして使う。
const stay = (e: { preventDefault: () => void }) => e.preventDefault()

export function PaginationPage() {
  return (
    <article>
      <PageHeader
        name="Pagination"
        lead="多くのデータの中で、いまどこを見ているかと全体の量を示しながら移動する。表の下に置く。"
      />

      <Section title="標準の組み合わせ" lead="表示範囲と総件数、表示件数、ページ番号、前後の移動。表示件数の初期値は 50 件。">
        <Row label="少ないページ" note="ページ数が 7 以下なら、すべてのページを並べる">
          <Controlled total={180} testId="pagination-few" />
        </Row>
        <Row label="多いページ" note="省略記号を使う。並びの長さを一定にし、押す位置を動かさない。最初と最後への移動を付ける">
          <Controlled total={5800} initialPage={20} testId="pagination-many" />
        </Row>
        <Row label="最初・最後のページ" note="前へ（最初）と次へ（最後）を無効にする">
          <div className="flex w-full flex-col gap-6">
            <Controlled total={580} testId="pagination-first" />
            <Controlled total={580} initialPage={12} testId="pagination-last" />
          </div>
        </Row>
      </Section>

      <Section title="件数の変化" lead="表示件数を変えたときは、表示していた先頭の項目を含むページへ移る。絞り込みでページ数が減ったときは、存在するページへ移る。">
        <Row label="総件数が減る" note="12 ページ目を表示中に絞り込む">
          <Shrinking />
        </Row>
        <Row label="0 件" note="範囲の代わりに 0 件と示し、移動を無効にする">
          <Controlled total={0} testId="pagination-zero" />
        </Row>
      </Section>

      <Section title="総件数がわからないとき" lead="取得していない総件数、ページ数、現在の位置を推測して表示しない。">
        <Row label="総件数不明" note="現在のページの範囲だけを示す。次のページがあるかはサーバーが返す">
          <Controlled testId="pagination-unknown" />
        </Row>
        <Row label="カーソル" note="総件数の取得に時間がかかる大きなデータ。前後だけに移動する">
          <Cursor />
        </Row>
      </Section>

      <Section title="部品" lead="shadcn/ui と同じ部品で組み立てることもできる。URL でページを表す場合は href を渡し、<a> で描画する。">
        <Row label="リンク" note="href がある場合は <a>、ない場合は <button>">
          <Pagination data-testid="pagination-links">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="?page=1" onClick={stay} />
              </PaginationItem>
              {[1, 2, 3].map((n) => (
                <PaginationItem key={n}>
                  <PaginationLink href={`?page=${n}`} onClick={stay} isActive={n === 2} aria-label={`${n}ページ目`}>
                    {n}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext href="?page=3" onClick={stay} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </Row>
      </Section>
    </article>
  )
}
