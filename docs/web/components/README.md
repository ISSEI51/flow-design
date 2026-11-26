# コンポーネント

Flow Design のコンポーネントを、設計、実装、資料、検品の同じ手順で作るための基準。

| コンポーネント | 資料 | 状態 |
| --- | --- | --- |
| Button | [button.md](button.md) | v0.1 確定 |
| Field | [field.md](field.md) | v0.1 確定 |
| Label | [label.md](label.md) | v0.1 確定 |
| Input | [input.md](input.md) | v0.1 確定 |
| Textarea | [textarea.md](textarea.md) | v0.1 確定 |
| Select | [select.md](select.md) | v0.1 確定 |
| Checkbox | [checkbox.md](checkbox.md) | v0.1 確定 |
| Radio Group | [radio-group.md](radio-group.md) | v0.1 確定 |
| Switch | [switch.md](switch.md) | v0.1 確定 |
| Badge | [badge.md](badge.md) | v0.1 確定 |
| Avatar | [avatar.md](avatar.md) | v0.1 確定 |
| Tooltip | [tooltip.md](tooltip.md) | v0.1 確定 |
| Alert | [alert.md](alert.md) | v0.1 確定 |
| Toast | [toast.md](toast.md) | v0.1 確定 |
| Skeleton | [skeleton.md](skeleton.md) | v0.1 確定 |
| Progress | [progress.md](progress.md) | v0.1 確定 |
| Dialog | [dialog.md](dialog.md) | v0.1 確定 |
| Alert Dialog | [alert-dialog.md](alert-dialog.md) | v0.1 確定 |
| Popover | [popover.md](popover.md) | v0.1 確定 |
| Dropdown Menu | [dropdown-menu.md](dropdown-menu.md) | v0.1 確定 |
| Sheet | [sheet.md](sheet.md) | v0.1 確定 |
| Drawer | [drawer.md](drawer.md) | v0.1 確定 |
| Sidebar | [sidebar.md](sidebar.md) | v0.1 確定 |
| Tabs | [tabs.md](tabs.md) | v0.1 確定 |
| Breadcrumb | [breadcrumb.md](breadcrumb.md) | v0.1 確定 |
| Card | [card.md](card.md) | v0.1 確定 |
| Accordion | [accordion.md](accordion.md) | v0.1 確定 |
| Separator | [separator.md](separator.md) | v0.1 確定 |
| Combobox | [combobox.md](combobox.md) | v0.1 確定 |
| Multi Select | [multi-select.md](multi-select.md) | v0.1 確定 |
| Command | [command.md](command.md) | v0.1 確定 |
| Calendar | [calendar.md](calendar.md) | v0.1 確定 |
| Date Picker | [date-picker.md](date-picker.md) | v0.1 確定 |
| File Upload | [file-upload.md](file-upload.md) | v0.1 確定 |
| Empty | [empty.md](empty.md) | v0.1 確定 |
| Table | [table.md](table.md) | v0.1 確定 |
| Data Table | [data-table.md](data-table.md) | v0.1 確定 |
| Pagination | [pagination.md](pagination.md) | v0.1 確定 |
| Chart | [chart.md](chart.md) | v0.1 確定 |

入力系コンポーネントに共通する判断基準は [forms.md](forms.md)、Feedback コンポーネントの判断基準は [feedback.md](feedback.md)、Overlay コンポーネントの判断基準は [overlays.md](overlays.md)、画面の構造（ナビゲーション、内容の幅、余白、区切り方）の判断基準は [navigation-layout.md](navigation-layout.md)、Advanced Components（検索付きの選択、Command、日付、ファイル、空の状態）の判断基準は [advanced.md](advanced.md) にまとめている。

Data Display（Table、Data Table、Pagination、Chart）に共通する判断基準は [data-display.md](data-display.md) にまとめている。

## ファイルの配置

