import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { useComboboxSearch } from "@/components/ui/combobox"
import { Field, FieldDescription, FieldError, FieldLabel, FieldRequiredMark } from "@/components/ui/field"
import { MultiSelect } from "@/components/ui/multi-select"

import { accounts, prefectures, searchPeople, type Person } from "../../data/advanced"
import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const names = (ids: string[]) => ids.map((id) => prefectures.find((p) => p.value === id)?.label).join("、")

function ServerMultiSelect() {
  const [value, setValue] = useState<string[]>([])
  const search = useComboboxSearch<Person>({ search: searchPeople })
  return (
    <Field className="max-w-md">
      <FieldLabel>通知する担当者</FieldLabel>
      <MultiSelect
        options={search.items}
        value={value}
        onValueChange={setValue}
        filter={null}
        onSearchChange={search.onQueryChange}
        searchStatus={search.status}
        searchIdleMessage="名前を入力すると候補を表示します"
        onSearchRetry={search.retry}
        searchPlaceholder="名前かメールアドレスで検索"
        searchLabel="担当者を検索"
        emptyMessage="一致する担当者がいません"
      />
      <FieldDescription data-testid="multi-server-value">選択中の ID：{value.join(", ") || "なし"}</FieldDescription>
    </Field>
  )
}

function RequiredForm() {
  const [submitted, setSubmitted] = useState<string[] | null>(null)
  const [invalid, setInvalid] = useState(false)
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const v = new FormData(e.currentTarget).getAll("regions").map(String)
    setInvalid(v.length === 0)
    setSubmitted(v)
  }
  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-4" data-testid="multi-form">
      <Field name="regions" invalid={invalid}>
        <FieldLabel>
          配送エリア <FieldRequiredMark />
        </FieldLabel>
        <MultiSelect
          options={prefectures}
          name="regions"
          required
          defaultValue={["tokyo", "kanagawa"]}
          onValueChange={(v) => v.length && setInvalid(false)}
          searchPlaceholder="都道府県名か読みで検索"
        />
        <FieldError>{invalid ? "配送エリアを 1 つ以上選んでください" : null}</FieldError>
      </Field>
      <div className="flex items-center gap-4">
        <Button type="submit">送信</Button>
        <output data-testid="multi-form-result" className="text-ui text-muted-foreground">
          {submitted === null ? "" : `送信される値：${submitted.join(", ") || "（なし）"}`}
        </output>
      </div>
    </form>
  )
}

