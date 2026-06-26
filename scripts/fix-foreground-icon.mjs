/**
 * One-shot fix: makes android-icon-foreground.png square.
 *
 * Pads the shorter dimension with transparent pixels symmetrically so all
 * visible artwork is preserved (no cropping). Android adaptive icons accept
 * any square multiple of 1024 — we keep the native side length, so this only
 * touches the file when the aspect is non-square. Safe to re-run.
 */
import sharp from 'sharp';
import { rename } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const file = path.join(ROOT, 'assets', 'images', 'android-icon-foreground.png');

const meta = await sharp(file).metadata();

if (meta.width === meta.height) {
  console.log(`✓ already square (${meta.width}x${meta.height}), nothing to do`);
  process.exit(0);
}

const side      = Math.max(meta.width, meta.height);
const padTop    = Math.floor((side - meta.height) / 2);
const padBottom = side - meta.height - padTop;
const padLeft   = Math.floor((side - meta.width)  / 2);
const padRight  = side - meta.width  - padLeft;

console.log(`fixing ${meta.width}x${meta.height} → ${side}x${side} (pad t=${padTop} b=${padBottom} l=${padLeft} r=${padRight})`);

const tmp = file + '.tmp';

await sharp(file)
  .extend({
    top: padTop,
    bottom: padBottom,
    left: padLeft,
    right: padRight,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png({ quality: 100, compressionLevel: 9 })
  .toFile(tmp);

await rename(tmp, file);

const after = await sharp(file).metadata();
console.log(`✓ android-icon-foreground.png → ${after.width}x${after.height}`);
process.exit(0);
