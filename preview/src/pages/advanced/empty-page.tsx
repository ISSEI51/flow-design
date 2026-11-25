import { useState } from "react"
import { CircleCheck, CloudOff, Plus, SearchX, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

import { Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

export function EmptyPage() {
  const [retried, setRetried] = useState(0)
  return (
    <article>
      <PageHeader
        name="Empty"
        lead="データがない理由と、次に行う操作を示す。取得の失敗は、データが 0 件の状態と区別する。"
      />

      <Section title="状態による使い分け" lead="次に行う操作があるときだけ、ボタンを置く。">
        <Row label="データ未登録" note="最初の登録を促す">
          <Empty data-testid="empty-none" status="empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>顧客がまだ登録されていません</EmptyTitle>
              <EmptyDescription>最初の顧客を登録すると、ここに一覧が表示されます。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button>
                <Plus />
                顧客を登録
              </Button>
              <Button variant="secondary">CSV から取り込む</Button>
            </EmptyContent>
          </Empty>
        </Row>
        <Row label="検索結果なし" note="条件の変更・解除を促す">
          <Empty data-testid="empty-no-results" status="no-results">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>条件に一致する顧客がいません</EmptyTitle>
              <EmptyDescription>「東京都」「休眠」の条件で検索しました。条件を減らすと見つかる場合があります。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="secondary">条件をリセット</Button>
            </EmptyContent>
          </Empty>
        </Row>
        <Row label="対応すべき項目なし" note="正常な状態。操作は置かない">
          <Empty data-testid="empty-complete" status="complete">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleCheck />
              </EmptyMedia>
              <EmptyTitle>承認待ちの申請はありません</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </Row>
        <Row label="取得失敗" note="原因と再試行の手段を示す。0 件とは表現を分ける">
          <Empty data-testid="empty-error" status="error">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CloudOff />
              </EmptyMedia>
              <EmptyTitle>顧客の一覧を読み込めませんでした</EmptyTitle>
              <EmptyDescription>
                サーバーに接続できませんでした。時間をおいて再試行してください。
                {retried > 0 && `（再試行 ${retried} 回目）`}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => setRetried((n) => n + 1)}>
                再試行
              </Button>
            </EmptyContent>
          </Empty>
        </Row>
      </Section>

      <Section title="要素の省略" lead="アイコン、説明、ボタンは必須ではない。タイトルだけでも伝わる場合は、それ以外を置かない。">
        <Row label="タイトルのみ">
          <Empty data-testid="empty-title-only">
            <EmptyHeader>
              <EmptyTitle>メモはありません</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </Row>
        <Row label="狭い表示領域" note="アイコンを省略し、文字だけにする">
          <div className="w-60 rounded-md border border-border" data-testid="empty-narrow">
            <Empty className="px-4 py-6">
              <EmptyHeader>
                <EmptyTitle className="text-body font-semibold">通知はありません</EmptyTitle>
                <EmptyDescription>新しい通知が届くと、ここに表示されます。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </Row>
        <Row label="長い文章" note="中央にそろえ、30rem で折り返す">
          <Empty data-testid="empty-long">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>2026年度上期の全国営業所別の売上実績に一致するデータが見つかりませんでした</EmptyTitle>
              <EmptyDescription>
                No records match the selected fiscal period, sales offices, and product lines. Try widening the period or removing some of the filters.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="secondary">条件をリセット</Button>
            </EmptyContent>
          </Empty>
        </Row>
      </Section>
    </article>
  )
}
