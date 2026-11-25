# Feedback コンポーネントの判断基準

Badge、Avatar、Tooltip、Alert、Toast、Skeleton、Progress に共通する判断基準。目的は、必要な状態や結果を明確に伝えながら、作業を妨げないことである。

| コンポーネント | 資料 |
| --- | --- |
| Badge | [badge.md](badge.md) |
| Avatar | [avatar.md](avatar.md) |
| Tooltip | [tooltip.md](tooltip.md) |
| Alert | [alert.md](alert.md) |
| Toast | [toast.md](toast.md) |
| Skeleton | [skeleton.md](skeleton.md) |
| Progress | [progress.md](progress.md) |

## 1. 使い分け

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/feedback-choice-dark.svg">
  <img alt="伝えたいことと使うコンポーネントの対応。現在の状態・分類は Badge、人物・組織は Avatar、補足は Tooltip、継続して示す重要な情報は Alert、一時的な操作の結果は Toast、読み込み中の画面の構造は Skeleton、処理の進み具合は Progress。" src="../../diagrams/feedback-choice-light.svg">
</picture>

| 迷う組み合わせ | 判断の基準 |
| --- | --- |
| Alert と Toast | 画面を離れるまで残す必要があれば Alert。数秒で消えてよい結果なら Toast |
| Toast と画面の変化 | 結果が画面に表れる（一覧に行が増えるなど）なら、Toast は出さなくてよい |
| Alert と FieldError | 入力項目に固有のエラーは FieldError。フォーム全体や画面全体の問題は Alert |
| Skeleton と Progress | 画面の構造を示すなら Skeleton。処理の量や残りを示すなら Progress |
| Tooltip と文字 | 操作に必要な説明は画面に文字で書く。Tooltip は補足だけ |

## 2. 重複を避ける

同じ情報を複数の Feedback で重ねて伝えない。重ねる場合は、それぞれの役割を決める。

| 例 | 役割の分け方 |
| --- | --- |
| 一括送信の失敗 | Toast で結果を知らせ、失敗した行は Badge で一覧に残す。重大な失敗を Toast だけに頼らない |
| 読み込みの失敗 | Skeleton を消し、失敗の文と次の操作を表示する。Skeleton を出し続けない |
| 送付先が未設定の顧客 | Alert で件数と次の操作を示し、該当する行は Badge で示す |

## 3. 色と意味

| 意味 | 色 | Badge | Alert / Toast のアイコン |
| --- | --- | --- | --- |
| 一般 | `muted-foreground` | Neutral | Info |
| 成功、完了 | `success` | Success | CircleCheck |
| 注意 | `warning` | Warning | TriangleAlert |
| エラー、失敗 | `destructive` | Destructive | CircleAlert |
| 情報、処理中 | `info` | Info | Info |

- 背景は無彩色にし、意味は色の付いた文字、境界線、アイコンと文章で示す。淡い背景や塗りつぶしを標準にしない。
- 色だけで伝えない。必ず文字で状態を書く。
- 同じ意味には同じ色を使う。状態ではない分類に、成功や危険の色を使わない。
- 色は Design Tokens の値で、白い背景の上で文字は 4.5:1、アイコンは 3:1 以上である（[tokens.md](../tokens.md#コントラスト)）。

## 4. 支援技術への伝え方

| コンポーネント | 伝え方 |
| --- | --- |
| Badge、Avatar | 文字として読み上げる。Avatar は隣に名前があれば読み上げない |
| Tooltip | 見える補足。名前は `aria-label` などで別に付ける |
| Alert | 最初から表示するものは role なし。操作の結果として表示する重要なエラーは `role="alert"`、成功は `role="status"` |
| Toast | Base UI が読み上げ用の領域で知らせる。失敗（priority high）は即時、それ以外は他の読み上げを妨げない |
| Skeleton | 読み上げない（`aria-hidden`）。親要素の `aria-busy` と、状態の文字で知らせる |
| Progress | `role="progressbar"`、`aria-valuenow`。不明のときは `aria-valuenow` を出さない |

## 5. 動き

| コンポーネント | 動き | 動きを減らす設定 |
| --- | --- | --- |
| Tooltip | 120ms で表示・非表示 | 透明度だけで変化する |
| Toast | 180ms で表示・非表示 | 透明度だけで変化し、位置は動かない |
| Skeleton | 1.8 秒周期の明滅 | 止まる |
| Progress | 値の変化を 240ms で追う。不明は帯が流れる | 値は即時に変わり、不明の帯は中央で止まる |

## 6. 標準の API と互換の API

| コンポーネント | Flow Design の標準 | shadcn/ui との互換のために受け付けるもの |
| --- | --- | --- |
| Badge | `neutral`、`success`、`warning`、`destructive`、`info` | `default`、`secondary`、`outline`（Neutral と同じ見た目）。`ghost`、`link` は提供しない |
| Avatar | `label` で名前を付ける。大きさは `xs`〜`xl` | `AvatarImage` の `alt` を名前にする。大きさの名前は同じだが値が異なる |
| Tooltip | 既定の遅延 700ms | `TooltipProvider`、`TooltipTrigger` の `delay` |
| Alert | `variant` から自動のアイコン、`icon` | 子要素のアイコン（直下の `svg`）。`variant="default"` |
| Toast | `useToast()`、`ToastProvider`、`Toaster` | なし（Sonner の API とは異なる） |
| Skeleton | そのまま | 同じ |
| Progress | `status`、`ProgressCircle` | 同じ構成（`ProgressLabel`、`ProgressValue` など） |

## 7. 製品が担うこと

| 場面 | 製品が担うこと |
| --- | --- |
| 重大なエラー、必要な操作 | Toast だけに頼らず、画面の中に状態（Badge、Alert）と操作を示す |
| 動的に表示する Alert | 重要なエラーは `role="alert"`、成功は `role="status"` を付ける |
| 読み込み | 親要素の `aria-busy` と、`role="status"` の文字。失敗したら Skeleton を消す |
| 進捗 | 実際の処理量から進捗率を出す。完了、失敗、中断を区別する |
| Avatar の名前 | 隣に名前がない場合は `label` か `alt` で名前を付ける |

## 8. 実際のスクリーンリーダーで未確認の事項

自動の検品では、属性と、読み上げ用の領域に入る文までを確認した。次は VoiceOver、NVDA などで人が確認する必要がある。

- Toast：失敗の通知の即時の読み上げ、操作のボタンの伝わり方、F6 で移動したときの読み上げ（[toast.md](toast.md#実際のスクリーンリーダーで未確認の事項)）
- Alert：`role="alert"` を付けて表示したときの読み上げ
- Progress：値が変わったときに、どの程度の頻度で読み上げられるか
- Skeleton：`aria-busy` を外したときに、読み込み後の内容がどう伝わるか
