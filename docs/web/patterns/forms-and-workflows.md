# Forms & Workflows

利用者が情報を入力し、保存し、手続きを終えるまでを扱う Patterns のグループ。Form Layout、Create & Edit、Unsaved Changes、Confirmation、Multi-step Workflow、Import & Export の 6 種類からなる。

状態：v0.1 確定候補（初期実装 `be6972b` のレビューの後に最終調整を行った。設計と実装の方針は `def0934` の後に条件付きで承認され、条件の 2 回連続の全件の検品を満たした。横断の検品は Patterns Integration Review で行う）

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/forms-workflows-dark.svg">
  <img alt="Forms & Workflows の 6 つのパターンの関係の図。下の帯に 1 Form Layout（列、ラベル、間隔、操作ボタン）があり、すべてのパターンに共通する土台と書かれている。その上に 2 Create & Edit（登録・編集・保存、保存ボタンの有効化）と 5 Multi-step Workflow（ステップの移動、条件分岐、最終確認）が並び、どちらも Form Layout と同じ配置の規則を使う。Multi-step Workflow から Create & Edit へ「基にする」の矢印がある。2 つを 3 Unsaved Changes（未保存の変更、移動の確認）の破線の枠が囲む。上段の 4 Confirmation（確認と取り消し）は危険な操作を実行する前に Create & Edit へ適用し、6 Import & Export（取り込み、書き出し）は取り込みの流れに Multi-step Workflow を使う。" src="../../diagrams/forms-workflows-light.svg">
</picture>

## Components と Patterns の関係

Field、Label、Input、Textarea、Select、Checkbox、Switch、Button、Dialog、Alert Dialog、Sheet、Drawer、Alert、Toast、Progress、Table、File Upload は Components（v0.1）である。Forms & Workflows は、これらと App Structure の Page Layout、Page Header、Section Layout を組み合わせる。一覧からの操作（一括の削除、エクスポート、一覧への復帰）では、Data Browsing v0.1 の Registry と組み合わせる（下の「Data Browsing との組み合わせ」）。

既存の機能を再実装しない。入力欄とラベルの関連付け、エラーの表示（Field の `invalid` と `FieldError`）、必須・任意の印（`FieldRequiredMark`、`FieldOptionalMark`）、Button の Loading と `focusableWhenDisabled`、Alert Dialog の初期フォーカス（キャンセル）、Dialog・Sheet・Drawer の未保存の変更の保護（`unsavedChanges` と `onDiscardRequest`）、File Upload の形式とサイズの検査は、そのまま使う。Forms & Workflows の再利用できるコードは、次の 2 つを担う。

- フォーム、ステップ、移動の確認、対応付けの状態を持つ hook。特定のフォームのライブラリ、ルーター、API に依存しない。値は製品の型のまま持つ。
- Components にない、パターンに固有の小さな部品と関数（関係の強い項目の行、操作ボタンの領域、保存できない理由、Stepper、確認の Dialog、取り込みの結果の照合と表示、CSV のセルの値など）。

巨大な汎用のフォームやワークフローの仕組みは作らない。項目、検証の規則、ステップの構成は、製品のコードに書く。

## 6 種類

| Pattern | 目的 | 資料 | 再利用できるコード（`registry/patterns/`） |
| --- | --- | --- | --- |
| Form Layout | 項目の並び、まとまり、間隔、操作ボタンの位置 | [form-layout.md](form-layout.md) | `form-layout.tsx`：`FormRow`、`FormActions`、`SaveBlockerNotice`、`focusFormControl` |
| Create & Edit | 登録と編集、保存ボタンの有効と無効、保存の結果 | [create-and-edit.md](create-and-edit.md) | `form-state.ts`：`useFormState`、`submitOnEnter`、`stableKey`、`FormSaveError`、型 `FormFields`、`FieldConfig`、`FormSaveResult`、`FormBlocker`、`FormBlockerKind`、`AsyncCheckStatus`、`FormStatus`、`AutofillToken`、`FormState`<br>`save-modes.ts`：`useInstantSave`、`useAutosave`、型 `InstantSaveStatus`、`AutosaveStatus` |
| Unsaved Changes | 未保存の変更がある間の、移動と閉じる操作の確認 | [unsaved-changes.md](unsaved-changes.md) | `unsaved-changes.tsx`：`UnsavedChangesProvider`、`useUnsavedChanges`、`useNavigationGuard`、`DiscardChangesAlert` |
| Confirmation | 操作の前の確認と、取り消し（Undo） | [confirmation.md](confirmation.md) | `confirm-action.tsx`：`ConfirmActionDialog`、`useUndoableAction`、型 `UndoHandle` |
| Multi-step Workflow | 複数のステップに分けた作業 | [multi-step-workflow.md](multi-step-workflow.md) | `step-flow.ts`：`useStepFlow`、型 `StepDefinition`、`StepItem`、`StepStatus`、`StepFlowSnapshot`、`StepFlow`<br>`stepper.tsx`：`Stepper` |
| Import & Export | ファイルからの取り込みと、ファイルへの書き出し | [import-and-export.md](import-and-export.md) | `import-mapping.ts`：`createImportColumns`、`normalizeHeader`、`autoMapColumns`、`getMappingIssues`、`sanitizeMapping`、`useColumnMapping`、`importOutcome`、`reconcileImportResult`、型 `ImportColumn`、`ImportField`、`ColumnMapping`、`MappingIssues`、`ImportResult`、`ImportRowResult`、`ImportRowOutcome`、`ImportIntegrity`<br>`import-review.tsx`：`ColumnMappingList`、`ImportValidationSummary`、`ImportIssueTable`、`ImportResultSummary`、型 `ImportIssue`、`ImportRowState`、`ImportFilter`（`importOutcome` と `ImportResult` も公開する）<br>`export.ts`：`defaultExportScope`、`exportScopeLabel`、`exportFileName`、`escapeCsvCell`、型 `ExportScope`、`ExportOrigin` |

### コードと資料の区分

| 区分 | 内容 | 理由 |
| --- | --- | --- |
| 再利用できるコード | 上の表の hook、部品、関数 | 保存の可否とエラーの表示の分離、IME の変換中の扱い、送信にしない Enter の判定、古い応答の破棄（検証のキー、スコープと世代）、検証できなかった場合と結果が不明の場合の区別、遅れて届いた自動補完、正規化した値での未保存の判定、移動の要求の競合、二重の実行、確認の間の対象の変化、ステップの到達の規則、同じ見出しの列の区別、取り込みの結果の照合、CSV のセルの値は、製品ごとに書き直すと誤りやすい。Registry で品質を保つ |
| 組み合わせの例（プレビュー） | 顧客の登録と編集のフォーム（`CustomerForm`）、顧客の一覧（`CustomersScreen`。Data Browsing の Registry との組み合わせ）、契約の登録（`ContractWizard`）、CSV の取り込み（`ImportWizard`）、エクスポートの設定（`ExportDialog`）、検証画面のルーター（`useFormsRouter`）、設定の画面の複数のフォーム、Inline の編集、編集の Sheet、登録の Dialog、検品用の画面（`FormsChecksPage`） | 項目、検証の規則、ステップ、取り込む項目は、製品のデータと業務で変わる。部品の Variant にせず、組み合わせ方を示す |
| 設計の資料だけ | 表示の方法（Dialog、Sheet、別のページ、Inline）の選び方、ラベルを左に置く条件、ステップに分けるかどうか、最終の確認を置く条件、確認の要否、危険な操作の配置、下書きを置く条件、`asyncFailure` の選び方、重複の扱いと部分登録の方式の選び方、CSV と XLSX の選び方、エクスポートを直接ダウンロードする条件、個人情報の列の扱い | 画面と業務ごとの判断であり、コードでは決められない |
| 製品の責務 | 検証の規則とサーバー側の検証、保存・取り込み・取り消しの API、冪等性、結果が不明な場合の状態の確認、ルーターとの接続、下書きの永続化、ファイルの解析と生成、権限、再認証、承認、トランザクションの制御 | 製品の基盤に依存する |

## 使い方の流れ

1. 項目を利用者が考える順に並べ、まとまりを決める（[form-layout.md](form-layout.md)）。幅は `PageLayout width="focused"`。
2. 保存の単位ごとに `useFormState` で状態を持ち、保存ボタンを `canSubmit` で有効にする（[create-and-edit.md](create-and-edit.md)）。保存ボタンは Focusable Disabled にし、form の `onKeyDown` に `submitOnEnter` を渡す。値が属する境界（アカウント、ワークスペース、レコード）を `scopeKey` に渡す。
3. 画面に `UnsavedChangesProvider` を 1 つ置き、保存の単位ごとに `useUnsavedChanges` で登録する。製品のルーターの移動を `confirmNavigation` に通す（[unsaved-changes.md](unsaved-changes.md)、下の「製品への導入の要件」）。
4. 危険な操作には、影響と取り消せるかで確認の方法を選ぶ（[confirmation.md](confirmation.md)）。一括の操作は `progress="external"` にし、進捗と結果を一覧の上に示す。
5. 異なる判断を順に行う場合だけ、ステップに分ける（[multi-step-workflow.md](multi-step-workflow.md)）。
6. ファイルの取り込みは、Multi-step Workflow の流れで作り、結果を `reconcileImportResult` で照合する（[import-and-export.md](import-and-export.md)）。

```tsx
const form = useFormState<CustomerValues>({
  initialValues,
  fields,
  scopeKey: `${workspaceId}:${customerId}`, // スコープが変わったら、古い検証と保存の結果を使わない
  requireChanges: true, // 編集のフォーム：変更がなければ保存しない
})
const save = form.handleSubmit((values) => api.saveCustomer(values), { // 製品の API。FormSaveResult を返す。予期しない例外は結果が不明になる
  onBlocked: (blockers) => blockers[0] && focusFormControl(`customer-${blockers[0].name}`),
  onSuccess: (saved, { changedWhileSaving }) => !changedWhileSaving && router.push(`/customers/${customerId}`),
})
useUnsavedChanges({
  dirty: form.isDirty || form.status === "unknown",
  saving: form.submitting,
  canSave: form.canSubmit,
  revision: form.revision,
  onSave: () => save(),
  onDiscard: form.discard,
})

<form noValidate onSubmit={(e) => void save(e)} onKeyDown={(e) => submitOnEnter(e, save)}>
  …
  <FormActions notice={<SaveBlockerNotice id="customer-notice" blockers={form.blockers} hidden={form.submitting || form.composing} unchanged={form.unchanged} detail onFocusField={(n) => focusFormControl(`customer-${n}`)} />}>
    <Button type="button" variant="secondary" onClick={cancel}>キャンセル</Button>
    <Button type="submit" loading={form.submitting} disabled={!form.canSubmit} focusableWhenDisabled aria-describedby="customer-notice">保存する</Button>
  </FormActions>
</form>
```

## 状態管理の設計

