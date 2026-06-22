import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@quiet_hours_v1';

export type QuietHours = {
  enabled: boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

export const DEFAULT_QUIET_HOURS: QuietHours = {
  enabled: false,
  startHour: 22,
  startMinute: 0,
  endHour: 7,
  endMinute: 0,
};

export async function loadQuietHours(): Promise<QuietHours> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_QUIET_HOURS;
    const saved = JSON.parse(raw) as Partial<QuietHours>;
    // Back-compat: old saves may not have minutes
    return {
      ...DEFAULT_QUIET_HOURS,
      ...saved,
      startMinute: saved.startMinute ?? 0,
      endMinute: saved.endMinute ?? 0,
    };
  } catch {
    return DEFAULT_QUIET_HOURS;
  }
}

export async function saveQuietHours(qh: QuietHours): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(qh));
}

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
