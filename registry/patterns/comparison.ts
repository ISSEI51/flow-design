import { MINUS, formatMetricValue, isFiniteNumber, type MetricFormat } from "@/patterns/metric-format"

// Flow Design Comparison（Patterns / Data Analysis / Metric Overview・Period Comparison）
// 現在値と基準値（前期間、前年同期、目標など）の比較を計算し、表示用の文字にする。
// Metric Overview と Period Comparison の両方がこのファイルを使い、増減の計算と表示を重複して実装しない。
// 定義は docs/web/patterns/period-comparison.md を参照。
//
// 用語
// - 実数差（difference）：現在値 − 基準値
// - 増減率（rate）：(現在値 − 基準値) ÷ 基準値。基準値が 0 や負の場合は算出しない（null）
// - パーセントポイント差（points）：割合（0〜1）どうしの差を、パーセントの単位で表した値（0.040 → 0.032 は −0.8pt）
// - 評価（evaluation）：業務上の改善・悪化。増減の向きとは別に、指標ごとの評価の方向（direction）で決める
//
// 計算はすべて丸める前の値で行う。表示用に丸めた文字から計算しない。NaN、Infinity は計算の結果に含めない。

/** 比較に使う値の状態。Data States の Loadable と同じ形（ready の null は「値がない」） */
type ComparableValue =
  | { status: "loading" }
  | { status: "unavailable"; reason?: string }
  | { status: "ready"; value: number | null }

/** 評価の方向。increase：増えると改善（売上）。decrease：減ると改善（解約率、エラー率）。neutral：良否を定義しない */
type EvaluationDirection = "increase" | "decrease" | "neutral"

/** 値の種類。ratio は値が 0〜1 の割合で、差をパーセントポイントで示す */
type ValueKind = "amount" | "ratio"

type ComparisonResult =
  | { status: "loading" }
  /** 現在値を取得できない */
  | { status: "current-unavailable" }
  /** 現在値がない（未確定、未登録） */
  | { status: "current-missing" }
  /** 比較のデータが存在しない（期間の前にデータがない、比較なし） */
  | { status: "no-baseline" }
  /** 比較のデータを取得できない */
  | { status: "baseline-unavailable" }
  /** 集計の条件が異なるなど、比較できない */
  | { status: "incomparable"; reason: string }
  | {
      status: "ready"
      current: number
      baseline: number
      difference: number
      /** 増減率。基準値が 0 以下のときは null（rateUnavailable に理由） */
      rate: number | null
      rateUnavailable: "baseline-zero" | "baseline-negative" | null
      /** ratio の場合のパーセントポイント差。amount は null */
      points: number | null
      /** 増減の向き。丸める前の値で判定する */
      change: "increase" | "decrease" | "unchanged"
      /** 符号が変わった（赤字から黒字など）。0 をまたぐ場合だけ */
      signChange: "negative-to-positive" | "positive-to-negative" | null
    }

type Evaluation = "improved" | "worsened" | "neutral" | "unchanged"

/**
 * 現在値と基準値を比べる。
 * - comparable に理由（文字）を渡すと、比較できない（incomparable）として扱う（集計の条件が異なる場合など）
 */
function compareValues({
  current,
  baseline,
  kind = "amount",
  incomparableReason,
}: {
  current: ComparableValue
  /** 基準値。比較しない・比較のデータがない場合は undefined */
  baseline: ComparableValue | undefined
  kind?: ValueKind
  incomparableReason?: string | null
}): ComparisonResult {
  if (current.status === "loading" || baseline?.status === "loading") return { status: "loading" }
  if (current.status === "unavailable") return { status: "current-unavailable" }
  if (!isFiniteNumber(current.value)) return { status: "current-missing" }
  if (incomparableReason) return { status: "incomparable", reason: incomparableReason }
  if (!baseline) return { status: "no-baseline" }
  if (baseline.status === "unavailable") return { status: "baseline-unavailable" }
  if (!isFiniteNumber(baseline.value)) return { status: "no-baseline" }
  const c = current.value
  const b = baseline.value
  const difference = c - b
  const rateUnavailable = b === 0 ? "baseline-zero" : b < 0 ? "baseline-negative" : null
  const rate = rateUnavailable ? null : difference / b
  const change = difference > 0 ? "increase" : difference < 0 ? "decrease" : "unchanged"
  const signChange = b < 0 && c > 0 ? "negative-to-positive" : b > 0 && c < 0 ? "positive-to-negative" : null
  return {
    status: "ready",
    current: c,
    baseline: b,
    difference,
    rate: rate !== null && Number.isFinite(rate) ? rate : null,
    rateUnavailable,
    points: kind === "ratio" ? difference * 100 : null,
    change,
    signChange,
  }
}

