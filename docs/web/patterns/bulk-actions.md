# Bulk Actions

選んだ複数の行に、まとめて操作する。

状態：v0.1 確定候補（最終レビュー前） ・ 実装：[`registry/patterns/bulk-selection.ts`](../../../registry/patterns/bulk-selection.ts)、[`registry/patterns/bulk-actions.tsx`](../../../registry/patterns/bulk-actions.tsx) ・ 全体：[Data Browsing](data-browsing.md)

## 目的

同じ操作を 1 行ずつ繰り返す負荷を減らす（原則 07）。選択の範囲、実行の対象、結果を正確に伝え、意図しない行への操作と、重複した実行を防ぐ（原則 08）。

## 使用条件

複数の行に同じ操作を行う業務がある場合だけ置く。行の選択の Checkbox は、一括操作がない一覧には置かない。

## 構成

| 部分 | 部品 | 仕様 |
| --- | --- | --- |
| 選択の列 | `DataTablePageCheckbox`、`DataTableRowCheckbox`（Data Table） | 見出しの Checkbox は、表示中のページの選択できる行だけを対象にする。一部を選んでいるときは Indeterminate |
| 一括操作のバー | `DataTableSelectionBar`（Data Table） | 件数の行と同じ位置に置く。1 件以上選んだときだけ表示する。選択件数と「選択を解除」を示す |
| 一括操作 | Button（Secondary、Ghost）、Dropdown Menu | よく使う操作を 1〜3 個直接置き、その他はメニューにまとめる |
| 確認 | `ConfirmActionDialog`（Forms & Workflows の Confirmation。Alert Dialog）の `progress="external"` と `targetKey` | 不可逆な操作だけ |
| 実行中 | `BulkRunStatus` | 操作の名前と件数。実際の進捗がある場合だけ Progress |
| 結果 | `BulkResultAlert` | 完了、失敗、結果が不明の件数、失敗した行と理由、失敗した行だけの再試行 |
| 選択と実行の状態 | `useBulkSelection`、`useBulkAction` | 下の「状態管理」 |

### ページ内の選択と全件の選択

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/bulk-selection-scope-dark.svg">
  <img alt="ページ内の選択と全件選択の図。左のブロックは、ページ内の選択（このページの 50件を選択中）で、選択は行の ID で持ち、ページを移動しても ID で残し、表示していない件数を示す。例として「3件を選択中（表示していない 2件を含む）」を挙げている。右のブロックは、検索結果全件の選択（検索結果 580件をすべて選択）で、選択は検索条件と除外した ID で持ち、件数が正確にわからない場合は件数を表示しない。条件を変えたときは、個別の選択は ID で保持し、全件の選択は解除して知らせる（または元の条件に固定して示す）。下の帯に、実行の対象の確定、権限、件数の検証はバックエンドの責務、と書かれている。" src="../../diagrams/bulk-selection-scope-light.svg">
</picture>

### 一括操作の状態の遷移

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/bulk-action-states-dark.svg">
  <img alt="一括操作の状態遷移の図。選択なしから、行を選ぶと選択中（操作バーを表示する）になり、操作すると確認になる。確認では、不可逆な操作を Alert Dialog で確認し、対象、件数、変更内容、取り消せるかを示す。実行すると実行中になり、開始時に対象を固定し、二重実行を防ぎ、実際の進捗があるときだけ Progress を表示する。実行中の結果は 4 つある。すべて成功は選択を解除して Toast で知らせる。一部失敗は成功分の選択を解除し、失敗分は選択のまま、結果を画面に残す。すべて失敗は選択を維持し、再試行できる。結果が不明は無条件に再試行せず、最新の状態を確認する。一部失敗から実行中へは「失敗分だけ再試行」の矢印が戻る。低リスクで取り消せる操作は、選択中から確認を経由せずに実行し、「元に戻す」を示す。" src="../../diagrams/bulk-action-states-light.svg">
</picture>

## 判断基準

### 操作のバー

