# Overlay の判断基準

Dialog、Alert Dialog、Popover、Dropdown Menu、Sheet、Drawer に共通する判断基準。個別の仕様は各コンポーネントの資料を参照する。

| コンポーネント | 資料 |
| --- | --- |
| Dialog | [dialog.md](dialog.md) |
| Alert Dialog | [alert-dialog.md](alert-dialog.md) |
| Popover | [popover.md](popover.md) |
| Dropdown Menu | [dropdown-menu.md](dropdown-menu.md) |
| Sheet | [sheet.md](sheet.md) |
| Drawer | [drawer.md](drawer.md) |

Overlay は、今の作業の上に重ねて表示する。重ねるほど、ユーザーの作業と思考を中断する。必要以上に中断しないことを、すべての判断の基準にする。

## 1. コンポーネントの選び方

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/overlay-choice-dark.svg">
  <img alt="目的と使うものの対応。短い入力・編集は Dialog。重要な判断・危険な操作は Alert Dialog。補足の情報・小さな複合操作は Popover。実行する操作を選ぶときは Dropdown Menu で、値を選ぶときは Select。一覧からの詳細の確認・編集は Sheet。モバイルでの短い補助操作は Drawer。長い作業・複雑な編集は専用のページ。" src="../../diagrams/overlay-choice-light.svg">
</picture>

| 目的 | 使うもの |
| --- | --- |
| 短い入力・編集 | Dialog |
| 重要な判断・危険な操作 | Alert Dialog |
| 補足の情報・小さな複合操作 | Popover |
| 実行する操作を選ぶ | Dropdown Menu |
| 一覧からの詳細の確認・編集 | Sheet |
| モバイルでの短い補助操作 | Drawer |
| 長い作業・複雑な編集 | 専用のページ |

### 既存のコンポーネントとの違い

| コンポーネント | 用途 |
| --- | --- |
| Select | 入力する値を選ぶ。選んだ結果が欄に残り、フォームとして送信される |
| Dropdown Menu | 実行する操作を選ぶ。選ぶと閉じ、値は残らない |
| [Tooltip](tooltip.md) | 短い補足を読む。中に操作を置かない。タッチ操作では開かない |
| Popover | 関連する情報を確かめ、いくつかの操作を行う。Button、Input、Checkbox を置ける |

## 2. 閉じる操作と未保存の変更

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/overlay-closing-dark.svg">
  <img alt="閉じる操作と未保存の変更の関係。未保存の変更がなければ、外側のクリック、Escape、閉じるボタンとキャンセル、Drawer のスワイプのいずれでも閉じる。未保存の変更があるときは、外側のクリックでは閉じず、Escape、閉じるボタンとキャンセル、スワイプでは破棄を確かめる。Escape には最前面の Overlay だけが反応する。破棄を確かめる Alert Dialog は「変更を破棄しますか？」と示し、初期フォーカスは「編集を続ける」に当たる。「編集を続ける」と Escape は Alert Dialog だけを閉じて入力を残し、「変更を破棄」は元の Overlay も閉じる。Sheet でキャンセルを押した場合は閲覧に戻る。未保存かどうかは製品が判断し、unsavedChanges で渡す。" src="../../diagrams/overlay-closing-light.svg">
</picture>

| コンポーネント | 外側のクリック | Escape | 明示的な閉じる操作 |
| --- | --- | --- | --- |
| Dialog | 未保存の変更がなければ閉じる | 閉じる | 閉じるボタン、キャンセル |
| Alert Dialog | 閉じない | キャンセルとして閉じる | キャンセル（必須） |
| Popover | 閉じる | 閉じる | 原則不要 |
| Dropdown Menu | 閉じる | 閉じる | 不要 |
| Sheet | 閲覧：閉じない。編集：未保存の変更がなければ閉じる | 閉じる | 閉じるボタン |
| Drawer | 未保存の変更がなければ閉じる | 閉じる | 閉じるボタン |

- 未保存かどうかは製品が判断し、Dialog、Sheet、Drawer の `unsavedChanges` で渡す。コンポーネントは入力の内容を見て推測しない。
- `unsavedChanges` が `true` のとき、外側のクリックでは閉じず、確認も出さない。Escape、閉じるボタン、`DialogClose` などのキャンセル、Drawer のスワイプでは閉じずに `onDiscardRequest` を呼ぶ。製品はそこで、破棄を確かめる Alert Dialog を開く。
- 外側のクリックで確認を出さないのは、閉じる意図のない操作（押し間違い、一覧を押したつもりの操作）である可能性が高いためである。
- 保存の後などに製品が `open` を `false` にした場合は、`unsavedChanges` に関係なく閉じる。
- `unsavedChanges` が `true` の間、閉じずに止めた要求は `onOpenChange` に渡さない。閉じる理由ごとに製品が個別に制御する場合は、`unsavedChanges` を使わず、Base UI の `onOpenChange` の `eventDetails.reason` と `eventDetails.cancel()` を使う。

