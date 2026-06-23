import { toDateKey } from './streak';

// ── Date helpers ──────────────────────────────────────────────────────────────

function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateKey(d);
}

// ── Core analytics ────────────────────────────────────────────────────────────

/**
 * Fraction (0–1) of days in the last `windowDays` when the habit was completed.
 *
 * Respects `createdAt` so habits that are newer than the window aren't penalised
 * for days before they existed.
 */
export function completionRate(
  completions: string[],
  windowDays: number,
  createdAt: string,
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

  const hits = completions.filter(d => d >= effectiveStart && d <= today).length;
  return Math.min(1, hits / dayCount);
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
 *
 * Useful for understanding "when I do this habit, how long do I usually keep
 * it going?" independently of the live streak.
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
 * Combines the 7-day rate (short-term, 65% weight) and 30-day rate (medium-term,
 * 35% weight). This makes the score respond quickly to recent behaviour while
 * staying anchored to the broader monthly trend.
 *
 *   ≥ 71  → on a roll (green)
 *   41-70 → building (orange)
 *   ≤ 40  → needs attention (red)
 */
export function momentumScore(completions: string[], createdAt: string): number {
  const r7  = completionRate(completions, 7,  createdAt);
  const r30 = completionRate(completions, 30, createdAt);
  return Math.round((r7 * 0.65 + r30 * 0.35) * 100);
}

/**
 * Bundle all stats into one call.  Each value is independently memoisable via
 * the individual functions above; this is a convenience wrapper for screens.
 */
export function computeHabitStats(completions: string[], createdAt: string) {
  return {
    rate7d:    completionRate(completions, 7,  createdAt),
    rate30d:   completionRate(completions, 30, createdAt),
    rate90d:   completionRate(completions, 90, createdAt),
    bestDay:   bestDayOfWeek(completions),
    total:     completions.length,
    avgRun:    averageRunLength(completions),
    momentum:  momentumScore(completions, createdAt),
  };
}