- 検索とフィルターを残し、Table の直上（件数の行と同じ位置）に置く。件数の行を置き換える（`DataTableSelectionBar` の `min-h-12`）。
- 選択の有無、ページの全件の選択（「検索条件に一致する 580件をすべて選択」の表示）、同じ条件の再取得の失敗（「再取得するまで操作できません」）で、件数の行の高さを変えない。行の高さが変わると、表が下がり、続けて押した位置が別の行になる。
  - 件数の行は 2 つの列の grid（`grid-cols-[minmax(0,1fr)_auto]`）にする。左の列（件数か一括操作のバー）は列の中で折り返し、右の列（更新中の表示、表示形式の切り替え）は折り返さない。
  - 一括操作のバーが件数の行に入りきらない幅では、選択の前から 2 行にする（1 行目に件数か一括操作のバーを全幅で、2 行目の右に表示形式の切り替え）。判断は行の容器の幅（Container Query）で行う。検証画面は、表示形式の切り替えがある場合は 70rem 未満、ない場合は 50rem 未満で 2 行にする（ページの全件の選択のバーの幅から決めた値）。
  - 文言、ボタンの名前、表示形式の名前を省略して 1 行に収めない。
  - 残る移動：ページの全件の選択と同じ条件の再取得の失敗が重なり、全幅でも入りきらない場合は、バーが列の中で折り返す。この場合は、失敗の警告（`DataRegionError`）を一覧の上に挿入するのと同じ描画で起き、行を押した操作の直後には起きない。
- 選択が 0 件のときは表示しない。
- 選択件数と、選択の解除を示す。

### 全件の選択

- 検索結果の全件の選択は、ページ内の全選択とは別の、明示的な操作にする。ページ内をすべて選んだときに「検索条件に一致する 580件をすべて選択」を示す。
- 選択の対象を文で区別する（「20件を選択中」「検索条件に一致する 580件をすべて選択中」「検索条件に一致する 580件のうち 578件を選択中」）。
- 正確な件数を確認できない場合は、架空の件数を示さない（「検索条件に一致するすべてのデータを選択」「検索条件に一致するすべてのデータを選択中」）。
- サーバー側の全件の選択は、検索条件と、外した行の ID で持つ（`useBulkSelection` の `all`）。選択の対象の確定、権限の確認、件数の検証、実際の処理の対象の固定は、バックエンドの責務である。

### 条件を変えたときの選択

- ID で選んだ行は、フィルター、ソート、ページを変えても ID で残す。
- いま表示していない選択の件数を示す（「3件を選択中（表示していない 2件を含む）」）。算出できない場合（全件の選択で総件数がわからない場合）は、推測した値を示さない（`hiddenCount` が `null`）。
- 全件の選択は、ID の選択とは別に持つ。条件を変えて選択の対象が暗黙に広がったり、変わったりしないよう、次のどちらかの方式にする。
  - 解除を明示する方式（実装）：条件を変えたら全件の選択を解除し、「検索条件を変更したため、検索結果全件の選択を解除しました」と示す（`notice`、`role="status"`）。
  - 元の条件に固定する方式（資料だけ）：選んだときの条件を保ったまま、「元の条件（契約中・関東）の 580件を選択中」と示す。表示中の行と選択の対象が一致しないため、表の Checkbox の表示と、実行の対象の説明を別に設計する必要がある。
- 別のワークスペースやアカウントに選択を持ち越さない（`scopeKey` が変わったら、すべて解除する）。

### 選択と詳細の表示

- 一括操作の選択（行の面の色、`data-state="selected"`）と、詳細を表示中の行（先頭のセルの線、`aria-current`）を、別の状態として持つ。
- 選択は安定したレコードの ID で持ち、配列の位置で持たない。
- Data Table の選択の見た目（v0.1）を変えない。

### 操作の配置

