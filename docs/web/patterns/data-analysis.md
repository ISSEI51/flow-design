# Data Analysis

利用者が、現在の状況を知り、変化とその理由を確かめ、具体的な問題を見つけて次の行動に移るまでを扱う Patterns のグループ。Metric Overview、Dashboard Layout、Analysis Filters、Period Comparison、Drill-down の 5 種類からなる。

状態：初期実装（レビュー前。v0.1 確定ではない）

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../diagrams/data-analysis-dark.svg">
  <img alt="Data Analysis の 5 種類の関係を示す図。上部の点線の枠 Dashboard Layout（考える順に並べる）が画面全体に適用され、その下で Metric Overview（現在の状況を知る）、Period Comparison（何が変化したか）、Drill-down（なぜ・どこで変化したか）が左から右へ並ぶ。下部の帯 Analysis Filters（対象と期間を決める）が 3 つすべての前提になる条件として接続している。" src="../../diagrams/data-analysis-light.svg">
</picture>

## 考える順

データを並べることではなく、利用者の判断につながる情報の構成を目的とする。基本の順序は次のとおり。すべての画面に機械的に当てはめず、製品と目的に応じて判断する。

1. 現在の状況はどうなっているか（Metric Overview）
2. 何が変化したのか（Period Comparison）
3. なぜ変化したのか（内訳、増減の要因）
4. 具体的にどこに問題があるのか（Drill-down）
5. 次に何をするのか（業務画面への移動）

共通の方針：

- 表示すること自体を目的とした数値やグラフを加えない。
- 情報の重要度を、文字の大きさ、余白、配置で示す。すべての指標とグラフを Card で囲まない。
- データの意味を誤認させない。0、欠損、取得の失敗、未確定のデータを区別する。
- 全体条件と個別条件の適用範囲を明確にする。
- 分析から詳細へ、詳細から業務の操作への移動を自然にする。
- 安全性とアクセシビリティを保つ。
- 汎用の BI ツール、集計のエンジン、ダッシュボードのビルダーは作らない。

## Components と Patterns の関係

Chart（Recharts）、Table、Progress、Date Picker（`DateRangePicker`）、Calendar、Select、Popover、Sheet、Breadcrumb、Checkbox、Switch は Components（v0.1）である。App Structure の Page Layout、Page Header、Section Layout、App Shell と、Data Browsing の Data States（`useBrowseData`、`LoadingReveal`、`DataRefreshIndicator`、`DataRegionError`、`Loadable`）、Search & Filter（`useFilterDraft`）、List & Detail（`getRecordNeighbors`）、Data Table の `DataTableAppliedFilters` を組み合わせる。新しい依存パッケージは加えていない。

## 5 種類

| Pattern | 目的 | 資料 | 再利用できるコード（`registry/patterns/`） |
| --- | --- | --- | --- |
| Metric Overview | 現在の状況を指標で伝える | [metric-overview.md](metric-overview.md) | `metric.tsx`：`MetricGroup`、`Metric`、`MetricValue`、`ComparisonValue`、`MetricTarget`、`Sparkline`、`MetricDefinition`<br>`metric-format.ts`：`formatMetricValue` |
| Dashboard Layout | 考える順に並べる | [dashboard-layout.md](dashboard-layout.md) | `analysis-region.tsx`：`AnalysisRegion`、`AnalysisScopeNote` |
| Analysis Filters | 対象、期間、集計単位と適用範囲を決める | [analysis-filters.md](analysis-filters.md) | `analysis-query.ts`：`useAnalysisQuery`、`scopeFilters`、`useCrossFilter`<br>`analysis-period.ts`：`resolvePeriod`、`availableGranularities`、`reconcileGranularity`、`buildBuckets`、`toInstantRange` ほか<br>`analysis-controls.tsx`：`AnalysisPeriodFilter`、`GranularitySelect`、`ComparisonSelect` |
| Period Comparison | 公平な期間どうしで比べる | [period-comparison.md](period-comparison.md) | `comparison.ts`：`compareValues`、`describeComparison`、`formatDifference`、`getTargetProgress`<br>`analysis-period.ts`：`comparisonRange`、`alignBuckets`、`getPeriodElapsed` |
| Drill-down | 内訳、明細、詳細へ進み、戻る | [drill-down.md](drill-down.md) | `drill-down.tsx`：`DrillDownLink`、`drillPeriodFor`、`groupOther`、`captureAnalysisPosition`、`useAnalysisPositionRestore` |

