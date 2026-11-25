import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PREVIEW_TEST_PORT ?? 5174)

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx vite --config vite.config.ts",
    env: { PREVIEW_PORT: String(port) },
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
})
