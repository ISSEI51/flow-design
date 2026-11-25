#!/usr/bin/env node
// Flow Design tokens: WCAG 2.x contrast check for registry/foundation/theme.css.
//
// Usage: node scripts/tokens/check-contrast.mjs [path/to/theme.css]
// Output: one JSON object per line. Exit code 1 if any required pair fails.
//
// Only hex values and var() references in the top-level :root blocks are resolved.
// "a/90" means color a at 90% opacity composited over the pair's background.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? resolve(here, "../../registry/foundation/theme.css");
const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// Collect declarations from :root blocks that are not inside @media.
const vars = {};
const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
for (const block of top.matchAll(/:root\s*\{([^}]*)\}/g)) {
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[name] = value.trim();
  }
}

function resolveVar(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`circular reference: ${name}`);
  seen.add(name);
  const v = vars[name];
  if (v === undefined) throw new Error(`undefined token: ${name}`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolveVar(ref[1], seen) : v;
}

function rgb(hex) {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a 6-digit hex color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// token or token/alpha, composited over `under` (rgb)
function color(spec, under) {
  const [name, alpha] = spec.split("/");
  const c = rgb(resolveVar(`--${name}`));
  if (!alpha) return c;
  const t = Number(alpha) / 100;
  return c.map((v, i) => Math.round(v * t + under[i] * (1 - t)));
}

// [foreground, background, minimum, kind]
// text: WCAG 1.4.3 (4.5:1). ui: WCAG 1.4.11 (3:1). info: reported, not required.
const pairs = [
  ["foreground", "background", 4.5, "text"],
  ["foreground", "muted", 4.5, "text"],
  ["muted-foreground", "background", 4.5, "text"],
  ["muted-foreground", "muted", 4.5, "text"],
  ["card-foreground", "card", 4.5, "text"],
  ["popover-foreground", "popover", 4.5, "text"],
  ["primary-foreground", "primary", 4.5, "text"],
  ["primary-foreground", "primary/90", 4.5, "text"],
  ["secondary-foreground", "secondary", 4.5, "text"],
  ["accent-foreground", "accent", 4.5, "text"],
  ["destructive", "background", 4.5, "text"],
  ["destructive-foreground", "destructive", 4.5, "text"],
  ["success", "background", 4.5, "text"],
  ["success-foreground", "success", 4.5, "text"],
  ["warning", "background", 4.5, "text"],
  ["warning-foreground", "warning", 4.5, "text"],
  ["info", "background", 4.5, "text"],
  ["info-foreground", "info", 4.5, "text"],
  ["input", "background", 3, "ui"],
  ["input", "muted", 3, "ui"],
  ["border-strong", "background", 3, "ui"],
  ["ring", "background", 3, "ui"],
  ["ring", "muted", 3, "ui"],
  ["ring/50", "background", 3, "ui"],
  ["destructive", "muted", 4.5, "info"],
  ["destructive-foreground", "destructive/90", 4.5, "info"],
  ["border", "background", 3, "info"],
];

// Every var() reference must resolve (no undefined or circular tokens).
for (const name of Object.keys(vars)) {
  for (const [, ref] of vars[name].matchAll(/var\((--[\w-]+)\)/g)) resolveVar(ref);
}

let failed = 0;
for (const [fg, bg, min, kind] of pairs) {
  const bgc = color(bg, rgb(resolveVar("--background")));
  const fgc = color(fg, bgc);
  const r = Math.round(ratio(fgc, bgc) * 100) / 100;
  const pass = r >= min;
  if (!pass && kind !== "info") failed++;
  console.log(JSON.stringify({ fg, bg, ratio: r, min, kind, pass }));
}
process.exit(failed ? 1 : 0);
