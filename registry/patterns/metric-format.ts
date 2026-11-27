// Flow Design Metric Format（Patterns / Data Analysis / Metric Overview）
// 指標の値を、言語、精度、判断の目的に合わせて文字にする。定義は docs/web/patterns/metric-overview.md を参照。
//
// - 計算に使う値（number）と、表示用の文字（FormattedValue）を分ける。丸めた文字から増減率などを計算しない。
// - 大きな値は省略表記（ja-JP の「万」「億」、en-US の「K」「M」など）にできる。省略で値が変わる場合は
//   「約」（approximateLabel）を付け、省略前の正確な値（exactText）を返す。
// - 割合（style: "ratio"）の値は、常に 0〜1 で受け取る（0.032 は 3.2%）。0〜100 の値を渡さない。
// - NaN、Infinity、undefined、null は文字にせず null を返す。表示は呼び出し側で「—」などにする。
// - ロケール、通貨、単位、桁数は製品が指定する。

type MetricFormat = {
  /** number：数値。ratio：割合（値は 0〜1）。currency：通貨（unit を指定しない場合は Intl の通貨記号） */
  style?: "number" | "ratio" | "currency"
  /** 既定は ja-JP */
  locale?: string
  /** 後ろに付ける単位（「件」「社」「円」）。currency で unit を指定すると、通貨記号の代わりに使う */
  unit?: string
  /** ISO 4217 の通貨コード。currency で unit がない場合に使う */
  currency?: string
  /** 小数の桁数の上限。既定は number 0、ratio 1（パーセントの小数）、currency 0 */
  maximumFractionDigits?: number
  minimumFractionDigits?: number
  /**
   * standard：省略しない。compact：常に省略表記。auto（既定）：絶対値が compactFrom 以上のときだけ省略表記。
   * 割合（ratio）は省略しない。
   */
  notation?: "standard" | "compact" | "auto"
  /** auto のときに省略表記にする絶対値。既定は 1,000,000 */
  compactFrom?: number
  /** 省略表記の有効数字。既定は 3（36,800,000 → 3,680万、441,600,000 → 4.42億） */
  significantDigits?: number
  /** 省略で値が変わったときの前置き。既定は ja で「約」、それ以外で「~」 */
  approximateLabel?: string
}

type FormattedValue = {
  /** 画面に表示する文字（「約4.42億円」） */
  text: string
  /** 省略や丸めの前の値（「441,600,000円」）。approximate が false の場合は text と同じ */
  exactText: string
  /** 省略や丸めで、表示した値が実際の値と異なる */
  approximate: boolean
  /**
   * 表示の部品。数値と単位の大きさを変えて描画するときに使う。
   * sign はマイナスの符号（−）。signBeforePrefix が true なら prefix（通貨記号）の前に置く（−$1.2M）
   */
  parts: { approximate: string; sign: string; signBeforePrefix: boolean; prefix: string; number: string; suffix: string }
}

const MINUS = "−" // 表示用のマイナス記号（−）。ハイフン（-）と区別する

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function defaultApproximateLabel(locale: string) {
  return locale.toLowerCase().startsWith("ja") ? "約" : "~"
}

type Parts = { sign: string; signBeforePrefix: boolean; prefix: string; number: string; suffix: string }

// Intl.NumberFormat の部品を、前（通貨記号）、数値（符号、整数、小数、省略の単位）、後ろ（%、単位）に分ける。
function split(nf: Intl.NumberFormat, value: number, compactInNumber: boolean): Parts {
  let prefix = ""
  let number = ""
  let suffix = ""
  let sign = ""
  let signBeforePrefix = false
  let seenNumber = false
  for (const p of nf.formatToParts(value)) {
    switch (p.type) {
      case "minusSign":
        // 符号の位置はロケールに従う（en-US の通貨は −$1.2M、de-DE は −1,2 Mio. €）
        sign = MINUS
        signBeforePrefix = prefix === ""
        break
      case "plusSign":
      case "integer":
      case "group":
      case "decimal":
      case "fraction":
        number += p.value
        seenNumber = true
        break
      case "compact":
        if (compactInNumber) number += p.value
        else suffix += p.value
        break
      case "percentSign":
        suffix += p.value
        break
      case "currency":
        if (seenNumber) suffix += p.value
        else prefix += p.value
        break
      case "literal":
        // 通貨記号と数値の間の空白など。位置を保つ。
        if (seenNumber) suffix += p.value
        else prefix += p.value
        break
      default:
        if (seenNumber) suffix += p.value
        else prefix += p.value
    }
  }
  return { sign, signBeforePrefix, prefix, number, suffix }
}

const joinParts = (p: Parts, unit = "") => `${p.signBeforePrefix ? p.sign : ""}${p.prefix}${p.signBeforePrefix ? "" : p.sign}${p.number}${p.suffix}${unit}`

function assertFormat(format: MetricFormat) {
  const digits = (v: number | undefined, min: number, max: number, name: string) => {
    if (v !== undefined && (!Number.isInteger(v) || v < min || v > max)) throw new RangeError(`formatMetricValue: ${name} は ${min}〜${max} の整数にしてください（${v}）`)
  }
  digits(format.maximumFractionDigits, 0, 20, "maximumFractionDigits")
  digits(format.minimumFractionDigits, 0, 20, "minimumFractionDigits")
  digits(format.significantDigits, 1, 21, "significantDigits")
  if (format.compactFrom !== undefined && !(Number.isFinite(format.compactFrom) && format.compactFrom >= 0)) throw new RangeError(`formatMetricValue: compactFrom は 0 以上の数にしてください（${format.compactFrom}）`)
  if (format.minimumFractionDigits !== undefined && format.maximumFractionDigits !== undefined && format.minimumFractionDigits > format.maximumFractionDigits)
    throw new RangeError("formatMetricValue: minimumFractionDigits が maximumFractionDigits より大きくなっています")
  if (format.style === "currency" && !format.unit && !format.currency) throw new RangeError("formatMetricValue: 通貨（style: \"currency\"）には currency か unit を指定してください")
}