### コードと資料の区分

| 区分 | 内容 | 理由 |
| --- | --- | --- |
| 再利用できるコード | 上の表の関数、hook、部品 | 数値の表記、増減と増減率の境界、同経過期間、月末・うるう年・夏時間、条件の継承と衝突、位置とフォーカスの復元は、製品ごとに書き直すと誤りやすい |
| 組み合わせの例（プレビュー） | 事業の状況（Strategic）、顧客維持の分析（Analytical）と Drill-down の 2 つの画面、処理の監視（Operational）、MRR の推移、増減差のグラフ、内訳の横棒（`BreakdownBars`）、数値の比較の表（`ComparisonTable`） | 画面とグラフの構成は、製品のデータと目的で変わる。Dashboard 専用の巨大な部品にしない |
| 設計の資料だけ | 3 つの型の構成、Chart と Table の配置、グラフの高さ、Waterfall Chart の使用の判断、表示の方法（同じ画面、Sheet、別ページ、Popover）の選び方、カスタマイズ | 画面ごとの判断であり、コードでは決められない |
| 製品の責務 | 指標の定義と集計、評価の方向と目標、API、会計期間とタイムゾーンの設定、認証と認可、ルーター、URL と保存、予測のモデル、リアルタイムの通信 | 製品の業務と基盤に依存する |

Period Comparison と Metric Overview は、増減の計算と表示を同じ `comparison.ts` と `ComparisonValue` で行い、重複して実装しない。

## 使い方の流れ

1. 分析の目的と、判断に必要な指標を決める（[metric-overview.md](metric-overview.md)）。
2. 考える順に領域を並べる（[dashboard-layout.md](dashboard-layout.md)）。
3. 全体条件と個別条件を決め、`useAnalysisQuery` で持つ（[analysis-filters.md](analysis-filters.md)）。
4. 比較の対象を決め、比較期間と比較値を求める（[period-comparison.md](period-comparison.md)）。
5. 詳細へ進む操作と、戻ったときの復元を加える（[drill-down.md](drill-down.md)）。

```tsx
const context = { today: todayIn("Asia/Tokyo"), weekStartsOn: 1, fiscalYearStartMonth: 4 }
const a = useAnalysisQuery<Filters>({ defaultQuery: { period: { kind: "relative", id: "this-month" }, comparison: "previous-month", filters }, context })
const overview = useBrowseData({ query: a.key, fetcher: (_, { signal }) => api.overview(a.period, a.comparison, a.query.filters, { signal }) })

<div role="group" aria-label="ページ全体の条件">
  <AnalysisPeriodFilter value={a.query.period} onValueChange={a.setPeriod} presets={["this-month", "last-month"]} resolved={a.period} context={context} />
  <ComparisonSelect value={a.query.comparison} onValueChange={(m) => a.setComparison(m)} options={["previous-month", "previous-year", "none"]} comparison={a.comparison} />
</div>
<AnalysisRegion title="主要な指標" status={overview.status}>
  <MetricGroup>
    <Metric label="売上" value={…} format={{ unit: "円" }} comparison={<ComparisonValue result={compareValues(…)} label="前月比" direction="increase" />} />
  </MetricGroup>
</AnalysisRegion>
```

## 状態管理の設計

| 状態 | 持つ場所 | 内容 |
| --- | --- | --- |
| 全体条件 | `useAnalysisQuery` | 期間（相対・固定）、集計単位と手動かどうか、比較、絞り込み。適用済みの値だけ |
| 入力中の条件 | `AnalysisPeriodFilter`（期間の指定）、`useFilterDraft`（まとめて適用） | 適用中の条件と区別して示す |
| 領域のデータ | 領域ごとの `useBrowseData` | 読み込み、再取得、失敗、古い応答の破棄 |
| 個別条件 | 領域ごと（製品）＋`scopeFilters` | 全体条件を引き継ぎ、絞り込む |
| Cross-filtering | `useCrossFilter` | 選択元、項目、値、名前 |
| 戻るための記録 | 製品（履歴の項目ごと） | Cross-filtering、表の並び順とページ、一覧の条件、`AnalysisPosition` |

