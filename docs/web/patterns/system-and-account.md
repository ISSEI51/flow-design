# System & Account

製品の機能そのものではなく、利用者が製品を安全に、快適に使い続けるための共通の体験を扱う Patterns のグループ。Authentication、Settings、Onboarding、Permission States、System States、Notifications の 6 種類からなる。Patterns の段階の最後のグループである。

状態：初期実装（レビュー前。v0.1 確定ではない）

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/system-and-account-dark.svg">
  <img alt="System & Account の 6 種類の関係の図。上の段に、利用の流れとして 1 Authentication（製品に入る。ログイン、多要素認証、再認証、ログアウト）、2 Onboarding（最初の価値を体験する。初期設定、Checklist、初回の Empty State）、3 Settings（自分と組織に合わせる。個人・組織の設定、保存の単位と結果）が矢印でつながっている。Onboarding と Settings の下に、破線の枠で Notifications（知る価値のあることを、作業を妨げずに知らせる。通知センター、既読と業務の対応、通知の設定）がある。その下に、3 つの段階と Notifications のすべてに適用する横断の帯として、Permission States（できることを正しく示す。非表示・無効化・閲覧専用、理由、権限申請。UI の制御は認可の代わりではない）と System States（状態を正しく伝える。接続、障害、メンテナンス、結果不明、長時間の処理。影響のない機能を止めない）がある。最下段に、共通の状態として Authentication、Authorization、Entitlement、Scope、Connectivity、Service Health、Data State、Mutation State、Job State、Notification State を 1 つの Boolean や 1 つの error にまとめないことを示している。" src="../../diagrams/system-and-account-light.svg">
</picture>

## 基本の方針

- 利用者にシステムの都合を必要以上に意識させない。認証と初期設定は必要最低限にする。
- 設定しなくても使いやすい初期状態にする。利用者が製品の価値を体験するまでの時間を短くする。
- 利用できない機能で画面を複雑にしない。障害の間も、影響を受けていない機能は使えるようにする。
- 通知で、現在の作業を不必要に中断させない。
- 安全性、機能性、アクセシビリティを犠牲にしない。
- 実際には確認できていない処理の結果を、成功として表示しない。

## Components と Patterns の関係

Button、Input、Field、Switch、Select、Checkbox、Radio Group、Alert、Toast、Dialog、Alert Dialog、Sheet、Popover、Dropdown Menu、Empty、Progress、Table、Data Table、Command、Sidebar、Avatar は Components（v0.1）である。System & Account は、これらと App Structure（App Shell、Minimal Shell、Page Layout、Page Header、Section Layout、Sidebar Nav）、Data Browsing（`useBrowseData`、`DataRegionError`、Data States の区別）を組み合わせる。既存の Components の API は変更していない（「既存の Components と Patterns への影響」）。

## 6 種類

| Pattern | 目的 | 資料 | 再利用できるコード（`registry/patterns/`） |
| --- | --- | --- | --- |
| Authentication | 製品に安全に入り、出る | [authentication.md](authentication.md) | `auth-layout.tsx`：`AuthLayout`<br>`password-input.tsx`：`PasswordInput`<br>`verification-code-input.tsx`：`VerificationCodeInput`<br>`auth-feedback.tsx`：`AuthFormError`、`AuthStatus`、`authErrorCopy`<br>`auth-flow.ts`：`toSafeReturnPath`、`resolveReturnTo`、`checkEmailFormat`、`normalizeVerificationCode`、`evaluatePasswordRequirements`、`planReauthentication` |
| Settings | 個人と組織の設定を、保存の単位ごとに正しく保存する | [settings.md](settings.md) | `settings-layout.tsx`：`SettingsLayout`、`SettingsNav`、`SettingsBackLink`<br>`setting-status.tsx`：`SettingRow`、`SettingSaveStatus`<br>`setting-save.ts`：`useInstantSettings`、`useSettingsForm`、`classifySaveError`<br>`setting-resolve.ts`：`resolveSetting`、`resolveDependent`、`settingAccess`、`toSettingSearchGroups`、`planReset`、`applyReset` |
| Onboarding | 最初の価値の体験までを短くする | [onboarding.md](onboarding.md) | `onboarding.ts`：`resolveFirstScreen`、`deriveChecklist`、`getSetupStatus`、`pickGuidance`<br>`getting-started.tsx`：`GettingStartedChecklist`<br>`contextual-help.tsx`：`ContextualHelp` |
| Permission States | できること、できない理由、解決の方法を正しく示す | [permission-states.md](permission-states.md) | `access-decision.ts`（純粋な関数）と `access.ts`（`access-decision.ts` を再 export）：`useAccess`、`decideAccess`、`presentAction`、`resolveContentAccess`、`pageAccessFromStatus`、`diffPermissions`、`restrictionText`<br>`restricted-action.tsx`：`RestrictedAction`、`RestrictionNotice`、`useFocusRecovery`<br>`access-state.tsx`：`AccessState` |
| System States | 接続、障害、メンテナンス、結果不明、長時間の処理を区別して伝える | [system-states.md](system-states.md) | `system-status.ts`：状態の型、`summarizeIssues`、`getMutationAvailability`、`canAutoRetry`、`mergeJobUpdates` など<br>`system-status-hooks.ts`：`useConnectivity`、`useStableIssues`<br>`system-banner.tsx`：`SystemBanner`<br>`service-state.tsx`：`ServiceUnavailable`、`SystemStatusIndicator`<br>`job-status.tsx`：`JobStatusList`、`JobStatusItem` |
| Notifications | 知る価値のあることを、作業を妨げずに知らせる | [notifications.md](notifications.md) | `notification-state.ts`：重複の除去、集約、未読の表示、一括既読の範囲、Quiet Hours の判定<br>`notification-feed.ts`：`useNotificationFeed`<br>`notification-indicator.tsx`：`NotificationButton`、`NotificationIndicator`<br>`notification-list.tsx`：`NotificationList`<br>`notification-center.tsx`：`NotificationCenter` |
| 共通 | 取得以外の非同期処理の結果を、開始したスコープと最新の要求にだけ反映する | この資料の「共通の状態管理と安全性」 | `scope-guard.ts`：`useScopeGuard` |