```tsx
const [confirm, setConfirm] = useState(false)

<Dialog open={open} onOpenChange={setOpen} unsavedChanges={dirty} onDiscardRequest={() => setConfirm(true)}>
  <DialogContent>
    {/* ... */}
    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>変更を破棄しますか？</AlertDialogTitle>
          <AlertDialogDescription>入力した内容は保存されません。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>編集を続ける</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { setConfirm(false); reset(); setOpen(false) }}>
            変更を破棄
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </DialogContent>
</Dialog>
```

### 閉じる手段を残す

| 状況 | 動き |
| --- | --- |
| `onDiscardRequest={null}` | 確認を出さない。外側のクリックだけを止め、Escape、閉じるボタン、スワイプでは閉じる |
| `onDiscardRequest` の指定漏れ | 型エラーになる（`unsavedChanges` を渡す場合は必須）。型を通らない場合（JavaScript など）は、開発時に `console.warn` を 1 回出し、`null` と同じく閉じる手段を残す |
| 閉じる要求が続く | 確認は 1 つだけ開く。確認が開いている間、Escape は確認だけを閉じ、背後の閉じるボタンは確認の背景に当たる |
| 取り消せない閉じる要求 | `unsavedChanges` に関係なく閉じ、`onOpenChange` に渡して製品の状態と画面を一致させる（下記） |

取り消せない閉じる要求は、Android の Chromium で Drawer を開いているときに起きる。Base UI は Android の戻る操作を `CloseWatcher` で受け、ブラウザはユーザーの操作 1 回につき 1 回しか閉じる要求の取り消しを認めない。戻る操作が続いた場合、未保存の内容は失われる。プレビューのキーボードの Escape では、この経路は起きなかった（検品で確認）。

### 保存中

保存中に閉じるかどうかは製品が決める。プレビューの例では、保存中は `onDiscardRequest` を無視し、キャンセルを `disabled` にし、保存が終わったら製品が `open` を `false` にする。未保存の変更がない状態で閉じる要求を止める場合は、`onOpenChange` で `eventDetails.cancel()` を呼ぶ。

### 保護する範囲

| 操作 | 保護するもの |
| --- | --- |
| 外側のクリック、Escape、閉じるボタン、キャンセル、Drawer のスワイプ | コンポーネント（`unsavedChanges`） |
| プログラムで `open` を `false` にする | 保護しない（製品が意図して閉じる） |
| Android の戻る操作の 2 回目以降 | 保護できない（ブラウザの仕様） |
| ブラウザの戻る・進む、ページの移動、再読み込み、タブを閉じる | 製品（ルーターの移動の確認、`beforeunload`）。コンポーネントは関与しない |

## 3. 入れ子とフォーカスの復帰

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/overlay-nesting-dark.svg">
  <img alt="Overlay の入れ子。ページの上に Dialog、その上に Alert Dialog が重なる。1 回目の Escape では Alert Dialog だけが閉じ、フォーカスは Dialog の中の元の要素に戻る。2 回目の Escape で Dialog が閉じ、フォーカスはページのトリガーに戻る。認める組み合わせは、Dialog の中の Select と Popover、Sheet の中の Dropdown Menu、編集中の変更の破棄を確かめる Alert Dialog。モーダルの面は z-40、浮かぶ要素と通知は z-50 で、同じ層の中では開いた順に前面に重なる。" src="../../diagrams/overlay-nesting-light.svg">
</picture>

モーダルの入れ子は、原則として避ける。次の組み合わせは認める。

- Dialog の中の Select、Popover
- Sheet の中の Dropdown Menu
- 編集中の変更の破棄を確かめる Alert Dialog

入れ子にした場合の動きは Base UI が担う。

