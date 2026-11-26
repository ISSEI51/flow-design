# Data Browsing

利用者が目的の情報を見つけ、確かめ、必要な操作を行うまでを扱う Patterns のグループ。Search & Filter、List & Detail、Bulk Actions、View Switching、Data States の 5 種類からなる。

状態：初期実装（レビュー前。v0.1 確定ではない）

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/data-browsing-dark.svg">
  <img alt="Data Browsing の 5 種類の関係の図。左から右に、Search & Filter（見つける。検索、フィルター、ソート）、List & Detail（確かめる。一覧、詳細、一覧への復帰）、Bulk Actions（まとめて操作する。選択、確認、結果）が矢印でつながっている。List & Detail の上に View Switching（目的に合う形で見る。Table、List、Card、Kanban、Calendar）があり、データ表示の領域に適用することを示している。3 つの段階の下に、全体にわたる帯として Data States（状態を正しく伝える。読み込み、再取得、Empty、Error、部分的な失敗）があり、3 つの段階のすべてに共通することを示している。" src="../../diagrams/data-browsing-light.svg">
</picture>

## Components と Patterns の関係

Data Table、Input、Select、Combobox、Multi Select、Date Picker、Checkbox、Popover、Sheet、Drawer、Dialog、Alert Dialog、Dropdown Menu、Skeleton、Empty、Alert、Toast、Progress は Components（v0.1）である。Data Browsing は、これらと App Structure の Page Layout、Page Header、Section Layout を組み合わせる。

既存の機能を再実装しない。Data Table の検索欄（`DataTableSearch`）、適用中の条件（`DataTableAppliedFilters`）、選択の Checkbox、件数と一括操作のバー（`DataTableSelectionBar`）、Pagination、データの状態（`status`）は、そのまま使う。Data Browsing の再利用できるコードは、次の 2 つを担う。

- 表の外で持つ状態（検索語、フィルター、ソート、ページ、選択、取得の状態）を、Data Table の `useTable` の `state` と `on*Change` に渡せる形で持つ hook。Data Table の状態の仕組みを置き換えない。
- Components にない、パターンに固有の小さな部品（表示形式の切り替え、横スクロールの手がかり、一括操作の結果、欠損値の表示など）。

## 5 種類

| Pattern | 目的 | 資料 | 再利用できるコード（`registry/patterns/`） |
| --- | --- | --- | --- |
| Search & Filter | 目的の情報を見つける | [search-and-filter.md](search-and-filter.md) | `browse-query.ts`：`useBrowseQuery`、`useFilterDraft`、`countActiveFilters` |
| List & Detail | 一覧から詳細を確かめ、一覧に戻る | [list-and-detail.md](list-and-detail.md) | `list-detail.ts`：`getRecordNeighbors`、`captureListPosition`、`useListPositionRestore`<br>`table-scroll-area.tsx`：`TableScrollArea` |
| Bulk Actions | 選んだ複数の行にまとめて操作する | [bulk-actions.md](bulk-actions.md) | `bulk-selection.ts`：`useBulkSelection`、`useBulkAction`、`BulkRequestError`<br>`bulk-actions.tsx`：`BulkRunStatus`、`BulkResultAlert` |
| View Switching | 作業の目的に合う表示形式で見る | [view-switching.md](view-switching.md) | `view-switcher.tsx`：`ViewSwitcher`、`ViewSwitcherMenu`、`resolveInitialView`、`useViewScopedState` |
| Data States | データの状態を正しく伝える | [data-states.md](data-states.md) | `browse-data.ts`：`useBrowseData`、`useDelayedFlag`、`getBrowseViewState`<br>`data-states.tsx`：`LoadingReveal`、`DataRefreshIndicator`、`DataRegionError`、`DataValue` |

### コードと資料の区分

| 区分 | 内容 | 理由 |
| --- | --- | --- |
| 再利用できるコード | 上の表の hook と部品 | 古い応答の破棄、選択の範囲、対象の固定、フォーカスとスクロールの復元、IME と Debounce は、製品ごとに書き直すと誤りやすい。Registry で品質を保つ |
| 組み合わせの例（プレビュー） | 顧客の一覧（`CompanyBrowser`）、詳細の Sheet と別ページ、編集の Sheet、Kanban と Calendar の閲覧、Split View、Inline Expansion、営業管理の検証画面 | 画面の構成は、製品のデータと作業で変わる。1 つの巨大な Data Browsing の部品にせず、組み合わせ方を示す |
| 設計の資料だけ | 表示方式（Sheet、別ページ、Split View、Inline Expansion）の選び方、固定列を使う条件、全件の選択を元の条件に固定する方式、表示形式の選び方、詳細の情報の順序、確認の方法の選び方 | 画面ごとの判断であり、コードでは決められない |
| 製品の責務 | データの取得（API）、URL への同期と保存、権限、一括操作の実行と冪等性、対象の確定と件数の検証、ルーターとの接続 | 製品の基盤に依存する |

