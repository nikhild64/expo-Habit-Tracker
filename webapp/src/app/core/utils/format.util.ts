/**
 * Format helpers — extracted from src/app/(tabs)/index.tsx into a shared util
 * so screens, the habit detail page, and ContextMenu rows all render the same
 * label format ("Mon–Fri · 7:00 AM", "Every 2 days · 9:00 AM", etc.).
 */
import type { Habit, TimeOfDay } from '../models/habit';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Formats `frequency.hour:minute` as `h:mm AM/PM`. */
export function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:${minute.toString().padStart(2, '0')} ${period}`;
}

/** "Daily · 7:00 AM", "Mon, Wed, Fri · 7:00 AM", etc. */
export function formatFreq(habit: Habit): string {
  const f    = habit.frequency;
  const time = formatTime(f.hour, f.minute);
  switch (f.kind) {
    case 'daily':    return `Daily · ${time}`;
    case 'weekly':   return `${f.weekdays.map(d => DAY_SHORT[d - 1]).join(', ')} · ${time}`;
    case 'weekdays': return `Mon–Fri · ${time}`;
    case 'weekends': return `Sat–Sun · ${time}`;
    case 'xperweek': return `${f.count}× per week · ${time}`;
    case 'interval': return `Every ${f.days} days · ${time}`;
    default:         return time;
  }
}

/** Returns 'morning' before 12, 'afternoon' before 17, 'evening' before 22, else 'anytime'. */
export function currentTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'anytime';
}

/** Display metadata for each TOD slot — matches the mobile app's TOD_META. */
export const TOD_META: Record<TimeOfDay, { label: string; icon: string; order: number }> = {
  morning:   { label: 'Morning',   icon: 'sunny-outline',          order: 0 },
  afternoon: { label: 'Afternoon', icon: 'partly-sunny-outline',   order: 1 },
  evening:   { label: 'Evening',   icon: 'moon-outline',           order: 2 },
  anytime:   { label: 'Anytime',   icon: 'infinite-outline',       order: 3 },
};
