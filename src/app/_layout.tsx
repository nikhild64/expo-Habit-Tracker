// Importing setup.ts evaluates it at module load time, registering the
// foreground notification handler before any screen renders.
import { GamificationProvider } from '@/contexts/GamificationContext';
import { HabitsProvider } from '@/contexts/HabitsContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { useInAppUpdate } from '@/hooks/use-in-app-update';
import { loadHabits, saveHabits } from '@/lib/habits/storage';
import { computeStreak, toDateKey } from '@/lib/habits/streak';
import { snoozeHabitReminder } from '@/lib/notifications/schedule';
import {
    registerNotificationCategories,
    requestNotificationPermission,
    setupAndroidChannel,
} from '@/lib/notifications/setup';
import { hasSeenOnboarding } from '@/lib/onboarding';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'react-native';

/**
 * Marks a habit as done by reading and writing storage directly, bypassing
 * React state. Safe to call from a background notification action callback.
 */
async function markHabitDoneFromNotification(habitId: string): Promise<void> {
  const habits = await loadHabits();
  const habit  = habits.find(h => h.id === habitId);
  if (!habit) return;

  const key         = toDateKey(new Date());
  const completions = habit.completions ?? [];

  // Already done today — nothing to do
  if (completions.includes(key)) return;

  const newCompletions             = [...completions, key];
  const { streak, bestStreak }     = computeStreak(newCompletions);
  const lastCompletedISO           = new Date().toISOString();

  const updated = habits.map(h =>
    h.id === habitId
      ? { ...h, completions: newCompletions, streak, bestStreak, lastCompletedISO }
      : h,
  );
  await saveHabits(updated);

  // Sync badge immediately so it decrements without the user opening the app.
  const { isDoneToday } = await import('@/lib/habits/streak');
  const pending = updated.filter(h => (h.status ?? 'active') === 'active' && !isDoneToday(h)).length;
  await Notifications.setBadgeCountAsync(pending).catch(() => null);
}

/**
 * Unified handler for all notification responses — covers taps, "Done" action,
 * and "Snooze 10 min" action. Both local reminders and server push notifications
 * share the same data contract: { screen: '/habit', habitId: '<id>' }.
 */
async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<void> {
  const data    = response.notification.request.content.data as Record<string, unknown>;
  const habitId = typeof data?.habitId === 'string' ? data.habitId : null;
  const actionId = response.actionIdentifier;
  const notifId  = response.notification.request.identifier;

  if (actionId === 'HABIT_DONE' && habitId) {
    await markHabitDoneFromNotification(habitId);
    // Android does not auto-dismiss on action tap — do it explicitly.
    await Notifications.dismissNotificationAsync(notifId).catch(() => null);
    return;
  }

  if (actionId === 'HABIT_SNOOZE') {
    await snoozeHabitReminder(response);
    // Dismiss the original so only the snoozed copy remains pending.
    await Notifications.dismissNotificationAsync(notifId).catch(() => null);
    return;
  }

  // Default tap — navigate into the app
  const screen = typeof data?.screen === 'string' ? data.screen : null;
  if (screen === '/summary') {
    router.push('/summary' as never);
  } else if (screen === '/habit' && habitId) {
    router.push({ pathname: '/habit/[id]', params: { id: habitId } } as never);
  }
}

function AppNavigator() {
  useInAppUpdate();

  useEffect(() => {
    // Show onboarding on first launch before anything else.
    hasSeenOnboarding().then(seen => {
      if (!seen) router.replace('/onboarding');
    });

    // Create Android channel, request permission, then register iOS categories.
    setupAndroidChannel()
      .then(() => requestNotificationPermission())
      .then(() => registerNotificationCategories())
      .catch(console.error);

    // Cold-start: app was killed, user tapped a notification to open it.
    const last = Notifications.getLastNotificationResponse();
    if (last) handleNotificationResponse(last);

    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);

  const { isDark } = useTheme();

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="new"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="summary" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="habit/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="about"      options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="privacy"    options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="templates"  options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <HabitsProvider>
          <GamificationProvider>
            <AppNavigator />
          </GamificationProvider>
        </HabitsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
