import { useMemo, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxCreateItem,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxStatus,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxSearch,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel, FieldRequiredMark } from "@/components/ui/field"
import { MultiSelect } from "@/components/ui/multi-select"

import { accounts, prefectures, searchPeople, type Option, type Person } from "../../data/advanced"
import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

function AccountCombobox({
  testId,
  value,
  onValueChange,
  defaultValue,
  disabled,
  readOnly,
  name,
}: {
  testId: string
  value?: Option | null
  onValueChange?: (v: Option | null) => void
  defaultValue?: Option | null
  disabled?: boolean
  readOnly?: boolean
  name?: string
}) {
  return (
    <Combobox
      items={accounts}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      name={name}
    >
      <ComboboxTrigger data-testid={testId}>
        <ComboboxValue placeholder="選択してください" />
      </ComboboxTrigger>
      <ComboboxContent data-testid={`${testId}-content`}>
        <ComboboxInput placeholder="取引先名で検索" aria-label="取引先を検索" />
        <ComboboxEmpty>一致する取引先がありません</ComboboxEmpty>
        <ComboboxList>
          {(item: Option) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

// Dialog の中の Combobox と Multi Select。メニューは Dialog より前面に表示し、Esc は前面のメニューだけを閉じる。
function InDialog() {
  const [account, setAccount] = useState<Option | null>(null)
  const [regions, setRegions] = useState<string[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-start gap-2">
      <Dialog>
        <DialogTrigger render={<Button variant="outline" data-testid="combobox-dialog-trigger" />}>配送の条件を編集</DialogTrigger>
        <DialogContent data-testid="combobox-dialog">
          <DialogHeader>
            <DialogTitle>配送の条件を編集</DialogTitle>
            <DialogDescription>取引先と配送エリアを選んでください。</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-6">
            <Field>
              <FieldLabel>取引先</FieldLabel>
              <AccountCombobox testId="combobox-dialog-account" value={account} onValueChange={setAccount} />
            </Field>
            <Field>
              <FieldLabel>配送エリア</FieldLabel>
              <div data-testid="combobox-dialog-regions" className="contents">
                <MultiSelect options={prefectures} value={regions} onValueChange={setRegions} />
              </div>
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>キャンセル</DialogClose>
            <DialogClose
              render={<Button data-testid="combobox-dialog-save" />}
              onClick={() => setSaved(`${account?.label ?? "未選択"} ／ ${regions.length}件`)}
            >
              保存
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-caption text-muted-foreground" data-testid="combobox-dialog-state">
        保存した条件：{saved ?? "なし"}
      </p>
    </div>
  )
}

// サーバー側の検索の模擬。選択済みの担当者は、検索結果に含まれなくても選択肢に残す。
function PersonCombobox() {
  const [value, setValue] = useState<Person | null>(null)
  const search = useComboboxSearch<Person>({ search: searchPeople })
  const items = useMemo(
    () => (value && !search.items.some((p) => p.value === value.value) ? [value, ...search.items] : search.items),
    [value, search.items]
  )
  return (
    <Field className="max-w-sm" name="owner">
      <FieldLabel>担当者</FieldLabel>
      <Combobox<Person>
        items={items}
        filter={null}
        value={value}
        onValueChange={setValue}
        onInputValueChange={search.onQueryChange}
        isItemEqualToValue={(a, b) => a.value === b.value}
      >
        <ComboboxTrigger data-testid="combobox-async">
          <ComboboxValue placeholder="選択してください" />
        </ComboboxTrigger>
        <ComboboxContent data-testid="combobox-async-content" aria-busy={search.status === "loading" || undefined}>
          <ComboboxInput placeholder="名前かメールアドレスで検索" aria-label="担当者を検索" />
          <ComboboxStatus
            status={search.status}
            idleMessage={value ? undefined : "名前を入力すると候補を表示します"}
            onRetry={search.retry}
          />
          {search.status === "success" && <ComboboxEmpty>「{search.query}」に一致する担当者がいません</ComboboxEmpty>}
          <ComboboxList>
            {(p: Person) => (
              <ComboboxItem key={p.value} value={p}>
                <span className="block">{p.label}</span>
                <span className="block text-caption text-muted-foreground">
                  {p.team}・{p.email}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription data-testid="combobox-async-status">
        検索の状態：{{ idle: "未検索", loading: "読み込み中", success: `${search.items.length} 件`, error: "取得失敗" }[search.status]}
        （「エラー」を含めると失敗を再現します）
      </FieldDescription>
    </Field>
  )
}

// 常に読み込み中の状態の確認用。
function LoadingCombobox() {
  const search = useComboboxSearch<Person>({ search: () => new Promise<Person[]>(() => {}), minLength: 0 })
  return (
    <Field className="max-w-sm">
      <FieldLabel>担当者（読み込み中の表示）</FieldLabel>
      <Combobox<Person> items={[]} filter={null} onInputValueChange={search.onQueryChange}>
        <ComboboxTrigger data-testid="combobox-loading">
          <ComboboxValue placeholder="選択してください" />
        </ComboboxTrigger>
        <ComboboxContent aria-busy>
          <ComboboxInput placeholder="名前で検索" aria-label="担当者を検索" />
          <ComboboxStatus status={search.status} />
          <ComboboxList>{(p: Person) => <ComboboxItem key={p.value} value={p}>{p.label}</ComboboxItem>}</ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  )
}

type Tag = Option & { create?: boolean }

// 新規作成が許可される場合だけ、明示的な「追加」の操作を置く。登録の処理は製品が行う。
function CreatableCombobox() {
  const [tags, setTags] = useState<Tag[]>([
    { value: "t-1", label: "重要顧客" },
    { value: "t-2", label: "新規" },
    { value: "t-3", label: "休眠" },
  ])
  const [value, setValue] = useState<Tag | null>(null)
  const [query, setQuery] = useState("")
  const trimmed = query.trim()
  const exists = tags.some((t) => t.label === trimmed)
  const items: Tag[] = trimmed && !exists ? [...tags, { value: `create:${trimmed}`, label: trimmed, create: true }] : tags
  return (
    <Field className="max-w-sm">
      <FieldLabel>分類</FieldLabel>
      <Combobox<Tag>
        items={items}
        value={value}
        onInputValueChange={setQuery}
        onValueChange={(v) => {
          if (v?.create) {
            // 製品では、ここで登録の API を呼び、権限を確かめる。
            const created = { value: `t-${tags.length + 1}`, label: v.label }
            setTags((t) => [...t, created])
            setValue(created)
          } else setValue(v)
        }}
      >
        <ComboboxTrigger data-testid="combobox-creatable">
          <ComboboxValue placeholder="選択してください" />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="分類を検索" aria-label="分類を検索" />
          <ComboboxList>
            {(t: Tag) =>
              t.create ? (
                <ComboboxCreateItem key={t.value} value={t}>
                  「{t.label}」を新しい分類として追加
                </ComboboxCreateItem>
              ) : (
                <ComboboxItem key={t.value} value={t}>
                  {t.label}
                </ComboboxItem>
              )
            }
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription>一致する分類がないときだけ、追加の操作が表示されます</FieldDescription>
    </Field>
  )
}

function RequiredForm() {
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const v = new FormData(e.currentTarget).get("prefecture")
    setInvalid(!v)
    setSubmitted(v ? String(v) : "")
  }
  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" data-testid="combobox-form">
      <Field name="prefecture" invalid={invalid}>
        <FieldLabel>
          所在地の都道府県 <FieldRequiredMark />
        </FieldLabel>
        <Combobox items={prefectures} required onValueChange={(v) => v && setInvalid(false)}>
          <ComboboxTrigger data-testid="combobox-required">
            <ComboboxValue placeholder="選択してください" />
          </ComboboxTrigger>
          <ComboboxContent>
            <ComboboxInput placeholder="都道府県名か読みで検索" aria-label="都道府県を検索" />
            <ComboboxEmpty>一致する都道府県がありません</ComboboxEmpty>
            <ComboboxList>
              {(p: Option) => (
                <ComboboxItem key={p.value} value={p}>
                  {p.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldError>{invalid ? "都道府県を選んでください" : null}</FieldError>
      </Field>
      <div className="flex items-center gap-4">
        <Button type="submit">送信</Button>
        <output data-testid="combobox-form-result" className="text-ui text-muted-foreground">
          {submitted === null ? "" : `送信される値：${submitted || "（なし）"}`}
        </output>
      </div>
    </form>
  )
}

export function ComboboxPage() {
  const [account, setAccount] = useState<Option | null>(accounts[1])
  const [query, setQuery] = useState("")
  return (
    <article>
      <PageHeader
        name="Combobox"
        lead="検索して、多くの選択肢から 1 つを選ぶ。閉じた状態は Select と同じで、選んだ結果を欄で確認できる。"
      />

      <Section
        title="基本"
        lead="押すとメニューが開き、メニューの中の検索欄にフォーカスが移る。文字を入力すると絞り込み、↑↓ で移動し、Enter で選ぶ。Esc で閉じると、検索文字列は破棄され、選んだ値は残る。"
      >
        <Row label="未選択" note="閉じた状態は Select と同じ">
          <Field className="max-w-sm" name="account">
            <FieldLabel>取引先</FieldLabel>
            <AccountCombobox testId="combobox-basic" />
          </Field>
        </Row>
        <Row label="選択済みの値の保持" note="検索中も、確定済みの値は変わらない">
          <Field className="max-w-sm">
            <FieldLabel>取引先</FieldLabel>
            <Combobox items={accounts} value={account} onValueChange={setAccount} onInputValueChange={setQuery}>
              <ComboboxTrigger data-testid="combobox-keep">
                <ComboboxValue placeholder="選択してください" />
              </ComboboxTrigger>
              <ComboboxContent>
                <ComboboxInput placeholder="取引先名で検索" aria-label="取引先を検索" />
                <ComboboxEmpty>一致する取引先がありません</ComboboxEmpty>
                <ComboboxList>
                  {(item: Option) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <FieldDescription data-testid="combobox-keep-state">
              確定済みの値：{account?.label ?? "なし"} ／ 検索文字列：{query || "なし"}
            </FieldDescription>
          </Field>
        </Row>
        <Row label="別名で探す" note="読み（ひらがな・カタカナ）とローマ字でも見つかる">
          <Field className="max-w-sm">
            <FieldLabel>都道府県</FieldLabel>
            <Combobox items={prefectures}>
              <ComboboxTrigger data-testid="combobox-pref">
                <ComboboxValue placeholder="選択してください" />
              </ComboboxTrigger>
              <ComboboxContent data-testid="combobox-pref-content">
                <ComboboxInput placeholder="例：とうきょう、Tokyo" aria-label="都道府県を検索" />
                <ComboboxEmpty>一致する都道府県がありません</ComboboxEmpty>
                <ComboboxList>
                  {(p: Option) => (
                    <ComboboxItem key={p.value} value={p}>
                      {p.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Field>
        </Row>
        <Row label="長い選択肢" note="省略せず、文節で折り返す">
          <Field className="max-w-sm" data-testid="combobox-long-field">
            <FieldLabel>取引先</FieldLabel>
            <AccountCombobox testId="combobox-long" defaultValue={accounts[3]} />
          </Field>
        </Row>
      </Section>

      <Section
        title="サーバー側の検索"
        lead="入力が 300ms 止まってから検索する。古い検索の結果が後から返っても上書きしない。読み込み中、結果なし、取得失敗を区別して示す。"
      >
        <Row label="非同期検索の模擬" note="1 文字の検索は 1.2 秒、2 文字以上は 0.4 秒かかる">
          <PersonCombobox />
        </Row>
        <Row label="読み込み中">
          <LoadingCombobox />
        </Row>
      </Section>

      <Section title="明示的な新規作成" lead="自由入力で項目を登録しない。製品が新規作成を許可する場合だけ、追加の操作を選択肢の最後に置く。">
        <Row label="追加できる">
          <CreatableCombobox />
        </Row>
      </Section>

      <Section
        title="Dialog の中"
        lead="Combobox と Multi Select のメニューは Dialog より前面に表示する。Esc は前面のメニューだけを閉じ、もう一度押すと Dialog を閉じる。"
      >
        <Row label="Combobox と Multi Select">
          <InDialog />
        </Row>
      </Section>

      <Section title="状態">
        <Row label="必須とエラー" note="送信時に検証する">
          <RequiredForm />
        </Row>
        <Row label="無効">
          <Field className="max-w-sm" disabled>
            <FieldLabel>取引先</FieldLabel>
            <AccountCombobox testId="combobox-disabled" defaultValue={accounts[0]} disabled />
          </Field>
        </Row>
        <Row label="読み取り専用" note="値は確認できるが、開かない">
          <Field className="max-w-sm">
            <FieldLabel>取引先</FieldLabel>
            <AccountCombobox testId="combobox-readonly" defaultValue={accounts[0]} readOnly />
          </Field>
        </Row>
      </Section>

      <Section title="使い分け">
        <Compare
          bad={<p className="text-ui">入力欄に直接入力して検索し、入力した文字がそのまま値になる</p>}
          badNote="検索中の文字と選んだ値の区別がつかず、存在しない値が送信される。"
          good={<p className="text-ui">閉じた状態は Select と同じ。検索はメニューの中で行う</p>}
          goodNote="選んだ値が欄に残り、検索文字列は閉じると破棄される。"
        />
      </Section>
    </article>
  )
}
