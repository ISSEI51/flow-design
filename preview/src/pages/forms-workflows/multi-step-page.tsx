import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { StepItem } from "@/patterns/step-flow"
import { Stepper } from "@/patterns/stepper"

import { PageHeader } from "../../layout/page-header"
import { Compare, Row, Section } from "../../layout/section"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoFrame, Mock, Rules } from "../data-browsing/doc-parts"
import { ContractWizard, seedStaleDraft } from "./contract-wizard"
import { ServerModes } from "./doc-parts"

const sample: StepItem[] = [
  { id: "type", label: "契約の種類", index: 0, status: "complete", reachable: true },
  { id: "customer", label: "顧客", index: 1, status: "complete", reachable: true },
  { id: "terms", label: "契約の内容", index: 2, status: "current", reachable: false },
  { id: "payment", label: "支払い", index: 3, status: "needs-review", reachable: false },
  { id: "review", label: "確認", index: 4, status: "upcoming", reachable: false },
]
const unknownTotal: StepItem[] = [{ id: "type", label: "契約の種類", index: 0, status: "current", reachable: false }]

export function MultiStepPage() {
  const [key, setKey] = useState(0)
  const draftKey = "preview:multi-step:contract-new"
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Forms & Workflows"
        name="Multi-step Workflow"
        lead="異なる判断や処理を順に行う作業だけを、意味のある単位のステップに分ける。次へは現在のステップが完了したときだけ進み、戻るはいつでもできる。入力はステップをまたいで残す。"
      />

      <Section title="操作できる例" lead="契約の登録。契約の種類で後のステップが変わる。エンタープライズを選ぶと支払いは請求書だけになり、クレジットカードを選んでいた場合は支払いが要確認になる。">
        <div className="flex flex-col gap-6">
          <ServerModes keys={["saveMode"]} name="ms" />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="max-w-full"
              onClick={async () => {
                await seedStaleDraft(draftKey)
                setKey((k) => k + 1)
              }}
              data-testid="ms-seed-draft"
            >
              提供を終えたプランを含む下書きを用意する
            </Button>
          </div>
          <DemoFrame testId="ms-demo">
            <ContractWizard key={key} draftKey={draftKey} idPrefix="ms" onCancel={() => setKey((k) => k + 1)} />
          </DemoFrame>
          <AppLink href="#/forms-app?page=contract-new">検証画面で、途中の離脱と下書きからの再開を試す</AppLink>
        </div>
      </Section>

      <Section title="Stepper">
        <Row label="横型" note="上部に置く。標準">
          <div className="w-full">
            <Stepper items={sample} total={5} layout="horizontal" aria-label="横型の例" />
          </div>
        </Row>
        <Row label="縦型" note="ステップが多い、横に余裕がある">
          <Stepper items={sample} total={5} layout="vertical" aria-label="縦型の例" />
        </Row>
        <Row label="簡易" note="狭い画面。auto は領域が 36rem より狭いとこの形になる">
          <div className="w-full max-w-sm">
            <Stepper items={sample} total={5} layout="compact" aria-label="簡易の例" data-testid="ms-compact" />
          </div>
        </Row>
        <Row label="総数が決まっていない" note="分岐の前。架空の総数を示さない">
          <div className="flex w-full flex-col gap-6">
            <Stepper items={unknownTotal} total={null} layout="horizontal" aria-label="総数が決まっていない例" />
            <div className="max-w-sm">
              <Stepper items={unknownTotal} total={null} layout="compact" aria-label="総数が決まっていない簡易の例" />
            </div>
          </div>
        </Row>
      </Section>

      <Section title="移動の規則">
        <Rules
          rows={[
            ["次へ", "現在のステップの必須の項目と検証が完了したときだけ押せる（Primary）"],
            ["戻る", "入力の妥当性に関係なく戻れる（Secondary）。入力は残る。キャンセル（Ghost）はワークフローの全体をやめる操作で、戻るとは分ける"],
            ["完了したステップ", "Stepper から直接移れる"],
            ["未到達のステップ", "直接移れない。到達したことがあっても、手前に完了していないステップがあれば移れない（検証と前提条件を飛ばせない）"],
            ["移動の後", "ステップの見出しにフォーカスを移す"],
            ["前のステップの変更", "影響を受ける項目だけを確かめ直す。無関係な入力は消さない。完了していたステップが完了でなくなったら「要確認」にし、完了として扱わない。値を変える必要がある場合は理由を示す"],
            ["最終の送信", "すべてのステップを確かめ直す。完了していないステップがあれば、そのステップへ移る"],
          ]}
        />
      </Section>

      <Section title="分岐、最終の確認、途中の処理">
        <Bullets
          items={[
            "単一のページで自然に終わる場合は分けない。項目が多いことだけを理由にステップにしない。",
            "不要なステップは省く。分岐で総数が決まらない間は「ステップ 1」とだけ示し、進捗率も示さない。不要になったステップの値は送信しない（値は残す）。",
            "最終の確認は、契約、決済、申請など、内容を確かめる価値がある場合だけ置く。読みやすい閲覧の形で、まとまりごとに入力のステップへ戻れるようにする。最終の確認の後に、同じ内容の確認の Dialog を重ねない。",
            "正式な登録は最終のステップで行う。本人確認やファイルのアップロードなど、途中で処理を確定する必要がある場合は、そのステップの完了と正式な登録の完了を分けて示し、確定したことを戻る操作で取り消せるように見せない。",
            "二重の実行を防ぎ、最終の処理が失敗したら入力を残す。",
            "長いワークフローでは下書きを用意し、再開のときに入力、現在のステップ、到達したステップを戻す。再開の時点の権限、選択肢、契約の条件で確かめ直す。",
          ]}
        />
      </Section>

      <Section title="比較">
        <Compare
          bad={
            <Mock label="Tabs で手順を示し、進捗率を表示した例">
              <div className="flex gap-4 border-b border-border text-caption">
                <span className="border-b-2 border-foreground pb-1">基本</span>
                <span className="pb-1 text-muted-foreground">詳細</span>
                <span className="pb-1 text-muted-foreground">支払い</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 w-1/3 rounded-full bg-primary" />
              </div>
              <span className="text-caption text-muted-foreground">33% 完了</span>
            </Mock>
          }
          badNote="Tabs では順序と、未到達のステップへ移れないことが伝わらない。ステップの数の比率は、処理の進捗ではない。"
          good={
            <Mock label="Stepper で、完了、現在、未完了を形と文字で示した例">
              <Stepper items={sample.slice(0, 3).map((s, i) => ({ ...s, status: i < 2 ? "complete" : "current" }))} total={3} layout="horizontal" aria-label="比較の例" />
            </Mock>
          }
          goodNote="順序、現在地、各ステップの状態を、色だけでなく形と文字で示す。"
        />
      </Section>
    </article>
  )
}
