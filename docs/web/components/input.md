# Input

1 行の文字や数値を入力する。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/input.tsx`](../../../registry/components/ui/input.tsx) |
| 元にした実装 | shadcn/ui の Input（Base UI 版） |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、ブラウザやモバイルの入力補助を使いながら、短い情報を正確に入力できるようにする。

## 2. Usage

- Field の中に置き、ラベルを上に付ける。
- HTML の入力型と属性を使う。

| 内容 | 指定 |
| --- | --- |
| メールアドレス | `type="email" autoComplete="email"` |
| 電話番号 | `type="tel" autoComplete="tel"` |
| 数値 | `type="number" inputMode="numeric"`、`min`、`max` |
| パスワード | `type="password" autoComplete="current-password"` または `"new-password"` |
| 会社名、氏名 | `autoComplete="organization"`、`"name"` |

- 入力する長さが予想できる場合は、幅を内容に合わせる（郵便番号、従業員数など）。
- 複数行の文章には Textarea を使う。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 高さ | 48px | `h-control` |
| 角丸 | 12px | `rounded-md` |
| 左右の余白 | 16px | `px-4` |
| 文字、プレースホルダー | 16px、太さ 400 | `text-body` |
| 背景 | `background` | `bg-background` |
| 境界線 | 1px、`input` | `border-input` |
| プレースホルダーの色 | `muted-foreground` | `placeholder:text-muted-foreground` |
| 影 | なし | |

## 4. Variants

| 状態 | 表し方 |
| --- | --- |
| 通常 | 上の表のとおり |
| フォーカス | `focus-ring`（2px の線、2px 離す） |
| 入力済み | 文字が `foreground` で表示される |
| 無効 | `disabled`。透明度 50%。送信されない |
| 読み取り専用 | `readOnly`。背景を `muted` にする。選択とコピーができ、送信される |
| エラー | 枠を `destructive`。`FieldError` で原因と直し方を示す |

状態の変化は 120ms で、枠と背景の色だけを変える。

## 5. Behavior

- Base UI の Input は Field.Control であり、Field の中ではラベル、説明、エラーが自動で関連付けられる。
- shadcn/ui の Input はモバイル以外で文字を 14px にするが、Flow Design は常に 16px にする。iOS の Safari は 16px 未満の入力欄でフォーカス時に画面を拡大するため。
- 入力の検証はしない（[forms.md](forms.md#5-検証のタイミング)）。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| プレースホルダーをラベルにする | 入力中に何の欄かわからない | ラベルを上に置く |
| `type="text"` ですべてを受け付ける | 入力補助とモバイルのキーボードが使えない | 内容に合う `type` と `autoComplete` |
| 入力中にエラーを出す | 入力を終える前に否定される | フォーカスが外れたときと送信時に検証する |
| 「入力が正しくありません」 | 直し方がわからない | 原因と直し方を書く |
