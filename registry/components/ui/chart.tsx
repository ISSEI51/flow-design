"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"
import type { TooltipValueType } from "recharts"

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

// Flow Design Chart
// shadcn/ui の Chart と同じ名前と API（ChartContainer、ChartConfig、ChartTooltip、ChartTooltipContent、
// ChartLegend、ChartLegendContent、ChartStyle）。グラフの種類は Recharts の部品（LineChart、BarChart など）で組み立てる。
// 種類ごとの Variant は持たない。Flow Design では次を追加・変更している。
// - 背景は透明、補助線は border の横線、軸の文字は 12px（text-caption）
// - Tooltip は Overlay の Popover と同じ面、境界線、影（popover、border、shadow-popover）
// - ChartContainer の aria-label / aria-labelledby で、グラフの目的を名前にする（role="figure"）
// - fallback と minWidth：描画する幅が足りないときの代わりの表示
// - ChartDataTable：グラフと同じ数値の表。Tooltip だけに重要な数値を任せない
// - chartAnimation：動きは 240ms。Recharts の既定（isAnimationActive="auto"）で、動きを減らす設定では止まる
// - chartStyles：折れ線 2px、棒の角丸 4px、予測の破線
// 定義は docs/web/components/chart.md を参照。

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

const INITIAL_DIMENSION = { width: 320, height: 200 } as const

// サーバーでは useLayoutEffect を使わない（効果はブラウザでだけ実行する）
const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
type TooltipNameType = number | string

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
    /** 凡例と Tooltip の印の形。線の種類で系列を区別するときに使う */
    indicator?: "dot" | "line" | "dashed"
  } & ({ color?: string; theme?: never } | { color?: never; theme: Record<keyof typeof THEMES, string> })
>

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }
  return context
}

// 系列の動き。Recharts の各系列（Line、Bar、Area、Pie、Scatter）に展開して使う。
// isAnimationActive は Recharts の既定の "auto" のままにする。OS の動きを減らす設定では動かない。
const chartAnimation = { animationDuration: 240, animationEasing: "ease-out" } as const

// 系列の線と形。Recharts の props に展開して使う。
const chartStyles = {
  /** 折れ線 2px。データ点は通常は表示せず、ホバーとフォーカスで強調する */
  line: { strokeWidth: 2, dot: false, activeDot: { r: 4, strokeWidth: 2 } },
  /** 予測など、実績と区別する線 */
  forecastLine: { strokeWidth: 2, strokeDasharray: "6 4", dot: false, activeDot: { r: 4, strokeWidth: 2 } },
  /** 棒の角丸 4px。値の側だけを丸める */
  barRadius: 4,
  /** 補助線。横線だけ */
  grid: { vertical: false },
  /** 軸。線と目盛りを省き、文字だけにする */
  axis: { tickLine: false, axisLine: false, tickMargin: 8 },
} as const