| 状態 | 持つ場所 | 内容 |
| --- | --- | --- |
| 操作の履歴 | `useFormState`（`isInteracted`） | 利用者が値を変えた項目。フォーカスしただけの項目は含めない |
| 現在の値 | `useFormState` の `values` | 製品の型（`V`）のまま持つ。不変のデータとして扱い、hook は複製しない |
| 入力の妥当性 | `useFormState` が描画のたびに計算する | 必須と同期の検証（`validate`）を、現在の値から計算する。Blur を待たない。`canSubmit` と `blockers` の元になる |
| エラーの表示 | `useFormState` の `error(name)` | 入力を終えた（Blur した）項目、選択を確定した項目（`setValue` の `commit: true`）、自動補完で入れた項目、`reveal` と `revealAll` で指定した項目だけに表示する |
| 未保存の変更 | `useFormState` の `isDirty`、`dirtyFields`、`unchanged`、`revision` | 基準値（`baseline`、最後に保存した値）と現在の値を、`normalize` の後の値（`stableKey`）で比べる。表示していない項目（`active` が false）は比べない。`revision` は値の変更の回数 |
| 非同期の検証 | `useFormState` の `asyncStatus(name)`、`asyncMessage(name)` | 検証のキー（値、`asyncDeps` の値、`scopeKey`、確かめ直しの回数）ごとに `idle`、`pending`、`validating`、`valid`、`invalid`、`error`（検証できなかった。保存を止める）、`unverified`（検証できなかったが `asyncFailure: "allow"`。保存を止めない）を持つ。古いキーの応答は使わない |
| サーバー側の検証のエラー | `useFormState`（内部の `server`） | 送信した値と組で持つ。項目の値を変えるまで、その項目のエラーとして保存を止める |
| IME の変換 | `useFormState` の `composing` | 変換中の項目がある間は、検証の表示と非同期の検証を行わず、保存できない |
| 保存の処理 | `useFormState` の `status`、`submitting`、`submittedValues`、`formError` | `idle`、`submitting`、`succeeded`、`failed`、`unknown`。送信した時点の値を `submittedValues` に確定する。結果が不明は `resolveUnknown` だけで解く |
| スコープと世代 | `useFormState`、`useInstantSave`、`useAutosave`、`useUndoableAction`、`ConfirmActionDialog`（内部） | `scopeKey` の変更、`reset`、アンマウント（`ConfirmActionDialog` は開閉）で世代を進める。それより前に始めた処理の結果は、新しい状態と通知を変えない |
| 即時保存 | `useInstantSave` | 表示する値、`idle`、`saving`、`saved`、`failed`、`unknown`、`checking`。確定した失敗は最後に保存できた値に戻す。結果が不明は値を戻さず、`check()` か `value` の変化で解く |
| 自動保存 | `useAutosave` | `saved`、`unsaved`、`saving`、`failed`、`unknown`、最後に保存できた時刻（`savedAt`）。結果が不明は、値が変わっても自動では保存しない |
| 移動の確認の対象 | `UnsavedChangesProvider`（登録の一覧） | 保存の単位ごとの `dirty`、`saving`、`canSave`、`revision`、保存と破棄の処理、確認を省く印（`released`。`revision` と組）。アンマウントで解除する |
| 移動の要求 | `UnsavedChangesProvider` | 最後の 1 件だけ。段階は `waiting`（保存が終わるのを待つ）、`confirm`、`saving`（保存して移動の実行中） |
| ステップの状態 | `useStepFlow` | 現在のステップ、到達したステップ、完了したステップ。入力の値は持たない（`useFormState` が持つ） |
| 対応付け | `useColumnMapping` | ファイルの識別子（`sourceKey`）、列と項目の構成、列の key から項目の id への対応、利用者が選んだ列、使わなかった保存の対応付け（`rejected`）。状態のキーは `key` |
| ファイル、検証の結果、取り込みの結果 | 製品（例では `ImportWizard` の state） | 検証の結果は、対応付けの状態のキー（`mapping.key`）と組で持つ。取り込みの結果は、行ごとの結果と `ImportIntegrity`（`reconcileImportResult` の照合の後） |
| 確認の対象 | `ConfirmActionDialog`（`targetKey`） | 確かめた対象と、現在の対象。変わったら知らせ、確かめ直すまで実行させない |
| 取り消し | `useUndoableAction` | インスタンスごとに分けた通知の id、実行したときのスコープ、期限（`expiresAt`）、取り消しの状態 |
| エクスポートの設定 | 製品（例では `ExportDialog` の state） | 範囲、列、形式。範囲の初期値は `defaultExportScope` で決める |
| 一覧の条件、データ、選択、一括の実行、一覧の位置 | Data Browsing の `useBrowseQuery`、`useBrowseData`、`useBulkSelection`、`useBulkAction`、`captureListPosition`（下の「Data Browsing との組み合わせ」） | Forms & Workflows の部品は持たない |

Registry の部品は、どの状態も保存しない（LocalStorage、セッションのストレージ、データベース、URL に依存しない）。下書きの保存と再開の値の受け渡しは、`initialValues`、`reset`、`markSaved`、`useStepFlow` の `initial`、`snapshot`、`restore` で行う。保存した対応付けは `useColumnMapping` の `initialMapping` に渡す。

## Data Browsing との組み合わせ

検証画面の顧客の一覧（`preview/src/pages/forms-workflows/forms-customers.tsx`）は、Data Browsing v0.1 の Registry で作り、一覧から始める Forms & Workflows の操作（編集、削除の確認、取り消し、エクスポート）を組み合わせる。Data Browsing の Registry と資料は変更していない。

| 部分 | 使う部品 | 担当 |
| --- | --- | --- |
| 検索とページ | `useBrowseQuery`（検索、1 ページ 5 件）、`DataTableSearch`、`DataTablePagination` | Data Browsing |
| データの取得 | `useBrowseData`（`scopeKey` はワークスペース）。取得の宛先は、取得を始めた時点のワークスペース | Data Browsing（取得の処理は製品） |
| 表 | Data Table（`locked={!canOperate}`）、`TableScrollArea` | Data Browsing、Components |
| 変更の操作の可否 | `canOperate`（最新の取得に成功した間だけ true）。再取得に失敗した間は、行の操作、エクスポート、一括の操作を無効にする（`DataTableSelectionBar` の `disabled` と `disabledReason`） | Data Browsing |
| 選択と一括の削除 | `useBulkSelection`、`useBulkAction`、`BulkRunStatus`、`BulkResultAlert`、`isBulkFullySucceeded`。確認は `ConfirmActionDialog` の `progress="external"` | 選択、実行、結果の照合は Data Browsing。確認の内容と対象の変化は Forms & Workflows |
| 単一の削除 | `ConfirmActionDialog`（`progress="inline"`） | Forms & Workflows |
| アーカイブと「元に戻す」 | `useUndoableAction({ scopeKey: ws })` | Forms & Workflows |
| エクスポート | 表の右上の直接のダウンロードと `ExportDialog`、一括操作のバー（`DataTableSelectionBar`）の「エクスポート」。`escapeCsvCell`、`exportFileName`、`exportScopeLabel`、`defaultExportScope` | Forms & Workflows（入口の置き場所は Data Browsing の一括操作のバー） |
| 一覧への復帰 | `captureListPosition`、`useListPositionRestore`。復元する移動では、`AppShellMain` の `scrollOnNavigate` と `focusOnNavigate` を止める | Data Browsing（記録の保存とルーターとの接続は製品） |
| 編集と移動の確認 | `CustomerForm`（`useFormState`）、`useUnsavedChanges`、`useFormsRouter` | Forms & Workflows（ルーターは製品） |

