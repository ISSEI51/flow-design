import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// shadcn/ui の cn() と同じ役割。Flow Design のテーマが追加したクラス名を
// tailwind-merge に登録する。登録しないと、たとえば "text-ui text-primary-foreground"
// の text-ui が文字色のクラスとみなされて削除される。
// 値は registry/foundation/theme.css の @theme inline と一致させる。
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "metric", "page-title", "section", "heading", "body", "ui", "caption"],
      shadow: ["menu", "popover", "dialog"],
      spacing: ["control", "table-row"],
      ease: ["standard", "enter", "exit"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