export function MultiSelectPage() {
  const [many, setMany] = useState(["tokyo", "kanagawa", "chiba", "saitama", "ibaraki", "tochigi", "gunma", "yamanashi"])
  const [instant, setInstant] = useState<string[]>(["osaka"])
  return (
    <article>
      <PageHeader
        name="Multi Select"
        lead="多くの選択肢から、検索して複数を選ぶ。選ぶたびに欄の表示が変わり、選んだ内容を閉じた状態でも確認できる。少ない選択肢は Checkbox を使う。"
      />

      <Section
        title="選択済みの表示"
        lead="3 件までは個別に表示し、残りは「他 N 件」で示す。個別に表示した項目は、× で解除できる。すべての選択内容は、メニューを開くと先頭に並ぶ。"
      >
        <Row label="0 件">
          <Field className="max-w-md">
            <FieldLabel>配送エリア</FieldLabel>
            <div data-testid="multi-0" className="contents">
              <MultiSelect options={prefectures} searchPlaceholder="都道府県名か読みで検索" />
            </div>
          </Field>
        </Row>
        <Row label="1 件">
          <Field className="max-w-md">
            <FieldLabel>配送エリア</FieldLabel>
            <div data-testid="multi-1" className="contents">
              <MultiSelect options={prefectures} defaultValue={["hokkaido"]} />
            </div>
          </Field>
        </Row>
        <Row label="3 件" note="すべて個別に表示する">
          <Field className="max-w-md">
            <FieldLabel>配送エリア</FieldLabel>
            <div data-testid="multi-3" className="contents">
              <MultiSelect options={prefectures} defaultValue={["tokyo", "kanagawa", "chiba"]} />
            </div>
          </Field>
        </Row>
        <Row label="多数" note="3 件を個別に表示し、残りを件数で示す">
          <Field className="max-w-md">
            <FieldLabel>配送エリア</FieldLabel>
            <div data-testid="multi-many" className="contents">
              <MultiSelect options={prefectures} value={many} onValueChange={setMany} />
            </div>
            <FieldDescription data-testid="multi-many-value">{many.length} 件：{names(many)}</FieldDescription>
          </Field>
        </Row>
        <Row label="表示する件数" note="狭い欄では 1 件にする">
          <Field className="max-w-60">
            <FieldLabel>配送エリア</FieldLabel>
            <div data-testid="multi-limit1" className="contents">
              <MultiSelect options={prefectures} defaultValue={["tokyo", "kanagawa", "chiba"]} displayLimit={1} />
            </div>
          </Field>
        </Row>
        <Row label="長い項目名" note="欄の幅を超えず、省略して表示する。全文はメニューで確認できる">
          <Field className="max-w-md" data-testid="multi-long-field">
            <FieldLabel>取引先</FieldLabel>
            <div data-testid="multi-long" className="contents">
              <MultiSelect options={accounts} defaultValue={["a-004", "a-006"]} searchPlaceholder="取引先名で検索" />
            </div>
          </Field>
        </Row>
      </Section>

      <Section
        title="選択と反映"
        lead="選ぶたびに欄の表示を更新し、メニューは閉じない。確定ボタンは置かない。Esc で閉じても、選んだ内容は残る。"
      >
        <Row label="即時反映" note="欄の表示と値が、選ぶたびに変わる">
          <Field className="max-w-md">
            <FieldLabel>配送エリア</FieldLabel>
            <div data-testid="multi-instant" className="contents">
              <MultiSelect options={prefectures} value={instant} onValueChange={setInstant} />
            </div>
            <FieldDescription data-testid="multi-instant-value">選択中：{names(instant) || "なし"}</FieldDescription>
          </Field>
        </Row>
        <Row label="選べる件数の上限" note="上限に達すると、ほかの選択肢を選べなくなり、理由を示す">
          <Field className="max-w-md">
            <FieldLabel>比較する都道府県</FieldLabel>
            <div data-testid="multi-max" className="contents">
              <MultiSelect options={prefectures} max={3} defaultValue={["tokyo", "osaka"]} />
            </div>
            <FieldDescription>3 件まで選べます</FieldDescription>
          </Field>
        </Row>
        <Row label="サーバー側の検索" note="検索結果に含まれない選択済みの項目も残る">
          <div data-testid="multi-server" className="contents">
            <ServerMultiSelect />
          </div>
        </Row>
      </Section>

      <Section title="状態">
        <Row label="必須とエラー" note="送信時に検証する。値は選んだ ID の配列で送信される">
          <RequiredForm />
        </Row>
        <Row label="無効">
          <Field className="max-w-md" disabled>
            <FieldLabel>配送エリア</FieldLabel>
            <div data-testid="multi-disabled" className="contents">
              <MultiSelect options={prefectures} defaultValue={["tokyo"]} disabled />
            </div>
          </Field>
        </Row>
        <Row label="読み取り専用">
          <Field className="max-w-md">
            <FieldLabel>配送エリア</FieldLabel>
            <div data-testid="multi-readonly" className="contents">
              <MultiSelect options={prefectures} defaultValue={["tokyo", "osaka"]} readOnly />
            </div>
          </Field>
        </Row>
      </Section>

      <Section title="使い分け">
        <Compare
          bad={<p className="text-ui">5 つの選択肢を Multi Select に入れる</p>}
          badNote="すべてを見るために開く操作が増える。"
          good={<p className="text-ui">5 つ程度なら Checkbox を並べる</p>}
          goodNote="すべての選択肢と選んだ状態が、開かずに見える。"
        />
      </Section>
    </article>
  )
}
