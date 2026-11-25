import { Download, Info, Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

function Tip({ label, children, testid }: { label: string; children: React.ReactNode; testid?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children as React.ReactElement} />
      <TooltipContent data-testid={testid}>{label}</TooltipContent>
    </Tooltip>
  )
}

export function TooltipPage() {
  return (
    <article>
      <PageHeader
        name="Tooltip"
        lead="アイコンや操作に補足を添える。ポインターを 700ms 重ねるか、キーボードでフォーカスすると表示する。Esc で閉じる。"
      />

      <Section title="基本" lead="タッチ操作では表示されない。Tooltip がなくても意味がわかる操作に添える。">
        <Row label="アイコンだけのボタン" note="名前は aria-label で付け、Tooltip は見える補足にする">
          <Tip label="編集" testid="tooltip-edit">
            <Button data-testid="tooltip-trigger" size="icon" variant="ghost" aria-label="編集">
              <Pencil />
            </Button>
          </Tip>
          <Tip label="CSV で書き出す">
            <Button size="icon" variant="ghost" aria-label="CSV で書き出す">
              <Download />
            </Button>
          </Tip>
          <Tip label="削除">
            <Button size="icon" variant="ghost" aria-label="削除">
              <Trash2 />
            </Button>
          </Tip>
        </Row>
        <Row label="長い文字" note="最大 320px で折り返す">
          <Tip
            testid="tooltip-long"
            label="締め日の翌営業日に、前月分の請求書をまとめて作成します。Invoices are created on the next business day."
          >
            <Button data-testid="tooltip-long-trigger" size="icon" variant="ghost" aria-label="請求書の作成日について">
              <Info />
            </Button>
          </Tip>
        </Row>
        <Row label="画面の端" note="はみ出す場合は表示する向きを変える">
          <div className="flex w-full justify-end">
            <Tip testid="tooltip-edge" label="右端に置いたボタンの補足は、画面の内側に収める">
              <Button data-testid="tooltip-edge-trigger" size="icon-sm" variant="ghost" aria-label="右端の補足">
                <Info />
              </Button>
            </Tip>
          </div>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Tip label="パスワードは 12 文字以上で、数字を含めてください">
              <Button variant="secondary">パスワードの条件</Button>
            </Tip>
          }
          badNote="入力に必要な条件を Tooltip だけで伝えている。タッチ操作では読めない。"
          good={<p className="text-ui text-muted-foreground">パスワードは 12 文字以上で、数字を含める。</p>}
          goodNote="操作に必要な説明は、画面に文字で示す。"
        />
      </Section>
    </article>
  )
}
