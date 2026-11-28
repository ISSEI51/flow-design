# Components v0.1 全体統合検品

39 のコンポーネント（すべて v0.1 確定）を、組み合わせて使う状態で検品した記録。
部品ごとの検品は各資料の「検品」にある。この資料は、部品をまたぐ問題、検品の基盤、外部ライブラリへの依存、未検証の事項を扱う。

- 実施日：2026-11-26
- ブランチ：`fix/components-integration-v0.1`（`origin/main` の e9697ce から作成）
- 環境：macOS（Darwin 25.6）、Node.js 26.10.0、Playwright 1.65.1（Chromium 159.0.8154.6、WebKit 27.x）、React 19、Base UI 1.9、TanStack Table 9、Recharts 3.10.1
- 実機（iOS Safari、Android）とスクリーンリーダー（VoiceOver、NVDA）による検品は行っていない（「未検証の事項」を参照）

## 1. 検品の対象

| 対象 | 内容 |
| --- | --- |
| 現状の確認 | 39 のコンポーネントの実装、資料、プレビューの参照先（Registry の `@/components/ui/*`）、競合の印、仮の実装 |
| Toast と Overlay のフォーカス | Dialog、Alert Dialog（入れ子）、Sheet、Drawer の表示中の Toast の操作。ポインターとキーボード |
| 例外の検品の基盤 | `preview/tests/page-errors.ts` を全ての検品の共通の基盤にする |
| 不安定なテスト | Forms の押せる範囲、Feedback の Tooltip、Drawer のスワイプ、折りたたんだ Sidebar の Dropdown Menu と Tooltip、Data Table の押せる範囲 |
| 部品の組み合わせ | 下の表の 10 の組み合わせ |
| SSR と Hydration | Node.js での描画、不一致、`"use client"`、日付とタイムゾーン、乱数、モバイルの判定、非表示の領域、Chart の初期描画 |
| 外部ライブラリへの依存 | Base UI と Recharts の、公開されていない仕組みへの依存 |

### 現状の確認の結果

- 39 のコンポーネントの実装（`registry/components/ui/*.tsx`）と資料（`docs/web/components/*.md`）があり、資料の状態はすべて v0.1 確定である。
- プレビューのページは、実装を `@/components/ui/*`（Registry）から読み込み、複製していない。
- 競合の印（`<<<<<<<`、`>>>>>>>`）、未解決のマージ、仮の実装はない。`preview/src/pages/navigation/app-page.tsx` の Placeholder は、業務アプリの例の中で内容を省いた領域を示す意図した表示である。
- 資料に記録された残存するリスクは、`overlays.md` の「残存するリスク」、`advanced.md`（Android の IME の制限）、各資料の「実際のスクリーンリーダーで未確認の事項」にある。このうち Toast を押した後のフォーカスを解消した（2 章）。

## 2. 修正内容

### Toast を押した後のフォーカス（製品の修正）

| 項目 | 内容 |
| --- | --- |
| 発生したこと | モーダル（Dialog、Alert Dialog、Drawer）の表示中に Toast の閉じるボタンか操作のボタンをポインターで押すと、フォーカスがモーダルの外の Toast に移った。Toast が消えると、フォーカスは `<body>` に移った。入れ子の Alert Dialog では、次の Tab で背後の Dialog（`aria-hidden`）の中へ移った |
| 原因 | ボタンの `mousedown` の既定の動作で、フォーカスが Toast に移る。Base UI のモーダルのフォーカスの閉じ込めは、Toast の領域を外側として扱う。内側として扱う要素を指定する公開 API はない |
| 修正 | `toast.tsx` の Toast の Root に `onMouseDown` を付け、既定の動作を止めて、ポインターで押してもフォーカスを移さない。説明（`description`）に置いた入力欄（`input`、`textarea`、`select`、`contenteditable`）は除き、押してフォーカスを移せる。この除外は、プレビューに入力欄を置いた通知の例がないため、自動の検品をしていない。`click`、Base UI のスワイプ（pointer のイベント）、キーボードでの操作（F6 で通知の領域へ移り、Tab と Enter で押す）は変わらない |
| 影響範囲 | Toast の本体、閉じるボタン、操作のボタン。キーボードでの操作は従来どおり使える |
| 検品 | `overlays.spec.ts` の `toast focus with overlays`。Dialog、入れ子の Alert Dialog、Drawer、閲覧の Sheet で、ポインターとキーボードで押し、フォーカスが面の中に残ること、`<body>` に落ちないこと、`aria-hidden` の要素へ移らないこと、閉じ込めが続くこと、キーボードで閉じた後は F6 を押す前の要素へフォーカスが戻ることを確かめる。キーボードの検品は、ハードウェアキーボードの操作のため `mobile` と `webkit-mobile` では実行しない（新しいテストの skip）。修正の前は、ポインターのテストがすべて失敗することを確かめた |

