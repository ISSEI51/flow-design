import { useEffect, useRef } from "react"
import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

// Flow Design Progress
// shadcn/ui（Base UI 版）の Progress と同じ構成（Progress、ProgressTrack、ProgressIndicator、
// ProgressLabel、ProgressValue）。value が null のときは進捗不明（aria-valuenow を出さない）。
// 不明な進捗の動きは、CSS のキーフレームをテーマに追加しないよう、Web Animations API で作る。
// 定義は docs/web/components/progress.md を参照。

type ProgressStatus = "default" | "error" | "paused"

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

// 進捗不明のとき、要素を動かす。動きを減らす設定では動かさない。
function useIndeterminate<T extends Element>(active: boolean, frames: Keyframe[], duration: number) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!active || !el || reduceMotion()) return
    const animation = el.animate(frames, { duration, iterations: Infinity, easing: "cubic-bezier(0.4, 0, 0.2, 1)" })
    return () => animation.cancel()
    // frames は固定の値を渡す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, duration])
  return ref
}

function Progress({
  className,
  children,
  value,
  status = "default",
  ...props
}: ProgressPrimitive.Root.Props & { status?: ProgressStatus }) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      data-status={status}
      className={cn("group/progress flex w-full flex-wrap items-center gap-x-3 gap-y-2", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator indeterminate={value === null} />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      data-slot="progress-track"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-border", className)}
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  indeterminate = false,
  ...props
}: ProgressPrimitive.Indicator.Props & { indeterminate?: boolean }) {
  const ref = useIndeterminate<HTMLDivElement>(
    indeterminate,
    [{ transform: "translateX(-100%)" }, { transform: "translateX(300%)" }],
    1500
  )
  return (
    <ProgressPrimitive.Indicator
      ref={ref}
      data-slot="progress-indicator"
      className={cn(
        "h-full rounded-full bg-primary transition-[width] duration-(--duration-slow) ease-standard motion-reduce:transition-none",
        "group-data-[status=error]/progress:bg-destructive group-data-[status=paused]/progress:bg-muted-foreground",
        // 進捗不明：幅 1/3 の帯。動きを減らす設定では中央に止める。
        "data-indeterminate:w-1/3 motion-reduce:data-indeterminate:ml-[33.333%]",
        className
      )}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return <ProgressPrimitive.Label data-slot="progress-label" className={cn("text-ui font-medium", className)} {...props} />
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      data-slot="progress-value"
      className={cn("ml-auto text-ui text-muted-foreground tabular-nums", className)}
      {...props}
    />
  )
}

const circleSizes = {
  sm: { box: 48, stroke: 4, text: "text-caption" },
  default: { box: 64, stroke: 6, text: "text-ui" },
  lg: { box: 96, stroke: 8, text: "text-heading" },
} as const

// 円形の Progress。スペースが限られる場合の補助的な形式。値の扱いは Progress と同じ。
// 見えるラベルがない場合は aria-label を付ける。
function ProgressCircle({
  className,
  value,
  size = "default",
  status = "default",
  showValue = true,
  ...props
}: ProgressPrimitive.Root.Props & {
  size?: keyof typeof circleSizes
  status?: ProgressStatus
  showValue?: boolean
}) {
  const { box, stroke, text } = circleSizes[size]
  const r = (box - stroke) / 2
  const c = 2 * Math.PI * r
  const max = props.max ?? 100
  const min = props.min ?? 0
  const ratio = value === null ? 0.25 : Math.min(1, Math.max(0, (value - min) / (max - min)))
  const ref = useIndeterminate<SVGSVGElement>(
    value === null,
    [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
    1200
  )
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress-circle"
      data-size={size}
      data-status={status}
      className={cn("group/progress relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: box, height: box }}
      {...props}
    >
      <svg ref={ref} width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true" className="-rotate-90">
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-border" />
        <circle
          data-slot="progress-circle-indicator"
          cx={box / 2}
          cy={box / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className={cn(
            "stroke-primary transition-[stroke-dashoffset] duration-(--duration-slow) ease-standard motion-reduce:transition-none",
            "group-data-[status=error]/progress:stroke-destructive group-data-[status=paused]/progress:stroke-muted-foreground"
          )}
        />
      </svg>
      {showValue && value !== null && (
        <ProgressPrimitive.Value
          aria-hidden="true"
          data-slot="progress-circle-value"
          className={cn("absolute font-medium tabular-nums", text)}
        />
      )}
    </ProgressPrimitive.Root>
  )
}

export { Progress, ProgressCircle, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue }
