/**
 * Helper to request an immediate widget redraw whenever habit state changes.
 * Wraps `requestWidgetUpdate` from `react-native-android-widget` and is safe to
 * call on iOS / web (becomes a no-op).
 */
import React from 'react';
import { Platform } from 'react-native';

import { loadHabits } from '@/lib/habits/storage';
import { isDoneToday } from '@/lib/habits/streak';

import { HabitlyTodayWidget, snapshotForWidget } from '@/widgets/HabitlyTodayWidget';

let cachedFn: ((opts: unknown) => void) | null = null;

export async function refreshTodayWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (!cachedFn) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('react-native-android-widget');
      cachedFn = mod.requestWidgetUpdate;
    }
    if (!cachedFn) return;
    const habits = await loadHabits();
    const snap = snapshotForWidget(habits, isDoneToday);
    cachedFn({
      widgetName: 'HabitlyTodayWidget',
      renderWidget: () => React.createElement(HabitlyTodayWidget, snap),
    });
  } catch {
    // ignore — widget is optional
  }
}
