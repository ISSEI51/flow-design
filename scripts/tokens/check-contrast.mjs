#!/usr/bin/env node
// Flow Design tokens: WCAG 2.x contrast and reference check for theme.css.
//
// Usage:  node scripts/tokens/check-contrast.mjs [path/to/theme.css]
// Output: one JSON object per line. Exit code 1 if a required pair fails
//         or a var() reference is undefined or circular.
//
// Scope
// - Reads custom properties from top-level :root blocks (blocks inside @media are ignored).
// - Checks every var() reference in those blocks for undefined and circular references.
// - Computes contrast for the pairs listed in `pairs` below.
//
// Constraints
// - Colors must resolve to 6-digit hex (#rrggbb). oklch(), rgb() and named colors
//   are not evaluated, so pairs must not use tokens with those values (e.g. chart-*).
// - "token/NN" is the token at NN% opacity. It is composited over the color
//   underneath: the pair's background for a foreground, the page background
//   (--background) for a background. This matches Tailwind's /NN modifier.
// - "mix(token,black,NN)" is color-mix(in srgb, var(--token) NN%, black).
// - Compositing uses unrounded channel values. Pass/fail uses the unrounded ratio;
//   the ratio is rounded to 2 decimals only in the output.
// - Only the listed pairs are checked. Add a pair when a component uses a new
//   combination of foreground and background.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? resolve(here, "../../registry/foundation/theme.css");
const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const vars = {};
const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
for (const block of top.matchAll(/:root\s*\{([^}]*)\}/g)) {
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[name] = value.trim();
  }
}

function resolveVar(name, seen = []) {
  if (seen.includes(name)) throw new Error(`circular reference: ${[...seen, name].join(" -> ")}`);
  const v = vars[name];
  if (v === undefined) throw new Error(`undefined token: ${name}`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolveVar(ref[1], [...seen, name]) : v;
}

const BLACK = [0, 0, 0];

function hex(value, token) {
  const h = value.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`${token} is not #rrggbb: ${value}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const token = (name) => hex(resolveVar(`--${name}`), `--${name}`);
const blend = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));

function color(spec, under) {
  const mix = spec.match(/^mix\(([\w-]+),black,(\d+)\)$/);
  if (mix) return blend(token(mix[1]), BLACK, Number(mix[2]) / 100);
  const [name, alpha] = spec.split("/");
  return alpha ? blend(token(name), under, Number(alpha) / 100) : token(name);
}

function luminance(c) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum, kind, note]
// text: WCAG 1.4.3 (4.5:1). ui: WCAG 1.4.11 (3:1).
const pairs = [
  ["foreground", "background", 4.5, "text", "body text"],
  ["foreground", "muted", 4.5, "text", "text on muted surface"],
  ["muted-foreground", "background", 4.5, "text", "secondary text"],
  ["muted-foreground", "muted", 4.5, "text", "secondary text on muted (Tabs)"],
  ["card-foreground", "card", 4.5, "text", "card"],
  ["popover-foreground", "popover", 4.5, "text", "menu, popover"],
  ["primary-foreground", "primary", 4.5, "text", "primary button"],
  ["primary-foreground", "primary/90", 4.5, "text", "primary button hover"],
  ["secondary-foreground", "secondary", 4.5, "text", "secondary button"],
  ["accent-foreground", "accent", 4.5, "text", "hovered menu item"],
  ["muted-foreground", "accent", 4.5, "text", "secondary text in hovered item"],
  ["destructive", "background", 4.5, "text", "error text"],
  ["destructive", "muted", 4.5, "text", "error text on muted"],
  ["destructive-foreground", "destructive", 4.5, "text", "destructive button"],
  ["destructive-foreground", "mix(destructive,black,90)", 4.5, "text", "destructive button hover"],
  ["success", "background", 4.5, "text", "status text"],
  ["success", "muted", 4.5, "text", "status text on muted"],
  ["success-foreground", "success", 4.5, "text", "filled status"],
  ["warning", "background", 4.5, "text", "status text"],
  ["warning", "muted", 4.5, "text", "status text on muted"],
  ["warning-foreground", "warning", 4.5, "text", "filled status"],
  ["info", "background", 4.5, "text", "status text"],
  ["info", "muted", 4.5, "text", "status text on muted"],
  ["info-foreground", "info", 4.5, "text", "filled status"],
  ["input", "background", 3, "ui", "control boundary"],
  ["input", "muted", 3, "ui", "control boundary on muted"],
  ["border-strong", "background", 3, "ui", "required boundary"],
  ["border-strong", "muted", 3, "ui", "required boundary on muted"],
  ["ring", "background", 3, "ui", "focus-ring (2px solid)"],
  ["ring", "muted", 3, "ui", "focus-ring on muted"],
  ["ring/50", "background", 3, "ui", "shadcn/ui ring-ring/50"],
  ["ring/50", "muted", 3, "ui", "shadcn/ui ring-ring/50 on muted"],
];

let failed = 0;

for (const name of Object.keys(vars)) {
  for (const [, ref] of vars[name].matchAll(/var\((--[\w-]+)\)/g)) {
    try {
      resolveVar(ref, [name]);
    } catch (e) {
      failed++;
      console.log(JSON.stringify({ check: "reference", token: name, error: e.message }));
    }
  }
}

let page;
try {
  page = token("background");
} catch (e) {
  console.log(JSON.stringify({ check: "summary", error: e.message, failed: failed + 1 }));
  process.exit(1);
}
for (const [fg, bg, min, kind, note] of pairs) {
  let r;
  try {
    const bgc = color(bg, page);
    r = ratio(color(fg, bgc), bgc);
  } catch (e) {
    failed++;
    console.log(JSON.stringify({ check: "contrast", fg, bg, error: e.message, pass: false, note }));
    continue;
  }
  const pass = r >= min;
  if (!pass) failed++;
  console.log(JSON.stringify({ check: "contrast", fg, bg, ratio: Math.round(r * 100) / 100, min, kind, pass, note }));
}

console.log(JSON.stringify({ check: "summary", tokens: Object.keys(vars).length, pairs: pairs.length, failed }));
process.exit(failed ? 1 : 0);
