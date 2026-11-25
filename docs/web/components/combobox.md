# Combobox

検索して、多くの選択肢から 1 つを選ぶ。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/combobox.tsx`](../../../registry/components/ui/combobox.tsx) |
| 元にした実装 | shadcn/ui の Combobox（Base UI 版）。構成を Base UI の「Input inside popup」に変えた |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、選択肢を探す手間をかけずに 1 つを選び、選んだ結果を閉じた欄で確認できるようにする。

## 2. Usage

- 単一選択の標準は Select である。検索によって選択肢に早く届く場合だけ Combobox を使う（[advanced.md](advanced.md#1-選択系コンポーネントの使い分け)）。切り替える目安は、選択肢がおよそ 10 件を超える場合である。10 件は厳密な上限ではない。
- 既存の選択肢から選ぶことを標準にする。存在しない項目を自由入力で登録しない。
- 自由に文字を入力する検索欄には使わない。入力した文字そのものが値になる欄は Input を使う。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| 欄（`ComboboxTrigger`） | Select の欄と同じ。高さ 48px 以上、角丸 12px、余白 16px、文字 16px、1px の `input` | `min-h-control`、`rounded-md`、`px-4`、`text-body`、`border-input` |
| 値（`ComboboxValue`） | 確定した値。未選択はプレースホルダーを `muted-foreground` で表示 | |
| メニュー（`ComboboxContent`） | Select と同じ。角丸 20px、`border`、`shadow-menu`、高さは画面の空きと 384px の小さい方 | `rounded-xl`、`shadow-menu` |
| 検索欄（`ComboboxInput`） | 高さ 40px、角丸 12px、文字 16px。左に Lucide の Search（20px） | `h-10`、`rounded-md`、`text-body` |
| 選択肢（`ComboboxItem`） | 高さ 40px 以上、角丸 12px、文字 16px。選択中は Check（20px）と太さ 500。ハイライトは `accent` の面、キーで移ったときは加えて内側に 2px の枠 | `min-h-10`、`rounded-md` |
| 結果なし（`ComboboxEmpty`）、状態（`ComboboxStatus`） | 14px、`muted-foreground`。取得失敗は `destructive` とアイコン | `text-ui` |

```tsx
<Field>
  <FieldLabel>取引先</FieldLabel>
  <Combobox items={accounts}>
    <ComboboxTrigger>
      <ComboboxValue placeholder="選択してください" />
    </ComboboxTrigger>
    <ComboboxContent>
      <ComboboxInput placeholder="取引先名で検索" aria-label="取引先を検索" />
      <ComboboxEmpty>一致する取引先がありません</ComboboxEmpty>
      <ComboboxList>
        {(item) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</Field>
```

## 4. Variants

| 状態 | 表し方 |
| --- | --- |
| 未選択 | プレースホルダー |
| 選択済み | 選んだ選択肢の名前。長い名前は折り返す |
| 開いている | 開閉のアイコンが上を向く。検索欄にフォーカスがある |
| 読み込み中 | `ComboboxStatus` が「検索しています」とアイコン |
| 結果なし | `ComboboxEmpty` の文 |
| 取得失敗 | `ComboboxStatus` が原因と再試行のボタン |
| 無効 | 透明度 50%。開かない |
| 読み取り専用 | 面を `muted`。開かない |
| エラー | 枠を `destructive`。`FieldError` で原因を示す |

### 新規作成

製品が新規作成を許可する場合だけ、一致する選択肢がないときに `ComboboxCreateItem`（「「〇〇」を追加」）を選択肢の最後に置く。選ばれたときの登録処理と権限の確認は製品が行う。

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| 押す、Enter、Space、↓ | 開き、検索欄にフォーカスを移す |
| 文字を入力する | 部分一致で絞り込む。値は変わらない |
| ↑ ↓、Home、End | 選択肢を移る（`aria-activedescendant`） |
| Enter、押す | ハイライトした選択肢を選んで閉じる。フォーカスを欄に戻す |
| ハイライトがない状態で Enter | 何も選ばずに閉じる。値は変わらない |
| IME の変換の確定の Enter | 選ばない。変換中は絞り込まない（Android を除く。[advanced.md](advanced.md#android-の-ime-の制約)） |
| Esc、外側を押す | 選ばずに閉じる。検索文字列を破棄し、値は残す |

- アクセシビリティの構造は Base UI が担う。欄は `role="combobox"`（`aria-haspopup="dialog"`）のフォームの部品で、Field のラベルが名前になる。検索欄は `role="combobox"` で、`aria-controls` で選択肢の一覧（`role="listbox"`）を操作する。選択中の選択肢は `aria-selected="true"`。
- 検索欄の名前は `aria-label` で渡す（既定は「検索」）。Base UI は Field の中で検索欄にもラベルを関連付けるため、`ComboboxInput` は名前を表す要素を置いて `aria-labelledby` で参照させ、欄の名前（「取引先」）と検索欄の名前（「取引先を検索」）を区別している。
- 絞り込みの既定は、`label` と `keywords` の部分一致である（[advanced.md](advanced.md#検索の仕様)）。独自の方法は `filter` で渡す。
- サーバー側で検索する場合は `filter={null}` にし、`useComboboxSearch` の `onQueryChange` を `onInputValueChange` に渡す。待ち時間、古い結果の破棄、閉じた後とアンマウントの後の扱い、再試行は [advanced.md](advanced.md#非同期の検索の責務) を参照する。選んだ項目が検索結果に含まれなくても欄に表示できるよう、製品は選んだ項目を `items` に残す。
- 無効（`disabled`）と読み取り専用（`readOnly`）では開かない。
- `name` を指定すると、隠れた入力欄で値（`{ value, label }` の場合は `value`）を送信する。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| 入力欄に直接入力して検索し、入力した文字を値にする | 検索中の文字と選んだ値の区別がつかず、存在しない値が送信される | 閉じた状態は Select と同じにし、検索はメニューの中で行う |
| 5 つの選択肢に Combobox を使う | 検索欄が操作を増やすだけになる | Select を使う |
| 文字を入力した時点で値を変える | 意図せず値が変わり、閉じた後に気付けない | 選んだときだけ値を変える |
| 結果なしと取得失敗を同じ文で示す | 失敗に気付かず、項目がないと誤解する | `ComboboxStatus` で失敗と再試行を示す |
| 自由入力の文字を自動で新しい項目として登録する | 表記の揺れた重複が増える | 新規作成は明示的な操作にする |
