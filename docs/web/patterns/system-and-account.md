# System & Account

製品の機能そのものではなく、利用者が製品を安全に、快適に使い続けるための共通の体験を扱う Patterns のグループ。Authentication、Settings、Onboarding、Permission States、System States、Notifications の 6 種類からなる。Patterns の段階の最後のグループである。

状態：v0.1 確定候補（初期実装 `d1685b6` のレビューの後に最終調整を行った。設計と実装の方針は `694c8f6` の後に条件付きで承認された。条件は、Forms & Workflows と Data Analysis の統合の後の取り込みと、2 回連続の全件の検品で、どちらも満たした。横断の検品は Patterns Integration Review で行う）

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
| Authentication | 製品に安全に入り、出る | [authentication.md](authentication.md) | `auth-layout.tsx`：`AuthLayout`<br>`password-input.tsx`：`PasswordInput`<br>`verification-code-input.tsx`：`VerificationCodeInput`<br>`auth-feedback.tsx`：`AuthFormError`、`AuthStatus`、`authErrorCopy`<br>`auth-flow.ts`：`toSafeReturnPath`、`resolveReturnTo`、`SAFE_DEFAULT_RETURN_PATH`、`checkEmailFormat`、`checkPasswordInput`、`normalizeVerificationCode`、`checkVerificationCode`、`evaluatePasswordRequirements`、`planReauthentication`、`decideReauthenticationRestore` |
| Settings | 個人と組織の設定を、保存の単位ごとに正しく保存する | [settings.md](settings.md) | `settings-layout.tsx`：`SettingsLayout`、`SettingsNav`、`SettingsBackLink`<br>`setting-status.tsx`：`SettingRow`、`SettingSaveStatus`<br>`setting-save.ts`：`useInstantSettings`、`useSettingsForm`、`classifySaveError`、`partialSaveResult`、`withVersion`<br>`setting-resolve.ts`：`resolveSetting`、`resolveDependent`、`settingAccess`、`toSettingSearchGroups`、`planReset`、`applyReset`、`resolveDeliveryChannel` |
| Onboarding | 最初の価値の体験までを短くする | [onboarding.md](onboarding.md) | `onboarding.ts`：`resolveFirstScreen`、`deriveChecklist`、`deriveRequirements`、`getSetupStatus`、`pickGuidance`<br>`getting-started.tsx`：`GettingStartedChecklist`<br>`contextual-help.tsx`：`ContextualHelp` |
| Permission States | できること、できない理由、解決の方法を正しく示す | [permission-states.md](permission-states.md) | `access-decision.ts`（純粋な関数）と `access.ts`（`access-decision.ts` を再 export）：`useAccess`（`verified`、`latest()`）、`decideAccess`、`isAccessVerified`、`unverifiedStatus`、`presentAction`、`resolveContentAccess`（`sensitivity`、`whileUnverified`）、`pageAccessFromStatus`、`diffPermissions`、`restrictionText`<br>`restricted-action.tsx`：`RestrictedAction`、`RestrictionNotice`、`useFocusRecovery`<br>`access-state.tsx`：`AccessState` |
| System States | 接続、障害、メンテナンス、結果不明、長時間の処理を区別して伝える | [system-states.md](system-states.md) | `system-status.ts`：状態の型、`summarizeIssues`、`getMutationAvailability`、`canAutoRetry`、`normalizeRetryPolicy`、`advanceStableIssues`、`mergeJobUpdates`、`normalizeJobProgress`、`normalizeJobCounts`、`normalizeJobState`、`assessJobReport`、`isRegisteredOnServer` など<br>`system-status-hooks.ts`：`useConnectivity`（最初の状態は `unknown`）、`useStableIssues`<br>`system-banner.tsx`：`SystemBanner`<br>`service-state.tsx`：`ServiceUnavailable`、`SystemStatusIndicator`<br>`job-status.tsx`：`JobStatusList`、`JobStatusItem` |
| Notifications | 知る価値のあることを、作業を妨げずに知らせる | [notifications.md](notifications.md) | `notification-state.ts`：重複の除去、集約、未読の表示、一括既読の範囲、`summarizeReadUpdate`、`reconcilePending`、`isUnreadCountInconsistent`、Quiet Hours の判定<br>`notification-feed.ts`：`useNotificationFeed`（`subscribe`、`receive`、`unsubscribe`、`counts`）<br>`notification-indicator.tsx`：`NotificationButton`、`NotificationIndicator`<br>`notification-list.tsx`：`NotificationList`<br>`notification-center.tsx`：`NotificationCenter` |
| 共通 | 古いスコープの操作を始めない。取得以外の非同期処理の結果を、開始したスコープの世代と最新の要求にだけ反映する | この資料の「共通の状態管理と安全性」 | `scope-guard.ts`：`useScopeGuard`（`begin`、`beginIfCurrent`、`capture`、`isCurrent`、`isLatest`、`isSameScope`、`release`） |

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
| Authorization | 閲覧・変更の許可。表示可能性（画面の構造）、閲覧可能性（保護された情報）、操作可能性、最新の認可を確認済みか（`verified`）を区別する | Permission States（`useAccess`、`decideAccess`、`resolveContentAccess`） |
| Entitlement | 契約プランによる利用の可否 | Permission States（`Restriction` の `entitlement`） |
| Scope | アカウント、ワークスペース、認可の境界 | すべて（`scopeKey`、`useScopeGuard`） |
| Connectivity | サービスとの接続の状態。確認していない状態（`unknown`）と、確認できた `online` を区別する | System States（`useConnectivity`） |
| Service Health | サービスと機能の稼働の状態 | System States（`ServiceStatusReport`、`healthOf`） |
| Data State | データの取得と鮮度 | Data Browsing の `useBrowseData` |
| Mutation State | 保存・変更の処理の状態（保存中、成功、失敗、結果不明、権限不足） | Settings（`SettingSaveState`）、System States（`MutationStatus`） |
| Job State | 長時間の処理の状態 | System States（`JobState`、`mergeJobUpdates`） |
| Notification State | 通知の取得、閲覧、配信の状態 | Notifications（`useNotificationFeed`、`describeDelivery`） |

Data Browsing v0.1 の状態管理と競合させない。取得は `useBrowseData`（`scopeKey`、`requestKey`、要求ごとの番号、`canOperate`）を使い、取得以外の処理（保存、既読の更新、権限の申請、作成）は `useScopeGuard` を使う。

### scopeKey と世代

| 値 | 意味 | A → B → A の最初の A と最後の A |
| --- | --- | --- |
| `scopeKey` | アカウント、ワークスペース、認可の範囲を 1 つの文字列にした値（例：`${userId}:${workspaceId}:${権限}`）。製品が決める | 同じ値になる |
| 世代（`generation`） | `useScopeGuard` が、スコープの変更が画面に反映された（commit）たびに進める番号 | 別の値になる |

`scopeKey` の比較だけでは、A → B → A と戻った後に届いた最初の A の結果、最初の A の購読から届いた通知、最初の A の画面や Toast から始めた操作を、現在の A のものとして受け付けてしまう。`useScopeGuard` は、`scopeKey` と世代の両方で照合する。同じワークスペースで認可の範囲だけが変わる場合も別のスコープとして扱えるよう、`scopeKey` に認可の範囲を含める（Notifications の購読、通知からの移動）。

### 古い操作の開始と、古い応答

2 つは別の問題であり、別の方法で防ぐ。

| 問題 | 例 | 防ぐ方法 |
| --- | --- | --- |
| 古い操作の開始 | 最初の A で表示した Toast の「元に戻す」を、スコープが変わった後に押す。古い通知を開く。確認の Dialog を古い権限で開いたまま確定する | 画面や Toast を作ったときに `capture()` で Snapshot を取り、実行の直前に `beginIfCurrent(snapshot)` で始める。スコープか世代が現在と一致しなければ `null` を返し、要求を送らない。始めない操作は、同じキーの現在の処理を無効にしない。権限は実行の直前に `decideAccess(access.latest())` で判断し直す |
| 古い応答 | 保存の応答が、スコープの変更の後、同じ項目の新しい保存の後、アンマウントの後に届く | `begin(key)` で開始し、応答の時点で `isLatest(ticket)`（そのキーの最新で、同じ世代）か `isSameScope(ticket)` で照合する。AbortSignal に従わない応答も、番号と世代で捨てる |

`useScopeGuard` の世代の更新と AbortController の中止は、commit の時点（layout effect）で行い、描画の中では行わない。破棄された描画、StrictMode の 2 回目の描画、中断された Concurrent Rendering の描画が、画面に表示しているスコープの有効な要求を中止しないためである。描画の中の照合は、hook がその描画で返した値（その描画のスコープを持つ。スコープごとに別のオブジェクト）で行い、新しいスコープの最初の描画から前のスコープの状態を表示しない。返す値は、commit された世代に結び付く。前のスコープの描画で返した値と、A → B → A の最初の A の描画で返した値（古い画面や Toast の closure）から `begin` と `capture` を呼ぶと、最初から無効な Ticket と Snapshot を返し、現在の処理を無効にしない。そのため、利用する側は、最初の描画の関数を購読、タイマー、依存配列が空の effect に保持しない（最新の関数を ref から呼ぶ。ref の更新は commit の後に行う）。処理のキーの記録は `release(ticket)` で消し、スコープの変更とアンマウントですべて消す（長時間の利用で増え続けない）。

