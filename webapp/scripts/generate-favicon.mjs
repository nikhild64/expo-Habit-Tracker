/**
 * generate-favicon.mjs — generates the favicon family for the Habitly PWA.
 *
 * Mirrors the conventions of generate-icons.mjs (same source, same kernel,
 * same root resolution) but targets the browser-tab / iOS-home-screen
 * surfaces rather than the PWA install icons.
 *
 * Output: webapp/public/
 *   - favicon.ico              (multi-resolution: 16, 32, 48 px PNGs in one ICO)
 *   - favicon-16x16.png        (browser-tab on standard density)
 *   - favicon-32x32.png        (browser-tab on @2x)
 *   - apple-touch-icon.png     (180x180 — iOS home-screen / Safari)
 *   - safari-pinned-tab.svg    (monochrome mask used by macOS pinned tabs)
 *
 * Run: node scripts/generate-favicon.mjs   (or `npm run favicon:gen`)
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.resolve(ROOT, '..', 'assets', 'images', 'icon.png');
const OUT_DIR = path.resolve(ROOT, 'public');

const ICO_SIZES = [16, 32, 48];
const APPLE_TOUCH = 180;
const BRAND = '#FF8B1F';

async function renderPng(size) {
  return sharp(SOURCE)
    .resize(size, size, { kernel: 'lanczos3' })
    .flatten({ background: BRAND })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  // ── PNG favicons (16, 32) ────────────────────────────────────────────────
  for (const size of [16, 32]) {
    const buf = await renderPng(size);
    await writeFile(path.join(OUT_DIR, `favicon-${size}x${size}.png`), buf);
    console.log(`  ✓ favicon-${size}x${size}.png`);
  }

  // ── apple-touch-icon (180x180) ───────────────────────────────────────────
  const appleBuf = await renderPng(APPLE_TOUCH);
  await writeFile(path.join(OUT_DIR, 'apple-touch-icon.png'), appleBuf);
  console.log(`  ✓ apple-touch-icon.png (${APPLE_TOUCH}×${APPLE_TOUCH})`);

  // ── favicon.ico (multi-resolution: 16, 32, 48) ───────────────────────────
  const icoBuffers = await Promise.all(ICO_SIZES.map(renderPng));
  const ico = await pngToIco(icoBuffers);
  await writeFile(path.join(OUT_DIR, 'favicon.ico'), ico);
  console.log(`  ✓ favicon.ico (${ICO_SIZES.join(', ')} px)`);

  // ── safari-pinned-tab.svg (monochrome silhouette) ────────────────────────
  // A simple stylised flame matching the Habitly brand. Safari recolors the
  // mask via the <link rel="mask-icon" color="…"> attribute, so the path
  // ships as black `currentColor` and Safari paints it brand-orange.
  const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <path fill-rule="evenodd" clip-rule="evenodd" d="M8 1.2c.4 0 .7.2.8.5.4 1 .9 1.8 1.6 2.4.8.7 1.6 1.2 2.3 1.8.8.7 1.4 1.6 1.7 2.7.4 1.5.2 3-.7 4.3-1 1.5-2.6 2.4-4.4 2.4h-2.5c-1.5 0-3-.7-4-1.9-1-1.2-1.5-2.7-1.3-4.3.2-1.4.8-2.5 1.7-3.3.5-.5 1-.8 1.5-1.1.4-.2.5-.2.6-.3l.2-.3c.2-.5.2-.9.2-1.2 0-.6.2-1 .5-1.3.3-.3.7-.4 1.1-.4Zm0 8.1c-.7 0-1.3.3-1.7.7-.5.5-.7 1.1-.6 1.8.1.7.5 1.2 1 1.6.4.3.9.4 1.3.4.6 0 1.1-.2 1.6-.6.5-.5.7-1 .7-1.7s-.3-1.3-.8-1.7c-.4-.4-.9-.5-1.5-.5Z"/>
</svg>
`;
  await writeFile(path.join(OUT_DIR, 'safari-pinned-tab.svg'), svg);
  console.log('  ✓ safari-pinned-tab.svg');

  console.log('\nAll favicons written to webapp/public/');
}

run().catch(err => {
  console.error('Favicon generation failed:', err);
  process.exit(1);
});