- 一覧から編集・詳細へ移るときに、検索の条件、ページ、表示していたデータ、位置（スクロールの位置、フォーカスしていた行）を記録する。保存、キャンセル、ブラウザの戻るで一覧に戻ったときに、記録を 1 回だけ使って、条件、ページ、位置、フォーカスを復元する。例では記録をページのメモリに置く（製品は履歴の項目ごとに保存する）。検索の条件は URL に入れない。
- 記録を使うのは、編集から一覧に戻る URL（`restore=1`）で戻った場合と、記録した一覧の履歴の項目（`history.state` の印）にブラウザの戻るで戻った場合だけである。Sidebar などから一覧を新しく開いた場合は、前の条件と位置を復元しない。
- 一括の削除の確認は、確認の Dialog（Forms & Workflows）が対象の変化を知らせ、確かめ直すまで実行させない。実行を始めた時点で閉じ、`useBulkAction` が対象を固定して実行し、結果を照合する（Data Browsing の Bulk Actions と同じ）。すべて完了した場合は Toast、それ以外は一覧の上の `BulkResultAlert` に示す。
- 選択のバーのエクスポートは、行を ID で選んでいる間だけ押せる。選択がなくなった後に、検索結果のすべてに暗黙に広げない（[import-and-export.md](import-and-export.md#書き出しの対象)）。
- ワークスペース（スコープ）は、Data Browsing の部品（`useBrowseData`、`useBulkSelection`、`useBulkAction`）と Forms & Workflows の部品（`useFormState`、`useUndoableAction`、`useInstantSave`、`useAutosave`）の両方に、同じ値を `scopeKey` として渡す。

## プレビュー

`npm run preview:dev` で開き、上部の「Patterns：Forms & Workflows」から選ぶ。

| ページ | URL | 内容 |
| --- | --- | --- |
| Form Layout | `#/form-layout` | 請求先の登録（条件付きの入力、送信する値の表示）、列とまとまり、条件付きの入力と自動補完、操作ボタン、比較 |
| Create & Edit | `#/create-edit` | 顧客の登録（重複の確認、郵便番号からの補完、保存の結果の切り替え）、保存ボタンの有効と無効、表示の方法（登録の Dialog）、即時保存と自動保存、比較 |
| Unsaved Changes | `#/unsaved-changes` | 2 つの独立したフォームと例のページの移動、フォームの中の Tabs、Drawer の閉じる操作の確認、判定、確認の動作、下書き、比較 |
| Confirmation | `#/confirmation` | 確認しない操作（名前の変更）、取り消せる操作（Undo）、通常の確認、破壊的な確認、名前の入力による追加の確認、判断の基準、比較 |
| Multi-step Workflow | `#/multi-step` | 契約の登録（分岐、要確認、プランに依存する利用人数の確認、下書きの再開）、Stepper の横型・縦型・簡易・総数が決まっていない場合、移動の規則、比較 |
| Import & Export | `#/import-export` | CSV の取り込み、エクスポートの範囲（操作を始めた場所、件数がわからない場合）、ファイルの形式と安全、比較 |
| 営業管理の検証画面 | `#/forms-app?page=customers` | 6 種類を組み合わせた業務アプリケーション（下の表） |
| 検品用の画面 | `#/forms-checks?case=async`、`case=submit`、`case=scope`、`case=unsaved` | 上部の一覧に表示しない。境界の条件を再現する（下の「検品用の画面」） |

検証画面のページ（`page`、`id`、`from`、`ws` の引数）：

| ページ | URL の引数 | 確かめられること |
| --- | --- | --- |
| 顧客の一覧 | `page=customers` | Data Browsing の Registry による一覧（検索、1 ページ 5 件、Data Table）、行の選択と一括の削除（選択のバー、対象の変化の確認、実行の開始で閉じる）、行のメニュー（編集、アーカイブと「元に戻す」、削除）、表の右上のエクスポート（直接のダウンロード、「項目を選んでエクスポート…」）と一括操作のバーのエクスポート、個人情報の列の確認、一覧への復帰（条件、ページ、位置、フォーカス）、再取得の失敗での操作の制限、「CSV から取り込む」 |
| 顧客の登録 | `page=customer-new` | 保存ボタンの有効と無効、重複の確認（ワークスペースごと。確かめられなかった場合の「もう一度確かめる」）、郵便番号からの補完、条件付きの入力（種類が個人なら会社名を表示しない）、固定した操作ボタン、「登録して次へ」、保存の後の詳細への移動 |
| 顧客の詳細 | `page=customer&id=cu-1` | 連絡先の編集の Sheet（Sheet の破棄の確認）、社内のメモの Inline の編集 |
| 顧客の編集 | `page=customer-edit&id=cu-1&from=list`、`from=detail` | 保存の後の戻り先（一覧、詳細）、変更のない間の保存ボタン、保存中の入力の扱い、サーバー側の検証のエラー |
| アーカイブ済みの顧客 | `page=archived` | 「元に戻す」の期限の後の戻し方 |
| 設定 | `page=settings` | 2 つの独立したフォーム（会社の情報、請求先）、即時保存の Switch（結果が不明の場合の「設定を確かめる」）、自動保存のメモ（結果が不明の場合の「もう一度保存」）、ワークスペースの削除（名前の入力） |
| 契約 | `page=contracts` | 契約の登録への入口（一覧は範囲外） |
| 契約の登録 | `page=contract-new` | 複数のステップ、分岐、プランに依存する利用人数の確認、途中の離脱、下書きからの再開 |
| 顧客の取り込み | `page=import` | CSV の取り込みの全体の流れ、結果の照合 |

- `ws` はワークスペース（`hq` 本社営業部、`kyushu` 九州支店）。省略すると `hq`。顧客、設定の値、下書きは、ワークスペースごとに分かれる（九州支店には顧客コード `C-0001` がない）。
- 上部の Select でワークスペースを切り替える操作は、ページの移動と同じく未保存の変更の確認を通す。別のレコードの画面（顧客の詳細、顧客の編集）からは、切り替えた先の一覧へ移る。
- 「検証用の操作」の「確認なしでワークスペースを切り替える」は、別のタブでの切り替えを再現する（確認を通さずに URL と画面を置き換える）。スコープの境界の検品のためのもので、製品の利用者の操作による移動には使わない。

Sidebar のそのほかの項目は、タイトルだけの画面（App Structure の `PlaceholderScreen`）を表示する。

画面の下部の「検証用の操作（模擬のサーバー）」で、次を切り替える。

- 保存の結果：成功、失敗、サーバー側の検証のエラー、結果が不明、予期しない例外
- 非同期の検証（顧客コードの重複）：成功、通信の失敗、応答しない、中止を無視して遅れて応答
- アーカイブと削除の結果：成功、失敗、結果が不明
- 元に戻すの結果：成功、失敗、結果が不明
- 即時保存の結果、自動保存の結果：成功、失敗、結果が不明
- 一覧の取得：成功、失敗（再取得すると、変更の操作ができなくなる）
- 取り込みの結果：すべて成功、一部失敗（既定）、すべて失敗、途中で通信が切れる、結果に矛盾がある
- 削除の確認の表示中に、選んだ行の 1 件を選択から外す（2 件以上を選んだとき。確認を開いた 1.5 秒後）
- 確認なしでワークスペースを切り替える（別のタブでの切り替えを再現）

遅延の時間（ミリ秒）は `window.__fdFormsServer.latency`（`save` 700、`check` 500、`autofill` 900、`action` 600、`import` 1200、`draft` 300、`list` 200）で変える。

検証画面は Forms & Workflows の検証のためのものであり、正式な Pages の実装ではない。App Structure の検証画面（`structure-app`）と Data Browsing の検証画面（`browsing-app`）は変更せず、同じ Sidebar（`StructureSidebar`、`structureNav`）を使う別の画面として作った。

プレビューの制約：検証画面の外（プレビューの別のページ）へブラウザの戻る操作で移る場合は、プレビューの一覧が先に画面を切り替えるため、確認を出せない。製品では、下の「製品への導入の要件」に従う。

プレビューのページは、Registry の `@/patterns/*` と `@/components/ui/*` を読み込み、複製しない。模擬のサーバー、例のデータ、CSV の簡易な分割（`parseCsv`）は `preview/src/data/forms-workflows/` にあり、Registry には含めない。検証のための遅延と失敗は、模擬のサーバー（`window.__fdFormsServer`）だけで設定する。保存した値はページを開いている間のメモリにだけ残り、実際には保存していない。

### 検品用の画面

`#/forms-checks`（`preview/src/pages/forms-workflows/checks-page.tsx`）は、検品のための画面で、プレビューの上部の一覧に表示しない（`catalog.ts` の `hidden`）。保留中の処理（非同期の検証、保存、即時保存、自動保存、取り消し、確認の実行）を、検品のコードから `window.__fdFormsChecks` の `resolve`、`reject` で解決する。

| `case` | 内容 |
| --- | --- |
| `async` | 非同期の検証（依存する値、A → B → A、中止を無視する検証、非表示、`reset`、同期の例外、期限切れ、スコープ） |
| `submit` | Enter による送信（Input、Textarea、Select、Combobox、日付、ボタン、別の Dialog、止めた Enter、押し続け、変更のない編集、Focusable Disabled） |
| `scope` | 保存、即時保存、自動保存、Undo、確認の Dialog の古い結果とスコープ |
| `unsaved` | 保存して移動（一部の失敗、保存中の入力）、移動の失敗の後の保護 |

## 製品の責務（共通）

- 検証の規則の中身（`fields` の `validate`、`validateAsync`、`asyncDeps`）と、サーバー側の検証（重複、同時の編集、権限の変更）。`asyncFailure: "allow"` を選ぶ場合は、保存の処理で同じ検証を必ず行うこと。
- 保存、取り込み、取り消し、削除の API の実行と、冪等性の保証。結果を `FormSaveResult` などの形で返すこと。保存されていない（実行されていない）ことが確かな場合だけ失敗（`FormSaveError` の `failed`）にすること。保存の処理の時間切れ（いつまでも応答しない処理を `failed` か `unknown` として返す）。
- 結果が不明な場合の状態の確認の方法と、その結果での解除（`resolveUnknown`、`check`、`markSaved`）。
- スコープ（アカウント、ワークスペース、レコード）の決め方と、`scopeKey` の受け渡し。要求の宛先を、描画の時点の値ではなく、処理を始めた時点のスコープから決めること。
- ルーターとの接続（`confirmNavigation` を、リンク、Sidebar、戻る・進むの移動の前に呼ぶ）と、保存の後の移動（下の「製品への導入の要件」）。
- 下書きの永続化（アカウント、ワークスペース、レコードで分けたキー）と、機密の情報を含めない判断。
- ファイルの解析（CSV、Excel）、生成、文字コードの判定、サーバー側でのファイルの内容・形式・サイズの検証。取り込みの行ごとの結果を返すこと。
- 入出力の対象と項目の権限の確認、処理の対象の確定、実行の時点での対象の検証、トランザクションの制御（バックエンド）。
- 個人情報の列の判断と、出力の前の確認。
- 再認証と承認の流れ。
- 入力欄の id の決め方と、`focusFormControl` に渡す id の対応。
- 値を不変のデータとして渡すこと（`useFormState` は複製しない）。

## 製品への導入の要件

プレビューの既知の制約（上の「プレビューの制約」）から、製品のルーターには次を求める。

- アプリの外への移動（再読み込み、タブを閉じる、別のサイトへの移動）は、beforeunload で確認する（`UnsavedChangesProvider` が、未保存の変更か保存中の処理がある間だけ登録する）。ブラウザは、利用者がページを操作していない場合などに確認を出さないことがあるため、確認が常に表示されることは保証しない。
- アプリの中の移動（同じ origin の別のアプリの部分への移動を含む）は、ルーターの blocker などで、移動の前に `confirmNavigation` を通す。画面を切り替える処理を、確認より先に動かさない。
- 戻る・進むでは、履歴の項目に位置（index）を記録し、戻る・進むの量（delta）を求められるようにする。確認の前に元の履歴の項目に戻し、許可されたら delta だけ移動する。
- 移動を許可した後の `popstate` を区別する印は、移動が起きなかった場合に残さない。残すと、次の戻る・進むで確かめずに移動する。例のルーター（`forms-router.ts`）は 1 秒後に印を解く。
- 一覧へ戻る移動で位置を復元する場合は、移動の後のスクロールとフォーカスの処理（`AppShellMain` の `scrollOnNavigate`、`focusOnNavigate`）を止め、一覧の復元に任せる。

## 確定した設計判断

初期実装（`be6972b`）のレビューで、6 種類の基本設計、Registry の責務の分離、既存の Components の再利用は承認された。次の事項は、v0.1 の最終調整で利用者が決めた（初期実装で独自に判断した事項を含む）。

| 事項 | 判断 | 理由 |
| --- | --- | --- |
| Focusable Disabled | 保存ボタンの `focusableWhenDisabled` を正式に採用する。通常（フォーカスできる、実行できる）、Disabled（フォーカスできない、実行できない）、Focusable Disabled（フォーカスできる、実行できない。`aria-disabled="true"`）、Loading（フォーカスを保つ、二重に実行できない）を区別する。Focusable Disabled は、操作できない理由をキーボードや支援技術の利用者に伝える必要がある場合に使い、`aria-disabled`、`aria-describedby`（理由）、フォーカスの表示を設定する。クリック、Enter、Space、フォームの送信で無効な操作が実行されないことを保証する（Base UI がクリックを止め、`handleSubmit` も条件を確かめる）。通常の Disabled の Button の仕様は変えない。[button.md](../components/button.md#focusable-disabled) に状態として追記した | キーボードと支援技術の利用者が、ボタンに移ったときに押せない理由を聞ける。初期実装では button.md の「無効」（フォーカスできない）と異なるため、レビューで確認する事項としていた |
| 変更のない編集のフォーム | 押せない理由を画面に足さない方式を維持する（`SaveBlockerNotice` の `unchanged` で支援技術にだけ伝える） | 変更していないフォームの保存ボタンが押せないことは見ればわかる（原則 04） |
| Enter による送信 | 1 行の入力欄の Enter での送信を許容する。フォームの中のすべての Enter を送信にはしない（`submitOnEnter` の除外の規則。[create-and-edit.md](create-and-edit.md#enter-による送信)）。入力が完了し、検証が成功している場合だけ保存する。未入力・不正な値がある場合は保存せず、エラーを示し、最初の問題の項目へフォーカスを移す。明示的な送信（1 行の入力欄の Enter、`requestSubmit`）ではエラーの表示を許容し、ほかの Components での Enter では不要なエラーを出さない。IME の変換中、保存中、保存の結果が不明、非同期の検証の結果を待っている項目だけが理由の間、変更のない編集のフォームでは何もしない（`requestSubmit` も同じ） | Select、Combobox、Date Picker、Textarea、IME の変換の確定の Enter で送信されると、意図しない保存と不要なエラーが起きる。Focusable Disabled の保存ボタンでは、ブラウザの暗黙の送信が起きない |
| Stepper と見出し | Stepper に `currentLabel`（`"visible"`、既定、`"hidden"`）を追加する。簡易の表示で、ページの見出しが同じステップ名を示す場合は `"hidden"` にし、ステップの番号と総数（総数が決まっていない場合は番号だけ）と「すべての手順」だけを示す。見出しと離して置く場合は `"visible"`。架空の総数を示さない。`aria-current="step"` と、移動の後の見出しへのフォーカスは維持する。例の契約の登録と取り込みは `"hidden"` | 初期実装のレビューで、狭い画面で同じステップ名が 2 回続けて表示されることを指摘された |
| 非同期の検証ができなかった場合 | 既定で保存を止める（`asyncFailure: "block"`、状態 `error`、理由 `check-failed`、`revalidate` で確かめ直す）。`"allow"`（状態 `unverified`）は、保存の処理でサーバーが必ず同じ検証を行う場合だけ選び、権限や前提の条件の確認には使わない | 初期実装は通信の失敗を `unverified` として保存を許していた。確認の API の障害の間に、確かめていない保存が通る |
| 結果が不明の扱い | 保存の処理の例外は、`FormSaveError` の `failed` だけを確定した失敗とし、それ以外は結果が不明として扱う。結果が不明の間は保存できず、`resolveUnknown` で解く（`clearFormError` では解かない）。即時保存は値を戻さず `check()` で、自動保存は自動で保存し直さず `retry()` か `markSaved` で、確認の Dialog は再実行のボタンを置かず、取り消しは「元に戻す」を示さない | 通信の例外は、サーバーで処理が終わっていることがある。無条件の再実行は二重の登録や実行になる |
| スコープと世代 | `scopeKey`（アカウント、ワークスペース、レコード）の変更、`reset`、アンマウントで世代を進め、それより前に始めた非同期の検証、保存、自動補完、取り消しの結果で、新しい状態と通知を変えない。`AbortSignal` を無視する処理の結果も照合する | 別のワークスペースやレコードの結果で、現在の画面の値、通知、移動が変わることを防ぐ。Data Browsing v0.1 のスコープの規則と同じ |
| 一括の操作の確認 | `ConfirmActionDialog` の `progress="external"` で、実行の開始時に閉じ、進捗と結果を一覧の上に示す。短時間で終わる単一のレコードの操作は `"inline"`（Dialog の中で Loading） | Data Browsing v0.1 の一括削除の確認と同じ |

## v0.1 の最終調整

初期実装のレビューと、上の確定した設計判断を受けて、次を変えた。既存の視覚の仕様（寸法、余白、文字、色）は変えていない。

| 対象 | 変更 |
| --- | --- |
| `form-state.ts`（`useFormState`） | `scopeKey`、`requireChanges` を追加した。項目に `asyncDeps`、`asyncFailure`（既定 `"block"`）、`asyncTimeoutMs`（既定 10000）を追加した。非同期の検証のキーを、値（`normalize` の後）、`asyncDeps` の値、`scopeKey`、確かめ直しの回数から作り、古いキーの応答と、`reset`・スコープの変更・アンマウントの後の応答を使わない（世代。`AbortSignal` を無視する validator も照合する）。`AsyncCheckStatus` に `error` を追加し、`unverified` を `asyncFailure: "allow"` の場合だけにした。`revalidate`、`asyncMessage`、`resolveUnknown`、`revision`、`unchanged` を追加した。`FormBlockerKind` に `check-failed` を追加した |
| `form-state.ts`（保存の結果） | `FormSaveError(message, outcome)` を追加した。`FormSaveError` の `failed` だけを確定した失敗とし、それ以外の例外を結果が不明にした（以前は例外を `failed` として扱っていた）。`clearFormError` は結果が不明を解かない。`markSaved` は基準値を変えるだけにした。保存の後の基準値は、送信した項目だけをサーバーが保存した値にし、送信していない（表示していない）項目は以前の基準値のまま残す。`reset`、スコープの変更、アンマウントの後に終わった保存は、状態、基準値、エラー、通知（`onSuccess`）を変えず、false を返す |
| `form-state.ts`（自動補完、比較、Enter） | `captureEdits` が、世代と自動補完の回数も記録する `AutofillToken` を返す。`applyAutofill` は、利用者の編集、ほかの自動補完、`reset` とスコープの変更の後の応答で値を変えない。`stableKey` が扱う型（NaN と Infinity、Date を含む）と、扱わない型（Map、Set、クラスのインスタンス）、不変のデータの前提を定めた。`submitOnEnter` の除外の規則を広げた（押し続け、`defaultPrevented`、`contenteditable`、ボタン、Checkbox、Radio、File、日付と時刻、ポップアップを持つ部品とその中、フォームの外と別の Dialog の中、読み取り専用と無効、`data-submit-on-enter="false"`） |
| `save-modes.ts` | `useInstantSave` に `verify`、`scopeKey`、`check()`、状態 `unknown` と `checking` を追加した。確定した失敗は最後に保存できた値に戻し、結果が不明は値を戻さずに次の変更を受け付けない。`useAutosave` に `scopeKey`、状態 `unknown` を追加した。結果が不明は自動で保存し直さず、`retry()` か `markSaved` で解く。`flush` は結果が不明の間は false。どちらも、スコープの変更とアンマウントの後の結果を使わない |
| `confirm-action.tsx` | `ConfirmActionDialog` に `progress`（`"inline"`、`"external"`）を追加した。`onConfirm` は `{ error }` か `{ unknown }` を返せる。例外は `FormSaveError` の `failed` が失敗、それ以外が結果が不明（再実行のボタンを置かず「閉じる」だけにする）。対象（`targetKey`）が変わったら「変更後の内容を確かめました」を押すまで実行できない。開閉のたびに世代を進め、古い結果で Dialog を変えない。`useUndoableAction` に `scopeKey` を追加し、通知の id をインスタンスごとに分け、取り消しの対象を `perform` の戻り値で固定した。結果が不明の実行に「元に戻す」を示さない（`unknownTitle`）。取り消しの結果が不明なら、もう一度取り消せる状態に戻さない（`undoUnknownTitle`）。`run` の戻り値に `outcome`（`failed`、`unknown`、`stale`）を加えた |
| `unsaved-changes.tsx` | `useUnsavedChanges` に `revision` を追加した。確認を省く印（`released`）を `revision` と組で持ち、新しい変更、`dirty` が false、移動の処理の終わり（次のタスク）で解く。保存して移動は、1 つでも失敗したら残りを保存せずに止める。保存の間の新しい入力があれば、移動せずに確認に戻る。取りやめた要求や古い保存の結果で移動しない。登録の関数と状態を別の Context にした |
| `form-layout.tsx` | `SaveBlockerNotice` に `check-failed` の表示（「{label}を確かめられませんでした。確かめ直すと{goal}」、ほかの理由と同時の場合は「…。{label}を確かめられませんでした」、種類の名前は「確認できなかった」）を追加した。`unchanged`、`goal`、`detailLimit` の仕様を資料に整理した。`FormActions` の `sticky`（640px 以上）は変えていない |
| `stepper.tsx` | `currentLabel` を追加した |
| `import-mapping.ts` | `sanitizeMapping` を追加した。`useColumnMapping` に `initialMapping`、`key`、`rejected` を追加し、列と項目の構成が変わった場合も自動の対応付けからやり直す。`setColumn` は存在しない列と対象外の項目 ID を受け付けない。`reconcileImportResult`、型 `ImportRowResult`、`ImportRowOutcome`、`ImportIntegrity` を追加した。`importOutcome` は件数の形式が正しくない場合も結果が不明にした。`ImportResult` と `importOutcome` を `import-mapping.ts` に移した（`import-review.tsx` からも公開する） |
| `import-review.tsx` | `ImportResultSummary` に `integrity` を追加し、矛盾があれば成功として示さず、件数に含めなかった結果と理由を示す。`ColumnMappingList` の Select の名前に列の位置を含めた（初期実装のレビューで対処済み） |
| `export.ts` | `escapeCsvCell` に `mode`（`"spreadsheet"`、既定、`"raw"`）を追加した。`"spreadsheet"` は、先頭の空白と制御文字の後の数式の文字と、全角の `＝`、`＋`、`－`、`＠` も対象にする。すべての表計算ソフトでの安全を保証しないことを明記した |
| プレビュー：検証画面 | ワークスペース（`ws`。`hq`、`kyushu`）を追加した。上部の Select の切り替えは確認を通し、「確認なしでワークスペースを切り替える」で別のタブでの切り替えを再現する。顧客の一覧を Data Browsing の Registry で作り直した（上の「Data Browsing との組み合わせ」）。エクスポートに、直接のダウンロード、個人情報の列の確認、選択がなくなった場合の表示を追加した。「検証用の操作」に、保存の予期しない例外、非同期の検証、実行・取り消し・即時保存・自動保存の結果が不明、一覧の取得の失敗、取り込みの結果の矛盾を追加した。顧客コードの重複の確認をワークスペースごとにし、確かめられなかった場合は「もう一度確かめる」を示す。契約の登録の利用人数を、プランに依存する非同期の検証（`asyncDeps`）にした |
| プレビュー：資料のページ | 「検証用の操作」に、保存の「予期しない例外」、実行と取り消しの「結果が不明」、取り込みの「結果に矛盾がある」を加えた。Confirmation の例は、失敗と結果が不明を `FormSaveError` で区別する |
| プレビュー：検品用の画面 | `#/forms-checks`（`case=async`、`submit`、`scope`、`unsaved`）を追加した。上部の一覧に表示しない |
| 検品 | `forms-workflows-checks.spec.ts` を追加した。`forms-workflows.spec.ts` の一括の削除、狭い領域の Stepper、プランに依存する利用人数の検品を更新した |
| 資料 | 7 つの資料、[button.md](../components/button.md)、[forms.md](../components/forms.md)、README の状態を更新した |
| 独立したレビューの後 | `submitOnEnter` が除外する Enter で暗黙の送信を止める。`resolveUnknown` は送信した項目だけを基準値にする。`ConfirmActionDialog` は結果が不明を `targetKey` ごとに保持し、`onUnknown` を追加した。`useUndoableAction` は取り消しの失敗の通知に「もう一度元に戻す」（`retryUndoLabel`）を置く。`useUnsavedChanges` は保存して移動の途中の新しい要求で移動先を置き換える。`useAutosave` は中止の信号を送る。`SaveBlockerNotice` の `check-failed` の文を `goal` に合わせた。プレビューの結果が不明の確認、取り込みの例外、一覧の復元の条件、エクスポートの形式、設定の値を直した（下の「v0.1 の独立したレビュー」） |

## 既存の Components、App Structure、Data Browsing への影響

| 対象 | 変更 | 互換性 |
| --- | --- | --- |
| Components（`registry/components/ui/`） | 変更なし | 既存の `unsavedChanges`、`onDiscardRequest`、`loading`、`focusableWhenDisabled`、`initialFocus`、Data Table の `locked`、`DataTableSelectionBar` の `disabled` と `disabledReason` を使う |
| Components の資料 | 初期実装：`docs/web/components/forms.md` の「5. 検証のタイミング」に、保存ボタンの有効と無効は Create & Edit で定めることを示す 1 段落を加えた。v0.1：`button.md` の「状態」に Focusable Disabled の行と説明（「Focusable Disabled」）を追記した。`forms.md` の 5 の段落を、Enter による送信の規則と Focusable Disabled にそろえた | 既存の記述（button.md の「無効」の行を含む）と図は変えていない |
| App Structure（`registry/patterns/` の 6 ファイル、資料、検証画面） | 変更なし | `PageLayout`、`Section`、`SectionStack`、`AppShellMain` の `pageKey`、`scrollOnNavigate`、`focusOnNavigate`、`useAppShell().mainRef` を使う |
| Data Browsing（`registry/patterns/` の 7 ファイル、資料、検証画面） | 変更なし | 検証画面の顧客の一覧で、`useBrowseQuery`、`useBrowseData`、`useBulkSelection`、`useBulkAction`、`BulkRequestError`、`isBulkFullySucceeded`、`BulkRunStatus`、`BulkResultAlert`、`captureListPosition`、`useListPositionRestore`、`TableScrollArea` を使う |
| README | 初期実装：進捗の表、Patterns の表、資料と図の生成の案内に Forms & Workflows を加えた。v0.1：状態を「v0.1 確定候補」にし、方針の承認の後に「方針は承認済み」を加えた | |
| プレビュー | 初期実装：`catalog.ts` に分類「Patterns：Forms & Workflows」と 7 ページ（資料の 6 ページと検証画面）を追加した。`package.json` の `test:patterns` に `forms-workflows` を追加した。v0.1：`catalog.ts` に検品用の画面（`forms-checks`、`hidden`）を追加した | 既存のページの id と URL は変わらない |
| 図の生成 | 初期実装：`scripts/diagrams/build.sh` に `gen_forms_workflows.py` を追加した。v0.1：変更なし | 既存の図の生成は変わらない |
| 既存の検品 | 初期実装：`preview/tests/button.spec.ts` の Tab を押す回数の上限を、ページのフォーカスできる要素の数にした（「初期実装の検証の結果」）。v0.1：`preview/tests/data-browsing.spec.ts`、`preview/src/data/data-browsing/company-server.ts`、`preview/tests/forms.spec.ts`、`preview/playwright.config.ts` を、PR #3（`694c8f6`）の版と同じ内容にした（`5a8f777`）。この 4 ファイルと `button.spec.ts` は、PR #4（共通の検品の修正）の内容とも同じである。下の注を参照 | 判定と期待する値は変えていない |

- Data Browsing の既存の検品の修正の経緯（後続の PR が再利用するための記録）：
  - 事象：`data-browsing.spec.ts` の 2 件（「a run started in A and finished after A → B → A …」「unmounting the list during a run …」）が、負荷が高いと失敗した（v0.1 の全件の検品の 6 回のうち 3 回。8 ワーカーで 24 回の繰り返しでは 5 回）。
  - 原因：Data Browsing の模擬のサーバーは、一括の操作を `latency.bulk / 4` の間隔で 4 分の 1 ずつ処理する。2 件は 1 行だけを選ぶため、処理は 1 回の間隔（400ms、375ms）で終わり、ワークスペースの切り替えやアンマウントより前に結果が届くことがあった。製品のコード（`useBulkAction`）の不具合ではなく、検品が応答の時間を前提にしていたことによる。
  - 最初の対処（`d4a302f`、取り消し済み）：遅延を 6400ms、6000ms に延ばした。この方式は応答の時間に依存したままのため、採用しない。
  - 現在の対処（`5a8f777`）：PR #3（`694c8f6`）の `company-server.ts`（`hold`、`held`、`release()`）と `data-browsing.spec.ts`（14 件を、応答の保留と解放で順序を決める方式にしたもの）を、そのまま取り込んだ。同じ内容は PR #4 にも含まれる。PR #4 を main に統合した後は、PR #1、#2、#3 のどれもこの 2 ファイルを main と同じ内容で持つため、統合の際に競合しない。
  - 後続の PR（#2、#3）での扱い：main（PR #4 の統合の後）の 2 ファイルをそのまま使う。遅延を延ばす変更を加えない。
  - Data Browsing の Registry、資料、検証画面は変えていない。

プレビューのページは、Data Browsing の資料のページの部品（`../data-browsing/doc-parts` の `Mock`、`AppLink`、`DemoFrame`、`Rules`、`DemoControls`、`Radio`）と、App Structure の `StructureSidebar`、`ProductMark`、`PlaceholderScreen`、`structureNav`、`structureLabels`、`structureSettingsItem`、`structureUser`、`../app-structure/parts` の `Bullets` を読み込んで使う（複製も変更もしない）。

## 独自に判断した事項

指示書に定めのない点、または既存の仕様と関わる点を、次のように決めた。レビューで見直す。v0.1 で正式に採用した事項（Focusable Disabled、Enter による送信、Stepper と見出し、非同期の検証ができなかった場合、結果が不明の扱い、スコープと世代）は、上の「確定した設計判断」に移した。

| 事項 | 判断 | 理由 |
| --- | --- | --- |
| 保存中に値を変えた場合の成功の後 | `handleSubmit` の `onSuccess` に `changedWhileSaving` を渡す。例では、保存中に変えた内容が残る場合は移動せず、「保存中に変えた内容は、まだ保存していません」と示す | 保存の後の移動で移動の確認を開くと、「変更を破棄」で利用者の入力が消える |
| 結果が不明の後の照合 | `submittedValues` に、結果が不明になった保存で送信した値を残す。例では、その値で保存されたかを確かめ、`resolveUnknown({ saved: true, values: 送信した値 })` か `resolveUnknown({ saved: false })` を呼ぶ。登録は同じ顧客コード、編集は保存した値がサーバーの値と一致するかで確かめる | 結果が不明の後に入力した値を、保存した値として扱わない |
| 結果が不明の間の移動の確認 | 例のフォームは、保存の結果が不明の間も `useUnsavedChanges` の `dirty` にする（`form.isDirty \|\| form.status === "unknown"`） | 結果が不明のまま移動すると、保存されたかを確かめる手段を失う |
| `clearFormError` と結果が不明 | 結果が不明の間、`clearFormError` は文だけを消し、状態（`unknown`）は解かない | 文を閉じるだけで再び保存できるようにすると、意図しない再送信になる |
| IME の変換中 | 変換中の項目がある間は保存できない。エラーを表示せず、非同期の検証も始めない。`compositionend` で確定した値を検証する | 確定していない文字で検証と保存をしない（[forms.md](../components/forms.md) の検証のタイミング） |
| 非同期の検証の期限 | 既定 10000ms（`asyncTimeoutMs`）。期限を過ぎた後に届いた応答は使わない。例の顧客コードは 5000ms | 応答しない確認の API で、保存ボタンが確認中のまま止まらない |
| サーバー側の検証のエラー | 送信した値と組で持ち、利用者がその項目の値を変えるまで保存を止める。項目の近くに、すぐ表示する | 同じ値で再び保存しても、同じ理由で失敗する |
| 表示していない項目 | `active` が false の項目は、値を消さずに残し、検証、保存の可否、送信する値、未保存の判定から除く。保存の成功の後も、その項目の基準値は変えない | 条件を戻したときに、利用者の入力を失わせない。表示していない項目の検証で、保存を止めない。保存していない値を保存済みとして扱わない |
| 未保存の判定 | `normalize` の後の値を `stableKey`（キーの順序によらない構造の比較）で比べる。値を元に戻すと未保存でなくなる。Map、Set、クラスのインスタンスは扱わず、値は複製しない（不変のデータの契約） | オブジェクトの参照や、前後の空白の違いで未保存にしない。任意の型を深く写すと、型ごとに扱いが異なり誤りやすい（Data Browsing v0.1 の対象と操作の内容の固定と同じ考え方） |
| 保存中の入力 | 送信した時点の値を確定し、保存の成功の後、基準値を送信した値（サーバーの値）にする。保存中に変えた項目は未保存のまま残し、「保存中に変えた内容は、まだ保存していません」と示す | 送信の後の新しい入力を、保存済みと誤って扱わない |
| スコープの変更と値 | `scopeKey` が変わっても、`useFormState` は値と基準値を変えない。新しいスコープの値は製品が `reset` で渡す | hook は新しいスコープの値を知らない。値を消すと、製品が値を渡す前の描画で空のフォームが表示される |
| 移動の要求の競合 | 確認の表示中と保存を待つ間に別の移動の要求が来た場合は、最後の要求だけを残し、前の要求の `onCancel` を呼ぶ。「保存して移動」の実行中に来た要求は、取り消す。「保存して移動」の実行中も「移動をやめる」で移動だけを取りやめられる（保存は続き、結果はフォームに示す） | 利用者が最後に選んだ移動先に従う。保存の途中で移動先を変えない。保存が終わらない場合に、確認を閉じられなくならない |
| 保存中の移動の要求 | 保存が終わるまで待ち、成功して未保存の変更がなければ移動する。失敗したら確認に切り替える。待つ確認の Alert Dialog は 200ms 後に表示する（`WAITING_DIALOG_DELAY_MS`） | 保存の直後の移動など、すぐに終わる場合に Dialog を一瞬だけ表示しない |
| 確認の繰り返しの防止 | 「変更を破棄」と「保存して移動」の対象には、確認を省く印（`released`）を、その時点の `revision` と組で付ける。`revision` の変化、`dirty` が false、移動の処理の終わり（次のタスク）で解く | 移動の処理の間に、同じ変更について再び確認が出ない。移動が失敗した後と、新しい入力は、再び守る |
| 戻る・進むの確認 | 例のルーター（`forms-router.ts`）は、`popstate` の時点で `history.go(-delta)` で元の履歴の項目に戻してから確認を開き、許可されたら `history.go(delta)` で移動する。`delta` は履歴の項目ごとに記録した位置（`history.state.fdFormsIdx`）から求める。許可した移動の印（`bypass`）は 1 秒後に解く。この処理は Registry ではなくプレビューに置いた | 戻る・進むの止め方はルーターごとに異なる。Registry は特定のルーターに依存しない |
| ワークスペースの切り替え | 上部の Select の切り替えは、ページの移動として `confirmNavigation` を通す。別のレコードの画面からは、切り替えた先の一覧へ移る | 切り替えで未保存の入力を失わせない。別のワークスペースには同じレコードがない |
| Overlay の閉じる操作 | Sheet と Dialog を閉じる操作は、各部品の `unsavedChanges` と `DiscardChangesAlert` だけで確かめる。ページの移動のために `useUnsavedChanges` にも登録するが、閉じる操作では Provider の確認を出さない | 既存の Overlay の破棄の確認と、二重に確認しない |
| 固定した操作ボタン | `FormActions` の `sticky` は、画面の幅が 640px 以上のときだけ固定する（`STICKY_QUERY`、`(min-width: 40rem)`）。狭い画面ではフォームの末尾に置く。640px 以上のタッチ操作の端末では、文字の入力欄にフォーカスがある間は固定を解除する | 狭い画面では、理由の文と折り返したボタンが画面の多くを覆う。ソフトウェアキーボードの上に固定の領域を残さない |
| 保存できない理由の一覧 | `SaveBlockerNotice` の `detail` で、理由が 3 項目以下（`detailLimit`）なら項目ごとの移動のボタンを並べ、超える場合は「最初の項目（…）へ移動」だけを置く | 入力を始めたばかりのフォームで、未入力の項目の一覧が長くならない |
| Stepper の切り替え | `layout="auto"` は、置かれた領域の幅が 36rem 以上（`@xl/stepper`）で横型、狭ければ簡易表示にする | 画面の幅ではなく、Stepper を置いた領域の幅で決める |
| 後ろのステップへの直接の移動 | 到達したことがあり、手前のステップがすべて完了している場合だけ移れる。移るときに、通過したステップを完了として記録する | 直接の移動で検証と前提条件を飛ばさない |
| 不要になった現在のステップ | 分岐で表示中のステップが不要になった場合は、同じ位置のステップへ移る。手前に完了していないステップがあれば、そこへ戻る | 移動先がない状態にしない。完了していないステップを飛ばさない |
| 確認の対象の変化 | `ConfirmActionDialog` は、確かめた `targetKey` と現在の値が異なれば警告と「変更後の内容を確かめました」を示し、名前の入力をやり直させ、押すまで実行させない。`onConfirm` には、実行のボタンを押した時点で表示していた `targetKey` を渡す | 古い確認の内容で別の対象を実行しない。警告を見落としたまま実行させない。製品は、渡された対象と実行する対象の一致を確かめられる |
| 取り消しの期限 | `useUndoableAction` は、タイマーで通知を閉じ、取り消しの時点でも `Date.now()` で期限を確かめる | ポインターを重ねて通知が残った場合も、期限の後に取り消しを受け付けない |
| 取り消しとスコープ | スコープが変わったら、前のスコープの通知を閉じ、取り消しを受け付けない。押された場合は「表示しているワークスペースが変わったため、元に戻せません」を示す（既定の文。`staleTitle` で変えられる） | 別のワークスペースに対して取り消しを実行しない |
| 列の識別子 | 列は位置から作る key（`col-0`、`col-1`…）で持ち、見出しの文字では照合しない。複数の列の見出しが同じ項目に一致する場合、または 1 つの列が複数の項目に一致する場合は、曖昧として自動で対応付けない | 同じ見出しの列（電話番号が 2 列など）を取り違えない |
| 保存した対応付け | `initialMapping` は `sanitizeMapping` で照合してから使い、曖昧な列の解決を求めない | 前回の設定のファイルと列の構成が変わっている場合に、存在しない列や対象外の項目に対応付けない |
| CSV Injection の対策 | `escapeCsvCell` の既定（`"spreadsheet"`）は、先頭（空白と制御文字の後を含む）が `=`、`+`、`-`、`@`、全角の `＝`、`＋`、`－`、`＠` の文字列と、タブ、復帰（`\r`）、改行（`\n`）で始まる文字列の先頭に `'` を付ける。数値の型の値（負の数を含む）には付けない。`"raw"` は値を変えない | 数値の列の値を変えない。文字列の型の値は、表計算ソフトが空白を除いて数式として実行しうる。移行の生データは値を変えてはいけない |
| 取り込みの画面のステップ | 画面の Stepper は 5 つ（ファイルの選択、項目の対応付け、データの検証、内容の確認、処理の結果）。取り込みは「内容の確認」のステップのボタンで実行し、実行中の進捗をそのステップに示す。図（import-flow）は処理の段階として 6 つを示す | 取り込みの実行は利用者の判断のステップではない。実行中に別のステップへ移れない |
| 取り込みの一部失敗の模擬 | 「一部失敗」では、行番号が 6 の倍数の行のうち先頭の 3 行を、最初の試行だけ失敗させる。失敗した行だけの再処理は成功する | 失敗した行だけを再処理し、成功した行を再び取り込まないことを確かめる |
| 取り込みの結果の照合 | `reconcileImportResult` で、行ごとの結果を処理の対象の行と照合し、件数を行ごとの結果から数える。件数だけの結果は、形式が正しくない件数、合計の不足（結果が不明）、超過（矛盾）を記録する。`importOutcome` は、件数の形式が正しくない場合と合計が処理の対象と一致しない場合、結果が不明として扱う | 結果が足りない、重なる、対象外の行を含む応答を、成功として示さない（Data Browsing の `reconcileBulkResults` と同じ考え方） |
| 重複の扱いの初期値 | 登録済みの顧客と顧客コードが同じ行は、既定で「登録しない」。更新を選んだ場合も、空欄で登録済みの値を消すのは明示的に選んだ場合だけ | 既存のデータを守る |
| 直接のダウンロード | 表の右上の「エクスポート」に、検索結果のすべてを表示している列だけで出力する直接のダウンロードを置く。個人情報の列（電話番号、住所）は直接のダウンロードに含めず、`ExportDialog` で選んだ場合はダウンロードの前に確かめる | 対象と形式が明確で、個人情報を含まない出力に、確認を挟まない。個人情報を含むファイルの出力は、利用者が意識して行う |
| 選択のバーのエクスポート | 行を ID で選んでいる間だけ押せる（全件の選択の間は無効）。Dialog を開いた後に選択がなくなったら、出力できないことを示し、範囲を広げない | 選んだ行の書き出しが、確かめていない範囲に広がらない |
| 下書きの保存 | 下書きを保存したら、その値を基準値にする（`markSaved`）。下書きは、アカウント、ワークスペース、画面で分けたキー（例：`hanako.sato:hq:contract-new`）で、ページのメモリにだけ置く | 下書きとして残っている入力は、移動で失われない。境界を越えて下書きを共有しない |
| 契約の登録の完了 | 専用の完了の表示（「契約を登録しました」、契約番号）を出し、見出しにフォーカスを移す | 契約は重要な手続きであり、番号と次の操作を示す価値がある |
| 検証画面 | App Structure と Data Browsing の検証画面を拡張せず、別の画面 `forms-app` として作った。顧客の一覧は、v0.1 で Data Browsing の Registry を読み込んで作り直した（Data Browsing のファイルは変更していない） | 並行する作業と、共有するファイルの変更を避けた。初期実装では、一覧を Data Browsing の部品を使わない簡単な Table で作っていた |

## 検品

- 実機（iOS Safari、Android）とスクリーンリーダー（VoiceOver、NVDA）による検品は行っていない。

| 対象 | 検品（`preview/tests/`） |
| --- | --- |
| 資料のページ（6）と検証画面 | `forms-workflows.spec.ts`：h1 が 1 つ、操作の名前、横スクロールなし、320px と 2560px の幅 |
| Form Layout | 1 列と関係の強い項目の行、狭い領域での DOM の順序、ラベルと入力欄の 8px と項目の間の 16px、必須の凡例、条件付きの入力（表示していない項目の値を残し、検証も送信もしない） |
| Create & Edit | 未操作の項目にエラーを出さないことと、保存ボタンの近くの理由、入力中の不完全な値、Blur の後のエラー、修正中の再検証、最後の項目から離れずに有効になること、非同期の検証中の無効と古い応答の無視、IME の変換中（Chromium の CDP で再現）、Enter と `requestSubmit` での不正な送信の防止と最初の項目へのフォーカス、理由のボタンからの移動、二重の保存、保存の失敗の後の入力の保持、サーバー側のエラー、結果が不明の場合、即時保存の失敗での復元、自動保存の 4 つの状態、登録の Dialog の破棄の確認と保存の後の閉じ方、検証画面の登録の後の移動と見出しへのフォーカス、「登録して次へ」、一覧からの編集と保存中の入力、固定した操作ボタンとフォーカスした入力欄、狭い画面での固定の解除とボタンの折り返し、タッチ操作の端末での入力中の固定の解除、編集の Sheet と Inline の編集 |
| Unsaved Changes | フォーカスだけ、変えて戻した場合、Sidebar の移動の確認（初期フォーカス、Escape、破棄の後に再び確認しない）、複数のフォーム（1 つの保存、保存して移動、失敗で留まる）、「保存して移動」を示す条件、ブラウザの戻る・進む（取り消しで URL とページを残す）、連続した移動の要求、保存中の移動、beforeunload の登録と解除、資料のページの 2 つのフォーム、Tabs、Drawer の Escape |
| Confirmation | 安全な初期フォーカス、Enter、Escape、外側のクリック、通常と破壊的な確認、失敗と再試行、名前の入力の条件と入力欄での Enter、Undo の対象の区別と失敗、アーカイブ済みの一覧、Undo の期限、検証画面の一括の削除（Data Table と選択のバー。対象が変わったら確かめ直す、実行の開始で閉じる、要求は 1 回） |
| Multi-step Workflow | 分岐の前の総数、完了までの次へボタンの無効、移動の後の見出しへのフォーカス、狭い領域の Stepper（番号と総数だけ）、戻る操作と値の保持、完了したステップへの直接の移動と未到達のステップ、前のステップの変更による要確認、分岐（更新に支払いがない）、確認からの修正、最終の処理の失敗と 1 回の成功、下書きの再開と現在の選択肢での再検証、プランに依存する利用人数の確認 |
| Import & Export | ファイルの選択だけで取り込まないこと、形式の誤り、自動の対応付けと別名、曖昧な列、重複の対応付け、必須の項目の不足、行番号と区分と絞り込みと表示の範囲、ファイルの変更での無効化、実行の前の件数、一部失敗の件数の合計、失敗した行だけの再処理、すべて正常な場合だけ取り込む方式、結果が不明の場合の状態の確認、エクスポートの初期の範囲、件数がわからない場合、表示中の列、ファイル名とダウンロード |
| 関数 | `escapeCsvCell`、`exportFileName`、`exportScopeLabel`、`defaultExportScope`、`autoMapColumns`、`getMappingIssues` |
| 共通 | ブランドカラーの上書き（Stepper と Primary のボタンに反映し、状態の色には反映しない）、動きを減らす設定での保存、無効の保存ボタンへの Tab での移動と説明 |
| 非同期の検証（v0.1） | `forms-workflows-checks.spec.ts`：依存する値の変更で以前の結果を使わない、A → B → A と中止を無視する検証、検証中に非表示にした項目と `reset` の後の応答、同期の例外（保存を止め、`revalidate` で確かめ直す）、期限切れ（遅れた結果を使わない）、同じ値でのスコープの変更 |
| Enter による送信（v0.1） | 1 行の入力欄（保存できない場合はエラー、保存できる場合は 1 回保存）、Textarea、Select、Combobox、日付、送信しない入力欄、止めた Enter で送信もエラーの表示もしない（保存できない状態と、保存できる状態（暗黙の送信）の両方）、Combobox のポップアップと別の Dialog の中、押し続け、IME（Chromium の CDP）、変更のない編集（Enter と `requestSubmit`）、Focusable Disabled の保存ボタン（クリック、Enter、Space で実行されず、エラーも表示しない）、`asyncFailure: "allow"`（`unverified` で保存を止めない） |
| スコープと古い結果（v0.1） | 保存の後のスコープの変更、別のレコードへの `reset` とアンマウントの後の保存、予期しない例外が結果が不明になり文を閉じても再送信できないこと、結果が不明の解除（`saved: true` で送信した項目だけを基準値にする）、非表示の項目と基準値、保存中の入力（`changedWhileSaving`）、即時保存の結果が不明と確認、サーバーの値の変更での解除、スコープの変更、失敗での復元、自動保存の結果が不明と `retry`、スコープの変更、Undo の通知の id の衝突と対象の固定、スコープの変更の後の Undo、取り消しの失敗の再試行と結果が不明、確認の Dialog の開き直し、確認の Dialog の結果が不明（「閉じる」だけ、同じ対象で開き直しても実行できない） |
| 未保存の変更（v0.1） | 保存して移動の 2 つ目の単位の失敗（残りを保存せず入力を残す）、保存中の入力で確認に戻る、保存して移動の途中の新しい移動の要求（最新の移動先へ移動する）、移動の許可の後に移動が失敗した場合の保護（破棄の処理がない単位を含む） |
| 関数（v0.1） | `escapeCsvCell`（先頭の空白と制御文字、全角の記号、`raw`）、`reconcileImportResult`（形式が正しくない件数、合計の不足と超過、重複、対象外、不足の行）、`sanitizeMapping` |
| Data Browsing との組み合わせ（v0.1） | 2 ページ目からの編集とキャンセルでの復元（ページと行のフォーカス）、Sidebar から一覧を開き直した場合に復元しないこと、検索結果からの詳細とブラウザの戻る（検索の復元）、選択のバーからのエクスポートで選択がなくなった場合、直接のダウンロードと個人情報の確認、`canOperate` が false の場合の行の操作とエクスポートの無効、ワークスペースごとの重複の確認、ワークスペースの変更の後の古い保存（移動も通知もしない）、設定の保存の後のワークスペースの変更（元のワークスペースに戻るとその値から始まる） |
| 結果が不明（v0.1、`forms-workflows.spec.ts`） | 編集で応答が届かずにサーバーが保存していた場合、確認で送信したすべての項目が一致し、移動の確認を開かずに一覧に戻る。取り込みが例外で終わった場合、すべての行が結果が不明になり、状態の確認で登録済みの行を再処理の対象から外す。利用人数を確かめられなかった場合の「もう一度確かめる」 |
| beforeunload（v0.1） | 未保存の変更がある場合にブラウザの確認が表示され、変更がない場合は表示されない（Chromium と WebKit。利用者の入力で変更を作る）。ブラウザが表示しない場合があるため、常に表示されることは保証しない |
| 応答の順序（v0.1） | Forms & Workflows の模擬のサーバー（`preview/src/data/forms-workflows/server.ts`）に、Data Browsing と同じ方式の応答の保留と解放（`hold`、`held`、`release()`。種類は `save` と `check`）を加えた。応答の順序が結果を決める 8 件（非同期の重複の確認と古い応答、自動保存の状態、保存中の入力、保存して移動の取りやめ、保存中の移動、保存中のワークスペースの変更 2 件）は、遅延の時間ではなく、テストの側で解放の順序を決める。保留した要求は `AbortSignal` を無視する（中止を無視して後から応答するサーバーを再現する） |
| SSR と Hydration | `ssr-forms-workflows.spec.ts`：window と document なしの描画、最初の描画でエラーを出さないこと、Hydration の不一致なし、Hydration の後の検証と Stepper と確認の Dialog、hook のファイルの `"use client"`（`export.ts` は付けない） |

`forms-workflows.spec.ts`、`forms-workflows-checks.spec.ts`、`ssr-forms-workflows.spec.ts` は `npm run test:components` に含まれる。Patterns だけを実行する場合は `npm run test:patterns`（ファイル名に `forms-workflows` を含むテスト）。

結果は「検証の結果」に記録する。

### v0.1 の検証の結果

2026-11-26〜27、4 ワーカー、macOS（Darwin 25.6）、Node.js 26.10.0、Playwright 1.65.1（Chromium 159、WebKit 27.2）。統合の候補は、origin/main（`aa7e664`、Data Browsing v0.1 を含む）を含む作業ブランチである（origin/main はこの間に進んでいない）。各回は `typecheck`、`preview:build`、`test:tokens`、`test:ssr`、`test:patterns`、`test:components` をこの順に続けて実行した。

#### 結論

**`d4a302f` で、6 つの確認がすべて成功した全件の実行を 2 回連続では得ていない。** すべて成功した回は run 8 だけである。この後の検品環境の改善と再検品は、下の「検品環境の改善と再検品」に記す。

#### 各回の結果

| 回 | 候補 | typecheck、preview:build、test:tokens | test:ssr | test:patterns | test:components | 失敗の内容と原因 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `40df108` | 成功 | 96 件成功 | 829 件成功、107 件 skip | 2340 件成功、256 件 skip | 失敗なし |
| 2 | `40df108` | 成功 | 96 件成功 | 829 件成功 | 2339 件成功、1 件失敗 | `data-display.spec.ts` の Data Table の日付の並べ替え（WebKit）。WebKit が座標が NaN のクリックを発生させ、Playwright の `expectHitTarget` が例外を出し、Select の選択肢へのクリックが届かず時間切れになった。[overlays.md](../components/overlays.md) に記録のある WebKit の事象（例外は環境の事象として分類された）。このブランチは Data Table を変えていない |
| 3 | `40df108` | 成功 | 96 件成功 | 中止 | 未実行 | 実行中に本体がスリープした（19:09、ふたを閉じた）。スリープの前に 2 件が失敗した（下の run 5、6 と同じ 2 件）。2 時間の上限で中止した |
| 5 | `40df108` | 成功 | 96 件成功 | 828 件成功、1 件失敗 | 2339 件成功、1 件失敗 | `data-browsing.spec.ts` の A → B → A の競合の検品と、`forms-workflows.spec.ts` の Inline の編集の後のフォーカス。下の「全件の実行で見つけた不具合」 |
| 6 | `40df108` | 成功 | 96 件成功 | 829 件成功 | 2339 件成功、1 件失敗 | 同じ A → B → A の検品 |
| 7 | `d4a302f` | 成功 | 95 件成功、1 件失敗 | 829 件成功 | 2340 件成功 | `ssr-core.spec.ts`（Components の SSR、WebKit）で、Dialog を閉じた後に開くボタンへフォーカスが戻らなかった。このブランチは変えていない。単独で 30 回（8 ワーカー）繰り返し、失敗 0 件 |
| 8 | `d4a302f` | 成功 | 96 件成功 | 829 件成功、107 件 skip | 2340 件成功、256 件 skip | 失敗なし。製品の例外とコンソールのエラーは 0 件 |
| 9 | `d4a302f` | 成功 | 96 件成功 | 829 件成功 | 未実行 | 開始の直後に、電池の残量の低下で本体がスリープした（22:20、Low Power Sleep） |
| 10 | `d4a302f` | 成功 | 96 件成功 | 829 件成功 | 1715 件成功、627 件失敗 | 実行の途中で、プレビューのサーバー（Vite、Node.js）が V8 の内部の異常（`abort: Lazy deopt after a fast API call with return value is unsupported`）で停止し、以後のテストが接続できなかった（608 件が `Could not connect to the server`）。同じ時刻に、別の作業ツリーが Playwright の検品を繰り返し実行しており、負荷の平均は 28〜37 だった |
| 11 | `d4a302f` | 成功 | 60 件成功、8 件失敗 | 826 件成功、1 件失敗 | 2336 件成功、2 件失敗 | 同じ高い負荷の中で、SSR の Vite の接続の切断（`transport was disconnected`）、ワーカーの異常終了（`SIGABRT`）、Drawer のスワイプの検品（`overlays.spec.ts`）。このブランチは SSR の基盤と Drawer を変えていない |

- 番号 4 の回は、run 3 と同じ実行の中で始まる前に中止したため、結果がない。
- skip は既存の規則によるもの（`@webkit` のないテストの WebKit、デスクトップだけ・モバイルだけの表示、ハードウェアキーボードの操作、Chromium の CDP による IME の再現、ダウンロードの確認）。既存のテストの削除、不要な skip の追加、許容誤差の拡大はしていない。
- `preview:build` のチャンクの大きさの警告は従来どおり（範囲外）。

#### 全件の実行で見つけた不具合（`d4a302f` で修正）

| 事象 | 原因 | 修正 | 確認 |
| --- | --- | --- | --- |
| 検証画面の詳細の「社内のメモ」を保存した後に、「メモを編集」へフォーカスが戻らないことがある（`Received: inactive`） | 編集を終えた後のフォーカスの移動を `requestAnimationFrame` で行っており、負荷が高いと React がボタンを描画する前に実行されていた | 描画の後の `useEffect` でフォーカスを移す | 8 ワーカーで 16 回（desktop）と 8 回（mobile）繰り返し、失敗 0 件 |
| `data-browsing.spec.ts` の 2 件の競合の検品が、負荷が高いと失敗する | 検品が応答の時間を前提にしていた（「既存の Components、App Structure、Data Browsing への影響」の注） | `d4a302f` で遅延を延ばした。`5a8f777` で、PR #3 の応答の保留と解放の方式に置き換えた | 遅延を延ばした後は 8 ワーカーで 16 回の繰り返しで失敗 0 件。置き換えの後は下の「検品環境の改善と再検品」 |

#### スクリーンショット

`preview/screenshots/v01/`（Git の管理外）。Chromium の 1280×900（資料のページ 6 つ、検証画面 6 画面、操作の途中の状態 12 種類）、390×844（タッチ。同じ画面と、利用人数の確認の失敗、取り込みの結果が不明）、320px（同じ画面と `#/forms-checks?case=submit`）を、独立したレビューの指摘の修正の後に撮り直した。撮影の間のページの例外、コンソールのエラー、横スクロールは 0 件。目視で、利用人数の確認の失敗（項目の理由、「もう一度確かめる」、操作の近くの「利用人数を確かめられませんでした。確かめ直すと次へ進めます」）と、取り込みが例外で終わった場合の表示（結果が不明 37 件、「状態を確認」だけ）を確かめた。WebKit と実機での目視の確認は行っていない。

### 検品環境の改善と再検品（2026-11-27）

v0.1 の設計と実装の方針の条件付きの承認（`def0934`）の後に、System & Account（PR #3）の検品の結果を参考にして、次の条件で検品した。

- Node.js の LTS 版：26.13.1（Active LTS「Lithium」、V8 14.6.202.34）。公式の配布物（`node-v26.13.1-darwin-arm64.tar.gz`、SHA-256 を `SHASUMS256.txt` と照合）を作業用のディレクトリに展開し、`PATH` の先頭に置いて使った。システムの Node.js（26.10.0、Homebrew）は変えていない。26.10.0 は LTS ではない（`process.release.lts` がない。配布の一覧で LTS は 26.13.0 から）。24.22.3（「Krypton」）も取得したが、検品には使っていない。
- Playwright のワーカー：3（`--workers=3`）。
- ポートと出力先：回ごとに `PREVIEW_TEST_PORT`（5351〜5354）と `--output` を分けた。
- Vite の標準出力：`webServer.stdout: "pipe"`（PR #3 と同じ設定）で、各確認のログに残した。依存の再最適化（`new dependencies optimized`）、全体の再読み込み（`page reload`）、`hmr update` は、どの回にも記録されていない。SSR の検品が開発サーバーを作るときの `WebSocket server error: Port 24678 is already in use`（HMR の既定のポートの重複）は記録されたが、SSR の検品は HMR を使わず、どの回も test:ssr は 96 件成功した。
- 電源とスリープ：`caffeinate -dimsu` で、利用者の操作がないことによるスリープを防いだ。電源、ふたの状態（`AppleClamshellState`）、負荷の平均、ほかの作業ツリーの Playwright のワーカーの数を 60 秒ごとに記録した。
- ほかの作業ツリーの検品：停止していない（ほかのセッションのプロセスは終了しない）。4 回目からは、ほかの作業ツリーのワーカーが 3 分続けて 0 になるまで待ってから始めた。
- 検品の間、対象のコードは変えていない（各回の開始と終了で `git status` の変更が 0 件、HEAD が同じであることを記録した）。

対象は `5a8f777`（`origin/main` の `aa7e664` を含む。PR #4 は未統合）。各回は 6 つの確認を続けて実行した。

| 回 | 条件 | typecheck、preview:build、test:tokens | test:ssr | test:patterns | test:components | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 開発の確認（dev1） | 電池。08:13 にふたを閉じて本体がスリープした。ほかの作業ツリーの検品が同時に動いていた | （実行していない） | 一部 | 一部 | （範囲外） | 対象外（環境の異常）。webkit-mobile の 4 件が、クリックが `<html>` に当たって時間切れになった。4 件は単独で 3 回ずつ繰り返して 24 件成功 |
| lts1 | **電池**。10:52〜11:04 に、ほかの作業ツリーの Playwright のワーカー（最大 12）が同時に動いていた | 成功 | 96 件成功 | 829 件成功、107 件 skip | 2340 件成功、256 件 skip | 失敗 0 件。条件を満たしていないため数えない |
| lts2 | AC 電源、ふたは開いている、ほかの作業ツリーのワーカー 0、負荷の平均は最大 7.52 | 成功 | 96 件成功 | 829 件成功、107 件 skip | 2340 件成功、256 件 skip | **成功** |
| lts3 | AC 電源。**14:36:42〜14:50:58 にふたが閉じられた**（`Clamshell Sleep` による DarkWake、画面は消灯）。ふたを開いた後にネットワークが切り替わった | 成功 | 96 件成功 | 770 件成功、59 件失敗 | 2339 件成功、1 件失敗 | 環境の異常のため数えない（下の注） |
| lts4 | AC 電源、ふたは開いている、ほかの作業ツリーのワーカー 0、負荷の平均は最大 8.50 | 成功 | 96 件成功 | 829 件成功、107 件 skip | 2340 件成功、256 件 skip | **成功** |

- lts3 の test:patterns の 59 件（webkit-mobile 56 件、webkit 3 件）は、すべて 14:37:12〜14:50:28 に起き、ふたが閉じていた時間に含まれる。59 件とも 30 秒の時間切れで、`locator.click` などの操作の対象が `<html>` に遮られた（`<html lang="ja">…</html> intercepts pointer events`）。ふたを開いた後のテストは成功した。test:components の 1 件（`advanced.spec.ts` の Multi Select、14:51:42）は、`net::ERR_NETWORK_CHANGED` で資源の読み込みに失敗した。ふたを開いた直後に、OS の通信の経路が切り替わった（終了時の既定の経路は `en0` の `172.20.10.1`）。
- 推測（未確認）：ふたが閉じ、画面が消えた DarkWake の状態では、WebKit の画面の座標と要素の判定が正しく行われない。PR #3 の資料に記録のある、座標が NaN のイベントの事象とは症状が異なる（例外は記録されていない）。
- Node.js の LTS 版での異常：lts1〜lts4 で、Vite のサーバーの V8 の致命的なエラー（`Lazy deopt after a fast API call with return value is unsupported`）、ワーカーの異常終了（`SIGABRT`）、接続の拒否は 0 件だった。ただし、この異常は 26.10.0 で、4 ワーカー以上と高い負荷（負荷の平均 28〜88）の場合に起きていた。今回は 3 ワーカーで負荷が低いため、条件が同じではない。26.13.1 は 26.10.0 と同じ V8（14.6.202.34）を使う。LTS 版で異常が起きないとは確かめられていない（推測：異常が起きなかった主な理由は、ワーカーの数と負荷が少ないことである）。
- 判定：`5a8f777` で条件を満たして成功した回は lts2 と lts4 の 2 回である。間に環境の異常で失敗した lts3 がある。どちらも、最新の `origin/main`（PR #4 の統合の後）を取り込む前の検品であるため、最終の統合候補の検品として扱わない。

### 最終の統合候補での全件の検品（2026-11-27）

PR #4（共通の検品の修正）が main に統合された（`a132344`、2026-11-27 07:31Z）後に、`origin/main` を作業ブランチに取り込んだ（`46da27f`、競合なし）。PR #4 と共通の 8 ファイル（`company-server.ts`、`data-browsing.spec.ts`、`forms.spec.ts`、`button.spec.ts`、`playwright.config.ts`、`data-display.spec.ts`、`overlays.spec.ts`、`ssr-core.spec.ts`）は、取り込みの後に main と同じ内容である（Data Browsing の検品の修正の重複はない）。条件は上の「検品環境の改善と再検品」と同じ（Node.js 26.13.1、3 ワーカー、回ごとのポートと出力先）。各回は、ほかの作業ツリーの Playwright のワーカーが 3 分続けて 0 になってから始めた。

| 回 | 時刻 | 条件 | typecheck、preview:build、test:tokens | test:ssr | test:patterns | test:components | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| final1 | 16:34〜（中断） | 16:41:41 にふたが閉じられ（`Clamshell Sleep`）、16:52 から電池で動き、本体がスリープした | 成功 | 96 件成功 | 828 件成功、1 件失敗 | 1777 件目で止まり、それまでに 11 件失敗。2 時間の上限で停止した | 数えない（下の注） |
| final2 | — | final1 と同じコマンドの中で、final1 の停止により始まらなかった | — | — | — | — | 結果なし |
| final3 | 19:24〜19:48 | AC 電源、ふたは開いている、ほかの作業ツリーのワーカー 0、負荷の平均は最大 8.25 | 成功 | 96 件成功 | 829 件成功、107 件 skip、失敗 0 | 2340 件成功、256 件 skip、失敗 0 | **成功** |
| final4 | 19:51〜20:17 | 同じ。負荷の平均は最大 11.56 | 成功 | 96 件成功 | 829 件成功、107 件 skip、失敗 0 | 2340 件成功、256 件 skip、失敗 0 | **成功** |

- final1 の test:patterns の 1 件（webkit-mobile、`forms-workflows.spec.ts` の「unknown total before the branch; next disabled until complete; heading focus after moving」）は、16:41:09 に記録され、ふたが閉じられた時刻（16:41:41）より前である。契約の種類を選んで「次へ」を押した後、5 秒の間に見出しが「顧客」に変わらなかった（「契約の種類」のまま）。原因は特定できていない。同じテストを、webkit-mobile で 3 ワーカー 60 回、8 ワーカー 160 回、`forms-workflows.spec.ts` の全件（mobile と webkit-mobile）を 8 ワーカーで 5 回（595 件）繰り返したが、再現しなかった。失敗した時点のページの記録（error-context）には、見出しの要素しか残っていない。未解決の事項として記録する。
- final3 と final4 の両方で、製品の例外とコンソールのエラーは 0 件、V8 の致命的なエラー、ワーカーの異常終了、接続の拒否、依存の再最適化、全体の再読み込みは 0 件。各回の開始と終了で HEAD は `46da27f`、作業ツリーの変更は 0 件だった。
- 結論：**最終の統合候補（`46da27f`）で、6 つの確認を 2 回連続（final3、final4）で失敗 0 件で終えた。** 統合の条件を満たした。この後の変更は、この資料と README と 6 つの資料の状態の行だけである（検品の対象のコードとテストは変えていない）。

### v0.1 の独立したレビュー

別のエージェントが、実装の結論を渡さずに、`2dcbe2e` 以降の未コミットの変更（Registry、プレビュー、検品、資料）を読み、ブラウザで再現を試みた（読み取りだけ）。指摘は 14 件（高 1、中 6、低 7）。すべてを確かめ、実際の問題と判断して対処した。対処の後の検品の結果は「v0.1 の検証の結果」に記す。

| 指摘 | 原因 | 対処 |
| --- | --- | --- |
| 高：編集で結果が不明になった後の「保存されているか確認」が、保存されていない変更を保存済みと判定する | 照合がメールアドレス、電話番号、住所、メモ、プランの 5 項目だけを比べていた。会社名などだけを変えた場合に一致と判定し、未保存の変更が失われた | 送信したすべての項目（送信した時点で表示していた項目）を、サーバーが保存する形にそろえて比べる（`matchesSavedCustomer`）。模擬のサーバーの「予期しない例外」で、編集はサーバーに保存してから例外を投げる（応答だけが届かない）。検品を追加した |
| 中：保存ボタンが押せる状態では、`submitOnEnter` が送信にしない Enter（日付、`data-submit-on-enter="false"`、Shift+Enter）で、ブラウザの暗黙の送信が起きる | 除外する Enter で `return` するだけで、`preventDefault` を呼んでいなかった | 暗黙の送信の対象になる入力欄（ポップアップの部品の中を除く）の除外する Enter で `preventDefault()` を呼ぶ。保存できる状態のフォームでの検品を追加した |
| 中：結果が不明の確認の後に、保存済みの内容に対して「変更を破棄しますか？」が出る | `resolveUnknown` と同じ処理の中で移動を求め、未保存の変更の登録が前の描画のままだった | 確かめた結果の移動を、`useUnsavedChanges` の後に置いた `useEffect` で行う（登録の更新の後）。資料に要件を記した。検品を追加した |
| 中：`ConfirmActionDialog` を閉じて開き直すと、結果が不明の状態が消え、もう一度実行できる | 開いたときに結果が不明の状態を消していた | 結果が不明を `targetKey` ごとに保持し、同じ対象で開き直しても実行のボタンを示さない。`onUnknown` を追加した。検品を追加した |
| 中：`resolveUnknown({ saved: true })` が、送信していない（非表示の）項目も基準値にする | 送信した値の写し（全項目）を基準値にしていた | 送信した項目の一覧（`submittedFields`）を保持し、その項目だけを基準値にする。検品を追加した |
| 中：「保存して移動」の途中の新しい移動の要求が取り消され、古い要求で移動する | 実行中の要求を置き換えず、新しい要求の `onCancel` を呼んでいた | 保存を続け、保存の後の移動先を最新の要求に置き換える（前の要求の `onCancel` を呼ぶ）。検品を追加した |
| 中：取り込みの実行が例外で終わると、進行中の表示と未保存の変更の登録（保存中）が残る | `runImport` の例外を受け取っていなかった | 進捗の表示を `finally` で閉じ、例外をすべての行の結果が不明として `reconcileImportResult` に渡す。模擬のサーバーに「途中で通信の例外になる」を追加し、検品を追加した |
| 低：模擬の `checkImportStatus` が、処理済みの行を「登録されていなかった」と返し、再処理の対象にする | 確認の対象の行をすべて未登録として返していた | 模擬のサーバーが処理した行を記録し、登録済みの行（成功として扱い、再処理しない）と未登録の行（失敗として再処理できる）に分ける |
| 低：一覧の記録が、保存・キャンセル・戻る以外の経路（Sidebar から一覧を開く）でも復元される | 記録の有無だけで復元していた | `restore=1` の URL か、記録した履歴の項目（`history.state` の印）に戻った場合だけ復元する。検品を追加した |
| 低：Undo の取り消しが確定した失敗になった後、Toast から再試行できない | 失敗の通知に操作がなかった | 期限の中であれば、失敗の通知に「もう一度元に戻す」を置く。再試行の通知は新しい id で出す（閉じた通知と同じ id では操作できなかった）。検品を追加した |
| 低：`useAutosave` が `AbortSignal` を中止しない | `AbortController` を保持していなかった | スコープの変更とアンマウントで中止する |
| 低：エクスポートの「CSV（UTF-8。ほかのシステムへの取り込み）」が `spreadsheet` で書き出す | 形式にかかわらず既定の `spreadsheet` を使っていた | この形式は `raw` で書き出す。資料に記した |
| 低：`check-failed` の文が `goal` を使わない、利用人数に確かめ直すボタンがない、設定の会社の情報と請求先の値がワークスペースごとに保存されない | 文が固定、ボタンがない、模擬のサーバーが値を保存していなかった | 文を「{label}を確かめられませんでした。確かめ直すと{goal}」にし、ほかの理由と同時の場合は並べる。利用人数に「もう一度確かめる」を置く。設定のフォームの値をワークスペースごとに保存し、切り替えたときにその値から始める。検品を追加した |
| 低：検品の不足と、常に成功するアサーション | 除外の Enter を保存できない状態だけで確かめていた、Focusable Disabled のエラーの表示を確かめていない、押していない Undo の件数、破棄で値が戻るため印の解除を確かめられない、固定の待ち時間（1200ms、1800ms） | 上の各検品に加え、保存できる状態の除外の Enter、Focusable Disabled のエラーの表示、`asyncFailure: "allow"`、即時保存のサーバーの値の変更での解除、破棄の処理がない単位での印の解除を加えた。常に成功するアサーションを、通知に「元に戻す」がないことの確認に置き換えた。固定の待ち時間を、模擬のサーバーの応答の記録（`settled`）を待つ方法に変えた |

レビューで、問題がないと判断された事項：非同期の検証が pending や validating のまま止まる経路はない。`handleSubmit` の保存しない条件、Focusable Disabled のボタン（Chromium と WebKit で実測）、保存の結果の区別、`applyAutofill`、`useInstantSave`、`useUndoableAction` の通知の id とスコープ、`ConfirmActionDialog` の世代、`reconcileImportResult`、`escapeCsvCell`、Data Browsing の Registry の使い方、ルーターの戻る・進む。

対処していない事項：`reconcileImportResult` は、サーバーが一部の件数だけを返した場合に、返さなかった件数を 0 と一致しないものとして `countsDisagree` にする（レビューで軽微と判断された。結果を成功として示さない側に倒れるため、変えていない）。

### 初期実装の検証の結果

次をこの順に続けて実行した（2026-11-26、4 ワーカー、macOS（Darwin 25.6）、Node.js 26.10.0、Playwright 1.65.1（Chromium 159、WebKit 27.x））。

#### main との統合の候補（`22d6bea`）

初期実装のコミット（`be6972b`）の後に、origin/main に Data Browsing v0.1（`5dcd39a`、`aa7e664`）が入った。origin/main をマージし（競合は README の進捗の表だけで、両方の内容を残した）、その状態で実行した。

| 確認 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功（exit 0） |
| `npm run preview:build` | 成功（exit 0） |
| `npm run test:tokens` | 成功（failed 0） |
| `npm run test:ssr` | 96 件成功 |
| `npm run test:patterns` | 604 件成功、96 件 skip、失敗 0 件（3.8 分） |
| `npm run test:components` | 2115 件成功、245 件 skip、失敗 0 件（12.0 分） |

製品の例外とコンソールのエラーは 0 件。

#### 初期実装のコミット（`be6972b`、origin/main `1882f2a` の上）

| 確認 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功（exit 0） |
| `npm run preview:build` | 成功（exit 0）。チャンクの大きさの警告は従来どおり（範囲外） |
| `npm run test:tokens` | 成功（failed 0） |
| `npm run test:ssr` | 96 件成功（Forms & Workflows の 12 件を含む） |
| `npm run test:patterns` | 558 件成功、94 件 skip、失敗 0 件（3.4 分） |
| `npm run test:components` | 2069 件成功、243 件 skip、失敗 0 件（11.5 分） |

- 製品の例外とコンソールのエラーは 0 件。記録されたのは、SSR の検品での Vite の HMR の接続のコンソールのエラー（既存の条件で記録だけ）である。
- skip は既存の規則によるもの（`@webkit` のないテストの WebKit、デスクトップだけ・モバイルだけの表示、ハードウェアキーボードの操作、Chromium の CDP による IME の再現、ダウンロードの確認）。既存のテストの削除、不要な skip の追加、許容誤差の拡大はしていない。
- 既存のテストの変更は 1 件：`button.spec.ts` の「Tab reaches the button」は、Tab を押す回数の上限を固定の 80 回から、ページのフォーカスできる要素の数に変えた。プレビューの上部の一覧に 7 つのリンクを足したため、80 回では対象のボタンに届かなくなった（期待する値と判定は変えていない）。
- スクリーンショット（`preview/screenshots/desktop/`、`preview/screenshots/mobile/`、Git の管理外）：資料のページ 6 つ、検証画面 6 画面、操作の途中の状態 10 種類（`fw-state-*.png`）を、Chromium の 1280×900 と 390×844（タッチ）で撮り、目視で確かめた。自己レビューで、狭い画面の固定の操作ボタンが画面の約 4 割を覆うこと、縦型の Stepper のラベルが 1 文字ずつ折り返すこと、320px でボタンがはみ出すことを見つけ、直した。WebKit と実機での目視の確認は行っていない。

### 初期実装の独立したレビュー

別のエージェントが、実装の結論を渡さずに、コード、要件、スクリーンショットを、8 つの設計原則と 8 つの美的基準に照らして確かめた（読み取りだけ）。あわせて、資料を書いたエージェントが、コードと要件の食い違いを 11 件報告した。対処は初期実装の時点のもの。v0.1 で変えた事項は、「v0.1 の最終調整」に記した。

| 指摘 | 対処 |
| --- | --- |
| 中：保存ボタンが `aria-disabled` の間、Enter の暗黙の送信が起きず、何も起きない（資料と異なる） | `submitOnEnter` を追加し、すべての例のフォームの `onKeyDown` に指定した。Enter だけ、`requestSubmit` だけの検品に分けた |
| 中：結果が不明の後に値を変えてから確かめると、変えた値が保存済みになる | `submittedValues` に送信した値を残し、その値で照合して `markSaved` する（v0.1 では `resolveUnknown` に変えた）。検品を追加した |
| 中：再処理が結果不明になった後の「状態を確認」が、成功済みの行を失敗として扱う | 結果を受け取れなかった行（`unknownRows`）を実行ごとに記録し、位置から推測しないようにした（v0.1 では、`reconcileImportResult` の照合の後の行ごとの結果で記録する）。検品を追加した |
| 中：同じ見出しの列の Select が同じ名前になる | 名前に列の位置を含めた（「3 列目「電話番号」の登録先」） |
| 中：Enter の検品が `requestSubmit` で常に成功する、保存中の変更の検品が条件分岐で常に成功する | 検品を分け、条件分岐をなくした |
| 中（資料の執筆者）：結果が不明の後に Enter と「保存して移動」で再実行できる | `useFormState` の `canSubmit` と `handleSubmit` が、`unknown` の間は保存しないようにした |
| 中（資料の執筆者）：「保存して移動」の実行中は確認を閉じられない | 実行中も「移動をやめる」で移動だけを取りやめられるようにした。検品を追加した |
| 低：状態が変わるたびに登録をやり直し、破棄の印（`released`）が消える | 登録の関数と状態を別の Context にし、登録はマウントとアンマウントだけで行う。保存して移動の印は id で引き直して付ける |
| 低：`applyAutofill` が状態の更新の関数の外の配列を書き換える | 入れる項目を最新の状態で同期に決め、更新の関数を副作用のないものにした |
| 低：保存中に値を変えた場合、保存の後の移動が確認を開く | `onSuccess` に `changedWhileSaving` を渡し、例では移動しない |
| 低：完了の見出しのフォーカス、下書きの再開での上書き、削除の確認の閉じる動きの間の「0件」、アーカイブ済みの一覧の二重の実行、名前の key、Undo の例の二重の追加 | 対処した（下書きの再開は、入力がある場合に置き換えを確かめる） |
| 低：「入力内容を消す」が確認なしにすべてを消す | ボタンを削除した |
| 低：エクスポートの「表示中のページ」と「検索結果のすべて」が同じ | ページに分けていない一覧では「表示中のページ」を選択肢にしない。「すべてのデータ」はアーカイブ済みを含む |
| 低：実行の前に「処理の対象」の件数を示していない | 内容の確認に「処理の対象」の件数を加えた |
| 低：文言（編集での「登録されているか確認」、サーバー側の検証の文、「進捗率は取得できません」） | 場面に合わせて直した |
| 低：保存の結果の切り替えが、同じページの即時保存と自動保存にも効く | 即時保存と自動保存は、それぞれの失敗の設定だけを使う |
| 低：取り込みの全件成功と全件失敗、`importOutcome`、Sheet の閉じるボタン、契約の登録の途中の離脱の検品がない | 検品を追加した |
| 低（資料の執筆者）：`SaveBlockerNotice` が確認中の項目だけで例外になる、編集で「確認」が常に保存済みになる、変更がない理由を示さない、空欄の扱いを送信しない、CSV の改行、コメント | 対処した（変更がない理由は `unchanged` で支援技術にだけ伝える） |
| 低：狭い画面で、簡易の Stepper の現在のステップの名前と、ステップの見出しが続けて表示される | 初期実装では変更しなかった。v0.1 で `currentLabel` を追加し、例では `"hidden"` にした（「確定した設計判断」） |
| 低：Drawer のスワイプの検品がない | 変更していない。Drawer の `unsavedChanges` のスワイプは Components の `overlays.spec.ts` で検品している |

### 未検証の事項

| 項目 | 状況 |
| --- | --- |
| 実機の iOS Safari | 未検証。固定した操作ボタンと Safe Area、ソフトウェアキーボードの表示中の入力欄の位置、Drawer のスワイプでの破棄の確認を、実機で確かめていない |
| Android の実機 | 未検証。IME の変換中の入力と保存ボタンの状態、Enter による送信 |
| 実際の IME | 端末の IME では確かめていない。Chromium の CDP で再現した変換（`compositionstart`、`compositionend`、変換中の Enter）だけで確かめている。`submitOnEnter` の `isComposing` と `keyCode` 229 の判定は、端末の IME で確かめていない |
| VoiceOver、NVDA | 未検証。`aria-describedby` による保存できない理由（Focusable Disabled の保存ボタン）、`aria-current="step"`、`role="status"`、`role="alert"` の読み上げを、Playwright の属性の検品だけで確かめている |
| beforeunload の確認の表示 | Chromium と WebKit の Playwright で、利用者の入力の後にブラウザの確認が表示されることと、変更がない場合に表示されないことを確かめた。ブラウザは、利用者がページを操作していない場合などに表示しないことがあるため、常に表示されることは保証しない。Firefox と実機のブラウザでは確かめていない |
| ファイルの文字コード | Shift_JIS などの UTF-8 以外のファイルには対応していない。プレビューの解析は UTF-8 の文字列として読む |
| 表計算ソフトでの CSV の解釈 | `escapeCsvCell` の出力を、実際の表計算ソフト（Excel、Google スプレッドシート、Numbers など）で開いて確かめていない。製品と版で解釈が異なるため、すべての表計算ソフトでの安全を保証しない |
| 実際の API とルーター | 模擬のサーバーと例のルーターだけで確かめている。React Router、TanStack Router などの blocker との接続は確かめていない |
| Next.js での導入 | 未検証。`"use client"` の境界は規則で確かめている |

実機の IME、iOS Safari、Android、VoiceOver、NVDA による検品は、Gallery の公開の前の検品事項とする。

## 後続への引き継ぎ

| 事項 | 引き継ぎ先 |
| --- | --- |
| 実機の IME、iOS Safari、Android、VoiceOver、NVDA での検品 | Gallery の公開の前の検品 |
| 実際の API、ルーター（blocker、履歴の位置の記録）、Next.js での導入の検品 | Registry & Gallery |
| 下書きの永続化、再認証と承認、XLSX の生成、本格的な CSV の解析、Shift_JIS の判定 | 製品の責務（製品の基盤で扱う） |
| 一覧の記録（条件、データ、位置）の履歴の項目ごとの保存 | 製品の責務（例ではページのメモリに 1 件だけ置く） |
| View Switching の切り替えとエクスポートの入口を同じ行に置く場合の並べる順序 | 次のレビュー（検証画面に表示形式の切り替えがないため、確かめていない） |
| `asyncFailure: "allow"` の例 | 次のレビュー（プレビューには、`"allow"` を使う項目がない） |
| `useScopeGuard`（System & Account）との責務の整理 | Patterns Integration Review |
| `useInstantSave` と Settings の保存の hook の責務の整理 | Patterns Integration Review |
| 保存の結果が不明の分類と扱いの統一（Forms & Workflows、Settings、Notifications） | Patterns Integration Review |
| スコープの変更の後に、古いフォームの値を表示・送信しないこと | Patterns Integration Review |
| Permission States、System States との接続 | Patterns Integration Review |
| Concurrent Rendering と中断された描画の追加の検品 | Patterns Integration Review |
| Data Analysis から編集画面へ移動する場合の連携 | Patterns Integration Review |
| `reconcileImportResult` の部分的な件数（行ごとの結果の一部だけを返すサーバー）の契約の明確化 | Patterns Integration Review |
| raw CSV（`escapeCsvCell` の `mode: "raw"`）の用途と、数式の注入の注意事項 | Patterns Integration Review |
| 実際の表計算ソフトでの CSV の解釈の検品 | Registry & Gallery の公開の前の検品 |
