# Command

アプリケーションの機能、ページ、情報へ素早く移動する。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/command.tsx`](../../../registry/components/ui/command.tsx) |
| 元にした実装 | shadcn/ui の Command と同じ部品名。cmdk ではなく、Base UI の Autocomplete と Flow Design の Dialog で作った（[advanced.md](advanced.md#依存パッケージ)） |
| 状態 | 初期実装 |

## 1. Purpose

ユーザーが、場所を覚えている機能や情報に、メニューをたどらずに届けるようにする。

## 2. Usage

- 通常のナビゲーションを補助する。Sidebar などの主要なナビゲーションを削除する理由にしない（[advanced.md](advanced.md#4-command-と通常のナビゲーション)）。
- ショートカット（macOS は Cmd + K、Windows と Linux は Ctrl + K）と、画面に見える検索ボタンの両方で開く。
- 候補は、ページ、操作、設定、製品内の情報など、意味のあるまとまりに分ける。
- 権限のない操作は候補に含めない。危険な操作は Alert Dialog で確かめ、Command から直接実行しない。
- ページの中で値を選ぶ場合は、Combobox を使う。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| Dialog（`CommandDialog`） | 中央。最大幅 640px、角丸 20px、高さは 480px と画面の高さの小さい方で固定。背景と開閉は Dialog と同じ | Dialog の `size="lg"`、`rounded-xl` |
| 検索欄（`CommandInput`） | 高さ 56px、文字 16px。左に Lucide の Search（20px）、下に区切りの線 | `h-14`、`text-body` |
| グループの見出し（`CommandGroup` の `heading`） | 12px、`muted-foreground` | `text-caption` |
| 候補（`CommandItem`） | 高さ 48px 以上、角丸 12px、文字 14px、アイコン 20px（Lucide）。選んでいる候補の面は `accent` | `min-h-12`、`rounded-md`、`text-ui`、`bg-accent` |
| ショートカットの表示（`CommandShortcut`） | 12px、`muted-foreground`。表示だけ | `text-caption` |
| 結果なし（`CommandEmpty`）、状態（`CommandStatus`） | 14px、`muted-foreground` | `text-ui` |

検索の結果によって Dialog の高さを変えない。中央に置いた Dialog の高さが変わると、検索欄の位置が動くため。

```tsx
const [open, setOpen] = useState(false)
useCommandShortcut(() => setOpen((o) => !o))

<Button variant="outline" onClick={() => setOpen(true)}>ページや操作を検索 {commandShortcutLabel()}</Button>
<CommandDialog open={open} onOpenChange={setOpen}>
  <Command items={groups}>
    <CommandInput placeholder="ページ、操作、設定を検索" aria-label="ページ、操作、設定を検索" />
    <CommandEmpty>一致する項目がありません</CommandEmpty>
    <CommandList>
      {(group) => (
        <CommandGroup key={group.value} items={group.items} heading={group.label}>
          <CommandCollection>
            {(item) => (
              <CommandItem key={item.value} value={item} onSelect={() => run(item)}>
                <item.icon />
                {item.label}
              </CommandItem>
            )}
          </CommandCollection>
        </CommandGroup>
      )}
    </CommandList>
  </Command>
</CommandDialog>
```

## 4. Variants

| 状態 | 表し方 |
| --- | --- |
| 開いた直後 | すべての候補をグループごとに表示し、先頭の候補を選んでいる |
| 絞り込み中 | 一致する候補だけを表示する。一致がないグループは見出しも消える |
| 結果なし | `CommandEmpty` の文 |
| 読み込み中、取得失敗 | `CommandStatus`（Combobox の `ComboboxStatus` と同じ） |
| 埋め込み | `Command` を Dialog の外に置く。ページの中では通常 Combobox を使う |

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| Cmd + K（macOS）、Ctrl + K（それ以外）、検索ボタン | 開き、検索欄にフォーカスを移す。開いているときのショートカットは閉じる |
| 文字を入力する | `label` と `keywords` の部分一致で絞り込む |
| ↑ ↓ | 候補を移る（`aria-activedescendant`） |
| Enter、押す | 選んでいる候補の `onSelect` を呼ぶ |
| Esc | 閉じる。フォーカスを開く前の要素に戻す |

- `useCommandShortcut` は、IME の変換中（`isComposing`）、Shift や Alt を併用したとき、別の修飾キー（macOS の Ctrl + K など）には反応しない。一致したときだけ `preventDefault` する。`enabled` で解除でき、`key` で別のキーに変えられる。
- 実行の処理は製品が `onSelect` で行う。ページの移動に、特定のルーティングのライブラリを前提にしない。
- 長い候補の一覧は、Dialog の中でスクロールする。
- 開閉の動きは Dialog に従い、動きを減らす設定では大きさを変えない。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| Command があるので Sidebar を省く | ショートカットや機能の名前を知らない人が、機能に届かない | 通常のナビゲーションを残す |
| ショートカットだけで開く | ショートカットを知らない人が使えない | 検索ボタンを置く |
| 「削除」を選んだらすぐに実行する | 誤って選んだ操作を取り消せない | Alert Dialog で確かめる |
| 権限のない操作を候補に出し、選んだ後にエラーにする | 使えない操作を探させ、失敗させる | 候補に含めない |
| 検索の結果に合わせて Dialog の高さを変える | 入力のたびに検索欄が上下に動く | 高さを固定する |