- Escape には最前面の Overlay だけが反応する。
- 閉じた後、フォーカスは開く前にフォーカスがあった要素に戻る。
- 入れ子の Alert Dialog は背景を重ねて描かない。背後の Dialog と Sheet は、面を 10% 暗くして最前面を区別する（`data-nested-dialog-open`）。
- Dialog、Sheet、Drawer の中の Tooltip は、開き方（ポインター、キーボード）に関係なく、1 回目の Escape で Tooltip だけが閉じる。2 回目の Escape で背後の Overlay が閉じる（未保存の変更があれば破棄を確かめる）。フォーカスは動かず、閉じた Tooltip はポインターを動かしても再表示しない。
  - Base UI の Tooltip は、Dialog などの Overlay の木（FloatingTree）に属さない。そのため、ポインターで開いた Tooltip があっても、Escape は背後の Dialog に届いていた。
  - Flow Design の Tooltip は、開いている間だけ、その Tooltip の Escape を `document` のキャプチャの段階で受け、Base UI の `actionsRef.close()` で自分を閉じ、伝播を止める。全体の Escape を管理する仕組みは持たない。IME の変換中の Escape は扱わない。

破棄を確かめる Alert Dialog は、入れ子として扱われるよう、元の Overlay の中（`DialogContent` などの子）に置く。

## 4. モバイルでの使い分け

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/overlay-mobile-dark.svg">
  <img alt="モバイルでの使い分け。短い確認は中央の Dialog。短い補助操作は下からの Drawer。長い詳細・フォームは全画面の Sheet。複雑な業務は専用のページ。モバイルだからという理由だけで、Dialog を Drawer に変えない。" src="../../diagrams/overlay-mobile-light.svg">
</picture>

| 内容 | 使うもの |
| --- | --- |
| 短い確認 | 中央の Dialog、Alert Dialog |
| 短い補助操作 | 下からの Drawer |
| 長い詳細・フォーム | 全画面の Sheet（480px 以上の幅の Sheet は、画面の幅が足りないと全画面になる） |
| 複雑な業務 | 専用のページ |

- 全画面の Sheet と Drawer は、ヘッダーとフッターを固定し、内容だけをスクロールする。
- 画面の端に接する部分は、`env(safe-area-inset-*)` の分だけ余白を足す。iOS で Safe Area の値を得るには、製品の `<meta name="viewport">` に `viewport-fit=cover` が必要である。
- タッチ操作で Dialog を開いたときは、入力欄ではなく Dialog 自体にフォーカスを移す（Base UI の既定）。意図せずソフトウェアキーボードが開くのを防ぐ。
- Drawer は Base UI の `VirtualKeyboardProvider` で、フォーカスした入力欄をキーボードに隠れない位置に保つ。

## 5. 共通の実装

| 項目 | 実装 |
| --- | --- |
| Portal | すべて `<body>` の直下に表示する。テーマの変数は `:root` から継承する |
| 重なり順 | 2 つの層に分ける（下表）。同じ層の中では、開いた順に DOM の後ろへ追加され、後から開いたものが前面になる。z-index を上げて重なりを直さない |
| 背景 | 黒 40%、ぼかしなし。Dialog、Alert Dialog、Sheet（編集）、Drawer で同じ |
| フォーカス | モーダルは開くと中に移し、閉じ込め、閉じると戻す（Base UI） |
| スクロール | モーダルは背景のスクロールを止める。Popover と閲覧の Sheet は止めない |
| 画面の端 | Popover と Dropdown Menu は、画面の端から 8px 以内に入らないよう、位置と向きを変える（`collisionPadding`） |
| 動き | 開閉は Base UI の `data-starting-style` と `data-ending-style` による CSS の transition。動きを減らす設定では、大きさと位置を変えない |
| 名前と説明 | タイトルが `aria-labelledby`、説明が `aria-describedby` に入る（Base UI） |

### 重なり順

| 層 | z-index | コンポーネント |
| --- | ---: | --- |
| モーダルの面 | 40 | Dialog、Alert Dialog、Sheet、Drawer（背景と面） |
| 浮かぶ要素と通知 | 50 | Popover、Dropdown Menu、Select、Tooltip、Toast |

- Dialog の中で開いた Select、Popover、Tooltip は、Dialog の上に重なる（50 > 40）。
- Toast の領域はアプリの起動時に追加されるため、同じ層にすると、後から開いた Dialog や Sheet の下に隠れる。モーダルの面を 1 段下にすることで、Toast は開いている Dialog と Sheet の上に表示され、閉じるボタンを押せる。Toast を押しても Dialog は閉じない（検品で確認）。
- モーダルの Overlay は外側の要素に `aria-hidden` を付けるが、`aria-live` の領域（Toast）は除く（Base UI）。Dialog の表示中も通知は読み上げの対象に残る。
- 浮かぶ要素は、後から開いたモーダルの外側に残った場合、モーダルの層（40）に下がる。Base UI はモーダルを開くとき、外側の要素に `data-base-ui-inert` と `aria-hidden` を付ける。浮かぶ要素は、この印の下では `z-40` になり、DOM の順で新しいモーダルの背面に入って押せなくなる。たとえば、Dialog の中の Popover から Alert Dialog を開くと、Popover は Alert Dialog の背面に入る。Alert Dialog を閉じると元の層に戻る。
- 前面のモーダルの中で新しく開いた浮かぶ要素は印を持たないため、`z-50` のまま前面に出る（Dialog の中の Select など）。
- Toast は印の下でも層を変えない。通知はモーダルの上に残し、押せる。
- 層を増やす場合は、この表に理由とともに追加する。

