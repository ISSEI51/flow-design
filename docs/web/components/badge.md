# Badge

状態や分類を短い文字で示す。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/badge.tsx`](../../../registry/components/ui/badge.tsx) |
| 元にした実装 | shadcn/ui の Badge（Base UI 版） |
| 状態 | v0.1 確定 |

## 1. Purpose

一覧や詳細で、ユーザーが対象の状態を読まずに見分けられるようにする。

## 2. Usage

- 状態（送信済み、送信失敗など）と、分類（業種など）に使う。
- 色だけで伝えず、短い文字で状態を書く。
- 同じ意味の状態には同じ種類を使う。分類には Neutral を使う。
- 操作に使わない。押せる見た目にしない。Button の代わりにしない。
- 意味のない Badge を増やさない（原則 04）。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 高さ | 24px（1 行のとき） | `min-h-6` |
| 角丸 | Full Radius | `rounded-full` |
| 境界線 | 1px、文字と同じ色 | `border border-current` |
| 背景 | 透明 | `bg-transparent` |
| 文字 | 12px、太さ 500 | `text-caption font-medium` |
| 左右の余白 | 8px | `px-2` |
| アイコン（任意） | 16px、文字との間隔 4px | `size-4`、`gap-1` |
| 影 | なし | |

## 4. Variants

| 種類 | `variant` | 文字と境界線 | 用途 |
| --- | --- | --- | --- |
| Neutral | `neutral`（既定） | `muted-foreground` | 一般的な分類、未設定 |
| Success | `success` | `success` | 成功、正常、完了 |
| Warning | `warning` | `warning` | 注意、期限接近 |
| Destructive | `destructive` | `destructive` | エラー、失敗、危険 |
| Info | `info` | `info` | 情報、処理中 |

shadcn/ui との互換のために、`default`、`secondary`、`outline` も受け付ける。いずれも Neutral と同じ見た目になる。shadcn/ui の `ghost` と `link` は、Badge を操作に使わないため提供しない。

## 5. Behavior

- 長い文字は省略せずに折り返す。日本語は文節で折り返す。
- `render` で描画する要素を変えられる（shadcn/ui と同じ）。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 分類に Success や Destructive を使う | 状態の色の意味が崩れる | Neutral |
| 淡い背景や塗りつぶしにする | 画面が騒がしくなる（美的基準 01） | 境界線タイプ |
| Badge を押せるようにする | 操作できるかどうかがわからない | Button |
| 色だけで状態を伝える | 色を見分けられない人に伝わらない | 文字で状態を書く |
