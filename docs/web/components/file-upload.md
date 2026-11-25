# File Upload

ファイルを選び、送信と処理の状況を確かめる。

| | |
| --- | --- |
| 実装 | [`registry/components/ui/file-upload.tsx`](../../../registry/components/ui/file-upload.tsx) |
| 元にした実装 | shadcn/ui に同じ部品はない。ネイティブの `<input type="file">` と Flow Design の Button、Progress で作った |
| 状態 | v0.1 確定 |

## 1. Purpose

ユーザーが、送る前に選んだファイルを確かめ、送信と処理が終わったかどうかを、待っている間も判断できるようにする。

## 2. Usage

| 形式 | 用途 |
| --- | --- |
| ボタン（`FileUploadButton`） | プロフィール画像の変更、小さな添付欄、補助的な登録 |
| ドロップゾーン（`FileUploadDropzone`） | CSV の取り込み、複数ファイルの登録、ファイルの登録が画面の主な目的のとき |

- 選ぶことと送信することを分ける。選んだファイルの名前、大きさ、検証の結果を確かめてから、アップロードボタンで送信を始める。
- プロフィール画像やチャットの添付など、選んだらすぐに送るのが自然な用途は例外とする。
- 選べる形式、最大の大きさ、件数を、選ぶ前に示す。

## 3. Anatomy

| 部分 | 値 | トークン |
| --- | --- | --- |
| ドロップゾーン | 1px の破線（`input`）、角丸 12px、背景 `background`、余白 24px、影なし | `border-dashed`、`rounded-md`、`p-6` |
| ドロップゾーンのアイコン | Lucide の Upload、32px、`muted-foreground` | `size-8` |
| 案内 | 16px、太さ 500 | `text-body` |
| 制限の説明 | 14px、`muted-foreground`。選択のボタンの `aria-describedby` になる | `text-ui` |
| 選択のボタン | Button（`outline`） | |
| ドラッグ中 | 面を `accent`、境界線を `primary` | |
| ファイルの行（`FileUploadItem`） | アイコン（20px）、名前（14px、太さ 500、折り返す）、形式・大きさ・状態（12px）、進捗（Progress）、操作。行の間は細い線 | `text-ui`、`text-caption` |

```tsx
<FileUploadDropzone accept=".csv,text/csv" maxSize={10 * 1024 * 1024} onFilesSelected={({ accepted, rejected }) => { /* ... */ }} />
<FileUploadList>
  <FileUploadItem name={file.name} size={file.size} type={file.type} status={status} progress={progress}
    onRemove={remove} onCancel={canCancel ? cancel : undefined} onRetry={retry} />
</FileUploadList>
<Button onClick={start}>アップロード</Button>
```

## 4. Variants

### ファイルの状態

| `status` | 表示 | 操作 |
| --- | --- | --- |
| `selected` | アップロード前 | 一覧から外す |
| `validating` | 確認しています。進捗は不明 | |
| `uploading` | アップロードしています。進捗率 | 中止（`onCancel` を渡したときだけ） |
| `uploaded` | アップロード完了。処理を待っています | |
| `processing` | データを処理しています。進捗率、わからなければ不明 | 中止（`onCancel` を渡したときだけ） |
| `done` | 完了（`success` の色とアイコン） | |
| `error` | 失敗しました（`destructive` の色とアイコン）と原因 | 再試行、一覧から外す |
| `canceled` | 中止しました | 再試行、一覧から外す |

- 送信が 100% になったこと（`uploaded`）と、サーバーのデータ処理が終わったこと（`done`）を区別する。
- 進捗率がわからないときは `progress={null}` にし、数値を出さない（Progress の不明の表示）。
- `statusLabel` で状態の文を具体的にできる（例：「1,248 行を取り込みました」）。

## 5. Behavior

| 操作 | 動き |
| --- | --- |
| ドロップゾーンを押す | ファイルを選ぶ画面を開く |
| 選択のボタン（Tab、Enter、Space） | ファイルを選ぶ画面を開く |
| ファイルをドロップする | ドラッグ中の表示を出し、ドロップしたファイルを受け取る |
| ファイルを選ぶ | 検証し、`onFilesSelected` に `accepted` と `rejected`（理由つき）を渡す。送信はしない |

- ドロップゾーンの領域はフォーカスを受けない。キーボードでは中の選択のボタンで選ぶ。領域を押せるのはポインターの操作を速くするためである。
- `validateFiles` は、形式（`accept`）、1 ファイルの大きさ（`maxSize`）、件数（`maxFiles`、`currentCount`）を確かめる。拡張子と MIME Type の表記だけを見るため、ファイルが安全かどうかは判定しない。最終的な検証は、サーバーが形式、内容、大きさ、認証・認可について行う。
- 選べなかったファイルは、名前と理由を Alert で示す（例：「big.png：10 MB 以下のファイルを選んでください（このファイルは 11 MB）」）。
- 大きさは 1 KB = 1,024 バイト、1 MB = 1,024 KB で計算し、「B」「KB」「MB」「GB」「TB」で表示する。100 未満は小数点以下 1 桁、100 以上は整数に丸める（120,000 バイトは「117 KB」）。上限の `maxSize` もバイト数で渡し、同じ基準で表示する。
- 選んでいるファイル（`existingFiles`）と、名前、大きさ、更新日時が同じファイルは、重複として選べない（`duplicate`）。同じ選択の中の重複も同じ。内容は比べない。
- 件数の上限は、選んでいる件数（`currentCount`）を含めて数える。複数回のドロップでも同じ。
- 状態は製品が決めて渡す。コンポーネントは成功を推測しない。同じファイルの送信を重ねて始めないこと、中止の後に届いた完了の通知を無視することは、製品が行う（[advanced.md](advanced.md#6-ファイルの登録)）。
- 状態の文は `role="status"` で、変化を支援技術に伝える。進捗率の数値は状態の文に含めず、Progress の `aria-valuenow` で伝える。読み上げが進捗のたびに繰り返されないようにするため。
- 長いファイル名は省略せず、どこでも折り返して全文を表示する。
- API の通信、保存、認証、ウイルス検査、内容の検証、データ処理、再試行、中断の処理は製品が行う。コンポーネントは、状態と操作のコールバックを受け取って表示する。特定のクラウドサービスやアップロードのライブラリに依存しない。

## 6. Anti-patterns

| 避ける | 理由 | 代わりに |
| --- | --- | --- |
| CSV を選んだらすぐに取り込む | 間違ったファイルを選んでも止められない | 確かめてからアップロードボタンで始める |
| 送信が 100% になったら「完了」と表示する | サーバーの処理中に画面を離れ、取り込みが終わっていないことに気付けない | 処理が終わってから完了にする |
| 時間の経過で進捗率を進める | 実際の状況と違う | 不明の表示にする |
| 中止できない処理に中止のボタンを置く | 押しても止まらず、状態がわからなくなる | 中止できる処理だけに出す |
| ドラッグ＆ドロップだけで選ばせる | キーボードやタッチ操作では選べない | 選択のボタンを置く |
| 拡張子を確かめたことで安全とみなす | 拡張子は変更できる | サーバーで内容を検証する |
