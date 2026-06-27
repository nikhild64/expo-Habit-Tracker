/**
 * append-push-worker.mjs — postbuild hook that appends our custom Web Push
 * handler to Angular's generated ngsw-worker.js so the SW handles `push` and
 * `notificationclick` events (Angular's built-in worker doesn't).
 *
 * The handler source lives at `src/service-worker/push-worker.ts` (typed
 * against the service-worker scope). This script:
 *   1. Reads that file.
 *   2. Uses the TypeScript compiler API to transpile it to plain JS so we
 *      keep full type-checking during development without paying a regex
 *      brittleness tax (the previous regex pass was easy to break with
 *      union types, generics, optional chaining cast, etc.).
 *   3. Skips the append entirely if the source still looks like a placeholder
 *      (no `addEventListener('push'…)` registration).
 *   4. Appends the resulting JS to `dist/webapp/browser/ngsw-worker.js`
 *      between `/* habitly-push-worker:start *\/` markers so reruns are
 *      idempotent.
 *
 * Wired into the build pipeline via:
 *
 *   "scripts": {
 *     "build": "ng build && node scripts/append-push-worker.mjs",
 *     ...
 *   }
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SW_PATH_CANDIDATES = [
  path.join(ROOT, 'dist', 'webapp', 'browser', 'ngsw-worker.js'),
  path.join(ROOT, 'dist', 'webapp', 'ngsw-worker.js'),
];

const START_MARKER = '/* habitly-push-worker:start */';
const END_MARKER = '/* habitly-push-worker:end */';

async function findServiceWorker() {
  for (const candidate of SW_PATH_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function transpileToJs(source) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      removeComments: false,
      isolatedModules: true,
    },
    reportDiagnostics: false,
  });
  return result.outputText
    // The TS compiler may emit a leftover `export {}` at the top — strip it.
    .replace(/^\s*export\s*\{\s*\};?\s*$/gm, '')
    // Triple-slash reference directives are TS-only.
    .replace(/^\s*\/\/\/\s*<reference[^>]*>\s*$/gm, '');
}

async function run() {
  const swPath = await findServiceWorker();
  if (!swPath) {
    console.log('[push-worker] No ngsw-worker.js found — skipping append (run `ng build` first).');
    return;
  }

  const sourcePath = path.join(ROOT, 'src', 'service-worker', 'push-worker.ts');
  const source = await readFile(sourcePath, 'utf8');

  const hasRealImplementation = /self\.addEventListener\(\s*['"]push['"]/.test(source);
  if (!hasRealImplementation) {
    console.log('[push-worker] push-worker.ts is still a placeholder — append skipped.');
    return;
  }

  const compiled = transpileToJs(source).trim();

  let existing = await readFile(swPath, 'utf8');

  // Idempotency — strip any previous block before re-appending.
  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1) {
    existing = existing.slice(0, startIdx).trimEnd() + existing.slice(endIdx + END_MARKER.length);
  }

  const banner = `\n${START_MARKER}\n`;
  const footer = `\n${END_MARKER}\n`;
  await writeFile(swPath, existing.trimEnd() + banner + compiled + footer, 'utf8');
  console.log('[push-worker] Appended Web Push handler to', path.relative(ROOT, swPath));
}

run().catch(err => {
  console.error('[push-worker] append failed:', err);
  process.exit(1);
});
