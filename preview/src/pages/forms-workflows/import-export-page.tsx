import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { ExportOrigin } from "@/patterns/export"

import { customerName, listCustomers, planLabel } from "../../data/forms-workflows/server"
import { PageHeader } from "../../layout/page-header"
import { Compare, Section } from "../../layout/section"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "../data-browsing/doc-parts"
import { ServerModes } from "./doc-parts"
import { ExportDialog, type ExportColumn } from "./export-dialog"
import { ImportWizard } from "./import-wizard"

const columns: ExportColumn[] = [
  { id: "code", label: "顧客コード", visible: true },
  { id: "name", label: "名前", visible: true },
  { id: "email", label: "メールアドレス", visible: true },
  { id: "plan", label: "プラン", visible: false },
  { id: "phone", label: "電話番号", visible: false },
]

function ExportExample() {
  const [origin, setOrigin] = useState<ExportOrigin | null>(null)
  const [knownTotal, setKnownTotal] = useState(true)
  const rows = listCustomers()
  return (
    <div className="flex flex-col gap-4">
      <DemoControls legend="検索結果の件数">
        <Radio name="ie-total" checked={knownTotal} onChange={() => setKnownTotal(true)}>
          件数がわかる
        </Radio>
        <Radio name="ie-total" checked={!knownTotal} onChange={() => setKnownTotal(false)}>
          件数がわからない（大量のデータ）
        </Radio>
      </DemoControls>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="max-w-full" onClick={() => setOrigin("table")} data-testid="ie-export-table">
          表の右上から開く
        </Button>
        <Button variant="secondary" className="max-w-full" onClick={() => setOrigin("selection-bar")} data-testid="ie-export-selection">
          一括操作のバーから開く（2件を選択中）
        </Button>
        <Button variant="secondary" className="max-w-full" onClick={() => setOrigin("settings")} data-testid="ie-export-settings">
          設定の画面から開く
        </Button>
      </div>
      {origin && (
        <ExportDialog
          open
          onOpenChange={(o) => !o && setOrigin(null)}
          origin={origin}
          kind="顧客"
          columns={columns}
          counts={{ selected: origin === "selection-bar" ? 2 : 0, page: rows.length, results: knownTotal ? rows.length : null, all: knownTotal ? rows.length : null }}
          getRows={async (scope) =>
            (scope === "selected" ? rows.slice(0, 2) : rows).map((c) => ({ code: c.code, name: customerName(c), email: c.email, plan: planLabel(c.plan), phone: c.phone }))
          }
        />
      )}
    </div>
  )
}

