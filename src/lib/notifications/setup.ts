import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { isInQuietHours, loadQuietHours } from '@/lib/habits/quiet-hours';

// ── Exact alarm helpers (Android 12+ / API 31+) ───────────────────────────────

/**
 * Returns whether the device requires the SCHEDULE_EXACT_ALARM permission and,
 * if so, whether it is currently granted.
 *
 * Why this matters:
 * On Android 12+ (API 31+) without this permission the OS downgrades
 * AlarmManager calls to inexact alarms, causing reminders to fire up to
 * 1–2 minutes late. Adding the permission to AndroidManifest auto-grants it
 * at install time on most devices; the user CAN revoke it in
 * Settings → Apps → Special app access → Alarms & reminders.
 *
 * Return values:
 *   'not-applicable' — iOS, or Android < 12 (exact alarms always work)
 *   'granted'        — Android 12+, permission present and active
 *   'revoked'        — Android 12+, user has revoked the permission
 */
export async function getExactAlarmStatus(): Promise<'not-applicable' | 'granted' | 'revoked'> {
  if (Platform.OS !== 'android') return 'not-applicable';
  if ((Platform.Version as number) < 31) return 'not-applicable'; // Android < 12

  try {
    // expo-notifications exposes canScheduleExactAlarmsAsync in SDK 51+
    const can = await (Notifications as unknown as {
      canScheduleExactAlarmsAsync?: () => Promise<boolean>;
    }).canScheduleExactAlarmsAsync?.();

    // If the method is not available in this build, assume granted
    // (the manifest permission will handle it at install time)
    if (can === undefined) return 'granted';
    return can ? 'granted' : 'revoked';
  } catch {
    return 'granted'; // Safe fallback — don't show a false warning
  }
}

/**
 * Deep-links the user to the "Alarms & reminders" special-access screen so
 * they can re-grant SCHEDULE_EXACT_ALARM. Falls back to the general app
 * settings page if the deep-link is unavailable on the device.
 */
export function openExactAlarmSettings(): void {
  if (Platform.OS !== 'android') return;
  Linking.openURL('android.settings.REQUEST_SCHEDULE_EXACT_ALARM').catch(() =>
    Linking.openSettings(),
  );
}

export const HABIT_CHANNEL_ID = 'habit-reminders';

/**
 * Identifier for the notification category that carries Done / Snooze action
 * buttons. Safe to call on Android (no-op) and iOS.
 */
export const HABIT_CATEGORY_ID = 'habit-reminder';

/**
 * Registers the notification category that provides "Done" and "Snooze 10 min"
 * action buttons on iOS lock-screen / notification banner.
 *
 * setNotificationCategoryAsync is iOS-only; it is a no-op on Android but safe
 * to call unconditionally. Must run before any notification with
 * categoryIdentifier arrives.
 */
export async function registerNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(HABIT_CATEGORY_ID, [
    {
      identifier: 'HABIT_DONE',
      buttonTitle: 'Done ✓',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'HABIT_SNOOZE',
      buttonTitle: 'Snooze 10 min',
      // opensAppToForeground: true ensures the JS listener fires on Android.
      // (On Android this is always true anyway, but being explicit avoids the
      // edge case where a background-only action is never delivered to the
      // addNotificationResponseReceivedListener handler.)
      options: { opensAppToForeground: true },
    },
  ]);
}

/**
 * Registers the foreground notification handler at module-load time.
 *
 * This must execute before any notification can arrive, which is why it lives
 * here at module scope rather than inside a component or a function. Importing
 * this module from _layout.tsx guarantees the handler is registered during app
 * initialisation, before any screen renders.
 *
 * Quiet hours are enforced here for ALL notification types — both local
 * reminders and server push notifications. When a notification arrives during
 * the DND window:
 *   • shouldShowBanner = false  → no heads-up banner interrupts the user
 *   • shouldPlaySound  = false  → no sound
 *   • shouldShowList   = true   → notification is still added to the tray
 *                                  so the user can see it later
 */
Notifications.setNotificationHandler({
  handleNotification: async () => {
    const qh = await loadQuietHours();
    const now = new Date();
    const inQuiet = isInQuietHours(now.getHours(), now.getMinutes(), qh);
    return {
      shouldPlaySound: !inQuiet,
      shouldSetBadge: false,
      shouldShowBanner: !inQuiet,
      shouldShowList: true,
    };
  },
});

/**
 * Creates (or idempotently updates) the Android notification channel.
 *
 * WHY THIS MUST HAPPEN BEFORE requestPermissionsAsync:
 * On Android 13+ (API 33) the OS only shows the POST_NOTIFICATIONS permission
 * prompt after at least one notification channel already exists. Calling
 * requestPermissionsAsync before any channel is created causes the prompt to be
 * silently skipped on many devices, making it impossible for the user to ever
 * grant permission. Always call this function first.
 *
 * On iOS and Android < 8 this is a no-op.
 */
export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(HABIT_CHANNEL_ID, {
    name: 'Habit Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * Requests notification permission from the OS.
 * Always creates the Android channel first (see above).
 * Returns the final permission status.
 */
export async function requestNotificationPermission(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  await setupAndroidChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return 'granted';
  if (existing === 'denied') return 'denied';
  const { status } = await Notifications.requestPermissionsAsync();
  return status as 'granted' | 'denied' | 'undetermined';
}

/** Opens the OS app-settings page so the user can manually enable notifications. */
export function openSystemSettings(): void {
  Linking.openSettings();
}
