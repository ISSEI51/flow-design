# Select

選択肢から 1 つを選ぶ。Flow Design の単一選択の標準。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/select.tsx`](../../../registry/components/ui/select.tsx) |
| 元にした実装 | shadcn/ui の Select（Base UI 版） |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、選んだ結果を 1 つの欄で確認しながら、1 つの選択肢を選べるようにする。

## 2. Usage

- 単一選択には、選択肢が 2 つでも Select を使う（[forms.md](forms.md#単一選択は-select-を優先する)）。
- 選択肢の数だけを理由に Radio Group へ変えない。
- 検索が必要なほど選択肢が多い場合は、将来の Combobox を使う。
- 選択肢の種類が分かれる場合は、`SelectGroup` と `SelectLabel` でまとめる。
- 未選択の状態を示すプレースホルダー（「選択してください」）は、ラベルの代わりにしない。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 欄（`SelectTrigger`） | 高さ 48px 以上、角丸 12px、余白 16px、文字 16px | Input と同じ |
| 開閉のアイコン | Lucide の ChevronDown、20px、開くと上を向く | `size-5` |
| メニュー（`SelectContent`） | 角丸 20px、余白 8px、`border`、`shadow-menu` | `rounded-xl`、`p-2` |
| 選択肢（`SelectItem`） | 高さ 40px 以上、角丸 12px、文字 16px | `min-h-10`、`rounded-md` |
| 選択中の印 | Lucide の Check、20px。太さ 500 | |
| 開閉 | 180ms、透明度と大きさ（95% から） | `duration-(--duration-normal)`、`ease-enter`、`ease-exit` |

メニューの角丸 20px と余白 8px から、選択肢の角丸は 20 − 8 = 12px にしている。

## 4. Variants

| 状態 | 表し方 |
| --- | --- |
| 未選択 | プレースホルダーを `muted-foreground` で表示する |
| 選択済み | 選んだ選択肢の名前を `foreground` で表示する |
| 開いている | アイコンが上を向く。選択中の選択肢に Check を表示する |
| 選択肢のハイライト | 面を `accent` にする。キーで移ったときは、加えて選択肢の内側に 2px の枠を出す |
| 無効 | 透明度 50%。開かない |
| エラー | 枠を `destructive` |

`size="sm"`（40px）は shadcn/ui との互換のために残している。

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| 押す、Enter、Space、↓ | 開き、選択中（なければ先頭）の選択肢にフォーカスを移す |
| ↑ ↓、Home、End | 選択肢を移る |
| 文字を入力する | 先頭の文字が一致する選択肢へ移る |
| Enter、押す | 選んで閉じ、フォーカスを欄に戻す |
| Esc | 選ばずに閉じ、フォーカスを欄に戻す |

- 選択肢が多い場合はメニューの中でスクロールする。メニューの高さは画面の空きと 24rem の小さい方。
- キーで選択肢を移ると、その選択肢が上下のスクロールのボタン（24px）に隠れない位置までスクロールする（`scroll-margin`）。
- キー操作のハイライトの規則は Dropdown Menu と共通である（[overlays.md](overlays.md#6-キー操作のハイライト)）。
- 選択肢と選んだ結果は、省略せずに折り返す。日本語は文節で折り返す。
- `items` を `Select` に渡すと、閉じた状態の欄に、値ではなく選択肢の名前が表示される。
- `name` を指定すると、隠れた入力欄でフォームとして送信される。
- 動きを減らす設定では、大きさの変化とアイコンの回転を止め、透明度だけで開閉する。
- shadcn/ui は、開いたメニューを欄に重ねる（`alignItemWithTrigger`）を既定にしている。Flow Design は欄の下に開くことを既定にしている。開閉の動きと位置がいつも同じになるため。

```tsx
<Field name="industry">
  <FieldLabel>業種</FieldLabel>
  <Select items={industries}>
    <SelectTrigger>
      <SelectValue placeholder="選択してください" />
    </SelectTrigger>
    <SelectContent>
      {industries.map((i) => (
        <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</Field>
```

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 選択肢が 2 つだけなので Radio Group にする | 単一選択の表現がフォームの中で混在する | Select にそろえる |
| 選択肢の名前を省略する | 選んだ内容を確認できない | 折り返して全文を表示する |
| プレースホルダーをラベルにする | 選んだ後に何の欄かわからない | `FieldLabel` を上に置く |
| 数百の選択肢を Select に入れる | 探すのに時間がかかる | 将来の Combobox を使う |
