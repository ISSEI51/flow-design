import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const root = fileURLToPath(new URL(".", import.meta.url))

// プレビューは registry/ のコンポーネントを直接読み込む。複製しない。
// "@/..." は shadcn/ui の既定のエイリアスと同じ形で、registry/ を指す。
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../registry", import.meta.url)) },
  },
  server: {
    port: Number(process.env.PREVIEW_PORT ?? 5173),
    strictPort: true,
  },
})
