# デザイントークン v0.1

Flow Design を Web で実装するときの、余白、文字、角丸、色、境界線、影、動き、高さの値と、その使い分け。

v0.1 は初期仕様である。実際のコンポーネントを使った検品を通じて改善する。技術の構成は [Web 技術スタック](stack.md) に従う。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../diagrams/tokens-dark.svg">
  <img alt="トークンの 3 層。1 Primitive は元の値で、--fd-neutral-0〜900、--fd-radius-xs〜2xl、--fd-font-sans、--spacing（4px）がある。製品はここでニュートラルの色味、角丸、フォントを上書きする。2 Semantic は用途を表す名前で、--background、--primary、--muted-foreground、--text-body、--radius-lg、--shadow-menu などがある。製品はここでブランドカラーと、任意でダークモードを上書きする。3 Component は部品に固有の値で、--control-height、--table-row-height、--focus-ring-width、--icon-stroke-width がある。製品は高密度の画面でここの高さを上書きする。トークンは @theme inline で Tailwind CSS v4 のユーティリティ（bg-primary、text-body、rounded-lg、shadow-menu、h-control、focus-ring など）として公開される。shadcn/ui のコンポーネントは既存のクラスのまま動き、高さとフォーカス表示は各部品の指定に従う。Flow Design のコンポーネントは Registry で配布する予定で、48px の高さと 2px のフォーカス表示を使う。" src="../diagrams/tokens-light.svg">
</picture>

## 基本方針

- 余白は適度に取り、文字の階層をはっきりさせ、角は柔らかく丸める。
- 無彩色を標準とする。ブランドカラーとフォントは製品ごとに変更できる。
- 操作できる部品の高さは 48px を標準とする。
- 影は、浮かぶ要素だけに使う。
- ダークモードを提供するかどうかは、製品ごとに判断する。
- 一貫性を保ちながら、画面に必要な情報の量と機能は削らない。

## 使い方

テーマの CSS は [`registry/foundation/theme.css`](../../registry/foundation/theme.css) にある。将来、Registry の Foundation 層として配布する。配布の形式はまだ決めていない。

製品のグローバル CSS で、次の順に読み込む。shadcn/ui の `init` が生成した `:root`、`.dark`、`@theme inline` のブロックは、このファイルで置き換える。

```css
@import "tailwindcss";
@import "shadcn/tailwind.css";
@import "./flow-design-theme.css";
```

## トークンの 3 層

| 層 | 役割 | 例 |
| --- | --- | --- |
| Primitive | 元の値。コンポーネントからは直接参照しない | `--fd-neutral-500`、`--fd-radius-md`、`--fd-font-sans` |
| Semantic | 用途を表す名前。コンポーネントはこの層を参照する | `--muted-foreground`、`--text-body`、`--radius-md` |
| Component | 部品に固有の値。共通トークンで表せないものだけを置く | `--control-height`、`--focus-ring-width` |

トークンを追加する前に、次の順に確認する。

1. Tailwind CSS の標準の値で表せるか（余白、高さ、アイコンの大きさなど）
2. 既存の Semantic トークンで表せるか
3. 製品や画面によって値を変える必要があるか

3 に当てはまる場合だけ、Component トークンを追加する。

Flow Design が独自に追加した Primitive には `--fd-` を付け、shadcn/ui や Tailwind CSS の変数と名前が重ならないようにしている。Semantic の色は、shadcn/ui の名前をそのまま使う。

## 1. Spacing（余白）

基本単位は 4px。Tailwind CSS の `--spacing`（0.25rem）をそのまま使うため、新しい変数は定義しない。

| 値 | クラスの数値 | 用途 |
| ---: | ---: | --- |
| 0 | `0` | |
| 4px | `1` | 関連する情報どうし |
| 8px | `2` | アイコンと文字、関連する情報どうし |
| 12px | `3` | |
| 16px | `4` | フォームの項目の間 |
| 20px | `5` | |
| 24px | `6` | ページとコンテナの内側、グループの間 |
| 32px | `8` | グループの間、セクションの間 |
| 40px | `10` | セクションの間 |
| 48px | `12` | セクションの間 |
| 64px | `16` | 大きな区切り |
| 80px | `20` | 大きな区切り |
| 96px | `24` | 大きな区切り |

