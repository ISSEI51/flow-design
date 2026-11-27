# Confirmation

操作の前に確かめるか、実行した後に取り消せるようにするかを決める。

状態：v0.1 確定候補（設計と実装の方針は承認済み。Patterns Integration Review の前） ・ 実装：[`registry/patterns/confirm-action.tsx`](../../../registry/patterns/confirm-action.tsx) ・ 全体：[Forms & Workflows](forms-and-workflows.md)

## 目的

誤った操作による損失を防ぐ（原則 08）。同時に、影響の小さい操作や取り消せる操作に、不要な確認を挟まない（原則 07）。確認では、対象と影響を、判断に必要な分だけ示す（原則 01、04）。

## 使用条件

データを変える操作のすべてで、確認の要否を決める。影響の範囲、危険の大きさ、取り消せるかで判断し、操作の名前（削除、更新など）だけで機械的に分けない。

## 構成

| 部分 | 部品 | 仕様 |
| --- | --- | --- |
| 確認の Dialog | `ConfirmActionDialog` | Alert Dialog の寸法、配置、動き、アクセシビリティをそのまま使う |
| 見出し | `title` | 操作と対象（「3件の顧客を削除しますか？」） |
| 説明 | `description` | 影響の範囲と、取り消せるか |
| 対象の一覧 | `children` | 先頭の 3 件の名前と「ほか N件」など |
| 実行のボタン | `confirmLabel`、`retryLabel`、`variant` | 操作と件数（「3件を削除」）。失敗の後は `retryLabel`（「もう一度削除」） |
| キャンセル | `cancelLabel`（既定「キャンセル」） | Secondary。初期フォーカス。結果が不明の後は「閉じる」 |
| 実行の方式 | `progress`（`"inline"`、`"external"`） | 下の「実行の方式」 |
| 追加の確認 | `confirmationText`、`confirmationLabel` | 対象の名前の入力。一致するまで実行できない |
| 対象の変化 | `targetKey`、`changedNotice` | 開いている間に対象が変わったら警告（Alert の warning）と「変更後の内容を確かめました」を示す。押すまで実行できない |
| 実行の結果 | `onConfirm` の戻り値 | 失敗は `{ error }`、結果が不明は `{ unknown }`。例外は `FormSaveError` の `outcome` で区別する |
| 取り消し | `useUndoableAction({ windowMs, scopeKey })` の `run` | 実行の結果と「元に戻す」を Toast で示す |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/confirm-undo-dark.svg">
  <img alt="確認と取り消しの判断の図。左の列に操作の影響・危険度・取り消しやすさ、右の列に対応を並べる。影響が小さい操作は確認しない。安全に取り消せる操作はすぐに実行し、Toast の「元に戻す」を示し、期限まで元に戻せる。影響が大きい操作は確認の Dialog で、対象、件数、内容、影響の範囲を示す。取り消せない操作は Alert Dialog で、ボタンは Destructive、初期フォーカスはキャンセル。ワークスペースの削除など極めて重大な操作は対象の名前の入力を求め、本人確認の代わりにはしない。下の帯に、操作の名前（削除、更新など）だけで分けず、影響・危険度・取り消せるかどうかで決める、とある。" src="../../diagrams/confirm-undo-light.svg">
</picture>

## バリエーション

| 操作 | 確かめ方 | 例（プレビュー） |
| --- | --- | --- |
| 影響が小さい | 確かめない。結果を Toast かインラインで知らせる | 一覧の名前の変更（`#/confirmation`） |
| 安全に取り消せる | 確かめずに実行し、Toast の「元に戻す」を示す（`useUndoableAction`） | 顧客のアーカイブ（`#/forms-app?page=customers` の行のメニュー） |
| 影響が大きい | 確認の Dialog（`variant="default"`、実行のボタンは Primary） | 3件の請求書の送信 |
| 取り消せない | 確認の Dialog（`variant="destructive"`、実行のボタンは Destructive） | 担当者の削除、顧客の削除（行のメニュー）、選んだ顧客の一括の削除 |
| 極めて重大 | `confirmationText` で対象の名前の入力を求める | ワークスペースの削除（`#/forms-app?page=settings`） |

