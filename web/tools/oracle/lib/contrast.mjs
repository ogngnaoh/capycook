// WCAG contrast math (BC-G-10 / G-11 / G-13) — pure functions, no DOM. They
// run in TWO places: unit-probed in node by the self-test against
// hand-computed pairs (so the math is falsified independently of any DOM
// walk), and serialized into the page via PAGE_SOURCE where computed styles
// and layout live. Keep every function self-contained (each references
// others only via window.__oracleContrast in the page) — see PAGE_SOURCE.

// getComputedStyle only ever yields rgb()/rgba() (plus 'transparent'); parse
// those forms only, loudly returning null on anything else so a silent
// format drift can't fake a pass.
export function parseCssColor(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

export function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relLuminance(rgb) {
  return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}

export function contrastRatio(rgb1, rgb2) {
  const l1 = relLuminance(rgb1);
  const l2 = relLuminance(rgb2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Composite a possibly-translucent fg color over an opaque bg (both [r,g,b,a],
// bg alpha assumed 1). Returns opaque [r,g,b].
export function compositeOver(fg, bg) {
  const a = fg[3] === undefined ? 1 : fg[3];
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
  ];
}

// WCAG "large text": ≥24px, or ≥18.66px at weight ≥700. Threshold picker for
// BC-G-10 (4.5:1 normal, 3:1 large).
export function isLargeText(fontSizePx, fontWeight) {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && Number(fontWeight) >= 700);
}

// Serialized bundle for page.evaluate: installs the same functions on
// window.__oracleContrast, cross-referencing through that object so
// toString() serialization stays valid.
export const PAGE_SOURCE = `
window.__oracleContrast = (() => {
  const parseCssColor = ${parseCssColor.toString()};
  const srgbToLinear = ${srgbToLinear.toString()};
  const relLuminance = ${relLuminance.toString()};
  const contrastRatio = ${contrastRatio.toString()};
  const compositeOver = ${compositeOver.toString()};
  const isLargeText = ${isLargeText.toString()};
  return { parseCssColor, srgbToLinear, relLuminance, contrastRatio, compositeOver, isLargeText };
})();
`;

export const injectContrast = (page) => page.evaluate(PAGE_SOURCE);
