# Alert Dialog

取り消せない操作や重要な判断を、実行する前に確かめる。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/alert-dialog.tsx`](../../../registry/components/ui/alert-dialog.tsx) |
| 元にした実装 | shadcn/ui の Alert Dialog（Base UI 版） |
| 依存 | `@base-ui/react`、[Button](button.md)、[`cn()`](../../../registry/lib/utils.ts) |
| 状態 | 初期実装 |

## 1. Purpose

ユーザーが、操作の結果と取り消せないことを理解したうえで、実行するかどうかを選べるようにする。誤った操作で危険な処理が実行されないようにする。

## 2. Usage

確認の強さは、取り消せるかどうかで決める。すべての削除や保存に確認を求めない（原則 07）。

| 操作 | 確かめ方 |
| --- | --- |
| 通常の保存 | 確かめない。結果を文字で知らせる |
| 元に戻せる軽微な操作 | すぐに実行し、取り消しの手段を示す |
| 取り消せない削除 | Alert Dialog |
| 大量のデータの完全な削除など | Alert Dialog と、対象の名前の入力などの追加の確認 |

追加の確認が必要かどうかは製品が判断する。

- 未保存の変更の破棄を確かめるときにも使う（[overlays.md](overlays.md#2-閉じる操作と未保存の変更)）。
- 入力を伴う編集には [Dialog](dialog.md) を使う。

## 3. Anatomy

Dialog と共通の見た目を使う。

| 部分 | 値 | トークン |
| --- | --- | --- |
| 背景 | 黒 40%、ぼかしなし | `bg-black/40` |
| 面（`AlertDialogContent`） | 幅 480px（`size="sm"` は 360px）、角丸 20px、余白 24px、影 | `rounded-xl`、`p-6`、`shadow-dialog` |
| タイトル | 20px、600。何をするかを問いの形で書く | `text-heading` |
| 説明 | 14px。消える対象と、取り消せないことを書く | `text-ui` |
| キャンセル（`AlertDialogCancel`） | Secondary。左に置く | [Button](button.md) |
| 実行（`AlertDialogAction`） | 危険な操作は Destructive。右に置く | [Button](button.md) |
| 開閉 | 240ms | `duration-(--duration-slow)` |

- 大きな警告のアイコンや飾りのアイコンは置かない。意味はタイトル、説明、ボタンの文字で伝える。shadcn/ui の `AlertDialogMedia` は提供しない。
- 閉じるボタン（X）は置かない。閉じる操作はキャンセルに 1 つにする。

```tsx
<AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
  <AlertDialogTrigger render={<Button variant="destructive" />}>山田商事を削除</AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>山田商事を削除しますか？</AlertDialogTitle>
      <AlertDialogDescription>取引の履歴 24 件と請求書 3 件も削除されます。この操作は取り消せません。</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending}>キャンセル</AlertDialogCancel>
      <AlertDialogAction variant="destructive" loading={pending} onClick={remove}>削除する</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## 4. Variants

| `size` | 幅 | 使う場面 |
| --- | ---: | --- |
| `default` | 480px | 標準 |
| `sm` | 360px | 「変更を破棄しますか？」など、説明が 1 行の確認 |

画面の幅が足りないときは、Dialog と同じく画面の端に 16px を残して縮み、ボタンを均等の幅に広げる。

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| 開く | 背景の操作とスクロールを止める。初期フォーカスを `AlertDialogCancel` に当てる |
| 外側のクリック | 閉じない（Base UI の Alert Dialog） |
| Escape | キャンセルとして閉じる |
| `AlertDialogCancel` | 閉じる |
| `AlertDialogAction` | 閉じる動作を持たない。処理が終わったら、製品が `open` を `false` にする |
| 閉じた後 | フォーカスをトリガーに戻す |

- 役割は `alertdialog`。タイトルが名前、説明が説明として読み上げられる。
- 初期フォーカスを安全な選択肢に当てるため、Enter を続けて押しても危険な処理は実行されない。`AlertDialogCancel` がない場合は、最初の操作できる要素に当てる。変える場合は `initialFocus` を渡す。

### 処理中

- `AlertDialogAction` に `loading` を指定する。Button が二重の実行を防ぎ、`aria-busy="true"` を付ける（[Button](button.md#処理中loading)）。
- 処理中に閉じると結果がわからなくなるため、`AlertDialogCancel` を `disabled` にし、`onOpenChange` で閉じる要求を無視する。
- 開始と完了は `role="status"` の文字で知らせる（例：「山田商事を削除しています」「山田商事を削除しました」）。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 通常の保存に確認を求める | 手順が増え、確認を読まずに押す習慣がつく（原則 07） | すぐに保存し、結果を知らせる |
| 元に戻せる操作に確認を求める | 確認より取り消しの方が速い | すぐに実行し、取り消しの手段を示す |
| タイトルを「確認」、ボタンを「はい」「OK」にする | 何が消えるのかわからない（原則 05） | 「山田商事を削除しますか？」「削除する」 |
| 危険な操作を Primary にする | 通常の操作と区別できない | Destructive にする |
| 初期フォーカスを危険な操作に当てる | Enter の押し間違いで実行される | キャンセルに当てる（既定） |
| 大きな警告のアイコンを置く | 意味が文字と重複し、画面が騒がしくなる（原則 04） | 文字で伝える |
| 処理中にボタンを押せるままにする | 二重に実行される | `loading` を使う |