`useScopeGuard` は、サーバーでの処理の順序、取り消し、冪等性、認可を保証しない。クライアントが最新の応答だけを表示しても、サーバーの値が最新であるとは限らない（製品の API の契約。下の「製品の責務」）。

### 守ること

| 安全性 | 方法 |
| --- | --- |
| 操作の可否と表示の可否を分ける | `useBrowseData` の `isCurrent` と `canOperate`。`resolveContentAccess` は、最新の認可を確認している間（`refreshing`、`stale`、`verified: false`）、保護された情報（`sensitivity: "protected"`、既定）を既定では表示しない（`whileUnverified: "hide"`）。画面の構造（見出し、ナビゲーション）は保つ。前の権限で表示を続けるかは、製品が情報の機密性に応じて `whileUnverified: "keep"` で選ぶ。操作は、どちらの場合も確認が終わるまで許可しない |
| スコープの境界をまたぐデータを混ぜない | スコープが変わったら、同じ描画から前のデータを返さない（`useBrowseData`）。`useScopeGuard` は、新しいスコープの最初の描画から前のスコープの Ticket を照合で拒否し、A → B → A と戻っても最初の A の結果を反映しない |
| `AbortSignal` だけに頼らずに古い応答を無効にする | 要求ごとの番号と世代で判定する。各 Pattern の模擬のサーバーは `ignoreAbort` で中止に従わない応答を返せる |
| 古い操作を始めない | `capture` と `beginIfCurrent`。権限は実行の直前に `access.latest()` で判断し直す（変更の知らせの直後、画面の更新の前に押された場合も止める） |
| 実行の対象を固定する | 一括既読は開始のときの範囲（ID の一覧か、開始の時刻のカーソル）で固定する。処理の間に届いた新着を既読にしない。権限の申請は、開始の前に対象（スコープ、権限）を固定する |
| 二重の実行を防ぐ | 認証の処理ごとの Ticket（キーごと）、明示的な保存の要求中の判定、権限の申請の承認待ちの判定（サーバーでも同じ申請を作らない）、組織の作成の要求の ID、ジョブの開始の要求中の判定（ワークスペースごと） |
| 結果が不明な処理を確かめ直す | 分類できない通信の例外の既定は「結果の不明」であり、確定した失敗にしない。AbortError は、サーバーで処理されなかったことを意味しない。結果が不明な間は、同じ処理を無条件に送り直さない。「確認する」で、現在の認可でサーバーの状態を照会する |
| アンマウントの後の古い結果を反映しない | `useScopeGuard` と `useBrowseData` は、アンマウントで世代を進める |
| 古い権限で操作させない | 権限の取得中と取得の失敗は許可として扱わない。権限の変更の知らせを受けた処理の中で `reload()` を呼び、同じ処理の中から `access.latest()` が確認済みの権限を返さないようにする |
| 確認していない接続を確認済みとして扱わない | `useConnectivity` の最初の状態は `unknown`。`getMutationAvailability` は既定で `unknown` の間の登録・更新・削除を止める（`unconfirmed`）。製品は、確認済みの初期状態（`initialConfirmedAt`）を渡すか、業務の要求の応答で `reportReachable()` を呼ぶ |
| Toast の操作で別のスコープを操作させない | 統合の検証画面では、ワークスペースと権限が変わったら表示中の Toast を閉じる（統合の検証画面の Toast には操作がない）。操作のある Toast は、作ったときの Snapshot で `beginIfCurrent` を使う |

アカウント、ワークスペース、権限の変更に伴う実際のキャッシュの破棄と、バックエンドの認可は、製品の責務である。