- よく使う操作を 1〜3 個直接置き、その他は Dropdown Menu にまとめる。
- Secondary と Ghost を基本にする。危険な操作は、既存の Destructive の仕様（文字の色、Dropdown Menu の `variant="destructive"`）を使う。
- 実行できない操作は無効にする。表示中の行に依存する操作は、`useBrowseData` の `canOperate` が `true` の間だけ受け付ける。再取得中、取得失敗、同じ条件の再取得の失敗の間は、`DataTableSelectionBar` の `disabled` で一括操作を、`DataTable` の `locked` で行の選択と行の操作を受け付けない。同じ条件の再取得に失敗した場合は、`disabledReason` で「再取得するまで操作できません」と示す。選択の解除は受け付ける。
- `isCurrent`（表示できる）や `status === "ready"` だけで、操作の可否を判断しない。同じ条件の再取得に失敗した場合、どちらも成り立つが、表示中の行は最新の取得の結果ではない。

### 確認

影響の範囲、取り消せるか、対象から、確かめ方を選ぶ。

| 操作 | 確かめ方 |
| --- | --- |
| 削除などの不可逆な操作 | `ConfirmActionDialog`（`variant="destructive"`、`progress="external"`）。見出しに件数、説明に対象（先頭の 3 件の名前と残りの件数、または検索条件）、変更の内容、取り消せないことを書く。実行のボタンに操作と件数を書く（「12件を削除する」）。実行のボタンを押したときに Dialog を閉じ、一括操作の領域で処理中を示す（下の「一括削除の確認」） |
| 取り消せる低リスクの操作（担当者の変更） | 確認を挟まずに実行し、すべて完了した場合は Toast の「元に戻す」で取り消せる |

「本当によろしいですか？」だけで確認を済ませない。

### 一括削除の確認

