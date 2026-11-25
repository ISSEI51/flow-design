# Calendar

日付を見て選ぶ。単一の日付、複数の日付、期間を選べる。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/calendar.tsx`](../../../registry/components/ui/calendar.tsx) |
| 元にした実装 | shadcn/ui の Calendar（react-day-picker） |
| 状態 | 初期実装 |

## 1. Purpose

ユーザーが、曜日や前後の日との関係を見ながら、日付や期間を選べるようにする。

## 2. Usage

- 日付を入力する欄には、Calendar を直接置かず [Date Picker](date-picker.md) を使う。Calendar は、日付を見て選ぶこと自体が目的の画面や、Date Picker の中で使う。
- 予定の管理（予定の表示、ドラッグでの移動など）は扱わない。
- 土日や祝日の色は持たない。必要な製品が `modifiers` と `modifiersClassNames` で加える。祝日のデータは製品が持つ。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 日付のセル | 40 × 40px。タッチ操作（`pointer: coarse`）では 48 × 48px。角丸 8px、文字 14px、`tabular-nums` | `--cell-size`、`rounded-sm`、`text-ui` |
| 年月 | 16px、太さ 500。年と月はドロップダウン（ネイティブの select を文字の上に重ねる） | `text-body`、`font-medium` |
| 曜日 | 12px、`muted-foreground` | `text-caption` |
| 前月・翌月のボタン | セルと同じ大きさ。Lucide の ChevronLeft、ChevronRight（20px） | |
| 背景、影 | 透明、なし | |

## 4. Variants

### 日付の状態

| 状態 | 表し方 |
| --- | --- |
| 通常 | 通常の文字 |
| 今日 | 1px の境界線（`border-strong`、背景に対して 3.45:1） |
| 選択中 | `primary` の塗り、`primary-foreground` の文字 |
| 今日を選択 | `primary` の塗りの内側に、`primary-foreground` の 1px の線 |
| 範囲の内部 | `muted` の帯、通常の文字 |
| 範囲の開始・終了 | `primary` の塗り |
| 選択不可 | 透明度 50%。押せない |
| 表示月以外 | `muted-foreground` の文字 |

色だけで状態を伝えない。選択中の日は `aria-selected="true"`、各日付のボタンの名前は「今日、2026年11月25日水曜日、選択済み」のように状態を含む（react-day-picker の日本語のラベル）。

### 選択モード

| `mode` | 用途 |
| --- | --- |
| `single` | 1 つの日付 |
| `multiple` | 複数の日付。もう一度押すと解除する |
| `range` | 期間。開始日と終了日を塗り、間を帯で示す |

最小・最大の日付は `startMonth`、`endMonth`（移動できる月）と `disabled`（`{ before }`、`{ after }`、関数）で指定する。

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| ← →、↑ ↓ | 1 日、1 週間移動する |
| PageUp、PageDown | 1 か月移動する。Shift と一緒に押すと 1 年 |
| Home、End | 週の始まり、終わりへ移動する |
| Enter、Space | 選ぶ |
| 年、月のドロップダウン | 直接移動する。数年前の日付も、前月のボタンを繰り返し押さずに選べる |

- 開始曜日は月曜日を標準にする（`weekStartsOn={1}`）。ロケールや用途に合わせて `weekStartsOn` で変える。
- 年のドロップダウンの範囲は、既定で今日の 100 年前から 10 年後まで。生年月日などは `startMonth` と `endMonth` で指定する。
- 値は日付だけを表す、ローカル時刻の 0 時の `Date` である。`timeZone` は「今日」を決めるためだけに使い、react-day-picker には渡さない（[advanced.md](advanced.md#日付だけの値の扱い)）。
- 月末、年末、うるう年は react-day-picker と date-fns が扱う。
- 動きは使わない。月を移動しても、位置の動きはない。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 今日を塗りで示す | 選択中と区別できない | 今日は境界線、選択中は塗り |
| 生年月日を前月のボタンだけで探させる | 何十回も押す必要がある | 年と月のドロップダウンを使う |
| 祝日の一覧をコンポーネントに入れる | 国や年度、製品によって変わる | 製品が `modifiers` で渡す |
| 選んだ日付を `toISOString()` で送る | タイムゾーンによって前日になる | `toDateString()` で `"YYYY-MM-DD"` にする |
| 狭い画面に 2 か月を並べる | セルが小さくなり押しにくい | 1 か月だけにする（Date Picker は自動で切り替える） |
