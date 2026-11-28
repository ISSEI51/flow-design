# Create & Edit

データを登録し、編集し、保存する。保存ボタンを押せる条件と、保存の結果を正確に伝える。

状態：v0.1 確定候補（設計と実装の方針は承認済み。Patterns Integration Review の前） ・ 実装：[`registry/patterns/form-state.ts`](../../../registry/patterns/form-state.ts)、[`registry/patterns/save-modes.ts`](../../../registry/patterns/save-modes.ts) ・ 全体：[Forms & Workflows](forms-and-workflows.md)

## 目的

入力の問題を、入力した場所で、入力を終えた時点で伝える（原則 01、03）。長いフォームで保存ボタンを押した後にエラーの場所まで戻る負荷をなくす（原則 07）。入力した内容を失わせず、実際の保存の状態と画面の表示を一致させる（原則 08）。

## 使用条件

データの登録、編集、設定の変更のすべてで使う。登録と編集では、フォームの構造、項目の順序、まとまりをできるだけ同じにする。登録と更新の処理、権限、変更できる項目は、製品が分ける。

## 構成

| 部分 | 部品 | 仕様 |
| --- | --- | --- |
| フォームの状態 | `useFormState({ initialValues, fields, asyncDebounceMs, scopeKey, requireChanges })` | 下の「状態管理」。`scopeKey` は下の「スコープと世代」、`requireChanges` は編集のフォーム |
| 項目の定義 | `FormFields<V>`（`label`、`required`、`requiredMessage`、`isEmpty`、`validate`、`validateAsync`、`asyncDeps`、`asyncFailure`、`asyncTimeoutMs`、`active`、`normalize`） | 検証の規則の中身は製品が書く |
| 文字の入力欄 | `form.inputProps(name)` を Input、Textarea に渡す | `name`、`value`、`required`、`onChange`、`onCompositionStart`、`onCompositionEnd`、`onBlur` |
| 選択式の項目 | `form.setValue(name, value, { commit: true })` | Select、Checkbox、日付。選んだ時点で入力を終えたとみなす |
| エラー | `form.error(name)` を FieldError に渡す | 表示する時点のエラーだけを返す |
| 非同期の検証の状態 | `form.asyncStatus(name)`、`form.asyncMessage(name)`、`form.revalidate(name)` | 下の「非同期の検証」 |
| 保存ボタン | Button（Primary、`loading`、`disabled={!form.canSubmit}`、`focusableWhenDisabled`、`aria-describedby`） | Focusable Disabled（下の「Focusable Disabled」）。文言は操作の結果（「登録する」「保存する」「担当者を変更」） |
| 保存できない理由 | `SaveBlockerNotice`（`blockers`、`hidden`、`detail`、`detailLimit`、`goal`、`unchanged`、`onFocusField`） | 保存ボタンの近く（[form-layout.md](form-layout.md)） |
| フォーム全体のエラー | Alert（`role="alert"`） | `form.formError`。保存ボタンの上 |
| 送信の処理 | `form.handleSubmit(save, { onBlocked, onSuccess })` | form の `onSubmit` に渡す |
| Enter による送信 | `submitOnEnter(event, submit)` | form の `onKeyDown` に渡す（下の「Enter による送信」） |
| 保存の処理の例外 | `FormSaveError(message, outcome)` | `outcome` は `"failed"`（保存されていないことが確か）か `"unknown"`（保存されたかわからない） |
| 結果が不明の解除 | `form.resolveUnknown({ saved: true, values? } \| { saved: false })` | 製品が保存の状態を確かめた結果で解く |
| 即時保存 | `useInstantSave({ value, save, verify, scopeKey })` | 独立した Switch、単一の項目 |
| 自動保存 | `useAutosave({ value, save, delayMs, enabled, scopeKey })` | 文書、メモなどの継続的な入力 |

### 登録・編集・保存の流れ

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/create-edit-flow-dark.svg">
  <img alt="登録・編集の流れの図。入力（項目ごとに検証する）から、すべての検証が成功すると保存ボタンが有効になり、押すと保存中になる。保存中は、ボタンは同じ大きさで処理中を示し、送信した時点の値を確定し、二重の実行を防ぐ。結果は 3 つに分かれる。1 成功は基準値を更新し、移動先は新規登録なら作成した詳細、一覧からの編集なら元の一覧、設定の変更なら同じ画面、連続の登録なら「登録して次へ」。2 失敗は入力を残し、項目のエラーは項目に、全体のエラーはフォームの上に示す。3 結果が不明は無条件に再実行せず、状態を確かめる。下部に表示の方法として、Dialog は短い操作、Sheet は一覧や詳細からの簡単な登録・編集、別のページは項目が多い・複雑な判断、Inline は頻繁に変える単一の項目を示す。" src="../../diagrams/create-edit-flow-light.svg">
</picture>

図の「2 失敗」は、保存されていないことが確かな失敗（`FormSaveResult` の `failed`、`FormSaveError` の `failed`）と、サーバー側の検証のエラー（`invalid`）である。保存の処理が投げたそのほかの例外は「3 結果が不明」として扱う（下の「保存の結果」）。

## バリエーション

### 表示の方法

項目の数だけで機械的に決めない。操作の内容で選ぶ。

| 表示の方法 | 用途 | 例（プレビュー） |
| --- | --- | --- |
| Dialog | 少数の項目で終わる短い操作 | 担当者の追加（`#/create-edit`） |
| Sheet | 一覧や詳細からの簡単な登録・編集 | 連絡先の変更（`#/forms-app?page=customer&id=cu-1`） |
| 別のページ | 項目が多い、複雑な判断を伴う操作 | 顧客の登録と編集（`page=customer-new`、`page=customer-edit`） |
| Inline | 頻繁に変える単一の項目 | 社内のメモ（顧客の詳細） |

- 閲覧の Sheet と編集の Sheet の区別は、Data Browsing の方針（[list-and-detail.md](list-and-detail.md)）を保つ。
- 閲覧が主な目的の画面では、閲覧と編集を分ける（詳細のページ → 「編集」）。設定の画面など、変更が主な目的の画面は、最初から編集できる状態にしてよい。

### 保存の方式

| 方式 | 用途 | 部品 | 動作 |
| --- | --- | --- | --- |
| 明示的な保存 | 通常の業務のフォーム | `useFormState` | 保存ボタンで保存する |
| 即時保存 | 独立した Switch、単一の項目 | `useInstantSave({ value, save, verify, scopeKey })` | 切り替えた時点で保存する。保存中は次の変更を受け付けない（`change` が false を返す。操作部品を `disabled={pending}` にする）。確定した失敗（`FormSaveError` の `failed`）は、最後に保存できた値に戻し、`failed` にする。結果が不明（それ以外の例外）は、値を戻さずに `unknown` にし、次の変更を受け付けない（下の「即時保存と自動保存の結果が不明な場合」） |
| 自動保存 | 文書、メモなどの継続的な入力 | `useAutosave({ value, save, delayMs, enabled, scopeKey })` | 入力が止まってから（既定 1000ms）保存する。`saved`、`unsaved`、`saving`、`failed`、`unknown` を区別する。保存中に値が変わったら、保存の後に最新の値をもう一度保存する。確定した失敗は、値が変わるか `retry()` を呼ぶまで自動で繰り返さない。結果が不明は、値が変わっても自動では保存しない |

