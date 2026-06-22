import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Habitly',
  slug: config.slug ?? 'habit-tracker',
  extra: {
    ...config.extra,
    // Set DEVICE_API_KEY as an EAS secret; it is injected here at build time.
    deviceApiKey: process.env.DEVICE_API_KEY ?? '',
  },
});