Registry の部品は、どの状態も保存しない。保存と復元の値は、`query`、`initialQuery`、`initialSelection`、`position` などの引数で受け渡す。

## プレビュー

`npm run preview:dev` で開き、上部の「Patterns：Data Analysis」から選ぶ。

| ページ | URL | 内容 |
| --- | --- | --- |
| Metric Overview | `#/metric-overview` | 重要度と文字の大きさ、数値の表記（ロケールと省略）、増減と良否、目標（未達、超過、上限、0、マイナス、未設定）、データの状態（8 種類）、Sparkline、比較 |
| Dashboard Layout | `#/dashboard-layout` | 3 つの型、Chart と Table の配置、独立した領域の失敗と再試行、比較 |
| Analysis Filters | `#/analysis-filters` | 期間、集計単位、比較、週の始まり、半開区間とタイムゾーン、全体条件と個別条件、操作の区別、比較 |
| Period Comparison | `#/period-comparison` | 比較期間の決め方（月の途中、月末、うるう日、年をまたぐ）、比較値の算出の可否、比較のグラフ（重ね合わせ、並べた棒、増減差、表）、実績と予測、比較 |
| Drill-down | `#/drill-down` | 階層と条件の引き継ぎ（衝突を含む）、比較期間の系列から進む、「その他」、表示の方法、比較 |
| 営業管理の検証画面 | `#/analysis-app?page=business` | 5 種類を組み合わせた 3 つのダッシュボード。`page=business`（事業の状況）、`page=retention`（顧客維持の分析）→ `page=retention-accounts`（企業の一覧）→ `page=account`（企業の詳細）、`page=operations`（処理の監視）。下部の「検証用の操作」で、応答の時間、明細の権限、予測の有無、取得の失敗を切り替える |

検証画面の URL の引数：`page`、`period`（相対期間の id）または `from`・`to`（固定の期間）、`cmp`（比較）、`g`（手動で選んだ集計単位）、`region`、`plan`、`term`（全体の絞り込み）、`dplan`、`dterm`（Drill-down で加えた条件）、`id`（企業）。

すべての数値は、架空の契約の記録（`preview/src/data/data-analysis/subscriptions.ts`、乱数の種から決まった手順で作る 986 社の契約）から集計する。指標、比較値、増減率、グラフ、明細を、それぞれ固定の値として持たない。画面には「架空のデータ」と示している。基準日は 2026 年 11 月 25 日、会計年度は 4 月始まり。模擬のサーバー（`analysis-server.ts`、`window.__fdAnalysisServer`）と運用の監視のデータ（`operations.ts`、`window.__fdOpsTicker`）も `preview/src/data/data-analysis/` にあり、Registry には含めない。

検証画面は Data Analysis の検証のためのものであり、正式な Pages の実装ではない。App Structure の `StructureSidebar`、`ProductMark`、`structureNav`、`PlaceholderScreen` を読み込んで使う（複製も変更もしない）。

## 製品の責務（共通）

- 指標の定義と集計（MRR、解約率の分母、粗利の原価）、評価の方向、目標と予算。
- データの取得（API）、集計の時点の管理、権限による明細の除外。
- 「今日」（`todayIn(timeZone)`）、タイムゾーン、週の始まり、会計年度。
- URL への同期、保存した分析の条件、戻るための記録、ルーター。
- 予測のモデル（基準日、方法、不確実性）。
- リアルタイムの通信、アラートの判定。
- 業務画面の対象と権限の検証。

## 既存の Components と Patterns への影響

| 対象 | 変更 | 互換性 |
| --- | --- | --- |
| Components（`registry/components/ui/`） | 変更なし | |
| App Structure、Data Browsing（`registry/patterns/` の既存のファイル） | 変更なし。`useBrowseData`、`useDelayedFlag`、`LoadingReveal`、`DataRefreshIndicator`、`DataRegionError`、`Loadable`、`useFilterDraft`、`getRecordNeighbors`、Page Layout、Section Layout、App Shell をそのまま使う | |
| `preview/playwright.config.ts` | `tsconfig: "./tsconfig.json"` を追加した。Node.js の単体の検品で、registry のファイルの `@/` の別名を解決するため | 既存の spec はすべて preview/ の下にあり、同じ tsconfig を使っていた。検品の結果は変わらない（下の検品の結果） |
| `preview/src/catalog.ts` | 分類「Patterns：Data Analysis」と 6 ページを追加した | 既存のページの id と URL は変わらない |
| `package.json` | `test:patterns` に `data-analysis` を追加した | |
| `scripts/diagrams/build.sh` | 生成のスクリプトに `gen_data_analysis.py` を追加した | 既存の図の出力は変わらない |

