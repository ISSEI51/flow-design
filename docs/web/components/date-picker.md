# Date Picker

日付と期間を入力する。直接入力しても、Calendar から選んでもよい。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/date-picker.tsx`](../../../registry/components/ui/date-picker.tsx)、日付の処理は [`registry/lib/date.ts`](../../../registry/lib/date.ts) |
| 元にした実装 | shadcn/ui の Date Picker の例（Popover と Calendar の組み合わせ）。shadcn/ui には部品がないため、`DatePicker` と `DateRangePicker` を定めた |
| 状態 | 初期実装 |

## 1. Purpose

ユーザーが、わかっている日付は速く入力し、曜日や前後の日を確かめたいときは Calendar で選べるようにする。

## 2. Usage

- 単一の日付は `DatePicker`、期間は `DateRangePicker` を使う。
- プリセット（今日、今月、先月など）は、よく使う期間がある画面だけに置く。すべての Date Picker に置かない。
- 日付と時刻をまとめて扱う欄には使わない。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 入力欄 | Input と同じ。高さ 48px、角丸 12px、文字 16px、1px の `input`。プレースホルダーは形式（`YYYY/MM/DD`） | `h-control`、`rounded-md`、`text-body` |
| Calendar のボタン | 入力欄の右端。40 × 40px、Lucide の CalendarDays（20px）。期間では欄の右に 48 × 48px | `size-10`、`size-5` |
| 消去のボタン | `clearable` のとき。Lucide の X | |
| 開始日・終了日のラベル | 欄の上。12px、`muted-foreground` | `text-caption` |
| Calendar の表示 | 768px 以上は Popover（期間は 2 か月）、768px 未満は下からの Drawer（1 か月） | |
| プリセット | Popover では Calendar の左に縦に、Drawer では Calendar の上に折り返して並べる。選んでいる期間は `aria-pressed` | |

```tsx
const [date, setDate] = useState<Date | null>(null)
const [error, setError] = useState<DateError | null>(null)

<Field invalid={error !== null}>
  <FieldLabel>契約日</FieldLabel>
  <DatePicker value={date} onValueChange={setDate} onErrorChange={setError} name="contract_date" />
  <FieldError>{error ? dateErrorMessage(error) : null}</FieldError>
</Field>
```

## 4. Variants

| 状態 | 表し方 |
| --- | --- |
| 未入力 | 形式のプレースホルダー |
| 入力中 | 入力した文字のまま。確定するまで値にもエラーにもしない |
| 確定 | `YYYY/MM/DD` の形にそろえて表示する |
| 形式の誤り（`format`） | 「日付を YYYY/MM/DD の形式で入力してください（例：2026/04/01）」 |
| 存在しない日付（`nonexistent`） | 「存在しない日付です。月と日を確かめてください」。2026/02/30、2026/13/01 など |
| 範囲外（`out-of-range`） | `min`、`max` の外。「2026/11/25〜2027/02/23 の日付を入力してください」 |
| 選べない日（`unavailable`） | `isDateDisabled` が true の日 |
| 開始日と終了日の逆転（`end-before-start`） | 「終了日は開始日と同じか、それより後の日付にしてください」。終了日の欄に `aria-invalid` |
| 無効 | 入力欄と Calendar のボタンを無効にする |
| 読み取り専用 | 入力欄を `muted` の面にし、Calendar のボタンを出さない |

エラーの文言は `dateErrorMessage` で作り、製品が `FieldError` などで表示する。不正な入力のとき、値は `null`（期間では該当する側が `undefined`）になる。

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| 入力して、フォーカスを外す、Enter | 確定する。正しい日付なら値になり、表示を `YYYY/MM/DD` にそろえる |
| Calendar のボタン | Calendar を開き、選択中の日（なければ今日）にフォーカスを移す |
| Calendar で日を選ぶ | 入力欄と値を更新し、閉じる。フォーカスをボタンに戻す |
| 期間の Calendar | 1 回目に開始日、2 回目に終了日を選び、閉じる |
| プリセット | その期間を入れて閉じる |
| Esc、外側を押す | Calendar を閉じる |

- 受け付ける入力は、ロケールの並びの年月日（ja-JP は `2026/11/25`、`2026/1/5`）、区切りの「/」「-」「.」「年月日」、区切りのない 8 桁（`20261125`）、ISO の `2026-11-25`。全角の数字も受け付ける。年は 4 桁に限る。
- 入力欄は `inputmode="numeric"` にする。モバイルでは数字のキーボードが開き、区切りのない 8 桁でも入力できる。
- 直接入力と Calendar は同じ値を表示する。入力中の文字が正しい日付であれば、Calendar を開いたときにその日を選んでいる。
- 存在しない日付や形式の誤りを、別の日付に変換しない。入力した文字は消さずに残す。
- 終了日が開始日より前でも、自動で入れ替えない。片側だけの指定もできる。必須にするかどうかは製品が決める。
- 値は日付だけを表す `Date`。`name`（期間は `startName`、`endName`）を指定すると `"YYYY-MM-DD"` を送信する。開始日と終了日はどちらも期間に含む（[advanced.md](advanced.md#日付だけの値の扱い)）。
- プリセットは `dateRangePresets` から選び、表示するたびに今日（`timeZone`）から計算する。
- 画面の幅が 768px 未満のときは Drawer を使い、Calendar を 1 か月だけ表示する。Drawer はトリガーの外で開くため、閉じた後のフォーカスの戻り先をボタンに指定している。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 2026/02/30 を 2026/03/02 にする | ユーザーの意図しない日付が保存される | 存在しない日付としてエラーにする |
| 入力の途中でエラーを出す | 入力を終える前に責められる | フォーカスが外れたとき、Enter で確定してから検証する |
| 終了日が前なら入れ替える | 入力の誤りに気付けない | エラーにして直してもらう |
| Calendar だけで入力させる | わかっている日付も 1 日ずつ探す必要がある | 直接入力も受け付ける |
| すべての Date Picker にプリセットを置く | 使わない選択肢が判断を増やす | よく使う期間がある画面だけに置く |
| プリセットの期間を固定の日付で書く | 日が変わると誤った期間になる | 今日から計算する |
