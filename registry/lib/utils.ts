import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

import { withFlowDesign } from "./tailwind-merge"

// shadcn/ui の cn() と同じ役割。Flow Design のクラス名を登録した tailwind-merge を使う。
// 既存の lib/utils.ts がある製品は、このファイルで置き換えず、
// その tailwind-merge に withFlowDesign を追加する（docs/web/tokens.md の「cn() の設定」）。
const twMerge = extendTailwindMerge(withFlowDesign)

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
