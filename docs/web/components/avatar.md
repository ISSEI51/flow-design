# Avatar

人物や組織を識別する。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/avatar.tsx`](../../../registry/components/ui/avatar.tsx) |
| 元にした実装 | shadcn/ui の Avatar（Base UI 版） |
| 状態 | 初期実装 |

## 1. Purpose

一覧や履歴で、誰の情報か、どの組織かを素早く見分けられるようにする。

## 2. Usage

- 名前の横に置く。人の区別は名前で行い、Avatar は補助にする。
- 表示の順番は、1. 登録された画像、2. 名前の頭文字、3. Lucide のアイコン（人物は User、組織は Building2）。
- 人ごとにランダムな背景色を付けない。

## 3. Anatomy

| 大きさ | `size` | 頭文字の文字 |
| --- | --- | --- |
| 24px | `xs` | 12px |
| 32px | `sm` | 12px |
| 40px | `default` | 14px |
| 48px | `lg` | 14px |
| 64px | `xl` | 16px |

| 部分 | 値 |
| --- | --- |
| 形 | 円（`rounded-full`、`overflow-hidden`） |
| 画像 | `object-fit: cover`。縦横比が違っても円に切り抜く |
| 頭文字・アイコン | 背景 `muted`、文字 `muted-foreground`（4.68:1） |
| 影 | なし |

shadcn/ui の大きさは `sm` 24px、`default` 32px、`lg` 40px である。Flow Design は名前を同じにし、標準を 40px にしたため、同じ名前でも値が異なる。

## 4. Variants

| 状態 | 表示 |
| --- | --- |
| 画像あり | 画像 |
| 画像なし、読み込み中、取得の失敗 | `AvatarFallback` の頭文字。頭文字がなければアイコン |

`getInitials(name)` で頭文字を作れる。英字の名前は姓名の頭文字 2 文字（Hanako Yamada → HY）、日本語の名前は先頭の 1 文字（山田 花子 → 山）。法人格（株式会社など）は除く。

## 5. Behavior

- 画像の取得に失敗した場合も、Base UI が `AvatarFallback` を表示する。
- 大きさは固定のため、画像の読み込み前後でレイアウトは変わらない。
- 既定では読み上げない（`aria-hidden`）。隣に名前を表示したとき、同じ名前を 2 回読み上げないため。
- 単独で表示する場合は `label` で名前を付ける（`role="img"`、`aria-label`）。
- `AvatarGroup` で重ねて並べる場合は、グループに `role="img"` と、全員の名前を含む `aria-label` を付ける。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 人ごとにランダムな背景色 | 色に意味がなく、画面が騒がしくなる | `muted` にそろえる |
| 四角や角丸の Avatar | 形がそろわない | 円形だけを使う |
| 名前の横の Avatar にも名前を読み上げさせる | 読み上げが重複する | 既定のまま（`aria-hidden`） |
| 画像がないときに空の円を出す | 誰かわからない | 頭文字かアイコンを出す |