/** 増減の向きと評価の方向から、業務上の評価を決める。向きだけで Success・Destructive を決めない */
function evaluateChange(change: "increase" | "decrease" | "unchanged", direction: EvaluationDirection): Evaluation {
  if (change === "unchanged") return "unchanged"
  if (direction === "neutral") return "neutral"
  return (change === "increase") === (direction === "increase") ? "improved" : "worsened"
}

const evaluationLabels: Record<Evaluation, string> = {
  improved: "改善",
  worsened: "悪化",
  neutral: "",
  unchanged: "変化なし",
}

type ComparisonDisplayOptions = {
  /** 値の表示形式（実数差の表示に使う。単位、通貨、ロケール） */
  format?: MetricFormat
  kind?: ValueKind
  /**
   * 主に示す値。auto（既定）：ratio は pt、amount は増減率（算出できない場合は実数差）。
   * difference：実数差。rate：増減率。points：パーセントポイント差
   */
  show?: "auto" | "difference" | "rate" | "points"
  /** 増減率の小数の桁。既定は 1 */
  rateFractionDigits?: number
  /** pt の小数の桁。既定は 1 */
  pointFractionDigits?: number
  direction?: EvaluationDirection
}

type ComparisonDisplay = {
  /** 主に示す文字（「+7.0%」「−0.8pt」「+12社」「変化なし」「比較データなし」） */
  text: string
  /** 補足の文字（基準値が 0 のときの実数差など）。ない場合は null */
  detail: string | null
  /** 増減の向き。矢印の向きに使う。比較できない場合は null */
  change: "increase" | "decrease" | "unchanged" | null
  evaluation: Evaluation | null
  /** 評価の文字（「改善」「悪化」）。中立は "" */
  evaluationLabel: string
  /** 比較の値を示せた（ready）。示せない場合は text が状態の説明になる */
  available: boolean
}

const statusText: Record<Exclude<ComparisonResult["status"], "ready">, string> = {
  loading: "読み込み中",
  "current-unavailable": "取得できません",
  "current-missing": "比較できません",
  "no-baseline": "比較データなし",
  "baseline-unavailable": "比較データを取得できません",
  incomparable: "比較できません",
}

// 符号を付けた数値。丸めた結果が 0 でも実際の差が 0 でない場合は「0.1未満」のように示し、変化がないと誤認させない。
function signed(value: number, digits: number, locale: string, unit: string) {
  const abs = Math.abs(value)
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits, useGrouping: "always" as unknown as boolean })
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "±"
  if (value !== 0 && Number(abs.toFixed(digits)) === 0) {
    const min = nf.format(1 / 10 ** digits)
    return `${sign}${min}${unit}未満`
  }
  return `${sign}${nf.format(abs)}${unit}`
}

/** 実数差を、値の表示形式で符号付きの文字にする（「+28社」「−1,200万円」）。省略表記にも従う */
function formatDifference(difference: number, format: MetricFormat = {}) {
  if (!isFiniteNumber(difference)) return null
  if (difference === 0) {
    const zero = formatMetricValue(0, format)
    return zero ? `±${zero.text}` : null
  }
  const f = formatMetricValue(Math.abs(difference), format)
  if (!f) return null
  const sign = difference > 0 ? "+" : MINUS
  // 「約」は符号の前に置く（約+4.42億円 ではなく 約 +4.42億円 と読まれないよう、符号を数値の直前に置く）
  return `${f.parts.approximate}${sign}${f.parts.prefix}${f.parts.number}${f.parts.suffix}`
}

