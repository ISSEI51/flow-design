# Pagination

多くのデータを決まった件数ずつ表示し、現在の位置と全体の量を確かめながら移動する。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/pagination.tsx`](../../../registry/components/ui/pagination.tsx) |
| 元にした実装 | shadcn/ui の Pagination（Base UI 版） |
| 状態 | v0.1 確定 |

Data Display に共通する判断基準は [data-display.md](data-display.md) にまとめている。

## 1. Purpose

ユーザーが、いまどの範囲を見ていて、全体がどれだけあるかを把握しながら、目的のページへ少ない操作で移れるようにする。

## 2. Usage

- 表の下に置く。表示範囲、総件数、表示件数、ページ番号と前後の移動をそろえた `PaginationControls` を標準とする。[Data Table](data-table.md) では `DataTablePagination` を使う。
- 初めの表示件数は 50 件、選択肢は 25 / 50 / 100 件にする。
- 総件数を取得できる場合は表示する。取得していない総件数、ページ数、現在の位置を推測して表示しない。
- 総件数の取得に時間がかかる場合や、大規模なデータでは、カーソルによる前後の移動（`CursorPagination`）を使ってよい。
- 業務データの一覧では、無限スクロールを標準にしない。現在の位置と全体の量がわからず、特定の行に戻れないため。
- URL でページを表す場合は、`PaginationLink` に `href` を渡す。

## 3. Anatomy

| 部分 | 値 | トークン・クラス |
| --- | --- | --- |
| 表示範囲（`data-slot="pagination-range"`） | 「51–100 / 580件」。文字 14px、`tabular-nums` | `text-ui` |
| 表示件数 | 「表示件数」の文字と Select（高さ 40px、指の操作では 48px） | `SelectTrigger size="sm"` |
| ページ番号（`PaginationLink`） | 高さと最小の幅 40px、角丸 12px、左右の余白 8px。指の操作では 48px | `min-h-10 min-w-10 px-2 rounded-md`、`pointer-coarse:min-h-12` |
| 現在のページ | Button の `default`（`primary` の面）。それ以外は `ghost` | |
| 前へ、次へ | ChevronLeft / ChevronRight と「前へ」「次へ」。640px 未満では文字を `sr-only` にする | |
| 最初、最後 | ChevronsLeft / ChevronsRight。名前は「最初のページ」「最後のページ」 | |
| 省略記号（`PaginationEllipsis`） | 40px（指の操作では 48px）、`muted-foreground`、読み上げない | `aria-hidden` |
| 項目の間 | 4px | `gap-1` |

## 4. Variants

| 部品 | 使う場面 |
| --- | --- |
| `Pagination`、`PaginationContent`、`PaginationItem`、`PaginationLink`、`PaginationPrevious`、`PaginationNext`、`PaginationEllipsis` | shadcn/ui と同じ名前の部品。並びを製品が組み立てる |
| `PaginationFirst`、`PaginationLast` | 最初と最後のページへの移動（Flow Design で追加） |
| `PaginationControls` | 総件数がわかる一覧。総件数がわからない一覧（`totalCount` を渡さない） |
| `CursorPagination` | カーソルで前後に移動する一覧 |

### 状態

| 状態 | 表し方 |
| --- | --- |
| 0 件 | 表示範囲を「0件」にし、ページ番号を表示しない。前へ、次へは無効 |
| 総件数がわからない | 表示範囲を「51–100件目」にし、総件数とページ番号を表示しない。次へは `hasNextPage` で有効にする |
| 最初のページ | 前へ、最初へが無効 |
| 最後のページ | 次へ、最後へが無効 |
| 処理中（`disabled`） | 現在のページ以外の操作が無効 |

## 5. Behavior

### ページ番号の並び

`getPaginationItems(page, pageCount, siblingCount)` が、最初と最後のページ、現在のページとその前後 `siblingCount` ページを並べ、間を省略記号にする。

- 並びの長さは 5 + `siblingCount` × 2 で一定である（`siblingCount` が 1 なら 7）。ページを移動しても項目の数が変わらず、ボタンの位置が大きく動かない。
- ページ数が並びの長さ以下なら、すべてのページを並べる。
- 例（全 12 ページ、`siblingCount` 1）：1 ページ目は「1 2 3 4 5 … 12」、6 ページ目は「1 … 5 6 7 … 12」。
- 640px 未満の幅では `siblingCount` を 0 にし（例：「1 … 6 … 12」）、最初と最後への移動を表示しない。幅の判定は `useSyncExternalStore` で行い、サーバーでの描画と Hydration の間は広い画面の並びにする。サーバーとブラウザの HTML を一致させるためである（検品は `preview/tests/data-display-ssr.spec.ts`。`npm run test:ssr` で実行する）。
- 最初と最後への移動は、既定ではページ数が 7 を超えるときに表示する（`showFirstLast` で指定できる）。

### 移動

- 移動した後も、フォーカスをページ送りの中に残す。押したボタンが無効になった場合（最初、最後のページに着いた場合）や、並びが変わってボタンが消えた場合は、現在のページのボタン（カーソル方式では残っているボタン）へ移す。ブラウザは無効になったボタンから後でフォーカスを外すため、フォーカスのある要素が無効かどうかも確かめる。
- `disabled`（読み込み中など）の間は、ページ番号、前後の移動、表示件数の選択を受け付けない。現在のページは示したままにし、フォーカスの移り先として残す。
- ページが 1 つだけの場合は、ページ番号は 1 だけを示し、前へと次へを無効にする。
- ページ番号は `button` で描画し、`onPageChange` を呼ぶ。`href` を渡すと `a` で描画し、支援技術にはリンクとして伝わる（Base UI の Button に `a` を描画させると `role="button"` が付くため、`a` は Button を使わずに `buttonVariants` のクラスで描画する）。無効な `a` からは `href` を外し、`aria-disabled="true"` を付ける。
- 現在のページには `aria-current="page"` が付く。ページ番号の名前は「3ページ目」。見えている数字が名前の先頭に含まれる。
- 全体は `nav` で、名前は既定で「ページ送り」。1 つの画面に複数ある場合は `aria-label` で区別する。
- 表示範囲は `aria-live="polite"` で、移動すると「580件中 51〜100件目」と読み上げる。画面の表記（「51–100 / 580件」）は記号を含むため、読み上げ用の文を別に持つ。

### 件数の変化

- 表示件数を変えたときは、いま表示している先頭の項目を含むページへ移る（`pageForPageSize`）。例：50 件ずつの 3 ページ目（101 件目から）で 100 件ずつに変えると、2 ページ目になる。
- 検索や絞り込みでページ数が減り、現在のページが存在しなくなった場合は、最後のページへ移る（`onPageChange(pageCount)` を呼ぶ）。存在しないページを表示しない。

### カーソル

- `CursorPagination` は、前へと次へだけを表示する。`hasPrevious` と `hasNext` で有効と無効を決める。
- `shownCount` を渡すと「50件を表示中」と示す。総件数、ページ数、現在の位置は表示しない。

```tsx
<PaginationControls
  page={page}
  pageSize={pageSize}
  totalCount={580}
  onPageChange={setPage}
  onPageSizeChange={(size, nextPage) => {
    setPageSize(size)
    setPage(nextPage)
  }}
/>
```

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 業務の一覧で無限スクロールを標準にする | 現在の位置と全体の量がわからない。特定の行に戻れない | Pagination |
| 取得していない総件数やページ数を推測して表示する | 実際と異なる値で判断させる | 総件数を表示しない。`CursorPagination` |
| ページ数に応じて並びの長さを変える | ボタンの位置が動き、押し間違える | `getPaginationItems` |
| 表示件数を変えたときに 1 ページ目に戻す | 見ていた行を探し直す必要がある | 先頭の項目を含むページへ移る |
| 0 件のときに「1–0 / 0件」と表示する | 意味のない範囲になる | 「0件」 |
| 現在のページを色だけで示す | 支援技術に伝わらない | `aria-current="page"` |
| ボタンを 32px にする | 指で押しにくい | 40px、指の操作では 48px |