ブランドカラーなどの変数を、画面の一部の要素だけに設定すると、Portal に表示する Overlay には届かない。変数は `:root` か `<html>` に設定する。画面の一部だけテーマを変える場合は、Portal の `container` に、その要素を指定する。

| 種類 | 時間 | トークン |
| --- | --- | --- |
| Dialog、Alert Dialog、Sheet、Drawer | 240ms | `--duration-slow`（動きを減らす設定では 0ms） |
| Popover、Dropdown Menu | 180ms | `--duration-normal`（動きを減らす設定では、大きさを変えず透明度だけで開閉する） |

## 6. キー操作のハイライト

Dropdown Menu と Select の選択肢に共通する規則。将来の Combobox、Multi Select、Command も同じ規則に従う。

| 操作 | 表し方 |
| --- | --- |
| ポインターを重ねる | `accent` の面だけ（控えめに示す） |
| キーで移る | `accent` の面と、項目の内側の `focus-ring`（2px、offset −2px） |
| 選択中 | Check のアイコン（Select は加えて太さ 500）。フォーカスの枠とは別に示す |
| 危険な操作 | 文字は `destructive`。枠は他の項目と同じ `ring` |

- `accent`（#f5f5f5）は白の上で約 1.09:1 で、キー操作の位置を示すには弱い。そのため、キー操作のときは枠を加える。
- 仕組みは Base UI のフォーカス管理に合わせる。Base UI の Menu と Select は、キー操作でもホバーでも選択肢に DOM のフォーカスを移し、`data-highlighted` を付ける（`aria-activedescendant` は使わない）。
- `:focus-visible` は、キー操作の後に一致する。ただし、キー操作の後にポインターを動かした場合も一致したままになる。そのため、ポインターを動かしている間は Popup に `data-pointer` を付けて枠を消し、キーを押したら外す。
- 枠は項目の内側に描く。スクロールする領域の端、隣の項目、Popup の角で欠けない。
- キー操作で選択肢を表示範囲に入れるときに、スクロールのボタンや余白に隠れないよう、`scroll-margin` を付ける（Select は 24px、Dropdown Menu は 8px）。
- `aria-activedescendant` を使う部品（入力欄にフォーカスを残す Combobox など）では、`:focus-visible` が選択肢に一致しない。その場合は `data-highlighted` に同じ枠を付け、ポインターの操作中は同じ方法で消す。
- 製品が `--ring` をブランドカラーに変える場合も、枠は `accent` と `popover` の上で 3:1 以上を保つ（検品で確認）。

## 7. 検品

`preview/tests/overlays.spec.ts` で、次を確認している。

| 項目 | 確認すること |
| --- | --- |
| トークン | 角丸、余白、影、背景、境界線、開閉の時間が、トークンの値と一致する |
| フォーカス | 初期フォーカス、閉じ込め、Escape、閉じた後の復帰 |
| 背景 | モーダルは背景を押せず、ホイールでスクロールしない。Popover と閲覧の Sheet は背景を操作できる |
| 未保存の変更 | 外側のクリックで閉じない。Escape、閉じるボタン、キャンセル、スワイプで破棄を確かめる |
| 入れ子 | Escape が最前面だけを閉じる。重なり順が開いた順になる |
| 画面の端 | Popover と Dropdown Menu が画面からはみ出さない |
| 幅 | Dialog の 4 段階と Sheet の 3 段階。狭い画面での縮み方 |
| 動きを減らす設定 | 大きさと位置の動きが止まる |
| ブランドの変更 | Portal の中のボタンが `--primary` に従い、4.5:1 以上を保つ |
| キー操作のハイライト | ポインターでは枠を出さず、キー操作では項目の内側に枠を出す。選択中との区別、スクロールの端 |
| 他のコンポーネント | Dialog と Sheet の上の Toast、Dialog の中の Tooltip と Popover、開閉を繰り返した後に何も残らない |
| ページの例外 | 捕捉されなかった例外を記録し、検品を失敗にする（下記） |

### ページの例外の記録

