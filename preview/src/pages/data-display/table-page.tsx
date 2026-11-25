import { useState, type ReactNode } from "react"

import { Checkbox } from "@/components/ui/checkbox"

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableNoValue,
  TableRow,
  TableTruncate,
  type TableDensity,
} from "@/components/ui/table"

import { customers, formatDate, formatYen, statusLabel } from "../../data/data-display/customers"
import { PageHeader } from "../../layout/page-header"
import { Compare, Row, Section } from "../../layout/section"
import { StatusText } from "./customer-parts"

const few = customers.slice(0, 5)
const many = customers.slice(0, 12)

function FewColumns({ variant = "lines", density, bordered, testId, rows = few }: {
  variant?: "lines" | "striped"
  density?: TableDensity
  bordered?: boolean
  testId?: string
  rows?: typeof few
}) {
  return (
    <Table variant={variant} density={density} bordered={bordered} data-testid={testId}>
      <TableCaption className="sr-only">顧客（{rows.length}件）</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>会社名</TableHead>
          <TableHead>担当者</TableHead>
          <TableHead align="right">月額</TableHead>
          <TableHead>更新日</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="min-w-44 font-medium">{c.company}</TableCell>
            <TableCell className="whitespace-nowrap">{c.owner}</TableCell>
            <TableCell align="right" className="whitespace-nowrap">
              {c.monthlyFee === null ? <TableNoValue label="未設定" /> : formatYen(c.monthlyFee)}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{c.renewalDate ? formatDate(c.renewalDate) : <TableNoValue label="未定" />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ManyColumns({ variant = "striped", testId, rows = many }: { variant?: "lines" | "striped"; testId?: string; rows?: typeof many }) {
  return (
    <Table variant={variant} data-testid={testId}>
      <TableCaption className="sr-only">顧客（{rows.length}件、8 列）</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>顧客ID</TableHead>
          <TableHead>会社名</TableHead>
          <TableHead>契約状況</TableHead>
          <TableHead>担当者</TableHead>
          <TableHead>地域</TableHead>
          <TableHead align="right">月額</TableHead>
          <TableHead align="right">利用者数</TableHead>
          <TableHead>更新日</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{c.id}</TableCell>
            <TableCell className="min-w-48">{c.company}</TableCell>
            <TableCell>
              <StatusText status={c.status} />
            </TableCell>
            <TableCell className="whitespace-nowrap">{c.owner}</TableCell>
            <TableCell className="whitespace-nowrap">{c.region}</TableCell>
            <TableCell align="right" className="whitespace-nowrap">
              {c.monthlyFee === null ? <TableNoValue label="未設定" /> : formatYen(c.monthlyFee)}
            </TableCell>
            <TableCell align="right" className="whitespace-nowrap">
              {c.seats.toLocaleString("ja-JP")}人
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{c.renewalDate ? formatDate(c.renewalDate) : <TableNoValue label="未定" />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Block({ children }: { children: ReactNode }) {
  return <div className="w-full min-w-0">{children}</div>
}

const values = [
  { item: "基本料金", kind: "金額", value: 120000, date: "2026-11-01" },
  { item: "追加の利用者（12 人）", kind: "金額", value: 36000, date: "2026-11-01" },
  { item: "サポート（無料のプラン）", kind: "金額", value: 0, date: "2026-11-01" },
  { item: "割引", kind: "金額", value: -15000, date: "2026-11-05" },
  { item: "保守費用（見積もり中）", kind: "金額", value: null, date: null },
]

const stateRows = [
  { label: "通常", selected: false, active: false },
  { label: "通常（偶数行）", selected: false, active: false },
  { label: "選択中", selected: true, active: false },
  { label: "詳細を表示中", selected: false, active: true },
  { label: "選択中（偶数行）", selected: true, active: false },
  { label: "選択中かつ詳細を表示中", selected: true, active: true },
]

// 行の状態の見本。Checkbox で選択を切り替えられる。
function RowStates() {
  const [selected, setSelected] = useState(() => stateRows.map((r) => r.selected))
  return (
    <Table variant="striped" data-testid="table-states">
      <TableHeader>
        <TableRow>
          <TableHead>
            <span className="sr-only">選択</span>
          </TableHead>
          <TableHead>状態</TableHead>
          <TableHead>会社名</TableHead>
          <TableHead>顧客ID</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stateRows.map((r, i) => (
          <TableRow
            key={r.label}
            interactive
            data-testid={`table-state-${i}`}
            data-state={selected[i] ? "selected" : undefined}
            data-active={r.active || undefined}
            aria-current={r.active ? "true" : undefined}
          >
            <TableCell>
              <Checkbox
                aria-label={`${customers[i].company}を選択`}
                checked={selected[i]}
                onCheckedChange={(v) => setSelected((list) => list.map((x, j) => (j === i ? v : x)))}
              />
            </TableCell>
            <TableCell>{r.label}</TableCell>
            <TableCell>
              <a href={`#/table`} onClick={(e) => e.preventDefault()} className="rounded-xs font-medium underline-offset-4 outline-none hover:underline focus-visible:focus-ring">
                {customers[i].company}
              </a>
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{customers[i].id}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function TablePage() {
  return (
    <article>
      <PageHeader
        name="Table"
        lead="構造化された情報を、読みやすく並べる。区切りは薄い横線か、控えめな交互の背景色で表し、縦の線と外枠は使わない。"
      />

      <Section
        title="横線と交互の背景色"
        lead="情報量に応じて製品が選ぶ。6 列以上、または 10 行以上を、交互の背景色を検討する初期の目安にする。表示件数が変わっても見た目は切り替えない。"
      >
        <Row label="横線" note="列と行が少ない。背景は background、縦の線はない">
          <Block>
            <FewColumns testId="table-lines" />
          </Block>
        </Row>
        <Row label="交互の背景色" note="列と行が多い。偶数行を muted にし、本文の横線を省く。ヘッダーとの境界線は残す">
          <Block>
            <ManyColumns testId="table-striped" />
          </Block>
        </Row>
      </Section>

      <Section title="列と行の数" lead="同じ表の見た目を、列と行の数で比べる。多い表で横線を使うと、目で行を追いにくい。">
        <Compare
          bad={
            <Block>
              <ManyColumns variant="lines" testId="table-many-lines" />
            </Block>
          }
          badNote="多い列に横線だけ。行を目で追う途中で、隣の行に移りやすい"
          good={
            <Block>
              <ManyColumns testId="table-many-striped" />
            </Block>
          }
          goodNote="交互の背景色。行のまとまりが面で見え、線が増えない"
        />
        <Row label="少ない列・多い行" note="4 列・12 行。行が多いため交互の背景色を検討する">
          <Block>
            <FewColumns variant="striped" rows={many} testId="table-few-columns-many-rows" />
          </Block>
        </Row>
      </Section>

      <Section title="情報密度" lead="行の最小の高さを 3 段階から選ぶ。文字の大きさは変えない。複数行の文字や拡大表示では、行が伸びる。">
        {(
          [
            ["compact", "Compact", "36px。多くの行を見比べる業務画面"],
            ["default", "Default", "48px。標準"],
            ["comfortable", "Comfortable", "64px。行ごとに読む画面"],
          ] as const
        ).map(([d, name, note]) => (
          <Row key={d} label={name} note={note}>
            <Block>
              <FewColumns density={d} rows={few.slice(0, 3)} testId={`table-density-${d}`} />
            </Block>
          </Row>
        ))}
      </Section>

      <Section title="外枠" lead="外枠なしを標準にする。ページの中で独立した表として区別する必要がある場合だけ、12px の角丸と 1px の境界線を付ける。">
        <Row label="なし" note="標準。余白と見出しで区切る">
          <Block>
            <FewColumns rows={few.slice(0, 3)} testId="table-unbordered" />
          </Block>
        </Row>
        <Row label="あり" note="bordered。最後の行の線は外枠と重ねない">
          <Block>
            <FewColumns bordered rows={few.slice(0, 3)} testId="table-bordered" />
          </Block>
        </Row>
      </Section>

      <Section title="セルの内容" lead="文字は左、金額と数量は右に寄せて桁をそろえる。値がないことは「—」で示し、0 と区別する。">
        <Row label="文字・金額・日付・欠損値" note="金額 0 円と未定（—）を区別する。負の値は符号を付ける">
          <Block>
            <Table data-testid="table-values">
              <TableCaption className="sr-only">請求の内訳</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>項目</TableHead>
                  <TableHead>種類</TableHead>
                  <TableHead align="right">金額</TableHead>
                  <TableHead>請求日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {values.map((v) => (
                  <TableRow key={v.item}>
                    <TableCell>{v.item}</TableCell>
                    <TableCell>{v.kind}</TableCell>
                    <TableCell align="right" data-testid="table-amount">
                      {v.value === null ? <TableNoValue label="未定" /> : `${v.value < 0 ? "−" : ""}${formatYen(Math.abs(v.value))}`}
                    </TableCell>
                    <TableCell className="tabular-nums">{v.date ? formatDate(v.date) : <TableNoValue label="未定" />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Block>
        </Row>
        <Row label="長い文字" note="省略せずに折り返す。日本語は文節で折り返す">
          <Block>
            <Table data-testid="table-long">
              <TableHeader>
                <TableRow>
                  <TableHead>会社名</TableHead>
                  <TableHead>備考</TableHead>
                  <TableHead align="right">月額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="min-w-40">株式会社東日本総合物流サービスホールディングス・アンド・パートナーズ</TableCell>
                  <TableCell className="min-w-48">請求書は月末締め、翌月 10 日に郵送。担当の変更は事前に連絡が必要。</TableCell>
                  <TableCell align="right" className="whitespace-nowrap">
                    {formatYen(186000)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>International Precision Instruments and Advanced Manufacturing Solutions Ltd.</TableCell>
                  <TableCell>Invoices are issued at the end of each month and sent by post.</TableCell>
                  <TableCell align="right" className="whitespace-nowrap">
                    {formatYen(98000)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Block>
        </Row>
        <Row label="省略が必要なとき" note="列の幅を保つ必要がある場合だけ。行の詳細がない表では expandable で、省略されたセルにだけ「全文を表示」を置く">
          <Block>
            <Table data-testid="table-truncate" className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/2">会社名</TableHead>
                  <TableHead>契約状況</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.slice(12, 15).map((c, i) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <TableTruncate expandable>{i === 0 ? "医療法人社団 こもれび会 地域連携在宅医療推進センター" : c.company}</TableTruncate>
                    </TableCell>
                    <TableCell>{statusLabel[c.status]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Block>
        </Row>
      </Section>

      <Section
        title="行の状態"
        lead="押せる行（interactive）だけにホバーの面を付ける。選択中の面はニュートラルで、交互の背景色より優先する。詳細を表示中の行は、先頭のセルの線で区別する。"
      >
        <Row label="通常・選択中・詳細を表示中" note="ブランドカラーは Checkbox と詳細を表示中の線だけに使う。ホバーとキーボードのフォーカスは操作して確かめる">
          <Block>
            <RowStates />
          </Block>
        </Row>
      </Section>

      <Section title="避ける表現">
        <Compare
          bad={
            <Block>
              <div className="rounded-xl border border-border p-6">
                <table className="w-full border-collapse text-ui">
                  <tbody>
                    {few.slice(0, 3).map((c) => (
                      <tr key={c.id}>
                        <td className="border border-border-strong px-4 py-2">{c.company}</td>
                        <td className="border border-border-strong px-4 py-2 text-right tabular-nums">{c.seats}人</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>
          }
          badNote="表をカードで囲み、格子の線で区切る。線が多く、内容より枠が目立つ"
          good={
            <Block>
              <FewColumns rows={few.slice(0, 3)} />
            </Block>
          }
          goodNote="横線だけ。区切りは余白と、必要な線だけで表す"
        />
      </Section>
    </article>
  )
}
