# Alert

画面の中で、継続して示す必要がある重要な情報、注意、エラーを伝える。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/alert.tsx`](../../../registry/components/ui/alert.tsx) |
| 元にした実装 | shadcn/ui の Alert |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、今何が起きているかと、次に何をすればよいかを、画面を見ている間ずっと確認できるようにする。

## 2. Usage

- 何が起きているかを書く（タイトル）。対応が必要な場合は、原因と次の操作を書く（説明、`AlertAction`）。
- 入力項目に固有のエラーは、Alert ではなく FieldError にする。
- 一時的な結果は Toast にする。
- 不必要な Alert を増やさない。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 面 | 背景 `background`、境界線 1px `border`、角丸 12px、余白 16px | `rounded-md`、`p-4` |
| アイコン | 20px。種類の色。文字との間隔 12px | `size-5`、`gap-x-3` |
| タイトル | 14px、太さ 500、`foreground` | `text-ui font-medium` |
| 説明 | 14px、太さ 400、`muted-foreground` | `text-ui` |
| タイトルと説明の間隔 | 4px | `gap-y-1` |
| 操作（`AlertAction`） | 説明の下、8px あける | `mt-2` |
| 影 | なし | |

## 4. Variants

| 種類 | `variant` | アイコン |
| --- | --- | --- |
| Neutral | `neutral`（既定） | Info（`muted-foreground`） |
| Success | `success` | CircleCheck（`success`） |
| Warning | `warning` | TriangleAlert（`warning`） |
| Destructive | `destructive` | CircleAlert（`destructive`） |
| Info | `info` | Info（`info`） |

- 重大なエラーでも、強い背景色や左側の線で装飾しない。
アイコンの指定は次のとおり。どの方法でもアイコンは 1 つだけ表示される。

| 指定 | 表示 | 位置づけ |
| --- | --- | --- |
| `variant` だけ | 種類に対応するアイコン | Flow Design の標準 |
| `icon={<BellRing />}` | 渡したアイコン（色は種類の色） | Flow Design の標準 |
| 子要素の先頭に `<CircleAlert />` | 子要素のアイコン。自動のアイコンは隠れる | shadcn/ui との互換 |
| `icon={false}` | アイコンなし。タイトルは左端から始まる | Flow Design の標準 |

子要素のアイコンは、Alert の直下の `svg` を CSS で判定する。アイコンを別の要素で囲んで渡した場合は判定できないため、`icon` に渡す。
- shadcn/ui の `variant="default"` は Neutral と同じ見た目になる。

## 5. Behavior

- 既定では `role` を付けない。shadcn/ui の Alert は `role="alert"` を既定にしているが、最初から表示している説明まで読み上げを割り込ませないため、Flow Design では外している。
- 操作の結果として表示する重要なエラーには、製品が `role="alert"` を付ける。成功の結果には `role="status"` を付ける。

```tsx
<Alert variant="warning">
  <AlertTitle>送付先が未設定の顧客が 3 件あります</AlertTitle>
  <AlertDescription>送付先を設定するまで、これらの顧客には請求書を送信できません。</AlertDescription>
  <AlertAction>
    <Button size="sm" variant="secondary">送付先を設定</Button>
  </AlertAction>
</Alert>
```

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 「エラーが発生しました」だけ | 何が起きたか、どうすればよいかわからない | 原因と次の操作を書く |
| 強い背景色、左側の線 | 装飾が強く、画面の静けさを損なう | 無彩色の面と色の付いたアイコン |
| 静的な説明をすべて `role="alert"` にする | 読み上げが割り込む | 動的な重要エラーだけに付ける |
| 入力項目のエラーを Alert にする | どの項目の問題かわからない | FieldError |