プレビューでは、Drawer の「下書きを保存」と Dialog の下書きの通知に、操作（「元に戻す」）を追加した。操作のボタンの検品のためである。

### `"use client"` の境界（製品の修正）

| 項目 | 内容 |
| --- | --- |
| 発生したこと | フック、Context、イベントの関数（`on*` の props）を使う 15 のファイルに `"use client"` がなかった：Alert Dialog、Avatar、Badge、Chart、Data Table、Dialog、Drawer、Dropdown Menu、Pagination、Progress、Select、Sheet、Table、Toast、Tooltip |
| 原因 | Navigation & Layout と Advanced の段階で決めた規則（フックを使うファイルに付ける）を、それより前に作ったファイルと Data Display に当てはめていなかった |
| システムの挙動 | Vite（このプレビュー）では影響がない。Next.js の App Router などで Server Component から読み込むと、フックや `createContext` の呼び出し、イベントの関数の受け渡しでビルドか描画が失敗する（Next.js での検品は行っていない。Next.js の仕様に基づく判断） |
| 修正 | 15 のファイルの先頭に `"use client"` を付けた。フックもイベントの関数も使わないファイル（Button、Card、Checkbox、Empty、Field、Input、Label、Popover、Radio Group、Separator、Skeleton、Switch、Textarea、Alert）には付けない |
| 検品 | `ssr-core.spec.ts` の `every component that uses hooks, contexts or event handlers declares "use client"`。すべてのファイルを正規表現で走査し、規則と一致しないファイルがないことを確かめる。検出するのは `use*(`、`createContext(`、`on*={` で、`render={(…) => …}` などのほかの関数の props とコメントの中の文字は区別しない（検出の範囲の制約） |

### 「すべて解除」の後のフォーカス（プレビューの修正、資料の追記）

| 項目 | 内容 |
| --- | --- |
| 発生したこと | Data Table の 0 件の表示の「条件をすべて解除」と、適用中の条件の「すべて解除」を押すと、フォーカスが `<body>` に移った |
| 原因 | 押したボタンが、解除の後に表示ごと消える。`DataTableAppliedFilters` は個別の条件の解除ではフォーカスを移すが、「すべて解除」では部品そのものを製品が消すため、部品の中では移せない |
| 修正 | プレビューの `customer-table.tsx` で、解除の後に検索欄へフォーカスを移す（`clearAllAndFocusSearch`）。`data-table.md` に、製品がフォーカスを移すことを追記した。部品の API は変えていない |
| 検品 | `integration.spec.ts` の Data Table の組み合わせ |

### 検品の基盤とテストの修正

3 章と 4 章を参照。

## 3. 例外の検品の基盤

`preview/tests/page-errors.ts` を、ブラウザを使うすべての検品（Button、Forms、Feedback、Overlays、Navigation、Advanced、Data Display、SSR、組み合わせ）で使う。各ファイルの先頭で `collectPageErrors(test)` を呼ぶ。Navigation の検品にあった独自の記録（`page-errors.jsonl` に書き出し、失敗にしない）は廃止した。

| 記録するもの | 扱い |
| --- | --- |
| 捕捉されなかった例外（`window` の `error`、`pageerror`） | 失敗。WebKit の座標が NaN のイベントの条件（`classifyPageErrors`）を満たすものだけ、記録と注記を残して失敗にしない。条件は緩めていない。時刻の取り方を変え、Node の時刻の条件を加えた（下記） |
| 処理されなかった Promise の拒否（`unhandledrejection`） | すべて失敗 |
| コンソールのエラー | 失敗。Vite の HMR の接続から出る 3 つの文（`CONSOLE_ENVIRONMENT`）で始まるものだけ、記録して失敗にしない |
| 記録の内容 | テスト名、project、ブラウザとバージョン、再試行の回数、URL、例外の文とスタック、ファイルと行、発生時に開いていた Overlay。`page-errors.json` として添付し、標準出力に `PAGE-ERRORS {...}` の 1 行で出す |