## 使い方の流れ

1. 検索の対象と、よく使う条件を決める（[search-and-filter.md](search-and-filter.md)）。`useBrowseQuery` で条件を持つ。
2. 条件に対応するデータを取得する（[data-states.md](data-states.md)）。`useBrowseData` に取得の処理を渡すか、製品のデータ取得の仕組みで同じ規則を守る。
3. 一覧を Data Table で描画し、詳細の表示方式を選ぶ（[list-and-detail.md](list-and-detail.md)）。
4. 一括操作が必要な場合だけ、選択と操作を加える（[bulk-actions.md](bulk-actions.md)）。
5. 異なる作業の目的がある場合だけ、表示形式の切り替えを加える（[view-switching.md](view-switching.md)）。

```tsx
const browse = useBrowseQuery<Filters>({ defaultFilters, debounceMs: 300 })
const data = useBrowseData({
  query: browse.query,
  fetcher: (q, { signal }) => api.listCustomers(q, { signal }), // 製品の API
  scopeKey: workspaceId,
})
const rows = data.data?.rows ?? []
const total = data.isCurrent ? (data.data?.total ?? null) : null
const selection = useBulkSelection({
  queryKey: JSON.stringify({ search: browse.query.search, filters: browse.query.filters }),
  query: browse.query,
  scopeKey: workspaceId,
  visibleIds: rows.map((r) => r.id),
  total,
})
const table = useTable({
  ...dataTableDefaults,
  features: dataTableFeatures,
  columns,
  data: rows,
  getRowId: (r) => r.id,
  state: { sorting: browse.query.sorting, pagination: browse.query.pagination, rowSelection: selection.rowSelection },
  onSortingChange: browse.onSortingChange,
  onPaginationChange: browse.onPaginationChange,
  onRowSelectionChange: selection.onRowSelectionChange,
  manualFiltering: true,
  manualSorting: true,
  manualPagination: true,
  rowCount: total ?? undefined,
  autoResetPageIndex: false,
})

<DataTableSearch placeholder="会社名・電話番号で検索" value={browse.searchInput} onValueChange={browse.setSearchInput} />
<LoadingReveal loading={data.status === "loading"}>
  <TableScrollArea>
    <DataTable table={table} status={data.status === "idle" ? "loading" : data.status} filtered={browse.isFiltered} … />
  </TableScrollArea>
</LoadingReveal>
```

## 状態管理の設計

| 状態 | 持つ場所 | 内容 |
| --- | --- | --- |
| 条件 | `useBrowseQuery` の `query`（`BrowseQuery`） | 適用した検索語、フィルター、ソート、ページ番号、ページサイズ。`query` と `onQueryChange` で製品が制御し、URL などと同期できる |
| 検索欄の入力値 | `useBrowseQuery` の `searchInput` | 適用した検索語とは別に持つ。Debounce の後、または `applySearch` で適用する |
| 編集中の条件 | `useFilterDraft` の `draft` | Sheet や Drawer でまとめて適用する条件。開いたときに適用済みの条件を写し、閉じたときに破棄する |
| データ | `useBrowseData` | 表示するデータ、そのデータの条件のキー（`dataKey`）、状態（`idle`、`loading`、`refreshing`、`ready`、`error`）、同じ条件の再取得の失敗（`refreshFailed`） |
| 一括操作の選択 | `useBulkSelection` | 行の ID（`ids`）か、検索条件と除外した ID（`all`）。詳細を表示中の行（`activeRowId`）とは別に持つ |
| 一括操作の実行 | `useBulkAction` | 実行中の操作と固定した対象、実際の進捗、最後の結果 |
| 表示形式 | 製品（`useState` など） | 最初の値は `resolveInitialView` で決める |
| 表示形式ごとの状態 | `useViewScopedState` | Kanban のグループ、Calendar の表示期間など。Table のページ番号は `BrowseQuery` の `pagination` で持つ |
| 一覧の位置 | `captureListPosition` の値を製品が保存する | 縦と横のスクロールの位置、フォーカスしていた行の ID と位置 |