/** 比較の結果を、表示用の文字にする。Metric の比較値と、Period Comparison の数値の表で同じ表現を使う */
function describeComparison(result: ComparisonResult, options: ComparisonDisplayOptions = {}): ComparisonDisplay {
  if (result.status !== "ready") {
    const text = result.status === "incomparable" ? `比較できません（${result.reason}）` : statusText[result.status]
    return { text, detail: null, change: null, evaluation: null, evaluationLabel: "", available: false }
  }
  const locale = options.format?.locale ?? "ja-JP"
  const kind = options.kind ?? (options.format?.style === "ratio" ? "ratio" : "amount")
  const evaluation = evaluateChange(result.change, options.direction ?? "neutral")
  const base = {
    change: result.change,
    evaluation,
    evaluationLabel: evaluationLabels[evaluation],
    available: true,
  }
  if (result.change === "unchanged") {
    return { ...base, text: "変化なし", detail: null }
  }
  const show = options.show ?? "auto"
  const diffText = () => (kind === "ratio" ? signed(result.points!, options.pointFractionDigits ?? 1, locale, "pt") : formatDifference(result.difference, options.format) ?? "")
  const rateText = () => (result.rate === null ? null : signed(result.rate * 100, options.rateFractionDigits ?? 1, locale, "%"))
  const signNote =
    result.signChange === "negative-to-positive" ? "マイナスからプラスに転換" : result.signChange === "positive-to-negative" ? "プラスからマイナスに転換" : null

  if (show === "points" || (show === "auto" && kind === "ratio")) {
    return { ...base, text: diffText(), detail: null }
  }
  if (show === "difference") return { ...base, text: diffText(), detail: signNote }
  const rate = rateText()
  if (rate === null) {
    // 基準値が 0 や負の場合は、増減率を示さず、実数差と理由を示す。
    const reason = result.rateUnavailable === "baseline-zero" ? "基準が 0 のため増減率は算出できません" : "基準がマイナスのため増減率は示しません"
    return { ...base, text: diffText(), detail: signNote ?? reason }
  }
  return { ...base, text: rate, detail: signNote }
}

// ---------------------------------------------------------------- 目標

type TargetProgress =
  | {
      status: "ready"
      /** achievement：目標に対する達成（売上など）。limit：上限に対する割合（解約率、エラー件数など） */
      kind: "achievement" | "limit"
      /** 現在値 ÷ 目標値。100% を超える値もそのまま持つ */
      ratio: number
      /** Progress の表示に使う 0〜100。表示範囲に収めた値であり、達成率の数値として表示しない */
      barValue: number
      /** achievement：目標に達した。limit：上限の内に収まっている */
      met: boolean
      /** 目標値 − 現在値 */
      remaining: number
    }
  | { status: "invalid"; reason: "value-missing" | "target-missing" | "target-zero" | "target-negative" }

/**
 * 目標に対する現在値の割合。
 * - direction が decrease の指標は、上限の目標として扱う（kind: "limit"）。達成率という表現を使わない
 * - 目標値が 0、負、欠損の場合は、割合を算出しない（不正な達成率を表示しない）
 */
function getTargetProgress({
  value,
  target,
  direction = "increase",
}: {
  value: number | null | undefined
  target: number | null | undefined
  direction?: EvaluationDirection
}): TargetProgress {
  if (!isFiniteNumber(target)) return { status: "invalid", reason: "target-missing" }
  if (!isFiniteNumber(value)) return { status: "invalid", reason: "value-missing" }
  if (target === 0) return { status: "invalid", reason: "target-zero" }
  if (target < 0) return { status: "invalid", reason: "target-negative" }
  const ratio = value / target
  const kind = direction === "decrease" ? "limit" : "achievement"
  return {
    status: "ready",
    kind,
    ratio,
    barValue: Math.min(100, Math.max(0, ratio * 100)),
    met: kind === "limit" ? value <= target : value >= target,
    remaining: target - value,
  }
}

export { compareValues, describeComparison, evaluateChange, evaluationLabels, formatDifference, getTargetProgress }
export type {
  ComparableValue,
  ComparisonDisplay,
  ComparisonDisplayOptions,
  ComparisonResult,
  Evaluation,
  EvaluationDirection,
  TargetProgress,
  ValueKind,
}