コンソールのエラーの方針：React の警告と Hydration の不一致の報告はコンソールのエラーとして出るため、検品を失敗にする。`console.warn`（開発時の注意、例：`onDiscardRequest` の指定漏れ）は記録しない。

時計の分離：

- 一部の検品は `page.clock.setFixedTime` で製品の時計（`Date`）を固定する。以前の記録は `Date.now()` で前後関係を比べていたため、時計を固定すると、すべての記録が同じ時刻になっていた。
- ページの中の記録は、リスナーが受け取った時点の `performance.now()` と文書の ID を持ち、同じ文書の記録だけを比べる。
- Playwright 1.65 の `page.clock` は、`window.performance` と `Event.prototype.timeStamp` も偽の時計に置き換える（`setFixedTime` では実時間で進み、`pauseAt` では止まる）。初期化スクリプトは実行時の `performance.now` を保持するが、`page.clock` のスクリプトが先に実行された文書では、それも偽の時計になる。
- そのため WebKit の環境の事象の判定は、ページの時刻の条件（イベントの 0〜5ms 後）に加えて、Node で受け取った時刻でもイベントの 50ms 以内であることを求める。ページの時計が止まっていても、離れた記録を関係づけない。
- `pageerror` との照合は、Node の `performance.now()`（`nodeTime`）で行う。
- 記録は `exposeBinding` でその場で Node へ送るため、ページを移動しても失われない。

調査で確認した事象：`page.clock.setFixedTime` の下では、`setTimeout` と `requestAnimationFrame` のコールバックの中の例外は、Playwright の時計の置き換えが捕捉し、コンソールのエラーとして出る（Chromium は `page-errors.spec.ts` で検品、WebKit は調査で確認）。`pageerror` にはならない。この経路の例外も、コンソールのエラーとして失敗にする。

回帰の検品：`page-errors.spec.ts`（13 件、`desktop` のみ）。判定の関数の条件（止めたページの時計の場合を含む）と、固定した時計の下での記録の順序、タイマーの中の例外、ページの移動の後の記録、処理されなかった Promise の拒否、コンソールのエラーの分類を確かめる。

## 4. 不安定なテストの調査

固定時間の待機を条件の待機に置き換え、許容誤差、再試行の回数、テストの数は変えていない。`preview/tests/helpers.ts` に次の補助関数を追加した。

| 関数 | 待つ条件 |
| --- | --- |
| `settledBox(locator)` | 要素の位置と大きさが 2 フレーム続けて変わらない |
| `animationsDone(locator)` | 要素と子孫の CSS のアニメーションとトランジションが終わる（`getAnimations({ subtree: true })`） |
| `settledScrollTop(locator)` | スクロールの位置が 5 フレーム続けて変わらない（タッチのスクロールの慣性の終わり） |

| テスト | 原因 | 区分 | 対処 |
| --- | --- | --- | --- |
| Data Table：押せる範囲（`checkbox hit areas by density`） | 同じページの上にある「サーバー側の処理を模擬」の表が、0.4〜0.8 秒後に初回の取得を終え、読み込み中の 8 行が 50 行に変わる。Checkbox の `mousedown` と `mouseup` の間にこれが起きると、ページの高さが変わり、スクロールの位置が補正される（記録では `scrollY` 4611 → 7031）。WebKit は、このとき `mouseup` と `click` を `<html>` に送る。対象の表の DOM は変わっていない | テストの手順（操作の前に非同期の読み込みの完了を待っていない）。WebKit の挙動 | 操作の前に、サーバー側の表の読み込みの完了（読み込み中の行が 0 件、`aria-busy` がない）を待つ。負荷をかけた WebKit で、修正の前は 360 回中 2〜5 回失敗、修正の後は 360 回中 0 回 |
| Drawer：スワイプ | 1 回目のスワイプで起きたスクロールの慣性が続いている間に、`scrollTo(0, 0)` と 2 回目のスワイプを行っていた。固定時間の待機（300ms、500ms）で慣性の終わりを待っていた | テストの手順 | スクロールの位置が止まるまで待つ（`settledScrollTop`）。20 回中 20 回成功 |
| Forms：押せる範囲 | `scrollIntoViewIfNeeded` の直後に座標を測っていた。Switch の小さいサイズは、つまみの移動を固定時間（200ms）で待っていた | テストの手順 | `settledBox` と `animationsDone` に置き換えた |
| Navigation：折りたたんだ Sidebar | Dropdown Menu の位置を、開く動きの途中で測る可能性があった（固定時間 300ms）。Tooltip の 700ms の検品で、折りたたみの動きの途中に項目の上へポインターを置く可能性があった | テストの手順 | `animationsDone` で動きの終わりを待つ。「700ms より前には表示しない」ことを確かめる待機（300ms、900ms）は、表示しないことの確認のため残した |
| Feedback：Tooltip | 過去の失敗は、開く動きの途中で間隔を測ったこと（2fe6c61 で修正済み）。今回の負荷をかけた実行では再現しなかった。ただし、表示の直後に `transition-duration` を測っていた（下の Select と同じ原因の可能性） | テストの手順 | 下の Select と同じく、`data-starting-style` がなくなってから測る |
| Forms：Select の tokens | 最終の全件の実行（1 回目）で、`webkit-mobile` で 1 回失敗した（`transition-duration` が 0.18s ではなく 0s）。Base UI は、開く動きの最初のフレーム（`transitionStatus === "starting"`、`data-starting-style`）の間、Popup と Positioner に `transition: none` をインラインで指定する（`getDisabledMountTransitionStyles`）。テストは `toBeVisible()` の直後に測っていた | テストの手順 | `data-starting-style` がなくなってから測る（Overlays の検品の `settle` と同じ条件）。15 回 × 4 project の 60 回すべて成功 |