function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  fallback,
  minWidth = 0,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
  initialDimension?: { width: number; height: number }
  /** 描画する幅が minWidth より狭いときに、グラフの代わりに表示する（要約、表など） */
  fallback?: React.ReactNode
  minWidth?: number
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`
  const ref = React.useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = React.useState(false)
  // 描画する場所の大きさを測れたか。非表示の領域（keepMounted の Tabs、Accordion、display: none）の中では幅と高さが 0 になる。
  // 0 は「まだ測れていない」として扱い、ResponsiveContainer を描かない（Recharts の width(0)/height(0) の警告と、0 の大きさの描画を避ける）。
  // 場所は ChartContainer の大きさ（aspect-video、h-64 など）で確保したままにし、表示されて大きさが 0 でなくなったら描く。
  // サーバーでの描画と Hydration の最初の描画は、どちらも「測れていない」で同じ出力にする。
  const [measured, setMeasured] = React.useState(false)

  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (width: number, height: number) => setMeasured(width > 0 && height > 0)
    const rect = el.getBoundingClientRect()
    update(rect.width, rect.height)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width, entry.contentRect.height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!fallback || !minWidth || !ref.current) return
    const el = ref.current
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < minWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [fallback, minWidth])

  const named = Boolean(props["aria-label"] || props["aria-labelledby"])
  const { "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, "aria-describedby": ariaDescribedby } = props

  // Recharts の accessibilityLayer は、svg に role="application" と tabindex="0" を付けてフォーカスを受け取るが、
  // 名前を付けない。フォーカスが移ったときにグラフの目的が伝わるよう、ChartContainer の名前と説明を svg にも付ける。
  React.useEffect(() => {
    const el = ref.current
    if (!el || !named) return
    const apply = () => {
      el.querySelectorAll("svg.recharts-surface[role=application]").forEach((svg) => {
        const set = (name: string, value?: string) =>
          value ? svg.getAttribute(name) !== value && svg.setAttribute(name, value) : svg.removeAttribute(name)
        set("aria-label", ariaLabel)
        set("aria-labelledby", ariaLabelledby)
        set("aria-describedby", ariaDescribedby)
      })
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(el, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [named, ariaLabel, ariaLabelledby, ariaDescribedby])

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        role={named ? "figure" : undefined}
        data-slot="chart"
        data-chart={chartId}
        data-fallback={(narrow && fallback && true) || undefined}
        className={cn(
          "flex aspect-video justify-center bg-transparent text-caption",
          // Recharts 3.10 は目盛りの文字を .recharts-cartesian-axis-tick-labels の下に描くため、文字の要素を直接指定する。
          "[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-label]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border-strong [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted",
          "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border-strong",
          "[&_.recharts-dot[stroke='#fff']]:stroke-background [&_.recharts-sector[stroke='#fff']]:stroke-background",
          "[&_.recharts-radial-bar-background-sector]:fill-muted",
          "[&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden",
          // Recharts の accessibilityLayer は svg にフォーカスを受け取る。フォーカスの表示は Flow Design の focus-ring にする。
          "[&_.recharts-surface]:outline-hidden [&_.recharts-surface:focus-visible]:focus-ring [&_.recharts-surface:focus-visible]:rounded-xs",
          "data-fallback:aspect-auto",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {narrow && fallback ? (
          fallback
        ) : measured ? (
          <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>{children}</RechartsPrimitive.ResponsiveContainer>
        ) : null}
      </div>
    </ChartContext.Provider>
  )
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, config]) => config.theme ?? config.color)

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ?? itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

function Indicator({ kind, color, className }: { kind: "dot" | "line" | "dashed"; color?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="chart-indicator"
      data-kind={kind}
      className={cn(
        "shrink-0 border-(--color-border) bg-(--color-bg)",
        kind === "dot" && "size-2.5 rounded-[2px]",
        kind === "line" && "h-0.5 w-3 rounded-full",
        kind === "dashed" && "h-0 w-3 border-t-2 border-dashed bg-transparent",
        className
      )}
      style={{ "--color-bg": color, "--color-border": color } as React.CSSProperties}
    />
  )
}

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  valueFormatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: "line" | "dot" | "dashed"
    nameKey?: string
    labelKey?: string
    /** 値の表示。単位を付けるときに使う（例：(v) => `${v}万円`） */
    valueFormatter?: (value: number) => string
  } & Omit<RechartsPrimitive.DefaultTooltipContentProps<TooltipValueType, TooltipNameType>, "accessibilityLayer">) {
  const { config } = useChart()

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value = !labelKey && typeof label === "string" ? (config[label]?.label ?? label) : itemConfig?.label

    if (labelFormatter) {
      return <div className={cn("font-medium", labelClassName)}>{labelFormatter(value, payload)}</div>
    }

    if (!value) {
      return null
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>
  }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey])

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = payload.length === 1 && indicator !== "dot"

  return (
    <div
      data-slot="chart-tooltip"
      className={cn(
        "grid min-w-40 items-start gap-2 rounded-md border border-border bg-popover px-3 py-2 text-caption text-popover-foreground shadow-popover",
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => {
            const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color ?? item.payload?.fill ?? item.color

            return (
              <div key={index} className={cn("flex w-full flex-wrap items-center gap-2 [&>svg]:size-2.5 [&>svg]:text-muted-foreground")}>
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && <Indicator kind={itemConfig?.indicator ?? indicator} color={indicatorColor} />
                    )}
                    <div className={cn("flex flex-1 justify-between gap-4", nestLabel ? "items-end" : "items-center")}>
                      <div className="grid gap-1">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">{itemConfig?.label ?? item.name}</span>
                      </div>
                      {item.value != null && (
                        <span className="font-medium text-foreground tabular-nums">
                          {typeof item.value === "number"
                            ? (valueFormatter?.(item.value) ?? item.value.toLocaleString("ja-JP"))
                            : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> & {
  hideIcon?: boolean
  nameKey?: string
} & RechartsPrimitive.DefaultLegendContentProps) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  // Recharts の Legend は、既定（itemSorter="value"）で名前の順に並べ替える。系列の順を保つため、ChartConfig に書いた順に並べる。
  const order = Object.keys(config)
  const rank = (item: (typeof payload)[number]) => {
    const i = order.indexOf(`${nameKey ? (item.payload as Record<string, unknown> | undefined)?.[nameKey] : item.dataKey}`)
    return i === -1 ? order.length : i
  }
  const items = [...payload].sort((a, b) => rank(a) - rank(b))

  return (
    <ul
      data-slot="chart-legend"
      className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-1", verticalAlign === "top" ? "pb-3" : "pt-3", className)}
    >
      {items
        .filter((item) => item.type !== "none")
        .map((item, index) => {
          const key = `${nameKey ?? item.dataKey ?? "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <li key={index} className="flex items-center gap-2 text-caption text-muted-foreground [&>svg]:size-3 [&>svg]:text-muted-foreground">
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <Indicator kind={itemConfig?.indicator ?? "dot"} color={item.color} />
              )}
              {itemConfig?.label}
            </li>
          )
        })}
    </ul>
  )
}

