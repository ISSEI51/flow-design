import type { ComponentType } from "react"

import { ButtonPage } from "./pages/button-page"

// コンポーネントを追加するときは、ページを作ってここに 1 行足す。
export const catalog: { id: string; name: string; page: ComponentType }[] = [
  { id: "button", name: "Button", page: ButtonPage },
]