負荷をかけた実行：対象のテストを `--repeat-each=5`、8 ワーカーで実行し、同時に別の検品（`data-display.spec.ts` を 6 ワーカー）を実行した。上の修正の後は失敗がない。

製品の不具合は見つからなかった。Data Table の事象は、利用者が画面の上の内容の読み込み中に操作した場合にも起こりうる（WebKit）。製品の対処は、読み込み中の表示を読み込み後と同じ高さにすること（プレビューの `loadingRowCount` は 8、表示件数は 50）。プレビューの変更は行っていない（10 章）。

## 5. 部品の組み合わせの検品

既存の検品で確かめている組み合わせと、今回追加した検品（`preview/tests/integration.spec.ts`、`ssr-core.spec.ts`）。

| 組み合わせ | 既存の検品 | 今回の追加 | 結果 |
| --- | --- | --- | --- |
| Button と Form | 送信中は繰り返し送信しない（`button.spec.ts`）、エラーの概要からの移動、送信される値（`forms.spec.ts`） | なし | 問題なし |
| Form と Dialog、Sheet | 未保存の変更の確認、保存中の閉じる操作（`overlays.spec.ts`） | なし | 問題なし。Overlay の中のフォームの検証の表示は、プレビューにない（9 章） |
| Date Picker と Form | 直接の入力、範囲、送信される値（`advanced.spec.ts`） | カレンダーで選んだ日の送信、カレンダーの中の Enter がフォームを送信しないこと、フォーカスの復帰 | 問題なし |
| Data Table、Checkbox、0 件の表示 | ID による選択の保持、0 件と未登録の区別（`data-display.spec.ts`） | 選択したまま 0 件に絞り込む、表示していない件数の表示、全選択の無効、条件の解除の後の選択とフォーカス | フォーカスの消失を修正（2 章） |
| Sidebar、Dropdown Menu、Tooltip | 折りたたみ時の Dropdown Menu（マウス、キーボード）、Tooltip（`navigation.spec.ts`） | なし | 問題なし |
| Command、Dialog、Alert Dialog | 危険な操作の確認、ほかの Overlay の表示中のショートカット（`advanced.spec.ts`） | なし | 問題なし。Command から通常の Dialog を開く例はない（9 章） |
| Select、Combobox、Multi Select と Overlay | Dialog、Popover、Sheet の中の Select（`overlays.spec.ts`） | Dialog の中の Combobox と Multi Select（前面の表示、Escape の順序、フォーカスの復帰、値の保存）。プレビューの Combobox のページに例を追加した | 問題なし |
| File Upload、Progress、Alert、Toast | 制限の Alert、失敗と再試行、CSV の取り込み（`advanced.spec.ts`）。Progress と Toast は請求書の送信（`feedback.spec.ts`） | なし | 取り込みの結果は Alert で残す設計で、Toast は使わない（消える通知では結果を確かめられないため）。Toast との組み合わせの検品は Feedback の例で行っている |
| Tabs、Accordion、Form、Chart | 非表示のパネルの入力の保持、送信、エラーからの移動（`navigation.spec.ts`）。非表示の領域（`<details>`）の Chart（`data-display.spec.ts`） | なし | Tabs と Accordion の中の Chart の例はない（9 章） |
| 未保存の変更の破棄 | Dialog、Sheet、Drawer（スワイプを含む）（`overlays.spec.ts`） | Toast の操作と Drawer の未保存の変更（`toast focus with overlays`） | 問題なし。ページの移動での確認は Patterns の範囲（9 章） |

