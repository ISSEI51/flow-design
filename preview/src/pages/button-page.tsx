import { useRef, useState } from "react"
import { ArrowRight, Download, Filter, MoreHorizontal, Plus, Search, Sparkles, Trash2 } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"

import { Compare, Row, Section } from "../layout/section"

const variants = [
  { variant: "default", name: "Primary", note: "画面で最も重要な操作。1 つの操作グループに原則 1 つ", label: "変更を保存" },
  { variant: "secondary", name: "Secondary", note: "Primary を補助する操作", label: "下書きを保存" },
  { variant: "outline", name: "Outline", note: "並べた操作の区切りを線で示す補助操作", label: "書き出す" },
  { variant: "ghost", name: "Ghost", note: "ツールバーや行の中の、主張を抑えた操作", label: "編集" },
  { variant: "destructive", name: "Destructive", note: "削除など、取り消せない操作", label: "削除する" },
  { variant: "link", name: "Link", note: "文章の中で、リンクのように見せる操作", label: "詳細を表示" },
] as const

const sizes = [
  { size: "xs", icon: "icon-xs", name: "Compact", px: "32px", note: "高密度の表、行の中の操作" },
  { size: "sm", icon: "icon-sm", name: "Small", px: "40px", note: "フィルターなど、画面の補助的な操作" },
  { size: "default", icon: "icon", name: "Default", px: "48px", note: "標準。フォームとダイアログ" },
  { size: "lg", icon: "icon-lg", name: "Large", px: "56px", note: "画面の目的そのものになる操作" },
] as const

function useLoadingDemo() {
  const [loading, setLoading] = useState(false)
  const [count, setCount] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  const run = () => {
    setCount((c) => c + 1)
    setLoading(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setLoading(false), 2000)
  }
  return { loading, count, run }
}