即時保存の失敗の例：「保存できなかったため、元の設定に戻しました。もう一度切り替えてください」（`#/forms-app?page=settings`、「即時保存の結果」の「失敗」）。

#### 即時保存と自動保存の結果が不明な場合

保存の処理（`save`）は、保存されていないことが確かな場合だけ `FormSaveError(message, "failed")` を投げる。`FormSaveError(message, "unknown")` と、それ以外の例外（通信の例外など）は、サーバーで処理が終わっている可能性があるため、結果が不明として扱う。

| 部品 | 結果が不明の間 | 解き方 |
| --- | --- | --- |
| `useInstantSave` | 値を戻さない（表示を戻すと、サーバーの値も戻ったと誤認させるため）。`status` が `unknown`、`unknown` が true。`change` は false を返す | `check()`：`verify`（サーバーの値を読む処理）を呼び、表示をサーバーの値にそろえる（確かめている間は `status` が `checking`）。`value`（サーバーが保存している値）が変わった場合も、その値で解く |
| `useAutosave` | `status` が `unknown`。値が変わっても自動では保存しない。`flush()` は保存せずに false を返す。`hasUnsavedChanges` は true | `retry()`（利用者の明示的な操作）か `markSaved(value)`（製品が確かめた値） |

- `retry()` は、文書の全体を保存する API のように、同じ値の保存を繰り返しても結果が変わらない（冪等である）場合だけ置く（例：チームのメモの「もう一度保存」）。
- 例：即時保存の「設定を確かめる」（`#/forms-app?page=settings`、「即時保存の結果」の「結果が不明」）。
- `scopeKey`（アカウント、ワークスペース、レコード）が変わったら、それより前に始めた保存の結果を使わない。`useInstantSave` と `useAutosave` は、スコープの変更とアンマウントで、保存に渡した `AbortSignal` を中止する（サーバーでの処理の取り消しは保証しない）。`useInstantSave` は `value` の値から始め直し、`useAutosave` はその時点の値を保存済みとして始め直す。アンマウントの後の結果も使わない。
- 中止（`signal.aborted`）の後に、製品の `save` は自分の状態を変えない（例の `InstantSwitch` は、中止の後にサーバーの値の state を更新しない）。`AbortSignal` はクライアントの待機の中止であり、サーバーでの処理の取り消しを保証しない。
- 自動保存とスコープの変更の注意：スコープが変わると、`useAutosave` は保存を待っている値（入力が止まるのを待っている値、保存中に変わった値）を保存せずに、新しいスコープの値を保存済みとして始め直す。前のスコープで入力が止まる前に切り替えた内容は保存されない。また、中止した保存は、サーバーで処理が終わっている可能性がある（前のスコープに保存されている）。スコープの切り替えの前に保存を終えるには、移動の確認（`useUnsavedChanges` の `saving` と `dirty` に `hasUnsavedChanges`）を通すか、切り替えの前に `flush()` を呼ぶ。別のタブでの切り替えなど、確認を通せない変更では、入力の一部が保存されないことがある。
- `useAutosave` は、スコープが変わった描画の `value` を、新しいスコープの保存済みの値とみなす。その描画で前のスコープの値を渡すと、前のスコープの値が新しいスコープで保存済みとして扱われ、後から取得した新しいスコープの値は「変更」として保存される。`scopeKey` と同じ描画で新しいスコープの値を渡すか、`key` で作り直す（`useFormState` と同じ）。

#### 即時保存と設定の保存の選び方

| 保存の対象 | 使う hook | 理由 |
| --- | --- | --- |
| サーバーに保存する設定で、権限、競合（版）、部分的な保存、項目ごとの結果を扱う必要がある | `useInstantSettings`、`useSettingsForm`（`setting-save.ts`、[settings.md](settings.md)） | `forbidden`、`conflict`、`partial`、版の照合、結果の確認を扱う |
| 1 つの値だけで、結果が成功、確定した失敗、結果が不明の 3 つだけで足りる（権限と競合を、保存の結果として区別しない） | `useInstantSave`（`save-modes.ts`） | 値を戻すか、戻さずに確かめるかだけを決める |

- 1 つの保存の対象（設定の項目、レコードの値）は、1 つの hook のインスタンスだけが持つ。同じ値を、2 つの `useInstantSave`、または `useInstantSave` と `useSettingsForm` で同時に保存しない（応答の順序で表示とサーバーの値が食い違う）。
- 画面は、保存した値の写しを別の state に持たない。表示する値は hook の `value` を使う。v0.1 の途中では、例の `InstantSwitch` が保存した値を別の state に持ち、hook の値と食い違っていた（`38174eb` で直した）。
- `useInstantSave` の `value` には、サーバーが保存している値を渡す。保存の結果を受け取る前に始めた取得（再取得の結果）を渡さない。保存が終わった（`status` が `saving` でない）後に始めた取得の結果だけを渡す。保存の前の取得の結果を渡すと、保存した値が古い値で上書きされたように表示される。

## 動作

### 保存ボタンの有効と無効

**必須の項目の入力が終わり、クライアント側で必要な検証がすべて成功するまで、保存ボタンを無効にする。**

これは利用者が明示的に決めた設計の方針である。入力に不備がある状態で保存ボタンを押させ、そこで初めてエラーを示す方式は、標準にしない。入力を終えた時点で、その場で問題を伝える。ただし、まだ操作していない入力欄に、最初の表示からエラーを示さない。

- 保存の可否（`canSubmit`）と、エラーを表示する時点を分ける。`canSubmit` は、表示に関係なく、次のすべてを満たすときだけ true になる。
  - 表示しているすべての項目（`active`）の必須と同期の検証が成功している。サーバー側の検証のエラーが残っていない。
  - 非同期の検証の結果が `valid` か `unverified` である（`pending`、`validating`、`invalid`、`error` の項目がない）。
  - IME の変換中の項目がない。保存中でない。保存の結果が不明（`unknown`）でない。
  - `requireChanges` の編集のフォームでは、変更がある（`unchanged` が false）。
- 最後の項目からフォーカスを外さなくても、正しい値を入力した時点で保存ボタンが有効になる（Blur していない正しい最後の項目で、保存を止めない）。
- 保存できない理由が見ただけでわからない場合は、保存ボタンの近くに理由を示す（`SaveBlockerNotice`）。

| 理由（`FormBlocker` の `kind`） | 文（`SaveBlockerNotice`） |
| --- | --- |
| `missing`（必須の項目が空）、`incomplete`（入力の途中） | 「あと N 項目を入力すると保存できます」 |
| `invalid`（エラーを表示している） | 「N 項目に修正が必要です」 |
| `missing` か `incomplete` と、`invalid` の両方 | 「未入力の項目が N つ、修正が必要な項目が N つあります」 |
| `check-failed`（非同期の検証ができなかった） | 「顧客コードを確かめられませんでした。確かめ直すと保存できます」 |
| `checking`（非同期の検証の結果を待っている） | 「顧客コードを確認しています」 |
| 項目以外の理由（`reason`）：保存の結果が不明 | 「保存されたかを確かめると保存できます」 |
| 項目以外の理由（`reason`）：保存中、IME の変換中 | 画面には示さず、支援技術にだけ「保存しています」「文字を変換しています。確定すると、入力した値を確かめます」 |

