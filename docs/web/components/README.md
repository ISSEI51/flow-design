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
| Table | [table.md](table.md) | 初期実装 |
| Data Table | [data-table.md](data-table.md) | 初期実装（Overlay・Feedback の統合待ち） |
| Pagination | [pagination.md](pagination.md) | 初期実装 |
| Chart | [chart.md](chart.md) | 初期実装 |

入力系コンポーネントに共通する判断基準は [forms.md](forms.md) にまとめている。

Data Display（Table、Data Table、Pagination、Chart）に共通する判断基準は [data-display.md](data-display.md) にまとめている。

## ファイルの配置

| ファイル | 内容 |
| --- | --- |
| `registry/components/ui/<name>.tsx` | 実装。shadcn/ui と同じ場所と名前にする |
| `registry/lib/utils.ts` | `cn()`。Flow Design の設定を追加した tailwind-merge を使う |
| `registry/lib/tailwind-merge.ts` | テーマが追加したクラス名の登録。既存の `cn()` に追加する方法は [tokens.md](../tokens.md#cn-の設定) |
| `docs/web/components/<name>.md` | 資料 |
| `preview/src/pages/<name>-page.tsx` | プレビューのページ。実装は `@/components/ui/<name>` から読み込み、複製しない |
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

## プレビュー

```sh
npm install
npm run preview:dev        # http://localhost:5173/
npm run test:components    # Playwright（初回は npx playwright install chromium）
npm run typecheck
```

### ブラウザ

| project | ブラウザ | 対象 |
| --- | --- | --- |
| `desktop` | Chromium（1280×900） | すべてのテスト |
| `mobile` | Chromium（Pixel 7） | すべてのテスト |
| `webkit` | WebKit（Desktop Safari、1280×900） | `@webkit` を付けたテスト |
| `webkit-mobile` | WebKit（iPhone 15） | `@webkit` を付けたテスト |

WebKit の project は、Playwright の WebKit による基本的な互換性の検品である。実機の iOS Safari での確認ではない。初回は `npx playwright install webkit` で WebKit を入れる。Chromium の CDP を使う IME のテストは、WebKit では実行できないため `desktop` と `mobile` だけで実行する。

ポートは `PREVIEW_PORT`（開発サーバー）と `PREVIEW_TEST_PORT`（検品、既定 5174）で変えられる。検品のスクリーンショットは `preview/screenshots/` に保存される（Git の管理外）。

コンポーネントを追加するときは、`preview/src/pages/` にページを作り、`preview/src/catalog.ts` に 1 行追加する。
