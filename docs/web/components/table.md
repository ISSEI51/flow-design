# Table

構造化された情報を、行と列で読みやすく表示する。並べ替えや選択などの操作が必要な一覧は、Table を元にした [Data Table](data-table.md) を使う。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/table.tsx`](../../../registry/components/ui/table.tsx) |
| 元にした実装 | shadcn/ui の Table |
| 状態 | 初期実装 |

Data Display に共通する判断基準は [data-display.md](data-display.md) にまとめている。

## 1. Purpose

ユーザーが、複数の項目を同じ観点で比べ、必要な値を見つけられるようにする。

## 2. Usage

- 行が同じ種類のもの（顧客、請求書など）で、列が同じ観点（金額、日付など）の情報に使う。
- 見た目を `variant` で選ぶ。情報量が少ない表は横線（`lines`）、列や行が多い表は交互の背景色（`striped`）にする。6 列以上、または 10 行以上を、交互の背景色を検討する初期の目安とする（[data-display.md](data-display.md#1-横線と交互の背景色)）。
- `variant` は件数から自動で決めず、画面ごとに製品が指定する。検索、絞り込み、ページ送りで表示件数が変わるたびに見た目が切り替わると、同じ一覧が別のものに見えるため。
- 外枠は付けないことを標準とする。独立した表として周りの内容と区別する必要がある場合だけ `bordered` を指定する。
- Table 全体を Card で囲まない。区切りは余白と見出しで表す（美的基準 03）。
- 見出しと値の 2 列だけの情報（詳細画面の項目など）には、Table ではなく説明リスト（`dl`）を使う。

## 3. Anatomy

| 部分 | 値 | トークン・クラス |
| --- | --- | --- |
| 外側の要素（`data-slot="table-container"`） | 表の中だけを横にスクロールする。ページ全体は横にスクロールしない | `overflow-x-auto` |
| 見出しのセル（`TableHead`） | 高さ 40px、文字 12px・太さ 500、`muted-foreground`、左右の余白 16px、下に 1px の線 | `h-10`、`text-caption font-medium`、`px-4`、`border-border` |
| 本文のセル（`TableCell`） | 文字 14px、左右の余白 16px、最小の高さは `density` で決まる | `text-ui`、`px-4`、`h-table-row` |
| 横線（`lines`） | 本文の行の間に 1px の線 | `border-b border-border` |
| 交互の背景色（`striped`） | 偶数行を `muted`。本文の横線は省き、見出しの下の線は残す | `--table-row-base: var(--muted)` |
| 外枠（`bordered`） | 角丸 12px、1px の線。最後の行の横線は外枠と重ねない | `rounded-md border border-border` |
| 背景、影 | `background`、影なし | `bg-background` |

行の背景は、セルが CSS 変数 `--table-row-bg` で塗る。行（`tr`）ではなくセルを塗ることで、固定した列（`position: sticky`）のセルも同じ色になり、横にスクロールした内容が透けない。線も同じ理由で `border-separate` にしてセルに描いている。

## 4. Variants

### 見た目

| `variant` | 使う場面 | 表し方 |
| --- | --- | --- |
| `lines`（既定） | 列や行が少ない | 横線だけ。縦の線は使わない |
| `striped` | 列や行が多い | `background` と `muted` を交互にする。差は控えめにし、文字のコントラストは変えない |

格子状の線（縦と横のすべての線）は、セル単位の編集など明確な理由がある場合の特殊用途とし、v0.1 では提供しない。スプレッドシート型の編集は対象外である。

### 情報の密度

| `density` | 行の最小の高さ | 上下の余白 |
| --- | ---: | ---: |
| `compact` | 36px | 4px |
| `default`（既定） | 48px | 8px |
| `comfortable` | 64px | 12px |

- 行の高さは最小の値である。複数行の文字や、ブラウザの文字の拡大で行が伸びる。
- 文字の大きさは、どの密度でも 14px のまま変えない。
- 指で操作する端末（`pointer: coarse`）では、操作できる行（`interactive` の行）を `compact` でも 48px 以上にする。
- 高さは Component トークン `--table-row-height` で決まる。`density` は外側の要素でこの値を上書きする。

### セルの配置

`TableHead` と `TableCell` の `align` で指定する。HTML の `align` 属性は出力せず、クラスに置き換える。

| 内容 | `align` | 補足 |
| --- | --- | --- |
| 文字 | `left`（既定） | |
| 金額、数量 | `right` | `tabular-nums` が付き、桁の幅がそろう |
| Checkbox、行の操作 | `center` | Checkbox のセルは幅 48px になる |
| 電話番号、識別子 | `left` | 数値として比べないため右寄せにしない。桁をそろえる場合は `tabular-nums` を付ける |

- 単位と日付の表記は、列の中でそろえる（例：すべて「12,000円」、すべて「2026/11/25」）。
- 値がないことは `TableNoValue` で示す。画面には「—」、支援技術には `label`（既定は「未登録」）を伝える。空欄や 0 にしない。0 は値として表示する。
- 長い文字は、折り返して表示することを標準とする（`[word-break:auto-phrase]`）。列の幅を保つ必要がある場合だけ `TableTruncate` で 1 行に省略する。完全な内容はポインターでは `title` で示し、キーボードとタッチでは行の詳細などで確認できるようにする。

### 行の状態

| 状態 | 条件 | 表し方 |
| --- | --- | --- |
| 通常 | | `--table-row-base`（`background` か、交互の背景色の `muted`） |
| ホバー | `interactive` の行だけ | 面に `foreground` を 4% 混ぜる |
| 選択中 | `data-state="selected"` | `background` に `primary` を 12% 混ぜた面。交互の背景色より優先する |
| 選択中のホバー | | `primary` を 16% 混ぜた面 |
| 詳細を表示中 | `data-active` | ホバーと同じ面と、先頭のセルの内側に 2px の `primary` の線。`aria-current="true"` |

- ホバーの面は、行を押して何かが起きる場合（`interactive`）だけに付ける。詳細を表示できない行を押せるように見せない。
- 選択中、ホバー中、詳細を表示中の行では、`--muted-foreground` を `foreground` 75% と `background` 25% の混色（標準の色で #585858）に変える。面が濃くなっても、補足の文字が 4.5:1 以上になる。標準の色での計算値は次のとおりである。

| 面 | 面の色 | 元の `muted-foreground`（#6e6e6e） | 変更後（#585858） | `foreground` |
| --- | --- | ---: | ---: | ---: |
| ホバー（`background` の行） | #f6f6f6 | 4.72 | 6.61 | 15.09 |
| ホバー（`muted` の行） | #ececec | 4.33 | 6.07 | 13.85 |
| 選択中 | #e5e5e5 | 4.05 | 5.67 | 12.93 |
| 選択中のホバー | #dcdcdc | 3.73 | 5.22 | 11.91 |
- 選択中の面の色は `--table-row-selected` などの変数で決まり、製品が上書きできる。
- 状態を表す色（`success`、`destructive` など）の文字をセルに置かない。選択中の面の上で 4.5:1 を下回る場合がある。色の印と `foreground` の文字を組み合わせる（例：緑の丸と「契約中」）。

## 5. Behavior

- HTML の `table`、`thead`、`tbody`、`th`、`td`、`caption` を使う。見出しと値の関連付けはブラウザが行う。
- 通常の Table を ARIA の `grid` に変えない。`grid` は矢印キーでセルを移動する操作を前提にしており、読むための表では操作が増える。
- 表の名前は `TableCaption` で付ける。画面に見出しがある場合は `className="sr-only"` で支援技術だけに伝えてもよい。
- 行の中の Checkbox は、セル全体が押せる範囲になる。範囲はセルの中に収まり、上下の行と重ならない（Checkbox の `after` 疑似要素の基準をセルにしている）。
- 外側の要素の幅より表が広い場合は、表の中だけが横にスクロールする。`overscroll-x-contain` により、スクロールが端に達してもページの戻る操作などに伝わらない。

```tsx
<Table variant="striped" density="compact">
  <TableCaption className="sr-only">今月の請求</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead>会社名</TableHead>
      <TableHead align="right">金額</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>株式会社青葉製作所</TableCell>
      <TableCell align="right">12,000円</TableCell>
    </TableRow>
    <TableRow>
      <TableCell>みなと商事</TableCell>
      <TableCell align="right">
        <TableNoValue label="未設定" />
      </TableCell>
    </TableRow>
  </TableBody>
</Table>
```

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 件数で `variant` を自動に切り替える | 絞り込みやページ送りのたびに見た目が変わり、別の一覧に見える | 画面ごとに製品が指定する |
| 通常の一覧に格子状の線を引く | 線が多くなり、値より線が目立つ | 横線か交互の背景色 |
| 表全体を Card で囲む | 区切りの手段が重なり、画面が重くなる | 余白と見出しで区切る。必要な場合だけ `bordered` |
| 欠損を空欄や 0 で表す | 0 と区別できない | `TableNoValue` |
| 金額を左寄せにする、桁の幅をそろえない | 桁を比べにくい | `align="right"` |
| 状態の色の文字をセルに置く | 選択中の面でコントラストが足りない。色だけで伝わる | 色の印と文字 |
| 密度を上げるために文字を小さくする | 読みにくくなる | `density="compact"` で余白を減らす |
| 長い文字を理由なく省略する | 判断に必要な内容が見えない | 折り返す。省略する場合は完全な内容を確認できるようにする |
