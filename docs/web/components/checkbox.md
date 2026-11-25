# Checkbox

複数の選択、同意、確認事項に使う。保存ボタンで反映するフォームの ON/OFF にも使う。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/checkbox.tsx`](../../../registry/components/ui/checkbox.tsx) |
| 元にした実装 | shadcn/ui の Checkbox（Base UI 版） |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、それぞれの選択肢を独立して選んだり、内容に同意したりできるようにする。

## 2. Usage

- 複数を選べる選択肢、規約への同意、確認事項に使う。
- フォームの中の ON/OFF も Checkbox にする。押した時点で反映する設定には Switch を使う（[forms.md](forms.md#checkbox-と-switch-の違い)）。
- ラベルは、チェックを入れた状態の意味で書く（「案内メールを受け取る」）。否定の言葉にしない。
- 選択肢のまとまりには `FieldSet` と `FieldLegend` で名前を付ける。
- 選択カード形式（枠で囲んだ大きな選択肢）は使わない。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 本体 | 20×20px、角丸 4px | `size-5`、`rounded-xs` |
| 未選択の枠 | 1px、`input` | `border-input` |
| 選択時 | 面と枠を `primary`、印を `primary-foreground` | |
| 印 | Lucide の Check（一部選択は Minus）、16px、線の太さ 3（2px 相当） | |
| ラベルとの間隔 | 8px | `gap-2` |
| 押せる範囲 | Field や `FieldItem` の中では行全体（高さ 48px 以上）。単独では本体の外側 14px まで（48×48px） | `min-h-control`、`after:-inset-3.5` |

印は 16px と小さいため、線の太さを `--icon-stroke-width: 3`（16px で 2px）に上書きしている。

## 4. Variants

| 状態 | 表し方 |
| --- | --- |
| 未選択 | 枠だけ |
| 選択 | `primary` の面と Check |
| 一部選択（`indeterminate`） | `primary` の面と Minus。親の項目で、子の一部が選ばれているとき |
| 無効 | 透明度 50%。切り替わらない |
| フォーカス | `focus-ring` |
| エラー | 未選択の枠を `destructive`。`FieldError` を添える |

## 5. Behavior

- Space キー、本体、ラベルで切り替わる。
- Base UI の Checkbox は `role="checkbox"` の要素と、フォーム送信用の隠れた入力欄を描画する。`name` と `value` で送信される。`id` は隠れた入力欄に付く。
- 一部選択は `aria-checked="mixed"` で支援技術に伝わる。

```tsx
<Field orientation="horizontal">
  <Checkbox name="agree" required />
  <FieldLabel>利用規約に同意する</FieldLabel>
</Field>
```

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 保存ボタンのあるフォームに Switch を置く | 押した時点で反映されたように見える | Checkbox |
| 否定のラベル（「受け取らない」） | チェックの意味を考えさせる | 肯定の言葉にする |
| 選択カード形式にする | 装飾が増え、選択の状態が目立たない | シンプルな Checkbox |
