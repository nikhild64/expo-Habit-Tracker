/**
 * generate-assets.mjs  —  Ring Flame icon (option B)
 *
 * icon.png / favicon.png / android-icon-background.png:
 *   Derived from assets/source-icon.png (the approved AI-generated design)
 *   via a centred-square crop + resize.
 *
 * android-icon-foreground.png / android-icon-monochrome.png / splash-icon.png:
 *   Generated from the real Ionicons flame glyph (extracted from Ionicons.ttf
 *   via opentype.js) — white flame + ring on transparent background.
 *
 * Run:  node scripts/generate-assets.mjs   (or: npm run assets:gen)
 * Deps: sharp, opentype.js  (npm install --save-dev sharp opentype.js)
 */

import sharp from 'sharp';
import opentype from 'opentype.js';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ── Brand tokens ─────────────────────────────────────────────────────────────
const C = {
  bgCenter: '#FFBF50',
  bgEdge:   '#D44000',
  white:    '#FFFFFF',
  golden:   '#FFE082',
};

// ── Extract the real Ionicons flame path from the TTF font ────────────────────
async function loadFlamePath() {
  const ttfPath = path.join(
    ROOT, 'node_modules', '@expo', 'vector-icons', 'build',
    'vendor', 'react-native-vector-icons', 'Fonts', 'Ionicons.ttf',
  );
  const buf  = await readFile(ttfPath);
  const font = opentype.parse(buf.buffer);

  // Glyph code point: 62227 (from @expo/vector-icons glyphmap)
  const glyph = font.charToGlyph(String.fromCodePoint(62227));

  // Render at UPM scale so all coordinates are in [0, 512] space
  const upm  = font.unitsPerEm; // 512
  const path512 = glyph.getPath(0, upm, upm);

  return { pathData: path512.toPathData(2), upm };
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function svgRoot(px, defs, body) {
  return (
    `<svg width="${px}" height="${px}" viewBox="0 0 100 100" ` +
    `xmlns="http://www.w3.org/2000/svg">` +
    (defs ? `<defs>${defs}</defs>` : '') +
    body +
    `</svg>`
  );
}

/**
 * Build a <g> element that:
 *  1. Takes the glyph path (originally in 0–512 coordinate space)
 *  2. Scales + centres it so the flame fills roughly 60×75 of the 100×100 canvas
 *     with the tip near y=7 and the base near y=82.
 *
 * The Ionicons flame glyph bounding box (UPM 512):
 *   x: ~97–420  (width ≈ 323)
 *   y: ~92–555  (height ≈ 463)
 *   visual centre: (~258, ~324)
 *
 * Target in 100×100 canvas:
 *   flame height ≈ 76 (y: 7 → 83)
 *   flame width  ≈ 53 (x: ~23 → ~77)
 *   scale  = 76 / 463 ≈ 0.1642
 *   x-offset = 50 − 258 × 0.1642 ≈ 7.6
 *   y-offset = 7  −  92 × 0.1642 ≈ -8.1
 */
function flameGroup(flamePath, outerFill, innerFill, extraTransform = '') {
  const SCALE = 0.1642;
  const TX    = 7.6;
  const TY    = -8.1;
  const t     = `translate(${TX},${TY}) scale(${SCALE})`;
  const combined = extraTransform ? `${extraTransform}` : t;

  const inner = innerFill
    ? '' // The Ionicons path already contains the inner circle — no separate path needed
    : '';

  // The path data contains TWO sub-paths: outer body + inner teardrop hole.
  // We render them with the golden colour via a clip or second <path> with a
  // different fill; simplest: render the whole path once in white (the inner
  // hole becomes a "filled white hole"), then re-render ONLY the inner sub-path
  // in golden to create the core highlight.
  //
  // Split the two sub-paths: the inner one starts at the second 'M'.
  const mIdx        = flamePath.indexOf('M', 1); // second M = inner path start
  const outerPath   = mIdx > 0 ? flamePath.slice(0, mIdx).trim()  : flamePath;
  const innerPath   = mIdx > 0 ? flamePath.slice(mIdx).trim()     : '';

  const outerEl = `<path d="${outerPath}" fill="${outerFill}" opacity="0.96"/>`;
  const innerEl = innerPath && innerFill
    ? `<path d="${innerPath}" fill="${innerFill}" opacity="0.82"/>`
    : '';

  return `<g transform="${extraTransform || t}">${outerEl}${innerEl}</g>`;
}

// ── Shared SVG def snippets ───────────────────────────────────────────────────

const GRAD_DEF = `
  <radialGradient id="bg" cx="50" cy="34" r="62" gradientUnits="userSpaceOnUse">
    <stop offset="0%"   stop-color="${C.bgCenter}"/>
    <stop offset="100%" stop-color="${C.bgEdge}"/>
  </radialGradient>`;

const SHADOW_DEF = `
  <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#00000044"/>
  </filter>`;

const GLOW_DEF = `
  <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
    <feGaussianBlur stdDeviation="3.5" result="blur"/>
    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
  </filter>`;

const GRAD_RECT = `<rect width="100" height="100" fill="url(#bg)"/>`;

/** Ring (thick white circle stroke, wraps around the lower flame body). */
function ring(stroke = C.white, shadow = false) {
  const f = shadow ? ' filter="url(#sh)"' : '';
  // Centre (50,67), r=20: outer edge ≈ y=43 (top) to y=91 (bottom), x=26–74 sides
  return `<circle cx="50" cy="67" r="20" stroke="${stroke}" stroke-width="8" fill="none"${f}/>`;
}

// ── Asset builders ────────────────────────────────────────────────────────────

function makeIconSvg(px, flamePath) {
  return svgRoot(
    px,
    GRAD_DEF + SHADOW_DEF,
    GRAD_RECT +
    ring(C.white, true) +
    flameGroup(flamePath, C.white, C.golden),
  );
}

function makeForegroundSvg(px, flamePath) {
  // Scale the whole composition to 80% for the Android 72dp safe zone
  return svgRoot(
    px,
    SHADOW_DEF,
    `<g transform="translate(50,50) scale(0.80) translate(-50,-50)">` +
      ring(C.white, true) +
      flameGroup(flamePath, C.white, null) +
    `</g>`,
  );
}

function makeBackgroundSvg(px) {
  return svgRoot(px, GRAD_DEF, GRAD_RECT);
}

function makeMonochromeSvg(px, flamePath) {
  return svgRoot(
    px,
    null,
    `<g transform="translate(50,50) scale(0.80) translate(-50,-50)">` +
      ring(C.white) +
      flameGroup(flamePath, C.white, null) +
    `</g>`,
  );
}

function makeSplashSvg(px, flamePath) {
  return svgRoot(
    px,
    GLOW_DEF,
    `<g filter="url(#glow)">` +
      ring(C.white) +
      flameGroup(flamePath, C.white, '#FFE8A0') +
    `</g>`,
  );
}

function makeFaviconSvg(px, flamePath) {
  return svgRoot(
    px,
    GRAD_DEF,
    GRAD_RECT + ring(C.white) + flameGroup(flamePath, C.white, null),
  );
}

// ── Render pipeline ───────────────────────────────────────────────────────────

async function run() {
  const outDir    = path.join(ROOT, 'assets', 'images');
  await mkdir(outDir, { recursive: true });

  // ── Image-based assets (from approved AI-generated source) ──────────────────
  const srcIcon = path.join(ROOT, 'assets', 'source-icon.png');
  const srcMeta = await sharp(srcIcon).metadata();
  // source is 1024×682 — extract centred square
  const side   = srcMeta.height;                              // 682
  const left   = Math.round((srcMeta.width - side) / 2);     // 171

  const cropBase = () =>
    sharp(srcIcon).extract({ left, top: 0, width: side, height: side });

  await cropBase().resize(1024, 1024, { kernel: 'lanczos3' }).png({ quality: 100 }).toFile(path.join(outDir, 'icon.png'));
  console.log('  ✓  icon.png  (1024×1024, from source-icon.png)');

  await cropBase().resize(64, 64, { kernel: 'lanczos3' }).png({ quality: 100 }).toFile(path.join(outDir, 'favicon.png'));
  console.log('  ✓  favicon.png  (64×64, from source-icon.png)');

  await cropBase().resize(1024, 1024, { kernel: 'lanczos3' }).png({ quality: 100 }).toFile(path.join(outDir, 'android-icon-background.png'));
  console.log('  ✓  android-icon-background.png  (1024×1024, from source-icon.png)');

  // ── SVG-based transparent assets (Ionicons glyph + ring) ───────────────────
  const { pathData, upm } = await loadFlamePath();
  console.log(`\n  Loaded Ionicons flame glyph (UPM ${upm})`);

  const SVG_ASSETS = [
    { file: 'android-icon-foreground.png', svg: makeForegroundSvg(1024, pathData) },
    { file: 'android-icon-monochrome.png', svg: makeMonochromeSvg(1024, pathData) },
  ];

  for (const { file, svg } of SVG_ASSETS) {
    await sharp(Buffer.from(svg)).png({ quality: 100, compressionLevel: 9 }).toFile(path.join(outDir, file));
    console.log(`  ✓  ${file}  (SVG, transparent bg)`);
  }

  // splash-icon.png = exact copy of icon.png (same approved design)
  await sharp(path.join(outDir, 'icon.png')).png({ quality: 100 }).toFile(path.join(outDir, 'splash-icon.png'));
  console.log('  ✓  splash-icon.png  (copy of icon.png)');

  console.log('\nAll assets saved to assets/images/');
}

run().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
