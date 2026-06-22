import Constants from 'expo-constants';

/** Vercel-deployed push backend. */
export const BACKEND_URL = 'https://push-backend-xi.vercel.app';

/**
 * Device-level API key — used only for token registration and unregistration.
 * This is intentionally lower-privilege than ADMIN_API_KEY.
 * Set DEVICE_API_KEY as an EAS secret; app.config.ts injects it into
 * expo-constants extra.deviceApiKey at build time.
 */
export const DEVICE_API_KEY: string =
  (Constants.expoConfig?.extra?.deviceApiKey as string) ?? '';