Registry の部品は、どの状態も保存しない（LocalStorage、セッションのストレージ、データベース、URL に依存しない）。保存と復元の値の受け渡しは、`initialQuery`、`query`、`initialData`、`position` などの引数で行う。

## プレビュー

`npm run preview:dev` で開き、上部の「Patterns：Data Browsing」から選ぶ。

| ページ | URL | 内容 |
| --- | --- | --- |
| Search & Filter | `#/search-filter` | サーバー側の検索と追加の条件（Sheet）、入力値と適用した検索語、古い応答の破棄、Popover の即時適用、比較 |
| List & Detail | `#/list-detail` | 非モーダルの Sheet、編集の Sheet、Split View、Inline Expansion、横スクロールの手がかり、比較 |
| Bulk Actions | `#/bulk-actions` | ページをまたぐ選択、全件の選択、一部失敗と再試行、結果が不明な場合、進捗、比較 |
| View Switching | `#/view-switching` | 5 つの表示形式、セグメント型とアイコンだけの切り替え、検証画面の組み合わせ、比較 |
| Data States | `#/data-states` | 状態の区別（8 つの結果）、部分的な失敗、欠損値、長時間の処理、アカウントの切り替え、比較 |
| 営業管理の検証画面 | `#/browsing-app?page=customers` | 5 種類を組み合わせた顧客の一覧と詳細ページ（`page=customer&id=C-00001`）。下部の「検証用の操作」で、応答の時間、件数の有無、一括操作の結果、ワークスペース、取得の失敗を切り替える |

検証画面の URL の引数：`page`、`id`、`ws`（ワークスペース）、`status`、`owner`、`regions`、`feeMin`、`feeMax`、`renewalFrom`、`renewalTo`、`sort`（`monthlyFee.desc` の形）、`p`（ページ番号）、`size`、`view`（`table`、`board`、`calendar`）。検索語は、電話番号を含みうるため URL に入れない（履歴の項目ごとの記録にだけ持つ）。

検証画面は Data Browsing の検証のためのものであり、正式な Pages の実装ではない。App Structure の検証画面（`structure-app`）は変更せず、同じ Sidebar（`StructureSidebar`、`structureNav`）を使う別の画面として作った。

プレビューのページは、Registry の `@/patterns/*` と `@/components/ui/*` を読み込み、複製しない。模擬のサーバーと例のデータは `preview/src/data/data-browsing/` にあり、Registry には含めない。検証のための遅延と失敗は、模擬のサーバー（`window.__fdBrowseServer`）だけで設定する。

## 製品の責務（共通）

- データの取得（API の呼び出し、認証、権限）。`useBrowseData` には取得の処理を渡す。
- URL への同期と保存。個人情報を含みうる値（電話番号での検索語など）を、無条件に URL に入れない。
- 一覧の位置の保存（履歴の項目ごと）と、ルーターとの接続。
- 一括操作の実行、冪等性の保証、対象の確定、権限の確認、件数の検証、処理の対象の固定（バックエンド）。
- 表示形式の保存（URL、前回の値）。
- ページの移動を含む未保存の変更の管理（Forms & Workflows で扱う）。

## 既存の Components と App Structure への影響

| 対象 | 変更 | 互換性 |
| --- | --- | --- |
| `DataTableSelectionBar`（`registry/components/ui/data-table.tsx`） | `selectAll` に `matchingCount` の省略（件数がわからない場合）、`excludedCount`（全件の選択から外した件数）、`hasMore`（件数がわからない場合に、ページの外にデータがあるか）を追加した | 既存の呼び出し（`matchingCount` に数値を渡す）の表示と動作は変わらない。既存の文言（「検索条件に一致する 580件をすべて選択」など）も変えていない |
| その他の Components | 変更なし | |
| App Structure（`registry/patterns/` の 6 ファイル、資料、検証画面） | 変更なし | `AppShellMain` の既存の `scrollOnNavigate`、`focusOnNavigate`、`useAppShell().mainRef` を使う |
| プレビュー | `catalog.ts` に分類「Patterns：Data Browsing」と 6 ページを追加した。`package.json` の `test:patterns` に `data-browsing` を追加した | 既存のページの id と URL は変わらない |

