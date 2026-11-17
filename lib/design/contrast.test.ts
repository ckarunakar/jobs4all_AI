import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const start = css.indexOf(":root");
const root = css.slice(start, css.indexOf("}", start));
const token = (name: string): string => {
  const m = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  assert.ok(m, `--${name} must be a 6-digit hex in :root`);
  return m[1];
};

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const luminance = (hex: string): number => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// WCAG 2.x contrast ratio of two hex colors.
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// hex composited over white at alpha, returned as hex.
const over = (hex: string, alpha: number): string =>
  "#" +
  rgb(hex)
    .map((v) => Math.round(v * alpha + 255 * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("");

const TEXT = ["foreground", "muted", "muted-foreground", "accent", "accent-strong", "eyebrow", "button-ink",
  "danger", "excellent-text", "recommended-text", "caution-text", "low-text", "info-text", "primary-soft-foreground"];
const SURFACES = ["background", "surface", "elevated", "wash-1", "wash-2", "wash-3", "panel-1", "panel-2", "primary-soft"];

test("text tokens pass AA on every light surface", () => {
  for (const t of TEXT) for (const s of SURFACES)
    assert.ok(ratio(token(t), token(s)) >= 4.5, `${t} on ${s}`);
});
test("white text passes AA on gradient buttons, danger and success toasts", () => {
  for (const b of ["primary", "primary-end", "danger", "recommended-text"])
    assert.ok(ratio("#ffffff", token(b)) >= 4.5, `white on ${b}`);
});
test("badge text passes AA on its own 12% tint", () => {
  for (const k of ["excellent", "recommended", "caution", "low", "info"])
    assert.ok(ratio(token(`${k}-text`), over(token(k), 0.12)) >= 4.5, k);
  assert.ok(ratio(token("danger"), over(token("danger"), 0.1)) >= 4.5, "danger");
});
test("large text passes 3:1: banner on every stop, headline stops on the wash", () => {
  for (let i = 1; i <= 4; i++) assert.ok(ratio("#ffffff", token(`banner-${i}`)) >= 3, `banner-${i}`);
  for (let h = 1; h <= 4; h++) for (let w = 1; w <= 3; w++)
    assert.ok(ratio(token(`headline-${h}`), token(`wash-${w}`)) >= 3, `headline-${h} on wash-${w}`);
});