### コードと資料の区分

| 区分 | 内容 | 理由 |
| --- | --- | --- |
| 再利用できるコード | 上の表の部品、hook、純粋な関数 | 復帰先の検証、古い応答の破棄、結果が不明な保存、未確定の権限、一括既読の範囲、接続の確認と読み上げの抑制は、製品ごとに書き直すと誤りやすい。Registry で品質を保つ |
| 組み合わせの例（プレビュー） | 各 Pattern の `*-screens.tsx`（ログインの画面、設定の画面、組織の作成、権限の画面、System Banner の領域、通知センターの接続）と、統合の検証画面 `account-app` | 画面の段階、API の形、ルーターは製品の基盤で大きく変わる。1 つの巨大な部品や Context にせず、組み合わせ方を示す |
| 設計の資料だけ | 認証の方式の選び方、Split Layout を使う条件、即時保存と明示的な保存の選び方、Product Tour を使う条件、評価の指標、非表示と無効化の判断、権限不足を不存在として扱う条件、通知の方法の選び方、Status Page の運用、オフライン登録の 3 方式 | 画面と製品ごとの判断であり、コードでは決められない |
| 製品の責務 | 実際の認証・認可、セッション、メール送信とトークン、設定の永続化、監査ログ、イベントの計測、接続とサービスの監視、ジョブの実行、通知の生成と配信、キャッシュの破棄 | 製品の基盤に依存する。Registry は状態を保存しない（LocalStorage、IndexedDB、URL、Cookie に依存しない） |

## 共通の状態管理と安全性

次の状態を、別々の概念として持つ。1 つの Boolean や、1 つの error にまとめない。

| 状態 | 内容 | 主に扱う Pattern と部品 |
| --- | --- | --- |
| Authentication | 本人の認証の状態（未認証、追加の確認の途中、認証済み、セッション切れ） | Authentication（画面の段階は製品が持つ。`planReauthentication`） |
| Authorization | 閲覧・変更の許可 | Permission States（`useAccess`、`decideAccess`） |
| Entitlement | 契約プランによる利用の可否 | Permission States（`Restriction` の `entitlement`） |
| Scope | アカウント、ワークスペース、認可の境界 | すべて（`scopeKey`、`useScopeGuard`） |
| Connectivity | サービスとの接続の状態 | System States（`useConnectivity`） |
| Service Health | サービスと機能の稼働の状態 | System States（`ServiceStatusReport`、`healthOf`） |
| Data State | データの取得と鮮度 | Data Browsing の `useBrowseData` |
| Mutation State | 保存・変更の処理の状態（保存中、成功、失敗、結果不明、権限不足） | Settings（`SettingSaveState`）、System States（`MutationStatus`） |
| Job State | 長時間の処理の状態 | System States（`JobState`、`mergeJobUpdates`） |
| Notification State | 通知の取得、閲覧、配信の状態 | Notifications（`useNotificationFeed`、`describeDelivery`） |

Data Browsing v0.1 の状態管理と競合させない。取得は `useBrowseData`（`scopeKey`、`requestKey`、要求ごとの番号、`canOperate`）を使い、取得以外の処理（保存、既読の更新、権限の申請、作成）は `useScopeGuard` を使う。

### 守ること