プレビューの検証画面は、App Structure の `StructureSidebar`、`ProductMark`、`structureNav`、`PlaceholderScreen`、Overlays の `DiscardAlert`、Data Display の `FilterSelect`、`StatusText`、`customers` を読み込んで使う（複製も変更もしない）。

## 独自に判断した事項

指示書に定めのない点、または既存の仕様と関わる点を、次のように決めた。レビューで見直す。

| 事項 | 判断 | 理由 |
| --- | --- | --- |
| ページサイズを変えたときのページ番号 | 既定は、表示していた先頭の行を含むページへ移る（`pageSizeChange: "keep-position"`）。`"first-page"` を指定すると 1 ページ目に戻す | Pagination v0.1 の仕様（`pageForPageSize`、「表示件数を変えたときに 1 ページ目に戻す」をアンチパターンとしている）に合わせた。指示書の「原則として先頭ページに戻す」と異なるため、レビューで確認する。検索語、フィルター、ソートの変更では 1 ページ目に戻す |
| 再取得の失敗 | 同じ条件の再取得の失敗は、前のデータを残し、warning の Alert と取得した時刻を示す（`refreshFailed`）。条件を変えた後の取得の失敗は `error` にし、前の条件のデータを結果として表示しない | 同じ条件の前のデータは、その条件の最後の確定した結果である。条件を変えた後の前のデータは、現在の条件の結果ではない |
| 結果が不明な行の選択 | 選択を解除し、結果の表示に件数と説明を残す。再試行のボタンを置かず、「最新の状態を確認」を置く | 選択を残すと、同じ操作をもう一度押して重複して実行するおそれがある |
| 全件の選択と条件の変更 | 条件を変えたら全件の選択を解除し、`notice`（「検索条件を変更したため、検索結果全件の選択を解除しました」）で知らせる方式を実装した。元の条件に固定する方式は、資料で示すだけにした | 選択の対象が暗黙に広がったり、変わったりしない。固定する方式は、表示中の行と選択の対象の関係を示す UI が別に必要になる |
| 検索語と URL | 検証画面では、検索語を URL に入れない。フィルター、ソート、ページ、表示形式だけを `history.replaceState` で同期する | 検索欄で電話番号を検索できるため。条件の変更のたびに履歴を増やさない |
| 200ms の遅延 | 遅らせるのは表示（`LoadingReveal`、`DataRefreshIndicator`、`useDelayedFlag`）だけ。操作の制限（Data Table の locked、一括操作の無効化）は、取得の状態そのものですぐに行う | 指示書の「安全性に必要な処理を 200ms 遅らせない」 |
| 再取得中の件数 | 前の件数を残し、薄い色（`muted-foreground`）にする。件数の読み上げは、結果が確定したときだけ行う | 件数の文字が「件数を確認中」などに毎回入れ替わると、短い取得でちらつく。読み上げは検索のたびに重ねない |
| モバイルの一括操作のバー | 選択中だけ、main の中の `sticky` の要素として画面の下に置く。バーの高さを `--toast-offset-bottom` に設定し、Toast を上げる | `sticky` の要素は内容の流れの中に場所を取るため、最後の行と Pagination を隠さない。Toast との重なりは `toast.md` の方法で避ける |
| 横スクロールの手がかり | Table と DataTable を変更せず、`TableScrollArea` で囲み、中の `data-slot="table-container"` を測る | 既存の Table（v0.1）の DOM と API を変えない |
| 表示形式の切り替えのセマンティクス | セグメント型を `radiogroup`（1 つだけ選ばれ、矢印キーで移動して選ぶ）にした | 選択肢のうち常に 1 つが選ばれている状態であり、Tab で 1 回で抜けられる |
| 検証画面 | App Structure の検証画面を拡張せず、別の画面 `browsing-app` として作った | App Structure の v0.1 の最終調整と並行しているため、共有するファイルの変更を避けた |
| 全件の選択の件数 | 総件数がわからない場合は、「検索条件に一致するすべてのデータを選択中」と示し、件数を示さない。件数は実行の時点でバックエンドが確定する | 架空の件数を示さない |
| 一括操作がすべて完了したときの知らせ | 選択を解除し、Toast で知らせる（担当者の変更は「元に戻す」を示す）。失敗か結果の不明を含む場合だけ、`BulkResultAlert` を一覧の上に残す | すべて完了した結果は、確かめ直す必要がない。部分的な失敗は Toast だけで伝えない |
| 全件の選択の要求そのものの失敗 | `requestError.outcome` が `failed`（処理されていない）なら、選択を残し、同じ対象で「もう一度実行」できる。`unknown` なら選択を解除し、「最新の状態を確認」を置く | 処理されていない要求は安全に繰り返せる。処理されたかわからない要求は、重複のおそれがある |
| 一括操作の実行中のスコープの変更 | `useBulkAction` の `scopeKey` が変わったら、実行の待機を中止し、結果を表示しない。`BulkTarget` にスコープを持たせ、別のスコープの選択に結果を反映しない | 別のワークスペースの結果と選択を、新しいワークスペースに残さない |
| 範囲の外のページ | 0 行で `pageIndex > 0` の結果を受け取ったら、表を再取得中として表示し、最後のページへ戻して取得し直す（検証画面の製品側のコード） | 最後のページの行をすべて削除した後に、未登録や 0 件と誤って表示しない |
| 編集の Sheet | 閲覧の Sheet の中に入れ子にせず、独立したモーダルの Sheet として置く | Base UI の入れ子の Dialog は背景（Backdrop）を描かないため、編集の間に背景が暗くならず、モーダルであることが伝わらない |
| 削除の確認 | Alert Dialog は実行のボタンで閉じ、実行中は件数の行の `BulkRunStatus` で示す | 実際の進捗を、一括操作のバーの位置で示すため。Data Table の資料の一括削除の流れ（Dialog を開いたまま処理中にする）とは異なる。レビューで確認する |

