/**
 * Generates the 4 Android shortcut icons used by `expo-quick-actions`.
 *
 * Each output is a 1024x1024 transparent PNG containing a white monochrome
 * glyph centered in the Android adaptive-icon safe zone (central ~67%).
 * The plugin pairs them with per-action background colors so each shortcut
 * gets a distinct, branded look in the long-press launcher menu.
 *
 * Sources:
 *   add     — plus
 *   today   — checkmark inside a ring
 *   insights — ascending bar chart
 *   journal  — pencil / edit glyph
 *
 * Output:  assets/images/shortcuts/{add,today,insights,journal}.png
 * Run:     node scripts/generate-shortcut-icons.mjs
 *
 * The plugin in app.json (`expo-quick-actions` → `androidIcons`) references
 * these files by key. Safe to re-run — overwrites existing PNGs.
 */
import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'images', 'shortcuts');

const SIZE = 1024;

// All glyphs share this SVG wrapper. Content uses a 100x100 viewBox so the
// safe zone (central ~67%) corresponds roughly to coords 17–83.
function svg(body) {
  return (
    `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">` +
    body +
    `</svg>`
  );
}

// ── Glyph definitions ────────────────────────────────────────────────────────

const GLYPHS = {
  add: svg(
    `<rect x="44" y="20" width="12" height="60" rx="6" fill="white"/>` +
    `<rect x="20" y="44" width="60" height="12" rx="6" fill="white"/>`,
  ),

  today: svg(
    `<circle cx="50" cy="50" r="30" stroke="white" stroke-width="6" fill="none"/>` +
    `<path d="M35 50 L46 61 L65 39" stroke="white" stroke-width="6" fill="none" ` +
    `stroke-linecap="round" stroke-linejoin="round"/>`,
  ),

  insights: svg(
    `<rect x="20" y="56" width="13" height="24" rx="3" fill="white"/>` +
    `<rect x="37" y="42" width="13" height="38" rx="3" fill="white"/>` +
    `<rect x="54" y="48" width="13" height="32" rx="3" fill="white"/>` +
    `<rect x="71" y="28" width="13" height="52" rx="3" fill="white"/>`,
  ),

  journal: svg(
    // Stylized notebook: rounded rectangle + spine accent + 3 inner lines
    `<rect x="26" y="20" width="48" height="60" rx="5" fill="white"/>` +
    `<rect x="26" y="20" width="6" height="60" rx="3" fill="rgba(0,0,0,0.15)"/>` +
    `<rect x="40" y="32" width="26" height="3.5" rx="1.5" fill="rgba(0,0,0,0.35)"/>` +
    `<rect x="40" y="42" width="26" height="3.5" rx="1.5" fill="rgba(0,0,0,0.35)"/>` +
    `<rect x="40" y="52" width="20" height="3.5" rx="1.5" fill="rgba(0,0,0,0.35)"/>` +
    `<rect x="40" y="62" width="14" height="3.5" rx="1.5" fill="rgba(0,0,0,0.35)"/>`,
  ),
};

// ── Render pipeline ──────────────────────────────────────────────────────────

async function run() {
  await mkdir(OUT, { recursive: true });

  for (const [name, body] of Object.entries(GLYPHS)) {
    const file = path.join(OUT, `${name}.png`);
    await sharp(Buffer.from(body))
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(file);
    console.log(`  ✓ ${name}.png  (${SIZE}x${SIZE})`);
  }

  console.log(`\nWrote ${Object.keys(GLYPHS).length} shortcut icons to ${path.relative(ROOT, OUT)}/`);
  process.exit(0);
}

run().catch(err => {
  console.error('Shortcut icon generation failed:', err);
  process.exit(1);
});