クラスの数値は `p-6`、`gap-2`、`mt-12` のように使う。Tailwind CSS は `p-7`（28px）のような中間の値も生成するが、Flow Design では上の 13 段階だけを使う。

判断の基準：関係の近い情報ほど狭く、関係の遠い情報ほど広くする。同じ関係には同じ値を使う。美的基準 03 のとおり、区切りはまず余白で表す。

## 2. Typography（文字）

| 用途 | クラス | サイズ | Weight | 行の高さ |
| --- | --- | ---: | ---: | ---: |
| Display | `text-display` | 48px（3rem） | 700 | 1.2 |
| Metric | `text-metric` | 36px（2.25rem） | 600 | 1.2 |
| Page Title | `text-page-title` | 28px（1.75rem） | 600 | 1.3 |
| Section | `text-section` | 24px（1.5rem） | 600 | 1.3 |
| Heading | `text-heading` | 20px（1.25rem） | 600 | 1.3 |
| Body | `text-body` | 16px（1rem） | 400 | 1.7 |
| UI Text | `text-ui` | 14px（0.875rem） | 400 | 1.5 |
| Caption | `text-caption` | 12px（0.75rem） | 400 | 1.5 |

- 各クラスは、サイズ、行の高さ、Weight をまとめて指定する。Weight だけを変える場合は `font-medium`（500）などを併用する。Weight は 400、500、600、700 を使う。
- サイズは rem で指定する。ブラウザの文字サイズ設定に合わせて大きくなる。
- 数値を比べる箇所（Metric、テーブルの数値の列）には `tabular-nums` を付け、桁の幅をそろえる。
- フォントは `--fd-font-sans` で指定する。既定値は OS の標準のフォントで、製品ごとに上書きする。
- Tailwind CSS の `text-sm`、`text-base` などは変更していない。shadcn/ui のコンポーネントは、これまでどおりそれらを使う。

## 3. Radius（角丸）

値は Primitive の `--fd-radius-*` に 1 か所だけ書き、`@theme inline` で shadcn/ui と Tailwind CSS のキー名に公開する。

| 用途 | クラス | Primitive | 値 |
| --- | --- | --- | ---: |
| 小さな要素（チェックボックスなど） | `rounded-xs` | `--fd-radius-xs` | 4px |
| 補助的な要素（メニューの項目、タグなど） | `rounded-sm` | `--fd-radius-sm` | 8px |
| 入力欄 | `rounded-md` | `--fd-radius-md` | 12px |
| ボタン | `rounded-lg` | `--fd-radius-lg`（`--radius` を経由） | 14px |
| コンテナ | `rounded-xl` | `--fd-radius-xl` | 20px |
| 大きなコンテナ | `rounded-2xl` | `--fd-radius-2xl` | 24px |
| アバターなど | `rounded-full` | なし（Tailwind CSS の標準） | 円 |

参照の向きは次のとおりである。

```text
--fd-radius-md  →  --radius-md（@theme inline）  →  rounded-md
--fd-radius-lg  →  --radius  →  --radius-lg（@theme inline）  →  rounded-lg
```

`@theme inline` は、生成するユーティリティに `var(--fd-radius-md)` などの参照をそのまま書き出す。そのため、製品が `:root` などで `--fd-radius-*` を上書きすると、対応するクラスの角丸が変わる。`rounded-lg` は、shadcn/ui と同じく `--radius` の上書きでも変わる。

入れ子になる要素では、内側の角丸を「外側の角丸 − 内側の余白」にする。たとえば、角丸 20px、内側の余白 8px のメニューでは、項目の角丸を 12px（`rounded-md`）にする。差が 0 以下になる場合は、内側を角丸なしか `rounded-xs` にする。

この計算は、内側の要素が外側の輪郭に沿って並び、角の曲線が同心円に見える必要がある場合（カードの中の画像、枠の中に隙間なく収まる面など）に使う判断基準である。メニューの項目のように、外側から離れて並び、それ自体が操作の単位になる要素には、機械的に当てはめない。その場合は、項目の大きさと役割に合う段階を選ぶ。たとえば Dropdown Menu は、メニューが 12px、余白 8px、項目が 8px（`rounded-sm`）である（[dropdown-menu.md](components/dropdown-menu.md)）。