表示の確認：Button、Data Table、Dialog、Sheet、Drawer、Toast、ダッシュボード、業務アプリの例をスクリーンショットで確認した（8 章）。

- 余白、文字、角丸、アイコンの大きさ、ブランドの色、選択とフォーカスの状態、エラーと成功、Loading、Empty、Error、重なり順、長い文字、狭い画面、動きを減らす設定は、部品ごとの検品でトークンの値と計算後のスタイルを比べている。
- 今回の確認で、統一のためだけの大きな見た目の変更が必要な箇所はなかった。

操作の負荷：

- 不要な Card、装飾、説明の過多は見つからなかった。
- 見つかった問題の 1 つ目は、フォーカスの消失（2 章）である。修正の前は、条件を解除した後に、キーボードで操作する人が位置を失っていた（8 つの設計原則の 07「少ない負荷で目的に届く」）。
- 2 つ目は、狭い画面で下から開いた Drawer の表示中に出した Toast が、Drawer の下部の操作（保存など）に重なることである。操作つきの Toast は閉じるまで残る。部品の変更（通知の位置の自動の切り替え）は大きな変更になるため行わず、使い方を `toast.md` に追記した。Drawer の中の操作の結果は Drawer の中で伝え、Toast は閉じた後の結果に使う。プレビューの Drawer の「下書きを保存」の通知は、検品（Drawer の表示中の Toast の操作）のための例として残した。

## 6. SSR と Hydration

`npm run test:ssr`（ファイル名に `ssr` を含むテスト）で、次を確かめる。

| ファイル | 対象 |
| --- | --- |
| `ssr.spec.ts` | Sidebar、Tabs、Accordion、Breadcrumb、Card、Separator、Tooltip（Navigation & Layout） |
| `ssr-core.spec.ts`（追加） | Input、Textarea、Select、Checkbox、Radio Group、Switch、Label、Field、Alert、Avatar、Badge、Skeleton、Progress、Toast、Tooltip、Dialog、Alert Dialog、Sheet、Drawer、Popover、Dropdown Menu、Button。`"use client"` の境界（すべてのファイル） |
| `ssr-advanced.spec.ts` | Combobox、Multi Select、Command、Calendar、Date Picker、File Upload、Empty。日付、ロケール、3 つのタイムゾーン、プラットフォーム別の表示、モバイルでの Calendar の切り替え |
| `data-display-ssr.spec.ts` | Table、Data Table、Pagination、Chart |

以前は 39 のうち 20 の部品だけを確かめていた。追加した `ssr-core.spec.ts` は、次を確かめる。

- サーバーで `window` と `document` なしに描画し、同じ入力から同じ HTML になること
- Hydration で不一致がないこと
- Hydration の前から値と操作の要素が見えること
- Hydration の後に Select、Checkbox、Switch、Dialog、Alert Dialog、Dropdown Menu を操作できること

閉じた Overlay は内容を描画しない。

| 観点 | 状況 |
| --- | --- |
| 日付、タイムゾーン | 固定した日付を渡す。サーバーと異なるタイムゾーンのブラウザで Hydration しても不一致がない（`ssr-advanced.spec.ts`） |
| 乱数 | 初期値に `Math.random()` を使わない。Base UI の ID は React の `useId` による |
| モバイルの判定 | サーバーでの `useIsMobile` は `false`。Hydration の後に幅に合わせて切り替わる |
| 非表示の領域 | 閉じた Tabs と Accordion は、サーバーの HTML でも隠れる |
| Chart の初期描画 | サーバーで `data-slot="chart"` を描画し、Hydration で不一致がない |

## 7. 外部ライブラリへの依存

公開 API（props、CSS 変数、文書化された data 属性）以外の仕組みに依存している箇所。ライブラリを更新するときは、右の列の検品で確かめる。今回、ライブラリの版は更新していない。