## 並行している作業との関係

- Forms & Workflows は、この作業の開始の時点（origin/main 1882f2a）で main に統合されていない。検証画面の業務画面への移動（`page=work`）は、引き継いだ条件を示すだけの画面にし、Forms & Workflows の Patterns を再実装していない。統合の後に、登録・編集の流れとの接続を確かめる。
- Data Browsing は初期実装（レビュー前）のまま main に統合されている。Data Browsing の部品は変更していない。最終調整で API が変わった場合は、`useBrowseData`、`useFilterDraft`、`getRecordNeighbors`、`DataTableAppliedFilters` の利用箇所を確かめる。
- 共有のファイル（`catalog.ts`、`package.json`、`build.sh`、`README.md`）は、統合の時に双方の変更を残す。

## 独自に判断した事項

指示書に定めのない点、または既存の仕様と関わる点を、次のように決めた。レビューで見直す。

| 事項 | 判断 | 理由 |
| --- | --- | --- |
| 省略表記の基準 | 既定は絶対値 1,000,000 以上で省略、有効数字 3 桁。値が変わる場合だけ「約」 | 指示書の例（3,680万円、約4.42億円、約512万件、428社）と一致する最小の規則。製品は `compactFrom`、`significantDigits` で変えられる |
| 評価の文字 | 減少が望ましい指標だけ「改善」「悪化」を表示し、増加が望ましい指標は色と矢印と読み上げで示す（`evaluationLabel="auto"`） | すべてに文字を付けると意味の重複が増える（原則 04）。向きと良否が逆になる指標だけは、色だけに頼らないよう文字を足す |
| 丸めると 0 になる差 | 「+0.1pt未満」と示す | 「+0.0pt」は変化がないと誤認させる |
| 目標の未達の色 | Progress の既定の色（`primary`）のまま | 指示書の「目標未達という理由だけで Destructive にしない」 |
| 上限の目標 | `direction: "decrease"` の指標は、現在値と上限を同じ単位の差で示す（「月の上限 1.5%まで あと 0.9pt」）。途中の期間では期間の経過を併記する | 小さい方が望ましい指標の「達成率」は意味が逆になる。割合の割合（42.6%）は、指標の値と誤読される（独立したレビューの指摘） |
| 期間の指定の適用 | 「この期間で集計」で適用する。プリセットはすぐに適用する | 開始日と終了日は欄ごとに確定するため、すぐに適用すると片方だけを変えた途中の期間で集計してしまう（独立したレビューの指摘）。Search & Filter の「複雑な条件では明示的な適用を許容する」に当たる |
| 期間の単位 | 暦の単位（月、四半期、年度）と一致する期間（単位の全体、または単位の初日から今日まで）だけが単位を持つ。単位がない期間では、目標、月の上限、期間の経過を示さない | 9/1〜11/25 を「9 月」として扱い、3 か月の売上を 1 か月の目標と比べていた（独立したレビューの指摘） |
| 未来の日 | 終了日が今日より後の期間は今日までに切り詰めて示し、開始日が未来の期間は不正とする。期間の選択は今日までに制限する | 未来の日を欠損や 0 として数え、途中の実績を比較期間の全体と比べていた（独立したレビューの指摘） |
| 比較期間の重なり | すべての比較で、分析の対象と重なる比較期間を不正とし、その比較を選べなくする | 3 か月の期間を前月と比べると、55 日を両方で数えていた（独立したレビューの指摘） |
| データの範囲の外 | 期間の一部でもデータの範囲（2023/01/01〜今日）の外を含む場合は、値を null（データなし）にし、明細も示さない | 範囲の外を 0 として合計し、「前年同期 0円」と比べていた（独立したレビューの指摘） |
| 売上の日割り | 月額 × 12 ÷ 365（模擬データ） | 月の日数で割ると、同経過期間の比較が暦の日数で偏る（独立したレビューの指摘） |
| 集計単位の初期値と使える単位 | 期間の日数による初期値と、区間の数（2〜400、時間別は 7 日以内）による利用可否 | 指示書の目安を、期間の長さだけで決まる規則にした。固定ではなく製品が変えられる |
| 選択肢の固定 | 集計単位と比較の Select は、選択肢を入れ替えず、使えない選択肢を無効にする | Base UI の Select が、選択肢の一覧の変更の時点で値を最初の値に戻す（検証の途中で確認した事象） |
| 個別条件の衝突 | 全体条件と重ならない個別条件・Drill-down の条件は `conflict` とし、表示できる対象がないと示す | 黙って上書きすると適用範囲を誤認し、外すと全件を誤って示す |
| Drill-down の期間 | 相対期間を固定の日付にして引き継ぐ | 開いた日と戻った日で期間が変わらないようにする |
| Drill-down の URL | Drill-down で加えた条件を `dplan`、`dterm` とし、全体条件（`plan`、`term`）と分ける | 同じ名前だと全体条件を上書きしてしまう |
| Cross-filtering の範囲 | プラン別の内訳の選択を、契約期間別の内訳と企業の一覧に適用し、指標とプラン別の内訳（選択元）には適用しない。適用する領域を文で示す | 指標は全体の状況を示す領域であり、選択で変わると現在の状況を誤認する |
| Cross-filtering の要素 | グラフの棒を直接押す方式ではなく、HTML の横棒の行をボタンにした | キーボードとタッチで確実に選べ、Drill-down のリンクと別の要素にできる |
| 再取得中の表示 | 前の結果を 200ms 後から薄く（opacity 50%）表示し、「更新中」を示す | Data States の 200ms の規則。短い再取得（リアルタイムの更新）でちらつかない |
| 主要な指標の取得 | MRR、売上、契約企業数、解約率などを 1 回の要求で取得する | 比べる指標の集計の時点をそろえる |
| MRR の増減の内訳 | Waterfall Chart の代わりに、増減差のグラフと期首・期末の文、数値の表で示す | Waterfall Chart の汎用の部品化は対象外。使用の判断は Period Comparison の資料に書いた |
| 予測の色 | 予測は `chart-3` の破線と範囲、途中経過は `chart-1` の点線 | 実績と同じ色の破線だけでは、途中経過と予測を区別できない |
| 新しいアラート | 自動で一覧に加えず「新しいアラートを表示（n件）」のボタンで加える | 読んでいる位置とフォーカスを動かさない |
| 監視の指標 | 全体のエラー率と最も遅い応答時間をやめ、「エラー率が上限を超えたサービス」の数と名前にした | サービスごとに上限が異なり、全体の値では異常を示さない（独立したレビューの指摘） |
| 比較の自動の変更 | 期間の種類が変わり、選んでいた比較を使えなくなった場合は、使える最初の比較にし、`role="status"` で知らせる | 集計単位の自動の変更と同じ扱いにする |
| 権限のない明細 | 模擬のサーバーが除き、件数だけを返す。企業の詳細は `forbidden` を返し、画面は再試行を置かない | 指示書の「権限のない明細をクライアント側へ渡して非表示にする方式に依存しない」 |
| 検証画面 | App Structure と Data Browsing の検証画面を変更せず、別の画面 `analysis-app` として作った | 並行している作業との共有のファイルの変更を避けた |
| Node.js の単体の検品 | `preview/playwright.config.ts` に `tsconfig` を指定した | registry のファイルの `@/` の別名を Node.js で解決するため |

