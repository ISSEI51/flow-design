import { useEffect, useMemo, useRef, useState } from "react"
import { useTable } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { DataTable, DataTableMessage, dataTableDefaults, dataTableFeatures } from "@/components/ui/data-table"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useBrowseData, useDelayedFlag } from "@/patterns/browse-data"
import { DataRefreshIndicator, DataRegionError, DataValue, LoadingReveal, type Loadable } from "@/patterns/data-states"
import { TableScrollArea } from "@/patterns/table-scroll-area"

import { customers, formatYen, type Customer } from "../../data/data-display/customers"
import { Compare, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { Bullets } from "../app-structure/parts"
import { companyColumns } from "./company-parts"
import { AppLink, DemoControls, DemoFrame, Mock, Radio, Rules } from "./doc-parts"

// ---------------------------------------------------------------- 状態の区別
type Scenario = "normal" | "fast" | "slow" | "empty" | "no-results" | "error" | "forbidden" | "refresh-error"

const scenarios: [Scenario, string][] = [
  ["normal", "標準（600ms）"],
  ["fast", "短い（100ms）"],
  ["slow", "長い（3 秒）"],
  ["empty", "未登録"],
  ["no-results", "検索結果 0件"],
  ["error", "取得失敗"],
  ["forbidden", "権限がない"],
  ["refresh-error", "再取得に失敗"],
]

class ForbiddenError extends Error {}

const columns = companyColumns({ selectable: false })
const PAGE = 6

function StatesDemo() {
  const [scenario, setScenario] = useState<Scenario>("normal")
  const calls = useRef(0)
  const data = useBrowseData({
    query: scenario,
    fetcher: (s, { signal }) => {
      calls.current++
      const latency = s === "fast" ? 100 : s === "slow" ? 3000 : 600
      return new Promise<Customer[]>((resolve, reject) => {
        const t = setTimeout(() => {
          if (s === "error") reject(new Error("サーバーに接続できませんでした"))
          else if (s === "forbidden") reject(new ForbiddenError("この一覧を表示する権限がありません"))
          // 再取得の失敗：最初の取得は成功し、2 回目以降は失敗する。
          else if (s === "refresh-error" && calls.current > 1) reject(new Error("サーバーに接続できませんでした"))
          else resolve(s === "empty" || s === "no-results" ? [] : customers.slice(0, PAGE))
        }, latency)
        signal.addEventListener("abort", () => {
          clearTimeout(t)
          reject(new DOMException("aborted", "AbortError"))
        })
      })
    },
  })
  const rows = useMemo(() => data.data ?? [], [data.data])
  const table = useTable({
    ...dataTableDefaults,
    features: dataTableFeatures,
    columns,
    data: rows,
    getRowId: (r) => r.id,
    state: { columnVisibility: { phone: false, actions: false } },
  })
  const forbidden = data.error instanceof ForbiddenError
  const status = data.status === "idle" ? "loading" : data.status
  return (
    <DemoFrame testId="ds-states">
      <div className="flex flex-col gap-4">
        <DemoControls legend="取得の結果">
          {scenarios.map(([v, l]) => (
            <Radio
              key={v}
              name="ds-scenario"
              checked={scenario === v}
              onChange={() => {
                calls.current = 0
                setScenario(v)
              }}
            >
              {l}
            </Radio>
          ))}
        </DemoControls>
        <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-ui" data-testid="ds-state-name">
            状態：{data.refreshFailed ? "再取得の失敗（前の内容を表示中）" : { idle: "待機", loading: "初回の読み込み", refreshing: "再取得中", ready: rows.length === 0 ? (scenario === "no-results" ? "検索結果 0件" : "未登録") : "取得成功", error: "取得失敗" }[data.status]}
          </p>
          <DataRefreshIndicator active={data.status === "refreshing"} />
          <Button variant="outline" size="sm" className="ms-auto" onClick={data.reload} disabled={data.status === "loading" || data.status === "refreshing"}>
            再取得する
          </Button>
        </div>
        {data.refreshFailed && (
          <DataRegionError
            variant="warning"
            title="最新の内容を取得できませんでした"
            description="前回取得した時点の内容を表示しています。"
            onRetry={data.reload}
            data-testid="ds-refresh-error"
          />
        )}
        <LoadingReveal loading={data.status === "loading"} data-testid="ds-region">
          <TableScrollArea>
            <DataTable
              table={table}
              caption="顧客（状態の例）"
              status={status}
              filtered={scenario === "no-results"}
              loadingRowCount={PAGE}
              noResults={<DataTableMessage title="条件に一致する顧客はいません" description="検索語や条件を変えてください。" />}
              empty={<DataTableMessage title="顧客はまだ登録されていません" description="登録した顧客が、ここに表示されます。" />}
              error={
                forbidden ? (
                  // 権限不足は、再取得では解決しない。再試行を置かず、次にすべきことを示す。
                  <DataTableMessage status="error" title="この一覧を表示する権限がありません" description="管理者に、閲覧の権限を依頼してください。" />
                ) : (
                  <DataTableMessage
                    status="error"
                    title="顧客の一覧を取得できませんでした"
                    description="サーバーに接続できませんでした。"
                    action={
                      <Button variant="outline" size="sm" onClick={data.reload}>
                        再試行
                      </Button>
                    }
                  />
                )
              }
            />
          </TableScrollArea>
        </LoadingReveal>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 部分的な失敗：失敗した領域だけを示し、その領域だけを再取得する
function PartialDemo() {
  const [failSales, setFailSales] = useState(true)
  const contracts = useBrowseData({ query: "contracts", fetcher: () => new Promise<number>((r) => setTimeout(() => r(328), 300)) })
  const sales = useBrowseData({
    query: "sales",
    fetcher: () =>
      new Promise<number>((resolve, reject) =>
        setTimeout(() => (failSales ? reject(new Error("集計のサーバーが応答しませんでした")) : resolve(48200000)), 500)
      ),
  })
  const unpaid = useBrowseData({ query: "unpaid", fetcher: () => new Promise<number>((r) => setTimeout(() => r(0), 400)) })
  const value = <T,>(d: { status: string; isCurrent: boolean; data: T | undefined }): Loadable<T> =>
    d.status === "error" ? { status: "unavailable" } : d.isCurrent ? { status: "ready", value: d.data ?? null } : { status: "loading" }
  return (
    <DemoFrame testId="ds-partial">
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div aria-busy={contracts.status === "loading" || undefined}>
            <dt className="text-ui text-muted-foreground">契約中の顧客</dt>
            <dd className="mt-1 text-metric tabular-nums">
              <DataValue value={value(contracts)} format={(n) => `${n}件`} />
            </dd>
          </div>
          <div aria-busy={sales.status === "loading" || undefined} data-testid="ds-sales">
            <dt className="text-ui text-muted-foreground">今月の売上</dt>
            {/* 取得できない値は、数値と同じ大きさで強調しない */}
            <dd className={sales.status === "error" ? "mt-3 text-heading" : "mt-1 text-metric tabular-nums"}>
              <DataValue value={value(sales)} format={(n) => `${(n / 10000).toLocaleString("ja-JP")}万円`} />
            </dd>
          </div>
          <div aria-busy={unpaid.status === "loading" || undefined}>
            <dt className="text-ui text-muted-foreground">未入金</dt>
            {/* 実際の 0 は 0 と表示する。取得できない値や未登録の値を 0 にしない */}
            <dd className="mt-1 text-metric tabular-nums">
              <DataValue value={value(unpaid)} format={(n) => `${n}円`} />
            </dd>
          </div>
        </dl>
        {sales.status === "error" && (
          <DataRegionError
            title="今月の売上を取得できませんでした"
            description="ほかの指標は表示しています。売上だけを再取得できます。"
            onRetry={() => {
              setFailSales(false)
              sales.reload()
            }}
            data-testid="ds-sales-error"
          />
        )}
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- 欠損値
const missing: [string, Loadable<number>, string][] = [
  ["取得済みの値", { status: "ready", value: 1200 }, "1,200円"],
  ["実際の 0", { status: "ready", value: 0 }, "0円"],
  ["未登録", { status: "ready", value: null }, "—（読み上げ：未登録）"],
  ["取得できない", { status: "unavailable", reason: "権限がありません" }, "取得できません"],
  ["取得中", { status: "loading" }, "Skeleton（読み上げ：読み込み中）"],
]

function MissingDemo() {
  return (
    <Table data-testid="ds-missing">
      <TableCaption className="sr-only">値の状態の表示</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>状態</TableHead>
          <TableHead align="right">表示</TableHead>
          <TableHead>説明</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {missing.map(([k, v, note]) => (
          <TableRow key={k}>
            <TableCell>{k}</TableCell>
            <TableCell align="right">
              <DataValue value={v} format={formatYen} />
            </TableCell>
            <TableCell className="text-muted-foreground">{note}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ---------------------------------------------------------------- 長時間の処理（実際の進捗）
function LongTaskDemo() {
  const [state, setState] = useState<"idle" | "running" | "done" | "cancelled">("idle")
  const [done, setDone] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const total = 580
  const showWaitNote = useDelayedFlag(state === "running", 2000)
  // 画面を離れたら、模擬の処理のタイマーを解除する。
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
  }, [])
  const start = () => {
    setState("running")
    setDone(0)
    let n = 0
    timer.current = setInterval(() => {
      n = Math.min(total, n + 58)
      setDone(n)
      if (n >= total) {
        clearInterval(timer.current!)
        setState("done")
      }
    }, 400)
  }
  const cancel = () => {
    if (timer.current) clearInterval(timer.current)
    setState("cancelled")
  }
  return (
    <DemoFrame testId="ds-long">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={start} disabled={state === "running"}>
            580件の CSV を作成する
          </Button>
          {state === "running" && (
            <Button variant="ghost" size="sm" onClick={cancel}>
              作成を中止
            </Button>
          )}
        </div>
        {state !== "idle" && (
          <Progress value={(done / total) * 100} status={state === "cancelled" ? "paused" : "default"} className="max-w-md">
            <ProgressLabel>CSV の作成</ProgressLabel>
            <ProgressValue>{() => `${done} / ${total}件`}</ProgressValue>
          </Progress>
        )}
        <p className="text-ui text-muted-foreground" role="status">
          {state === "done" ? "CSV を作成しました。" : state === "cancelled" ? `中止しました（${done}件まで作成済み）。` : showWaitNote ? "件数が多いため、1 分ほどかかります。この画面を離れても作成を続けます。" : ""}
        </p>
      </div>
    </DemoFrame>
  )
}

// ---------------------------------------------------------------- アカウントの切り替え
const accounts = [
  { value: "a", label: "株式会社サンプル（本社）" },
  { value: "b", label: "株式会社サンプル（九州支店）" },
]

function AccountDemo() {
  const [account, setAccount] = useState("a")
  const data = useBrowseData({
    query: account,
    scopeKey: account,
    fetcher: (a) => new Promise<Customer[]>((r) => setTimeout(() => r(customers.filter((c) => (a === "a" ? c.region !== "九州・沖縄" : c.region === "九州・沖縄")).slice(0, 4)), 800)),
  })
  return (
    <DemoFrame testId="ds-account">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 text-ui">
          <span id="ds-account-label">アカウント</span>
          <Select items={accounts} value={account} onValueChange={(v) => setAccount(String(v))}>
            <SelectTrigger aria-labelledby="ds-account-label" className="w-72 max-w-full" data-testid="ds-account-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* スコープが変わったら、前のアカウントのデータを表示し続けない（再取得中として残さない） */}
        <LoadingReveal loading={data.status === "loading"}>
          <ul className="flex flex-col" aria-busy={data.status === "loading" || undefined} data-testid="ds-account-list" data-status={data.status}>
            {data.isCurrent
              ? data.data!.map((c) => (
                  <li key={c.id} className="border-b border-border py-2 text-ui last:border-b-0">
                    {c.company}（{c.region}）
                  </li>
                ))
              : Array.from({ length: 4 }, (_, i) => (
                  <li key={i} className="border-b border-border py-3 last:border-b-0">
                    <span data-slot="skeleton" aria-hidden="true" className="block h-4 w-1/2 rounded-sm bg-border motion-safe:animate-pulse" />
                  </li>
                ))}
          </ul>
        </LoadingReveal>
      </div>
    </DemoFrame>
  )
}

export function DataStatesPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Data Browsing"
        name="Data States"
        lead="読み込み、再取得、未登録、検索結果 0件、取得失敗、部分的な失敗を区別して伝える。古いデータを最新の結果と誤認させず、失敗を 0 や空として表示しない。"
      />

      <Section title="状態の区別" lead="200ms 未満の読み込みでは Skeleton を見せない（ちらつきを抑える）。操作の制限は遅らせない。再取得中は前のデータを残し、再取得に失敗した場合も取得成功と区別する。">
        <StatesDemo />
      </Section>

      <Section title="部分的な失敗" lead="失敗した領域に対応する範囲で示し、ほかの利用できる情報を隠さない。失敗した領域だけを再取得できる。">
        <PartialDemo />
      </Section>

      <Section title="欠損値" lead="取得済みの値、実際の 0、未登録、取得できない、取得中を区別する。欠損や取得の失敗を 0 にしない。集計値と Chart も同じ。">
        <MissingDemo />
      </Section>

      <Section title="長時間の処理" lead="実際の進捗を取得できる場合だけ Progress を使う。時間がかかる場合は、状況の説明と中止を示す。">
        <LongTaskDemo />
      </Section>

      <Section title="アカウントの切り替え" lead="アカウント、ワークスペース、権限が変わったら、古いデータを表示し続けない。初回の読み込みとして扱う。">
        <AccountDemo />
      </Section>

      <Section title="判断基準">
        <Rules
          rows={[
            ["初回の読み込み", "表示予定の構造に合わせた Skeleton。数と高さは表示予定の領域から決める（ページサイズが既知なら loadingRowCount に渡す）"],
            ["再取得", "前のデータを残し、更新中を示す。古いデータに依存する一括操作と変更の操作を、すぐに制限する"],
            ["未登録", "Empty。必要な場合だけ登録の操作を置く。Page Header に同じ操作がある場合は重複させない"],
            ["検索結果 0件", "Empty と、条件の変更・解除"],
            ["取得失敗", "失敗した範囲の Error と、再取得。権限不足など、再取得で解決しない場合は再試行を置かない"],
            ["鮮度", "データの鮮度が重要な場合だけ、最終更新の時刻を示す。架空の時刻や進捗率を示さない"],
          ]}
        />
      </Section>

      <Section title="アクセシビリティ">
        <Bullets
          items={[
            "読み込み中の領域に aria-busy を付ける。Skeleton は装飾（aria-hidden）として扱う。",
            "結果の件数は、確定したときだけ読み上げる。再取得中は古い件数を読み上げない（Data Table は再取得の開始時に「更新中」を 1 回読み上げる）。",
            "後から表示する重要なエラーは role=\"alert\"、補足の状態は role=\"status\"。",
            "読み込みが終わったときに、フォーカスを動かさない。",
            "動きを減らす設定では、Skeleton の明滅と Spinner の回転を止める。",
          ]}
        />
        <div className="mt-6">
          <AppLink href="#/browsing-app?page=customers">検証画面で、遅い応答と取得失敗を試す</AppLink>
        </div>
      </Section>

      <Section title="使う・避ける">
        <Compare
          bad={
            <Mock label="取得できなかった売上を 0円と表示した例">
              <p className="text-ui text-muted-foreground">今月の売上</p>
              <p className="text-metric">0円</p>
            </Mock>
          }
          badNote="売上がなかったのか、取得できなかったのかを区別できない。"
          good={
            <Mock label="取得できなかった売上を「取得できません」と示し、領域のエラーを添えた例">
              <p className="text-ui text-muted-foreground">今月の売上</p>
              <p className="mt-2 text-heading text-muted-foreground">取得できません</p>
            </Mock>
          }
          goodNote="取得できない値は、文字で示す。0 は実際の 0 だけに使う。"
        />
        <Compare
          bad={
            <Mock label="どの画面でも 50 行の Skeleton を表示する例">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="h-2 rounded-full bg-border" />
              ))}
              <p className="text-caption text-muted-foreground">…（50 行）</p>
            </Mock>
          }
          badNote="実際の表示と高さが合わず、読み込みの後に領域が大きく縮む。"
          good={
            <Mock label="ページサイズに合わせた数の Skeleton を表示する例">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-2 rounded-full bg-border" />
              ))}
            </Mock>
          }
          goodNote="表示予定の行数（ページサイズ）に合わせ、読み込みの前後で高さを保つ。"
        />
      </Section>
    </article>
  )
}
