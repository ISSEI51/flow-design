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

// 要素の位置と大きさが、2 フレーム続けて変わらなくなるまで待ってから返す。
// スクロール（scrollIntoViewIfNeeded の後）や、開閉・配置の動きの途中で座標を測らないために使う。
export async function settledBox(l: Locator) {
  const frame = () => l.page().evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())))
  const same = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5
  let prev = await l.boundingBox()
  let stable = 0
  for (let i = 0; i < 60; i++) {
    await frame()
    const cur = await l.boundingBox()
    if (prev && cur && same(prev, cur)) {
      if (++stable >= 2) return cur
    } else stable = 0
    prev = cur
  }
  throw new Error("element position did not settle")
}

// 要素と子孫の CSS のアニメーションとトランジション（繰り返しが有限のもの）が終わるまで待つ。
export async function animationsDone(l: Locator) {
  await l.evaluate(async (el) => {
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      // 繰り返しが無限のアニメーション（Skeleton の点滅など）は終わらないため、待たない
      const finite = el.getAnimations({ subtree: true }).filter((a) => a.effect?.getTiming().iterations !== Infinity)
      await Promise.all(finite.map((a) => a.finished.catch(() => undefined)))
    }
  })
}

// スクロールの位置が、数フレーム続けて変わらなくなるまで待ち、その位置を返す（タッチのスクロールの慣性が終わるまで待つ）。
export async function settledScrollTop(l: Locator) {
  return l.evaluate(async (el) => {
    let prev = el.scrollTop
    let stable = 0
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      if (el.scrollTop === prev) {
        if (++stable >= 5) return prev
      } else stable = 0
      prev = el.scrollTop
    }
    throw new Error("scroll position did not settle")
  })
}
