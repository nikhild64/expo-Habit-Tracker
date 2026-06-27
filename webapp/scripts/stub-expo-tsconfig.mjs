#!/usr/bin/env node
/**
 * Creates a stub `expo/tsconfig.base.json` inside the webapp's own
 * `node_modules/` so that the **parent** repo's `tsconfig.json`
 * (which is the Expo mobile app and extends `expo/tsconfig.base`)
 * resolves cleanly when Vercel's build container walks up the
 * directory tree from `webapp/`.
 *
 * Why this exists: Vercel uploads the entire repo even when "Root
 * Directory" is set to a subfolder. Angular's TS compiler then walks
 * up looking for the nearest tsconfig.json and finds the parent's
 * — which references `expo/tsconfig.base`. On Vercel only
 * `webapp/node_modules/` is installed (Expo isn't a webapp dep), so
 * the import fails and TypeScript emits a noisy `[WARNING] Cannot
 * find base config file "expo/tsconfig.base"`. The build still
 * succeeds, but the warning is alarming in CI logs.
 *
 * This stub provides an empty `compilerOptions` so the resolve
 * succeeds and the warning disappears. The Expo project, when built
 * separately at the repo root, continues to use the real
 * `expo/tsconfig.base` from its own `node_modules/`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const targetDir = join(process.cwd(), 'node_modules', 'expo');
const targetFile = join(targetDir, 'tsconfig.base.json');

if (existsSync(targetFile)) {
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });
writeFileSync(
  targetFile,
  JSON.stringify(
    {
      compilerOptions: {
        // Intentionally empty. Acts as a satisfying stub so the
        // parent repo's tsconfig.json (Expo mobile app) resolves
        // when the Vercel build container walks up from webapp/.
        // The real Expo base config is used by the mobile app
        // from its own root-level node_modules/expo install.
      },
    },
    null,
    2,
  ) + '\n',
);

console.log('[stub-expo-tsconfig] created', targetFile);
