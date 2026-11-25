# Drawer

主にモバイルで、短い補助操作や選択を画面の下から表示する。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/drawer.tsx`](../../../registry/components/ui/drawer.tsx) |
| 元にした実装 | shadcn/ui の Drawer（Base UI 版。Base UI の Drawer を使う） |
| 依存 | `@base-ui/react`、`lucide-react`、[Button](button.md)、[`cn()`](../../../registry/lib/utils.ts) |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、片手で届く画面の下側で、短い補助操作を終えられるようにする。

## 2. Usage

- 共有、並べ替え、短いメモの追加など、選ぶとすぐに終わる操作に使う。
- 取り消せない操作の確認には、モバイルでも [Alert Dialog](alert-dialog.md) を使う。スワイプで閉じられ、確認の重さが伝わらないため。
- モバイルだからという理由だけで、Dialog を Drawer に変えない（[overlays.md](overlays.md#4-モバイルでの使い分け)）。
- 長い詳細やフォームには、全画面の [Sheet](sheet.md) を使う。

### 実装の選び方

shadcn/ui の Base UI 版の Drawer は、Base UI の `Drawer` を使っている（Radix UI 版は vaul を使う）。Flow Design もこれに従い、追加の依存パッケージを使わない。Base UI の `Drawer` は Dialog を拡張したもので、スワイプ、ソフトウェアキーボードへの対応、内部のスクロールとスワイプの切り分けを持つ。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 背景 | 黒 40%、ぼかしなし。スワイプの量に合わせて薄くなる | `bg-black/40` |
| 面（`DrawerContent`） | 下から開く（既定）。上の角だけ 20px で丸める。`background` | `rounded-t-xl`、`bg-background` |
| 高さ | 内容に合わせる。画面の 90% まで | `max-h-[90dvh]` |
| 幅 | 画面の幅。640px 以上の幅では 640px まで | `sm:max-w-[40rem]` |
| ハンドル | 32 × 4px、完全な角丸、`border-strong`。上端から 8px | `w-8 h-1 rounded-full` |
| ヘッダー、内容、フッター | 余白 24px。内容（`DrawerBody`）だけスクロールする | `px-6`、`pt-6` |
| 閉じるボタン | 右上、Lucide の X | [Button](button.md) の `icon-sm` |
| 開閉 | 240ms、画面の下から移動する | `duration-(--duration-slow)` |

- 下端のフッター（`DrawerFooter`）と、フッターがないときの `DrawerBody` は、`env(safe-area-inset-bottom)` の分だけ余白を足す。
- ハンドルはスワイプできることを示す飾りで、支援技術には読ませない（`aria-hidden`）。スワイプだけに閉じる操作を頼らず、閉じるボタンを置く。

```tsx
<Drawer>
  <DrawerTrigger render={<Button variant="secondary" />}>請求書を共有</DrawerTrigger>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>請求書を共有</DrawerTitle>
      <DrawerDescription>2026 年 11 月分（山田商事）</DrawerDescription>
    </DrawerHeader>
    <DrawerBody>
      <DrawerClose render={<Button variant="ghost" />}><Link />リンクをコピー</DrawerClose>
    </DrawerBody>
  </DrawerContent>
</Drawer>
```

## 4. Variants

| props | 既定 | 内容 |
| --- | --- | --- |
| `swipeDirection` | `down` | 閉じるスワイプの向き。`up`、`left`、`right` も指定できる（shadcn/ui と同じ）。ハンドルは `down` のときだけ表示する |
| `showCloseButton` | `true` | 閉じるボタン |
| `showHandle` | `true` | ハンドル |
| `modal` | `true` | `false` にすると背景を暗くせず、背景を操作できる |

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| 開く | 背景の操作とスクロールを止める。フォーカスを中に移し、閉じ込める |
| 下へスワイプ | 閉じる。内容がスクロールできる間はスクロールし、上端に達してから閉じる |
| Escape、閉じるボタン、`DrawerClose` | 閉じる |
| 外側のクリック | 閉じる（未保存の変更がない場合） |
| 閉じた後 | フォーカスをトリガーに戻す |

- 未保存の変更があるときは、`unsavedChanges` を渡す。外側のクリックでは閉じず、Escape、閉じるボタン、スワイプでは `onDiscardRequest` を呼ぶ（[overlays.md](overlays.md#2-閉じる操作と未保存の変更)）。スワイプした面は元の位置に戻る。
- Android の Chromium では、戻る操作を Base UI が `CloseWatcher` で受ける。戻る操作が続いた場合、ブラウザは閉じる要求の取り消しを認めないため、未保存の内容があっても閉じる。下書きの保存などは製品が担う。
- 横にスクロールする要素など、スワイプさせたくない要素には `data-base-ui-swipe-ignore` を付ける（Base UI）。
- ソフトウェアキーボードが開いたときは、Base UI の `VirtualKeyboardProvider` が、フォーカスした入力欄を表示範囲に保つ。`DrawerContent` が内部で使う。
- 動きを減らす設定では、移動せずに表示し、開閉の時間を 0ms にする。スワイプ中は指の位置に合わせて動く。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 取り消せない操作の確認を Drawer にする | スワイプで閉じられ、確認の重さが伝わらない | Alert Dialog |
| すべての Dialog を、モバイルでは Drawer にする | 画面ごとに操作の形が変わる（原則 06） | 内容で選ぶ |
| 閉じる操作をスワイプだけにする | 気付けない人、スワイプできない人が閉じられない（原則 08） | 閉じるボタンを残す |
| 長いフォームを Drawer に入れる | キーボードと固定の部分で、入力欄が見える範囲が狭くなる | 全画面の Sheet か専用のページ |
| 入力がある Drawer を、スワイプで閉じられるままにする | 意図しない操作で入力が失われる | `unsavedChanges` を渡す |
