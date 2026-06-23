import type { Habit } from './types';

/** Returns a YYYY-MM-DD date key from a Date, using local time. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True if the habit has a completion logged for today. */
export function isDoneToday(habit: Habit): boolean {
  const key = toDateKey(new Date());
  return (habit.completions ?? []).includes(key);
}

/**
 * Derives current streak and best streak purely from the completions array.
 *
 * Current streak is only live if the last completion was today or yesterday —
 * missing two or more consecutive days resets it to 0.
 *
 * Best streak is the longest consecutive run found anywhere in the history.
 */
export function computeStreak(completions: string[]): { streak: number; bestStreak: number } {
  if (completions.length === 0) return { streak: 0, bestStreak: 0 };

  // Deduplicate (defensive guard) then sort descending — YYYY-MM-DD sorts lexicographically
  const sorted = [...new Set(completions)].sort().reverse();

  const todayD     = new Date();
  const yesterdayD = new Date(todayD);
  yesterdayD.setDate(yesterdayD.getDate() - 1);
  const today     = toDateKey(todayD);
  const yesterday = toDateKey(yesterdayD);

  // Current streak — must be anchored to today or yesterday
  let current = 0;
  if (sorted[0] === today || sorted[0] === yesterday) {
    current = 1;
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      if (sorted[i] === toDateKey(d)) {
        current++;
        prev = sorted[i];
      } else {
        break;
      }
    }
  }

  // Best streak across all completions — scan the full sorted array for longest run
  let best = current;
  let run  = 1;
  for (let i = 1; i < sorted.length; i++) {
    const d = new Date(sorted[i - 1]);
    d.setDate(d.getDate() - 1);
    if (sorted[i] === toDateKey(d)) {
      run++;
    } else {
      if (run > best) best = run;
      run = 1;
    }
  }
  if (run > best) best = run;

  return { streak: current, bestStreak: best };
}