| 安全性 | 方法 |
| --- | --- |
| 操作の可否と表示の可否を分ける | `useBrowseData` の `isCurrent` と `canOperate`、`resolveContentAccess` の `read-only`、`decideAccess` の再確認中（前の権限で表示し、操作は止める） |
| スコープの境界をまたぐデータを混ぜない | スコープが変わったら、同じ描画から前のデータを返さない（`useBrowseData`）。`useScopeGuard` は描画の時点で世代を進め、A → B → A と戻っても最初の A の結果を反映しない |
| `AbortSignal` だけに頼らずに古い応答を無効にする | 要求ごとの番号と世代で判定する。各 Pattern の模擬のサーバーは `ignoreAbort` で中止に従わない応答を返せる |
| 実行の対象を固定する | 一括既読は開始のときの範囲（ID の一覧か、開始の時刻のカーソル）で固定する。処理の間に届いた新着を既読にしない |
| 二重の実行を防ぐ | 認証のボタンの Loading と要求中の判定、明示的な保存の要求中の判定、権限の申請の承認待ちの判定（サーバーでも同じ申請を作らない）、組織の作成の要求の ID |
| 結果が不明な処理を確かめ直す | `MockUnknownError`（模擬）を結果の不明として扱い、成功にも失敗にもしない。「確認する」で再取得する。即時の保存で結果が不明な場合は、表示を戻さない（サーバーの状態まで戻ったと判断しない） |
| アンマウントの後の古い結果を反映しない | `useScopeGuard` と `useBrowseData` は、アンマウントで世代を進める |
| 古い権限で操作させない | 権限の取得中と取得の失敗は許可として扱わない。権限の変更を知らせで受け取ったら取得し直し、再確認の間は操作を止める |
| Toast の操作で別のスコープを操作させない | 統合の検証画面では、ワークスペースと権限が変わったら表示中の Toast を閉じる。利用者が変わったら（ログアウト、別の利用者の再認証）も閉じる |

アカウント、ワークスペース、権限の変更に伴う実際のキャッシュの破棄と、バックエンドの認可は、製品の責務である。

```tsx
// 取得以外の処理を、開始したスコープと最新の要求にだけ反映する
const guard = useScopeGuard(`${userId}:${workspaceId}`)
const save = async (key: string, value: unknown) => {
  const ticket = guard.begin(key) // 同じキーの前の処理は、最新ではなくなる（中止はしない）
  try {
    const saved = await api.save(key, value) // 製品の API
    if (guard.isLatest(ticket)) apply(key, saved)
  } catch (error) {
    if (!guard.isLatest(ticket)) return // 別のスコープ、新しい処理、アンマウントの後の応答は反映しない
    if (isUnknownOutcome(error)) markUnknown(key) // 成功とも失敗とも判断しない
    else revert(key)
  }
}
```

## プレビュー

`npm run preview:dev` で開き、上部の「Patterns：System & Account」から選ぶ。

| ページ | URL | 内容 |
| --- | --- | --- |
| Authentication | `#/authentication` | Minimal・Card・Split のレイアウト、6 つの認証の方式、入力と autocomplete、パスワードの表示、確認コード、認証のエラー、新規登録、メールの確認、パスワードの再設定、復帰先の検証、セッション切れ、ログアウトとアカウントの切り替え、比較 |
| Settings | `#/settings` | Sidebar 型の設定の画面、適用範囲、即時保存と明示的な保存、保存の単位、保存の結果、継承と制限、親と子の設定、設定の検索、標準設定への復元、重大な操作の分離、モバイル、比較 |
| Onboarding | `#/onboarding` | 最初の画面、組織の作成（任意の手順のスキップ、再開）、Getting Started Checklist、初回利用の Empty State、Contextual Help、サンプルデータ、招待されたメンバー、比較 |
| Permission States | `#/permission-states` | 非表示・無効化・閲覧専用、制限の理由、ページのアクセス、部分的な閲覧の権限、権限の申請、契約プラン、利用中・編集中の権限の変更、Permission Matrix とロールの変更、比較 |
| System States | `#/system-states` | 状態の分類、影響の範囲と表示の位置、System Banner、オフラインと再接続、新規登録の 3 方式、メンテナンス、サービスの停止、結果が不明な保存、長時間の処理、Status Page、比較 |
| Notifications | `#/notifications` | 通知の方法の選び方、通知センター、未読の表示、既読と業務の対応、集約と重複の防止、対象への移動、通知の設定、通知疲れの防止、状態と信頼性、比較 |
| 統合の検証画面 | `#/account-app` | 6 種類を組み合わせた営業管理の画面。下の表 |

統合の検証画面は System & Account の検証のためのものであり、正式な Pages の実装ではない。App Structure と Data Browsing の検証画面は変更せず、別の画面として作った（`ProductMark` だけを読み込む）。プレビューのページは Registry の `@/patterns/*` と `@/components/ui/*` を読み込み、複製しない。模擬のサーバーと例のデータは `preview/src/data/system-account/` にあり、Registry には含めない。共通のモックデータ（アカウント、ワークスペース、ロール、権限、プラン、設定値、通知、Onboarding の作業）は `model.ts` にあり、7 つのページで同じ値を使う。

