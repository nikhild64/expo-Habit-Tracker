import type { Frequency, Habit } from './types';

/** Returns a YYYY-MM-DD date key from a Date, using local time. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Scheduled-day helpers ─────────────────────────────────────────────────────

/** True when a given JS getDay() value (0=Sun..6=Sat) is a weekday. */
function isWeekday(dow: number) { return dow >= 1 && dow <= 5; }
/** True when a given JS getDay() value is a weekend day. */
function isWeekend(dow: number) { return dow === 0 || dow === 6; }

/**
 * Returns the Monday of the ISO week containing `d` as a YYYY-MM-DD key.
 * Used as a stable, sortable week identifier.
 */
function isoWeekMonday(d: Date): string {
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const mon = new Date(d);
  mon.setDate(d.getDate() - dow);
  return toDateKey(mon);
}

// ── isDoneToday ───────────────────────────────────────────────────────────────

/**
 * Frequency-aware "done today" check.
 *
 * - daily / weekly:  true iff today's date is in completions (or today is not a
 *                    scheduled weekday for `weekly`)
 * - weekdays:        true iff today is Sat/Sun **or** today is in completions
 * - weekends:        true iff today is Mon–Fri **or** today is in completions
 * - xperweek(N):     true iff this ISO week already has ≥N completions
 * - interval(D):     true iff there is ≥1 completion within the last D days
 */
export function isDoneToday(habit: Habit): boolean {
  const completions = habit.completions ?? [];
  const f   = habit.frequency;
  const now = new Date();
  const key = toDateKey(now);
  const dow = now.getDay(); // 0=Sun … 6=Sat

  switch (f.kind) {
    case 'daily':
      return completions.includes(key);

    case 'weekly': {
      // f.weekdays uses Expo convention: 1=Sun … 7=Sat
      if (!f.weekdays.includes(dow + 1)) return true; // not scheduled today
      return completions.includes(key);
    }

    case 'weekdays':
      if (isWeekend(dow)) return true; // weekend — not scheduled
      return completions.includes(key);

    case 'weekends':
      if (isWeekday(dow)) return true; // weekday — not scheduled
      return completions.includes(key);

    case 'xperweek': {
      const startKey = isoWeekMonday(now);
      return completions.filter(d => d >= startKey && d <= key).length >= f.count;
    }

    case 'interval': {
      const from = new Date(now);
      from.setDate(now.getDate() - f.days + 1);
      const fromKey = toDateKey(from);
      return completions.some(d => d >= fromKey && d <= key);
    }

    default:
      return completions.includes(key);
  }
}

// ── Standard consecutive-day streak ──────────────────────────────────────────

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

  const sorted = [...new Set(completions)].sort().reverse();

  const todayD     = new Date();
  const yesterdayD = new Date(todayD);
  yesterdayD.setDate(yesterdayD.getDate() - 1);
  const today     = toDateKey(todayD);
  const yesterday = toDateKey(yesterdayD);

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

// ── Frequency-aware streak helpers ────────────────────────────────────────────

/**
 * Streak for habits scheduled on specific days of the week (weekdays or weekends).
 *
 * "Consecutive" means no *scheduled* day was missed; off-schedule days are
 * transparent. Works by walking backward from the most-recently-scheduled day.
 */
function computeScheduledStreak(
  completions: string[],
  isScheduled: (dow: number) => boolean,
): { streak: number; bestStreak: number } {
  // Filter completions to scheduled days only
  const filtered = [...new Set(completions)]
    .filter(d => isScheduled(new Date(d + 'T00:00:00').getDay()))
    .sort()
    .reverse();

  if (filtered.length === 0) return { streak: 0, bestStreak: 0 };

  // Helper: previous scheduled day before `fromDate`
  function prevScheduled(fromDate: Date): Date {
    const d = new Date(fromDate);
    d.setDate(d.getDate() - 1);
    while (!isScheduled(d.getDay())) d.setDate(d.getDate() - 1);
    return d;
  }

  // Most recent scheduled day ≤ today
  const today = new Date();
  const lastSched = new Date(today);
  while (!isScheduled(lastSched.getDay())) lastSched.setDate(lastSched.getDate() - 1);
  const lastSchedKey  = toDateKey(lastSched);
  const prevSchedKey  = toDateKey(prevScheduled(lastSched));

  // Current streak
  let streak = 0;
  if (filtered[0] === lastSchedKey || filtered[0] === prevSchedKey) {
    streak = 1;
    let cur = new Date(filtered[0] + 'T00:00:00');
    for (let i = 1; i < filtered.length; i++) {
      const expected = toDateKey(prevScheduled(cur));
      if (filtered[i] === expected) {
        streak++;
        cur = new Date(filtered[i] + 'T00:00:00');
      } else {
        break;
      }
    }
  }

  // Best streak across all history
  let best = streak;
  let run  = 1;
  for (let i = 1; i < filtered.length; i++) {
    const cur      = new Date(filtered[i - 1] + 'T00:00:00');
    const expected = toDateKey(prevScheduled(cur));
    if (filtered[i] === expected) {
      run++;
    } else {
      if (run > best) best = run;
      run = 1;
    }
  }
  if (run > best) best = run;

  return { streak, bestStreak: best };
}

