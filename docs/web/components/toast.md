# Toast

操作の結果などを一時的に知らせる。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/toast.tsx`](../../../registry/components/ui/toast.tsx) |
| 元にした実装 | Base UI の Toast（shadcn/ui の推奨は Sonner） |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーの作業を止めずに、画面に表れない処理の結果を知らせる。

## 2. Usage

- バックグラウンドの送信など、結果が画面に表れない操作に使う。画面の変化で結果がわかる場合は出さない。
- 重要な情報を、自動で消える Toast だけに頼らない。重大なエラーは画面にも残す（一覧の Badge、Alert など）。
- 同じ内容の通知は `id` を指定して 1 つにする。同じ処理で起きた大量の通知は 1 つにまとめる。
- ユーザーのフォーカスを移さない。

### ライブラリの選定

| | Base UI の Toast（採用） | Sonner（shadcn/ui の推奨） |
| --- | --- | --- |
| 追加の依存 | なし（`@base-ui/react` に含まれる） | `sonner`、`next-themes` |
| 重複の統合 | 同じ `id` で更新する | 同じ `id` で更新する |
| キーボード | F6 で通知の領域へ移動する | ホットキーで移動する |
| 他のコンポーネントとの関係 | Tooltip、Select などと同じ Base UI | 別の仕組み |

依存を増やさず、Button などと同じ Base UI の仕組み（`render`、データ属性）で作れるため、Base UI の Toast を採用した。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 面 | 背景 `background`、境界線 1px `border`、角丸 12px、余白 16px | `rounded-md`、`p-4` |
| 影 | `shadow-popover` | |
| アイコン | 20px、種類の色 | `size-5` |
| 文字 | タイトル 14px・500、説明 14px | `text-ui` |
| 操作 | Secondary の Button（Small） | |
| 閉じる | Ghost のアイコンボタン（Compact）、「通知を閉じる」 | |
| 幅 | デスクトップ 360px、モバイルは画面の幅 − 32px | `sm:w-90` |
| 位置 | デスクトップ：右下、端から 24px。モバイル：下中央、端から 16px | |
| 表示・非表示 | 180ms | `duration-(--duration-normal)` |

複数の通知は 8px の間隔で縦に並べ、新しい通知を下に置く。

### 表示上限

同時に表示するのは 3 件まで（`ToastProvider` の `limit`）。上限に達したとき、`useToast` は次のように扱う。自動で消えない通知（失敗、操作つき）を、成功などの一時的な通知で隠さないためである。

| 表示中の通知 | 新しい通知 | 動き |
| --- | --- | --- |
| 自動で消える通知を含む | どれでも | 最も古い自動で消える通知を閉じ、新しい通知を表示する |
| すべて自動で消えない通知 | 自動で消える通知 | 新しい通知は表示しない（`toast()` は `undefined` を返す） |
| すべて自動で消えない通知 | 自動で消えない通知 | Base UI が最も古い通知を一時的に隠す（`data-limited`、`inert`）。表示中の通知が閉じると、再び表示される |

- 同じ処理の成功は、同じ `id` で 1 つの通知にまとめる（件数を更新する）。
- 重大なエラーと、必要な操作は Toast だけに頼らない。製品は、画面の中でも状態（一覧の Badge、Alert など）と操作を示す。上限で表示されない成功の結果も、画面の状態で確認できるようにする。
- 過去の通知を一覧で見返す機能（通知センター）は提供しない。

## 4. Variants

| 種類 | 表示時間 | 読み上げ |
| --- | --- | --- |
| Neutral | 5 秒 | 他の読み上げを妨げない |
| Success | 4 秒 | 他の読み上げを妨げない |
| Info | 5 秒 | 他の読み上げを妨げない |
| Warning | 6 秒 | 他の読み上げを妨げない |
| Destructive | 閉じるまで | 即時（`priority: "high"`） |
| 操作つき | 閉じるか、操作するまで | 種類に従う |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/toast-timing-dark.svg">
  <img alt="Toast の表示時間。Success は 4 秒、Info は 5 秒、Warning は 6 秒、Destructive と操作つきは閉じるまで。ポインターを重ねている間と、フォーカスがある間は、タイマーを止める。同じ id の通知は新しく増やさず更新し、同じ処理の失敗は 1 つにまとめる。" src="../../diagrams/toast-timing-light.svg">
</picture>

## 5. Behavior

- ポインターを重ねている間と、通知の領域にフォーカスがある間は、自動で消えるタイマーを止める。
- キーボードの操作（Base UI 1.9 で確認）：

| 操作 | 動き |
| --- | --- |
| F6 | 通知の領域へフォーカスが移る |
| もう一度 F6、Shift+F6 | 移らない。通知の領域にフォーカスが残る |
| Tab / Shift+Tab | 通知、操作のボタン、閉じるボタンの間を移る |
| Esc（通知にフォーカスがあるとき） | その通知を閉じ、通知を出した操作の位置にフォーカスが戻る |
| 操作のボタン | 操作を実行し、その通知を閉じる |

Base UI の資料には「もう一度 F6 を押すと元の位置に戻る」とあるが、Base UI 1.9 では戻らなかった。独自のキー操作は追加していない。通知の領域から戻るには、Esc で通知を閉じるか、Tab で通知の外へ移動する。
- ポインターで通知（本体、閉じるボタン、操作のボタン）を押しても、フォーカスは通知へ移らない（`mousedown` の既定の動作を止める）。Dialog、Alert Dialog、Drawer（モーダル）と閲覧の Sheet（非モーダル）の表示中に通知を押した場合も、フォーカスは開いている面の中に残り、通知が消えた後に `<body>` へ落ちない。押す操作（`click`）、Base UI のスワイプ（pointer のイベント）、キーボードでの操作（F6、Tab、Enter）は変わらない。キーボードで操作したときは、Base UI が通知を閉じた後に F6 を押す前の要素へフォーカスを戻す。説明（`description`）に置いた入力欄（`input`、`textarea`、`select`、`contenteditable`）は、押してフォーカスを移せる。
  - 変更の前は、モーダルの表示中に通知を押すとフォーカスがモーダルの外の通知へ移り、通知が消えると `<body>` に落ちて、次の Tab で背後の `aria-hidden` の要素（入れ子の Dialog など）へ移っていた（Chromium、WebKit で確認）。Base UI の Dialog は、内側として扱う要素を公開 API で指定できないため、通知の側で直した。検品は `preview/tests/overlays.spec.ts` の `toast focus with overlays`。
  - **モーダルの表示中は Toast に入力欄を置かない。** 入力できる要素（`input`、`textarea`、`select`、`contenteditable`）は上の例外のため、モーダルの表示中に押すと、フォーカスがモーダルの外（通知の中）へ移る（Chromium、WebKit、モバイルの各環境で確認）。通知が消えると、フォーカスはモーダルに戻らない。入力が必要な場合は、モーダルの中か、通知を閉じた後の画面に置く。
  - 回帰の検品：`preview/tests/overlays.spec.ts` の `toast focus: buttons keep focus, editable elements take it`（検品用の画面 `#/forms-checks?case=toast`）。通常の通知と Undo の通知の本体、閉じるボタン、操作のボタンはフォーカスを移さない。入力欄を含む通知の `input`、`textarea`、`select`、`contenteditable` は、モーダルの有無にかかわらずフォーカスを移す。キーボードでは、F6 で通知の領域へ移り、Tab で操作のボタン、閉じるボタン、入力欄へ進み、Enter で操作のボタンを押し、Space で閉じるボタンを押す（閉じた後は F6 を押す前の要素へ戻る）。
