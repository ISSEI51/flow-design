import { Check, Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

export function BadgePage() {
  return (
    <article>
      <PageHeader name="Badge" lead="状態や分類を短い文字で示す。背景は透明で、文字と境界線に意味の色を使う。操作には使わない。" />

      <Section title="種類" lead="意味ごとに色を決めている。色だけで伝えず、必ず文字で状態を示す。">
        <Row label="Neutral" note='variant="neutral"（既定）。分類、未設定'>
          <Badge data-testid="badge-neutral">未設定</Badge>
          <Badge>製造業</Badge>
        </Row>
        <Row label="Success" note="成功、正常、完了">
          <Badge data-testid="badge-success" variant="success">送信済み</Badge>
        </Row>
        <Row label="Warning" note="注意、期限接近">
          <Badge data-testid="badge-warning" variant="warning">期限まで 3 日</Badge>
        </Row>
        <Row label="Destructive" note="エラー、失敗、危険">
          <Badge data-testid="badge-destructive" variant="destructive">送信失敗</Badge>
        </Row>
        <Row label="Info" note="情報、処理中">
          <Badge data-testid="badge-info" variant="info">処理中</Badge>
        </Row>
        <Row label="アイコンつき" note="文字の意味を補う場合だけ">
          <Badge variant="success">
            <Check aria-hidden="true" />
            入金済み
          </Badge>
          <Badge variant="info">
            <Clock aria-hidden="true" />
            確認待ち
          </Badge>
        </Row>
      </Section>

      <Section title="長い文字">
        <Row label="日本語・英語" note="省略せずに折り返す">
          <div className="flex w-48 flex-col items-start gap-2" data-testid="badge-long-container">
            <Badge data-testid="badge-long" variant="warning">
              支払期限を過ぎた請求書があります
            </Badge>
            <Badge variant="info">Waiting for approval from the finance team</Badge>
          </div>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <>
              <Badge variant="success">製造業</Badge>
              <Badge variant="destructive">小売業</Badge>
            </>
          }
          badNote="状態ではない分類に、成功や危険の色を使っている。"
          good={
            <>
              <Badge>製造業</Badge>
              <Badge>小売業</Badge>
            </>
          }
          goodNote="分類は Neutral にする。"
        />
        <Compare
          bad={
            <Badge variant="info" render={<button type="button" />}>
              絞り込む
            </Badge>
          }
          badNote="Badge を操作に使っている。押せるかどうかがわからない。"
          good={<Badge variant="info">処理中</Badge>}
          goodNote="Badge は状態の表示に限る。操作には Button を使う。"
        />
      </Section>
    </article>
  )
}
