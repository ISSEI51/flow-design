# Accordion

補足の情報や、使う頻度の低い情報を、必要なときに開く。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/accordion.tsx`](../../../registry/components/ui/accordion.tsx) |
| 元にした実装 | shadcn/ui の Accordion（Base UI 版、base-nova スタイル） |
| 依存 | `@base-ui/react`、`lucide-react`、[`cn()`](../../../registry/lib/utils.ts) |
| 状態 | v0.1 確定 |

## 1. Purpose

選んで読む情報を見出しだけにして、画面の情報量を必要な分に保つ。必要な情報を最初から隠すためには使わない（原則 08）。

## 2. Usage

| 場面 | 使うもの |
| --- | --- |
| よくある質問、補足の説明、変更履歴 | Accordion（複数展開） |
| 手順の説明のように、同時に読む理由がない内容 | Accordion（単一展開） |
| よく使う主要な情報 | 最初から表示する |
| 必須の入力項目 | 最初から表示する |

Accordion の入れ子は避ける。

## 3. Anatomy

| 部分 | 役割 |
| --- | --- |
| `Accordion` | `multiple`、`value`、`defaultValue`、`keepMounted` |
| `AccordionItem` | 1 つの項目。`value` |
| `AccordionTrigger` | 見出しと開閉のボタン。`level` で見出しのレベル |
| `AccordionContent` | 開く内容 |

| 項目 | 値 | トークン |
| --- | --- | --- |
| 見出しの高さ | 48px 以上 | `min-h-12` |
| 見出しの文字 | 16px、太さ 500 | `text-body`、`font-medium` |
| アイコン | ChevronDown、20px、`muted-foreground`。開くと 180° 回る | `size-5` |
| 項目の間 | 1px、`border`（最後の項目の下には引かない） | `border-b` |
| 背景、影 | なし | |
| 内容 | 16px、`muted-foreground`、下の余白 16px | `text-body`、`pb-4` |
| 開閉の動き | 240ms の高さの変化 | `--duration-slow` |

## 4. Variants

| 種類 | 指定 | 使う場面 |
| --- | --- | --- |
| 複数展開 | 既定（`multiple` の既定は `true`） | 標準 |
| 単一展開 | `multiple={false}` | 1 つを開くと他が閉じる理由がある場合 |

Base UI と shadcn/ui の既定は単一展開である。Flow Design は複数展開を既定にしている。読みたい項目を開くたびに、他の項目が閉じないようにするためである。

### 状態

| 状態 | 表し方 |
| --- | --- |
| 開いている | `aria-expanded="true"`、アイコンが上を向く |
| ホバー | 見出しに下線 |
| フォーカス | `focus-ring` |
| 無効 | `disabled`。透明度 50% |

## 5. Behavior

- 見出し全体が 1 つのボタンで、どこを押しても開閉する。
- Tab で見出しへ移り、Enter と Space で開閉する。
- `AccordionTrigger` は `<h3>` の中のボタンを描画する。ページの見出しの構造に合わせて `level`（2〜6）を指定する。
- 内容は `aria-controls` で見出しと関連付き、`role="region"` を持つ。
- `keepMounted` の既定は `true`。閉じた内容も DOM に残し、`hidden` 属性で隠す。閉じた内容は表示されず、Tab でフォーカスが移らず、アクセシビリティツリーから外れる。入力した値は閉じても失われず、フォームでは閉じた内容の値も送信される。`keepMounted={false}` で、閉じた内容を DOM から外す。
- 内容の中にフォーカスがある状態で閉じた場合（内容の中のボタンで閉じる、製品が `value` を変えるなど）は、フォーカスをその項目の見出しへ移す。閉じて非表示になった要素にフォーカスが残らないようにするためである。
- `keepMounted` が担うのは、DOM と入力欄の値を残すことまでである。閉じた内容の中のデータの取得や重い描画は止まらない。必要な場合は、開いたときに処理を始める。
- フォームが複数の Accordion に分かれている場合、閉じた項目の入力欄のエラーはユーザーに見えない。製品の処理で検証し、エラーの概要に、該当する項目を開いて入力欄へフォーカスを移すリンクを置く。必須の入力項目は、そもそも折りたたまない。
- `accordion.tsx` は、フォーカスを移す処理にフックを使うため `"use client"` を付けている。
- 高さは Base UI の `--accordion-panel-height` で決まる。開いた後に内容が増えても、高さが追従する。
- 内容の領域は `overflow: hidden` で高さの変化に合わせて隠す。左右と上に 4px の余白を取り、中の入力欄などのフォーカスの線が切れないようにしている。
- 動きを減らす設定では、高さの変化とアイコンの回転の時間が 0ms になる。

```tsx
<Accordion>
  <AccordionItem value="plan">
    <AccordionTrigger>契約の途中でプランを変更できますか</AccordionTrigger>
    <AccordionContent>変更できます。…</AccordionContent>
  </AccordionItem>
</Accordion>
```

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 必須の入力項目を折りたたむ | 開かないと入力できず、入力し忘れが起きる | 最初から表示する |
| よく使う主要な情報を入れる | 毎回開く手間が増える（原則 07） | 最初から表示する |
| Accordion を入れ子にする | 開く操作が重なり、位置がわからなくなる | 見出しで構造を分ける |
| 背景や影で項目を囲む | 装飾が増える（美的基準 03） | 項目の間の 1px の線だけにする |
| 理由なく単一展開にする | 他の項目が勝手に閉じる | 複数展開を使う |