- 失敗の通知（`priority: "high"`）は、Base UI が読み上げ用の領域（`aria-live`）で即時に知らせる。重複して読み上げないため、見た目の通知は F6 で移動するまで支援技術から隠れる。操作つきの失敗の通知でも、同じ操作を画面の別の場所に用意する。
- 画面下に固定の操作（ナビゲーション、送信ボタンなど）がある場合は、`--toast-offset-bottom` にその高さを指定して、通知を上にずらす。iPhone などの Safe Area の分は自動で空ける（`env(safe-area-inset-bottom)`）。
- 下から開く Drawer と、下・左右の Sheet の Footer（`DrawerFooter`、`SheetFooter`）の表示中は、Footer が自分の高さを `--toast-offset-overlay` に設定し、通知を Footer の上に表示する（Patterns Integration Review で追加。OVL-1、OVL-2）。`Toaster` は `--toast-offset-bottom` と `--toast-offset-overlay` の大きい方を使うため、製品が画面の下の固定の操作に設定した `--toast-offset-bottom` は上書きされない。Footer を閉じると設定を外す。
  - 対象：通知の表示の範囲と横に重なる Footer。狭い画面（40rem 未満）では下の全幅、それ以上では右下の 22.5rem（右から 1.5rem）。デスクトップの右の Sheet（保存のボタンが右下にある）は対象になり、左の Sheet は通常は対象にならない。上から開く Drawer と Sheet は対象にしない。
  - 変更の前は、狭い画面の Drawer の下部の操作（保存など）と、デスクトップの右の Sheet の Footer の保存のボタンに、操作つきの通知が重なり、閉じるまで押せなかった（全体統合検品のスクリーンショットと、Patterns Integration Review の監査で確認）。検品は `preview/tests/overlays.spec.ts` の `toast above overlay footers`（390px と 320px の Drawer、右と下の Sheet）。
  - Footer の上に表示しても、通知は Drawer と Sheet の内容（入力欄）の一部を覆う。Drawer と Sheet の中で完結する操作の結果は、通知ではなく、中の表示（状態の文、Field の説明）で伝える（`#/drawer` の「Drawer の中の結果」）。通知は、閉じた後の結果か、閉じた後も残る必要がある結果に使う。
- 動きを減らす設定では、位置を動かさず、透明度だけで表示・非表示する。

```tsx
// アプリ全体を ToastProvider で囲み、Toaster を 1 つ置く
<ToastProvider>
  <App />
  <Toaster />
</ToastProvider>

const { toast } = useToast()
toast({ variant: "success", title: "請求書を送信しました" })
toast({ id: "bulk-failed", variant: "destructive", title: `${n} 件を送信できませんでした` })
```

### 実際のスクリーンリーダーで未確認の事項

自動の検品では、属性（`role`、`aria-live`、`aria-hidden`、`inert`）と、読み上げ用の領域に入る文までを確認した。次は未確認である。

- 失敗の通知のタイトルと説明が、VoiceOver や NVDA で即時に読み上げられるか
- 操作つきの通知で、操作のボタンの名前がどう伝わるか（読み上げ用の領域には含まれない）
- F6 で通知の領域へ移ったときの読み上げ

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 画面の変化でわかる結果に毎回出す | 注意を奪う | 出さない |
| 重大なエラーを Toast だけで伝える | 消えると確認できない | 画面にも残す |
| 同じ通知を何件も重ねる | 内容が読めない | `id` で 1 つにまとめる |
| 通知にフォーカスを移す | 作業が中断される | フォーカスは移さない |
