import { useEffect, useState } from "react"

import { companyServer, type BulkMode } from "../../data/data-browsing/company-server"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { CompanyBrowser } from "./company-browser"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "./doc-parts"

const modes: [BulkMode, string][] = [
  ["success", "すべて成功"],
  ["partial", "一部失敗"],
  ["fail", "すべて失敗"],
  ["unknown", "一部の結果が不明"],
  ["request-unknown", "通信が切れる"],
  ["request-fail", "要求を受け付けない"],
]

function BulkOptions() {
  const [mode, setMode] = useState<BulkMode>(companyServer.bulkMode)
  const [progress, setProgress] = useState(companyServer.bulkReportsProgress)
  useEffect(() => {
    companyServer.bulkMode = mode
    companyServer.bulkReportsProgress = progress
    return () => {
      companyServer.bulkMode = "success"
      companyServer.bulkReportsProgress = true
    }
  }, [mode, progress])
  return (
    <div className="flex flex-col gap-2">
      <DemoControls legend="模擬のサーバーの結果">
        {modes.map(([v, l]) => (
          <Radio key={v} name="ba-mode" checked={mode === v} onChange={() => setMode(v)}>
            {l}
          </Radio>
        ))}
      </DemoControls>
      <DemoControls legend="進捗">
        <Radio name="ba-progress" checked={progress} onChange={() => setProgress(true)}>
          実際の進捗を報告する
        </Radio>
        <Radio name="ba-progress" checked={!progress} onChange={() => setProgress(false)}>
          進捗を報告しない
        </Radio>
      </DemoControls>
    </div>
  )
}

export function BulkActionsPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Browsing"
        name="Bulk Actions"
        lead="選んだ複数の行に、まとめて操作する。選択の範囲（このページ、検索結果の全件）を区別し、実行を始めた時点で対象を固定する。成功、失敗、結果の不明を分けて伝える。"
      />

      <Section title="操作できる例" lead="行を選ぶと、件数の行が一括操作のバーに変わる（表の位置は動かない）。ページをまたいで選び、検索結果の全件を選び、担当者の変更や削除を実行する。一部失敗では、失敗した行だけを選択したまま残し、その行だけを再試行できる。">
        <div className="flex flex-col gap-6">
          <BulkOptions />
          <DemoFrame>
            <CompanyBrowser testId="ba-demo" workspace="hq" features={{ bulk: true }} />
          </DemoFrame>
          <AppLink href="#/browsing-app?page=customers">検証画面で、表示形式の切り替えと組み合わせて試す</AppLink>
        </div>
      </Section>

      <Section title="選択の範囲">
        <Rules
          rows={[
            ["ページ内の選択", "見出しの Checkbox は、表示中のページの選択できる行だけを選ぶ。一部を選んでいるときは Indeterminate"],
            ["ページをまたぐ選択", "行の ID で持ち、フィルター、ソート、ページを変えても残す。表示していない件数を「3件を選択中（表示していない 2件を含む）」と示す"],
            ["検索結果の全件", "ページ内をすべて選んだ後の、別の明示的な操作。検索条件と、外した行の ID で持つ。正確な件数がわからない場合は件数を示さない"],
            ["条件を変えたとき", "全件の選択は解除し、そのことを知らせる（選択の対象が暗黙に広がらない）。もう 1 つの方式として、元の条件に固定して「元の条件の 580件」と示す方式がある"],
            ["詳細の表示との関係", "一括操作の選択（面の色）と、詳細を表示中の行（左端の線）を別に持つ"],
            ["スコープ", "別のワークスペースやアカウントに選択を持ち越さない"],
          ]}
        />
      </Section>

      <Section title="実行と結果">
        <Bullets
          items={[
            "よく使う操作を 1〜3 個直接置き、その他は Dropdown Menu にまとめる。Secondary と Ghost を基本にし、危険な操作は Destructive の文字の色にする。",
            "削除などの不可逆な操作は Alert Dialog で確かめる。対象、件数、変更の内容、取り消せるかを示す。",
            "取り消せる低リスクの操作（担当者の変更）は、確認を挟まずに実行し、Toast の「元に戻す」で取り消せる。",
            "実行を始めた時点で対象を固定する。実行中に選択や条件を変えても、対象は変わらない。実行中は同じ操作を受け付けない。",
            "実際の進捗を取得できる場合だけ、進捗を示す。",
            "成功した行の選択を解除し、失敗した行は選択を残す。結果が不明な行は再試行のボタンを置かず、最新の状態の確認を促す。",
            "重要な部分失敗は、Toast だけで伝えない。一覧の上に、利用者が閉じるまで残す。",
          ]}
        />
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="「本当によろしいですか？」だけの確認">
              <p className="text-heading">本当によろしいですか？</p>
              <div className="flex justify-end gap-2 text-ui">
                <span className="rounded-md px-3 py-2">いいえ</span>
                <span className="rounded-md bg-destructive px-3 py-2 text-destructive-foreground">はい</span>
              </div>
            </Mock>
          }
          badNote="何を、何件、どう変えるのか、取り消せるのかがわからない。"
          good={
            <Mock label="対象、件数、取り消せないことを示した削除の確認">
              <p className="text-heading">12件の顧客を削除しますか？</p>
              <p className="text-ui text-muted-foreground">対象：株式会社青葉製作所、朝日商事 ほか 10件。削除すると元に戻せません。</p>
              <div className="flex justify-end gap-2 text-ui">
                <span className="rounded-md px-3 py-2">キャンセル</span>
                <span className="rounded-md bg-destructive px-3 py-2 text-destructive-foreground">12件を削除する</span>
              </div>
            </Mock>
          }
          goodNote="実行のボタンにも、操作と件数を書く。"
        />
        <Compare
          bad={
            <Mock label="一部の失敗を、数秒で消える Toast だけで知らせた例">
              <p className="ml-auto rounded-md bg-foreground px-3 py-2 text-ui text-background">一部の更新に失敗しました</p>
            </Mock>
          }
          badNote="どの行が失敗したかを確かめられず、再試行の対象もわからない。"
          good={
            <Mock label="完了と失敗の件数、失敗した行と理由、失敗した行だけの再試行を一覧の上に残した例">
              <p className="text-ui font-medium">12件のうち、9件の担当者の変更が完了しました</p>
              <p className="text-ui text-muted-foreground">失敗 3件：朝日商事（ほかの利用者が編集中）…</p>
              <span className="w-fit rounded-md bg-secondary px-3 py-1.5 text-ui">失敗した 3件を再試行</span>
            </Mock>
          }
          goodNote="結果を一覧の上に残し、失敗した行だけを選択したままにする。"
        />
      </Section>
    </article>
  )
}