認証、認可、メール送信、通知の配信、障害の監視は、すべて模擬の処理である。実際の認証情報を入力する必要はない（模擬のパスワードと確認コードは、検証用の操作の中と各ページに示す）。入力したパスワードと確認コードは、画面のメモリだけに置き、ストレージ、URL、ログに書かない。

### 統合の検証画面の場面

ページの最後の「検証用の操作（プレビュー専用）」で、ログインの前の開き方、ロール、セッション、設定の保存の結果、お知らせの取得、端末のネットワーク、サービスへの経路、サービスの状態を切り替える。検証用の操作は、模擬のサーバーの設定を変えるだけで、製品の画面の状態を直接書き換えない。

| 場面 | 操作 |
| --- | --- |
| ログイン、認証の失敗、多要素認証 | `#/account-app` で佐藤 花子（本社営業部は多要素認証が必須）としてログインする。誤ったパスワードでは、アカウントの有無を区別しない文を示す |
| 新規登録、メールの確認、組織の作成、任意の設定のスキップ | 開き方「新規登録して組織を作成する」。模擬の受信箱のリンクを開くと組織の作成に移り、作成の後は成功の画面を挟まずに最初の画面（初回利用の Empty State と Checklist）へ移る |
| パスワードの再設定 | ログインの画面の「パスワードを忘れた場合」。再設定の後は自動でログインせず、ログインの画面で知らせる |
| 招待されたメンバーの利用開始 | 開き方「招待のリンクから開く（鈴木 一郎）」 |
| ログインの後の復帰 | 開き方「ログインの後に顧客の詳細へ戻る」。所属していないワークスペースや権限のない画面には戻さない |
| 組織の SSO | 開き方「組織の SSO が必須の組織（西日本営業部）」 |
| App Shell、アカウントメニュー、ワークスペースの切り替え | Sidebar の下部のアカウントメニュー。所属しているワークスペースだけを示す |
| 個人設定、組織設定、設定の検索、即時保存、明示的な保存、継承と制限 | Sidebar の「設定」 |
| メンバー管理、権限管理 | 「メンバーと権限」（`members.view` がない利用者には Sidebar に示さない） |
| 通知センター、通知設定、通知から対象への移動 | Header の右側のお知らせのボタン。設定の未保存の変更があるときは、移動の前に確認する |
| Getting Started Checklist | ホーム。非表示にした場合は、ページの見出しの横の「はじめにやることを表示」で再表示する |
| セッション切れ | 「セッションの有効期限を切る」。製品の画面を描画せず、同じ利用者なら開いていた画面に戻り、別の利用者なら前の利用者の位置を引き継がない |
| 権限の変更 | ロールの切り替え。再読み込みせずに、Sidebar とページのアクセスを更新する |
| オフライン、再接続、復旧の確認 | 端末のネットワーク、サービスへの経路 |
| 部分障害、メンテナンス、サービスの停止 | サービスの状態。製品全体の停止とメンテナンスでは、製品の画面を状態の画面に置き換える |
| 保存の結果が不明 | 設定の保存の結果「結果が不明」 |
| 長時間の処理 | 「処理の状況」（書き出しと取り込み） |
| 通知の取得の失敗 | お知らせの取得「失敗する」 |

URL の引数：`page`（`home`、`customers`、`customer`、`notifications`、`settings`、`members`、`jobs`、`status`）、`ws`（`hq`、`west`）、`id`（顧客）、`cat`（設定のカテゴリ）、`start`（ログインの前の開き方：`signin`、`sso`、`return`、`invited`、`signup`）。ログインの状態（セッション）は URL とストレージに入れず、画面のメモリだけに持つ（再読み込みするとログインの画面に戻る）。

## 製品の責務（共通）

- 実際の認証・認可のサービス、OAuth・OIDC・SSO、Passkey の登録と検証、多要素認証の検証、メールの送信とトークンの発行・検証・期限、送信の回数の制限、試行の回数の制限、アカウントの列挙の対策。
- セッションの管理（更新、破棄、ほかのタブとの同期）、キャッシュの破棄。
- 閲覧の権限のないデータをクライアントへ送らない。URL、要求、ワークスペースの ID を無条件に信頼しない。UI の非表示と無効化は認可の代わりではない。
- 設定の永続化、変更の履歴と監査ログ、組織のポリシーの強制。
- Onboarding の状態の永続化、価値の体験の定義と計測。
- 接続とサービスの監視、Status Page の運用（主要なサービスと異なる障害の境界で運用する）、ジョブの実行と管理、再試行の制御と冪等性。
- 通知の生成、重複の排除、配信（メール、プッシュ）、配信の状態の記録、OS とブラウザの通知の許可。