`rounded-3xl` と `rounded-4xl` は定義していない。Tailwind CSS の標準の値（24px、32px）になるが、Flow Design では使わない。

## 4. Color（色）

### 値

| トークン | 値 | 用途 |
| --- | --- | --- |
| `background` | #ffffff | 画面の背景 |
| `foreground` | #202020 | 通常の文字 |
| `primary` / `primary-foreground` | #262626 / #ffffff | 主要な操作、選択中の状態 |
| `secondary` / `secondary-foreground` | #f5f5f5 / #262626 | 補助的な操作 |
| `muted` / `muted-foreground` | #f5f5f5 / #6e6e6e | 控えめな面 / 補足の文字、プレースホルダー |
| `accent` / `accent-foreground` | #f5f5f5 / #262626 | ホバー中、選択中の項目の面 |
| `card`、`popover` | #ffffff | カード、浮かぶ要素の面 |
| `border` | #e5e5e5 | 区切り線、装飾の境界線 |
| `border-strong` | #8a8a8a | 識別に必要な境界線 |
| `input` | `border-strong` と同じ | 入力欄、チェックボックスの枠 |
| `ring` | #262626 | キーボードフォーカスの表示 |
| `destructive` / `destructive-foreground` | #d32424 / #ffffff | 削除などの取り消せない操作、エラー |
| `success` / `success-foreground` | #15803d / #ffffff | 完了、正常 |
| `warning` / `warning-foreground` | #b45309 / #ffffff | 注意 |
| `info` / `info-foreground` | #2563eb / #ffffff | お知らせ |
| `chart-1`〜`chart-5` | #2563eb / #134e4a / #d0620c / #4c1d95 / #be185d | グラフの系列（「グラフの色」） |

- `success`、`warning`、`info`、`border-strong`、`destructive-foreground` は、shadcn/ui の「Adding New Tokens」の手順で追加したトークンである。
- `sidebar-*` は、`sidebar` と `sidebar-accent` を除き、対応する `foreground`、`primary`、`accent-foreground`、`border`、`ring` を参照する。`sidebar` は `--fd-neutral-100`（#f5f5f5）、`sidebar-accent` は `--fd-neutral-200`（#e5e5e5）である。Sidebar をメインの内容と背景で区別し、現在位置の面を Sidebar の面より一段濃くするためである（[sidebar.md](components/sidebar.md)）。
- `chart-1`〜`chart-5` はグラフの系列の色であり、状態を表さない。`chart-1` は `info` と同じ値だが、意味は「1 番目の系列」である。

### 状態

| 状態 | 表し方 |
| --- | --- |
| ホバー | `primary` の塗りの部品は `hover:bg-primary/90` で面を少し明るくする。`destructive` の塗りの部品は `hover:bg-[color-mix(in_srgb,var(--destructive)_90%,black)]` で面を暗くする。塗りのない部品は `hover:bg-accent` にする |
| 押下 | 押下専用の色は定義しない。押した時点で処理を始め、画面の状態を変える |
| フォーカス | `focus-visible:focus-ring`（2px の線、2px 離す）。詳しくは「5. Border」 |
| 無効 | `disabled:opacity-50`。あわせて `disabled` 属性を付け、ポインターの形を変える |
| エラー | 枠を `border-destructive` にし、エラーの内容を文字で示す |

色だけで状態や意味を伝えない。状態の色には、必ず文字かアイコンを添える。

### コントラスト

`node scripts/tokens/check-contrast.mjs` で検証した。数値は WCAG 2 のコントラスト比で、小数点以下 2 桁に丸めて表示している。合否は丸める前の値で判定している。