`preview/tests/page-errors.ts` は、Overlay の検品で、捕捉されなかった例外とコンソールのエラーを記録する。例外が起きた場合は、テスト名、project、ブラウザとバージョン、URL、例外の文とスタック、ファイルと行、発生時に開いていた Overlay、コンソールのログを `test-results/` に JSON で添付し、検品を失敗にする。

調査で確認した事象は次のとおりである。

| 事象 | 条件 | 原因 | 扱い |
| --- | --- | --- | --- |
| `TypeError: The provided value is non-finite` | WebKit。まれ（Overlay の検品 720 回中 2 回など）。別々のワーカーで同時に起きる | WebKit が、座標が NaN の信頼された `pointerdown`、`pointerup`、`click` を `<html>` に発生させ、Playwright がクリックの対象を確かめる処理（`expectHitTarget`）の `elementsFromPoint` が例外を出す。製品のコードと Base UI は関与しない。イベントの発生元は特定できていない | 下の条件をすべて満たすものだけ、記録と注記を残して検品を失敗にしない |
| `ResizeObserver loop completed with undelivered notifications` | Chromium。Dialog の中の Select で選んだ直後、一覧が閉じる動きの途中で Dialog を閉じた場合 | ResizeObserver の通知が次のフレームに持ち越されたことのブラウザの報告。例外ではない | 検品は実際の操作の順序（一覧が閉じてから閉じる）で行う。重なった場合の影響は確認されていない |

環境の事象として扱う条件（`classifyPageErrors`）は次のすべてである。条件は `preview/tests/page-errors.spec.ts` で検品している。

1. ブラウザが WebKit で、版が 27.x（調査で確認した版）である。Playwright を更新したときは、事象を確かめ直してから条件を変える。
2. 例外の文が `The provided value is non-finite` である。
3. スタックの先頭が `elementsFromPoint`、続いて `expectHitTarget` で、`http(s)://` の URL を持つフレーム（製品やライブラリのコード）を含まない。`window` の `error` のファイル名を持たない。
4. 例外の 0〜5ms 前に、座標が有限でない信頼された `PointerEvent` か `MouseEvent`（`pointerdown`、`pointerup`、`click`、`mousedown`、`mouseup`）が記録されている。イベントは種類、コンストラクター、`isTrusted`、座標を構造化して記録する。
5. `pageerror` は、条件を満たした `window` の `error` の重複に限る（50ms 以内、件数を超えない）。

条件を満たさない例外、製品のコードの例外、Chromium の例外は、すべて検品を失敗にする。

### WebKit と実機の Safari

`webkit`、`webkit-mobile` の project は、Playwright の WebKit（macOS 上のビルド）による検品である。実機の iOS Safari、Safe Area、VoiceOver、NVDA の確認ではない。

- WebKit は Safari の既定の設定と同じく、Tab でリンクに移動しない。リンクへの移動は Option+Tab（`Alt+Tab`）で確かめる。
- Base UI の Tooltip はタッチ操作では開かないため、`webkit-mobile` と `mobile` では Tooltip の検品をしない。

## 8. 残存するリスク

次は、自動の検品で確かめていない。確認済みとは扱わない。

| 項目 | 状況 |
| --- | --- |
| iOS Safari の実機 | 未確認。Playwright の WebKit（macOS）だけで検品している |
| Safe Area | 未確認。`env(safe-area-inset-*)` を指定していることだけを検品している |
| Android の戻る操作 | 未確認。`CloseWatcher` の経路は、プレビューのキー操作では起きなかった |
| VoiceOver、NVDA | 未確認。役割、名前、`aria-hidden` の付け外しを Playwright で確かめている |
| WebKit の座標が NaN のイベント | 発生元は未特定（上記）。Base UI がこのイベントを外側のクリックとして扱い、Overlay が閉じる可能性がある（検品では観測していない） |
| ResizeObserver の通知 | Chromium で、Select の一覧が閉じる動きと Dialog が閉じる動きが重なった場合に記録される。影響は確認されていない |
| Toast を押した後のフォーカス | モーダル（Alert Dialog など）の表示中に Toast の閉じるボタンを押すと、フォーカスが `<body>` に移り、次の Tab で背後の Overlay（`aria-hidden`）の中へ移る（Chromium、WebKit で確認）。Base UI の Dialog は、内側として扱う要素を公開 API で指定できない。改善案は、Toast のボタンが押されてもフォーカスを奪わないようにすること（Feedback）、または Base UI にその API を求めること |
| Base UI の内部の印 | 浮かぶ要素の層の切り替えは、Base UI の `data-base-ui-inert` に依存する。Base UI の更新時は、重なり順の検品で確かめる |