## 既存の Components と Patterns への影響

| 対象 | 変更 | 互換性 |
| --- | --- | --- |
| Components（`registry/components/ui/`） | 変更なし | |
| App Structure、Data Browsing（`registry/patterns/` の既存の 14 ファイル、資料、検証画面） | 変更なし | `MinimalShell`、`AppShell`、`useBrowseData`、`DataRegionError`、`SidebarNav` をそのまま使う |
| `preview/src/catalog.ts` | 分類「Patterns：System & Account」と 7 ページを追加した | 既存のページの id と URL は変わらない |
| `package.json` | `test:patterns` に `system-account` を追加した | |
| `scripts/diagrams/build.sh` | `gen_system_account.py` を追加した（`sa_*.py` を実行する） | 既存の図の出力は変わらない |
| `preview/tests/button.spec.ts` | Tab を押す回数の上限を、80 回からページのフォーカスできる要素の数に変えた。上部の一覧に 7 ページが増え、80 回では対象のボタンに届かなくなったため。Forms & Workflows のブランチ（未統合）と同じ変更にした | 判定は変えていない |

## 独自に判断した事項

指示書に定めのない点、または既存の仕様と関わる点を、次のように決めた。各 Pattern の判断は、それぞれの資料の「独自に判断した事項」にある。レビューで見直す。

| 事項 | 判断 | 理由 |
| --- | --- | --- |
| 共通の hook | 取得以外の非同期処理のために `useScopeGuard` を追加した。取得は Data Browsing の `useBrowseData` を使う | Data Browsing の取得の規則（スコープの世代、最新の要求、アンマウント）を、保存や既読の更新にも同じ形で適用するため。取得の仕組みを 2 つにしない |
| 部品の分け方 | 6 種類を 26 のファイルに分け、1 つの Context にまとめなかった。純粋な関数（`auth-flow.ts`、`onboarding.ts`、`setting-resolve.ts`、`access-decision.ts`、`system-status.ts`、`notification-state.ts`）は `"use client"` を付けず、React に依存しない | 製品の一部だけを導入できる。Server Components と Node の単体の検品から読み込める |
| 統合の検証画面の権限 | 権限の模擬のサーバーの応答（`usePermissionAccess`）だけを、Sidebar、ページのアクセス、設定、Onboarding の権限に使う。ロールの切り替えは、権限と設定の 2 つの模擬のサーバーに同じ値を設定する | 画面の表示とサーバーの判断の元を 1 つにし、ページの間で権限を矛盾させない |
| 統合の検証画面のセッション切れ | 再認証の間は、製品の画面（Sidebar、お知らせ、内容）を描画しない。同じ利用者の再認証では開いていた画面に戻るが、未保存の入力は復元しない | 再認証の画面の背後に機密のデータを残さない。入力の安全な保持と復元は、Authentication のページの例（模擬のサーバーに保持した下書き）で示している |
| 通知からの移動と未保存の変更 | 確認の Dialog の前に通知センターを閉じ、取りやめた場合は通知センターを開くボタンへフォーカスを戻す | モバイルの通知センターはモーダルの Sheet であり、その外の確認の Dialog を操作できなくなる（検品で見つけた） |
| ワークスペースの切り替え | アカウントメニューの Radio の項目は、選んだらメニューを閉じる（`closeOnClick`） | Base UI の RadioItem は既定では閉じず、切り替えの後の見出しへのフォーカスの移動と重なって、次にメニューを開いた直後に閉じる不具合になった（検品で見つけた） |
| 所属していないワークスペースの URL | 存在や内容を示さず、所属している最初のワークスペースのホームへ移す。`page` と `ws` の値は `Object.hasOwn` で照合する | URL のワークスペースの ID を無条件に信頼しない。`constructor` などの Object のプロトタイプの名前を、既知のページやワークスペースとして扱わない（独立したレビューで見つかった） |
| 通知から移動する処理とスコープ | 移動の前の確認（対象の存在と権限）を `useScopeGuard` で開始したスコープ（利用者、ワークスペース、権限）と組にし、確認の応答を待つ間にスコープが変わったら移動しない。権限の判断には、クリックした時点ではなく、確認の応答の後の最新の権限を使う | 確認の応答の後に、開始したときのワークスペースへ戻る経路があった（独立したレビューで見つかった） |
| 権限の再確認中の操作 | 書き出しの開始の可否を `decideAccess` で判断する。再確認中（`refreshing`）と再確認の失敗（`stale`）では、前の権限が残っていても開始させない | 権限の配列を直接読むと、ロールの変更の知らせの後、再取得が終わるまでの間に古い権限で処理を開始できた（独立したレビューで見つかった） |
| 新着の保留 | 通知センターを開いている間と、専用のページの表示中は、新着を保留する（「新着 N 件を表示」） | 開いている通知センターの一覧の先頭に新着を加えると、閲覧の位置が動く（指示書 8.13） |
| 顧客のデータ | 権限の模擬のサーバーの顧客を、ワークスペースごとに分けた（本社営業部 8 件、西日本営業部 8 件） | 統合の検証画面で、西日本営業部に本社営業部の顧客が表示されていた |
| 未統合の Patterns | Forms & Workflows（Unsaved Changes、Confirmation、Multi-step Workflow、Create & Edit、Form Layout、Import & Export）と Data Analysis は読み込まず、既存の Components とプレビューの `DiscardAlert` で代替した | 指示書の「未統合の Patterns を独自に再実装しない」 |

