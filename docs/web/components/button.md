# Button

処理を実行するための操作。ページの移動にはリンクを使う。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/button.tsx`](../../../registry/components/ui/button.tsx) |
| 元にした実装 | shadcn/ui の Button（Base UI 版、base-nova スタイル） |
| 依存 | `@base-ui/react`、`class-variance-authority`、`lucide-react`、[`cn()`](../../../registry/lib/utils.ts) |
| 状態 | 初期実装。人間による表示の確認を経て確定する |

## 1. Purpose

ユーザーが、押した結果を予測して、迷わずに処理を実行できるようにする。

ボタンの見た目は、操作の重要度を表す。画面の中で何が主要な操作かが、読まなくてもわかる状態を目指す（原則 01、03）。

## 2. Usage

### 使う場面

| 場面 | 使うもの |
| --- | --- |
| 保存、送信、削除などの処理を実行する | Button |
| 別のページへ移動する | リンク（`<a>`）。ボタンと同じ見た目が必要な場合は `buttonVariants()` を付ける |
| 文章の中で処理を実行する | `variant="link"` の Button |

Base UI の Button はボタンとしての役割（`role="button"`、キー操作、無効の状態）を持つ。リンクの役割を持つ `<a>` を Button で描画しない。

### 種類の選び方

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/button-hierarchy-dark.svg">
  <img alt="ボタンの種類を、目立つものから控えめなものの順に並べた図。Primary は主要な操作、Secondary は補助の操作、Outline は並べる補助操作、Ghost は控えめな操作、Link は文中の操作。Destructive は重要度とは別の軸で、取り消せない操作に使う。" src="../../diagrams/button-hierarchy-light.svg">
</picture>

1. 取り消せない操作か。そうであれば Destructive。
2. 操作グループの中で最も重要な操作か。そうであれば Primary。Primary は 1 つの操作グループに原則 1 つ。
3. それ以外の操作は、周りの要素との関係で選ぶ。
   - Primary と並べる補助操作：Secondary か Outline
   - ツールバーや表の行の中で繰り返す操作：Ghost
   - 文章の中の操作：Link

Secondary と Outline はどちらも補助操作に使う。背景のある場所や、同じ高さの面が並ぶ場所では、面の色で区切る Secondary を使う。白い背景の上で他の操作と並べる場合は、線で形を示す Outline を使う。同じ操作グループの中では、どちらか一方にそろえる。

### 大きさの選び方

| 大きさ | `size` | 高さ | 使う場面 |
| --- | --- | ---: | --- |
| Compact | `xs` / `icon-xs` | 32px | 高密度の表、行の中の操作 |
| Small | `sm` / `icon-sm` | 40px | フィルター、ツールバーなど画面の補助的な操作 |
| Default | `default` / `icon` | 48px | 標準。フォーム、ダイアログ |
| Large | `lg` / `icon-lg` | 56px | 画面の目的そのものになる操作（申し込みなど） |

同じ操作グループの中では、大きさをそろえる。タッチ操作が主な画面では Default 以上を使う。

### ラベル

- 押した結果がわかる言葉にする。「OK」「実行」ではなく「請求書を送信」「変更を保存」。
- 対象が複数ありうる場合は、対象を含める（「山田商事を削除」）。
- 一般的に認識されるアイコン（検索、追加、削除、ダウンロードなど）だけを、文字なしで使う。それ以外のアイコンには文字を添える。

## 3. Anatomy

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/button-anatomy-dark.svg">
  <img alt="ボタンの構造。1 コンテナは高さ 48px、角丸 14px、左右の余白 20px、影なし。2 アイコンは任意で、20px、線の太さ 1.75、文字との間隔 8px。3 ラベルは 14px、太さ 500 で、押した結果がわかる言葉にする。4 フォーカスの枠は 2px で、2px 離し、キーボード操作のときだけ表示する。アイコンだけのボタンは 48 × 48px で、aria-label が必須。" src="../../diagrams/button-anatomy-light.svg">
</picture>

| 部分 | トークン |
| --- | --- |
| 高さ | `h-control`（`--control-height`）など、Sizing の段階 |
| 角丸 | `rounded-lg`（`--radius`）。Compact は `rounded-sm`、Small は `rounded-md` |
| 文字 | `text-ui` と `font-medium` |
| アイコン | `size-5`、線の太さは `--icon-stroke-width` |
| 間隔 | `gap-2` |
| フォーカス | `focus-visible:focus-ring` |
| 状態の変化 | `duration-(--duration-fast)`、`ease-standard` |

DOM は、Base UI の `<button>` の中に、ラベルとアイコンを入れる `data-slot="button-content"` と、処理中だけ表示する `data-slot="button-spinner"` を置く。

## 4. Variants

### 種類

| 種類 | `variant` | 面 | 文字 | ホバー |
| --- | --- | --- | --- | --- |
| Primary | `default` | `primary` | `primary-foreground` | 面を 10% 明るくする（`bg-primary/90`） |
| Secondary | `secondary` | `secondary` | `secondary-foreground` | 面に文字色を 6% 混ぜる |
| Outline | `outline` | `background`、枠は `input` | `foreground` | 面を `accent` にする |
| Ghost | `ghost` | なし | `foreground` | 面を `accent` にする |
| Destructive | `destructive` | `destructive` | `destructive-foreground` | 面を 10% 暗くする |
| Link | `link` | なし。常に下線 | `primary` | 下線を 2px にする |

`variant` の名前は shadcn/ui と同じである。Primary は `variant="default"` で指定する。

Link は、周りの文章と色だけで区別しないように、常に下線を付ける（WCAG 1.4.1）。

### 状態

| 状態 | 表し方 |
| --- | --- |
| 通常 | 種類ごとの面と文字 |
| ホバー | 種類の表を参照。120ms で変化する |
| 押下 | ホバーよりさらに面を変える。位置や大きさは変えない |
| フォーカス | キーボードで移動したときだけ `focus-ring` を表示する |
| 無効 | `disabled`。透明度 50%、ポインターは `not-allowed`。フォーカスできない |
| 処理中 | `loading`。ラベルを透明にし、同じ位置にスピナーを表示する。押せないが、フォーカスは保つ |

無効にする場合は、押せない理由を近くの文字で示す。理由を示せない場合は、押せる状態のままにして、押したときに理由を示す方がよい。

## 5. Behavior

- **キー操作**：Tab で移動し、Enter と Space で実行する。Base UI の Button が担う。
- **処理中**：`loading` を指定すると、`disabled` と `focusableWhenDisabled` を内部で指定する。クリックとキー操作を受け付けないため、同じ処理を二重に実行しない。フォーカスはボタンに残る。`aria-busy="true"` を付ける。
- **処理中の幅**：ラベルを `opacity: 0` で残すため、ボタンの幅と高さは変わらない。アクセシブルな名前もラベルのまま変わらない。
- **動きを減らす設定**：スピナーは `motion-safe:animate-spin` で回転する。動きを減らす設定では回転しない。
- **長いラベル**：省略せずに折り返す。高さは `min-height` で指定しているため、折り返した分だけ高くなる。日本語は `word-break: auto-phrase` で文節の区切りで折り返す（対応するブラウザのみ）。
- **アイコンだけのボタン**：`size` が `icon-*` のとき、`aria-label` か `aria-labelledby` を TypeScript の型で必須にしている。
- **確認の手順**：取り消せる操作には確認のダイアログを出さない。取り消せない操作だけ、結果を文章で示して確認する（原則 07）。

```tsx
import { Button, buttonVariants } from "@/components/ui/button"

