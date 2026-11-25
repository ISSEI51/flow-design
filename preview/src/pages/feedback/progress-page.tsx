import { useEffect, useRef, useState } from "react"
import { CircleAlert, CircleCheck, Pause } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress, ProgressCircle, ProgressLabel, ProgressValue } from "@/components/ui/progress"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const TOTAL = 40

// 実際に処理した件数から進捗率を出す。時間の経過で進捗を作らない。
function useBulkSend() {
  const [done, setDone] = useState(0)
  const [state, setState] = useState<"idle" | "running" | "complete" | "error" | "paused">("idle")
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearInterval(timer.current), [])
  const start = (failAt?: number) => {
    window.clearInterval(timer.current)
    setDone(0)
    setState("running")
    let n = 0
    timer.current = window.setInterval(() => {
      n += 1
      setDone(n)
      if (failAt && n === failAt) {
        window.clearInterval(timer.current)
        setState("error")
      } else if (n === TOTAL) {
        window.clearInterval(timer.current)
        setState("complete")
      }
    }, 60)
  }
  const pause = () => {
    window.clearInterval(timer.current)
    setState("paused")
  }
  return { done, state, start, pause }
}

export function ProgressPage() {
  const job = useBulkSend()
  const value = job.state === "idle" ? 0 : Math.floor((job.done / TOTAL) * 100)
  const status = job.state === "error" ? "error" : job.state === "paused" ? "paused" : "default"
  return (
    <article>
      <PageHeader name="Progress" lead="処理の進み具合を伝える。進捗率は、実際に処理した量から出す。" />

      <Section title="状態" lead="0%、途中、100%（実際に完了した場合だけ）、不明、失敗、中断を区別する。">
        {[
          ["0%", 0],
          ["途中", 45],
          ["完了", 100],
        ].map(([label, v]) => (
          <Row key={label} label={label as string}>
            <Progress data-testid={`progress-${v}`} value={v as number} className="max-w-md">
              <ProgressLabel>{v === 100 ? "送信が完了しました" : "請求書を送信しています"}</ProgressLabel>
              <ProgressValue />
            </Progress>
          </Row>
        ))}
        <Row label="進捗が不明" note="aria-valuenow を出さない">
          <Progress data-testid="progress-indeterminate" value={null} className="max-w-md">
            <ProgressLabel>送信の準備をしています</ProgressLabel>
          </Progress>
        </Row>
        <Row label="失敗" note="色と文字とアイコンで示す">
          <div className="w-full max-w-md">
            <Progress data-testid="progress-error" value={62} status="error">
              <ProgressLabel>請求書の送信を中止しました</ProgressLabel>
              <ProgressValue />
            </Progress>
            <p className="mt-2 flex items-center gap-2 text-ui text-destructive">
              <CircleAlert aria-hidden="true" className="size-4" />
              25 件目でメールサーバーに接続できなくなりました
            </p>
          </div>
        </Row>
        <Row label="中断">
          <div className="w-full max-w-md">
            <Progress data-testid="progress-paused" value={30} status="paused">
              <ProgressLabel>送信を一時停止しています</ProgressLabel>
              <ProgressValue />
            </Progress>
          </div>
        </Row>
      </Section>

      <Section title="実際の動き" lead="40 件の請求書を送信する。件数を併記する。">
        <Row label="一括送信">
          <div className="flex w-full max-w-md flex-col gap-4">
            <Progress data-testid="progress-live" value={value} status={status}>
              <ProgressLabel>
                {job.state === "complete"
                  ? "送信が完了しました"
                  : job.state === "error"
                    ? "送信に失敗しました"
                    : job.state === "paused"
                      ? "送信を中断しました"
                      : "請求書を送信しています"}
              </ProgressLabel>
              <ProgressValue />
            </Progress>
            <p data-testid="progress-count" className="flex items-center gap-2 text-ui text-muted-foreground tabular-nums">
              {job.state === "complete" && <CircleCheck aria-hidden="true" className="size-4 text-success" />}
              {job.state === "paused" && <Pause aria-hidden="true" className="size-4" />}
              {job.done} / {TOTAL} 件
            </p>
            <div className="flex flex-wrap gap-2">
              <Button data-testid="progress-start" size="sm" variant="secondary" onClick={() => job.start()}>
                送信を始める
              </Button>
              <Button data-testid="progress-start-fail" size="sm" variant="secondary" onClick={() => job.start(25)}>
                途中で失敗させる
              </Button>
              <Button
                data-testid="progress-pause"
                size="sm"
                variant="secondary"
                disabled={job.state !== "running"}
                onClick={job.pause}
              >
                中断する
              </Button>
            </div>
          </div>
        </Row>
      </Section>

      <Section title="円形" lead="スペースが限られる場合の補助的な形式。値の扱いは横方向と同じ。">
        <Row label="48 / 64 / 96px">
          <ProgressCircle data-testid="circle-sm" size="sm" value={25} aria-label="送信の進み具合" />
          <ProgressCircle data-testid="circle-default" value={60} aria-label="送信の進み具合" />
          <ProgressCircle data-testid="circle-lg" size="lg" value={100} aria-label="送信の進み具合" />
        </Row>
        <Row label="不明・失敗">
          <ProgressCircle data-testid="circle-indeterminate" value={null} aria-label="送信の準備" />
          <ProgressCircle value={62} status="error" aria-label="送信の進み具合（失敗）" />
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Progress value={99} className="max-w-xs">
              <ProgressLabel>処理しています</ProgressLabel>
              <ProgressValue />
            </Progress>
          }
          badNote="時間の経過で進捗を進め、99% で止まる。実際の処理と関係がない。"
          good={
            <Progress value={null} className="max-w-xs">
              <ProgressLabel>処理しています</ProgressLabel>
            </Progress>
          }
          goodNote="進捗がわからない場合は、不明の表示にする。"
        />
      </Section>
    </article>
  )
}