| 組み合わせ | 比 | 基準 |
| --- | ---: | --- |
| `foreground` / `background` | 16.29 | 4.5 以上 |
| `foreground` / `muted` | 14.94 | 4.5 以上 |
| `muted-foreground` / `background` | 5.10 | 4.5 以上 |
| `muted-foreground` / `muted`、`accent` | 4.68 | 4.5 以上 |
| `primary-foreground` / `primary` | 15.13 | 4.5 以上 |
| `primary-foreground` / `primary/90`（ホバー） | 11.08 | 4.5 以上 |
| `primary-foreground` / `primary/80`（押下） | 7.89 | 4.5 以上 |
| `primary-foreground` / `muted` の上の `primary/90`、`primary/80` | 11.25、8.14 | 4.5 以上 |
| `secondary-foreground` / `secondary` | 13.88 | 4.5 以上 |
| `destructive` / `background` | 5.19 | 4.5 以上 |
| `destructive` / `muted` | 4.76 | 4.5 以上 |
| `destructive-foreground` / `destructive` | 5.19 | 4.5 以上 |
| `destructive-foreground` / `destructive` を 10% 暗くした面（ホバー） | 6.14 | 4.5 以上 |
| `success` / `background`、`success-foreground` / `success` | 5.02 | 4.5 以上 |
| `success` / `muted` | 4.60 | 4.5 以上 |
| `warning` / `background`、`warning-foreground` / `warning` | 5.02 | 4.5 以上 |
| `warning` / `muted` | 4.61 | 4.5 以上 |
| `info` / `background`、`info-foreground` / `info` | 5.17 | 4.5 以上 |
| `info` / `muted` | 4.74 | 4.5 以上 |
| `input`、`border-strong` / `background` | 3.45 | 3 以上（非テキスト） |
| `input`、`border-strong` / `muted` | 3.17 | 3 以上（非テキスト） |
| `ring` / `background`（`focus-ring`） | 15.13 | 3 以上（非テキスト） |
| `ring` / `muted`（`focus-ring`） | 13.88 | 3 以上（非テキスト） |
| `ring/50` / `background`（shadcn/ui の標準の部品） | 3.09 | 3 以上（非テキスト） |
| `ring/50` / `muted`（shadcn/ui の標準の部品） | 3.02 | 3 以上（非テキスト） |
| `sidebar-foreground` / `sidebar` | 14.94 | 4.5 以上 |
| `muted-foreground` / `sidebar`（Sidebar の項目、グループの名前） | 4.68 | 4.5 以上 |
| `sidebar-accent-foreground` / `sidebar-accent`（現在位置） | 12.01 | 4.5 以上 |
| `sidebar-accent-foreground` / `sidebar` の上の `sidebar-accent/50`（ホバー） | 12.93 | 4.5 以上 |
| `ring` / `sidebar`、`sidebar-accent`（`focus-ring`） | 13.88、12.01 | 3 以上（非テキスト） |

半透明の色（`primary/90`、`primary/80`、`ring/50`）は、実際に下にある色（`background` か `muted`）と合成してから比を計算している。

`ring/50` は、`muted` の上で基準との差が 0.02 しかない。`ring` を明るくしたり、`muted` を暗くしたりすると、基準を下回る。Flow Design のコンポーネントは不透明な 2px の `focus-ring` を使うため、この差の影響を受けない。shadcn/ui の標準の部品で余裕を持たせる場合は、色を変えずに次のどちらかを選ぶ。

- 不透明度を上げる（`ring-ring/70` にすると、`muted` の上で 5.42:1）
- フォーカスの表示を `focus-visible:focus-ring` に置き換える

`border`（#e5e5e5）は白の上で 1.26:1 であり、3:1 に届かない。`border` は装飾の区切りだけに使い、部品の識別に必要な枠には `input` か `border-strong` を使う。

無効な部品の文字は、WCAG 1.4.3 でコントラストの基準の対象外である。そのため、無効の状態は透明度だけでなく、`disabled` 属性で支援技術にも伝える。

### グラフの色

| トークン | 値 | `background`・`card`・`popover` との比 | `muted` との比 | L*（グレースケール） |
| --- | --- | ---: | ---: | ---: |
| `chart-1` | #2563eb（青） | 5.17 | 4.74 | 46.1 |
| `chart-2` | #134e4a（濃い青緑） | 9.48 | 8.69 | 29.6 |
| `chart-3` | #d0620c（オレンジ） | 3.86 | 3.54 | 54.2 |
| `chart-4` | #4c1d95（濃い紫） | 10.95 | 10.05 | 25.5 |
| `chart-5` | #be185d（赤紫） | 6.04 | 5.54 | 41.8 |