### 実行の方式

| `progress` | 用途 | 動作 |
| --- | --- | --- |
| `"inline"`（既定） | 短時間で終わる単一のレコードの操作（担当者の削除、ワークスペースの削除、請求書の送信） | Dialog の中で実行のボタンを Loading にし、結果を待つ。成功したら閉じる。失敗と結果が不明は Dialog の中に示す |
| `"external"` | 一括の操作（選んだ顧客の削除など） | 実行のボタンを押した時点（実行の開始時）で Dialog を閉じ、`onConfirm` を呼ぶ。進捗と結果は、製品が一覧の上に示す。`onConfirm` の戻り値と例外は使わない |

- 一括の操作は `"external"` を標準にする。Data Browsing v0.1 の Bulk Actions（[bulk-actions.md](bulk-actions.md)、[data-browsing.md](data-browsing.md#一括削除の確認)）と同じく、実行前の確認、実行中の進捗（`BulkRunStatus`）、実行後の結果（`BulkResultAlert`、すべて完了した場合は Toast）を、それぞれ別の場所で示す。実行と結果の照合は `useBulkAction` が行う。
- Dialog を閉じることは、処理の中止ではない。

## 動作

### 確認の Dialog

- 必要に応じて、対象、件数、操作の内容、影響の範囲、取り消せるかを示す。「確認」「本当によろしいですか？」だけにしない。
- 同じ情報を見出し、説明、ボタンで不必要に繰り返さない（見出しに件数と操作、説明に影響と取り消せるか、ボタンに操作と件数）。
- 初期フォーカスはキャンセル（Alert Dialog の既定）。名前の入力を求める場合は入力欄。実行のボタンに初期フォーカスを置かないため、開いた直後の Enter で実行されない。
- Escape はキャンセル。外側のクリックでは実行も閉じることもしない。
- 名前の入力欄での Enter は何もしない（`preventDefault`）。実行は実行のボタンだけで行う。

### 実行と結果（`progress="inline"`）

- 実行中は、実行のボタンを Loading にし、キャンセル、Escape で閉じない（結果がわからなくなるため）。`onConfirm` の二重の呼び出しを止める。
- 成功したら Dialog を閉じる。完了の知らせは製品が Toast かインラインで示す。不要な完了の Dialog を置かない。
- 実行の前の確認、処理中の表示（Loading）、実行の後の結果を分ける。

| 結果 | `onConfirm` | 表示 |
| --- | --- | --- |
| 成功 | 何も返さない | Dialog を閉じる |
| 失敗（実行されていないことが確か） | `{ error: 文 }` を返す。または `FormSaveError(message, "failed")` を投げる | Dialog を閉じず、原因を Alert（destructive、`role="alert"`）で示す。同じ Dialog から、もう一度実行できる（`retryLabel`） |
| 結果が不明（実行されたかわからない） | `{ unknown: 文 }` を返す。または `FormSaveError(message, "unknown")` か、それ以外の例外を投げる | Dialog を閉じず、Alert（warning、`role="alert"`）で示す。もう一度実行のボタンを置かず、キャンセルを「閉じる」にする（名前の入力欄も無効にする）。状態を確かめる手段は製品が示す（「請求書の一覧で送信の状態を確認してください」）。結果が不明になった対象（`targetKey`）は、この部品を表示している間、閉じて同じ対象で開き直しても結果が不明のまま示し、実行のボタンを示さない。`onUnknown(targetKey)` で製品に知らせる。製品が状態を確かめて解く場合は、`targetKey` を変える（版や確認の時刻を含める）か、部品を作り直す |

- `FormSaveError` ではない例外の文は「実行されたかを確かめられていません。最新の状態を確認してください。」。初期実装では、例外を失敗として扱い、もう一度実行できるようにしていた。v0.1 では、実行されていないことが確かな場合（`FormSaveError` の `failed`）だけを失敗とする。
- 開閉のたびに世代を進める。閉じた後、または別の対象で開き直した後に届いた古い実行の結果で、Dialog の表示を変えない（検品：「confirm dialog: a result of the previous target does not close the dialog reopened for another target」）。

### 処理の対象

- 対象の考え方は、Data Browsing の [Bulk Actions](bulk-actions.md) と同じにする。確認の時点の対象と、実際の処理の対象を一致させる。
- `targetKey` に、対象と内容を表すキーを渡す（ID の一覧、操作の内容、全件の選択では条件と除いた ID）。件数が同じでも ID が違えば `targetKey` が変わるように、製品が作る（件数だけから作らない）。
- 開いている間に `targetKey` が変わったら：
  - 「表示している間に、対象か内容が変わりました。変更後の内容を確かめてください。」（`changedNotice`）と「変更後の内容を確かめました」のボタンを示す。
  - 名前の入力をやり直させる（入力を消す）。
  - 利用者が「変更後の内容を確かめました」を押すまで、実行のボタンを無効にする。押した時点の `targetKey` を、確かめた対象とする。
- `onConfirm({ targetKey })` には、実行のボタンを押した時点で表示していた `targetKey` を渡す。製品は、実行する対象がこのキーと一致するかを確かめる。古い確認の内容で別の対象を実行しない。
- 破壊的な操作では、実行の時点でも、対象、権限、整合性をバックエンドで検証する。確認の Dialog の表示は、実行の時点の対象を保証しない（例の一括の削除の説明：「実行の時点で、サーバーが対象と権限を確かめます。」）。
- 例：選んだ顧客の一括の削除（`#/forms-app?page=customers`）。「検証用の操作」の「削除の確認の表示中に、選んだ行の 1 件を選択から外す」を選び、2 件以上を選んで削除の確認を開くと、1.5 秒後に 1 件が選択から外れる。確認は件数と名前を描き直し、変わったことを示し、「変更後の内容を確かめました」を押すまで実行できない。`targetKey` は対象の ID を並べた文字列である。

### 追加の確認

- アカウントやワークスペースの完全な削除など、極めて影響の大きい操作では、対象の名前の入力を求めてよい。
- 入力した文字が一致するまで、実行のボタンを無効にする。比較では前後の空白を除き、全角と半角の違いを NFKC でそろえる。一致しない文字を入力している間は「入力した文字が一致していません」を示す。
- セキュリティのために必要な場合は、再認証や承認の流れを使う（製品の責務）。対象の名前の入力を、本人確認や権限の確認の代わりにしない。
- 同じ確認の Dialog を繰り返し表示しない。

### 取り消し（Undo）

- 実際に安全に取り消せる場合だけ使う。取り消しの処理（バックエンド）は製品が持ち、`undo` に渡す。
- `run({ perform, undo, title, undoneTitle, … })` は、`perform` が成功したら、結果（`title`）と「元に戻す」を Toast で示す。
- 1 回の実行ごとに、別の通知と別の取り消しを持つ。通知の id は hook のインスタンスごとに分ける（同じ画面に複数の `useUndoableAction` を置いても、通知の id が重ならない）。続けて実行しても、別の操作を取り消さない。
- 取り消しの対象は、実行の結果（`perform` の戻り値）で固定し、`undo(result)` に渡す。描画の時点の値（現在の行、現在のワークスペース）を使わない。例：アーカイブの `perform` は `{ id, ws }` を返し、`undo` はその ID とワークスペースで戻す。
- 取り消せる期限（`windowMs`、既定 10000ms）と、実際に取り消せる期間を一致させる。期限でタイマーが通知を閉じる。取り消しの時点でも `Date.now()` で期限を確かめ、ポインターを重ねて通知が残った場合も、期限の後は「元に戻せる時間を過ぎました」を示して受け付けない（`expiredDescription` で、ほかの戻し方を書く）。
- `scopeKey`（アカウント、ワークスペース）が変わったら、前のスコープの「元に戻す」の通知を閉じ、取り消しを受け付けない（既定の文は「表示している範囲（ワークスペースなど）が変わったため、元に戻せません」。`staleTitle` で変えられる）。実行の間にスコープが変わった場合は、新しいスコープに通知を出さない（`run` の `outcome` は `stale`）。

| 結果 | 表示 | `run` の戻り値、`undo()` |
| --- | --- | --- |
| 実行の成功 | `title` と「元に戻す」 | `{ ok: true, handle }` |
| 実行の確定した失敗（`FormSaveError` の `failed`） | 「実行できませんでした」（`failedTitle`、destructive） | `{ ok: false, outcome: "failed" }` |
| 実行の結果が不明（`FormSaveError` の `unknown`、それ以外の例外） | 「実行されたかを確かめられていません」（`unknownTitle`、warning）。「元に戻す」を示さない | `{ ok: false, outcome: "unknown" }` |
| 取り消しの成功 | `undoneTitle` | `undo()` が true |
| 取り消しの確定した失敗 | 「元に戻せませんでした」（`undoFailedTitle`、destructive）。期限の中であれば、この通知に「もう一度元に戻す」（`retryUndoLabel`）を置き、期限で通知を閉じる。`handle.undo()` でももう一度取り消せる。再試行の通知は新しい id で出す（閉じた通知と同じ id は、閉じる途中の通知として扱われ、操作できない） | false |
| 取り消しの結果が不明 | 「元に戻せたかを確かめられていません」（`undoUnknownTitle`、warning）。「元に戻す」も「もう一度元に戻す」も示さず、もう一度取り消せる状態に戻さない | false |

- Toast は消えるため、重要な戻す手段を Toast だけにしない。画面にも戻す手段を置く（例：アーカイブ済みの顧客の一覧の「元に戻す」）。

### 危険な操作の配置

- 低い頻度の危険な操作は、Dropdown Menu の末尾などに分ける（区切り線の後、`variant="destructive"`）。
- 設定の画面では、独立した Section（区切り線、`divider`）に置いてよい。ボタンは Secondary の形で文字を Destructive の色にする。
- 大きな赤い枠や、過剰な警告の表現を標準にしない。

## アンチパターン

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 操作の名前だけで確認の要否を決める | 取り消せる削除にも確認が出る。影響の大きい更新に確認が出ない | 影響、危険の大きさ、取り消せるかで決める |
| 「本当によろしいですか？」だけの確認 | 対象と影響がわからない | 対象、件数、内容、影響、取り消せるか |
| 実行のボタンに初期フォーカスを置く | 開いた直後の Enter で実行される | キャンセルに初期フォーカス |
| 外側のクリックで実行する、閉じる | 意図しない結果になる | Alert Dialog の既定（閉じない） |
| 失敗したら Dialog を閉じる（単一のレコードの操作） | 失敗に気付かない。対象を選び直す必要がある | 閉じずに原因を示し、再試行できる |
| 結果が不明な実行を、同じ Dialog から再実行させる | 二重に実行される | 「閉じる」だけを置き、状態を確かめる手段を示す |
| 一括の操作の進捗と結果を、確認の Dialog の中に示す | 確認、進捗、結果が 1 つの Dialog に重なり、閉じると結果が消える | `progress="external"` と一覧の上の表示 |
| 確認の後に対象が変わっても、そのまま実行する | 確かめていない対象に操作が及ぶ | 変化を示し、確かめ直させ、表示していた対象で実行する |
| 件数だけから `targetKey` を作る | 件数が同じで対象が違う場合に、変化を検出できない | ID の一覧と操作の内容から作る |
| 確認の表示を、実行の時点の対象の保証として扱う | 確認の後の変更や権限の変更を見逃す | 実行の時点でバックエンドが検証する |
| 名前の入力を本人確認の代わりにする | 権限のない利用者も実行できる | 再認証、承認 |
| 取り消せない操作に「元に戻す」を示す | 戻せると誤解させる | 取り消せる場合だけ Undo |
| 結果が不明な実行に「元に戻す」を示す | 実行されていない操作を取り消そうとする | 「元に戻す」を示さない（`unknownTitle`） |
| 描画の時点の値で取り消す | 別の行や別のワークスペースを変える | `perform` の戻り値で対象を固定する |
| Toast の表示の期間と、取り消せる期間が異なる | 押しても戻せない、または戻せるのに手段がない | 期限で閉じ、期限を確かめる |
| 戻す手段を Toast だけにする | 見逃すと戻せない | 画面にも戻す手段を置く |
| 確認の後に完了の Dialog を出す | 閉じる操作が増える | Toast かインラインの表示 |
| 危険な操作を大きな赤い枠で囲む | 画面の静けさを損ない、警告に慣れさせる | 分けた位置と Destructive の文字 |

## 状態管理

| 状態 | 持つ場所 | 内容 |
| --- | --- | --- |
| 開閉 | 製品（`open`、`onOpenChange`） | 実行中（`inline`）は `onOpenChange` を呼ばない。`external` は実行の開始時に `onOpenChange(false)` を呼ぶ |
| 実行中 | `ConfirmActionDialog` | 二重の実行を止める印と、Loading の表示（`inline`） |
| 失敗、結果が不明 | `ConfirmActionDialog` | 原因の文。開き直すと消える |
| 名前の入力 | `ConfirmActionDialog` | 開き直すと消える。対象が変わったら消える |
| 確かめた対象 | `ConfirmActionDialog` | 開いたときの `targetKey`。「変更後の内容を確かめました」を押すと、その時点の値にする |
| 結果が不明になった対象 | `ConfirmActionDialog` | `targetKey` ごとの結果が不明の文。部品を表示している間は残り、同じ対象で開き直しても実行のボタンを示さない |
| 世代 | `ConfirmActionDialog` | 開閉のたびに進める。古い世代の実行の結果は使わない |
| 取り消し | `useUndoableAction` | hook のインスタンスの番号と実行ごとの番号から作る通知の id、実行したときのスコープ、期限（`expiresAt`）、状態（`open`、`undoing`、`done`）、タイマー。アンマウントでタイマーを止める |

`run` は `{ ok: true, handle: { expiresAt, scopeKey, undo } }` か `{ ok: false, outcome: "failed" | "unknown" | "stale" }` を返す。`undo()` は、期限を過ぎた場合、すでに取り消した場合、スコープが変わった場合、失敗した場合、結果が不明の場合に false を返す。

## アクセシビリティ

- Alert Dialog（`role="alertdialog"`）。見出しと説明は `AlertDialogTitle` と `AlertDialogDescription` で関連付ける。
- 初期フォーカスはキャンセル（名前の入力を求める場合は入力欄）。
- 名前の入力欄は Field のラベル（「確認のため「本社営業部」と入力してください」など）で名前を持つ。
- 失敗の原因と結果が不明の知らせは `role="alert"`。対象の変化の警告は Alert の warning。
- 取り消しの結果、失敗、期限の後の知らせは Toast（Components の Toast の読み上げ）。
- `progress="external"` の場合、Dialog を閉じた後のフォーカスと実行の開始の読み上げは、製品の一覧が扱う（Data Browsing の `BulkRunStatus`、[bulk-actions.md](bulk-actions.md)）。

## 製品側の責務

- 実行、取り消しの API と冪等性。実行されていないことが確かな場合だけ失敗（`{ error }`、`FormSaveError` の `failed`）にすること。
- `targetKey` の作り方（ID の一覧、操作の内容）と、`onConfirm` に渡された対象と実行する対象の一致の確認。
- 権限、対象の範囲、整合性の最後の検証（実行の時点のバックエンド）。
- 結果が不明な場合の状態の確認の手段。
- 一括の操作の進捗と結果の表示（`progress="external"` の場合。Data Browsing の `useBulkAction`、`BulkRunStatus`、`BulkResultAlert`）。
- 再認証、承認の流れ。
- 完了の知らせ（Toast、一覧の上の表示）と、Toast の外に置く戻す手段。
- `useUndoableAction` の `scopeKey` と、`perform` が取り消しの対象（ID、スコープ）を返すこと。

## 実装例

```tsx
// 一括の操作：実行を始めた時点で閉じ、進捗と結果は一覧の上に示す（Data Browsing の Bulk Actions）
const target = confirmOpen ? selection.snapshot() : null
const count = target?.kind === "ids" ? target.ids.length : (target?.expectedCount ?? null)
// 件数が同じでも ID が違えば変わるキー
const targetKey = target ? JSON.stringify(target.kind === "ids" ? [...target.ids].sort() : [target.queryKey, target.excludedIds]) : undefined

<ConfirmActionDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  variant="destructive"
  progress="external"
  title={count === null ? "検索条件に一致する顧客をすべて削除しますか？" : `${count}件の顧客を削除しますか？`}
  description="削除した顧客は元に戻せません。契約と請求の履歴も表示できなくなります。実行の時点で、サーバーが対象と権限を確かめます。"
  confirmLabel={count === null ? "すべて削除" : `${count}件を削除`}
  targetKey={targetKey}
  onConfirm={() => void action.start("削除", selection.snapshot(), { kind: "delete" })} // useBulkAction
>
  <ul>{names.slice(0, 3).map((n) => <li key={n}>{n}</li>)}{names.length > 3 && <li>ほか {names.length - 3}件</li>}</ul>
</ConfirmActionDialog>

// 単一のレコードの操作：Dialog の中で処理中を示す（progress の既定 "inline"）
<ConfirmActionDialog
  open={deleting !== null}
  onOpenChange={(o) => !o && setDeleting(null)}
  variant="destructive"
  title={`「${deleting?.name}」を削除しますか？`}
  description="削除した顧客は元に戻せません。"
  confirmLabel="顧客を削除"
  targetKey={deleting?.id}
  onConfirm={async ({ targetKey }) => {
    // 表示していた ID で実行する。確定した失敗は FormSaveError の failed、それ以外の例外は結果が不明になる
    await api.deleteCustomer(targetKey!, { workspaceId })
    toast({ variant: "success", title: "顧客を削除しました" })
  }}
/>

// 対象の名前の入力
<ConfirmActionDialog
  open={deletingWorkspace}
  onOpenChange={setDeletingWorkspace}
  variant="destructive"
  title="ワークスペース「本社営業部」を削除しますか？"
  description="顧客、契約、請求、取り込みの履歴を含む、すべてのデータを削除します。削除したデータは元に戻せません。"
  confirmationText="本社営業部"
  confirmLabel="ワークスペースを削除"
  targetKey={workspaceId}
  onConfirm={() => api.deleteWorkspace(workspaceId)}
/>

// 取り消せる操作
const undo = useUndoableAction({ scopeKey: workspaceId })
const archive = (c: Customer) =>
  undo.run({
    perform: () => api.archiveCustomer(c.id, workspaceId), // { id, ws } を返す
    undo: (r) => api.restoreCustomer(r.id, r.ws), // 実行の結果で対象を固定する
    title: `${c.name}をアーカイブしました`,
    undoneTitle: `${c.name}を元に戻しました`,
    expiredDescription: "アーカイブ済みの顧客の一覧から戻せます",
  })
```

プレビュー：`#/confirmation`、`#/forms-app?page=customers`（下部の「検証用の操作」で実行と取り消しの結果を切り替える）、`#/forms-app?page=settings`（ワークスペースの削除）、`#/forms-checks?case=scope`（検品用の画面。Undo の通知の id、スコープの変更、確認の Dialog の開き直し）。
