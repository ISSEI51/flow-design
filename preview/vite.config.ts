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
  // 依存パッケージの最適化のキャッシュ。検品の開発サーバー（playwright.config.ts の webServer）は PREVIEW_CACHE_DIR で
  // node_modules/.vite-test を使い、同じ worktree の手動の preview:dev（既定の node_modules/.vite）と共有しない。
  cacheDir: process.env.PREVIEW_CACHE_DIR || undefined,
  server: {
    port: Number(process.env.PREVIEW_PORT ?? 5173),
    strictPort: true,
  },
})