- 文は上の表の順に 1 つだけ示す（未入力と修正が必要な項目を、確認できなかった項目と確認中の項目より先に示す）。「保存できます」の部分は `goal` で変える（ステップでは「次へ進めます」）。
- 長いフォームでは、`detail` で該当する項目へ移動するボタンを置く。理由が 3 項目以下（`detailLimit`）なら項目ごとに並べ（「会社名（未入力）」「顧客コード（確認できなかった）」）、超える場合は「最初の項目（会社名）へ移動」だけを置く。修正が必要な項目、確認できなかった項目、未入力と入力の途中の項目の順に並べる。
- エラーを色だけで示さない（FieldError のアイコンと文字）。
- 送信の処理でも条件を確かめる（`handleSubmit`）。ボタンの `disabled` だけに頼らない。Enter キー、`requestSubmit`、プログラムからの送信でも、保存できない状態では保存の処理を呼ばない。
- サーバー側でしかわからない重複、同時の編集、権限の変更などのエラーは、保存の後に項目かフォーム全体のエラーとして示す（`FormSaveResult` の `invalid`）。

#### 変更のない編集のフォーム（`requireChanges`）

- 編集のフォームでは `requireChanges: true` を指定する。変更がない間（`unchanged` が true）は、保存ボタン、Enter、`requestSubmit`、`handleSubmit` のどれでも保存しない。エラーも表示しない。
- 押せない理由を画面に足さない。変更していないフォームの保存ボタンが押せないことは見ればわかるため（原則 04）。`SaveBlockerNotice` の `unchanged` で、支援技術にだけ「変更がありません。変更すると保存できます」を伝える（保存ボタンの `aria-describedby` の参照先）。
- 値を元に戻すと、再び `unchanged` になる（比較は下の「値の比較と不変のデータ」）。

### Focusable Disabled

保存ボタンには `focusableWhenDisabled` を付ける。v0.1 で正式に採用した。通常の Disabled の Button の仕様（[button.md](../components/button.md)）は変えない。

| 状態 | フォーカス | 実行 | 指定 |
| --- | --- | --- | --- |
| 通常 | できる | できる | |
| Disabled | できない | できない | `disabled` |
| Focusable Disabled | できる | できない | `disabled` と `focusableWhenDisabled`。`aria-disabled="true"` が付く |
| Loading | 保つ | 二重に実行できない | `loading` |