export function ImportExportPage() {
  const [key, setKey] = useState(0)
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Forms & Workflows"
        name="Import & Export"
        lead="取り込みは、ファイルの選択、項目の対応付け、データの検証、内容の確認、取り込み、処理の結果の順に進める。書き出しは、対象の範囲と列を誤解させずに選ばせる。"
      />

      <Section title="インポート" lead="「見本のファイルを使う」で、同じ見出しの列、別名の見出し、エラー、登録済みの顧客との重複を含むファイルを試せる。ファイルの解析と検証は模擬で、実際には登録しない。">
        <div className="flex flex-col gap-6">
          <ServerModes keys={["importMode"]} name="ie" />
          <DemoFrame testId="ie-import">
            <ImportWizard key={key} idPrefix="ie" onFinished={() => setKey((k) => k + 1)} />
          </DemoFrame>
          <AppLink href="#/forms-app?page=import">検証画面で、顧客の一覧から取り込む</AppLink>
        </div>
      </Section>

      <Section title="インポートの規則">
        <Rules
          rows={[
            ["ファイルの選択", "既存の File Upload を使う。形式、大きさの上限、必要な条件を示し、テンプレートを用意する。ファイルを選んだだけでは登録を始めない。アップロード、解析、検証、正式な登録を分ける"],
            ["ファイルを変えたら", "前のファイルの対応付け、検証の結果、確認を無効にする（sourceKey）"],
            ["項目の対応付け", "見出しと既知の別名で自動で対応付け、手動で直せる。列の見出しと値の例を示し、取り込まない列を選べる。必須の項目の不足と、1 つの項目への複数の列を検出する。曖昧な対応付けは確定しない"],
            ["列の識別", "列は位置の識別子で持つ。同じ見出しの列が複数あっても区別する。値の例はファイル全体の検証の結果ではない"],
            ["データの検証", "正常（登録できる）、要確認（重複の候補など）、エラー（登録できない）を分ける。元のファイルの行番号、項目、原因、直し方を示す。一部だけを表示する場合は、そのことと全体の件数を示す。対応付けを変えたら検証し直す"],
            ["重複", "既定は登録済みのデータを残す。更新と新規の登録は明示的な選択にする。更新の空欄は、既定で「変更しない」とし、消す場合は明示的に選ばせる"],
            ["部分的な登録", "独立したレコードは、正常な行だけを登録できる。相互に依存するデータは、すべて成功かすべて失敗の方式にする。エラーの行を黙って除かず、登録、更新、除外の件数を実行の前に示す。トランザクションの制御はバックエンドの責務"],
            ["処理と結果", "正確な進捗がわかる場合だけ進捗率を示す。成功、更新、スキップ、失敗の件数を分け、合計を処理の対象と一致させる。失敗した行だけを再処理できる。結果が不明な場合は、状態の確認を先にする"],
          ]}
        />
      </Section>

      <Section title="エクスポート" lead="操作を始めた場所で、対象の初期値が変わる。件数がわからない範囲は、件数を示さない。">
        <ExportExample />
      </Section>

      <Section title="エクスポートの規則">
        <Rules
          rows={[
            ["対象", "選んだ行、表示中のページ、検索結果のすべて、すべてのデータを区別する。一括操作のバーからは選んだ行、表の右上からは検索結果のすべてを初期値にする"],
            ["すぐにダウンロード", "対象と形式が明らかで追加の設定がない場合は、確認の Dialog を挟まずにダウンロードしてよい"],
            ["列", "表から出力する場合は、表示中の列を初期値にする。データの移行やバックアップには専用の形式を用意してよい。権限のない情報と内部の管理用の情報を、無条件に出力しない（サーバーで確かめる）"],
            ["配置", "取り込みは Page Header か追加のメニュー。検索結果の出力はデータの領域の右上。選んだ行の出力は一括操作のバー。システム全体の出力は設定の画面。頻繁な操作は直接表示し、まれな操作は Dropdown Menu に置く"],
          ]}
        />
      </Section>

      <Section title="ファイルの形式と安全">
        <Bullets
          items={[
            "CSV は UTF-8 を基本にする。Excel で開く用途では BOM を付ける。",
            "電話番号、郵便番号、識別子を数値に変えない。CSV を Excel で直接開くと先頭の 0 が消えることがあるため、保つ必要がある場合は、文字列の型を指定できる XLSX などを使う。",
            "日付、数値、文字コードによる意図しない変換を防ぐ（日付は YYYY-MM-DD などの形を決める）。",
            "CSV Injection の対策をする（escapeCsvCell は、=、+、-、@ などで始まる文字列の先頭に「'」を付ける）。",
            "ファイルの内容、形式、大きさは、サーバーでも確かめる。取り込み、書き出しの対象と項目の権限は、バックエンドで確かめる。",
            "ファイル名から、データの種類と出力の日時がわかるようにする（exportFileName。例：顧客_検索結果_20261126-1530.csv）。",
          ]}
        />
      </Section>

      <Section title="比較">
        <Compare
          bad={
            <Mock label="ファイルを選んだ直後に、確認なしで取り込みを始める例">
              <div className="rounded-md border border-dashed border-border p-3 text-caption">顧客の一覧.csv を取り込んでいます…</div>
            </Mock>
          }
          badNote="対応付けとエラーを確かめる前に登録が始まり、誤ったデータが登録される。"
          good={
            <Mock label="登録、更新、除外の件数を示してから取り込む例">
              <div className="flex flex-col gap-1 text-caption">
                <span>新規に登録 32件</span>
                <span>登録しない（重複）2件</span>
                <span>取り込まない（エラー）4件</span>
              </div>
              <span className="self-end rounded-md bg-primary px-3 py-1 text-caption text-primary-foreground">32件を取り込む（エラーの 4件と重複の 2件を除く）</span>
            </Mock>
          }
          goodNote="何件がどう扱われるかを示し、利用者が確かめてから取り込む。"
        />
      </Section>
    </article>
  )
}
