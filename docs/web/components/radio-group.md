# Radio Group

排他的な選択。Flow Design では、単一選択に Select を優先する。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/radio-group.tsx`](../../../registry/components/ui/radio-group.tsx) |
| 元にした実装 | shadcn/ui の RadioGroup（Base UI 版） |
| 状態 | 初期実装 |

## 1. Purpose

既存の画面と表現をそろえる必要がある場合に、排他的な選択を提供する。

## 2. Usage

- 新しいフォームの単一選択には Select を使う（[forms.md](forms.md#単一選択は-select-を優先する)）。
- Radio Group を使うのは、既存の画面との互換など、必要な理由がある場合だけにする。
- 同じフォームの中で、Select と Radio Group を単一選択に混在させない。
- グループには `FieldSet` と `FieldLegend` で名前を付け、各選択肢は `FieldItem` で囲む。
- 選択カード形式は使わない。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 本体 | 20×20px の円 | `size-5`、`rounded-full` |
| 未選択の枠 | 1px、`input` | `border-input` |
| 選択時 | 枠と中央の円（10px）を `primary` | |
| ラベルとの間隔 | 8px | `gap-2` |
| 押せる範囲 | 本体の外側 14px まで。行は 48px 以上 | `after:-inset-3.5`、`FieldItem` |

## 4. Variants

通常、選択、無効、フォーカス、エラー。無効は透明度 50%、エラーは未選択の枠を `destructive` にする。

## 5. Behavior

- Tab キーでグループに入る。フォーカスは選択中の選択肢（なければ先頭）に移る。
- ↑↓←→ キーで選択を移す。移した時点で選ばれる。
- グループの名前は `FieldLegend` から、各選択肢の名前は `FieldLabel` から付く。

```tsx
<Field>
  <FieldSet render={<RadioGroup defaultValue="medium" />}>
    <FieldLegend variant="label">従業員の規模</FieldLegend>
    <FieldItem>
      <RadioGroupItem value="small" />
      <FieldLabel>1〜49 人</FieldLabel>
    </FieldItem>
  </FieldSet>
</Field>
```

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 選択肢が少ないので Radio Group にする | Select と表現が混在する | Select |
| 選択カード形式にする | 装飾が増える | シンプルな Radio |
| 未選択の状態から戻せない設計にする | 一度選ぶと「選ばない」に戻せない | 「指定しない」の選択肢を用意する |
