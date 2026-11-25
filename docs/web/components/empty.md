# Empty

データがない理由と、次に行う操作を示す。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/empty.tsx`](../../../registry/components/ui/empty.tsx) |
| 元にした実装 | shadcn/ui の Empty |
| 状態 | 初期実装 |

## 1. Purpose

ユーザーが、データがない理由を理解し、次に何をすればよいかを迷わずに判断できるようにする。

## 2. Usage

| 状態（`status`） | 伝えること | 操作 |
| --- | --- | --- |
| データ未登録（`empty`） | 最初の登録を促す | 追加のボタン |
| 検索結果なし（`no-results`） | 条件の変更・解除を促す | 条件をリセットのボタン |
| 対応すべき項目なし（`complete`） | 正常な状態であることを伝える | 原則として置かない |
| 取得失敗（`error`） | 原因と再試行の手段を示す | 再試行のボタン |

- 取得の失敗を、データが 0 件の状態として表示しない（[advanced.md](advanced.md#7-空の状態)）。
- アイコン、説明、ボタンをすべて置く必要はない。タイトルだけで伝わる場合は、タイトルだけにする。
- 次に行う操作があるときだけ、ボタンを置く。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 全体（`Empty`） | 中央にそろえる。外枠と影なし。余白は上下 48px、左右 24px | `py-12`、`px-6` |
| アイコン（`EmptyMedia variant="icon"`） | 64px の `muted` の面、角丸 20px、Lucide のアイコン 32px（`muted-foreground`、取得失敗は `destructive`） | `size-16`、`rounded-xl`、`bg-muted`、`size-8` |
| タイトル（`EmptyTitle`） | 20px、太さ 600 | `text-heading` |
| 説明（`EmptyDescription`） | 14px、`muted-foreground` | `text-ui` |
| 操作（`EmptyContent`） | Button。間隔 8px | `gap-2` |
| 要素の間 | アイコンとタイトル 16px、タイトルと説明 8px、説明と操作 16px | |
| 幅 | 文章は 480px（30rem）で折り返す | `max-w-[30rem]` |

```tsx
<Empty status="no-results">
  <EmptyHeader>
    <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
    <EmptyTitle>条件に一致する顧客がいません</EmptyTitle>
    <EmptyDescription>条件を減らすと見つかる場合があります。</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button variant="secondary" onClick={reset}>条件をリセット</Button>
  </EmptyContent>
</Empty>
```

## 4. Variants

| 種類 | 使う場面 |
| --- | --- |
| アイコンあり | 一覧や表の領域など、十分な広さがある場合 |
| 文字だけ | 狭い表示領域（メニュー、サイドの欄など）。`EmptyMedia` を置かない |
| タイトルだけ | 説明が不要な場合 |

装飾のイラストを標準にしない。シンプルなアイコンを使う。

## 5. Behavior

- アイコンは飾りとして扱い、支援技術には読ませない（`aria-hidden`）。状態はタイトルの文字で伝える。
- 取得失敗の Empty を、操作の結果として後から表示する場合は、製品が `role="alert"` を付けて知らせる。最初から表示されている空の状態には付けない。
- 画面の一部の取得に失敗し、ほかの内容は使える場合は、Empty ではなく Alert を使う。
- Data Table のデータ未登録、検索結果なし、取得失敗の表示は、Data Display Components の `DataTableMessage` が Empty で描く（[data-table.md](data-table.md#データの状態)）。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 取得失敗を「データがありません」と表示する | 失敗に気付かず、データがないと誤解する | 原因と再試行を示す |
| 正常な空の状態に、意味のない操作を置く | 何かしなければならないと誤解させる | 操作を置かない |
| 大きなイラストで空の状態を飾る | 理解と判断に役立たず、画面の静けさを損なう | シンプルなアイコンにする |
| 空の状態を枠や影のあるカードで囲む | 周りの内容と同じ重さに見え、区切りが増える | 余白と文字の階層で示す |
| タイトルと同じ意味の説明を添える | 同じことを 2 回読ませる | 説明を省く |