/**
 * 指標の値を文字にする。値が数値でない（NaN、Infinity、null、undefined）場合は null を返す。
 * 例（ja-JP）：36,800,000円 → 3,680万円、441,600,000円 → 約4.42億円、5,120,374件 → 約512万件、0.032（ratio）→ 3.2%
 */
function formatMetricValue(value: number | null | undefined, format: MetricFormat = {}): FormattedValue | null {
  if (!isFiniteNumber(value)) return null
  // 不正な書式の設定は、誤った表示にせず RangeError にする（製品の設定の誤り）
  assertFormat(format)
  if (Object.is(value, -0)) value = 0
  const locale = format.locale ?? "ja-JP"
  const style = format.style ?? "number"
  const useCurrency = style === "currency" && !format.unit && Boolean(format.currency)
  const baseFraction = style === "ratio" ? 1 : 0
  const maximumFractionDigits = format.maximumFractionDigits ?? baseFraction
  const minimumFractionDigits = Math.min(format.minimumFractionDigits ?? 0, maximumFractionDigits)
  const notation = style === "ratio" ? "standard" : (format.notation ?? "auto")
  const compact = notation === "compact" || (notation === "auto" && Math.abs(value) >= (format.compactFrom ?? 1_000_000))

  const common: Intl.NumberFormatOptions = {
    ...(style === "ratio" ? { style: "percent" } : useCurrency ? { style: "currency", currency: format.currency } : {}),
    // "always"：省略表記でも 3 桁ごとに区切る（3,680万）。TypeScript の ES2022 の型は boolean だけを持つ
    useGrouping: "always" as unknown as boolean,
  }
  let exactFormat: Intl.NumberFormat
  try {
    exactFormat = new Intl.NumberFormat(locale, { ...common, maximumFractionDigits, minimumFractionDigits })
  } catch (e) {
    throw new RangeError(`formatMetricValue: 書式の設定が不正です（${(e as Error).message}）`)
  }
  const unit = format.unit ?? ""
  const exactParts = split(exactFormat, value, true)
  const exactText = joinParts(exactParts, unit)
  // 省略前の正確な値。有効数字 15 桁まで（浮動小数点の誤差を示さず、小数も失わない）
  const full = new Intl.NumberFormat(locale, { ...common, maximumSignificantDigits: 15 })
  const fullText = joinParts(split(full, value, true), unit)

  if (!compact) {
    // 丸めによって値が変わる場合は approximate にし、正確な値（fullText）を示せるようにする。
    const fractionDigits = maximumFractionDigits + (style === "ratio" ? 2 : 0)
    const scale = 10 ** fractionDigits
    const rounded = Math.round(value * scale) / scale
    // number 型の精度（約 15〜17 桁）を超える桁数では、丸めの有無を判定できないため approximate にしない
    const approximate = fractionDigits <= 15 && Number.isFinite(rounded) && Math.abs(rounded - value) > Math.abs(value) * 1e-12
    // 0 ではない値が、丸めて 0 になる場合は、実際の 0 と区別する。正の値は「0.1%未満」、負の値は「−0.1〜0%」と示す
    // （「−0.1%未満」は文字どおりには −0.1% より小さい値を意味するため、負の値には使わない）。
    if (value !== 0 && rounded === 0) {
      const minUnit = 1 / scale
      const minParts = split(exactFormat, minUnit, true)
      if (value > 0) {
        const text = `${joinParts(minParts, unit)}未満`
        return { text, exactText: fullText, approximate: true, parts: { approximate: "", ...minParts, suffix: `${minParts.suffix}${unit}未満` } }
      }
      const text = `${MINUS}${minParts.prefix}${minParts.number}〜0${minParts.suffix}${unit}`
      return { text, exactText: fullText, approximate: true, parts: { approximate: "", sign: MINUS, signBeforePrefix: true, prefix: minParts.prefix, number: `${minParts.number}〜0`, suffix: `${minParts.suffix}${unit}` } }
    }
    return {
      text: exactText,
      exactText: approximate ? fullText : exactText,
      approximate,
      parts: { approximate: "", ...exactParts, suffix: `${exactParts.suffix}${unit}` },
    }
  }

  const digits = format.significantDigits ?? 3
  const short = new Intl.NumberFormat(locale, { ...common, notation: "compact", maximumSignificantDigits: digits })
  const precise = new Intl.NumberFormat(locale, { ...common, notation: "compact", maximumSignificantDigits: 15 })
  const shortParts = split(short, value, false)
  const preciseParts = split(precise, value, false)
  const approximate = shortParts.number !== preciseParts.number || shortParts.suffix !== preciseParts.suffix
  const approx = approximate ? (format.approximateLabel ?? defaultApproximateLabel(locale)) : ""
  const suffix = `${shortParts.suffix}${unit}`
  return {
    text: `${approx}${joinParts(shortParts)}${unit}`,
    exactText: approximate ? fullText : exactText,
    approximate,
    parts: { approximate: approx, ...shortParts, suffix },
  }
}

/** 割合（0〜1）を、パーセントの数値（0〜100）に変える。表示と pt の計算だけに使う */
function ratioToPercent(ratio: number) {
  return ratio * 100
}

export { MINUS, formatMetricValue, isFiniteNumber, ratioToPercent }
export type { FormattedValue, MetricFormat }
