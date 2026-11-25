# Dropdown Menu

いくつかの操作から、実行する操作を 1 つ選ぶ。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/dropdown-menu.tsx`](../../../registry/components/ui/dropdown-menu.tsx) |
| 元にした実装 | shadcn/ui の Dropdown Menu（Base UI 版） |
| 依存 | `@base-ui/react`、`lucide-react`、[`cn()`](../../../registry/lib/utils.ts) |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、対象に対してできる操作を一覧で確かめ、迷わずに 1 つを実行できるようにする。

## 2. Usage

- 行の操作（編集、複製、書き出し、削除）、表示の切り替えなどに使う。
- フォームで値を 1 つ選ぶ場合は [Select](select.md) を使う。Dropdown Menu は選んだ結果を残さず、フォームとして送信もしない。
- よく使う主要な操作は、メニューの奥に隠さずにボタンとして画面に置く（原則 07）。
- サブメニューは、項目が多く、まとまりが明確な場合だけに使う。

### 項目の構成

- 関連する操作をまとめ、論理的に異なるまとまりの間にだけ `DropdownMenuSeparator` を置く。
- 危険な操作は `variant="destructive"` にし、区切り線の後の最後に置いて他の操作と分ける。
- 取り消せない操作は、選んだ後に [Alert Dialog](alert-dialog.md) で確かめる。

### アイコン

- 編集（Pencil）、複製（Copy）、書き出し（Download）、削除（Trash）など、意味が広く共有されているアイコンを使う。
- 同じ種類の操作には、画面をまたいで同じアイコンを使う。
- 意味のないアイコンを、すべての項目に付けない。
- アイコンのない項目を、アイコンのある項目と同じメニューに置く場合は `inset` を付け、文字の位置をそろえる。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| メニュー（`DropdownMenuContent`） | 角丸 12px、余白 8px、1px の `border`、`popover`、影。幅 192px 以上 | `rounded-md`、`p-2`、`border-border`、`shadow-menu`、`min-w-48` |
| 項目（`DropdownMenuItem`） | 高さ 40px 以上、角丸 8px、左右の余白 12px、文字 14px | `min-h-10`、`rounded-sm`、`px-3`、`text-ui` |
| アイコン | 20px、文字との間隔 8px | `size-5`、`gap-2` |
| ハイライト（ホバー） | `accent` の面 | `data-highlighted:bg-accent` |
| フォーカス（キー操作） | `accent` の面と、項目の内側の 2px の枠 | `focus-visible:focus-ring`、offset −2px |
| 危険な操作 | 文字とアイコンを `destructive`。ハイライトの面は `accent` | `text-destructive` |
| 区切り線 | 1px の `border`、上下 8px | `h-px`、`my-2` |
| まとまりの名前（`DropdownMenuLabel`） | 12px、`muted-foreground` | `text-caption` |
| トリガーとの間隔 | 4px | `sideOffset={4}` |
| 開閉 | 180ms、透明度と大きさ（95% から） | `duration-(--duration-normal)` |

- 危険な操作の文字は、ハイライトした `accent` の上で 4.76:1 になる（[tokens.md](../tokens.md#コントラスト)）。
- `inset` は、アイコンの幅と間隔の分（12 + 20 + 8 = 40px）だけ左の余白を広げる。
- 角丸は、メニュー 12px、項目 8px である。[tokens.md](../tokens.md#3-radius角丸) の「外側の角丸 − 内側の余白」は、内側の要素が外側の輪郭に沿う同心円状のコンテナに使う判断基準であり、余白を空けて並ぶ操作の単位（項目）には機械的に当てはめない（計算では 12 − 8 = 4px になる）。項目の大きさと役割に合う 8px を使う。

```tsx
<DropdownMenu>
  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="山田商事の操作" />}>
    <Ellipsis />
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuGroup>
      <DropdownMenuItem><Pencil />編集</DropdownMenuItem>
      <DropdownMenuItem><Copy />複製</DropdownMenuItem>
      <DropdownMenuItem><Download />CSV で書き出す</DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive"><Trash />削除</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

## 4. Variants

| 部品 | 用途 |
| --- | --- |
| `DropdownMenuItem` | 操作を実行する。`variant="default"` と `"destructive"` |
| `DropdownMenuCheckboxItem` | 列の表示など、ON/OFF を切り替える。右端に Check を表示する |
| `DropdownMenuRadioGroup`、`DropdownMenuRadioItem` | 並べ替えの順など、1 つを選ぶ |
| `DropdownMenuLabel`、`DropdownMenuGroup` | まとまりと、その名前。`DropdownMenuLabel` は `DropdownMenuGroup` か `DropdownMenuRadioGroup` の中に置く（外に置くと Base UI がエラーを出す） |
| `DropdownMenuSub`、`DropdownMenuSubTrigger`、`DropdownMenuSubContent` | サブメニュー |
| `DropdownMenuShortcut` | キーボードショートカットの表示 |

名前と props は shadcn/ui と同じである。`DropdownMenuContent` の `align` の既定も shadcn/ui と同じ `start`。

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| 押す、Enter、Space、↓ | 開き、最初の項目にフォーカスを移す |
| ↑ ↓、Home、End | 項目を移る。端からは反対の端へ戻る |
| 文字を入力する | 先頭の文字が一致する項目へ移る |
| Enter、Space、押す | 実行して閉じ、フォーカスをトリガーに戻す |
| → ← | サブメニューを開く、閉じる |
| Escape、外側のクリック | 閉じる |

- 開いている間は、背景のスクロールと背景の操作を止める（Base UI の Menu の既定 `modal`）。
- ポインターを重ねた項目は `accent` の面だけで示し、キーで移った項目には加えて内側の枠を出す。キー操作の後にポインターを動かすと枠を消し、キーを押すと戻す。規則と理由は [overlays.md](overlays.md#6-キー操作のハイライト)。
- 選択中の CheckboxItem と RadioItem は Check で示す。フォーカスの枠とは別に示すため、両者を区別できる。
- `DropdownMenuCheckboxItem` で続けて切り替えさせたい場合は、`closeOnClick={false}` を指定する。
- 画面の端では、はみ出さないように位置と向きを変える。長い項目は省略せずに折り返す。
- 動きを減らす設定では、大きさを変えず、透明度だけで開閉する。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| フォームの値を Dropdown Menu で選ぶ | 選んだ結果が欄に残らず、送信もされない | Select を使う |
| 危険な操作を先頭や、他の操作の間に置く | 押し間違えやすい | 区切り線の後の最後に置く |
| すべての項目に意味の薄いアイコンを付ける | 探す手がかりにならず、画面が騒がしくなる（原則 04） | 意味が共有されているアイコンだけを付ける |
| 主要な操作をメニューの奥に入れる | たどり着くまでの負荷が増える（原則 07） | ボタンとして画面に置く |
| 必要のないサブメニューを作る | 操作の場所を覚える負荷が増える | 1 段のメニューと区切り線でまとめる |