## 検品

- 実機（iOS Safari、Android）とスクリーンリーダー（VoiceOver、NVDA）による検品は行っていない。

| 対象 | 検品（`preview/tests/`） |
| --- | --- |
| 資料のページ（5） | `data-browsing.spec.ts`：名前、h1 が 1 つ、横スクロールなし、操作の名前 |
| Search & Filter | 日本語の IME の変換中に検索しないこと、Debounce、短時間の連続した入力、古い応答の破棄、取得の失敗と再取得、即時の適用、まとめて適用とキャンセル、Chip の個別の解除、すべての解除、ページ番号のリセット、正確な件数と件数がわからない場合、モバイルの Drawer |
| List & Detail | 行全体のクリック、Checkbox、リンク、Dropdown Menu との分離、文字の選択、キーボードでの詳細の表示、非モーダルの Sheet からの切り替え、モーダルの編集、未保存の変更の確認、詳細の取得の競合、一覧への復帰とスクロールの位置とフォーカスの復元、横スクロールの手がかり、固定列、領域の幅の変化 |
| Bulk Actions | 個別の選択、ページ内の全選択と Indeterminate、ページをまたぐ選択、条件の変更の後の選択、表示していない件数、全件の選択と対象の固定、詳細の表示との分離、二重実行の防止、すべて成功、すべて失敗、一部失敗、失敗した行だけの再試行、結果が不明な場合、モバイルの操作のバー |
| View Switching | 表示形式の切り替え、データ領域の直上・右の配置、検索とフィルターの維持、選択の維持、表示形式ごとの状態、キーボードの操作、アクセシブルな名前、モバイルでの折り返し |
| Data States | 初回の読み込み、200ms 未満の取得、遅い取得、再取得中の既存のデータ、古いデータへの操作の制限、再取得の失敗、未登録と検索結果 0件、全体の失敗と部分的な失敗、欠損値と 0 の区別、実際の進捗、アカウントの切り替えでのデータの破棄、`aria-busy`、動きを減らす設定 |
| SSR と Hydration | `ssr-data-browsing.spec.ts`：window と document なしの描画、Hydration の不一致なし、`registry/patterns` の `"use client"` の境界 |

`data-browsing.spec.ts` と `ssr-data-browsing.spec.ts` は `npm run test:components` に含まれる。Patterns だけを実行する場合は `npm run test:patterns`。

### 検証の結果

- 実施日：2026-11-26
- 環境：macOS（Darwin 25.6）、Node.js 26.10.0、Playwright 1.65.1（Chromium 159、WebKit 27.x）

最新の `origin/main`（a41b086、App Structure v0.1 確定）との統合の候補（fe462b8）での結果。

