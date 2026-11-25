# Popover

今の操作に関係する補足の情報や、小さな複合操作を、画面を移らずに表示する。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/popover.tsx`](../../../registry/components/ui/popover.tsx) |
| 元にした実装 | shadcn/ui の Popover（Base UI 版） |
| 依存 | `@base-ui/react`、[`cn()`](../../../registry/lib/utils.ts) |
| 状態 | 初期実装 |

## 1. Purpose

ユーザーが、今の作業を中断せずに、関係する情報を確かめたり、いくつかの条件を選んだりできるようにする。

## 2. Usage

- 一覧の絞り込み、担当者の連絡先の確認など、数個の条件や操作をまとめるときに使う。
- Button、Input、Checkbox、Select を置ける。Tooltip と違い、中で操作できる。
- 長いフォームや複雑な操作には使わない。外側のクリックで閉じるため、入力が失われやすい。[Dialog](dialog.md) か専用のページにする。
- 実行する操作を選ぶだけなら [Dropdown Menu](dropdown-menu.md) を使う。
- 短い補足を読むだけなら [Tooltip](tooltip.md) を使う。ただし Tooltip はタッチ操作では開かないため、タッチ端末で必要な補足は画面に文字で書くか、Popover にする。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 面（`PopoverContent`） | 角丸 12px、余白 16px、1px の `border`、`popover`、影 | `rounded-md`、`p-4`、`border-border`、`bg-popover`、`shadow-popover` |
| 幅 | 内容に合わせる。画面の空きと 360px の小さい方を上限にする | `w-max`、`max-w-[min(var(--available-width),22.5rem)]` |
| 高さ | 画面の空きを上限にし、超えると中をスクロールする | `max-h-(--available-height)` |
| トリガーとの間隔 | 4px | `sideOffset={4}` |
| タイトル（`PopoverTitle`） | 16px、600 | `text-body font-semibold` |
| 説明（`PopoverDescription`） | 14px、`muted-foreground` | `text-ui` |
| 部分の間隔 | 16px | `gap-4` |
| 開閉 | 180ms、透明度と大きさ（95% から） | `duration-(--duration-normal)` |

- 幅を決めたい場合は、`className` に `w-80` などを渡す。上限は残る。
- 閉じるボタンは原則として置かない。中に「閉じる」を置く場合は `PopoverClose` を使う。

```tsx
<Popover>
  <PopoverTrigger render={<Button variant="outline" size="sm" />}>
    <ListFilter />
    絞り込み
  </PopoverTrigger>
  <PopoverContent align="start" className="w-80">
    <PopoverHeader>
      <PopoverTitle>絞り込み</PopoverTitle>
    </PopoverHeader>
    {/* Checkbox、Select など */}
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm">条件をリセット</Button>
      <Button size="sm">適用</Button>
    </div>
  </PopoverContent>
</Popover>
```

## 4. Variants

| props | 既定 | 内容 |
| --- | --- | --- |
| `side` | `bottom` | 開く向き。空きが足りないときは反対側に開く |
| `align` | `center` | トリガーに対する位置。shadcn/ui と同じ既定。左端をそろえる場合は `start` |
| `sideOffset` | 4 | トリガーとの間隔 |
| `collisionPadding` | 8 | 画面の端から空ける距離 |

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| 押す、Enter、Space | 開き、フォーカスを中の最初の操作できる要素に移す |
| Tab | 中の要素を順に移る |
| Escape | 閉じ、フォーカスをトリガーに戻す |
| 外側のクリック | 閉じる |

- 非モーダル。背景を暗くせず、背景のスクロールも止めない。
- 中で Select を開いた場合、Escape は Select だけを閉じる。
- 画面の端では、はみ出さないように位置と向きを変える（Base UI）。
- 動きを減らす設定では、大きさを変えず、透明度だけで開閉する。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 長いフォームを入れる | 外側のクリックで入力が失われる。画面からはみ出す | Dialog か専用のページにする |
| 1 文の補足だけを入れる | 開く操作が必要になり、負荷が増える | 画面に文字で書くか、Tooltip |
| 実行する操作の一覧だけを入れる | Dropdown Menu のキー操作（↑↓、文字の入力）が使えない | Dropdown Menu を使う |
| Popover の中から、さらに Popover を開く | どこまで閉じたのかわからなくなる | 1 段にまとめる |