/**
 * Streak for `xperweek(N)` habits: counts consecutive ISO weeks
 * where the user logged ≥N completions.
 */
function computeXPerWeekStreak(
  completions: string[],
  count: number,
): { streak: number; bestStreak: number } {
  if (completions.length === 0) return { streak: 0, bestStreak: 0 };

  // Group completions by ISO week (identified by Monday's date key)
  const byWeek = new Map<string, number>();
  for (const d of completions) {
    const wk = isoWeekMonday(new Date(d + 'T00:00:00'));
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
  }

  const today    = new Date();
  const thisWeek = isoWeekMonday(today);
  const lastWeek = isoWeekMonday(new Date(today.getTime() - 7 * 86_400_000));

  // All qualifying weeks, sorted descending
  const qualifying = [...byWeek.entries()]
    .filter(([, c]) => c >= count)
    .map(([wk]) => wk)
    .sort()
    .reverse();

  if (qualifying.length === 0) return { streak: 0, bestStreak: 0 };

  function prevWeekKey(wkKey: string): string {
    return isoWeekMonday(new Date(new Date(wkKey + 'T00:00:00').getTime() - 7 * 86_400_000));
  }

  // Current streak — must start from this week or last full week
  let streak = 0;
  if (qualifying[0] === thisWeek || qualifying[0] === lastWeek) {
    streak = 1;
    let prev = qualifying[0];
    for (let i = 1; i < qualifying.length; i++) {
      if (qualifying[i] === prevWeekKey(prev)) {
        streak++;
        prev = qualifying[i];
      } else {
        break;
      }
    }
  }

  // Best streak
  let best = streak;
  let run  = 1;
  for (let i = 1; i < qualifying.length; i++) {
    if (qualifying[i] === prevWeekKey(qualifying[i - 1])) {
      run++;
    } else {
      if (run > best) best = run;
      run = 1;
    }
  }
  if (run > best) best = run;

  return { streak, bestStreak: best };
}

/**
 * Streak for `interval(D)` habits: counts consecutive D-day periods
 * (rolling backward from today) that each contained at least one completion.
 */
function computeIntervalStreak(
  completions: string[],
  days: number,
): { streak: number; bestStreak: number } {
  if (completions.length === 0) return { streak: 0, bestStreak: 0 };

  const today = new Date();
  let streak = 0;

  // Walk backward in D-day windows; stop at the first empty window
  for (let period = 0; period < 365; period++) {
    const endDate   = new Date(today);
    endDate.setDate(today.getDate() - period * days);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - days + 1);
    const startKey = toDateKey(startDate);
    const endKey   = toDateKey(endDate);
    const hasHit   = completions.some(d => d >= startKey && d <= endKey);
    if (hasHit) streak++;
    else break;
  }

  return { streak, bestStreak: streak };
}

// ── Public: frequency-aware streak ───────────────────────────────────────────

/**
 * Computes streak using rules appropriate for each frequency kind.
 *
 * - daily / weekly:  standard consecutive-day streak
 * - weekdays:        consecutive Mon–Fri completions (weekends are transparent)
 * - weekends:        consecutive Sat–Sun completions (weekdays are transparent)
 * - xperweek:        consecutive ISO weeks with ≥count completions
 * - interval:        consecutive D-day windows with ≥1 completion
 */
export function computeFrequencyAwareStreak(
  completions: string[],
  frequency: Frequency,
): { streak: number; bestStreak: number } {
  switch (frequency.kind) {
    case 'daily':
    case 'weekly':
      return computeStreak(completions);
    case 'weekdays':
      return computeScheduledStreak(completions, isWeekday);
    case 'weekends':
      return computeScheduledStreak(completions, isWeekend);
    case 'xperweek':
      return computeXPerWeekStreak(completions, frequency.count);
    case 'interval':
      return computeIntervalStreak(completions, frequency.days);
    default:
      return computeStreak(completions);
  }
}