| 確認 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功（exit 0） |
| `npm run preview:build` | 成功（exit 0）。チャンクの大きさの警告は従来どおり（範囲外） |
| `npm run test:tokens` | 成功（failed 0） |
| `npm run test:ssr` | 統合の前：84 件成功（Data Browsing の 12 件を含む）。統合の候補：下の一括の実行に含まれ、すべて成功 |
| `npm run test:patterns` | 統合の前：259 件成功、55 件 skip、失敗 0 件。統合の候補：下の一括の実行に含まれ、すべて成功 |
| `npm run test:components`（統合の候補、2 回目） | 2062 件のうち 1833 件成功、229 件 skip、失敗 0 件（11.5 分、3 ワーカー） |

- 統合の候補の 1 回目の一括の実行では、Components の既存のテスト `advanced.spec.ts` の「Select selected weight」（`webkit-mobile`）が 1 件失敗した。Select は変更していない。同じテストを 10 回続けて実行して 10 回成功し、`advanced.spec.ts` を `webkit-mobile` で実行し直して 77 件すべて成功した。負荷の高い状態での既存のテストの不安定さと判断した（テストは変更していない）。
- 統合の前の一括の実行では、App Structure の既存のテスト（`app-structure.spec.ts` の移動の後の現在地の背景色の判定）が失敗した。統合の前の `origin/main`（09a7000）の写しでも、20 回中 10 回失敗した。App Structure v0.1（a41b086）との統合の後の 2 回の一括の実行では、失敗していない。
- 独立したレビューの指摘への対処の前の一括の実行では、Data Browsing の Tooltip の判定が失敗した（閉じる途中の Tooltip にも一致した）。開いた Tooltip だけを選ぶ判定に直した。
- 負荷の高い状態（他の作業の検品と同時、load average 約 9）で `test:patterns` を 4 ワーカーで実行したときは、6 件が時間切れ（30 秒）で失敗した。2 ワーカーで実行し直し、すべて成功した。
- 記録された例外は、Vite の HMR の接続のコンソールのエラー（SSR の検品、`consoleEnvironment`）だけである。製品の例外とコンソールのエラーは 0 件。
- 既存のテストの削除、skip の追加、許容誤差の拡大はしていない。新しいテストの skip は、既存の規則（デスクトップだけ・モバイルだけの表示、ハードウェアキーボードの操作、Chromium の CDP による IME の再現）によるもの。

スクリーンショット（Git の管理外）：検証画面の一覧、一部失敗の結果、カンバン、カレンダー、詳細ページ、その他の条件の Sheet（Chromium 1280×900）、モバイルの一覧、一括操作のバー、Drawer、詳細の Sheet（Pixel 7）、資料の 5 ページ（両方）を撮り、目視で確かめた。WebKit と実機での目視の確認は行っていない。

### 独立したレビュー

別のエージェント（Opus）が、実装の結論を渡さずに、差分、資料、図、テスト、スクリーンショットを 8 つの設計原則と 8 つの美的基準で確かめた。指摘は高 2 件、中 7 件、低 6 件。

