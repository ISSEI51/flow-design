#!/usr/bin/env node
// Flow Design tokens: compile theme.css with Tailwind CSS v4 and check the
// computed styles in Chromium, including CSS variable overrides.
//
// Usage:  node scripts/tokens/verify-theme.mjs [path/to/theme.css]
// Output: one JSON object per line. Exit code 1 if a check fails.
//
// The script installs pinned packages into a cache directory outside the
// repository (VERIFY_CACHE, default: <os tmpdir>/flow-design-verify-theme).
// Nothing is added to the repository. Network access is needed on the first run.
//
// Browser: Playwright's Chromium if it is installed, otherwise the installed
// Google Chrome (channel "chrome"). To install Playwright's Chromium:
//   npx playwright-core@1.65.1 install chromium

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VERSIONS = {
  tailwindcss: "4.3.5",
  "@tailwindcss/cli": "4.3.5",
  shadcn: "4.23.0",
  "playwright-core": "1.65.1",
};

const here = dirname(fileURLToPath(import.meta.url));
const themeFile = resolve(process.argv[2] ?? join(here, "../../registry/foundation/theme.css"));
const cache = process.env.VERIFY_CACHE ?? join(tmpdir(), "flow-design-verify-theme");
const stamp = join(cache, "versions.json");

mkdirSync(cache, { recursive: true });
if (!existsSync(stamp) || readFileSync(stamp, "utf8") !== JSON.stringify(VERSIONS)) {
  const specs = Object.entries(VERSIONS).map(([n, v]) => `${n}@${v}`);
  writeFileSync(join(cache, "package.json"), '{"private":true}');
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...specs], {
    cwd: cache,
    stdio: ["ignore", "ignore", "inherit"],
  });
  writeFileSync(stamp, JSON.stringify(VERSIONS));
}

// ---- compile -------------------------------------------------------------
copyFileSync(themeFile, join(cache, "flow-design-theme.css"));
const classes = [
  "bg-background text-foreground bg-primary text-primary-foreground hover:bg-primary/90",
  "bg-muted text-muted-foreground border border-input border-border-strong",
  "bg-destructive text-destructive-foreground bg-success bg-warning bg-info",
  "text-display text-metric text-page-title text-section text-heading text-body text-ui text-caption",
  "rounded-xs rounded-sm rounded-md rounded-lg rounded-xl rounded-2xl rounded-full",
  "shadow-menu shadow-popover shadow-dialog ease-standard ease-enter ease-exit",
  "duration-(--duration-fast) h-control h-table-row size-5 focus-ring",
  "hover:bg-[color-mix(in_srgb,var(--destructive)_90%,black)]",
].join(" ");
const fixture = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="out.css"></head><body>
<div id="r-xs" class="rounded-xs"></div><div id="r-sm" class="rounded-sm"></div>
<div id="r-md" class="rounded-md"></div><div id="r-lg" class="rounded-lg"></div>
<div id="r-xl" class="rounded-xl"></div><div id="r-2xl" class="rounded-2xl"></div>
<div id="r-full" class="rounded-full"></div>
<div id="primary" class="bg-primary text-primary-foreground"></div>
<div id="muted-fg" class="text-muted-foreground"></div>
<div id="destructive" class="bg-destructive"></div>
<button id="destructive-hover" class="bg-destructive hover:bg-[color-mix(in_srgb,var(--destructive)_90%,black)]">b</button>
<div id="input" class="border border-input"></div>
<div id="body" class="text-body"></div><div id="caption" class="text-caption"></div>
<div id="control" class="h-control"></div><div id="row" class="h-table-row"></div>
<button id="focus" class="focus-ring">a</button>
<div id="menu" class="shadow-menu"></div>
<svg id="icon" class="lucide size-5" viewBox="0 0 24 24" stroke-width="2"><path d="M5 12h14"/></svg>
<div hidden class="${classes}"></div>
</body></html>`;
writeFileSync(join(cache, "fixture.html"), fixture);
writeFileSync(
  join(cache, "input.css"),
  '@import "tailwindcss";\n@import "shadcn/tailwind.css";\n@import "./flow-design-theme.css";\n@source "./fixture.html";\n',
);
execFileSync(join(cache, "node_modules/.bin/tailwindcss"), ["-i", "input.css", "-o", "out.css"], {
  cwd: cache,
  stdio: ["ignore", "ignore", "pipe"],
});

let failed = 0;
function report(check, expected, actual) {
  const pass = String(expected) === String(actual);
  if (!pass) failed++;
  console.log(JSON.stringify({ check, expected, actual, pass }));
}

const out = readFileSync(join(cache, "out.css"), "utf8");
for (const cls of classes.split(/\s+/)) {
  const sel = "." + cls.replace(/[:/()[\],%]/g, (c) => "\\" + c);
  report(`utility ${cls}`, true, out.includes(sel + " {") || out.includes(sel + ":"));
}

// ---- browser -------------------------------------------------------------
const { chromium } = await import(pathToFileURL(join(cache, "node_modules/playwright-core/index.mjs")).href);
let browser;
let launcher = "playwright-chromium";
try {
  browser = await chromium.launch();
} catch {
  launcher = "chrome";
  browser = await chromium.launch({ channel: "chrome" });
}
const page = await browser.newPage();
await page.goto(pathToFileURL(join(cache, "fixture.html")).href);

const style = (id, prop) =>
  page.evaluate(([i, p]) => getComputedStyle(document.getElementById(i))[p], [id, prop]);
const setVar = (name, value) =>
  page.evaluate(([n, v]) => document.documentElement.style.setProperty(n, v), [name, value]);
const clearVars = () => page.evaluate(() => document.documentElement.removeAttribute("style"));

// default values
const radius = { xs: "4px", sm: "8px", md: "12px", lg: "14px", xl: "20px", "2xl": "24px" };
for (const [k, v] of Object.entries(radius)) report(`radius ${k}`, v, await style(`r-${k}`, "borderTopLeftRadius"));
report("radius full (larger than 1000px)", true, parseFloat(await style("r-full", "borderTopLeftRadius")) > 1000);
report("color primary", "rgb(38, 38, 38)", await style("primary", "backgroundColor"));
report("color primary-foreground", "rgb(255, 255, 255)", await style("primary", "color"));
report("color muted-foreground", "rgb(110, 110, 110)", await style("muted-fg", "color"));
report("color destructive", "rgb(211, 36, 36)", await style("destructive", "backgroundColor"));
report("color input", "rgb(138, 138, 138)", await style("input", "borderTopColor"));
report("text-body size", "16px", await style("body", "fontSize"));
report("text-body line-height", "27.2px", await style("body", "lineHeight"));
report("text-caption size", "12px", await style("caption", "fontSize"));
report("height control", "48px", await style("control", "height"));
report("height table-row", "48px", await style("row", "height"));
report("focus-ring width", "2px", await style("focus", "outlineWidth"));
report("focus-ring style", "solid", await style("focus", "outlineStyle"));
report("focus-ring color", "rgb(38, 38, 38)", await style("focus", "outlineColor"));
report("focus-ring offset", "2px", await style("focus", "outlineOffset"));
await page.hover("#destructive-hover");
const toRgb = (v) => {
  const m = v.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  return m ? `rgb(${m.slice(1).map((x) => Math.round(Number(x) * 255)).join(", ")})` : v;
};
report("destructive hover (10% darker)", "rgb(190, 32, 32)", toRgb(await style("destructive-hover", "backgroundColor")));
report("shadow menu", true, (await style("menu", "boxShadow")).includes("0px 2px 8px"));
report("icon stroke-width", "1.75", await style("icon", "strokeWidth").then((v) => String(parseFloat(v))));

// overrides
const overrides = [
  ["--fd-radius-md", "10px", "r-md", "borderTopLeftRadius", "10px"],
  ["--fd-radius-xl", "16px", "r-xl", "borderTopLeftRadius", "16px"],
  ["--fd-radius-lg", "12px", "r-lg", "borderTopLeftRadius", "12px"],
  ["--radius", "1rem", "r-lg", "borderTopLeftRadius", "16px"],
  ["--primary", "#1d4ed8", "primary", "backgroundColor", "rgb(29, 78, 216)"],
  ["--fd-neutral-500", "#5a5a5a", "muted-fg", "color", "rgb(90, 90, 90)"],
  ["--control-height", "2.5rem", "control", "height", "40px"],
  ["--table-row-height", "2.5rem", "row", "height", "40px"],
  ["--focus-ring-width", "3px", "focus", "outlineWidth", "3px"],
  ["--icon-stroke-width", "2", "icon", "strokeWidth", "2px"],
];
for (const [name, value, id, prop, expected] of overrides) {
  await setVar(name, value);
  report(`override ${name}: ${value}`, expected, await style(id, prop));
  await clearVars();
}
// overriding one radius must not change the others
await setVar("--fd-radius-md", "10px");
report("override isolation rounded-sm", "8px", await style("r-sm", "borderTopLeftRadius"));
report("override isolation rounded-lg", "14px", await style("r-lg", "borderTopLeftRadius"));
await clearVars();

// reduced motion
const rootVar = (n) => page.evaluate((x) => getComputedStyle(document.documentElement).getPropertyValue(x).trim(), n);
report("motion layout (default)", "320ms", await rootVar("--duration-layout"));
await page.emulateMedia({ reducedMotion: "reduce" });
report("motion layout (reduce)", "0ms", await rootVar("--duration-layout"));
report("motion slow (reduce)", "0ms", await rootVar("--duration-slow"));
report("motion fast (reduce)", "120ms", await rootVar("--duration-fast"));

const version = browser.version();
await browser.close();
console.log(JSON.stringify({ check: "summary", launcher, browser: version, failed }));
process.exit(failed ? 1 : 0);
