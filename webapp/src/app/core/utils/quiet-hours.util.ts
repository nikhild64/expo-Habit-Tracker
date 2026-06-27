/**
 * Quiet hours helper — port of isInQuietHours from src/lib/habits/quiet-hours.ts.
 */
import type { QuietHours } from '../models/quiet-hours';

/**
 * Returns true if the given hour:minute falls inside the DND window.
 * Handles overnight ranges (e.g. 22:30 → 07:00 wraps past midnight).
 */
export function isInQuietHours(hour: number, minute: number, qh: QuietHours): boolean {
  if (!qh.enabled) return false;
  const curr  = hour * 60 + minute;
  const start = qh.startHour * 60 + qh.startMinute;
  const end   = qh.endHour   * 60 + qh.endMinute;
  if (start === end) return false;
  if (start > end) return curr >= start || curr < end; // wraps midnight
  return curr >= start && curr < end;
}