## 検品

- 実機（iOS Safari、Android）とスクリーンリーダー（VoiceOver、NVDA）による検品は行っていない。

| 対象 | 検品（`preview/tests/`） |
| --- | --- |
| 計算（Node.js） | `data-analysis-logic.spec.ts`：数値の表記（省略、約、ロケール、通貨、桁、マイナス、NaN）、比較値（実数差、増減率、pt、基準値 0、ともに 0、基準値が負、符号の転換、データなし、取得失敗、比較できない、評価の方向）、目標（100% 超、上限、0、負、欠損）、期間（相対・固定、週の始まり、会計年度、同経過期間、月の全体、月末、うるう年、年をまたぐ、重なり）、半開区間とタイムゾーンと夏時間、集計単位（初期値、利用可否、手動の維持と調整、合計が変わらない）、区間（期間の一部、途中）、条件の継承と衝突、比較期間の系列の期間、「その他」、模擬データの整合性 |
| 資料のページ（5） | `data-analysis.spec.ts`：h1 が 1 つ、操作の名前、横スクロールなし、数値の NaN・Infinity なし、320px と 2560px |
| Metric Overview | 数値の表記とロケール、増減と良否と色、目標、データの状態と高さの維持、Sparkline の欠損と点の不足、定義の Popover、動きを減らす設定、ブランドカラー |
| Dashboard Layout | 独立した領域の失敗と再試行 |
| Analysis Filters | プリセットの即時の適用、不完全・逆順の期間を適用しない、集計単位の維持と調整の知らせ、週の始まり、タイムゾーンと半開区間、全体条件と個別条件と衝突 |
| Period Comparison | 比較期間（月の途中、月末、うるう日、年をまたぐ）、比較値の算出の可否、重ね合わせの元の日付と未来の欠損、凡例と線の種類、実績・途中経過・予測、予測がない場合 |
| Drill-down | 条件の引き継ぎと衝突、比較期間の系列の期間、「その他」の分類 |
| 検証画面（Strategic） | 共通のデータとの一致、比較の対象の明示、全体条件と期間の変更、URL の保持と再読み込み、部分的な失敗とその領域だけの再試行、再取得中の表示、予測なし、表だけの比較、マイナスからプラスへの転換 |
| 検証画面（Analytical） | 指標・一覧・内訳の一致、一覧だけの条件、Cross-filtering（選択元の維持、適用範囲、解除、キーボード）、まとめて適用とキャンセルと Chip、集計単位の調整、Drill-down と復帰（条件、選択、スクロール、フォーカス）、階層と Breadcrumb、比較期間の系列から進む、Sheet の前後の移動と素早い切り替え、明細の権限、権限のない詳細と存在しない詳細、条件の衝突、業務画面への条件の引き継ぎ |
| 検証画面（Operational） | リアルタイムの更新でフォーカスとスクロールを保つ、新しいアラートの保留、異常の文字の表示、対応済みの後のフォーカス、部分的な失敗と再試行、自動の更新の停止 |
| モバイル、WebKit | 1 列への再配置と横スクロールなし、詳細の全画面の Sheet、WebKit での描画と Cross-filtering |
| SSR と Hydration | `ssr-data-analysis.spec.ts`：window と document なしの描画、決定的な出力、Hydration の不一致なし、Hydration の後の操作、`"use client"` の境界 |