線、棒、円の扇形、マーカー、Tooltip の系列の印は非テキストの要素として扱い、背景に対して 3:1 以上を求める（WCAG 1.4.11）。グラフの色で文字を書かない。

系列どうしの区別は、`check-contrast.mjs` が次の方法で確かめる。

- 色差：CIEDE2000。通常の色覚と、1 型・2 型・3 型の色覚のシミュレーション（Machado ほか 2009、程度 1.0）
- グレースケール：CIELAB の明度（L*）の差
- `chart-1`〜`chart-3`（3 系列までのグラフで一緒に使う色）：すべての組み合わせで、4 種類の色差が 20 以上、かつ明度の差が 8 以上
- それ以外の組み合わせ：4 種類の色差の最小が 15 以上、または明度の差が 10 以上

| 組み合わせ | 色差（通常 / 1 型 / 2 型 / 3 型） | 明度の差 |
| --- | --- | ---: |
| `chart-1` / `chart-2` | 34.9 / 32.1 / 27.3 / 21.7 | 16.4 |
| `chart-1` / `chart-3` | 52.6 / 59.8 / 65.6 / 61.8 | 8.1 |
| `chart-2` / `chart-3` | 47.7 / 28.9 / 41.4 / 55.8 | 24.6 |
| `chart-1` / `chart-4` | 22.9 / 21.1 / 16.6 / 29.3 | 20.5 |
| `chart-1` / `chart-5` | 36.5 / 25.2 / 42.0 / 64.5 | 4.2 |
| `chart-2` / `chart-4` | 32.2 / 24.5 / 19.8 / 22.8 | 4.1 |
| `chart-2` / `chart-5` | 42.4 / 8.3 / 21.2 / 54.7 | 12.2 |
| `chart-3` / `chart-4` | 55.3 / 60.4 / 66.2 / 41.3 | 28.7 |
| `chart-3` / `chart-5` | 35.4 / 37.1 / 21.6 / 10.4 | 12.4 |
| `chart-4` / `chart-5` | 29.2 / 16.3 / 41.7 / 37.5 | 16.3 |

候補（#2563eb、#0f766e、#7c3aed、#b45309、#be185d）から変えた点は次のとおりである。候補は 5 色とも背景に対して 4.6:1 以上だったが、系列の区別で 10 組のうち 5 組が基準を満たさなかった。

| トークン | 候補 | 採用 | 理由 |
| --- | --- | --- | --- |
| `chart-2` | #0f766e | #134e4a | 候補の 5 色は L* が 42〜47 に集まり、グレースケールで区別できない（`chart-1` との明度の差 1.6）。暗くして差を 16.4 にした |
| `chart-3` | #7c3aed | #d0620c | `chart-1`（青）と紫は、2 型色覚のシミュレーションで色差 0.5 となり区別できない。3 系列のグラフで隣り合うため、`chart-3` を色覚の特性によらず青と区別しやすいオレンジにし、明るくして明度の差を付けた |
| `chart-4` | #b45309 | #4c1d95 | #b45309 は `warning` と同じ値で、注意の意味に見える。紫を `chart-4` に移し、暗くして `chart-1` との明度の差を 20.5 にした（2 型色覚の色差 16.6） |
| `chart-1`、`chart-5` | #2563eb、#be185d | 変更なし | 基準を満たす |

5 色すべての組み合わせを、すべての色覚の特性で色だけで区別することは、背景に対して 3:1 以上という明度の制約の中ではできない。4 系列以上のグラフでは、色に加えて線の種類、マーカー、直接のラベル、数値の表を使う（[chart.md](components/chart.md)）。

### 候補の値から変えた点

