# Label

入力欄が何の情報かを示す。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/label.tsx`](../../../registry/components/ui/label.tsx) |
| 元にした実装 | shadcn/ui の Label |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、入力欄に何を入れるかを迷わずに判断できるようにする。支援技術には、入力欄の名前として伝える。

## 2. Usage

- フォームの項目では `FieldLabel` を使う。`FieldLabel` は Label を描画に使い、関連付けを自動で行う。
- Field の外で使う場合は、`htmlFor` と入力欄の `id` で関連付ける。
- 入力欄の上に 8px 離して置く。
- 内容を短い名詞で示す（「会社名」）。補足は `FieldDescription` に分ける。
- 必須・任意の印は、少ない方にだけ付ける（[forms.md](forms.md#3-必須と任意)）。

## 3. Anatomy

| 部分 | 値 |
| --- | --- |
| 文字 | 14px（`text-ui`）、太さ 500 |
| 行の高さ | 1.375（`leading-snug`） |
| 印との間隔 | 8px（`gap-2`） |
| 折り返し | 日本語は文節で折り返す（`word-break: auto-phrase`） |

## 4. Variants

| 状態 | 表し方 |
| --- | --- |
| 通常 | `foreground` |
| 無効 | Field が無効のとき、または直前の入力欄（`peer`）が無効のとき、透明度 50% |
| 必須 | `FieldRequiredMark`（`*`、読み上げない） |
| 任意 | `FieldOptionalMark`（「任意」、読み上げる） |

## 5. Behavior

- ラベルを押すと、関連付けた入力欄にフォーカスが移る。Checkbox と Switch は切り替わる。
- 必須は `required` 属性で支援技術に伝わる。そのため `*` は `aria-hidden` にしている。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| プレースホルダーをラベルにする | 入力を始めると消える | ラベルを上に置く |
| ラベルに説明を詰め込む | 項目の名前がわかりにくい | 補足は `FieldDescription` |
| 必須と任意の両方に印を付ける | 印の意味が薄れる | 少ない方にだけ付け、凡例を置く |
| 理由なくラベルを左に置く | 視線の移動が増え、狭い画面で崩れる | 上に置く |