export function ButtonPage() {
  const demo = useLoadingDemo()
  const [clicks, setClicks] = useState(0)

  return (
    <article>
      <p className="text-caption text-muted-foreground">Components</p>
      <h1 className="mt-2 text-page-title">Button</h1>
      <p className="mt-4 max-w-[40rem] text-body text-muted-foreground">
        処理を実行する操作。ページの移動にはリンクを使う。
      </p>

      <Section title="種類" lead="重要度の高い順に並べている。">
        {variants.map((v) => (
          <Row key={v.variant} label={v.name} note={`variant="${v.variant}"　${v.note}`}>
            <Button data-testid={`variant-${v.variant}`} variant={v.variant}>
              {v.label}
            </Button>
            <Button variant={v.variant} disabled>
              {v.label}
            </Button>
          </Row>
        ))}
      </Section>

      <Section title="大きさ" lead="文字の大きさは 14px のまま、高さと左右の余白だけを変える。">
        {sizes.map((s) => (
          <Row key={s.size} label={`${s.name}　${s.px}`} note={`size="${s.size}"　${s.note}`}>
            <Button data-testid={`size-${s.size}`} size={s.size}>
              変更を保存
            </Button>
            <Button size={s.size} variant="outline">
              <Plus />
              追加
            </Button>
            <Button data-testid={`size-${s.icon}`} size={s.icon} variant="outline" aria-label="検索">
              <Search />
            </Button>
          </Row>
        ))}
      </Section>

      <Section title="状態" lead="ホバー、押下、フォーカスは、実際に操作して確認する。">
        <Row label="通常 / ホバー / 押下" note="ポインターを重ね、押して確認する">
          <Button data-testid="state-default" onClick={() => setClicks((c) => c + 1)}>
            変更を保存
          </Button>
          <span className="text-ui text-muted-foreground" data-testid="click-count">
            押した回数：{clicks}
          </span>
        </Row>
        <Row label="フォーカス" note="Tab キーで移動する">
          <Button variant="outline">前へ</Button>
          <Button variant="outline">次へ</Button>
        </Row>
        <Row label="無効" note="押せない理由を、近くの文字で示す">
          <Button data-testid="state-disabled" disabled onClick={() => setClicks((c) => c + 1)}>
            変更を保存
          </Button>
          <span className="text-ui text-muted-foreground">必須の項目を入力すると押せる</span>
        </Row>
        <Row label="処理中" note="押すと 2 秒間処理中になる。幅は変わらない">
          <Button data-testid="state-loading" loading={demo.loading} onClick={demo.run}>
            請求書を送信
          </Button>
          <span className="text-ui text-muted-foreground" data-testid="submit-count">
            送信した回数：{demo.count}
          </span>
        </Row>
        <Row label="処理中（固定）" note="表示の確認用">
          <Button data-testid="state-loading-fixed" loading>
            請求書を送信
          </Button>
          <Button loading variant="outline">
            書き出す
          </Button>
        </Row>
      </Section>

      <Section title="アイコン" lead="アイコンは 20px、線の太さは 1.75。文字との間隔は 8px。">
        <Row label="文字だけ">
          <Button variant="outline">書き出す</Button>
        </Row>
        <Row label="前にアイコン" note="操作の種類を補足する">
          <Button data-testid="icon-start" variant="outline">
            <Download />
            書き出す
          </Button>
        </Row>
        <Row label="後ろにアイコン" note="次の段階へ進む操作">
          <Button>
            次へ進む
            <ArrowRight />
          </Button>
        </Row>
        <Row label="アイコンだけ" note="aria-label が必須">
          <Button size="icon" variant="ghost" aria-label="検索">
            <Search />
          </Button>
          <Button size="icon" variant="ghost" aria-label="絞り込み">
            <Filter />
          </Button>
          <Button size="icon" variant="ghost" aria-label="その他の操作">
            <MoreHorizontal />
          </Button>
        </Row>
      </Section>

      <Section title="ラベル">
        <Row label="日本語">
          <Button>変更を保存</Button>
        </Row>
        <Row label="英語">
          <Button>Save changes</Button>
        </Row>
        <Row label="長いラベル" note="幅 16rem の中。省略せずに折り返す">
          <div className="w-64" data-testid="long-container">
            <Button data-testid="long-label" className="w-full">
              請求書をまとめて送信してから一覧に戻る
            </Button>
          </div>
          <div className="w-64">
            <Button className="w-full" variant="outline">
              Send all invoices and return to the list
            </Button>
          </div>
        </Row>
      </Section>

      <Section title="使用例">
        <Row label="フォームの操作" note="Primary は 1 つ。右端に置く">
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost">キャンセル</Button>
            <Button>変更を保存</Button>
          </div>
        </Row>
        <Row label="取り消せない操作" note="結果を文章で示し、操作の名前を具体的にする">
          <div className="w-full">
            <p className="text-body">「山田商事」を削除すると、契約の履歴も削除されます。</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline">キャンセル</Button>
              <Button variant="destructive">
                <Trash2 />
                山田商事を削除
              </Button>
            </div>
          </div>
        </Row>
        <Row label="ツールバー" note="よく知られたアイコンだけを使う">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="検索">
              <Search />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="絞り込み">
              <Filter />
            </Button>
            <Button size="sm" variant="outline">
              <Plus />
              顧客を追加
            </Button>
          </div>
        </Row>
        <Row label="ページの移動" note="見た目をそろえる場合も <a> を使う">
          <a href="#/button" className={buttonVariants({ variant: "outline" })}>
            顧客一覧へ
          </a>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <>
              <Button>キャンセル</Button>
              <Button>変更を保存</Button>
            </>
          }
          badNote="Primary が 2 つあり、どちらが主要な操作かわからない。"
          good={
            <>
              <Button variant="ghost">キャンセル</Button>
              <Button>変更を保存</Button>
            </>
          }
          goodNote="主要な操作だけを Primary にする。"
        />
        <Compare
          bad={<Button>実行</Button>}
          badNote="押した結果がわからない。"
          good={<Button>請求書を送信</Button>}
          goodNote="押した結果を、具体的な言葉で示す。"
        />
        <Compare
          bad={
            <Button size="icon" variant="outline" aria-label="要約を作成">
              <Sparkles />
            </Button>
          }
          badNote="アイコンの意味が広く共有されていない。"
          good={
            <Button variant="outline">
              <Sparkles />
              要約を作成
            </Button>
          }
          goodNote="意味が伝わらないアイコンには文字を添える。"
        />
        <Compare
          bad={<Button>顧客を削除</Button>}
          badNote="取り消せない操作が、通常の主要操作と同じ見た目になっている。"
          good={
            <Button variant="destructive">
              <Trash2 />
              顧客を削除
            </Button>
          }
          goodNote="取り消せない操作には Destructive を使う。"
        />
      </Section>
    </article>
  )
}
