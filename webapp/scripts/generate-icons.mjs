/**
 * generate-icons.mjs — generates the 8 PWA icon sizes + maskable + iOS apple-touch
 * from the existing mobile-app icon at ../assets/images/icon.png.
 *
 * Output: webapp/public/icons/
 *   - icon-72.png, icon-96.png, icon-128.png, icon-144.png, icon-152.png,
 *     icon-192.png, icon-384.png, icon-512.png  (purpose: "any")
 *   - icon-maskable-192.png, icon-maskable-512.png  (purpose: "maskable")
 *     Inset 12% on every side so the icon survives the platform-defined
 *     safe area (see https://web.dev/maskable-icon/).
 *   - apple-touch-icon-167.png  (iPad Pro home-screen)
 *
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.resolve(ROOT, '..', 'assets', 'images', 'icon.png');
const OUT_DIR = path.resolve(ROOT, 'public', 'icons');

const ANY_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];
const APPLE_TOUCH = 167;
const BACKGROUND = '#0F0F14';

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const size of ANY_SIZES) {
    await sharp(SOURCE)
      .resize(size, size, { kernel: 'lanczos3' })
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, `icon-${size}x${size}.png`));
    console.log(`  ✓ icon-${size}x${size}.png`);
  }

  for (const size of MASKABLE_SIZES) {
    const inset = Math.round(size * 0.12);
    const inner = size - inset * 2;
    const innerBuffer = await sharp(SOURCE)
      .resize(inner, inner, { kernel: 'lanczos3' })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: BACKGROUND,
      },
    })
      .composite([{ input: innerBuffer, top: inset, left: inset }])
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, `icon-maskable-${size}.png`));
    console.log(`  ✓ icon-maskable-${size}.png (12% safe area)`);
  }

  await sharp(SOURCE)
    .resize(APPLE_TOUCH, APPLE_TOUCH, { kernel: 'lanczos3' })
    .flatten({ background: BACKGROUND })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, `apple-touch-icon-${APPLE_TOUCH}.png`));
  console.log(`  ✓ apple-touch-icon-${APPLE_TOUCH}.png`);

  console.log('\nAll icons written to webapp/public/icons/');
}

run().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