## 統合時に確認する事項

Forms & Workflows と Data Analysis は、この初期実装の時点で main に統合されていない（`origin/feat/forms-and-workflows-patterns`、`origin/feat/data-analysis-patterns`）。統合の後に、次を確かめる。詳しくは各資料の「統合時に確認する事項」にある。

| 統合する Pattern | 確かめること |
| --- | --- |
| Unsaved Changes | ログアウト、アカウントとワークスペースの切り替え、設定のカテゴリの移動、通知からの移動、統合の検証画面の画面の移動の確認（現在はプレビューの `DiscardAlert`）を、Unsaved Changes の部品と文言に置き換える。ブラウザの戻る操作での確認は、現在は扱っていない |
| Confirmation | ロールの変更、2 段階認証の無効化、ポリシーの保存とリセット、アカウントとワークスペースの削除の確認（現在は `AlertDialog`）を置き換える。再認証とログアウトに確認を出さない方針が、Confirmation の判断基準と一致するか |
| Multi-step Workflow | 組織の作成（`CreateOrganizationSetup`）を置き換える。手順の見出しへのフォーカス、作成の要求の ID、結果の不明の確認を保つ |
| Create & Edit、Form Layout | 認証のフォーム、設定の明示的な保存のフォーム、顧客の登録と編集の入力の検証と配置を合わせる |
| Import & Export | 長時間の処理の一覧（`JobStatusList`）、Onboarding の「既存の顧客を取り込む」の完了の判定を、Import & Export の結果と照合する |
| Data Analysis | 集計値と Chart で、閲覧できない対象を含めないこと、集計の取得の失敗と鮮度の表示を、その Pattern の資料にも記載する |
| 共有ファイル | `catalog.ts`、`package.json` の `test:patterns`、`build.sh`、README、`button.spec.ts` は 3 つのブランチが変更している。双方の変更を残す |

## 検品

- 実機（iOS Safari、Android）、実際のパスワードマネージャー、SMS の確認コードの自動入力、スクリーンリーダー（VoiceOver、NVDA）による検品は行っていない。

| 対象 | 検品（`preview/tests/`） |
| --- | --- |
| Authentication | `system-account-auth.spec.ts`、`system-account-auth-logic.spec.ts`（ブラウザを使わない） |
| Settings | `system-account-settings.spec.ts`、`system-account-settings-logic.spec.ts` |
| Onboarding | `system-account-onboarding.spec.ts`、`system-account-onboarding-logic.spec.ts` |
| Permission States | `system-account-permission.spec.ts`、`system-account-permission-logic.spec.ts` |
| System States | `system-account-system.spec.ts`、`system-account-system-logic.spec.ts` |
| Notifications | `system-account-notifications.spec.ts`、`system-account-notifications-logic.spec.ts` |
| 統合の検証画面 | `system-account-app.spec.ts`：ログイン、認証の失敗、多要素認証、復帰先、組織の SSO、招待されたメンバー、新規登録とメールの確認と組織の作成、パスワードの再設定、アカウントメニュー、即時保存と結果が不明な明示的な保存、通知からの移動と未保存の変更、メンバー管理、通知の設定の必須の通知、ワークスペースの A → B → A（中止に従わない遅い応答）、所属していないワークスペースの URL、利用中のロールの変更、権限の取得の失敗、ログアウトと次の利用者、未保存の変更があるログアウト、セッション切れ（同じ利用者、別の利用者）、オフラインと復帰、製品全体の停止と復旧、メンテナンス、通知の取得の失敗、長時間の処理、書き出しの権限がない利用者、320px |
| SSR と Hydration | `ssr-system-account.spec.ts`：window、document、navigator なしの描画、権限が未確定の最初の描画、Hydration の不一致なし、hook のファイルと純粋な関数のファイルの `"use client"` の境界。`.tsx` の境界は `ssr-app-structure.spec.ts` が全ファイルを確かめる |

`system-account-*.spec.ts` と `ssr-system-account.spec.ts` は `npm run test:components` に含まれる。Patterns だけを実行する場合は `npm run test:patterns`。

### 検証の結果