| 依存 | 場所 | 理由 | 公開 API での代替 | 更新時の確認 |
| --- | --- | --- | --- | --- |
| Base UI がモーダルの外側に付ける `data-base-ui-inert` | `popover.tsx:43`、`tooltip.tsx:102`、`select.tsx:89`、`dropdown-menu.tsx:54`（`in-[[data-base-ui-inert]]:z-40`） | 後から開いたモーダルの外側に残った浮かぶ要素を、モーダルの層（z-40）に下げる | 外側の要素を知らせる公開の属性やイベントはない | `overlays.spec.ts` の `stacking with nested overlays`。`[data-base-ui-inert]` の件数も確かめる（`overlays.spec.ts:1677`） |
| Base UI のフォーカスガード `data-base-ui-focus-guard` | `overlays.spec.ts:88-116`、`:1452`（検品だけ） | フォーカスの閉じ込めの検品で、Base UI がフォーカスを一時的に置く要素を、外側への漏れとして数えない | なし | `overlays.spec.ts` のフォーカスの検品が、漏れなしで通ること |
| `[role=dialog][data-open]` の文書全体の検索 | `command.tsx:255`、`:272` | ほかの Overlay が開いている間は、ショートカットで Command を開かない | Base UI の公開の data 属性（`data-open`）と ARIA の役割による。Base UI の内部の仕組みではない | `advanced.spec.ts` のショートカットの検品 |
| Recharts の `svg.recharts-surface[role=application]` と `.recharts-*` のクラス | `chart.tsx:110`、`:134-143` | フォーカスを受け取る svg に名前を付ける。軸、格子、カーソルの色をトークンにする | Recharts は、これらの要素の属性とクラスを変える公開 API を持たない | `data-display.spec.ts` の Chart の名前、色、フォーカスの検品 |

`accordion.tsx:49`、`sidebar.tsx:153`、`tabs.tsx:115` などの DOM の検索は、Flow Design の `data-slot` と ARIA の属性によるもので、外部ライブラリの内部には依存しない。

## 8. 検証の結果

| 確認 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功（exit 0） |
| `npm run preview:build` | 成功（exit 0）。チャンクの大きさの警告は従来どおり（範囲外） |
| `npm run test:tokens` | 成功（failed 0） |
| `npm run test:ssr` | 56 件成功 |
| `npm run test:components`（全 project の一括の実行、最終の状態で 1 回目） | 1511 件成功、149 件 skip、失敗 0 件（7.8 分、4 ワーカー） |
| `npm run test:components`（全 project の一括の実行、最終の状態で 2 回目、続けて実行） | 1511 件成功、149 件 skip、失敗 0 件（7.8 分、4 ワーカー） |

最終の状態より前の一括の実行の記録：

| 実行 | 結果 | その後の変更 |
| --- | --- | --- |
| 1 回目、2 回目 | それぞれ 1509 件成功、147 件 skip、失敗 0 件 | 独立したレビューの指摘への修正（下記） |
| 3 回目、4 回目（続けて実行） | 3 回目：1510 件成功、1 件失敗（`webkit-mobile` の Select の tokens、4 章）。4 回目：1511 件成功、失敗 0 件 | Select と Tooltip の tokens のテストの修正 |

skip の 149 件は、次のテストである。

- `webkit` と `webkit-mobile` の project で、`@webkit` の付いていないテスト
- Chromium の CDP を使うテスト（IME、タッチ）
- タッチ操作では開かない Tooltip のテスト
- 判定の関数の検品（`page-errors.spec.ts`、`desktop` のみ）
- ハードウェアキーボードの操作のテスト（`mobile` と `webkit-mobile`）

一括の実行で記録された例外は、Vite の HMR の接続のコンソールのエラーだけである（SSR の検品の 18 件のテストで記録、`consoleEnvironment`）。製品の例外とコンソールのエラー、WebKit の環境の事象は 0 件だった。V8 の異常終了は起きていない。

分割の実行（不安定なテストの調査のための、対象を絞った繰り返しの実行）は、4 章に分けて記録した。一括の実行の結果とは区別する。

スクリーンショットによる確認（Chromium、1280×900 と 390×844）：

- 対象の画面：業務アプリの例（デスクトップ、モバイル）、Data Table（0 件に絞り込んだ選択の状態）、ダッシュボード、Dialog の上の Toast、Dialog の中の Combobox、モバイルの Drawer の上の Toast
- 余白、文字の強弱、角丸、アイコンの大きさ、色、重なり順は、部品の間でそろっている
- 見つかった問題は、モバイルの Drawer の下部の操作に Toast が重なることだけである（5 章）
- WebKit と実機での目視の確認は行っていない