```tsx
// 古い画面の操作を始めず、古い応答を反映しない
const guard = useScopeGuard(`${userId}:${workspaceId}:${permissionKey}`)

// Toast を作るときに、スコープと世代を保存する
const showUndo = (id: string) => {
  const snapshot = guard.capture()
  toast({ title: "削除しました", action: { label: "元に戻す", onClick: () => undo(snapshot, id) } })
}

const undo = async (snapshot: ScopeSnapshot, id: string) => {
  // 実行の直前に、最新の認可で判断し直す
  if (!decideAccess(access.latest(), { permissions: ["customers.delete"] }).allowed) return
  const ticket = guard.beginIfCurrent(snapshot, `undo:${id}`)
  if (!ticket) return // 古いスコープの Toast：要求を送らない。現在の処理に影響しない
  try {
    const restored = await api.restore(id) // 製品の API。サーバーは要求ごとに認可を確かめる
    if (guard.isLatest(ticket)) apply(restored)
  } catch (error) {
    if (!guard.isLatest(ticket)) return // 別のスコープ、新しい処理、アンマウントの後の応答は反映しない
    if (isConfirmedFailure(error)) showError()
    else markUnknown(id) // 分類できない例外は結果の不明。照会するまで送り直さない
  } finally {
    guard.release(ticket) // 最後の照合の後に、キーの記録を消す
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
| ログインの後の復帰 | 開き方「ログインの後に顧客の詳細へ戻る」。所属していないワークスペースや権限のない画面には戻さない。復帰先は、ページのアクセスと同じ表（`account-route.ts` の `pagePermission`）と現在の認可（権限の模擬のサーバーのロール）で判断する（Patterns Integration Review、AUTH-1、AUTH-2） |
| 組織の SSO | 開き方「組織の SSO が必須の組織（西日本営業部）」 |
| App Shell、アカウントメニュー、ワークスペースの切り替え | Sidebar の下部のアカウントメニュー。所属しているワークスペースだけを示す |
| 個人設定、組織設定、設定の検索、即時保存、明示的な保存、継承と制限 | Sidebar の「設定」 |
| メンバー管理、権限管理 | 「メンバーと権限」（`members.view` がない利用者には Sidebar に示さない） |
| 通知センター、通知設定、通知から対象への移動 | Header の右側のお知らせのボタン。設定の未保存の変更があるときは、移動の前に Unsaved Changes（`UnsavedChangesProvider`）で確認する。権限の再確認中に開いた通知は「最新の権限を確認しています」と示し、既読にしない |
| ブラウザの戻る・進む、アドレスバーの変更 | 設定の未保存の変更（保存の結果を確認していない入力を含む）がある間は、同じ確認を出す。確認の間は表示している画面の URL に戻し、取りやめたらそのまま残る。再読み込みとタブを閉じる操作には、ブラウザの標準の確認（`beforeunload`）を出す |
| Getting Started Checklist | ホーム。非表示にした場合は、ページの見出しの横の「はじめにやることを表示」で再表示する |
| セッション切れ | 「セッションの有効期限を切る」。未保存の変更の確認を挟まない。製品の画面を描画せず、前の利用者の Toast を閉じる。保存していない入力があった場合は、再認証の画面で「保存していない入力は破棄されました」と示す。同じ利用者なら開いていた画面（設定のカテゴリ、お知らせ、処理の状況、稼働状況を含む）に戻り、別の利用者なら前の利用者の位置を引き継がない |
| 権限の変更 | ロールの切り替え。再読み込みせずに、Sidebar とページのアクセスを更新する |
| オフライン、再接続、復旧の確認 | 端末のネットワーク、サービスへの経路 |
| 部分障害、メンテナンス、サービスの停止 | サービスの状態。製品全体の停止とメンテナンスでは、製品の画面を状態の画面に置き換える |
| 保存の結果が不明 | 設定の保存の結果「結果が不明」。移動の確認は「保存できたかを確認していません」と示し（「保存されていません」と断定しない）、「保存して移動」を示さない |
| 長時間の処理 | 「処理の状況」（書き出しと取り込み）。開始の直前に `access.latest()` で書き出しの権限を判断し直す |
| 権限の再確認と保護された情報 | ロールの切り替えの後、権限を取得し直すまで、顧客の内容、メンバーの一覧、組織の設定の値（保護された情報）を表示しない（`whileUnverified` の既定の `hide`）。画面の構造は保つ。組織の設定の保存、ポリシーの保存、ワークスペースの削除、招待は、送る直前に `access.latest()` で判断し直す |
| 組織の設定の保存の反映 | 組織名とセキュリティのポリシーの正本は Settings の模擬のサーバー。保存した組織名は Sidebar と Header に、保存したポリシー（多要素認証、SSO、外部アカウント）はログインの判定に反映される |
| オフラインの間の保存と既読 | 端末のネットワーク「切断した」。設定の即時保存と明示的な保存、お知らせの既読の更新と一括既読を送らない（確定した失敗として示す）。接続が回復したら、お知らせを取得し直す |
| 通知の取得の失敗 | お知らせの取得「失敗する」 |
| 接続の未確認 | 最初の疎通の確認が終わるまで、接続は `unknown`。顧客の保存と操作は「接続を確認しています」として止める（オフラインとは示さない）。障害とメンテナンスは、接続の問題と区別して示す |

URL の引数：`page`（`home`、`customers`、`customer`、`notifications`、`settings`、`members`、`jobs`、`status`）、`ws`（`hq`、`west`）、`id`（顧客）、`cat`（設定のカテゴリ）、`start`（ログインの前の開き方：`signin`、`sso`、`return`、`invited`、`signup`）。ログインの状態（セッション）は URL とストレージに入れず、画面のメモリだけに持つ（再読み込みするとログインの画面に戻る）。

## 製品の責務（共通）

UI の部品は、入力、表示、遷移、古い操作と古い応答の照合だけを扱う。次は製品の責務であり、Registry は代わりにならない。

- 実際の認証・認可のサービス、OAuth・OIDC・SSO、Passkey の登録と検証、多要素認証の検証、メールの送信とトークンの発行・検証・期限、送信の回数の制限、試行の回数の制限、アカウントの列挙の対策。
- セッションの管理（更新、破棄、ほかのタブとの同期）、キャッシュの破棄。
- 閲覧の権限のないデータをクライアントへ送らない。URL、要求、ワークスペースの ID を無条件に信頼しない。UI の非表示と無効化は認可の代わりではない。
- 設定の永続化、変更の履歴と監査ログ、組織のポリシーの強制。
- Onboarding の状態の永続化、価値の体験の定義と計測。
- 接続とサービスの監視、Status Page の運用（主要なサービスと異なる障害の境界で運用する）、ジョブの実行と管理、再試行の制御と冪等性。
- 通知の生成、重複の排除、配信（メール、プッシュ）、配信の状態の記録、OS とブラウザの通知の許可。
- 認証の後の復帰先：`resolveReturnTo` は、受け付ける条件をすべて満たす同じオリジンの相対パスだけを受け付け、検証した文字列と同じ値を返す。そのパスを開く権限（`isAllowed`。必須）、別のワークスペースへの移動の可否、任意の URL へ移動する内部のエンドポイントなど、製品に固有の遷移先の検証は製品の責務である。製品のルーターが、検証した値を別の形に復号・正規化して開かないこと。
- セッション切れの後の作業の復元：同じ利用者であることだけでは復元しない。製品は、アカウント、ワークスペース、閲覧と編集の権限、対象のデータ、未確認の保存の結果を、現在の認可で確かめてから `decideReauthenticationRestore` で決める。保存の結果の照会にも、現在の認可が必要である。別の利用者では、入力、認証情報、通知、キャッシュ、非同期の結果を破棄する。
- 保存と既読の更新の順序：受け付けた順の適用、項目ごとの直列化、版の番号と If-Match による競合の検出、更新の結果の報告（更新した ID の一覧）、再取得による確認。クライアントが最新の応答だけを表示しても、サーバーの値が最新であるとは保証されない（Settings と Notifications の資料）。
- 一括既読の範囲：カーソルで指定する場合は、サーバーが対象の時点とスコープを検証する。要求した件数を成功の件数として扱わない（API が全件の成功を保証する契約を持つ場合を除く）。
- 接続の確認：独立した疎通確認の API は必須ではない。製品は、確認済みの初期状態を渡すか、業務の要求の応答を報告する。接続の状態を意思決定に使う製品（電話、機器の操作）は、確認していない接続で操作を許可しない既定値を使う（System States の資料）。

## 既存の Components と Patterns への影響

| 対象 | 変更 | 互換性 |
| --- | --- | --- |
| Components（`registry/components/ui/`） | System & Account の実装では変更なし（Patterns Integration Review の変更は「Patterns Integration Review での変更」） | |
| App Structure、Data Browsing（`registry/patterns/` の既存の 14 ファイル、資料、検証画面） | 変更なし | `MinimalShell`、`AppShell`、`useBrowseData`、`DataRegionError`、`SidebarNav` をそのまま使う |
| `preview/src/catalog.ts` | 分類「Patterns：System & Account」と 7 ページを追加した | 既存のページの id と URL は変わらない |
| `package.json` | `test:patterns` に `system-account` を追加した | |
| `scripts/diagrams/build.sh` | `gen_system_account.py` を追加した（`sa_*.py` を実行する） | 既存の図の出力は変わらない |
| `preview/tests/button.spec.ts` | 「Tab reaches the button…」の、Tab を押す回数の上限を、80 回からページのフォーカスできる要素の数に変えた。上部の一覧に 7 ページが増え、80 回では対象のボタンに届かなくなったため。PR #4 で、main にも同じ変更が入った。main の取り込みの後に、「buttonVariants on `<a>` › keyboard focus and navigation」の上限（120 回）も、同じ方法に変えた（「main への統合の前の検証」） | 判定は変えていない |
| `preview/tests/navigation.spec.ts` | 「Sidebar (desktop) › collapse to 64px…」で、見出しの縦の位置を、ウィンドウからの位置ではなく、例の枠の上端からの距離で比べるようにした。main の取り込みの後の変更である（「main への統合の前の検証」） | 期待値（折りたたみの前後で位置が変わらない）は変えていない |
| `preview/playwright.config.ts` | webServer に `stdout: "pipe"` を追加した（v0.1 の最終調整）。Vite の標準出力（HMR の更新、再読み込み、依存の最適化）を検品の記録に残し、検品環境の問題を後から確かめるため | 結果の判定は変わらない。Data Analysis のブランチの `tsconfig` の行とは別の位置 |
| Components の検品（`preview/tests/forms.spec.ts` の「Select › typeahead and scroll」） | End を押す前に、一覧を開く動きの終了（`getAnimations` の `finished`）を待つようにした。WebKit では、開く動きの間はフォーカスが一覧に移っておらず、End が効かない。v0.1 の最終の検品で失敗し、`origin/main`（`aa7e664`）の作業ツリーでも 10 回中 8 回失敗することを確かめた（このブランチの変更による失敗ではない）。修正の後、4 つの project で 10 回ずつ成功した | 期待値（最後の選択肢が表示の範囲に入る）は変えていない。Components の実装は変えていない |
| Data Browsing の検品（`preview/tests/data-browsing.spec.ts`）と模擬のサーバー（`preview/src/data/data-browsing/company-server.ts`） | A → B → A の一括操作の検品など 14 件を、応答の時間ではなく、模擬のサーバーの応答の保留と解放（`hold`、`held`、`release`）で順序を決める方式にした（「検品」の「時間に依存する検品」） | Registry は変更していない。期待値は弱めていない。既定（保留なし）の模擬のサーバーの挙動は変わらない |

## 独自に判断した事項

指示書に定めのない点、または既存の仕様と関わる点を、次のように決めた。各 Pattern の判断は、それぞれの資料の「独自に判断した事項」にある。レビューで見直す。

| 事項 | 判断 | 理由 |
| --- | --- | --- |
| 共通の hook | 取得以外の非同期処理のために `useScopeGuard` を追加した。取得は Data Browsing の `useBrowseData` を使う | Data Browsing の取得の規則（スコープの世代、最新の要求、アンマウント）を、保存や既読の更新にも同じ形で適用するため。取得の仕組みを 2 つにしない |
| 部品の分け方 | 6 種類を 26 のファイルに分け、1 つの Context にまとめなかった。純粋な関数（`auth-flow.ts`、`onboarding.ts`、`setting-resolve.ts`、`access-decision.ts`、`system-status.ts`、`notification-state.ts`）は `"use client"` を付けず、React に依存しない | 製品の一部だけを導入できる。Server Components と Node の単体の検品から読み込める |
| 統合の検証画面の権限 | 権限の模擬のサーバーの応答（`usePermissionAccess`）だけを、Sidebar、ページのアクセス、設定、Onboarding の権限に使う。ロールの切り替えは、権限と設定の 2 つの模擬のサーバーに同じ値を設定する | 画面の表示とサーバーの判断の元を 1 つにし、ページの間で権限を矛盾させない |
| 統合の検証画面のセッション切れ | 再認証の間は、製品の画面（Sidebar、お知らせ、内容）を描画しない。同じ利用者の再認証では開いていた画面に戻るが、未保存の入力は復元しない。復元しないことは、再認証の画面で示す（Patterns Integration Review で追加） | 再認証の画面の背後に機密のデータを残さない。入力の安全な保持と復元は、Authentication のページの例（模擬のサーバーに保持した下書き）で示している |
| 通知からの移動と未保存の変更 | 確認の Dialog の前に通知センターを閉じ、取りやめた場合は通知センターを開くボタンへフォーカスを戻す | モバイルの通知センターはモーダルの Sheet であり、その外の確認の Dialog を操作できなくなる（検品で見つけた） |
| ワークスペースの切り替え | アカウントメニューの Radio の項目は、選んだらメニューを閉じる（`closeOnClick`） | Base UI の RadioItem は既定では閉じず、切り替えの後の見出しへのフォーカスの移動と重なって、次にメニューを開いた直後に閉じる不具合になった（検品で見つけた） |
| 所属していないワークスペースの URL | 存在や内容を示さず、所属している最初のワークスペースのホームへ移す。`page` と `ws` の値は `Object.hasOwn` で照合する | URL のワークスペースの ID を無条件に信頼しない。`constructor` などの Object のプロトタイプの名前を、既知のページやワークスペースとして扱わない（独立したレビューで見つかった） |
| 通知から移動する処理とスコープ | 移動の前の確認（対象の存在と権限）を `useScopeGuard` で開始したスコープ（利用者、ワークスペース、権限）と組にし、確認の応答を待つ間にスコープが変わったら移動しない。権限の判断には、クリックした時点ではなく、確認の応答の後の最新の権限を使う | 確認の応答の後に、開始したときのワークスペースへ戻る経路があった（独立したレビューで見つかった） |
| 権限の再確認中の操作 | 書き出しの開始の可否を `decideAccess` で判断する。再確認中（`refreshing`）と再確認の失敗（`stale`）では、前の権限が残っていても開始させない | 権限の配列を直接読むと、ロールの変更の知らせの後、再取得が終わるまでの間に古い権限で処理を開始できた（独立したレビューで見つかった） |
| 新着の保留 | 通知センターを開いている間と、専用のページの表示中は、新着を保留する（「新着 N 件を表示」） | 開いている通知センターの一覧の先頭に新着を加えると、閲覧の位置が動く（指示書 8.13） |
| 顧客のデータ | 権限の模擬のサーバーの顧客を、ワークスペースごとに分けた（本社営業部 8 件、西日本営業部 8 件） | 統合の検証画面で、西日本営業部に本社営業部の顧客が表示されていた |
| `useScopeGuard` の世代の更新の時点（v0.1） | 初期実装は描画の中で世代を進め、AbortController を中止していた。v0.1 では、commit の時点（layout effect）で行い、描画の中の照合は、その描画で返した値のスコープで行う | 破棄された描画と中断された transition の描画が、画面に表示しているスコープの有効な要求を中止していた。描画の中で書き換えた ref が、取りやめた transition の値のまま残り、表示中のスコープの結果を受け付けなくなる場合があることも、検品で確かめた |
| 古い操作の開始（v0.1） | `capture` と `beginIfCurrent` を追加した。`begin` は互換のため残し、前のスコープの描画の値から呼んだ場合は無効な Ticket を返す | 古い画面や Toast からの操作は、結果を捨てるだけでなく、要求を送らないことが必要である |
| 権限の再確認中の保護された情報（v0.1） | `resolveContentAccess` の既定を、確認中に保護された情報を表示しない（`hide`）にした。統合の検証画面は既定のまま使う | 認可が不明な間に機密情報を表示し続けることを、標準として保証しない（指示書 4 章）。表示を続けるかは、製品が情報の機密性で選ぶ |
| 接続の状態の表示（統合の検証画面、v0.1） | 監視の状態を、接続（オフライン、未確認）とサービス（障害、メンテナンス）に分けて、顧客の操作と保存の条件に渡す | 初期実装は、障害とメンテナンスも「オフライン」として示していた |
| 描画の中の状態の更新（v0.1、独立したレビューの後） | Registry の hook は、スコープの変更を描画の中の `setState` や ref の書き換えで反映しない。状態を `useScopeGuard` の値かスコープと組にして持ち、描画の中で照合する。最新の関数と値を持つ ref は、commit の後（layout effect）に更新する | commit されなかった描画（中断された transition）の中の `setState` が後から適用され、表示中のスコープの状態を初期化した（Settings の hook の検品で確かめた）。描画の中で書き換えた ref は、破棄された描画の値のまま残り、表示中のスコープの操作を止めた（`useAccess` の `latest()` の検品で確かめた） |
| 未統合の Patterns | Forms & Workflows（Unsaved Changes、Confirmation、Multi-step Workflow、Create & Edit、Form Layout、Import & Export）と Data Analysis は読み込まず、既存の Components とプレビューの `DiscardAlert` で代替した。Patterns Integration Review で、Unsaved Changes（`UnsavedChangesProvider`、`useUnsavedChanges`、`useNavigationGuard`、`DiscardChangesAlert`）に置き換えた（下の「Patterns Integration Review での変更」）。Confirmation は置き換えていない。Multi-step Workflow は 2 回目（`fix/pi-system2`）で置き換えた | 指示書の「未統合の Patterns を独自に再実装しない」 |

## Patterns Integration Review での変更

Patterns Integration Review（指示書 6 章、11 章、12.1、12.2、12.6）の独立した監査で見つかった問題のうち、System & Account、Overlay、Toast に関わるものを直した。確定した仕様を変えた箇所は、理由、影響の範囲、代替案を記録する。

### API の変更

| 対象 | 変更（前 → 後） | 互換性 | 理由 |
| --- | --- | --- | --- |
| `setting-resolve.ts` の `settingAccess` | 引数に `unresolved`（`"loading"`、`"error"`、`"refreshing"`、`"stale"`、`null`）と `unresolvedReason` を追加。`restriction` に `"unresolved"` を追加 | 既存の呼び出し（引数なし）は同じ結果。`restriction` を網羅的に分岐する製品のコードは、`"unresolved"` の分岐が必要になる | 権限の再確認中に、組織の設定の保存の操作が有効のままだった（PERM-1）。理由の順序は `decideAccess` と同じ（ポリシー、契約プラン、権限、未確定） |
| `auth-flow.ts` の `decideReauthenticationRestore` | 閲覧の権限を失い、結果が不明な保存がある場合の `pendingMutation`：`"unresolved"` → `"discarded"` | 戻り値の 1 つの値が変わる。`"discarded"` を記録の破棄として扱っている製品は変更不要 | `discard` に `unconfirmed-mutation`（記録を破棄）を含めながら `unresolved`（照会をやり直す）を返し、矛盾していた（AUTH-7。authentication.md） |
| `notification-feed.ts` の `useNotificationFeed` | スコープの変更で保持する状態を置き換える処理を、描画の中の `setState` から layout effect に移した | API は変わらない。描画の中で別のスコープの状態を返さないことも変わらない | commit されなかった描画で、表示中のスコープの状態を初期化しないため（NTF-2） |
| `combobox.tsx`（Combobox と Multi Select） | 一覧の Positioner に `in-[[data-base-ui-inert]]:z-40` を追加 | 見た目は、後からモーダルが開いた場合だけ変わる | Select、Popover と同じく、後から開いたモーダルの背面に入り、押せないようにするため（OVL-3） |
| `drawer.tsx` の `DrawerFooter`、`sheet.tsx` の `SheetFooter`、`toast.tsx` の `Toaster` | Footer が表示中に `--toast-offset-overlay` を設定し、`Toaster` は `--toast-offset-bottom` と大きい方を使う。`DrawerFooter`、`SheetFooter` は `ref` を受け取る（React 19 の `ref` の props） | 新しい CSS の変数を追加した。`--toast-offset-bottom` の意味は変わらない（製品が画面の下の固定の操作に使う変数を上書きしない） | 狭い画面の Drawer と、下・左右の Sheet の Footer の操作に、操作つきの Toast が重なっていた（OVL-1、OVL-2） |
| プレビューの `ReauthScreen` | `discardedInput` を追加 | 既定は false（前と同じ文） | セッション切れで保存していない入力を破棄したことを示す（AUTH-3） |
| プレビューの `MfaScreen` | `focusOnMount` を追加 | 既定は false | AUTH-4 |
| プレビューの `SettingsArea`、`SettingsSectionProps` | `access`（`useAccess` の戻り値）を追加 | 渡さない場合は `scope.permissions` を確認済みとして扱う（前と同じ） | PERM-1 |
| プレビューの `NavigateOutcome` | `reason` に `"unresolved"` を追加 | 既定の扱いは前と同じ | NTF-1 |

新しい公開 API は、`settingAccess` の引数と `restriction` の値、`--toast-offset-overlay`（CSS の変数）だけである。どちらも、既存の部品の仕組みでは安全性の問題を直せなかったため加えた。

### 統合の検証画面の変更（製品側のコードの例）

| 事項 | 変更 | 理由と影響 | 採らなかった案 |
| --- | --- | --- | --- |
| 権限の再確認中の組織の設定 | `SettingsArea` に `access` を渡し、組織の設定とメンバーの一覧を `resolveContentAccess`（既定の `hide`）で表示しない。入力を残すため、フォームはアンマウントせず `hidden` と `inert` にする。保存、ポリシーの保存、削除、招待は `access.latest()` で判断し直す | ロールの変更の後、権限を取得し直すまで、組織名を表示し、保存の要求を送れた（PERM-1） | フォームをアンマウントする案：表示中の入力が、権限が変わらない場合にも失われるため採らなかった |
| 組織の設定の正本 | 組織名とポリシーの正本を Settings の模擬のサーバーにした（`orgNameOf`、`orgPolicyOf`、`subscribeOrgSettings`）。認証の模擬のサーバー、ログインの画面、Permission States の例、Sidebar と Header が読む | 保存した設定が、ログインの判定と Sidebar の組織名に反映されなかった（SET-3）。`model.ts` の `orgSettings` は初期値として残す | `model.ts` の値を書き換える案：模擬のサーバーの `reset` で初期値に戻せなくなるため採らなかった |
| 未保存の変更の確認 | `UnsavedChangesProvider`（Forms & Workflows）に置き換え、ブラウザの戻る・進む（`hashchange`）も確認する。確認の間は `history.pushState` で表示中の URL に戻し、移動するときは `history.replaceState` で移動先の URL にする | ブラウザの戻る操作で、確認せずに入力を失った（SET-1）。戻った後に取りやめると、戻る前の履歴の 1 つ先（進む）は失われる | 履歴の位置を `history.go(1)` で戻す案：非同期で、移動の向きを判断できないため採らなかった |
| 結果が不明な保存と移動 | 移動の確認の文を `describeUnsavedSettings` で変え、「保存できたかを確認していません」と示す。「保存して移動」は示さない | 結果が不明でも「入力した内容は保存されません」と示していた（SET-2） | 移動を禁止する案：確認の操作ができない状態（通信の障害）で移動できなくなるため採らなかった |
| 保存して移動 | 明示的な保存のフォームの `onSave` を登録する。入力の誤り、確認の Dialog が必要なポリシーの変更、最新の権限を確認していない間は示さない | SET-7 | |
| 権限不足の保存の後 | `onPermissionDenied` で `access.reload()` を呼ぶ | SET-5 | |
| セッション切れ | 確認を挟まずに進め、Toast を閉じ、保存していない入力があった場合は再認証の画面で示す。戻る位置（`pathFromRoute`）に設定のカテゴリ、お知らせ、処理の状況、稼働状況を加えた | AUTH-3、AUTH-6 | |
| 復帰先 | `canOpenAccountPath`（ページのアクセスと同じ `pagePermission` と、権限の模擬のサーバーの現在のロール）で判断する | 復帰先がロールの初期値と別の権限で判断されていた（AUTH-1、AUTH-2） | |
| 接続の監視 | `useConnectedApi` で、設定とお知らせの要求の応答を `reportReachable` と `reportFailure` に報告する。接続を確認できない間は、保存と既読の更新を送らず、確定した失敗にする。接続が回復したらお知らせを取得し直す | SYS-3。設定の画面は、回復の後に取得し直さない（取得し直すと、入力中のフォームを作り直すため。結果が不明な保存は「確認する」で確かめる） | |
| 接続の表示 | `connecting` を顧客の操作に「接続を確認しています」（`unconfirmed`）として渡す。「復旧を確認中」の Banner の文を、止めていない操作を「できません」と示さない文にした | SYS-1、SYS-2 | 復旧の確認の間、登録・更新・削除を止める案：`getMutationAvailability` の確定した仕様を変えるため採らなかった |

### Patterns Integration Review の 2 回目（ブランチ `fix/pi-system2`）

1 回目（`fix/pi-system`）で残した事項のうち、指示書 9.7、11.2〜11.4、11.7、12.5 に関わるものを直した。確定した仕様を変えた箇所の理由、影響、代替案は、各資料に記録した（onboarding.md、settings.md、permission-states.md、notifications.md、toast.md）。

| 対象 | 変更（前 → 後） | 互換性 | 理由 |
| --- | --- | --- | --- |
| `access-decision.ts` の `Restriction`、`decideAccess`、`presentAction` | `unresolved` に省略可能な `missing` を追加。再確認中、再確認の失敗、`verified: false` の間、前の権限に含まれない権限が必要な操作の理由：`authorization` → `unresolved`（`missing` 付き）。`presentAction` は `missing` がある場合に認可と同じ規則で `hidden` と `disabled` を決める | 型は追加だけ。確認中の理由の `kind` と文が変わる（表示のモードは同じ）。確認済み（`ready`）の結果は変わらない | 新しいロールで許可される操作に、確認が終わるまで「権限が必要です」と示していた（PERM-6）。既存の型の値だけでは、表示のモードを保ったまま理由を変えられなかったため、`missing` を加えた |
| プレビューの `CreateOrganizationSetup` | 独自の手順の表示（`setupStepsOf`、`moveTo`、「手順 n / m」）を `useStepFlow`、`Stepper`、`useFormState`、`handleSubmit`、`useUnsavedChanges`、`DiscardChangesAlert` に置き換えた。`setupStepsOf` は `StepDefinition` の配列を返す | props は同じ | 9.7（onboarding.md） |
| プレビューの `useGettingStarted` | `results` に `null`（取得中）を、`resultsError`、`tasks`、`pending` を追加 | 既定は前と同じ | ONB-1、ONB-2、ONB-4。Registry には移していない（模擬の API と作業の定義に依存するプレビューの製品側の hook のため。onboarding.md の部品の表を直した。ONB-5） |
| プレビューの `NotificationSettingsMatrix` | `onPermissionDenied` を追加。結果が不明な項目を自動で取得し直さない | 渡さない場合は権限を取り直さない | SET-6 |
| プレビューの `requestNavigate`（`account-signed-in.tsx`） | `recheck` を追加し、結果を `"navigated" \| "cancelled" \| "blocked"` にした | 製品側のコードの内部 | NTF-3 |

| 事項 | 変更 | 理由と影響 |
| --- | --- | --- |
| 統合の検証画面の Checklist | 製品のデータ（顧客、メンバー、処理の状況）から作業結果を作って渡す。画面のない作業（支払い方法、プロフィールの写真）を対象にしない。権限を確認できない間は Checklist を導かない | ONB-1、ONB-2。作成した直後の組織を App Shell の製品の画面に接続しないことは、プレビューの制約として記録した（ONB-3） |
| 0 件と完了、サンプルの分離 | 変更なし。既存の検品で確かめた：`system-account-onboarding-logic.spec.ts` の `zero tasks…`、`invited member whose remaining tasks…`、`adding to the sample space…`、`sample data does not enter billing usage…`、`system-account-onboarding.spec.ts` の `sample data is not counted for billing…`、`after all tasks are done…`。統合の検証画面では `ONB-1` の検品で、閲覧者（0 件）に完了を示さないことを加えた | 11.4 |
| タイムゾーンの正本 | 通知の設定は、個人の設定の `timezone` を使う | SET-4 |
| 書き出しの開始できない理由 | `monitor.mutation("export").reason` ごとの文 | PERM-4 |
| 権限の再確認中の新着 | `holdIncoming` で保留する | PERM-5 |
| Authentication の例のセッション切れ | 保存の失敗をセッション切れとして扱うかを、セッションごとの `useScopeGuard` の Ticket で判断する（closure のセッションの ID を比べない） | AUTH-8。応答を待つ間に再認証した場合に、新しいセッションを再認証の画面に戻していた |
| Toast の `select-none` | 変更なし。入力できる要素のフォーカスと入力を妨げないことを確かめ、検品を加えた | 12.5（toast.md） |

## 統合時に確認する事項

Forms & Workflows と Data Analysis は、v0.1 の最終調整の時点（2026-11-27）では main に統合されていなかった（`origin/feat/forms-and-workflows-patterns` の `40df108`、`origin/feat/data-analysis-patterns` の `f5769d5`）。2 つのブランチは `git show` で読んだだけで、コードを持ち込んでいない（未統合の Patterns を再実装しない）。

その後、2 つは main に統合された（PR #1 `ebb0f24`、PR #2 `215a9f4`）。このブランチには `b5ea769` で取り込んだ（「main への統合の前の検証」）。取り込みでは、共有ファイルの双方の変更を残しただけで、下の置き換えと接続は行っていない。次の事項は、Patterns Integration Review の横断の検品で確かめる。詳しくは各資料の「統合時に確認する事項」にある。Patterns Integration Review（2026-11-28、ブランチ `fix/pi-system`）の時点の状況を、表の右の列に記録した。

| 統合する Pattern | 確かめること | 状況（Patterns Integration Review、2026-11-28） |
| --- | --- | --- |
| Unsaved Changes | ログアウト、アカウントとワークスペースの切り替え、設定のカテゴリの移動、通知からの移動、統合の検証画面の画面の移動の確認（現在はプレビューの `DiscardAlert`）を、Unsaved Changes の部品と文言に置き換える。ブラウザの戻る操作での確認は、現在は扱っていない | 置き換えた。統合の検証画面（`account-app.tsx`、`account-signed-in.tsx`）と Settings の単独のプレビューは `UnsavedChangesProvider` を置き、設定の明示的な保存のフォームを `useUnsavedChanges` で登録する（`settings-parts.tsx` の `useSettingsFormUnsaved`）。ブラウザの戻る・進む（`hashchange`）も確認する。Dialog と Sheet の中の破棄の確認（招待、顧客の登録、通知の設定の例、Authentication の例）は `DiscardChangesAlert` に置き換えた。結果が不明な入力の文は、製品の `labels.description`（`describeUnsavedSettings`）で変える |
| Confirmation | ロールの変更、2 段階認証の無効化、ポリシーの保存とリセット、アカウントとワークスペースの削除の確認（現在は `AlertDialog`）を置き換える。再認証とログアウトに確認を出さない方針が、Confirmation の判断基準と一致するか | 未実施。`AlertDialog` のまま（`confirm-action.tsx` は別の担当が並行して変更しているため、現在の API の確定を待つ） |
| Multi-step Workflow | 組織の作成（`CreateOrganizationSetup`）を置き換える。手順の見出しへのフォーカス、作成の要求の ID、結果の不明の確認を保つ | 置き換えた（2 回目の `fix/pi-system2`。onboarding.md の「統合時に確認する事項」） |
| Create & Edit、Form Layout | 認証のフォーム、設定の明示的な保存のフォーム、顧客の登録と編集の入力の検証と配置を合わせる | 未実施 |
| Import & Export | 長時間の処理の一覧（`JobStatusList`）、Onboarding の「既存の顧客を取り込む」の完了の判定を、Import & Export の結果と照合する | 未実施 |
| Data Analysis | 集計値と Chart で、閲覧できない対象を含めないこと、集計の取得の失敗と鮮度の表示を、その Pattern の資料にも記載する | この担当の範囲外（Data Analysis の担当が確かめる） |
| 世代の管理（Forms & Workflows） | Forms & Workflows の `useFormState`、`useInstantSave`、`ConfirmAction`、Bulk Actions は、hook ごとに `generation` の ref を持ち、スコープの変更を passive effect（`useEffect`）で反映する。`useScopeGuard` と責務（古い応答の無効化）が重なる。違い：`useScopeGuard` は commit の時点（layout effect）で世代を進め、描画の中の照合、Snapshot による開始の防止（`beginIfCurrent`）、別のインスタンスの Ticket の拒否、キーの記録の `release` を持つ。passive effect で世代を進める方式は、commit から effect までの間に届いた古い応答を受け付ける可能性がある（推測。未検証）。統合の後に比べ、共通化に価値がある部分（Snapshot と開始の防止）だけを共通化する。既存の `useBrowseData` と Bulk Actions は置き換えない | `38174eb`（共通の hook の修正）で、`useFormState`、`useInstantSave` などをスコープと組にした状態と commit の時点の ref に直した。この資料の範囲では再確認していない |
| 保存の分類（Forms & Workflows） | Settings の `classifySaveError` と、Forms & Workflows の `outcomeOf`（`save-modes.ts`）、`form-state.ts`、`confirm-action.tsx` の判定が重なる。分類できない例外の既定は、どちらも「結果の不明」にそろえた。Settings にある `forbidden`、`conflict`、`partial`、版の照合の扱いは Forms & Workflows にない（settings.md） | 未実施（変更なし） |
| Data Analysis の閲覧の制限 | `AnalysisRegion` は再取得の間に前の結果を残す。権限の再確認の間は、保護された指標と明細を `resolveContentAccess`（`whileUnverified`）で隠すか、製品が選ぶ。`useBrowseData` の `scopeKey` に認可の範囲を含める。Drill-down は、移動の直前に現在の認可で判断し直す（`access.latest()`、`beginIfCurrent`） | この担当の範囲外 |
| Data Analysis と System States | 接続が回復した後の再取得（`lastOutage`）、部分的な障害の間の `AnalysisRegion` の表示、運用のダッシュボードの稼働の状態と `ServiceStatusReport` の値をそろえる | この担当の範囲外。統合の検証画面のお知らせは、`lastOutage.seq` の変化で取得し直すようにした（SYS-3） |
| 共有ファイル | `catalog.ts`、`package.json` の `test:patterns`、`build.sh`、README、`button.spec.ts`、`playwright.config.ts` は 3 つのブランチが変更している。双方の変更を残す | 変更なし |

## 検品

| 対象 | 検品（`preview/tests/`） |
| --- | --- |
| Authentication | `system-account-auth.spec.ts`、`system-account-auth-logic.spec.ts`（ブラウザを使わない。復帰先の表形式の検品を含む） |
| Settings | `system-account-settings.spec.ts`、`system-account-settings-logic.spec.ts`、`system-account-settings-harness.spec.ts`（hook の古い closure、commit されない描画） |
| Onboarding | `system-account-onboarding.spec.ts`、`system-account-onboarding-logic.spec.ts` |
| Permission States | `system-account-permission.spec.ts`、`system-account-permission-logic.spec.ts` |
| System States | `system-account-system.spec.ts`、`system-account-system-logic.spec.ts` |
| Notifications | `system-account-notifications.spec.ts`、`system-account-notifications-logic.spec.ts` |
| 共通の `useScopeGuard` | `system-account-scope-guard.spec.ts`：StrictMode で描画した検品用の画面（`preview/src/ssr/scope-guard-harness.tsx`）で、A → B → A の世代、同じキーの最新、Snapshot による開始の防止、アンマウント、別のインスタンス、古い closure（A → B と A → B → A）、中断された transition、描画の中の照合、`release` |
| 統合の検証画面 | `system-account-app.spec.ts`：初期実装の場面に加え、通知の対象の確認を待つ間のワークスペースの切り替えと権限の変更、権限の再確認の間の書き出しの開始、変更の知らせと同じタスクの中の押下、結果が不明な既読の「確認中」とヘッダーの件数、A → B → A の後の古い購読からの配信 |
| SSR と Hydration | `ssr-system-account.spec.ts`：window、document、navigator なしの描画、権限が未確定の最初の描画、接続が未確認の最初の描画、Hydration の不一致なし、hook のファイルと純粋な関数のファイルの `"use client"` の境界 |

`system-account-*.spec.ts` と `ssr-system-account.spec.ts` は `npm run test:components` に含まれる。Patterns だけを実行する場合は `npm run test:patterns`。

### 時間に依存する検品

応答の順序を確かめる検品は、模擬のサーバーの応答の保留と解放（`hold` と `release`。各 Pattern の `window.__fdSa*Server`、Data Browsing の `window.__fdBrowseServer`）で順序を決める。製品のタイマー（再試行の間隔、表示の遅延）は `page.clock` で進める。待機の時間を延ばすことで失敗を隠していない。

| 対象 | v0.1 で直した検品 |
| --- | --- |
| Data Browsing（`data-browsing.spec.ts`） | A → B → A の一括操作（A で開始 → 要求の開始を確認 → 応答を保留 → B へ → A へ → 最初の A の応答を解放 → 状態と Toast に影響しないこと。対照として、現在の A の応答では Toast が出ること）、詳細の競合、一覧の A → B → A、アンマウント、実行中の選択の変更など 14 件。Reduced Motion の検品の時間依存（600ms の取得の前に操作する前提）も直した |
| System & Account | 各 Pattern の spec の固定の `waitForTimeout` と固定の応答時間による順序の前提を、保留と解放、`page.clock`、要求の回数の待機に置き換えた。統合の検証画面の 3 件（通知の A → B → A、通知の対象の確認中の切り替え、権限の再確認中の書き出し）も同じ方式にした |

固定の待機が残る検品：Data Browsing の IME の変換中に要求を送らないこと（600ms）と、200ms 未満の読み込みで Skeleton を出さないこと（300ms）の 2 件。どちらも「起きないこと」の確認であり、負荷の下では失敗ではなく、確認できないまま成功する可能性がある。

### 検品環境の競合（1063 件の失敗の調査）

初期実装の検品で、既定のワーカーの数（9）で `npm run test:components` を実行したとき、2978 件のうち 1063 件が失敗した。

確認できた事実：
- 1063 件のうち 1061 件は、検品用の Vite の開発サーバー（Node.js の process）が、次の V8 の致命的なエラーで異常終了した後の接続の失敗（`ERR_CONNECTION_REFUSED`、WebKit では「Could not connect to the server」）である：`abort: Lazy deopt after a fast API call with return value is unsupported`。スタックは `Buffer.byteLength` → `ServerResponse.end` → Vite の `viteTransformMiddleware`（変換したモジュールの送信中）。残りの 2 件は、応答の時間を前提にした検品の失敗（「時間に依存する検品」で直した）。
- 異常終了したのは、この worktree が起動したサーバーである（ヒープの記録のパス）。別の worktree のサーバーを使ったのではない。`preview/vite.config.ts` の `strictPort: true` と、`preview/playwright.config.ts` の `reuseExistingServer: false` により、ポートが使用中の場合は検品を始めない（既定のポート 5174 を別の worktree のサーバーが使っていたとき、Playwright は「is already used」で開始を拒否した）。
- 同じ異常終了を、3 つの worktree の 7 回の検品の記録で確認した。900 件以上の検品の実行のうち、9 ワーカーで 33 回中 6 回、4 ワーカーで 21 回中 1 回発生し、3 ワーカーでは 9 回中 0 回だった（記録の重複を含む可能性がある）。
- 担当のポート（5207）で、9 ワーカーで 1520 件を実行し、約 9 分後に同じ異常終了を再現した。その間、Vite の HMR の更新が 16 件あり、依存の再最適化と全体の再読み込みはなかった。
- 実行環境：Node.js 26.10.0、Vite 8.3.8、Playwright 1.65.1、CPU 18 コア（Playwright の既定のワーカーの数は 9）、メモリ 48 GiB、load average 30〜88（調査の時点）。メモリ不足を示す記録はない。
- 各 worktree は自分の `node_modules/.vite` を持つ。同じ worktree の中で並行する Vite のサーバーは、同じ `node_modules/.vite` を使う。
- 同じ worktree をほかの作業者が編集している間の検品は、編集の途中のファイルを読み込む（構文エラーの HTTP 500 で 68 件が失敗した例がある）。

再現条件：Node.js 26.10.0 と Vite 8.3.8 の開発サーバーで、9 ワーカーで 1000 件以上の検品を約 10 分続け、ほかの worktree の検品が同時に動いている高い負荷の状態。発生は確率的である。

推定原因（未確認）：V8 の最適化の状態に依存する Node.js / V8 の問題であり、要求の量が多いほど発生しやすい。Node.js の修正の有無、別の版（Node.js 24 LTS など）での発生、V8 のフラグ（`--no-turbo-fast-api-calls`）による回避は確かめていない。単純なスクリプト（`Buffer.byteLength` を 300 万回呼ぶ）では再現しなかった。

未確認事項：前回の実行の間の HMR と依存の再最適化の有無（標準出力を記録していなかった）、同じ worktree の複数の Vite のサーバーがキャッシュを共有することによる失敗（観測していない）、3 ワーカーで発生しないこと（観測した範囲で 0 件というだけで、保証はない）。

対処：
- 大規模な検品（`test:components`、`test:patterns`）は、3 ワーカー（`--workers=3`）で実行する。既定の値は変えていない。
- 並行するセッションでは、`PREVIEW_TEST_PORT` を必ず指定し、成果物の出力先（`--output`）を分ける。ほかのセッションのプロセスは停止しない。
- Vite の標準出力（HMR の更新、再読み込み、依存の最適化）を検品の記録に残すよう、webServer に `stdout: "pipe"` を設定した。
- 検品の最終の結果は、作業ツリーの編集が止まった時点で取る。
- 後続の課題：同じ worktree の中で並行する Vite のサーバーの `cacheDir` の分離、Node.js の LTS の版での確認。CI と本格的な検品の基盤は、今回の対象外である。

### 検証の結果（v0.1 の最終調整の後）

- 実施日：2026-11-27
- 環境：macOS（Darwin 25.6）、CPU 18 コア、メモリ 48 GiB、Node.js 26.10.0、Vite 8.3.8、Playwright 1.65.1（Chromium 159、WebKit 2388）
- 統合の候補：`origin/main`（`aa7e664`）の上のこのブランチ。`origin/main` は作業の間に変わっていない（Forms & Workflows と Data Analysis は未統合）。検品は、作業ツリーに変更がない状態のコミット `189ed9a`（作業中のコミット。最終のコミットにまとめた）で行った。最終のコミットとの差は、資料（`docs/web/patterns/` の 7 つ）の状態の行と、この資料の検品の記録の追記だけである
- ワーカーの数：3（`--workers=3`）。開発サーバーのポートは 1 回目が 5231、2 回目が 5232（`PREVIEW_TEST_PORT`）。成果物の出力先は回ごとに分けた。ほかの worktree のセッションの検品が同時に動いていた可能性がある（停止していない）
- 全件の検品を 2 回続けて実行した（1 回目 03:06〜03:38、2 回目 03:38〜04:10）

| 確認 | 1 回目 | 2 回目 |
| --- | --- | --- |
| `npm run typecheck` | 成功（exit 0） | 成功（exit 0） |
| `npm run preview:build` | 成功（exit 0。チャンクの大きさの警告は従来どおり） | 成功（exit 0） |
| `npm run test:tokens` | 成功（failed 0） | 成功（failed 0） |
| `npm run test:ssr` | 96 件成功 | 96 件成功 |
| `npm run test:patterns` | 1978 件のうち 1881 件成功、97 件 skip、失敗 0 件（9.6 分） | 1881 件成功、97 件 skip、失敗 0 件（9.6 分） |
| `npm run test:components` | 3638 件のうち 3392 件成功、246 件 skip、失敗 0 件（21.6 分） | 3392 件成功、246 件 skip、失敗 0 件（21.6 分） |

- 記録された例外は、Vite の HMR の WebSocket の接続のコンソールのエラー（`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`、`consoleEnvironment`）だけである。製品の例外とコンソールのエラー（`consoleProduct`、`unexplained`）は 0 件。
- その前の回（コミット `84cb367`）では、`test:components` で既存の Components の検品「Select › typeahead and scroll」が WebKit で 2 件失敗した。`origin/main` の作業ツリーでも再現する時間依存であり、検品の待機の条件を直した（「既存の Components と Patterns への影響」）。この失敗は上の 2 回には含まれない。
- 既存のテストの削除、不要な skip の追加、許容誤差の拡大はしていない。既存のテストの変更は、`button.spec.ts`（初期実装）、`data-browsing.spec.ts` と `forms.spec.ts`（時間依存の修正。期待値は同じ）、System & Account の spec の期待値の一部（v0.1 で仕様を変えた箇所。例：確認中の保護された情報を既定で表示しない、`requirementsMet` の意味、不完全なエンコードの拒否）である。新しい skip は、画面の幅を 320px に変えて確かめる検品を幅を変えないモバイルの project で対象外にしたものと、Chromium の CDP とクリップボードを使う検品の WebKit での対象外である。
- スクリーンショット（Git の管理外）：6 つの資料のページと統合の検証画面（ホーム、顧客の詳細、権限の再確認中、通知の設定）を、Chromium 1280×900、Pixel 7、320px、WebKit 1280×900、iPhone 15（Playwright の WebKit）で撮り、目視で確かめた。すべての画面で横方向のスクロールはなく（`scrollWidth - clientWidth` が 0）、ページの例外は 0 件だった。実機での目視は行っていない。

### main への統合の前の検証（Forms & Workflows、Data Analysis の統合の後）

v0.1 の最終調整（`694c8f6`）は、次の条件で承認された。Forms & Workflows と Data Analysis が main に統合された後に、最新の `origin/main` を取り込み、全件の検品を再実行すること。

- 取り込み：`origin/main` の `215a9f4` を merge した（`b5ea769`）。この時点の main は、PR #4（`a132344`）、PR #1（`ebb0f24`）、PR #2（`215a9f4`）を含む。force push はしていない。
- 競合と解消：次の 4 ファイルで競合した。すべて双方の変更を残し、Forms & Workflows、Data Analysis、System & Account の順に並べた。
  - `README.md`：2 か所
  - `package.json`：`test:patterns`
  - `preview/src/catalog.ts`：4 か所
  - `scripts/diagrams/build.sh`：図の生成の一覧
- 競合のなかった共有ファイル：`playwright.config.ts`、`button.spec.ts`、`forms.spec.ts`、`company-server.ts`、`data-browsing.spec.ts` は、取り込みの後に `origin/main` と同じ内容である。次の 3 つは、PR #4 で同じ内容が main に入っていた。重複はない。
  - `playwright.config.ts` の `stdout: "pipe"`
  - `forms.spec.ts` の Select の待機
  - Data Browsing の応答の保留と解放
- 取り込みの直後（`b5ea769`）の全件の検品（run1、13:46〜14:30 UTC）では、`test:components` で 7 件が失敗した。内訳は次の 3 つの検品である。
  - 「buttonVariants on `<a>` › keyboard focus and navigation」（`button.spec.ts:248`、4 つの project で失敗）
    - 原因：Tab を押す回数の上限が、固定の 120 回だった。3 つの Patterns のページが上部の一覧に加わった後は、対象のリンクに届かなかった。
    - 対処：上限を、ページのフォーカスできる要素の数にした。同じファイルの別の検品に、PR #4 で入った方法と同じである。
  - 「Sidebar (desktop) › collapse to 64px keeps every item reachable and named」（`navigation.spec.ts:155`、desktop と webkit で失敗）
    - 原因：見出しの縦の位置を、ウィンドウからの位置で比べていた。上部の一覧が長くなり、例が最初の表示の範囲の外に出た。そのため、メニューのボタンを押すとページがスクロールし、値が 34px 変わった（942.33 → 908.33）。
    - 対処：例の枠の上端からの距離で比べるようにした。期待値は変えていない。
  - 「Sheet mode and modal › mode=view, modal=指定しない」（`overlays.spec.ts:1248`、webkit-mobile で 30 秒の時間切れ）
    - 原因：WebKit が、座標が NaN のポインターイベントを発生させる既知の事象である（[Overlays](../components/overlays.md) の「ページの例外の記録」）。ページの例外の記録は、環境の事象に分類された（`environment` 2、`unexplained` 0）。Select の選択肢のクリックが効かず、時間切れになった。
    - 対処：検品は変えていない。同じ検品（5 つの組み合わせ）を webkit と webkit-mobile で 10 回ずつ実行し、100 回すべて成功した。
  - 直した 2 つの検品は、`--repeat-each=5` で全 project で 30 回成功した。skip の 10 回は、モバイルの project では Sidebar の検品を実行しないためである。修正のコミットは `a914b66`。
- 最終の候補（`a914b66`。作業ツリーに変更がない状態）で、全件の検品を 2 回続けて実行した。run2 は 14:34〜15:18 UTC、run3 は 15:18〜16:02 UTC。
- 環境
  - Node.js 26.10.0（Homebrew）。LTS の 26.13.1 の取得は、権限の確認で拒否された。そのため、v0.1 の最終調整の検品と同じ版を使った。Node.js の LTS の版での確認は、Registry & Gallery の課題である。
  - Vite 8.3.8、Playwright 1.65.1、3 ワーカー。
  - ポートは run2 が 5244、run3 が 5245。成果物の出力先は回ごとに分けた。
  - `caffeinate` でスリープを止め、蓋の状態と電源を 1 分ごとに記録した。89 回の記録のすべてで、蓋は開いており、電源は AC だった。

| 確認 | run2 | run3 |
| --- | --- | --- |
| `npm run typecheck` | 成功（exit 0） | 成功（exit 0） |
| `npm run preview:build` | 成功（exit 0） | 成功（exit 0） |
| `npm run test:tokens` | 成功（failed 0） | 成功（failed 0） |
| `npm run test:ssr` | 120 件成功 | 120 件成功 |
| `npm run test:patterns`（app-structure、data-browsing、forms-workflows、data-analysis、system-account） | 2565 件成功、187 件 skip、失敗 0 件（15.7 分） | 2565 件成功、187 件 skip、失敗 0 件（15.4 分） |
| `npm run test:components` | 4076 件成功、336 件 skip、失敗 0 件（28.2 分） | 4076 件成功、336 件 skip、失敗 0 件（27.6 分） |

- 製品の例外とコンソールのエラー（`unexplained`、`consoleProduct`）は、2 回とも 0 件だった。記録されたのは、次の 2 つだけである。
  - Vite の HMR の WebSocket の接続のエラー（`consoleEnvironment`）
  - run3 の、WebKit の座標が NaN のイベント 1 件（「Data Browsing integration › opening the list again from the sidebar…」、webkit-mobile、`environment` 6）。検品は成功した。
- Vite の異常終了（`Lazy deopt…`）、`SIGABRT`、接続の拒否は 0 件だった。
- 既存のテストの削除、skip の追加、許容誤差の拡大、待機の延長はしていない。
- 横断の検品は行っていない。System & Account の部品の、Forms & Workflows と Data Analysis の部品への置き換えと接続は、Patterns Integration Review で行う。

### 初期実装の時点の記録（2026-11-26、`d1685b6`）

初期実装の時点の検品は、`origin/main`（`aa7e664`）の上の `d1685b6` で、`test:patterns` 1221 件成功、`test:components` 2732 件成功（どちらも 3 ワーカー、失敗 0 件）だった。既定のワーカーの数の一括の実行で 1063 件が失敗した件は、上の「検品環境の競合」で調査した。

### 独立したレビュー

v0.1 の最終調整の後、別のエージェント（Opus）が、実装者の結論を渡さずに、`d1685b6` からの差分、資料、検品を、指示書の各章の要求の順に確かめた（初期実装のレビューの修正を含む）。関数は Node.js で、画面は Playwright で実際に実行して確かめた指摘が多い。指摘は高 2 件、中 5 件、低 5 件。すべて対処した。

| 指摘 | 対処 |
| --- | --- |
| 高：`useConnectivity` で接続先を変えた後に、ブラウザが offline から online に戻ると、接続の状態が `connecting` のまま止まり、「接続を確認」も押せない（最初の描画の関数を購読に登録していた） | 購読、タイマー、確認の処理は、commit の後に更新する ref から最新の guard と関数を使う。照合に失敗した Ticket が残っている場合も、要求中の記録を解除する。回帰の検品（A → B と A → B → A の後の offline → online）を追加し、修正の前の hook で失敗することを確かめた |
| 高：版の照合の即時保存で、結果が不明な保存の後に待っていた変更を、確認済みの値と等しいと判断して送らずに「保存しました」と示す（サーバーの値は異なる） | 結果が不明か競合になった項目は、確認済みの値を「未確認」として扱い、等しいことによる省略をしない。確定するのは、成功、`verify`、`replace` の場合だけ。未確認の項目の確定した失敗は、表示を戻さずに結果の不明として示す。回帰の検品を 3 件追加した |
| 中：A → B → A の後に、最初の A の描画で返した `useScopeGuard` の値から `begin` を呼ぶと、有効な Ticket になり、現在の A の同じキーの処理を無効にする | 返す値を、commit された世代に結び付けた。古い値からの `begin` と `capture` は無効な Ticket と Snapshot を返す。検品を追加した |
| 中：`replace` の後に届いた古い要求の成功が、確認済みの値と版を上書きする | 項目ごとに `replace` の回数を持ち、要求を送った時点の回数と異なる応答では、確認済みの値、版、保存済みの値を更新しない。検品を追加した |
| 中：同じスコープの中で既読の更新が `AbortError` になると、更新中の状態と一括既読の範囲が解除されず、一括既読ができなくなる | スコープが同じ場合は、`AbortError` を結果の不明として扱い、確認中にして取得し直す。何もしないのは、スコープの変更とアンマウントの後だけ。検品を 3 件追加した |
| 中：資料の「検証の結果」が初期実装の記録のままである。存在しない節を参照している。`useScopeGuard` の検品が表にない。1063 件の失敗の調査の記録がない | 最終調整の後の結果を新しい節に記録し、初期実装の記録を分けた。参照と検品の表を直した。「検品環境の競合」を、確認できた事実、再現条件、推定原因、未確認事項に分けて記録した |
| 中：System States の検品に、固定の待機による「起きないこと」の確認が 10 か所残っている | `page.clock` で時計を進める方式と、要求の回数を待ってから確かめる方式に置き換えた。残したものはない |
| 低：`toSafeReturnPath` が、全角の「％」（U+FF05）と「﹪」（U+FE6A）を使い、復号 → NFKC → 復号で `//` になる値を受け付ける | 各段階の値と、その NFKC の値の両方を、値が変わらなくなるまで復号し続けて確かめる。表形式の検品に 2 件追加した |
| 低：統合の検証画面の再認証の例が、非推奨の引数を渡し、ワークスペースを比べていない | 非推奨の引数を除き、ワークスペースを渡す。戻る位置は現在の所属と権限で確かめる |
| 低：統合の検証画面の検品が、空の一覧でも成功する | 配信を受けた購読者が 1 つ以上あることも確かめる |
| 低：描画の中での ref の書き換え（`useAccess`、Settings の hook） | commit の時点の値で照合する形に直した。`useAccess` は、破棄された描画の後に表示中のスコープの操作が止まることを検品で再現し、直した。新しい条件（スコープ、revision、enabled）は commit した時点から反映し、変更を検知した直後の制限は、検知した処理の中で `reload()` を呼ぶ契約で行う |
| 低：`normalizeRetryPolicy` が極端に小さい間隔と大きい回数を受け付ける | 間隔を 100ms 以上 1 時間以下、回数を 100 回以下に収める（`retryPolicyLimits`） |

