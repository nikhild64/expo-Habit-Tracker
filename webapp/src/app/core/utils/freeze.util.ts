/**
 * Freeze auto-consumption — extracted as a pure helper so it's unit-testable
 * without spinning up the full HabitsService.
 *
 * Source: src/contexts/HabitsContext.tsx::applyStreakCorrection (loadFresh path).
 *
 * Rules ported verbatim:
 *  - Only applies to non-flex frequencies (skips xperweek + interval).
 *  - Only when yesterday was a scheduled day.
 *  - Only when yesterday was NOT in `skipDays`.
 *  - Only when yesterday is NOT already in completions/freezeUsedDates.
 *  - Only when the day-before-yesterday IS already in completions
 *    (i.e. there's a streak worth protecting).
 *  - Only when the user has freezes available.
 *  - Side effect: appends yesterday to freezeUsedDates and decrements
 *    freezesAvailable by 1.
 *
 * Returned `effective` is the set of effective-completed dates after the
 * freeze is applied (use it to recompute streaks). When no freeze is
 * consumed, returns the input shape untouched (referentially stable).
 */
import type { Habit } from '../models/habit';
import { toDateKey } from './dates.util';

export type FreezeAppliedResult = {
  freezesAvailable: number;
  freezeUsedDates: string[];
  effective: string[];
  consumed: boolean;
};

export function autoConsumeFreeze(habit: Habit, now: Date = new Date()): FreezeAppliedResult {
  const yesterday = toDateKey(new Date(now.getTime() - 86_400_000));
  const dayBefore = toDateKey(new Date(now.getTime() - 172_800_000));

  const completions       = habit.completions    ?? [];
  let freezeUsedDates     = habit.freezeUsedDates ?? [];
  let freezesAvailable    = habit.freezesAvailable ?? 1;
  let effective           = [...new Set([...completions, ...freezeUsedDates])];

  if ((habit.status ?? 'active') !== 'active') {
    return { freezesAvailable, freezeUsedDates, effective, consumed: false };
  }

  const isFlexFreq =
    habit.frequency.kind === 'xperweek' || habit.frequency.kind === 'interval';

  if (isFlexFreq) {
    return { freezesAvailable, freezeUsedDates, effective, consumed: false };
  }

  const yesterdayDOW = new Date(yesterday + 'T00:00:00').getDay();
  const yesterdayWasScheduled = (() => {
    switch (habit.frequency.kind) {
      case 'daily':    return true;
      case 'weekly':   return habit.frequency.weekdays.includes(yesterdayDOW + 1);
      case 'weekdays': return yesterdayDOW >= 1 && yesterdayDOW <= 5;
      case 'weekends': return yesterdayDOW === 0 || yesterdayDOW === 6;
      default:         return false;
    }
  })();

  const wasSkipped = (habit.skipDays ?? []).includes(yesterday);

  const eligible =
    yesterdayWasScheduled &&
    !wasSkipped &&
    !effective.includes(yesterday) &&
    effective.includes(dayBefore) &&
    freezesAvailable > 0 &&
    !freezeUsedDates.includes(yesterday);

  if (!eligible) {
    return { freezesAvailable, freezeUsedDates, effective, consumed: false };
  }

  freezeUsedDates  = [...freezeUsedDates, yesterday];
  freezesAvailable = freezesAvailable - 1;
  effective        = [...new Set([...completions, ...freezeUsedDates])];

  return { freezesAvailable, freezeUsedDates, effective, consumed: true };
}
