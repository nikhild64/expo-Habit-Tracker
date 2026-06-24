import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Habit } from '@/lib/habits/types';
import { isInQuietHours, loadQuietHours } from '@/lib/habits/quiet-hours';
import { HABIT_CHANNEL_ID, HABIT_CATEGORY_ID } from './setup';

// ── One-off local notification (used by the E2E test screen) ───────────────

export interface ScheduleOptions {
  title: string;
  body: string;
  /** Data payload attached to the notification — used for deep-link handling on tap. */
  data?: Record<string, unknown>;
  /** Seconds from now before the notification fires. Defaults to 5. */
  delaySeconds?: number;
}

/**
 * Schedules a one-off local notification that fires after `delaySeconds`.
 * Returns the notification identifier so it can be cancelled later.
 */
export async function scheduleLocalNotification({
  title,
  body,
  data = {},
  delaySeconds = 5,
}: ScheduleOptions): Promise<string> {
  const id = await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delaySeconds,
      ...(Platform.OS === 'android' ? { channelId: HABIT_CHANNEL_ID } : {}),
    },
  });
  return id;
}

// ── Habit reminder scheduling ───────────────────────────────────────────────

const androidTrigger = Platform.OS === 'android' ? { channelId: HABIT_CHANNEL_ID } : {};

/**
 * Schedules all recurring reminders for a habit.
 *
 * - Daily habits  → one DAILY trigger (repeats every day at hour:minute)
 * - Weekly habits → one WEEKLY trigger per selected weekday
 *
 * Returns the array of notification IDs. Store them on the habit so they can
 * be cancelled precisely without touching other habits' notifications.
 */
export async function scheduleHabitReminders(habit: Habit): Promise<string[]> {
  // Respect permission state — return empty array instead of throwing if denied.
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    if (__DEV__) console.warn('[schedule] Permission not granted; skipping reminders for:', habit.name);
    return [];
  }

  // Quiet hours — skip scheduling if the reminder falls within the DND window.
  const quietHours = await loadQuietHours();
  if (isInQuietHours(habit.frequency.hour, habit.frequency.minute, quietHours)) {
    if (__DEV__) console.warn(
      `[schedule] Reminder at ${habit.frequency.hour}:${habit.frequency.minute} falls within quiet hours; skipping.`,
    );
    return [];
  }

  const { frequency } = habit;
  const content: Notifications.NotificationContentInput = {
    title: habit.name,
    body: 'Time to build your streak. Tap to log it.',
    data: { screen: '/habit', habitId: habit.id },
    categoryIdentifier: HABIT_CATEGORY_ID,
  };

  const { hour, minute } = frequency;

  switch (frequency.kind) {
    case 'daily':
    case 'xperweek': {
      // xperweek: one daily notification — user completes whichever days they choose
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          ...androidTrigger,
        },
      });
      return [id];
    }

    case 'weekly': {
      // One WEEKLY trigger per selected weekday (1=Sun … 7=Sat, Expo convention)
      const ids: string[] = [];
      for (const weekday of frequency.weekdays) {
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour,
            minute,
            ...androidTrigger,
          },
        });
        ids.push(id);
      }
      return ids;
    }

    case 'weekdays': {
      // Mon(2)–Fri(6) in Expo weekday numbering (1=Sun … 7=Sat)
      const WEEKDAY_NUMS = [2, 3, 4, 5, 6];
      const ids: string[] = [];
      for (const weekday of WEEKDAY_NUMS) {
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour,
            minute,
            ...androidTrigger,
          },
        });
        ids.push(id);
      }
      return ids;
    }

    case 'weekends': {
      // Sun(1) and Sat(7) in Expo weekday numbering
      const WEEKEND_NUMS = [1, 7];
      const ids: string[] = [];
      for (const weekday of WEEKEND_NUMS) {
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour,
            minute,
            ...androidTrigger,
          },
        });
        ids.push(id);
      }
      return ids;
    }

    case 'interval': {
      // One-shot TIME_INTERVAL notification; rescheduled after each completion
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: frequency.days * 86_400,
          ...androidTrigger,
        },
      });
      return [id];
    }

    default:
      return [];
  }
}

/**
 * Cancels only the notifications for a specific habit.
 * Never calls cancelAllScheduledNotificationsAsync — that would wipe other habits.
 */
export async function cancelHabitReminders(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => null)),
  );
}

/** Convenience alias kept for backwards compat with the E2E test screen. */
export async function cancelScheduledNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

/**
 * Reschedules a habit notification for 10 minutes from now (snooze).
 *
 * The new notification carries the same title, body, and data payload as the
 * original so deep-linking and action handlers continue to work. Also sets the
 * same categoryIdentifier so iOS action buttons appear on the snoozed banner.
 *
 * Returns the new notification identifier.
 */
export async function snoozeHabitReminder(
  response: Notifications.NotificationResponse,
): Promise<string> {
  const { title, body, data } = response.notification.request.content;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: title ?? 'Habit Reminder',
      body: body ?? 'Time to build your streak.',
      data: (data as Record<string, unknown>) ?? {},
      categoryIdentifier: HABIT_CATEGORY_ID,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 600,
      ...(Platform.OS === 'android' ? { channelId: HABIT_CHANNEL_ID } : {}),
    },
  });
  return id;
}