- 使う場面：操作できない理由を、キーボードと支援技術の利用者に伝える必要がある場合（保存ボタン、ステップの「次へ」と確定のボタン、「登録して次へ」）。
- 必ず設定するもの：`aria-disabled="true"`（Button が付ける）、`aria-describedby`（理由の文。`SaveBlockerNotice` の id）、フォーカスの表示（Button の `focus-visible:focus-ring`。Disabled と同じ透明度 50% の見た目のまま、フォーカスの枠を表示する）。
- 無効な操作が実行されないことを保証する。クリック、Enter、Space は、Base UI がボタンへのクリックを止める。フォームの送信は、送信の処理（`handleSubmit`）も条件を確かめる。検品：`forms-workflows-checks.spec.ts` の「the focusable disabled save button cannot be activated by click, Enter or Space」。
- 保存ボタンが Focusable Disabled の間は、1 行の入力欄での Enter（ブラウザの暗黙の送信）が submit にならない。Base UI が、無効のボタンへのクリックを止めるためである。form の `onKeyDown` に `submitOnEnter` を指定する（下の「Enter による送信」）。
- 理由を示せない場合に、Focusable Disabled で済ませない。理由の文がない Focusable Disabled のボタンは、フォーカスしても押せない理由がわからない。
- 保存の結果が不明（`unknown`）、保存中、IME の変換中で押せない場合も、`aria-describedby` の参照先を空にしない。`SaveBlockerNotice` の `reason` を渡す（[form-layout.md](form-layout.md#保存できない理由)）。検品：`forms-workflows.spec.ts` の「edit with an unknown result: the focusable disabled save button is described by the reason and does not save」（クリック、Enter、Space、1 行の入力欄の Enter、`requestSubmit` で保存の要求を送らない）。

### Enter による送信

1 行の入力欄での Enter で送信する方式は、採用してよい。ただし、フォームの中のすべての Enter を送信にしない。`submitOnEnter(event, submit)` は、次の Enter を送信にしない。

| 送信にしない Enter | 理由 |
| --- | --- |
| IME の変換の確定（`isComposing`、`keyCode` 229） | 変換を確定する操作であり、送信ではない |
| 修飾キー付き（Shift、Alt、Ctrl、⌘）、押し続けによる連続の入力（`repeat`）、ほかの処理が止めた Enter（`defaultPrevented`） | 意図しない送信、二重の送信を防ぐ |
| Textarea、`contenteditable` | Enter は改行の入力である |
| ボタン、Checkbox、Radio、File、日付と時刻の入力欄 | それぞれの部品の操作である（ボタンの Enter はボタンの実行） |
| Date Picker と Date Range Picker の文字の入力欄（`data-slot="date-picker"`、`data-slot="date-range-picker"` の中の入力欄） | 入力した日付の確定である（部品が Enter で確定する）。確定した日付を確かめてから保存する |
| `role` が `combobox`、`listbox`、`menu`、`grid`、`tree` の要素、`aria-haspopup` の要素、`aria-expanded="true"` の要素と、それらの中の要素（Combobox、Multi Select、Select、Date Picker、Calendar、Dropdown Menu） | 選択肢の選択、ポップアップの開閉である |
| フォームの外の要素、フォームとは別の Dialog の中の要素（フォームの外に描画される Popover、入れ子の Dialog） | フォームとは独立した操作である |
| 読み取り専用と無効の入力欄 | 入力できない欄からの送信を防ぐ |
| `data-submit-on-enter="false"` を付けた要素とその中の要素 | 製品が個別に除く（検索の候補を Enter で選ぶ入力欄など） |

送信にする Enter（1 行の文字の入力欄：`text`、`email`、`tel`、`url`、`search`、`number`、`password`）は、`submit`（`handleSubmit` の戻り値）を呼ぶ。保存の条件は `handleSubmit` が確かめる。

- 保存ボタンが押せる間は、ブラウザが 1 行の入力欄、日付と時刻、Checkbox、Radio などの Enter でフォームを送信する（暗黙の送信）。`submitOnEnter` は、送信にしない Enter のうち、この暗黙の送信の対象になる入力欄（ポップアップの部品の中の要素を除く）の Enter で `preventDefault()` を呼び、送信を止める。変換の確定の Enter と、ほかの処理が止めた Enter には触れない（ブラウザは送信しない）。
- 例（`forms-workflows-checks.spec.ts`）：保存できる状態のフォームで、Textarea、日付、`data-submit-on-enter="false"` の入力欄、Enter を止めた入力欄の Enter は保存しない。Components の `DatePicker` の文字の入力欄の Enter は、日付を確定し、保存しない（「Enter in the DatePicker text input commits the date and does not submit」）。
- Date Picker の資料（[date-picker.md](../components/date-picker.md)）の「Enter では確定してから、通常の入力欄と同じくフォームの送信を続ける」は、`submitOnEnter` を使わないフォーム（ブラウザの暗黙の送信だけのフォーム）での部品の動作である。`submitOnEnter` を指定したフォームでは、上の表のとおり送信しない。変更の記録：v0.1 の途中まで、`submitOnEnter` は Date Picker の文字の入力欄を 1 行の入力欄として扱い、送信していた（この資料の表と異なっていた）。部品（`date-picker.tsx`）は変えず、`submitOnEnter` の除外の条件に加えた。代替案（部品の Enter で `preventDefault` する）は、`submitOnEnter` を使わないフォームの既存の動作を変えるため採らない。

| 状態 | Enter と `requestSubmit` の結果 |
| --- | --- |
| 入力が完了し、検証が成功している | 保存する（1 回だけ） |
| 未入力、不正な値、検証できなかった項目がある | 保存しない。すべての項目のエラーを表示し、`onBlocked` に理由を渡す（例のフォームは最初の問題の項目へフォーカスを移す） |
| IME の変換中、保存中、保存の結果が不明、非同期の検証の結果を待っている項目だけが理由、変更のない編集のフォーム（`requireChanges`） | 何もしない（保存せず、エラーも表示しない） |

- 明示的な送信（1 行の入力欄の Enter、`requestSubmit`）では、エラーの表示を許容する。ほかの Components での Enter（上の表）では、不要なエラーを表示しない。
- 検品：`forms-workflows-checks.spec.ts` の「Enter submission」（1 行の入力欄、Textarea、Select、Combobox、日付、送信しない入力欄、止めた Enter、Combobox のポップアップと別の Dialog、押し続け、IME、変更のない編集、Focusable Disabled のクリック、Enter、Space）。`#/forms-checks?case=submit`。

### 検証のタイミング

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/form-validation-states-dark.svg">
  <img alt="入力欄の検証の状態と保存ボタンの状態の図。入力欄は、未操作、入力中、入力を終えた時点の検証、エラーの表示、修正のたびの再検証、正しい値の順に移る。非同期の確認中は、結果が正しいか不正かになるか、確かめられなかった場合（通信の失敗、期限切れ、例外）は保存できず、もう一度確かめる。依存する項目が変わったら確かめ直す。必須の未入力、エラー、確認中、確かめられなかった項目、変換中、保存中、保存の結果が不明、変更のない編集のどれかがあれば保存ボタンは無効で、すべての検証が成功すれば有効になる。保存時は送信の処理でも条件を確かめ、サーバー側でも検証する。" src="../../diagrams/form-validation-states-light.svg">
</picture>

図の「非同期の確認中」は、非同期の検証の状態のうち `pending` と `validating` にあたる。v0.1 では、検証の結果が不正（`invalid`）と、検証自体ができなかった（`error`、`unverified`）を分ける（下の「非同期の検証」）。保存ボタンを無効にする条件には、図の「必須の未入力・エラー・確認中・変換中」のほか、非同期の検証ができなかった項目（`error`）、保存中、保存の結果が不明、変更のない編集のフォーム（`requireChanges`）が含まれる（上の「保存ボタンの有効と無効」）。

| 状態 | 動作 | 実装（`useFormState`） |
| --- | --- | --- |
| 未操作 | エラーを表示しない | `error(name)` は null。保存できない理由は `missing` として数える |
| 最初の入力中 | 入力の途中の不完全な値（「yamada@」など）をエラーとして示さない | 検証の結果は `canSubmit` に反映するが、表示しない（理由の種類は `incomplete`） |
| 入力を終えた・Blur | すぐに検証して示す | `blur(name)` で、値を変えた項目だけ表示の対象にする。選択式の項目は `setValue` の `commit: true` |
| エラーの表示の後 | 修正に応じて再検証する | 描画のたびに現在の値から計算するため、入力のたびにエラーが変わり、正しくなると消える |
| IME の変換中 | 検証を止める | 変換中の項目は `error` が null。非同期の検証を始めない。`canSubmit` は false。`compositionend` の確定した値を検証する |
| 必要な非同期の検証中 | 保存ボタンを無効にする | 同期の検証が成功した値だけを、入力が止まってから（`asyncDebounceMs`、既定 400ms）確かめる。結果を待つ間は理由の種類が `checking` |
| 非同期の検証ができなかった | 保存ボタンを無効にし、確かめ直す手段を示す（`asyncFailure: "block"`、既定） | 理由の種類が `check-failed`。`revalidate(name)` で確かめ直す |
| すべての項目の検証が成功 | 保存ボタンを有効にする | `canSubmit` が true |
| 保存時 | 最後の検証とサーバー側の検証を行う | `handleSubmit` は描画の前の値ではなく最新の状態で確かめる。サーバーの `invalid` の結果を項目に示す |

- 空の任意の項目は検証しない。空とみなす値は、既定で null、undefined、空白だけの文字列、空の配列、false（`isEmpty` で変える）。

### 非同期の検証

重複の確認など、サーバーに問い合わせる検証は `validateAsync(value, values, { signal })` に書く。同期の検証が成功した、空でない、表示している項目の値だけを、入力が止まってから確かめる。重複なら文を返し、問題がなければ null を返す。

| `asyncStatus(name)` | 意味 | 保存 |
| --- | --- | --- |
| `idle` | 検証の対象ではない（`validateAsync` がない、表示していない、空、同期の検証が成功していない） | 非同期の検証では止めない |
| `pending` | 入力が止まるのを待っている | 止める（`checking`） |
| `validating` | 確かめている | 止める（`checking`） |
| `valid` | 検証の結果が正しい | 止めない |
| `invalid` | 検証の結果が不正（重複など）。`validateAsync` が返した文をエラーとして示す | 止める（エラーを表示した項目は `invalid`） |
| `error` | 検証自体ができなかった（通信の失敗、期限切れ、同期の例外を含む例外、文字列か null ではない戻り値）。`asyncFailure` が `"block"`（既定） | 止める（`check-failed`）。`revalidate(name)` で確かめ直す |
| `unverified` | 検証自体ができなかったが、`asyncFailure` が `"allow"` | 止めない |

- 検証のキーは、対象の項目の値（`normalize` の後）、`asyncDeps` の値、`scopeKey`、確かめ直しの回数（`revalidate`）から作る。結果はキーと組で持ち、キーが変わったら以前の結果を使わない。
- `asyncDeps(values)` には、検証が依存するほかの項目の値を返す（組織と顧客コード、国と郵便番号、プランと利用人数など）。依存する値が変わると、対象の項目の値が同じでも以前の結果を使わず、検証し直す。例：契約の登録の利用人数は、プランに依存する（ライトは 10 人、スタンダードは 100 人まで。[multi-step-workflow.md](multi-step-workflow.md)）。
- 値やキーが変わったら、前のキーの確認を中止する（`AbortSignal`）。古いキーの応答、`reset` の後、スコープの変更の後、アンマウントの後の応答は使わない。`AbortSignal` を無視して遅れて応答する validator の結果も、キーと世代で照合して捨てる（A → B → A と値を戻した場合も、最初の A の応答で現在の A を決めない）。
- 期限は `asyncTimeoutMs`（既定 10000ms）。期限を過ぎたら検証できなかった（`error` か `unverified`）とし、その後に届いた応答は使わない。例の顧客コードは 5000ms。
- 文は `asyncMessage(name)` で読む。`asyncFailure` が `"block"`（`error`）の場合、期限切れは「{label}の確認が時間内に終わりませんでした。もう一度確かめてください」、それ以外は「{label}を確かめられませんでした。通信の状態を確認して、もう一度確かめてください」。`"allow"`（`unverified`）の場合は確かめ直しを求めず、期限切れは「{label}の確認が時間内に終わりませんでした。保存するときに確かめます」、それ以外は「{label}をいまは確かめられませんでした。保存するときに確かめます」。v0.1 の途中では、`unverified` でも「もう一度確かめてください」と示していた（保存できるのに、確かめ直しが必要と誤解させた）。
- 例：顧客コードを確かめられなかった場合は、保存ボタンの近くに「顧客コードを確かめられませんでした。確かめ直すと保存できます」、項目に理由と「もう一度確かめる」（`revalidate("code")`）を示す（`#/forms-app?page=customer-new`、「非同期の検証（顧客コードの重複）」の「通信の失敗」「応答しない」）。重複の確認はワークスペースごとに行う（九州支店には `C-0001` がない）。

`asyncFailure` の選び方：

| 値 | 動作 | 選ぶ場合 |
| --- | --- | --- |
| `"block"`（既定） | 検証できなかった場合は保存できない（`error`） | 標準。権限、前提の条件、重複など、保存してよいかを決める確認 |
| `"allow"` | 検証できなかった場合も保存を止めない（`unverified`）。製品が「保存するときに確かめます」などを示す | 保存の処理の中で、サーバーが必ず同じ検証を行い、検証に失敗した保存を拒否する場合だけ |

- 権限や前提の条件の確認に `"allow"` を使わない。確認の API の障害の間に、確かめていない保存を通すことになる。
- `"allow"` の利用条件：保存の処理（API）が、入力中の確認と同じ確認を必ず行い、確認に失敗した保存を拒否して、項目のエラー（`FormSaveResult` の `invalid` の `fieldErrors`）として返すこと。製品は、入力中の確認ができなかったことを項目の近くに示す（`asyncMessage`）。
- 例：`#/create-edit` の「入力中の確認ができなかった場合（asyncFailure）」（担当者の招待。招待済みかの確認ができなくても招待でき、招待の時にサーバーが招待済みのアドレスを拒否する）。検品：「a failed check does not block inviting; the server rejects a duplicate on save; the message does not ask to check again」。
- 初期実装（`be6972b`）では、通信の失敗を `unverified` として保存を許していた。v0.1 では既定を `"block"` にした。

### 保存中

- 既存の Button の Loading の仕様を使う（`loading`）。ボタンの寸法を保ち、`aria-busy` を付ける。
- 二重の実行を防ぐ。`handleSubmit` は保存中の呼び出しを無視する（同じ描画の中の 2 回目の送信も止める）。
- 送信した時点の値を確定し、保存の処理に渡す（`submittedValues`）。保存中も入力は変えられる。保存中に変えた項目は、保存の後も未保存として残す（「保存中に変えた内容は、まだ保存していません」）。
- 通常の短い保存で、ページ全体を読み込み中の表示にしない。
- 実際の保存が成功するまで、保存済みと示さない。

### 保存の結果

| 結果（`FormSaveResult`） | 意味 | 表示 |
| --- | --- | --- |
| `{ status: "success", values? }` | 保存した。`values` はサーバーが保存した値（正規化した値など） | 下の「保存の成功の後」 |
| `{ status: "invalid", fieldErrors, formError }` | サーバー側の検証で保存できなかった（重複、権限の変更、同時の編集） | 項目のエラーを該当する項目にすぐ表示する。その項目の値を変えるまで、保存を止める。全体の文は `formError` |
| `{ status: "failed", formError }` | 保存されていないことが確かな失敗（サーバーが処理を拒否した、送信の前に失敗した） | フォームの上の Alert（destructive）。入力は残す。もう一度保存できる |
| `{ status: "unknown", formError }` | 保存されたかわからない（時間切れ、応答の前の切断、予期しない例外） | Alert（warning）。`canSubmit` が false になり、`handleSubmit` も保存の処理を呼ばない（Enter、`requestSubmit`、「保存して移動」を含む）。状態を確かめる操作（「登録されているか確認」）を置く |

保存の処理（`save`）が例外を投げた場合：

| 例外 | 扱い |
| --- | --- |
| `FormSaveError(message, "failed")` | 確定した失敗（`failed`）。`message` を `formError` にする |
| `FormSaveError(message, "unknown")` | 結果が不明（`unknown`）。`message` を `formError` にする |
| それ以外の例外（通信の例外、`TypeError` など予期しない例外） | 結果が不明（`unknown`）。サーバーで処理が終わっている可能性があるため。`formError` は「保存されたかを確かめられていません。状態を確かめてから、必要な場合だけもう一度保存してください。」 |

- 初期実装では、保存の処理の例外を `failed` として扱っていた。v0.1 では、`FormSaveError` の `failed` だけを確定した失敗とする。
- 原因と次の操作を書く（例：「サーバーが保存を受け付けませんでした。入力した内容は残っています。時間をおいて、もう一度保存してください。」）。

#### 結果が不明の解除

- 製品は、保存されたかを確かめ（例：登録は同じ顧客コードの顧客を探し、編集は送信したすべての項目を、サーバーが保存する形（前後の空白、メールアドレスの小文字）にそろえてサーバーの値と比べる）、`resolveUnknown` を呼ぶ。一部の項目だけを比べると、保存されていない項目を保存済みと判断するおそれがある。
  - `resolveUnknown({ saved: true, values? })`：保存されていた。送信した項目（送信した時点で表示していた項目）だけを、`values`（省略すると `submittedValues`）の値で基準値にし、`status` を `succeeded` にする。送信していない非表示の項目は、以前の基準値のまま残る。送信の後に変えた値は未保存のまま残る。
  - `resolveUnknown({ saved: false })`：保存されていなかった。`status` を `idle` にし、もう一度保存できる状態に戻す。
- 状態を確かめるときは、現在の値ではなく送信した値（`submittedValues`）で照合する。
- `clearFormError()`（利用者が文を閉じたとき）は、結果が不明の間は文だけを消し、状態は `unknown` のまま保存できない。文を消すだけで再び保存できるようにすると、意図しない再送信になるため。
- `markSaved(values)` は基準値を変えるだけで、結果が不明の状態は解かない。
- 結果が不明の間は、移動の確認の対象に残す（例：`useUnsavedChanges({ dirty: form.isDirty || form.status === "unknown", … })`）。
- 確かめた結果で画面を移動する場合は、`resolveUnknown` の結果が描画され、`useUnsavedChanges` の登録が更新された後に移動する（例：`useUnsavedChanges` の後に置いた `useEffect` で移動する）。同じ処理の中で移動すると、未保存の変更が残っているとして移動の確認が開く。

### 保存の成功の後

- 基準値を、保存した値にする。送信した（表示していた）項目は、サーバーが保存した値（`values` を返した場合）か送信した値にする。送信していない（`active` が false の、表示していない）項目は、以前の基準値のまま残す。実際には保存していない値を、保存済みとして扱わない。値は消さない。
- 保存の後に、表示していなかった項目を再び表示すると、変えていた値は未保存として残る（`isDirty` が true）。
- 保存中に変えていない項目は、サーバーが正規化した値（前後の空白を除く、メールアドレスの小文字など）にそろえる。
- `onSuccess(saved, { changedWhileSaving })`：保存中に送信した項目の値が変わり、未保存の変更が残っている場合は `changedWhileSaving` が true になる。この場合、保存の後の移動を行わない（移動の確認を開くと、「変更を破棄」で入力が消えるため）。
- 次の作業の目的で移動先を決める。

| 操作 | 移動先 | 例 |
| --- | --- | --- |
| 新規の登録 | 作成したデータの詳細 | 顧客の登録 → 顧客の詳細（`replace`。見出しにフォーカス） |
| 一覧からの編集 | 元の一覧、閲覧の状態 | `from=list` は顧客の一覧（検索の条件、ページ、位置、フォーカスを復元する）、`from=detail` は顧客の詳細 |
| 設定の変更 | 現在の画面に留まる | 設定の各フォーム |
| 続けての登録 | 必要な場合だけ「登録して次へ」 | フォームを空にして、最初の項目にフォーカス |

- 一覧に戻る場合は、Data Browsing の一覧の位置の復元（[list-and-detail.md](list-and-detail.md)）を保つ。検証画面の顧客の一覧は、`captureListPosition` と `useListPositionRestore` で、保存、キャンセル、ブラウザの戻るで戻ったときに 1 回だけ復元する（[forms-and-workflows.md](forms-and-workflows.md#data-browsing-との組み合わせ)）。
- 利用者が別の移動を求めている間（「保存して移動」など）は、その移動を優先する（例では `nav.pending()` を確かめてから移動する）。

### スコープと世代

- `scopeKey` には、フォームの値が属する境界（アカウント、ワークスペース、レコード）を渡す。例：顧客の登録と編集は `${ワークスペース}:${顧客の ID か new}`、設定のフォームはワークスペース、連絡先の編集の Sheet は `${ワークスペース}:${顧客の ID}`。
- `scopeKey` が変わる、`reset` を呼ぶ、アンマウントすると、世代を進める。それより前に始めた非同期の検証、保存、自動補完の結果は、新しい状態（値、基準値、エラー、通知）を変えない。`AbortSignal` を無視する処理の結果も、世代で照合して捨てる。
- `scopeKey` が変わったら、状態（値、基準値、操作の履歴、エラーの表示、非同期の検証の結果、サーバーの検証のエラー、フォーム全体のエラー、保存の状態（結果が不明を含む））を、前のスコープから引き継がない。状態はスコープと組で持ち、スコープが変わった描画の `initialValues` から始め直す。

Registry が保証する範囲と、製品が保証する範囲：

| 範囲 | 保証する内容 | 持つ側 |
| --- | --- | --- |
| 前のスコープの値と状態を表示しない | `scopeKey` が変わった最初の描画から、`values`、`baseline`、`isDirty`、`error`、`formError`、`status`、`canSubmit` は、新しいスコープの状態（その描画の `initialValues` から始めた状態）を返す。effect の実行を待たない | Registry（`useFormState`） |
| 前のスコープの値を送信しない | `handleSubmit` は、commit されたスコープの値だけを送る。前のスコープの描画で作った送信の処理（古い画面、Dialog、Toast に残った closure）、`setValue`、`reset`、`resolveUnknown`、`markSaved` は、新しいスコープの状態を変えない。世代は commit の時点（layout effect）で進める | Registry |
| 古い応答を使わない | スコープの変更、`reset`、アンマウントの前に始めた非同期の検証、保存、自動補完の結果は、新しい状態を変えない。保存の結果で移動も通知もしない（`onSuccess` を呼ばない） | Registry |
| 新しいスコープの値 | スコープが変わる描画で、新しいスコープの値を `initialValues` に渡す（`scopeKey` と `initialValues` を同じ描画で変える）。値を取得中の間は、フォームを描画しない（読み込み中の表示にする）。後から取得した値は `reset(values)` で渡す | 製品 |
| 作り直し（推奨） | スコープ（ワークスペース、アカウント、レコード）ごとに、フォームの部品を `key` で作り直す（例：`` <CustomerEditScreen key={`${ws}:${id}`} /> ``）。`useFormState` に限らず、製品の state、Ref、開いている Overlay も前のスコープから引き継がない | 製品 |
| 認可 | 新しいスコープで閲覧と編集の権限があるかを、値を表示する前に確かめる。権限を失ったら、フォームを表示しない（[permission-states.md](permission-states.md)）。保存の API は、実行の時点の権限を確かめる | 製品とバックエンド |

- スコープの変更の後に `initialValues` を変えない描画で、前のスコープの値を `initialValues` に渡したままにすると、新しいスコープのフォームに前のスコープの値が表示される（hook は新しいスコープの値を知らない）。`key` で作り直すか、取得した値を同じ描画で渡す。
- 古い応答を捨てるだけでは安全ではない。前のスコープの値が新しいスコープで一瞬でも表示されたり送信できたりしないことは、上の表の Registry と製品の範囲を合わせて保証する。
- 例：検証画面の顧客の編集は、`` key={`${ws}:${id}`} `` で作り直す。顧客の登録は、ワークスペースが変わると `initialValues`（空の値）から始め直す（検品：「workspace scope: the duplicate check of the same code is repeated in the new workspace」の「前のワークスペースで入力した値を、新しいワークスペースのフォームに引き継がない」）。
- 変更の記録（Patterns Integration Review）：v0.1 の途中までは「値と基準値は変えない。新しいスコープの値は、製品が `reset(values)` で渡す」としていた。理由：製品が `reset` を呼ぶまでの描画で、前のスコープの値が新しいスコープで表示され、送信できたため。影響の範囲：`scopeKey` を変えても同じ値を保ちたい製品（スコープの外の値をフォームに残す）は、新しいスコープの `initialValues` にその値を渡す。代替案（値を空にする）は、製品が値を渡す前の描画で空のフォームが表示されるため採らず、その描画の `initialValues` から始める方式にした。
- 保存の間にスコープが変わった場合、`handleSubmit` は保存の結果で状態を変えず、`onSuccess` を呼ばず、false を返す。古い保存の成功で、画面を移動したり Toast を出したりしない（検品：「an old save does not navigate or notify after the workspace changed」）。
- `AbortSignal` はクライアントの待機の中止であり、サーバーでの処理の取り消しを保証しない。

### 値の比較と不変のデータ

- 未保存の判定、サーバーの検証のエラーと値の組、非同期の検証のキーは、`normalize` の後の値を `stableKey` で比べる。
- `stableKey` が扱う型：文字列、数値（NaN と Infinity も区別する）、真偽値、null、undefined、Date（時刻の値で比べる）、配列（順序を含めて比べる）、プレーンなオブジェクト（キーの順序は問わない。値が undefined のキーは除く）。
- Map、Set、クラスのインスタンス、関数は扱わない（列挙できるプロパティだけを比べるため、正しく比べられない）。必要な場合は `normalize` で上の形に変える（Set は並べた配列にする、など）。順序に意味のない配列も `normalize` で並べる。
- 値は不変のデータとして扱う。変えるときは新しいオブジェクトや配列を `setValue` に渡す。hook は値を複製しない（任意のデータの Deep Copy はしない）。製品が渡した値を後から書き換えると、送信した値と基準値も変わる。

### 完了の知らせ

- 通常は Toast かインラインの表示にする（「株式会社山田商事を登録しました」）。保存のたびに完了の Dialog を出さない。
- 重要な手続き（契約の登録など）では、専用の完了の表示を置いてよい（[multi-step-workflow.md](multi-step-workflow.md)）。

### 既存の資料との関係

- [forms.md](../components/forms.md) の「5. 検証のタイミング」は、送信したときにすべてを検証し、エラーの概要を示す流れを示している。業務の標準のフォームでは、この資料の方針（検証が成功するまで保存ボタンを押せない）を使う。保存できない状態で明示的な送信（1 行の入力欄の Enter、`requestSubmit`）が行われた場合は、`handleSubmit` がすべての項目のエラーを表示し、`onBlocked` に理由を渡す。例のフォームは最初の問題の項目にフォーカスを移し、保存ボタンの近くの `SaveBlockerNotice` を概要として使う（フォームの上の `role="alert"` の概要は置いていない）。forms.md の 5 にも同じ内容を書いている。
- [button.md](../components/button.md) の「無効にする場合は、押せない理由を近くの文字で示す」に従い、理由を保存ボタンの近くに示す。保存ボタンの Focusable Disabled は、button.md の「状態」に、Disabled とは別の状態として書いている（Disabled の仕様は変えていない）。

## アンチパターン

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 保存ボタンを押させてから初めてエラーを示す | 長いフォームでエラーの場所まで戻る必要がある | 検証が成功するまで無効にし、入力を終えた時点で示す |
| 最初の表示から、未操作の項目にエラーを示す | 何もしていないのに失敗を示される | 入力を終えた項目だけに示す |
| 入力中の不完全な値をエラーにする | 入力の途中で注意をそらす | Blur か、エラーの表示の後の再検証 |
| 最後の項目から離れるまで保存ボタンを有効にしない | 正しく入力しても保存できない | 描画のたびに計算する（`canSubmit`） |
| 押せない理由を示さずに無効にする | 何をすればよいかわからない | `SaveBlockerNotice` と `aria-describedby` |
| 理由の文がないボタンを Focusable Disabled にする | フォーカスしても押せない理由がわからない | `aria-describedby` で理由を説明にする |
| ボタンの `disabled` だけで送信を止める | Enter キーやプログラムからの送信で保存される | `handleSubmit` で確かめる |
| フォームの中のすべての Enter を送信にする | Select や Combobox の選択、改行、変換の確定で送信され、不要なエラーが出る | `submitOnEnter`（1 行の入力欄だけ） |
| 古い非同期の検証の応答を使う | 現在の値に別の値の結果が付く | 検証のキー（値、依存する値、スコープ）と世代で照合する |
| 依存する項目が変わっても、以前の非同期の検証の結果を使う | 別の条件の結果で保存される | `asyncDeps` |
| 権限や前提の条件の確認ができなかったときに保存を許す | 確かめていない保存が通る | `asyncFailure: "block"`（既定） |
| 保存の処理の予期しない例外を、保存の失敗として再試行させる | 保存されていた場合に二重に登録される | 結果が不明として扱い、状態を確かめる |
| 文を閉じるだけで、結果が不明の状態を解く | 意図しない再送信になる | 確かめた結果で `resolveUnknown` |
| 表示していない項目の値を保存済みにする | 保存していない値を保存したと扱う | 送信した項目だけ基準値を更新する |
| スコープが変わった後に、古い保存の結果で移動や通知をする | 別のワークスペースやレコードで操作したように見える | `scopeKey` |
| 保存中にページ全体を読み込み中の表示にする | 入力した内容が見えなくなる | Button の `loading` |
| 保存の失敗で入力を消す | 入力をやり直す必要がある | 入力を残し、原因と次の操作を示す |
| 結果が不明な保存を、同じボタンで再実行させる | 二重に登録される | 状態を確かめる操作を置く |
| 保存のたびに完了の Dialog を出す | 毎回閉じる操作が増える | Toast かインラインの表示 |
| 「送信」「OK」のような文言 | 押した結果がわからない | 「登録する」「保存する」「担当者を変更」 |

## 状態管理

`useFormState` は、次の状態を分けて持つ。

| 状態 | 値 | 内容 |
| --- | --- | --- |
| 入力欄の操作の履歴 | `isInteracted(name)` | 利用者が値を変えた項目。フォーカスしただけでは含めない |
| 現在の入力値 | `values` | 製品の型のまま。不変のデータとして扱う |
| 入力の妥当性 | `canSubmit`、`blockers` | 現在の値から描画のたびに計算する。理由の種類は `missing`、`incomplete`、`invalid`、`checking`、`check-failed` |
| エラーの表示 | `error(name)` | 表示の対象の項目だけ。サーバーの検証のエラーはすぐに表示する |
| 未保存の変更 | `isDirty`、`dirtyFields`、`baseline`、`unchanged` | 基準値との比較（`normalize` と `stableKey`）。`unchanged` は `requireChanges` で変更がない |
| 値の変更の回数 | `revision` | 利用者の入力と自動補完の回数。`useUnsavedChanges` の `revision` に渡す |
| 非同期の検証 | `asyncStatus(name)`、`asyncMessage(name)` | `idle`、`pending`、`validating`、`valid`、`invalid`、`error`、`unverified`。検証のキーと組で持つ |
| 保存の処理 | `status`、`submitting`、`submittedValues`、`formError` | `idle`、`submitting`、`succeeded`、`failed`、`unknown`。`submittedValues` は送信中の値と、結果が不明の保存で送信した値 |
| IME の変換 | `composing` | 変換中の項目がある |
| スコープと世代 | 内部（`scopeKey`、世代） | `scopeKey` の変更、`reset`、アンマウントで進める。古い世代の結果は使わない |

操作：

| 関数 | 用途 |
| --- | --- |
| `setValue(name, value, { composing?, commit? })` | 値を変える。`commit` は選択式の項目 |
| `blur(name)`、`compositionStart(name)` | 入力を終えた、変換を始めた（`inputProps` が呼ぶ） |
| `reveal(names)`、`revealAll()` | 指定した項目のエラーを表示する（ステップの項目だけ、保存を試みた） |
| `revalidate(name)` | 非同期の検証をやり直す（検証できなかった、結果が古い可能性がある） |
| `reset(values?)` | 値と基準値を置き換え、操作の履歴、エラー、保存の状態を消す（別のレコード、続けての登録）。世代を進める |
| `discard()` | 値を基準値に戻す（未保存の変更の破棄）。`reset()` と同じ |
| `markSaved(values)` | 別の経路で保存した値を基準値にする（下書き、即時保存との組み合わせ）。保存の状態は変えない |
| `resolveUnknown({ saved: true, values? } \| { saved: false })` | 結果が不明の状態を、製品が確かめた結果で解く |
| `captureEdits(names)`、`applyAutofill(token, patch)` | 自動補完。`captureEdits` は、世代、利用者の編集の回数、自動補完の回数を記録した `AutofillToken` を返す。`applyAutofill` は、その間に利用者が変えた項目、ほかの自動補完が値を入れた項目、`reset` とスコープの変更の後の応答では値を変えない。入れた項目の名前の配列を返す |
| `getSubmitValues()` | 送信する値。表示していない項目を含めない |
| `handleSubmit(save, { onBlocked, onSuccess })` | 送信の処理。保存できた場合だけ true を返す Promise |
| `clearFormError()` | フォーム全体のエラーの文を消す。結果が不明の間も文だけを消し、保存できない状態（`unknown`）は解かない |

関数：`stableKey(value)`（構造の比較のためのキー）、`submitOnEnter(event, submit)`。型：`FormFields`、`FieldConfig`、`FormSaveResult`、`FormBlocker`、`FormBlockerKind`、`AsyncCheckStatus`、`FormStatus`、`AutofillToken`、`FormState`。クラス：`FormSaveError`。

hook が持たないもの：検証の規則の中身、サーバー側の検証、保存の API と冪等性、保存の後の移動、Toast、入力欄の id とフォーカスの移動。

## アクセシビリティ

- 保存ボタンは Focusable Disabled にする（`focusableWhenDisabled`、`aria-disabled="true"`）。無効の間も Tab で移れる。`aria-describedby` で `SaveBlockerNotice` の文を説明にする。理由がないときも要素を残し、参照先を保つ。編集のフォームで変更がない間は、`unchanged` で「変更がありません。変更すると保存できます」を支援技術にだけ伝える。
- エラーは Field の `invalid` で入力欄に `aria-invalid` を付け、FieldError の文を説明にする。FieldError に `role="alert"` を付けない（[forms.md](../components/forms.md) のエラーの読み上げ）。
- フォーム全体のエラーは Alert の `role="alert"`。
- 非同期の検証の状態と自動補完の結果は、項目の FieldDescription の `role="status"` で伝える（「登録済みのコードと重ならないかを確かめています」「このコードは使えます」「顧客コードを確かめられませんでした。通信の状態を確認して、もう一度確かめてください」）。検証できなかった項目には、確かめ直すボタン（「もう一度確かめる」）を置く。
- 保存できない状態での明示的な送信では、最初の問題の項目にフォーカスを移す（`onBlocked` と `focusFormControl`）。
- 新規の登録の後は、作成した詳細の見出しにフォーカスが移る（`AppShellMain` の `pageKey`）。「登録して次へ」の後は、最初の項目にフォーカスを移す。
- 即時保存と自動保存の状態は、FieldDescription の `role="status"` で伝える。結果が不明は、色だけでなく文で伝える（「保存されたかを確かめられていません。表示はサーバーの値と異なる場合があります」）。

## 製品側の責務

- 検証の規則（`validate`、`validateAsync`、`asyncDeps`）と、エラーの文（原因と直し方）。
- `asyncFailure` の選択。`"allow"` を選ぶ場合は、保存の処理の中でサーバーが必ず同じ検証を行うこと。
- サーバー側の検証（重複、同時の編集、権限の変更）と、結果を `FormSaveResult` で返すこと。
- 保存の API、冪等性、時間切れの扱い（応答しない処理を `failed` か `unknown` として返す）。保存されていないことが確かな場合だけ `failed`（または `FormSaveError` の `failed`）にすること。
- 結果が不明な場合の状態の確認の方法（例では、同じ顧客コードの顧客を探す）と、`resolveUnknown` の呼び出し。
- `scopeKey` の決め方（アカウント、ワークスペース、レコード）と、新しいスコープの値を `reset` で渡すこと。
- 値を不変のデータとして渡すこと。Map、Set、クラスのインスタンスを `normalize` で比べられる形にすること。
- 保存の後の移動と Toast。
- 登録と更新の処理、権限、変更できる項目の分離。

## 実装例

```tsx
const fields: FormFields<CustomerValues> = {
  kind: { label: "種類", required: true },
  company: { label: "会社名", required: true, active: (v) => v.kind === "corporate", normalize: (v) => v.trim() },
  code: {
    label: "顧客コード",
    required: true,
    validate: (v) => (/^C-\d{4}$/.test(v) ? null : "顧客コードは「C-」と 4 桁の数字で入力してください（例：C-0123）"),
    // 重複なら文を返す。確かめられなかった場合は保存できない（asyncFailure の既定 "block"）
    validateAsync: (v, _all, { signal }) => api.checkCustomerCode(v, { signal, workspaceId }),
    asyncTimeoutMs: 5000,
  },
  email: { label: "メールアドレス", required: true, normalize: (v) => v.trim().toLowerCase(), validate: emailRule },
  plan: { label: "契約プラン", required: true, requiredMessage: "契約プランを選んでください" },
  // …
}
const form = useFormState<CustomerValues>({
  initialValues: mode === "edit" ? toValues(customer) : emptyCustomer,
  fields,
  scopeKey: `${workspaceId}:${customer?.id ?? "new"}`,
  requireChanges: mode === "edit", // 編集は、変更がなければ保存しない
})
const save = form.handleSubmit(
  async (values) => {
    try {
      return await api.saveCustomer(values) // FormSaveResult を返す
    } catch (e) {
      // 送信の前に失敗したなど、保存されていないことが確かな場合だけ failed。それ以外の例外は、そのまま投げると unknown になる
      if (e instanceof RequestNotSentError) throw new FormSaveError("サーバーに接続できませんでした。入力した内容は残っています。", "failed")
      throw e
    }
  },
  {
    onBlocked: (blockers) => blockers[0] && focusFormControl(`customer-${blockers[0].name}`),
    onSuccess: (saved, { changedWhileSaving }) => {
      toast({ variant: "success", title: `${saved.company}を登録しました` })
      if (!changedWhileSaving) navigate(`/customers/${saved.id}`, { replace: true })
    },
  }
)
const unknown = form.status === "unknown"
const checkSaved = async () => {
  // 送信した値で、保存されたかを確かめる
  const found = await api.findCustomerByCode(form.submittedValues!.code)
  form.resolveUnknown(found ? { saved: true } : { saved: false })
}

<form noValidate onSubmit={(e) => void save(e)} onKeyDown={(e) => submitOnEnter(e, save)}>
  <Field invalid={!!form.error("code") || form.asyncStatus("code") === "error"}>
    <FieldLabel>顧客コード</FieldLabel>
    <Input {...form.inputProps("code")} id="customer-code" className="max-w-48" />
    {form.asyncStatus("code") === "error" && (
      <Button type="button" variant="secondary" size="sm" onClick={() => form.revalidate("code")}>もう一度確かめる</Button>
    )}
    {form.error("code") ? <FieldError>{form.error("code")}</FieldError> : <FieldDescription role="status">{codeStatusText(form.asyncStatus("code"), form.asyncMessage("code"))}</FieldDescription>}
  </Field>
  …
  {form.formError && (
    <Alert variant={unknown ? "warning" : "destructive"} role="alert">
      <AlertDescription>{form.formError}</AlertDescription>
      {unknown && <AlertAction><Button size="sm" variant="secondary" onClick={checkSaved}>登録されているか確認</Button></AlertAction>}
    </Alert>
  )}
  <FormActions sticky notice={<SaveBlockerNotice id="customer-notice" blockers={form.blockers} hidden={form.submitting || form.composing} unchanged={form.unchanged} detail onFocusField={(n) => focusFormControl(`customer-${n}`)} />}>
    <Button type="button" variant="secondary" onClick={cancel} disabled={form.submitting}>キャンセル</Button>
    <Button type="submit" loading={form.submitting} disabled={!form.canSubmit} focusableWhenDisabled aria-describedby="customer-notice">登録する</Button>
  </FormActions>
</form>
```

即時保存：

```tsx
const s = useInstantSave<boolean>({
  value: saved, // サーバーが保存している値
  scopeKey: workspaceId,
  save: (next, { signal }) => api.saveSetting("notify-renewal", next, { signal }), // 確定した失敗は FormSaveError の failed を投げる
  verify: ({ signal }) => api.readSetting("notify-renewal", { signal }), // 結果が不明の後に、サーバーの値を読む
})
<Switch checked={s.value} onCheckedChange={(v) => s.change(v)} disabled={s.pending || s.unknown} />
{s.unknown && <Button size="xs" variant="secondary" onClick={() => void s.check()}>設定を確かめる</Button>}
```

プレビュー：`#/create-edit`、`#/forms-app?page=customer-new`、`#/forms-app?page=settings`（下部の「検証用の操作」で保存、非同期の検証、即時保存、自動保存の結果を切り替える）、`#/forms-checks?case=async`、`case=submit`、`case=scope`（検品用の画面）。
