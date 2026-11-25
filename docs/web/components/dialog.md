# Dialog

今の画面から移動せずに、短い入力や編集を終えるために使う。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/dialog.tsx`](../../../registry/components/ui/dialog.tsx) |
| 元にした実装 | shadcn/ui の Dialog（Base UI 版） |
| 依存 | `@base-ui/react`、`lucide-react`、[Button](button.md)、[`cn()`](../../../registry/lib/utils.ts) |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、今の画面の文脈を失わずに、短い入力や編集を終えられるようにする。終わったら、開く前の場所とフォーカスに戻る。

## 2. Usage

- 担当者の変更、メモの追加など、数項目で終わる入力と確認に使う。
- 取り消せない操作の確認には [Alert Dialog](alert-dialog.md) を使う。
- 一覧からの詳細の確認や編集には [Sheet](sheet.md) を使う。
- 長い作業、複雑な編集、URL で直接開く必要がある内容は、専用のページにする。
- モバイルでも、短い確認は中央の Dialog にする。モバイルだからという理由だけで Drawer に変えない（[overlays.md](overlays.md#4-モバイルでの使い分け)）。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 背景（`DialogOverlay`） | 黒 40%、ぼかしなし | `bg-black/40` |
| 面（`DialogContent`） | 角丸 20px、余白 24px、`popover`、影 | `rounded-xl`、`p-6`、`bg-popover`、`shadow-dialog` |
| タイトル（`DialogTitle`） | 20px、600 | `text-heading` |
| 説明（`DialogDescription`） | 14px、`muted-foreground` | `text-ui` |
| 閉じるボタン | 右上、Lucide の X。Ghost の `icon-sm`（40px） | [Button](button.md) |
| 内容（`DialogBody`） | 画面の高さを超えるとき、この部分だけスクロールする | |
| 操作ボタン（`DialogFooter`） | 右寄せ、ボタンの間隔 8px | `gap-2` |
| 部分の間隔 | 24px | `gap-6` |
| 開閉 | 240ms、透明度と大きさ（95% から） | `duration-(--duration-slow)`、`ease-enter`、`ease-exit` |

```tsx
<Dialog>
  <DialogTrigger render={<Button variant="secondary" />}>担当者を変更</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>担当者を変更</DialogTitle>
      <DialogDescription>山田商事の担当者を、佐藤 花子に変更します。</DialogDescription>
    </DialogHeader>
    <DialogBody>{/* 入力欄など */}</DialogBody>
    <DialogFooter>
      <DialogClose render={<Button variant="secondary" />}>キャンセル</DialogClose>
      <Button type="submit">担当者を変更</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- フォームにする場合は、`<form className="contents">` で `DialogHeader`、`DialogBody`、`DialogFooter` を囲む。`contents` にすると、Dialog の配置とスクロールが保たれる。
- タイトルは必ず置く。Dialog のアクセシブルな名前になる。
- 内容は `DialogBody` に入れる。`DialogBody` を使わずに内容が画面の高さを超えると、Dialog 全体がスクロールし、閉じるボタンと操作ボタンが画面の外に出る。

## 4. Variants

### 大きさ

| 大きさ | `size` | 最大幅 | 使う場面 |
| --- | --- | ---: | --- |
| Small | `sm` | 360px | 1 項目の入力、短い確認 |
| Default | `default` | 480px | 標準。数項目の入力 |
| Large | `lg` | 640px | 2 列の入力、長い説明 |
| Extra Large | `xl` | 800px | 取り込む内容の確認など、表を含むもの |

- 画面の幅が足りないときは、画面の端に 16px（640px 以上の幅では 24px）を残して縮む。
- 高さは内容に合わせる。画面の高さを超えるときは、ヘッダーと操作ボタンを残して `DialogBody` がスクロールする。

### 操作ボタン

- 右寄せにし、キャンセルを左、主要な操作を右に置く。
- 補助の操作は Secondary を使う。主要な操作は 1 つだけ Primary にする（[Button](button.md#種類の選び方)）。
- 640px 未満の幅では、ボタンを均等の幅に広げる。ボタンの文字は折り返す。

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| 開く | 背景の操作とスクロールを止める（モーダル）。フォーカスを中の最初の操作できる要素に移す |
| タッチで開く | 入力欄ではなく Dialog 自体にフォーカスを移す。意図せずソフトウェアキーボードが開くのを防ぐ（Base UI の既定） |
| Tab | Dialog の中だけを移動する |
| Escape、閉じるボタン、`DialogClose` | 閉じる |
| 外側のクリック | 閉じる（未保存の変更がない場合） |
| 閉じた後 | フォーカスを開く前の要素（トリガー）に戻す |

### 未保存の変更

| props | 内容 |
| --- | --- |
| `unsavedChanges` | 未保存の変更がある。製品が判断して渡す |
| `onDiscardRequest` | `unsavedChanges` のときに、Escape、閉じるボタン、`DialogClose` が押された。破棄を確かめる Alert Dialog を開く |

`unsavedChanges` が `true` のときは、外側のクリックでは閉じない。`unsavedChanges` を渡す場合は `onDiscardRequest` が必須で、指定漏れは型エラーと開発時の警告で検出する。確認を出さない場合は `onDiscardRequest={null}` と明示し、外側のクリックだけを止める。保存中の扱い、閉じる要求が続く場合、保護する範囲（ブラウザの戻る操作、ページの移動などは製品の責務）は [overlays.md](overlays.md#2-閉じる操作と未保存の変更) にまとめている。

- 初期フォーカスを変える場合は、`DialogContent` に `initialFocus` を、戻す先を変える場合は `finalFocus` を渡す（Base UI）。
- 閉じるボタンの名前は `closeLabel`（既定は「閉じる」）で変える。英語の画面では `closeLabel="Close"` にする。
- 入れ子の Alert Dialog が開いている間は、面を 10% 暗くする。
- 動きを減らす設定では、大きさを変えず、開閉の時間を 0ms にする。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 長い作業や複雑な業務を Dialog に詰め込む | 閉じたときに失うものが大きく、URL で戻れない | 専用のページにする |
| タイトルを「確認」、ボタンを「はい」「いいえ」にする | 何が起きるかがわからない（原則 05） | タイトルで目的を、ボタンで押した結果を示す |
| 一覧の詳細を Dialog で開く | 一覧が隠れ、別の行を見るたびに開き直す | 閲覧の Sheet を使う |
| 未保存の変更があるのに、外側のクリックで閉じる | 入力した内容が失われる | `unsavedChanges` を渡す |
| モバイルで入力欄に自動でフォーカスする | 開いた直後にキーボードが画面を覆う | Base UI の既定（タッチでは Dialog 自体にフォーカス）に任せる |
| Dialog の上に、別の Dialog を重ねて作業を続けさせる | どこに戻るのかがわからなくなる | 入れ子は Select、Popover、破棄の確認に限る |
