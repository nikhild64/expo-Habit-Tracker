import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

/**
 * Returns the Expo push token for this device, or null when unavailable.
 *
 * Returns null when:
 * - Running on a simulator / emulator without Google Play (Android)
 * - Notification permission has not been granted yet
 * - No EAS projectId is configured in app.json
 *
 * Push notifications require a development build. They do NOT work in Expo Go
 * on Android from SDK 53 onwards — a dev build via EAS is required.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    if (__DEV__) console.warn('[push] Physical device required for push tokens.');
    return null;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    if (__DEV__) console.warn('[push] Permission not granted — call requestNotificationPermission() first.');
    return null;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  if (!projectId) {
    if (__DEV__) console.warn('[push] No EAS projectId found — add it to app.json under extra.eas.projectId.');
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (e) {
    console.error('[push] getExpoPushTokenAsync failed:', e);
    return null;
  }
}
