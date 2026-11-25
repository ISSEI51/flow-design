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
//   are not evaluated, so pairs must not use tokens with those values.
// - chart-1..chart-5 are also checked against each other (see `chartSeries` below):
//   CIEDE2000 color difference for normal vision and for simulated protanopia,
//   deuteranopia and tritanopia (Machado et al. 2009, severity 1.0), and the
//   CIELAB lightness difference (grayscale).
// - "token/NN" is the token at NN% opacity. It is composited over the color
//   underneath: the pair's background for a foreground, the page background
//   (--background) for a background. This matches Tailwind's /NN modifier.
// - "mix(token,black,NN)" is color-mix(in srgb, var(--token) NN%, black).
// - "token/NN@surface" composites the background over --surface instead of --background.
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
  const at = spec.match(/^(.+)@([\w-]+)$/);
  if (at) return color(at[1], token(at[2]));
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
  ["primary-foreground", "primary/80", 4.5, "text", "primary button active"],
  ["primary-foreground", "primary/90@muted", 4.5, "text", "primary button hover on muted"],
  ["primary-foreground", "primary/80@muted", 4.5, "text", "primary button active on muted"],
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
  ["sidebar-foreground", "sidebar", 4.5, "text", "sidebar text"],
  ["muted-foreground", "sidebar", 4.5, "text", "sidebar item, group label"],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5, "text", "sidebar current item"],
  ["sidebar-accent-foreground", "sidebar-accent/50@sidebar", 4.5, "text", "sidebar hovered item"],
  ["ring", "sidebar", 3, "ui", "focus-ring on sidebar"],
  ["ring", "sidebar-accent", 3, "ui", "focus-ring on sidebar current item"],
  // Chart series: lines, bars, sectors and markers on the chart surface and in the tooltip (popover).
  ...[1, 2, 3, 4, 5].flatMap((n) => [
    [`chart-${n}`, "background", 3, "ui", "chart series"],
    [`chart-${n}`, "card", 3, "ui", "chart series on card"],
    [`chart-${n}`, "muted", 3, "ui", "chart series on muted"],
    [`chart-${n}`, "popover", 3, "ui", "chart tooltip indicator"],
  ]),
];

// ---- chart series distinctness ----
const lin = (v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const gamma = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function lab(c) {
  const [r, g, b] = c.map(lin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const rad = (d) => (d * Math.PI) / 180;
function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2);
  const h1 = ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360;
  const h2 = ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360;
  let dh = C1 * C2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2, Cbp = (C1 + C2) / 2;
  let hb = (h1 + h2) / 2;
  if (C1 * C2 && Math.abs(h1 - h2) > 180) hb += 180;
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(rad(2 * 30 * Math.exp(-(((hb - 275) / 25) ** 2)))) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const simulate = (c, m) => {
  const l = c.map(lin);
  return m.map((row) => gamma(Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2]))));
};
// chart-1..chart-3 are the colors used together most often (up to 3 series):
// each pair must differ by dE2000 >= 20 for every vision type and by L* >= 8 in grayscale.
// Every other pair must be separable by color (dE2000 >= 15 for every vision type) or by lightness (L* >= 10).
const chartSeries = { primary: 3, minPrimaryDeltaE: 20, minPrimaryLightness: 8, minDeltaE: 15, minLightness: 10 };

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

let seriesPairs = 0;
for (let i = 1; i <= 5; i++) {
  for (let j = i + 1; j <= 5; j++) {
    seriesPairs++;
    let a, b;
    try {
      a = token(`chart-${i}`);
      b = token(`chart-${j}`);
    } catch (e) {
      failed++;
      console.log(JSON.stringify({ check: "chart-series", pair: `chart-${i}/chart-${j}`, error: e.message, pass: false }));
      continue;
    }
    const deltaE = { normal: deltaE2000(lab(a), lab(b)) };
    for (const [k, m] of Object.entries(CVD)) deltaE[k] = deltaE2000(lab(simulate(a, m)), lab(simulate(b, m)));
    const minDeltaE = Math.min(...Object.values(deltaE));
    const lightness = Math.abs(lab(a)[0] - lab(b)[0]);
    const primary = j <= chartSeries.primary;
    const pass = primary
      ? minDeltaE >= chartSeries.minPrimaryDeltaE && lightness >= chartSeries.minPrimaryLightness
      : minDeltaE >= chartSeries.minDeltaE || lightness >= chartSeries.minLightness;
    if (!pass) failed++;
    const round = (v) => Math.round(v * 10) / 10;
    console.log(
      JSON.stringify({
        check: "chart-series",
        pair: `chart-${i}/chart-${j}`,
        deltaE: Object.fromEntries(Object.entries(deltaE).map(([k, v]) => [k, round(v)])),
        lightness: round(lightness),
        rule: primary ? "primary (1-3)" : "other",
        pass,
      })
    );
  }
}

console.log(JSON.stringify({ check: "summary", tokens: Object.keys(vars).length, pairs: pairs.length, chartSeriesPairs: seriesPairs, failed }));
process.exit(failed ? 1 : 0);