- 実施日：2026-11-26
- 環境：macOS（Darwin 25.6）、Node.js 26.10.0、Playwright 1.65.1（Chromium 159、WebKit 27.x）
- 統合の候補：`origin/main`（`aa7e664`）の上のこのブランチの内容。`origin/main` は作業の間に変わっていない

| 確認 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功（exit 0） |
| `npm run preview:build` | 成功（exit 0）。チャンクの大きさの警告は従来どおり（範囲外） |
| `npm run test:tokens` | 成功（failed 0） |
| `npm run test:ssr` | 96 件成功 |
| `npm run test:patterns` | 1221 件成功、97 件 skip、失敗 0 件（10.6 分、3 ワーカー） |
| `npm run test:components` | 2978 件のうち 2732 件成功、246 件 skip、失敗 0 件（24.6 分、3 ワーカー） |

- 記録された例外は、Vite の HMR の接続のコンソールのエラー（SSR の検品、`consoleEnvironment`）だけである。製品の例外とコンソールのエラーは 0 件。
- 既存のテストの削除、skip の追加、許容誤差の拡大はしていない。既存のテストの変更は `button.spec.ts` の 1 か所（「既存の Components と Patterns への影響」）。新しい skip は、画面の幅を 320px に変えて確かめる検品を、幅を変えないモバイルの project で対象外にしたものだけである。
- 候補の前の一括の実行（既定のワーカーの数）で、次の失敗があった。記録として残す。
  - 開発サーバー（Playwright の webServer）への接続が途中で切れ、`test:components` の後半の 1063 件が失敗した（「Failed to load resource: Could not connect to the server」）。切れた原因は特定できていない。同じ時間に、別のセッションが同じマシンでポート 5174 の検品を実行していた。
  - 既存の `data-browsing.spec.ts` の「a run started in A and finished after A → B → A does not change state or show a toast」が、`test:patterns` と `test:components` の両方で失敗した（desktop、mobile）。負荷の下で、ワークスペースの A → B → A の切り替えが一括操作の応答の時間（1,600ms）より長くかかり、切り替えの前に処理が完了して、完了の Toast が正しく表示された。単独の実行では成功する（4.7 秒。失敗した実行では 10.8 秒）。テストは変更していない。Data Browsing の記録と同じ 3 ワーカーで実行し直し、成功した。テストが操作の速さを前提にしていることは、Data Browsing の次のレビューで扱う。
  - 新しい `system-account-settings.spec.ts` の「reset in progress」が、同じ負荷の下で 1 回失敗した（desktop）。単独の実行と、3 ワーカーの実行では成功している。
- スクリーンショット（Git の管理外）：統合の検証画面を Chromium 1280×900（ホーム、設定、未保存の変更の確認、権限不足、オフライン、停止、再認証、組織の作成）、Pixel 7、320px で、6 つの資料のページを 1280×900、Pixel 7、320px で撮り、目視で確かめた。WebKit と実機での目視の確認は行っていない。

### 独立したレビュー

別のエージェント（Opus）が、実装の結論を渡さずに、差分、資料、図、テスト、実際の画面を、認証、認可とスコープの境界、非同期の処理の競合、指示書の設計方針、8 つの設計原則と 8 つの美的基準の順で確かめた。指摘は高 7 件、中 12 件、低 6 件。重大な問題がないとされた領域：アカウントの存在の開示、パスワードとコードの保存、多要素認証の完了の前の扱い、統合の検証画面のセッション切れ、`decideAccess` と `useAccess` の未確定の権限、`useScopeGuard` の世代、通知センターを開いただけで既読にしないこと、未読の件数の表示、Checklist の完了の判定、状態の取得の失敗を正常としないこと。

