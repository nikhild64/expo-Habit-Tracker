import { describe, expect, it } from 'vitest';

import { analyzeReminderEffectiveness } from './smart-reminders.util';
import { makeHabit } from './test-helpers';

function buildTimestamps(count: number, hour: number): Record<string, string> {
  const out: Record<string, string> = {};
  const start = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() - i);
    d.setHours(hour, 0, 0, 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out[key] = d.toISOString();
  }
  return out;
}

describe('analyzeReminderEffectiveness', () => {
  it('returns null with fewer than 30 samples', () => {
    const habit = makeHabit({
      frequency: { kind: 'daily', hour: 9, minute: 0 },
      completionTimestamps: buildTimestamps(10, 7),
    });
    expect(analyzeReminderEffectiveness(habit)).toBeNull();
  });

  it('suggests a better hour when the user consistently completes elsewhere', () => {
    const habit = makeHabit({
      frequency: { kind: 'daily', hour: 9, minute: 0 },
      // Plenty of samples, all at 7 AM
      completionTimestamps: buildTimestamps(35, 7),
    });
    const suggestion = analyzeReminderEffectiveness(habit);
    expect(suggestion).not.toBeNull();
    // windowRate sums the ±1 hour neighbours, so 6 / 7 / 8 all tie at the
    // peak; the algorithm returns the first hour that hits max, which is 6.
    expect(suggestion?.suggestedHour).toBeGreaterThanOrEqual(6);
    expect(suggestion?.suggestedHour).toBeLessThanOrEqual(8);
    expect(suggestion?.suggestedRate).toBeGreaterThan(suggestion!.currentRate);
  });

  it('returns null when the user is already completing at the reminder hour', () => {
    const habit = makeHabit({
      frequency: { kind: 'daily', hour: 9, minute: 0 },
      completionTimestamps: buildTimestamps(35, 9),
    });
    expect(analyzeReminderEffectiveness(habit)).toBeNull();
  });
});