type ChartDataColumn<T> = {
  key: keyof T & string
  label: React.ReactNode
  /** 数値の列。右寄せと tabular-nums */
  numeric?: boolean
  format?: (value: T[keyof T], row: T) => React.ReactNode
}

// グラフと同じ数値の表。グラフの近くに置き、Tooltip を使えない人も数値を確認できるようにする。
// 値が null や undefined の場合は「—」と「データなし」を示し、0 と区別する。
function ChartDataTable<T extends Record<string, unknown>>({
  data,
  columns,
  caption,
  className,
}: {
  data: readonly T[]
  columns: readonly ChartDataColumn<T>[]
  caption: React.ReactNode
  className?: string
}) {
  return (
    <Table density="compact" className={className} data-slot="chart-data-table">
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key} align={c.numeric ? "right" : "left"}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            {columns.map((c) => {
              const value = row[c.key]
              return (
                <TableCell key={c.key} align={c.numeric ? "right" : "left"}>
                  {value == null ? (
                    <span className="text-muted-foreground">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">データなし</span>
                    </span>
                  ) : c.format ? (
                    c.format(value, row)
                  ) : typeof value === "number" ? (
                    value.toLocaleString("ja-JP")
                  ) : (
                    String(value)
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// 構成比（Donut など）に使えるかを確かめる。使えない場合は理由を返す。
// 負の値、数値でない値、合計が 0 以下の場合は、全体に対する割合を表せない。欠損（null）は 0 として扱わず、理由として返す。
function getCompositionError(values: readonly (number | null | undefined)[]): string | null {
  if (values.length === 0) return "データがありません"
  if (values.some((v) => v === null || v === undefined)) return "値のない項目があります"
  if (values.some((v) => !Number.isFinite(v))) return "数値でない値があります"
  if (values.some((v) => (v as number) < 0)) return "負の値があります"
  if (values.reduce<number>((sum, v) => sum + (v as number), 0) <= 0) return "合計が 0 です"
  return null
}

function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload && typeof payload.payload === "object" && payload.payload !== null ? payload.payload : undefined

  let configLabelKey: string = key

  if (key in payload && typeof payload[key as keyof typeof payload] === "string") {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (payloadPayload && key in payloadPayload && typeof payloadPayload[key as keyof typeof payloadPayload] === "string") {
    configLabelKey = payloadPayload[key as keyof typeof payloadPayload] as string
  }

  return configLabelKey in config ? config[configLabelKey] : config[key]
}

export {
  ChartContainer,
  ChartDataTable,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  chartAnimation,
  chartStyles,
  getCompositionError,
  useChart,
}
export type { ChartDataColumn }