<Button>変更を保存</Button>
<Button variant="outline"><Download />書き出す</Button>
<Button size="icon" variant="ghost" aria-label="検索"><Search /></Button>
<Button loading={saving} onClick={save}>変更を保存</Button>
<a href="/customers" className={buttonVariants({ variant: "outline" })}>顧客一覧へ</a>
```

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 1 つの操作グループに Primary を 2 つ以上置く | どれが主要な操作かわからない（原則 03） | 主要な操作だけ Primary にし、他は Secondary、Outline、Ghost にする |
| 「OK」「実行」「はい」などのラベル | 押した結果がわからない（原則 05） | 「請求書を送信」のように結果を示す |
| 意味が共有されていないアイコンだけのボタン | アイコンの意味を推測させる（原則 06） | 文字を添える |
| 取り消せない操作を Primary にする | 通常の操作と区別できない | Destructive にする |
| ページの移動に Button を使う | リンクとして扱えない（新しいタブで開けない、支援技術がリンクと認識しない） | `<a>` に `buttonVariants()` を付ける |
| 取り消せる操作に確認のダイアログを出す | 手順が増える（原則 07） | 実行後に取り消しの手段を示す |
| 処理中にボタンを消す、ラベルを短い言葉に変える | 周りの配置が動き、フォーカスが失われる | `loading` を使う |
| フォーカスの枠を消す | キーボードで操作できなくなる（原則 08） | `focus-ring` を残す |
| `className` で高さを 32px 未満にする | 押しにくくなる | Compact（32px）までにする |
