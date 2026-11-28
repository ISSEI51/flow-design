# Multi Select

多くの選択肢から、検索して複数を選ぶ。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/multi-select.tsx`](../../../registry/components/ui/multi-select.tsx) |
| 元にした実装 | shadcn/ui に同じ部品はない。Base UI の Combobox（`multiple`）と、Flow Design の Combobox のメニュー、検索欄、状態の表示を使う |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、多くの選択肢から必要なものを探して選び、選んだ内容を閉じた欄で確かめられるようにする。

## 2. Usage

- 選択肢をすべて並べても画面の流れを妨げない数なら、Checkbox を使う。検索が必要な数のときに Multi Select を使う。
- Combobox と同じ操作で開き、検索し、選ぶ。
- 値は選択肢の `value`（安定した一意の ID）の配列である。表示名を値にしない。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 欄 | 高さ 48px 以上、角丸 12px、1px の `input`。左右の余白 8px / 48px | `min-h-control`、`rounded-md`、`border-input` |
| 選択済みの項目 | 高さ 32px、角丸 8px、`muted` の面、文字 14px。長い名前は省略する | `h-8`、`rounded-sm`、`bg-muted`、`text-ui` |
| 解除のボタン | 32 × 32px、Lucide の X（16px）。名前は「〇〇を解除」 | `size-8` |
| 件数 | 「他 N 件」。14px、`muted-foreground` | `text-ui` |
| メニュー、検索欄 | Combobox と同じ | |
| 選択の状況 | 「N 件を選択中」と「すべて解除」。上限があるときは「（最大 N 件）」 | `text-ui` |
| 選択肢 | 高さ 40px 以上。左に Checkbox と同じ形の印（20px、角丸 4px）。ハイライトは Combobox と同じ | `min-h-10` |

```tsx
<Field>
  <FieldLabel>配送エリア</FieldLabel>
  <MultiSelect options={prefectures} value={regions} onValueChange={setRegions} name="regions" />
</Field>
```

## 4. Variants

| 状態 | 表し方 |
| --- | --- |
| 0 件 | プレースホルダー |
| 1〜3 件 | すべて個別に表示する |
| 4 件以上 | 3 件を個別に表示し、残りを「他 N 件」で示す（`displayLimit` で変える） |
| 上限に達した | ほかの選択肢を選べなくし（`aria-disabled`）、理由をメニューに示す（`max`） |
| 無効 | 透明度 50%。解除のボタンを出さない |
| 読み取り専用 | 面を `muted`。開かず、解除のボタンを出さない |
| エラー | 枠を `destructive` |

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| 欄を押す、Enter、↓ | 開き、検索欄にフォーカスを移す。選択済みの項目を先頭に並べる |
| 文字を入力する | 部分一致で絞り込む |
| Enter、押す | 選ぶか解除する。欄の表示がすぐに変わり、メニューと検索文字列は残る |
| Esc、外側を押す | 閉じる。選んだ内容は残る |
| 解除のボタン | その項目を解除し、フォーカスを次の項目の解除のボタン（なければ欄）に移す |
| すべて解除 | すべての選択を解除する |

- すべての選択済みの項目に、名前と解除の手段がある。「他 N 件」に含まれる項目は、メニューの選択肢（`aria-selected`）で確かめて解除する（[advanced.md](advanced.md#3-multi-select-の選択済みの表示)）。
- 解除のボタンは 32 × 32px。隣の解除のボタンとは 8px 以上離れ、開閉のアイコンの領域と重ならない。項目の名前の部分を押すとメニューが開き、解除はしない。
- 欄の全体は Base UI のトリガー（`role="combobox"`）である。解除のボタンはトリガーの外の兄弟要素としてトリガーの上に重ね、button を入れ子にしない。トリガーの中には、選択中のすべての項目の名前を支援技術向けに入れる。
- 選ぶたびに `onValueChange` を呼ぶ。確定ボタンは置かない。選択の状態と、製品への保存は別のものとして扱う。重い処理が続く場合だけ、製品が適用ボタンを置いてよい。
- 開いている間は並びを変えない。選ぶたびに項目の位置が動かないようにするため。
- サーバー側で検索する場合は `filter={null}` と `onSearchChange`、`searchStatus` を渡す（`useComboboxSearch`）。検索結果に含まれない選択済みの項目も、値と表示名を保つ。読み込んでいない項目を、まとめて選ぶ操作は提供しない。
- `name` を指定すると、選んだ ID ごとに隠れた入力欄を作って送信する（`FormData.getAll(name)`）。
- 一覧は `ComboboxContent` を使うため、後からモーダルが開いた場合は Combobox と同じく背面に入る（[combobox.md](combobox.md)）。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 5 つ程度の選択肢に Multi Select を使う | すべてを見るために開く操作が増える | Checkbox を並べる |
| 1 件選ぶたびにメニューを閉じる | 複数を選ぶたびに開き直す必要がある | 開いたまま選べるようにする |
| 選んだ項目を件数だけで示す | 何を選んだかを開かないと確認できない | 3 件までは名前を表示する |
| 欄のトリガーの中に解除のボタンを入れる | button の入れ子は不正な HTML で、キーボードで操作できない | トリガーの外に置いて重ねる |
| 表示名を値にする | 名前が変わると値が変わる。同じ名前を区別できない | 安定した ID を値にする |
