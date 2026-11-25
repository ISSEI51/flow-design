# Card

独立した意味を持つ情報をまとめる。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/card.tsx`](../../../registry/components/ui/card.tsx) |
| 元にした実装 | shadcn/ui の Card（Base UI 版、base-nova スタイル） |
| 依存 | [`cn()`](../../../registry/lib/utils.ts) |
| 状態 | 初期実装 |

## 1. Purpose

単独で読まれ、比べられる情報（KPI、商品、企業など）を、ひとまとまりとして認識できるようにする。Card を使わなくてもまとまりがわかる場合は、使わないことを優先する（原則 04、美的基準 03）。

## 2. Usage

| 場面 | 使うもの |
| --- | --- |
| KPI を並べる | Card（`size="sm"`） |
| 商品、プラン、企業など、個別の対象を並べて比べる | Card |
| 通常の文章、フォーム | 囲まない。見出しと余白で整理する |
| テーブル全体 | 囲まない |
| Card の中の情報の区切り | 余白、文字の強弱、必要なら [Separator](separator.md)。Card を重ねない |

区切り方の順序は [Navigation & Layout](navigation-layout.md#4-情報の区切り方) を参照する。

## 3. Anatomy

| 部分 | 役割 |
| --- | --- |
| `Card` | 面。`size`（`sm` / `default` / `lg`） |
| `CardHeader` | タイトル、説明、操作 |
| `CardTitle` | タイトル |
| `CardDescription` | 補足の文字 |
| `CardAction` | 右上の操作 |
| `CardContent` | 内容 |
| `CardFooter` | 下の操作。区切り線と背景は付けない |

| 項目 | 値 | トークン |
| --- | --- | --- |
| 背景、文字 | `card`、`card-foreground` | `bg-card`、`text-card-foreground` |
| 境界線 | 1px、`border` | `border-border` |
| 角丸 | 20px（`lg` は 24px） | `rounded-xl`、`rounded-2xl` |
| 内側の余白 | 24px（`sm` は 16px、`lg` は 32px） | `p-6`、`p-4`、`p-8` |
| 部分どうしの間 | 16px | `gap-4` |
| タイトル | 20px、太さ 600（`sm` は 16px、太さ 600） | `text-heading` |
| 説明 | 14px、`muted-foreground` | `text-ui` |
| 影 | なし | |

## 4. Variants

| `size` | 余白 | 角丸 | タイトル | 使う場面 |
| --- | ---: | ---: | --- | --- |
| `sm` | 16px | 20px | 16px、600 | KPI、一覧の中の小さな Card |
| `default` | 24px | 20px | 20px、600 | 標準 |
| `lg` | 32px | 24px | 20px、600 | プランの比較など、画面の主題になる大きな Card |

`lg` は Flow Design で追加した大きさである。shadcn/ui の `size` は `default` と `sm` だけである。

### 操作できる Card

Card 全体を押せる場合は、タイトルをリンクにし、疑似要素（`after:absolute after:inset-0`）で押せる範囲を Card 全体に広げる。Card に `has-[a:hover]:bg-accent` と `has-[a:focus-visible]:focus-ring` を付け、情報を表示するだけの Card と区別する。リンクの名前はタイトルになる。この Card の中には、他の操作を置かない。

## 5. Behavior

- タイトルと内容は省略せずに折り返す。
- 並べる場合は、画面の幅に合わせて列の数を変える（例：`grid sm:grid-cols-2 xl:grid-cols-4`）。同じ行の Card は高さがそろう。
- Card は状態を持たない。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 文章やフォームを理由なく Card で囲む | 枠が増え、どれが独立した情報かわからない（美的基準 03） | 見出しと余白で整理する |
| テーブル全体を Card で囲む | 枠が二重になる | テーブルだけを置く |
| Card の中に Card を重ねる | 階層が読み取れない | 余白、文字の強弱、Separator で整理する |
| Card に影を付ける | 浮いている要素と区別できない | 影は Popover、Dialog など浮かぶ要素に限る |
| 押せる Card と表示だけの Card を同じ見た目にする | 押せるかどうかがわからない | ホバーとフォーカスの表示を付ける |
| 説明文でタイトルを繰り返す | 同じ意味を繰り返す（原則 04） | タイトルだけにする |