独立したレビュー：

- 別のエージェントが、変更の差分だけを読んでレビューした。実装の結論は渡していない
- 重大な指摘はなかった
- 中程度の指摘への対処
  - Playwright の `page.clock` は `Event.prototype.timeStamp` も置き換えるため、時計を止めると判定が誤って成功する可能性があった。Node の時刻の条件を加え、回帰のテストを追加した（3 章）
  - SSR の Hydration の完了の印（`__ssrHydrated`）を、`hydrateRoot` の直後ではなく、ルートの effect で設定するようにした。あわせて、Hydration の後の操作の後にも不一致の報告がないことを確かめるようにした
  - 文書の未記入の箇所と、章の参照の誤りを直した
- 軽微な指摘への対処
  - 送信の失敗による未処理の拒否
  - タイマーを使う待機
  - 終わらないアニメーションを待つ処理
  - Toast の中の入力欄
  - 要素がないと成功する判定
  - キーボードで閉じた後のフォーカスの戻り先の検品
  - 文書の「完全に一致」の表現

## 9. 未検証の事項

次は検品していない。確認済みとは扱わない。

| 項目 | 状況 |
| --- | --- |
| 実機の iOS Safari | 未検証。Playwright の WebKit（macOS 上のビルド）だけで検品している |
| Android の実機 | 未検証。IME の制限（`advanced.md`）と戻る操作（`overlays.md`）を含む |
| VoiceOver、NVDA | 未検証。役割、名前、`aria-hidden`、`aria-live` の属性までを Playwright で確かめている |
| Next.js での導入 | 未検証。`"use client"` の境界は規則で確かめている。Registry & Gallery の段階で確かめる |
| WebKit の座標が NaN のイベント | 発生元は未特定。条件を満たすものだけを環境の事象として記録している（`overlays.md`） |
| Overlay の中のフォームの検証の表示 | プレビューに例がない。フォームの検証は Forms の検品で確かめている |
| Command から通常の Dialog を開く | プレビューに例がない。Command と Alert Dialog の組み合わせは確かめている。Patterns Integration Review でも検品を追加していない |
| Tabs と Accordion の中の Chart | プレビューに例がない。非表示の領域（`<details>`）から表示したときの Chart の大きさは確かめている |
| Drawer の表示中の Toast の位置 | Patterns Integration Review で解消した（OVL-1、OVL-2）。`DrawerFooter`、`SheetFooter` の表示中は、Toast を Footer の上に表示する（`--toast-offset-overlay`。`toast.md`）。390px と 320px の Drawer、右と下の Sheet で、Toast が Footer の操作に重ならず、Footer の操作を押せることを検品した（`overlays.spec.ts` の `toast above overlay footers`）。実機では未検証 |
| ページの移動での未保存の変更の確認 | ルーティングに依存するため、Patterns の範囲とする |
| Combobox と Multi Select の層の切り替え | Patterns Integration Review で解消した（OVL-3）。一覧を開いたまま、利用者の操作によらずにモーダルが開く場合（時間切れの通知など）に、一覧が新しいモーダルの前面に残り、押せることを検品用の画面（`preview/src/ssr/overlay-stack-harness.tsx`）で再現した。`in-[[data-base-ui-inert]]:z-40` を追加し、`overlays.spec.ts` の `stacking: combobox and multi select under a later modal` で、一覧が背面に入り押せないことを 4 つの project で確かめた |

## 10. 次のフェーズへの引き継ぎ

- Patterns：ページの移動での未保存の変更の確認、Overlay の中のフォームの検証、Tabs の中の Chart など、複数の部品を組み合わせた画面の型として扱う。
- Registry & Gallery：Next.js（App Router）で `"use client"` の境界と SSR を確かめる。実機の iOS Safari、Android、VoiceOver、NVDA の検品を計画する。
- Base UI と Recharts の更新時は、7 章の依存の一覧に沿って検品する。Playwright を更新したときは、WebKit の座標が NaN のイベントの条件（版 27.x）を確かめ直す。
- 読み込み中の表示の高さ：Data Table を画面の上部に置く製品では、`loadingRowCount` を表示件数に合わせると、読み込みの後に下の内容が移動しない（4 章）。
