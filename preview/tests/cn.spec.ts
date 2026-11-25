import { readFileSync } from "node:fs"
import { join } from "node:path"

import { expect, test } from "@playwright/test"
import { extendTailwindMerge } from "tailwind-merge"

import { cn } from "../../registry/lib/utils"
import { flowDesignMergeExtension, withFlowDesign } from "../../registry/lib/tailwind-merge"

// ブラウザを使わない検査。デスクトップの project でだけ実行する。
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "node only"))

test("cn() keeps Flow Design classes next to colors", () => {
  expect(cn("text-ui text-primary-foreground")).toBe("text-ui text-primary-foreground")
  expect(cn("text-ui", "text-body")).toBe("text-body")
  expect(cn("shadow-menu shadow-none")).toBe("shadow-none")
  expect(cn("h-control h-10")).toBe("h-10")
  expect(cn("ease-standard ease-exit")).toBe("ease-exit")
})

test("withFlowDesign() keeps a product's own tailwind-merge settings", () => {
  const twMerge = extendTailwindMerge<"elevation">(
    { extend: { classGroups: { elevation: [{ elevation: ["1", "2"] }] } } },
    withFlowDesign
  )
  expect(twMerge("elevation-1 elevation-2")).toBe("elevation-2")
  expect(twMerge("text-ui text-primary-foreground")).toBe("text-ui text-primary-foreground")
})

test("registered class names match theme.css", ({}, info) => {
  const css = readFileSync(join(info.project.testDir, "../../registry/foundation/theme.css"), "utf8")
  const theme = css.slice(css.indexOf("@theme inline"))
  const names = (ns: string) =>
    [...theme.matchAll(new RegExp(`--${ns}-([a-z0-9-]+?)\\s*:`, "g"))].map((m) => m[1]).filter((n) => !n.includes("--"))
  const ext = flowDesignMergeExtension.extend!.theme!
  expect(ext.text).toEqual(names("text"))
  expect(ext.shadow).toEqual(names("shadow"))
  expect(ext.spacing).toEqual(names("spacing"))
  expect(ext.ease).toEqual(names("ease"))
})
