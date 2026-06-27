/**
 * Stats helpers — port of src/lib/habits/stats.ts.
 */
import type { Frequency } from '../models/habit';
import { daysAgoKey, toDateKey } from './dates.util';

/**
 * Returns the number of days in the `[startKey, endKey]` window that are
 * scheduled for the given frequency.  Used as the denominator for completion-
 * rate calculations so that weekday-only or xperweek habits are not penalised
 * for off-schedule days.
 */
function expectedCompletions(
  frequency: Frequency | undefined,
  startKey: string,
  endKey: string,
  dayCount: number,
): number {
  if (!frequency) return dayCount;

  switch (frequency.kind) {
    case 'daily':
      return dayCount;

    case 'weekly': {
      // f.weekdays: 1=Sun … 7=Sat (Expo convention → JS getDay = value - 1)
      const scheduled = new Set(frequency.weekdays.map(w => w - 1));
      let n = 0;
      const cur = new Date(startKey + 'T00:00:00');
      const end = new Date(endKey   + 'T00:00:00');
      while (cur <= end) { if (scheduled.has(cur.getDay())) n++; cur.setDate(cur.getDate() + 1); }
      return n;
    }

    case 'weekdays': {
      let n = 0;
      const cur = new Date(startKey + 'T00:00:00');
      const end = new Date(endKey   + 'T00:00:00');
      while (cur <= end) {
        const dow = cur.getDay();
        if (dow >= 1 && dow <= 5) n++;
        cur.setDate(cur.getDate() + 1);
      }
      return n;
    }

    case 'weekends': {
      let n = 0;
      const cur = new Date(startKey + 'T00:00:00');
      const end = new Date(endKey   + 'T00:00:00');
      while (cur <= end) {
        const dow = cur.getDay();
        if (dow === 0 || dow === 6) n++;
        cur.setDate(cur.getDate() + 1);
      }
      return n;
    }

    case 'xperweek':
      return Math.max(1, Math.ceil((dayCount / 7) * frequency.count));

    case 'interval':
      return Math.max(1, Math.ceil(dayCount / frequency.days));

    default:
      return dayCount;
  }
}

/**
 * Fraction (0–1) of expected completions in the last `windowDays` that were
 * actually logged.
 *
 * The denominator is frequency-aware: a weekday habit in a 7-day window has
 * 5 expected completions, not 7.  Respects `createdAt` so habits that are
 * newer than the window aren't penalised for days before they existed.
 */
export function completionRate(
  completions: string[],
  windowDays:  number,
  createdAt:   string,
  frequency?:  Frequency,
): number {
  if (completions.length === 0) return 0;

  const today        = toDateKey(new Date());
  const windowStart  = daysAgoKey(windowDays - 1);
  const createdDay   = toDateKey(new Date(createdAt));
  const effectiveStart = createdDay > windowStart ? createdDay : windowStart;

  const startMs  = new Date(effectiveStart + 'T00:00:00').getTime();
  const endMs    = new Date(today          + 'T00:00:00').getTime();
  const dayCount = Math.round((endMs - startMs) / 86_400_000) + 1;

  if (dayCount <= 0) return 0;

  const hits     = completions.filter(d => d >= effectiveStart && d <= today).length;
  const expected = expectedCompletions(frequency, effectiveStart, today, dayCount);

  return expected > 0 ? Math.min(1, hits / expected) : 0;
}

/**
 * Short weekday name ('Mon', 'Tue', …) on which this habit is most frequently
 * completed. Returns null when there are fewer than 7 completions (not enough
 * signal to find a real pattern).
 */
export function bestDayOfWeek(completions: string[]): string | null {
  if (completions.length < 7) return null;

  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts    = new Array<number>(7).fill(0);

  for (const d of completions) {
    counts[new Date(d + 'T00:00:00').getDay()]++;
  }

  const maxIdx = counts.reduce((best, c, i) => (c > counts[best] ? i : best), 0);
  return DAY_SHORT[maxIdx];
}

/**
 * Average length (in days) of all consecutive completion runs, across the
 * entire history — not just the current streak.
 */
export function averageRunLength(completions: string[]): number {
  if (completions.length === 0) return 0;

  const sorted = [...new Set(completions)].sort();
  const runs: number[] = [];
  let run = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const curr = new Date(sorted[i]     + 'T00:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) {
      run++;
    } else {
      runs.push(run);
      run = 1;
    }
  }
  runs.push(run);

  return Math.round(runs.reduce((s, r) => s + r, 0) / runs.length);
}

/**
 * Momentum score (0–100): a single-number summary of recent consistency.
 *
 * Combines the 7-day rate (65% weight) and 30-day rate (35% weight).
 * Both rates use the frequency-aware denominator when `frequency` is provided.
 */
export function momentumScore(
  completions: string[],
  createdAt:   string,
  frequency?:  Frequency,
): number {
  const r7  = completionRate(completions, 7,  createdAt, frequency);
  const r30 = completionRate(completions, 30, createdAt, frequency);
  return Math.round((r7 * 0.65 + r30 * 0.35) * 100);
}

/**
 * Bundle all stats into one call. Each value is independently memoisable via
 * the individual functions above; this is a convenience wrapper for screens.
 */
export function computeHabitStats(
  completions: string[],
  createdAt:   string,
  frequency?:  Frequency,
) {
  return {
    rate7d:   completionRate(completions, 7,  createdAt, frequency),
    rate30d:  completionRate(completions, 30, createdAt, frequency),
    rate90d:  completionRate(completions, 90, createdAt, frequency),
    bestDay:  bestDayOfWeek(completions),
    total:    completions.length,
    avgRun:   averageRunLength(completions),
    momentum: momentumScore(completions, createdAt, frequency),
  };
}