| 指摘 | 対処 |
| --- | --- |
| 高：ワークスペースを切り替えた後も、前のワークスペースの一括操作の結果が残る。実行中に切り替えると、前のワークスペースの失敗した ID が新しい選択に入る | `useBulkAction` に `scopeKey` を追加し、変わったら待機を中止して結果を破棄する。`BulkTarget` に `scope` を持たせ、`settle` は別のスコープの結果を反映しない。検品を追加した |
| 高：最後のページの行をすべて削除すると「顧客はまだ登録されていません」と表示される | 0 行で `pageIndex > 0` の結果を再取得中として扱い、最後のページへ戻す（製品側のコード）。資料に書いた。検品を追加した |
| 中：全件の選択の要求そのものが失敗すると、選択が消え、再試行もできない | `settle` は `requestError.outcome` が `failed` の場合に選択を変えない。`retryFailed` は同じ対象で再実行する。`BulkResultAlert` に「もう一度実行」を追加した。模擬のサーバーに「要求を受け付けない」を追加し、検品を追加した |
| 中：実行の開始と再試行で、押したボタンが消え、フォーカスが `<body>` に移る | 実行を始めたら `BulkRunStatus`（`tabIndex={-1}`）、すべて完了した後は最初の行の名前のボタン、失敗を含む場合は結果の表示へ移す。再試行の間は前の結果の表示を残す（`keepSummary`） |
| 中：再試行と「元に戻す」が、結果と結び付いていない操作の内容（ref）を読む。「元に戻す」に二重実行の防止がない | 操作の内容を `start(action, target, payload)` で渡し、`summary.payload` に保存する。「元に戻す」も `useBulkAction` で実行し、結果を同じ規則で示す |
| 中：ワークスペースの切り替えの直後に、前の詳細の ID で詳細を要求する | 詳細を表示中の行をワークスペースと組で持ち、描画の時点で一致を判定する |
| 中：Calendar の `role="grid"` に矢印キーの移動がない。セルの `aria-label` が中のボタンの名前を上書きする | role と `aria-label` をやめ、日付は支援技術向けの文で示す |
| 中：表示と同時に挿入する `role="status"` は読み上げられない場合がある。読み上げが重なる | `BulkRunStatus` の `role="status"` をやめ、常に置いている読み上げの領域で実行の開始を伝える。資料の読み上げの記述を、Data Table の既存の「更新中」と一致させた。実際のスクリーンリーダーでは未確認 |
| 中：テストの弱点（中止で古い要求を止めるだけ、条件付きの判定、Spinner の名前で Skeleton を見ていた、組み合わせの不足） | 中止に従わない模擬の要求で、古い応答が後から届いても表示しないことを確かめる。条件付きの判定を、実際にスクロールできるかとの一致の判定にした。Spinner の検品を追加した。スコープ、範囲の外のページ、要求の失敗、件数がわからない全件の選択の検品を追加した |
| 低：描画の時点の判定が `ready` と `idle` だけで、失敗や再取得中から条件が変わると 1 回の描画で古い状態を返す | 最後に送った要求のキー（`requestKey`）で判定する |
| 低：模擬のサーバーが中止で応答しない。原因の文が「通信が途中で切れた」に固定されている | 中止を結果が不明の要求の失敗として返す。原因を固定しない文にした |
| 低：図の「すべて成功は Toast」と実装（常に Alert）が一致しない | すべて完了は Toast にした（上の「独自に判断した事項」） |
| 低：描画中の `replaceState`、登録の失敗の扱い、長時間の処理の例のタイマー | 履歴のキーの書き込みを効果に移した。登録の失敗を Sheet の中に示す。タイマーをアンマウントで解除する |
| 低：SSR の検品の範囲 | `ViewSwitcherMenu` を SSR の画面に追加した。`initialData` と `useListPositionRestore` は、ブラウザの検品（一覧への復帰）で確かめている |
| 低：一括操作のボタンが件数の行の中央に離れて置かれる | 一括操作のバーの幅を内容に合わせ、件数のすぐ右に置いた |
| 低：Calendar の省略した会社名を確かめられない | `title` を付け、押すと詳細に全体を表示する |
| 低：Kanban の横のはみ出しに手がかりがない。「その他の条件」の `DateRangePicker` の入力欄の幅 | 変更していない。Kanban は `TableScrollArea` の対象外（表ではない）。`DateRangePicker` は Components の既存の表示。次のレビューで扱う |

### 未検証の事項

| 項目 | 状況 |
| --- | --- |
| 実機の iOS Safari | 未検証。モバイルの一括操作のバーと Safe Area、ソフトウェアキーボードの表示中の編集の Sheet、Drawer を実機で確かめていない |
| Android の実機 | 未検証。IME の変換中の入力（Components の `advanced.md` の制限を含む） |
| VoiceOver、NVDA | 未検証。`aria-busy`、`role="status"`、`role="alert"`、`aria-live` の読み上げの回数を、Playwright の属性の検品だけで確かめている |
| Next.js での導入 | 未検証。`"use client"` の境界は規則で確かめている |
| 実際の API | 模擬のサーバーだけで確かめている。冪等性、対象の確定、権限の確認は製品の責務 |
| ページの移動での未保存の変更の確認 | Forms & Workflows で扱う |
| 資料のページの 320px の幅 | プレビューの資料のページ（左右の余白 24px）の中では、Pagination（最小 約 280px）が 272px に収まらない。例の枠を狭い画面で外して確保した。Pagination の狭い幅での折り返しは Components の範囲で、変更していない |
| Kanban の横のはみ出し | 手がかり（影）を表示していない。`TableScrollArea` は表だけを対象にしている |
| ページサイズの変更と 1 ページ目 | 指示書の「原則として先頭ページに戻す」と Pagination v0.1 の仕様が異なる。既定は Pagination v0.1 に合わせた（「独自に判断した事項」）。レビューで決める |