確定した仕様（[data-browsing.md](data-browsing.md#一括削除の確認)）。実行前の確認、実行中の進捗、実行後の結果を、別の場所で示す。

| 段階 | 場所 | 内容 |
| --- | --- | --- |
| 確認 | `ConfirmActionDialog`（Alert Dialog） | 対象、件数、変更の内容、取り消せないこと。初めのフォーカスはキャンセル。表示中に対象か件数が変わったら、変わったことを示し、「変更後の内容を確かめました」を押すまで実行できない（`targetKey`） |
| 実行の開始 | Dialog を閉じる（`progress="external"`） | 確認した時点の対象を固定する（`selection.snapshot()`）。`onConfirm` に渡される `targetKey`（表示していた対象）と、実行の時点の対象のキーが一致する場合だけ実行する。Dialog を閉じることは処理の中止ではない |
| 実行中 | 一括操作の領域（`DataTableSelectionBar` の中の `BulkRunStatus`） | 操作のボタンを置かない（二重実行の防止）。実際の進捗があるときだけ Progress。実行中も選択の解除と閲覧はできる |
| 実行後 | すべて完了：Toast。部分的な失敗、すべての失敗、結果が不明、結果の不足・矛盾：一覧の上の `BulkResultAlert` | フォーカスは、すべて完了した後は最初の行の名前のボタン（なければ検索欄）、それ以外は結果の表示 |

短時間で終わる単一のレコードの操作などでは、Dialog の中で実行のボタンを Loading にし、成功の後に閉じる方式も認める。Data Table v0.1 のプレビューの一括削除（複数の行を Dialog の中で処理中にする）は、部品の組み合わせを示す Components 単体の例であり、この Pattern の標準ではない。処理中は Dialog のキャンセルを無効にし、失敗した場合は Dialog を閉じて結果を示す。

`targetKey` の作り方（一括の操作で共通）：

- スコープ（アカウント、ワークスペース）を含める。
- ID の選択：並べ替えた ID の一覧。件数が同じでも ID が違えば変わる。
- 全件の選択：検索条件のキー、除外した ID の一覧、件数（`selection.count`、`BulkTarget` の `expectedCount`）。件数を含めないと、確認の表示中に検索結果の件数が変わっても確かめ直さない。
- 文と件数を、表示中の選択から作り、表示中に選択が変わったら Dialog の文も変わる。`targetKey` が変わるため、実行の前に確かめ直す（確かめていない内容で実行しない）。
- 確認の表示中に一覧の再取得が始まった（`canOperate` が `false`）、選択がなくなった、別の実行が始まった場合は、実行しない（検証画面は実行せずに Toast で知らせる）。

### 実行と結果

- 二重実行を防ぐ。`useBulkAction` の `start` は、実行中の呼び出しを無視する（ボタンの無効化より前に、同じ描画の中の 2 回目の押下も止める）。
- 実行を始めた時点で対象を固定する（`selection.snapshot()` を `start` に渡す）。実行中に選択や検索条件を変えても、処理の対象は変わらない。
- 実際の進捗を取得できる場合だけ、進捗を示す（`reportProgress`）。呼ばない場合は、進捗率を示さない。
- 成功した行の選択を解除する。失敗した行は選択したまま残す（`selection.settle(summary)`）。全件の選択を実行した場合は、失敗した行だけを ID で選んだ状態にする。
- 全件の選択の実行で、要求そのものが失敗した（処理されていない、`requestError.outcome` が `failed`）場合は、選択をそのまま残し、同じ対象で「もう一度実行」できる。
- 失敗した行だけを、同じ操作の内容（`summary.payload`）で再試行できる（`retryFailed`）。再試行しても解決しない失敗（`retryable: false`、権限不足など）は、再試行の対象から除く。再試行の間は、前の結果の表示を残す。
- 実行の間にスコープ（アカウント、ワークスペース）が変わった場合は、実行の待機を中止し、結果を表示せず、新しいスコープの選択を変えない（`useBulkAction` の `scopeKey`、`BulkTarget` の `scope`）。実行中の操作、進捗、結果はスコープと組で持ち、描画の時点で現在のスコープの値だけを返す。
- スコープの変更とアンマウントで世代を進め、それより前に始めた実行の結果、進捗、`onSettled`（Toast など）を無効にする。`run` が `AbortSignal` を無視する場合も、古い結果で新しい状態を書き換えない。A → B → A と素早く切り替えた場合も、最初の A で始めた実行の結果は反映しない。
- 実行の間に利用者が選択を変えた場合は、結果で選択を変えない（`BulkTarget` の `selectionRevision`）。以前の操作の結果で、新しい選択を変えない。
- 成功の件数と失敗の件数を分けて示す。
- 結果を固定した対象と照合する（`reconcileBulkResults`。`useBulkAction` が自動で行う）。結果が足りない場合に、すべて完了と判断しない。
- 要求の宛先（ワークスペースなど）は、描画の時点の値ではなく、固定した対象の `target.scope` から決める。`start` は、現在のスコープと異なるスコープで固定した対象（スコープを変えた後に押された「元に戻す」など）を実行しない。対象が 0 件の ID の実行もしない。
- 前の実行から遅れて届いた進捗（`reportProgress`）は、次の実行の進捗として示さない（実行ごとの番号で照合する）。

| 結果 | 扱い |
| --- | --- |
| ID の対象のうち、結果が返らなかった ID | 結果が不明（「結果が返されませんでした」） |
| 同じ ID の結果が重なった | 1 つとして数える。異なる結果が重なった ID は結果が不明 |
| 対象ではない ID の結果（全件の選択では、外した ID） | 数えない。その行が変更された可能性があるため、名前（`integrity.unexpectedIds`）を示す |
| 形式が正しくない結果 | 数えない |
| 応答そのものの形式が正しくない | 結果が不明の要求の失敗（`BulkRequestError` の `unknown`） |
| 全件の選択：確定した件数（`confirmedCount`）より結果が少ない | 足りない件数を、ID を特定できない不足として示す |
| 全件の選択：確定した件数より結果が多い | 矛盾として示す |
| 全件の選択：確定した件数を返さない | 完全性を確かめられないものとして示す。架空の件数を作らない |
| 全件の選択：確定した件数が、確認で示した件数（`expectedCount`）と異なる | すべて完了として扱わない（`integrity.countChanged`）。「選択したときは 580件でしたが、実行の時点では 600件が対象になりました」と示す。不可逆な操作で確認した範囲と処理の範囲が異なることを、利用者が確かめられるようにする |
| 要求そのものが失敗した（ID の対象） | 照合する結果がない（`integrity.reconciled` が `false`）。行ごとの失敗か結果が不明として示し、結果の不足や矛盾としては示さない |
| 結果の `message`、`retryable` の型が正しくない | 値を捨てる（文字列ではない `message` を描画しない） |

不足や矛盾があるとき（`summary.integrity.complete` が `false`）は、Toast にせず、一覧の上に件数と理由、「状態を確認」を示す。すべて完了として扱うのは `isBulkFullySucceeded(summary)` が `true` の場合だけである。
- 処理の結果が不明な場合（通信の切断など）は、無条件に再試行しない。再試行のボタンを置かず、「状態を確認」を置く。結果が不明な行は、同じ操作の重複を防ぐため選択を解除し、結果の表示に件数を残す。
- 成功した処理を重複して実行しない。実際の API の実行と冪等性の保証は製品の責務である。
- すべて完了した場合は、選択を解除し、Toast で知らせる（担当者の変更は「元に戻す」を示す。「元に戻す」も `useBulkAction` で実行し、結果を同じ規則で示す）。
- 重要な部分失敗を Toast だけで伝えない。失敗や結果の不明を含む場合は、`BulkResultAlert` を一覧の上に置き、利用者が閉じるまで残す。

## 状態管理

| 状態 | hook | 内容 |
| --- | --- | --- |
| 選択 | `useBulkSelection({ queryKey, query, scopeKey, visibleIds, total })` | `rowSelection` と `onRowSelectionChange` を `useTable` に渡す。`count`、`hiddenCount`、`pageAllSelected`、`allMatching`、`excludedIds`、`notice` |
| 実行の対象 | `selection.snapshot()` | `{ kind: "ids", ids }` か `{ kind: "query", query, queryKey, excludedIds, expectedCount }`。どちらも `scope` と `selectionRevision` を持つ |
| 実行 | `useBulkAction({ run, onSettled, scopeKey })`、`start(action, target, payload)` | `running`（操作と固定した対象）、`progress`、`summary`（`payload`、`succeeded`、`failed`、`unknown`、`requestError`、`integrity`） |
| 結果の反映 | `selection.settle(summary)` | 完了と結果が不明の行の選択を解除し、失敗の行を残す。要求そのものが失敗した場合、スコープが変わった場合、実行の間に利用者が選択を変えた場合は変えない |
| 結果の照合 | `reconcileBulkResults(target, response)`、`isBulkFullySucceeded(summary)` | `useBulkAction` が使う。製品が独自の実行の仕組みで結果を受け取る場合も、同じ関数で照合できる |

`run` の戻り値（`BulkRunResponse`）は、行ごとの結果の配列（`BulkItemResult[]`）か、`{ items, confirmedCount }`。全件の選択の実行では、バックエンドが確定した対象の件数を `confirmedCount` で返す（API の契約）。

### 対象と操作の内容の固定

- `start` は、ID の配列（`ids`、`excludedIds`）を写して固定する。
- `query`（検索条件）と `payload`（操作の内容）は深く写さない。作った後に書き換えない値として扱う（不変のデータの契約）。任意の型を深く写すと、型ごとに扱い（Date、Map など）が異なるためである。
- `useBrowseQuery` は、条件を変えるたびに新しいオブジェクトを作るため、`snapshot()` が持つ `query` は、その後の条件の変更で変わらない。
- 製品が独自の値（書き換えるオブジェクト）を使う場合は、`start` に渡す前に、製品がスナップショットを作る（`structuredClone` など）。
- 再試行（`retryFailed`）は、最初の実行の `summary.payload` と、最初の対象の `scope`、`selectionRevision` を使う。
- 結果が不明な行は、製品が現在の認可でサーバーの状態を照会し、その結果を `resolveUnknown(results, { from })` で反映する（Patterns Integration Review で追加）。`succeeded` は完了、`failed` は確定した失敗に移し、`retryFailed` の対象にする。確かめられなかった行は渡さず、不明のまま残す。`from` は照会を始めたときの `capture()` で、照会の間にスコープが変わった場合（A → B → A を含む）は反映しない。結果が不明な行を、照会せずに再実行しない。追加の理由：照会の結果を表す状態と、処理されていなかった行の再試行を、製品ごとに別に作る必要があった（横断の検証画面の S13）。

- `queryKey` には、ページ番号を含めない（ページを移動しても全件の選択を解除しない）。検索語とフィルターから作る。
- 要求そのものが失敗した場合は、製品が `BulkRequestError(message, "failed" | "unknown")` を投げる。ID で選んだ対象は、その結果を行ごとに割り当てる。全件の選択では、対象の ID がわからないため、`requestError` として扱う。

## レスポンシブ

- 狭い画面では、選択中だけ、一括操作のバーを画面の下に置いてよい。検証画面では、main の中の `sticky` の要素として置く。内容の流れの中に場所を取るため、最後の行、Pagination、フォームの操作を隠さない。
- 下の余白は Safe Area を含める（`--app-safe-bottom`）。
- 多数の操作は Drawer か Dropdown Menu にまとめる。危険な操作は文字を残す（Data Table の仕様）。
- Drawer の中の操作の結果は、Drawer の中に示す。Components の全体統合検品で、狭い画面で Drawer の下部の操作に Toast が重なることを確認している（`toast.md`）。画面の下に一括操作のバーを置く間は、バーの高さを `--toast-offset-bottom` に設定し、Toast をバーの上に表示する。

## アクセシビリティ

- 選択件数の文は `aria-live="polite"`（`DataTableSelectionBar`）。
- 全件の選択の解除の知らせは `role="status"`。
- 実行の開始は、製品が常に置いている読み上げの領域（`aria-live`）で 1 回だけ伝える。`BulkRunStatus` は表示と同時に挿入されるため、`role="status"` を付けない。進捗は Progress の値で伝える。
- 結果は、失敗を含む場合は `BulkResultAlert` の `role="alert"`、すべて完了した場合は Toast。
- 押したボタンが消えた場合は、フォーカスを `<body>` に落とさない。実行を始めたときは `BulkRunStatus`（`tabIndex={-1}`）、すべて完了した後は表の最初の行の名前のボタン（なければ検索欄）、失敗を含む場合は結果の表示へ移す。
- 実際のスクリーンリーダーでの読み上げの回数と順序は、確かめていない（`data-browsing.md` の「未検証の事項」）。

## 実装例

```tsx
const selection = useBulkSelection({
  queryKey: JSON.stringify({ search: q.search, filters: q.filters }),
  query: q,
  scopeKey: workspaceId,
  visibleIds: rows.map((r) => r.id),
  total, // 正確な総件数。わからない場合は null
})
const action = useBulkAction<Query, Patch>({
  scopeKey: workspaceId,
  // ID の対象は行ごとの結果、全件の選択は { items, confirmedCount } を返す（API の契約）。
  // signal はクライアントの待機の中止であり、サーバーでの処理の取り消しを保証しない。
  run: (target, { signal, reportProgress, payload }) => api.bulkUpdate(target, payload, { signal, onProgress: reportProgress }),
  onSettled: (summary) => {
    selection.settle(summary)
    reload()
  },
})

<DataTableSelectionBar
  selectedCount={selection.mode === "ids" ? (selection.count ?? 0) : 0}
  hiddenCount={selection.hiddenCount ?? 0}
  onClearSelection={selection.clear}
  // 表示中の行に依存する操作は、最新の取得に成功している間だけ受け付ける（isCurrent や status === "ready" で判断しない）
  disabled={!data.canOperate}
  disabledReason={data.refreshFailed ? "再取得するまで操作できません" : undefined}
  selectAll={{
    matchingCount: total ?? undefined,
    pageAllSelected: selection.pageAllSelected,
    allSelected: selection.allMatching,
    excludedCount: selection.excludedIds.length,
    onSelectAll: selection.selectAllMatching,
  }}
>
  {action.running ? (
    <BulkRunStatus action={action.running.action} count={…} progress={action.progress} />
  ) : (
    <Button variant="secondary" size="sm" onClick={() => action.start("担当者の変更", selection.snapshot(), { owner })}>担当者を変更</Button>
  )}
</DataTableSelectionBar>
{/* すべて完了（不足も矛盾もない）の場合は Toast。それ以外は一覧の上に残す */}
{action.summary && !isBulkFullySucceeded(action.summary) && (
  <BulkResultAlert summary={action.summary} getItemLabel={nameOf} onRetryFailed={action.retryFailed} onCheckLatest={reload} onDismiss={action.dismiss} />
)}
```

プレビュー：`#/bulk-actions`、`#/browsing-app?page=customers`（下部の「検証用の操作」で結果を切り替える）。

## アンチパターン

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 選択を配列の位置で持つ | 並べ替えやページの移動で、別の行が選ばれる | 行の ID |
| ページ内の全選択を、検索結果の全件の選択として扱う | 意図しない行に操作が及ぶ | 全件の選択を別の明示的な操作にする |
| 条件を変えても全件の選択を残し、対象を新しい条件に合わせる | 選択の対象が暗黙に広がる | 解除して知らせる、または元の条件に固定して示す |
| 総件数がわからないのに件数を示す | 判断を誤らせる | 件数を示さない |
| バーを表の上に新しく差し込む | 選ぶたびに表の位置が動く | 件数の行と同じ位置に置く |
| すべての操作を Primary で並べる | どれが重要かわからない | Secondary と Ghost、その他はメニュー |
| 「本当によろしいですか？」だけの確認 | 対象と影響がわからない | 対象、件数、変更の内容、取り消せるかを書く |
| 実行中に選択を変えると対象が変わる | 意図しない行に操作が及ぶ | 開始時に対象を固定する |
| 進捗がわからないのに進捗率を示す | 誤った見通しを与える | 進捗率を示さない |
| 部分失敗を Toast だけで伝える | どの行が失敗したかを確かめられない | 結果を一覧の上に残す |
| 結果が不明な行を、自動で、または同じボタンで再試行させる | 重複して実行される | 最新の状態の確認を促す |
| 別のワークスペースに選択を持ち越す | 別の範囲のデータに操作が及ぶ | `scopeKey` で解除する |
| 返った結果の件数だけで、すべて完了と判断する | 返らなかった行、重複、対象外の結果を、完了として数える | 固定した対象と照合する（`reconcileBulkResults`、`isBulkFullySucceeded`） |
| 古いスコープや、アンマウントの後に届いた結果で、状態や Toast を変える | 別の範囲の結果が示される | スコープと世代で無効にする（`useBulkAction`） |
| 確認の Dialog を閉じることを、処理の中止として扱う | 処理はサーバーで続いている | Dialog は確認だけに使い、実行中の状態は一覧に示す |

## 製品側の責務

- 一括操作の API の実行、冪等性の保証、成功した処理の重複の防止。
- 全件の選択の対象の確定（検索条件と除外した ID から）、権限の確認、件数の検証、処理の対象の固定（バックエンド）。
- 行ごとの結果（成功、失敗と理由、再試行できるか、結果の不明）を返すこと。ID の対象では、対象のすべての ID について結果を 1 つずつ返す。
- 全件の選択の実行では、バックエンドが確定した対象の件数（`confirmedCount`）と、処理した行の ID ごとの結果を返すこと（API の契約）。
- `AbortSignal` は、サーバーでの処理の取り消しを保証しない。取り消しが必要な場合は、製品の API で扱う。
- `query` と `payload` を書き換えないこと（不変のデータの契約）。書き換える値を使う場合は、`start` に渡す前にスナップショットを作る。
- 実際の進捗を取得できる場合の報告。
- 「元に戻す」の処理（変更の前の値の保持）。
