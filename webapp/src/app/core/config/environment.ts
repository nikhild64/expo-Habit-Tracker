/**
 * Runtime environment configuration for the Habitly PWA.
 *
 * Single source of truth for backend URLs + device authentication. Kept as
 * a plain `const` (not an Angular DI token) so the SW transpile step in
 * `scripts/append-push-worker.mjs` and the unit tests can reuse the same
 * values without importing the DI graph.
 *
 * If you want per-environment overrides (staging, preview deploys, etc.)
 * the cleanest path is to flip on Angular CLI's `fileReplacements` and
 * point to an `environment.prod.ts` here. For now the live backend URL is
 * the only one we ever target.
 *
 * The DEVICE_KEY is a soft-shared secret on the push backend (single-user
 * personal app). If you fork this and stand up your own backend, regenerate
 * it via `openssl rand -hex 32` and rotate the value in Vercel env vars.
 */
export const ENV = {
  /** Live push backend deployed on Vercel. See push-backend/README.md. */
  backendUrl: 'https://push-backend-xi.vercel.app',

  /**
   * Device auth header value for the push backend. Required by every
   * `/web/*` write endpoint + `/api/snooze`. If the backend is running
   * without `DEVICE_API_KEY` set (local dev fallback) any string works.
   *
   * SECURITY NOTE: The personal-app threat model treats this as a shared
   * client secret — it's exposed in the static bundle by design. Don't
   * deploy this as a multi-tenant SaaS without moving auth to a per-user
   * token issued by a sign-in flow.
   */
  deviceKey: 'habitly-pwa-device-v1',
} as const;