レビューの修正に伴う監査で、次の不具合も見つけて直した：Onboarding の操作の処理中の状態が、A → B → A の後に Loading のまま残る。通知の削除が、同じスコープの `AbortError` の後に削除中のまま残る。Settings の hook の描画の中の `setState` が、commit されなかった描画の後に、表示中のスコープの状態を初期化する（「独自に判断した事項」）。

#### 修正の確認

指摘の修正の後、別のエージェントが、修正の差分だけを対象に、指摘の手順で問題が起きないかを確かめた（Node.js での関数の実行と、desktop の 53 件の検品の実行。失敗 0 件）。12 件のうち 11 件は解消を確かめた。残りの 1 件（資料の記録）は、この節と「検証の結果」で解消した。修正が新しく入れた問題として、低 3 件の指摘があり、すべて対処した。

| 指摘 | 対処 |
| --- | --- |
| 低：最初の A の描画で返した `useScopeGuard` の値の `beginIfCurrent` に、現在の Snapshot を渡すと、`null` ではなく無効な Ticket を返す（`if (!ticket) return` で止める利用側では、操作が始まる） | `isCurrent` に、返した値が現在の世代に結び付いていることを加えた。古い値の `beginIfCurrent` は `null`、`isCurrent` は `false` を返す。検品を追加した |
| 低：`toSafeReturnPath` の確かめる段階の数が、大きな `maxDecodeRounds` で入力の長さの 2 乗に増える | 確かめた値を記録して同じ値を再び確かめない。`maxDecodeRounds` を 16 回以下に収める。表形式の検品に 2 件追加した |
| 低：プレビューの「サーバーの設定を取得し直す」を続けて押し、応答の順が入れ替わると、古い取得の値で上書きする | 最後に始めた取得の応答だけを反映する（`useScopeGuard`）。取得を始めた後に送った保存の結果より新しい値であることは、製品の API が保証する（settings.md）。検品を追加した |

