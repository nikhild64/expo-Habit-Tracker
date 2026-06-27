/**
 * Date helpers — port of toDateKey + isoWeekMonday from src/lib/habits/streak.ts.
 * Pure functions only; safe to import from any layer (tests, services, components).
 */

/** Returns a YYYY-MM-DD date key from a Date, using local time. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True when a given JS getDay() value (0=Sun..6=Sat) is a weekday. */
export function isWeekday(dow: number): boolean {
  return dow >= 1 && dow <= 5;
}
/** True when a given JS getDay() value is a weekend day. */
export function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6;
}

/**
 * Returns the Monday of the ISO week containing `d` as a YYYY-MM-DD key.
 * Used as a stable, sortable week identifier.
 */
export function isoWeekMonday(d: Date): string {
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const mon = new Date(d);
  mon.setDate(d.getDate() - dow);
  return toDateKey(mon);
}

/** YYYY-MM-DD key for the local date that was `n` days ago. */
export function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateKey(d);
}