| トークン | 候補 | 採用 | 理由 |
| --- | --- | --- | --- |
| `muted-foreground` | #737373 | #6e6e6e | #737373 は `muted`（#f5f5f5）の上で 4.35:1 となり、4.5:1 に届かない。shadcn/ui の Tabs は `bg-muted` の上に `text-muted-foreground` を置く |
| `input`、`border-strong` | 指定なし（`border` と同じ #e5e5e5） | #8a8a8a | 入力欄の枠は部品の識別に必要なため、WCAG 1.4.11 の 3:1 が必要になる。#e5e5e5 は白の上で 1.26:1 |
| `ring` | 指定なし | #262626 | shadcn/ui の標準の部品は、フォーカスの表示に `ring-ring/50`（透明度 50%）を使う。#262626 は透明度 50% でも 3:1 以上になる |
| `destructive` | #dc2626 | #d32424 | #dc2626 は `muted` の上で 4.43:1 となり、エラーの文字を置く面を `background` に限る必要があった。#d32424 は `muted` の上で 4.76:1 となり、この制限が不要になる |

## 5. Border（境界線）

| 用途 | 指定 |
| --- | --- |
| 通常の境界線 | `border`（1px）、色は `border` |
| 識別に必要な境界線 | `border`（1px）、色は `input` または `border-strong` |
| キーボードフォーカス | `focus-visible:focus-ring`（2px、2px 離す、色は `ring`） |

- 区切りは、余白と文字の階層で足りない場合にだけ線を使う（美的基準 03）。
- 入力欄の枠とフォーカスの表示は省略しない。
- `focus-ring` は `outline` で描くため、Windows の強制カラーモードでも表示される。太さと間隔は `--focus-ring-width` と `--focus-ring-offset` で変えられる。
- shadcn/ui の標準の部品は、フォーカスの表示に `ring-3 ring-ring/50` を使っている。テーマはこれを変更しない。

## 6. Elevation（影）

| 用途 | クラス | 値 |
| --- | --- | --- |
| 通常の要素 | なし | none |
| メニュー | `shadow-menu` | 0 2px 8px rgb(0 0 0 / 0.06) |
| ポップオーバー | `shadow-popover` | 0 4px 16px rgb(0 0 0 / 0.08) |
| ダイアログ | `shadow-dialog` | 0 12px 32px rgb(0 0 0 / 0.12) |

影は、要素が他の要素の上に重なっていることを伝えるときだけ使う。カードやボタンには影を付けない。

shadcn/ui の標準の部品は、メニューとポップオーバーに `shadow-md` と `shadow-lg` を使っている。テーマは Tailwind CSS の `shadow-md` などを変更しないため、それらの部品の影は変わらない。

## 7. Motion（動き）

| 種類 | トークン | 値 | 用途 |
| --- | --- | --- | --- |
| Duration | `--duration-fast` | 120ms | ホバー、押下による色の変化 |
| | `--duration-normal` | 180ms | メニュー、ツールチップの開閉 |
| | `--duration-slow` | 240ms | ダイアログ、パネルの開閉 |
| | `--duration-layout` | 320ms | 要素の位置や大きさの変化 |
| Easing | `ease-standard` | cubic-bezier(0.2, 0, 0, 1) | 状態の変化 |
| | `ease-enter` | cubic-bezier(0.22, 1, 0.36, 1) | 表示されるとき |
| | `ease-exit` | cubic-bezier(0.4, 0, 1, 1) | 消えるとき |