`data-analysis-logic.spec.ts`、`data-analysis.spec.ts`、`ssr-data-analysis.spec.ts` は `npm run test:components` と `npm run test:patterns` に含まれる。

### 検証の結果

（統合の候補での結果を、検品の後に記録する。）

### 独立したレビュー

別のエージェント（Opus）が、実装の結論を渡さずに、指示書、差分、資料、テスト、デスクトップとモバイルのスクリーンショットを、8 つの設計原則と 8 つの美的基準、分析として誤った解釈を生じさせないかで確かめた。指摘は高 5 件、中 10 件、低 7 件、検品の弱点 3 件。

| 指摘 | 対処 |
| --- | --- |
| 高：1 日から始まる固定の期間を、長さに関係なく「月」と判定し、9/1〜11/25 の売上を 9 月の目標、3 か月の解約率を月の上限と比べる | 期間が暦の単位と一致する場合だけ単位を持つようにした（`naturalUnit`）。`fullPeriodOf` は単位がない場合に `null` を返し、目標、上限、期間の経過を示さない。検品を追加した |
| 高：終了日が未来の期間で、途中の実績を比較期間の全体と比べ「同じ経過日数」と示す。未来の日を「データなし」とする | 終了日を今日までに切り詰め（`truncated`、`requestedTo`）、そのことを示す。開始日が未来の期間は不正。期間の選択を `max`（今日）で制限した |
| 高：前月・前四半期の比較期間が分析の対象と重なっても不正にならない | すべての比較で重なりを不正（`overlap`）にし、`ComparisonSelect` に `period` を渡すと、その比較を選べなくした |
| 高：データの開始日より前を含む期間で、基準値を 0 円として比べる | 期間の一部でもデータの範囲の外を含む場合は `null` を返す（`sumRange`、`churnMrrIn`）。明細は返さず、画面に範囲の外であることを示す。期間の選択を `min` で制限した |
| 高：上限の目標を「上限 1.5%に対して現在 42.6%」と、割合の割合で示す | 現在値と上限を同じ単位の差で示す（「あと 0.9pt」「0.3pt 超過」）。途中の期間では期間の経過を併記する |
| 中：事業の状況から顧客維持の分析へ移ると、地域の絞り込みが失われる | 全体条件をすべて URL で引き継ぐ |
| 中：業務画面に契約期間の絞り込みを渡していない | 渡すようにした |
| 中：期間の指定で、片方の日付を変えた時点の期間が適用され、手動の集計単位が失われる | 「この期間で集計」で適用する方式に変えた |
| 中：売上の日割りが月の日数で偏り、同経過期間の比較が偏る | 日割りを月額 × 12 ÷ 365 にした。資料に書いた |
| 中：解約率の推移の目盛りの文字が実際の位置と異なる | 目盛りを 0.5% 刻み（大きい場合は 1%）で明示した。検品を追加した |
| 中：途中の区間を、確定した区間と同じ線で描く | 点線の別の系列（「途中の区間」）にし、表にも示す |
| 中：省略前の正確な値を、ホバーの `title` でしか確かめられない | `MetricDefinition` に `exact` を追加し、MRR と売上の定義で正確な値を示す |
| 中：期間を指定する比較の入力がない。顧客維持の分析に前月の比較がない | `ComparisonSelect` に期間の入力と「この期間と比較」を追加した。顧客維持の分析に前月を追加した（重なる期間では選べない） |
| 中：モバイルで、比較の表の増減の列が画面の外にある | 列を「指標・現在・増減・比較期間」の順にした |
| 中：契約企業数の比較の基準の時点を示していない | 「2026/10/25時点 624社」と示す |
| 低：0 でない小さな割合が 0% になる、浮動小数点の誤差、丸めていない値を省略として扱う | 「0.1%未満」と示し、正確な値を有効数字 15 桁にし、丸めの有無を数値で判定する |
| 低：時間別の区間が夏時間の日も 24 区間。週の途中から始まる区間を位置でそろえる | 区間に `future` を追加した。時間別の夏時間と、長さの異なる区間の位置合わせは、未検証の事項に記録した（変更していない） |
| 低：`groupOther` が「その他」を常に合計する | 合計の方法（`combine`）を引数にした |
| 低：同じ画面の中でハッシュだけが変わると、条件が反映されない | URL の条件ごとに画面を作り直す |
| 低：`AnalysisPeriodFilter` が外からの値の変更に追従しない | 値が変わったら、表示と入力中の値を合わせる |
| 低：監視の指標（全体のエラー率、最も遅い応答時間）が異常を示さない。口座振替の集計の時刻がない | 上限を超えたサービスの数と名前にした。口座振替の領域に集計の時刻を示す |
| 低：比較の条件が知らせなく変わる | `role="status"` の文で知らせる |
| 検品の弱点：上の高の不具合でも検品が通る。期間の指定の途中の適用を見ていない。整合性の検品が同じ関数どうしを比べている | 単位、未来、範囲の外、重なりの検品と、画面の目標・上限の表示の検品を追加した。期間の指定の適用の検品を書き直した。生成した記録から一度求めた固定の値（過去 12 か月の解約 104 社、986 社）の検品を追加した |

### 未検証の事項

| 項目 | 状況 |
| --- | --- |
| 実機の iOS Safari、Android | 未検証。Playwright の WebKit と Chromium のモバイルの再現だけ |
| VoiceOver、NVDA | 未検証。比較値の読み上げの文、`role="status"`、`role="alert"`、`aria-busy` を属性の検品だけで確かめている |
| Next.js での導入 | 未検証。`"use client"` の境界は規則で確かめている |
| 実際の API、分析用のデータベース | 模擬のサーバーだけで確かめている |
| Forms & Workflows との接続 | main に統合された後に確かめる |
| 時間別の区間と夏時間 | 時間別の区間は常に 24 区間で、23 時間・25 時間の日を区別していない。今日の未来の時刻の区間も途中の区間として扱う（時刻を扱わないため） |
| 長さの異なる区間の位置合わせ | `alignBuckets` は区間を番号の順にそろえる。週の途中から始まる週別の区間では、日数の異なる区間が同じ位置に並ぶ |
