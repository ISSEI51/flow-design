import type { Locator, Page } from "@playwright/test"

export type Rgb = [number, number, number]

// "#rrggbb"、"rgb(...)"、"rgba(...)"、"color(srgb r g b)" を 0〜255 の RGB と透明度に変換する。
export function parseColor(value: string): { rgb: Rgb; alpha: number } {
  const v = value.trim()
  let m = v.match(/^#([0-9a-f]{6})$/i)
  if (m) {
    const h = m[1]
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb, alpha: 1 }
  }
  m = v.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/)
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: m[4] === undefined ? 1 : Number(m[4]) }
  m = v.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/)
  if (m)
    return {
      rgb: [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255],
      alpha: m[4] === undefined ? 1 : Number(m[4]),
    }
  throw new Error(`unsupported color: ${value}`)
}

export function sameColor(a: string, b: string) {
  const x = parseColor(a)
  const y = parseColor(b)
  return x.alpha === y.alpha && x.rgb.every((v, i) => Math.abs(v - y.rgb[i]) <= 1)
}

export function composite(top: string, under: Rgb): Rgb {
  const { rgb, alpha } = parseColor(top)
  return rgb.map((v, i) => v * alpha + under[i] * (1 - alpha)) as Rgb
}

function luminance(c: Rgb) {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
}

export function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)

export const css = (locator: Locator, prop: string) =>
  locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

// ボタンの文字色と面の色のコントラスト比。
// 色はブラウザの canvas で実際に塗って読み取る。oklab() や color-mix() の値と、
// 半透明の色の合成も、画面に表示される色として扱える。
export async function buttonContrast(button: Locator) {
  const [fg, bg] = await button.evaluate((el) => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    const paint = (...colors: string[]) => {
      for (const c of colors) {
        ctx.fillStyle = c
        ctx.fillRect(0, 0, 1, 1)
      }
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
    }
    const page_bg = getComputedStyle(document.body).backgroundColor
    const s = getComputedStyle(el)
    const surface = paint(page_bg, s.backgroundColor)
    const text = paint(`rgb(${surface.join(",")})`, s.color)
    return [text, surface]
  })
  return contrast(fg as Rgb, bg as Rgb)
}

// 2 つの CSS の色のコントラスト比。背景はページの背景に、前景は背景に合成する。
export async function colorContrast(page: Page, fg: string, bg: string) {
  const [f, b] = await page.evaluate(
    ([fg, bg]) => {
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      const paint = (...colors: string[]) => {
        for (const c of colors) {
          ctx.fillStyle = c
          ctx.fillRect(0, 0, 1, 1)
        }
        return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
      }
      const pageBg = getComputedStyle(document.body).backgroundColor
      const surface = paint(pageBg, bg)
      return [paint(`rgb(${surface.join(",")})`, fg), surface]
    },
    [fg, bg]
  )
  return contrast(f as Rgb, b as Rgb)
}
