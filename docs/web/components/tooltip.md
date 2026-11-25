# Tooltip

アイコンや操作に補足を添える。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/tooltip.tsx`](../../../registry/components/ui/tooltip.tsx) |
| 元にした実装 | shadcn/ui の Tooltip（Base UI 版） |
| 状態 | 初期実装 |

## 1. Purpose

マウスやキーボードで操作するユーザーに、操作の名前や補足を、画面を広げずに示す。

## 2. Usage

- 補足情報に限る。Tooltip がなくても操作の意味がわかる設計を優先する（原則 06）。
- 操作に必要な説明（入力の条件など）は、Tooltip ではなく画面に文字で書く。
- Tooltip の中にリンクやボタンを入れない。
- Base UI の Tooltip は、タッチ操作では開かない。タッチ端末で Tooltip だけに頼らない。
- アイコンだけのボタンには、Tooltip とは別に `aria-label` で名前を付ける。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 背景 | 濃いニュートラル | `bg-foreground` |
| 文字 | 白、12px | `text-background`、`text-caption` |
| 角丸 | 8px | `rounded-sm` |
| 余白 | 縦 8px、横 12px | `py-2 px-3` |
| 最大の幅 | 320px。超えると折り返す | `max-w-xs` |
| トリガーとの間隔 | 8px | `sideOffset={8}` |
| 影 | `shadow-menu` | |
| 表示・非表示 | 120ms | `duration-(--duration-fast)` |

色は `foreground` と `background` を使うため、`--primary` を変えても Tooltip の色は変わらない。

## 4. Variants

種類はない。表示する向きは `side`（既定は `top`）で指定する。

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| ポインターを 700ms 重ねる | 表示する |
| キーボードでフォーカスする | 表示する |
| Tooltip の上にポインターを移す | 表示を続ける |
| Esc | 閉じる |
| ポインターを外す、フォーカスを外す | 閉じる |

- 時間の経過では閉じない。読み終える前に消えない。
- 画面の端では、はみ出さないように位置と向きを変える（`collisionPadding` 8px）。
- 動きを減らす設定では、大きさの変化をやめ、透明度だけで表示する。
- 遅延の 700ms は `TooltipProvider` と `TooltipTrigger` の既定値である。shadcn/ui の `TooltipProvider` の既定は 0ms で、Flow Design では変えている。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 入力の条件を Tooltip だけで示す | タッチ操作や読み上げで伝わらない | 画面に文字で書く |
| Tooltip にリンクやボタンを入れる | ポインターを動かすと閉じ、操作できない | Popover（将来）や画面の文字 |
| 文字のあるボタンに同じ文の Tooltip を付ける | 同じ情報が重なる（原則 04） | 付けない |
| ブランドカラーの Tooltip | 操作と見分けにくい | 既定の色のまま |