- Duration は Tailwind CSS のテーマの名前空間にないため、`duration-(--duration-fast)` のように変数を指定して使う。
- CSS Transition / Animation を基本とする。Motion は、CSS では実装が複雑になる動きにだけ使う（[stack.md](stack.md#動き)）。
- 操作への反応は、入力と同時に行う。アニメーションが終わるまで次の操作を受け付けない、という実装はしない。
- 動きを減らす設定（`prefers-reduced-motion: reduce`）では、テーマが `--duration-slow` と `--duration-layout` を 0ms にする。位置や大きさを変える動きには `motion-safe:` を付ける。色と透明度の変化は残してよい。

## 8. Sizing（高さとアイコン）

| 大きさ | 値 | クラス |
| --- | ---: | --- |
| Compact | 32px | `h-8` |
| Small | 40px | `h-10` |
| Default | 48px | `h-12`、`h-control` |
| Large | 56px | `h-14` |

- ボタン、入力欄、セレクトの高さは `h-control`（`--control-height`、48px）を標準とする。
- テーブルの行の高さは `h-table-row`（`--table-row-height`、48px）を標準とする。高密度の業務画面では、画面の要素に `[--table-row-height:2.5rem]` のように指定して変える。
- タッチ操作が主な画面では、Default 以上を使う。Compact は WCAG 2.5.8 の最小値（24px）を満たすが、指での操作には小さい。
- アイコンは `size-4`（16px）、`size-5`（20px）、`size-6`（24px）を使い、20px を標準とする。
- Lucide の線の太さは、24px の大きさを基準に 1.75 とする（`--icon-stroke-width`）。テーマは `svg.lucide` の `stroke-width` を CSS で指定するため、アイコンの `strokeWidth` 属性より優先される。個別に変える場合は、`[--icon-stroke-width:2]` のように変数を上書きする。

shadcn/ui の base-nova スタイルの標準の部品は、ボタンと入力欄が 32px（`h-8`）である。テーマは部品の高さを変更しない。48px の部品は、Flow Design の Registry のコンポーネントとして提供する。

## ブランドと書体の変更

製品は、次の変数だけを上書きする。

| 変えるもの | 上書きする変数 |
| --- | --- |
| ブランドカラー | `--primary`、`--primary-foreground`。必要に応じて `--ring` |
| ニュートラルの色味 | `--fd-neutral-0`〜`--fd-neutral-900` |
| フォント | `--fd-font-sans` |
| 角丸の大きさ | `--fd-radius-xs`〜`--fd-radius-2xl`。ボタンの角丸だけを変える場合は、shadcn/ui と同じく `--radius` でもよい |
| グラフの色 | `--chart-1`〜`--chart-5`。グラフを囲む要素で上書きしてもよい |

上書きした後は、「検証の方法」の 2 つのスクリプトで確認する。グラフの色を上書きした製品は、背景との 3:1 と、系列の区別（「グラフの色」の基準）を `check-contrast.mjs` で確かめる責務を持つ。基準を満たさない色にする場合は、線の種類、マーカー、ラベル、数値の表で系列を区別できるようにする。`primary` は、Button のホバー（`primary/90`）と押下（`primary/80`）でも 4.5:1 以上になる色を選ぶ。たとえば #1d4ed8 は、押下が白の上で 4.42:1 になるため使えない。

角丸は shadcn/ui の既定のように `--radius` からの倍率で計算していない。Flow Design の段階（4、8、12、14、20、24px）が倍率では表せないためである。

## ダークモード

テーマは `@custom-variant dark` を定義しており、`.dark` に Semantic トークンの値を追加すれば、ダークモードを提供できる。v0.1 ではダークモードの値を定義していない。提供するかどうかと値は、製品ごとに決める。

## 検証の方法

| スクリプト | 検査すること | 必要なもの |
| --- | --- | --- |
| `node scripts/tokens/check-contrast.mjs [CSS]` | `var()` の未定義と循環、「4. Color」の組み合わせのコントラスト、グラフの系列の区別 | Node.js だけ |
| `node scripts/tokens/verify-theme.mjs [CSS]` | Tailwind CSS v4 でのコンパイル、ユーティリティの生成、Chromium での計算後のスタイル、CSS 変数の上書き、動きを減らす設定 | Node.js、初回のネットワーク接続、Playwright の Chromium |

どちらも結果を 1 行に 1 つの JSON で出力し、失敗があれば終了コード 1 で終わる。

`check-contrast.mjs` の検査範囲と制約は次のとおりである。

- 最上位の `:root` ブロックの変数だけを読む。`@media` の中は読まない。
- 色は `#rrggbb` に解決できるものだけを計算する。`oklch()` などの値は計算できないため、`#rrggbb` で書く。
- 検査する組み合わせは、スクリプト内の一覧に書いたものだけである。部品が新しい組み合わせを使う場合は、一覧に追加する。

`verify-theme.mjs` は、バージョンを固定したパッケージ（tailwindcss 4.3.5、@tailwindcss/cli 4.3.5、shadcn 4.23.0、playwright-core 1.65.1）を、リポジトリの外の一時ディレクトリに入れて使う。リポジトリに依存パッケージは追加しない。Chromium がない場合は `npx playwright-core@1.65.1 install chromium` で入れる。

## 検証の結果

| 項目 | 方法 | 結果 |
| --- | --- | --- |
| Tailwind CSS v4 | `verify-theme.mjs`（v4.3.5 の CLI で `shadcn/tailwind.css` と一緒にコンパイル） | 検査した 42 のユーティリティがすべて生成された |
| shadcn/ui | 既定のテーマのトークン名と照合。base-nova スタイルの Button、Input、Card、Dialog、Popover、Dropdown Menu、Table、Tabs のクラスを確認 | `:root` のトークン名はすべて定義している。`@theme inline` のうち `--radius-3xl` と `--radius-4xl` は定義せず、Tailwind CSS の標準の値（24px、32px）になる。これらを使う Badge は、高さより角丸が大きいため形が変わらない。部品のクラスは変更なしで動く |
| 削除ボタンのホバー | `verify-theme.mjs`（Playwright の Chromium 159） | 面が rgb(190, 32, 32)（`destructive` を 10% 暗くした色）になった |
| CSS 変数の上書き | `verify-theme.mjs`（Playwright の Chromium 159） | `--fd-radius-md`、`--fd-radius-xl`、`--fd-radius-lg`、`--radius`、`--primary`、`--fd-neutral-500`、`--control-height`、`--table-row-height`、`--focus-ring-width`、`--icon-stroke-width` の上書きが、計算後のスタイルに反映された。`--fd-radius-md` の上書きで、他の角丸は変わらなかった |
| 参照関係 | `check-contrast.mjs` | 63 の変数で、未定義と循環はない |
| コントラスト | `check-contrast.mjs` | 61 の組み合わせ（グラフの色の 20 を含む）がすべて基準を満たした |
| グラフの系列の区別 | `check-contrast.mjs` | 10 の組み合わせがすべて基準を満たした（「グラフの色」） |
| 動きを減らす設定 | `verify-theme.mjs` | `--duration-slow` と `--duration-layout` が 0ms になり、`--duration-fast` は 120ms のまま |
| 表示 | ボタン、入力欄、メニュー、ダイアログ、テーブルを並べたページを Chromium で表示（v0.1 の作成時） | 余白、文字、角丸、高さの段階が意図どおりに表示された |

テーマを読み込んだとき、shadcn/ui の標準の部品で変わる見た目は次のとおりである。

- ボタンと入力欄の角丸が 14px、カードとダイアログの角丸が 20px になる。
- 入力欄の枠が #8a8a8a になる。
- Lucide のアイコンの線の太さが 1.75 になる。

### cn() の設定

shadcn/ui の `cn()` は tailwind-merge で重複するクラスを取り除く。tailwind-merge は、テーマが追加したクラス名を知らないため、`text-ui text-primary-foreground` の `text-ui` を文字色のクラスとみなして削除する。Button の実装で確認した。

[`registry/lib/tailwind-merge.ts`](../../registry/lib/tailwind-merge.ts) に、テーマが追加したクラス名（文字の 8 段階、影の 3 段階、`control` と `table-row` の高さ、`ease-*`）を登録する設定をまとめている。製品の状況に応じて、次のどちらかで使う。

| 製品の状況 | 方法 |
| --- | --- |
| `lib/utils.ts` を変更していない | [`registry/lib/utils.ts`](../../registry/lib/utils.ts) をそのまま使う |
| `lib/utils.ts` に独自の tailwind-merge の設定や関数がある | ファイルを置き換えず、`extendTailwindMerge` の引数に `withFlowDesign` を追加する |

```ts
// 製品の lib/utils.ts
import { extendTailwindMerge } from "tailwind-merge"
import { withFlowDesign } from "./tailwind-merge"

const twMerge = extendTailwindMerge(
  { extend: { classGroups: { /* 製品の設定 */ } } },
  withFlowDesign
)
```

`withFlowDesign` は tailwind-merge の `mergeConfigs` で設定を追加するため、製品の設定は残る。テーマにクラス名を追加したときは `tailwind-merge.ts` にも追加する。両者が一致していることは `preview/tests/cn.spec.ts` で確認している。

## 未定のこと

- ダークモードの値
- Registry での配布の形式（CSS ファイルか、`registry:theme` などの item の `cssVars` か）
- 文字の字間（letter-spacing）
- 実際のコンポーネントを使った検品の結果による値の調整
