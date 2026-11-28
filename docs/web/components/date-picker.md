# Date Picker

日付と期間を入力する。直接入力しても、Calendar から選んでもよい。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/date-picker.tsx`](../../../registry/components/ui/date-picker.tsx)、日付の処理は [`registry/lib/date.ts`](../../../registry/lib/date.ts) |
| 元にした実装 | shadcn/ui の Date Picker の例（Popover と Calendar の組み合わせ）。shadcn/ui には部品がないため、`DatePicker` と `DateRangePicker` を定めた |
| 状態 | v0.1 確定 |

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
| 期間の並べ方 | 置かれた領域の幅（Container Query、`@container/date-range`）で決める。24rem 以上は 1 行（開始日 〜 終了日 Calendar のボタン）。24rem 未満は、開始日と終了日を同じ幅で縦に並べ、Calendar のボタンを終了日の右に置く。「〜」は 1 行の並べ方だけで表示する | `@sm/date-range` |

期間の並べ方は、画面の幅ではなく、`DateRangePicker` が置かれた領域の幅で決める。幅が決まっている Sheet や Popover の中でも、開始日と終了日の欄の幅と位置がそろう（以前は画面の幅で「〜」の表示を決めていたため、狭い領域で「〜」だけが開始日の後に残り、終了日の欄が Calendar のボタンの分だけ狭くなっていた）。外側の要素（`data-slot="date-range-picker"`）の内側に、並べ方の要素を 1 つ置く。`data-slot`、入力欄、ボタン、送信の値は変わらない。`className` は外側の要素に付く。並べ方のクラス（`gap`、`items-*`、`flex-nowrap` など）を `className` で渡していた場合は効かなくなる（2026-11 の時点で、リポジトリの中に `DateRangePicker` へ `className` を渡している箇所はない）。

置く場所の制約：外側の要素は Container Query の容器（`container-type: inline-size`）であり、CSS の仕様により、内容の幅を自身の幅にしない。幅が内容で決まる場所に置くと、幅が 0 になり、入力欄が表示されない。

| 置く場所 | 幅 | 対処 |
| --- | --- | --- |
| ブロックの要素、幅が決まる flex の項目・grid の列（`1fr`、`minmax(0,1fr)`）、幅を指定した Sheet・Popover | 置かれた領域の幅（既定の `w-full`） | 不要 |
| `inline-flex` の要素、`position: absolute` で幅を指定しない要素、grid の `auto` の列、`w-max` の要素（幅を指定しない `PopoverContent` を含む） | 0 | `className` で幅を指定する（例：`w-96`、`w-[min(24rem,100%)]`）か、置く要素の幅を指定する |

部品の側で最小の幅を与える方法（`min-width`、`contain-intrinsic-inline-size`）は採らない。grid の `1fr` の列や flex の項目の最小の幅（`min-width: auto`）が変わり、既存の配置で横にはみ出すおそれがあるため。

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

- 受け付ける入力は、ロケールの表示形式（ja-JP は `2026/11/25`、`2026/1/5`）、ISO の `2026-11-25`、年が先のロケールでの区切りのない 8 桁（`20261125`）、ja-JP の `2026年11月25日`。全角の数字も受け付ける。年は 4 桁に限る。区切りの混在、空の区切り、先頭や末尾の余分な区切りは形式の誤りにする。ロケールごとの形式は [advanced.md](advanced.md#入力の形式) を参照する。
- 入力欄は `inputmode="numeric"` にする。モバイルでは数字のキーボードが開き、区切りのない 8 桁でも入力できる。
- 直接入力と Calendar は同じ値を表示する。入力中の文字が正しい日付であれば、Calendar を開いたときにその日を選んでいる。
- 存在しない日付や形式の誤りを、別の日付に変換しない。入力した文字は消さずに残す。
- 終了日が開始日より前でも、自動で入れ替えない。片側だけの指定もできる。必須にするかどうかは製品が決める。
- 値は日付だけを表す `Date`。`name`（期間は `startName`、`endName`）を指定すると `"YYYY-MM-DD"` を送信する。開始日と終了日はどちらも期間に含む（[advanced.md](advanced.md#日付だけの値の扱い)）。
- 送信する値は、入力中の文字から作る。不正な入力のまま送信しても、以前に確定した日付は送信しない（`""`）。不正な入力、範囲外、選べない日、開始日と終了日の逆転があると、`form.checkValidity()` は `false` になる。製品は送信の前に確かめる（[advanced.md](advanced.md#フォームの送信)）。
- Enter では確定してから、通常の入力欄と同じくフォームの送信を続ける。フォームの reset では `defaultValue` に戻る。`value` を外から変えると、入力欄の表示もそろえる。Invalid Date の `value` は未入力として扱う。
- プリセットのうち、`min`、`max`、`isDateDisabled` に合わない日で始まる・終わるものは押せない。
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
