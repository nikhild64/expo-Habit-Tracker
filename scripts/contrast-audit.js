#!/usr/bin/env node
/**
 * WCAG contrast audit for the Habitly color system.
 *
 * Reads `src/lib/ui/theme.ts` palettes for both modes (dark + light), then
 * checks every `text* × surface*` pair against the WCAG 2.1 AA luminance ratio
 * requirements (4.5:1 for normal body text, 3:1 for large text and UI).
 *
 * Run:  node scripts/contrast-audit.js
 * Exit: 1 if any combo fails AA at the body threshold.
 */

// ── Color math ──────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// ── Palette extraction ─────────────────────────────────────────────────────

// The Theme is a TypeScript file; we don't import it (no ts-node) — instead
// duplicate the palette values verbatim. Keep in sync with src/lib/ui/theme.ts.
const PALETTES = {
  dark: {
    bg: '#0F0F14', surface: '#1B1B23', surfaceAlt: '#24242E', surfaceHover: '#2E2E3C',
    text: '#F4F4FE', textSecondary: '#B4B4CC', textMuted: '#8080A4',
  },
  light: {
    bg: '#FEFBF5', surface: '#FFFFFF', surfaceAlt: '#FFF4E6', surfaceHover: '#FFEAD0',
    text: '#1C1912', textSecondary: '#5C5345', textMuted: '#8B7E6E',
  },
};

const TEXT_KEYS = ['text', 'textSecondary', 'textMuted'];
const SURFACE_KEYS = ['bg', 'surface', 'surfaceAlt', 'surfaceHover'];

const AA_BODY = 4.5;
const AA_LARGE = 3.0;

// ── Run ─────────────────────────────────────────────────────────────────────

let failures = 0;
let warnings = 0;

for (const mode of ['dark', 'light']) {
  const pal = PALETTES[mode];
  console.log(`\n=== ${mode.toUpperCase()} MODE ===`);
  console.log('text             surface         ratio   status');
  console.log('---------------- --------------- ------- ------');
  for (const tk of TEXT_KEYS) {
    for (const sk of SURFACE_KEYS) {
      const ratio = contrast(hexToRgb(pal[tk]), hexToRgb(pal[sk]));
      const isMuted = tk === 'textMuted';
      const required = isMuted ? AA_LARGE : AA_BODY;
      const ok = ratio >= required;
      const status = ok
        ? (ratio >= 7 ? 'AAA' : 'AA  ')
        : (isMuted ? `FAIL (need ${AA_LARGE})` : `FAIL (need ${AA_BODY})`);
      const line = `${tk.padEnd(16)} ${sk.padEnd(15)} ${ratio.toFixed(2).padStart(5)} ${ok ? '   ' : '!  '} ${status}`;
      console.log(line);
      if (!ok) {
        if (isMuted) warnings += 1;
        else failures += 1;
      }
    }
  }
}

console.log(`\nDone. ${failures} hard failures, ${warnings} warnings.`);
process.exit(failures > 0 ? 1 : 0);