| 指摘 | 対処 |
| --- | --- |
| 高：`toSafeReturnPath` が、ドットのセグメントを含む値（`/.//evil.example`、`/%2e//evil.example` など）で、プロトコル相対の URL（`//evil.example`）を返す | 解析の前の値、復号の各段階を解析した後の値、返す値を、同じ規則で確かめ直す。拒否の検品を 11 件追加した |
| 高：権限の再確認中に、古い権限で書き出しを開始できる（統合の検証画面） | 開始の可否を `decideAccess` で判断する。検品を追加した |
| 高：ワークスペースを切り替えた後に、遅れて届いた通知の対象の確認の結果で、前のワークスペースへ戻る（統合の検証画面） | 移動の処理を `useScopeGuard` で開始したスコープと組にし、確認の要求に signal を渡す。最新の権限で判断する。検品を追加した |
| 高：一括既読（cursor）の後に、誤った未読の件数と結果の文を示す。ids の方式で、読み込んだ範囲だけを既読にするのに「すべて既読にする」と示す | ボタンの名前と範囲の文を実際の範囲に合わせた。cursor の後は取得し直して件数を確定する。受け付けた順の番号（`sequence`）で範囲を判定する |
| 高：「標準に戻す」の処理中に変えた値を、その応答が上書きする | `changeMany` を追加し、処理中に利用者が変えた項目には応答を反映しない |
| 高：明示的な保存の結果が不明になった後に「変更を取り消す」と、未確定の状態の表示が消える | 結果が不明な間は取り消せない（`canDiscard`）。「確認する」で確かめる |
| 高：結果が不明な処理（標準に戻す、外部連携、パスワードの変更、アカウントの削除）を確定した失敗として示す | 結果の不明を区別し、「確認する」でサーバーの状態を取得し直す。結果が不明な間は同じ操作を置かない |
| 中：処理中にスコープを切り替えると、処理中の状態が残り、操作できなくなる（権限の画面、ジョブの開始） | 処理中の状態をスコープと組で持ち、現在のスコープの値だけを示す |
| 中：処理中の取得の応答が、確定した既読の状態を上書きする | 確定した既読の状態を取得の結果の上に重ねる。模擬のサーバーで競合を再現する検品を追加した |
| 中：即時保存の途中でカテゴリを移ると、中止されて変更が失われる | 変更の要求には、画面の移動やアンマウントで中止される signal を渡さない（Onboarding と同じ方針）。応答は `useScopeGuard` が反映しない |
| 中：権限の変更の知らせの後の再取得に失敗すると、ページを置き換える | 同じスコープの前の権限があれば `stale` にし、前の権限で表示を保って操作を止める |
| 中：通知センターを開いている間に届いた新着を、一覧の先頭に入れる | 開いている間も保留する。「新着 N 件を表示」の場所を見出しの行に確保し、表示中の通知を動かさない |
| 中：Onboarding の結果が不明な操作を押し直せ、データが重複する | 結果が不明な間は「処理されたかを確認する」に置き換え、要求の ID でサーバーに照会する。模擬のサーバーを要求の ID で冪等にした |
| 中：オフラインの登録の例で二重に登録できる。Toast を使う設定で、失敗・一部の失敗・結果不明を伝えない。メモの取得の失敗で理由を示さない | 実行中は無効にし、端末の ID で冪等にした。成功以外は一覧の読み上げの領域で伝える。取得の失敗を示し、回復の後に取得し直す |
| 中：通知の設定の保存の失敗を読み上げない。空の aria-live の領域が `display: none` | 失敗と結果の不明を常に置いた領域で読み上げる。結果の不明は warning にした。領域を空の間も置く |
| 中：テストが誤りを検出できない（A → B → A の間に通知センターが閉じている、条件付きの判定、正常な場合だけ） | 統合の検証画面の検品で、切り替えた先で通知センターを開いて確かめ、未読の件数を確かめる。多要素認証と組織の作成の手順を条件で省かない。各 Pattern の検品に異常な場合を追加した |
| 低：2 段階認証を無効にする確認のボタンが Destructive。通知の削除に失敗の処理がない。`page=constructor` などで「権限がありません」と示す。再認証の直後の 1 回の描画で前の位置を使う。セッションの例の確認に guard がない。`access.ts` のコメントと実際が一致しない | Primary にした。失敗と二重の実行を扱う。`Object.hasOwn` で照合する。移動と同じ描画で位置を更新する。guard と失敗の扱いを追加した。純粋な判断の関数を `access-decision.ts` に分けた |

指摘の修正の後に、上の「検証の結果」の全体の検品を実行した。修正の後の再レビューは行っていない（v0.1 の確定の前のレビューで行う）。

### 未検証の事項

| 項目 | 状況 |
| --- | --- |
| 実機の iOS Safari、Android | 未検証。ソフトウェアキーボードの表示中の認証のフォーム、モバイルの通知センターの Sheet、System Banner と Safe Area を実機で確かめていない |
| パスワードマネージャー、SMS の確認コードの自動入力 | 未検証。`autocomplete` の属性と、表示の切り替えのボタンが入力欄の値とフォーカスを失わないことだけを、Playwright で確かめている |
| VoiceOver、NVDA | 未検証。`role="status"`、`role="alert"`、`aria-live` の読み上げの回数と時期を、Playwright の属性の検品だけで確かめている |
| Next.js（App Router）での導入 | 未検証。`"use client"` の境界を規則で確かめ、純粋な関数のファイルが hook を使わないことを確かめている |
| 実際の認証・認可・通知の配信の基盤 | 模擬のサーバーだけで確かめている |
| Forms & Workflows、Data Analysis との統合 | 未統合。「統合時に確認する事項」 |
| 負荷の下のテストの安定 | 既定のワーカーの数の一括の実行で、操作の速さを前提にするテストが失敗した（「検証の結果」）。3 ワーカーで成功を確かめている |
| 修正の後の独立したレビュー | 行っていない |