| ファイル | 内容 |
| --- | --- |
| `registry/components/ui/<name>.tsx` | 実装。shadcn/ui と同じ場所と名前にする |
| `registry/lib/utils.ts` | `cn()`。Flow Design の設定を追加した tailwind-merge を使う |
| `registry/hooks/<name>.ts` | 複数のコンポーネントが使うフック（`use-mobile` など）。shadcn/ui の `hooks/` と同じ場所 |
| `registry/lib/tailwind-merge.ts` | テーマが追加したクラス名の登録。既存の `cn()` に追加する方法は [tokens.md](../tokens.md#cn-の設定) |
| `docs/web/components/<name>.md` | 資料 |
| `preview/src/pages/<group>/<name>-page.tsx` | プレビューのページ。実装は `@/components/ui/<name>` から読み込み、複製しない |
| `preview/tests/<name>.spec.ts` | Playwright の検品 |

`registry/` は、shadcn/ui のプロジェクトの `components/` と `lib/` と同じ構成にしている。将来 Registry で配布するときに、import のパス（`@/components/ui/...`、`@/lib/utils`）を変えずに済む。

## 資料の構成

すべてのコンポーネントの資料を、次の 6 項目で書く。API の一覧ではなく、どの場面で何を選ぶかを判断できる資料にする。

1. **Purpose**：ユーザーの何を助けるか
2. **Usage**：使う場面、選び方、使わない場面
3. **Anatomy**：構造と、各部分が参照するトークン
4. **Variants**：種類、大きさ、状態
5. **Behavior**：キー操作、状態の変化、アクセシビリティ
6. **Anti-patterns**：避ける使い方、その理由、代わりの方法

## 実装の基準

- shadcn/ui（Base UI 版）の実装を元にし、`variant` と `size` の名前、props を変えない。
- 値はトークンのクラスで指定する。色の値や px を直接書かない。
- コンポーネント固有のトークンは、製品や画面ごとに値を変える必要がある場合だけ追加する（[tokens.md](../tokens.md#トークンの-3-層)）。
- 依存パッケージは、shadcn/ui の同じコンポーネントが使うものに限る。
- 開閉の動きは、Base UI の `data-starting-style` と `data-ending-style` による CSS の transition で作る。アニメーション用のパッケージ（tw-animate-css など）は使わない。

## 検品の基準

`preview/tests/` で、次を確認する。

| 項目 | 確認すること |
| --- | --- |
| トークン | 計算後のスタイルが、トークンの値と一致する |
| コントラスト | 通常とホバーで、文字が 4.5:1 以上 |
| キー操作 | Tab で移動でき、操作のキーで実行できる |
| フォーカス | `focus-ring` が表示される |
| 無効、処理中 | 操作を受け付けない |
| 名前 | すべての操作にアクセシブルな名前がある |
| レイアウト | 長い文字、モバイルの幅で崩れない |
| 動きを減らす設定 | 位置や回転の動きが止まる |
| ブランドの変更 | `--primary` の上書きが反映され、通常、ホバー、押下でコントラストを保つ |
| 関連付け（入力系） | ラベルで入力欄にフォーカスが移る。説明とエラーが `aria-describedby` に入る |
| エラー（入力系） | `aria-invalid`、枠の色、アイコンと文字で伝わる |
| 押せる範囲（入力系） | Checkbox、Radio、Switch の行が 48px 以上 |
| 押せる範囲の重なり（入力系） | 本体、ラベル、行のどこを押しても、その項目だけが切り替わる。隣の項目と重ならない |
| フォーム全体 | 検証のタイミング、エラーの概要、エラーの読み上げ、送信される値、IME の変換中の扱い |
| 開閉（Overlay） | 初期フォーカス、フォーカスの閉じ込めと復帰、Escape、外側のクリック、背景の操作とスクロール、未保存の変更、入れ子、重なり順、画面の端 |
| 現在位置（ナビゲーション） | `aria-current="page"` と、色だけに頼らない見た目の区別 |
| 開閉（ナビゲーション） | 幅、`aria-expanded`、非表示の内容が支援技術から隠れること、入力内容が残ること |
| ページの例外 | 捕捉されなかった例外、処理されなかった Promise の拒否、製品のコードから出たコンソールのエラーがない（下記） |
| 部品の組み合わせ | 複数の部品を組み合わせた操作（`preview/tests/integration.spec.ts`）。対象と結果は [integration-review.md](integration-review.md) |
| `"use client"` の境界 | フック、Context、イベントの関数（`on*` の props）を使うファイルに `"use client"` があり、使わないファイルにはない（`preview/tests/ssr-core.spec.ts`） |

## プレビュー

```sh
npm install
npm run preview:dev        # http://localhost:5173/
npm run test:components    # Playwright（初回は npx playwright install chromium）
npm run typecheck
npm run test:ssr           # SSR と Hydration（Navigation & Layout、Forms・Feedback・Overlays、Advanced、Data Display、App Structure。ファイル名に ssr を含むテスト）
npm run test:patterns      # Patterns（App Structure）の検品だけ。test:components にも含まれる
```

### ブラウザ

| project | ブラウザ | 対象 |
| --- | --- | --- |
| `desktop` | Chromium（1280×900） | すべてのテスト |
| `mobile` | Chromium（Pixel 7） | すべてのテスト |
| `webkit` | WebKit（Desktop Safari、1280×900） | `@webkit` を付けたテスト |
| `webkit-mobile` | WebKit（iPhone 15） | `@webkit` を付けたテスト |

WebKit の project は、Playwright の WebKit による基本的な互換性の検品である。実機の iOS Safari での確認ではない。初回は `npx playwright install webkit` で WebKit を入れる。Chromium の CDP を使う IME のテストは、WebKit では実行できないため `desktop` と `mobile` だけで実行する。WebKit は Safari の既定の設定と同じく Tab でリンクに移動しないため、リンクへのキー操作は Option+Tab（`Alt+Tab`）で確かめる。

ポートは `PREVIEW_PORT`（開発サーバー）と `PREVIEW_TEST_PORT`（検品、既定 5174）で変えられる。検品のスクリーンショットは `preview/screenshots/` に保存される（Git の管理外）。

コンポーネントを追加するときは、`preview/src/pages/` にページを作り、`preview/src/catalog.ts` に 1 行追加する。Patterns のページは `category`（`app-structure` など）を付け、プレビューの上部で Components と分けて表示する。`fullscreen: true` を付けたページ（業務アプリの例）は、プレビューの見出しを付けずに画面全体で表示する。

WebKit は既定の設定では Tab でリンクへ移動しないため、検品ではリンクへの移動に Option + Tab を使う。

ブラウザを使うすべての検品は、`preview/tests/page-errors.ts` の `collectPageErrors(test)` で、捕捉されなかった例外、処理されなかった Promise の拒否、コンソールのエラーを記録する。記録は、テスト名、project、ブラウザとバージョン、URL、スタックとともに `test-results/` の `page-errors.json` に添付し、標準出力に `PAGE-ERRORS {...}` の 1 行で出す。製品の例外とコンソールのエラーは検品を失敗にする。失敗にしない環境の事象（WebKit の座標が NaN のイベント、Vite の HMR の接続のエラー）の条件は [overlays.md](overlays.md#ページの例外の記録) にまとめている。