### 未検証の事項

| 項目 | 状況 |
| --- | --- |
| 実機の iOS Safari、Android | 未検証（Registry & Gallery の公開の前の課題）。ソフトウェアキーボードの表示中の認証のフォーム、モバイルの通知センターの Sheet、System Banner と Safe Area を実機で確かめていない |
| パスワードマネージャー、SMS の確認コードの自動入力 | 未検証（公開の前の課題）。`autocomplete` の属性、ペーストと自動入力の模擬（1 回の入力で全桁が入る）、表示の切り替えのボタンが値とフォーカスを失わないことを、Playwright で確かめている |
| IME | Chromium の CDP で再現した変換の範囲だけで確かめている。実機の IME は未検証 |
| VoiceOver、NVDA | 未検証（公開の前の課題）。`role="status"`、`role="alert"`、`aria-live` の読み上げの回数と時期を、Playwright の属性の検品だけで確かめている |
| Next.js（App Router）での導入 | 未検証（Registry & Gallery の課題）。`"use client"` の境界を規則で確かめ、純粋な関数のファイルが hook を使わないことを確かめている |
| Concurrent Rendering の破棄された描画 | `useScopeGuard`、`useAccess`、Settings の hook は、検品用の画面の中断された transition で確かめた。ほかの hook とプレビューの部品は、コードを読んだ範囲で直しており、破棄された描画の検品はない。追加の検品は Patterns Integration Review へ引き継ぐ |
| 実際の認証・認可・通知の配信の基盤 | 模擬のサーバーだけで確かめている |
| Forms & Workflows、Data Analysis との統合 | main の取り込み（`b5ea769`）と全件の検品は行った。Patterns Integration Review で Unsaved Changes を接続した。Confirmation、Multi-step Workflow、Create & Edit、Import & Export の置き換えと、共通の hook の責務の整理は未実施（「統合時に確認する事項」の状況の列） |
| 図 | Patterns Integration Review で、System States の offline-recovery に、接続の未確認（`unknown`）、疎通の確認がない場合の経路、`offline` の `reason`、製品が管理する「復旧を確認中」を加えた（DOC-1。`scripts/diagrams/sa_system.py` から再生成） |
| 残りの時間依存の検品 | Data Browsing の IME（600ms）と Skeleton（300ms）の固定の待機（「時間に依存する検品」）。Patterns Integration Review へ引き継ぐ |
| 検品の環境 | Node.js の LTS の版での確認、同じ worktree の中で並行する Vite のサーバーの `cacheDir` の分離。Registry & Gallery の課題 |
