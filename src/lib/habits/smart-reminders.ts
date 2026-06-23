import type { Habit } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReminderSuggestion = {
  /** The suggested hour (0–23, local time) */
  suggestedHour: number;
  /** Completion rate in the 2-hour window around suggestedHour (0–1) */
  suggestedRate: number;
  /** Completion rate in the 2-hour window around the current reminder hour (0–1) */
  currentRate: number;
  /** Human-readable label, e.g. "7 AM" */
  suggestedLabel: string;
  /** Human-readable label for the current time, e.g. "9 AM" */
  currentLabel: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIN_SAMPLE = 30;
const MIN_IMPROVEMENT = 0.20;

function formatHour(hour: number): string {
  const h = hour % 12 || 12;
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${h} ${period}`;
}

/**
 * Groups `completionTimestamps` values into 24 hour buckets (local time)
 * and returns an array of counts indexed by hour 0–23.
 */
function buildHourHistogram(timestamps: Record<string, string>): number[] {
  const buckets = new Array<number>(24).fill(0);
  for (const iso of Object.values(timestamps)) {
    const hour = new Date(iso).getHours();
    buckets[hour]++;
  }
  return buckets;
}

/**
 * Returns a smoothed rate for a given hour by summing the ±1 hour neighbours
 * (i.e. a 3-hour window) and dividing by total completions.
 * This avoids aliasing effects when the user completes the habit slightly
 * before or after their usual time.
 */
function windowRate(histogram: number[], hour: number, total: number): number {
  if (total === 0) return 0;
  const h = (hour + 24) % 24;
  const prev = (h - 1 + 24) % 24;
  const next = (h + 1) % 24;
  return (histogram[prev] + histogram[h] + histogram[next]) / total;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyzes whether a different reminder hour would lead to higher completion.
 *
 * Returns a `ReminderSuggestion` when:
 * - There are at least 30 completions with timestamps (adequate sample size)
 * - The best hour improves the rate by at least 20 percentage points
 * - The best hour differs from the current reminder hour
 *
 * Returns `null` when there is not enough signal or the current time is
 * already optimal.
 */
export function analyzeReminderEffectiveness(habit: Habit): ReminderSuggestion | null {
  const timestamps = habit.completionTimestamps ?? {};
  const total = Object.keys(timestamps).length;

  if (total < MIN_SAMPLE) return null;

  const histogram = buildHourHistogram(timestamps);
  const currentHour = habit.frequency.hour;
  const currentRate = windowRate(histogram, currentHour, total);

  // Find the hour with the highest windowed rate
  let bestHour = 0;
  let bestRate = 0;
  for (let h = 0; h < 24; h++) {
    const rate = windowRate(histogram, h, total);
    if (rate > bestRate) {
      bestRate = rate;
      bestHour = h;
    }
  }

  if (bestHour === currentHour) return null;
  if (bestRate - currentRate < MIN_IMPROVEMENT) return null;

  return {
    suggestedHour:  bestHour,
    suggestedRate:  bestRate,
    currentRate,
    suggestedLabel: formatHour(bestHour),
    currentLabel:   formatHour(currentHour),
  };
}
