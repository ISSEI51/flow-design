# Switch

押した時点で反映する ON/OFF の設定に使う。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/switch.tsx`](../../../registry/components/ui/switch.tsx) |
| 元にした実装 | shadcn/ui の Switch（Base UI 版） |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、設定をすぐに切り替え、その結果を位置と色で確認できるようにする。

## 2. Usage

- 保存ボタンのない設定画面の ON/OFF に使う。
- 保存ボタンで一括して反映するフォームでは、Checkbox を使う（[forms.md](forms.md#checkbox-と-switch-の違い)）。
- ラベルは、ON の状態の意味で書く（「入金の遅れを通知する」）。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 本体 | 44×28px、Full Radius | `w-11 h-7`、`rounded-full` |
| 内側の円 | 20px、`background`。ON で右へ 16px 移る | `size-5`、`translate-x-4` |
| ON | `primary` | `bg-primary` |
| OFF | `input`（白い背景の上で 3.45:1、円との差も 3.45:1） | `bg-input` |
| 押せる範囲 | Field の中では行全体（高さ 48px 以上）。単独では 48×48px | `min-h-control`、`after` 疑似要素 |
| 状態の変化 | 120ms | `duration-(--duration-fast)` |

### 互換のための大きさ

| `size` | 本体 | 内側の円 | 用途 |
| --- | --- | --- | --- |
| `default` | 44×28px | 20px | Flow Design の標準 |
| `sm` | 36×20px | 16px | shadcn/ui との互換。表の中など高密度の画面 |

`sm` でも、押せる範囲は 48px を保つ。

## 4. Variants

| 状態 | 表し方 |
| --- | --- |
| OFF | 円が左、`input` の面 |
| ON | 円が右、`primary` の面 |
| 無効 | 透明度 50%。切り替わらない |
| フォーカス | `focus-ring` |
| エラー | 外側に `destructive` の線 |

色だけでなく、円の位置で ON と OFF を区別できる。

## 5. Behavior

- Space キー、本体、ラベルで切り替わる。`role="switch"` と `aria-checked` で支援技術に伝わる。
- 動きを減らす設定では、円は動かずに位置だけが変わる。

### 製品が担うこと

- 保存中は `disabled` にして、二重の切り替えを防ぐ。
- 保存の結果を `role="status"` の文字で知らせる（例：「オンにしました」）。
- 保存に失敗した場合は元の状態に戻し、原因と次の操作を文字で示す（例：「保存できませんでした。通信の状態を確認して、もう一度切り替えてください」）。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 保存ボタンのあるフォームに置く | 押した時点で反映されたように見える | Checkbox |
| 失敗しても ON のままにする | 実際の設定と表示が食い違う | 元に戻し、文字で知らせる |
| ラベルなしで置く | 何の設定かわからない | 必ずラベルを付ける |
